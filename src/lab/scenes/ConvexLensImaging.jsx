import { useRef, useEffect, useState, useCallback } from 'react'
import { PhysicsScene } from '../core/PhysicsScene'
import { SceneRenderer } from '../renderers/SceneRenderer'
import {
  ObjectArrow, ConvexLens, ScreenInst, ImageArrow
} from '../instruments'

/**
 * ConvexLensImaging — 凸透镜成像规律实验 v2
 *
 * 规则：
 * - 只拖拽光源和凸透镜，光屏和像自动生成
 * - 只画两条特殊光线（平行轴过F'、过F平行轴）
 * - 两光线交点 = 像的位置（火焰）
 * - 光屏始终跟随像的位置
 * - u + v 满足 1/u + 1/v = 1/f
 */
export default function ConvexLensImaging({ preset }) {
  const canvasRef = useRef(null)
  const sceneRef = useRef(null)
  const rendererRef = useRef(null)
  const animRef = useRef(null)

  const [imageResult, setImageResult] = useState(null)
  const [focalLength, setFocalLength] = useState(preset?.focalLength ?? 1.0)

  const interactionRef = useRef({
    mode: 'idle',
    dragTarget: null,
    dragOffset: { x: 0, y: 0 },
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

    setupOpticalBench(scene, focalLength)
    syncImage(scene)

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

  // 焦距变化
  const handleFocalLengthChange = useCallback((newF) => {
    setFocalLength(newF)
    const scene = sceneRef.current
    if (!scene) return
    const lens = scene.instruments.find(i => i.type === 'convexLens')
    if (lens) {
      lens.setParam('focalLength', newF)
      scene.rebuildOptics()
      syncImage(scene)
    }
  }, [])

  // 设置光具座：物体 + 透镜（光屏和像由光学引擎自动生成）
  function setupOpticalBench(scene, f) {
    const obj = new ObjectArrow(-3, 0)
    obj.setParam('objectHeight', 0.8)
    scene.addInstrument(obj)

    const lens = new ConvexLens(0, 0)
    lens.setParam('focalLength', f)
    scene.addInstrument(lens)

    // 光屏（位置由像决定，初始放右侧）
    const screen = new ScreenInst(2, 0)
    scene.addInstrument(screen)

    // 像箭头
    const img = new ImageArrow(1.5, 0)
    scene.addInstrument(img)

    scene.rebuildOptics()
  }

  // 严格透镜公式计算像
  function calcImage(scene) {
    const obj = scene.instruments.find(i => i.type === 'objectArrow')
    const lens = scene.instruments.find(i => i.type === 'convexLens')
    if (!obj || !lens) return null
    const h = obj.getParam('objectHeight')
    const u = lens.x - obj.x
    const f = lens.getParam('focalLength')
    if (u < 0.01) return null
    // u = f：无像
    if (Math.abs(u - f) < 0.01) return null
    const v = (u * f) / (u - f)
    const m = -v / u
    return {
      imgX: lens.x + v,
      imgY: h * m,
      v, m, u, f, h,
      isReal: v > 0,
      imageDistance: v,
      objectDistance: u,
      height: h * m,
      magnification: m,
    }
  }

  // 同步：更新光屏和像的位置
  function syncImage(scene) {
    const result = calcImage(scene)
    setImageResult(result)
    const screen = scene.instruments.find(i => i.type === 'screen')
    const img = scene.instruments.find(i => i.type === 'imageArrow')
    if (result) {
      if (result.isReal) {
        // 实像：光屏在像的位置
        if (screen) { screen.x = result.imgX; screen.visible = true }
      } else {
        // 虚像：隐藏光屏（虚像无法用光屏承接）
        if (screen) screen.visible = false
      }
      if (img) {
        img.x = result.imgX
        img.y = 0
        img.setImageProps({
          isReal: result.isReal,
          height: result.height,
          magnification: result.magnification,
          visible: true,
        })
      }
    } else {
      // u=f：无像，隐藏像和光屏
      if (img) img.setImageProps({ visible: false })
      if (screen) screen.visible = false
    }
  }

  // ========== 渲染帧 ==========
  function renderFrame(scene, renderer, interaction) {
    const ctx = renderer.ctx
    renderer.clear()

    drawOpticalBenchBg(ctx, renderer)

    // 渲染两条特殊光线
    const rays = scene.getOpticsRays?.() ?? []
    drawTwoSpecialRays(ctx, renderer, rays, scene)

    // 渲染仪器
    for (const inst of scene.instruments) {
      if (!inst.visible || inst.type === 'wire') continue
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

    // 渲染光屏上的像（光斑）—— 用严格公式计算的位置
    const img = calcImage(scene)
    if (img) {
      const [px, py] = renderer.worldToScreen(img.imgX, img.imgY)
      const glow = ctx.createRadialGradient(px, py, 0, px, py, 14)
      glow.addColorStop(0, 'rgba(255, 220, 100, 0.95)')
      glow.addColorStop(0.4, 'rgba(255, 180, 50, 0.6)')
      glow.addColorStop(1, 'rgba(255, 150, 0, 0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(px, py, 14, 0, Math.PI * 2)
      ctx.fill()
    }

    // 标注 u 和 v
    drawUVLabels(ctx, scene, renderer)

    // 文字说明
    drawDescription(ctx, scene, renderer)
  }

  // 绘制文字说明
  function drawDescription(ctx, scene, renderer) {
    const result = calcImage(scene)
    const lens = scene.instruments.find(i => i.type === 'convexLens')
    const f = lens ? lens.getParam('focalLength') : 1.0

    const x = 16
    let y = 20
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'

    // 标题
    ctx.fillStyle = '#c9d1d9'
    ctx.font = 'bold 16px sans-serif'
    ctx.fillText('凸透镜成像规律', x, y)
    y += 28

    // 公式
    ctx.fillStyle = '#4a90d9'
    ctx.font = 'bold 14px serif'
    ctx.fillText('1/u + 1/v = 1/f', x, y)
    y += 20
    ctx.fillText('m = -v/u', x, y)
    y += 26

    // 成像规律
    ctx.fillStyle = '#8b949e'
    ctx.font = '12px sans-serif'
    const rules = [
      'u > 2f：倒立缩小实像，f < v < 2f',
      'u = 2f：倒立等大实像，v = 2f',
      'f < u < 2f：倒立放大实像，v > 2f',
      'u = f：不成像（折射光平行）',
      'u < f：正立放大虚像（同侧）',
    ]
    for (const r of rules) {
      ctx.fillText(r, x, y)
      y += 17
    }

    // 当前状态
    if (result) {
      y += 6
      const rule = getImageRuleText(result, f)
      ctx.fillStyle = rule.color
      ctx.font = 'bold 12px sans-serif'
      ctx.fillText(rule.text, x, y)
      y += 18
      ctx.fillStyle = '#FFD700'
      ctx.font = '11px sans-serif'
      ctx.fillText(`u = ${result.objectDistance.toFixed(2)}m  v = ${Math.abs(result.imageDistance).toFixed(2)}m  m = ${Math.abs(result.magnification).toFixed(2)}`, x, y)
    }
  }

  // ========== 光具座背景 ==========
  function drawOpticalBenchBg(ctx, renderer) {
    const [ox, oy] = renderer.worldToScreen(0, 0)
    const w = renderer.screenW

    // 主轴（中心轴）
    ctx.strokeStyle = 'rgba(100, 180, 255, 0.2)'
    ctx.lineWidth = 1
    ctx.setLineDash([10, 5])
    ctx.beginPath()
    ctx.moveTo(0, oy)
    ctx.lineTo(w, oy)
    ctx.stroke()
    ctx.setLineDash([])

    // 刻度
    const scale = renderer.scale
    const startWX = Math.floor(-renderer.offsetX / scale)
    const endWX = Math.ceil((w - renderer.offsetX) / scale)

    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (let wx = startWX; wx <= endWX; wx++) {
      const [sx] = renderer.worldToScreen(wx, 0)
      const tickH = 10
      ctx.strokeStyle = 'rgba(100, 180, 255, 0.25)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(sx, oy - tickH)
      ctx.lineTo(sx, oy + tickH)
      ctx.stroke()

      if (wx !== 0) {
        ctx.fillStyle = 'rgba(100, 180, 255, 0.35)'
        ctx.font = '10px monospace'
        ctx.fillText(`${wx}m`, sx, oy + 12)
      }
    }

    // 光具座底座
    const benchY = oy + 28
    ctx.strokeStyle = '#30363d'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(20, benchY)
    ctx.lineTo(w - 20, benchY)
    ctx.stroke()
  }

  // ========== 两条特殊光线 + 三分支成像逻辑 ==========
  function drawTwoSpecialRays(ctx, renderer, rays, scene) {
    const obj = scene.instruments.find(i => i.type === 'objectArrow')
    const lens = scene.instruments.find(i => i.type === 'convexLens')
    if (!obj || !lens) return null

    const h = obj.getParam('objectHeight')
    const objX = obj.x
    const lensX = lens.x
    const f = lens.getParam('focalLength')
    const u = lensX - objX
    if (u < 0.01) return null

    const slope1 = -h / f
    const slope2 = -h / u
    const FAR = 40
    const EPS = 0.01

    const objTop = { x: objX, y: h }
    const lensHit1 = { x: lensX, y: h }
    const lensO = { x: lensX, y: 0 }

    // 光线①入射段：火焰 平行主轴 到透镜
    drawRay(ctx, renderer, objTop, lensHit1, '#FFD700', 0.9)

    // 光线②：火焰 过光心O 方向不变（一条完整直线，不分段）
    drawRay(ctx, renderer, objTop, { x: lensX + FAR, y: slope2 * FAR }, '#2196F3', 0.6)

    // 标签
    const [labelX, labelY] = renderer.worldToScreen(objX, h)
    ctx.fillStyle = '#FFD700'
    ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText('\u2460', labelX - 12, labelY - 2)
    ctx.fillStyle = '#2196F3'
    ctx.fillText('\u2461', labelX - 12, labelY + 14)

    // ===== u > f：实像 =====
    if (u > f + EPS) {
      const v = (u * f) / (u - f)
      const imgX = lensX + v
      const imgY = -h * v / u

      drawRay(ctx, renderer, lensHit1, { x: lensX + FAR, y: h + slope1 * FAR }, '#FFD700', 0.8)

      const [ix, iy] = renderer.worldToScreen(imgX, imgY)
      ctx.strokeStyle = '#f44'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(ix, iy, 10, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = 'rgba(255, 68, 68, 0.25)'
      ctx.beginPath()
      ctx.arc(ix, iy, 10, 0, Math.PI * 2)
      ctx.fill()

      return { imgX, imgY, v, m: -v / u, isReal: true }
    }

    // ===== u = f：平行折射，无像 =====
    if (Math.abs(u - f) < EPS) {
      drawRay(ctx, renderer, lensHit1, { x: lensX + FAR, y: h + slope1 * FAR }, '#FFD700', 0.8)
      return null
    }

    // ===== u < f：虚像 =====
    const v = (u * f) / (u - f)
    const imgX = lensX + v
    const imgY = -h * v / u

    // 光线①折射段（实线，向右发散）
    drawRay(ctx, renderer, lensHit1, { x: lensX + FAR, y: h + slope1 * FAR }, '#FFD700', 0.6)

    // 反向延长线（虚线）
    const [i1x, i1y] = renderer.worldToScreen(imgX, imgY)
    const [l1x, l1y] = renderer.worldToScreen(lensX, h)
    const [o2x, o2y] = renderer.worldToScreen(lensX, 0)

    ctx.lineWidth = 1
    ctx.globalAlpha = 0.5
    ctx.setLineDash([5, 3])

    ctx.strokeStyle = '#FFD700'
    ctx.beginPath()
    ctx.moveTo(l1x, l1y)
    ctx.lineTo(i1x, i1y)
    ctx.stroke()

    ctx.strokeStyle = '#2196F3'
    ctx.beginPath()
    ctx.moveTo(o2x, o2y)
    ctx.lineTo(i1x, i1y)
    ctx.stroke()

    ctx.setLineDash([])
    ctx.globalAlpha = 1

    ctx.strokeStyle = '#4FC3F7'
    ctx.lineWidth = 2.5
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    ctx.arc(i1x, i1y, 10, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])

    return { imgX, imgY, v, m: -v / u, isReal: false }
  }

  // 绘制单条光线（带发光效果）
  function drawRay(ctx, renderer, from, to, color, alpha) {
    const [x1, y1] = renderer.worldToScreen(from.x, from.y)
    const [x2, y2] = renderer.worldToScreen(to.x, to.y)

    // 外层光晕
    ctx.strokeStyle = color
    ctx.lineWidth = 5
    ctx.globalAlpha = alpha * 0.12
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()

    // 中层
    ctx.lineWidth = 3
    ctx.globalAlpha = alpha * 0.3
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()

    // 核心
    ctx.globalAlpha = alpha * 0.85
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()

    ctx.globalAlpha = 1
  }

  // ========== u / v 标注 ==========
  function drawUVLabels(ctx, scene, renderer) {
    const obj = scene.instruments.find(i => i.type === 'objectArrow')
    const lens = scene.instruments.find(i => i.type === 'convexLens')
    const imgResult = calcImage(scene)
    if (!obj || !lens) return

    const [ox, oy] = renderer.worldToScreen(obj.x, 0)
    const [lx, ly] = renderer.worldToScreen(lens.x, 0)
    const f = lens.getParam('focalLength')
    const u = lens.x - obj.x

    // u 标注
    if (u > 0.3) {
      const midX = (ox + lx) / 2
      ctx.fillStyle = 'rgba(255, 107, 53, 0.8)'
      ctx.font = 'bold 13px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(`u = ${u.toFixed(2)}m`, midX, oy + 42)
      // 双箭头
      ctx.strokeStyle = 'rgba(255, 107, 53, 0.5)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(ox + 8, oy + 36)
      ctx.lineTo(lx - 8, oy + 36)
      ctx.stroke()
      drawArrowHead(ctx, ox + 8, oy + 36, 'right')
      drawArrowHead(ctx, lx - 8, oy + 36, 'left')
    }

    // F 和 2F 轴上标记（显著）
    const fPositions = [
      { x: lens.x - f, label: 'F', color: '#f44' },
      { x: lens.x + f, label: 'F', color: '#f44' },
      { x: lens.x - 2 * f, label: '2F', color: '#FF9800' },
      { x: lens.x + 2 * f, label: '2F', color: '#FF9800' },
    ]
    for (const fp of fPositions) {
      const [fx, fy] = renderer.worldToScreen(fp.x, 0)
      // 轴上三角形标记
      ctx.fillStyle = fp.color
      ctx.globalAlpha = 0.9
      ctx.beginPath()
      ctx.moveTo(fx, fy - 7)
      ctx.lineTo(fx - 5, fy + 3)
      ctx.lineTo(fx + 5, fy + 3)
      ctx.closePath()
      ctx.fill()
      ctx.globalAlpha = 1
      // 文字标签
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(fp.label, fx, fy - 12)
    }

    // v 标注（只在实像时）
    if (imgResult && imgResult.isReal) {
      const [ix, iy] = renderer.worldToScreen(imgResult.imgX, 0)
      const v = imgResult.v
      if (v > 0.3) {
        const midX = (lx + ix) / 2
        ctx.fillStyle = 'rgba(244, 67, 54, 0.8)'
        ctx.font = 'bold 13px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(`v = ${v.toFixed(2)}m`, midX, oy + 56)
        ctx.strokeStyle = 'rgba(244, 67, 54, 0.5)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(lx + 8, oy + 50)
        ctx.lineTo(ix - 8, oy + 50)
        ctx.stroke()
        drawArrowHead(ctx, lx + 8, oy + 50, 'right')
        drawArrowHead(ctx, ix - 8, oy + 50, 'left')
      }
    }

    // 虚像时：标注 v（同侧，负号）
    if (imgResult && !imgResult.isReal) {
      const [ix] = renderer.worldToScreen(imgResult.imgX, 0)
      const v = imgResult.v
      const vAbs = Math.abs(v)
      if (vAbs > 0.3) {
        const midX = (lx + ix) / 2
        ctx.fillStyle = 'rgba(79, 195, 247, 0.8)'
        ctx.font = 'bold 13px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(`v = ${v.toFixed(2)}m`, midX, oy + 56)
        ctx.strokeStyle = 'rgba(79, 195, 247, 0.5)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 3])
        ctx.beginPath()
        ctx.moveTo(ix + 8, oy + 50)
        ctx.lineTo(lx - 8, oy + 50)
        ctx.stroke()
        ctx.setLineDash([])
        drawArrowHead(ctx, ix + 8, oy + 50, 'right')
        drawArrowHead(ctx, lx - 8, oy + 50, 'left')
      }
    }
  }

  function drawArrowHead(ctx, x, y, dir) {
    const s = 5
    ctx.beginPath()
    if (dir === 'right') {
      ctx.moveTo(x, y); ctx.lineTo(x - s, y - s / 2); ctx.lineTo(x - s, y + s / 2)
    } else {
      ctx.moveTo(x, y); ctx.lineTo(x + s, y - s / 2); ctx.lineTo(x + s, y + s / 2)
    }
    ctx.closePath()
    ctx.fill()
  }

  // ========== 鼠标交互：只拖拽物体和透镜 ==========
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

    const inst = scene.getInstrumentAt(wx, wy)
    // 只允许拖拽物体和透镜
    if (inst && (inst.type === 'objectArrow' || inst.type === 'convexLens')) {
      scene.selectInstrument(inst)
      interaction.mode = 'dragging'
      interaction.dragTarget = inst
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
      const newX = wx - interaction.dragOffset.x

      if (inst.type === 'objectArrow') {
        // 物体只能在透镜左侧
        const lens = scene.instruments.find(i => i.type === 'convexLens')
        if (lens) inst.x = Math.min(newX, lens.x - 0.3)
      } else if (inst.type === 'convexLens') {
        // 透镜不能跑到物体左侧
        const obj = scene.instruments.find(i => i.type === 'objectArrow')
        if (obj) inst.x = Math.max(newX, obj.x + 0.3)
      }

      scene.rebuildOptics()
      syncImage(scene)
      return
    }

    // 空闲：检测悬停
    const inst = scene.getInstrumentAt(wx, wy)
    setCursor(inst && (inst.type === 'objectArrow' || inst.type === 'convexLens') ? 'grab' : 'default')
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

  // ========== 成像规律 ==========
  function getImageRuleText(result, f) {
    if (!result) return { text: '将物体放在光轴上观察成像', color: '#484f58' }

    const u = result.objectDistance
    const v = result.imageDistance
    const m = Math.abs(result.magnification)

    if (u > 2 * f + 0.01) return {
      text: `u > 2f：倒立缩小实像，f < v < 2f`,
      color: '#4CAF50',
      detail: `u=${u.toFixed(2)}m > 2f=${(2*f).toFixed(2)}m，v=${v.toFixed(2)}m，放大率${m.toFixed(2)}`,
    }
    if (Math.abs(u - 2 * f) < 0.05) return {
      text: `u = 2f：倒立等大实像，v = 2f`,
      color: '#2196F3',
      detail: `u≈2f，v=${v.toFixed(2)}m≈2f，放大率≈1`,
    }
    if (u > f + 0.01 && u < 2 * f - 0.01) return {
      text: `f < u < 2f：倒立放大实像，v > 2f`,
      color: '#FF9800',
      detail: `u=${u.toFixed(2)}m，v=${v.toFixed(2)}m > 2f，放大率${m.toFixed(2)}`,
    }
    if (Math.abs(u - f) < 0.05) return {
      text: `u = f：不成像（折射光平行）`,
      color: '#f44336',
      detail: `u≈f，折射光线平行，无法汇聚成像`,
    }
    if (u < f - 0.01) return {
      text: `u < f：正立放大虚像（同侧）`,
      color: '#9C27B0',
      detail: `u=${u.toFixed(2)}m < f=${f.toFixed(2)}m，虚像在物体同侧，放大率${m.toFixed(2)}`,
    }
    return { text: '移动物体观察不同成像情况', color: '#484f58' }
  }

  const rule = getImageRuleText(imageResult, focalLength)

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <span style={styles.title}>🔬 凸透镜成像规律</span>
        <div style={styles.toolbarActions}>
          <label style={styles.sliderLabel}>
            焦距 f =
            <input type="range" min="0.3" max="3.0" step="0.1"
              value={focalLength}
              onChange={(e) => handleFocalLengthChange(parseFloat(e.target.value))}
              style={styles.slider}
            />
            <span style={styles.sliderValue}>{focalLength.toFixed(1)}m</span>
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
            <div style={styles.panelTitle}>📐 成像公式</div>
            <div style={styles.formula}>
              <span style={styles.formulaMain}>1/u + 1/v = 1/f</span>
            </div>
            <div style={styles.formula}>
              <span style={styles.formulaMain}>m = -v/u</span>
            </div>
          </div>

          <div style={styles.panelSection}>
            <div style={styles.panelTitle}>📊 实时数据</div>
            <DataRow label="物距 u" value={imageResult ? `${imageResult.objectDistance.toFixed(3)} m` : '—'} color="#FF6B35" />
            <DataRow label="像距 v" value={imageResult ? `${Math.abs(imageResult.imageDistance).toFixed(3)} m` : '—'} color="#f44" />
            <DataRow label="焦距 f" value={`${focalLength.toFixed(1)} m`} color="#4a90d9" />
            <DataRow label="放大率 m" value={imageResult ? `${imageResult.magnification.toFixed(3)}` : '—'} color="#4CAF50" />
            <DataRow label="像高" value={imageResult ? `${Math.abs(imageResult.height).toFixed(3)} m` : '—'} color="#9C27B0" />
            <DataRow label="像的性质" value={imageResult?.isReal ? '实像' : imageResult ? '虚像' : '—'} color={imageResult?.isReal ? '#f44' : '#4FC3F7'} />
          </div>

          <div style={styles.panelSection}>
            <div style={styles.panelTitle}>📋 成像规律</div>
            <div style={{ ...styles.ruleText, color: rule.color }}>{rule.text}</div>
            {rule.detail && <div style={styles.ruleDetail}>{rule.detail}</div>}
          </div>

          <div style={styles.panelSection}>
            <div style={styles.panelTitle}>💡 两条特殊光线</div>
            <div style={styles.rayDesc}>
              <span style={{ color: '#FFD700' }}>①</span> 平行主轴 → 过F'
            </div>
            <div style={styles.rayDesc}>
              <span style={{ color: '#2196F3' }}>②</span> 过F → 平行主轴
            </div>
          </div>

          <div style={styles.panelSection}>
            <div style={styles.panelTitle}>🎯 操作</div>
            <div style={styles.hint}>↔ 拖拽光源改变物距u</div>
            <div style={styles.hint}>↔ 拖拽透镜改变焦距位置</div>
            <div style={styles.hint}>光屏自动跟随成像位置</div>
          </div>
        </div>
      </div>

      <div style={styles.statusBar}>
        <span style={{ color: rule.color }}>{rule.text}</span>
        <span style={{ color: '#484f58', marginLeft: 'auto' }}>
          拖拽光源/透镜 | 光屏自动跟随 | 两条特殊光线成像
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
  slider: { width: 120, accentColor: '#4a90d9' },
  sliderValue: { color: '#4a90d9', fontWeight: 600, minWidth: 40 },
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
    fontSize: 18, fontWeight: 700, color: '#4a90d9',
    fontFamily: 'Georgia, "Times New Roman", serif', letterSpacing: 1,
  },
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
