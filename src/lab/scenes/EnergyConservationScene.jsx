import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * EnergyConservationScene — 验证机械能守恒定律
 *
 * 重锤自由落体 + 打点计时器纸带
 * 逐点计算 Ek=½mv², Ep=mgh, 验证 ΔEk ≈ −ΔEp
 * E-h 图像：三条曲线直观展示能量转化
 */
export default function EnergyConservationScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const rendererRef = useRef(null)
  const lastTimeRef = useRef(0)

  const sim = useRef({
    height: 2.0,
    g: 9.8,
    mass: 1.0,
    running: false,
    paused: false,
    time: 0,
    ballY: 0,
    ballV: 0,
    points: [],
    rawPoints: [],    // 原始打点（50Hz）
    analysis: null,
    airDrag: false,
    dragCoeff: 0.05,
    speedMultiplier: 1,
    landed: false,
    pointStep: 5,     // 计数点步长
    screenW: 0, screenH: 0,
  })

  const liveRef = useRef(null)
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [slowMode, setSlowMode] = useState(false)
  const [, uiTick] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const renderer = createRenderer(canvas)
    rendererRef.current = renderer
    lastTimeRef.current = performance.now()

    const loop = (now) => {
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.05)
      lastTimeRef.current = now
      updatePhysics(dt)
      renderFrame(renderer)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)

    const onResize = () => renderer.resize()
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function createRenderer(canvas) {
    const r = { canvas, ctx: canvas.getContext('2d'), screenW: 0, screenH: 0,
      resize() {
        const rect = canvas.getBoundingClientRect()
        canvas.width = rect.width * devicePixelRatio
        canvas.height = rect.height * devicePixelRatio
        this.ctx.scale(devicePixelRatio, devicePixelRatio)
        this.screenW = rect.width; this.screenH = rect.height
        sim.current.screenW = rect.width; sim.current.screenH = rect.height
      },
      clear() { this.ctx.clearRect(0, 0, this.screenW, this.screenH) },
    }
    r.resize(); return r
  }

  // ═══════════════════════════════════════
  // 物理引擎
  // ═══════════════════════════════════════
  function updatePhysics(dt) {
    const s = sim.current
    if (!s.running || s.paused || s.landed) return

    const speedMul = s.speedMultiplier || 1
    const realDt = dt * speedMul
    const g = s.g

    // 加速度（阻力参与计算）
    let a = g
    if (s.airDrag && s.ballV > 0) {
      a = g - (s.dragCoeff / s.mass) * s.ballV
      if (a < 0) a = 0  // 阻力不超过重力
    }

    // 积分更新（不用理想公式，保证阻力影响位置和速度）
    s.ballV += a * realDt
    s.ballY -= s.ballV * realDt
    s.time += realDt

    // 打点（50Hz 真实时间，用积分值记录到 rawPoints）
    const f = 50, T = 1 / f
    const expected = Math.floor(s.time / T) + 1
    while (s.rawPoints.length < expected && !s.landed) {
      if (s.ballY <= 0) break
      s.rawPoints.push({ t: s.time, y: Math.max(0, s.ballY), v: s.ballV })
    }

    // 按计数点步长生成 points
    s.points = []
    for (let i = 0; i < s.rawPoints.length; i += s.pointStep) {
      s.points.push(s.rawPoints[i])
    }
    // 确保包含最后一个点
    if (s.rawPoints.length > 0 && s.points[s.points.length - 1] !== s.rawPoints[s.rawPoints.length - 1]) {
      s.points.push(s.rawPoints[s.rawPoints.length - 1])
    }

    // 落地检测
    if (s.ballY <= 0) {
      s.ballY = 0; s.landed = true
      s.running = false
      setRunning(false)
      analyzeData()
    }

    liveRef.current = {
      h: Math.max(0, s.ballY), v: s.ballV,
      Ep: s.g * Math.max(0, s.ballY),
      Ek: 0.5 * s.ballV * s.ballV,
      E_total: 0.5 * s.ballV * s.ballV + s.g * Math.max(0, s.ballY),
      t: s.time,
    }
  }

  function analyzeData() {
    const s = sim.current
    const g = s.g
    const pts = s.points  // 已按 pointStep 筛选
    if (pts.length < 2) return

    const E0 = g * s.height

    // 包含初始状态（t=0, v=0, h=h₀）作为基准
    const allPts = [{ t: 0, y: s.height, v: 0 }, ...pts]

    const results = allPts.map((p) => {
      const Ep = g * p.y
      const Ek = 0.5 * p.v * p.v
      const E_total = Ep + Ek
      const dEp = E0 - Ep
      const dEk = Ek - 0
      const err = dEp > 0.01 ? Math.abs(dEk - dEp) / dEp * 100 : 0
      return { h: p.y, v: p.v, Ep, Ek, E_total, dEp, dEk, err, t: p.t }
    })

    sim.current.analysis = results
  }

  // ═══════════════════════════════════════
  // 渲染
  // ═══════════════════════════════════════
  function renderFrame(renderer) {
    renderer.clear()
    drawScene(renderer)
    drawGraph(renderer)
    drawDataPanel(renderer)
  }

  // ── 场景（左侧）：从上往下落 ──
  function drawScene(r) {
    const ctx = r.ctx
    const s = sim.current
    const w = r.screenW, h = r.screenH
    const groundY = h * 0.85
    const topY = h * 0.08
    const fallH = groundY - topY

    // 地面
    ctx.fillStyle = '#e8ecf0'
    ctx.fillRect(0, groundY, w, h - groundY)
    ctx.strokeStyle = '#b0bec5'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(40, groundY); ctx.lineTo(w * 0.5, groundY); ctx.stroke()

    // 高度刻度尺
    const rulerX = 50
    ctx.strokeStyle = '#b0bec5'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(rulerX, topY); ctx.lineTo(rulerX, groundY); ctx.stroke()
    ctx.fillStyle = 'rgba(100,100,100,0.4)'; ctx.font = '9px monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
    const hStep = s.height <= 2 ? 0.5 : 1
    for (let hm = 0; hm <= s.height + 0.01; hm += hStep) {
      const py = groundY - (hm / s.height) * fallH
      ctx.beginPath(); ctx.moveTo(rulerX - 4, py); ctx.lineTo(rulerX + 4, py); ctx.stroke()
      ctx.fillText(`${hm.toFixed(1)}`, rulerX - 6, py)
    }
    ctx.fillStyle = '#666'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'
    ctx.save(); ctx.translate(rulerX - 22, topY + fallH / 2); ctx.rotate(-Math.PI / 2)
    ctx.fillText('h (m)', 0, 0); ctx.restore()

    // 打点计时器
    const tapeX = w * 0.28
    ctx.fillStyle = '#546E7A'
    ctx.beginPath(); ctx.roundRect(tapeX - 22, topY - 6, 44, 24, 4); ctx.fill()
    ctx.strokeStyle = '#37474F'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(tapeX - 22, topY - 6, 44, 24, 4); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('50Hz打点', tapeX, topY + 6)

    // 纸带
    const tapeW = 28
    ctx.fillStyle = 'rgba(245,240,224,0.12)'
    ctx.fillRect(tapeX - tapeW / 2, topY + 18, tapeW, groundY - topY - 18)
    ctx.strokeStyle = 'rgba(200,190,170,0.3)'; ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(tapeX - tapeW / 2, topY + 18); ctx.lineTo(tapeX - tapeW / 2, groundY)
    ctx.moveTo(tapeX + tapeW / 2, topY + 18); ctx.lineTo(tapeX + tapeW / 2, groundY)
    ctx.stroke()

    // 纸带打点（从上往下，间距随速度增大）
    if (s.points.length > 0) {
      for (let i = 0; i < s.points.length; i++) {
        const p = s.points[i]
        const fallen = s.height - p.y
        const dotY = topY + 18 + (fallen / s.height) * (groundY - topY - 18)
        if (dotY > groundY) continue
        const maxV = s.g * Math.sqrt(2 * s.height / s.g)
        const alpha = 0.4 + (p.v / maxV) * 0.6
        ctx.fillStyle = `rgba(30, 136, 229, ${Math.min(1, alpha)})`
        ctx.beginPath(); ctx.arc(tapeX + (i % 2 === 0 ? -3 : 3), dotY, 2.5, 0, Math.PI * 2); ctx.fill()
        if (i % 10 === 0) {
          ctx.fillStyle = 'rgba(100,110,120,0.6)'; ctx.font = '8px monospace'; ctx.textAlign = 'left'
          ctx.fillText(`${i}`, tapeX + tapeW / 2 + 3, dotY + 3)
        }
      }
    }

    // 重锤
    const hammerFallen = s.height - s.ballY
    const hammerY = topY + 18 + (hammerFallen / s.height) * (groundY - topY - 18)
    const hammerX = tapeX
    if (hammerY < groundY - 5) {
      ctx.fillStyle = '#D32F2F'
      ctx.beginPath(); ctx.roundRect(hammerX - 9, hammerY, 18, 22, 3); ctx.fill()
      ctx.strokeStyle = '#B71C1C'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.roundRect(hammerX - 9, hammerY, 18, 22, 3); ctx.stroke()
      ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(`${(s.mass * 1000).toFixed(0)}g`, hammerX, hammerY + 11)
    }

    // 高度标注
    if (s.ballY > 0.05) {
      const hLineY = hammerY + 11
      ctx.strokeStyle = 'rgba(79,195,247,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3])
      ctx.beginPath(); ctx.moveTo(rulerX + 6, hLineY); ctx.lineTo(hammerX - 14, hLineY); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#4FC3F7'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText(`h=${s.ballY.toFixed(2)}m`, hammerX + 14, hLineY + 3)
    }

    // 速度箭头
    if (s.running && s.ballV > 0.3) {
      const vLen = Math.min(50, s.ballV * 5)
      const vy = hammerY + 24
      ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(hammerX, vy); ctx.lineTo(hammerX, vy + vLen); ctx.stroke()
      ctx.fillStyle = '#4CAF50'
      ctx.beginPath(); ctx.moveTo(hammerX, vy + vLen); ctx.lineTo(hammerX - 4, vy + vLen - 6); ctx.lineTo(hammerX + 4, vy + vLen - 6); ctx.closePath(); ctx.fill()
      ctx.font = '9px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText(`v=${s.ballV.toFixed(1)}m/s`, hammerX + 10, vy + vLen / 2)
    }

    // 慢动作指示（在场景区左上角，不遮挡数据面板）
    if (s.speedMultiplier && s.speedMultiplier < 1) {
      ctx.fillStyle = 'rgba(255,152,0,0.9)'; ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText(`🐌 ${s.speedMultiplier}x 慢动作`, w * 0.15, topY + 20)
    }

    // 教学提示
    ctx.fillStyle = 'rgba(100,110,120,0.5)'; ctx.font = '9px sans-serif'
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('打点周期 T=0.02s，可选取计数点', rulerX + 10, groundY + 8)
    if (s.airDrag) {
      ctx.fillStyle = 'rgba(255,152,0,0.6)'
      ctx.fillText('存在阻力：ΔEk < −ΔEp', rulerX + 10, groundY + 22)
    }
  }

  // ── E-h 图像（右上）──
  function drawGraph(r) {
    const ctx = r.ctx
    const s = sim.current
    const analysis = s.analysis
    const w = r.screenW
    const gw = Math.min(240, w * 0.3)
    const gh = 170
    const gx = w - gw - 12, gy = 12

    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, 8); ctx.fill()
    ctx.strokeStyle = '#d0d5dd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, 8); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('📈 E-h 图像', gx + 10, gy + 16)

    const ox = gx + 40, oy = gy + gh - 22
    const pw = gw - 55, ph = gh - 40

    // 坐标轴
    ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(ox, oy - ph); ctx.lineTo(ox, oy); ctx.lineTo(ox + pw, oy); ctx.stroke()

    ctx.fillStyle = '#666'; ctx.font = '9px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('h (m) ←高 低→', ox + pw / 2, oy + 14)
    ctx.save(); ctx.translate(gx + 8, oy - ph / 2); ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('E (J/kg)', 0, 0); ctx.restore()

    if (!analysis || analysis.length < 2) {
      ctx.fillStyle = 'rgba(139,148,158,0.3)'; ctx.font = '10px sans-serif'
      ctx.textAlign = 'center'; ctx.fillText('落地后显示', ox + pw / 2, oy - ph / 2)
      return
    }

    const maxE = analysis[0]?.E_total || s.g * s.height
    const maxH = s.height

    // 网格 + 刻度（y轴）
    ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 0.5
    ctx.fillStyle = 'rgba(100,100,100,0.5)'; ctx.font = '8px monospace'
    for (let i = 1; i <= 4; i++) {
      const ey = maxE * i / 4
      const py = oy - (ey / maxE) * ph
      ctx.beginPath(); ctx.moveTo(ox, py); ctx.lineTo(ox + pw, py); ctx.stroke()
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
      ctx.fillText(ey.toFixed(1), ox - 3, py)
    }

    // x轴刻度：h 从大到小（左→右）= 从 h₀ 到 0
    for (let i = 0; i <= 4; i++) {
      const hx = maxH * (4 - i) / 4  // 左=大h，右=小h
      const px = ox + (i / 4) * pw
      if (i > 0 && i < 4) {
        ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 0.5
        ctx.beginPath(); ctx.moveTo(px, oy); ctx.lineTo(px, oy - ph); ctx.stroke()
      }
      ctx.fillStyle = 'rgba(100,100,100,0.5)'; ctx.font = '8px monospace'
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText(hx.toFixed(1), px, oy + 2)
    }

    // Ep 曲线（蓝）
    ctx.strokeStyle = '#1976D2'; ctx.lineWidth = 2; ctx.beginPath()
    for (let i = 0; i < analysis.length; i++) {
      const px = ox + ((maxH - analysis[i].h) / maxH) * pw
      const py = oy - (analysis[i].Ep / maxE) * ph
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.stroke()

    // Ek 曲线（红）
    ctx.strokeStyle = '#D32F2F'; ctx.lineWidth = 2; ctx.beginPath()
    for (let i = 0; i < analysis.length; i++) {
      const px = ox + ((maxH - analysis[i].h) / maxH) * pw
      const py = oy - (analysis[i].Ek / maxE) * ph
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.stroke()

    // E_total 曲线（绿虚线）
    ctx.strokeStyle = '#388E3C'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.beginPath()
    for (let i = 0; i < analysis.length; i++) {
      const px = ox + ((maxH - analysis[i].h) / maxH) * pw
      const py = oy - (analysis[i].E_total / maxE) * ph
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.stroke(); ctx.setLineDash([])

    // 图例
    const lx = gx + 10, ly = gy + gh - 12
    ctx.font = '9px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.strokeStyle = '#1976D2'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lx, ly - 6); ctx.lineTo(lx + 14, ly - 6); ctx.stroke()
    ctx.fillStyle = '#1976D2'; ctx.fillText('Ep', lx + 18, ly - 6)
    ctx.strokeStyle = '#D32F2F'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lx + 40, ly - 6); ctx.lineTo(lx + 54, ly - 6); ctx.stroke()
    ctx.fillStyle = '#D32F2F'; ctx.fillText('Ek', lx + 58, ly - 6)
    ctx.strokeStyle = '#388E3C'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 2]); ctx.beginPath(); ctx.moveTo(lx + 80, ly - 6); ctx.lineTo(lx + 94, ly - 6); ctx.stroke(); ctx.setLineDash([])
    ctx.fillStyle = '#388E3C'; ctx.fillText('E总', lx + 98, ly - 6)
  }

  // ── 数据面板（左下）──
  function drawDataPanel(r) {
    const ctx = r.ctx
    const s = sim.current
    const live = liveRef.current
    const analysis = s.analysis
    const pw = 220, ph = 280
    const px = 12, py = 12

    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.fill()
    ctx.strokeStyle = '#d0d5dd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.stroke()

    ctx.save()
    ctx.beginPath(); ctx.rect(px + 2, py + 2, pw - 4, ph - 4); ctx.clip()

    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('📊 机械能守恒', px + 12, py + 18)

    let y = py + 34
    const lx = px + 12
    ctx.font = '11px sans-serif'

    ctx.fillStyle = '#555'
    ctx.fillText(`h₀ = ${s.height.toFixed(2)} m`, lx, y); y += 14
    ctx.fillText(`m = ${(s.mass * 1000).toFixed(0)} g（展示用）`, lx, y); y += 14
    ctx.fillText(`打点: ${s.rawPoints.length}  计数: ${s.points.length}（每${s.pointStep}点）`, lx, y); y += 14
    ctx.fillStyle = s.airDrag ? '#FF9800' : '#4CAF50'
    ctx.fillText(s.airDrag ? `有阻力 k=${s.dragCoeff.toFixed(2)}` : '理想（无阻力）', lx, y); y += 14
    if (s.airDrag) {
      ctx.fillStyle = '#FF5722'; ctx.font = '9px sans-serif'
      ctx.fillText('⚠ 存在阻力损耗，ΔEk 略小于 −ΔEp', lx, y); y += 14
    }
    ctx.font = '11px sans-serif'; y += 4

    // 实时数据
    if (live) {
      ctx.fillStyle = '#1976D2'
      ctx.fillText(`Ep = mgh = ${live.Ep.toFixed(3)} J/kg`, lx, y); y += 14
      ctx.fillStyle = '#D32F2F'
      ctx.fillText(`Ek = ½mv² = ${live.Ek.toFixed(3)} J/kg`, lx, y); y += 14
      ctx.fillStyle = '#388E3C'; ctx.font = 'bold 11px sans-serif'
      ctx.fillText(`E总 = ${live.E_total.toFixed(3)} J/kg`, lx, y); y += 14
      ctx.font = '11px sans-serif'
      ctx.fillStyle = '#555'
      ctx.fillText(`v = ${live.v.toFixed(2)} m/s  h = ${live.h.toFixed(3)} m`, lx, y); y += 14
      ctx.fillText(`t = ${live.t.toFixed(3)} s`, lx, y); y += 16
    }

    // 公式
    ctx.fillStyle = '#FF9800'; ctx.font = '10px sans-serif'
    ctx.fillText('ΔEk ≈ −ΔEp（无阻力时相等）', lx, y); y += 14

    // 逐点验证表
    if (analysis && analysis.length > 1) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('── ΔEk vs −ΔEp ──', lx, y); y += 13
      ctx.font = '9px monospace'
      const show = Math.min(analysis.length, 6)
      for (let i = 0; i < show; i++) {
        const a = analysis[i]
        ctx.fillStyle = '#D32F2F'; ctx.fillText(`ΔEk=${a.dEk.toFixed(3)}`, lx, y)
        ctx.fillStyle = '#1976D2'; ctx.fillText(`−ΔEp=${a.dEp.toFixed(3)}`, lx + 72, y)
        ctx.fillStyle = a.err < 3 ? '#4CAF50' : '#FF9800'
        ctx.fillText(`${a.err.toFixed(1)}%`, lx + 152, y)
        y += 12
      }
    }

    ctx.restore()
  }

  // ═══════════════════════════════════════
  // 控制
  // ═══════════════════════════════════════
  const handleStart = useCallback(() => {
    const s = sim.current
    s.ballY = s.height; s.ballV = 0; s.time = 0
    s.points = []; s.rawPoints = []
    s.running = true; s.paused = false; s.landed = false; s.analysis = null
    liveRef.current = null; lastTimeRef.current = performance.now()
    setRunning(true); setPaused(false)
  }, [])

  const handlePause = useCallback(() => {
    sim.current.paused = !sim.current.paused
    setPaused(p => !p)
  }, [])

  const handleStop = useCallback(() => {
    sim.current.running = false; sim.current.paused = false
    setRunning(false); setPaused(false)
    analyzeData(); uiTick(n => n + 1)
  }, [])

  const handleReset = useCallback(() => {
    const s = sim.current
    s.ballY = 0; s.ballV = 0; s.time = 0
    s.points = []; s.rawPoints = []
    s.running = false; s.paused = false; s.landed = false; s.analysis = null
    liveRef.current = null
    setRunning(false); setPaused(false)
  }, [])

  const handleSlowToggle = useCallback(() => {
    const s = sim.current
    if (slowMode) { s.speedMultiplier = 1; setSlowMode(false) }
    else { s.speedMultiplier = 0.2; setSlowMode(true) }
  }, [slowMode])

  const handleClearPoints = useCallback(() => {
    sim.current.points = []; sim.current.rawPoints = []; sim.current.analysis = null
    uiTick(n => n + 1)
  }, [])

  const handleExportCSV = useCallback(() => {
    const analysis = sim.current.analysis
    if (!analysis || analysis.length === 0) return
    const header = 't(s),h(m),v(m/s),Ep_per_kg(J/kg),Ek_per_kg(J/kg),E_total_per_kg(J/kg),ΔEk(J/kg),−ΔEp(J/kg),误差%'
    const rows = analysis.map(a => `${a.t.toFixed(4)},${a.h.toFixed(4)},${a.v.toFixed(4)},${a.Ep.toFixed(4)},${a.Ek.toFixed(4)},${a.E_total.toFixed(4)},${a.dEk.toFixed(4)},${a.dEp.toFixed(4)},${a.err.toFixed(2)}`)
    const csv = header + '\n' + rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `energy_conservation_${Date.now()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }, [])

  const s = sim.current

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>验证机械能守恒定律</span>
        <div style={styles.topActions}>
          {!running ? (
            <button style={styles.playBtn} onClick={handleStart}>▶ 释放</button>
          ) : (
            <>
              <button style={styles.pauseBtn} onClick={handlePause}>{paused ? '▶ 继续' : '⏸ 暂停'}</button>
              <button style={styles.stopBtn} onClick={handleStop}>⏹ 停止</button>
            </>
          )}
          <button style={styles.setBtn} onClick={handleReset}>⚙ 重置</button>
          <button style={slowMode ? styles.slowBtnActive : styles.btn} onClick={handleSlowToggle}>🐌 慢动作</button>
          <div style={styles.sep} />
          <button style={styles.btn} onClick={handleClearPoints}>🗑 清除</button>
          <button style={styles.btn} onClick={handleExportCSV}>📥 CSV</button>
          <div style={styles.sep} />
          <div style={styles.tabGroup}>
            <button style={!s.airDrag ? styles.tabOk : styles.tab}
              onClick={() => { sim.current.airDrag = false; uiTick(n => n + 1) }}>
              理想
            </button>
            <button style={s.airDrag ? styles.tabWarn : styles.tab}
              onClick={() => { sim.current.airDrag = true; uiTick(n => n + 1) }}>
              有阻力
            </button>
          </div>
        </div>
      </div>

      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>h₀</span>
          <input type="range" min="0.5" max="5" step="0.1"
            value={s.height}
            onChange={(e) => { sim.current.height = parseFloat(e.target.value); uiTick(n => n + 1) }}
            style={styles.slider} />
          <input type="number" min="0.5" max="10" step="0.1"
            value={s.height}
            onChange={(e) => { sim.current.height = Math.max(0.5, parseFloat(e.target.value) || 0.5); uiTick(n => n + 1) }}
            style={styles.numInput} />
          <span style={styles.sliderVal}>m</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>m</span>
          <input type="range" min="0.1" max="2" step="0.05"
            value={s.mass}
            onChange={(e) => { sim.current.mass = parseFloat(e.target.value); uiTick(n => n + 1) }}
            style={styles.slider} />
          <span style={styles.sliderVal}>{(s.mass * 1000).toFixed(0)}g</span>
        </label>
        {s.airDrag && (
          <label style={styles.controlLabel}>
            <span style={styles.controlName}>k</span>
            <input type="range" min="0.1" max="2" step="0.05"
              value={s.dragCoeff}
              onChange={(e) => { sim.current.dragCoeff = parseFloat(e.target.value); uiTick(n => n + 1) }}
              style={styles.slider} />
            <span style={styles.sliderVal}>{s.dragCoeff.toFixed(2)}</span>
            <span style={{ fontSize: 9, color: '#999', whiteSpace: 'nowrap' }}>越大误差越大</span>
          </label>
        )}
        <div style={styles.sep} />
        {[1, 2, 3, 5].map(h => (
          <button key={h} style={Math.abs(s.height - h) < 0.05 ? styles.tabActive : styles.tab}
            onClick={() => { sim.current.height = h; uiTick(n => n + 1) }}>
            {h}m
          </button>
        ))}
        <div style={styles.sep} />
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>计数点</span>
          <select style={styles.select}
            value={s.pointStep}
            onChange={(e) => { sim.current.pointStep = parseInt(e.target.value); uiTick(n => n + 1) }}
            title="每隔N个打点选取一个计数点">
            <option value="1">每1点</option>
            <option value="2">每2点</option>
            <option value="5">每5点</option>
            <option value="10">每10点</option>
          </select>
        </label>
        <span style={styles.timer}>t = {(liveRef.current?.t ?? 0).toFixed(3)} s</span>
      </div>

      <div style={styles.main}>
        <canvas ref={canvasRef} style={styles.canvas} />
      </div>

      <div style={styles.desc}>
        <b>实验：验证机械能守恒定律</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          调整高度，点击"释放"→重锤自由落体→纸带打点→逐点验证 ΔEk ≈ −ΔEp。真实实验受阻力影响，ΔEk 略小于 −ΔEp。
        </span>
      </div>
    </div>
  )
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', maxHeight: '100vh', background: '#e8e8e8', color: '#333', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', overflow: 'hidden' },
  topBar: { background: '#f5f5f5', borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', flexShrink: 0, flexWrap: 'wrap', gap: 6 },
  title: { fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' },
  topActions: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  controlBar: { background: '#fafafa', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', padding: '4px 12px', flexShrink: 0, gap: 8, overflowX: 'auto' },
  controlLabel: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#555', whiteSpace: 'nowrap' },
  controlName: { fontWeight: 600, color: '#4A90D9', minWidth: 14 },
  slider: { width: 60, accentColor: '#4A90D9' },
  numInput: { width: 50, border: '1px solid #ccc', borderRadius: 3, padding: '2px 4px', fontSize: 11, textAlign: 'center' },
  sliderVal: { color: '#4A90D9', fontWeight: 600, fontSize: 12 },
  btn: { background: '#fff', color: '#4A90D9', border: '1px solid #ccc', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' },
  slowBtnActive: { background: '#FF9800', color: '#fff', border: '1px solid #FF9800', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 600 },
  playBtn: { background: '#4A90D9', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  pauseBtn: { background: '#FF9800', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  stopBtn: { background: '#E53935', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  setBtn: { background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
  sep: { width: 1, height: 18, background: '#ccc', flexShrink: 0 },
  tabGroup: { display: 'flex', gap: 2 },
  tab: { background: '#fff', color: '#555', border: '1px solid #ccc', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer' },
  tabActive: { background: '#4A90D9', color: '#fff', border: '1px solid #4A90D9', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 },
  tabOk: { background: '#4CAF50', color: '#fff', border: '1px solid #4CAF50', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 },
  tabWarn: { background: '#FF9800', color: '#fff', border: '1px solid #FF9800', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 },
  timer: { fontFamily: 'Consolas,monospace', fontSize: 13, color: '#4A90D9', fontWeight: 600 },
  main: { flex: 1, display: 'flex', overflow: 'hidden', background: '#fff', position: 'relative', minHeight: 0 },
  canvas: { flex: 1, width: '100%', display: 'block' },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
}
