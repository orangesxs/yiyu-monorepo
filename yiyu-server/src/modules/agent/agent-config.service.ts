import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

/** LLM 连接配置(OpenAI 兼容协议) */
export interface LlmConfig {
  baseUrl: string // 如 https://api.deepseek.com/v1
  apiKey: string
  model: string // 如 deepseek-chat
  streaming: boolean // 个别网关 stream+tools 不稳时可关,走非流式
}

/** AI 人设配置 */
export interface PersonaConfig {
  systemPrompt: string
}

/** Agent 行为参数 */
export interface AgentSettings {
  agentEnabled: boolean // 总开关(false 时所有 agent 接口 503)
  contextTurns: number // 滑动窗口消息条数
  maxToolRounds: number // 单轮对话最大工具往返数
}

export const DEFAULT_PERSONA = `你是「一隅」的生活助手,一个友好、克制的中文 AI 助手。
「一隅」是一个个人生活记录系统,目前有记账本等应用。
你的职责:
- 闲聊:日常对话,简洁自然,少用 markdown 符号(纯文本输出)。
- 查数据:涉及用户的账本、流水、报表、个人资料、邀请码时,必须调用工具实时查询,禁止编造数字。
- 记账:用户说"记一笔"之类时,解析出金额/分类/日期并调用记账工具,执行前会有用户确认。
回答风格:简短、口语化、直接给结论;金额保留两位小数。`

export const DEFAULT_SETTINGS: AgentSettings = {
  agentEnabled: true,
  contextTurns: 20,
  maxToolRounds: 6,
}

const KEY_LLM = 'ai.llm'
const KEY_PERSONA = 'ai.persona'
const KEY_SETTINGS = 'agent.settings'

/**
 * Agent 运行时配置:SystemConfig 表 KV 存储,内存缓存(写入即失效 + 60s TTL 兜底)。
 * apiKey 仅存后端,对外回显一律脱敏(尾 4 位)。
 */
@Injectable()
export class AgentConfigService {
  private cache = new Map<string, { value: unknown; at: number }>()
  private readonly ttlMs = 60_000

  constructor(private prisma: PrismaService) {}

  private async readKey<T>(key: string, fallback: T | null): Promise<T | null> {
    const hit = this.cache.get(key)
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.value as T
    const row = await this.prisma.systemConfig.findUnique({ where: { key } })
    const value = row ? (row.value as T) : fallback
    if (row) this.cache.set(key, { value, at: Date.now() })
    return value
  }

  private async writeKey(key: string, value: unknown, updatedBy: string) {
    await this.prisma.systemConfig.upsert({
      where: { key },
      create: { key, value: value as object, updatedBy },
      update: { value: value as object, updatedBy },
    })
    this.cache.set(key, { value, at: Date.now() })
  }

  /** 完整且 baseUrl/apiKey/model 齐备才算已配置 */
  async getLlmConfig(): Promise<LlmConfig | null> {
    const cfg = await this.readKey<Partial<LlmConfig>>(KEY_LLM, null)
    if (!cfg?.baseUrl || !cfg.apiKey || !cfg.model) return null
    return { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model, streaming: cfg.streaming ?? true }
  }

  async getPersona(): Promise<PersonaConfig> {
    const cfg = await this.readKey<PersonaConfig>(KEY_PERSONA, null)
    return { systemPrompt: cfg?.systemPrompt?.trim() || DEFAULT_PERSONA }
  }

  async getSettings(): Promise<AgentSettings> {
    const cfg = await this.readKey<Partial<AgentSettings>>(KEY_SETTINGS, null)
    return { ...DEFAULT_SETTINGS, ...cfg }
  }

  /** admin 回显:apiKey 脱敏只留尾 4 位;未配置返回 null 字段 */
  async getMaskedLlmConfig(): Promise<{
    baseUrl: string
    apiKeyMasked: string
    model: string
    streaming: boolean
  }> {
    const cfg = await this.getLlmConfig()
    if (!cfg) return { baseUrl: '', apiKeyMasked: '', model: '', streaming: true }
    const tail = cfg.apiKey.length > 4 ? cfg.apiKey.slice(-4) : cfg.apiKey
    return { baseUrl: cfg.baseUrl, apiKeyMasked: `****${tail}`, model: cfg.model, streaming: cfg.streaming }
  }

  /**
   * 部分更新:apiKey 传空串/缺省 = 保留旧值;streaming/contextTurns 等可独立改。
   * 三段(llm/persona/settings)任意一段有字段传入就 upsert 该段。
   */
  async updateConfig(
    operator: string,
    patch: { llm?: Partial<LlmConfig>; persona?: Partial<PersonaConfig>; settings?: Partial<AgentSettings> },
  ) {
    if (patch.llm) {
      const old = (await this.readKey<LlmConfig>(KEY_LLM, null)) ?? { baseUrl: '', apiKey: '', model: '', streaming: true }
      const next: LlmConfig = {
        baseUrl: patch.llm.baseUrl ?? old.baseUrl,
        apiKey: patch.llm.apiKey ? patch.llm.apiKey : old.apiKey, // 空串=保留
        model: patch.llm.model ?? old.model,
        streaming: patch.llm.streaming ?? old.streaming,
      }
      await this.writeKey(KEY_LLM, next, operator)
    }
    if (patch.persona) {
      const old = (await this.readKey<PersonaConfig>(KEY_PERSONA, null)) ?? { systemPrompt: '' }
      await this.writeKey(KEY_PERSONA, { systemPrompt: patch.persona.systemPrompt ?? old.systemPrompt }, operator)
    }
    if (patch.settings) {
      const old = await this.getSettings()
      await this.writeKey(KEY_SETTINGS, { ...old, ...patch.settings }, operator)
    }
  }
}
