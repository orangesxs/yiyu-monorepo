import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ElMessage } from 'element-plus'
import { agentApi } from '../api'
import {
  streamAgentSse,
  type AgentConversationVo,
  type AgentMessageVo,
  type AgentSseEvent,
  type ConfirmCardVo,
  type PageContext,
} from '../agent-stream'

/**
 * Agent 全局状态:抽屉开合/会话列表/当前会话消息/流式状态/确认卡。
 * SSE 事件经 applyEvent reducer 就地更新消息流。
 */
export const useAgentStore = defineStore('agent', () => {
  const drawerOpen = ref(false)
  const status = ref<{ llmConfigured: boolean; agentEnabled: boolean } | null>(null)
  const conversations = ref<AgentConversationVo[]>([])
  const currentId = ref('')
  const messages = ref<AgentMessageVo[]>([])
  const streaming = ref(false)
  /** 正在流式追加的气泡(本地临时代体,不入库形状) */
  const streamingText = ref('')
  const aborter = ref<AbortController | null>(null)
  const loaded = ref(false)
  const loading = ref(false)

  const usable = computed(() => !!status.value?.llmConfigured && !!status.value?.agentEnabled)
  /** 当前会话内的 pending 确认卡(重开抽屉时从历史还原) */
  const pendingCard = computed(() => {
    const hit = [...messages.value]
      .reverse()
      .find((m) => m.kind === 'confirm_card' && (m.content as { status?: string }).status === 'pending')
    if (!hit) return null
    const c = hit.content as unknown as ConfirmCardVo
    return new Date(c.expiresAt).getTime() > Date.now() ? c : null
  })

  async function refreshStatus() {
    try {
      status.value = await agentApi.status()
    } catch {
      status.value = { llmConfigured: false, agentEnabled: false }
    }
  }

  async function loadConversations() {
    conversations.value = await agentApi.listConversations()
  }

  async function openDrawer() {
    drawerOpen.value = true
    if (!loaded.value && !loading.value) {
      loading.value = true
      try {
        await Promise.all([refreshStatus(), loadConversations()])
        loaded.value = true
      } finally {
        loading.value = false
      }
    }
  }

  function closeDrawer() {
    drawerOpen.value = false
    abort()
  }

  async function createConversation() {
    const res = await agentApi.createConversation()
    currentId.value = res.id
    messages.value = [res.opening]
    await loadConversations()
    return res.id
  }

  async function openConversation(id: string) {
    if (streaming.value) abort()
    currentId.value = id
    const res = await agentApi.listMessages(id, 1, 50)
    messages.value = res.items
  }

  /** done 后同步当前会话消息:确认卡状态(被新消息取代的 pending→cancelled 等在服务端变更) */
  async function syncCurrentMessages() {
    if (!currentId.value || streaming.value) return
    try {
      const res = await agentApi.listMessages(currentId.value, 1, 50)
      if (res.items.length >= messages.value.length) messages.value = res.items
    } catch {
      /* 静默:同步失败保留本地状态 */
    }
  }

  async function deleteConversation(id: string) {
    await agentApi.deleteConversation(id)
    if (currentId.value === id) {
      currentId.value = ''
      messages.value = []
    }
    await loadConversations()
  }

  /** SSE 事件 → 本地状态 */
  function applyEvent(e: AgentSseEvent) {
    switch (e.event) {
      case 'message_start':
        streamingText.value = ''
        break
      case 'message_delta':
        streamingText.value += e.data.delta
        break
      case 'message_end': {
        streamingText.value = ''
        // 重新拉当前页消息(服务端已落库,拿权威形状;轻量做法:本地拼一条)
        const seqMax = messages.value.length ? messages.value[messages.value.length - 1].seq : 0
        messages.value.push({
          id: e.data.messageId,
          seq: seqMax + 1,
          role: 'assistant',
          kind: 'text',
          content: { text: e.data.text },
          meta: e.data.meta ?? null,
          createdAt: '',
        })
        break
      }
      case 'tool_result': {
        const seqMax = messages.value.length ? messages.value[messages.value.length - 1].seq : 0
        messages.value.push({
          id: e.data.callId,
          seq: seqMax + 1,
          role: 'tool',
          kind: 'tool_result',
          content: {
            callId: e.data.callId,
            name: e.data.name,
            ok: e.data.ok,
            summary: e.data.summary,
            card: e.data.card,
          },
          meta: null,
          createdAt: '',
        })
        break
      }
      case 'confirm_required': {
        const seqMax = messages.value.length ? messages.value[messages.value.length - 1].seq : 0
        messages.value.push({
          id: e.data.card.messageId,
          seq: seqMax + 1,
          role: 'assistant',
          kind: 'confirm_card',
          content: e.data.card as unknown as Record<string, unknown>,
          meta: null,
          createdAt: '',
        })
        break
      }
      case 'error':
        ElMessage.error(e.data.message)
        break
      case 'done':
        streaming.value = false
        // 收尾后刷新:会话列表(排序/标题)+ 当前会话消息(确认卡状态等服务端权威形状)
        void loadConversations()
        void syncCurrentMessages()
        break
      default:
        break
    }
  }

  async function stream(path: string, body: unknown) {
    if (streaming.value) return
    streaming.value = true
    streamingText.value = ''
    const ac = new AbortController()
    aborter.value = ac
    try {
      await streamAgentSse(
        path,
        body,
        {
          onEvent: applyEvent,
          onError: (err) => {
            ElMessage.error(err.message)
            streaming.value = false
          },
        },
        ac.signal,
      )
    } finally {
      streaming.value = false
      streamingText.value = ''
      aborter.value = null
    }
  }

  async function sendMessage(text: string, pageContext?: PageContext) {
    const content = text.trim()
    if (!content || streaming.value) return
    // optimistic 用户气泡
    const seqMax = messages.value.length ? messages.value[messages.value.length - 1].seq : 0
    messages.value.push({
      id: `local-${Date.now()}`,
      seq: seqMax + 1,
      role: 'user',
      kind: 'text',
      content: { text: content },
      meta: pageContext ? { pageContext } : null,
      createdAt: '',
    })
    await stream(`/agent/v1/conversations/${currentId.value}/chat`, { content, pageContext })
  }

  async function confirmCard(confirmId: string) {
    if (streaming.value) return
    // 乐观置 confirmed
    const card = messages.value.find((m) => (m.content as { confirmId?: string }).confirmId === confirmId)
    if (card) (card.content as { status: string }).status = 'confirmed'
    await stream(`/agent/v1/confirms/${confirmId}/confirm`, {})
  }

  async function cancelCard(confirmId: string) {
    await agentApi.cancelConfirm(confirmId)
    const card = messages.value.find((m) => (m.content as { confirmId?: string }).confirmId === confirmId)
    if (card) (card.content as { status: string }).status = 'cancelled'
    ElMessage.success('已取消该操作')
  }

  async function regenerate() {
    if (streaming.value || !currentId.value) return
    await stream(`/agent/v1/conversations/${currentId.value}/regenerate`, {})
  }

  function abort() {
    aborter.value?.abort()
    aborter.value = null
    streaming.value = false
    streamingText.value = ''
  }

  return {
    drawerOpen,
    status,
    usable,
    conversations,
    currentId,
    messages,
    streaming,
    streamingText,
    pendingCard,
    openDrawer,
    closeDrawer,
    refreshStatus,
    loadConversations,
    createConversation,
    openConversation,
    syncCurrentMessages,
    deleteConversation,
    sendMessage,
    confirmCard,
    cancelCard,
    regenerate,
    abort,
  }
})
