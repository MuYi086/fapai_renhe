import { defineConfig } from 'vite'
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'
const require = createRequire(import.meta.url)
const uni = require('@dcloudio/vite-plugin-uni').default

// 判断是否是 build 模式（dev 模式不带 build 子命令）
const isBuild = process.argv.includes('build')
// 获取目标平台（h5/mp-weixin/mp-alipay 等）
const platform = process.env.UNI_PLATFORM || 'h5'

export default defineConfig({
  plugins: [
    // 将 JSON import 内联为 JS 对象，避免被提取为独立文件
    // （小程序 build 模式下 require 大文件会失败）
    // enforce: 'pre' 确保在 uni JSON 插件之前执行
    {
      name: 'inline-json-import',
      enforce: 'pre',
      transform(code, id) {
        const parsed = id.split('?')[0]
        if (parsed.includes('node_modules')) return
        if (!parsed.endsWith('.vue') && !parsed.endsWith('.js') && !parsed.endsWith('.ts')) return
        // 匹配 import xxx from '@/static/xxx.json' 或类似路径
        return code.replace(
          /import\s+(\w+)\s+from\s+['"]([^'"]+\.json)['"]/g,
          (match, varName, relPath) => {
            // 解析绝对路径
            let absPath
            if (relPath.startsWith('@/')) {
              // @/ 别名指向 src/ 目录
              absPath = path.resolve(process.cwd(), 'src', relPath.replace('@/', ''))
            } else if (relPath.startsWith('./') || relPath.startsWith('../')) {
              absPath = path.resolve(path.dirname(id), relPath)
            } else {
              return match
            }
            absPath = absPath.split('?')[0]
            if (!fs.existsSync(absPath)) return match
            const data = JSON.parse(fs.readFileSync(absPath, 'utf-8'))
            return `const ${varName} = ${JSON.stringify(data)}`
          }
        )
      }
    },
    uni(),
    {
      // 在 uni 插件配置完成后，强制修正输出目录
      name: 'custom-outdir',
      configResolved(config) {
        config.build.outDir = isBuild
          ? `dist/build/${platform}`
          : `dist/dev/${platform}`
      }
    }
  ]
})
