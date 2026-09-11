<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useUserStore } from '../stores/user'
import { useThemeStore } from '../stores/theme'

const router = useRouter()
const userStore = useUserStore()
const themeStore = useThemeStore()

function onCommand(cmd: string | number | object) {
  if (cmd === 'profile') router.push('/profile')
  if (cmd === 'admin') router.push('/admin/dashboard')
  if (cmd === 'logout') {
    userStore.logout()
    router.push('/auth/login')
  }
}
</script>

<template>
  <div class="portal-layout">
    <header class="portal-topbar">
      <div class="brand" @click="router.push('/')">
        <span class="brand-mark num">隅</span>
        <span class="brand-name">一隅</span>
      </div>
      <div class="top-actions">
        <el-tooltip :content="themeStore.isDark ? '切到浅色' : '切到深色'" placement="bottom">
          <button class="icon-btn" @click="themeStore.toggle()">
            <el-icon v-if="themeStore.isDark"><Sunny /></el-icon>
            <el-icon v-else><Moon /></el-icon>
          </button>
        </el-tooltip>
        <el-tooltip content="通知" placement="bottom">
          <button class="icon-btn">
            <el-icon><Bell /></el-icon>
            <i class="dot"></i>
          </button>
        </el-tooltip>
        <el-dropdown @command="onCommand">
          <span class="avatar-btn">
            <span class="avatar">{{ userStore.user?.avatar || '🧑‍💻' }}</span>
            <span class="avatar-name">{{ userStore.user?.nickname }}</span>
            <el-icon><ArrowDown /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="profile">个人中心</el-dropdown-item>
              <el-dropdown-item v-if="userStore.isAdmin" command="admin">后台管理</el-dropdown-item>
              <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </header>
    <main class="portal-main">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.portal-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.portal-topbar {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32px;
  background: var(--sticky-bg);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border-color);
  position: sticky;
  top: 0;
  z-index: 10;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
}
.brand-mark {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: var(--color-primary);
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  display: grid;
  place-items: center;
  font-family: var(--font-body);
}
.brand-name {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 14px;
}

.icon-btn {
  position: relative;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-regular);
  cursor: pointer;
  display: grid;
  place-items: center;
  font-size: 16px;
  transition: all var(--dur-base) ease;
}
.icon-btn:hover {
  color: var(--color-primary);
  border-color: var(--card-border-on-hover);
}
.icon-btn .dot {
  position: absolute;
  top: 7px;
  right: 8px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-expense);
}

.avatar-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 8px 4px 4px;
  border-radius: 999px;
  transition: background var(--dur-base) ease;
}
.avatar-btn:hover {
  background: var(--bg-hover);
}
.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--app-ledger), var(--app-admin));
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 14px;
}
.avatar-name {
  font-size: 13px;
  color: var(--text-regular);
}

.portal-main {
  flex: 1;
  width: 100%;
}

@media (max-width: 768px) {
  .portal-topbar { padding: 0 16px; }
  .avatar-name { display: none; }
}
</style>
