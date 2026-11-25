// 2026 投開票所的 AR 模型：直接拿 3D 畫面的場景（ballotLayer 的 three.js scene）做，跟 3D 一樣：
//   掉完的投票箱、三排圈票處（布簾、字）、排隊的小人、地上的字；不放地面
//   影子：model-viewer 只有正上方的柔光影，沒有太陽方向，所以把 3D 的影子（11/28 早上 8 點的太陽）做成模型的一部分：
//   每樣東西沿著太陽光方向壓扁到地上，畫進一張圖（重疊不會更黑），整張平貼在地上，半透明的灰（跟 3D 同色、同不透明度）
//   投票箱只留箱身和投票口（投票口改成薄薄的長方形；標誌、名牌一個箱子幾百個三角形，1 萬多個箱子手機跑不動）
// 用共用的 src/lib/arExport.js 攤平成 glb（同材質合併）；場景是 z 朝上，先轉成 glTF 的 y 朝上
// iPhone 的 usdz 也一起做（buildArGlb(layer, { usdz: true })），scripts/export-ar.mjs 存成 public/model/ 的靜態檔
import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { USDZExporter } from 'three/addons/exporters/USDZExporter.js'
import { buildArModel, fixUsdz } from '../lib/arExport.js'
import { BALLOT } from './ballotLayer.js'

export const AR = {
  sizeM: 1, // 模型最長邊（公尺）：台灣加外圍排隊約 500 公里 → 地上 1 公尺（1 : 50 萬；2 公里的箱子約 4 公釐）
}

// 把東西沿著太陽光壓到地面（z = 3 m）的矩陣
function flatMatrix() {
  const [sx, sy, sz] = BALLOT.sun, kx = sx / sz, ky = sy / sz, h = 3
  return new THREE.Matrix4().set(1, 0, -kx, kx * h, 0, 1, -ky, ky * h, 0, 0, 0, h, 0, 0, 0, 1)
}

// 場景裡會投影子的東西 → 一整片影子（畫在一張圖上再平貼在地上）：
//   每個三角形沿著太陽光壓到地上，用不透明的顏色畫進 canvas（重疊的地方不會越疊越黑，跟 3D 的陰影一樣），
//   最後整張圖用 BALLOT.shadowOpacity 的透明度平貼在地上
function shadowSheet(scene, skip) {
  const flat = flatMatrix(), tmp = new THREE.Matrix4(), m = new THREE.Matrix4(), v = new THREE.Vector3()
  scene.updateMatrixWorld(true)
  // 先量範圍：所有會投影子的網格的包圍盒（壓到地上之後）
  const meshes = []
  scene.traverse((o) => {
    if (o.isMesh && o.castShadow && !o.userData.noExport && o.visible && !skip.has(o)) meshes.push(o)
  })
  const box = new THREE.Box3(), bb = new THREE.Box3()
  const eachMatrix = (o, f) => {
    if (o.isInstancedMesh) for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, tmp); f(tmp.premultiply(o.matrixWorld)) }
    else f(o.matrixWorld)
  }
  for (const o of meshes) {
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
    eachMatrix(o, (mw) => box.union(bb.copy(o.geometry.boundingBox).applyMatrix4(m.multiplyMatrices(flat, mw))))
  }
  // 跟 Day 27 一樣細（4096）；含兩邊各 1 px 的邊界最長邊剛好 4096：手機 GPU 的貼圖上限多半是 4096，超過 Android Scene Viewer 整個模型都不顯示
  const S = 4094, x0 = box.min.x, y1 = box.max.y, k = S / Math.max(box.max.x - x0, y1 - box.min.y)
  const W = Math.ceil((box.max.x - x0) * k) + 2, H = Math.ceil((y1 - box.min.y) * k) + 2
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  g.fillStyle = BALLOT.shadow
  // 一個網格一個網格畫：三角形壓到地上，畫成不透明的顏色（每 4,000 個三角形填一次，路徑不要太大）；背對太陽的三角形跳過（被正面蓋住）
  const sun = new THREE.Vector3(...BALLOT.sun).normalize(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nrm = new THREE.Vector3(), nm = new THREE.Matrix3()
  let count = 0
  for (const o of meshes) {
    const pos = o.geometry.attributes.position, idx = o.geometry.index, n = idx ? idx.count : pos.count
    const wp = new Float32Array(pos.count * 3), xy = new Float32Array(pos.count * 2)
    eachMatrix(o, (mw) => {
      m.multiplyMatrices(flat, mw)
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mw)
        wp[i * 3] = v.x; wp[i * 3 + 1] = v.y; wp[i * 3 + 2] = v.z
        v.fromBufferAttribute(pos, i).applyMatrix4(m)
        xy[i * 2] = (v.x - x0) * k + 1
        xy[i * 2 + 1] = (y1 - v.y) * k + 1
      }
      g.beginPath()
      for (let t = 0; t < n; t += 3) {
        const a = idx ? idx.getX(t) : t, b = idx ? idx.getX(t + 1) : t + 1, cc = idx ? idx.getX(t + 2) : t + 2
        e1.set(wp[b * 3] - wp[a * 3], wp[b * 3 + 1] - wp[a * 3 + 1], wp[b * 3 + 2] - wp[a * 3 + 2])
        e2.set(wp[cc * 3] - wp[a * 3], wp[cc * 3 + 1] - wp[a * 3 + 1], wp[cc * 3 + 2] - wp[a * 3 + 2])
        if (nrm.crossVectors(e1, e2).dot(sun) < 0 && !o.material.side) continue
        g.moveTo(xy[a * 2], xy[a * 2 + 1])
        g.lineTo(xy[b * 2], xy[b * 2 + 1])
        g.lineTo(xy[cc * 2], xy[cc * 2 + 1])
        if (++count % 4000 === 0) { g.fill(); g.beginPath() }
      }
      g.fill()
    })
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.userData.arFull = true // 不要縮成 512（影子邊緣才不會鋸齒）
  const w = W / k, h = H / k
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: BALLOT.shadowOpacity, depthWrite: false }))
  plane.position.set(x0 - 1 / k + w / 2, y1 + 1 / k - h / 2, 3)
  return plane
}

// 3D 的打光烘進頂點顏色：跟 ballotLayer.js 一樣的半球光（天 #ffffff、地 #5a5a66、1.6）＋太陽平行光（1.6，投票日上午 8 點）
//   three.js 的 Lambert：顏色 ×（半球光 ＋ 太陽 × max(0, 法線·太陽)）÷ π；材質改成不受光（glTF 的 KHR_materials_unlit），
//   model-viewer 就照 3D 的明暗畫（箱子朝太陽的面亮、背光的面暗），不會被它自己的環境光打平
// 模型座標 y 朝上（場景 z 朝上轉過來：場景 (x, y, z) → 模型 (x, z, −y)）
const SKY = new THREE.Color('#ffffff'), GROUND = new THREE.Color('#5a5a66'), LIGHT = 1.6 / Math.PI
const SUN = new THREE.Vector3(BALLOT.sun[0], BALLOT.sun[2], -BALLOT.sun[1]).normalize()
// 太陽方向的深度圖（軟體光柵化，跟 3D 的 shadow map 一樣的意思）：從太陽看過去，每一格記最靠近太陽的深度
//   之後每個頂點查它那一格：前面有東西擋（深度比它靠近太陽）就在影子裡，太陽光不算；3×3 格平均，邊緣柔一點（3D 是 PCF 柔化）
const SM = 4096 // 深度圖解析度：桌上 1 公尺 → 一格約 0.3 公釐（箱子 4 公釐）
function sunDepth(meshes) {
  const w = SUN.clone(), u = new THREE.Vector3(0, 1, 0).cross(w).normalize(), v = w.clone().cross(u)
  const proj = (p) => [p.dot(u), p.dot(v), p.dot(w)]
  const p = new THREE.Vector3()
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  const all = meshes.map((o) => {
    const pos = o.geometry.attributes.position, N = pos.count, a = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) {
      const [x, y, z] = proj(p.fromBufferAttribute(pos, i))
      a[i * 3] = x; a[i * 3 + 1] = y; a[i * 3 + 2] = z
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
    }
    return a
  })
  const k = (SM - 2) / Math.max(x1 - x0, y1 - y0), W = Math.ceil((x1 - x0) * k) + 2, H = Math.ceil((y1 - y0) * k) + 2
  const depth = new Float32Array(W * H).fill(-Infinity)
  const gx = (x) => (x - x0) * k + 0.5, gy = (y) => (y - y0) * k + 0.5
  meshes.forEach((o, mi) => {
    const a = all[mi], idx = o.geometry.index, T = idx ? idx.count : a.length / 3
    for (let t = 0; t < T; t += 3) {
      const i0 = idx ? idx.getX(t) : t, i1 = idx ? idx.getX(t + 1) : t + 1, i2 = idx ? idx.getX(t + 2) : t + 2
      const ax = gx(a[i0 * 3]), ay = gy(a[i0 * 3 + 1]), az = a[i0 * 3 + 2]
      const bx = gx(a[i1 * 3]), by = gy(a[i1 * 3 + 1]), bz = a[i1 * 3 + 2]
      const cx = gx(a[i2 * 3]), cy = gy(a[i2 * 3 + 1]), cz = a[i2 * 3 + 2]
      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
      if (Math.abs(area) < 1e-9) continue
      const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx))), maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)))
      const minY = Math.max(0, Math.floor(Math.min(ay, by, cy))), maxY = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)))
      for (let yy = minY; yy <= maxY; yy++) for (let xx = minX; xx <= maxX; xx++) {
        const px = xx + 0.5, py = yy + 0.5
        const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area
        const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area
        const w2 = 1 - w0 - w1
        if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue
        const z = w0 * az + w1 * bz + w2 * cz, j = yy * W + xx
        if (z > depth[j]) depth[j] = z
      }
    }
  })
  // 這個點照得到太陽的比例（0–1）：3×3 格裡沒被擋的有幾格；bias：往太陽推一點，自己的面不會擋到自己
  const bias = 2.5 / k
  return (q) => {
    const [x, y, z] = proj(q)
    const cx = Math.floor(gx(x)), cy = Math.floor(gy(y))
    let lit = 0
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = Math.min(W - 1, Math.max(0, cx + dx)), yy = Math.min(H - 1, Math.max(0, cy + dy))
      if (z + bias >= depth[yy * W + xx]) lit++
    }
    return lit / 9
  }
}

function bakeLight(model) {
  const n = new THREE.Vector3(), c = new THREE.Color(), q = new THREE.Vector3()
  const lit = []
  model.traverse((o) => { if (o.isMesh && !o.material.map?.userData?.arFull) lit.push(o) })
  const sunLit = sunDepth(lit) // 會擋太陽的：除了地上那片影子，全部
  model.traverse((o) => {
    if (!o.isMesh) return
    const m = o.material
    if (m.map?.userData?.arFull) return // 地上的影子：本來就不受光
    const g = o.geometry, nrm = g.attributes.normal, N = g.attributes.position.count
    const old = m.vertexColors ? g.attributes.color : null
    const col = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) {
      n.fromBufferAttribute(nrm, i).normalize()
      // 雙面的（圈票處的布簾）：three.js 畫背面時把法線反過來打光，看得到的那面（寫字的正面）朝太陽，用朝太陽的那面算
      if (m.side === THREE.DoubleSide && n.dot(SUN) < 0) n.negate()
      const d = n.dot(SUN)
      // 頂點沿法線往外推一點點再查（自己的面、箱子的角落不會誤判成擋住）
      const sun = d > 0 ? d * LIGHT * sunLit(q.fromBufferAttribute(g.attributes.position, i).addScaledVector(n, 0.0002)) : 0
      c.copy(GROUND).lerp(SKY, 0.5 * n.y + 0.5).multiplyScalar(LIGHT).addScalar(sun)
      if (old) c.multiply({ r: old.getX(i), g: old.getY(i), b: old.getZ(i) })
      col.set([c.r, c.g, c.b], i * 3)
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    o.material = new THREE.MeshBasicMaterial({ name: m.name, color: m.color, map: m.map, transparent: m.transparent, opacity: m.opacity, side: m.side, vertexColors: true })
  })
}

/** layer：ballotLayer()；回傳 { blob（.glb）, xf（場景 → 模型的換算：k、ox、oy、oz） } */
export async function buildArGlb(layer, opts = {}) {
  const scene = layer.scene
  const hidden = layer.arHide.filter((m) => !m.userData.noExport)
  for (const m of hidden) m.userData.noExport = true
  const extras = layer.arExtras()
  scene.add(...extras)
  const shadows = [shadowSheet(scene, new Set(layer.arHide))]
  scene.add(...shadows)
  const rot = scene.rotation.x
  scene.rotation.x = -Math.PI / 2 // z 朝上 → y 朝上
  try {
    const { model, xf } = buildArModel(scene, { size: AR.sizeM, minR: 0 })
    // 縮放（1 : 50 萬）、位移直接烘進頂點，節點都不帶變換：USDZExporter 讀 matrixWorld（沒更新就是單位矩陣，
    //   iPhone 的模型會變成實際大小 500 公里，AR 打開什麼都看不到）；glb 也直接是公尺，Scene Viewer 不用自己算縮放
    model.updateMatrixWorld(true)
    model.traverse((o) => { if (o.isMesh) o.geometry.applyMatrix4(o.matrixWorld) })
    model.traverse((o) => { o.position.set(0, 0, 0); o.quaternion.identity(); o.scale.set(1, 1, 1) })
    model.updateMatrixWorld(true)
    // usdz：iPhone AR Quick Look 用（scripts/export-ar.mjs 存成靜態檔）；USDZ 只吃 MeshStandardMaterial，
    //   所以在烘光之前做（Quick Look 用真實環境的光打，不用烘）
    const usdz = opts.usdz ? fixUsdz(await new USDZExporter().parseAsync(model)) : null
    bakeLight(model)
    const glb = await new GLTFExporter().parseAsync(model, { binary: true })
    return { blob: new Blob([glb], { type: 'model/gltf-binary' }), glb, usdz, xf }
  } finally {
    scene.rotation.x = rot
    scene.updateMatrixWorld(true)
    for (const m of hidden) delete m.userData.noExport
    scene.remove(...extras, ...shadows)
  }
}

// 開發時改了這個檔：整頁重新載入（3D 場景只在打開頁面時建一次，熱更新不會重建，畫面會停在舊的）
if (import.meta.hot) import.meta.hot.decline()
