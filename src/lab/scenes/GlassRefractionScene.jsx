import { useRef, useEffect, useState, useCallback } from 'react'
import { SceneRenderer } from '../renderers/SceneRenderer'

/**
 * GlassRefractionScene — 测定玻璃折射率（插针法）
 *
 * 模拟平行玻璃砖的折射实验：
 * - 光线从空气进入玻璃砖，折射后从另一侧射出
 * - 入射角θ1 → 折射角θ2（入射面）
 * - 出射角θ4 = θ1（平行玻璃砖，出射面）
 * - n = sinθ1 / sinθ2
 * - 侧移 d = L·sin(θ1-θ2)/cosθ2
 *
 * 交互：
 * - 拖拽光源改变入射角
 * - 滑块调节折射率n
 */
export default function GlassRefractionScene({ preset }) {
  const canvasRef = useRef(null)
  const rendererRef = useRef(null)
  const animRef = useRef(null)

  const [sourcePos, setSourcePos] = useState({ x: -5.5, y: 2.5 })
  const [n, setN] = useState(preset?.n ?? 1.5)
  const [entryY, setEntryY] = useState(0.5)
  const sourcePosRef = useRef(sourcePos)
  const nRef = useRef(n)
  const entryYRef = useRef(entryY)

  const interactionRef = useRef({ mode: 'idle', dragTarget: null, dragOffset: { x: 0, y: 0 } })
  const [cursor, setCursor] = useState('default')

  // 玻璃砖参数
  const GLASS = { left: -2, right: 2, top: 1.25, bottom: -1.25, width: 4 }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const renderer = new SceneRenderer(canvas)
    rendererRef.current = renderer
    renderer.resize()

    const renderLoop = () => {
      renderFrame(renderer)
      animRef.current = requestAnimationFrame(renderLoop)
    }
    renderLoop()

    const handleResize = () => renderer.resize()
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [])

  // ========== 折射计算（用ref避免闭包陈旧）==========
  function calcRefraction() {
    const sp = sourcePosRef.current
    const nVal = nRef.current
    const ey = entryYRef.current
    const sx = sp.x
    const sy = sp.y

    // 入射方向：从光源指向入射点
    const ex = GLASS.left
    let dx = ex - sx
    let dy = ey - sy
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 0.01) return null
    dx /= len; dy /= len

    // 入射角（与法线的夹角，法线=(1,0)）
    const cosTheta1 = dx  // dx = cos(入射方向与x轴夹角)
    const sinTheta1 = Math.abs(dy)
    const theta1 = Math.acos(Math.max(-1, Math.min(1, cosTheta1)))

    // Snell: sinθ1 = n·sinθ2
    const sinTheta2 = sinTheta1 / nVal
    if (sinTheta2 >= 1) return null // 全反射（理论上不会发生）
    const theta2 = Math.asin(sinTheta2)

    // 折射方向（在玻璃内）
    const refrDx = Math.cos(theta2)
    const refrDy = -sinTheta2 * Math.sign(dy) // 保持y方向

    // 出射点
    const tExit = GLASS.width / refrDx
    const exitX = GLASS.right
    const exitY = ey + refrDy * tExit

    // 检查出射点是否在玻璃内
    if (exitY < GLASS.bottom || exitY > GLASS.top) return null

    // 出射面折射：θ3=θ2，sinθ4 = n·sinθ2 = sinθ1 → θ4=θ1
    const theta3 = theta2
    const theta4 = theta1

    // 侧移
    const lateralShift = GLASS.width * Math.sin(theta1 - theta2) / Math.cos(theta2)

    // n验证
    const nFromEntry = sinTheta1 / Math.sin(theta2)
    const nFromExit = Math.sin(theta4) / Math.sin(theta3)

    return {
      ex, ey, exitX, exitY,
      dx, dy, refrDx, refrDy,
      theta1: theta1 * 180 / Math.PI,
      theta2: theta2 * 180 / Math.PI,
      theta3: theta3 * 180 / Math.PI,
      theta4: theta4 * 180 / Math.PI,
      nFromEntry, nFromExit, lateralShift,
      sinTheta1, sinTheta2,
      nVal,  // 传递折射率给渲染
    }
  }

  const result = calcRefraction()

  // ========== 渲染 ==========
  function renderFrame(renderer) {
    const ctx = renderer.ctx
    const res = calcRefraction()  // 每帧重算，用ref读最新值
    renderer.clear()
    drawBg(ctx, renderer)
    drawGlass(ctx, renderer)
    if (res) {
      drawNormals(ctx, renderer, res)
      drawRays(ctx, renderer, res)
      drawAngleArcs(ctx, renderer, res)
      drawPins(ctx, renderer, res)
    }
    drawSource(ctx, renderer)
    drawEntryMarker(ctx, renderer)
    drawDescription(ctx, renderer, res)
  }

  function drawBg(ctx, renderer) {
    const [, oy] = renderer.worldToScreen(0, 0)
    const w = renderer.screenW

    // 主轴
    ctx.strokeStyle = 'rgba(100, 180, 255, 0.12)'
    ctx.lineWidth = 1
    ctx.setLineDash([10, 5])
    ctx.beginPath()
    ctx.moveTo(0, oy); ctx.lineTo(w, oy); ctx.stroke()
    ctx.setLineDash([])

    // 刻度
    const scale = renderer.scale
    const startWX = Math.floor(-renderer.offsetX / scale)
    const endWX = Math.ceil((w - renderer.offsetX) / scale)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.font = '10px monospace'
    for (let wx = startWX; wx <= endWX; wx++) {
      const [sx] = renderer.worldToScreen(wx, 0)
      ctx.strokeStyle = 'rgba(100, 180, 255, 0.15)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(sx, oy - 8); ctx.lineTo(sx, oy + 8); ctx.stroke()
      if (wx !== 0) {
        ctx.fillStyle = 'rgba(100, 180, 255, 0.25)'
        ctx.fillText(`${wx}m`, sx, oy + 10)
      }
    }
  }

  // 绘制玻璃砖
  function drawGlass(ctx, renderer) {
    const [lx, ly] = renderer.worldToScreen(GLASS.left, GLASS.top)
    const [rx, ry] = renderer.worldToScreen(GLASS.right, GLASS.bottom)
    const w = rx - lx
    const h = ry - ly

    // 玻璃砖（半透明）
    const grad = ctx.createLinearGradient(lx, 0, rx, 0)
    grad.addColorStop(0, 'rgba(100, 160, 255, 0.08)')
    grad.addColorStop(0.3, 'rgba(100, 160, 255, 0.18)')
    grad.addColorStop(0.5, 'rgba(130, 180, 255, 0.25)')
    grad.addColorStop(0.7, 'rgba(100, 160, 255, 0.18)')
    grad.addColorStop(1, 'rgba(100, 160, 255, 0.08)')
    ctx.fillStyle = grad
    ctx.fillRect(lx, ly, w, h)

    // 边框
    ctx.strokeStyle = '#4a90d9'
    ctx.lineWidth = 2
    ctx.strokeRect(lx, ly, w, h)

    // 角标 A B C D
    ctx.fillStyle = '#4a90d9'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    const offset = 16
    ctx.fillText('A', lx - offset, ly + 4)
    ctx.fillText('B', rx + offset, ly + 4)
    ctx.fillText('C', rx + offset, ry + 4)
    ctx.fillText('D', lx - offset, ry + 4)

    // 侧面标签
    ctx.fillStyle = 'rgba(79, 195, 247, 0.6)'
    ctx.font = '11px sans-serif'
    ctx.fillText('入射面', lx, ly - 14)
    ctx.fillText('出射面', rx, ly - 14)

    // "n = ?" 标注
    const [cx, cy] = renderer.worldToScreen(0, 0)
    ctx.fillStyle = 'rgba(100, 160, 255, 0.4)'
    ctx.font = 'bold 18px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`n = ${nRef.current.toFixed(2)}`, cx, cy + 8)
  }

  // 绘制法线
  function drawNormals(ctx, renderer, r) {
    const nLen = 1.0

    // 入射面法线
    const [nx1a, ny1a] = renderer.worldToScreen(r.ex - nLen, r.ey)
    const [nx1b, ny1b] = renderer.worldToScreen(r.ex + nLen, r.ey)
    ctx.strokeStyle = 'rgba(79, 195, 247, 0.5)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(nx1a, ny1a); ctx.lineTo(nx1b, ny1b); ctx.stroke()

    // 出射面法线
    const [nx2a, ny2a] = renderer.worldToScreen(r.exitX - nLen, r.exitY)
    const [nx2b, ny2b] = renderer.worldToScreen(r.exitX + nLen, r.exitY)
    ctx.beginPath()
    ctx.moveTo(nx2a, ny2a); ctx.lineTo(nx2b, ny2b); ctx.stroke()
    ctx.setLineDash([])

    // 法线标签
    ctx.fillStyle = 'rgba(79, 195, 247, 0.6)'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('N', nx1b + 8, ny1b)
    ctx.fillText('N', nx2b + 8, ny2b)
  }

  // 绘制光路（三段）
  function drawRays(ctx, renderer, r) {
    // ① 入射光线（黄）：光源 → 入射点
    const sp = sourcePosRef.current
    drawRayGlow(ctx, renderer, sp, { x: r.ex, y: r.ey }, '#FFD700', 0.9)

    // ② 玻璃内折射光线（橙）：入射点 → 出射点
    drawRayGlow(ctx, renderer, { x: r.ex, y: r.ey }, { x: r.exitX, y: r.exitY }, '#FF9800', 0.7)

    // ③ 出射光线（绿）：出射点 → 远方
    const farX = r.exitX + r.dx * 20
    const farY = r.exitY + r.dy * 20
    drawRayGlow(ctx, renderer, { x: r.exitX, y: r.exitY }, { x: farX, y: farY }, '#4CAF50', 0.8)

    // 入射点标记
    const [isx, isy] = renderer.worldToScreen(r.ex, r.ey)
    ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.arc(isx, isy, 4, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#FFD700'
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(isx, isy, 4, 0, Math.PI * 2); ctx.stroke()

    // 出射点标记
    const [osx, osy] = renderer.worldToScreen(r.exitX, r.exitY)
    ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.arc(osx, osy, 4, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#4CAF50'
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(osx, osy, 4, 0, Math.PI * 2); ctx.stroke()
  }

  // 绘制角度弧线
  function drawAngleArcs(ctx, renderer, r) {
    // 入射面：θ1 和 θ2
    drawOneArc(ctx, renderer, r.ex, r.ey, r.dx, r.dy, 1, 0, r.theta1, '#FFD700', 'θ₁')
    drawOneArc(ctx, renderer, r.ex, r.ey, r.refrDx, r.refrDy, 1, 0, r.theta2, '#FF9800', 'θ₂')

    // 出射面：θ3 和 θ4
    const exitNx = -1  // 出射面法线指向左
    drawOneArc(ctx, renderer, r.exitX, r.exitY, -r.refrDx, -r.refrDy, exitNx, 0, r.theta3, '#FF9800', 'θ₃')
    drawOneArc(ctx, renderer, r.exitX, r.exitY, r.dx, r.dy, exitNx, 0, r.theta4, '#4CAF50', 'θ₄')
  }

  function drawOneArc(ctx, renderer, cx, cy, rayDx, rayDy, refDx, refDy, angleDeg, color, label) {
    const [scx, scy] = renderer.worldToScreen(cx, cy)
    const r = 35

    const rayAngle = Math.atan2(-rayDy, rayDx)
    const refAngle = Math.atan2(-refDy, refDx)

    let diff = rayAngle - refAngle
    while (diff > Math.PI) diff -= 2 * Math.PI
    while (diff < -Math.PI) diff += 2 * Math.PI

    // 弧线
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.globalAlpha = 0.7
    ctx.beginPath()
    if (diff > 0) ctx.arc(scx, scy, r, refAngle, rayAngle)
    else ctx.arc(scx, scy, r, rayAngle, refAngle)
    ctx.stroke()
    ctx.globalAlpha = 1

    // 半透明扇形
    ctx.fillStyle = color
    ctx.globalAlpha = 0.08
    ctx.beginPath()
    ctx.moveTo(scx, scy)
    if (diff > 0) ctx.arc(scx, scy, r, refAngle, rayAngle)
    else ctx.arc(scx, scy, r, rayAngle, refAngle)
    ctx.closePath()
    ctx.fill()
    ctx.globalAlpha = 1

    // 标签
    const midAngle = diff > 0 ? (refAngle + rayAngle) / 2 : (rayAngle + refAngle) / 2
    const lx = scx + Math.cos(midAngle) * (r + 14)
    const ly = scy + Math.sin(midAngle) * (r + 14)
    ctx.fillStyle = color
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${label}=${angleDeg.toFixed(1)}°`, lx, ly)
  }

  // 光线发光效果
  function drawRayGlow(ctx, renderer, from, to, color, alpha) {
    const [x1, y1] = renderer.worldToScreen(from.x, from.y)
    const [x2, y2] = renderer.worldToScreen(to.x, to.y)

    const layers = [
      { w: 5, a: alpha * 0.12 },
      { w: 3, a: alpha * 0.3 },
      { w: 1.5, a: alpha * 0.85 },
    ]
    for (const l of layers) {
      ctx.strokeStyle = color
      ctx.lineWidth = l.w
      ctx.globalAlpha = l.a
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    }
    ctx.globalAlpha = 1

    // 箭头
    const angle = Math.atan2(y2 - y1, x2 - x1)
    ctx.fillStyle = color
    ctx.globalAlpha = alpha * 0.85
    ctx.beginPath()
    ctx.moveTo(x2, y2)
    ctx.lineTo(x2 - 10 * Math.cos(angle - 0.3), y2 - 10 * Math.sin(angle - 0.3))
    ctx.lineTo(x2 - 10 * Math.cos(angle + 0.3), y2 - 10 * Math.sin(angle + 0.3))
    ctx.closePath()
    ctx.fill()
    ctx.globalAlpha = 1
  }

  // 绘制插针标记
  function drawPins(ctx, renderer, r) {
    const sp = sourcePosRef.current
    const pins = [
      { x: sp.x + (r.ex - sp.x) * 0.3, y: sp.y + (r.ey - sp.y) * 0.3, label: 'P₁', color: '#FFD700' },
      { x: sp.x + (r.ex - sp.x) * 0.6, y: sp.y + (r.ey - sp.y) * 0.6, label: 'P₂', color: '#FFD700' },
      { x: r.exitX + (r.exitX + r.dx * 20 - r.exitX) * 0.15, y: r.exitY + (r.exitY + r.dy * 20 - r.exitY) * 0.15, label: 'P₃', color: '#4CAF50' },
      { x: r.exitX + (r.exitX + r.dx * 20 - r.exitX) * 0.35, y: r.exitY + (r.exitY + r.dy * 20 - r.exitY) * 0.35, label: 'P₄', color: '#4CAF50' },
    ]

    for (const pin of pins) {
      const [px, py] = renderer.worldToScreen(pin.x, pin.y)

      // 针头
      ctx.fillStyle = pin.color
      ctx.beginPath()
      ctx.arc(px, py, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(px, py, 4, 0, Math.PI * 2)
      ctx.stroke()

      // 标签
      ctx.fillStyle = pin.color
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(pin.label, px, py - 10)
    }
  }

  // 绘制光源
  function drawSource(ctx, renderer) {
    const sp = sourcePosRef.current
    const [sx, sy] = renderer.worldToScreen(sp.x, sp.y)

    // 激光笔
    ctx.fillStyle = '#E53935'
    ctx.beginPath()
    ctx.roundRect(sx - 12, sy - 5, 24, 10, 3)
    ctx.fill()
    ctx.strokeStyle = '#B71C1C'
    ctx.lineWidth = 1
    ctx.stroke()

    // 发射口
    ctx.fillStyle = '#FF5252'
    ctx.beginPath()
    ctx.arc(sx + 12, sy, 3, 0, Math.PI * 2)
    ctx.fill()

    // 标签
    ctx.fillStyle = '#FF5252'
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('光源', sx, sy - 12)

    // 选中效果
    if (interactionRef.current.mode === 'dragging' && interactionRef.current.dragTarget === 'source') {
      ctx.strokeStyle = 'rgba(79, 195, 247, 0.5)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.arc(sx, sy, 20, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }

  // 绘制文字说明
  function drawDescription(ctx, renderer, res) {
    const x = 16
    let y = 20

    ctx.textBaseline = 'top'

    // 标题
    ctx.fillStyle = '#c9d1d9'
    ctx.font = 'bold 16px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('测定玻璃折射率（插针法）', x, y)
    y += 28

    // 公式
    ctx.fillStyle = '#4a90d9'
    ctx.font = 'bold 14px serif'
    ctx.fillText('n = sinθ₁ / sinθ₂', x, y)
    y += 24

    // 要点
    ctx.fillStyle = '#8b949e'
    ctx.font = '12px sans-serif'
    const points = [
      '① P₁P₂确定入射光线',
      '② P₃P₄确定出射光线',
      '③ 移去玻璃砖后连线测角度',
      '④ 多次测量求平均值减小误差',
    ]
    for (const p of points) {
      ctx.fillText(p, x, y)
      y += 18
    }

    // 实时数据
    if (res) {
      y += 6
      ctx.fillStyle = '#FFD700'
      ctx.font = 'bold 12px sans-serif'
      ctx.fillText(`θ₁ = ${res.theta1.toFixed(1)}°`, x, y)
      y += 18
      ctx.fillStyle = '#FF9800'
      ctx.fillText(`θ₂ = ${res.theta2.toFixed(1)}°`, x, y)
      y += 18
      ctx.fillStyle = '#4CAF50'
      ctx.fillText(`n = ${res.nFromEntry.toFixed(3)}`, x, y)
      y += 18
      ctx.fillStyle = '#4FC3F7'
      ctx.font = '11px sans-serif'
      ctx.fillText(`侧移 d = ${res.lateralShift.toFixed(3)}m`, x, y)
    }
  }

  // 入射点标记
  function drawEntryMarker(ctx, renderer) {
    const ey = entryYRef.current
    const [ex, eys] = renderer.worldToScreen(GLASS.left, ey)

    // 可拖拽标记
    ctx.fillStyle = interactionRef.current.dragTarget === 'entry'
      ? 'rgba(255, 152, 0, 0.8)' : 'rgba(255, 152, 0, 0.5)'
    ctx.beginPath()
    ctx.arc(ex, eys, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(ex, eys, 6, 0, Math.PI * 2)
    ctx.stroke()

    ctx.fillStyle = '#FF9800'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText('入射点', ex - 10, eys - 10)
  }

  // ========== 鼠标交互 ==========
  const handleMouseDown = useCallback((e) => {
    const renderer = rendererRef.current
    if (!renderer) return

    const rect = canvasRef.current.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const [wx, wy] = renderer.screenToWorld(sx, sy)
    const interaction = interactionRef.current

    if (e.button === 2) { e.preventDefault(); return }

    // 检测光源拖拽
    const sp = sourcePosRef.current
    const ey = entryYRef.current
    const sDist = Math.sqrt((wx - sp.x) ** 2 + (wy - sp.y) ** 2)
    if (sDist < 0.6) {
      interaction.mode = 'dragging'
      interaction.dragTarget = 'source'
      interaction.dragOffset = { x: wx - sp.x, y: wy - sp.y }
      setCursor('grabbing')
      return
    }

    // 检测入射点拖拽
    const eDist = Math.sqrt((wx - GLASS.left) ** 2 + (wy - ey) ** 2)
    if (eDist < 0.5) {
      interaction.mode = 'dragging'
      interaction.dragTarget = 'entry'
      interaction.dragOffset = { x: 0, y: wy - entryY }
      setCursor('grabbing')
    }
  }, [sourcePos, entryY])

  const handleMouseMove = useCallback((e) => {
    const renderer = rendererRef.current
    if (!renderer) return

    const rect = canvasRef.current.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const [wx, wy] = renderer.screenToWorld(sx, sy)
    const interaction = interactionRef.current

    if (interaction.mode === 'dragging') {
      if (interaction.dragTarget === 'source') {
        const newX = wx - interaction.dragOffset.x
        const newY = wy - interaction.dragOffset.y
        const pos = { x: Math.min(newX, GLASS.left - 0.8), y: newY }
        setSourcePos(pos)
        sourcePosRef.current = pos
      } else if (interaction.dragTarget === 'entry') {
        const newY = wy - interaction.dragOffset.y
        const clamped = Math.max(GLASS.bottom + 0.1, Math.min(GLASS.top - 0.1, newY))
        setEntryY(clamped)
        entryYRef.current = clamped
      }
      return
    }

    // 空闲悬停
    const sp = sourcePosRef.current
    const ey = entryYRef.current
    const sDist = Math.sqrt((wx - sp.x) ** 2 + (wy - sp.y) ** 2)
    const eDist = Math.sqrt((wx - GLASS.left) ** 2 + (wy - ey) ** 2)
    setCursor(sDist < 0.6 || eDist < 0.5 ? 'grab' : 'default')
  }, [sourcePos, entryY])

  const handleMouseUp = useCallback(() => {
    interactionRef.current = { mode: 'idle', dragTarget: null, dragOffset: { x: 0, y: 0 } }
    setCursor('default')
  }, [])

  const handleContextMenu = useCallback((e) => e.preventDefault(), [])

  // ========== 材料名称 ==========
  function getMaterialName(nVal) {
    if (nVal < 1.05) return '空气'
    if (nVal < 1.35) return '水'
    if (nVal < 1.55) return '普通玻璃'
    if (nVal < 1.7) return '重火石玻璃'
    if (nVal < 2.1) return '蓝宝石'
    return '金刚石'
  }

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <span style={styles.title}>🔬 测定玻璃折射率（插针法）</span>
        <div style={styles.toolbarActions}>
          <label style={styles.sliderLabel}>
            折射率 n =
            <input type="range" min="1.0" max="2.5" step="0.01"
              value={n}
              onChange={(e) => { const v = parseFloat(e.target.value); setN(v); nRef.current = v }}
              style={styles.slider}
            />
            <span style={styles.sliderValue}>{n.toFixed(2)}</span>
            <span style={styles.materialTag}>{getMaterialName(n)}</span>
          </label>
        </div>
      </div>

      <div style={styles.main}>
        <canvas ref={canvasRef}
          style={{ ...styles.canvas, cursor }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onContextMenu={handleContextMenu}
        />

        <div style={styles.panel}>
          <div style={styles.panelSection}>
            <div style={styles.panelTitle}>📐 折射定律</div>
            <div style={styles.formula}>
              <span style={styles.formulaMain}>n₁·sinθ₁ = n₂·sinθ₂</span>
            </div>
            <div style={styles.formula}>
              <span style={styles.formulaMain}>n = sinθ₁ / sinθ₂</span>
            </div>
          </div>

          <div style={styles.panelSection}>
            <div style={styles.panelTitle}>📊 入射面数据</div>
            <DataRow label="入射角 θ₁" value={result ? `${result.theta1.toFixed(1)}°` : '—'} color="#FFD700" />
            <DataRow label="折射角 θ₂" value={result ? `${result.theta2.toFixed(1)}°` : '—'} color="#FF9800" />
            <DataRow label="sinθ₁" value={result ? result.sinTheta1.toFixed(4) : '—'} color="#FFD700" />
            <DataRow label="sinθ₂" value={result ? result.sinTheta2.toFixed(4) : '—'} color="#FF9800" />
            <DataRow label="n (入射面)" value={result ? result.nFromEntry.toFixed(4) : '—'} color="#4CAF50" />
          </div>

          <div style={styles.panelSection}>
            <div style={styles.panelTitle}>📊 出射面数据</div>
            <DataRow label="入射角 θ₃" value={result ? `${result.theta3.toFixed(1)}°` : '—'} color="#FF9800" />
            <DataRow label="折射角 θ₄" value={result ? `${result.theta4.toFixed(1)}°` : '—'} color="#4CAF50" />
            <DataRow label="n (出射面)" value={result ? result.nFromExit.toFixed(4) : '—'} color="#4CAF50" />
          </div>

          <div style={styles.panelSection}>
            <div style={styles.panelTitle}>📏 侧移</div>
            <DataRow label="侧移 d" value={result ? `${result.lateralShift.toFixed(4)} m` : '—'} color="#4FC3F7" />
          </div>

          <div style={styles.panelSection}>
            <div style={styles.panelTitle}>📋 验证</div>
            <div style={styles.ruleItem}>
              {result ? (
                <span style={{ color: '#4CAF50' }}>
                  ✓ n入 ≈ n出 ({result.nFromEntry.toFixed(3)} ≈ {result.nFromExit.toFixed(3)})
                </span>
              ) : (
                <span style={{ color: '#484f58' }}>调整光源观察结果</span>
              )}
            </div>
            <div style={styles.ruleItem}>
              {result && (
                <span style={{ color: '#4CAF50' }}>
                  ✓ θ₁ = θ₄（平行玻璃砖出射角=入射角）
                </span>
              )}
            </div>
          </div>

          <div style={styles.panelSection}>
            <div style={styles.panelTitle}>💡 插针法要点</div>
            <div style={styles.rayDesc}><span style={{ color: '#FFD700' }}>P₁P₂</span> 确定入射光线</div>
            <div style={styles.rayDesc}><span style={{ color: '#4CAF50' }}>P₃P₄</span> 确定出射光线</div>
            <div style={styles.rayDesc}>移去玻璃砖后连线测量角度</div>
            <div style={styles.rayDesc}>多次测量求平均值减小误差</div>
          </div>

          <div style={styles.panelSection}>
            <div style={styles.panelTitle}>🎯 操作</div>
            <div style={styles.hint}>↔ 拖拽光源改变入射角</div>
            <div style={styles.hint}>↕ 拖拽入射点改变位置</div>
            <div style={styles.hint}>拖动滑块调整折射率</div>
          </div>
        </div>
      </div>

      <div style={styles.statusBar}>
        <span style={{ color: result ? '#4CAF50' : '#484f58' }}>
          {result ? `n = ${result.nFromEntry.toFixed(3)} (${getMaterialName(n)})` : '调整光源角度开始实验'}
        </span>
        <span style={{ color: '#484f58', marginLeft: 'auto' }}>
          插针法 · 平行玻璃砖 · 斯涅尔定律
        </span>
      </div>
    </div>
  )
}

function DataRow({ label, value, color }) {
  return (
    <div style={styles.dataRow}>
      <span style={styles.dataLabel}>{label}</span>
      <span style={{ ...styles.dataValue, color }}>{value}</span>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex', flexDirection: 'column', height: '100vh',
    background: '#0d1117', color: '#c9d1d9',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  toolbar: {
    height: 44, background: '#161b22', borderBottom: '1px solid #30363d',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 16px', flexShrink: 0,
  },
  title: { fontSize: 15, fontWeight: 600, color: '#c9d1d9' },
  toolbarActions: { display: 'flex', alignItems: 'center', gap: 12 },
  sliderLabel: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#8b949e' },
  slider: { width: 100, accentColor: '#4a90d9' },
  sliderValue: { color: '#4a90d9', fontWeight: 600, minWidth: 36 },
  materialTag: {
    fontSize: 11, color: '#4FC3F7', background: 'rgba(79, 195, 247, 0.1)',
    padding: '2px 8px', borderRadius: 4,
  },
  main: { flex: 1, display: 'flex', overflow: 'hidden' },
  canvas: { flex: 1, width: '100%' },
  panel: {
    width: 250, background: '#161b22', borderLeft: '1px solid #30363d',
    overflowY: 'auto', flexShrink: 0, padding: 0,
  },
  panelSection: { padding: '10px 14px', borderBottom: '1px solid #21262d' },
  panelTitle: { fontSize: 13, fontWeight: 600, color: '#c9d1d9', marginBottom: 6 },
  formula: { textAlign: 'center', margin: '4px 0' },
  formulaMain: {
    fontSize: 16, fontWeight: 700, color: '#4a90d9',
    fontFamily: 'Georgia, "Times New Roman", serif', letterSpacing: 1,
  },
  dataRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0', fontSize: 11 },
  dataLabel: { color: '#8b949e' },
  dataValue: { fontWeight: 600, fontFamily: 'monospace', fontSize: 12 },
  ruleItem: { fontSize: 12, color: '#c9d1d9', padding: '3px 0', lineHeight: 1.4 },
  rayDesc: { fontSize: 11, color: '#8b949e', padding: '2px 0' },
  hint: { fontSize: 11, color: '#484f58', padding: '2px 0' },
  statusBar: {
    height: 24, background: '#161b22', borderTop: '1px solid #30363d',
    display: 'flex', alignItems: 'center', gap: 20,
    padding: '0 14px', fontSize: 11, color: '#484f58', flexShrink: 0,
  },
}
