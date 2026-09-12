<script setup lang="ts">
import { computed } from 'vue'
import type { CardPayload } from '@/modules/agent/agent-stream'

const props = defineProps<{ payload: CardPayload }>()

const p = computed(
  () =>
    props.payload.data as {
      nickname: string
      username: string
      avatar: string
      bio: string
      gender: string
      birthday: string
      region: string
      joinedAt: string
    },
)
</script>

<template>
  <div class="profile-card yiyu-card">
    <p class="profile-card__title">{{ payload.title }}</p>
    <div class="profile-card__row">
      <span>{{ p.avatar }} {{ p.nickname }}</span>
      <span class="profile-card__sub">@{{ p.username }}</span>
    </div>
    <div v-if="p.bio" class="profile-card__bio">{{ p.bio }}</div>
    <div class="profile-card__meta">
      <span v-if="p.region">📍{{ p.region }}</span>
      <span v-if="p.birthday">🎂{{ p.birthday }}</span>
      <span>📅{{ p.joinedAt.slice(0, 10) }} 加入</span>
    </div>
  </div>
</template>

<style scoped>
.profile-card {
  align-self: stretch;
  padding: 12px 14px;
}
.profile-card__title {
  margin: 0 0 6px;
  font-size: var(--fs-caption, 12px);
  color: var(--text-3, #999);
}
.profile-card__row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: var(--fs-body, 14px);
  font-weight: 600;
}
.profile-card__sub {
  font-weight: 400;
  font-size: var(--fs-caption, 12px);
  color: var(--text-3, #999);
}
.profile-card__bio {
  margin-top: 6px;
  font-size: var(--fs-caption, 12px);
  color: var(--text-2, #666);
}
.profile-card__meta {
  margin-top: 8px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: var(--fs-caption, 12px);
  color: var(--text-3, #999);
}
</style>
