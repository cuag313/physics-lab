import { useRef, useState, useCallback, useEffect } from 'react'
import useAudio from '../audio/useAudio'

/**
 * SoundResonanceScene — 共振实验
 *
 * 扫频驱动→找到固有频率→振幅最大（共振）
 * - 可调固有频率（被驱动物体）
 * - 驱动频率滑块扫描
 * - 振幅响应曲线（共振峰）
 */
export default function SoundResonanceScene() {
  const audio = useAudio()
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const [playing, setPlaying] = useState(false)
  const [driveFreq, setDriveFreq] = useState(100)
  const [naturalFreq, setNaturalFreq] = useState(300)
  const [volume, setVolume] = useState(0.4)
  const [sweeping, setSweeping] = useState(false)
  const sweepRef = useRef(null)
  const historyRef = useRef([]) // {drive, amplitude}

  // 共振振幅：洛伦兹型响应
  const getAmplitude = useCallback((df, nf) => {
    const ratio = df / nf
    // 共振峰在 ratio=1，阻尼带宽0.05
    const dampBW = 0.05
    const amp = 1 / Math.sqrt((1 - ratio * ratio) ** 2 + (2 * dampBW * ratio) ** 2)
    return Math.min(amp, 8) // 限幅
  }, [])

  useEffect(() => {
    if (playing) audio.setFrequency(0, driveFreq)
  }, [driveFreq, playing])

  useEffect(() => {
    if (playing) audio.setVolume(0, volume * Math.min(getAmplitude(driveFreq, naturalFreq) / 5, 1))
  }, [driveFreq, naturalFreq, volume, playing])

  const handlePlay = useCallback(() => {
    audio.play(driveFreq, 'sine', volume); setPlaying(true)
    historyRef.current = []
  }, [driveFreq, volume])

  const handleStop = useCallback(() => {
    audio.stop(); setPlaying(false); setSweeping(false)
    if (sweepRef.current) clearInterval(sweepRef.current)
  }, [])

  const handleSweep = useCallback(() => {
    if (sweeping) {
      setSweeping(false)
      if (sweepRef.current) clearInterval(sweepRef.current)
      return
    }
    if (!playing) {
      audio.play(20, 'sine', volume); setPlaying(true)
    }
    historyRef.current = []
    setSweeping(true)
    let f = 20
    sweepRef.current = setInterval(() => {
      f += 5
      if (f > 800) {
        setSweeping(false)
        clearInterval(sweepRef.current)
        return
      }
      setDriveFreq(f)
      const amp = getAmplitude(f, naturalFreq)
      historyRef.current.push({ drive: f, amplitude: amp })
    }, 50)
  }, [sweeping, playing, volume, naturalFreq])

  // 绘制共振曲线
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

    const ox = 45, oy = 20, pw = w - ox - 15, ph = h - oy - 30

    // 网格
    ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.lineWidth = 0.5
    for (let i = 1; i <= 4; i++) {
      const y = oy + ph * i / 4
      ctx.beginPath(); ctx.moveTo(ox, y); ctx.lineTo(ox + pw, y); ctx.stroke()
    }

    // 坐标轴
    ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, oy + ph); ctx.lineTo(ox + pw, oy + ph); ctx.stroke()

    // 理论共振曲线（灰色）
    ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 1; ctx.beginPath()
    for (let f = 20; f <= 800; f += 2) {
      const x = ox + ((f - 20) / 780) * pw
      const amp = getAmplitude(f, naturalFreq)
      const y = oy + ph - (Math.min(amp, 8) / 8) * ph
      if (f === 20) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.stroke()

    // 扫频历史（蓝色）
    if (historyRef.current.length > 1) {
      ctx.strokeStyle = '#1976D2'; ctx.lineWidth = 2; ctx.beginPath()
      for (let i = 0; i < historyRef.current.length; i++) {
        const p = historyRef.current[i]
        const x = ox + ((p.drive - 20) / 780) * pw
        const y = oy + ph - (Math.min(p.amplitude, 8) / 8) * ph
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }

    // 当前驱动频率标记
    const curX = ox + ((driveFreq - 20) / 780) * pw
    const curAmp = getAmplitude(driveFreq, naturalFreq)
    const curY = oy + ph - (Math.min(curAmp, 8) / 8) * ph
    ctx.fillStyle = '#E53935'
    ctx.beginPath(); ctx.arc(curX, curY, 5, 0, Math.PI * 2); ctx.fill()

    // 固有频率标记线
    const nfX = ox + ((naturalFreq - 20) / 780) * pw
    ctx.strokeStyle = 'rgba(255,152,0,0.4)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3])
    ctx.beginPath(); ctx.moveTo(nfX, oy); ctx.lineTo(nfX, oy + ph); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#FF9800'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(`f₀=${naturalFreq}`, nfX, oy - 4)

    // 刻度
    ctx.fillStyle = 'rgba(100,100,100,0.5)'; ctx.font = '8px monospace'
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    for (let f = 100; f <= 800; f += 100) {
      const x = ox + ((f - 20) / 780) * pw
      ctx.fillText(`${f}`, x, oy + ph + 4)
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
    ctx.fillText('A', ox - 4, oy)
    ctx.fillText('0', ox - 4, oy + ph)
    ctx.textAlign = 'center'
    ctx.fillText('驱动频率 (Hz)', ox + pw / 2, oy + ph + 18)

    animRef.current = requestAnimationFrame(() => {})
  }, [driveFreq, naturalFreq, historyRef.current.length])

  const curAmp = getAmplitude(driveFreq, naturalFreq)
  const isResonant = Math.abs(driveFreq - naturalFreq) < naturalFreq * 0.05

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>共振实验</span>
        <div style={styles.topActions}>
          {!playing ? (
            <button style={styles.playBtn} onClick={handlePlay}>▶ 发声</button>
          ) : (
            <button style={styles.stopBtn} onClick={handleStop}>⏹ 停止</button>
          )}
          <button style={sweeping ? styles.pauseBtn : styles.btn} onClick={handleSweep}>
            {sweeping ? '⏹ 停止扫频' : '📶 扫频'}
          </button>
          {isResonant && <span style={{ fontSize: 12, color: '#E53935', fontWeight: 700 }}>🎯 共振！</span>}
        </div>
      </div>

      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>驱动频率</span>
          <input type="range" min="20" max="800" step="1" value={driveFreq}
            onChange={(e) => setDriveFreq(parseInt(e.target.value))} style={styles.slider} />
          <span style={styles.sliderVal}>{driveFreq} Hz</span>
        </label>
        <div style={styles.sep} />
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>固有频率 f₀</span>
          <input type="range" min="50" max="700" step="5" value={naturalFreq}
            onChange={(e) => { setNaturalFreq(parseInt(e.target.value)); historyRef.current = [] }} style={styles.slider} />
          <span style={styles.sliderVal}>{naturalFreq} Hz</span>
        </label>
        <div style={styles.sep} />
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>音量</span>
          <input type="range" min="0" max="0.6" step="0.01" value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))} style={styles.slider} />
          <span style={styles.sliderVal}>{(volume * 100).toFixed(0)}%</span>
        </label>
      </div>

      <div style={styles.main}>
        <div style={styles.graphArea}>
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>

        <div style={styles.infoPanel}>
          <div style={styles.panelTitle}>📊 共振状态</div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>驱动频率</span><span style={styles.panelValue}>{driveFreq} Hz</span></div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>固有频率</span><span style={styles.panelValue}>{naturalFreq} Hz</span></div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>频率比</span><span style={styles.panelValue}>{(driveFreq / naturalFreq).toFixed(2)}</span></div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>振幅</span><span style={{ ...styles.panelValue, color: isResonant ? '#E53935' : '#1976D2' }}>{curAmp.toFixed(2)}×</span></div>

          <div style={styles.divider} />
          <div style={styles.panelTitle}>📖 共振条件</div>
          <div style={styles.tipText}>
            当<b>驱动频率 = 固有频率</b>时<br />
            系统发生<b>共振</b>，振幅最大<br /><br />
            <b>共振曲线</b>（灰色）：<br />
            洛伦兹型响应，峰在 f₀ 处<br /><br />
            <b>红点</b>：当前驱动频率位置<br />
            <b>橙色虚线</b>：固有频率 f₀<br />
            <b>蓝线</b>：扫频历史记录<br /><br />
            <b>应用：</b><br />
            索桥防共振设计<br />
            收音机调频选台<br />
            医学超声共振成像
          </div>
        </div>
      </div>

      <div style={styles.desc}>
        <b>实验：共振</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          调节驱动频率接近固有频率，观察振幅变化。点击"扫频"自动扫描，找到共振峰。
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
  sliderVal: { color: '#4A90D9', fontWeight: 600, fontSize: 12, minWidth: 45 },
  btn: { background: '#fff', color: '#4A90D9', border: '1px solid #ccc', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
  playBtn: { background: '#4CAF50', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  stopBtn: { background: '#E53935', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  pauseBtn: { background: '#FF9800', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  sep: { width: 1, height: 18, background: '#ccc', flexShrink: 0 },
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
