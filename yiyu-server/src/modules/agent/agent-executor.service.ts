import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { AgentService } from './agent.service'
import { AgentConfigService } from './agent-config.service'
import { ContextBuilder } from './context-builder'
import type { PageContext } from './context-builder'
import { SkillRegistry, CardPayload } from './skill-registry'
import { LlmClient, LlmError } from './llm-client'
import { UsageService } from './usage.service'
import { SseStream } from './sse'
import { AuditService } from '../../common/audit/audit.service'
import type { User } from '@prisma/client'

/** 确认卡 content 形状(消息流一部分,前端据此渲染交互卡) */
export interface ConfirmCardContent {
  confirmId: string
  skillId: string
  toolName: string
  label: string
  risk: 'medium' | 'high'
  args: Record<string, unknown>
  preview: { lines: string[] }
  warning?: string
  status: 'pending' | 'confirmed' | 'cancelled' | 'expired' | 'executed' | 'failed'
  expiresAt: string // ISO
  result?: { ok: boolean; summary: string; card?: CardPayload }
}

/** 执行入口:chat(新消息)/ confirm(确认卡)/ regenerate(重生成) */
export type ExecutorEntry =
  | { type: 'chat'; content: string; pageContext?: PageContext }
  | { type: 'confirm'; confirmId: string }
  | { type: 'regenerate' }
export type { PageContext }

const CONFIRM_TTL_MS = 10 * 60 * 1000

/**
 * Agent 主循环:编排 ContextBuilder → LlmClient → SkillRegistry。
 * 全部事件经 SseStream 下发;每轮消息落库;写操作挂起为确认卡。
 */
@Injectable()
export class AgentExecutorService {
  /** 会话级并发锁:同一会话同时只跑一条流 */
  private inFlight = new Map<string, AbortController>()

  constructor(
    private prisma: PrismaService,
    private agentService: AgentService,
    private config: AgentConfigService,
    private contextBuilder: ContextBuilder,
    private registry: SkillRegistry,
    private llm: LlmClient,
    private usage: UsageService,
    private audit: AuditService,
  ) {}

  async run(user: User, conversationId: string, entry: ExecutorEntry, sse: SseStream) {
    const aborter = new AbortController()
    this.inFlight.set(conversationId, aborter)

    try {
      await this.runInner(user, conversationId, entry, sse, aborter.signal)
    } finally {
      this.inFlight.delete(conversationId)
      sse.close()
    }
  }

  private async runInner(user: User, conversationId: string, entry: ExecutorEntry, sse: SseStream, signal: AbortSignal) {
    // 0. 配置守卫
    const [llmCfg, settings] = await Promise.all([this.config.getLlmConfig(), this.config.getSettings()])
    if (!llmCfg || !settings.agentEnabled) {
      sse.emit('error', { code: 503, message: 'AI 服务未配置或已停用,请联系管理员' })
      sse.emit('done', { conversationId, finish: 'error' })
      return
    }
    if (this.inFlight.size > 1 && [...this.inFlight.keys()].filter((k) => k === conversationId).length > 1) {
      sse.emit('error', { code: 429, message: '上一条回复还在生成中,请稍候' })
      sse.emit('done', { conversationId, finish: 'error' })
      return
    }
    await this.agentService.ownedConversation(user.id, conversationId) // 404/403 在流前抛(envelope)

    // 1. 入口分派
    let confirmCard: { messageId: string; content: ConfirmCardContent } | null = null
    if (entry.type === 'chat') {
      await this.cancelStalePendingCards(conversationId, '用户发送了新消息')
      await this.agentService.appendMessage(conversationId, 'user', 'text', { text: entry.content }, { pageContext: entry.pageContext ?? null })
      await this.agentService.maybeTitle(conversationId, entry.content)
    } else if (entry.type === 'regenerate') {
      await this.cancelStalePendingCards(conversationId, '用户重新生成')
      await this.truncateAfterLastUser(conversationId)
    } else {
      confirmCard = await this.resolveConfirm(user, conversationId, entry.confirmId, sse)
      if (!confirmCard) return // resolveConfirm 已发 error+done
    }

    // 2. LLM 循环(最大 maxToolRounds 轮)
    const { tools } = await this.registry.listEnabled()
    for (let round = 1; round <= settings.maxToolRounds; round++) {
      const messages = await this.contextBuilder.build(user, conversationId, entry.type === 'chat' ? entry.pageContext : undefined)
      const forceFinal = round === settings.maxToolRounds // 末轮不带 tools,强制总结收尾

      const messageId = this.cuid()
      sse.emit('message_start', { messageId, role: 'assistant' })
      let text = ''
      let toolCalls: { id: string; name: string; args: Record<string, unknown> }[] = []
      let model = llmCfg.model
      let roundStarted = Date.now()

      try {
        const stream = llmCfg.streaming
          ? this.llm.chatStream(messages, forceFinal ? undefined : tools, signal)
          : this.nonStreamingFallback(messages, forceFinal ? undefined : tools, signal)
        for await (const chunk of stream) {
          if (chunk.type === 'text_delta') {
            text += chunk.text
            sse.emit('message_delta', { messageId, delta: chunk.text })
          } else if (chunk.type === 'tool_calls') {
            toolCalls = chunk.calls
          } else if (chunk.type === 'usage') {
            model = chunk.model ?? model
            sse.emit('usage', { model, promptTokens: chunk.usage.promptTokens, completionTokens: chunk.usage.completionTokens, estimated: chunk.usage.estimated })
            void this.usage.record({
              userId: user.id,
              conversationId,
              kind: 'chat',
              model,
              usage: chunk.usage,
              latencyMs: Date.now() - roundStarted,
              ok: true,
            })
          }
        }
      } catch (e) {
        await this.handleLlmError(user, conversationId, e, sse, roundStarted, model)
        if (text) {
          // 半截文本也落库,标记中断
          await this.agentService.appendMessage(conversationId, 'assistant', 'text', { text }, { aborted: true, model })
          sse.emit('message_end', { messageId, text, meta: { aborted: true } })
        }
        sse.emit('done', { conversationId, finish: 'error' })
        return
      }

      // 2a. 无工具调用:正常收尾
      if (toolCalls.length === 0) {
        const meta = { model, latencyMs: Date.now() - roundStarted }
        await this.agentService.appendMessage(conversationId, 'assistant', 'text', { text }, meta)
        sse.emit('message_end', { messageId, text, meta })
        break
      }

      // 2b. 有工具调用:落 tool_calls 消息,逐个执行
      await this.agentService.appendMessage(
        conversationId,
        'assistant',
        'tool_calls',
        { calls: toolCalls.map((c) => ({ callId: c.id, name: c.name, args: c.args })) },
        null,
      )
      sse.emit('message_end', { messageId, text, meta: { model } })

      let pendingConfirm: { messageId: string; content: ConfirmCardContent } | null = null
      for (const call of toolCalls) {
        const def = this.registry.get(call.name)
        if (!def) {
          await this.emitToolResult(conversationId, sse, {
            callId: call.id,
            name: call.name,
            ok: false,
            summary: `技能 ${call.name} 不存在或已停用`,
          })
          continue
        }
        if (def.risk === 'low') {
          // 低风险:直接执行
          sse.emit('tool_start', { callId: call.id, name: def.name, label: def.label, risk: def.risk, args: call.args })
          const started = Date.now()
          let result: Awaited<ReturnType<typeof def.handler>>
          try {
            result = await def.handler(user.id, call.args)
          } catch (e) {
            result = { ok: false, summary: `执行失败:${(e as Error).message}` }
          }
          void result
          await this.emitToolResult(conversationId, sse, {
            callId: call.id,
            name: def.name,
            ok: result.ok,
            summary: result.summary,
            card: result.card,
            error: result.error,
            latencyMs: Date.now() - started,
          })
          if (result.ok) {
            await this.auditAgentWrite(user, def.id, def.label, result.summary)
          }
        } else {
          // 中/高风险:先 resolve 预解析(定位实际数据、回填 id、生成人类可读行),失败反馈 LLM 不挂卡
          let resolvedArgs = call.args
          let previewLines: string[] | null = null
          if (def.resolve) {
            try {
              const resolved = await def.resolve(user.id, call.args)
              if (resolved?.error) {
                await this.emitToolResult(conversationId, sse, {
                  callId: call.id,
                  name: def.name,
                  ok: false,
                  summary: resolved.error,
                  error: { code: 400, message: resolved.error },
                })
                continue
              }
              if (resolved) {
                resolvedArgs = resolved.args
                previewLines = resolved.lines
              }
            } catch (e) {
              await this.emitToolResult(conversationId, sse, {
                callId: call.id,
                name: def.name,
                ok: false,
                summary: `预解析失败:${(e as Error).message}`,
                error: { code: 400, message: (e as Error).message },
              })
              continue
            }
          }
          // 挂确认卡(同会话仅一张;新卡取代旧卡)
          await this.cancelStalePendingCards(conversationId, '发起新的写操作')
          const content: ConfirmCardContent = {
            confirmId: this.cuid(),
            skillId: def.id,
            toolName: def.name,
            label: def.label,
            risk: def.risk,
            args: resolvedArgs,
            preview: { lines: previewLines ?? (def.preview ? def.preview(resolvedArgs).lines : [JSON.stringify(resolvedArgs)]) },
            status: 'pending',
            expiresAt: new Date(Date.now() + CONFIRM_TTL_MS).toISOString(),
          }
          if (def.risk === 'high') content.warning = '该操作风险较高,执行后可能无法恢复,请仔细核对。'
          const msg = await this.agentService.appendMessage(conversationId, 'assistant', 'confirm_card', content as unknown as Record<string, unknown>, null)
          pendingConfirm = { messageId: msg.id, content }
          sse.emit('confirm_required', { card: { ...content, messageId: msg.id } })
        }
      }

      if (pendingConfirm) {
        // 流正常结束,等待用户确认(confirm 端点会开启新流)
        sse.emit('done', { conversationId, finish: 'confirm_required' })
        void this.contextBuilder.maybeSummarize(user.id, conversationId)
        return
      }
      // 全部低风险已执行:继续下一轮
    }

    // 兜底:整轮循环结束(含 max rounds 耗尽)都没有给用户输出过文本时,补一条防沉默
    const lastUserSeqRow = await this.prisma.agentMessage.findFirst({
      where: { conversationId, role: 'user' },
      orderBy: { seq: 'desc' },
      select: { seq: true },
    })
    const textAfterLastUser = lastUserSeqRow
      ? await this.prisma.agentMessage.findFirst({
          where: { conversationId, role: 'assistant', kind: 'text', seq: { gt: lastUserSeqRow.seq } },
        })
      : null
    if (!textAfterLastUser) {
      const fallback = '抱歉,这轮操作没有顺利完成。你可以换个说法再试一次,或直接告诉我具体要查/要改的数据。'
      const msgId = this.cuid()
      sse.emit('message_start', { messageId: msgId, role: 'assistant' })
      sse.emit('message_delta', { messageId: msgId, delta: fallback })
      await this.agentService.appendMessage(conversationId, 'assistant', 'text', { text: fallback }, { fallback: true })
      sse.emit('message_end', { messageId: msgId, text: fallback, meta: { fallback: true } })
    }

    sse.emit('done', { conversationId, finish: 'done' })
    void this.contextBuilder.maybeSummarize(user.id, conversationId)
  }

  /** confirm 入口:校验卡 → 置 confirmed → 执行 → 结果落卡 + tool_result → 继续 LLM 总结轮 */
  private async resolveConfirm(user: User, conversationId: string, confirmId: string, sse: SseStream) {
    const msg = await this.prisma.agentMessage.findFirst({
      where: { conversationId, kind: 'confirm_card' },
      orderBy: { seq: 'desc' },
    })
    if (!msg) throw new NotFoundException('确认卡不存在')
    const content = msg.content as unknown as ConfirmCardContent
    if (content.confirmId !== confirmId) throw new NotFoundException('确认卡不存在')
    if (content.status !== 'pending') {
      sse.emit('error', { code: 400, message: `该确认卡已${this.statusText(content.status)},无需重复操作` })
      sse.emit('done', { conversationId, finish: 'error' })
      return null
    }
    if (new Date(content.expiresAt).getTime() < Date.now()) {
      content.status = 'expired'
      await this.agentService.updateMessageContent(msg.id, content as unknown as Record<string, unknown>)
      await this.agentService.appendMessage(conversationId, 'tool', 'tool_result', {
        callId: `${content.toolName}-pending`,
        name: content.toolName,
        ok: false,
        summary: '用户确认时已超时,操作未执行',
      }, null)
      sse.emit('error', { code: 400, message: '确认已超时,请重新发起' })
      sse.emit('done', { conversationId, finish: 'error' })
      return null
    }

    // 执行技能
    const def = this.registry.get(content.toolName)
    content.status = 'confirmed'
    await this.agentService.updateMessageContent(msg.id, content as unknown as Record<string, unknown>)
    if (!def) {
      content.status = 'failed'
      content.result = { ok: false, summary: '技能不存在或已停用' }
      await this.agentService.updateMessageContent(msg.id, content as unknown as Record<string, unknown>)
      sse.emit('error', { code: 400, message: '技能不存在或已停用' })
      sse.emit('done', { conversationId, finish: 'error' })
      return null
    }

    sse.emit('tool_start', { callId: `${content.toolName}-pending`, name: def.name, label: def.label, risk: def.risk, args: content.args })
    const started = Date.now()
    let result: { ok: boolean; summary: string; card?: CardPayload }
    try {
      result = await def.handler(user.id, content.args)
    } catch (e) {
      result = { ok: false, summary: `执行失败:${(e as Error).message}` }
    }
    content.status = result.ok ? 'executed' : 'failed'
    content.result = { ok: result.ok, summary: result.summary, card: result.card }
    await this.agentService.updateMessageContent(msg.id, content as unknown as Record<string, unknown>)
    await this.emitToolResult(conversationId, sse, {
      callId: `${content.toolName}-pending`,
      name: def.name,
      ok: result.ok,
      summary: result.summary,
      card: result.card,
      latencyMs: Date.now() - started,
    })
    if (result.ok) {
      await this.auditAgentWrite(user, def.id, def.label, result.summary)
    }
    return { messageId: msg.id, content }
  }

  /** 把 stale pending 卡置 cancelled + 补 tool_result(保证 LLM 历史自洽) */
  private async cancelStalePendingCards(conversationId: string, reason: string) {
    const rows = await this.prisma.agentMessage.findMany({ where: { conversationId, kind: 'confirm_card' } })
    for (const row of rows) {
      const content = row.content as unknown as ConfirmCardContent
      if (content.status !== 'pending') continue
      content.status = 'cancelled'
      await this.agentService.updateMessageContent(row.id, content as unknown as Record<string, unknown>)
      await this.agentService.appendMessage(conversationId, 'tool', 'tool_result', {
        callId: `${content.toolName}-pending`,
        name: content.toolName,
        ok: false,
        summary: `用户未确认该操作(${reason})`,
      }, null)
    }
  }

  /** regenerate:删最后一条 user 消息之后的所有消息 */
  private async truncateAfterLastUser(conversationId: string) {
    const lastUser = await this.prisma.agentMessage.findFirst({
      where: { conversationId, role: 'user' },
      orderBy: { seq: 'desc' },
    })
    if (!lastUser) return
    await this.prisma.agentMessage.deleteMany({ where: { conversationId, seq: { gt: lastUser.seq } } })
  }

  private async emitToolResult(
    conversationId: string,
    sse: SseStream,
    payload: { callId: string; name: string; ok: boolean; summary: string; card?: CardPayload; error?: { code: number; message: string }; latencyMs?: number },
  ) {
    await this.agentService.appendMessage(
      conversationId,
      'tool',
      'tool_result',
      {
        callId: payload.callId,
        name: payload.name,
        ok: payload.ok,
        summary: payload.summary,
        llmData: payload.ok ? { summary: payload.summary } : undefined,
        card: payload.card,
        error: payload.error,
      },
      null,
    )
    sse.emit('tool_result', {
      callId: payload.callId,
      name: payload.name,
      ok: payload.ok,
      summary: payload.summary,
      card: payload.card,
      error: payload.error,
      latencyMs: payload.latencyMs ?? 0,
    })
  }

  /** agent 写操作审计:与业务 service 自身审计双写,便于追溯"经 AI"操作 */
  private async auditAgentWrite(user: User, skillId: string, label: string, summary: string) {
    if (!/create|delete|update|transaction/i.test(skillId)) return // 只审写操作类技能
    const action = skillId.includes('delete') ? 'delete' : skillId.includes('create') ? 'create' : 'update'
    await this.audit.record('agent', action, user.id, `经 AI ${label}:${summary}`.slice(0, 40))
  }

  /** streaming=false 时的降级:非流式包装成同构 chunk 流 */
  private async *nonStreamingFallback(
    messages: Parameters<LlmClient['chat']>[0] extends infer T ? T : never,
    tools: Parameters<LlmClient['chatStream']>[1],
    signal: AbortSignal,
  ) {
    void signal
    // 简化:非流式路径不支持 tools 差异,直接用 chatStream 的兄弟逻辑
    const res = await this.llm.chat(messages as never)
    yield { type: 'text_delta' as const, text: res.content }
    yield { type: 'finish' as const, reason: 'stop' as const }
    yield { type: 'usage' as const, usage: res.usage, model: res.model }
  }

  private async handleLlmError(user: User, conversationId: string, e: unknown, sse: SseStream, started: number, model: string) {
    const err = e instanceof LlmError ? e : new LlmError((e as Error).message, -1)
    void this.usage.record({
      userId: user.id,
      conversationId,
      kind: 'chat',
      model,
      usage: { promptTokens: 0, completionTokens: 0, estimated: true },
      latencyMs: Date.now() - started,
      ok: false,
      errorCode: String(err.code),
    })
    sse.emit('error', { code: err.code === -1 ? 502 : err.code, message: `AI 调用失败:${err.message}` })
  }

  private statusText(status: string): string {
    return { confirmed: '确认', cancelled: '取消', expired: '过期', executed: '执行', failed: '执行失败' }[status] ?? status
  }

  private cuid(): string {
    // 简易唯一 id(消息落库由 Prisma cuid 主键,此 id 仅流内标识)
    return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  }
}
