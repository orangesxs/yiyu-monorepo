import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { PortalService } from '../portal/portal.service'
import type { AgentMessage, AgentConversation } from '@prisma/client'

/** 消息 VO(前端展示形状;content 原样透传 JSON) */
export interface AgentMessageVo {
  id: string
  seq: number
  role: 'user' | 'assistant' | 'tool'
  kind: 'text' | 'tool_calls' | 'tool_result' | 'confirm_card'
  content: Record<string, unknown>
  meta: Record<string, unknown> | null
  createdAt: string // YYYY-MM-DD HH:mm
}

export interface AgentConversationVo {
  id: string
  title: string
  lastMessageAt: string
  createdAt: string
}

/**
 * Agent 会话服务:会话 CRUD、消息 seq 分页、轻主动开场白。
 */
@Injectable()
export class AgentService {
  constructor(
    private prisma: PrismaService,
    private portal: PortalService,
  ) {}

  /* ── 会话 ── */

  async listConversations(userId: string): Promise<AgentConversationVo[]> {
    const rows = await this.prisma.agentConversation.findMany({
      where: { userId },
      orderBy: { lastMessageAt: 'desc' },
      select: { id: true, title: true, lastMessageAt: true, createdAt: true },
    })
    return rows.map((r) => this.toConversationVo(r))
  }

  /** 新建会话:基于 portal summary 拼装轻主动开场白(不调 LLM),落库为首条 assistant 消息 */
  async createConversation(user: { id: string; nickname: string }): Promise<{
    id: string
    title: string
    opening: AgentMessageVo
  }> {
    const [conv, summary] = await Promise.all([
      this.prisma.agentConversation.create({ data: { userId: user.id } }),
      this.portal.summary(user.id),
    ])
    const s = summary.apps.ledger
    const opening = s.bookName
      ? `你好呀${user.nickname ? `,${user.nickname}` : ''}!这是你的记账小助手。\n本月「${s.bookName}」已支出 ¥${s.monthExpense.toFixed(2)}、收入 ¥${s.monthIncome.toFixed(2)}。\n可以试试:"记一笔午饭 25" 或 "这个月各分类花了多少"。`
      : `你好呀${user.nickname ? `,${user.nickname}` : ''}!这是你的记账小助手。\n可以闲聊,也可以说"记一笔午饭 25"、"最近几笔流水"试试。`
    const msg = await this.appendMessage(conv.id, 'assistant', 'text', { text: opening }, null)
    return { id: conv.id, title: conv.title, opening: this.toMessageVo(msg) }
  }

  async deleteConversation(userId: string, conversationId: string) {
    const conv = await this.ownedConversation(userId, conversationId)
    await this.prisma.agentConversation.delete({ where: { id: conv.id } }) // 消息级联删;用量 SetNull 保留
    return { ok: true }
  }

  async ownedConversation(userId: string, conversationId: string): Promise<AgentConversation> {
    const conv = await this.prisma.agentConversation.findUnique({ where: { id: conversationId } })
    if (!conv) throw new NotFoundException('会话不存在')
    if (conv.userId !== userId) throw new ForbiddenException('无权访问该会话')
    return conv
  }

  /* ── 消息 ── */

  /** seq 正序分页(向上翻历史取后页) */
  async listMessages(userId: string, conversationId: string, page = 1, pageSize = 50) {
    await this.ownedConversation(userId, conversationId)
    const [total, rows] = await Promise.all([
      this.prisma.agentMessage.count({ where: { conversationId } }),
      this.prisma.agentMessage.findMany({
        where: { conversationId },
        orderBy: { seq: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])
    return { total, page, pageSize, items: rows.reverse().map((r) => this.toMessageVo(r)) }
  }

  /** 追加消息:seq = max+1,刷新会话 lastMessageAt */
  async appendMessage(
    conversationId: string,
    role: AgentMessageVo['role'],
    kind: AgentMessageVo['kind'],
    content: Record<string, unknown>,
    meta: Record<string, unknown> | null,
  ): Promise<AgentMessage> {
    const last = await this.prisma.agentMessage.findFirst({
      where: { conversationId },
      orderBy: { seq: 'desc' },
      select: { seq: true },
    })
    const [msg] = await this.prisma.$transaction([
      this.prisma.agentMessage.create({
        data: {
          conversationId,
          seq: (last?.seq ?? 0) + 1,
          role,
          kind,
          content: content as object,
          meta: meta ? (meta as object) : undefined,
        },
      }),
      this.prisma.agentConversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ])
    return msg
  }

  /** 首条用户消息自动命名会话 */
  async maybeTitle(conversationId: string, text: string) {
    const count = await this.prisma.agentMessage.count({ where: { conversationId, role: 'user' } })
    if (count > 1) return // 已有首条,不覆盖
    const title = text.trim().slice(0, 16) || '新对话'
    await this.prisma.agentConversation.update({ where: { id: conversationId }, data: { title } })
  }

  /** 更新已有消息的 content(确认卡状态就地变更) */
  async updateMessageContent(messageId: string, content: Record<string, unknown>) {
    await this.prisma.agentMessage.update({ where: { id: messageId }, data: { content: content as object } })
  }

  /** 按 confirmId 找确认卡消息(校验会话属主),供 confirm/cancel 端点定位 */
  async findByConfirmId(userId: string, confirmId: string): Promise<AgentMessage | null> {
    const convs = await this.prisma.agentConversation.findMany({
      where: { userId },
      select: { id: true },
    })
    if (convs.length === 0) return null
    return this.prisma.agentMessage.findFirst({
      where: {
        conversationId: { in: convs.map((c) => c.id) },
        kind: 'confirm_card',
        content: { path: ['confirmId'], equals: confirmId },
      },
      orderBy: { seq: 'desc' },
    })
  }

  /** 取消确认卡:pending → cancelled + 补 tool_result(不调 LLM) */
  async cancelConfirmCard(userId: string, confirmId: string) {
    const msg = await this.findByConfirmId(userId, confirmId)
    if (!msg) throw new NotFoundException('确认卡不存在')
    const content = msg.content as unknown as { status: string; toolName: string; label: string }
    if (content.status !== 'pending') return { ok: true }
    ;(content as { status: string }).status = 'cancelled'
    await this.updateMessageContent(msg.id, content as Record<string, unknown>)
    await this.appendMessage(
      msg.conversationId,
      'tool',
      'tool_result',
      { callId: `${content.toolName}-pending`, name: content.toolName, ok: false, summary: '用户取消了该操作' },
      null,
    )
    return { ok: true }
  }

  private toConversationVo(r: { id: string; title: string; lastMessageAt: Date; createdAt: Date }): AgentConversationVo {
    return {
      id: r.id,
      title: r.title,
      lastMessageAt: this.fmt(r.lastMessageAt),
      createdAt: this.fmt(r.createdAt),
    }
  }

  toMessageVo(m: AgentMessage): AgentMessageVo {
    return {
      id: m.id,
      seq: m.seq,
      role: m.role as AgentMessageVo['role'],
      kind: m.kind as AgentMessageVo['kind'],
      content: (m.content ?? {}) as Record<string, unknown>,
      meta: (m.meta ?? null) as Record<string, unknown> | null,
      createdAt: this.fmt(m.createdAt),
    }
  }

  private fmt(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  }
}
