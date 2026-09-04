import { useState, useRef, useEffect } from 'react'

/**
 * CapacitorChargeScene — 电容器充放电
 * 充电/放电电流变化，C=Q/U，RC时间常数
 */
export default function CapacitorChargeScene() {
  const [capacitance, setCapacitance] = useState(100) // μF
  const [resistance, setResistance] = useState(10) // kΩ
  const [voltage, setVoltage] = useState(12) // V
  const [mode, setMode] = useState('charge') // charge | discharge
  const canvasRef = useRef(null)
  const S = useRef({ t: 0, raf: null, last: 0, data: [] })

  const RC = capacitance * 1e-6 * resistance * 1e3 // 秒

  useEffect(() => {
    S.current.t = 0
    S.current.data = []
  }, [mode, capacitance, resistance, voltage])

  useEffect(() => {
    const cvs = canvasRef.current
    if (!cvs) return
    const ctx = cvs.getContext('2d')

    const loop = (ts) => {
      const dt = Math.min((ts - (S.current.last || ts)) / 1000, 0.05)
      S.current.last = ts
      S.current.t += dt

      const W = cvs.clientWidth, H = cvs.clientHeight
      cvs.width = W * devicePixelRatio; cvs.height = H * devicePixelRatio
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      ctx.clearRect(0, 0, W, H)

      const t = S.current.t
      const tau = RC

      // 计算当前值
      let currentI, voltageU, chargeQ
      if (mode === 'charge') {
        currentI = (voltage / resistance / 1000) * Math.exp(-t / tau) * 1000 // mA
        voltageU = voltage * (1 - Math.exp(-t / tau))
        chargeQ = capacitance * voltage * (1 - Math.exp(-t / tau)) / 1000 // mC
      } else {
        currentI = -(voltage / resistance / 1000) * Math.exp(-t / tau) * 1000 // mA
        voltageU = voltage * Math.exp(-t / tau)
        chargeQ = capacitance * voltage * Math.exp(-t / tau) / 1000
      }

      // 记录数据
      if (S.current.data.length < 600) {
        S.current.data.push({ t, I: currentI, U: voltageU, Q: chargeQ })
      }

      // 绘制电路图（左上）
      const circuitX = 30, circuitY = 30
      ctx.strokeStyle = '#666'
      ctx.lineWidth = 2
      // 电池
      ctx.fillStyle = '#4CAF50'
      ctx.fillRect(circuitX, circuitY + 30, 12, 40)
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 10px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('+', circuitX + 6, circuitY + 25)
      ctx.fillText('−', circuitX + 6, circuitY + 80)
      // 导线
      ctx.beginPath()
      ctx.moveTo(circuitX + 6, circuitY + 30)
      ctx.lineTo(circuitX + 6, circuitY + 10)
      ctx.lineTo(circuitX + 80, circuitY + 10)
      ctx.stroke()
      // 电阻
      ctx.strokeStyle = '#FF9800'
      ctx.lineWidth = 2
      ctx.strokeRect(circuitX + 80, circuitY + 2, 40, 16)
      ctx.fillStyle = '#333'
      ctx.font = '10px sans-serif'
      ctx.fillText('R', circuitX + 100, circuitY + 14)
      // 开关
      ctx.strokeStyle = '#666'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(circuitX + 120, circuitY + 10)
      ctx.lineTo(circuitX + 150, circuitY - 5)
      ctx.stroke()
      // 电容
      ctx.strokeStyle = '#1565C0'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(circuitX + 150, circuitY + 10)
      ctx.lineTo(circuitX + 150, circuitY + 50)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(circuitX + 140, circuitY + 50)
      ctx.lineTo(circuitX + 160, circuitY + 50)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(circuitX + 140, circuitY + 56)
      ctx.lineTo(circuitX + 160, circuitY + 56)
      ctx.stroke()
      // 回路
      ctx.strokeStyle = '#666'
      ctx.beginPath()
      ctx.moveTo(circuitX + 150, circuitY + 56)
      ctx.lineTo(circuitX + 150, circuitY + 70)
      ctx.lineTo(circuitX + 6, circuitY + 70)
      ctx.lineTo(circuitX + 6, circuitY + 70)
      ctx.stroke()
      ctx.fillStyle = '#333'
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('C', circuitX + 162, circuitY + 55)

      // 曲线图区域
      const graphX = 250, graphY = 30, graphW = W - 280, graphH = H - 100
      if (graphW > 100) {
        // 坐标轴
        ctx.strokeStyle = '#999'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(graphX, graphY)
        ctx.lineTo(graphX, graphY + graphH)
        ctx.lineTo(graphX + graphW, graphY + graphH)
        ctx.stroke()

        // I-t 曲线（蓝色）
        const maxI = voltage / resistance / 1000 * 1000
        const maxT = tau * 5
        ctx.strokeStyle = '#1565C0'
        ctx.lineWidth = 2
        ctx.beginPath()
        S.current.data.forEach((d, i) => {
          const x = graphX + (d.t / maxT) * graphW
          const y = graphY + graphH - (Math.abs(d.I) / maxI) * graphH
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        })
        ctx.stroke()
        ctx.fillStyle = '#1565C0'
        ctx.font = '12px sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText('I(t) — 电流', graphX + 10, graphY + 15)

        // U-t 曲线（红色）
        ctx.strokeStyle = '#E53935'
        ctx.lineWidth = 2
        ctx.beginPath()
        S.current.data.forEach((d, i) => {
          const x = graphX + (d.t / maxT) * graphW
          const y = graphY + graphH - (d.U / voltage) * graphH
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        })
        ctx.stroke()
        ctx.fillStyle = '#E53935'
        ctx.fillText('U(t) — 电压', graphX + 10, graphY + 32)

        // 标注
        ctx.fillStyle = '#333'
        ctx.font = '11px sans-serif'
        ctx.fillText(`τ = RC = ${(tau * 1000).toFixed(0)} ms`, graphX + graphW - 150, graphY + 15)
        ctx.fillText(`t = ${(t * 1000).toFixed(0)} ms`, graphX + graphW - 150, graphY + 32)
      }

      // 实时数据
      ctx.fillStyle = '#333'
      ctx.font = 'bold 14px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(`I = ${Math.abs(currentI).toFixed(2)} mA`, 30, H - 40)
      ctx.fillText(`U_C = ${voltageU.toFixed(2)} V`, 180, H - 40)
      ctx.fillText(`Q = ${chargeQ.toFixed(2)} mC`, 340, H - 40)
      ctx.fillStyle = '#666'
      ctx.font = '12px sans-serif'
      ctx.fillText(`C = ${capacitance}μF, R = ${resistance}kΩ, τ = ${(tau * 1000).toFixed(0)}ms`, 30, H - 18)

      S.current.raf = requestAnimationFrame(loop)
    }
    S.current.raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(S.current.raf)
  }, [mode, capacitance, resistance, voltage, RC])

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>电容器充放电</span>
        <div style={styles.topActions}>
          <button style={{ ...styles.setBtn, background: mode === 'charge' ? '#E53935' : '#7B1FA2' }} onClick={() => setMode('charge')}>充电</button>
          <button style={{ ...styles.setBtn, background: mode === 'discharge' ? '#E53935' : '#7B1FA2' }} onClick={() => setMode('discharge')}>放电</button>
          <button style={styles.setBtn} onClick={() => { S.current.t = 0; S.current.data = [] }}>重置</button>
        </div>
      </div>
      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>电容 C</span>
          <input type="range" min="10" max="1000" step="10" value={capacitance} onChange={e => setCapacitance(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{capacitance} μF</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>电阻 R</span>
          <input type="range" min="1" max="100" step="1" value={resistance} onChange={e => setResistance(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{resistance} kΩ</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>电压 U</span>
          <input type="range" min="1" max="24" step="1" value={voltage} onChange={e => setVoltage(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{voltage} V</span>
        </label>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      </div>
      <div style={styles.desc}>
        <b>实验：电容器充放电</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          观察充放电过程中电流和电压随时间变化。τ=RC为时间常数，约5τ达到稳态。
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
