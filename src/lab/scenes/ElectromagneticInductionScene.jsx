import { useState, useRef, useEffect } from 'react'

/**
 * ElectromagneticInductionScene — 电磁感应（法拉第实验）
 * 导体切割磁感线产生感应电流
 */
export default function ElectromagneticInductionScene() {
  const [speed, setSpeed] = useState(2)
  const [direction, setDirection] = useState(1)
  const canvasRef = useRef(null)
  const S = useRef({ x: 200, raf: null, last: 0 })

  useEffect(() => {
    const cvs = canvasRef.current
    if (!cvs) return
    const ctx = cvs.getContext('2d')

    const loop = (ts) => {
      const dt = Math.min((ts - (S.current.last || ts)) / 1000, 0.05)
      S.current.last = ts

      const W = cvs.clientWidth, H = cvs.clientHeight
      cvs.width = W * devicePixelRatio; cvs.height = H * devicePixelRatio
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      ctx.clearRect(0, 0, W, H)

      const cx = W / 2, cy = H / 2

      // 磁场区域
      ctx.fillStyle = '#E3F2FD'
      ctx.fillRect(cx - 150, cy - 120, 300, 240)

      // N/S 磁极
      ctx.fillStyle = '#E53935'
      ctx.fillRect(cx - 150, cy - 120, 300, 30)
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 16px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('N', cx, cy - 100)

      ctx.fillStyle = '#1565C0'
      ctx.fillRect(cx - 150, cy + 90, 300, 30)
      ctx.fillStyle = '#fff'
      ctx.fillText('S', cx, cy + 108)

      // 磁感线
      ctx.strokeStyle = 'rgba(33,150,243,0.3)'
      ctx.lineWidth = 1.5
      for (let i = -3; i <= 3; i++) {
        const y = cy + i * 25
        ctx.beginPath()
        ctx.moveTo(cx - 140, y)
        ctx.lineTo(cx + 140, y)
        ctx.stroke()
        // 箭头
        ctx.fillStyle = 'rgba(33,150,243,0.4)'
        ctx.beginPath()
        ctx.moveTo(cx + 140, y)
        ctx.lineTo(cx + 132, y - 4)
        ctx.lineTo(cx + 132, y + 4)
        ctx.fill()
      }

      // 导体棒位置（在磁场内左右移动）
      const barX = cx - 100 + S.current.x
      ctx.strokeStyle = '#333'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(barX, cy - 80)
      ctx.lineTo(barX, cy + 80)
      ctx.stroke()

      // 导体棒两端
      ctx.fillStyle = '#FF9800'
      ctx.beginPath()
      ctx.arc(barX, cy - 80, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(barX, cy + 80, 6, 0, Math.PI * 2)
      ctx.fill()

      // 导轨
      ctx.strokeStyle = '#888'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(cx - 130, cy - 80)
      ctx.lineTo(cx + 130, cy - 80)
      ctx.moveTo(cx - 130, cy + 80)
      ctx.lineTo(cx + 130, cy + 80)
      ctx.stroke()

      // 感应电流方向（右手定则）
      const inField = barX > cx - 140 && barX < cx + 140
      if (inField && speed > 0) {
        ctx.fillStyle = '#4CAF50'
        ctx.font = 'bold 12px sans-serif'
        ctx.textAlign = 'center'
        const currentDir = direction > 0 ? '↑' : '↓'
        ctx.fillText(`I ${currentDir}`, barX + 25, cy)

        // 电流箭头
        ctx.strokeStyle = '#4CAF50'
        ctx.lineWidth = 2
        const arrowDir = direction > 0 ? -1 : 1
        ctx.beginPath()
        ctx.moveTo(barX + 25, cy + arrowDir * 20)
        ctx.lineTo(barX + 25, cy - arrowDir * 20)
        ctx.stroke()
      }

      // 电压表
      const voltmeter = { x: cx + 200, y: cy }
      ctx.fillStyle = '#F5F5F5'
      ctx.strokeStyle = '#666'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(voltmeter.x, voltmeter.y, 40, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#333'
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('V', voltmeter.x, voltmeter.y - 10)
      ctx.font = 'bold 14px monospace'
      const emf = inField ? (speed * 0.5 * direction).toFixed(2) : '0.00'
      ctx.fillText(emf, voltmeter.x, voltmeter.y + 15)

      // 连线
      ctx.strokeStyle = '#888'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.moveTo(barX, cy - 80)
      ctx.lineTo(voltmeter.x, voltmeter.y - 40)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(barX, cy + 80)
      ctx.lineTo(voltmeter.x, voltmeter.y + 40)
      ctx.stroke()
      ctx.setLineDash([])

      // 标注
      ctx.fillStyle = '#333'
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(`速度: ${(speed * direction).toFixed(1)} m/s`, 20, 30)
      ctx.fillText(`感应电动势 ε = BLv`, 20, 50)
      ctx.fillText(`右手定则: 拇指→运动方向，四指→电流方向`, 20, 70)

      // 动画
      S.current.x += speed * direction * 60 * dt
      if (S.current.x > 200) S.current.x = 200
      if (S.current.x < -200) S.current.x = -200

      S.current.raf = requestAnimationFrame(loop)
    }
    S.current.raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(S.current.raf)
  }, [speed, direction])

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>电磁感应（法拉第实验）</span>
        <div style={styles.topActions}>
          <button style={styles.setBtn} onClick={() => setDirection(d => -d)}>反转运动</button>
          <button style={styles.setBtn} onClick={() => { S.current.x = 200; setSpeed(2); setDirection(1) }}>⚙ 重置</button>
        </div>
      </div>
      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>速度 v</span>
          <input type="range" min="0" max="5" step="0.5" value={speed} onChange={e => setSpeed(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{speed.toFixed(1)} m/s</span>
        </label>
        <span style={{ fontSize: 12, color: '#555', marginLeft: 16 }}>
          导体棒切割磁感线 → 产生感应电流 ε = BLv
        </span>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      </div>
      <div style={styles.desc}>
        <b>实验：法拉第电磁感应</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          导体棒在磁场中切割磁感线运动，产生感应电动势。调节速度和方向，观察电压表读数变化。
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
