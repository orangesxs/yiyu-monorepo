import type { RouteRecordRaw } from 'vue-router'

/* 管理后台模块路由(平台级管理模块,requiresAdmin 全量管控) */
export const adminRoutes: RouteRecordRaw[] = [
  {
    path: '/admin',
    component: () => import('../../shared/layouts/AppShellLayout.vue'),
    meta: { app: 'admin' },
    children: [
      { path: '', redirect: '/admin/dashboard' },
      {
        path: 'dashboard',
        name: 'admin-dashboard',
        component: () => import('./views/AdminDashboard.vue'),
        meta: { app: 'admin', title: '数据概览', requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'users',
        name: 'admin-users',
        component: () => import('./views/AdminUsers.vue'),
        meta: { app: 'admin', title: '用户管理', requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'logs',
        name: 'admin-logs',
        component: () => import('./views/AdminLogs.vue'),
        meta: { app: 'admin', title: '系统日志', requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'invites',
        name: 'admin-invites',
        component: () => import('./views/AdminInvites.vue'),
        meta: { app: 'admin', title: '邀请码', requiresAuth: true, requiresAdmin: true },
      },
    ],
  },
]
