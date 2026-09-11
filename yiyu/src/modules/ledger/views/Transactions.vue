<script setup lang="ts">
import { ref, computed, reactive, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useLedgerStore } from '../stores/ledger'
import { nowStr } from '@/shared/types/common'
import type { LedgerReportDto } from '@/shared/api'
import type { Transaction, TxType } from '../types'

const store = useLedgerStore()

onMounted(() => {
  store.init().catch(() => {})
})

/* 当前月份(由当前月倒推 12 个月,最新在前) */
function buildMonths(): string[] {
  const list: string[] = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    list.push(`${d.getFullYear()}-${d.getMonth() + 1 < 10 ? '0' + (d.getMonth() + 1) : d.getMonth() + 1}`)
  }
  return list
}
const month = ref(buildMonths()[0])
const months = buildMonths()

/* 当月汇总:服务端 reports 接口(前端不再全量自算) */
const stats = ref<LedgerReportDto['stats']>({ income: 0, expense: 0, balance: 0, count: 0 })
async function loadStats() {
  const [y, m] = month.value.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  try {
    const r = await store.fetchReports(`${month.value}-01`, `${month.value}-${last < 10 ? '0' + last : last}`)
    stats.value = r.stats
  } catch {
    /* 汇总失败不打断列表 */
  }
}

/* 当月流水:服务端分页(按月区间过滤,首次 50 条,滚动到底加载更多) */
const monthLoading = ref(false)
async function loadMonth() {
  if (!store.currentBookId) return
  monthLoading.value = true
  try {
    await store.loadMonthTransactions(month.value)
    await loadStats()
  } finally {
    monthLoading.value = false
  }
}
/* 月份/账本任一变化即重载;immediate 兼首挂(init 就绪后 currentBookId 由 ''→id 也会触发) */
watch([month, () => store.currentBookId], () => {
  if (store.currentBookId) loadMonth()
}, { immediate: true })

/* 筛选(服务端过滤):条件变化 300ms 防抖后重拉第一页;月份/账本变化走下方 watch */
const filters = store.filters
let filterTimer: ReturnType<typeof setTimeout> | null = null
watch(
  () => [filters.type, filters.categoryId, filters.keyword] as const,
  () => {
    if (filterTimer) clearTimeout(filterTimer)
    filterTimer = setTimeout(() => {
      if (store.currentBookId) loadMonth()
    }, 300)
  },
)

const filteredGroups = computed(() => store.groupedByDay)

function catIcon(t: Transaction) {
  const pool = t.type === 'income' ? store.categories.income : store.categories.expense
  for (const c of pool) {
    if (c.id === t.categoryId) return c.icon
    if (c.children.some((ch) => ch.id === t.categoryId)) return c.icon
  }
  return '💵'
}

/* 记一笔抽屉(成员=当前登录人,不展示账户) */
const drawer = ref(false)
const editingId = ref<string | null>(null)
const form = reactive({
  type: 'expense' as TxType,
  amount: null as number | null,
  categoryId: '',
  date: nowStr(),
  note: '',
  bookId: store.currentBookId,
})

function openDrawer() {
  editingId.value = null
  Object.assign(form, { type: 'expense', amount: null, categoryId: '', date: nowStr(), note: '', bookId: store.currentBookId })
  drawer.value = true
}
function editRow(t: Transaction) {
  editingId.value = t.id
  Object.assign(form, {
    type: t.type,
    amount: t.amount, categoryId: t.categoryId, date: t.date, note: t.note ?? '',
    bookId: t.bookId || store.currentBookId,
  })
  drawer.value = true
}

/* 分类池:根分类直接选(自定义分类平铺) */
interface FlatCat { id: string; name: string; icon: string; custom?: boolean }
const catPool = computed(() =>
  form.type === 'income' ? store.categories.income : store.categories.expense
)
const flatCats = computed<FlatCat[]>(() =>
  catPool.value.flatMap((c) =>
    c.children.length ? c.children.map((ch) => ({ ...ch, icon: c.icon })) : [c]
  )
)

/* 自定义分类 */
const catDialog = ref(false)
const catForm = reactive({ name: '', icon: '🏷️' })
const iconOptions = ['🏷️', '🎁', '🧁', '🚗', '☕', '🐱', '🎬', '🛠️', 'Travel', '🧾'].filter((i) => !i.startsWith('T'))
function openCatDialog() {
  Object.assign(catForm, { name: '', icon: '🏷️' })
  catDialog.value = true
}
async function saveCategory() {
  const name = catForm.name.trim()
  if (!name) return ElMessage.warning('输入分类名称')
  const exists = catPool.value.some(
    (c) => c.name === name || c.children.some((ch) => ch.name === name)
  )
  if (exists) return ElMessage.warning('该分类已存在')
  try {
    const id = await store.addCustomCategory(form.type, name, catForm.icon)
    form.categoryId = id
    catDialog.value = false
    ElMessage.success(`已添加自定义分类「${name}」`)
  } catch {
    /* 重名等服务端校验错误由请求层提示 */
  }
}
function removeCategory(c: { id: string; name: string }) {
  const root = catPool.value.find((x) => x.id === c.id)
  if (!root?.custom) return
  ElMessageBox.confirm(`删除自定义分类「${c.name}」?已有记录不受影响。`, '删除分类', {
    type: 'warning', confirmButtonText: '删除',
  }).then(async () => {
    await store.removeCustomCategory(form.type, c.id)
    if (form.categoryId === c.id) form.categoryId = ''
    ElMessage.success('已删除')
  }).catch(() => {})
}

async function save() {
  if (!form.amount || form.amount <= 0) return ElMessage.warning('请输入金额')
  if (!form.categoryId) return ElMessage.warning('请选择分类')
  const cat = flatCats.value.find((c) => c.id === form.categoryId)
  const payload = {
    type: form.type, amount: +form.amount,
    categoryId: form.categoryId, categoryName: cat?.name || '',
    date: form.date, note: form.note,
    bookId: form.bookId,
  }
  try {
    if (editingId.value) {
      await store.updateTransaction(editingId.value, payload)
      ElMessage.success('已保存修改')
    } else {
      await store.addTransaction(payload)
      ElMessage.success('已记一笔 ✓')
    }
    drawer.value = false
    loadStats() // 汇总跟随刷新(不阻塞关抽屉)
  } catch {
    /* 校验错误由请求层提示,抽屉保留现场 */
  }
}

function removeRow(t: Transaction) {
  ElMessageBox.confirm(`确定删除这笔「${t.note || t.categoryName} ¥${t.amount}」吗?`, '删除流水', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(async () => {
    await store.removeTransaction(t.id)
    ElMessage.success('已删除')
    loadStats()
  }).catch(() => {})
}

/* 当月加载更多(服务端分页下一页) */
async function loadMore() {
  await store.loadMonthTransactions(month.value, Math.floor(store.transactions.length / 50) + 1)
}

const weekNames = ['日', '一', '二', '三', '四', '五', '六']
function dayLabel(day: string) {
  const d = new Date(day + 'T00:00:00')
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 星期${weekNames[d.getDay()]}`
}

function bookName(id: string) {
  return store.books.find((b) => b.id === id)?.name || ''
}
function bookIcon(id: string) {
  return store.books.find((b) => b.id === id)?.icon || '📘'
}
</script>

<template>
  <div class="tx-page">
    <!-- 固定头部区 -->
    <div class="tx-fixed">
      <div class="page-head">
        <div>
          <h2 class="page-title">流水明细</h2>
          <p class="page-sub">{{ store.currentBook?.name }} · {{ filteredGroups.reduce((s, g) => s + g.items.length, 0) }} 笔记录</p>
        </div>
        <el-button type="primary" @click="openDrawer">
          <el-icon style="margin-right: 4px"><Plus /></el-icon>记一笔
        </el-button>
      </div>

      <div class="month-bar">
        <el-button circle text :icon="'ArrowLeft'" :disabled="month === months[months.length - 1]" @click="month = months[months.indexOf(month) + 1]" />
        <span class="month-text num">{{ month.replace('-', ' 年 ') }} 月</span>
        <el-button circle text :icon="'ArrowRight'" :disabled="month === months[0]" @click="month = months[months.indexOf(month) - 1]" />
        <span class="flex-spacer"></span>
        <span class="sum-item">支出 <b class="num money-out">¥{{ stats.expense.toFixed(2) }}</b></span>
        <span class="sum-item">收入 <b class="num money-in">¥{{ stats.income.toFixed(2) }}</b></span>
        <span class="sum-item">结余 <b class="num">¥{{ stats.balance.toFixed(2) }}</b></span>
      </div>

      <div class="filter-bar">
        <el-radio-group v-model="filters.type" size="small">
          <el-radio-button value="">全部</el-radio-button>
          <el-radio-button value="expense">支出</el-radio-button>
          <el-radio-button value="income">收入</el-radio-button>
        </el-radio-group>
        <el-select v-model="filters.categoryId" placeholder="全部分类" clearable size="small" style="width: 140px">
          <el-option v-for="c in flatCats" :key="c.id" :label="c.icon + ' ' + c.name" :value="c.id" />
        </el-select>
        <el-input v-model="filters.keyword" placeholder="备注关键词" clearable size="small" style="width: 160px" :prefix-icon="'Search'" />
      </div>
    </div>

    <!-- 独立滚动列表区 -->
    <div class="tx-scroll">
      <div class="tx-list">
        <div v-for="g in filteredGroups" :key="g.day" class="day-group">
          <div class="day-head">
            <span class="day-label">{{ dayLabel(g.day) }}</span>
            <span class="day-sum num">
              <template v-if="g.expense">支 <b class="money-out">¥{{ g.expense.toFixed(2) }}</b></template>
              <template v-if="g.income"> · 收 <b class="money-in">¥{{ g.income.toFixed(2) }}</b></template>
            </span>
          </div>
          <div
            v-for="t in g.items"
            :key="t.id"
            class="tx-row"
            @click="editRow(t)"
          >
            <span class="tx-icon">{{ catIcon(t) }}</span>
            <div class="tx-main">
              <span class="tx-cat">
                {{ t.categoryName }}
                <span
                  v-if="t.bookId && t.bookId !== store.currentBookId"
                  class="tx-book"
                  :title="'归属账本:' + bookName(t.bookId)"
                >{{ bookIcon(t.bookId) }} {{ bookName(t.bookId) }}</span>
              </span>
              <span class="tx-note" v-if="t.note">{{ t.note }}</span>
            </div>
            <span class="tx-amount num" :class="t.type === 'income' ? 'money-in' : 'money-out'">
              {{ t.type === 'income' ? '+' : '-' }}¥{{ t.amount.toFixed(2) }}
            </span>
            <el-icon class="tx-more" title="删除" @click.stop="removeRow(t)"><Delete /></el-icon>
          </div>
        </div>
        <div v-if="!filteredGroups.length && !monthLoading" class="empty-box">
          <span class="empty-icon">🧾</span>
          <p>这个月还没有记录</p>
          <el-button type="primary" plain @click="openDrawer">记第一笔</el-button>
        </div>
        <div v-if="store.hasMore && filteredGroups.length" class="load-more">
          <el-button :loading="monthLoading" text type="primary" @click="loadMore">
            加载更多(已载 {{ store.transactions.length }}/{{ store.txTotal }})
          </el-button>
        </div>
      </div>
    </div>

    <!-- 记一笔抽屉 -->
    <el-drawer v-model="drawer" :title="editingId ? '编辑流水' : '记一笔'" size="400px" :append-to-body="true">
      <div class="form-wrap">
        <el-radio-group v-model="form.type" class="type-tabs">
          <el-radio-button value="expense">支出</el-radio-button>
          <el-radio-button value="income">收入</el-radio-button>
        </el-radio-group>

        <div class="amount-input" :class="{ income: form.type === 'income' }">
          <span class="yen">¥</span>
          <input v-model.number="form.amount" type="number" placeholder="0.00" class="amount-field num" autofocus />
        </div>

        <div class="book-field">
          <span class="book-label">归属账本</span>
          <el-select v-model="form.bookId" size="large" style="width: 100%">
            <el-option v-for="b in store.books" :key="b.id" :label="b.icon + ' ' + b.name" :value="b.id" />
          </el-select>
        </div>

        <div class="cat-head">
          <span class="cat-title">分类</span>
          <button class="cat-add" @click="openCatDialog">
            <el-icon><Plus /></el-icon>自定义
          </button>
        </div>
        <div class="cat-grid">
          <div v-for="c in flatCats" :key="c.id" class="cat-cell">
            <button
              class="cat-item"
              :class="{ active: form.categoryId === c.id }"
              @click="form.categoryId = c.id"
            >
              <span class="cat-emoji">{{ c.icon }}</span>
              <span class="cat-name">{{ c.name }}</span>
            </button>
            <el-icon v-if="c.custom" class="cat-del" title="删除分类" @click.stop="removeCategory(c)"><Close /></el-icon>
          </div>
        </div>

        <el-form label-position="top" size="large">
          <el-form-item label="日期">
            <el-date-picker v-model="form.date" type="datetime" format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DD HH:mm" style="width: 100%" />
          </el-form-item>
          <el-form-item label="备注">
            <el-input v-model="form.note" placeholder="可选" maxlength="50" />
          </el-form-item>
        </el-form>

        <el-button type="primary" size="large" class="save-btn" @click="save">
          {{ editingId ? '保存修改' : '保存' }}
        </el-button>
      </div>
    </el-drawer>

    <!-- 自定义分类 -->
    <el-dialog v-model="catDialog" title="添加自定义分类" width="380px">
      <el-form label-position="top" size="large">
        <el-form-item label="分类名称">
          <el-input v-model="catForm.name" placeholder="如:撸铁" maxlength="6" />
        </el-form-item>
        <el-form-item label="图标">
          <div class="icon-row">
            <button
              v-for="ic in iconOptions"
              :key="ic"
              type="button"
              class="icon-pick"
              :class="{ active: catForm.icon === ic }"
              @click="catForm.icon = ic"
            >{{ ic }}</button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="catDialog = false">取消</el-button>
        <el-button type="primary" @click="saveCategory">添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* 页面骨架:头部固定 + 列表区独立滚动 */
.tx-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-width: 1360px;
  width: 100%;
  margin: 0 auto;
  padding: var(--gap-page);
  padding-bottom: 0;
}

.tx-fixed {
  flex-shrink: 0;
}

.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 18px;
}

.month-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.month-text { font-size: 16px; font-weight: 600; }
.flex-spacer { flex: 1; }
.sum-item { font-size: var(--fs-caption); color: var(--text-secondary); margin-left: 14px; }
.sum-item b { font-size: 14px; margin-left: 4px; font-weight: 600; }

.filter-bar {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  padding-bottom: 14px;
}

/* 列表滚动区 */
.tx-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.day-group { margin-bottom: 4px; }
.day-head {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: var(--sticky-bg);
  backdrop-filter: blur(8px);
  border: 1px solid var(--border-color);
  border-bottom: none;
  border-radius: var(--radius-card) var(--radius-card) 0 0;
  font-size: var(--fs-caption);
  color: var(--text-secondary);
}
.day-sum b { font-weight: 600; }

.tx-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-top: none;
  cursor: pointer;
  transition: background var(--dur-base) ease;
}
.tx-row:last-child {
  border-radius: 0 0 var(--radius-card) var(--radius-card);
  border-bottom: 1px solid var(--border-color);
}
.tx-row:hover { background: var(--bg-hover); }

.tx-icon {
  width: 38px;
  height: 38px;
  border-radius: 11px;
  background: var(--bg-soft);
  display: grid;
  place-items: center;
  font-size: 18px;
  flex-shrink: 0;
}
.tx-main { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.tx-cat { font-size: 14px; font-weight: 500; display: flex; align-items: center; gap: 8px; min-width: 0; }
.tx-book {
  font-size: 11px;
  font-weight: 400;
  color: var(--text-secondary);
  background: var(--bg-soft);
  border: 1px solid var(--border-color);
  border-radius: 999px;
  padding: 1px 8px;
  white-space: nowrap;
  flex-shrink: 0;
}
.tx-note {
  font-size: var(--fs-caption);
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 300px;
}
.tx-amount { font-size: 15px; font-weight: 600; min-width: 96px; text-align: right; }
.tx-more {
  width: 30px;
  height: 30px;
  border: 1px solid var(--border-strong);
  background: var(--bg-soft);
  color: var(--text-regular);
  cursor: pointer;
  border-radius: 8px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  font-size: 14px;
  transition: all var(--dur-base) ease;
}
.tx-more:hover {
  color: #fff;
  background: var(--color-expense);
  border-color: var(--color-expense);
}

.empty-box {
  padding: 60px 0;
  text-align: center;
  color: var(--text-secondary);
}
.load-more {
  display: flex;
  justify-content: center;
  padding: 18px 0 30px;
}
.empty-icon { font-size: 40px; }
.empty-box p { margin: 10px 0 16px; }

/* 抽屉表单 */
.form-wrap { padding: 0 4px; }
.type-tabs { width: 100%; display: flex; margin-bottom: 18px; }
.type-tabs :deep(.el-radio-button) { flex: 1; }
.type-tabs :deep(.el-radio-button__inner) { width: 100%; }

.amount-input {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 2px solid var(--color-expense);
  border-radius: 14px;
  padding: 12px 18px;
  margin-bottom: 18px;
  background: color-mix(in srgb, var(--color-expense) 4%, transparent);
  transition: border-color var(--dur-base) ease, background var(--dur-base) ease;
}
.amount-input.income {
  border-color: var(--color-income);
  background: color-mix(in srgb, var(--color-income) 4%, transparent);
}
.yen { font-size: 22px; font-weight: 600; color: var(--expense-ink); }
.amount-input.income .yen { color: var(--income-ink); }
.amount-field {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 30px;
  font-weight: 600;
  color: var(--text-primary);
  min-width: 0;
}
.amount-field::placeholder { color: var(--border-strong); }

.book-field { margin-bottom: 18px; }
.book-label { display: block; font-size: 13px; color: var(--text-secondary); margin-bottom: 8px; }

.cat-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.cat-title { font-size: 13px; color: var(--text-secondary); }
.cat-add {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border: none;
  background: transparent;
  color: var(--color-primary);
  font-size: 12.5px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
}
.cat-add:hover { background: color-mix(in srgb, var(--color-primary) 8%, transparent); }

.cat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 18px;
}
.cat-cell { position: relative; }
.cat-item {
  width: 100%;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  border-radius: var(--radius-input);
  padding: 10px 4px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  transition: all var(--dur-base) ease;
}
.cat-item:hover { border-color: var(--card-border-on-hover); }
.cat-item.active {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
}
.cat-emoji { font-size: 20px; }
.cat-name {
  font-size: 11.5px;
  color: var(--text-regular);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cat-del {
  position: absolute;
  top: -5px;
  right: -5px;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: var(--expense-ink);
  color: #fff;
  font-size: 10px;
  cursor: pointer;
  display: none;
  place-items: center;
}
.cat-cell:hover .cat-del { display: grid; }

.save-btn { width: 100%; border-radius: var(--radius-input); font-weight: 500; }

.icon-row { display: flex; gap: 8px; flex-wrap: wrap; }
.icon-pick {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  font-size: 19px;
  cursor: pointer;
  transition: all var(--dur-base) ease;
}
.icon-pick:hover { border-color: var(--card-border-on-hover); }
.icon-pick.active {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
}

@media (max-width: 768px) {
  .sum-item { display: none; }
}
</style>
