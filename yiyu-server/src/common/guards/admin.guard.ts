import { Injectable } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

/**
 * 管理后台守卫:经 @UseGuards(AdminGuard) 显式挂载。
 * 先走 JWT 校验(未登录 401),再校验 role === 'admin'(否则 403 中文提示)。
 */
@Injectable()
export class AdminGuard extends AuthGuard('jwt') {
  handleRequest(err: unknown, user: any) {
    if (err || !user) {
      const e: any = err || new Error('请先登录')
      if (!e.status) e.status = 401
      throw e
    }
    if (user.role !== 'admin') {
      const e: any = new Error('该区域仅管理员可见')
      e.status = 403
      throw e
    }
    return user
  }
}
