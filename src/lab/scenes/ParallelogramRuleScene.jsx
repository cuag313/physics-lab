import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * ParallelogramRuleScene — 验证力的平行四边形定则
 *
 * 交互：
 * - 拖拽两个分力的大小和方向
 * - 实时显示合力（平行四边形对角线）
 * - 等效替代法验证
 * - 验证：F² = F₁² + F₂² + 2F₁F₂cosθ
 */
export default function ParallelogramRuleScene({ preset }) {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const rendererRef = useRef(null)

  const stateRef = useRef({
    F1: { magnitude: 4, angle: 30 },
    F2: { magnitude: 3, angle: 150 },
    F: { magnitude: 0, angle: 0 },
    origin: { x: 0, y: 0 },
  })

  // displayData 用 ref 存储，避免每帧 setState
  const displayDataRef = useRef(null)
  const interactionRef = useRef({ mode: 'idle', target: null })
  const [cursor, setCursor] = useState('default')
  // 用于触发 UI 滑块同步（仅拖拽结束时调用）
  const [, uiTick] = useState(0)
  // 数据记录
  const [records, setRecords] = useState([])
  const recordIdRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const renderer = createRenderer(canvas)
    rendererRef.current = renderer

    const renderLoop = () => {
      computeResultant()
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

  function createRenderer(canvas) {
    const r = {
      canvas, ctx: canvas.getContext('2d'),
      screenW: 0, screenH: 0, scale: 60,
      originX: 0, originY: 0,  // 由 autoFit 设置
      resize() {
        const rect = canvas.getBoundingClientRect()
        canvas.width = rect.width * devicePixelRatio
        canvas.height = rect.height * devicePixelRatio
        this.ctx.scale(devicePixelRatio, devicePixelRatio)
        this.screenW = rect.width
        this.screenH = rect.height
      },
      worldToScreen(wx, wy) {
        return [this.originX + wx * this.scale, this.originY - wy * this.scale]
      },
      screenToWorld(sx, sy) {
        return [(sx - this.originX) / this.scale, (this.originY - sy) / this.scale]
      },
      clear() { this.ctx.clearRect(0, 0, this.screenW, this.screenH) },
    }
    r.resize()
    return r
  }

  // ========== 计算 ==========
  function computeResultant() {
    const s = stateRef.current
    const a1 = s.F1.angle * Math.PI / 180
    const a2 = s.F2.angle * Math.PI / 180

    const f1x = s.F1.magnitude * Math.cos(a1)
    const f1y = s.F1.magnitude * Math.sin(a1)
    const f2x = s.F2.magnitude * Math.cos(a2)
    const f2y = s.F2.magnitude * Math.sin(a2)

    const fx = f1x + f2x
    const fy = f1y + f2y

    s.F.magnitude = Math.sqrt(fx * fx + fy * fy)
    s.F.angle = Math.atan2(fy, fx) * 180 / Math.PI

    // 计算夹角（0~180°）
    let theta = Math.abs(s.F1.angle - s.F2.angle)
    if (theta > 180) theta = 360 - theta

    // 验证余弦定理
    const theoretical = Math.sqrt(
      s.F1.magnitude ** 2 + s.F2.magnitude ** 2 +
      2 * s.F1.magnitude * s.F2.magnitude * Math.cos(theta * Math.PI / 180)
    )

    // 写入 ref，不触发 React 渲染
    displayDataRef.current = {
      F1: s.F1.magnitude, F1angle: s.F1.angle,
      F2: s.F2.magnitude, F2angle: s.F2.angle,
      F: s.F.magnitude, Fangle: s.F.angle,
      theta,
      F1x: f1x, F1y: f1y, F2x: f2x, F2y: f2y,
      Fx: fx, Fy: fy,
      theoretical,
      error: Math.abs(s.F.magnitude - theoretical),
    }

    // 自动缩放：让所有箭头+标签都在可视区域内
    autoFit(rendererRef.current, s)
  }

  /** 根据力的范围自动调整 scale 和原点，保证不溢出 */
  function autoFit(renderer, s) {
    if (!renderer) return
    const panelW = 250  // 右侧数据面板占用宽度
    const padPx = 50    // 标签+安全边距
    // 可用区域：左到面板左边缘，上到下
    const availW = renderer.screenW - panelW - padPx
    const availH = renderer.screenH - padPx

    // 找出所有箭头端点在 x/y 方向的最大延伸（世界坐标）
    const forces = [s.F1, s.F2, s.F]
    let maxRight = 0, maxUp = 0, maxLeft = 0, maxDown = 0
    for (const f of forces) {
      const a = f.angle * Math.PI / 180
      const ex = f.magnitude * Math.cos(a)
      const ey = f.magnitude * Math.sin(a)
      if (ex > maxRight) maxRight = ex
      if (-ex > maxLeft) maxLeft = -ex
      if (ey > maxUp) maxUp = ey
      if (-ey > maxDown) maxDown = -ey
    }
    // 标签偏移约 25 世界单位
    const labelW = 25 / 60 * 2  // 按最小 scale 估算
    maxRight += labelW; maxUp += labelW; maxLeft += labelW; maxDown += labelW

    // 原点放在可用区域的 (42%, 60%)
    renderer.originX = padPx + availW * 0.42
    renderer.originY = padPx / 2 + availH * 0.60

    const rightPx = availW * 0.42 + padPx
    const upPx = renderer.originY - padPx / 2
    const leftPx = renderer.originX - padPx / 2
    const downPx = availH - renderer.originY

    // 四个方向需要的 scale
    const scales = []
    if (maxRight > 0) scales.push(rightPx / maxRight)
    if (maxUp > 0) scales.push(upPx / maxUp)
    if (maxLeft > 0) scales.push(leftPx / maxLeft)
    if (maxDown > 0) scales.push(downPx / maxDown)

    const idealScale = scales.length > 0 ? Math.min(...scales) : 60
    renderer.scale = Math.max(25, Math.min(80, idealScale))
  }

  // ========== 渲染 ==========
  function renderFrame(renderer) {
    const ctx = renderer.ctx
    renderer.clear()

    drawGrid(ctx, renderer)
    drawParallelogram(ctx, renderer)
    drawForceVector(ctx, renderer, stateRef.current.F1, '#FF6B6B', 'F₁')
    drawForceVector(ctx, renderer, stateRef.current.F2, '#4ECDC4', 'F₂')
    // 合力用深橙色，在白色背景上更醒目
    drawForceVector(ctx, renderer, stateRef.current.F, '#E65100', 'F', true)
    drawAngleArc(ctx, renderer)
    drawDataPanel(ctx, renderer)
  }

  function drawGrid(ctx, renderer) {
    const w = renderer.screenW
    const h = renderer.screenH
    const [ox, oy] = renderer.worldToScreen(0, 0)
    const s = renderer.scale

    // 坐标轴
    ctx.strokeStyle = 'rgba(100, 180, 255, 0.15)'
    ctx.lineWidth = 1
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(0, oy)
    ctx.lineTo(w, oy)
    ctx.moveTo(ox, 0)
    ctx.lineTo(ox, h)
    ctx.stroke()
    ctx.setLineDash([])

    // 刻度 + 单位标注
    ctx.fillStyle = 'rgba(100, 180, 255, 0.3)'
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (let i = -8; i <= 8; i++) {
      if (i === 0) continue
      const [sx] = renderer.worldToScreen(i, 0)
      ctx.fillText(`${i}`, sx, oy + 4)
    }
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (let i = -6; i <= 6; i++) {
      if (i === 0) continue
      const [, sy] = renderer.worldToScreen(0, i)
      ctx.fillText(`${i}`, ox - 6, sy)
    }

    // 单位标注
    const [u1x] = renderer.worldToScreen(1, 0)
    ctx.fillStyle = 'rgba(100, 180, 255, 0.5)'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText('1N', u1x, oy + 14)
  }

  function drawParallelogram(ctx, renderer) {
    const s = stateRef.current
    const [ox, oy] = renderer.worldToScreen(0, 0)
    const scale = renderer.scale

    const a1 = s.F1.angle * Math.PI / 180
    const a2 = s.F2.angle * Math.PI / 180

    // F1终点
    const p1x = ox + s.F1.magnitude * Math.cos(a1) * scale
    const p1y = oy - s.F1.magnitude * Math.sin(a1) * scale

    // F2终点
    const p2x = ox + s.F2.magnitude * Math.cos(a2) * scale
    const p2y = oy - s.F2.magnitude * Math.sin(a2) * scale

    // 合力终点
    const fa = s.F.angle * Math.PI / 180
    const pfx = ox + s.F.magnitude * Math.cos(fa) * scale
    const pfy = oy - s.F.magnitude * Math.sin(fa) * scale

    // 平行四边形虚线边
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 4])

    // F1终点→合力终点（平行于F2）
    ctx.beginPath()
    ctx.moveTo(p1x, p1y)
    ctx.lineTo(pfx, pfy)
    ctx.stroke()

    // F2终点→合力终点（平行于F1）
    ctx.beginPath()
    ctx.moveTo(p2x, p2y)
    ctx.lineTo(pfx, pfy)
    ctx.stroke()

    ctx.setLineDash([])

    // 平行标记（小箭头 ∥）
    drawParallelMark(ctx, ox, oy, p1x, p1y, p2x, p2y, pfx, pfy)

    // 对角线高亮带
    ctx.strokeStyle = 'rgba(230, 81, 0, 0.12)'
    ctx.lineWidth = 20
    ctx.beginPath()
    ctx.moveTo(ox, oy)
    ctx.lineTo(pfx, pfy)
    ctx.stroke()
  }

  /** 在平行边上画小三角形标记平行关系 */
  function drawParallelMark(ctx, ox, oy, p1x, p1y, p2x, p2y, pfx, pfy) {
    ctx.fillStyle = 'rgba(255, 215, 0, 0.5)'
    ctx.font = '9px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // 边1：F1终点→合力终点（平行于F2方向）
    const mx1 = (p1x + pfx) / 2
    const my1 = (p1y + pfy) / 2
    ctx.fillText('∥', mx1 - 8, my1 - 8)

    // 边2：F2终点→合力终点（平行于F1方向）
    const mx2 = (p2x + pfx) / 2
    const my2 = (p2y + pfy) / 2
    ctx.fillText('∥', mx2 + 8, my2 - 8)
  }

  function drawForceVector(ctx, renderer, force, color, label, isResultant = false) {
    const [ox, oy] = renderer.worldToScreen(0, 0)
    const scale = renderer.scale
    const angle = force.angle * Math.PI / 180
    const len = force.magnitude * scale

    const ex = ox + len * Math.cos(angle)
    const ey = oy - len * Math.sin(angle)

    // 箭头线
    ctx.strokeStyle = color
    ctx.lineWidth = isResultant ? 3.5 : 2.5
    ctx.globalAlpha = 0.9
    ctx.beginPath()
    ctx.moveTo(ox, oy)
    ctx.lineTo(ex, ey)
    ctx.stroke()

    // 箭头头
    const arrowAngle = Math.atan2(ey - oy, ex - ox)
    const arrowLen = isResultant ? 12 : 10
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(ex, ey)
    ctx.lineTo(ex - arrowLen * Math.cos(arrowAngle - 0.3), ey - arrowLen * Math.sin(arrowAngle - 0.3))
    ctx.lineTo(ex - arrowLen * Math.cos(arrowAngle + 0.3), ey - arrowLen * Math.sin(arrowAngle + 0.3))
    ctx.closePath()
    ctx.fill()
    ctx.globalAlpha = 1

    // 标签
    const labelR = len + 20
    const lx = ox + labelR * Math.cos(angle)
    const ly = oy - labelR * Math.sin(angle)
    ctx.fillStyle = color
    ctx.font = isResultant ? 'bold 14px sans-serif' : 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${label}=${force.magnitude.toFixed(1)}N`, lx, ly)

    // 拖拽手柄（端点圆圈）
    if (!isResultant) {
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.globalAlpha = 0.6
      ctx.beginPath()
      ctx.arc(ex, ey, 8, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  }

  function drawAngleArc(ctx, renderer) {
    const d = displayDataRef.current
    if (!d) return

    const [ox, oy] = renderer.worldToScreen(0, 0)
    const r = 35

    const a1 = stateRef.current.F1.angle * Math.PI / 180
    const a2 = stateRef.current.F2.angle * Math.PI / 180

    // 屏幕角度（y轴翻转）
    const sa1 = -a1
    const sa2 = -a2

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.lineWidth = 1.5
    ctx.beginPath()

    let start = sa1
    let end = sa2
    let diff = end - start
    while (diff > Math.PI) diff -= 2 * Math.PI
    while (diff < -Math.PI) diff += 2 * Math.PI

    if (diff > 0) {
      ctx.arc(ox, oy, r, start, end)
    } else {
      ctx.arc(ox, oy, r, end, start)
    }
    ctx.stroke()

    // 角度标注
    const midAngle = diff > 0 ? (start + end) / 2 : (end + start) / 2
    const lx = ox + (r + 14) * Math.cos(midAngle)
    const ly = oy + (r + 14) * Math.sin(midAngle)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`θ=${d.theta.toFixed(0)}°`, lx, ly)
  }

  function drawDataPanel(ctx, renderer) {
    const d = displayDataRef.current
    if (!d) return

    const w = renderer.screenW
    const panelW = 230
    const panelH = 250
    const px = w - panelW - 16
    const py = 16

    ctx.fillStyle = 'rgba(22, 27, 34, 0.95)'
    ctx.beginPath()
    ctx.roundRect(px, py, panelW, panelH, 8)
    ctx.fill()
    ctx.strokeStyle = '#30363d'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(px, py, panelW, panelH, 8)
    ctx.stroke()

    ctx.fillStyle = '#c9d1d9'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('📊 力的合成', px + 14, py + 20)

    let y = py + 42
    ctx.font = '11px sans-serif'

    ctx.fillStyle = '#FF6B6B'
    ctx.fillText(`F₁ = ${d.F1.toFixed(1)} N  θ₁=${d.F1angle.toFixed(0)}°`, px + 14, y); y += 18
    ctx.fillStyle = '#4ECDC4'
    ctx.fillText(`F₂ = ${d.F2.toFixed(1)} N  θ₂=${d.F2angle.toFixed(0)}°`, px + 14, y); y += 18
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.fillText(`夹角 θ = ${d.theta.toFixed(0)}°`, px + 14, y); y += 24

    ctx.fillStyle = '#E65100'
    ctx.font = 'bold 12px sans-serif'
    ctx.fillText(`合力 F = ${d.F.toFixed(2)} N  θ=${d.Fangle.toFixed(1)}°`, px + 14, y); y += 22

    // 余弦定理验证
    ctx.fillStyle = '#8b949e'
    ctx.font = '11px sans-serif'
    ctx.fillText('── 验证 ──', px + 14, y); y += 18

    ctx.fillStyle = '#4FC3F7'
    ctx.fillText(`理论值: ${d.theoretical.toFixed(2)} N`, px + 14, y); y += 18
    ctx.fillText(`|ΔF| = ${d.error.toFixed(4)} N`, px + 14, y); y += 18

    const errorPct = d.theoretical > 0 ? (d.error / d.theoretical * 100) : 0
    ctx.fillStyle = errorPct < 1 ? '#4CAF50' : '#FF9800'
    ctx.fillText(`误差: ${errorPct.toFixed(2)}%`, px + 14, y)
  }

  // ========== 交互（鼠标 + 触摸统一） ==========
  function getCanvasPos(clientX, clientY) {
    const rect = canvasRef.current.getBoundingClientRect()
    return [clientX - rect.left, clientY - rect.top]
  }

  function hitTestHandle(sx, sy) {
    const renderer = rendererRef.current
    if (!renderer) return null
    const [ox, oy] = renderer.worldToScreen(0, 0)
    const scale = renderer.scale
    const s = stateRef.current

    for (const key of ['F1', 'F2']) {
      const a = s[key].angle * Math.PI / 180
      const hx = ox + s[key].magnitude * scale * Math.cos(a)
      const hy = oy - s[key].magnitude * scale * Math.sin(a)
      if (Math.sqrt((sx - hx) ** 2 + (sy - hy) ** 2) < 20) return key
    }
    return null
  }

  function applyDrag(sx, sy, target) {
    const renderer = rendererRef.current
    if (!renderer) return
    const [ox, oy] = renderer.worldToScreen(0, 0)
    const dx = sx - ox
    const dy = -(sy - oy)
    const magnitude = Math.sqrt(dx * dx + dy * dy) / renderer.scale
    const angle = Math.atan2(dy, dx) * 180 / Math.PI

    stateRef.current[target].magnitude = Math.max(0.5, Math.min(8, magnitude))
    stateRef.current[target].angle = angle
  }

  const handlePointerDown = useCallback((e) => {
    // 触摸事件取第一个触点
    const cx = e.touches ? e.touches[0].clientX : e.clientX
    const cy = e.touches ? e.touches[0].clientY : e.clientY
    const [sx, sy] = getCanvasPos(cx, cy)
    const hit = hitTestHandle(sx, sy)
    if (hit) {
      interactionRef.current = { mode: 'dragging', target: hit }
      setCursor('crosshair')
      if (e.touches) e.preventDefault()
    }
  }, [])

  const handlePointerMove = useCallback((e) => {
    const cx = e.touches ? e.touches[0].clientX : e.clientX
    const cy = e.touches ? e.touches[0].clientY : e.clientY
    const [sx, sy] = getCanvasPos(cx, cy)
    const interaction = interactionRef.current

    if (interaction.mode === 'dragging' && interaction.target) {
      applyDrag(sx, sy, interaction.target)
      if (e.touches) e.preventDefault()
      return
    }

    // 悬停检测
    const hit = hitTestHandle(sx, sy)
    setCursor(hit ? 'crosshair' : 'default')
  }, [])

  const handlePointerUp = useCallback(() => {
    if (interactionRef.current.mode === 'dragging') {
      // 拖拽结束，同步一次 UI 滑块
      uiTick(n => n + 1)
    }
    interactionRef.current = { mode: 'idle', target: null }
    setCursor('default')
  }, [])

  const handleContextMenu = useCallback((e) => e.preventDefault(), [])

  // ========== 工具栏操作 ==========
  const applyPreset = useCallback((f1, f2) => {
    stateRef.current.F1 = { ...f1 }
    stateRef.current.F2 = { ...f2 }
    uiTick(n => n + 1)
  }, [])

  const doRecord = useCallback(() => {
    const d = displayDataRef.current
    if (!d) return
    const id = ++recordIdRef.current
    const errorPct = d.theoretical > 0 ? (d.error / d.theoretical * 100) : 0
    setRecords(prev => [...prev, {
      id,
      F1: d.F1, angle1: d.F1angle,
      F2: d.F2, angle2: d.F2angle,
      theta: d.theta,
      F: d.F, Fangle: d.Fangle,
      theoretical: d.theoretical,
      errorPct,
    }])
  }, [])

  const clearRecords = useCallback(() => {
    setRecords([])
    recordIdRef.current = 0
  }, [])

  // ========== 滑块同步值 ==========
  const s = stateRef.current

  return (
    <div style={styles.container}>
      {/* 顶栏：标题 + 预设按钮 + 记录 */}
      <div style={styles.topBar}>
        <span style={styles.title}>验证力的平行四边形定则</span>
        <div style={styles.topActions}>
          <button style={styles.setBtn} onClick={() => applyPreset({ magnitude: 4, angle: 30 }, { magnitude: 3, angle: 150 })}>⚙ 重置</button>
          <button style={styles.btn} onClick={() => applyPreset({ magnitude: 5, angle: 45 }, { magnitude: 5, angle: 135 })}>等大对称</button>
          <button style={styles.btn} onClick={() => applyPreset({ magnitude: 4, angle: 0 }, { magnitude: 3, angle: 180 })}>共线反向</button>
          <button style={styles.btn} onClick={() => applyPreset({ magnitude: 3, angle: 90 }, { magnitude: 4, angle: 0 })}>垂直</button>
          <button style={styles.btn} onClick={() => applyPreset({ magnitude: 5, angle: 60 }, { magnitude: 5, angle: -60 })}>120°对称</button>
          <div style={styles.sep} />
          <button style={styles.recordBtn} onClick={doRecord}>📝 记录</button>
          <button style={styles.btn} onClick={clearRecords}>清空</button>
        </div>
      </div>

      {/* 控制栏：滑块（固定高度，不换行） */}
      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>F₁</span>
          <input type="range" min="0.5" max="8" step="0.1"
            value={s.F1.magnitude}
            onChange={(e) => { stateRef.current.F1.magnitude = parseFloat(e.target.value); uiTick(n => n + 1) }}
            style={styles.slider} />
          <span style={styles.sliderVal}>{s.F1.magnitude.toFixed(1)}N</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>θ₁</span>
          <input type="range" min="-180" max="180" step="1"
            value={s.F1.angle}
            onChange={(e) => { stateRef.current.F1.angle = parseFloat(e.target.value); uiTick(n => n + 1) }}
            style={styles.slider} />
          <span style={styles.sliderVal}>{s.F1.angle.toFixed(0)}°</span>
        </label>
        <div style={styles.sep} />
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>F₂</span>
          <input type="range" min="0.5" max="8" step="0.1"
            value={s.F2.magnitude}
            onChange={(e) => { stateRef.current.F2.magnitude = parseFloat(e.target.value); uiTick(n => n + 1) }}
            style={styles.slider} />
          <span style={styles.sliderVal}>{s.F2.magnitude.toFixed(1)}N</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>θ₂</span>
          <input type="range" min="-180" max="180" step="1"
            value={s.F2.angle}
            onChange={(e) => { stateRef.current.F2.angle = parseFloat(e.target.value); uiTick(n => n + 1) }}
            style={styles.slider} />
          <span style={styles.sliderVal}>{s.F2.angle.toFixed(0)}°</span>
        </label>
      </div>

      {/* 画布区 */}
      <div style={styles.main}>
        <canvas ref={canvasRef}
          style={{ ...styles.canvas, cursor }}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
          onContextMenu={handleContextMenu}
        />
        {/* 数据记录表 */}
        {records.length > 0 && (
          <div style={styles.recordTable}>
            <div style={styles.recordTitle}>📝 数据记录（{records.length}组）</div>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>#</th>
                  <th style={styles.th}>F₁(N)</th>
                  <th style={styles.th}>θ₁</th>
                  <th style={styles.th}>F₂(N)</th>
                  <th style={styles.th}>θ₂</th>
                  <th style={styles.th}>θ</th>
                  <th style={styles.th}>F(N)</th>
                  <th style={styles.th}>理论</th>
                  <th style={styles.th}>误差%</th>
                </tr>
              </thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.id}>
                    <td style={styles.td}>{r.id}</td>
                    <td style={{ ...styles.td, color: '#FF6B6B' }}>{r.F1.toFixed(1)}</td>
                    <td style={styles.td}>{r.angle1.toFixed(0)}°</td>
                    <td style={{ ...styles.td, color: '#4ECDC4' }}>{r.F2.toFixed(1)}</td>
                    <td style={styles.td}>{r.angle2.toFixed(0)}°</td>
                    <td style={styles.td}>{r.theta.toFixed(0)}°</td>
                    <td style={{ ...styles.td, color: '#E65100', fontWeight: 600 }}>{r.F.toFixed(2)}</td>
                    <td style={styles.td}>{r.theoretical.toFixed(2)}</td>
                    <td style={{ ...styles.td, color: r.errorPct < 1 ? '#4CAF50' : '#FF9800' }}>{r.errorPct.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 底部说明 */}
      <div style={styles.desc}>
        <b>实验：验证力的平行四边形定则</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          拖拽力的端点改变大小和方向，∥ 标记平行边，对角线即合力。验证 F² = F₁² + F₂² + 2F₁F₂cosθ。
        </span>
      </div>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex', flexDirection: 'column',
    height: '100vh', maxHeight: '100vh',
    background: '#e8e8e8', color: '#333',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    overflow: 'hidden',
  },
  // --- 顶栏 ---
  topBar: {
    background: '#f5f5f5', borderBottom: '1px solid #ccc',
    display: 'flex', alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 12px', flexShrink: 0,
    flexWrap: 'wrap', gap: 6,
  },
  title: { fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' },
  topActions: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  // --- 控制栏（滑块行，固定不换行） ---
  controlBar: {
    background: '#fafafa', borderBottom: '1px solid #ddd',
    display: 'flex', alignItems: 'center',
    padding: '4px 12px', flexShrink: 0,
    gap: 10, overflowX: 'auto',
  },
  controlLabel: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#555', whiteSpace: 'nowrap' },
  controlName: { fontWeight: 600, color: '#4A90D9', minWidth: 18 },
  slider: { width: 60, accentColor: '#4A90D9' },
  sliderVal: { color: '#4A90D9', fontWeight: 600, minWidth: 36, fontSize: 12, textAlign: 'right' },
  // --- 按钮 ---
  btn: { background: '#fff', color: '#4A90D9', border: '1px solid #ccc', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' },
  setBtn: { background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
  recordBtn: { background: '#2E7D32', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontWeight: 600 },
  sep: { width: 1, height: 18, background: '#ccc', flexShrink: 0 },
  // --- 画布 ---
  main: { flex: 1, display: 'flex', overflow: 'hidden', background: '#fff', position: 'relative', minHeight: 0 },
  canvas: { flex: 1, width: '100%', display: 'block' },
  // --- 底部 ---
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
  // --- 数据记录表 ---
  recordTable: {
    position: 'absolute', bottom: 12, left: 12,
    background: 'rgba(22,27,34,0.95)', borderRadius: 8,
    padding: '8px 10px', maxHeight: 200, overflow: 'auto',
    border: '1px solid #30363d',
  },
  recordTitle: { color: '#c9d1d9', fontSize: 11, fontWeight: 600, marginBottom: 4 },
  table: { borderCollapse: 'collapse', fontSize: 10 },
  th: { color: '#8b949e', padding: '2px 6px', borderBottom: '1px solid #30363d', textAlign: 'center', fontWeight: 500, whiteSpace: 'nowrap' },
  td: { color: '#c9d1d9', padding: '2px 6px', textAlign: 'center', whiteSpace: 'nowrap' },
}
