import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * ParallelogramRuleScene — 验证力的平行四边形定则
 *
 * 交互：
 * - 拖拽两个分力的大小和方向
 * - 实时显示合力（平行四边形对角线）
 * - 等效替代法验证
 * - 验证：F² = F₁² + F₂² + 2F₁F₂cosθ
 */
export default function ParallelogramRuleScene({ preset }) {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const rendererRef = useRef(null)

  const stateRef = useRef({
    // 两个分力
    F1: { magnitude: 4, angle: 30 },   // 力1（度）
    F2: { magnitude: 3, angle: 150 },  // 力2（度）
    // 合力（计算得出）
    F: { magnitude: 0, angle: 0 },
    // 交点（固定）
    origin: { x: 0, y: 0 },
    // 交互
    selectedForce: null,  // 'F1' | 'F2' | null
  })

  const interactionRef = useRef({ mode: 'idle', target: null })
  const [displayData, setDisplayData] = useState(null)
  const [cursor, setCursor] = useState('default')
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const renderer = createRenderer(canvas)
    rendererRef.current = renderer

    const renderLoop = () => {
      computeResultant()
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
    const r = {
      canvas, ctx: canvas.getContext('2d'),
      screenW: 0, screenH: 0, scale: 60,
      resize() {
        const rect = canvas.getBoundingClientRect()
        canvas.width = rect.width * devicePixelRatio
        canvas.height = rect.height * devicePixelRatio
        this.ctx.scale(devicePixelRatio, devicePixelRatio)
        this.screenW = rect.width
        this.screenH = rect.height
      },
      worldToScreen(wx, wy) {
        return [this.screenW / 2 + wx * this.scale, this.screenH / 2 - wy * this.scale]
      },
      screenToWorld(sx, sy) {
        return [(sx - this.screenW / 2) / this.scale, (this.screenH / 2 - sy) / this.scale]
      },
      clear() { this.ctx.clearRect(0, 0, this.screenW, this.screenH) },
    }
    r.resize()
    return r
  }

  // ========== 计算 ==========
  function computeResultant() {
    const s = stateRef.current
    const a1 = s.F1.angle * Math.PI / 180
    const a2 = s.F2.angle * Math.PI / 180

    const f1x = s.F1.magnitude * Math.cos(a1)
    const f1y = s.F1.magnitude * Math.sin(a1)
    const f2x = s.F2.magnitude * Math.cos(a2)
    const f2y = s.F2.magnitude * Math.sin(a2)

    const fx = f1x + f2x
    const fy = f1y + f2y

    s.F.magnitude = Math.sqrt(fx * fx + fy * fy)
    s.F.angle = Math.atan2(fy, fx) * 180 / Math.PI

    // 计算夹角
    let theta = Math.abs(s.F1.angle - s.F2.angle)
    if (theta > 180) theta = 360 - theta

    // 验证余弦定理
    const theoretical = Math.sqrt(
      s.F1.magnitude ** 2 + s.F2.magnitude ** 2 +
      2 * s.F1.magnitude * s.F2.magnitude * Math.cos(theta * Math.PI / 180)
    )

    setDisplayData({
      F1: s.F1.magnitude,
      F2: s.F2.magnitude,
      F: s.F.magnitude,
      theta,
      F1x: f1x, F1y: f1y,
      F2x: f2x, F2y: f2y,
      Fx: fx, Fy: fy,
      theoretical,
      error: Math.abs(s.F.magnitude - theoretical),
    })
    forceUpdate(n => n + 1)
  }

  // ========== 渲染 ==========
  function renderFrame(renderer) {
    const ctx = renderer.ctx
    renderer.clear()

    drawGrid(ctx, renderer)
    drawParallelogram(ctx, renderer)
    drawForceVector(ctx, renderer, stateRef.current.F1, '#FF6B6B', 'F₁')
    drawForceVector(ctx, renderer, stateRef.current.F2, '#4ECDC4', 'F₂')
    drawForceVector(ctx, renderer, stateRef.current.F, '#FFD700', 'F', true)
    drawAngleArc(ctx, renderer)
    drawDataPanel(ctx, renderer)
    drawDescription(ctx, renderer)
  }

  function drawGrid(ctx, renderer) {
    const w = renderer.screenW
    const h = renderer.screenH
    const [ox, oy] = renderer.worldToScreen(0, 0)
    const s = renderer.scale

    // 坐标轴
    ctx.strokeStyle = 'rgba(100, 180, 255, 0.15)'
    ctx.lineWidth = 1
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(0, oy)
    ctx.lineTo(w, oy)
    ctx.moveTo(ox, 0)
    ctx.lineTo(ox, h)
    ctx.stroke()
    ctx.setLineDash([])

    // 刻度
    ctx.fillStyle = 'rgba(100, 180, 255, 0.3)'
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (let i = -8; i <= 8; i++) {
      if (i === 0) continue
      const [sx] = renderer.worldToScreen(i, 0)
      ctx.fillText(`${i}`, sx, oy + 4)
    }
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (let i = -6; i <= 6; i++) {
      if (i === 0) continue
      const [, sy] = renderer.worldToScreen(0, i)
      ctx.fillText(`${i}`, ox - 6, sy)
    }
  }

  function drawParallelogram(ctx, renderer) {
    const s = stateRef.current
    const [ox, oy] = renderer.worldToScreen(0, 0)

    const a1 = s.F1.angle * Math.PI / 180
    const a2 = s.F2.angle * Math.PI / 180
    const scale = renderer.scale

    // F1终点
    const p1x = ox + s.F1.magnitude * Math.cos(a1) * scale
    const p1y = oy - s.F1.magnitude * Math.sin(a1) * scale

    // F2终点
    const p2x = ox + s.F2.magnitude * Math.cos(a2) * scale
    const p2y = oy - s.F2.magnitude * Math.sin(a2) * scale

    // 合力终点（F1+F2）
    const pfx = ox + s.F.magnitude * Math.cos(s.F.angle * Math.PI / 180) * scale
    const pfy = oy - s.F.magnitude * Math.sin(s.F.angle * Math.PI / 180) * scale

    // 平行四边形虚线
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.2)'
    ctx.lineWidth = 1
    ctx.setLineDash([6, 4])

    // F1终点→合力终点（平行于F2）
    ctx.beginPath()
    ctx.moveTo(p1x, p1y)
    ctx.lineTo(pfx, pfy)
    ctx.stroke()

    // F2终点→合力终点（平行于F1）
    ctx.beginPath()
    ctx.moveTo(p2x, p2y)
    ctx.lineTo(pfx, pfy)
    ctx.stroke()

    ctx.setLineDash([])

    // 对角线（合力方向高亮）
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.15)'
    ctx.lineWidth = 20
    ctx.beginPath()
    ctx.moveTo(ox, oy)
    ctx.lineTo(pfx, pfy)
    ctx.stroke()
  }

  function drawForceVector(ctx, renderer, force, color, label, isResultant = false) {
    const s = stateRef.current
    const [ox, oy] = renderer.worldToScreen(0, 0)
    const scale = renderer.scale
    const angle = force.angle * Math.PI / 180
    const len = force.magnitude * scale

    const ex = ox + len * Math.cos(angle)
    const ey = oy - len * Math.sin(angle)

    // 箭头线
    const lineWidth = isResultant ? 3.5 : 2.5
    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth
    ctx.globalAlpha = 0.9
    ctx.beginPath()
    ctx.moveTo(ox, oy)
    ctx.lineTo(ex, ey)
    ctx.stroke()

    // 箭头头
    const arrowAngle = Math.atan2(ey - oy, ex - ox)
    const arrowLen = isResultant ? 12 : 10
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(ex, ey)
    ctx.lineTo(ex - arrowLen * Math.cos(arrowAngle - 0.3), ey - arrowLen * Math.sin(arrowAngle - 0.3))
    ctx.lineTo(ex - arrowLen * Math.cos(arrowAngle + 0.3), ey - arrowLen * Math.sin(arrowAngle + 0.3))
    ctx.closePath()
    ctx.fill()
    ctx.globalAlpha = 1

    // 标签
    const labelR = len + 20
    const lx = ox + labelR * Math.cos(angle)
    const ly = oy - labelR * Math.sin(angle)
    ctx.fillStyle = color
    ctx.font = isResultant ? 'bold 14px sans-serif' : 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${label}=${force.magnitude.toFixed(1)}N`, lx, ly)

    // 拖拽手柄（端点圆圈）
    if (!isResultant) {
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.globalAlpha = 0.6
      ctx.beginPath()
      ctx.arc(ex, ey, 8, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  }

  function drawAngleArc(ctx, renderer) {
    const s = stateRef.current
    const [ox, oy] = renderer.worldToScreen(0, 0)
    const r = 35

    // 两力夹角弧
    const a1 = s.F1.angle * Math.PI / 180
    const a2 = s.F2.angle * Math.PI / 180

    // 屏幕角度（y轴翻转）
    const sa1 = -a1
    const sa2 = -a2

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.lineWidth = 1.5
    ctx.beginPath()

    let start = sa1
    let end = sa2
    let diff = end - start
    while (diff > Math.PI) diff -= 2 * Math.PI
    while (diff < -Math.PI) diff += 2 * Math.PI

    if (diff > 0) {
      ctx.arc(ox, oy, r, start, end)
    } else {
      ctx.arc(ox, oy, r, end, start)
    }
    ctx.stroke()

    // 角度标注
    const midAngle = diff > 0 ? (start + end) / 2 : (end + start) / 2
    const lx = ox + (r + 14) * Math.cos(midAngle)
    const ly = oy + (r + 14) * Math.sin(midAngle)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`θ=${displayData?.theta.toFixed(0)}°`, lx, ly)
  }

  function drawDataPanel(ctx, renderer) {
    const w = renderer.screenW
    const panelW = 230
    const panelH = 230
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
    ctx.fillText('📊 力的合成', px + 14, py + 20)

    const d = displayData
    if (!d) return

    let y = py + 42
    ctx.font = '11px sans-serif'

    ctx.fillStyle = '#FF6B6B'
    ctx.fillText(`F₁ = ${d.F1.toFixed(1)} N`, px + 14, y); y += 18
    ctx.fillStyle = '#4ECDC4'
    ctx.fillText(`F₂ = ${d.F2.toFixed(1)} N`, px + 14, y); y += 18
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.fillText(`夹角 θ = ${d.theta.toFixed(0)}°`, px + 14, y); y += 24

    ctx.fillStyle = '#FFD700'
    ctx.font = 'bold 12px sans-serif'
    ctx.fillText(`合力 F = ${d.F.toFixed(2)} N`, px + 14, y); y += 20

    // 余弦定理验证
    ctx.fillStyle = '#8b949e'
    ctx.font = '11px sans-serif'
    ctx.fillText('── 验证 ──', px + 14, y); y += 18

    ctx.fillStyle = '#4FC3F7'
    ctx.fillText(`理论值: ${d.theoretical.toFixed(2)} N`, px + 14, y); y += 18
    ctx.fillText(`|ΔF| = ${d.error.toFixed(4)} N`, px + 14, y); y += 18

    const errorPct = d.theoretical > 0 ? (d.error / d.theoretical * 100) : 0
    ctx.fillStyle = errorPct < 1 ? '#4CAF50' : '#FF9800'
    ctx.fillText(`误差: ${errorPct.toFixed(2)}%`, px + 14, y)
  }

  function drawDescription(ctx, renderer) {
    const h = renderer.screenH
    const x = 16
    let y = h - 120

    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'

    ctx.fillStyle = '#c9d1d9'
    ctx.font = 'bold 14px sans-serif'
    ctx.fillText('验证力的平行四边形定则', x, y); y += 22

    ctx.fillStyle = '#4FC3F7'
    ctx.font = 'bold 14px serif'
    ctx.fillText('F² = F₁² + F₂² + 2F₁F₂cosθ', x, y); y += 24

    ctx.fillStyle = '#8b949e'
    ctx.font = '11px sans-serif'
    ctx.fillText('① 拖拽力的端点改变大小和方向', x, y); y += 16
    ctx.fillText('② 虚线构成平行四边形', x, y); y += 16
    ctx.fillText('③ 对角线即合力', x, y)
  }

  // ========== 交互 ==========
  const handleMouseDown = useCallback((e) => {
    const renderer = rendererRef.current
    if (!renderer) return

    const rect = canvasRef.current.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const [ox, oy] = renderer.worldToScreen(0, 0)
    const scale = renderer.scale

    // 检测F1端点
    const s = stateRef.current
    const a1 = s.F1.angle * Math.PI / 180
    const f1x = ox + s.F1.magnitude * scale * Math.cos(a1)
    const f1y = oy - s.F1.magnitude * scale * Math.sin(a1)
    if (Math.sqrt((sx - f1x) ** 2 + (sy - f1y) ** 2) < 20) {
      interactionRef.current.mode = 'dragging'
      interactionRef.current.target = 'F1'
      setCursor('crosshair')
      return
    }

    // 检测F2端点
    const a2 = s.F2.angle * Math.PI / 180
    const f2x = ox + s.F2.magnitude * scale * Math.cos(a2)
    const f2y = oy - s.F2.magnitude * scale * Math.sin(a2)
    if (Math.sqrt((sx - f2x) ** 2 + (sy - f2y) ** 2) < 20) {
      interactionRef.current.mode = 'dragging'
      interactionRef.current.target = 'F2'
      setCursor('crosshair')
      return
    }
  }, [])

  const handleMouseMove = useCallback((e) => {
    const renderer = rendererRef.current
    const interaction = interactionRef.current
    if (!renderer) return

    const rect = canvasRef.current.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top

    if (interaction.mode === 'dragging' && interaction.target) {
      const [ox, oy] = renderer.worldToScreen(0, 0)
      const dx = sx - ox
      const dy = -(sy - oy)  // 翻转y轴
      const magnitude = Math.sqrt(dx * dx + dy * dy) / renderer.scale
      const angle = Math.atan2(dy, dx) * 180 / Math.PI

      if (interaction.target === 'F1') {
        stateRef.current.F1.magnitude = Math.max(0.5, Math.min(8, magnitude))
        stateRef.current.F1.angle = angle
      } else if (interaction.target === 'F2') {
        stateRef.current.F2.magnitude = Math.max(0.5, Math.min(8, magnitude))
        stateRef.current.F2.angle = angle
      }
      return
    }

    // 悬停检测
    const [ox, oy] = renderer.worldToScreen(0, 0)
    const scale = renderer.scale
    const s = stateRef.current

    const a1 = s.F1.angle * Math.PI / 180
    const f1x = ox + s.F1.magnitude * scale * Math.cos(a1)
    const f1y = oy - s.F1.magnitude * scale * Math.sin(a1)

    const a2 = s.F2.angle * Math.PI / 180
    const f2x = ox + s.F2.magnitude * scale * Math.cos(a2)
    const f2y = oy - s.F2.magnitude * scale * Math.sin(a2)

    if (Math.sqrt((sx - f1x) ** 2 + (sy - f1y) ** 2) < 20 ||
        Math.sqrt((sx - f2x) ** 2 + (sy - f2y) ** 2) < 20) {
      setCursor('crosshair')
    } else {
      setCursor('default')
    }
  }, [])

  const handleMouseUp = useCallback(() => {
    interactionRef.current.mode = 'idle'
    interactionRef.current.target = null
    setCursor('default')
  }, [])

  const handleContextMenu = useCallback((e) => e.preventDefault(), [])

  const rule = displayData
    ? { text: `F₁=${displayData.F1.toFixed(1)}N + F₂=${displayData.F2.toFixed(1)}N → F=${displayData.F.toFixed(2)}N（误差${(displayData.error / displayData.theoretical * 100).toFixed(2)}%）`, color: '#4CAF50' }
    : { text: '拖拽力的端点改变大小和方向', color: '#484f58' }

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <span style={styles.title}>验证力的平行四边形定则</span>
        <div style={styles.toolbarActions}>
          <button style={styles.setBtn} onClick={() => {
            stateRef.current.F1 = { magnitude: 4, angle: 30 }
            stateRef.current.F2 = { magnitude: 3, angle: 150 }
          }}>⚙ 重置</button>
          <button style={styles.btn} onClick={() => {
            stateRef.current.F1 = { magnitude: 5, angle: 45 }
            stateRef.current.F2 = { magnitude: 5, angle: 135 }
          }}>等大对称</button>
          <div style={styles.sep} />
          <label style={styles.controlLabel}>
            F₁：
            <input type="range" min="0.5" max="8" step="0.5"
              value={stateRef.current.F1.magnitude}
              onChange={(e) => { stateRef.current.F1.magnitude = parseFloat(e.target.value); forceUpdate(n => n + 1) }}
              style={styles.slider} />
            <span style={styles.sliderVal}>{stateRef.current.F1.magnitude.toFixed(1)} N</span>
          </label>
          <label style={styles.controlLabel}>
            F₂：
            <input type="range" min="0.5" max="8" step="0.5"
              value={stateRef.current.F2.magnitude}
              onChange={(e) => { stateRef.current.F2.magnitude = parseFloat(e.target.value); forceUpdate(n => n + 1) }}
              style={styles.slider} />
            <span style={styles.sliderVal}>{stateRef.current.F2.magnitude.toFixed(1)} N</span>
          </label>
        </div>
      </div>

      <div style={styles.main}>
        <canvas ref={canvasRef}
          style={{ ...styles.canvas, cursor }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onContextMenu={handleContextMenu}
        />
      </div>

      <div style={styles.desc}>
        <b>实验：验证力的平行四边形定则</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>拖拽力的端点改变大小和方向，虚线构成平行四边形，对角线即合力。验证 F² = F₁² + F₂² + 2F₁F₂cosθ。</span>
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
  sliderVal: { color: '#4A90D9', fontWeight: 600, minWidth: 35, fontSize: 12 },
  btn: { background: '#fff', color: '#4A90D9', border: '1px solid #ccc', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  playBtn: { background: '#4A90D9', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600, minWidth: 70 },
  setBtn: { background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  sep: { width: 1, height: 20, background: '#ccc' },
  main: { flex: 1, display: 'flex', overflow: 'hidden', background: '#fff', position: 'relative' },
  canvas: { flex: 1, width: '100%' },
  desc: { padding: '8px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13 },
}
