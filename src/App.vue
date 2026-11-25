<template>
  <!-- Lining Up for Democracy 為民主排隊（AR）：從 K30DayMapChallenge-2026 Day 27（New tool）的 AR 模式獨立出來
       模型是事先做好的靜態檔（public/model/：npm run build:ar），用 Google model-viewer 顯示、放到 AR
       /?build：開發用，現場用 3D 場景做模型（src/buildModel.js），給 scripts/export-ar.mjs 存檔 -->
  <div class="page">
    <div ref="arBox" class="ar-box">
      <p v-if="state" class="ar-state"><span class="spin"></span>{{ state }}</p>
    </div>

    <!-- 底下置中一排：回到預設、放到 AR（手機能 AR 才有） -->
    <div v-if="ready" class="controls">
      <button class="reset" title="回到預設視角" @click="resetView">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        回到預設
      </button>
      <button v-if="canAr" class="ar-btn" @click="mv.activateAR()">放到你面前看（AR）</button>
    </div>

    <!-- 簽名：整頁最下面、置中（手機收起說明也看得到） -->
    <p class="sign">szfftz</p>

    <section class="card" :class="{ open }">
      <header>
        <h1>Lining Up for Democracy</h1>
        <p class="title-zh">為民主排隊</p>
        <button class="more" @click="open = !open">{{ open ? '收起說明' : '說明' }}</button>
      </header>

      <!-- 說明：跟 K30DayMapChallenge-2026 Day 27 主頁的「說明」一樣（src/data/about.js、share.js）：中文全部在上面，英文全部在下面 -->
      <div class="body">
        <p class="about">2026年11月28日是台灣的地方大選，全國共設有1萬8,244個投票所，由於投票所不能離每個人住的地方太遠，所以會平均地遍布全台。如果把每個投票地點當成一個投票箱堆在一起，堆越高的地方就是越多台灣人住的地方。</p>
        <p class="about-src">資料來源：中央選舉委員會、Esri</p>
        <p class="about-en">Taiwan votes on November 28, 2026. There are 18,244 polling places. They can't be far from people's homes, so they are all over Taiwan. Make one ballot box for each place and pile them up. Higher piles mean more people live there.</p>
        <p class="about-src">Data: Central Election Commission (CEC); Esri</p>
      </div>

      <div v-if="qrSvg" class="qr-wrap">
        <div class="qr" v-html="qrSvg"></div>
        <p>想用 AR 看？用手機相機掃這個 QR code，打開網頁後按「放到你面前看（AR）」，模型就會出現在你面前的地板上。</p>
      </div>
    </section>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { VIEW_3D } from './view.js'

const BASE = import.meta.env.BASE_URL
const BUILD = new URLSearchParams(location.search).has('build')

const arBox = ref(null)
const state = ref('載入模型…')
const qrSvg = ref('')
const open = ref(false)
const ready = ref(false)
const canAr = ref(false)
const mv = shallowRef(null)
let moved = false, blobs = []

const loadScript = (src, attrs = {}) => new Promise((resolve, reject) => {
  if (document.querySelector(`script[src="${src}"]`)) return resolve()
  document.head.appendChild(Object.assign(document.createElement('script'), { src, ...attrs, onload: resolve, onerror: reject }))
})

// 預設視角：方位、傾斜照 Day 27 的 3D（從東南東斜看、傾斜 60°），距離 auto＝model-viewer 照畫面大小退到整個模型都看得到
const FOV = '36.87deg'
const ORBIT = `${(360 - VIEW_3D.bearing) % 360}deg ${VIEW_3D.pitch}deg auto`
// 縮放範圍：最近 5 公分；最遠＝看得到全部的距離 × 1.4（不要拉到模型變成一個點）；最低 85°，不能從地底往上看
const MIN_ORBIT = 'auto 0deg 0.05m'
let fullR = 0 // 看得到全部的距離

async function show(glbUrl, usdzUrl) {
  await loadScript('https://unpkg.com/@google/model-viewer@3.5.0/dist/model-viewer.min.js', { type: 'module' })
  await customElements.whenDefined('model-viewer')
  const el = document.createElement('model-viewer')
  for (const [k, v] of Object.entries({ ar: '', 'ar-modes': 'webxr scene-viewer quick-look', 'ar-scale': 'auto', 'ar-placement': 'floor', 'camera-controls': '', 'shadow-intensity': '0', 'environment-image': 'neutral', 'tone-mapping': 'none', 'camera-orbit': ORBIT, 'camera-target': 'auto auto auto', 'field-of-view': FOV, 'min-camera-orbit': MIN_ORBIT, 'touch-action': 'none', 'interaction-prompt': 'none', exposure: '1', alt: '2026 投開票所投票箱 AR 模型', src: glbUrl, ...(usdzUrl ? { 'ios-src': usdzUrl } : {}) })) el.setAttribute(k, v)
  // 不用 model-viewer 自己的 AR 按鈕：放一個藏起來的佔位，按鈕改放在底下那一排（跟「回到預設」並排）
  el.appendChild(Object.assign(document.createElement('span'), { slot: 'ar-button', hidden: true }))
  // 使用者自己轉過、縮放過就記下來（轉手機方向時不要把他的視角蓋掉）
  el.addEventListener('camera-change', (e) => { if (e.detail?.source === 'user-interaction') moved = true })
  el.addEventListener('load', async () => {
    canAr.value = el.canActivateAR
    state.value = ''
    await resetView()
  })
  el.addEventListener('error', () => { state.value = '模型載入失敗，請重新整理' })
  arBox.value.appendChild(el)
  mv.value = el
  ready.value = true
}

// 回到預設視角：值跟屬性一樣時 model-viewer 不會動，先改成別的、等它更新完再設回來（會平滑轉回去）
async function resetView() {
  const el = mv.value
  if (!el) return
  moved = false
  el.maxCameraOrbit = 'auto 85deg 100m' // 先放開（畫面變大時看得到全部的距離會變；auto 會被限制得更近）
  el.cameraOrbit = '0deg 0deg 1m'
  el.cameraTarget = '0m 0m 0m'
  await el.updateComplete
  el.cameraOrbit = ORBIT
  el.cameraTarget = 'auto auto auto'
  el.fieldOfView = FOV
  await el.updateComplete
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))) // 等 model-viewer 算出 auto 的距離
  el.jumpCameraToGoal() // 直接到預設視角，再照它的距離設最遠範圍
  await new Promise((r) => requestAnimationFrame(r))
  // auto 是照包圍球退的（保守，平平的模型四周留很多白）：橫的畫面再靠近一點，直的畫面寬度剛好，不動
  const box = arBox.value.getBoundingClientRect(), fit = box.width >= box.height ? 0.78 : 1
  fullR = el.getCameraOrbit().radius * fit
  el.cameraOrbit = ORBIT.replace('auto', `${fullR.toFixed(3)}m`)
  await el.updateComplete
  el.jumpCameraToGoal()
  el.maxCameraOrbit = `auto 85deg ${(fullR * 1.4).toFixed(3)}m`
}

// 視窗大小、手機方向變了：沒動過視角就照新的寬高比重算預設視角
let rt = 0
function onResize() {
  clearTimeout(rt)
  rt = setTimeout(() => { if (mv.value && !moved) resetView() }, 200)
}

async function makeQr() {
  try {
    await loadScript('https://unpkg.com/qrcode-generator@1.4.4/qrcode.js')
    const q = window.qrcode(0, 'M')
    q.addData(location.origin + location.pathname)
    q.make()
    qrSvg.value = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true })
  } catch { /* 載不到 QR 產生器：不顯示 */ }
}

async function start() {
  if (BUILD) {
    // 開發用：現場做模型，結果放在 window.__arFiles 給 scripts/export-ar.mjs 存檔
    const { buildModel } = await import('./buildModel.js')
    const files = await buildModel((t) => (state.value = t))
    window.__arFiles = files
    const url = (b, type) => { const u = URL.createObjectURL(new Blob([Uint8Array.from(atob(b), (ch) => ch.charCodeAt(0))], { type })); blobs.push(u); return u }
    return show(url(files.glb, 'model/gltf-binary'), url(files.usdz, 'model/vnd.usdz+zip'))
  }
  const meta = await (await fetch(`${BASE}model/meta.json`)).json()
  // 絕對網址：Android 的 Scene Viewer、iPhone 的 Quick Look 都要真的網址
  const abs = (f) => new URL(`${BASE}model/${f}?v=${meta.v}`, location.href).href
  await show(abs('ballot-box.glb'), abs('ballot-box.usdz'))
}

onMounted(() => {
  addEventListener('resize', onResize)
  start().catch((e) => { console.error(e); state.value = '模型載入失敗，請重新整理' })
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) makeQr() // 電腦才放 QR code
})
onBeforeUnmount(() => { removeEventListener('resize', onResize); blobs.forEach((u) => URL.revokeObjectURL(u)) })
</script>

<style scoped>
.page { position: fixed; inset: 0; }
.ar-box { position: absolute; inset: 0; z-index: 1; background: var(--bg); } /* 比 3D 的地面深一點，白箱子才看得清楚 */
.ar-box :deep(model-viewer) { width: 100%; height: 100%; --poster-color: transparent; }
.controls { position: absolute; z-index: 3; left: 50%; bottom: calc(34px + env(safe-area-inset-bottom)); transform: translateX(-50%); display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 10px; } /* 兩個按鈕一樣寬（照長的那個） */
.controls button { display: flex; align-items: center; justify-content: center; gap: 6px; height: 44px; padding: 0 18px; border: 0; border-radius: 999px; font-size: 14px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.ar-btn { background: var(--ink); color: #f2f2f2; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2); }
.ar-state { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); margin: 0; display: flex; align-items: center; gap: 10px; font-size: 15px; }
.reset { background: var(--card); color: var(--ink); backdrop-filter: blur(8px); box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12); }
.reset:hover { background: #fff; }
.spin { width: 16px; height: 16px; border: 2px solid var(--line); border-top-color: var(--ink); border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.card { position: absolute; z-index: 2; left: 16px; top: 16px; width: 340px; max-height: calc(100% - 32px); overflow: auto; padding: 16px 18px; border-radius: 14px; background: var(--card); backdrop-filter: blur(8px); box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08); font-size: 13px; line-height: 1.6; }
.card { scrollbar-width: thin; scrollbar-color: rgba(22, 22, 22, 0.22) transparent; overscroll-behavior: contain; }
.card::-webkit-scrollbar { width: 10px; }
.card::-webkit-scrollbar-track { background: transparent; margin: 14px 0; }
.card::-webkit-scrollbar-thumb { background: rgba(22, 22, 22, 0.18); border-radius: 999px; border: 3px solid transparent; background-clip: padding-box; }
.card::-webkit-scrollbar-thumb:hover { background-color: rgba(22, 22, 22, 0.34); }
header { position: relative; }
h1 { margin: 2px 0 4px; font-size: 22px; font-weight: 900; line-height: 1.25; }
.title-zh { margin: 0; font-size: 15px; font-weight: 700; }
.more { display: none; position: absolute; right: 0; top: 0; padding: 4px 10px; border: 1px solid var(--line); border-radius: 999px; background: transparent; font-size: 12px; cursor: pointer; }
.body { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); }
.about { margin: 0; font-size: 13px; line-height: 1.7; }
.about-src { margin: 8px 0 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
.about-en { margin: 14px 0 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
.sign { position: absolute; z-index: 3; left: 50%; bottom: calc(8px + env(safe-area-inset-bottom)); transform: translateX(-50%); margin: 0; font-family: Overpass, sans-serif; font-size: 12px; font-weight: 700; color: var(--muted); letter-spacing: .02em; pointer-events: none; }
.qr-wrap { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); text-align: center; color: var(--muted); font-size: 12px; }
.qr { width: 150px; margin: 0 auto 4px; padding: 6px; border-radius: 8px; background: #fff; }
.qr :deep(svg) { display: block; width: 100%; height: auto; }

/* ── RWD ──
   平板（≤1100）：卡片窄一點
   手機直立（≤700 寬）、手機橫放（≤500 高）：說明收起來只留標題（點「說明」展開）、不放 QR code */
/* 電腦、平板：模型只放在卡片右邊（不被卡片蓋住）；底色跟模型一樣，看不出分界 */
.page { background: var(--bg); }
@media (min-width: 701px) and (min-height: 501px) and (orientation: landscape) {
  .ar-box { left: 372px; }
  .controls, .sign { left: calc(50% + 186px); }
}
@media (min-width: 701px) and (max-width: 1100px) and (min-height: 501px) and (orientation: landscape) {
  .ar-box { left: 332px; }
  .controls, .sign { left: calc(50% + 166px); }
}
@media (max-width: 1100px) {
  .card { width: 300px; }
  h1 { font-size: 20px; }
}
@media (max-width: 700px), (max-height: 500px) {
  .card { top: calc(10px + env(safe-area-inset-top)); padding: 12px 14px; }
  header { padding-right: 64px; } /* 讓出「說明」按鈕 */
  h1 { font-size: 18px; }
  .title-zh { font-size: 14px; }
  .more { display: block; }
  .card:not(.open) .body { display: none; }
  .qr-wrap { display: none; }
}
/* 手機直立：卡片左右撐滿；底下兩個按鈕小一點才並排得下 */
@media (max-width: 700px) {
  .card { left: calc(10px + env(safe-area-inset-left)); right: calc(10px + env(safe-area-inset-right)); width: auto; max-height: calc(100% - 100px); }
  .controls { gap: 8px; bottom: calc(32px + env(safe-area-inset-bottom)); }
  .controls button { height: 42px; padding: 0 14px; font-size: 13px; }
}
/* 手機橫放：卡片在左上、窄；按鈕貼近底邊 */
@media (max-height: 500px) and (min-width: 701px) {
  .card { left: calc(10px + env(safe-area-inset-left)); width: 280px; max-height: calc(100% - 20px); }
  .controls { bottom: calc(26px + env(safe-area-inset-bottom)); }
  .sign { bottom: calc(6px + env(safe-area-inset-bottom)); }
  .controls button { height: 40px; padding: 0 14px; font-size: 13px; }
}
</style>
