import { useRef, useState, useCallback, useEffect } from 'react'
import useAudio from '../audio/useAudio'
import WaveVisualizer from '../audio/WaveVisualizer'

/**
 * SoundPitchScene — 音调与频率
 *
 * 演示：频率↑ → 音调↑
 * - 频率滑块实时调节，听觉+波形+频谱三重感知
 * - 听觉范围标注（20Hz~20000Hz）
 * - 预设常用音阶频率
 */
export default function SoundPitchScene() {
  const audio = useAudio()
  const [playing, setPlaying] = useState(false)
  const [freq, setFreq] = useState(440)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => setTick(t => t + 1), 50)
    return () => clearInterval(id)
  }, [playing])

  useEffect(() => {
    if (playing) audio.setFrequency(0, freq)
  }, [freq, playing])

  const handlePlay = useCallback(() => {
    audio.play(freq, 'sine', 0.4); setPlaying(true)
  }, [freq])

  const handleStop = useCallback(() => {
    audio.stop(); setPlaying(false)
  }, [])

  // 音阶预设
  const notes = [
    { name: 'C4', f: 262 }, { name: 'D4', f: 294 }, { name: 'E4', f: 330 },
    { name: 'F4', f: 349 }, { name: 'G4', f: 392 }, { name: 'A4', f: 440 },
    { name: 'B4', f: 494 }, { name: 'C5', f: 523 },
  ]

  // 频率→音调描述
  const getPitchDesc = (f) => {
    if (f < 20) return '次声波，人耳听不到'
    if (f < 100) return '很低沉的音调'
    if (f < 300) return '低沉的音调'
    if (f < 600) return '中等音调'
    if (f < 1500) return '较高的音调'
    if (f < 5000) return '高音调'
    if (f < 20000) return '很高的音调'
    return '超声波，人耳听不到'
  }

  // 听觉范围指示条上的位置
  const freqPos = Math.max(0, Math.min(100, (Math.log10(Math.max(freq, 20)) - Math.log10(20)) / (Math.log10(20000) - Math.log10(20)) * 100))

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>音调与频率</span>
        <div style={styles.topActions}>
          {!playing ? (
            <button style={styles.playBtn} onClick={handlePlay}>▶ 发声</button>
          ) : (
            <button style={styles.stopBtn} onClick={handleStop}>⏹ 停止</button>
          )}
          <div style={styles.sep} />
          {notes.map(n => (
            <button key={n.name}
              style={freq === n.f ? styles.tabActive : styles.tab}
              onClick={() => setFreq(n.f)}>
              {n.name}
            </button>
          ))}
        </div>
      </div>

      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>频率 f</span>
          <input type="range" min="20" max="4000" step="1" value={freq}
            onChange={(e) => setFreq(parseInt(e.target.value))} style={styles.slider} />
          <input type="number" min="20" max="20000" step="1" value={freq}
            onChange={(e) => setFreq(Math.max(20, parseInt(e.target.value) || 20))} style={styles.numInput} />
          <span style={styles.sliderVal}>Hz</span>
        </label>
        <span style={{ fontSize: 12, color: '#FF9800', fontWeight: 600 }}>
          {getPitchDesc(freq)}
        </span>
      </div>

      <div style={styles.main}>
        <div style={styles.vizContainer}>
          <WaveVisualizer
            getWaveform={playing ? audio.getWaveform : null}
            mode="waveform"
            freq={freq}
            sampleRate={audio.getSampleRate()}
            lineColor="#1976D2"
          />
        </div>

        <div style={styles.infoPanel}>
          <div style={styles.panelTitle}>📖 音调与频率</div>
          <div style={styles.tipText}>
            <b>音调</b>由频率决定<br />
            频率<b>越高</b>，音调<b>越高</b><br />
            频率<b>越低</b>，音调<b>越低</b><br /><br />
            <b>人耳听觉范围：</b><br />
            20 Hz ~ 20000 Hz<br /><br />
            <b>次声波</b>：&lt; 20 Hz（听不到）<br />
            <b>超声波</b>：&gt; 20000 Hz（听不到）
          </div>

          <div style={styles.divider} />

          {/* 听觉范围指示条 */}
          <div style={styles.panelTitle}>🎧 听觉范围</div>
          <div style={styles.rangeBar}>
            <div style={styles.rangeTrack}>
              <div style={{ ...styles.rangeMarker, left: `${freqPos}%` }} />
              <div style={styles.rangeAudible} />
            </div>
            <div style={styles.rangeLabels}>
              <span>20Hz</span><span>100</span><span>1k</span><span>10k</span><span>20kHz</span>
            </div>
          </div>

          <div style={styles.divider} />

          <div style={styles.panelTitle}>🎵 当前参数</div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>频率</span><span style={styles.panelValue}>{freq} Hz</span></div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>周期</span><span style={styles.panelValue}>{(1000 / freq).toFixed(2)} ms</span></div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>波长</span><span style={styles.panelValue}>{(340 / freq).toFixed(2)} m</span></div>
        </div>
      </div>

      <div style={styles.desc}>
        <b>实验：音调与频率</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          调节频率或点击音阶按钮，听音调变化，观察波形——频率越高波形越密，音调越高。
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
  controlName: { fontWeight: 600, color: '#4A90D9', minWidth: 18 },
  slider: { width: 120, accentColor: '#4A90D9' },
  numInput: { width: 58, border: '1px solid #ccc', borderRadius: 3, padding: '2px 4px', fontSize: 11, textAlign: 'center' },
  sliderVal: { color: '#4A90D9', fontWeight: 600, fontSize: 12 },
  playBtn: { background: '#4CAF50', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  stopBtn: { background: '#E53935', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  sep: { width: 1, height: 18, background: '#ccc', flexShrink: 0 },
  tab: { background: '#fff', color: '#555', border: '1px solid #ccc', borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer' },
  tabActive: { background: '#4A90D9', color: '#fff', border: '1px solid #4A90D9', borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer', fontWeight: 600 },
  main: { flex: 1, display: 'flex', overflow: 'hidden', background: '#fff', minHeight: 0 },
  vizContainer: { flex: 1, padding: 8, minHeight: 0 },
  infoPanel: { width: 200, background: 'rgba(255,255,255,0.95)', borderLeft: '1px solid #ddd', padding: 12, flexShrink: 0, overflowY: 'auto' },
  panelTitle: { fontSize: 12, fontWeight: 700, color: '#333', marginBottom: 8 },
  tipText: { fontSize: 11, color: '#555', lineHeight: 1.7 },
  divider: { height: 1, background: '#eee', margin: '10px 0' },
  panelRow: { display: 'flex', justifyContent: 'space-between', marginBottom: 5 },
  panelLabel: { fontSize: 11, color: '#666' },
  panelValue: { fontSize: 12, fontWeight: 600, color: '#1976D2' },
  rangeBar: { marginTop: 4 },
  rangeTrack: { position: 'relative', height: 14, background: '#eee', borderRadius: 7, overflow: 'visible' },
  rangeAudible: { position: 'absolute', left: '2%', right: '2%', top: 0, height: '100%', background: 'rgba(76,175,80,0.2)', borderRadius: 7 },
  rangeMarker: { position: 'absolute', top: -3, width: 8, height: 20, background: '#E53935', borderRadius: 4, transform: 'translateX(-50%)', zIndex: 1 },
  rangeLabels: { display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 8, color: '#999' },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
}
