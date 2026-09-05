import { useState, useRef, useEffect, useCallback } from 'react'

/**
 * LenzLawScene — 楞次定律探究
 * 磁铁靠近/远离线圈，感应电流方向
 */
export default function LenzLawScene() {
  const [magnetX, setMagnetX] = useState(0.7) // 0=在线圈中心, 1=右侧远处
  const [speed, setSpeed] = useState(0.5)
  const [polarity, setPolarity] = useState('N') // N | S — 靠近线圈的一端
  const [direction, setDirection] = useState('approach') // approach | leave
  const [autoRun, setAutoRun] = useState(false)
  const [dataLog, setDataLog] = useState([])
  const canvasRef = useRef(null)
  const tick = useRef(0)
  const raf = useRef(null)
  const magnetXRef = useRef(magnetX)

  useEffect(() => { magnetXRef.current = magnetX }, [magnetX])

  // 自动运行
  useEffect(() => {
    if (!autoRun) return
    let running = true
    const step = () => {
      if (!running) return
      setMagnetX(prev => {
        let next = prev + (direction === 'approach' ? -0.003 * speed : 0.003 * speed)
        if (next < -0.5) { setDirection('leave'); next = -0.5 }
        if (next > 0.85) { setDirection('approach'); next = 0.85 }
        return next
      })
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
    return () => { running = false }
  }, [autoRun, direction, speed])

  const addLog = useCallback(() => {
    const dist = magnetXRef.current
    const approaching = direction === 'approach'
    const fluxChange = approaching ? '增加' : '减少'
    const nearCoil = Math.abs(dist - 0.35) < 0.15
    let inducedPole = ''
    let forceDir = ''
    if (polarity === 'N') {
      inducedPole = approaching ? 'N（排斥）' : 'S（吸引）'
      forceDir = approaching ? '向右（排斥）' : '向左（吸引）'
    } else {
      inducedPole = approaching ? 'S（排斥）' : 'N（吸引）'
      forceDir = approaching ? '向右（排斥）' : '向左（吸引）'
    }
    setDataLog(d => [...d, {
      time: new Date().toLocaleTimeString(),
      magnetEnd: polarity + '极',
      motion: approaching ? '靠近' : '远离',
      fluxChange,
      inducedPole,
      forceDir,
      near: nearCoil ? '是' : '否',
    }].slice(-6))
  }, [direction, polarity])

  useEffect(() => {
    const cvs = canvasRef.current
    if (!cvs) return
    const ctx = cvs.getContext('2d')

    const draw = () => {
      tick.current++
      const W = cvs.clientWidth, H = cvs.clientHeight
      cvs.width = W * devicePixelRatio; cvs.height = H * devicePixelRatio
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      ctx.clearRect(0, 0, W, H)

      const t = tick.current * 0.03
      const coilCX = W * 0.35, coilCY = H * 0.35
      const coilR = 40

      // 计算磁通量变化
      const dist = magnetXRef.current // 0=在线圈, 1=远
      const relDist = Math.abs(dist - 0.35)
      const flux = Math.max(0, 1 - relDist * 3) * (autoRun ? 1 : 1)
      const approaching = direction === 'approach'
      const emf = flux * speed * (approaching ? 1 : -1)

      // 线圈
      ctx.strokeStyle = '#888'
      ctx.lineWidth = 3
      for (let i = 0; i < 8; i++) {
        const loopY = coilCY - 30 + i * 8
        ctx.beginPath()
        ctx.ellipse(coilCX, loopY, coilR, 8, 0, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(136,136,136,${0.5 + i * 0.06})`
        ctx.stroke()
      }

      // 感应电流方向箭头
      if (Math.abs(emf) > 0.05) {
        const currentDir = emf > 0 ? 1 : -1
        ctx.strokeStyle = currentDir > 0 ? '#E53935' : '#1565C0'
        ctx.lineWidth = 2.5
        for (let i = 0; i < 6; i++) {
          const angle = t * 2 + i * Math.PI / 3
          const ax = coilCX + coilR * Math.cos(angle)
          const ay = coilCY + Math.sin(angle) * 6
          const perpAngle = angle + Math.PI / 2 * currentDir
          ctx.beginPath()
          ctx.moveTo(ax, ay)
          ctx.lineTo(ax + 8 * Math.cos(perpAngle), ay + 8 * Math.sin(perpAngle))
          ctx.stroke()
          // 箭头
          ctx.fillStyle = ctx.strokeStyle
          ctx.beginPath()
          const tipX = ax + 8 * Math.cos(perpAngle)
          const tipY = ay + 8 * Math.sin(perpAngle)
          ctx.moveTo(tipX, tipY)
          ctx.lineTo(tipX - 4 * Math.cos(perpAngle - 0.5), tipY - 4 * Math.sin(perpAngle - 0.5))
          ctx.lineTo(tipX - 4 * Math.cos(perpAngle + 0.5), tipY - 4 * Math.sin(perpAngle + 0.5))
          ctx.fill()
        }
        ctx.fillStyle = currentDir > 0 ? '#E53935' : '#1565C0'
        ctx.font = 'bold 12px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(currentDir > 0 ? '逆时针 ↺' : '顺时针 ↻', coilCX, coilCY - 45)
      }

      // 电流计
      const galvX = W * 0.55, galvY = H * 0.3
      ctx.save()
      ctx.beginPath()
      ctx.arc(galvX, galvY, 35, 0, Math.PI * 2)
      ctx.fillStyle = '#fafafa'
      ctx.fill()
      ctx.strokeStyle = '#666'
      ctx.lineWidth = 2
      ctx.stroke()

      // 电流计刻度
      ctx.strokeStyle = '#ccc'
      ctx.lineWidth = 1
      for (let i = -5; i <= 5; i++) {
        const a = Math.PI * 0.75 + (i + 5) * Math.PI * 0.05
        ctx.beginPath()
        ctx.moveTo(galvX + 25 * Math.cos(a), galvY + 25 * Math.sin(a))
        ctx.lineTo(galvX + 30 * Math.cos(a), galvY + 30 * Math.sin(a))
        ctx.stroke()
      }
      // 指针
      const needleAngle = Math.PI * 1.5 + emf * 2.5
      ctx.strokeStyle = '#E53935'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(galvX, galvY)
      ctx.lineTo(galvX + 26 * Math.cos(needleAngle), galvY + 26 * Math.sin(needleAngle))
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(galvX, galvY, 3, 0, Math.PI * 2)
      ctx.fillStyle = '#333'
      ctx.fill()
      ctx.restore()

      ctx.fillStyle = '#333'
      ctx.font = '11px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('检流计', galvX, galvY + 48)
      ctx.fillStyle = '#666'
      ctx.font = '10px sans-serif'
      ctx.fillText('G', galvX, galvY + 4)

      // 连接导线
      ctx.strokeStyle = '#888'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(coilCX + coilR, coilCY)
      ctx.lineTo(galvX - 35, galvY)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(coilCX - coilR, coilCY)
      ctx.lineTo(coilCX - coilR - 20, coilCY + 60)
      ctx.lineTo(galvX - 10, galvY + 40)
      ctx.lineTo(galvX, galvY + 35)
      ctx.stroke()

      // === 磁铁 ===
      const magDrawX = W * 0.15 + dist * W * 0.4
      const magDrawY = coilCY
      const magLen = 80
      const magW = 20

      // 磁场线
      ctx.strokeStyle = 'rgba(100,100,100,0.2)'
      ctx.lineWidth = 1
      for (let i = 0; i < 4; i++) {
        const offsetY = -15 + i * 10
        ctx.beginPath()
        ctx.moveTo(magDrawX + magLen / 2 + 10, magDrawY + offsetY)
        ctx.quadraticCurveTo(magDrawX + magLen + 30, magDrawY + offsetY * 2, magDrawX + magLen / 2 + 10, magDrawY - offsetY)
        ctx.stroke()
      }

      // 磁铁本体
      // N极
      const nColor = '#E53935', sColor = '#1565C0'
      const leftColor = polarity === 'N' ? nColor : sColor
      const rightColor = polarity === 'N' ? sColor : nColor
      const leftLabel = polarity === 'N' ? 'N' : 'S'
      const rightLabel = polarity === 'N' ? 'S' : 'N'

      ctx.fillStyle = leftColor
      ctx.fillRect(magDrawX - magLen / 2, magDrawY - magW / 2, magLen / 2, magW)
      ctx.fillStyle = rightColor
      ctx.fillRect(magDrawX, magDrawY - magW / 2, magLen / 2, magW)

      ctx.fillStyle = '#fff'
      ctx.font = 'bold 14px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(leftLabel, magDrawX - magLen / 4, magDrawY + 5)
      ctx.fillText(rightLabel, magDrawX + magLen / 4, magDrawY + 5)

      // 磁铁运动方向
      const arrowDir = approaching ? 1 : -1
      ctx.strokeStyle = '#FF9800'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(magDrawX, magDrawY - magW / 2 - 15)
      ctx.lineTo(magDrawX + arrowDir * 30, magDrawY - magW / 2 - 15)
      ctx.stroke()
      ctx.fillStyle = '#FF9800'
      ctx.beginPath()
      ctx.moveTo(magDrawX + arrowDir * 30, magDrawY - magW / 2 - 15)
      ctx.lineTo(magDrawX + arrowDir * 22, magDrawY - magW / 2 - 20)
      ctx.lineTo(magDrawX + arrowDir * 22, magDrawY - magW / 2 - 10)
      ctx.fill()

      // 感应电流产生的磁场方向
      if (Math.abs(emf) > 0.05) {
        const indPole = approaching ? (polarity === 'N' ? 'N' : 'S') : (polarity === 'N' ? 'S' : 'N')
        ctx.fillStyle = indPole === 'N' ? '#E53935' : '#1565C0'
        ctx.font = 'bold 14px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(`感应${indPole}极`, coilCX, coilCY + 55)
        ctx.font = '11px sans-serif'
        ctx.fillStyle = indPole === 'N' ? '#E53935' : '#1565C0'
        ctx.fillText(approaching ? '来拒（排斥）' : '去留（吸引）', coilCX, coilCY + 72)
      }

      // === Φ-t 图 ===
      const graphX = W * 0.62, graphY = H * 0.55
      const graphW = W * 0.35, graphH = H * 0.35

      ctx.fillStyle = '#f9f9f9'
      ctx.fillRect(graphX, graphY, graphW, graphH)
      ctx.strokeStyle = '#ddd'
      ctx.lineWidth = 1
      ctx.strokeRect(graphX, graphY, graphW, graphH)

      ctx.fillStyle = '#333'
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Φ-t 图 & ε = -dΦ/dt', graphX + graphW / 2, graphY + 15)

      // 坐标轴
      ctx.strokeStyle = '#999'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(graphX + 10, graphY + 25)
      ctx.lineTo(graphX + 10, graphY + graphH - 10)
      ctx.lineTo(graphX + graphW - 10, graphY + graphH - 10)
      ctx.stroke()

      // 磁通量曲线
      const midX = graphX + graphW / 2
      const baseY = graphY + graphH / 2 + 5
      ctx.strokeStyle = '#4A90D9'
      ctx.lineWidth = 2
      ctx.beginPath()
      for (let px = 0; px < graphW - 20; px++) {
        const tt = (px / (graphW - 20) - 0.5) * 4
        const phi = Math.exp(-tt * tt * 2) * (graphH * 0.35)
        const x = graphX + 10 + px
        const y = baseY - phi
        if (px === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.stroke()

      // ε 曲线（导数）
      ctx.strokeStyle = '#E53935'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      for (let px = 0; px < graphW - 20; px++) {
        const tt = (px / (graphW - 20) - 0.5) * 4
        const eps = -(-tt * 4) * Math.exp(-tt * tt * 2) * (graphH * 0.3)
        const x = graphX + 10 + px
        const y = baseY - eps
        if (px === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.setLineDash([])

      // 标注
      ctx.font = '11px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillStyle = '#4A90D9'
      ctx.fillText('Φ（磁通量）', graphX + 20, graphY + 35)
      ctx.fillStyle = '#E53935'
      ctx.fillText('ε（感应电动势）', graphX + 20, graphY + 50)
      ctx.fillStyle = '#333'
      ctx.fillText('t', graphX + graphW - 20, graphY + graphH - 15)

      // 移动标记
      const markerX = graphX + 10 + ((dist + 0.5) / 1.3) * (graphW - 20)
      ctx.strokeStyle = '#FF9800'
      ctx.lineWidth = 1
      ctx.setLineDash([2, 2])
      ctx.beginPath()
      ctx.moveTo(markerX, graphY + 25)
      ctx.lineTo(markerX, graphY + graphH - 10)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#FF9800'
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('磁铁位置', markerX, graphY + graphH - 2)

      // === 数据表 ===
      const tableY = H * 0.55
      ctx.fillStyle = '#f5f5f5'
      ctx.fillRect(0, tableY, W * 0.58, H * 0.45)
      ctx.strokeStyle = '#ccc'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, tableY)
      ctx.lineTo(W * 0.58, tableY)
      ctx.stroke()

      ctx.fillStyle = '#333'
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('📊 实验记录', 16, tableY + 18)

      const headers = ['磁极', '运动', 'Φ变化', '感应极', '力方向']
      const colW = W * 0.58 / 6
      ctx.font = '11px sans-serif'
      ctx.fillStyle = '#666'
      headers.forEach((h, i) => ctx.fillText(h, 16 + i * colW, tableY + 34))

      ctx.font = '11px sans-serif'
      ctx.fillStyle = '#333'
      dataLog.forEach((d, i) => {
        const row = [d.magnetEnd, d.motion, d.fluxChange, d.inducedPole, d.forceDir]
        row.forEach((v, j) => ctx.fillText(v, 16 + j * colW, tableY + 50 + i * 16))
      })

      // 实时状态
      ctx.fillStyle = '#4A90D9'
      ctx.font = 'bold 13px sans-serif'
      ctx.textAlign = 'left'
      const statusText = approaching ?
        `${polarity}极靠近 → Φ增加 → 感应电流产生${polarity === 'N' ? 'N' : 'S'}极 → 来拒` :
        `${polarity}极远离 → Φ减少 → 感应电流产生${polarity === 'N' ? 'S' : 'N'}极 → 去留`
      ctx.fillText(statusText, 16, H - 16)

      raf.current = requestAnimationFrame(draw)
    }
    raf.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf.current)
  }, [direction, polarity, autoRun, speed, dataLog])

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>楞次定律探究</span>
        <div style={styles.topActions}>
          <button style={{ ...styles.setBtn, background: polarity === 'N' ? '#E53935' : '#7B1FA2' }} onClick={() => setPolarity(p => p === 'N' ? 'S' : 'N')}>
            {polarity}极朝线圈（点击切换）
          </button>
          <button style={{ ...styles.setBtn, background: direction === 'approach' ? '#FF9800' : '#4CAF50' }} onClick={() => setDirection(d => d === 'approach' ? 'leave' : 'approach')}>
            {direction === 'approach' ? '靠近线圈' : '远离线圈'}
          </button>
          <button style={{ ...styles.setBtn, background: autoRun ? '#4CAF50' : '#7B1FA2' }} onClick={() => setAutoRun(a => !a)}>
            {autoRun ? '⏸ 暂停' : '▶ 自动演示'}
          </button>
          <button style={{ ...styles.setBtn, background: '#FF9800' }} onClick={addLog}>📝 记录</button>
          <button style={styles.setBtn} onClick={() => setDataLog([])}>清空</button>
        </div>
      </div>
      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>磁铁位置</span>
          <input type="range" min="-0.3" max="0.85" step="0.01" value={magnetX} onChange={e => setMagnetX(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{magnetX < 0.35 ? '靠近' : '远离'}</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>运动速度</span>
          <input type="range" min="0.1" max="2" step="0.1" value={speed} onChange={e => setSpeed(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{speed.toFixed(1)}×</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>快→ 感应电动势大</span>
        </label>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      </div>
      <div style={styles.desc}>
        <b>实验：楞次定律</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          感应电流的方向总是使它所产生的磁场阻碍引起感应电流的磁通量的变化。"来拒去留"：靠近排斥，远离吸引。
        </span>
      </div>
    </div>
  )
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', maxHeight: '100vh', background: '#e8e8e8', color: '#333', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', overflow: 'hidden' },
  topBar: { background: '#f5f5f5', borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', flexShrink: 0 },
  title: { fontSize: 14, fontWeight: 600 }, topActions: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  controlBar: { background: '#fafafa', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', padding: '4px 12px', flexShrink: 0, gap: 12 },
  controlLabel: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#555' },
  controlName: { fontWeight: 600, color: '#4A90D9' }, slider: { width: 110, accentColor: '#4A90D9' },
  sliderVal: { color: '#4A90D9', fontWeight: 600, fontSize: 12, minWidth: 55 },
  setBtn: { background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
  main: { flex: 1, minHeight: 0, background: '#fff' },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
}
