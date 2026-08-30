import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * PulleyEfficiencyScene — 测量滑轮组机械效率（v6 重建+弧线修复）
 *
 * 绕线规则（n=2，平行四边形结构）：
 * - 吊线：横梁 → 竖直下 → 定滑轮中心
 * - 左绳段：定滑轮中心 → 动滑轮左切点（斜线）
 * - 动滑轮下半圆：左→下→右 [arc(π, 2π, false)]
 * - 右绳段：动滑轮右切点 → 定滑轮右切点（竖直）
 * - 定滑轮下半圆：右→下→左 [arc(0, π, true)]
 * - 自由端：定滑轮左切点 → 竖直下 → 手柄
 *
 * 交互：拖拽底部手柄，手柄下拉s，重物上升h，s=n·h
 *
 * Canvas弧线方向（arc-test.html实测）：
 * - arc(0, π, false) = 上半圆（右→上→左）
 * - arc(0, π, true) = 下半圆（右→下→左）← 定滑轮用这个
 * - arc(π, 2π, false) = 下半圆（左→下→右）← 动滑轮用这个（已修复）
 * - arc(π, 2π, true) = 上半圆（左→上→右）
 */

const R = 18
const HANDLE_R = 10
const CANVAS_W = 520
const CANVAS_H = 560
const FRAME_TOP = 40
const FRAME_CX = 200
const PX_PER_M = 80

export default function PulleyEfficiencyScene() {
  const canvasRef = useRef(null)
  const rafRef = useRef(null)

  const S = useRef({
    G: 10, G0: 2, n: 2, mu: 0.10,
    s: 0,
    dragging: false, dragStartY: 0, dragStartS: 0,
    hoverHandle: false,
    records: [], breathPhase: 0,
  })

  const [gVal, setGVal] = useState(10)
  const [g0Val, setG0Val] = useState(2)
  const [nVal, setNVal] = useState(2)
  const [muVal, setMuVal] = useState(0.10)
  const [sVal, setSVal] = useState(0)
  const [records, setRecords] = useState([])
  const [showConclusion, setShowConclusion] = useState(false)
  const [, tick] = useState(0)
  const triggerRender = useCallback(() => tick(n => n + 1), [])

  function calc() {
    const { G, G0, n, mu, s } = S.current
    const h = s / n
    const F_ideal = (G + G0) / n
    const F_friction = F_ideal * mu
    const F = F_ideal * (1 + mu)
    const W_useful = G * h
    const W_total = F * s
    const W_extra = W_total - W_useful
    const W_pulley = G0 * h
    const W_friction = W_extra - W_pulley
    const eta = W_total > 0 ? (W_useful / W_total) * 100 : 0
    const eta_ideal = G / (G + G0) * 100
    return { h, F_ideal, F_friction, F, s, W_useful, W_total, W_extra, W_pulley, W_friction, eta, eta_ideal }
  }

  function getLayout() {
    const { n, s } = S.current
    const cx = FRAME_CX
    const fpx = cx, fpy = FRAME_TOP + 60
    const baseMpy = fpy + 150
    const hPx = (s / n) * PX_PER_M
    const mpy = baseMpy - hPx
    const mpx = cx
    const xL = mpx - R, xR = mpx + R
    const weightW = 60, weightH = 44
    const weightY = mpy + R + 14
    const handleX = n === 2 ? xL : xR
    const handleY = fpy + 200 + s * PX_PER_M
    return { cx, fpx, fpy, mpx, mpy, xL, xR, weightY, weightW, weightH, handleX, handleY }
  }

  function drawLine(ctx, x1, y1, x2, y2) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
  }

  function drawGrid(ctx) {
    ctx.strokeStyle = '#ececec'; ctx.lineWidth = 0.5
    for (let x = 0; x <= CANVAS_W; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke() }
    for (let y = 0; y <= CANVAS_H; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke() }
    ctx.fillStyle = '#ccc'; ctx.font = '9px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('每格 ≈ 0.1m', 4, CANVAS_H - 4)
  }

  function drawFrame(ctx) {
    const { cx, fpx, fpy } = getLayout()
    const fl = cx - 60, fr = cx + 60
    ctx.strokeStyle = '#888'; ctx.lineCap = 'round'
    ctx.lineWidth = 4
    drawLine(ctx, fl, FRAME_TOP, fl, CANVAS_H - 20)
    drawLine(ctx, fr, FRAME_TOP, fr, CANVAS_H - 20)
    ctx.lineWidth = 5
    drawLine(ctx, fl - 8, FRAME_TOP, fr + 8, FRAME_TOP)
    ctx.lineWidth = 6
    drawLine(ctx, fl - 25, CANVAS_H - 20, fr + 25, CANVAS_H - 20)
    ctx.strokeStyle = '#999'; ctx.lineWidth = 3
    drawLine(ctx, fl, FRAME_TOP + 15, fpx, FRAME_TOP + 15)
    ctx.lineWidth = 2
    drawLine(ctx, fpx, FRAME_TOP + 15, fpx, fpy - R)
  }

  function drawPulley(ctx, x, y, r, label) {
    const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r)
    grad.addColorStop(0, '#f0f0f0'); grad.addColorStop(1, '#aaa')
    ctx.fillStyle = grad
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#555'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = '#777'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(x, y, r - 4, 0, Math.PI * 2); ctx.stroke()
    ctx.fillStyle = '#555'
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(label, x, y)
  }

  function drawRope(ctx, L) {
    const { fpx, fpy, mpx, mpy, xL, xR, handleX, handleY, n } = L
    ctx.lineCap = 'round'

    if (n === 2) {
      // ── 吊线 ──
      ctx.strokeStyle = '#8B6914'; ctx.lineWidth = 2.5
      drawLine(ctx, fpx, FRAME_TOP - 10, fpx, fpy)

      // ── 承重绳段（橙色）──
      ctx.strokeStyle = '#f5a623'; ctx.lineWidth = 3.5
      drawLine(ctx, fpx, fpy, xL, mpy)     // 左：定心→动左切
      drawLine(ctx, xR, mpy, xR, fpy)      // 右：动右切→定右切

      // ── 弧线（棕色）──
      ctx.strokeStyle = '#8B6914'; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.arc(mpx, mpy, R, Math.PI, 2 * Math.PI, false); ctx.stroke() // 动下滑
      ctx.beginPath(); ctx.arc(fpx, fpy, R, 0, Math.PI, true); ctx.stroke()            // 定下滑

      // ── 自由端 ──
      ctx.strokeStyle = '#8B6914'; ctx.lineWidth = 2.5
      drawLine(ctx, xL, fpy, xL, handleY)

    } else {
      // n=3
      // ── 吊线（从动滑轮挂钩向上）──
      ctx.strokeStyle = '#8B6914'; ctx.lineWidth = 2.5
      drawLine(ctx, mpx, mpy - R, mpx, FRAME_TOP - 10)

      // ── 承重绳段（橙色）──
      ctx.strokeStyle = '#f5a623'; ctx.lineWidth = 3.5
      drawLine(ctx, mpx, mpy - R, xR, fpy) // 动挂钩→定右切
      drawLine(ctx, xL, fpy, xL, mpy)      // 定左切→动左切

      // ── 弧线（棕色）──
      ctx.strokeStyle = '#8B6914'; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.arc(fpx, fpy, R, 0, Math.PI, true); ctx.stroke()            // 定下滑
      ctx.beginPath(); ctx.arc(mpx, mpy, R, Math.PI, 2 * Math.PI, false); ctx.stroke() // 动下滑

      // ── 自由端（从动右切向上经改向轮向下到手柄）──
      ctx.strokeStyle = '#8B6914'; ctx.lineWidth = 2.5
      const redirectX = xR + 15, redirectY = fpy - 30
      drawLine(ctx, xR, mpy, redirectX, redirectY)
      ctx.fillStyle = '#888'
      ctx.beginPath(); ctx.arc(redirectX, redirectY, 5, 0, 2 * Math.PI); ctx.fill()
      ctx.strokeStyle = '#555'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(redirectX, redirectY, 5, 0, 2 * Math.PI); ctx.stroke()
      ctx.strokeStyle = '#8B6914'; ctx.lineWidth = 2.5
      drawLine(ctx, redirectX, redirectY, handleX, handleY)
    }
  }

  function drawWeight(ctx, L) {
    const { mpx, mpy, weightY, weightW, weightH } = L
    ctx.strokeStyle = '#666'; ctx.lineWidth = 2
    drawLine(ctx, mpx, mpy + R, mpx, weightY)
    const x = mpx - weightW / 2, y = weightY
    const grad = ctx.createLinearGradient(x, y, x, y + weightH)
    grad.addColorStop(0, '#e85050'); grad.addColorStop(1, '#b03030')
    ctx.fillStyle = grad
    const rr = 5
    ctx.beginPath()
    ctx.moveTo(x + rr, y); ctx.lineTo(x + weightW - rr, y)
    ctx.arcTo(x + weightW, y, x + weightW, y + rr, rr)
    ctx.lineTo(x + weightW, y + weightH - rr)
    ctx.arcTo(x + weightW, y + weightH, x + weightW - rr, y + weightH, rr)
    ctx.lineTo(x + rr, y + weightH)
    ctx.arcTo(x, y + weightH, x, y + weightH - rr, rr)
    ctx.lineTo(x, y + rr)
    ctx.arcTo(x, y, x + rr, y, rr)
    ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 15px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(`${S.current.G}N`, mpx, y + weightH / 2)
  }

  function drawHandle(ctx, L) {
    const { handleX, handleY } = L
    const hover = S.current.hoverHandle
    ctx.fillStyle = hover ? '#e0e0e0' : '#f0f0f0'
    ctx.strokeStyle = hover ? '#666' : '#888'
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(handleX, handleY, HANDLE_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = hover ? '#555' : '#888'
    ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('⋮⋮', handleX, handleY)
    ctx.font = '10px sans-serif'
    ctx.fillText('↓ 拉', handleX, handleY + HANDLE_R + 12)
  }

  function drawAnnotations(ctx, L, calcs) {
    const { fpx, fpy, mpx, mpy, xL, xR, weightY, weightW, weightH, handleX, handleY } = L
    const { s, n } = S.current
    const { h, F } = calcs

    // h标注
    if (h > 0.005) {
      const initCY = fpy + 150 + R + 14 + weightH / 2
      const curCY = weightY + weightH / 2
      const ax = 35
      ctx.strokeStyle = '#f5a623'; ctx.lineWidth = 2; ctx.fillStyle = '#f5a623'
      drawLine(ctx, ax - 6, initCY, ax + 6, initCY)
      drawLine(ctx, ax - 6, curCY, ax + 6, curCY)
      drawLine(ctx, ax, initCY, ax, curCY)
      ctx.beginPath(); ctx.moveTo(ax - 4, initCY - 7); ctx.lineTo(ax, initCY); ctx.lineTo(ax + 4, initCY - 7); ctx.fill()
      ctx.beginPath(); ctx.moveTo(ax - 4, curCY + 7); ctx.lineTo(ax, curCY); ctx.lineTo(ax + 4, curCY + 7); ctx.fill()
      ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText(`h = ${h.toFixed(2)} m`, ax + 8, (initCY + curCY) / 2)
    }

    // s标注
    if (s > 0.005) {
      ctx.fillStyle = '#4a9eff'; ctx.font = '11px sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(`s = ${s.toFixed(2)} m`, handleX - HANDLE_R - 8, handleY - 12)
    }

    // G物箭头
    ctx.strokeStyle = '#e85050'; ctx.fillStyle = '#e85050'; ctx.lineWidth = 2
    const gx = mpx - weightW / 2 - 14
    drawLine(ctx, gx, weightY + 5, gx, weightY + 22)
    ctx.beginPath(); ctx.moveTo(gx - 4, weightY + 17); ctx.lineTo(gx, weightY + 24); ctx.lineTo(gx + 4, weightY + 17); ctx.fill()
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'right'
    ctx.fillText('G物', gx - 5, weightY + 16)

    // G动箭头
    ctx.strokeStyle = '#4a9eff'; ctx.fillStyle = '#4a9eff'; ctx.lineWidth = 2
    const g0x = mpx + R + 12
    drawLine(ctx, g0x, mpy - 6, g0x, mpy + 6)
    ctx.beginPath(); ctx.moveTo(g0x - 4, mpy + 1); ctx.lineTo(g0x, mpy + 8); ctx.lineTo(g0x + 4, mpy + 1); ctx.fill()
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('G动', g0x + 5, mpy + 3)

    // F箭头
    ctx.strokeStyle = '#2ecc71'; ctx.fillStyle = '#2ecc71'; ctx.lineWidth = 2.5
    drawLine(ctx, handleX, handleY - HANDLE_R - 18, handleX, handleY - HANDLE_R - 2)
    ctx.beginPath(); ctx.moveTo(handleX - 5, handleY - HANDLE_R - 7); ctx.lineTo(handleX, handleY - HANDLE_R); ctx.lineTo(handleX + 5, handleY - HANDLE_R - 7); ctx.fill()
    ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'right'
    ctx.fillText(`F = ${F.toFixed(2)} N`, handleX - 8, handleY - HANDLE_R - 6)

    // 呼吸提示
    if (s === 0 && !S.current.dragging) {
      const alpha = 0.3 + 0.3 * Math.sin(S.current.breathPhase)
      ctx.fillStyle = `rgba(232,80,80,${alpha})`
      ctx.font = '12px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('↓ 拖拽手柄开始实验 ↓', handleX, handleY + HANDLE_R + 28)
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    function render() {
      S.current.breathPhase += 0.03
      const L = getLayout()
      const calcs = calc()
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
      ctx.fillStyle = '#fafafa'
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
      drawGrid(ctx)
      drawFrame(ctx)
      drawRope(ctx, L)
      drawPulley(ctx, L.fpx, L.fpy, R, '定')
      drawPulley(ctx, L.mpx, L.mpy, R, '动')
      drawWeight(ctx, L)
      drawHandle(ctx, L)
      drawAnnotations(ctx, L, calcs)
      rafRef.current = requestAnimationFrame(render)
    }
    render()
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [])

  const getPos = useCallback((e) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const hasTouches = e.touches && e.touches.length > 0
    const t = hasTouches ? e.touches[0] : (e.changedTouches && e.changedTouches[0]) || e
    if (!t || t.clientX == null) return null
    return {
      x: (t.clientX - rect.left) * (canvas.width / rect.width),
      y: (t.clientY - rect.top) * (canvas.height / rect.height),
    }
  }, [])

  const handleDown = useCallback((e) => {
    e.preventDefault()
    const pos = getPos(e)
    if (!pos) return
    const canvas = canvasRef.current
    const L = getLayout()
    const dx = pos.x - L.handleX, dy = pos.y - L.handleY
    if (dx * dx + dy * dy <= (HANDLE_R + 12) * (HANDLE_R + 12)) {
      S.current.dragging = true
      S.current.dragStartY = pos.y
      S.current.dragStartS = S.current.s
      canvas.style.cursor = 'grabbing'
    }
  }, [getPos])

  const handleMove = useCallback((e) => {
    const pos = getPos(e)
    if (!pos) return
    const canvas = canvasRef.current
    const L = getLayout()
    if (!S.current.dragging) {
      const dx = pos.x - L.handleX, dy = pos.y - L.handleY
      const inH = dx * dx + dy * dy <= (HANDLE_R + 12) * (HANDLE_R + 12)
      S.current.hoverHandle = inH
      if (canvas) canvas.style.cursor = inH ? 'grab' : 'default'
      return
    }
    e.preventDefault()
    const dy = pos.y - S.current.dragStartY
    const ds = dy / PX_PER_M
    let newS = S.current.dragStartS + ds
    newS = Math.max(0, Math.min(S.current.n * 1.5, newS))
    newS = Math.round(newS * 100) / 100
    S.current.s = newS
    setSVal(newS)
    triggerRender()
  }, [getPos, triggerRender])

  const handleUp = useCallback(() => {
    S.current.dragging = false
    const canvas = canvasRef.current
    if (canvas) canvas.style.cursor = S.current.hoverHandle ? 'grab' : 'default'
  }, [])

  const updateG = useCallback((v) => { S.current.G = v; setGVal(v); triggerRender() }, [triggerRender])
  const updateG0 = useCallback((v) => { S.current.G0 = v; setG0Val(v); triggerRender() }, [triggerRender])
  const updateN = useCallback((v) => { S.current.n = v; setNVal(v); triggerRender() }, [triggerRender])
  const updateMu = useCallback((v) => { S.current.mu = v; setMuVal(v); triggerRender() }, [triggerRender])

  const addRecord = useCallback(() => {
    const calcs = calc()
    const rec = {
      id: records.length + 1,
      G: S.current.G, G0: S.current.G0, n: S.current.n, mu: S.current.mu,
      h: calcs.h, s: calcs.s, F: calcs.F,
      W_useful: calcs.W_useful, W_total: calcs.W_total, eta: calcs.eta,
    }
    const newR = [...records, rec]
    setRecords(newR)
    if (newR.length >= 3) setShowConclusion(true)
  }, [records])

  const clearRecords = useCallback(() => {
    if (window.confirm('确定清空所有记录数据？')) {
      setRecords([]); setShowConclusion(false)
    }
  }, [])

  const resetPos = useCallback(() => {
    S.current.s = 0; setSVal(0); triggerRender()
  }, [triggerRender])

  const calcs = calc()

  const st = {
    wrap: { display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'system-ui, sans-serif', background: '#f5f5f5', overflow: 'hidden' },
    topBar: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 14px', background: '#2c3e50', color: '#fff', flexShrink: 0, flexWrap: 'wrap', minHeight: 44 },
    backBtn: { background: 'none', border: '1px solid #556', color: '#fff', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 13 },
    title: { fontSize: 15, fontWeight: 700 },
    sg: { display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' },
    si: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 },
    sl: { color: '#adc', whiteSpace: 'nowrap' },
    sv: { color: '#fff', fontWeight: 600, minWidth: 42, textAlign: 'right' },
    slr: { width: 80, accentColor: '#3498db' },
    nt: { display: 'flex', gap: 2, background: '#1a252f', borderRadius: 4, padding: 2 },
    nb: (a) => ({ padding: '2px 10px', borderRadius: 3, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: a ? '#3498db' : 'transparent', color: a ? '#fff' : '#889' }),
    rbtns: { display: 'flex', gap: 5, alignItems: 'center', marginLeft: 'auto' },
    tag: { padding: '2px 7px', borderRadius: 3, fontSize: 11, color: '#fff' },
    abtn: { padding: '3px 8px', borderRadius: 4, border: '1px solid #556', background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 11 },
    main: { display: 'flex', flex: 1, overflow: 'hidden' },
    cwrap: { flex: '0 0 62%', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: 6, background: '#fafafa' },
    cvs: { border: '1px solid #ddd', borderRadius: 4, cursor: 'default', touchAction: 'none' },
    panel: { flex: '0 0 38%', minWidth: 320, padding: '12px 16px', background: '#fff', borderLeft: '1px solid #e0e0e0', overflowY: 'auto', overflowX: 'hidden' },
    ptitle: { fontSize: 14, fontWeight: 700, marginBottom: 8, color: '#2c3e50' },
    grid: { display: 'grid', gridTemplateColumns: '1fr auto', gap: '1px 0', alignItems: 'center' },
    rl: { fontSize: 13, color: '#333', padding: '3px 0' },
    rv: { fontSize: 13, color: '#333', textAlign: 'right', minWidth: 80, paddingRight: 4 },
    rvB: { fontSize: 13, color: '#333', textAlign: 'right', minWidth: 80, paddingRight: 4, fontWeight: 700 },
    rvA: { fontSize: 14, color: '#e67e22', textAlign: 'right', minWidth: 80, paddingRight: 4, fontWeight: 700 },
    div: { borderTop: '1px solid #e8e8e8', margin: '4px 0', gridColumn: '1 / -1' },
    sec: { fontSize: 11, color: '#999', gridColumn: '1 / -1', marginTop: 1 },
    sub: { fontSize: 12, color: '#666', paddingLeft: 12 },
    subV: { fontSize: 12, color: '#666', textAlign: 'right', minWidth: 80, paddingRight: 4 },
    bottom: { flexShrink: 0, padding: '8px 16px', background: '#fff', borderTop: '1px solid #e0e0e0' },
    formula: { fontSize: 14, fontWeight: 600, color: '#2c3e50', fontFamily: 'serif', marginBottom: 4 },
    hint: { fontSize: 12, color: '#777' },
    conclusion: { marginTop: 8, padding: 8, background: '#e8f5e9', border: '1px solid #4caf50', borderRadius: 6, fontSize: 12, gridColumn: '1 / -1' },
    table: { marginTop: 8, fontSize: 10, width: '100%', borderCollapse: 'collapse', gridColumn: '1 / -1' },
    th: { background: '#f0f0f0', padding: '3px 4px', textAlign: 'center', border: '1px solid #ddd' },
    td: { padding: '2px 4px', textAlign: 'center', border: '1px solid #eee' },
  }

  return (
    <div style={st.wrap}>
      <div style={st.topBar}>
        <button style={st.backBtn} onClick={() => window.dispatchEvent(new CustomEvent('lab-navigate', { detail: { key: null } }))}>← 返回目录</button>
        <span style={st.title}>测量滑轮组机械效率</span>
        <div style={st.sg}>
          <div style={st.si}><span style={st.sl}>物重 G物</span><input type="range" min={1} max={20} step={1} value={gVal} style={st.slr} onChange={e => updateG(Number(e.target.value))} /><span style={st.sv}>{gVal.toFixed(1)} N</span></div>
          <div style={st.si}><span style={st.sl}>动滑轮重 G动</span><input type="range" min={0.5} max={5} step={0.5} value={g0Val} style={st.slr} onChange={e => updateG0(Number(e.target.value))} /><span style={st.sv}>{g0Val.toFixed(1)} N</span></div>
          <div style={st.si}><span style={st.sl}>摩擦系数 μ</span><input type="range" min={0} max={0.3} step={0.01} value={muVal} style={st.slr} onChange={e => updateMu(Number(e.target.value))} /><span style={st.sv}>{muVal.toFixed(2)}</span></div>
          <div style={st.si}><span style={st.sl}>绳段数 n</span><div style={st.nt}><button style={st.nb(nVal === 2)} onClick={() => updateN(2)}>2段</button><button style={st.nb(nVal === 3)} onClick={() => updateN(3)}>3段</button></div></div>
        </div>
        <div style={st.rbtns}>
          <span style={{ ...st.tag, background: '#27ae60' }}>九年级</span>
          <span style={{ ...st.tag, background: '#e67e22' }}>★★☆</span>
          <button style={st.abtn} onClick={addRecord}>📝 记录</button>
          <button style={st.abtn} onClick={resetPos}>↺ 重置</button>
          <button style={st.abtn} onClick={clearRecords}>🗑 清空</button>
        </div>
      </div>
      <div style={st.main}>
        <div style={st.cwrap}>
          <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} style={st.cvs}
            onMouseDown={handleDown} onMouseMove={handleMove} onMouseUp={handleUp} onMouseLeave={handleUp}
            onTouchStart={handleDown} onTouchMove={handleMove} onTouchEnd={handleUp} />
        </div>
        <div style={st.panel}>
          <div style={st.ptitle}>📊 实时数据</div>
          <div style={st.grid}>
            <span style={st.rl}>物重 G物</span><span style={st.rv}>{gVal.toFixed(2)} N</span>
            <span style={st.rl}>动滑轮重 G动</span><span style={st.rv}>{g0Val.toFixed(2)} N</span>
            <span style={st.rl}>绳段数 n</span><span style={st.rv}>{nVal}</span>
            <span style={st.rl}>摩擦系数 μ</span><span style={st.rv}>{muVal.toFixed(2)}</span>
            <div style={st.div} /><span style={st.sec}>拉力分析</span>
            <span style={st.rl}>理想拉力 F理想</span><span style={st.rv}>{calcs.F_ideal.toFixed(2)} N</span>
            <span style={st.rl}>摩擦附加</span><span style={st.rv}>+{calcs.F_friction.toFixed(2)} N</span>
            <span style={st.rl}>实际拉力 F</span><span style={st.rvB}>{calcs.F.toFixed(2)} N</span>
            <div style={st.div} /><span style={st.sec}>距离</span>
            <span style={st.rl}>提升高度 h</span><span style={st.rv}>{calcs.h.toFixed(2)} m</span>
            <span style={st.rl}>绳端距离 s</span><span style={st.rv}>{calcs.s.toFixed(2)} m</span>
            <span style={{ fontSize: 11, color: '#999', gridColumn: '1 / -1', textAlign: 'center' }}>（s = n × h = {nVal} × {calcs.h.toFixed(2)}）</span>
            <div style={st.div} /><span style={st.sec}>功与效率</span>
            <span style={st.rl}>有用功 W有</span><span style={st.rv}>{calcs.W_useful.toFixed(2)} J</span>
            <span style={st.rl}>总功 W总</span><span style={st.rv}>{calcs.W_total.toFixed(2)} J</span>
            <span style={st.rl}>额外功 W额</span><span style={st.rv}>{calcs.W_extra.toFixed(2)} J</span>
            <span style={st.sub}>├ 动滑轮重做功</span><span style={st.subV}>{calcs.W_pulley.toFixed(2)} J</span>
            <span style={st.sub}>└ 摩擦做功</span><span style={st.subV}>{calcs.W_friction.toFixed(2)} J</span>
            <div style={st.div} />
            <span style={st.rl}>机械效率 η</span><span style={st.rvA}>{calcs.eta.toFixed(1)} %</span>
            <span style={{ fontSize: 11, color: '#999' }}>（理想无摩擦）</span>
            <span style={{ fontSize: 11, color: '#999', textAlign: 'right', minWidth: 80, paddingRight: 4 }}>{calcs.eta_ideal.toFixed(1)} %</span>
            {showConclusion && (<div style={st.conclusion}><div style={{ fontWeight: 700, marginBottom: 4 }}>📋 实验结论</div><div>① 物重越大，机械效率越高</div><div>② 动滑轮越重，机械效率越低</div><div>③ 摩擦越大，机械效率越低</div></div>)}
            {records.length > 0 && (<div style={{ marginTop: 8, gridColumn: '1 / -1' }}><div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>📝 实验记录</div><div style={{ overflowX: 'auto' }}><table style={st.table}><thead><tr>{['#','G物','G动','n','μ','h','s','F','W有','W总','η'].map(h => <th key={h} style={st.th}>{h}</th>)}</tr></thead><tbody>{records.map(r => (<tr key={r.id}><td style={st.td}>{r.id}</td><td style={st.td}>{r.G}</td><td style={st.td}>{r.G0}</td><td style={st.td}>{r.n}</td><td style={st.td}>{r.mu.toFixed(2)}</td><td style={st.td}>{r.h.toFixed(2)}</td><td style={st.td}>{r.s.toFixed(2)}</td><td style={st.td}>{r.F.toFixed(2)}</td><td style={st.td}>{r.W_useful.toFixed(2)}</td><td style={st.td}>{r.W_total.toFixed(2)}</td><td style={st.td}>{r.eta.toFixed(1)}%</td></tr>))}</tbody></table></div></div>)}
          </div>
        </div>
      </div>
      <div style={st.bottom}>
        <div style={st.formula}>η = W有 / W总 = G物·h / (F·s) = G物 / (n·F)</div>
        <div style={st.hint}>① 调节参数 → ② 下拉手柄模拟提升（s=n·h） → ③ 点击"记录"保存数据</div>
      </div>
    </div>
  )
}
