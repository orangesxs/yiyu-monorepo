<script setup lang="ts">
import type { AgentConversationVo } from '../agent-stream'

defineProps<{ conversations: AgentConversationVo[]; currentId: string }>()
const emit = defineEmits<{ select: [id: string]; delete: [id: string] }>()
</script>

<template>
  <div class="conv-list">
    <button
      v-for="c in conversations"
      :key="c.id"
      type="button"
      class="conv-item"
      :class="{ 'conv-item--active': c.id === currentId }"
      @click="emit('select', c.id)"
    >
      <span class="conv-item__title">{{ c.title }}</span>
      <span class="conv-item__time">{{ c.lastMessageAt.slice(5, 16) }}</span>
      <span
        class="conv-item__del"
        title="删除会话"
        @click.stop="emit('delete', c.id)"
      >✕</span>
    </button>
    <div v-if="!conversations.length" class="conv-list__empty">暂无会话</div>
  </div>
</template>

<style scoped>
.conv-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px;
  max-height: 40vh;
  overflow-y: auto;
}

.conv-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s ease;
}
.conv-item:hover {
  background: color-mix(in srgb, var(--app-agent, #7c5cff) 8%, transparent);
}
.conv-item--active {
  background: color-mix(in srgb, var(--app-agent, #7c5cff) 14%, transparent);
}

.conv-item__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--fs-body, 14px);
  color: var(--text-1, #222);
}

.conv-item__time {
  font-size: var(--fs-caption, 12px);
  color: var(--text-3, #999);
  font-variant-numeric: tabular-nums;
}

.conv-item__del {
  font-size: 12px;
  color: var(--text-3, #aaa);
  padding: 2px 4px;
  border-radius: 6px;
}
.conv-item__del:hover {
  color: var(--color-expense, #f56c6c);
  background: color-mix(in srgb, var(--color-expense, #f56c6c) 12%, transparent);
}

.conv-list__empty {
  padding: 16px;
  text-align: center;
  color: var(--text-3, #999);
  font-size: var(--fs-caption, 12px);
}
</style>
