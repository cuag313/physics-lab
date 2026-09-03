import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * NewtonSecondLawScene — 验证牛顿第二定律 F=ma
 *
 * 双模式：
 * - a-F（控制变量法：m不变，改变F）
 * - a-1/m（控制变量法：F不变，改变m）
 *
 * 双物理模型：
 * - 近似模式：F≈Mg, a=F/m（教材简化，M<<m时成立）
 * - 精确模式：T=Mmg/(m+M), a=T/m（绳子张力精确解）
 */
export default function NewtonSecondLawScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const rendererRef = useRef(null)
  const lastTimeRef = useRef(0)

  const stateRef = useRef({
    cartMass: 1.0,
    hangingMass: 0.05,
    frictionMu: 0.02,
    cartX: 0,
    cartV: 0,
    hangY: 0,         // 砝码下落距离
    running: false,
    paused: false,
    time: 0,
    dataPoints: [],    // {x, y, label}
    mode: 'force',     // 'force' | 'mass'
    physicsMode: 'approx', // 'approx' | 'precise'
  })

  // 实时数据用 ref，canvas 直接读
  const liveRef = useRef(null)
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [, uiTick] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const renderer = createRenderer(canvas)
    rendererRef.current = renderer
    lastTimeRef.current = performance.now()

    const loop = (now) => {
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.05)
      lastTimeRef.current = now
      updatePhysics(dt)
      renderFrame(renderer)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)

    const onResize = () => renderer.resize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [])

  function createRenderer(canvas) {
    const r = {
      canvas, ctx: canvas.getContext('2d'), screenW: 0, screenH: 0,
      resize() {
        const rect = canvas.getBoundingClientRect()
        canvas.width = rect.width * devicePixelRatio
        canvas.height = rect.height * devicePixelRatio
        this.ctx.scale(devicePixelRatio, devicePixelRatio)
        this.screenW = rect.width
        this.screenH = rect.height
      },
      clear() { this.ctx.clearRect(0, 0, this.screenW, this.screenH) },
    }
    r.resize()
    return r
  }

  // ═══════════════════════════════════════════
  // 物理引擎（统一动力学：含摩擦）
  // ═══════════════════════════════════════════
  // 砝码：Mg - T = Ma
  // 小车：T - f = ma，f = μmg
  // 联立：a = (Mg - μmg) / (m+M)
  //       T = M(g - a)         （绳子真实张力）
  //       f = μmg
  // 校验：T - f = ma  ✓
  //       Mg - T = Ma ✓
  function updatePhysics(dt) {
    const s = stateRef.current
    if (!s.running || s.paused) return

    s.time += dt
    const m = s.cartMass
    const M = s.hangingMass
    const g = 9.8
    const mu = s.frictionMu

    // 砝码是否已落地
    const massLanded = s.hangY > 1.5

    let a, tension, frictionForce

    if (massLanded) {
      // 砝码落地 → 绳子松弛 T=0，小车只受摩擦力减速
      frictionForce = mu * m * g
      a = -frictionForce / m  // 摩擦减速
      tension = 0
    } else {
      // 正常运动：统一动力学公式
      frictionForce = mu * m * g
      a = (M * g - frictionForce) / (m + M)
      tension = m * (a + mu * g)  // 真实张力 T=m(a+μg)
    }

    s.cartV += a * dt
    s.cartX += s.cartV * dt
    if (!massLanded) {
      s.hangY += a * dt  // 砝码下落距离 = 小车位移（绳子不可伸长）
    }

    // 边界检测
    let stopped = false
    if (s.cartX > 3) { s.cartX = 3; s.cartV = 0; stopped = true }
    if (s.cartX < 0) { s.cartX = 0; s.cartV = 0; stopped = true }
    if (massLanded && Math.abs(s.cartV) < 0.001) { s.cartV = 0; stopped = true }
    if (Math.abs(s.cartV) < 0.0001 && Math.abs(a) < 0.001 && s.time > 0.1 && !massLanded) {
      s.cartV = 0; stopped = true
    }

    if (stopped) {
      s.running = false
      setRunning(false)
      collectDataPoint()
    }

    // 实时数据（统一动力学，T-f=ma 恒成立）
    const F_car = tension - frictionForce  // 小车合外力 = ma
    liveRef.current = {
      a, tension, friction: frictionForce,
      F_weight: M * g,
      F_car,
      check1: tension - frictionForce - m * a,  // 应≈0
      check2: M * g - tension - M * a,           // 应≈0
      v: s.cartV, x: s.cartX, t: s.time,
      massLanded,
    }
  }

  function collectDataPoint() {
    const s = stateRef.current
    const live = liveRef.current
    if (!live || Math.abs(live.a) < 0.001) return

    if (s.mode === 'force') {
      // a-F：x=拉力（或Mg），y=加速度
      const xVal = s.physicsMode === 'approx' ? s.hangingMass * 9.8 : live.tension
      s.dataPoints.push({ x: xVal, y: live.a, label: `F=${xVal.toFixed(2)}N` })
    } else {
      // a-1/m：x=1/m，y=加速度
      s.dataPoints.push({ x: 1 / s.cartMass, y: live.a, label: `1/m=${(1/s.cartMass).toFixed(2)}` })
    }
    // 按 x 排序
    s.dataPoints.sort((a, b) => a.x - b.x)
  }

  // ═══════════════════════════════════════════
  // 渲染
  // ═══════════════════════════════════════════
  function renderFrame(renderer) {
    renderer.clear()
    drawScene(renderer)
    drawGraph(renderer)
    drawDataPanel(renderer)
  }

  function drawScene(r) {
    const ctx = r.ctx
    const s = stateRef.current
    const w = r.screenW, h = r.screenH

    // 桌面
    const tableY = h * 0.55
    ctx.fillStyle = '#e8ecf0'
    ctx.fillRect(0, tableY, w, h - tableY)
    ctx.strokeStyle = '#b0bec5'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(0, tableY); ctx.lineTo(w, tableY); ctx.stroke()

    // 轨道
    const trackLeft = 60, trackRight = w * 0.65
    ctx.strokeStyle = '#6e7681'; ctx.lineWidth = 4
    ctx.beginPath(); ctx.moveTo(trackLeft, tableY - 4); ctx.lineTo(trackRight, tableY - 4); ctx.stroke()

    // 刻度
    ctx.fillStyle = 'rgba(100,130,160,0.5)'; ctx.font = '9px monospace'
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    const trackLen = 3 // 3m
    for (let i = 0; i <= 3; i++) {
      const x = trackLeft + (i / trackLen) * (trackRight - trackLeft)
      ctx.fillText(`${i}m`, x, tableY + 4)
      ctx.strokeStyle = 'rgba(100,130,160,0.3)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(x, tableY - 4); ctx.lineTo(x, tableY + 2); ctx.stroke()
    }

    // 滑轮（轨道右端）
    const pulleyX = trackRight
    const pulleyY = tableY - 50
    ctx.strokeStyle = '#6e7681'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(pulleyX, tableY - 4); ctx.lineTo(pulleyX, pulleyY); ctx.stroke()
    ctx.fillStyle = '#4a5568'; ctx.beginPath(); ctx.arc(pulleyX, pulleyY, 10, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#718096'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(pulleyX, pulleyY, 10, 0, Math.PI * 2); ctx.stroke()
    ctx.fillStyle = '#a0aec0'; ctx.beginPath(); ctx.arc(pulleyX, pulleyY, 3, 0, Math.PI * 2); ctx.fill()

    // 小车
    const carScale = (trackRight - trackLeft) / trackLen
    const carX = trackLeft + s.cartX * carScale
    const carW = 50, carH = 30
    const grad = ctx.createLinearGradient(carX - carW/2, tableY - carH - 8, carX + carW/2, tableY - 8)
    grad.addColorStop(0, '#4a90d9'); grad.addColorStop(1, '#2a5f9e')
    ctx.fillStyle = grad
    ctx.beginPath(); ctx.roundRect(carX - carW/2, tableY - carH - 8, carW, carH, 4); ctx.fill()
    ctx.strokeStyle = '#6ab0ff'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.roundRect(carX - carW/2, tableY - carH - 8, carW, carH, 4); ctx.stroke()
    // 车轮
    ctx.fillStyle = '#2d2d2d'
    ctx.beginPath(); ctx.arc(carX - 14, tableY - 3, 6, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(carX + 14, tableY - 3, 6, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(carX - 14, tableY - 3, 6, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.arc(carX + 14, tableY - 3, 6, 0, Math.PI * 2); ctx.stroke()
    // 质量标签
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(`${s.cartMass.toFixed(1)}kg`, carX, tableY - carH/2 - 4)

    // 绳子
    ctx.strokeStyle = '#a0aec0'; ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(carX + carW/2, tableY - 18)
    ctx.lineTo(pulleyX, pulleyY)
    const hangDrop = 20 + s.hangY * 80
    ctx.lineTo(pulleyX, pulleyY + hangDrop)
    ctx.stroke()

    // 悬挂砝码
    const my = pulleyY + hangDrop
    const mr = 8 + s.hangingMass * 60
    ctx.fillStyle = '#FF6B6B'
    ctx.beginPath(); ctx.roundRect(pulleyX - mr*0.7, my, mr*1.4, mr*1.2, 3); ctx.fill()
    ctx.strokeStyle = '#ff9999'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(pulleyX - mr*0.7, my, mr*1.4, mr*1.2, 3); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(`${(s.hangingMass*1000).toFixed(0)}g`, pulleyX, my + mr*0.6)

    // 力箭头（显示真实动力学值）
    const live = liveRef.current
    if (live) {
      const cy = tableY - carH - 18
      // 拉力 T（向右）
      const tLen = Math.min(Math.abs(live.tension) * 30, 120)
      if (tLen > 2) {
        drawArrow(ctx, carX, cy, carX + tLen, cy, '#4CAF50', `T=${live.tension.toFixed(2)}N`)
      }
      // 摩擦力 f（向左）
      if (live.friction > 0.01) {
        const ffLen = Math.min(live.friction * 30, 80)
        drawArrow(ctx, carX, cy + 14, carX - ffLen, cy + 14, '#FF6B6B', `f=${live.friction.toFixed(2)}N`)
      }
      // 砝码落地提示
      if (live.massLanded) {
        ctx.fillStyle = '#FF5722'; ctx.font = 'bold 10px sans-serif'
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
        ctx.fillText('砝码落地 T=0', carX, cy - 8)
      }
    }

    // 地面提示线（砝码落地边界）
    if (my > h * 0.85) {
      ctx.strokeStyle = 'rgba(255,0,0,0.3)'; ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath(); ctx.moveTo(pulleyX - 30, h * 0.85); ctx.lineTo(pulleyX + 30, h * 0.85); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(255,0,0,0.5)'; ctx.font = '9px sans-serif'
      ctx.textAlign = 'center'; ctx.fillText('地面', pulleyX, h * 0.85 + 12)
    }
  }

  function drawArrow(ctx, x1, y1, x2, y2, color, label) {
    const angle = Math.atan2(y2 - y1, x2 - x1)
    ctx.strokeStyle = color; ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(x2, y2)
    ctx.lineTo(x2 - 7 * Math.cos(angle - 0.35), y2 - 7 * Math.sin(angle - 0.35))
    ctx.lineTo(x2 - 7 * Math.cos(angle + 0.35), y2 - 7 * Math.sin(angle + 0.35))
    ctx.closePath(); ctx.fill()
    if (label) {
      ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
      ctx.fillText(label, (x1 + x2) / 2, Math.min(y1, y2) - 4)
    }
  }

  // ── 图像（左上，带刻度网格）──
  function drawGraph(r) {
    const ctx = r.ctx
    const s = stateRef.current
    const gw = 240, gh = 160
    const gx = 12, gy = 12

    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, 8); ctx.fill()
    ctx.strokeStyle = '#d0d5dd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, 8); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText(s.mode === 'force' ? '📈 a-F 图像' : '📈 a-1/m 图像', gx + 10, gy + 16)

    const ox = gx + 40, oy = gy + gh - 22
    const pw = gw - 55, ph = gh - 40

    // 坐标轴
    ctx.strokeStyle = '#484f58'; ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(ox, oy - ph); ctx.lineTo(ox, oy); ctx.lineTo(ox + pw, oy)
    ctx.stroke()

    const points = s.dataPoints
    if (points.length < 1) {
      ctx.fillStyle = 'rgba(139,148,158,0.3)'; ctx.font = '10px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('释放小车采集数据', ox + pw / 2, oy - ph / 2)
      drawAxisLabels(ctx, s, ox, oy, pw, ph, 0, 1, 0, 1)
      return
    }

    // 自适应范围
    const maxX = Math.max(...points.map(p => p.x), 0.1) * 1.2
    const maxY = Math.max(...points.map(p => p.y), 0.1) * 1.2
    const minX = 0, minY = 0

    // 网格 + 刻度
    ctx.strokeStyle = 'rgba(72,79,88,0.2)'; ctx.lineWidth = 0.5
    ctx.fillStyle = 'rgba(139,148,158,0.5)'; ctx.font = '8px monospace'
    for (let i = 1; i <= 4; i++) {
      const vy = maxY * i / 4
      const py = oy - (vy / maxY) * ph
      ctx.beginPath(); ctx.moveTo(ox, py); ctx.lineTo(ox + pw, py); ctx.stroke()
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
      ctx.fillText(vy.toFixed(2), ox - 4, py)
    }
    for (let i = 1; i <= 4; i++) {
      const vx = maxX * i / 4
      const px = ox + (vx / maxX) * pw
      ctx.beginPath(); ctx.moveTo(px, oy); ctx.lineTo(px, oy - ph); ctx.stroke()
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText(vx.toFixed(2), px, oy + 2)
    }

    // 理论线（y = kx，k 由物理模式决定）
    // 近似：a = Mg/m = (g/m) * M → a = (g/m) * F/g = F/m → 斜率=1/m
    // 精确：a = T/m，T = Mmg/(m+M) → a = Mg/(m+M) → 斜率=g/(m+M)
    ctx.strokeStyle = 'rgba(255,152,0,0.5)'; ctx.lineWidth = 1.5
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    ctx.moveTo(ox, oy)
    const theoryEndX = maxX
    const theoryEndY = maxY  // 归一化到数据范围
    ctx.lineTo(ox + (theoryEndX / maxX) * pw, oy - (theoryEndY / maxY) * ph)
    ctx.stroke()
    ctx.setLineDash([])

    // 数据点
    for (const p of points) {
      const px = ox + (p.x / maxX) * pw
      const py = oy - (p.y / maxY) * ph
      ctx.fillStyle = '#4FC3F7'
      ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#29B6F6'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.stroke()
    }

    // 连线
    if (points.length > 1) {
      ctx.strokeStyle = 'rgba(79,195,247,0.4)'; ctx.lineWidth = 1
      ctx.beginPath()
      for (let i = 0; i < points.length; i++) {
        const px = ox + (points[i].x / maxX) * pw
        const py = oy - (points[i].y / maxY) * ph
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
      }
      ctx.stroke()
    }

    drawAxisLabels(ctx, s, ox, oy, pw, ph, minX, maxX, minY, maxY)
  }

  function drawAxisLabels(ctx, s, ox, oy, pw, ph, minX, maxX, minY, maxY) {
    ctx.fillStyle = '#666'; ctx.font = '9px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(s.mode === 'force' ? 'F=Mg (砝码重力, N)' : '1/m (1/kg)', ox + pw / 2, oy + 14)
    ctx.save()
    ctx.translate(ox - 30, oy - ph / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('a (m/s²)', 0, 0)
    ctx.restore()
  }

  // ── 数据面板（右上）──
  function drawDataPanel(r) {
    const ctx = r.ctx
    const s = stateRef.current
    const live = liveRef.current
    const w = r.screenW
    const pw = 240, ph = 280
    const px = w - pw - 12, py = 12

    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.fill()
    ctx.strokeStyle = '#d0d5dd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.stroke()

    ctx.save()
    ctx.beginPath(); ctx.rect(px + 2, py + 2, pw - 4, ph - 4); ctx.clip()

    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('📊 牛顿第二定律', px + 12, py + 20)

    let y = py + 38
    const lx = px + 12
    ctx.font = '11px sans-serif'

    ctx.fillStyle = '#555'
    ctx.fillText(`小车 m = ${s.cartMass.toFixed(2)} kg`, lx, y); y += 16
    ctx.fillText(`悬挂 M = ${(s.hangingMass*1000).toFixed(0)} g`, lx, y); y += 16
    ctx.fillText(`摩擦 μ = ${s.frictionMu.toFixed(3)}`, lx, y); y += 16
    ctx.fillStyle = '#FF9800'
    ctx.fillText(`真实动力学: a=(Mg-μmg)/(m+M)`, lx, y); y += 14
    ctx.fillText(`绳子张力: T=m(a+μg)`, lx, y); y += 16

    if (live) {
      if (live.massLanded) {
        ctx.fillStyle = '#FF5722'; ctx.font = 'bold 10px sans-serif'
        ctx.fillText('⚠ 砝码落地，绳子松弛 T=0', lx, y); y += 14
        ctx.font = '11px sans-serif'
      }
      ctx.fillStyle = '#4CAF50'
      ctx.fillText(`绳子张力 T = ${live.tension.toFixed(3)} N`, lx, y); y += 16
      ctx.fillStyle = '#FF6B6B'
      ctx.fillText(`摩擦力 f = ${live.friction.toFixed(3)} N`, lx, y); y += 16
      ctx.fillStyle = '#FFD700'
      ctx.fillText(`小车合外力 T-f = ${live.F_car.toFixed(3)} N`, lx, y); y += 16
      ctx.fillStyle = '#4FC3F7'
      ctx.font = 'bold 12px sans-serif'
      ctx.fillText(`a = ${live.a.toFixed(4)} m/s²`, lx, y); y += 18
      ctx.font = '11px sans-serif'
      ctx.fillStyle = '#555'
      ctx.fillText(`v = ${live.v.toFixed(3)} m/s`, lx, y); y += 14
      ctx.fillText(`x = ${live.x.toFixed(3)} m  t = ${live.t.toFixed(2)} s`, lx, y); y += 16

      // 自检：T-f ≈ ma
      ctx.fillStyle = '#555'; ctx.font = '9px monospace'
      ctx.fillText(`校验: T-f=${(live.tension - live.friction).toFixed(4)}`, lx, y); y += 12
      ctx.fillText(`      m·a  =${(s.cartMass * live.a).toFixed(4)}`, lx, y); y += 12
      ctx.fillText(`      误差 =${Math.abs(live.check1).toFixed(6)}`, lx, y); y += 14

      // M/m 比值提示
      const ratio = s.hangingMass / s.cartMass
      if (ratio > 0.1) {
        ctx.fillStyle = '#FF5722'; ctx.font = 'bold 10px sans-serif'
        ctx.fillText(`⚠ M/m=${ratio.toFixed(2)}>0.1`, lx, y); y += 12
        ctx.fillText('砝码质量偏大，F≈Mg近似不成立', lx, y)
      }
    }

    ctx.restore()
  }

  // ═══════════════════════════════════════════
  // 控制
  // ═══════════════════════════════════════════
  const handleStart = useCallback(() => {
    const s = stateRef.current
    s.cartX = 0; s.cartV = 0; s.hangY = 0; s.time = 0
    s.running = true; s.paused = false
    liveRef.current = null
    lastTimeRef.current = performance.now()
    setRunning(true); setPaused(false)
  }, [])

  const handlePause = useCallback(() => {
    stateRef.current.paused = !stateRef.current.paused
    setPaused(p => !p)
  }, [])

  const handleStop = useCallback(() => {
    stateRef.current.running = false
    stateRef.current.paused = false
    setRunning(false); setPaused(false)
    collectDataPoint()
    uiTick(n => n + 1)
  }, [])

  const handleReset = useCallback(() => {
    const s = stateRef.current
    s.cartX = 0; s.cartV = 0; s.hangY = 0; s.time = 0
    s.running = false; s.paused = false
    s.dataPoints = []
    liveRef.current = null
    setRunning(false); setPaused(false)
  }, [])

  const handleClearData = useCallback(() => {
    stateRef.current.dataPoints = []
    uiTick(n => n + 1)
  }, [])

  const handleExportCSV = useCallback(() => {
    const s = stateRef.current
    const header = s.mode === 'force' ? 'F(N),a(m/s²)' : '1/m(1/kg),a(m/s²)'
    const rows = s.dataPoints.map(p => `${p.x.toFixed(4)},${p.y.toFixed(4)}`)
    const csv = header + '\n' + rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `newton2_${s.mode}_${Date.now()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }, [])

  const s = stateRef.current

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>验证牛顿第二定律</span>
        <div style={styles.topActions}>
          {!running ? (
            <button style={styles.playBtn} onClick={handleStart}>▶ 释放</button>
          ) : (
            <>
              <button style={styles.pauseBtn} onClick={handlePause}>{paused ? '▶ 继续' : '⏸ 暂停'}</button>
              <button style={styles.stopBtn} onClick={handleStop}>⏹ 停止采集</button>
            </>
          )}
          <button style={styles.setBtn} onClick={handleReset}>⚙ 重置</button>
          <div style={styles.sep} />
          <button style={styles.btn} onClick={handleClearData}>🗑 清除数据</button>
          <button style={styles.btn} onClick={handleExportCSV}>📥 导出CSV</button>
        </div>
      </div>

      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>m</span>
          <input type="range" min="0.5" max="3" step="0.1"
            value={s.cartMass}
            onChange={(e) => { stateRef.current.cartMass = parseFloat(e.target.value); uiTick(n => n + 1) }}
            style={styles.slider} />
          <input type="number" min="0.1" max="5" step="0.1"
            value={s.cartMass}
            onChange={(e) => { stateRef.current.cartMass = Math.max(0.1, parseFloat(e.target.value) || 0.1); uiTick(n => n + 1) }}
            style={styles.numInput} />
          <span style={styles.sliderVal}>kg</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>M</span>
          <input type="range" min="0.01" max="0.5" step="0.005"
            value={s.hangingMass}
            onChange={(e) => { stateRef.current.hangingMass = parseFloat(e.target.value); uiTick(n => n + 1) }}
            style={styles.slider} />
          <input type="number" min="0.005" max="1" step="0.005"
            value={s.hangingMass}
            onChange={(e) => { stateRef.current.hangingMass = Math.max(0.005, parseFloat(e.target.value) || 0.005); uiTick(n => n + 1) }}
            style={styles.numInput} />
          <span style={styles.sliderVal}>kg</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>μ</span>
          <input type="range" min="0" max="0.2" step="0.005"
            value={s.frictionMu}
            onChange={(e) => { stateRef.current.frictionMu = parseFloat(e.target.value); uiTick(n => n + 1) }}
            style={styles.slider} />
          <span style={styles.sliderVal}>{s.frictionMu.toFixed(3)}</span>
        </label>
        <div style={styles.sep} />
        {/* 计算模式 Tab */}
        <div style={styles.tabGroup}>
          <button style={s.mode === 'force' ? styles.tabActive : styles.tab}
            onClick={() => { stateRef.current.mode = 'force'; stateRef.current.dataPoints = []; uiTick(n => n + 1) }}>
            a-F (m不变)
          </button>
          <button style={s.mode === 'mass' ? styles.tabActive : styles.tab}
            onClick={() => { stateRef.current.mode = 'mass'; stateRef.current.dataPoints = []; uiTick(n => n + 1) }}>
            a-1/m (F不变)
          </button>
        </div>
        <div style={styles.sep} />
        {/* 参考公式按钮（仅演示，不参与仿真） */}
        <div style={styles.tabGroup}>
          <button style={styles.tab}
            title="教材近似：F≈Mg，忽略摩擦和砝码加速度，仅用于a-F作图参考">
            F=Mg 近似
          </button>
          <button style={styles.tab}
            title="无摩擦理论张力 T=Mmg/(m+M)，仅参考，仿真使用真实动力学 T=m(a+μg)">
            无摩擦理论张力
          </button>
        </div>
        {/* 模式状态提示 */}
        <span style={{ fontSize: 10, color: '#8b949e', whiteSpace: 'nowrap' }}>
          {s.frictionMu > 0 ? `含摩擦(μ=${s.frictionMu.toFixed(3)})` : '无摩擦'} · 动力学T=m(a+μg)
        </span>
      </div>

      <div style={styles.main}>
        <canvas ref={canvasRef} style={styles.canvas} />
      </div>

      <div style={styles.desc}>
        <b>实验：验证牛顿第二定律 F=ma</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          调节 m、M、μ，点击"释放"→小车运动→自动采集数据点。F=Mg 忽略绳子张力差异（M&lt;&lt;m 时成立），T=Mmg/(m+M) 是绳子真实张力。
        </span>
      </div>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex', flexDirection: 'column',
    height: '100vh', maxHeight: '100vh',
    background: '#e8e8e8', color: '#333',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    overflow: 'hidden',
  },
  topBar: {
    background: '#f5f5f5', borderBottom: '1px solid #ccc',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '6px 12px', flexShrink: 0, flexWrap: 'wrap', gap: 6,
  },
  title: { fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' },
  topActions: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  controlBar: {
    background: '#fafafa', borderBottom: '1px solid #ddd',
    display: 'flex', alignItems: 'center',
    padding: '4px 12px', flexShrink: 0,
    gap: 8, overflowX: 'auto',
  },
  controlLabel: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#555', whiteSpace: 'nowrap' },
  controlName: { fontWeight: 600, color: '#4A90D9', minWidth: 12 },
  slider: { width: 60, accentColor: '#4A90D9' },
  numInput: { width: 52, border: '1px solid #ccc', borderRadius: 3, padding: '2px 4px', fontSize: 11, textAlign: 'center' },
  sliderVal: { color: '#4A90D9', fontWeight: 600, fontSize: 12, minWidth: 24 },
  btn: { background: '#fff', color: '#4A90D9', border: '1px solid #ccc', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' },
  playBtn: { background: '#4A90D9', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  pauseBtn: { background: '#FF9800', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  stopBtn: { background: '#E53935', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  setBtn: { background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
  sep: { width: 1, height: 18, background: '#ccc', flexShrink: 0 },
  tabGroup: { display: 'flex', gap: 2 },
  tab: { background: '#fff', color: '#555', border: '1px solid #ccc', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer' },
  tabActive: { background: '#4A90D9', color: '#fff', border: '1px solid #4A90D9', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 },
  tabWarn: { background: '#FF9800', color: '#fff', border: '1px solid #FF9800', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 },
  tabOk: { background: '#4CAF50', color: '#fff', border: '1px solid #4CAF50', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 },
  main: { flex: 1, display: 'flex', overflow: 'hidden', background: '#fff', position: 'relative', minHeight: 0 },
  canvas: { flex: 1, width: '100%', display: 'block' },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
}
