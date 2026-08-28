import { useRef, useEffect, useState, useCallback } from 'react'
import { SceneRenderer } from '../renderers/SceneRenderer'

/**
 * PlaneMirrorImageScene — 平面镜成像特点实验
 *
 * 模拟"等大蜡烛法"：
 * - 玻璃板竖直放置（半透明镜面）
 * - 物体蜡烛在左侧
 * - 虚像在右侧（对称，虚线显示）
 * - 移动物体，观察像的变化
 *
 * 规律：
 * - 像与物等大
 * - 像距 = 物距
 * - 虚像（不能用光屏承接）
 * - 像与物关于镜面对称
 */
export default function PlaneMirrorImageScene({ preset }) {
  const canvasRef = useRef(null)
  const rendererRef = useRef(null)
  const animRef = useRef(null)

  const [objX, setObjX] = useState(preset?.objX ?? -3)
  const [objH, setObjH] = useState(preset?.objH ?? 1.0)
  const objXRef = useRef(objX)
  const objHRef = useRef(objH)
  const mirrorX = 0  // 镜面固定在 x=0

  const interactionRef = useRef({
    mode: 'idle',
    dragOffset: { x: 0, y: 0 },
  })
  const [cursor, setCursor] = useState('default')

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

  // 像的计算（用ref避免闭包陈旧）
  function getImage() {
    const ox = objXRef.current
    const oh = objHRef.current
    const dist = mirrorX - ox
    const imgX = mirrorX + dist
    return {
      x: imgX,
      y: 0,
      height: oh,
      dist,
      isVirtual: true,
    }
  }

  // ========== 渲染 ==========
  function renderFrame(renderer) {
    const ctx = renderer.ctx
    renderer.clear()
    drawBg(ctx, renderer)
    drawMirror(ctx, renderer)
    drawObject(ctx, renderer)
    drawImage(ctx, renderer)
    drawSymmetryLines(ctx, renderer)
    drawDistanceLabels(ctx, renderer)
    drawDescription(ctx, renderer)
  }

  function drawBg(ctx, renderer) {
    const [ox, oy] = renderer.worldToScreen(0, 0)
    const w = renderer.screenW

    // 主轴
    ctx.strokeStyle = 'rgba(100, 180, 255, 0.15)'
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
    ctx.font = '10px monospace'
    for (let wx = startWX; wx <= endWX; wx++) {
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

  // 绘制玻璃板（半透明镜面）
  function drawMirror(ctx, renderer) {
    const [mx, my] = renderer.worldToScreen(mirrorX, 0)
    const h = 2.5 * renderer.scale

    // 玻璃板（半透明）
    const grad = ctx.createLinearGradient(mx - 3, 0, mx + 3, 0)
    grad.addColorStop(0, 'rgba(150, 200, 255, 0.05)')
    grad.addColorStop(0.3, 'rgba(150, 200, 255, 0.2)')
    grad.addColorStop(0.5, 'rgba(200, 230, 255, 0.35)')
    grad.addColorStop(0.7, 'rgba(150, 200, 255, 0.2)')
    grad.addColorStop(1, 'rgba(150, 200, 255, 0.05)')
    ctx.fillStyle = grad
    ctx.fillRect(mx - 3, my - h / 2, 6, h)

    // 镜面线
    ctx.strokeStyle = '#4FC3F7'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(mx, my - h / 2)
    ctx.lineTo(mx, my + h / 2)
    ctx.stroke()

    // 背面斜线（表示玻璃板背面）
    ctx.strokeStyle = 'rgba(100, 100, 100, 0.3)'
    ctx.lineWidth = 1
    for (let i = -h / 2; i < h / 2; i += 5) {
      ctx.beginPath()
      ctx.moveTo(mx + 3, my + i)
      ctx.lineTo(mx + 9, my + i + 6)
      ctx.stroke()
    }

    // 镜面标签
    ctx.fillStyle = '#4FC3F7'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('玻璃板', mx, my - h / 2 - 12)

    // "M" 标记
    ctx.font = 'bold 14px sans-serif'
    ctx.fillText('M', mx, my + h / 2 + 20)
  }

  // 绘制物体蜡烛
  function drawObject(ctx, renderer) {
    const ox = objXRef.current
    const oh = objHRef.current
    const [sx, sy] = renderer.worldToScreen(ox, 0)
    const h = oh * renderer.scale

    // 蜡烛底座
    ctx.fillStyle = '#666'
    ctx.beginPath()
    ctx.roundRect(sx - 10, sy + 2, 20, 8, 3)
    ctx.fill()

    // 蜡烛柱体
    const grad = ctx.createLinearGradient(sx, sy, sx, sy - h)
    grad.addColorStop(0, '#E8D5B0')
    grad.addColorStop(1, '#FFF3E0')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.roundRect(sx - 5, sy - h + 10, 10, h - 10, 2)
    ctx.fill()
    ctx.strokeStyle = '#BCAAA4'
    ctx.lineWidth = 1
    ctx.stroke()

    // 火焰
    const flameH = 18
    const fy = sy - h + 5
    const glow = ctx.createRadialGradient(sx, fy, 0, sx, fy, flameH)
    glow.addColorStop(0, 'rgba(255, 255, 220, 0.95)')
    glow.addColorStop(0.3, 'rgba(255, 200, 80, 0.8)')
    glow.addColorStop(0.6, 'rgba(255, 120, 30, 0.5)')
    glow.addColorStop(1, 'rgba(255, 80, 0, 0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.ellipse(sx, fy, 8, flameH, 0, 0, Math.PI * 2)
    ctx.fill()

    // 光晕
    const halo = ctx.createRadialGradient(sx, fy, 0, sx, fy, 35)
    halo.addColorStop(0, 'rgba(255, 200, 100, 0.2)')
    halo.addColorStop(1, 'rgba(255, 200, 100, 0)')
    ctx.fillStyle = halo
    ctx.beginPath()
    ctx.arc(sx, fy, 35, 0, Math.PI * 2)
    ctx.fill()

    // 标签
    ctx.fillStyle = '#FFD166'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('物', sx, sy + 24)

    // 选中效果
    if (interactionRef.current.mode === 'dragging') {
      ctx.strokeStyle = 'rgba(79, 195, 247, 0.4)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.arc(sx, sy - h / 2, Math.max(h / 2 + 15, 25), 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }

  // 绘制虚像（虚线蜡烛）
  function drawImage(ctx, renderer) {
    const img = getImage()
    const [sx, sy] = renderer.worldToScreen(img.x, 0)
    const h = img.height * renderer.scale

    ctx.save()
    ctx.setLineDash([5, 4])
    ctx.globalAlpha = 0.5

    // 蜡烛柱体（虚线）
    const grad = ctx.createLinearGradient(sx, sy, sx, sy - h)
    grad.addColorStop(0, 'rgba(79, 195, 247, 0.4)')
    grad.addColorStop(1, 'rgba(79, 195, 247, 0.2)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.roundRect(sx - 5, sy - h + 10, 10, h - 10, 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(79, 195, 247, 0.6)'
    ctx.lineWidth = 1
    ctx.stroke()

    // 火焰（虚线）
    const fy = sy - h + 5
    const glow = ctx.createRadialGradient(sx, fy, 0, sx, fy, 15)
    glow.addColorStop(0, 'rgba(79, 195, 247, 0.4)')
    glow.addColorStop(1, 'rgba(79, 195, 247, 0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.ellipse(sx, fy, 6, 14, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.setLineDash([])
    ctx.restore()

    // 底座（虚线）
    ctx.strokeStyle = 'rgba(79, 195, 247, 0.4)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    ctx.roundRect(sx - 10, sy + 2, 20, 8, 3)
    ctx.stroke()
    ctx.setLineDash([])

    // 标签
    ctx.fillStyle = 'rgba(79, 195, 247, 0.7)'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('虚像', sx, sy + 24)
  }

  // 绘制对称线
  function drawSymmetryLines(ctx, renderer) {
    const img = getImage()
    const ox = objXRef.current
    const oh = objHRef.current
    const [oxs, oys] = renderer.worldToScreen(ox, 0)
    const [ix, iy] = renderer.worldToScreen(img.x, 0)
    const [mx, my] = renderer.worldToScreen(mirrorX, 0)

    const objTop = oys - oh * renderer.scale
    const imgTop = oys - img.height * renderer.scale

    // 物体顶端 → 像顶端（虚线）
    ctx.strokeStyle = 'rgba(255, 152, 0, 0.3)'
    ctx.lineWidth = 1
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(oxs, objTop)
    ctx.lineTo(ix, imgTop)
    ctx.stroke()

    // 物体底端 → 像底端（虚线，沿轴）
    ctx.strokeStyle = 'rgba(255, 152, 0, 0.3)'
    ctx.beginPath()
    ctx.moveTo(oxs, oys)
    ctx.lineTo(ix, iy)
    ctx.stroke()
    ctx.setLineDash([])

    // 物体到镜面的垂直虚线
    ctx.strokeStyle = 'rgba(255, 107, 53, 0.4)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    ctx.moveTo(oxs, oys + 35)
    ctx.lineTo(mx, oys + 35)
    ctx.stroke()
    ctx.setLineDash([])

    // 镜面到像的垂直虚线
    ctx.strokeStyle = 'rgba(79, 195, 247, 0.4)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    ctx.moveTo(mx, oys + 35)
    ctx.lineTo(ix, oys + 35)
    ctx.stroke()
    ctx.setLineDash([])
  }

  // 距离标注
  function drawDistanceLabels(ctx, renderer) {
    const img = getImage()
    const ox = objXRef.current
    const [oxs, oys] = renderer.worldToScreen(ox, 0)
    const [ix, iy] = renderer.worldToScreen(img.x, 0)
    const [mx, my] = renderer.worldToScreen(mirrorX, 0)

    const dist = img.dist
    if (dist < 0.3) return

    // 物距标注
    const midOX = (oxs + mx) / 2
    ctx.fillStyle = 'rgba(255, 107, 53, 0.8)'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`物距 = ${dist.toFixed(2)}m`, midOX, oys + 50)

    // 双箭头（物距）
    ctx.strokeStyle = 'rgba(255, 107, 53, 0.5)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(oxs + 5, oys + 44)
    ctx.lineTo(mx - 5, oys + 44)
    ctx.stroke()
    drawArrowHead(ctx, oxs + 5, oys + 44, 'right')
    drawArrowHead(ctx, mx - 5, oys + 44, 'left')

    // 像距标注
    const midIX = (mx + ix) / 2
    ctx.fillStyle = 'rgba(79, 195, 247, 0.8)'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`像距 = ${dist.toFixed(2)}m`, midIX, oys + 64)

    // 双箭头（像距）
    ctx.strokeStyle = 'rgba(79, 195, 247, 0.5)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(mx + 5, oys + 58)
    ctx.lineTo(ix - 5, oys + 58)
    ctx.stroke()
    drawArrowHead(ctx, mx + 5, oys + 58, 'right')
    drawArrowHead(ctx, ix - 5, oys + 58, 'left')

    // 等号标注
    ctx.fillStyle = '#4CAF50'
    ctx.font = 'bold 14px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('物距 = 像距 ✓', (oxs + ix) / 2, oys + 82)
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

  // 绘制文字说明
  function drawDescription(ctx, renderer) {
    const img = getImage()
    const x = 16
    let y = 20

    ctx.textBaseline = 'top'

    // 标题
    ctx.fillStyle = '#c9d1d9'
    ctx.font = 'bold 16px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('平面镜成像特点', x, y)
    y += 28

    // 公式
    ctx.fillStyle = '#4FC3F7'
    ctx.font = 'bold 14px serif'
    ctx.fillText('像距 = 物距，像高 = 物高', x, y)
    y += 24

    // 成像特点
    ctx.fillStyle = '#8b949e'
    ctx.font = '12px sans-serif'
    const points = [
      '① 像与物等大',
      '② 像距 = 物距',
      '③ 像与物关于镜面对称',
      '④ 虚像（不能用光屏承接）',
    ]
    for (const p of points) {
      ctx.fillText(p, x, y)
      y += 18
    }

    // 实时数据
    y += 6
    ctx.fillStyle = '#FF6B35'
    ctx.font = 'bold 12px sans-serif'
    ctx.fillText(`物距 = ${img.dist.toFixed(2)}m`, x, y)
    y += 18
    ctx.fillStyle = '#4FC3F7'
    ctx.fillText(`像距 = ${img.dist.toFixed(2)}m`, x, y)
    y += 18
    ctx.fillStyle = '#4CAF50'
    ctx.font = '11px sans-serif'
    ctx.fillText('物距 = 像距 ✓', x, y)
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

    // 检测物体拖拽
    const dist = Math.abs(wx - objX)
    const h = objH
    if (dist < 0.5 && wy > -h - 0.5 && wy < 0.5) {
      interaction.mode = 'dragging'
      interaction.dragOffset = { x: wx - objX, y: 0 }
      setCursor('grabbing')
    }
  }, [objX, objH])

  const handleMouseMove = useCallback((e) => {
    const renderer = rendererRef.current
    if (!renderer) return

    const rect = canvasRef.current.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const [wx, wy] = renderer.screenToWorld(sx, sy)
    const interaction = interactionRef.current

    if (interaction.mode === 'dragging') {
      const newX = wx - interaction.dragOffset.x
      // 物体必须在镜面左侧
      setObjX(Math.max(-5.5, Math.min(newX, mirrorX - 0.5)))
      objXRef.current = Math.max(-5.5, Math.min(newX, mirrorX - 0.5))
      return
    }

    // 空闲悬停
    const dist = Math.abs(wx - objX)
    setCursor(dist < 0.5 && wy > -objH - 0.5 && wy < 0.5 ? 'grab' : 'default')
  }, [objX, objH])

  const handleMouseUp = useCallback(() => {
    const interaction = interactionRef.current
    if (interaction.mode === 'dragging') {
      interaction.mode = 'idle'
      setCursor('default')
    }
  }, [])

  const handleContextMenu = useCallback((e) => e.preventDefault(), [])

  const img = getImage()

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <span style={styles.title}>🔬 平面镜成像特点</span>
        <div style={styles.toolbarActions}>
          <label style={styles.sliderLabel}>
            物高 =
            <input type="range" min="0.3" max="2.0" step="0.1"
              value={objH}
              onChange={(e) => { const v = parseFloat(e.target.value); setObjH(v); objHRef.current = v }}
              style={styles.slider}
            />
            <span style={styles.sliderValue}>{objH.toFixed(1)}m</span>
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
              <span style={styles.formulaMain}>像距 = 物距</span>
            </div>
            <div style={styles.formula}>
              <span style={styles.formulaMain}>像高 = 物高</span>
            </div>
          </div>

          <div style={styles.panelSection}>
            <div style={styles.panelTitle}>📊 实时数据</div>
            <DataRow label="物距" value={`${img.dist.toFixed(3)} m`} color="#FF6B35" />
            <DataRow label="像距" value={`${img.dist.toFixed(3)} m`} color="#4FC3F7" />
            <DataRow label="物高" value={`${objH.toFixed(3)} m`} color="#FF6B35" />
            <DataRow label="像高" value={`${img.height.toFixed(3)} m`} color="#4FC3F7" />
            <DataRow label="像的性质" value="虚像" color="#4FC3F7" />
          </div>

          <div style={styles.panelSection}>
            <div style={styles.panelTitle}>📋 成像特点</div>
            <div style={styles.ruleItem}><span style={{ color: '#4CAF50' }}>✓</span> 像与物等大</div>
            <div style={styles.ruleItem}><span style={{ color: '#4CAF50' }}>✓</span> 像距 = 物距</div>
            <div style={styles.ruleItem}><span style={{ color: '#4CAF50' }}>✓</span> 像与物关于镜面对称</div>
            <div style={styles.ruleItem}><span style={{ color: '#FF9800' }}>△</span> 虚像（不能用光屏承接）</div>
            <div style={styles.ruleItem}><span style={{ color: '#FF9800' }}>△</span> 像是正立的</div>
          </div>

          <div style={styles.panelSection}>
            <div style={styles.panelTitle}>💡 实验要点</div>
            <div style={styles.rayDesc}>用玻璃板代替平面镜</div>
            <div style={styles.rayDesc}>便于确定像的位置</div>
            <div style={styles.rayDesc}>用等大蜡烛比较像与物</div>
          </div>

          <div style={styles.panelSection}>
            <div style={styles.panelTitle}>🎯 操作</div>
            <div style={styles.hint}>↔ 拖拽蜡烛改变物距</div>
            <div style={styles.hint}>拖动物体观察像的变化</div>
            <div style={styles.hint}>注意像距与物距始终相等</div>
          </div>
        </div>
      </div>

      <div style={styles.statusBar}>
        <span style={{ color: '#4CAF50' }}>像距=物距，像与物等大</span>
        <span style={{ color: '#484f58', marginLeft: 'auto' }}>
          平面镜成像 · 虚像 · 对称
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
  slider: { width: 120, accentColor: '#FF9800' },
  sliderValue: { color: '#FF9800', fontWeight: 600, minWidth: 40 },
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
    fontSize: 18, fontWeight: 700, color: '#4FC3F7',
    fontFamily: 'Georgia, "Times New Roman", serif', letterSpacing: 1,
  },
  dataRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: 12 },
  dataLabel: { color: '#8b949e' },
  dataValue: { fontWeight: 600, fontFamily: 'monospace', fontSize: 13 },
  ruleItem: { fontSize: 12, color: '#c9d1d9', padding: '3px 0', lineHeight: 1.4 },
  rayDesc: { fontSize: 12, color: '#8b949e', padding: '2px 0' },
  hint: { fontSize: 11, color: '#484f58', padding: '2px 0' },
  statusBar: {
    height: 24, background: '#161b22', borderTop: '1px solid #30363d',
    display: 'flex', alignItems: 'center', gap: 20,
    padding: '0 14px', fontSize: 11, color: '#484f58', flexShrink: 0,
  },
}
