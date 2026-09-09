import { useState, useRef, useEffect, useCallback } from 'react'

/**
 * SeriesParallelScene — 串并联电路规律
 *
 * Tab1: 电路演示 — 串联/并联切换，电流表/电压表读数，灯泡亮度
 * Tab2: 自己动手 — 拖拽器材搭建串并联电路
 *
 * 串联：I₁=I₂=I, U=U₁+U₂, R=R₁+R₂
 * 并联：U₁=U₂=U, I=I₁+I₂, 1/R=1/R₁+1/R₂
 */

export default function SeriesParallelScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    circuit: 'series', // series | parallel
    switchClosed: false,
    R1: 10, R2: 20,
    time: 0,
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
  const [circuit, setCircuit] = useState('series')
  const [R1, setR1] = useState(10)
  const [R2, setR2] = useState(20)
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
  //  Tab 1：电路演示
  // ================================================================
  function renderDemo(ctx, W, H) {
    const s = S.current
    const on = s.switchClosed
    const isSeries = s.circuit === 'series'
    const U = 12 // 电源电压

    // 电路参数计算
    let I = 0, U1 = 0, U2 = 0, I1 = 0, I2 = 0, Rtotal = 0
    if (on) {
      if (isSeries) {
        Rtotal = s.R1 + s.R2
        I = U / Rtotal
        U1 = I * s.R1; U2 = I * s.R2
        I1 = I; I2 = I
      } else {
        Rtotal = 1 / (1 / s.R1 + 1 / s.R2)
        I = U / Rtotal
        U1 = U; U2 = U
        I1 = U / s.R1; I2 = U / s.R2
      }
    }

    ctx.fillStyle = '#333'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(isSeries ? '🔌 串联电路规律' : '🔌 并联电路规律', W / 2, 12)

    // 电路区域
    const left = W * 0.08, right = W * 0.52
    const top = 70, bottom = H - 130
    const midX = (left + right) / 2
    const wc = on ? '#1565C0' : '#999'

    if (isSeries) {
      drawSeriesCircuit(ctx, left, right, top, bottom, midX, wc, on, s, U, I, U1, U2, Rtotal)
    } else {
      drawParallelCircuit(ctx, left, right, top, bottom, midX, wc, on, s, U, I, I1, I2, U1, U2, Rtotal)
    }

    // 知识面板
    drawKnowledgePanel(ctx, W, H, s, isSeries, on, U, I, U1, U2, I1, I2, Rtotal)
  }

  // ─── 串联电路 ───
  function drawSeriesCircuit(ctx, left, right, top, bottom, midX, wc, on, s, U, I, U1, U2, Rtotal) {
    const battX = left + (right - left) * 0.15
    const swX = left + (right - left) * 0.35
    const r1X = left + (right - left) * 0.55
    const r2X = left + (right - left) * 0.8

    // 导线（分段）
    drawLine(ctx, left, top, right, top, wc, 2.5)           // 上边
    drawLine(ctx, right, top, right, bottom, wc, 2.5)       // 右边
    drawLine(ctx, left, bottom, battX - 12, bottom, wc, 2.5) // 下左→电池+
    drawLine(ctx, battX + 12, bottom, swX - 18, bottom, wc, 2.5) // 电池−→开关左
    drawLine(ctx, swX + 18, bottom, r1X - 20, bottom, wc, 2.5)  // 开关右→R1
    drawLine(ctx, r1X + 20, bottom, r2X - 20, bottom, wc, 2.5)  // R1→R2
    drawLine(ctx, r2X + 20, bottom, right, bottom, wc, 2.5)     // R2→右下
    drawLine(ctx, left, top, left, bottom, wc, 2.5)         // 左边

    // 电流流动
    if (on) {
      drawCurrentFlow(ctx, [
        { x: battX + 12, y: bottom }, { x: swX, y: bottom }, { x: r1X, y: bottom },
        { x: r2X, y: bottom }, { x: right, y: bottom }, { x: right, y: top },
        { x: left, y: top }, { x: left, y: bottom }, { x: battX - 12, y: bottom },
      ], s.time, 0.5)
    }

    // 电源
    drawStdBattery(ctx, battX, bottom)
    // 开关
    drawStdSwitch(ctx, swX, bottom, on, () => { S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1) })
    // R1
    drawStdResistor(ctx, r1X, bottom, s.R1, '#E53935')
    // R2
    drawStdResistor(ctx, r2X, bottom, s.R2, '#1565C0')

    // 电流表 A（串联在R1和R2之间，上方）
    const ammX = midX, ammY = top + 25
    if (on) drawMeterBubble(ctx, ammX, ammY, 'A', `${I.toFixed(2)}A`, '#E53935')

    // 电压表 V1（跨R1）
    if (on) drawMeterBubble(ctx, r1X, top + 25, 'V₁', `${U1.toFixed(1)}V`, '#4CAF50')
    // 电压表 V2（跨R2）
    if (on) drawMeterBubble(ctx, r2X, top + 25, 'V₂', `${U2.toFixed(1)}V`, '#4CAF50')

    // 标注
    ctx.fillStyle = '#555'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('电源', battX, bottom + 24)
    ctx.fillText(on ? 'ON' : 'OFF', swX, bottom + 24)
    ctx.fillText(`R₁=${s.R1}Ω`, r1X, bottom + 24)
    ctx.fillText(`R₂=${s.R2}Ω`, r2X, bottom + 24)

    // 公式区
    if (on) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText('串联规律：', left, bottom + 50)
      ctx.font = '12px sans-serif'; ctx.fillStyle = '#E53935'
      ctx.fillText(`I = I₁ = I₂ = ${I.toFixed(2)} A`, left, bottom + 68)
      ctx.fillStyle = '#4CAF50'
      ctx.fillText(`U₁ + U₂ = ${U1.toFixed(1)} + ${U2.toFixed(1)} = ${(U1+U2).toFixed(1)} V`, left, bottom + 86)
      ctx.fillStyle = '#333'
      ctx.fillText(`R = R₁ + R₂ = ${s.R1} + ${s.R2} = ${Rtotal} Ω`, left, bottom + 104)
    }
    ctx.textBaseline = 'alphabetic'
  }

  // ─── 并联电路 ───
  function drawParallelCircuit(ctx, left, right, top, bottom, midX, wc, on, s, U, I, I1, I2, U1, U2, Rtotal) {
    const battX = left + (right - left) * 0.12
    const swX = left + (right - left) * 0.28
    const branchL = left + (right - left) * 0.5  // 左分支
    const branchR = left + (right - left) * 0.8  // 右分支
    const topY = top + 30, botY = bottom - 10

    // 主干导线
    drawLine(ctx, left, topY, battX - 12, topY, wc, 2.5)      // 上左→电池+
    drawLine(ctx, battX + 12, topY, swX - 18, topY, wc, 2.5)  // 电池−→开关
    drawLine(ctx, swX + 18, topY, branchL, topY, wc, 2.5)     // 开关→分支起点
    drawLine(ctx, branchR, topY, right, topY, wc, 2.5)         // 分支终点→右上
    drawLine(ctx, right, topY, right, botY, wc, 2.5)           // 右边
    drawLine(ctx, left, botY, left, topY, wc, 2.5)             // 左边
    drawLine(ctx, left, botY, branchL, botY, wc, 2.5)          // 下左→分支起点
    drawLine(ctx, branchR, botY, right, botY, wc, 2.5)         // 分支终点→右下

    // 上下分支横线
    drawLine(ctx, branchL, topY, branchL, botY, wc, 2)  // 左分支
    drawLine(ctx, branchR, topY, branchR, botY, wc, 2)  // 右分支

    // R1（左分支）
    const r1Y = (topY + botY) / 2
    drawStdResistorV(ctx, branchL, r1Y, s.R1, '#E53935')
    // R2（右分支）
    drawStdResistorV(ctx, branchR, r1Y, s.R2, '#1565C0')

    // 电源
    drawStdBattery(ctx, battX, topY)
    // 开关
    drawStdSwitch(ctx, swX, topY, on, () => { S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1) })

    // 电流表（干路、支路）
    if (on) {
      drawMeterBubble(ctx, midX, topY - 22, 'A', `${I.toFixed(2)}A`, '#E53935')       // 干路
      drawMeterBubble(ctx, branchL + 22, r1Y, 'A₁', `${I1.toFixed(2)}A`, '#FF9800')  // R1支路
      drawMeterBubble(ctx, branchR + 22, r1Y, 'A₂', `${I2.toFixed(2)}A`, '#FF9800')  // R2支路
      // 电压表（并联电压相等）
      drawMeterBubble(ctx, midX, botY + 22, 'V', `${U1.toFixed(1)}V`, '#4CAF50')
    }

    // 标注
    ctx.fillStyle = '#555'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('电源', battX, topY + 24)
    ctx.fillText(`R₁=${s.R1}Ω`, branchL, botY + 14)
    ctx.fillText(`R₂=${s.R2}Ω`, branchR, botY + 14)

    // 公式区
    if (on) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText('并联规律：', left, bottom + 30)
      ctx.font = '12px sans-serif'; ctx.fillStyle = '#4CAF50'
      ctx.fillText(`U = U₁ = U₂ = ${U1.toFixed(1)} V`, left, bottom + 48)
      ctx.fillStyle = '#E53935'
      ctx.fillText(`I₁ + I₂ = ${I1.toFixed(2)} + ${I2.toFixed(2)} = ${(I1+I2).toFixed(2)} A`, left, bottom + 66)
      ctx.fillStyle = '#333'
      ctx.fillText(`1/R = 1/R₁ + 1/R₂ → R = ${Rtotal.toFixed(1)} Ω`, left, bottom + 84)
    }
    ctx.textBaseline = 'alphabetic'
  }

  // ─── 知识面板 ───
  function drawKnowledgePanel(ctx, W, H, s, isSeries, on, U, I, U1, U2, I1, I2, Rtotal) {
    const pw = W * 0.38, ph = H - 140, px = W * 0.58, py = 50
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText(isSeries ? '📖 串联电路规律' : '📖 并联电路规律', px + 14, py + 12)

    ctx.font = '12px sans-serif'; let ky = py + 38

    if (isSeries) {
      const items = [
        { t: '串联电路特点', bold: true },
        { t: '电流处处相等：I = I₁ = I₂' },
        { t: '总电压等于各分电压之和：U = U₁ + U₂' },
        { t: '总电阻等于各分电阻之和：R = R₁ + R₂' },
        { t: '' },
        { t: '电流规律', bold: true },
        { t: '串联电路中，电流只有一条路径' },
        { t: '所以通过每个电阻的电流相等' },
        { t: '' },
        { t: '电压规律', bold: true },
        { t: '电压按电阻大小分配' },
        { t: '电阻越大，分得的电压越大' },
        { t: 'U₁/U₂ = R₁/R₂' },
        { t: '' },
        { t: '实验验证', bold: true },
        { t: '调节 R₁、R₂ 滑块改变电阻' },
        { t: '观察电流表（相等）和电压表（之和=U）' },
      ]
      for (const item of items) {
        if (!item.t) { ky += 6; continue }
        ctx.fillStyle = item.bold ? '#333' : '#555'
        ctx.font = item.bold ? 'bold 12px sans-serif' : '12px sans-serif'
        ctx.fillText(item.t, px + 14, ky); ky += 20
      }
    } else {
      const items = [
        { t: '并联电路特点', bold: true },
        { t: '各支路电压相等：U = U₁ = U₂' },
        { t: '总电流等于各支路电流之和：I = I₁ + I₂' },
        { t: '总电阻：1/R = 1/R₁ + 1/R₂' },
        { t: '' },
        { t: '电压规律', bold: true },
        { t: '并联电路中，各支路两端电压相等' },
        { t: '都等于电源电压' },
        { t: '' },
        { t: '电流规律', bold: true },
        { t: '电流按电阻大小反比分配' },
        { t: '电阻越小，通过的电流越大' },
        { t: 'I₁/I₂ = R₂/R₁' },
        { t: '' },
        { t: '实验验证', bold: true },
        { t: '调节 R₁、R₂ 滑块改变电阻' },
        { t: '观察电压表（相等）和电流表（之和=I）' },
      ]
      for (const item of items) {
        if (!item.t) { ky += 6; continue }
        ctx.fillStyle = item.bold ? '#333' : '#555'
        ctx.font = item.bold ? 'bold 12px sans-serif' : '12px sans-serif'
        ctx.fillText(item.t, px + 14, ky); ky += 20
      }
    }

    // 数据面板
    if (on) {
      ky += 10
      ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'
      ctx.fillText('📊 实时数据', px + 14, ky); ky += 20
      ctx.font = '11px monospace'; ctx.fillStyle = '#555'
      ctx.fillText(`电源 U = ${U} V`, px + 14, ky); ky += 18
      ctx.fillText(`总电流 I = ${I.toFixed(3)} A`, px + 14, ky); ky += 18
      ctx.fillText(`总电阻 R = ${Rtotal.toFixed(1)} Ω`, px + 14, ky); ky += 18
      if (isSeries) {
        ctx.fillStyle = '#E53935'; ctx.fillText(`I₁ = I₂ = ${I.toFixed(3)} A ✓`, px + 14, ky); ky += 18
        ctx.fillStyle = '#4CAF50'; ctx.fillText(`U₁+U₂ = ${U1.toFixed(1)}+${U2.toFixed(1)} = ${(U1+U2).toFixed(1)} V ✓`, px + 14, ky)
      } else {
        ctx.fillStyle = '#4CAF50'; ctx.fillText(`U₁ = U₂ = ${U1.toFixed(1)} V ✓`, px + 14, ky); ky += 18
        ctx.fillStyle = '#E53935'; ctx.fillText(`I₁+I₂ = ${I1.toFixed(2)}+${I2.toFixed(2)} = ${(I1+I2).toFixed(2)} A ✓`, px + 14, ky)
      }
    }
    ctx.textBaseline = 'alphabetic'
  }

  // ================================================================
  //  标准电路符号
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

  // 电阻（水平，锯齿线）
  function drawStdResistor(ctx, x, y, R, color) {
    ctx.strokeStyle = color || '#78909C'; ctx.lineWidth = 2; ctx.lineJoin = 'round'
    ctx.beginPath()
    for (let i = 0; i <= 6; i++) {
      const px = x - 18 + (36 / 6) * i
      const py = y + (i % 2 === 0 ? -6 : 6)
      ctx.lineTo(px, py)
    }
    ctx.stroke()
    ctx.fillStyle = color || '#333'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText(`${R}Ω`, x, y - 10); ctx.textBaseline = 'alphabetic'
  }

  // 电阻（垂直，锯齿线）
  function drawStdResistorV(ctx, x, y, R, color) {
    ctx.strokeStyle = color || '#78909C'; ctx.lineWidth = 2; ctx.lineJoin = 'round'
    ctx.beginPath()
    for (let i = 0; i <= 6; i++) {
      const px = x + (i % 2 === 0 ? -6 : 6)
      const py = y - 18 + (36 / 6) * i
      ctx.lineTo(px, py)
    }
    ctx.stroke()
    ctx.fillStyle = color || '#333'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText(`${R}Ω`, x + 10, y); ctx.textBaseline = 'alphabetic'
  }

  // 仪表气泡
  function drawMeterBubble(ctx, x, y, type, value, color) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = color; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = color; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(type, x, y - 3)
    ctx.fillStyle = '#333'; ctx.font = '9px monospace'
    ctx.fillText(value, x, y + 10); ctx.textBaseline = 'alphabetic'
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
  //  Tab 2：自己动手（复制SimpleCircuit的模式）
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

    // 导线
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

    // 器材
    const circuit = checkCircuit()
    for (const comp of s.components) drawBuilderComp(ctx, comp, s, circuit)

    // 状态
    ctx.fillStyle = circuit.closed ? '#4CAF50' : '#F44336'
    ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText(circuit.closed ? '✅ ' + circuit.reason : '❌ ' + circuit.reason, cvX + 12, cvY + cvH - 25)

    // 器材栏
    const palX = W - palW - 10
    ctx.fillStyle = '#f8f9fa'; ctx.beginPath(); ctx.roundRect(palX, cvY, palW, cvH, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(palX, cvY, palW, cvH, 8); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('🧰 电学器材', palX + 10, cvY + 10)

    const items = [
      { type: 'battery', name: '电源' },
      { type: 'bulb', name: '灯泡' },
      { type: 'switch', name: '开关' },
      { type: 'resistor', name: '电阻' },
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

    // 导线颜色
    iy += 10
    ctx.fillStyle = '#333'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('导线颜色：', palX + 10, iy); iy += 20
    const wireColors = [
      { color: '#F44336', name: '红线' },
      { color: '#FFC107', name: '黄线' },
      { color: '#4CAF50', name: '绿线' },
    ]
    for (const wc of wireColors) {
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

    iy += 12
    ctx.fillStyle = '#888'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    for (const h of ['拖拽器材到画布', '点击接线柱连线', '右键删除', '双击开关切换']) { ctx.fillText('• ' + h, palX + 10, iy); iy += 15 }
    ctx.textBaseline = 'alphabetic'
  }

  // ─── 器材图标 ───
  function drawRealisticIcon(ctx, x, y, type) {
    ctx.save(); ctx.translate(x, y)
    if (type === 'battery') {
      ctx.fillStyle = '#81C784'; ctx.strokeStyle = '#388E3C'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.roundRect(-14, -10, 28, 20, 3); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('+ −', 0, 0)
    } else if (type === 'bulb') {
      ctx.fillStyle = '#FFFDE7'; ctx.strokeStyle = '#F9A825'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(0, -2, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#9E9E9E'; ctx.fillRect(-5, 8, 10, 5)
      ctx.strokeStyle = '#E65100'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(-4, -6); ctx.lineTo(4, 2); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(4, -6); ctx.lineTo(-4, 2); ctx.stroke()
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
    }
    ctx.restore()
  }

  // ─── 画布器材 ───
  function drawBuilderComp(ctx, comp, s, circuit) {
    const { x, y, type, rotation } = comp
    const dragging = s.dragId === comp.id
    const isClosed = circuit && circuit.closed

    ctx.save(); ctx.translate(x, y); ctx.rotate(rotation || 0)
    if (dragging) ctx.globalAlpha = 0.6

    if (type === 'battery') {
      const grd = ctx.createLinearGradient(-35, -22, 35, 22)
      grd.addColorStop(0, '#A5D6A7'); grd.addColorStop(0.5, '#66BB6A'); grd.addColorStop(1, '#43A047')
      ctx.fillStyle = grd; ctx.strokeStyle = '#2E7D32'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.roundRect(-35, -22, 70, 44, 6); ctx.fill(); ctx.stroke()
      ctx.strokeStyle = '#1B5E20'; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(-14, -16); ctx.lineTo(-14, 16); ctx.stroke()
      ctx.lineWidth = 5
      ctx.beginPath(); ctx.moveTo(14, -8); ctx.lineTo(14, 8); ctx.stroke()
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
      ctx.fillText('+', -40, -24)
      ctx.fillStyle = '#333'; ctx.font = 'bold 15px sans-serif'
      ctx.fillText('−', 40, -16)
      ctx.textBaseline = 'alphabetic'
    } else if (type === 'bulb') {
      const brightness = isClosed ? 1.0 : 0
      ctx.fillStyle = brightness > 0.3 ? '#FFEB3B' : '#FFFDE7'
      ctx.strokeStyle = brightness > 0.3 ? '#F9A825' : '#bbb'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, -6, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.strokeStyle = brightness > 0.3 ? '#E65100' : '#999'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(-8, -14); ctx.lineTo(8, 2); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(8, -14); ctx.lineTo(-8, 2); ctx.stroke()
      ctx.fillStyle = '#9E9E9E'; ctx.strokeStyle = '#616161'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.roundRect(-10, 14, 20, 10, 2); ctx.fill(); ctx.stroke()
      if (brightness > 0.3) {
        const glow = ctx.createRadialGradient(0, -6, 15, 0, -6, 50)
        glow.addColorStop(0, 'rgba(255,235,59,0.35)'); glow.addColorStop(1, 'rgba(255,235,59,0)')
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, -6, 50, 0, Math.PI * 2); ctx.fill()
      }
      ctx.fillStyle = '#F57F17'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText('灯泡', 0, 26)
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
      ctx.fillStyle = sw ? '#4CAF50' : '#F44336'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText(sw ? 'ON' : 'OFF', 0, 18)
    } else if (type === 'resistor') {
      ctx.fillStyle = '#EFEBE9'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.roundRect(-34, -14, 68, 28, 4); ctx.fill(); ctx.stroke()
      const bands = ['#B71C1C', '#43A047', '#FF6F00', '#FFD54F']
      bands.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(-24 + i * 15, -14, 8, 28) })
      ctx.fillStyle = '#333'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText('10Ω', 0, 16)
    }

    ctx.globalAlpha = 1; ctx.restore()

    const terms = getTerminals(comp)
    for (let i = 0; i < terms.length; i++) {
      const t = terms[i]
      const hov = s.hoverTerm && s.hoverTerm.compId === comp.id && s.hoverTerm.termIdx === i
      ctx.fillStyle = hov ? '#FF9800' : '#fff'
      ctx.strokeStyle = hov ? '#E65100' : '#666'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(t.x, t.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      if (hov) { ctx.strokeStyle = 'rgba(255,152,0,0.4)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(t.x, t.y, 13, 0, Math.PI * 2); ctx.stroke() }
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
    const switches = s.components.filter(c => c.type === 'switch')
    const bulbs = s.components.filter(c => c.type === 'bulb')
    if (batteries.length === 0 || bulbs.length === 0) return { closed: false, reason: '需要电源和灯泡' }
    const connCount = {}
    for (const comp of s.components) connCount[comp.id] = 0
    for (const wire of s.wires) {
      connCount[wire.from.compId] = (connCount[wire.from.compId] || 0) + 1
      connCount[wire.to.compId] = (connCount[wire.to.compId] || 0) + 1
    }
    const allConnected = s.components.every(c => connCount[c.id] >= 2)
    if (!allConnected) return { closed: false, reason: '电路未闭合（有器材未连接）' }
    for (const sw of switches) { if (sw.closed === false) return { closed: false, reason: '开关断开' } }
    return { closed: true, reason: '电路正常，灯泡亮' }
  }

  function getTerminals(comp) {
    const c = Math.cos(comp.rotation || 0), sn = Math.sin(comp.rotation || 0)
    return [
      { x: comp.x - 40 * c, y: comp.y - 40 * sn },
      { x: comp.x + 40 * c, y: comp.y + 40 * sn },
    ]
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

  // ================================================================
  //  交互
  // ================================================================
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
    for (const wire of s.wires) {
      const fc = s.components.find(c => c.id === wire.from.compId)
      const tc = s.components.find(c => c.id === wire.to.compId)
      if (!fc || !tc) continue
      const f = getTermPos(fc, wire.from.termIdx), t = getTermPos(tc, wire.to.termIdx)
      const ddx = t.x - f.x, ddy = t.y - f.y
      const m1x = wire.mid1X != null ? wire.mid1X : f.x + ddx * 0.33
      const m1y = wire.mid1Y != null ? wire.mid1Y : f.y + ddy * 0.33
      const m2x = wire.mid2X != null ? wire.mid2X : f.x + ddx * 0.67
      const m2y = wire.mid2Y != null ? wire.mid2Y : f.y + ddy * 0.67
      if ((x - m1x) ** 2 + (y - m1y) ** 2 < 144) { s.dragId = 'wire_' + wire.id + '_1'; forceUpdate(n => n + 1); return }
      if ((x - m2x) ** 2 + (y - m2y) ** 2 < 144) { s.dragId = 'wire_' + wire.id + '_2'; forceUpdate(n => n + 1); return }
    }
    const comp = findComp(x, y)
    if (comp) { s.dragId = comp.id; s.dragOffX = x - comp.x; s.dragOffY = y - comp.y; forceUpdate(n => n + 1) }
  }, [])

  const handleMouseMove = useCallback((e) => {
    const s = S.current; const { x, y } = getPos(e)
    if (s.tab !== 2) return
    if (s.dragId) {
      if (typeof s.dragId === 'string' && s.dragId.startsWith('wire_')) {
        const parts = s.dragId.split('_')
        const wireId = parseInt(parts[1]), rivetIdx = parseInt(parts[2])
        const wire = s.wires.find(w => w.id === wireId)
        if (wire) {
          if (rivetIdx === 1) { wire.mid1X = x; wire.mid1Y = y }
          else { wire.mid2X = x; wire.mid2Y = y }
          forceUpdate(n => n + 1)
        }
        return
      }
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
        <span style={styles.title}>串并联电路规律</span>
        <div style={styles.actions}>
          <button style={tab === 1 ? styles.tabA : styles.tab} onClick={() => { S.current.tab = 1; setTab(1) }}>📖 电路演示</button>
          <button style={tab === 2 ? styles.tabA : styles.tab} onClick={() => { S.current.tab = 2; setTab(2) }}>🔧 自己动手</button>
          <div style={styles.sep} />
          {tab === 1 && (
            <>
              <button style={circuit === 'series' ? styles.modeA : styles.mode} onClick={() => { S.current.circuit = 'series'; setCircuit('series'); S.current.switchClosed = false; forceUpdate(n => n + 1) }}>串联</button>
              <button style={circuit === 'parallel' ? styles.modeA : styles.mode} onClick={() => { S.current.circuit = 'parallel'; setCircuit('parallel'); S.current.switchClosed = false; forceUpdate(n => n + 1) }}>并联</button>
              <div style={styles.sep} />
              <label style={styles.lbl}>R₁：<input type="range" min="5" max="50" step="1" value={R1}
                onChange={(e) => { const v = parseInt(e.target.value); S.current.R1 = v; setR1(v) }} style={styles.slider} /><span style={styles.val}>{R1}Ω</span></label>
              <label style={styles.lbl}>R₂：<input type="range" min="5" max="50" step="1" value={R2}
                onChange={(e) => { const v = parseInt(e.target.value); S.current.R2 = v; setR2(v) }} style={styles.slider} /><span style={styles.val}>{R2}Ω</span></label>
            </>
          )}
          <div style={{ flex: 1 }} />
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
        <b>串并联电路规律</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          {tab === 1 ? (circuit === 'series' ? '串联：I₁=I₂，U=U₁+U₂，R=R₁+R₂' : '并联：U₁=U₂，I=I₁+I₂，1/R=1/R₁+1/R₂') : '自己动手：拖拽器材搭建串并联电路'}
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
  mode: { background: '#f0f0f0', color: '#666', border: '1px solid #ddd', borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer' },
  modeA: { background: '#FF9800', color: '#fff', border: '1px solid #FF9800', borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 },
  btn: { background: '#f0f0f0', color: '#333', border: '1px solid #ddd', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  sep: { width: 1, height: 20, background: '#ddd' },
  lbl: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#666' },
  slider: { width: 70, accentColor: '#4A90D9' },
  val: { color: '#4A90D9', fontWeight: 600, minWidth: 35, fontSize: 12 },
  main: { flex: 1, display: 'flex', overflow: 'hidden' },
  desc: { padding: '8px 14px', background: '#f5f5f5', borderTop: '1px solid #ccc', fontSize: 13, color: '#333' },
}
