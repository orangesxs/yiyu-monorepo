import { Injectable, OnModuleInit } from '@nestjs/common'
import { SkillRegistry, type SkillDefinition } from '../skill-registry'
import { LedgerService } from '../../ledger/ledger.service'
import { nowStr } from '../../../common/utils/datetime'

/**
 * ledger 技能组:查流水/查报表(低)/记一笔(中)/改备注(中)/删流水(高)。
 * handler 直接函数调用 LedgerService(权限校验内聚其中,传 user.id 即继承)。
 */
@Injectable()
export class SkillsLedger implements OnModuleInit {
  constructor(
    private registry: SkillRegistry,
    private ledger: LedgerService,
  ) {}

  onModuleInit() {
    this.registry.register(...this.definitions())
  }

  /** 账本 id 短码化:LLM 上下文里给 6 位前缀,handler 内前缀匹配回真实 id */
  private async resolveBook(userId: string, bookIdShort?: string) {
    const books = await this.ledger.listBooks(userId)
    if (books.length === 0) throw new Error('你还没有账本,请先在记账本里创建')
    if (!bookIdShort) return books.find((b) => b.isDefault) ?? books[0]
    return books.find((b) => b.id.startsWith(bookIdShort)) ?? books.find((b) => b.isDefault) ?? books[0]
  }

  /** 分类智能匹配:按名精确 → 子分类名 → 根分类名(返回 categoryId;LLM 传名或 id 均可) */
  private async resolveCategory(userId: string, type: 'expense' | 'income', nameOrId: string) {
    const tree = (await this.ledger.listCategories(userId, type)) as {
      id: string
      name: string
      children: { id: string; name: string }[]
    }[]
    const byId = (id: string) => {
      for (const root of tree) {
        if (root.id === id) return root
        const child = root.children.find((c) => c.id === id)
        if (child) return { ...root, children: [], name: child.name, id: child.id }
      }
      return null
    }
    if (/^[a-z0-9]{20,}$/i.test(nameOrId)) {
      const hit = byId(nameOrId)
      if (hit) return hit
    }
    const exact = (n: string) => {
      for (const root of tree) {
        if (root.name === n) return root
        const child = root.children.find((c) => c.name === n)
        if (child) return { ...root, children: [], name: child.name, id: child.id }
      }
      return null
    }
    return exact(nameOrId) ?? exact(nameOrId.replace(/[的了的]/g, '')) ?? null
  }

  /** 条件唯一定位一笔流水(keyword+amount±dateHint 或 transactionId);拿不到唯一结果时返回错误文案 */
  private async locateTransaction(
    userId: string,
    cond: { keyword?: string; amount?: number; dateHint?: string; transactionId?: string },
  ): Promise<{ id?: string; tx?: { id: string; date: string; categoryName: string; amount: number; note: string | null }; err?: string }> {
    if (cond.transactionId) {
      if (cond.transactionId.length !== 25) {
        return { err: 'transactionId 无效(应为 25 位完整 id),请改用 keyword+amount 条件定位或重新查询拿完整 id' }
      }
      // 按 id 精确查:拉一年内流水找 id(个人系统数据量小,一页拉够)
      const all = await this.ledger.listTransactions(userId, {
        bookId: (await this.defaultBook(userId)).id,
        from: new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10),
        to: new Date().toISOString().slice(0, 10),
        page: 1,
        pageSize: 100,
      })
      const hit = all.items.find((t) => t.id === cond.transactionId)
      if (!hit) return { err: '该流水不存在(可能已被删除),请重新查询' }
      return { id: hit.id, tx: { id: hit.id, date: hit.date, categoryName: hit.categoryName, amount: hit.amount, note: hit.note ?? null } }
    }
    if (!cond.keyword && cond.amount === undefined) {
      return { err: '请提供 transactionId(完整 25 位)或 keyword+amount 条件来定位流水' }
    }
    const book = await this.defaultBook(userId)
    const from = cond.dateHint ?? new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
    const to = cond.dateHint ?? new Date().toISOString().slice(0, 10)
    const res = await this.ledger.listTransactions(userId, {
      bookId: book.id,
      from,
      to,
      page: 1,
      pageSize: 100,
      ...(cond.keyword ? { keyword: cond.keyword } : {}),
    })
    let hits = res.items
    if (cond.amount !== undefined) {
      // 金额模糊容差:精确 | ±0.5 | 取整相等("25" 匹配 25.50)
      hits = hits.filter((t) =>
        Math.abs(t.amount - cond.amount!) < 0.005 ||
        Math.abs(t.amount - cond.amount!) <= 0.5 ||
        Math.round(t.amount) === Math.round(cond.amount!),
      )
    }
    const describe = (t: { date: string; categoryName: string; amount: number; note?: string | null }): string =>
      `${t.date.slice(5, 16)} ${t.categoryName} ¥${t.amount.toFixed(2)}${t.note ? `(${t.note})` : ''}`
    if (hits.length === 1) return { id: hits[0].id, tx: { id: hits[0].id, date: hits[0].date, categoryName: hits[0].categoryName, amount: hits[0].amount, note: hits[0].note ?? null } }
    if (hits.length === 0) {
      // 列出最近几笔给 LLM 参考,让它能向用户转述并确认
      const recent = res.items.slice(0, 5).map(describe).join(';')
      return { err: `按条件(${cond.keyword ?? ''}${cond.amount ? ` ¥${cond.amount}` : ''}${cond.dateHint ? ` ${cond.dateHint}` : ''})没找到流水。最近流水有:${recent || '无'}。请根据用户描述对照这些数据重试或向用户确认` }
    }
    const list = hits.slice(0, 5).map(describe).join(';')
    return { err: `按条件匹配到 ${hits.length} 笔流水,无法唯一定位:${list}。请向用户确认要操作哪一笔` }
  }

  private async defaultBook(userId: string) {
    const books = await this.ledger.listBooks(userId)
    const book = books.find((b) => b.isDefault) ?? books[0]
    if (!book) throw new Error('你还没有账本,请先在记账本里创建')
    return book
  }

  private definitions(): SkillDefinition[] {
    const listTransactions: SkillDefinition = {
      id: 'ledger.list_transactions',
      group: 'ledger',
      name: 'ledger_list_transactions',
      label: '查流水',
      description: '查询用户的流水列表(按时间倒序)。参数:bookIdShort(账本id前缀,缺省默认账本)、from/to(日期格式 YYYY-MM-DD,缺省近30天)、type(expense/income,可选)、keyword(备注关键词,可选)、page(页码,缺省1)。每页10条。返回的每行带 id,删除/改备注等后续操作直接使用该 id。',
      risk: 'low',
      parameters: {
        type: 'object',
        properties: {
          bookIdShort: { type: 'string', description: '账本 id 前缀(上下文中"我的账本"里给的前 6 位),缺省用默认账本' },
          from: { type: 'string', description: '起始日期 YYYY-MM-DD' },
          to: { type: 'string', description: '结束日期 YYYY-MM-DD' },
          type: { type: 'string', enum: ['expense', 'income'] },
          keyword: { type: 'string', description: '备注关键词' },
          page: { type: 'number', description: '页码,默认 1' },
        },
      },
      handler: async (userId, args) => {
        const book = await this.resolveBook(userId, args.bookIdShort as string | undefined)
        const now = new Date()
        const to = (args.to as string) ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        const fromDefault = new Date(now.getTime() - 30 * 86400000)
        const from = (args.from as string) ?? `${fromDefault.getFullYear()}-${String(fromDefault.getMonth() + 1).padStart(2, '0')}-${String(fromDefault.getDate()).padStart(2, '0')}`
        const page = Math.max(1, Number(args.page ?? 1))
        const res = await this.ledger.listTransactions(userId, {
          bookId: book.id,
          from,
          to,
          ...(args.type ? { type: args.type as 'expense' | 'income' } : {}),
          ...(args.keyword ? { keyword: String(args.keyword) } : {}),
          page,
          pageSize: 10,
        })
        const rows = res.items.map((t) => ({
          id: t.id,
          type: t.type,
          amount: t.amount,
          category: t.categoryName,
          date: t.date,
          note: t.note ?? '',
        }))
        return {
          ok: true,
          summary: `查到 ${res.total} 笔流水(「${book.name}」),第 ${res.page} 页展示 ${rows.length} 笔`,
          llmData: {
            total: res.total,
            page: res.page,
            items: rows.slice(0, 8).map((r) => ({
              id: r.id,
              text: `${r.date} ${r.type === 'expense' ? '支出' : '收入'} ¥${r.amount.toFixed(2)} ${r.category}${r.note ? `(${r.note})` : ''}`,
            })),
          },
          card: {
            cardType: 'ledger.tx_table',
            title: `「${book.name}」流水 · 共 ${res.total} 笔`,
            data: { rows, page: res.page, pageSize: res.pageSize, total: res.total, filters: { from, to, type: args.type ?? null, keyword: args.keyword ?? null } },
          },
        }
      },
    }

    const reports: SkillDefinition = {
      id: 'ledger.reports',
      group: 'ledger',
      name: 'ledger_reports',
      label: '查报表',
      description: '查询收支统计聚合(总计/分类占比)。"这个月花了多少""各分类支出"类问题用它。参数:bookIdShort(缺省默认账本)、from/to(日期格式 YYYY-MM-DD,缺省本月)。',
      risk: 'low',
      parameters: {
        type: 'object',
        properties: {
          bookIdShort: { type: 'string' },
          from: { type: 'string', description: 'YYYY-MM-DD,缺省本月 1 号' },
          to: { type: 'string', description: 'YYYY-MM-DD,缺省今天' },
        },
      },
      handler: async (userId, args) => {
        const book = await this.resolveBook(userId, args.bookIdShort as string | undefined)
        const now = new Date()
        const to = (args.to as string) ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        const from = (args.from as string) ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
        const r = await this.ledger.reports(userId, { bookId: book.id, from, to })
        const top = r.categories.expense.slice(0, 5)
        return {
          ok: true,
          summary: `「${book.name}」${from}~${to}:支出 ¥${r.stats.expense.toFixed(2)}、收入 ¥${r.stats.income.toFixed(2)}、${r.stats.count} 笔;支出 Top:${top.map((c) => `${c.name} ¥${c.value.toFixed(2)}`).join('、') || '无'}`,
          llmData: { stats: r.stats, expenseTop: top },
          card: {
            cardType: 'ledger.report',
            title: `「${book.name}」收支 · ${from} ~ ${to}`,
            data: { stats: r.stats, categories: { expense: r.categories.expense.slice(0, 8), income: r.categories.income.slice(0, 8) }, from, to },
          },
        }
      },
    }

    const createTransaction: SkillDefinition = {
      id: 'ledger.create_transaction',
      group: 'ledger',
      name: 'ledger_create_transaction',
      label: '记一笔',
      description: '记一笔流水(执行前用户会确认)。参数:type(expense 或 income)、amount(数字,大于0)、category(分类名或id,从上下文"我的分类"里选,语义就近:如"午饭"→午餐)、date(时间格式 YYYY-MM-DD HH:mm,缺省现在)、note(备注,可选)、bookIdShort(缺省默认账本)。金额必须来自用户原话,禁止自行修改。',
      risk: 'medium',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['expense', 'income'] },
          amount: { type: 'number' },
          category: { type: 'string', description: '分类名(如"午餐")或分类 id' },
          date: { type: 'string' },
          note: { type: 'string' },
          bookIdShort: { type: 'string' },
        },
        required: ['type', 'amount', 'category'],
      },
      preview: (args) => ({
        lines: [
          `${args.type === 'income' ? '收入' : '支出'} ¥${Number(args.amount ?? 0).toFixed(2)}`,
          `分类:${String(args.category ?? '未指定')}`,
          ...(args.date ? [`时间:${String(args.date)}`] : []),
          ...(args.note ? [`备注:${String(args.note)}`] : []),
        ],
      }),
      /** 确认卡生成前:补上目标账本名,让用户看清记到哪 */
      resolve: async (userId, args) => {
        const book = await this.resolveBook(userId, args.bookIdShort as string | undefined)
        const type = args.type === 'income' ? 'income' : 'expense'
        const cat = await this.resolveCategory(userId, type, String(args.category ?? ''))
        return {
          args: { ...args, bookIdShort: book.id.slice(0, 6), category: cat?.name ?? String(args.category ?? '') },
          lines: [
            `${type === 'income' ? '收入' : '支出'} ¥${Number(args.amount ?? 0).toFixed(2)}`,
            `分类:${cat?.name ?? String(args.category ?? '未指定')}`,
            `账本:${book.name}`,
            ...(args.date ? [`时间:${String(args.date)}`] : []),
            ...(args.note ? [`备注:${String(args.note)}`] : []),
          ],
        }
      },
      handler: async (userId, args) => {
        const type = args.type === 'income' ? 'income' : 'expense'
        const amount = Number(args.amount)
        if (!(amount > 0)) return { ok: false, summary: '金额无效', error: { code: 400, message: '金额必须大于 0' } }
        const cat = await this.resolveCategory(userId, type, String(args.category ?? ''))
        if (!cat) return { ok: false, summary: `分类「${String(args.category)}」不存在`, error: { code: 400, message: '未找到该分类,请换一个分类名' } }
        const book = await this.resolveBook(userId, args.bookIdShort as string | undefined)
        const tx = await this.ledger.createTransaction(userId, {
          type,
          amount,
          categoryId: cat.id,
          date: (args.date as string) || nowStr(), // 缺省当前时间,空串会导致服务端 parse 失败
          note: (args.note as string) || undefined,
          bookId: book.id,
        } as never)
        return {
          ok: true,
          summary: `已记一笔${type === 'expense' ? '支出' : '收入'} ¥${amount.toFixed(2)}(${cat.name})到「${book.name}」`,
          card: {
            cardType: 'ledger.tx_created',
            title: '记账成功',
            data: { id: tx.id, type, amount, category: cat.name, date: tx.date, note: args.note ?? '', bookName: book.name },
          },
        }
      },
    }

    const updateNote: SkillDefinition = {
      id: 'ledger.update_transaction_note',
      group: 'ledger',
      name: 'ledger_update_transaction_note',
      label: '改流水备注',
      description: '修改某笔流水的备注(执行前用户会确认)。参数:transactionId(25 位完整 id,原样使用 ledger_list_transactions 结果里 items 的 id,禁止截断拼接)、note(新备注)。',
      risk: 'medium',
      parameters: {
        type: 'object',
        properties: {
          transactionId: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['transactionId', 'note'],
      },
      /** 确认卡生成前:定位流水并展示原备注→新备注 */
      resolve: async (userId, args) => {
        const id = String(args.transactionId ?? '')
        const located = await this.locateTransaction(userId, id.length === 25 ? { transactionId: id } : {})
        if (located.err) return { args, lines: [], error: located.err }
        const tx = located.tx!
        return {
          args: { ...args, transactionId: tx.id },
          lines: [
            `流水:${tx.date} ${tx.categoryName} ¥${tx.amount.toFixed(2)}${tx.note ? `(${tx.note})` : ''}`,
            `新备注:${String(args.note ?? '')}`,
          ],
        }
      },
      preview: (args) => ({ lines: [`新备注:${String(args.note)}`] }),
      handler: async (userId, args) => {
        const id = String(args.transactionId ?? '')
        if (id.length !== 25) {
          return { ok: false, summary: '流水 id 无效', error: { code: 400, message: 'transactionId 无效,请重新发起' } }
        }
        const tx = await this.ledger.updateTransaction(userId, id, { note: String(args.note) })
        return {
          ok: true,
          summary: `已把该笔流水备注改为「${tx.note}」`,
          card: { cardType: 'ledger.tx_updated', title: '修改成功', data: { id: tx.id, note: tx.note, amount: tx.amount, category: tx.categoryName, date: tx.date } },
        }
      },
    }

    const deleteTransaction: SkillDefinition = {
      id: 'ledger.delete_transaction',
      group: 'ledger',
      name: 'ledger_delete_transaction',
      label: '删流水',
      description: '删除一笔流水(高风险,执行前用户会看到这条流水的详情并二次确认,删除后不可恢复)。优先参数:transactionId(25 位完整 id,原样使用 ledger_list_transactions 结果里的 id;id 复制容易出错,若无把握改用条件定位)。条件定位参数:keyword(备注关键词)+amount(金额)+dateHint(日期 YYYY-MM-DD,可选),三者组合能在账本内唯一定位时直接删除。',
      risk: 'high',
      parameters: {
        type: 'object',
        properties: {
          transactionId: { type: 'string', description: '25 位完整流水 id(原样复制查询结果的 id 字段)' },
          keyword: { type: 'string', description: '备注关键词(条件定位用)' },
          amount: { type: 'number', description: '流水金额(条件定位用)' },
          dateHint: { type: 'string', description: '日期 YYYY-MM-DD(条件定位用,可选)' },
        },
      },
      /** 确认卡生成前:先定位到唯一流水,回填 id,卡上展示这笔流水的详情 */
      resolve: async (userId, args) => {
        let tx: { id: string; date: string; categoryName: string; amount: number; note: string | null } | null = null
        if (args.transactionId && String(args.transactionId).length === 25) {
          const located = await this.locateTransaction(userId, { transactionId: String(args.transactionId) })
          if (located.err) return { args, lines: [], error: located.err }
          tx = located.tx!
        } else {
          const located = await this.locateTransaction(userId, {
            keyword: args.keyword as string | undefined,
            amount: args.amount as number | undefined,
            dateHint: args.dateHint as string | undefined,
          })
          if (located.err) return { args, lines: [], error: located.err }
          tx = located.tx!
        }
        return {
          args: { ...args, transactionId: tx.id }, // 回填真实 id,确认后直接执行
          lines: ['将删除这笔流水:', `${tx.date} ${tx.categoryName} ¥${tx.amount.toFixed(2)}${tx.note ? `(${tx.note})` : ''}`],
        }
      },
      preview: (args) => ({ lines: ['定位流水中…'], warning: '删除后不可恢复!' }),
      handler: async (userId, args) => {
        const targetId = String(args.transactionId ?? '')
        if (targetId.length !== 25) {
          return { ok: false, summary: '流水 id 无效', error: { code: 400, message: 'transactionId 无效,请重新发起删除' } }
        }
        await this.ledger.removeTransaction(userId, targetId)
        return { ok: true, summary: '已删除该笔流水', card: { cardType: 'ledger.tx_deleted', title: '已删除', data: { id: targetId } } }
      },
    }

    return [listTransactions, reports, createTransaction, updateNote, deleteTransaction]
  }
}
