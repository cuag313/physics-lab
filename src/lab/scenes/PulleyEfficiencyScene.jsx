import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * PulleyEfficiencyScene — 测量滑轮组机械效率（v6 重建版）
 *
 * 绕线规则（奇动偶定）：
 * - n=2（偶数）：绳子固定端在定滑轮挂钩 → 向下绕动滑轮下半圆 → 向上绕定滑轮上半圆 → 自由端竖直向下
 * - n=3（奇数）：绳子固定端在动滑轮挂钩 → 向上绕定滑轮上半圆 → 向下绕动滑轮下半圆 → 自由端竖直向上
 *
 * 物理模型：
 * - 理想拉力：F理想 = (G物 + G动) / n
 * - 摩擦附加：F摩擦 = F理想 × μ
 * - 实际拉力：F = F理想 × (1 + μ)
 * - s = n × h
 * - η = W有 / W总 = G物·h / (F·s)
 *
 * 交互：
 * - 调节参数滑块（G物、G动、μ、n）
 * - 拖拽底部手柄，s=n·h联动
 * - 记录数据、清空记录、重置位置
 */

const FRICTION_DEFAULT = 0.10
const R = 20            // 滑轮半径
const H_MAX_PX = 200    // h最大像素位移（对应1.5m）

export default function PulleyEfficiencyScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const RR = useRef(null)

  const S = useRef({
    G: 10, G0: 2, n: 2, mu: FRICTION_DEFAULT,
    h: 0,               // 提升高度 m（0~1.5）
    dragging: false,
    dragStartY: 0,
    dragStartS: 0,
    records: [],
    breathPhase: 0,
    hoverWeight: false,
  })

  const [gVal, setGVal] = useState(10)
  const [g0Val, setG0Val] = useState(2)
  const [nVal, setNVal] = useState(2)
  const [muVal, setMuVal] = useState(FRICTION_DEFAULT)
  const [hVal, setHVal] = useState(0)
  const [records, setRecords] = useState([])
  const [showConclusion, setShowConclusion] = useState(false)
  const [, tick] = useState(0)
  const triggerRender = useCallback(() => tick(n => n + 1), [])

  // ============ 物理计算 ============
  function calc() {
    const { G, G0, n, mu, h } = S.current
    const F_ideal = (G + G0) / n
    const F_friction = F_ideal * mu
    const F = F_ideal * (1 + mu)
    const s = n * h
    const W_useful = G * h
    const W_total = F * s
    const W_extra = W_total - W_useful
    const W_pulley = G0 * h
    const W_friction = W_extra - W_pulley
    const eta = W_total > 0 ? (W_useful / W_total) * 100 : 0
    const eta_ideal = G / (G + G0) * 100
    return { F_ideal, F_friction, F, s, W_useful, W_total, W_extra, W_pulley, W_friction, eta, eta_ideal }
  }

  // ============ 布局 ============
  function getLayout(cvs) {
    const W = cvs.width, H = cvs.height
    const { n, h } = S.current
    const cx = W / 2

    // 铁架台
    const frameTop = 50
    const frameLeft = cx - 65
    const frameRight = cx + 65

    // 定滑轮（固定）
    const fpx = cx
    const fpy = frameTop + 25 + R

    // h→像素映射：h=0时重物在底部，h=1.5时在顶部
    const hPx = (h / 1.5) * H_MAX_PX

    // 动滑轮
    const mpx = cx
    const mpy = fpy + 100 - hPx

    // 重物
    const weightW = 60, weightH = 44
    const weightY = mpy + R + 14

    // 手柄
    const handleX = n === 2 ? fpx - R : fpx + R
    const handleY = Math.min(weightY + weightH + 60, H - 25)

    return { W, H, cx, frameTop, frameLeft, frameRight, fpx, fpy, mpx, mpy, weightY, weightW, weightH, handleX, handleY, hPx }
  }

  // ============ 绘图辅助 ============
  function drawLine(ctx, x1, y1, x2, y2) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
  }
  function drawArcCW(ctx, cx, cy, r, startAngle, endAngle) {
    // Canvas: false=顺时针（视觉），true=逆时针（视觉）
    ctx.beginPath(); ctx.arc(cx, cy, r, startAngle, endAngle, false); ctx.stroke()
  }
  function drawArcCCW(ctx, cx, cy, r, startAngle, endAngle) {
    ctx.beginPath(); ctx.arc(cx, cy, r, startAngle, endAngle, true); ctx.stroke()
  }

  // ============ 绘制：网格 ============
  function drawGrid(ctx, W, H) {
    ctx.strokeStyle = '#ececec'
    ctx.lineWidth = 0.5
    const step = 30 // 约0.1m
    for (let x = 0; x <= W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
    for (let y = 0; y <= H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }
    ctx.fillStyle = '#ccc'; ctx.font = '9px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('每格 ≈ 0.1m', 4, H - 4)
  }

  // ============ 绘制：铁架台 ============
  function drawFrame(ctx, L) {
    const { frameTop, frameLeft, frameRight, fpx, fpy } = L
    ctx.strokeStyle = '#888'; ctx.lineCap = 'round'

    // 左柱
    ctx.lineWidth = 4
    drawLine(ctx, frameLeft, frameTop, frameLeft, L.H - 15)
    // 右柱
    drawLine(ctx, frameRight, frameTop, frameRight, L.H - 15)
    // 横梁
    ctx.lineWidth = 5
    drawLine(ctx, frameLeft - 8, frameTop, frameRight + 8, frameTop)
    // 底座
    ctx.lineWidth = 6
    drawLine(ctx, frameLeft - 25, L.H - 15, frameRight + 25, L.H - 15)

    // 定滑轮固定杆（从左柱到定滑轮轴）
    ctx.strokeStyle = '#999'; ctx.lineWidth = 3
    drawLine(ctx, frameLeft, frameTop + 15, fpx, frameTop + 15)
    ctx.lineWidth = 2
    drawLine(ctx, fpx, frameTop + 15, fpx, fpy - R)
  }

  // ============ 绘制：滑轮 ============
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

  // ============ 绘制：绳子（奇动偶定 + 切线弧线）============
  function drawRope(ctx, L) {
    const { fpx, fpy, mpx, mpy, handleX, handleY, n } = L
    const Rf = R  // 定滑轮半径
    const Rm = R  // 动滑轮半径

    ctx.lineCap = 'round'

    if (n === 2) {
      // 偶数：固定端在定滑轮
      // 切点坐标
      const fL = fpx - Rf, fR = fpx + Rf   // 定滑轮左右切点
      const mL = mpx - Rm, mR = mpx + Rm   // 动滑轮左右切点

      // 承重绳段高亮（橙色）
      ctx.strokeStyle = '#f5a623'; ctx.lineWidth = 3.5
      drawLine(ctx, fL, fpy, mL, mpy)      // 左：定→动
      drawLine(ctx, mR, mpy, fR, fpy)      // 右：动→定

      // 普通绳段（棕色）
      ctx.strokeStyle = '#8B6914'; ctx.lineWidth = 2.5

      // 定滑轮左半圆弧（挂钩→左切点）
      drawArcCW(ctx, fpx, fpy, Rf, Math.PI, Math.PI * 1.5)

      // 动滑轮下半圆弧（左切点→下→右切点）
      drawArcCW(ctx, mpx, mpy, Rm, Math.PI, 2 * Math.PI)

      // 定滑轮上半圆弧（右切点→上→左切点）
      drawArcCW(ctx, fpx, fpy, Rf, 0, Math.PI)

      // 自由端
      drawLine(ctx, fL, fpy, fL, handleY)

    } else {
      // n=3 奇数：固定端在动滑轮
      const fL = fpx - Rf, fR = fpx + Rf
      const mL = mpx - Rm, mR = mpx + Rm

      // 承重绳段高亮
      ctx.strokeStyle = '#f5a623'; ctx.lineWidth = 3.5
      drawLine(ctx, mR, mpy, fR, fpy)      // 右：动→定
      drawLine(ctx, fL, fpy, mL, mpy)      // 左：定→动

      // 普通绳段
      ctx.strokeStyle = '#8B6914'; ctx.lineWidth = 2.5

      // 动滑轮右半圆弧（挂钩→右切点）
      drawArcCW(ctx, mpx, mpy, Rm, Math.PI * 1.5, 2 * Math.PI)

      // 定滑轮上半圆弧（右切点→上→左切点）
      drawArcCW(ctx, fpx, fpy, Rf, 0, Math.PI)

      // 动滑轮下半圆弧（左切点→下→右切点）
      drawArcCW(ctx, mpx, mpy, Rm, Math.PI, 2 * Math.PI)

      // 自由端（竖直向上）
      drawLine(ctx, mR, mpy, mR, handleY)
    }
  }

  // ============ 绘制：重物 ============
  function drawWeight(ctx, L) {
    const { mpx, mpy, weightY, weightW, weightH } = L
    const cx = mpx

    // 挂钩线
    ctx.strokeStyle = '#666'; ctx.lineWidth = 2
    drawLine(ctx, mpx, mpy + R, mpx, weightY)

    // 重物本体
    const x = cx - weightW / 2, y = weightY
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

    // 拖拽高亮
    if (S.current.dragging) {
      ctx.shadowColor = 'rgba(232,80,80,0.5)'; ctx.shadowBlur = 12
      ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 2; ctx.stroke()
      ctx.shadowBlur = 0
    } else if (S.current.hoverWeight) {
      ctx.strokeStyle = '#ff8888'; ctx.lineWidth = 2; ctx.stroke()
    }

    // 重物内文字
    ctx.fillStyle = '#fff'; ctx.font = 'bold 15px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(`${S.current.G}N`, cx, y + weightH / 2)

    // 拖拽手柄图标
    ctx.fillStyle = S.current.hoverWeight ? '#e85050' : '#aaa'
    ctx.font = '13px sans-serif'
    ctx.fillText('⋮⋮', cx + weightW / 2 + 10, y + weightH / 2)
  }

  // ============ 绘制：标注箭头 ============
  function drawAnnotations(ctx, L, calcs) {
    const { fpx, fpy, mpx, mpy, weightY, weightW, weightH, handleX, handleY, hPx } = L
    const { h, n, G, G0 } = S.current

    // h标注（左侧黄色双向箭头）
    if (h > 0.005) {
      const baseY = fpy + 100 + R + 14 + weightH / 2  // h=0时重物中心
      const curY = weightY + weightH / 2                // 当前重物中心
      const ax = 40
      ctx.strokeStyle = '#f5a623'; ctx.lineWidth = 2; ctx.fillStyle = '#f5a623'
      drawLine(ctx, ax - 6, baseY, ax + 6, baseY)
      drawLine(ctx, ax - 6, curY, ax + 6, curY)
      drawLine(ctx, ax, baseY, ax, curY)
      // 箭头头
      ctx.beginPath()
      ctx.moveTo(ax - 4, baseY + 7); ctx.lineTo(ax, baseY); ctx.lineTo(ax + 4, baseY + 7)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(ax - 4, curY - 7); ctx.lineTo(ax, curY); ctx.lineTo(ax + 4, curY - 7)
      ctx.fill()
      ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText(`h = ${h.toFixed(2)} m`, ax + 8, (baseY + curY) / 2)
    }

    // s标注
    if (calcs.s > 0.005) {
      ctx.fillStyle = '#4a9eff'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText(`s = ${calcs.s.toFixed(2)} m`, mpx + R + 12, handleY - 12)
    }

    // G物箭头（红色，重物左侧）
    ctx.strokeStyle = '#e85050'; ctx.fillStyle = '#e85050'; ctx.lineWidth = 2
    const gx = mpx - weightW / 2 - 14
    drawLine(ctx, gx, weightY + 5, gx, weightY + 22)
    ctx.beginPath()
    ctx.moveTo(gx - 4, weightY + 17); ctx.lineTo(gx, weightY + 24); ctx.lineTo(gx + 4, weightY + 17)
    ctx.fill()
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'right'
    ctx.fillText('G物', gx - 5, weightY + 16)

    // G动箭头（蓝色，动滑轮右侧）
    ctx.strokeStyle = '#4a9eff'; ctx.fillStyle = '#4a9eff'; ctx.lineWidth = 2
    const g0x = mpx + R + 12
    drawLine(ctx, g0x, mpy - 6, g0x, mpy + 6)
    ctx.beginPath()
    ctx.moveTo(g0x - 4, mpy + 1); ctx.lineTo(g0x, mpy + 8); ctx.lineTo(g0x + 4, mpy + 1)
    ctx.fill()
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('G动', g0x + 5, mpy + 3)

    // F箭头（绿色，自由端）
    ctx.strokeStyle = '#2ecc71'; ctx.fillStyle = '#2ecc71'; ctx.lineWidth = 2.5
    drawLine(ctx, handleX, handleY - 18, handleX, handleY - 2)
    ctx.beginPath()
    ctx.moveTo(handleX - 5, handleY - 7); ctx.lineTo(handleX, handleY); ctx.lineTo(handleX + 5, handleY - 7)
    ctx.fill()
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = n === 2 ? 'right' : 'left'
    const flx = n === 2 ? handleX - 8 : handleX + 8
    ctx.fillText(`F = ${calcs.F.toFixed(2)} N`, flx, handleY - 8)

    // 呼吸动画提示
    if (h === 0 && !S.current.dragging) {
      const alpha = 0.3 + 0.3 * Math.sin(S.current.breathPhase)
      ctx.fillStyle = `rgba(232,80,80,${alpha})`
      ctx.font = '12px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('↑ 拖拽重物开始实验 ↑', mpx, weightY + weightH + 18)
    }

    // n高亮（承重绳段）
    if (S.current.hoverWeight === 'n') {
      // 已在drawRope中处理
    }
  }

  // ============ 绘制：手柄 ============
  function drawHandle(ctx, L) {
    const { handleX, handleY } = L
    ctx.fillStyle = '#f0f0f0'; ctx.strokeStyle = '#888'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(handleX, handleY, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#666'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('↑↓', handleX, handleY + 22)
  }

  // ============ 主渲染循环 ============
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    function render() {
      S.current.breathPhase += 0.03
      const L = getLayout(canvas)
      const calcs = calc()
      const { W, H } = L

      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#fafafa'
      ctx.fillRect(0, 0, W, H)

      drawGrid(ctx, W, H)
      drawFrame(ctx, L)
      drawRope(ctx, L)
      drawPulley(ctx, L.fpx, L.fpy, R, '定')
      drawPulley(ctx, L.mpx, L.mpy, R, '动')
      drawWeight(ctx, L)
      drawHandle(ctx, L)
      drawAnnotations(ctx, L, calcs)

      animRef.current = requestAnimationFrame(render)
    }
    render()
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  // ============ 拖拽交互 ============
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
    const L = getLayout(canvas)
    const { mpx, weightY, weightW, weightH } = L
    const hx = mpx - weightW / 2 - 18
    const hx2 = mpx + weightW / 2 + 22
    if (pos.x >= hx && pos.x <= hx2 && pos.y >= weightY - 8 && pos.y <= weightY + weightH + 8) {
      S.current.dragging = true
      S.current.dragStartY = pos.y
      S.current.dragStartS = S.current.h
      canvas.style.cursor = 'grabbing'
    }
  }, [getPos])

  const handleMove = useCallback((e) => {
    const pos = getPos(e)
    if (!pos) return
    const canvas = canvasRef.current

    // hover检测
    if (!S.current.dragging) {
      const L = getLayout(canvas)
      const { mpx, weightY, weightW, weightH } = L
      const inW = pos.x >= mpx - weightW / 2 - 18 && pos.x <= mpx + weightW / 2 + 22 &&
                  pos.y >= weightY - 8 && pos.y <= weightY + weightH + 8
      S.current.hoverWeight = inW
      canvas.style.cursor = inW ? 'grab' : 'default'
      return
    }

    e.preventDefault()
    const dy = pos.y - S.current.dragStartY
    const dh = -dy / (H_MAX_PX / 1.5)
    let newH = S.current.dragStartS + dh
    newH = Math.max(0, Math.min(1.5, newH))
    newH = Math.round(newH * 100) / 100
    S.current.h = newH
    setHVal(newH)
    triggerRender()
  }, [getPos, triggerRender])

  const handleUp = useCallback(() => {
    S.current.dragging = false
    const canvas = canvasRef.current
    if (canvas) canvas.style.cursor = S.current.hoverWeight ? 'grab' : 'default'
  }, [])

  // ============ 参数更新 ============
  const updateG = useCallback((v) => { S.current.G = v; setGVal(v); triggerRender() }, [triggerRender])
  const updateG0 = useCallback((v) => { S.current.G0 = v; setG0Val(v); triggerRender() }, [triggerRender])
  const updateN = useCallback((v) => { S.current.n = v; setNVal(v); triggerRender() }, [triggerRender])
  const updateMu = useCallback((v) => { S.current.mu = v; setMuVal(v); triggerRender() }, [triggerRender])

  // ============ 记录 ============
  const addRecord = useCallback(() => {
    const calcs = calc()
    const rec = {
      id: records.length + 1,
      G: S.current.G, G0: S.current.G0, n: S.current.n, mu: S.current.mu,
      h: S.current.h, s: calcs.s, F: calcs.F,
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
    S.current.h = 0; setHVal(0); triggerRender()
  }, [triggerRender])

  // ============ 渲染 ============
  const calcs = calc()

  const st = {
    wrap: {
      display: 'flex', flexDirection: 'column', height: '100%',
      fontFamily: 'system-ui, sans-serif', background: '#f5f5f5', overflow: 'hidden',
    },
    topBar: {
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '6px 14px', background: '#2c3e50', color: '#fff',
      flexShrink: 0, flexWrap: 'wrap', minHeight: 44,
    },
    backBtn: {
      background: 'none', border: '1px solid #556', color: '#fff',
      padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 13,
    },
    title: { fontSize: 15, fontWeight: 700 },
    sg: { display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' },
    si: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, position: 'relative' },
    sl: { color: '#adc', whiteSpace: 'nowrap' },
    sv: { color: '#fff', fontWeight: 600, minWidth: 42, textAlign: 'right' },
    slr: { width: 80, accentColor: '#3498db' },
    nt: { display: 'flex', gap: 2, background: '#1a252f', borderRadius: 4, padding: 2 },
    nb: (a) => ({
      padding: '2px 10px', borderRadius: 3, border: 'none', cursor: 'pointer',
      fontSize: 12, fontWeight: 600,
      background: a ? '#3498db' : 'transparent', color: a ? '#fff' : '#889',
    }),
    rbtns: { display: 'flex', gap: 5, alignItems: 'center', marginLeft: 'auto' },
    tag: { padding: '2px 7px', borderRadius: 3, fontSize: 11, color: '#fff' },
    abtn: {
      padding: '3px 8px', borderRadius: 4, border: '1px solid #556',
      background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 11,
    },
    main: { display: 'flex', flex: 1, overflow: 'hidden' },
    cwrap: {
      flex: '0 0 62%', display: 'flex', justifyContent: 'center',
      alignItems: 'flex-start', padding: 6, background: '#fafafa',
    },
    cvs: { border: '1px solid #ddd', borderRadius: 4, cursor: 'default', touchAction: 'none' },
    panel: {
      flex: '0 0 38%', minWidth: 320, padding: '12px 16px',
      background: '#fff', borderLeft: '1px solid #e0e0e0',
      overflowY: 'auto', overflowX: 'hidden',
    },
    ptitle: { fontSize: 14, fontWeight: 700, marginBottom: 8, color: '#2c3e50' },
    grid: {
      display: 'grid', gridTemplateColumns: '1fr auto',
      gap: '1px 0', alignItems: 'center',
    },
    rl: { fontSize: 13, color: '#333', padding: '3px 0' },
    rv: { fontSize: 13, color: '#333', textAlign: 'right', minWidth: 80, paddingRight: 4 },
    rvB: { fontSize: 13, color: '#333', textAlign: 'right', minWidth: 80, paddingRight: 4, fontWeight: 700 },
    rvA: { fontSize: 14, color: '#e67e22', textAlign: 'right', minWidth: 80, paddingRight: 4, fontWeight: 700 },
    div: { borderTop: '1px solid #e8e8e8', margin: '4px 0', gridColumn: '1 / -1' },
    sec: { fontSize: 11, color: '#999', gridColumn: '1 / -1', marginTop: 1 },
    sub: { fontSize: 12, color: '#666', paddingLeft: 12 },
    subV: { fontSize: 12, color: '#666', textAlign: 'right', minWidth: 80, paddingRight: 4 },
    bottom: {
      flexShrink: 0, padding: '8px 16px', background: '#fff',
      borderTop: '1px solid #e0e0e0',
    },
    formula: { fontSize: 14, fontWeight: 600, color: '#2c3e50', fontFamily: 'serif', marginBottom: 4 },
    hint: { fontSize: 12, color: '#777' },
    conclusion: {
      marginTop: 8, padding: 8, background: '#e8f5e9',
      border: '1px solid #4caf50', borderRadius: 6, fontSize: 12, gridColumn: '1 / -1',
    },
    table: { marginTop: 8, fontSize: 10, width: '100%', borderCollapse: 'collapse', gridColumn: '1 / -1' },
    th: { background: '#f0f0f0', padding: '3px 4px', textAlign: 'center', border: '1px solid #ddd' },
    td: { padding: '2px 4px', textAlign: 'center', border: '1px solid #eee' },
  }

  return (
    <div style={st.wrap}>
      {/* 顶部控制栏 */}
      <div style={st.topBar}>
        <button style={st.backBtn} onClick={() => {
          window.dispatchEvent(new CustomEvent('lab-navigate', { detail: { key: null } }))
        }}>← 返回目录</button>
        <span style={st.title}>测量滑轮组机械效率</span>

        <div style={st.sg}>
          <div style={st.si}>
            <span style={st.sl}>物重 G物</span>
            <input type="range" min={1} max={20} step={1} value={gVal}
              style={st.slr} onChange={e => updateG(Number(e.target.value))} />
            <span style={st.sv}>{gVal.toFixed(1)} N</span>
          </div>
          <div style={st.si}>
            <span style={st.sl}>动滑轮重 G动</span>
            <input type="range" min={0.5} max={5} step={0.5} value={g0Val}
              style={st.slr} onChange={e => updateG0(Number(e.target.value))} />
            <span style={st.sv}>{g0Val.toFixed(1)} N</span>
          </div>
          <div style={st.si}>
            <span style={st.sl}>摩擦系数 μ</span>
            <input type="range" min={0} max={0.3} step={0.01} value={muVal}
              style={st.slr} onChange={e => updateMu(Number(e.target.value))} />
            <span style={st.sv}>{muVal.toFixed(2)}</span>
          </div>
          <div style={st.si}>
            <span style={st.sl}>绳段数 n</span>
            <div style={st.nt}>
              <button style={st.nb(nVal === 2)} onClick={() => updateN(2)}>2段</button>
              <button style={st.nb(nVal === 3)} onClick={() => updateN(3)}>3段</button>
            </div>
          </div>
        </div>

        <div style={st.rbtns}>
          <span style={{ ...st.tag, background: '#27ae60' }}>九年级</span>
          <span style={{ ...st.tag, background: '#e67e22' }}>★★☆</span>
          <button style={st.abtn} onClick={addRecord}>📝 记录</button>
          <button style={st.abtn} onClick={resetPos}>↺ 重置</button>
          <button style={st.abtn} onClick={clearRecords}>🗑 清空</button>
        </div>
      </div>

      {/* 主区域 */}
      <div style={st.main}>
        <div style={st.cwrap}>
          <canvas
            ref={canvasRef}
            width={520}
            height={520}
            style={st.cvs}
            onMouseDown={handleDown}
            onMouseMove={handleMove}
            onMouseUp={handleUp}
            onMouseLeave={handleUp}
            onTouchStart={handleDown}
            onTouchMove={handleMove}
            onTouchEnd={handleUp}
          />
        </div>

        <div style={st.panel}>
          <div style={st.ptitle}>📊 实时数据</div>
          <div style={st.grid}>
            <span style={st.rl}>物重 G物</span><span style={st.rv}>{gVal.toFixed(2)} N</span>
            <span style={st.rl}>动滑轮重 G动</span><span style={st.rv}>{g0Val.toFixed(2)} N</span>
            <span style={st.rl}>绳段数 n</span><span style={st.rv}>{nVal}</span>
            <span style={st.rl}>摩擦系数 μ</span><span style={st.rv}>{muVal.toFixed(2)}</span>

            <div style={st.div} />
            <span style={st.sec}>拉力分析</span>
            <span style={st.rl}>理想拉力 F理想</span><span style={st.rv}>{calcs.F_ideal.toFixed(2)} N</span>
            <span style={st.rl}>摩擦附加</span><span style={st.rv}>+{calcs.F_friction.toFixed(2)} N</span>
            <span style={st.rl}>实际拉力 F</span><span style={st.rvB}>{calcs.F.toFixed(2)} N</span>

            <div style={st.div} />
            <span style={st.sec}>距离</span>
            <span style={st.rl}>提升高度 h</span><span style={st.rv}>{hVal.toFixed(2)} m</span>
            <span style={st.rl}>绳端距离 s</span><span style={st.rv}>{calcs.s.toFixed(2)} m</span>
            <span style={{ ...st.rl, fontSize: 11, color: '#999', gridColumn: '1 / -1', textAlign: 'center' }}>
              （s = n × h = {nVal} × {hVal.toFixed(2)}）
            </span>

            <div style={st.div} />
            <span style={st.sec}>功与效率</span>
            <span style={st.rl}>有用功 W有</span><span style={st.rv}>{calcs.W_useful.toFixed(2)} J</span>
            <span style={st.rl}>总功 W总</span><span style={st.rv}>{calcs.W_total.toFixed(2)} J</span>
            <span style={st.rl}>额外功 W额</span><span style={st.rv}>{calcs.W_extra.toFixed(2)} J</span>
            <span style={st.sub}>├ 动滑轮重做功</span><span style={st.subV}>{calcs.W_pulley.toFixed(2)} J</span>
            <span style={st.sub}>└ 摩擦做功</span><span style={st.subV}>{calcs.W_friction.toFixed(2)} J</span>

            <div style={st.div} />
            <span style={st.rl}>机械效率 η</span><span style={st.rvA}>{calcs.eta.toFixed(1)} %</span>
            <span style={{ ...st.rl, fontSize: 11, color: '#999' }}>（理想无摩擦）</span>
            <span style={{ ...st.rv, fontSize: 11, color: '#999' }}>{calcs.eta_ideal.toFixed(1)} %</span>

            {showConclusion && (
              <div style={st.conclusion}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>📋 实验结论</div>
                <div>① 物重越大，机械效率越高</div>
                <div>② 动滑轮越重，机械效率越低</div>
                <div>③ 摩擦越大，机械效率越低</div>
              </div>
            )}

            {records.length > 0 && (
              <div style={{ marginTop: 8, gridColumn: '1 / -1' }}>
                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>📝 实验记录</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={st.table}>
                    <thead>
                      <tr>
                        {['#','G物','G动','n','μ','h','s','F','W有','W总','η'].map(h =>
                          <th key={h} style={st.th}>{h}</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {records.map(r => (
                        <tr key={r.id}>
                          <td style={st.td}>{r.id}</td>
                          <td style={st.td}>{r.G}</td>
                          <td style={st.td}>{r.G0}</td>
                          <td style={st.td}>{r.n}</td>
                          <td style={st.td}>{r.mu.toFixed(2)}</td>
                          <td style={st.td}>{r.h.toFixed(2)}</td>
                          <td style={st.td}>{r.s.toFixed(2)}</td>
                          <td style={st.td}>{r.F.toFixed(2)}</td>
                          <td style={st.td}>{r.W_useful.toFixed(2)}</td>
                          <td style={st.td}>{r.W_total.toFixed(2)}</td>
                          <td style={st.td}>{r.eta.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 底部说明 */}
      <div style={st.bottom}>
        <div style={st.formula}>η = W有 / W总 = G物·h / (F·s) = G物 / (n·F)</div>
        <div style={st.hint}>① 调节参数 → ② 上下拖拽重物模拟提升 → ③ 点击"记录"保存数据</div>
      </div>
    </div>
  )
}
