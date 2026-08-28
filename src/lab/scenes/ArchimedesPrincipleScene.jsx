/**
 * ArchimedesPrincipleScene — 探究浮力与排开液体重力（改进版）
 *
 * 物理规则：
 *   F浮 = ρ液 × g × V排
 *   F拉 = G物 − F浮
 *   阿基米德原理：F浮 = G排（排开液体重力）
 *
 * 部分浸入：V排随浸入深度增大
 * 完全浸没：V排 = 物体体积，继续下移浮力不变
 *
 * 交互：
 *   - 拖拽物体改变浸入深度
 *   - 滑块调节物体质量
 *   - 下拉切换液体类型
 *   - 📝记录保存实验数据
 *   - 重置按钮
 */

import { useRef, useEffect, useState, useCallback } from 'react'

const G = 9.8

/* ═══════════════════════════════════════════════════════════
 *  液体选项
 * ═══════════════════════════════════════════════════════════ */
const LIQUIDS = {
  water:     { name: '水',   density: 1000, color: 'rgba(33,150,243,0.35)' },
  saltwater: { name: '盐水', density: 1100, color: 'rgba(33,150,243,0.50)' },
  alcohol:   { name: '酒精', density: 800,  color: 'rgba(200,200,200,0.25)' },
}

/* ═══════════════════════════════════════════════════════════
 *  烧杯布局常量（屏幕比例）
 * ═══════════════════════════════════════════════════════════ */
const BEAKER = {
  topRatio: 0.30,     // 烧杯顶部 y 比例
  widthRatio: 0.22,   // 烧杯宽度占屏幕宽度比例
  heightRatio: 0.42,  // 烧杯高度占屏幕高度比例
  liquidRatio: 0.70,  // 液面占烧杯高度比例（初始）
  wallThick: 4,       // 烧杯壁厚
}

/* ═══════════════════════════════════════════════════════════
 *  力箭头缩放常量
 * ═══════════════════════════════════════════════════════════ */
const ARROW_SCALE = 40   // 1N 力 → 40px 箭头长度

export default function ArchimedesPrincipleScene({ preset }) {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const rendererRef = useRef(null)

  // ── 物理状态（ref，canvas每帧直接读取） ──
  const sim = useRef({
    objectY: 0,           // 0=完全在空气中，1=完全浸没
    objectMass: 0.5,      // kg
    objectVolume: 200,    // cm³
    objectDensity: 2500,  // kg/m³
    liquidType: 'water',
    liquidDensity: 1000,
    // 烧杯布局（resize时更新）
    beakerTop: 280, beakerH: 380,
    // 计算结果（每帧更新）
    G: 0, F拉: 0, F浮: 0,
    G排: 0, V排: 0, m排: 0,
    submerged: false,      // 是否完全浸没
    inWater: false,        // 是否接触水面
    animPhase: 0,
  })

  const interRef = useRef({ mode: 'idle' })
  const [records, setRecords] = useState([])
  const [cursor, setCursor] = useState('grab')
  const [, forceUpdate] = useState(0)

  // ── 初始化 ──
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
      // 存储烧杯布局到 sim（供物理计算使用）
      const B = getBeakerLayout(rect)
      sim.current.beakerTop = B.by
      sim.current.beakerH = B.bh
    }
    resize()
    window.addEventListener('resize', resize)

    function loop(ts) {
      updatePhysics()
      drawFrame(ctx, canvas.getBoundingClientRect())
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)

    return () => {
      window.removeEventListener('resize', resize)
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [])

  // ============================================================
  //  物理更新
  // ============================================================
  function updatePhysics() {
    const s = sim.current
    s.animPhase += 0.03

    /* ═══════════════════════════════════════════════════════════
     *  浮力计算
     * ───────────────────────────────────────────────────────────
     *  公式：F浮 = ρ液 × g × V排
     *
     *  部分浸入（objectY < 1）：
     *    V排 = V物体 × objectY，随浸入深度线性增大
     *
     *  完全浸没（objectY >= 1）：
     *    V排 = V物体（常量），继续下移浮力不再变化
     *    submerged = true
     *
     *  弹簧测力计读数（称重法）：
     *    F拉 = G物 − F浮
     *    当物体完全在空气中时 F拉 = G物
     *    当物体完全浸没时 F拉 = G物 − ρ液×g×V物体
     *
     *  阿基米德原理验证：
     *    G排 = m排 × g = ρ液 × V排 × g
     *    应恒等于 F浮
     *
     *  ⚠️ UI面板显示所有物理量；动画驱动用精确的F浮值
     *  浸入比由物体在屏幕上的实际位置决定：
     *    物体顶面Y = objectScreenY - objHalfH
     *    物体底面Y = objectScreenY + objHalfH
     *    水面Y = initialLiquidY
     *
     *    底面在水面以上 → 浸入比 = 0（未接触水）
     *    顶面在水面以下 → 浸入比 = 1（完全浸没）
     *    否则 → 浸入比 = (底面Y - 水面Y) / 物体高度（部分浸入）
     * ═══════════════════════════════════════════════════════════ */
    const V物体 = s.objectVolume / 1e6          // cm³ → m³
    const rho液 = s.liquidDensity

    // 烧杯布局
    const beakerTop = s.beakerTop
    const beakerH = s.beakerH
    const initialLiquidY = beakerTop + beakerH * (1 - BEAKER.liquidRatio)  // 初始水面 y

    // 物体屏幕位置（与 drawObject 一致）
    const airY = beakerTop - 60
    const submergedY = beakerTop + beakerH - 40
    const objectScreenY = airY + (submergedY - airY) * s.objectY
    const objHalfH = 22
    const objTopY = objectScreenY - objHalfH     // 物体顶面
    const objBottomY = objectScreenY + objHalfH  // 物体底面

    // 浸入比：根据物体与水面的实际位置关系计算
    let 浸入比 = 0
    if (objBottomY <= initialLiquidY) {
      // 底面在水面以上 → 未接触水
      浸入比 = 0
    } else if (objTopY >= initialLiquidY) {
      // 顶面在水面以下 → 完全浸没
      浸入比 = 1.0
    } else {
      // 部分浸入：底面在水面下，顶面在水面上
      浸入比 = (objBottomY - initialLiquidY) / (objHalfH * 2)
    }

    s.submerged = 浸入比 >= 1.0
    s.inWater = 浸入比 > 0

    // V排：根据实际浸入深度计算，完全浸没后不变
    const V排_m3 = V物体 * 浸入比
    s.V排 = V排_m3 * 1e6                            // → cm³（显示用）

    // 浮力
    s.F浮 = rho液 * G * V排_m3

    // 排开液体重力（阿基米德原理：应恒等于F浮）
    s.m排 = rho液 * V排_m3                       // kg
    s.G排 = s.m排 * G

    // 物体重力
    s.G = s.objectMass * G

    // 弹簧测力计读数（称重法：F拉 = G − F浮）
    s.F拉 = Math.max(0, s.G - s.F浮)

    forceUpdate(n => n + 1)
  }

  // ============================================================
  //  坐标计算
  // ============================================================
  function getBeakerLayout(rect) {
    const w = rect.width, h = rect.height
    const bw = w * BEAKER.widthRatio
    const bh = h * BEAKER.heightRatio
    const bx = w * 0.50             // 烧杯中心 x
    const by = h * BEAKER.topRatio  // 烧杯顶部 y
    const liquidH = bh * BEAKER.liquidRatio
    const liquidY = by + bh - liquidH

    return { w, h, bx, by, bw, bh, liquidH, liquidY }
  }

  function getObjectScreenY(rect) {
    const B = getBeakerLayout(rect)
    const airY = B.by - 60              // 物体在空气中的位置
    const submergedY = B.by + B.bh - 40 // 物体完全浸没时的位置
    return airY + (submergedY - airY) * sim.current.objectY
  }

  // ============================================================
  //  绘制
  // ============================================================
  function drawFrame(ctx, rect) {
    const w = rect.width, h = rect.height
    ctx.clearRect(0, 0, w, h)

    drawBackground(ctx, rect)
    drawBeaker(ctx, rect)
    drawSpringScale(ctx, rect)
    drawObject(ctx, rect)
    drawForceArrows(ctx, rect)
    drawDataPanel(ctx, rect)
    drawArchimedesKnowledge(ctx, rect)
    drawFormula(ctx, rect)
    drawInstructions(ctx, rect)
  }

  // ── 背景 ──
  function drawBackground(ctx, rect) {
    const w = rect.width, h = rect.height
    const tableY = h * 0.78
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, '#f8f8f8')
    grad.addColorStop(1, '#e8e8e8')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#f0f0f0'
    ctx.fillRect(0, tableY, w, h - tableY)
    ctx.strokeStyle = '#ccc'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, tableY)
    ctx.lineTo(w, tableY)
    ctx.stroke()
  }

  // ── 烧杯（液面动态变化） ──
  function drawBeaker(ctx, rect) {
    const B = getBeakerLayout(rect)
    const s = sim.current
    const liq = LIQUIDS[s.liquidType]
    const { bx, by, bw, bh } = B

    /* ────────────────────────────────────────────────────────
     *  液面动态变化
     *  初始液面高度 = 烧杯高度 × liquidRatio (70%)
     *  物体浸入后，排开液体使液面上升
     *  液面上升量 Δh = V排 / 烧杯截面积
     *  物体完全提出后，液面恢复初始高度
     * ──────────────────────────────────────────────────────── */
    const beakerSection = bw * 0.85           // 烧杯内截面近似宽度（px）
    const V排_cm3 = s.V排                     // cm³
    const Δh_px = V排_cm3 / (beakerSection * 0.15)  // 简化：cm³ → px 映射
    const currentLiquidH = B.liquidH + Math.min(Δh_px, bh * 0.15)  // 最多上升15%
    const currentLiquidY = by + bh - currentLiquidH

    // 烧杯主体（梯形透明）
    ctx.fillStyle = 'rgba(200,200,255,0.06)'
    ctx.beginPath()
    ctx.moveTo(bx - bw / 2, by)
    ctx.lineTo(bx - bw / 2 + 10, by + bh)
    ctx.lineTo(bx + bw / 2 - 10, by + bh)
    ctx.lineTo(bx + bw / 2, by)
    ctx.closePath()
    ctx.fill()

    // 烧杯壁
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'
    ctx.lineWidth = BEAKER.wallThick
    ctx.beginPath()
    ctx.moveTo(bx - bw / 2, by)
    ctx.lineTo(bx - bw / 2 + 10, by + bh)
    ctx.lineTo(bx + bw / 2 - 10, by + bh)
    ctx.lineTo(bx + bw / 2, by)
    ctx.closePath()
    ctx.stroke()

    // 液体
    ctx.fillStyle = liq.color
    ctx.beginPath()
    ctx.moveTo(bx - bw / 2 + 6, currentLiquidY)
    ctx.lineTo(bx - bw / 2 + 10, by + bh)
    ctx.lineTo(bx + bw / 2 - 10, by + bh)
    ctx.lineTo(bx + bw / 2 - 6, currentLiquidY)
    ctx.closePath()
    ctx.fill()

    // 液面波纹
    ctx.strokeStyle = 'rgba(33,150,243,0.5)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let x = bx - bw / 2 + 6; x <= bx + bw / 2 - 6; x += 2) {
      const t = (x - (bx - bw / 2)) / bw
      const y = currentLiquidY + Math.sin(t * Math.PI * 6 + s.animPhase) * 1.5
      if (x === bx - bw / 2 + 6) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()

    // 初始液面虚线标记
    ctx.strokeStyle = 'rgba(100,100,100,0.25)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(bx + bw / 2 + 5, B.liquidY)
    ctx.lineTo(bx + bw / 2 + 25, B.liquidY)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#999'
    ctx.font = '9px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('初始液面', bx + bw / 2 + 27, B.liquidY + 3)

    // 当前液面上升标注
    if (Δh_px > 1) {
      ctx.strokeStyle = '#E6A800'
      ctx.lineWidth = 1.5
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(bx + bw / 2 + 5, B.liquidY)
      ctx.lineTo(bx + bw / 2 + 5, currentLiquidY)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#E6A800'
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(`↑${V排_cm3.toFixed(0)}cm³`, bx + bw / 2 + 10, (B.liquidY + currentLiquidY) / 2)
    }

    // 完全浸没后液面不再变化提示
    if (s.submerged && Δh_px > 1) {
      ctx.fillStyle = '#4CAF50'
      ctx.font = 'bold 10px sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText('✓ 完全浸没，液面不再变化', bx + bw / 2 + 10, currentLiquidY + 14)
    }
  }

  // ── 弹簧测力计 ──
  function drawSpringScale(ctx, rect) {
    const w = rect.width, h = rect.height
    const s = sim.current
    const sx = w * 0.5
    const sy = h * 0.06
    const scaleW = 54, scaleH = 80

    // 支架横梁
    ctx.strokeStyle = '#888'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(sx - 30, sy)
    ctx.lineTo(sx + 30, sy)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(sx, sy + 8)
    ctx.stroke()

    // 测力计主体
    const grad = ctx.createLinearGradient(sx - scaleW / 2, sy + 8, sx + scaleW / 2, sy + 8 + scaleH)
    grad.addColorStop(0, '#bbb')
    grad.addColorStop(1, '#888')
    ctx.fillStyle = grad
    roundedRect(ctx, sx - scaleW / 2, sy + 8, scaleW, scaleH, 5)
    ctx.fill()
    ctx.strokeStyle = '#ccc'
    ctx.lineWidth = 1.5
    roundedRect(ctx, sx - scaleW / 2, sy + 8, scaleW, scaleH, 5)
    ctx.stroke()

    // 刻度盘
    ctx.fillStyle = '#1a1a2e'
    roundedRect(ctx, sx - scaleW / 2 + 7, sy + 16, scaleW - 14, scaleH - 16, 3)
    ctx.fill()

    // 指针
    const maxN = Math.max(s.G * 1.2, 5)
    const ratio = Math.min(1, s.F拉 / maxN)
    const needleAngle = -Math.PI / 2 + ratio * Math.PI
    const needleLen = 28
    const pivotY = sy + 8 + scaleH / 2 + 6
    ctx.strokeStyle = '#FF6B6B'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(sx, pivotY)
    ctx.lineTo(sx + needleLen * Math.cos(needleAngle), pivotY + needleLen * Math.sin(needleAngle))
    ctx.stroke()
    ctx.fillStyle = '#FF6B6B'
    ctx.beginPath()
    ctx.arc(sx, pivotY, 3, 0, Math.PI * 2)
    ctx.fill()

    // 读数
    ctx.fillStyle = '#4CAF50'
    ctx.font = 'bold 14px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(`${s.F拉.toFixed(2)} N`, sx, sy + 8 + scaleH + 6)
    ctx.fillStyle = '#555'
    ctx.font = '10px sans-serif'
    ctx.fillText('弹簧测力计', sx, sy + 8 + scaleH + 24)

    // 绳子
    const objY = getObjectScreenY(rect)
    ctx.strokeStyle = '#aaa'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(sx, sy + 8 + scaleH)
    ctx.lineTo(sx, objY - 18)
    ctx.stroke()
  }

  // ── 物体 ──
  function drawObject(ctx, rect) {
    const w = rect.width
    const s = sim.current
    const sx = w * 0.5
    const sy = getObjectScreenY(rect)
    const objSize = 22

    // 物体主体
    const grad = ctx.createLinearGradient(sx - objSize, sy - objSize, sx + objSize, sy + objSize)
    grad.addColorStop(0, '#CD853F')
    grad.addColorStop(0.5, '#B87333')
    grad.addColorStop(1, '#8B5A2B')
    ctx.fillStyle = grad
    roundedRect(ctx, sx - objSize, sy - objSize, objSize * 2, objSize * 2, 4)
    ctx.fill()

    // 浸入部分蓝色覆盖
    if (s.objectY > 0.01) {
      const submergedH = objSize * 2 * Math.min(1, s.objectY)
      ctx.fillStyle = 'rgba(33,150,243,0.25)'
      ctx.fillRect(sx - objSize + 1, sy + objSize - submergedH, objSize * 2 - 2, submergedH)
    }

    // 边框
    ctx.strokeStyle = s.submerged ? '#2196F3' : 'rgba(0,0,0,0.2)'
    ctx.lineWidth = s.submerged ? 2 : 1.5
    roundedRect(ctx, sx - objSize, sy - objSize, objSize * 2, objSize * 2, 4)
    ctx.stroke()

    // 质量标签
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${(s.objectMass * 1000).toFixed(0)}g`, sx, sy)

    // 完全浸没标记
    if (s.submerged) {
      ctx.fillStyle = '#2196F3'
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText('完全浸没', sx, sy + objSize + 14)
    }
  }

  // ── 受力箭头（长度随力的大小动态缩放） ──
  function drawForceArrows(ctx, rect) {
    const w = rect.width
    const s = sim.current
    const sx = w * 0.5
    const sy = getObjectScreenY(rect)
    const minArrow = 8   // 最小箭头长度

    // 重力 G（红色向下）
    const gLen = Math.max(minArrow, s.G * ARROW_SCALE)
    drawArrow(ctx, sx + 35, sy, sx + 35, sy + gLen, '#FF6B6B', 3, `G=${s.G.toFixed(2)}N`)

    // 浮力 F浮（蓝色向上）
    if (s.F浮 > 0.01) {
      const bLen = Math.max(minArrow, s.F浮 * ARROW_SCALE)
      drawArrow(ctx, sx - 35, sy, sx - 35, sy - bLen, '#2196F3', 3, `F浮=${s.F浮.toFixed(2)}N`)
    }

    // 拉力 F拉（绿色向上，从物体顶部出发）
    if (s.F拉 > 0.01) {
      const tLen = Math.max(minArrow, s.F拉 * ARROW_SCALE)
      drawArrow(ctx, sx, sy - 22, sx, sy - 22 - tLen, '#4CAF50', 2.5, `F拉=${s.F拉.toFixed(2)}N`)
    }
  }

  function drawArrow(ctx, x1, y1, x2, y2, color, lineW, label) {
    const angle = Math.atan2(y2 - y1, x2 - x1)
    const headLen = 8

    ctx.strokeStyle = color
    ctx.lineWidth = lineW
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()

    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(x2, y2)
    ctx.lineTo(x2 - headLen * Math.cos(angle - 0.35), y2 - headLen * Math.sin(angle - 0.35))
    ctx.lineTo(x2 - headLen * Math.cos(angle + 0.35), y2 - headLen * Math.sin(angle + 0.35))
    ctx.closePath()
    ctx.fill()

    if (label) {
      ctx.font = 'bold 10px sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = color
      const mx = (x1 + x2) / 2
      const my = (y1 + y2) / 2
      ctx.fillText(label, mx + 8, my)
    }
  }

  // ── 实时数据面板 ──
  function drawDataPanel(ctx, rect) {
    const w = rect.width
    const s = sim.current
    const panelW = 220, panelH = 260
    const px = w - panelW - 16, py = 16

    // 面板背景
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.shadowColor = 'rgba(0,0,0,0.08)'
    ctx.shadowBlur = 6
    roundedRect(ctx, px, py, panelW, panelH, 8)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.strokeStyle = '#ddd'
    ctx.lineWidth = 1
    roundedRect(ctx, px, py, panelW, panelH, 8)
    ctx.stroke()

    // 标题
    ctx.fillStyle = '#333'
    ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText('📊 实时数据', px + 14, py + 12)

    let y = py + 36
    const lh = 19

    // 物体状态
    ctx.fillStyle = s.submerged ? '#2196F3' : '#888'
    ctx.font = 'bold 11px sans-serif'
    ctx.fillText(s.submerged ? '● 完全浸没' : '○ 部分浸入', px + 14, y); y += lh + 2

    ctx.font = '11px sans-serif'

    // 物体重力 G
    ctx.fillStyle = '#FF6B6B'
    ctx.fillText(`物体重力 G = ${s.G.toFixed(3)} N`, px + 14, y); y += lh

    // 弹簧拉力 F拉
    ctx.fillStyle = '#4CAF50'
    ctx.fillText(`弹簧拉力 F拉 = ${s.F拉.toFixed(3)} N`, px + 14, y); y += lh

    // 浮力 F浮
    ctx.fillStyle = '#2196F3'
    ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`浮力 F浮 = ${s.F浮.toFixed(3)} N`, px + 14, y); y += lh

    // 排开体积 V排
    ctx.fillStyle = '#E6A800'
    ctx.font = '11px sans-serif'
    ctx.fillText(`排开体积 V排 = ${s.V排.toFixed(1)} cm³`, px + 14, y); y += lh

    // 排开液体重力 G排
    ctx.fillStyle = '#9C27B0'
    ctx.fillText(`排开液体重力 G排 = ${s.G排.toFixed(3)} N`, px + 14, y); y += lh + 4

    // 验证 F浮 ≈ G排
    const diff = Math.abs(s.F浮 - s.G排)
    const ok = diff < 0.01
    ctx.fillStyle = ok ? '#4CAF50' : '#FF9800'
    ctx.font = 'bold 11px sans-serif'
    ctx.fillText(ok ? '✔ F浮 = G排（验证通过）' : `✘ |F浮−G排|=${diff.toFixed(4)}N`, px + 14, y)
  }

  // ── 公式 ──
  function drawFormula(ctx, rect) {
    const h = rect.height
    const x = 16, y = h - 24
    ctx.fillStyle = '#4A90D9'
    ctx.font = 'bold 14px serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillText('阿基米德原理：F浮 = G排 = ρ液·g·V排', x, y)
  }

  // ── 阿基米德原理知识卡片（右下角） ──
  function drawArchimedesKnowledge(ctx, rect) {
    const w = rect.width, h = rect.height
    const panelW = 235, panelH = 200
    const px = 16
    const py = h - panelH - 80

    // 背景
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.shadowColor = 'rgba(0,0,0,0.08)'
    ctx.shadowBlur = 6
    roundedRect(ctx, px, py, panelW, panelH, 8)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.strokeStyle = '#ddd'
    ctx.lineWidth = 1
    roundedRect(ctx, px, py, panelW, panelH, 8)
    ctx.stroke()

    // 标题
    ctx.fillStyle = '#2196F3'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText('📖 浮力只跟V排有关，跟深度无关！', px + 12, py + 10)

    // 阶段表格
    const tableX = px + 12
    let y = py + 32
    const rowH = 17

    // 表头
    ctx.fillStyle = '#555'
    ctx.font = 'bold 10px sans-serif'
    ctx.fillText('阶段', tableX, y)
    ctx.fillText('V排', tableX + 68, y)
    ctx.fillText('F浮', tableX + 115, y)
    ctx.fillText('液面', tableX + 165, y)
    y += rowH + 2

    // 分隔线
    ctx.strokeStyle = '#eee'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(tableX, y - 2)
    ctx.lineTo(tableX + panelW - 24, y - 2)
    ctx.stroke()

    // 数据行
    ctx.font = '10px sans-serif'
    const rows = [
      { label: '空中下降', v: '0', f: '0', h: '不变', color: '#888' },
      { label: '底面触水', v: '开始↑', f: '开始↑', h: '开始↑', color: '#E6A800' },
      { label: '部分浸入', v: '线性↑', f: '线性↑', h: '持续↑', color: '#2196F3' },
      { label: '完全浸没', v: '=V物体', f: '=常量', h: '不变', color: '#4CAF50' },
    ]
    for (const row of rows) {
      ctx.fillStyle = row.color
      ctx.font = 'bold 10px sans-serif'
      ctx.fillText(row.label, tableX, y)
      ctx.font = '10px sans-serif'
      ctx.fillStyle = '#333'
      ctx.fillText(row.v, tableX + 68, y)
      ctx.fillText(row.f, tableX + 115, y)
      ctx.fillText(row.h, tableX + 165, y)
      y += rowH
    }

    // 核心结论
    y += 4
    ctx.strokeStyle = '#2196F3'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(tableX, y)
    ctx.lineTo(tableX + panelW - 24, y)
    ctx.stroke()
    y += 6

    ctx.fillStyle = '#2196F3'
    ctx.font = 'bold 10px sans-serif'
    ctx.fillText('浮力只跟排开液体体积有关', tableX, y); y += 15
    ctx.fillText('跟浸入深度无关！', tableX, y); y += 15
    ctx.fillStyle = '#888'
    ctx.font = '10px sans-serif'
    ctx.fillText('深入水下10米和刚好浸没，', tableX, y); y += 14
    ctx.fillText('浮力一样大。', tableX, y)
  }

  // ── 操作说明 ──
  function drawInstructions(ctx, rect) {
    const h = rect.height
    const x = 16, y = h - 60
    ctx.fillStyle = '#888'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillText('上下拖拽物体改变浸入程度 · 观察液面变化 · 验证F浮=G排', x, y)
  }

  // ── 圆角矩形辅助 ──
  function roundedRect(ctx, x, y, w, h, r) {
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
  //  交互
  // ============================================================
  const handleMouseDown = useCallback((e) => {
    interRef.current.mode = 'dragging'
    setCursor('grabbing')
  }, [])

  const handleMouseMove = useCallback((e) => {
    if (interRef.current.mode !== 'dragging') return
    const rect = canvasRef.current.getBoundingClientRect()
    const sy = e.clientY - rect.top
    const B = getBeakerLayout(rect)

    // 映射到浸入比 0~1，上限1.0（完全浸没后不再增加）
    const airY = B.by - 60
    const waterY = B.by + B.bh - 40
    const ratio = (sy - airY) / (waterY - airY)
    sim.current.objectY = Math.max(0, Math.min(1.0, ratio))
  }, [])

  const handleMouseUp = useCallback(() => {
    interRef.current.mode = 'idle'
    setCursor('grab')
  }, [])

  const handleContextMenu = useCallback((e) => e.preventDefault(), [])

  // ── 记录数据 ──
  const recordData = useCallback(() => {
    const s = sim.current
    setRecords(prev => [...prev, {
      id: Date.now(),
      G: s.G.toFixed(3),
      F拉: s.F拉.toFixed(3),
      F浮: s.F浮.toFixed(3),
      G排: s.G排.toFixed(3),
      V排: s.V排.toFixed(1),
      submerged: s.submerged,
      match: Math.abs(s.F浮 - s.G排) < 0.01,
    }])
  }, [])

  // ── 状态栏文本 ──
  const rule = (() => {
    const s = sim.current
    if (s.objectY < 0.01) return { text: '上下拖拽物体浸入液体', color: '#999' }
    const diff = Math.abs(s.F浮 - s.G排)
    if (diff < 0.01) return { text: `✔ 验证：F浮=${s.F浮.toFixed(3)}N = G排=${s.G排.toFixed(3)}N`, color: '#4CAF50' }
    return { text: `F浮=${s.F浮.toFixed(3)}N  G排=${s.G排.toFixed(3)}N`, color: '#FF9800' }
  })()

  // ============================================================
  //  渲染
  // ============================================================
  return (
    <div style={S.container}>
      {/* 工具栏 */}
      <div style={S.toolbar}>
        <span style={S.title}>探究浮力与排开液体重力</span>
        <div style={S.actions}>
          <label style={S.label}>
            液体：
            <select value={sim.current.liquidType}
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
          <label style={S.label}>
            质量：
            <input type="range" min="0.1" max="2" step="0.1"
              value={sim.current.objectMass}
              onChange={(e) => { sim.current.objectMass = parseFloat(e.target.value) }}
              style={{ width: 70, accentColor: '#4A90D9' }} />
            <span style={S.sliderVal}>{(sim.current.objectMass * 1000).toFixed(0)}g</span>
          </label>
          <button style={{ ...S.btn, background: '#e74c3c' }} onClick={recordData}>📝 记录</button>
          <button style={{ ...S.btn, background: '#999' }} onClick={() => setRecords([])}>清空</button>
          <button style={{ ...S.btn, background: '#7B1FA2' }} onClick={() => { sim.current.objectY = 0 }}>重置</button>
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
        {records.length > 0 && (
          <div style={S.dataTable}>
            <div style={S.dataTitle}>📊 实验数据记录</div>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>#</th>
                  <th style={S.th}>G(N)</th>
                  <th style={S.th}>F拉(N)</th>
                  <th style={S.th}>F浮(N)</th>
                  <th style={S.th}>G排(N)</th>
                  <th style={S.th}>V排(cm³)</th>
                  <th style={S.th}>状态</th>
                  <th style={S.th}>验证</th>
                </tr>
              </thead>
              <tbody>
                {records.map((rec, i) => (
                  <tr key={rec.id}>
                    <td style={S.td}>{i + 1}</td>
                    <td style={S.td}>{rec.G}</td>
                    <td style={S.td}>{rec.F拉}</td>
                    <td style={{ ...S.td, color: '#2196F3', fontWeight: 600 }}>{rec.F浮}</td>
                    <td style={{ ...S.td, color: '#9C27B0', fontWeight: 600 }}>{rec.G排}</td>
                    <td style={S.td}>{rec.V排}</td>
                    <td style={S.td}>{rec.submerged ? '浸没' : '部分'}</td>
                    <td style={{ ...S.td, color: rec.match ? '#4CAF50' : '#FF9800', fontWeight: 600 }}>
                      {rec.match ? '✔' : '✘'}
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
          F浮=G排 · 称重法 · 排水法
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
  label: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#555' },
  sliderVal: { color: '#4A90D9', fontWeight: 600, minWidth: 35, fontSize: 12 },
  select: {
    background: '#fff', color: '#333', border: '1px solid #ccc',
    borderRadius: 4, padding: '3px 6px', fontSize: 12,
  },
  btn: {
    color: '#fff', border: 'none',
    borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer',
  },
  main: { flex: 1, display: 'flex', overflow: 'hidden', background: '#fff', position: 'relative' },
  canvas: { flex: 1, width: '100%' },
  statusBar: {
    minHeight: 28, background: '#f5f5f5', borderTop: '1px solid #ccc',
    display: 'flex', alignItems: 'center', gap: 20,
    padding: '4px 14px', fontSize: 12, color: '#555', flexShrink: 0, flexWrap: 'wrap',
  },
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
}
