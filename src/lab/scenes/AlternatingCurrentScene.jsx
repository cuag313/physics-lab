import { useState, useRef, useEffect } from 'react'

/**
 * AlternatingCurrentScene — 交流电的产生与描述
 * 线圈在磁场中转动产生交流电
 */
export default function AlternatingCurrentScene() {
  const [frequency, setFrequency] = useState(50)
  const [turns, setTurns] = useState(10)
  const [area, setArea] = useState(100)
  const [B, setB] = useState(1)
  const canvasRef = useRef(null)
  const S = useRef({ angle: 0, raf: null, last: 0, data: [] })

  useEffect(() => {
    S.current.data = []
  }, [frequency, turns, area, B])

  useEffect(() => {
    const cvs = canvasRef.current
    if (!cvs) return
    const ctx = cvs.getContext('2d')

    const loop = (ts) => {
      const dt = Math.min((ts - (S.current.last || ts)) / 1000, 0.05)
      S.current.last = ts
      S.current.angle += frequency * 2 * Math.PI * dt

      const W = cvs.clientWidth, H = cvs.clientHeight
      cvs.width = W * devicePixelRatio; cvs.height = H * devicePixelRatio
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      ctx.clearRect(0, 0, W, H)

      const omega = frequency * 2 * Math.PI
      const peakE = turns * B * area * 1e-4 * omega
      const emf = peakE * Math.sin(S.current.angle)

      // 记录波形数据
      const period = 1 / frequency
      const maxPoints = Math.floor(period * 60 * 3) // 3个周期
      if (S.current.data.length < maxPoints) {
        S.current.data.push(emf)
      } else {
        S.current.data.shift()
        S.current.data.push(emf)
      }

      // 左侧：发电机示意
      const genCx = 120, genCy = H / 2
      // 磁铁
      ctx.fillStyle = '#E53935'
      ctx.fillRect(genCx - 60, genCy - 80, 20, 160)
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 14px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('N', genCx - 50, genCy)

      ctx.fillStyle = '#1565C0'
      ctx.fillRect(genCx + 40, genCy - 80, 20, 160)
      ctx.fillStyle = '#fff'
      ctx.fillText('S', genCx + 50, genCy)

      // 线圈（旋转）
      ctx.save()
      ctx.translate(genCx, genCy)
      ctx.rotate(S.current.angle)
      ctx.strokeStyle = '#E65100'
      ctx.lineWidth = 3
      ctx.strokeRect(-15, -50, 30, 100)
      // 转轴
      ctx.fillStyle = '#666'
      ctx.beginPath()
      ctx.arc(0, 0, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      // 滑环+电刷
      ctx.fillStyle = '#888'
      ctx.beginPath()
      ctx.arc(genCx, genCy - 55, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(genCx, genCy + 55, 6, 0, Math.PI * 2)
      ctx.fill()

      // 右侧：波形图
      const graphX = 250, graphY = 30, graphW = W - 290, graphH = H - 100
      if (graphW > 100) {
        // 坐标轴
        ctx.strokeStyle = '#999'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(graphX, graphY + graphH / 2)
        ctx.lineTo(graphX + graphW, graphY + graphH / 2)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(graphX, graphY)
        ctx.lineTo(graphX, graphY + graphH)
        ctx.stroke()

        // 波形
        if (S.current.data.length > 1) {
          ctx.strokeStyle = '#E53935'
          ctx.lineWidth = 2
          ctx.beginPath()
          for (let i = 0; i < S.current.data.length; i++) {
            const x = graphX + (i / S.current.data.length) * graphW
            const y = graphY + graphH / 2 - (S.current.data[i] / peakE) * (graphH / 2 * 0.9)
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
          }
          ctx.stroke()
        }

        // 标注
        ctx.fillStyle = '#E53935'
        ctx.font = 'bold 12px sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText(`ε = NBAω·sin(ωt)`, graphX + 10, graphY + 15)
        ctx.fillStyle = '#333'
        ctx.font = '12px sans-serif'
        ctx.fillText(`峰值 εm = ${peakE.toFixed(2)} V`, graphX + 10, graphY + 32)
        ctx.fillText(`有效值 ε = ${(peakE / Math.sqrt(2)).toFixed(2)} V`, graphX + 10, graphY + 49)
        ctx.fillText(`频率 f = ${frequency} Hz`, graphX + 10, graphY + 66)
        ctx.fillText(`周期 T = ${(1000 / frequency).toFixed(1)} ms`, graphX + 10, graphY + 83)

        // 当前值
        ctx.fillStyle = '#E53935'
        ctx.font = 'bold 16px sans-serif'
        ctx.fillText(`ε = ${emf.toFixed(2)} V`, graphX + graphW - 160, graphY + 15)

        // 刻度
        ctx.fillStyle = '#999'
        ctx.font = '10px sans-serif'
        ctx.textAlign = 'center'
        for (let i = 0; i <= 6; i++) {
          const x = graphX + i * graphW / 6
          ctx.fillText(`${(i * period * 1000).toFixed(0)}ms`, x, graphY + graphH + 15)
        }
      }

      // 公式面板
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      ctx.fillRect(20, H - 60, 500, 40)
      ctx.fillStyle = '#333'
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(`ε = NBAω·sin(ωt) | εm = ${peakE.toFixed(2)}V | ε有效 = ${(peakE / Math.sqrt(2)).toFixed(2)}V | f=${frequency}Hz | ω=${(omega).toFixed(1)}rad/s`, 30, H - 36)

      S.current.raf = requestAnimationFrame(loop)
    }
    S.current.raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(S.current.raf)
  }, [frequency, turns, area, B])

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>交流电的产生与描述</span>
        <div style={styles.topActions}>
          <button style={styles.setBtn} onClick={() => { setFrequency(50); setTurns(10); setArea(100); setB(1); S.current.data = [] }}>⚙ 重置</button>
        </div>
      </div>
      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>频率 f</span>
          <input type="range" min="10" max="200" step="5" value={frequency} onChange={e => setFrequency(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{frequency} Hz</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>匝数 N</span>
          <input type="range" min="1" max="50" step="1" value={turns} onChange={e => setTurns(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{turns}</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>磁感应强度 B</span>
          <input type="range" min="0.1" max="3" step="0.1" value={B} onChange={e => setB(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{B.toFixed(1)} T</span>
        </label>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      </div>
      <div style={styles.desc}>
        <b>实验：交流电的产生</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          线圈在磁场中匀速转动，产生正弦交流电。调节频率、匝数、磁感应强度观察波形变化。
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
