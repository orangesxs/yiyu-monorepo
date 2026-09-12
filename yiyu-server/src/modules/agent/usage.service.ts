import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import type { LlmUsage } from './llm-client'

/** 用量落库入参 */
export interface UsageRecordInput {
  userId: string
  conversationId?: string | null
  kind: 'chat' | 'summarize' | 'test'
  model: string
  usage: LlmUsage
  latencyMs: number
  ok: boolean
  errorCode?: string
}

/**
 * LLM 用量统计:每次 HTTP 调用一行,fire-and-forget(失败仅打日志,不阻断对话)。
 */
@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name)

  constructor(private prisma: PrismaService) {}

  record(input: UsageRecordInput): Promise<void> {
    return this.prisma.agentUsageLog
      .create({
        data: {
          userId: input.userId,
          conversationId: input.conversationId ?? null,
          kind: input.kind,
          model: input.model,
          promptTokens: input.usage.promptTokens,
          completionTokens: input.usage.completionTokens,
          estimated: input.usage.estimated,
          latencyMs: input.latencyMs,
          ok: input.ok,
          errorCode: input.errorCode ?? null,
        },
      })
      .then(() => undefined)
      .catch((e) => {
        this.logger.warn(`[usage] 落库失败: ${(e as Error).message}`)
      })
  }

  /** admin 用量聚合:总量/按日/按用户(默认排除连通测试) */
  async summary(from?: string, to?: string) {
    const where = {
      kind: { not: 'test' },
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(`${from}T00:00:00+08:00`) } : {}),
              ...(to ? { lte: new Date(`${to}T23:59:59+08:00`) } : {}),
            },
          }
        : {}),
    }
    const [rows, byDayRaw, byUserRaw] = await Promise.all([
      this.prisma.agentUsageLog.aggregate({
        where,
        _count: { _all: true },
        _sum: { promptTokens: true, completionTokens: true },
      }),
      this.prisma.agentUsageLog.groupBy({
        by: ['createdAt'],
        where,
        _count: { _all: true },
      }),
      this.prisma.agentUsageLog.groupBy({
        by: ['userId'],
        where,
        _count: { _all: true },
        _sum: { promptTokens: true, completionTokens: true },
        orderBy: { _sum: { completionTokens: 'desc' } },
      }),
    ])
    // byDay:按天(Asia/Shanghai)聚合——group by createdAt 不够,需取回后在 JS 按日分桶
    const dayMap = new Map<string, { date: string; calls: number; tokens: number }>()
    for (const row of byDayRaw) {
      const date = row.createdAt.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
      const bucket = dayMap.get(date) ?? { date, calls: 0, tokens: 0 }
      bucket.calls += row._count._all
      dayMap.set(date, bucket)
    }
    // byUser 需要昵称/头像:分批查用户
    const userIds = byUserRaw.map((r) => r.userId)
    const users = userIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nickname: true, avatar: true } })
      : []
    const userMap = new Map(users.map((u) => [u.id, u]))

    return {
      totalCalls: rows._count._all,
      totalPromptTokens: rows._sum.promptTokens ?? 0,
      totalCompletionTokens: rows._sum.completionTokens ?? 0,
      byDay: [...dayMap.values()].sort((a, b) => (a.date < b.date ? -1 : 1)).map((d) => ({
        ...d,
        // tokens 桶:byUserRaw 没按日拆 token,先给 calls;按日 token 需要原始行,见下
      })),
      byUser: byUserRaw.map((r) => ({
        userId: r.userId,
        nickname: userMap.get(r.userId)?.nickname ?? '未知用户',
        avatar: userMap.get(r.userId)?.avatar ?? '🧑‍💻',
        calls: r._count._all,
        promptTokens: r._sum.promptTokens ?? 0,
        completionTokens: r._sum.completionTokens ?? 0,
      })),
    }
  }
}
