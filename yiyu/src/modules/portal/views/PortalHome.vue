<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { portalApi } from '@/shared/api'
import type { PortalSummaryDto } from '@/shared/api'
import { useUserStore } from '@/shared/stores/user'

const userStore = useUserStore()

/* 广场摘要:只拉门户卡片数据,应用内数据进应用时才加载 */
const summary = ref<PortalSummaryDto['apps']['ledger'] | null>(null)
onMounted(async () => {
  try {
    const res = await portalApi.summary()
    summary.value = res.apps.ledger
  } catch {
    summary.value = null // 拉取失败保持占位,不打断门户
  }
})

/* 问候(真实时钟) */
const now = new Date()
const greeting = now.getHours() < 6 ? '夜深了' : now.getHours() < 11 ? '早上好' : now.getHours() < 14 ? '中午好' : now.getHours() < 18 ? '下午好' : '晚上好'
const dateText = `${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日 · 星期${'日一二三四五六'[now.getDay()]}`
const dailyQuote = '把日子过成自己喜欢的样子,是一件值得练习的事。'

interface AppEntry { label: string; value: string; cls: string }
interface AppCard {
  key: string
  icon: string
  name: string
  sub: string
  color: string
  entries: AppEntry[]
  to: string
}

const apps = computed<AppCard[]>(() => [
  {
    key: 'ledger',
    icon: summary.value?.bookIcon || '💰',
    name: '记账本',
    sub: summary.value?.bookName || '把每一笔都记得清楚',
    color: 'var(--app-ledger)',
    entries: [
      { label: '本月支出', value: `¥ ${(summary.value?.monthExpense ?? 0).toFixed(0)}`, cls: 'money-out' },
      { label: '结余', value: `¥ ${(summary.value?.monthBalance ?? 0).toFixed(0)}`, cls: 'money-in' },
    ],
    to: '/ledger/transactions',
  },
])
</script>

<template>
  <div class="portal page">
    <!-- 氛围背景 -->
    <div class="portal-glow g1"></div>
    <div class="portal-glow g2"></div>

    <!-- 问候区 -->
    <section class="greet-wrap rise-in">
      <div class="greet">
        <h1>{{ greeting }},{{ userStore.user?.nickname }} <span class="wave">👋</span></h1>
        <p class="date num">{{ dateText }}</p>
        <div class="quote">
          <span class="quote-mark">“</span>
          <span>{{ dailyQuote }}</span>
          <span class="quote-mark end">”</span>
        </div>
      </div>
    </section>

    <!-- 应用卡 -->
    <section class="app-cards">
      <div
        v-for="(a, i) in apps"
        :key="a.key"
        class="yiyu-card yiyu-card--hover app-card rise-in"
        :style="{ animationDelay: `${0.12 + i * 0.06}s` }"
        @click="$router.push(a.to)"
      >
        <div class="app-card-head">
          <span class="app-icon" :style="{ background: `color-mix(in srgb, ${a.color} 13%, transparent)` }">{{ a.icon }}</span>
          <div>
            <div class="app-card-name">{{ a.name }}</div>
            <div class="app-card-sub">{{ a.sub }}</div>
          </div>
          <span class="enter">进入 →</span>
        </div>
        <div class="app-card-data">
          <div v-for="e in a.entries" :key="e.label" class="entry">
            <span class="entry-label">{{ e.label }}</span>
            <span class="entry-value num" :class="e.cls">{{ summary ? e.value : '— —' }}</span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style src="./PortalHome.css" scoped></style>
