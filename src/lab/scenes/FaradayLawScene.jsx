import { useState, useRef, useEffect } from 'react'

/**
 * FaradayLawScene — 法拉第电磁感应定律
 * ε = NΔΦ/Δt = BLv
 */
export default function FaradayLawScene() {
  const [turns, setTurns] = useState(10)
  const [area, setArea] = useState(200) // cm²
  const [dB, setdB] = useState(2) // T/s 磁通量变化率
  const [motionSpeed, setMotionSpeed] = useState(2) // m/s
  const canvasRef = useRef(null)

  const emf = turns * dB * area * 1e-4 // ε = N * ΔB/Δt * A

  useEffect(() => {
    const cvs = canvasRef.current
    if (!cvs) return
    const ctx = cvs.getContext('2d')
    const draw = () => {
      const W = cvs.clientWidth, H = cvs.clientHeight
      cvs.width = W * devicePixelRatio; cvs.height = H * devicePixelRatio
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      ctx.clearRect(0, 0, W, H)

      const cx = W / 2, cy = H / 2

      // 磁场区域
      ctx.fillStyle = '#E8EAF6'
      ctx.fillRect(cx - 180, cy - 120, 360, 240)

      // N/S极
      ctx.fillStyle = '#E53935'
      ctx.fillRect(cx - 180, cy - 120, 360, 25)
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 14px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('N  （磁场方向 ⊗ 向纸内）', cx, cy - 102)

      ctx.fillStyle = '#1565C0'
      ctx.fillRect(cx - 180, cy + 95, 360, 25)
      ctx.fillStyle = '#fff'
      ctx.fillText('S', cx, cy + 112)

      // 线圈
      const coilW = Math.sqrt(area) * 1.5
      const coilH = coilW * 0.8
      ctx.strokeStyle = '#E65100'
      ctx.lineWidth = 3
      for (let i = 0; i < Math.min(turns, 20); i++) {
        const offset = (i - Math.min(turns, 20) / 2) * 3
        ctx.beginPath()
        ctx.ellipse(cx + offset, cy, coilW / 2, coilH / 2, 0, 0, Math.PI * 2)
        ctx.stroke()
      }

      // 磁通量变化指示
      const phiText = `Φ = B·A = ${dB.toFixed(1)} × ${(area * 1e-4).toFixed(3)} = ${(dB * area * 1e-4).toFixed(4)} Wb`
      ctx.fillStyle = '#333'
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(`磁通量: ${phiText}`, 20, 30)
      ctx.fillText(`匝数 N = ${turns}`, 20, 50)
      ctx.fillText(`变化率 ΔΦ/Δt = ${(dB * area * 1e-4).toFixed(4)} Wb/s`, 20, 70)

      // 电动势
      ctx.fillStyle = '#E53935'
      ctx.font = 'bold 16px sans-serif'
      ctx.fillText(`ε = N·ΔΦ/Δt = ${emf.toFixed(3)} V`, 20, 95)

      // 感应电流方向（楞次定律）
      ctx.fillStyle = '#4CAF50'
      ctx.font = '13px sans-serif'
      ctx.fillText(`感应电流方向: 阻碍磁通量变化`, 20, 120)

      // 法拉第定律公式
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      ctx.fillRect(W - 260, 20, 240, 130)
      ctx.strokeStyle = '#ccc'
      ctx.strokeRect(W - 260, 20, 240, 130)
      ctx.fillStyle = '#333'
      ctx.font = 'bold 14px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('法拉第电磁感应定律', W - 248, 42)
      ctx.font = '13px sans-serif'
      ctx.fillStyle = '#1565C0'
      ctx.fillText('ε = -N·dΦ/dt', W - 248, 62)
      ctx.fillStyle = '#333'
      ctx.font = '12px sans-serif'
      ctx.fillText('① 磁场变化: ε = N·A·ΔB/Δt', W - 248, 82)
      ctx.fillText('② 导体切割: ε = BLv', W - 248, 100)
      ctx.fillText('③ 交流发电: ε = NBAω·sinωt', W - 248, 118)
      ctx.fillStyle = '#666'
      ctx.fillText('负号=楞次定律方向', W - 248, 140)

      // 底部公式
      ctx.fillStyle = '#333'
      ctx.font = '13px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(`ε = N × ΔΦ/Δt = ${turns} × ${(dB * area * 1e-4).toFixed(4)} = ${emf.toFixed(3)} V`, cx, H - 20)
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(cvs)
    return () => ro.disconnect()
  }, [turns, area, dB, motionSpeed, emf])

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>法拉第电磁感应定律</span>
        <div style={styles.topActions}>
          <button style={styles.setBtn} onClick={() => { setTurns(10); setArea(200); setdB(2); setMotionSpeed(2) }}>⚙ 重置</button>
        </div>
      </div>
      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>匝数 N</span>
          <input type="range" min="1" max="100" step="1" value={turns} onChange={e => setTurns(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{turns}</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>面积 A</span>
          <input type="range" min="50" max="500" step="10" value={area} onChange={e => setArea(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{area} cm²</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>ΔB/Δt</span>
          <input type="range" min="0.1" max="5" step="0.1" value={dB} onChange={e => setdB(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{dB.toFixed(1)} T/s</span>
        </label>
        <span style={{ fontSize: 12, color: '#E53935', fontWeight: 600, marginLeft: 'auto' }}>ε={emf.toFixed(3)}V</span>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      </div>
      <div style={styles.desc}>
        <b>实验：法拉第电磁感应定律</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          调节匝数、面积、磁通量变化率，验证 ε=NΔΦ/Δt。
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
  controlName: { fontWeight: 600, color: '#4A90D9' }, slider: { width: 110, accentColor: '#4A90D9' },
  sliderVal: { color: '#4A90D9', fontWeight: 600, fontSize: 12, minWidth: 55 },
  setBtn: { background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
  main: { flex: 1, minHeight: 0, background: '#fff' },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
}
