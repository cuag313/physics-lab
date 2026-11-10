/**
 * 3D 实体器材：用基本几何体（盒/柱/球/环）拼出真实器材质感，
 * 取代此前"拿 SVG 剪影挤出成一块板"的伪 3D。
 *
 * 约定：
 *  - 组内坐标为本地坐标，y 向上，台面在 y = 0，实体用 +y 抬起来；
 *  - 尺寸沿用 2D 器材的逻辑尺寸（SVG px），按 SCALE 换算成世界单位，
 *    这样切换 2D/3D 时器材在桌面上的占地一致；
 *  - 接线柱位置严格按 TYPES[type].terminals 的像素坐标换算，
 *    保证 3D 热区（attachHotspots）与看得见的铜柱重合。
 */

import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

const SCALE = 0.01

/* ── 材质 ── */
function std(color, opt = {}) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: opt.roughness ?? 0.62,
    metalness: opt.metalness ?? 0.08,
    ...opt,
  })
}

const MAT = {
  copper: () => std('#c67a35', { roughness: 0.45, metalness: 0.45 }),
  brass: () => std('#c9a227', { roughness: 0.42, metalness: 0.4 }),
  steel: () => std('#aeb6be', { roughness: 0.4, metalness: 0.5 }),
  bakelite: () => std('#2a2d33', { roughness: 0.72, metalness: 0.04 }),
  darkPlastic: () => std('#3a3f47', { roughness: 0.7 }),
  ceramic: () => std('#efe9dd', { roughness: 0.55, metalness: 0.02 }),
  redPlastic: () => std('#b12a26', { roughness: 0.6 }),
  bluePlastic: () => std('#2b5aa8', { roughness: 0.55 }),
  glass: () =>
    std('#dfe9f2', {
      roughness: 0.08,
      metalness: 0.0,
      transparent: true,
      opacity: 0.42,
      envMapIntensity: 1.2,
    }),
  white: () => std('#f6f4ee', { roughness: 0.75 }),
}

/* ── 几何工具 ── */
function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

function cyl(rTop, rBottom, h, material, seg = 20) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), material)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/**
 * 圆角盒 —— 真实塑料/胶木件的每一条棱都是圆的。
 * 用纯 BoxGeometry 拼出来的器材，一眼就是"积木"：棱线笔直、没有过渡面，
 * 抗锯齿再好也像贴纸。圆角是"像实物"最便宜也最有效的一步。
 * @param {number} r 圆角半径（会被夹到最短边的一半以内）
 */
function rbox(w, h, d, r, material, x = 0, y = 0, z = 0, seg = 3) {
  const rr = Math.max(0.001, Math.min(r, w * 0.49, h * 0.49, d * 0.49))
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, seg, rr), material)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/**
 * 螺旋管 —— 沿 +Y 轴的螺旋线扫出一根细管。
 * 两处必须用它而不是"叠一堆圆环"：
 *   1) 小灯泡的螺口（实物是连续的螺纹，不是几个独立圆环）；
 *   2) 滑动变阻器的镍铬丝（实物是一根连续电阻丝绕在瓷管上）。
 * 叠圆环在近景里会露出环与环之间的空当，一看就是假的。
 * @param {number} radius 螺旋半径
 * @param {number} y0 起点 y
 * @param {number} y1 终点 y
 * @param {number} turns 圈数
 * @param {number} tubeR 丝半径
 */
function helixTube(radius, y0, y1, turns, tubeR, material) {
  const N = Math.max(24, Math.round(turns * 14))
  const pts = []
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const a = t * turns * Math.PI * 2
    pts.push(new THREE.Vector3(Math.cos(a) * radius, y0 + (y1 - y0) * t, Math.sin(a) * radius))
  }
  const curve = new THREE.CatmullRomCurve3(pts)
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, N, tubeR, 6, false), material)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** 简易文字贴图（铭牌/型号标签），省掉外部图片依赖 */
function labelTexture(lines, opt = {}) {  const W = opt.w || 256
  const H = opt.h || 128
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const g = cv.getContext && cv.getContext('2d')
  if (!g) return null // 离屏/测试环境没有 2d context：贴图留空，但不能让整件器材崩掉
  g.fillStyle = opt.bg || '#f4f2ec'
  g.fillRect(0, 0, W, H)
  if (opt.border) {
    g.strokeStyle = opt.border
    g.lineWidth = 4
    g.strokeRect(2, 2, W - 4, H - 4)
  }
  g.fillStyle = opt.color || '#1e2530'
  g.textAlign = 'center'
  lines.forEach((ln, i) => {
    g.font = (i === 0 ? 'bold ' : '') + (i === 0 ? 40 : 26) + 'px sans-serif'
    g.fillText(ln, W / 2, H * (0.42 + i * 0.3))
  })
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/* ── 实拍图贴面：2D 视图里的器材本来就是实拍/渲染图，3D 直接复用同一张图 ──
 * 这是"1:1"最直接的做法：占桌面尺寸 = 2D 的 w×h（1px = 1cm），
 * 顶面贴同一张实拍图，再把接线柱按 terminals 像素坐标从顶面伸出来，
 * 于是"看到的形状"和 2D 视图完全一致，还多了真实厚度。
 * 图片是白底，必须只抠掉"与画布边界连通的白色"（flood fill），
 * 否则表盘内部的白也会被抠成透明洞。 */
const PHOTO_BASE = '/physics-lab/assets/equipment/fig/'
const _photoCache = new Map()

/** 只把与边界连通的近白像素置透明，保留器材内部的白 */
function whiteBorderToAlpha(cv, g) {
  const W = cv.width
  const H = cv.height
  const data = g.getImageData(0, 0, W, H)
  const px = data.data
  const seen = new Uint8Array(W * H)
  const stack = []
  for (let x = 0; x < W; x++) {
    stack.push(x)
    stack.push((H - 1) * W + x)
  }
  for (let y = 0; y < H; y++) {
    stack.push(y * W)
    stack.push(y * W + W - 1)
  }
  const white = (i) => px[i * 4] > 236 && px[i * 4 + 1] > 236 && px[i * 4 + 2] > 236
  while (stack.length) {
    const idx = stack.pop()
    if (seen[idx]) continue
    seen[idx] = 1
    if (!white(idx)) continue
    px[idx * 4 + 3] = 0
    const x = idx % W
    const y = (idx - x) / W
    if (x > 0) stack.push(idx - 1)
    if (x < W - 1) stack.push(idx + 1)
    if (y > 0) stack.push(idx - W)
    if (y < H - 1) stack.push(idx + W)
  }
  g.putImageData(data, 0, 0)
}

/** 取实拍图贴图（异步载入；先用 1×1 空白占位，载入后自动替换） */
function photoTexture(file) {
  // 无 DOM（node 测试 / 离屏无 canvas）时直接放弃贴面，器材照常能造出来
  if (typeof document === 'undefined') return null
  const key = String(file)
  const hit = _photoCache.get(key)
  if (hit) return hit
  const cv = document.createElement('canvas')
  cv.width = 2
  cv.height = 2
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  _photoCache.set(key, tex)
  const img = new Image()
  img.onload = () => {
    const c2 = document.createElement('canvas')
    c2.width = img.width
    c2.height = img.height
    const g = c2.getContext && c2.getContext('2d')
    if (!g) return
    g.drawImage(img, 0, 0)
    whiteBorderToAlpha(c2, g)
    tex.image = c2
    tex.needsUpdate = true
  }
  img.src = PHOTO_BASE + file
  return tex
}

/** 顶面贴一张实拍图（尺寸即 2D 的 w×h，1px=1cm） */
function photoTop(file, w, h, y, opt = {}) {
  const tex = photoTexture(file)
  if (!tex) return null
  const mat = new THREE.MeshBasicMaterial({
    map: photoTexture(file),
    transparent: true,
    toneMapped: false,
  })
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
  m.rotation.x = -Math.PI / 2
  m.position.set(0, y, 0)
  m.userData.role = 'photo'
  if (opt.z) m.position.z = opt.z
  return m
}



/**
 * 接线柱：对标实物实验室的红/黑压线旋钮
 *  - 负极/公共端用黑色旋钮，正极用红色旋钮（按 terminals.id 判断）
 *  - 结构：金属基座 → 细柱 → 彩色旋钮 → 顶部中心凸起
 *  - 总高约 0.16，与 three-render 的磁吸热区中心对齐
 */
function makePost(id = '') {
  const isNeg = /^(neg|n|-)/i.test(id) || /neg|black/i.test(id)
  const knobColor = isNeg ? '#1c2026' : '#cf1f22'
  const g = new THREE.Group()

  const base = cyl(0.052, 0.058, 0.02, MAT.steel(), 16)
  base.position.y = 0.01
  g.add(base)

  const stem = cyl(0.022, 0.022, 0.07, MAT.steel(), 12)
  stem.position.y = 0.05
  g.add(stem)

  const knob = cyl(
    0.052,
    0.056,
    0.062,
    // 旋钮是绝缘塑料：不要金属度，环境反射压低，红色才压得住不会被洗成粉
    std(knobColor, { roughness: 0.55, metalness: 0, envMapIntensity: 0.55 }),
    20
  )
  knob.position.y = 0.115
  g.add(knob)

  // 旋钮顶部的凹槽 + 中心凸起（实物接线柱的压线螺钉）
  const cap = cyl(0.03, 0.03, 0.012, std(isNeg ? '#3a3f45' : '#e0483f', { roughness: 0.5 }), 14)
  cap.position.y = 0.152
  g.add(cap)

  g.userData.role = 'post'
  g.userData.neg = isNeg
  return g
}

/** 表盘贴图：canvas 画刻度 + 文字，比光栅化 SVG 更清晰也更省 */
function dialTexture(kind, fs, subTicks) {
  const W = 256
  const H = 256
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const g = cv.getContext && cv.getContext('2d')
  if (!g) return null // 同上：没有 2d context 就不画表盘，别让表整件崩掉
  g.fillStyle = '#fbfaf6'
  g.fillRect(0, 0, W, H)

  // 刻度弧：圆心在画布下缘外，半径取 0.625H，跨度 ±50°（与指针行程 -52°~+52° 对齐），
  // 保证 0 与满刻度都落在表盘里不被裁掉
  const cx = W / 2
  const cy = H * 1.11
  const R = H * 0.625
  const a0 = Math.PI * 1.222 // 220°
  const a1 = Math.PI * 1.778 // 320°
  g.strokeStyle = '#1f2226'
  g.lineWidth = 2.2
  g.beginPath()
  g.arc(cx, cy, R, a0, a1)
  g.stroke()

  const n = subTicks || 30
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const a = a0 + (a1 - a0) * t
    const r0 = R - (i % 5 === 0 ? 15 : 7)
    const r1 = R
    g.strokeStyle = i % 5 === 0 ? '#1f2226' : '#6b7176'
    g.lineWidth = i % 5 === 0 ? 2 : 1
    g.beginPath()
    g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0)
    g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1)
    g.stroke()
  }

  // 数字
  g.fillStyle = '#15181c'
  g.font = 'bold 17px sans-serif'
  g.textAlign = 'center'
  const marks = 6
  for (let i = 0; i <= marks; i++) {
    const t = i / marks
    const a = a0 + (a1 - a0) * t
    const rr = R - 26
    g.fillText(String(Math.round(fs * t * 10) / 10), cx + Math.cos(a) * rr, cy + Math.sin(a) * rr + 6)
  }

  // 单位/型号
  g.font = 'bold 26px sans-serif'
  g.fillText(kind, cx, H * 0.36)
  g.font = '14px sans-serif'
  g.fillStyle = '#6b7176'
  g.fillText('J0407 · 0.5 级', cx, H * 0.44)

  const tex = new THREE.CanvasTexture(cv)
  tex.anisotropy = 4
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/* ── 各类器材 ── */

/** 电池组：平放方块（占地严格等于 2D 的 w×h）+ 顶面实拍贴面 + 内部两节干电池 */
function buildBattery(w, h) {
  const g = new THREE.Group()
  const bw = w * SCALE // 1.50
  const bd = h * SCALE // 1.54
  const bh = 0.5
  const shell = []

  // 内部：两节 1.5V 干电池串联（3V 方块电池就是这么装的）
  const inner = new THREE.Group()
  inner.name = 'battery-inner'
  for (let i = 0; i < 2; i++) {
    const x = i === 0 ? -0.3 : 0.3
    const cell = cyl(0.15, 0.15, 0.4, std('#232a33', { roughness: 0.5, metalness: 0.3 }), 20)
    cell.position.set(x, 0.02 + bh / 2, 0)
    inner.add(cell)
    const band = cyl(0.152, 0.152, 0.1, std('#d8b23c', { roughness: 0.45 }), 20)
    band.position.set(x, 0.02 + bh / 2 - 0.02, 0)
    inner.add(band)
    const cap = cyl(0.055, 0.055, 0.03, MAT.brass(), 14)
    cap.position.set(x, 0.02 + bh / 2 + 0.215, 0)
    inner.add(cap)
  }
  inner.add(box(0.6, 0.018, 0.02, MAT.copper(), 0, 0.02 + bh / 2 + 0.19, 0))
  g.add(inner)

  // 壳身：圆角方块（不再是之前的卧式长条）
  const bodyMesh = rbox(bw, bh, bd, 0.05, MAT.bluePlastic(), 0, 0.02 + bh / 2, 0)
  shell.push(bodyMesh)

  // 顶面：实拍图（尺寸与 2D 完全一致 —— 照片上的柱、+/- 印字都落在同一位置）
  const top = photoTop('battery_c.png', bw * 0.99, bd * 0.99, 0.02 + bh + 0.0015)
  if (top) g.add(top)

  // 底沿一圈深色包边，让方块在台面上有"落座感"
  shell.push(rbox(bw + 0.01, 0.03, bd + 0.01, 0.012, std('#16406f'), 0, 0.015, 0))

  for (const m of shell) g.add(m)
  return { group: g, shell, inner }
}

/** 小灯泡：浅灰底板 + 黑胶木灯座 + 连续螺纹灯口 + 玻璃泡 + 螺旋灯丝 */
function buildBulb(w, h) {
  const g = new THREE.Group()
  const shell = []
  // 底板（实物是浅灰塑料薄板，不是黑板条）
  const base = rbox(w * SCALE * 0.94, 0.045, 0.5, 0.015, std('#d6d9de', { roughness: 0.62 }), 0, 0.0225, 0)
  shell.push(base)
  // 黑胶木灯座（实物灯座矮而粗，不是细高瓷柱）
  const socket = cyl(0.162, 0.178, 0.2, std('#22262c', { roughness: 0.68, metalness: 0.03 }), 24)
  socket.position.y = 0.14
  shell.push(socket)
  // 灯座顶面金属承口（螺纹在承口里面）
  const cup = cyl(0.108, 0.112, 0.022, MAT.steel(), 20)
  cup.position.y = 0.248
  shell.push(cup)
  for (const m of shell) g.add(m)

  // 连续螺纹的灯口（原来用几个圆环叠，近景能看到环间空当）
  const screw = helixTube(0.098, 0.252, 0.392, 4.5, 0.0085, MAT.steel())
  g.add(screw)
  // 灯口内芯
  const core = cyl(0.082, 0.082, 0.15, std('#8b9099', { roughness: 0.5, metalness: 0.3 }), 16)
  core.position.y = 0.33
  g.add(core)

  // 玻璃：颈部 + 泡体（实物泡径约 2cm）
  const glassMat = MAT.glass()
  glassMat.opacity = 0.36
  const neck = cyl(0.09, 0.072, 0.12, glassMat, 18)
  neck.position.y = 0.45
  neck.castShadow = false
  g.add(neck)
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.195, 30, 22), glassMat)
  globe.position.y = 0.60
  globe.scale.y = 1.08
  globe.castShadow = false
  g.add(globe)

  // 灯丝：真实的灯丝是一小段螺旋（不是一圈环）
  const filMat = std('#5c3417', {
    emissive: new THREE.Color('#ff9a3c'),
    emissiveIntensity: 0,
    roughness: 0.4,
    metalness: 0.3,
  })
  const fil = helixTube(0.022, 0.0, 0.075, 4, 0.0065, filMat)
  fil.position.y = 0.555
  g.add(fil)
  // 两根引线：灯口 → 灯丝
  for (const sx of [-1, 1]) {
    const lead = cyl(0.007, 0.007, 0.14, MAT.steel(), 6)
    lead.position.set(sx * 0.03, 0.50, 0)
    g.add(lead)
  }
  return { group: g, bulbMat: filMat, glassMat, shell }
}

/** 单刀开关：瓷质圆角底板 + 铜刀座与铰链 + 铜刀 + 红色手柄 + 铜夹片 */
function buildSwitch(w, h) {
  const g = new THREE.Group()
  const shell = []
  // 瓷底板（实物底板是米白瓷/胶木，圆角，比器材本体略大一圈）
  const base = rbox(w * SCALE * 0.96, 0.058, 0.62, 0.02, MAT.ceramic(), 0, 0.029, 0)
  shell.push(base)
  g.add(base)
  // 底板下缘的深色包边
  shell.push(rbox(w * SCALE * 0.96 - 0.01, 0.018, 0.62 - 0.01, 0.008, std('#c9c1b2', { roughness: 0.7 }), 0, 0.009, 0))

  // 内部：底座下的静触点与引线（剖视时露出来）
  const inner = new THREE.Group()
  inner.name = 'switch-inner'
  for (const sx of [-1, 1]) {
    inner.add(box(0.1, 0.03, 0.12, MAT.brass(), sx * 0.42, 0.02, 0))
    inner.add(box(0.5, 0.012, 0.012, MAT.copper(), sx * 0.14, 0.02, 0))
  }
  g.add(inner)

  // 两端刀座（铜）
  for (const sx of [-1, 1]) {
    g.add(rbox(0.15, 0.11, 0.17, 0.012, MAT.brass(), sx * 0.4, 0.115, 0))
  }
  // 铰链轴（横穿的铜轴，刀从这里转）
  const hinge = cyl(0.032, 0.032, 0.2, MAT.brass(), 12)
  hinge.rotation.x = Math.PI / 2
  hinge.position.set(-0.42, 0.175, 0)
  g.add(hinge)
  // 另一端静触点夹片（两片铜片夹住刀头）
  for (const sz of [-1, 1]) {
    g.add(box(0.16, 0.09, 0.012, MAT.brass(), 0.42, 0.16, sz * 0.028))
  }

  // 刀片（铜刀：扁条 + 前端略收）
  const pivot = new THREE.Group()
  pivot.position.set(-0.42, 0.19, 0)
  const blade = rbox(0.82, 0.024, 0.062, 0.01, std('#c9982f', { roughness: 0.34, metalness: 0.62 }), 0.41, 0, 0)
  pivot.add(blade)
  // 刀头下压的弧形触点
  const tip = box(0.1, 0.03, 0.05, std('#b8862a', { roughness: 0.35, metalness: 0.6 }), 0.8, -0.02, 0)
  pivot.add(tip)
  // 绝缘手柄（红色胶木，不是小球）
  pivot.add(rbox(0.14, 0.05, 0.055, 0.02, MAT.redPlastic(), 0.74, 0.04, 0))
  const knob = cyl(0.028, 0.028, 0.03, MAT.redPlastic(), 14)
  knob.rotation.z = Math.PI / 2
  knob.position.set(0.82, 0.055, 0)
  pivot.add(knob)
  g.add(pivot)
  return { group: g, blade: pivot, shell, inner }
}

/** 立式方表（电流表 / 电压表）：浅灰紫底台 + 楔形后壳 + 白面板 + 表盘 + 玻璃 + 三柱 */
function buildMeter(w, h, kind, fs, subTicks) {
  const g = new THREE.Group()
  const W = w * SCALE // 1.3
  const H = h * SCALE // 1.52 / 1.33
  const D = 0.36
  const front = D / 2 // 面板前缘 z
  const shell = []

  // 内部：U 形磁铁 + 动圈 + 游丝（剖视时露出来，这就是真实电表的表头）
  const inner = new THREE.Group()
  inner.name = 'meter-inner'
  const mag = std('#4b5563', { roughness: 0.5, metalness: 0.35 })
  inner.add(box(W * 0.2, H * 0.3, 0.11, mag, -W * 0.26, H * 0.5, 0))
  inner.add(box(W * 0.2, H * 0.3, 0.11, mag, W * 0.26, H * 0.5, 0))
  inner.add(box(W * 0.5, 0.05, 0.1, mag, 0, H * 0.3, 0)) // 磁轭底部
  const coil = box(W * 0.34, H * 0.22, 0.05, std('#c67a35', { roughness: 0.5, metalness: 0.4 }), 0, H * 0.52, 0.03)
  inner.add(coil)
  for (const sx of [-1, 1]) {
    const sp = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.005, 6, 14), MAT.brass())
    sp.position.set(sx * W * 0.16, H * 0.4, 0.02)
    inner.add(sp)
  }
  inner.add(box(W * 0.7, 0.012, 0.012, MAT.copper(), 0, H * 0.24, 0.05))
  g.add(inner)

  // 底台：浅灰紫圆角板（实物表的底板比外壳大一圈，表放上去有"座"）
  g.add(rbox(W + 0.07, 0.05, D + 0.2, 0.022, std('#cfc9d8', { roughness: 0.58, metalness: 0.04 }), 0, 0.025, 0.03))

  // 楔形后壳：侧视是梯形 —— 前面全高，往后斜降约三分之一。
  // 直角方箱是"积木感"最重的一处：真实教学表的背壳一定是斜背的，便于仰视读数。
  const backRun = D * 1.06
  const sh = new THREE.Shape()
  sh.moveTo(0, 0)
  sh.lineTo(0, H)
  sh.lineTo(-backRun, H * 0.66)
  sh.lineTo(-backRun, 0)
  sh.lineTo(0, 0)
  const shellGeo = new THREE.ExtrudeGeometry(sh, {
    depth: W,
    bevelEnabled: true,
    bevelSize: 0.012,
    bevelThickness: 0.012,
    bevelSegments: 2,
    curveSegments: 6,
  })
  // rotateY(-90°) 把 shape 的 x 轴转到 -Z、挤出方向转到 X，然后把"前缘"推到 z = front
  shellGeo.rotateY(-Math.PI / 2)
  shellGeo.translate(W / 2, 0, front)
  const casing = new THREE.Mesh(shellGeo, MAT.bakelite())
  casing.castShadow = true
  casing.receiveShadow = true
  shell.push(casing)
  g.add(casing)

  // 前面板：白色塑料板（表盘、刻字、旋钮都装在它上面）
  const panelMesh = rbox(W * 0.994, H * 0.985, 0.05, 0.012, std('#f1efea', { roughness: 0.72 }), 0, H / 2 + 0.02, front + 0.005)
  shell.push(panelMesh)
  g.add(panelMesh)

  // 表盘平面（贴在白面板前面，朝 +Z —— 相机在 +Z 侧，能看到读数）
  const dialMat = std('#f2f0ea', { roughness: 0.85 })
  const dialTex = dialTexture(kind, fs, subTicks)
  if (dialTex) {
    dialMat.map = dialTex
    dialMat.needsUpdate = true // 赋值 map 后必须重编译，否则表格永远是一块灰板
  }
  const dial = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.84, H * 0.7), dialMat)
  dial.position.set(0, H * 0.585 + 0.02, front + 0.032)
  g.add(dial)

  // 玻璃面板：只压四条细边当边框 —— 千万别用实心 box 当"框"，
  // 否则它会把前面的表盘整个盖住（表盘看着就是一块黑板）。
  const frZ = front + 0.036
  const frW = W * 0.9
  const frH = H * 0.76
  const frY = H * 0.585 + 0.02
  const frMat = std('#20242a', { roughness: 0.5 })
  g.add(box(frW, 0.008, 0.006, frMat, 0, frY + frH / 2, frZ))
  g.add(box(frW, 0.008, 0.006, frMat, 0, frY - frH / 2, frZ))
  g.add(box(0.008, frH, 0.006, frMat, -frW / 2, frY, frZ))
  g.add(box(0.008, frH, 0.006, frMat, frW / 2, frY, frZ))
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 0.86, H * 0.72),
    std('#cfe0ef', { transparent: true, opacity: 0.09, roughness: 0.04, metalness: 0.25 })
  )
  glass.position.set(0, frY, front + 0.038)
  g.add(glass)

  // 指针：pivot 在表盘下缘中心，针绕 Z 转
  const pivot = new THREE.Group()
  pivot.position.set(0, H * 0.24, front + 0.042)
  const needle = box(0.016, H * 0.42, 0.007, std('#c0392b', { roughness: 0.35 }), 0, H * 0.21, 0)
  pivot.add(needle)
  // 针尖一小段更细，视觉上才像"针"而不是一根红条
  pivot.add(box(0.008, H * 0.1, 0.006, std('#b03028', { roughness: 0.35 }), 0, H * 0.42, 0))
  g.add(pivot)

  // 剖视时要临时隐掉表盘和玻璃，否则它们挡在动圈前面，透出来还是白的
  return { group: g, pointer: pivot, shell, inner, panel: [dial, glass] }
}

/** 滑动变阻器：深灰圆角底座 + 瓷管 + 连续镍铬丝 + 金属滑片 + 四柱 */
function buildRheostat(w, h) {
  const g = new THREE.Group()
  const W = w * SCALE // 1.9
  const shell = []
  // 底座（实物是深灰塑料座，四角有支撑）
  const base = rbox(W * 0.99, 0.062, 0.5, 0.022, std('#33383f', { roughness: 0.62, metalness: 0.05 }), 0, 0.031, 0.02)
  shell.push(base)
  g.add(base)

  // 瓷管（横躺）
  const tubeLen = 1.34
  const tubeY = 0.25
  const tubeZ = 0.02
  const tube = cyl(0.113, 0.113, tubeLen, MAT.ceramic(), 24)
  tube.rotation.z = Math.PI / 2
  tube.position.set(0, tubeY, tubeZ)
  shell.push(tube)
  g.add(tube)

  // 连续镍铬丝：一根螺旋管绕满瓷管（原来叠 26 个独立圆环，环间有空当，一眼假）
  const coilMat = std('#b6bcc4', { roughness: 0.32, metalness: 0.68 })
  // 密绕：圈距要贴近丝径，否则像一根弹簧而不是电阻丝绕线
  const winding = helixTube(0.119, -tubeLen / 2 + 0.06, tubeLen / 2 - 0.06, 72, 0.0078, coilMat)
  winding.rotation.z = -Math.PI / 2 // 轴从 +Y 放倒到 +X
  winding.position.set(0, tubeY, tubeZ)
  winding.castShadow = false
  g.add(winding)

  // 两端金属支架：夹住瓷管的环 + 立在底板上的脚
  for (const sx of [-1, 1]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.121, 0.012, 8, 20), MAT.steel())
    ring.rotation.y = Math.PI / 2
    ring.position.set(sx * (tubeLen / 2 - 0.02), tubeY, tubeZ)
    g.add(ring)
    g.add(box(0.035, 0.14, 0.16, MAT.steel(), sx * (tubeLen / 2 - 0.03), 0.12, tubeZ))
  }

  // 滑片：金属夹块骑在瓷管上（外部只改 position.x，±0.59 范围内滑动）
  const slider = new THREE.Group()
  slider.position.set(0, 0.36, tubeZ)
  slider.add(rbox(0.13, 0.14, 0.3, 0.014, MAT.steel(), 0, 0, 0.02))
  // 两片触指压在绕线上
  for (const sz of [-1, 1]) {
    slider.add(box(0.06, 0.16, 0.014, std('#9aa1aa', { roughness: 0.35, metalness: 0.6 }), 0, -0.13, sz * 0.1))
  }
  // 顶部压紧弹簧片
  slider.add(box(0.12, 0.016, 0.22, MAT.brass(), 0, 0.075, 0.02))
  // 红色胶木手柄（实物是侧面伸出的柄）
  const handle = cyl(0.028, 0.034, 0.18, MAT.redPlastic(), 14)
  handle.rotation.x = Math.PI / 2
  handle.position.set(0, 0.055, 0.2)
  slider.add(handle)
  g.add(slider)

  return { group: g, slider, shell }
}

/**
 * 按 TYPES[type].terminals 的像素坐标摆接线柱，位置与
 * three-render 的 attachHotspots 完全一致，保证"看得见的柱"就是"点得到的柱"。
 */
function placePosts(group, terminals, w, h, stand, thickness) {
  if (!terminals) return
  for (const tm of terminals) {
    const p = makePost(tm.id)
    const x = (tm.x - w / 2) * SCALE
    if (stand) {
      p.position.set(x, (h - (tm.y + 7)) * SCALE, thickness + 0.03)
      p.rotation.x = Math.PI / 2 // 柱头朝 +Z（从面板向外伸，与表盘同侧）
    } else {
      p.position.set(x, thickness + 0.03, (tm.y + 7 - h / 2) * SCALE)
    }
    p.userData.terminal = tm.id
    group.add(p)
  }
}

/**
 * 其余器材的通用实体：底座 + 主体 + 特征件。
 * 目标是"一眼看出是实物"，而不是 SVG 剪影挤出的平板；
 * 接线柱仍由 placePosts 按 TYPES 的像素坐标统一摆，保证点得到的柱就是看得见的柱。
 */

/** 引线类：电阻 / 二极管 / 保险丝 —— 底座 + 水平圆柱 + 特征环 + 铜引线 */
function buildLeadPart(w, h, kind) {
  const g = new THREE.Group()
  const baseH = 0.03
  g.add(box(w * 0.66 * SCALE, baseH, h * 0.26 * SCALE, MAT.darkPlastic(), 0, baseH / 2, 0))

  const r = Math.max(0.03, Math.min(w * 0.075, h * 0.06) * SCALE)
  const len = w * 0.52 * SCALE
  const yBody = baseH + r + 0.012
  const mat = kind === 'fuse' ? MAT.glass() : kind === 'diode' ? MAT.bakelite() : MAT.ceramic()
  const body = cyl(r, r, len, mat, 20)
  body.rotation.z = Math.PI / 2
  body.position.set(0, yBody, 0)
  g.add(body)

  if (kind === 'resistor') {
    const ringMat = [MAT.redPlastic(), MAT.darkPlastic(), MAT.brass(), MAT.bluePlastic()]
    const xs = [-0.30, -0.10, 0.10, 0.30]
    xs.forEach((f, i) => {
      const ring = cyl(r * 1.04, r * 1.04, 0.02, ringMat[i], 18)
      ring.rotation.z = Math.PI / 2
      ring.position.set(len * f, yBody, 0)
      g.add(ring)
    })
  }
  if (kind === 'fuse') {
    for (const f of [-0.5, 0.5]) {
      const cap = cyl(r * 1.1, r * 1.1, len * 0.16, MAT.steel(), 18)
      cap.rotation.z = Math.PI / 2
      cap.position.set(len * f, yBody, 0)
      g.add(cap)
    }
  }
  if (kind === 'diode') {
    const band = cyl(r * 1.06, r * 1.06, 0.018, MAT.steel(), 18)
    band.rotation.z = Math.PI / 2
    band.position.set(len * 0.34, yBody, 0)
    g.add(band)
  }
  for (const f of [-1, 1]) {
    const lead = cyl(0.012, 0.012, len * 0.46, MAT.copper(), 10)
    lead.rotation.z = Math.PI / 2
    lead.position.set(f * len * 0.72, yBody - r * 0.3, 0)
    g.add(lead)
  }
  return { group: g, thickness: yBody + r, stand: false, shell: body }
}

/** 方箱类：电阻箱 / 电能表 / 多用电表 / 继电器 / 家庭电源 —— 箱体 + 面板 + 旋钮 / 显示窗 */
function buildBoxUnit(w, h, o = {}) {
  const g = new THREE.Group()
  const W = w * 0.86 * SCALE
  const D = o.depth || 0.22
  const H = o.height || 0.2
  const y0 = 0.015
  const shell = box(W, H, D, o.mat || MAT.bakelite(), 0, y0 + H / 2, 0)
  g.add(shell)

  const panel = box(W * 0.92, H * 0.86, 0.014, o.panelMat || MAT.ceramic(), 0, y0 + H / 2, D / 2 + 0.008)
  g.add(panel)

  const knobs = o.knobs || 0
  for (let i = 0; i < knobs; i++) {
    const kx = W * (-0.28 + (i + 0.5) / Math.max(1, knobs) * 0.56)
    const k = cyl(0.045, 0.05, 0.045, MAT.darkPlastic(), 18)
    k.rotation.x = Math.PI / 2
    k.position.set(kx, y0 + H * 0.42, D / 2 + 0.03)
    g.add(k)
  }
  if (o.lcd) {
    const lc = box(
      W * 0.46,
      H * 0.3,
      0.01,
      std('#123125', { roughness: 0.35, emissive: new THREE.Color('#0d2c1f'), emissiveIntensity: 0.5 }),
      0,
      y0 + H * 0.66,
      D / 2 + 0.018
    )
    g.add(lc)
  }
  return { group: g, thickness: y0 + H + 0.035, stand: false, shell, panel }
}

/** 电动机：卧式圆柱机壳 + 两端盖 + 转轴 */
function buildMotor(w, h) {
  const g = new THREE.Group()
  const r = Math.min(w * 0.2, h * 0.26) * SCALE
  const L = w * 0.46 * SCALE
  const y = 0.015 + r
  const body = cyl(r, r, L, MAT.steel(), 24)
  body.rotation.z = Math.PI / 2
  body.position.set(0, y, 0)
  g.add(body)
  for (const f of [-1, 1]) {
    const cap = cyl(r * 1.04, r * 1.04, 0.028, MAT.bakelite(), 24)
    cap.rotation.z = Math.PI / 2
    cap.position.set(f * L * 0.5, y, 0)
    g.add(cap)
  }
  const shaft = cyl(0.02, 0.02, 0.13, MAT.steel(), 12)
  shaft.rotation.z = Math.PI / 2
  shaft.position.set(L * 0.5 + 0.075, y, 0)
  g.add(shaft)
  return { group: g, thickness: Math.max(0.13, y + r), stand: false, shell: body }
}

/** 焦耳管：底座 + 立式玻璃管 + 管内电阻丝 + 顶盖 */
function buildTube(w, h) {
  const g = new THREE.Group()
  const baseH = 0.03
  g.add(box(w * 0.6 * SCALE, baseH, h * 0.28 * SCALE, MAT.darkPlastic(), 0, baseH / 2, 0))
  const r = Math.min(w * 0.13, h * 0.13) * SCALE
  const H = h * 0.5 * SCALE
  const glass = cyl(r, r, H, MAT.glass(), 26)
  glass.position.set(0, baseH + H / 2, 0)
  g.add(glass)
  for (let i = 0; i < 7; i++) {
    const coil = new THREE.Mesh(
      new THREE.TorusGeometry(r * 0.56, 0.008, 6, 16),
      std('#c1440e', { roughness: 0.5 })
    )
    coil.rotation.x = Math.PI / 2
    coil.position.set(0, baseH + H * (0.28 + i * 0.075), 0)
    g.add(coil)
  }
  const cap = cyl(r * 1.06, r * 1.06, 0.03, MAT.bakelite(), 26)
  cap.position.set(0, baseH + H, 0)
  g.add(cap)
  return { group: g, thickness: 0.1, stand: false, shell: glass }
}

/** 验电器：底座 + 金属杆 + 两片金箔 + 玻璃罩 */
function buildElectroscope(w, h) {
  const g = new THREE.Group()
  const foot = cyl(w * 0.26 * SCALE, w * 0.3 * SCALE, 0.04, MAT.bakelite(), 24)
  foot.position.y = 0.02
  g.add(foot)
  const r = Math.min(w * 0.34, h * 0.34) * SCALE
  const H = h * 0.5 * SCALE
  const dome = cyl(r, r, H, MAT.glass(), 26)
  dome.position.set(0, 0.04 + H / 2, 0)
  g.add(dome)
  const rod = cyl(0.014, 0.014, H * 0.55, MAT.steel(), 12)
  rod.position.set(0, 0.04 + H * 0.72, 0)
  g.add(rod)
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), MAT.steel())
  knob.position.set(0, 0.04 + H, 0)
  g.add(knob)
  for (const f of [-1, 1]) {
    const foil = box(0.008, H * 0.26, 0.05, std('#e7c65a', { roughness: 0.35, metalness: 0.35 }), f * 0.02, 0.04 + H * 0.2, 0)
    foil.rotation.z = f * 0.22
    g.add(foil)
  }
  return { group: g, thickness: 0.1, stand: false, shell: dome }
}

/** 试电笔：细长笔杆 + 金属探针 + 氖泡窗 */
function buildTestPencil(w, h) {
  const g = new THREE.Group()
  const len = w * 0.78 * SCALE
  const y = 0.05
  const barrel = cyl(0.035, 0.035, len, std('#e8e4d8', { roughness: 0.5 }), 18)
  barrel.rotation.z = Math.PI / 2
  barrel.position.set(0, y, 0)
  g.add(barrel)
  const tip = cyl(0.014, 0.006, len * 0.22, MAT.steel(), 12)
  tip.rotation.z = Math.PI / 2
  tip.position.set(len * 0.6, y, 0)
  g.add(tip)
  const win = box(len * 0.12, 0.03, 0.05, std('#e2562f', { roughness: 0.4, emissive: new THREE.Color('#4a1206'), emissiveIntensity: 0.6 }), -len * 0.22, y + 0.03, 0.02)
  g.add(win)
  return { group: g, thickness: 0.09, stand: false, shell: barrel }
}

/** 单刀双掷开关：底板 + 中央刀 + 两个掷点 +
 *  （刀闸由 three-render 按 pos 驱动旋转，与 2D 的 pos 语义一致） */
function buildSwitch2(w, h) {
  const g = new THREE.Group()
  const bw = w * 0.72 * SCALE
  const bd = h * 0.36 * SCALE
  g.add(box(bw, 0.05, bd, MAT.bakelite(), 0, 0.025, 0))
  for (const f of [-1, 1]) {
    const stud = cyl(0.03, 0.03, 0.03, MAT.brass(), 14)
    stud.position.set(f * bw * 0.32, 0.06, 0)
    g.add(stud)
  }
  const pivot = new THREE.Group()
  pivot.position.set(-bw * 0.1, 0.055, 0)
  const blade = box(bw * 0.5, 0.012, 0.028, MAT.steel(), bw * 0.25, 0, 0)
  pivot.add(blade)
  const handle = new THREE.Mesh(new THREE.SphereGeometry(0.032, 14, 10), MAT.redPlastic())
  handle.position.set(bw * 0.5, 0, 0)
  pivot.add(handle)
  pivot.rotation.y = 0.34
  g.add(pivot)
  return { group: g, thickness: 0.09, stand: false, blade: pivot, shell: null }
}

function buildGeneric(type, w, h) {
  if (type.startsWith('resistor')) return buildLeadPart(w, h, 'resistor')
  switch (type) {
    case 'diode':
      return buildLeadPart(w, h, 'diode')
    case 'fuse':
      return buildLeadPart(w, h, 'fuse')
    case 'motor':
      return buildMotor(w, h)
    case 'jouleTube':
      return buildTube(w, h)
    case 'electroscope':
      return buildElectroscope(w, h)
    case 'testPencil':
      return buildTestPencil(w, h)
    case 'switch2':
      return buildSwitch2(w, h)
    case 'resBox':
      return buildBoxUnit(w, h, { knobs: 4, panelMat: MAT.ceramic(), height: 0.26 })
    case 'multimeter':
      return buildBoxUnit(w, h, { lcd: true, knobs: 1, mat: std('#2b2f36', { roughness: 0.6 }), height: 0.2, depth: 0.26 })
    case 'relay':
      return buildBoxUnit(w, h, { knobs: 2, height: 0.16 })
    case 'mains':
      return buildBoxUnit(w, h, { knobs: 2, panelMat: MAT.white(), height: 0.14 })
    case 'energyMeter':
      return buildBoxUnit(w, h, { knobs: 2, mat: std('#3a3f47', { roughness: 0.6 }), height: 0.24 })
    default:
      return null
  }
}

/**
 * 造一件实体器材。
 * @param {string} type 器材类型
 * @param {object} opt  { w, h, terminals, fs }
 * @returns {{ group, size, thickness, stand, pointer?, blade?, slider?, bulbMat?, glassMat? }}
 */
export function buildSolid(type, opt = {}) {
  const w = opt.w || 150
  const h = opt.h || 120
  const size = { w, h }
  const terms = opt.terminals || []

  switch (type) {
    case 'battery': {
      const b = buildBattery(w, h)
      const thickness = 0.52 // 壳顶面高度：柱脚要落在顶面上
      placePosts(b.group, terms, w, h, false, thickness)
      return { group: b.group, size, thickness, stand: false, shell: b.shell, inner: b.inner }
    }
    case 'bulb': {
      const b = buildBulb(w, h)
      // 柱脚必须落在底板面上（板厚 0.045），否则柱子会浮在板子上方
      const thickness = 0.045
      placePosts(b.group, terms, w, h, false, thickness)
      return {
        group: b.group, size, thickness, stand: false,
        bulbMat: b.bulbMat, glassMat: b.glassMat, shell: b.shell,
      }
    }
    case 'switch': {
      const b = buildSwitch(w, h)
      const thickness = 0.06
      placePosts(b.group, terms, w, h, false, thickness)
      return { group: b.group, size, thickness, stand: false, blade: b.blade, shell: b.shell, inner: b.inner }
    }
    case 'ammeter':
    case 'voltmeter': {
      const kind = type === 'ammeter' ? 'A' : 'V'
      const fs = opt.fs || (type === 'ammeter' ? 3 : 15)
      const b = buildMeter(w, h, kind, fs, 30)
      const thickness = 0.18 // 半深：表壳厚 0.36，柱在表面前缘外 0.03
      placePosts(b.group, terms, w, h, true, thickness)
      return {
        group: b.group,
        size,
        thickness,
        stand: true,
        pointer: b.pointer,
        postZ: thickness + 0.03, // 面板朝 +Z，热区/导线端点用同一个 z
        shell: b.shell,
        inner: b.inner,
        panel: b.panel,
      }
    }
    case 'rheostat': {
      const b = buildRheostat(w, h)
      const thickness = 0.07
      placePosts(b.group, terms, w, h, false, thickness)
      return { group: b.group, size, thickness, stand: false, slider: b.slider, shell: b.shell }
    }
    default: {
      // 其余器材：底座 + 主体 + 特征件的通用实体（不再是 SVG 剪影挤出）
      const b = buildGeneric(type, w, h)
      if (!b) return null
      placePosts(b.group, terms, w, h, b.stand === true, b.thickness)
      return b
    }
  }
}

export const SOLID_TYPES = new Set([
  'battery', 'bulb', 'switch', 'ammeter', 'voltmeter', 'rheostat',
  'switch2', 'motor', 'diode', 'fuse', 'testPencil', 'electroscope',
  'mains', 'energyMeter', 'jouleTube', 'resBox', 'multimeter', 'relay',
])
export { SCALE as SOLID_SCALE }

/* ── 侧栏图标：把同一套实体渲染成透明底 PNG ── */
let _iconR = null

/**
 * 渲染一件实体的透明底缩略图，用于 3D 模式下左侧「元件库」的 3D 图标。
 * @param {string} type
 * @param {{w:number,h:number,terminals?:Array,fs?:number,size?:number}} opt
 * @returns {string} dataURL
 */
export function renderIcon(type, opt = {}) {
  const size = opt.size || 132
  if (!_iconR) {
    _iconR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    _iconR.setPixelRatio(1)
  }
  _iconR.setSize(size, size, false)
  _iconR.setClearColor(0x000000, 0)

  const scene = new THREE.Scene()
  scene.add(new THREE.AmbientLight(0xffffff, 1.0))
  const key = new THREE.DirectionalLight(0xffffff, 1.5)
  key.position.set(2.5, 4.5, 3.5)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xffffff, 0.7)
  fill.position.set(-3, 2.5, 1.5)
  scene.add(fill)

  const b = buildSolid(type, opt)
  if (!b) return ''
  scene.add(b.group)

  const bb = new THREE.Box3().setFromObject(b.group)
  const c = bb.getCenter(new THREE.Vector3())
  const sz = bb.getSize(new THREE.Vector3())
  const radius = Math.max(sz.x, sz.y, sz.z) * 0.92 + 0.12

  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 80)
  // 立式表用更正的机位（看清读数），其余用等轴俯视
  const dir = b.stand ? new THREE.Vector3(0.18, 0.22, 1) : new THREE.Vector3(0.55, 0.62, 0.85)
  dir.normalize()
  const dist = radius / Math.sin((30 * Math.PI) / 180 / 2) * 0.5 + radius * 0.4
  cam.position.copy(c).add(dir.multiplyScalar(dist))
  cam.lookAt(c)

  _iconR.render(scene, cam)
  const url = _iconR.domElement.toDataURL('image/png')

  // 释放本次临时场景
  scene.traverse((o) => {
    if (o.geometry) o.geometry.dispose()
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
    for (const m of mats) {
      if (m.map) m.map.dispose()
      m.dispose()
    }
  })
  return url
}
