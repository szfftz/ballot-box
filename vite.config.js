import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// 版本：VERSION 檔的 主.次 ＋ 那之後的 commit 數（每次 commit 自動加 1），顯示在說明卡底下的 szfftz 前面
//   改 VERSION 檔（例如 1.1）並 commit，就從 v1.1.0 重新算
const sh = (c) => execSync(c).toString().trim()
const BASE_VER = readFileSync(new URL('./VERSION', import.meta.url), 'utf8').trim()
const commits = (() => { try { return sh(`git rev-list --count ${sh('git log -1 --format=%H -- VERSION')}..HEAD`) } catch { return '0' } })()
const VERSION = `v${BASE_VER}.${commits}`

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
