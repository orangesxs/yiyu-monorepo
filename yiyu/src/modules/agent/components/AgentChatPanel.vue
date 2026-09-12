<script setup lang="ts">
import { nextTick, onMounted, ref, watch, computed } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAgentStore } from '../stores/agent'
import { useLedgerStore } from '@/modules/ledger/stores/ledger'
import type { PageContext } from '../agent-stream'
import MessageBubble from './MessageBubble.vue'
import ChatInput from './ChatInput.vue'
import ConversationList from './ConversationList.vue'

const store = useAgentStore()
const route = useRoute()
const ledgerStore = useLedgerStore()

const showList = ref(false)

onMounted(() => {
  if (!store.conversations.length) void store.createConversation()
  else if (!store.currentId) void store.openConversation(store.conversations[0].id)
})

/** 页面上下文:当前路由 + ledger 账本提示 */
function currentPageContext(): PageContext {
  const app = (route.meta.app as string) || 'portal'
  const title = (route.meta.title as string) || '广场'
  let hint: string | undefined
  if (app === 'ledger') {
    const book = ledgerStore.books.find((b) => b.id === ledgerStore.currentBookId)
    if (book) hint = `当前账本:${book.name}`
  }
  return { app, title, ...(hint ? { hint } : {}) }
}

const streamScroll = computed(() => store.streaming)

async function handleSend(text: string) {
  if (!store.currentId) await store.createConversation()
  await store.sendMessage(text, currentPageContext())
}

/** 新会话:当前已是"只有开场白的空新会话"时不再创建,直接聚焦输入 */
async function handleNew() {
  showList.value = false
  if (store.currentId && store.messages.length <= 1 && store.messages[0]?.role === 'assistant') {
    focusInput()
    return
  }
  await store.createConversation()
  focusInput()
}

/** 复制整个会话为纯文本(用户/助手/工具结果/确认卡状态),便于导出测试内容 */
async function copyConversation() {
  const lines: string[] = []
  for (const m of store.messages) {
    const c = m.content as Record<string, unknown>
    if (m.role === 'user' && m.kind === 'text') {
      lines.push(`用户:${String(c.text ?? '')}`)
    } else if (m.role === 'assistant' && m.kind === 'text') {
      lines.push(`助手:${String(c.text ?? '')}`)
    } else if (m.role === 'assistant' && m.kind === 'confirm_card') {
      const card = c as unknown as { label: string; risk: string; preview: { lines: string[] }; status: string; result?: { ok: boolean; summary: string } }
      lines.push(`[确认卡·${card.label}·${card.risk === 'high' ? '高风险' : '中风险'}·${card.status}]`)
      lines.push(...card.preview.lines.map((l) => `  ${l}`))
      if (card.result) lines.push(`  结果:${card.result.ok ? '✓' : '✗'} ${card.result.summary}`)
    } else if (m.role === 'tool' && m.kind === 'tool_result') {
      lines.push(`[工具·${String(c.name)}] ${String(c.summary ?? '')}`)
    }
  }
  const text = lines.join('\n')
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(`已复制 ${store.messages.length} 条消息`)
  } catch {
    // 兜底:临时 textarea + execCommand(非聚焦/权限受限环境)
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    if (ok) ElMessage.success(`已复制 ${store.messages.length} 条消息`)
    else ElMessage.error('复制失败,请手动选择文本')
  }
}

const inputWrap = ref<HTMLElement>()
function focusInput() {
  nextTick(() => inputWrap.value?.querySelector('textarea')?.focus())
}

async function handleSwitch(id: string) {
  showList.value = false
  await store.openConversation(id)
}

async function handleDelete(id: string) {
  try {
    await ElMessageBox.confirm('删除该会话?对话记录不可恢复。', '删除会话', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  await store.deleteConversation(id)
  if (!store.currentId && store.conversations.length) await store.openConversation(store.conversations[0].id)
}

const scrollRef = ref<HTMLElement>()
async function scrollBottom() {
  await nextTick()
  scrollRef.value?.scrollTo({ top: scrollRef.value.scrollHeight })
}
watch(
  () => [store.messages.length, store.streamingText],
  () => void scrollBottom(),
)
onMounted(() => void scrollBottom())
</script>

<template>
  <div class="agent-panel">
    <header class="agent-panel__head">
      <button class="icon-btn" type="button" title="会话列表" @click="showList = !showList">☰</button>
      <div class="agent-panel__title">
        <span class="agent-panel__name">✦ 一隅 AI</span>
        <span class="agent-panel__sub">{{ store.streaming ? '正在输入…' : '记账 · 查询 · 闲聊' }}</span>
      </div>
      <button class="icon-btn" type="button" title="新会话" @click="handleNew">＋</button>
      <button class="icon-btn" type="button" title="复制对话" @click="copyConversation">⎘</button>
      <button class="icon-btn" type="button" title="关闭" @click="store.closeDrawer()">✕</button>
    </header>

    <ConversationList
      v-if="showList"
      ref="listRef"
      :conversations="store.conversations"
      :current-id="store.currentId"
      @select="handleSwitch"
      @delete="handleDelete"
    />

    <main ref="scrollRef" class="agent-panel__body">
      <div v-if="!store.usable && store.status" class="agent-panel__notice">
        {{ store.status.llmConfigured ? 'AI 助手已被管理员停用' : 'AI 服务尚未配置,请联系管理员' }}
      </div>
      <MessageBubble
        v-for="m in store.messages"
        :key="m.id + ':' + m.seq"
        :message="m"
        @confirm="store.confirmCard"
        @cancel="store.cancelCard"
      />
      <div v-if="store.streaming && store.streamingText" class="bubble bubble--assistant">
        <span class="bubble__text">{{ store.streamingText }}</span>
        <span class="bubble__cursor"></span>
      </div>
      <div v-else-if="store.streaming" class="bubble bubble--assistant">
        <span class="bubble__thinking">思考中<span class="dots">…</span></span>
      </div>
    </main>

    <div ref="inputWrap">
      <ChatInput :disabled="!store.usable || streamScroll" @send="handleSend" @stop="store.abort()" @regenerate="store.regenerate()" />
    </div>
  </div>
</template>

<style src="../AgentChatPanel.css" scoped></style>
