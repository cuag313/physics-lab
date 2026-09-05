import { useState, useRef, useEffect, useCallback } from 'react'

/**
 * AmpereForceScene — 探究安培力影响因素
 * F = BIL，控制变量法
 */
export default function AmpereForceScene() {
  const [current, setCurrent] = useState(2) // A
  const [length, setLength] = useState(0.5) // m
  const [fieldB, setFieldB] = useState(1.0) // T
  const [data, setData] = useState([])
  const [varMode, setVarMode] = useState('I') // I | L | B — 控制变量
  const [showRule, setShowRule] = useState(false)
  const canvasRef = useRef(null)
  const tick = useRef(0)
  const raf = useRef(null)

  const force = fieldB * current * length

  const addData = useCallback(() => {
    setData(d => [...d, { B: fieldB, I: current, L: length, F: force, t: Date.now() }].slice(-20))
  }, [fieldB, current, length, force])

  useEffect(() => {
    const cvs = canvasRef.current
    if (!cvs) return
    const ctx = cvs.getContext('2d')

    const draw = () => {
      tick.current++
      const W = cvs.clientWidth, H = cvs.clientHeight
      cvs.width = W * devicePixelRatio; cvs.height = H * devicePixelRatio
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      ctx.clearRect(0, 0, W, H)

      const t = tick.current * 0.02

      // === 左侧：U形磁铁 + 导线 ===
      const magX = W * 0.12, magY = H * 0.25
      const magW = W * 0.28, magH = H * 0.45

      // U形磁铁
      // N极（左）
      ctx.fillStyle = '#E53935'
      ctx.fillRect(magX, magY, magW * 0.25, magH)
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 16px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('N', magX + magW * 0.125, magY + magH * 0.55)
      // S极（右）
      ctx.fillStyle = '#1565C0'
      ctx.fillRect(magX + magW * 0.75, magY, magW * 0.25, magH)
      ctx.fillStyle = '#fff'
      ctx.fillText('S', magX + magW * 0.875, magY + magH * 0.55)
      // 底部连接
      ctx.fillStyle = '#888'
      ctx.fillRect(magX, magY + magH - 10, magW, 10)

      // 磁场线 (B方向 N→S)
      ctx.strokeStyle = 'rgba(33,150,243,0.3)'
      ctx.lineWidth = 1.5
      for (let i = 0; i < 5; i++) {
        const lineY = magY + magH * 0.2 + i * magH * 0.15
        ctx.beginPath()
        ctx.moveTo(magX + magW * 0.25, lineY)
        ctx.lineTo(magX + magW * 0.75, lineY)
        ctx.stroke()
        // 箭头
        ctx.fillStyle = 'rgba(33,150,243,0.4)'
        ctx.beginPath()
        ctx.moveTo(magX + magW * 0.7, lineY - 4)
        ctx.lineTo(magX + magW * 0.75, lineY)
        ctx.lineTo(magX + magW * 0.7, lineY + 4)
        ctx.fill()
      }
      ctx.fillStyle = '#1565C0'
      ctx.font = 'bold 13px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('B', magX + magW * 0.5, magY - 8)
      ctx.fillText('→', magX + magW * 0.5 + 14, magY - 6)

      // 导线（水平，在磁铁中间）
      const wireY = magY + magH * 0.35
      const wireLen = magW * 0.45
      const wireX1 = magX + magW * 0.275
      const wireX2 = wireX1 + wireLen
      // 导线偏移（安培力方向 = 垂直于B和I）
      const forceOffset = Math.min(force * 8, 40) * Math.sin(t * 0.5) * 0.3
      const displayWireY = wireY + forceOffset

      // 电流方向箭头
      ctx.strokeStyle = '#FF9800'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(wireX1, displayWireY)
      ctx.lineTo(wireX2, displayWireY)
      ctx.stroke()
      // 电流箭头
      ctx.fillStyle = '#FF9800'
      for (let i = 0; i < 3; i++) {
        const ax = wireX1 + (i + 0.5) * wireLen / 3
        ctx.beginPath()
        ctx.moveTo(ax + 8, displayWireY)
        ctx.lineTo(ax - 2, displayWireY - 6)
        ctx.lineTo(ax - 2, displayWireY + 6)
        ctx.fill()
      }
      ctx.fillStyle = '#FF9800'
      ctx.font = 'bold 13px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(`I = ${current.toFixed(1)} A`, wireX1, displayWireY - 15)
      ctx.fillText(`L = ${length.toFixed(2)} m`, wireX1, displayWireY + 25)

      // 安培力箭头 (F = BIL，方向由左手定则)
      if (force > 0.01) {
        const forceLen = Math.min(force * 20, 60)
        ctx.strokeStyle = '#E53935'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(wireX1 + wireLen / 2, displayWireY)
        ctx.lineTo(wireX1 + wireLen / 2, displayWireY + forceLen)
        ctx.stroke()
        ctx.fillStyle = '#E53935'
        ctx.beginPath()
        ctx.moveTo(wireX1 + wireLen / 2, displayWireY + forceLen)
        ctx.lineTo(wireX1 + wireLen / 2 - 6, displayWireY + forceLen - 10)
        ctx.lineTo(wireX1 + wireLen / 2 + 6, displayWireY + forceLen - 10)
        ctx.fill()
        ctx.font = 'bold 13px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(`F = ${force.toFixed(2)} N`, wireX1 + wireLen / 2, displayWireY + forceLen + 18)
      }

      // B标注线
      ctx.fillStyle = '#1565C0'
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(`B = ${fieldB.toFixed(1)} T`, magX + magW * 0.5, magY + magH + 20)

      // === 右侧：柱状图 ===
      const chartX = W * 0.55, chartY = H * 0.08
      const chartW = W * 0.38, chartH = H * 0.42

      ctx.fillStyle = '#f9f9f9'
      ctx.fillRect(chartX, chartY, chartW, chartH)
      ctx.strokeStyle = '#ddd'
      ctx.lineWidth = 1
      ctx.strokeRect(chartX, chartY, chartW, chartH)

      ctx.fillStyle = '#333'
      ctx.font = 'bold 13px sans-serif'
      ctx.textAlign = 'center'
      const chartTitle = varMode === 'I' ? 'F ∝ I（B、L不变）' : varMode === 'L' ? 'F ∝ L（B、I不变）' : 'F ∝ B（I、L不变）'
      ctx.fillText(chartTitle, chartX + chartW / 2, chartY + 18)

      // 生成模拟数据点
      const points = []
      for (let i = 0; i < 6; i++) {
        let v, f
        if (varMode === 'I') {
          v = 0.5 + i * 0.8
          f = fieldB * v * length
        } else if (varMode === 'L') {
          v = 0.1 + i * 0.15
          f = fieldB * current * v
        } else {
          v = 0.2 + i * 0.3
          f = v * current * length
        }
        points.push({ v, f })
      }
      const maxF = Math.max(...points.map(p => p.f), force, 0.1)
      const barW = chartW / (points.length + 2)
      const barMaxH = chartH - 50

      points.forEach((p, i) => {
        const bx = chartX + barW * (i + 1)
        const bh = (p.f / maxF) * barMaxH
        const by = chartY + chartH - 30 - bh
        ctx.fillStyle = 'rgba(74,144,217,0.6)'
        ctx.fillRect(bx, by, barW * 0.7, bh)
        ctx.fillStyle = '#333'
        ctx.font = '10px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(p.v.toFixed(2), bx + barW * 0.35, chartY + chartH - 15)
        ctx.fillText(p.f.toFixed(2), bx + barW * 0.35, by - 5)
      })
      // 当前值高亮
      let curV = varMode === 'I' ? current : varMode === 'L' ? length : fieldB
      const curBh = (force / maxF) * barMaxH
      const curBy = chartY + chartH - 30 - curBh
      ctx.fillStyle = '#E53935'
      ctx.fillRect(chartX + barW * (points.length + 1), curBy, barW * 0.7, curBh)
      ctx.fillStyle = '#E53935'
      ctx.font = 'bold 10px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(curV.toFixed(2), chartX + barW * (points.length + 1) + barW * 0.35, chartY + chartH - 15)
      ctx.fillText(force.toFixed(2), chartX + barW * (points.length + 1) + barW * 0.35, curBy - 5)

      // === 数据表 ===
      const tableY = H * 0.55
      ctx.fillStyle = '#f5f5f5'
      ctx.fillRect(0, tableY, W, H - tableY)
      ctx.strokeStyle = '#ccc'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, tableY)
      ctx.lineTo(W, tableY)
      ctx.stroke()

      ctx.fillStyle = '#333'
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('📊 记录数据', 16, tableY + 18)

      // 表头
      const colW = W / 6
      const headers = ['#', 'B (T)', 'I (A)', 'L (m)', 'F (N)', 'F=BIL']
      ctx.font = '11px sans-serif'
      ctx.fillStyle = '#666'
      headers.forEach((h, i) => {
        ctx.fillText(h, 16 + i * colW, tableY + 36)
      })

      // 数据行
      ctx.font = '11px monospace'
      ctx.fillStyle = '#333'
      data.slice(-4).forEach((d, i) => {
        const row = [i + 1, d.B.toFixed(1), d.I.toFixed(2), d.L.toFixed(2), d.F.toFixed(3), `${d.B.toFixed(1)}×${d.I.toFixed(2)}×${d.L.toFixed(2)}`]
        row.forEach((v, j) => {
          ctx.fillText(String(v), 16 + j * colW, tableY + 52 + i * 16)
        })
      })

      // 实时数据
      ctx.fillStyle = '#4A90D9'
      ctx.font = 'bold 14px sans-serif'
      ctx.fillText(`当前: F = B × I × L = ${fieldB.toFixed(1)} × ${current.toFixed(2)} × ${length.toFixed(2)} = ${force.toFixed(3)} N`, 16, H - 16)

      raf.current = requestAnimationFrame(draw)
    }
    raf.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf.current)
  }, [current, length, fieldB, force, data, varMode])

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>探究安培力影响因素</span>
        <div style={styles.topActions}>
          {['I', 'L', 'B'].map(v => (
            <button key={v} style={{ ...styles.setBtn, background: varMode === v ? '#4A90D9' : '#7B1FA2' }} onClick={() => setVarMode(v)}>
              控制变量：{v === 'I' ? '改变I' : v === 'L' ? '改变L' : '改变B'}
            </button>
          ))}
          <button style={{ ...styles.setBtn, background: '#FF9800' }} onClick={addData}>记录数据</button>
          <button style={styles.setBtn} onClick={() => setData([])}>清空数据</button>
          <button style={{ ...styles.setBtn, background: showRule ? '#4CAF50' : '#7B1FA2' }} onClick={() => setShowRule(r => !r)}>左手定则</button>
        </div>
      </div>
      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>电流 I</span>
          <input type="range" min="0" max="5" step="0.1" value={current} onChange={e => setCurrent(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{current.toFixed(1)} A</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>导线长度 L</span>
          <input type="range" min="0.1" max="1" step="0.05" value={length} onChange={e => setLength(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{length.toFixed(2)} m</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>磁感应强度 B</span>
          <input type="range" min="0" max="2" step="0.05" value={fieldB} onChange={e => setFieldB(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{fieldB.toFixed(2)} T</span>
        </label>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
        {showRule && (
          <div style={styles.ruleOverlay} onClick={() => setShowRule(false)}>
            <div style={styles.ruleCard} onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 12px', color: '#4A90D9' }}>🤚 左手定则</h3>
              <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                <p><b>伸开左手</b>，使拇指与其余四指垂直，并且都与手掌在同一平面内。</p>
                <p><b>磁感线</b>垂直穿入掌心（N→S）。</p>
                <p><b>四指指向</b>电流方向（正→负）。</p>
                <p><b>拇指指向</b>安培力方向（F）。</p>
                <p style={{ marginTop: 8, color: '#E53935' }}><b>F = BIL</b>（B⊥I时）</p>
              </div>
              <button style={{ ...styles.setBtn, marginTop: 12 }} onClick={() => setShowRule(false)}>关闭</button>
            </div>
          </div>
        )}
      </div>
      <div style={styles.desc}>
        <b>实验：探究安培力影响因素</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          使用控制变量法，分别研究安培力F与电流I、导线长度L、磁感应强度B的关系。F = BIL（B⊥I时）。
        </span>
      </div>
    </div>
  )
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', maxHeight: '100vh', background: '#e8e8e8', color: '#333', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', overflow: 'hidden' },
  topBar: { background: '#f5f5f5', borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', flexShrink: 0 },
  title: { fontSize: 14, fontWeight: 600 }, topActions: { display: 'flex', gap: 6 },
  controlBar: { background: '#fafafa', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', padding: '4px 12px', flexShrink: 0, gap: 12 },
  controlLabel: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#555' },
  controlName: { fontWeight: 600, color: '#4A90D9' }, slider: { width: 110, accentColor: '#4A90D9' },
  sliderVal: { color: '#4A90D9', fontWeight: 600, fontSize: 12, minWidth: 55 },
  setBtn: { background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
  main: { flex: 1, minHeight: 0, background: '#fff', position: 'relative' },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
  ruleOverlay: { position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  ruleCard: { background: '#fff', borderRadius: 12, padding: 24, maxWidth: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' },
}
