import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * PulleyEfficiencyScene — 测量滑轮组机械效率（v8 完全重写）
 *
 * n=2：定滑轮中心轴→水平到左切点(被遮)→竖直下到动滑轮左切点→下半圆→定滑轮右切点→上半圆→自由端向下
 * n=3：动滑轮中心→斜上到定滑轮左切点→上半圆→定滑轮右切点→竖直下到动滑轮右切点→下半圆→自由端向上
 *
 * 弧线方向（实测）：arc(0,π,false)=上半圆，arc(π,2π,false)=下半圆
 * 渲染顺序：绳子先画→滑轮后画（遮住穿心部分）
 */

const R = 18
const CANVAS_W = 520
const CANVAS_H = 540
const FRAME_TOP = 40
const FRAME_CX = 180

export default function PulleyEfficiencyScene() {
  const canvasRef = useRef(null)
  const rafRef = useRef(null)
  const S = useRef({ G: 10, G0: 2, n: 2, mu: 0.10, h: 0, dragging: false, dragStartY: 0, dragStartH: 0, hoverWeight: false, hoverHandle: false, records: [], breathPhase: 0 })
  const [gVal, setGVal] = useState(10)
  const [g0Val, setG0Val] = useState(2)
  const [nVal, setNVal] = useState(2)
  const [muVal, setMuVal] = useState(0.10)
  const [hVal, setHVal] = useState(0)
  const [records, setRecords] = useState([])
  const [showConclusion, setShowConclusion] = useState(false)
  const [, tick] = useState(0)
  const triggerRender = useCallback(() => tick(n => n + 1), [])

  function calc() {
    const { G, G0, n, mu } = S.current
    const h = Math.round(S.current.h * 100) / 100
    const F_ideal = (G + G0) / n
    const F_friction = Math.round(F_ideal * mu * 100) / 100
    const F = Math.round(F_ideal * (1 + mu) * 100) / 100
    const s = Math.round(n * h * 100) / 100
    const W_useful = Math.round(G * h * 100) / 100
    const W_total = Math.round(F * s * 100) / 100
    const W_extra = Math.round((W_total - W_useful) * 100) / 100
    const W_pulley = Math.round(G0 * h * 100) / 100
    const W_friction = Math.round((W_extra - W_pulley) * 100) / 100
    const eta = W_total > 0 ? Math.round(W_useful / W_total * 1000) / 10 : 0
    const eta_ideal = Math.round(G / (G + G0) * 1000) / 10
    return { h, F_ideal, F_friction, F, s, W_useful, W_total, W_extra, W_pulley, W_friction, eta, eta_ideal }
  }

  function getLayout() {
    const { n, h } = S.current
    const cx = FRAME_CX
    const barLeft = cx - 50, barRight = cx + 70
    const fpx = cx, fpy = FRAME_TOP + 50
    const baseMpy = fpy + 130
    const hPx = (h / 1.5) * 130
    const mpy = baseMpy - hPx
    const mpx = cx
    const xL = mpx - R, xR = mpx + R
    const weightW = 60, weightH = 44
    const weightY = mpy + R + 14
    let handleX, handleY
    if (n === 2) { handleX = xL; handleY = fpy + 120 }
    else { handleX = xL; handleY = Math.max(mpy - R - 60, 30) }
    return { cx, barLeft, barRight, fpx, fpy, mpx, mpy, xL, xR, weightY, weightW, weightH, handleX, handleY, hPx }
  }

  function drawLine(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke() }

  function drawGrid(ctx) {
    ctx.strokeStyle = '#ececec'; ctx.lineWidth = 0.5
    for (let x = 0; x <= CANVAS_W; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke() }
    for (let y = 0; y <= CANVAS_H; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke() }
    ctx.fillStyle = '#ccc'; ctx.font = '9px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('每格 ≈ 0.1m', 4, CANVAS_H - 4)
  }

  function drawFrame(ctx, L) {
    const { barLeft, barRight, fpx, fpy } = L
    ctx.strokeStyle = '#888'; ctx.lineCap = 'round'
    ctx.lineWidth = 5
    drawLine(ctx, barLeft, FRAME_TOP, barLeft, CANVAS_H - 20)
    drawLine(ctx, barLeft - 5, FRAME_TOP, barRight, FRAME_TOP)
    ctx.lineWidth = 6
    drawLine(ctx, barLeft - 20, CANVAS_H - 20, barLeft + 40, CANVAS_H - 20)
    ctx.strokeStyle = '#999'; ctx.lineWidth = 3
    drawLine(ctx, fpx, FRAME_TOP, fpx, fpy - R)
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
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(label, x, y)
  }

  function drawRope(ctx, L) {
    const { fpx, fpy, mpx, mpy, xL, xR, handleX, handleY, n } = L
    ctx.lineCap = 'round'
    const C = '#8B4513', W1 = 3, W2 = 4

    if (n === 2) {
      // ① 定滑轮中心→左切点（水平，被滑轮遮住）
      ctx.strokeStyle = C; ctx.lineWidth = W1
      drawLine(ctx, fpx, fpy, xL, fpy)
      // ② 左切点→动滑轮左切点（竖直，承重）
      ctx.strokeStyle = C; ctx.lineWidth = W2
      drawLine(ctx, xL, fpy, xL, mpy)
      // ③ 动滑轮下半圆弧
      ctx.strokeStyle = C; ctx.lineWidth = W1
      ctx.beginPath(); ctx.arc(mpx, mpy, R, Math.PI, 2 * Math.PI, false); ctx.stroke()
      // ④ 动滑轮右切点→定滑轮右切点（竖直，承重）
      ctx.strokeStyle = C; ctx.lineWidth = W2
      drawLine(ctx, xR, mpy, xR, fpy)
      // ⑤ 定滑轮上半圆弧
      ctx.strokeStyle = C; ctx.lineWidth = W1
      ctx.beginPath(); ctx.arc(fpx, fpy, R, 0, Math.PI, false); ctx.stroke()
      // ⑥ 自由端向下
      ctx.strokeStyle = C; ctx.lineWidth = W1
      drawLine(ctx, xL, fpy, xL, handleY)
    } else {
      // n=3
      // ① 动滑轮中心→定滑轮左切点（斜上，承重）
      ctx.strokeStyle = C; ctx.lineWidth = W2
      drawLine(ctx, mpx, mpy, xL, fpy)
      // ② 定滑轮上半圆弧
      ctx.strokeStyle = C; ctx.lineWidth = W1
      ctx.beginPath(); ctx.arc(fpx, fpy, R, Math.PI, 2 * Math.PI, true); ctx.stroke()
      // ③ 定滑轮右切点→动滑轮右切点（竖直，承重）
      ctx.strokeStyle = C; ctx.lineWidth = W2
      drawLine(ctx, xR, fpy, xR, mpy)
      // ④ 动滑轮下半圆弧
      ctx.strokeStyle = C; ctx.lineWidth = W1
      ctx.beginPath(); ctx.arc(mpx, mpy, R, 0, Math.PI, true); ctx.stroke()
      // ⑤ 自由端向上
      ctx.strokeStyle = C; ctx.lineWidth = W2
      drawLine(ctx, xL, mpy, xL, handleY)
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
    if (S.current.dragging) { ctx.shadowColor = 'rgba(232,80,80,0.5)'; ctx.shadowBlur = 12; ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 2; ctx.stroke(); ctx.shadowBlur = 0 }
    else if (S.current.hoverWeight) { ctx.strokeStyle = '#ff8888'; ctx.lineWidth = 2; ctx.stroke() }
    ctx.fillStyle = '#fff'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(S.current.G + 'N', mpx, y + weightH / 2)
    ctx.fillStyle = S.current.hoverWeight ? '#e85050' : '#aaa'; ctx.font = '13px sans-serif'
    ctx.fillText('⋮⋮', mpx + weightW / 2 + 10, y + weightH / 2)
  }

  function drawHandle(ctx, L) {
    const { handleX, handleY, n } = L
    const h2 = S.current.hoverHandle
    ctx.fillStyle = h2 ? '#e0e0e0' : '#f0f0f0'; ctx.strokeStyle = h2 ? '#666' : '#888'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(handleX, handleY, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = h2 ? '#555' : '#888'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('⋮⋮', handleX, handleY)
    ctx.font = '10px sans-serif'
    ctx.fillText(n === 2 ? '↓ 拉' : '↑ 拉', handleX, handleY + (n === 2 ? 22 : -18))
  }

  function drawAnnotations(ctx, L, calcs) {
    const { fpx, fpy, mpx, mpy, weightY, weightW, weightH, handleX, handleY, n } = L
    const { h, F } = calcs
    if (h > 0.005) {
      const initCY = fpy + 130 + R + 14 + weightH / 2
      const curCY = weightY + weightH / 2; const ax = 30
      ctx.strokeStyle = '#f5a623'; ctx.lineWidth = 2; ctx.fillStyle = '#f5a623'
      drawLine(ctx, ax - 6, initCY, ax + 6, initCY); drawLine(ctx, ax - 6, curCY, ax + 6, curCY); drawLine(ctx, ax, initCY, ax, curCY)
      ctx.beginPath(); ctx.moveTo(ax - 4, initCY - 7); ctx.lineTo(ax, initCY); ctx.lineTo(ax + 4, initCY - 7); ctx.fill()
      ctx.beginPath(); ctx.moveTo(ax - 4, curCY + 7); ctx.lineTo(ax, curCY); ctx.lineTo(ax + 4, curCY + 7); ctx.fill()
      ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText('h = ' + h.toFixed(2) + ' m', ax + 8, (initCY + curCY) / 2)
    }
    ctx.strokeStyle = '#e85050'; ctx.fillStyle = '#e85050'; ctx.lineWidth = 2
    const gx = mpx - weightW / 2 - 14
    drawLine(ctx, gx, weightY + 5, gx, weightY + 22)
    ctx.beginPath(); ctx.moveTo(gx - 4, weightY + 17); ctx.lineTo(gx, weightY + 24); ctx.lineTo(gx + 4, weightY + 17); ctx.fill()
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'right'; ctx.fillText('G物', gx - 5, weightY + 16)
    ctx.strokeStyle = '#4a9eff'; ctx.fillStyle = '#4a9eff'; ctx.lineWidth = 2
    const g0x = mpx + R + 12
    drawLine(ctx, g0x, mpy - 6, g0x, mpy + 6)
    ctx.beginPath(); ctx.moveTo(g0x - 4, mpy + 1); ctx.lineTo(g0x, mpy + 8); ctx.lineTo(g0x + 4, mpy + 1); ctx.fill()
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('G动', g0x + 5, mpy + 3)
    ctx.strokeStyle = '#2ecc71'; ctx.fillStyle = '#2ecc71'; ctx.lineWidth = 2.5
    if (n === 2) {
      drawLine(ctx, handleX, handleY - 18, handleX, handleY - 2)
      ctx.beginPath(); ctx.moveTo(handleX - 5, handleY - 7); ctx.lineTo(handleX, handleY); ctx.lineTo(handleX + 5, handleY - 7); ctx.fill()
      ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'right'; ctx.fillText('F = ' + F.toFixed(2) + ' N', handleX - 8, handleY - 6)
    } else {
      drawLine(ctx, handleX, handleY + 18, handleX, handleY + 2)
      ctx.beginPath(); ctx.moveTo(handleX - 5, handleY + 7); ctx.lineTo(handleX, handleY); ctx.lineTo(handleX + 5, handleY + 7); ctx.fill()
      ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('F = ' + F.toFixed(2) + ' N', handleX + 8, handleY + 6)
    }
    if (h === 0 && !S.current.dragging) {
      const alpha = 0.3 + 0.3 * Math.sin(S.current.breathPhase)
      ctx.fillStyle = 'rgba(232,80,80,' + alpha + ')'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('↑ 拖拽重物开始实验 ↑', mpx, weightY + weightH + 18)
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')
    function render() {
      S.current.breathPhase += 0.03
      const L = getLayout(); const calcs = calc()
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H); ctx.fillStyle = '#fafafa'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
      drawGrid(ctx); drawFrame(ctx, L)
      drawRope(ctx, L)           // 先画绳子
      drawPulley(ctx, L.fpx, L.fpy, R, '定')  // 后画滑轮（遮住穿心部分）
      drawPulley(ctx, L.mpx, L.mpy, R, '动')
      drawWeight(ctx, L); drawHandle(ctx, L); drawAnnotations(ctx, L, calcs)
      rafRef.current = requestAnimationFrame(render)
    }
    render(); return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [])

  const getPos = useCallback((e) => {
    const canvas = canvasRef.current; if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const hasTouches = e.touches && e.touches.length > 0
    const t = hasTouches ? e.touches[0] : (e.changedTouches && e.changedTouches[0]) || e
    if (!t || t.clientX == null) return null
    return { x: (t.clientX - rect.left) * (canvas.width / rect.width), y: (t.clientY - rect.top) * (canvas.height / rect.height) }
  }, [])

  const handleDown = useCallback((e) => {
    e.preventDefault(); const pos = getPos(e); if (!pos) return
    const canvas = canvasRef.current; const L = getLayout()
    const inW = pos.x >= L.mpx - L.weightW / 2 - 18 && pos.x <= L.mpx + L.weightW / 2 + 22 && pos.y >= L.weightY - 8 && pos.y <= L.weightY + L.weightH + 8
    const dx = pos.x - L.handleX, dy = pos.y - L.handleY, inH = dx * dx + dy * dy <= 484
    if (inW || inH) { S.current.dragging = true; S.current.dragStartY = pos.y; S.current.dragStartH = S.current.h; canvas.style.cursor = 'grabbing' }
  }, [getPos])

  const handleMove = useCallback((e) => {
    const pos = getPos(e); if (!pos) return
    const canvas = canvasRef.current; const L = getLayout()
    if (!S.current.dragging) {
      const inW = pos.x >= L.mpx - L.weightW / 2 - 18 && pos.x <= L.mpx + L.weightW / 2 + 22 && pos.y >= L.weightY - 8 && pos.y <= L.weightY + L.weightH + 8
      const dx = pos.x - L.handleX, dy = pos.y - L.handleY, inH = dx * dx + dy * dy <= 484
      S.current.hoverWeight = inW; S.current.hoverHandle = inH
      if (canvas) canvas.style.cursor = (inW || inH) ? 'grab' : 'default'; return
    }
    e.preventDefault()
    const dy = pos.y - S.current.dragStartY
    const dh = S.current.n === 2 ? dy / 120 : -dy / 120
    let newH = S.current.dragStartH + dh; newH = Math.max(0, Math.min(1.5, newH)); newH = Math.round(newH * 100) / 100
    S.current.h = newH; setHVal(newH); triggerRender()
  }, [getPos, triggerRender])

  const handleUp = useCallback(() => {
    S.current.dragging = false
    const canvas = canvasRef.current; if (canvas) canvas.style.cursor = (S.current.hoverWeight || S.current.hoverHandle) ? 'grab' : 'default'
  }, [])

  const updateG = useCallback((v) => { S.current.G = v; setGVal(v); triggerRender() }, [triggerRender])
  const updateG0 = useCallback((v) => { S.current.G0 = v; setG0Val(v); triggerRender() }, [triggerRender])
  const updateN = useCallback((v) => { S.current.n = v; setNVal(v); triggerRender() }, [triggerRender])
  const updateMu = useCallback((v) => { S.current.mu = v; setMuVal(v); triggerRender() }, [triggerRender])

  const addRecord = useCallback(() => {
    const calcs = calc()
    const rec = { id: records.length + 1, G: S.current.G, G0: S.current.G0, n: S.current.n, mu: S.current.mu, h: calcs.h, s: calcs.s, F: calcs.F, W_useful: calcs.W_useful, W_total: calcs.W_total, eta: calcs.eta }
    const newR = [...records, rec]; setRecords(newR); if (newR.length >= 3) setShowConclusion(true)
  }, [records])
  const clearRecords = useCallback(() => { if (window.confirm('确定清空所有记录数据？')) { setRecords([]); setShowConclusion(false) } }, [])
  const resetPos = useCallback(() => { S.current.h = 0; setHVal(0); triggerRender() }, [triggerRender])

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
    cwrap: { flex: '1 1 auto', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: 6, background: '#fafafa', minWidth: 0 },
    cvs: { border: '1px solid #ddd', borderRadius: 4, cursor: 'default', touchAction: 'none' },
    panel: { width: 340, flexShrink: 0, padding: 16, background: '#fff', borderLeft: '1px solid #e0e0e0', overflowY: 'hidden', overflowX: 'hidden' },
    ptitle: { fontSize: 14, fontWeight: 700, marginBottom: 8, color: '#2c3e50' },
    grid: { display: 'grid', gridTemplateColumns: '1fr 90px', gap: '1px 0', alignItems: 'center' },
    rl: { fontSize: 13, color: '#333', padding: '2px 0' },
    rv: { fontSize: 13, color: '#333', textAlign: 'right', paddingRight: 4, fontVariantNumeric: 'tabular-nums' },
    rvB: { fontSize: 13, color: '#333', textAlign: 'right', paddingRight: 4, fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
    rvA: { fontSize: 14, color: '#e67e22', textAlign: 'right', paddingRight: 4, fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
    div: { borderTop: '1px solid #e8e8e8', margin: '5px 0', gridColumn: '1 / -1' },
    sec: { fontSize: 11, color: '#999', gridColumn: '1 / -1', marginTop: 1 },
    sub: { fontSize: 12, color: '#666', paddingLeft: 14 },
    subV: { fontSize: 12, color: '#666', textAlign: 'right', paddingRight: 4, fontVariantNumeric: 'tabular-nums' },
    bottom: { flexShrink: 0, padding: '8px 16px', background: '#fff', borderTop: '1px solid #e0e0e0' },
    formula: { fontSize: 14, fontWeight: 600, color: '#2c3e50', fontFamily: 'serif', marginBottom: 4 },
    hint: { fontSize: 12, color: '#777' },
    conclusion: { marginTop: 6, padding: 6, background: '#e8f5e9', border: '1px solid #4caf50', borderRadius: 6, fontSize: 12, gridColumn: '1 / -1' },
    table: { marginTop: 6, fontSize: 10, width: '100%', borderCollapse: 'collapse', gridColumn: '1 / -1' },
    th: { background: '#f0f0f0', padding: '2px 3px', textAlign: 'center', border: '1px solid #ddd' },
    td: { padding: '2px 3px', textAlign: 'center', border: '1px solid #eee' },
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
            <span style={{ fontSize: 11, color: '#999', gridColumn: '1 / -1', textAlign: 'center' }}>（s = n × h = {nVal} × {calcs.h.toFixed(2)} = {calcs.s.toFixed(2)}）</span>
            <div style={st.div} /><span style={st.sec}>功与效率</span>
            <span style={st.rl}>有用功 W有</span><span style={st.rv}>{calcs.W_useful.toFixed(2)} J</span>
            <span style={st.rl}>总功 W总</span><span style={st.rv}>{calcs.W_total.toFixed(2)} J</span>
            <span style={st.rl}>额外功 W额</span><span style={st.rv}>{calcs.W_extra.toFixed(2)} J</span>
            <span style={st.sub}>├ 动滑轮重做功</span><span style={st.subV}>{calcs.W_pulley.toFixed(2)} J</span>
            <span style={st.sub}>└ 摩擦做功</span><span style={st.subV}>{calcs.W_friction.toFixed(2)} J</span>
            <div style={st.div} />
            <span style={st.rl}>机械效率 η</span><span style={st.rvA}>{calcs.eta.toFixed(1)} %</span>
            <span style={{ fontSize: 11, color: '#999' }}>（理想无摩擦）</span>
            <span style={{ fontSize: 11, color: '#999', textAlign: 'right', paddingRight: 4 }}>{calcs.eta_ideal.toFixed(1)} %</span>
            {showConclusion && <div style={st.conclusion}><div style={{ fontWeight: 700, marginBottom: 3 }}>📋 实验结论</div><div>① 物重越大，效率越高</div><div>② 动滑轮越重，效率越低</div><div>③ 摩擦越大，效率越低</div></div>}
            {records.length > 0 && <div style={{ marginTop: 6, gridColumn: '1 / -1' }}><div style={{ fontWeight: 600, fontSize: 12, marginBottom: 3 }}>📝 实验记录</div><div style={{ overflowX: 'auto' }}><table style={st.table}><thead><tr>{['#','G物','G动','n','μ','h','s','F','W有','W总','η'].map(h => <th key={h} style={st.th}>{h}</th>)}</tr></thead><tbody>{records.map(r => <tr key={r.id}><td style={st.td}>{r.id}</td><td style={st.td}>{r.G}</td><td style={st.td}>{r.G0}</td><td style={st.td}>{r.n}</td><td style={st.td}>{r.mu.toFixed(2)}</td><td style={st.td}>{r.h.toFixed(2)}</td><td style={st.td}>{r.s.toFixed(2)}</td><td style={st.td}>{r.F.toFixed(2)}</td><td style={st.td}>{r.W_useful.toFixed(2)}</td><td style={st.td}>{r.W_total.toFixed(2)}</td><td style={st.td}>{r.eta.toFixed(1)}%</td></tr>)}</tbody></table></div></div>}
          </div>
        </div>
      </div>
      <div style={st.bottom}>
        <div style={st.formula}>η = W有 / W总 = G物·h / (F·s) = G物 / (n·F)</div>
        <div style={st.hint}>① 调节参数 → ② 上下拖拽重物或拉绳端手柄模拟提升（s = n×h） → ③ 点击"记录"保存数据</div>
      </div>
    </div>
  )
}
