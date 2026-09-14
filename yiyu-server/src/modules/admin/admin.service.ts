import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { AuditService } from '../../common/audit/audit.service'
import { fmtDate, fmtDateTime } from '../../common/utils/datetime'
import type { AdminCreateUserDto, AdminResetPasswordDto, AdminUpdateUserDto, QueryLogsDto } from './dto/admin.dto'

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /* ───────────────────────── 用户管理 ───────────────────────── */

  /** 用户目录:keyword(用户名/昵称)+ role + status 筛选,id 升序(与前端排序一致) */
  async listUsers(query: { keyword?: string; role?: string; status?: string }) {
    const kw = query.keyword?.trim()
    const where: Prisma.UserWhereInput = {
      ...(kw
        ? { OR: [{ username: { contains: kw, mode: 'insensitive' } }, { nickname: { contains: kw } }] }
        : {}),
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
    }
    const users = await this.prisma.user.findMany({ where, orderBy: { id: 'asc' } })
    return users.map((u) => ({
      id: u.id,
      username: u.username,
      name: u.nickname,
      avatar: u.avatar,
      role: u.role,
      status: u.status,
      registeredAt: fmtDate(u.registeredAt),
      lastActiveAt: fmtDateTime(u.lastActiveAt),
    }))
  }

  /** 管理员直接建号(内部应用:不消耗邀请码,但记录安全日志) */
  async createUser(operatorId: string, dto: AdminCreateUserDto) {
    const exists = await this.prisma.user.findUnique({ where: { username: dto.username } })
    if (exists) throw new ConflictException('该用户名已存在')

    const passwordHash = await bcrypt.hash(dto.password, 10)
    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        nickname: dto.name,
        avatar: dto.avatar,
        role: dto.role,
        passwordHash,
      },
    })
    await this.prisma.book.create({
      data: { userId: user.id, name: '日常账本', icon: '📘', isDefault: true },
    })
    await this.audit.record('admin', 'security', operatorId, `管理员新增了用户「${dto.name}」`)
    return { id: user.id, username: user.username, name: user.nickname, avatar: user.avatar, role: user.role }
  }

  /** 改角色/停用启用;禁止操作自己(前端 isSelf 同款保护,后端兜底) */
  async updateUser(operatorId: string, targetId: string, dto: AdminUpdateUserDto) {
    if (operatorId === targetId) {
      throw new BadRequestException('不能修改自己的角色或状态')
    }
    const target = await this.prisma.user.findUnique({ where: { id: targetId } })
    if (!target) throw new NotFoundException('用户不存在')

    await this.prisma.user.update({
      where: { id: targetId },
      data: {
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    })

    if (dto.role !== undefined) {
      await this.audit.record(
        'admin',
        'update',
        operatorId,
        dto.role === 'admin'
          ? `管理员把「${target.nickname}」升为管理员`
          : `管理员把「${target.nickname}」降为普通用户`,
      )
    }
    if (dto.status !== undefined) {
      await this.audit.record(
        'admin',
        'security',
        operatorId,
        dto.status === 'disabled'
          ? `管理员停用了「${target.nickname}」的账号`
          : `管理员启用了「${target.nickname}」的账号`,
      )
    }
    return { ok: true }
  }

  /** 重置密码:管理员设置新密码(前端支持随机生成),落安全日志;禁自重置(自己走个人中心改密) */
  async resetPassword(operatorId: string, targetId: string, dto: AdminResetPasswordDto) {
    if (operatorId === targetId) {
      throw new BadRequestException('不能重置自己的密码,请在个人中心修改')
    }
    const target = await this.prisma.user.findUnique({ where: { id: targetId } })
    if (!target) throw new NotFoundException('用户不存在')

    const passwordHash = await bcrypt.hash(dto.password, 10)
    await this.prisma.user.update({ where: { id: targetId }, data: { passwordHash } })
    await this.audit.record(
      'admin',
      'security',
      operatorId,
      `管理员重置了「${target.nickname}」的登录密码`,
    )
    return { ok: true }
  }

  /* ───────────────────────── 系统日志 ───────────────────────── */

  /** 日志分页:时间倒序;operatorId 联表出昵称/头像(前端列表展示) */
  async listLogs(query: QueryLogsDto) {
    const page = Math.max(1, Number(query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20))

    const where: Prisma.AdminLogWhereInput = {
      ...(query.module ? { module: query.module } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.operatorId ? { operatorId: query.operatorId } : {}),
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.adminLog.count({ where }),
      this.prisma.adminLog.findMany({
        where,
        orderBy: { time: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { operator: { select: { id: true, nickname: true, avatar: true } } },
      }),
    ])

    return {
      total,
      page,
      pageSize,
      items: rows.map((r) => ({
        id: r.id,
        time: fmtDateTime(r.time),
        moduleId: r.module,
        action: r.action,
        operatorId: r.operatorId,
        summary: r.summary,
        operator: r.operator,
      })),
    }
  }

  /* ───────────────────────── 邀请码管理 ───────────────────────── */

  async listAllInvites() {
    const rows = await this.prisma.inviteCode.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        creator: { select: { id: true, nickname: true, avatar: true } },
        usedBy: { select: { id: true, nickname: true, avatar: true } },
      },
    })
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      createdAt: fmtDateTime(r.createdAt),
      usedAt: r.usedAt ? fmtDateTime(r.usedAt) : null,
      creator: r.creator,
      usedBy: r.usedBy,
    }))
  }

  async createInvite(operatorId: string) {
    const code = await this.generateUniqueCode()
    const row = await this.prisma.inviteCode.create({ data: { code, creatorId: operatorId } })
    await this.audit.record('admin', 'create', operatorId, `管理员生成了邀请码 ${code}`)
    return { id: row.id, code: row.code, createdAt: fmtDateTime(row.createdAt), usedAt: null }
  }

  private async generateUniqueCode(): Promise<string> {
    const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
    for (let attempt = 0; attempt < 10; attempt++) {
      let code = ''
      for (let i = 0; i < 8; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
      const exists = await this.prisma.inviteCode.findUnique({ where: { code } })
      if (!exists) return code
    }
    throw new BadRequestException('邀请码生成失败,请重试')
  }

  /* ───────────────────────── 数据概览 ───────────────────────── */

  /**
   * 概览统计:只统计系统资源(用户/账本/日志),不含流水与收支金额(2026-09-10 口径)。
   * 近 7 日趋势按自然日聚合;最近 8 条操作带操作人信息。
   */
  async dashboard() {
    const [userCount, bookCount, logCount, activeCount, disabledCount, adminCount] =
      await this.prisma.$transaction([
        this.prisma.user.count(),
        this.prisma.book.count(),
        this.prisma.adminLog.count(),
        this.prisma.user.count({ where: { status: 'active' } }),
        this.prisma.user.count({ where: { status: 'disabled' } }),
        this.prisma.user.count({ where: { role: 'admin' } }),
      ])

    // 近 7 日(含今日)每日日志数
    const days: { date: string; label: string; count: number }[] = []
    const today = new Date()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate())
      const end = new Date(start)
      end.setDate(start.getDate() + 1)
      const count = await this.prisma.adminLog.count({ where: { time: { gte: start, lt: end } } })
      const p = (n: number) => (n < 10 ? '0' + n : '' + n)
      days.push({
        date: `${start.getFullYear()}-${p(start.getMonth() + 1)}-${p(start.getDate())}`,
        label: `${start.getMonth() + 1}/${start.getDate()}`,
        count,
      })
    }

    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const [logTodayCount, logSecurityCount] = await this.prisma.$transaction([
      this.prisma.adminLog.count({ where: { time: { gte: todayStart } } }),
      this.prisma.adminLog.count({ where: { action: 'security' } }),
    ])

    const latest = await this.prisma.adminLog.findMany({
      orderBy: { time: 'desc' },
      take: 8,
      include: { operator: { select: { id: true, nickname: true, avatar: true } } },
    })

    return {
      userCount,
      adminCount,
      activeCount,
      disabledCount,
      bookCount,
      logCount,
      logTodayCount,
      logSecurityCount,
      logCountByDay: days,
      latestLogs: latest.map((r) => ({
        id: r.id,
        time: fmtDateTime(r.time),
        moduleId: r.module,
        action: r.action,
        operatorId: r.operatorId,
        summary: r.summary,
        operator: r.operator,
      })),
    }
  }
}
