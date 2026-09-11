import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import { PrismaService } from '../../prisma/prisma.service'
import { AuditService } from '../../common/audit/audit.service'
import { RegisterDto } from './dto/auth.dto'

/** 对外暴露的用户形状(永不带 passwordHash) */
export function toSafeUser(u: {
  id: string
  username: string
  nickname: string
  avatar: string
  role: string
}) {
  return { id: u.id, username: u.username, nickname: u.nickname, avatar: u.avatar, role: u.role }
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private audit: AuditService,
  ) {}

  /** 注册:校验邀请码(未用)→ 建号(普通用户 + 默认账本)→ 标记邀请码已用 */
  async register(dto: RegisterDto) {
    const invite = await this.prisma.inviteCode.findUnique({
      where: { code: dto.inviteCode },
      include: { usedBy: true },
    })
    if (!invite || invite.usedById) {
      throw new BadRequestException('邀请码无效或已被使用')
    }

    const exists = await this.prisma.user.findUnique({ where: { username: dto.username } })
    if (exists) throw new ConflictException('该用户名已被注册')

    const passwordHash = await bcrypt.hash(dto.password, 10)
    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        nickname: dto.nickname,
        passwordHash,
        // 邀请码与创建者拉通:首次注册即绑定
        bio: '',
      },
    })

    // 新用户给一个默认账本,登录即有数据落点(对齐前端 mock「日常账本」)
    await this.prisma.book.create({
      data: { userId: user.id, name: '日常账本', icon: '📘', isDefault: true },
    })

    await this.prisma.inviteCode.update({
      where: { id: invite.id },
      data: { usedById: user.id, usedAt: new Date() },
    })

    await this.audit.record('admin', 'security', user.id, `邀请码注册了新用户「${dto.nickname}」`)
    await this.audit.record('auth', 'login', user.id, `「${dto.nickname}」注册并加入一隅`)

    const token = await this.signToken(user.id, user.username)
    return { token, user: toSafeUser(user) }
  }

  /** 登录:停用账号直接拒绝(403),token 内不放 role,每次请求查库裁决 */
  async login(dto: { username: string; password: string }) {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } })
    if (!user) throw new UnauthorizedException('用户名或密码错误')
    const ok = await bcrypt.compare(dto.password, user.passwordHash)
    if (!ok) throw new UnauthorizedException('用户名或密码错误')
    if (user.status === 'disabled') throw new ForbiddenException('账号已停用,请联系管理员')

    await this.prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } })
    await this.audit.record('auth', 'login', user.id, `「${user.nickname}」登录了一隅`)

    const token = await this.signToken(user.id, user.username)
    return { token, user: toSafeUser(user) }
  }

  /** 登出:无状态 JWT,前端弃 token 即可;此处仅记日志 */
  async logout(userId: string, nickname: string) {
    await this.audit.record('auth', 'login', userId, `「${nickname}」退出登录`)
    return { ok: true }
  }

  /** GET /auth/me:当前用户(已由 Guard 加载为 request.user) */
  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new UnauthorizedException('账号不存在')
    return toSafeUser(user)
  }

  private signToken(sub: string, username: string) {
    return this.jwt.signAsync({ sub, username })
  }
}
