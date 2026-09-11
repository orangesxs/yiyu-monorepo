import { SetMetadata } from '@nestjs/common'

export const IS_PUBLIC_KEY = 'isPublic'

/** 标记公开路由(免登录)。全局 JwtAuthGuard 默认拦截一切,@Public() 放行。 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)
