import { defineStore } from 'pinia'
import { ref } from 'vue'
import { adminApi } from '@/shared/api'
import type { AdminDashboardDto, AdminLogDto, SystemUserDto } from '@/shared/api'

/**
 * 管理后台数据源:全部来自服务端 API。
 * 统计/趋势/最近操作由 GET /admin/dashboard 一次性返回;用户目录与日志按需拉取。
 */
export const useAdminStore = defineStore('admin', () => {
  const users = ref<SystemUserDto[]>([])
  const usersLoaded = ref(false)

  /* 概览(dashboard 接口一次性返回统计卡/趋势/最近操作) */
  const dashboard = ref<AdminDashboardDto | null>(null)
  const dashboardLoaded = ref(false)

  async function fetchDashboard() {
    dashboard.value = await adminApi.dashboard()
    dashboardLoaded.value = true
  }

  async function fetchUsers(params?: { keyword?: string; role?: string; status?: string }) {
    users.value = await adminApi.listUsers(params)
    usersLoaded.value = true
  }

  /** 按 id 找系统用户(供日志列表显示操作人昵称/头像) */
  function userById(id: string): SystemUserDto | null {
    return users.value.find((u) => u.id === id) || null
  }

  /** 新增用户(管理员直接建号,不消耗邀请码) */
  async function addUser(u: { username: string; name: string; avatar: string; role: 'admin' | 'user'; password: string }) {
    await adminApi.createUser(u)
    await fetchUsers()
  }

  async function setUserRole(id: string, role: 'admin' | 'user') {
    await adminApi.updateUser(id, { role })
    const target = users.value.find((x) => x.id === id)
    if (target) target.role = role
  }

  async function setUserStatus(id: string, status: 'active' | 'disabled') {
    await adminApi.updateUser(id, { status })
    const target = users.value.find((x) => x.id === id)
    if (target) target.status = status
  }

  /** 日志列表(服务端分页;由 AdminLogs 页自行保存 items) */
  async function fetchLogs(params: {
    page?: number
    pageSize?: number
    module?: string
    action?: string
    operatorId?: string
  }) {
    return adminApi.listLogs(params)
  }

  /** 操作人信息兜底:dashboard.latestLogs / 日志项自带 operator,无需查表 */
  function operatorName(l: AdminLogDto): string {
    return l.operator?.nickname || '未知用户'
  }

  return {
    users, usersLoaded,
    dashboard, dashboardLoaded,
    fetchDashboard, fetchUsers, fetchLogs,
    userById, addUser, setUserRole, setUserStatus, operatorName,
  }
})
