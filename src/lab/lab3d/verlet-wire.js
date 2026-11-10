/**
 * verlet-wire.js — 3D 下垂软导线（Verlet 粒子弹簧链）
 *
 * 替代旧的点状连线：一根导线 = 一串 Verlet 粒子 + 距离约束（弹簧链），
 * 在重力下自然下垂；两端钉在器材接线柱上，台面旋转/器材拖动时端点移动、
 * 链条自动跟随形变。**不使用任何贝塞尔曲线**——形状完全由物理松弛决定。
 *
 * 渲染用预分配的管状网格（TubeRibbon）：每帧原位改写顶点/法线，
 * 不产生垃圾回收；静止后跳过更新。
 *
 * 实物化要点（对照实验室里的香蕉插头导线）：
 *   1) 截面 12 边 + 沿程 Catmull-Rom 重采样（每段再插 3 个点），
 *      否则 18 个粒子撑出来的管子是"多段折线 + 七边形截面"，近看全是棱；
 *   2) 两端各挂一个香蕉插头：黄铜细杆插进接线柱，外面一段彩色塑料手柄，
 *      这样线是"插"在柱上的，而不是从柱子里长出来；
 *   3) 绝缘皮按 PVC 的哑光给（roughness .62 / metalness .04），
 *      原来那种半金属高光看着像塑料管。
 */

import * as THREE from 'three'

const _t0 = new THREE.Vector3()
const _t1 = new THREE.Vector3()
const _n0 = new THREE.Vector3()
const _b0 = new THREE.Vector3()
const _axis = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _v = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)

/** 预分配管状网格：环数=segments+1，每环 radial+1 顶点 */
function createTubeGeometry(segments, radial) {
  const ringVerts = radial + 1
  const vertCount = (segments + 1) * ringVerts
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertCount * 3), 3))
  geom.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(vertCount * 3), 3))
  const uvs = new Float32Array(vertCount * 2)
  for (let i = 0; i <= segments; i++) {
    for (let j = 0; j <= radial; j++) {
      const k = (i * ringVerts + j) * 2
      uvs[k] = i / segments
      uvs[k + 1] = j / radial
    }
  }
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  const idx = []
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * ringVerts + j
      const b = (i + 1) * ringVerts + j
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  geom.setIndex(idx)
  return geom
}

/**
 * 用折线点串原位改写管状网格顶点（平行传输标架，无扭曲）。
 * @param {THREE.BufferGeometry} geom createTubeGeometry 的产物
 * @param {THREE.Vector3[]} pts 折线点（≥2）
 * @param {number} radius 管半径
 * @param {number} radial 圆周段数
 */
function updateTubeGeometry(geom, pts, radius, radial) {
  const n = pts.length
  const ringVerts = radial + 1
  const posAttr = geom.attributes.position
  const norAttr = geom.attributes.normal
  const pos = posAttr.array
  const nor = norAttr.array

  let prevNormal = null
  let prevTangent = null
  for (let i = 0; i < n; i++) {
    // 切向（中心差分）
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(n - 1, i + 1)]
    _t0.subVectors(b, a)
    if (_t0.lengthSq() < 1e-12) _t0.set(0, 0, 1)
    _t0.normalize()

    // 平行传输：把上一环的法线旋到本环切向
    if (!prevNormal) {
      _n0.set(0, 1, 0)
      if (Math.abs(_t0.dot(_n0)) > 0.94) _n0.set(1, 0, 0)
      _n0.crossVectors(_t0, _n0).normalize()
    } else {
      _axis.crossVectors(prevTangent, _t0)
      const s = _axis.length()
      if (s < 1e-8) {
        _n0.copy(prevNormal)
      } else {
        _axis.multiplyScalar(1 / s)
        const ang = Math.atan2(s, prevTangent.dot(_t0))
        _q.setFromAxisAngle(_axis, ang)
        _n0.copy(prevNormal).applyQuaternion(_q).normalize()
      }
    }
    _b0.crossVectors(_t0, _n0).normalize()

    const p = pts[i]
    for (let j = 0; j <= radial; j++) {
      const ang = (j / radial) * Math.PI * 2
      const cx = Math.cos(ang), sy = Math.sin(ang)
      // 法向 = cos·N + sin·B
      const nx = _n0.x * cx + _b0.x * sy
      const ny = _n0.y * cx + _b0.y * sy
      const nz = _n0.z * cx + _b0.z * sy
      const k = (i * ringVerts + j) * 3
      pos[k] = p.x + nx * radius
      nor[k] = nx
      pos[k + 1] = p.y + ny * radius
      nor[k + 1] = ny
      pos[k + 2] = p.z + nz * radius
      nor[k + 2] = nz
    }
    prevNormal = _n0.clone()
    prevTangent = _t0.clone()
  }
  posAttr.needsUpdate = true
  norAttr.needsUpdate = true
}

/** Catmull-Rom：把稀疏粒子串插成平滑折线（输出到预分配数组，不产生垃圾） */
function resampleCatmull(pts, sub, out) {
  const n = pts.length
  let k = 0
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(n - 1, i + 2)]
    for (let s = 0; s < sub; s++) {
      const t = s / sub
      const t2 = t * t
      const t3 = t2 * t
      const o = out[k++]
      o.x = 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3)
      o.y = 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
      o.z = 0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3)
    }
  }
  out[k].copy(pts[n - 1])
}

/* ── 香蕉插头：黄铜细杆 + 彩色塑料手柄（共享几何/材质，按线色缓存）── */
const PLUG_TIP_GEO = new THREE.CylinderGeometry(0.0135, 0.0118, 0.058, 10)
const PLUG_SHOULDER_GEO = new THREE.CylinderGeometry(0.0265, 0.0265, 0.012, 12)
const PLUG_BODY_GEO = new THREE.CylinderGeometry(0.0275, 0.0295, 0.072, 12)
const PLUG_METAL = new THREE.MeshStandardMaterial({
  color: '#c9a53c',
  metalness: 0.92,
  roughness: 0.26,
})
const _plugMats = new Map()
function plugBodyMaterial(color) {
  const key = String(color)
  let m = _plugMats.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: key, roughness: 0.5, metalness: 0.04 })
    _plugMats.set(key, m)
  }
  return m
}
function makePlug(color) {
  const g = new THREE.Group()
  const tip = new THREE.Mesh(PLUG_TIP_GEO, PLUG_METAL)
  tip.position.y = 0.029 // +Y = 插入接线柱的一侧
  const shoulder = new THREE.Mesh(PLUG_SHOULDER_GEO, PLUG_METAL)
  const body = new THREE.Mesh(PLUG_BODY_GEO, plugBodyMaterial(color))
  body.position.y = -0.042
  g.add(tip, shoulder, body)
  g.userData.role = 'plug'
  return g
}

/**
 * 一根软导线：Verlet 链 + 管状网格。
 *
 * 用法（挂在 labTableGroup 下，坐标为组内局部坐标）：
 *   const w = new VerletWire({ color })
 *   group.add(w.mesh)
 *   每帧：w.pin(a, b)；w.simulate(gravity, dt)
 */
export class VerletWire {
  /**
   * @param {object} [opt]
   * @param {number} [opt.count=26] 粒子数（越多弯得越顺）
   * @param {string} [opt.color='#c0392b'] 线色
   * @param {number} [opt.radius=0.045] 管半径（世界单位，≈4.5mm 线径的一半）
   * @param {number} [opt.slack=1.28] 松弛系数（rest = 弦长×slack/(count-1)，>1 允许下垂）
   * @param {number} [opt.radial=12] 管截面段数
   * @param {number} [opt.sub=3] 每段再插几个点做 Catmull-Rom 平滑
   */
  constructor(opt = {}) {
    const count = opt.count ?? 26
    this.count = count
    this.radius = opt.radius ?? 0.045
    this.slack = opt.slack ?? 1.28
    this.radial = opt.radial ?? 12
    this.sub = opt.sub ?? 3
    this.damping = 0.985

    // Verlet 粒子
    this.pos = []
    this.prev = []
    this._last = [] // 上次上传网格的坐标（静止判定基准）
    for (let i = 0; i < count; i++) {
      this.pos.push(new THREE.Vector3())
      this.prev.push(new THREE.Vector3())
      this._last.push(new THREE.Vector3())
    }
    this.restLen = 0.1
    this._pinA = new THREE.Vector3()
    this._pinB = new THREE.Vector3()
    this._dirty = true

    // 平滑后的渲染点（预分配，避免每帧建数组）
    const segs = (count - 1) * this.sub
    this._smooth = []
    for (let i = 0; i <= segs; i++) this._smooth.push(new THREE.Vector3())

    // 管状网格（预分配，改线不重建）
    this.geometry = createTubeGeometry(segs, this.radial)
    this.material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(opt.color ?? '#c0392b'),
      // PVC 绝缘皮：哑光，几乎无金属感
      roughness: 0.62,
      metalness: 0.04,
      emissive: new THREE.Color('#000000'),
    })
    this.mesh = new THREE.Mesh(this.geometry, this.material)
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    // 顶点每帧被重写，但包围球不会跟着更新：若开启视锥剔除，three 会拿初始
    // （全零坐标）的包围球做判断，导线一离开原点就被整个剔掉——表现就是"线都没连"。
    this.mesh.frustumCulled = false
    this.mesh.userData.role = 'wire'

    // 两端香蕉插头（尖端朝接线柱、手柄朝线身）
    this.plugs = [makePlug(opt.color ?? '#c0392b'), makePlug(opt.color ?? '#c0392b')]
    this.mesh.add(this.plugs[0], this.plugs[1])
  }

  /**
   * 钉住两端（局部坐标）。
   * @param {THREE.Vector3} a
   * @param {THREE.Vector3} b
   */
  pin(a, b) {
    this._pinA.copy(a)
    this._pinB.copy(b)
  }

  /** 首次（或端点大幅变化后）沿弦线铺粒子，留松弛量供下垂 */
  reseed() {
    const n = this.count
    const dist = this._pinA.distanceTo(this._pinB) || 1e-6
    this.restLen = (dist * this.slack) / (n - 1)
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1)
      const p = this.pos[i]
      p.lerpVectors(this._pinA, this._pinB, t)
      // 初始给一点下垂，避免直挺挺
      p.y -= Math.sin(Math.PI * t) * Math.min(0.45, dist * 0.1)
      this.prev[i].copy(p)
    }
    this._dirty = true
  }

  /** 插头跟着端点走，尖端始终朝着接线柱 */
  _updatePlugs() {
    const n = this.count
    // A 端：杆朝柱（= 远离线身），手柄朝线
    _v.subVectors(this.pos[1], this.pos[0])
    if (_v.lengthSq() < 1e-12) _v.set(0, 1, 0)
    _v.normalize().negate()
    this.plugs[0].quaternion.copy(_q.setFromUnitVectors(UP, _v))
    this.plugs[0].position.copy(this.pos[0])

    // B 端同理
    _v.subVectors(this.pos[n - 2], this.pos[n - 1])
    if (_v.lengthSq() < 1e-12) _v.set(0, 1, 0)
    _v.normalize().negate()
    this.plugs[1].quaternion.copy(_q.setFromUnitVectors(UP, _v))
    this.plugs[1].position.copy(this.pos[n - 1])
  }

  /**
   * Verlet 积分 + 距离约束松弛。
   * @param {THREE.Vector3} gravity 重力加速度（局部坐标，含转台姿态）
   * @param {number} dt 秒
   */
  simulate(gravity, dt) {
    const n = this.count
    const dt2 = dt * dt
    // 积分（端点除外）
    for (let i = 1; i < n - 1; i++) {
      const p = this.pos[i], q = this.prev[i]
      const vx = (p.x - q.x) * this.damping
      const vy = (p.y - q.y) * this.damping
      const vz = (p.z - q.z) * this.damping
      q.copy(p)
      p.x += vx + gravity.x * dt2
      p.y += vy + gravity.y * dt2
      p.z += vz + gravity.z * dt2
      // 桌面是实心的：下垂到台面就停住，否则粒子会穿到桌面下方被挡住，
      // 视觉上整根导线"消失"（表现为"线都没连接"）。
      if (p.y < 0.02) {
        p.y = 0.02
        q.y = Math.max(q.y, 0.02)
      }
    }
    // 端点钉死（prev 同步，避免下帧误判“有位移”）
    this.pos[0].copy(this._pinA)
    this.pos[n - 1].copy(this._pinB)
    this.prev[0].copy(this._pinA)
    this.prev[n - 1].copy(this._pinB)

    // 距离约束（多次松弛，端点固定）
    const rest = this.restLen
    for (let it = 0; it < 6; it++) {
      for (let i = 0; i < n - 1; i++) {
        const p = this.pos[i], q = this.pos[i + 1]
        _t1.subVectors(q, p)
        const d = _t1.length() || 1e-6
        const diff = (d - rest) / d
        const wa = i === 0 ? 0 : 0.5
        const wb = i + 1 === n - 1 ? 0 : 0.5
        const sum = wa + wb
        if (sum === 0) continue
        p.addScaledVector(_t1, (diff * wa) / sum)
        q.addScaledVector(_t1, (-diff * wb) / sum)
      }
      this.pos[0].copy(this._pinA)
      this.pos[n - 1].copy(this._pinB)
    }

    // 与「上次上传到网格」的坐标比对：单步再小，累积漂移也要刷新
    let moved = this._dirty
    for (let i = 0; i < n; i++) {
      if (this.pos[i].distanceToSquared(this._last[i]) > 1e-5) { moved = true; break }
    }
    if (moved) {
      // 先在粒子串上做 Catmull-Rom 平滑，再生成管 —— 否则细管沿程是多段折线
      resampleCatmull(this.pos, this.sub, this._smooth)
      updateTubeGeometry(this.geometry, this._smooth, this.radius, this.radial)
      for (let i = 0; i < n; i++) this._last[i].copy(this.pos[i])
      this._updatePlugs()
      this._dirty = false
    }
  }

  /** 线色（含选中/电流热色）：线身与两端手柄一起换 */
  setColor(hex) {
    this.material.color.set(hex)
    const mat = plugBodyMaterial(hex)
    for (const p of this.plugs) {
      const body = p.children[2]
      if (body) body.material = mat
    }
  }

  /** 释放 GPU 资源 */
  dispose() {
    this.geometry.dispose()
    this.material.dispose()
  }
}

/**
 * 预览线（拉线中的一端跟随鼠标）：复用 VerletWire，
 * 每帧把 B 端钉到目标点即可，无需单独实现。
 */
export { createTubeGeometry, updateTubeGeometry }
