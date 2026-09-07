import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * CircularMotionScene — 圆周运动与向心力
 *
 * 控制变量法验证：
 * 1. F ∝ v²（保持m, r不变，改变ω）
 * 2. F ∝ 1/r（保持m, ω不变，改变r）
 * 3. F ∝ m（保持r, ω不变，改变m）
 */
export default function CircularMotionScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    mass: 0.5, radius: 1.5, omega: 2.0, angle: 0,
    v: 0, F: 0, T: 0,
    trail: [], maxTrail: 500,
    dataPoints: [], mode: 'speed',
    time: 0, running: true,
    springStretched: 0,
    guideDismissed: false,
  })

  const [mass, setMass] = useState(0.5)
  const [radius, setRadius] = useState(1.5)
  const [omega, setOmega] = useState(2.0)
  const [mode, setMode] = useState('speed')
  const [, forceUpdate] = useState(0)

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
      canvas, ctx: canvas.getContext('2d'), W: 0, H: 0, scale: 100, ox: 0, oy: 0,
      resize() {
        const rect = canvas.getBoundingClientRect()
        canvas.width = rect.width * devicePixelRatio
        canvas.height = rect.height * devicePixelRatio
        this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
        this.W = rect.width; this.H = rect.height
        this.ox = this.W * 0.45; this.oy = this.H * 0.48
      },
      w2s(wx, wy) { return [this.ox + wx * this.scale, this.oy - wy * this.scale] },
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
    s.angle = (s.angle + s.omega * dt) % (Math.PI * 2)
    s.v = s.omega * s.radius
    s.F = s.mass * s.v * s.v / s.radius
    s.T = (2 * Math.PI) / s.omega
    const x = s.radius * Math.cos(s.angle)
    const y = s.radius * Math.sin(s.angle)
    s.trail.push({ x, y })
    if (s.trail.length > s.maxTrail) s.trail.shift()
    s.springStretched = s.F / 15
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
    drawMass(ctx, R)
    drawForceVectors(ctx, R)
    drawGraph(ctx, R)
    drawInfoPanel(ctx, R)
    drawDescription(ctx, R)
    drawGuideBubble(ctx, R)
  }

  function drawBackground(ctx, R) {
    ctx.fillStyle = '#f0f4f8'
    ctx.fillRect(0, 0, R.W, R.H)
    ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.lineWidth = 1
    const gridSize = 50
    for (let x = R.ox % gridSize; x < R.W; x += gridSize) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, R.H); ctx.stroke() }
    for (let y = R.oy % gridSize; y < R.H; y += gridSize) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(R.W, y); ctx.stroke() }
  }

  function drawOrbit(ctx, R) {
    const s = S.current
    const [cx, cy] = R.w2s(0, 0)
    const r = s.radius * R.scale

    ctx.strokeStyle = 'rgba(79,195,247,0.4)'; ctx.lineWidth = 2; ctx.setLineDash([8, 4])
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([])

    ctx.strokeStyle = 'rgba(255,152,0,0.3)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(cx, cy)
    const [ex, ey] = R.w2s(s.radius, 0)
    ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([])
    ctx.fillStyle = '#E65100'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(`r = ${s.radius.toFixed(2)} m`, (cx + ex) / 2, (cy + ey) / 2 - 10)

    ctx.fillStyle = 'rgba(79,195,247,0.5)'; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill()
  }

  function drawTrail(ctx, R) {
    const s = S.current
    if (s.trail.length < 2) return
    // 批量绘制（单条路径）
    const len = s.trail.length
    const segCount = Math.min(len - 1, 200) // 限制段数
    const startIdx = len - 1 - segCount
    for (let i = startIdx + 1; i < len; i++) {
      const alpha = ((i - startIdx) / segCount) * 0.5
      const [x1, y1] = R.w2s(s.trail[i - 1].x, s.trail[i - 1].y)
      const [x2, y2] = R.w2s(s.trail[i].x, s.trail[i].y)
      ctx.strokeStyle = `rgba(255,152,0,${alpha})`; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    }
  }

  function drawSpring(ctx, R) {
    const s = S.current
    const [cx, cy] = R.w2s(0, 0)
    const px = s.radius * Math.cos(s.angle), py = s.radius * Math.sin(s.angle)
    const [mx, my] = R.w2s(px, py)
    const dx = mx - cx, dy = my - cy
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 1) return
    const ux = dx / len, uy = dy / len
    const coils = 12
    const springLen = len * 0.85
    const amp = 5 + s.springStretched * 3

    ctx.strokeStyle = '#78909C'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(cx, cy)
    for (let i = 0; i <= coils; i++) {
      const t = i / coils
      const spx = cx + ux * springLen * t, spy = cy + uy * springLen * t
      const offset = Math.sin(t * coils * Math.PI * 2) * amp
      ctx.lineTo(spx + (-uy) * offset, spy + ux * offset)
    }
    ctx.lineTo(mx, my); ctx.stroke()
  }

  function drawMass(ctx, R) {
    const s = S.current
    const x = s.radius * Math.cos(s.angle), y = s.radius * Math.sin(s.angle)
    const [sx, sy] = R.w2s(x, y)
    const r = 10 + s.mass * 8

    ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.beginPath(); ctx.arc(sx + 2, sy + 2, r, 0, Math.PI * 2); ctx.fill()
    const grad = ctx.createRadialGradient(sx - r * 0.3, sy - r * 0.3, r * 0.1, sx, sy, r)
    grad.addColorStop(0, '#4FC3F7'); grad.addColorStop(0.7, '#0288D1'); grad.addColorStop(1, '#01579B')
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.arc(sx - r * 0.3, sy - r * 0.3, r * 0.3, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(`${s.mass.toFixed(1)}kg`, sx, sy); ctx.textBaseline = 'alphabetic'
  }

  function drawForceVectors(ctx, R) {
    const s = S.current
    const x = s.radius * Math.cos(s.angle), y = s.radius * Math.sin(s.angle)
    const [sx, sy] = R.w2s(x, y)
    const r = 10 + s.mass * 8

    // 速度（切线）
    const vx = -Math.sin(s.angle), vy = Math.cos(s.angle)
    const vLen = Math.min(s.v * 20, 80)
    if (vLen > 5) drawArrow(ctx, sx + vx * r, sy - vy * r, sx + vx * (r + vLen), sy - vy * (r + vLen), '#4CAF50', `v = ${s.v.toFixed(2)} m/s`)

    // 向心力（指向圆心）
    const fx = -Math.cos(s.angle), fy = -Math.sin(s.angle)
    const fLen = Math.min(s.F * 15, 80)
    if (fLen > 3) drawArrow(ctx, sx + fx * r, sy - fy * r, sx + fx * (r + fLen), sy - fy * (r + fLen), '#F44336', `F = ${s.F.toFixed(2)} N`)

    // 加速度
    const a = s.F / s.mass
    if (fLen > 10) {
      ctx.fillStyle = '#E65100'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(`a = ${a.toFixed(2)} m/s²`, sx + fx * (r + fLen + 15), sy - fy * (r + fLen + 15))
    }
  }

  function drawArrow(ctx, x1, y1, x2, y2, color, label) {
    const angle = Math.atan2(y2 - y1, x2 - x1), headLen = 8
    ctx.strokeStyle = color; ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    ctx.fillStyle = color
    ctx.beginPath(); ctx.moveTo(x2, y2)
    ctx.lineTo(x2 - headLen * Math.cos(angle - 0.35), y2 - headLen * Math.sin(angle - 0.35))
    ctx.lineTo(x2 - headLen * Math.cos(angle + 0.35), y2 - headLen * Math.sin(angle + 0.35))
    ctx.closePath(); ctx.fill()
    if (label) {
      const lx = (x1 + x2) / 2 + (-Math.sin(angle)) * 14, ly = (y1 + y2) / 2 + Math.cos(angle) * 14
      ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = color
      ctx.fillText(label, lx, ly)
    }
  }

  // ========== 图像 ==========
  function drawGraph(ctx, R) {
    const s = S.current
    const gw = 240, gh = 130, gx = 16, gy = 16

    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, 8); ctx.stroke()

    const titles = { speed: '📈 F - v² 图像', radius: '📈 F - 1/r 图像', mass: '📈 F - m 图像' }
    ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText(titles[s.mode], gx + 10, gy + 16)

    const ox = gx + 40, oy = gy + gh - 18, w = gw - 55, h = gh - 35
    ctx.strokeStyle = '#bbb'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(ox, oy - h); ctx.lineTo(ox, oy); ctx.lineTo(ox + w, oy); ctx.stroke()

    // 理论线
    ctx.strokeStyle = 'rgba(255,152,0,0.3)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + w, oy - h); ctx.stroke(); ctx.setLineDash([])

    const pts = s.dataPoints
    if (pts.length > 0) {
      const maxX = Math.max(...pts.map(p => p.x), 1)
      const maxY = Math.max(...pts.map(p => p.y), 1)
      ctx.fillStyle = '#0288D1'
      for (const p of pts) {
        const px = ox + (p.x / maxX) * w, py = oy - (p.y / maxY) * h
        ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill()
      }
      if (pts.length > 1) {
        ctx.strokeStyle = '#0288D1'; ctx.lineWidth = 1.5; ctx.beginPath()
        pts.forEach((p, i) => {
          const px = ox + (p.x / maxX) * w, py = oy - (p.y / maxY) * h
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
        })
        ctx.stroke()
      }
    }

    const xLabels = { speed: 'v²', radius: '1/r', mass: 'm (kg)' }
    ctx.fillStyle = '#666'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(xLabels[s.mode], ox + w / 2, oy + 14)
    ctx.save(); ctx.translate(gx + 10, oy - h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('F (N)', 0, 0); ctx.restore()
  }

  // ========== 信息面板 ==========
  function drawInfoPanel(ctx, R) {
    const s = S.current
    const pw = 220, ph = 200, px = R.W - pw - 16, py = 16

    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('📊 圆周运动参数', px + 12, py + 20)
    ctx.font = '11px sans-serif'; let y = py + 40

    ctx.fillStyle = '#666'
    ctx.fillText(`质量 m = ${s.mass.toFixed(2)} kg`, px + 12, y); y += 18
    ctx.fillText(`半径 r = ${s.radius.toFixed(2)} m`, px + 12, y); y += 18
    ctx.fillText(`角速度 ω = ${s.omega.toFixed(2)} rad/s`, px + 12, y); y += 18
    ctx.fillStyle = '#0288D1'; ctx.fillText(`线速度 v = ${s.v.toFixed(3)} m/s`, px + 12, y); y += 18
    ctx.fillStyle = '#F44336'; ctx.fillText(`向心力 F = ${s.F.toFixed(3)} N`, px + 12, y); y += 18
    ctx.fillStyle = '#E65100'; ctx.fillText(`向心加速度 a = ${(s.F / s.mass).toFixed(3)} m/s²`, px + 12, y); y += 18
    ctx.fillStyle = '#4CAF50'; ctx.fillText(`周期 T = ${s.T.toFixed(3)} s`, px + 12, y); y += 18
    ctx.fillStyle = '#666'; ctx.fillText(`频率 f = ${(1 / s.T).toFixed(2)} Hz`, px + 12, y); y += 22
    ctx.fillStyle = '#E65100'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('F = mv²/r = mω²r', px + 12, y)
  }

  function drawDescription(ctx, R) {
    const x = 16, y = R.H - 46
    ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'
    ctx.fillText('圆周运动与向心力', x, y)
    ctx.fillStyle = '#0288D1'; ctx.font = 'bold 13px serif'
    ctx.fillText('F = mv²/r = mω²r', x + 160, y)
    ctx.fillStyle = '#888'; ctx.font = '11px sans-serif'
    ctx.fillText('调节滑块改变参数 · 点击「记录数据」采集 · 切换模式验证 F∝v², F∝1/r, F∝m', x, y + 20)
  }

  // ========== 引导气泡 ==========
  function drawGuideBubble(ctx, R) {
    const s = S.current
    if (s.guideDismissed) return
    const text = '👆 调节上方滑块改变质量、半径、角速度，点击「记录数据」采集数据点'
    const bx = R.W / 2, by = R.H * 0.65
    ctx.font = '13px sans-serif'
    const tw = ctx.measureText(text).width + 24, th = 32
    const float = Math.sin(Date.now() / 600) * 4, ry = by + float
    ctx.fillStyle = 'rgba(79,195,247,0.12)'; ctx.beginPath(); ctx.roundRect(bx - tw / 2, ry - th / 2, tw, th, 16); ctx.fill()
    ctx.strokeStyle = 'rgba(79,195,247,0.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(bx - tw / 2, ry - th / 2, tw, th, 16); ctx.stroke()
    ctx.fillStyle = '#0288D1'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(text, bx, ry); ctx.textBaseline = 'alphabetic'
  }

  // ========== 交互 ==========
  const handleRecord = useCallback(() => {
    const s = S.current
    s.guideDismissed = true
    let x, y
    if (s.mode === 'speed') x = s.v * s.v
    else if (s.mode === 'radius') x = 1 / s.radius
    else x = s.mass
    y = s.F
    s.dataPoints.push({ x, y })
    if (s.dataPoints.length > 20) s.dataPoints.shift()
  }, [])

  const handleReset = useCallback(() => {
    const s = S.current
    s.angle = 0; s.time = 0; s.trail = []; s.dataPoints = []; s.running = true
  }, [])

  const handleModeChange = useCallback((newMode) => {
    S.current.mode = newMode; S.current.dataPoints = []; setMode(newMode)
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
            <input type="range" min="0.1" max="2" step="0.1" value={mass}
              onChange={(e) => { const v = parseFloat(e.target.value); S.current.mass = v; setMass(v) }} style={styles.slider} />
            <span style={styles.sliderVal}>{mass.toFixed(1)}kg</span>
          </label>
          <label style={styles.controlLabel}>
            半径 r：
            <input type="range" min="0.3" max="3" step="0.1" value={radius}
              onChange={(e) => { const v = parseFloat(e.target.value); S.current.radius = v; setRadius(v) }} style={styles.slider} />
            <span style={styles.sliderVal}>{radius.toFixed(1)}m</span>
          </label>
          <label style={styles.controlLabel}>
            角速度 ω：
            <input type="range" min="0.5" max="8" step="0.1" value={omega}
              onChange={(e) => { const v = parseFloat(e.target.value); S.current.omega = v; setOmega(v) }} style={styles.slider} />
            <span style={styles.sliderVal}>{omega.toFixed(1)}rad/s</span>
          </label>
          <div style={styles.sep} />
          <div style={styles.modeGroup}>
            {[{ key: 'speed', label: 'F∝v²' }, { key: 'radius', label: 'F∝1/r' }, { key: 'mass', label: 'F∝m' }].map(m => (
              <button key={m.key} style={mode === m.key ? styles.modeBtnActive : styles.modeBtn}
                onClick={() => handleModeChange(m.key)}>{m.label}</button>
            ))}
          </div>
        </div>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={styles.canvas} />
      </div>
      <div style={styles.desc}>
        <b>实验：圆周运动与向心力</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          调节滑块改变参数 · 记录数据验证 F∝v²、F∝1/r、F∝m
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
  slider: { width: 70, accentColor: '#4FC3F7' },
  sliderVal: { color: '#0288D1', fontWeight: 600, minWidth: 50, fontSize: 12 },
  btn: { background: '#f0f0f0', color: '#333', border: '1px solid #ddd', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  recordBtn: { background: '#F44336', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600 },
  sep: { width: 1, height: 20, background: '#ddd' },
  modeGroup: { display: 'flex', gap: 4 },
  modeBtn: { background: '#f0f0f0', color: '#666', border: '1px solid #ddd', borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer' },
  modeBtnActive: { background: '#4FC3F7', color: '#000', border: '1px solid #4FC3F7', borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer', fontWeight: 600 },
  main: { flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' },
  canvas: { flex: 1, width: '100%' },
  desc: { padding: '8px 14px', background: '#f5f5f5', borderTop: '1px solid #ccc', fontSize: 13, color: '#333' },
}
