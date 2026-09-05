import { useState, useRef, useEffect, useCallback } from 'react'

/**
 * JouleLawScene — 探究焦耳定律
 * Q = I²Rt，三种探究模式：Q∝I²、Q∝R、Q∝t
 */
export default function JouleLawScene() {
  const [mode, setMode] = useState(0) // 0:Q∝I², 1:Q∝R, 2:Q∝t
  const [current, setCurrent] = useState(1.0)
  const [resistance, setResistance] = useState(10)
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)
  const canvasRef = useRef(null)
  const tickRef = useRef(0)
  const rafRef = useRef(null)
  const lastTimeRef = useRef(null)
  const dataRef = useRef([])

  // Three resistors for comparative experiment
  const configs = mode === 0
    ? [{ I: current * 0.5, R: resistance, label: 'R₁' }, { I: current, R: resistance, label: 'R₂' }, { I: current * 1.5, R: resistance, label: 'R₃' }]
    : mode === 1
      ? [{ I: current, R: resistance * 0.5, label: 'R₁' }, { I: current, R: resistance, label: 'R₂' }, { I: current, R: resistance * 2, label: 'R₃' }]
      : [{ I: current, R: resistance, label: 'R₁' }, { I: current, R: resistance, label: 'R₂' }, { I: current, R: resistance, label: 'R₃' }]

  const temps = configs.map(c => {
    const Q = c.I * c.I * c.R * elapsed
    return { dT: Q * 0.5, Q, I: c.I, R: c.R, label: c.label }
  })

  const draw = useCallback(() => {
    const cvs = canvasRef.current
    if (!cvs) return
    const ctx = cvs.getContext('2d')
    const W = cvs.clientWidth, H = cvs.clientHeight
    cvs.width = W * devicePixelRatio; cvs.height = H * devicePixelRatio
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
    ctx.clearRect(0, 0, W, H)

    const barW = 60, barGap = 30
    const startX = (W - (barW * 3 + barGap * 2)) / 2
    const baseY = H - 80
    const maxH = H - 180
    const maxQ = Math.max(...temps.map(t => t.Q), 1)

    // Title
    ctx.fillStyle = '#333'
    ctx.font = 'bold 15px sans-serif'
    ctx.textAlign = 'center'
    const modeLabels = ['Q ∝ I² (R,t 不变)', 'Q ∝ R (I,t 不变)', 'Q ∝ t (I,R 不变)']
    ctx.fillText(`模式：${modeLabels[mode]}`, W / 2, 25)

    // Draw three resistor beakers
    const beakerW = 90, beakerH = 70
    for (let i = 0; i < 3; i++) {
      const bx = (W / 3) * i + (W / 3) / 2
      const by = 55

      // Beaker
      ctx.fillStyle = 'rgba(200,230,255,0.4)'
      ctx.strokeStyle = '#999'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.roundRect(bx - beakerW / 2, by, beakerW, beakerH, 4)
      ctx.fill()
      ctx.stroke()

      // Water level
      const waterH = beakerH - 10
      ctx.fillStyle = 'rgba(66,165,245,0.3)'
      ctx.fillRect(bx - beakerW / 2 + 3, by + 5, beakerW - 6, waterH)

      // Coil resistor
      const coilY = by + beakerH / 2
      ctx.strokeStyle = '#D32F2F'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      for (let s = 0; s < 6; s++) {
        const sx = bx - 20 + s * 8
        ctx.moveTo(sx, coilY - 6)
        ctx.lineTo(sx + 4, coilY + 6)
        ctx.lineTo(sx + 8, coilY - 6)
      }
      ctx.stroke()

      // Thermometer
      const tx = bx + beakerW / 2 + 12
      ctx.strokeStyle = '#666'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(tx, by + 5)
      ctx.lineTo(tx, by + beakerH - 5)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(tx, by + beakerH - 5, 5, 0, Math.PI * 2)
      ctx.fillStyle = '#E53935'
      ctx.fill()

      // Temp rise indicator
      const tRise = temps[i].dT
      const fillH = Math.min(tRise * 2, beakerH - 15)
      ctx.fillStyle = '#E53935'
      ctx.fillRect(tx - 2, by + beakerH - 10 - fillH, 4, fillH)

      // Label
      ctx.fillStyle = '#333'
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(temps[i].label, bx, by + beakerH + 15)
      ctx.font = '11px sans-serif'
      ctx.fillStyle = '#666'
      ctx.fillText(`I=${temps[i].I.toFixed(1)}A R=${temps[i].R.toFixed(0)}Ω`, bx, by + beakerH + 30)
    }

    // Bar chart
    for (let i = 0; i < 3; i++) {
      const x = startX + i * (barW + barGap)
      const h = (temps[i].Q / maxQ) * maxH
      const colors = ['#4A90D9', '#66BB6A', '#FFA726']

      ctx.fillStyle = colors[i]
      ctx.beginPath()
      ctx.roundRect(x, baseY - h, barW, h, [4, 4, 0, 0])
      ctx.fill()

      ctx.strokeStyle = '#ccc'
      ctx.lineWidth = 1
      ctx.strokeRect(x, baseY - h, barW, h)

      // Value on bar
      ctx.fillStyle = '#333'
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(`Q=${temps[i].Q.toFixed(1)} J`, x + barW / 2, baseY - h - 8)

      // Label
      ctx.fillStyle = '#666'
      ctx.font = '12px sans-serif'
      ctx.fillText(temps[i].label, x + barW / 2, baseY + 16)
    }

    // Axis
    ctx.strokeStyle = '#999'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(startX - 10, baseY)
    ctx.lineTo(startX + barW * 3 + barGap * 2 + 10, baseY)
    ctx.stroke()

    // Formula
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.fillRect(W - 200, H - 70, 185, 55)
    ctx.strokeStyle = '#ccc'
    ctx.strokeRect(W - 200, H - 70, 185, 55)
    ctx.fillStyle = '#1565C0'
    ctx.font = 'bold 14px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('Q = I²Rt', W - 188, H - 50)
    ctx.fillStyle = '#333'
    ctx.font = '11px sans-serif'
    ctx.fillText(`t = ${elapsed.toFixed(1)} s`, W - 188, H - 32)

    // Timer display
    ctx.fillStyle = running ? '#4CAF50' : '#E53935'
    ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(running ? '计时中...' : '已停止', W / 2, H - 48)
    ctx.fillStyle = '#333'
    ctx.font = 'bold 22px monospace'
    ctx.fillText(`${elapsed.toFixed(1)} s`, W / 2, H - 25)
  }, [mode, current, resistance, elapsed, running, temps])

  // Animation loop
  useEffect(() => {
    const animate = (time) => {
      if (running) {
        if (lastTimeRef.current === null) lastTimeRef.current = time
        const dt = (time - lastTimeRef.current) / 1000
        lastTimeRef.current = time
        setElapsed(prev => prev + dt)
      } else {
        lastTimeRef.current = null
      }
      tickRef.current++
      draw()
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  useEffect(() => { draw() }, [draw])

  const handleReset = () => {
    setRunning(false)
    setElapsed(0)
    lastTimeRef.current = null
    dataRef.current = []
  }

  const handleRecord = () => {
    dataRef.current.push({ t: elapsed, temps: temps.map(t => ({ ...t })) })
  }

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>探究焦耳定律</span>
        <div style={styles.topActions}>
          {['Q∝I²', 'Q∝R', 'Q∝t'].map((label, i) => (
            <button key={i} style={{ ...styles.modeBtn, background: mode === i ? '#4A90D9' : '#eee', color: mode === i ? '#fff' : '#333' }}
              onClick={() => { setMode(i); handleReset() }}>{label}</button>
          ))}
          <button style={styles.resetBtn} onClick={handleReset}>⚙ 重置</button>
        </div>
      </div>
      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>电流 I</span>
          <input type="range" min="0.1" max="2" step="0.1" value={current} onChange={e => setCurrent(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{current.toFixed(1)} A</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>电阻 R</span>
          <input type="range" min="1" max="20" step="1" value={resistance} onChange={e => setResistance(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{resistance} Ω</span>
        </label>
        <div style={styles.timerControls}>
          <button style={{ ...styles.timerBtn, background: running ? '#E53935' : '#4CAF50' }} onClick={() => setRunning(!running)}>
            {running ? '⏸ 暂停' : '▶ 开始'}
          </button>
          <button style={styles.timerBtn} onClick={handleReset}>⏹ 重置</button>
          <button style={styles.timerBtn} onClick={handleRecord} disabled={running}>📋 记录</button>
        </div>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      </div>
      <div style={styles.dataPanel}>
        {temps.map((t, i) => (
          <div key={i} style={styles.dataItem}>
            <span style={{ color: ['#4A90D9', '#66BB6A', '#FFA726'][i], fontWeight: 600 }}>{t.label}</span>
            <span>ΔT={t.dT.toFixed(1)}°C</span>
            <span>Q={t.Q.toFixed(1)}J</span>
          </div>
        ))}
      </div>
      <div style={styles.desc}>
        <b>实验：焦耳定律</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          使用控制变量法探究电流产生热量与电流、电阻、通电时间的关系。Q = I²Rt。
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
  timerControls: { display: 'flex', gap: 6, marginLeft: 'auto' },
  timerBtn: { background: '#4A90D9', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
  main: { flex: 1, minHeight: 0, background: '#fff' },
  dataPanel: { display: 'flex', justifyContent: 'center', gap: 24, padding: '4px 12px', background: '#f9f9f9', borderTop: '1px solid #ddd', flexShrink: 0 },
  dataItem: { display: 'flex', gap: 8, fontSize: 12, alignItems: 'center' },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
}
