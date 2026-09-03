import { useRef, useState, useCallback, useEffect } from 'react'
import useAudio from '../audio/useAudio'
import WaveVisualizer from '../audio/WaveVisualizer'

/**
 * SoundLoudnessScene — 响度与振幅
 *
 * 演示：振幅↑ → 响度↑
 * - 音量滑块控制振幅，波形振幅实时变化
 * - 固定频率，只改变音量
 */
export default function SoundLoudnessScene() {
  const audio = useAudio()
  const [playing, setPlaying] = useState(false)
  const [freq] = useState(440)
  const [volume, setVolume] = useState(0.5)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => setTick(t => t + 1), 50)
    return () => clearInterval(id)
  }, [playing])

  useEffect(() => {
    if (playing) audio.setVolume(0, volume)
  }, [volume, playing])

  const handlePlay = useCallback(() => {
    audio.play(freq, 'sine', volume); setPlaying(true)
  }, [freq, volume])

  const handleStop = useCallback(() => {
    audio.stop(); setPlaying(false)
  }, [])

  const getLoudnessDesc = (v) => {
    if (v < 0.05) return '几乎听不到'
    if (v < 0.2) return '轻声'
    if (v < 0.5) return '正常音量'
    if (v < 0.7) return '较响'
    return '很响'
  }

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>响度与振幅</span>
        <div style={styles.topActions}>
          {!playing ? (
            <button style={styles.playBtn} onClick={handlePlay}>▶ 发声</button>
          ) : (
            <button style={styles.stopBtn} onClick={handleStop}>⏹ 停止</button>
          )}
          <span style={{ fontSize: 12, color: '#888' }}>频率固定 {freq} Hz，只改变音量（振幅）</span>
        </div>
      </div>

      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>音量（振幅）</span>
          <input type="range" min="0" max="0.8" step="0.01" value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))} style={styles.slider} />
          <span style={styles.sliderVal}>{(volume * 100).toFixed(0)}%</span>
        </label>
        <span style={{ fontSize: 12, color: '#FF9800', fontWeight: 600 }}>
          {getLoudnessDesc(volume)}
        </span>
      </div>

      <div style={styles.main}>
        <div style={styles.vizContainer}>
          <WaveVisualizer
            getWaveform={playing ? audio.getWaveform : null}
            mode="waveform"
            freq={freq}
            sampleRate={audio.getSampleRate()}
            lineColor="#388E3C"
          />
        </div>

        <div style={styles.infoPanel}>
          <div style={styles.panelTitle}>📖 响度与振幅</div>
          <div style={styles.tipText}>
            <b>响度</b>由振幅决定<br />
            振幅<b>越大</b>，响度<b>越大</b><br />
            振幅<b>越小</b>，响度<b>越小</b><br /><br />
            <b>波形表现：</b><br />
            音量大 → 波形上下波动大<br />
            音量小 → 波形上下波动小<br /><br />
            <b>响度单位：</b>分贝 (dB)<br />
            0 dB：听觉阈值<br />
            60 dB：正常说话<br />
            90 dB：工厂车间<br />
            120 dB：痛觉阈值
          </div>
          <div style={styles.divider} />
          <div style={styles.panelTitle}>📊 当前状态</div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>频率</span><span style={styles.panelValue}>{freq} Hz（不变）</span></div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>振幅</span><span style={styles.panelValue}>{(volume * 100).toFixed(0)}%</span></div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>响度</span><span style={styles.panelValue}>{getLoudnessDesc(volume)}</span></div>
          <div style={styles.divider} />
          {/* 振幅可视化条 */}
          <div style={styles.panelTitle}>振幅指示</div>
          <div style={styles.ampBar}>
            <div style={{ ...styles.ampFill, width: `${(volume / 0.8) * 100}%` }} />
          </div>
          <div style={styles.ampLabels}><span>0</span><span>小</span><span>中</span><span>大</span></div>
        </div>
      </div>

      <div style={styles.desc}>
        <b>实验：响度与振幅</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          频率固定不变，调节音量（振幅），听响度变化，观察波形——振幅越大波形波动越大，声音越响。
        </span>
      </div>
    </div>
  )
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', maxHeight: '100vh', background: '#e8e8e8', color: '#333', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', overflow: 'hidden' },
  topBar: { background: '#f5f5f5', borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', flexShrink: 0, flexWrap: 'wrap', gap: 6 },
  title: { fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' },
  topActions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  controlBar: { background: '#fafafa', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', padding: '4px 12px', flexShrink: 0, gap: 8 },
  controlLabel: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#555', whiteSpace: 'nowrap' },
  controlName: { fontWeight: 600, color: '#4A90D9' },
  slider: { width: 160, accentColor: '#388E3C' },
  sliderVal: { color: '#388E3C', fontWeight: 600, fontSize: 12, minWidth: 36 },
  playBtn: { background: '#4CAF50', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  stopBtn: { background: '#E53935', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  main: { flex: 1, display: 'flex', overflow: 'hidden', background: '#fff', minHeight: 0 },
  vizContainer: { flex: 1, padding: 8, minHeight: 0 },
  infoPanel: { width: 200, background: 'rgba(255,255,255,0.95)', borderLeft: '1px solid #ddd', padding: 12, flexShrink: 0, overflowY: 'auto' },
  panelTitle: { fontSize: 12, fontWeight: 700, color: '#333', marginBottom: 8 },
  tipText: { fontSize: 11, color: '#555', lineHeight: 1.7 },
  divider: { height: 1, background: '#eee', margin: '10px 0' },
  panelRow: { display: 'flex', justifyContent: 'space-between', marginBottom: 5 },
  panelLabel: { fontSize: 11, color: '#666' },
  panelValue: { fontSize: 12, fontWeight: 600, color: '#1976D2' },
  ampBar: { height: 12, background: '#eee', borderRadius: 6, overflow: 'hidden', marginBottom: 4 },
  ampFill: { height: '100%', background: '#388E3C', borderRadius: 6, transition: 'width 0.1s' },
  ampLabels: { display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#999' },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
}
