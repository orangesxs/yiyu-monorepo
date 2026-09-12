import { get, post, put, del } from '@/shared/api/http'
import type { AgentConversationVo, AgentMessageVo, PageContext } from './agent-stream'

/** Agent REST API(SSE 类对话接口在 agent-stream.ts,不走 axios) */
export const agentApi = {
  status: () => get<{ llmConfigured: boolean; agentEnabled: boolean }>('/agent/v1/status'),

  listConversations: () => get<AgentConversationVo[]>('/agent/v1/conversations'),

  createConversation: () =>
    post<{ id: string; title: string; opening: AgentMessageVo }>('/agent/v1/conversations'),

  deleteConversation: (id: string) => del<{ ok: boolean }>(`/agent/v1/conversations/${id}`),

  listMessages: (id: string, page = 1, pageSize = 50) =>
    get<{ total: number; page: number; pageSize: number; items: AgentMessageVo[] }>(
      `/agent/v1/conversations/${id}/messages`,
      { page, pageSize },
    ),

  cancelConfirm: (confirmId: string) => post<{ ok: boolean }>(`/agent/v1/confirms/${confirmId}/cancel`),

  /* admin 三域 */
  adminGetConfig: () =>
    get<{
      llm: { baseUrl: string; apiKeyMasked: string; model: string; streaming: boolean }
      persona: { systemPrompt: string }
      settings: { agentEnabled: boolean; contextTurns: number; maxToolRounds: number }
    }>('/agent/v1/admin/config'),

  adminUpdateConfig: (data: {
    llm?: { baseUrl?: string; apiKey?: string; model?: string; streaming?: boolean }
    persona?: { systemPrompt?: string }
    settings?: { agentEnabled?: boolean; contextTurns?: number; maxToolRounds?: number }
  }) => put<{ ok: boolean }>('/agent/v1/admin/config', data),

  adminTestConfig: () =>
    post<{ ok: boolean; latencyMs: number; model: string; message: string }>('/agent/v1/admin/config/test'),

  adminListSkills: () =>
    get<
      {
        skillId: string
        group: string
        name: string
        label: string
        description: string
        risk: 'low' | 'medium' | 'high'
        parameters: Record<string, unknown>
        enabled: boolean
      }[]
    >('/agent/v1/admin/skills'),

  adminUpdateSkill: (name: string, enabled: boolean) =>
    put<{ ok: boolean }>(`/agent/v1/admin/skills/${name}`, { enabled }),

  adminUsageSummary: (from?: string, to?: string) =>
    get<{
      totalCalls: number
      totalPromptTokens: number
      totalCompletionTokens: number
      byDay: { date: string; calls: number; tokens: number }[]
      byUser: { userId: string; nickname: string; avatar: string; calls: number; promptTokens: number; completionTokens: number }[]
    }>('/agent/v1/admin/usage/summary', { from, to }),
}

/** 页面上下文类型再导出(组件用) */
export type { PageContext }
