import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * FrictionForceScene — 探究滑动摩擦力影响因素（PhET浅色风格）
 *
 * 交互：
 * - 拖拽弹簧测力计拉动物块
 * - 滑块调整正压力（添加砝码）
 * - 下拉选择接触面粗糙程度
 * - 实时显示拉力、摩擦力、正压力
 * - 验证：f = μN
 *
 * 物理：
 * - 匀速拉动时：拉力 = 摩擦力
 * - f_k = μ_k × N
 * - 最大静摩擦力 > 滑动摩擦力
 */
export default function FrictionForceScene({ preset }) {
  const canvasRef = useRef(null)
  const rendererRef = useRef(null)
  const animRef = useRef(null)

  // 物理状态
  const stateRef = useRef({
    blockX: 0,           // 物块位置（世界坐标）
    blockV: 0,           // 物块速度
    pullForce: 0,        // 拉力
    frictionForce: 0,    // 摩擦力
    normalForce: 20,     // 正压力 (N)
    addedMass: 0,        // 添加的砝码质量
    muStatic: 0.4,       // 静摩擦系数
    muKinetic: 0.3,      // 滑动摩擦系数
    surface: 'wood',     // 接触面
    isMoving: false,
    pullerX: -3,         // 拉力计位置
    pullerDragging: false,
  })

  // 表面材质配置
  const surfaces = {
    wood:   { name: '木板', muS: 0.4, muK: 0.3, color: '#8B6914' },
    rubber: { name: '橡胶', muS: 0.8, muK: 0.6, color: '#2d2d2d' },
    glass:  { name: '玻璃', muS: 0.2, muK: 0.15, color: '#87CEEB' },
    ice:    { name: '冰面', muS: 0.1, muK: 0.05, color: '#E0F7FA' },
    sand:   { name: '砂纸', muS: 1.0, muK: 0.8, color: '#D2691E' },
  }

  const interactionRef = useRef({
    mode: 'idle',
    dragTarget: null,
  })

  const [surface, setSurface] = useState('wood')
  const [addedMass, setAddedMass] = useState(0)
  const [data, setData] = useState({
    pullForce: 0, frictionForce: 0, normalForce: 20,
    isMoving: false, mu: 0.3, ratio: 0,
  })
  const [cursor, setCursor] = useState('default')
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const renderer = {
      canvas,
      ctx: canvas.getContext('2d'),
      screenW: 0, screenH: 0,
      scale: 60, // px per world unit
      offsetX: 0, offsetY: 0,
      resize() {
        const rect = canvas.getBoundingClientRect()
        canvas.width = rect.width * devicePixelRatio
        canvas.height = rect.height * devicePixelRatio
        this.ctx.scale(devicePixelRatio, devicePixelRatio)
        this.screenW = rect.width
        this.screenH = rect.height
        this.offsetX = this.screenW / 2
        this.offsetY = this.screenH * 0.65
      },
      worldToScreen(wx, wy) {
        return [this.offsetX + wx * this.scale, this.offsetY - wy * this.scale]
      },
      screenToWorld(sx, sy) {
        return [(sx - this.offsetX) / this.scale, (this.offsetY - sy) / this.scale]
      },
      clear() {
        this.ctx.clearRect(0, 0, this.screenW, this.screenH)
      },
    }
    rendererRef.current = renderer
    renderer.resize()

    const renderLoop = () => {
      updatePhysics()
      renderFrame()
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

  // 更新表面
  useEffect(() => {
    const s = surfaces[surface]
    stateRef.current.muStatic = s.muS
    stateRef.current.muKinetic = s.muK
  }, [surface])

  // 更新正压力
  useEffect(() => {
    stateRef.current.normalForce = 20 + addedMass * 10 // 20N基础 + 砝码
    stateRef.current.addedMass = addedMass
  }, [addedMass])

  // ========== 物理 ==========
  function updatePhysics() {
    const s = stateRef.current
    const dt = 1 / 60

    // 摩擦力计算
    const N = s.normalForce
    const maxStatic = s.muStatic * N
    const kineticFriction = s.muKinetic * N

    if (Math.abs(s.blockV) < 0.01) {
      // 静止状态
      s.isMoving = false
      if (Math.abs(s.pullForce) <= maxStatic) {
        s.frictionForce = -s.pullForce // 静摩擦力 = 拉力（方向相反）
        s.blockV = 0
      } else {
        // 突破最大静摩擦
        s.isMoving = true
        s.frictionForce = -Math.sign(s.pullForce) * kineticFriction
      }
    } else {
      // 运动状态
      s.isMoving = true
      s.frictionForce = -Math.sign(s.blockV) * kineticFriction
    }

    // 牛顿第二定律
    const netForce = s.pullForce + s.frictionForce
    const mass = 2 + s.addedMass // 2kg基础质量 + 砝码
    const accel = netForce / mass

    // 更新速度和位置
    s.blockV += accel * dt
    s.blockX += s.blockV * dt

    // 边界限制
    if (s.blockX < -3) { s.blockX = -3; s.blockV = 0; }
    if (s.blockX > 3) { s.blockX = 3; s.blockV = 0; }

    // 阻尼（模拟摩擦效果）
    if (Math.abs(s.pullForce) < 0.5 && Math.abs(s.blockV) < 0.1) {
      s.blockV *= 0.9
      if (Math.abs(s.blockV) < 0.01) s.blockV = 0
    }

    setData({
      pullForce: s.pullForce,
      frictionForce: s.frictionForce,
      normalForce: N,
      isMoving: s.isMoving,
      mu: s.isMoving ? s.muKinetic : s.muStatic,
      ratio: N > 0 ? Math.abs(s.frictionForce) / N : 0,
    })
    forceUpdate(n => n + 1)
  }

  // ========== 渲染 ==========
  function renderFrame() {
    const ctx = rendererRef.current.ctx
    const renderer = rendererRef.current
    renderer.clear()

    drawBackground(ctx, renderer)
    drawSurface(ctx, renderer)
    drawBlock(ctx, renderer)
    drawSpringScale(ctx, renderer)
    drawForceArrows(ctx, renderer)
    drawDataPanel(ctx, renderer)
    drawDescription(ctx, renderer)
  }

  function drawBackground(ctx, renderer) {
    const w = renderer.screenW
    const h = renderer.screenH
    const [, gy] = renderer.worldToScreen(0, 0)

    // 地面区域
    ctx.fillStyle = '#f0f0f0'
    ctx.fillRect(0, gy, w, h - gy)

    ctx.strokeStyle = '#ccc'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, gy)
    ctx.lineTo(w, gy)
    ctx.stroke()
  }

  function drawSurface(ctx, renderer) {
    const [, gy] = renderer.worldToScreen(0, 0)
    const s = surfaces[surface]
    const w = renderer.screenW

    // 接触面材质
    ctx.fillStyle = s.color
    ctx.globalAlpha = 0.4
    ctx.fillRect(w * 0.15, gy, w * 0.7, 8)
    ctx.globalAlpha = 1

    // 材质名称
    ctx.fillStyle = '#555'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`接触面：${s.name}（μₛ=${s.muS}, μₖ=${s.muK}）`, w / 2, gy + 24)
  }

  function drawBlock(ctx, renderer) {
    const s = stateRef.current
    const [bx, by] = renderer.worldToScreen(s.blockX, 0)
    const scale = renderer.scale
    const blockW = 1.2 * scale
    const blockH = 0.8 * scale

    // 物块
    const grad = ctx.createLinearGradient(bx - blockW / 2, by - blockH, bx + blockW / 2, by)
    grad.addColorStop(0, '#e06060')
    grad.addColorStop(1, '#c04040')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.roundRect(bx - blockW / 2, by - blockH, blockW, blockH, 4)
    ctx.fill()

    ctx.strokeStyle = '#ff8080'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.roundRect(bx - blockW / 2, by - blockH, blockW, blockH, 4)
    ctx.stroke()

    // 质量标签
    const mass = 2 + s.addedMass
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${mass}kg`, bx, by - blockH / 2)

    // 砝码（叠加在物块上）
    if (s.addedMass > 0) {
      const weightH = (s.addedMass / 5) * blockH * 0.6 + 8
      ctx.fillStyle = '#4ECDC4'
      ctx.beginPath()
      ctx.roundRect(bx - blockW * 0.35, by - blockH - weightH, blockW * 0.7, weightH, 3)
      ctx.fill()
      ctx.strokeStyle = '#6EE7DE'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(bx - blockW * 0.35, by - blockH - weightH, blockW * 0.7, weightH, 3)
      ctx.stroke()

      ctx.fillStyle = '#fff'
      ctx.font = 'bold 10px sans-serif'
      ctx.fillText(`${s.addedMass}kg`, bx, by - blockH - weightH / 2)
    }
  }

  function drawSpringScale(ctx, renderer) {
    const s = stateRef.current
    const [bx, by] = renderer.worldToScreen(s.blockX, 0)
    const [px, py] = renderer.worldToScreen(s.pullerX, 0)
    const scale = renderer.scale

    // 弹簧测力计
    const scaleW = 0.6 * scale
    const scaleH = 0.4 * scale
    const hookX = bx - 0.7 * scale

    // 弹簧线
    ctx.strokeStyle = '#FFD700'
    ctx.lineWidth = 2
    const springSegments = 8
    const springLen = hookX - (px + scaleW / 2)
    ctx.beginPath()
    ctx.moveTo(px + scaleW / 2, py - scaleH / 2)
    for (let i = 0; i < springSegments; i++) {
      const t = (i + 0.5) / springSegments
      const x = px + scaleW / 2 + springLen * t
      const y = py - scaleH / 2 + (i % 2 === 0 ? -6 : 6)
      ctx.lineTo(x, y)
    }
    ctx.lineTo(hookX, py - scaleH / 2)
    ctx.stroke()

    // 测力计主体
    const grad = ctx.createLinearGradient(px - scaleW / 2, py - scaleH, px + scaleW / 2, py)
    grad.addColorStop(0, '#999')
    grad.addColorStop(1, '#777')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.roundRect(px - scaleW / 2, py - scaleH, scaleW, scaleH, 4)
    ctx.fill()
    ctx.strokeStyle = '#bbb'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(px - scaleW / 2, py - scaleH, scaleW, scaleH, 4)
    ctx.stroke()

    // 读数
    ctx.fillStyle = '#4CAF50'
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${Math.abs(s.pullForce).toFixed(1)}N`, px, py - scaleH / 2)

    // 钩子
    ctx.strokeStyle = '#aaa'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(hookX, py - scaleH / 2)
    ctx.lineTo(hookX, py - scaleH / 2 + 8)
    ctx.stroke()
  }

  function drawForceArrows(ctx, renderer) {
    const s = stateRef.current
    const [bx, by] = renderer.worldToScreen(s.blockX, 0)
    const scale = renderer.scale
    const blockH = 0.8 * scale

    const arrowScale = 3 // px per N

    // 拉力箭头（向左）
    if (Math.abs(s.pullForce) > 0.1) {
      const len = Math.abs(s.pullForce) * arrowScale
      drawArrow(ctx, bx - 0.7 * scale, by - blockH / 2, bx - 0.7 * scale - len, by - blockH / 2, '#FFD700', '拉力')
    }

    // 摩擦力箭头（向右）
    if (Math.abs(s.frictionForce) > 0.1) {
      const len = Math.abs(s.frictionForce) * arrowScale
      const dir = s.frictionForce > 0 ? 1 : -1
      drawArrow(ctx, bx, by - blockH + 5, bx + dir * len, by - blockH + 5, '#FF6B6B', '摩擦力')
    }

    // 正压力箭头（向下）
    const nLen = s.normalForce * arrowScale * 0.3
    drawArrow(ctx, bx, by, bx, by + nLen, '#4A90D9', `N=${s.normalForce}N`)

    // 重力箭头（向下）
    const mg = (2 + s.addedMass) * 9.8
    const mgLen = mg * arrowScale * 0.3
    drawArrow(ctx, bx + 0.3 * scale, by, bx + 0.3 * scale, by + mgLen, '#888', `G=${mg.toFixed(0)}N`)
  }

  function drawArrow(ctx, x1, y1, x2, y2, color, label) {
    const angle = Math.atan2(y2 - y1, x2 - x1)
    const arrowLen = 8

    // 线
    ctx.strokeStyle = color
    ctx.lineWidth = 2.5
    ctx.globalAlpha = 0.8
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()

    // 箭头
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(x2, y2)
    ctx.lineTo(x2 - arrowLen * Math.cos(angle - 0.35), y2 - arrowLen * Math.sin(angle - 0.35))
    ctx.lineTo(x2 - arrowLen * Math.cos(angle + 0.35), y2 - arrowLen * Math.sin(angle + 0.35))
    ctx.closePath()
    ctx.fill()
    ctx.globalAlpha = 1

    // 标签
    if (label) {
      ctx.fillStyle = color
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      const mx = (x1 + x2) / 2
      const my = (y1 + y2) / 2
      ctx.fillText(label, mx - 10, my - 4)
    }
  }

  function drawDataPanel(ctx, renderer) {
    const w = renderer.screenW
    const panelW = 200
    const panelH = 180
    const px = w - panelW - 16
    const py = 16

    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
    ctx.beginPath()
    ctx.roundRect(px, py, panelW, panelH, 8)
    ctx.fill()
    ctx.strokeStyle = '#ddd'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(px, py, panelW, panelH, 8)
    ctx.stroke()

    ctx.fillStyle = '#333'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('📊 实验数据', px + 12, py + 20)

    const d = data
    ctx.font = '11px sans-serif'
    let y = py + 40

    ctx.fillStyle = '#E6A800'
    ctx.fillText(`拉力 F = ${d.pullForce.toFixed(2)} N`, px + 12, y); y += 20

    ctx.fillStyle = '#FF6B6B'
    ctx.fillText(`摩擦力 f = ${d.frictionForce.toFixed(2)} N`, px + 12, y); y += 20

    ctx.fillStyle = '#4A90D9'
    ctx.fillText(`正压力 N = ${d.normalForce.toFixed(1)} N`, px + 12, y); y += 20

    ctx.fillStyle = '#555'
    ctx.fillText(`摩擦系数 μ = ${d.mu.toFixed(2)}`, px + 12, y); y += 20

    ctx.fillStyle = d.isMoving ? '#FF9800' : '#4CAF50'
    ctx.font = 'bold 11px sans-serif'
    ctx.fillText(d.isMoving ? '⚡ 滑动中' : '⏸ 静止', px + 12, y); y += 20

    // 验证 f ≈ μN
    const expected = d.mu * d.normalForce
    const diff = Math.abs(Math.abs(d.frictionForce) - expected)
    ctx.fillStyle = diff < 1 ? '#4CAF50' : '#FF9800'
    ctx.font = '11px sans-serif'
    ctx.fillText(`f/μN = ${d.ratio.toFixed(2)} (应≈1)`, px + 12, y)
  }

  function drawDescription(ctx, renderer) {
    const h = renderer.screenH
    const x = 16
    let y = h - 110

    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'

    ctx.fillStyle = '#333'
    ctx.font = 'bold 14px sans-serif'
    ctx.fillText('探究滑动摩擦力影响因素', x, y); y += 22

    ctx.fillStyle = '#4A90D9'
    ctx.font = 'bold 16px serif'
    ctx.fillText('f = μN', x, y); y += 24

    ctx.fillStyle = '#777'
    ctx.font = '11px sans-serif'
    ctx.fillText('① 左右拖拽拉力计施加拉力', x, y); y += 16
    ctx.fillText('② 调整正压力和接触面材质', x, y); y += 16
    ctx.fillText('③ 匀速拉动时 拉力 = 摩擦力', x, y)
  }

  // ========== 交互 ==========
  const handleMouseDown = useCallback((e) => {
    const renderer = rendererRef.current
    if (!renderer) return

    const rect = canvasRef.current.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top

    // 检测拉力计拖拽
    const s = stateRef.current
    const [px, py] = renderer.worldToScreen(s.pullerX, 0)
    if (Math.abs(sx - px) < 40 && Math.abs(sy - py) < 30) {
      interactionRef.current.mode = 'dragging'
      interactionRef.current.dragTarget = 'puller'
      setCursor('grabbing')
    }
  }, [])

  const handleMouseMove = useCallback((e) => {
    const renderer = rendererRef.current
    const interaction = interactionRef.current
    if (!renderer) return

    const rect = canvasRef.current.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top

    if (interaction.mode === 'dragging' && interaction.dragTarget === 'puller') {
      const s = stateRef.current
      const [wx] = renderer.screenToWorld(sx, sy)
      // 拉力 = 拉力计位移 × 灵敏度
      const dx = wx - s.pullerX
      s.pullForce = Math.max(-50, Math.min(50, dx * 8))
      return
    }

    // 悬停
    const s = stateRef.current
    const [px, py] = renderer.worldToScreen(s.pullerX, 0)
    setCursor(Math.abs(sx - px) < 40 && Math.abs(sy - py) < 30 ? 'grab' : 'default')
  }, [])

  const handleMouseUp = useCallback(() => {
    const interaction = interactionRef.current
    if (interaction.mode === 'dragging') {
      // 释放后拉力归零（弹簧回弹）
      stateRef.current.pullForce = 0
      interaction.mode = 'idle'
      interaction.dragTarget = null
      setCursor('default')
    }
  }, [])

  const handleContextMenu = useCallback((e) => e.preventDefault(), [])

  // 状态文本
  const getRuleText = () => {
    const d = data
    if (!d.isMoving && Math.abs(d.pullForce) < 0.5) return { text: '静止状态：施加拉力开始实验', color: '#999' }
    if (!d.isMoving) return { text: `静摩擦：f = ${Math.abs(d.frictionForce).toFixed(1)}N ≤ μₛN = ${(stateRef.current.muStatic * d.normalForce).toFixed(1)}N`, color: '#4CAF50' }
    return { text: `滑动摩擦验证：f ≈ μN = ${(d.mu * d.normalForce).toFixed(1)}N`, color: '#FF9800' }
  }

  const rule = getRuleText()

  return (
    <div style={styles.container}>
      {/* 工具栏 */}
      <div style={styles.toolbar}>
        <span style={styles.title}>探究滑动摩擦力影响因素</span>
        <div style={styles.toolbarActions}>
          <label style={styles.controlLabel}>
            接触面：
            <select value={surface} onChange={(e) => setSurface(e.target.value)}
              style={styles.select}>
              {Object.entries(surfaces).map(([k, v]) => (
                <option key={k} value={k}>{v.name} (μₛ={v.muS})</option>
              ))}
            </select>
          </label>
          <label style={styles.controlLabel}>
            砝码质量：
            <input type="range" min="0" max="5" step="0.5"
              value={addedMass}
              onChange={(e) => setAddedMass(parseFloat(e.target.value))}
              style={{ width: 80, accentColor: '#4A90D9' }} />
            <span style={styles.sliderVal}>{addedMass}kg</span>
          </label>
          <button style={styles.setBtn} onClick={() => {
            stateRef.current.blockX = 0
            stateRef.current.blockV = 0
            stateRef.current.pullForce = 0
          }}>⚙ 重置</button>
        </div>
      </div>

      {/* 主区域 */}
      <div style={styles.main}>
        <canvas ref={canvasRef}
          style={{ ...styles.canvas, cursor }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onContextMenu={handleContextMenu}
        />
      </div>

      {/* 底部状态栏 */}
      <div style={styles.statusBar}>
        <span style={{ color: rule.color, fontWeight: 600 }}>{rule.text}</span>
        <span style={{ color: '#999', marginLeft: 'auto' }}>
          f=μN · 控制变量法 · 匀速拉动
        </span>
      </div>
    </div>
  )
}

const styles = {
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
  toolbarActions: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  controlLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#555' },
  select: {
    background: '#fff', color: '#333', border: '1px solid #ccc',
    borderRadius: 4, padding: '3px 6px', fontSize: 12,
  },
  sliderVal: { color: '#4A90D9', fontWeight: 600, minWidth: 30, fontSize: 12 },
  setBtn: {
    background: '#7B1FA2', color: '#fff', border: 'none',
    borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer',
  },
  btn: {
    background: '#4A90D9', color: '#fff', border: 'none',
    borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer',
  },
  main: { flex: 1, display: 'flex', overflow: 'hidden', background: '#fff' },
  canvas: { flex: 1, width: '100%' },
  statusBar: {
    minHeight: 28, background: '#f5f5f5', borderTop: '1px solid #ccc',
    display: 'flex', alignItems: 'center', gap: 20,
    padding: '4px 14px', fontSize: 12, color: '#555', flexShrink: 0, flexWrap: 'wrap',
  },
}
