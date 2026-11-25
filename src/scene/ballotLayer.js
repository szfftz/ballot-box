// 2026 投開票所 3D 模式：一個地點一個投票箱（three.js InstancedMesh，MapLibre 自訂圖層，跟地圖共用同一個 WebGL）
// 一個地點（同一個地址）一個投票箱：同一個地址有好幾所的也只畫一個
// 箱子是固定的實際大小（BALLOT.m 公尺寬的立方體），跟地圖一起縮放：每個箱子都一樣大
// 箱子的位置、轉向：用存好的結果（data/ballots-settled.json）直接顯示，不播掉落（使用者要的）
// 那份結果是這樣來的（開發時工具列「重新掉落」→「存下這次的結果」）：每個箱子從 BALLOT.dropM 高的地方掉下來（鄰近會疊在一起的往上錯開一層），
//   用物理引擎 Rapier 算：箱子是剛體，撞到地面或彼此會彈開、翻滾、堆起來，不會互相穿過去
//   時間是壓縮過的（8 公里實際要掉 40 秒，這裡約 1.6 秒）：重力照這個調大
//   Rapier 只在按「重新掉落」時才載入（正式網站用不到）
import * as maplibregl from 'maplibre-gl'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
let RAPIER = null // 按「重新掉落」才載入
import { groundMesh, billboard, queues, groundText, BILLBOARD, BILLBOARD2, BILLBOARD3 } from './floorDecal.js'
import QUEUE_PATH from './data/queue-path.json'

// 樣子照中選會的紙投票匭（使用者給的照片）：白色立方體紙箱，頂上灰色膠囊形投票口框、中間黑色膠囊形的口，
// 正面中選會標誌（藍色 i、紅色圈）＋灰底圓角名牌「投票匭」（字畫不出來，只畫名牌）
export const BALLOT = {
  body: '#f2f2f2', // 箱身
  plate: '#8a9099', // 投票口外框、正面名牌
  slot: '#161616', // 投票口
  blue: '#1d3f9e', // 標誌的藍色 i
  red: '#d7263d', // 標誌的紅色圈
  shadow: '#3a4250', // 地上的影子（帶一點藍的灰，比純黑柔和）
  shadowOpacity: 0.32, // 真的陰影（shadow map），邊緣柔化
  // 太陽在哪個方向（x 東、y 北、z 上）：2026-11-28 投票日上午 8:00（開始投票），台灣中心（23.7°N 120.9°E）的太陽
  //   高度 19.32°、方位 125°（東南）；影子長＝箱高 ÷ tan(高度) ≈ 2.85 倍，往西北落
  sun: [0.773, -0.5413, 0.3309],
  sunAlt: 19.32,
  sunAz: 125,
  m: 2000, // 箱寬幾公尺（立方體，固定，不隨縮放變）
  dropM: 2000, // 從幾公尺高掉下來（箱底的高度）；鄰近地點的箱子一開始會疊在一起的，往上錯開一層（一層＝箱寬的 1.2 倍）
  fallS: 1.6, // 從 8 km 掉到地面幾秒（決定重力；改 dropM 不影響重力）
  restitution: 0.3, // 彈性
  friction: 0.6, // 摩擦
}

// 圓角長方形（r＝高的一半就是膠囊形），平放在 xy 平面、厚 depth（底在 z=0）
function pill(w, h, depth, r = h / 2) {
  const x = -w / 2, y = -h / 2, sh = new THREE.Shape()
  sh.moveTo(x + r, y)
  sh.lineTo(x + w - r, y)
  sh.absarc(x + w - r, y + r, r, -Math.PI / 2, 0)
  sh.lineTo(x + w, y + h - r)
  sh.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2)
  sh.lineTo(x + r, y + h)
  sh.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI)
  sh.lineTo(x, y + r)
  sh.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5)
  return new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 3 }) // 圓角切 3 段就夠圓（1 萬多個箱子，太細會很重）
}

// 一個投票匭（單位：箱寬 1 的立方體，中心在原點，z 朝上、y 朝北；正面朝南，對著預設視角）
function boxGeometries() {
  const body = new THREE.BoxGeometry(1, 1, 1)
  // 頂上：灰色膠囊形外框，中間黑色膠囊形的口
  const plate = pill(0.5, 0.14, 0.012).translate(0, -0.05, 0.5)
  const slot = pill(0.36, 0.05, 0.016).translate(0, -0.05, 0.5)
  // 正面（y = -0.5）：標誌在中間，圓角名牌在下面
  const fy = -0.506
  const zLogo = 0.0
  const iStem = new THREE.BoxGeometry(0.045, 0.012, 0.24).translate(0, fy - 0.004, zLogo - 0.01)
  const iDot = new THREE.BoxGeometry(0.055, 0.012, 0.055).translate(0, fy - 0.004, zLogo + 0.16)
  const ring = new THREE.TorusGeometry(0.14, 0.017, 3, 16).scale(1, 0.38, 1).rotateX(Math.PI / 2).translate(0, fy - 0.002, zLogo + 0.03)
  const tag = pill(0.34, 0.1, 0.01, 0.025).rotateX(Math.PI / 2).translate(0, fy + 0.005, zLogo - 0.25)
  return [
    [body, BALLOT.body],
    [mergeGeometries([plate, tag]), BALLOT.plate],
    [slot, BALLOT.slot],
    [mergeGeometries([iStem, iDot]), BALLOT.blue],
    [ring, BALLOT.red],
  ]
}

let rapierReady = null // 載入＋RAPIER.init() 只做一次
const loadRapier = () => (rapierReady ??= import('@dimforge/rapier3d-compat').then(async (m) => {
  RAPIER = m.default
  await RAPIER.init()
}))

// 存檔格式：一個字串，每個箱子 7 個數字（x, y, z 公尺取整數；四元數 x, y, z, w 取 4 位），逗號分隔
export const encodeBoxes = (boxes) => boxes.map((b) => [Math.round(b.x), Math.round(b.y), Math.round(b.z), ...b.q.map((v) => +v.toFixed(4))].join(',')).join(';')
export const decodeBoxes = (str) => (str ? str.split(';').map((r) => {
  const a = r.split(',').map(Number)
  return { x: a[0], y: a[1], z: a[2], q: a.slice(3, 7) }
}) : [])

/**
 * sites：[{ lon, lat, id }]；saved：存好的結果（decodeBoxes 之後，跟 sites 同順序）；沒有或數量不對就直接掉一次
 * 回傳 MapLibre 自訂圖層（id: 'ballot-3d'）；layer.drop() 重新掉一次（開發用）
 * tooltip：2D 的點圖層留著、不透明度 0（滑到原本位置的點就顯示），不另外算
 */
export function ballotLayer(sites, saved = null, viewBearing = 0) {
  const origin = maplibregl.MercatorCoordinate.fromLngLat([120.9, 23.7])
  const mpu = origin.meterInMercatorCoordinateUnits() // 1 公尺幾個墨卡托單位
  const S = BALLOT.m
  // 物理世界的單位＝箱寬（1 單位 = S 公尺）；每個地點的位置（x 東、y 北）
  const pos = sites.map((s) => {
    const m = maplibregl.MercatorCoordinate.fromLngLat([s.lon, s.lat])
    return [(m.x - origin.x) / mpu / S, -(m.y - origin.y) / mpu / S]
  })
  const N = sites.length
  const H0 = BALLOT.dropM / S, G = (2 * (8000 / S)) / BALLOT.fallS ** 2 // 單位/秒²
  let map, renderer, scene, camera, meshes, world = null, bodies = [], running = false, acc = 0, last = 0, simT = 0
  const mat4 = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(S, S, S)

  function build() {
    world = new RAPIER.World({ x: 0, y: 0, z: -G })
    world.createCollider(RAPIER.ColliderDesc.cuboid(1e4, 1e4, 1).setTranslation(0, 0, -1).setFriction(BALLOT.friction)) // 地面
    bodies = pos.map(() => {
      const b = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setCanSleep(true).setCcdEnabled(false))
      world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5).setRestitution(BALLOT.restitution).setFriction(BALLOT.friction), b)
      return b
    })
  }

  // 全部放回天上：高度錯開、隨機轉一點、帶一點旋轉（掉到地上才會翻倒，不會每個都正正站著）
  function drop() {
    if (!world) return
    const r = () => Math.random() - 0.5
    // 起始高度：都從 dropM 開始；跟已經放好的箱子水平距離 < 1.5 箱寬、又在同一層的，就往上一層（網格加速）
    const layer = new Map(), cell = (x, y) => `${Math.floor(x / 1.5)},${Math.floor(y / 1.5)}`
    const lv = pos.map(([x, y]) => {
      let k = 0
      const near = []
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) near.push(...(layer.get(cell(x + dx * 1.5, y + dy * 1.5)) ?? []))
      const taken = new Set(near.filter(([nx, ny]) => Math.hypot(nx - x, ny - y) < 1.5).map((n) => n[2]))
      while (taken.has(k)) k++
      const key = cell(x, y)
      if (!layer.has(key)) layer.set(key, [])
      layer.get(key).push([x, y, k])
      return k
    })
    bodies.forEach((b, i) => {
      b.setTranslation({ x: pos[i][0], y: pos[i][1], z: H0 + 0.5 + lv[i] * 1.2 }, true)
      q.setFromEuler(new THREE.Euler(r() * 0.6, r() * 0.6, Math.random() * Math.PI * 2))
      b.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true)
      b.setLinvel({ x: 0, y: 0, z: 0 }, true)
      b.setAngvel({ x: r() * 3, y: r() * 3, z: r() * 2 }, true)
    })
    running = true
    acc = last = simT = 0
    map?.triggerRepaint()
  }

  let maxT = 8 // 物理時間最多跑幾秒（掉下來＋彈跳約 4 秒）
  const done = () => simT > maxT || bodies.every((b) => b.isSleeping())

  // 不等畫面，直接把物理算完（AR 要用掉完的樣子）：每 10 步讓出一次，畫面不會卡死
  async function finish() {
    while (!world) await new Promise((r) => setTimeout(r, 100))
    while (running && !done()) {
      for (let k = 0; k < 10; k++) {
        world.step()
        simT += 1 / 60
      }
      await new Promise((r) => setTimeout(r, 0))
    }
    running = false
    if (meshes) write()
    map?.triggerRepaint()
  }

  // 影子：真的陰影（three.js shadow map）：太陽是一盞平行光，從它的方向把所有東西（箱子、圈票處、小人）的影子算到地上
  //   地上放一片只畫影子的透明平面（ShadowMaterial），疊在遠近明暗的地面上；邊緣用 PCF 柔化
  let shadowPlane = null, ground = null, sign = null, signReady = null

  function write() {
    snapshot().forEach((b, i) => {
      mat4.compose(v.set(b.x, b.y, b.z), q.fromArray(b.q), sc)
      for (const m of meshes) m.setMatrixAt(i, mat4)
    })
    for (const m of meshes) {
      m.instanceMatrix.needsUpdate = true
      m.count = N
    }
  }
  const hasSaved = saved?.length === N

  // 每個箱子現在的位置（公尺，x 東、y 北、z 上；箱子中心）和轉向（四元數）：物理引擎有跑就讀它的，沒有就是存好的
  function snapshot() {
    if (!world) return saved
    return bodies.map((b) => {
      const t = b.translation(), r = b.rotation()
      return { x: t.x * S, y: t.y * S, z: t.z * S, q: [r.x, r.y, r.z, r.w] }
    })
  }

  // 從存好的樣子接著算（開發用）：懸在半空的箱子掉下來、全部停下來為止（最多 40 秒物理時間），其他箱子幾乎不動
  async function settleSaved() {
    await loadRapier()
    if (!meshes) return
    const from = snapshot() // 先記下現在的樣子（建好物理世界之後 snapshot 會改讀物理引擎）
    if (!world) build()
    from.forEach((b, i) => {
      bodies[i].setTranslation({ x: b.x / S, y: b.y / S, z: b.z / S }, true)
      bodies[i].setRotation({ x: b.q[0], y: b.q[1], z: b.q[2], w: b.q[3] }, true)
      bodies[i].setLinvel({ x: 0, y: 0, z: 0 }, true)
      bodies[i].setAngvel({ x: 0, y: 0, z: 0 }, true)
    })
    maxT = 40
    running = true
    acc = last = simT = 0
    await finish()
    maxT = 8
  }

  // 重新掉一次：第一次按才載入物理引擎
  async function redrop() {
    await loadRapier()
    if (!meshes) return
    if (!world) build()
    drop()
  }

  const layer = {
    id: 'ballot-3d',
    type: 'custom',
    renderingMode: '3d',
    onAdd(m, gl) {
      map = m
      camera = new THREE.Camera()
      scene = new THREE.Scene()
      scene.add(new THREE.HemisphereLight('#ffffff', '#5a5a66', 1.6))
      const sun = new THREE.DirectionalLight('#ffffff', 1.6)
      // 投票日上午 8 點的太陽（東南方）：光源放在太陽方向 1,000 km 外，照向台灣中間；影子相機蓋住全台加三排圈票處
      sun.position.set(...BALLOT.sun.map((v) => v * 1e6))
      sun.target.position.set(-60000, 60000, 0)
      scene.add(sun, sun.target)
      sun.castShadow = true
      Object.assign(sun.shadow.camera, { left: -520000, right: 520000, top: 520000, bottom: -520000, near: 1000, far: 2.5e6 })
      sun.shadow.mapSize.set(8192, 8192)
      sun.shadow.bias = -0.0004
      sun.shadow.normalBias = 300
      sun.shadow.radius = 3
      meshes = boxGeometries().map(([geo, c]) => {
        const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: c }), N)
        mesh.frustumCulled = false
        mesh.count = 0 // 位置算好之前先不畫
        mesh.castShadow = true
        scene.add(mesh)
        return mesh
      })
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true })
      renderer.autoClear = false
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFSoftShadowMap
      // 地面（遠近明暗）
      const c0 = maplibregl.MercatorCoordinate.fromLngLat([120.9, 23.7])
      ground = groundMesh((c0.x - origin.x) / mpu, -(c0.y - origin.y) / mpu)
      ground.userData.noExport = true // AR 不放地面
      scene.add(ground)
      shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(3e6, 3e6), new THREE.ShadowMaterial({ color: BALLOT.shadow, opacity: BALLOT.shadowOpacity, depthWrite: false }))
      shadowPlane.position.set(0, 0, 3)
      shadowPlane.userData.noExport = true // AR 不放（model-viewer 自己畫影子）
      shadowPlane.receiveShadow = true
      shadowPlane.renderOrder = -2
      scene.add(shadowPlane)
      
      const loc = ([lon, lat]) => {
        const c = maplibregl.MercatorCoordinate.fromLngLat([lon, lat])
        return [(c.x - origin.x) / mpu, -(c.y - origin.y) / mpu]
      }
      // 三排圈票處：中華民國（澎湖北邊）、地方公職人員選舉（綠島東北）、圈選章＋2026（澎湖西南）
      for (const { lonlat: ll, chars } of [BILLBOARD, BILLBOARD2, BILLBOARD3]) billboard(loc(ll), chars).then(({ group, parts }) => {
        if (!meshes) return
        for (const part of parts) part.castShadow = true
        scene.add(group)
        renderer.shadowMap.needsUpdate = true
        map.triggerRepaint()
      })
      // 排隊：繞台灣外圍一圈，分成三段，各接到一個圈票區（隊頭在圈票處正面＝東邊）
      // 圈票處都朝東：西邊兩排的正面對著台灣（外圍那圈在正面）；地方公職人員選舉在台灣東邊，正面背對外圍那圈，
      // 所以它的隊伍從正面的隊頭往南、繞過南端再接到外圍（via），隊伍才會排在布簾前面
      const rows = [BILLBOARD, BILLBOARD2, BILLBOARD3].map(({ lonlat, chars }, k) => {
        const [cx, cy] = loc(lonlat), half = (chars.length * (BILLBOARD.w + BILLBOARD.gap)) / 2, fx = cx + BILLBOARD.d / 2 + 6000
        // 地方公職人員選舉：從正面往南，穿過綠島（121.49°E 22.66°N）和蘭嶼（121.55°E 22.05°N）中間
        const via = k === 1 ? [[fx, cy - half - 9000], loc([122.35, 22.95]), loc([121.9, 22.55]), loc([121.52, 22.36]), loc([121.3, 22.28])]
          : undefined // 中華民國：回到原來的樣子（沿外圍那圈排到東北外海）
        // 排到哪裡為止（預設視角下）：中華民國排到畫面右邊（東北外海）、地方公職人員選舉排到左下（台灣南端外海）
        // 2026 那條也排到同一個地方（從西邊繞過來），兩條在台灣南端外海碰頭、接成一條
        // 2026：排到左邊那張 IG 框的紅線內框右緣就停（預設視角下，不跨到中間的留白）
        // 中華民國：排到右邊那張 IG 框的紅線內框右緣就停
        const until = k === 0 ? loc([121.2299, 25.8692]) : k === 2 ? loc([119.4327, 24.2076]) : undefined
        return { head: [fx, cy], box: [cx - BILLBOARD.d / 2, cy - half, cx + BILLBOARD.d / 2, cy + half], via, until, own: k === 1, dropTail: 0, out: k === 0 ? 25000 : 0 } // 中華民國那段往外推 25 km（不要離台灣太近） // 地方公職人員選舉最後 10 個不放
      })
      const Q = queues(QUEUE_PATH[0].map(loc), rows, hasSaved ? saved : []) // 避開投票箱
      // 告示牌「LINING UP / FOR DEMOCRACY」：右下角，斜 30° 的板子架在書架上
      signReady = groundText((lon, lat) => loc([lon, lat])).then(({ group, parts }) => {
        if (!meshes) return
        sign = group
        for (const m of parts) m.castShadow = true
        scene.add(group)
        renderer.shadowMap.needsUpdate = true
        map.triggerRepaint()
      })
      for (const mesh of Q.meshes) {
        mesh.castShadow = true
        mesh.frustumCulled = false
        scene.add(mesh)
      }
      renderer.shadowMap.needsUpdate = true
      if (hasSaved) write()
      else redrop() // 沒有存好的結果：掉一次
    },
    render(_gl, args) {
      if (running && world) {
        // 固定步長 1/60 秒；一個畫格最多補 2 步（太慢就讓動畫變慢，不卡住）
        const now = performance.now()
        acc += last ? Math.min(0.05, (now - last) / 1000) : 1 / 60
        last = now
        for (let k = 0; k < 2 && acc >= 1 / 60; k++, acc -= 1 / 60) {
          world.step()
          simT += 1 / 60
        }
        write()
        // 全部睡著（停下來）或跑超過 MAX_T 秒就停
        if (done()) running = false
        else map.triggerRepaint()
      }
      const M = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix)
      const T = new THREE.Matrix4().makeTranslation(origin.x, origin.y, 0).scale(new THREE.Vector3(mpu, -mpu, mpu))
      camera.projectionMatrix = M.multiply(T)
      renderer.resetState()
      // 畫布大小會變（視窗縮放、匯出 PDF 時解析度調成 2 倍）：照現在的畫布設 viewport，不然 three.js 還用舊的大小，只畫在左下角
      const bw = _gl.drawingBufferWidth, bh = _gl.drawingBufferHeight
      renderer.setViewport(0, 0, bw, bh)
      if (ground) ground.material.uniforms.res.value.set(bw, bh)
      renderer.render(scene, camera)
    },
    onRemove() {
      for (const m of [...(meshes ?? []), shadowPlane].filter(Boolean)) {
        m.geometry.dispose()
        m.material.dispose()
      }
      renderer?.dispose()
      world?.free()
      world = null
      meshes = null
    },
    drop: redrop, // 重新掉一次（開發用）
    settleSaved, // 從存好的樣子接著算到全部停下來（開發用）
    settled: () => !running && (hasSaved || !!world), // 掉完了沒
    finish: async () => { if (world || !hasSaved) await finish() }, // 直接算完（有存好的就不用算）
    // 經緯度 → 這個圖層的公尺座標（x 東、y 北）
    toLocal: (lon, lat) => {
      const c = maplibregl.MercatorCoordinate.fromLngLat([lon, lat])
      return [(c.x - origin.x) / mpu, -(c.y - origin.y) / mpu]
    },
    snapshot, // 每個箱子現在的位置、轉向（存檔用）
    get signReady() { return signReady }, // 告示牌做好了（Promise）
    // 告示牌移到這個經緯度（對齊 IG 紅線內框用）
    moveSign([lon, lat]) {
      const c = maplibregl.MercatorCoordinate.fromLngLat([lon, lat])
      sign.position.set((c.x - origin.x) / mpu, -(c.y - origin.y) / mpu, 0)
      sign.updateMatrixWorld(true)
      renderer.shadowMap.needsUpdate = true
      map.triggerRepaint()
    },
    // 告示牌在畫面上的範圍（px，地圖容器座標）：開發時把它對齊 IG 紅線內框用
    signBox() {
      if (!sign) return null
      const v = new THREE.Vector3(), cv = map.getCanvas(), W = cv.clientWidth, H = cv.clientHeight
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      sign.updateMatrixWorld(true)
      sign.traverse((o) => {
        if (!o.isMesh) return
        const pos = o.geometry.attributes.position
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).applyMatrix4(camera.projectionMatrix)
          const px = ((v.x + 1) / 2) * W, py = ((1 - v.y) / 2) * H
          x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py)
        }
      })
      return { x0, y0, x1, y1 }
    },
    get scene() { return scene }, // AR 模型照這個場景做（arModel.js）
    // AR 不放的投票箱細節（標誌、名牌：一個箱子幾百個三角形，1 萬多個箱子手機跑不動）；留箱身、投票口
    get arHide() { return meshes ? meshes.slice(1) : [] }, // AR：投票口、名牌、標誌改成貼圖（arExtras），立體的不放（1 萬多個箱子會太重）
    // AR 用的投票口：一片薄薄的黑色長方形（每個箱子 12 個三角形），位置、轉向跟 3D 的投票箱一樣
    // AR 用：投票箱正面（標誌＋名牌）、頂面（投票口）畫成貼圖，各一片薄板，位置、轉向跟 3D 的投票箱一樣；看起來跟 3D 一樣，但每個箱子只多 4 個三角形
    arExtras() {
      const tex = (draw) => {
        const c = document.createElement('canvas')
        c.width = c.height = 256
        const g = c.getContext('2d')
        g.fillStyle = BALLOT.body
        g.fillRect(0, 0, 256, 256)
        draw(g)
        const t = new THREE.CanvasTexture(c)
        t.colorSpace = THREE.SRGBColorSpace
        return t
      }
      const pill = (g, cx, cy, w, h, r) => {
        g.beginPath()
        g.roundRect(cx - w / 2, cy - h / 2, w, h, r)
        g.fill()
      }
      const P = 256 // 箱寬 1 ＝ 256 px；貼圖的 y 往下＝箱子往下（正面）、往前（頂面）
      // 正面：標誌（藍色 i、紅色橢圓圈）在中間，圓角名牌在下面（跟 boxGeometries 一樣的位置）
      const front = tex((g) => {
        const cy = P / 2
        g.strokeStyle = BALLOT.red
        g.lineWidth = 0.034 * P
        g.beginPath()
        g.ellipse(P / 2, cy - 0.03 * P, 0.14 * P, 0.14 * P * 0.38 * 2.6, 0, 0, Math.PI * 2)
        g.stroke()
        g.fillStyle = BALLOT.blue
        g.fillRect(P / 2 - 0.0225 * P, cy - 0.11 * P, 0.045 * P, 0.24 * P)
        g.fillRect(P / 2 - 0.0275 * P, cy - 0.19 * P, 0.055 * P, 0.055 * P)
        g.fillStyle = BALLOT.plate
        pill(g, P / 2, cy + 0.25 * P, 0.34 * P, 0.1 * P, 0.025 * P)
      })
      // 頂面：灰色膠囊形外框＋黑色膠囊形投票口（往前偏 0.05）
      const top = tex((g) => {
        g.fillStyle = BALLOT.plate
        pill(g, P / 2, P / 2 + 0.05 * P, 0.5 * P, 0.14 * P, 0.07 * P)
        g.fillStyle = BALLOT.slot
        pill(g, P / 2, P / 2 + 0.05 * P, 0.36 * P, 0.05 * P, 0.025 * P)
      })
      const mk = (geo, map) => {
        const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ map }), N)
        for (let i = 0; i < N; i++) {
          meshes[0].getMatrixAt(i, mat4)
          im.setMatrixAt(i, mat4)
        }
        return im
      }
      return [
        mk(new THREE.PlaneGeometry(1, 1).rotateX(Math.PI / 2).translate(0, -0.503, 0), front), // 正面（−y）
        mk(new THREE.PlaneGeometry(1, 1).translate(0, 0, 0.503), top), // 頂面（+z）
      ]
    },
  }
  return layer
}

// 開發時改了這個檔：整頁重新載入（3D 場景只在打開頁面時建一次，熱更新不會重建，畫面會停在舊的）
if (import.meta.hot) import.meta.hot.decline()
