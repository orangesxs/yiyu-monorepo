import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { User } from '../types/common'
import { authApi } from '@/shared/api'
import { clearToken, getToken, setToken } from '@/shared/api/http'

/**
 * 登录态:token 存 localStorage(yiyu-token),用户信息由 /auth/me 拉取。
 * isAdmin 是全站唯一"是否管理员"判定(路由守卫/后台入口消费)。
 */
export const useUserStore = defineStore('user', () => {
  const user = ref<User | null>(null)
  const ready = ref(false) // 启动时 fetchMe 是否已完成(路由守卫依赖,避免闪跳)
  const isAdmin = computed(() => user.value?.role === 'admin')

  /** 登录:成功后落 token 与用户信息 */
  async function login(payload: { username: string; password: string }) {
    const res = await authApi.login(payload)
    setToken(res.token)
    user.value = res.user
  }

  /** 注册(需邀请码):成功即视为登录 */
  async function register(payload: {
    username: string
    nickname: string
    password: string
    inviteCode: string
  }) {
    const res = await authApi.register(payload)
    setToken(res.token)
    user.value = res.user
  }

  /** 应用启动时恢复登录态:有 token 则拉 me(403 停用等由请求层统一弹提示清态)。
   *  进行中的 Promise 会缓存:main.ts 与路由守卫并发调用时共享同一次请求 */
  let mePromise: Promise<void> | null = null
  function fetchMe(): Promise<void> {
    if (!mePromise) {
      mePromise = (async () => {
        if (getToken()) {
          try {
            user.value = await authApi.me()
          } catch {
            user.value = null
          }
        }
        ready.value = true
      })()
    }
    return mePromise
  }

  /** 退出:调后端记日志,本地清态(旧 yiyu-user 一并清理,兼容迁移) */
  async function logout() {
    try {
      await authApi.logout()
    } catch {
      /* 后端不可达也照样本地退出 */
    }
    user.value = null
    clearToken()
    localStorage.removeItem('yiyu-user')
  }

  return { user, ready, isAdmin, login, register, fetchMe, logout }
})
