<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { agentApi } from '@/modules/agent/api'

type Skill = {
  skillId: string
  group: string
  name: string
  label: string
  description: string
  risk: 'low' | 'medium' | 'high'
  parameters: Record<string, unknown>
  enabled: boolean
}

const skills = ref<Skill[]>([])
const loading = ref(false)

const groups = computed(() => {
  const map = new Map<string, Skill[]>()
  for (const s of skills.value) {
    if (!map.has(s.group)) map.set(s.group, [])
    map.get(s.group)!.push(s)
  }
  const groupLabels: Record<string, string> = { ledger: '记账本', profile: '个人中心', common: '通用' }
  return [...map.entries()].map(([g, items]) => ({ key: g, label: groupLabels[g] ?? g, items }))
})

const riskMeta: Record<string, { label: string; type: 'success' | 'warning' | 'danger' }> = {
  low: { label: '低风险 · 直接执行', type: 'success' },
  medium: { label: '中风险 · 需确认', type: 'warning' },
  high: { label: '高风险 · 警告+确认', type: 'danger' },
}

async function load() {
  loading.value = true
  try {
    skills.value = await agentApi.adminListSkills()
  } finally {
    loading.value = false
  }
}

async function toggle(skill: Skill) {
  const old = skill.enabled
  try {
    await agentApi.adminUpdateSkill(skill.name, skill.enabled)
  } catch {
    skill.enabled = old // 失败回滚(错误提示由请求层 toast)
  }
}

onMounted(() => void load().catch(() => {}))
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">技能管理</h2>
        <p class="page-sub">AI 助手可调用的全部技能;风险等级由模块代码声明,此处可临时停用</p>
      </div>
    </div>

    <div v-loading="loading">
      <div v-for="g in groups" :key="g.key" class="yiyu-card group">
        <h3 class="group__title">{{ g.label }}<span class="group__count">{{ g.items.length }} 个技能</span></h3>
        <div v-for="s in g.items" :key="s.skillId" class="skill-row">
          <div class="skill-row__main">
            <span class="skill-row__label">{{ s.label }}</span>
            <code class="skill-row__name">{{ s.name }}</code>
            <el-tag :type="riskMeta[s.risk].type" size="small">{{ riskMeta[s.risk].label }}</el-tag>
          </div>
          <p class="skill-row__desc">{{ s.description }}</p>
          <div class="skill-row__foot">
            <el-popover placement="top" :width="420" trigger="click">
              <template #reference>
                <el-button link size="small" type="info">参数 schema</el-button>
              </template>
              <pre class="skill-row__json">{{ JSON.stringify(s.parameters, null, 2) }}</pre>
            </el-popover>
            <el-switch v-model="s.enabled" @change="toggle(s)" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.group {
  padding: 16px 20px;
  margin-bottom: var(--gap-4, 16px);
}
.group__title {
  margin: 0 0 10px;
  font-size: var(--fs-body, 15px);
}
.group__count {
  margin-left: 8px;
  font-size: var(--fs-caption, 12px);
  font-weight: 400;
  color: var(--text-3, #999);
}
.skill-row {
  padding: 10px 0;
  border-top: 1px solid color-mix(in srgb, var(--text-3, #ddd) 20%, transparent);
}
.skill-row__main {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.skill-row__label {
  font-weight: 600;
  font-size: var(--fs-body, 14px);
}
.skill-row__name {
  font-size: 12px;
  color: var(--text-3, #999);
}
.skill-row__desc {
  margin: 6px 0;
  font-size: var(--fs-caption, 12px);
  color: var(--text-2, #666);
  line-height: 1.6;
}
.skill-row__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.skill-row__json {
  margin: 0;
  font-size: 12px;
  max-height: 300px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
