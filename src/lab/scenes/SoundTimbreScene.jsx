import { useState, useCallback, useEffect } from 'react'
import useAudio from '../audio/useAudio'
import WaveVisualizer from '../audio/WaveVisualizer'

/**
 * SoundTimbreScene — 音色与波形
 *
 * 演示：相同频率和音量下，不同波形 → 不同音色
 * - 四种波形同时对比（切换发声+波形显示）
 * - 频谱展示谐波结构差异
 */
export default function SoundTimbreScene() {
  const audio = useAudio()
  const [playing, setPlaying] = useState(false)
  const [waveType, setWaveType] = useState('sine')
  const [freq] = useState(440)
  const [volume] = useState(0.4)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => setTick(t => t + 1), 50)
    return () => clearInterval(id)
  }, [playing])

  const handlePlay = useCallback(() => {
    audio.play(freq, waveType, volume); setPlaying(true)
  }, [freq, waveType, volume])

  const handleStop = useCallback(() => {
    audio.stop(); setPlaying(false)
  }, [])

  const handleTypeChange = useCallback((t) => {
    setWaveType(t)
    if (playing) {
      audio.stop(); audio.play(freq, t, volume)
    }
  }, [playing, freq, volume])

  const waveColors = { sine: '#1976D2', square: '#D32F2F', triangle: '#388E3C', sawtooth: '#FF6F00' }
  const waveLabels = { sine: '正弦波', square: '方波', triangle: '三角波', sawtooth: '锯齿波' }
  const waveDescs = {
    sine: '最纯净的音色，只有基频，无谐波。音叉近似正弦波。',
    square: '含奇次谐波（1,3,5,7...），音色尖锐、空洞。电子音乐常用。',
    triangle: '含奇次谐波，但衰减比方波快（1/9, 1/25...），音色柔和。',
    sawtooth: '含全部谐波（1,2,3,4...），音色明亮、粗糙。小提琴近似锯齿波。',
  }

  // 四种波形的频谱特征
  const harmonics = {
    sine: [{ n: 1, amp: 1 }],
    square: [{ n: 1, amp: 1 }, { n: 3, amp: 1/3 }, { n: 5, amp: 1/5 }, { n: 7, amp: 1/7 }, { n: 9, amp: 1/9 }],
    triangle: [{ n: 1, amp: 1 }, { n: 3, amp: 1/9 }, { n: 5, amp: 1/25 }, { n: 7, amp: 1/49 }],
    sawtooth: [{ n: 1, amp: 1 }, { n: 2, amp: 1/2 }, { n: 3, amp: 1/3 }, { n: 4, amp: 1/4 }, { n: 5, amp: 1/5 }, { n: 6, amp: 1/6 }],
  }

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>音色与波形</span>
        <div style={styles.topActions}>
          {!playing ? (
            <button style={styles.playBtn} onClick={handlePlay}>▶ 发声</button>
          ) : (
            <button style={styles.stopBtn} onClick={handleStop}>⏹ 停止</button>
          )}
          <span style={{ fontSize: 12, color: '#888' }}>频率 {freq} Hz · 音量 {(volume*100).toFixed(0)}%（固定）</span>
        </div>
      </div>

      <div style={styles.controlBar}>
        <span style={{ fontSize: 12, color: '#555', fontWeight: 600 }}>波形选择：</span>
        {Object.entries(waveLabels).map(([t, label]) => (
          <button key={t}
            style={waveType === t ? { ...styles.tabActive, background: waveColors[t], borderColor: waveColors[t] } : styles.tab}
            onClick={() => handleTypeChange(t)}>
            {label}
          </button>
        ))}
      </div>

      <div style={styles.main}>
        <div style={styles.vizContainer}>
          <WaveVisualizer
            getWaveform={playing ? audio.getWaveform : null}
            getSpectrum={playing ? audio.getSpectrum : null}
            mode="both"
            freq={freq}
            sampleRate={audio.getSampleRate()}
            lineColor={waveColors[waveType]}
            waveType={waveType}
          />
        </div>

        <div style={styles.infoPanel}>
          <div style={styles.panelTitle}>📖 音色与波形</div>
          <div style={styles.tipText}>
            <b>音色</b>由波形（谐波结构）决定<br /><br />
            相同频率和音量，<br />
            不同波形 → 不同音色<br /><br />
            <b>当前波形：</b><br />
            <span style={{ color: waveColors[waveType], fontWeight: 600 }}>{waveLabels[waveType]}</span><br />
            {waveDescs[waveType]}
          </div>

          <div style={styles.divider} />

          <div style={styles.panelTitle}>🎼 谐波结构</div>
          <div style={styles.harmonicBars}>
            {harmonics[waveType].map(h => (
              <div key={h.n} style={styles.harmonicRow}>
                <span style={styles.harmonicLabel}>{h.n}f</span>
                <div style={styles.harmonicBarBg}>
                  <div style={{ ...styles.harmonicBarFill, width: `${h.amp * 100}%`, background: waveColors[waveType] }} />
                </div>
                <span style={styles.harmonicVal}>{(h.amp * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>

          <div style={styles.divider} />

          <div style={styles.panelTitle}>🎯 四种波形对比</div>
          <div style={styles.compareGrid}>
            {Object.entries(waveLabels).map(([t, label]) => (
              <div key={t} style={{ ...styles.compareCard, borderColor: waveType === t ? waveColors[t] : '#eee' }}>
                <div style={{ ...styles.compareName, color: waveColors[t] }}>{label}</div>
                <div style={styles.compareDesc}>
                  {t === 'sine' && '纯音，无谐波'}
                  {t === 'square' && '奇次谐波，尖锐'}
                  {t === 'triangle' && '奇次谐波，柔和'}
                  {t === 'sawtooth' && '全部谐波，明亮'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={styles.desc}>
        <b>实验：音色与波形</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          频率和音量固定，切换四种波形听音色差异。上方时域波形，下方频谱——注意谐波结构的不同。
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
  controlBar: { background: '#fafafa', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', padding: '4px 12px', flexShrink: 0, gap: 6 },
  playBtn: { background: '#4CAF50', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  stopBtn: { background: '#E53935', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  tab: { background: '#fff', color: '#555', border: '1px solid #ccc', borderRadius: 4, padding: '4px 12px', fontSize: 12, cursor: 'pointer' },
  tabActive: { background: '#4A90D9', color: '#fff', border: '1px solid #4A90D9', borderRadius: 4, padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600 },
  main: { flex: 1, display: 'flex', overflow: 'hidden', background: '#fff', minHeight: 0 },
  vizContainer: { flex: 1, padding: 8, minHeight: 0 },
  infoPanel: { width: 210, background: 'rgba(255,255,255,0.95)', borderLeft: '1px solid #ddd', padding: 12, flexShrink: 0, overflowY: 'auto' },
  panelTitle: { fontSize: 12, fontWeight: 700, color: '#333', marginBottom: 8 },
  tipText: { fontSize: 11, color: '#555', lineHeight: 1.7 },
  divider: { height: 1, background: '#eee', margin: '10px 0' },
  harmonicBars: { display: 'flex', flexDirection: 'column', gap: 4 },
  harmonicRow: { display: 'flex', alignItems: 'center', gap: 6 },
  harmonicLabel: { fontSize: 10, color: '#555', minWidth: 16, textAlign: 'right' },
  harmonicBarBg: { flex: 1, height: 8, background: '#eee', borderRadius: 4, overflow: 'hidden' },
  harmonicBarFill: { height: '100%', borderRadius: 4 },
  harmonicVal: { fontSize: 9, color: '#888', minWidth: 28, textAlign: 'right' },
  compareGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 },
  compareCard: { border: '1px solid #eee', borderRadius: 6, padding: '6px 8px', cursor: 'pointer' },
  compareName: { fontSize: 11, fontWeight: 600, marginBottom: 2 },
  compareDesc: { fontSize: 9, color: '#888' },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
}
