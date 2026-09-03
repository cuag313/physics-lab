import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * UniformAccelScene — 研究匀变速直线运动
 *
 * 打点计时器仿真：纸带记录 → 逐差法求a → v-t图像验证
 *
 * 修正记录（2026-09-02）：
 * - 逐差法公式修正：a = (Σs_{k+i} - Σs_i) / (k² × T²)
 * - 打点从 t=0 开始，时间 t = (N-1)/f
 * - 纸带长度 = 总路程（非负），位移可负
 * - Δs 从真实纸带坐标计算，符号由 a 决定
 * - 预设按钮即时生效
 * - v-t 坐标轴自适应含负值
 */
export default function UniformAccelScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const rendererRef = useRef(null)
  const lastTimeRef = useRef(0)

  const stateRef = useRef({
    v0: 0.2,
    acceleration: 0.5,
    tickerFreq: 50,
    running: false,
    simTime: 0,          // 仿真累计时间（帧累加）
    points: [],          // {t, x} — t = idx * T，从 t=0 开始
    totalDistance: 0,     // 总路程（≥0，各帧 |Δx| 之和）
    currentX: 0,         // 当前位移（可负）
    currentV: 0,
    panelCollapsed: false,
    vtCollapsed: false,
    tapeScrollX: 0,
  })

  const analysisRef = useRef(null)
  const [running, setRunning] = useState(false)
  const [, uiTick] = useState(0)
  const interactionRef = useRef({ dragging: false, startX: 0, scrollStart: 0 })

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
    return () => {
      window.removeEventListener('resize', onResize)
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [])

  function createRenderer(canvas) {
    const r = {
      canvas, ctx: canvas.getContext('2d'), screenW: 0, screenH: 0,
      resize() {
        const rect = canvas.getBoundingClientRect()
        canvas.width = rect.width * devicePixelRatio
        canvas.height = rect.height * devicePixelRatio
        this.ctx.scale(devicePixelRatio, devicePixelRatio)
        this.screenW = rect.width
        this.screenH = rect.height
      },
      clear() { this.ctx.clearRect(0, 0, this.screenW, this.screenH) },
    }
    r.resize()
    return r
  }

  // ═══════════════════════════════════════════════
  // 物理引擎
  // ═══════════════════════════════════════════════
  function updatePhysics(dt) {
    const s = stateRef.current
    if (!s.running) return

    s.simTime += dt
    const newX = s.v0 * s.simTime + 0.5 * s.acceleration * s.simTime * s.simTime
    s.totalDistance += Math.abs(newX - s.currentX)
    s.currentX = newX
    s.currentV = s.v0 + s.acceleration * s.simTime

    // 打点：从 t=0 开始，idx=0 → t=0, idx=1 → t=T, ...
    const T = 1 / s.tickerFreq
    const expected = Math.floor(s.simTime / T) + 1  // +1 包含 t=0 的点
    while (s.points.length < expected) {
      const idx = s.points.length
      const t = idx * T
      const x = s.v0 * t + 0.5 * s.acceleration * t * t
      s.points.push({ t, x })
    }

    // 自动停止条件
    if (s.totalDistance > 2.5 || Math.abs(s.currentX) > 2.5) {
      s.running = false
      setRunning(false)
      analyzeData()
    }

    // 运动中每30点更新一次分析
    if (s.points.length >= 15 && s.points.length % 30 === 0) {
      analyzeData()
    }
  }

  // ═══════════════════════════════════════════════
  // 数据分析
  // ═══════════════════════════════════════════════
  function analyzeData() {
    const s = stateRef.current
    const f = s.tickerFreq
    const T = 1 / f
    const pts = s.points
    if (pts.length < 10) return

    // 每隔 n 个原始点取 1 个计数点 → T_sel = nT
    const n = Math.max(1, Math.floor(f / 10))  // 50Hz→5, 20Hz→2, 100Hz→10
    const T_sel = n * T
    const selected = []
    for (let i = 0; i < pts.length; i += n) {
      selected.push(pts[i])
    }
    if (selected.length < 6) return

    // ─── 每段位移 s₁, s₂, ... ───
    const sSegments = []
    for (let i = 0; i < selected.length - 1; i++) {
      sSegments.push(selected[i + 1].x - selected[i].x)
    }

    // ─── 逐差法求加速度 ───
    // 标准公式：取 2k 段，a = (Σs_{k+i} - Σs_i) / (k² × T_sel²)
    // 确保偶数段（丢弃最后一段如果奇数）
    const segCount = sSegments.length % 2 === 0 ? sSegments.length : sSegments.length - 1
    const k = segCount / 2
    let sumLater = 0, sumEarlier = 0
    for (let i = 0; i < k; i++) {
      sumEarlier += sSegments[i]
      sumLater += sSegments[i + k]
    }
    const a_逐差法 = k > 0 ? (sumLater - sumEarlier) / (k * k * T_sel * T_sel) : 0

    // ─── Δs = s_{n+1} - s_n（相邻段位移差，真实计算）───
    const deltaS = []
    for (let i = 0; i < sSegments.length - 1; i++) {
      deltaS.push(sSegments[i + 1] - sSegments[i])
    }

    // ─── v-t 图像：中间差分法求瞬时速度 ───
    const velocities = []
    for (let i = 1; i < selected.length - 1; i++) {
      const v = (selected[i + 1].x - selected[i - 1].x) / (2 * T_sel)
      velocities.push({ t: selected[i].t, v })
    }

    // 线性拟合 v = v₀ + at
    let sumT = 0, sumV = 0, sumTT = 0, sumTV = 0
    for (const p of velocities) {
      sumT += p.t; sumV += p.v; sumTT += p.t * p.t; sumTV += p.t * p.v
    }
    const nv = velocities.length
    const slopeA = nv > 0 ? (nv * sumTV - sumT * sumV) / (nv * sumTT - sumT * sumT) : 0
    const interceptV0 = nv > 0 ? (sumV - slopeA * sumT) / nv : 0

    // 时间口径：N 个点 → t = (N-1)/f
    const consistentTime = pts.length > 0 ? (pts.length - 1) / f : 0

    analysisRef.current = {
      a_逐差法, slopeA, interceptV0,
      velocities, selected, sSegments, deltaS,
      T_sel, k, segCount, consistentTime,
    }
  }

  // ═══════════════════════════════════════════════
  // 渲染
  // ═══════════════════════════════════════════════
  function renderFrame(renderer) {
    renderer.clear()
    drawPaperTape(renderer.ctx, renderer)
    drawDataPanel(renderer.ctx, renderer)
    drawVTGraph(renderer.ctx, renderer)
  }

  // ── 数据面板（左上，可折叠）──
  function drawDataPanel(ctx, r) {
    const s = stateRef.current
    const d = analysisRef.current
    const pw = 230, px = 10, py = 10

    if (s.panelCollapsed) {
      ctx.fillStyle = 'rgba(22,27,34,0.9)'
      ctx.beginPath(); ctx.roundRect(px, py, 120, 24, 6); ctx.fill()
      ctx.fillStyle = '#c9d1d9'; ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'left'; ctx.fillText('📊 实验数据 ▶', px + 8, py + 16)
      return
    }

    // 自适应高度
    let ch = 155
    if (d) {
      ch = 195
      ch += Math.min(d.sSegments.length, 8) * 13
      ch += Math.min(d.deltaS.length, 6) * 13 + 40
    }
    const ph = Math.min(ch, r.screenH * 0.65)

    ctx.fillStyle = 'rgba(22,27,34,0.95)'
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.fill()
    ctx.strokeStyle = '#30363d'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.stroke()

    // ✕ 折叠
    ctx.fillStyle = '#484f58'; ctx.font = '13px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('✕', px + pw - 14, py + 12)
    ctx.textBaseline = 'alphabetic'

    ctx.save()
    ctx.beginPath(); ctx.rect(px + 2, py + 2, pw - 4, ph - 4); ctx.clip()

    ctx.fillStyle = '#c9d1d9'; ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'left'; ctx.fillText('📊 实验数据', px + 12, py + 18)

    let y = py + 34
    const lx = px + 12
    ctx.font = '11px sans-serif'
    ctx.fillStyle = '#8b949e'
    ctx.fillText(`v₀ = ${s.v0.toFixed(2)} m/s`, lx, y); y += 14
    ctx.fillText(`a = ${s.acceleration.toFixed(2)} m/s²`, lx, y); y += 14
    ctx.fillText(`f = ${s.tickerFreq} Hz  T = ${(1000 / s.tickerFreq).toFixed(0)}ms`, lx, y); y += 14
    // 路程（非负）和位移（可负）分开显示
    ctx.fillText(`打点: ${s.points.length}  路程: ${(s.totalDistance * 100).toFixed(1)}cm`, lx, y); y += 14
    ctx.fillText(`位移: ${(s.currentX * 100).toFixed(1)}cm  v = ${s.currentV.toFixed(2)} m/s`, lx, y); y += 14
    // 时间：t = (N-1)/f
    const showT = d ? d.consistentTime : (s.points.length > 0 ? (s.points.length - 1) / s.tickerFreq : 0)
    ctx.fillText(`t = ${showT.toFixed(3)} s`, lx, y); y += 18

    if (!d) { ctx.restore(); return }

    // ── 逐差法结果 ──
    ctx.fillStyle = '#FFD700'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`── 逐差法 (${d.segCount}段, k=${d.k}) ──`, lx, y); y += 15
    ctx.font = '11px sans-serif'

    ctx.fillStyle = '#4CAF50'
    ctx.fillText(`a(逐差法) = ${d.a_逐差法.toFixed(4)} m/s²`, lx, y); y += 13
    ctx.fillStyle = '#4FC3F7'
    ctx.fillText(`a(v-t斜率) = ${d.slopeA.toFixed(4)} m/s²`, lx, y); y += 13
    ctx.fillStyle = '#FF9800'
    ctx.fillText(`v₀(v-t截距) = ${d.interceptV0.toFixed(4)} m/s`, lx, y); y += 15

    const refA = s.acceleration
    const err逐差法 = refA !== 0 ? Math.abs(d.a_逐差法 - refA) / Math.abs(refA) * 100 : 0
    const errVt = refA !== 0 ? Math.abs(d.slopeA - refA) / Math.abs(refA) * 100 : 0
    ctx.font = '10px sans-serif'
    ctx.fillStyle = err逐差法 < 3 ? '#4CAF50' : '#FF9800'
    ctx.fillText(`逐差法误差: ${err逐差法.toFixed(1)}%`, lx, y); y += 12
    ctx.fillStyle = errVt < 3 ? '#4CAF50' : '#FF9800'
    ctx.fillText(`v-t拟合误差: ${errVt.toFixed(1)}%`, lx, y); y += 16

    // ── 各段位移 ──
    ctx.fillStyle = '#FFD700'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('── 各段位移 ──', lx, y); y += 14
    ctx.font = '10px sans-serif'
    const showSeg = Math.min(d.sSegments.length, 8)
    for (let i = 0; i < showSeg; i++) {
      ctx.fillStyle = '#4FC3F7'
      ctx.fillText(`s${i + 1} = ${(d.sSegments[i] * 1000).toFixed(2)} mm`, lx, y)
      y += 13
    }

    // ── Δs = aT² 验证（真实计算）──
    if (d.deltaS && d.deltaS.length > 0) {
      y += 4
      ctx.fillStyle = '#FFD700'; ctx.font = 'bold 11px sans-serif'
      ctx.fillText('── Δs 验证 ──', lx, y); y += 14
      ctx.font = '10px sans-serif'

      const theoDS = refA * d.T_sel * d.T_sel
      ctx.fillStyle = '#8b949e'
      ctx.fillText(`理论Δs = a×T² = ${refA.toFixed(2)}×${d.T_sel.toFixed(2)}² = ${(theoDS * 1000).toFixed(2)}mm`, lx, y); y += 13

      const showDS = Math.min(d.deltaS.length, 6)
      for (let i = 0; i < showDS; i++) {
        const ds = d.deltaS[i]
        let errDS
        if (Math.abs(theoDS) < 1e-9) {
          // a≈0 时理论Δs=0，用绝对误差判断
          errDS = Math.abs(ds) < 1e-6 ? 0 : 999
        } else {
          errDS = Math.abs(ds - theoDS) / Math.abs(theoDS) * 100
        }
        ctx.fillStyle = errDS < 5 ? '#4CAF50' : '#FF9800'
        ctx.fillText(`Δs${i + 1} = ${(ds * 1000).toFixed(2)}mm  err${errDS < 999 ? errDS.toFixed(1) + '%' : '∞'}`, lx, y)
        y += 13
      }
    }

    ctx.restore()
  }

  // ── v-t 图像（右上，可折叠）──
  function drawVTGraph(ctx, r) {
    const w = r.screenW
    const s = stateRef.current
    const d = analysisRef.current
    const gw = Math.min(260, (w - 270) * 0.85)
    const gh = 150
    const gx = w - gw - 10, gy = 10

    if (s.vtCollapsed) {
      ctx.fillStyle = 'rgba(22,27,34,0.9)'
      ctx.beginPath(); ctx.roundRect(gx, gy, 110, 24, 6); ctx.fill()
      ctx.fillStyle = '#c9d1d9'; ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'left'; ctx.fillText('📈 v-t图像 ▶', gx + 8, gy + 16)
      return
    }

    ctx.fillStyle = 'rgba(22,27,34,0.95)'
    ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, 8); ctx.fill()
    ctx.strokeStyle = '#30363d'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, 8); ctx.stroke()

    ctx.fillStyle = '#484f58'; ctx.font = '13px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('✕', gx + gw - 14, gy + 12)
    ctx.textBaseline = 'alphabetic'

    ctx.fillStyle = '#c9d1d9'; ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'left'; ctx.fillText('📈 v-t 图像', gx + 10, gy + 16)

    const ox = gx + 42, oy = gy + gh - 22
    const pw = gw - 54, ph = gh - 40

    ctx.strokeStyle = '#484f58'; ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(ox, oy - ph); ctx.lineTo(ox, oy); ctx.lineTo(ox + pw, oy)
    ctx.stroke()

    ctx.fillStyle = '#484f58'; ctx.font = '9px sans-serif'
    ctx.textAlign = 'center'; ctx.fillText('t (s)', ox + pw / 2, oy + 12)
    ctx.save()
    ctx.translate(gx + 8, oy - ph / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText('v (m/s)', 0, 0)
    ctx.restore()

    if (!d || !d.velocities || d.velocities.length < 2) {
      ctx.fillStyle = 'rgba(139,148,158,0.3)'; ctx.font = '11px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('停止后显示', ox + pw / 2, oy - ph / 2)
      return
    }

    const vels = d.velocities
    const allT = vels.map(v => v.t)
    const allV = vels.map(v => v.v)
    const dataMinT = Math.min(...allT), dataMaxT = Math.max(...allT)
    const rawMinV = Math.min(...allV), rawMaxV = Math.max(...allV)
    const rawRangeV = rawMaxV - rawMinV
    // y轴范围：数据范围 ×1.3 留白，同时确保包含0（如数据跨0）
    const marginV = rawRangeV * 0.15
    let minV = rawMinV - marginV
    let maxV = rawMaxV + marginV
    // 如果数据全正或全负，也包含0以便参考
    if (minV > 0) minV = Math.min(minV, 0)
    if (maxV < 0) maxV = Math.max(maxV, 0)
    // 最小范围保护（避免range≈0时除零）
    if (maxV - minV < 0.05) {
      const mid = (maxV + minV) / 2
      minV = mid - 0.025
      maxV = mid + 0.025
    }
    const rangeT = (dataMaxT - dataMinT) || 1
    const maxT = dataMaxT + rangeT * 0.1
    const minT = Math.min(dataMinT - rangeT * 0.05, 0)

    // 刻度
    ctx.strokeStyle = 'rgba(72,79,88,0.3)'
    ctx.fillStyle = 'rgba(139,148,158,0.5)'
    ctx.font = '8px monospace'
    const vSteps = 5
    for (let i = 0; i <= vSteps; i++) {
      const vy = minV + (maxV - minV) * i / vSteps
      const ppy = oy - ((vy - minV) / (maxV - minV)) * ph
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
      if (i > 0 && i < vSteps) {
        ctx.beginPath(); ctx.moveTo(ox - 2, ppy); ctx.lineTo(ox + pw, ppy); ctx.stroke()
      }
      ctx.fillText(vy.toFixed(2), ox - 4, ppy)
    }
    const tSteps = 4
    for (let i = 0; i <= tSteps; i++) {
      const tx = minT + (maxT - minT) * i / tSteps
      const ppx = ox + ((tx - minT) / (maxT - minT)) * pw
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      if (i > 0 && i < tSteps) {
        ctx.beginPath(); ctx.moveTo(ppx, oy); ctx.lineTo(ppx, oy - ph); ctx.stroke()
      }
      ctx.fillText(tx.toFixed(2), ppx, oy + 2)
    }

    // 数据点
    ctx.fillStyle = '#4FC3F7'
    for (const v of vels) {
      const ppx = ox + ((v.t - minT) / (maxT - minT)) * pw
      const ppy = oy - ((v.v - minV) / (maxV - minV)) * ph
      ctx.beginPath(); ctx.arc(ppx, ppy, 2.5, 0, Math.PI * 2); ctx.fill()
    }

    // 拟合线
    const v0 = d.interceptV0, a = d.slopeA
    const t0 = minT, t1 = maxT
    const vAt0 = v0 + a * t0, vAt1 = v0 + a * t1
    ctx.strokeStyle = '#FF9800'; ctx.lineWidth = 1.5
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(ox + ((t0 - minT) / (maxT - minT)) * pw, oy - ((vAt0 - minV) / (maxV - minV)) * ph)
    ctx.lineTo(ox + ((t1 - minT) / (maxT - minT)) * pw, oy - ((vAt1 - minV) / (maxV - minV)) * ph)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = '#FF9800'; ctx.font = '10px sans-serif'
    ctx.textAlign = 'right'; ctx.textBaseline = 'top'
    ctx.fillText(`a=${a.toFixed(3)} m/s²`, gx + gw - 8, gy + 28)
  }

  // ── 纸带（最下方）──
  function drawPaperTape(ctx, r) {
    const s = stateRef.current
    const w = r.screenW, h = r.screenH
    const tapeH = 90
    const tapeY = h - tapeH / 2 - 16
    const startX = 40, endX = w - 40, tapeW = endX - startX

    ctx.fillStyle = 'rgba(245,240,224,0.1)'
    ctx.fillRect(startX, tapeY - tapeH / 2, tapeW, tapeH)

    ctx.strokeStyle = 'rgba(180,170,150,0.5)'; ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(startX, tapeY - tapeH / 2); ctx.lineTo(endX, tapeY - tapeH / 2)
    ctx.moveTo(startX, tapeY + tapeH / 2); ctx.lineTo(endX, tapeY + tapeH / 2)
    ctx.stroke()

    ctx.fillStyle = '#8b949e'; ctx.font = '11px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('纸带（打点计时器）', startX, tapeY - tapeH / 2 - 10)

    if (s.points.length === 0) {
      ctx.fillStyle = 'rgba(139,148,158,0.3)'; ctx.font = '12px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('点击"开始打点"记录纸带', w / 2, tapeY)
      return
    }

    ctx.save()
    ctx.beginPath(); ctx.rect(startX, tapeY - tapeH / 2 - 1, tapeW, tapeH + 2); ctx.clip()

    // 用总路程缩放，确保所有点可见
    const maxDist = Math.max(s.totalDistance, 0.3)
    const pxPerM = tapeW / maxDist
    const offsetX = s.tapeScrollX

    for (let i = 0; i < s.points.length; i++) {
      const x = startX + 10 + s.points[i].x * pxPerM + offsetX
      if (x < startX - 5) continue
      if (x > endX + 5) break
      const alpha = 0.7 + (i / s.points.length) * 0.3
      ctx.fillStyle = `rgba(21,101,192,${alpha})`
      ctx.beginPath(); ctx.arc(x, tapeY, 3.5, 0, Math.PI * 2); ctx.fill()
      if (i % 5 === 0) {
        ctx.fillStyle = 'rgba(60,70,80,0.8)'; ctx.font = 'bold 9px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(`${i}`, x, tapeY + tapeH / 2 + 13)
      }
    }

    // 间距标注
    const d = analysisRef.current
    if (d && d.selected.length > 2) {
      const maxShow = Math.min(d.selected.length - 1, 10)
      for (let i = 0; i < maxShow; i++) {
        const x1 = startX + 10 + d.selected[i].x * pxPerM + offsetX
        const x2 = startX + 10 + d.selected[i + 1].x * pxPerM + offsetX
        if (x2 < startX || x1 > endX) continue
        if (x2 > endX + 5) break
        ctx.strokeStyle = 'rgba(230,126,34,0.6)'; ctx.lineWidth = 1.5
        ctx.setLineDash([4, 3])
        ctx.beginPath()
        ctx.moveTo(x1, tapeY - tapeH / 2 - 6)
        ctx.lineTo(x2, tapeY - tapeH / 2 - 6)
        ctx.stroke()
        ctx.setLineDash([])
        const dx = d.selected[i + 1].x - d.selected[i].x
        ctx.fillStyle = 'rgba(230,126,34,0.9)'; ctx.font = 'bold 9px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(`${(dx * 100).toFixed(1)}`, (x1 + x2) / 2, tapeY - tapeH / 2 - 14)
      }
    }

    ctx.restore()

    if (maxDist * pxPerM > tapeW) {
      ctx.fillStyle = 'rgba(139,148,158,0.5)'; ctx.font = '10px sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText('← 拖拽滚动 →', endX, tapeY + tapeH / 2 + 26)
    }
  }

  // ═══════════════════════════════════════════════
  // 交互
  // ═══════════════════════════════════════════════
  const handleMouseDown = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const sy = e.clientY - rect.top
    const h = rect.height
    const tapeY = h - 90 / 2 - 16
    if (Math.abs(sy - tapeY) < 60) {
      interactionRef.current = { dragging: true, startX: e.clientX, scrollStart: stateRef.current.tapeScrollX }
    }
  }, [])

  const handleMouseMove = useCallback((e) => {
    if (interactionRef.current.dragging) {
      stateRef.current.tapeScrollX = interactionRef.current.scrollStart + (e.clientX - interactionRef.current.startX)
    }
  }, [])

  const handleMouseUp = useCallback(() => { interactionRef.current.dragging = false }, [])

  const handleCanvasClick = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top
    const w = rendererRef.current?.screenW || 0

    if (!stateRef.current.panelCollapsed) {
      if (sx >= 10 + 230 - 20 && sx <= 10 + 230 && sy >= 4 && sy <= 22) {
        stateRef.current.panelCollapsed = true; uiTick(n => n + 1); return
      }
    } else {
      if (sx >= 10 && sx <= 130 && sy >= 10 && sy <= 34) {
        stateRef.current.panelCollapsed = false; uiTick(n => n + 1); return
      }
    }

    const gw = Math.min(260, (w - 270) * 0.85)
    const gx = w - gw - 10
    if (!stateRef.current.vtCollapsed) {
      if (sx >= gx + gw - 20 && sx <= gx + gw + 2 && sy >= 4 && sy <= 22) {
        stateRef.current.vtCollapsed = true; uiTick(n => n + 1); return
      }
    } else {
      if (sx >= gx && sx <= gx + 110 && sy >= 10 && sy <= 34) {
        stateRef.current.vtCollapsed = false; uiTick(n => n + 1); return
      }
    }
  }, [])

  // ═══════════════════════════════════════════════
  // 控制
  // ═══════════════════════════════════════════════
  const resetState = useCallback((keepParams) => {
    const s = stateRef.current
    if (!keepParams) { s.v0 = 0.2; s.acceleration = 0.5 }
    s.points = []
    s.simTime = 0
    s.currentX = 0
    s.currentV = 0
    s.totalDistance = 0
    s.running = false
    s.tapeScrollX = 0
    analysisRef.current = null
    setRunning(false)
  }, [])

  const handleStart = useCallback(() => {
    resetState(true)
    stateRef.current.running = true
    lastTimeRef.current = performance.now()
    setRunning(true)
  }, [resetState])

  const handleStop = useCallback(() => {
    stateRef.current.running = false
    setRunning(false)
    analyzeData()
    uiTick(n => n + 1)
  }, [])

  const handleReset = useCallback(() => resetState(false), [resetState])

  // 预设：读取 stateRef.current 最新值（非渲染快照）
  const applyPreset = useCallback((getV0, a) => {
    const currentV0 = typeof getV0 === 'function' ? getV0() : getV0
    stateRef.current.v0 = currentV0
    stateRef.current.acceleration = a
    resetState(true)
    uiTick(n => n + 1)
  }, [resetState])

  const s = stateRef.current

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>研究匀变速直线运动</span>
        <div style={styles.topActions}>
          {!running ? (
            <button style={styles.playBtn} onClick={handleStart}>▶ 开始打点</button>
          ) : (
            <button style={styles.pauseBtn} onClick={handleStop}>⏸ 停止</button>
          )}
          <button style={styles.setBtn} onClick={handleReset}>⚙ 重置</button>
          <div style={styles.sep} />
          <button style={styles.btn} onClick={() => applyPreset(() => 0, 9.8)}>自由落体</button>
          <button style={styles.btn} onClick={() => applyPreset(() => stateRef.current.v0, 0)}>匀速</button>
          <button style={styles.btn} onClick={() => applyPreset(() => stateRef.current.v0, -0.5)}>匀减速</button>
          <button style={styles.btn} onClick={() => applyPreset(() => stateRef.current.v0, 0.5)}>匀加速</button>
        </div>
      </div>

      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>v₀</span>
          <input type="range" min="0" max="2" step="0.05"
            value={s.v0}
            onChange={(e) => { stateRef.current.v0 = parseFloat(e.target.value); uiTick(n => n + 1) }}
            style={styles.slider} />
          <span style={styles.sliderVal}>{s.v0.toFixed(2)} m/s</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>a</span>
          <input type="range" min="-5" max="10" step="0.1"
            value={s.acceleration}
            onChange={(e) => { stateRef.current.acceleration = parseFloat(e.target.value); uiTick(n => n + 1) }}
            style={styles.slider} />
          <span style={styles.sliderVal}>{s.acceleration.toFixed(1)} m/s²</span>
        </label>
        <div style={styles.sep} />
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>频率</span>
          <select value={s.tickerFreq}
            onChange={(e) => {
              stateRef.current.tickerFreq = parseInt(e.target.value)
              if (stateRef.current.points.length > 0 && !stateRef.current.running) analyzeData()
              uiTick(n => n + 1)
            }}
            style={styles.select}>
            <option value="20">20 Hz</option>
            <option value="50">50 Hz</option>
            <option value="100">100 Hz</option>
          </select>
        </label>
        <span style={styles.timer}>
          t = {(s.points.length > 0 ? (s.points.length - 1) / s.tickerFreq : 0).toFixed(3)} s
        </span>
      </div>

      <div style={styles.main}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleCanvasClick}
      >
        <canvas ref={canvasRef} style={styles.canvas} />
      </div>

      <div style={styles.desc}>
        <b>实验：研究匀变速直线运动</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          调节 v₀ 和 a，点击"开始打点"记录纸带，停止后自动用逐差法求 a，验证 Δs = aT²。面板可折叠 ✕，纸带可拖拽滚动。
        </span>
      </div>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex', flexDirection: 'column',
    height: '100vh', maxHeight: '100vh',
    background: '#e8e8e8', color: '#333',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    overflow: 'hidden',
  },
  topBar: {
    background: '#f5f5f5', borderBottom: '1px solid #ccc',
    display: 'flex', alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 12px', flexShrink: 0,
    flexWrap: 'wrap', gap: 6,
  },
  title: { fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' },
  topActions: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  controlBar: {
    background: '#fafafa', borderBottom: '1px solid #ddd',
    display: 'flex', alignItems: 'center',
    padding: '4px 12px', flexShrink: 0,
    gap: 10, overflowX: 'auto',
  },
  controlLabel: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#555', whiteSpace: 'nowrap' },
  controlName: { fontWeight: 600, color: '#4A90D9', minWidth: 14 },
  slider: { width: 70, accentColor: '#4A90D9' },
  sliderVal: { color: '#4A90D9', fontWeight: 600, minWidth: 55, fontSize: 12, textAlign: 'right' },
  select: { background: '#fff', color: '#333', border: '1px solid #ccc', borderRadius: 4, padding: '3px 6px', fontSize: 12 },
  btn: { background: '#fff', color: '#4A90D9', border: '1px solid #ccc', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' },
  playBtn: { background: '#4A90D9', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  pauseBtn: { background: '#E53935', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  setBtn: { background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
  sep: { width: 1, height: 18, background: '#ccc', flexShrink: 0 },
  timer: { fontFamily: 'Consolas,monospace', fontSize: 13, color: '#4A90D9', fontWeight: 600 },
  main: { flex: 1, display: 'flex', overflow: 'hidden', background: '#fff', position: 'relative', minHeight: 0 },
  canvas: { flex: 1, width: '100%', display: 'block' },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
}
