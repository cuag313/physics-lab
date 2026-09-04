import { useState, useRef, useEffect } from 'react'

/**
 * SelfInductionScene — 自感与互感
 * 通电/断电自感现象
 */
export default function SelfInductionScene() {
  const [mode, setMode] = useState('on') // on=通电, off=断电
  const [L, setL] = useState(50) // mH 自感系数
  const [playing, setPlaying] = useState(false)
  const canvasRef = useRef(null)
  const S = useRef({ t: 0, raf: null, last: 0, data: [] })

  const R = 10 // Ω 电路电阻
  const tau = L * 1e-3 / R // 时间常数 L/R

  useEffect(() => {
    S.current.t = 0
    S.current.data = []
    setPlaying(true)
  }, [mode])

  useEffect(() => {
    const cvs = canvasRef.current
    if (!cvs) return
    const ctx = cvs.getContext('2d')

    const loop = (ts) => {
      if (!playing) { S.current.last = ts; S.current.raf = requestAnimationFrame(loop); return }
      const dt = Math.min((ts - (S.current.last || ts)) / 1000, 0.05)
      S.current.last = ts
      S.current.t += dt
      const t = S.current.t

      const W = cvs.clientWidth, H = cvs.clientHeight
      cvs.width = W * devicePixelRatio; cvs.height = H * devicePixelRatio
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      ctx.clearRect(0, 0, W, H)

      const V = 12
      let current, emfSelf
      if (mode === 'on') {
        current = (V / R) * (1 - Math.exp(-t / tau))
        emfSelf = V * Math.exp(-t / tau)
      } else {
        current = (V / R) * Math.exp(-t / tau)
        emfSelf = -V * Math.exp(-t / tau)
      }

      if (S.current.data.length < 600) {
        S.current.data.push({ t, I: current, E: emfSelf })
      }

      // 电路图
      const ox = 40, oy = 40
      ctx.strokeStyle = '#666'
      ctx.lineWidth = 2
      // 电池
      ctx.fillStyle = '#4CAF50'
      ctx.fillRect(ox, oy + 50, 12, 30)
      ctx.fillStyle = '#fff'
      ctx.font = '9px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('+', ox + 6, oy + 46)
      ctx.fillText('−', ox + 6, oy + 86)
      // 导线
      ctx.strokeStyle = '#666'
      ctx.beginPath()
      ctx.moveTo(ox + 6, oy + 50)
      ctx.lineTo(ox + 6, oy + 20)
      ctx.lineTo(ox + 150, oy + 20)
      ctx.stroke()
      // 线圈
      ctx.strokeStyle = '#E65100'
      ctx.lineWidth = 2
      for (let i = 0; i < 6; i++) {
        ctx.beginPath()
        ctx.arc(ox + 170 + i * 12, oy + 20, 8, 0, Math.PI)
        ctx.stroke()
      }
      ctx.fillStyle = '#333'
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('L', ox + 206, oy + 8)
      // 开关
      ctx.strokeStyle = '#666'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(ox + 250, oy + 20)
      ctx.lineTo(ox + 280, mode === 'on' ? oy + 20 : oy + 5)
      ctx.stroke()
      // 电阻
      ctx.strokeStyle = '#FF9800'
      ctx.strokeRect(ox + 280, oy + 12, 30, 16)
      ctx.fillStyle = '#333'
      ctx.font = '9px sans-serif'
      ctx.fillText('R', ox + 295, oy + 24)
      // 回路
      ctx.strokeStyle = '#666'
      ctx.beginPath()
      ctx.moveTo(ox + 310, oy + 20)
      ctx.lineTo(ox + 340, oy + 20)
      ctx.lineTo(ox + 340, oy + 70)
      ctx.lineTo(ox + 6, oy + 70)
      ctx.lineTo(ox + 6, oy + 80)
      ctx.stroke()

      // 灯泡（断电自感时会闪一下）
      ctx.fillStyle = mode === 'off' && t < tau * 2 ? '#FFEB3B' : '#FFF9C4'
      ctx.beginPath()
      ctx.arc(ox + 340, oy + 45, 12, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#FF9800'
      ctx.stroke()

      // 曲线
      const graphX = 60, graphY = 150, graphW = W - 100, graphH = H - 200
      if (graphW > 100) {
        ctx.strokeStyle = '#999'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(graphX, graphY)
        ctx.lineTo(graphX, graphY + graphH)
        ctx.lineTo(graphX + graphW, graphY + graphH)
        ctx.stroke()

        ctx.fillStyle = '#333'
        ctx.font = 'bold 12px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('时间 t', graphX + graphW / 2, graphY + graphH + 30)

        const maxT = tau * 5
        const maxI = V / R
        const maxE = V

        // I-t 曲线
        ctx.strokeStyle = '#1565C0'
        ctx.lineWidth = 2
        ctx.beginPath()
        S.current.data.forEach((d, i) => {
          const x = graphX + (d.t / maxT) * graphW
          const y = graphY + graphH - (d.I / maxI) * graphH
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        })
        ctx.stroke()

        // ε-t 曲线
        ctx.strokeStyle = '#E53935'
        ctx.lineWidth = 2
        ctx.beginPath()
        S.current.data.forEach((d, i) => {
          const x = graphX + (d.t / maxT) * graphW
          const y = graphY + graphH - (Math.abs(d.E) / maxE) * graphH
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        })
        ctx.stroke()

        // 图例
        ctx.fillStyle = '#1565C0'
        ctx.font = '12px sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText('—— I(t) 电流', graphX + 10, graphY + 15)
        ctx.fillStyle = '#E53935'
        ctx.fillText('—— ε(t) 自感电动势', graphX + 10, graphY + 32)

        ctx.fillStyle = '#333'
        ctx.font = '11px sans-serif'
        ctx.fillText(`τ = L/R = ${(tau * 1000).toFixed(1)} ms`, graphX + graphW - 140, graphY + 15)
      }

      // 信息
      ctx.fillStyle = '#333'
      ctx.font = '13px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(`I = ${current.toFixed(3)} A`, 40, H - 30)
      ctx.fillText(`ε自 = ${emfSelf.toFixed(3)} V`, 200, H - 30)
      ctx.fillStyle = '#666'
      ctx.font = '12px sans-serif'
      ctx.fillText(mode === 'on' ? '通电自感：电流缓慢增大，自感电动势阻碍电流增大' : '断电自感：电流缓慢减小，自感电动势阻碍电流减小（灯泡闪亮）', 40, H - 10)

      S.current.raf = requestAnimationFrame(loop)
    }
    S.current.raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(S.current.raf)
  }, [playing, mode, tau, L])

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>自感与互感</span>
        <div style={styles.topActions}>
          <button style={{ ...styles.setBtn, background: mode === 'on' ? '#E53935' : '#7B1FA2' }} onClick={() => setMode('on')}>通电自感</button>
          <button style={{ ...styles.setBtn, background: mode === 'off' ? '#E53935' : '#7B1FA2' }} onClick={() => setMode('off')}>断电自感</button>
          <button style={styles.setBtn} onClick={() => { S.current.t = 0; S.current.data = [] }}>重置</button>
        </div>
      </div>
      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>自感系数 L</span>
          <input type="range" min="5" max="200" step="5" value={L} onChange={e => setL(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{L} mH</span>
        </label>
        <span style={{ fontSize: 12, color: '#555', marginLeft: 16 }}>
          L越大，τ=L/R越大，电流变化越慢
        </span>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      </div>
      <div style={styles.desc}>
        <b>实验：自感现象</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          通电时电流缓慢增大（自感阻碍），断电时电流缓慢减小（自感维持）。τ=L/R为时间常数。
        </span>
      </div>
    </div>
  )
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', maxHeight: '100vh', background: '#e8e8e8', color: '#333', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', overflow: 'hidden' },
  topBar: { background: '#f5f5f5', borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', flexShrink: 0 },
  title: { fontSize: 14, fontWeight: 600 }, topActions: { display: 'flex', gap: 6 },
  controlBar: { background: '#fafafa', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', padding: '4px 12px', flexShrink: 0, gap: 12 },
  controlLabel: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#555' },
  controlName: { fontWeight: 600, color: '#4A90D9' }, slider: { width: 140, accentColor: '#4A90D9' },
  sliderVal: { color: '#4A90D9', fontWeight: 600, fontSize: 12, minWidth: 55 },
  setBtn: { background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
  main: { flex: 1, minHeight: 0, background: '#fff' },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
}
