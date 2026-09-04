import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * GasLawsScene — 气体实验定律
 *
 * - 玻意耳定律 (pV = const, T恒定)
 * - 查理定律 (p/T = const, V恒定)
 * - 盖-吕萨克定律 (V/T = const, p恒定)
 * - p-V / p-T / V-T 图像
 */
export default function GasLawsScene() {
  const canvasRef = useRef(null)
  const [mode, setMode] = useState('boyle') // boyle | charles | gaylussac
  const [volume, setVolume] = useState(5) // L
  const [pressure, setPressure] = useState(2) // atm
  const [temperature, setTemperature] = useState(300) // K
  const S = useRef({ raf: null, last: 0 })
  const nR = 8.314e-5 * 1 // n*R in L·atm/K (n=1mol, R=0.08206)

  // 理想气体: pV = nRT => p = nRT/V
  const nRval = 0.08206 // L·atm/(mol·K)

  const calcPressure = useCallback((V, T) => nRval * T / V, [])
  const calcVolume = useCallback((p, T) => nRval * T / p, [])
  const calcTemp = useCallback((p, V) => p * V / nRval, [])

  useEffect(() => {
    const cvs = canvasRef.current
    if (!cvs) return
    const ctx = cvs.getContext('2d')

    const draw = () => {
      const W = cvs.clientWidth, H = cvs.clientHeight
      cvs.width = W * devicePixelRatio
      cvs.height = H * devicePixelRatio
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      ctx.clearRect(0, 0, W, H)

      const margin = { top: 30, right: 30, bottom: 50, left: 60 }
      const gw = W - margin.left - margin.right
      const gh = H - margin.top - margin.bottom

      // 坐标轴
      ctx.strokeStyle = '#999'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(margin.left, margin.top)
      ctx.lineTo(margin.left, margin.top + gh)
      ctx.lineTo(margin.left + gw, margin.top + gh)
      ctx.stroke()

      ctx.fillStyle = '#333'
      ctx.font = 'bold 13px sans-serif'
      ctx.textAlign = 'center'

      if (mode === 'boyle') {
        // 玻意耳定律: p = nRT/V (T恒定)
        // X: V (1~10L), Y: p (0~5atm)
        const xMin = 1, xMax = 10, yMin = 0, yMax = 5
        const toX = v => margin.left + (v - xMin) / (xMax - xMin) * gw
        const toY = p => margin.top + gh - (p - yMin) / (yMax - yMin) * gh

        // 坐标轴标签
        ctx.fillText('体积 V (L)', margin.left + gw / 2, H - 8)
        ctx.save()
        ctx.translate(15, margin.top + gh / 2)
        ctx.rotate(-Math.PI / 2)
        ctx.fillText('压强 p (atm)', 0, 0)
        ctx.restore()

        // 刻度
        ctx.font = '11px sans-serif'
        ctx.textAlign = 'center'
        for (let v = 1; v <= 10; v++) {
          ctx.fillText(v.toString(), toX(v), margin.top + gh + 18)
          ctx.strokeStyle = '#eee'
          ctx.beginPath(); ctx.moveTo(toX(v), margin.top); ctx.lineTo(toX(v), margin.top + gh); ctx.stroke()
        }
        ctx.textAlign = 'right'
        for (let p = 1; p <= 5; p++) {
          ctx.fillText(p.toString(), margin.left - 8, toY(p) + 4)
          ctx.strokeStyle = '#eee'
          ctx.beginPath(); ctx.moveTo(margin.left, toY(p)); ctx.lineTo(margin.left + gw, toY(p)); ctx.stroke()
        }

        // 等温线 (T=300K)
        ctx.strokeStyle = '#E53935'
        ctx.lineWidth = 2.5
        ctx.beginPath()
        for (let v = xMin; v <= xMax; v += 0.1) {
          const p = calcPressure(v, 300)
          const x = toX(v), y = toY(p)
          if (v === xMin) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        }
        ctx.stroke()

        // 当前状态点
        const cp = calcPressure(volume, temperature)
        const cx = toX(volume), cy = toY(cp)
        if (cp >= yMin && cp <= yMax) {
          ctx.fillStyle = '#FF5722'
          ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill()
          ctx.fillStyle = '#333'
          ctx.font = 'bold 12px sans-serif'
          ctx.textAlign = 'left'
          ctx.fillText(`V=${volume.toFixed(1)}L, p=${cp.toFixed(2)}atm`, cx + 12, cy - 8)
        }

        // 信息
        ctx.fillStyle = '#333'
        ctx.font = '12px sans-serif'
        ctx.textAlign = 'left'
        const pV = (cp * volume).toFixed(2)
        ctx.fillText(`pV = ${pV} (恒量，T=${temperature}K)`, margin.left + 10, margin.top + 20)
        ctx.fillText(`玻意耳定律: p₁V₁ = p₂V₂ (等温过程)`, margin.left + 10, margin.top + 38)

      } else if (mode === 'charles') {
        // 查理定律: p/T = const (V恒定)
        // X: T (200~600K), Y: p (0~5atm)
        const xMin = 200, xMax = 600, yMin = 0, yMax = 5
        const toX = T => margin.left + (T - xMin) / (xMax - xMin) * gw
        const toY = p => margin.top + gh - (p - yMin) / (yMax - yMin) * gh

        ctx.fillText('温度 T (K)', margin.left + gw / 2, H - 8)
        ctx.save()
        ctx.translate(15, margin.top + gh / 2)
        ctx.rotate(-Math.PI / 2)
        ctx.fillText('压强 p (atm)', 0, 0)
        ctx.restore()

        ctx.font = '11px sans-serif'
        ctx.textAlign = 'center'
        for (let T = 200; T <= 600; T += 100) {
          ctx.fillText(T.toString(), toX(T), margin.top + gh + 18)
          ctx.strokeStyle = '#eee'
          ctx.beginPath(); ctx.moveTo(toX(T), margin.top); ctx.lineTo(toX(T), margin.top + gh); ctx.stroke()
        }
        ctx.textAlign = 'right'
        for (let p = 1; p <= 5; p++) {
          ctx.fillText(p.toString(), margin.left - 8, toY(p) + 4)
          ctx.strokeStyle = '#eee'
          ctx.beginPath(); ctx.moveTo(margin.left, toY(p)); ctx.lineTo(margin.left + gw, toY(p)); ctx.stroke()
        }

        // 等容线
        ctx.strokeStyle = '#1976D2'
        ctx.lineWidth = 2.5
        ctx.beginPath()
        for (let T = xMin; T <= xMax; T += 5) {
          const p = calcPressure(volume, T)
          const x = toX(T), y = toY(p)
          if (T === xMin) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        }
        ctx.stroke()

        // 当前状态点
        const cp = calcPressure(volume, temperature)
        const cx = toX(temperature), cy = toY(cp)
        if (cp >= yMin && cp <= yMax) {
          ctx.fillStyle = '#FF5722'
          ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill()
          ctx.fillStyle = '#333'
          ctx.font = 'bold 12px sans-serif'
          ctx.textAlign = 'left'
          ctx.fillText(`T=${temperature}K, p=${cp.toFixed(2)}atm`, cx + 12, cy - 8)
        }

        ctx.fillStyle = '#333'
        ctx.font = '12px sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText(`查理定律: p/T = 恒量 (V=${volume}L恒定)`, margin.left + 10, margin.top + 20)

      } else {
        // 盖-吕萨克定律: V/T = const (p恒定)
        // X: T (200~600K), Y: V (0~15L)
        const xMin = 200, xMax = 600, yMin = 0, yMax = 15
        const toX = T => margin.left + (T - xMin) / (xMax - xMin) * gw
        const toY = V => margin.top + gh - (V - yMin) / (yMax - yMin) * gh

        ctx.fillText('温度 T (K)', margin.left + gw / 2, H - 8)
        ctx.save()
        ctx.translate(15, margin.top + gh / 2)
        ctx.rotate(-Math.PI / 2)
        ctx.fillText('体积 V (L)', 0, 0)
        ctx.restore()

        ctx.font = '11px sans-serif'
        ctx.textAlign = 'center'
        for (let T = 200; T <= 600; T += 100) {
          ctx.fillText(T.toString(), toX(T), margin.top + gh + 18)
          ctx.strokeStyle = '#eee'
          ctx.beginPath(); ctx.moveTo(toX(T), margin.top); ctx.lineTo(toX(T), margin.top + gh); ctx.stroke()
        }
        ctx.textAlign = 'right'
        for (let V = 3; V <= 15; V += 3) {
          ctx.fillText(V.toString(), margin.left - 8, toY(V) + 4)
          ctx.strokeStyle = '#eee'
          ctx.beginPath(); ctx.moveTo(margin.left, toY(V)); ctx.lineTo(margin.left + gw, toY(V)); ctx.stroke()
        }

        // 等压线
        ctx.strokeStyle = '#388E3C'
        ctx.lineWidth = 2.5
        ctx.beginPath()
        for (let T = xMin; T <= xMax; T += 5) {
          const V = calcVolume(pressure, T)
          const x = toX(T), y = toY(V)
          if (T === xMin) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        }
        ctx.stroke()

        // 当前状态点
        const cV = calcVolume(pressure, temperature)
        const cx = toX(temperature), cy = toY(cV)
        if (cV >= yMin && cV <= yMax) {
          ctx.fillStyle = '#FF5722'
          ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill()
          ctx.fillStyle = '#333'
          ctx.font = 'bold 12px sans-serif'
          ctx.textAlign = 'left'
          ctx.fillText(`T=${temperature}K, V=${cV.toFixed(2)}L`, cx + 12, cy - 8)
        }

        ctx.fillStyle = '#333'
        ctx.font = '12px sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText(`盖-吕萨克定律: V/T = 恒量 (p=${pressure}atm恒定)`, margin.left + 10, margin.top + 20)
      }
    }

    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(cvs)
    return () => ro.disconnect()
  }, [mode, volume, pressure, temperature, calcPressure, calcVolume, calcTemp])

  // 根据模式约束参数
  useEffect(() => {
    if (mode === 'boyle') {
      setTemperature(300)
    } else if (mode === 'charles') {
      setVolume(5)
    } else {
      setPressure(2)
    }
  }, [mode])

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>气体实验定律</span>
        <div style={styles.topActions}>
          {['boyle', 'charles', 'gaylussac'].map(m => (
            <button key={m} style={{ ...styles.setBtn, background: mode === m ? '#E53935' : '#7B1FA2' }}
              onClick={() => setMode(m)}>
              {m === 'boyle' ? '玻意耳' : m === 'charles' ? '查理' : '盖-吕萨克'}
            </button>
          ))}
        </div>
      </div>
      <div style={styles.controlBar}>
        {mode === 'boyle' && (
          <label style={styles.controlLabel}>
            <span style={styles.controlName}>体积 V</span>
            <input type="range" min="1" max="10" step="0.1" value={volume}
              onChange={e => setVolume(+e.target.value)} style={styles.slider} />
            <span style={styles.sliderVal}>{volume.toFixed(1)} L</span>
          </label>
        )}
        {mode === 'charles' && (
          <label style={styles.controlLabel}>
            <span style={styles.controlName}>温度 T</span>
            <input type="range" min="200" max="600" step="5" value={temperature}
              onChange={e => setTemperature(+e.target.value)} style={styles.slider} />
            <span style={styles.sliderVal}>{temperature} K</span>
          </label>
        )}
        {mode === 'gaylussac' && (
          <>
            <label style={styles.controlLabel}>
              <span style={styles.controlName}>压强 p</span>
              <input type="range" min="0.5" max="4" step="0.1" value={pressure}
                onChange={e => setPressure(+e.target.value)} style={styles.slider} />
              <span style={styles.sliderVal}>{pressure.toFixed(1)} atm</span>
            </label>
            <label style={styles.controlLabel}>
              <span style={styles.controlName}>温度 T</span>
              <input type="range" min="200" max="600" step="5" value={temperature}
                onChange={e => setTemperature(+e.target.value)} style={styles.slider} />
              <span style={styles.sliderVal}>{temperature} K</span>
            </label>
          </>
        )}
        {mode === 'boyle' && (
          <label style={styles.controlLabel}>
            <span style={styles.controlName}>温度 T</span>
            <input type="range" min="200" max="600" step="5" value={temperature}
              onChange={e => setTemperature(+e.target.value)} style={styles.slider} />
            <span style={styles.sliderVal}>{temperature} K</span>
          </label>
        )}
        <span style={{ fontSize: 12, color: '#E53935', fontWeight: 600, marginLeft: 'auto' }}>
          pV = nRT (n=1mol)
        </span>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      </div>
      <div style={styles.desc}>
        <b>实验：气体实验定律</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          切换三种气体定律，观察等温线/等容线/等压线，拖拽滑块改变状态参量。
        </span>
      </div>
    </div>
  )
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', maxHeight: '100vh', background: '#e8e8e8', color: '#333', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', overflow: 'hidden' },
  topBar: { background: '#f5f5f5', borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', flexShrink: 0 },
  title: { fontSize: 14, fontWeight: 600 },
  topActions: { display: 'flex', gap: 6 },
  controlBar: { background: '#fafafa', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', padding: '4px 12px', flexShrink: 0, gap: 12, flexWrap: 'wrap' },
  controlLabel: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#555' },
  controlName: { fontWeight: 600, color: '#4A90D9' },
  slider: { width: 120, accentColor: '#4A90D9' },
  sliderVal: { color: '#4A90D9', fontWeight: 600, fontSize: 12, minWidth: 55 },
  setBtn: { background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
  main: { flex: 1, minHeight: 0, background: '#fff' },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
}
