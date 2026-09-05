import { useState, useRef, useEffect, useCallback } from 'react'

/**
 * ElectromagnetScene — 电磁铁磁性影响因素
 * 探究匝数和电流大小对电磁铁磁性强弱的影响
 */
export default function ElectromagnetScene() {
  const [mode, setMode] = useState(0) // 0:vary current, 1:vary turns
  const [current, setCurrent] = useState(1.0)
  const [turns, setTurns] = useState(20)
  const canvasRef = useRef(null)
  const tickRef = useRef(0)
  const rafRef = useRef(null)
  const particlesRef = useRef([])
  const dataRef = useRef([])

  // Magnetic strength: proportional to N*I
  const strength = turns * current
  const clipCount = Math.min(Math.floor(strength / 3), 15)

  // Generate bar chart data points
  const chartData = mode === 0
    ? [0.5, 1.0, 1.5, 2.0].map(I => ({ x: I, y: turns * I, label: `${I}A` }))
    : [10, 20, 30, 40].map(N => ({ x: N, y: N * current, label: `${N}T` }))

  // Initialize iron filing particles
  useEffect(() => {
    const particles = []
    for (let i = 0; i < 60; i++) {
      particles.push({
        x: 0, y: 0,
        targetX: 0, targetY: 0,
        angle: Math.random() * Math.PI * 2,
        dist: 40 + Math.random() * 80,
        size: 1 + Math.random() * 2,
        speed: 0.5 + Math.random() * 1.5,
      })
    }
    particlesRef.current = particles
  }, [])

  const draw = useCallback(() => {
    const cvs = canvasRef.current
    if (!cvs) return
    const ctx = cvs.getContext('2d')
    const W = cvs.clientWidth, H = cvs.clientHeight
    cvs.width = W * devicePixelRatio; cvs.height = H * devicePixelRatio
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
    ctx.clearRect(0, 0, W, H)

    const cx = W * 0.35, cy = H * 0.45
    const coreW = 120, coreH = 40

    // Iron core
    ctx.fillStyle = '#8D6E63'
    ctx.strokeStyle = '#5D4037'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.roundRect(cx - coreW / 2, cy - coreH / 2, coreW, coreH, 6)
    ctx.fill()
    ctx.stroke()

    // Solenoid coils
    const coilSpacing = coreW / (turns + 1)
    for (let i = 0; i < turns; i++) {
      const x = cx - coreW / 2 + coilSpacing * (i + 1)
      ctx.strokeStyle = `rgba(211,47,47,${0.4 + current * 0.3})`
      ctx.lineWidth = 2 + current * 0.5
      ctx.beginPath()
      ctx.arc(x, cy - coreH / 2, 8, Math.PI, 0)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(x, cy + coreH / 2, 8, 0, Math.PI)
      ctx.stroke()
    }

    // Current direction arrows
    ctx.fillStyle = '#E53935'
    ctx.font = 'bold 14px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('⊗', cx - coreW / 2 - 15, cy - 5)
    ctx.fillText('⊙', cx + coreW / 2 + 15, cy - 5)
    ctx.font = '10px sans-serif'
    ctx.fillText('电流入', cx - coreW / 2 - 15, cy + 12)
    ctx.fillText('电流出', cx + coreW / 2 + 15, cy + 12)

    // Magnetic field lines (simplified)
    ctx.strokeStyle = 'rgba(33,150,243,0.3)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 3])
    for (let i = 0; i < 3; i++) {
      const offset = 20 + i * 18
      ctx.beginPath()
      ctx.moveTo(cx - coreW / 2, cy - offset)
      ctx.quadraticCurveTo(cx, cy - offset - 30, cx + coreW / 2, cy - offset)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx - coreW / 2, cy + offset)
      ctx.quadraticCurveTo(cx, cy + offset + 30, cx + coreW / 2, cy + offset)
      ctx.stroke()
    }
    ctx.setLineDash([])

    // Poles (N/S labels)
    ctx.fillStyle = '#1565C0'
    ctx.font = 'bold 16px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('N', cx - coreW / 2, cy + coreH / 2 + 25)
    ctx.fillStyle = '#E53935'
    ctx.fillText('S', cx + coreW / 2, cy + coreH / 2 + 25)

    // Iron filings animation
    const t = tickRef.current * 0.02
    particlesRef.current.forEach((p, i) => {
      // Left pole filings
      const poleX = i < 30 ? cx - coreW / 2 : cx + coreW / 2
      const poleY = cy
      const pullStrength = Math.min(strength / 40, 1)

      p.angle += p.speed * 0.02
      const targetDist = p.dist * (1 - pullStrength * 0.6)
      const tx = poleX + Math.cos(p.angle) * targetDist
      const ty = poleY + Math.sin(p.angle) * targetDist * 0.6

      p.x += (tx - p.x) * 0.03
      p.y += (ty - p.y) * 0.03

      ctx.fillStyle = `rgba(60,60,60,${0.3 + pullStrength * 0.5})`
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fill()
    })

    // Paper clips hanging from poles
    const clipSpacing = 14
    for (let i = 0; i < clipCount; i++) {
      const side = i < Math.ceil(clipCount / 2) ? -1 : 1
      const idx = side === -1 ? i : i - Math.ceil(clipCount / 2)
      const px = cx + side * (coreW / 2) + side * 5
      const py = cy + coreH / 2 + 8 + idx * clipSpacing

      // Clip shape
      ctx.strokeStyle = '#888'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(px - 4, py)
      ctx.lineTo(px + 4, py)
      ctx.lineTo(px + 4, py + 8)
      ctx.lineTo(px, py + 12)
      ctx.lineTo(px - 4, py + 8)
      ctx.closePath()
      ctx.stroke()
      ctx.fillStyle = '#BDBDBD'
      ctx.fill()
    }

    // Info panel
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.fillRect(W - 230, 15, 215, 100)
    ctx.strokeStyle = '#ccc'
    ctx.strokeRect(W - 230, 15, 215, 100)
    ctx.fillStyle = '#333'
    ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('电磁铁参数', W - 218, 35)
    ctx.font = '12px sans-serif'
    ctx.fillText(`电流 I = ${current.toFixed(1)} A`, W - 218, 55)
    ctx.fillText(`匝数 N = ${turns} 匝`, W - 218, 73)
    ctx.fillStyle = '#1565C0'
    ctx.font = 'bold 12px sans-serif'
    ctx.fillText(`磁性强弱 ∝ NI = ${strength.toFixed(1)}`, W - 218, 93)
    ctx.fillStyle = '#4CAF50'
    ctx.fillText(`吸引回形针: ${clipCount} 个`, W - 218, 108)

    // Bar chart
    const chartX = W - 230, chartY = 130, chartW = 215, chartH = 120
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.fillRect(chartX, chartY, chartW, chartH)
    ctx.strokeStyle = '#ccc'
    ctx.strokeRect(chartX, chartY, chartW, chartH)

    const maxY = Math.max(...chartData.map(d => d.y), 1)
    const barW2 = 35
    chartData.forEach((d, i) => {
      const bx = chartX + 20 + i * 50
      const bh = (d.y / maxY) * (chartH - 40)
      ctx.fillStyle = mode === 0 ? '#4A90D9' : '#66BB6A'
      ctx.beginPath()
      ctx.roundRect(bx, chartY + chartH - 20 - bh, barW2, bh, [3, 3, 0, 0])
      ctx.fill()
      ctx.fillStyle = '#333'
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(d.label, bx + barW2 / 2, chartY + chartH - 5)
      ctx.fillText(d.y.toFixed(1), bx + barW2 / 2, chartY + chartH - 25 - bh)
    })

    ctx.fillStyle = '#333'
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(mode === 0 ? '磁性 vs 电流' : '磁性 vs 匝数', chartX + 8, chartY + 14)

    // Data table
    if (dataRef.current.length > 0) {
      const tblX = 15, tblY = H - 80 - dataRef.current.length * 20
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.fillRect(tblX, tblY, 220, 20 + dataRef.current.length * 20)
      ctx.strokeStyle = '#ccc'
      ctx.strokeRect(tblX, tblY, 220, 20 + dataRef.current.length * 20)
      ctx.fillStyle = '#333'
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('I(A)    N(匝)   强度', tblX + 8, tblY + 14)
      ctx.font = '11px sans-serif'
      dataRef.current.forEach((row, i) => {
        ctx.fillText(`${row.I.toFixed(1)}     ${row.N}      ${row.s.toFixed(1)}`, tblX + 8, tblY + 32 + i * 18)
      })
    }

    // Description text
    ctx.fillStyle = '#666'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('公式：F ∝ NI（磁性强弱与电流和匝数的乘积成正比）', 15, H - 20)
  }, [mode, current, turns, strength, clipCount, chartData])

  useEffect(() => {
    const animate = () => {
      tickRef.current++
      draw()
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  const handleRecord = () => {
    dataRef.current.push({ I: current, N: turns, s: strength })
    if (dataRef.current.length > 5) dataRef.current.shift()
  }

  const handleReset = () => {
    setCurrent(1.0)
    setTurns(20)
    dataRef.current = []
  }

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>电磁铁磁性影响因素</span>
        <div style={styles.topActions}>
          {['探究电流', '探究匝数'].map((label, i) => (
            <button key={i} style={{ ...styles.modeBtn, background: mode === i ? '#4A90D9' : '#eee', color: mode === i ? '#fff' : '#333' }}
              onClick={() => { setMode(i); dataRef.current = [] }}>{label}</button>
          ))}
          <button style={styles.resetBtn} onClick={handleReset}>⚙ 重置</button>
        </div>
      </div>
      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>电流 I</span>
          <input type="range" min="0.1" max="3" step="0.1" value={current} onChange={e => setCurrent(+e.target.value)} style={styles.slider} disabled={mode === 1} />
          <span style={styles.sliderVal}>{current.toFixed(1)} A</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>匝数 N</span>
          <input type="range" min="5" max="50" step="1" value={turns} onChange={e => setTurns(+e.target.value)} style={styles.slider} disabled={mode === 0} />
          <span style={styles.sliderVal}>{turns} 匝</span>
        </label>
        <button style={styles.recordBtn} onClick={handleRecord}>📋 记录数据</button>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      </div>
      <div style={styles.desc}>
        <b>实验：电磁铁</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          使用控制变量法，探究电流大小和线圈匝数对电磁铁磁性强弱的影响。
        </span>
      </div>
    </div>
  )
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', maxHeight: '100vh', background: '#e8e8e8', color: '#333', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', overflow: 'hidden' },
  topBar: { background: '#f5f5f5', borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', flexShrink: 0 },
  title: { fontSize: 14, fontWeight: 600 }, topActions: { display: 'flex', gap: 6 },
  modeBtn: { border: 'none', borderRadius: 4, padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600 },
  resetBtn: { background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
  controlBar: { background: '#fafafa', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', padding: '4px 12px', flexShrink: 0, gap: 16 },
  controlLabel: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#555' },
  controlName: { fontWeight: 600, color: '#4A90D9' }, slider: { width: 100, accentColor: '#4A90D9' },
  sliderVal: { color: '#4A90D9', fontWeight: 600, fontSize: 12, minWidth: 50 },
  recordBtn: { background: '#4A90D9', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer', marginLeft: 'auto' },
  main: { flex: 1, minHeight: 0, background: '#fff' },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
}
