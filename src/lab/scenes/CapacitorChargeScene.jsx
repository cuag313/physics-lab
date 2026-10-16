import { useState, useRef, useEffect } from 'react'
import { eventToCanvas } from '../utils/pointerPos'
import SceneShell from '../ui/SceneShell'

/**
 * CapacitorChargeScene — 电容器充放电
 *
 * C = Q/U，τ = RC 时间常数
 * 充电：I = (U₀/R)·e^(-t/τ)，U_C = U₀·(1 - e^(-t/τ))
 * 放电：I = -(U₀/R)·e^(-t/τ)，U_C = U₀·e^(-t/τ)
 *
 * Step1: 充电过程 — 电流指数衰减，电压指数上升，约 5τ 达稳态
 * Step2: 放电过程 — 电流反向指数衰减，电压指数下降
 * Step3: RC 时间常数 — τ=RC，调节 C/R 观察充放电快慢
 */
export default function CapacitorChargeScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,
    switchClosed: false,
    mode: 'charge', // 'charge' | 'discharge'
    capacitance: 100, // μF
    resistance: 10,   // kΩ
    voltage: 12,      // V
    t: 0,             // 通电时间 s
    data: [],         // 曲线数据
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
        s.t += dt
        const tau = s.capacitance * 1e-6 * s.resistance * 1e3
        const maxI = (s.voltage / s.resistance / 1000) * 1000
        let I, U, Q
        if (s.mode === 'charge') {
          I = maxI * Math.exp(-s.t / tau)
          U = s.voltage * (1 - Math.exp(-s.t / tau))
          Q = s.capacitance * s.voltage * (1 - Math.exp(-s.t / tau)) / 1000
        } else {
          I = -maxI * Math.exp(-s.t / tau)
          U = s.voltage * Math.exp(-s.t / tau)
          Q = s.capacitance * s.voltage * Math.exp(-s.t / tau) / 1000
        }
        if (s.data.length < 600) s.data.push({ t: s.t, I, U, Q })
      }
      render(R)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  // 物理量
  function capInfo(s) {
    const tau = s.capacitance * 1e-6 * s.resistance * 1e3 // 秒
    const maxI = s.voltage / s.resistance / 1000 * 1000 // mA
    const etau = s.switchClosed ? s.t / tau : 0
    let I, U, Q
    if (s.mode === 'charge') {
      I = maxI * Math.exp(-etau)
      U = s.voltage * (1 - Math.exp(-etau))
      Q = s.capacitance * s.voltage * (1 - Math.exp(-etau)) / 1000
    } else {
      I = -maxI * Math.exp(-etau)
      U = s.voltage * Math.exp(-etau)
      Q = s.capacitance * s.voltage * Math.exp(-etau) / 1000
    }
    return { tau, maxI, I, U, Q, etau }
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
    const info = capInfo(s)

    // 顶部步骤标签
    const labels = ['① 充电过程', '② 放电过程', '③ RC 时间常数']
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
          S.current.step = i + 1; S.current.t = 0; S.current.data = []
          S.current.switchClosed = false
          S.current.mode = i <= 0 ? 'charge' : 'discharge'
          setStep(i + 1); forceUpdate(n => n + 1)
        }
      })
    }
    ctx.textBaseline = 'alphabetic'

    const subs = {
      1: '闭合开关充电，观察 I 指数衰减、U_C 指数上升，约 5τ 达稳态',
      2: '断开电源后放电，观察 I 反向衰减、U_C 指数下降',
      3: '调节 C 或 R 改变 τ=RC，观察充放电快慢变化',
    }
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(subs[s.step], W / 2, 52)
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('🎯 实验目的：观察电容器充放电规律，理解 C=Q/U 和 τ=RC 时间常数', W / 2, 70)

    // ─── 电路图（左上）───
    const cx = W * 0.10, cy = H * 0.12
    drawCircuit(ctx, cx, cy, s, info)

    // ─── 曲线图（右侧）───
    const gx = W * 0.32, gy = 80, gw = W * 0.64, gh = H * 0.42
    drawCurveGraph(ctx, gx, gy, gw, gh, s, info)

    // ─── 参数调节（底部）───
    const barY = H - 26
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'

    ctx.fillStyle = '#1565C0'; ctx.fillText(`C=${s.capacitance}μF`, 55, barY)
    drawMiniSlider(ctx, 105, barY, 70, (s.capacitance - 10) / 990, (r) => {
      S.current.capacitance = Math.round(10 + r * 990)
      S.current.t = 0; S.current.data = []; forceUpdate(n => n + 1)
    })

    ctx.fillStyle = '#FF9800'; ctx.fillText(`R=${s.resistance}kΩ`, 190, barY)
    drawMiniSlider(ctx, 245, barY, 70, (s.resistance - 1) / 99, (r) => {
      S.current.resistance = Math.round(1 + r * 99)
      S.current.t = 0; S.current.data = []; forceUpdate(n => n + 1)
    })

    ctx.fillStyle = '#E53935'; ctx.fillText(`U=${s.voltage}V`, 330, barY)
    drawMiniSlider(ctx, 375, barY, 60, (s.voltage - 1) / 23, (r) => {
      S.current.voltage = Math.round(1 + r * 23)
      S.current.t = 0; S.current.data = []; forceUpdate(n => n + 1)
    })

    ctx.fillStyle = '#2E7D32'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`τ=RC=${(info.tau * 1000).toFixed(0)}ms`, 455, barY)
    ctx.fillStyle = '#1565C0'
    ctx.fillText(`t=${(s.t * 1000).toFixed(0)}ms`, 545, barY)
    ctx.textBaseline = 'alphabetic'

    // ─── 充放电切换按钮 ───
    const btnY = H * 0.55
    ctx.fillStyle = s.mode === 'charge' ? '#4CAF50' : '#FF9800'
    ctx.beginPath(); ctx.roundRect(50, btnY, 70, 26, 5); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(s.mode === 'charge' ? '⚡ 充电' : '🔋 放电', 85, btnY + 8)
    canvasRef.current._clickAreas.push({
      x: 50, y: btnY, w: 70, h: 26,
      onClick: () => {
        S.current.mode = S.current.mode === 'charge' ? 'discharge' : 'charge'
        S.current.t = 0; S.current.data = []; S.current.switchClosed = false
        forceUpdate(n => n + 1)
      }
    })
    ctx.textBaseline = 'alphabetic'

    // ─── 实时数据 ───
    const dy = H * 0.58
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText(`I = ${Math.abs(info.I).toFixed(2)} mA`, 50, dy)
    ctx.fillText(`U_C = ${info.U.toFixed(2)} V`, 50, dy + 20)
    ctx.fillText(`Q = ${info.Q.toFixed(2)} mC`, 50, dy + 40)
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'
    ctx.fillText(`C = ${s.capacitance}μF  R = ${s.resistance}kΩ`, 50, dy + 64)
    ctx.fillText(`τ = ${(info.tau * 1000).toFixed(0)}ms  5τ = ${(info.tau * 5000).toFixed(0)}ms`, 50, dy + 80)

    // 右侧面板
    drawRightPanel(ctx, W * 0.56, H * 0.55, W - W * 0.56 - 25, H - H * 0.55 - 35, s, info)
  }

  // ─── 电路图 ───
  function drawCircuit(ctx, cx, cy, s, _info) {
    const on = s.switchClosed
    const wc = on ? '#1565C0' : '#999'
    const isCharge = s.mode === 'charge'

    // 电池（充电模式）
    if (isCharge) {
      ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.roundRect(cx, cy + 30, 12, 30, 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('+', cx + 6, cy + 26); ctx.fillText('−', cx + 6, cy + 67)
      ctx.fillStyle = '#555'; ctx.font = '8px sans-serif'
      ctx.fillText(`${s.voltage}V`, cx + 6, cy + 76)
    }

    // 导线
    ctx.strokeStyle = wc; ctx.lineWidth = 2
    // 上边
    ctx.beginPath(); ctx.moveTo(cx + 6, cy + 30); ctx.lineTo(cx + 6, cy + 10)
    ctx.lineTo(cx + 60, cy + 10); ctx.stroke()
    // 电阻
    ctx.fillStyle = '#FFF9C4'; ctx.strokeStyle = '#F9A825'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.roundRect(cx + 60, cy + 3, 35, 14, 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(`R=${s.resistance}kΩ`, cx + 78, cy + 13)
    // 右上到开关
    ctx.strokeStyle = wc; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(cx + 95, cy + 10); ctx.lineTo(cx + 120, cy + 10); ctx.stroke()
    // 开关
    const swX = cx + 120, swY = cy + 10
    ctx.fillStyle = '#666'
    ctx.beginPath(); ctx.arc(swX, swY, 3, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(swX + 20, swY, 3, 0, Math.PI * 2); ctx.fill()
    if (on) {
      ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(swX, swY); ctx.lineTo(swX + 20, swY); ctx.stroke()
    } else {
      ctx.strokeStyle = '#F44336'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(swX, swY); ctx.lineTo(swX + 10, swY - 12); ctx.stroke()
    }
    ctx.lineCap = 'butt'
    canvasRef.current._clickAreas.push({ x: swX - 6, y: swY - 18, w: 32, h: 24, onClick: () => { S.current.switchClosed = !S.current.switchClosed; S.current.t = 0; S.current.data = []; forceUpdate(n => n + 1) } })
    // 电容
    ctx.strokeStyle = wc; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(swX + 20, swY); ctx.lineTo(swX + 20, cy + 35); ctx.stroke()
    ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(swX + 12, cy + 35); ctx.lineTo(swX + 28, cy + 35); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(swX + 12, cy + 41); ctx.lineTo(swX + 28, cy + 41); ctx.stroke()
    // 回路
    ctx.strokeStyle = wc; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(swX + 20, cy + 41); ctx.lineTo(swX + 20, cy + 55)
    ctx.lineTo(cx + 6, cy + 55); ctx.lineTo(cx + 6, cy + 60); ctx.stroke()
    // 电容标签
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText(`C=${s.capacitance}μF`, swX + 30, cy + 40)

    // 标注
    ctx.fillStyle = '#5D4037'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(isCharge ? '充电回路' : '放电回路', cx + 65, cy + 75)
  }

  // ─── 曲线图 ───
  function drawCurveGraph(ctx, gx, gy, gw, gh, s, info) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ddd'
    ctx.beginPath(); ctx.roundRect(gx - 5, gy - 5, gw + 10, gh + 10, 6); ctx.fill(); ctx.stroke()

    const margin = { top: 20, right: 15, bottom: 30, left: 40 }
    const pw = gw - margin.left - margin.right
    const ph = gh - margin.top - margin.bottom
    const ox = gx + margin.left, oy = gy + margin.top

    // 坐标轴
    ctx.strokeStyle = '#999'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, oy + ph); ctx.lineTo(ox + pw, oy + ph); ctx.stroke()

    // 轴标签
    ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('t (ms)', ox + pw / 2, gy + gh - 5)
    ctx.save(); ctx.translate(gx + 8, oy + ph / 2); ctx.rotate(-Math.PI / 2)
    ctx.fillText('I(mA) / U(V)', 0, 0); ctx.restore()

    const maxT = info.tau * 5
    const maxI = info.maxI
    const toX = t => ox + Math.min(t / maxT, 1) * pw
    const toY = v => oy + ph - (Math.abs(v) / Math.max(maxI, s.voltage)) * ph

    // 网格
    ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 0.8
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#999'
    for (let i = 0; i <= 4; i++) {
      const t = maxT * i / 4
      ctx.textAlign = 'center'
      ctx.fillText((t * 1000).toFixed(0), toX(t), oy + ph + 14)
      ctx.beginPath(); ctx.moveTo(toX(t), oy); ctx.lineTo(toX(t), oy + ph); ctx.stroke()
    }
    for (let i = 0; i <= 4; i++) {
      const v = Math.max(maxI, s.voltage) * i / 4
      ctx.textAlign = 'right'
      ctx.fillText(v.toFixed(1), ox - 5, toY(v) + 3)
      ctx.beginPath(); ctx.moveTo(ox, toY(v)); ctx.lineTo(ox + pw, toY(v)); ctx.stroke()
    }

    // I(t) 曲线（蓝色）
    ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 2
    ctx.beginPath()
    s.data.forEach((d, idx) => {
      const x = toX(d.t), y = toY(d.I)
      if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    })
    ctx.stroke()
    ctx.fillStyle = '#1565C0'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('I(t) 电流', ox + 6, oy + 12)

    // U(t) 曲线（红色）
    ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2
    ctx.beginPath()
    s.data.forEach((d, idx) => {
      const x = toX(d.t), y = toY(d.U)
      if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    })
    ctx.stroke()
    ctx.fillStyle = '#E53935'; ctx.font = '10px sans-serif'
    ctx.fillText('U(t) 电压', ox + 6, oy + 26)

    // τ 标记线
    if (info.tau < maxT) {
      ctx.strokeStyle = 'rgba(156,39,176,0.3)'; ctx.lineWidth = 1; ctx.setLineDash([4, 3])
      ctx.beginPath(); ctx.moveTo(toX(info.tau), oy); ctx.lineTo(toX(info.tau), oy + ph); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#9C27B0'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('τ', toX(info.tau), oy - 2)
    }
    // 5τ 标记线
    if (5 * info.tau < maxT) {
      ctx.strokeStyle = 'rgba(156,39,176,0.2)'; ctx.lineWidth = 1; ctx.setLineDash([4, 3])
      ctx.beginPath(); ctx.moveTo(toX(5 * info.tau), oy); ctx.lineTo(toX(5 * info.tau), oy + ph); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#9C27B0'; ctx.font = '9px sans-serif'
      ctx.fillText('5τ', toX(5 * info.tau), oy - 2)
    }

    // 当前时间点
    if (s.switchClosed && s.t > 0) {
      const cx2 = toX(s.t)
      ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(cx2, oy); ctx.lineTo(cx2, oy + ph); ctx.stroke()
    }
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

  // ─── 右侧面板 ───
  function drawRightPanel(ctx, x, y, w, h, s, _info) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('🎯 电容器充放电', x + 12, y + 12)

    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('C = Q/U    τ = RC', x + 12, y + 32)
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444'
    ctx.fillText(`充电: I=(U/R)e^(-t/τ)  U_C=U(1-e^(-t/τ))`, x + 12, y + 50)
    ctx.fillText(`放电: I=-(U/R)e^(-t/τ)  U_C=U·e^(-t/τ)`, x + 12, y + 66)
    ctx.fillText(`约 5τ 达到稳态（99.3%）`, x + 12, y + 82)

    // 操作步骤
    let ky = y + 100
    const guideSteps = s.step === 1
      ? ['① 调好 C、R、U 参数', '② 闭合开关开始充电', '③ 观察 I 衰减、U_C 上升', '④ 约 5τ 后电流趋近 0']
      : s.step === 2
        ? ['① 充满后断开电源', '② 观察 I 反向衰减', '③ U_C 指数下降至 0', '④ 放电时间同样约 5τ']
        : ['① 改变 C 或 R 观察 τ 变化', '② τ 越大充放电越慢', '③ 记录 τ 与 C、R 的关系', '④ 结论：τ = RC']
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('📋 操作步骤', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#5D4037'
    for (let i = 0; i < guideSteps.length; i++) ctx.fillText(guideSteps[i], x + 12, ky + i * 12)
    ky += guideSteps.length * 12 + 6

    // 注意事项
    ctx.fillStyle = '#C62828'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('⚠ 注意事项', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#B71C1C'
    const notes = s.step === 1
      ? ['• 充电时电流从大到小，电压从小到大', '• 电容器隔直流通交流', '• τ=RC 决定充电快慢']
      : s.step === 2
        ? ['• 放电电流方向与充电相反', '• 放电时电容器相当于电源', '• 能量储存在电场中：E=½CU²']
        : ['• C 越大或 R 越大，τ 越大', '• τ 越大充放电过程越慢', '• 5τ≈99.3% 认为达到稳态']
    for (let i = 0; i < notes.length; i++) ctx.fillText(notes[i], x + 12, ky + i * 12)
    ky += notes.length * 12 + 6

    // 数据表
    if (s.records.length > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('📊 实验数据', x + 12, ky); ky += 14
      ctx.fillStyle = '#FFB74D'
      ctx.fillRect(x + 12, ky, w - 24, 16)
      ctx.fillStyle = '#333'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      const c1 = x + 26, c2 = x + 55, c3 = x + 90, c4 = x + 135
      ctx.fillText('#', c1, ky + 2); ctx.fillText('C(μF)', c2, ky + 2); ctx.fillText('R(kΩ)', c3, ky + 2); ctx.fillText('τ(ms)', c4, ky + 2)
      ky += 14
      for (let i = 0; i < s.records.length; i++) {
        const r = s.records[i]
        if (i % 2 === 0) { ctx.fillStyle = '#FFF8E1'; ctx.fillRect(x + 12, ky, w - 24, 13) }
        ctx.fillStyle = '#333'; ctx.font = '9px monospace'; ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), c1, ky + 1); ctx.fillText(String(r.C), c2, ky + 1)
        ctx.fillText(String(r.R), c3, ky + 1); ctx.fillText(r.tau.toFixed(0), c4, ky + 1)
        ky += 13
      }
      ctx.textAlign = 'left'
    }

    // 按钮
    const btnY = y + h - 38
    const btnW = 62, btnH = 24, gap = 6
    const bx = x + 12
    ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'
    ctx.beginPath(); ctx.roundRect(bx, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('📝 记录', bx + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({
      x: bx, y: btnY, w: btnW, h: btnH,
      onClick: () => { const s2 = S.current; const tau2 = s2.capacitance * 1e-6 * s2.resistance * 1e3; s2.records.push({ C: s2.capacitance, R: s2.resistance, tau: tau2 * 1000 }); forceUpdate(n => n + 1) }
    })
    ctx.fillStyle = '#FF9800'; ctx.strokeStyle = '#E65100'
    ctx.beginPath(); ctx.roundRect(bx + btnW + gap, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.fillText('🗑 清除', bx + btnW + gap + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({ x: bx + btnW + gap, y: btnY, w: btnW, h: btnH, onClick: () => { S.current.records = []; forceUpdate(n => n + 1) } })
    ctx.fillStyle = '#9E9E9E'; ctx.strokeStyle = '#616161'
    ctx.beginPath(); ctx.roundRect(bx + (btnW + gap) * 2, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.fillText('↺ 重置', bx + (btnW + gap) * 2 + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({
      x: bx + (btnW + gap) * 2, y: btnY, w: btnW, h: btnH,
      onClick: () => { S.current.t = 0; S.current.data = []; S.current.records = []; S.current.switchClosed = false; forceUpdate(n => n + 1) }
    })
    ctx.textBaseline = 'alphabetic'
  }

  // ================================================================
  //  Tab 2：自己动手
  // ================================================================
  function renderBuilder(ctx, W, H) {
    const s = S.current
    const palW = 150, palX = W - palW - 10

    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#e0e0e0'
    ctx.beginPath(); ctx.roundRect(10, 10, palX - 25, H - 20, 8); ctx.fill(); ctx.stroke()

    for (const wire of s.wires) {
      const c1 = s.components.find(c => c.id === wire.from.compId)
      const c2 = s.components.find(c => c.id === wire.to.compId)
      if (!c1 || !c2) continue
      const p1 = getTermPos(c1, wire.from.portIndex), p2 = getTermPos(c2, wire.to.portIndex)
      ctx.strokeStyle = wire.color || s.wireColor; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke(); ctx.lineCap = 'butt'
    }
    if (s.connecting) {
      const c1 = s.components.find(c => c.id === s.connecting.compId)
      if (c1) { const p1 = getTermPos(c1, s.connecting.portIndex); ctx.strokeStyle = '#FF9800'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(s.connecting.mx, s.connecting.my); ctx.stroke(); ctx.setLineDash([]) }
    }
    for (const comp of s.components) drawComp(ctx, comp)

    const bx = 22, by = H - 130, bw = palX - 50
    ctx.fillStyle = 'rgba(255,252,240,0.95)'; ctx.strokeStyle = '#ddd'
    ctx.beginPath(); ctx.roundRect(bx, by, bw, s._guideOpen ? 118 : 36, 6); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText('📋 操作说明', bx + 10, by + 18)
    ctx.textAlign = 'right'; ctx.fillText(s._guideOpen ? '收起 ▲' : '展开 ▼', bx + bw - 10, by + 18)
    canvasRef.current._clickAreas.push({ x: bx - 5, y: by - 3, w: bw + 10, h: 42, onClick: () => { s._guideOpen = !s._guideOpen; forceUpdate(n => n + 1) } })
    if (s._guideOpen) { ctx.textAlign = 'left'; ctx.font = '10px sans-serif'; ['① 拖入器材', '② 点接线柱连线', '③ 双击开关通断', '④ 右键删除', '⑤ 观察充放电曲线'].forEach((l, i) => ctx.fillText(l, bx + 10, by + 40 + i * 15)) }
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
      { type: 'battery', name: '电源' }, { type: 'switch', name: '开关' },
      { type: 'capacitor', name: '电容器' }, { type: 'resistor', name: '电阻 R' },
      { type: 'voltmeter', name: '电压表 V' }, { type: 'ammeter', name: '电流表 A（干扰）' },
      { type: 'bulb', name: '小灯泡（干扰）' }, { type: 'rheostat', name: '滑动变阻器（干扰）' },
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
    ctx.fillText('导线颜色：', x + 10, palColorBase + 2)
    const colors = [['#F44336', '红'], ['#FFC107', '黄'], ['#4CAF50', '绿']]
    for (let i = 0; i < 3; i++) {
      const cy = palColorBase + 18 + i * 20
      ctx.fillStyle = colors[i][0]; ctx.fillRect(x + 10, cy, 36, 14)
      ctx.strokeStyle = s.wireColor === colors[i][0] ? '#333' : '#ccc'; ctx.strokeRect(x + 10, cy, 36, 14)
      ctx.fillStyle = '#333'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText(colors[i][1], x + 52, cy + 2)
      canvasRef.current._palAreas.push({ x: x + 8, y: cy - 2, w: w - 16, h: 18, action: 'color', color: colors[i][0] })
    }
    ctx.textBaseline = 'alphabetic'
  }

  function drawPaletteIcon(ctx, x, y, type) {
    ctx.save(); ctx.translate(x, y)
    if (type === 'battery') { ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'; ctx.fillRect(-10, -7, 20, 14); ctx.strokeRect(-10, -7, 20, 14) }
    else if (type === 'switch') { ctx.strokeStyle = '#666'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(5, -4); ctx.stroke(); ctx.fillStyle = '#666'; ctx.beginPath(); ctx.arc(-7, 0, 2, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(7, 0, 2, 0, Math.PI * 2); ctx.fill() }
    else if (type === 'capacitor') { ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-3, -8); ctx.lineTo(-3, 8); ctx.stroke(); ctx.beginPath(); ctx.moveTo(3, -8); ctx.lineTo(3, 8); ctx.stroke() }
    else if (type === 'resistor') { ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'; ctx.fillRect(-9, -4, 18, 8); ctx.strokeRect(-9, -4, 18, 8) }
    else if (type === 'voltmeter') { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#1565C0'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('V', 0, 2) }
    else if (type === 'ammeter') { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#E53935'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('A', 0, 2) }
    else if (type === 'bulb') { ctx.fillStyle = '#FFF9C4'; ctx.strokeStyle = '#F9A825'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, -1, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke() }
    else if (type === 'rheostat') { ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'; ctx.fillRect(-10, -4, 20, 8); ctx.strokeRect(-10, -4, 20, 8) }
    ctx.restore()
  }

  function getTermPos(comp, pi) {
    if (comp.type === 'battery') return { x: comp.x + (pi === 0 ? -18 : 18), y: comp.y }
    if (comp.type === 'switch') return { x: comp.x + (pi === 0 ? -15 : 15), y: comp.y }
    if (comp.type === 'capacitor') return { x: comp.x + (pi === 0 ? -12 : 12), y: comp.y }
    if (comp.type === 'resistor') return { x: comp.x + (pi === 0 ? -14 : 14), y: comp.y }
    if (comp.type === 'voltmeter') return { x: comp.x + (pi === 0 ? -16 : 16), y: comp.y }
    if (comp.type === 'ammeter') return { x: comp.x + (pi === 0 ? -16 : 16), y: comp.y }
    if (comp.type === 'bulb') return { x: comp.x + (pi === 0 ? -14 : 14), y: comp.y }
    if (comp.type === 'rheostat') return { x: comp.x + (pi === 0 ? -25 : 25), y: comp.y }
    return { x: comp.x, y: comp.y }
  }

  function drawComp(ctx, comp) {
    ctx.save(); ctx.translate(comp.x, comp.y)
    if (comp.type === 'battery') { ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'; ctx.beginPath(); ctx.roundRect(-18, -11, 36, 22, 3); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('12V', 0, 3) }
    else if (comp.type === 'switch') { ctx.strokeStyle = comp.closed ? '#4CAF50' : '#F44336'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(10, comp.closed ? 0 : -10); ctx.stroke(); ctx.lineCap = 'butt'; ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(-15, 0, 3, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(15, 0, 3, 0, Math.PI * 2); ctx.fill() }
    else if (comp.type === 'capacitor') { ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-4, -10); ctx.lineTo(-4, 10); ctx.stroke(); ctx.beginPath(); ctx.moveTo(4, -10); ctx.lineTo(4, 10); ctx.stroke() }
    else if (comp.type === 'resistor') { ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(-14, -8, 28, 16, 3); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#333'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('R', 0, 0) }
    else if (comp.type === 'voltmeter') { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#1565C0'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('V', 0, 0) }
    else if (comp.type === 'ammeter') { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#E53935'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('A', 0, 0) }
    else if (comp.type === 'bulb') { ctx.fillStyle = '#FFF9C4'; ctx.strokeStyle = '#F9A825'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke() }
    else if (comp.type === 'rheostat') { ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'; ctx.beginPath(); ctx.roundRect(-25, -10, 50, 20, 3); ctx.fill(); ctx.stroke() }
    const t1 = getTermPos({ ...comp, x: 0, y: 0 }, 0), t2 = getTermPos({ ...comp, x: 0, y: 0 }, 1)
    for (const t of [t1, t2]) { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#666'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(t.x, t.y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke() }
    ctx.restore()
  }

  // 交互
  function getPos(e) { return eventToCanvas(canvasRef.current, e) }
  function findTerm(x, y) { for (const c of S.current.components) { for (let i = 0; i < 2; i++) { const t = getTermPos(c, i); if (Math.abs(x - t.x) < 10 && Math.abs(y - t.y) < 10) return { compId: c.id, portIndex: i } } } return null }
  function handleMouseDown(e) { if (e.button !== 0) return; const s = S.current; const { x, y } = getPos(e); if (s.tab === 1) { for (const a of canvasRef.current._clickAreas) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(x, y); return } } return } for (const a of canvasRef.current._clickAreas || []) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(); return } } for (const a of canvasRef.current._palAreas) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { if (a.action === 'color') { s.wireColor = a.color; forceUpdate(n => n + 1); return } if (a.type) { s.components.push({ id: s.nextId++, type: a.type, x, y, closed: a.type === 'switch' ? false : true, props: {} }); s.dragId = s.nextId - 1; forceUpdate(n => n + 1); return } } } const term = findTerm(x, y); if (term) { s.connecting = { ...term, mx: x, my: y }; forceUpdate(n => n + 1); return } for (const c of s.components) { if (Math.abs(x - c.x) < 30 && Math.abs(y - c.y) < 25) { s.dragId = c.id; s.dragOffX = x - c.x; s.dragOffY = y - c.y; forceUpdate(n => n + 1); return } } }
  function handleMouseMove(e) { const s = S.current; const { x, y } = getPos(e); if (s.connecting) { s.connecting.mx = x; s.connecting.my = y; forceUpdate(n => n + 1); return } if (s.dragId == null) return; const c = s.components.find(c => c.id === s.dragId); if (c) { c.x = x - s.dragOffX; c.y = y - s.dragOffY; forceUpdate(n => n + 1) } }
  function handleMouseUp(e) { const s = S.current; const { x, y } = getPos(e); if (s.connecting) { const term = findTerm(x, y); if (term && !(term.compId === s.connecting.compId && term.portIndex === s.connecting.portIndex)) { const exists = s.wires.some(w => (w.from.compId === s.connecting.compId && w.from.portIndex === s.connecting.portIndex && w.to.compId === term.compId && w.to.portIndex === term.portIndex) || (w.to.compId === s.connecting.compId && w.to.portIndex === s.connecting.portIndex && w.from.compId === term.compId && w.from.portIndex === term.portIndex)); if (!exists) s.wires.push({ id: s.wires.length + 1, from: { ...s.connecting }, to: term, color: s.wireColor }) } s.connecting = null; forceUpdate(n => n + 1); return } s.dragId = null }
  function handleDoubleClick(e) { const s = S.current; const { x, y } = getPos(e); const c = s.components.find(c => Math.abs(x - c.x) < 25 && Math.abs(y - c.y) < 25 && c.type === 'switch'); if (c) { c.closed = !c.closed; forceUpdate(n => n + 1) } }
  function handleContextMenu(e) { e.preventDefault(); const s = S.current; const { x, y } = getPos(e); const idx = s.components.findIndex(c => Math.abs(x - c.x) < 30 && Math.abs(y - c.y) < 25); if (idx >= 0) { const id = s.components[idx].id; s.components.splice(idx, 1); s.wires = s.wires.filter(w => w.from.compId !== id && w.to.compId !== id); forceUpdate(n => n + 1) } }

  return (
    <SceneShell
      title="电容器充放电"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t); forceUpdate(n => n + 1) }}
      tab1Label="📊 实验演示"
      tab2Label="🔧 自己动手"
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} />
    </SceneShell>
  )
}
