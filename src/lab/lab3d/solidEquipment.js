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

/** 接线柱：铜柱 + 顶部压环，柱高 0.16，保证导线端点扎眼可见 */
function makePost(material = MAT.copper()) {
  const g = new THREE.Group()
  const body = cyl(0.035, 0.045, 0.16, material)
  body.position.y = 0.08
  g.add(body)
  const cap = cyl(0.055, 0.05, 0.02, MAT.brass(), 16)
  cap.position.y = 0.17
  g.add(cap)
  g.userData.role = 'post'
  return g
}

/** 表盘贴图：canvas 画刻度 + 文字，比光栅化 SVG 更清晰也更省 */
function dialTexture(kind, fs, subTicks) {
  const W = 256
  const H = 256
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const g = cv.getContext('2d')
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

/** 电池组：蓝色塑料壳 + 顶面铭牌 + 正负极铜柱 */
function buildBattery(w, h) {
  const g = new THREE.Group()
  const bw = 1.24
  const bd = 1.02
  const bh = 0.42

  // 壳身（底 + 顶盖 + 侧面浅色条）
  g.add(box(bw, bh, bd, MAT.bluePlastic(), 0, 0.02 + bh / 2, 0))
  g.add(box(bw - 0.05, 0.06, bd - 0.05, std('#eef2f7', { roughness: 0.8 }), 0, 0.02 + bh + 0.02, 0))
  // 顶面铭牌（白底 + 象征性正负极）
  g.add(box(0.42, 0.008, 0.3, MAT.white(), -0.26, 0.02 + bh + 0.05, -0.22))
  g.add(box(0.42, 0.008, 0.3, std('#f0d9a0'), 0.26, 0.02 + bh + 0.05, -0.22))
  // 侧面加强筋（让轮廓不是一块死板）
  for (const sx of [-1, 1]) {
    g.add(box(0.04, bh - 0.08, bd - 0.12, std('#244c8e'), sx * (bw / 2 - 0.02), 0.02 + bh / 2, 0))
  }
  return g
}

/** 小灯泡：台板 + 白瓷灯座 + 金属螺口 + 玻璃泡 + 灯丝 */
function buildBulb(w, h) {
  const g = new THREE.Group()
  // 台板
  g.add(box(w * SCALE * 0.96, 0.05, 0.56, MAT.darkPlastic(), 0, 0.025, 0))
  // 白瓷灯座
  const socket = cyl(0.155, 0.19, 0.22, MAT.ceramic(), 24)
  socket.position.y = 0.16
  g.add(socket)
  // 金属螺口
  const screw = cyl(0.1, 0.112, 0.1, MAT.steel(), 20)
  screw.position.y = 0.32
  g.add(screw)
  // 玻璃泡（顶部球 + 下收口）
  const glassMat = MAT.glass()
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.245, 28, 20), glassMat)
  globe.position.y = 0.58
  globe.castShadow = false
  g.add(globe)
  const neck = cyl(0.112, 0.1, 0.11, glassMat, 18)
  neck.position.y = 0.39
  neck.castShadow = false
  g.add(neck)
  // 灯丝（极细环 + 发光材质，随便亮度改 emissive）
  const filMat = std('#6b3a17', {
    emissive: new THREE.Color('#ff9a3c'),
    emissiveIntensity: 0,
    roughness: 0.4,
  })
  const fil = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.008, 8, 16), filMat)
  fil.position.y = 0.56
  fil.rotation.x = Math.PI / 2
  g.add(fil)
  // 两根引线
  for (const sx of [-1, 1]) {
    const lead = cyl(0.007, 0.007, 0.16, MAT.steel(), 6)
    lead.position.set(sx * 0.042, 0.44, 0)
    g.add(lead)
  }
  return { group: g, bulbMat: filMat, glassMat }
}

/** 单刀开关：胶木底座 + 铰链 + 可动刀片 + 手柄 */
function buildSwitch(w, h) {
  const g = new THREE.Group()
  g.add(box(w * SCALE * 0.94, 0.06, 0.62, MAT.bakelite(), 0, 0.03, 0))
  // 两端刀座
  for (const sx of [-1, 1]) {
    g.add(box(0.12, 0.12, 0.16, MAT.brass(), sx * 0.42, 0.12, 0))
  }
  // 刀片（绕左端铰链转动）
  const pivot = new THREE.Group()
  pivot.position.set(-0.42, 0.19, 0)
  const blade = box(0.84, 0.035, 0.075, MAT.steel(), 0.42, 0, 0)
  pivot.add(blade)
  // 手柄（绝缘小球）
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), MAT.redPlastic())
  knob.position.set(0.78, 0.04, 0)
  pivot.add(knob)
  g.add(pivot)
  return { group: g, blade: pivot }
}

/** 立式方表（电流表 / 电压表）：胶木表壳 + 表盘 + 玻璃 + 可转指针 + 三柱 */
function buildMeter(w, h, kind, fs, subTicks) {
  const g = new THREE.Group()
  const W = w * SCALE // 1.3
  const H = h * SCALE // 1.52 / 1.33
  const D = 0.36

  // 表壳（前面朝 -Z）
  g.add(box(W, H, D, MAT.bakelite(), 0, H / 2 + 0.02, 0))
  // 表壳侧面浅色描边（增加层次）
  g.add(box(W + 0.02, 0.03, D + 0.02, std('#4a5058'), 0, 0.035, 0))

  // 表盘平面（贴在表壳前表面外一点，朝 +Z —— 相机在 +Z 侧，能看到读数）
  const dialMat = std('#f2f0ea', { roughness: 0.85 })
  dialMat.map = dialTexture(kind, fs, subTicks)
  dialMat.needsUpdate = true // 赋值 map 后必须重编译，否则表格永远是一块灰板
  const dial = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.86, H * 0.72), dialMat)
  dial.position.set(0, H * 0.58 + 0.02, D / 2 + 0.008)
  g.add(dial)

  // 玻璃面板
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 0.92, H * 0.8),
    std('#cfe0ef', { transparent: true, opacity: 0.1, roughness: 0.05, metalness: 0.2 })
  )
  glass.position.set(0, H * 0.58 + 0.02, D / 2 + 0.022)
  g.add(glass)

  // 指针：pivot 在表盘下缘中心，针绕 Z 转
  const pivot = new THREE.Group()
  pivot.position.set(0, H * 0.24, D / 2 + 0.016)
  const needle = box(0.018, H * 0.44, 0.008, std('#c0392b', { roughness: 0.35 }), 0, H * 0.22, 0)
  pivot.add(needle)
  g.add(pivot)

  return { group: g, pointer: pivot }
}

/** 滑动变阻器：底座 + 瓷管 + 绕线 + 滑片 + 四柱 */
function buildRheostat(w, h) {
  const g = new THREE.Group()
  const W = w * SCALE // 1.9
  g.add(box(W * 0.98, 0.07, 0.5, MAT.bakelite(), 0, 0.035, 0))

  // 瓷管（横躺）
  const tubeLen = 1.34
  const tube = cyl(0.115, 0.115, tubeLen, MAT.ceramic(), 20)
  tube.rotation.z = Math.PI / 2
  tube.position.set(0, 0.25, 0.02)
  g.add(tube)

  // 绕线：26 圈铜环
  const turns = 26
  const step = (tubeLen - 0.16) / turns
  const wireMat = MAT.copper()
  for (let i = 0; i < turns; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.118, 0.011, 6, 14), wireMat)
    ring.rotation.y = Math.PI / 2
    ring.position.set(-tubeLen / 2 + 0.08 + i * step, 0.25, 0.02)
    ring.castShadow = false
    g.add(ring)
  }

  // 上导轨（两根金属杆，滑片在上面滑）
  for (const sz of [-1, 1]) {
    const rod = cyl(0.018, 0.018, W * 0.9, MAT.steel(), 10)
    rod.rotation.z = Math.PI / 2
    rod.position.set(0, 0.44, sz * 0.16)
    g.add(rod)
  }

  // 滑片
  const slider = box(0.1, 0.22, 0.34, MAT.steel(), 0, 0.36, 0.02)
  g.add(slider)

  return { group: g, slider }
}

/**
 * 按 TYPES[type].terminals 的像素坐标摆接线柱，位置与
 * three-render 的 attachHotspots 完全一致，保证"看得见的柱"就是"点得到的柱"。
 */
function placePosts(group, terminals, w, h, stand, thickness) {
  if (!terminals) return
  for (const tm of terminals) {
    const p = makePost()
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
      const thickness = 0.44
      placePosts(b, terms, w, h, false, thickness)
      return { group: b, size, thickness, stand: false }
    }
    case 'bulb': {
      const b = buildBulb(w, h)
      const thickness = 0.07
      placePosts(b.group, terms, w, h, false, thickness)
      return { group: b.group, size, thickness, stand: false, bulbMat: b.bulbMat, glassMat: b.glassMat }
    }
    case 'switch': {
      const b = buildSwitch(w, h)
      const thickness = 0.06
      placePosts(b.group, terms, w, h, false, thickness)
      return { group: b.group, size, thickness, stand: false, blade: b.blade }
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
      }
    }
    case 'rheostat': {
      const b = buildRheostat(w, h)
      const thickness = 0.07
      placePosts(b.group, terms, w, h, false, thickness)
      return { group: b.group, size, thickness, stand: false, slider: b.slider }
    }
    default:
      return null
  }
}

export const SOLID_TYPES = new Set(['battery', 'bulb', 'switch', 'ammeter', 'voltmeter', 'rheostat'])
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
