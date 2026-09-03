import { useRef, useState, useCallback, useEffect } from 'react'
import useAudio from '../audio/useAudio'

/**
 * SoundPipeScene — 管内驻波
 *
 * 开管/闭管共振频率
 * - 管长可调
 * - 谐波序号选择
 * - 驻波动画（开管两端自由/闭管一端封闭）
 */
export default function SoundPipeScene() {
  const audio = useAudio()
  const canvasRef = useRef(null)

  const [playing, setPlaying] = useState(false)
  const [pipeLength, setPipeLength] = useState(0.5) // m
  const [pipeType, setPipeType] = useState('open')   // 'open' | 'closed'
  const [harmonic, setHarmonic] = useState(1)
  const [volume, setVolume] = useState(0.3)
  const [time, setTime] = useState(0)

  const v_sound = 340 // m/s

  // 开管：f_n = n*v/(2L)  n=1,2,3...
  // 闭管：f_n = n*v/(4L)  n=1,3,5...（仅奇次）
  const getFreq = useCallback((n, type, L) => {
    if (type === 'open') return n * v_sound / (2 * L)
    return n * v_sound / (4 * L) // n 只取奇次
  }, [])

  const currentFreq = getFreq(harmonic, pipeType, pipeLength)

  // 闭管可用谐波：1,3,5,7...
  const availableHarmonics = pipeType === 'open' ? [1,2,3,4,5,6,7] : [1,3,5,7]

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

  const handleTypeChange = useCallback((t) => {
    setPipeType(t)
    if (t === 'closed' && harmonic % 2 === 0) setHarmonic(1)
  }, [harmonic])

  // 绘制管内驻波
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
    const pipeW = Math.min(w * 0.7, 500)
    const pipeH = 60
    const pipeX = cx - pipeW / 2
    const pipeY = cy - pipeH / 2

    // 管壁
    ctx.fillStyle = '#E0E0E0'
    ctx.fillRect(pipeX, pipeY, pipeW, pipeH)
    ctx.strokeStyle = '#9E9E9E'; ctx.lineWidth = 2
    ctx.strokeRect(pipeX, pipeY, pipeW, pipeH)

    // 闭管右端封闭
    if (pipeType === 'closed') {
      ctx.fillStyle = '#616161'
      ctx.fillRect(pipeX + pipeW - 6, pipeY, 6, pipeH)
    }

    // 空气柱振动（驻波包络）
    const n = harmonic
    const segW = pipeW / n
    ctx.strokeStyle = 'rgba(25,118,210,0.3)'; ctx.lineWidth = 1
    for (let seg = 0; seg < n; seg++) {
      const sx = pipeX + seg * segW
      ctx.beginPath()
      for (let i = 0; i <= 40; i++) {
        const x = sx + (i / 40) * segW
        const phase = Math.sin(Math.PI * (i / 40))
        const vibration = playing ? Math.cos(2 * Math.PI * currentFreq * time * 0.001) : 0
        const y = cy + (pipeH * 0.35) * phase * vibration
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }

    // 波节（红色竖线）
    if (pipeType === 'open') {
      // 开管：两端+中间都是波节
      for (let i = 0; i <= n; i++) {
        const jx = pipeX + (i / n) * pipeW
        ctx.strokeStyle = 'rgba(229,57,53,0.5)'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(jx, pipeY + 5); ctx.lineTo(jx, pipeY + pipeH - 5); ctx.stroke()
      }
    } else {
      // 闭管：封闭端是波节，开口端是波腹
      for (let i = 0; i < n; i += 2) {
        const jx = pipeX + (i / n) * pipeW
        ctx.strokeStyle = 'rgba(229,57,53,0.5)'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(jx, pipeY + 5); ctx.lineTo(jx, pipeY + pipeH - 5); ctx.stroke()
      }
      // 右端（封闭端）波节
      ctx.strokeStyle = 'rgba(229,57,53,0.5)'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(pipeX + pipeW, pipeY + 5); ctx.lineTo(pipeX + pipeW, pipeY + pipeH - 5); ctx.stroke()
    }

    // 波腹（蓝色半圆）
    if (pipeType === 'open') {
      for (let i = 0; i < n; i++) {
        const ax = pipeX + ((i + 0.5) / n) * pipeW
        ctx.fillStyle = 'rgba(25,118,210,0.15)'
        ctx.beginPath(); ctx.arc(ax, cy, pipeH * 0.35, 0, Math.PI * 2); ctx.fill()
      }
    } else {
      for (let i = 1; i < n; i += 2) {
        const ax = pipeX + (i / n) * pipeW
        ctx.fillStyle = 'rgba(25,118,210,0.15)'
        ctx.beginPath(); ctx.arc(ax, cy, pipeH * 0.35, 0, Math.PI * 2); ctx.fill()
      }
    }

    // 波长标注
    const lambda = pipeType === 'open' ? 2 * pipeLength / harmonic : 4 * pipeLength / harmonic
    ctx.fillStyle = '#666'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(`λ = ${lambda.toFixed(2)} m`, cx, pipeY + pipeH + 25)
    ctx.fillText(`L = ${pipeLength.toFixed(2)} m`, cx, pipeY + pipeH + 40)

    // 标注
    ctx.fillStyle = '#333'; ctx.font = '11px sans-serif'
    ctx.fillText(pipeType === 'open' ? '开管（两端自由）' : '闭管（右端封闭）', cx, pipeY - 16)

  }, [playing, time, harmonic, pipeType, pipeLength, currentFreq])

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>管内驻波</span>
        <div style={styles.topActions}>
          {!playing ? (
            <button style={styles.playBtn} onClick={handlePlay}>▶ 发声</button>
          ) : (
            <button style={styles.stopBtn} onClick={handleStop}>⏹ 停止</button>
          )}
          <div style={styles.sep} />
          <button style={pipeType === 'open' ? styles.tabOk : styles.tab} onClick={() => handleTypeChange('open')}>开管</button>
          <button style={pipeType === 'closed' ? styles.tabWarn : styles.tab} onClick={() => handleTypeChange('closed')}>闭管</button>
          <div style={styles.sep} />
          {availableHarmonics.map(n => (
            <button key={n} style={harmonic === n ? styles.tabActive : styles.tab}
              onClick={() => setHarmonic(n)}>
              {n}次
            </button>
          ))}
        </div>
      </div>

      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>管长 L</span>
          <input type="range" min="0.2" max="2" step="0.05" value={pipeLength}
            onChange={(e) => setPipeLength(parseFloat(e.target.value))} style={styles.slider} />
          <span style={styles.sliderVal}>{pipeLength.toFixed(2)} m</span>
        </label>
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
          <div style={styles.panelTitle}>📊 管参数</div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>管型</span><span style={styles.panelValue}>{pipeType === 'open' ? '开管' : '闭管'}</span></div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>管长 L</span><span style={styles.panelValue}>{pipeLength.toFixed(2)} m</span></div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>谐波</span><span style={styles.panelValue}>第 {harmonic} 次</span></div>
          <div style={styles.divider} />
          <div style={styles.panelTitle}>🎵 频率</div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>当前频率</span><span style={{ ...styles.panelValue, color: '#E53935' }}>{currentFreq.toFixed(1)} Hz</span></div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>波长 λ</span><span style={styles.panelValue}>{(v_sound / currentFreq).toFixed(2)} m</span></div>
          <div style={styles.divider} />
          <div style={styles.panelTitle}>📖 管内驻波公式</div>
          <div style={styles.tipText}>
            <b>开管（两端自由）：</b><br />
            f_n = n·v/(2L)  n=1,2,3...<br />
            含全部谐波<br /><br />
            <b>闭管（一端封闭）：</b><br />
            f_n = n·v/(4L)  n=1,3,5...<br />
            仅含奇次谐波<br /><br />
            v = 340 m/s（空气中）<br /><br />
            <b>波节</b>（红线）：空气不动<br />
            <b>波腹</b>（蓝区）：振幅最大
          </div>
        </div>
      </div>

      <div style={styles.desc}>
        <b>实验：管内驻波</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          选择开管/闭管，调节管长和谐波序号，观察驻波形态，听共振频率。
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
  controlBar: { background: '#fafafa', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', padding: '4px 12px', flexShrink: 0, gap: 8 },
  controlLabel: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#555', whiteSpace: 'nowrap' },
  controlName: { fontWeight: 600, color: '#4A90D9' },
  slider: { width: 100, accentColor: '#4A90D9' },
  sliderVal: { color: '#4A90D9', fontWeight: 600, fontSize: 12, minWidth: 45 },
  playBtn: { background: '#4CAF50', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  stopBtn: { background: '#E53935', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  sep: { width: 1, height: 18, background: '#ccc' },
  tab: { background: '#fff', color: '#555', border: '1px solid #ccc', borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer' },
  tabActive: { background: '#4A90D9', color: '#fff', border: '1px solid #4A90D9', borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer', fontWeight: 600 },
  tabOk: { background: '#4CAF50', color: '#fff', border: '1px solid #4CAF50', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 },
  tabWarn: { background: '#FF9800', color: '#fff', border: '1px solid #FF9800', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 },
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
