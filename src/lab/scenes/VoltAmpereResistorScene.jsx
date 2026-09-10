import { useState, useRef, useEffect, useCallback } from 'react'

/**
 * VoltAmpereResistorScene — 伏安法测定值电阻
 *
 * Tab1: 演示 — 滑动变阻器改变U和I，多次测量求平均值
 * Tab2: 自己动手搭电路
 */
export default function VoltAmpereResistorScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    switchClosed: false,
    R_true: 15,        // 真实电阻值
    sliderR: 10,       // 滑动变阻器接入电阻
    U_source: 6,       // 电源电压
    time: 0,
    data: [],          // [{U, I, R_calc}]
    // Tab2
    components: [],
    wires: [],
    dragId: null,
    dragOffX: 0, dragOffY: 0,
    connecting: null,
    hoverTerm: null,
    nextId: 1,
    wireColor: '#F44336',
  })

  const [tab, setTab] = useState(1)
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const R = { canvas, ctx: canvas.getContext('2d'), W: 0, H: 0,
      resize() {
        const rect = canvas.getBoundingClientRect()
        canvas.width = rect.width * devicePixelRatio
        canvas.height = rect.height * devicePixelRatio
        this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
        this.W = rect.width; this.H = rect.height
      },
    }
    R.resize(); canvasRef.current._R = R
    const loop = () => { S.current.time += 1 / 60; render(R); animRef.current = requestAnimationFrame(loop) }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function render(R) {
    const ctx = R.ctx, W = R.W, H = R.H
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#f0f4f8'; ctx.fillRect(0, 0, W, H)
    canvasRef.current._clickAreas = []
    canvasRef.current._palAreas = []
    if (S.current.tab === 1) renderDemo(ctx, W, H)
    else renderBuilder(ctx, W, H)
  }

  // ================================================================
  //  Tab 1：伏安法演示
  // ================================================================
  function renderDemo(ctx, W, H) {
    const s = S.current
    const on = s.switchClosed

    // 计算
    let I = 0, U_R = 0
    if (on) {
      const Rtotal = s.R_true + s.sliderR
      I = s.U_source / Rtotal
      U_R = I * s.R_true
    }

    // 标题
    ctx.fillStyle = '#333'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('伏安法测定值电阻 — 多次测量求平均值', W / 2, 12)

    // 电路图
    const left = W * 0.06, right = W * 0.48
    const top = 65, bottom = H - 140
    drawCircuit(ctx, left, right, top, bottom, on, s, I, U_R)

    // 右侧：数据表格+分析
    drawRightPanel(ctx, W, H, s, on, I, U_R)
  }

  function drawCircuit(ctx, left, right, top, bottom, on, s, I, U_R) {
    const battX = left + (right - left) * 0.1
    const swX = left + (right - left) * 0.22
    const sliderX = left + (right - left) * 0.42
    const resistorX = left + (right - left) * 0.65
    const wc = on ? '#1565C0' : '#999'

    // 导线
    drawLine(ctx, left, top, right, top, wc, 2.5)
    drawLine(ctx, right, top, right, bottom, wc, 2.5)
    drawLine(ctx, left, bottom, battX - 12, bottom, wc, 2.5)
    drawLine(ctx, battX + 12, bottom, swX - 18, bottom, wc, 2.5)
    drawLine(ctx, swX + 18, bottom, sliderX - 24, bottom, wc, 2.5)
    drawLine(ctx, sliderX + 24, bottom, resistorX - 16, bottom, wc, 2.5)
    drawLine(ctx, resistorX + 16, bottom, right, bottom, wc, 2.5)
    drawLine(ctx, left, top, left, bottom, wc, 2.5)

    if (on) {
      drawCurrentFlow(ctx, [
        { x: battX + 12, y: bottom }, { x: swX, y: bottom }, { x: sliderX, y: bottom },
        { x: resistorX, y: bottom }, { x: right, y: bottom }, { x: right, y: top },
        { x: left, y: top }, { x: left, y: bottom }, { x: battX - 12, y: bottom },
      ], s.time, 0.5)
    }

    drawStdBattery(ctx, battX, bottom)
    drawStdSwitch(ctx, swX, bottom, on, () => { S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1) })
    drawSlidingRheostat(ctx, sliderX, bottom, s.sliderR, 50)
    drawStdResistor(ctx, resistorX, bottom, 'R=?')

    // Ⓐ A表
    drawMeterInCircuit(ctx, (swX + sliderX) / 2, bottom - 28, 'A', on ? `${I.toFixed(3)}A` : '', '#E53935')
    // Ⓥ V表（并联在待测电阻两端）
    const volY = bottom + 35
    drawLine(ctx, resistorX - 16, bottom, resistorX - 16, volY, wc, 2)
    drawLine(ctx, resistorX + 16, bottom, resistorX + 16, volY, wc, 2)
    drawLine(ctx, resistorX - 16, volY, resistorX - 20, volY, wc, 2)
    drawLine(ctx, resistorX + 20, volY, resistorX + 16, volY, wc, 2)
    drawMeterInCircuit(ctx, resistorX, volY, 'V', on ? `${U_R.toFixed(2)}V` : '', '#4CAF50')

    // 标注
    ctx.fillStyle = '#555'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('待测电阻', resistorX, top - 18)
    ctx.fillText(`滑动变阻器=${s.sliderR}Ω`, sliderX, bottom + 18)

    // 提示
    ctx.fillStyle = '#888'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('① 闭合开关', left, bottom + 60)
    ctx.fillText('② 调节滑动变阻器改变U和I', left, bottom + 75)
    ctx.fillText('③ 每次调节后点"记录"', left, bottom + 90)
    ctx.fillText('④ 至少记录3组数据', left, bottom + 105)
  }

  function drawRightPanel(ctx, W, H, s, on, I, U_R) {
    const px = W * 0.52, py = 50, pw = W * 0.46, ph = H - 160
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    let ky = py + 12
    ctx.fillText('📖 伏安法测电阻原理', px + 14, ky); ky += 24
    ctx.font = '12px sans-serif'; ctx.fillStyle = '#555'
    ctx.fillText('R = U / I（欧姆定律）', px + 14, ky); ky += 18
    ctx.fillText('多次测量求平均值，减小误差', px + 14, ky); ky += 24

    // 当前读数
    if (on) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'
      ctx.fillText('📊 当前读数', px + 14, ky); ky += 18
      ctx.font = '12px monospace'; ctx.fillStyle = '#555'
      ctx.fillText(`U = ${U_R.toFixed(3)} V`, px + 14, ky); ky += 16
      ctx.fillText(`I = ${I.toFixed(4)} A`, px + 14, ky); ky += 16
      const R_now = I > 0 ? U_R / I : 0
      ctx.fillStyle = '#4A90D9'; ctx.font = 'bold 12px monospace'
      ctx.fillText(`R = U/I = ${R_now.toFixed(1)} Ω`, px + 14, ky); ky += 24
    }

    // 数据表格
    if (s.data.length > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'
      ctx.fillText('📝 实验数据', px + 14, ky); ky += 18
      ctx.font = '10px monospace'; ctx.fillStyle = '#555'
      ctx.fillText('序号   U(V)    I(A)     R(Ω)', px + 14, ky); ky += 14
      for (let i = 0; i < s.data.length; i++) {
        const d = s.data[i]
        ctx.fillText(`${String(i+1).padStart(3)}   ${d.U.toFixed(3).padStart(6)}  ${d.I.toFixed(4).padStart(7)}  ${d.R.toFixed(1).padStart(6)}`, px + 14, ky)
        ky += 13
      }
      ky += 10

      // 平均值
      const avgR = s.data.reduce((sum, d) => sum + d.R, 0) / s.data.length
      const avgU = s.data.reduce((sum, d) => sum + d.U, 0) / s.data.length
      const avgI = s.data.reduce((sum, d) => sum + d.I, 0) / s.data.length
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 12px sans-serif'
      ctx.fillText('── 测量结果 ──', px + 14, ky); ky += 18
      ctx.font = '12px monospace'
      ctx.fillText(`R̄ = (${s.data.map(d => d.R.toFixed(1)).join('+')})/${s.data.length}`, px + 14, ky); ky += 16
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 14px monospace'
      ctx.fillText(`R̄ = ${avgR.toFixed(1)} Ω`, px + 14, ky); ky += 20

      // 与真实值对比
      const err = Math.abs(avgR - s.R_true) / s.R_true * 100
      ctx.font = '11px sans-serif'; ctx.fillStyle = '#555'
      ctx.fillText(`U̅ = ${avgU.toFixed(3)} V  Ī = ${avgI.toFixed(4)} A`, px + 14, ky); ky += 16
      ctx.fillStyle = err < 5 ? '#4CAF50' : '#FF9800'
      ctx.fillText(`相对误差 = ${err.toFixed(1)}%`, px + 14, ky)
    } else {
      ctx.fillStyle = '#888'; ctx.font = '11px sans-serif'
      ctx.fillText('闭合开关 → 调节滑动变阻器 → 点"记录"', px + 14, ky); ky += 18
      ctx.fillText('至少记录3组不同U、I的数据', px + 14, ky)
    }
    ctx.textBaseline = 'alphabetic'
  }

  // ================================================================
  //  标准电路符号（复用）
  // ================================================================
  function drawStdBattery(ctx, x, y) {
    ctx.strokeStyle = '#333'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(x - 12, y - 18); ctx.lineTo(x - 12, y + 18); ctx.stroke()
    ctx.lineWidth = 5
    ctx.beginPath(); ctx.moveTo(x + 12, y - 9); ctx.lineTo(x + 12, y + 9); ctx.stroke()
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText('+', x - 12, y - 20)
    ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'
    ctx.fillText('−', x + 12, y - 11)
    ctx.textBaseline = 'alphabetic'
  }

  function drawStdSwitch(ctx, x, y, on, onClick) {
    ctx.fillStyle = '#666'
    ctx.beginPath(); ctx.arc(x - 18, y, 4, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(x + 18, y, 4, 0, Math.PI * 2); ctx.fill()
    if (on) {
      ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 3; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(x - 18, y); ctx.lineTo(x + 18, y); ctx.stroke(); ctx.lineCap = 'butt'
    } else {
      ctx.strokeStyle = '#F44336'; ctx.lineWidth = 3; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(x - 18, y); ctx.lineTo(x + 10, y - 20); ctx.stroke(); ctx.lineCap = 'butt'
    }
    ctx.fillStyle = on ? '#4CAF50' : '#F44336'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(on ? 'ON' : 'OFF', x, y + 8); ctx.textBaseline = 'alphabetic'
    canvasRef.current._clickAreas.push({ x: x - 25, y: y - 25, w: 50, h: 50, onClick })
  }

  function drawStdResistor(ctx, x, y, label) {
    ctx.fillStyle = '#EFEBE9'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(x - 16, y - 10, 32, 20, 3); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(label, x, y)
    ctx.textBaseline = 'alphabetic'
  }

  function drawSlidingRheostat(ctx, x, y, R, maxR) {
    ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(x - 24, y - 10, 48, 20, 3); ctx.fill(); ctx.stroke()
    const ratio = R / maxR
    const sliderX = x - 24 + ratio * 48
    ctx.fillStyle = '#546E7A'; ctx.strokeStyle = '#37474F'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(sliderX, y - 16); ctx.lineTo(sliderX - 6, y - 10); ctx.lineTo(sliderX + 6, y - 10); ctx.closePath(); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(`${R}Ω`, x, y + 12)
    ctx.textBaseline = 'alphabetic'
  }

  function drawMeterInCircuit(ctx, x, y, type, reading, color) {
    const r = 18
    ctx.fillStyle = '#fff'; ctx.strokeStyle = color; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = color; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(type === 'A' ? 'Ⓐ' : 'Ⓥ', x, y - 2)
    if (reading) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px monospace'
      ctx.fillText(reading, x, y + 12)
    }
    ctx.textBaseline = 'alphabetic'
  }

  function drawLine(ctx, x1, y1, x2, y2, color, w) {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
  }

  function drawCurrentFlow(ctx, points, time, speed) {
    let totalLen = 0; const segs = []
    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1].x - points[i].x, dy = points[i + 1].y - points[i].y
      const len = Math.sqrt(dx * dx + dy * dy)
      segs.push({ ...points[i], ex: points[i + 1].x, ey: points[i + 1].y, len }); totalLen += len
    }
    ctx.fillStyle = '#FFEB3B'
    const n = Math.max(5, Math.floor(totalLen / 45))
    for (let d = 0; d < n; d++) {
      let pos = ((time * speed * 100 + d * (totalLen / n)) % totalLen)
      for (const seg of segs) {
        if (pos <= seg.len) {
          const r = pos / seg.len
          ctx.beginPath(); ctx.arc(seg.x + (seg.ex - seg.x) * r, seg.y + (seg.ey - seg.y) * r, 3, 0, Math.PI * 2); ctx.fill()
          break
        }
        pos -= seg.len
      }
    }
  }

  // ================================================================
  //  Tab 2：自己动手
  // ================================================================
  function renderBuilder(ctx, W, H) {
    const s = S.current
    const palW = 170
    const cvX = 10, cvY = 60, cvW = W - palW - 30, cvH = H - 120

    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(cvX, cvY, cvW, cvH, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(cvX, cvY, cvW, cvH, 8); ctx.stroke()
    ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 0.5
    for (let gx = cvX + 25; gx < cvX + cvW; gx += 25) { ctx.beginPath(); ctx.moveTo(gx, cvY); ctx.lineTo(gx, cvY + cvH); ctx.stroke() }
    for (let gy = cvY + 25; gy < cvY + cvH; gy += 25) { ctx.beginPath(); ctx.moveTo(cvX, gy); ctx.lineTo(cvX + cvW, gy); ctx.stroke() }

    for (const wire of s.wires) drawBuilderWire(ctx, wire)
    if (s.connecting) {
      const fc = s.components.find(c => c.id === s.connecting.compId)
      if (fc) {
        const ft = getTermPos(fc, s.connecting.termIdx)
        ctx.strokeStyle = s.wireColor; ctx.lineWidth = 2; ctx.setLineDash([5, 5])
        ctx.beginPath(); ctx.moveTo(ft.x, ft.y); ctx.lineTo(s.connecting.mx, s.connecting.my); ctx.stroke()
        ctx.setLineDash([])
      }
    }
    const circuit = checkCircuit()
    for (const comp of s.components) drawBuilderComp(ctx, comp, s, circuit)
    ctx.fillStyle = circuit.closed ? '#4CAF50' : '#F44336'
    ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText(circuit.closed ? '✅ ' + circuit.reason : '❌ ' + circuit.reason, cvX + 12, cvY + cvH - 25)

    const palX = W - palW - 10
    ctx.fillStyle = '#f8f9fa'; ctx.beginPath(); ctx.roundRect(palX, cvY, palW, cvH, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(palX, cvY, palW, cvH, 8); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('🧰 电学器材', palX + 10, cvY + 10)

    const items = [
      { type: 'battery', name: '电源' }, { type: 'switch', name: '开关' },
      { type: 'resistor', name: '待测电阻' }, { type: 'rheostat', name: '滑动变阻器' },
      { type: 'ammeter', name: '电流表Ⓐ' }, { type: 'voltmeter', name: '电压表Ⓥ' },
    ]
    let iy = cvY + 35
    for (const item of items) {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(palX + 6, iy, palW - 12, 44, 6); ctx.fill()
      ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(palX + 6, iy, palW - 12, 44, 6); ctx.stroke()
      drawRealisticIcon(ctx, palX + 30, iy + 22, item.type)
      ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText(item.name, palX + 52, iy + 22); ctx.textBaseline = 'alphabetic'
      canvasRef.current._palAreas.push({ x: palX + 6, y: iy, w: palW - 12, h: 44, type: item.type })
      iy += 50
    }

    iy += 10
    ctx.fillStyle = '#333'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('导线颜色：', palX + 10, iy); iy += 20
    for (const wc of [{ color: '#F44336', name: '红线' }, { color: '#FFC107', name: '黄线' }, { color: '#4CAF50', name: '绿线' }]) {
      const active = s.wireColor === wc.color
      ctx.fillStyle = active ? '#e3f2fd' : '#fff'
      ctx.beginPath(); ctx.roundRect(palX + 6, iy, palW - 12, 26, 4); ctx.fill()
      if (active) { ctx.strokeStyle = wc.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(palX + 6, iy, palW - 12, 26, 4); ctx.stroke() }
      ctx.fillStyle = wc.color; ctx.fillRect(palX + 14, iy + 8, 30, 10)
      ctx.fillStyle = '#333'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText(wc.name, palX + 52, iy + 13); ctx.textBaseline = 'alphabetic'
      canvasRef.current._palAreas.push({ x: palX + 6, y: iy, w: palW - 12, h: 26, action: 'color', color: wc.color })
      iy += 30
    }
    ctx.textBaseline = 'alphabetic'
  }

  function drawRealisticIcon(ctx, x, y, type) {
    ctx.save(); ctx.translate(x, y)
    if (type === 'battery') {
      ctx.fillStyle = '#81C784'; ctx.strokeStyle = '#388E3C'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.roundRect(-14, -10, 28, 20, 3); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('+ −', 0, 0)
    } else if (type === 'switch') {
      ctx.fillStyle = '#ECEFF1'; ctx.strokeStyle = '#90A4AE'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.roundRect(-14, -6, 28, 12, 3); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#666'; ctx.beginPath(); ctx.arc(-8, 0, 2.5, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(8, 0, 2.5, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 2; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(5, -6); ctx.stroke(); ctx.lineCap = 'butt'
    } else if (type === 'resistor') {
      ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.roundRect(-14, -6, 28, 12, 2); ctx.fill(); ctx.stroke()
      const bands = ['#B71C1C', '#4CAF50', '#FF9800', '#FFD54F']
      bands.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(-10 + i * 7, -6, 4, 12) })
    } else if (type === 'ammeter') {
      ctx.fillStyle = '#FFEBEE'; ctx.strokeStyle = '#E53935'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('A', 0, 0)
    } else if (type === 'voltmeter') {
      ctx.fillStyle = '#E8F5E9'; ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#4CAF50'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('V', 0, 0)
    } else if (type === 'rheostat') {
      ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.roundRect(-14, -6, 28, 12, 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#546E7A'; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(-4, -6); ctx.lineTo(4, -6); ctx.closePath(); ctx.fill()
    }
    ctx.restore()
  }

  function drawBuilderComp(ctx, comp, s, circuit) {
    const { x, y, type } = comp
    const isClosed = circuit && circuit.closed
    ctx.save(); ctx.translate(x, y)
    if (s.dragId === comp.id) ctx.globalAlpha = 0.6

    if (type === 'battery') {
      const grd = ctx.createLinearGradient(-35, -22, 35, 22)
      grd.addColorStop(0, '#A5D6A7'); grd.addColorStop(0.5, '#66BB6A'); grd.addColorStop(1, '#43A047')
      ctx.fillStyle = grd; ctx.strokeStyle = '#2E7D32'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.roundRect(-35, -22, 70, 44, 6); ctx.fill(); ctx.stroke()
      ctx.strokeStyle = '#1B5E20'; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(-14, -16); ctx.lineTo(-14, 16); ctx.stroke()
      ctx.lineWidth = 5
      ctx.beginPath(); ctx.moveTo(14, -8); ctx.lineTo(14, 8); ctx.stroke()
    } else if (type === 'switch') {
      const sw = comp.closed !== false
      ctx.fillStyle = '#ECEFF1'; ctx.strokeStyle = '#78909C'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.roundRect(-36, -16, 72, 32, 6); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#546E7A'; ctx.beginPath(); ctx.arc(-24, 0, 5, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(24, 0, 5, 0, Math.PI * 2); ctx.fill()
      if (sw) {
        ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(24, 0); ctx.stroke(); ctx.lineCap = 'butt'
      } else {
        ctx.strokeStyle = '#F44336'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(16, -18); ctx.stroke(); ctx.lineCap = 'butt'
      }
    } else if (type === 'resistor') {
      ctx.fillStyle = '#EFEBE9'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.roundRect(-34, -14, 68, 28, 4); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#333'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText('R=?', 0, 16)
    } else if (type === 'ammeter') {
      ctx.fillStyle = '#FFEBEE'; ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('Ⓐ', 0, 0)
    } else if (type === 'voltmeter') {
      ctx.fillStyle = '#E8F5E9'; ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#4CAF50'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('Ⓥ', 0, 0)
    } else if (type === 'rheostat') {
      ctx.fillStyle = '#EFEBE9'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.roundRect(-34, -14, 68, 28, 4); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#546E7A'; ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(-5, -14); ctx.lineTo(5, -14); ctx.closePath(); ctx.fill()
    }

    ctx.globalAlpha = 1; ctx.restore()

    const terms = getTerminals(comp)
    for (let i = 0; i < terms.length; i++) {
      const t = terms[i]
      const hov = s.hoverTerm && s.hoverTerm.compId === comp.id && s.hoverTerm.termIdx === i
      ctx.fillStyle = hov ? '#FF9800' : '#fff'
      ctx.strokeStyle = hov ? '#E65100' : '#666'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(t.x, t.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    }
  }

  function drawBuilderWire(ctx, wire) {
    const fc = S.current.components.find(c => c.id === wire.from.compId)
    const tc = S.current.components.find(c => c.id === wire.to.compId)
    if (!fc || !tc) return
    const f = getTermPos(fc, wire.from.termIdx), t = getTermPos(tc, wire.to.termIdx)
    const ddx = t.x - f.x, ddy = t.y - f.y
    const color = wire.color || '#1565C0'
    const m1x = wire.mid1X != null ? wire.mid1X : f.x + ddx * 0.33
    const m1y = wire.mid1Y != null ? wire.mid1Y : f.y + ddy * 0.33
    const m2x = wire.mid2X != null ? wire.mid2X : f.x + ddx * 0.67
    const m2y = wire.mid2Y != null ? wire.mid2Y : f.y + ddy * 0.67
    ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.beginPath(); ctx.moveTo(f.x, f.y)
    ctx.lineTo(m1x, m1y); ctx.lineTo(m2x, m2y); ctx.lineTo(t.x, t.y); ctx.stroke()
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(m1x, m1y, 5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(m1x, m1y, 2.5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(m2x, m2y, 5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(m2x, m2y, 2.5, 0, Math.PI * 2); ctx.fill()
  }

  function checkCircuit() {
    const s = S.current
    const batteries = s.components.filter(c => c.type === 'battery')
    if (batteries.length === 0) return { closed: false, reason: '需要电源' }
    const hasLoad = s.components.some(c => c.type === 'resistor' || c.type === 'rheostat')
    if (!hasLoad) return { closed: false, reason: '需要电阻' }
    const adj = {}
    for (const comp of s.components) adj[comp.id] = new Set()
    for (const wire of s.wires) {
      adj[wire.from.compId]?.add(wire.to.compId)
      adj[wire.to.compId]?.add(wire.from.compId)
    }
    const allConnected = s.components.every(c => adj[c.id]?.size >= 2)
    if (!allConnected) return { closed: false, reason: '电路未闭合' }
    const battery = batteries[0]
    const visited = new Set()
    let hasLoop = false
    function dfs(node, depth) {
      if (depth > 0 && node === battery.id) { hasLoop = true; return }
      if (visited.has(node) || depth > s.components.length) return
      visited.add(node)
      for (const next of adj[node] || []) dfs(next, depth + 1)
    }
    dfs(battery.id, 0)
    if (!hasLoop) return { closed: false, reason: '电路未形成闭合回路' }
    for (const sw of s.components.filter(c => c.type === 'switch')) { if (sw.closed === false) return { closed: false, reason: '开关断开' } }
    return { closed: true, reason: '电路正常' }
  }

  function getTerminals(comp) {
    return [{ x: comp.x - 40, y: comp.y }, { x: comp.x + 40, y: comp.y }]
  }
  function getTermPos(comp, idx) { return getTerminals(comp)[idx] }
  function findTerm(mx, my) {
    for (const comp of S.current.components) {
      const terms = getTerminals(comp)
      for (let i = 0; i < terms.length; i++) {
        if ((mx - terms[i].x) ** 2 + (my - terms[i].y) ** 2 < 144) return { compId: comp.id, termIdx: i }
      }
    }
    return null
  }
  function findComp(mx, my) {
    for (let i = S.current.components.length - 1; i >= 0; i--) {
      const c = S.current.components[i]
      if (Math.abs(mx - c.x) < 45 && Math.abs(my - c.y) < 35) return c
    }
    return null
  }

  const getPos = (e) => { const r = canvasRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    const s = S.current; const { x, y } = getPos(e)
    if (s.tab === 1) {
      for (const a of canvasRef.current._clickAreas) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(); return } }
      return
    }
    for (const a of canvasRef.current._palAreas) {
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) {
        if (a.action === 'color') { s.wireColor = a.color; forceUpdate(n => n + 1); return }
        if (a.type) {
          const id = s.nextId++
          s.components.push({ id, type: a.type, x, y, rotation: 0, closed: true })
          s.dragId = id; s.dragOffX = 0; s.dragOffY = 0; forceUpdate(n => n + 1); return
        }
      }
    }
    const term = findTerm(x, y)
    if (term) { s.connecting = { ...term, mx: x, my: y }; forceUpdate(n => n + 1); return }
    const comp = findComp(x, y)
    if (comp) { s.dragId = comp.id; s.dragOffX = x - comp.x; s.dragOffY = y - comp.y; forceUpdate(n => n + 1) }
  }, [])

  const handleMouseMove = useCallback((e) => {
    const s = S.current; const { x, y } = getPos(e)
    if (s.tab !== 2) return
    if (s.dragId) {
      const c = s.components.find(c => c.id === s.dragId)
      if (c) { c.x = x - s.dragOffX; c.y = y - s.dragOffY; forceUpdate(n => n + 1) }
      return
    }
    if (s.connecting) {
      s.connecting.mx = x; s.connecting.my = y
      const t = findTerm(x, y); s.hoverTerm = t && t.compId !== s.connecting.compId ? t : null
      forceUpdate(n => n + 1); return
    }
    s.hoverTerm = findTerm(x, y)
    canvasRef.current.style.cursor = s.hoverTerm ? 'crosshair' : findComp(x, y) ? 'grab' : 'default'
  }, [])

  const handleMouseUp = useCallback(() => {
    const s = S.current
    if (s.dragId) { s.dragId = null; forceUpdate(n => n + 1); return }
    if (s.connecting) {
      const t = s.hoverTerm
      if (t && t.compId !== s.connecting.compId) {
        const dup = s.wires.some(w =>
          (w.from.compId === s.connecting.compId && w.from.termIdx === s.connecting.termIdx && w.to.compId === t.compId && w.to.termIdx === t.termIdx) ||
          (w.to.compId === s.connecting.compId && w.to.termIdx === s.connecting.termIdx && w.from.compId === t.compId && w.from.termIdx === t.termIdx))
        if (!dup) s.wires.push({ id: s.nextId++, from: { compId: s.connecting.compId, termIdx: s.connecting.termIdx }, to: t, color: s.wireColor, mid1X: null, mid1Y: null, mid2X: null, mid2Y: null })
      }
      s.connecting = null; s.hoverTerm = null; forceUpdate(n => n + 1)
    }
  }, [])

  const handleContextMenu = useCallback((e) => {
    if (S.current.tab !== 2) return; e.preventDefault()
    const { x, y } = getPos(e)
    const comp = findComp(x, y)
    if (comp) {
      S.current.components = S.current.components.filter(c => c.id !== comp.id)
      S.current.wires = S.current.wires.filter(w => w.from.compId !== comp.id && w.to.compId !== comp.id)
    }
    forceUpdate(n => n + 1)
  }, [])

  const handleDoubleClick = useCallback((e) => {
    if (S.current.tab !== 2) return
    const { x, y } = getPos(e)
    const comp = findComp(x, y)
    if (comp && comp.type === 'switch') { comp.closed = comp.closed === false ? true : false; forceUpdate(n => n + 1) }
  }, [])

  const handleReset = useCallback(() => {
    S.current.components = []; S.current.wires = []; S.current.switchClosed = false; S.current.dragId = null; S.current.connecting = null
    forceUpdate(n => n + 1)
  }, [])

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <span style={styles.title}>伏安法测定值电阻</span>
        <div style={styles.actions}>
          <button style={tab === 1 ? styles.tabA : styles.tab} onClick={() => { S.current.tab = 1; setTab(1) }}>📖 实验演示</button>
          <button style={tab === 2 ? styles.tabA : styles.tab} onClick={() => { S.current.tab = 2; setTab(2) }}>🔧 自己动手</button>
          <div style={styles.sep} />
          {tab === 1 && (
            <>
              <label style={styles.lbl}>电源：<input type="range" min="1" max="12" step="0.5" value={S.current.U_source}
                onChange={(e) => { S.current.U_source = parseFloat(e.target.value); forceUpdate(n => n + 1) }} style={styles.slider} /><span style={styles.val}>{S.current.U_source.toFixed(1)}V</span></label>
              <label style={styles.lbl}>R真值：<input type="range" min="5" max="50" step="1" value={S.current.R_true}
                onChange={(e) => { S.current.R_true = parseInt(e.target.value); forceUpdate(n => n + 1) }} style={styles.slider} /><span style={styles.val}>{S.current.R_true}Ω</span></label>
              <label style={styles.lbl}>滑动变阻器：<input type="range" min="0" max="50" step="1" value={S.current.sliderR}
                onChange={(e) => { S.current.sliderR = parseInt(e.target.value); forceUpdate(n => n + 1) }} style={styles.slider} /><span style={styles.val}>{S.current.sliderR}Ω</span></label>
            </>
          )}
          <div style={{ flex: 1 }} />
          {tab === 1 && (
            <>
              <button style={{ ...styles.btn, background: '#4CAF50', color: '#fff', border: 'none' }} onClick={() => {
                const s = S.current
                if (!s.switchClosed) return
                const Rtotal = s.R_true + s.sliderR
                const I = s.U_source / Rtotal
                const U_R = I * s.R_true
                const R_calc = I > 0 ? U_R / I : 0
                s.data.push({ U: U_R, I, R: R_calc })
                forceUpdate(n => n + 1)
              }}>📝 记录</button>
              <button style={styles.btn} onClick={() => { S.current.data = []; forceUpdate(n => n + 1) }}>清除</button>
            </>
          )}
          <button style={styles.btn} onClick={handleReset}>↺ 重置</button>
        </div>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
          onContextMenu={handleContextMenu} onDoubleClick={handleDoubleClick} />
      </div>
      <div style={styles.desc}>
        <b>伏安法测定值电阻</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          {tab === 1 ? '调节滑动变阻器，记录多组U、I数据，用R=U/I计算电阻并求平均值' : '自己动手搭建伏安法测电阻电路（Ⓐ串联、Ⓥ并联）'}
        </span>
      </div>
    </div>
  )
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#f0f4f8', color: '#333', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  toolbar: { minHeight: 44, background: '#f5f5f5', borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', flexShrink: 0, flexWrap: 'wrap', gap: 6 },
  title: { fontSize: 14, fontWeight: 600, color: '#333' },
  actions: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 },
  tab: { background: '#f0f0f0', color: '#666', border: '1px solid #ddd', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  tabA: { background: '#4A90D9', color: '#fff', border: '1px solid #4A90D9', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600 },
  btn: { background: '#f0f0f0', color: '#333', border: '1px solid #ddd', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  sep: { width: 1, height: 20, background: '#ddd' },
  lbl: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#666' },
  slider: { width: 70, accentColor: '#4A90D9' },
  val: { color: '#4A90D9', fontWeight: 600, minWidth: 35, fontSize: 12 },
  main: { flex: 1, display: 'flex', overflow: 'hidden' },
  desc: { padding: '8px 14px', background: '#f5f5f5', borderTop: '1px solid #ccc', fontSize: 13, color: '#333' },
}
