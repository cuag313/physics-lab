import { useRef, useState, useCallback, useEffect } from 'react'
import useAudio from '../audio/useAudio'

/**
 * SoundDopplerScene — 多普勒效应
 *
 * 声源移动 → 接收频率变化
 * - 声源速度可调
 * - 动画展示声波传播
 * - 实时频率显示
 */
export default function SoundDopplerScene() {
  const audio = useAudio()
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const [playing, setPlaying] = useState(false)
  const [sourceFreq, setSourceFreq] = useState(440)
  const [sourceSpeed, setSourceSpeed] = useState(30) // m/s
  const [volume, setVolume] = useState(0.3)
  const [time, setTime] = useState(0)
  const [sourceDir, setSourceDir] = useState(1) // 1=向右, -1=向左

  const v_sound = 340

  // 多普勒公式：f' = f * v / (v - vs)  （声源朝向观察者）
  // vs > 0 朝向观察者，vs < 0 远离
  const observedFreq = sourceFreq * v_sound / (v_sound - sourceSpeed * sourceDir)

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      setTime(t => t + 0.03)
      audio.setFrequency(0, Math.max(20, Math.min(4000, observedFreq)))
    }, 30)
    return () => clearInterval(id)
  }, [playing, observedFreq])

  const handlePlay = useCallback(() => {
    audio.play(observedFreq, 'sine', volume); setPlaying(true)
  }, [observedFreq, volume])

  const handleStop = useCallback(() => {
    audio.stop(); setPlaying(false); setTime(0)
  }, [])

  // 绘制动画
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
    const observerX = cx + 150
    const t = time

    // 声源位置（来回移动）
    const sourceX = cx - 100 + sourceDir * sourceSpeed * t * 2

    // 声波圆环（从声源位置发出）
    const waveAge = t * 2
    const waveSpeed = v_sound * 0.3 // 像素缩放
    for (let i = 0; i < 12; i++) {
      const age = waveAge - i * 0.15
      if (age < 0) continue
      const r = age * waveSpeed
      const alpha = Math.max(0, 0.3 - i * 0.025)
      ctx.strokeStyle = `rgba(25,118,210,${alpha})`
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(sourceX, cy, r, 0, Math.PI * 2)
      ctx.stroke()
    }

    // 声源
    ctx.fillStyle = '#D32F2F'
    ctx.beginPath(); ctx.arc(sourceX, cy, 12, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('S', sourceX, cy)

    // 速度箭头
    if (sourceSpeed > 0) {
      const arrowLen = Math.min(40, sourceSpeed * 1.5)
      const ax = sourceX + sourceDir * 20
      ctx.strokeStyle = '#D32F2F'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(sourceX, cy); ctx.lineTo(ax, cy); ctx.stroke()
      ctx.fillStyle = '#D32F2F'
      ctx.beginPath()
      ctx.moveTo(ax, cy)
      ctx.lineTo(ax - sourceDir * 8, cy - 5)
      ctx.lineTo(ax - sourceDir * 8, cy + 5)
      ctx.closePath(); ctx.fill()
    }

    // 观察者
    ctx.fillStyle = '#1976D2'
    ctx.beginPath(); ctx.arc(observerX, cy, 10, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'
    ctx.fillText('R', observerX, cy)

    // 频率标注
    ctx.fillStyle = '#333'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(`声源: ${sourceFreq} Hz`, sourceX, cy - 30)
    ctx.fillStyle = observedFreq > sourceFreq ? '#E53935' : observedFreq < sourceFreq ? '#1976D2' : '#333'
    ctx.font = 'bold 12px sans-serif'
    ctx.fillText(`接收: ${observedFreq.toFixed(1)} Hz`, observerX, cy - 30)

    // 趋近/远离提示
    ctx.font = '11px sans-serif'
    if (sourceSpeed === 0) {
      ctx.fillStyle = '#888'; ctx.fillText('声源静止，频率不变', cx, cy + 60)
    } else if (observedFreq > sourceFreq) {
      ctx.fillStyle = '#E53935'; ctx.fillText('↑ 趋近：频率升高（音调变高）', cx, cy + 60)
    } else {
      ctx.fillStyle = '#1976D2'; ctx.fillText('↓ 远离：频率降低（音调变低）', cx, cy + 60)
    }

    animRef.current = requestAnimationFrame(() => {})
  }, [playing, time, sourceFreq, sourceSpeed, sourceDir, observedFreq])

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>多普勒效应</span>
        <div style={styles.topActions}>
          {!playing ? (
            <button style={styles.playBtn} onClick={handlePlay}>▶ 发声</button>
          ) : (
            <button style={styles.stopBtn} onClick={handleStop}>⏹ 停止</button>
          )}
          <div style={styles.sep} />
          <button style={sourceDir === 1 ? styles.tabActive : styles.tab}
            onClick={() => setSourceDir(1)}>→ 趋近</button>
          <button style={sourceDir === -1 ? styles.tabActive : styles.tab}
            onClick={() => setSourceDir(-1)}>← 远离</button>
        </div>
      </div>

      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>声源频率</span>
          <input type="range" min="100" max="1000" step="10" value={sourceFreq}
            onChange={(e) => setSourceFreq(parseInt(e.target.value))} style={styles.slider} />
          <span style={styles.sliderVal}>{sourceFreq} Hz</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>声源速度</span>
          <input type="range" min="0" max="150" step="1" value={sourceSpeed}
            onChange={(e) => setSourceSpeed(parseInt(e.target.value))} style={styles.slider} />
          <span style={styles.sliderVal}>{sourceSpeed} m/s</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>音量</span>
          <input type="range" min="0" max="0.5" step="0.01" value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))} style={styles.slider} />
        </label>
      </div>

      <div style={styles.main}>
        <div style={styles.graphArea}>
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>

        <div style={styles.infoPanel}>
          <div style={styles.panelTitle}>📊 频率对比</div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>声源频率 f₀</span><span style={styles.panelValue}>{sourceFreq} Hz</span></div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>接收频率 f'</span><span style={{ ...styles.panelValue, color: observedFreq > sourceFreq ? '#E53935' : '#1976D2' }}>{observedFreq.toFixed(1)} Hz</span></div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>频率变化</span><span style={{ ...styles.panelValue, color: observedFreq >= sourceFreq ? '#E53935' : '#1976D2' }}>{(observedFreq - sourceFreq).toFixed(1)} Hz</span></div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>声源速度</span><span style={styles.panelValue}>{sourceSpeed} m/s ({(sourceSpeed / v_sound * 100).toFixed(1)}%声速)</span></div>
          <div style={styles.divider} />
          <div style={styles.panelTitle}>📖 多普勒公式</div>
          <div style={styles.tipText}>
            <b>f' = f₀ × v / (v - vₛ)</b><br /><br />
            f₀：声源频率<br />
            v：声速 = 340 m/s<br />
            vₛ：声源速度<br />
            （趋近为正，远离为负）<br /><br />
            <b>趋近</b>：f' &gt; f₀，音调升高<br />
            <b>远离</b>：f' &lt; f₀，音调降低<br /><br />
            <b>应用：</b><br />
            救护车驶过音调变化<br />
            雷达测速<br />
            天体红移/蓝移
          </div>
        </div>
      </div>

      <div style={styles.desc}>
        <b>实验：多普勒效应</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          调节声源频率和速度，选择趋近/远离，听接收频率的变化。观察声波圆环的疏密变化。
        </span>
      </div>
    </div>
  )
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', maxHeight: '100vh', background: '#e8e8e8', color: '#333', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', overflow: 'hidden' },
  topBar: { background: '#f5f5f5', borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', flexShrink: 0, flexWrap: 'wrap', gap: 6 },
  title: { fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' },
  topActions: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  controlBar: { background: '#fafafa', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', padding: '4px 12px', flexShrink: 0, gap: 8, overflowX: 'auto' },
  controlLabel: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#555', whiteSpace: 'nowrap' },
  controlName: { fontWeight: 600, color: '#4A90D9' },
  slider: { width: 100, accentColor: '#4A90D9' },
  sliderVal: { color: '#4A90D9', fontWeight: 600, fontSize: 12, minWidth: 50 },
  playBtn: { background: '#4CAF50', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  stopBtn: { background: '#E53935', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  sep: { width: 1, height: 18, background: '#ccc' },
  tab: { background: '#fff', color: '#555', border: '1px solid #ccc', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer' },
  tabActive: { background: '#4A90D9', color: '#fff', border: '1px solid #4A90D9', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 },
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
