import { useState, useRef, useEffect } from 'react'

/**
 * ElectricMotorScene — 电动机原理
 * 通电线圈在磁场中转动，换向器
 */
export default function ElectricMotorScene() {
  const [current, setCurrent] = useState(3)
  const [playing, setPlaying] = useState(true)
  const canvasRef = useRef(null)
  const S = useRef({ angle: 0, raf: null, last: 0 })

  useEffect(() => {
    const cvs = canvasRef.current
    if (!cvs) return
    const ctx = cvs.getContext('2d')

    const loop = (ts) => {
      const dt = Math.min((ts - (S.current.last || ts)) / 1000, 0.05)
      S.current.last = ts
      if (playing) S.current.angle += current * 2 * dt

      const W = cvs.clientWidth, H = cvs.clientHeight
      cvs.width = W * devicePixelRatio; cvs.height = H * devicePixelRatio
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      ctx.clearRect(0, 0, W, H)

      const cx = W / 2, cy = H / 2
      const angle = S.current.angle

      // 磁铁 N/S
      ctx.fillStyle = '#E53935'
      ctx.fillRect(cx - 160, cy - 100, 40, 200)
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 18px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('N', cx - 140, cy)

      ctx.fillStyle = '#1565C0'
      ctx.fillRect(cx + 120, cy - 100, 40, 200)
      ctx.fillStyle = '#fff'
      ctx.fillText('S', cx + 140, cy)

      // 磁感线
      ctx.strokeStyle = 'rgba(100,100,100,0.2)'
      ctx.lineWidth = 1
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath()
        ctx.moveTo(cx - 120, cy + i * 30)
        ctx.lineTo(cx + 120, cy + i * 30)
        ctx.stroke()
        // 箭头
        ctx.fillStyle = 'rgba(100,100,100,0.3)'
        ctx.beginPath()
        ctx.moveTo(cx + 120, cy + i * 30)
        ctx.lineTo(cx + 112, cy + i * 30 - 4)
        ctx.lineTo(cx + 112, cy + i * 30 + 4)
        ctx.fill()
      }

      // 线圈
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(angle)

      // 线圈框
      ctx.strokeStyle = '#E65100'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(-20, -60)
      ctx.lineTo(-20, 60)
      ctx.moveTo(20, -60)
      ctx.lineTo(20, 60)
      ctx.stroke()

      // 上下横边
      ctx.strokeStyle = '#BF360C'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(-20, -60)
      ctx.lineTo(20, -60)
      ctx.moveTo(-20, 60)
      ctx.lineTo(20, 60)
      ctx.stroke()

      // 电流方向标注
      ctx.fillStyle = '#E53935'
      ctx.font = 'bold 14px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('⊙', 0, -50) // 上边电流出来
      ctx.fillText('⊗', 0, 50)  // 下边电流进去

      // 转轴
      ctx.fillStyle = '#666'
      ctx.beginPath()
      ctx.arc(0, 0, 5, 0, Math.PI * 2)
      ctx.fill()

      // 换向器（半圆环）
      ctx.strokeStyle = '#888'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(0, 0, 15, 0, Math.PI)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, 0, 15, Math.PI, Math.PI * 2)
      ctx.stroke()

      // 电刷
      ctx.fillStyle = '#333'
      ctx.fillRect(-3, -75, 6, 12)
      ctx.fillRect(-3, 63, 6, 12)

      ctx.restore()

      // 力的方向标注
      ctx.fillStyle = '#4CAF50'
      ctx.font = 'bold 13px sans-serif'
      ctx.textAlign = 'center'
      const fx = Math.cos(angle) * 60
      const fy = Math.sin(angle) * 60
      ctx.fillText('F（安培力）', cx + fx + 30, cy + fy - 10)

      // 信息
      ctx.fillStyle = '#333'
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(`电流: ${current.toFixed(1)} A`, 20, H - 60)
      ctx.fillText(`转速: ${(current * 2 / (2 * Math.PI) * 60).toFixed(0)} rpm`, 20, H - 40)
      ctx.fillText(`换向器每半周改变电流方向，维持持续转动`, 20, H - 20)

      S.current.raf = requestAnimationFrame(loop)
    }
    S.current.raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(S.current.raf)
  }, [current, playing])

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>电动机原理</span>
        <div style={styles.topActions}>
          <button style={{ ...styles.setBtn, background: playing ? '#E53935' : '#4CAF50' }} onClick={() => setPlaying(p => !p)}>{playing ? '⏸ 暂停' : '▶ 播放'}</button>
          <button style={styles.setBtn} onClick={() => { S.current.angle = 0; setCurrent(3) }}>⚙ 重置</button>
        </div>
      </div>
      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>电流 I</span>
          <input type="range" min="0.5" max="8" step="0.5" value={current} onChange={e => setCurrent(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{current.toFixed(1)} A</span>
        </label>
        <span style={{ fontSize: 12, color: '#555', marginLeft: 16 }}>
          电流越大，转速越快。换向器改变电流方向维持持续转动。
        </span>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      </div>
      <div style={styles.desc}>
        <b>实验：电动机原理</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          通电线圈在磁场中受安培力作用转动。换向器每半周改变电流方向，使线圈持续旋转。
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
