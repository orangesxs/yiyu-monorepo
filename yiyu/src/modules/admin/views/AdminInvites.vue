<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi } from '@/shared/api'
import type { AdminInviteDto } from '@/shared/api'

const invites = ref<AdminInviteDto[]>([])
const loading = ref(false)
const generating = ref(false)

async function load() {
  loading.value = true
  try {
    invites.value = await adminApi.listInvites()
  } catch {
    /* 错误由请求层提示 */
  } finally {
    loading.value = false
  }
}
onMounted(load)

/* 统计行 */
const stats = computed(() => [
  { label: '邀请码总数', value: invites.value.length },
  { label: '未使用', value: invites.value.filter((i) => !i.usedAt).length },
  { label: '已使用', value: invites.value.filter((i) => i.usedAt).length },
])

async function createInvite() {
  generating.value = true
  try {
    await adminApi.createInvite()
    ElMessage.success('邀请码已生成')
    await load()
  } catch {
    /* 错误由请求层提示 */
  } finally {
    generating.value = false
  }
}

function copyCode(code: string) {
  navigator.clipboard.writeText(code).then(
    () => ElMessage.success(`已复制 ${code}`),
    () => ElMessage.warning('复制失败,请手动选择复制'),
  )
}

/** 邀请链接:hash 路由,形如 https://host/#/auth/register?code=XXXX */
function copyLink(code: string) {
  const link = `${location.origin}${location.pathname}#/auth/register?code=${code}`
  navigator.clipboard.writeText(link).then(
    () => ElMessage.success('邀请链接已复制'),
    () => ElMessage.warning('复制失败,请手动选择复制'),
  )
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">邀请码</h2>
        <p class="page-sub">全部邀请码与使用情况 · 管理员不限额度</p>
      </div>
      <el-button type="primary" :loading="generating" @click="createInvite">生成邀请码</el-button>
    </div>

    <!-- 统计行 -->
    <div class="invite-stats">
      <div v-for="s in stats" :key="s.label" class="user-stat">
        <span class="stat-num num">{{ s.value }}</span>
        <span class="user-stat-label">{{ s.label }}</span>
      </div>
    </div>

    <!-- 邀请码列表 -->
    <div class="yiyu-card invite-list" v-loading="loading">
      <div v-for="i in invites" :key="i.id" class="invite-row slide-in-row">
        <span class="code num" :class="{ used: i.usedAt }">{{ i.code }}</span>
        <span class="creator">
          <span class="creator-avatar">{{ i.creator?.avatar || '👤' }}</span>
          {{ i.creator?.nickname || '未知用户' }} 生成
        </span>
        <span class="state">
          <template v-if="i.usedAt">
            已被 <span class="usedby">{{ i.usedBy?.nickname || '某位用户' }}</span> 使用
          </template>
          <template v-else>未使用</template>
        </span>
        <span class="time num">{{ i.createdAt }}</span>
        <button v-if="!i.usedAt" class="copy" type="button" @click="copyLink(i.code)">复制链接</button>
        <button class="copy" type="button" @click="copyCode(i.code)">复制</button>
      </div>

      <div v-if="!invites.length && !loading" class="empty">
        <span class="empty-icon">🎟️</span>
        <p>还没有邀请码</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 统计行(类名沿用 admin 模块惯例) */
.invite-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--gap-module);
  margin-bottom: var(--gap-card);
}
.user-stat {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 14px 18px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card);
}
.user-stat-label {
  font-size: var(--fs-caption);
  color: var(--text-secondary);
}

/* 列表 */
.invite-list {
  padding: 6px 18px;
}
.invite-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-color);
  font-size: var(--fs-body);
  min-width: 0;
}
.invite-row:last-child {
  border-bottom: none;
}
.code {
  flex: none;
  width: 110px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: var(--color-primary);
}
.code.used {
  color: var(--text-secondary);
  text-decoration: line-through;
}
.creator {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-caption);
  color: var(--text-regular);
  min-width: 0;
}
.creator-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  background: var(--bg-soft);
}
.state {
  flex: 1;
  min-width: 0;
  font-size: var(--fs-caption);
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.usedby {
  color: var(--text-regular);
}
.time {
  flex: none;
  font-size: var(--fs-caption);
  color: var(--text-secondary);
}
.copy {
  flex: none;
  border: 1px solid var(--border-color);
  background: var(--bg-soft);
  color: var(--text-regular);
  border-radius: 6px;
  font-size: 12px;
  padding: 2px 10px;
  cursor: pointer;
  transition: all var(--dur-base) ease;
}
.copy:hover {
  color: var(--color-primary);
  border-color: var(--color-primary);
}

/* 空态 */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 0;
  color: var(--text-secondary);
  font-size: var(--fs-body);
}
.empty-icon {
  font-size: 36px;
}

@media (max-width: 768px) {
  .invite-stats {
    grid-template-columns: 1fr;
  }
  .invite-row {
    flex-wrap: wrap;
    gap: 8px;
  }
  .creator {
    display: none;
  }
}
</style>
