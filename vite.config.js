import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { execSync } from 'node:child_process'
import pkg from './package.json' with { type: 'json' }

// 版本：package.json 的 主.次 ＋ git commit 數（每次 commit 自動加 1），顯示在說明卡底下的 szfftz 前面
const commits = (() => { try { return execSync('git rev-list --count HEAD').toString().trim() } catch { return '0' } })()
const VERSION = `v${pkg.version.split('.').slice(0, 2).join('.')}.${commits}`

// base './'：放到 GitHub Pages 子路徑（/ballot-box/）也讀得到
// host：同一個 Wi-Fi 的手機可以直接開（終端機會印出 Network 網址）；AR 要在手機上看
export default defineConfig({
  base: './',
  plugins: [vue()],
  define: { __APP_VERSION__: JSON.stringify(VERSION) },
  // MapLibre 的 worker 是 ES module（見 src/lib/maplibre-worker.js）
  worker: { format: 'es' },
  build: { rollupOptions: { output: { manualChunks: { three: ['three'], maplibre: ['maplibre-gl'] } } } },
  server: { port: 8086, strictPort: true, host: true, open: true },
})
