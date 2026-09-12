<script setup lang="ts">
import { computed } from 'vue'
import type { CardPayload } from '@/modules/agent/agent-stream'

const props = defineProps<{ payload: CardPayload }>()

const rows = computed(
  () =>
    (props.payload.data.rows as { code: string; createdAt: string; usedAt: string | null }[]) ?? [],
)
const unused = computed(() => (props.payload.data.unused as number) ?? 0)
</script>

<template>
  <div class="invites-card yiyu-card">
    <p class="invites-card__title">{{ payload.title }} · 未使用 {{ unused }} 个</p>
    <ul class="invites-card__list">
      <li v-for="r in rows" :key="r.code">
        <span class="num">{{ r.code }}</span>
        <span :class="r.usedAt ? 'used' : 'free'">{{ r.usedAt ? '已使用' : '未使用' }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.invites-card {
  align-self: stretch;
  padding: 12px 14px;
}
.invites-card__title {
  margin: 0 0 8px;
  font-size: var(--fs-caption, 12px);
  color: var(--text-3, #999);
}
.invites-card__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.invites-card__list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--fs-body, 14px);
}
.invites-card__list .num {
  letter-spacing: 1px;
  color: var(--text-1, #222);
}
.free {
  color: var(--color-income, #67c23a);
  font-size: var(--fs-caption, 12px);
}
.used {
  color: var(--text-3, #999);
  font-size: var(--fs-caption, 12px);
}
</style>
