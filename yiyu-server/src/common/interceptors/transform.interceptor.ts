import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import type { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

/** 统一响应包装(与 AllExceptionsFilter 的错误包装同构) */
export interface ApiEnvelope<T> {
  success: boolean
  /** 成功恒为 0;失败为 HTTP 状态码(保留 HTTP 语义,便于网关/监控) */
  code: number
  /** 成功恒为空串;失败为中文提示 */
  message: string
  data: T | null
  /** 毫秒时间戳(服务端响应生成时刻) */
  timestamp: number
}

/**
 * 全局成功响应包装:{ success: true, code: 0, message: '', data, timestamp }。
 * message 约定:成功恒为空串,失败为中文提示;前端按 success 判定成败,message 有值才 toast。
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiEnvelope<T>> {
  intercept(_ctx: ExecutionContext, next: CallHandler<T>): Observable<ApiEnvelope<T>> {
    return next.handle().pipe(
      map((data) => ({
        success: true as const,
        code: 0,
        message: '',
        data: data ?? null,
        timestamp: Date.now(),
      })),
    )
  }
}
