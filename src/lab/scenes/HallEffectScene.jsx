import { useState, useRef, useEffect } from 'react'

/**
 * HallEffectScene — 霍尔效应
 * UH = IB/nqd
 */
export default function HallEffectScene() {
  const [current, setCurrent] = useState(1) // A
  const [B, setB] = useState(0.5) // T
  const [thickness, setThickness] = useState(1) // mm
  const [carrier, setCarrier] = useState(1) // 载流子浓度 10^22 /cm³
  const canvasRef = useRef(null)

  const q = 1.6e-19
  const n = carrier * 1e28 // /m³
  const d = thickness * 1e-3 // m
  const UH = B * current / (n * q * d) // V
  const UH_mV = UH * 1000

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

      // 霍尔元件（矩形薄片）
      const plateW = 200, plateH = 120, plateD = 20
      // 3D效果
      ctx.fillStyle = '#E3F2FD'
      ctx.strokeStyle = '#1565C0'
      ctx.lineWidth = 2
      // 正面
      ctx.fillRect(cx - plateW / 2, cy - plateH / 2, plateW, plateH)
      ctx.strokeRect(cx - plateW / 2, cy - plateH / 2, plateW, plateH)
      // 侧面（3D）
      ctx.fillStyle = '#BBDEFB'
      ctx.beginPath()
      ctx.moveTo(cx + plateW / 2, cy - plateH / 2)
      ctx.lineTo(cx + plateW / 2 + plateD, cy - plateH / 2 - plateD)
      ctx.lineTo(cx + plateW / 2 + plateD, cy + plateH / 2 - plateD)
      ctx.lineTo(cx + plateW / 2, cy + plateH / 2)
      ctx.fill()
      ctx.stroke()
      // 顶面
      ctx.fillStyle = '#90CAF9'
      ctx.beginPath()
      ctx.moveTo(cx - plateW / 2, cy - plateH / 2)
      ctx.lineTo(cx - plateW / 2 + plateD, cy - plateH / 2 - plateD)
      ctx.lineTo(cx + plateW / 2 + plateD, cy - plateH / 2 - plateD)
      ctx.lineTo(cx + plateW / 2, cy - plateH / 2)
      ctx.fill()
      ctx.stroke()

      // 电流方向（→ 向右）
      ctx.strokeStyle = '#4CAF50'
      ctx.fillStyle = '#4CAF50'
      ctx.lineWidth = 3
      const iy = cy
      ctx.beginPath()
      ctx.moveTo(cx - plateW / 2 - 40, iy)
      ctx.lineTo(cx + plateW / 2 + 20, iy)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx + plateW / 2 + 20, iy)
      ctx.lineTo(cx + plateW / 2 + 12, iy - 6)
      ctx.lineTo(cx + plateW / 2 + 12, iy + 6)
      ctx.fill()
      ctx.font = 'bold 13px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('I (电流)', cx - plateW / 2 - 60, iy + 5)

      // 磁场方向（⊗ 向纸内）
      ctx.fillStyle = '#9C27B0'
      ctx.font = 'bold 14px sans-serif'
      ctx.textAlign = 'center'
      for (let x = cx - plateW / 2 + 30; x < cx + plateW / 2; x += 40) {
        for (let y = cy - plateH / 2 + 25; y < cy + plateH / 2; y += 35) {
          ctx.fillText('⊗', x, y)
        }
      }
      ctx.fillText('B (向纸内)', cx, cy - plateH / 2 - 25)

      // 载流子偏转（正电荷向一侧积累）
      const hallDir = UH > 0 ? 1 : -1
      ctx.fillStyle = 'rgba(244,67,54,0.3)'
      if (hallDir > 0) {
        ctx.fillRect(cx + plateW / 2 - 30, cy - plateH / 2, 30, plateH)
      } else {
        ctx.fillRect(cx - plateW / 2, cy - plateH / 2, 30, plateH)
      }

      // 霍尔电压
      ctx.strokeStyle = '#E53935'
      ctx.lineWidth = 2
      const vhX1 = cx - plateW / 2 + 10
      const vhX2 = cx + plateW / 2 - 10
      const vhY = cy - plateH / 2 - 15
      ctx.beginPath()
      ctx.moveTo(vhX1, vhY)
      ctx.lineTo(vhX2, vhY)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(vhX1, vhY - 5)
      ctx.lineTo(vhX1, vhY + 5)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(vhX2, vhY - 5)
      ctx.lineTo(vhX2, vhY + 5)
      ctx.stroke()
      ctx.fillStyle = '#E53935'
      ctx.font = 'bold 14px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(`U_H = ${UH_mV.toFixed(3)} mV`, (vhX1 + vhX2) / 2, vhY - 10)

      // 载流子运动示意
      ctx.fillStyle = q > 0 ? '#E53935' : '#1565C0'
      const numCarriers = 8
      for (let i = 0; i < numCarriers; i++) {
        const cx2 = cx - plateW / 2 + 30 + i * (plateW - 60) / (numCarriers - 1)
        const cy2 = cy + (i % 2 === 0 ? -1 : 1) * 10
        ctx.beginPath()
        ctx.arc(cx2, cy2, 4, 0, Math.PI * 2)
        ctx.fill()
        // 偏转箭头
        ctx.strokeStyle = 'rgba(33,150,243,0.5)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(cx2, cy2)
        ctx.lineTo(cx2, cy2 + hallDir * 15)
        ctx.stroke()
      }

      // 公式面板
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      ctx.fillRect(20, 20, 260, 120)
      ctx.strokeStyle = '#ccc'
      ctx.strokeRect(20, 20, 260, 120)
      ctx.fillStyle = '#333'
      ctx.font = 'bold 14px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('霍尔效应', 32, 42)
      ctx.font = '13px sans-serif'
      ctx.fillStyle = '#1565C0'
      ctx.fillText('U_H = IB / nqd', 32, 62)
      ctx.fillStyle = '#333'
      ctx.font = '12px sans-serif'
      ctx.fillText(`n (载流子浓度) = ${carrier}×10²²/cm³`, 32, 82)
      ctx.fillText(`d (厚度) = ${thickness} mm`, 32, 100)
      ctx.fillText(`U_H = ${UH_mV.toFixed(3)} mV`, 32, 118)
      ctx.fillStyle = '#666'
      ctx.font = '11px sans-serif'
      ctx.fillText('正电荷↑积累，负电荷↓积累', 32, 136)

      // 底部说明
      ctx.fillStyle = '#333'
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(`霍尔电压方向由左手定则判定：四指→I，磁感线穿手心，拇指→洛伦兹力方向`, cx, H - 15)
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(cvs)
    return () => ro.disconnect()
  }, [current, B, thickness, carrier, UH, UH_mV, n, q, d])

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>霍尔效应</span>
        <div style={styles.topActions}>
          <button style={styles.setBtn} onClick={() => { setCurrent(1); setB(0.5); setThickness(1); setCarrier(1) }}>⚙ 重置</button>
        </div>
      </div>
      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>电流 I</span>
          <input type="range" min="0.1" max="5" step="0.1" value={current} onChange={e => setCurrent(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{current.toFixed(1)} A</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>磁感应强度 B</span>
          <input type="range" min="0.05" max="2" step="0.05" value={B} onChange={e => setB(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{B.toFixed(2)} T</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>厚度 d</span>
          <input type="range" min="0.1" max="5" step="0.1" value={thickness} onChange={e => setThickness(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{thickness.toFixed(1)} mm</span>
        </label>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      </div>
      <div style={styles.desc}>
        <b>实验：霍尔效应</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          载流导体在磁场中产生横向电势差。U_H=IB/nqd，可用于测量磁场、判断载流子类型。
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
