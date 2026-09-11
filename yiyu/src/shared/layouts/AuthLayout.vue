<script setup lang="ts">
</script>

<template>
  <div class="auth-page">
    <!-- 氛围背景:极淡光晕 + 噪点 -->
    <div class="auth-glow auth-glow--a"></div>
    <div class="auth-glow auth-glow--b"></div>
    <div class="auth-noise"></div>
    <router-view />
  </div>
</template>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  background: var(--bg-page);
}

.auth-glow {
  position: absolute;
  width: 640px;
  height: 640px;
  border-radius: 50%;
  filter: blur(80px);
  opacity: var(--glow-opacity);
  pointer-events: none;
}
.auth-glow--a {
  background: var(--app-ledger);
  top: -220px;
  left: -160px;
}
.auth-glow--b {
  background: var(--app-admin);
  bottom: -260px;
  right: -180px;
}

.auth-noise {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: var(--noise-opacity);
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
</style>
