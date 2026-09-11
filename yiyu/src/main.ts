import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import App from './App.vue'
import router from './router'
import { useUserStore } from './shared/stores/user'
import { bindRouterPush } from './shared/api/http'
import './styles/base.css'

const app = createApp(App)

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn }) // 弹窗/分页等内置文案中文化(如 MessageBox 的"取消")

// 请求层 401 时跳登录页(在此注入避免 http ↔ router 循环依赖)
bindRouterPush((path) => {
  if (router.currentRoute.value.path !== path) router.push(path)
})

// 先恢复登录态再挂载:路由守卫能拿到准确 user/ready,避免刷新时闪跳登录页
const userStore = useUserStore()
userStore.fetchMe().finally(() => {
  app.mount('#app')
})
