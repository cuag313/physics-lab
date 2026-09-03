import { useState, useCallback, useEffect } from 'react'
import useAudio from '../audio/useAudio'
import WaveVisualizer from '../audio/WaveVisualizer'

/**
 * SoundNoiseScene — 噪声防治
 *
 * 声强级dB可视化 + 三种防治途径（声源/传播/接收）
 */
export default function SoundNoiseScene() {
  const audio = useAudio()
  const [playing, setPlaying] = useState(false)
  const [noiseType, setNoiseType] = useState('traffic') // traffic | factory | music
  const [volume, setVolume] = useState(0.4)
  const [tick, setTick] = useState(0)

  const noises = {
    traffic: { name: '交通噪声', freq: 200, type: 'sawtooth', dB: 80, color: '#D32F2F' },
    factory: { name: '工厂噪声', freq: 350, type: 'square', dB: 95, color: '#FF6F00' },
    music: { name: '音乐声', freq: 440, type: 'sine', dB: 60, color: '#1976D2' },
  }

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => setTick(t => t + 1), 50)
    return () => clearInterval(id)
  }, [playing])

  const handlePlay = useCallback(() => {
    const n = noises[noiseType]
    audio.play(n.freq, n.type, volume); setPlaying(true)
  }, [noiseType, volume])

  const handleStop = useCallback(() => {
    audio.stop(); setPlaying(false)
  }, [])

  const handleTypeChange = useCallback((t) => {
    setNoiseType(t)
    if (playing) { audio.stop(); audio.play(noises[t].freq, noises[t].type, volume) }
  }, [playing, volume])

  const currentNoise = noises[noiseType]
  const displaydB = Math.round(currentNoise.dB * (volume / 0.4))

  // dB 等级颜色
  const getdBColor = (db) => {
    if (db < 40) return '#4CAF50'
    if (db < 60) return '#8BC34A'
    if (db < 80) return '#FF9800'
    if (db < 100) return '#F44336'
    return '#9C27B0'
  }

  // dB 等级描述
  const getdBLevel = (db) => {
    if (db < 30) return '🤫 极静（耳语）'
    if (db < 50) return '🏠 安静（图书馆）'
    if (db < 70) return '🗣️ 正常（说话）'
    if (db < 85) return '🚗 较吵（交通）'
    if (db < 100) return '🏭 很吵（工厂）'
    return '⚠️ 危险（听力损伤）'
  }

  // 防治途径
  const methods = [
    { icon: '🔇', title: '声源处', desc: '消声器、禁止鸣笛、降低机器振动', examples: ['汽车消声器', '工地限时施工', '乐器弱音器'] },
    { icon: '🧱', title: '传播中', desc: '隔音墙、绿化带、真空玻璃', examples: ['高速公路隔音墙', '种植树木吸声', '双层真空玻璃'] },
    { icon: '🎧', title: '接收处', desc: '耳塞、隔音耳罩、捂住耳朵', examples: ['工厂工人耳塞', '飞行员耳罩', '捂住耳朵'] },
  ]

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>噪声防治</span>
        <div style={styles.topActions}>
          {!playing ? (
            <button style={styles.playBtn} onClick={handlePlay}>▶ 播放噪声</button>
          ) : (
            <button style={styles.stopBtn} onClick={handleStop}>⏹ 停止</button>
          )}
          <div style={styles.sep} />
          {Object.entries(noises).map(([k, n]) => (
            <button key={k} style={noiseType === k ? { ...styles.tabActive, background: n.color, borderColor: n.color } : styles.tab}
              onClick={() => handleTypeChange(k)}>
              {n.name}
            </button>
          ))}
        </div>
      </div>

      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>音量</span>
          <input type="range" min="0" max="0.8" step="0.01" value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))} style={styles.slider} />
          <span style={styles.sliderVal}>{(volume * 100).toFixed(0)}%</span>
        </label>
        <span style={{ fontSize: 13, color: getdBColor(displaydB), fontWeight: 700 }}>
          ≈ {displaydB} dB — {getdBLevel(displaydB)}
        </span>
      </div>

      <div style={styles.main}>
        <div style={styles.leftPanel}>
          {/* dB 仪表 */}
          <div style={styles.dbMeter}>
            <div style={styles.dbTitle}>声强级 (dB)</div>
            <div style={styles.dbBar}>
              <div style={{ ...styles.dbFill, width: `${Math.min(100, displaydB / 1.2)}%`, background: getdBColor(displaydB) }} />
              {/* 标记 */}
              {[40, 60, 80, 100].map(db => (
                <div key={db} style={{ ...styles.dbMark, left: `${db / 1.2}%` }}>
                  <div style={styles.dbMarkLine} />
                  <span style={styles.dbMarkLabel}>{db}</span>
                </div>
              ))}
            </div>
            <div style={styles.dbLabels}>
              <span>0 dB</span><span>听觉阈</span><span>痛觉阈 120dB</span>
            </div>
          </div>

          {/* 波形 */}
          <div style={{ height: 140, flexShrink: 0 }}>
            <WaveVisualizer
              getWaveform={playing ? audio.getWaveform : null}
              mode="waveform"
              freq={currentNoise.freq}
              sampleRate={audio.getSampleRate()}
              lineColor={currentNoise.color}
            />
          </div>

          {/* dB 参考表 */}
          <div style={styles.refTable}>
            <div style={styles.refTitle}>常见声强级参考</div>
            {[
              ['耳语', 20, '#4CAF50'], ['图书馆', 40, '#8BC34A'],
              ['正常说话', 60, '#CDDC39'], ['交通', 80, '#FF9800'],
              ['工厂', 95, '#F44336'], ['痛觉阈', 120, '#9C27B0'],
            ].map(([name, db, color]) => (
              <div key={name} style={styles.refRow}>
                <span style={styles.refName}>{name}</span>
                <div style={styles.refBarBg}>
                  <div style={{ ...styles.refBarFill, width: `${db / 1.2}%`, background: color }} />
                </div>
                <span style={styles.refdB}>{db} dB</span>
              </div>
            ))}
          </div>
        </div>

        <div style={styles.rightPanel}>
          <div style={styles.panelTitle}>📖 噪声防治三种途径</div>
          {methods.map(m => (
            <div key={m.title} style={styles.methodCard}>
              <div style={styles.methodHeader}>
                <span style={styles.methodIcon}>{m.icon}</span>
                <span style={styles.methodTitle}>{m.title}</span>
              </div>
              <div style={styles.methodDesc}>{m.desc}</div>
              <div style={styles.methodExamples}>
                {m.examples.map(e => <span key={e} style={styles.methodTag}>{e}</span>)}
              </div>
            </div>
          ))}
          <div style={styles.divider} />
          <div style={styles.tipText}>
            <b>噪声</b>：发声体无规则振动产生<br />
            <b>声强级</b>：L = 10lg(I/I₀) dB<br />
            <b>听觉阈</b>：0 dB (10⁻¹² W/m²)<br />
            <b>痛觉阈</b>：120 dB<br />
            <b>危害</b>：&gt;90dB长期暴露损伤听力
          </div>
        </div>
      </div>

      <div style={styles.desc}>
        <b>实验：噪声防治</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          播放不同噪声源，观察声强级。了解三种防治途径：声源处、传播中、接收处。
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
  controlBar: { background: '#fafafa', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', padding: '4px 12px', flexShrink: 0, gap: 8 },
  controlLabel: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#555' },
  controlName: { fontWeight: 600, color: '#4A90D9' },
  slider: { width: 120, accentColor: '#D32F2F' },
  sliderVal: { color: '#D32F2F', fontWeight: 600, fontSize: 12 },
  playBtn: { background: '#FF9800', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  stopBtn: { background: '#E53935', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  sep: { width: 1, height: 18, background: '#ccc' },
  tab: { background: '#fff', color: '#555', border: '1px solid #ccc', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer' },
  tabActive: { color: '#fff', border: '1px solid transparent', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 },
  main: { flex: 1, display: 'flex', overflow: 'hidden', background: '#fff', minHeight: 0 },
  leftPanel: { flex: 1, display: 'flex', flexDirection: 'column', gap: 10, padding: 12, borderRight: '1px solid #eee', overflowY: 'auto' },
  dbMeter: { flexShrink: 0 },
  dbTitle: { fontSize: 12, fontWeight: 700, color: '#333', marginBottom: 6 },
  dbBar: { position: 'relative', height: 20, background: '#eee', borderRadius: 10, overflow: 'visible' },
  dbFill: { height: '100%', borderRadius: 10, transition: 'width 0.2s' },
  dbMark: { position: 'absolute', top: 0, transform: 'translateX(-50%)' },
  dbMarkLine: { width: 1, height: 24, background: 'rgba(0,0,0,0.2)' },
  dbMarkLabel: { fontSize: 8, color: '#999', position: 'absolute', top: 26, left: '50%', transform: 'translateX(-50%)' },
  dbLabels: { display: 'flex', justifyContent: 'space-between', marginTop: 18, fontSize: 8, color: '#999' },
  refTable: { flexShrink: 0 },
  refTitle: { fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 6 },
  refRow: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 },
  refName: { fontSize: 10, color: '#555', minWidth: 50 },
  refBarBg: { flex: 1, height: 6, background: '#eee', borderRadius: 3, overflow: 'hidden' },
  refBarFill: { height: '100%', borderRadius: 3 },
  refdB: { fontSize: 9, color: '#888', minWidth: 35, textAlign: 'right' },
  rightPanel: { width: 260, padding: 12, flexShrink: 0, overflowY: 'auto' },
  panelTitle: { fontSize: 12, fontWeight: 700, color: '#333', marginBottom: 10 },
  methodCard: { background: '#f8f9fa', border: '1px solid #eee', borderRadius: 8, padding: '8px 10px', marginBottom: 8 },
  methodHeader: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 },
  methodIcon: { fontSize: 16 },
  methodTitle: { fontSize: 12, fontWeight: 600, color: '#333' },
  methodDesc: { fontSize: 10, color: '#555', marginBottom: 4 },
  methodExamples: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  methodTag: { fontSize: 9, color: '#4A90D9', background: 'rgba(74,144,217,0.1)', borderRadius: 3, padding: '1px 5px' },
  divider: { height: 1, background: '#eee', margin: '10px 0' },
  tipText: { fontSize: 10, color: '#777', lineHeight: 1.6 },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
}
