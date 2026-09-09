import { useState, useRef, useEffect, useCallback } from 'react'

/**
 * SeriesParallelScene — 串并联电路规律
 *
 * 教学流程：
 * Step1: 单灯泡 — 用V表和A表测电阻 R=U/I
 * Step2: 两灯泡串联 — 测总电阻 → R总=R₁+R₂ → 电阻变大 → 灯变暗
 * Step3: 两灯泡并联 — 测总电阻 → 1/R总=1/R₁+1/R₂ → 电阻变小 → 灯变亮
 *
 * Tab1: 演示（三步教学）
 * Tab2: 自己动手搭电路
 */

export default function SeriesParallelScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,           // 1=单灯泡, 2=串联, 3=并联
    switchClosed: false,
    R1: 10, R2: 10,    // 灯泡电阻
    U: 12,             // 电源电压
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
  const [step, setStep] = useState(1)
  const [R1, setR1] = useState(10)
  const [R2, setR2] = useState(10)
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
  //  Tab 1：三步教学演示
  // ================================================================
  function renderDemo(ctx, W, H) {
    const s = S.current
    const on = s.switchClosed
    const U = s.U

    // 计算
    let I = 0, U1 = 0, U2 = 0, Rtotal = 0, I1 = 0, I2 = 0
    if (on) {
      if (s.step === 1) {
        Rtotal = s.R1; I = U / Rtotal; U1 = U
      } else if (s.step === 2) {
        Rtotal = s.R1 + s.R2; I = U / Rtotal; U1 = I * s.R1; U2 = I * s.R2
      } else {
        Rtotal = 1 / (1 / s.R1 + 1 / s.R2); I = U / Rtotal
        U1 = U; U2 = U; I1 = U / s.R1; I2 = U / s.R2
      }
    }

    // 标题
    ctx.fillStyle = '#333'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    const titles = { 1: '① 单灯泡 — 测电阻', 2: '② 两灯泡串联 — 电阻变大？', 3: '③ 两灯泡并联 — 电阻变小？' }
    ctx.fillText(titles[s.step], W / 2, 12)

    // 电路区域
    const left = W * 0.08, right = W * 0.52
    const top = 65, bottom = H - 140
    const midX = (left + right) / 2
    const wc = on ? '#1565C0' : '#999'

    if (s.step === 1) drawSingleBulb(ctx, left, right, top, bottom, midX, wc, on, s, U, I, U1, Rtotal)
    else if (s.step === 2) drawSeriesTwo(ctx, left, right, top, bottom, midX, wc, on, s, U, I, U1, U2, Rtotal)
    else drawParallelTwo(ctx, left, right, top, bottom, midX, wc, on, s, U, I, I1, I2, U1, U2, Rtotal)

    // 右侧：教学说明+数据
    drawTeachingPanel(ctx, W, H, s, on, U, I, U1, U2, I1, I2, Rtotal)

    // 底部：步骤导航
    drawStepNav(ctx, W, H, s)
  }

  // ─── Step1: 单灯泡 ───
  function drawSingleBulb(ctx, left, right, top, bottom, midX, wc, on, s, U, I, U1, Rtotal) {
    const battX = left + (right - left) * 0.2
    const swX = left + (right - left) * 0.45
    const bulbX = left + (right - left) * 0.75

    // 导线
    drawLine(ctx, left, top, right, top, wc, 2.5)
    drawLine(ctx, right, top, right, bottom, wc, 2.5)
    drawLine(ctx, left, bottom, battX - 12, bottom, wc, 2.5)
    drawLine(ctx, battX + 12, bottom, swX - 18, bottom, wc, 2.5)
    drawLine(ctx, swX + 18, bottom, right, bottom, wc, 2.5)
    drawLine(ctx, left, top, left, bottom, wc, 2.5)

    if (on) drawCurrentFlow(ctx, [
      { x: battX + 12, y: bottom }, { x: swX, y: bottom }, { x: right, y: bottom },
      { x: right, y: top }, { x: bulbX, y: top }, { x: left, y: top },
      { x: left, y: bottom }, { x: battX - 12, y: bottom },
    ], s.time, 0.5)

    drawStdBattery(ctx, battX, bottom)
    drawStdSwitch(ctx, swX, bottom, on, () => { S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1) })
    drawStdBulb(ctx, bulbX, top, on ? 0.8 : 0)

    // V表（并联在灯泡两端）
    if (on) drawMeterBubble(ctx, bulbX, top + 30, 'V', `${U1.toFixed(1)}V`, '#4CAF50')
    // A表（串联在灯泡前）
    if (on) drawMeterBubble(ctx, (swX + right) / 2, bottom - 20, 'A', `${I.toFixed(2)}A`, '#E53935')

    ctx.fillStyle = '#555'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('灯泡', bulbX, top - 20)

    // R=U/I 计算展示
    if (on) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText('用 R = U / I 测电阻：', left, bottom + 40)
      ctx.fillStyle = '#E53935'; ctx.font = '13px monospace'
      ctx.fillText(`R = ${U1.toFixed(1)}V / ${I.toFixed(2)}A = ${Rtotal.toFixed(1)} Ω`, left, bottom + 60)
    }
    ctx.textBaseline = 'alphabetic'
  }

  // ─── Step2: 两灯泡串联 ───
  function drawSeriesTwo(ctx, left, right, top, bottom, midX, wc, on, s, U, I, U1, U2, Rtotal) {
    const battX = left + (right - left) * 0.12
    const swX = left + (right - left) * 0.28
    const bulb1X = left + (right - left) * 0.5
    const bulb2X = left + (right - left) * 0.78

    // 导线
    drawLine(ctx, left, top, right, top, wc, 2.5)
    drawLine(ctx, right, top, right, bottom, wc, 2.5)
    drawLine(ctx, left, bottom, battX - 12, bottom, wc, 2.5)
    drawLine(ctx, battX + 12, bottom, swX - 18, bottom, wc, 2.5)
    drawLine(ctx, swX + 18, bottom, bulb1X - 16, bottom, wc, 2.5)
    drawLine(ctx, bulb1X + 16, bottom, bulb2X - 16, bottom, wc, 2.5)
    drawLine(ctx, bulb2X + 16, bottom, right, bottom, wc, 2.5)
    drawLine(ctx, left, top, left, bottom, wc, 2.5)

    if (on) drawCurrentFlow(ctx, [
      { x: battX + 12, y: bottom }, { x: swX, y: bottom }, { x: bulb1X, y: bottom },
      { x: bulb2X, y: bottom }, { x: right, y: bottom }, { x: right, y: top },
      { x: left, y: top }, { x: left, y: bottom }, { x: battX - 12, y: bottom },
    ], s.time, 0.5)

    drawStdBattery(ctx, battX, bottom)
    drawStdSwitch(ctx, swX, bottom, on, () => { S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1) })
    // 两个灯泡（串联时亮度降低）
    const brightness = on ? 0.45 : 0  // 串联每个灯泡分压，亮度降低
    drawStdBulb(ctx, bulb1X, bottom, brightness)
    drawStdBulb(ctx, bulb2X, bottom, brightness)

    // 测量
    if (on) {
      // V1跨灯泡1
      drawMeterBubble(ctx, bulb1X, bottom + 30, 'V₁', `${U1.toFixed(1)}V`, '#4CAF50')
      // V2跨灯泡2
      drawMeterBubble(ctx, bulb2X, bottom + 30, 'V₂', `${U2.toFixed(1)}V`, '#4CAF50')
      // A表串联
      drawMeterBubble(ctx, (swX + bulb1X) / 2, bottom - 20, 'A', `${I.toFixed(2)}A`, '#E53935')
    }

    ctx.fillStyle = '#555'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('R₁', bulb1X, bottom - 28)
    ctx.fillText('R₂', bulb2X, bottom - 28)

    // 公式
    if (on) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText('串联测总电阻：', left, bottom + 50)
      ctx.fillStyle = '#E53935'; ctx.font = '13px monospace'
      ctx.fillText(`R总 = R₁ + R₂ = ${s.R1} + ${s.R2} = ${Rtotal} Ω`, left, bottom + 70)
      ctx.fillStyle = '#4CAF50'
      ctx.fillText(`验证：U₁+U₂ = ${U1.toFixed(1)}+${U2.toFixed(1)} = ${(U1+U2).toFixed(1)}V = U ✓`, left, bottom + 90)
      ctx.fillStyle = '#E53935'
      ctx.fillText(`I₁ = I₂ = ${I.toFixed(2)}A ✓`, left, bottom + 108)
    }
    ctx.textBaseline = 'alphabetic'
  }

  // ─── Step3: 两灯泡并联 ───
  function drawParallelTwo(ctx, left, right, top, bottom, midX, wc, on, s, U, I, I1, I2, U1, U2, Rtotal) {
    const battX = left + (right - left) * 0.1
    const swX = left + (right - left) * 0.22
    const branchL = left + (right - left) * 0.48
    const branchR = left + (right - left) * 0.75
    const topY = top + 20, botY = bottom

    // 主干导线
    drawLine(ctx, left, topY, battX - 12, topY, wc, 2.5)
    drawLine(ctx, battX + 12, topY, swX - 18, topY, wc, 2.5)
    drawLine(ctx, swX + 18, topY, branchL, topY, wc, 2.5)
    drawLine(ctx, branchR, topY, right, topY, wc, 2.5)
    drawLine(ctx, right, topY, right, botY, wc, 2.5)
    drawLine(ctx, left, botY, left, topY, wc, 2.5)
    drawLine(ctx, left, botY, branchL, botY, wc, 2.5)
    drawLine(ctx, branchR, botY, right, botY, wc, 2.5)

    // 分支竖线
    drawLine(ctx, branchL, topY, branchL, botY, wc, 2)
    drawLine(ctx, branchR, topY, branchR, botY, wc, 2)

    // 灯泡（并联时每个灯泡亮度正常）
    drawStdBulbV(ctx, branchL, (topY + botY) / 2, on ? 0.9 : 0)
    drawStdBulbV(ctx, branchR, (topY + botY) / 2, on ? 0.9 : 0)

    drawStdBattery(ctx, battX, topY)
    drawStdSwitch(ctx, swX, topY, on, () => { S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1) })

    // 测量
    if (on) {
      // A干路
      drawMeterBubble(ctx, midX, topY - 22, 'A', `${I.toFixed(2)}A`, '#E53935')
      // A1支路
      drawMeterBubble(ctx, branchL + 22, (topY + botY) / 2, 'A₁', `${I1.toFixed(2)}A`, '#FF9800')
      // A2支路
      drawMeterBubble(ctx, branchR + 22, (topY + botY) / 2, 'A₂', `${I2.toFixed(2)}A`, '#FF9800')
      // V跨两支路
      drawMeterBubble(ctx, midX, botY + 22, 'V', `${U1.toFixed(1)}V`, '#4CAF50')
    }

    ctx.fillStyle = '#555'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('R₁', branchL, botY + 14)
    ctx.fillText('R₂', branchR, botY + 14)

    if (on) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText('并联测总电阻：', left, bottom + 35)
      ctx.fillStyle = '#E53935'; ctx.font = '13px monospace'
      ctx.fillText(`1/R总 = 1/R₁ + 1/R₂ = 1/${s.R1} + 1/${s.R2}`, left, bottom + 55)
      ctx.fillText(`R总 = ${Rtotal.toFixed(1)} Ω`, left, bottom + 73)
      ctx.fillStyle = '#4CAF50'
      ctx.fillText(`验证：U₁ = U₂ = ${U1.toFixed(1)}V ✓`, left, bottom + 93)
      ctx.fillText(`I₁+I₂ = ${I1.toFixed(2)}+${I2.toFixed(2)} = ${(I1+I2).toFixed(2)}A = I ✓`, left, bottom + 111)
    }
    ctx.textBaseline = 'alphabetic'
  }

  // ─── 教学说明面板 ───
  function drawTeachingPanel(ctx, W, H, s, on, U, I, U1, U2, I1, I2, Rtotal) {
    const pw = W * 0.38, ph = H - 140, px = W * 0.58, py = 45
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    let ky = py + 12

    if (s.step === 1) {
      ctx.fillText('📖 伏特表与安培表的使用', px + 14, ky); ky += 28
      const items = [
        { t: '安培表 Ⓐ', bold: true },
        { t: '串联接入电路，测电流', color: '#E53935' },
        { t: '内阻极小，不影响电路', color: '#555' },
        { t: '' },
        { t: '伏特表 Ⓥ', bold: true },
        { t: '并联在被测元件两端，测电压', color: '#4CAF50' },
        { t: '内阻极大，不分流', color: '#555' },
        { t: '' },
        { t: '⚠ 千万别接错！', bold: true, color: '#F44336' },
        { t: 'Ⓐ串联在灯泡前（或后）', color: '#E53935' },
        { t: 'Ⓥ并联在灯泡两端', color: '#4CAF50' },
        { t: '不要把Ⓐ串在Ⓥ的并联支路中！', color: '#F44336' },
        { t: '' },
        { t: '测量电阻', bold: true },
        { t: 'R = U / I（欧姆定律）', color: '#333' },
      ]
      for (const item of items) {
        if (!item.t) { ky += 6; continue }
        ctx.fillStyle = item.bold ? '#333' : (item.color || '#555')
        ctx.font = item.bold ? 'bold 12px sans-serif' : '12px sans-serif'
        ctx.fillText(item.t, px + 14, ky); ky += 20
      }
    } else if (s.step === 2) {
      ctx.fillText('📖 串联电路电阻规律', px + 14, ky); ky += 28
      const items = [
        { t: '串联特点', bold: true },
        { t: '电流处处相等：I₁ = I₂ = I' },
        { t: '总电压 = 各分电压之和' },
        { t: '' },
        { t: '总电阻', bold: true },
        { t: 'R总 = R₁ + R₂（电阻变大！）', color: '#E53935' },
        { t: '' },
        { t: '灯泡亮度观察', bold: true },
        { t: '串联后每个灯泡分到的电压变小', color: '#555' },
        { t: '→ 灯泡变暗 → 说明电阻变大了', color: '#E53935' },
        { t: '' },
        { t: '类比理解', bold: true },
        { t: '串联像水管接长 → 阻力增大', color: '#555' },
      ]
      for (const item of items) {
        if (!item.t) { ky += 6; continue }
        ctx.fillStyle = item.bold ? '#333' : (item.color || '#555')
        ctx.font = item.bold ? 'bold 12px sans-serif' : '12px sans-serif'
        ctx.fillText(item.t, px + 14, ky); ky += 20
      }
    } else {
      ctx.fillText('📖 并联电路电阻规律', px + 14, ky); ky += 28
      const items = [
        { t: '并联特点', bold: true },
        { t: '各支路电压相等：U₁ = U₂ = U' },
        { t: '总电流 = 各支路电流之和' },
        { t: '' },
        { t: '总电阻', bold: true },
        { t: '1/R总 = 1/R₁ + 1/R₂', color: '#4CAF50' },
        { t: 'R总 < R₁ 且 R总 < R₂（电阻变小！）', color: '#4CAF50' },
        { t: '' },
        { t: '灯泡亮度观察', bold: true },
        { t: '并联后每个灯泡两端电压不变', color: '#555' },
        { t: '→ 灯泡亮度正常 → 说明总电阻变小了', color: '#4CAF50' },
        { t: '' },
        { t: '类比理解', bold: true },
        { t: '并联像水管加粗 → 阻力减小', color: '#555' },
      ]
      for (const item of items) {
        if (!item.t) { ky += 6; continue }
        ctx.fillStyle = item.bold ? '#333' : (item.color || '#555')
        ctx.font = item.bold ? 'bold 12px sans-serif' : '12px sans-serif'
        ctx.fillText(item.t, px + 14, ky); ky += 20
      }
    }

    // 实时数据
    if (on) {
      ky += 10
      ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'
      ctx.fillText('📊 实测数据', px + 14, ky); ky += 20
      ctx.font = '11px monospace'; ctx.fillStyle = '#555'
      ctx.fillText(`电源 U = ${U} V`, px + 14, ky); ky += 18
      ctx.fillText(`总电流 I = ${I.toFixed(3)} A`, px + 14, ky); y += 18
      ctx.fillStyle = '#E53935'
      ctx.fillText(`总电阻 R = ${Rtotal.toFixed(1)} Ω`, px + 14, ky); ky += 22
      ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'
      if (s.step === 1) ctx.fillText(`单灯泡电阻：${Rtotal.toFixed(1)} Ω`, px + 14, ky)
      else if (s.step === 2) ctx.fillText(`串联：R总 = ${s.R1}+${s.R2} = ${Rtotal} Ω > R₁`, px + 14, ky)
      else ctx.fillText(`并联：R总 = ${Rtotal.toFixed(1)} Ω < R₁ 且 < R₂`, px + 14, ky)
    }
    ctx.textBaseline = 'alphabetic'
  }

  // ─── 步骤导航 ───
  function drawStepNav(ctx, W, H, s) {
    const navY = H - 36
    ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    const steps = [
      { n: 1, label: '① 单灯泡测电阻' },
      { n: 2, label: '② 串联：电阻变大' },
      { n: 3, label: '③ 并联：电阻变小' },
    ]
    const totalW = 380, startX = (W * 0.55 - totalW) / 2
    steps.forEach((st, i) => {
      const bx = startX + i * 130
      const active = s.step === st.n
      ctx.fillStyle = active ? '#FF9800' : '#e0e0e0'
      ctx.beginPath(); ctx.roundRect(bx, navY, 120, 28, 6); ctx.fill()
      ctx.fillStyle = active ? '#fff' : '#666'
      ctx.font = active ? 'bold 11px sans-serif' : '11px sans-serif'
      ctx.fillText(st.label, bx + 60, navY + 14)
      // 点击热区
      canvasRef.current._clickAreas.push({ x: bx, y: navY, w: 120, h: 28, onClick: () => {
        S.current.step = st.n; S.current.switchClosed = false; setStep(st.n); forceUpdate(n => n + 1)
      }})
    })
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

  function drawStdBulb(ctx, x, y, brightness) {
    const r = 14
    ctx.fillStyle = brightness > 0.3 ? '#FFEB3B' : '#f5f5f5'
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = brightness > 0.3 ? '#F9A825' : '#999'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = brightness > 0.3 ? '#E65100' : '#999'; ctx.lineWidth = 1.5
    const s = r * 0.55
    ctx.beginPath(); ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.stroke()
    if (brightness > 0.3) {
      const glow = ctx.createRadialGradient(x, y, r, x, y, r * 3)
      glow.addColorStop(0, `rgba(255,235,59,${brightness * 0.3})`); glow.addColorStop(1, 'rgba(255,235,59,0)')
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, r * 3, 0, Math.PI * 2); ctx.fill()
    }
  }

  // 竖直灯泡（并联用）
  function drawStdBulbV(ctx, x, y, brightness) {
    const r = 14
    ctx.fillStyle = brightness > 0.3 ? '#FFEB3B' : '#f5f5f5'
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = brightness > 0.3 ? '#F9A825' : '#999'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = brightness > 0.3 ? '#E65100' : '#999'; ctx.lineWidth = 1.5
    const s = r * 0.55
    ctx.beginPath(); ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.stroke()
    if (brightness > 0.3) {
      const glow = ctx.createRadialGradient(x, y, r, x, y, r * 3)
      glow.addColorStop(0, `rgba(255,235,59,${brightness * 0.3})`); glow.addColorStop(1, 'rgba(255,235,59,0)')
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, r * 3, 0, Math.PI * 2); ctx.fill()
    }
  }

  // 仪表气泡（标准符号 Ⓥ Ⓐ）
  function drawMeterBubble(ctx, x, y, type, value, color) {
    const r = 18
    ctx.fillStyle = '#fff'; ctx.strokeStyle = color; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    // 符号
    ctx.fillStyle = color; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(type === 'V' || type === 'V₁' || type === 'V₂' ? 'Ⓥ' : 'Ⓐ', x, y - 2)
    // 读数
    ctx.fillStyle = '#333'; ctx.font = '9px monospace'
    ctx.fillText(value, x, y + 12); ctx.textBaseline = 'alphabetic'
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
  //  Tab 2：自己动手（与SimpleCircuit相同的搭建模式）
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

    const items = [{ type: 'battery', name: '电源' }, { type: 'bulb', name: '灯泡' }, { type: 'switch', name: '开关' }, { type: 'resistor', name: '电阻' }]
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

  function drawBuilderComp(ctx, comp, s, circuit) {
    const { x, y, type, rotation } = comp
    const isClosed = circuit && circuit.closed
    ctx.save(); ctx.translate(x, y); ctx.rotate(rotation || 0)
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
    if (!allConnected) return { closed: false, reason: '电路未闭合' }
    for (const sw of switches) { if (sw.closed === false) return { closed: false, reason: '开关断开' } }
    return { closed: true, reason: '电路正常，灯泡亮' }
  }

  function getTerminals(comp) {
    const c = Math.cos(comp.rotation || 0), sn = Math.sin(comp.rotation || 0)
    return [{ x: comp.x - 40 * c, y: comp.y - 40 * sn }, { x: comp.x + 40 * c, y: comp.y + 40 * sn }]
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
        const wire = s.wires.find(w => w.id === parseInt(parts[1]))
        if (wire) {
          if (parseInt(parts[2]) === 1) { wire.mid1X = x; wire.mid1Y = y }
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
          {tab === 1 ? '① 测单灯泡电阻 → ② 串联：电阻变大，灯变暗 → ③ 并联：电阻变小，灯变亮' : '自己动手搭建串并联电路'}
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
