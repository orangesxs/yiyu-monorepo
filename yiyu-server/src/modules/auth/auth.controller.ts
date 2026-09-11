import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { AuthService } from './auth.service'
import { LoginDto, RegisterDto } from './dto/auth.dto'
import { Public } from '../../common/decorators/public.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { User } from '@prisma/client'

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  /** 注册(限流 5 次/分/IP,防脚本撞邀请码) */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto)
  }

  /** 登录(限流 5 次/分/IP) */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto)
  }

  /** 登出(前端弃 token;记录日志) */
  @Post('logout')
  @HttpCode(200)
  logout(@CurrentUser() user: User) {
    return this.auth.logout(user.id, user.nickname)
  }

  /** 当前登录用户 */
  @Get('me')
  me(@CurrentUser() user: User) {
    return this.auth.me(user.id)
  }
}
