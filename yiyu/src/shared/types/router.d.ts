import 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    /** 应用壳菜单归属:ledger 记账本 / profile 个人中心 / admin 管理后台 */
    app?: 'ledger' | 'profile' | 'admin'
    /** 页面标题(document.title) */
    title?: string
    /** 是否需要登录态 */
    requiresAuth?: boolean
    /** 是否需要管理员角色(非 admin 访问被守卫弹回广场) */
    requiresAdmin?: boolean
  }
}

export {}
