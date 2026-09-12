<script setup lang="ts">
import type { CardPayload } from '@/modules/agent/agent-stream'

defineProps<{ payload: CardPayload }>()
</script>

<template>
  <div class="tx-deleted yiyu-card">
    <p class="tx-deleted__title">🗑 {{ payload.title }}</p>
    <p class="tx-deleted__row">该笔流水已删除,可在系统日志中追溯</p>
  </div>
</template>

<style scoped>
.tx-deleted {
  align-self: stretch;
  padding: 10px 14px;
}
.tx-deleted__title {
  margin: 0 0 4px;
  font-size: var(--fs-caption, 12px);
  color: var(--text-3, #999);
}
.tx-deleted__row {
  margin: 0;
  font-size: var(--fs-body, 14px);
  color: var(--text-1, #222);
}
</style>
