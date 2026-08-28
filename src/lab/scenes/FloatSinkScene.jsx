/**
 * FloatSinkScene — 物体的浮沉条件
 *
 * 物理规则：
 *   F浮 = ρ液 × g × V排
 *   G物 = ρ物 × g × V物
 *
 *   浮沉条件（比较 ρ物 与 ρ液）：
 *     漂浮：ρ物 < ρ液，物体部分露出液面，F浮 = G物
 *     悬浮：ρ物 = ρ液，物体在液体中任意位置静止，F浮 = G物
 *     下沉：ρ物 > ρ液，物体沉到底部，F浮 < G物
 *
 *   动态过程：
 *     上浮：ρ物 < ρ液，F浮 > G物，物体向上运动直到漂浮
 *     下沉：ρ物 > ρ液，F浮 < G物，物体向下运动直到沉底
 *
 * 交互：
 *   - 滑块调节物体密度 ρ物
 *   - 滑块调节液体密度 ρ液
 *   - 点击「释放」观察物体运动
 *   - 预设按钮快速切换典型场景
 */

import { useRef, useEffect, useState, useCallback } from 'react'

const G = 9.8

/* ═══════════════════════════════════════════════════════════
 *  预设场景
 * ═══════════════════════════════════════════════════════════ */
const PRESETS = [
  { name: '木块→水', objRho: 600, liqRho: 1000, desc: 'ρ物<ρ液，漂浮' },
  { name: '鸡蛋→水', objRho: 1050, liqRho: 1000, desc: 'ρ物>ρ液，下沉' },
  { name: '鸡蛋→盐水', objRho: 1050, liqRho: 1100, desc: 'ρ物<ρ液，漂浮' },
  { name: '铁块→水', objRho: 7900, liqRho: 1000, desc: 'ρ物≫ρ液，沉底' },
  { name: '冰→水', objRho: 900, liqRho: 1000, desc: 'ρ物<ρ液，漂浮' },
  { name: '潜水艇', objRho: 1000, liqRho: 1000, desc: 'ρ物=ρ液，悬浮' },
]

/* ═══════════════════════════════════════════════════════════
 *  烧杯布局
 * ═══════════════════════════════════════════════════════════ */
const BEAKER = {
  topRatio: 0.22,
  widthRatio: 0.28,
  heightRatio: 0.52,
  liquidRatio: 0.70,
  wallThick: 4,
}

const ARROW_SCALE = 30
const OBJ_SIZE = 28

export default function FloatSinkScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const sim = useRef({
    objectDensity: 600,    // kg/m³
    liquidDensity: 1000,   // kg/m³
    // 动画状态
    objectPosY: 0.3,       // 0=液面顶部, 1=底部, 物体中心位置比例
    released: false,       // 是否已释放
    settled: false,        // 是否已稳定
    // 烧杯布局
    beakerTop: 200, beakerH: 400,
    liquidTop: 200, liquidBottom: 400,
    // 计算结果
    F浮: 0, G物: 0, Fnet: 0,
    state: 'idle',         // idle | floating | suspended | sinking | rising | bottom
    animPhase: 0,
    targetY: 0.3,          // 目标位置
    浸入比: 0              // 当前浸入比
  })

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
      updateBeakerLayout(rect)
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

    return () => {
      window.removeEventListener('resize', resize)
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [])

  function updateBeakerLayout(rect) {
    const w = rect.width, h = rect.height
    const bw = w * BEAKER.widthRatio
    const bh = h * BEAKER.heightRatio
    const bx = w * 0.50
    const by = h * BEAKER.topRatio
    const liquidH = bh * BEAKER.liquidRatio
    const liquidY = by + bh - liquidH

    const s = sim.current
    s.beakerTop = by
    s.beakerH = bh
    s.liquidTop = liquidY
    s.liquidBottom = by + bh
  }

  // ============================================================
  //  物理更新
  // ============================================================
  function updatePhysics(dt) {
    const s = sim.current
    s.animPhase += 0.03

    const rhoObj = s.objectDensity
    const rhoLiq = s.liquidDensity

    // 布局未初始化时跳过
    const liquidBottom = s.liquidBottom
    const liquidTop = s.liquidTop
    const liquidH = liquidBottom - liquidTop
    if (liquidH <= 0) return

    const V物 = (4 / 3) * Math.PI * Math.pow(OBJ_SIZE / 100, 3)  // 近似球体，m³

    // 物体半径（屏幕px）及其占液体高度的比例
    const objR = OBJ_SIZE
    const objSizeRatio = objR / liquidH     // 物体半径占液体高度的比例

    // 浸入比计算
    const objCenterY = liquidTop + (liquidBottom - liquidTop) * s.objectPosY
    const objTopY = objCenterY - objR
    const objBottomY = objCenterY + objR

    let 浸入比 = 0
    if (objBottomY <= liquidTop) {
      浸入比 = 0
    } else if (objTopY >= liquidTop) {
      浸入比 = 1.0
    } else {
      浸入比 = (objBottomY - liquidTop) / (objR * 2)
    }
    浸入比 = Math.max(0, Math.min(1, 浸入比))
    s.浸入比 = 浸入比  // 供面板显示

    // 浮力和重力
    const V排 = V物 * 浸入比
    s.F浮 = rhoLiq * G * V排
    s.G物 = rhoObj * G * V物
    s.Fnet = s.F浮 - s.G物  // 正值向上

    // 判断状态
    if (rhoObj < rhoLiq) {
      // 应该漂浮
      if (s.released && !s.settled) {
        s.state = 'rising'
      } else if (s.settled) {
        s.state = 'floating'
      } else {
        s.state = 'idle'
      }
    } else if (Math.abs(rhoObj - rhoLiq) < 10) {
      // 近似悬浮
      s.state = s.released ? 'suspended' : 'idle'
    } else {
      // 应该下沉
      if (s.released && !s.settled) {
        s.state = 'sinking'
      } else if (s.settled) {
        s.state = 'bottom'
      } else {
        s.state = 'idle'
      }
    }

    // 每帧校验：如果已平衡但力偏离，切回运动状态
    if (s.released && s.settled) {
      const EPSILON_CHECK = 0.001
      if (Math.abs(s.F浮 - s.G物) > EPSILON_CHECK * 3) {
        s.settled = false
      }
    }

    // 动画 — lerp 插值
    if (s.released && !s.settled) {
      // 计算目标位置
      if (rhoObj < rhoLiq) {
        // 漂浮平衡：浸入比 = ρ物/ρ液
        s.targetY = objSizeRatio * (2 * rhoObj / rhoLiq - 1)
      } else if (Math.abs(rhoObj - rhoLiq) < 10) {
        s.targetY = s.objectPosY
      } else {
        // 沉底
        s.targetY = 1 - objSizeRatio
      }

      // lerp 逼近目标
      s.objectPosY += (s.targetY - s.objectPosY) * 0.08

      // 边界限制
      s.objectPosY = Math.max(-objSizeRatio, Math.min(1 - objSizeRatio, s.objectPosY))

      // lerp 后重新计算浸入比和力（用新位置）
      const newObjCenterY = liquidTop + liquidH * s.objectPosY
      const newObjTopY = newObjCenterY - objR
      const newObjBottomY = newObjCenterY + objR
      let new浸入比 = 0
      if (newObjBottomY <= liquidTop) {
        new浸入比 = 0
      } else if (newObjTopY >= liquidTop) {
        new浸入比 = 1.0
      } else {
        new浸入比 = (newObjBottomY - liquidTop) / (objR * 2)
      }
      new浸入比 = Math.max(0, Math.min(1, new浸入比))
      s.浸入比 = new浸入比
      s.F浮 = rhoLiq * G * V物 * new浸入比

      // 收敛：力平衡即停止
      if (Math.abs(s.F浮 - s.G物) < 0.001) {
        s.objectPosY = s.targetY
        s.settled = true
      }
    }

    forceUpdate(n => n + 1)
  }

  // ============================================================
  //  绘制
  // ============================================================
  function drawFrame(ctx, rect) {
    const w = rect.width, h = rect.height
    ctx.clearRect(0, 0, w, h)
    try {
      drawBackground(ctx, rect)
      drawBeaker(ctx, rect)
      drawObject(ctx, rect)
      drawForceArrows(ctx, rect)
      drawStatePanel(ctx, rect)
      drawDensityComparison(ctx, rect)
      drawConditionsTable(ctx, rect)
      drawForcePanel(ctx, rect)
      drawFormula(ctx, rect)
      drawInstructions(ctx, rect)
    } catch (e) {
      // 出错时至少画背景+烧杯，防止白屏
      console.error('drawFrame error:', e)
      try { drawBackground(ctx, rect) } catch (_) {}
      try { drawBeaker(ctx, rect) } catch (_) {}
    }
  }

  function drawBackground(ctx, rect) {
    const w = rect.width, h = rect.height
    const tableY = h * 0.82
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
    const w = rect.width, h = rect.height
    const s = sim.current
    const bw = w * BEAKER.widthRatio
    const bh = h * BEAKER.heightRatio
    const bx = w * 0.50
    const by = h * BEAKER.topRatio

    const liquidH = bh * BEAKER.liquidRatio
    const liquidY = by + bh - liquidH

    // 根据密度选择液体颜色
    const rho = s.liquidDensity
    let liqColor
    if (rho <= 900) liqColor = 'rgba(200,200,200,0.25)'
    else if (rho <= 1050) liqColor = 'rgba(33,150,243,0.35)'
    else if (rho <= 1200) liqColor = 'rgba(33,150,243,0.50)'
    else liqColor = 'rgba(192,192,192,0.65)'

    // 烧杯主体
    ctx.fillStyle = 'rgba(200,200,255,0.06)'
    ctx.beginPath()
    ctx.moveTo(bx - bw / 2, by)
    ctx.lineTo(bx - bw / 2 + 12, by + bh)
    ctx.lineTo(bx + bw / 2 - 12, by + bh)
    ctx.lineTo(bx + bw / 2, by)
    ctx.closePath()
    ctx.fill()

    // 烧杯壁
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'
    ctx.lineWidth = BEAKER.wallThick
    ctx.beginPath()
    ctx.moveTo(bx - bw / 2, by)
    ctx.lineTo(bx - bw / 2 + 12, by + bh)
    ctx.lineTo(bx + bw / 2 - 12, by + bh)
    ctx.lineTo(bx + bw / 2, by)
    ctx.closePath()
    ctx.stroke()

    // 液体
    ctx.fillStyle = liqColor
    ctx.beginPath()
    ctx.moveTo(bx - bw / 2 + 7, liquidY)
    ctx.lineTo(bx - bw / 2 + 12, by + bh)
    ctx.lineTo(bx + bw / 2 - 12, by + bh)
    ctx.lineTo(bx + bw / 2 - 7, liquidY)
    ctx.closePath()
    ctx.fill()

    // 液面波纹
    ctx.strokeStyle = 'rgba(33,150,243,0.5)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let x = bx - bw / 2 + 7; x <= bx + bw / 2 - 7; x += 2) {
      const t = (x - (bx - bw / 2)) / bw
      const y = liquidY + Math.sin(t * Math.PI * 8 + s.animPhase) * 1.5
      if (x === bx - bw / 2 + 7) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()

    // 液体密度标签
    ctx.fillStyle = 'rgba(33,150,243,0.7)'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`ρ液=${s.liquidDensity}kg/m³`, bx, liquidY + 25)

    // 底部标记
    ctx.fillStyle = '#999'
    ctx.font = '10px sans-serif'
    ctx.fillText('底部', bx, by + bh + 14)
  }

  function drawObject(ctx, rect) {
    const w = rect.width
    const s = sim.current
    const bx = w * 0.50
    const beakerH = s.beakerH
    const liquidTop = s.liquidTop
    const liquidBottom = s.liquidBottom

    // 物体中心Y
    const objCenterY = liquidTop + (liquidBottom - liquidTop) * s.objectPosY
    const objR = OBJ_SIZE

    // 物体颜色根据密度
    const rho = s.objectDensity
    let objColor, objColorLight, objColorDark
    if (rho < 700) { objColor = '#8B6914'; objColorLight = '#B8912E'; objColorDark = '#5C4410' }
    else if (rho < 1000) { objColor = '#A0522D'; objColorLight = '#C0724D'; objColorDark = '#70321D' }
    else if (rho < 1200) { objColor = '#DAA520'; objColorLight = '#F0C040'; objColorDark = '#B08510' }
    else if (rho < 5000) { objColor = '#708090'; objColorLight = '#90A0B0'; objColorDark = '#506070' }
    else { objColor = '#A9A9A9'; objColorLight = '#C9C9C9'; objColorDark = '#898989' }

    // 物体主体（圆形 + 简单渐变）
    ctx.beginPath()
    ctx.arc(bx, objCenterY, objR, 0, Math.PI * 2)
    const grad = ctx.createLinearGradient(bx - objR, objCenterY - objR, bx + objR, objCenterY + objR)
    grad.addColorStop(0, objColorLight)
    grad.addColorStop(0.5, objColor)
    grad.addColorStop(1, objColorDark)
    ctx.fillStyle = grad
    ctx.fill()

    // 浸入部分蓝色覆盖
    if (objCenterY + objR > liquidTop) {
      const overlapTop = Math.max(liquidTop, objCenterY - objR)
      const overlapBottom = Math.min(liquidBottom, objCenterY + objR)
      ctx.save()
      ctx.beginPath()
      ctx.arc(bx, objCenterY, objR, 0, Math.PI * 2)
      ctx.clip()
      ctx.fillStyle = 'rgba(33,150,243,0.20)'
      ctx.fillRect(bx - objR, overlapTop, objR * 2, overlapBottom - overlapTop)
      ctx.restore()
    }

    // 边框
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(bx, objCenterY, objR, 0, Math.PI * 2)
    ctx.stroke()

    // 密度标签
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${rho}`, bx, objCenterY - 4)
    ctx.font = '9px sans-serif'
    ctx.fillText('kg/m³', bx, objCenterY + 10)
  }

  function drawForceArrows(ctx, rect) {
    const w = rect.width
    const s = sim.current
    const bx = w * 0.50
    const liquidTop = s.liquidTop
    const liquidBottom = s.liquidBottom
    const objCenterY = liquidTop + (liquidBottom - liquidTop) * s.objectPosY
    const objR = OBJ_SIZE

    if (!s.released && s.state === 'idle') return

    // 浮力（蓝色向上）
    if (s.F浮 > 0.001) {
      const bLen = Math.max(10, s.F浮 * ARROW_SCALE * 1000)
      drawArrow(ctx, bx - objR - 15, objCenterY, bx - objR - 15, objCenterY - bLen, '#2196F3', 3, `F浮=${(s.F浮 * 1000).toFixed(1)}mN`)
    }

    // 重力（红色向下）
    const gLen = Math.max(10, s.G物 * ARROW_SCALE * 1000)
    drawArrow(ctx, bx + objR + 15, objCenterY, bx + objR + 15, objCenterY + gLen, '#FF6B6B', 3, `G=${(s.G物 * 1000).toFixed(1)}mN`)

    // 净力（绿色）
    if (Math.abs(s.Fnet) > 0.0001 && s.released && !s.settled) {
      const netLen = Math.max(5, Math.abs(s.Fnet) * ARROW_SCALE * 1000)
      const netDir = s.Fnet > 0 ? -1 : 1  // 正值向上
      drawArrow(ctx, bx, objCenterY, bx, objCenterY + netLen * netDir, '#4CAF50', 2.5,
        s.Fnet > 0 ? '↑上浮' : '↓下沉')
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
      ctx.fillText(label, Math.max(x1, x2) + 8, (y1 + y2) / 2)
    }
  }

  // ── 状态面板（右上角） ──
  function drawStatePanel(ctx, rect) {
    const w = rect.width
    const s = sim.current
    const panelW = 230, panelH = 200
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
    ctx.fillText('📊 浮沉状态分析', px + 14, py + 12)

    let y = py + 38
    const lh = 20

    // 当前状态
    const stateMap = {
      idle: { text: '等待释放', color: '#999' },
      floating: { text: '🌊 漂浮', color: '#4CAF50' },
      suspended: { text: '🔵 悬浮', color: '#2196F3' },
      sinking: { text: '⬇️ 下沉', color: '#FF6B6B' },
      rising: { text: '⬆️ 上浮', color: '#4CAF50' },
      bottom: { text: '⬇️ 沉底', color: '#f44336' },
    }
    const st = stateMap[s.state] || stateMap.idle
    ctx.fillStyle = st.color
    ctx.font = 'bold 14px sans-serif'
    ctx.fillText(st.text, px + 14, y); y += lh + 6

    // 密度比较
    ctx.fillStyle = '#333'
    ctx.font = '11px sans-serif'
    ctx.fillText(`物体密度 ρ物 = ${s.objectDensity} kg/m³`, px + 14, y); y += lh
    ctx.fillText(`液体密度 ρ液 = ${s.liquidDensity} kg/m³`, px + 14, y); y += lh + 4

    // 关系判断
    const rhoObj = s.objectDensity
    const rhoLiq = s.liquidDensity
    let relation, relationColor
    if (Math.abs(rhoObj - rhoLiq) < 10) {
      relation = 'ρ物 ≈ ρ液 → 悬浮'
      relationColor = '#2196F3'
    } else if (rhoObj < rhoLiq) {
      relation = 'ρ物 < ρ液 → 漂浮'
      relationColor = '#4CAF50'
    } else {
      relation = 'ρ物 > ρ液 → 下沉'
      relationColor = '#FF6B6B'
    }
    ctx.fillStyle = relationColor
    ctx.font = 'bold 12px sans-serif'
    ctx.fillText(relation, px + 14, y); y += lh + 4

    // 分隔线
    ctx.strokeStyle = '#eee'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(px + 14, y)
    ctx.lineTo(px + panelW - 14, y)
    ctx.stroke()
    y += 8

    // 力比较
    ctx.fillStyle = '#333'
    ctx.font = '11px sans-serif'
    ctx.fillText(`F浮 = ${(s.F浮 * 1000).toFixed(2)} mN`, px + 14, y); y += lh
    ctx.fillText(`G物 = ${(s.G物 * 1000).toFixed(2)} mN`, px + 14, y); y += lh

    let forceRelation, forceColor
    if (Math.abs(s.F浮 - s.G物) < 0.0001) {
      forceRelation = 'F浮 = G物 → 平衡'
      forceColor = '#4CAF50'
    } else if (s.F浮 > s.G物) {
      forceRelation = 'F浮 > G物 → 合力向上'
      forceColor = '#2196F3'
    } else {
      forceRelation = 'F浮 < G物 → 合力向下'
      forceColor = '#FF6B6B'
    }
    ctx.fillStyle = forceColor
    ctx.font = 'bold 11px sans-serif'
    ctx.fillText(forceRelation, px + 14, y)
  }

  // ── 密度对比条（左上角） ──
  function drawDensityComparison(ctx, rect) {
    const h = rect.height
    const panelW = 200, panelH = 120
    const px = 16, py = 16

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
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText('📏 密度对比', px + 12, py + 10)

    // 对比条
    const barX = px + 12
    const barY = py + 35
    const barW = panelW - 24
    const barH = 20
    const maxRho = Math.max(s.objectDensity, s.liquidDensity, 1200) * 1.2

    // 背景条
    ctx.fillStyle = '#f0f0f0'
    roundedRect(ctx, barX, barY, barW, barH, 4)
    ctx.fill()

    // 物体密度条
    const objW = (s.objectDensity / maxRho) * barW
    ctx.fillStyle = s.objectDensity < s.liquidDensity ? '#4CAF50' : '#FF6B6B'
    roundedRect(ctx, barX, barY, objW, barH, 4)
    ctx.fill()

    // 液体密度线
    const liqX = barX + (s.liquidDensity / maxRho) * barW
    ctx.strokeStyle = '#2196F3'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(liqX, barY - 3)
    ctx.lineTo(liqX, barY + barH + 3)
    ctx.stroke()

    // 标签
    ctx.font = '10px sans-serif'
    ctx.fillStyle = '#333'
    ctx.textAlign = 'left'
    ctx.fillText(`ρ物=${s.objectDensity}`, barX, barY + barH + 10)
    ctx.textAlign = 'right'
    ctx.fillStyle = '#2196F3'
    ctx.fillText(`ρ液=${s.liquidDensity}`, barX + barW, barY + barH + 10)

    // 结论
    ctx.textAlign = 'left'
    ctx.font = 'bold 10px sans-serif'
    if (s.objectDensity < s.liquidDensity) {
      ctx.fillStyle = '#4CAF50'
      ctx.fillText('ρ物 < ρ液 → 物体上浮/漂浮', barX, barY + barH + 28)
    } else if (Math.abs(s.objectDensity - s.liquidDensity) < 10) {
      ctx.fillStyle = '#2196F3'
      ctx.fillText('ρ物 ≈ ρ液 → 物体悬浮', barX, barY + barH + 28)
    } else {
      ctx.fillStyle = '#FF6B6B'
      ctx.fillText('ρ物 > ρ液 → 物体下沉', barX, barY + barH + 28)
    }
  }

  // ── 浮沉条件表格（左下角） ──
  function drawConditionsTable(ctx, rect) {
    const h = rect.height
    const panelW = 250, panelH = 200
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
    ctx.fillText('📖 浮沉条件总结', px + 12, py + 10)

    let y = py + 32
    const rowH = 17

    // 表头
    ctx.fillStyle = '#555'
    ctx.font = 'bold 10px sans-serif'
    ctx.fillText('状态', px + 12, y)
    ctx.fillText('密度关系', px + 65, y)
    ctx.fillText('力关系', px + 150, y)
    y += rowH + 2

    ctx.strokeStyle = '#eee'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(px + 12, y - 2)
    ctx.lineTo(px + panelW - 12, y - 2)
    ctx.stroke()

    ctx.font = '10px sans-serif'
    const rows = [
      { label: '漂浮', rho: 'ρ物<ρ液', force: 'F浮=G物', color: '#4CAF50' },
      { label: '悬浮', rho: 'ρ物=ρ液', force: 'F浮=G物', color: '#2196F3' },
      { label: '上浮', rho: 'ρ物<ρ液', force: 'F浮>G物', color: '#66BB6A' },
      { label: '下沉', rho: 'ρ物>ρ液', force: 'F浮<G物', color: '#FF6B6B' },
      { label: '沉底', rho: 'ρ物>ρ液', force: 'F浮<G物', color: '#f44336' },
    ]
    for (const row of rows) {
      ctx.fillStyle = row.color
      ctx.font = 'bold 10px sans-serif'
      ctx.fillText(row.label, px + 12, y)
      ctx.font = '10px sans-serif'
      ctx.fillStyle = '#333'
      ctx.fillText(row.rho, px + 65, y)
      ctx.fillText(row.force, px + 150, y)
      y += rowH
    }

    // 核心结论
    y += 4
    ctx.strokeStyle = '#2196F3'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(px + 12, y)
    ctx.lineTo(px + panelW - 12, y)
    ctx.stroke()
    y += 6

    ctx.fillStyle = '#2196F3'
    ctx.font = 'bold 10px sans-serif'
    ctx.fillText('关键：比较 ρ物 与 ρ液', px + 12, y); y += 15
    ctx.fillStyle = '#888'
    ctx.font = '10px sans-serif'
    ctx.fillText('漂浮和悬浮都是平衡态', px + 12, y); y += 14
    ctx.fillText('上浮和下沉是过渡态', px + 12, y)
  }

  // ── 实时力与平衡分析面板（右下角） ──
  // 每帧重绘，数据实时滚动更新
  function drawForcePanel(ctx, rect) {
    const w = rect.width, h = rect.height
    const s = sim.current
    const panelW = 230, panelH = 240
    const px = w - panelW - 16
    const py = h - panelH - 12

    // 面板背景
    ctx.fillStyle = 'rgba(255,255,255,0.96)'
    ctx.shadowColor = 'rgba(0,0,0,0.10)'
    ctx.shadowBlur = 8
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
    ctx.fillText('⚖️ 力与平衡分析', px + 14, py + 12)

    const barX = px + 14
    const barW = panelW - 28
    const barH = 10
    let y = py + 38

    // ── 理论最大浮力（完全浸没时） ──
    const F浮max = s.G物 / Math.max(s.浸入比, 0.001) * 1  // 粗略估计
    // 更准确：F浮max = ρ液 * g * V物，但G物 = ρ物 * g * V物，所以 F浮max = G物 * ρ液/ρ物
    const rhoRatio = s.liquidDensity / Math.max(s.objectDensity, 1)
    const F浮maxmN = s.G物 * 1000 * rhoRatio

    // ── 行1：F浮（蓝色进度条，实时缩放） ──
    ctx.fillStyle = '#2196F3'
    ctx.font = 'bold 12px sans-serif'
    ctx.fillText(`F浮 = ${(s.F浮 * 1000).toFixed(2)} mN`, barX, y)
    y += 18
    // 进度条背景
    ctx.fillStyle = '#e8e8e8'
    roundedRect(ctx, barX, y, barW, barH, 3)
    ctx.fill()
    // 进度条填充：F浮 / 理论最大浮力
    const fRatio = Math.min(1, (s.F浮 * 1000) / Math.max(F浮maxmN, 0.001))
    const fBarW = Math.max(2, fRatio * barW)
    ctx.fillStyle = '#2196F3'
    roundedRect(ctx, barX, y, fBarW, barH, 3)
    ctx.fill()
    y += barH + 10

    // ── 行2：G物（红色进度条，长度固定） ──
    ctx.fillStyle = '#FF6B6B'
    ctx.font = 'bold 12px sans-serif'
    ctx.fillText(`G物 = ${(s.G物 * 1000).toFixed(2)} mN`, barX, y)
    y += 18
    // 进度条背景
    ctx.fillStyle = '#e8e8e8'
    roundedRect(ctx, barX, y, barW, barH, 3)
    ctx.fill()
    // 进度条填充：G物 / 理论最大浮力（固定比例）
    const gRatio = Math.min(1, (s.G物 * 1000) / Math.max(F浮maxmN, 0.001))
    const gBarW = Math.max(2, gRatio * barW)
    ctx.fillStyle = '#FF6B6B'
    roundedRect(ctx, barX, y, gBarW, barH, 3)
    ctx.fill()
    y += barH + 10

    // ── 行3：ΔF ──
    const deltaF = (s.F浮 - s.G物) * 1000
    const deltaColor = Math.abs(deltaF) < 0.001 ? '#4CAF50' : deltaF > 0 ? '#2196F3' : '#FF6B6B'
    ctx.fillStyle = deltaColor
    ctx.font = 'bold 12px sans-serif'
    ctx.fillText(`ΔF = F浮−G物 = ${deltaF >= 0 ? '+' : ''}${deltaF.toFixed(2)} mN`, barX, y)
    y += 18

    // ── 行4：浸入比 ──
    ctx.fillStyle = '#666'
    ctx.font = '12px sans-serif'
    ctx.fillText(`浸入比 = ${(s.浸入比 * 100).toFixed(0)}%`, barX, y)
    y += 22

    // ── 分隔线 ──
    ctx.strokeStyle = '#e0e0e0'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(barX, y)
    ctx.lineTo(barX + barW, y)
    ctx.stroke()
    y += 10

    // ── 底部状态文字（每帧实时判断） ──
    const EPSILON = 0.001  // N
    const objSizeRatio_local = OBJ_SIZE / Math.max(s.liquidBottom - s.liquidTop, 1)
    const touchingBottom = s.objectPosY >= 1 - objSizeRatio_local * 1.2

    let statusText, statusColor
    if (!s.released) {
      statusText = '等待释放'
      statusColor = '#999'
    } else if (touchingBottom && s.F浮 < s.G物 - EPSILON) {
      // 沉底：G物 > F浮，底部提供支持力
      const supportF = ((s.G物 - s.F浮) * 1000).toFixed(2)
      statusText = `🔻 沉底，G物＞F浮，支持力=${supportF} mN`
      statusColor = '#f44336'
    } else if (Math.abs(s.F浮 - s.G物) < EPSILON) {
      // 力平衡：F浮 = G物
      if (s.浸入比 >= 0.98) {
        statusText = '✅ F浮 = G物 → 悬浮平衡，合力为0'
        statusColor = '#2196F3'
      } else {
        statusText = '✅ F浮 = G物 → 漂浮平衡，合力为0'
        statusColor = '#4CAF50'
      }
    } else if (s.F浮 > s.G物) {
      statusText = `↑ F浮＞G物 → 上浮中 ΔF=+${deltaF.toFixed(2)} mN`
      statusColor = '#2196F3'
    } else {
      statusText = `↓ F浮＜G物 → 下沉中 ΔF=${deltaF.toFixed(2)} mN`
      statusColor = '#FF6B6B'
    }

    ctx.fillStyle = statusColor
    ctx.font = 'bold 11px sans-serif'
    ctx.fillText(statusText, barX, y)
  }

  function drawFormula(ctx, rect) {
    const h = rect.height
    const x = 16, y = h - 28
    ctx.fillStyle = '#4A90D9'
    ctx.font = 'bold 14px serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillText('浮沉条件：比较 ρ物 与 ρ液', x, y)
  }

  function drawInstructions(ctx, rect) {
    const h = rect.height
    const x = 16, y = h - 60
    ctx.fillStyle = '#888'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillText('调节密度 → 点击释放 · 观察浮沉状态 · 对比力和密度关系', x, y)
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
  const handleRelease = useCallback(() => {
    const s = sim.current
    s.released = true
    s.settled = false
    // 根据密度决定起始位置（确保在液体内）
    const testLiquidH = s.liquidBottom - s.liquidTop
    const testObjRatio = OBJ_SIZE / testLiquidH
    if (s.objectDensity < s.liquidDensity) {
      // 上浮：从液面下方开始
      s.objectPosY = 0.5
    } else if (Math.abs(s.objectDensity - s.liquidDensity) < 10) {
      // 悬浮：从中间开始
      s.objectPosY = 0.5
    } else {
      // 下沉：从液面附近开始（确保在液面以下）
      s.objectPosY = testObjRatio + 0.1
    }
  }, [])

  const handleReset = useCallback(() => {
    const s = sim.current
    s.objectPosY = 0.3
    s.released = false
    s.settled = false
    s.state = 'idle'
    s.targetY = 0.3
  }, [])

  const applyPreset = useCallback((preset) => {
    const s = sim.current
    s.objectDensity = preset.objRho
    s.liquidDensity = preset.liqRho
    s.objectPosY = 0.3
    s.released = false
    s.settled = false
    s.state = 'idle'
    s.targetY = 0.3
  }, [])

  // ============================================================
  //  渲染
  // ============================================================
  const s = sim.current

  return (
    <div style={S.container}>
      <div style={S.toolbar}>
        <span style={S.title}>物体的浮沉条件</span>
        <div style={S.actions}>
          <label style={S.label}>
            ρ物：
            <input type="range" min="200" max="8000" step="50"
              value={s.objectDensity}
              onChange={(e) => {
                sim.current.objectDensity = parseInt(e.target.value)
                handleReset()
              }}
              style={{ width: 80, accentColor: '#FF6B6B' }} />
            <span style={{ ...S.sliderVal, color: '#FF6B6B' }}>{s.objectDensity}</span>
          </label>
          <label style={S.label}>
            ρ液：
            <input type="range" min="600" max="14000" step="50"
              value={s.liquidDensity}
              onChange={(e) => {
                sim.current.liquidDensity = parseInt(e.target.value)
                handleReset()
              }}
              style={{ width: 80, accentColor: '#2196F3' }} />
            <span style={{ ...S.sliderVal, color: '#2196F3' }}>{s.liquidDensity}</span>
          </label>
          <button style={{ ...S.btn, background: '#4CAF50' }} onClick={handleRelease}>▶ 释放</button>
          <button style={{ ...S.btn, background: '#7B1FA2' }} onClick={handleReset}>↺ 重置</button>
        </div>
      </div>

      {/* 预设按钮栏 */}
      <div style={S.presetBar}>
        {PRESETS.map((p, i) => (
          <button key={i} style={S.presetBtn} onClick={() => applyPreset(p)}
            title={p.desc}>
            {p.name}
          </button>
        ))}
      </div>

      <div style={S.main}>
        <canvas ref={canvasRef}
          style={{ ...S.canvas, cursor: 'default' }}
        />
      </div>

      <div style={S.statusBar}>
        <span style={{
          color: s.state === 'floating' || s.state === 'rising' ? '#4CAF50' :
            s.state === 'suspended' ? '#2196F3' :
              s.state === 'sinking' || s.state === 'bottom' ? '#FF6B6B' : '#999',
          fontWeight: 600
        }}>
          {s.state === 'idle' ? '点击「释放」观察浮沉' :
            s.state === 'floating' ? '漂浮：ρ物<ρ液，F浮=G物' :
              s.state === 'suspended' ? '悬浮：ρ物=ρ液，F浮=G物' :
                s.state === 'rising' ? '上浮：ρ物<ρ液，F浮>G物' :
                  s.state === 'sinking' ? '下沉：ρ物>ρ液，F浮<G物' :
                    s.state === 'bottom' ? '沉底：ρ物>ρ液，F浮<G物' : ''}
        </span>
        <span style={{ color: '#999', marginLeft: 'auto', fontSize: 11 }}>
          浮沉条件 · 密度比较法
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
  label: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#555' },
  sliderVal: { fontWeight: 600, minWidth: 40, fontSize: 12 },
  btn: {
    color: '#fff', border: 'none',
    borderRadius: 4, padding: '5px 14px', fontSize: 12, cursor: 'pointer',
  },
  presetBar: {
    minHeight: 34, background: '#fafafa', borderBottom: '1px solid #e0e0e0',
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '0 12px', flexShrink: 0, flexWrap: 'wrap',
  },
  presetBtn: {
    background: '#fff', color: '#555', border: '1px solid #ddd',
    borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
  },
  main: { flex: 1, display: 'flex', overflow: 'hidden', background: '#fff' },
  canvas: { flex: 1, width: '100%' },
  statusBar: {
    minHeight: 28, background: '#f5f5f5', borderTop: '1px solid #ccc',
    display: 'flex', alignItems: 'center', gap: 20,
    padding: '4px 14px', fontSize: 12, color: '#555', flexShrink: 0, flexWrap: 'wrap',
  },
}
