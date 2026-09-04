import { useState, useRef, useEffect } from 'react'

/**
 * OstersExperimentScene — 电生磁（奥斯特实验）
 * 通电导线周围产生磁场，安培定则
 */
export default function OstersExperimentScene() {
  const [current, setCurrent] = useState(3)
  const [direction, setDirection] = useState(1) // 1=正向, -1=反向
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

      const cx = W / 2, cy = H / 2

      // 导线（垂直穿过纸面）
      ctx.fillStyle = '#888'
      ctx.beginPath()
      ctx.arc(cx, cy, 8, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = direction > 0 ? '#E53935' : '#1565C0'
      ctx.font = 'bold 20px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(direction > 0 ? '⊙' : '⊗', cx, cy)

      // 磁感线（同心圆）
      const maxR = Math.min(W, H) / 2 - 40
      const numCircles = Math.floor(3 + current * 1.5)
      for (let i = 1; i <= numCircles; i++) {
        const r = 30 + i * (maxR - 30) / numCircles
        ctx.strokeStyle = `rgba(33,150,243,${0.3 + 0.4 * (1 - i / numCircles)})`
        ctx.lineWidth = 1.5 + current * 0.3
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.stroke()

        // 箭头方向
        const arrowCount = 2
        for (let a = 0; a < arrowCount; a++) {
          const angle = (a / arrowCount) * Math.PI * 2 + (direction > 0 ? 0.1 : -0.1)
          const ax = cx + Math.cos(angle) * r
          const ay = cy + Math.sin(angle) * r
          const tangent = direction > 0 ? angle + Math.PI / 2 : angle - Math.PI / 2
          ctx.fillStyle = '#1565C0'
          ctx.beginPath()
          ctx.moveTo(ax + Math.cos(tangent) * 6, ay + Math.sin(tangent) * 6)
          ctx.lineTo(ax + Math.cos(tangent + 2.5) * 4, ay + Math.sin(tangent + 2.5) * 4)
          ctx.lineTo(ax + Math.cos(tangent - 2.5) * 4, ay + Math.sin(tangent - 2.5) * 4)
          ctx.fill()
        }
      }

      // 小磁针
      const needleR = 80
      for (let a = 0; a < 8; a++) {
        const angle = a * Math.PI / 4
        const nx = cx + Math.cos(angle) * needleR
        const ny = cy + Math.sin(angle) * needleR
        const needleAngle = direction > 0 ? angle + Math.PI / 2 : angle - Math.PI / 2
        // N极（红）
        ctx.strokeStyle = '#E53935'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(nx, ny)
        ctx.lineTo(nx + Math.cos(needleAngle) * 12, ny + Math.sin(needleAngle) * 12)
        ctx.stroke()
        // S极（蓝）
        ctx.strokeStyle = '#1565C0'
        ctx.beginPath()
        ctx.moveTo(nx, ny)
        ctx.lineTo(nx - Math.cos(needleAngle) * 12, ny - Math.sin(needleAngle) * 12)
        ctx.stroke()
        // 中心点
        ctx.fillStyle = '#333'
        ctx.beginPath()
        ctx.arc(nx, ny, 2, 0, Math.PI * 2)
        ctx.fill()
      }

      // 标注
      ctx.fillStyle = '#333'
      ctx.font = 'bold 13px sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(`电流 I = ${current.toFixed(1)} A ${direction > 0 ? '(向上)' : '(向下)'}`, 20, 20)
      ctx.fillText(`安培定则（右手螺旋定则）:`, 20, 42)
      ctx.font = '12px sans-serif'
      ctx.fillStyle = '#555'
      ctx.fillText(`右手握住导线，拇指指向电流方向`, 20, 62)
      ctx.fillText(`四指弯曲方向即为磁感线方向`, 20, 80)
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(cvs)
    return () => ro.disconnect()
  }, [current, direction])

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>电生磁（奥斯特实验）</span>
        <div style={styles.topActions}>
          <button style={styles.setBtn} onClick={() => setDirection(d => -d)}>反转电流</button>
          <button style={styles.setBtn} onClick={() => { setCurrent(3); setDirection(1) }}>⚙ 重置</button>
        </div>
      </div>
      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>电流 I</span>
          <input type="range" min="0.5" max="8" step="0.5" value={current} onChange={e => setCurrent(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{current.toFixed(1)} A</span>
        </label>
        <span style={{ fontSize: 12, color: '#555', marginLeft: 16 }}>
          电流越大，磁场越强（磁感线越密）
        </span>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      </div>
      <div style={styles.desc}>
        <b>实验：奥斯特实验</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          通电导线周围产生环形磁场。调节电流大小，观察磁感线密度变化。反转电流观察磁场方向改变。
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
  sliderVal: { color: '#4A90D9', fontWeight: 600, fontSize: 12, minWidth: 50 },
  setBtn: { background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
  main: { flex: 1, minHeight: 0, background: '#fff' },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
}
