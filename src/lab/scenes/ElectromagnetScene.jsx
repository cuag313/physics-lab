import { useState, useRef, useEffect } from 'react'

/**
 * ElectromagnetScene — 电磁铁磁性影响因素
 *
 * 控制变量法：磁性强弱 ∝ N·I（匝数×电流）
 *
 * Step1: 保持匝数 N 不变，调滑动变阻器改变电流 I → 吸引回形针数量变化 → F∝I
 * Step2: 保持电流 I 不变，改变线圈匝数 N → 吸引回形针数量变化 → F∝N
 */
export default function ElectromagnetScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,
    switchClosed: false,
    sliderR: 10,
    U: 6,
    // Tab1 物理量
    turns: 20,       // 匝数 N（Step2 可调）
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
        const rect = canvas.getBoundingClientRect()
        canvas.width = rect.width * devicePixelRatio
        canvas.height = rect.height * devicePixelRatio
        this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
        this.W = rect.width; this.H = rect.height
      },
    }
    R.resize(); canvasRef.current._R = R

    const loop = () => {
      render(R)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  // 电路电流：I = U / (R线圈 + R变阻器)  线圈内阻 ≈ 2Ω
  function circuitI(s) {
    if (!s.switchClosed) return 0
    return s.U / (2 + s.sliderR)
  }
  // 磁性强弱 ∝ N·I，回形针数 = floor(strength/3) 上限 15
  function magnetInfo(s) {
    const I = circuitI(s)
    const strength = s.turns * I
    const clips = I <= 0 ? 0 : Math.min(Math.floor(strength / 3), 15)
    return { I, strength, clips }
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

    // 顶部步骤标签
    const labels = ['① F∝I（电流）', '② F∝N（匝数）']
    const bw = 130, bh = 28, gap = 10
    const totalW = bw * 2 + gap
    const bx0 = (W - totalW) / 2
    for (let i = 0; i < 2; i++) {
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
          S.current.switchClosed = false
          S.current.sliderR = 10
          S.current.turns = 20
          setStep(i + 1)
          forceUpdate(n => n + 1)
        }
      })
    }
    ctx.textBaseline = 'alphabetic'

    const subs = {
      1: '保持匝数 N=20 不变，调节滑动变阻器改变电流，观察吸引回形针数量',
      2: '保持电流不变（变阻器固定），改变线圈匝数，观察吸引回形针数量',
    }
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(subs[s.step], W / 2, 52)
    // 实验目的
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('🎯 实验目的：用控制变量法探究电流 I 和线圈匝数 N 对电磁铁磁性强弱的影响', W / 2, 70)

    // ─── 电磁铁主视觉（左中部）───
    const magCx = W * 0.30, magCy = H * 0.38
    drawElectromagnet(ctx, magCx, magCy, s.turns, magnetInfo(s), s.switchClosed)

    // ─── 电路（矩形回路，标准布局：下边=电源+开关，上边=变阻器+电流表）───
    const circL = 60, circR = W * 0.52
    const span = circR - circL
    const circTop = H * 0.62, circBottom = H - 60
    const on = s.switchClosed
    const wc = on ? '#1565C0' : '#999'

    const rheoX = circL + span * 0.22
    const ammX = circL + span * 0.62
    const battX = circL + span * 0.28
    const swX = circL + span * 0.72

    // 导线矩形
    ctx.strokeStyle = wc; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
    // 上边：左→变阻器→电流表→右
    ctx.beginPath(); ctx.moveTo(circL, circTop); ctx.lineTo(rheoX - 35, circTop); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(rheoX + 35, circTop); ctx.lineTo(ammX - 16, circTop); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(ammX + 16, circTop); ctx.lineTo(circR, circTop); ctx.stroke()
    // 右边
    ctx.beginPath(); ctx.moveTo(circR, circTop); ctx.lineTo(circR, circBottom); ctx.stroke()
    // 下边：右→开关→电源→左
    ctx.beginPath(); ctx.moveTo(circR, circBottom); ctx.lineTo(swX + 18, circBottom); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(swX - 18, circBottom); ctx.lineTo(battX + 30, circBottom); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(battX - 30, circBottom); ctx.lineTo(circL, circBottom); ctx.stroke()
    // 左边
    ctx.beginPath(); ctx.moveTo(circL, circBottom); ctx.lineTo(circL, circTop); ctx.stroke()
    ctx.lineCap = 'butt'

    // 电流流动动画
    if (on) {
      const path = [
        { x: battX + 30, y: circBottom }, { x: swX, y: circBottom },
        { x: circR, y: circBottom }, { x: circR, y: circTop },
        { x: ammX, y: circTop }, { x: rheoX, y: circTop },
        { x: circL, y: circTop }, { x: circL, y: circBottom },
        { x: battX - 30, y: circBottom },
      ]
      drawCurrentFlow(ctx, path)
    }

    // 元件
    drawBatteryGroup(ctx, battX, circBottom)
    drawSwitch(ctx, swX, circBottom, on, () => {
      S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1)
    })

    // 滑动变阻器（可拖拽滑片）
    drawRheostat(ctx, rheoX, circTop, s.sliderR, (val) => {
      S.current.sliderR = val; forceUpdate(n => n + 1)
    })

    // 电流表
    const { I } = magnetInfo(s)
    drawAmmeter(ctx, ammX, circTop, on ? I : 0)

    // ─── 匝数调节（Step2 可调）───
    const turnsY = H - 30
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    if (s.step === 2) {
      ctx.fillText(`线圈匝数 N = ${s.turns} 匝`, 70, turnsY)
      // −/+ 按钮
      for (const [dx, label, delta] of [[190, '−', -5], [230, '+', 5]]) {
        ctx.fillStyle = '#1976D2'
        ctx.beginPath(); ctx.roundRect(dx, turnsY - 14, 32, 28, 5); ctx.fill()
        ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'
        ctx.fillText(label, dx + 16, turnsY)
        canvasRef.current._clickAreas.push({
          x: dx, y: turnsY - 14, w: 32, h: 28,
          onClick: () => {
            S.current.turns = Math.max(5, Math.min(50, S.current.turns + delta))
            forceUpdate(n => n + 1)
          }
        })
      }
      // 滑条
      const slX = 290, slW = 130
      ctx.strokeStyle = '#bbb'; ctx.lineWidth = 4
      ctx.beginPath(); ctx.moveTo(slX, turnsY); ctx.lineTo(slX + slW, turnsY); ctx.stroke()
      const knobX = slX + ((s.turns - 5) / 45) * slW
      ctx.fillStyle = '#FF9800'
      ctx.beginPath(); ctx.arc(knobX, turnsY, 8, 0, Math.PI * 2); ctx.fill()
      canvasRef.current._clickAreas.push({
        x: slX - 10, y: turnsY - 16, w: slW + 20, h: 32,
        onClick: (mx) => {
          const r = Math.max(0, Math.min(1, (mx - slX) / slW))
          S.current.turns = Math.round(5 + r * 45)
          forceUpdate(n => n + 1)
        }
      })
      ctx.fillStyle = '#888'; ctx.font = '9px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText('5匝', slX - 4, turnsY - 18); ctx.fillText('50匝', slX + slW - 16, turnsY - 18)
    } else {
      ctx.fillStyle = '#888'; ctx.font = '11px sans-serif'
      ctx.fillText('匝数固定 N = 20 匝（控制变量）', 70, turnsY)
    }
    ctx.textBaseline = 'alphabetic'

    // 右侧面板
    drawRightPanel(ctx, W * 0.56, 70, W - W * 0.56 - 25, H - 95, s)
  }

  // ─── 电磁铁（螺线管+铁芯+回形针）───
  function drawElectromagnet(ctx, cx, cy, turns, info, on) {
    const coreW = 220, coreH = 26
    // 铁芯
    ctx.fillStyle = '#8D6E63'; ctx.strokeStyle = '#5D4037'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(cx - coreW / 2, cy - coreH / 2, coreW, coreH, 6); ctx.fill(); ctx.stroke()

    // 线圈（螺线管）
    const coilSpacing = coreW / (turns + 1)
    for (let i = 0; i < turns; i++) {
      const x = cx - coreW / 2 + coilSpacing * (i + 1)
      const glow = on ? Math.min(info.I / 3, 1) : 0
      ctx.strokeStyle = on
        ? `rgba(${211 + glow * 44},${47 + glow * 60},${47 * (1 - glow * 0.5)},${0.5 + glow * 0.5})`
        : 'rgba(150,150,150,0.5)'
      ctx.lineWidth = on ? 1.6 + glow : 1.4
      ctx.beginPath(); ctx.arc(x, cy - coreH / 2, 9, Math.PI, 0); ctx.stroke()
      ctx.beginPath(); ctx.arc(x, cy + coreH / 2, 9, 0, Math.PI); ctx.stroke()
    }

    // 接线柱（左右引出）
    for (const side of [-1, 1]) {
      const px = cx + side * (coreW / 2 + 18)
      ctx.strokeStyle = '#333'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(cx + side * coreW / 2, cy); ctx.lineTo(px, cy); ctx.stroke()
      ctx.fillStyle = '#666'
      ctx.beginPath(); ctx.arc(px, cy, 5, 0, Math.PI * 2); ctx.fill()
    }

    // 磁感线（虚线弧）
    if (on && info.I > 0) {
      const glow = Math.min(info.I / 3, 1)
      ctx.strokeStyle = `rgba(33,150,243,${0.15 + glow * 0.35})`
      ctx.lineWidth = 1.3; ctx.setLineDash([5, 4])
      for (let i = 0; i < 3; i++) {
        const off = 26 + i * 20
        ctx.beginPath()
        ctx.moveTo(cx - coreW / 2 - 18, cy)
        ctx.quadraticCurveTo(cx, cy - off * 2, cx + coreW / 2 + 18, cy)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(cx - coreW / 2 - 18, cy)
        ctx.quadraticCurveTo(cx, cy + off * 2, cx + coreW / 2 + 18, cy)
        ctx.stroke()
      }
      ctx.setLineDash([])
    }

    // N/S 极
    ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillStyle = '#1565C0'; ctx.fillText('N', cx - coreW / 2 - 18, cy + 10)
    ctx.fillStyle = '#E53935'; ctx.fillText('S', cx + coreW / 2 + 6, cy + 10)

    // 回形针（挂在铁芯两端下方）
    const clipSpacing = 13
    for (let i = 0; i < info.clips; i++) {
      const side = i < Math.ceil(info.clips / 2) ? -1 : 1
      const idx = side === -1 ? i : i - Math.ceil(info.clips / 2)
      const px = cx + side * (coreW / 2) + side * 6
      const py = cy + coreH / 2 + 6 + idx * clipSpacing
      drawPaperClip(ctx, px, py)
    }

    // 标注
    ctx.fillStyle = '#333'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText('电磁铁（螺线管 + 铁芯）', cx, cy - coreH / 2 - 28)
    if (info.clips > 0) {
      ctx.fillStyle = '#2E7D32'; ctx.font = 'bold 11px sans-serif'; ctx.textBaseline = 'top'
      ctx.fillText(`吸引回形针 ${info.clips} 个`, cx, cy + coreH / 2 + 6 + 8 * clipSpacing + 6)
    }
    ctx.textBaseline = 'alphabetic'
  }

  function drawPaperClip(ctx, px, py) {
    ctx.strokeStyle = '#888'; ctx.lineWidth = 1.8
    ctx.beginPath()
    ctx.moveTo(px - 4, py); ctx.lineTo(px + 4, py)
    ctx.lineTo(px + 4, py + 8); ctx.lineTo(px, py + 12)
    ctx.lineTo(px - 4, py + 8); ctx.closePath()
    ctx.stroke()
    ctx.fillStyle = '#BDBDBD'; ctx.fill()
  }

  // ─── 电流流动动画 ───
  function drawCurrentFlow(ctx, path) {
    const t = (performance.now() / 1000) % 1
    // 简化：沿路径画移动小圆点
    let segLens = [], total = 0
    for (let i = 0; i < path.length - 1; i++) {
      const d = Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y)
      segLens.push(d); total += d
    }
    const N = 6
    for (let k = 0; k < N; k++) {
      let dist = ((t + k / N) % 1) * total
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
    // I 箭头标签
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText('I', (path[0].x + path[1].x) / 2, path[0].y - 8)
    ctx.textBaseline = 'alphabetic'
  }

  // ─── 电源组 ───
  function drawBatteryGroup(ctx, x, y) {
    ctx.lineWidth = 2; ctx.strokeStyle = '#333'
    ctx.beginPath(); ctx.moveTo(x - 40, y); ctx.lineTo(x - 30, y); ctx.stroke()
    for (let i = 0; i < 3; i++) {
      const cx = x - 20 + i * 20
      ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(cx - 3, y - 14); ctx.lineTo(cx - 3, y + 14); ctx.stroke()
      ctx.lineWidth = 5
      ctx.beginPath(); ctx.moveTo(cx + 3, y - 7); ctx.lineTo(cx + 3, y + 7); ctx.stroke()
      ctx.lineWidth = 2
      if (i < 2) { ctx.beginPath(); ctx.moveTo(cx + 3, y); ctx.lineTo(cx + 17, y); ctx.stroke() }
    }
    ctx.beginPath(); ctx.moveTo(x + 30, y); ctx.lineTo(x + 40, y); ctx.stroke()
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText('+', x - 36, y - 16)
    ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'
    ctx.fillText('−', x + 38, y - 8)
    ctx.fillStyle = '#555'; ctx.font = '9px sans-serif'; ctx.textBaseline = 'top'
    ctx.fillText('电池组 6V', x, y + 18)
    ctx.textBaseline = 'alphabetic'
  }

  // ─── 开关 ───
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

  // ─── 滑动变阻器（可拖拽）───
  function drawRheostat(ctx, x, y, val, onChange) {
    const w = 70, h = 22
    ctx.fillStyle = '#EFEBE9'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, 4); ctx.fill(); ctx.stroke()
    // 电阻丝
    ctx.strokeStyle = '#5D4037'; ctx.lineWidth = 1.5; ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const px = x - w / 2 + 8 + i * (w - 16) / 5
      const py = y + (i % 2 === 0 ? -5 : 5)
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.stroke()
    // 滑片
    const sliderX = x - w / 2 + 8 + (val / 50) * (w - 16)
    ctx.fillStyle = '#E65100'
    ctx.beginPath()
    ctx.moveTo(sliderX, y - h / 2 - 8); ctx.lineTo(sliderX - 4, y - h / 2 - 2); ctx.lineTo(sliderX + 4, y - h / 2 - 2)
    ctx.closePath(); ctx.fill()
    // 接线柱
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#666'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(x - w / 2, y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.arc(x + w / 2, y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    // 标注
    ctx.fillStyle = '#E65100'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(`${val}Ω`, x, y + h / 2 + 3)
    ctx.fillStyle = '#8D6E63'; ctx.font = '9px sans-serif'; ctx.textBaseline = 'bottom'
    ctx.fillText('滑动变阻器', x, y - h / 2 - 12)
    ctx.textBaseline = 'alphabetic'
    canvasRef.current._clickAreas.push({
      x: x - w / 2 - 5, y: y - h / 2 - 12, w: w + 10, h: h + 24,
      onClick: (mx) => {
        const r = Math.max(0, Math.min(1, (mx - (x - w / 2 + 8)) / (w - 16)))
        onChange(Math.round(r * 50))
      }
    })
  }

  // ─── 电流表 ───
  function drawAmmeter(ctx, x, y, I) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('A', x, y)
    ctx.fillStyle = '#333'; ctx.font = 'bold 9px monospace'; ctx.textBaseline = 'top'
    ctx.fillText(I > 0 ? I.toFixed(2) + 'A' : '', x + 22, y)
    ctx.textBaseline = 'alphabetic'
  }

  // ─── 右侧面板 ───
  function drawRightPanel(ctx, x, y, w, h, s) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()

    const info = magnetInfo(s)
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('🎯 探究磁性强弱与 I、N 的关系', x + 12, y + 12)

    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444'
    ctx.fillText(`电流 I = ${info.I.toFixed(2)} A    匝数 N = ${s.turns} 匝`, x + 12, y + 32)
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`磁性强弱 ∝ N·I = ${info.strength.toFixed(1)}`, x + 12, y + 48)
    ctx.fillStyle = '#2E7D32'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`吸引回形针：${info.clips} 个`, x + 12, y + 64)

    // 公式
    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('F ∝ N·I（匝数×电流）', x + 12, y + 84)

    // 操作步骤
    let ky = y + 110
    const guideSteps = s.step === 1
      ? ['① 闭合开关', '② 拖动变阻器滑片改电流', '③ 观察回形针数量变化', '④ 记录数据', '⑤ 结论：N 一定时，I 越大磁性越强']
      : ['① 闭合开关', '② 点 −/+ 或拖滑条改匝数', '③ 观察回形针数量变化', '④ 记录数据', '⑤ 结论：I 一定时，N 越大磁性越强']
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
      ? ['• 通电时间不宜过长，防止线圈过热', '• 只改变电流，匝数保持不变', '• 断电后磁性消失，注意电磁铁与永磁体区别']
      : ['• 只改变匝数，电流保持不变', '• 每次调匝数后需重新稳定再读数', '• 磁性强弱用吸引回形针数量衡量（转换法）']
    for (let i = 0; i < notes.length; i++) ctx.fillText(notes[i], x + 12, ky + i * 12)
    ky += notes.length * 12 + 8

    // 数据表
    if (s.records.length > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'
      ctx.fillText('📊 实验数据', x + 12, ky); ky += 18
      ctx.fillStyle = '#FFB74D'
      ctx.fillRect(x + 12, ky, w - 24, 18)
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'
      const c1 = x + 32, c2 = x + 72, c3 = x + 118, c4 = x + 165
      ctx.fillText('序号', c1, ky + 3)
      ctx.fillText('I(A)', c2, ky + 3)
      ctx.fillText('N(匝)', c3, ky + 3)
      ctx.fillText('回形针', c4, ky + 3)
      ky += 18
      for (let i = 0; i < s.records.length; i++) {
        const r = s.records[i]
        if (i % 2 === 0) { ctx.fillStyle = '#FFF8E1'; ctx.fillRect(x + 12, ky, w - 24, 16) }
        ctx.fillStyle = '#333'; ctx.font = '10px monospace'; ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), c1, ky + 2)
        ctx.fillText(r.I.toFixed(2), c2, ky + 2)
        ctx.fillText(String(r.N), c3, ky + 2)
        ctx.fillText(String(r.clips), c4, ky + 2)
        ky += 16
      }
      ctx.textAlign = 'left'
    }

    // 底部按钮
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
        const inf = magnetInfo(s2)
        s2.records.push({ I: inf.I, N: s2.turns, clips: inf.clips })
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
        S.current.sliderR = 10; S.current.turns = 20
        S.current.records = []; S.current.switchClosed = false
        forceUpdate(n => n + 1)
      }
    })
    ctx.textBaseline = 'alphabetic'
  }

  // ================================================================
  //  Tab 2：自己动手（器材库 + 拖拽 + 连线）
  // ================================================================
  function renderBuilder(ctx, W, H) {
    const s = S.current
    const palW = 150
    const palX = W - palW - 10

    // 画布区域
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#e0e0e0'
    ctx.beginPath(); ctx.roundRect(10, 10, palX - 25, H - 20, 8); ctx.fill(); ctx.stroke()

    // 导线
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
    // 连线中
    if (s.connecting) {
      const c1 = s.components.find(c => c.id === s.connecting.compId)
      if (c1) {
        const p1 = getTermPos(c1, s.connecting.portIndex)
        ctx.strokeStyle = '#FF9800'; ctx.lineWidth = 2; ctx.setLineDash([5, 4])
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(s.connecting.mx, s.connecting.my); ctx.stroke()
        ctx.setLineDash([])
      }
    }

    // 元件
    for (const comp of s.components) drawComp(ctx, comp)

    // 操作说明
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
        '③ 拖动变阻器滑片调阻值',
        '④ 双击开关通断',
        '⑤ 右键删除器材',
        '⑥ 电路连通后观察电流表和回形针',
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
      { type: 'battery', name: '电源 6V' },
      { type: 'switch', name: '开关' },
      { type: 'rheostat', name: '滑动变阻器' },
      { type: 'ammeter', name: '电流表 A' },
      { type: 'electromagnet', name: '电磁铁（螺线管）' },
      { type: 'voltmeter', name: '电压表 V（干扰）' },
      { type: 'bulb', name: '小灯泡（干扰）' },
      { type: 'resistor', name: '定值电阻（干扰）' },
      { type: 'clip', name: '回形针若干' },
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
    // 导线颜色
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
    if (type === 'battery') {
      ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'
      ctx.fillRect(-10, -7, 20, 14); ctx.strokeRect(-10, -7, 20, 14)
    } else if (type === 'switch') {
      ctx.strokeStyle = '#666'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(5, -4); ctx.stroke()
      ctx.fillStyle = '#666'; ctx.beginPath(); ctx.arc(-7, 0, 2, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(7, 0, 2, 0, Math.PI * 2); ctx.fill()
    } else if (type === 'rheostat') {
      ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'
      ctx.fillRect(-10, -4, 20, 8); ctx.strokeRect(-10, -4, 20, 8)
      ctx.strokeStyle = '#FF6F00'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(4, -10); ctx.stroke()
    } else if (type === 'ammeter') {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('A', 0, 2)
    } else if (type === 'electromagnet') {
      ctx.fillStyle = '#8D6E63'; ctx.strokeStyle = '#5D4037'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.roundRect(-10, -3, 20, 6, 2); ctx.fill(); ctx.stroke()
      ctx.strokeStyle = '#D32F2F'; ctx.lineWidth = 1.2
      for (let i = 0; i < 4; i++) {
        const cx2 = -7 + i * 5
        ctx.beginPath(); ctx.arc(cx2, -3, 3, Math.PI, 0); ctx.stroke()
        ctx.beginPath(); ctx.arc(cx2, 3, 3, 0, Math.PI); ctx.stroke()
      }
    } else if (type === 'voltmeter') {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#1565C0'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('V', 0, 2)
    } else if (type === 'bulb') {
      ctx.fillStyle = '#FFF9C4'; ctx.strokeStyle = '#F9A825'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(0, -1, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.strokeStyle = '#F9A825'; ctx.beginPath(); ctx.moveTo(-3, 5); ctx.lineTo(3, 5); ctx.stroke()
    } else if (type === 'resistor') {
      ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'
      ctx.fillRect(-9, -4, 18, 8); ctx.strokeRect(-9, -4, 18, 8)
    } else if (type === 'clip') {
      ctx.strokeStyle = '#888'; ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(-4, -3); ctx.lineTo(4, -3); ctx.lineTo(4, 3); ctx.lineTo(0, 6); ctx.lineTo(-4, 3); ctx.closePath()
      ctx.stroke(); ctx.fillStyle = '#BDBDBD'; ctx.fill()
    }
    ctx.restore()
  }

  function getTermPos(comp, portIndex) {
    if (comp.type === 'battery') return { x: comp.x + (portIndex === 0 ? -18 : 18), y: comp.y }
    if (comp.type === 'switch') return { x: comp.x + (portIndex === 0 ? -15 : 15), y: comp.y }
    if (comp.type === 'rheostat') return { x: comp.x + (portIndex === 0 ? -25 : 25), y: comp.y }
    if (comp.type === 'ammeter') return { x: comp.x + (portIndex === 0 ? -16 : 16), y: comp.y }
    if (comp.type === 'electromagnet') return { x: comp.x + (portIndex === 0 ? -30 : 30), y: comp.y }
    return { x: comp.x, y: comp.y }
  }

  function drawComp(ctx, comp) {
    ctx.save(); ctx.translate(comp.x, comp.y)
    if (comp.type === 'battery') {
      ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'
      ctx.beginPath(); ctx.roundRect(-18, -11, 36, 22, 3); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('6V', 0, 3)
    } else if (comp.type === 'switch') {
      ctx.strokeStyle = comp.closed ? '#4CAF50' : '#F44336'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(10, comp.closed ? 0 : -10); ctx.stroke()
      ctx.lineCap = 'butt'
      ctx.fillStyle = '#333'
      ctx.beginPath(); ctx.arc(-15, 0, 3, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(15, 0, 3, 0, Math.PI * 2); ctx.fill()
    } else if (comp.type === 'rheostat') {
      ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'
      ctx.beginPath(); ctx.roundRect(-25, -10, 50, 20, 3); ctx.fill(); ctx.stroke()
      const Rv = comp.props?.resistance ?? 20
      const sliderX = -25 + (Rv / 50) * 50
      ctx.fillStyle = '#FF6F00'
      ctx.beginPath(); ctx.moveTo(sliderX, -14); ctx.lineTo(sliderX - 4, -8); ctx.lineTo(sliderX + 4, -8); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#5D4037'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(Rv + 'Ω', 0, 20)
    } else if (comp.type === 'ammeter') {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('A', 0, 0)
      // 显示电流
      const I = tab2Current()
      if (comp.id && I > 0) {
        ctx.fillStyle = '#333'; ctx.font = 'bold 9px monospace'; ctx.textBaseline = 'top'
        ctx.fillText(I.toFixed(2) + 'A', 0, 18)
      }
    } else if (comp.type === 'electromagnet') {
      ctx.fillStyle = '#8D6E63'; ctx.strokeStyle = '#5D4037'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.roundRect(-30, -6, 60, 12, 3); ctx.fill(); ctx.stroke()
      ctx.strokeStyle = '#D32F2F'; ctx.lineWidth = 1.2
      const nCoils = comp.props?.turns ?? 12
      for (let i = 0; i < nCoils; i++) {
        const cx2 = -26 + i * (52 / Math.max(nCoils - 1, 1))
        ctx.beginPath(); ctx.arc(cx2, -6, 4, Math.PI, 0); ctx.stroke()
        ctx.beginPath(); ctx.arc(cx2, 6, 4, 0, Math.PI); ctx.stroke()
      }
      ctx.fillStyle = '#5D4037'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('电磁铁 N=' + (comp.props?.turns ?? 12), 0, 20)
    }
    // 接线柱
    const t1 = getTermPos({ ...comp, x: 0, y: 0 }, 0)
    const t2 = getTermPos({ ...comp, x: 0, y: 0 }, 1)
    for (const t of [t1, t2]) {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#666'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(t.x, t.y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    }
    ctx.restore()
  }

  // Tab2 简易电流计算（串联回路）
  function tab2Current() {
    const s = S.current
    const batt = s.components.find(c => c.type === 'battery')
    const sw = s.components.find(c => c.type === 'switch')
    if (!batt || !sw || !sw.closed) return 0
    const hasLoop = s.wires.length >= 3
    if (!hasLoop) return 0
    let R = 2
    const rheo = s.components.find(c => c.type === 'rheostat')
    if (rheo) R += rheo.props?.resistance ?? 20
    return 6 / R
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
          const props = {}
          if (a.type === 'rheostat') props.resistance = 20
          if (a.type === 'electromagnet') props.turns = 12
          s.components.push({ id, type: a.type, x, y, closed: a.type === 'switch' ? false : true, props })
          s.dragId = id; forceUpdate(n => n + 1); return
        }
      }
    }
    // 变阻器滑片
    for (const comp of s.components) {
      if (comp.type !== 'rheostat') continue
      const Rv = comp.props?.resistance ?? 20
      const sliderX = comp.x - 25 + (Rv / 50) * 50
      if (Math.abs(x - sliderX) < 12 && Math.abs(y - (comp.y - 16)) < 15) {
        s.dragId = 'rheo_' + comp.id; forceUpdate(n => n + 1); return
      }
    }
    const term = findTerm(x, y)
    if (term) { s.connecting = { ...term, mx: x, my: y }; forceUpdate(n => n + 1); return }
    for (const comp of s.components) {
      if (Math.abs(x - comp.x) < 32 && Math.abs(y - comp.y) < 25) {
        s.dragId = comp.id; s.dragOffX = x - comp.x; s.dragOffY = y - comp.y
        forceUpdate(n => n + 1); return
      }
    }
  }

  function handleMouseMove(e) {
    const s = S.current; const { x, y } = getPos(e)
    if (s.connecting) { s.connecting.mx = x; s.connecting.my = y; forceUpdate(n => n + 1); return }
    if (s.dragId == null) return
    if (typeof s.dragId === 'string' && s.dragId.startsWith('rheo_')) {
      const id = parseInt(s.dragId.split('_')[1])
      const comp = s.components.find(c => c.id === id)
      if (comp) {
        const ratio = Math.max(0, Math.min(1, (x - (comp.x - 25)) / 50))
        comp.props.resistance = Math.round(ratio * 50)
        forceUpdate(n => n + 1)
      }
      return
    }
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
    const idx = s.components.findIndex(c => Math.abs(x - c.x) < 32 && Math.abs(y - c.y) < 25)
    if (idx >= 0) {
      const id = s.components[idx].id
      s.components.splice(idx, 1)
      s.wires = s.wires.filter(w => w.from.compId !== id && w.to.compId !== id)
      forceUpdate(n => n + 1)
    }
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px', background: '#fff', borderBottom: '1px solid #e0e0e0', alignItems: 'center' }}>
        <button onClick={() => { S.current.tab = 1; setTab(1); forceUpdate(n => n + 1) }}
          style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #ddd', background: tab === 1 ? '#1976D2' : '#fff', color: tab === 1 ? '#fff' : '#333', cursor: 'pointer' }}>
          📊 实验演示
        </button>
        <button onClick={() => { S.current.tab = 2; setTab(2); forceUpdate(n => n + 1) }}
          style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #ddd', background: tab === 2 ? '#1976D2' : '#fff', color: tab === 2 ? '#fff' : '#333', cursor: 'pointer' }}>
          🔧 自己动手
        </button>
        <button onClick={() => {
          S.current.sliderR = 10; S.current.turns = 20
          S.current.records = []; S.current.switchClosed = false
          forceUpdate(n => n + 1)
        }} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', color: '#666', cursor: 'pointer' }}>
          ↺ 重置
        </button>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
        />
      </div>
    </div>
  )
}
