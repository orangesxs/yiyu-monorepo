import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common'
import type { Response } from 'express'
import type { ApiEnvelope } from '../interceptors/transform.interceptor'

/**
 * 全局异常过滤器:与 TransformInterceptor 同构的错误包装
 * { success: false, code: <HTTP 状态码>, message: <中文>, data: null, timestamp }。
 * HTTP 状态码保留语义(401/403/404…),code 字段与其一致,前端可统一拦截。
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const envelope = (code: number, message: string): ApiEnvelope<null> => ({
      success: false,
      code,
      message,
      data: null,
      timestamp: Date.now(),
    })

    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const res = exception.getResponse()
      // class-validator 的校验错误是 { message: string[] },拼接展示
      const raw = typeof res === 'string' ? res : (res as any).message
      let message = Array.isArray(raw) ? raw.join(';') : String(raw || exception.message)
      // passport 默认英文消息中文化
      if (message === 'Unauthorized') message = '请先登录'
      response.status(status).json(envelope(status, message))
      return
    }

    // 未知异常:抛了 status 的裸 Error(守卫)保留状态码,其余按 500
    const err = exception as { status?: number; message?: string }
    if (err?.status) {
      response.status(err.status).json(envelope(err.status, err.message || '请求失败'))
      return
    }
    console.error('[yiyu-server] 未处理异常:', exception)
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
      envelope(HttpStatus.INTERNAL_SERVER_ERROR, '服务器开小差了,请稍后再试'),
    )
  }
}
