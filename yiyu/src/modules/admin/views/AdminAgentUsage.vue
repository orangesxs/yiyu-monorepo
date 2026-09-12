<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { agentApi } from '@/modules/agent/api'

const loading = ref(false)
const range = ref<'today' | '7d' | '30d'>('7d')
const summary = ref<{
  totalCalls: number
  totalPromptTokens: number
  totalCompletionTokens: number
  byDay: { date: string; calls: number; tokens: number }[]
  byUser: { userId: string; nickname: string; avatar: string; calls: number; promptTokens: number; completionTokens: number }[]
} | null>(null)

const maxCalls = computed(() => Math.max(1, ...(summary.value?.byDay.map((d) => d.calls) ?? [1])))

function rangeDates(): { from?: string; to?: string } {
  const to = new Date()
  const from = new Date()
  if (range.value === 'today') {
    // 今天
  } else if (range.value === '7d') from.setDate(to.getDate() - 6)
  else from.setDate(to.getDate() - 29)
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { from: fmt(from), to: fmt(to) }
}

async function load() {
  loading.value = true
  try {
    summary.value = await agentApi.adminUsageSummary(rangeDates().from, rangeDates().to)
  } finally {
    loading.value = false
  }
}

const totalTokens = computed(() => (summary.value?.totalPromptTokens ?? 0) + (summary.value?.totalCompletionTokens ?? 0))

onMounted(() => void load().catch(() => {}))
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">AI 用量</h2>
        <p class="page-sub">LLM 调用与 token 消耗统计(不含连通测试;仅统计,不限额)</p>
      </div>
      <el-radio-group v-model="range" @change="load">
        <el-radio-button value="today">今天</el-radio-button>
        <el-radio-button value="7d">近 7 天</el-radio-button>
        <el-radio-button value="30d">近 30 天</el-radio-button>
      </el-radio-group>
    </div>

    <div v-loading="loading">
      <div class="usage-stats">
        <div class="yiyu-card stat"><span class="stat-num num">{{ summary?.totalCalls ?? 0 }}</span><span class="stat__label">调用次数</span></div>
        <div class="yiyu-card stat"><span class="stat-num num">{{ summary?.totalPromptTokens ?? 0 }}</span><span class="stat__label">输入 tokens</span></div>
        <div class="yiyu-card stat"><span class="stat-num num">{{ summary?.totalCompletionTokens ?? 0 }}</span><span class="stat__label">输出 tokens</span></div>
        <div class="yiyu-card stat"><span class="stat-num num">{{ totalTokens }}</span><span class="stat__label">合计 tokens</span></div>
      </div>

      <div class="yiyu-card sec">
        <h3 class="sec__title">每日调用</h3>
        <div v-if="summary?.byDay.length" class="chart">
          <div v-for="d in summary.byDay" :key="d.date" class="chart__col" :title="`${d.date}:${d.calls} 次`">
            <div class="chart__bar" :style="{ height: `${(d.calls / maxCalls) * 100}%` }"></div>
            <span class="chart__label">{{ d.date.slice(5) }}</span>
          </div>
        </div>
        <el-empty v-else description="暂无调用" :image-size="60" />
      </div>

      <div class="yiyu-card sec">
        <h3 class="sec__title">按用户</h3>
        <el-table v-if="summary?.byUser.length" :data="summary.byUser" size="small">
          <el-table-column label="用户" min-width="140">
            <template #default="{ row }">{{ row.avatar }} {{ row.nickname }}</template>
          </el-table-column>
          <el-table-column prop="calls" label="调用次数" width="100" align="right" />
          <el-table-column label="输入 tokens" width="120" align="right">
            <template #default="{ row }"><span class="num">{{ row.promptTokens }}</span></template>
          </el-table-column>
          <el-table-column label="输出 tokens" width="120" align="right">
            <template #default="{ row }"><span class="num">{{ row.completionTokens }}</span></template>
          </el-table-column>
        </el-table>
        <el-empty v-else description="暂无数据" :image-size="60" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.usage-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--gap-4, 16px);
  margin-bottom: var(--gap-4, 16px);
}
.stat {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stat__label {
  font-size: var(--fs-caption, 12px);
  color: var(--text-3, #999);
}
.sec {
  padding: 16px 20px;
  margin-bottom: var(--gap-4, 16px);
}
.sec__title {
  margin: 0 0 12px;
  font-size: var(--fs-body, 15px);
}
.chart {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 140px;
  padding: 0 4px;
}
.chart__col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  height: 100%;
  justify-content: flex-end;
  min-width: 0;
}
.chart__bar {
  width: 70%;
  max-width: 28px;
  border-radius: 4px 4px 0 0;
  background: var(--app-agent, #7c5cff);
  opacity: 0.8;
  min-height: 2px;
}
.chart__label {
  font-size: 11px;
  color: var(--text-3, #999);
  transform: scale(0.85);
  white-space: nowrap;
}
</style>
