import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * SpringForceScene — 质量与弹簧：基础（双弹簧版）
 *
 * 【双弹簧动力学】两根独立弹簧并排，各自独立振子动力学
 * 【砝码拖拽交互】画布底部货架，拖拽挂载/取下
 * 【参考线拖拽】红色参考线全宽度可拖拽（两弹簧共用）
 *
 * 保留：F=kΔx、F-x采集点、阻尼振动、三栏布局
 */

const MASS_PRESETS = [
  { label: '250 g', value: 0.250, bw: 54, bh: 60 },   // 大
  { label: '100 g', value: 0.100, bw: 44, bh: 50 },   // 中
  { label: '50 g', value: 0.050, bw: 36, bh: 42 },     // 小
]

// 弹簧初始状态
function createSpring(id, kDefault, xPos) {
  return {
    id, k: kDefault, restLength: 0.20, anchorY: 0.5, xPos,
    massValue: 0, pos: 0.20, vel: 0, g: 9.8,
  }
}

export default function SpringForceScene() {
  const canvasRef = useRef(null)
  const rafRef = useRef(null)
  const lastTimeRef = useRef(0)
  const pausedRef = useRef(false)

  // 【双弹簧动力学】两根独立弹簧
  const sim = useRef({
    springs: [
      createSpring(1, 25, -0.18),  // 左弹簧
      createSpring(2, 40, 0.18),   // 右弹簧
    ],
    damping: 0.5,
    showNatural: true, showEquilibrium: true, showMovable: false,
    movableY: 0.45,
    paused: false, speedMul: 1,
    stopwatchRunning: false, stopwatchTime: 0,
    dataPoints: [],  // {springId, x, y}
    scale: 500, offsetX: 0, offsetY: 0, screenW: 0, screenH: 0,
    dragMode: null, dragSpringId: -1, dragMassValue: 0,
    selectedSpring: 1,
    shelfX: 0, shelfY: 0,
    hovered: null,
    // 【可拖拽刻度尺对象】
    rulerX: 0, rulerY: 0,
    defaultRulerX: 0, defaultRulerY: 0,
    rulerDragOX: 0, rulerDragOY: 0,
  })

  const [k1, setK1] = useState(25)
  const [k2, setK2] = useState(40)
  const [damping, setDamping] = useState(0.5)
  const [showNatural, setShowNatural] = useState(true)
  const [showEquilibrium, setShowEquilibrium] = useState(true)
  const [showMovable, setShowMovable] = useState(false)
  const [paused, setPaused] = useState(false)
  const [slowMode, setSlowMode] = useState(false)
  const [selectedSpring, setSelectedSpring] = useState(1)
  const [eqStates, setEqStates] = useState([false, false])
  const [, forceUpdate] = useState(0)
  const triggerRender = useCallback(() => forceUpdate(n => n + 1), [])
  useEffect(() => { pausedRef.current = paused }, [paused])

  // ============ 坐标 ============
  function w2s(wx, wy) {
    const s = sim.current
    return [s.offsetX + wx * s.scale, s.offsetY + (wy - 0.5) * s.scale]
  }
  function s2w(sx, sy) {
    const s = sim.current
    return [(sx - s.offsetX) / s.scale, (sy - s.offsetY) / s.scale + 0.5]
  }

  // ============ Canvas 初始化 ============
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
      const s = sim.current
      s.screenW = r.width; s.screenH = r.height
      s.offsetX = r.width / 2
      s.offsetY = 50
      s.scale = Math.min(r.height - 100, 650) / 1.3
      s.shelfX = r.width / 2 - 70
      s.shelfY = r.height - 80
      // 【可拖拽刻度尺对象】初始位置
      if (!s.rulerX && !s.rulerY) {
        s.rulerX = s.offsetX + 180
        s.rulerY = s.offsetY
        s.defaultRulerX = s.rulerX
        s.defaultRulerY = s.rulerY
      }
    }
    resize()
    window.addEventListener('resize', resize)

    function loop(ts) {
      if (!lastTimeRef.current) lastTimeRef.current = ts
      const rawDt = Math.min((ts - lastTimeRef.current) / 1000, 0.05)
      lastTimeRef.current = ts
      if (!pausedRef.current) {
        const dt = rawDt * sim.current.speedMul
        const steps = Math.max(1, Math.ceil(dt / 0.002))
        const subDt = dt / steps
        for (let i = 0; i < steps; i++) {
          stepSpring(sim.current.springs[0], subDt)
          stepSpring(sim.current.springs[1], subDt)
        }
        checkEquilibrium()
      }
      if (sim.current.stopwatchRunning && !pausedRef.current) {
        sim.current.stopwatchTime += rawDt * sim.current.speedMul
      }
      drawFrame(ctx)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      window.removeEventListener('resize', resize)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // ============ 【双弹簧动力学】独立振子物理 ============
  function stepSpring(sp, dt) {
    if (sp.massValue <= 0) return
    const ext = sp.pos - sp.restLength
    const Fnet = sp.massValue * sp.g - sp.k * ext - sim.current.damping * sp.vel
    sp.vel += (Fnet / sp.massValue) * dt
    sp.pos += sp.vel * dt
    if (sp.pos < sp.restLength * 0.3) { sp.pos = sp.restLength * 0.3; sp.vel = Math.abs(sp.vel) * 0.3 }
    triggerRender()
  }

  function getEqLen(sp) {
    return sp.restLength + (sp.massValue * sp.g) / sp.k
  }

  // 【采集数据状态判断】
  function checkEquilibrium() {
    const s = sim.current
    const states = s.springs.map(sp => {
      if (sp.massValue <= 0) return false
      const eq = getEqLen(sp)
      return Math.abs(sp.pos - eq) < 0.002 && Math.abs(sp.vel) < 0.005
    })
    setEqStates(states)
  }

  // ============ 画布绘制 ============
  function drawFrame(ctx) {
    const s = sim.current
    const w = s.screenW, h = s.screenH
    if (!w || !h) return
    ctx.clearRect(0, 0, w, h)
    // 浅米黄色背景
    ctx.fillStyle = '#F5F0E8'
    ctx.fillRect(0, 0, w, h)

    // 绘制两根弹簧
    s.springs.forEach(sp => drawOneSpring(ctx, sp))

    // 参考虚线（两弹簧共用原长/平衡各自计算，红线共用）
    drawRefLines(ctx)

    drawMassShelf(ctx)
    // 【可拖拽刻度尺对象】尺子绘制在最上层
    drawRuler(ctx)
  }

  function drawOneSpring(ctx, sp) {
    const [ax, ay] = w2s(sp.xPos, sp.anchorY + 0.02)
    const [, by] = w2s(sp.xPos, sp.anchorY + sp.pos)

    // 挂点
    ctx.fillStyle = '#37474F'
    ctx.beginPath(); ctx.arc(ax, ay - 6, 5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#78909C'
    ctx.beginPath(); ctx.arc(ax, ay - 6, 2.5, 0, Math.PI * 2); ctx.fill()

    // 弹簧螺旋线圈
    const springLen = by - ay
    if (springLen > 5) {
      const coils = 12
      const baseAmp = 14
      const stretch = sp.pos / sp.restLength
      const amp = baseAmp / Math.max(stretch, 0.4)

      const ext = (sp.pos - sp.restLength) / sp.restLength
      let color = '#78909C'
      if (ext > 0.05) color = '#4CAF50'
      if (ext > 0.3) color = '#FF9800'
      if (ext > 0.6) color = '#F44336'

      ctx.strokeStyle = color; ctx.lineWidth = 2.5
      ctx.lineJoin = 'round'; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(ax, ay)
      const totalSegs = coils * 2
      const headLen = springLen * 0.05
      const coilLen = springLen - headLen * 2
      const segH = coilLen / totalSegs
      ctx.lineTo(ax, ay + headLen)
      let cy = ay + headLen
      for (let i = 0; i < totalSegs; i++) {
        const xOff = i % 2 === 0 ? -amp : amp
        cy += segH
        ctx.lineTo(ax + xOff, cy)
      }
      ctx.lineTo(ax, by); ctx.stroke()
    }

    // 钩子
    ctx.strokeStyle = '#90A4AE'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(ax, by); ctx.lineTo(ax, by + 10); ctx.stroke()

    // 【PhET‑style砝码canvas绘制函数】灰色金属方块+问号+质量文字
    if (sp.massValue > 0) {
      const [mx, my] = w2s(sp.xPos, sp.anchorY + sp.pos)
      const preset = MASS_PRESETS.find(m => Math.abs(m.value - sp.massValue) < 0.001)
      const bw = preset ? preset.bw : 48
      const bh = preset ? preset.bh : 38
      const bx = mx - bw / 2, by2 = my + 10

      // 挂钩
      ctx.strokeStyle = '#666'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(mx, by2 - 2); ctx.lineTo(mx, by2 + 6); ctx.stroke()

      drawPhetMassBlock(ctx, bx, by2, bw, bh, sp.massValue)
    }

    // 标注 Δx 和 F
    if (sp.massValue > 0) {
      const disp = sp.pos - sp.restLength
      const [, restY] = w2s(sp.xPos, sp.anchorY + sp.restLength)
      const [, curY] = w2s(sp.xPos, sp.anchorY + sp.pos)
      if (Math.abs(disp) > 0.002) {
        const annotX = ax - 45
        ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3])
        ctx.beginPath(); ctx.moveTo(annotX, restY); ctx.lineTo(annotX, curY); ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = '#FFD700'
        drawArr(ctx, annotX, restY, 'up'); drawArr(ctx, annotX, curY, 'down')
        ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'right'
        ctx.fillText(`Δx=${(disp * 100).toFixed(1)}cm`, annotX - 6, (restY + curY) / 2 + 4)
      }
      const force = sp.k * Math.max(0, disp)
      if (force > 0.05) {
        const fLen = Math.min(force * 2.5, 60)
        ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(ax + 35, curY); ctx.lineTo(ax + 35, curY - fLen); ctx.stroke()
        drawArr(ctx, ax + 35, curY - fLen, 'up')
        ctx.fillStyle = '#4CAF50'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'left'
        ctx.fillText(`F=${force.toFixed(2)}N`, ax + 40, curY - fLen / 2)
      }
    }

    // 弹簧编号标签
    const [, labelY] = w2s(sp.xPos, sp.anchorY - 0.08)
    ctx.fillStyle = sp.id === 1 ? '#E53935' : '#1565C0'
    ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(`弹簧 ${sp.id}`, ax, labelY)
  }

  // 【参考线拖拽】
  function drawRefLines(ctx) {
    const s = sim.current
    const lw = 160
    s.springs.forEach(sp => {
      const [lx] = w2s(sp.xPos, 0)
      if (s.showNatural) {
        const [, ny] = w2s(sp.xPos, sp.anchorY + sp.restLength)
        ctx.strokeStyle = '#2196F3'; ctx.lineWidth = 2; ctx.setLineDash([8, 6])
        ctx.beginPath(); ctx.moveTo(lx - lw / 2, ny); ctx.lineTo(lx + lw / 2, ny); ctx.stroke()
        ctx.setLineDash([])
        if (sp.id === 1) { ctx.fillStyle = '#2196F3'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('原长 L₀', lx - lw / 2 - 50, ny + 4) }
      }
      if (s.showEquilibrium && sp.massValue > 0) {
        const [, ey] = w2s(sp.xPos, sp.anchorY + getEqLen(sp))
        ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 2; ctx.setLineDash([8, 6])
        ctx.beginPath(); ctx.moveTo(lx - lw / 2, ey); ctx.lineTo(lx + lw / 2, ey); ctx.stroke()
        ctx.setLineDash([])
        if (sp.id === 1) { ctx.fillStyle = '#4CAF50'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('平衡位置', lx - lw / 2 - 60, ey + 4) }
      }
    })
    // 共用可移动红线
    if (s.showMovable) {
      const [lx] = w2s(0, 0); const [, my] = w2s(0, s.movableY)
      ctx.strokeStyle = '#F44336'; ctx.lineWidth = 2; ctx.setLineDash([6, 4])
      ctx.beginPath(); ctx.moveTo(lx - 200, my); ctx.lineTo(lx + 200, my); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#F44336'
      ctx.beginPath(); ctx.arc(lx - 200 - 10, my, 7, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('↕', lx - 200 - 10, my); ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = '#F44336'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText('可移动参考线', lx - 200 - 10, my - 12)
    }
  }

  // 刻度尺
  // 【可拖拽刻度尺对象】黄色竖直刻度尺，可鼠标拖拽移动
  function drawRuler(ctx) {
    const s = sim.current
    const x = s.rulerX
    const y = s.rulerY
    const rulerW = 24
    const rulerH = 360
    const cmPx = s.scale * 0.01

    // 投影
    ctx.fillStyle = 'rgba(0,0,0,0.1)'
    ctx.fillRect(x - rulerW / 2 + 3, y + 3, rulerW, rulerH)

    // 尺子主体（黄色）
    ctx.fillStyle = '#FFF9C4'
    ctx.fillRect(x - rulerW / 2, y, rulerW, rulerH)
    ctx.strokeStyle = '#F9A825'; ctx.lineWidth = 1.5
    ctx.strokeRect(x - rulerW / 2, y, rulerW, rulerH)

    // 顶部挂孔
    ctx.fillStyle = '#F9A825'
    ctx.beginPath(); ctx.arc(x, y + 10, 4, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#FFF9C4'
    ctx.beginPath(); ctx.arc(x, y + 10, 2, 0, Math.PI * 2); ctx.fill()

    // 刻度线和数字
    ctx.fillStyle = '#5D4037'
    ctx.strokeStyle = '#5D4037'
    ctx.font = '7px sans-serif'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (let i = 0; y + 22 + i * cmPx < y + rulerH - 5; i++) {
      const ly = y + 22 + i * cmPx
      const major = i % 5 === 0
      ctx.lineWidth = major ? 1 : 0.5
      ctx.beginPath()
      ctx.moveTo(x - rulerW / 2 + 2, ly)
      ctx.lineTo(x - rulerW / 2 + 2 + (major ? 12 : 6), ly)
      ctx.stroke()
      if (major && i > 0) {
        ctx.textAlign = 'right'
        ctx.fillText(`${i}`, x + rulerW / 2 - 2, ly)
      }
    }

    // 底部拖拽提示
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.font = '7px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('⠿', x, y + rulerH - 6)
  }

  // 【PhET‑style砝码canvas绘制函数】木质托盘货架
  function drawMassShelf(ctx) {
    const s = sim.current
    const sx = s.shelfX, sy = s.shelfY

    // 木质托盘底座
    const trayTopY = sy + 36  // 托盘上表面基准线
    ctx.fillStyle = '#C4A46C'
    ctx.fillRect(sx - 8, trayTopY, 200, 10)
    ctx.fillStyle = '#A0844A'
    ctx.fillRect(sx - 8, trayTopY + 10, 200, 8)
    // 托盘纹理
    ctx.strokeStyle = '#8B7040'; ctx.lineWidth = 0.5
    for (let i = 0; i < 200; i += 15) {
      ctx.beginPath(); ctx.moveTo(sx - 8 + i, trayTopY); ctx.lineTo(sx - 8 + i, trayTopY + 10); ctx.stroke()
    }
    // 托盘边框
    ctx.strokeStyle = '#7A6230'; ctx.lineWidth = 1.5
    ctx.strokeRect(sx - 8, trayTopY, 200, 18)

    // 【删除画布多余文本】托盘不显示"(拖拽挂载)"等注释文字

    // 【货架砝码摆放Y坐标修正】砝码底部对齐托盘上表面
    let offsetX = 0
    MASS_PRESETS.forEach((m, i) => {
      const bx = sx + offsetX + i * 8
      const by = trayTopY - m.bh  // 圆柱底部 = 托盘顶面
      drawPhetMassBlock(ctx, bx, by, m.bw, m.bh, m.value)
      m._shelfBx = bx
      m._shelfBy = by
      offsetX += m.bw + 6
    })
  }

  // 【PhET‑style砝码canvas绘制函数】【砝码圆柱透视绘制】
  function drawPhetMassBlock(ctx, bx, by, bw, bh, massVal) {
    const cx = bx + bw / 2
    const ellipseH = 5  // 椭圆高度

    // 投影（地面）
    ctx.fillStyle = 'rgba(0,0,0,0.1)'
    ctx.beginPath()
    ctx.ellipse(cx + 2, by + bh + 2, bw / 2 + 1, 3, 0, 0, Math.PI * 2)
    ctx.fill()

    // 圆柱侧面矩形（左右渐变模拟曲面）
    const bodyGrad = ctx.createLinearGradient(bx, by, bx + bw, by)
    bodyGrad.addColorStop(0, '#A8A8A8')
    bodyGrad.addColorStop(0.25, '#CCCCCC')
    bodyGrad.addColorStop(0.5, '#C4C4C4')
    bodyGrad.addColorStop(0.75, '#AAAAAA')
    bodyGrad.addColorStop(1, '#8C8C8C')
    ctx.fillStyle = bodyGrad
    ctx.fillRect(bx, by + ellipseH / 2, bw, bh - ellipseH)

    // 左右竖边
    ctx.strokeStyle = '#888'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(bx, by + ellipseH / 2); ctx.lineTo(bx, by + bh); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(bx + bw, by + ellipseH / 2); ctx.lineTo(bx + bw, by + bh); ctx.stroke()

    // 【砝码底部轮廓绘制修正】仅画一条向下弯曲的弧线
    const botArcRx = bw / 2
    const botArcDip = ellipseH * 0.8     // 向下弯曲幅度
    const botY = by + bh
    ctx.strokeStyle = '#999'; ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(cx - botArcRx, botY)                     // 左端点
    ctx.quadraticCurveTo(cx, botY + botArcDip, cx + botArcRx, botY)  // 向下弯曲弧线到右端点
    ctx.stroke()

    // 圆柱顶面椭圆（俯视可见）
    ctx.fillStyle = '#DCDCDC'
    ctx.beginPath()
    ctx.ellipse(cx, by + ellipseH / 2, bw / 2, ellipseH / 2, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#AAA'; ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.ellipse(cx, by + ellipseH / 2, bw / 2, ellipseH / 2, 0, 0, Math.PI * 2)
    ctx.stroke()

    // 顶部挂钩
    ctx.strokeStyle = '#666'; ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(cx, by - 2, 5, Math.PI, 0, false)
    ctx.stroke()
    ctx.strokeStyle = '#999'; ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(cx, by - 2, 5, Math.PI * 1.1, Math.PI * 0.5, true)
    ctx.stroke()

    // 问号（顶面椭圆上方）
    ctx.fillStyle = '#555'
    ctx.font = `bold ${Math.max(9, (bh - ellipseH) * 0.22)}px sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('?', cx, by + ellipseH / 2 - 1)

    // 质量文字（侧面正面）
    const label = massVal >= 1 ? `${massVal.toFixed(1)} kg` : `${(massVal * 1000).toFixed(0)} g`
    ctx.fillStyle = '#444'
    ctx.font = `bold ${Math.max(11, (bh - ellipseH) * 0.35)}px sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(label, cx, by + ellipseH / 2 + (bh - ellipseH) / 2)
  }

  function shade(c, p) {
    const n = parseInt(c.replace('#', ''), 16)
    return `rgb(${Math.min(255, Math.max(0, (n >> 16) + p))},${Math.min(255, Math.max(0, ((n >> 8) & 0xff) + p))},${Math.min(255, Math.max(0, (n & 0xff) + p))})`
  }

  function drawArr(ctx, x, y, d) {
    ctx.beginPath()
    if (d === 'up') { ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 7); ctx.lineTo(x + 4, y + 7) }
    else { ctx.moveTo(x, y); ctx.lineTo(x - 4, y - 7); ctx.lineTo(x + 4, y - 7) }
    ctx.closePath(); ctx.fill()
  }

  // ============ 【砝码拖拽交互】+【参考线拖拽】交互 ============
  function getPos(e) { const r = canvasRef.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] }

  const handleMouseDown = useCallback((e) => {
    const [sx, sy] = getPos(e)
    const s = sim.current

    // 【可拖拽刻度尺对象】检测尺子区域
    const rulerW = 24, rulerH = 360
    if (sx >= s.rulerX - rulerW / 2 - 5 && sx <= s.rulerX + rulerW / 2 + 5 && sy >= s.rulerY - 5 && sy <= s.rulerY + rulerH + 5) {
      s.dragMode = 'ruler'
      s.rulerDragOX = sx - s.rulerX
      s.rulerDragOY = sy - s.rulerY
      e.preventDefault(); return
    }

    // 【参考线拖拽】红线全宽度
    if (s.showMovable) {
      const [, hy] = w2s(0, s.movableY)
      if (Math.abs(sy - hy) < 12) { s.dragMode = 'movable'; e.preventDefault(); return }
    }

    // 【砝码拖拽交互】货架点击挂载（使用记录的方块位置）
    for (let i = 0; i < MASS_PRESETS.length; i++) {
      const m = MASS_PRESETS[i]
      const bx = m._shelfBx || (s.shelfX + i * 58)
      const by = m._shelfBy || s.shelfY
      const bw = m.bw || 48
      const bh = m.bh || 32
      if (sx >= bx - 5 && sx <= bx + bw + 5 && sy >= by - 10 && sy <= by + bh + 5) {
        const sp = findNearestSpring(sx)
        hangMass(sp, m.value)
        return
      }
    }

    // 【砝码拖拽交互】弹簧上砝码拖拽取下
    for (const sp of s.springs) {
      if (sp.massValue <= 0) continue
      const [mx, my] = w2s(sp.xPos, sp.anchorY + sp.pos)
      const preset = MASS_PRESETS.find(m => Math.abs(m.value - sp.massValue) < 0.001)
      const bw = preset ? preset.bw : 48
      const bh = preset ? preset.bh : 38
      const bx = mx - bw / 2, by = my + 10
      if (sx >= bx - 5 && sx <= bx + bw + 5 && sy >= by - 5 && sy <= by + bh + 5) {
        s.dragMode = 'mass'; s.dragSpringId = sp.id; e.preventDefault(); return
      }
    }
  }, [])

  function findNearestSpring(sx) {
    const s = sim.current
    const [x1] = w2s(s.springs[0].xPos, 0)
    const [x2] = w2s(s.springs[1].xPos, 0)
    return Math.abs(sx - x1) < Math.abs(sx - x2) ? s.springs[0] : s.springs[1]
  }

  const handleMouseMove = useCallback((e) => {
    const [sx, sy] = getPos(e)
    const s = sim.current
    if (s.dragMode === 'movable') { const [, wy] = s2w(sx, sy); s.movableY = Math.max(0.5, wy); return }
    // 【可拖拽刻度尺对象】拖拽尺子
    if (s.dragMode === 'ruler') {
      s.rulerX = Math.max(20, Math.min(s.screenW - 20, sx - s.rulerDragOX))
      s.rulerY = Math.max(0, Math.min(s.screenH - 60, sy - s.rulerDragOY))
      return
    }
    s.hovered = null
    if (s.showMovable) { const [, hy] = w2s(0, s.movableY); if (Math.abs(sy - hy) < 12) s.hovered = 'movable' }
  }, [])

  const handleMouseUp = useCallback(() => {
    const s = sim.current
    if (s.dragMode === 'mass') {
      const sp = s.springs.find(sp => sp.id === s.dragSpringId)
      if (sp) { sp.massValue = 0; sp.vel = 0; sp.pos = sp.restLength }
      triggerRender()
    }
    s.dragMode = null; s.dragSpringId = -1
  }, [triggerRender])

  // ============ 操作 ============
  function hangMass(sp, m) {
    sp.massValue = m
    sp.pos = sp.restLength + (m * sp.g) / sp.k + 0.08
    sp.vel = 0
  }

  function resetSpring(idx) {
    const sp = sim.current.springs[idx]
    sp.massValue = 0; sp.pos = sp.restLength; sp.vel = 0
    triggerRender()
  }

  function handleCollect() {
    const s = sim.current
    const sp = s.springs.find(sp => sp.id === s.selectedSpring)
    if (!sp || sp.massValue <= 0) return
    const d = Math.max(0, sp.pos - sp.restLength)
    if (d > 0.002) { s.dataPoints.push({ springId: sp.id, x: d, y: sp.k * d }); triggerRender() }
  }

  // 【重置逻辑更新】全局重置恢复尺子默认位置
  function handleReset() {
    const s = sim.current
    s.springs.forEach(sp => { sp.massValue = 0; sp.pos = sp.restLength; sp.vel = 0 })
    s.dataPoints = []; s.stopwatchTime = 0; s.stopwatchRunning = false
    s.rulerX = s.defaultRulerX; s.rulerY = s.defaultRulerY
    triggerRender()
  }

  function handleClearData() { sim.current.dataPoints = []; triggerRender() }

  const isEq = eqStates[selectedSpring - 1] || false
  const cursor = sim.current.hovered === 'movable' ? 'ns-resize'
    : sim.current.dragMode === 'mass' ? 'grabbing' : 'default'

  // ============ F-x 图像 ============
  function FXGraph() {
    const s = sim.current
    const pts = s.dataPoints.filter(p => p.springId === selectedSpring)
    const sp = s.springs[selectedSpring - 1]
    const disp = Math.max(0, sp.pos - sp.restLength)
    const force = sp.k * disp
    const allX = pts.length > 0 ? Math.max(...pts.map(p => p.x), disp) : Math.max(disp, 0.01)
    const allY = pts.length > 0 ? Math.max(...pts.map(p => p.y), force) : Math.max(force, 0.5)
    const gw = 200, gh = 100, pad = 30
    const toX = v => pad + (v / allX) * (gw - pad - 10)
    const toY = v => gh - 10 - (v / allY) * (gh - pad - 10)
    const linePath = pts.length > 1 ? pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.x)},${toY(p.y)}`).join(' ') : ''
    return (
      <div style={{ background: '#fafafa', borderRadius: 8, padding: '10px', border: '1px solid #e0e0e0', marginTop: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#333', marginBottom: 4 }}>📈 F-x 图像（弹簧{selectedSpring}）</div>
        <svg width={gw} height={gh} style={{ display: 'block' }}>
          <line x1={pad} y1={10} x2={pad} y2={gh - 10} stroke="#bbb" strokeWidth="1" />
          <line x1={pad} y1={gh - 10} x2={gw - 10} y2={gh - 10} stroke="#bbb" strokeWidth="1" />
          <line x1={pad} y1={gh - 10} x2={gw - 10} y2={10} stroke="rgba(255,152,0,0.3)" strokeWidth="1" strokeDasharray="4,4" />
          {linePath && <path d={linePath} fill="none" stroke="#2196F3" strokeWidth="1.5" />}
          {pts.map((p, i) => <circle key={i} cx={toX(p.x)} cy={toY(p.y)} r="3.5" fill="#2196F3" />)}
          {disp > 0.001 && <circle cx={toX(disp)} cy={toY(force)} r="4.5" fill="#FFD700" stroke="#fff" strokeWidth="1" />}
          <text x={gw / 2} y={gh - 2} textAnchor="middle" fontSize="9" fill="#999">Δx (m)</text>
          <text x={4} y={gh / 2} textAnchor="middle" fontSize="9" fill="#999" transform={`rotate(-90,4,${gh / 2})`}>F (N)</text>
        </svg>
      </div>
    )
  }

  // ============ 胡克数据 ============
  function HookData() {
    const s = sim.current
    const sp = s.springs[selectedSpring - 1]
    const disp = Math.max(0, sp.pos - sp.restLength)
    const force = sp.k * disp
    const diff = Math.abs(force - sp.k * disp)
    return (
      <div style={{ background: '#fafafa', borderRadius: 8, padding: '10px', border: '1px solid #e0e0e0', marginTop: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#333', marginBottom: 6 }}>📊 弹簧{selectedSpring} 验证数据</div>
        <div style={{ fontSize: 11, color: '#666', lineHeight: 1.8 }}>
          <div>k = {sp.k} N/m</div>
          <div>L₀ = {(sp.restLength * 100).toFixed(1)} cm</div>
          <div style={{ color: '#FF9800' }}>Δx = {(disp * 100).toFixed(2)} cm</div>
          <div style={{ color: '#4CAF50' }}>F = {force.toFixed(3)} N</div>
          <div style={{ color: '#2196F3' }}>kΔx = {(sp.k * disp).toFixed(3)} N</div>
        </div>
        <div style={{ fontSize: 10, color: '#999', marginTop: 6 }}>已采集 {s.dataPoints.filter(p => p.springId === selectedSpring).length} 点</div>
      </div>
    )
  }

  function Stopwatch() {
    const t = sim.current.stopwatchTime
    const min = Math.floor(t / 60), sec = (t % 60).toFixed(1)
    return (
      <div style={{ background: '#fafafa', borderRadius: 8, padding: '8px 10px', border: '1px solid #e0e0e0', marginTop: 8, textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontFamily: 'monospace', fontWeight: 700, color: sim.current.stopwatchRunning ? '#F44336' : '#333' }}>
          ⏱ {min}:{sec.padStart(4, '0')}
        </div>
      </div>
    )
  }

  // ============ UI ============
  return (
    <div style={S.page}>
      <div style={S.titleBar}>
        <span style={S.titleText}>🔬 质量与弹簧：基础</span>
        <span style={S.titleHint}>胡克定律 F = kΔx</span>
      </div>
      <div style={S.main}>
        {/* 左面板 */}
        <div style={S.leftPanel}>
          <div style={S.panelTitle}>⚙️ 参数控制</div>

          {/* 弹簧1 */}
          <div style={{ ...S.springSection, borderLeft: '3px solid #E53935' }}>
            <div style={S.secTitle}>弹簧 1（红色）</div>
            <div style={S.sliderRow}>
              <span style={S.sliderLabel}>k₁</span>
              <input type="range" min={5} max={80} step={1} value={k1} style={S.slider}
                onChange={e => { const v = +e.target.value; sim.current.springs[0].k = v; setK1(v) }} />
              <span style={S.sliderVal}>{k1}</span>
              <button style={S.resetSmall} onClick={() => resetSpring(0)} title="重置弹簧1">↺</button>
            </div>
          </div>

          {/* 弹簧2 */}
          <div style={{ ...S.springSection, borderLeft: '3px solid #1565C0' }}>
            <div style={S.secTitle}>弹簧 2（蓝色）</div>
            <div style={S.sliderRow}>
              <span style={S.sliderLabel}>k₂</span>
              <input type="range" min={5} max={80} step={1} value={k2} style={S.slider}
                onChange={e => { const v = +e.target.value; sim.current.springs[1].k = v; setK2(v) }} />
              <span style={S.sliderVal}>{k2}</span>
              <button style={S.resetSmall} onClick={() => resetSpring(1)} title="重置弹簧2">↺</button>
            </div>
          </div>

          <div style={S.secTitle}>全局阻尼</div>
          <div style={S.sliderRow}>
            <input type="range" min={0.05} max={3} step={0.05} value={damping} style={S.slider}
              onChange={e => { const v = +e.target.value; sim.current.damping = v; setDamping(v) }} />
            <span style={S.sliderVal}>{damping.toFixed(2)}</span>
          </div>

          <div style={S.divider} />
          <div style={S.secTitle}>采集弹簧数据</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <button style={{ ...S.springBtn, background: selectedSpring === 1 ? '#E53935' : '#ccc' }} onClick={() => setSelectedSpring(1)}>弹簧1</button>
            <button style={{ ...S.springBtn, background: selectedSpring === 2 ? '#1565C0' : '#ccc' }} onClick={() => setSelectedSpring(2)}>弹簧2</button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={{ ...S.btn, ...(isEq ? S.collectBtn : S.collectDis) }} onClick={handleCollect} disabled={!isEq}>
              📌 {isEq ? '采集数据' : '等待静止…'}
            </button>
          </div>

          <FXGraph />
        </div>

        {/* 中间画布 */}
        <div style={S.canvasWrap}>
          <canvas ref={canvasRef} style={{ ...S.canvas, cursor }}
            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
            onContextMenu={e => e.preventDefault()} />
        </div>

        {/* 右面板 */}
        <div style={S.rightPanel}>
          <div style={S.panelTitle}>📊 数据与控制</div>

          <div style={S.secTitle}>参考虚线</div>
          <label style={S.check}><input type="checkbox" checked={showNatural} onChange={e => { sim.current.showNatural = e.target.checked; setShowNatural(e.target.checked) }} /><span style={{ color: '#2196F3' }}>●</span> 原长位置</label>
          <label style={S.check}><input type="checkbox" checked={showEquilibrium} onChange={e => { sim.current.showEquilibrium = e.target.checked; setShowEquilibrium(e.target.checked) }} /><span style={{ color: '#4CAF50' }}>●</span> 平衡位置</label>
          <label style={S.check}><input type="checkbox" checked={showMovable} onChange={e => { sim.current.showMovable = e.target.checked; setShowMovable(e.target.checked) }} /><span style={{ color: '#F44336' }}>●</span> 可移动参考线</label>

          <div style={S.divider} />
          <div style={S.secTitle}>仿真控制</div>
          <div style={S.btnRow}>
            <button style={{ ...S.btn, ...(paused ? S.resumeBtn : S.pauseBtn) }} onClick={() => setPaused(p => !p)}>{paused ? '▶ 继续' : '⏸ 暂停'}</button>
            <button style={{ ...S.btn, ...(slowMode ? S.slowActiveBtn : S.slowBtn) }} onClick={() => { const s = sim.current; if (slowMode) { s.speedMul = 1; setSlowMode(false) } else { s.speedMul = 0.2; setSlowMode(true) } }}>{slowMode ? '🐇 正常' : '🐢 慢速'}</button>
          </div>
          <div style={S.btnRow}>
            <button style={{ ...S.btn, ...S.swBtn }} onClick={() => { sim.current.stopwatchRunning = !sim.current.stopwatchRunning; triggerRender() }}>{sim.current.stopwatchRunning ? '⏱ 停止' : '⏱ 计时'}</button>
            <button style={{ ...S.btn, ...S.swResetBtn }} onClick={() => { sim.current.stopwatchTime = 0; sim.current.stopwatchRunning = false; triggerRender() }}>⏱ 归零</button>
          </div>
          <div style={S.btnRow}>
            <button style={{ ...S.btn, ...S.clearBtn }} onClick={handleClearData}>🗑 清空数据</button>
            <button style={{ ...S.btn, ...S.resetBtn }} onClick={handleReset}>↺ 全局重置</button>
          </div>
          <Stopwatch />

          <div style={S.divider} />
          <div style={S.formulaBox}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1a1a2e', marginBottom: 4 }}>📐 胡克定律</div>
            <div style={{ color: '#4CAF50', fontSize: 14, fontFamily: 'serif', fontWeight: 'bold' }}>F = kΔx</div>
          </div>
          <HookData />
        </div>
      </div>
    </div>
  )
}

// ============ 样式 ============
const S = {
  page: { display: 'flex', flexDirection: 'column', width: '100%', height: '100vh', background: '#f0f0f0', overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  titleBar: { height: 44, flexShrink: 0, background: 'linear-gradient(135deg, #1565C0, #0D47A1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)', zIndex: 20 },
  titleText: { color: '#fff', fontSize: 15, fontWeight: 700 },
  titleHint: { color: 'rgba(255,255,255,0.75)', fontSize: 12 },
  main: { display: 'flex', flex: 1, overflow: 'hidden' },
  canvasWrap: { flex: 1, position: 'relative', overflow: 'hidden' },
  canvas: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  leftPanel: { width: 270, flexShrink: 0, background: '#fff', padding: '14px 16px', boxShadow: '2px 0 8px rgba(0,0,0,0.06)', borderRight: '1px solid #e0e0e0', overflowY: 'auto', zIndex: 10 },
  rightPanel: { width: 250, flexShrink: 0, background: '#fff', padding: '14px 16px', boxShadow: '-2px 0 8px rgba(0,0,0,0.06)', borderLeft: '1px solid #e0e0e0', overflowY: 'auto', zIndex: 10 },
  panelTitle: { fontSize: 14, fontWeight: 700, color: '#1a1a2e', marginBottom: 10 },
  secTitle: { fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 1, margin: '8px 0 4px' },
  divider: { height: 1, background: '#e0e0e0', margin: '10px 0' },
  springSection: { paddingLeft: 8, marginBottom: 4 },
  sliderRow: { display: 'flex', alignItems: 'center', gap: 4, margin: '3px 0' },
  sliderLabel: { fontSize: 11, color: '#666', minWidth: 18, fontWeight: 600 },
  slider: { flex: 1, accentColor: '#1565C0', height: 4 },
  sliderVal: { fontSize: 11, fontWeight: 600, color: '#1565C0', minWidth: 28, textAlign: 'right' },
  resetSmall: { width: 22, height: 22, borderRadius: '50%', background: '#E53935', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  btn: { border: 'none', borderRadius: 6, padding: '7px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600, flex: 1 },
  btnRow: { display: 'flex', gap: 6, margin: '6px 0' },
  springBtn: { border: 'none', borderRadius: 6, padding: '5px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 600, color: '#fff', flex: 1 },
  pauseBtn: { background: '#E53935', color: '#fff' },
  resumeBtn: { background: '#4CAF50', color: '#fff' },
  slowBtn: { background: '#f5f5f5', color: '#666' },
  slowActiveBtn: { background: '#2196F3', color: '#fff' },
  collectBtn: { background: '#FF9800', color: '#fff' },
  collectDis: { background: '#ccc', color: '#999', cursor: 'not-allowed' },
  clearBtn: { background: '#f5f5f5', color: '#666' },
  resetBtn: { background: '#78909C', color: '#fff' },
  swBtn: { background: '#9C27B0', color: '#fff' },
  swResetBtn: { background: '#f5f5f5', color: '#666' },
  check: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#555', margin: '4px 0', cursor: 'pointer' },
  formulaBox: { background: '#f0f7ff', borderRadius: 8, padding: '8px 10px', borderLeft: '3px solid #1565C0', marginTop: 8 },
}
