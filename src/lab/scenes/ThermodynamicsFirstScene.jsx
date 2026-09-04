import { useState, useRef, useEffect } from 'react'

/**
 * ThermodynamicsFirstScene — 热力学第一定律
 *
 * - 做功与热传递改变内能
 * - ΔU = Q + W
 * - 等温/等压/等容/绝热过程
 * - 活塞动画 + 内能变化可视化
 */
export default function ThermodynamicsFirstScene() {
  const canvasRef = useRef(null)
  const [process, setProcess] = useState('isothermal') // isothermal | isobaric | isochoric | adiabatic
  const [heatQ, setHeatQ] = useState(0) // J (正=吸热，负=放热)
  const [workW, setWorkW] = useState(0) // J (正=对外做功，负=外界对气体做功)
  const [pistonPos, setPistonPos] = useState(0.5) // 0~1 活塞位置
  const S = useRef({ raf: null })

  // 过程约束
  useEffect(() => {
    switch (process) {
      case 'isothermal': setHeatQ(500); setWorkW(-500); break // ΔU=0
      case 'isobaric': setHeatQ(800); setWorkW(-300); break // ΔU=500
      case 'isochoric': setHeatQ(500); setWorkW(0); break // ΔU=500
      case 'adiabatic': setHeatQ(0); setWorkW(-400); break // ΔU=-400
    }
  }, [process])

  const deltaU = heatQ + workW

  useEffect(() => {
    const cvs = canvasRef.current
    if (!cvs) return
    const ctx = cvs.getContext('2d')

    const draw = () => {
      const W = cvs.clientWidth, H = cvs.clientHeight
      cvs.width = W * devicePixelRatio
      cvs.height = H * devicePixelRatio
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      ctx.clearRect(0, 0, W, H)

      // 活塞动画
      const pistonX = 80 + pistonPos * (W - 200)
      const cylTop = H * 0.2, cylBot = H * 0.75, cylH = cylBot - cylTop

      // 气缸
      ctx.strokeStyle = '#666'
      ctx.lineWidth = 3
      ctx.fillStyle = '#E3F2FD'
      ctx.fillRect(60, cylTop, pistonX - 60, cylH)
      ctx.strokeRect(60, cylTop, W - 120, cylH)

      // 活塞
      ctx.fillStyle = '#78909C'
      ctx.fillRect(pistonX, cylTop, 20, cylH)
      ctx.strokeStyle = '#455A64'
      ctx.lineWidth = 2
      ctx.strokeRect(pistonX, cylTop, 20, cylH)

      // 气体分子（示意）
      const gasW = pistonX - 60
      const numMol = Math.floor(10 + pistonPos * 20)
      ctx.fillStyle = 'rgba(33,150,243,0.5)'
      for (let i = 0; i < numMol; i++) {
        const mx = 70 + Math.random() * (gasW - 30)
        const my = cylTop + 15 + Math.random() * (cylH - 30)
        ctx.beginPath()
        ctx.arc(mx, my, 3, 0, Math.PI * 2)
        ctx.fill()
      }

      // 热量箭头（左侧）
      if (heatQ !== 0) {
        const arrowY = (cylTop + cylBot) / 2
        const arrowColor = heatQ > 0 ? '#F44336' : '#2196F3'
        const arrowDir = heatQ > 0 ? 1 : -1
        ctx.strokeStyle = arrowColor
        ctx.fillStyle = arrowColor
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(30, arrowY - arrowDir * 30)
        ctx.lineTo(30, arrowY + arrowDir * 30)
        ctx.stroke()
        // 箭头头
        ctx.beginPath()
        ctx.moveTo(30, arrowY + arrowDir * 30)
        ctx.lineTo(24, arrowY + arrowDir * 20)
        ctx.lineTo(36, arrowY + arrowDir * 20)
        ctx.fill()
        ctx.font = 'bold 12px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(heatQ > 0 ? 'Q>0' : 'Q<0', 30, arrowY - arrowDir * 38)
      }

      // 做功箭头（活塞上方）
      if (workW !== 0) {
        const wColor = workW < 0 ? '#4CAF50' : '#FF9800'
        ctx.strokeStyle = wColor
        ctx.fillStyle = wColor
        ctx.lineWidth = 3
        const wDir = workW < 0 ? -1 : 1
        ctx.beginPath()
        ctx.moveTo(pistonX + 10, cylTop - 15)
        ctx.lineTo(pistonX + 10 + wDir * 40, cylTop - 15)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(pistonX + 10 + wDir * 40, cylTop - 15)
        ctx.lineTo(pistonX + 10 + wDir * 30, cylTop - 21)
        ctx.lineTo(pistonX + 10 + wDir * 30, cylTop - 9)
        ctx.fill()
        ctx.font = 'bold 12px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(workW < 0 ? 'W<0(压缩)' : 'W>0(膨胀)', pistonX + 10 + wDir * 20, cylTop - 28)
      }

      // 公式面板
      const panelX = W - 250, panelY = H * 0.2
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      ctx.strokeStyle = '#ccc'
      ctx.lineWidth = 1
      ctx.fillRect(panelX, panelY, 230, 180)
      ctx.strokeRect(panelX, panelY, 230, 180)

      ctx.fillStyle = '#333'
      ctx.font = 'bold 14px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('热力学第一定律', panelX + 12, panelY + 24)

      ctx.font = '13px sans-serif'
      ctx.fillStyle = '#1565C0'
      ctx.fillText('ΔU = Q + W', panelX + 12, panelY + 48)

      ctx.fillStyle = '#333'
      ctx.font = '12px sans-serif'
      ctx.fillText(`Q (热量) = ${heatQ > 0 ? '+' : ''}${heatQ} J`, panelX + 12, panelY + 72)
      ctx.fillText(`W (做功) = ${workW > 0 ? '+' : ''}${workW} J`, panelX + 12, panelY + 92)
      ctx.fillText(`ΔU (内能变化) = ${deltaU > 0 ? '+' : ''}${deltaU} J`, panelX + 12, panelY + 112)

      ctx.fillStyle = deltaU > 0 ? '#F44336' : deltaU < 0 ? '#2196F3' : '#4CAF50'
      ctx.font = 'bold 13px sans-serif'
      ctx.fillText(deltaU > 0 ? '内能增加 ↑' : deltaU < 0 ? '内能减少 ↓' : '内能不变 =', panelX + 12, panelY + 138)

      ctx.fillStyle = '#666'
      ctx.font = '11px sans-serif'
      const procNames = { isothermal: '等温过程', isobaric: '等压过程', isochoric: '等容过程', adiabatic: '绝热过程' }
      ctx.fillText(`当前: ${procNames[process]}`, panelX + 12, panelY + 162)
    }

    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(cvs)
    return () => ro.disconnect()
  }, [process, heatQ, workW, pistonPos, deltaU])

  // 活塞位置随做功变化
  useEffect(() => {
    setPistonPos(workW < 0 ? Math.max(0.2, 0.5 + workW / 2000) : workW > 0 ? Math.min(0.9, 0.5 - workW / 2000) : 0.5)
  }, [workW])

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>热力学第一定律</span>
        <div style={styles.topActions}>
          {[['isothermal', '等温'], ['isobaric', '等压'], ['isochoric', '等容'], ['adiabatic', '绝热']].map(([k, l]) => (
            <button key={k} style={{ ...styles.setBtn, background: process === k ? '#E53935' : '#7B1FA2' }}
              onClick={() => setProcess(k)}>{l}</button>
          ))}
        </div>
      </div>
      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>Q (热量)</span>
          <input type="range" min="-1000" max="1000" step="50" value={heatQ}
            onChange={e => setHeatQ(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{heatQ > 0 ? '+' : ''}{heatQ} J</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>W (做功)</span>
          <input type="range" min="-1000" max="1000" step="50" value={workW}
            onChange={e => setWorkW(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{workW > 0 ? '+' : ''}{workW} J</span>
        </label>
        <span style={{ fontSize: 13, fontWeight: 700, color: deltaU > 0 ? '#F44336' : deltaU < 0 ? '#2196F3' : '#4CAF50', marginLeft: 'auto' }}>
          ΔU = {deltaU > 0 ? '+' : ''}{deltaU} J
        </span>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      </div>
      <div style={styles.desc}>
        <b>实验：热力学第一定律</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          拖拽滑块调节Q和W，观察内能变化。选择不同过程体会约束条件。
        </span>
      </div>
    </div>
  )
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', maxHeight: '100vh', background: '#e8e8e8', color: '#333', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', overflow: 'hidden' },
  topBar: { background: '#f5f5f5', borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', flexShrink: 0 },
  title: { fontSize: 14, fontWeight: 600 },
  topActions: { display: 'flex', gap: 6 },
  controlBar: { background: '#fafafa', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', padding: '4px 12px', flexShrink: 0, gap: 12 },
  controlLabel: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#555' },
  controlName: { fontWeight: 600, color: '#4A90D9' },
  slider: { width: 140, accentColor: '#4A90D9' },
  sliderVal: { color: '#4A90D9', fontWeight: 600, fontSize: 12, minWidth: 60 },
  setBtn: { background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
  main: { flex: 1, minHeight: 0, background: '#fff' },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
}
