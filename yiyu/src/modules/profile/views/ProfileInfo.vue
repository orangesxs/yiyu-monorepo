<script setup lang="ts">
import { reactive, ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { useProfileStore } from '../stores/profile'
import { useUserStore } from '@/shared/stores/user'
import { inviteApi, profileApi } from '@/shared/api'
import type { InviteCodeItem } from '@/shared/api'
import { avatarOptions } from '../types'
import type { Gender } from '../types'

const profileStore = useProfileStore()
const userStore = useUserStore()

onMounted(() => {
  profileStore.init().catch(() => {})
  loadInvites()
})

/* 已加入天数:从档案 joinedAt 到今日(含首尾) */
const joinedDays = computed(() => {
  if (!profileStore.profile.joinedAt) return 1
  const start = new Date(profileStore.profile.joinedAt + 'T00:00:00')
  return Math.max(1, Math.floor((Date.now() - start.getTime()) / 86400000) + 1)
})

/* 编辑表单(头像宫格 + 各字段),档案加载完成后回填 */
const form = reactive({
  nickname: '',
  avatar: '🧑‍💻',
  bio: '',
  gender: 'secret' as Gender,
  birthday: null as string | null,
  region: '',
})
const syncForm = computed(() => profileStore.profile.updatedAt)
/* 档案到达(或更新)后同步表单 */
function fillForm() {
  const p = profileStore.profile
  form.nickname = p.nickname
  form.avatar = p.avatar || '🧑‍💻'
  form.bio = p.bio
  form.gender = p.gender
  form.birthday = p.birthday || null
  form.region = p.region
}
watch(syncForm, fillForm, { immediate: true })

const saving = ref(false)
async function saveProfile() {
  if (!form.nickname.trim()) return ElMessage.warning('昵称不能为空')
  saving.value = true
  try {
    await profileStore.updateProfile({
      nickname: form.nickname.trim(),
      avatar: form.avatar,
      bio: form.bio.trim(),
      gender: form.gender,
      birthday: form.birthday ?? '',
      region: form.region.trim(),
    })
    /* 昵称/头像同步顶栏等展示层 */
    if (userStore.user) {
      userStore.user.nickname = form.nickname.trim()
      userStore.user.avatar = form.avatar
    }
    ElMessage.success('资料已更新')
  } catch {
    /* 校验错误由请求层提示 */
  } finally {
    saving.value = false
  }
}

/* 修改密码 */
const pwd = reactive({ old: '', new1: '', new2: '' })
const pwdRef = ref<FormInstance>()
const pwdRules: FormRules = {
  new1: [{ min: 6, message: '密码至少 6 位', trigger: 'blur' }],
  new2: [
    {
      validator: (_r, v: string, cb: (err?: Error) => void) => (v === pwd.new1 ? cb() : cb(new Error('两次输入不一致'))),
      trigger: 'blur',
    },
  ],
}
const pwdSaving = ref(false)
function savePwd() {
  pwdRef.value?.validate(async (ok) => {
    if (!ok) return
    pwdSaving.value = true
    try {
      await profileApi.changePassword({ oldPassword: pwd.old, newPassword: pwd.new1 })
      ElMessage.success('密码已修改,下次登录请使用新密码')
      pwd.old = pwd.new1 = pwd.new2 = ''
    } catch {
      /* 当前密码不正确等错误由请求层提示 */
    } finally {
      pwdSaving.value = false
    }
  })
}

/* ---- 邀请码卡片 ---- */
const invites = ref<InviteCodeItem[]>([])
const inviteLoading = ref(false)
/** 未使用码额度(与后端 INVITE_MAX_UNUSED=5 对齐) */
const INVITE_MAX_UNUSED = 5
const unusedCount = computed(() => invites.value.filter((i) => !i.usedAt).length)

async function loadInvites() {
  inviteLoading.value = true
  try {
    invites.value = await inviteApi.listMine()
  } catch {
    /* 错误由请求层提示 */
  } finally {
    inviteLoading.value = false
  }
}
async function createInvite() {
  try {
    await inviteApi.create()
    ElMessage.success('邀请码已生成')
    await loadInvites()
  } catch {
    /* 超额度等错误由请求层提示 */
  }
}
function copyCode(code: string) {
  navigator.clipboard.writeText(code).then(
    () => ElMessage.success(`已复制 ${code}`),
    () => ElMessage.warning('复制失败,请手动选择复制'),
  )
}
/** 邀请链接:hash 路由,形如 https://host/#/auth/register?code=XXXX */
function inviteLink(code: string) {
  return `${location.origin}${location.pathname}#/auth/register?code=${code}`
}
function copyLink(code: string) {
  navigator.clipboard.writeText(inviteLink(code)).then(
    () => ElMessage.success('邀请链接已复制,发给朋友即可注册'),
    () => ElMessage.warning('复制失败,请手动选择复制'),
  )
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">基本信息</h2>
        <p class="page-sub">我是谁,与谁同行</p>
      </div>
    </div>

    <!-- 名片头卡 -->
    <div class="yiyu-card head-card">
      <span class="big-avatar">{{ profileStore.profile.avatar || '🧑‍💻' }}</span>
      <div class="head-info">
        <span class="nickname">{{ profileStore.profile.nickname }}</span>
        <span class="bio">{{ profileStore.profile.bio || '还没有签名' }}</span>
      </div>
      <div class="head-stats num">
        <div class="stat"><span class="v">{{ joinedDays }}</span><span class="k">已加入/天</span></div>
      </div>
    </div>

    <div class="info-grid">
      <!-- 资料编辑 -->
      <div class="yiyu-card edit-card">
        <h3 class="card-title">资料编辑</h3>
        <el-form label-position="top">
          <el-form-item label="头像">
            <div class="avatar-row">
              <button
                v-for="a in avatarOptions"
                :key="a"
                type="button"
                class="avatar-pick"
                :class="{ active: form.avatar === a }"
                @click="form.avatar = a"
              >{{ a }}</button>
            </div>
          </el-form-item>
          <el-form-item label="昵称" required>
            <el-input v-model="form.nickname" maxlength="12" show-word-limit placeholder="全站展示名" />
          </el-form-item>
          <el-form-item label="个性签名">
            <el-input v-model="form.bio" type="textarea" :rows="2" maxlength="30" show-word-limit placeholder="一句话介绍自己(可选)" />
          </el-form-item>
          <el-form-item label="性别">
            <el-radio-group v-model="form.gender">
              <el-radio-button value="secret">保密</el-radio-button>
              <el-radio-button value="male">男</el-radio-button>
              <el-radio-button value="female">女</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="生日">
            <el-date-picker
              v-model="form.birthday"
              type="date"
              placeholder="选择日期(可选)"
              value-format="YYYY-MM-DD"
              clearable
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="所在地区">
            <el-input v-model="form.region" maxlength="20" placeholder="如:四川·成都(可选)" />
          </el-form-item>
          <el-button type="primary" plain :loading="saving" @click="saveProfile">保存资料</el-button>
        </el-form>
      </div>

      <!-- 账号只读 + 邀请码 + 修改密码 -->
      <div class="col-stack">
        <div class="yiyu-card readonly-card">
          <h3 class="card-title">账号信息</h3>
          <div class="ro-row">
            <span class="ro-label">用户名</span>
            <span class="ro-value num">{{ profileStore.profile.username }}</span>
          </div>
          <div class="ro-row">
            <span class="ro-label">用户 ID</span>
            <span class="ro-value num">{{ profileStore.profile.id }}</span>
          </div>
          <p class="ro-tip">注册后不可修改</p>
        </div>

        <!-- 邀请码(内部应用:发给朋友注册用) -->
        <div class="yiyu-card invite-card" v-loading="inviteLoading">
          <div class="card-title-row">
            <h3 class="card-title">邀请码</h3>
            <span class="invite-quota num">{{ unusedCount }}/{{ INVITE_MAX_UNUSED }} 未使用</span>
          </div>
          <div v-if="invites.length" class="invite-list">
            <div v-for="i in invites" :key="i.id" class="invite-row">
              <span class="invite-code num" :class="{ used: i.usedAt }">{{ i.code }}</span>
              <span class="invite-state">
                <template v-if="i.usedAt">已被 {{ i.usedBy?.nickname || '某位朋友' }} 使用</template>
                <template v-else>未使用</template>
              </span>
              <button v-if="!i.usedAt" class="invite-copy" type="button" @click="copyLink(i.code)">复制链接</button>
              <button class="invite-copy" type="button" @click="copyCode(i.code)">复制</button>
            </div>
          </div>
          <p v-else class="invite-empty">还没有邀请码,生成一个发给朋友吧</p>
          <el-button
            type="primary"
            plain
            :disabled="unusedCount >= INVITE_MAX_UNUSED"
            @click="createInvite"
          >
            {{ unusedCount >= INVITE_MAX_UNUSED ? '额度已用完' : '生成邀请码' }}
          </el-button>
          <p class="ro-tip">邀请码一次性使用;每人最多持有 {{ INVITE_MAX_UNUSED }} 个未使用的码</p>
        </div>

        <div class="yiyu-card pwd-card">
          <h3 class="card-title">修改密码</h3>
          <el-form ref="pwdRef" :model="pwd" :rules="pwdRules" label-position="top">
            <el-form-item label="当前密码">
              <el-input v-model="pwd.old" type="password" show-password />
            </el-form-item>
            <el-form-item label="新密码" prop="new1">
              <el-input v-model="pwd.new1" type="password" show-password />
            </el-form-item>
            <el-form-item label="确认新密码" prop="new2">
              <el-input v-model="pwd.new2" type="password" show-password />
            </el-form-item>
            <el-button type="primary" plain :loading="pwdSaving" @click="savePwd">修改密码</el-button>
          </el-form>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.head-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: var(--gap-card);
  margin-bottom: var(--gap-module);
}

.big-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--app-ledger), var(--app-admin));
  font-size: 26px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.head-info { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.nickname { font-size: 16px; font-weight: 600; }
.bio { font-size: var(--fs-caption); color: var(--text-secondary); }

.head-stats { display: flex; gap: 28px; margin-left: auto; }
.stat { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.stat .v { font-size: 19px; font-weight: 600; }
.stat .k { font-size: var(--fs-caption); color: var(--text-secondary); }

.info-grid {
  display: grid;
  grid-template-columns: minmax(360px, 1fr) minmax(260px, 360px);
  gap: var(--gap-module);
  align-items: start;
}

.col-stack { display: flex; flex-direction: column; gap: var(--gap-module); }
.edit-card, .readonly-card, .invite-card, .pwd-card { padding: var(--gap-card); }
.card-title { font-size: var(--fs-card-title); font-weight: 600; margin-bottom: 16px; }

.avatar-row { display: flex; gap: 8px; flex-wrap: wrap; }
.avatar-pick {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  font-size: 20px;
  cursor: pointer;
  transition: all var(--dur-base) ease;
}
.avatar-pick:hover { border-color: var(--card-border-on-hover); }
.avatar-pick.active {
  border: 2px solid var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
}

.ro-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px dashed var(--border-color);
}
.ro-label { color: var(--text-secondary); font-size: 13px; }
.ro-value { font-size: 13px; color: var(--text-regular); }
.ro-tip { margin-top: 10px; font-size: var(--fs-caption); color: var(--text-secondary); line-height: 1.6; }

/* 邀请码卡片 */
.card-title-row { display: flex; align-items: baseline; justify-content: space-between; }
.card-title-row .card-title { margin-bottom: 12px; }
.invite-quota { font-size: var(--fs-caption); color: var(--text-secondary); }
.invite-list { display: flex; flex-direction: column; margin-bottom: 14px; }
.invite-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px dashed var(--border-color);
}
.invite-row:last-child { border-bottom: none; }
.invite-code {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: var(--color-primary);
}
.invite-code.used { color: var(--text-secondary); text-decoration: line-through; }
.invite-state {
  flex: 1;
  min-width: 0;
  font-size: var(--fs-caption);
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.invite-copy {
  border: 1px solid var(--border-color);
  background: var(--bg-soft);
  color: var(--text-regular);
  border-radius: 6px;
  font-size: 12px;
  padding: 2px 10px;
  cursor: pointer;
  flex-shrink: 0;
  transition: all var(--dur-base) ease;
}
.invite-copy:hover { color: var(--color-primary); border-color: var(--color-primary); }
.invite-copy + .invite-copy { margin-left: -4px; }
.invite-empty {
  font-size: var(--fs-caption);
  color: var(--text-secondary);
  margin-bottom: 14px;
}

@media (max-width: 768px) {
  .info-grid { grid-template-columns: 1fr; }
  .head-stats { display: none; }
}
</style>
