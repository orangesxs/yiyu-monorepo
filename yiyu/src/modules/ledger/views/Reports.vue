<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { PieChart, LineChart, BarChart, ScatterChart } from 'echarts/charts'
import {
  GridComponent, TooltipComponent, LegendComponent,
  VisualMapComponent, CalendarComponent,
} from 'echarts/components'
import VChart from 'vue-echarts'
import { useLedgerStore } from '../stores/ledger'
import type { LedgerReportDto } from '@/shared/api'

use([CanvasRenderer, PieChart, LineChart, BarChart, ScatterChart, GridComponent, TooltipComponent, LegendComponent, VisualMapComponent, CalendarComponent])

const store = useLedgerStore()
onMounted(() => {
  store.init().catch(() => {})
  refresh()
})
/** 今日(真实时钟,报表区间推导的锚点) */
const today = new Date()

/* 维度:支出 / 收入 / 总计(全部图表联动) */
const type = ref<'expense' | 'income' | 'total'>('expense')
/* 时间段:周 / 月 / 年,默认月 */
const range = ref<'week' | 'month' | 'year'>('month')
/* 区间偏移:0=本期,-1=上一期… */
const offset = ref(0)
/* 报表归属账本 */
const bookId = ref(store.currentBookId)
/* init 就绪后 currentBookId 从 ''→id,跟进并联动下方 watch 刷新 */
watch(() => store.currentBookId, (id) => { if (id && !bookId.value) bookId.value = id })
const bookOptions = computed(() => store.books)
const activeBook = computed(() => store.books.find((b) => b.id === bookId.value))

function pad(n: number) { return n < 10 ? '0' + n : '' + n }
function ymd(d: Date) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) }
function fmtShort(d: Date) { return `${d.getMonth() + 1}/${d.getDate()}` }

interface DateRange { start: Date; end: Date }

/* 区间推导(锚定真实今日) */
function rangeOf(off: number): DateRange {
  if (range.value === 'week') {
    const end = new Date(today); end.setDate(today.getDate() + off * 7)
    const start = new Date(end); start.setDate(end.getDate() - 6)
    return { start, end }
  }
  if (range.value === 'month') {
    const anchor = new Date(today.getFullYear(), today.getMonth() + off, 1)
    const endDay = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate()
    const end = new Date(anchor.getFullYear(), anchor.getMonth(), Math.min(endDay, off === 0 ? today.getDate() : endDay))
    return { start: anchor, end }
  }
  const start = new Date(today.getFullYear() + off, 0, 1)
  const end = off === 0 ? new Date(today) : new Date(today.getFullYear() + off, 11, 31)
  return { start, end }
}
const curRange = computed(() => rangeOf(offset.value))

const rangeLabel = computed(() => {
  const { start, end } = curRange.value
  if (range.value === 'year') return `${start.getFullYear()} 年`
  if (range.value === 'month') return `${start.getFullYear()} 年 ${start.getMonth() + 1} 月`
  return `${fmtShort(start)} – ${fmtShort(end)}`
})
const rangeSubLabel = computed(() => {
  if (offset.value === 0) return '本期'
  if (offset.value === -1) return '上期'
  return `${-offset.value} 期前`
})
const canGoNext = computed(() => offset.value < 0)
const atLatest = computed(() => offset.value === 0)

function stepRange(dir: number) {
  offset.value += dir
}

/* ---- 统计(服务端 reports 接口,只拉当前所选区间) ---- */
const report = ref<LedgerReportDto | null>(null)
const reportLoading = ref(false)

async function fetchRange(r: DateRange): Promise<LedgerReportDto> {
  return store.fetchReports(ymd(r.start), ymd(r.end), bookId.value)
}
async function refresh() {
  if (!bookId.value) return
  reportLoading.value = true
  try {
    report.value = await fetchRange(curRange.value)
  } catch {
    /* 请求层已提示;报表保持上次数据 */
  } finally {
    reportLoading.value = false
  }
}

watch([range, offset, bookId], () => refresh())

interface Stats { income: number; expense: number; balance: number; count: number }
const emptyStats: Stats = { income: 0, expense: 0, balance: 0, count: 0 }
const stats = computed<Stats>(() => report.value?.stats ?? emptyStats)

/* 当前维度取值 */
const isTotal = computed(() => type.value === 'total')
const typeUnit = computed(() =>
  type.value === 'income' ? '收入' : type.value === 'expense' ? '支出' : '结余'
)
const typeKey = computed<'income' | 'expense' | 'balance'>(() =>
  type.value === 'income' ? 'income' : type.value === 'expense' ? 'expense' : 'balance'
)
const typeValue = computed(() => stats.value[typeKey.value])

/* 日均 */
const dayCount = computed(() => {
  const { start, end } = curRange.value
  if (range.value === 'year') {
    const limit = Math.min(new Date(end.getFullYear(), 11, 31).getTime(), today.getTime())
    return Math.round((limit - start.getTime()) / 86400000) + 1
  }
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1
})
const avgText = computed(() => {
  const v = typeValue.value / dayCount.value
  return '¥' + (Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : v.toFixed(2))
})

/* 总计(当前账本,年维度=本年区间即年累计;其他维度展示区间结余) */
const bookTotal = computed<Stats>(() => report.value?.stats ?? emptyStats)

/* ---- 趋势图(周/月=按日,年=按月;total=收支相抵单线) ---- */
/* 服务端 daily/monthly → 视图序列(补齐区间内每一天/每一月为 0) */
function dailySeries(r: DateRange, src: LedgerReportDto | null): number[] {
  const byDay = new Map(src?.daily.map((d) => [d.date, d]) ?? [])
  const days: number[] = []
  for (let d = new Date(r.start); d <= r.end; d.setDate(d.getDate() + 1)) {
    const a = byDay.get(ymd(d)) ?? { income: 0, expense: 0 }
    const v = isTotal.value ? a.income - a.expense : a[typeKey.value as 'income' | 'expense']
    days.push(+v.toFixed(2))
  }
  return days
}
function monthlySeries(year: number, src: LedgerReportDto | null): number[] {
  const byMonth = new Map(src?.monthly.map((m) => [m.month, m]) ?? [])
  return Array.from({ length: 12 }, (_, i) => {
    const key = `${year}-${pad(i + 1)}`
    const a = byMonth.get(key) ?? { income: 0, expense: 0 }
    const v = isTotal.value ? a.income - a.expense : a[typeKey.value as 'income' | 'expense']
    return +v.toFixed(2)
  })
}

interface TrendSeries {
  name: string
  type: 'line'
  smooth: boolean
  symbolSize?: number
  symbol?: string
  showSymbol?: boolean
  data: number[]
  lineStyle: { width: number; type?: string; opacity?: number }
  areaStyle?: { opacity: number } | null
  color: string
}

const trendOption = computed(() => {
  const axisColor = '#909399'
  const splitColor = 'rgba(144,147,153,0.18)'
  const cIn = '#18A058', cOut = '#E5484D'
  let labels: string[] = [], main: number[] = []

  if (range.value === 'year') {
    const year = curRange.value.start.getFullYear()
    labels = Array.from({ length: 12 }, (_, i) => `${i + 1}月`)
    main = monthlySeries(year, report.value)
  } else {
    const { start, end } = curRange.value
    const days: string[] = []
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) days.push(ymd(d))
    labels = days.map((k) => k.slice(5))
    main = dailySeries(curRange.value, report.value)
  }

  const series: TrendSeries[] = [{
    name: typeUnit.value,
    type: 'line',
    smooth: true,
    symbolSize: 5,
    showSymbol: labels.length <= 40,
    data: main,
    lineStyle: { width: 2.5 },
    areaStyle: { opacity: isTotal.value ? 0 : 0.12 },
    color: isTotal.value ? '#7C6AF0' : type.value === 'income' ? cIn : cOut,
  }]

  return {
    tooltip: {
      trigger: 'axis',
      formatter: (ps: { marker: string; seriesName: string; axisValue: string; value: number }[]) => ps.map((p) => `${p.marker}${p.seriesName} ${p.axisValue}<br/>¥${(+p.value).toLocaleString()}`).join('<br/>'),
    },
    grid: { left: 56, right: 20, top: 20, bottom: 28 },
    xAxis: { type: 'category', data: labels, boundaryGap: false, axisLine: { lineStyle: { color: splitColor } }, axisLabel: { color: axisColor, fontSize: 11, hideOverlap: true } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: splitColor } }, axisLabel: { color: axisColor, formatter: (v: number) => (Math.abs(v) >= 10000 ? v / 10000 + 'w' : v) } },
    series,
  }
})
const trendPeak = computed(() => {
  const data = (trendOption.value.series as TrendSeries[])[0].data
  return Math.max(...data.map((v) => Math.abs(v || 0)))
})

/* ---- 分类占比 + 排行(total 模式下收支并列展示;服务端已归并根分类) ---- */
interface CatItem { name: string; value: number; kind: 'expense' | 'income'; kindLabel?: string }

const catData = computed<CatItem[]>(() => {
  const cats = report.value?.categories
  if (isTotal.value) {
    const e = cats?.expense ?? [], i = cats?.income ?? []
    return [
      ...e.map((c) => ({ ...c, kind: 'expense' as const })),
      ...i.map((c) => ({ ...c, kind: 'income' as const })),
    ].sort((a, b) => b.value - a.value)
  }
  const list = type.value === 'income' ? cats?.income : cats?.expense
  return (list ?? []).map((c) => ({ ...c, kind: type.value as 'expense' | 'income' }))
})

const paletteExpense = ['#E5484D', '#F59B0E', '#EC4899', '#C2410C', '#A855F7', '#EF4444', '#F97316', '#B45309']
const paletteIncome = ['#18A058', '#14B8A6', '#10B981', '#0EA5E9', '#84CC16', '#22C55E', '#06B6D4', '#65A30D']
function colorOf(c: CatItem, i: number) {
  if (isTotal.value) return c.kind === 'expense' ? paletteExpense[i % paletteExpense.length] : paletteIncome[i % paletteIncome.length]
  const p = type.value === 'income' ? paletteIncome : paletteExpense
  return p[i % p.length]
}

const pieOption = computed(() => ({
  tooltip: {
    trigger: 'item',
    formatter: (p: { name: string; value: number; percent: number; data: CatItem }) => `${isTotal.value ? (p.data.kind === 'expense' ? '支 · ' : '收 · ') : ''}${p.name}<br/>¥${(+p.value).toLocaleString()}(${p.percent}%)`,
  },
  series: [{
    type: 'pie',
    radius: ['58%', '82%'],
    center: ['50%', '50%'],
    avoidLabelOverlap: true,
    itemStyle: { borderRadius: 6, borderColor: 'transparent', borderWidth: 2 },
    label: { show: false },
    emphasis: { scaleSize: 6 },
    data: catData.value.map((c, i) => ({ ...c, itemStyle: { color: colorOf(c, i) } })),
  }],
}))
function lgColor(c: CatItem, i: number) { return colorOf(c, i) }
const catTotal = computed(() => catData.value.reduce((s, c) => s + c.value, 0))
const catCount = computed(() => catData.value.length)

/* 分类排行(横向条形,total 模式收/支各取前 6;数据同 catData,服务端已归并) */
const rankRows = computed<CatItem[]>(() => {
  if (!isTotal.value) return catData.value.slice(0, 8).map((c) => ({ ...c, kindLabel: '' }))
  const e = (report.value?.categories.expense ?? []).slice(0, 6).map((c) => ({ ...c, kind: 'expense' as const, kindLabel: '支' }))
  const i = (report.value?.categories.income ?? []).slice(0, 6).map((c) => ({ ...c, kind: 'income' as const, kindLabel: '收' }))
  return [...e, ...i].sort((a, b) => b.value - a.value)
})
const rankMax = computed(() => rankRows.value[0]?.value || 1)

/* ---- 收支日历:周=近 7 天条 / 月=整月热力 / 年=12 月格(数据来自服务端聚合) ---- */
interface CalCell {
  key: string
  label: string
  foot: string
  income?: number
  expense?: number
  net?: number
  isToday?: boolean
  future?: boolean
  monthCell?: boolean
}

/* 服务端 daily → 按日期索引 */
const dailyMap = computed(() => new Map((report.value?.daily ?? []).map((d) => [d.date, d])))
const monthlyMap = computed(() => new Map((report.value?.monthly ?? []).map((m) => [m.month, m])))

const calCells = computed<(CalCell | null)[]>(() => {
  if (range.value === 'year') {
    const y = curRange.value.start.getFullYear()
    return Array.from({ length: 12 }, (_, i) => {
      const key = `${y}-${pad(i + 1)}`
      const m = monthlyMap.value.get(key) ?? { income: 0, expense: 0 }
      return {
        key,
        label: i + 1 + '月',
        foot: y + ' 年 ' + (i + 1) + ' 月',
        income: +m.income.toFixed(2),
        expense: +m.expense.toFixed(2),
        net: +(m.income - m.expense).toFixed(2),
        isToday: y === today.getFullYear() && i === today.getMonth(),
        monthCell: true,
      }
    })
  }
  if (range.value === 'month') {
    const { start } = curRange.value
    const cells: (CalCell | null)[] = []
    for (let i = 0; i < start.getDay(); i++) cells.push(null) // 周日开头补位
    const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()
    for (let dom = 1; dom <= daysInMonth; dom++) {
      const d = new Date(start.getFullYear(), start.getMonth(), dom)
      if (d > today) {
        cells.push({ key: ymd(d), label: String(dom), foot: d.getMonth() + 1 + '/' + dom, future: true })
        continue
      }
      const k = ymd(d)
      const a = dailyMap.value.get(k) ?? { income: 0, expense: 0 }
      cells.push({
        key: k,
        label: String(dom),
        foot: +k.slice(5, 7) + '/' + +k.slice(8, 10),
        income: +a.income.toFixed(2),
        expense: +a.expense.toFixed(2),
        net: +(a.income - a.expense).toFixed(2),
        isToday: k === ymd(today),
      })
    }
    return cells
  }
  /* week:滚动近 7 天 */
  const { start, end } = curRange.value
  const cells: (CalCell | null)[] = []
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const k = ymd(d)
    const a = dailyMap.value.get(k) ?? { income: 0, expense: 0 }
    cells.push({
      key: k,
      label: d.getMonth() + 1 + '/' + d.getDate(),
      foot: d.getMonth() + 1 + '/' + d.getDate(),
      income: +a.income.toFixed(2),
      expense: +a.expense.toFixed(2),
      net: +(a.income - a.expense).toFixed(2),
      isToday: k === ymd(today),
    })
  }
  return cells
})
const calMaxExpense = computed(() => Math.max(1, ...calCells.value.filter(Boolean).map((c) => c!.expense ?? 0)))
function calLevel(c: CalCell | null) {
  if (!c) return 'none'
  if (c.future) return 'future'
  if ((c.expense ?? 0) <= 0) return (c.income ?? 0) > 0 ? 'in' : 'none'
  const r = (c.expense ?? 0) / calMaxExpense.value
  return r > 0.66 ? 'e4' : r > 0.33 ? 'e3' : r > 0.12 ? 'e2' : 'e1'
}
const calHover = ref<CalCell | null>(null)
const weekHeads = ['日', '一', '二', '三', '四', '五', '六']

/* 峰值摘要:周/月=最贵的一天,年=支出最高的月份 */
const peakText = computed(() => {
  const cells = calCells.value.filter((c): c is CalCell => !!c && !c.future)
  if (!cells.length) return ''
  const top = [...cells].sort((a, b) => (b.expense ?? 0) - (a.expense ?? 0))[0]
  if (!(top.expense ?? 0)) return ''
  const money = '¥' + Math.round(top.expense ?? 0).toLocaleString()
  if (range.value === 'year') return `支出最高 ${top.label} · ${money}`
  return `最贵的一天 ${top.label}${range.value === 'month' ? ' 日' : ''} · ${money}`
})
const calTitle = computed(() =>
  range.value === 'year' ? '收支月历' : range.value === 'week' ? '近 7 天收支' : '收支日历'
)
function fmtCell(v: number) {
  return v >= 100 ? Math.round(v).toLocaleString() : v
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">报表统计</h2>
        <p class="page-sub">
          {{ activeBook?.icon }} {{ activeBook?.name }}
          <span class="head-sep">·</span>
          <button class="range-nav" :disabled="atLatest" title="上一期" @click="stepRange(-1)"><el-icon><ArrowLeft /></el-icon></button>
          <span class="range-text">{{ rangeLabel }}</span>
          <button class="range-nav" :disabled="!canGoNext" title="下一期" @click="stepRange(1)"><el-icon><ArrowRight /></el-icon></button>
          <span v-if="offset !== 0" class="range-offset">({{ rangeSubLabel }})</span>
        </p>
      </div>
      <div class="head-switch">
        <el-select v-model="bookId" size="small" style="width: 130px">
          <el-option v-for="b in bookOptions" :key="b.id" :label="b.icon + ' ' + b.name" :value="b.id" />
        </el-select>
        <el-radio-group v-model="type" size="small">
          <el-radio-button value="expense">支出</el-radio-button>
          <el-radio-button value="income">收入</el-radio-button>
          <el-radio-button value="total">总计</el-radio-button>
        </el-radio-group>
        <el-radio-group v-model="range" size="small" @change="offset = 0">
          <el-radio-button value="week">周</el-radio-button>
          <el-radio-button value="month">月</el-radio-button>
          <el-radio-button value="year">年</el-radio-button>
        </el-radio-group>
      </div>
    </div>

    <!-- 总览:维度主卡 + 收支卡 + 总计 -->
    <div class="stat-grid">
      <div class="yiyu-card stat-card stat-card--main" :class="'k-' + type">
        <span class="sum-label">
          本{{ range === 'week' ? '周' : range === 'month' ? '月' : '年' }}{{ typeUnit }}
          <span v-if="offset !== 0" class="sum-offset">{{ rangeSubLabel }}</span>
        </span>
        <span class="stat-num num main-num" :class="type === 'income' ? 'money-in' : type === 'expense' ? 'money-out' : ''">
          ¥{{ Math.abs(typeValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
        </span>
        <span class="sum-faint num">日均 ¥{{ avgText.replace('¥', '') }} · {{ stats.count }} 笔</span>
      </div>

      <div class="yiyu-card stat-card" :class="{ dim: type === 'income' }">
        <span class="sum-label">支出</span>
        <span class="stat-num money-out">¥{{ stats.expense.toLocaleString(undefined, { maximumFractionDigits: 2 }) }}</span>
      </div>

      <div class="yiyu-card stat-card" :class="{ dim: type === 'expense' }">
        <span class="sum-label">收入</span>
        <span class="stat-num money-in">¥{{ stats.income.toLocaleString(undefined, { maximumFractionDigits: 2 }) }}</span>
      </div>

      <div class="yiyu-card stat-card stat-card--total">
        <span class="sum-label">{{ range === 'year' ? '本年累计' : '本期结余' }}({{ activeBook?.name }})</span>
        <span class="stat-num num tt-num">
          <span class="tt-part">收 <b class="money-in">¥{{ bookTotal.income.toLocaleString(undefined, { maximumFractionDigits: 0 }) }}</b></span>
          <span class="tt-part">支 <b class="money-out">¥{{ bookTotal.expense.toLocaleString(undefined, { maximumFractionDigits: 0 }) }}</b></span>
        </span>
        <span class="sum-sub num">结余 ¥{{ bookTotal.balance.toLocaleString(undefined, { maximumFractionDigits: 0 }) }} · 共 {{ bookTotal.count }} 笔</span>
      </div>
    </div>

    <div class="chart-grid">
      <div class="yiyu-card chart-card">
        <div class="chart-head">
          <span class="chart-title">{{ typeUnit }}趋势</span>
          <span v-if="!isTotal" class="chart-sub num">峰值 ¥{{ trendPeak.toLocaleString() }}</span>
        </div>
        <v-chart :option="trendOption" class="chart" autoresize />
      </div>

      <!-- 收支日历:周=近 7 天条 / 月=整月热力 / 年=12 月格 -->
      <div class="yiyu-card chart-card cal-card">
        <div class="chart-head">
          <span class="chart-title">{{ calTitle }}</span>
          <span v-if="peakText" class="chart-sub num">{{ peakText }}</span>
        </div>
        <div class="cal">
          <div v-if="range === 'month'" class="cal-week">
            <span v-for="w in weekHeads" :key="w">{{ w }}</span>
          </div>
          <div class="cal-grid" :class="'cal-grid--' + range">
            <div
              v-for="(c, i) in calCells"
              :key="i"
              class="cal-cell"
              :class="[{ today: c?.isToday, hover: c && calHover && calHover.key === c.key, future: c?.future }, 'lv-' + calLevel(c)]"
              @mouseenter="calHover = c"
              @mouseleave="calHover = null"
            >
              <template v-if="c && !c.future">
                <span class="cal-dom num">{{ c.label }}</span>
                <span v-if="(c.expense ?? 0) > 0" class="cal-out num">-{{ fmtCell(c.expense ?? 0) }}</span>
                <span v-if="(c.income ?? 0) > 0" class="cal-in num">+{{ fmtCell(c.income ?? 0) }}</span>
              </template>
              <template v-else-if="c">
                <span class="cal-dom num cal-future-dom">{{ c.label }}</span>
              </template>
            </div>
          </div>
          <div class="cal-foot">
            <span class="cal-hover num" v-if="calHover">
              {{ calHover.foot }}
              <template v-if="calHover.expense || calHover.income">
                · <b class="money-out">-{{ (calHover.expense ?? 0).toFixed(2) }}</b>
                <template v-if="calHover.income"> <b class="money-in">+{{ calHover.income.toFixed(2) }}</b></template>
              </template>
              <template v-else>· 无记录</template>
            </span>
            <span v-else class="cal-hover cal-muted">悬停查看单{{ range === 'year' ? '月' : '日' }}收支</span>
            <span class="cal-legend">
              <i class="lg-cell lv-in"></i>有收入
              <i class="lg-cell lv-e1"></i><i class="lg-cell lv-e2"></i><i class="lg-cell lv-e3"></i><i class="lg-cell lv-e4"></i>支出由少到多
            </span>
          </div>
        </div>
      </div>

      <div class="yiyu-card chart-card pie-card">
        <div class="chart-head">
          <span class="chart-title">{{ typeUnit }}分类占比</span>
          <span class="chart-sub num">合计 ¥{{ catTotal.toLocaleString(undefined, { maximumFractionDigits: 2 }) }}</span>
        </div>
        <v-chart v-if="catCount" :option="pieOption" class="chart chart--pie" autoresize />
        <div v-else class="chart-empty">该时段暂无{{ typeUnit }}记录</div>
        <div class="pie-legend">
          <span v-for="(c, i) in catData" :key="c.kind + c.name" class="lg-item" :class="{ muted: isTotal && c.kind === 'income' }">
            <i :style="{ background: lgColor(c, i) }"></i>
            <template v-if="isTotal">{{ c.kind === 'expense' ? '支' : '收' }} · </template>{{ c.name }}
            <b class="num">¥{{ c.value.toLocaleString(undefined, { maximumFractionDigits: 0 }) }}</b>
            <em class="num">{{ catTotal ? Math.round((c.value / catTotal) * 100) : 0 }}%</em>
          </span>
        </div>
      </div>

      <div class="yiyu-card chart-card">
        <div class="chart-head">
          <span class="chart-title">{{ typeUnit }}分类排行</span>
          <span class="chart-sub num">Top {{ rankRows.length }}</span>
        </div>
        <div class="rank-list">
          <div v-for="(r, i) in rankRows" :key="r.kind + r.name" class="rank-row">
            <span class="rank-idx num" :class="{ top: i < 3 }">{{ i + 1 }}</span>
            <span class="rank-name">{{ r.name }}<i v-if="r.kindLabel" class="rank-kind" :class="r.kind">{{ r.kindLabel }}</i></span>
            <span class="rank-bar"><i :class="r.kind" :style="{ width: (r.value / rankMax) * 100 + '%' }"></i></span>
            <span class="rank-val num">¥{{ r.value.toLocaleString(undefined, { maximumFractionDigits: 0 }) }}</span>
            <span class="rank-pct num">{{ catTotal ? Math.round((r.value / catTotal) * 100) : 0 }}%</span>
          </div>
          <div v-if="!rankRows.length" class="chart-empty">该时段暂无记录</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style src="./Reports.css" scoped></style>
