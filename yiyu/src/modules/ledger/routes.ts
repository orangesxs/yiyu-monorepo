import type { RouteRecordRaw } from 'vue-router'

/* 记账本模块路由 */
export const ledgerRoutes: RouteRecordRaw[] = [
  {
    path: '/ledger',
    component: () => import('../../shared/layouts/AppShellLayout.vue'),
    meta: { app: 'ledger' },
    children: [
      { path: '', redirect: '/ledger/transactions' },
      { path: 'transactions', name: 'ledger-transactions', component: () => import('./views/Transactions.vue'), meta: { app: 'ledger', title: '流水明细', requiresAuth: true } },
      { path: 'reports', name: 'ledger-reports', component: () => import('./views/Reports.vue'), meta: { app: 'ledger', title: '报表统计', requiresAuth: true } },
      { path: 'books', name: 'ledger-books', component: () => import('./views/Books.vue'), meta: { app: 'ledger', title: '账本管理', requiresAuth: true } },
    ],
  },
]
