import { useState, useRef, useEffect, useCallback } from 'react'

/**
 * MultimeterScene — 练习使用多用电表
 * 三种模式：直流电压、直流电流、电阻测量
 * 含二极管测量演示
 */
export default function MultimeterScene() {
  const [mode, setMode] = useState('voltage') // voltage | current | resistance | diode
  const [probePos, setProbePos] = useState({ red: 'VΩ', black: 'COM' })
  const [range, setRange] = useState('auto')
  const [zeroAdj, setZeroAdj] = useState(50)
  const [testVoltage, setTestVoltage] = useState(12)
  const [testCurrent, setTestCurrent] = useState(1.5)
  const [testResistance, setTestResistance] = useState(220)
  const [diodeForward, setDiodeForward] = useState(true)
  const [connected, setConnected] = useState(true)
  const canvasRef = useRef(null)
  const tick = useRef(0)
  const raf = useRef(null)

  // 计算读数
  const getReading = useCallback(() => {
    if (!connected) return { value: 0, unit: '', display: '---' }
    switch (mode) {
      case 'voltage': {
        const v = testVoltage
        return { value: v, unit: 'V', display: v.toFixed(1) }
      }
      case 'current': {
        const a = testCurrent
        return { value: a, unit: 'A', display: a.toFixed(3) }
      }
      case 'resistance': {
        const r = testResistance * (zeroAdj / 50)
        if (r > 9999) return { value: r, unit: 'Ω', display: (r / 1000).toFixed(1) + 'k' }
        return { value: r, unit: 'Ω', display: r.toFixed(0) }
      }
      case 'diode': {
        if (diodeForward) return { value: 0.6, unit: 'V', display: '0.620' }
        return { value: 0, unit: '', display: 'OL' }
      }
      default: return { value: 0, unit: '', display: '0' }
    }
  }, [mode, testVoltage, testCurrent, testResistance, zeroAdj, diodeForward, connected])

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

      const cx = W * 0.38, cy = H * 0.42
      const meterR = Math.min(W * 0.3, H * 0.38, 180)

      // 表盘背景
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, meterR + 12, 0, Math.PI * 2)
      ctx.fillStyle = '#2c2c2c'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(cx, cy, meterR + 4, 0, Math.PI * 2)
      ctx.fillStyle = '#1a1a1a'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(cx, cy, meterR, 0, Math.PI * 2)
      ctx.fillStyle = '#fafafa'
      ctx.fill()

      // 刻度
      const startAngle = Math.PI * 0.75
      const endAngle = Math.PI * 2.25
      const scaleCount = mode === 'voltage' ? 50 : mode === 'current' ? 30 : mode === 'resistance' ? 50 : 20
      ctx.strokeStyle = '#999'
      ctx.lineWidth = 1
      ctx.fillStyle = '#333'
      ctx.font = `${Math.max(8, meterR * 0.08)}px sans-serif`
      ctx.textAlign = 'center'
      for (let i = 0; i <= scaleCount; i++) {
        const angle = startAngle + (endAngle - startAngle) * (i / scaleCount)
        const inner = meterR * (i % 5 === 0 ? 0.78 : 0.85)
        const outer = meterR * 0.92
        ctx.beginPath()
        ctx.moveTo(cx + inner * Math.cos(angle), cy + inner * Math.sin(angle))
        ctx.lineTo(cx + outer * Math.cos(angle), cy + outer * Math.sin(angle))
        ctx.stroke()
        if (i % 5 === 0) {
          const labelR = meterR * 0.68
          let label = ''
          if (mode === 'voltage') label = (i * 1).toString()
          else if (mode === 'current') label = (i * 0.1).toFixed(1)
          else if (mode === 'resistance') label = mode === 'resistance' ? (i * 20).toString() : i.toString()
          else label = i.toString()
          ctx.fillText(label, cx + labelR * Math.cos(angle), cy + labelR * Math.sin(angle) + 3)
        }
      }

      // 模式标签
      ctx.fillStyle = '#E53935'
      ctx.font = `bold ${meterR * 0.12}px sans-serif`
      const modeLabels = { voltage: 'DC V', current: 'DC A', resistance: 'Ω', diode: 'Diode' }
      ctx.fillText(modeLabels[mode], cx, cy - meterR * 0.3)

      // 指针
      const reading = getReading()
      let normalized = 0
      if (mode === 'voltage') normalized = Math.min(reading.value / 50, 1)
      else if (mode === 'current') normalized = Math.min(reading.value / 3, 1)
      else if (mode === 'resistance') normalized = Math.min(reading.value / 1000, 1)
      else if (mode === 'diode') normalized = diodeForward ? 0.12 : 0
      if (!connected) normalized = 0

      const needleAngle = startAngle + (endAngle - startAngle) * normalized
      ctx.strokeStyle = '#E53935'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + meterR * 0.82 * Math.cos(needleAngle), cy + meterR * 0.82 * Math.sin(needleAngle))
      ctx.stroke()
      // 指针中心
      ctx.beginPath()
      ctx.arc(cx, cy, 5, 0, Math.PI * 2)
      ctx.fillStyle = '#333'
      ctx.fill()

      ctx.restore()

      // LCD 显示区
      const lcdX = cx - 70, lcdY = cy + meterR + 20
      ctx.fillStyle = '#1a3a1a'
      ctx.fillRect(lcdX, lcdY, 140, 40)
      ctx.strokeStyle = '#4a6a4a'
      ctx.lineWidth = 1
      ctx.strokeRect(lcdX, lcdY, 140, 40)
      ctx.fillStyle = '#0f0'
      ctx.font = 'bold 22px monospace'
      ctx.textAlign = 'right'
      ctx.fillText(connected ? reading.display : '---', lcdX + 115, lcdY + 28)
      ctx.font = '12px monospace'
      ctx.textAlign = 'left'
      ctx.fillStyle = '#0a0'
      ctx.fillText(reading.unit, lcdX + 118, lcdY + 28)

      // 旋钮（模式选择）
      const knobX = W * 0.72, knobY = H * 0.35
      const knobR = 50
      ctx.save()
      ctx.beginPath()
      ctx.arc(knobX, knobY, knobR, 0, Math.PI * 2)
      ctx.fillStyle = '#555'
      ctx.fill()
      ctx.strokeStyle = '#333'
      ctx.lineWidth = 3
      ctx.stroke()

      const modes = ['voltage', 'current', 'resistance', 'diode']
      const modeAngles = [Math.PI * 0.5, Math.PI * 1.0, Math.PI * 1.5, Math.PI * 2.0]
      const modeLabelsArr = ['DC V', 'DC A', 'Ω', '⚡']
      modes.forEach((m, i) => {
        const angle = modeAngles[i]
        const labelR = knobR + 18
        ctx.fillStyle = mode === m ? '#4A90D9' : '#999'
        ctx.font = `bold 11px sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText(modeLabelsArr[i], knobX + labelR * Math.cos(angle), knobY + labelR * Math.sin(angle) + 4)
        // 选中指示
        if (mode === m) {
          const dotAngle = angle
          ctx.beginPath()
          ctx.arc(knobX + knobR * 0.6 * Math.cos(dotAngle), knobY + knobR * 0.6 * Math.sin(dotAngle), 4, 0, Math.PI * 2)
          ctx.fillStyle = '#E53935'
          ctx.fill()
        }
      })
      // 旋钮指针
      const currentModeIdx = modes.indexOf(mode)
      const pointerAngle = modeAngles[currentModeIdx]
      ctx.strokeStyle = '#E53935'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(knobX, knobY)
      ctx.lineTo(knobX + knobR * 0.7 * Math.cos(pointerAngle), knobY + knobR * 0.7 * Math.sin(pointerAngle))
      ctx.stroke()
      ctx.restore()

      // 接线端口
      const jackY = H * 0.7
      const jackLabels = ['COM', 'VΩ', 'mA', '10A']
      const jackColors = ['#333', '#E53935', '#4A90D9', '#FF9800']
      jackLabels.forEach((label, i) => {
        const jackX = W * 0.1 + i * 70
        ctx.beginPath()
        ctx.arc(jackX, jackY, 12, 0, Math.PI * 2)
        ctx.fillStyle = jackColors[i]
        ctx.fill()
        ctx.strokeStyle = '#222'
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.fillStyle = '#333'
        ctx.font = '10px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(label, jackX, jackY + 26)
        // 连接指示
        if ((probePos.red === label || probePos.black === label) && connected) {
          ctx.strokeStyle = '#4CAF50'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(jackX, jackY, 15, 0, Math.PI * 2)
          ctx.stroke()
        }
      })

      // 测试电路（右侧）
      const circX = W * 0.65, circY = H * 0.6
      ctx.strokeStyle = '#666'
      ctx.lineWidth = 1.5
      ctx.font = '11px sans-serif'
      ctx.textAlign = 'center'

      if (mode === 'voltage') {
        // 电池
        ctx.fillStyle = '#4CAF50'
        ctx.fillRect(circX, circY, 16, 36)
        ctx.fillStyle = '#fff'
        ctx.fillText('+', circX + 8, circY - 4)
        ctx.strokeStyle = '#666'
        ctx.beginPath()
        ctx.moveTo(circX + 8, circY)
        ctx.lineTo(circX + 8, circY - 20)
        ctx.lineTo(circX + 80, circY - 20)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(circX + 24, circY + 18)
        ctx.lineTo(circX + 80, circY + 18)
        ctx.lineTo(circX + 80, circY - 20)
        ctx.stroke()
        // 探针
        ctx.strokeStyle = connected ? '#E53935' : '#999'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(circX + 80, circY - 20)
        ctx.lineTo(circX + 100, circY - 20)
        ctx.stroke()
        ctx.strokeStyle = connected ? '#333' : '#999'
        ctx.beginPath()
        ctx.moveTo(circX + 80, circY + 18)
        ctx.lineTo(circX + 100, circY + 18)
        ctx.stroke()
        ctx.fillStyle = '#333'
        ctx.fillText(`${testVoltage}V`, circX + 40, circY + 48)
      } else if (mode === 'current') {
        // 电阻 + 电池串联
        ctx.strokeStyle = '#FF9800'
        ctx.lineWidth = 2
        ctx.strokeRect(circX, circY - 5, 40, 16)
        ctx.fillStyle = '#333'
        ctx.fillText('R', circX + 20, circY + 8)
        ctx.strokeStyle = '#666'
        ctx.beginPath()
        ctx.moveTo(circX + 40, circY + 3)
        ctx.lineTo(circX + 80, circY + 3)
        ctx.stroke()
        ctx.fillStyle = '#4CAF50'
        ctx.fillRect(circX + 80, circY - 14, 16, 36)
        ctx.fillStyle = '#fff'
        ctx.font = '10px sans-serif'
        ctx.fillText('+', circX + 88, circY - 18)
        ctx.strokeStyle = '#666'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(circX, circY + 3)
        ctx.lineTo(circX - 20, circY + 3)
        ctx.lineTo(circX - 20, circY + 30)
        ctx.lineTo(circX + 96, circY + 30)
        ctx.lineTo(circX + 96, circY + 22)
        ctx.stroke()
        ctx.fillStyle = '#333'
        ctx.font = '11px sans-serif'
        ctx.fillText(`${testCurrent}A`, circX + 40, circY + 48)
      } else if (mode === 'resistance') {
        // 电阻
        ctx.strokeStyle = '#FF9800'
        ctx.lineWidth = 2
        ctx.strokeRect(circX + 10, circY - 5, 60, 16)
        ctx.fillStyle = '#333'
        ctx.font = '11px sans-serif'
        ctx.fillText(`${testResistance}Ω`, circX + 40, circY + 8)
        ctx.strokeStyle = connected ? '#E53935' : '#999'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(circX - 10, circY + 3)
        ctx.lineTo(circX + 10, circY + 3)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(circX + 70, circY + 3)
        ctx.lineTo(circX + 90, circY + 3)
        ctx.stroke()
        // 探针
        ctx.strokeStyle = connected ? '#E53935' : '#999'
        ctx.beginPath()
        ctx.moveTo(circX - 10, circY + 3)
        ctx.lineTo(circX - 20, circY + 3)
        ctx.stroke()
        ctx.strokeStyle = connected ? '#333' : '#999'
        ctx.beginPath()
        ctx.moveTo(circX + 90, circY + 3)
        ctx.lineTo(circX + 100, circY + 3)
        ctx.stroke()
      } else {
        // 二极管
        ctx.strokeStyle = '#666'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(circX, circY)
        ctx.lineTo(circX + 30, circY)
        ctx.stroke()
        // 三角形
        ctx.beginPath()
        ctx.moveTo(circX + 30, circY - 12)
        ctx.lineTo(circX + 30, circY + 12)
        ctx.lineTo(circX + 50, circY)
        ctx.closePath()
        ctx.fillStyle = diodeForward ? '#4A90D9' : '#ccc'
        ctx.fill()
        ctx.stroke()
        // 竖线
        ctx.beginPath()
        ctx.moveTo(circX + 50, circY - 12)
        ctx.lineTo(circX + 50, circY + 12)
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(circX + 50, circY)
        ctx.lineTo(circX + 80, circY)
        ctx.stroke()
        ctx.fillStyle = '#333'
        ctx.font = '10px sans-serif'
        ctx.fillText(diodeForward ? '正向' : '反向', circX + 40, circY + 28)
      }

      // 连接/断开按钮
      ctx.fillStyle = connected ? '#4CAF50' : '#E53935'
      ctx.fillRect(W * 0.82, H * 0.65, 70, 28)
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(connected ? '已连接' : '断开', W * 0.82 + 35, H * 0.65 + 18)

      // 知识区
      const infoY = H - 85
      ctx.fillStyle = '#f5f5f5'
      ctx.fillRect(0, infoY, W, 85)
      ctx.strokeStyle = '#ccc'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, infoY)
      ctx.lineTo(W, infoY)
      ctx.stroke()

      ctx.fillStyle = '#333'
      ctx.font = 'bold 13px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('📖 读数方法', 16, infoY + 20)
      ctx.font = '11px sans-serif'
      ctx.fillStyle = '#555'

      const tips = {
        voltage: ['1. 选择DC V档位，红表笔接VΩ孔，黑表笔接COM孔', '2. 并联在被测元件两端', '3. 读数 = 指针指示值 × 倍率'],
        current: ['1. 选择DC A档位，红表笔接mA/10A孔', '2. 串联在电路中', '3. 注意量程，大电流用10A档'],
        resistance: ['1. 选择Ω档，先调零（短接表笔调零旋钮）', '2. 被测电阻需断电测量', '3. 读数 = 指针指示 × 倍率，表盘不均匀'],
        diode: ['1. 选择二极管档，红表笔接VΩ', '2. 正向：红接阳极，黑接阴极，显示压降', '3. 反向：显示OL（超量程）'],
      }
      tips[mode]?.forEach((tip, i) => {
        ctx.fillText(tip, 16, infoY + 38 + i * 15)
      })

      raf.current = requestAnimationFrame(draw)
    }
    raf.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf.current)
  }, [mode, getReading, probePos, connected, testVoltage, testCurrent, testResistance, zeroAdj, diodeForward])

  const handleClick = useCallback((e) => {
    const cvs = canvasRef.current
    if (!cvs) return
    const rect = cvs.getBoundingClientRect()
    const x = e.clientX - rect.left, y = e.clientY - rect.top
    const W = cvs.clientWidth, H = cvs.clientHeight

    // 连接/断开按钮
    if (x > W * 0.82 && x < W * 0.82 + 70 && y > H * 0.65 && y < H * 0.65 + 28) {
      setConnected(c => !c)
      return
    }

    // 旋钮点击
    const knobX = W * 0.72, knobY = H * 0.35
    const dist = Math.hypot(x - knobX, y - knobY)
    if (dist < 70) {
      const angle = Math.atan2(y - knobY, x - knobX)
      const modes = ['voltage', 'current', 'resistance', 'diode']
      const modeAngles = [Math.PI * 0.5, Math.PI * 1.0, Math.PI * 1.5, Math.PI * 2.0]
      let closest = 0, minDiff = Infinity
      modes.forEach((m, i) => {
        let diff = Math.abs(angle - modeAngles[i])
        if (diff > Math.PI) diff = Math.PI * 2 - diff
        if (diff < minDiff) { minDiff = diff; closest = i }
      })
      setMode(modes[closest])
    }
  }, [])

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>练习使用多用电表</span>
        <div style={styles.topActions}>
          {['voltage', 'current', 'resistance', 'diode'].map(m => (
            <button
              key={m}
              style={{ ...styles.setBtn, background: mode === m ? '#4A90D9' : '#7B1FA2' }}
              onClick={() => setMode(m)}
            >
              {{ voltage: '直流电压', current: '直流电流', resistance: '电阻', diode: '二极管' }[m]}
            </button>
          ))}
          <button style={{ ...styles.setBtn, background: connected ? '#4CAF50' : '#E53935' }} onClick={() => setConnected(c => !c)}>
            {connected ? '断开探针' : '连接探针'}
          </button>
        </div>
      </div>
      <div style={styles.controlBar}>
        {mode === 'voltage' && (
          <label style={styles.controlLabel}>
            <span style={styles.controlName}>电池电压</span>
            <input type="range" min="0" max="50" step="0.5" value={testVoltage} onChange={e => setTestVoltage(+e.target.value)} style={styles.slider} />
            <span style={styles.sliderVal}>{testVoltage} V</span>
          </label>
        )}
        {mode === 'current' && (
          <label style={styles.controlLabel}>
            <span style={styles.controlName}>电路电流</span>
            <input type="range" min="0" max="3" step="0.05" value={testCurrent} onChange={e => setTestCurrent(+e.target.value)} style={styles.slider} />
            <span style={styles.sliderVal}>{testCurrent.toFixed(2)} A</span>
          </label>
        )}
        {mode === 'resistance' && (
          <>
            <label style={styles.controlLabel}>
              <span style={styles.controlName}>待测电阻</span>
              <input type="range" min="10" max="1000" step="10" value={testResistance} onChange={e => setTestResistance(+e.target.value)} style={styles.slider} />
              <span style={styles.sliderVal}>{testResistance} Ω</span>
            </label>
            <label style={styles.controlLabel}>
              <span style={styles.controlName}>调零旋钮</span>
              <input type="range" min="20" max="80" step="1" value={zeroAdj} onChange={e => setZeroAdj(+e.target.value)} style={styles.slider} />
              <span style={styles.sliderVal}>{zeroAdj}%</span>
            </label>
          </>
        )}
        {mode === 'diode' && (
          <label style={styles.controlLabel}>
            <span style={styles.controlName}>二极管方向</span>
            <button style={{ ...styles.setBtn, background: diodeForward ? '#4A90D9' : '#E53935' }} onClick={() => setDiodeForward(f => !f)}>
              {diodeForward ? '正向偏置' : '反向偏置'}
            </button>
          </label>
        )}
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} onClick={handleClick} />
      </div>
      <div style={styles.desc}>
        <b>实验：练习使用多用电表</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          选择不同档位测量电压、电流、电阻和二极管。注意红黑表笔的正确接法和量程选择。
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
  main: { flex: 1, minHeight: 0, background: '#fff' },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
}
