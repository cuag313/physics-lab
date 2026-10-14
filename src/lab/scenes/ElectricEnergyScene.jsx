import { useState, useRef, useEffect } from 'react'
import SceneShell from '../ui/SceneShell'

/**
 * ElectricEnergyScene — 电功与电能表
 *
 * Step1: 观察电能表 — 闭合电路，负载用电，电能表实时累计 W=UIt
 * Step2: 改变功率 — 调 U/I，功率 P=UI 变化，转盘快慢不同
 * Step3: 电费计算 — 记录数据，按电价计算电费
 */
export default function ElectricEnergyScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,
    switchClosed: false,
    U: 220,          // 电压 V
    I: 2,            // 电流 A
    elapsed: 0,      // 通电时间 s（模拟）
    price: 0.56,     // 电价 ¥/kWh
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

    let last = performance.now()
    const loop = (now) => {
      const dt = (now - last) / 1000; last = now
      const s = S.current
      if (s.switchClosed) s.elapsed += dt
      render(R)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  // 物理量
  function energyInfo(s) {
    const P = s.U * s.I                         // W
    const W = P * s.elapsed / 3600 / 1000       // kWh（elapsed 按秒）
    const cost = W * s.price
    return { P, W, cost }
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
    const info = energyInfo(s)

    // 顶部步骤标签
    const labels = ['① 观察电能表', '② 功率与转盘', '③ 电费计算']
    const bw = 110, bh = 28, gap = 8
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
          S.current.elapsed = 0
          S.current.records = []
          S.current.switchClosed = false
          setStep(i + 1)
          forceUpdate(n => n + 1)
        }
      })
    }
    ctx.textBaseline = 'alphabetic'

    const subs = {
      1: '闭合开关，负载用电，电能表累计电功 W = UIt',
      2: '改变电压或电流，观察功率 P=UI 与转盘转速变化',
      3: '记录用电数据，按电价计算电费',
    }
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(subs[s.step], W / 2, 52)
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('🎯 实验目的：认识电能表，理解 W=UIt，会计算电费', W / 2, 70)

    // ─── 电能表主视觉 ───
    const meterCx = W * 0.30, meterCy = H * 0.32
    drawEnergyMeter(ctx, meterCx, meterCy, info, s)

    // ─── 电路（矩形回路）───
    const circL = 60, circR = W * 0.52
    const span = circR - circL
    const circTop = H * 0.62, circBottom = H - 60
    const on = s.switchClosed
    const wc = on ? '#1565C0' : '#999'

    const battX = circL + span * 0.18
    const loadX = circL + span * 0.50
    const swX = circL + span * 0.82

    // 电能表接入电路（顶边由电能表跨接，电流流经电能表）
    const meterTx1 = meterCx - 90, meterTx2 = meterCx + 90, meterTy = meterCy + 85

    // 导线（串联回路：电源→用电器→开关→电能表→电源）
    ctx.strokeStyle = wc; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
    // 电能表到顶角
    ctx.beginPath(); ctx.moveTo(meterTx1, meterTy); ctx.lineTo(circL, circTop); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(meterTx2, meterTy); ctx.lineTo(circR, circTop); ctx.stroke()
    // 左边
    ctx.beginPath(); ctx.moveTo(circL, circTop); ctx.lineTo(circL, circBottom); ctx.stroke()
    // 底边：电源→用电器→开关
    ctx.beginPath(); ctx.moveTo(circL, circBottom); ctx.lineTo(battX - 30, circBottom); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(battX + 30, circBottom); ctx.lineTo(loadX - 35, circBottom); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(loadX + 35, circBottom); ctx.lineTo(swX - 18, circBottom); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(swX + 18, circBottom); ctx.lineTo(circR, circBottom); ctx.stroke()
    // 右边
    ctx.beginPath(); ctx.moveTo(circR, circBottom); ctx.lineTo(circR, circTop); ctx.stroke()
    ctx.lineCap = 'butt'

    // 电流流动
    if (on) {
      const path = [
        { x: battX + 30, y: circBottom }, { x: loadX - 35, y: circBottom },
        { x: loadX + 35, y: circBottom }, { x: swX - 18, y: circBottom },
        { x: swX + 18, y: circBottom }, { x: circR, y: circBottom },
        { x: circR, y: circTop }, { x: meterTx2, y: meterTy },
        { x: meterTx1, y: meterTy }, { x: circL, y: circTop },
        { x: circL, y: circBottom }, { x: battX - 30, y: circBottom },
      ]
      drawCurrentFlow(ctx, path)
    }

    // 电源
    drawBatteryGroup(ctx, battX, circBottom)
    // 负载（用电器）
    drawLoad(ctx, loadX, circBottom, on, info.P)
    // 开关
    drawSwitch(ctx, swX, circBottom, on, () => {
      S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1)
    })
    // 电能表接线柱
    for (const tx of [meterTx1, meterTx2]) {
      ctx.fillStyle = '#333'
      ctx.beginPath(); ctx.arc(tx, meterTy, 5, 0, Math.PI * 2); ctx.fill()
    }

    // ─── 参数调节区（底部）───
    const barY = H - 28
    ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    // 电压
    ctx.fillStyle = '#1976D2'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`U = ${s.U}V`, 70, barY)
    drawMiniSlider(ctx, 130, barY, 90, (s.U - 110) / 270, (r) => {
      S.current.U = Math.round(110 + r * 270); forceUpdate(n => n + 1)
    })
    // 电流
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`I = ${s.I.toFixed(1)}A`, 245, barY)
    drawMiniSlider(ctx, 305, barY, 90, (s.I - 0.5) / 9.5, (r) => {
      S.current.I = Math.round((0.5 + r * 9.5) * 10) / 10; forceUpdate(n => n + 1)
    })
    // 电价
    if (s.step === 3) {
      ctx.fillStyle = '#2E7D32'; ctx.font = 'bold 11px sans-serif'
      ctx.fillText(`电价 ¥${s.price.toFixed(2)}/kWh`, 420, barY)
      drawMiniSlider(ctx, 520, barY, 70, (s.price - 0.3) / 0.7, (r) => {
        S.current.price = Math.round((0.3 + r * 0.7) * 100) / 100; forceUpdate(n => n + 1)
      })
    }
    ctx.textBaseline = 'alphabetic'

    // 右侧面板
    drawRightPanel(ctx, W * 0.56, 70, W - W * 0.56 - 25, H - 100, s)
  }

  // ─── 电能表 ───
  function drawEnergyMeter(ctx, cx, cy, info, s) {
    const mw = 260, mh = 170
    // 表壳
    ctx.fillStyle = '#F5F5F5'; ctx.strokeStyle = '#555'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.roundRect(cx - mw / 2, cy - mh / 2, mw, mh, 10); ctx.fill(); ctx.stroke()
    // 表头
    ctx.fillStyle = '#1565C0'
    ctx.fillRect(cx - mw / 2 + 3, cy - mh / 2 + 3, mw - 6, 32)
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('单相电能表  220V  5(20)A', cx, cy - mh / 2 + 19)

    // 计度器（kWh 累计）
    ctx.fillStyle = '#222'; ctx.font = 'bold 26px monospace'; ctx.textBaseline = 'middle'
    const kwhStr = info.W.toFixed(3).padStart(7, '0')
    ctx.fillText(kwhStr, cx - 10, cy - 18)
    ctx.font = '12px sans-serif'; ctx.fillStyle = '#555'
    ctx.fillText('kW·h', cx + 105, cy - 18)

    // 实时参数
    ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillStyle = '#333'
    ctx.fillText(`U = ${s.U} V`, cx - mw / 2 + 16, cy + 10)
    ctx.fillText(`I = ${s.I.toFixed(1)} A`, cx - mw / 2 + 16, cy + 28)
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`P = UI = ${info.P.toFixed(0)} W`, cx - mw / 2 + 100, cy + 10)
    ctx.fillStyle = '#1565C0'
    ctx.fillText(`t = ${s.elapsed.toFixed(0)} s`, cx - mw / 2 + 100, cy + 28)

    // 转盘（转速 ∝ P）
    const discY = cy + mh / 2 - 30
    ctx.strokeStyle = '#999'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(cx, discY, 18, 0, Math.PI * 2); ctx.stroke()
    const speed = s.switchClosed ? Math.min(info.P / 3000, 2) : 0
    const angle = (performance.now() / 1000) * speed * Math.PI
    ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(cx, discY)
    ctx.lineTo(cx + Math.cos(angle) * 14, discY + Math.sin(angle) * 14); ctx.stroke()
    ctx.fillStyle = '#666'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('转盘（快慢∝P）', cx, discY + 24)
    ctx.textBaseline = 'alphabetic'
  }

  // ─── 负载 ───
  function drawLoad(ctx, x, y, on, P) {
    // 用电器（电机符号）
    ctx.fillStyle = on ? '#FFF9C4' : '#eee'; ctx.strokeStyle = on ? '#F9A825' : '#999'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(x, y, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = on ? '#E65100' : '#999'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('M', x, y)
    ctx.fillStyle = '#888'; ctx.font = '9px sans-serif'; ctx.textBaseline = 'top'
    ctx.fillText('用电器', x, y + 24)
    if (on) {
      ctx.fillStyle = '#E65100'; ctx.font = 'bold 9px monospace'
      ctx.fillText(P.toFixed(0) + 'W', x, y + 36)
    }
    ctx.textBaseline = 'alphabetic'
    // 端子
    for (const dx of [-35, 35]) {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#666'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(x + dx, y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    }
  }

  // ─── 电源 ───
  function drawBatteryGroup(ctx, x, y) {
    // 引线
    ctx.lineWidth = 2; ctx.strokeStyle = '#333'
    ctx.beginPath(); ctx.moveTo(x - 30, y); ctx.lineTo(x - 12, y); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x + 12, y); ctx.lineTo(x + 30, y); ctx.stroke()
    // 极板（长正短负）
    ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.moveTo(x - 8, y - 14); ctx.lineTo(x - 8, y + 14); ctx.stroke()
    ctx.lineWidth = 5
    ctx.beginPath(); ctx.moveTo(x + 2, y - 7); ctx.lineTo(x + 2, y + 7); ctx.stroke()
    // 标注
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText('+', x - 8, y - 16)
    ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'
    ctx.fillText('−', x + 8, y - 12)
    ctx.fillStyle = '#555'; ctx.font = '9px sans-serif'; ctx.textBaseline = 'top'
    ctx.fillText('电源 220V', x, y + 20)
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

  function drawCurrentFlow(ctx, path) {
    const t = (performance.now() / 1000) % 1
    let segLens = [], total = 0
    for (let i = 0; i < path.length - 1; i++) {
      const d = Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y)
      segLens.push(d); total += d
    }
    const N = 5
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

    const info = energyInfo(s)
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('🎯 电功与电能表', x + 12, y + 12)

    // 公式
    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('P = UI      W = UIt = Pt', x + 12, y + 34)
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444'
    ctx.fillText(`P = ${s.U}×${s.I.toFixed(1)} = ${info.P.toFixed(0)} W`, x + 12, y + 52)
    ctx.fillText(`W = ${info.P.toFixed(0)}×${s.elapsed.toFixed(0)}s = ${info.W.toFixed(3)} kWh`, x + 12, y + 68)
    if (s.step === 3) {
      ctx.fillStyle = '#2E7D32'; ctx.font = 'bold 11px sans-serif'
      ctx.fillText(`电费 = ${info.W.toFixed(2)}×¥${s.price.toFixed(2)} = ¥${info.cost.toFixed(2)}`, x + 12, y + 88)
    }

    // 操作步骤
    let ky = y + (s.step === 3 ? 114 : 96)
    const guideSteps = s.step === 1
      ? ['① 闭合开关开始用电', '② 观察电能表读数增加', '③ W = UIt，用电越久读数越大']
      : s.step === 2
        ? ['① 调节 U 或 I 滑条', '② 观察 P=UI 与转盘转速', '③ P 越大转盘越快']
        : ['① 闭合开关用电一段时间', '② 点"记录"保存数据', '③ 调节电价看电费变化']
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
      ? ['• 电能表读数为累计值，通电越久读数越大', '• 1 kW·h = 3.6×10⁶ J', '• 读数时注意最后一位是小数位']
      : s.step === 2
        ? ['• P=UI，改变 U 或 I 均改变功率', '• 转盘转速与功率成正比', '• 注意区分电功 W 和电功率 P']
        : ['• 电费 = 用电量(kW·h) × 电价', '• 家庭用电电压 220V，注意安全', '• 养成节约用电好习惯']
    for (let i = 0; i < notes.length; i++) ctx.fillText(notes[i], x + 12, ky + i * 12)
    ky += notes.length * 12 + 8

    // 数据表
    if (s.records.length > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'
      ctx.fillText('📊 用电数据', x + 12, ky); ky += 18
      ctx.fillStyle = '#FFB74D'
      ctx.fillRect(x + 12, ky, w - 24, 18)
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'
      const c1 = x + 30, c2 = x + 66, c3 = x + 102, c4 = x + 140
      ctx.fillText('序号', c1, ky + 3)
      ctx.fillText('P(W)', c2, ky + 3)
      ctx.fillText('t(s)', c3, ky + 3)
      ctx.fillText('费(¥)', c4, ky + 3)
      ky += 18
      for (let i = 0; i < s.records.length; i++) {
        const r = s.records[i]
        if (i % 2 === 0) { ctx.fillStyle = '#FFF8E1'; ctx.fillRect(x + 12, ky, w - 24, 16) }
        ctx.fillStyle = '#333'; ctx.font = '10px monospace'; ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), c1, ky + 2)
        ctx.fillText(r.P.toFixed(0), c2, ky + 2)
        ctx.fillText(r.t.toFixed(0), c3, ky + 2)
        ctx.fillText(r.cost.toFixed(2), c4, ky + 2)
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
        const inf = energyInfo(s2)
        s2.records.push({ P: inf.P, t: s2.elapsed, cost: inf.cost })
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
        S.current.elapsed = 0; S.current.U = 220; S.current.I = 2
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
        '③ 双击开关通断',
        '④ 右键删除器材',
        '⑤ 观察电能表累计读数',
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
      { type: 'battery', name: '电源 220V' },
      { type: 'switch', name: '开关' },
      { type: 'meter', name: '电能表' },
      { type: 'load', name: '用电器' },
      { type: 'ammeter', name: '电流表 A（干扰）' },
      { type: 'bulb', name: '小灯泡（干扰）' },
      { type: 'rheostat', name: '滑动变阻器（干扰）' },
      { type: 'resistor', name: '定值电阻（干扰）' },
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
    if (type === 'battery') {
      ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'
      ctx.fillRect(-10, -7, 20, 14); ctx.strokeRect(-10, -7, 20, 14)
    } else if (type === 'switch') {
      ctx.strokeStyle = '#666'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(5, -4); ctx.stroke()
      ctx.fillStyle = '#666'; ctx.beginPath(); ctx.arc(-7, 0, 2, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(7, 0, 2, 0, Math.PI * 2); ctx.fill()
    } else if (type === 'meter') {
      ctx.fillStyle = '#E3F2FD'; ctx.strokeStyle = '#1565C0'
      ctx.fillRect(-10, -7, 20, 14); ctx.strokeRect(-10, -7, 20, 14)
      ctx.fillStyle = '#1565C0'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('kWh', 0, 3)
    } else if (type === 'load') {
      ctx.fillStyle = '#FFF9C4'; ctx.strokeStyle = '#F9A825'
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#E65100'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('M', 0, 3)
    } else if (type === 'ammeter') {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('A', 0, 2)
    } else if (type === 'bulb') {
      ctx.fillStyle = '#FFF9C4'; ctx.strokeStyle = '#F9A825'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(0, -1, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    } else if (type === 'rheostat') {
      ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'
      ctx.fillRect(-10, -4, 20, 8); ctx.strokeRect(-10, -4, 20, 8)
    } else if (type === 'resistor') {
      ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'
      ctx.fillRect(-9, -4, 18, 8); ctx.strokeRect(-9, -4, 18, 8)
    }
    ctx.restore()
  }

  function getTermPos(comp, portIndex) {
    if (comp.type === 'battery') return { x: comp.x + (portIndex === 0 ? -18 : 18), y: comp.y }
    if (comp.type === 'switch') return { x: comp.x + (portIndex === 0 ? -15 : 15), y: comp.y }
    if (comp.type === 'meter') return { x: comp.x + (portIndex === 0 ? -20 : 20), y: comp.y }
    if (comp.type === 'load') return { x: comp.x + (portIndex === 0 ? -18 : 18), y: comp.y }
    return { x: comp.x, y: comp.y }
  }

  function drawComp(ctx, comp) {
    ctx.save(); ctx.translate(comp.x, comp.y)
    if (comp.type === 'battery') {
      ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'
      ctx.beginPath(); ctx.roundRect(-18, -11, 36, 22, 3); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('220V', 0, 3)
    } else if (comp.type === 'switch') {
      ctx.strokeStyle = comp.closed ? '#4CAF50' : '#F44336'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(10, comp.closed ? 0 : -10); ctx.stroke()
      ctx.lineCap = 'butt'
      ctx.fillStyle = '#333'
      ctx.beginPath(); ctx.arc(-15, 0, 3, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(15, 0, 3, 0, Math.PI * 2); ctx.fill()
    } else if (comp.type === 'meter') {
      ctx.fillStyle = '#E3F2FD'; ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.roundRect(-20, -13, 40, 26, 3); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#1565C0'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('kWh', 0, -4)
      ctx.fillStyle = '#333'; ctx.font = 'bold 8px monospace'
      ctx.fillText((tab2Energy()).toFixed(3), 0, 8)
    } else if (comp.type === 'load') {
      ctx.fillStyle = '#FFF9C4'; ctx.strokeStyle = '#F9A825'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#E65100'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('M', 0, 0)
    }
    // 端子
    const t1 = getTermPos({ ...comp, x: 0, y: 0 }, 0)
    const t2 = getTermPos({ ...comp, x: 0, y: 0 }, 1)
    for (const t of [t1, t2]) {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#666'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(t.x, t.y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    }
    ctx.restore()
  }

  // Tab2 累计电能
  function tab2Energy() {
    const s = S.current
    const sw = s.components.find(c => c.type === 'switch')
    if (!sw || !sw.closed) return 0
    return (s.elapsed % 100) * 0.01
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
      title="电功与电能表"
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
