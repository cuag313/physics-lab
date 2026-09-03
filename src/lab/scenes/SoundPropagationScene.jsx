import { useRef, useState, useCallback, useEffect } from 'react'
import useAudio from '../audio/useAudio'
import WaveVisualizer from '../audio/WaveVisualizer'

/**
 * SoundPropagationScene — 声音的产生与传播
 *
 * 真空铃实验（推理法）：抽气→声音减弱→真空不能传声
 * 介质传播：固体/液体/气体传声速度对比
 */
export default function SoundPropagationScene() {
  const audio = useAudio()
  const [ringing, setRinging] = useState(false)
  const [airLevel, setAirLevel] = useState(1.0)  // 1.0=满气，0=真空
  const [pumping, setPumping] = useState(false)
  const [medium, setMedium] = useState('air')    // 'air' | 'water' | 'steel'
  const [tick, setTick] = useState(0)

  const pumpTimerRef = useRef(null)

  useEffect(() => {
    if (!ringing) return
    const id = setInterval(() => setTick(t => t + 1), 50)
    return () => clearInterval(id)
  }, [ringing])

  // 振铃：频率800Hz，音量随空气量变化
  const handleRing = useCallback(() => {
    audio.play(800, 'sine', 0.4 * airLevel)
    setRinging(true)
  }, [airLevel])

  const handleStop = useCallback(() => {
    audio.stop(); setRinging(false)
  }, [])

  // 抽气/充气
  const handlePump = useCallback(() => {
    if (pumping) return
    setPumping(true)
    pumpTimerRef.current = setInterval(() => {
      setAirLevel(prev => {
        const next = Math.max(0, prev - 0.02)
        if (ringing) audio.setVolume(0, 0.4 * next)
        if (next <= 0) { clearInterval(pumpTimerRef.current); setPumping(false) }
        return next
      })
    }, 100)
  }, [pumping, ringing])

  const handleFill = useCallback(() => {
    if (pumping) return
    setPumping(true)
    pumpTimerRef.current = setInterval(() => {
      setAirLevel(prev => {
        const next = Math.min(1, prev + 0.03)
        if (ringing) audio.setVolume(0, 0.4 * next)
        if (next >= 1) { clearInterval(pumpTimerRef.current); setPumping(false) }
        return next
      })
    }, 100)
  }, [pumping, ringing])

  const handleReset = useCallback(() => {
    if (pumpTimerRef.current) clearInterval(pumpTimerRef.current)
    audio.stop(); setRinging(false); setAirLevel(1.0); setPumping(false)
  }, [])

  // 介质声速
  const speeds = { air: 340, water: 1480, steel: 5200 }

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>声音的产生与传播</span>
        <div style={styles.topActions}>
          {!ringing ? (
            <button style={styles.playBtn} onClick={handleRing}>🔔 振铃</button>
          ) : (
            <button style={styles.stopBtn} onClick={handleStop}>⏹ 停止</button>
          )}
          <button style={styles.setBtn} onClick={handleReset}>⚙ 重置</button>
          <div style={styles.sep} />
          <button style={pumping ? styles.pauseBtn : styles.btn} onClick={handlePump} disabled={airLevel <= 0}>
            🔽 抽气
          </button>
          <button style={pumping ? styles.pauseBtn : styles.btn} onClick={handleFill} disabled={airLevel >= 1}>
            🔼 充气
          </button>
          <div style={styles.sep} />
          {/* 介质选择 */}
          {[['air', '空气'], ['water', '水'], ['steel', '钢铁']].map(([k, label]) => (
            <button key={k} style={medium === k ? styles.tabActive : styles.tab}
              onClick={() => setMedium(k)}>{label}</button>
          ))}
        </div>
      </div>

      <div style={styles.main}>
        {/* 左侧：真空铃实验 */}
        <div style={styles.leftPanel}>
          <div style={styles.bellContainer}>
            {/* 玻璃罩 */}
            <svg width="240" height="280" viewBox="0 0 240 280">
              {/* 底座 */}
              <rect x="20" y="240" width="200" height="30" rx="4" fill="#78909C" stroke="#546E7A" strokeWidth="2" />
              {/* 玻璃罩 */}
              <path d="M40,240 Q40,40 120,30 Q200,40 200,240" fill={`rgba(200,220,240,${0.2 + airLevel * 0.3})`} stroke="#90A4AE" strokeWidth="2" />
              {/* 空气分子（随空气量变化） */}
              {Array.from({ length: Math.floor(airLevel * 20) }, (_, i) => {
                const cx = 60 + Math.sin(i * 1.3) * 60
                const cy = 80 + Math.cos(i * 0.9) * 100
                return <circle key={i} cx={cx} cy={cy} r="3" fill="rgba(100,180,255,0.5)" />
              })}
              {/* 铃铛 */}
              <g transform="translate(120,130)">
                <path d="M-15,0 L-20,-30 Q0,-45 20,-30 L15,0 Z" fill="#FFD700" stroke="#FFA000" strokeWidth="1.5" />
                <circle cx="0" cy="5" r="4" fill="#FFA000" />
                {/* 振动波纹 */}
                {ringing && <>
                  <circle cx="0" cy="0" r="25" fill="none" stroke="rgba(255,215,0,0.3)" strokeWidth="1">
                    <animate attributeName="r" values="25;40;25" dur="0.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.5;0;0.5" dur="0.5s" repeatCount="indefinite" />
                  </circle>
                  <circle cx="0" cy="0" r="30" fill="none" stroke="rgba(255,215,0,0.2)" strokeWidth="1">
                    <animate attributeName="r" values="30;50;30" dur="0.7s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.3;0;0.3" dur="0.7s" repeatCount="indefinite" />
                  </circle>
                </>}
              </g>
              {/* 抽气管 */}
              <line x1="200" y1="240" x2="230" y2="260" stroke="#78909C" strokeWidth="3" />
              <rect x="225" y="255" width="12" height="15" rx="2" fill="#546E7A" />
            </svg>
            {/* 空气量指示 */}
            <div style={styles.airGauge}>
              <div style={styles.airLabel}>空气量</div>
              <div style={styles.airBar}>
                <div style={{ ...styles.airFill, width: `${airLevel * 100}%` }} />
              </div>
              <div style={styles.airValue}>{(airLevel * 100).toFixed(0)}%</div>
            </div>
          </div>
          <div style={styles.bellHint}>
            {airLevel > 0.8 ? '🔊 声音清晰响亮' :
             airLevel > 0.3 ? '🔉 声音明显减弱' :
             airLevel > 0.05 ? '🔈 声音极其微弱' :
             '🔇 真空无法传声！'}
          </div>
        </div>

        {/* 右侧：信息面板 + 波形 */}
        <div style={styles.rightPanel}>
          <div style={styles.vizBox}>
            <WaveVisualizer
              getWaveform={ringing ? audio.getWaveform : null}
              mode="waveform"
              freq={800}
              sampleRate={audio.getSampleRate()}
              lineColor="#1976D2"
            />
          </div>
          <div style={styles.infoPanel}>
            <div style={styles.panelTitle}>📖 声音的传播</div>
            <div style={styles.tipText}>
              <b>真空铃实验（推理法）：</b><br />
              抽气→空气减少→声音减弱<br />
              推理：真空不能传声<br /><br />
              <b>介质声速（常温）：</b><br />
              空气：{speeds.air} m/s<br />
              水：{speeds.water} m/s<br />
              钢铁：{speeds.steel} m/s<br /><br />
              <b>规律：</b>固体 &gt; 液体 &gt; 气体<br /><br />
              声音传播需要介质，<br />
              真空不能传声。
            </div>
            <div style={styles.divider} />
            <div style={styles.panelTitle}>🔬 介质对比</div>
            <div style={styles.speedBars}>
              {[['空气', 340, '#4CAF50'], ['水', 1480, '#1976D2'], ['钢铁', 5200, '#D32F2F']].map(([name, speed, color]) => (
                <div key={name} style={styles.speedRow}>
                  <span style={styles.speedLabel}>{name}</span>
                  <div style={styles.speedBarBg}>
                    <div style={{ ...styles.speedBarFill, width: `${(speed / 5200) * 100}%`, background: color }} />
                  </div>
                  <span style={styles.speedVal}>{speed} m/s</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={styles.desc}>
        <b>实验：声音的产生与传播</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          点击"振铃"→抽气→声音减弱→推理真空不能传声。切换介质观察声速差异。
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
  btn: { background: '#fff', color: '#4A90D9', border: '1px solid #ccc', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' },
  playBtn: { background: '#4CAF50', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  stopBtn: { background: '#E53935', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  pauseBtn: { background: '#FF9800', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  setBtn: { background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
  sep: { width: 1, height: 18, background: '#ccc', flexShrink: 0 },
  tab: { background: '#fff', color: '#555', border: '1px solid #ccc', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer' },
  tabActive: { background: '#4A90D9', color: '#fff', border: '1px solid #4A90D9', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 },
  main: { flex: 1, display: 'flex', overflow: 'hidden', background: '#fff', minHeight: 0 },
  leftPanel: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16, borderRight: '1px solid #eee' },
  bellContainer: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 },
  airGauge: { display: 'flex', alignItems: 'center', gap: 8 },
  airLabel: { fontSize: 11, color: '#666', fontWeight: 600 },
  airBar: { width: 120, height: 10, background: '#eee', borderRadius: 5, overflow: 'hidden' },
  airFill: { height: '100%', background: '#4CAF50', borderRadius: 5, transition: 'width 0.1s' },
  airValue: { fontSize: 12, fontWeight: 600, color: '#4A90D9', minWidth: 36 },
  bellHint: { fontSize: 14, fontWeight: 600, color: '#333', marginTop: 12, textAlign: 'center' },
  rightPanel: { flex: 1, display: 'flex', flexDirection: 'column', padding: 8, gap: 8, overflow: 'hidden' },
  vizBox: { height: 180, flexShrink: 0 },
  infoPanel: { flex: 1, background: 'rgba(255,255,255,0.95)', border: '1px solid #eee', borderRadius: 8, padding: 12, overflowY: 'auto' },
  panelTitle: { fontSize: 12, fontWeight: 700, color: '#333', marginBottom: 8 },
  tipText: { fontSize: 11, color: '#555', lineHeight: 1.7 },
  divider: { height: 1, background: '#eee', margin: '10px 0' },
  speedBars: { display: 'flex', flexDirection: 'column', gap: 8 },
  speedRow: { display: 'flex', alignItems: 'center', gap: 8 },
  speedLabel: { fontSize: 11, color: '#555', minWidth: 36 },
  speedBarBg: { flex: 1, height: 10, background: '#eee', borderRadius: 5, overflow: 'hidden' },
  speedBarFill: { height: '100%', borderRadius: 5, transition: 'width 0.3s' },
  speedVal: { fontSize: 10, color: '#888', minWidth: 55, textAlign: 'right' },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
}
