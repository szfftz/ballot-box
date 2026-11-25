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
  // 最長邊 2048 px（含邊界）：手機 GPU 的貼圖上限多半是 4096，超過 Android Scene Viewer 整個模型都不顯示；桌上 1 公尺約 0.5 公釐一格，夠細
  const S = 2044, x0 = box.min.x, y1 = box.max.y, k = S / Math.max(box.max.x - x0, y1 - box.min.y)
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
    const glb = await new GLTFExporter().parseAsync(model, { binary: true })
    // usdz：iPhone AR Quick Look 用（同一個模型；scripts/export-ar.mjs 存成靜態檔）
    const usdz = opts.usdz ? fixUsdz(await new USDZExporter().parseAsync(model)) : null
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
