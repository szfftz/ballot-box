// Day 27 的地面與小牌子
//   FLOOR：看板上的字、圈選章的顏色（畫在廣告看板 BILLBOARD 的正面；圈選章是台灣選票用的紅色印章，照使用者給的圖：圓圈＋一豎＋左下一撇）
//   GROUND：地面的遠近明暗
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export const FLOOR = {
  ink: '#161616', // 看板上的字
  stamp: '#ee1f26', // 圈選章（照使用者給的圖）
  paper: '#f2f2f2', // 牌子底色
  font: 'Overpass', // 數字一律 Overpass
  weight: 900,
}

// ── 地面：遠近明暗變化（近的亮、遠的暗，四周再暗一點，像攝影棚的打光）──
// 照畫面上的位置算（畫面下方＝近、上方＝遠），不管怎麼縮放、旋轉都是同樣的感覺
export const GROUND = {
  near: '#f0efeb', // 畫面最下面（近）
  far: '#bcc0c5', // 地平線（遠）：跟天空的地平線同色，接起來看不出邊
  sky: '#c3c6cb', // 天空（地平線往上稍微亮一點，像攝影棚的無縫背景）
  vignette: 0.22, // 四周暗角的強度
  sizeM: 20000000, // 地面多大（邊長，公尺）：要大到看得到地平線都還是地面
}

// 整片地面（中心 (x, y)，平貼在 z = 1 m）；不做深度測試、最先畫，後面的影子、箱子都蓋在上面
// 回傳 mesh；每次畫之前要更新 mesh.material.uniforms.res（畫面 px 大小）
export function groundMesh(x, y) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { near: { value: new THREE.Color(GROUND.near) }, far: { value: new THREE.Color(GROUND.far) }, vig: { value: GROUND.vignette }, res: { value: new THREE.Vector2(1, 1) } },
    vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform vec3 near; uniform vec3 far; uniform float vig; uniform vec2 res;
      void main() {
        vec2 uv = gl_FragCoord.xy / res;
        vec3 c = mix(near, far, smoothstep(0.05, 0.8, uv.y)); // 畫面 80% 高以上就是地平線的顏色，跟天空接起來
        vec2 d = (uv - vec2(0.5, 0.42)) * vec2(1.3, 1.0);
        c *= 1.0 - vig * smoothstep(0.25, 0.85, length(d)) * (1.0 - smoothstep(0.55, 0.8, uv.y)); // 暗角只在下半部，上面接天空的地方不暗
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
    depthTest: false,
    depthWrite: false,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(GROUND.sizeM, GROUND.sizeM), mat)
  mesh.position.set(x, y, 1)
  mesh.renderOrder = -3
  mesh.frustumCulled = false
  return mesh
}

// ── 圈票處：「中、華、民、國」一個字一個圈票處，順著經線排成南北一排，正面朝東對著台灣（從正面看由南往北讀）──
// 照投開票所的圈票處做（使用者給的照片）：細金屬腳＋橫桿、兩側和背面灰色毛氈板、正面一片有皺褶的白布簾，字用藍色寫在布上
export const BILLBOARD = {
  lonlat: [119.75, 24.9], // 一排的中間（腳的地面）：新竹外海、再往西北
  faceAz: 90, // 正面（布簾）朝哪個方位（度，北 0、順時針）：90＝朝東（對著台灣），整排就順著經線（南北）
  chars: [...'中華民國'], // 一個圈票處一個字；從正面看由左到右
  w: 10000, d: 7000, // 一個圈票處的寬、深（公尺）
  h0: 5000, h1: 15000, // 布簾、毛氈板從多高到多高（下面露出腳）
  gap: 1500, // 兩個之間空多少
  legW: 260, // 金屬腳、橫桿粗
  fold: 220, // 布簾皺褶的深度
  folds: 9, // 布簾有幾道皺褶
  cloth: '#f2f2f2', // 白布簾
  text: '#2f8fdc', // 布上的藍字（照片的藍）
  felt: '#8f949b', // 兩側、背面的灰毛氈板
  metal: '#c7cbd0', // 金屬腳、橫桿
}

// 第二排：「地方公職人員選舉」，綠島東北的海上，一樣順著經線、正面朝東、由南往北讀
export const BILLBOARD2 = {
  lonlat: [122.739, 23.5893], // 照預設畫面往右（右下的空地）移 // 一排的中間：綠島（121.49°E 22.66°N）東北、台東外海（照預設畫面調過位置）
  chars: [...'地方公職人員選舉'],
}
// 第三排：「2026」，澎湖（119.57°E 23.57°N）西南的海上，一樣順著經線、正面朝東、由南往北讀
export const BILLBOARD3 = {
  lonlat: [118.95, 22.45], // 一排的中間：澎湖西南、再往南（整排南北約 59 km）
  chars: ['stamp', ...'2026'], // stamp＝圈選章，放在 2026 前面
}
// 字的顏色（圈票處、右下告示牌共用）：藍、綠、粉、橘、黃、天藍隨機，跟排隊小人的衣服同一組顏色
export const INKS = ['#8fb3ff', '#7bd88f', '#ff8fab', '#ff9f68', '#ffd166', '#6ec6ff']
const ORANGE = '#ff9f68', ORANGE_CHARS = new Set([...'PUMA']) // 右下告示牌：P、U、M、A 一律橘色，其他字不用橘色（使用者指定）
let inkSeed = 2026, inkLast = -1, signSeed = 4242 // 右下告示牌用自己的亂數（使用者要重新隨機一次）
// 這個字的顏色：隨機（固定的亂數，每次打開都一樣；隔壁兩個不同色）；puma：右下告示牌的規則（PUMA 橘色、其他不用橘色）
export function nextInk(ch = '', puma = false) {
  if (puma && ORANGE_CHARS.has(ch.toUpperCase())) return ORANGE
  const pool = puma ? INKS.filter((c) => c !== ORANGE) : INKS
  let k
  const r = () => (puma ? (signSeed = (signSeed * 16807) % 2147483647) : (inkSeed = (inkSeed * 16807) % 2147483647)) / 2147483647
  do k = Math.floor(r() * pool.length)
  while (k === inkLast)
  inkLast = k
  return pool[k]
}
const CJK_FONT = 'Noto Sans TC' // 中文一律 Noto（index.html 載入）；數字 Overpass
const isCjk = (ch) => /[\u3400-\u9fff]/.test(ch)

// 布簾的貼圖：白布，中間一個字（數字 Overpass 900、中文 Noto Sans TC 900、藍；圈選章紅色），四周留白
async function charTexture(ch, ink = BILLBOARD.text) {
  const font = isCjk(ch) ? CJK_FONT : FLOOR.font
  try { await document.fonts.load(`${FLOOR.weight} 400px "${font}"`, ch) } catch {}
  const S = 512
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')
  g.fillStyle = BILLBOARD.cloth
  g.fillRect(0, 0, S, S)
  // 布紋：很淡的直、橫細線（像照片裡薄薄的白布）
  g.globalAlpha = 0.05
  g.fillStyle = '#9aa3ad'
  for (let x = 0; x < S; x += 3) g.fillRect(x, 0, 1, S)
  for (let y = 0; y < S; y += 3) g.fillRect(0, y, S, 1)
  g.globalAlpha = 1
  const D = S * 0.62 // 字高＝圈選章直徑
  if (ch === 'stamp') {
    // 圈選章（照原圖 1932 px 見方：圈線粗 140、豎線寬 150、撇寬 150）
    g.save()
    g.translate((S - D) / 2, (S - D) / 2)
    g.scale(D / 1932, D / 1932)
    g.fillStyle = g.strokeStyle = FLOOR.stamp
    g.lineWidth = 140
    g.beginPath()
    g.arc(966, 966, 896, 0, Math.PI * 2)
    g.stroke()
    g.fillRect(890, 60, 150, 1812)
    g.lineWidth = 150
    g.beginPath()
    g.moveTo(965, 1000)
    g.lineTo(320, 1645)
    g.stroke()
    g.restore()
  } else {
    g.font = `${FLOOR.weight} 100px "${font}"`
    const m = g.measureText(ch)
    const kH = (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) / 100, size = D / kH
    g.font = `${FLOOR.weight} ${size}px "${font}"`
    const mm = g.measureText(ch), w = mm.actualBoundingBoxLeft + mm.actualBoundingBoxRight
    g.fillStyle = ink
    g.fillText(ch, (S - w) / 2 + mm.actualBoundingBoxLeft, (S + D) / 2 - mm.actualBoundingBoxDescent)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

// ── 排隊投票的小人：大頭、圓身體、短短的手腳，每個圈票處前面排一列（往布簾外面排），衣服顏色隨機 ──
export const VOTER = {
  h: 12500, // 一個小人多高（公尺）：跟圈票處同比例（圈票處布簾頂 15 km ≈ 真的 2 m → 1 m ≈ 7.6 km，人 1.65 m ≈ 12.5 km）
  spacing: 8000, // 排隊前後間隔（約真的 1 公尺）
  sAmp: 8000, // 隊伍蛇行的左右擺幅
  sWave: 36000, // 蛇行一個來回多長
  gapEnd: 70000, // 一段的尾巴離下一個圈票區多遠就停（三段分開）
  eye: '#161616',
  blush: '#ff9aa8',
  inside: 0.45, // 圈票處裡有人的機率
  open: 0.2, // 布簾被拉開、有人正要進去的機率（每一區第 2 個一定拉開）
  skin: '#f6d2b8',
  hair: '#2b2622',
  shoes: '#3a3f47',
  shirts: ['#ff8fab', '#ffd166', '#6ec6ff', '#7bd88f', '#c792ea', '#ff9f68', '#f2f2f2', '#8fb3ff'],
  pants: ['#3d5a80', '#5b6068', '#2f4858', '#8d6e63'],
}

// 一個小人（原點＝腳底中間，面向 +y＝看著圈票處）；回傳 Mesh 陣列
// 面數比 Day 27 少（球 14×10、膠囊 2–3 段）：AR 模型裡幾百個小人，手機才跑得動；桌上一個人約 2.5 公分，看不出差別
function voter(mats, rnd, pose = null) {
  const H = VOTER.h, u = H / 10 // 10 等份：腿 2.6、身體 3.2、頭 4.2（大頭比較可愛）
  const shirt = mats.shirt[Math.floor(rnd() * mats.shirt.length)], pants = mats.pants[Math.floor(rnd() * mats.pants.length)]
  const m = (geo, mat) => new THREE.Mesh(geo, mat)
  const parts = []
  for (const sx of [-1, 1]) {
    parts.push(m(new THREE.CapsuleGeometry(u * 0.42, u * 1.6, 2, 6).rotateX(Math.PI / 2).translate(sx * u * 0.55, 0, u * 1.3), pants)) // 腿
    parts.push(m(new THREE.SphereGeometry(u * 0.5, 6, 4).scale(1, 1.3, 0.6).translate(sx * u * 0.55, u * 0.15, u * 0.3), mats.shoes)) // 鞋
    parts.push(m(pose === 'push' || pose === 'adjust'
      ? new THREE.CapsuleGeometry(u * 0.32, u * 1.7, 2, 6).translate(sx * u * 1.05, u * 1.9, u * 4.6) // 推：手臂往前伸直
      : new THREE.CapsuleGeometry(u * 0.32, u * 1.5, 2, 6).rotateX(Math.PI / 2).rotateY(sx * 0.25).translate(sx * u * 1.45, 0, u * 3.7), shirt)) // 手臂
  }
  parts.push(m(new THREE.CapsuleGeometry(u * 1.15, u * 1.3, 3, 10).rotateX(Math.PI / 2).translate(0, 0, u * 4.2), shirt)) // 身體
  parts.push(m(new THREE.SphereGeometry(u * 2.1, 14, 10).translate(0, 0, u * 7.6), mats.skin)) // 頭
  // 臉（朝 +y）：兩隻眼睛、兩團腮紅，看得出臉朝哪邊
  for (const sx of [-1, 1]) {
    parts.push(m(new THREE.SphereGeometry(u * 0.26, 5, 4).scale(1, 0.5, 1.25).translate(sx * u * 0.72, u * 1.95, u * 7.75), mats.eye))
    parts.push(m(new THREE.SphereGeometry(u * 0.36, 5, 4).scale(1, 0.35, 0.7).translate(sx * u * 1.2, u * 1.68, u * 7.1), mats.blush))
  }
  parts.push(m(new THREE.SphereGeometry(u * 2.18, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55).rotateX(Math.PI / 2 + 0.35).translate(0, -u * 0.05, u * 7.75), mats.hair)) // 頭髮（蓋住頭頂和後腦）
  // 後腦勺朝鏡頭時看得到頭髮；臉朝圈票處（+y），從背後看是排隊的樣子
  if (pose === 'push') {
    // 推東西：前後腳分開、整個人往前傾
    parts[0].geometry.translate(0, -u * 0.9, 0); parts[1].geometry.translate(0, -u * 0.9, 0)
    parts[3].geometry.translate(0, u * 0.6, 0); parts[4].geometry.translate(0, u * 0.6, 0)
    const lean = new THREE.Matrix4().makeRotationX(-0.38)
    for (const q of parts) q.geometry.applyMatrix4(lean)
  }
  return parts
}

// 一個圈票處（在自己的座標裡：原點＝腳的中間的地面，正面＝布簾朝 -y）；回傳 Mesh 陣列
async function oneBoard(ch, mats, force = null) {
  const B = BILLBOARD, { w, d, h0, h1, legW } = B, top = h1 + 300
  const box = (sx, sy, sz, x, y, z, m) => new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z), m)
  const parts = []
  // 金屬腳（四根）＋上面一圈橫桿＋兩側低處的兩條橫桿（像梯子）
  for (const x of [-w / 2, w / 2]) for (const y of [-d / 2, d / 2]) parts.push(box(legW, legW, top, x, y, top / 2, mats.metal))
  for (const y of [-d / 2, d / 2]) parts.push(box(w, legW, legW, 0, y, top, mats.metal))
  for (const x of [-w / 2, w / 2]) {
    parts.push(box(legW, d, legW, x, 0, top, mats.metal))
    for (const z of [h0 * 0.35, h0 * 0.7]) parts.push(box(legW, d, legW, x, 0, z, mats.metal))
  }
  // 兩側、背面：灰毛氈板（薄板）
  const ph = h1 - h0, pz = (h0 + h1) / 2
  parts.push(box(160, d, ph, -w / 2, 0, pz, mats.felt), box(160, d, ph, w / 2, 0, pz, mats.felt), box(w, 160, ph, 0, d / 2, pz, mats.felt))
  // 正面：白布簾，從上面的橫桿掛下來（上緣有一條穿桿的布套）；皺褶上面細密（布收在桿子上）、往下變寬變軟，下襬不平、微微往外飄；字畫在布上
  let sd = ch.charCodeAt(0) * 9301 + 49297
  const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647)
  const fph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28], hem = [rnd() * 6.28, rnd() * 6.28]
  const NX = 160, NZ = 24, ch_ = h1 - h0 + 300, zTop = h1 + 300
  // 這個圈票處的狀態：裡面有人（布簾下面看得到腳）、布簾左下角被拉開有人正要進去、沒人
  const r0 = rnd(), state = force ?? (r0 < VOTER.inside ? 'inside' : r0 < VOTER.inside + VOTER.open ? 'open' : 'empty')
  const geo = new THREE.PlaneGeometry(w * 0.98, ch_, NX, NZ).rotateX(Math.PI / 2) // xz 平面，法線朝 -y
  const pos = geo.attributes.position
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), t = (pos.getZ(k) + ch_ / 2) / ch_ // 0＝下襬、1＝上緣
    const u = x / w + 0.5
    const top = Math.pow(t, 3) // 越上面越接近收在桿子上的細褶
    const big = 0.6 * Math.sin(u * B.folds * 2 * Math.PI + fph[0]) + 0.3 * Math.sin(u * B.folds * 3.3 * Math.PI + fph[1]) + 0.15 * Math.sin(u * 31 * Math.PI + fph[2])
    const fine = Math.sin(u * B.folds * 6 * Math.PI)
    const amp = B.fold * ((1 - top) * (0.8 + 0.6 * (1 - t)) + top * 0.45)
    const y = -d / 2 - 140 - amp * ((1 - top) * big + top * fine) - 260 * Math.pow(1 - t, 2) // 下面微微往外飄
    let z = zTop - (1 - t) * ch_
    if (t < 0.02) z += 160 * Math.sin(u * 7 * Math.PI + hem[0]) + 90 * Math.sin(u * 17 * Math.PI + hem[1]) // 下襬不平
    let xx = x, yy = y
    if (state === 'open') {
      // 拉開：整片布沿著桿子推到右邊、收成 55% 寬（皺褶變深），左邊 45% 整個打開看得到裡面；下面再被手撥開一點
      xx = -w / 2 + w * (0.45 + 0.55 * u) * 0.98
      yy = -d / 2 - 140 - (y + d / 2 + 140) * 1.9
      const f = Math.pow(1 - t, 1.5) * Math.max(0, 1 - u / 0.35)
      xx += f * w * 0.06
      yy -= f * 1800
    }
    pos.setX(k, xx)
    pos.setY(k, yy)
    pos.setZ(k, z)
  }
  geo.computeVertexNormals()
  const curtain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: await charTexture(ch, nextInk(ch)), side: THREE.DoubleSide, transparent: true, opacity: 0.94 }))
  parts.push(box(w * 0.98, 260, 420, 0, -d / 2 - 140, zTop - 210, mats.cloth)) // 上緣穿桿的布套
  parts.push(curtain)
  // 圈票處裡的人：站在裡面、面向背板（布簾下面露出腳）；拉開的：站在開口正要進去
  const put = (x, y, rot) => {
    for (const part of voter(mats, rnd)) {
      part.geometry.applyMatrix4(new THREE.Matrix4().makeRotationZ(rot).setPosition(x, y, 0))
      parts.push(part)
    }
  }
  if (state === 'inside') put((rnd() - 0.5) * w * 0.2, d * 0.05, (rnd() - 0.5) * 0.3)
  if (state === 'open') put(-w * 0.24, -d / 2 + 400, (rnd() - 0.5) * 0.3 - 0.35) // 站在開口，一腳踏進去
  return parts
}

// 一整排圈票處：x、y＝中間的公尺位置；chars＝每個的字；正面朝 BILLBOARD.faceAz；回傳 { group, parts }（parts 已在 group 裡，要投影子）
export async function billboard([x, y], chars = BILLBOARD.chars) {
  const B = { ...BILLBOARD, chars }
  const L = (color) => new THREE.MeshLambertMaterial({ color })
  const mats = { felt: L(B.felt), metal: L(B.metal), cloth: L(B.cloth), skin: L(VOTER.skin), hair: L(VOTER.hair), shoes: L(VOTER.shoes), eye: L(VOTER.eye), blush: L(VOTER.blush), shirt: VOTER.shirts.map(L), pants: VOTER.pants.map(L) }
  const group = new THREE.Group()
  const parts = []
  const step = B.w + B.gap, n = B.chars.length
  for (let i = 0; i < n; i++) {
    const sub = new THREE.Group()
    for (const m of await oneBoard(B.chars[i], mats, i === 1 ? 'open' : null)) { sub.add(m); parts.push(m) } // 每一區第 2 個一定是拉開的
    sub.position.x = (i - (n - 1) / 2) * step // 從正面看由左到右：正面朝 -y，看的人在 -y 那側，他的右手邊是 +x
    // 稍微沒對齊：前後左右偏一點、轉一點，比較自然（固定的亂數，照字算）
    const jr = (k) => (Math.sin((B.chars[i].charCodeAt(0) + i * 7.1) * 12.9898 + k * 78.233) * 43758.5453) % 1
    sub.position.x += jr(1) * B.w * 0.04
    sub.position.y = jr(2) * B.d * 0.12
    sub.rotation.z = jr(3) * 0.05
    group.add(sub)
  }
  // 整排轉向：正面（-y）轉到 faceAz（方位 a 的方向是 (sin a, cos a)；讓 (0,-1) 轉過去）
  const a = (B.faceAz * Math.PI) / 180
  group.position.set(x, y, 0)
  group.rotation.z = Math.atan2(Math.sin(a), -Math.cos(a))
  group.updateMatrixWorld(true)
  return { group, parts }
}

// ── 排隊：繞台灣外圍一圈（data/queue-path.json，build_queue.py：台灣本島＋澎湖往外推 35 km），分成三段，每段接到一個圈票區
// 每段的隊頭在圈票處正面，沿著外圍往後 S 形排，排到離下一個圈票區 gapEnd 就停（三段分開）；每個人面向隊頭（臉朝圈票處）
// loop：外圍（公尺 [[x, y]]，一圈）；rows：[{ head: [x, y], box: [x0, y0, x1, y1], dir?: 1 | -1, via?: [[x, y], …], until?: [x, y], dropTail?: 最後幾個人不放 }]；回傳 { meshes（合併過的）, lines（每條隊伍的中線，跟 rows 同順序） }
export function queues(loop, rows, boxes = []) {
  const L = (color) => new THREE.MeshLambertMaterial({ color })
  const mats = { skin: L(VOTER.skin), hair: L(VOTER.hair), shoes: L(VOTER.shoes), eye: L(VOTER.eye), blush: L(VOTER.blush), shirt: VOTER.shirts.map(L), pants: VOTER.pants.map(L) }
  let sd = 2028 // 小人的衣服顏色、位置的亂數（使用者要重新隨機一次：1128 → 2028）
  const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647)
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
  const n = loop.length
  const nearest = (p) => loop.reduce((b, q, i) => (dist(q, p) < dist(loop[b], p) ? i : b), 0)
  const heads = rows.map((r, idx) => ({ ...r, idx, i: nearest((r.via ?? []).at(-1) ?? r.head) })).sort((a, b) => a.i - b.i)
  const inBox = ([x, y]) => rows.some(({ box: [x0, y0, x1, y1] }) => x > x0 - 1500 && x < x1 + 1500 && y > y0 - 1500 && y < y1 + 1500)
  // 投票箱（公尺 [{ x, y }]）放進 5 km 的格子，小人跟任何一個箱子水平距離 < CLEAR 就不放（不要踩到箱子）
  const CLEAR = 4200, CELL = 5000, grid = new Map(), gk = (x, y) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`
  for (const b of boxes) {
    const k = gk(b.x, b.y)
    if (!grid.has(k)) grid.set(k, [])
    grid.get(k).push(b)
  }
  const onBox = ([x, y]) => {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
      for (const b of grid.get(gk(x + dx * CELL, y + dy * CELL)) ?? []) if (Math.hypot(b.x - x, b.y - y) < CLEAR) return true
    return false
  }
  // 外圍上每一點離起點多遠（沿著外圍）
  const loopS = [0]
  for (let i = 1; i < n; i++) loopS.push(loopS[i - 1] + dist(loop[i], loop[i - 1]))
  const buckets = new Map(), lines = []
  // 已經站了人的地方（所有隊伍一起算）：跟別人距離 < MIN_GAP 就不放，人不會卡在一起（蛇行折回來、隊伍靠很近的地方）
  const MIN_GAP = 4500, taken = new Map(), tk = (x, y) => `${Math.floor(x / MIN_GAP)},${Math.floor(y / MIN_GAP)}`
  const crowded = ([x, y]) => {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
      for (const [qx, qy] of taken.get(tk(x + dx * MIN_GAP, y + dy * MIN_GAP)) ?? []) if (Math.hypot(qx - x, qy - y) < MIN_GAP) return true
    return false
  }
  heads.forEach((h, k) => {
    // 往哪個方向排：dir 1＝沿外圍往後（索引變大）、-1＝反過來（rows 可以指定）；
    // 兩段尾巴對著尾巴（一段往前、下一段往回）時，中間那一段各排一半，留 MID_GAP 空隙
    const dir = h.dir ?? 1, nb = heads[(k + dir + heads.length) % heads.length]
    const arc = ((nb.i - h.i) * dir + n) % n || n // 往 dir 走到下一個圈票區要幾步
    const meet = (nb.dir ?? 1) === -dir, MID_GAP = 8
    const line = [h.head, ...(h.via ?? [])] // via：從隊頭繞過圈票處的端點再接到外圍（圈票處背對外圍時）
    const li = line.map(() => -1) // 每個點在外圍上的索引（隊頭、via 不在外圍上：-1）
    const stopI = h.until ? nearest(h.until) : -1 // until：排到外圍上離這點最近的地方就停（使用者指定隊伍排到哪）
    // 從 via 接到外圍時，最近的那一點如果在「回頭」的方向（離下一點比較遠），從下一點開始接，不要折回去
    let i0 = h.i
    const from = line.at(-1), nx = loop[(i0 + dir + n) % n]
    if (dist(from, nx) < dist(loop[i0], nx) + 1500) i0 = (i0 + dir + n) % n
    for (let c = 0, i = i0; c < n && !h.own; c++, i = (i + dir + n) % n) { // own：自己的路線（via 走完就停，不接外圍）
      if (c > 3 && i === stopI) break
      if (meet ? c > arc / 2 - MID_GAP : c > 3 && (i === nb.i || dist(loop[i], nb.head) < VOTER.gapEnd)) break
      const q = loop[i], ql = Math.hypot(q[0], q[1]) || 1, ex = h.out ?? 0 // out：整段往外推（離台灣中心＝原點遠一點）
      line.push(ex ? [q[0] + (q[0] / ql) * ex, q[1] + (q[1] / ql) * ex] : q)
      li.push(i)
    }
    // 蛇行
    const seg = []
    let acc = 0, onAcc = 0 // onAcc：上了外圍之後走了多遠（S 形從這裡開始慢慢擺出來）
    for (let a = 0; a < line.length - 1; a++) {
      const [x0, y0] = line[a], [x1, y1] = line[a + 1], len = Math.hypot(x1 - x0, y1 - y0)
      const tx = (x1 - x0) / (len || 1), ty = (y1 - y0) / (len || 1)
      const onLoop = li[a] >= 0 && li[a + 1] >= 0
      for (let s = 0; s < len; s += 800) {
        // 整條都蛇行（照離隊頭多遠算，一條隊伍裡連續），隊頭 8 km 內慢慢擺出來
        const tot = acc + s, k2 = Math.min(1, tot / 8000)
        const off = k2 * VOTER.sAmp * Math.sin((tot / VOTER.sWave) * Math.PI * 2)
        seg.push([x0 + tx * s - ty * off, y0 + ty * s + tx * off])
      }
      acc += len
      if (onLoop) onAcc += len
    }
    // 每隔 spacing 放一個人；面向前一個點（往隊頭的方向）；dropTail：最後幾個不放
    const people = []
    let walked = 0, nextAt = 3000
    for (let a = 1; a < seg.length; a++) {
      walked += dist(seg[a], seg[a - 1])
      if (walked < nextAt) continue
      nextAt = walked + VOTER.spacing * (0.9 + rnd() * 0.25)
      const p = seg[a]
      if ((walked > 15000 && inBox(p)) || onBox(p)) continue
      const back = seg[Math.max(0, a - 3)]
      const rot = Math.atan2(back[1] - p[1], back[0] - p[0]) - Math.PI / 2 + (rnd() - 0.5) * 0.35
      people.push(new THREE.Matrix4().makeRotationZ(rot).setPosition(p[0] + (rnd() - 0.5) * 700, p[1] + (rnd() - 0.5) * 700, 0))
    }
    const kept = people.slice(0, people.length - (h.dropTail ?? 0))
    // 每條隊伍蛇行後的線，只留第一個人到最後一個人那段（地上的字沿著它寫，從頭寫到尾）
    const near = (m) => seg.reduce((b, q, i) => (dist(q, [m.elements[12], m.elements[13]]) < dist(seg[b], [m.elements[12], m.elements[13]]) ? i : b), 0)
    lines[h.idx] = kept.length > 1 ? seg.slice(near(kept[0]), near(kept.at(-1)) + 1) : seg
    for (const mtx of kept) {
      const x = mtx.elements[12], y = mtx.elements[13]
      if (crowded([x, y])) continue
      const key = tk(x, y)
      if (!taken.has(key)) taken.set(key, [])
      taken.get(key).push([x, y])
      for (const part of voter(mats, rnd)) {
        const g = part.geometry.applyMatrix4(mtx)
        if (!buckets.has(part.material)) buckets.set(part.material, [])
        buckets.get(part.material).push(g)
      }
    }
  })
  return { meshes: [...buckets].map(([mat, geos]) => new THREE.Mesh(mergeGeometries(geos), mat)), lines }
}

// ── 告示牌「LINING UP for / DEMOCRACY」：一個字一塊看板（白板面、深色外框），平放在地上、往後抬高 45°，後面兩支短腳撐著，兩行前後兩排（第一行在後排），靠左對齊，放在右下角；方向跟圈票處一樣（正面朝東）
export const GROUND_TEXT = {
  // 每一塊看板一個字；for 整個字一塊看板（使用者指定）；' ' 只空一格
  lines: [[...'LINING UP', ' ', 'for'], [...'DEMOCRACY']],
  sizePx: 44, // 字級（IG 1080×1350 的 px）：放得進右下角、不擋到人和圈票處的最大
  // 字：藍、綠、粉、橘、黃、天藍隨機（INKS，跟排隊小人的衣服、圈票處的字同一組）
  paper: '#f2f2f2', // 板面
  edge: '#8f949b', // 外框、背面：跟圈票處的灰（毛氈板）一樣
  leg: '#5b6068', // 柱子
  lamp: '#2a2d31', // 燈臂
  font: 'Overpass', weight: 800, // ExtraBold
  mPerPx: 125, // 字級 px 換成公尺（預設視角下 1 個 IG px ≈ 125 m）
  board: 1.15, // 看板邊長（字級的倍數）
  gap: 0.12, // 看板之間的空隙（字級的倍數）
  legH: 0.05, // 板子底邊離地多高（字級的倍數）
  tilt: 45, // 板子平放在地上、往後抬高幾度
  rowGap: 1.9, // 兩排前後距離（字級的倍數）
  // 顏色交換（照順序；找第一個符合的字）：R↔Y、for↔I、for↔Y（使用者指定）
  swaps: [['R', 'Y'], ['for', 'I'], ['for', 'Y']],
  fan: Math.PI / 12, // 扇形：兩端各轉 15°（微微的弧）
  fixed: { Y: '#7bd88f', for: '#c792ea' }, // 指定顏色（交換之後再套）：Y 綠色、for 紫色（跟小人衣服的紫一樣）
  center: [123.1029, 23.5738], // 中間（地面）：打開頁面時會自動移到右下角、貼著紅線內框（index.vue 的 fitSign）
  faceAz: 119, // 正面朝哪個方位：119°＝對著預設鏡頭（鏡頭看過去是 299°）
}

// 板面的貼圖：白底，中間一個字（字高＝板面的 62%）
function boardTex(ch, ink) {
  const T = GROUND_TEXT, S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')
  g.fillStyle = T.paper
  g.fillRect(0, 0, S, S)
  g.font = `${T.weight} 100px ${T.font}`
  const m = g.measureText(ch), cap = g.measureText('H').actualBoundingBoxAscent / 100
  const iw = (m.actualBoundingBoxLeft + m.actualBoundingBoxRight) / 100
  const size = Math.min((S * 0.62) / cap, (S * 0.8) / iw) // 一個字母：字高 62%；for 這種好幾個字母的：寬不超過 80%
  g.font = `${T.weight} ${size}px ${T.font}`
  const mm = g.measureText(ch), w = mm.actualBoundingBoxLeft + mm.actualBoundingBoxRight
  g.fillStyle = ink
  g.fillText(ch, (S - w) / 2 + mm.actualBoundingBoxLeft, (S + cap * size) / 2)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

// 一塊看板（自己的座標：原點＝底邊中間的地面，正面朝 −y、往後倒到只抬高 tilt 度）；s＝板子邊長（公尺）
function signBoard(ch, s, mats, ink) {
  const T = GROUND_TEXT, legH = s * T.legH, top = legH + s, d = s * 0.06, frame = s * 0.035
  const box = (sx, sy, sz, x, y, z, m) => new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z), m)
  const parts = []
  const front = new THREE.MeshLambertMaterial({ map: boardTex(ch, ink) })
  const iw = s - frame * 2
  parts.push(new THREE.Mesh(new THREE.BoxGeometry(iw, d, iw).translate(0, 0, legH + s / 2), [mats.edge, mats.edge, mats.edge, front, mats.edge, mats.edge]))
  const fd = d * 1.6
  parts.push(box(s, fd, frame, 0, 0, top - frame / 2, mats.edge), box(s, fd, frame, 0, 0, legH + frame / 2, mats.edge))
  parts.push(box(frame, fd, iw, -s / 2 + frame / 2, 0, legH + s / 2, mats.edge), box(frame, fd, iw, s / 2 - frame / 2, 0, legH + s / 2, mats.edge))
  // 平放：整塊板子以底邊為軸往後倒，只抬高 tilt 度（正面朝上偏前）
  const rot = new THREE.Matrix4().makeRotationX(-((90 - T.tilt) * Math.PI) / 180)
  const lift = new THREE.Matrix4().makeTranslation(0, 0, -legH), back = new THREE.Matrix4().makeTranslation(0, 0, legH)
  for (const m of parts) m.geometry.applyMatrix4(lift).applyMatrix4(rot).applyMatrix4(back)
  // 後面兩支短腳撐住上緣
  const a = (T.tilt * Math.PI) / 180, ty = s * Math.cos(a), tz = legH + s * Math.sin(a), lw = s * 0.04
  for (const f of [-0.3, 0.3]) parts.push(box(lw, lw, tz, s * f, ty - lw, tz / 2, mats.leg))
  return parts
}

// loc(lon, lat) → 公尺；回傳 { group, parts }（parts 要投影子）
export async function groundText(loc) {
  const T = GROUND_TEXT
  try { await document.fonts.load(`${T.weight} 200px ${T.font}`) } catch {}
  const L = (color) => new THREE.MeshLambertMaterial({ color })
  const mats = { edge: L(T.edge), leg: L(T.leg), lamp: L(T.lamp) }
  const big = T.sizePx * T.mPerPx
  const rows = T.lines.map((r) => r.map((ch) => [ch, big]))
  const advOf = ([ch, sz]) => (ch === ' ' ? sz * 0.5 : sz * (T.board + T.gap))
  const parts = []
  // 第一行的 P 還沒到位：放在 U 的左上方（後面、歪一點），UP 中間留空位；一個小人在它後面往前推
  let uAt = null, pSlot = null, pTex = null
  // 先排好每一塊的位置、隨機色，再照 swaps 交換顏色（使用者指定），最後才做看板
  const slots = []
  rows.forEach((row, ri) => {
    const y0 = (rows.length - 1 - ri) * T.rowGap * big // 第一行在後排
    let x = 0 // 靠左對齊：每行都從 x＝0 開始
    for (const [ch, sz] of row) {
      const adv = advOf([ch, sz])
      if (ch !== ' ') slots.push({ ri, ch, x: x + (sz * T.board) / 2, y0, s: sz * T.board, ink: nextInk(ch, true) })
      x += adv
    }
  })
  for (const [a, b] of T.swaps) {
    const A = slots.find((q) => q.ch === a), B = slots.find((q) => q.ch === b)
    if (A && B) [A.ink, B.ink] = [B.ink, A.ink]
  }
  for (const q of slots) if (T.fixed[q.ch]) q.ink = T.fixed[q.ch]
  const xs = slots.map((q) => q.x), xMin = Math.min(...xs), xMax = Math.max(...xs)
  let js = 31
  const jr = () => (js = (js * 16807) % 2147483647) / 2147483647
  // DEMOCRACY 的 O、C 沒排好（往後歪進去），一個小人在它們後面、面向鏡頭，把它們往前推回去
  const o = slots.find((q) => q.ri === rows.length - 1 && q.ch === 'O'), c = o && slots.find((q) => q.ri === o.ri && q.ch === 'C' && q.x > o.x)
  const messy = new Map(o && c ? [[o, [-0.3, 0.25, -0.1]], [c, [-0.2, -0.2, 0.15]]] : [])
  const uq = slots.find((q) => q.ri === 0 && q.ch === 'U')
  if (uq) messy.set(uq, [0.05, -0.25, 0]) // U 也歪一邊
  // DEMOCRACY 的 D、E、M 往左一點點（跟 O 拉開一點）
  for (const ch of 'DEM') {
    const q = slots.find((q2) => q2.ri === rows.length - 1 && q2.ch === ch)
    if (q) messy.set(q, [0, 0, -0.15])
  } // [往前（負＝往鏡頭）, 轉幾度（弧度）, 往左右（板子邊長的倍數）]：O、C 被拉開，中間站粉紅小人
  for (const q of slots) {
    if (q.ri === 0 && q.ch === 'U') uAt = [q.x, q.y0, q.s]
    if (q.ri === 0 && q.ch === 'P' && !pSlot) {
      pSlot = [q.x, q.y0]
      pTex = q.ink
      continue
    }
    // 每塊稍微沒對齊：前後左右偏一點、轉一點（固定的亂數）
    const jx = (jr() - 0.5) * q.s * 0.04, jy = (jr() - 0.5) * q.s * 0.1, jz = (jr() - 0.5) * 0.07 // 只有一點點
    const [my, mz, mx = 0] = messy.get(q) ?? [0, 0]
    const jm = new THREE.Matrix4().makeRotationZ(jz + mz).setPosition(q.x + jx + mx * q.s, q.y0 + jy + my * q.s, 0)
    for (const m of signBoard(q.ch, q.s, mats, q.ink)) {
      m.geometry.applyMatrix4(jm)
      parts.push(m)
    }
  }
  if (o && c) {
    const vm = { skin: L(VOTER.skin), hair: L(VOTER.hair), shoes: L(VOTER.shoes), eye: L(VOTER.eye), blush: L(VOTER.blush), shirt: [L(VOTER.shirts[0])], pants: [L(VOTER.pants[1])] }
    // 站在 O 的左前方（靠鏡頭、偏左，不擋 O、C 的字），背對鏡頭、斜斜面向 O、C，把歪出來的 O、C 推回去
    // 站在 O、C 中間，背對鏡頭（臉朝 O、C 那邊），站直、雙手往前，在把歪掉的 O、C 扶正（不是往前衝）
    const at = new THREE.Matrix4().makeRotationZ(0).setPosition((o.x + c.x) / 2 - o.s * 0.05, o.y0 - o.s * 0.35, 0) // 背對鏡頭（臉朝這排的 +y）
    for (const m of voter(vm, () => 0, 'adjust')) {
      m.geometry.applyMatrix4(at)
      parts.push(m)
    }
  }
  if (uAt && pSlot) {
    const [ux, uy, s] = uAt
    const px = ux + s * 0.55, py = uy + s * 1.05, rz = 0.3 // P 現在的位置：畫面上 U 的右上方（往右、往後），歪一點
    for (const m of signBoard('P', s, mats, pTex)) {
      m.geometry.applyMatrix4(new THREE.Matrix4().makeRotationZ(rz).setPosition(px, py, 0))
      parts.push(m)
    }
    // 推的小人：站在 P 板子上緣後面（不擋到 P 的字），面向 P 要去的空位，往前傾、雙手推著板子
    let dx = pSlot[0] - px, dy = pSlot[1] - py
    const dl = Math.hypot(dx, dy)
    dx /= dl; dy /= dl
    const vm = { skin: L(VOTER.skin), hair: L(VOTER.hair), shoes: L(VOTER.shoes), eye: L(VOTER.eye), blush: L(VOTER.blush), shirt: [L(VOTER.shirts[2])], pants: [L(VOTER.pants[0])] }
    const k = 1 // 跟其他排隊的小人一樣大
    const at = new THREE.Matrix4().makeRotationZ(Math.atan2(dy, dx) - Math.PI / 2).scale(new THREE.Vector3(k, k, k)).setPosition(px - dx * (s * 0.6 + VOTER.h * 0.3), py - dy * (s * 0.6 + VOTER.h * 0.3) + s * 0.6, 0) // 站在 P 的後面偏左（離鏡頭遠），不擋到 P
    for (const m of voter(vm, () => 0, 'push')) {
      m.geometry.applyMatrix4(at)
      parts.push(m)
    }
  }
  // 扇形：整組（看板、小人）彎成一段圓弧，圓心在後面；最左（L）朝東南、最右（Y）朝東北，中間慢慢轉，看板不會互相撞到
  {
    const xc = (xMin + xMax) / 2, R = (xMax - xMin) / 2 / T.fan
    for (const m of parts) {
      const pos = m.geometry.attributes.position
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), th = (x - xc) / R, r = R - y
        pos.setXY(i, xc + r * Math.sin(th), R - r * Math.cos(th))
      }
      pos.needsUpdate = true
      m.geometry.computeVertexNormals()
    }
  }
  // 整組置中在原點（center 是中間）
  const bb = new THREE.Box3()
  for (const m of parts) bb.expandByObject(m)
  const cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2
  for (const m of parts) m.geometry.translate(-cx, -cy, 0)
  const group = new THREE.Group()
  for (const m of parts) group.add(m)
  const [gx, gy] = loc(...T.center)
  const az = (T.faceAz * Math.PI) / 180
  group.position.set(gx, gy, 0)
  group.rotation.z = Math.atan2(Math.sin(az), -Math.cos(az)) // 正面（−y）轉到 faceAz
  group.updateMatrixWorld(true)
  return { group, parts }
}

// 開發時改了這個檔：整頁重新載入（3D 場景只在打開頁面時建一次，熱更新不會重建，畫面會停在舊的）
if (import.meta.hot) import.meta.hot.decline()
