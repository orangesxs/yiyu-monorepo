import { defineStore } from 'pinia'
import { ref, computed, reactive } from 'vue'
import { ledgerApi } from '@/shared/api'
import type { LedgerReportDto, TransactionDto } from '@/shared/api'
import type { Book, Category, Transaction, TxType } from '../types'

/**
 * 记账本数据源:books/categories 来自后端 API;流水分页拉取(服务端分页),
 * 报表聚合走 /ledger/reports 服务端计算——前端不再全量拉流水自算统计。
 */
export const useLedgerStore = defineStore('ledger', () => {
  /* 当前账本流水(当前已加载的分页页集合,倒序追加) */
  const transactions = ref<Transaction[]>([])
  const txTotal = ref(0)
  const books = ref<Book[]>([])
  const currentBookId = ref('')
  /* loaded:首次加载完成(为 false 时视图可显示空态而非误导性的"无记录") */
  const loaded = ref(false)
  const loading = ref(false)
  /* 分类(预置+我的自定义,后端返回根分类带子分类) */
  const categories = ref<Record<TxType, Category[]>>({ expense: [], income: [] })

  /** 服务端 DTO → 前端 Transaction(note null 归一为 undefined,类型兼容) */
  function normalizeTx(t: TransactionDto): Transaction {
    return { ...t, note: t.note ?? undefined }
  }

  /** 拉取基础数据(进入记账本应用时调用;已加载/加载中则跳过,应用内多页共享一次)。
   *  流水不在此拉:流水按视图需求加载(Transactions 页按月分页),报表走 /ledger/reports */
  async function init() {
    if (loaded.value || loading.value) return
    loading.value = true
    try {
      const [bookList, cats] = await Promise.all([
        ledgerApi.listBooks(),
        ledgerApi.listCategories() as Promise<{ expense: Category[]; income: Category[] }>,
      ])
      books.value = bookList
      categories.value = cats
      /* 当前账本:优先默认账本,否则第一本 */
      if (!currentBookId.value || !bookList.some((b) => b.id === currentBookId.value)) {
        currentBookId.value = bookList.find((b) => b.isDefault)?.id || bookList[0]?.id || ''
      }
      loaded.value = true
    } finally {
      loading.value = false
    }
  }

  /** 当前流水列表所处的月份视图('' = 无月份过滤的全量分页) */
  const monthQuery = ref('')

  /** 筛选条件(type/categoryId/keyword,服务端过滤;'' 表示不过滤) */
  const filters = reactive<{ type: '' | TxType; categoryId: string; keyword: string }>({
    type: '', categoryId: '', keyword: '',
  })

  function txFilterParams(): { type?: TxType; categoryId?: string; keyword?: string } {
    return {
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.keyword.trim() ? { keyword: filters.keyword.trim() } : {}),
    }
  }

  /** 分页拉取当前账本流水(无月份过滤;page=1 重置,>1 追加) */
  async function loadTransactions(page = 1) {
    if (!currentBookId.value) return
    const res = await ledgerApi.listTransactions({
      bookId: currentBookId.value, page, pageSize: 50, ...txFilterParams(),
    })
    txTotal.value = res.total
    monthQuery.value = ''
    if (page === 1) transactions.value = res.items.map(normalizeTx)
    else {
      const seen = new Set(transactions.value.map((t) => t.id))
      transactions.value.push(...res.items.map(normalizeTx).filter((t) => !seen.has(t.id)))
    }
  }

  /** 按月拉取流水(Transactions 页月份视图):重置为该月第一页 */
  async function loadMonthTransactions(ym: string, page = 1) {
    if (!currentBookId.value) return
    const [y, m] = ym.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    const pad = (n: number) => (n < 10 ? '0' + n : '' + n)
    const res = await ledgerApi.listTransactions({
      bookId: currentBookId.value, from: `${ym}-01`, to: `${ym}-${pad(lastDay)}`, page, pageSize: 50,
      ...txFilterParams(),
    })
    txTotal.value = res.total
    monthQuery.value = ym
    if (page === 1) transactions.value = res.items.map(normalizeTx)
    else {
      const seen = new Set(transactions.value.map((t) => t.id))
      transactions.value.push(...res.items.map(normalizeTx).filter((t) => !seen.has(t.id)))
    }
  }

  /** 当前列表之外还有下一页吗 */
  const hasMore = computed(() => transactions.value.length < txTotal.value)

  /* 新增自定义分类(后端去重),成功后返回新分类 id */
  async function addCustomCategory(type: TxType, name: string, icon: string): Promise<string> {
    const row = await ledgerApi.createCategory({ type, name, icon: icon || '🏷️' })
    categories.value[type].push({ id: row.id, name: row.name, icon: row.icon, children: [], custom: true })
    return row.id
  }
  async function removeCustomCategory(type: TxType, id: string) {
    await ledgerApi.removeCategory(id)
    const pool = categories.value[type]
    const i = pool.findIndex((c) => c.id === id)
    if (i > -1 && pool[i].custom) pool.splice(i, 1)
  }

  /* 区间报表(服务端聚合):from/to 为 'YYYY-MM-DD' */
  async function fetchReports(from: string, to: string, bookId?: string): Promise<LedgerReportDto> {
    return ledgerApi.reports({ bookId: bookId || currentBookId.value, from, to })
  }

  /* 按天分组(列表展示用,纯展示逻辑非统计聚合) */
  interface DayGroup { day: string; items: Transaction[]; expense: number; income: number }
  const groupedByDay = computed<DayGroup[]>(() => {
    const groups: DayGroup[] = []
    let cur: DayGroup | null = null
    for (const t of transactions.value) {
      const day = t.date.slice(0, 10)
      if (!cur || cur.day !== day) {
        cur = { day, items: [], expense: 0, income: 0 }
        groups.push(cur)
      }
      cur.items.push(t)
      if (t.type === 'expense') cur.expense += t.amount
      else cur.income += t.amount
    }
    return groups
  })

  /* 操作(API 成功后本地同步) */
  async function addTransaction(t: Omit<Transaction, 'id' | 'bookId'> & { bookId?: string }) {
    const row = await ledgerApi.createTransaction({
      type: t.type,
      amount: t.amount,
      categoryId: t.categoryId,
      date: t.date,
      note: t.note,
      bookId: t.bookId ?? currentBookId.value,
    })
    transactions.value.unshift({ ...t, bookId: row.bookId, id: row.id })
    txTotal.value += 1
  }
  async function updateTransaction(id: string, patch: Partial<Transaction>) {
    const row = await ledgerApi.updateTransaction(id, {
      ...patch,
      categoryId: patch.categoryId,
    })
    const i = transactions.value.findIndex((t) => t.id === id)
    if (i > -1) transactions.value[i] = { ...transactions.value[i], ...patch, categoryName: row.categoryName }
  }
  async function removeTransaction(id: string) {
    await ledgerApi.removeTransaction(id)
    transactions.value = transactions.value.filter((t) => t.id !== id)
    txTotal.value = Math.max(0, txTotal.value - 1)
  }
  async function switchBook(id: string) {
    if (id === currentBookId.value) return
    currentBookId.value = id
    /* 切账本重拉该账本流水首页 */
    await loadTransactions(1)
  }
  async function addBook(b: { name: string; icon: string }) {
    const row = await ledgerApi.createBook(b)
    books.value.push({ ...b, id: row.id, monthExpense: 0, isDefault: false })
  }

  const currentBook = computed(() =>
    books.value.find((b) => b.id === currentBookId.value)
  )

  return {
    transactions, txTotal, hasMore, books, categories, loaded, loading,
    currentBookId, currentBook, groupedByDay, filters,
    init, loadTransactions, loadMonthTransactions, fetchReports,
    addTransaction, updateTransaction, removeTransaction,
    switchBook, addBook, addCustomCategory, removeCustomCategory,
  }
})
