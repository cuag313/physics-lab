import { useRef, useState, useCallback, useEffect } from 'react'
import useAudio from '../audio/useAudio'

/**
 * SoundEchoScene — 回声与声测距
 *
 * 声波遇障碍物反射形成回声
 * - 改变声源-障碍物距离
 * - 观察回声时间差
 * - 回声测距计算 s = vt/2
 */
export default function SoundEchoScene() {
  const audio = useAudio()
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const [playing, setPlaying] = useState(false)
  const [distance, setDistance] = useState(170) // m（声源到障碍物）
  const [volume, setVolume] = useState(0.4)
  const [time, setTime] = useState(0)
  const [echoTime, setEchoTime] = useState(0)
  const [echoReceived, setEchoReceived] = useState(false)

  const v_sound = 340 // m/s
  const roundTrip = 2 * distance // 往返距离
  const expectedTime = roundTrip / v_sound // 回声时间

  // 发声+计时
  const handleClap = useCallback(() => {
    audio.play(800, 'square', volume)
    setPlaying(true); setTime(0); setEchoReceived(false); setEchoTime(0)
    // 模拟回声返回
    setTimeout(() => {
      setEchoReceived(true)
      setEchoTime(expectedTime)
      // 回声播放
      audio.play(800, 'square', volume * 0.5)
      setTimeout(() => { audio.stop(); setPlaying(false) }, 300)
    }, expectedTime * 1000)
  }, [volume, expectedTime])

  const handleStop = useCallback(() => {
    audio.stop(); setPlaying(false); setTime(0); setEchoReceived(false)
  }, [])

  // 计时器
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      setTime(t => {
        const next = t + 0.01
        if (next >= expectedTime && !echoReceived) {
          return expectedTime
        }
        return next
      })
    }, 10)
    return () => clearInterval(id)
  }, [playing, expectedTime, echoReceived])

  // 绘制场景
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

    const cy = h * 0.55
    const personX = w * 0.12
    const wallX = w * 0.88
    const sceneW = wallX - personX

    // 地面
    ctx.strokeStyle = '#b0bec5'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(personX - 20, cy + 40); ctx.lineTo(wallX + 20, cy + 40); ctx.stroke()

    // 声源（人）
    ctx.fillStyle = '#1976D2'
    ctx.beginPath(); ctx.arc(personX, cy, 14, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('声源', personX, cy)

    // 障碍物（墙）
    ctx.fillStyle = '#78909C'
    ctx.fillRect(wallX - 8, cy - 50, 16, 90)
    ctx.fillStyle = '#546E7A'
    ctx.fillRect(wallX - 4, cy - 50, 8, 90)

    // 声波传播动画
    if (playing) {
      const progress = time / expectedTime
      const waveX = personX + progress * sceneW * 0.5

      // 前进波（蓝色）
      ctx.strokeStyle = 'rgba(25,118,210,0.4)'; ctx.lineWidth = 2
      for (let i = 0; i < 5; i++) {
        const r = (progress * sceneW * 0.5 - i * 20)
        if (r > 0) {
          ctx.beginPath(); ctx.arc(personX, cy, r, -0.3, 0.3); ctx.stroke()
        }
      }

      // 回声波（橙色）
      if (echoReceived) {
        const echoProgress = (time - expectedTime) / expectedTime
        if (echoProgress > 0) {
          const echoR = echoProgress * sceneW * 0.5
          ctx.strokeStyle = 'rgba(255,152,0,0.4)'; ctx.lineWidth = 2
          for (let i = 0; i < 3; i++) {
            const r = echoR - i * 20
            if (r > 0) {
              ctx.beginPath(); ctx.arc(wallX, cy, r, Math.PI - 0.3, Math.PI + 0.3); ctx.stroke()
            }
          }
        }
      }
    }

    // 距离标注
    ctx.strokeStyle = 'rgba(100,100,100,0.3)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(personX, cy + 55); ctx.lineTo(wallX, cy + 55); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#666'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(`s = ${distance} m`, (personX + wallX) / 2, cy + 68)

    // 往返标注
    ctx.fillStyle = '#FF9800'; ctx.font = '9px sans-serif'
    ctx.fillText(`往返 2s = ${roundTrip} m`, (personX + wallX) / 2, cy + 82)

    // 回声时间
    ctx.fillStyle = '#333'; ctx.font = '12px sans-serif'
    ctx.fillText(`回声时间 t = 2s/v = ${expectedTime.toFixed(2)} s`, w / 2, 30)

    animRef.current = requestAnimationFrame(() => {})
  }, [playing, time, distance, echoReceived, expectedTime, roundTrip])

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>回声与声测距</span>
        <div style={styles.topActions}>
          {!playing ? (
            <button style={styles.playBtn} onClick={handleClap}>👏 发声</button>
          ) : (
            <button style={styles.stopBtn} onClick={handleStop}>⏹ 停止</button>
          )}
          <div style={styles.sep} />
          {[34, 85, 170, 340, 510].map(d => (
            <button key={d} style={distance === d ? styles.tabActive : styles.tab}
              onClick={() => setDistance(d)}>
              {d}m
            </button>
          ))}
        </div>
      </div>

      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>距离 s</span>
          <input type="range" min="17" max="850" step="1" value={distance}
            onChange={(e) => setDistance(parseInt(e.target.value))} style={styles.slider} />
          <input type="number" min="17" max="1700" step="1" value={distance}
            onChange={(e) => setDistance(Math.max(17, parseInt(e.target.value) || 17))} style={styles.numInput} />
          <span style={styles.sliderVal}>m</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>音量</span>
          <input type="range" min="0" max="0.6" step="0.01" value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))} style={styles.slider} />
          <span style={styles.sliderVal}>{(volume * 100).toFixed(0)}%</span>
        </label>
        <span style={{ fontSize: 12, color: '#FF9800', fontWeight: 600 }}>
          回声时间: {expectedTime.toFixed(2)} s
        </span>
      </div>

      <div style={styles.main}>
        <div style={styles.graphArea}>
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>

        <div style={styles.infoPanel}>
          <div style={styles.panelTitle}>📊 回声参数</div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>距离 s</span><span style={styles.panelValue}>{distance} m</span></div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>往返 2s</span><span style={styles.panelValue}>{roundTrip} m</span></div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>声速 v</span><span style={styles.panelValue}>{v_sound} m/s</span></div>
          <div style={styles.panelRow}><span style={styles.panelLabel}>回声时间</span><span style={{ ...styles.panelValue, color: '#E53935' }}>{expectedTime.toFixed(2)} s</span></div>
          <div style={styles.divider} />

          <div style={styles.panelTitle}>📖 回声测距原理</div>
          <div style={styles.tipText}>
            <b>回声</b>：声波遇障碍物反射回来<br /><br />
            <b>测距公式：</b><br />
            s = v × t / 2<br /><br />
            v = 340 m/s（空气声速）<br />
            t：发声到听到回声的时间<br />
            ÷2：因为是往返距离<br /><br />
            <b>条件：</b><br />
            距离 ≥ 17m（回声延迟 ≥ 0.1s）<br />
            否则回声与原声混在一起<br /><br />
            <b>应用：</b><br />
            声纳测深<br />
            雷达测距<br />
            超声波探伤
          </div>

          <div style={styles.divider} />
          <div style={styles.panelTitle}>⏱️ 计时器</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: echoReceived ? '#4CAF50' : '#1976D2', textAlign: 'center', fontFamily: 'Consolas,monospace' }}>
            {time.toFixed(2)} s
          </div>
          {echoReceived && (
            <div style={{ fontSize: 11, color: '#4CAF50', textAlign: 'center', marginTop: 4 }}>
              ✓ 回声已接收！
            </div>
          )}
        </div>
      </div>

      <div style={styles.desc}>
        <b>实验：回声与声测距</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          改变声源到障碍物的距离，点击"发声"，观察回声时间。验证 s = vt/2 测距公式。
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
  controlName: { fontWeight: 600, color: '#4A90D9' },
  slider: { width: 100, accentColor: '#4A90D9' },
  numInput: { width: 52, border: '1px solid #ccc', borderRadius: 3, padding: '2px 4px', fontSize: 11, textAlign: 'center' },
  sliderVal: { color: '#4A90D9', fontWeight: 600, fontSize: 12 },
  playBtn: { background: '#4CAF50', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  stopBtn: { background: '#E53935', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  sep: { width: 1, height: 18, background: '#ccc' },
  tab: { background: '#fff', color: '#555', border: '1px solid #ccc', borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer' },
  tabActive: { background: '#4A90D9', color: '#fff', border: '1px solid #4A90D9', borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer', fontWeight: 600 },
  main: { flex: 1, display: 'flex', overflow: 'hidden', background: '#fff', minHeight: 0 },
  graphArea: { flex: 1, padding: 8, minHeight: 0 },
  infoPanel: { width: 210, background: 'rgba(255,255,255,0.95)', borderLeft: '1px solid #ddd', padding: 12, flexShrink: 0, overflowY: 'auto' },
  panelTitle: { fontSize: 12, fontWeight: 700, color: '#333', marginBottom: 8 },
  panelRow: { display: 'flex', justifyContent: 'space-between', marginBottom: 5 },
  panelLabel: { fontSize: 11, color: '#666' },
  panelValue: { fontSize: 12, fontWeight: 600, color: '#1976D2' },
  divider: { height: 1, background: '#eee', margin: '10px 0' },
  tipText: { fontSize: 10, color: '#777', lineHeight: 1.6 },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
}
