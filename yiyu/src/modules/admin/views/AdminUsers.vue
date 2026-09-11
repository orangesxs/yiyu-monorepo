<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { useUserStore } from '@/shared/stores/user'
import { useAdminStore } from '../stores/admin'
import { roleLabels, statusLabels, adminAvatarOptions } from '../types'
import type { UserRole, UserStatus } from '../types'
import type { SystemUserDto } from '@/shared/api'

const userStore = useUserStore()
const adminStore = useAdminStore()

onMounted(refresh)
function refresh() {
  adminStore.fetchUsers().catch(() => {})
}

/* ---- 统计行(由用户目录即时汇总) ---- */
const stats = computed(() => [
  { label: '用户总数', value: adminStore.users.length },
  { label: '管理员', value: adminStore.users.filter((u) => u.role === 'admin').length },
  { label: '正常', value: adminStore.users.filter((u) => u.status === 'active').length },
  { label: '停用', value: adminStore.users.filter((u) => u.status === 'disabled').length },
])

/* ---- 筛选(服务端筛选:昵称/用户名 + 角色 + 状态) ---- */
const keyword = ref('')
const roleFilter = ref<UserRole | ''>('')
const statusFilter = ref<UserStatus | ''>('')
let searchTimer: ReturnType<typeof setTimeout> | null = null
watch([keyword, roleFilter, statusFilter], () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(refresh, 300)
})

const filteredUsers = computed<SystemUserDto[]>(() => adminStore.users)
const hasFilter = computed(() => !!keyword.value.trim() || !!roleFilter.value || !!statusFilter.value)
function clearFilters() {
  keyword.value = ''
  roleFilter.value = ''
  statusFilter.value = ''
}

/** 当前登录人自己:不可自改角色/停用(与后端禁自改同一保护) */
function isSelf(u: SystemUserDto): boolean {
  return u.id === userStore.user?.id
}

function toggleRole(u: SystemUserDto) {
  const toAdmin = u.role === 'user'
  ElMessageBox.confirm(
    toAdmin ? `确定将「${u.name}」设为管理员?Ta 将可以进入管理后台并管理全部用户与日志。` : `确定将「${u.name}」降为普通用户?Ta 将失去管理后台的访问权限。`,
    toAdmin ? '设为管理员' : '降为普通用户',
    { type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消' },
  )
    .then(async () => {
      await adminStore.setUserRole(u.id, toAdmin ? 'admin' : 'user')
      ElMessage.success(toAdmin ? `已将「${u.name}」设为管理员` : `已将「${u.name}」降为普通用户`)
    })
    .catch(() => {})
}

function toggleStatus(u: SystemUserDto) {
  const toDisable = u.status === 'active'
  ElMessageBox.confirm(
    toDisable
      ? `确定停用「${u.name}」的账号?停用后 Ta 将立即无法登录、现有登录态也会失效,可随时重新启用。`
      : `确定启用「${u.name}」的账号?`,
    toDisable ? '停用账号' : '启用账号',
    { type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消' },
  )
    .then(async () => {
      await adminStore.setUserStatus(u.id, toDisable ? 'disabled' : 'active')
      ElMessage.success(toDisable ? `已停用「${u.name}」` : `已启用「${u.name}」`)
    })
    .catch(() => {})
}

/* ---- 新增用户弹窗 ---- */
const addVisible = ref(false)
const addSaving = ref(false)
const addForm = ref({ avatar: '🐱', name: '', username: '', role: 'user' as UserRole, password: '' })

function openAdd() {
  addForm.value = { avatar: '🐱', name: '', username: '', role: 'user', password: '' }
  addVisible.value = true
}

async function submitAdd() {
  const name = addForm.value.name.trim()
  const username = addForm.value.username.trim()
  if (!name) return ElMessage.warning('请输入昵称')
  if (!username) return ElMessage.warning('请输入用户名')
  if (addForm.value.password.length < 6) return ElMessage.warning('初始密码至少 6 位')
  addSaving.value = true
  try {
    await adminStore.addUser({
      name, username,
      avatar: addForm.value.avatar,
      role: addForm.value.role,
      password: addForm.value.password,
    })
    addVisible.value = false
    ElMessage.success(`已新增用户「${name}」`)
  } catch {
    /* 用户名重复等错误由请求层提示 */
  } finally {
    addSaving.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">用户管理</h2>
        <p class="page-sub">系统用户目录 · 角色与状态维护</p>
      </div>
      <el-button type="primary" @click="openAdd">新增用户</el-button>
    </div>

    <!-- 统计行 -->
    <div class="user-stats">
      <div v-for="s in stats" :key="s.label" class="user-stat">
        <span class="stat-num num">{{ s.value }}</span>
        <span class="user-stat-label">{{ s.label }}</span>
      </div>
    </div>

    <!-- 筛选区 -->
    <div class="yiyu-card filter-bar">
      <el-input v-model="keyword" placeholder="搜索昵称或用户名" :prefix-icon="Search" clearable class="filter-search" />
      <el-select v-model="roleFilter" placeholder="角色" clearable class="filter-select">
        <el-option label="管理员" value="admin" />
        <el-option label="普通用户" value="user" />
      </el-select>
      <el-select v-model="statusFilter" placeholder="状态" clearable class="filter-select">
        <el-option label="正常" value="active" />
        <el-option label="停用" value="disabled" />
      </el-select>
    </div>

    <!-- 用户列表 -->
    <div class="yiyu-card user-list" v-loading="!adminStore.usersLoaded">
      <div v-for="u in filteredUsers" :key="u.id" class="user-row slide-in-row" :class="{ 'is-disabled': u.status === 'disabled' }">
        <span class="user-avatar">{{ u.avatar }}</span>
        <div class="user-info">
          <div class="user-name-line">
            <span class="user-name">{{ u.name }}</span>
            <el-tag size="small" :type="u.role === 'admin' ? 'warning' : 'info'" :class="{ 'role-tag': u.role === 'admin' }">{{ roleLabels[u.role] }}</el-tag>
            <el-tag size="small" :type="u.status === 'active' ? 'success' : 'info'" effect="plain">{{ statusLabels[u.status] }}</el-tag>
          </div>
          <span class="user-meta num">@{{ u.username }} · 注册 {{ u.registeredAt }} · 最近活跃 {{ u.lastActiveAt }}</span>
        </div>
        <div class="user-actions">
          <el-button
            size="small"
            :type="u.role === 'user' ? 'warning' : 'primary'"
            plain
            :disabled="isSelf(u)"
            @click="toggleRole(u)"
          >
            {{ u.role === 'user' ? '设为管理员' : '降为普通' }}
          </el-button>
          <el-button
            size="small"
            :type="u.status === 'active' ? 'danger' : 'success'"
            plain
            :disabled="isSelf(u)"
            @click="toggleStatus(u)"
          >
            {{ u.status === 'active' ? '停用' : '启用' }}
          </el-button>
        </div>
      </div>

      <div v-if="!filteredUsers.length" class="empty">
        <span class="empty-icon">🔍</span>
        <p>没有匹配的用户</p>
        <el-button v-if="hasFilter" size="small" @click="clearFilters">清空筛选</el-button>
      </div>
    </div>

    <!-- 新增用户弹窗 -->
    <el-dialog v-model="addVisible" title="新增用户" width="420px">
      <el-form label-position="top">
        <el-form-item label="头像">
          <div class="avatar-grid">
            <button
              v-for="a in adminAvatarOptions"
              :key="a"
              type="button"
              class="avatar-cell"
              :class="{ active: addForm.avatar === a }"
              @click="addForm.avatar = a"
            >
              {{ a }}
            </button>
          </div>
        </el-form-item>
        <el-form-item label="昵称">
          <el-input v-model="addForm.name" maxlength="12" show-word-limit placeholder="昵称(必填)" />
        </el-form-item>
        <el-form-item label="用户名">
          <el-input v-model="addForm.username" placeholder="登录用户名(必填,不可重复)">
            <template #prepend>@</template>
          </el-input>
        </el-form-item>
        <el-form-item label="初始密码">
          <el-input v-model="addForm.password" type="password" show-password placeholder="初始密码(至少 6 位,请告知用户)" />
        </el-form-item>
        <el-form-item label="角色">
          <el-radio-group v-model="addForm.role">
            <el-radio value="user">普通用户</el-radio>
            <el-radio value="admin">管理员</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addVisible = false">取消</el-button>
        <el-button type="primary" :loading="addSaving" @click="submitAdd">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style src="./AdminUsers.css" scoped></style>
