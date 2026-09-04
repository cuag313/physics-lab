import { useState, useRef, useEffect } from 'react'

/**
 * ElectricEnergyScene — 电功与电能表
 * 认识电能表、计算电费、W=UIt
 */
export default function ElectricEnergyScene() {
  const [voltage, setVoltage] = useState(220)
  const [current, setCurrent] = useState(2)
  const [time, setTime] = useState(1)
  const [price, setPrice] = useState(0.56)
  const canvasRef = useRef(null)

  const power = voltage * current
  const energy = power * time / 1000 // kWh
  const cost = energy * price

  useEffect(() => {
    const cvs = canvasRef.current
    if (!cvs) return
    const ctx = cvs.getContext('2d')
    const draw = () => {
      const W = cvs.clientWidth, H = cvs.clientHeight
      cvs.width = W * devicePixelRatio; cvs.height = H * devicePixelRatio
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      ctx.clearRect(0, 0, W, H)

      // 电能表外观
      const cx = W / 2, cy = H / 2 - 20
      ctx.fillStyle = '#F5F5F5'
      ctx.strokeStyle = '#666'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.roundRect(cx - 120, cy - 80, 240, 180, 10)
      ctx.fill()
      ctx.stroke()

      // 表头
      ctx.fillStyle = '#1565C0'
      ctx.fillRect(cx - 118, cy - 78, 236, 30)
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 14px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('单相电能表 220V 5(20)A', cx, cy - 58)

      // 数字显示
      ctx.fillStyle = '#222'
      ctx.font = 'bold 28px monospace'
      const kwhStr = energy.toFixed(3).padStart(8, '0')
      ctx.fillText(kwhStr, cx + 10, cy - 10)
      ctx.font = '12px sans-serif'
      ctx.fillText('kWh', cx + 100, cy - 10)

      // 参数
      ctx.font = '13px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillStyle = '#333'
      ctx.fillText(`电压: ${voltage} V`, cx - 110, cy + 30)
      ctx.fillText(`电流: ${current.toFixed(1)} A`, cx - 110, cy + 50)
      ctx.fillText(`功率: ${power.toFixed(0)} W`, cx + 10, cy + 30)
      ctx.fillText(`时间: ${time.toFixed(1)} h`, cx + 10, cy + 50)

      // 转盘动画
      const angle = (Date.now() / 1000 * power / 500) % (Math.PI * 2)
      ctx.strokeStyle = '#888'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(cx, cy + 90, 15, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx, cy + 90)
      ctx.lineTo(cx + Math.cos(angle) * 12, cy + 90 + Math.sin(angle) * 12)
      ctx.strokeStyle = '#E53935'
      ctx.stroke()

      ctx.fillStyle = '#333'
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('转盘', cx, cy + 115)

      // 费用面板
      const py = cy + 140
      ctx.fillStyle = '#E8F5E9'
      ctx.strokeStyle = '#4CAF50'
      ctx.lineWidth = 1
      ctx.fillRect(cx - 100, py, 200, 50)
      ctx.strokeRect(cx - 100, py, 200, 50)
      ctx.fillStyle = '#2E7D32'
      ctx.font = 'bold 16px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(`电费: ¥${cost.toFixed(2)} (${energy.toFixed(2)} kWh × ¥${price}/kWh)`, cx, py + 30)
    }
    draw()
    const id = setInterval(draw, 100)
    return () => clearInterval(id)
  }, [voltage, current, time, price, power, energy, cost])

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>电功与电能表</span>
        <div style={styles.topActions}>
          <button style={styles.setBtn} onClick={() => { setVoltage(220); setCurrent(2); setTime(1); setPrice(0.56) }}>⚙ 重置</button>
        </div>
      </div>
      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>电压 U</span>
          <input type="range" min="110" max="380" step="10" value={voltage} onChange={e => setVoltage(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{voltage} V</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>电流 I</span>
          <input type="range" min="0.1" max="10" step="0.1" value={current} onChange={e => setCurrent(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{current.toFixed(1)} A</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>时间 t</span>
          <input type="range" min="0.1" max="24" step="0.1" value={time} onChange={e => setTime(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{time.toFixed(1)} h</span>
        </label>
        <span style={{ fontSize: 12, color: '#E53935', fontWeight: 600, marginLeft: 'auto' }}>P={power.toFixed(0)}W</span>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      </div>
      <div style={styles.desc}>
        <b>实验：电功与电能表</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          调节电压、电流、时间，观察电能表读数和电费变化。W=UIt，P=UI。
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
  sliderVal: { color: '#4A90D9', fontWeight: 600, fontSize: 12, minWidth: 50 },
  setBtn: { background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
  main: { flex: 1, minHeight: 0, background: '#fff' },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
}
