import { useState, useRef, useEffect, useCallback } from 'react'

/**
 * EmfInternalResistanceScene — 测量电源电动势和内阻
 * U = ε - Ir，U-I图像，两种测量方法
 */
export default function EmfInternalResistanceScene() {
  const [method, setMethod] = useState(0) // 0: voltmeter across battery, 1: across external R
  const [Rext, setRext] = useState(10)
  const canvasRef = useRef(null)
  const tickRef = useRef(0)
  const rafRef = useRef(null)
  const dataPointsRef = useRef([])

  const eps = 3.0 // ε = 3V
  const r = 1.0   // internal resistance
  const RA = 0.1  // ammeter resistance
  const RV = 1000 // voltmeter resistance

  // Calculate U and I based on method
  let U, I, U_measured, I_measured
  if (method === 0) {
    // Voltmeter across battery: U = ε - I*r (voltmeter measures true U but ammeter reads I + Iv)
    I = eps / (Rext + r)
    U = eps - I * r
    // Systematic error: voltmeter draws current, ammeter reads I_total = I + U/RV
    I_measured = I + U / RV
    U_measured = U
  } else {
    // Voltmeter across external R
    I = eps / (Rext + r)
    U = I * Rext
    // Systematic error: voltmeter in parallel with R changes effective resistance
    const R_eff = (Rext * RV) / (Rext + RV)
    I_measured = eps / (R_eff + r)
    U_measured = I_measured * R_eff
  }

  const trueEps = eps
  const trueR = r
  const measuredEps = method === 0 ? eps : eps * RV / (RV + r)
  const measuredR = method === 0 ? r + RA : r * RV / (RV + r)

  // Generate regression line data from recorded points
  const regressionData = dataPointsRef.current.length >= 2
    ? (() => {
      const pts = dataPointsRef.current
      const n = pts.length
      let sumI = 0, sumU = 0, sumII = 0, sumIU = 0
      pts.forEach(p => { sumI += p.I; sumU += p.U; sumII += p.I * p.I; sumIU += p.I * p.U })
      const slope = (n * sumIU - sumI * sumU) / (n * sumII - sumI * sumI)
      const intercept = (sumU - slope * sumI) / n
      return { slope, intercept }
    })()
    : null

  const draw = useCallback(() => {
    const cvs = canvasRef.current
    if (!cvs) return
    const ctx = cvs.getContext('2d')
    const W = cvs.clientWidth, H = cvs.clientHeight
    cvs.width = W * devicePixelRatio; cvs.height = H * devicePixelRatio
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
    ctx.clearRect(0, 0, W, H)

    // === Circuit diagram (left side) ===
    const cx = W * 0.28, cy = H * 0.4

    // Battery
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cx - 60, cy)
    ctx.lineTo(cx - 30, cy)
    ctx.stroke()
    // Long line (positive)
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(cx - 30, cy - 12)
    ctx.lineTo(cx - 30, cy + 12)
    ctx.stroke()
    // Short line (negative)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cx - 22, cy - 7)
    ctx.lineTo(cx - 22, cy + 7)
    ctx.stroke()
    ctx.fillStyle = '#333'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('ε,r', cx - 26, cy - 18)
    ctx.fillText('+', cx - 35, cy + 25)
    ctx.fillText('−', cx - 18, cy + 25)

    // Wire to switch
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cx - 22, cy)
    ctx.lineTo(cx, cy)
    ctx.stroke()

    // Switch
    ctx.beginPath()
    ctx.arc(cx, cy, 4, 0, Math.PI * 2)
    ctx.fillStyle = '#333'
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + 25, cy - 15)
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 2
    ctx.stroke()

    // Wire to rheostat
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + 60, cy)
    ctx.stroke()

    // Rheostat (variable resistor)
    const rheoX = cx + 60, rheoY = cy
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 2
    // Zigzag
    ctx.beginPath()
    ctx.moveTo(rheoX, rheoY)
    for (let i = 0; i < 5; i++) {
      ctx.lineTo(rheoX + 8 + i * 10, rheoY - 10)
      ctx.lineTo(rheoX + 13 + i * 10, rheoY + 10)
    }
    ctx.lineTo(rheoX + 58, rheoY)
    ctx.stroke()
    // Arrow (slider)
    ctx.fillStyle = '#4A90D9'
    const arrowX = rheoX + 10 + (Rext / 50) * 40
    ctx.beginPath()
    ctx.moveTo(arrowX, rheoY - 18)
    ctx.lineTo(arrowX - 5, rheoY - 10)
    ctx.lineTo(arrowX + 5, rheoY - 10)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#333'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('R', rheoX + 30, rheoY + 28)

    // Wire back to battery (bottom)
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(rheoX + 58, rheoY)
    ctx.lineTo(rheoX + 80, rheoY)
    ctx.stroke()

    // Ammeter
    ctx.beginPath()
    ctx.arc(rheoX + 95, rheoY, 15, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'
    ctx.fill()
    ctx.strokeStyle = '#333'
    ctx.stroke()
    ctx.fillStyle = '#E53935'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('A', rheoX + 95, rheoY + 4)

    // Wire to bottom
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(rheoX + 95, rheoY + 15)
    ctx.lineTo(rheoX + 95, cy + 60)
    ctx.lineTo(cx - 60, cy + 60)
    ctx.lineTo(cx - 60, cy)
    ctx.stroke()

    // Voltmeter
    const vmX = method === 0 ? cx + 5 : cx + 115
    const vmY = cy + 60
    ctx.beginPath()
    ctx.arc(vmX, vmY + 25, 15, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'
    ctx.fill()
    ctx.strokeStyle = '#333'
    ctx.stroke()
    ctx.fillStyle = '#1565C0'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('V', vmX, vmY + 29)

    // Voltmeter connections
    ctx.strokeStyle = '#1565C0'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 2])
    if (method === 0) {
      // Across battery
      ctx.beginPath()
      ctx.moveTo(vmX, vmY + 10)
      ctx.lineTo(vmX, cy + 10)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(vmX, vmY + 40)
      ctx.lineTo(vmX, cy + 55)
      ctx.stroke()
    } else {
      // Across external resistor
      ctx.beginPath()
      ctx.moveTo(vmX, vmY + 10)
      ctx.lineTo(vmX, cy + 10)
      ctx.lineTo(rheoX + 58, cy + 10)
      ctx.lineTo(rheoX + 58, rheoY)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(vmX, vmY + 40)
      ctx.lineTo(vmX, cy + 55)
      ctx.lineTo(rheoX, cy + 55)
      ctx.lineTo(rheoX, rheoY)
      ctx.stroke()
    }
    ctx.setLineDash([])

    // Method label
    ctx.fillStyle = '#333'
    ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(method === 0 ? '方法一：电压表测路端电压' : '方法二：电压表测外电阻电压', cx + 30, cy - 50)

    // Readings panel
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.fillRect(15, H - 120, 200, 90)
    ctx.strokeStyle = '#ccc'
    ctx.strokeRect(15, H - 120, 200, 90)
    ctx.fillStyle = '#333'
    ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('测量读数', 25, H - 102)
    ctx.font = '12px sans-serif'
    ctx.fillStyle = '#E53935'
    ctx.fillText(`电流 I = ${I_measured.toFixed(3)} A`, 25, H - 82)
    ctx.fillStyle = '#1565C0'
    ctx.fillText(`电压 U = ${U_measured.toFixed(3)} V`, 25, H - 64)
    ctx.fillStyle = '#666'
    ctx.fillText(`R_ext = ${Rext.toFixed(1)} Ω`, 25, H - 46)

    // === U-I Plot (right side) ===
    const plotX = W * 0.55, plotY = 40, plotW = W * 0.4, plotH = H * 0.55

    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.fillRect(plotX, plotY, plotW, plotH)
    ctx.strokeStyle = '#ccc'
    ctx.strokeRect(plotX, plotY, plotW, plotH)

    // Axes
    const axX = plotX + 50, axY = plotY + plotH - 40
    const axW = plotW - 80, axH = plotH - 70
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(axX, axY)
    ctx.lineTo(axX + axW, axY)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(axX, axY)
    ctx.lineTo(axX, axY - axH)
    ctx.stroke()

    // Axis labels
    ctx.fillStyle = '#333'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('I (A)', axX + axW / 2, axY + 25)
    ctx.save()
    ctx.translate(axX - 30, axY - axH / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText('U (V)', 0, 0)
    ctx.restore()

    // Scale
    const maxI = 0.5, maxU = eps * 1.2
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    for (let i = 0; i <= 4; i++) {
      const val = (maxI / 4) * i
      const x = axX + (val / maxI) * axW
      ctx.fillText(val.toFixed(2), x, axY + 14)
    }
    ctx.textAlign = 'right'
    for (let i = 0; i <= 4; i++) {
      const val = (maxU / 4) * i
      const y = axY - (val / maxU) * axH
      ctx.fillText(val.toFixed(1), axX - 6, y + 4)
    }

    // Theoretical line: U = ε - Ir
    ctx.strokeStyle = 'rgba(74,144,217,0.4)'
    ctx.lineWidth = 1
    ctx.setLineDash([6, 3])
    ctx.beginPath()
    const thI1 = 0, thU1 = eps
    const thI2 = eps / r, thU2 = 0
    ctx.moveTo(axX + (thI1 / maxI) * axW, axY - (thU1 / maxU) * axH)
    ctx.lineTo(axX + (thI2 / maxI) * axW, axY - (thU2 / maxU) * axH)
    ctx.stroke()
    ctx.setLineDash([])

    // Current operating point
    const opX = axX + (I_measured / maxI) * axW
    const opY = axY - (U_measured / maxU) * axH
    ctx.fillStyle = '#E53935'
    ctx.beginPath()
    ctx.arc(opX, opY, 5, 0, Math.PI * 2)
    ctx.fill()

    // Recorded data points
    ctx.fillStyle = '#4CAF50'
    dataPointsRef.current.forEach(pt => {
      const px = axX + (pt.I / maxI) * axW
      const py = axY - (pt.U / maxU) * axH
      ctx.beginPath()
      ctx.arc(px, py, 3, 0, Math.PI * 2)
      ctx.fill()
    })

    // Regression line
    if (regressionData) {
      ctx.strokeStyle = '#FF9800'
      ctx.lineWidth = 2
      ctx.beginPath()
      const rI1 = 0, rU1 = regressionData.intercept
      const rI2 = maxI, rU2 = regressionData.intercept + regressionData.slope * maxI
      ctx.moveTo(axX + (rI1 / maxI) * axW, axY - (rU1 / maxU) * axH)
      ctx.lineTo(axX + (rI2 / maxI) * axW, axY - (rU2 / maxU) * axH)
      ctx.stroke()
    }

    // Error analysis panel
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    const epx = plotX, epy = plotY + plotH + 10
    ctx.fillRect(epx, epy, plotW, H - epy - 30)
    ctx.strokeStyle = '#ccc'
    ctx.strokeRect(epx, epy, plotW, H - epy - 30)
    ctx.fillStyle = '#333'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('误差分析', epx + 10, epy + 16)
    ctx.font = '11px sans-serif'
    ctx.fillStyle = '#666'
    if (method === 0) {
      ctx.fillText('电压表分流 → I测 > I真 → ε测 = ε真（准确）', epx + 10, epy + 34)
      ctx.fillText('r测 = r真 + RA（偏大）', epx + 10, epy + 50)
    } else {
      ctx.fillText('电压表分流 → I测 > I真 → ε测 < ε真（偏小）', epx + 10, epy + 34)
      ctx.fillText('r测 = r·RV/(r+RV) < r真（偏小）', epx + 10, epy + 50)
    }

    // Regression results
    if (regressionData) {
      ctx.fillStyle = '#1565C0'
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(`ε(截距) = ${regressionData.intercept.toFixed(3)} V`, epx + plotW - 10, epy + 16)
      ctx.fillText(`r(斜率) = ${Math.abs(regressionData.slope).toFixed(3)} Ω`, epx + plotW - 10, epy + 34)
    }
  }, [method, Rext, eps, r, RA, RV, I, U, I_measured, U_measured, regressionData])

  useEffect(() => {
    const animate = () => {
      tickRef.current++
      draw()
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  const handleRecord = () => {
    dataPointsRef.current.push({ I: I_measured, U: U_measured })
    if (dataPointsRef.current.length > 20) dataPointsRef.current.shift()
  }

  const handleReset = () => {
    dataPointsRef.current = []
    setRext(10)
  }

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>测量电源电动势和内阻</span>
        <div style={styles.topActions}>
          {['电压表测路端电压', '电压表测外电阻'].map((label, i) => (
            <button key={i} style={{ ...styles.modeBtn, background: method === i ? '#4A90D9' : '#eee', color: method === i ? '#fff' : '#333' }}
              onClick={() => { setMethod(i); dataPointsRef.current = [] }}>{label}</button>
          ))}
          <button style={styles.resetBtn} onClick={handleReset}>⚙ 重置</button>
        </div>
      </div>
      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>外电阻 R</span>
          <input type="range" min="1" max="50" step="0.5" value={Rext} onChange={e => setRext(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{Rext.toFixed(1)} Ω</span>
        </label>
        <div style={styles.readings}>
          <span style={{ color: '#E53935', fontWeight: 600 }}>I = {I_measured.toFixed(3)} A</span>
          <span style={{ color: '#1565C0', fontWeight: 600 }}>U = {U_measured.toFixed(3)} V</span>
        </div>
        <button style={styles.recordBtn} onClick={handleRecord}>📋 记录数据</button>
        <span style={{ fontSize: 11, color: '#888' }}>已记录 {dataPointsRef.current.length} 个点</span>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      </div>
      <div style={styles.desc}>
        <b>实验：测量电源电动势和内阻</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          U = ε - Ir。调节外电阻记录多组U、I数据，用U-I图像的截距和斜率求ε和r。
        </span>
      </div>
    </div>
  )
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', maxHeight: '100vh', background: '#e8e8e8', color: '#333', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', overflow: 'hidden' },
  topBar: { background: '#f5f5f5', borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', flexShrink: 0 },
  title: { fontSize: 14, fontWeight: 600 }, topActions: { display: 'flex', gap: 6, alignItems: 'center' },
  modeBtn: { border: 'none', borderRadius: 4, padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600 },
  resetBtn: { background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
  controlBar: { background: '#fafafa', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', padding: '4px 12px', flexShrink: 0, gap: 16 },
  controlLabel: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#555' },
  controlName: { fontWeight: 600, color: '#4A90D9' }, slider: { width: 120, accentColor: '#4A90D9' },
  sliderVal: { color: '#4A90D9', fontWeight: 600, fontSize: 12, minWidth: 50 },
  readings: { display: 'flex', gap: 12, fontSize: 12 },
  recordBtn: { background: '#4A90D9', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
  main: { flex: 1, minHeight: 0, background: '#fff' },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
}
