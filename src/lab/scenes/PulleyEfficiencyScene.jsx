import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * PulleyEfficiencyScene — 测量滑轮组机械效率（PhET浅色风格）
 *
 * 交互：
 * - 调整物重和动滑轮重
 * - 选择绳子段数（2段/3段）
 * - 拖拽拉力施加力
 * - 实时显示 η = W有用/W总 = Gh/Fs
 */
export default function PulleyEfficiencyScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const rendererRef = useRef(null)

  const stateRef = useRef({
    objectWeight: 10,    // 物重 N
    pulleyWeight: 2,     // 动滑轮重 N
    ropeSegments: 2,     // 绳子段数
    pullForce: 0,        // 拉力 N
    pullDistance: 0,     // 拉力移动距离 m
    liftHeight: 0,       // 物体上升高度 m
    efficiency: 0,
    running: false,
    time: 0,
    objectY: 0,          // 物体位置 0~1
    phase: 0,
  })

  const [ropeSegments, setRopeSegments] = useState(2)
  const [objectWeight, setObjectWeight] = useState(10)
  const [pulleyWeight, setPulleyWeight] = useState(2)
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const renderer = createRenderer(canvas)
    rendererRef.current = renderer

    const renderLoop = () => { updatePhysics(); renderFrame(renderer); animRef.current = requestAnimationFrame(renderLoop) }
    renderLoop()
    const handleResize = () => renderer.resize()
    window.addEventListener('resize', handleResize)
    return () => { window.removeEventListener('resize', handleResize); if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  useEffect(() => { stateRef.current.ropeSegments = ropeSegments }, [ropeSegments])
  useEffect(() => { stateRef.current.objectWeight = objectWeight }, [objectWeight])
  useEffect(() => { stateRef.current.pulleyWeight = pulleyWeight }, [pulleyWeight])

  function createRenderer(canvas) {
    const r = { canvas, ctx: canvas.getContext('2d'), screenW: 0, screenH: 0,
      resize() { const rect = canvas.getBoundingClientRect(); canvas.width = rect.width * devicePixelRatio; canvas.height = rect.height * devicePixelRatio; this.ctx.scale(devicePixelRatio, devicePixelRatio); this.screenW = rect.width; this.screenH = rect.height },
      clear() { this.ctx.clearRect(0, 0, this.screenW, this.screenH) },
    }
    r.resize(); return r
  }

  function updatePhysics() {
    const s = stateRef.current
    s.phase += 0.02
    const n = s.ropeSegments
    const idealForce = (s.objectWeight + s.pulleyWeight) / n
    s.pullForce = idealForce * 1.15  // 实际力略大（摩擦）
    s.liftHeight = s.objectY * 2     // 最大上升2m
    s.pullDistance = s.liftHeight * n
    const Wuseful = s.objectWeight * s.liftHeight
    const Wtotal = s.pullForce * s.pullDistance
    s.efficiency = Wtotal > 0 ? Wuseful / Wtotal * 100 : 0
    forceUpdate(n => n + 1)
  }

  function renderFrame(renderer) {
    const ctx = renderer.ctx; renderer.clear()
    drawPulleySystem(ctx, renderer)
    drawDataPanel(ctx, renderer)
    drawDescription(ctx, renderer)
  }

  function drawPulleySystem(ctx, renderer) {
    const w = renderer.screenW, h = renderer.screenH
    const s = stateRef.current
    const n = s.ropeSegments

    const frameX = w * 0.4, frameTop = h * 0.08, frameH = h * 0.7

    // 铁架台
    ctx.strokeStyle = '#888'; ctx.lineWidth = 4
    ctx.beginPath(); ctx.moveTo(frameX, frameTop); ctx.lineTo(frameX, frameTop + frameH); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(frameX - 30, frameTop + frameH); ctx.lineTo(frameX + 30, frameTop + frameH); ctx.stroke()

    // 横梁
    ctx.beginPath(); ctx.moveTo(frameX, frameTop); ctx.lineTo(frameX + 80, frameTop); ctx.stroke()

    // 定滑轮
    const fixedPulleyX = frameX + 60, fixedPulleyY = frameTop + 20
    drawPulley(ctx, fixedPulleyX, fixedPulleyY, 18, '#999')

    // 动滑轮
    const dy = s.objectY * 200
    const movePulleyY = fixedPulleyY + 120 + dy
    drawPulley(ctx, fixedPulleyX, movePulleyY, 16, '#4A90D9')

    // 物体
    const objX = fixedPulleyX, objY = movePulleyY + 40
    ctx.fillStyle = '#e06060'
    ctx.beginPath(); ctx.roundRect(objX - 20, objY, 40, 35, 4); ctx.fill()
    ctx.strokeStyle = '#ff8080'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.roundRect(objX - 20, objY, 40, 35, 4); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(`${s.objectWeight}N`, objX, objY + 20)

    // 绳子
    ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1.5
    for (let i = 0; i < n; i++) {
      const xOff = (i - (n - 1) / 2) * 8
      ctx.beginPath()
      ctx.moveTo(fixedPulleyX + xOff, fixedPulleyY)
      ctx.lineTo(fixedPulleyX + xOff, movePulleyY)
      ctx.stroke()
    }

    // 拉力箭头
    const pullY = fixedPulleyY + 50
    const arrowLen = s.pullForce * 5
    ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(fixedPulleyX + 40, pullY); ctx.lineTo(fixedPulleyX + 40, pullY + arrowLen); ctx.stroke()
    // 箭头
    ctx.fillStyle = '#4CAF50'
    ctx.beginPath()
    ctx.moveTo(fixedPulleyX + 40, pullY + arrowLen)
    ctx.lineTo(fixedPulleyX + 35, pullY + arrowLen - 8)
    ctx.lineTo(fixedPulleyX + 45, pullY + arrowLen - 8)
    ctx.closePath(); ctx.fill()
    ctx.font = '10px sans-serif'; ctx.fillText(`F=${s.pullForce.toFixed(1)}N`, fixedPulleyX + 55, pullY + arrowLen / 2)

    // 绳段数标签
    ctx.fillStyle = '#E6A800'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText(`n = ${n}段绳`, 20, h * 0.85)

    // 上升高度
    ctx.fillStyle = '#4A90D9'
    ctx.fillText(`h = ${s.liftHeight.toFixed(2)} m`, 20, h * 0.85 + 20)
    ctx.fillText(`s = ${s.pullDistance.toFixed(2)} m (拉力距离)`, 20, h * 0.85 + 40)
  }

  function drawPulley(ctx, x, y, r, color) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#ccc'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill()
  }

  function drawDataPanel(ctx, renderer) {
    const w = renderer.screenW, s = stateRef.current
    const panelW = 220, panelH = 200
    const px = w - panelW - 16, py = 16

    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'; ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 8); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('📊 滑轮组效率', px + 14, py + 20)

    let y = py + 42; ctx.font = '11px sans-serif'
    ctx.fillStyle = '#555'
    ctx.fillText(`物重 G = ${s.objectWeight} N`, px + 14, y); y += 18
    ctx.fillText(`动滑轮重 G₀ = ${s.pulleyWeight} N`, px + 14, y); y += 18
    ctx.fillStyle = '#4CAF50'
    ctx.fillText(`拉力 F = ${s.pullForce.toFixed(2)} N`, px + 14, y); y += 18
    ctx.fillStyle = '#4A90D9'
    ctx.fillText(`有用功 W有 = ${s.objectWeight}×${s.liftHeight.toFixed(2)} = ${(s.objectWeight * s.liftHeight).toFixed(2)} J`, px + 14, y); y += 18
    ctx.fillText(`总功 W总 = ${s.pullForce.toFixed(1)}×${s.pullDistance.toFixed(2)} = ${(s.pullForce * s.pullDistance).toFixed(2)} J`, px + 14, y); y += 22

    ctx.fillStyle = s.efficiency > 70 ? '#4CAF50' : '#FF9800'
    ctx.font = 'bold 14px sans-serif'
    ctx.fillText(`η = ${s.efficiency.toFixed(1)}%`, px + 14, y)
  }

  function drawDescription(ctx, renderer) {
    const h = renderer.screenH, x = 16; let y = h - 100
    ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'
    ctx.fillText('测量滑轮组机械效率', x, y); y += 22
    ctx.fillStyle = '#4A90D9'; ctx.font = 'bold 14px serif'
    ctx.fillText('η = W有用/W总 = Gh/Fs', x, y); y += 24
    ctx.fillStyle = '#777'; ctx.font = '11px sans-serif'
    ctx.fillText('① 调整物重和动滑轮重', x, y); y += 16
    ctx.fillText('② 选择绳子段数', x, y); y += 16
    ctx.fillText('③ 上下拖拽物体模拟提升', x, y)
  }

  const handleMouseDown = useCallback(() => { stateRef.current._dragging = true }, [])
  const handleMouseMove = useCallback((e) => {
    if (!stateRef.current._dragging) return
    const h = rendererRef.current.screenH
    const rect = canvasRef.current.getBoundingClientRect()
    stateRef.current.objectY = Math.max(0, Math.min(1, (e.clientY - rect.top - h * 0.2) / (h * 0.5)))
  }, [])
  const handleMouseUp = useCallback(() => { stateRef.current._dragging = false }, [])

  const rule = `η = ${stateRef.current.efficiency.toFixed(1)}%（${stateRef.current.ropeSegments}段绳）`

  return (
    <div style={styles.container}>
      {/* 工具栏 */}
      <div style={styles.toolbar}>
        <span style={styles.title}>测量滑轮组机械效率</span>
        <div style={styles.toolbarActions}>
          <label style={styles.controlLabel}>物重：
            <input type="range" min="2" max="30" step="2" value={objectWeight}
              onChange={(e) => setObjectWeight(parseFloat(e.target.value))} style={{ width: 70, accentColor: '#4A90D9' }} />
            <span style={styles.sliderVal}>{objectWeight}N</span>
          </label>
          <label style={styles.controlLabel}>滑轮重：
            <input type="range" min="1" max="10" step="1" value={pulleyWeight}
              onChange={(e) => setPulleyWeight(parseFloat(e.target.value))} style={{ width: 70, accentColor: '#4A90D9' }} />
            <span style={styles.sliderVal}>{pulleyWeight}N</span>
          </label>
          <label style={styles.controlLabel}>绳段数：
            <select value={ropeSegments} onChange={(e) => setRopeSegments(parseInt(e.target.value))} style={styles.select}>
              <option value={2}>2段</option>
              <option value={3}>3段</option>
            </select>
          </label>
        </div>
      </div>

      {/* 主区域 */}
      <div style={styles.main}>
        <canvas ref={canvasRef} style={styles.canvas}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} />
      </div>

      {/* 底部状态栏 */}
      <div style={styles.statusBar}>
        <span style={{ color: stateRef.current.efficiency > 70 ? '#4CAF50' : '#FF9800', fontWeight: 600 }}>{rule}</span>
        <span style={{ color: '#999', marginLeft: 'auto' }}>η=W有/W总 · 滑轮组</span>
      </div>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex', flexDirection: 'column', height: '100vh',
    background: '#e8e8e8', color: '#333',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  toolbar: {
    minHeight: 44, background: '#f5f5f5', borderBottom: '1px solid #ccc',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 12px', flexShrink: 0, flexWrap: 'wrap', gap: 6,
  },
  title: { fontSize: 14, fontWeight: 600, color: '#333' },
  toolbarActions: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  controlLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#555' },
  sliderVal: { color: '#4A90D9', fontWeight: 600, minWidth: 35, fontSize: 12 },
  select: {
    background: '#fff', color: '#333', border: '1px solid #ccc',
    borderRadius: 4, padding: '3px 6px', fontSize: 12,
  },
  main: { flex: 1, display: 'flex', overflow: 'hidden', background: '#fff' },
  canvas: { flex: 1, width: '100%' },
  statusBar: {
    minHeight: 28, background: '#f5f5f5', borderTop: '1px solid #ccc',
    display: 'flex', alignItems: 'center', gap: 20,
    padding: '4px 14px', fontSize: 12, color: '#555', flexShrink: 0, flexWrap: 'wrap',
  },
}
