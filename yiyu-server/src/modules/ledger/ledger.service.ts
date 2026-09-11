import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { AuditService } from '../../common/audit/audit.service'
import { fmtDate, fmtDateTime, parseDateTime } from '../../common/utils/datetime'
import type {
  CreateBookDto,
  CreateCategoryDto,
  CreateTransactionDto,
  QueryTransactionsDto,
  UpdateTransactionDto,
} from './dto/ledger.dto'

/** 与前端 Book 接口对齐(monthExpense 实时算) */
export interface BookVo {
  id: string
  name: string
  icon: string
  monthExpense: number
  isDefault: boolean
}

/** 与前端 Category 接口对齐(ownerId 非空即 custom) */
export interface CategoryVo {
  id: string
  name: string
  icon: string
  children: { id: string; name: string }[]
  custom?: boolean
}

/** 与前端 Transaction 接口对齐(date 序列化为 YYYY-MM-DD HH:mm) */
export interface TransactionVo {
  id: string
  type: string
  amount: number
  categoryId: string
  categoryName: string
  bookId: string
  date: string
  note?: string | null
}

/** 分页结果(与 /admin/logs 同构) */
export interface PageVo<T> {
  total: number
  page: number
  pageSize: number
  items: T[]
}

/** 报表聚合结果(区间内,单账本) */
export interface ReportVo {
  /** 区间收支总计 */
  stats: { income: number; expense: number; balance: number; count: number }
  /** 按日聚合(仅区间 ≤ 92 天时返回,周/月报表用) */
  daily: { date: string; income: number; expense: number }[]
  /** 按月聚合(区间 ≤ 10 年时返回,年报表用) */
  monthly: { month: string; income: number; expense: number }[]
  /** 分类聚合(按根分类,支出/收入各自倒序) */
  categories: {
    expense: { name: string; value: number }[]
    income: { name: string; value: number }[]
  }
}

@Injectable()
export class LedgerService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /* ───────────────────────── 账本 ───────────────────────── */

  /** 我的账本列表(含当月支出实时聚合) */
  async listBooks(userId: string): Promise<BookVo[]> {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const books = await this.prisma.book.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      include: {
        transactions: {
          where: { type: 'expense', date: { gte: monthStart } },
          select: { amount: true },
        },
      },
    })
    return books.map((b) => ({
      id: b.id,
      name: b.name,
      icon: b.icon,
      monthExpense: Number(
        b.transactions.reduce((s, t) => s.add(t.amount), new Prisma.Decimal(0)).toFixed(2),
      ),
      isDefault: b.isDefault,
    }))
  }

  async createBook(userId: string, dto: CreateBookDto): Promise<BookVo> {
    const book = await this.prisma.book.create({
      data: { userId, name: dto.name, icon: dto.icon },
    })
    await this.audit.record('ledger', 'create', userId, `新建了账本「${dto.name}」`)
    return { id: book.id, name: book.name, icon: book.icon, monthExpense: 0, isDefault: false }
  }

  /** 归属校验:确保 bookId 属于当前用户 */
  private async ownedBook(userId: string, bookId: string) {
    const book = await this.prisma.book.findUnique({ where: { id: bookId } })
    if (!book) throw new NotFoundException('账本不存在')
    if (book.userId !== userId) throw new ForbiddenException('无权访问该账本')
    return book
  }

  /* ───────────────────────── 分类 ───────────────────────── */

  /** 分类树:预置(ownerId null)+ 我的自定义;带 type 返回单套,省略 type 一次返回两套 */
  async listCategories(
    userId: string,
    type?: 'expense' | 'income',
  ): Promise<CategoryVo[] | { expense: CategoryVo[]; income: CategoryVo[] }> {
    if (!type) {
      const [expense, income] = await Promise.all([
        this.listCategories(userId, 'expense') as Promise<CategoryVo[]>,
        this.listCategories(userId, 'income') as Promise<CategoryVo[]>,
      ])
      return { expense, income }
    }
    const rows = await this.prisma.category.findMany({
      where: {
        parentId: null,
        OR: [{ ownerId: null }, { ownerId: userId }],
        ...(type ? { type } : {}),
      },
      orderBy: [{ ownerId: 'asc' }, { createdAt: 'asc' }], // 预置在前
      include: { children: { orderBy: { createdAt: 'asc' } } },
    })
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      custom: c.ownerId !== null || undefined,
      children: c.children.map((ch) => ({ id: ch.id, name: ch.name })),
    }))
  }

  /** 新增自定义分类(根级,同名去重:同 type 下预置+自定义都不许重名) */
  async createCategory(userId: string, dto: CreateCategoryDto): Promise<CategoryVo> {
    const dup = await this.prisma.category.findFirst({
      where: {
        parentId: null,
        type: dto.type,
        name: dto.name,
        OR: [{ ownerId: null }, { ownerId: userId }],
      },
    })
    if (dup) throw new BadRequestException('该分类名已存在')

    const row = await this.prisma.category.create({
      data: { ownerId: userId, type: dto.type, name: dto.name, icon: dto.icon || '🏷️' },
    })
    await this.audit.record('ledger', 'create', userId, `新增了自定义分类「${dto.name}」`)
    return { id: row.id, name: row.name, icon: row.icon, custom: true, children: [] }
  }

  /** 删除自定义分类(仅 custom;其下流水靠 categoryName 冗余兜底展示) */
  async removeCategory(userId: string, id: string) {
    const cat = await this.prisma.category.findUnique({ where: { id } })
    if (!cat) throw new NotFoundException('分类不存在')
    if (cat.ownerId !== userId) throw new ForbiddenException('只能删除自己的自定义分类')

    // 子分类一并断开(置 categoryId null,categoryName 已冗余)
    await this.prisma.transaction.updateMany({
      where: { categoryId: id },
      data: { categoryId: null },
    })
    await this.prisma.category.deleteMany({ where: { parentId: id } })
    await this.prisma.category.delete({ where: { id } })

    await this.audit.record('ledger', 'delete', userId, `删除了自定义分类「${cat.name}」`)
    return { ok: true }
  }

  /**
   * 校验分类可用并派生 categoryName(服务端唯一事实源,不信任客户端)。
   * 预置分类(ownerId null)任何人可用;自定义分类仅属主可用;type 必须与流水一致。
   */
  private async resolveCategory(userId: string, categoryId: string, type: string) {
    const cat = await this.prisma.category.findUnique({ where: { id: categoryId } })
    if (!cat) throw new BadRequestException('分类不存在')
    if (cat.ownerId !== null && cat.ownerId !== userId) {
      throw new ForbiddenException('无权使用他人的自定义分类')
    }
    if (cat.type !== type) throw new BadRequestException('分类与流水类型不匹配')
    return cat
  }

  /* ───────────────────────── 流水 ───────────────────────── */

  /** 流水列表:分页 + from/to 区间 + type/categoryId/keyword 筛选,按时间倒序 */
  async listTransactions(
    userId: string,
    query: QueryTransactionsDto,
  ): Promise<PageVo<TransactionVo>> {
    if (!query.bookId) throw new BadRequestException('缺少 bookId 参数')
    await this.ownedBook(userId, query.bookId)

    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const fromDate = query.from ? this.parseYmd(query.from, 'from') : null
    const toDate = query.to ? this.endOfDay(this.parseYmd(query.to, 'to')) : null
    const where: Prisma.TransactionWhereInput = {
      userId,
      bookId: query.bookId,
      ...(fromDate || toDate
        ? { date: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } }
        : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.keyword ? { note: { contains: query.keyword } } : {}),
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.findMany({
        where,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])
    return { total, page, pageSize, items: rows.map(this.toTxVo) }
  }

  /** 记一笔:归属校验 + 分类校验 + categoryName 服务端派生 */
  async createTransaction(userId: string, dto: CreateTransactionDto): Promise<TransactionVo> {
    const bookId = dto.bookId
    if (!bookId) throw new BadRequestException('缺少账本')
    await this.ownedBook(userId, bookId)

    const cat = await this.resolveCategory(userId, dto.categoryId, dto.type)
    const date = this.parseDateTimeOr400(dto.date)

    const row = await this.prisma.transaction.create({
      data: {
        userId,
        bookId,
        type: dto.type,
        amount: dto.amount,
        categoryId: cat.id,
        categoryName: cat.name,
        date,
        note: dto.note || null,
      },
    })
    await this.audit.record(
      'ledger',
      'create',
      userId,
      `记了一笔${dto.type === 'expense' ? '支出' : '收入'}「${dto.note || cat.name} · ¥${dto.amount.toFixed(2)}」`,
    )
    return this.toTxVo(row)
  }

  async updateTransaction(userId: string, id: string, dto: UpdateTransactionDto): Promise<TransactionVo> {
    const tx = await this.ownedTransaction(userId, id)

    let categoryId = tx.categoryId
    let categoryName = tx.categoryName
    if (dto.categoryId !== undefined) {
      const cat = await this.resolveCategory(userId, dto.categoryId, dto.type ?? tx.type)
      categoryId = cat.id
      categoryName = cat.name
    }

    if (dto.bookId !== undefined && dto.bookId !== tx.bookId) {
      await this.ownedBook(userId, dto.bookId)
    }

    const date = dto.date !== undefined ? this.parseDateTimeOr400(dto.date) : undefined

    const row = await this.prisma.transaction.update({
      where: { id },
      data: {
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        categoryId,
        categoryName,
        ...(date !== undefined ? { date } : {}),
        ...(dto.note !== undefined ? { note: dto.note || null } : {}),
        ...(dto.bookId !== undefined ? { bookId: dto.bookId } : {}),
      },
    })
    await this.audit.record('ledger', 'update', userId, `修改了流水「${tx.note || tx.categoryName}」`)
    return this.toTxVo(row)
  }

  async removeTransaction(userId: string, id: string) {
    const tx = await this.ownedTransaction(userId, id)
    await this.prisma.transaction.delete({ where: { id } })
    await this.audit.record('ledger', 'delete', userId, `删除了流水「${tx.note || tx.categoryName}」`)
    return { ok: true }
  }

  private async ownedTransaction(userId: string, id: string) {
    const tx = await this.prisma.transaction.findUnique({ where: { id } })
    if (!tx) throw new NotFoundException('流水不存在')
    if (tx.userId !== userId) throw new ForbiddenException('无权操作该流水')
    return tx
  }

  /* ───────────────────────── 报表聚合 ───────────────────────── */

  /**
   * 区间报表聚合(服务端计算,前端不再拉全量流水自算)。
   * from/to 为 'YYYY-MM-DD';按日聚合限 92 天、按月聚合限 10 年,防拉宽区间打爆响应。
   */
  async reports(
    userId: string,
    query: { bookId: string; from: string; to: string },
  ): Promise<ReportVo> {
    if (!query.bookId || !query.from || !query.to) {
      throw new BadRequestException('缺少 bookId/from/to 参数')
    }
    await this.ownedBook(userId, query.bookId)
    const from = this.parseYmd(query.from, 'from')
    const to = this.endOfDay(this.parseYmd(query.to, 'to'))
    const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1
    if (days <= 0) throw new BadRequestException('from 不能晚于 to')
    if (days > 3660) throw new BadRequestException('区间最长 10 年')

    const rows = await this.prisma.transaction.findMany({
      where: { userId, bookId: query.bookId, date: { gte: from, lte: to } },
      select: { type: true, amount: true, categoryId: true, categoryName: true, date: true },
      orderBy: { date: 'asc' },
    })

    const zero = new Prisma.Decimal(0)
    let income = zero
    let expense = zero
    const byDay = new Map<string, { income: Prisma.Decimal; expense: Prisma.Decimal }>()
    const byMonth = new Map<string, { income: Prisma.Decimal; expense: Prisma.Decimal }>()
    for (const t of rows) {
      const day = fmtDate(t.date)
      const month = day.slice(0, 7)
      if (!byDay.has(day)) byDay.set(day, { income: zero, expense: zero })
      if (!byMonth.has(month)) byMonth.set(month, { income: zero, expense: zero })
      const d = byDay.get(day)!
      const m = byMonth.get(month)!
      if (t.type === 'income') {
        income = income.add(t.amount)
        byDay.set(day, { income: d.income.add(t.amount), expense: d.expense })
        byMonth.set(month, { income: m.income.add(t.amount), expense: m.expense })
      } else {
        expense = expense.add(t.amount)
        byDay.set(day, { income: d.income, expense: d.expense.add(t.amount) })
        byMonth.set(month, { income: m.income, expense: m.expense.add(t.amount) })
      }
    }

    // 分类聚合:子分类归并到根分类(预置树在 service 内查询)
    const cats = await this.prisma.category.findMany({
      where: { parentId: null, OR: [{ ownerId: null }, { ownerId: userId }] },
      include: { children: { select: { id: true } } },
    })
    const childToRoot = new Map<string, string>()
    for (const c of cats) {
      for (const ch of c.children) childToRoot.set(ch.id, c.name)
    }
    const byCatExpense = new Map<string, Prisma.Decimal>()
    const byCatIncome = new Map<string, Prisma.Decimal>()
    for (const t of rows) {
      const rootName = (t.categoryId ? childToRoot.get(t.categoryId) : undefined) ?? t.categoryName
      const pool = t.type === 'income' ? byCatIncome : byCatExpense
      pool.set(rootName, (pool.get(rootName) ?? zero).add(t.amount))
    }
    const toSorted = (m: Map<string, Prisma.Decimal>) =>
      [...m.entries()]
        .map(([name, v]) => ({ name, value: Number(v.toFixed(2)) }))
        .sort((a, b) => b.value - a.value)

    const round = (d: Prisma.Decimal) => Number(d.toFixed(2))
    return {
      stats: {
        income: round(income),
        expense: round(expense),
        balance: round(income.sub(expense)),
        count: rows.length,
      },
      daily:
        days <= 92
          ? [...byDay.entries()].map(([date, v]) => ({
              date,
              income: round(v.income),
              expense: round(v.expense),
            }))
          : [],
      monthly: [...byMonth.entries()].map(([month, v]) => ({
        month,
        income: round(v.income),
        expense: round(v.expense),
      })),
      categories: { expense: toSorted(byCatExpense), income: toSorted(byCatIncome) },
    }
  }

  /* ───────────────────────── 工具 ───────────────────────── */

  private parseYmd(s: string, field: string): Date {
    const d = parseDateTime(s)
    if (!d) throw new BadRequestException(`${field} 格式应为 YYYY-MM-DD`)
    return d
  }

  private endOfDay(d: Date): Date {
    const e = new Date(d)
    e.setHours(23, 59, 59, 999)
    return e
  }

  private parseDateTimeOr400(s: string): Date {
    const d = parseDateTime(s)
    if (!d) throw new BadRequestException('时间格式应为 YYYY-MM-DD HH:mm')
    return d
  }

  private toTxVo(t: {
    id: string
    type: string
    amount: any
    categoryId: string | null
    categoryName: string
    bookId: string
    date: Date
    note: string | null
  }): TransactionVo {
    return {
      id: t.id,
      type: t.type,
      amount: Number(t.amount),
      categoryId: t.categoryId ?? '',
      categoryName: t.categoryName,
      bookId: t.bookId,
      date: fmtDateTime(t.date),
      note: t.note,
    }
  }
}
