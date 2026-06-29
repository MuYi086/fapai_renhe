import { defineConfig } from 'vite'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const uni = require('@dcloudio/vite-plugin-uni').default

export default defineConfig({
  plugins: [
    uni()
  ]
})
