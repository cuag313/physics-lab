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

/** 电池组：蓝色塑料壳 + 顶面铭牌 + 正负极铜柱；壳内是三节干电池 */
function buildBattery(w, h) {
  const g = new THREE.Group()
  const bw = 1.24
  const bd = 1.02
  const bh = 0.42
  const shell = []

  // 内部：三节干电池（剖视时露出来）
  const inner = new THREE.Group()
  inner.name = 'battery-inner'
  for (let i = 0; i < 3; i++) {
    const cell = cyl(0.11, 0.11, 0.62, std('#1f2937', { roughness: 0.55, metalness: 0.25 }), 18)
    cell.rotation.z = Math.PI / 2
    cell.position.set(0, 0.02 + bh / 2, -0.24 + i * 0.24)
    inner.add(cell)
    // 正极铜帽 + 负极锌壳环
    const cap = cyl(0.075, 0.075, 0.03, MAT.brass(), 14)
    cap.rotation.z = Math.PI / 2
    cap.position.set(0.3, 0.02 + bh / 2, -0.24 + i * 0.24)
    inner.add(cap)
    const band = cyl(0.112, 0.112, 0.16, std('#d9b44a', { roughness: 0.5 }), 16)
    band.rotation.z = Math.PI / 2
    band.position.set(-0.15, 0.02 + bh / 2, -0.24 + i * 0.24)
    inner.add(band)
  }
  // 内部导线（串联）
  const lead = box(0.5, 0.02, 0.02, MAT.copper(), -0.1, 0.02 + bh * 0.78, 0)
  inner.add(lead)
  g.add(inner)

  // 壳身（底 + 顶盖 + 侧面浅色条）
  const bodyMesh = box(bw, bh, bd, MAT.bluePlastic(), 0, 0.02 + bh / 2, 0)
  shell.push(bodyMesh)
  const topMesh = box(bw - 0.05, 0.06, bd - 0.05, std('#eef2f7', { roughness: 0.8 }), 0, 0.02 + bh + 0.02, 0)
  shell.push(topMesh)
  // 顶面铭牌（白底 + 象征性正负极）
  g.add(box(0.42, 0.008, 0.3, MAT.white(), -0.26, 0.02 + bh + 0.05, -0.22))
  g.add(box(0.42, 0.008, 0.3, std('#f0d9a0'), 0.26, 0.02 + bh + 0.05, -0.22))
  // 侧面加强筋（让轮廓不是一块死板）
  for (const sx of [-1, 1]) {
    const rib = box(0.04, bh - 0.08, bd - 0.12, std('#244c8e'), sx * (bw / 2 - 0.02), 0.02 + bh / 2, 0)
    shell.push(rib)
  }
  for (const m of shell) g.add(m)
  return { group: g, shell, inner }
}

/** 小灯泡：台板 + 白瓷灯座 + 金属螺口 + 玻璃泡 + 灯丝 */
function buildBulb(w, h) {
  const g = new THREE.Group()
  const shell = []
  // 台板
  const base = box(w * SCALE * 0.96, 0.05, 0.56, MAT.darkPlastic(), 0, 0.025, 0)
  shell.push(base)
  // 白瓷灯座
  const socket = cyl(0.155, 0.19, 0.22, MAT.ceramic(), 24)
  socket.position.y = 0.16
  shell.push(socket)
  // 金属螺口
  const screw = cyl(0.1, 0.112, 0.1, MAT.steel(), 20)
  screw.position.y = 0.32
  shell.push(screw)
  for (const m of shell) g.add(m)
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
  return { group: g, bulbMat: filMat, glassMat, shell }
}

/** 单刀开关：胶木底座 + 铰链 + 可动刀片 + 手柄 */
function buildSwitch(w, h) {
  const g = new THREE.Group()
  const shell = []
  const base = box(w * SCALE * 0.94, 0.06, 0.62, MAT.bakelite(), 0, 0.03, 0)
  shell.push(base)
  g.add(base)
  // 内部：底座下的两块静触点与引线（剖视时露出来）
  const inner = new THREE.Group()
  inner.name = 'switch-inner'
  for (const sx of [-1, 1]) {
    inner.add(box(0.1, 0.03, 0.12, MAT.brass(), sx * 0.42, 0.02, 0))
    inner.add(box(0.5, 0.012, 0.012, MAT.copper(), sx * 0.14, 0.02, 0))
  }
  g.add(inner)
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
  return { group: g, blade: pivot, shell, inner }
}

/** 立式方表（电流表 / 电压表）：胶木表壳 + 表盘 + 玻璃 + 可转指针 + 三柱 */
function buildMeter(w, h, kind, fs, subTicks) {
  const g = new THREE.Group()
  const W = w * SCALE // 1.3
  const H = h * SCALE // 1.52 / 1.33
  const D = 0.36
  const shell = []

  // 内部：U 形磁铁 + 动圈 + 游丝（剖视时露出来，这就是真实电表的表头）
  const inner = new THREE.Group()
  inner.name = 'meter-inner'
  const mag = std('#4b5563', { roughness: 0.5, metalness: 0.35 })
  // 两块磁极（U 形磁铁的左右极掌）
  inner.add(box(W * 0.2, H * 0.3, 0.11, mag, -W * 0.26, H * 0.5, 0))
  inner.add(box(W * 0.2, H * 0.3, 0.11, mag, W * 0.26, H * 0.5, 0))
  inner.add(box(W * 0.5, 0.05, 0.1, mag, 0, H * 0.3, 0)) // 磁轭底部
  // 动圈（铜色扁框，指针挂在它上面）
  const coil = box(W * 0.34, H * 0.22, 0.05, std('#c67a35', { roughness: 0.5, metalness: 0.4 }), 0, H * 0.52, 0.03)
  inner.add(coil)
  // 游丝（两根细螺旋，用扁环示意）
  for (const sx of [-1, 1]) {
    const sp = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.005, 6, 14), MAT.brass())
    sp.position.set(sx * W * 0.16, H * 0.4, 0.02)
    inner.add(sp)
  }
  // 内部接线（柱 → 动圈）
  inner.add(box(W * 0.7, 0.012, 0.012, MAT.copper(), 0, H * 0.24, 0.05))
  g.add(inner)

  // 表壳（前面朝 -Z）
  const casing = box(W, H, D, MAT.bakelite(), 0, H / 2 + 0.02, 0)
  shell.push(casing)
  // 表壳侧面浅色描边（增加层次）
  shell.push(box(W + 0.02, 0.03, D + 0.02, std('#4a5058'), 0, 0.035, 0))
  for (const m of shell) g.add(m)

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

  // 剖视时要临时隐掉表盘和玻璃，否则它们挡在动圈前面，透出来还是白的
  return { group: g, pointer: pivot, shell, inner, panel: [dial, glass] }
}

/** 滑动变阻器：底座 + 瓷管 + 绕线 + 滑片 + 四柱 */
function buildRheostat(w, h) {
  const g = new THREE.Group()
  const W = w * SCALE // 1.9
  const shell = []
  const base = box(W * 0.98, 0.07, 0.5, MAT.bakelite(), 0, 0.035, 0)
  shell.push(base)
  g.add(base)

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
      const thickness = 0.44
      placePosts(b.group, terms, w, h, false, thickness)
      return { group: b.group, size, thickness, stand: false, shell: b.shell, inner: b.inner }
    }
    case 'bulb': {
      const b = buildBulb(w, h)
      const thickness = 0.07
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
