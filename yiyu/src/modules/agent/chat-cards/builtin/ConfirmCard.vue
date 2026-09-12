<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { ConfirmCardVo } from '../../agent-stream'

const props = defineProps<{ card: ConfirmCardVo }>()
const emit = defineEmits<{ confirm: [confirmId: string]; cancel: [confirmId: string] }>()

const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => (now.value = Date.now()), 1000)
})
onBeforeUnmount(() => clearInterval(timer))

const expired = computed(() => new Date(props.card.expiresAt).getTime() < now.value)
const remainSec = computed(() => Math.max(0, Math.floor((new Date(props.card.expiresAt).getTime() - now.value) / 1000)))

const statusLabel = computed(() => {
  const map: Record<string, string> = {
    pending: '待确认',
    confirmed: '已确认',
    cancelled: '已取消',
    expired: '已过期',
    executed: '已执行',
    failed: '执行失败',
  }
  return map[props.card.status] ?? props.card.status
})

const interactive = computed(() => props.card.status === 'pending' && !expired.value)
</script>

<template>
  <div class="confirm-card yiyu-card" :class="[`confirm-card--${card.risk}`, { 'confirm-card--done': !interactive }]">
    <header class="confirm-card__head">
      <span class="confirm-card__label">{{ card.label }}</span>
      <span class="confirm-card__risk" :class="`risk-${card.risk}`">
        {{ card.risk === 'high' ? '高风险' : '需确认' }}
      </span>
      <span class="confirm-card__status">{{ expired && card.status === 'pending' ? '已过期' : statusLabel }}</span>
    </header>

    <ul class="confirm-card__lines">
      <li v-for="(line, i) in card.preview.lines" :key="i">{{ line }}</li>
    </ul>

    <p v-if="card.warning && interactive" class="confirm-card__warning">⚠ {{ card.warning }}</p>

    <!-- 执行结果摘要 -->
    <p v-if="card.result" class="confirm-card__result" :class="card.result.ok ? 'ok' : 'err'">
      {{ card.result.ok ? '✓' : '✗' }} {{ card.result.summary }}
    </p>

    <footer v-if="interactive" class="confirm-card__actions">
      <span class="confirm-card__countdown">{{ Math.floor(remainSec / 60) }}:{{ String(remainSec % 60).padStart(2, '0') }}</span>
      <el-button size="small" @click="emit('cancel', card.confirmId)">取消</el-button>
      <el-button size="small" :type="card.risk === 'high' ? 'danger' : 'primary'" @click="emit('confirm', card.confirmId)">
        {{ card.risk === 'high' ? '确认执行(高风险)' : '确认执行' }}
      </el-button>
    </footer>
  </div>
</template>

<style scoped>
.confirm-card {
  align-self: stretch;
  margin: 2px 0;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--color-warning, #e6a23c) 45%, transparent);
  background: color-mix(in srgb, var(--color-warning, #e6a23c) 6%, var(--bg-card, #fff));
}
.confirm-card--high {
  border-color: color-mix(in srgb, var(--color-expense, #f56c6c) 55%, transparent);
  background: color-mix(in srgb, var(--color-expense, #f56c6c) 6%, var(--bg-card, #fff));
}
.confirm-card--done {
  opacity: 0.75;
}

.confirm-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.confirm-card__label {
  font-weight: 600;
  font-size: var(--fs-body, 14px);
}

.confirm-card__risk {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 999px;
}
.risk-medium {
  background: color-mix(in srgb, var(--color-warning, #e6a23c) 18%, transparent);
  color: var(--color-warning, #e6a23c);
}
.risk-high {
  background: color-mix(in srgb, var(--color-expense, #f56c6c) 18%, transparent);
  color: var(--color-expense, #f56c6c);
}

.confirm-card__status {
  margin-left: auto;
  font-size: var(--fs-caption, 12px);
  color: var(--text-3, #999);
}

.confirm-card__lines {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.confirm-card__lines li {
  font-size: var(--fs-body, 14px);
  color: var(--text-1, #222);
}

.confirm-card__warning {
  margin: 8px 0 0;
  font-size: var(--fs-caption, 12px);
  color: var(--color-expense, #f56c6c);
}

.confirm-card__result {
  margin: 8px 0 0;
  font-size: var(--fs-caption, 12px);
}
.confirm-card__result.ok {
  color: var(--color-income, #67c23a);
}
.confirm-card__result.err {
  color: var(--color-expense, #f56c6c);
}

.confirm-card__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 10px;
}

.confirm-card__countdown {
  margin-right: auto;
  font-size: var(--fs-caption, 12px);
  color: var(--text-3, #999);
  font-variant-numeric: tabular-nums;
}
</style>
