/**
 * LiquidPressureScene — 探究液体内部压强（优化版）
 *
 * 物理规则：
 *   容器液体压强：p = ρ_液 × g × h_探
 *   U形管内水银：ρ_hg = 13600 kg/m³
 *   平衡条件：ρ_液 × g × h = ρ_hg × g × Δh
 *   Δh = (ρ_液 × h) / ρ_hg
 *
 * 教学考点：
 *   ① 液体压强随深度增大而增大
 *   ② 同一深度，液体内部向各个方向压强相等
 *   ③ 液体压强与液体密度有关
 *   ④ U形管压强计原理：容器液体压强与水银柱压强平衡
 */

import { useRef, useEffect, useState, useCallback } from 'react'

const G = 9.8
const RHO_HG = 13600  // 水银密度 kg/m³

const LIQUIDS = {
  water:     { name: '水',   density: 1000, color: 'rgba(33,150,243,0.45)' },
  saltwater: { name: '盐水', density: 1100, color: 'rgba(33,150,243,0.55)' },
  alcohol:   { name: '酒精', density: 800,  color: 'rgba(200,200,200,0.30)' },
}

export default function LiquidPressureScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const sim = useRef({
    depth: 0.20,
    liquidDensity: 1000,
    liquidType: 'water',
    probeDir: 0,           // 0=右, 90=下, 180=左, 270=上
    // 计算结果
    pressure: 0,           // 理论压强 Pa
    deltaH: 0,             // U形管液面差理论值 m
    deltaHCurrent: 0,      // 动画插值当前值 m
    phase: 0,
  })

  const [, forceUpdate] = useState(0)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    function resize() {
      const rect = canvas.getBoundingClientRect()
      const dpr = devicePixelRatio || 1
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    let lastTs = 0
    function loop(ts) {
      const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.05) : 0.016
      lastTs = ts
      updatePhysics(dt)
      drawFrame(ctx, canvas.getBoundingClientRect())
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)

    // 拖拽探头
    function handleMouseDown(e) {
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const L = getLayout(rect)
      const scaleMax = 0.85
      const probeY = L.liquidTop + (s.depth / scaleMax) * L.liquidH
      const probeX = L.tankX
      if (Math.abs(mx - probeX) < 30 && Math.abs(my - probeY) < 20) {
        setDragging(true)
      }
    }
    function handleMouseMove(e) {
      if (!dragging) return
      const rect = canvas.getBoundingClientRect()
      const my = e.clientY - rect.top
      const L = getLayout(rect)
      const scaleMax = 0.85
      const d = ((my - L.liquidTop) / L.liquidH) * scaleMax
      sim.current.depth = Math.max(0, Math.min(0.80, d))
    }
    function handleMouseUp() { setDragging(false) }

    canvas.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('resize', resize)
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [])

  // ============================================================
  //  物理
  // ============================================================
  function updatePhysics(dt) {
    const s = sim.current
    s.phase += 0.03

    // 理论压强
    s.pressure = s.liquidDensity * G * s.depth
    // Δh = (ρ_液 × h) / ρ_水银
    s.deltaH = (s.liquidDensity * s.depth) / RHO_HG

    // 平滑插值
    s.deltaHCurrent += (s.deltaH - s.deltaHCurrent) * 0.08

    forceUpdate(n => n + 1)
  }

  // ============================================================
  //  布局
  // ============================================================
  function getLayout(rect) {
    const w = rect.width, h = rect.height
    const tankW = Math.min(180, w * 0.20)
    const tankH = h * 0.55
    const tankX = w * 0.36
    const tankY = h * 0.18
    const liquidH = tankH * 0.85
    const liquidTop = tankY + tankH - liquidH

    const tubeX = w * 0.70
    const tubeY = h * 0.12
    const tubeW = 20
    const tubeH = Math.min(320, h * 0.48)
    const tubeGap = 56

    return { w, h, tankX, tankY, tankW, tankH, liquidH, liquidTop, tubeX, tubeY, tubeW, tubeH, tubeGap }
  }

  // ============================================================
  //  绘制
  // ============================================================
  function drawFrame(ctx, rect) {
    ctx.clearRect(0, 0, rect.width, rect.height)
    drawBackground(ctx, rect)
    drawTank(ctx, rect)
    drawProbe(ctx, rect)
    drawRubberTube(ctx, rect)
    try { drawUTube(ctx, rect) } catch (e) { console.error('UTube:', e) }
    drawDataPanel(ctx, rect)
    drawFormula(ctx, rect)
    try { drawPrinciple(ctx, rect) } catch (e) { console.error('Principle:', e) }
  }

  function drawBackground(ctx, rect) {
    const grad = ctx.createLinearGradient(0, 0, 0, rect.height)
    grad.addColorStop(0, '#f8f8f8')
    grad.addColorStop(1, '#eaeaea')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, rect.width, rect.height)
  }

  // ── 水槽 ──
  function drawTank(ctx, rect) {
    const L = getLayout(rect)
    const s = sim.current
    const liq = LIQUIDS[s.liquidType]
    const { tankX, tankY, tankW, tankH, liquidH, liquidTop } = L
    const scaleMax = 0.85

    // 容器壁
    ctx.fillStyle = 'rgba(200,200,255,0.06)'
    ctx.fillRect(tankX - tankW / 2, tankY, tankW, tankH)
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'
    ctx.lineWidth = 2
    ctx.strokeRect(tankX - tankW / 2, tankY, tankW, tankH)

    // 液体
    ctx.fillStyle = liq.color
    ctx.fillRect(tankX - tankW / 2 + 2, liquidTop, tankW - 4, liquidH)

    // 液面波纹
    ctx.strokeStyle = 'rgba(33,150,243,0.5)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let x = tankX - tankW / 2 + 2; x <= tankX + tankW / 2 - 2; x += 2) {
      const t = (x - (tankX - tankW / 2)) / tankW
      const y = liquidTop + Math.sin(t * Math.PI * 6 + s.phase) * 1.5
      if (x === tankX - tankW / 2 + 2) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()

    // 深度刻度尺
    ctx.strokeStyle = '#bbb'
    ctx.lineWidth = 1
    ctx.font = '9px monospace'
    ctx.fillStyle = '#999'
    ctx.textAlign = 'left'
    for (let d = 0; d <= scaleMax; d += 0.1) {
      const y = liquidTop + liquidH - (d / scaleMax) * liquidH
      if (y < tankY) continue
      ctx.beginPath()
      ctx.moveTo(tankX + tankW / 2, y)
      ctx.lineTo(tankX + tankW / 2 + (Math.abs(d % 0.2) < 0.01 ? 8 : 4), y)
      ctx.stroke()
      if (Math.abs(d % 0.2) < 0.01) {
        ctx.fillText(`${d.toFixed(1)}m`, tankX + tankW / 2 + 10, y + 3)
      }
    }

    // 深度标注线
    const probeY = liquidTop + (s.depth / scaleMax) * liquidH
    if (probeY > liquidTop && probeY < liquidTop + liquidH) {
      ctx.strokeStyle = '#E6A800'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(tankX - tankW / 2 - 8, liquidTop)
      ctx.lineTo(tankX - tankW / 2 - 8, probeY)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#E6A800'
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(`h=${s.depth.toFixed(2)}m`, tankX - tankW / 2 - 12, (liquidTop + probeY) / 2 + 4)
    }
  }

  // ── 探头（放大红色橡皮膜，可旋转） ──
  function drawProbe(ctx, rect) {
    const L = getLayout(rect)
    const s = sim.current
    const { tankX, liquidH, liquidTop } = L
    const scaleMax = 0.85
    const probeY = liquidTop + (s.depth / scaleMax) * liquidH
    const probeX = tankX

    ctx.save()
    ctx.translate(probeX, probeY)
    ctx.rotate((s.probeDir * Math.PI) / 180)

    // 金属盒主体
    const pw = 30, ph = 18
    const metalGrad = ctx.createLinearGradient(-pw / 2, -ph / 2, pw / 2, ph / 2)
    metalGrad.addColorStop(0, '#bbb')
    metalGrad.addColorStop(0.5, '#999')
    metalGrad.addColorStop(1, '#777')
    ctx.fillStyle = metalGrad
    ctx.beginPath()
    ctx.roundRect(-pw / 2, -ph / 2, pw, ph, 3)
    ctx.fill()
    ctx.strokeStyle = '#666'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(-pw / 2, -ph / 2, pw, ph, 3)
    ctx.stroke()

    // 红色橡皮膜（放大，前端突出）
    ctx.fillStyle = '#D32F2F'
    ctx.beginPath()
    ctx.roundRect(pw / 2 - 2, -ph / 2 + 1, 8, ph - 2, [0, 3, 3, 0])
    ctx.fill()
    // 橡皮膜高光
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.fillRect(pw / 2, -ph / 2 + 3, 4, ph - 6)

    // 方向箭头
    ctx.fillStyle = '#FF6B6B'
    ctx.beginPath()
    ctx.moveTo(pw / 2 + 12, 0)
    ctx.lineTo(pw / 2 + 4, -4)
    ctx.lineTo(pw / 2 + 4, 4)
    ctx.closePath()
    ctx.fill()

    ctx.restore()

    // 连接杆
    ctx.strokeStyle = '#999'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(probeX, probeY - ph / 2)
    ctx.lineTo(probeX, liquidTop - 30)
    ctx.stroke()
  }

  // ── 橡胶软管 ──
  function drawRubberTube(ctx, rect) {
    const L = getLayout(rect)
    const { tankX, liquidTop, tubeX, tubeY, tubeGap } = L

    const startX = tankX
    const startY = liquidTop - 30
    const endX = tubeX - tubeGap / 2
    const endY = tubeY + 20

    // 主管
    ctx.strokeStyle = 'rgba(140,140,140,0.5)'
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(startX, startY)
    const cpX = (startX + endX) / 2
    const cpY = Math.max(startY, endY) + 50
    ctx.quadraticCurveTo(cpX, cpY, endX, endY)
    ctx.stroke()

    // 高光线
    ctx.strokeStyle = 'rgba(200,200,200,0.3)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(startX, startY - 1.5)
    ctx.quadraticCurveTo(cpX, cpY - 2, endX, endY - 1.5)
    ctx.stroke()

    // 标签
    ctx.fillStyle = 'rgba(120,120,120,0.7)'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('橡胶软管（传递压强）', cpX, cpY + 8)
  }

  // ── U形管压强计 ──
  function drawUTube(ctx, rect) {
    const L = getLayout(rect)
    const s = sim.current
    const { tubeX, tubeY, tubeW, tubeH, tubeGap } = L

    const leftX = tubeX - tubeGap / 2
    const rightX = tubeX + tubeGap / 2
    const tubeTop = tubeY + 12
    const wall = 3
    const tubeBot = tubeTop + tubeH  // 竖管底部Y
    const arcR = tubeGap / 2          // 圆弧半径 = 两管中心距一半
    const arcCX = tubeX               // 圆弧圆心X
    const bendCY = tubeBot + arcR     // 圆弧圆心Y（管底下方一个半径）
    const bendDrop = 20  // 底部弧线下凸幅度

    // 液面
    const maxDiffPx = tubeH * 0.35
    const deltaHPx = Math.min(maxDiffPx, s.deltaHCurrent * 900)
    const baseLevel = tubeTop + tubeH * 0.50
    const leftLevel = Math.min(bendCY - 10, baseLevel + deltaHPx / 2)
    const rightLevel = Math.max(tubeTop + 10, baseLevel - deltaHPx / 2)

    // ── 管壁（一条连续Path2D，消除拼接缝隙） ──
    const glassGrad = ctx.createLinearGradient(leftX - tubeW / 2, 0, rightX + tubeW / 2, 0)
    glassGrad.addColorStop(0, 'rgba(180,200,220,0.4)')
    glassGrad.addColorStop(0.3, 'rgba(220,230,240,0.15)')
    glassGrad.addColorStop(0.7, 'rgba(220,230,240,0.15)')
    glassGrad.addColorStop(1, 'rgba(180,200,220,0.4)')

    const outerR = arcR + tubeW / 2  // 外弧半径
    const innerR = arcR - tubeW / 2  // 内弧半径

    // 外壁轮廓Path（左管外壁下行 → 底部外弧 → 右管外壁上行 → 右管内壁下行 → 底部内弧返回 → 左管内壁上行）
    const wallPath = new Path2D()
    wallPath.moveTo(leftX - tubeW / 2, tubeTop)
    wallPath.lineTo(leftX - tubeW / 2, tubeBot)          // 左外壁下行
    wallPath.arc(arcCX, bendCY, outerR, Math.PI, 0, true) // 底部外弧（向下凸）
    wallPath.lineTo(rightX + tubeW / 2, tubeTop)          // 右外壁上行
    wallPath.lineTo(rightX - tubeW / 2, tubeTop)          // 右顶边
    wallPath.lineTo(rightX - tubeW / 2, tubeBot)          // 右内壁下行
    wallPath.arc(arcCX, bendCY, innerR, 0, Math.PI, false) // 底部内弧（返回）
    wallPath.lineTo(leftX + tubeW / 2, tubeTop)           // 左内壁上行
    wallPath.closePath()

    ctx.fillStyle = glassGrad
    ctx.fill(wallPath)
    ctx.strokeStyle = 'rgba(100,130,160,0.60)'
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.stroke(wallPath)

    // ── 水银填充（单条连续Path，上下等宽） ──
    const hgColor = 'rgba(185,185,198,0.80)'
    const hgHalf = (tubeW - wall * 2) / 2
    const hgOuterR = arcR + hgHalf  // 外弧半径（管中心线+半宽）
    const hgInnerR = arcR - hgHalf  // 内弧半径（管中心线-半宽）

    const hgPath = new Path2D()
    // 左管液面 → 左管下行 → 底部外弧 → 右管上行 → 右液面 → 右管下行 → 底部内弧 → 左管上行 → 闭合
    hgPath.moveTo(leftX - hgHalf, leftLevel)
    hgPath.lineTo(leftX - hgHalf, tubeBot)
    hgPath.arc(arcCX, bendCY, hgOuterR, Math.PI, 0, true)
    hgPath.lineTo(rightX + hgHalf, rightLevel)
    hgPath.lineTo(rightX - hgHalf, rightLevel)
    hgPath.lineTo(rightX - hgHalf, tubeBot)
    hgPath.arc(arcCX, bendCY, hgInnerR, 0, Math.PI, false)
    hgPath.lineTo(leftX + hgHalf, leftLevel)
    hgPath.closePath()

    ctx.fillStyle = hgColor
    ctx.fill(hgPath)

    // 液面弯月
    ctx.strokeStyle = 'rgba(140,140,155,0.6)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(leftX - tubeW / 2 + wall + 1, leftLevel)
    ctx.quadraticCurveTo(leftX, leftLevel + 2.5, leftX + tubeW / 2 - wall - 1, leftLevel)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(rightX - tubeW / 2 + wall + 1, rightLevel)
    ctx.quadraticCurveTo(rightX, rightLevel + 2.5, rightX + tubeW / 2 - wall - 1, rightLevel)
    ctx.stroke()

    // ── 左管密封盖 + 右管开口 ──
    ctx.fillStyle = '#777'
    ctx.fillRect(leftX - tubeW / 2 - 2, tubeTop - 5, tubeW + 4, 5)
    // 左管标注
    ctx.fillStyle = '#888'
    ctx.font = '9px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText('封闭（连探头）', leftX, tubeTop - 6)
    // 右管开口
    ctx.fillStyle = '#aaa'
    ctx.fillText('↓通大气', rightX, tubeTop - 4)

    // ── 刻度标尺（独立于管壁） ──
    const scX = rightX + tubeW / 2 + 10
    const scTop = tubeTop + 10
    const scBot = tubeBot - 5
    const scStep = (scBot - scTop) / 15
    ctx.strokeStyle = '#ccc'
    ctx.lineWidth = 1
    ctx.font = '8px monospace'
    ctx.fillStyle = '#aaa'
    ctx.textAlign = 'left'
    for (let i = 0; i <= 15; i++) {
      const y = scTop + i * scStep
      const major = i % 5 === 0
      ctx.beginPath()
      ctx.moveTo(scX, y)
      ctx.lineTo(scX + (major ? 10 : 5), y)
      ctx.stroke()
      if (major) ctx.fillText(`${i * 2}`, scX + 13, y + 3)
    }

    // ── Δh 标注 ──
    if (deltaHPx > 5) {
      const ax = scX + 28
      ctx.strokeStyle = 'rgba(230,168,0,0.4)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.moveTo(leftX + tubeW / 2 + 3, leftLevel)
      ctx.lineTo(ax + 6, leftLevel)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(rightX + tubeW / 2 + 3, rightLevel)
      ctx.lineTo(ax + 6, rightLevel)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.strokeStyle = '#E6A800'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(ax, leftLevel + 5)
      ctx.lineTo(ax, rightLevel - 5)
      ctx.stroke()
      ctx.fillStyle = '#E6A800'
      ctx.beginPath()
      ctx.moveTo(ax, leftLevel + 1)
      ctx.lineTo(ax - 4, leftLevel + 8)
      ctx.lineTo(ax + 4, leftLevel + 8)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(ax, rightLevel - 1)
      ctx.lineTo(ax - 4, rightLevel - 8)
      ctx.lineTo(ax + 4, rightLevel - 8)
      ctx.closePath()
      ctx.fill()
      const mid = (leftLevel + rightLevel) / 2
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText('Δh', ax + 8, mid - 5)
      ctx.font = '9px sans-serif'
      ctx.fillText(`${(s.deltaHCurrent * 100).toFixed(1)}cm`, ax + 8, mid + 8)
    }

    // 标题
    ctx.fillStyle = '#444'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText('U形管压强计', tubeX, bendCY + bendDrop + 10)
    ctx.fillStyle = '#888'
    ctx.font = '10px sans-serif'
    ctx.fillText('内装水银 ρ=13600kg/m³', tubeX, bendCY + bendDrop + 26)
  }

  // ── 左侧数据面板 ──
  function drawDataPanel(ctx, rect) {
    const s = sim.current
    const panelW = 250, panelH = 340
    const px = 16, py = 16

    ctx.fillStyle = 'rgba(255,255,255,0.96)'
    ctx.fillRect(px, py, panelW, panelH)
    ctx.strokeStyle = '#ddd'
    ctx.lineWidth = 1
    ctx.strokeRect(px, py, panelW, panelH)

    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'

    ctx.fillStyle = '#333'
    ctx.font = 'bold 14px sans-serif'
    ctx.fillText('📊 液体压强', px + 14, py + 14)

    let y = py + 40
    const lh = 20

    ctx.fillStyle = '#666'
    ctx.font = '12px sans-serif'
    ctx.fillText(`容器液体：${LIQUIDS[s.liquidType].name}`, px + 14, y); y += lh
    ctx.fillStyle = '#4A90D9'
    ctx.fillText(`ρ_液 = ${s.liquidDensity} kg/m³`, px + 14, y); y += lh
    ctx.fillStyle = '#888'
    ctx.font = '11px sans-serif'
    ctx.fillText('U形管内：水银 ρ=13600kg/m³', px + 14, y); y += lh + 4

    ctx.fillStyle = '#E6A800'
    ctx.font = 'bold 12px sans-serif'
    ctx.fillText(`探头深度 h = ${s.depth.toFixed(2)} m`, px + 14, y); y += lh + 8

    ctx.fillStyle = '#333'
    ctx.font = 'bold 16px serif'
    ctx.fillText('p = ρgh', px + 14, y); y += 26

    ctx.fillStyle = '#4A90D9'
    ctx.font = '12px sans-serif'
    ctx.fillText(`理论压强 p = ${s.liquidDensity}×9.8×${s.depth.toFixed(2)}`, px + 14, y); y += lh
    ctx.fillStyle = '#4A90D9'
    ctx.font = 'bold 14px sans-serif'
    ctx.fillText(`p = ${s.pressure.toFixed(2)} Pa`, px + 14, y); y += lh + 6

    ctx.strokeStyle = '#eee'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(px + 14, y)
    ctx.lineTo(px + panelW - 14, y)
    ctx.stroke()
    y += 8

    ctx.fillStyle = '#2196F3'
    ctx.font = 'bold 12px sans-serif'
    ctx.fillText(`U形管实测 Δh = ${(s.deltaHCurrent * 100).toFixed(2)} cm`, px + 14, y); y += lh
    ctx.fillStyle = '#888'
    ctx.font = '10px sans-serif'
    ctx.fillText(`(= ${(s.deltaHCurrent).toFixed(5)} m)`, px + 14, y); y += lh

    const pFromDeltaH = RHO_HG * G * s.deltaHCurrent
    ctx.fillStyle = '#9C27B0'
    ctx.font = '12px sans-serif'
    ctx.fillText(`p' = ρ_水银×g×Δh = ${pFromDeltaH.toFixed(2)} Pa`, px + 14, y); y += lh + 6

    ctx.fillStyle = '#333'
    ctx.font = '11px sans-serif'
    ctx.fillText('平衡等式：', px + 14, y); y += lh
    ctx.fillStyle = '#4A90D9'
    ctx.font = '11px serif'
    ctx.fillText('ρ_液·g·h = ρ_水银·g·Δh', px + 14, y); y += lh + 6

    const diff = Math.abs(s.pressure - pFromDeltaH)
    const match = diff < 0.1
    ctx.fillStyle = match ? '#4CAF50' : '#FF9800'
    ctx.font = 'bold 11px sans-serif'
    ctx.fillText(match ? '✅ 理论值与实测值一致' : `偏差 ${diff.toFixed(2)} Pa`, px + 14, y)
  }

  // ── 工作原理（右下角） ──
  function drawPrinciple(ctx, rect) {
    const w = rect.width, h = rect.height
    const panelW = 240, panelH = 150
    const px = w - panelW - 16
    const py = h - panelH - 12

    // 背景
    ctx.fillStyle = 'rgba(255,255,255,0.96)'
    ctx.fillRect(px, py, panelW, panelH)
    ctx.strokeStyle = '#ddd'
    ctx.lineWidth = 1
    ctx.strokeRect(px, py, panelW, panelH)

    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillStyle = '#333'
    ctx.font = 'bold 12px sans-serif'
    ctx.fillText('📖 U形管压强计工作原理', px + 12, py + 10)

    let y = py + 32
    const lines = [
      '① 探头浸入液体，橡皮膜受压',
      '② 压强通过橡胶软管传递',
      '③ 封闭端水银被压下',
      '④ 开放端水银上升，产生Δh',
      '⑤ ρ液·g·h = ρ水银·g·Δh',
    ]
    ctx.font = '10px sans-serif'
    for (let i = 0; i < lines.length; i++) {
      ctx.fillStyle = i === 4 ? '#4A90D9' : '#666'
      ctx.fillText(lines[i], px + 12, y)
      y += 16
    }
    y += 4
    ctx.fillStyle = '#4CAF50'
    ctx.font = 'bold 10px sans-serif'
    ctx.fillText('同一深度各方向压强相等', px + 12, y)
  }
  function drawFormula(ctx, rect) {
    const h = rect.height
    ctx.fillStyle = '#4A90D9'
    ctx.font = 'bold 15px serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillText('p = ρgh', 16, h - 24)
  }

  function drawInstructions(ctx, rect) {
    const h = rect.height
    ctx.fillStyle = '#888'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillText('拖动深度滑块 · 选择液体 · 旋转探头方向（同深度各方向压强相等）', 16, h - 48)
  }

  // ============================================================
  //  渲染
  // ============================================================
  const s = sim.current
  const liq = LIQUIDS[s.liquidType]

  return (
    <div style={S.container}>
      <div style={S.toolbar}>
        <span style={S.title}>探究液体内部压强</span>
        <div style={S.actions}>
          <label style={S.label}>
            深度：
            <input type="range" min="0" max="0.80" step="0.01"
              value={s.depth}
              onChange={(e) => { sim.current.depth = parseFloat(e.target.value) }}
              style={{ width: 100, accentColor: '#4A90D9' }} />
            <span style={S.sliderVal}>{s.depth.toFixed(2)}m</span>
          </label>
          <label style={S.label}>
            液体：
            <select value={s.liquidType}
              onChange={(e) => {
                sim.current.liquidType = e.target.value
                sim.current.liquidDensity = LIQUIDS[e.target.value].density
              }}
              style={S.select}>
              {Object.entries(LIQUIDS).map(([k, v]) => (
                <option key={k} value={k}>{v.name} (ρ={v.density})</option>
              ))}
            </select>
          </label>
          <span style={S.label}>探头方向：</span>
          {[{ d: 0, l: '→ 右' }, { d: 90, l: '↓ 下' }, { d: 180, l: '← 左' }, { d: 270, l: '↑ 上' }].map(({ d, l }) => (
            <button key={d} style={{
              ...S.dirBtn,
              background: s.probeDir === d ? '#4A90D9' : '#fff',
              color: s.probeDir === d ? '#fff' : '#555',
              borderColor: s.probeDir === d ? '#4A90D9' : '#ccc',
            }} onClick={() => { sim.current.probeDir = d }}>{l}</button>
          ))}
        </div>
      </div>

      <div style={S.main}>
        <canvas ref={canvasRef} style={{ ...S.canvas, cursor: dragging ? 'grabbing' : 'grab' }} />
      </div>

      <div style={S.statusBar}>
        <span style={{ color: '#4CAF50', fontWeight: 600 }}>
          p = {s.liquidDensity}×9.8×{s.depth.toFixed(2)} = {s.pressure.toFixed(2)} Pa
        </span>
        <span style={{ color: '#2196F3', marginLeft: 16 }}>
          Δh = {(s.deltaHCurrent * 100).toFixed(2)} cm
        </span>
        <span style={{ color: '#999', marginLeft: 'auto', fontSize: 11 }}>
          p=ρgh · 同深度各方向压强相等
        </span>
      </div>
    </div>
  )
}

const S = {
  container: {
    display: 'flex', flexDirection: 'column', height: '100vh',
    background: '#e8e8e8', color: '#333',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  toolbar: {
    minHeight: 44, background: '#f5f5f5', borderBottom: '1px solid #ccc',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 12px', flexShrink: 0, flexWrap: 'wrap', gap: 6,
  },
  title: { fontSize: 14, fontWeight: 600, color: '#333' },
  actions: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  label: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#555' },
  sliderVal: { color: '#4A90D9', fontWeight: 600, minWidth: 45, fontSize: 12 },
  select: {
    background: '#fff', color: '#333', border: '1px solid #ccc',
    borderRadius: 4, padding: '3px 6px', fontSize: 12,
  },
  dirBtn: {
    border: '1px solid #ccc', borderRadius: 4,
    padding: '3px 10px', fontSize: 11, cursor: 'pointer',
    transition: 'all 0.15s',
  },
  main: { flex: 1, display: 'flex', overflow: 'hidden', background: '#fff' },
  canvas: { flex: 1, width: '100%' },
  statusBar: {
    minHeight: 28, background: '#f5f5f5', borderTop: '1px solid #ccc',
    display: 'flex', alignItems: 'center', gap: 20,
    padding: '4px 14px', fontSize: 12, color: '#555', flexShrink: 0, flexWrap: 'wrap',
  },
}
