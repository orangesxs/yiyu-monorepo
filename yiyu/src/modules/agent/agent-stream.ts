import { getToken } from '@/shared/api/http'

/** SSE 事件(与后端 yiyu-server/src/modules/agent 契约镜像) */
export type AgentSseEvent =
  | { event: 'message_start'; data: { messageId: string; role: 'assistant' } }
  | { event: 'message_delta'; data: { messageId: string; delta: string } }
  | { event: 'message_end'; data: { messageId: string; text: string; meta?: Record<string, unknown> } }
  | { event: 'tool_start'; data: { callId: string; name: string; label: string; risk: string; args: Record<string, unknown> } }
  | { event: 'tool_result'; data: { callId: string; name: string; ok: boolean; summary: string; card?: CardPayload; error?: { code: number; message: string }; latencyMs: number } }
  | { event: 'confirm_required'; data: { card: ConfirmCardVo } }
  | { event: 'usage'; data: { model: string; promptTokens: number; completionTokens: number; estimated: boolean } }
  | { event: 'done'; data: { conversationId: string; finish: 'done' | 'confirm_required' | 'aborted' | 'error' | 'max_rounds' } }
  | { event: 'error'; data: { code: number; message: string } }
  | { event: 'ping'; data: Record<string, never> }

/** 卡片载荷:cardType 决定渲染组件 */
export interface CardPayload {
  cardType: string
  title: string
  data: Record<string, unknown>
}

/** 确认卡(消息流一部分) */
export interface ConfirmCardVo {
  messageId: string
  confirmId: string
  skillId: string
  toolName: string
  label: string
  risk: 'medium' | 'high'
  args: Record<string, unknown>
  preview: { lines: string[] }
  warning?: string
  status: 'pending' | 'confirmed' | 'cancelled' | 'expired' | 'executed' | 'failed'
  expiresAt: string
  result?: { ok: boolean; summary: string; card?: CardPayload }
}

/** 消息 VO(与后端 AgentMessageVo 对齐) */
export interface AgentMessageVo {
  id: string
  seq: number
  role: 'user' | 'assistant' | 'tool'
  kind: 'text' | 'tool_calls' | 'tool_result' | 'confirm_card'
  content: Record<string, unknown>
  meta: Record<string, unknown> | null
  createdAt: string
}

export interface AgentConversationVo {
  id: string
  title: string
  lastMessageAt: string
  createdAt: string
}

export interface PageContext {
  app: string
  title: string
  hint?: string
}

export interface StreamHandlers {
  onEvent: (e: AgentSseEvent) => void
  onError: (e: { code: number; message: string }) => void
}

const base = import.meta.env.VITE_API_BASE || '/api'

/**
 * Agent SSE 客户端:原生 fetch + getReader(绕开 axios:15s 超时/envelope 解包都不兼容流)。
 * token 走 Authorization header(EventSource 做不到,所以用 fetch)。
 */
export async function streamAgentSse(
  path: string,
  body: unknown,
  handlers: StreamHandlers,
  signal: AbortSignal,
): Promise<void> {
  let res: Response
  try {
    res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      },
      body: JSON.stringify(body ?? {}),
      signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') return
    handlers.onError({ code: -1, message: '网络异常,无法连接 AI 服务' })
    return
  }
  if (!res.ok) {
    // 流开始前的错误是 envelope JSON
    let message = `请求失败(HTTP ${res.status})`
    try {
      const json = (await res.json()) as { message?: string }
      if (json.message) message = json.message
    } catch {
      /* ignore */
    }
    handlers.onError({ code: res.status, message })
    return
  }
  if (!res.body) {
    handlers.onError({ code: -1, message: '响应无内容' })
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let sep: number
      while ((sep = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        let eventName = 'message'
        const dataLines: string[] = []
        for (const line of frame.split('\n')) {
          if (line.startsWith('event:')) eventName = line.slice(6).trim()
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
        }
        if (eventName === 'ping') continue
        try {
          handlers.onEvent({ event: eventName, data: JSON.parse(dataLines.join('\n') || '{}') } as AgentSseEvent)
        } catch {
          /* 坏帧跳过 */
        }
      }
    }
  } catch (e) {
    if ((e as Error).name !== 'AbortError') {
      handlers.onError({ code: -1, message: '连接中断' })
    }
  } finally {
    reader.releaseLock()
  }
}
