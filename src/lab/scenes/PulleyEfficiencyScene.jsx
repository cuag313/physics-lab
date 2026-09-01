import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * PulleyEfficiencyScene — 测量滑轮组机械效率（v12 绕线逻辑严格修正）
 *
 * n=2（偶数段）绕线规则：
 *   ① 绳子一端固定在定滑轮底部挂钩
 *   ② 竖直向下至动滑轮左侧切点
 *   ③ 沿动滑轮下半圆从左绕到右（π→2π）
 *   ④ 从动滑轮右切点竖直向上至定滑轮右侧切点
 *   ⑤ 沿定滑轮上半圆从右绕到左（0→π）
 *   ⑥ 从定滑轮左切点竖直向下，末端标注拉力 F
 *   物理关系：s = 2h
 *
 * n=3（奇数段）绕线规则：
 *   ① 绳子一端固定在动滑轮中心轴挂钩
 *   ② 从动滑轮中心直接连接至定滑轮右侧切点
 *   ③ 沿定滑轮上半圆从右绕到左（0→π），双股绳
 *   ④ 从定滑轮左切点竖直向下至动滑轮左侧切点
 *   ⑤ 沿动滑轮下半圆从左绕到右（π→2π）
 *   ⑥ 从动滑轮右切点竖直向上至定滑轮右侧切点
 *   ⑦ 再次沿定滑轮上半圆从右绕到左（0→π），与③重合
 *   ⑧ 从定滑轮左切点竖直向下，末端标注拉力 F
 *   物理关系：s = 3h
 *
 * 弧线方向：下半圆 arc(π,2π,true)，上半圆 arc(0,π,true)
 */

const R = 22, CANVAS_W = 520, CANVAS_H = 500, FRAME_TOP = 30, FRAME_CX = 200

export default function PulleyEfficiencyScene() {
  const canvasRef = useRef(null)
  const rafRef = useRef(null)
  const S = useRef({
    G: 10, G0: 2, n: 2, mu: 0.10, h: 0,
    dragging: false, dragStartY: 0, dragStartH: 0,
    records: [], breathPhase: 0,
  })
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
    const fpx = cx, fpy = FRAME_TOP + 60
    const baseMpy = fpy + 150
    const hPx = (h / 0.5) * 100
    const mpy = baseMpy - hPx
    const mpx = cx
    const xL = mpx - R, xR = mpx + R
    const weightW = 64, weightH = 48
    const weightY = mpy + R + 16
    const handleBaseY = baseMpy + R + 16 + weightH + 20
    const freeEndY = handleBaseY + hPx * 1.5
    return { cx, fpx, fpy, mpx, mpy, xL, xR, weightY, weightW, weightH, freeEndY, hPx, n }
  }

  // ============ 绘图 ============
  function drawGrid(ctx) {
    ctx.strokeStyle = '#ececec'; ctx.lineWidth = 0.5
    for (let x = 0; x <= CANVAS_W; x += 30) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke()
    }
    for (let y = 0; y <= CANVAS_H; y += 30) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke()
    }
  }

  function drawFrame(ctx, L) {
    const { fpx, fpy } = L
    const bl = fpx - 55, br = fpx + 75
    ctx.strokeStyle = '#888'; ctx.lineCap = 'round'
    // 左竖杆
    ctx.lineWidth = 5
    ctx.beginPath(); ctx.moveTo(bl, FRAME_TOP); ctx.lineTo(bl, CANVAS_H - 10); ctx.stroke()
    // 横杆
    ctx.lineWidth = 5
    ctx.beginPath(); ctx.moveTo(bl - 5, FRAME_TOP); ctx.lineTo(br, FRAME_TOP); ctx.stroke()
    // 底座
    ctx.lineWidth = 6
    ctx.beginPath(); ctx.moveTo(bl - 20, CANVAS_H - 10); ctx.lineTo(br + 10, CANVAS_H - 10); ctx.stroke()
    // 定滑轮固定杆
    ctx.strokeStyle = '#999'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(fpx, FRAME_TOP); ctx.lineTo(fpx, fpy - R); ctx.stroke()
  }

  function drawPulley(ctx, x, y, r, label, angle) {
    const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r)
    grad.addColorStop(0, '#f0f0f0'); grad.addColorStop(1, '#aaa')
    ctx.fillStyle = grad
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#666'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
    // 旋转辐条（3根）
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle || 0)
    ctx.strokeStyle = '#999'; ctx.lineWidth = 2
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * (r - 4), Math.sin(a) * (r - 4)); ctx.stroke()
    }
    ctx.restore()
    // 中轴
    ctx.fillStyle = '#444'
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill()
    // 标签
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(label, x, y)
  }

  // 隐藏绳段：从中心到底部挂钩（被滑轮填充遮住）
  function drawRopeHidden(ctx, L) {
    const { fpx, fpy, n, xL, xR, mpx, mpy } = L
    ctx.strokeStyle = '#8B4513'; ctx.lineWidth = 3; ctx.lineCap = 'round'
    if (n === 2) {
      // 定滑轮中心 → 底部挂钩（竖直向下，在圆内）
      ctx.beginPath(); ctx.moveTo(fpx, fpy); ctx.lineTo(fpx, fpy + R); ctx.stroke()
    } else {
      // 动滑轮中心 → 右侧切点（水平，在圆内）
      ctx.beginPath(); ctx.moveTo(mpx, mpy); ctx.lineTo(xR, mpy); ctx.stroke()
    }
  }

  // 动滑轮弧线（画在动滑轮填充之前）
  function drawRopeOnMovable(ctx, L) {
    const { mpx, mpy, fpy, n } = L
    ctx.strokeStyle = '#8B4513'; ctx.lineWidth = 3; ctx.lineCap = 'round'
    if (n === 2) {
      // 动滑轮下半圆：左侧切点(π) → 底部 → 右侧切点(2π)
      // counterclockwise=true: 从π到2π走短路径，经π/2(底部)，才是下半圆
      ctx.beginPath(); ctx.arc(mpx, mpy, R, Math.PI, 2 * Math.PI, true); ctx.stroke()
    } else {
      // n=3: 动滑轮下半圆：π→2π，逆时针经底部
      ctx.beginPath(); ctx.arc(mpx, mpy, R, Math.PI, 2 * Math.PI, true); ctx.stroke()
      // 从动滑轮中心直接到定滑轮右侧切点
      ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(mpx, mpy); ctx.lineTo(mpx + R, fpy); ctx.stroke()
      // 右竖线：动滑轮右侧切点 → 定滑轮右侧切点（下半圆绕完后的回程段）
      ctx.lineWidth = 4
      ctx.beginPath(); ctx.moveTo(mpx + R, mpy); ctx.lineTo(mpx + R, fpy); ctx.stroke()
      // 左竖线：定滑轮左侧切点 → 动滑轮左侧切点（向下）
      ctx.beginPath(); ctx.moveTo(mpx - R, fpy); ctx.lineTo(mpx - R, mpy); ctx.stroke()
    }
  }

  // 定滑轮弧线 + 承重段 + 自由端（画在所有滑轮填充之上）
  function drawRopeOnFixed(ctx, L, calcs) {
    const { fpx, fpy, mpx, mpy, xL, xR, freeEndY, n } = L
    const C = '#8B4513'
    ctx.lineCap = 'round'

    if (n === 2) {
      // 定滑轮上半圆：右侧切点(0°) → 顶部 → 左侧切点(180°)，顺时针（屏幕坐标系逆时针）
      ctx.strokeStyle = C; ctx.lineWidth = 3
      ctx.beginPath(); ctx.arc(fpx, fpy, R, 0, Math.PI, true); ctx.stroke()
      // 承重段：定滑轮底部挂钩 → 动滑轮左侧切点（竖直向下）
      ctx.lineWidth = 4
      ctx.beginPath(); ctx.moveTo(fpx, fpy + R); ctx.lineTo(xL, mpy); ctx.stroke()
      // 右段：动滑轮右侧切点 → 定滑轮右侧切点（竖直向上）
      ctx.beginPath(); ctx.moveTo(xR, mpy); ctx.lineTo(xR, fpy); ctx.stroke()
      // 自由端：定滑轮左侧切点竖直向下，直接到手把
      ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(xL, fpy); ctx.lineTo(xL, freeEndY); ctx.stroke()
      // 手把（T形握柄）—— 绳子末端直接连接
      ctx.strokeStyle = '#555'; ctx.lineWidth = 4; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(xL - 12, freeEndY); ctx.lineTo(xL + 12, freeEndY); ctx.stroke()
      ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(xL - 8, freeEndY + 6); ctx.lineTo(xL + 8, freeEndY + 6); ctx.stroke()
      // 拉力箭头（从手把向下）
      ctx.strokeStyle = '#2ecc71'; ctx.fillStyle = '#2ecc71'; ctx.lineWidth = 2.5
      const arrTop = freeEndY + 10
      const arrBot = freeEndY + 26
      ctx.beginPath(); ctx.moveTo(xL, arrTop); ctx.lineTo(xL, arrBot); ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(xL - 6, arrBot - 6); ctx.lineTo(xL, arrBot); ctx.lineTo(xL + 6, arrBot - 6)
      ctx.fill()
      ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left'
      ctx.fillStyle = '#2ecc71'
      ctx.fillText('F = ' + calcs.F.toFixed(2) + ' N', xL + 14, arrBot - 3)
    } else {
      // n=3: 定滑轮上半圆（两次绕过，4px粗线表示双股）
      ctx.strokeStyle = C; ctx.lineWidth = 4
      ctx.beginPath(); ctx.arc(fpx, fpy, R, 0, Math.PI, true); ctx.stroke()
      // 自由端：定滑轮左侧切点竖直向下到手把
      ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(xL, fpy); ctx.lineTo(xL, freeEndY); ctx.stroke()
      // 手把（T形握柄）—— 绳子末端直接连接
      ctx.strokeStyle = '#555'; ctx.lineWidth = 4; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(xL - 12, freeEndY); ctx.lineTo(xL + 12, freeEndY); ctx.stroke()
      ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(xL - 8, freeEndY + 6); ctx.lineTo(xL + 8, freeEndY + 6); ctx.stroke()
      // 拉力箭头（从手把向下）
      ctx.strokeStyle = '#2ecc71'; ctx.fillStyle = '#2ecc71'; ctx.lineWidth = 2.5
      const arrTop3 = freeEndY + 10
      const arrBot3 = freeEndY + 26
      ctx.beginPath(); ctx.moveTo(xL, arrTop3); ctx.lineTo(xL, arrBot3); ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(xL - 6, arrBot3 - 6); ctx.lineTo(xL, arrBot3); ctx.lineTo(xL + 6, arrBot3 - 6)
      ctx.fill()
      ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left'
      ctx.fillStyle = '#2ecc71'
      ctx.fillText('F = ' + calcs.F.toFixed(2) + ' N', xL + 14, arrBot3 - 3)
    }
  }

  function drawWeight(ctx, L) {
    const { mpx, mpy, weightY, weightW, weightH } = L
    // 挂钩线
    ctx.strokeStyle = '#666'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(mpx, mpy + R); ctx.lineTo(mpx, weightY); ctx.stroke()
    // 重物方块
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
    // 数值
    ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(S.current.G + 'N', mpx, y + weightH / 2)
  }

  function drawAnnotations(ctx, L, calcs) {
    const { mpx, mpy, weightY, weightW, weightH, fpy, xR, xL, n, hPx, freeEndY } = L
    const { h } = calcs

    // G物（红色箭头，重物左侧，只标符号）
    ctx.strokeStyle = '#e85050'; ctx.fillStyle = '#e85050'; ctx.lineWidth = 2
    const gx = mpx - weightW / 2 - 16
    ctx.beginPath(); ctx.moveTo(gx, weightY + 5); ctx.lineTo(gx, weightY + 22); ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(gx - 4, weightY + 17); ctx.lineTo(gx, weightY + 24); ctx.lineTo(gx + 4, weightY + 17)
    ctx.fill()
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'right'
    ctx.fillText('G物', gx - 5, weightY + 16)

    // G动（蓝色箭头，动滑轮右侧，只标符号）
    ctx.strokeStyle = '#4a9eff'; ctx.fillStyle = '#4a9eff'; ctx.lineWidth = 2
    const g0x = mpx + R + 14
    ctx.beginPath(); ctx.moveTo(g0x, mpy - 6); ctx.lineTo(g0x, mpy + 6); ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(g0x - 4, mpy + 1); ctx.lineTo(g0x, mpy + 8); ctx.lineTo(g0x + 4, mpy + 1)
    ctx.fill()
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('G动', g0x + 5, mpy + 3)

    // h标注（左侧黄色双向箭头）
    if (h > 0.005) {
      const initCY = fpy + 150 + R + 16 + weightH / 2
      const curCY = weightY + weightH / 2
      const ax = CANVAS_W - 30
      ctx.strokeStyle = '#f5a623'; ctx.lineWidth = 2; ctx.fillStyle = '#f5a623'
      ctx.beginPath(); ctx.moveTo(ax - 5, initCY); ctx.lineTo(ax + 5, initCY); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(ax - 5, curCY); ctx.lineTo(ax + 5, curCY); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(ax, initCY); ctx.lineTo(ax, curCY); ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(ax - 3, initCY - 6); ctx.lineTo(ax, initCY); ctx.lineTo(ax + 3, initCY - 6)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(ax - 3, curCY + 6); ctx.lineTo(ax, curCY); ctx.lineTo(ax + 3, curCY + 6)
      ctx.fill()
      ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'right'
      ctx.fillText('h = ' + h.toFixed(2) + ' m', ax - 8, (initCY + curCY) / 2)
    }

    // s标注（左侧蓝色双箭头，显示绳端移动距离）
    if (h > 0.005) {
      const sInitY = fpy + 150 + R + 16 + weightH + 20  // F手把初始位置
      const sCurY = freeEndY                              // F手把当前位置（向下移动）
      const sx = 25
      ctx.strokeStyle = '#3498db'; ctx.lineWidth = 2; ctx.fillStyle = '#3498db'
      ctx.beginPath(); ctx.moveTo(sx - 5, sInitY); ctx.lineTo(sx + 5, sInitY); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(sx - 5, sCurY); ctx.lineTo(sx + 5, sCurY); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(sx, sInitY); ctx.lineTo(sx, sCurY); ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(sx - 3, sInitY - 6); ctx.lineTo(sx, sInitY); ctx.lineTo(sx + 3, sInitY - 6)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(sx - 3, sCurY + 6); ctx.lineTo(sx, sCurY); ctx.lineTo(sx + 3, sCurY + 6)
      ctx.fill()
      ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText('s = ' + calcs.s.toFixed(2) + ' m', sx + 8, (sInitY + sCurY) / 2)
    }

    // 呼吸提示
    if (h === 0) {
      const alpha = 0.3 + 0.3 * Math.sin(S.current.breathPhase)
      ctx.fillStyle = 'rgba(46,204,113,' + alpha + ')'
      ctx.font = '12px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('↓ 拖动 F 拉手提升重物 ↓', mpx, weightY + weightH + 18)
    }
  }

  // ============ 渲染循环 ============
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    function render() {
      S.current.breathPhase += 0.03
      const L = getLayout()
      const calcs = calc()
      // 滑轮旋转角度（绳子移动距离 / 半径）
      const ropeMove = L.hPx * 1.5
      const fixedAngle = -ropeMove / R   // 定滑轮逆时针
      const movableAngle = -ropeMove / R // 动滑轮也是逆时针
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
      ctx.fillStyle = '#fafafa'
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
      drawGrid(ctx)
      drawFrame(ctx, L)
      drawRopeHidden(ctx, L)                          // ① 隐藏绳段
      drawPulley(ctx, L.fpx, L.fpy, R, '定', fixedAngle)   // ② 定滑轮
      drawPulley(ctx, L.mpx, L.mpy, R, '动', movableAngle) // ③ 动滑轮
      drawRopeOnMovable(ctx, L)               // ④ 动滑轮弧线（画在填充之上，确保可见）
      drawWeight(ctx, L)                      // ⑤ 重量块
      drawRopeOnFixed(ctx, L, calcs)          // ⑥ 定滑轮弧线+承重段+自由端+手把+F
      drawAnnotations(ctx, L, calcs)          // ⑦ 标注
      rafRef.current = requestAnimationFrame(render)
    }
    render()
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [])

  // ============ 交互 ============
  const getPos = useCallback((e) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const t = e.touches ? e.touches[0] : e
    if (!t || t.clientX == null) return null
    return {
      x: (t.clientX - rect.left) * (canvas.width / rect.width),
      y: (t.clientY - rect.top) * (canvas.height / rect.height),
    }
  }, [])

  const handleDown = useCallback((e) => {
    const pos = getPos(e)
    if (!pos) return
    const L = getLayout()
    const handleY = L.freeEndY
    const hx = L.xL
    if (pos.x >= hx - 15 && pos.x <= hx + 15 && pos.y >= handleY - 5 && pos.y <= handleY + 35) {
      S.current.dragging = true
      S.current.dragStartY = pos.y
      S.current.dragStartH = S.current.h
    }
  }, [getPos])

  const handleMove = useCallback((e) => {
    if (!S.current.dragging) return
    e.preventDefault()
    const pos = getPos(e)
    if (!pos) return
    const dy = pos.y - S.current.dragStartY
    // 向下拖 F → h 增大（重物上升）
    const dh = dy / 300
    let newH = S.current.dragStartH + dh
    newH = Math.max(0, Math.min(0.5, newH))
    newH = Math.round(newH * 100) / 100
    S.current.h = newH
    setHVal(newH)
    triggerRender()
  }, [getPos, triggerRender])

  const handleUp = useCallback(() => { S.current.dragging = false }, [])

  const updateG = useCallback((v) => { S.current.G = v; setGVal(v); triggerRender() }, [triggerRender])
  const updateG0 = useCallback((v) => { S.current.G0 = v; setG0Val(v); triggerRender() }, [triggerRender])
  const updateN = useCallback((v) => { S.current.n = v; setNVal(v); triggerRender() }, [triggerRender])
  const updateMu = useCallback((v) => { S.current.mu = v; setMuVal(v); triggerRender() }, [triggerRender])
  const updateH = useCallback((v) => { S.current.h = v; setHVal(v); triggerRender() }, [triggerRender])

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
    if (window.confirm('确定清空？')) {
      setRecords([]); setShowConclusion(false)
    }
  }, [])

  const resetPos = useCallback(() => {
    S.current.h = 0; setHVal(0); triggerRender()
  }, [triggerRender])

  const calcs = calc()

  // ============ 样式 ============
  const st = {
    wrap: { display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'system-ui, sans-serif', background: '#f5f5f5', overflow: 'hidden' },
    top: { display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', background: '#2c3e50', color: '#fff', flexShrink: 0, flexWrap: 'wrap', minHeight: 40 },
    bb: { background: 'none', border: '1px solid #556', color: '#fff', padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 12 },
    ti: { fontSize: 14, fontWeight: 700 },
    sg: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
    si: { display: 'flex', alignItems: 'center', gap: 3, fontSize: 11 },
    sl: { color: '#adc', whiteSpace: 'nowrap' },
    sv: { color: '#fff', fontWeight: 600, minWidth: 38, textAlign: 'right' },
    sr: { width: 70, accentColor: '#3498db' },
    nt: { display: 'flex', gap: 2, background: '#1a252f', borderRadius: 4, padding: 2 },
    nb: (a) => ({
      padding: '2px 8px', borderRadius: 3, border: 'none', cursor: 'pointer',
      fontSize: 11, fontWeight: 600,
      background: a ? '#3498db' : 'transparent', color: a ? '#fff' : '#889',
    }),
    rb: { display: 'flex', gap: 4, alignItems: 'center', marginLeft: 'auto' },
    tg: { padding: '2px 6px', borderRadius: 3, fontSize: 10, color: '#fff' },
    ab: { padding: '2px 7px', borderRadius: 4, border: '1px solid #556', background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 10 },
    mn: { display: 'flex', flex: 1, overflow: 'hidden' },
    cw: { flex: '1 1 auto', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: 4, background: '#fafafa', minWidth: 0 },
    cv: { border: '1px solid #ddd', borderRadius: 4, cursor: 'default', touchAction: 'none' },
    pn: { width: 340, flexShrink: 0, padding: '10px 14px', background: '#fff', borderLeft: '1px solid #e0e0e0', overflow: 'hidden' },
    pt: { fontSize: 13, fontWeight: 700, marginBottom: 6, color: '#2c3e50' },
    gd: { display: 'grid', gridTemplateColumns: '1fr 100px', gap: '0', alignItems: 'center' },
    rl: { fontSize: 12, color: '#333', padding: '2px 0', lineHeight: '26px' },
    rv: { fontSize: 12, color: '#333', textAlign: 'right', paddingRight: 16, fontVariantNumeric: 'tabular-nums', lineHeight: '26px' },
    rB: { fontSize: 12, color: '#333', textAlign: 'right', paddingRight: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: '26px' },
    rA: { fontSize: 13, color: '#e67e22', textAlign: 'right', paddingRight: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: '26px' },
    dv: { borderTop: '1px solid #e8e8e8', margin: '4px 0', gridColumn: '1 / -1' },
    sc: { fontSize: 10, color: '#999', gridColumn: '1 / -1' },
    sb: { fontSize: 11, color: '#666', paddingLeft: 12, lineHeight: '26px' },
    sV: { fontSize: 11, color: '#666', textAlign: 'right', paddingRight: 16, fontVariantNumeric: 'tabular-nums', lineHeight: '26px' },
    bt: { flexShrink: 0, padding: '6px 14px', background: '#fff', borderTop: '1px solid #e0e0e0' },
    fm: { fontSize: 13, fontWeight: 600, color: '#2c3e50', fontFamily: 'serif', marginBottom: 2 },
    hi: { fontSize: 11, color: '#777' },
    cn: { marginTop: 4, padding: 4, background: '#e8f5e9', border: '1px solid #4caf50', borderRadius: 4, fontSize: 11, gridColumn: '1 / -1' },
    tb: { marginTop: 4, fontSize: 9, width: '100%', borderCollapse: 'collapse', gridColumn: '1 / -1' },
    th: { background: '#f0f0f0', padding: '2px 3px', textAlign: 'center', border: '1px solid #ddd' },
    td: { padding: '2px 3px', textAlign: 'center', border: '1px solid #eee' },
  }

  return (
    <div style={st.wrap}>
      {/* 顶部控制栏（唯一返回按钮） */}
      <div style={st.top}>
        <button style={st.bb} onClick={() => window.dispatchEvent(new CustomEvent('lab-navigate', { detail: { key: null } }))}>← 返回目录</button>
        <span style={st.ti}>测量滑轮组机械效率</span>
        <div style={st.sg}>
          <div style={st.si}>
            <span style={st.sl}>G物</span>
            <input type="range" min={1} max={20} step={1} value={gVal} style={st.sr} onChange={e => updateG(Number(e.target.value))} />
            <span style={st.sv}>{gVal.toFixed(1)}N</span>
          </div>
          <div style={st.si}>
            <span style={st.sl}>G动</span>
            <input type="range" min={0.5} max={5} step={0.5} value={g0Val} style={st.sr} onChange={e => updateG0(Number(e.target.value))} />
            <span style={st.sv}>{g0Val.toFixed(1)}N</span>
          </div>
          <div style={st.si}>
            <span style={st.sl}>μ</span>
            <input type="range" min={0} max={0.3} step={0.01} value={muVal} style={st.sr} onChange={e => updateMu(Number(e.target.value))} />
            <span style={st.sv}>{muVal.toFixed(2)}</span>
          </div>
          <div style={st.si}>
            <span style={st.sl}>n</span>
            <div style={st.nt}>
              <button style={st.nb(nVal === 2)} onClick={() => updateN(2)}>2段</button>
              <button style={st.nb(nVal === 3)} onClick={() => updateN(3)}>3段</button>
            </div>
          </div>
          <div style={st.si}>
            <span style={st.sl}>h</span>
            <input type="range" min={0} max={0.5} step={0.01} value={hVal} style={st.sr} onChange={e => updateH(Number(e.target.value))} />
            <span style={st.sv}>{hVal.toFixed(2)}m</span>
          </div>
        </div>
        <div style={st.rb}>
          <span style={{ ...st.tg, background: '#27ae60' }}>九年级</span>
          <button style={st.ab} onClick={addRecord}>📝</button>
          <button style={st.ab} onClick={resetPos}>↺</button>
          <button style={st.ab} onClick={clearRecords}>🗑</button>
        </div>
      </div>

      {/* 主区域 */}
      <div style={st.mn}>
        <div style={st.cw}>
          <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} style={st.cv}
            onMouseDown={handleDown} onMouseMove={handleMove} onMouseUp={handleUp} onMouseLeave={handleUp}
            onTouchStart={handleDown} onTouchMove={handleMove} onTouchEnd={handleUp}
          />
        </div>

        {/* 右侧面板 */}
        <div style={st.pn}>
          <div style={st.pt}>📊 实时数据</div>
          <div style={st.gd}>
            <span style={st.rl}>物重 G物</span><span style={st.rv}>{gVal.toFixed(2)} N</span>
            <span style={st.rl}>动滑轮重 G动</span><span style={st.rv}>{g0Val.toFixed(2)} N</span>
            <span style={st.rl}>绳段数 n</span><span style={st.rv}>{nVal}</span>
            <span style={st.rl}>摩擦系数 μ</span><span style={st.rv}>{muVal.toFixed(2)}</span>
            <div style={st.dv} />
            <span style={st.sc}>拉力分析</span>
            <span style={st.rl}>理想拉力 F理想</span><span style={st.rv}>{calcs.F_ideal.toFixed(2)} N</span>
            <span style={st.rl}>摩擦附加</span><span style={st.rv}>+{calcs.F_friction.toFixed(2)} N</span>
            <span style={st.rl}>实际拉力 F</span><span style={st.rB}>{calcs.F.toFixed(2)} N</span>
            <div style={st.dv} />
            <span style={st.sc}>距离</span>
            <span style={st.rl}>提升高度 h</span><span style={st.rv}>{calcs.h.toFixed(2)} m</span>
            <span style={st.rl}>绳端距离 s</span><span style={st.rv}>{calcs.s.toFixed(2)} m</span>
            <span style={{ fontSize: 10, color: '#999', gridColumn: '1 / -1', textAlign: 'center' }}>
              （s = n × h = {nVal} × {calcs.h.toFixed(2)} = {calcs.s.toFixed(2)}）
            </span>
            <div style={st.dv} />
            <span style={st.sc}>功与效率</span>
            <span style={st.rl}>有用功 W有</span><span style={st.rv}>{calcs.W_useful.toFixed(2)} J</span>
            <span style={st.rl}>总功 W总</span><span style={st.rv}>{calcs.W_total.toFixed(2)} J</span>
            <span style={st.rl}>额外功 W额</span><span style={st.rv}>{calcs.W_extra.toFixed(2)} J</span>
            <span style={st.sb}>├ 动滑轮重做功</span><span style={st.sV}>{calcs.W_pulley.toFixed(2)} J</span>
            <span style={st.sb}>└ 摩擦做功</span><span style={st.sV}>{calcs.W_friction.toFixed(2)} J</span>
            <div style={st.dv} />
            <span style={st.rl}>机械效率 η</span><span style={st.rA}>{calcs.eta.toFixed(1)} %</span>
            <span style={{ fontSize: 10, color: '#999' }}>（理想无摩擦）</span>
            <span style={{ fontSize: 10, color: '#999', textAlign: 'right', paddingRight: 16 }}>
              {calcs.eta_ideal.toFixed(1)} %
            </span>

            {showConclusion && (
              <div style={st.cn}>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>📋 结论</div>
                <div>① 物重越大效率越高 ② 动滑轮越重效率越低 ③ 摩擦越大效率越低</div>
              </div>
            )}

            {records.length > 0 && (
              <div style={{ marginTop: 4, gridColumn: '1 / -1' }}>
                <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 2 }}>📝 记录</div>
                <table style={st.tb}>
                  <thead>
                    <tr>{['#', 'G物', 'G动', 'n', 'μ', 'h', 's', 'F', 'W有', 'W总', 'η'].map(h =>
                      <th key={h} style={st.th}>{h}</th>
                    )}</tr>
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
            )}
          </div>
        </div>
      </div>

      {/* 底部说明 */}
      <div style={{ flexShrink: 0, padding: '6px 14px', background: '#fff', borderTop: '1px solid #e0e0e0' }}>
        <div style={st.fm}>η = W有 / W总 = G物·h / (F·s) = G物 / (n·F)</div>
        <div style={st.hi}>① 调节参数 → ② 拖动 F 拉手（s = n×h） → ③ 记录保存</div>
      </div>
    </div>
  )
}
