import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * CircularMotionScene — 圆周运动与向心力
 *
 * 实验方案：
 * 探究向心力 F = mv²/r = mω²r = m(2π/T)²r
 *
 * 控制变量法：
 * 1. 保持 m, r 不变，改变 v → F ∝ v²
 * 2. 保持 m, v 不变，改变 r → F ∝ 1/r
 * 3. 保持 v, r 不变，改变 m → F ∝ m
 *
 * 交互：
 * - 拖拽旋转质量改变半径
 * - 调节转速（角速度）
 * - 调节质量
 * - 实时显示向心力、线速度、周期
 * - 力矢量可视化
 */
export default function CircularMotionScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    // 旋转参数
    mass: 0.5,          // kg
    radius: 1.5,        // m
    omega: 2.0,         // rad/s (角速度)
    angle: 0,           // 当前角度 rad

    // 派生量
    v: 0,               // 线速度 m/s
    F: 0,               // 向心力 N
    T: 0,               // 周期 s

    // 轨迹
    trail: [],
    maxTrail: 600,

    // 数据记录
    dataPoints: [],     // [{x, y, label}] 用于图像
    mode: 'speed',      // speed | radius | mass

    // 动画
    time: 0,
    running: true,

    // 弹簧连接可视化
    springStretched: 0,
  })

  const [mass, setMass] = useState(0.5)
  const [radius, setRadius] = useState(1.5)
  const [omega, setOmega] = useState(2.0)
  const [mode, setMode] = useState('speed')
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
      scale: 100,
      ox: 0, oy: 0,
      resize() {
        const rect = canvas.getBoundingClientRect()
        canvas.width = rect.width * devicePixelRatio
        canvas.height = rect.height * devicePixelRatio
        this.ctx.scale(devicePixelRatio, devicePixelRatio)
        this.W = rect.width
        this.H = rect.height
        this.ox = this.W * 0.45
        this.oy = this.H * 0.48
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
    if (!s.running) return

    const dt = 1 / 60
    s.time += dt

    // 更新角度
    s.angle += s.omega * dt
    if (s.angle > Math.PI * 2) s.angle -= Math.PI * 2

    // 派生量
    s.v = s.omega * s.radius
    s.F = s.mass * s.v * s.v / s.radius
    s.T = (2 * Math.PI) / s.omega

    // 当前位置
    const x = s.radius * Math.cos(s.angle)
    const y = s.radius * Math.sin(s.angle)

    // 轨迹
    s.trail.push({ x, y })
    if (s.trail.length > s.maxTrail) s.trail.shift()

    // 弹簧伸长量（视觉）
    s.springStretched = s.F / 10 // 归一化

    forceUpdate(n => n + 1)
  }

  // ========== Render ==========
  function renderFrame(R) {
    const ctx = R.ctx
    R.clear()

    drawBackground(ctx, R)
    drawOrbit(ctx, R)
    drawTrail(ctx, R)
    drawSpring(ctx, R)
    drawAxisLines(ctx, R)
    drawMass(ctx, R)
    drawForceVectors(ctx, R)
    drawGraph(ctx, R)
    drawInfoPanel(ctx, R)
    drawDescription(ctx, R)
  }

  function drawBackground(ctx, R) {
    const grad = ctx.createRadialGradient(R.ox, R.oy, 0, R.ox, R.oy, R.W * 0.6)
    grad.addColorStop(0, '#1a2332')
    grad.addColorStop(1, '#0d1117')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, R.W, R.H)

    // 网格
    ctx.strokeStyle = 'rgba(48, 54, 61, 0.3)'
    ctx.lineWidth = 1
    const gridSize = 50
    for (let x = R.ox % gridSize; x < R.W; x += gridSize) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, R.H)
      ctx.stroke()
    }
    for (let y = R.oy % gridSize; y < R.H; y += gridSize) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(R.W, y)
      ctx.stroke()
    }
  }

  function drawOrbit(ctx, R) {
    const s = S.current
    const [cx, cy] = R.w2s(0, 0)
    const r = s.radius * R.scale

    // 轨道圆
    ctx.strokeStyle = 'rgba(79, 195, 247, 0.3)'
    ctx.lineWidth = 2
    ctx.setLineDash([8, 4])
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])

    // 半径标注
    ctx.strokeStyle = 'rgba(255, 213, 79, 0.4)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    const [ex, ey] = R.w2s(s.radius, 0)
    ctx.lineTo(ex, ey)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = '#FFD54F'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`r=${s.radius.toFixed(2)}m`, (cx + ex) / 2, (cy + ey) / 2 - 10)

    // 圆心标记
    ctx.fillStyle = 'rgba(79, 195, 247, 0.5)'
    ctx.beginPath()
    ctx.arc(cx, cy, 4, 0, Math.PI * 2)
    ctx.fill()
  }

  function drawTrail(ctx, R) {
    const s = S.current
    if (s.trail.length < 2) return

    // 渐变轨迹（旧的淡，新的亮）
    for (let i = 1; i < s.trail.length; i++) {
      const alpha = (i / s.trail.length) * 0.6
      const [x1, y1] = R.w2s(s.trail[i - 1].x, s.trail[i - 1].y)
      const [x2, y2] = R.w2s(s.trail[i].x, s.trail[i].y)

      ctx.strokeStyle = `rgba(255, 152, 0, ${alpha})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }
  }

  function drawSpring(ctx, R) {
    const s = S.current
    const [cx, cy] = R.w2s(0, 0)
    const [mx, my] = R.w2s(s.radius * Math.cos(s.angle), s.radius * Math.sin(s.angle))

    // 弹簧（从圆心到质点）
    const dx = mx - cx
    const dy = my - cy
    const len = Math.sqrt(dx * dx + dy * dy)
    const ux = dx / len
    const uy = dy / len

    const coils = 12
    const springLen = len * 0.8
    const amp = 6 + s.springStretched * 2

    ctx.strokeStyle = '#a0aec0'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    for (let i = 0; i <= coils; i++) {
      const t = i / coils
      const px = cx + ux * springLen * t
      const py = cy + uy * springLen * t
      const offset = Math.sin(t * coils * Math.PI * 2) * amp
      ctx.lineTo(px + (-uy) * offset, py + ux * offset)
    }
    ctx.lineTo(mx, my)
    ctx.stroke()
  }

  function drawAxisLines(ctx, R) {
    const [cx, cy] = R.w2s(0, 0)

    // x轴
    ctx.strokeStyle = 'rgba(139, 148, 158, 0.2)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, cy)
    ctx.lineTo(R.W, cy)
    ctx.stroke()

    // y轴
    ctx.beginPath()
    ctx.moveTo(cx, 0)
    ctx.lineTo(cx, R.H)
    ctx.stroke()
  }

  function drawMass(ctx, R) {
    const s = S.current
    const x = s.radius * Math.cos(s.angle)
    const y = s.radius * Math.sin(s.angle)
    const [sx, sy] = R.w2s(x, y)

    const r = 10 + s.mass * 8

    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.beginPath()
    ctx.arc(sx + 2, sy + 2, r, 0, Math.PI * 2)
    ctx.fill()

    // 质点
    const grad = ctx.createRadialGradient(sx - r * 0.3, sy - r * 0.3, r * 0.1, sx, sy, r)
    grad.addColorStop(0, '#4FC3F7')
    grad.addColorStop(0.7, '#0288D1')
    grad.addColorStop(1, '#01579B')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(sx, sy, r, 0, Math.PI * 2)
    ctx.fill()

    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.beginPath()
    ctx.arc(sx - r * 0.3, sy - r * 0.3, r * 0.3, 0, Math.PI * 2)
    ctx.fill()

    // 质量标签
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 10px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${s.mass.toFixed(1)}kg`, sx, sy)
  }

  function drawForceVectors(ctx, R) {
    const s = S.current
    const x = s.radius * Math.cos(s.angle)
    const y = s.radius * Math.sin(s.angle)
    const [sx, sy] = R.w2s(x, y)
    const r = 10 + s.mass * 8

    // 线速度方向（切线方向）
    const vx = -Math.sin(s.angle)
    const vy = Math.cos(s.angle)
    const vLen = Math.min(s.v * 20, 80)
    if (vLen > 5) {
      drawArrow(ctx, sx + vx * r, sy - vy * r,
        sx + vx * (r + vLen), sy - vy * (r + vLen),
        '#4CAF50', `v=${s.v.toFixed(2)}m/s`)
    }

    // 向心力方向（指向圆心）
    const fx = -Math.cos(s.angle)
    const fy = -Math.sin(s.angle)
    const fLen = Math.min(s.F * 15, 80)
    if (fLen > 3) {
      drawArrow(ctx, sx + fx * r, sy - fy * r,
        sx + fx * (r + fLen), sy - fy * (r + fLen),
        '#F44336', `F=${s.F.toFixed(2)}N`)
    }

    // 向心加速度标注
    const a = s.F / s.mass
    if (fLen > 10) {
      ctx.fillStyle = '#FF9800'
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'center'
      const ax = sx + fx * (r + fLen + 15)
      const ay = sy - fy * (r + fLen + 15)
      ctx.fillText(`a=${a.toFixed(2)}m/s²`, ax, ay)
    }
  }

  function drawArrow(ctx, x1, y1, x2, y2, color, label) {
    const angle = Math.atan2(y2 - y1, x2 - x1)
    const headLen = 8

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
      ctx.font = 'bold 10px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillStyle = color
      const lx = (x1 + x2) / 2 + (-Math.sin(angle)) * 14
      const ly = (y1 + y2) / 2 + Math.cos(angle) * 14
      ctx.fillText(label, lx, ly)
    }
  }

  // ========== 图像 ==========
  function drawGraph(ctx, R) {
    const s = S.current
    const gw = 240
    const gh = 130
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

    const titles = { speed: '📈 F-v² 图像', radius: '📈 F-1/r 图像', mass: '📈 F-m 图像' }
    ctx.fillStyle = '#c9d1d9'
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(titles[s.mode], gx + 10, gy + 16)

    const ox = gx + 40
    const oy = gy + gh - 18
    const w = gw - 55
    const h = gh - 35

    // 坐标轴
    ctx.strokeStyle = '#484f58'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(ox, oy - h)
    ctx.lineTo(ox, oy)
    ctx.lineTo(ox + w, oy)
    ctx.stroke()

    // 理论线（线性关系）
    ctx.strokeStyle = 'rgba(255, 152, 0, 0.3)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(ox, oy)
    ctx.lineTo(ox + w, oy - h)
    ctx.stroke()
    ctx.setLineDash([])

    // 数据点
    const pts = s.dataPoints
    if (pts.length > 0) {
      const maxX = Math.max(...pts.map(p => p.x), 1)
      const maxY = Math.max(...pts.map(p => p.y), 1)

      ctx.fillStyle = '#4FC3F7'
      for (let i = 0; i < pts.length; i++) {
        const px = ox + (pts[i].x / maxX) * w
        const py = oy - (pts[i].y / maxY) * h
        ctx.beginPath()
        ctx.arc(px, py, 4, 0, Math.PI * 2)
        ctx.fill()
      }

      // 连线
      if (pts.length > 1) {
        ctx.strokeStyle = '#4FC3F7'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        for (let i = 0; i < pts.length; i++) {
          const px = ox + (pts[i].x / maxX) * w
          const py = oy - (pts[i].y / maxY) * h
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.stroke()
      }
    }

    // 轴标签
    const xLabels = { speed: 'v²', radius: '1/r', mass: 'm' }
    ctx.fillStyle = '#484f58'
    ctx.font = '9px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(xLabels[s.mode], ox + w / 2, oy + 14)
    ctx.save()
    ctx.translate(gx + 10, oy - h / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText('F', 0, 0)
    ctx.restore()
  }

  // ========== 信息面板 ==========
  function drawInfoPanel(ctx, R) {
    const s = S.current
    const pw = 220
    const ph = 200
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
    ctx.fillText('📊 圆周运动参数', px + 12, py + 20)

    ctx.font = '11px sans-serif'
    let y = py + 40

    ctx.fillStyle = '#8b949e'
    ctx.fillText(`质量 m = ${s.mass.toFixed(2)} kg`, px + 12, y); y += 18
    ctx.fillText(`半径 r = ${s.radius.toFixed(2)} m`, px + 12, y); y += 18
    ctx.fillText(`角速度 ω = ${s.omega.toFixed(2)} rad/s`, px + 12, y); y += 18

    ctx.fillStyle = '#4FC3F7'
    ctx.fillText(`线速度 v = ${s.v.toFixed(3)} m/s`, px + 12, y); y += 18

    ctx.fillStyle = '#F44336'
    ctx.fillText(`向心力 F = ${s.F.toFixed(3)} N`, px + 12, y); y += 18

    ctx.fillStyle = '#FF9800'
    ctx.fillText(`向心加速度 a = ${(s.F / s.mass).toFixed(3)} m/s²`, px + 12, y); y += 18

    ctx.fillStyle = '#4CAF50'
    ctx.fillText(`周期 T = ${s.T.toFixed(3)} s`, px + 12, y); y += 18

    ctx.fillStyle = '#8b949e'
    ctx.fillText(`频率 f = ${(1 / s.T).toFixed(2)} Hz`, px + 12, y); y += 22

    // 验证公式
    ctx.fillStyle = '#FFD54F'
    ctx.font = 'bold 10px sans-serif'
    ctx.fillText('F = mv²/r = mω²r', px + 12, y)
  }

  function drawDescription(ctx, R) {
    const h = R.H
    const x = 16
    let y = h - 46

    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillStyle = '#c9d1d9'
    ctx.font = 'bold 14px sans-serif'
    ctx.fillText('圆周运动与向心力', x, y)

    ctx.fillStyle = '#4FC3F7'
    ctx.font = 'bold 13px serif'
    ctx.fillText('F = mv²/r = mω²r', x + 160, y)

    ctx.fillStyle = '#8b949e'
    ctx.font = '11px sans-serif'
    ctx.fillText('拖拽质点改变半径 · 调节角速度和质量 · 采集数据验证 F∝v², F∝1/r, F∝m', x, y + 20)
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
    const [mx, my] = R.w2s(s.radius * Math.cos(s.angle), s.radius * Math.sin(s.angle))
    const r = 10 + s.mass * 8

    const dx = sx - mx
    const dy = sy - my
    if (dx * dx + dy * dy < (r + 15) * (r + 15)) {
      setIsDragging(true)
      setCursor('grabbing')
    }
  }, [])

  const handleCanvasMouseMove = useCallback((e) => {
    if (!isDragging) return
    const canvas = canvasRef.current
    const R = canvas._R
    if (!R) return

    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const [wx, wy] = R.s2w(sx, sy)

    const s = S.current
    const newR = Math.sqrt(wx * wx + wy * wy)
    s.radius = Math.max(0.3, Math.min(3, newR))
    setRadius(s.radius)
  }, [isDragging])

  const handleCanvasMouseUp = useCallback(() => {
    setIsDragging(false)
    setCursor('default')
  }, [])

  const handleRecord = useCallback(() => {
    const s = S.current
    let x, y
    if (s.mode === 'speed') {
      x = s.v * s.v
    } else if (s.mode === 'radius') {
      x = 1 / s.radius
    } else {
      x = s.mass
    }
    y = s.F
    s.dataPoints.push({ x, y })
    if (s.dataPoints.length > 20) s.dataPoints.shift()
  }, [])

  const handleReset = useCallback(() => {
    const s = S.current
    s.angle = 0
    s.time = 0
    s.trail = []
    s.dataPoints = []
    s.running = true
  }, [])

  const handleMassChange = useCallback((val) => {
    S.current.mass = val
    setMass(val)
  }, [])

  const handleRadiusChange = useCallback((val) => {
    S.current.radius = val
    setRadius(val)
  }, [])

  const handleOmegaChange = useCallback((val) => {
    S.current.omega = val
    setOmega(val)
  }, [])

  const handleModeChange = useCallback((newMode) => {
    S.current.mode = newMode
    S.current.dataPoints = []
    setMode(newMode)
  }, [])

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <span style={styles.title}>圆周运动与向心力</span>
        <div style={styles.toolbarActions}>
          <button style={styles.btn} onClick={handleReset}>↺ 重置</button>
          <button style={styles.recordBtn} onClick={handleRecord}>◉ 记录数据</button>
          <div style={styles.sep} />
          <label style={styles.controlLabel}>
            质量 m：
            <input type="range" min="0.1" max="2" step="0.1"
              value={mass}
              onChange={(e) => handleMassChange(parseFloat(e.target.value))}
              style={styles.slider} />
            <span style={styles.sliderVal}>{mass.toFixed(1)}kg</span>
          </label>
          <label style={styles.controlLabel}>
            半径 r：
            <input type="range" min="0.3" max="3" step="0.1"
              value={radius}
              onChange={(e) => handleRadiusChange(parseFloat(e.target.value))}
              style={styles.slider} />
            <span style={styles.sliderVal}>{radius.toFixed(1)}m</span>
          </label>
          <label style={styles.controlLabel}>
            角速度 ω：
            <input type="range" min="0.5" max="8" step="0.1"
              value={omega}
              onChange={(e) => handleOmegaChange(parseFloat(e.target.value))}
              style={styles.slider} />
            <span style={styles.sliderVal}>{omega.toFixed(1)}rad/s</span>
          </label>
          <div style={styles.sep} />
          <div style={styles.modeGroup}>
            {[
              { key: 'speed', label: 'F∝v²' },
              { key: 'radius', label: 'F∝1/r' },
              { key: 'mass', label: 'F∝m' },
            ].map(m => (
              <button key={m.key}
                style={mode === m.key ? styles.modeBtnActive : styles.modeBtn}
                onClick={() => handleModeChange(m.key)}>
                {m.label}
              </button>
            ))}
          </div>
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
        <b>实验：圆周运动与向心力</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          拖拽质点改变半径 · 调节角速度和质量 · 点击"记录数据"采集数据点 · 选择模式验证 F∝v²、F∝1/r、F∝m
        </span>
      </div>
    </div>
  )
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#0d1117', color: '#e0e0e0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  toolbar: { minHeight: 44, background: '#161b22', borderBottom: '1px solid #30363d', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', flexShrink: 0, flexWrap: 'wrap', gap: 6 },
  title: { fontSize: 14, fontWeight: 600, color: '#c9d1d9' },
  toolbarActions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  controlLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8b949e' },
  slider: { width: 70, accentColor: '#4FC3F7' },
  sliderVal: { color: '#4FC3F7', fontWeight: 600, minWidth: 50, fontSize: 12 },
  btn: { background: '#30363d', color: '#c9d1d9', border: '1px solid #484f58', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  recordBtn: { background: '#F44336', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600 },
  sep: { width: 1, height: 20, background: '#30363d' },
  modeGroup: { display: 'flex', gap: 4 },
  modeBtn: { background: '#30363d', color: '#8b949e', border: '1px solid #484f58', borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer' },
  modeBtnActive: { background: '#4FC3F7', color: '#000', border: '1px solid #4FC3F7', borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer', fontWeight: 600 },
  main: { flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' },
  canvas: { flex: 1, width: '100%' },
  desc: { padding: '8px 14px', background: '#161b22', borderTop: '1px solid #30363d', fontSize: 13, color: '#c9d1d9' },
}
