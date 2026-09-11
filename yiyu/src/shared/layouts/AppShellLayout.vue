<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '../stores/user'
import { useThemeStore } from '../stores/theme'

interface ShellMenu {
  path: string
  label: string
  /** Element Plus 图标组件名(全局注册) */
  elIcon: string
}

interface ShellApp {
  name: string
  sub: string
  icon: string
  color: string
  menus: ShellMenu[]
}

const apps: Record<'ledger' | 'profile' | 'admin', ShellApp> = {
  ledger: {
    name: '记账本',
    sub: '把每一笔都记得清楚',
    icon: '💰',
    color: 'var(--app-ledger)',
    menus: [
      { path: '/ledger/transactions', label: '流水明细', elIcon: 'Tickets' },
      { path: '/ledger/reports', label: '报表统计', elIcon: 'TrendCharts' },
      { path: '/ledger/books', label: '账本管理', elIcon: 'Notebook' },
    ],
  },
  profile: {
    name: '个人中心',
    sub: '我是谁,与谁同行',
    icon: '👤',
    color: 'var(--text-secondary)',
    menus: [
      { path: '/profile/info', label: '基本信息', elIcon: 'User' },
    ],
  },
  admin: {
    name: '管理后台',
    sub: '守好一隅的每个角落',
    icon: '🛠️',
    color: 'var(--app-admin)',
    menus: [
      { path: '/admin/dashboard', label: '数据概览', elIcon: 'Odometer' },
      { path: '/admin/users', label: '用户管理', elIcon: 'UserFilled' },
      { path: '/admin/logs', label: '系统日志', elIcon: 'List' },
      { path: '/admin/invites', label: '邀请码', elIcon: 'Ticket' },
    ],
  },
}

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const themeStore = useThemeStore()
const collapsed = ref(false) // 宽屏:侧栏折叠为纯图标
const drawer = ref(false) // 窄屏:侧栏抽屉开合(抽屉固定纯图标)

// 窄屏判定:侧栏切换按钮从"折叠"变为"抽屉",抽屉内只显示图标
const narrowMq = window.matchMedia('(max-width: 768px)')
const isNarrow = ref(narrowMq.matches)
function syncNarrow() {
  const now = narrowMq.matches
  if (now === isNarrow.value) return
  isNarrow.value = now
  if (now) collapsed.value = false // 回到宽屏时侧栏保持展开
  else drawer.value = false // 回到窄屏时收起抽屉
}
// resize 兜底:部分内嵌环境不派发 matchMedia change 事件
narrowMq.addEventListener('change', syncNarrow)
window.addEventListener('resize', syncNarrow)
onUnmounted(() => {
  narrowMq.removeEventListener('change', syncNarrow)
  window.removeEventListener('resize', syncNarrow)
})

function toggleSide() {
  syncNarrow() // 防止事件未派发导致模式判断过期
  if (isNarrow.value) drawer.value = !drawer.value
  else collapsed.value = !collapsed.value
}

const app = computed(() => apps[route.meta.app ?? 'ledger'])
// 窄屏顶栏抽屉开关的提示文案(宽屏的展开/收起按钮已移入侧栏底部)
const sideTooltip = computed(() => (drawer.value ? '收起菜单' : '展开菜单'))

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
  <div class="shell">
    <header class="shell-topbar">
      <div class="shell-left">
        <el-tooltip v-if="isNarrow" :content="sideTooltip" placement="bottom">
          <button class="icon-btn" @click="toggleSide">
            <el-icon :class="{ flip: drawer }"><Expand /></el-icon>
          </button>
        </el-tooltip>
        <!-- 窄屏:返回广场留在顶栏;宽屏隐藏(移入侧栏底部) -->
        <button v-if="isNarrow" class="icon-btn" title="返回广场" @click="router.push('/')">
          <el-icon><HomeFilled /></el-icon>
        </button>
        <span class="app-badge" :style="{ background: `color-mix(in srgb, ${app.color} 14%, transparent)`, color: app.color }">{{ app.icon }}</span>
        <div class="app-title">
          <span class="app-name">{{ app.name }}</span>
          <span class="app-sub">{{ app.sub }}</span>
        </div>
      </div>
      <div class="shell-right">
        <el-tooltip :content="themeStore.isDark ? '切到浅色' : '切到深色'" placement="bottom">
          <button class="icon-btn" @click="themeStore.toggle()">
            <el-icon v-if="themeStore.isDark"><Sunny /></el-icon>
            <el-icon v-else><Moon /></el-icon>
          </button>
        </el-tooltip>
        <el-dropdown @command="onCommand">
          <span class="avatar-btn">
            <span class="avatar">{{ userStore.user?.avatar || '🧑‍💻' }}</span>
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

    <div class="shell-body">
      <!-- 窄屏抽屉遮罩:点击空白处收起(仅 max-width:768px 媒体查询内渲染生效) -->
      <div class="shell-mask" :class="{ show: drawer }" @click="drawer = false"></div>
      <aside class="shell-aside" :class="{ collapsed, open: drawer }">
        <nav class="shell-nav">
          <router-link
            v-for="m in app.menus"
            :key="m.path"
            :to="m.path"
            :title="collapsed || isNarrow ? m.label : undefined"
            class="nav-item"
            :class="{ active: route.path === m.path }"
          >
            <el-icon class="nav-icon"><component :is="m.elIcon" /></el-icon>
            <span v-show="!(collapsed || isNarrow)" class="nav-label">{{ m.label }}</span>
          </router-link>
        </nav>

        <!-- 宽屏:展开/收起 + 返回广场固定在侧栏底部;窄屏此处隐藏,改由顶栏图标开抽屉 -->
        <div class="side-footer">
          <button class="nav-item side-toggle" :title="collapsed ? '展开侧栏' : '收起侧栏'" @click="collapsed = !collapsed">
            <el-icon class="nav-icon" :class="{ flip: collapsed }"><Expand /></el-icon>
            <span v-show="!collapsed" class="nav-label">收起侧栏</span>
          </button>
          <router-link to="/" class="nav-item side-back" title="返回广场">
            <el-icon class="nav-icon"><HomeFilled /></el-icon>
            <span v-show="!collapsed" class="nav-label">返回广场</span>
          </router-link>
        </div>
      </aside>

      <main class="shell-main">
        <router-view />
      </main>
    </div>
  </div>
</template>

<style scoped>
.shell {
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.shell-topbar {
  height: 60px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  background: var(--sticky-bg);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border-color);
  position: sticky;
  top: 0;
  z-index: 20;
}

.shell-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.app-badge {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  font-size: 17px;
}

.app-title {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}
.app-name {
  font-size: 15px;
  font-weight: 600;
}
.app-sub {
  font-size: 11px;
  color: var(--text-secondary);
}

.shell-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.icon-btn {
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

.avatar-btn {
  cursor: pointer;
  display: flex;
}
.avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--app-ledger), var(--app-admin));
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 14px;
}

.shell-body {
  flex: 1;
  display: flex;
  min-height: 0;
  position: relative;
}

/* 抽屉遮罩:宽屏不渲染,窄屏抽屉打开时盖住内容区 */
.shell-mask {
  display: none;
}
@media (max-width: 768px) {
  .shell-mask {
    display: block;
    position: absolute;
    inset: 0;
    z-index: 25; /* 低于侧栏(30)、高于内容 */
    background: rgba(0, 0, 0, 0.4);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--dur-sidebar) ease;
  }
  .shell-mask.show {
    opacity: 1;
    pointer-events: auto;
  }
}

.shell-aside {
  width: 200px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  padding: 16px 12px;
  border-right: 1px solid var(--border-color);
  background: var(--bg-card);
  overflow-y: auto;
  transition: width var(--dur-sidebar) ease;
}
.shell-aside.collapsed {
  width: 64px;
}

/* 侧栏底部操作区:推向底部,与菜单之间加分隔线 */
.side-footer {
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.side-toggle, .side-back {
  width: 100%;
  border: none;
  background: none;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
  text-align: left;
}

.shell-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-input);
  color: var(--text-regular);
  text-decoration: none;
  font-size: 14px;
  transition: all var(--dur-base) ease;
  white-space: nowrap;
}
.nav-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.nav-item.active {
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  color: var(--color-primary);
  font-weight: 500;
}
.collapsed .nav-item {
  justify-content: center;
}

.flip { transform: rotate(180deg); }

.shell-main {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.shell-main > * {
  flex: 1;
  width: 100%;
}

@media (max-width: 768px) {
  .shell-topbar { padding: 0 14px; }
  .app-sub { display: none; }

  /* 窄屏:底部操作区隐藏(抽屉是纯图标条,返回广场走顶栏) */
  .side-footer { display: none; }

  .shell-aside {
    position: fixed;
    left: 0;
    top: 60px;
    bottom: 0;
    z-index: 30;
    /* 窄屏抽屉固定为纯图标窄条 */
    width: 64px !important;
    transform: translateX(-100%);
    transition: transform var(--dur-sidebar) ease;
    box-shadow: var(--shadow-hover);
  }
  .shell-aside.open {
    transform: translateX(0);
  }
  .shell-aside .nav-item {
    justify-content: center;
  }
}
</style>
