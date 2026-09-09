import { useState, useRef, useEffect } from 'react'

/**
 * ClosedCircuitOhmScene — 闭合电路欧姆定律
 * 路端电压与电流关系 U=ε-Ir
 */
export default function ClosedCircuitOhmScene() {
  const [emf, setEmf] = useState(12) // ε 电动势
  const [internalR, setInternalR] = useState(1) // r 内阻
  const [loadR, setLoadR] = useState(5) // R 外电阻
  const canvasRef = useRef(null)

  const I = emf / (loadR + internalR)
  const U路端 = emf - I * internalR
  const U内 = I * internalR

  useEffect(() => {
    const cvs = canvasRef.current
    if (!cvs) return
    const ctx = cvs.getContext('2d')
    const draw = () => {
      const W = cvs.clientWidth, H = cvs.clientHeight
      cvs.width = W * devicePixelRatio; cvs.height = H * devicePixelRatio
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      ctx.clearRect(0, 0, W, H)

      const margin = { top: 40, right: 40, bottom: 60, left: 70 }
      const gw = W - margin.left - margin.right
      const gh = H - margin.top - margin.bottom

      // 坐标轴
      ctx.strokeStyle = '#999'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(margin.left, margin.top)
      ctx.lineTo(margin.left, margin.top + gh)
      ctx.lineTo(margin.left + gw, margin.top + gh)
      ctx.stroke()

      // 轴标签
      ctx.fillStyle = '#333'
      ctx.font = 'bold 13px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('电流 I (A)', margin.left + gw / 2, H - 10)
      ctx.save()
      ctx.translate(15, margin.top + gh / 2)
      ctx.rotate(-Math.PI / 2)
      ctx.fillText('路端电压 U (V)', 0, 0)
      ctx.restore()

      // 范围
      const iMax = emf / internalR * 1.1
      const uMax = emf * 1.1
      const toX = i => margin.left + (i / iMax) * gw
      const toY = u => margin.top + gh - (u / uMax) * gh

      // 网格
      ctx.strokeStyle = '#f0f0f0'
      ctx.font = '11px sans-serif'
      ctx.textAlign = 'center'
      for (let i = 0; i <= 5; i++) {
        const v = iMax * i / 5
        ctx.fillText(v.toFixed(1), toX(v), margin.top + gh + 18)
        ctx.beginPath(); ctx.moveTo(toX(v), margin.top); ctx.lineTo(toX(v), margin.top + gh); ctx.stroke()
      }
      ctx.textAlign = 'right'
      for (let i = 0; i <= 5; i++) {
        const v = uMax * i / 5
        ctx.fillText(v.toFixed(1), margin.left - 8, toY(v) + 4)
        ctx.beginPath(); ctx.moveTo(margin.left, toY(v)); ctx.lineTo(margin.left + gw, toY(v)); ctx.stroke()
      }

      // U = ε - Ir 直线
      ctx.strokeStyle = '#E53935'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(toX(0), toY(emf))
      ctx.lineTo(toX(emf / internalR), toY(0))
      ctx.stroke()

      // 标注 ε
      ctx.fillStyle = '#E53935'
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(`ε = ${emf} V`, toX(0) + 8, toY(emf) - 8)

      // 标注短路电流
      ctx.fillStyle = '#FF9800'
      ctx.fillText(`I_short = ε/r = ${(emf / internalR).toFixed(1)} A`, toX(emf / internalR) - 80, toY(0) + 20)

      // 当前工作点
      ctx.fillStyle = '#1565C0'
      ctx.beginPath()
      ctx.arc(toX(I), toY(U路端), 8, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.stroke()

      // 工作点标注
      ctx.fillStyle = '#1565C0'
      ctx.font = 'bold 13px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(`工作点: I=${I.toFixed(2)}A, U=${U路端.toFixed(2)}V`, toX(I) + 14, toY(U路端) - 4)

      // 斜率标注
      ctx.fillStyle = '#666'
      ctx.font = '12px sans-serif'
      ctx.fillText(`斜率 = -r = -${internalR} Ω`, margin.left + gw - 160, margin.top + 20)

      // 电压分配饼图
      const pieX = W - 100, pieY = margin.top + 50, pieR = 35
      const total = emf
      const innerAngle = (U内 / total) * Math.PI * 2
      // 内压降
      ctx.fillStyle = '#FF9800'
      ctx.beginPath()
      ctx.moveTo(pieX, pieY)
      ctx.arc(pieX, pieY, pieR, -Math.PI / 2, -Math.PI / 2 + innerAngle)
      ctx.fill()
      // 路端电压
      ctx.fillStyle = '#4CAF50'
      ctx.beginPath()
      ctx.moveTo(pieX, pieY)
      ctx.arc(pieX, pieY, pieR, -Math.PI / 2 + innerAngle, -Math.PI / 2 + Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#333'
      ctx.font = '11px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('电压分配', pieX, pieY + pieR + 16)
      ctx.fillStyle = '#FF9800'
      ctx.fillText(`内 ${U内.toFixed(1)}V`, pieX - 30, pieY + pieR + 32)
      ctx.fillStyle = '#4CAF50'
      ctx.fillText(`外 ${U路端.toFixed(1)}V`, pieX + 30, pieY + pieR + 32)

      // 公式
      ctx.fillStyle = '#333'
      ctx.font = '13px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(`ε = U + U' = ${U路端.toFixed(2)} + ${U内.toFixed(2)} = ${emf} V`, 20, H - 30)
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(cvs)
    return () => ro.disconnect()
  }, [emf, internalR, loadR, I, U路端, U内])

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>闭合电路欧姆定律</span>
        <div style={styles.topActions}>
          <button style={styles.setBtn} onClick={() => { setEmf(12); setInternalR(1); setLoadR(5) }}>⚙ 重置</button>
        </div>
      </div>
      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>电动势 ε</span>
          <input type="range" min="3" max="24" step="1" value={emf} onChange={e => setEmf(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{emf} V</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>内阻 r</span>
          <input type="range" min="0.1" max="5" step="0.1" value={internalR} onChange={e => setInternalR(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{internalR.toFixed(1)} Ω</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>外阻 R</span>
          <input type="range" min="0.5" max="50" step="0.5" value={loadR} onChange={e => setLoadR(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{loadR.toFixed(1)} Ω</span>
        </label>
        <span style={{ fontSize: 12, color: '#E53935', fontWeight: 600, marginLeft: 'auto' }}>I={I.toFixed(2)}A</span>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      </div>
      <div style={styles.desc}>
        <b>实验：闭合电路欧姆定律</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          调节ε、r、R，观察U-I图像和电压分配。U=ε-Ir，内压降+路端电压=电动势。
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
