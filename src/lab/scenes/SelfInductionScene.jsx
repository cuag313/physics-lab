import { useState, useRef, useEffect } from 'react'

/**
 * SelfInductionScene — 自感与互感
 *
 * 通电自感：电流缓慢增大，自感电动势 ε = -L·dI/dt 阻碍电流增大
 * 断电自感：电流缓慢减小，自感电动势维持电流（灯泡闪亮）
 * τ = L/R 时间常数
 *
 * Step1: 通电自感 — 闭合开关，电流从 0 缓慢增至 V/R
 * Step2: 断电自感 — 断开开关，电流从 V/R 缓慢减至 0
 * Step3: τ = L/R — 改变 L，观察充放电快慢变化
 */
export default function SelfInductionScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,
    switchClosed: false,
    mode: 'on',       // 'on'=通电自感, 'off'=断电自感
    L: 50,            // mH 自感系数
    t: 0,
    data: [],
    records: [],
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

  const R = 10 // Ω

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const R2 = {
      canvas, ctx: canvas.getContext('2d'), W: 0, H: 0,
      resize() {
        const rect = canvas.getBoundingClientRect()
        canvas.width = rect.width * devicePixelRatio
        canvas.height = rect.height * devicePixelRatio
        this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
        this.W = rect.width; this.H = rect.height
      },
    }
    R2.resize(); canvasRef.current._R = R2

    let last = performance.now()
    const loop = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05); last = now
      const s = S.current
      const tau = s.L * 1e-3 / R
      const V = 12
      if (s.switchClosed) {
        s.t += dt
        let current, emfSelf
        if (s.mode === 'on') {
          current = (V / R) * (1 - Math.exp(-s.t / tau))
          emfSelf = V * Math.exp(-s.t / tau)
        } else {
          current = (V / R) * Math.exp(-s.t / tau)
          emfSelf = -V * Math.exp(-s.t / tau)
        }
        if (s.data.length < 600) s.data.push({ t: s.t, I: current, E: emfSelf })
      }
      render(R2)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R2.resize.bind(R2))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function selfInfo(s) {
    const tau = s.L * 1e-3 / R
    const V = 12
    const t = s.t
    let I, emf
    if (s.mode === 'on') {
      I = s.switchClosed ? (V / R) * (1 - Math.exp(-t / tau)) : 0
      emf = s.switchClosed ? V * Math.exp(-t / tau) : 0
    } else {
      I = s.switchClosed ? (V / R) * Math.exp(-t / tau) : 0
      emf = s.switchClosed ? -V * Math.exp(-t / tau) : 0
    }
    return { tau, I, emf, V }
  }

  function render(R2) {
    try {
      const ctx = R2.ctx, W = R2.W, H = R2.H
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#f0f4f8'; ctx.fillRect(0, 0, W, H)
      canvasRef.current._clickAreas = []
      canvasRef.current._palAreas = []
      if (S.current.tab === 1) renderDemo(ctx, W, H)
      else renderBuilder(ctx, W, H)
    } catch (e) { console.error('render error:', e) }
  }

  function renderDemo(ctx, W, H) {
    const s = S.current
    const info = selfInfo(s)
    const tau = s.L * 1e-3 / R

    // 顶部步骤
    const labels = ['① 通电自感', '② 断电自感', '③ τ = L/R']
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
      canvasRef.current._clickAreas.push({ x: x - 3, y: y - 3, w: bw + 6, h: bh + 6, onClick: () => {
        S.current.step = i + 1; S.current.t = 0; S.current.data = []; S.current.switchClosed = false
        S.current.mode = i === 0 ? 'on' : 'off'
        setStep(i + 1); forceUpdate(n => n + 1)
      } })
    }
    ctx.textBaseline = 'alphabetic'

    const subs = { 1: '闭合开关，电流从 0 缓慢增大到 V/R（自感阻碍电流增大）', 2: '断开开关，电流从 V/R 缓慢减小（灯泡闪亮，自感维持电流）', 3: '改变 L 观察 τ=L/R 变化，L 越大电流变化越慢' }
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(subs[s.step], W / 2, 52)
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('🎯 实验目的：理解自感现象，掌握 ε=-L·dI/dt 和 τ=L/R', W / 2, 70)

    // 电路图
    drawCircuit(ctx, 40, 85, s, info)

    // 曲线图
    const gx = 55, gy = 200, gw = W - 100, gh = H - 270
    if (gw > 100) drawCurveGraph(ctx, gx, gy, gw, gh, s, info, tau)

    // 通/断电按钮
    const btnY = H * 0.42
    ctx.fillStyle = s.mode === 'on' ? '#4CAF50' : '#E53935'
    ctx.beginPath(); ctx.roundRect(50, btnY, 70, 26, 5); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(s.mode === 'on' ? '⚡ 通电' : '🔌 断电', 85, btnY + 8)
    canvasRef.current._clickAreas.push({ x: 50, y: btnY, w: 70, h: 26, onClick: () => {
      S.current.mode = S.current.mode === 'on' ? 'off' : 'on'
      S.current.t = 0; S.current.data = []; S.current.switchClosed = false
      forceUpdate(n => n + 1)
    } })
    ctx.textBaseline = 'alphabetic'

    // 实时数据
    const dy = H * 0.45
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText(`I = ${info.I.toFixed(3)} A`, 50, dy)
    ctx.fillText(`ε_自 = ${info.emf.toFixed(3)} V`, 50, dy + 20)
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'
    ctx.fillText(`L = ${s.L}mH  R = ${R}Ω  τ = L/R = ${(tau * 1000).toFixed(1)}ms`, 50, dy + 44)

    // L 调节
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`L=${s.L}mH`, 50, H - 28)
    drawMiniSlider(ctx, 100, H - 28, 100, (s.L - 5) / 195, (r) => {
      S.current.L = Math.round(5 + r * 195)
      S.current.t = 0; S.current.data = []
      forceUpdate(n => n + 1)
    })

    drawRightPanel(ctx, W * 0.56, H * 0.45, W - W * 0.56 - 25, H - H * 0.45 - 35, s, info)
  }

  function drawCircuit(ctx, ox, oy, s, _info) {
    const on = s.switchClosed
    const wc = on ? '#1565C0' : '#999'
    const V = 12

    // 电池
    ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.roundRect(ox, oy + 50, 12, 30, 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('+', ox + 6, oy + 46); ctx.fillText('−', ox + 6, oy + 86)
    ctx.fillStyle = '#555'; ctx.font = '8px sans-serif'
    ctx.fillText(V + 'V', ox + 6, oy + 95)

    // 导线
    ctx.strokeStyle = wc; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(ox + 6, oy + 50); ctx.lineTo(ox + 6, oy + 20); ctx.lineTo(ox + 150, oy + 20); ctx.stroke()

    // 线圈 L
    ctx.strokeStyle = '#E65100'; ctx.lineWidth = 2
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(ox + 170 + i * 12, oy + 20, 8, 0, Math.PI); ctx.stroke() }
    ctx.fillStyle = '#E65100'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('L', ox + 206, oy + 8)

    // 开关
    const swX = ox + 250, swY = oy + 20
    ctx.fillStyle = '#666'
    ctx.beginPath(); ctx.arc(swX, swY, 3, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(swX + 20, swY, 3, 0, Math.PI * 2); ctx.fill()
    if (on) { ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(swX, swY); ctx.lineTo(swX + 20, swY); ctx.stroke() }
    else { ctx.strokeStyle = '#F44336'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(swX, swY); ctx.lineTo(swX + 10, swY - 14); ctx.stroke() }
    ctx.lineCap = 'butt'
    canvasRef.current._clickAreas.push({ x: swX - 6, y: swY - 18, w: 32, h: 24, onClick: () => { S.current.switchClosed = !S.current.switchClosed; S.current.t = 0; S.current.data = []; forceUpdate(n => n + 1) } })

    // 电阻
    ctx.strokeStyle = '#FF9800'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.roundRect(ox + 280, oy + 12, 30, 16, 2); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('R=' + R + 'Ω', ox + 295, oy + 23)

    // 回路
    ctx.strokeStyle = wc; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(ox + 310, oy + 20); ctx.lineTo(ox + 340, oy + 20); ctx.lineTo(ox + 340, oy + 70); ctx.lineTo(ox + 6, oy + 70); ctx.lineTo(ox + 6, oy + 80); ctx.stroke()

    // 灯泡（断电自感闪亮）
    const bulbGlow = s.mode === 'off' && s.switchClosed && s.t < tau2(s) * 2
    ctx.fillStyle = bulbGlow ? '#FFEB3B' : '#FFF9C4'
    ctx.beginPath(); ctx.arc(ox + 340, oy + 45, 12, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#FF9800'; ctx.lineWidth = 1.5; ctx.stroke()

    // 电流方向
    if (on) {
      ctx.fillStyle = '#1565C0'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('I→', ox + 110, oy + 14)
    }

    // 标注
    ctx.fillStyle = '#5D4037'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(s.mode === 'on' ? '通电自感' : '断电自感', ox + 175, oy + 80)
  }

  function tau2(s) { return s.L * 1e-3 / R }

  function drawCurveGraph(ctx, gx, gy, gw, gh, s, info, tau) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ddd'
    ctx.beginPath(); ctx.roundRect(gx - 5, gy - 5, gw + 10, gh + 10, 6); ctx.fill(); ctx.stroke()

    const margin = { top: 20, right: 15, bottom: 30, left: 40 }
    const pw = gw - margin.left - margin.right
    const ph = gh - margin.top - margin.bottom
    const ox = gx + margin.left, oy = gy + margin.top

    ctx.strokeStyle = '#999'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, oy + ph); ctx.lineTo(ox + pw, oy + ph); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('t (ms)', ox + pw / 2, gy + gh - 5)
    ctx.save(); ctx.translate(gx + 8, oy + ph / 2); ctx.rotate(-Math.PI / 2)
    ctx.fillText('I / ε', 0, 0); ctx.restore()

    const maxT = tau * 5
    const maxI = 12 / R
    const toX = t2 => ox + Math.min(t2 / maxT, 1) * pw
    const toY = v => oy + ph - (Math.abs(v) / maxI) * ph

    ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 0.8
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#999'
    for (let i = 0; i <= 4; i++) {
      const t2 = maxT * i / 4
      ctx.textAlign = 'center'; ctx.fillText((t2 * 1000).toFixed(0), toX(t2), oy + ph + 14)
      ctx.beginPath(); ctx.moveTo(toX(t2), oy); ctx.lineTo(toX(t2), oy + ph); ctx.stroke()
    }
    for (let i = 0; i <= 4; i++) {
      const v = maxI * i / 4
      ctx.textAlign = 'right'; ctx.fillText(v.toFixed(2), ox - 5, toY(v) + 3)
      ctx.beginPath(); ctx.moveTo(ox, toY(v)); ctx.lineTo(ox + pw, toY(v)); ctx.stroke()
    }

    // I(t) 蓝
    ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 2; ctx.beginPath()
    s.data.forEach((d, idx) => { const x = toX(d.t), y = toY(d.I); if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) })
    ctx.stroke()
    ctx.fillStyle = '#1565C0'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('I(t) 电流', ox + 6, oy + 12)

    // ε(t) 红
    ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2; ctx.beginPath()
    s.data.forEach((d, idx) => { const x = toX(d.t), y = toY(Math.abs(d.E)); if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) })
    ctx.stroke()
    ctx.fillStyle = '#E53935'; ctx.font = '10px sans-serif'
    ctx.fillText('ε(t) 自感电动势', ox + 6, oy + 26)

    // τ 标记
    if (tau < maxT) {
      ctx.strokeStyle = 'rgba(156,39,176,0.3)'; ctx.lineWidth = 1; ctx.setLineDash([4, 3])
      ctx.beginPath(); ctx.moveTo(toX(tau), oy); ctx.lineTo(toX(tau), oy + ph); ctx.stroke()
      ctx.setLineDash([]); ctx.fillStyle = '#9C27B0'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('τ', toX(tau), oy - 2)
    }
  }

  function drawMiniSlider(ctx, x, y, w, ratio, onChange) {
    ctx.strokeStyle = '#bbb'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke()
    const kx = x + Math.max(0, Math.min(1, ratio)) * w
    ctx.fillStyle = '#FF9800'; ctx.beginPath(); ctx.arc(kx, y, 6, 0, Math.PI * 2); ctx.fill()
    canvasRef.current._clickAreas.push({ x: x - 8, y: y - 14, w: w + 16, h: 28, onClick: (mx) => onChange(Math.max(0, Math.min(1, (mx - x) / w))) })
  }

  function drawRightPanel(ctx, x, y, w, h, s, info) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('🎯 自感与互感', x + 12, y + 12)
    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('ε = -L·dI/dt', x + 12, y + 32)
    ctx.fillText('τ = L/R', x + 12, y + 48)
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444'
    ctx.fillText(s.mode === 'on' ? '通电：I 从 0 增至 V/R' : '断电：I 从 V/R 减至 0', x + 12, y + 66)
    ctx.fillText(`I = ${info.I.toFixed(3)}A  ε_自 = ${info.emf.toFixed(3)}V`, x + 12, y + 80)

    let ky = y + 100
    const guideSteps = s.step === 1
      ? ['① 闭合开关通电', '② 电流缓慢从 0 增大', '③ 自感电动势阻碍电流增大', '④ 最终 I = V/R']
      : s.step === 2
        ? ['① 断开开关', '② 电流缓慢从 V/R 减小', '③ 灯泡闪亮（自感维持电流）', '④ 自感电动势阻碍电流减小']
        : ['① 改变 L 观察 τ=L/R', '② L 越大 τ 越大，变化越慢', '③ 记录 τ 与 L 的关系']
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('📋 操作步骤', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#5D4037'
    for (let i = 0; i < guideSteps.length; i++) ctx.fillText(guideSteps[i], x + 12, ky + i * 12)
    ky += guideSteps.length * 12 + 6

    ctx.fillStyle = '#C62828'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('⚠ 注意事项', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#B71C1C'
    const notes = s.step === 1
      ? ['• 自感电动势方向阻碍电流增大', '• 电流按指数规律增大', '• τ=L/R 决定增大快慢']
      : s.step === 2
        ? ['• 断电自感可产生高电压', '• 灯泡闪亮：自感维持短暂电流', '• 方向与原电流方向相同']
        : ['• L 越大自感越强', '• τ 越大变化越慢', '• 5τ≈99.3% 达到稳态']
    for (let i = 0; i < notes.length; i++) ctx.fillText(notes[i], x + 12, ky + i * 12)
    ky += notes.length * 12 + 6

    if (s.records.length > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('📊 实验数据', x + 12, ky); ky += 14
      ctx.fillStyle = '#FFB74D'; ctx.fillRect(x + 12, ky, w - 24, 16)
      ctx.fillStyle = '#333'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      const c1 = x + 26, c2 = x + 60, c3 = x + 110
      ctx.fillText('#', c1, ky + 2); ctx.fillText('L(mH)', c2, ky + 2); ctx.fillText('τ(ms)', c3, ky + 2)
      ky += 14
      for (let i = 0; i < s.records.length; i++) {
        const r = s.records[i]
        if (i % 2 === 0) { ctx.fillStyle = '#FFF8E1'; ctx.fillRect(x + 12, ky, w - 24, 13) }
        ctx.fillStyle = '#333'; ctx.font = '9px monospace'; ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), c1, ky + 1); ctx.fillText(String(r.L), c2, ky + 1); ctx.fillText(r.tau.toFixed(1), c3, ky + 1)
        ky += 13
      }
      ctx.textAlign = 'left'
    }

    const btnY = y + h - 38, btnW = 62, btnH = 24, gap = 6, bx = x + 12
    ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'
    ctx.beginPath(); ctx.roundRect(bx, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('📝 记录', bx + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({ x: bx, y: btnY, w: btnW, h: btnH, onClick: () => { const s2 = S.current; s2.records.push({ L: s2.L, tau: s2.L * 1e-3 / R * 1000 }); forceUpdate(n => n + 1) } })
    ctx.fillStyle = '#FF9800'; ctx.strokeStyle = '#E65100'
    ctx.beginPath(); ctx.roundRect(bx + btnW + gap, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.fillText('🗑 清除', bx + btnW + gap + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({ x: bx + btnW + gap, y: btnY, w: btnW, h: btnH, onClick: () => { S.current.records = []; forceUpdate(n => n + 1) } })
    ctx.fillStyle = '#9E9E9E'; ctx.strokeStyle = '#616161'
    ctx.beginPath(); ctx.roundRect(bx + (btnW + gap) * 2, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.fillText('↺ 重置', bx + (btnW + gap) * 2 + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({ x: bx + (btnW + gap) * 2, y: btnY, w: btnW, h: btnH, onClick: () => { S.current.L = 50; S.current.t = 0; S.current.data = []; S.current.records = []; S.current.switchClosed = false; forceUpdate(n => n + 1) } })
    ctx.textBaseline = 'alphabetic'
  }

  // Tab2
  function renderBuilder(ctx, W, H) {
    const s = S.current
    const palW = 150, palX = W - palW - 10
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#e0e0e0'
    ctx.beginPath(); ctx.roundRect(10, 10, palX - 25, H - 20, 8); ctx.fill(); ctx.stroke()
    for (const comp of s.components) drawComp(ctx, comp)

    const bx = 22, by = H - 100, bw = palX - 50
    ctx.fillStyle = 'rgba(255,252,240,0.95)'; ctx.strokeStyle = '#ddd'
    ctx.beginPath(); ctx.roundRect(bx, by, bw, s._guideOpen ? 88 : 36, 6); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText('📋 操作说明', bx + 10, by + 18)
    ctx.textAlign = 'right'; ctx.fillText(s._guideOpen ? '收起 ▲' : '展开 ▼', bx + bw - 10, by + 18)
    canvasRef.current._clickAreas.push({ x: bx - 5, y: by - 3, w: bw + 10, h: 42, onClick: () => { s._guideOpen = !s._guideOpen; forceUpdate(n => n + 1) } })
    if (s._guideOpen) { ctx.textAlign = 'left'; ctx.font = '10px sans-serif'; ['① 拖入器材到画布', '② 观察自感现象', '③ 右键删除器材'].forEach((l, i) => ctx.fillText(l, bx + 10, by + 40 + i * 15)) }
    ctx.textBaseline = 'alphabetic'
    drawPalette(ctx, palX, 10, palW, H - 20)
  }

  function drawPalette(ctx, x, y, w, h) {
    ctx.fillStyle = '#fafafa'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('电学器材', x + w / 2, y + 10)
    const items = [{ type: 'battery', name: '电源' }, { type: 'switch', name: '开关' }, { type: 'coil', name: '线圈（电感）' }, { type: 'resistor', name: '电阻 R' }, { type: 'bulb', name: '小灯泡' }, { type: 'ammeter', name: '电流表（干扰）' }, { type: 'voltmeter', name: '电压表（干扰）' }]
    const itemH = 30
    for (let i = 0; i < items.length; i++) {
      const iy = y + 32 + i * (itemH + 3)
      if (iy + itemH > y + h - 40) break
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ccc'
      ctx.beginPath(); ctx.roundRect(x + 6, iy, w - 12, itemH, 5); ctx.fill(); ctx.stroke()
      drawPaletteIcon(ctx, x + 18, iy + itemH / 2, items[i].type)
      ctx.fillStyle = '#333'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText(items[i].name, x + 34, iy + itemH / 2)
      canvasRef.current._palAreas.push({ x: x + 6, y: iy, w: w - 12, h: itemH, type: items[i].type })
    }
    ctx.textBaseline = 'alphabetic'
  }

  function drawPaletteIcon(ctx, x, y, type) {
    ctx.save(); ctx.translate(x, y)
    if (type === 'battery') { ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'; ctx.fillRect(-10, -7, 20, 14); ctx.strokeRect(-10, -7, 20, 14) }
    else if (type === 'switch') { ctx.strokeStyle = '#666'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(5, -4); ctx.stroke(); ctx.fillStyle = '#666'; ctx.beginPath(); ctx.arc(-7, 0, 2, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(7, 0, 2, 0, Math.PI * 2); ctx.fill() }
    else if (type === 'coil') { ctx.strokeStyle = '#E65100'; ctx.lineWidth = 1.5; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-6 + i * 6, 0, 5, Math.PI, 0); ctx.stroke() } }
    else if (type === 'resistor') { ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'; ctx.fillRect(-9, -4, 18, 8); ctx.strokeRect(-9, -4, 18, 8) }
    else if (type === 'bulb') { ctx.fillStyle = '#FFF9C4'; ctx.strokeStyle = '#F9A825'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, -1, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke() }
    else if (type === 'ammeter') { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#E53935'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('A', 0, 2) }
    else if (type === 'voltmeter') { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#1565C0'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('V', 0, 2) }
    ctx.restore()
  }

  function drawComp(ctx, comp) {
    ctx.save(); ctx.translate(comp.x, comp.y)
    if (comp.type === 'battery') { ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'; ctx.beginPath(); ctx.roundRect(-18, -11, 36, 22, 3); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('12V', 0, 3) }
    else if (comp.type === 'switch') { ctx.strokeStyle = comp.closed ? '#4CAF50' : '#F44336'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(10, comp.closed ? 0 : -10); ctx.stroke(); ctx.lineCap = 'butt'; ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(-15, 0, 3, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(15, 0, 3, 0, Math.PI * 2); ctx.fill() }
    else if (comp.type === 'coil') { ctx.strokeStyle = '#E65100'; ctx.lineWidth = 2; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(-9 + i * 6, 0, 6, 0, Math.PI); ctx.stroke() }; ctx.fillStyle = '#E65100'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('L', 0, 10) }
    else if (comp.type === 'resistor') { ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(-14, -8, 28, 16, 3); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#333'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('R', 0, 0) }
    else if (comp.type === 'bulb') { ctx.fillStyle = '#FFF9C4'; ctx.strokeStyle = '#F9A825'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.strokeStyle = '#F9A825'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-6, 6); ctx.lineTo(6, -6); ctx.stroke() }
    else if (comp.type === 'ammeter') { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#E53935'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('A', 0, 0) }
    else if (comp.type === 'voltmeter') { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#1565C0'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('V', 0, 0) }
    ctx.restore()
  }

  function getPos(e) { const r = canvasRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
  function handleMouseDown(e) { if (e.button !== 0) return; const s = S.current; const { x, y } = getPos(e); if (s.tab === 1) { for (const a of canvasRef.current._clickAreas) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(x, y); return } } return } for (const a of canvasRef.current._clickAreas || []) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(); return } } for (const a of canvasRef.current._palAreas) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { if (a.type) { s.components.push({ id: s.nextId++, type: a.type, x, y, closed: a.type === 'switch' ? false : true, props: {} }); s.dragId = s.nextId - 1; forceUpdate(n => n + 1); return } } } for (const c of s.components) { if (Math.abs(x - c.x) < 25 && Math.abs(y - c.y) < 25) { s.dragId = c.id; s.dragOffX = x - c.x; s.dragOffY = y - c.y; forceUpdate(n => n + 1); return } } }
  function handleMouseMove(e) { const s = S.current; const { x, y } = getPos(e); if (s.dragId == null) return; const c = s.components.find(c => c.id === s.dragId); if (c) { c.x = x - s.dragOffX; c.y = y - s.dragOffY; forceUpdate(n => n + 1) } }
  function handleMouseUp() { S.current.dragId = null }
  function handleDoubleClick(e) { const s = S.current; const { x, y } = getPos(e); const c = s.components.find(c => Math.abs(x - c.x) < 25 && Math.abs(y - c.y) < 25 && c.type === 'switch'); if (c) { c.closed = !c.closed; forceUpdate(n => n + 1) } }
  function handleContextMenu(e) { e.preventDefault(); const s = S.current; const { x, y } = getPos(e); const idx = s.components.findIndex(c => Math.abs(x - c.x) < 25 && Math.abs(y - c.y) < 25); if (idx >= 0) { s.components.splice(idx, 1); forceUpdate(n => n + 1) } }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px', background: '#fff', borderBottom: '1px solid #e0e0e0', alignItems: 'center' }}>
        <button onClick={() => { S.current.tab = 1; setTab(1); forceUpdate(n => n + 1) }} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #ddd', background: tab === 1 ? '#1976D2' : '#fff', color: tab === 1 ? '#fff' : '#333', cursor: 'pointer' }}>📊 实验演示</button>
        <button onClick={() => { S.current.tab = 2; setTab(2); forceUpdate(n => n + 1) }} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #ddd', background: tab === 2 ? '#1976D2' : '#fff', color: tab === 2 ? '#fff' : '#333', cursor: 'pointer' }}>🔧 自己动手</button>
        <button onClick={() => { S.current.L = 50; S.current.t = 0; S.current.data = []; S.current.records = []; S.current.switchClosed = false; forceUpdate(n => n + 1) }} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', color: '#666', cursor: 'pointer' }}>↺ 重置</button>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} />
      </div>
    </div>
  )
}