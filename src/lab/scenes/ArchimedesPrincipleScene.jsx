/**
 * ArchimedesPrincipleScene — 浮力综合实验（双Tab）
 *
 * Tab1: 探究浮力因素（控制变量法）
 *   - 改变V排 / 改变ρ液 模式切换
 *   - 滑块调节物体体积（50-500cm³）
 *   - 物体密度参数（默认2700铝）
 *   - 5种液体（酒精、食用油、水、盐水、水银）
 *   - 物体大小随体积变化
 *   - G = ρ_obj × V × g
 *   - 知识卡：控制变量法
 *
 * Tab2: 验证阿基米德原理（F浮=G排）
 *   - 滑块调节物体质量（0.1-2kg）
 *   - 3种液体（水、盐水、酒精）
 *   - 数据面板显示 G、F拉、F浮、G排，验证F浮=G排
 *   - 知识卡：浮力只跟V排有关，跟深度无关
 *
 * 共享：烧杯、弹簧测力计、物体、力箭头、拖拽交互、数据记录表、状态栏
 *
 * 物理规则：F浮 = ρ液 × g × V排
 */

import { useRef, useEffect, useState, useCallback } from 'react'

const G = 9.8

/* ═══════════════════════════════════════════════════════════
 *  液体选项（Tab1用5种，Tab2用3种）
 * ═══════════════════════════════════════════════════════════ */
const ALL_LIQUIDS = {
  alcohol:   { name: '酒精',   density: 800,   color: 'rgba(201,177,232,0.35)' },
  oil:       { name: '食用油', density: 920,   color: 'rgba(245,222,179,0.40)' },
  water:     { name: '水',     density: 1000,  color: 'rgba(126,200,227,0.45)' },
  saltwater: { name: '盐水',   density: 1100,  color: 'rgba(168,216,168,0.45)' },
  mercury:   { name: '水银',   density: 13600, color: 'rgba(184,184,184,0.70)' },
}

const TAB1_LIQUIDS = ALL_LIQUIDS
const TAB2_LIQUIDS = { water: ALL_LIQUIDS.water, saltwater: ALL_LIQUIDS.saltwater, alcohol: ALL_LIQUIDS.alcohol }

/* ═══════════════════════════════════════════════════════════
 *  烧杯布局常量
 * ═══════════════════════════════════════════════════════════ */
const BEAKER = {
  topRatio: 0.28,
  widthRatio: 0.20,
  heightRatio: 0.44,
  liquidRatio: 0.70,
  wallThick: 4,
}

const ARROW_SCALE = 35

export default function ArchimedesPrincipleScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const sim = useRef({
    // 共享状态
    objectY: 0,
    liquidType: 'water',
    liquidDensity: 1000,
    beakerTop: 280, beakerH: 380,
    animPhase: 0,
    submerged: false,

    // Tab1 专用
    objectVolume: 200,    // cm³
    objectDensity: 2700,  // kg/m³ (铝)
    mode: 'varyV',        // 'varyV' | 'varyRho'

    // Tab2 专用
    objectMass: 0.5,      // kg

    // 计算结果（每帧更新）
    G: 0, F拉: 0, F浮: 0,
    V排: 0, G排: 0, m排: 0,
  })

  const interRef = useRef({ mode: 'idle' })
  const [records, setRecords] = useState([])
  const [cursor, setCursor] = useState('grab')
  const [activeTab, setActiveTab] = useState(1) // 1 | 2
  const [showGuide, setShowGuide] = useState(true)
  const guideAlpha = useRef(1)
  const [, forceUpdate] = useState(0)

  // 当前 tab 对应的液体列表
  const liquids = activeTab === 1 ? TAB1_LIQUIDS : TAB2_LIQUIDS

  // 切换 tab 时重置液体
  const switchTab = useCallback((tab) => {
    setActiveTab(tab)
    const s = sim.current
    if (tab === 1) {
      // Tab1：重置为默认值
      s.objectVolume = 200
      s.objectDensity = 2700
      s.mode = 'varyV'
      s.liquidType = 'water'
      s.liquidDensity = 1000
    } else {
      // Tab2：重置为默认值
      s.objectMass = 0.5
      s.liquidType = 'water'
      s.liquidDensity = 1000
    }
    s.objectY = 0
    setRecords([])
    setShowGuide(true)
    forceUpdate(n => n + 1)
  }, [])

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

    const V物体 = s.objectVolume / 1e6
    const rho液 = s.liquidDensity

    const beakerTop = s.beakerTop
    const beakerH = s.beakerH
    const initialLiquidY = beakerTop + beakerH * (1 - BEAKER.liquidRatio)

    const airY = beakerTop - 60
    const submergedY = beakerTop + beakerH - 40
    const objectScreenY = airY + (submergedY - airY) * s.objectY
    const objHalfH = 22
    const objTopY = objectScreenY - objHalfH
    const objBottomY = objectScreenY + objHalfH

    let 浸入比 = 0
    if (objBottomY <= initialLiquidY) {
      浸入比 = 0
    } else if (objTopY >= initialLiquidY) {
      浸入比 = 1.0
    } else {
      浸入比 = (objBottomY - initialLiquidY) / (objHalfH * 2)
    }

    s.submerged = 浸入比 >= 1.0
    const V排_m3 = V物体 * 浸入比
    s.V排 = V排_m3 * 1e6

    s.F浮 = rho液 * G * V排_m3

    // 排开液体重力（阿基米德原理）
    s.m排 = rho液 * V排_m3
    s.G排 = s.m排 * G

    // 重力：Tab1用 ρ×V×g，Tab2用 mass×g
    if (activeTab === 1) {
      const rhoObj = s.objectDensity
      s.G = rhoObj * V物体 * G
    } else {
      s.G = s.objectMass * G
    }

    s.F拉 = Math.max(0, s.G - s.F浮)

    forceUpdate(n => n + 1)
  }

  function getBeakerLayout(rect) {
    const w = rect.width, h = rect.height
    const bw = w * BEAKER.widthRatio
    const bh = h * BEAKER.heightRatio
    const bx = w * 0.50
    const by = h * BEAKER.topRatio
    const liquidH = bh * BEAKER.liquidRatio
    const liquidY = by + bh - liquidH
    return { w, h, bx, by, bw, bh, liquidH, liquidY }
  }

  function getObjectScreenY(rect) {
    const B = getBeakerLayout(rect)
    const airY = B.by - 60
    const submergedY = B.by + B.bh - 40
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
    drawGuideBubble(ctx, rect)
    drawDataPanel(ctx, rect)
    drawKnowledgeCard(ctx, rect)
    drawFormula(ctx, rect)
    drawInstructions(ctx, rect)
  }

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

  function drawBeaker(ctx, rect) {
    const B = getBeakerLayout(rect)
    const s = sim.current
    const liq = liquids[s.liquidType] || ALL_LIQUIDS[s.liquidType]
    const { bx, by, bw, bh } = B

    const beakerSection = bw * 0.85
    const V排_cm3 = s.V排
    const Δh_px = V排_cm3 / (beakerSection * 0.15)
    const currentLiquidH = B.liquidH + Math.min(Δh_px, bh * 0.15)
    const currentLiquidY = by + bh - currentLiquidH

    // 烧杯主体
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

    // 液面高光线
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(bx - bw / 2 + 6, currentLiquidY)
    ctx.lineTo(bx + bw / 2 - 6, currentLiquidY)
    ctx.stroke()

    // 液体名称标签
    ctx.fillStyle = liq.color.replace(/[\d.]+\)$/, '0.8)')
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(liq.name, bx, currentLiquidY + 20)

    // 密度标注
    ctx.fillStyle = '#666'
    ctx.font = '10px sans-serif'
    ctx.fillText(`ρ=${liq.density} kg/m³`, bx, currentLiquidY + 35)

    // Tab2: 初始液面虚线标记 + 液面上升标注
    if (activeTab === 2) {
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

      if (s.submerged && Δh_px > 1) {
        ctx.fillStyle = '#4CAF50'
        ctx.font = 'bold 10px sans-serif'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText('✓ 完全浸没，液面不再变化', bx + bw / 2 + 10, currentLiquidY + 14)
      }
    }
  }

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

  function drawObject(ctx, rect) {
    const w = rect.width
    const s = sim.current
    const sx = w * 0.5
    const sy = getObjectScreenY(rect)

    // Tab1: 物体大小随体积变化（50cm³→14px, 500cm³→32px）
    // Tab2: 固定大小
    const objSize = activeTab === 1
      ? 14 + (s.objectVolume - 50) / (500 - 50) * 18
      : 22

    // 物体颜色
    let r, g, b
    if (activeTab === 1) {
      const volRatio = (s.objectVolume - 50) / (500 - 50)
      r = Math.round(180 + volRatio * 40)
      g = Math.round(120 - volRatio * 30)
      b = Math.round(80 - volRatio * 40)
    } else {
      r = 185; g = 115; b = 51  // 铜色（Tab2固定）
    }

    const grad = ctx.createLinearGradient(sx - objSize, sy - objSize, sx + objSize, sy + objSize)
    grad.addColorStop(0, `rgb(${r + 30},${g + 20},${b + 10})`)
    grad.addColorStop(0.5, `rgb(${r},${g},${b})`)
    grad.addColorStop(1, `rgb(${r - 30},${g - 20},${b - 10})`)
    ctx.fillStyle = grad
    roundedRect(ctx, sx - objSize, sy - objSize, objSize * 2, objSize * 2, 4)
    ctx.fill()

    // 浸入部分蓝色覆盖
    if (s.objectY > 0.01) {
      const submergedH = objSize * 2 * Math.min(1, s.objectY)
      ctx.fillStyle = 'rgba(33,150,243,0.25)'
      ctx.fillRect(sx - objSize + 1, sy + objSize - submergedH, objSize * 2 - 2, submergedH)
    }

    ctx.strokeStyle = s.submerged ? '#2196F3' : 'rgba(0,0,0,0.2)'
    ctx.lineWidth = s.submerged ? 2 : 1.5
    roundedRect(ctx, sx - objSize, sy - objSize, objSize * 2, objSize * 2, 4)
    ctx.stroke()

    // 标签：Tab1显示体积，Tab2显示质量
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (activeTab === 1) {
      ctx.fillText(`${s.objectVolume}cm³`, sx, sy)
    } else {
      ctx.fillText(`${(s.objectMass * 1000).toFixed(0)}g`, sx, sy)
    }

    // Tab2: 完全浸没标记
    if (activeTab === 2 && s.submerged) {
      ctx.fillStyle = '#2196F3'
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText('完全浸没', sx, sy + objSize + 14)
    }
  }

  function drawForceArrows(ctx, rect) {
    const w = rect.width
    const s = sim.current
    const sx = w * 0.5
    const sy = getObjectScreenY(rect)
    const minArrow = 8

    // 重力 G（红色向下）
    const gLen = Math.max(minArrow, s.G * ARROW_SCALE)
    drawArrow(ctx, sx + 35, sy, sx + 35, sy + gLen, '#FF6B6B', 3, `G=${s.G.toFixed(2)}N`)

    // 浮力 F浮（蓝色向上）
    if (s.F浮 > 0.01) {
      const bLen = Math.max(minArrow, s.F浮 * ARROW_SCALE)
      drawArrow(ctx, sx - 35, sy, sx - 35, sy - bLen, '#2196F3', 3, `F浮=${s.F浮.toFixed(2)}N`)
    }

    // 拉力 F拉（绿色向上）
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
    const panelW = 240, panelH = activeTab === 1 ? 240 : 260
    const px = w - panelW - 16, py = 16

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

    let y = py + 12
    const lh = 20

    if (activeTab === 1) {
      // Tab1: 浮力因素分析
      ctx.fillStyle = '#333'
      ctx.font = 'bold 13px sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText('📊 浮力因素分析', px + 14, y); y += 26

      ctx.fillStyle = '#E6A800'
      ctx.font = 'bold 11px sans-serif'
      ctx.fillText(`实验模式：${s.mode === 'varyV' ? '改变V排' : '改变ρ液'}`, px + 14, y); y += lh + 4

      ctx.fillStyle = '#4A90D9'
      ctx.font = '11px sans-serif'
      ctx.fillText(`液体密度 ρ液 = ${s.liquidDensity} kg/m³`, px + 14, y); y += lh

      ctx.fillStyle = '#E6A800'
      ctx.fillText(`排开体积 V排 = ${s.V排.toFixed(1)} cm³`, px + 14, y); y += lh

      ctx.fillStyle = '#2196F3'
      ctx.font = 'bold 12px sans-serif'
      ctx.fillText(`浮力 F浮 = ${s.F浮.toFixed(3)} N`, px + 14, y); y += lh + 4

      // 分隔线
      ctx.strokeStyle = '#eee'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(px + 14, y)
      ctx.lineTo(px + panelW - 14, y)
      ctx.stroke()
      y += 8

      ctx.fillStyle = '#333'
      ctx.font = 'bold 11px sans-serif'
      ctx.fillText('浮力与因素关系：', px + 14, y); y += lh

      ctx.font = '10px sans-serif'
      const factors = [
        { label: '✓ 液体密度 ρ液', desc: 'ρ液↑ → F浮↑', color: '#4A90D9' },
        { label: '✓ 排开体积 V排', desc: 'V排↑ → F浮↑', color: '#E6A800' },
        { label: '✗ 物体密度', desc: '无关', color: '#999' },
        { label: '✗ 浸入深度', desc: '完全浸没后无关', color: '#999' },
        { label: '✗ 物体质量', desc: '无关', color: '#999' },
      ]
      for (const f of factors) {
        ctx.fillStyle = f.color
        ctx.font = 'bold 10px sans-serif'
        ctx.fillText(f.label, px + 14, y)
        ctx.font = '10px sans-serif'
        ctx.fillStyle = '#666'
        ctx.fillText(f.desc, px + 155, y)
        y += 16
      }
    } else {
      // Tab2: 阿基米德原理验证
      ctx.fillStyle = '#333'
      ctx.font = 'bold 13px sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText('📊 阿基米德原理验证', px + 14, y); y += 22

      ctx.fillStyle = '#666'
      ctx.font = '10px sans-serif'
      ctx.fillText('F浮 = G排（浮力等于排开液体的重力）', px + 14, y); y += lh + 4

      ctx.font = '12px sans-serif'
      ctx.fillStyle = '#2196F3'
      ctx.font = 'bold 12px sans-serif'
      ctx.fillText(`F浮 = ${s.F浮.toFixed(3)} N`, px + 14, y); y += lh

      ctx.fillStyle = '#9C27B0'
      ctx.fillText(`G排 = ${s.G排.toFixed(3)} N`, px + 14, y); y += lh

      const diff = Math.abs(s.F浮 - s.G排)
      ctx.fillStyle = '#555'
      ctx.font = '12px sans-serif'
      ctx.fillText(`差值 = ${diff.toFixed(4)} N`, px + 14, y); y += lh + 4

      // 验证结果
      const ok = diff < 0.01
      ctx.fillStyle = ok ? '#4CAF50' : '#FF9800'
      ctx.font = 'bold 13px sans-serif'
      ctx.fillText(ok ? '✓ 验证成功：F浮 = G排' : '✗ 继续调整浸入深度', px + 14, y)
    }
  }

  // ── 知识卡片 ──
  function drawKnowledgeCard(ctx, rect) {
    const h = rect.height

    if (activeTab === 1) {
      // Tab1: 控制变量法知识卡
      const panelW = 230, panelH = 155
      const px = 16
      const py = h - panelH - 80

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

      ctx.fillStyle = '#2196F3'
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText('📖 控制变量法', px + 12, py + 10)

      let y = py + 32

      ctx.fillStyle = '#4A90D9'
      ctx.font = 'bold 10px sans-serif'
      ctx.fillText('实验1：保持ρ液不变', px + 12, y); y += 15
      ctx.fillStyle = '#333'
      ctx.font = '10px sans-serif'
      ctx.fillText('改变V排 → 测F浮 → 验证F浮∝V排', px + 12, y); y += 18

      ctx.fillStyle = '#E6A800'
      ctx.font = 'bold 10px sans-serif'
      ctx.fillText('实验2：保持V排不变', px + 12, y); y += 15
      ctx.fillStyle = '#333'
      ctx.font = '10px sans-serif'
      ctx.fillText('改变ρ液 → 测F浮 → 验证F浮∝ρ液', px + 12, y); y += 18

      ctx.strokeStyle = '#2196F3'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(px + 12, y)
      ctx.lineTo(px + panelW - 12, y)
      ctx.stroke()
      y += 6

      ctx.fillStyle = '#2196F3'
      ctx.font = 'bold 10px sans-serif'
      ctx.fillText('结论：F浮 = ρ液·g·V排', px + 12, y); y += 15
      ctx.fillStyle = '#888'
      ctx.font = '10px sans-serif'
      ctx.fillText('浮力只与ρ液和V排有关', px + 12, y)
    } else {
      // Tab2: 阿基米德原理知识卡
      const panelW = 235, panelH = 200
      const px = 16
      const py = h - panelH - 80

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

      ctx.fillStyle = '#2196F3'
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText('📖 浮力只跟V排有关，跟深度无关！', px + 12, py + 10)

      const tableX = px + 12
      let y = py + 32
      const rowH = 17

      ctx.fillStyle = '#555'
      ctx.font = 'bold 10px sans-serif'
      ctx.fillText('阶段', tableX, y)
      ctx.fillText('V排', tableX + 68, y)
      ctx.fillText('F浮', tableX + 115, y)
      ctx.fillText('液面', tableX + 165, y)
      y += rowH + 2

      ctx.strokeStyle = '#eee'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(tableX, y - 2)
      ctx.lineTo(tableX + panelW - 24, y - 2)
      ctx.stroke()

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
  }

  function drawFormula(ctx, rect) {
    const h = rect.height
    const x = 16, y = h - 24
    ctx.fillStyle = '#4A90D9'
    ctx.font = 'bold 14px serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    if (activeTab === 1) {
      ctx.fillText('F浮 = ρ液 × g × V排', x, y)
    } else {
      ctx.fillText('阿基米德原理：F浮 = G排 = ρ液·g·V排', x, y)
    }
  }

  function drawInstructions(ctx, rect) {
    const h = rect.height
    const x = 16, y = h - 60
    ctx.fillStyle = '#888'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    if (activeTab === 1) {
      ctx.fillText('拖拽物体改变浸入深度 · 调节体积和液体 · 观察浮力变化', x, y)
    } else {
      ctx.fillText('上下拖拽物体改变浸入程度 · 观察液面变化 · 验证F浮=G排', x, y)
    }
  }

  // ── 操作引导气泡 ──
  function drawGuideBubble(ctx, rect) {
    // 更新透明度
    const targetAlpha = showGuide ? 1 : 0
    guideAlpha.current += (targetAlpha - guideAlpha.current) * 0.15
    if (guideAlpha.current < 0.01) return

    const w = rect.width
    const s = sim.current
    const sx = w * 0.5
    const objY = getObjectScreenY(rect)
    const objSize = activeTab === 1 ? (14 + (s.objectVolume - 50) / (500 - 50) * 18) : 22

    // 浮动动画
    const floatY = Math.sin(Date.now() / 500 * Math.PI * 2 / 1.5) * 4

    const text = activeTab === 1 ? '👇 拽物体进入液体' : '👇 拽物体浸入水中，记录F浮=G排'
    const bx = sx + objSize + 30
    const by = objY + floatY

    ctx.save()
    ctx.globalAlpha = guideAlpha.current

    // 测量文字宽度
    ctx.font = '13px sans-serif'
    const tw = ctx.measureText(text).width
    const pw = tw + 20
    const ph = 30
    const px = bx
    const py = by - ph / 2

    // 气泡背景
    ctx.fillStyle = 'rgba(33,33,33,0.85)'
    ctx.beginPath()
    ctx.roundRect(px, py, pw, ph, 8)
    ctx.fill()

    // 左箭头
    ctx.beginPath()
    ctx.moveTo(px, by - 6)
    ctx.lineTo(px - 8, by)
    ctx.lineTo(px, by + 6)
    ctx.closePath()
    ctx.fill()

    // 文字
    ctx.fillStyle = '#fff'
    ctx.font = '13px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, px + 10, by)

    ctx.restore()
  }

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
    const rect = canvasRef.current.getBoundingClientRect()
    const w = rect.width
    const sx = w * 0.5
    const sy = getObjectScreenY(rect)
    const objSize = activeTab === 1
      ? 14 + (sim.current.objectVolume - 50) / (500 - 50) * 18
      : 22
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    if (Math.abs(mx - sx) <= objSize + 10 && Math.abs(my - sy) <= objSize + 10) {
      interRef.current.mode = 'dragging'
      setCursor('grabbing')
      setShowGuide(false)
    }
  }, [activeTab])

  const handleMouseMove = useCallback((e) => {
    if (interRef.current.mode !== 'dragging') return
    const rect = canvasRef.current.getBoundingClientRect()
    const sy = e.clientY - rect.top
    const B = getBeakerLayout(rect)
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

  const recordData = useCallback(() => {
    const s = sim.current
    if (activeTab === 1) {
      setRecords(prev => [...prev, {
        id: Date.now(),
        liquid: (liquids[s.liquidType] || ALL_LIQUIDS[s.liquidType]).name,
        rho液: s.liquidDensity,
        V排: s.V排.toFixed(1),
        F浮: s.F浮.toFixed(3),
        submerged: s.submerged,
      }])
    } else {
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
    }
  }, [activeTab, liquids])

  // ============================================================
  //  渲染
  // ============================================================
  const s = sim.current

  // 状态栏文本
  let statusText, statusColor
  if (activeTab === 1) {
    statusText = `F浮 = ${s.F浮.toFixed(3)}N = ${s.liquidDensity}×9.8×${(s.V排 / 1e6).toFixed(6)}`
    statusColor = '#2196F3'
  } else {
    if (s.objectY < 0.01) {
      statusText = '上下拖拽物体浸入液体'
      statusColor = '#999'
    } else {
      const diff = Math.abs(s.F浮 - s.G排)
      if (diff < 0.01) {
        statusText = `✔ 验证：F浮=${s.F浮.toFixed(3)}N = G排=${s.G排.toFixed(3)}N`
        statusColor = '#4CAF50'
      } else {
        statusText = `F浮=${s.F浮.toFixed(3)}N  G排=${s.G排.toFixed(3)}N`
        statusColor = '#FF9800'
      }
    }
  }

  return (
    <div style={S.container}>
      <div style={S.toolbar}>
        {/* Tab 切换 */}
        <div style={S.tabGroup}>
          <button
            style={activeTab === 1 ? S.tabBtnActive : S.tabBtn}
            onClick={() => switchTab(1)}
          >探究浮力因素</button>
          <button
            style={activeTab === 2 ? S.tabBtnActive : S.tabBtn}
            onClick={() => switchTab(2)}
          >验证阿基米德原理</button>
        </div>
        <div style={S.actions}>
          {/* Tab1 专用控件 */}
          {activeTab === 1 && (
            <>
              <div style={S.modeGroup}>
                <button
                  style={s.mode === 'varyV' ? S.modeBtnActive : S.modeBtn}
                  onClick={() => { sim.current.mode = 'varyV'; forceUpdate(n => n + 1) }}
                >改变V排</button>
                <button
                  style={s.mode === 'varyRho' ? S.modeBtnActive : S.modeBtn}
                  onClick={() => { sim.current.mode = 'varyRho'; forceUpdate(n => n + 1) }}
                >改变ρ液</button>
              </div>
              <div style={S.sep} />
            </>
          )}
          <label style={S.label}>
            液体：
            <select value={s.liquidType}
              onChange={(e) => {
                sim.current.liquidType = e.target.value
                sim.current.liquidDensity = (liquids[e.target.value] || ALL_LIQUIDS[e.target.value]).density
              }}
              style={S.select}>
              {Object.entries(liquids).map(([k, v]) => (
                <option key={k} value={k}>{v.name} (ρ={v.density})</option>
              ))}
            </select>
          </label>
          {/* Tab1: 体积滑块 */}
          {activeTab === 1 && (
            <label style={S.label}>
              体积：
              <input type="range" min="50" max="500" step="10"
                value={s.objectVolume}
                onChange={(e) => { sim.current.objectVolume = parseInt(e.target.value) }}
                style={{ width: 80, accentColor: '#E6A800' }} />
              <span style={S.sliderVal}>{s.objectVolume}cm³</span>
            </label>
          )}
          {/* Tab2: 质量滑块 */}
          {activeTab === 2 && (
            <label style={S.label}>
              质量：
              <input type="range" min="0.1" max="2" step="0.1"
                value={s.objectMass}
                onChange={(e) => { sim.current.objectMass = parseFloat(e.target.value) }}
                style={{ width: 70, accentColor: '#4A90D9' }} />
              <span style={S.sliderVal2}>{(s.objectMass * 1000).toFixed(0)}g</span>
            </label>
          )}
          <button style={{ ...S.btn, background: '#e74c3c' }} onClick={recordData}>📝 记录</button>
          <button style={{ ...S.btn, background: '#999' }} onClick={() => setRecords([])}>清空</button>
          <button style={{ ...S.btn, background: '#7B1FA2' }} onClick={() => { sim.current.objectY = 0 }}>重置</button>
        </div>
      </div>

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
            {activeTab === 1 ? (
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>#</th>
                    <th style={S.th}>液体</th>
                    <th style={S.th}>ρ液</th>
                    <th style={S.th}>V排(cm³)</th>
                    <th style={S.th}>F浮(N)</th>
                    <th style={S.th}>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((rec, i) => (
                    <tr key={rec.id}>
                      <td style={S.td}>{i + 1}</td>
                      <td style={S.td}>{rec.liquid}</td>
                      <td style={S.td}>{rec.rho液}</td>
                      <td style={S.td}>{rec.V排}</td>
                      <td style={{ ...S.td, color: '#2196F3', fontWeight: 600 }}>{rec.F浮}</td>
                      <td style={S.td}>{rec.submerged ? '浸没' : '部分'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
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
            )}
          </div>
        )}
      </div>

      <div style={S.statusBar}>
        <span style={{ color: statusColor, fontWeight: 600 }}>{statusText}</span>
        <span style={{ color: '#999', marginLeft: 'auto', fontSize: 11 }}>
          {activeTab === 1 ? '控制变量法 · F浮=ρ液gV排' : 'F浮=G排 · 称重法 · 排水法'}
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
  tabGroup: { display: 'flex', gap: 4 },
  tabBtn: {
    background: '#f0f0f0', color: '#555', border: '1px solid #ddd',
    borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer',
    fontWeight: 500,
  },
  tabBtnActive: {
    background: '#2196F3', color: '#fff', border: '1px solid #2196F3',
    borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 700,
  },
  actions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  modeGroup: { display: 'flex', gap: 4 },
  modeBtn: {
    background: '#f0f0f0', color: '#555', border: '1px solid #ddd',
    borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer',
  },
  modeBtnActive: {
    background: '#4A90D9', color: '#fff', border: '1px solid #4A90D9',
    borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontWeight: 600,
  },
  sep: { width: 1, height: 20, background: '#ddd' },
  label: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#555' },
  sliderVal: { color: '#E6A800', fontWeight: 600, minWidth: 45, fontSize: 12 },
  sliderVal2: { color: '#4A90D9', fontWeight: 600, minWidth: 35, fontSize: 12 },
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
