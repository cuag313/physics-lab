import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * KeplerLawsScene — 开普勒三大定律
 *
 * 坐标系：椭圆中心为原点 (0,0)，太阳在左焦点 (-c, 0)
 * 行星位置：planetX = -c + r·cos(θ), planetY = r·sin(θ)
 *
 * 开普勒方程法：M → E(牛顿迭代) → θ(真近点角)
 * 面积定律由开普勒方程自然保证
 */

const INNER_PLANETS = [
  { name: '水星', a: 0.39, e: 0.21, color: '#B0BEC5', T: 0.24 },
  { name: '金星', a: 0.72, e: 0.01, color: '#FFD54F', T: 0.62 },
  { name: '地球', a: 1.0,  e: 0.02, color: '#4FC3F7', T: 1.0  },
  { name: '火星', a: 1.52, e: 0.09, color: '#F44336', T: 1.88 },
]

const SWEEP_COLORS = [
  'rgba(255,152,0,0.20)', 'rgba(76,175,80,0.20)', 'rgba(79,195,247,0.20)', 'rgba(233,30,99,0.20)',
  'rgba(156,39,176,0.20)', 'rgba(0,188,212,0.20)', 'rgba(255,87,34,0.20)', 'rgba(139,195,74,0.20)',
]

export default function KeplerLawsScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  // 主行星状态（定律1和2用）
  const S = useRef({
    law: 1,
    a: 2.5, e: 0.6, b: 0, c: 0,
    M: 0,             // 平近点角（匀速增加）
    theta: 0,         // 真近点角
    planetX: 0,       // 行星世界坐标x（椭圆中心系）
    planetY: 0,       // 行星世界坐标y
    period: 0,
    sweepPoints: [],  // {x, y, theta} 世界坐标
    sweepTime: 0,
    sweepDuration: 1.5,
    trail: [],
    maxTrail: 600,
    time: 0,
    running: true,
    // 定律3：4颗行星独立运动
    law3Planets: INNER_PLANETS.map(p => ({ ...p, M: Math.random() * 2 * Math.PI })),
  })

  const [law, setLaw] = useState(1)
  const [a, setA] = useState(2.5)
  const [e, setE] = useState(0.6)
  const [, forceUpdate] = useState(0)
  const [records, setRecords] = useState([])
  const [showRecords, setShowRecords] = useState(false)

  // ========== 初始化 ==========
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const R = createRenderer(canvas)
    canvasRef.current._R = R
    computeEllipse()
    // 初始化行星位置
    solveKepler(S.current)
    const loop = () => { updatePhysics(); renderFrame(R); animRef.current = requestAnimationFrame(loop) }
    loop()
    const onResize = () => R.resize()
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function createRenderer(canvas) {
    const R = {
      canvas, ctx: canvas.getContext('2d'), W: 0, H: 0, scale: 80, ox: 0, oy: 0,
      resize() {
        const rect = canvas.getBoundingClientRect()
        canvas.width = rect.width * devicePixelRatio
        canvas.height = rect.height * devicePixelRatio
        this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
        this.W = rect.width; this.H = rect.height
        this.ox = this.W * 0.42; this.oy = this.H * 0.48
      },
      w2s(wx, wy) { return [this.ox + wx * this.scale, this.oy - wy * this.scale] },
      clear() { this.ctx.clearRect(0, 0, this.W, this.H) },
    }
    R.resize()
    return R
  }

  function computeEllipse() {
    const s = S.current
    s.b = s.a * Math.sqrt(1 - s.e * s.e)
    s.c = s.a * s.e
    s.period = Math.pow(s.a, 1.5) // T = a^1.5 (AU→年)
  }

  // ========== 开普勒方程求解 ==========
  function solveKepler(state) {
    // M → E（牛顿迭代）
    let E = state.M
    for (let k = 0; k < 8; k++) {
      E = E - (E - state.e * Math.sin(E) - state.M) / (1 - state.e * Math.cos(E))
    }
    // E → θ（真近点角）
    state.theta = 2 * Math.atan2(
      Math.sqrt(1 + state.e) * Math.sin(E / 2),
      Math.sqrt(1 - state.e) * Math.cos(E / 2)
    )
    // 极径
    const r = state.a * (1 - state.e * state.e) / (1 + state.e * Math.cos(state.theta))
    // 行星世界坐标（椭圆中心系，太阳在 -c）
    state.planetX = -state.c + r * Math.cos(state.theta)
    state.planetY = r * Math.sin(state.theta)
    return r
  }

  // 扇形面积（极坐标积分 A = ½∫r²dθ，以太阳为极点）
  function calcSweepArea(aVal, eVal, theta1, theta2) {
    const steps = 300
    const dθ = (theta2 - theta1) / steps
    let area = 0
    for (let i = 0; i < steps; i++) {
      const θ = theta1 + (i + 0.5) * dθ
      const r = aVal * (1 - eVal * eVal) / (1 + eVal * Math.cos(θ))
      area += 0.5 * r * r * dθ
    }
    return Math.abs(area)
  }

  // ========== 物理更新 ==========
  function updatePhysics() {
    const s = S.current
    if (!s.running) return
    const dt = 1 / 60
    s.time += dt

    // 平近点角匀速增加
    const omega = (2 * Math.PI) / s.period
    s.M += omega * dt
    if (s.M > 2 * Math.PI) s.M -= 2 * Math.PI

    // 解开普勒方程，更新行星位置
    solveKepler(s)

    // 轨迹（世界坐标）
    s.trail.push({ x: s.planetX, y: s.planetY })
    if (s.trail.length > s.maxTrail) s.trail.shift()

    // 定律2：等时间间隔面积采样
    if (s.law === 2) {
      s.sweepTime += dt
      if (s.sweepTime >= s.sweepDuration) {
        s.sweepTime = 0
        const prev = s.sweepPoints.length > 0 ? s.sweepPoints[s.sweepPoints.length - 1] : null
        // 防止跨越0/2π边界时产生异常扇形
        if (!prev || Math.abs(s.theta - prev.theta) < Math.PI) {
          s.sweepPoints.push({ x: s.planetX, y: s.planetY, theta: s.theta })
          if (s.sweepPoints.length > 8) s.sweepPoints.shift()
        }
      }
    }

    // 定律3：4颗行星独立运动
    if (s.law === 3) {
      s.law3Planets.forEach(p => {
        const pOmega = (2 * Math.PI) / Math.pow(p.a, 1.5)
        p.M += pOmega * dt
        if (p.M > 2 * Math.PI) p.M -= 2 * Math.PI
        let E = p.M
        for (let k = 0; k < 8; k++) {
          E = E - (E - p.e * Math.sin(E) - p.M) / (1 - p.e * Math.cos(E))
        }
        p.theta = 2 * Math.atan2(Math.sqrt(1 + p.e) * Math.sin(E / 2), Math.sqrt(1 - p.e) * Math.cos(E / 2))
        const r = p.a * (1 - p.e * p.e) / (1 + p.e * Math.cos(p.theta))
        p.planetX = -p.a * p.e + r * Math.cos(p.theta)
        p.planetY = r * Math.sin(p.theta)
      })
    }

    forceUpdate(n => n + 1)
  }

  // ========== 渲染 ==========
  function renderFrame(R) {
    R.clear()
    drawBackground(R)
    if (S.current.law === 1) drawLaw1(R)
    else if (S.current.law === 2) drawLaw2(R)
    else drawLaw3(R)
    drawInfoPanel(R)
    drawDescription(R)
  }

  function drawBackground(R) {
    R.ctx.fillStyle = '#fff'
    R.ctx.fillRect(0, 0, R.W, R.H)
  }

  // ========== 定律一：椭圆轨道 ==========
  function drawLaw1(R) {
    const ctx = R.ctx, s = S.current

    // 椭圆轨道（中心在世界原点）
    drawOrbitEllipse(ctx, R, s.a, s.b, 0, 0, 'rgba(79,195,247,0.3)')

    // 太阳在左焦点
    const [fx, fy] = R.w2s(-s.c, 0)
    drawSun(ctx, fx, fy)

    // 第二焦点
    const [fx2, fy2] = R.w2s(s.c, 0)
    ctx.fillStyle = 'rgba(100,100,100,0.3)'
    ctx.beginPath(); ctx.arc(fx2, fy2, 4, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#999'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('焦点F₂', fx2, fy2 + 14)

    // 行星
    drawPlanet(ctx, R, s.planetX, s.planetY, '#4FC3F7', 8)
    const [plSx, plSy] = R.w2s(s.planetX, s.planetY)
    ctx.fillStyle = '#4FC3F7'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('🌍 行星', plSx, plSy - 18)

    // 半长轴标注
    const [cx, cy] = R.w2s(0, 0)
    ctx.strokeStyle = 'rgba(255,213,79,0.5)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4])
    const [lx, ly] = R.w2s(-s.a, 0), [rx, ry] = R.w2s(s.a, 0)
    ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(rx, ry); ctx.stroke(); ctx.setLineDash([])
    ctx.fillStyle = '#FFD54F'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(`a = ${s.a.toFixed(1)}`, cx, cy + 14)

    // 半短轴标注
    ctx.strokeStyle = 'rgba(79,195,247,0.4)'; ctx.setLineDash([4, 4])
    const [tx, ty] = R.w2s(0, s.b), [bx, by] = R.w2s(0, -s.b)
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([])
    ctx.fillStyle = '#4FC3F7'; ctx.fillText(`b = ${s.b.toFixed(1)}`, cx + 14, cy)

    // 公式文字
    ctx.fillStyle = '#FFD54F'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
    const [dx, dy] = R.w2s(-s.a - 0.5, s.b + 0.5)
    ctx.fillText('定律一：行星轨道是椭圆', dx, dy)
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'
    ctx.fillText('太阳在椭圆的一个焦点上', dx, dy + 18)
    ctx.fillText(`e = ${s.e.toFixed(2)}`, dx, dy + 36)
  }

  // ========== 定律二：面积定律 ==========
  function drawLaw2(R) {
    const ctx = R.ctx, s = S.current
    const [fx, fy] = R.w2s(-s.c, 0) // 太阳位置

    drawOrbitEllipse(ctx, R, s.a, s.b, 0, 0, 'rgba(79,195,247,0.3)')
    drawSun(ctx, fx, fy)

    // 已扫过区域（从0到当前θ的整体填充）
    ctx.fillStyle = 'rgba(255,213,79,0.12)'
    ctx.beginPath(); ctx.moveTo(fx, fy)
    for (let a = 0; a <= s.theta + 0.01; a += 0.05) {
      const r = s.a * (1 - s.e * s.e) / (1 + s.e * Math.cos(a))
      const [sx, sy] = R.w2s(-s.c + r * Math.cos(a), r * Math.sin(a))
      ctx.lineTo(sx, sy)
    }
    ctx.closePath(); ctx.fill()

    // 等时间扇形
    const areaLabels = []
    const pts = s.sweepPoints
    if (pts.length >= 2) {
      const curPt = { x: s.planetX, y: s.planetY, theta: s.theta }
      const allPts = [...pts, curPt]

      for (let i = 0; i < allPts.length - 1; i++) {
        const p0 = allPts[i], p1 = allPts[i + 1]
        ctx.fillStyle = SWEEP_COLORS[i % SWEEP_COLORS.length]
        ctx.beginPath(); ctx.moveTo(fx, fy)
        const steps = 30
        for (let j = 0; j <= steps; j++) {
          const t = j / steps
          const θ = p0.theta + t * (p1.theta - p0.theta)
          const r = s.a * (1 - s.e * s.e) / (1 + s.e * Math.cos(θ))
          const [sx, sy] = R.w2s(-s.c + r * Math.cos(θ), r * Math.sin(θ))
          ctx.lineTo(sx, sy)
        }
        ctx.closePath(); ctx.fill()

        // 面积数值
        const area = calcSweepArea(s.a, s.e, p0.theta, p1.theta)
        areaLabels.push(area)

        // 面积标注（角平分线方向，极径中点）
        const midθ = (p0.theta + p1.theta) / 2
        const midR = s.a * (1 - s.e * s.e) / (1 + s.e * Math.cos(midθ))
        const [lx, ly] = R.w2s(-s.c + midR * 0.5 * Math.cos(midθ), midR * 0.5 * Math.sin(midθ))
        ctx.fillStyle = '#333'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
        ctx.fillText(`A${i + 1}=${area.toFixed(1)}`, lx, ly)
      }
    }

    // 面积对比
    if (areaLabels.length >= 2) {
      const text = areaLabels.map((a, i) => `A${i + 1}:${a.toFixed(1)}`).join('  ')
      ctx.fillStyle = '#333'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText(text + '  (应相等)', 16, 70)
    }

    // 行星 + 连线
    drawPlanet(ctx, R, s.planetX, s.planetY, '#4FC3F7', 8)
    const [plSx2, plSy2] = R.w2s(s.planetX, s.planetY)
    ctx.fillStyle = '#4FC3F7'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('🌍 行星', plSx2, plSy2 - 18)
    ctx.strokeStyle = 'rgba(100,100,100,0.3)'; ctx.lineWidth = 1
    const [px, py] = R.w2s(s.planetX, s.planetY)
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(px, py); ctx.stroke()

    // 公式
    ctx.fillStyle = '#FFD54F'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
    const [dx, dy] = R.w2s(-s.a - 0.5, s.b + 0.5)
    ctx.fillText('定律二：面积定律', dx, dy)
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'
    ctx.fillText('相等时间扫过相等面积', dx, dy + 18)
    ctx.fillText('近地点快，远地点慢', dx, dy + 36)
  }

  // ========== 定律三：T²∝a³ ==========
  function drawLaw3(R) {
    const ctx = R.ctx, s = S.current
    const sc = 0.7 // 轨道缩放

    // 太阳在焦点（取地球的焦点作为参考）
    const earthC = INNER_PLANETS[2].a * INNER_PLANETS[2].e
    const [sunX, sunY] = R.w2s(-earthC * sc, 0)
    drawSun(ctx, sunX, sunY)

    // 绘制4条轨道 + 运动行星
    s.law3Planets.forEach(p => {
      const b = p.a * Math.sqrt(1 - p.e * p.e)
      const cx = -p.a * p.e * sc // 椭圆中心偏移

      // 轨道
      const [ecx, ecy] = R.w2s(cx, 0)
      ctx.strokeStyle = p.color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.6
      ctx.beginPath()
      ctx.ellipse(ecx, ecy, p.a * R.scale * sc, b * R.scale * sc, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1

      // 标签
      ctx.fillStyle = p.color; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'
      const [lx, ly] = R.w2s(cx + p.a * sc + 0.15, 0)
      ctx.fillText(p.name, lx, ly - 6)

      // 运动行星
      if (p.planetX !== undefined) {
        drawPlanet(ctx, R, p.planetX * sc, p.planetY * sc, p.color, 5)
      }
    })

    // T²-a³ 图表
    const gw = 260, gh = 180, gx = R.W - gw - 30, gy = 60
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, 8); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('📈 T² - a³ 图像', gx + 10, gy + 16)

    const ox = gx + 50, oy = gy + gh - 25, w = gw - 70, h = gh - 45
    ctx.strokeStyle = '#999'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(ox, oy - h); ctx.lineTo(ox, oy); ctx.lineTo(ox + w, oy); ctx.stroke()

    const maxA3 = Math.max(...INNER_PLANETS.map(p => p.a ** 3))
    const maxT2 = Math.max(...INNER_PLANETS.map(p => p.T ** 2))
    const offsets = [[6, -8], [6, 3], [6, -8], [6, 3]]
    INNER_PLANETS.forEach((p, idx) => {
      const px = ox + (p.a ** 3 / maxA3) * w
      const py = oy - (p.T ** 2 / maxT2) * h
      ctx.fillStyle = p.color
      ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill()
      const [offX, offY] = offsets[idx]
      ctx.fillStyle = '#666'; ctx.font = '8px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText(p.name, px + offX, py + offY)
    })

    ctx.strokeStyle = 'rgba(255,152,0,0.5)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + w, oy - h); ctx.stroke(); ctx.setLineDash([])

    ctx.fillStyle = '#999'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('a³', ox + w / 2, oy + 14)
    ctx.save(); ctx.translate(gx + 12, oy - h / 2); ctx.rotate(-Math.PI / 2)
    ctx.fillText('T²', 0, 0); ctx.restore()

    ctx.fillStyle = '#FFD54F'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('T²/a³ = k（常数）', gx + 10, gy + gh - 6)

    ctx.fillStyle = '#FFD54F'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('定律三：T² ∝ a³', 20, R.H - 80)
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'
    ctx.fillText('所有行星的 T²/a³ 相同', 20, R.H - 62)
  }

  // ========== 通用绘制 ==========
  function drawOrbitEllipse(ctx, R, a, b, cx, cy, color) {
    const [sx, sy] = R.w2s(cx, cy)
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash([8, 4])
    ctx.beginPath(); ctx.ellipse(sx, sy, a * R.scale, b * R.scale, 0, 0, Math.PI * 2); ctx.stroke()
    ctx.setLineDash([])
  }

  function drawSun(ctx, x, y) {
    const r = 18
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r * 2)
    grad.addColorStop(0, '#FFF9C4'); grad.addColorStop(0.3, '#FFD54F'); grad.addColorStop(1, 'rgba(255,152,0,0)')
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, r * 2, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#FFD54F'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#FFF9C4'; ctx.beginPath(); ctx.arc(x - 4, y - 4, r * 0.4, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#F57F17'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('☀ 太阳', x, y + r + 16)
  }

  function drawPlanet(ctx, R, wx, wy, color, r) {
    const [sx, sy] = R.w2s(wx, wy)
    const grad = ctx.createRadialGradient(sx - r * 0.3, sy - r * 0.3, r * 0.1, sx, sy, r)
    grad.addColorStop(0, color); grad.addColorStop(1, 'rgba(100,150,200,0.4)')
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.arc(sx - r * 0.25, sy - r * 0.25, r * 0.3, 0, Math.PI * 2); ctx.fill()
  }

  function drawInfoPanel(R) {
    const ctx = R.ctx, s = S.current
    const pw = 220, ph = 160, px = R.W - pw - 16, py = R.H - ph - 16
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('📊 开普勒定律', px + 12, py + 20)
    ctx.font = '11px sans-serif'; let y = py + 40
    ctx.fillStyle = '#666'
    ctx.fillText(`半长轴 a = ${s.a.toFixed(2)} AU`, px + 12, y); y += 16
    ctx.fillText(`偏心率 e = ${s.e.toFixed(3)}`, px + 12, y); y += 16
    ctx.fillText(`半短轴 b = ${s.b.toFixed(2)} AU`, px + 12, y); y += 16
    ctx.fillText(`周期 T = ${s.period.toFixed(2)} (×地球年)`, px + 12, y); y += 16
    const k = (s.period * s.period) / (s.a * s.a * s.a)
    ctx.fillStyle = '#4FC3F7'
    ctx.fillText(`T²/a³ = ${k.toFixed(3)}`, px + 12, y); y += 16
    ctx.fillStyle = '#FFD54F'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText(s.law === 1 ? '椭圆定律' : s.law === 2 ? '面积定律' : '调和定律', px + 12, y)
  }

  function drawDescription(R) {
    const ctx = R.ctx, h = R.H, x = 16, y = h - 40
    ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'
    ctx.fillText('开普勒三大定律', x, y)
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'
    ctx.fillText('切换定律查看不同演示 · 调节滑块改变偏心率和半长轴', x + 130, y)
  }

  // ========== 控制 ==========
  const handleLawChange = useCallback((newLaw) => {
    S.current.law = newLaw
    S.current.trail = []
    S.current.sweepPoints = []
    setLaw(newLaw)
  }, [])

  const handleAChange = useCallback((val) => { S.current.a = val; computeEllipse(); setA(val) }, [])
  const handleEChange = useCallback((val) => { S.current.e = val; computeEllipse(); setE(val) }, [])

  const handleReset = useCallback(() => {
    const s = S.current
    s.M = 0; s.theta = 0; s.time = 0; s.trail = []; s.sweepPoints = []
    s.law3Planets.forEach(p => { p.M = Math.random() * 2 * Math.PI })
  }, [])

  const handlePreset = useCallback((pA, pE) => {
    S.current.a = pA; S.current.e = pE; computeEllipse(); setA(pA); setE(pE)
  }, [])

  const handleRecord = useCallback(() => {
    const s = S.current
    const k = (s.period * s.period) / (s.a * s.a * s.a)
    setRecords(prev => [...prev, { a: s.a.toFixed(2), e: s.e.toFixed(3), T: s.period.toFixed(2), k: k.toFixed(4), id: Date.now() }])
  }, [])

  const presets = [
    { name: '水星', a: 0.39, e: 0.21 },
    { name: '金星', a: 0.72, e: 0.01 },
    { name: '地球', a: 1.0,  e: 0.02 },
    { name: '火星', a: 1.52, e: 0.09 },
  ]

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <span style={styles.title}>开普勒三大定律</span>
        <div style={styles.toolbarActions}>
          <button style={styles.btn} onClick={handleReset}>↺ 重置</button>
          <button style={styles.btn} onClick={handleRecord}>📝 记录</button>
          <button style={styles.btn} onClick={() => setShowRecords(v => !v)}>{showRecords ? '隐藏数据' : '📋 数据表'}</button>
          <div style={styles.sep} />
          <div style={styles.modeGroup}>
            {[1, 2, 3].map(l => (
              <button key={l} style={law === l ? styles.modeBtnActive : styles.modeBtn} onClick={() => handleLawChange(l)}>定律{l}</button>
            ))}
          </div>
          <div style={styles.sep} />
          <div style={styles.modeGroup}>
            {presets.map(p => (
              <button key={p.name} style={styles.presetBtn} onClick={() => handlePreset(p.a, p.e)} title={`a=${p.a}, e=${p.e}`}>{p.name}</button>
            ))}
          </div>
          <div style={styles.sep} />
          <label style={styles.controlLabel}>
            半长轴 a：
            <input type="range" min="0.3" max="5" step="0.1" value={a} onChange={ev => handleAChange(parseFloat(ev.target.value))} style={styles.slider} />
            <span style={styles.sliderVal}>{a.toFixed(1)}</span>
          </label>
          <label style={styles.controlLabel}>
            偏心率 e：
            <input type="range" min="0" max="0.9" step="0.01" value={e} onChange={ev => handleEChange(parseFloat(ev.target.value))} style={styles.slider} />
            <span style={styles.sliderVal}>{e.toFixed(2)}</span>
          </label>
        </div>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={styles.canvas} />
        {showRecords && records.length > 0 && (
          <div style={styles.recordPanel}>
            <div style={styles.recordHeader}>
              <span style={{ fontWeight: 600, color: '#333' }}>📊 数据记录</span>
              <button style={styles.recordClearBtn} onClick={() => setRecords([])}>清空</button>
            </div>
            <table style={styles.recordTable}>
              <thead><tr><th style={styles.th}>#</th><th style={styles.th}>a</th><th style={styles.th}>e</th><th style={styles.th}>T</th><th style={styles.th}>T²/a³</th></tr></thead>
              <tbody>{records.map((rec, i) => (<tr key={rec.id}><td style={styles.td}>{i + 1}</td><td style={styles.td}>{rec.a}</td><td style={styles.td}>{rec.e}</td><td style={styles.td}>{rec.T}</td><td style={styles.td}>{rec.k}</td></tr>))}</tbody>
            </table>
          </div>
        )}
      </div>
      <div style={styles.desc}>
        <b>开普勒三大定律</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>定律一：椭圆轨道 · 定律二：面积定律 · 定律三：T²∝a³ · 调节滑块改变偏心率和半长轴</span>
      </div>
    </div>
  )
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#e8e8e8', color: '#333', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  toolbar: { minHeight: 44, background: '#f5f5f5', borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', flexShrink: 0, flexWrap: 'wrap', gap: 6 },
  title: { fontSize: 14, fontWeight: 600, color: '#333' },
  toolbarActions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  controlLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#666' },
  slider: { width: 70, accentColor: '#FFD54F' },
  sliderVal: { color: '#FFD54F', fontWeight: 600, minWidth: 35, fontSize: 12 },
  btn: { background: '#f0f0f0', color: '#333', border: '1px solid #ddd', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  sep: { width: 1, height: 20, background: '#ddd' },
  modeGroup: { display: 'flex', gap: 4 },
  modeBtn: { background: '#f0f0f0', color: '#666', border: '1px solid #ddd', borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer' },
  modeBtnActive: { background: '#FFD54F', color: '#000', border: '1px solid #FFD54F', borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 },
  presetBtn: { background: '#f0f0f0', color: '#333', border: '1px solid #ddd', borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer' },
  main: { flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' },
  canvas: { flex: 1, width: '100%' },
  desc: { padding: '8px 14px', background: '#f5f5f5', borderTop: '1px solid #ccc', fontSize: 13, color: '#333' },
  recordPanel: { position: 'absolute', top: 10, left: 10, background: 'rgba(255,255,255,0.95)', border: '1px solid #ddd', borderRadius: 8, padding: 10, maxHeight: 300, overflowY: 'auto', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', zIndex: 10 },
  recordHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  recordClearBtn: { background: '#ff5252', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer' },
  recordTable: { borderCollapse: 'collapse', fontSize: 11 },
  th: { borderBottom: '1px solid #ddd', padding: '4px 8px', textAlign: 'left', color: '#333', fontWeight: 600 },
  td: { borderBottom: '1px solid #eee', padding: '4px 8px', color: '#666' },
}
