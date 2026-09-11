<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { useAdminStore } from '../stores/admin'
import { moduleLabels, actionLabels, actionTagTypes } from '../types'
import type { LogModule, LogAction } from '../types'
import type { AdminLogDto } from '@/shared/api'

const adminStore = useAdminStore()

/* ---- 日志列表(服务端分页) ---- */
const logs = ref<AdminLogDto[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const res = await adminStore.fetchLogs({
      page: page.value,
      pageSize: pageSize.value,
      ...(moduleFilter.value ? { module: moduleFilter.value } : {}),
      ...(actionFilter.value ? { action: actionFilter.value } : {}),
    })
    logs.value = res.items
    total.value = res.total
  } catch {
    /* 错误由请求层提示 */
  } finally {
    loading.value = false
  }
}
onMounted(load)

/* ---- 筛选(模块 + 类型;摘要/操作人关键词由服务端摘要匹配不支持,改为前端本地匹配当前页) ---- */
const moduleFilter = ref<LogModule | ''>('')
const actionFilter = ref<LogAction | ''>('')
const keyword = ref('')

let filterTimer: ReturnType<typeof setTimeout> | null = null
watch([moduleFilter, actionFilter], () => {
  page.value = 1
  load()
})
watch(keyword, () => {
  /* 关键词只过滤当前页展示(服务端无该参数) */
  if (filterTimer) clearTimeout(filterTimer)
})

const filteredLogs = computed<AdminLogDto[]>(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return logs.value
  return logs.value.filter((l) => {
    const opName = l.operator?.nickname || ''
    return l.summary.toLowerCase().includes(kw) || opName.toLowerCase().includes(kw)
  })
})
const hasFilter = computed(() => !!moduleFilter.value || !!actionFilter.value || !!keyword.value.trim())
function clearFilters() {
  moduleFilter.value = ''
  actionFilter.value = ''
  keyword.value = ''
}

/** 今日日志数(由列表统计不可靠,概览页有精确值;此处按当日日期前缀统计当前结果集) */
const todayStr = (() => {
  const d = new Date()
  const p = (n: number) => (n < 10 ? '0' + n : '' + n)
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
})()
const stats = computed(() => [
  { label: '日志总数', value: total.value },
  { label: '本页', value: logs.value.length },
  { label: '本页今日', value: logs.value.filter((l) => l.time.startsWith(todayStr)).length },
])

function operatorOf(l: AdminLogDto) {
  return l.operator ? { name: l.operator.nickname, avatar: l.operator.avatar } : null
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">系统日志</h2>
        <p class="page-sub">只读操作审计 · 最新在前</p>
      </div>
    </div>

    <!-- 统计行 -->
    <div class="log-stats">
      <div v-for="s in stats" :key="s.label" class="user-stat">
        <span class="stat-num num">{{ s.value }}</span>
        <span class="user-stat-label">{{ s.label }}</span>
      </div>
    </div>

    <!-- 筛选区 -->
    <div class="yiyu-card filter-bar">
      <el-select v-model="moduleFilter" placeholder="模块" clearable class="filter-select">
        <el-option v-for="(label, key) in moduleLabels" :key="key" :label="label" :value="key" />
      </el-select>
      <el-select v-model="actionFilter" placeholder="类型" clearable class="filter-select">
        <el-option v-for="(label, key) in actionLabels" :key="key" :label="label" :value="key" />
      </el-select>
      <el-input v-model="keyword" placeholder="搜索摘要或操作人(当前页)" :prefix-icon="Search" clearable class="filter-search" />
    </div>

    <!-- 日志列表(只读,无操作列) -->
    <div class="yiyu-card log-list" v-loading="loading">
      <div v-for="l in filteredLogs" :key="l.id" class="log-row slide-in-row">
        <span class="log-time num">{{ l.time }}</span>
        <span class="log-avatar">{{ operatorOf(l)?.avatar || '👤' }}</span>
        <span class="log-name">{{ operatorOf(l)?.name || '未知用户' }}</span>
        <el-tag size="small" effect="plain" class="log-module">{{ moduleLabels[l.moduleId] }}</el-tag>
        <el-tag size="small" :type="actionTagTypes[l.action]" effect="light">{{ actionLabels[l.action] }}</el-tag>
        <span class="log-summary">{{ l.summary }}</span>
      </div>

      <div v-if="!filteredLogs.length && !loading" class="empty">
        <span class="empty-icon">📭</span>
        <p>没有符合条件的日志</p>
        <el-button v-if="hasFilter" size="small" @click="clearFilters">清空筛选</el-button>
      </div>

      <div class="pager-row">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          background
          @current-change="load"
          @size-change="() => { page = 1; load() }"
        />
      </div>
    </div>
  </div>
</template>

<style src="./AdminLogs.css" scoped></style>
