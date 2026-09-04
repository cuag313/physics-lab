import { useState, useRef, useEffect } from 'react'

/**
 * MeterConversionScene — 电表改装与校准
 * 电流表改装为电压表/大量程电流表
 */
export default function MeterConversionScene() {
  const [Ig, setIg] = useState(100) // μA 满偏电流
  const [Rg, setRg] = useState(500) // Ω 表头内阻
  const [targetV, setTargetV] = useState(3) // V 目标电压表量程
  const canvasRef = useRef(null)

  // 电压表：串联分压电阻 R = V/Ig - Rg
  const Rs_volt = targetV / (Ig * 1e-6) - Rg
  // 电流表量程10倍：并联分流电阻 R = Ig*Rg / (10*Ig - Ig) = Rg/9
  const n = 10
  const Rs_amp = Rg * Ig / ((n - 1) * Ig)

  useEffect(() => {
    const cvs = canvasRef.current
    if (!cvs) return
    const ctx = cvs.getContext('2d')
    const draw = () => {
      const W = cvs.clientWidth, H = cvs.clientHeight
      cvs.width = W * devicePixelRatio; cvs.height = H * devicePixelRatio
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      ctx.clearRect(0, 0, W, H)

      // 左侧：原始表头
      const leftX = 80, leftY = H / 2
      ctx.fillStyle = '#F5F5F5'
      ctx.strokeStyle = '#666'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(leftX, leftY, 50, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#333'
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('表头', leftX, leftY - 20)
      ctx.font = '11px sans-serif'
      ctx.fillText(`Ig = ${Ig}μA`, leftX, leftY)
      ctx.fillText(`Rg = ${Rg}Ω`, leftX, leftY + 16)

      // 右侧：改装电压表
      const rightX = W / 2 + 40, rightY = H / 2 - 80
      // 表头
      ctx.fillStyle = '#E3F2FD'
      ctx.strokeStyle = '#1565C0'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(rightX, rightY, 35, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#1565C0'
      ctx.font = 'bold 11px sans-serif'
      ctx.fillText('V', rightX, rightY - 10)
      ctx.font = '10px sans-serif'
      ctx.fillText(`${targetV}V`, rightX, rightY + 8)
      // 串联电阻
      ctx.fillStyle = '#FFECB3'
      ctx.strokeStyle = '#FF9800'
      ctx.fillRect(rightX - 15, rightY + 45, 30, 60)
      ctx.strokeRect(rightX - 15, rightY + 45, 30, 60)
      ctx.fillStyle = '#333'
      ctx.font = '10px sans-serif'
      ctx.fillText(`Rs`, rightX, rightY + 72)
      ctx.fillText(`${Rs_volt > 0 ? Rs_volt.toFixed(0) : '∞'}Ω`, rightX, rightY + 88)
      // 连线
      ctx.strokeStyle = '#666'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(rightX, rightY + 35)
      ctx.lineTo(rightX, rightY + 45)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(rightX, rightY + 105)
      ctx.lineTo(rightX, rightY + 140)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(rightX, rightY - 35)
      ctx.lineTo(rightX, rightY - 60)
      ctx.stroke()
      // 标签
      ctx.fillStyle = '#1565C0'
      ctx.font = 'bold 12px sans-serif'
      ctx.fillText('改装电压表（串联分压）', rightX, rightY - 70)
      ctx.fillStyle = '#555'
      ctx.font = '11px sans-serif'
      ctx.fillText(`R = V/Ig - Rg = ${Rs_volt > 0 ? Rs_volt.toFixed(0) : '∞'} Ω`, rightX, rightY + 130)

      // 右侧下方：改装电流表
      const rightX2 = W / 2 + 40, rightY2 = H / 2 + 100
      // 表头
      ctx.fillStyle = '#FFF3E0'
      ctx.strokeStyle = '#FF9800'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(rightX2, rightY2, 35, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#FF9800'
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('A', rightX2, rightY2 - 10)
      ctx.font = '10px sans-serif'
      ctx.fillText(`${n * Ig / 1000}mA`, rightX2, rightY2 + 8)
      // 并联电阻
      ctx.fillStyle = '#C8E6C9'
      ctx.strokeStyle = '#4CAF50'
      ctx.fillRect(rightX2 + 45, rightY2 - 15, 50, 30)
      ctx.strokeRect(rightX2 + 45, rightY2 - 15, 50, 30)
      ctx.fillStyle = '#333'
      ctx.font = '10px sans-serif'
      ctx.fillText(`Rs=${Rs_amp.toFixed(1)}Ω`, rightX2 + 70, rightY2 + 4)
      // 并联连线
      ctx.strokeStyle = '#666'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(rightX2 + 35, rightY2 - 10)
      ctx.lineTo(rightX2 + 45, rightY2 - 10)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(rightX2 + 35, rightY2 + 10)
      ctx.lineTo(rightX2 + 45, rightY2 + 10)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(rightX2 + 95, rightY2 - 10)
      ctx.lineTo(rightX2 + 110, rightY2 - 10)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(rightX2 + 95, rightY2 + 10)
      ctx.lineTo(rightX2 + 110, rightY2 + 10)
      ctx.stroke()

      ctx.fillStyle = '#FF9800'
      ctx.font = 'bold 12px sans-serif'
      ctx.fillText('改装电流表（并联分流）', rightX2, rightY2 - 30)
      ctx.fillStyle = '#555'
      ctx.font = '11px sans-serif'
      ctx.fillText(`R = Ig·Rg/(I-Ig) = ${Rs_amp.toFixed(1)} Ω`, rightX2, rightY2 + 45)

      // 公式面板
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      ctx.fillRect(20, 20, 230, 80)
      ctx.strokeStyle = '#ccc'
      ctx.strokeRect(20, 20, 230, 80)
      ctx.fillStyle = '#333'
      ctx.font = 'bold 13px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('电表改装原理', 32, 40)
      ctx.font = '12px sans-serif'
      ctx.fillStyle = '#1565C0'
      ctx.fillText('电压表: 串联大电阻分压', 32, 58)
      ctx.fillStyle = '#FF9800'
      ctx.fillText('电流表: 并联小电阻分流', 32, 76)
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(cvs)
    return () => ro.disconnect()
  }, [Ig, Rg, targetV, Rs_volt, Rs_amp, n])

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>电表改装与校准</span>
        <div style={styles.topActions}>
          <button style={styles.setBtn} onClick={() => { setIg(100); setRg(500); setTargetV(3) }}>⚙ 重置</button>
        </div>
      </div>
      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>满偏电流 Ig</span>
          <input type="range" min="10" max="500" step="10" value={Ig} onChange={e => setIg(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{Ig} μA</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>内阻 Rg</span>
          <input type="range" min="50" max="2000" step="50" value={Rg} onChange={e => setRg(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{Rg} Ω</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>电压量程</span>
          <input type="range" min="1" max="15" step="0.5" value={targetV} onChange={e => setTargetV(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{targetV} V</span>
        </label>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      </div>
      <div style={styles.desc}>
        <b>实验：电表改装</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          调节表头参数，观察分压/分流电阻变化。电压表串联大电阻，电流表并联小电阻。
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
