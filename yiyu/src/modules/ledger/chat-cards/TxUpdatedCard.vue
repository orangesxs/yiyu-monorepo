<script setup lang="ts">
import type { CardPayload } from '@/modules/agent/agent-stream'

defineProps<{ payload: CardPayload }>()
</script>

<template>
  <div class="tx-updated yiyu-card">
    <p class="tx-updated__title">✓ {{ payload.title }}</p>
    <p class="tx-updated__row">备注已更新:{{ (payload.data as { note: string }).note }}</p>
  </div>
</template>

<style scoped>
.tx-updated {
  align-self: stretch;
  padding: 10px 14px;
}
.tx-updated__title {
  margin: 0 0 4px;
  font-size: var(--fs-caption, 12px);
  color: var(--color-income, #67c23a);
}
.tx-updated__row {
  margin: 0;
  font-size: var(--fs-body, 14px);
  color: var(--text-1, #222);
}
</style>
