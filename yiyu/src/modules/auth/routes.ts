import type { RouteRecordRaw } from 'vue-router'

/* 认证模块路由 */
export const authRoutes: RouteRecordRaw[] = [
  {
    path: '/auth',
    component: () => import('../../shared/layouts/AuthLayout.vue'),
    redirect: '/auth/login',
    children: [
      { path: 'login', name: 'login', component: () => import('./views/Login.vue'), meta: { title: '登录 · 一隅' } },
      { path: 'register', name: 'register', component: () => import('./views/Register.vue'), meta: { title: '注册 · 一隅' } },
    ],
  },
]
