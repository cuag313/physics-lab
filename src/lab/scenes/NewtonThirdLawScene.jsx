import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * NewtonThirdLawScene — 牛顿第三定律（作用力与反作用力）
 *
 * 实验方案：
 * 1. 两个弹簧测力计对拉 → F₁ = F₂（经典方案）
 * 2. 两个小车碰撞 → 相互作用力等大反向
 * 3. 磁铁与铁块相互吸引
 *
 * 交互：
 * - 拖拽施加力
 * - 实时显示两力大小
 * - 切换实验方案
 * - 验证：F₁ = -F₂（等大、反向、同时、同线）
 */
export default function NewtonThirdLawScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    mode: 'spring',     // spring | cart | magnet

    // 弹簧测力计模式
    springA_x: -2,      // 左弹簧位置
    springB_x: 2,       // 右弹簧位置
    springForceA: 0,    // 左弹簧读数
    springForceB: 0,    // 右弹簧读数
    springDragX: null,  // 拖拽位置
    springNatural: 3,   // 自然长度（两弹簧间距）
    springK: 5,         // 劲度系数

    // 小车碰撞模式
    cartA_x: -3,        // 左小车位置
    cartB_x: 3,         // 右小车位置
    cartA_v: 1.5,       // 左小车速度
    cartB_v: -1.0,      // 右小车速度
    cartA_m: 1.0,       // 左小车质量
    cartB_m: 1.5,       // 右小车质量
    cartPhase: 'idle',  // idle | moving | collided | separating
    collisionForce: 0,
    collisionTime: 0,
    preCollisionV_A: 0, // 碰前速度
    preCollisionV_B: 0,

    // 磁铁模式
    magA_x: -3,
    magB_x: 3,
    magA_v: 0,
    magB_v: 0,
    magA_m: 1.0,        // 磁铁A质量
    magB_m: 1.5,        // 磁铁B质量
    magStr: 5,          // 磁力强度
    magPhase: 'idle',
    magForce: 0,
    magContactDist: 0.9, // 接触距离

    // 通用
    time: 0,
    g: 9.8,
    forceHistory: [],   // [{t, fA, fB}]
    maxHistory: 200,
  })

  const [mode, setMode] = useState('spring')
  const [forceA, setForceA] = useState(0)
  const [forceB, setForceB] = useState(0)
  const [, forceUpdate] = useState(0)
  const [cursor, setCursor] = useState('default')
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const R = createRenderer(canvas)
    canvasRef.current._R = R

    const loop = () => {
      updatePhysics()
      renderFrame(R)
      animRef.current = requestAnimationFrame(loop)
    }
    loop()

    const onResize = () => R.resize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [])

  function createRenderer(canvas) {
    const R = {
      canvas,
      ctx: canvas.getContext('2d'),
      W: 0, H: 0,
      scale: 70,
      ox: 0, oy: 0,
      resize() {
        const rect = canvas.getBoundingClientRect()
        canvas.width = rect.width * devicePixelRatio
        canvas.height = rect.height * devicePixelRatio
        this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
        this.W = rect.width
        this.H = rect.height
        this.ox = this.W * 0.5
        this.oy = this.H * 0.5
      },
      w2s(wx, wy) { return [this.ox + wx * this.scale, this.oy - wy * this.scale] },
      s2w(sx, sy) { return [(sx - this.ox) / this.scale, (this.oy - sy) / this.scale] },
      clear() { this.ctx.clearRect(0, 0, this.W, this.H) },
    }
    R.resize()
    return R
  }

  // ========== Physics ==========
  function updatePhysics() {
    const s = S.current
    const dt = 1 / 60
    s.time += dt

    if (s.mode === 'cart') {
      updateCartPhysics(s, dt)
    } else if (s.mode === 'magnet') {
      updateMagnetPhysics(s, dt)
    }

    forceUpdate(n => n + 1)
  }

  function updateCartPhysics(s, dt) {
    if (s.cartPhase === 'moving') {
      s.cartA_x += s.cartA_v * dt
      s.cartB_x += s.cartB_v * dt

      // 检测碰撞
      const gap = s.cartB_x - s.cartA_x
      const cartW = 1.2 // 小车宽度
      if (gap < cartW) {
        s.cartPhase = 'collided'
        s.collisionTime = 0

        // 保存碰前速度（用于计算碰撞力）
        s.preCollisionV_A = s.cartA_v
        s.preCollisionV_B = s.cartB_v

        // 弹性碰撞
        const m1 = s.cartA_m, m2 = s.cartB_m
        const v1 = s.cartA_v, v2 = s.cartB_v
        s.cartA_v = ((m1 - m2) * v1 + 2 * m2 * v2) / (m1 + m2)
        s.cartB_v = ((m2 - m1) * v2 + 2 * m1 * v1) / (m1 + m2)
      }
    } else if (s.cartPhase === 'collided') {
      s.collisionTime += dt
      // 碰撞持续0.08秒，力呈半正弦分布
      const collisionDuration = 0.08
      if (s.collisionTime > collisionDuration) {
        s.cartPhase = 'moving'
        s.collisionForce = 0
      } else {
        // 用碰前速度差计算碰撞力，半正弦分布
        const dv = Math.abs(s.preCollisionV_A - s.preCollisionV_B)
        const peakForce = s.cartA_m * Math.abs(s.cartA_v - s.preCollisionV_A) / collisionDuration * 2
        s.collisionForce = peakForce * Math.sin(Math.PI * s.collisionTime / collisionDuration)
      }

      s.cartA_x += s.cartA_v * dt
      s.cartB_x += s.cartB_v * dt
    }

    // 边界
    if (s.cartA_x < -5) { s.cartA_x = -5; s.cartA_v = Math.abs(s.cartA_v) }
    if (s.cartB_x > 5) { s.cartB_x = 5; s.cartB_v = -Math.abs(s.cartB_v) }

    // 记录力
    if (s.cartPhase === 'collided') {
      s.forceHistory.push({ t: s.time, fA: s.collisionForce, fB: -s.collisionForce })
      if (s.forceHistory.length > s.maxHistory) s.forceHistory.shift()
    }
  }

  function updateMagnetPhysics(s, dt) {
    if (s.magPhase !== 'attracting') return

    const dist = s.magB_x - s.magA_x
    // 接触停止（N-S相接，不能重叠）
    if (dist <= s.magContactDist) {
      s.magPhase = 'idle'
      s.magForce = 0
      s.magA_v = 0
      s.magB_v = 0
      // 调整位置确保不重叠
      const mid = (s.magA_x + s.magB_x) / 2
      s.magA_x = mid - s.magContactDist / 2
      s.magB_x = mid + s.magContactDist / 2
      return
    }

    // 磁力与距离平方成反比
    const F = s.magStr / (dist * dist)
    s.magForce = F

    // 加速度（牛顿第三定律：等大反向，但加速度不同！）
    s.magA_v += (F / s.magA_m) * dt  // 质量小 → 加速度大
    s.magB_v -= (F / s.magB_m) * dt  // 质量大 → 加速度小

    s.magA_x += s.magA_v * dt
    s.magB_x += s.magB_v * dt

    // 记录
    s.forceHistory.push({ t: s.time, fA: F, fB: -F })
    if (s.forceHistory.length > s.maxHistory) s.forceHistory.shift()
  }

  // ========== Render ==========
  function renderFrame(R) {
    const ctx = R.ctx
    R.clear()

    drawBackground(ctx, R)
    drawGround(ctx, R)

    const s = S.current
    if (s.mode === 'spring') drawSpringMode(ctx, R)
    else if (s.mode === 'cart') drawCartMode(ctx, R)
    else drawMagnetMode(ctx, R)

    drawForceGraph(ctx, R)
    drawInfoPanel(ctx, R)
    drawDescription(ctx, R)
  }

  function drawBackground(ctx, R) {
    const grad = ctx.createLinearGradient(0, 0, 0, R.H)
    grad.addColorStop(0, '#1a1a2e')
    grad.addColorStop(1, '#0f3460')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, R.W, R.H)
  }

  function drawGround(ctx, R) {
    const [, gy] = R.w2s(0, -1)
    ctx.fillStyle = '#1e2a3a'
    ctx.fillRect(0, gy, R.W, R.H - gy)
    ctx.strokeStyle = '#4a5568'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, gy)
    ctx.lineTo(R.W, gy)
    ctx.stroke()
  }

  // ========== 弹簧测力计模式 ==========
  function drawSpringMode(ctx, R) {
    const s = S.current
    const [ax] = R.w2s(s.springA_x, 0)
    const [bx] = R.w2s(s.springB_x, 0)
    const [, cy] = R.w2s(0, 0)

    // 左弹簧测力计
    drawSpringScale(ctx, ax, cy, 'left', s.springForceA)
    // 右弹簧测力计
    drawSpringScale(ctx, bx, cy, 'right', s.springForceB)

    // 连接线
    ctx.strokeStyle = '#a0aec0'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 3])
    ctx.beginPath()
    ctx.moveTo(ax + 40, cy)
    ctx.lineTo(bx - 40, cy)
    ctx.stroke()
    ctx.setLineDash([])

    // 力的标注
    if (Math.abs(s.springForceA) > 0.1) {
      // 左弹簧受力（向右）
      drawForceArrow(ctx, ax + 40, cy - 30, ax + 40 + s.springForceA * 3, cy - 30, '#4CAF50', `F₁=${s.springForceA.toFixed(1)}N`)
      // 右弹簧受力（向左）
      drawForceArrow(ctx, bx - 40, cy - 30, bx - 40 - s.springForceB * 3, cy - 30, '#F44336', `F₂=${s.springForceB.toFixed(1)}N`)

      // 第三定律标注
      ctx.fillStyle = '#FFD54F'
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('F₁ = -F₂', (ax + bx) / 2, cy - 55)
      ctx.font = '10px sans-serif'
      ctx.fillStyle = '#8b949e'
      ctx.fillText('等大 · 反向 · 同时 · 同线', (ax + bx) / 2, cy - 40)
    }

    // 提示
    ctx.fillStyle = '#8b949e'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('← 拖拽其中一个弹簧测力计施加力 →', (ax + bx) / 2, cy + 60)
  }

  function drawSpringScale(ctx, x, y, side, force) {
    const w = 70
    const h = 30
    const dir = side === 'left' ? 1 : -1

    // 外壳
    ctx.fillStyle = '#2d3748'
    ctx.strokeStyle = '#4a5568'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.roundRect(x - w / 2, y - h / 2, w, h, 6)
    ctx.fill()
    ctx.stroke()

    // 刻度盘
    const dialX = x + dir * 8
    ctx.fillStyle = '#1a202c'
    ctx.beginPath()
    ctx.arc(dialX, y, 10, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#4a5568'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(dialX, y, 10, 0, Math.PI * 2)
    ctx.stroke()

    // 指针
    const angle = -Math.PI / 2 + (force / 20) * Math.PI
    ctx.strokeStyle = '#F44336'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(dialX, y)
    ctx.lineTo(dialX + 8 * Math.cos(angle), y + 8 * Math.sin(angle))
    ctx.stroke()

    // 挂钩
    ctx.strokeStyle = '#718096'
    ctx.lineWidth = 3
    ctx.beginPath()
    const hookX = side === 'left' ? x + w / 2 : x - w / 2
    ctx.moveTo(hookX, y)
    ctx.lineTo(hookX + dir * 15, y)
    ctx.stroke()

    // 读数
    ctx.fillStyle = '#4FC3F7'
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`${force.toFixed(1)}N`, x, y + h / 2 + 16)
  }

  // ========== 小车碰撞模式 ==========
  function drawCartMode(ctx, R) {
    const s = S.current

    // 左小车
    drawCart(ctx, R, s.cartA_x, s.cartA_m, '#4A90D9', 'A')
    // 右小车
    drawCart(ctx, R, s.cartB_x, s.cartB_m, '#E53935', 'B')

    // 碰撞力显示
    if (s.cartPhase === 'collided' && s.collisionForce > 0.1) {
      const midX = (s.cartA_x + s.cartB_x) / 2
      const [mx, my] = R.w2s(midX, 0)

      // 碰撞火花
      drawCollisionSpark(ctx, mx, my - 30)

      // 力的箭头
      drawForceArrow(ctx, mx - 20, my - 50, mx - 20 - s.collisionForce * 2, my - 50, '#4CAF50', `F_A=${s.collisionForce.toFixed(1)}N`)
      drawForceArrow(ctx, mx + 20, my - 50, mx + 20 + s.collisionForce * 2, my - 50, '#F44336', `F_B=${s.collisionForce.toFixed(1)}N`)

      ctx.fillStyle = '#FFD54F'
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('F_A = -F_B', mx, my - 70)
    }

    // 速度矢量
    if (s.cartPhase === 'moving' || s.cartPhase === 'collided') {
      const [ax, ay] = R.w2s(s.cartA_x, 0)
      const [bx, by] = R.w2s(s.cartB_x, 0)
      if (Math.abs(s.cartA_v) > 0.1) {
        drawArrow(ctx, ax, ay - 45, ax + s.cartA_v * 20, ay - 45, '#4CAF50', `v=${s.cartA_v.toFixed(1)}`)
      }
      if (Math.abs(s.cartB_v) > 0.1) {
        drawArrow(ctx, bx, by - 45, bx + s.cartB_v * 20, by - 45, '#F44336', `v=${s.cartB_v.toFixed(1)}`)
      }
    }

    // 控制按钮
    drawCartButtons(ctx, R)
  }

  function drawCart(ctx, R, x, mass, color, label) {
    const [sx, sy] = R.w2s(x, 0)
    const scale = R.scale
    const cw = 1.0 * scale
    const ch = 0.5 * scale

    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.beginPath()
    ctx.roundRect(sx - cw / 2 + 3, sy - ch - 5, cw, ch, 4)
    ctx.fill()

    // 车身
    const grad = ctx.createLinearGradient(sx - cw / 2, sy - ch, sx + cw / 2, sy)
    grad.addColorStop(0, color)
    grad.addColorStop(1, color.replace(/[0-9A-F]{2}$/i, '80'))
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.roundRect(sx - cw / 2, sy - ch - 8, cw, ch, 4)
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.roundRect(sx - cw / 2, sy - ch - 8, cw, ch, 4)
    ctx.stroke()

    // 车轮
    ctx.fillStyle = '#2d2d2d'
    ctx.beginPath()
    ctx.arc(sx - cw / 3, sy - 2, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(sx + cw / 3, sy - 2, 6, 0, Math.PI * 2)
    ctx.fill()

    // 标签
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${label}: ${mass.toFixed(1)}kg`, sx, sy - ch / 2 - 4)
  }

  function drawCollisionSpark(ctx, x, y) {
    const t = Date.now() / 100
    ctx.fillStyle = `rgba(255, 200, 0, ${0.5 + 0.3 * Math.sin(t)})`
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 * i) / 6 + t
      const r = 8 + 4 * Math.sin(t * 2 + i)
      ctx.beginPath()
      ctx.arc(x + r * Math.cos(angle), y + r * Math.sin(angle), 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  function drawCartButtons(ctx, R) {
    const s = S.current
    const [, by] = R.w2s(0, -1.5)
    const midX = R.W / 2

    // 释放按钮
    if (s.cartPhase === 'idle') {
      ctx.fillStyle = '#4CAF50'
      ctx.beginPath()
      ctx.roundRect(midX - 60, by + 10, 120, 30, 6)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('▶ 释放小车', midX, by + 28)
    }
  }

  // ========== 磁铁模式 ==========
  function drawMagnetMode(ctx, R) {
    const s = S.current

    // 磁铁A（N极向右）
    drawMagnet(ctx, R, s.magA_x, 'N', '#F44336', 'A')
    // 磁铁B（S极向左）
    drawMagnet(ctx, R, s.magB_x, 'S', '#2196F3', 'B')

    // 力的显示
    if (s.magPhase === 'attracting' && s.magForce > 0.01) {
      const [ax] = R.w2s(s.magA_x, 0)
      const [bx] = R.w2s(s.magB_x, 0)
      const [, cy] = R.w2s(0, 0)

      drawForceArrow(ctx, ax + 30, cy - 40, ax + 30 + s.magForce * 15, cy - 40, '#F44336', `F_A=${s.magForce.toFixed(2)}N`)
      drawForceArrow(ctx, bx - 30, cy - 40, bx - 30 - s.magForce * 15, cy - 40, '#2196F3', `F_B=${s.magForce.toFixed(2)}N`)

      ctx.fillStyle = '#FFD54F'
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('F_A = -F_B（引力）', (ax + bx) / 2, cy - 60)
    }

    // 磁力线
    if (s.magPhase === 'attracting') {
      drawMagneticField(ctx, R, s.magA_x, s.magB_x)
    }
  }

  function drawMagnet(ctx, R, x, pole, color, label) {
    const [sx, sy] = R.w2s(x, 0)
    const w = 50
    const h = 24

    // 左半（N极，红色）
    ctx.fillStyle = '#F44336'
    ctx.beginPath()
    ctx.roundRect(sx - w, sy - h, w, h, [4, 0, 0, 4])
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('N', sx - w / 2, sy - h / 2)

    // 右半（S极，蓝色）
    ctx.fillStyle = '#2196F3'
    ctx.beginPath()
    ctx.roundRect(sx, sy - h, w, h, [0, 4, 4, 0])
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.fillText('S', sx + w / 2, sy - h / 2)

    // 质量标签
    ctx.fillStyle = '#c9d1d9'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(`磁铁${label} (${pole === 'N' ? S.current.magA_m.toFixed(1) : S.current.magB_m.toFixed(1)}kg)`, sx, sy + 16)
  }

  function drawMagneticField(ctx, R, xA, xB) {
    const [, cy] = R.w2s(0, 0)
    const [ax] = R.w2s(xA, 0)
    const [bx] = R.w2s(xB, 0)

    ctx.strokeStyle = 'rgba(255, 152, 0, 0.2)'
    ctx.lineWidth = 1
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath()
      ctx.moveTo(ax + 50, cy + i * 15)
      const mid = (ax + bx) / 2
      ctx.quadraticCurveTo(mid, cy + i * 30, bx - 50, cy + i * 15)
      ctx.stroke()
    }
  }

  // ========== 力的图像 ==========
  function drawForceGraph(ctx, R) {
    const s = S.current
    const gw = 220
    const gh = 100
    const gx = 16
    const gy = 16

    ctx.fillStyle = 'rgba(22, 27, 34, 0.95)'
    ctx.beginPath()
    ctx.roundRect(gx, gy, gw, gh, 8)
    ctx.fill()
    ctx.strokeStyle = '#30363d'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(gx, gy, gw, gh, 8)
    ctx.stroke()

    ctx.fillStyle = '#c9d1d9'
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('📈 力-时间图像', gx + 10, gy + 16)

    // 坐标轴
    const ox = gx + 35
    const oy = gy + gh - 15
    const w = gw - 50
    const h = gh - 30

    ctx.strokeStyle = '#484f58'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(ox, oy - h)
    ctx.lineTo(ox, oy)
    ctx.lineTo(ox + w, oy)
    ctx.stroke()

    // 零线
    ctx.strokeStyle = 'rgba(139, 148, 158, 0.3)'
    ctx.beginPath()
    ctx.moveTo(ox, oy - h / 2)
    ctx.lineTo(ox + w, oy - h / 2)
    ctx.stroke()

    // 数据
    const hist = s.forceHistory
    if (hist.length > 1) {
      const maxF = Math.max(...hist.map(p => Math.abs(p.fA)), 1)

      // F_A
      ctx.strokeStyle = '#4CAF50'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      for (let i = 0; i < hist.length; i++) {
        const px = ox + (i / hist.length) * w
        const py = oy - h / 2 - (hist[i].fA / maxF) * (h / 2)
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.stroke()

      // F_B
      ctx.strokeStyle = '#F44336'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      for (let i = 0; i < hist.length; i++) {
        const px = ox + (i / hist.length) * w
        const py = oy - h / 2 - (hist[i].fB / maxF) * (h / 2)
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.stroke()

      // 图例
      ctx.fillStyle = '#4CAF50'
      ctx.fillRect(gx + gw - 80, gy + 6, 8, 8)
      ctx.fillStyle = '#8b949e'
      ctx.font = '9px sans-serif'
      ctx.fillText('F_A', gx + gw - 68, gy + 14)
      ctx.fillStyle = '#F44336'
      ctx.fillRect(gx + gw - 45, gy + 6, 8, 8)
      ctx.fillStyle = '#8b949e'
      ctx.fillText('F_B', gx + gw - 33, gy + 14)
    }
  }

  // ========== 信息面板 ==========
  function drawInfoPanel(ctx, R) {
    const s = S.current
    const pw = 220
    const ph = 160
    const px = R.W - pw - 16
    const py = 16

    ctx.fillStyle = 'rgba(22, 27, 34, 0.95)'
    ctx.beginPath()
    ctx.roundRect(px, py, pw, ph, 8)
    ctx.fill()
    ctx.strokeStyle = '#30363d'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(px, py, pw, ph, 8)
    ctx.stroke()

    ctx.fillStyle = '#c9d1d9'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('📊 牛顿第三定律', px + 12, py + 20)

    ctx.font = '11px sans-serif'
    let y = py + 40

    if (s.mode === 'spring') {
      ctx.fillStyle = '#4CAF50'
      ctx.fillText(`F₁（左）= ${s.springForceA.toFixed(2)} N`, px + 12, y); y += 18
      ctx.fillStyle = '#F44336'
      ctx.fillText(`F₂（右）= ${s.springForceB.toFixed(2)} N`, px + 12, y); y += 18
      ctx.fillStyle = '#4FC3F7'
      const diff = Math.abs(s.springForceA - s.springForceB)
      ctx.fillText(`|F₁ - F₂| = ${diff.toFixed(3)} N`, px + 12, y); y += 18
      ctx.fillStyle = diff < 0.5 ? '#4CAF50' : '#FF9800'
      ctx.fillText(diff < 0.5 ? '✓ 等大验证成功' : '⚠ 存在误差', px + 12, y); y += 22
    } else if (s.mode === 'cart') {
      ctx.fillStyle = '#8b949e'
      ctx.fillText(`小车A: m=${s.cartA_m.toFixed(1)}kg, v=${s.cartA_v.toFixed(2)}m/s`, px + 12, y); y += 18
      ctx.fillText(`小车B: m=${s.cartB_m.toFixed(1)}kg, v=${s.cartB_v.toFixed(2)}m/s`, px + 12, y); y += 18
      if (s.cartPhase === 'collided') {
        ctx.fillStyle = '#FF9800'
        ctx.fillText(`碰撞力: ${s.collisionForce.toFixed(1)} N`, px + 12, y); y += 18
      }
    } else if (s.mode === 'magnet') {
      ctx.fillStyle = '#8b949e'
      ctx.fillText(`磁力强度: ${s.magStr.toFixed(1)}`, px + 12, y); y += 18
      ctx.fillStyle = '#4FC3F7'
      ctx.fillText(`相互作用力: ${s.magForce.toFixed(3)} N`, px + 12, y); y += 18
      ctx.fillStyle = '#8b949e'
      ctx.fillText(`距离: ${(s.magB_x - s.magA_x).toFixed(2)} m`, px + 12, y); y += 18
      ctx.fillStyle = '#4CAF50'
      ctx.fillText(`a_A = ${(s.magForce / s.magA_m).toFixed(2)} m/s²`, px + 12, y); y += 18
      ctx.fillStyle = '#F44336'
      ctx.fillText(`a_B = ${(s.magForce / s.magB_m).toFixed(2)} m/s²`, px + 12, y); y += 18
      if (s.magPhase === 'idle' && s.magA_v === 0 && s.magB_v === 0 && s.magForce === 0 && s.magA_x > -3.5) {
        ctx.fillStyle = '#FFD54F'
        ctx.fillText('✓ 已接触！力相等，加速度不同', px + 12, y); y += 18
      }
    }

    ctx.fillStyle = '#FFD54F'
    ctx.font = 'bold 10px sans-serif'
    ctx.fillText('核心：F₁ = -F₂', px + 12, y); y += 16
    ctx.fillStyle = '#8b949e'
    ctx.font = '10px sans-serif'
    ctx.fillText('等大 · 反向 · 同时 · 同线 · 异物', px + 12, y)
  }

  function drawDescription(ctx, R) {
    const h = R.H
    const x = 16
    let y = h - 46

    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillStyle = '#c9d1d9'
    ctx.font = 'bold 14px sans-serif'
    ctx.fillText('牛顿第三定律（作用力与反作用力）', x, y)

    ctx.fillStyle = '#4FC3F7'
    ctx.font = 'bold 13px serif'
    ctx.fillText('F₁ = -F₂', x + 280, y)

    // 操作引导气泡
    drawGuideBubble(ctx, R)
  }

  function drawGuideBubble(ctx, R) {
    const s = S.current
    let text = ''
    let bx = R.W / 2, by = R.H * 0.62

    if (s.mode === 'spring' && s.springForceA < 0.1) {
      text = '👆 拖拽任一弹簧测力计，观察两力等大反向'
    } else if (s.mode === 'cart' && s.cartPhase === 'idle') {
      text = '▶ 点击「释放小车」观察碰撞时的相互作用力'
    } else if (s.mode === 'magnet' && s.magPhase === 'idle' && s.magA_x <= -2.5) {
      text = '👆 点击画面任意位置释放磁铁，观察引力等大反向'
    }

    if (!text) return

    ctx.font = '13px sans-serif'
    const tw = ctx.measureText(text).width + 24
    const th = 32

    // 气泡背景（浮动动画）
    const float = Math.sin(Date.now() / 600) * 4
    const ry = by + float

    ctx.fillStyle = 'rgba(79, 195, 247, 0.15)'
    ctx.beginPath()
    ctx.roundRect(bx - tw / 2, ry - th / 2, tw, th, 16)
    ctx.fill()
    ctx.strokeStyle = 'rgba(79, 195, 247, 0.4)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(bx - tw / 2, ry - th / 2, tw, th, 16)
    ctx.stroke()

    ctx.fillStyle = '#4FC3F7'
    ctx.font = '13px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, bx, ry)
    ctx.textBaseline = 'alphabetic'
  }

  // ========== 通用绘制 ==========
  function drawForceArrow(ctx, x1, y1, x2, y2, color, label) {
    const angle = Math.atan2(y2 - y1, x2 - x1)
    const headLen = 8
    const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
    if (len < 2) return

    ctx.strokeStyle = color
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()

    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(x2, y2)
    ctx.lineTo(x2 - headLen * Math.cos(angle - 0.35), y2 - headLen * Math.sin(angle - 0.35))
    ctx.lineTo(x2 - headLen * Math.cos(angle + 0.35), y2 - headLen * Math.sin(angle + 0.35))
    ctx.closePath()
    ctx.fill()

    if (label) {
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillStyle = color
      ctx.fillText(label, (x1 + x2) / 2, (y1 + y2) / 2 - 8)
    }
  }

  function drawArrow(ctx, x1, y1, x2, y2, color, label) {
    drawForceArrow(ctx, x1, y1, x2, y2, color, label)
  }

  // ========== 交互 ==========
  const handleCanvasMouseDown = useCallback((e) => {
    const canvas = canvasRef.current
    const R = canvas._R
    if (!R) return

    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top

    const s = S.current

    if (s.mode === 'spring') {
      // 检查是否点击了弹簧测力计
      const [ax] = R.w2s(s.springA_x, 0)
      const [bx] = R.w2s(s.springB_x, 0)
      const [, cy] = R.w2s(0, 0)

      if (Math.abs(sx - ax) < 50 && Math.abs(sy - cy) < 40) {
        setIsDragging(true)
        setCursor('grabbing')
        s.dragTarget = 'A'
      } else if (Math.abs(sx - bx) < 50 && Math.abs(sy - cy) < 40) {
        setIsDragging(true)
        setCursor('grabbing')
        s.dragTarget = 'B'
      }
    } else if (s.mode === 'cart' && s.cartPhase === 'idle') {
      // 检查释放按钮
      const midX = R.W / 2
      const [, by] = R.w2s(0, -1.5)
      if (sx > midX - 60 && sx < midX + 60 && sy > by + 10 && sy < by + 40) {
        s.cartPhase = 'moving'
        s.forceHistory = []
      }
    } else if (s.mode === 'magnet' && s.magPhase === 'idle') {
      s.magPhase = 'attracting'
      s.magA_v = 0
      s.magB_v = 0
      s.magA_x = -3
      s.magB_x = 3
      s.forceHistory = []
    }
  }, [])

  const handleCanvasMouseMove = useCallback((e) => {
    if (!isDragging) return
    const canvas = canvasRef.current
    const R = canvas._R
    if (!R) return

    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left

    const s = S.current
    if (s.mode === 'spring') {
      const [, cy] = R.w2s(0, 0)
      const [wx] = R.s2w(sx, cy)

      if (s.dragTarget === 'A') {
        s.springA_x = Math.min(wx, s.springB_x - 0.5)
        const dist = s.springB_x - s.springA_x
        s.springForceA = Math.abs(s.springNatural - dist) * s.springK
        s.springForceB = s.springForceA
      } else {
        s.springB_x = Math.max(wx, s.springA_x + 0.5)
        const dist = s.springB_x - s.springA_x
        s.springForceB = Math.abs(s.springNatural - dist) * s.springK
        s.springForceA = s.springForceB
      }
    }

    forceUpdate(n => n + 1)
  }, [isDragging])

  const handleCanvasMouseUp = useCallback(() => {
    if (!isDragging) return
    setIsDragging(false)
    setCursor('default')

    const s = S.current
    if (s.mode === 'spring') {
      // 回弹
      s.springA_x = -2
      s.springB_x = 2
      s.springForceA = 0
      s.springForceB = 0
    }
  }, [isDragging])

  const handleReset = useCallback(() => {
    const s = S.current
    s.springA_x = -2
    s.springB_x = 2
    s.springForceA = 0
    s.springForceB = 0
    s.cartA_x = -3
    s.cartB_x = 3
    s.cartA_v = 1.5
    s.cartB_v = -1.0
    s.cartPhase = 'idle'
    s.collisionForce = 0
    s.preCollisionV_A = 0
    s.preCollisionV_B = 0
    s.magA_x = -3
    s.magB_x = 3
    s.magA_v = 0
    s.magB_v = 0
    s.magPhase = 'idle'
    s.magForce = 0
    s.forceHistory = []
    setForceA(0)
    setForceB(0)
  }, [])

  const handleModeChange = useCallback((newMode) => {
    S.current.mode = newMode
    S.current.forceHistory = []
    setMode(newMode)
    handleReset()
  }, [handleReset])

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <span style={styles.title}>牛顿第三定律（作用力与反作用力）</span>
        <div style={styles.toolbarActions}>
          <button style={styles.btn} onClick={handleReset}>↺ 重置</button>
          <div style={styles.sep} />
          <div style={styles.modeGroup}>
            {[
              { key: 'spring', label: '弹簧测力计' },
              { key: 'cart', label: '小车碰撞' },
              { key: 'magnet', label: '磁铁互吸' },
            ].map(m => (
              <button key={m.key}
                style={mode === m.key ? styles.modeBtnActive : styles.modeBtn}
                onClick={() => handleModeChange(m.key)}>
                {m.label}
              </button>
            ))}
          </div>
          {mode === 'cart' && (
            <>
              <label style={styles.controlLabel}>
                车A质量：
                <input type="range" min="0.5" max="3" step="0.1"
                  value={S.current.cartA_m}
                  onChange={(e) => { S.current.cartA_m = parseFloat(e.target.value); forceUpdate(n => n + 1) }}
                  style={styles.slider} />
                <span style={styles.sliderVal}>{S.current.cartA_m.toFixed(1)}kg</span>
              </label>
              <label style={styles.controlLabel}>
                车B质量：
                <input type="range" min="0.5" max="3" step="0.1"
                  value={S.current.cartB_m}
                  onChange={(e) => { S.current.cartB_m = parseFloat(e.target.value); forceUpdate(n => n + 1) }}
                  style={styles.slider} />
                <span style={styles.sliderVal}>{S.current.cartB_m.toFixed(1)}kg</span>
              </label>
            </>
          )}
          {mode === 'magnet' && (
            <>
              <label style={styles.controlLabel}>
                磁力强度：
                <input type="range" min="1" max="15" step="0.5"
                  value={S.current.magStr}
                  onChange={(e) => { S.current.magStr = parseFloat(e.target.value); forceUpdate(n => n + 1) }}
                  style={styles.slider} />
                <span style={styles.sliderVal}>{S.current.magStr.toFixed(1)}</span>
              </label>
              <label style={styles.controlLabel}>
                A质量：
                <input type="range" min="0.5" max="3" step="0.1"
                  value={S.current.magA_m}
                  onChange={(e) => { S.current.magA_m = parseFloat(e.target.value); forceUpdate(n => n + 1) }}
                  style={styles.slider} />
                <span style={styles.sliderVal}>{S.current.magA_m.toFixed(1)}kg</span>
              </label>
              <label style={styles.controlLabel}>
                B质量：
                <input type="range" min="0.5" max="3" step="0.1"
                  value={S.current.magB_m}
                  onChange={(e) => { S.current.magB_m = parseFloat(e.target.value); forceUpdate(n => n + 1) }}
                  style={styles.slider} />
                <span style={styles.sliderVal}>{S.current.magB_m.toFixed(1)}kg</span>
              </label>
            </>
          )}
        </div>
      </div>

      <div style={styles.main}>
        <canvas ref={canvasRef}
          style={{ ...styles.canvas, cursor }}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
        />
      </div>

      <div style={styles.desc}>
        <b>实验：牛顿第三定律</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          {mode === 'spring' && '拖拽弹簧测力计 → 观察两力等大反向 → 验证 F₁ = -F₂'}
          {mode === 'cart' && '释放小车 → 碰撞时观察相互作用力 → 等大反向'}
          {mode === 'magnet' && '点击释放磁铁 → 引力等大反向 → 距离越近力越大'}
        </span>
      </div>
    </div>
  )
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#1a1a2e', color: '#e0e0e0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  toolbar: { minHeight: 44, background: '#16213e', borderBottom: '1px solid #30363d', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', flexShrink: 0, flexWrap: 'wrap', gap: 6 },
  title: { fontSize: 14, fontWeight: 600, color: '#c9d1d9' },
  toolbarActions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  controlLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8b949e' },
  slider: { width: 80, accentColor: '#4FC3F7' },
  sliderVal: { color: '#4FC3F7', fontWeight: 600, minWidth: 40, fontSize: 12 },
  btn: { background: '#30363d', color: '#c9d1d9', border: '1px solid #484f58', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  sep: { width: 1, height: 20, background: '#30363d' },
  modeGroup: { display: 'flex', gap: 4 },
  modeBtn: { background: '#30363d', color: '#8b949e', border: '1px solid #484f58', borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer' },
  modeBtnActive: { background: '#4FC3F7', color: '#000', border: '1px solid #4FC3F7', borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 },
  main: { flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' },
  canvas: { flex: 1, width: '100%' },
  desc: { padding: '8px 14px', background: '#16213e', borderTop: '1px solid #30363d', fontSize: 13, color: '#c9d1d9' },
}
