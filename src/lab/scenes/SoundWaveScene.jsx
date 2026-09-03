import { useRef, useState, useCallback, useEffect } from 'react'
import useAudio from '../audio/useAudio'
import WaveVisualizer from '../audio/WaveVisualizer'

/**
 * SoundWaveScene — 声波可视化与发声
 *
 * 功能：频率调节、波形类型、实时示波器+频谱、拍频双音、暂停/重置、CSV导出
 */
export default function SoundWaveScene() {
  const audio = useAudio()
  const [playing, setPlaying] = useState(false)
  const [paused, setPaused] = useState(false)
  const [freq, setFreq] = useState(440)
  const [waveType, setWaveType] = useState('sine')
  const [volume, setVolume] = useState(0.4)
  const [viewMode, setViewMode] = useState('waveform') // 'waveform' | 'spectrum' | 'both'
  const [beatMode, setBeatMode] = useState(false)
  const [freq2, setFreq2] = useState(444)
  const [volume2, setVolume2] = useState(0.3)

  const [tick, setTick] = useState(0)

  // 实时刷新波形
  useEffect(() => {
    if (!playing || paused) return
    const id = setInterval(() => setTick(t => t + 1), 50)
    return () => clearInterval(id)
  }, [playing, paused])

  // 同步频率到振荡器
  useEffect(() => {
    if (playing && !paused) audio.setFrequency(0, freq)
  }, [freq, playing, paused])

  useEffect(() => {
    if (playing && !paused && beatMode) audio.setFrequency(1, freq2)
  }, [freq2, playing, paused, beatMode])

  useEffect(() => {
    if (playing && !paused) audio.setVolume(0, volume)
  }, [volume, playing, paused])

  useEffect(() => {
    if (playing && !paused && beatMode) audio.setVolume(1, volume2)
  }, [volume2, playing, paused, beatMode])

  const handlePlay = useCallback(() => {
    audio.play(freq, waveType, volume)
    if (beatMode) audio.addOscillator(freq2, waveType, volume2)
    setPlaying(true); setPaused(false)
  }, [freq, waveType, volume, beatMode, freq2, volume2])

  const handlePause = useCallback(() => {
    if (paused) { audio.resume(); setPaused(false) }
    else { audio.pause(); setPaused(true) }
  }, [paused])

  const handleStop = useCallback(() => {
    audio.stop(); setPlaying(false); setPaused(false)
  }, [])

  const handleReset = useCallback(() => {
    audio.stop()
    setFreq(440); setWaveType('sine'); setVolume(0.4)
    setFreq2(444); setVolume2(0.3)
    setBeatMode(false); setPlaying(false); setPaused(false)
  }, [])

  const handleBeatToggle = useCallback(() => {
    if (playing && !paused) {
      if (!beatMode) audio.addOscillator(freq2, waveType, volume2)
      else audio.removeOscillator(1)
    }
    setBeatMode(b => !b)
  }, [playing, paused, beatMode, freq2, waveType, volume2])

  const handlePreset = useCallback((f) => {
    setFreq(f)
  }, [])

  const handleWaveTypeChange = useCallback((t) => {
    setWaveType(t)
    if (playing && !paused) {
      audio.stop()
      audio.play(freq, t, volume)
      if (beatMode) audio.addOscillator(freq2, t, volume2)
    }
  }, [playing, paused, freq, volume, beatMode, freq2, volume2])

  const handleExportCSV = useCallback(() => {
    const waveform = audio.getWaveform()
    if (!waveform) return
    const sr = audio.getSampleRate()
    const header = 'sample,t_ms,amplitude'
    const rows = []
    for (let i = 0; i < waveform.length; i++) {
      const t = (i / sr * 1000).toFixed(4)
      const amp = ((waveform[i] - 128) / 128).toFixed(4)
      rows.push(`${i},${t},${amp}`)
    }
    const csv = header + '\n' + rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `waveform_${freq}Hz_${Date.now()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }, [freq])

  const presets = [
    { label: 'C4', f: 262 }, { label: 'A4', f: 440 },
    { label: 'C5', f: 523 }, { label: '880', f: 880 },
  ]

  const waveColors = { sine: '#1976D2', square: '#D32F2F', triangle: '#388E3C', sawtooth: '#FF6F00' }
  const waveLabels = { sine: '正弦', square: '方波', triangle: '三角', sawtooth: '锯齿' }

  const beatFreq = Math.abs(freq - freq2)

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>声波可视化与发声</span>
        <div style={styles.topActions}>
          {!playing ? (
            <button style={styles.playBtn} onClick={handlePlay}>▶ 发声</button>
          ) : (
            <>
              <button style={paused ? styles.playBtn : styles.pauseBtn} onClick={handlePause}>
                {paused ? '▶ 继续' : '⏸ 暂停'}
              </button>
              <button style={styles.stopBtn} onClick={handleStop}>⏹ 停止</button>
            </>
          )}
          <button style={styles.setBtn} onClick={handleReset}>⚙ 重置</button>
          <div style={styles.sep} />
          {Object.entries(waveLabels).map(([t, label]) => (
            <button key={t}
              style={waveType === t ? { ...styles.tabActive, background: waveColors[t], borderColor: waveColors[t] } : styles.tab}
              onClick={() => handleWaveTypeChange(t)}>
              {label}
            </button>
          ))}
          <div style={styles.sep} />
          <button style={viewMode === 'waveform' ? styles.tabActive : styles.tab}
            onClick={() => setViewMode('waveform')}>波形</button>
          <button style={viewMode === 'spectrum' ? styles.tabActive : styles.tab}
            onClick={() => setViewMode('spectrum')}>频谱</button>
          <button style={viewMode === 'both' ? styles.tabActive : styles.tab}
            onClick={() => setViewMode('both')}>双显</button>
          <div style={styles.sep} />
          <button style={beatMode ? styles.tabWarn : styles.tab} onClick={handleBeatToggle}>拍频</button>
          <button style={styles.btn} onClick={handleExportCSV}>📥 CSV</button>
        </div>
      </div>

      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>f₁</span>
          <input type="range" min="20" max="2000" step="1" value={freq}
            onChange={(e) => setFreq(parseInt(e.target.value))} style={styles.slider} />
          <input type="number" min="20" max="4000" step="1" value={freq}
            onChange={(e) => setFreq(Math.max(20, parseInt(e.target.value) || 20))} style={styles.numInput} />
          <span style={styles.sliderVal}>Hz</span>
        </label>
        {presets.map(p => (
          <button key={p.label}
            style={freq === p.freq ? styles.tabActive : styles.tab}
            onClick={() => handlePreset(p.f)}>
            {p.label}
          </button>
        ))}
        <div style={styles.sep} />
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>音量</span>
          <input type="range" min="0" max="0.8" step="0.01" value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))} style={styles.slider} />
          <span style={styles.sliderVal}>{(volume * 100).toFixed(0)}%</span>
        </label>
      </div>

      {beatMode && (
        <div style={styles.controlBar}>
          <label style={styles.controlLabel}>
            <span style={styles.controlName}>f₂</span>
            <input type="range" min="20" max="2000" step="1" value={freq2}
              onChange={(e) => setFreq2(parseInt(e.target.value))} style={styles.slider} />
            <input type="number" min="20" max="4000" step="1" value={freq2}
              onChange={(e) => setFreq2(Math.max(20, parseInt(e.target.value) || 20))} style={styles.numInput} />
            <span style={styles.sliderVal}>Hz</span>
          </label>
          <label style={styles.controlLabel}>
            <span style={styles.controlName}>音量₂</span>
            <input type="range" min="0" max="0.8" step="0.01" value={volume2}
              onChange={(e) => setVolume2(parseFloat(e.target.value))} style={styles.slider} />
            <span style={styles.sliderVal}>{(volume2 * 100).toFixed(0)}%</span>
          </label>
          <span style={{ fontSize: 12, color: '#FF9800', fontWeight: 600 }}>
            拍频 = |{freq} − {freq2}| = {beatFreq} Hz
          </span>
          <span style={{ fontSize: 10, color: '#999' }}>
            拍周期 {beatFreq > 0 ? (1000 / beatFreq).toFixed(1) : '∞'} ms
          </span>
        </div>
      )}

      <div style={styles.main}>
        <div style={styles.vizContainer}>
          <WaveVisualizer
            getWaveform={playing && !paused ? audio.getWaveform : null}
            getSpectrum={playing && !paused ? audio.getSpectrum : null}
            mode={viewMode}
            freq={freq}
            sampleRate={audio.getSampleRate()}
            lineColor={waveColors[waveType]}
            waveType={waveType}
          />
        </div>

        <div style={styles.infoPanel}>
          <div style={styles.panelTitle}>📊 声波参数</div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>频率 f₁</span><span style={styles.panelValue}>{freq} Hz</span></div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>周期 T</span><span style={styles.panelValue}>{(1000 / freq).toFixed(2)} ms</span></div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>波长 λ</span><span style={styles.panelValue}>{(340 / freq).toFixed(2)} m</span></div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>波形</span><span style={{ ...styles.panelValue, color: waveColors[waveType] }}>{waveLabels[waveType]}波</span></div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>音量</span><span style={styles.panelValue}>{(volume * 100).toFixed(0)}%</span></div>
          {beatMode && <>
            <div style={styles.divider} />
            <div style={styles.panelRow}><span style={styles.panelLabel}>f₂</span><span style={styles.panelValue}>{freq2} Hz</span></div>
            <div style={styles.beatBox}>
              <div style={styles.beatLabel}>拍频 f_beat</div>
              <div style={styles.beatValue}>|{freq} − {freq2}| = {beatFreq} Hz</div>
              <div style={styles.beatSub}>拍周期 {beatFreq > 0 ? (1000 / beatFreq).toFixed(1) : '∞'} ms</div>
            </div>
          </>}
          <div style={styles.divider} />
          <div style={styles.tipTitle}>📖 教学提示</div>
          <div style={styles.tipText}>
            <b>频率</b>决定音调高低<br />
            <b>振幅</b>（音量）决定响度大小<br />
            <b>波形</b>决定音色<br /><br />
            波长公式：<b>λ = v / f</b><br />
            常温空气中声速 v = 340 m/s<br /><br />
            {beatMode && <><b>拍频</b> = |f₁ − f₂|<br />两列波叠加产生强弱交替的声音</>}
            {waveType === 'square' && <><br />方波：仅含<b>奇次</b>谐波 (1,3,5,7...)</>}
            {waveType === 'sawtooth' && <><br />锯齿波：含<b>奇偶全部</b>谐波 (1,2,3,4...)</>}
            {waveType === 'triangle' && <><br />三角波：仅含<b>奇次</b>谐波，衰减比方波快</>}
          </div>
        </div>
      </div>

      <div style={styles.desc}>
        <b>声波可视化与发声</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          调节频率和波形，点击"发声"观察实时波形。开启"拍频"可听两个频率叠加的拍频效果。
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
  controlName: { fontWeight: 600, color: '#4A90D9', minWidth: 18 },
  slider: { width: 80, accentColor: '#4A90D9' },
  numInput: { width: 52, border: '1px solid #ccc', borderRadius: 3, padding: '2px 4px', fontSize: 11, textAlign: 'center' },
  sliderVal: { color: '#4A90D9', fontWeight: 600, fontSize: 12, minWidth: 30 },
  btn: { background: '#fff', color: '#4A90D9', border: '1px solid #ccc', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' },
  playBtn: { background: '#4CAF50', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  pauseBtn: { background: '#FF9800', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  stopBtn: { background: '#E53935', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  setBtn: { background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
  sep: { width: 1, height: 18, background: '#ccc', flexShrink: 0 },
  tab: { background: '#fff', color: '#555', border: '1px solid #ccc', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer' },
  tabActive: { background: '#4A90D9', color: '#fff', border: '1px solid #4A90D9', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 },
  tabWarn: { background: '#FF9800', color: '#fff', border: '1px solid #FF9800', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 },
  main: { flex: 1, display: 'flex', overflow: 'hidden', background: '#fff', minHeight: 0 },
  vizContainer: { flex: 1, padding: 8, minHeight: 0 },
  infoPanel: { width: 190, background: 'rgba(255,255,255,0.95)', borderLeft: '1px solid #ddd', padding: '12px', flexShrink: 0, overflowY: 'auto' },
  panelTitle: { fontSize: 12, fontWeight: 700, color: '#333', marginBottom: 10 },
  panelRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 },
  panelLabel: { fontSize: 11, color: '#666' },
  panelValue: { fontSize: 12, fontWeight: 600, color: '#1976D2' },
  divider: { height: 1, background: '#eee', margin: '8px 0' },
  tipTitle: { fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 6 },
  tipText: { fontSize: 10, color: '#777', lineHeight: 1.6 },
  beatBox: { background: 'rgba(255,152,0,0.1)', border: '1px solid rgba(255,152,0,0.3)', borderRadius: 6, padding: '8px 10px', marginTop: 4 },
  beatLabel: { fontSize: 10, color: '#FF9800', fontWeight: 600, marginBottom: 2 },
  beatValue: { fontSize: 16, color: '#E65100', fontWeight: 700 },
  beatSub: { fontSize: 10, color: '#999', marginTop: 2 },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
}
