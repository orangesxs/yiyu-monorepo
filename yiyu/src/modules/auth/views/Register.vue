<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { useUserStore } from '@/shared/stores/user'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const formRef = ref<FormInstance>()
const loading = ref(false)

const form = reactive({ username: '', nickname: '', password: '', confirm: '', inviteCode: '' })

/* 邀请链接直达:注册页支持 ?code=XXXX 预填邀请码 */
onMounted(() => {
  const code = typeof route.query.code === 'string' ? route.query.code.trim() : ''
  if (code) form.inviteCode = code
})

function validateConfirm(_rule: unknown, value: string, callback: (err?: Error) => void) {
  if (value !== form.password) callback(new Error('两次输入的密码不一致'))
  else callback()
}

const rules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 2, max: 20, message: '2-20 个字符', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 位', trigger: 'blur' },
  ],
  confirm: [{ required: true, validator: validateConfirm, trigger: 'blur' }],
  inviteCode: [{ required: true, message: '请输入邀请码', trigger: 'blur' }],
}

function submit() {
  formRef.value?.validate(async (ok) => {
    if (!ok) return
    loading.value = true
    try {
      await userStore.register({
        username: form.username,
        nickname: form.nickname || form.username,
        password: form.password,
        inviteCode: form.inviteCode.trim(),
      })
      ElMessage.success('欢迎来到你的一隅')
      router.push('/')
    } catch {
      /* 错误提示由请求层统一弹出(邀请码无效/用户名已存在等) */
    } finally {
      loading.value = false
    }
  })
}
</script>

<template>
  <div class="register-card yiyu-card rise-in">
    <div class="logo-row">
      <span class="logo-mark">隅</span>
      <span class="logo-name">创建账号</span>
    </div>
    <p class="slogan">从这里开始,搭建你的一隅</p>

    <el-form ref="formRef" :model="form" :rules="rules" size="large" @keyup.enter="submit">
      <el-form-item prop="username">
        <el-input v-model="form.username" placeholder="用户名(登录用)" :prefix-icon="'User'" />
      </el-form-item>
      <el-form-item prop="nickname">
        <el-input v-model="form.nickname" placeholder="昵称(可选,展示用)" :prefix-icon="'Avatar'" />
      </el-form-item>
      <el-form-item prop="password">
        <el-input v-model="form.password" type="password" show-password placeholder="密码(至少 6 位)" :prefix-icon="'Lock'" />
      </el-form-item>
      <el-form-item prop="inviteCode">
        <el-input v-model="form.inviteCode" placeholder="邀请码(向好友或管理员索取)" :prefix-icon="'Ticket'" maxlength="8" />
      </el-form-item>
      <el-form-item prop="confirm">
        <el-input v-model="form.confirm" type="password" show-password placeholder="确认密码" :prefix-icon="'Lock'" />
      </el-form-item>
      <el-button type="primary" size="large" class="submit-btn" :loading="loading" @click="submit">
        注册并进入
      </el-button>
    </el-form>

    <div class="switch-line">
      已有账号?
      <router-link to="/auth/login" class="link">直接登录</router-link>
    </div>
  </div>
</template>

<style scoped>
.register-card {
  width: 380px;
  max-width: calc(100vw - 40px);
  padding: 40px 40px 32px;
  position: relative;
  z-index: 1;
}
.logo-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
.logo-mark {
  width: 44px;
  height: 44px;
  border-radius: 13px;
  background: var(--color-primary);
  color: #fff;
  font-size: 22px;
  font-weight: 600;
  display: grid;
  place-items: center;
}
.logo-name {
  font-size: 24px;
  font-weight: 700;
}
.slogan {
  text-align: center;
  color: var(--text-secondary);
  font-size: var(--fs-caption);
  margin: 10px 0 26px;
  letter-spacing: 0.08em;
}
.submit-btn {
  width: 100%;
  border-radius: var(--radius-input);
  font-weight: 500;
}
.switch-line {
  margin-top: 18px;
  text-align: center;
  font-size: var(--fs-caption);
  color: var(--text-secondary);
}
.link { color: var(--primary-ink); text-decoration: none; }
.link:hover { text-decoration: underline; }
</style>
