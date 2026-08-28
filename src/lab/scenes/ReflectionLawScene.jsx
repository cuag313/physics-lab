import { useRef, useEffect, useState, useCallback } from 'react'
import { PhysicsScene } from '../core/PhysicsScene'
import { SceneRenderer } from '../renderers/SceneRenderer'
import { PlaneMirrorInst, LightSource } from '../instruments'

/**
 * ReflectionLawScene — 光的反射定律实验
 *
 * 规则：
 * - 可拖拽光源改变入射方向
 * - 可拖拽平面镜改变角度（旋转）
 * - 实时显示入射角 θi 和反射角 θr
 * - 验证：θi = θr（反射定律）
 * - 显示法线、入射光线、反射光线、角度弧线
 */
export default function ReflectionLawScene({ preset }) {
  const canvasRef = useRef(null)
  const sceneRef = useRef(null)
  const rendererRef = useRef(null)
  const animRef = useRef(null)
  const angleDataRef = useRef(null)  // 渲染循环用ref，避免闭包陈旧

  const [angleData, setAngleData] = useState(null)
  const [mirrorAngle, setMirrorAngle] = useState(preset?.mirrorAngle ?? 90)

  const interactionRef = useRef({
    mode: 'idle',
    dragTarget: null,
    dragType: null,   // 'move' | 'rotate'
    dragOffset: { x: 0, y: 0 },
    startAngle: 0,
  })
  const [cursor, setCursor] = useState('default')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const scene = new PhysicsScene()
    const renderer = new SceneRenderer(canvas)
    sceneRef.current = scene
    rendererRef.current = renderer
    renderer.resize()

    setupScene(scene, mirrorAngle)
    computeReflection(scene)

    scene.start()

    const renderLoop = () => {
      renderFrame(scene, renderer, interactionRef.current)
      animRef.current = requestAnimationFrame(renderLoop)
    }
    renderLoop()

    const handleResize = () => renderer.resize()
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      if (animRef.current) cancelAnimationFrame(animRef.current)
      scene.stop()
    }
  }, [])

  // 镜面角度变化
  const handleMirrorAngleChange = useCallback((newAngle) => {
    setMirrorAngle(newAngle)
    const scene = sceneRef.current
    if (!scene) return
    const mirror = scene.instruments.find(i => i.type === 'planeMirror')
    if (mirror) {
      mirror.setParam('angle', newAngle)
      computeReflection(scene)
    }
  }, [])

  function setupScene(scene, mAngle) {
    // 光源
    const light = new LightSource(-4, 3)
    light.setParam('direction', -50)
    light.setParam('spread', 8)
    light.setParam('rayCount', 3)
    light.setParam('direction', -50)
    scene.addInstrument(light)

    // 平面镜
    const mirror = new PlaneMirrorInst(0, 0)
    mirror.setParam('angle', mAngle)
    scene.addInstrument(mirror)
  }

  // ========== 反射计算 ==========
  function computeReflection(scene) {
    const light = scene.instruments.find(i => i.type === 'lightSource')
    const mirror = scene.instruments.find(i => i.type === 'planeMirror')
    if (!light || !mirror) { setAngleData(null); return }

    const mx = mirror.x
    const my = mirror.y
    const alpha = mirror.getParam('angle') * Math.PI / 180
    const mLen = mirror.height  // mirror "length" in 2D

    // 镜面方向和法线
    const mDirX = Math.sin(alpha)
    const mDirY = Math.cos(alpha)
    // 法线：取(-cos α, sin α)方向（默认指向左侧/上方）
    const nx = -Math.cos(alpha)
    const ny = Math.sin(alpha)

    // 光源
    const sx = light.x
    const sy = light.y
    const dirAngle = light.getParam('direction') * Math.PI / 180
    const dx = Math.cos(dirAngle)
    const dy = Math.sin(dirAngle)

    // 求光线与镜面交点
    // Ray: P = S + t * d
    // Mirror: Q = M + s * mDir, |s| <= mLen/2
    const cross_dm = dx * mDirY - dy * mDirX
    if (Math.abs(cross_dm) < 1e-10) { setAngleData(null); return }

    const rx = mx - sx
    const ry = my - sy
    const t = (rx * mDirY - ry * mDirX) / cross_dm
    const s = (rx * dy - ry * dx) / cross_dm

    if (t < 0.01 || Math.abs(s) > mLen / 2) { setAngleData(null); angleDataRef.current = null; return }

    const hitX = sx + dx * t
    const hitY = sy + dy * t

    // 入射角和反射角
    const dot_in = dx * nx + dy * ny
    const thetaI = Math.acos(Math.abs(dot_in)) * 180 / Math.PI

    // 反射方向
    const rdx = dx - 2 * dot_in * nx
    const rdy = dy - 2 * dot_in * ny

    const thetaR = thetaI  // 反射定律

    const data = {
      hitX, hitY,
      nx, ny,        // 法线方向
      dx, dy,        // 入射方向
      rdx, rdy,      // 反射方向
      thetaI,
      thetaR,
      sx, sy,        // 光源位置
      mDirX, mDirY,  // 镜面方向
      mx, my,        // 镜面中心
      alpha,
    }
    angleDataRef.current = data
    setAngleData(data)
  }

  // ========== 渲染帧 ==========
  function renderFrame(scene, renderer, interaction) {
    const ctx = renderer.ctx
    renderer.clear()
    drawBg(ctx, renderer)
    drawMirrorSurface(ctx, renderer, scene)
    if (angleDataRef.current) drawReflection(ctx, renderer, angleDataRef.current)
    drawLabels(ctx, renderer, scene)

    for (const inst of scene.instruments) {
      if (!inst.visible) continue
      const isDragging = interaction.mode === 'dragging' && inst === interaction.dragTarget
      if (isDragging) {
        ctx.save()
        ctx.globalAlpha = 0.7
        ctx.shadowColor = 'rgba(79, 195, 247, 0.5)'
        ctx.shadowBlur = 16
      }
      inst.render(ctx, renderer)
      if (isDragging) ctx.restore()
    }
    drawDescription(ctx, renderer, angleDataRef.current)
  }

  function drawBg(ctx, renderer) {
    const [ox, oy] = renderer.worldToScreen(0, 0)
    const w = renderer.screenW
    const h = renderer.screenH

    // 主轴
    ctx.strokeStyle = 'rgba(100, 180, 255, 0.15)'
    ctx.lineWidth = 1
    ctx.setLineDash([10, 5])
    ctx.beginPath()
    ctx.moveTo(0, oy)
    ctx.lineTo(w, oy)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(ox, 0)
    ctx.lineTo(ox, h)
    ctx.stroke()
    ctx.setLineDash([])

    // 刻度
    const scale = renderer.scale
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.font = '10px monospace'
    const startX = Math.floor(-renderer.offsetX / scale)
    const endX = Math.ceil((w - renderer.offsetX) / scale)
    for (let wx = startX; wx <= endX; wx++) {
      const [sx] = renderer.worldToScreen(wx, 0)
      ctx.strokeStyle = 'rgba(100, 180, 255, 0.2)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(sx, oy - 8)
      ctx.lineTo(sx, oy + 8)
      ctx.stroke()
      if (wx !== 0) {
        ctx.fillStyle = 'rgba(100, 180, 255, 0.3)'
        ctx.fillText(`${wx}m`, sx, oy + 10)
      }
    }
  }

  // 绘制镜面（增强版，带反射面高光）
  function drawMirrorSurface(ctx, renderer, scene) {
    const mirror = scene.instruments.find(i => i.type === 'planeMirror')
    if (!mirror) return

    const [sx, sy] = renderer.worldToScreen(mirror.x, mirror.y)
    const alpha = mirror.getParam('angle') * Math.PI / 180
    const halfLen = mirror.height * renderer.scale / 2

    const dx = Math.sin(alpha) * halfLen
    const dy = Math.cos(alpha) * halfLen

    // 镜面线段
    const x1 = sx + dx
    const y1 = sy - dy
    const x2 = sx - dx
    const y2 = sy + dy

    // 反射面（正面，高光）
    const grad = ctx.createLinearGradient(x1, y1, x2, y2)
    grad.addColorStop(0, 'rgba(200, 200, 220, 0.3)')
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.6)')
    grad.addColorStop(1, 'rgba(200, 200, 220, 0.3)')
    ctx.strokeStyle = grad
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()

    // 背面（斜线阴影）
    const backNx = -Math.cos(alpha) * 5
    const backNy = Math.sin(alpha) * 5
    ctx.strokeStyle = 'rgba(100, 100, 100, 0.4)'
    ctx.lineWidth = 1
    for (let i = -halfLen; i < halfLen; i += 6) {
      const px = sx + Math.sin(alpha) * i
      const py = sy - Math.cos(alpha) * i
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(px + backNx, py - backNy)
      ctx.stroke()
    }

    // 镜面边框
    ctx.strokeStyle = '#aaa'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }

  // 绘制反射光路
  function drawReflection(ctx, renderer, data) {
    const { hitX, hitY, nx, ny, dx, dy, rdx, rdy, thetaI, thetaR, sx, sy } = data
    const [hx, hy] = renderer.worldToScreen(hitX, hitY)

    // ===== 法线（蓝色虚线）=====
    const nLen = 120
    ctx.strokeStyle = 'rgba(79, 195, 247, 0.6)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(hx - nx * nLen, hy + ny * nLen)
    ctx.lineTo(hx + nx * nLen, hy - ny * nLen)
    ctx.stroke()
    ctx.setLineDash([])

    // 法线标签
    ctx.fillStyle = 'rgba(79, 195, 247, 0.8)'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    const nlx = hx + nx * (nLen + 14)
    const nly = hy - ny * (nLen + 14)
    ctx.fillText('法线', nlx, nly)

    // ===== 入射光线（黄色）=====
    drawRayGlow(ctx, renderer, { x: sx, y: sy }, { x: hitX, y: hitY }, '#FFD700', 0.9)

    // ===== 反射光线（绿色）=====
    const reflectFar = { x: hitX + rdx * 40, y: hitY + rdy * 40 }
    drawRayGlow(ctx, renderer, { x: hitX, y: hitY }, reflectFar, '#4CAF50', 0.8)

    // ===== 入射角弧线 =====
    drawAngleArc(ctx, renderer, hitX, hitY, dx, dy, -nx, ny, thetaI, '#FFD700', 'θi')

    // ===== 反射角弧线 =====
    drawAngleArc(ctx, renderer, hitX, hitY, rdx, rdy, -nx, ny, thetaR, '#4CAF50', 'θr')

    // ===== 交点标记 =====
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(hx, hy, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#4FC3F7'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(hx, hy, 5, 0, Math.PI * 2)
    ctx.stroke()

    // 入射点标签
    ctx.fillStyle = '#8b949e'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('入射点', hx + 10, hy - 10)
  }

  // 绘制角度弧线
  function drawAngleArc(ctx, renderer, cx, cy, rayDx, rayDy, refDx, refDy, angleDeg, color, label) {
    const [scx, scy] = renderer.worldToScreen(cx, cy)
    const r = 40  // 弧线半径

    // 计算两个方向的屏幕角度
    // 注意：屏幕y轴翻转
    const rayAngle = Math.atan2(-rayDy, rayDx)
    const refAngle = Math.atan2(-refDy, refDx)

    // 弧线（取较小的角度差）
    let startAngle = refAngle
    let endAngle = rayAngle
    // 确保是逆时针方向的较小弧
    let diff = endAngle - startAngle
    while (diff > Math.PI) diff -= 2 * Math.PI
    while (diff < -Math.PI) diff += 2 * Math.PI

    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.globalAlpha = 0.7
    ctx.beginPath()
    if (diff > 0) {
      ctx.arc(scx, scy, r, startAngle, endAngle)
    } else {
      ctx.arc(scx, scy, r, endAngle, startAngle)
    }
    ctx.stroke()
    ctx.globalAlpha = 1

    // 填充半透明扇形
    ctx.fillStyle = color
    ctx.globalAlpha = 0.1
    ctx.beginPath()
    ctx.moveTo(scx, scy)
    if (diff > 0) {
      ctx.arc(scx, scy, r, startAngle, endAngle)
    } else {
      ctx.arc(scx, scy, r, endAngle, startAngle)
    }
    ctx.closePath()
    ctx.fill()
    ctx.globalAlpha = 1

    // 角度标签
    const midAngle = diff > 0 ? (startAngle + endAngle) / 2 : (endAngle + startAngle) / 2
    const labelR = r + 16
    const lx = scx + Math.cos(midAngle) * labelR
    const ly = scy + Math.sin(midAngle) * labelR
    ctx.fillStyle = color
    ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${label}=${angleDeg.toFixed(1)}°`, lx, ly)
  }

  // 光线发光效果
  function drawRayGlow(ctx, renderer, from, to, color, alpha) {
    const [x1, y1] = renderer.worldToScreen(from.x, from.y)
    const [x2, y2] = renderer.worldToScreen(to.x, to.y)

    ctx.strokeStyle = color
    ctx.lineWidth = 5
    ctx.globalAlpha = alpha * 0.12
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    ctx.lineWidth = 3
    ctx.globalAlpha = alpha * 0.3
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    ctx.lineWidth = 1.5
    ctx.globalAlpha = alpha * 0.85
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    ctx.globalAlpha = 1

    // 箭头
    const angle = Math.atan2(y2 - y1, x2 - x1)
    const arrowLen = 10
    ctx.fillStyle = color
    ctx.globalAlpha = alpha * 0.85
    ctx.beginPath()
    ctx.moveTo(x2, y2)
    ctx.lineTo(x2 - arrowLen * Math.cos(angle - 0.3), y2 - arrowLen * Math.sin(angle - 0.3))
    ctx.lineTo(x2 - arrowLen * Math.cos(angle + 0.3), y2 - arrowLen * Math.sin(angle + 0.3))
    ctx.closePath()
    ctx.fill()
    ctx.globalAlpha = 1
  }

  // 绘制文字说明
  function drawDescription(ctx, renderer, data) {
    const x = 16
    let y = 20

    ctx.textBaseline = 'top'

    // 标题
    ctx.fillStyle = '#c9d1d9'
    ctx.font = 'bold 16px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('光的反射定律', x, y)
    y += 28

    // 公式
    ctx.fillStyle = '#4FC3F7'
    ctx.font = 'bold 14px serif'
    ctx.fillText('反射角 = 入射角  θi = θr', x, y)
    y += 24

    // 三要点
    ctx.fillStyle = '#8b949e'
    ctx.font = '12px sans-serif'
    const points = [
      '① 反射角等于入射角',
      '② 入射光线、反射光线分居法线两侧',
      '③ 入射光线、法线、反射光线在同一平面',
    ]
    for (const p of points) {
      ctx.fillText(p, x, y)
      y += 18
    }

    // 实时数据
    if (data) {
      y += 6
      ctx.fillStyle = '#FFD700'
      ctx.font = 'bold 12px sans-serif'
      ctx.fillText(`θi = ${data.thetaI.toFixed(1)}°`, x, y)
      y += 18
      ctx.fillStyle = '#4CAF50'
      ctx.fillText(`θr = ${data.thetaR.toFixed(1)}°`, x, y)
      y += 18
      const diff = Math.abs(data.thetaI - data.thetaR)
      ctx.fillStyle = diff < 0.5 ? '#4CAF50' : '#FF9800'
      ctx.font = '11px sans-serif'
      ctx.fillText(`|θi - θr| = ${diff.toFixed(2)}°`, x, y)
    }
  }

  // 标注
  function drawLabels(ctx, renderer, scene) {
    const light = scene.instruments.find(i => i.type === 'lightSource')
    const mirror = scene.instruments.find(i => i.type === 'planeMirror')
    if (!light || !mirror) return

    // 入射光线标签
    if (angleDataRef.current) {
      const data = angleDataRef.current
      const [lx, ly] = renderer.worldToScreen(light.x, light.y)
      ctx.fillStyle = '#FFD700'
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('入射光线', lx, ly - 30)

      // 反射光线标签
      const rx = data.hitX + data.rdx * 3
      const ry = data.hitY + data.rdy * 3
      const [srx, sry] = renderer.worldToScreen(rx, ry)
      ctx.fillStyle = '#4CAF50'
      ctx.fillText('反射光线', srx, sry - 15)
    }

    // 镜面角度标签
    const [mx, my] = renderer.worldToScreen(mirror.x, mirror.y)
    ctx.fillStyle = '#8b949e'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`镜面角度: ${mirror.getParam('angle')}°`, mx, my + mirror.height * renderer.scale / 2 + 30)
  }

  // ========== 鼠标交互 ==========
  const handleMouseDown = useCallback((e) => {
    const scene = sceneRef.current
    const renderer = rendererRef.current
    if (!scene || !renderer) return

    const rect = canvasRef.current.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const [wx, wy] = renderer.screenToWorld(sx, sy)
    const interaction = interactionRef.current

    if (e.button === 2) { e.preventDefault(); return }

    // 优先检测镜面中心附近的旋转拖拽
    const mirror = scene.instruments.find(i => i.type === 'planeMirror')
    if (mirror) {
      const [mx, my] = renderer.worldToScreen(mirror.x, mirror.y)
      const dist = Math.sqrt((sx - mx) ** 2 + (sy - my) ** 2)
      if (dist < 30) {
        // 靠近镜面中心 → 旋转模式
        scene.selectInstrument(mirror)
        interaction.mode = 'dragging'
        interaction.dragTarget = mirror
        interaction.dragType = 'rotate'
        interaction.startAngle = mirror.getParam('angle')
        const [mwx, mwy] = renderer.screenToWorld(mx, my)
        interaction.dragOffset = { x: wx - mwx, y: wy - mwy }
        setCursor('crosshair')
        return
      }
    }

    // 检测光源拖拽
    const inst = scene.getInstrumentAt(wx, wy)
    if (inst && inst.type === 'lightSource') {
      scene.selectInstrument(inst)
      interaction.mode = 'dragging'
      interaction.dragTarget = inst
      interaction.dragType = 'move'
      interaction.dragOffset = { x: wx - inst.x, y: wy - inst.y }
      setCursor('grabbing')
    }
  }, [])

  const handleMouseMove = useCallback((e) => {
    const renderer = rendererRef.current
    const scene = sceneRef.current
    if (!renderer || !scene) return

    const rect = canvasRef.current.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const [wx, wy] = renderer.screenToWorld(sx, sy)
    const interaction = interactionRef.current

    if (interaction.mode === 'dragging' && interaction.dragTarget) {
      const inst = interaction.dragTarget

      if (interaction.dragType === 'move' && inst.type === 'lightSource') {
        inst.x = wx - interaction.dragOffset.x
        inst.y = wy - interaction.dragOffset.y
        // 更新光源方向：指向镜面中心
        const mirror = scene.instruments.find(i => i.type === 'planeMirror')
        if (mirror) {
          const dx = mirror.x - inst.x
          const dy = mirror.y - inst.y
          const angle = Math.atan2(dy, dx) * 180 / Math.PI
          inst.setParam('direction', angle)
        }
        computeReflection(scene)
      } else if (interaction.dragType === 'rotate' && inst.type === 'planeMirror') {
        // 旋转镜面
        const [mx, my] = renderer.worldToScreen(inst.x, inst.y)
        const angle = Math.atan2(sy - my, sx - mx) * 180 / Math.PI
        // 将鼠标角度映射到镜面角度
        const newAngle = ((angle % 360) + 360) % 360
        // 限制在 10-170 度之间（避免平行于光线）
        const clamped = Math.max(10, Math.min(170, newAngle))
        inst.setParam('angle', clamped)
        setMirrorAngle(clamped)
        computeReflection(scene)
      }
      return
    }

    // 空闲：检测悬停
    const mirror = scene.instruments.find(i => i.type === 'planeMirror')
    if (mirror) {
      const [mx, my] = renderer.worldToScreen(mirror.x, mirror.y)
      const dist = Math.sqrt((sx - mx) ** 2 + (sy - my) ** 2)
      if (dist < 30) { setCursor('crosshair'); return }
    }
    const inst = scene.getInstrumentAt(wx, wy)
    setCursor(inst && inst.type === 'lightSource' ? 'grab' : 'default')
  }, [])

  const handleMouseUp = useCallback(() => {
    const interaction = interactionRef.current
    if (interaction.mode === 'dragging') {
      interaction.mode = 'idle'
      interaction.dragTarget = null
      setCursor('default')
    }
  }, [])

  const handleContextMenu = useCallback((e) => e.preventDefault(), [])

  // ========== 规律文本 ==========
  function getRuleText(data) {
    if (!data) return { text: '调整光源和镜面角度观察反射', color: '#484f58' }
    const diff = Math.abs(data.thetaI - data.thetaR)
    if (diff < 0.5) return {
      text: `反射定律验证：θi = θr = ${data.thetaI.toFixed(1)}°`,
      color: '#4CAF50',
      detail: `入射角 ≈ 反射角，差值 ${diff.toFixed(2)}°`,
    }
    return {
      text: `θi=${data.thetaI.toFixed(1)}°，θr=${data.thetaR.toFixed(1)}°`,
      color: '#FF9800',
    }
  }

  const rule = getRuleText(angleData)

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <span style={styles.title}>🔬 光的反射定律</span>
        <div style={styles.toolbarActions}>
          <label style={styles.sliderLabel}>
            镜面角度 =
            <input type="range" min="10" max="170" step="1"
              value={mirrorAngle}
              onChange={(e) => handleMirrorAngleChange(parseFloat(e.target.value))}
              style={styles.slider}
            />
            <span style={styles.sliderValue}>{mirrorAngle}°</span>
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
            <div style={styles.panelTitle}>📐 反射定律</div>
            <div style={styles.formula}>
              <span style={styles.formulaMain}>θi = θr</span>
            </div>
            <div style={styles.formulaSub}>反射角等于入射角</div>
          </div>

          <div style={styles.panelSection}>
            <div style={styles.panelTitle}>📊 实时数据</div>
            <DataRow label="入射角 θi" value={angleData ? `${angleData.thetaI.toFixed(1)}°` : '—'} color="#FFD700" />
            <DataRow label="反射角 θr" value={angleData ? `${angleData.thetaR.toFixed(1)}°` : '—'} color="#4CAF50" />
            <DataRow label="差值 |θi-θr|" value={angleData ? `${Math.abs(angleData.thetaI - angleData.thetaR).toFixed(2)}°` : '—'} color="#4FC3F7" />
            <DataRow label="镜面角度" value={`${mirrorAngle}°`} color="#8b949e" />
          </div>

          <div style={styles.panelSection}>
            <div style={styles.panelTitle}>📋 规律验证</div>
            <div style={{ ...styles.ruleText, color: rule.color }}>{rule.text}</div>
            {rule.detail && <div style={styles.ruleDetail}>{rule.detail}</div>}
          </div>

          <div style={styles.panelSection}>
            <div style={styles.panelTitle}>💡 反射定律要点</div>
            <div style={styles.rayDesc}><span style={{ color: '#FFD700' }}>①</span> 反射角等于入射角</div>
            <div style={styles.rayDesc}><span style={{ color: '#4CAF50' }}>②</span> 入射光线、反射光线分居法线两侧</div>
            <div style={styles.rayDesc}><span style={{ color: '#4FC3F7' }}>③</span> 入射光线、法线、反射光线在同一平面</div>
          </div>

          <div style={styles.panelSection}>
            <div style={styles.panelTitle}>🎯 操作</div>
            <div style={styles.hint}>↔ 拖拽光源改变入射角</div>
            <div style={styles.hint}>↻ 拖拽镜面中心旋转镜面</div>
            <div style={styles.hint}>拖动滑块精确调整镜面角度</div>
          </div>
        </div>
      </div>

      <div style={styles.statusBar}>
        <span style={{ color: rule.color }}>{rule.text}</span>
        <span style={{ color: '#484f58', marginLeft: 'auto' }}>
          反射定律 · θi=θr · 法线居中
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
  slider: { width: 120, accentColor: '#4FC3F7' },
  sliderValue: { color: '#4FC3F7', fontWeight: 600, minWidth: 40 },
  main: { flex: 1, display: 'flex', overflow: 'hidden' },
  canvas: { flex: 1, width: '100%' },
  panel: {
    width: 240, background: '#161b22', borderLeft: '1px solid #30363d',
    overflowY: 'auto', flexShrink: 0, padding: 0,
  },
  panelSection: { padding: '12px 14px', borderBottom: '1px solid #21262d' },
  panelTitle: { fontSize: 13, fontWeight: 600, color: '#c9d1d9', marginBottom: 8 },
  formula: { textAlign: 'center', margin: '6px 0' },
  formulaMain: {
    fontSize: 22, fontWeight: 700, color: '#4FC3F7',
    fontFamily: 'Georgia, "Times New Roman", serif', letterSpacing: 1,
  },
  formulaSub: { textAlign: 'center', fontSize: 12, color: '#8b949e', marginTop: 4 },
  dataRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: 12 },
  dataLabel: { color: '#8b949e' },
  dataValue: { fontWeight: 600, fontFamily: 'monospace', fontSize: 13 },
  ruleText: { fontSize: 13, fontWeight: 600, lineHeight: 1.4 },
  ruleDetail: { fontSize: 11, color: '#8b949e', marginTop: 4, lineHeight: 1.4 },
  rayDesc: { fontSize: 12, color: '#8b949e', padding: '2px 0' },
  hint: { fontSize: 11, color: '#484f58', padding: '2px 0' },
  statusBar: {
    height: 24, background: '#161b22', borderTop: '1px solid #30363d',
    display: 'flex', alignItems: 'center', gap: 20,
    padding: '0 14px', fontSize: 11, color: '#484f58', flexShrink: 0,
  },
}
