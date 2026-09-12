<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { agentApi } from '@/modules/agent/api'
import { post } from '@/shared/api/http'

const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const testResult = ref<{ ok: boolean; latencyMs: number; model: string; message: string } | null>(null)

const llm = reactive({ baseUrl: '', apiKey: '', model: '', streaming: true })
const persona = reactive({ systemPrompt: '' })
const settings = reactive({ agentEnabled: true, contextTurns: 20, maxToolRounds: 6 })
const maskedKey = ref('')

/* 模型列表(可手输可下拉;表单值未保存也能拉) */
const modelOptions = ref<string[]>([])
const loadingModels = ref(false)
async function fetchModels() {
  if (!llm.baseUrl || (!llm.apiKey && !maskedKey.value)) {
    ElMessage.warning('请先填写 Base URL 和 API Key')
    return
  }
  loadingModels.value = true
  try {
    const res = await post<{ ok: boolean; models: string[]; message?: string }>('/agent/v1/admin/config/models', {
      baseUrl: llm.baseUrl,
      ...(llm.apiKey ? { apiKey: llm.apiKey } : {}),
    })
    if (res.ok && res.models.length) {
      modelOptions.value = res.models
      ElMessage.success(`获取到 ${res.models.length} 个模型`)
    } else {
      ElMessage.warning(res.message || '该服务未返回模型列表,可手动输入模型名')
    }
  } finally {
    loadingModels.value = false
  }
}

/** 表单当前值(apiKey 空则后端用已保存的) */
function formCreds() {
  return { baseUrl: llm.baseUrl, ...(llm.apiKey ? { apiKey: llm.apiKey } : {}) }
}

async function load() {
  loading.value = true
  try {
    const res = await agentApi.adminGetConfig()
    llm.baseUrl = res.llm.baseUrl
    llm.model = res.llm.model
    llm.streaming = res.llm.streaming
    maskedKey.value = res.llm.apiKeyMasked
    persona.systemPrompt = res.persona.systemPrompt
    Object.assign(settings, res.settings)
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    await agentApi.adminUpdateConfig({
      llm: {
        baseUrl: llm.baseUrl,
        model: llm.model,
        streaming: llm.streaming,
        ...(llm.apiKey ? { apiKey: llm.apiKey } : {}), // 空=保留旧值
      },
      persona: { systemPrompt: persona.systemPrompt },
      settings: { ...settings },
    })
    llm.apiKey = ''
    await load()
  } finally {
    saving.value = false
  }
}

/** 按当前表单值测试(未保存也能测) */
async function test() {
  testing.value = true
  testResult.value = null
  try {
    testResult.value = await post<{ ok: boolean; latencyMs: number; model: string; message: string }>(
      '/agent/v1/admin/config/test',
      formCreds(),
    )
  } finally {
    testing.value = false
  }
}

onMounted(() => void load().catch(() => {}))
</script>

<template>
  <div class="page" v-loading="loading">
    <div class="page-head">
      <div>
        <h2 class="page-title">AI 设置</h2>
        <p class="page-sub">LLM 连接(OpenAI 兼容协议)、助手人设与行为参数</p>
      </div>
      <el-button type="primary" :loading="saving" @click="save">保存</el-button>
    </div>

    <div class="yiyu-card sec">
      <h3 class="sec__title">LLM 连接</h3>
      <el-form label-width="92px" label-position="left">
        <el-form-item label="Base URL">
          <el-input v-model="llm.baseUrl" placeholder="如 https://api.deepseek.com/v1" />
        </el-form-item>
        <el-form-item label="API Key">
          <el-input
            v-model="llm.apiKey"
            type="password"
            show-password
            :placeholder="maskedKey ? `已保存(${maskedKey}),留空则保留` : 'sk-…'"
          />
        </el-form-item>
        <el-form-item label="模型">
          <div class="model-row">
            <el-select
              v-model="llm.model"
              filterable
              allow-create
              default-first-option
              placeholder="点击右侧按钮获取,或直接输入模型名"
              class="model-select"
              :loading="loadingModels"
            >
              <el-option v-for="m in modelOptions" :key="m" :label="m" :value="m" />
            </el-select>
            <el-button :loading="loadingModels" @click="fetchModels">获取列表</el-button>
          </div>
        </el-form-item>
        <el-form-item label="流式输出">
          <el-switch v-model="llm.streaming" />
          <span class="sec__hint">个别网关 stream+工具调用不稳时可关闭(走整段返回)</span>
        </el-form-item>
      </el-form>
      <div class="sec__actions">
        <el-button :loading="testing" :disabled="!llm.baseUrl" @click="test">测试连通</el-button>
        <span class="sec__hint">按当前表单值测试(apiKey 留空则用已保存的)</span>
        <el-alert
          v-if="testResult"
          :type="testResult.ok ? 'success' : 'error'"
          :closable="false"
          class="sec__result"
        >
          {{ testResult.message }}<template v-if="testResult.ok"> · {{ testResult.latencyMs }}ms · {{ testResult.model }}</template>
        </el-alert>
      </div>
    </div>

    <div class="yiyu-card sec">
      <h3 class="sec__title">助手人设</h3>
      <el-input
        v-model="persona.systemPrompt"
        type="textarea"
        :rows="8"
        placeholder="system prompt:助手的身份、职责与回答风格"
      />
    </div>

    <div class="yiyu-card sec">
      <h3 class="sec__title">Agent 行为</h3>
      <el-form label-width="120px" label-position="left">
        <el-form-item label="启用 AI 助手">
          <el-switch v-model="settings.agentEnabled" />
        </el-form-item>
        <el-form-item label="上下文窗口(条)">
          <el-input-number v-model="settings.contextTurns" :min="4" :max="100" />
          <span class="sec__hint">携带进 LLM 的最近消息条数,更早的自动摘要</span>
        </el-form-item>
        <el-form-item label="最大工具轮数">
          <el-input-number v-model="settings.maxToolRounds" :min="1" :max="20" />
          <span class="sec__hint">单次对话中工具调用往返的上限</span>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<style scoped>
.sec {
  padding: 18px 20px;
  margin-bottom: var(--gap-4, 16px);
}
.sec__title {
  margin: 0 0 14px;
  font-size: var(--fs-body, 15px);
}
.sec__hint {
  margin-left: 10px;
  font-size: var(--fs-caption, 12px);
  color: var(--text-3, #999);
}
.sec__actions {
  display: flex;
  align-items: center;
  gap: 14px;
}
.sec__result {
  flex: 1;
  padding: 4px 12px;
}
.model-row {
  display: flex;
  gap: 8px;
  width: 100%;
}
.model-select {
  flex: 1;
}
.filter-tabs {
  margin-right: 4px;
}
</style>
