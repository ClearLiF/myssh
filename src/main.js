import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import './assets/global.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import App from './App.vue'

const app = createApp(App)

// 注册所有图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

// 配置 ElementPlus 全局选项（消息提示通过 CSS 控制从底部显示）
app.use(ElementPlus, {
  message: {
    grouping: true,
    duration: 3000,
  }
})

app.mount('#app')
