import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// base './'：放到 GitHub Pages 子路徑（/ballot-box/）也讀得到
// host：同一個 Wi-Fi 的手機可以直接開（終端機會印出 Network 網址）；AR 要在手機上看
export default defineConfig({
  base: './',
  plugins: [vue()],
  // MapLibre 的 worker 是 ES module（見 src/lib/maplibre-worker.js）
  worker: { format: 'es' },
  build: { rollupOptions: { output: { manualChunks: { three: ['three'], maplibre: ['maplibre-gl'] } } } },
  server: { port: 8086, strictPort: true, host: true, open: true },
})
