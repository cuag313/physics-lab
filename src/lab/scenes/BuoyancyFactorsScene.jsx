/**
 * BuoyancyFactorsScene — 探究浮力的大小与哪些因素有关
 *
 * 物理规则：
 *   F浮 = ρ液 × g × V排
 *   浮力大小只与两个因素有关：
 *     ① 液体密度 ρ液
 *     ② 排开液体体积 V排
 *   与物体密度、物体质量、浸入深度无关
 *
 * 实验方法：控制变量法
 *   实验1：保持 ρ液 不变，改变 V排 → 验证 F浮 ∝ V排
 *   实验2：保持 V排 不变，改变 ρ液 → 验证 F浮 ∝ ρ液
 *
 * 交互：
 *   - 拖拽物体改变浸入深度（改变 V排）
 *   - 滑块调节物体体积
 *   - 下拉切换液体类型
 *   - 📝记录保存实验数据
 */

import { useRef, useEffect, useState, useCallback } from 'react'

const G = 9.8

/* ═══════════════════════════════════════════════════════════
 *  液体选项（5种，覆盖常见密度范围）
 * ═══════════════════════════════════════════════════════════ */
const LIQUIDS = {
  alcohol:   { name: '酒精',   density: 800,  color: 'rgba(200,200,200,0.25)' },
  oil:       { name: '食用油', density: 920,  color: 'rgba(255,213,79,0.30)' },
  water:     { name: '水',     density: 1000, color: 'rgba(33,150,243,0.35)' },
  saltwater: { name: '盐水',   density: 1100, color: 'rgba(33,150,243,0.50)' },
  mercury:   { name: '水银',   density: 13600, color: 'rgba(192,192,192,0.65)' },
}

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

export default function BuoyancyFactorsScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const sim = useRef({
    objectY: 0,           // 0=空气中, 1=完全浸没
    objectVolume: 200,    // cm³
    objectDensity: 2700,  // kg/m³ (铝)
    liquidType: 'water',
    liquidDensity: 1000,
    beakerTop: 280, beakerH: 380,
    // 计算结果
    G: 0, F拉: 0, F浮: 0,
    V排: 0, submerged: false,
    animPhase: 0,
    // 实验模式
    mode: 'varyV',        // 'varyV' | 'varyRho'
  })

  const interRef = useRef({ mode: 'idle' })
  const [records, setRecords] = useState([])
  const [cursor, setCursor] = useState('grab')
  const [, forceUpdate] = useState(0)

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
    // 重力随物体体积和密度变化
    const rhoObj = s.objectDensity
    s.G = rhoObj * V物体 * G
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
    drawDataPanel(ctx, rect)
    drawFactorsKnowledge(ctx, rect)
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
    const liq = LIQUIDS[s.liquidType]
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
    // 物体大小随体积变化：50cm³→14px, 500cm³→32px
    const objSize = 14 + (s.objectVolume - 50) / (500 - 50) * 18

    // 物体颜色根据体积变化
    const volRatio = (s.objectVolume - 50) / (500 - 50)
    const r = Math.round(180 + volRatio * 40)
    const g = Math.round(120 - volRatio * 30)
    const b = Math.round(80 - volRatio * 40)

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

    // 体积标签
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${s.objectVolume}cm³`, sx, sy)
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
    const panelW = 240, panelH = 240
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

    ctx.fillStyle = '#333'
    ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText('📊 浮力因素分析', px + 14, py + 12)

    let y = py + 38
    const lh = 20

    // 控制变量标签
    ctx.fillStyle = '#E6A800'
    ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`实验模式：${s.mode === 'varyV' ? '改变V排' : '改变ρ液'}`, px + 14, y); y += lh + 4

    // 液体密度
    ctx.fillStyle = '#4A90D9'
    ctx.font = '11px sans-serif'
    ctx.fillText(`液体密度 ρ液 = ${s.liquidDensity} kg/m³`, px + 14, y); y += lh

    // 排开体积
    ctx.fillStyle = '#E6A800'
    ctx.fillText(`排开体积 V排 = ${s.V排.toFixed(1)} cm³`, px + 14, y); y += lh

    // 浮力
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

    // 因素分析
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
  }

  // ── 因素知识卡片（左下角） ──
  function drawFactorsKnowledge(ctx, rect) {
    const h = rect.height
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
    ctx.font = '10px sans-serif'

    // 实验1
    ctx.fillStyle = '#4A90D9'
    ctx.font = 'bold 10px sans-serif'
    ctx.fillText('实验1：保持ρ液不变', px + 12, y); y += 15
    ctx.fillStyle = '#333'
    ctx.font = '10px sans-serif'
    ctx.fillText('改变V排 → 测F浮 → 验证F浮∝V排', px + 12, y); y += 18

    // 实验2
    ctx.fillStyle = '#E6A800'
    ctx.font = 'bold 10px sans-serif'
    ctx.fillText('实验2：保持V排不变', px + 12, y); y += 15
    ctx.fillStyle = '#333'
    ctx.font = '10px sans-serif'
    ctx.fillText('改变ρ液 → 测F浮 → 验证F浮∝ρ液', px + 12, y); y += 18

    // 结论
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
  }

  function drawFormula(ctx, rect) {
    const h = rect.height
    const x = 16, y = h - 24
    ctx.fillStyle = '#4A90D9'
    ctx.font = 'bold 14px serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillText('F浮 = ρ液 × g × V排', x, y)
  }

  function drawInstructions(ctx, rect) {
    const h = rect.height
    const x = 16, y = h - 60
    ctx.fillStyle = '#888'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillText('拖拽物体改变浸入深度 · 调节体积和液体 · 观察浮力变化', x, y)
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
    // 检查鼠标是否在物体上
    const rect = canvasRef.current.getBoundingClientRect()
    const w = rect.width
    const sx = w * 0.5
    const sy = getObjectScreenY(rect)
    const objSize = 14 + (sim.current.objectVolume - 50) / (500 - 50) * 18
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    if (Math.abs(mx - sx) <= objSize + 10 && Math.abs(my - sy) <= objSize + 10) {
      interRef.current.mode = 'dragging'
      setCursor('grabbing')
    }
  }, [])

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
    setRecords(prev => [...prev, {
      id: Date.now(),
      liquid: LIQUIDS[s.liquidType].name,
      rho液: s.liquidDensity,
      V排: s.V排.toFixed(1),
      F浮: s.F浮.toFixed(3),
      submerged: s.submerged,
    }])
  }, [])

  // ============================================================
  //  渲染
  // ============================================================
  return (
    <div style={S.container}>
      <div style={S.toolbar}>
        <span style={S.title}>探究浮力的大小与哪些因素有关</span>
        <div style={S.actions}>
          <div style={S.modeGroup}>
            <button
              style={sim.current.mode === 'varyV' ? S.modeBtnActive : S.modeBtn}
              onClick={() => { sim.current.mode = 'varyV'; forceUpdate(n => n + 1) }}
            >改变V排</button>
            <button
              style={sim.current.mode === 'varyRho' ? S.modeBtnActive : S.modeBtn}
              onClick={() => { sim.current.mode = 'varyRho'; forceUpdate(n => n + 1) }}
            >改变ρ液</button>
          </div>
          <div style={S.sep} />
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
            体积：
            <input type="range" min="50" max="500" step="10"
              value={sim.current.objectVolume}
              onChange={(e) => { sim.current.objectVolume = parseInt(e.target.value) }}
              style={{ width: 80, accentColor: '#E6A800' }} />
            <span style={S.sliderVal}>{sim.current.objectVolume}cm³</span>
          </label>
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
          </div>
        )}
      </div>

      <div style={S.statusBar}>
        <span style={{ color: '#2196F3', fontWeight: 600 }}>
          F浮 = {sim.current.F浮.toFixed(3)}N = {sim.current.liquidDensity}×9.8×{(sim.current.V排 / 1e6).toFixed(6)}
        </span>
        <span style={{ color: '#999', marginLeft: 'auto', fontSize: 11 }}>
          控制变量法 · F浮=ρ液gV排
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
