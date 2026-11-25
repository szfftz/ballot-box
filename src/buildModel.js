// 做 AR 模型（開發用：npm run build:ar → scripts/export-ar.mjs 打開 /?build，存成 public/model/ 的靜態檔）
// 做法跟 K30DayMapChallenge-2026 Day 27 一樣：開一張看不見的 MapLibre 地圖跑 3D 投票箱圖層（ballotLayer.js，存好的掉落結果），
// 等箱子、圈票處、排隊小人都好了，把場景做成 .glb（Android、網頁）和 .usdz（iPhone AR Quick Look）
// 網頁直接讀做好的檔：手機不用自己跑 3D 場景（慢、吃記憶體），Android 的 Scene Viewer 也要真的網址（blob 不行）
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './lib/maplibre-worker.js'
import { ballotLayer, decodeBoxes } from './scene/ballotLayer.js'
import { GROUND_TEXT } from './scene/floorDecal.js'
import { buildArGlb } from './scene/arModel.js'
import pollingUrl from './scene/data/polling.json?url'
import savedUrl from './scene/data/ballots-settled.json?url'
import { VIEW_3D } from './view.js'

// 做模型的地圖大小（Day 27 在電腦上地圖欄的大小）：告示牌照這個大小對齊左邊那張 IG 框的紅線內框
const MAP_W = 1600, MAP_H = 900
const IG = { w: 1080, h: 1350 }, IG_FOOT = 80
const frame = () => new Promise((r) => requestAnimationFrame(r))

// 告示牌「LINING UP for DEMOCRACY」放在左邊那張 IG 框（兩張並排）的下面：左右置中、底貼著紅線內框（Day 27 的 fitSign）
async function fitSign(map, ballots) {
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

const b64 = (buf) => {
  const u8 = new Uint8Array(buf.buffer ?? buf)
  let s = ''
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000))
  return btoa(s)
}

/** 回傳 { glb, usdz（base64）, meta：{ dist（預設鏡頭距離，公尺）, target（看的中心，模型座標 [x, y, z] 公尺）} } */
export async function buildModel(onState = () => {}) {
  const el = Object.assign(document.createElement('div'), { style: `position:fixed;left:0;top:0;width:${MAP_W}px;height:${MAP_H}px;opacity:0;pointer-events:none` })
  document.body.appendChild(el)
  const [data, saved] = await Promise.all([
    fetch(pollingUrl).then((r) => r.json()),
    fetch(savedUrl).then((r) => r.json()).then((j) => decodeBoxes(j.boxes)).catch(() => null),
  ])
  onState('堆投票箱中…')
  const { frameH: _, ...jump } = VIEW_3D
  const map = new maplibregl.Map({
    container: el,
    style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#e6e6e6' } }] },
    ...jump,
    maxPitch: 85,
    interactive: false,
    attributionControl: false,
    pixelRatio: 1,
  })
  await new Promise((r) => map.once('load', r))
  const ballots = ballotLayer(data.map(([lon, lat], id) => ({ id, lon, lat })), saved, 270)
  map.addLayer(ballots)
  await ballots.finish()
  await fitSign(map, ballots)
  onState('做 AR 模型中…')
  await new Promise((r) => setTimeout(r, 1500)) // 等圈票處、排隊小人載好（字型、貼圖）
  // 模型轉到 Day 27 的視角方向朝 +z（AR 會把 +z 朝著人放）：視角從方位 (360 − bearing)° 看過來 → 轉 −那麼多
  const rotY = -(((360 - VIEW_3D.bearing) % 360) * Math.PI) / 180
  const { glb, usdz, xf, box } = await buildArGlb(ballots, { usdz: true, rotY })
  // AR 預設視角＝3D 預設視角：距離照縮放換算（畫面比例 1.6 時），看的中心換成模型座標
  const lat = VIEW_3D.center[1]
  const mpp = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** VIEW_3D.zoom)
  const dist = ((0.5 * VIEW_3D.frameH) / Math.tan((36.87 / 2) * (Math.PI / 180))) * mpp * xf.k
  const [x, y] = ballots.toLocal(...VIEW_3D.center) // 場景（x 東、y 北）→ 模型（x 東、y 上、z 南）
  const meta = { box, dist: +dist.toFixed(4), target: [x * xf.k + xf.ox, xf.oy, -y * xf.k + xf.oz].map((v) => +v.toFixed(4)) }
  map.remove()
  el.remove()
  return { glb: b64(glb), usdz: b64(usdz), meta }
}
