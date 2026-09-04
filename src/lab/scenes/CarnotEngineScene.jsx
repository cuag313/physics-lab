import { useState, useRef, useEffect } from 'react'

/**
 * CarnotEngineScene — 卡诺循环与热机效率
 *
 * - 四个过程：等温膨胀→绝热膨胀→等温压缩→绝热压缩
 * - p-V图动画
 * - 效率计算 η = 1 - T₂/T₁
 * - 热力学第二定律
 */
export default function CarnotEngineScene() {
  const canvasRef = useRef(null)
  const [T1, setT1] = useState(600) // 高温热源 K
  const [T2, setT2] = useState(300) // 低温热源 K
  const [step, setStep] = useState(0) // 0~3 四个过程
  const [progress, setProgress] = useState(0) // 0~1 当前过程进度
  const [playing, setPlaying] = useState(false)
  const S = useRef({ raf: null, last: 0 })

  const eta = 1 - T2 / T1
  const stepNames = ['等温膨胀', '绝热膨胀', '等温压缩', '绝热压缩']
  const stepColors = ['#F44336', '#FF9800', '#2196F3', '#4CAF50']

  // 卡诺循环 p-V 关系（简化模型）
  // V1 < V2 < V3 < V4
  const nR = 1 // 简化 nR=1
  const V1 = 1, V4 = 3
  const gamma = 1.4 // 空气 γ=Cp/Cv

  // 由 T1, T2 和 V1, V4 计算各状态点
  // 等温膨胀: pV = nRT₁, V: V1→V2
  // 绝热膨胀: TV^(γ-1)=const, T₁V₂^(γ-1) = T₂V₃^(γ-1)
  const V2 = V4 // 简化：取 V2=V4 对称
  const V3 = V2 * Math.pow(T1 / T2, 1 / (gamma - 1))
  // 等温压缩: pV = nRT₂, V: V3→V4
  // 实际上应该更复杂，这里用简化模型

  const states = [
    { V: V1, T: T1, p: nR * T1 / V1 },
    { V: V2, T: T1, p: nR * T1 / V2 },
    { V: V3, T: T2, p: nR * T2 / V3 },
    { V: V4, T: T2, p: nR * T2 / V4 },
  ]

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

      const margin = { top: 30, right: 30, bottom: 50, left: 60 }
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

      // p-V 范围
      const allV = states.map(s => s.V)
      const allP = states.map(s => s.p)
      const vMin = Math.min(...allV) * 0.8, vMax = Math.max(...allV) * 1.2
      const pMin = 0, pMax = Math.max(...allP) * 1.3

      const toX = V => margin.left + (V - vMin) / (vMax - vMin) * gw
      const toY = p => margin.top + gh - (p - pMin) / (pMax - pMin) * gh

      // 刻度
      ctx.fillStyle = '#333'
      ctx.font = 'bold 13px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('体积 V', margin.left + gw / 2, H - 8)
      ctx.save()
      ctx.translate(15, margin.top + gh / 2)
      ctx.rotate(-Math.PI / 2)
      ctx.fillText('压强 p', 0, 0)
      ctx.restore()

      // 网格
      ctx.strokeStyle = '#f0f0f0'
      ctx.lineWidth = 1
      for (let i = 0; i <= 5; i++) {
        const y = margin.top + gh * i / 5
        ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(margin.left + gw, y); ctx.stroke()
      }

      // 绘制循环路径
      ctx.strokeStyle = '#333'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 3])

      // 等温线 T1 (V1→V2)
      ctx.beginPath()
      for (let v = V1; v <= V2; v += 0.02) {
        const p = nR * T1 / v
        const x = toX(v), y = toY(p)
        if (v === V1) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = '#F44336'
      ctx.stroke()

      // 绝热线 T1→T2 (V2→V3)
      ctx.beginPath()
      for (let v = V2; v <= V3; v += 0.02) {
        const p = nR * T1 * Math.pow(V2, gamma - 1) / Math.pow(v, gamma)
        const x = toX(v), y = toY(p)
        if (v === V2) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = '#FF9800'
      ctx.stroke()

      // 等温线 T2 (V3→V4)
      ctx.beginPath()
      for (let v = V3; v >= V4; v -= 0.02) {
        const p = nR * T2 / v
        const x = toX(v), y = toY(p)
        if (v === V3) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = '#2196F3'
      ctx.stroke()

      // 绝热线 T2→T1 (V4→V1)
      ctx.beginPath()
      for (let v = V4; v >= V1; v -= 0.02) {
        const p = nR * T2 * Math.pow(V4, gamma - 1) / Math.pow(v, gamma)
        const x = toX(v), y = toY(p)
        if (v === V4) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = '#4CAF50'
      ctx.stroke()

      ctx.setLineDash([])

      // 状态点
      states.forEach((s, i) => {
        ctx.fillStyle = stepColors[i]
        ctx.beginPath()
        ctx.arc(toX(s.V), toY(s.p), 6, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#333'
        ctx.font = 'bold 11px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(`${i + 1}`, toX(s.V), toY(s.p) - 12)
      })

      // 当前播放位置
      if (playing || progress > 0) {
        const s0 = states[step]
        const s1 = states[(step + 1) % 4]
        const t = progress
        const curV = s0.V + (s1.V - s0.V) * t
        let curP
        if (step === 0 || step === 2) { // 等温
          const T = step === 0 ? T1 : T2
          curP = nR * T / curV
        } else { // 绝热（近似线性插值）
          curP = s0.p + (s1.p - s0.p) * t
        }
        ctx.fillStyle = '#E91E63'
        ctx.beginPath()
        ctx.arc(toX(curV), toY(curP), 8, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 2
        ctx.stroke()
      }

      // 信息面板
      const panelX = W - 260, panelY = margin.top + 10
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      ctx.fillRect(panelX, panelY, 245, 200)
      ctx.strokeStyle = '#ccc'
      ctx.strokeRect(panelX, panelY, 245, 200)

      ctx.fillStyle = '#333'
      ctx.font = 'bold 14px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('卡诺循环', panelX + 12, panelY + 24)

      ctx.font = '12px sans-serif'
      ctx.fillText(`高温热源 T₁ = ${T1} K`, panelX + 12, panelY + 48)
      ctx.fillText(`低温热源 T₂ = ${T2} K`, panelX + 12, panelY + 68)
      ctx.fillStyle = '#E53935'
      ctx.font = 'bold 13px sans-serif'
      ctx.fillText(`效率 η = 1 - T₂/T₁ = ${(eta * 100).toFixed(1)}%`, panelX + 12, panelY + 92)

      ctx.fillStyle = '#333'
      ctx.font = '11px sans-serif'
      stepNames.forEach((name, i) => {
        ctx.fillStyle = stepColors[i]
        ctx.fillText(`${i + 1}→${(i + 1) % 4 + 1} ${name}`, panelX + 12, panelY + 116 + i * 18)
      })

      ctx.fillStyle = '#666'
      ctx.font = '11px sans-serif'
      ctx.fillText(`当前: ${stepNames[step]} (${(progress * 100).toFixed(0)}%)`, panelX + 12, panelY + 190)
    }

    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(cvs)
    return () => ro.disconnect()
  }, [T1, T2, step, progress, playing, eta, states, stepNames, stepColors, gamma, nR])

  // 动画播放
  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    const tick = (now) => {
      const dt = (now - last) / 1000
      last = now
      setProgress(p => {
        const np = p + dt * 0.3 // 速度
        if (np >= 1) {
          setStep(s => (s + 1) % 4)
          return 0
        }
        return np
      })
      S.current.raf = requestAnimationFrame(tick)
    }
    S.current.raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(S.current.raf)
  }, [playing])

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>卡诺循环与热机效率</span>
        <div style={styles.topActions}>
          <button style={{ ...styles.setBtn, background: playing ? '#E53935' : '#4CAF50' }}
            onClick={() => setPlaying(p => !p)}>{playing ? '⏸ 暂停' : '▶ 播放'}</button>
          <button style={styles.setBtn} onClick={() => { setStep(0); setProgress(0); setPlaying(false) }}>⚙ 重置</button>
        </div>
      </div>
      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>T₁ (高温)</span>
          <input type="range" min="400" max="1000" step="10" value={T1}
            onChange={e => setT1(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{T1} K</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>T₂ (低温)</span>
          <input type="range" min="200" max="500" step="10" value={T2}
            onChange={e => setT2(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{T2} K</span>
        </label>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#E53935', marginLeft: 'auto' }}>
          η = {(eta * 100).toFixed(1)}%
        </span>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      </div>
      <div style={styles.desc}>
        <b>实验：卡诺循环</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          调节高/低温热源温度，观察p-V图变化。播放动画查看四个过程。效率 η = 1 - T₂/T₁。
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
  slider: { width: 130, accentColor: '#4A90D9' },
  sliderVal: { color: '#4A90D9', fontWeight: 600, fontSize: 12, minWidth: 55 },
  setBtn: { background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
  main: { flex: 1, minHeight: 0, background: '#fff' },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
}
