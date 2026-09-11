import { get, post, put, patch, del } from './http'
import type { User } from '../types/common'
import type { Profile } from '@/modules/profile/types'

/* ── 认证 ── */

export interface AuthResult {
  token: string
  user: User
}

export const authApi = {
  register: (data: { username: string; nickname: string; password: string; inviteCode: string }) =>
    post<AuthResult>('/auth/register', data),
  login: (data: { username: string; password: string }) => post<AuthResult>('/auth/login', data),
  logout: () => post<{ ok: boolean }>('/auth/logout'),
  me: () => get<User>('/auth/me'),
}

/* ── 个人档案 ── */

export const profileApi = {
  get: () => get<Profile>('/profile'),
  update: (data: Partial<Pick<Profile, 'nickname' | 'avatar' | 'bio' | 'gender' | 'birthday' | 'region'>>) =>
    put<Profile>('/profile', data),
  changePassword: (data: { oldPassword: string; newPassword: string }) =>
    put<{ ok: boolean }>('/profile/password', data),
}

/* ── 邀请码(我的,档案域) ── */

export interface InviteCodeItem {
  id: string
  code: string
  createdAt: string
  usedAt: string | null
  usedBy: { id: string; nickname: string; avatar: string } | null
}

export const inviteApi = {
  listMine: () => get<InviteCodeItem[]>('/profile/invite-codes'),
  create: () => post<InviteCodeItem>('/profile/invite-codes'),
}

/* ── 记账本 ── */

export interface BookDto {
  id: string
  name: string
  icon: string
  monthExpense: number
  isDefault: boolean
}

export interface CategoryDto {
  id: string
  name: string
  icon: string
  children: { id: string; name: string }[]
  custom?: boolean
}

export interface TransactionDto {
  id: string
  type: 'expense' | 'income'
  amount: number
  categoryId: string
  categoryName: string
  bookId: string
  date: string
  note?: string | null
}

export interface NewTransactionInput {
  type: 'expense' | 'income'
  amount: number
  categoryId: string
  date: string
  note?: string
  bookId?: string
}

/** 流水分页结果(服务端分页) */
export interface TransactionPage {
  total: number
  page: number
  pageSize: number
  items: TransactionDto[]
}

/** 报表聚合结果(服务端计算,单账本区间内) */
export interface LedgerReportDto {
  stats: { income: number; expense: number; balance: number; count: number }
  /** 按日聚合(区间 ≤ 92 天时返回) */
  daily: { date: string; income: number; expense: number }[]
  /** 按月聚合 */
  monthly: { month: string; income: number; expense: number }[]
  /** 分类聚合(子分类归并到根分类,倒序) */
  categories: {
    expense: { name: string; value: number }[]
    income: { name: string; value: number }[]
  }
}

export const ledgerApi = {
  listBooks: () => get<BookDto[]>('/ledger/books'),
  createBook: (data: { name: string; icon: string }) => post<BookDto>('/ledger/books', data),
  listCategories: (type?: 'expense' | 'income') =>
    get<CategoryDto[] | { expense: CategoryDto[]; income: CategoryDto[] }>(
      '/ledger/categories', type ? { type } : undefined,
    ),
  createCategory: (data: { type: 'expense' | 'income'; name: string; icon: string }) =>
    post<CategoryDto>('/ledger/categories', data),
  removeCategory: (id: string) => del<{ ok: boolean }>(`/ledger/categories/${id}`),
  listTransactions: (params: {
    bookId: string
    from?: string
    to?: string
    type?: 'expense' | 'income'
    categoryId?: string
    keyword?: string
    page?: number
    pageSize?: number
  }) => get<TransactionPage>('/ledger/transactions', params),
  createTransaction: (data: NewTransactionInput) => post<TransactionDto>('/ledger/transactions', data),
  updateTransaction: (id: string, data: Partial<NewTransactionInput>) =>
    patch<TransactionDto>(`/ledger/transactions/${id}`, data),
  removeTransaction: (id: string) => del<{ ok: boolean }>(`/ledger/transactions/${id}`),
  reports: (params: { bookId: string; from: string; to: string }) =>
    get<LedgerReportDto>('/ledger/reports', params),
}

/* ── 广场门户(登录落地页应用卡摘要) ── */

export interface PortalSummaryDto {
  apps: {
    ledger: {
      bookName: string
      bookIcon: string
      monthExpense: number
      monthIncome: number
      monthBalance: number
    }
  }
}

export const portalApi = {
  summary: () => get<PortalSummaryDto>('/portal/summary'),
}

/* ── 管理后台 ── */

export interface SystemUserDto {
  id: string
  username: string
  name: string
  avatar: string
  role: 'admin' | 'user'
  status: 'active' | 'disabled'
  registeredAt: string
  lastActiveAt: string
}

export interface AdminLogDto {
  id: string
  time: string
  moduleId: 'auth' | 'ledger' | 'profile' | 'admin'
  action: 'login' | 'create' | 'update' | 'delete' | 'security'
  operatorId: string
  summary: string
  operator: { id: string; nickname: string; avatar: string } | null
}

export interface AdminLogsPage {
  total: number
  page: number
  pageSize: number
  items: AdminLogDto[]
}

export interface AdminDashboardDto {
  userCount: number
  adminCount: number
  activeCount: number
  disabledCount: number
  bookCount: number
  logCount: number
  logTodayCount: number
  logSecurityCount: number
  logCountByDay: { date: string; label: string; count: number }[]
  latestLogs: AdminLogDto[]
}

export interface AdminInviteDto {
  id: string
  code: string
  createdAt: string
  usedAt: string | null
  creator: { id: string; nickname: string; avatar: string } | null
  usedBy: { id: string; nickname: string; avatar: string } | null
}

export const adminApi = {
  listUsers: (params?: { keyword?: string; role?: string; status?: string }) =>
    get<SystemUserDto[]>('/admin/users', params),
  createUser: (data: { username: string; name: string; avatar: string; role: 'admin' | 'user'; password: string }) =>
    post<SystemUserDto>('/admin/users', data),
  updateUser: (id: string, data: { role?: 'admin' | 'user'; status?: 'active' | 'disabled' }) =>
    patch<{ ok: boolean }>(`/admin/users/${id}`, data),
  listLogs: (params: {
    page?: number
    pageSize?: number
    module?: string
    action?: string
    operatorId?: string
  }) => get<AdminLogsPage>('/admin/logs', params),
  dashboard: () => get<AdminDashboardDto>('/admin/dashboard'),
  listInvites: () => get<AdminInviteDto[]>('/admin/invite-codes'),
  createInvite: () => post<{ id: string; code: string; createdAt: string }>('/admin/invite-codes'),
}
