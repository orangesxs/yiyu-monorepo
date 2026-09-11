import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import type { User } from '@prisma/client'

/** 当前登录用户(由 JwtAuthGuard 挂到 request.user)。 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): User => {
    return ctx.switchToHttp().getRequest().user
  },
)
