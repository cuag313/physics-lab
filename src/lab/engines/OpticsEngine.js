/**
 * 光学引擎 v3 — 凸透镜成像专用
 *
 * 三条特殊光线（凸透镜）：
 *   ① 平行主轴 → 折射过焦点F'（黄色）
 *   ② 过光心O → 直行不变（绿色）
 *   ③ 过焦点F → 折射平行主轴（蓝色）
 *
 * 成像公式：1/u + 1/v = 1/f
 * 放大率：m = -v/u
 *
 * 成像规律：
 *   u > 2f  → 倒立缩小实像（f < v < 2f）
 *   u = 2f  → 倒立等大实像（v = 2f）
 *   f < u < 2f → 倒立放大实像（v > 2f）
 *   u = f   → 不成像（平行光）
 *   u < f   → 正立放大虚像
 */

/** 光线段 */
export class RaySegment {
  constructor(from, to, color = '#ffdd00', intensity = 1, isVirtual = false) {
    this.from = { ...from }
    this.to = { ...to }
    this.color = color
    this.intensity = intensity
    this.isVirtual = isVirtual
  }
}

/**
 * 光学引擎
 */
export class OpticsEngine {
  constructor() {
    this.sources = []
    this.elements = []
    this.detectors = []
    this.rays = []

    // 成像计算结果（供外部读取）
    this.imageResult = null
  }

  addSource(source) { this.sources.push(source) }
  addElement(element) { this.elements.push(element) }
  addDetector(detector) { this.detectors.push(detector) }

  clear() {
    this.sources = []
    this.elements = []
    this.detectors = []
    this.rays = []
    this.imageResult = null
  }

  /** 主循环 */
  step() {
    this.rays = []
    this.imageResult = null
    for (const d of this.detectors) d.clearHits()

    for (const source of this.sources) {
      this._traceFromSource(source)
    }
  }

  /** 从光源发射并追踪 */
  _traceFromSource(source) {
    const lenses = this.elements.filter(e => e.type === 'convexLens' || e.type === 'concaveLens')
    const mirrors = this.elements.filter(e => e.type === 'planeMirror')

    for (const lens of lenses) {
      this._traceObjectThroughLens(source, lens)
    }

    for (const mirror of mirrors) {
      this._traceToMirror(source, mirror)
    }

    if (lenses.length === 0 && mirrors.length === 0) {
      this._traceDirect(source)
    }
  }

  /**
   * 追踪物体通过透镜成像 — 三条特殊光线
   */
  _traceObjectThroughLens(source, lens) {
    const objX = source.x
    const lensX = lens.x
    const f = lens.f
    const axisY = lens.y
    const isConvex = lens.type === 'convexLens'

    // 物距 u
    const u = lensX - objX
    if (Math.abs(u) < 0.01) return

    // 物体高度：用source自带的高度（objectHeight），否则用spread估算
    const objHeight = source.objectHeight ?? (Math.tan(source.spread / 2) * Math.abs(u) * 0.3)
    const objTopY = axisY + objHeight
    const objTop = { x: objX, y: objTopY }
    const objBase = { x: objX, y: axisY }

    // 三条光线的颜色
    const COLOR_RAY1 = '#FFD700'  // 黄色：平行→过F'
    const COLOR_RAY2 = '#4CAF50'  // 绿色：过光心
    const COLOR_RAY3 = '#2196F3'  // 蓝色：过F→平行

    // ===== 光线①：平行主轴 → 折射过F' =====
    const ray1_lensHit = { x: lensX, y: objTopY }

    if (isConvex) {
      // 凸透镜：折射后过 F'(lensX + f, axisY)
      const F2 = { x: lensX + f, y: axisY }
      const dx = F2.x - ray1_lensHit.x
      const dy = F2.y - ray1_lensHit.y
      const len = Math.sqrt(dx * dx + dy * dy)
      const dir = { x: dx / len, y: dy / len }
      const ray1_end = {
        x: ray1_lensHit.x + dir.x * 40,
        y: ray1_lensHit.y + dir.y * 40
      }
      this.rays.push(new RaySegment(objTop, ray1_lensHit, COLOR_RAY1, 0.9))
      this.rays.push(new RaySegment(ray1_lensHit, ray1_end, COLOR_RAY1, 0.8))
    } else {
      // 凹透镜：折射发散，反向延长过 F'(lensX + f, axisY, f<0)
      const virtualFocus = { x: lensX + f, y: axisY }
      const dx = ray1_lensHit.x - virtualFocus.x
      const dy = ray1_lensHit.y - virtualFocus.y
      const len = Math.sqrt(dx * dx + dy * dy)
      const dir = { x: dx / len, y: dy / len }
      const ray1_end = {
        x: ray1_lensHit.x + dir.x * 40,
        y: ray1_lensHit.y + dir.y * 40
      }
      this.rays.push(new RaySegment(objTop, ray1_lensHit, COLOR_RAY1, 0.9))
      this.rays.push(new RaySegment(ray1_lensHit, ray1_end, COLOR_RAY1, 0.8))
      // 反向延长线（虚线）
      const virtualEnd = {
        x: ray1_lensHit.x - dir.x * 20,
        y: ray1_lensHit.y - dir.y * 20
      }
      this.rays.push(new RaySegment(ray1_lensHit, virtualEnd, COLOR_RAY1, 0.3, true))
    }

    // ===== 光线②：过光心O → 直行 =====
    // 从物体顶端过透镜中心(lensX, axisY)
    const slope2 = (objTopY - axisY) / (objX - lensX)
    const ray2_far = {
      x: lensX + 40,
      y: axisY + slope2 * 40
    }
    const ray2_back = {
      x: objX - 10,
      y: objTopY + slope2 * (-10)
    }
    this.rays.push(new RaySegment(objTop, ray2_far, COLOR_RAY2, 0.6))

    // ===== 光线③：过/指向焦点F → 折射平行 =====
    if (isConvex) {
      // 凸透镜：过 F(lensX - f, axisY) 的光线折射后平行主轴
      const F1 = { x: lensX - f, y: axisY }
      // 从物体顶端到F1的方向
      const dx3 = F1.x - objX
      const dy3 = F1.y - objTopY
      const len3 = Math.sqrt(dx3 * dx3 + dy3 * dy3)
      const dir3 = { x: dx3 / len3, y: dy3 / len3 }
      // 光线到达透镜面
      const t3 = (lensX - objX) / dir3.x
      const ray3_lensHit = { x: objX + dir3.x * t3, y: objTopY + dir3.y * t3 }
      // 折射后平行主轴（y不变）
      const ray3_end = { x: lensX + 40, y: ray3_lensHit.y }
      this.rays.push(new RaySegment(objTop, ray3_lensHit, COLOR_RAY3, 0.7))
      this.rays.push(new RaySegment(ray3_lensHit, ray3_end, COLOR_RAY3, 0.6))
    } else {
      // 凹透镜：指向 F(lensX - f, axisY) 的光线折射后平行
      const F1 = { x: lensX - f, y: axisY }
      const dx3 = F1.x - objX
      const dy3 = F1.y - objTopY
      const len3 = Math.sqrt(dx3 * dx3 + dy3 * dy3)
      const dir3 = { x: dx3 / len3, y: dy3 / len3 }
      const t3 = (lensX - objX) / dir3.x
      const ray3_lensHit = { x: objX + dir3.x * t3, y: objTopY + dir3.y * t3 }
      const ray3_end = { x: lensX + 40, y: ray3_lensHit.y }
      this.rays.push(new RaySegment(objTop, ray3_lensHit, COLOR_RAY3, 0.7))
      this.rays.push(new RaySegment(ray3_lensHit, ray3_end, COLOR_RAY3, 0.6))
    }

    // ===== 计算像的位置 =====
    if (Math.abs(u) > 0.01 && Math.abs(f) > 0.01) {
      const v = 1 / (1 / f - 1 / u)
      const m = -v / u
      const imgX = lensX + v
      const imgY = axisY + objHeight * m
      const isReal = isConvex ? (u > f) : false

      this.imageResult = {
        x: imgX,
        y: imgY,
        height: objHeight * m,
        magnification: m,
        isReal: isReal,
        imageDistance: v,
        objectDistance: u,
        focalLength: f,
      }

      // 像点汇聚线（从折射光线汇聚到像点）
      if (isReal && isConvex) {
        // 实像：三条折射光线实际汇聚
        // 像点用红色标记
        const imgPoint = { x: imgX, y: imgY }
        this.rays.push(new RaySegment(
          { x: imgX - 0.08, y: imgY },
          { x: imgX + 0.08, y: imgY },
          '#f44', 1, false
        ))
      }
    }

    // ===== 光屏检测 =====
    for (const det of this.detectors) {
      if (this.imageResult) {
        const detX = det.x
        if (Math.abs(detX - this.imageResult.x) < 0.5) {
          det.hitPoints.push({
            x: detX,
            y: this.imageResult.y,
            height: this.imageResult.height,
            isReal: this.imageResult.isReal
          })
        }
      }
    }
  }

  /**
   * 追踪光线到平面镜
   */
  _traceToMirror(source, mirror) {
    const angle = mirror.angle * Math.PI / 180
    const nx = -Math.sin(angle)
    const ny = Math.cos(angle)

    const rayCount = 15
    const startA = (source.direction - source.spread / 2) * Math.PI / 180
    const endA = (source.direction + source.spread / 2) * Math.PI / 180
    const step = rayCount > 1 ? (endA - startA) / (rayCount - 1) : 0

    for (let i = 0; i < rayCount; i++) {
      const a = startA + step * i
      const dir = { x: Math.cos(a), y: Math.sin(a) }

      const mirrorDirX = Math.cos(angle)
      const mirrorDirY = Math.sin(angle)
      const det = dir.x * mirrorDirY - dir.y * mirrorDirX
      if (Math.abs(det) < 1e-10) continue

      const dx = mirror.x - source.x
      const dy = mirror.y - source.y
      const t = (dx * mirrorDirY - dy * mirrorDirX) / det
      const s = (dx * dir.y - dy * dir.x) / det

      if (t < 0.01 || Math.abs(s) > mirror.length / 2) continue

      const hitPoint = {
        x: source.x + dir.x * t,
        y: source.y + dir.y * t
      }

      this.rays.push(new RaySegment(
        { x: source.x, y: source.y },
        hitPoint,
        '#ffdd00', 0.8
      ))

      const dot = dir.x * nx + dir.y * ny
      const reflectDir = {
        x: dir.x - 2 * dot * nx,
        y: dir.y - 2 * dot * ny
      }
      const reflectEnd = {
        x: hitPoint.x + reflectDir.x * 30,
        y: hitPoint.y + reflectDir.y * 30
      }
      this.rays.push(new RaySegment(hitPoint, reflectEnd, '#4CAF50', 0.7))

      this.rays.push(new RaySegment(
        { x: hitPoint.x - nx * 1.5, y: hitPoint.y - ny * 1.5 },
        { x: hitPoint.x + nx * 1.5, y: hitPoint.y + ny * 1.5 },
        '#4FC3F7', 0.3, true
      ))
    }
  }

  /** 直行光线（无元件时） */
  _traceDirect(source) {
    const rayCount = source.rayCount
    const startA = (source.direction - source.spread / 2) * Math.PI / 180
    const endA = (source.direction + source.spread / 2) * Math.PI / 180
    const step = rayCount > 1 ? (endA - startA) / (rayCount - 1) : 0

    for (let i = 0; i < rayCount; i++) {
      const a = startA + step * i
      const dir = { x: Math.cos(a), y: Math.sin(a) }
      this.rays.push(new RaySegment(
        { x: source.x, y: source.y },
        { x: source.x + dir.x * 50, y: source.y + dir.y * 50 },
        source.color || '#ffdd00', 0.8
      ))
    }
  }
}

/**
 * 光源（保持兼容）
 */
export class PointSource {
  constructor(x, y, direction = 0, spread = 30, rayCount = 20, color = '#ffdd00', objectHeight = null) {
    this.x = x
    this.y = y
    this.direction = direction
    this.spread = spread * Math.PI / 180
    this.rayCount = rayCount
    this.color = color
    this.objectHeight = objectHeight
    this.type = 'pointSource'
  }
  emit() { return [] }
}

/** 光屏 */
export class Screen {
  constructor(x, y, height = 2.0) {
    this.x = x
    this.y = y
    this.height = height
    this.type = 'screen'
    this.hitPoints = []
  }
  intersect() { return null }
  clearHits() { this.hitPoints = [] }
}
