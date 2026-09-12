import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import type { LlmToolDef } from './llm-client'

export type SkillGroup = 'ledger' | 'profile' | 'common'
export type SkillRisk = 'low' | 'medium' | 'high'

/** 给前端的卡片载荷:cardType 决定渲染组件,data 为结构化数据 */
export interface CardPayload {
  cardType: string // 如 'ledger.tx_table'
  title: string
  data: Record<string, unknown>
}

/** 技能执行结果 */
export interface SkillResult {
  ok: boolean
  /** 给 LLM 的一句话结果(进 tool_result.summary) */
  summary: string
  /** 给 LLM 的精简结构(防 token 爆炸,列表只带前几行) */
  llmData?: Record<string, unknown>
  /** 给前端的完整卡片数据 */
  card?: CardPayload
  error?: { code: number; message: string }
}

/** 技能定义:各业务模块在模块构造期注册,新子应用接入即自动扩展 agent 能力 */
export interface SkillDefinition {
  /** 配置表主键,如 'ledger.create_transaction' */
  id: string
  group: SkillGroup
  /** LLM 工具名(下划线风格),如 'ledger_create_transaction' */
  name: string
  /** 中文名,如 '记一笔' */
  label: string
  /** LLM 可见:何时用、参数怎么填 */
  description: string
  risk: SkillRisk
  /** function calling 的 parameters(JSON Schema) */
  parameters: Record<string, unknown>
  /** 中/高风险确认卡的人类可读参数行(把 args 翻译成 "支出 ¥25.00 · 餐饮·午餐") */
  preview?: (args: Record<string, unknown>) => { lines: string[]; warning?: string }
  /**
   * 确认卡生成前的预解析(可选):把 LLM 的模糊条件(如 keyword+amount 定位流水)
   * 解析成具体数据,回填 args 并生成人类可读的确认卡行。
   * 返回 null 表示无需预解析;抛错/返回 { error } 表示无法唯一定位,错误会反馈给 LLM。
   */
  resolve?: (
    userId: string,
    args: Record<string, unknown>,
  ) => Promise<{ args: Record<string, unknown>; lines: string[]; error?: string } | null>
  /** 执行:userId 即当前登录用户(权限校验内聚在被调 service) */
  handler: (userId: string, args: Record<string, unknown>) => Promise<SkillResult>
}

/**
 * 技能注册表:代码注册技能本体 + AgentSkillConfig 表存启停覆盖(无记录=启用,缓存 30s)。
 */
@Injectable()
export class SkillRegistry {
  private defs = new Map<string, SkillDefinition>()
  private enabledCache: { at: number; disabled: Set<string> } | null = null
  private readonly cacheTtlMs = 30_000

  constructor(private prisma: PrismaService) {}

  /** 各技能组文件在模块构造期调用 */
  register(...defs: SkillDefinition[]) {
    for (const def of defs) this.defs.set(def.name, def)
  }

  get(name: string): SkillDefinition | undefined {
    return this.defs.get(name)
  }

  /** admin 技能管理页:全量定义 join 启停状态 */
  async listWithState() {
    const disabled = await this.disabledSet()
    return [...this.defs.values()]
      .map((d) => ({
        skillId: d.id,
        group: d.group,
        name: d.name,
        label: d.label,
        description: d.description,
        risk: d.risk,
        parameters: d.parameters,
        enabled: !disabled.has(d.id),
      }))
      .sort((a, b) => (a.group === b.group ? a.label.localeCompare(b.label, 'zh') : a.group < b.group ? -1 : 1))
  }

  /** 对话用:启用的技能定义 + LLM tools 参数 */
  async listEnabled(): Promise<{ defs: SkillDefinition[]; tools: LlmToolDef[] }> {
    const disabled = await this.disabledSet()
    const defs = [...this.defs.values()].filter((d) => !disabled.has(d.id))
    return {
      defs,
      tools: defs.map((d) => ({
        type: 'function' as const,
        function: { name: d.name, description: d.description, parameters: d.parameters },
      })),
    }
  }

  /** admin 启停:upsert 覆盖行,写后清缓存 */
  async setEnabled(skillName: string, enabled: boolean, updatedBy: string) {
    const def = this.defs.get(skillName)
    if (!def) return false
    await this.prisma.agentSkillConfig.upsert({
      where: { skillId: def.id },
      create: { skillId: def.id, group: def.group, enabled, updatedBy },
      update: { enabled, updatedBy },
    })
    this.enabledCache = null
    return true
  }

  private async disabledSet(): Promise<Set<string>> {
    if (this.enabledCache && Date.now() - this.enabledCache.at < this.cacheTtlMs) {
      return this.enabledCache.disabled
    }
    const rows = await this.prisma.agentSkillConfig.findMany({ where: { enabled: false } })
    const disabled = new Set(rows.map((r) => r.skillId))
    this.enabledCache = { at: Date.now(), disabled }
    return disabled
  }
}
