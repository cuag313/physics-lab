/**
 * verlet-wire.js — 3D 下垂软导线（Verlet 粒子弹簧链）
 *
 * 替代旧的点状连线：一根导线 = 一串 Verlet 粒子 + 距离约束（弹簧链），
 * 在重力下自然下垂；两端钉在器材接线柱上，台面旋转/器材拖动时端点移动、
 * 链条自动跟随形变。**不使用任何贝塞尔曲线**——形状完全由物理松弛决定。
 *
 * 渲染用预分配的管状网格（TubeRibbon）：每帧原位改写顶点/法线，
 * 不产生垃圾回收；静止后跳过更新。
 */

import * as THREE from 'three'

const _t0 = new THREE.Vector3()
const _t1 = new THREE.Vector3()
const _n0 = new THREE.Vector3()
const _b0 = new THREE.Vector3()
const _axis = new THREE.Vector3()
const _q = new THREE.Quaternion()

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
   * @param {number} [opt.count=18] 粒子数
   * @param {string} [opt.color='#c0392b'] 线色
   * @param {number} [opt.radius=0.03] 管半径（世界单位）
   * @param {number} [opt.slack=1.28] 松弛系数（rest = 弦长×slack/(count-1)，>1 允许下垂）
   * @param {number} [opt.radial=7] 管截面段数
   */
  constructor(opt = {}) {
    const count = opt.count ?? 18
    this.count = count
    this.radius = opt.radius ?? 0.03
    this.slack = opt.slack ?? 1.28
    this.radial = opt.radial ?? 7
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

    // 管状网格（预分配，改线不重建）
    this.geometry = createTubeGeometry(count - 1, this.radial)
    this.material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(opt.color ?? '#c0392b'),
      roughness: 0.52,
      metalness: 0.12,
    })
    this.mesh = new THREE.Mesh(this.geometry, this.material)
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    this.mesh.userData.role = 'wire'
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
      updateTubeGeometry(this.geometry, this.pos, this.radius, this.radial)
      for (let i = 0; i < n; i++) this._last[i].copy(this.pos[i])
      this._dirty = false
    }
  }

  /** 线色（含选中/电流热色） */
  setColor(hex) {
    this.material.color.set(hex)
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
