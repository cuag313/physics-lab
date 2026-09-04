import { useState, useRef, useEffect } from 'react'

/**
 * ElectricPotentialScene — 电势与电势差
 * 等势面可视化，W=qU
 */
export default function ElectricPotentialScene() {
  const [Q1, setQ1] = useState(5)
  const [Q2, setQ2] = useState(-5)
  const [testQ, setTestQ] = useState(1)
  const canvasRef = useRef(null)

  useEffect(() => {
    const cvs = canvasRef.current
    if (!cvs) return
    const ctx = cvs.getContext('2d')
    const draw = () => {
      const W = cvs.clientWidth, H = cvs.clientHeight
      cvs.width = W * devicePixelRatio; cvs.height = H * devicePixelRatio
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#FAFAFA'
      ctx.fillRect(0, 0, W, H)

      const cx1 = W / 2 - 120, cy1 = H / 2
      const cx2 = W / 2 + 120, cy2 = H / 2
      const k = 9

      // 计算电势
      const calcV = (x, y) => {
        const r1 = Math.hypot(x - cx1, y - cy1) || 1
        const r2 = Math.hypot(x - cx2, y - cy2) || 1
        return k * Q1 / r1 + k * Q2 / r2
      }

      // 等势面（等势线）
      const levels = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2]
      const levelColors = ['#1565C0', '#1976D2', '#42A5F5', '#90CAF9', '#4CAF50', '#FFB74D', '#FF9800', '#F44336', '#C62828']

      for (let li = 0; li < levels.length; li++) {
        ctx.strokeStyle = levelColors[li]
        ctx.lineWidth = 1
        ctx.globalAlpha = 0.4
        // 扫描像素找等势线
        const step = 6
        for (let x = 0; x < W; x += step) {
          for (let y = 0; y < H; y += step) {
            const v = calcV(x, y)
            const vRight = calcV(x + step, y)
            const vDown = calcV(x, y + step)
            if ((v - levels[li]) * (vRight - levels[li]) < 0 || (v - levels[li]) * (vDown - levels[li]) < 0) {
              ctx.fillStyle = levelColors[li]
              ctx.fillRect(x, y, 2, 2)
            }
          }
        }
      }
      ctx.globalAlpha = 1

      // 电荷
      const drawCharge = (x, y, q) => {
        ctx.fillStyle = q > 0 ? '#E53935' : '#1565C0'
        ctx.beginPath()
        ctx.arc(x, y, 18, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 18px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(q > 0 ? '+' : '−', x, y)
      }
      drawCharge(cx1, cy1, Q1)
      drawCharge(cx2, cy2, Q2)

      // 电势值标注
      ctx.fillStyle = '#333'
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(`V₁ = ${(k * Q1 / 25).toFixed(1)} (距25px处)`, cx1 + 25, cy1 - 25)
      ctx.fillText(`V₂ = ${(k * Q2 / 25).toFixed(1)} (距25px处)`, cx2 + 25, cy2 - 25)

      // 测试电荷处的电势
      const testV = calcV(cx1, cy1 + 80)
      const testW = testQ * testV

      // 公式面板
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      ctx.fillRect(20, 20, 220, 100)
      ctx.strokeStyle = '#ccc'
      ctx.strokeRect(20, 20, 220, 100)
      ctx.fillStyle = '#333'
      ctx.font = 'bold 13px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('电势与电势差', 32, 40)
      ctx.font = '12px sans-serif'
      ctx.fillStyle = '#1565C0'
      ctx.fillText('V = kQ/r (标量，可叠加)', 32, 58)
      ctx.fillStyle = '#333'
      ctx.fillText(`ΔV = V_A − V_B`, 32, 76)
      ctx.fillText(`W = qΔV = ${(testW).toFixed(2)} J`, 32, 94)

      // 图例
      ctx.fillStyle = '#4CAF50'
      ctx.font = '12px sans-serif'
      ctx.fillText('等势线（绿色=0势）', 20, H - 20)
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(cvs)
    return () => ro.disconnect()
  }, [Q1, Q2, testQ])

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>电势与电势差</span>
        <div style={styles.topActions}>
          <button style={styles.setBtn} onClick={() => { setQ1(5); setQ2(-5); setTestQ(1) }}>⚙ 重置</button>
        </div>
      </div>
      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>Q₁</span>
          <input type="range" min="-10" max="10" step="1" value={Q1} onChange={e => setQ1(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{Q1 > 0 ? '+' : ''}{Q1}</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>Q₂</span>
          <input type="range" min="-10" max="10" step="1" value={Q2} onChange={e => setQ2(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{Q2 > 0 ? '+' : ''}{Q2}</span>
        </label>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      </div>
      <div style={styles.desc}>
        <b>实验：电势与电势差</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          调节电荷量观察等势面变化。电势是标量可叠加，W=qΔV。
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
  controlName: { fontWeight: 600, color: '#4A90D9' }, slider: { width: 120, accentColor: '#4A90D9' },
  sliderVal: { color: '#4A90D9', fontWeight: 600, fontSize: 12, minWidth: 40 },
  setBtn: { background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
  main: { flex: 1, minHeight: 0, background: '#fff' },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
}
