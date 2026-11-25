<template>
  <!-- Lining Up for Democracy 為民主排隊（AR）：K30DayMapChallenge-2026 Day 27（New tool）獨立出來的網站
       畫面＝Day 27 的 3D 本身（MapLibre 地圖＋src/scene/ballotLayer.js，同一份程式：光、影子、地面、天空都一樣）
       AR＝事先做好的靜態模型（public/model/：npm run build:ar），按鈕交給手機的 AR（Android Scene Viewer、iPhone Quick Look）
       /?build：開發用，現場做 AR 模型（src/buildModel.js），給 scripts/export-ar.mjs 存檔 -->
  <div class="page">
    <div class="ar-box">
      <div ref="mapEl" class="map"></div>
      <p v-if="state" class="ar-state"><span class="spin"></span>{{ state }}</p>
    </div>

    <!-- 底下置中一排：回到預設、放到 AR（手機能 AR 才有） -->
    <div v-if="ready" class="controls">
      <button class="reset" title="回到預設視角" @click="resetView">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        回到預設
      </button>
      <button v-if="canAr" class="ar-btn" @click="openAr">放到你面前看（AR）</button>
    </div>

    <section class="card" :class="{ open }">
      <header>
        <h1>Lining Up for Democracy</h1>
        <p class="title-zh">為民主排隊</p>
        <button class="more" @click="open = !open">{{ open ? '收起說明' : '說明' }}</button>
      </header>

      <!-- 說明：跟 K30DayMapChallenge-2026 Day 27 主頁的「說明」一樣（src/data/about.js、share.js）：中文全部在上面，英文全部在下面 -->
      <div class="body">
        <p class="about">11月28日台灣即將舉行地方大選，全國有18,248個投票所，由於投票所不能離每個人住的地方太遠，所以會平均地遍布全台。如果把每個投票地點當成一個投票箱堆在一起，堆越高的地方就是越多人住的地方。用手機打開網頁的AR，就能把它放在你面前看。</p>
        <p class="about-src">資料來源：中央選舉委員會、Esri</p>
        <p class="about-en">Taiwan votes on Nov 28 at 18,248 polling places, spread all over so none is far from home. Pile one ballot box per place: higher piles, more people. See it in AR on your phone.</p>
        <p class="about-src">Data: Central Election Commission (CEC); Esri</p>
      </div>

      <div v-if="qrSvg" class="qr-wrap">
        <div class="qr" v-html="qrSvg"></div>
        <p>想用 AR 看？用手機相機掃這個 QR code，打開網頁後按「放到你面前看（AR）」，模型就會出現在你面前的地板上。</p>
      </div>
      <!-- 簽名：左邊內容區最下面、置中 -->
      <p class="sign">szfftz</p>
    </section>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { VIEW_3D } from './view.js'

const BASE = import.meta.env.BASE_URL
const BUILD = new URLSearchParams(location.search).has('build')

const mapEl = ref(null)
const state = ref('載入中…')
const qrSvg = ref('')
const open = ref(false)
const ready = ref(false)
const canAr = ref(false)
let map = null, mv = null, moved = false, PTS = [], meta = null

const loadScript = (src, attrs = {}) => new Promise((resolve, reject) => {
  if (document.querySelector(`script[src="${src}"]`)) return resolve()
  document.head.appendChild(Object.assign(document.createElement('script'), { src, ...attrs, onload: resolve, onerror: reject }))
})

// 預設視角：方位、傾斜跟 Day 27 一樣（299°、60°）；中心、縮放照畫面大小算，讓全部（投票箱、三排圈票處、排隊、告示牌）
//   剛好放進畫面、上下左右置中（扣掉上面的說明卡、底下的按鈕）
function pads() {
  const W = mapEl.value.clientWidth, H = mapEl.value.clientHeight
  const card = document.querySelector('.card')?.getBoundingClientRect()
  const box = mapEl.value.getBoundingClientRect()
  // 說明卡蓋在地圖上面（手機：卡片橫跨地圖）才讓出上面；電腦的卡片在地圖左邊，不用
  const overlapTop = card && card.right > box.left + 10 && card.left < box.right - 10 && card.width > box.width * 0.6 ? Math.max(0, card.bottom - box.top) : 0
  return { W, H, t: overlapTop + 16, b: 84, l: 16, r: 16 }
}
function fitView() {
  const { W, H, t, b, l, r } = pads()
  map.jumpTo({ center: VIEW_3D.center, zoom: VIEW_3D.zoom, bearing: VIEW_3D.bearing, pitch: VIEW_3D.pitch })
  for (let i = 0; i < 8; i++) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const p of PTS) {
      const q = map.project(p)
      x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y)
    }
    y0 -= (y1 - y0) * 0.06 // 人、圈票處是立起來的（約 15 km 高），上面多留一點
    const aw = W - l - r, ah = H - t - b
    const k = Math.min(aw / (x1 - x0), ah / (y1 - y0))
    const tx = l + aw / 2, ty = t + ah / 2, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
    const c = map.unproject([W / 2 + (cx - tx), H / 2 + (cy - ty)])
    map.jumpTo({ center: c, zoom: map.getZoom() + Math.max(-2, Math.min(2, Math.log2(k))) }) // 一次最多縮放 2 級，不會跑掉
  }
  moved = false
}
function resetView() { if (map) fitView() }

// 視窗大小、手機方向變了：沒動過視角就重新放進畫面
let rt = 0
function onResize() {
  clearTimeout(rt)
  rt = setTimeout(() => { if (map && !moved) fitView() }, 200)
}

async function startMap() {
  const [maplibregl, { ballotLayer, decodeBoxes }, { GROUND, BILLBOARD, BILLBOARD2, BILLBOARD3 }, QUEUE, polling, settled] = await Promise.all([
    import('maplibre-gl'), import('./scene/ballotLayer.js'), import('./scene/floorDecal.js'), import('./scene/data/queue-path.json'),
    import('./scene/data/polling.json?url'), import('./scene/data/ballots-settled.json?url'), import('maplibre-gl/dist/maplibre-gl.css'), import('./lib/maplibre-worker.js'),
  ])
  const [data, saved] = await Promise.all([
    fetch(polling.default).then((r) => r.json()),
    fetch(settled.default).then((r) => r.json()).then((j) => decodeBoxes(j.boxes)),
  ])
  // 地圖跟 Day 27 一樣：不放底圖，只有淺色底（#e6e6e6）；傾斜最多 85°
  map = new maplibregl.Map({
    container: mapEl.value,
    style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#e6e6e6' } }] },
    center: VIEW_3D.center, zoom: VIEW_3D.zoom, bearing: VIEW_3D.bearing, pitch: VIEW_3D.pitch,
    maxPitch: 85,
    attributionControl: { compact: true, customAttribution: '投開票所：中選會；地理編碼：Esri' },
  })
  await new Promise((r) => map.once('load', r))
  const ballots = ballotLayer(data.map(([lon, lat], id) => ({ id, lon, lat })), saved, 270)
  map.addLayer(ballots)
  // 天空（傾斜大時地平線以上）：跟 Day 27 一樣，地平線接地面最遠的顏色，往上變亮
  map.setSky?.({ 'sky-color': GROUND.sky, 'horizon-color': GROUND.far, 'fog-color': GROUND.far, 'sky-horizon-blend': 1, 'horizon-fog-blend': 1, 'fog-ground-blend': 1, 'atmosphere-blend': 0 })
  // 告示牌放在做 AR 模型時算好的位置（Day 27 對齊 IG 框的那個位置），畫面、AR 一樣
  await ballots.signReady
  if (meta?.sign) ballots.moveSign(meta.sign)
  // 要放進畫面的範圍：所有投票箱、排隊的一圈、三排圈票處、告示牌
  PTS = [...data.map(([lon, lat]) => [lon, lat]), ...QUEUE.default[0], ...[BILLBOARD, BILLBOARD2, BILLBOARD3].map((b) => b.lonlat), ...(meta?.sign ? [meta.sign] : [])]
  fitView()
  map.on("movestart", (e) => { if (e.originalEvent) moved = true })
  ready.value = true
  state.value = ''
}

// AR：一個看不見的 model-viewer，只拿來把模型交給手機的 AR（不在網頁上畫，不會先下載模型）
//   Android 用 Scene Viewer、iPhone 用 Quick Look（都要真的網址）；都不行才用 WebXR
async function setupAr() {
  await loadScript('https://unpkg.com/@google/model-viewer@3.5.0/dist/model-viewer.min.js', { type: 'module' })
  await customElements.whenDefined('model-viewer')
  const abs = (f) => new URL(`${BASE}model/${f}?v=${meta.v}`, location.href).href
  mv = document.createElement('model-viewer')
  for (const [k, v] of Object.entries({ ar: '', 'ar-modes': 'scene-viewer quick-look webxr', 'ar-scale': 'auto', 'ar-placement': 'floor', loading: 'lazy', reveal: 'manual', alt: '2026 投開票所投票箱 AR 模型', src: abs('ballot-box.glb'), 'ios-src': abs('ballot-box.usdz') })) mv.setAttribute(k, v)
  mv.appendChild(Object.assign(document.createElement('span'), { slot: 'ar-button', hidden: true }))
  mv.className = 'ar-hidden'
  document.body.appendChild(mv)
  await mv.updateComplete
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  canAr.value = mv.canActivateAR
}
function openAr() { mv?.activateAR() }

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
    // 開發用：現場做 AR 模型，結果放在 window.__arFiles 給 scripts/export-ar.mjs 存檔
    const { buildModel } = await import('./buildModel.js')
    window.__arFiles = await buildModel((t) => (state.value = t))
    state.value = '模型做好了'
    return
  }
  meta = await (await fetch(`${BASE}model/meta.json`)).json()
  setupAr().catch(() => {})
  await startMap()
}

onMounted(() => {
  addEventListener('resize', onResize)
  start().catch((e) => { console.error(e); state.value = '載入失敗，請重新整理' })
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) makeQr() // 電腦才放 QR code
})
onBeforeUnmount(() => { removeEventListener('resize', onResize); map?.remove(); mv?.remove() })
</script>

<style scoped>
.page { position: fixed; inset: 0; }
.ar-box { position: absolute; inset: 0; z-index: 1; background: #e6e6e6; } /* 跟 Day 27 的底色一樣 */
.map { position: absolute; inset: 0; }
.ar-box :deep(.maplibregl-ctrl-bottom-right) { bottom: 72px; } /* 資料來源標註不要被按鈕蓋住 */
.controls { position: absolute; z-index: 3; left: 50%; bottom: calc(24px + env(safe-area-inset-bottom)); transform: translateX(-50%); display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 10px; } /* 兩個按鈕一樣寬（照長的那個） */
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
.sign { margin: 16px 0 0; text-align: center; font-family: Overpass, sans-serif; font-size: 12px; font-weight: 700; color: var(--muted); letter-spacing: .02em; }
.qr-wrap { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); text-align: center; color: var(--muted); font-size: 12px; }
.qr { width: 150px; margin: 0 auto 4px; padding: 6px; border-radius: 8px; background: #fff; }
.qr :deep(svg) { display: block; width: 100%; height: auto; }

/* ── RWD ──
   平板（≤1100）：卡片窄一點
   手機直立（≤700 寬）、手機橫放（≤500 高）：說明收起來只留標題（點「說明」展開）、不放 QR code */
/* 電腦、平板：模型只放在卡片右邊（不被卡片蓋住）；底色跟模型一樣，看不出分界 */
.page { background: #e6e6e6; }
@media (min-width: 701px) and (min-height: 501px) and (orientation: landscape) {
  .ar-box { left: 372px; }
  .controls { left: calc(50% + 186px); }
}
@media (min-width: 701px) and (max-width: 1100px) and (min-height: 501px) and (orientation: landscape) {
  .ar-box { left: 332px; }
  .controls { left: calc(50% + 166px); }
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
  .card:not(.open) .body, .card:not(.open) .sign { display: none; }
  .qr-wrap { display: none; }
}
/* 手機直立：卡片左右撐滿；底下兩個按鈕小一點才並排得下 */
@media (max-width: 700px) {
  .card { left: calc(10px + env(safe-area-inset-left)); right: calc(10px + env(safe-area-inset-right)); width: auto; max-height: calc(100% - 100px); }
  .controls { gap: 8px; bottom: calc(20px + env(safe-area-inset-bottom)); }
  .controls button { height: 42px; padding: 0 14px; font-size: 13px; }
}
/* 手機橫放：卡片在左上、窄；按鈕貼近底邊 */
@media (max-height: 500px) and (min-width: 701px) {
  .card { left: calc(10px + env(safe-area-inset-left)); width: 280px; max-height: calc(100% - 20px); }
  .controls { bottom: calc(12px + env(safe-area-inset-bottom)); }
  .controls button { height: 40px; padding: 0 14px; font-size: 13px; }
}
</style>

<style>
/* AR 用的 model-viewer 看不見，只拿來開手機的 AR */
.ar-hidden { position: fixed; left: -10px; top: 0; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
</style>
