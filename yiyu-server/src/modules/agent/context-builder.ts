import { Injectable } from '@nestjs/common'
import { AgentConfigService } from './agent-config.service'
import { SkillRegistry } from './skill-registry'
import { LlmClient } from './llm-client'
import type { LlmMessage } from './llm-client'
import { PrismaService } from '../../prisma/prisma.service'
import { LedgerService } from '../ledger/ledger.service'
import type { AgentMessage } from '@prisma/client'

/** 页面上下文(前端发送时携带) */
export interface PageContext {
  app: string
  title: string
  hint?: string
}

/**
 * 上下文构建器:system prompt 分段组装 + 滑动窗口映射 + 滚动摘要。
 */
@Injectable()
export class ContextBuilder {
  constructor(
    private config: AgentConfigService,
    private registry: SkillRegistry,
    private llm: LlmClient,
    private prisma: PrismaService,
    private ledger: LedgerService,
  ) {}

  async build(
    user: { id: string; nickname: string },
    conversationId: string,
    pageContext?: PageContext,
  ): Promise<LlmMessage[]> {
    const [persona, settings, skills, conv, books, categories] = await Promise.all([
      this.config.getPersona(),
      this.config.getSettings(),
      this.registry.listEnabled(),
      this.prisma.agentConversation.findUnique({ where: { id: conversationId } }),
      this.ledger.listBooks(user.id),
      this.ledger.listCategories(user.id) as Promise<{
        expense: { id: string; name: string; children: { id: string; name: string }[] }[]
        income: { id: string; name: string; children: { id: string; name: string }[] }[]
      }>,
    ])

    const system = await this.buildSystemPrompt(
      user,
      persona.systemPrompt,
      skills.defs.map((d) => `${d.name}(${d.label}):${d.description.split('\n')[0]}`),
      pageContext,
      conv?.summary ?? null,
      { books, categories },
    )

    // 滑动窗口:最近 contextTurns 条消息
    const rows = await this.prisma.agentMessage.findMany({
      where: { conversationId },
      orderBy: { seq: 'desc' },
      take: settings.contextTurns,
    })
    const window = rows.reverse()

    return [{ role: 'system', content: system }, ...window.map((m) => this.toLlmMessage(m))]
  }

  private async buildSystemPrompt(
    user: { id: string; nickname: string },
    personaPrompt: string,
    skillLines: string[],
    pageContext: PageContext | undefined,
    summary: string | null,
    ledger: {
      books: { id: string; name: string; isDefault: boolean }[]
      categories: {
        expense: { id: string; name: string; children: { id: string; name: string }[] }[]
        income: { id: string; name: string; children: { id: string; name: string }[] }[]
      }
    },
  ): Promise<string> {
    const now = new Date()
    const weekdays = ['日', '一', '二', '三', '四', '五', '六']
    const dateStr = `今天是 ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} 星期${weekdays[now.getDay()]}`

    const sections: string[] = []
    sections.push(personaPrompt)
    sections.push(`【用户与环境】用户昵称:${user.nickname}。${dateStr}。`)
    if (pageContext) {
      sections.push(`【当前页面】用户正停留在:${pageContext.app}·${pageContext.title}${pageContext.hint ? `(${pageContext.hint})` : ''}。"这个月/最近的账本"等指代可结合该页面理解。`)
    }
    if (ledger.books.length) {
      const bookLines = ledger.books
        .map((b) => `${b.name}(id前缀:${b.id.slice(0, 6)}${b.isDefault ? ',默认' : ''})`)
        .join('、')
      sections.push(`【我的账本】${bookLines}`)
    }
    const catTree = (type: 'expense' | 'income') =>
      ledger.categories[type]
        .map((c) => (c.children.length ? `${c.name}(${c.children.map((ch) => ch.name).join('/')})` : c.name))
        .join('、')
    sections.push(
      `【我的分类】支出:${catTree('expense') || '无'}\n收入:${catTree('income') || '无'}\n记一笔的 category 参数只能从上述分类中选择(子分类名或根分类名均可);用户说的品类若不在其中,按语义就近选最接近的根分类,不要编造新分类名。`,
    )
    if (skillLines.length) {
      sections.push(`【可用技能】\n${skillLines.join('\n')}`)
    }
    sections.push(
      '【行为规则】1.涉及用户数据的回答必须调用工具实时查询,禁止编造;2.金额两位小数;3.日期时间格式 YYYY-MM-DD HH:mm;4.用户要求记账/删除/修改时,必须调用对应工具发起操作(系统会生成确认卡让用户点确认),禁止只在文字里口头询问"确认吗"而不调工具;5.工具结果里的 id 必须原样完整使用(25 位),禁止截断/缩写/自行拼接;6.同一工具连续调用了就不要换个参数反复调,信息够了就推进到下一步或直接回答;7.输出纯文本,少用 markdown 符号。',
    )
    if (summary) {
      sections.push(`【更早对话摘要】\n${summary}`)
    }
    return sections.join('\n\n')
  }

  /** 存储消息 → OpenAI 消息;confirm_card 映射回其源 tool_calls 语义 */
  private toLlmMessage(m: AgentMessage): LlmMessage {
    const c = (m.content ?? {}) as Record<string, unknown>
    if (m.role === 'user' && m.kind === 'text') {
      return { role: 'user', content: String(c.text ?? '') }
    }
    if (m.role === 'assistant' && m.kind === 'text') {
      return { role: 'assistant', content: String(c.text ?? '') }
    }
    if (m.role === 'assistant' && m.kind === 'tool_calls') {
      const calls = (c.calls as { callId: string; name: string; args: Record<string, unknown> }[]) ?? []
      return {
        role: 'assistant',
        content: null,
        tool_calls: calls.map((call) => ({
          id: call.callId,
          type: 'function' as const,
          function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
        })),
      }
    }
    if (m.role === 'tool' && m.kind === 'tool_result') {
      return {
        role: 'tool',
        tool_call_id: String(c.callId ?? ''),
        content: JSON.stringify(c.llmData ?? { summary: c.summary ?? '' }),
      }
    }
    if (m.role === 'assistant' && m.kind === 'confirm_card') {
      // 确认卡对 LLM 不是特殊实体:按其状态给一句 tool 结果语义
      const status = String(c.status ?? 'pending')
      const label = String(c.label ?? '操作')
      const statusText =
        status === 'executed'
          ? `用户已确认并执行成功:${String((c.result as Record<string, unknown> | undefined)?.summary ?? '')}`
          : status === 'failed'
            ? `用户确认了但执行失败:${String((c.result as Record<string, unknown> | undefined)?.summary ?? '')}`
            : status === 'cancelled' || status === 'expired'
              ? '用户未确认该操作(已取消或超时),不要重复调用同一工具,询问用户是否需要调整'
              : '等待用户确认中,不要重复调用该工具'
      return {
        role: 'tool',
        tool_call_id: String(c.toolName ? `${c.toolName}-pending` : 'confirm-pending'),
        content: `[${label}] ${statusText}`,
      }
    }
    return { role: 'assistant', content: '' }
  }

  /**
   * 滚动摘要:SSE 收尾后 fire-and-forget 调用。
   * 若窗口外存在未摘要消息,把"旧摘要 + 滚出窗口的消息"压缩为结构化键值文本。
   */
  async maybeSummarize(userId: string, conversationId: string) {
    try {
      const [conv, settings, llmCfg] = await Promise.all([
        this.prisma.agentConversation.findUnique({ where: { id: conversationId } }),
        this.config.getSettings(),
        this.config.getLlmConfig(),
      ])
      if (!conv || !llmCfg) return
      const total = await this.prisma.agentMessage.count({ where: { conversationId } })
      if (total <= settings.contextTurns) return
      // 滚出窗口且未摘要的消息:seq <= total - contextTurns 且 seq > summarizedSeq
      const pending = await this.prisma.agentMessage.findMany({
        where: { conversationId, seq: { lte: total - settings.contextTurns, gt: conv.summarizedSeq } },
        orderBy: { seq: 'asc' },
      })
      if (pending.length === 0) return
      const lines = pending.map((m) => {
        const c = (m.content ?? {}) as Record<string, unknown>
        if (m.role === 'user') return `用户:${String(c.text ?? '')}`
        if (m.role === 'assistant' && m.kind === 'text') return `助手:${String(c.text ?? '')}`
        if (m.role === 'assistant' && m.kind === 'confirm_card') return `助手发起确认[${String(c.label ?? '')}]:${String(c.status ?? '')}`
        return null
      })
      const dialog = lines.filter(Boolean).join('\n').slice(0, 6000)
      const res = await this.llm.chat(
        [
          {
            role: 'system',
            content:
              '把对话压缩为结构化键值摘要(每行一个要点,显式保留:用户偏好/常用账本与分类/重要金额/重要结论/称呼)。保留关键实体原文。直接输出摘要,不要解释。',
          },
          { role: 'user', content: `${conv.summary ? `【已有摘要】\n${conv.summary}\n\n` : ''}【新增对话】\n${dialog}` },
        ],
        { maxTokens: 500 },
      )
      await this.prisma.agentConversation.update({
        where: { id: conversationId },
        data: { summary: res.content.trim(), summarizedSeq: total - settings.contextTurns },
      })
    } catch {
      /* 摘要失败静默,下次重试 */
    }
  }
}
