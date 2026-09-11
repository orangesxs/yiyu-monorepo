import type { RouteRecordRaw } from 'vue-router'

/* 门户(广场)模块路由 */
export const portalRoutes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('../../shared/layouts/PortalLayout.vue'),
    children: [
      { path: '', name: 'portal', component: () => import('./views/PortalHome.vue'), meta: { title: '广场 · 一隅', requiresAuth: true } },
    ],
  },
]
