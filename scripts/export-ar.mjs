// 做 AR 模型的靜態檔：public/model/ballot-box.glb（Android、網頁）、ballot-box.usdz（iPhone）、meta.json（預設鏡頭）
// 開一個 Vite 開發伺服器，用 Chrome（puppeteer-core）打開 /?build：頁面現場跑 3D 場景做模型（src/buildModel.js），再把檔案存下來
// 改了 3D 場景（src/scene/）或掉落結果之後要重跑：npm run build:ar
// Chrome 位置預設是 macOS 的；別的地方用 CHROME=/path/to/chrome npm run build:ar
import { createServer } from 'vite'
import puppeteer from 'puppeteer-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = new URL('../public/model/', import.meta.url)

const server = await createServer({ server: { port: 8099, strictPort: false, open: false, host: false }, logLevel: 'error' })
await server.listen()
const url = `${server.resolvedUrls.local[0]}?build`
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--ignore-gpu-blocklist', '--enable-webgl'] })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 900 })
  page.on('pageerror', (e) => console.error('頁面錯誤：', e.message))
  console.log('做模型中…', url)
  await page.goto(url)
  await page.waitForFunction(() => window.__arFiles, { timeout: 300000, polling: 500 })
  const { glb, usdz, meta } = await page.evaluate(() => window.__arFiles)
  const g = Buffer.from(glb, 'base64'), u = Buffer.from(usdz, 'base64')
  mkdirSync(OUT, { recursive: true })
  writeFileSync(new URL('ballot-box.glb', OUT), g)
  writeFileSync(new URL('ballot-box.usdz', OUT), u)
  // v：檔案內容的雜湊，網址帶著它（換了模型手機才不會讀到快取的舊檔）
  const v = createHash('sha1').update(g).update(u).digest('hex').slice(0, 10)
  writeFileSync(new URL('meta.json', OUT), JSON.stringify({ ...meta, v, usdzBytes: u.length, glbBytes: g.length }) /* 檔案大小：網頁下載 AR 模型時顯示進度用（伺服器壓縮傳送時沒有 content-length） */ + '\n')
  console.log(`完成：glb ${(g.length / 1e6).toFixed(1)} MB、usdz ${(u.length / 1e6).toFixed(1)} MB、v=${v}`)
} finally {
  await browser.close()
  await server.close()
}
