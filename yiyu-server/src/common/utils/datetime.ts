/**
 * 时间工具:DB timestamptz ↔ API 'YYYY-MM-DD HH:mm' 字符串。
 * 前端依赖字符串排序(见前端 CLAUDE.md「时间字符串格式统一」),此格式必须全站一致。
 */

function pad(n: number) {
  return n < 10 ? '0' + n : '' + n
}

/** Date → 'YYYY-MM-DD HH:mm'(本地时区 Asia/Shanghai 环境下运行) */
export function fmtDateTime(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Date → 'YYYY-MM-DD' */
export function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 当前时间字符串 */
export function nowStr(): string {
  return fmtDateTime(new Date())
}

/**
 * 'YYYY-MM-DD HH:mm' → Date;支持仅日期 'YYYY-MM-DD'(按 00:00)。
 * 非法输入返回 null(由调用方决定 400)。
 */
export function parseDateTime(s: string): Date | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/)
  if (!m) return null
  const [, y, mo, d, h = '00', mi = '00'] = m
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi))
  // 校验回读一致,挡住 2026-13-45 这类伪合法
  if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(mo) - 1 || date.getDate() !== Number(d)) {
    return null
  }
  return date
}
