import { createSSRApp } from 'vue'
import uvUI from 'uv-ui'
import 'uv-ui/es/style.css'
import App from './App.vue'

export function createApp() {
  const app = createSSRApp(App)
  app.use(uvUI)
  return { app }
}
