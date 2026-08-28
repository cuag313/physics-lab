import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * NewtonSecondLawScene — 验证牛顿第二定律
 *
 * 交互：
 * - 拖拽施加拉力（通过砝码质量）
 * - 调整小车质量
 * - 实时显示加速度、力、质量
 * - 绘制 a-F 和 a-1/m 图像
 * - 验证：F = ma
 *
 * 实验方法：
 * - 控制变量法
 * - 方案一：保持m不变，改变F → a∝F
 * - 方案二：保持F不变，改变m → a∝1/m
 */
export default function NewtonSecondLawScene({ preset }) {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  // 实验状态
  const stateRef = useRef({
    cartMass: 1.0,       // 小车质量 kg
    hangingMass: 0.1,    // 悬挂砝码质量 kg
    cartX: 0,            // 小车位置
    cartV: 0,            // 小车速度
    running: false,
    time: 0,
    dataPoints: [],      // 采集的数据 {F, a, m}
    mode: 'force',       // 'force' | 'mass'
    friction: 0.02,      // 摩擦系数
    pulleyY: 0.3,        // 滑轮高度
    tableHeight: 0.4,    // 桌面高度
  })

  const [running, setRunning] = useState(false)
  const [mode, setMode] = useState('force')
  const [displayData, setDisplayData] = useState(null)
  const [, forceUpdate] = useState(0)
  const [cursor, setCursor] = useState('default')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const renderer = createRenderer(canvas)
    canvasRef.current._renderer = renderer

    const renderLoop = () => {
      updatePhysics()
      renderFrame(renderer)
      animRef.current = requestAnimationFrame(renderLoop)
    }
    renderLoop()

    const handleResize = () => renderer.resize()
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [])

  function createRenderer(canvas) {
    const renderer = {
      canvas,
      ctx: canvas.getContext('2d'),
      screenW: 0, screenH: 0,
      scale: 80,
      offsetX: 0, offsetY: 0,
      resize() {
        const rect = canvas.getBoundingClientRect()
        canvas.width = rect.width * devicePixelRatio
        canvas.height = rect.height * devicePixelRatio
        this.ctx.scale(devicePixelRatio, devicePixelRatio)
        this.screenW = rect.width
        this.screenH = rect.height
        this.offsetX = this.screenW * 0.35
        this.offsetY = this.screenH * 0.6
      },
      worldToScreen(wx, wy) {
        return [this.offsetX + wx * this.scale, this.offsetY - wy * this.scale]
      },
      screenToWorld(sx, sy) {
        return [(sx - this.offsetX) / this.scale, (this.offsetY - sy) / this.scale]
      },
      clear() { this.ctx.clearRect(0, 0, this.screenW, this.screenH) },
    }
    renderer.resize()
    return renderer
  }

  // ========== 物理 ==========
  function updatePhysics() {
    const s = stateRef.current
    if (!s.running) return

    const dt = 1 / 60
    s.time += dt

    // 力学分析
    const m = s.cartMass         // 小车质量
    const M = s.hangingMass      // 悬挂质量
    const g = 9.8
    const f = s.friction * m * g // 摩擦力

    // 拉力 = Mg（绳子张力近似）
    // 考虑滑轮系统：F_net = Mg - f
    // 总质量 = m + M
    const F_net = M * g - f
    const totalMass = m + M
    const a = F_net / totalMass

    // 更新运动
    s.cartV += a * dt
    s.cartX += s.cartV * dt

    // 边界
    if (s.cartX > 3) {
      s.cartX = 3
      s.cartV = 0
      s.running = false
      setRunning(false)
    }

    // 采集数据
    const F = M * g
    setDisplayData({
      F, a: Math.max(0, a), m, M,
      friction: f,
      netForce: F_net,
      cartX: s.cartX,
      cartV: s.cartV,
      time: s.time,
    })

    forceUpdate(n => n + 1)
  }

  // ========== 渲染 ==========
  function renderFrame(renderer) {
    const ctx = renderer.ctx
    renderer.clear()

    drawTable(ctx, renderer)
    drawCart(ctx, renderer)
    drawPulley(ctx, renderer)
    drawString(ctx, renderer)
    drawHangingMass(ctx, renderer)
    drawForceArrows(ctx, renderer)
    drawGraph(ctx, renderer)
    drawDataPanel(ctx, renderer)
    drawDescription(ctx, renderer)
  }

  function drawTable(ctx, renderer) {
    const [, ty] = renderer.worldToScreen(0, 0.4)
    const w = renderer.screenW

    // 桌面
    ctx.fillStyle = '#2a2a3e'
    ctx.fillRect(0, ty, w, renderer.screenH - ty)

    // 桌面边
    ctx.strokeStyle = '#4a4a6a'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(0, ty)
    ctx.lineTo(w, ty)
    ctx.stroke()

    // 轨道
    ctx.strokeStyle = '#6e7681'
    ctx.lineWidth = 4
    const [x1] = renderer.worldToScreen(-2, 0)
    const [x2] = renderer.worldToScreen(4, 0)
    ctx.beginPath()
    ctx.moveTo(x1, ty - 3)
    ctx.lineTo(x2, ty - 3)
    ctx.stroke()
  }

  function drawCart(ctx, renderer) {
    const s = stateRef.current
    const [cx, cy] = renderer.worldToScreen(s.cartX, 0.4)
    const scale = renderer.scale

    // 车身
    const cartW = 1.0 * scale
    const cartH = 0.5 * scale
    const grad = ctx.createLinearGradient(cx - cartW / 2, cy - cartH, cx + cartW / 2, cy)
    grad.addColorStop(0, '#4a90d9')
    grad.addColorStop(1, '#2a5f9e')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.roundRect(cx - cartW / 2, cy - cartH - 8, cartW, cartH, 4)
    ctx.fill()
    ctx.strokeStyle = '#6ab0ff'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.roundRect(cx - cartW / 2, cy - cartH - 8, cartW, cartH, 4)
    ctx.stroke()

    // 车轮
    ctx.fillStyle = '#2d2d2d'
    const wheelR = 8
    ctx.beginPath()
    ctx.arc(cx - cartW / 3, cy - 2, wheelR, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(cx + cartW / 3, cy - 2, wheelR, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#555'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(cx - cartW / 3, cy - 2, wheelR, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx + cartW / 3, cy - 2, wheelR, 0, Math.PI * 2)
    ctx.stroke()

    // 质量标签
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${s.cartMass.toFixed(1)}kg`, cx, cy - cartH / 2 - 4)
  }

  function drawPulley(ctx, renderer) {
    const [, ty] = renderer.worldToScreen(0, 0.4)
    const [px] = renderer.worldToScreen(3.5, 0)
    const r = 12

    // 滑轮支架
    ctx.strokeStyle = '#6e7681'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(px, ty - 3)
    ctx.lineTo(px, ty - 60)
    ctx.stroke()

    // 滑轮
    ctx.fillStyle = '#4a5568'
    ctx.beginPath()
    ctx.arc(px, ty - 60, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#718096'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(px, ty - 60, r, 0, Math.PI * 2)
    ctx.stroke()

    // 轴心
    ctx.fillStyle = '#a0aec0'
    ctx.beginPath()
    ctx.arc(px, ty - 60, 3, 0, Math.PI * 2)
    ctx.fill()
  }

  function drawString(ctx, renderer) {
    const s = stateRef.current
    const [cx] = renderer.worldToScreen(s.cartX, 0)
    const [, ty] = renderer.worldToScreen(0, 0.4)
    const [px] = renderer.worldToScreen(3.5, 0)

    // 绳子：小车→滑轮→悬挂
    ctx.strokeStyle = '#a0aec0'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(cx + 0.5 * renderer.scale, ty - 20) // 小车前端
    ctx.lineTo(px, ty - 60)                           // 滑轮
    ctx.lineTo(px, ty + 20 + s.hangingMass * 40)     // 悬挂
    ctx.stroke()
  }

  function drawHangingMass(ctx, renderer) {
    const s = stateRef.current
    const [, ty] = renderer.worldToScreen(0, 0.4)
    const [px] = renderer.worldToScreen(3.5, 0)

    const my = ty + 20 + s.hangingMass * 40

    // 砝码
    const r = 8 + s.hangingMass * 10
    ctx.fillStyle = '#FF6B6B'
    ctx.beginPath()
    ctx.roundRect(px - r * 0.7, my, r * 1.4, r * 1.2, 3)
    ctx.fill()
    ctx.strokeStyle = '#ff9999'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(px - r * 0.7, my, r * 1.4, r * 1.2, 3)
    ctx.stroke()

    ctx.fillStyle = '#fff'
    ctx.font = 'bold 10px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${s.hangingMass.toFixed(2)}kg`, px, my + r * 0.6)
  }

  function drawForceArrows(ctx, renderer) {
    const s = stateRef.current
    if (!displayData) return

    const [cx, cy] = renderer.worldToScreen(s.cartX, 0.4)
    const scale = renderer.scale

    // 拉力 F（向右）
    const F = displayData.F
    const fLen = F * 20
    drawForceArrow(ctx, cx, cy - 30, cx + fLen, cy - 30, '#4CAF50', `F=${F.toFixed(2)}N`)

    // 摩擦力 f（向左）
    const f = displayData.friction
    if (f > 0.01) {
      const fLen2 = f * 20
      drawForceArrow(ctx, cx, cy - 18, cx - fLen2, cy - 18, '#FF6B6B', `f=${f.toFixed(2)}N`)
    }
  }

  function drawForceArrow(ctx, x1, y1, x2, y2, color, label) {
    const angle = Math.atan2(y2 - y1, x2 - x1)
    const arrowLen = 7

    ctx.strokeStyle = color
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()

    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(x2, y2)
    ctx.lineTo(x2 - arrowLen * Math.cos(angle - 0.35), y2 - arrowLen * Math.sin(angle - 0.35))
    ctx.lineTo(x2 - arrowLen * Math.cos(angle + 0.35), y2 - arrowLen * Math.sin(angle + 0.35))
    ctx.closePath()
    ctx.fill()

    if (label) {
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(label, (x1 + x2) / 2, (y1 + y2) / 2 - 6)
    }
  }

  function drawGraph(ctx, renderer) {
    const s = stateRef.current
    const w = renderer.screenW
    const graphW = 220
    const graphH = 120
    const gx = 16
    const gy = 16

    ctx.fillStyle = 'rgba(22, 27, 34, 0.95)'
    ctx.beginPath()
    ctx.roundRect(gx, gy, graphW, graphH, 8)
    ctx.fill()
    ctx.strokeStyle = '#30363d'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(gx, gy, graphW, graphH, 8)
    ctx.stroke()

    ctx.fillStyle = '#c9d1d9'
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(s.mode === 'force' ? '📈 a-F 图像' : '📈 a-1/m 图像', gx + 10, gy + 16)

    // 坐标轴
    const ox = gx + 30
    const oy = gy + graphH - 15
    const gw = graphW - 45
    const gh = graphH - 35

    ctx.strokeStyle = '#484f58'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(ox, oy - gh)
    ctx.lineTo(ox, oy)
    ctx.lineTo(ox + gw, oy)
    ctx.stroke()

    // 数据点
    const points = s.dataPoints
    if (points.length > 1) {
      ctx.fillStyle = '#4FC3F7'
      ctx.strokeStyle = '#4FC3F7'
      ctx.lineWidth = 1.5

      const maxX = Math.max(...points.map(p => p.x), 1)
      const maxY = Math.max(...points.map(p => p.y), 1)

      ctx.beginPath()
      for (let i = 0; i < points.length; i++) {
        const px = ox + (points[i].x / maxX) * gw
        const py = oy - (points[i].y / maxY) * gh
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)

        ctx.fillStyle = '#4FC3F7'
        ctx.beginPath()
        ctx.arc(px, py, 3, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.stroke()

      // 理论线
      ctx.strokeStyle = 'rgba(255, 152, 0, 0.4)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(ox, oy)
      ctx.lineTo(ox + gw, oy - gh)
      ctx.stroke()
      ctx.setLineDash([])
    }

    ctx.fillStyle = '#484f58'
    ctx.font = '9px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(s.mode === 'force' ? 'F' : '1/m', ox + gw / 2, oy + 12)
    ctx.save()
    ctx.translate(gx + 10, oy - gh / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText('a', 0, 0)
    ctx.restore()
  }

  function drawDataPanel(ctx, renderer) {
    const w = renderer.screenW
    const panelW = 200
    const panelH = 160
    const px = w - panelW - 16
    const py = 16

    ctx.fillStyle = 'rgba(22, 27, 34, 0.95)'
    ctx.beginPath()
    ctx.roundRect(px, py, panelW, panelH, 8)
    ctx.fill()
    ctx.strokeStyle = '#30363d'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(px, py, panelW, panelH, 8)
    ctx.stroke()

    ctx.fillStyle = '#c9d1d9'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('📊 牛顿第二定律', px + 12, py + 20)

    ctx.font = '11px sans-serif'
    let y = py + 40
    const s = stateRef.current
    const d = displayData

    ctx.fillStyle = '#c9d1d9'
    ctx.fillText(`小车质量 m = ${s.cartMass.toFixed(2)} kg`, px + 12, y); y += 18
    ctx.fillText(`悬挂质量 M = ${s.hangingMass.toFixed(3)} kg`, px + 12, y); y += 18

    if (d) {
      ctx.fillStyle = '#4CAF50'
      ctx.fillText(`拉力 F = ${d.F.toFixed(3)} N`, px + 12, y); y += 18

      ctx.fillStyle = '#FF9800'
      ctx.fillText(`加速度 a = ${d.a.toFixed(3)} m/s²`, px + 12, y); y += 18

      ctx.fillStyle = '#4FC3F7'
      ctx.fillText(`验证: F/m = ${(d.F / d.m).toFixed(3)}`, px + 12, y); y += 18

      const diff = Math.abs(d.a - d.F / (d.m + d.M))
      ctx.fillStyle = diff < 0.1 ? '#4CAF50' : '#FF9800'
      ctx.fillText(`误差: ${diff.toFixed(4)}`, px + 12, y)
    }
  }

  function drawDescription(ctx, renderer) {
    const h = renderer.screenH
    const x = 16
    let y = h - 110

    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'

    ctx.fillStyle = '#c9d1d9'
    ctx.font = 'bold 14px sans-serif'
    ctx.fillText('验证牛顿第二定律', x, y); y += 22

    ctx.fillStyle = '#4FC3F7'
    ctx.font = 'bold 16px serif'
    ctx.fillText('F = ma', x, y); y += 24

    ctx.fillStyle = '#8b949e'
    ctx.font = '11px sans-serif'
    ctx.fillText('① 调整小车质量和悬挂砝码质量', x, y); y += 16
    ctx.fillText('② 点击"释放"开始运动', x, y); y += 16
    ctx.fillText('③ 采集数据点绘制 a-F / a-1/m 图像', x, y)
  }

  // ========== 控制 ==========
  const handleStart = useCallback(() => {
    const s = stateRef.current
    s.cartX = 0
    s.cartV = 0
    s.time = 0
    s.running = true
    setRunning(true)
    setDisplayData(null)
  }, [])

  const handleStop = useCallback(() => {
    stateRef.current.running = false
    setRunning(false)

    // 采集数据点
    const s = stateRef.current
    const d = displayData
    if (d && d.a > 0.01) {
      if (s.mode === 'force') {
        s.dataPoints.push({ x: d.F, y: d.a, label: `F=${d.F.toFixed(2)}` })
      } else {
        s.dataPoints.push({ x: 1 / s.cartMass, y: d.a, label: `m=${s.cartMass.toFixed(2)}` })
      }
    }
  }, [displayData])

  const handleReset = useCallback(() => {
    const s = stateRef.current
    s.cartX = 0
    s.cartV = 0
    s.time = 0
    s.running = false
    s.dataPoints = []
    setRunning(false)
    setDisplayData(null)
  }, [])

  const rule = running
    ? { text: '运动中：观察加速度与力的关系', color: '#FF9800' }
    : displayData
      ? { text: `采集完成：F=${displayData.F.toFixed(2)}N, a=${displayData.a.toFixed(3)}m/s²`, color: '#4CAF50' }
      : { text: '调整参数后点击"释放"开始实验', color: '#484f58' }

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <span style={styles.title}>验证牛顿第二定律</span>
        <div style={styles.toolbarActions}>
          {!running ? (
            <button style={styles.playBtn} onClick={handleStart}>▶ 释放</button>
          ) : (
            <button style={styles.pauseBtn} onClick={handleStop}>⏸ 停止</button>
          )}
          <button style={styles.setBtn} onClick={handleReset}>⚙ Set</button>
          <div style={styles.sep} />
          <label style={styles.controlLabel}>
            小车质量：
            <input type="range" min="0.5" max="3" step="0.1"
              value={stateRef.current.cartMass}
              onChange={(e) => { stateRef.current.cartMass = parseFloat(e.target.value); forceUpdate(n => n + 1) }}
              style={styles.slider} />
            <span style={styles.sliderVal}>{stateRef.current.cartMass.toFixed(1)} kg</span>
          </label>
          <label style={styles.controlLabel}>
            悬挂质量：
            <input type="range" min="0.01" max="0.5" step="0.01"
              value={stateRef.current.hangingMass}
              onChange={(e) => { stateRef.current.hangingMass = parseFloat(e.target.value); forceUpdate(n => n + 1) }}
              style={styles.slider} />
            <span style={styles.sliderVal}>{stateRef.current.hangingMass.toFixed(2)} kg</span>
          </label>
          <label style={styles.controlLabel}>
            模式：
            <select value={mode} onChange={(e) => { setMode(e.target.value); stateRef.current.mode = e.target.value; stateRef.current.dataPoints = []; }}
              style={styles.select}>
              <option value="force">a-F (m不变)</option>
              <option value="mass">a-1/m (F不变)</option>
            </select>
          </label>
          <span style={styles.timer}>t = {stateRef.current.time.toFixed(3)} s</span>
        </div>
      </div>

      <div style={styles.main}>
        <canvas ref={canvasRef}
          style={{ ...styles.canvas, cursor }}
        />
      </div>

      <div style={styles.desc}>
        <b>实验：验证牛顿第二定律</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>调整小车质量和悬挂砝码质量，点击"释放"开始运动，采集数据点绘制 a-F / a-1/m 图像，验证 F = ma。</span>
      </div>
    </div>
  )
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#e8e8e8', color: '#333', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  toolbar: { minHeight: 44, background: '#f5f5f5', borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', flexShrink: 0, flexWrap: 'wrap', gap: 6 },
  title: { fontSize: 14, fontWeight: 600 },
  toolbarActions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  controlLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#555' },
  slider: { width: 80, accentColor: '#4A90D9' },
  sliderVal: { color: '#4A90D9', fontWeight: 600, minWidth: 40, fontSize: 12 },
  select: { background: '#fff', color: '#333', border: '1px solid #ccc', borderRadius: 4, padding: '3px 6px', fontSize: 12 },
  btn: { background: '#fff', color: '#4A90D9', border: '1px solid #ccc', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  playBtn: { background: '#4A90D9', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600, minWidth: 70 },
  pauseBtn: { background: '#E53935', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600, minWidth: 70 },
  setBtn: { background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  startBtn: { background: '#4A90D9', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  stopBtn: { background: '#E53935', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  sep: { width: 1, height: 20, background: '#ccc' },
  timer: { fontFamily: 'Consolas,monospace', fontSize: 13, marginLeft: 8 },
  main: { flex: 1, display: 'flex', overflow: 'hidden', background: '#fff', position: 'relative' },
  canvas: { flex: 1, width: '100%' },
  desc: { padding: '8px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13 },
}
