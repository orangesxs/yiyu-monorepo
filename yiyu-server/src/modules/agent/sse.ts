import { Response } from 'express'

/**
 * SSE 流工具:手写 text/event-stream 帧(绕过 TransformInterceptor 的 envelope 包装)。
 * 用法:注入 @Res() response 后 new SseStream(response),结束时必须 close()。
 */
export class SseStream {
  private closed = false
  private heartbeat?: ReturnType<typeof setInterval>

  constructor(private res: Response) {
    res.status(200)
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no') // nginx 不缓冲
    res.flushHeaders?.()
    // 15s 心跳:防反代 idle 断连
    this.heartbeat = setInterval(() => {
      this.emit('ping', {})
    }, 15_000)
  }

  get writable(): boolean {
    return !this.closed && !this.res.writableEnded
  }

  emit(event: string, payload: unknown) {
    if (!this.writable) return
    try {
      this.res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
    } catch {
      this.close()
    }
  }

  close() {
    if (this.closed) return
    this.closed = true
    if (this.heartbeat) clearInterval(this.heartbeat)
    try {
      this.res.end()
    } catch {
      /* 已断开 */
    }
  }
}
