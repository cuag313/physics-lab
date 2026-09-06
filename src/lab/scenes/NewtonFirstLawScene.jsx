import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * NewtonFirstLawScene — 牛顿第一定律（惯性定律）
 *
 * 理想斜面实验 + 气垫导轨验证
 *
 * 核心思想：
 * - 物体不受外力（或合外力为零）时，保持静止或匀速直线运动
 * - 摩擦力越小，物体运动越接近"永远运动"
 *
 * 交互：
 * - 拖拽小球从斜面释放
 * - 调节摩擦系数（0 = 理想无摩擦）
 * - 观察小球在水平面上的运动距离
 * - 推理法：摩擦→0 时，运动→∞
 */
export default function NewtonFirstLawScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    // 斜面参数
    rampLen: 3.0,        // 斜面长度 m
    rampAngle: 25,       // 斜面角度 deg
    rampX: -4,           // 斜面底端x坐标

    // 小球
    ballR: 0.25,         // 小球半径 m
    ballX: 0,            // 小球当前位置 x
    ballY: 0,            // 小球当前位置 y（斜面上）
    ballV: 0,            // 小球速度
    ballOnRamp: true,    // 是否在斜面上
    ballProgress: 0.8,   // 在斜面上的位置 (0=底, 1=顶)
    ballPhase: 'idle',   // idle | rolling | sliding | stopped

    // 环境
    friction: 0.02,      // 摩擦系数
    g: 9.8,
    tableY: 0,           // 水平面高度

    // 轨迹
    trail: [],           // [{x, y}]
    maxTrailLen: 300,

    // 计时
    time: 0,
    distTraveled: 0,
  })

  const [friction, setFriction] = useState(0.02)
  const [phase, setPhase] = useState('idle')
  const [dist, setDist] = useState(0)
  const [, forceUpdate] = useState(0)
  const [cursor, setCursor] = useState('default')
  const [isDragging, setIsDragging] = useState(false)
  const [records, setRecords] = useState([])

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

  // ========== Renderer ==========
  function createRenderer(canvas) {
    const R = {
      canvas,
      ctx: canvas.getContext('2d'),
      W: 0, H: 0,
      scale: 90,
      ox: 0, oy: 0,
      resize() {
        const rect = canvas.getBoundingClientRect()
        canvas.width = rect.width * devicePixelRatio
        canvas.height = rect.height * devicePixelRatio
        this.ctx.scale(devicePixelRatio, devicePixelRatio)
        this.W = rect.width
        this.H = rect.height
        this.ox = this.W * 0.55
        this.oy = this.H * 0.65
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
    if (s.ballPhase === 'idle' || s.ballPhase === 'stopped') return

    const dt = 1 / 60
    s.time += dt
    const angle = s.rampAngle * Math.PI / 180
    const sinA = Math.sin(angle)
    const cosA = Math.cos(angle)

    if (s.ballPhase === 'rolling') {
      // 在斜面上：重力分量加速，减去滚动摩擦阻力
      const rollingFriction = 0.02
      const a = s.g * (sinA - rollingFriction * cosA)
      s.ballV += a * dt
      s.ballProgress -= (s.ballV * dt) / s.rampLen

      if (s.ballProgress <= 0) {
        // 到达斜面底端，进入水平面
        s.ballProgress = 0
        s.ballOnRamp = false
        s.ballPhase = 'sliding'
        s.ballX = s.rampX
        s.ballY = s.tableY
        s.trail = []
      }
    } else if (s.ballPhase === 'sliding') {
      // 水平面上：摩擦力减速
      const a = -s.friction * s.g
      s.ballV += a * dt

      if (s.ballV <= 0) {
        s.ballV = 0
        s.ballPhase = 'stopped'
        setPhase('stopped')
      }

      s.ballX += s.ballV * dt
      s.distTraveled = Math.max(0, s.ballX - s.rampX)
      setDist(s.distTraveled)

      // 记录轨迹
      s.trail.push({ x: s.ballX, y: s.tableY })
      if (s.trail.length > s.maxTrailLen) s.trail.shift()
    }

    forceUpdate(n => n + 1)
  }

  // ========== Render ==========
  function renderFrame(R) {
    const ctx = R.ctx
    R.clear()

    drawBackground(ctx, R)
    drawRamp(ctx, R)
    drawTable(ctx, R)
    drawTrail(ctx, R)
    drawBall(ctx, R)
    drawForceArrows(ctx, R)
    drawInfoPanel(ctx, R)
    drawInferencePanel(ctx, R)
    drawDescription(ctx, R)
  }

  function drawBackground(ctx, R) {
    ctx.fillStyle = '#e8e8e8'
    ctx.fillRect(0, 0, R.W, R.H)
  }

  function drawRamp(ctx, R) {
    const s = S.current
    const angle = s.rampAngle * Math.PI / 180
    const rampLenPx = s.rampLen * R.scale

    // 斜面底端在 (rampX, tableY)
    const [bx, by] = R.w2s(s.rampX, s.tableY)
    // 斜面顶端
    const tx = bx - rampLenPx * Math.cos(angle)
    const ty = by - rampLenPx * Math.sin(angle)

    // 斜面轨道
    ctx.strokeStyle = '#999'
    ctx.lineWidth = 6
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(bx, by)
    ctx.lineTo(tx, ty)
    ctx.stroke()

    // 斜面表面
    ctx.strokeStyle = '#aaa'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(bx, by)
    ctx.lineTo(tx, ty)
    ctx.stroke()

    // 标注角度
    const arcR = 40
    ctx.strokeStyle = 'rgba(33, 150, 243, 0.6)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(bx, by, arcR, Math.PI, Math.PI + angle, false)
    ctx.stroke()

    ctx.fillStyle = '#2196F3'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'
    const labelR = arcR + 14
    ctx.fillText(`${s.rampAngle}°`, bx - labelR * Math.cos(angle / 2), by - labelR * Math.sin(angle / 2))

    // 斜面长度标注
    ctx.fillStyle = '#999'
    ctx.font = '11px sans-serif'
    const midX = (bx + tx) / 2
    const midY = (by + ty) / 2
    ctx.fillText(`${s.rampLen.toFixed(1)}m`, midX + 15, midY - 10)
  }

  function drawTable(ctx, R) {
    const s = S.current
    const [, ty] = R.w2s(0, s.tableY)

    // 水平面
    ctx.fillStyle = '#f0f0f0'
    ctx.fillRect(0, ty, R.W, R.H - ty)

    // 桌面边缘
    ctx.strokeStyle = '#ccc'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(0, ty)
    ctx.lineTo(R.W, ty)
    ctx.stroke()

    // 刻度线
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)'
    ctx.lineWidth = 1
    ctx.font = '9px sans-serif'
    ctx.fillStyle = '#999'
    ctx.textAlign = 'center'
    for (let x = -2; x <= 8; x += 1) {
      const [sx] = R.w2s(x, 0)
      ctx.beginPath()
      ctx.moveTo(sx, ty)
      ctx.lineTo(sx, ty + 6)
      ctx.stroke()
      if (x >= 0) ctx.fillText(`${x}m`, sx, ty + 16)
    }
  }

  function drawTrail(ctx, R) {
    const s = S.current
    if (s.trail.length < 2) return

    ctx.strokeStyle = 'rgba(255, 152, 0, 0.4)'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    for (let i = 0; i < s.trail.length; i++) {
      const [sx, sy] = R.w2s(s.trail[i].x, s.trail[i].y)
      if (i === 0) ctx.moveTo(sx, sy - 2)
      else ctx.lineTo(sx, sy - 2)
    }
    ctx.stroke()
    ctx.setLineDash([])
  }

  function drawBall(ctx, R) {
    const s = S.current
    let sx, sy

    if (s.ballOnRamp) {
      // 在斜面上
      const angle = s.rampAngle * Math.PI / 180
      const [bx, by] = R.w2s(s.rampX, s.tableY)
      const dist = s.ballProgress * s.rampLen * R.scale
      sx = bx - dist * Math.cos(angle)
      sy = by - dist * Math.sin(angle)
    } else {
      [sx, sy] = R.w2s(s.ballX, s.tableY)
    }

    const r = s.ballR * R.scale

    // 小球阴影
    ctx.fillStyle = 'rgba(0,0,0,0.15)'
    ctx.beginPath()
    ctx.ellipse(sx + 3, sy + 3, r, r * 0.5, 0, 0, Math.PI * 2)
    ctx.fill()

    // 小球
    const grad = ctx.createRadialGradient(sx - r * 0.3, sy - r * 0.3, r * 0.1, sx, sy, r)
    grad.addColorStop(0, '#ff9800')
    grad.addColorStop(0.7, '#e65100')
    grad.addColorStop(1, '#bf360c')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(sx, sy - r, r, 0, Math.PI * 2)
    ctx.fill()

    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.beginPath()
    ctx.arc(sx - r * 0.25, sy - r * 1.25, r * 0.25, 0, Math.PI * 2)
    ctx.fill()

    // 速度矢量
    if (s.ballV > 0.1) {
      const vLen = Math.min(s.ballV * 15, 80)
      drawArrow(ctx, sx, sy - r, sx + vLen, sy - r, '#4CAF50', `v=${s.ballV.toFixed(2)}m/s`)
    }
  }

  function drawArrow(ctx, x1, y1, x2, y2, color, label) {
    const angle = Math.atan2(y2 - y1, x2 - x1)
    const headLen = 8

    ctx.strokeStyle = color
    ctx.lineWidth = 2
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

  function drawForceArrows(ctx, R) {
    const s = S.current
    if (s.ballPhase !== 'sliding') return

    let sx, sy
    [sx, sy] = R.w2s(s.ballX, s.tableY)
    const r = s.ballR * R.scale

    // 重力（向下）
    drawArrow(ctx, sx, sy - r, sx, sy - r + 30, '#F44336', 'mg')

    // 支持力（向上）
    drawArrow(ctx, sx, sy - r, sx, sy - r - 30, '#4CAF50', 'N')

    // 摩擦力（向左，与运动方向相反）
    if (s.friction > 0.001 && s.ballV > 0.01) {
      const fLen = Math.min(s.friction * 150, 50)
      drawArrow(ctx, sx - r, sy - r, sx - r - fLen, sy - r, '#FF9800', `f=μmg`)
    }
  }

  function drawInfoPanel(ctx, R) {
    const s = S.current
    const w = R.W
    const pw = 220
    const ph = 195
    const px = w - pw - 16
    const py = 16

    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
    ctx.beginPath()
    ctx.roundRect(px, py, pw, ph, 8)
    ctx.fill()
    ctx.strokeStyle = '#ddd'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(px, py, pw, ph, 8)
    ctx.stroke()

    ctx.fillStyle = '#333'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('📊 牛顿第一定律', px + 12, py + 20)

    ctx.font = '11px sans-serif'
    let y = py + 40
    ctx.fillStyle = '#666'
    ctx.fillText(`摩擦系数 μ = ${s.friction.toFixed(3)}`, px + 12, y); y += 18
    ctx.fillText(`斜面角度 θ = ${s.rampAngle}°`, px + 12, y); y += 18

    ctx.fillStyle = '#2196F3'
    ctx.fillText(`小球速度 v = ${s.ballV.toFixed(3)} m/s`, px + 12, y); y += 18

    ctx.fillStyle = '#FF9800'
    ctx.fillText(`水平距离 d = ${s.distTraveled.toFixed(2)} m`, px + 12, y); y += 18

    // μ=0 特殊提示
    if (s.friction === 0 && s.ballPhase === 'sliding') {
      ctx.fillStyle = '#4CAF50'
      ctx.font = 'bold 11px sans-serif'
      ctx.fillText('理想情况：μ=0，物体将永远运动（惯性定律）', px + 12, y); y += 18
      ctx.font = '11px sans-serif'
    }

    // 理论距离
    if (s.friction > 0.001) {
      const rollingFriction = 0.02
      const vAtBottom = Math.sqrt(2 * s.g * s.rampLen * Math.sin(s.rampAngle * Math.PI / 180) * (1 - rollingFriction / Math.tan(s.rampAngle * Math.PI / 180)))
      const theoreticalDist = (vAtBottom * vAtBottom) / (2 * s.friction * s.g)
      ctx.fillStyle = '#666'
      ctx.fillText(`理论距离 ≈ ${theoreticalDist.toFixed(1)} m`, px + 12, y); y += 18
    }

    // 状态
    ctx.fillStyle = s.ballPhase === 'stopped' ? '#F44336' : s.ballPhase === 'idle' ? '#999' : '#4CAF50'
    const statusText = {
      idle: '拖拽小球到斜面上释放',
      rolling: '在斜面上滚动...',
      sliding: '在水平面上滑动...',
      stopped: '已停止 — 摩擦力使物体减速',
    }
    ctx.fillText(statusText[s.ballPhase], px + 12, y)
  }

  function drawInferencePanel(ctx, R) {
    const s = S.current
    const pw = 260
    const ph = 100
    const px = 16
    const py = R.H - ph - 60

    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
    ctx.beginPath()
    ctx.roundRect(px, py, pw, ph, 8)
    ctx.fill()
    ctx.strokeStyle = '#ddd'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(px, py, pw, ph, 8)
    ctx.stroke()

    ctx.fillStyle = '#F9A825'
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('💡 推理法 — 伽利略的理想实验', px + 12, py + 18)

    ctx.font = '10px sans-serif'
    ctx.fillStyle = '#666'
    let y = py + 36

    const items = [
      { μ: '> 0.1', result: '很快停下', color: '#F44336' },
      { μ: '≈ 0.01', result: '滑行较远', color: '#FF9800' },
      { μ: '→ 0', result: '永远运动下去！', color: '#4CAF50' },
    ]

    for (const item of items) {
      ctx.fillStyle = item.color
      ctx.fillText(`μ ${item.μ}：${item.result}`, px + 12, y)
      y += 18
    }

    // 箭头指向结论
    ctx.fillStyle = '#2196F3'
    ctx.font = 'bold 10px sans-serif'
    ctx.fillText('∴ 不受力 → 匀速直线运动（惯性）', px + 12, y)
  }

  function drawDescription(ctx, R) {
    const h = R.H
    const x = 16
    let y = h - 46

    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillStyle = '#333'
    ctx.font = 'bold 14px sans-serif'
    ctx.fillText('牛顿第一定律（惯性定律）', x, y)

    ctx.fillStyle = '#2196F3'
    ctx.font = 'bold 13px serif'
    ctx.fillText('物体不受外力时保持静止或匀速直线运动', x, y + 20)
  }

  // ========== 交互 ==========
  function getBallScreenPos(R) {
    const s = S.current
    const angle = s.rampAngle * Math.PI / 180
    const [bx, by] = R.w2s(s.rampX, s.tableY)
    let sx, sy
    if (s.ballOnRamp) {
      const dist = s.ballProgress * s.rampLen * R.scale
      sx = bx - dist * Math.cos(angle)
      sy = by - dist * Math.sin(angle)
    } else {
      [sx, sy] = R.w2s(s.ballX, s.tableY)
    }
    const r = s.ballR * R.scale
    return { sx, sy: sy - r, r }
  }

  const handleCanvasMouseDown = useCallback((e) => {
    const canvas = canvasRef.current
    const R = canvas._R
    if (!R) return

    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top

    const { sx: ballSx, sy: ballSy, r } = getBallScreenPos(R)

    const dx = sx - ballSx
    const dy = sy - ballSy
    if (dx * dx + dy * dy < (r * 2) * (r * 2)) {
      setIsDragging(true)
      setCursor('grabbing')
    }
  }, [])

  const handleCanvasMouseMove = useCallback((e) => {
    const canvas = canvasRef.current
    const R = canvas._R
    if (!R) return

    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top

    if (!isDragging) {
      // Ball hover cursor
      const { sx: ballSx, sy: ballSy, r } = getBallScreenPos(R)
      const dx = sx - ballSx
      const dy = sy - ballSy
      setCursor(dx * dx + dy * dy < (r * 2) * (r * 2) ? 'grab' : 'default')
      return
    }

    const s = S.current
    // 更新小球在斜面上的位置
    const angle = s.rampAngle * Math.PI / 180
    const [bx, by] = R.w2s(s.rampX, s.tableY)

    // 计算到斜面底端的距离
    const dx = bx - sx
    const dy = by - sy
    const distAlongRamp = (dx * Math.cos(angle) + dy * Math.sin(angle))

    s.ballProgress = Math.max(0.05, Math.min(1, distAlongRamp / (s.rampLen * R.scale)))
    s.ballOnRamp = true
    s.ballPhase = 'idle'
    forceUpdate(n => n + 1)
  }, [isDragging])

  const handleCanvasMouseUp = useCallback(() => {
    if (!isDragging) return
    setIsDragging(false)
    setCursor('default')

    const s = S.current
    // 释放小球，开始滚动
    if (s.ballProgress > 0.05) {
      s.ballPhase = 'rolling'
      s.ballV = 0
      s.time = 0
      s.distTraveled = 0
      s.trail = []
      setPhase('rolling')
      setDist(0)
    }
  }, [isDragging])

  // ========== Controls ==========
  const handleReset = useCallback(() => {
    const s = S.current
    s.ballProgress = 0.8
    s.ballOnRamp = true
    s.ballX = 0
    s.ballV = 0
    s.ballPhase = 'idle'
    s.time = 0
    s.distTraveled = 0
    s.trail = []
    setPhase('idle')
    setDist(0)
    setRecords([])
  }, [])

  const handleFrictionChange = useCallback((val) => {
    S.current.friction = val
    setFriction(val)
  }, [])

  const handleAngleChange = useCallback((val) => {
    S.current.rampAngle = val
    if (S.current.ballOnRamp) {
      S.current.ballProgress = 0.8
    }
    forceUpdate(n => n + 1)
  }, [])

  const handleRecord = useCallback(() => {
    const s = S.current
    setRecords(prev => [...prev, {
      id: prev.length + 1,
      friction: s.friction,
      angle: s.rampAngle,
      distance: s.distTraveled.toFixed(2),
    }])
  }, [])

  const frictionPresets = [
    { label: '无摩擦(μ=0)', value: 0 },
    { label: '小(μ=0.01)', value: 0.01 },
    { label: '中(μ=0.05)', value: 0.05 },
    { label: '大(μ=0.1)', value: 0.1 },
  ]

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <span style={styles.title}>牛顿第一定律（惯性定律）</span>
        <div style={styles.toolbarActions}>
          <button style={styles.btn} onClick={handleReset}>↺ 重置</button>
          <button style={styles.btn} onClick={handleRecord}>📋 记录</button>
          <div style={styles.sep} />
          <label style={styles.controlLabel}>
            摩擦系数 μ：
            <input type="range" min="0" max="0.15" step="0.005"
              value={friction}
              onChange={(e) => handleFrictionChange(parseFloat(e.target.value))}
              style={styles.slider} />
            <span style={styles.sliderVal}>{friction.toFixed(3)}</span>
          </label>
          <div style={{ display: 'flex', gap: 4 }}>
            {frictionPresets.map(p => (
              <button key={p.value}
                style={{
                  ...styles.btn,
                  ...(Math.abs(friction - p.value) < 0.001 ? { background: '#FF9800', color: '#fff', borderColor: '#e65100' } : {}),
                }}
                onClick={() => handleFrictionChange(p.value)}>
                {p.label}
              </button>
            ))}
          </div>
          <label style={styles.controlLabel}>
            斜面角度：
            <input type="range" min="10" max="45" step="1"
              value={S.current.rampAngle}
              onChange={(e) => handleAngleChange(parseInt(e.target.value))}
              style={styles.slider} />
            <span style={styles.sliderVal}>{S.current.rampAngle}°</span>
          </label>
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

        {/* 数据记录面板 */}
        {records.length > 0 && (
          <div style={styles.recordsPanel}>
            <div style={styles.recordsHeader}>
              <span style={{ fontWeight: 600, fontSize: 12 }}>📋 实验数据</span>
              <button style={{ ...styles.btn, padding: '2px 8px', fontSize: 11 }}
                onClick={() => setRecords([])}>清空</button>
            </div>
            <div style={styles.recordsTable}>
              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #ddd' }}>
                    <th style={styles.th}>#</th>
                    <th style={styles.th}>μ</th>
                    <th style={styles.th}>θ</th>
                    <th style={styles.th}>d(m)</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={styles.td}>{r.id}</td>
                      <td style={styles.td}>{r.friction.toFixed(3)}</td>
                      <td style={styles.td}>{r.angle}°</td>
                      <td style={styles.td}>{r.distance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div style={styles.desc}>
        <b>实验：牛顿第一定律</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          拖拽小球到斜面高处释放 → 观察水平面上的运动距离 → 减小摩擦系数 → 推理：μ→0 时物体永远运动
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
  slider: { width: 80, accentColor: '#FF9800' },
  sliderVal: { color: '#FF9800', fontWeight: 600, minWidth: 45, fontSize: 12 },
  btn: { background: '#f0f0f0', color: '#333', border: '1px solid #ddd', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  sep: { width: 1, height: 20, background: '#ccc' },
  main: { flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' },
  canvas: { flex: 1, width: '100%' },
  desc: { padding: '8px 14px', background: '#f5f5f5', borderTop: '1px solid #ccc', fontSize: 13, color: '#333' },
  recordsPanel: { position: 'absolute', bottom: 12, right: 12, background: 'rgba(255,255,255,0.95)', border: '1px solid #ddd', borderRadius: 8, padding: 8, minWidth: 180, maxHeight: 220, overflow: 'auto', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' },
  recordsHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  recordsTable: { overflow: 'auto', maxHeight: 160 },
  th: { padding: '3px 6px', textAlign: 'center', color: '#666', fontWeight: 600 },
  td: { padding: '3px 6px', textAlign: 'center', color: '#333' },
}
