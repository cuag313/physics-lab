/**
 * verlet-wire.js — 3D 软导线（参数化平滑曲线 + 管状网格）
 *
 * 曾经的做法是 Verlet 粒子弹簧链：42 个粒子在重力下松弛，形状由物理决定。
 * 问题是细管 + 稀疏粒子会撑出"飘带"观感：管径偏粗、沿程折角、拖动时整根线
 * 像丝带一样晃动，完全不像实验室里一根安静的插头导线。
 *
 * 现在改成**参数化曲线**（用户指出的贝塞尔思路）：两端柱位 + 中间一个下垂
 * 控制点，用 Catmull-Rom 串起来，采样成密集折线再生成细管。
 *   - 形状稳定、连续曲率，不会飘；拖动时曲线随端点平滑跟随；
 *   - 管径收到 0.030（≈3mm 半径），是真实香蕉插头导线的粗细；
 *   - 两端各挂一个香蕉插头，尖端朝接线柱。
 *
 * 对外接口保持不变（pin / reseed / simulate / pos / mesh / setColor / dispose），
 * three-render 的每帧调用与流动光点（按 rec.wire.pos 排布弧长）都不用改。
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
const TABLE_Y = 0.02

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

/* ── 香蕉插头：黄铜细杆 + 彩色塑料手柄（共享几何/材质，按线色缓存）── */
const PLUG_TIP_GEO = new THREE.CylinderGeometry(0.0125, 0.0108, 0.052, 10)
const PLUG_SHOULDER_GEO = new THREE.CylinderGeometry(0.0235, 0.0235, 0.011, 12)
const PLUG_BODY_GEO = new THREE.CylinderGeometry(0.0245, 0.0265, 0.066, 12)
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
  tip.position.y = 0.026 // +Y = 插入接线柱的一侧
  const shoulder = new THREE.Mesh(PLUG_SHOULDER_GEO, PLUG_METAL)
  const body = new THREE.Mesh(PLUG_BODY_GEO, plugBodyMaterial(color))
  body.position.y = -0.038
  g.add(tip, shoulder, body)
  g.userData.role = 'plug'
  return g
}

/**
 * 一根软导线：两端钉在接线柱上，中间一段自然下垂的平滑弧。
 *
 * 用法（挂在 labTableGroup 下，坐标为组内局部坐标）：
 *   const w = new VerletWire({ color })
 *   group.add(w.mesh)
 *   每帧：w.pin(a, b)；w.simulate(gravity, dt)
 */
export class VerletWire {
  /**
   * @param {object} [opt]
   * @param {number} [opt.count=36] 采样点数（越多弧线越顺）
   * @param {string} [opt.color='#c0392b'] 线色
   * @param {number} [opt.radius=0.03] 管半径（世界单位，≈3mm）
   * @param {number} [opt.slack=1.16] 松弛系数（>1 时弧线更"绷"一点，保留接口）
   * @param {number} [opt.radial=12] 管截面段数
   */
  constructor(opt = {}) {
    const count = opt.count ?? 36
    this.count = count
    this.radius = opt.radius ?? 0.03
    this.slack = opt.slack ?? 1.16
    this.radial = opt.radial ?? 12

    // 曲线采样点（外部 flow dots 按这个数组排弧长）
    this.pos = []
    for (let i = 0; i < count; i++) this.pos.push(new THREE.Vector3())
    this._last = []
    for (let i = 0; i < count; i++) this._last.push(new THREE.Vector3(Math.NaN, 0, 0))

    this._pinA = new THREE.Vector3()
    this._pinB = new THREE.Vector3()
    // 当前实际用的端点：向 pin 平滑逼近，拖动时线跟手但不瞬跳
    this._curA = new THREE.Vector3()
    this._curB = new THREE.Vector3()
    this._hasCur = false
    this._dirty = true

    // 曲线控制点（预分配，避免每帧建对象）
    this._ctrl = []
    for (let i = 0; i < 5; i++) this._ctrl.push(new THREE.Vector3())

    this.geometry = createTubeGeometry(count - 1, this.radial)
    this.material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(opt.color ?? '#c0392b'),
      // PVC 绝缘皮：哑光、几乎无金属感，粗糙度给高一点才不会像塑料带反光
      roughness: 0.74,
      metalness: 0.02,
    })
    this.mesh = new THREE.Mesh(this.geometry, this.material)
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    // 顶点每帧被重写，但包围球不会跟着更新：若开启视锥剔除，three 会拿初始
    // （全零坐标）的包围球做判断，导线一离开原点就被整个剔掉——表现就是"线都没连"。
    this.mesh.frustumCulled = false
    this.mesh.userData.role = 'wire'

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

  /** 端点大幅变化后强制重建（接口保留） */
  reseed() {
    this._dirty = true
  }

  /**
   * 设定"整根线不得低于的高度"。
   * 两端之间如果横着别的器材（比如电池组），原来的中点会压到桌面附近、
   * 直接从仪器壳体里穿过去；给一个抬升下限，线就从器材上方跨过去。
   * @param {number|null} y 局部坐标下的最低允许高度
   */
  setClearance(y) {
    if (this._clearY !== y) {
      this._clearY = y
      this._dirty = true
    }
  }

  /** 按两端与下垂量重建曲线采样点 */
  _rebuildCurve() {
    const A = this._curA
    const B = this._curB
    const c = this._ctrl
    const dx = B.x - A.x
    const dz = B.z - A.z
    const flat = Math.hypot(dx, dz) || 1e-6

    // 真实香蕉插头导线的形状：两端从接线柱**竖直向下**出线，中间自然垂到桌面附近。
    // 之前用单段二次贝塞尔，两端切线是指向中央控制点的斜线，观感是"斜着折过去"，
    // 不像一根垂下来的导线。改成穿过 5 个点的 Catmull-Rom：
    //   A → A 正下方一小段（竖直切线）→ 中点（贴桌）→ B 正下方 → B
    const dropLen = Math.min(0.30, Math.max(0.06, flat * 0.22))
    c[0].set(A.x, A.y - dropLen, A.z)
    c[3].set(B.x, B.y - dropLen, B.z)

    const midX = (A.x + B.x) * 0.5
    const midZ = (A.z + B.z) * 0.5
    const midY = Math.max(
      TABLE_Y + this.radius + 0.004,
      Math.min(A.y, B.y) - Math.min(0.62, flat * 0.5),
      // 中点被抬高到"中间器材的顶面之上"，避免导线从仪器壳体内部穿过去
      this._clearY != null ? this._clearY : -Infinity
    )
    // 长线略往法线方向让一点，避免贴着某件器材的边擦过去
    c[1].set(midX + (dz / flat) * 0.10, midY, midZ - (dx / flat) * 0.10)

    const seq = [A, c[0], c[1], c[3], B]
    const curve = new THREE.CatmullRomCurve3(seq, false, 'catmullrom', 0.5)
    const pts = curve.getPoints(this.count - 1)
    for (let i = 0; i < this.count; i++) {
      const p = pts[Math.min(i, pts.length - 1)]
      this.pos[i].copy(p)
      if (this.pos[i].y < TABLE_Y + this.radius) this.pos[i].y = TABLE_Y + this.radius
    }
  }

  /** 插头跟着端点走，尖端始终朝着接线柱 */
  _updatePlugs() {
    _v.subVectors(this.pos[1], this.pos[0])
    if (_v.lengthSq() < 1e-12) _v.set(0, 1, 0)
    _v.normalize().negate()
    this.plugs[0].quaternion.copy(_q.setFromUnitVectors(UP, _v))
    this.plugs[0].position.copy(this.pos[0])

    _v.subVectors(this.pos[this.count - 2], this.pos[this.count - 1])
    if (_v.lengthSq() < 1e-12) _v.set(0, 1, 0)
    _v.normalize().negate()
    this.plugs[1].quaternion.copy(_q.setFromUnitVectors(UP, _v))
    this.plugs[1].position.copy(this.pos[this.count - 1])
  }

  /**
   * 更新导线形状。
   * @param {THREE.Vector3} _gravity 不再参与形状计算（弧线由下降量控制），保留签名
   * @param {number} _dt 秒
   */
  simulate(_gravity, _dt) {
    // 端点平滑逼近（0.4 的跟随速度：拖动时线略滞后，松手立刻贴合）
    if (!this._hasCur) {
      this._curA.copy(this._pinA)
      this._curB.copy(this._pinB)
      this._hasCur = true
      this._dirty = true
    } else {
      const ka = this._curA.distanceToSquared(this._pinA)
      const kb = this._curB.distanceToSquared(this._pinB)
      if (ka > 1e-4 || kb > 1e-4) {
        this._curA.lerp(this._pinA, 0.4)
        this._curB.lerp(this._pinB, 0.4)
        this._dirty = true
      } else {
        this._curA.copy(this._pinA)
        this._curB.copy(this._pinB)
      }
    }

    // 形状没变就不重算（每帧重采样 36 个点的 Catmull-Rom 没必要）
    let moved = this._dirty
    for (let i = 0; i < this.count; i++) {
      if (this.pos[i].distanceToSquared(this._last[i]) > 1e-5) { moved = true; break }
    }
    if (!moved) return

    this._rebuildCurve()
    updateTubeGeometry(this.geometry, this.pos, this.radius, this.radial)
    for (let i = 0; i < this.count; i++) this._last[i].copy(this.pos[i])
    this._updatePlugs()
    this._dirty = false
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
