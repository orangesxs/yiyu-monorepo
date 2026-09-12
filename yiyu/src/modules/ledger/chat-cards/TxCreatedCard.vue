<script setup lang="ts">
import { computed } from 'vue'
import type { CardPayload } from '@/modules/agent/agent-stream'

const props = defineProps<{ payload: CardPayload }>()

const created = computed(
  () =>
    props.payload.data as {
      id: string
      type: string
      amount: number
      category: string
      date: string
      note: string
      bookName: string
    },
)
</script>

<template>
  <div class="tx-created yiyu-card">
    <p class="tx-created__title">✓ {{ payload.title }}</p>
    <p class="tx-created__main">
      <span class="num" :class="created.type === 'expense' ? 'money-out' : 'money-in'">
        {{ created.type === 'expense' ? '-' : '+' }}{{ created.amount.toFixed(2) }}
      </span>
      <span class="tx-created__cat">{{ created.category }}</span>
      <span class="tx-created__meta">{{ created.date }} · {{ created.bookName }}</span>
    </p>
  </div>
</template>

<style scoped>
.tx-created {
  align-self: stretch;
  padding: 12px 14px;
}
.tx-created__title {
  margin: 0 0 6px;
  font-size: var(--fs-caption, 12px);
  color: var(--color-income, #67c23a);
}
.tx-created__main {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}
.tx-created__main .num {
  font-size: 20px;
  font-weight: 700;
}
.tx-created__cat {
  font-size: var(--fs-body, 14px);
  color: var(--text-1, #222);
}
.tx-created__meta {
  font-size: var(--fs-caption, 12px);
  color: var(--text-3, #999);
}
</style>
