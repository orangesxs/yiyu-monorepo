import type { DateTimeStr } from '@/shared/types/common'

/** 流水类型:支出 / 收入 */
export type TxType = 'expense' | 'income'

/** 账本 */
export interface Book {
  id: string
  name: string
  icon: string
  /** 本月支出(卡片展示用) */
  monthExpense: number
  isDefault: boolean
}

/** 流水 */
export interface Transaction {
  id: string
  type: TxType
  amount: number
  categoryId: string
  /** 冗余分类名,便于未注册分类(如装修/旅行自定义分类)兜底展示 */
  categoryName: string
  bookId: string
  date: DateTimeStr
  note?: string
}

/** 分类(根分类带子分类,子分类无 icon) */
export interface Category {
  id: string
  name: string
  icon: string
  children: { id: string; name: string }[]
  /** 自定义分类可删除 */
  custom?: boolean
}

/** 区间统计结果 */
export interface RangeStats {
  income: number
  expense: number
  balance: number
  count: number
}

/** 按日聚合项 */
export interface DailyTotal {
  /** MM-DD */
  key: string
  income: number
  expense: number
}
