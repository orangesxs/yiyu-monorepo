import { Injectable, Logger } from '@nestjs/common'
import { AgentConfigService } from './agent-config.service'

/** OpenAI 兼容协议的消息/工具类型(与具体网关无关) */
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
  tool_call_id?: string
}

export interface LlmToolDef {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export interface LlmUsage {
  promptTokens: number
  completionTokens: number
  estimated: boolean
}

export type LlmChunk =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_calls'; calls: { id: string; name: string; args: Record<string, unknown> }[] }
  | { type: 'usage'; usage: LlmUsage; model?: string }
  | { type: 'finish'; reason: 'stop' | 'tool_calls' | 'length' }

export class LlmError extends Error {
  constructor(
    message: string,
    public code: number, // HTTP 状态码或 -1(网络/中断)
  ) {
    super(message)
  }
}

/**
 * OpenAI 兼容协议客户端(Node 22 原生 fetch,零依赖)。
 * 流式:恒 stream:true,解析文本 delta 与 tool_call delta(按 index 聚合 arguments);
 * usage 优先 stream_options.include_usage 精确值,网关不给则按字符估算(中文 ~1.6 字/token)。
 */
@Injectable()
export class LlmClient {
  private readonly logger = new Logger(LlmClient.name)

  constructor(private config: AgentConfigService) {}

  private chatUrl(baseUrl: string) {
    return `${baseUrl.replace(/\/+$/, '')}/chat/completions`
  }

  private estimateTokens(text: string): number {
    if (!text) return 0
    return Math.ceil(text.length / 1.6)
  }

  private buildBody(
    cfg: { baseUrl: string; apiKey: string; model: string },
    messages: LlmMessage[],
    tools: LlmToolDef[] | undefined,
    stream: boolean,
    extra?: Record<string, unknown>,
  ): RequestInit {
    const body: Record<string, unknown> = {
      model: cfg.model,
      messages,
      ...(tools?.length ? { tools, tool_choice: 'auto' } : {}),
      ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
      ...extra,
    }
    return {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    }
  }

  /** 非流式:摘要生成、连通测试 */
  async chat(
    messages: LlmMessage[],
    opts?: { maxTokens?: number; baseUrl?: string; apiKey?: string },
  ): Promise<{ content: string; usage: LlmUsage; model: string; latencyMs: number }> {
    const cfg = opts?.baseUrl && opts?.apiKey ? { baseUrl: opts.baseUrl, apiKey: opts.apiKey, model: (await this.config.getLlmConfig())?.model ?? '' } : await this.config.getLlmConfig()
    if (!cfg) throw new LlmError('AI 服务未配置', 503)
    const started = Date.now()
    const res = await fetch(
      this.chatUrl(cfg.baseUrl),
      this.buildBody(cfg, messages, undefined, false, opts?.maxTokens ? { max_tokens: opts.maxTokens } : {}),
    ).catch((e: unknown) => {
      throw new LlmError(`LLM 网络错误:${(e as Error).message}`, -1)
    })
    if (!res.ok) throw new LlmError(await this.readErrorMessage(res), res.status)
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    const content = json.choices?.[0]?.message?.content ?? ''
    const usage: LlmUsage = json.usage
      ? { promptTokens: json.usage.prompt_tokens ?? 0, completionTokens: json.usage.completion_tokens ?? 0, estimated: false }
      : {
          promptTokens: this.estimateTokens(messages.map((m) => m.content ?? '').join('')),
          completionTokens: this.estimateTokens(content),
          estimated: true,
        }
    return { content, usage, model: cfg.model, latencyMs: Date.now() - started }
  }

  /**
   * 流式对话:逐 chunk 产出文本增量 / 聚合后的 tool_calls / usage / finish。
   * 兼容兜底:include_usage 引发 400 时去参重试一次;streaming 配置关或出错由上层降级调 chat()。
   */
  async *chatStream(
    messages: LlmMessage[],
    tools?: LlmToolDef[],
    outerSignal?: AbortSignal,
  ): AsyncGenerator<LlmChunk> {
    const cfg = await this.config.getLlmConfig()
    if (!cfg) throw new LlmError('AI 服务未配置', 503)

    let res = await this.doFetch(cfg, messages, tools, true, outerSignal)
    if (res.status === 400) {
      // 个别网关不认 stream_options:去参重试一次
      const text = await res.text()
      if (text.includes('stream_options')) {
        res = await this.doFetchRaw(cfg, messages, tools, true, outerSignal)
      } else {
        throw new LlmError(this.extractErrorMessage(text) || 'LLM 请求参数错误', 400)
      }
    }
    if (!res.ok) throw new LlmError(await this.readErrorMessage(res), res.status)
    if (!res.body) throw new LlmError('LLM 响应无 body', -1)

    yield* this.parseSseChunks(res.body, cfg, messages, tools)
  }

  private async doFetch(
    cfg: { baseUrl: string; apiKey: string; model: string },
    messages: LlmMessage[],
    tools: LlmToolDef[] | undefined,
    stream: boolean,
    outerSignal?: AbortSignal,
  ) {
    return this.doFetchRaw(cfg, messages, tools, stream, outerSignal).catch((e: unknown) => {
      if (e instanceof LlmError) throw e
      throw new LlmError(`LLM 网络错误:${(e as Error).message}`, -1)
    })
  }

  private async doFetchRaw(
    cfg: { baseUrl: string; apiKey: string; model: string },
    messages: LlmMessage[],
    tools: LlmToolDef[] | undefined,
    stream: boolean,
    outerSignal?: AbortSignal,
  ): Promise<Response> {
    const init = this.buildBody(cfg, messages, tools, stream)
    // 外部中断(客户端断开 SSE)优先于 90s 超时
    const signals = [AbortSignal.timeout(90_000), ...(outerSignal ? [outerSignal] : [])]
    init.signal = signals.length === 2 ? AbortSignal.any(signals) : signals[0]
    return fetch(this.chatUrl(cfg.baseUrl), init)
  }

  /** 解析 OpenAI 流式 SSE 响应:聚合 tool_call delta、收集 usage */
  private async *parseSseChunks(
    body: ReadableStream<Uint8Array>,
    cfg: { model: string },
    messages: LlmMessage[],
    tools: LlmToolDef[] | undefined,
  ): AsyncGenerator<LlmChunk> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    // tool_call 聚合态:按 delta index 收集
    const toolAcc = new Map<number, { id: string; name: string; args: string }>()
    let finishReason: 'stop' | 'tool_calls' | 'length' = 'stop'
    let usage: LlmUsage | null = null
    let anyContent = false

    const combineSignals = () => AbortSignal.timeout(90_000)

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let idx: number
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, idx).trim()
          buffer = buffer.slice(idx + 1)
          if (!line.startsWith('data:')) continue
          const data = line.slice(5).trim()
          if (data === '[DONE]') continue
          let json: {
            choices?: {
              delta?: {
                content?: string
                tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[]
              }
              finish_reason?: string | null
            }[]
            usage?: { prompt_tokens?: number; completion_tokens?: number } | null
          }
          try {
            json = JSON.parse(data)
          } catch {
            continue // 坏帧跳过
          }
          if (json.usage) {
            usage = {
              promptTokens: json.usage.prompt_tokens ?? 0,
              completionTokens: json.usage.completion_tokens ?? 0,
              estimated: false,
            }
          }
          const choice = json.choices?.[0]
          if (!choice) continue
          if (choice.delta?.content) {
            anyContent = true
            yield { type: 'text_delta', text: choice.delta.content }
          }
          for (const tc of choice.delta?.tool_calls ?? []) {
            const acc = toolAcc.get(tc.index) ?? { id: '', name: '', args: '' }
            acc.id = tc.id || acc.id
            acc.name += tc.function?.name ?? ''
            acc.args += tc.function?.arguments ?? ''
            toolAcc.set(tc.index, acc)
          }
          if (choice.finish_reason) {
            finishReason = choice.finish_reason === 'tool_calls' ? 'tool_calls' : choice.finish_reason === 'length' ? 'length' : 'stop'
          }
        }
      }
    } finally {
      reader.releaseLock()
      void combineSignals
    }

    if (toolAcc.size > 0) {
      yield {
        type: 'tool_calls',
        calls: [...toolAcc.entries()].sort((a, b) => a[0] - b[0]).map(([, acc]) => ({
          id: acc.id,
          name: acc.name,
          args: this.safeParseArgs(acc.args),
        })),
      }
    }
    yield { type: 'finish', reason: toolAcc.size > 0 ? 'tool_calls' : finishReason }
    yield {
      type: 'usage',
      usage:
        usage ??
        {
          promptTokens: this.estimateTokens(messages.map((m) => JSON.stringify(m)).join('')),
          completionTokens: 0,
          estimated: true,
        },
    }
    void cfg
    void tools
    void anyContent
  }

  private safeParseArgs(raw: string): Record<string, unknown> {
    if (!raw) return {}
    try {
      const parsed = JSON.parse(raw)
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
    } catch {
      return { _raw: raw } // 参数残缺时透传原文,由技能校验报错
    }
  }

  /** 模型列表:OpenAI 兼容 GET /models(可用表单值未保存探测);失败返回空数组 */
  async listModels(opts?: { baseUrl?: string; apiKey?: string }): Promise<string[]> {
    const saved = await this.config.getLlmConfig()
    const baseUrl = opts?.baseUrl?.trim() || saved?.baseUrl
    const apiKey = opts?.apiKey?.trim() || saved?.apiKey
    if (!baseUrl || !apiKey) throw new LlmError('请先填写 Base URL 和 API Key', 400)
    try {
      const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) throw new LlmError(await this.readErrorMessage(res), res.status)
      const json = (await res.json()) as { data?: { id?: string }[] }
      return (json.data ?? [])
        .map((m) => m.id ?? '')
        .filter(Boolean)
        .sort()
    } catch (e) {
      if (e instanceof LlmError) throw e
      throw new LlmError(`网络错误:${(e as Error).message}`, -1)
    }
  }

  private async readErrorMessage(res: Response): Promise<string> {
    const text = await res.text()
    return this.extractErrorMessage(text) || `LLM 服务错误(HTTP ${res.status})`
  }

  private extractErrorMessage(body: string): string {
    try {
      const json = JSON.parse(body) as { error?: { message?: string }; message?: string }
      return json.error?.message || json.message || ''
    } catch {
      return body.slice(0, 200)
    }
  }
}
