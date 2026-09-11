import { createRouter, createWebHashHistory } from 'vue-router'
import { ElMessage } from 'element-plus'
import { authRoutes } from '../modules/auth/routes'
import { portalRoutes } from '../modules/portal/routes'
import { ledgerRoutes } from '../modules/ledger/routes'
import { profileRoutes } from '../modules/profile/routes'
import { adminRoutes } from '../modules/admin/routes'
import { useUserStore } from '../shared/stores/user'

const routes = [
  ...authRoutes,
  ...portalRoutes,
  ...ledgerRoutes,
  ...profileRoutes,
  ...adminRoutes,
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.beforeEach(async (to) => {
  const userStore = useUserStore()
  // 启动恢复期(fetchMe 未完成)先等登录态就绪,避免刷新已登录页时闪跳登录页
  if (!userStore.ready) {
    await userStore.fetchMe()
  }
  if (to.meta.requiresAuth && !userStore.user) {
    return { name: 'login' }
  }
  if ((to.name === 'login' || to.name === 'register') && userStore.user) {
    return { name: 'portal' }
  }
  // 管理后台仅限管理员(见 docs/后台管理/需求设计.md §2.2)
  if (to.meta.requiresAdmin && !userStore.isAdmin) {
    ElMessage.warning('该区域仅管理员可见')
    return { name: 'portal' }
  }
  document.title = to.meta.title || '一隅'
})

export default router
