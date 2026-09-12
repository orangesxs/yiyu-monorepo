<script setup lang="ts">
import { computed } from 'vue'
import type { CardPayload } from '@/modules/agent/agent-stream'

const props = defineProps<{ payload: CardPayload }>()

const stats = computed(
  () => (props.payload.data.stats as { income: number; expense: number; balance: number; count: number }) ?? null,
)
const expenseTop = computed(
  () => (props.payload.data.categories as { expense: { name: string; value: number }[] })?.expense ?? [],
)
</script>

<template>
  <div class="report-card yiyu-card">
    <p class="report-card__title">{{ payload.title }}</p>
    <div v-if="stats" class="report-card__stats">
      <div class="stat">
        <span class="stat__label">支出</span>
        <span class="stat__value num money-out">{{ stats.expense.toFixed(2) }}</span>
      </div>
      <div class="stat">
        <span class="stat__label">收入</span>
        <span class="stat__value num money-in">{{ stats.income.toFixed(2) }}</span>
      </div>
      <div class="stat">
        <span class="stat__label">结余</span>
        <span class="stat__value num">{{ stats.balance.toFixed(2) }}</span>
      </div>
    </div>
    <ul v-if="expenseTop.length" class="report-card__cats">
      <li v-for="c in expenseTop" :key="c.name">
        <span class="cat__name">{{ c.name }}</span>
        <span class="cat__bar">
          <i :style="{ width: `${Math.max(4, (c.value / expenseTop[0].value) * 100)}%` }"></i>
        </span>
        <span class="cat__value num">{{ c.value.toFixed(2) }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.report-card {
  align-self: stretch;
  padding: 12px 14px;
}
.report-card__title {
  margin: 0 0 8px;
  font-size: var(--fs-caption, 12px);
  color: var(--text-3, #999);
}
.report-card__stats {
  display: flex;
  gap: 12px;
  margin-bottom: 10px;
}
.stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.stat__label {
  font-size: var(--fs-caption, 12px);
  color: var(--text-3, #999);
}
.stat__value {
  font-size: 16px;
  font-weight: 600;
}
.report-card__cats {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.report-card__cats li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-caption, 12px);
}
.cat__name {
  width: 64px;
  color: var(--text-2, #666);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cat__bar {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--text-3, #ccc) 18%, transparent);
  overflow: hidden;
}
.cat__bar i {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: var(--app-ledger, #409eff);
}
.cat__value {
  width: 72px;
  text-align: right;
  color: var(--text-1, #222);
}
</style>
