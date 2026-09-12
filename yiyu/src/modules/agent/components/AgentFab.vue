<script setup lang="ts">
import { useAgentStore } from '../stores/agent'
import AgentChatPanel from './AgentChatPanel.vue'

const store = useAgentStore()
</script>

<template>
  <div class="agent-fab" @click="store.openDrawer()" title="AI 助手">
    <span class="agent-fab__icon">✦</span>
  </div>
  <el-drawer
    :model-value="store.drawerOpen"
    direction="rtl"
    size="min(420px, 100vw)"
    :append-to-body="true"
    :show-close="false"
    :with-header="false"
    @update:model-value="(v: boolean) => (v ? store.openDrawer() : store.closeDrawer())"
  >
    <AgentChatPanel />
  </el-drawer>
</template>

<style scoped>
.agent-fab {
  position: fixed;
  right: 20px;
  bottom: 28px;
  z-index: 110;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: var(--app-agent, #7c5cff);
  color: #fff;
  font-size: 22px;
  box-shadow: 0 6px 20px rgb(124 92 255 / 35%);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  user-select: none;
}
.agent-fab:hover {
  transform: translateY(-2px) scale(1.05);
  box-shadow: 0 10px 26px rgb(124 92 255 / 45%);
}
</style>
