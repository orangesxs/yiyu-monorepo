import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { PrismaService } from '../../prisma/prisma.service'

interface JwtPayload {
  sub: string
  username: string
}

/**
 * JWT 策略:校验签名后**从 DB 加载最新用户**挂到 request.user。
 * 不信任 token 里的 role/status —— 管理员被降级、账号被停用即时生效。
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private prisma: PrismaService,
    config: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') || 'dev-secret',
    })
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user) throw new UnauthorizedException('账号不存在')
    if (user.status === 'disabled') throw new UnauthorizedException('账号已停用,请联系管理员')
    return user
  }
}
