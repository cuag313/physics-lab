import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * KeplerLawsScene — 开普勒三大定律
 *
 * 定律一（椭圆定律）：行星绕太阳做椭圆运动，太阳在椭圆的一个焦点上
 * 定律二（面积定律）：行星与太阳的连线在相等时间内扫过相等面积
 * 定律三（调和定律）：T²/a³ = k（常数）
 *
 * 交互：
 * - 切换定律演示
 * - 调节滑块改变偏心率和半长轴
 * - 实时显示周期、面积、T²/a³
 */
export default function KeplerLawsScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    law: 1,              // 1 | 2 | 3

    // 椭圆参数
    a: 2.5,              // 半长轴 m (scaled)
    e: 0.6,              // 偏心率 (0~0.9)
    b: 0,                // 半短轴 (computed)
    c: 0,                // 焦距 (computed)

    // 行星
    angle: 0,            // 真近点角
    M: 0,                // 平近点角
    planetX: 0,          // 行星位置x（以太阳为原点）
    planetY: 0,          // 行星位置y
    omega: 0,            // 平均角速度（由period推导）
    period: 0,           // 周期
    planetR: 0.15,

    // 面积定律
    sweepPoints: [],     // 等时间间隔采样点 [{x,y,angle}]
    sweepTime: 0,
    sweepDuration: 1.5,  // 每段扫过的时间（秒）
    sweepArea: 0,

    // 第三定律数据
    planets: [
      { name: '水星', a: 0.39, T: 0.24, color: '#B0BEC5' },
      { name: '金星', a: 0.72, T: 0.62, color: '#FFD54F' },
      { name: '地球', a: 1.0, T: 1.0, color: '#4FC3F7' },
      { name: '火星', a: 1.52, T: 1.88, color: '#F44336' },
      { name: '木星', a: 5.2, T: 11.86, color: '#FF9800' },
      { name: '土星', a: 9.54, T: 29.46, color: '#CE93D8' },
    ],

    time: 0,
    running: true,
    trail: [],
    maxTrail: 500,
  })

  const [law, setLaw] = useState(1)
  const [a, setA] = useState(2.5)
  const [e, setE] = useState(0.6)
  const [, forceUpdate] = useState(0)
  const [records, setRecords] = useState([])
  const [showRecords, setShowRecords] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const R = createRenderer(canvas)
    canvasRef.current._R = R

    computeEllipse()

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
      canvas, ctx: canvas.getContext('2d'),
      W: 0, H: 0, scale: 80, ox: 0, oy: 0,
      resize() {
        const rect = canvas.getBoundingClientRect()
        canvas.width = rect.width * devicePixelRatio
        canvas.height = rect.height * devicePixelRatio
        this.ctx.scale(devicePixelRatio, devicePixelRatio)
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
    s.period = Math.pow(s.a, 1.5) // T=a^1.5, 单位: AU→年
    s.omega = (2 * Math.PI) / s.period // 由period推导
  }

  // 计算扇形面积（数值积分 A = 0.5 * ∫r²dθ）
  function calcSweepArea(aVal, eVal, startAngle, endAngle) {
    const steps = 200
    const dθ = (endAngle - startAngle) / steps
    let area = 0
    for (let i = 0; i < steps; i++) {
      const θ = startAngle + (i + 0.5) * dθ
      const r = aVal * (1 - eVal * eVal) / (1 + eVal * Math.cos(θ))
      area += 0.5 * r * r * dθ
    }
    return Math.abs(area)
  }

  // ========== Physics ==========
  function updatePhysics() {
    const s = S.current
    if (!s.running) return

    const dt = 1 / 60
    s.time += dt

    // 开普勒方程法：平近点角匀速增加
    s.M += s.omega * dt
    if (s.M > 2 * Math.PI) s.M -= 2 * Math.PI

    // 解开普勒方程 M = E - e·sinE（牛顿迭代5次）
    let E = s.M
    for (let k = 0; k < 5; k++) {
      E = E - (E - s.e * Math.sin(E) - s.M) / (1 - s.e * Math.cos(E))
    }

    // 真近点角
    const theta = 2 * Math.atan2(
      Math.sqrt(1 + s.e) * Math.sin(E / 2),
      Math.sqrt(1 - s.e) * Math.cos(E / 2)
    )
    s.angle = theta
    if (s.angle < 0) s.angle += 2 * Math.PI

    // 行星位置（以太阳/焦点为原点）
    const r = s.a * (1 - s.e * s.e) / (1 + s.e * Math.cos(theta))
    s.planetX = r * Math.cos(theta)
    s.planetY = r * Math.sin(theta)

    // 轨迹
    s.trail.push({ x: s.planetX, y: s.planetY })
    if (s.trail.length > s.maxTrail) s.trail.shift()

    // 面积扫过（等时间间隔采样）
    if (s.law === 2) {
      s.sweepTime += dt
      if (s.sweepTime >= s.sweepDuration) {
        s.sweepTime = 0
        // 记录当前位置（使用开普勒方程计算的世界坐标）
        s.sweepPoints.push({ x: s.planetX, y: s.planetY, angle: s.angle })
        if (s.sweepPoints.length > 8) s.sweepPoints.shift()
      }
    }

    forceUpdate(n => n + 1)
  }

  // ========== Render ==========
  function renderFrame(R) {
    const ctx = R.ctx
    R.clear()

    drawBackground(ctx, R)

    if (S.current.law === 1) drawLaw1(ctx, R)
    else if (S.current.law === 2) drawLaw2(ctx, R)
    else drawLaw3(ctx, R)

    drawInfoPanel(ctx, R)
    drawDescription(ctx, R)
  }

  function drawBackground(ctx, R) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, R.W, R.H)
  }

  // ========== 定律一：椭圆轨道 ==========
  function drawLaw1(ctx, R) {
    const s = S.current

    // 绘制椭圆轨道
    drawOrbit(ctx, R)

    // 太阳（焦点）
    const [fx, fy] = R.w2s(-s.c, 0)
    drawSun(ctx, fx, fy)

    // 第二焦点（虚线）
    const [fx2, fy2] = R.w2s(s.c, 0)
    ctx.fillStyle = 'rgba(100,100,100,0.3)'
    ctx.beginPath(); ctx.arc(fx2, fy2, 4, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#999'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('焦点F₂', fx2, fy2 + 14)

    // 行星（开普勒方程计算位置）
    drawPlanet(ctx, R, s.planetX, s.planetY, '#4FC3F7', 8)

    // 行星标签
    const [plSx, plSy] = R.w2s(s.planetX, s.planetY)
    ctx.fillStyle = '#4FC3F7'
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('🌍 行星', plSx, plSy - 18)

    // 标注
    const [cx, cy] = R.w2s(0, 0)
    // 半长轴
    ctx.strokeStyle = 'rgba(255,213,79,0.5)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4])
    const [lx, ly] = R.w2s(-s.a, 0)
    const [rx, ry] = R.w2s(s.a, 0)
    ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(rx, ry); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#FFD54F'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(`a = ${s.a.toFixed(1)}`, cx, cy + 14)

    // 半短轴
    ctx.strokeStyle = 'rgba(79,195,247,0.4)'; ctx.setLineDash([4, 4])
    const [tx, ty] = R.w2s(0, s.b)
    const [bx, by] = R.w2s(0, -s.b)
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(bx, by); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#4FC3F7'; ctx.fillText(`b = ${s.b.toFixed(1)}`, cx + 14, cy)

    // 公式
    ctx.fillStyle = '#FFD54F'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
    const [dx, dy] = R.w2s(-s.a - 0.5, s.b + 0.5)
    ctx.fillText('定律一：行星轨道是椭圆', dx, dy)
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'
    ctx.fillText('太阳在椭圆的一个焦点上', dx, dy + 18)
    ctx.fillText(`e = ${s.e.toFixed(2)}`, dx, dy + 36)
  }

  // ========== 定律二：面积定律 ==========
  function drawLaw2(ctx, R) {
    const s = S.current

    drawOrbit(ctx, R)

    // 太阳
    const [fx, fy] = R.w2s(-s.c, 0)
    drawSun(ctx, fx, fy)

    // 扫过的面积（等时间间隔扇形）
    const colors = ['rgba(255,152,0,0.18)', 'rgba(76,175,80,0.18)', 'rgba(79,195,247,0.18)', 'rgba(233,30,99,0.18)', 'rgba(156,39,176,0.18)', 'rgba(0,188,212,0.18)', 'rgba(255,87,34,0.18)', 'rgba(139,195,74,0.18)']
    const areaLabels = []
    const pts = s.sweepPoints
    if (pts.length >= 2) {
      // 添加当前行星位置作为最后一个点
      const curPt = { x: s.planetX, y: s.planetY, angle: s.angle }
      const allPts = [...pts, curPt]

      for (let i = 0; i < allPts.length - 1; i++) {
        const p0 = allPts[i]
        const p1 = allPts[i + 1]

        // 画扇形
        ctx.fillStyle = colors[i % colors.length]
        ctx.beginPath()
        ctx.moveTo(fx, fy)
        // 从p0到p1沿椭圆弧
        const steps = 20
        for (let j = 0; j <= steps; j++) {
          const t = j / steps
          const a = p0.angle + t * (p1.angle - p0.angle)
          const r = s.a * (1 - s.e * s.e) / (1 + s.e * Math.cos(a))
          const [sx, sy] = R.w2s(r * Math.cos(a), r * Math.sin(a))
          ctx.lineTo(sx, sy)
        }
        ctx.closePath(); ctx.fill()

        // 计算面积
        const area = calcSweepArea(s.a, s.e, p0.angle, p1.angle)
        areaLabels.push(area)

        // 在扇形中心显示面积值
        const midAngle = (p0.angle + p1.angle) / 2
        const rMid = s.a * (1 - s.e * s.e) / (1 + s.e * Math.cos(midAngle))
        const [lx, ly] = R.w2s(rMid * Math.cos(midAngle) * 0.6, rMid * Math.sin(midAngle) * 0.6)
        ctx.fillStyle = '#333'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'
        ctx.fillText(`A${i + 1}=${area.toFixed(1)}`, lx, ly)
      }
    }

    // 面积对比提示
    if (areaLabels.length >= 2) {
      const text = areaLabels.map((a, i) => `面积${i + 1}: ${a.toFixed(1)}`).join('  ')
      const verifyText = text + '  (应相等)'
      ctx.fillStyle = '#333'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText(verifyText, 16, 70)
    }

    // 当前扫过
    ctx.fillStyle = 'rgba(255,213,79,0.2)'
    ctx.beginPath(); ctx.moveTo(fx, fy)
    for (let a = 0; a <= s.angle; a += 0.05) {
      const r = s.a * (1 - s.e * s.e) / (1 + s.e * Math.cos(a))
      const [sx, sy] = R.w2s(r * Math.cos(a), r * Math.sin(a))
      ctx.lineTo(sx, sy)
    }
    ctx.closePath(); ctx.fill()

    // 行星（开普勒方程位置）
    drawPlanet(ctx, R, s.planetX, s.planetY, '#4FC3F7', 8)

    // 行星标签
    const [plSx2, plSy2] = R.w2s(s.planetX, s.planetY)
    ctx.fillStyle = '#4FC3F7'
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('🌍 行星', plSx2, plSy2 - 18)

    // 连线
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
  function drawLaw3(ctx, R) {
    const s = S.current

    // 绘制行星轨道对比（按比例缩放）
    const orbits = [
      { name: '水星', a: 0.39, e: 0.21, color: '#B0BEC5' },
      { name: '金星', a: 0.72, e: 0.01, color: '#FFD54F' },
      { name: '地球', a: 1.0, e: 0.02, color: '#4FC3F7' },
      { name: '火星', a: 1.52, e: 0.09, color: '#F44336' },
    ]

    const [cx, cy] = R.w2s(0, 0)
    drawSun(ctx, cx, cy)

    orbits.forEach(orb => {
      const b = orb.a * Math.sqrt(1 - orb.e * orb.e)
      ctx.strokeStyle = orb.color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.6
      ctx.beginPath()
      ctx.ellipse(cx, cy, orb.a * R.scale * 0.7, b * R.scale * 0.7, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1

      // 标签
      ctx.fillStyle = orb.color; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'
      const [lx, ly] = R.w2s(orb.a * 0.7 + 0.2, 0)
      ctx.fillText(orb.name, lx, ly - 6)
    })

    // T²-a³ 图表
    const gw = 260, gh = 180
    const gx = R.W - gw - 30, gy = 60

    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, 8); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('📈 T² - a³ 图像', gx + 10, gy + 16)

    const ox = gx + 50, oy = gy + gh - 25
    const w = gw - 70, h = gh - 45

    ctx.strokeStyle = '#999'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(ox, oy - h); ctx.lineTo(ox, oy); ctx.lineTo(ox + w, oy); ctx.stroke()

    const chartPlanets = s.planets.slice(0, 4) // 仅显示4颗行星
    const maxA3 = Math.max(...chartPlanets.map(p => p.a * p.a * p.a))
    const maxT2 = Math.max(...chartPlanets.map(p => p.T * p.T))

    // 数据点（带偏移标签避免重叠）
    const labelOffsets = [[6, -8], [6, 3], [6, -8], [6, 3]] // 交替上下偏移
    chartPlanets.forEach((p, idx) => {
      const a3 = p.a * p.a * p.a
      const t2 = p.T * p.T
      const px = ox + (a3 / maxA3) * w
      const py = oy - (t2 / maxT2) * h

      ctx.fillStyle = p.color
      ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill()

      const [offX, offY] = labelOffsets[idx] || [6, 3]
      ctx.fillStyle = '#666'; ctx.font = '8px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText(p.name, px + offX, py + offY)
    })

    // 理论线
    ctx.strokeStyle = 'rgba(255,152,0,0.5)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + w, oy - h); ctx.stroke()
    ctx.setLineDash([])

    // 轴标签
    ctx.fillStyle = '#999'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('a³', ox + w / 2, oy + 14)
    ctx.save(); ctx.translate(gx + 12, oy - h / 2); ctx.rotate(-Math.PI / 2)
    ctx.fillText('T²', 0, 0); ctx.restore()

    // k值
    ctx.fillStyle = '#FFD54F'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText(`T²/a³ = k（常数）`, gx + 10, gy + gh - 6)

    // 公式
    ctx.fillStyle = '#FFD54F'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('定律三：T² ∝ a³', 20, R.H - 80)
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'
    ctx.fillText('所有行星的 T²/a³ 相同', 20, R.H - 62)
  }

  // ========== 通用绘制 ==========
  function drawOrbit(ctx, R) {
    const s = S.current
    const [cx, cy] = R.w2s(0, 0)
    const aPx = s.a * R.scale
    const bPx = s.b * R.scale

    ctx.strokeStyle = 'rgba(79,195,247,0.3)'; ctx.lineWidth = 2
    ctx.setLineDash([8, 4])
    ctx.beginPath()
    ctx.ellipse(cx, cy, aPx, bPx, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])

    // 轨迹
    if (s.trail.length > 1) {
      for (let i = 1; i < s.trail.length; i++) {
        const alpha = (i / s.trail.length) * 0.5
        const [x1, y1] = R.w2s(s.trail[i - 1].x, s.trail[i - 1].y)
        const [x2, y2] = R.w2s(s.trail[i].x, s.trail[i].y)
        ctx.strokeStyle = `rgba(255,152,0,${alpha})`; ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
      }
    }
  }

  function drawSun(ctx, x, y) {
    const r = 18
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r * 2)
    grad.addColorStop(0, '#FFF9C4'); grad.addColorStop(0.3, '#FFD54F'); grad.addColorStop(1, 'rgba(255,152,0,0)')
    ctx.fillStyle = grad
    ctx.beginPath(); ctx.arc(x, y, r * 2, 0, Math.PI * 2); ctx.fill()

    ctx.fillStyle = '#FFD54F'
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()

    ctx.fillStyle = '#FFF9C4'
    ctx.beginPath(); ctx.arc(x - 4, y - 4, r * 0.4, 0, Math.PI * 2); ctx.fill()

    ctx.fillStyle = '#F57F17'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('☀ 太阳', x, y + r + 16)
  }

  function drawPlanet(ctx, R, wx, wy, color, r) {
    const [sx, sy] = R.w2s(wx, wy)

    const grad = ctx.createRadialGradient(sx - r * 0.3, sy - r * 0.3, r * 0.1, sx, sy, r)
    grad.addColorStop(0, color); grad.addColorStop(1, 'rgba(100,150,200,0.4)')
    ctx.fillStyle = grad
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill()

    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.beginPath(); ctx.arc(sx - r * 0.25, sy - r * 0.25, r * 0.3, 0, Math.PI * 2); ctx.fill()
  }

  function drawInfoPanel(ctx, R) {
    const s = S.current
    const pw = 220, ph = 160
    const px = R.W - pw - 16, py = R.H - ph - 16

    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.stroke()

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

  function drawDescription(ctx, R) {
    const h = R.H, x = 16, y = h - 40
    ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'
    ctx.fillText('开普勒三大定律', x, y)
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'
    ctx.fillText('切换定律查看不同演示 · 调节滑块改变偏心率和半长轴', x + 130, y)
  }

  // ========== Controls ==========
  const handleLawChange = useCallback((newLaw) => {
    S.current.law = newLaw
    S.current.trail = []
    S.current.sweepPoints = []
    setLaw(newLaw)
  }, [])

  const handleAChange = useCallback((val) => {
    S.current.a = val
    computeEllipse()
    setA(val)
  }, [])

  const handleEChange = useCallback((val) => {
    S.current.e = val
    computeEllipse()
    setE(val)
  }, [])

  const handleReset = useCallback(() => {
    S.current.angle = 0
    S.current.M = 0
    S.current.time = 0
    S.current.trail = []
    S.current.sweepPoints = []
  }, [])

  // 行星预设
  const handlePreset = useCallback((presetA, presetE) => {
    S.current.a = presetA
    S.current.e = presetE
    computeEllipse()
    setA(presetA)
    setE(presetE)
  }, [])

  // 数据记录
  const handleRecord = useCallback(() => {
    const s = S.current
    const k = (s.period * s.period) / (s.a * s.a * s.a)
    setRecords(prev => [...prev, {
      a: s.a.toFixed(2),
      e: s.e.toFixed(3),
      T: s.period.toFixed(2),
      k: k.toFixed(4),
      id: Date.now(),
    }])
  }, [])

  const handleClearRecords = useCallback(() => {
    setRecords([])
  }, [])

  const presets = [
    { name: '水星', a: 0.39, e: 0.21 },
    { name: '金星', a: 0.72, e: 0.01 },
    { name: '地球', a: 1.0, e: 0.02 },
    { name: '火星', a: 1.52, e: 0.09 },
  ]

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <span style={styles.title}>开普勒三大定律</span>
        <div style={styles.toolbarActions}>
          <button style={styles.btn} onClick={handleReset}>↺ 重置</button>
          <button style={styles.btn} onClick={handleRecord}>📝 记录数据</button>
          <button style={styles.btn} onClick={() => setShowRecords(v => !v)}>
            {showRecords ? '隐藏数据' : '📋 数据表'}
          </button>
          <div style={styles.sep} />
          <div style={styles.modeGroup}>
            {[1, 2, 3].map(l => (
              <button key={l}
                style={law === l ? styles.modeBtnActive : styles.modeBtn}
                onClick={() => handleLawChange(l)}>
                定律{l}
              </button>
            ))}
          </div>
          <div style={styles.sep} />
          <div style={styles.modeGroup}>
            {presets.map(p => (
              <button key={p.name}
                style={styles.presetBtn}
                onClick={() => handlePreset(p.a, p.e)}
                title={`a=${p.a}, e=${p.e}`}>
                {p.name}
              </button>
            ))}
          </div>
          <div style={styles.sep} />
          <label style={styles.controlLabel}>
            半长轴 a：
            <input type="range" min="0.3" max="4" step="0.1"
              value={a}
              onChange={(ev) => handleAChange(parseFloat(ev.target.value))}
              style={styles.slider} />
            <span style={styles.sliderVal}>{a.toFixed(1)}</span>
          </label>
          <label style={styles.controlLabel}>
            偏心率 e：
            <input type="range" min="0" max="0.9" step="0.01"
              value={e}
              onChange={(ev) => handleEChange(parseFloat(ev.target.value))}
              style={styles.slider} />
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
              <button style={styles.recordClearBtn} onClick={handleClearRecords}>清空</button>
            </div>
            <table style={styles.recordTable}>
              <thead>
                <tr>
                  <th style={styles.th}>#</th>
                  <th style={styles.th}>a (AU)</th>
                  <th style={styles.th}>e</th>
                  <th style={styles.th}>T</th>
                  <th style={styles.th}>T²/a³</th>
                </tr>
              </thead>
              <tbody>
                {records.map((rec, i) => (
                  <tr key={rec.id}>
                    <td style={styles.td}>{i + 1}</td>
                    <td style={styles.td}>{rec.a}</td>
                    <td style={styles.td}>{rec.e}</td>
                    <td style={styles.td}>{rec.T}</td>
                    <td style={styles.td}>{rec.k}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div style={styles.desc}>
        <b>开普勒三大定律</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          定律一：椭圆轨道 · 定律二：面积定律 · 定律三：T²∝a³ · 调节滑块改变偏心率和半长轴
        </span>
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
  recordPanel: {
    position: 'absolute', top: 10, left: 10, background: 'rgba(255,255,255,0.95)',
    border: '1px solid #ddd', borderRadius: 8, padding: 10, maxHeight: 300, overflowY: 'auto',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)', zIndex: 10,
  },
  recordHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  recordClearBtn: { background: '#ff5252', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer' },
  recordTable: { borderCollapse: 'collapse', fontSize: 11 },
  th: { borderBottom: '1px solid #ddd', padding: '4px 8px', textAlign: 'left', color: '#333', fontWeight: 600 },
  td: { borderBottom: '1px solid #eee', padding: '4px 8px', color: '#666' },
}
