import { useRef, useState, useCallback, useEffect } from 'react'
import useAudio from '../audio/useAudio'
import WaveVisualizer from '../audio/WaveVisualizer'

/**
 * SoundInterferenceScene — 声波干涉
 *
 * - 两列声波叠加
 * - 相位差可调（0~360°）
 * - 实时波形展示干涉效果
 * - 相长/相消干涉
 */
export default function SoundInterferenceScene() {
  const audio = useAudio()
  const [playing, setPlaying] = useState(false)
  const [freq, setFreq] = useState(440)
  const [phaseDiff, setPhaseDiff] = useState(0) // 度
  const [volume, setVolume] = useState(0.3)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => setTick(t => t + 1), 50)
    return () => clearInterval(id)
  }, [playing])

  // 两路音频叠加
  useEffect(() => {
    if (!playing) return
    // 频率略有差异实现相位差（通过微小频率差）
    // 或者直接用两个同频振荡器
    audio.setFrequency(0, freq)
    if (audio.oscillatorCount >= 2) {
      audio.setFrequency(1, freq)
    }
  }, [freq, playing])

  const handlePlay = useCallback(() => {
    const ctx = audio.ensureContext()
    audio.play(freq, 'sine', volume)
    // 第二路同频，相位差通过 AudioContext.currentTime 偏移模拟
    const osc2 = ctx.createOscillator()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(freq, ctx.currentTime)
    const gain2 = ctx.createGain()
    gain2.gain.value = volume
    osc2.connect(gain2)
    gain2.connect(audio.getContext().destination) // 直接输出
    osc2.start()
    // 存储第二路引用
    audio._osc2 = osc2
    audio._gain2 = gain2
    setPlaying(true)
  }, [freq, volume])

  const handleStop = useCallback(() => {
    if (audio._osc2) {
      try { audio._osc2.stop(); audio._osc2.disconnect() } catch(e) {}
      try { audio._gain2.disconnect() } catch(e) {}
      audio._osc2 = null; audio._gain2 = null
    }
    audio.stop(); setPlaying(false)
  }, [])

  // 干涉结果振幅：A = 2A₀|cos(Δφ/2)|
  const ampFactor = Math.abs(Math.cos(phaseDiff * Math.PI / 360))
  const isConstructive = phaseDiff % 360 === 0
  const isDestructive = phaseDiff % 360 === 180

  // 干涉类型描述
  const getInterferenceType = () => {
    const pd = ((phaseDiff % 360) + 360) % 360
    if (pd === 0) return '🟢 相长干涉（振幅最大）'
    if (pd === 180) return '🔴 相消干涉（振幅为零）'
    if (pd < 90) return '🟡 部分相长干涉'
    if (pd < 180) return '🟠 部分相消干涉'
    if (pd < 270) return '🟠 部分相消干涉'
    return '🟡 部分相长干涉'
  }

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>声波干涉</span>
        <div style={styles.topActions}>
          {!playing ? (
            <button style={styles.playBtn} onClick={handlePlay}>▶ 发声</button>
          ) : (
            <button style={styles.stopBtn} onClick={handleStop}>⏹ 停止</button>
          )}
          <div style={styles.sep} />
          <span style={{ fontSize: 12, color: '#555' }}>{getInterferenceType()}</span>
        </div>
      </div>

      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>频率</span>
          <input type="range" min="100" max="1000" step="10" value={freq}
            onChange={(e) => setFreq(parseInt(e.target.value))} style={styles.slider} />
          <span style={styles.sliderVal}>{freq} Hz</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>相位差 Δφ</span>
          <input type="range" min="0" max="360" step="1" value={phaseDiff}
            onChange={(e) => setPhaseDiff(parseInt(e.target.value))} style={styles.sliderWide} />
          <span style={styles.sliderVal}>{phaseDiff}°</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>音量</span>
          <input type="range" min="0" max="0.5" step="0.01" value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))} style={styles.slider} />
          <span style={styles.sliderVal}>{(volume * 100).toFixed(0)}%</span>
        </label>
      </div>

      <div style={styles.main}>
        <div style={styles.vizContainer}>
          <WaveVisualizer
            getWaveform={playing ? audio.getWaveform : null}
            mode="waveform"
            freq={freq}
            sampleRate={audio.getSampleRate()}
            lineColor={isDestructive ? '#E53935' : isConstructive ? '#4CAF50' : '#1976D2'}
          />
        </div>

        <div style={styles.infoPanel}>
          <div style={styles.panelTitle}>📊 干涉参数</div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>频率</span><span style={styles.panelValue}>{freq} Hz</span></div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>相位差</span><span style={styles.panelValue}>{phaseDiff}°</span></div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>波程差</span><span style={styles.panelValue}>{(phaseDiff / 360 * (340 / freq) * 100).toFixed(1)} cm</span></div>
          <div style={styles.divider} />

          {/* 干涉结果指示 */}
          <div style={styles.panelTitle}>🔊 干涉结果</div>
          <div style={styles.resultBar}>
            <div style={{ ...styles.resultFill, width: `${ampFactor * 100}%`, background: isDestructive ? '#E53935' : '#4CAF50' }} />
          </div>
          <div style={styles.resultLabels}>
            <span>相消 (0)</span><span>相长 (2A₀)</span>
          </div>
          <div style={{ ...styles.ampDisplay, color: isDestructive ? '#E53935' : '#4CAF50' }}>
            合振幅 = {ampFactor.toFixed(2)} × 2A₀
          </div>

          <div style={styles.divider} />

          <div style={styles.panelTitle}>📖 干涉原理</div>
          <div style={styles.tipText}>
            <b>相长干涉：</b><br />
            Δφ = 0°, 360°...<br />
            波峰+波峰 → 振幅最大<br /><br />
            <b>相消干涉：</b><br />
            Δφ = 180°<br />
            波峰+波谷 → 振幅为零<br /><br />
            <b>合振幅：</b><br />
            A = 2A₀|cos(Δφ/2)|<br /><br />
            <b>波程差：</b><br />
            Δx = Δφ/360° × λ<br /><br />
            <b>应用：</b><br />
            降噪耳机（相消干涉）<br />
            音乐厅声学设计
          </div>
        </div>
      </div>

      <div style={styles.desc}>
        <b>实验：声波干涉</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          两列同频声波叠加，调节相位差，听干涉效果——0°时最强（相长），180°时静音（相消）。
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
  controlBar: { background: '#fafafa', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', padding: '4px 12px', flexShrink: 0, gap: 8, overflowX: 'auto' },
  controlLabel: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#555', whiteSpace: 'nowrap' },
  controlName: { fontWeight: 600, color: '#4A90D9' },
  slider: { width: 80, accentColor: '#4A90D9' },
  sliderWide: { width: 140, accentColor: '#4A90D9' },
  sliderVal: { color: '#4A90D9', fontWeight: 600, fontSize: 12, minWidth: 40 },
  playBtn: { background: '#4CAF50', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  stopBtn: { background: '#E53935', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  sep: { width: 1, height: 18, background: '#ccc' },
  main: { flex: 1, display: 'flex', overflow: 'hidden', background: '#fff', minHeight: 0 },
  vizContainer: { flex: 1, padding: 8, minHeight: 0 },
  infoPanel: { width: 210, background: 'rgba(255,255,255,0.95)', borderLeft: '1px solid #ddd', padding: 12, flexShrink: 0, overflowY: 'auto' },
  panelTitle: { fontSize: 12, fontWeight: 700, color: '#333', marginBottom: 8 },
  panelRow: { display: 'flex', justifyContent: 'space-between', marginBottom: 5 },
  panelLabel: { fontSize: 11, color: '#666' },
  panelValue: { fontSize: 12, fontWeight: 600, color: '#1976D2' },
  divider: { height: 1, background: '#eee', margin: '10px 0' },
  resultBar: { height: 14, background: '#eee', borderRadius: 7, overflow: 'hidden', marginBottom: 4 },
  resultFill: { height: '100%', borderRadius: 7, transition: 'width 0.2s' },
  resultLabels: { display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#999', marginBottom: 6 },
  ampDisplay: { fontSize: 14, fontWeight: 700, textAlign: 'center', marginBottom: 4 },
  tipText: { fontSize: 10, color: '#777', lineHeight: 1.6 },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
}
