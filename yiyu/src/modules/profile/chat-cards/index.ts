import type { Component } from 'vue'
import ProfileInfoCard from './ProfileInfoCard.vue'
import InvitesCard from './InvitesCard.vue'

/** profile 模块聊天卡片 */
export const profileChatCards: Record<string, Component> = {
  'profile.info': ProfileInfoCard,
  'profile.invites': InvitesCard,
}
