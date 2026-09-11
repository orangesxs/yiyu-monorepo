import { defineStore } from 'pinia'
import { ref, watchEffect } from 'vue'

const THEME_KEY = 'yiyu-theme'

export const useThemeStore = defineStore('theme', () => {
  const saved = localStorage.getItem(THEME_KEY)
  const isDark = ref(saved === 'dark')

  function apply() {
    document.documentElement.classList.toggle('dark', isDark.value)
    document.documentElement.classList.toggle('light', !isDark.value)
  }
  function toggle() {
    isDark.value = !isDark.value
  }
  watchEffect(() => {
    localStorage.setItem(THEME_KEY, isDark.value ? 'dark' : 'light')
    apply()
  })
  apply()

  return { isDark, toggle }
})
