import type { Component } from 'vue'
import FallbackJsonCard from './builtin/FallbackJsonCard.vue'
import { ledgerChatCards } from '@/modules/ledger/chat-cards'
import { profileChatCards } from '@/modules/profile/chat-cards'

/**
 * 聊天卡片注册表:cardType → 组件。
 * builtin(agent 自带)+ 各业务模块 chat-cards(镜像后端技能组,新子应用加自己的目录再在此聚合一行)。
 */
const registry = new Map<string, Component>()
const builtin: Record<string, Component> = { 'agent.fallback': FallbackJsonCard }

function register(map: Record<string, Component>) {
  for (const [k, v] of Object.entries(map)) registry.set(k, v)
}

register(builtin)
register(ledgerChatCards)
register(profileChatCards)

export function getCardComponent(cardType: string): Component {
  return registry.get(cardType) ?? FallbackJsonCard
}
