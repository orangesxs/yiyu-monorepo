/** 通用时间字符串,格式 YYYY-MM-DD HH:mm(排序直接用字符串比较) */
export type DateTimeStr = string

/** Date → 'YYYY-MM-DD HH:mm'(与服务端序列化格式一致) */
export function fmtDateTimeStr(d: Date): DateTimeStr {
  const p = (n: number) => (n < 10 ? '0' + n : '' + n)
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 当前时间字符串 YYYY-MM-DD HH:mm(记一笔默认时间等用户操作时间戳) */
export function nowStr(): DateTimeStr {
  return fmtDateTimeStr(new Date())
}

/** 当前月份 'YYYY-MM'(报表/广场本月统计锚点) */
export function nowYM(): string {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1 < 10 ? '0' + (d.getMonth() + 1) : d.getMonth() + 1}`
}

/** 全局用户角色 */
export type UserRole = 'admin' | 'user'

/** 当前登录用户 */
export interface User {
  id: string
  username: string
  nickname: string
  /** 头像 emoji(缺省按 🧑‍💻 展示) */
  avatar?: string
  /** 全局角色 */
  role?: UserRole
}
