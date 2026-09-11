<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { useAdminStore } from '../stores/admin'
import { moduleLabels, actionLabels, actionTagTypes } from '../types'
import type { AdminLog } from '../types'

use([CanvasRenderer, BarChart, PieChart, GridComponent, TooltipComponent])

const adminStore = useAdminStore()

onMounted(() => {
  adminStore.fetchDashboard().catch(() => {})
})

const d = computed(() => adminStore.dashboard)

/* ---- 统计卡(资源口径:只统计系统资源,不展示流水/收支等业务数据) ---- */
const statCards = computed(() => [
  { label: '注册用户', value: `${d.value?.userCount ?? '—'}`, unit: '人' },
  { label: '管理员', value: `${d.value?.adminCount ?? '—'}`, unit: '人' },
  { label: '账本', value: `${d.value?.bookCount ?? '—'}`, unit: '本' },
  { label: '日志', value: `${d.value?.logCount ?? '—'}`, unit: '条' },
])

/* ---- 近 7 日操作趋势(柱状,服务端按自然日聚合) ---- */
const trendOption = computed(() => {
  const axisColor = '#909399'
  const splitColor = 'rgba(144,147,153,0.18)'
  const days = d.value?.logCountByDay || []
  return {
    tooltip: { trigger: 'axis', formatter: (ps: { marker: string; axisValue: string; value: number }[]) => ps.map((p) => `${p.marker}${p.axisValue} ${p.value} 条`).join('') },
    grid: { left: 40, right: 20, top: 20, bottom: 28 },
    xAxis: { type: 'category', data: days.map((x) => x.label), axisLine: { lineStyle: { color: splitColor } }, axisLabel: { color: axisColor, fontSize: 11 } },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: splitColor } }, axisLabel: { color: axisColor, fontSize: 11 } },
    series: [{
      name: '操作数',
      type: 'bar',
      barWidth: 22,
      itemStyle: { color: '#64748B', borderRadius: [4, 4, 0, 0] },
      data: days.map((x) => x.count),
    }],
  }
})

/* ---- 数据分布(环形:账本/用户/日志计数,不含流水等业务数据) ---- */
const distOption = computed(() => {
  const data = [
    { name: '账本', value: d.value?.bookCount ?? 0, itemStyle: { color: '#18A058' } },
    { name: '用户', value: d.value?.userCount ?? 0, itemStyle: { color: '#7C6AF0' } },
    { name: '日志', value: d.value?.logCount ?? 0, itemStyle: { color: '#F59B0E' } },
  ]
  return {
    tooltip: { trigger: 'item', formatter: (p: { name: string; value: number; percent: number }) => `${p.name} ${p.value}(${p.percent}%)` },
    series: [{
      type: 'pie',
      radius: ['58%', '82%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 6, borderColor: 'transparent', borderWidth: 2 },
      label: { show: false },
      emphasis: { scaleSize: 6 },
      data,
    }],
  }
})

/* ---- 最近操作(服务端取最新 8 条) ---- */
interface RecentLog extends AdminLog {
  operatorName: string
  operatorAvatar: string
}
const recentLogs = computed<RecentLog[]>(() =>
  (d.value?.latestLogs || []).map((l) => ({
    id: l.id,
    time: l.time,
    moduleId: l.moduleId,
    action: l.action,
    operatorId: l.operatorId,
    summary: l.summary,
    operatorName: l.operator?.nickname || '未知用户',
    operatorAvatar: l.operator?.avatar || '👤',
  }))
)

/* 趋势区间文案(服务端返回首尾日期) */
const trendRange = computed(() => {
  const days = d.value?.logCountByDay || []
  if (!days.length) return ''
  return `${days[0].date.slice(5)} ~ ${days[days.length - 1].date.slice(5)}`
})
/* 截至文案(真实日期) */
const asOf = computed(() => {
  const t = new Date()
  const p = (n: number) => (n < 10 ? '0' + n : '' + n)
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`
})
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">数据概览</h2>
        <p class="page-sub num">系统资源与操作态势 · 截至 {{ asOf }}</p>
      </div>
    </div>

    <!-- 统计卡行 -->
    <div class="stat-grid">
      <div v-for="s in statCards" :key="s.label" class="yiyu-card stat-card">
        <span class="sum-label">{{ s.label }}</span>
        <span class="stat-num num">{{ s.value }}<small v-if="s.unit" class="unit"> {{ s.unit }}</small></span>
      </div>
    </div>

    <!-- 双图表区 -->
    <div class="chart-grid">
      <div class="yiyu-card chart-card">
        <div class="chart-head">
          <span class="chart-title">近 7 日操作趋势</span>
          <span class="chart-sub num">{{ trendRange }}</span>
        </div>
        <v-chart :option="trendOption" class="chart" autoresize />
      </div>
      <div class="yiyu-card chart-card">
        <div class="chart-head">
          <span class="chart-title">数据分布</span>
          <span class="chart-sub">按资源类型</span>
        </div>
        <v-chart :option="distOption" class="chart chart--pie" autoresize />
      </div>
    </div>

    <!-- 最近操作 -->
    <div class="yiyu-card recent-card">
      <div class="chart-head">
        <span class="chart-title">最近操作</span>
        <router-link class="recent-more" to="/admin/logs">查看全部 →</router-link>
      </div>
      <div class="recent-list">
        <div v-for="l in recentLogs" :key="l.id" class="recent-row slide-in-row">
          <span class="recent-time num">{{ l.time.slice(5, 16) }}</span>
          <span class="recent-avatar">{{ l.operatorAvatar }}</span>
          <span class="recent-name">{{ l.operatorName }}</span>
          <el-tag size="small" effect="plain" class="recent-module">{{ moduleLabels[l.moduleId] }}</el-tag>
          <el-tag size="small" :type="actionTagTypes[l.action]" effect="light">{{ actionLabels[l.action] }}</el-tag>
          <span class="recent-summary">{{ l.summary }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style src="./AdminDashboard.css" scoped></style>
