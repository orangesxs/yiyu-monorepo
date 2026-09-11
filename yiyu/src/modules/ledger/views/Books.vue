<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useLedgerStore } from '../stores/ledger'
import type { Book } from '../types'

const store = useLedgerStore()

onMounted(() => {
  store.init().catch(() => {})
})

/* 新建账本 */
const createVisible = ref(false)
const form = reactive({ name: '', icon: '📘' })
const icons = ['📘', '🏗️', '✈️', '🏡', '🎓', '🏥', '🚗', '💎', '🧾', '🎯']

async function createBook() {
  if (!form.name.trim()) return ElMessage.warning('请输入账本名称')
  try {
    await store.addBook({ name: form.name.trim(), icon: form.icon })
    createVisible.value = false
    form.name = ''
    ElMessage.success('账本已创建')
  } catch {
    /* 校验错误由请求层提示 */
  }
}

async function selectBook(b: Book) {
  if (b.id === store.currentBookId) return
  await store.switchBook(b.id)
  ElMessage.success(`已切换到「${b.name}」`)
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">账本管理</h2>
        <p class="page-sub">不同场景分开记,互不打扰</p>
      </div>
      <el-button type="primary" @click="createVisible = true">+ 新建账本</el-button>
    </div>

    <div class="book-grid">
      <div
        v-for="b in store.books"
        :key="b.id"
        class="yiyu-card yiyu-card--hover book-card"
        :class="{ current: b.id === store.currentBookId }"
        @click="selectBook(b)"
      >
        <span v-if="b.id === store.currentBookId" class="cur-badge">当前账本</span>
        <div class="book-top">
          <span class="book-icon">{{ b.icon }}</span>
          <div class="book-name-wrap">
            <span class="book-name">{{ b.name }}</span>
            <span class="book-stat num">本月支出 ¥{{ b.monthExpense.toLocaleString() }}</span>
          </div>
        </div>
        <div class="book-foot">
          <span class="book-default num">{{ b.isDefault ? '默认账本' : '' }}</span>
          <span v-if="b.id !== store.currentBookId" class="book-switch">切换 →</span>
        </div>
      </div>
    </div>

    <!-- 新建账本 -->
    <el-dialog v-model="createVisible" title="新建账本" width="420px">
      <el-form label-position="top" size="large">
        <el-form-item label="账本名称">
          <el-input v-model="form.name" placeholder="如:装修账、宝宝账" maxlength="12" />
        </el-form-item>
        <el-form-item label="封面图标">
          <div class="icon-row">
            <button
              v-for="ic in icons"
              :key="ic"
              class="icon-pick"
              :class="{ active: form.icon === ic }"
              @click="form.icon = ic"
            >{{ ic }}</button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" @click="createBook">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style src="./Books.css" scoped></style>
