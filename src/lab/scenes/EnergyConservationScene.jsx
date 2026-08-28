import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * EnergyConservationScene — 验证机械能守恒定律
 *
 * 纸带实验：自由落体，比较动能增量和势能减少量
 * - 调整初始高度
 * - 打点记录运动
 * - 逐点计算 Ek = ½mv², Ep = mgh
 * - 验证 ΔEk ≈ ΔEp（不需要测质量）
 */
export default function EnergyConservationScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const rendererRef = useRef(null)

  const stateRef = useRef({
    height: 2.0,
    g: 9.8,
    running: false,
    time: 0,
    ballY: 0,
    ballV: 0,
    points: [],
    phase: 0,
    analysis: null,
  })

  const [running, setRunning] = useState(false)
  const [height, setHeight] = useState(2.0)
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

  useEffect(() => { stateRef.current.height = height }, [height])

  function createRenderer(canvas) {
    const r = { canvas, ctx: canvas.getContext('2d'), screenW: 0, screenH: 0, scale: 100,
      resize() { const rect = canvas.getBoundingClientRect(); canvas.width = rect.width * devicePixelRatio; canvas.height = rect.height * devicePixelRatio; this.ctx.scale(devicePixelRatio, devicePixelRatio); this.screenW = rect.width; this.screenH = rect.height },
      clear() { this.ctx.clearRect(0, 0, this.screenW, this.screenH) },
    }
    r.resize(); return r
  }

  function updatePhysics() {
    const s = stateRef.current
    if (!s.running) return

    const dt = 1 / 60
    s.time += dt
    s.ballV = s.g * s.time
    s.ballY = s.height - 0.5 * s.g * s.time * s.time

    // 打点（50Hz）
    const expected = Math.floor(s.time * 50)
    while (s.points.length < expected) {
      const t = (s.points.length + 1) / 50
      const y = s.height - 0.5 * s.g * t * t
      const v = s.g * t
      s.points.push({ t, y: Math.max(0, y), v })
    }

    if (s.ballY <= 0) {
      s.ballY = 0
      s.running = false
      setRunning(false)
      analyzeData()
    }

    forceUpdate(n => n + 1)
  }

  function analyzeData() {
    const s = stateRef.current
    const m = 1  // 质量约掉
    const pts = s.points.filter(p => p.y > 0.01)
    if (pts.length < 5) return

    const n = 5
    const selected = []
    for (let i = 0; i < pts.length; i += n) selected.push(pts[i])

    const results = selected.map((p, i) => ({
      h: s.height - p.y,
      v: p.v,
      Ek: 0.5 * m * p.v * p.v,
      Ep: m * s.g * (s.height - p.y),
      E_total: 0.5 * m * p.v * p.v + m * s.g * p.y,
    }))

    stateRef.current.analysis = results
  }

  function renderFrame(renderer) {
    const ctx = renderer.ctx; renderer.clear()
    drawBackground(ctx, renderer)
    drawBall(ctx, renderer)
    drawTape(ctx, renderer)
    drawEnergyBars(ctx, renderer)
    drawDataPanel(ctx, renderer)
    drawDescription(ctx, renderer)
  }

  function drawBackground(ctx, renderer) {
    const w = renderer.screenW, h = renderer.screenH
    const groundY = h * 0.82
    ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, groundY, w, h - groundY)
    ctx.strokeStyle = '#30363d'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(w, groundY); ctx.stroke()
  }

  function drawBall(ctx, renderer) {
    const w = renderer.screenW, h = renderer.screenH, s = stateRef.current
    const groundY = h * 0.82
    const topY = h * 0.08
    const range = groundY - topY

    const by = groundY - (s.ballY / s.height) * range
    const bx = w * 0.2

    // 球
    ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 10
    ctx.fillStyle = '#FF6B6B'; ctx.beginPath(); ctx.arc(bx, by, 10, 0, Math.PI * 2); ctx.fill()
    ctx.shadowBlur = 0

    // 高度标注
    if (s.ballY > 0.01) {
      ctx.strokeStyle = 'rgba(79,195,247,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3])
      ctx.beginPath(); ctx.moveTo(bx + 20, groundY); ctx.lineTo(bx + 20, by); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#4FC3F7'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText(`h=${s.ballY.toFixed(2)}m`, bx + 24, (groundY + by) / 2)
    }

    // 速度箭头
    if (s.running && s.ballV > 0.1) {
      const vLen = Math.min(60, s.ballV * 6)
      ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(bx, by + 12); ctx.lineTo(bx, by + 12 + vLen); ctx.stroke()
      ctx.fillStyle = '#4CAF50'
      ctx.beginPath(); ctx.moveTo(bx, by + 12 + vLen); ctx.lineTo(bx - 5, by + 12 + vLen - 8); ctx.lineTo(bx + 5, by + 12 + vLen - 8); ctx.closePath(); ctx.fill()
      ctx.font = '10px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText(`v=${s.ballV.toFixed(1)}m/s`, bx + 12, by + 12 + vLen / 2)
    }
  }

  function drawTape(ctx, renderer) {
    const w = renderer.screenW, h = renderer.screenH, s = stateRef.current
    if (s.points.length < 2) return

    const tapeX = w * 0.35, tapeTop = h * 0.08, tapeH = h * 0.74

    ctx.fillStyle = 'rgba(245,240,224,0.05)'
    ctx.fillRect(tapeX, tapeTop, w * 0.3, tapeH)

    ctx.fillStyle = '#8b949e'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('纸带点迹', tapeX, tapeTop - 8)

    for (let i = 0; i < s.points.length; i++) {
      const p = s.points[i]
      const y = tapeTop + tapeH * (1 - p.y / s.height)
      const spacing = Math.min(15, (s.height - p.y) * 3 + 1)
      const x = tapeX + 20 + (i % 2 === 0 ? 0 : 3)

      const alpha = 0.4 + (p.v / (s.g * Math.sqrt(2 * s.height / s.g))) * 0.6
      ctx.fillStyle = `rgba(79, 195, 247, ${alpha})`
      ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill()

      if (i % 5 === 0) {
        ctx.fillStyle = 'rgba(139,148,158,0.5)'; ctx.font = '9px monospace'; ctx.textAlign = 'left'
        ctx.fillText(`${i}`, x + 8, y + 3)
      }
    }
  }

  function drawEnergyBars(ctx, renderer) {
    const w = renderer.screenW, h = renderer.screenH, s = stateRef.current
    const analysis = s.analysis
    if (!analysis || analysis.length < 2) return

    const barX = w * 0.72, barY = h * 0.08, barW = w * 0.22, barH = h * 0.5

    ctx.fillStyle = 'rgba(22,27,34,0.9)'; ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 8); ctx.fill()

    ctx.fillStyle = '#c9d1d9'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('📈 能量守恒', barX + 10, barY + 18)

    // 取几个代表性点
    const step = Math.max(1, Math.floor(analysis.length / 6))
    let y = barY + 36
    const maxE = analysis[0]?.E_total || 1

    for (let i = 0; i < analysis.length; i += step) {
      const a = analysis[i]
      const EkW = (a.Ek / maxE) * (barW - 80)
      const EpW = (a.Ep / maxE) * (barW - 80)

      ctx.fillStyle = '#FF6B6B'
      ctx.fillRect(barX + 45, y, EkW, 8)
      ctx.fillStyle = '#4FC3F7'
      ctx.fillRect(barX + 45, y + 10, EpW, 8)

      ctx.fillStyle = '#8b949e'; ctx.font = '9px sans-serif'; ctx.textAlign = 'right'
      ctx.fillText(`#${i}`, barX + 40, y + 10)

      y += 28
    }

    // 图例
    ctx.fillStyle = '#FF6B6B'; ctx.fillRect(barX + 10, barY + barH - 30, 12, 8)
    ctx.fillStyle = '#8b949e'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('Ek (动能)', barX + 26, barY + barH - 22)
    ctx.fillStyle = '#4FC3F7'; ctx.fillRect(barX + 10, barY + barH - 16, 12, 8)
    ctx.fillText('Ep (势能)', barX + 26, barY + barH - 8)
  }

  function drawDataPanel(ctx, renderer) {
    const w = renderer.screenW, h = renderer.screenH, s = stateRef.current
    const panelW = 200, panelH = 140
    const px = 16, py = 16

    ctx.fillStyle = 'rgba(22,27,34,0.95)'; ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 8); ctx.fill()
    ctx.strokeStyle = '#30363d'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 8); ctx.stroke()

    ctx.fillStyle = '#c9d1d9'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('📊 机械能守恒', px + 14, py + 20)

    let y = py + 42; ctx.font = '11px sans-serif'
    ctx.fillStyle = '#8b949e'
    ctx.fillText(`初始高度 h₀ = ${s.height.toFixed(2)} m`, px + 14, y); y += 18
    ctx.fillText(`打点数 = ${s.points.length}`, px + 14, y); y += 18

    if (s.analysis && s.analysis.length > 2) {
      const first = s.analysis[0], last = s.analysis[s.analysis.length - 1]
      ctx.fillStyle = '#FFD700'
      ctx.fillText(`E总(初) ≈ ${first.E_total.toFixed(3)} J/kg`, px + 14, y); y += 18
      ctx.fillText(`E总(末) ≈ ${last.E_total.toFixed(3)} J/kg`, px + 14, y); y += 18
      const diff = Math.abs(first.E_total - last.E_total) / first.E_total * 100
      ctx.fillStyle = diff < 5 ? '#4CAF50' : '#FF9800'
      ctx.fillText(`能量变化: ${diff.toFixed(1)}%`, px + 14, y)
    }
  }

  function drawDescription(ctx, renderer) {
    const h = renderer.screenH, x = 16; let y = h - 100
    ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    ctx.fillStyle = '#c9d1d9'; ctx.font = 'bold 14px sans-serif'
    ctx.fillText('验证机械能守恒定律', x, y); y += 22
    ctx.fillStyle = '#4FC3F7'; ctx.font = 'bold 14px serif'
    ctx.fillText('ΔEk = ΔEp（不需要测质量）', x, y); y += 24
    ctx.fillStyle = '#8b949e'; ctx.font = '11px sans-serif'
    ctx.fillText('① 调整初始高度', x, y); y += 16
    ctx.fillText('② 点击"释放"开始自由落体', x, y); y += 16
    ctx.fillText('③ 纸带记录，验证动能增量≈势能减少量', x, y)
  }

  const handleStart = useCallback(() => {
    const s = stateRef.current
    s.ballY = s.height; s.ballV = 0; s.time = 0; s.points = []; s.running = true; s.analysis = null
    setRunning(true)
  }, [])

  const handleReset = useCallback(() => {
    const s = stateRef.current
    s.ballY = 0; s.ballV = 0; s.time = 0; s.points = []; s.running = false; s.analysis = null
    setRunning(false)
  }, [])

  const rule = running
    ? { text: '自由落体中...记录纸带点迹', color: '#FF9800' }
    : stateRef.current.analysis
      ? { text: '验证完成：ΔEk ≈ ΔEp', color: '#4CAF50' }
      : { text: '调整高度后点击"释放"', color: '#484f58' }

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <span style={styles.title}>验证机械能守恒定律</span>
        <div style={styles.toolbarActions}>
          {!running ? (
            <button style={styles.playBtn} onClick={handleStart}>▶ 释放</button>
          ) : (
            <button style={styles.pauseBtn} disabled>落体中…</button>
          )}
          <button style={styles.setBtn} onClick={handleReset}>⚙ Set</button>
          <div style={styles.sep} />
          <label style={styles.controlLabel}>高度：<input type="range" min="0.5" max="5" step="0.5" value={height} onChange={(e) => setHeight(parseFloat(e.target.value))} style={styles.slider} /><span style={styles.sliderVal}>{height.toFixed(1)} m</span></label>
          <span style={styles.timer}>t = {stateRef.current.time.toFixed(3)} s</span>
        </div>
      </div>
      <div style={styles.main}><canvas ref={canvasRef} style={styles.canvas} /></div>
      <div style={styles.desc}>
        <b>实验：验证机械能守恒定律</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>调整初始高度，点击"释放"开始自由落体，纸带记录运动，逐点计算 Ek 和 Ep，验证 ΔEk ≈ ΔEp（不需要测质量）。</span>
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
  pauseBtn: { background: '#E53935', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600, minWidth: 70 },
  setBtn: { background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  startBtn: { background: '#4A90D9', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  sep: { width: 1, height: 20, background: '#ccc' },
  timer: { fontFamily: 'Consolas,monospace', fontSize: 13, marginLeft: 8 },
  main: { flex: 1, display: 'flex', overflow: 'hidden', background: '#fff', position: 'relative' },
  canvas: { flex: 1, width: '100%' },
  desc: { padding: '8px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13 },
}
