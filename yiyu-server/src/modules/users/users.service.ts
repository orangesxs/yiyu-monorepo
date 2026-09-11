import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import { PrismaService } from '../../prisma/prisma.service'
import { AuditService } from '../../common/audit/audit.service'
import { fmtDate, fmtDateTime, parseDateTime } from '../../common/utils/datetime'
import { ChangePasswordDto, UpdateProfileDto } from './dto/profile.dto'

/** 个人档案(对外形状,与前端 Profile 接口对齐) */
export interface ProfileVo {
  id: string
  username: string
  nickname: string
  avatar: string
  bio: string
  gender: string
  /** 'YYYY-MM-DD',空串表示未填写 */
  birthday: string
  region: string
  joinedAt: string
  updatedAt: string
}

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** GET /profile */
  async getProfile(userId: string): Promise<ProfileVo> {
    const u = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!u) throw new UnauthorizedException('账号不存在')
    return this.toVo(u)
  }

  /** PUT /profile */
  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<ProfileVo> {
    const birthday =
      dto.birthday === undefined ? undefined : dto.birthday ? this.parseBirthday(dto.birthday) : null

    const u = await this.prisma.user.update({
      where: { id: userId },
      data: {
        nickname: dto.nickname,
        avatar: dto.avatar,
        bio: dto.bio,
        gender: dto.gender,
        region: dto.region,
        birthday,
      },
    })

    await this.audit.record('profile', 'update', userId, `「${u.nickname}」更新了个人档案`)
    return this.toVo(u)
  }

  /** PUT /profile/password:改密码成功后旧密码即刻失效(前端会引导重新登录) */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!u) throw new UnauthorizedException('账号不存在')
    const ok = await bcrypt.compare(dto.oldPassword, u.passwordHash)
    if (!ok) throw new BadRequestException('当前密码不正确')

    const passwordHash = await bcrypt.hash(dto.newPassword, 10)
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } })
    await this.audit.record('profile', 'security', userId, `「${u.nickname}」修改了登录密码`)
    return { ok: true }
  }

  private parseBirthday(s: string): Date {
    const d = parseDateTime(s)
    if (!d) throw new BadRequestException('生日格式应为 YYYY-MM-DD')
    return d
  }

  private toVo(u: {
    id: string
    username: string
    nickname: string
    avatar: string
    bio: string
    gender: string
    birthday: Date | null
    region: string
    registeredAt: Date
    updatedAt: Date
  }): ProfileVo {
    return {
      id: u.id,
      username: u.username,
      nickname: u.nickname,
      avatar: u.avatar,
      bio: u.bio,
      gender: u.gender,
      birthday: u.birthday ? fmtDate(u.birthday) : '',
      region: u.region,
      joinedAt: fmtDate(u.registeredAt),
      updatedAt: fmtDateTime(u.updatedAt),
    }
  }
}
