import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * MomentumConservationScene — 探究动量守恒定律
 *
 * 气垫导轨方案：两滑块碰撞
 * - 调整两滑块质量和初速度
 * - 选择弹性/非弹性碰撞
 * - 实时显示动量 p=mv
 * - 验证：碰撞前后总动量守恒
 */
export default function MomentumConservationScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const rendererRef = useRef(null)

  const stateRef = useRef({
    m1: 0.5, m2: 0.5,
    v1: 2, v2: -1,
    v1_after: 0, v2_after: 0,
    collisionType: 'elastic', // 'elastic' | 'inelastic'
    phase: 'setup', // 'setup' | 'moving' | 'collided' | 'done'
    x1: -3, x2: 2,
    time: 0,
    collisonPoint: 0,
    p1_before: 0, p2_before: 0, p_total_before: 0,
    p1_after: 0, p2_after: 0, p_total_after: 0,
  })

  const [collisionType, setCollisionType] = useState('elastic')
  const [phase, setPhase] = useState('setup')
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

  useEffect(() => { stateRef.current.collisionType = collisionType }, [collisionType])

  function createRenderer(canvas) {
    const r = { canvas, ctx: canvas.getContext('2d'), screenW: 0, screenH: 0, scale: 60,
      resize() { const rect = canvas.getBoundingClientRect(); canvas.width = rect.width * devicePixelRatio; canvas.height = rect.height * devicePixelRatio; this.ctx.scale(devicePixelRatio, devicePixelRatio); this.screenW = rect.width; this.screenH = rect.height },
      worldToScreen(wx, wy) { return [this.screenW / 2 + wx * this.scale, this.screenH * 0.55 - wy * this.scale] },
      clear() { this.ctx.clearRect(0, 0, this.screenW, this.screenH) },
    }
    r.resize(); return r
  }

  function updatePhysics() {
    const s = stateRef.current
    if (s.phase !== 'moving') return

    const dt = 1 / 60
    s.time += dt
    s.x1 += s.v1 * dt
    s.x2 += s.v2 * dt

    // 碰撞检测
    const gap = 0.8
    if (s.x1 + gap / 2 >= s.x2 - gap / 2 && s.x1 < s.x2) {
      // 碰撞发生
      if (s.collisionType === 'elastic') {
        // 弹性碰撞
        const m1 = s.m1, m2 = s.m2, v1 = s.v1, v2 = s.v2
        s.v1_after = ((m1 - m2) * v1 + 2 * m2 * v2) / (m1 + m2)
        s.v2_after = ((m2 - m1) * v2 + 2 * m1 * v1) / (m1 + m2)
        s.v1 = s.v1_after
        s.v2 = s.v2_after
      } else {
        // 完全非弹性碰撞（粘在一起）
        const V = (s.m1 * s.v1 + s.m2 * s.v2) / (s.m1 + s.m2)
        s.v1_after = V
        s.v2_after = V
        s.v1 = V
        s.v2 = V
      }

      s.p1_before = s.m1 * s.v1_before
      s.p2_before = s.m2 * s.v2_before
      s.p_total_before = s.p1_before + s.p2_before
      s.p1_after = s.m1 * s.v1_after
      s.p2_after = s.m2 * s.v2_after
      s.p_total_after = s.p1_after + s.p2_after

      s.phase = 'done'
      setPhase('done')
    }

    forceUpdate(n => n + 1)
  }

  function renderFrame(renderer) {
    const ctx = renderer.ctx; renderer.clear()
    drawTrack(ctx, renderer)
    drawBlocks(ctx, renderer)
    drawVelocityArrows(ctx, renderer)
    drawMomentumPanel(ctx, renderer)
    drawDescription(ctx, renderer)
  }

  function drawTrack(ctx, renderer) {
    const w = renderer.screenW, h = renderer.screenH
    const [x1] = renderer.worldToScreen(-6, 0)
    const [x2] = renderer.worldToScreen(6, 0)
    const [, y] = renderer.worldToScreen(0, 0)

    // 导轨
    ctx.strokeStyle = '#6e7681'; ctx.lineWidth = 6
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke()
    ctx.strokeStyle = '#4a5568'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(x1, y - 3); ctx.lineTo(x2, y - 3); ctx.stroke()

    // 刻度
    ctx.fillStyle = 'rgba(100,180,255,0.25)'; ctx.font = '9px monospace'; ctx.textAlign = 'center'
    for (let i = -5; i <= 5; i++) {
      const [sx] = renderer.worldToScreen(i, 0)
      ctx.fillText(`${i}`, sx, y + 18)
    }
  }

  function drawBlocks(ctx, renderer) {
    const s = stateRef.current
    const [, y] = renderer.worldToScreen(0, 0)
    const scale = renderer.scale

    // 滑块1（红色）
    const [x1s] = renderer.worldToScreen(s.x1, 0)
    const w1 = s.m1 * 60 + 30
    ctx.fillStyle = '#FF6B6B'
    ctx.beginPath(); ctx.roundRect(x1s - w1 / 2, y - 40, w1, 35, 4); ctx.fill()
    ctx.strokeStyle = '#ff9999'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.roundRect(x1s - w1 / 2, y - 40, w1, 35, 4); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(`${s.m1}kg`, x1s, y - 20)

    // 滑块2（蓝色）
    const [x2s] = renderer.worldToScreen(s.x2, 0)
    const w2 = s.m2 * 60 + 30
    ctx.fillStyle = '#4ECDC4'
    ctx.beginPath(); ctx.roundRect(x2s - w2 / 2, y - 40, w2, 35, 4); ctx.fill()
    ctx.strokeStyle = '#6EE7DE'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.roundRect(x2s - w2 / 2, y - 40, w2, 35, 4); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(`${s.m2}kg`, x2s, y - 20)
  }

  function drawVelocityArrows(ctx, renderer) {
    const s = stateRef.current
    const [, y] = renderer.worldToScreen(0, 0)
    const scale = renderer.scale

    // 速度箭头
    const drawV = (x, v, color) => {
      const [sx] = renderer.worldToScreen(x, 0)
      const len = v * scale * 0.5
      if (Math.abs(len) < 2) return
      ctx.strokeStyle = color; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(sx, y - 50); ctx.lineTo(sx + len, y - 50); ctx.stroke()
      const dir = Math.sign(len)
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(sx + len, y - 50)
      ctx.lineTo(sx + len - dir * 8, y - 54)
      ctx.lineTo(sx + len - dir * 8, y - 46)
      ctx.closePath(); ctx.fill()
      ctx.font = '10px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(`v=${v.toFixed(2)}`, sx + len / 2, y - 56)
    }

    if (s.phase === 'setup' || s.phase === 'moving') {
      drawV(s.x1, s.v1, '#FF6B6B')
      drawV(s.x2, s.v2, '#4ECDC4')
    } else if (s.phase === 'done') {
      drawV(s.x1, s.v1_after, '#FF6B6B')
      drawV(s.x2, s.v2_after, '#4ECDC4')
    }
  }

  function drawMomentumPanel(ctx, renderer) {
    const w = renderer.screenW, s = stateRef.current
    const panelW = 230, panelH = 220
    const px = w - panelW - 16, py = 16

    ctx.fillStyle = 'rgba(22,27,34,0.95)'; ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 8); ctx.fill()
    ctx.strokeStyle = '#30363d'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 8); ctx.stroke()

    ctx.fillStyle = '#c9d1d9'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('📊 动量守恒验证', px + 14, py + 20)

    let y = py + 42; ctx.font = '11px sans-serif'

    if (s.phase === 'done') {
      ctx.fillStyle = '#8b949e'; ctx.fillText('── 碰撞前 ──', px + 14, y); y += 18
      ctx.fillStyle = '#FF6B6B'
      ctx.fillText(`p₁ = ${s.m1}×${s.v1_before.toFixed(2)} = ${s.p1_before.toFixed(3)} kg·m/s`, px + 14, y); y += 16
      ctx.fillStyle = '#4ECDC4'
      ctx.fillText(`p₂ = ${s.m2}×${s.v2_before.toFixed(2)} = ${s.p2_before.toFixed(3)} kg·m/s`, px + 14, y); y += 18
      ctx.fillStyle = '#FFD700'; ctx.font = 'bold 11px sans-serif'
      ctx.fillText(`p总(前) = ${s.p_total_before.toFixed(3)} kg·m/s`, px + 14, y); y += 22

      ctx.fillStyle = '#8b949e'; ctx.font = '11px sans-serif'; ctx.fillText('── 碰撞后 ──', px + 14, y); y += 18
      ctx.fillStyle = '#FF6B6B'
      ctx.fillText(`p₁' = ${s.m1}×${s.v1_after.toFixed(2)} = ${s.p1_after.toFixed(3)}`, px + 14, y); y += 16
      ctx.fillStyle = '#4ECDC4'
      ctx.fillText(`p₂' = ${s.m2}×${s.v2_after.toFixed(2)} = ${s.p2_after.toFixed(3)}`, px + 14, y); y += 18
      ctx.fillStyle = '#FFD700'; ctx.font = 'bold 11px sans-serif'
      ctx.fillText(`p总(后) = ${s.p_total_after.toFixed(3)} kg·m/s`, px + 14, y); y += 22

      const diff = Math.abs(s.p_total_before - s.p_total_after)
      ctx.fillStyle = diff < 0.05 ? '#4CAF50' : '#FF9800'
      ctx.font = '11px sans-serif'
      ctx.fillText(`|Δp| = ${diff.toFixed(4)} kg·m/s`, px + 14, y); y += 16
      const pct = s.p_total_before > 0 ? (diff / Math.abs(s.p_total_before) * 100) : 0
      ctx.fillText(`误差: ${pct.toFixed(2)}%`, px + 14, y)
    } else {
      ctx.fillStyle = '#8b949e'
      ctx.fillText(`m₁ = ${s.m1} kg, v₁ = ${s.v1} m/s`, px + 14, y); y += 18
      ctx.fillText(`m₂ = ${s.m2} kg, v₂ = ${s.v2} m/s`, px + 14, y); y += 22
      ctx.fillStyle = '#FFD700'
      ctx.fillText(`p₁ = ${(s.m1 * s.v1).toFixed(3)} kg·m/s`, px + 14, y); y += 16
      ctx.fillText(`p₂ = ${(s.m2 * s.v2).toFixed(3)} kg·m/s`, px + 14, y); y += 16
      ctx.fillText(`p总 = ${(s.m1 * s.v1 + s.m2 * s.v2).toFixed(3)} kg·m/s`, px + 14, y)
    }
  }

  function drawDescription(ctx, renderer) {
    const h = renderer.screenH, x = 16; let y = h - 100
    ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    ctx.fillStyle = '#c9d1d9'; ctx.font = 'bold 14px sans-serif'
    ctx.fillText('探究动量守恒定律', x, y); y += 22
    ctx.fillStyle = '#4FC3F7'; ctx.font = 'bold 14px serif'
    ctx.fillText('m₁v₁ + m₂v₂ = m₁v₁\' + m₂v₂\'', x, y); y += 24
    ctx.fillStyle = '#8b949e'; ctx.font = '11px sans-serif'
    ctx.fillText('① 调整滑块质量和速度', x, y); y += 16
    ctx.fillText('② 选择碰撞类型', x, y); y += 16
    ctx.fillText('③ 点击"碰撞"开始', x, y)
  }

  const handleStart = useCallback(() => {
    const s = stateRef.current
    s.v1_before = s.v1
    s.v2_before = s.v2
    s.x1 = -4; s.x2 = 3
    s.time = 0; s.phase = 'moving'
    setPhase('moving')
  }, [])

  const handleReset = useCallback(() => {
    const s = stateRef.current
    s.x1 = -3; s.x2 = 2; s.time = 0; s.phase = 'setup'
    setPhase('setup')
  }, [])

  const rule = phase === 'done'
    ? { text: `p总(前)=${stateRef.current.p_total_before.toFixed(3)} ≈ p总(后)=${stateRef.current.p_total_after.toFixed(3)}`, color: '#4CAF50' }
    : phase === 'moving'
      ? { text: '碰撞进行中...', color: '#FF9800' }
      : { text: '调整参数后点击"碰撞"', color: '#484f58' }

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <span style={styles.title}>探究动量守恒定律</span>
        <div style={styles.toolbarActions}>
          {phase !== 'moving' ? (
            <button style={styles.playBtn} onClick={handleStart}>💥 碰撞</button>
          ) : (
            <button style={styles.pauseBtn} disabled>碰撞中…</button>
          )}
          <button style={styles.setBtn} onClick={handleReset}>⚙ Set</button>
          <div style={styles.sep} />
          <label style={styles.controlLabel}>m₁：<input type="range" min="0.1" max="2" step="0.1" value={stateRef.current.m1} onChange={(e) => { stateRef.current.m1 = parseFloat(e.target.value); forceUpdate(n => n + 1) }} style={styles.slider} /><span style={styles.sliderVal}>{stateRef.current.m1} kg</span></label>
          <label style={styles.controlLabel}>v₁：<input type="range" min="-3" max="5" step="0.5" value={stateRef.current.v1} onChange={(e) => { stateRef.current.v1 = parseFloat(e.target.value); forceUpdate(n => n + 1) }} style={styles.slider} /><span style={styles.sliderVal}>{stateRef.current.v1} m/s</span></label>
          <label style={styles.controlLabel}>m₂：<input type="range" min="0.1" max="2" step="0.1" value={stateRef.current.m2} onChange={(e) => { stateRef.current.m2 = parseFloat(e.target.value); forceUpdate(n => n + 1) }} style={styles.slider} /><span style={styles.sliderVal}>{stateRef.current.m2} kg</span></label>
          <label style={styles.controlLabel}>v₂：<input type="range" min="-3" max="5" step="0.5" value={stateRef.current.v2} onChange={(e) => { stateRef.current.v2 = parseFloat(e.target.value); forceUpdate(n => n + 1) }} style={styles.slider} /><span style={styles.sliderVal}>{stateRef.current.v2} m/s</span></label>
          <label style={styles.controlLabel}>碰撞：<select value={collisionType} onChange={(e) => setCollisionType(e.target.value)} style={styles.select}><option value="elastic">弹性</option><option value="inelastic">完全非弹性</option></select></label>
        </div>
      </div>
      <div style={styles.main}><canvas ref={canvasRef} style={styles.canvas} /></div>
      <div style={styles.desc}>
        <b>实验：探究动量守恒定律</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>调整滑块质量和速度，选择碰撞类型，点击"碰撞"开始。验证碰撞前后总动量守恒：m₁v₁ + m₂v₂ = m₁v₁' + m₂v₂'。</span>
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
  slider: { width: 70, accentColor: '#4A90D9' },
  sliderVal: { color: '#4A90D9', fontWeight: 600, minWidth: 40, fontSize: 12 },
  select: { background: '#fff', color: '#333', border: '1px solid #ccc', borderRadius: 4, padding: '3px 6px', fontSize: 12 },
  btn: { background: '#fff', color: '#4A90D9', border: '1px solid #ccc', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  playBtn: { background: '#4A90D9', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600, minWidth: 70 },
  pauseBtn: { background: '#E53935', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600, minWidth: 70 },
  setBtn: { background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  startBtn: { background: '#4A90D9', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  sep: { width: 1, height: 20, background: '#ccc' },
  main: { flex: 1, display: 'flex', overflow: 'hidden', background: '#fff', position: 'relative' },
  canvas: { flex: 1, width: '100%' },
  desc: { padding: '8px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13 },
}
