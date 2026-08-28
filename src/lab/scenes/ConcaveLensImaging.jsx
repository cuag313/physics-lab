import { useRef, useEffect, useState, useCallback } from 'react'
import { PhysicsScene } from '../core/PhysicsScene'
import { SceneRenderer } from '../renderers/SceneRenderer'
import {
  ObjectArrow, ConcaveLens, ScreenInst, ImageArrow
} from '../instruments'

/**
 * ConcaveLensImaging — 凹透镜成像规律实验
 *
 * 凹透镜永远生成虚像（正立缩小，物体同侧）
 *
 * 两条特殊光线：
 * ① 平行主轴 → 过透镜 → 发散，反向延长过F（物侧虚焦点）
 * ② 过光心O → 方向不变
 *
 * 折射光线反向延长线交点 = 虚像位置
 */
export default function ConcaveLensImaging({ preset }) {
  const canvasRef = useRef(null)
  const sceneRef = useRef(null)
  const rendererRef = useRef(null)
  const animRef = useRef(null)

  const [imageResult, setImageResult] = useState(null)
  const [focalLength, setFocalLength] = useState(preset?.focalLength ?? 1.0)

  const interactionRef = useRef({ mode: 'idle', dragTarget: null, dragOffset: { x: 0, y: 0 } })
  const [cursor, setCursor] = useState('default')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const scene = new PhysicsScene()
    const renderer = new SceneRenderer(canvas)
    sceneRef.current = scene
    rendererRef.current = renderer
    renderer.resize()

    setupBench(scene, focalLength)
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

  const handleFocalLengthChange = useCallback((newF) => {
    setFocalLength(newF)
    const scene = sceneRef.current
    if (!scene) return
    const lens = scene.instruments.find(i => i.type === 'concaveLens')
    if (lens) {
      lens.setParam('focalLength', newF)
      scene.rebuildOptics()
      syncImage(scene)
    }
  }, [])

  function setupBench(scene, f) {
    const obj = new ObjectArrow(-3, 0)
    obj.setParam('objectHeight', 0.8)
    scene.addInstrument(obj)

    const lens = new ConcaveLens(0, 0)
    lens.setParam('focalLength', f)
    scene.addInstrument(lens)

    // 光屏（凹透镜永远虚像，光屏隐藏）
    const screen = new ScreenInst(2, 0)
    screen.visible = false
    scene.addInstrument(screen)

    const img = new ImageArrow(1.5, 0)
    scene.addInstrument(img)

    scene.rebuildOptics()
  }

  // 凹透镜成像计算（f 取正值使用，公式中 f 为负）
  function calcImage(scene) {
    const obj = scene.instruments.find(i => i.type === 'objectArrow')
    const lens = scene.instruments.find(i => i.type === 'concaveLens')
    if (!obj || !lens) return null
    const h = obj.getParam('objectHeight')
    const u = lens.x - obj.x
    const f = lens.getParam('focalLength')  // 正值
    if (u < 0.01) return null
    // 凹透镜：f_effective = -f
    // 1/v = 1/(-f) - 1/u = -(u+f)/(u*f) → v = -u*f/(u+f)
    const v = -(u * f) / (u + f)
    const m = -v / u  // = f/(u+f)，正值 < 1
    return {
      imgX: lens.x + v,
      imgY: h * m,
      v, m, u, f, h,
      isReal: false,  // 凹透镜永远虚像
      imageDistance: v,
      objectDistance: u,
      height: h * m,
      magnification: m,
    }
  }

  function syncImage(scene) {
    const result = calcImage(scene)
    setImageResult(result)
    const img = scene.instruments.find(i => i.type === 'imageArrow')
    if (result) {
      if (img) {
        img.x = result.imgX
        img.y = 0
        img.setImageProps({
          isReal: false,
          height: result.height,
          magnification: result.magnification,
          visible: true,
        })
      }
    } else {
      if (img) img.setImageProps({ visible: false })
    }
  }

  // ========== 渲染 ==========
  function renderFrame(scene, renderer, interaction) {
    const ctx = renderer.ctx
    renderer.clear()
    drawBg(ctx, renderer)
    drawRays(ctx, renderer, scene)
    drawUVLabels(ctx, scene, renderer)

    for (const inst of scene.instruments) {
      if (!inst.visible || inst.type === 'wire') continue
      const isDragging = interaction.mode === 'dragging' && inst === interaction.dragTarget
      if (isDragging) { ctx.save(); ctx.globalAlpha = 0.7; ctx.shadowColor = 'rgba(79,195,247,0.5)'; ctx.shadowBlur = 16 }
      inst.render(ctx, renderer)
      if (isDragging) ctx.restore()
    }

    // 文字说明
    drawDescription(ctx, scene, renderer)
  }

  // 绘制文字说明
  function drawDescription(ctx, scene, renderer) {
    const result = calcImage(scene)
    const lens = scene.instruments.find(i => i.type === 'concaveLens')
    const f = lens ? lens.getParam('focalLength') : 1.0

    const x = 16
    let y = 20
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'

    // 标题
    ctx.fillStyle = '#c9d1d9'
    ctx.font = 'bold 16px sans-serif'
    ctx.fillText('凹透镜成像规律', x, y)
    y += 28

    // 公式
    ctx.fillStyle = '#FF9800'
    ctx.font = 'bold 14px serif'
    ctx.fillText('1/f = 1/u + 1/v  (f取负值)', x, y)
    y += 20
    ctx.fillText('m = -v/u', x, y)
    y += 26

    // 成像规律
    ctx.fillStyle = '#8b949e'
    ctx.font = '12px sans-serif'
    const rules = [
      '凹透镜：永远生成虚像',
      '正立、缩小、同侧',
      '像距 |v| < 物距 u',
      '放大率 |m| < 1',
    ]
    for (const r of rules) {
      ctx.fillText(r, x, y)
      y += 17
    }

    // 当前状态
    if (result) {
      y += 6
      ctx.fillStyle = '#9C27B0'
      ctx.font = 'bold 12px sans-serif'
      ctx.fillText('凹透镜：永远生成正立缩小虚像', x, y)
      y += 18
      ctx.fillStyle = '#FF9800'
      ctx.font = '11px sans-serif'
      ctx.fillText(`u = ${result.u.toFixed(2)}m  v = ${result.v.toFixed(2)}m  |m| = ${Math.abs(result.m).toFixed(2)}`, x, y)
    }
  }

  function drawBg(ctx, renderer) {
    const [ox, oy] = renderer.worldToScreen(0, 0)
    const w = renderer.screenW

    ctx.strokeStyle = 'rgba(255, 152, 0, 0.15)'
    ctx.lineWidth = 1
    ctx.setLineDash([10, 5])
    ctx.beginPath()
    ctx.moveTo(0, oy)
    ctx.lineTo(w, oy)
    ctx.stroke()
    ctx.setLineDash([])

    const scale = renderer.scale
    const startWX = Math.floor(-renderer.offsetX / scale)
    const endWX = Math.ceil((w - renderer.offsetX) / scale)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (let wx = startWX; wx <= endWX; wx++) {
      const [sx] = renderer.worldToScreen(wx, 0)
      ctx.strokeStyle = 'rgba(255, 152, 0, 0.2)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(sx, oy - 10)
      ctx.lineTo(sx, oy + 10)
      ctx.stroke()
      if (wx !== 0) {
        ctx.fillStyle = 'rgba(255, 152, 0, 0.3)'
        ctx.font = '10px monospace'
        ctx.fillText(`${wx}m`, sx, oy + 12)
      }
    }

    ctx.strokeStyle = '#30363d'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(20, oy + 28)
    ctx.lineTo(w - 20, oy + 28)
    ctx.stroke()
  }

  // ========== 凹透镜两条特殊光线 ==========
  function drawRays(ctx, renderer, scene) {
    const obj = scene.instruments.find(i => i.type === 'objectArrow')
    const lens = scene.instruments.find(i => i.type === 'concaveLens')
    if (!obj || !lens) return

    const h = obj.getParam('objectHeight')
    const objX = obj.x
    const lensX = lens.x
    const f = lens.getParam('focalLength')
    const u = lensX - objX
    if (u < 0.01) return

    const objTop = { x: objX, y: h }
    const lensHit1 = { x: lensX, y: h }
    const FAR = 40

    // 光线①入射段：平行主轴到透镜
    drawRay(ctx, renderer, objTop, lensHit1, '#FFD700', 0.9)

    // 光线②：过光心O，一条完整直线
    const slope2 = -h / u
    drawRay(ctx, renderer, objTop, { x: lensX + FAR, y: slope2 * FAR }, '#2196F3', 0.6)

    // 光线①折射段：发散（slope = h/f，正值向上发散）
    const slope1 = h / f
    drawRay(ctx, renderer, lensHit1, { x: lensX + FAR, y: h + slope1 * FAR }, '#FFD700', 0.6)

    // 标签
    const [labelX, labelY] = renderer.worldToScreen(objX, h)
    ctx.fillStyle = '#FFD700'
    ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText('\u2460', labelX - 12, labelY - 2)
    ctx.fillStyle = '#2196F3'
    ctx.fillText('\u2461', labelX - 12, labelY + 14)

    // 虚像：反向延长线（虚线）
    const result = calcImage(scene)
    if (result) {
      const imgX = result.imgX
      const imgY = result.imgY

      const [i1x, i1y] = renderer.worldToScreen(imgX, imgY)
      const [l1x, l1y] = renderer.worldToScreen(lensX, h)
      const [o2x, o2y] = renderer.worldToScreen(lensX, 0)

      ctx.lineWidth = 1
      ctx.globalAlpha = 0.5
      ctx.setLineDash([5, 3])

      // 光线①折射段反向延长
      ctx.strokeStyle = '#FFD700'
      ctx.beginPath()
      ctx.moveTo(l1x, l1y)
      ctx.lineTo(i1x, i1y)
      ctx.stroke()

      // 光线②折射段反向延长
      ctx.strokeStyle = '#2196F3'
      ctx.beginPath()
      ctx.moveTo(o2x, o2y)
      ctx.lineTo(i1x, i1y)
      ctx.stroke()

      ctx.setLineDash([])
      ctx.globalAlpha = 1

      // 虚像标记（虚线光圈）
      ctx.strokeStyle = '#4FC3F7'
      ctx.lineWidth = 2.5
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.arc(i1x, i1y, 10, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }

  function drawRay(ctx, renderer, from, to, color, alpha) {
    const [x1, y1] = renderer.worldToScreen(from.x, from.y)
    const [x2, y2] = renderer.worldToScreen(to.x, to.y)

    ctx.strokeStyle = color
    ctx.lineWidth = 5; ctx.globalAlpha = alpha * 0.12
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    ctx.lineWidth = 3; ctx.globalAlpha = alpha * 0.3
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    ctx.lineWidth = 1.5; ctx.globalAlpha = alpha * 0.85
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    ctx.globalAlpha = 1
  }

  // ========== u / v 标注 ==========
  function drawUVLabels(ctx, scene, renderer) {
    const obj = scene.instruments.find(i => i.type === 'objectArrow')
    const lens = scene.instruments.find(i => i.type === 'concaveLens')
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
      ctx.strokeStyle = 'rgba(255, 107, 53, 0.5)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(ox + 8, oy + 36)
      ctx.lineTo(lx - 8, oy + 36)
      ctx.stroke()
      drawArrowHead(ctx, ox + 8, oy + 36, 'right')
      drawArrowHead(ctx, lx - 8, oy + 36, 'left')
    }

    // F 和 2F 轴上标记
    const fPositions = [
      { x: lens.x - f, label: 'F', color: '#FF9800' },
      { x: lens.x + f, label: 'F', color: '#FF9800' },
      { x: lens.x - 2 * f, label: '2F', color: '#FF9800' },
      { x: lens.x + 2 * f, label: '2F', color: '#FF9800' },
    ]
    for (const fp of fPositions) {
      const [fx, fy] = renderer.worldToScreen(fp.x, 0)
      ctx.fillStyle = fp.color
      ctx.globalAlpha = 0.9
      ctx.beginPath()
      ctx.moveTo(fx, fy - 7)
      ctx.lineTo(fx - 5, fy + 3)
      ctx.lineTo(fx + 5, fy + 3)
      ctx.closePath()
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(fp.label, fx, fy - 12)
    }

    // v 标注（虚像，负值，物侧）
    if (imgResult) {
      const [ix] = renderer.worldToScreen(imgResult.imgX, 0)
      const v = imgResult.v
      const vAbs = Math.abs(v)
      if (vAbs > 0.3) {
        const midX = (ix + lx) / 2
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
    if (dir === 'right') { ctx.moveTo(x, y); ctx.lineTo(x - s, y - s / 2); ctx.lineTo(x - s, y + s / 2) }
    else { ctx.moveTo(x, y); ctx.lineTo(x + s, y - s / 2); ctx.lineTo(x + s, y + s / 2) }
    ctx.closePath()
    ctx.fill()
  }

  // ========== 交互 ==========
  const handleMouseDown = useCallback((e) => {
    const scene = sceneRef.current
    const renderer = rendererRef.current
    if (!scene || !renderer) return
    const rect = canvasRef.current.getBoundingClientRect()
    const [wx, wy] = renderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top)
    if (e.button === 2) { e.preventDefault(); return }
    const inst = scene.getInstrumentAt(wx, wy)
    if (inst && (inst.type === 'objectArrow' || inst.type === 'concaveLens')) {
      scene.selectInstrument(inst)
      interactionRef.current = { mode: 'dragging', dragTarget: inst, dragOffset: { x: wx - inst.x, y: wy - inst.y } }
      setCursor('grabbing')
    }
  }, [])

  const handleMouseMove = useCallback((e) => {
    const renderer = rendererRef.current
    const scene = sceneRef.current
    if (!renderer || !scene) return
    const rect = canvasRef.current.getBoundingClientRect()
    const [wx, wy] = renderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top)
    const interaction = interactionRef.current

    if (interaction.mode === 'dragging' && interaction.dragTarget) {
      const inst = interaction.dragTarget
      const newX = wx - interaction.dragOffset.x
      if (inst.type === 'objectArrow') {
        const lens = scene.instruments.find(i => i.type === 'concaveLens')
        if (lens) inst.x = Math.min(newX, lens.x - 0.3)
      } else if (inst.type === 'concaveLens') {
        const obj = scene.instruments.find(i => i.type === 'objectArrow')
        if (obj) inst.x = Math.max(newX, obj.x + 0.3)
      }
      scene.rebuildOptics()
      syncImage(scene)
      return
    }
    const inst = scene.getInstrumentAt(wx, wy)
    setCursor(inst && (inst.type === 'objectArrow' || inst.type === 'concaveLens') ? 'grab' : 'default')
  }, [])

  const handleMouseUp = useCallback(() => {
    const interaction = interactionRef.current
    if (interaction.mode === 'dragging') { interaction.mode = 'idle'; interaction.dragTarget = null; setCursor('default') }
  }, [])

  const handleContextMenu = useCallback((e) => e.preventDefault(), [])

  // ========== 成像规律 ==========
  function getRule(result, f) {
    if (!result) return { text: '将物体放在光轴上观察成像', color: '#484f58' }
    const u = result.objectDistance
    const v = result.v
    const m = Math.abs(result.magnification)
    return {
      text: `凹透镜：永远生成正立缩小虚像`,
      color: '#9C27B0',
      detail: `u=${u.toFixed(2)}m，v=${v.toFixed(2)}m（虚），放大率${m.toFixed(2)}`,
    }
  }

  const rule = getRule(imageResult, focalLength)

  return (
    <div style={s.container}>
      <div style={s.toolbar}>
        <span style={s.title}>🔬 凹透镜成像规律</span>
        <div style={s.toolbarActions}>
          <label style={s.sliderLabel}>
            焦距 f =
            <input type="range" min="0.3" max="3.0" step="0.1" value={focalLength}
              onChange={(e) => handleFocalLengthChange(parseFloat(e.target.value))} style={s.slider} />
            <span style={s.sliderValue}>{focalLength.toFixed(1)}m</span>
          </label>
        </div>
      </div>

      <div style={s.main}>
        <canvas ref={canvasRef} style={{ ...s.canvas, cursor }}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onContextMenu={handleContextMenu} />

        <div style={s.panel}>
          <div style={s.ps}>
            <div style={s.pt}>📐 成像公式</div>
            <div style={s.fm}><span style={s.fmx}>1/f = 1/u + 1/v</span></div>
            <div style={s.fm}><span style={s.fmx}>m = -v/u</span></div>
            <div style={{ fontSize: 11, color: '#8b949e', textAlign: 'center', marginTop: 4 }}>f 取负值</div>
          </div>

          <div style={s.ps}>
            <div style={s.pt}>📊 实时数据</div>
            <DR label="物距 u" value={imageResult ? `${imageResult.u.toFixed(3)} m` : '—'} color="#FF6B35" />
            <DR label="像距 v" value={imageResult ? `${imageResult.v.toFixed(3)} m` : '—'} color="#4FC3F7" />
            <DR label="焦距 f" value={`-${focalLength.toFixed(1)} m`} color="#FF9800" />
            <DR label="放大率 m" value={imageResult ? `${imageResult.m.toFixed(3)}` : '—'} color="#4CAF50" />
            <DR label="像高" value={imageResult ? `${Math.abs(imageResult.height).toFixed(3)} m` : '—'} color="#9C27B0" />
            <DR label="像的性质" value="虚像" color="#4FC3F7" />
          </div>

          <div style={s.ps}>
            <div style={s.pt}>📋 成像规律</div>
            <div style={{ ...s.rt, color: rule.color }}>{rule.text}</div>
            {rule.detail && <div style={s.rd}>{rule.detail}</div>}
          </div>

          <div style={s.ps}>
            <div style={s.pt}>💡 两条特殊光线</div>
            <div style={s.rdesc}><span style={{ color: '#FFD700' }}>①</span> 平行主轴 → 发散，反向延长过F</div>
            <div style={s.rdesc}><span style={{ color: '#2196F3' }}>②</span> 过光心O → 方向不变</div>
          </div>

          <div style={s.ps}>
            <div style={s.pt}>🎯 操作</div>
            <div style={s.hint}>↔ 拖拽光源改变物距u</div>
            <div style={s.hint}>↔ 拖拽透镜改变位置</div>
            <div style={s.hint}>凹透镜永远生成虚像</div>
          </div>
        </div>
      </div>

      <div style={s.sb}>
        <span style={{ color: rule.color }}>{rule.text}</span>
        <span style={{ color: '#484f58', marginLeft: 'auto' }}>凹透镜 · 虚像 · 正立缩小</span>
      </div>
    </div>
  )
}

function DR({ label, value, color }) {
  return (
    <div style={s.dr}>
      <span style={s.dl}>{label}</span>
      <span style={{ ...s.dv, color }}>{value}</span>
    </div>
  )
}

const s = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#0d1117', color: '#c9d1d9', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  toolbar: { height: 44, background: '#161b22', borderBottom: '1px solid #30363d', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flexShrink: 0 },
  title: { fontSize: 15, fontWeight: 600, color: '#c9d1d9' },
  toolbarActions: { display: 'flex', alignItems: 'center', gap: 12 },
  sliderLabel: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#8b949e' },
  slider: { width: 120, accentColor: '#FF9800' },
  sliderValue: { color: '#FF9800', fontWeight: 600, minWidth: 40 },
  main: { flex: 1, display: 'flex', overflow: 'hidden' },
  canvas: { flex: 1, width: '100%' },
  panel: { width: 240, background: '#161b22', borderLeft: '1px solid #30363d', overflowY: 'auto', flexShrink: 0 },
  ps: { padding: '12px 14px', borderBottom: '1px solid #21262d' },
  pt: { fontSize: 13, fontWeight: 600, color: '#c9d1d9', marginBottom: 8 },
  fm: { textAlign: 'center', margin: '6px 0' },
  fmx: { fontSize: 18, fontWeight: 700, color: '#FF9800', fontFamily: 'Georgia, "Times New Roman", serif', letterSpacing: 1 },
  dr: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: 12 },
  dl: { color: '#8b949e' },
  dv: { fontWeight: 600, fontFamily: 'monospace', fontSize: 13 },
  rt: { fontSize: 13, fontWeight: 600, lineHeight: 1.4 },
  rd: { fontSize: 11, color: '#8b949e', marginTop: 4, lineHeight: 1.4 },
  rdesc: { fontSize: 12, color: '#8b949e', padding: '2px 0' },
  hint: { fontSize: 11, color: '#484f58', padding: '2px 0' },
  sb: { height: 24, background: '#161b22', borderTop: '1px solid #30363d', display: 'flex', alignItems: 'center', gap: 20, padding: '0 14px', fontSize: 11, color: '#484f58', flexShrink: 0 },
}
