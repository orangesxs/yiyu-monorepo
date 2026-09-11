import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { generateInviteCode } from '../../common/utils/invite-code'
import { fmtDateTime } from '../../common/utils/datetime'

export interface InviteCodeVo {
  id: string
  code: string
  createdAt: string
  usedAt: string | null
  usedBy: { id: string; nickname: string; avatar: string } | null
}

@Injectable()
export class InviteCodesService {
  constructor(private prisma: PrismaService) {}

  /** 我的邀请码列表(新→旧) */
  async listMine(userId: string): Promise<InviteCodeVo[]> {
    const rows = await this.prisma.inviteCode.findMany({
      where: { creatorId: userId },
      orderBy: { createdAt: 'desc' },
      include: { usedBy: { select: { id: true, nickname: true, avatar: true } } },
    })
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      createdAt: fmtDateTime(r.createdAt),
      usedAt: r.usedAt ? fmtDateTime(r.usedAt) : null,
      usedBy: r.usedBy,
    }))
  }

  /**
   * 生成邀请码:普通用户未使用码上限 INVITE_MAX_UNUSED(默认 5),管理员不限。
   * 码值冲突(唯一索引)自动重试。
   */
  async create(userId: string, isAdmin: boolean): Promise<InviteCodeVo> {
    if (!isAdmin) {
      const limit = Number(process.env.INVITE_MAX_UNUSED) || 5
      const unused = await this.prisma.inviteCode.count({
        where: { creatorId: userId, usedById: null },
      })
      if (unused >= limit) {
        throw new BadRequestException(`未使用的邀请码已达上限(${limit} 个),待现有码被使用后再生成`)
      }
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateInviteCode()
      const exists = await this.prisma.inviteCode.findUnique({ where: { code } })
      if (exists) continue
      const row = await this.prisma.inviteCode.create({
        data: { code, creatorId: userId },
      })
      return {
        id: row.id,
        code: row.code,
        createdAt: fmtDateTime(row.createdAt),
        usedAt: null,
        usedBy: null,
      }
    }
    throw new BadRequestException('邀请码生成失败,请重试')
  }
}
