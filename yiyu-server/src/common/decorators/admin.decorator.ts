import { SetMetadata } from '@nestjs/common'

/** 标记需要管理员权限的路由(配合 AdminGuard)。 */
export const IS_ADMIN_KEY = 'isAdmin'
export const Admin = () => SetMetadata(IS_ADMIN_KEY, true)
