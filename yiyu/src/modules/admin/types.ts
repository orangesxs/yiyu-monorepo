import type { UserRole, DateTimeStr } from '@/shared/types/common'

/** 全局角色在本模块的再导出(User.role 与 SystemUser.role 共用) */
export type { UserRole }

/** 系统用户状态 */
export type UserStatus = 'active' | 'disabled'

/** 系统用户(后台管理视角的用户目录) */
export interface SystemUser {
  id: string
  username: string
  name: string
  /** 头像 emoji */
  avatar: string
  role: UserRole
  status: UserStatus
  /** 注册日期 YYYY-MM-DD */
  registeredAt: string
  /** 最近活跃 YYYY-MM-DD HH:mm */
  lastActiveAt: DateTimeStr
}

export const roleLabels: Record<UserRole, string> = { admin: '管理员', user: '普通用户' }
export const statusLabels: Record<UserStatus, string> = { active: '正常', disabled: '停用' }

/** 日志归属模块 */
export type LogModule = 'auth' | 'ledger' | 'profile' | 'admin'

/** 日志操作类型 */
export type LogAction = 'login' | 'create' | 'update' | 'delete' | 'security'

/** 系统日志(只读审计,无操作列) */
export interface AdminLog {
  id: string
  /** YYYY-MM-DD HH:mm,列表按此倒序 */
  time: DateTimeStr
  moduleId: LogModule
  action: LogAction
  /** 操作人 id(u1~u7) */
  operatorId: string
  /** 一句话内容 */
  summary: string
}

export const moduleLabels: Record<LogModule, string> = {
  auth: '认证',
  ledger: '记账本',
  profile: '个人中心',
  admin: '管理后台',
}

export const actionLabels: Record<LogAction, string> = {
  login: '登录',
  create: '新增',
  update: '更新',
  delete: '删除',
  security: '安全',
}

/** 日志类型 → el-tag 语义色 */
export const actionTagTypes: Record<LogAction, 'success' | 'primary' | 'danger' | 'info' | 'warning'> = {
  create: 'success',
  update: 'primary',
  delete: 'danger',
  login: 'info',
  security: 'warning',
}

/** 新增用户头像 emoji 选项(admin 自有常量,与 profile 池一致) */
export const adminAvatarOptions = ['🧑‍💻', '👩', '👨‍🦰', '👩‍🦳', '🧕', '🐱', '🐰', '🦊', '🐻', '🌻', '☘️', '🌙'] as const
