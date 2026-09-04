import { useState, useRef, useEffect } from 'react'

/**
 * ElectricFieldLineScene — 电场线与电场强度
 * 点电荷、平行板电容器电场线分布
 */
export default function ElectricFieldLineScene() {
  const [chargeType, setChargeType] = useState('positive') // positive | negative | dipole | parallel
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
      ctx.fillStyle = '#FAFAFA'
      ctx.fillRect(0, 0, W, H)

      const cx = W / 2, cy = H / 2

      const drawArrow = (x1, y1, x2, y2, color) => {
        ctx.strokeStyle = color
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
        const angle = Math.atan2(y2 - y1, x2 - x1)
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.moveTo(x2, y2)
        ctx.lineTo(x2 - 8 * Math.cos(angle - 0.3), y2 - 8 * Math.sin(angle - 0.3))
        ctx.lineTo(x2 - 8 * Math.cos(angle + 0.3), y2 - 8 * Math.sin(angle + 0.3))
        ctx.fill()
      }

      const drawCharge = (x, y, q) => {
        ctx.fillStyle = q > 0 ? '#E53935' : '#1565C0'
        ctx.beginPath()
        ctx.arc(x, y, 18, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 18px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(q > 0 ? '+' : '−', x, y)
      }

      if (chargeType === 'positive' || chargeType === 'negative') {
        const q = chargeType === 'positive' ? 1 : -1
        drawCharge(cx, cy, q)
        // 电场线
        for (let i = 0; i < 16; i++) {
          const angle = (i / 16) * Math.PI * 2
          const len = 180
          const x1 = cx + Math.cos(angle) * 25
          const y1 = cy + Math.sin(angle) * 25
          const x2 = cx + Math.cos(angle) * len
          const y2 = cy + Math.sin(angle) * len
          drawArrow(q > 0 ? x1 : x2, q > 0 ? y1 : y2, q > 0 ? x2 : x1, q > 0 ? y2 : y1, '#E53935')
        }
        ctx.fillStyle = '#333'
        ctx.font = 'bold 14px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(q > 0 ? '正电荷电场线向外发散' : '负电荷电场线向内汇聚', cx, H - 30)

      } else if (chargeType === 'dipole') {
        const d = 120
        drawCharge(cx - d, cy, 1)
        drawCharge(cx + d, cy, -1)
        // 电场线（从正到负）
        for (let i = 0; i < 12; i++) {
          const startAngle = (i / 12) * Math.PI * 2
          const startX = cx - d + Math.cos(startAngle) * 25
          const startY = cy + Math.sin(startAngle) * 25
          // 简化：画直线到负电荷附近
          const endX = cx + d - Math.cos(startAngle) * 25
          const endY = cy - Math.sin(startAngle) * 25
          const dist = Math.hypot(endX - startX, endY - startY)
          if (dist > 50) {
            // 贝塞尔曲线模拟
            const cpx = (startX + endX) / 2
            const cpy = (startY + endY) / 2 + Math.sin(startAngle) * 60
            ctx.strokeStyle = '#E53935'
            ctx.lineWidth = 1.5
            ctx.beginPath()
            ctx.moveTo(startX, startY)
            ctx.quadraticCurveTo(cpx, cpy, endX, endY)
            ctx.stroke()
            // 箭头（中点处）
            const mx = (startX + 2 * cpx + endX) / 4
            const my = (startY + 2 * cpy + endY) / 4
            const dx = (endX - startX) * 0.1
            const dy = (endY - startY) * 0.1 + cpy * 0.1
            drawArrow(mx - dx, my - dy, mx + dx, my + dy, '#E53935')
          }
        }
        ctx.fillStyle = '#333'
        ctx.font = 'bold 14px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('等量异号电荷（电偶极子）', cx, H - 30)

      } else { // parallel plate
        const plateW = 20, plateH = 250, gap = 150
        // 正极板
        ctx.fillStyle = '#FFCDD2'
        ctx.strokeStyle = '#E53935'
        ctx.lineWidth = 2
        ctx.fillRect(cx - gap / 2 - plateW, cy - plateH / 2, plateW, plateH)
        ctx.strokeRect(cx - gap / 2 - plateW, cy - plateH / 2, plateW, plateH)
        ctx.fillStyle = '#E53935'
        ctx.font = 'bold 16px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('+', cx - gap / 2 - plateW / 2, cy - plateH / 2 - 10)

        // 负极板
        ctx.fillStyle = '#BBDEFB'
        ctx.strokeStyle = '#1565C0'
        ctx.fillRect(cx + gap / 2, cy - plateH / 2, plateW, plateH)
        ctx.strokeRect(cx + gap / 2, cy - plateH / 2, plateW, plateH)
        ctx.fillStyle = '#1565C0'
        ctx.fillText('−', cx + gap / 2 + plateW / 2, cy - plateH / 2 - 10)

        // 匀强电场线
        for (let i = -4; i <= 4; i++) {
          const y = cy + i * 28
          drawArrow(cx - gap / 2 + 10, y, cx + gap / 2 - 10, y, '#333')
        }

        // 等势线
        ctx.strokeStyle = 'rgba(76,175,80,0.4)'
        ctx.lineWidth = 1
        ctx.setLineDash([5, 5])
        for (let i = 1; i <= 4; i++) {
          const x = cx - gap / 2 + i * gap / 5
          ctx.beginPath()
          ctx.moveTo(x, cy - plateH / 2 + 20)
          ctx.lineTo(x, cy + plateH / 2 - 20)
          ctx.stroke()
        }
        ctx.setLineDash([])

        ctx.fillStyle = '#4CAF50'
        ctx.font = '12px sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText('虚线：等势面', cx + gap / 2 + plateW + 15, cy - plateH / 2 + 20)
        ctx.fillStyle = '#333'
        ctx.fillText('实线：电场线', cx + gap / 2 + plateW + 15, cy - plateH / 2 + 40)
        ctx.fillText('E = U/d (匀强)', cx + gap / 2 + plateW + 15, cy - plateH / 2 + 60)
      }

      // 图例
      ctx.fillStyle = '#E53935'
      ctx.beginPath()
      ctx.arc(30, 30, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#333'
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('正电荷 / 电场线方向', 42, 35)

      ctx.fillStyle = '#1565C0'
      ctx.beginPath()
      ctx.arc(30, 52, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#333'
      ctx.fillText('负电荷', 42, 57)
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(cvs)
    return () => ro.disconnect()
  }, [chargeType])

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>电场线与电场强度</span>
        <div style={styles.topActions}>
          {[['positive', '正电荷'], ['negative', '负电荷'], ['dipole', '电偶极子'], ['parallel', '平行板']].map(([k, l]) => (
            <button key={k} style={{ ...styles.setBtn, background: chargeType === k ? '#E53935' : '#7B1FA2' }} onClick={() => setChargeType(k)}>{l}</button>
          ))}
        </div>
      </div>
      <div style={styles.controlBar}>
        <span style={{ fontSize: 12, color: '#555' }}>
          电场线切线方向 = 电场强度方向 | 疏密反映场强大小 | 等势面⊥电场线
        </span>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      </div>
      <div style={styles.desc}>
        <b>实验：电场线与电场强度</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          切换四种电荷分布，观察电场线形态。理解 E=F/q 和匀强电场 E=U/d。
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
  setBtn: { background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
  main: { flex: 1, minHeight: 0, background: '#fff' },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
}
