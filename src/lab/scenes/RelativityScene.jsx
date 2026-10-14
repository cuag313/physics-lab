import { useState, useRef, useEffect } from 'react'

/**
 * RelativityScene — 狭义相对论初步：时间膨胀与长度收缩
 *
 * γ = 1/√(1-v²/c²)（洛伦兹因子）
 * Δt = γ·Δt₀（时间膨胀）  L = L₀/γ（长度收缩）
 *
 * Step1: 时间膨胀 — 运动时钟走慢，Δt = γ·Δt₀
 * Step2: 长度收缩 — 运动方向长度收缩，L = L₀/γ
 * Step3: 质能方程 — E = γmc²，质量随速度增加
 */
export default function RelativityScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,
    switchClosed: false,
    beta: 0.5,      // v/c
    t: 0,
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
      const dt = Math.min((now - last) / 1000, 0.05); last = now
      const s = S.current
      if (s.switchClosed) s.t += dt
      render(R)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function relInfo(s) {
    const gamma = 1 / Math.sqrt(1 - s.beta * s.beta)
    return { gamma }
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

  function renderDemo(ctx, W, H) {
    const s = S.current
    const { gamma } = relInfo(s)

    const labels = ['① 时间膨胀', '② 长度收缩', '③ 质能方程']
    const bw = 115, bh = 28, gap = 8
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
        S.current.step = i + 1; S.current.records = []
        setStep(i + 1); forceUpdate(n => n + 1)
      } })
    }
    ctx.textBaseline = 'alphabetic'

    const subs = {
      1: '运动时钟走慢：Δt = γ·Δt₀，v→c 时时间膨胀越显著',
      2: '运动方向长度收缩：L = L₀/γ，v→c 时长度趋近0',
      3: 'E = γmc²，速度越大质量越大，加速越困难',
    }
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(subs[s.step], W / 2, 52)
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('🎯 实验目的：理解时间膨胀、长度收缩等相对论效应', W / 2, 70)

    // 相对论效应可视化
    drawRelativity(ctx, W * 0.10, 80, W * 0.44, H - 140, s, gamma)

    // γ 曲线
    const gx = W * 0.58, gy = 80, gw = W * 0.38, gh = H * 0.40
    drawGammaCurve(ctx, gx, gy, gw, gh, s)

    // 底部
    const barY = H - 26
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillStyle = '#1565C0'; ctx.fillText(`v/c = ${s.beta.toFixed(3)}`, 55, barY)
    drawMiniSlider(ctx, 120, barY, 120, s.beta / 0.999, (r) => {
      S.current.beta = Math.round(r * 0.999 * 1000) / 1000; forceUpdate(n => n + 1)
    })

    ctx.fillStyle = '#E53935'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`γ = ${gamma.toFixed(4)}`, 255, barY)

    if (s.step === 1) {
      ctx.fillStyle = '#FF6F00'
      ctx.fillText(`Δt = γ·Δt₀ = ${gamma.toFixed(2)}×Δt₀`, 355, barY)
    } else if (s.step === 2) {
      ctx.fillStyle = '#4CAF50'
      ctx.fillText(`L = L₀/γ = L₀×${(1/gamma).toFixed(4)}`, 355, barY)
    } else {
      ctx.fillStyle = '#9C27B0'
      ctx.fillText(`E = γmc² = ${gamma.toFixed(3)}mc²`, 355, barY)
    }
    ctx.textBaseline = 'alphabetic'

    drawRightPanel(ctx, W * 0.56, H * 0.55, W - W * 0.56 - 25, H - H * 0.55 - 35, s, gamma)
  }

  // 相对论效应可视化
  function drawRelativity(ctx, x, y, w, h, s, gamma) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ddd'
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()

    const cx = x + w / 2, cy = y + h / 2

    if (s.step === 1) {
      // 时间膨胀：两个时钟对比
      const stationaryClock = { x: cx - 80, y: cy - 40 }
      const movingClock = { x: cx + 80, y: cy - 40 }
      const time = s.t

      // 静止时钟
      drawClock(ctx, stationaryClock.x, stationaryClock.y, time, '#1565C0', 1)
      ctx.fillStyle = '#1565C0'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText('静止参考系', stationaryClock.x, stationaryClock.y + 52)

      // 运动时钟（慢）
      drawClock(ctx, movingClock.x, movingClock.y, time / gamma, '#E53935', 1)
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText(`运动参考系 (v=${s.beta.toFixed(2)}c)`, movingClock.x, movingClock.y + 52)

      // 时间差标注
      const diff = time * (1 - 1/gamma)
      ctx.fillStyle = '#FF9800'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(`时间差 Δτ = ${diff.toFixed(2)}s`, cx, cy + 90)

    } else if (s.step === 2) {
      // 长度收缩：两根尺子对比
      const stationaryL = 200
      const movingL = 200 / gamma

      // 静止尺子
      ctx.fillStyle = '#1565C0'
      ctx.fillRect(cx - stationaryL/2, cy - 40, stationaryL, 20)
      ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(`L₀ = ${stationaryL.toFixed(0)}m`, cx, cy - 30)
      ctx.fillStyle = '#1565C0'; ctx.font = 'bold 10px sans-serif'; ctx.textBaseline = 'top'
      ctx.fillText('静止参考系', cx, cy - 15)

      // 运动尺子（收缩）
      ctx.fillStyle = '#E53935'
      ctx.fillRect(cx - movingL/2, cy + 30, movingL, 20)
      ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(`L = ${movingL.toFixed(1)}m`, cx, cy + 40)
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 10px sans-serif'; ctx.textBaseline = 'top'
      ctx.fillText(`运动参考系 (v=${s.beta.toFixed(2)}c)`, cx, cy + 55)

      // 收缩比例
      ctx.fillStyle = '#FF9800'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(`收缩比 = ${(movingL/stationaryL).toFixed(4)}`, cx, cy + 95)

    } else {
      // 质能方程
      const restM = 1
      const relM = gamma * restM

      ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText('E = γmc²', cx, y + 30)

      ctx.font = '12px sans-serif'; ctx.fillStyle = '#555'
      ctx.fillText(`γ = ${gamma.toFixed(4)}`, cx, y + 55)
      ctx.fillText(`m₀ = ${restM} (静止质量)`, cx, y + 75)
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 12px sans-serif'
      ctx.fillText(`m = γm₀ = ${relM.toFixed(4)}`, cx, y + 95)

      // 能量条形图
      const barY = y + h * 0.55
      const barW = w * 0.7
      ctx.fillStyle = '#eee'
      ctx.fillRect(cx - barW/2, barY, barW, 25)
      const filled = Math.min(gamma / 10, 1) * barW
      ctx.fillStyle = '#E53935'
      ctx.fillRect(cx - barW/2, barY, filled, 25)
      ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(`E = ${gamma.toFixed(2)}mc²`, cx, barY + 12)

      ctx.fillStyle = '#333'; ctx.font = '10px sans-serif'; ctx.textBaseline = 'top'
      ctx.fillText('速度越大质量越大，加速越困难', cx, barY + 35)
      ctx.textBaseline = 'alphabetic'
    }
  }

  // 时钟绘制
  function drawClock(ctx, x, y, time, color, _scale) {
    const r = 35
    ctx.fillStyle = '#fff'; ctx.strokeStyle = color; ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke()

    // 刻度
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 - Math.PI / 2
      const ix1 = x + Math.cos(angle) * (r - 6)
      const iy1 = y + Math.sin(angle) * (r - 6)
      const ix2 = x + Math.cos(angle) * (r - 2)
      const iy2 = y + Math.sin(angle) * (r - 2)
      ctx.strokeStyle = '#999'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(ix1, iy1); ctx.lineTo(ix2, iy2); ctx.stroke()
    }

    // 时针（秒）
    const secAngle = (time % 60) / 60 * Math.PI * 2 - Math.PI / 2
    ctx.strokeStyle = color; ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(secAngle) * (r - 12), y + Math.sin(secAngle) * (r - 12)); ctx.stroke()

    // 时间显示
    ctx.fillStyle = color; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(time.toFixed(1), x, y + 18)
    ctx.textBaseline = 'alphabetic'
  }

  // γ 曲线图
  function drawGammaCurve(ctx, gx, gy, gw, gh, s) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ddd'
    ctx.beginPath(); ctx.roundRect(gx - 5, gy - 5, gw + 10, gh + 10, 8); ctx.fill(); ctx.stroke()

    const margin = { top: 25, right: 20, bottom: 35, left: 45 }
    const pw = gw - margin.left - margin.right
    const ph = gh - margin.top - margin.bottom
    const ox = gx + margin.left, oy = gy + margin.top

    // 坐标轴
    ctx.strokeStyle = '#999'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, oy + ph); ctx.lineTo(ox + pw, oy + ph); ctx.stroke()

    // 轴标签
    ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('v/c', ox + pw / 2, gy + gh - 6)
    ctx.save(); ctx.translate(gx + 10, oy + ph / 2); ctx.rotate(-Math.PI / 2)
    ctx.fillText('γ', 0, 0); ctx.restore()

    // 网格
    ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 0.8
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#999'
    for (let b = 0; b <= 1; b += 0.2) {
      const px = ox + b * pw
      ctx.textAlign = 'center'; ctx.fillText(b.toFixed(1), px, oy + ph + 14)
      ctx.beginPath(); ctx.moveTo(px, oy); ctx.lineTo(px, oy + ph); ctx.stroke()
    }
    for (let g = 1; g <= 10; g += 3) {
      const py = oy + ph - ((g - 1) / 9) * ph
      ctx.textAlign = 'right'; ctx.fillText(String(g), ox - 5, py + 3)
      ctx.beginPath(); ctx.moveTo(ox, py); ctx.lineTo(ox + pw, py); ctx.stroke()
    }

    // γ 曲线
    ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2; ctx.beginPath()
    for (let b = 0; b <= 0.999; b += 0.005) {
      const g = 1 / Math.sqrt(1 - b * b)
      const px = ox + b * pw
      const py = oy + ph - (Math.min(g, 10) - 1) / 9 * ph
      if (b === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.stroke()

    // 当前点
    const gamma = 1 / Math.sqrt(1 - s.beta * s.beta)
    const curX = ox + s.beta * pw
    const curY = oy + ph - (Math.min(gamma, 10) - 1) / 9 * ph
    const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 300)
    ctx.fillStyle = `rgba(229,57,53,${pulse})`
    ctx.beginPath(); ctx.arc(curX, curY, 6, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke()

    // 标注
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('γ = 1/√(1-v²/c²)', ox + 6, oy + 6)
  }

  function drawMiniSlider(ctx, x, y, w, ratio, onChange) {
    ctx.strokeStyle = '#bbb'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke()
    const kx = x + Math.max(0, Math.min(1, ratio)) * w
    ctx.fillStyle = '#FF9800'; ctx.beginPath(); ctx.arc(kx, y, 6, 0, Math.PI * 2); ctx.fill()
    canvasRef.current._clickAreas.push({ x: x - 8, y: y - 14, w: w + 16, h: 28, onClick: (mx) => onChange(Math.max(0, Math.min(1, (mx - x) / w))) })
  }

  function drawRightPanel(ctx, x, y, w, h, s, gamma) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('🎯 狭义相对论', x + 12, y + 12)
    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('γ = 1/√(1-v²/c²)', x + 12, y + 32)
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444'
    ctx.fillText(`v = ${s.beta.toFixed(3)}c`, x + 12, y + 50)
    ctx.fillText(`γ = ${gamma.toFixed(4)}`, x + 12, y + 64)

    let ky = y + 82
    const guideSteps = s.step === 1
      ? ['① 调节 v/c 滑条', '② 观察两个时钟对比', '③ 运动时钟走慢', '④ Δt = γ·Δt₀']
      : s.step === 2
        ? ['① 观察两根尺子对比', '② 运动方向收缩', '③ L = L₀/γ', '④ v→c 时 L→0']
        : ['① E = γmc²', '② v↑ → γ↑ → m↑', '③ 加速越接近光速越困难', '④ 需要无穷能量才能到达光速']
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('📋 操作步骤', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#5D4037'
    for (let i = 0; i < guideSteps.length; i++) ctx.fillText(guideSteps[i], x + 12, ky + i * 12)
    ky += guideSteps.length * 12 + 6

    ctx.fillStyle = '#C62828'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('⚠ 注意事项', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#B71C1C'
    const notes = s.step === 1
      ? ['• 只在高速时显著', '• 低速时 γ≈1，效应可忽略', '• 光速不可超越']
      : s.step === 2
        ? ['• 只在运动方向收缩', '• 垂直方向不收缩', '• 实验中已验证（μ子）']
        : ['• E=mc²是质能等价', '• 静止时也有能量 mc²', '• 核能就来自质量亏损']
    for (let i = 0; i < notes.length; i++) ctx.fillText(notes[i], x + 12, ky + i * 12)
    ky += notes.length * 12 + 6

    if (s.records.length > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('📊 实验数据', x + 12, ky); ky += 14
      ctx.fillStyle = '#FFB74D'; ctx.fillRect(x + 12, ky, w - 24, 16)
      ctx.fillStyle = '#333'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      const c1 = x + 22, c2 = x + 65, c3 = x + 135
      ctx.fillText('#', c1, ky + 2); ctx.fillText('v/c', c2, ky + 2); ctx.fillText('γ', c3, ky + 2)
      ky += 14
      for (let i = 0; i < s.records.length; i++) {
        const r = s.records[i]
        if (i % 2 === 0) { ctx.fillStyle = '#FFF8E1'; ctx.fillRect(x + 12, ky, w - 24, 13) }
        ctx.fillStyle = '#333'; ctx.font = '9px monospace'; ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), c1, ky + 1); ctx.fillText(r.b, c2, ky + 1); ctx.fillText(r.g, c3, ky + 1)
        ky += 13
      }
      ctx.textAlign = 'left'
    }

    const btnY = y + h - 38, btnW = 62, btnH = 24, gap = 6, bx = x + 12
    ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'
    ctx.beginPath(); ctx.roundRect(bx, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('📝 记录', bx + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({ x: bx, y: btnY, w: btnW, h: btnH, onClick: () => {
      const s2 = S.current; const inf = relInfo(s2)
      s2.records.push({ b: s2.beta.toFixed(3), g: inf.gamma.toFixed(4) })
      forceUpdate(n => n + 1)
    } })
    ctx.fillStyle = '#FF9800'; ctx.strokeStyle = '#E65100'
    ctx.beginPath(); ctx.roundRect(bx + btnW + gap, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.fillText('🗑 清除', bx + btnW + gap + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({ x: bx + btnW + gap, y: btnY, w: btnW, h: btnH, onClick: () => { S.current.records = []; forceUpdate(n => n + 1) } })
    ctx.fillStyle = '#9E9E9E'; ctx.strokeStyle = '#616161'
    ctx.beginPath(); ctx.roundRect(bx + (btnW + gap) * 2, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.fillText('↺ 重置', bx + (btnW + gap) * 2 + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({ x: bx + (btnW + gap) * 2, y: btnY, w: btnW, h: btnH, onClick: () => {
      S.current.beta = 0.5; S.current.t = 0; S.current.records = []; S.current.switchClosed = false
      forceUpdate(n => n + 1)
    } })
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
    if (s._guideOpen) { ctx.textAlign = 'left'; ctx.font = '10px sans-serif'; ['① 拖入器材到画布', '② 搭建参考系模型', '③ 观察相对论效应', '④ 右键删除器材'].forEach((l, i) => ctx.fillText(l, bx + 10, by + 40 + i * 15)) }
    ctx.textBaseline = 'alphabetic'
    drawPalette(ctx, palX, 10, palW, H - 20)
  }

  function drawPalette(ctx, x, y, w, h) {
    ctx.fillStyle = '#fafafa'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('近代物理器材', x + w / 2, y + 10)
    const items = [
      { type: 'rocket', name: '高速运动物体' }, { type: 'clock', name: '时钟' },
      { type: 'ruler', name: '尺子' }, { type: 'photon', name: '光子' },
      { type: 'battery', name: '电源（干扰）' }, { type: 'magnet', name: '磁铁（干扰）' },
    ]
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
    if (type === 'rocket') { ctx.fillStyle = '#E53935'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🚀', 0, 2) }
    else if (type === 'clock') { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke() }
    else if (type === 'ruler') { ctx.fillStyle = '#FFE0B2'; ctx.fillRect(-10, -3, 20, 6); ctx.strokeStyle = '#F9A825'; ctx.strokeRect(-10, -3, 20, 6) }
    else if (type === 'photon') { ctx.fillStyle = '#FFEB3B'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill() }
    else if (type === 'battery') { ctx.fillStyle = '#4CAF50'; ctx.fillRect(-10, -7, 20, 14); ctx.strokeStyle = '#2E7D32'; ctx.strokeRect(-10, -7, 20, 14) }
    else if (type === 'magnet') { ctx.fillStyle = '#E53935'; ctx.fillRect(-10, -6, 10, 12); ctx.fillStyle = '#1565C0'; ctx.fillRect(0, -6, 10, 12) }
    ctx.restore()
  }

  function drawComp(ctx, comp) {
    ctx.save(); ctx.translate(comp.x, comp.y)
    const labels = { rocket: '高速物体', clock: '时钟', ruler: '尺子', photon: '光子', battery: '电源', magnet: '磁铁' }
    const colors = { rocket: '#FFCDD2', clock: '#E3F2FD', ruler: '#FFE0B2', photon: '#FFEB3B', battery: '#4CAF50', magnet: '#FFCDD2' }
    ctx.fillStyle = colors[comp.type] || '#eee'
    ctx.strokeStyle = '#888'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.roundRect(-16, -12, 32, 24, 4); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(labels[comp.type] || comp.type, 0, 0)
    ctx.restore()
  }

  function getPos(e) { const r = canvasRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
  function handleMouseDown(e) { if (e.button !== 0) return; const s = S.current; const { x, y } = getPos(e); if (s.tab === 1) { for (const a of canvasRef.current._clickAreas) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(x, y); return } } return } for (const a of canvasRef.current._clickAreas || []) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(); return } } for (const a of canvasRef.current._palAreas) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { if (a.type) { s.components.push({ id: s.nextId++, type: a.type, x, y, closed: true, props: {} }); s.dragId = s.nextId - 1; forceUpdate(n => n + 1); return } } } for (const c of s.components) { if (Math.abs(x - c.x) < 25 && Math.abs(y - c.y) < 25) { s.dragId = c.id; s.dragOffX = x - c.x; s.dragOffY = y - c.y; forceUpdate(n => n + 1); return } } }
  function handleMouseMove(e) { const s = S.current; const { x, y } = getPos(e); if (s.dragId == null) return; const c = s.components.find(c => c.id === s.dragId); if (c) { c.x = x - s.dragOffX; c.y = y - s.dragOffY; forceUpdate(n => n + 1) } }
  function handleMouseUp() { S.current.dragId = null }
  function handleDoubleClick() {}
  function handleContextMenu(e) { e.preventDefault(); const s = S.current; const { x, y } = getPos(e); const idx = s.components.findIndex(c => Math.abs(x - c.x) < 25 && Math.abs(y - c.y) < 25); if (idx >= 0) { s.components.splice(idx, 1); forceUpdate(n => n + 1) } }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px', background: '#fff', borderBottom: '1px solid #e0e0e0', alignItems: 'center' }}>
        <button onClick={() => { S.current.tab = 1; setTab(1); forceUpdate(n => n + 1) }} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #ddd', background: tab === 1 ? '#1976D2' : '#fff', color: tab === 1 ? '#fff' : '#333', cursor: 'pointer' }}>📊 实验演示</button>
        <button onClick={() => { S.current.tab = 2; setTab(2); forceUpdate(n => n + 1) }} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #ddd', background: tab === 2 ? '#1976D2' : '#fff', color: tab === 2 ? '#fff' : '#333', cursor: 'pointer' }}>🔧 自己动手</button>
        <button onClick={() => { S.current.beta = 0.5; S.current.t = 0; S.current.records = []; S.current.switchClosed = false; forceUpdate(n => n + 1) }} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', color: '#666', cursor: 'pointer' }}>↺ 重置</button>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} />
      </div>
    </div>
  )
}