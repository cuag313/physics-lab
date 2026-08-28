/**
 * LeverBalanceScene — 探究杠杆平衡条件（NB + PhET 融合版）
 *
 * 核心物理：
 *   力矩 = 力 × 力臂 × cos(θ)
 *   平衡条件：F₁L₁ = F₂L₂
 *   不平衡时杠杆绕支点旋转，阻尼趋近平衡角
 *
 * 交互：
 *   - 从调色板拖拽砝码到杠杆上
 *   - 拖拽已有砝码调整位置（自动吸附 0.5 刻度）
 *   - 右键点击砝码移除
 *   - 预设按钮演示平衡/不平衡场景
 *   - 实时力矩面板 + 力的矢量箭头
 */

import { useRef, useEffect, useState, useCallback } from 'react'

// ── 砝码调色板 ──
const PALETTE = [
  { mass: 0.5, color: '#FFD93D', label: '0.5' },
  { mass: 1,   color: '#4ECDC4', label: '1'   },
  { mass: 2,   color: '#FF6B6B', label: '2'   },
  { mass: 3,   color: '#A78BFA', label: '3'   },
  { mass: 5,   color: '#F97316', label: '5'   },
]

// ── 颜色方案 ──
const COLORS = {
  bg:         '#f0f0f0',
  ground:     '#e8e8e8',
  groundLine: '#ccc',
  beam:       '#888',
  beamHi:     '#aaa',
  fulcrum:    '#888',
  fulcrumHi:  '#aaa',
  fulcrumBase:'#666',
  pivot:      '#d4a017',
  pivotHi:    '#f0d060',
  tick:       '#ddd',
  tickText:   '#999',
  label:      '#333',
  formula:    '#4A90D9',
  balanced:   '#4CAF50',
  unbalanced: '#FF9800',
  left:       '#FF6B6B',
  right:      '#4ECDC4',
  arrow:      '#e74c3c',
  shadow:     'rgba(0,0,0,0.12)',
}

// ── 常量 ──
const G = 9.8
const MAX_ANGLE = 15 * Math.PI / 180   // 最大倾斜角 ±15°
const SENSITIVITY = 0.020               // 力矩→角度灵敏度（提高，让倾斜更明显）
const SNAP = 0.5                        // 位置吸附精度（0.5m）
const MIN_POS = -4
const MAX_POS = 4
const BEAM_LEN = 8                      // 杠杆全长（世界单位）
const FULCRUM_H = 1.5                   // 支点高度
const BEAM_H = 0.3                      // 杠杆粗细

// ── 砝码尺寸 ──
function weightRadius(mass) { return 14 + mass * 2.5 }
function weightWidth(mass)  { return weightRadius(mass) * 1.5 }
function weightHeight(mass) { return weightRadius(mass) * 1.3 }

// ── 圆角矩形辅助 ──
function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

// ============================================================
//  LeverBalanceScene Component
// ============================================================
export default function LeverBalanceScene({ preset }) {
  const canvasRef = useRef(null)
  const rafRef = useRef(null)
  const lastTimeRef = useRef(0)

  // ── 杠杆状态 ──
  const lever = useRef({
    angle: 0,
    targetAngle: 0,
    angularVel: 0,
  })

  // ── 砝码列表（默认平衡状态） ──
  const weights = useRef([
    { id: 'w1', mass: 2, pos: -2, color: '#FF6B6B', dragging: false },
    { id: 'w2', mass: 2, pos: 2,  color: '#4ECDC4', dragging: false },
  ])

  // ── 交互状态 ──
  const inter = useRef({
    mode: 'idle',       // 'idle' | 'dragging'
    dragTarget: null,
    dragType: null,     // 'weight' | 'palette'
    paletteMass: 0,
    paletteColor: '',
  })

  const [cursor, setCursor] = useState('default')
  const [records, setRecords] = useState([])  // 数据记录

  // ── 实时数据（ref，canvas每帧直接读取，不等React异步更新） ──
  const torqueRef = useRef({ left: 0, right: 0, net: 0 })
  const equilibriumRef = useRef(true)

  // ── Canvas 初始化 + 主循环 ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    function resize() {
      const r = canvas.getBoundingClientRect()
      const dpr = devicePixelRatio || 1
      canvas.width = r.width * dpr
      canvas.height = r.height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    function loop(ts) {
      if (!lastTimeRef.current) lastTimeRef.current = ts
      const dt = Math.min((ts - lastTimeRef.current) / 1000, 0.05)
      lastTimeRef.current = ts
      updatePhysics(dt)
      drawFrame(ctx, canvas.getBoundingClientRect())
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      window.removeEventListener('resize', resize)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // ============================================================
  //  物理更新
  // ============================================================
  function updatePhysics(dt) {
    const L = lever.current
    const ws = weights.current

    /* ═══════════════════════════════════════════════════════════
     *  力矩符号约定（矢量，二维平面正负号表示方向）
     * ───────────────────────────────────────────────────────────
     *  逆时针（CCW）= 正力矩    顺时针（CW）= 负力矩
     *  支点左侧砝码 → 逆时针 → 正值
     *  支点右侧砝码 → 顺时针 → 负值
     *  公式：torque = -pos × m × g × cos(θ)
     *        （pos<0取反→正；pos>0取反→负）
     *
     *  totalTorque = Σtorque（带符号代数和）
     *    > 0 → 逆时针，左端下沉
     *    < 0 → 顺时针，右端下沉
     *    ≈ 0 → 水平平衡
     *
     *  ⚠️ UI面板M1/M2/ΔM显示绝对值，物理计算必须用带符号totalTorque
     *  验证：
     *    左2kg@‑2m + 右2kg@2m+1kg@3m → totalTorque<0 → 右端下沉
     *    仅左侧放砝码 → totalTorque>0 → 左端下沉
     *    左右力矩相等 → totalTorque≈0 → 水平
     * ═══════════════════════════════════════════════════════════ */
    let totalTorque = 0
    let torqueLeft = 0, torqueRight = 0
    for (const w of ws) {
      if (Math.abs(w.pos) < 0.01) continue
      const torque = -w.pos * w.mass * G * Math.cos(L.angle)
      totalTorque += torque
      if (w.pos < 0) torqueLeft += torque   // 正值（逆时针）
      else           torqueRight += torque  // 负值（顺时针）
    }

    // UI面板：M1/M2取绝对值，ΔM带符号
    torqueRef.current = { left: torqueLeft, right: -torqueRight, net: totalTorque }
    equilibriumRef.current = Math.abs(totalTorque) < 0.3 && Math.abs(L.angularVel) < 0.002

    // 旋转驱动：直接用带符号的totalTorque，正→逆时针左沉，负→顺时针右沉
    L.targetAngle = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, totalTorque * SENSITIVITY))

    // 弹簧阻尼趋近
    const damping = 0.88
    const springK = 0.10
    L.angularVel += (L.targetAngle - L.angle) * springK
    L.angularVel *= damping
    L.angle += L.angularVel
  }

  // ============================================================
  //  坐标转换
  // ============================================================
  function getRenderer(rect) {
    const w = rect.width, h = rect.height
    const fulcrumScreenX = w / 2
    const fulcrumScreenY = h * 0.55
    const scale = Math.min(w / 14, h / 10) * 0.85

    return {
      screenW: w, screenH: h,
      fx: fulcrumScreenX, fy: fulcrumScreenY,
      scale,
      worldToScreen(wx, wy) {
        return [fulcrumScreenX + wx * scale, fulcrumScreenY - wy * scale]
      },
      screenToWorld(sx, sy) {
        return [(sx - fulcrumScreenX) / scale, -(sy - fulcrumScreenY) / scale]
      },
    }
  }

  // ============================================================
  //  绘制
  // ============================================================
  function drawFrame(ctx, rect) {
    const r = getRenderer(rect)
    ctx.clearRect(0, 0, r.screenW, r.screenH)

    drawBackground(ctx, r)
    drawGround(ctx, r)
    drawFulcrum(ctx, r)
    drawBeam(ctx, r)
    drawWeights(ctx, r)
    drawPalette(ctx, r)
    drawTorquePanel(ctx, r)
    drawTorqueKnowledge(ctx, r)
    drawFormula(ctx, r)
    drawInstructions(ctx, r)
  }

  // ── 背景 ──
  function drawBackground(ctx, r) {
    const grad = ctx.createLinearGradient(0, 0, 0, r.screenH)
    grad.addColorStop(0, '#f8f8f8')
    grad.addColorStop(1, '#e8e8e8')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, r.screenW, r.screenH)
  }

  // ── 地面 + 刻度 ──
  function drawGround(ctx, r) {
    const gy = r.fy + FULCRUM_H * r.scale + r.scale * 0.3

    // 地面
    ctx.fillStyle = COLORS.ground
    ctx.fillRect(0, gy, r.screenW, r.screenH - gy)
    ctx.strokeStyle = COLORS.groundLine
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, gy)
    ctx.lineTo(r.screenW, gy)
    ctx.stroke()

    // 地面刻度
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.font = '10px monospace'
    for (let i = MIN_POS; i <= MAX_POS; i++) {
      const [sx] = r.worldToScreen(i, 0)
      ctx.strokeStyle = COLORS.tick
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(sx, gy - 5)
      ctx.lineTo(sx, gy + 5)
      ctx.stroke()
      if (i !== 0) {
        ctx.fillStyle = COLORS.tickText
        ctx.fillText(`${i}`, sx, gy + 7)
      }
    }
  }

  // ── 支点 ──
  function drawFulcrum(ctx, r) {
    const fx = r.fx, fy = r.fy
    const fh = FULCRUM_H * r.scale
    const triW = fh * 0.8

    // 三角形支点
    const grad = ctx.createLinearGradient(fx - triW / 2, fy, fx + triW / 2, fy)
    grad.addColorStop(0, '#777')
    grad.addColorStop(0.5, '#aaa')
    grad.addColorStop(1, '#777')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(fx, fy - fh * 0.1)
    ctx.lineTo(fx - triW / 2, fy + fh * 0.6)
    ctx.lineTo(fx + triW / 2, fy + fh * 0.6)
    ctx.closePath()
    ctx.fill()

    // 高光边框
    ctx.strokeStyle = '#bbb'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // 底座
    ctx.fillStyle = COLORS.fulcrumBase
    const baseW = triW * 1.2
    roundedRectPath(ctx, fx - baseW / 2, fy + fh * 0.6, baseW, fh * 0.25, 3)
    ctx.fill()

    // 支点圆心
    ctx.fillStyle = COLORS.pivot
    ctx.beginPath()
    ctx.arc(fx, fy, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = COLORS.pivotHi
    ctx.beginPath()
    ctx.arc(fx - 1, fy - 1, 2, 0, Math.PI * 2)
    ctx.fill()

    // 标签
    ctx.fillStyle = '#4A90D9'
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText('支点 O', fx, fy + fh * 0.95)
  }

  // ── 杠杆 ──
  function drawBeam(ctx, r) {
    const L = lever.current
    const fx = r.fx, fy = r.fy, scale = r.scale
    const halfLen = BEAM_LEN / 2 * scale
    const beamH = BEAM_H * scale

    ctx.save()
    ctx.translate(fx, fy)
    ctx.rotate(-L.angle)

    // 主体渐变
    const grad = ctx.createLinearGradient(-halfLen, -beamH / 2, halfLen, beamH / 2)
    grad.addColorStop(0, '#777')
    grad.addColorStop(0.3, '#bbb')
    grad.addColorStop(0.5, '#ddd')
    grad.addColorStop(0.7, '#bbb')
    grad.addColorStop(1, '#777')
    ctx.fillStyle = grad
    roundedRectPath(ctx, -halfLen, -beamH / 2, BEAM_LEN * scale, beamH, 4)
    ctx.fill()

    // 边框
    ctx.strokeStyle = '#999'
    ctx.lineWidth = 1
    roundedRectPath(ctx, -halfLen, -beamH / 2, BEAM_LEN * scale, beamH, 4)
    ctx.stroke()

    // 刻度线 + 数字
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    for (let i = MIN_POS; i <= MAX_POS; i++) {
      if (i === 0) continue
      const x = i * scale
      ctx.strokeStyle = 'rgba(0,0,0,0.2)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, -beamH / 2)
      ctx.lineTo(x, -beamH / 2 - 8)
      ctx.stroke()
      ctx.fillStyle = '#555'
      ctx.fillText(`${i}`, x, -beamH / 2 - 10)
    }

    // 中心标记
    ctx.fillStyle = COLORS.pivot
    ctx.beginPath()
    ctx.arc(0, 0, 3, 0, Math.PI * 2)
    ctx.fill()

    ctx.restore()
  }

  // ── 砝码 ──
  function drawWeights(ctx, r) {
    const L = lever.current
    const fx = r.fx, fy = r.fy, scale = r.scale
    const inter_ = inter.current

    for (const w of weights.current) {
      const localX = w.pos * scale
      const localY = -BEAM_H / 2 * scale
      const cosA = Math.cos(-L.angle), sinA = Math.sin(-L.angle)
      const rotX = localX * cosA - localY * sinA
      const rotY = localX * sinA + localY * cosA
      const sx = fx + rotX, sy = fy + rotY
      const isDrag = inter_.mode === 'dragging' && inter_.dragTarget === w
      const rad = weightRadius(w.mass)
      const ww = weightWidth(w.mass), wh = weightHeight(w.mass)

      // 阴影
      ctx.fillStyle = COLORS.shadow
      ctx.beginPath()
      ctx.ellipse(sx + 2, sy + 3, rad, rad * 0.7, 0, 0, Math.PI * 2)
      ctx.fill()

      // 拖拽光晕
      if (isDrag) {
        ctx.shadowColor = 'rgba(74, 144, 217, 0.6)'
        ctx.shadowBlur = 15
      }

      // 砝码主体
      const grad = ctx.createLinearGradient(sx - ww / 2, sy - wh, sx + ww / 2, sy)
      grad.addColorStop(0, w.color)
      grad.addColorStop(1, shadeColor(w.color, -30))
      ctx.fillStyle = grad
      roundedRectPath(ctx, sx - ww / 2, sy - wh, ww, wh, 5)
      ctx.fill()

      // 边框
      ctx.strokeStyle = isDrag ? '#4A90D9' : 'rgba(0,0,0,0.2)'
      ctx.lineWidth = isDrag ? 2.5 : 1
      roundedRectPath(ctx, sx - ww / 2, sy - wh, ww, wh, 5)
      ctx.stroke()
      ctx.shadowBlur = 0

      // 顶部高光
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      roundedRectPath(ctx, sx - ww / 2 + 2, sy - wh + 2, ww - 4, wh * 0.35, 3)
      ctx.fill()

      // 质量标签
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${w.mass}kg`, sx, sy - wh / 2)

      // 位置标签
      ctx.fillStyle = '#666'
      ctx.font = '9px monospace'
      ctx.textBaseline = 'bottom'
      const posLabel = w.pos > 0 ? `+${w.pos.toFixed(1)}` : w.pos.toFixed(1)
      ctx.fillText(`${posLabel}m`, sx, sy - wh - 4)

      // 力臂虚线
      if (Math.abs(w.pos) > 0.15) {
        const [pivotSx] = r.worldToScreen(0, 0)
        const dashedY = sy - wh / 2
        ctx.strokeStyle = 'rgba(100,100,100,0.3)'
        ctx.lineWidth = 1
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(pivotSx, dashedY)
        ctx.lineTo(sx, dashedY)
        ctx.stroke()
        ctx.setLineDash([])

        // L 标注
        ctx.fillStyle = '#888'
        ctx.font = '10px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        ctx.fillText(`L=${Math.abs(w.pos).toFixed(1)}`, (pivotSx + sx) / 2, dashedY - 3)
      }
    }
  }

  // ── 调色板 ──
  function drawPalette(ctx, r) {
    const padX = 16, padY = 16
    const panelW = 72, itemH = 34
    const panelH = PALETTE.length * itemH + 36

    // 面板背景
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.shadowColor = 'rgba(0,0,0,0.08)'
    ctx.shadowBlur = 8
    roundedRectPath(ctx, padX, padY, panelW, panelH, 8)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.strokeStyle = '#ddd'
    ctx.lineWidth = 1
    roundedRectPath(ctx, padX, padY, panelW, panelH, 8)
    ctx.stroke()

    // 标题
    ctx.fillStyle = '#555'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('拖拽砝码', padX + panelW / 2, padY + 14)

    // 砝码列表
    for (let i = 0; i < PALETTE.length; i++) {
      const p = PALETTE[i]
      const cx = padX + panelW / 2
      const cy = padY + 30 + i * itemH + itemH / 2
      const r2 = 8 + p.mass * 2

      // 图标
      ctx.fillStyle = p.color
      roundedRectPath(ctx, cx - r2 * 0.7, cy - r2 * 0.6, r2 * 1.4, r2 * 1.2, 3)
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.15)'
      ctx.lineWidth = 1
      roundedRectPath(ctx, cx - r2 * 0.7, cy - r2 * 0.6, r2 * 1.4, r2 * 1.2, 3)
      ctx.stroke()

      // 标签
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 10px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(p.label + 'kg', cx, cy)
    }
  }

  // ── 力矩信息面板（从ref读实时数据） ──
  function drawTorquePanel(ctx, r) {
    const w = r.screenW
    const panelW = 195, panelH = 140
    const px = w - panelW - 16, py = 16
    const td = torqueRef.current
    const eq = equilibriumRef.current

    // 面板背景
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.shadowColor = 'rgba(0,0,0,0.08)'
    ctx.shadowBlur = 8
    roundedRectPath(ctx, px, py, panelW, panelH, 8)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.strokeStyle = '#ddd'
    ctx.lineWidth = 1
    roundedRectPath(ctx, px, py, panelW, panelH, 8)
    ctx.stroke()

    // 标题
    ctx.fillStyle = COLORS.label
    ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText('📊 力矩分析', px + 14, py + 12)

    // 左力矩
    ctx.font = '12px sans-serif'
    ctx.fillStyle = COLORS.left
    ctx.fillText(`左力矩 M₁ = ${td.left.toFixed(2)} N·m`, px + 14, py + 36)

    // 右力矩
    ctx.fillStyle = COLORS.right
    ctx.fillText(`右力矩 M₂ = ${td.right.toFixed(2)} N·m`, px + 14, py + 56)

    // 力矩对比条
    const barX = px + 14, barY = py + 78, barW = panelW - 28, barH = 12
    const maxT = Math.max(td.left, td.right, 1)
    const leftW = (td.left / maxT) * (barW / 2)
    const rightW = (td.right / maxT) * (barW / 2)
    // 左侧（向左延伸）
    ctx.fillStyle = COLORS.left
    ctx.fillRect(barX + barW / 2 - leftW, barY, leftW, barH)
    // 右侧（向右延伸）
    ctx.fillStyle = COLORS.right
    ctx.fillRect(barX + barW / 2, barY, rightW, barH)
    // 中线
    ctx.strokeStyle = '#999'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(barX + barW / 2, barY - 2)
    ctx.lineTo(barX + barW / 2, barY + barH + 2)
    ctx.stroke()

    // 净力矩
    ctx.fillStyle = eq ? COLORS.balanced : COLORS.unbalanced
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(`ΔM = ${td.net.toFixed(2)} N·m`, px + 14, py + 98)

    // 平衡状态
    ctx.fillStyle = eq ? COLORS.balanced : COLORS.unbalanced
    ctx.font = 'bold 14px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(eq ? '✓ 平衡状态' : '✗ 不平衡', px + panelW / 2, py + 120)
  }

  // ── 公式显示 ──
  function drawFormula(ctx, r) {
    const x = 16, y = r.screenH - 24
    ctx.fillStyle = COLORS.formula
    ctx.font = 'bold 14px serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillText('杠杆平衡条件：F₁ × L₁ = F₂ × L₂', x, y)
  }

  // ── 力矩知识卡片（右下角） ──
  function drawTorqueKnowledge(ctx, r) {
    const panelW = 225, panelH = 155
    const px = r.screenW - panelW - 16
    const py = r.screenH - panelH - 16

    // 背景
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.shadowColor = 'rgba(0,0,0,0.08)'
    ctx.shadowBlur = 6
    roundedRectPath(ctx, px, py, panelW, panelH, 8)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.strokeStyle = '#ddd'
    ctx.lineWidth = 1
    roundedRectPath(ctx, px, py, panelW, panelH, 8)
    ctx.stroke()

    // 标题
    ctx.fillStyle = '#4A90D9'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText('📖 力矩是矢量，有方向！', px + 12, py + 10)

    // 内容
    ctx.font = '11px sans-serif'
    ctx.fillStyle = '#333'
    let y = py + 30
    const lh = 17

    ctx.fillStyle = COLORS.left
    ctx.fillText('◀ 左侧砝码 → 逆时针 → 力矩为正 (+)', px + 12, y); y += lh
    ctx.fillStyle = COLORS.right
    ctx.fillText('▶ 右侧砝码 → 顺时针 → 力矩为负 (-)', px + 12, y); y += lh + 4

    ctx.fillStyle = '#333'
    ctx.font = 'bold 11px sans-serif'
    ctx.fillText('总力矩 = 正 + 负  代数相加', px + 12, y); y += lh + 2

    ctx.font = '11px sans-serif'
    ctx.fillStyle = COLORS.balanced
    ctx.fillText('总力矩 > 0 → 逆时针 → 左端下沉', px + 12, y); y += lh
    ctx.fillStyle = COLORS.unbalanced
    ctx.fillText('总力矩 < 0 → 顺时针 → 右端下沉', px + 12, y); y += lh
    ctx.fillStyle = '#888'
    ctx.fillText('总力矩 ≈ 0 → 杠杆水平平衡', px + 12, y)
  }

  // ── 操作说明 ──
  function drawInstructions(ctx, r) {
    const x = 16, y = r.screenH - 65
    ctx.fillStyle = '#888'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillText('拖拽砝码到杠杆上 · 拖拽调整位置 · 右键移除', x, y)
  }

  // ============================================================
  //  交互
  // ============================================================
  const handleMouseDown = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top
    const r = getRenderer(rect)
    const inter_ = inter.current

    // 右键移除
    if (e.button === 2) {
      e.preventDefault()
      const hit = findWeightAt(sx, sy, r)
      if (hit) {
        weights.current = weights.current.filter(w => w !== hit)
        triggerRender()
      }
      return
    }

    // 调色板拖拽
    const padX = 16, padY = 16, itemH = 34
    for (let i = 0; i < PALETTE.length; i++) {
      const p = PALETTE[i]
      const cx = padX + 36, cy = padY + 30 + i * itemH + itemH / 2
      if (Math.abs(sx - cx) < 20 && Math.abs(sy - cy) < 16) {
        inter_.mode = 'dragging'
        inter_.dragType = 'palette'
        inter_.paletteMass = p.mass
        inter_.paletteColor = p.color
        setCursor('grabbing')
        return
      }
    }

    // 杠杆上砝码拖拽
    const hit = findWeightAt(sx, sy, r)
    if (hit) {
      inter_.mode = 'dragging'
      inter_.dragTarget = hit
      inter_.dragType = 'weight'
      hit.dragging = true
      setCursor('grabbing')
    }
  }, [])

  const handleMouseMove = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top
    const r = getRenderer(rect)
    const inter_ = inter.current

    if (inter_.mode === 'dragging') {
      if (inter_.dragType === 'weight' && inter_.dragTarget) {
        // 屏幕坐标 → 杠杆上的位置
        const dx = sx - r.fx, dy = sy - r.fy
        const L = lever.current
        const cosA = Math.cos(L.angle), sinA = Math.sin(L.angle)
        const rotDx = dx * cosA + dy * sinA
        let newPos = rotDx / r.scale

        // 吸附到 0.5 刻度
        newPos = Math.round(newPos / SNAP) * SNAP
        newPos = Math.max(MIN_POS, Math.min(MAX_POS, newPos))

        inter_.dragTarget.pos = newPos
        triggerRender()
      }
      return
    }

    // 悬停光标
    const hit = findWeightAt(sx, sy, r)
    setCursor(hit ? 'grab' : 'default')
  }, [])

  const handleMouseUp = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top
    const r = getRenderer(rect)
    const inter_ = inter.current

    if (inter_.mode === 'dragging') {
      if (inter_.dragType === 'palette') {
        // 从调色板释放：检查是否在杠杆范围内
        const dx = sx - r.fx, dy = sy - r.fy
        const L = lever.current
        const cosA = Math.cos(L.angle), sinA = Math.sin(L.angle)
        const rotDx = dx * cosA + dy * sinA
        let newPos = rotDx / r.scale
        newPos = Math.round(newPos / SNAP) * SNAP

        if (newPos >= MIN_POS && newPos <= MAX_POS && sy < r.fy + 80) {
          const color = inter_.paletteColor || '#4ECDC4'
          weights.current.push({
            id: `w_${Date.now()}`,
            mass: inter_.paletteMass,
            pos: Math.max(MIN_POS, Math.min(MAX_POS, newPos)),
            color,
            dragging: false,
          })
        }
      }

      if (inter_.dragType === 'weight' && inter_.dragTarget) {
        inter_.dragTarget.dragging = false
      }

      inter_.mode = 'idle'
      inter_.dragTarget = null
      setCursor('default')
    }
  }, [])

  const handleContextMenu = useCallback((e) => e.preventDefault(), [])

  // ── 碰撞检测 ──
  function findWeightAt(sx, sy, r) {
    const L = lever.current
    for (const w of weights.current) {
      const localX = w.pos * r.scale
      const localY = -BEAM_H / 2 * r.scale
      const cosA = Math.cos(-L.angle), sinA = Math.sin(-L.angle)
      const rotX = localX * cosA - localY * sinA
      const rotY = localX * sinA + localY * cosA
      const wsx = r.fx + rotX, wsy = r.fy + rotY
      const rad = weightRadius(w.mass)
      if (Math.abs(sx - wsx) < rad * 1.3 && Math.abs(sy - wsy) < rad * 1.3) return w
    }
    return null
  }

  // ── 颜色辅助 ──
  function shadeColor(hex, amount) {
    let r2 = parseInt(hex.slice(1, 3), 16) + amount
    let g = parseInt(hex.slice(3, 5), 16) + amount
    let b = parseInt(hex.slice(5, 7), 16) + amount
    r2 = Math.max(0, Math.min(255, r2))
    g = Math.max(0, Math.min(255, g))
    b = Math.max(0, Math.min(255, b))
    return `#${r2.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
  }

  // ============================================================
  //  预设
  // ============================================================
  const applyPreset = useCallback((ws) => {
    weights.current = ws.map((w, i) => ({
      id: `w${i}`,
      mass: w.mass,
      pos: w.pos,
      color: PALETTE.find(p => p.mass === w.mass)?.color || ['#FF6B6B', '#4ECDC4', '#FFD93D', '#A78BFA', '#F97316'][i % 5],
      dragging: false,
    }))
    lever.current.angle = 0
    lever.current.angularVel = 0
    triggerRender()
  }, [])

  useEffect(() => {
    if (preset?.weights) applyPreset(preset.weights)
  }, [preset])

  // ── 记录当前数据 ──
  const recordData = useCallback(() => {
    const ws = weights.current
    const leftW = ws.filter(w => w.pos < 0)
    const rightW = ws.filter(w => w.pos > 0)
    const leftTorque = leftW.reduce((s, w) => s + Math.abs(w.pos) * w.mass * G * Math.cos(lever.current.angle), 0)
    const rightTorque = rightW.reduce((s, w) => s + Math.abs(w.pos) * w.mass * G * Math.cos(lever.current.angle), 0)
    const isBal = Math.abs(leftTorque - rightTorque) < 0.3

    const rec = {
      id: Date.now(),
      left: leftW.map(w => `${w.mass}×${Math.abs(w.pos)}`).join('+') || '—',
      right: rightW.map(w => `${w.mass}×${Math.abs(w.pos)}`).join('+') || '—',
      leftTorque: leftTorque.toFixed(1),
      rightTorque: rightTorque.toFixed(1),
      balanced: isBal,
    }
    setRecords(prev => [...prev, rec])
  }, [])

  // ── 预设按钮 ──
  const presets = [
    {
      label: '重置',
      tip: '2kg×2m = 2kg×2m（平衡）',
      weights: [
        { mass: 2, pos: -2 },
        { mass: 2, pos: 2 },
      ],
    },
    {
      label: '平衡①',
      tip: '1×3 = 3×1',
      weights: [
        { mass: 1, pos: -3 },
        { mass: 3, pos: 1 },
      ],
    },
    {
      label: '平衡②',
      tip: '2×2 = 1×4',
      weights: [
        { mass: 2, pos: -2 },
        { mass: 1, pos: 4 },
      ],
    },
    {
      label: '多砝码',
      tip: '1×3 + 2×1.5 = 3×2',
      weights: [
        { mass: 1, pos: -3 },
        { mass: 2, pos: -1.5 },
        { mass: 3, pos: 2 },
      ],
    },
  ]

  // ============================================================
  //  状态文本
  // ============================================================
  function getRuleText() {
    const eq = equilibriumRef.current
    const td = torqueRef.current
    if (eq) return { text: '杠杆平衡：F₁L₁ = F₂L₂', color: COLORS.balanced }
    if (td.net > 0) return { text: '右侧下沉：右力矩 > 左力矩', color: COLORS.right }
    return { text: '左侧下沉：左力矩 > 右力矩', color: COLORS.left }
  }
  const rule = getRuleText()

  // ============================================================
  //  渲染
  // ============================================================
  return (
    <div style={S.container}>
      {/* 工具栏 */}
      <div style={S.toolbar}>
        <span style={S.title}>探究杠杆平衡条件</span>
        <div style={S.actions}>
          {presets.map((p, i) => (
            <button key={i} style={S.btn} title={p.tip} onClick={() => applyPreset(p.weights)}>
              {p.label}
            </button>
          ))}
          <button style={{ ...S.btn, background: '#e74c3c' }} onClick={recordData}>📝 记录</button>
          <button style={{ ...S.btn, background: '#999' }} onClick={() => setRecords([])}>清空</button>
        </div>
      </div>

      {/* 主画布 + 数据表 */}
      <div style={S.main}>
        <canvas ref={canvasRef}
          style={{ ...S.canvas, cursor }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onContextMenu={handleContextMenu}
        />
        {/* 数据记录表 */}
        {records.length > 0 && (
          <div style={S.dataTable}>
            <div style={S.dataTitle}>📊 实验数据记录</div>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>#</th>
                  <th style={S.th}>左侧 (F₁×L₁)</th>
                  <th style={S.th}>M₁ (N·m)</th>
                  <th style={S.th}>右侧 (F₂×L₂)</th>
                  <th style={S.th}>M₂ (N·m)</th>
                  <th style={S.th}>状态</th>
                </tr>
              </thead>
              <tbody>
                {records.map((rec, i) => (
                  <tr key={rec.id}>
                    <td style={S.td}>{i + 1}</td>
                    <td style={S.td}>{rec.left}</td>
                    <td style={{ ...S.td, fontWeight: 600, color: COLORS.left }}>{rec.leftTorque}</td>
                    <td style={S.td}>{rec.right}</td>
                    <td style={{ ...S.td, fontWeight: 600, color: COLORS.right }}>{rec.rightTorque}</td>
                    <td style={{ ...S.td, color: rec.balanced ? COLORS.balanced : COLORS.unbalanced, fontWeight: 600 }}>
                      {rec.balanced ? '✓ 平衡' : '✗ 不平衡'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 状态栏 */}
      <div style={S.statusBar}>
        <span style={{ color: rule.color, fontWeight: 600 }}>{rule.text}</span>
        <span style={{ color: '#999', marginLeft: 'auto', fontSize: 11 }}>
          F₁L₁ = F₂L₂ · 拖拽砝码到杠杆 · 右键移除 · 吸附0.5m
        </span>
      </div>
    </div>
  )
}

// ============================================================
//  样式
// ============================================================
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
  actions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  btn: {
    background: '#4A90D9', color: '#fff', border: 'none',
    borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer',
  },
  main: { flex: 1, display: 'flex', overflow: 'hidden', background: '#fff', position: 'relative' },
  dataTable: {
    position: 'absolute', bottom: 10, right: 10,
    background: 'rgba(255,255,255,0.96)', borderRadius: 8,
    border: '1px solid #ddd', padding: '8px 12px',
    maxHeight: 220, overflowY: 'auto', fontSize: 11,
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  dataTitle: { fontWeight: 700, fontSize: 12, color: '#333', marginBottom: 6 },
  table: { borderCollapse: 'collapse', width: '100%' },
  th: {
    background: '#f5f5f5', padding: '4px 8px', textAlign: 'center',
    borderBottom: '2px solid #ddd', fontWeight: 600, color: '#555', whiteSpace: 'nowrap',
  },
  td: {
    padding: '3px 8px', textAlign: 'center',
    borderBottom: '1px solid #eee', color: '#333', whiteSpace: 'nowrap',
  },
  canvas: { flex: 1, width: '100%' },
  statusBar: {
    minHeight: 28, background: '#f5f5f5', borderTop: '1px solid #ccc',
    display: 'flex', alignItems: 'center', gap: 20,
    padding: '4px 14px', fontSize: 12, color: '#555', flexShrink: 0, flexWrap: 'wrap',
  },
}
