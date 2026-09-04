import { useState, useRef, useEffect } from 'react'

/**
 * LorentzForceScene — 洛伦兹力与带电粒子偏转
 * 带电粒子在磁场中做圆周运动
 */
export default function LorentzForceScene() {
  const [B, setB] = useState(1) // T
  const [v, setV] = useState(1e6) // m/s
  const [q, setQ] = useState(1) // 基本电荷倍数
  const [mass, setMass] = useState(1) // 质量倍数
  const canvasRef = useRef(null)
  const S = useRef({ angle: 0, raf: null, last: 0 })

  const qVal = q * 1.6e-19
  const mVal = mass * 1.67e-27
  const r = mVal * v / (qVal * B) // 回旋半径
  const T = 2 * Math.PI * mVal / (qVal * B) // 回旋周期
  const f = 1 / T

  useEffect(() => {
    const cvs = canvasRef.current
    if (!cvs) return
    const ctx = cvs.getContext('2d')

    const loop = (ts) => {
      const dt = Math.min((ts - (S.current.last || ts)) / 1000, 0.05)
      S.current.last = ts
      S.current.angle += (v / (r || 1)) * dt * 0.0001

      const W = cvs.clientWidth, H = cvs.clientHeight
      cvs.width = W * devicePixelRatio; cvs.height = H * devicePixelRatio
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      ctx.clearRect(0, 0, W, H)

      // 磁场区域（向纸内 ⊗）
      ctx.fillStyle = '#E8EAF6'
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = '#333'
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('磁场 B（向纸内 ⊗）', 20, 20)

      // 画一些 ⊗ 表示磁场方向
      ctx.fillStyle = 'rgba(100,100,100,0.15)'
      ctx.font = '16px sans-serif'
      for (let x = 30; x < W; x += 50) {
        for (let y = 30; y < H; y += 50) {
          ctx.fillText('⊗', x, y)
        }
      }

      const cx = W / 2, cy = H / 2

      // 显示半径（缩放到屏幕）
      const displayR = Math.min(r / 1e-1 * 30, Math.min(W, H) / 2 - 60)
      const clampedR = Math.max(30, Math.min(displayR, Math.min(W, H) / 2 - 60))

      // 轨迹圆
      ctx.strokeStyle = 'rgba(33,150,243,0.3)'
      ctx.lineWidth = 1
      ctx.setLineDash([5, 5])
      ctx.beginPath()
      ctx.arc(cx, cy, clampedR, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])

      // 粒子位置
      const px = cx + Math.cos(S.current.angle) * clampedR
      const py = cy + Math.sin(S.current.angle) * clampedR

      // 速度方向（切线）
      const tangentAngle = S.current.angle + Math.PI / 2
      const arrowLen = 40
      ctx.strokeStyle = '#4CAF50'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(px + Math.cos(tangentAngle) * arrowLen, py + Math.sin(tangentAngle) * arrowLen)
      ctx.stroke()
      // 箭头头
      ctx.fillStyle = '#4CAF50'
      ctx.beginPath()
      ctx.moveTo(px + Math.cos(tangentAngle) * arrowLen, py + Math.sin(tangentAngle) * arrowLen)
      ctx.lineTo(px + Math.cos(tangentAngle - 0.3) * (arrowLen - 8), py + Math.sin(tangentAngle - 0.3) * (arrowLen - 8))
      ctx.lineTo(px + Math.cos(tangentAngle + 0.3) * (arrowLen - 8), py + Math.sin(tangentAngle + 0.3) * (arrowLen - 8))
      ctx.fill()

      // 洛伦兹力方向（指向圆心）
      const forceAngle = Math.atan2(cy - py, cx - px)
      ctx.strokeStyle = '#E53935'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(px + Math.cos(forceAngle) * 35, py + Math.sin(forceAngle) * 35)
      ctx.stroke()
      ctx.fillStyle = '#E53935'
      ctx.beginPath()
      ctx.moveTo(px + Math.cos(forceAngle) * 35, py + Math.sin(forceAngle) * 35)
      ctx.lineTo(px + Math.cos(forceAngle - 0.3) * 27, py + Math.sin(forceAngle - 0.3) * 27)
      ctx.lineTo(px + Math.cos(forceAngle + 0.3) * 27, py + Math.sin(forceAngle + 0.3) * 27)
      ctx.fill()

      // 粒子
      ctx.fillStyle = q > 0 ? '#E53935' : '#1565C0'
      ctx.beginPath()
      ctx.arc(px, py, 8, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 10px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(q > 0 ? '+' : '−', px, py)

      // 标注
      ctx.fillStyle = '#333'
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'

      // 标注 r
      ctx.strokeStyle = '#666'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(px, py)
      ctx.stroke()
      ctx.fillStyle = '#1565C0'
      ctx.font = 'bold 12px sans-serif'
      ctx.fillText(`r = ${r.toExponential(2)} m`, (cx + px) / 2 + 10, (cy + py) / 2 - 10)

      // 标注
      ctx.fillStyle = '#4CAF50'
      ctx.fillText('v（速度）', px + Math.cos(tangentAngle) * 45, py + Math.sin(tangentAngle) * 45)
      ctx.fillStyle = '#E53935'
      ctx.fillText('F（洛伦兹力）', px + Math.cos(forceAngle) * 40 + 10, py + Math.sin(forceAngle) * 40)

      // 公式面板
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      ctx.fillRect(W - 260, 20, 240, 140)
      ctx.strokeStyle = '#ccc'
      ctx.strokeRect(W - 260, 20, 240, 140)
      ctx.fillStyle = '#333'
      ctx.font = 'bold 14px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('洛伦兹力', W - 248, 42)
      ctx.font = '13px sans-serif'
      ctx.fillStyle = '#1565C0'
      ctx.fillText('F = qvB', W - 248, 62)
      ctx.fillStyle = '#333'
      ctx.font = '12px sans-serif'
      ctx.fillText('圆周运动: F = mv²/r', W - 248, 82)
      ctx.fillText(`r = mv/qB = ${r.toExponential(2)} m`, W - 248, 100)
      ctx.fillText(`T = 2πm/qB = ${T.toExponential(2)} s`, W - 248, 118)
      ctx.fillText(`f = qB/2πm = ${f.toExponential(2)} Hz`, W - 248, 136)
      ctx.fillStyle = '#666'
      ctx.fillText('左手定则: 四指→v, 磁感线穿手心, 拇指→F', W - 248, 155)

      S.current.raf = requestAnimationFrame(loop)
    }
    S.current.raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(S.current.raf)
  }, [B, v, q, mass, r, T, f])

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>洛伦兹力与带电粒子偏转</span>
        <div style={styles.topActions}>
          <button style={styles.setBtn} onClick={() => { setB(1); setV(1e6); setQ(1); setMass(1) }}>⚙ 重置</button>
        </div>
      </div>
      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>磁感应强度 B</span>
          <input type="range" min="0.1" max="5" step="0.1" value={B} onChange={e => setB(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{B.toFixed(1)} T</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>速度 v</span>
          <input type="range" min="5" max="20" step="1" value={v / 1e5} onChange={e => setV(+e.target.value * 1e5)} style={styles.slider} />
          <span style={styles.sliderVal}>{(v / 1e6).toFixed(1)}×10⁶ m/s</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>电荷 q</span>
          <input type="range" min="1" max="10" step="1" value={q} onChange={e => setQ(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{q}e</span>
        </label>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      </div>
      <div style={styles.desc}>
        <b>实验：洛伦兹力</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          带电粒子垂直进入匀强磁场做匀速圆周运动。F=qvB提供向心力，r=mv/qB。
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
  sliderVal: { color: '#4A90D9', fontWeight: 600, fontSize: 12, minWidth: 65 },
  setBtn: { background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
  main: { flex: 1, minHeight: 0, background: '#fff' },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
}
