<script setup lang="ts">
import type { CardPayload } from '../../agent-stream'

defineProps<{ payload: CardPayload }>()
</script>

<template>
  <div class="fallback-card yiyu-card">
    <p class="fallback-card__title">{{ payload.title }}</p>
    <pre class="fallback-card__json">{{ JSON.stringify(payload.data, null, 2) }}</pre>
  </div>
</template>

<style scoped>
.fallback-card {
  align-self: stretch;
  padding: 10px 12px;
}
.fallback-card__title {
  margin: 0 0 6px;
  font-size: var(--fs-caption, 12px);
  color: var(--text-3, #999);
}
.fallback-card__json {
  margin: 0;
  font-size: 12px;
  color: var(--text-2, #666);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow-y: auto;
}
</style>
