/**
 * 力学引擎 — Verlet积分
 *
 * 支持：
 * - 刚体运动（位置、速度、加速度）
 * - 重力
 * - 弹簧力
 * - 碰撞检测（AABB + 圆形）
 * - 约束求解
 */

export class Body {
  constructor(x, y, opts = {}) {
    this.x = x
    this.y = y
    this.prevX = x
    this.prevY = y
    this.vx = opts.vx ?? 0
    this.vy = opts.vy ?? 0
    this.ax = 0
    this.ay = 0
    this.mass = opts.mass ?? 1
    this.radius = opts.radius ?? 0.2
    this.restitution = opts.restitution ?? 0.7 // 弹性系数
    this.friction = opts.friction ?? 0.01
    this.fixed = opts.fixed ?? false
    this.type = 'body'
    this.id = opts.id ?? `body_${Math.random().toString(36).slice(2, 8)}`

    // 轨迹记录
    this.trail = []
    this.maxTrailLength = opts.maxTrailLength ?? 200
  }

  /** 施加力 */
  applyForce(fx, fy) {
    this.ax += fx / this.mass
    this.ay += fy / this.mass
  }

  /** Verlet积分步进 */
  integrate(dt) {
    if (this.fixed) return

    const newX = 2 * this.x - this.prevX + this.ax * dt * dt
    const newY = 2 * this.y - this.prevY + this.ay * dt * dt

    // 摩擦
    const vx = (newX - this.x) * (1 - this.friction)
    const vy = (newY - this.y) * (1 - this.friction)

    this.prevX = this.x
    this.prevY = this.y
    this.x += vx
    this.y += vy

    // 记录轨迹
    this.trail.push({ x: this.x, y: this.y })
    if (this.trail.length > this.maxTrailLength) {
      this.trail.shift()
    }

    // 清除加速度
    this.ax = 0
    this.ay = 0
  }

  /** 获取当前速度 */
  getVelocity(dt) {
    return {
      x: (this.x - this.prevX) / dt,
      y: (this.y - this.prevY) / dt
    }
  }
}

/** 弹簧连接 */
export class Spring {
  constructor(bodyA, bodyB, opts = {}) {
    this.bodyA = bodyA
    this.bodyB = bodyB
    this.restLength = opts.restLength ?? null // null = 使用初始距离
    this.stiffness = opts.stiffness ?? 50
    this.damping = opts.damping ?? 0.5

    if (this.restLength === null) {
      const dx = bodyB.x - bodyA.x
      const dy = bodyB.y - bodyA.y
      this.restLength = Math.sqrt(dx * dx + dy * dy)
    }

    this.type = 'spring'
  }

  /** 计算并施加弹簧力 */
  apply() {
    const dx = this.bodyB.x - this.bodyA.x
    const dy = this.bodyB.y - this.bodyA.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 1e-10) return

    const stretch = dist - this.restLength
    const force = this.stiffness * stretch

    // 阻尼力
    const dvx = (this.bodyB.x - this.bodyB.prevX) - (this.bodyA.x - this.bodyA.prevX)
    const dvy = (this.bodyB.y - this.bodyB.prevY) - (this.bodyA.y - this.bodyA.prevY)
    const dampForce = this.damping * (dvx * dx + dvy * dy) / dist

    const fx = (force + dampForce) * dx / dist
    const fy = (force + dampForce) * dy / dist

    this.bodyA.applyForce(fx, fy)
    this.bodyB.applyForce(-fx, -fy)
  }

  getCurrentLength() {
    const dx = this.bodyB.x - this.bodyA.x
    const dy = this.bodyB.y - this.bodyA.y
    return Math.sqrt(dx * dx + dy * dy)
  }

  getCurrentForce() {
    return this.stiffness * (this.getCurrentLength() - this.restLength)
  }
}

/** 斜面 */
export class InclinedPlane {
  constructor(x, y, width, angle) {
    this.x = x
    this.y = y
    this.width = width
    this.angle = angle // 弧度
    this.type = 'inclinedPlane'

    // 斜面两端点
    this.x1 = x - width / 2 * Math.cos(angle)
    this.y1 = y - width / 2 * Math.sin(angle)
    this.x2 = x + width / 2 * Math.cos(angle)
    this.y2 = y + width / 2 * Math.sin(angle)
  }

  /** 检测球体与斜面碰撞 */
  collide(body) {
    // 斜面法线
    const nx = -Math.sin(this.angle)
    const ny = Math.cos(this.angle)

    // 球心到斜面的有向距离
    const dx = body.x - this.x1
    const dy = body.y - this.y1
    const dist = dx * nx + dy * ny

    if (dist > body.radius) return false

    // 检查是否在斜面范围内
    const t = dx * Math.cos(this.angle) + dy * Math.sin(this.angle)
    if (t < 0 || t > this.width) return false

    // 推出
    const overlap = body.radius - dist
    body.x += nx * overlap
    body.y += ny * overlap

    // 反射速度
    const vx = body.x - body.prevX
    const vy = body.y - body.prevY
    const vn = vx * nx + vy * ny
    if (vn < 0) {
      body.prevX += 2 * vn * nx * body.restitution
      body.prevY += 2 * vn * ny * body.restitution
    }

    return true
  }
}

/** 地面边界 */
export class Ground {
  constructor(y = 0, width = 20) {
    this.y = y
    this.width = width
    this.type = 'ground'
  }

  collide(body) {
    if (body.y - body.radius < this.y) {
      body.y = this.y + body.radius
      // 反弹
      const vy = body.y - body.prevY
      if (vy < 0) {
        body.prevY = body.y + vy * body.restitution
      }
      return true
    }
    return false
  }
}

/**
 * MechanicsEngine — 力学引擎主类
 */
export class MechanicsEngine {
  constructor() {
    this.bodies = []
    this.springs = []
    this.planes = []
    this.grounds = []
    this.gravity = { x: 0, y: -9.8 }
    this.type = 'mechanics'
  }

  addBody(body) { this.bodies.push(body) }
  addSpring(spring) { this.springs.push(spring) }
  addPlane(plane) { this.planes.push(plane) }
  addGround(ground) { this.grounds.push(ground) }

  setGravity(gx, gy) {
    this.gravity.x = gx
    this.gravity.y = gy
  }

  clear() {
    this.bodies = []
    this.springs = []
    this.planes = []
    this.grounds = []
  }

  /** 每帧调用 */
  step(dt) {
    dt = Math.min(dt, 0.02) // cap

    // 1. 施加重力
    for (const body of this.bodies) {
      body.applyForce(this.gravity.x * body.mass, this.gravity.y * body.mass)
    }

    // 2. 施加弹簧力
    for (const spring of this.springs) {
      spring.apply()
    }

    // 3. Verlet积分
    for (const body of this.bodies) {
      body.integrate(dt)
    }

    // 4. 碰撞检测
    for (const body of this.bodies) {
      for (const ground of this.grounds) {
        ground.collide(body)
      }
      for (const plane of this.planes) {
        plane.collide(body)
      }
    }

    // 5. 球-球碰撞
    for (let i = 0; i < this.bodies.length; i++) {
      for (let j = i + 1; j < this.bodies.length; j++) {
        this._collideBodies(this.bodies[i], this.bodies[j])
      }
    }
  }

  _collideBodies(a, b) {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const minDist = a.radius + b.radius

    if (dist >= minDist || dist < 1e-10) return

    const nx = dx / dist
    const ny = dy / dist
    const overlap = minDist - dist

    // 质量加权推出
    const totalMass = a.mass + b.mass
    const moveA = b.mass / totalMass
    const moveB = a.mass / totalMass

    a.x -= nx * overlap * moveA
    a.y -= ny * overlap * moveA
    b.x += nx * overlap * moveB
    b.y += ny * overlap * moveB

    // 弹性碰撞
    const va = { x: a.x - a.prevX, y: a.y - a.prevY }
    const vb = { x: b.x - b.prevX, y: b.y - b.prevY }

    const relVx = va.x - vb.x
    const relVy = va.y - vb.y
    const relVn = relVx * nx + relVy * ny

    if (relVn > 0) return // 正在分离

    const e = Math.min(a.restitution, b.restitution)
    const j = -(1 + e) * relVn / (1 / a.mass + 1 / b.mass)

    a.prevX -= j * nx / a.mass
    a.prevY -= j * ny / a.mass
    b.prevX += j * nx / b.mass
    b.prevY += j * ny / b.mass
  }
}
