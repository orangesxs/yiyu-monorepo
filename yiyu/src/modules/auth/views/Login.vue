<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { useUserStore } from '@/shared/stores/user'

const router = useRouter()
const userStore = useUserStore()
const formRef = ref<FormInstance>()
const loading = ref(false)

const form = reactive({ username: '', password: '' })
const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 位', trigger: 'blur' },
  ],
}

function submit() {
  formRef.value?.validate(async (ok) => {
    if (!ok) return
    loading.value = true
    try {
      await userStore.login({ username: form.username, password: form.password })
      router.push('/')
    } catch {
      /* 错误提示由请求层统一弹出 */
    } finally {
      loading.value = false
    }
  })
}
</script>

<template>
  <div class="login-card yiyu-card rise-in">
    <div class="logo-row">
      <span class="logo-mark">隅</span>
      <span class="logo-name">一隅</span>
    </div>
    <p class="slogan">给自己留一隅空间</p>

    <el-form ref="formRef" :model="form" :rules="rules" size="large" @keyup.enter="submit">
      <el-form-item prop="username">
        <el-input v-model="form.username" placeholder="用户名" :prefix-icon="'User'" />
      </el-form-item>
      <el-form-item prop="password">
        <el-input v-model="form.password" type="password" show-password placeholder="密码" :prefix-icon="'Lock'" />
      </el-form-item>
      <el-button type="primary" size="large" class="submit-btn" :loading="loading" @click="submit">
        进入我的一隅
      </el-button>
    </el-form>

    <div class="switch-line">
      还没有账号?
      <router-link to="/auth/register" class="link">注册一个</router-link>
    </div>
  </div>
</template>

<style scoped>
.login-card {
  width: 380px;
  max-width: calc(100vw - 40px);
  padding: 44px 40px 36px;
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
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.slogan {
  text-align: center;
  color: var(--text-secondary);
  font-size: var(--fs-caption);
  margin: 10px 0 30px;
  letter-spacing: 0.12em;
}

.submit-btn {
  width: 100%;
  margin-top: 4px;
  border-radius: var(--radius-input);
  font-weight: 500;
}

.switch-line {
  margin-top: 20px;
  text-align: center;
  font-size: var(--fs-caption);
  color: var(--text-secondary);
}
.link {
  color: var(--primary-ink);
  text-decoration: none;
}
.link:hover {
  text-decoration: underline;
}
</style>
