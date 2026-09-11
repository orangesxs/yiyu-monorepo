import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'

/** 广场应用卡摘要(与前端卡片展示字段对齐) */
export interface PortalSummaryVo {
  apps: {
    ledger: {
      /** 默认账本名/图标(无账本时空串,前端显示占位) */
      bookName: string
      bookIcon: string
      /** 当月支出/收入/结余(默认账本) */
      monthExpense: number
      monthIncome: number
      monthBalance: number
    }
  }
}

/**
 * 广场门户聚合:只服务门户卡片,不承载应用内数据
 * (books/categories/transactions 由进应用时 ledger 模块自己的接口提供)。
 */
@Injectable()
export class PortalService {
  constructor(private prisma: PrismaService) {}

  async summary(userId: string): Promise<PortalSummaryVo> {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const book = await this.prisma.book.findFirst({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      include: {
        transactions: {
          where: { date: { gte: monthStart } },
          select: { type: true, amount: true },
        },
      },
    })

    if (!book) {
      return { apps: { ledger: { bookName: '', bookIcon: '', monthExpense: 0, monthIncome: 0, monthBalance: 0 } } }
    }

    let expense = new Prisma.Decimal(0)
    let income = new Prisma.Decimal(0)
    for (const t of book.transactions) {
      if (t.type === 'expense') expense = expense.add(t.amount)
      else income = income.add(t.amount)
    }

    return {
      apps: {
        ledger: {
          bookName: book.name,
          bookIcon: book.icon,
          monthExpense: Number(expense.toFixed(2)),
          monthIncome: Number(income.toFixed(2)),
          monthBalance: Number(income.minus(expense).toFixed(2)),
        },
      },
    }
  }
}
