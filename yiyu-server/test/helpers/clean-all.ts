import type { PrismaService } from '../../src/prisma/prisma.service'

/**
 * e2e 公共清理:按 username 前缀清掉本套测试可能造下的一切数据(用户/账本/流水/码/日志)。
 * 幂等可重入,beforeAll/afterAll 都调用,保证顺序依赖不受历史运行残留影响。
 */
export async function cleanAll(prisma: PrismaService, usernamePrefix: string) {
  const users = await prisma.user.findMany({
    where: { username: { startsWith: usernamePrefix } },
    select: { id: true },
  })
  const ids = users.map((u) => u.id)
  if (ids.length > 0) {
    await prisma.adminLog.deleteMany({ where: { operatorId: { in: ids } } })
    await prisma.transaction.deleteMany({ where: { userId: { in: ids } } })
    await prisma.category.deleteMany({ where: { ownerId: { in: ids } } })
    await prisma.book.deleteMany({ where: { userId: { in: ids } } })
    await prisma.inviteCode.deleteMany({ where: { OR: [{ creatorId: { in: ids } }, { usedById: { in: ids } }] } })
    await prisma.user.deleteMany({ where: { id: { in: ids } } })
  }
  await prisma.inviteCode.deleteMany({ where: { code: { startsWith: 'E2E' } } })
}
