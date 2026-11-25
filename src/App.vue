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

    <section class="card" :class="{ open }">
      <header>
        <p class="kicker">2026-11-28 · 115 年地方公職人員選舉</p>
        <h1>Lining Up for Democracy</h1>
        <p class="title-zh">為民主排隊</p>
        <button class="more" @click="open = !open">{{ open ? '收起說明' : '說明' }}</button>
      </header>

      <div class="body">
        <p>一個地點一個投票箱，從 2,000 公尺高掉下來，撞到地面或別的箱子會彈開、翻滾、堆起來，排出台灣的形狀。外圍一圈是排隊的小人，分成三段排到三排圈票處。</p>
        <p>用手機打開，按「放到你面前看（AR）」，鏡頭對著地板，模型就會放在你面前：最長邊 100 公分（1 : 50 萬），2 公里的箱子約 4 公釐，可以兩指放大。</p>

        <h2>資料來源</h2>
        <ul class="src">
          <li>投開票所：中央選舉委員會「115年11月28日地方公職人員選舉投票所地點」<br><a href="https://info.cec.gov.tw/vote2026/voteSearch/" target="_blank" rel="noopener">info.cec.gov.tw/vote2026/voteSearch</a></li>
          <li>地址轉座標：Esri ArcGIS World Geocoding Service</li>
          <li>箱子掉落：物理引擎 Rapier 算好存下來（同一個地址的投開票所併成一個箱子）</li>
        </ul>
      </div>

      <div v-if="qrSvg" class="qr-wrap">
        <div class="qr" v-html="qrSvg"></div>
        <p>在電腦上看？用手機掃 QR code 打開，就能放到 AR</p>
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
let meta = null, moved = false, blobs = []

const loadScript = (src, attrs = {}) => new Promise((resolve, reject) => {
  if (document.querySelector(`script[src="${src}"]`)) return resolve()
  document.head.appendChild(Object.assign(document.createElement('script'), { src, ...attrs, onload: resolve, onerror: reject }))
})

// 預設視角：Day 27 的畫面是兩張 IG 並排（寬:高＝1.6），視角 36.87° 是上下的
//   畫面比 1.6 窄（直立的手機、平板）時往後退一點，但最多退 1.4 倍（不要縮太遠，左右切掉一點沒關係）
const ASPECT = 1.6, FOV = '36.87deg'
const aspectNow = () => { const r = arBox.value?.getBoundingClientRect(); return r && r.height ? r.width / r.height : ASPECT }
function camera() {
  const fit = Math.min(1.4, Math.max(1, Math.sqrt(ASPECT / aspectNow()) * 0.75))
  const dist = meta.dist * fit
  return {
    orbit: `${(360 - VIEW_3D.bearing) % 360}deg ${VIEW_3D.pitch}deg ${dist.toFixed(3)}m`,
    target: meta.target.map((v) => `${v}m`).join(' '),
    // 縮放範圍：最近 5 公分，最遠預設距離的 1.6 倍（不要拉到模型變成一個點）；最低 85°，不能從地底往上看
    min: 'auto 0deg 0.05m',
    max: `auto 85deg ${(dist * 1.6).toFixed(3)}m`,
  }
}

async function show(glbUrl, usdzUrl) {
  await loadScript('https://unpkg.com/@google/model-viewer@3.5.0/dist/model-viewer.min.js', { type: 'module' })
  await customElements.whenDefined('model-viewer')
  const c = camera()
  const el = document.createElement('model-viewer')
  for (const [k, v] of Object.entries({ ar: '', 'ar-modes': 'webxr scene-viewer quick-look', 'ar-scale': 'auto', 'ar-placement': 'floor', 'camera-controls': '', 'shadow-intensity': '0', 'environment-image': 'neutral', 'tone-mapping': 'neutral', 'camera-orbit': c.orbit, 'camera-target': c.target, 'field-of-view': FOV, 'min-camera-orbit': c.min, 'max-camera-orbit': c.max, 'touch-action': 'none', 'interaction-prompt': 'none', exposure: '0.85', alt: '2026 投開票所投票箱 AR 模型', src: glbUrl, ...(usdzUrl ? { 'ios-src': usdzUrl } : {}) })) el.setAttribute(k, v)
  // 不用 model-viewer 自己的 AR 按鈕：放一個藏起來的佔位，按鈕改放在底下那一排（跟「回到預設」並排）
  el.appendChild(Object.assign(document.createElement('span'), { slot: 'ar-button', hidden: true }))
  // 使用者自己轉過、縮放過就記下來（轉手機方向時不要把他的視角蓋掉）
  el.addEventListener('camera-change', (e) => { if (e.detail?.source === 'user-interaction') moved = true })
  el.addEventListener('load', () => { canAr.value = el.canActivateAR; state.value = '' })
  el.addEventListener('error', () => { state.value = '模型載入失敗，請重新整理' })
  arBox.value.appendChild(el)
  mv.value = el
  ready.value = true
}

// 回到預設視角：值跟屬性一樣時 model-viewer 不會動，先改成別的、等它更新完再設回來（會平滑轉回去）
async function resetView() {
  const el = mv.value
  if (!el || !meta) return
  const c = camera()
  moved = false
  el.maxCameraOrbit = c.max
  el.cameraOrbit = 'auto auto auto'
  el.cameraTarget = 'auto auto auto'
  await el.updateComplete
  el.cameraOrbit = c.orbit
  el.cameraTarget = c.target
  el.fieldOfView = FOV
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
    meta = files.meta
    const url = (b, type) => { const u = URL.createObjectURL(new Blob([Uint8Array.from(atob(b), (ch) => ch.charCodeAt(0))], { type })); blobs.push(u); return u }
    return show(url(files.glb, 'model/gltf-binary'), url(files.usdz, 'model/vnd.usdz+zip'))
  }
  meta = await (await fetch(`${BASE}model/meta.json`)).json()
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
.controls { position: absolute; z-index: 3; left: 50%; bottom: calc(24px + env(safe-area-inset-bottom)); transform: translateX(-50%); display: flex; align-items: center; gap: 10px; }
.controls button { display: flex; align-items: center; gap: 6px; border: 0; border-radius: 999px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.ar-btn { padding: 12px 22px; background: var(--ink); color: #f2f2f2; font-size: 16px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2); }
.ar-state { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); margin: 0; display: flex; align-items: center; gap: 10px; font-size: 15px; }
.reset { padding: 11px 16px; background: var(--card); color: var(--ink); font-size: 14px; backdrop-filter: blur(8px); box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12); }
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
.kicker { margin: 0; color: var(--muted); font-size: 12px; }
h1 { margin: 2px 0 4px; font-size: 22px; font-weight: 900; line-height: 1.25; }
.title-zh { margin: 0; font-size: 15px; font-weight: 700; }
.more { display: none; position: absolute; right: 0; top: 0; padding: 4px 10px; border: 1px solid var(--line); border-radius: 999px; background: transparent; font-size: 12px; cursor: pointer; }
.body p { margin: 10px 0 0; }
h2 { margin: 14px 0 4px; font-size: 13px; font-weight: 700; }
.src { margin: 0; padding-left: 18px; color: var(--muted); font-size: 12px; }
.src li { margin: 2px 0; }
.qr-wrap { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); text-align: center; color: var(--muted); font-size: 12px; }
.qr { width: 150px; margin: 0 auto 4px; padding: 6px; border-radius: 8px; background: #fff; }
.qr :deep(svg) { display: block; width: 100%; height: auto; }

/* ── RWD ──
   平板（≤1100）：卡片窄一點
   手機直立（≤700 寬）、手機橫放（≤500 高）：說明收起來只留標題（點「說明」展開）、不放 QR code */
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
  .controls { gap: 8px; bottom: calc(20px + env(safe-area-inset-bottom)); }
  .ar-btn { padding: 12px 18px; font-size: 15px; }
  .reset { padding: 11px 14px; font-size: 13px; }
}
/* 手機橫放：卡片在左上、窄；按鈕貼近底邊 */
@media (max-height: 500px) and (min-width: 701px) {
  .card { left: calc(10px + env(safe-area-inset-left)); width: 280px; max-height: calc(100% - 20px); }
  .controls { bottom: calc(12px + env(safe-area-inset-bottom)); }
  .ar-btn { padding: 10px 18px; font-size: 15px; }
  .reset { padding: 10px 14px; font-size: 13px; }
}
</style>
