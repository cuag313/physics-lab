import { useRef, useState, useCallback, useEffect } from 'react'
import useAudio from '../audio/useAudio'

/**
 * SoundStringScene — 弦振动与驻波
 *
 * - 弦长/张力/线密度可调
 * - 基频+谐波发声+波形可视化
 * - 驻波动画（两端固定）
 */
export default function SoundStringScene() {
  const audio = useAudio()
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const [playing, setPlaying] = useState(false)
  const [length, setLength] = useState(1.0)      // 弦长 m
  const [tension, setTension] = useState(100)     // 张力 N
  const [linearDensity, setLinearDensity] = useState(0.005) // 线密度 kg/m
  const [harmonic, setHarmonic] = useState(1)     // 第几谐波
  const [volume, setVolume] = useState(0.3)
  const [time, setTime] = useState(0)

  // 基频 f = (1/2L) * √(T/μ)
  const fundamental = (1 / (2 * length)) * Math.sqrt(tension / linearDensity)
  const currentFreq = fundamental * harmonic

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      setTime(t => t + 0.03)
      audio.setFrequency(0, currentFreq)
    }, 30)
    return () => clearInterval(id)
  }, [playing, currentFreq])

  const handlePlay = useCallback(() => {
    audio.play(currentFreq, 'sine', volume); setPlaying(true)
  }, [currentFreq, volume])

  const handleStop = useCallback(() => {
    audio.stop(); setPlaying(false); setTime(0)
  }, [])

  // 绘制驻波动画
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)
    const w = rect.width, h = rect.height

    ctx.fillStyle = 'rgba(255,255,255,0.97)'
    ctx.fillRect(0, 0, w, h)

    const cx = w / 2, cy = h / 2
    const strLen = Math.min(w * 0.8, 500)
    const amp = Math.min(40, 150 / harmonic) // 谐波越高振幅越小

    // 弦平衡位置
    ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(cx - strLen / 2, cy); ctx.lineTo(cx + strLen / 2, cy); ctx.stroke()

    // 驻波：y(x,t) = A * sin(nπx/L) * cos(ωt)
    ctx.strokeStyle = '#1976D2'; ctx.lineWidth = 3; ctx.lineJoin = 'round'
    ctx.beginPath()
    for (let i = 0; i <= 200; i++) {
      const x = (i / 200) * strLen
      const xn = cx - strLen / 2 + x
      const envelope = Math.sin(harmonic * Math.PI * x / (strLen / (w * 0.8 / strLen)))
      const vibration = Math.cos(2 * Math.PI * currentFreq * time * 0.001)
      const y = cy + amp * envelope * vibration * (playing ? 1 : 0)
      if (i === 0) ctx.moveTo(xn, y); else ctx.lineTo(xn, y)
    }
    ctx.stroke()

    // 波腹标记（红色）
    for (let n = 1; n < harmonic; n += 2) {
      const ax = cx - strLen / 2 + (n / harmonic) * strLen / 2
      if (playing) {
        ctx.fillStyle = 'rgba(229,57,53,0.4)'
        ctx.beginPath(); ctx.arc(ax, cy, 4, 0, Math.PI * 2); ctx.fill()
      }
    }

    // 波节标记（蓝色）
    for (let n = 0; n <= harmonic; n++) {
      const jx = cx - strLen / 2 + (n / harmonic) * strLen / 2
      ctx.fillStyle = '#1976D2'
      ctx.beginPath(); ctx.arc(jx, cy, 3, 0, Math.PI * 2); ctx.fill()
    }

    // 端点
    ctx.fillStyle = '#333'
    ctx.fillRect(cx - strLen / 2 - 4, cy - 12, 8, 24)
    ctx.fillRect(cx + strLen / 2 - 4, cy - 12, 8, 24)

    // 标注
    ctx.fillStyle = '#666'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(`L = ${length.toFixed(2)} m`, cx, cy + amp + 30)
    ctx.fillText(`f${harmonic} = ${currentFreq.toFixed(1)} Hz`, cx, cy - amp - 16)

    // 弦长标注线
    ctx.strokeStyle = 'rgba(100,100,100,0.3)'; ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(cx - strLen / 2, cy + amp + 15); ctx.lineTo(cx + strLen / 2, cy + amp + 15)
    ctx.stroke()

    animRef.current = requestAnimationFrame(() => {})
  }, [playing, time, harmonic, currentFreq, length, tension, linearDensity])

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>弦振动与驻波</span>
        <div style={styles.topActions}>
          {!playing ? (
            <button style={styles.playBtn} onClick={handlePlay}>▶ 发声</button>
          ) : (
            <button style={styles.stopBtn} onClick={handleStop}>⏹ 停止</button>
          )}
          <div style={styles.sep} />
          {[1,2,3,4,5].map(n => (
            <button key={n} style={harmonic === n ? styles.tabActive : styles.tab}
              onClick={() => setHarmonic(n)}>
              {n}次谐波
            </button>
          ))}
        </div>
      </div>

      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>弦长 L</span>
          <input type="range" min="0.3" max="2" step="0.05" value={length}
            onChange={(e) => setLength(parseFloat(e.target.value))} style={styles.slider} />
          <span style={styles.sliderVal}>{length.toFixed(2)} m</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>张力 T</span>
          <input type="range" min="20" max="500" step="5" value={tension}
            onChange={(e) => setTension(parseFloat(e.target.value))} style={styles.slider} />
          <span style={styles.sliderVal}>{tension} N</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>线密度 μ</span>
          <input type="range" min="0.001" max="0.02" step="0.001" value={linearDensity}
            onChange={(e) => setLinearDensity(parseFloat(e.target.value))} style={styles.slider} />
          <span style={styles.sliderVal}>{(linearDensity * 1000).toFixed(0)} g/m</span>
        </label>
      </div>

      <div style={styles.main}>
        <div style={styles.graphArea}>
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>

        <div style={styles.infoPanel}>
          <div style={styles.panelTitle}>📊 弦参数</div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>弦长 L</span><span style={styles.panelValue}>{length.toFixed(2)} m</span></div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>张力 T</span><span style={styles.panelValue}>{tension} N</span></div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>线密度 μ</span><span style={styles.panelValue}>{(linearDensity * 1000).toFixed(0)} g/m</span></div>
          <div style={styles.divider} />
          <div style={styles.panelTitle}>🎵 频率</div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>基频 f₁</span><span style={styles.panelValue}>{fundamental.toFixed(1)} Hz</span></div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>当前 f{harmonic}</span><span style={{ ...styles.panelValue, color: '#E53935' }}>{currentFreq.toFixed(1)} Hz</span></div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>谐波序号</span><span style={styles.panelValue}>第 {harmonic} 次</span></div>
          <div style={styles.divider} />
          <div style={styles.panelTitle}>📖 弦振动公式</div>
          <div style={styles.tipText}>
            <b>f = n/(2L) × √(T/μ)</b><br /><br />
            n：谐波序号 (1,2,3...)<br />
            L：弦长 ↑ → f ↓<br />
            T：张力 ↑ → f ↑<br />
            μ：线密度 ↑ → f ↓<br /><br />
            <b>驻波条件：</b><br />
            弦长 = 半波长整数倍<br />
            L = nλ/2<br /><br />
            <b>波节</b>（蓝点）：不动<br />
            <b>波腹</b>（红点）：振幅最大
          </div>
        </div>
      </div>

      <div style={styles.desc}>
        <b>实验：弦振动与驻波</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          调节弦长/张力/线密度，选择谐波序号，观察驻波形态，听不同谐波的音调。
        </span>
      </div>
    </div>
  )
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', maxHeight: '100vh', background: '#e8e8e8', color: '#333', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', overflow: 'hidden' },
  topBar: { background: '#f5f5f5', borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', flexShrink: 0, flexWrap: 'wrap', gap: 6 },
  title: { fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' },
  topActions: { display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  controlBar: { background: '#fafafa', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', padding: '4px 12px', flexShrink: 0, gap: 8, overflowX: 'auto' },
  controlLabel: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#555', whiteSpace: 'nowrap' },
  controlName: { fontWeight: 600, color: '#4A90D9' },
  slider: { width: 80, accentColor: '#4A90D9' },
  sliderVal: { color: '#4A90D9', fontWeight: 600, fontSize: 12, minWidth: 45 },
  playBtn: { background: '#4CAF50', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  stopBtn: { background: '#E53935', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  sep: { width: 1, height: 18, background: '#ccc' },
  tab: { background: '#fff', color: '#555', border: '1px solid #ccc', borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer' },
  tabActive: { background: '#4A90D9', color: '#fff', border: '1px solid #4A90D9', borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer', fontWeight: 600 },
  main: { flex: 1, display: 'flex', overflow: 'hidden', background: '#fff', minHeight: 0 },
  graphArea: { flex: 1, padding: 8, minHeight: 0 },
  infoPanel: { width: 200, background: 'rgba(255,255,255,0.95)', borderLeft: '1px solid #ddd', padding: 12, flexShrink: 0, overflowY: 'auto' },
  panelTitle: { fontSize: 12, fontWeight: 700, color: '#333', marginBottom: 8 },
  panelRow: { display: 'flex', justifyContent: 'space-between', marginBottom: 5 },
  panelLabel: { fontSize: 11, color: '#666' },
  panelValue: { fontSize: 12, fontWeight: 600, color: '#1976D2' },
  divider: { height: 1, background: '#eee', margin: '10px 0' },
  tipText: { fontSize: 10, color: '#777', lineHeight: 1.6 },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
}
