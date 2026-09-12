<script setup lang="ts">
import { ref } from 'vue'
import { useAgentStore } from '../stores/agent'

const props = defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ send: [text: string]; stop: []; regenerate: [] }>()
const store = useAgentStore()

const input = ref('')
const quickChips = [
  { label: '记一笔', text: '记一笔 ' },
  { label: '本月总结', text: '这个月收支总结一下' },
  { label: '最近流水', text: '看下最近几笔流水' },
]

function send() {
  const text = input.value.trim()
  if (!text || props.disabled) return
  emit('send', text)
  input.value = ''
}
</script>

<template>
  <footer class="chat-input">
    <div class="chat-input__chips">
      <button
        v-for="chip in quickChips"
        :key="chip.label"
        type="button"
        class="chip"
        :disabled="disabled"
        @click="chip.label === '记一笔' ? ((input = chip.text), $el.querySelector?.('textarea')?.focus?.()) : emit('send', chip.text)"
      >
        {{ chip.label }}
      </button>
    </div>
    <div class="chat-input__row">
      <el-input
        v-model="input"
        type="textarea"
        :autosize="{ minRows: 1, maxRows: 4 }"
        placeholder="问点什么,或「记一笔午饭 25」…"
        :disabled="disabled"
        resize="none"
        @keydown.enter.exact.prevent="send"
      />
      <el-button v-if="store.streaming" type="danger" plain circle title="停止生成" @click="emit('stop')">■</el-button>
      <el-button v-else type="primary" circle :disabled="disabled || !input.trim()" title="发送" @click="send">➤</el-button>
    </div>
  </footer>
</template>

<style scoped>
.chat-input {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 4px 4px;
}

.chat-input__chips {
  display: flex;
  gap: 8px;
}

.chip {
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--app-agent, #7c5cff) 35%, transparent);
  background: color-mix(in srgb, var(--app-agent, #7c5cff) 8%, transparent);
  color: var(--app-agent, #7c5cff);
  font-size: var(--fs-caption, 12px);
  cursor: pointer;
  transition: background 0.15s ease;
}
.chip:hover:not(:disabled) {
  background: color-mix(in srgb, var(--app-agent, #7c5cff) 16%, transparent);
}
.chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.chat-input__row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}
</style>
