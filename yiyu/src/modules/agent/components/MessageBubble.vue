<script setup lang="ts">
import { computed } from 'vue'
import type { AgentMessageVo, ConfirmCardVo } from '../agent-stream'
import { getCardComponent } from '../chat-cards/registry'
import ConfirmCard from '../chat-cards/builtin/ConfirmCard.vue'

const props = defineProps<{ message: AgentMessageVo }>()
const emit = defineEmits<{
  confirm: [confirmId: string]
  cancel: [confirmId: string]
}>()

const text = computed(() => String(props.message.content.text ?? ''))

const toolSummary = computed(() => {
  if (props.message.kind !== 'tool_result') return null
  const c = props.message.content as { ok?: boolean; summary?: string; name?: string }
  return { ok: !!c.ok, summary: String(c.summary ?? ''), name: String(c.name ?? '') }
})

const cardPayload = computed(() => {
  if (props.message.kind !== 'tool_result') return null
  return (props.message.content as { card?: { cardType: string; title: string; data: Record<string, unknown> } }).card ?? null
})

const confirmData = computed<ConfirmCardVo | null>(() => {
  if (props.message.kind !== 'confirm_card') return null
  return { ...(props.message.content as unknown as ConfirmCardVo), messageId: props.message.id }
})
</script>

<template>
  <!-- 用户消息 -->
  <div v-if="message.role === 'user' && message.kind === 'text'" class="bubble bubble--user">
    <span class="bubble__text">{{ text }}</span>
  </div>

  <!-- 助手文本 -->
  <div v-else-if="message.role === 'assistant' && message.kind === 'text' && text" class="bubble bubble--assistant">
    <span class="bubble__text">{{ text }}</span>
  </div>

  <!-- 工具结果:一行摘要 + 可选卡片 -->
  <template v-else-if="toolSummary">
    <div class="tool-row">
      <span :class="toolSummary.ok ? 'tool-row__ok' : 'tool-row__err'">{{ toolSummary.ok ? '✓' : '✗' }}</span>
      <span>{{ toolSummary.summary }}</span>
    </div>
    <component
      :is="getCardComponent(cardPayload!.cardType)"
      v-if="cardPayload"
      :payload="cardPayload"
      class="chat-card"
    />
  </template>

  <!-- 确认卡 -->
  <ConfirmCard v-else-if="confirmData" :card="confirmData" @confirm="emit('confirm', $event)" @cancel="emit('cancel', $event)" />
</template>

<style src="../AgentChatPanel.css" scoped></style>
