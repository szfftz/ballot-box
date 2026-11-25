<template>
  <!-- 2026 九合一投開票所 AR：從 K30DayMapChallenge-2026 Day 27（New tool）的 AR 模式獨立出來
       做法跟 Day 27 一樣：背後開一張看不見的 MapLibre 地圖跑 3D 投票箱圖層（ballotLayer.js，存好的掉落結果），
       等箱子、圈票處、排隊小人都好了，把場景現做成 .glb（arModel.js），用 Google model-viewer 顯示、按鈕放到 AR -->
  <div class="page">
    <!-- 做模型用的 3D 地圖：固定大小（告示牌位置照 Day 27 的 IG 框對齊），不給人看 -->
    <div v-if="!mapGone" ref="mapEl" class="build-map" aria-hidden="true"></div>

    <div ref="arBox" class="ar-box">
      <p v-if="state" class="ar-state"><span class="spin"></span>{{ state }}</p>
      <button v-if="ready" class="reset" title="回到預設視角" @click="resetView">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        回到預設
      </button>
    </div>

    <section class="card" :class="{ open }">
      <header>
        <p class="kicker">2026-11-28 · 115 年地方公職人員選舉</p>
        <h1>Lining Up for Democracy</h1>
        <p class="title-zh">為民主排隊</p>
        <button class="more" @click="open = !open">{{ open ? '收起說明' : '說明' }}</button>
      </header>

      <div class="body">
        <p>一個地點一個投票箱，從 {{ fmt(BALLOT.dropM) }} 公尺高掉下來，撞到地面或別的箱子會彈開、翻滾、堆起來，排出台灣的形狀。外圍一圈是排隊的小人，分成三段排到三排圈票處。</p>
        <p>用手機打開，按「放到你面前看（AR）」，鏡頭對著地板，模型就會放在你面前：最長邊 {{ AR.sizeM * 100 }} 公分（1 : 50 萬），{{ BALLOT.m / 1000 }} 公里的箱子約 {{ (BALLOT.m * AR.sizeM / 500000 * 1000).toFixed(1) }} 公釐，可以兩指放大。</p>

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
import { onBeforeUnmount, onMounted, ref } from 'vue'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './lib/maplibre-worker.js'
import { ballotLayer, BALLOT, decodeBoxes } from './scene/ballotLayer.js'
import { GROUND_TEXT } from './scene/floorDecal.js'
import { AR, buildArGlb } from './scene/arModel.js'
import pollingUrl from './scene/data/polling.json?url'
import savedUrl from './scene/data/ballots-settled.json?url'

const fmt = (n) => n.toLocaleString()

// Day 27 的 3D 預設視角；AR 一打開的鏡頭照它換算（frameH：參考的 IG 框高）
const VIEW_3D = { center: [121.599, 23.3423], zoom: 7.9, pitch: 60, bearing: 299, frameH: 742.5 }
const { frameH: _, ...JUMP } = VIEW_3D
// 做模型的地圖大小（Day 27 在電腦上地圖欄的大小）：告示牌照這個大小對齊左邊那張 IG 框的紅線內框
const MAP_W = 1600, MAP_H = 900
const IG = { w: 1080, h: 1350 }, IG_FOOT = 80

const mapEl = ref(null)
const arBox = ref(null)
const state = ref('載入投開票所…')
const qrSvg = ref('')
const open = ref(false)
const mapGone = ref(false)
let map = null, ballots = null, arUrl = null, mv = null, cam = null
const ready = ref(false)

const loadScript = (src, attrs = {}) => new Promise((resolve, reject) => {
  if (document.querySelector(`script[src="${src}"]`)) return resolve()
  document.head.appendChild(Object.assign(document.createElement('script'), { src, ...attrs, onload: resolve, onerror: reject }))
})
const frame = () => new Promise((r) => requestAnimationFrame(r))

// 告示牌「LINING UP for DEMOCRACY」放在左邊那張 IG 框（兩張並排）的下面：左右置中、底貼著紅線內框（Day 27 的 fitSign）
async function fitSign() {
  await ballots.signReady
  await frame(); await frame() // 等畫過一次（相機矩陣是最新的）
  const W = MAP_W, H = MAP_H
  const h = W >= (H * IG.w * 2) / IG.h ? H : (W * IG.h) / (IG.w * 2), w = (h * IG.w * 2) / IG.h
  const f = { x: (W - w) / 2, y: (H - h) / 2, w, h }, k = f.h / IG.h
  const tx = f.x + f.w / 4, ty = f.y + f.h - IG_FOOT * k - 2
  let ll = [...GROUND_TEXT.center]
  for (let it = 0; it < 12; it++) {
    const bx = ballots.signBox()
    if (!bx) return
    const dx = tx - (bx.x0 + bx.x1) / 2, dy = ty - bx.y1
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) break
    const sp = map.project(ll), n = map.unproject([sp.x + dx, sp.y + dy])
    ll = [n.lng, n.lat]
    ballots.moveSign(ll)
    await frame()
  }
}

// AR 預設視角＝3D 預設視角：方位、傾斜照抄，距離照縮放換算，看的中心換成模型座標
//   model-viewer 的 theta 0＝從南往北看、順時針為負 → theta＝−bearing；phi＝傾斜；視角 36.87°（跟 MapLibre 一樣）
function arCamera(xf) {
  const lat = VIEW_3D.center[1]
  const mpp = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** VIEW_3D.zoom)
  const dist = ((0.5 * VIEW_3D.frameH) / Math.tan((36.87 / 2) * (Math.PI / 180))) * mpp * xf.k
  const [x, y] = ballots.toLocal(...VIEW_3D.center)
  return { orbit: `${(360 - VIEW_3D.bearing) % 360}deg ${VIEW_3D.pitch}deg ${dist.toFixed(3)}m`, target: `${(x * xf.k + xf.ox).toFixed(3)}m ${xf.oy.toFixed(3)}m ${(-y * xf.k + xf.oz).toFixed(3)}m` }
}

async function build() {
  const [data, saved] = await Promise.all([
    fetch(pollingUrl).then((r) => r.json()),
    fetch(savedUrl).then((r) => r.json()).then((j) => decodeBoxes(j.boxes)).catch(() => null),
  ])

  state.value = '堆投票箱中…'
  map = new maplibregl.Map({
    container: mapEl.value,
    style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#e6e6e6' } }] },
    ...JUMP,
    maxPitch: 85,
    interactive: false,
    attributionControl: false,
    preserveDrawingBuffer: false,
  })
  await new Promise((r) => map.once('load', r))
  ballots = ballotLayer(data.map(([lon, lat], id) => ({ id, lon, lat })), saved, 270)
  map.addLayer(ballots)
  await ballots.finish()
  await fitSign()
  state.value = '做 AR 模型中…'
  await new Promise((r) => setTimeout(r, 1500)) // 等圈票處、排隊小人載好（字型、貼圖）
  const { blob, xf } = await buildArGlb(ballots)
  cam = arCamera(xf)
  // 模型做好了：地圖用不到，拆掉（手機記憶體）
  map.remove()
  map = null
  mapGone.value = true
  arUrl = URL.createObjectURL(blob)

  await loadScript('https://unpkg.com/@google/model-viewer@3.5.0/dist/model-viewer.min.js', { type: 'module' })
  mv = document.createElement('model-viewer')
  for (const [k, v] of Object.entries({ ar: '', 'ar-modes': 'webxr scene-viewer quick-look', 'ar-scale': 'auto', 'camera-controls': '', 'shadow-intensity': '0', 'environment-image': 'neutral', 'tone-mapping': 'neutral', 'camera-orbit': cam.orbit, 'camera-target': cam.target, 'field-of-view': '36.87deg', 'min-camera-orbit': 'auto 0deg 0.05m', 'max-camera-orbit': 'auto 85deg 20m', 'ar-placement': 'floor', 'touch-action': 'none', 'interaction-prompt': 'none', exposure: '0.85', alt: '2026 投開票所投票箱 AR 模型', src: arUrl })) mv.setAttribute(k, v)
  mv.appendChild(Object.assign(document.createElement('button'), { slot: 'ar-button', className: 'ar-btn', textContent: '放到你面前看（AR）' }))
  arBox.value.appendChild(mv)
  ready.value = true
  state.value = ''
}

// 回到預設視角：值跟屬性一樣時 model-viewer 不會動，先改成別的、等它更新完再設回來（會平滑轉回去）
async function resetView() {
  if (!mv || !cam) return
  mv.cameraOrbit = 'auto auto auto'
  mv.cameraTarget = 'auto auto auto'
  await mv.updateComplete
  mv.cameraOrbit = cam.orbit
  mv.cameraTarget = cam.target
  mv.fieldOfView = '36.87deg'
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

onMounted(() => {
  build().catch((e) => { console.error(e); state.value = '模型做不出來（瀏覽器可能不支援 WebGL）' })
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) makeQr() // 電腦才放 QR code
})
onBeforeUnmount(() => { map?.remove(); if (arUrl) URL.revokeObjectURL(arUrl) })
</script>

<style scoped>
.page { position: fixed; inset: 0; }
.build-map { position: fixed; left: 0; top: 0; width: 1600px; height: 900px; opacity: 0; pointer-events: none; z-index: 0; }
.ar-box { position: absolute; inset: 0; z-index: 1; background: var(--bg); } /* 比 3D 的地面深一點，白箱子才看得清楚 */
.ar-box :deep(model-viewer) { width: 100%; height: 100%; --poster-color: transparent; }
.ar-box :deep(.ar-btn) { position: absolute; left: 50%; bottom: calc(24px + env(safe-area-inset-bottom)); transform: translateX(-50%); padding: 12px 22px; border: 0; border-radius: 999px; background: var(--ink); color: #f2f2f2; font-size: 16px; font-weight: 700; cursor: pointer; white-space: nowrap; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2); }
.ar-state { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); margin: 0; display: flex; align-items: center; gap: 10px; font-size: 15px; }
.reset { position: absolute; right: 16px; bottom: calc(24px + env(safe-area-inset-bottom)); z-index: 3; display: flex; align-items: center; gap: 6px; padding: 10px 16px; border: 0; border-radius: 999px; background: var(--card); color: var(--ink); font-size: 14px; font-weight: 700; cursor: pointer; backdrop-filter: blur(8px); box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12); }
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

/* 手機：說明收起來，只留標題（點「說明」展開） */
@media (max-width: 700px) {
  .card { left: 10px; right: 10px; top: calc(10px + env(safe-area-inset-top)); width: auto; max-height: calc(100% - 110px); padding: 12px 14px; }
  h1 { font-size: 18px; }
  .more { display: block; }
  .card:not(.open) .body { display: none; }
  .qr-wrap { display: none; }
  .reset { right: 12px; bottom: calc(84px + env(safe-area-inset-bottom)); padding: 9px 14px; font-size: 13px; }
}
</style>
