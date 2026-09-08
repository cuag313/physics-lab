import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * PendulumScene — 单摆测重力加速度
 *
 * T = 2π√(L/g) → g = 4π²L/T²
 *
 * 交互：
 * - 拖拽摆球释放
 * - 滑块调节摆长 L、摆球质量 m
 * - 自动测量周期 T（多周期平均）
 * - 实时计算 g 值
 * - T²-L 图像验证线性关系
 */

export default function PendulumScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    L: 1.0,           // 摆长 m
    theta: 0,         // 当前角度 rad
    omega: 0,         // 角速度 rad/s
    mass: 0.5,        // 摆球质量 kg
    g: 9.8,
    damping: 0.999,   // 阻尼（极小，教学用）

    // 摆动状态
    phase: 'idle',     // idle | swinging | dragging
    time: 0,

    // 周期测量
    crossingCount: 0,  // 过零点计数
    lastCrossing: 0,   // 上次过零时间
    periods: [],       // 测量到的周期列表
    avgPeriod: 0,      // 平均周期
    measuredG: 0,      // 测量的 g

    // 数据记录
    dataPoints: [],    // [{L, T2}] 用于 T²-L 图
    guideDismissed: false,

    // 拖拽
    dragAngle: 0,
  })

  const [L, setL] = useState(1.0)
  const [mass, setMass] = useState(0.5)
  const [, forceUpdate] = useState(0)
  const [cursor, setCursor] = useState('default')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const R = createRenderer(canvas)
    canvasRef.current._R = R
    const loop = () => { updatePhysics(); renderFrame(R); animRef.current = requestAnimationFrame(loop) }
    loop()
    const onResize = () => R.resize()
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function createRenderer(canvas) {
    const R = {
      canvas, ctx: canvas.getContext('2d'), W: 0, H: 0, scale: 120, ox: 0, oy: 0,
      resize() {
        const rect = canvas.getBoundingClientRect()
        canvas.width = rect.width * devicePixelRatio
        canvas.height = rect.height * devicePixelRatio
        this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
        this.W = rect.width; this.H = rect.height
        this.ox = this.W * 0.38; this.oy = this.H * 0.1
      },
      w2s(wx, wy) { return [this.ox + wx * this.scale, this.oy + wy * this.scale] },
      s2w(sx, sy) { return [(sx - this.ox) / this.scale, (sy - this.oy) / this.scale] },
      clear() { this.ctx.clearRect(0, 0, this.W, this.H) },
    }
    R.resize()
    return R
  }

  // ========== Physics ==========
  function updatePhysics() {
    const s = S.current
    if (s.phase !== 'swinging') return

    const dt = 1 / 60
    s.time += dt

    // 单摆运动方程：θ'' = -(g/L)·sinθ
    const alpha = -(s.g / s.L) * Math.sin(s.theta)
    s.omega += alpha * dt
    s.omega *= s.damping
    s.theta += s.omega * dt

    // 过零点检测（从负到正 = 一次半周期）
    if (s.theta > 0 && s.omega > 0) {
      if (!s._lastSign) {
        s._lastSign = true
        if (s.crossingCount > 0) {
          const halfPeriod = s.time - s.lastCrossing
          // 每两次过零 = 一个完整周期
          if (s.crossingCount % 2 === 0) {
            const T = halfPeriod * 2
            s.periods.push(T)
            if (s.periods.length > 10) s.periods.shift()
            s.avgPeriod = s.periods.reduce((a, b) => a + b, 0) / s.periods.length
            s.measuredG = 4 * Math.PI * Math.PI * s.L / (s.avgPeriod * s.avgPeriod)
          }
        }
        s.lastCrossing = s.time
        s.crossingCount++
      }
    } else {
      s._lastSign = false
    }

    // 角度太小则停止
    if (Math.abs(s.theta) < 0.001 && Math.abs(s.omega) < 0.001 && s.time > 1) {
      s.phase = 'idle'
    }

    forceUpdate(n => n + 1)
  }

  // ========== Render ==========
  function renderFrame(R) {
    const ctx = R.ctx; R.clear()
    ctx.fillStyle = '#f0f4f8'; ctx.fillRect(0, 0, R.W, R.H)
    drawPendulum(ctx, R)
    drawGraph(ctx, R)
    drawInfoPanel(ctx, R)
    drawDescription(ctx, R)
    drawGuideBubble(ctx, R)
  }

  function drawPendulum(ctx, R) {
    const s = S.current
    const pendLen = s.L * R.scale

    // 支点
    const [pivotX, pivotY] = R.w2s(0, 0)

    // 支架
    ctx.strokeStyle = '#90A4AE'; ctx.lineWidth = 4
    ctx.beginPath(); ctx.moveTo(pivotX - 40, pivotY); ctx.lineTo(pivotX + 40, pivotY); ctx.stroke()
    ctx.fillStyle = '#78909C'
    ctx.beginPath(); ctx.arc(pivotX, pivotY, 5, 0, Math.PI * 2); ctx.fill()

    // 摆球位置
    const theta = s.phase === 'dragging' ? s.dragAngle : s.theta
    const ballX = pivotX + pendLen * Math.sin(theta)
    const ballY = pivotY + pendLen * Math.cos(theta)

    // 摆线
    ctx.strokeStyle = '#78909C'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(pivotX, pivotY); ctx.lineTo(ballX, ballY); ctx.stroke()

    // 平衡位置虚线
    ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(pivotX, pivotY); ctx.lineTo(pivotX, pivotY + pendLen + 30); ctx.stroke()
    ctx.setLineDash([])

    // 角度弧线
    if (Math.abs(theta) > 0.05) {
      const arcR = 40
      ctx.strokeStyle = 'rgba(230,81,0,0.5)'; ctx.lineWidth = 1.5
      ctx.beginPath()
      if (theta > 0) ctx.arc(pivotX, pivotY, arcR, Math.PI / 2 - theta, Math.PI / 2)
      else ctx.arc(pivotX, pivotY, arcR, Math.PI / 2, Math.PI / 2 - theta)
      ctx.stroke()
      ctx.fillStyle = '#E65100'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
      const labelAngle = Math.PI / 2 - theta / 2
      ctx.fillText(`θ = ${(theta * 180 / Math.PI).toFixed(1)}°`,
        pivotX + (arcR + 16) * Math.cos(labelAngle),
        pivotY + (arcR + 16) * Math.sin(labelAngle))
    }

    // 摆长标注
    ctx.strokeStyle = 'rgba(255,152,0,0.3)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(pivotX + 20, pivotY); ctx.lineTo(pivotX + 20, pivotY + pendLen); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#E65100'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText(`L = ${s.L.toFixed(2)} m`, pivotX + 25, pivotY + pendLen / 2)

    // 摆球
    const r = 10 + s.mass * 6
    const grad = ctx.createRadialGradient(ballX - r * 0.3, ballY - r * 0.3, r * 0.1, ballX, ballY, r)
    grad.addColorStop(0, '#0288D1'); grad.addColorStop(1, '#01579B')
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(ballX, ballY, r, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.arc(ballX - r * 0.25, ballY - r * 0.25, r * 0.3, 0, Math.PI * 2); ctx.fill()

    // 质量标签
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(`${s.mass.toFixed(1)}kg`, ballX, ballY)
    ctx.textBaseline = 'alphabetic'

    // 释放提示
    if (s.phase === 'idle' && !s.guideDismissed) {
      ctx.fillStyle = '#888'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('拖拽摆球释放', ballX, ballY + r + 20)
    }
  }

  // ========== T²-L 图像 ==========
  function drawGraph(ctx, R) {
    const s = S.current
    const gw = 230, gh = 140, gx = 16, gy = 16

    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, 8); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('📈 T² - L 图像（应为直线）', gx + 10, gy + 6)

    const ox = gx + 40, oy = gy + gh - 20, w = gw - 55, h = gh - 36
    ctx.strokeStyle = '#bbb'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(ox, oy - h); ctx.lineTo(ox, oy); ctx.lineTo(ox + w, oy); ctx.stroke()

    // 理论线：T² = 4π²L/g → 斜率 = 4π²/g ≈ 4.028
    const theorySlope = 4 * Math.PI * Math.PI / s.g
    const maxL = 2.0, maxT2 = theorySlope * maxL

    ctx.strokeStyle = 'rgba(230,81,0,0.3)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + w, oy - h); ctx.stroke(); ctx.setLineDash([])

    // 数据点
    const pts = s.dataPoints
    if (pts.length > 0) {
      ctx.fillStyle = '#0288D1'
      for (const p of pts) {
        const px = ox + (p.L / maxL) * w
        const py = oy - (p.T2 / maxT2) * h
        ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill()
      }
      if (pts.length > 1) {
        ctx.strokeStyle = '#0288D1'; ctx.lineWidth = 1.5; ctx.beginPath()
        pts.forEach((p, i) => {
          const px = ox + (p.L / maxL) * w
          const py = oy - (p.T2 / maxT2) * h
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
        })
        ctx.stroke()
      }
    }

    ctx.fillStyle = '#888'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('L (m)', ox + w / 2, oy + 4)
    ctx.save(); ctx.translate(gx + 10, oy - h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('T² (s²)', 0, 0); ctx.restore()
  }

  // ========== 信息面板 ==========
  function drawInfoPanel(ctx, R) {
    const s = S.current
    const pw = 220, ph = 210, px = R.W - pw - 16, py = 16

    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('📊 单摆测重力加速度', px + 12, py + 10)
    ctx.font = '11px sans-serif'; let y = py + 30

    ctx.fillStyle = '#666'
    ctx.fillText(`摆长 L = ${s.L.toFixed(3)} m`, px + 12, y); y += 18
    ctx.fillText(`质量 m = ${s.mass.toFixed(1)} kg`, px + 12, y); y += 18
    ctx.fillText(`理论周期 T = ${(2 * Math.PI * Math.sqrt(s.L / s.g)).toFixed(4)} s`, px + 12, y); y += 22

    if (s.periods.length > 0) {
      ctx.fillStyle = '#0288D1'
      ctx.fillText(`实测周期 T = ${s.avgPeriod.toFixed(4)} s`, px + 12, y); y += 18
      ctx.fillText(`测量次数: ${s.periods.length} 次`, px + 12, y); y += 18

      ctx.fillStyle = '#4CAF50'; ctx.font = 'bold 11px sans-serif'
      ctx.fillText(`测得 g = ${s.measuredG.toFixed(4)} m/s²`, px + 12, y); y += 18

      const deviation = Math.abs((s.measuredG - s.g) / s.g * 100)
      ctx.fillStyle = deviation < 1 ? '#4CAF50' : deviation < 5 ? '#FF9800' : '#F44336'
      ctx.font = '11px sans-serif'
      ctx.fillText(`偏差 = ${deviation.toFixed(2)}%`, px + 12, y); y += 22
    } else {
      ctx.fillStyle = '#888'
      ctx.fillText('释放摆球开始测量', px + 12, y); y += 40
    }

    ctx.fillStyle = '#E65100'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('T = 2π√(L/g)', px + 12, y); y += 16
    ctx.fillText('g = 4π²L/T²', px + 12, y); y += 16
    ctx.fillStyle = '#888'; ctx.font = '10px sans-serif'
    ctx.fillText('T 与质量 m 无关', px + 12, y)
  }

  function drawDescription(ctx, R) {
    const x = 16, y = R.H - 46
    ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'
    ctx.fillText('单摆测重力加速度', x, y)
    ctx.fillStyle = '#0288D1'; ctx.font = 'bold 13px serif'
    ctx.fillText('T = 2π√(L/g)', x + 160, y)
    ctx.fillStyle = '#888'; ctx.font = '11px sans-serif'
    ctx.fillText('拖拽摆球释放 · 调节摆长和质量 · 自动测周期算 g', x, y + 20)
  }

  // ========== 引导气泡 ==========
  function drawGuideBubble(ctx, R) {
    const s = S.current
    if (s.guideDismissed) return
    const text = '👆 拖拽摆球到一侧释放，观察摆动并自动测量周期'
    const bx = R.W * 0.5, by = R.H * 0.55
    ctx.font = '13px sans-serif'
    const tw = ctx.measureText(text).width + 24, th = 32
    const ry = by + Math.sin(Date.now() / 600) * 4
    ctx.fillStyle = 'rgba(2,136,209,0.12)'; ctx.beginPath(); ctx.roundRect(bx - tw / 2, ry - th / 2, tw, th, 16); ctx.fill()
    ctx.strokeStyle = 'rgba(2,136,209,0.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(bx - tw / 2, ry - th / 2, tw, th, 16); ctx.stroke()
    ctx.fillStyle = '#0288D1'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(text, bx, ry); ctx.textBaseline = 'alphabetic'
  }

  // ========== 交互 ==========
  const handleMouseDown = useCallback((e) => {
    const canvas = canvasRef.current
    const R = canvas._R; if (!R) return
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top

    const s = S.current
    const pendLen = s.L * R.scale
    const [pivotX, pivotY] = R.w2s(0, 0)
    const ballX = pivotX + pendLen * Math.sin(s.theta)
    const ballY = pivotY + pendLen * Math.cos(s.theta)
    const r = 10 + s.mass * 6

    const dx = sx - ballX, dy = sy - ballY
    if (dx * dx + dy * dy < (r + 20) * (r + 20)) {
      s.phase = 'dragging'
      setCursor('grabbing')
    }
  }, [])

  const handleMouseMove = useCallback((e) => {
    const s = S.current
    if (s.phase !== 'dragging') return
    const canvas = canvasRef.current
    const R = canvas._R; if (!R) return
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top
    const [pivotX, pivotY] = R.w2s(0, 0)
    const dx = sx - pivotX, dy = sy - pivotY
    s.dragAngle = Math.atan2(dx, dy)
    s.dragAngle = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, s.dragAngle))
    forceUpdate(n => n + 1)
  }, [])

  const handleMouseUp = useCallback(() => {
    const s = S.current
    if (s.phase !== 'dragging') return
    s.theta = s.dragAngle
    s.omega = 0
    s.phase = 'swinging'
    s.time = 0
    s.crossingCount = 0
    s.lastCrossing = 0
    s.periods = []
    s.avgPeriod = 0
    s.measuredG = 0
    s._lastSign = false
    s.guideDismissed = true
    setCursor('default')
    forceUpdate(n => n + 1)
  }, [])

  const handleRecord = useCallback(() => {
    const s = S.current
    if (s.avgPeriod > 0) {
      s.dataPoints.push({ L: s.L, T2: s.avgPeriod * s.avgPeriod })
      if (s.dataPoints.length > 15) s.dataPoints.shift()
    }
  }, [])

  const handleReset = useCallback(() => {
    const s = S.current
    s.theta = 0; s.omega = 0; s.phase = 'idle'; s.time = 0
    s.crossingCount = 0; s.lastCrossing = 0; s.periods = []
    s.avgPeriod = 0; s.measuredG = 0; s._lastSign = false
  }, [])

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <span style={styles.title}>单摆测重力加速度</span>
        <div style={styles.toolbarActions}>
          <button style={styles.btn} onClick={handleReset}>↺ 重置</button>
          <button style={styles.recordBtn} onClick={handleRecord}>◉ 记录数据</button>
          <div style={styles.sep} />
          <label style={styles.controlLabel}>
            摆长 L：
            <input type="range" min="0.3" max="2.0" step="0.05" value={L}
              onChange={(e) => { const v = parseFloat(e.target.value); S.current.L = v; setL(v) }} style={styles.slider} />
            <span style={styles.sliderVal}>{L.toFixed(2)}m</span>
          </label>
          <label style={styles.controlLabel}>
            质量 m：
            <input type="range" min="0.1" max="2.0" step="0.1" value={mass}
              onChange={(e) => { const v = parseFloat(e.target.value); S.current.mass = v; setMass(v) }} style={styles.slider} />
            <span style={styles.sliderVal}>{mass.toFixed(1)}kg</span>
          </label>
        </div>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={{ ...styles.canvas, cursor }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>
      <div style={styles.desc}>
        <b>单摆测重力加速度</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          拖拽摆球释放 · 自动测周期 · T = 2π√(L/g) · 记录数据验证 T²∝L
        </span>
      </div>
    </div>
  )
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#f0f4f8', color: '#333', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  toolbar: { minHeight: 44, background: '#f5f5f5', borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', flexShrink: 0, flexWrap: 'wrap', gap: 6 },
  title: { fontSize: 14, fontWeight: 600, color: '#333' },
  toolbarActions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  controlLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#666' },
  slider: { width: 80, accentColor: '#4FC3F7' },
  sliderVal: { color: '#0288D1', fontWeight: 600, minWidth: 45, fontSize: 12 },
  btn: { background: '#f0f0f0', color: '#333', border: '1px solid #ddd', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  recordBtn: { background: '#F44336', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600 },
  sep: { width: 1, height: 20, background: '#ddd' },
  main: { flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' },
  canvas: { flex: 1, width: '100%' },
  desc: { padding: '8px 14px', background: '#f5f5f5', borderTop: '1px solid #ccc', fontSize: 13, color: '#333' },
}
