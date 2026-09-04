import { useState, useRef, useEffect } from 'react'

/**
 * CoulombLawScene — 库仑定律探究
 * 验证 F=kQ₁Q₂/r²
 */
export default function CoulombLawScene() {
  const [Q1, setQ1] = useState(5)
  const [Q2, setQ2] = useState(3)
  const [distance, setDistance] = useState(200)
  const canvasRef = useRef(null)

  const k = 9e9
  const r = distance / 100 // 转换为简化单位
  const F = k * Q1 * Q2 / (r * r) * 1e-12 // 简化显示

  useEffect(() => {
    const cvs = canvasRef.current
    if (!cvs) return
    const ctx = cvs.getContext('2d')
    const draw = () => {
      const W = cvs.clientWidth, H = cvs.clientHeight
      cvs.width = W * devicePixelRatio; cvs.height = H * devicePixelRatio
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      ctx.clearRect(0, 0, W, H)

      const cy = H / 2
      const cx1 = W / 2 - distance / 2
      const cx2 = W / 2 + distance / 2
      const r1 = 15 + Q1 * 3, r2 = 15 + Q2 * 3

      // 距离标注
      ctx.strokeStyle = '#999'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.moveTo(cx1, cy + 60)
      ctx.lineTo(cx2, cy + 60)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#333'
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(`r = ${r.toFixed(2)} m`, (cx1 + cx2) / 2, cy + 78)

      // 电荷1
      ctx.fillStyle = Q1 > 0 ? '#E53935' : '#1565C0'
      ctx.beginPath()
      ctx.arc(cx1, cy, r1, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 14px sans-serif'
      ctx.fillText(Q1 > 0 ? '+' : '-', cx1, cy + 5)
      ctx.fillStyle = '#333'
      ctx.font = '12px sans-serif'
      ctx.fillText(`Q₁ = ${Q1 > 0 ? '+' : ''}${Q1} μC`, cx1, cy + r1 + 20)

      // 电荷2
      ctx.fillStyle = Q2 > 0 ? '#E53935' : '#1565C0'
      ctx.beginPath()
      ctx.arc(cx2, cy, r2, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 14px sans-serif'
      ctx.fillText(Q2 > 0 ? '+' : '-', cx2, cy + 5)
      ctx.fillStyle = '#333'
      ctx.font = '12px sans-serif'
      ctx.fillText(`Q₂ = ${Q2 > 0 ? '+' : ''}${Q2} μC`, cx2, cy + r2 + 20)

      // 力的箭头
      const sameSign = (Q1 > 0 && Q2 > 0) || (Q1 < 0 && Q2 < 0)
      const forceDir = sameSign ? -1 : 1 // 同斥异吸
      const forceScale = Math.min(F * 50, 120)
      const forceColor = sameSign ? '#E53935' : '#4CAF50'

      // Q1 受力
      ctx.strokeStyle = forceColor
      ctx.fillStyle = forceColor
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(cx1 + r1 + 5, cy - 30)
      ctx.lineTo(cx1 + r1 + 5 + forceDir * forceScale, cy - 30)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx1 + r1 + 5 + forceDir * forceScale, cy - 30)
      ctx.lineTo(cx1 + r1 + 5 + forceDir * (forceScale - 8), cy - 36)
      ctx.lineTo(cx1 + r1 + 5 + forceDir * (forceScale - 8), cy - 24)
      ctx.fill()
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('F₁', cx1 + r1 + 5 + forceDir * forceScale / 2, cy - 38)

      // Q2 受力
      ctx.beginPath()
      ctx.moveTo(cx2 - r2 - 5, cy - 30)
      ctx.lineTo(cx2 - r2 - 5 - forceDir * forceScale, cy - 30)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx2 - r2 - 5 - forceDir * forceScale, cy - 30)
      ctx.lineTo(cx2 - r2 - 5 - forceDir * (forceScale - 8), cy - 36)
      ctx.lineTo(cx2 - r2 - 5 - forceDir * (forceScale - 8), cy - 24)
      ctx.fill()
      ctx.fillText('F₂', cx2 - r2 - 5 - forceDir * forceScale / 2, cy - 38)

      // 公式面板
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      ctx.fillRect(20, 20, 250, 120)
      ctx.strokeStyle = '#ccc'
      ctx.strokeRect(20, 20, 250, 120)
      ctx.fillStyle = '#333'
      ctx.font = 'bold 14px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('库仑定律', 32, 42)
      ctx.font = '13px sans-serif'
      ctx.fillStyle = '#1565C0'
      ctx.fillText('F = kQ₁Q₂/r²', 32, 62)
      ctx.fillStyle = '#333'
      ctx.font = '12px sans-serif'
      ctx.fillText(`k = 9×10⁹ N·m²/C²`, 32, 82)
      ctx.fillText(`F = ${F.toFixed(2)} × 10⁻³ N`, 32, 102)
      ctx.fillStyle = forceColor
      ctx.font = 'bold 12px sans-serif'
      ctx.fillText(sameSign ? '同号电荷相斥' : '异号电荷相吸', 32, 126)

      // 控制变量说明
      ctx.fillStyle = '#666'
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('控制变量法：', 20, H - 40)
      ctx.fillText('① 保持r不变，改变Q₁或Q₂ → F∝Q₁Q₂', 20, H - 20)
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(cvs)
    return () => ro.disconnect()
  }, [Q1, Q2, distance, F])

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>库仑定律探究</span>
        <div style={styles.topActions}>
          <button style={styles.setBtn} onClick={() => { setQ1(5); setQ2(3); setDistance(200) }}>⚙ 重置</button>
        </div>
      </div>
      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>Q₁</span>
          <input type="range" min="-10" max="10" step="1" value={Q1} onChange={e => setQ1(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{Q1 > 0 ? '+' : ''}{Q1} μC</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>Q₂</span>
          <input type="range" min="-10" max="10" step="1" value={Q2} onChange={e => setQ2(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{Q2 > 0 ? '+' : ''}{Q2} μC</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>距离 r</span>
          <input type="range" min="50" max="400" step="10" value={distance} onChange={e => setDistance(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{(distance / 100).toFixed(2)} m</span>
        </label>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      </div>
      <div style={styles.desc}>
        <b>实验：库仑定律</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          调节电荷量和距离，验证 F=kQ₁Q₂/r²。同号电荷相斥，异号电荷相吸。
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
