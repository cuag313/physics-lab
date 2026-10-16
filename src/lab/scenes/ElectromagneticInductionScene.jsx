import { useState, useRef, useEffect } from 'react'
import SceneShell from '../ui/SceneShell'

/**
 * ElectromagneticInductionScene — 电磁感应（法拉第实验）
 *
 * 导体棒在磁场中切割磁感线产生感应电动势 ε = BLv
 *
 * Step1: 感应电流产生 — 导体棒切割磁感线，电压表有读数
 * Step2: 速度与电动势 — v 越大 ε 越大
 * Step3: 方向规律 — 反转运动方向验证右手定则
 */
export default function ElectromagneticInductionScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,
    switchClosed: false,
    speed: 2,        // 导体棒速度 m/s（带符号）
    barX: 0,         // 导体棒位置（相对中心）
    records: [],
    // Tab2
    components: [],
    wires: [],
    dragId: null,
    dragOffX: 0, dragOffY: 0,
    connecting: null,
    nextId: 1,
    wireColor: '#F44336',
    _guideOpen: false,
  })

  const [tab, setTab] = useState(1)
  const [, setStep] = useState(1)
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const R = {
      canvas, ctx: canvas.getContext('2d'), W: 0, H: 0,
      resize() {
        const rect = { width: canvas.clientWidth, height: canvas.clientHeight }
        canvas.width = rect.width * devicePixelRatio
        canvas.height = rect.height * devicePixelRatio
        this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
        this.W = rect.width; this.H = rect.height
      },
    }
    R.resize(); canvasRef.current._R = R

    let last = performance.now()
    const loop = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05); last = now
      const s = S.current
      if (s.switchClosed) {
        s.barX += s.speed * 60 * dt
        if (s.barX > 200) { s.barX = 200; s.speed = -Math.abs(s.speed) }
        if (s.barX < -200) { s.barX = -200; s.speed = Math.abs(s.speed) }
      }
      render(R)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  // 物理量：ε = BLv（B、L 归一化为 1）
  function emfInfo(s) {
    const inField = Math.abs(s.barX) < 180
    const emf = inField && s.switchClosed ? s.speed * 0.5 : 0
    return { inField, emf }
  }

  function render(R) {
    try {
      const ctx = R.ctx, W = R.W, H = R.H
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#f0f4f8'; ctx.fillRect(0, 0, W, H)
      canvasRef.current._clickAreas = []
      canvasRef.current._palAreas = []
      if (S.current.tab === 1) renderDemo(ctx, W, H)
      else renderBuilder(ctx, W, H)
    } catch (e) { console.error('render error:', e) }
  }

  // ================================================================
  //  Tab 1：实验演示
  // ================================================================
  function renderDemo(ctx, W, H) {
    const s = S.current
    const on = s.switchClosed
    const info = emfInfo(s)

    // 顶部步骤标签
    const labels = ['① 感应电流', '② ε ∝ v', '③ 右手定则']
    const bw = 105, bh = 28, gap = 8
    const totalW = bw * 3 + gap * 2
    const bx0 = (W - totalW) / 2
    for (let i = 0; i < 3; i++) {
      const x = bx0 + i * (bw + gap), y = 10
      ctx.fillStyle = s.step === i + 1 ? '#FF9800' : '#fff'
      ctx.strokeStyle = s.step === i + 1 ? '#E65100' : '#999'
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.roundRect(x, y, bw, bh, 6); ctx.fill(); ctx.stroke()
      ctx.fillStyle = s.step === i + 1 ? '#fff' : '#555'
      ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(labels[i], x + bw / 2, y + bh / 2)
      canvasRef.current._clickAreas.push({
        x: x - 3, y: y - 3, w: bw + 6, h: bh + 6,
        onClick: () => {
          S.current.step = i + 1
          S.current.records = []
          S.current.barX = 0
          S.current.switchClosed = false
          setStep(i + 1)
          forceUpdate(n => n + 1)
        }
      })
    }
    ctx.textBaseline = 'alphabetic'

    const subs = {
      1: '闭合开关，导体棒切割磁感线 → 电压表有读数（产生感应电流）',
      2: '调节速度，观察电压表读数变化 → ε = BLv，v 越大 ε 越大',
      3: '反转运动方向，感应电流方向反向 → 右手定则',
    }
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(subs[s.step], W / 2, 52)
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('🎯 实验目的：探究导体切割磁感线产生感应电流的条件、大小和方向规律', W / 2, 70)

    // ─── 电磁感应主视觉 ───
    const cx = W * 0.28, cy = H * 0.42
    drawInduction(ctx, cx, cy, s, info, on)

    // ─── 电路（导轨回路：导体棒=感应电源 + 检流计 + 开关，无外接电源）───
    const circL = 60, circR = W * 0.52
    const span = circR - circL
    const circTop = H * 0.72, circBottom = H - 55
    const wc = on ? '#1565C0' : '#999'

    const swX = circL + span * 0.5

    ctx.strokeStyle = wc; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
    // 顶边（导轨1）
    ctx.beginPath(); ctx.moveTo(circL, circTop); ctx.lineTo(circR, circTop); ctx.stroke()
    // 右边（接检流计）
    ctx.beginPath(); ctx.moveTo(circR, circTop); ctx.lineTo(circR, circBottom); ctx.stroke()
    // 底边（导轨2 + 开关）
    ctx.beginPath(); ctx.moveTo(circR, circBottom); ctx.lineTo(swX + 18, circBottom); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(swX - 18, circBottom); ctx.lineTo(circL, circBottom); ctx.stroke()
    // 左边（接导体棒）
    ctx.beginPath(); ctx.moveTo(circL, circBottom); ctx.lineTo(circL, circTop); ctx.stroke()
    ctx.lineCap = 'butt'

    // 导体棒（感应电源，ε = BLv，左竖边）
    drawBarSource(ctx, circL, circTop, circBottom, info.emf, on)
    // 检流计（G，右竖边，检测感应电流）
    drawGalvanometer(ctx, circR, (circTop + circBottom) / 2, info)
    // 开关
    drawSwitch(ctx, swX, circBottom, on, () => {
      S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1)
    })

    // 感应电流流动
    if (on && info.emf !== 0) {
      const path = [
        { x: circL, y: circTop }, { x: circR, y: circTop },
        { x: circR, y: circBottom }, { x: swX, y: circBottom },
        { x: circL, y: circBottom }, { x: circL, y: circTop },
      ]
      drawCurrentFlow(ctx, path, info.emf > 0 ? 1 : -1)
    }

    // ─── 速度调节（底部）───
    const barY = H - 26
    ctx.fillStyle = '#1976D2'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText(`速度 v = ${s.speed.toFixed(1)} m/s`, 70, barY)
    drawMiniSlider(ctx, 190, barY, 110, (s.speed + 5) / 10, (r) => {
      S.current.speed = Math.round((-5 + r * 10) * 10) / 10
      forceUpdate(n => n + 1)
    })
    // 方向按钮
    ctx.fillStyle = '#7B1FA2'; ctx.strokeStyle = '#4A148C'
    ctx.beginPath(); ctx.roundRect(325, barY - 13, 72, 26, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('↻ 反转', 361, barY)
    canvasRef.current._clickAreas.push({
      x: 325, y: barY - 13, w: 72, h: 26,
      onClick: () => { S.current.speed *= -1; forceUpdate(n => n + 1) }
    })
    ctx.fillStyle = '#2E7D32'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText(`ε = ${info.emf.toFixed(2)} V`, 415, barY)
    ctx.textBaseline = 'alphabetic'

    // 右侧面板
    drawRightPanel(ctx, W * 0.56, 70, W - W * 0.56 - 25, H - 100, s)
  }

  // ─── 电磁感应装置 ───
  function drawInduction(ctx, cx, cy, s, info, on) {
    const fieldW = 260, fieldH = 180

    // 磁场区域
    ctx.fillStyle = '#E3F2FD'; ctx.strokeStyle = '#90CAF9'
    ctx.beginPath(); ctx.roundRect(cx - fieldW / 2, cy - fieldH / 2, fieldW, fieldH, 6); ctx.fill(); ctx.stroke()

    // N 极（上红）
    ctx.fillStyle = '#E53935'
    ctx.fillRect(cx - fieldW / 2, cy - fieldH / 2, fieldW, 28)
    ctx.fillStyle = '#fff'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('N', cx, cy - fieldH / 2 + 14)

    // S 极（下蓝）
    ctx.fillStyle = '#1565C0'
    ctx.fillRect(cx - fieldW / 2, cy + fieldH / 2 - 28, fieldW, 28)
    ctx.fillStyle = '#fff'
    ctx.fillText('S', cx, cy + fieldH / 2 - 14)

    // 磁感线（N→S 向下）
    ctx.strokeStyle = 'rgba(33,150,243,0.35)'; ctx.lineWidth = 1.3
    for (let i = -3; i <= 3; i++) {
      const x = cx + i * 32
      ctx.beginPath(); ctx.moveTo(x, cy - fieldH / 2 + 30); ctx.lineTo(x, cy + fieldH / 2 - 30); ctx.stroke()
      ctx.fillStyle = 'rgba(33,150,243,0.45)'
      ctx.beginPath()
      ctx.moveTo(x, cy + fieldH / 2 - 30)
      ctx.lineTo(x - 4, cy + fieldH / 2 - 38)
      ctx.lineTo(x + 4, cy + fieldH / 2 - 38)
      ctx.closePath(); ctx.fill()
    }

    // 导轨（上下两条）
    const railY1 = cy - 55, railY2 = cy + 55
    ctx.strokeStyle = '#795548'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(cx - 110, railY1); ctx.lineTo(cx + 110, railY1); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(cx - 110, railY2); ctx.lineTo(cx + 110, railY2); ctx.stroke()

    // 导体棒（竖直，可左右移动）
    const barX = cx + s.barX
    ctx.strokeStyle = '#333'; ctx.lineWidth = 5; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(barX, railY1); ctx.lineTo(barX, railY2); ctx.stroke()
    ctx.lineCap = 'butt'
    // 两端触点
    for (const ty of [railY1, railY2]) {
      ctx.fillStyle = '#FF9800'; ctx.strokeStyle = '#E65100'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(barX, ty, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    }

    // 运动方向箭头
    if (on && s.speed !== 0) {
      const dir = s.speed > 0 ? 1 : -1
      const ay = cy
      ctx.strokeStyle = '#E65100'; ctx.lineWidth = 3; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(barX, ay); ctx.lineTo(barX + dir * 50, ay); ctx.stroke()
      ctx.lineCap = 'butt'
      ctx.fillStyle = '#E65100'
      ctx.beginPath()
      ctx.moveTo(barX + dir * 50, ay)
      ctx.lineTo(barX + dir * 40, ay - 7)
      ctx.lineTo(barX + dir * 40, ay + 7)
      ctx.closePath(); ctx.fill()
      ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
      ctx.fillText('v', barX + dir * 25, ay - 10)
    }

    // 感应电流方向（右手定则标注）
    if (on && info.emf !== 0) {
      const iDir = info.emf > 0 ? -1 : 1  // 电流沿棒的方向
      const arrowTop = iDir < 0 ? railY1 : railY2
      const arrowBot = iDir < 0 ? railY2 : railY1
      ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(barX + 12, arrowTop + 10); ctx.lineTo(barX + 12, arrowBot - 10); ctx.stroke()
      ctx.fillStyle = '#4CAF50'
      ctx.beginPath()
      ctx.moveTo(barX + 12, arrowTop)
      ctx.lineTo(barX + 8, arrowTop + 10)
      ctx.lineTo(barX + 16, arrowTop + 10)
      ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#2E7D32'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText('I', barX + 18, cy)
    }

    // 电压表
    const vmx = cx + 160, vmy = cy
    ctx.fillStyle = '#F5F5F5'; ctx.strokeStyle = '#666'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(vmx, vmy, 32, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('V', vmx, vmy - 10)
    ctx.font = 'bold 13px monospace'; ctx.fillStyle = info.emf !== 0 ? '#2E7D32' : '#999'
    ctx.fillText(info.emf.toFixed(2) + 'V', vmx, vmy + 12)

    // 电压表连线
    ctx.strokeStyle = '#888'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4])
    ctx.beginPath(); ctx.moveTo(cx + 110, railY1); ctx.lineTo(vmx, vmy - 32); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(cx + 110, railY2); ctx.lineTo(vmx, vmy + 32); ctx.stroke()
    ctx.setLineDash([])

    // 标注
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('导体棒切割磁感线', cx, cy + fieldH / 2 + 14)
    ctx.textBaseline = 'alphabetic'
  }

  function drawMiniSlider(ctx, x, y, w, ratio, onChange) {
    ctx.strokeStyle = '#bbb'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke()
    const kx = x + Math.max(0, Math.min(1, ratio)) * w
    ctx.fillStyle = '#FF9800'
    ctx.beginPath(); ctx.arc(kx, y, 6, 0, Math.PI * 2); ctx.fill()
    canvasRef.current._clickAreas.push({
      x: x - 8, y: y - 14, w: w + 16, h: 28,
      onClick: (mx) => onChange(Math.max(0, Math.min(1, (mx - x) / w)))
    })
  }

  function drawCurrentFlow(ctx, path, dir) {
    const t = (performance.now() / 1000 * dir) % 1
    const tt = t < 0 ? t + 1 : t
    let segLens = [], total = 0
    for (let i = 0; i < path.length - 1; i++) {
      const d = Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y)
      segLens.push(d); total += d
    }
    const N = 5
    for (let k = 0; k < N; k++) {
      let dist = ((tt + k / N) % 1) * total
      for (let i = 0; i < segLens.length; i++) {
        if (dist <= segLens[i]) {
          const r = dist / segLens[i]
          const x = path[i].x + (path[i + 1].x - path[i].x) * r
          const y = path[i].y + (path[i + 1].y - path[i].y) * r
          ctx.fillStyle = 'rgba(255,193,7,0.9)'
          ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill()
          break
        }
        dist -= segLens[i]
      }
    }
  }

  // 导体棒（感应电源，ε = BLv）
  function drawBarSource(ctx, x, yTop, yBottom, emf, _on) {
    const mid = (yTop + yBottom) / 2
    ctx.lineWidth = 3; ctx.strokeStyle = '#555'
    ctx.beginPath(); ctx.moveTo(x - 30, yTop); ctx.lineTo(x - 30, yBottom); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x + 30, yTop); ctx.lineTo(x + 30, yBottom); ctx.stroke()
    // 导体棒（竖直粗线，左竖边位置 x 由调用方传入）
    ctx.lineWidth = 5; ctx.strokeStyle = '#E53935'; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(x - 30, mid); ctx.lineTo(x + 30, mid); ctx.stroke()
    ctx.lineCap = 'butt'
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText('导体棒', x, mid - 6)
    ctx.fillStyle = '#333'; ctx.font = '10px sans-serif'; ctx.textBaseline = 'top'
    ctx.fillText(`ε=${emf.toFixed(2)}V`, x, mid + 6)
    ctx.textBaseline = 'alphabetic'
  }

  // 检流计（G，检测感应电流）
  function drawGalvanometer(ctx, x, y, info) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2E7D32'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#2E7D32'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('G', x, y - 4)
    ctx.font = 'bold 10px monospace'
    ctx.fillText(info.emf !== 0 ? info.emf.toFixed(2) + 'V' : '0', x, y + 8)
    ctx.textBaseline = 'alphabetic'
  }

  function drawSwitch(ctx, x, y, on, onClick) {
    ctx.fillStyle = '#666'
    ctx.beginPath(); ctx.arc(x - 18, y, 4, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(x + 18, y, 4, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#999'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(x - 22, y); ctx.lineTo(x - 18, y); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x + 18, y); ctx.lineTo(x + 22, y); ctx.stroke()
    if (on) {
      ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 3; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(x - 18, y); ctx.lineTo(x + 18, y); ctx.stroke()
    } else {
      ctx.strokeStyle = '#F44336'; ctx.lineWidth = 3; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(x - 18, y); ctx.lineTo(x + 8, y - 18); ctx.stroke()
    }
    ctx.lineCap = 'butt'
    ctx.fillStyle = on ? '#4CAF50' : '#F44336'
    ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(on ? 'ON' : 'OFF', x, y + 8)
    canvasRef.current._clickAreas.push({ x: x - 25, y: y - 25, w: 50, h: 50, onClick })
    ctx.textBaseline = 'alphabetic'
  }

  // ─── 右侧面板 ───
  function drawRightPanel(ctx, x, y, w, h, s) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()

    const info = emfInfo(s)
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('🎯 电磁感应 — 法拉第实验', x + 12, y + 12)

    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444'
    ctx.fillText(`速度 v = ${s.speed.toFixed(1)} m/s`, x + 12, y + 32)
    ctx.fillStyle = '#2E7D32'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`感应电动势 ε = ${info.emf.toFixed(2)} V`, x + 12, y + 50)

    // 公式
    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('ε = BLv', x + 12, y + 72)
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#5D4037'
    ctx.fillText('右手定则：磁感线穿掌心，', x + 12, y + 90)
    ctx.fillText('拇指指运动方向，四指指电流方向', x + 12, y + 106)

    // 操作步骤
    let ky = y + 132
    const guideSteps = s.step === 1
      ? ['① 闭合开关', '② 导体棒切割磁感线', '③ 电压表有读数', '④ 结论：切割产生感应电流']
      : s.step === 2
        ? ['① 拖动滑条改变速度', '② 电压表读数随 v 变化', '③ 记录数据', '④ 结论：ε ∝ v']
        : ['① 点"反转"改变运动方向', '② 感应电流方向反向', '③ 验证右手定则']
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('📋 操作步骤', x + 12, ky); ky += 16
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#5D4037'
    for (let i = 0; i < guideSteps.length; i++) {
      ctx.fillText(guideSteps[i], x + 12, ky + i * 14)
    }
    ky += guideSteps.length * 14 + 6

    // 注意事项
    ctx.fillStyle = '#C62828'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('⚠ 注意事项', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#B71C1C'
    const notes = s.step === 1
      ? ['• 导体棒必须做切割磁感线运动才产生感应电流', '• 电路闭合才有感应电流，否则只有电动势', '• 电磁感应是发电机原理']
      : s.step === 2
        ? ['• 只改变速度，其他条件不变', '• ε = BLv，v 越大感应电动势越大', '• 速度为 0 时无感应电动势']
        : ['• 右手定则：磁感线穿掌心，拇指=运动方向，四指=电流方向', '• 运动方向反向，感应电流方向也反向', '• 注意区分右手定则（电磁感应）与左手定则（安培力）']
    for (let i = 0; i < notes.length; i++) ctx.fillText(notes[i], x + 12, ky + i * 12)
    ky += notes.length * 12 + 8

    // 数据表
    if (s.records.length > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'
      ctx.fillText('📊 实验数据', x + 12, ky); ky += 18
      ctx.fillStyle = '#FFB74D'
      ctx.fillRect(x + 12, ky, w - 24, 18)
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'
      const c1 = x + 32, c2 = x + 85, c3 = x + 148
      ctx.fillText('序号', c1, ky + 3)
      ctx.fillText('v(m/s)', c2, ky + 3)
      ctx.fillText('ε(V)', c3, ky + 3)
      ky += 18
      for (let i = 0; i < s.records.length; i++) {
        const r = s.records[i]
        if (i % 2 === 0) { ctx.fillStyle = '#FFF8E1'; ctx.fillRect(x + 12, ky, w - 24, 16) }
        ctx.fillStyle = '#333'; ctx.font = '10px monospace'; ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), c1, ky + 2)
        ctx.fillText(r.v.toFixed(1), c2, ky + 2)
        ctx.fillText(r.emf.toFixed(2), c3, ky + 2)
        ky += 16
      }
      ctx.textAlign = 'left'
    }

    // 按钮
    const btnY = y + h - 42
    const btnW = 68, btnH = 26, gap = 8
    const bx = x + 12
    ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'
    ctx.beginPath(); ctx.roundRect(bx, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('📝 记录', bx + btnW / 2, btnY + 9)
    canvasRef.current._clickAreas.push({
      x: bx, y: btnY, w: btnW, h: btnH,
      onClick: () => {
        const s2 = S.current
        const inf = emfInfo(s2)
        s2.records.push({ v: s2.speed, emf: inf.emf })
        forceUpdate(n => n + 1)
      }
    })
    ctx.fillStyle = '#FF9800'; ctx.strokeStyle = '#E65100'
    ctx.beginPath(); ctx.roundRect(bx + btnW + gap, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('🗑 清除', bx + btnW + gap + btnW / 2, btnY + 9)
    canvasRef.current._clickAreas.push({
      x: bx + btnW + gap, y: btnY, w: btnW, h: btnH,
      onClick: () => { S.current.records = []; forceUpdate(n => n + 1) }
    })
    ctx.fillStyle = '#9E9E9E'; ctx.strokeStyle = '#616161'
    ctx.beginPath(); ctx.roundRect(bx + (btnW + gap) * 2, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('↺ 重置', bx + (btnW + gap) * 2 + btnW / 2, btnY + 9)
    canvasRef.current._clickAreas.push({
      x: bx + (btnW + gap) * 2, y: btnY, w: btnW, h: btnH,
      onClick: () => {
        S.current.speed = 2; S.current.barX = 0
        S.current.records = []; S.current.switchClosed = false
        forceUpdate(n => n + 1)
      }
    })
    ctx.textBaseline = 'alphabetic'
  }

  // ================================================================
  //  Tab 2：自己动手
  // ================================================================
  function renderBuilder(ctx, W, H) {
    const s = S.current
    const palW = 150
    const palX = W - palW - 10

    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#e0e0e0'
    ctx.beginPath(); ctx.roundRect(10, 10, palX - 25, H - 20, 8); ctx.fill(); ctx.stroke()

    for (const wire of s.wires) {
      const c1 = s.components.find(c => c.id === wire.from.compId)
      const c2 = s.components.find(c => c.id === wire.to.compId)
      if (!c1 || !c2) continue
      const p1 = getTermPos(c1, wire.from.portIndex)
      const p2 = getTermPos(c2, wire.to.portIndex)
      ctx.strokeStyle = wire.color || s.wireColor; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke()
      ctx.lineCap = 'butt'
    }
    if (s.connecting) {
      const c1 = s.components.find(c => c.id === s.connecting.compId)
      if (c1) {
        const p1 = getTermPos(c1, s.connecting.portIndex)
        ctx.strokeStyle = '#FF9800'; ctx.lineWidth = 2; ctx.setLineDash([5, 4])
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(s.connecting.mx, s.connecting.my); ctx.stroke()
        ctx.setLineDash([])
      }
    }

    for (const comp of s.components) drawComp(ctx, comp)

    const bx = 22, by = H - 130, bw2 = palX - 50
    ctx.fillStyle = 'rgba(255,252,240,0.95)'; ctx.strokeStyle = '#ddd'
    ctx.beginPath(); ctx.roundRect(bx, by, bw2, s._guideOpen ? 118 : 36, 6); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText('📋 操作说明', bx + 10, by + 18)
    ctx.textAlign = 'right'
    ctx.fillText(s._guideOpen ? '收起 ▲' : '展开 ▼', bx + bw2 - 10, by + 18)
    canvasRef.current._clickAreas.push({ x: bx - 5, y: by - 3, w: bw2 + 10, h: 42, onClick: () => { s._guideOpen = !s._guideOpen; forceUpdate(n => n + 1) } })
    if (s._guideOpen) {
      ctx.textAlign = 'left'; ctx.font = '10px sans-serif'
      const lines = [
        '① 拖入器材到画布',
        '② 点击接线柱连线',
        '③ 双击开关通断',
        '④ 右键删除器材',
        '⑤ 观察电压表读数',
      ]
      for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], bx + 10, by + 40 + i * 15)
    }
    ctx.textBaseline = 'alphabetic'

    drawPalette(ctx, palX, 10, palW, H - 20)
  }

  function drawPalette(ctx, x, y, w, h) {
    const s = S.current
    ctx.fillStyle = '#fafafa'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('电学器材', x + w / 2, y + 10)

    const items = [
      { type: 'switch', name: '开关' },
      { type: 'voltmeter', name: '电压表 V' },
      { type: 'rod', name: '导体棒+导轨' },
      { type: 'magnet', name: '磁铁（N-S）' },
      { type: 'battery', name: '电源（干扰）' },
      { type: 'bulb', name: '小灯泡（干扰）' },
      { type: 'ammeter', name: '电流表 A（干扰）' },
      { type: 'rheostat', name: '滑动变阻器（干扰）' },
    ]
    const itemH = 30
    for (let i = 0; i < items.length; i++) {
      const iy = y + 32 + i * (itemH + 3)
      if (iy + itemH > y + h - 75) break
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ccc'
      ctx.beginPath(); ctx.roundRect(x + 6, iy, w - 12, itemH, 5); ctx.fill(); ctx.stroke()
      drawPaletteIcon(ctx, x + 18, iy + itemH / 2, items[i].type)
      ctx.fillStyle = '#333'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText(items[i].name, x + 34, iy + itemH / 2)
      canvasRef.current._palAreas.push({ x: x + 6, y: iy, w: w - 12, h: itemH, type: items[i].type })
    }
    const palColorBase = y + 32 + items.length * (itemH + 3) + 4
    ctx.fillStyle = '#666'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('导线颜色：', x + 10, y + 35 + items.length * (itemH + 4) + 5)
    const colors = [['#F44336', '红'], ['#FFC107', '黄'], ['#4CAF50', '绿']]
    for (let i = 0; i < 3; i++) {
      const cy = palColorBase + 18 + i * 20
      ctx.fillStyle = colors[i][0]
      ctx.fillRect(x + 10, cy, 36, 14)
      ctx.strokeStyle = s.wireColor === colors[i][0] ? '#333' : '#ccc'
      ctx.strokeRect(x + 10, cy, 36, 14)
      ctx.fillStyle = '#333'; ctx.font = '10px sans-serif'
      ctx.fillText(colors[i][1], x + 52, cy + 2)
      canvasRef.current._palAreas.push({ x: x + 8, y: cy - 2, w: w - 16, h: 18, action: 'color', color: colors[i][0] })
    }
    ctx.textBaseline = 'alphabetic'
  }

  function drawPaletteIcon(ctx, x, y, type) {
    ctx.save(); ctx.translate(x, y)
    if (type === 'switch') {
      ctx.strokeStyle = '#666'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(5, -4); ctx.stroke()
      ctx.fillStyle = '#666'; ctx.beginPath(); ctx.arc(-7, 0, 2, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(7, 0, 2, 0, Math.PI * 2); ctx.fill()
    } else if (type === 'voltmeter') {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#1565C0'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('V', 0, 3)
    } else if (type === 'rod') {
      ctx.strokeStyle = '#795548'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(-10, -5); ctx.lineTo(10, -5); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(-10, 5); ctx.lineTo(10, 5); ctx.stroke()
      ctx.strokeStyle = '#333'; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(0, 7); ctx.stroke()
    } else if (type === 'magnet') {
      ctx.fillStyle = '#E53935'; ctx.fillRect(-10, -6, 10, 12)
      ctx.fillStyle = '#1565C0'; ctx.fillRect(0, -6, 10, 12)
    } else if (type === 'battery') {
      ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'
      ctx.fillRect(-10, -7, 20, 14); ctx.strokeRect(-10, -7, 20, 14)
    } else if (type === 'bulb') {
      ctx.fillStyle = '#FFF9C4'; ctx.strokeStyle = '#F9A825'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(0, -1, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    } else if (type === 'ammeter') {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('A', 0, 2)
    } else if (type === 'rheostat') {
      ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'
      ctx.fillRect(-10, -4, 20, 8); ctx.strokeRect(-10, -4, 20, 8)
    }
    ctx.restore()
  }

  function getTermPos(comp, portIndex) {
    if (comp.type === 'switch') return { x: comp.x + (portIndex === 0 ? -15 : 15), y: comp.y }
    if (comp.type === 'voltmeter') return { x: comp.x + (portIndex === 0 ? -16 : 16), y: comp.y }
    if (comp.type === 'rod') return { x: comp.x + (portIndex === 0 ? -18 : 18), y: comp.y }
    if (comp.type === 'magnet') return { x: comp.x + (portIndex === 0 ? -12 : 12), y: comp.y }
    return { x: comp.x, y: comp.y }
  }

  function drawComp(ctx, comp) {
    ctx.save(); ctx.translate(comp.x, comp.y)
    if (comp.type === 'switch') {
      ctx.strokeStyle = comp.closed ? '#4CAF50' : '#F44336'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(10, comp.closed ? 0 : -10); ctx.stroke()
      ctx.lineCap = 'butt'
      ctx.fillStyle = '#333'
      ctx.beginPath(); ctx.arc(-15, 0, 3, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(15, 0, 3, 0, Math.PI * 2); ctx.fill()
    } else if (comp.type === 'voltmeter') {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#1565C0'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('V', 0, 0)
    } else if (comp.type === 'rod') {
      ctx.strokeStyle = '#795548'; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(-18, -8); ctx.lineTo(18, -8); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(-18, 8); ctx.lineTo(18, 8); ctx.stroke()
      ctx.strokeStyle = '#333'; ctx.lineWidth = 4
      ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, 10); ctx.stroke()
    } else if (comp.type === 'magnet') {
      ctx.fillStyle = '#E53935'; ctx.fillRect(-12, -10, 12, 20)
      ctx.fillStyle = '#1565C0'; ctx.fillRect(0, -10, 12, 20)
      ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('N', -6, 0); ctx.fillText('S', 6, 0)
    }
    const t1 = getTermPos({ ...comp, x: 0, y: 0 }, 0)
    const t2 = getTermPos({ ...comp, x: 0, y: 0 }, 1)
    for (const t of [t1, t2]) {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#666'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(t.x, t.y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    }
    ctx.restore()
  }

  // ================================================================
  //  交互事件
  // ================================================================
  function getPos(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  function findTerm(x, y) {
    for (const comp of S.current.components) {
      for (let i = 0; i < 2; i++) {
        const t = getTermPos(comp, i)
        if (Math.abs(x - t.x) < 10 && Math.abs(y - t.y) < 10) {
          return { compId: comp.id, portIndex: i }
        }
      }
    }
    return null
  }

  function handleMouseDown(e) {
    if (e.button !== 0) return
    const s = S.current; const { x, y } = getPos(e)
    if (s.tab === 1) {
      for (const a of canvasRef.current._clickAreas) {
        if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(x, y); return }
      }
      return
    }
    for (const a of canvasRef.current._clickAreas || []) {
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(); return }
    }
    for (const a of canvasRef.current._palAreas) {
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) {
        if (a.action === 'color') { s.wireColor = a.color; forceUpdate(n => n + 1); return }
        if (a.type) {
          const id = s.nextId++
          s.components.push({ id, type: a.type, x, y, closed: a.type === 'switch' ? false : true, props: {} })
          s.dragId = id; forceUpdate(n => n + 1); return
        }
      }
    }
    const term = findTerm(x, y)
    if (term) { s.connecting = { ...term, mx: x, my: y }; forceUpdate(n => n + 1); return }
    for (const comp of s.components) {
      if (Math.abs(x - comp.x) < 30 && Math.abs(y - comp.y) < 25) {
        s.dragId = comp.id; s.dragOffX = x - comp.x; s.dragOffY = y - comp.y
        forceUpdate(n => n + 1); return
      }
    }
  }

  function handleMouseMove(e) {
    const s = S.current; const { x, y } = getPos(e)
    if (s.connecting) { s.connecting.mx = x; s.connecting.my = y; forceUpdate(n => n + 1); return }
    if (s.dragId == null) return
    const comp = s.components.find(c => c.id === s.dragId)
    if (comp) { comp.x = x - s.dragOffX; comp.y = y - s.dragOffY; forceUpdate(n => n + 1) }
  }

  function handleMouseUp(e) {
    const s = S.current; const { x, y } = getPos(e)
    if (s.connecting) {
      const term = findTerm(x, y)
      if (term && !(term.compId === s.connecting.compId && term.portIndex === s.connecting.portIndex)) {
        const exists = s.wires.some(w =>
          (w.from.compId === s.connecting.compId && w.from.portIndex === s.connecting.portIndex && w.to.compId === term.compId && w.to.portIndex === term.portIndex) ||
          (w.to.compId === s.connecting.compId && w.to.portIndex === s.connecting.portIndex && w.from.compId === term.compId && w.from.portIndex === term.portIndex)
        )
        if (!exists) s.wires.push({ id: s.wires.length + 1, from: { ...s.connecting }, to: term, color: s.wireColor })
      }
      s.connecting = null; forceUpdate(n => n + 1); return
    }
    s.dragId = null
  }

  function handleDoubleClick(e) {
    const s = S.current; const { x, y } = getPos(e)
    const comp = s.components.find(c => Math.abs(x - c.x) < 25 && Math.abs(y - c.y) < 25 && c.type === 'switch')
    if (comp) { comp.closed = !comp.closed; forceUpdate(n => n + 1) }
  }

  function handleContextMenu(e) {
    e.preventDefault()
    const s = S.current; const { x, y } = getPos(e)
    const idx = s.components.findIndex(c => Math.abs(x - c.x) < 30 && Math.abs(y - c.y) < 25)
    if (idx >= 0) {
      const id = s.components[idx].id
      s.components.splice(idx, 1)
      s.wires = s.wires.filter(w => w.from.compId !== id && w.to.compId !== id)
      forceUpdate(n => n + 1)
    }
  }

  return (
    <SceneShell
      title="电磁感应（法拉第实验）"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t); forceUpdate(n => n + 1) }}
      tab1Label="📊 实验演示"
      tab2Label="🔧 自己动手"
    >
      <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      />
    </SceneShell>
  )
}
