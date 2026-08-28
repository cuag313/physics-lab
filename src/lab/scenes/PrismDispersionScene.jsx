import { useRef, useEffect, useState } from 'react'
import { SceneRenderer } from '../renderers/SceneRenderer'

/**
 * PrismDispersionScene — 三棱镜白光色散
 * 布局：激光器 → 三棱镜(顶角朝上) → 红色光屏
 * 光路：白光→左斜面→折射→右斜面→色散→光屏
 */

const SPECTRUM = [
  { name: '红', wl: 700, color: '#FF0000', nOff: -0.012 },
  { name: '橙', wl: 620, color: '#FF6600', nOff: -0.008 },
  { name: '黄', wl: 580, color: '#FFCC00', nOff: -0.004 },
  { name: '绿', wl: 540, color: '#00CC00', nOff: 0 },
  { name: '蓝', wl: 480, color: '#0066FF', nOff: 0.006 },
  { name: '靛', wl: 440, color: '#3300CC', nOff: 0.010 },
  { name: '紫', wl: 400, color: '#8800CC', nOff: 0.015 },
]

function refract(incident, normal, n1, n2) {
  const cosI = -(incident.x * normal.x + incident.y * normal.y)
  const sinI2 = (n1 / n2) ** 2 * (1 - cosI * cosI)
  if (sinI2 > 1) return null
  const cosR = Math.sqrt(1 - sinI2)
  const ratio = n1 / n2
  return {
    x: ratio * incident.x + (ratio * cosI - cosR) * normal.x,
    y: ratio * incident.y + (ratio * cosI - cosR) * normal.y,
  }
}

function raySegHit(origin, dir, p1, p2) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y
  const det = dir.x * dy - dir.y * dx
  if (Math.abs(det) < 1e-10) return null
  const t = ((p1.x - origin.x) * dy - (p1.y - origin.y) * dx) / det
  const s = ((p1.x - origin.x) * dir.y - (p1.y - origin.y) * dir.x) / det
  if (t < 0.01 || s < -0.01 || s > 1.01) return null
  return { x: origin.x + dir.x * t, y: origin.y + dir.y * t, t }
}

// 顶角朝上 △ 的等边三角形
// rot=180 时: v0=(0,1.2)顶, v1=(-1.04,-0.6)左下, v2=(1.04,-0.6)右下
function prismVerts(cx, cy, size, rot) {
  const a = rot * Math.PI / 180
  return [
    { x: cx + size * Math.cos(a - Math.PI / 2), y: cy + size * Math.sin(a - Math.PI / 2) },
    { x: cx + size * Math.cos(a + Math.PI / 6), y: cy + size * Math.sin(a + Math.PI / 6) },
    { x: cx + size * Math.cos(a + 5 * Math.PI / 6), y: cy + size * Math.sin(a + 5 * Math.PI / 6) },
  ]
}

export default function PrismDispersionScene() {
  const canvasRef = useRef(null)
  const rendererRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    flashOn: false,
    flashX: -4.5,
    flashY: 0,
    flashDir: 0,
    prismAngle: 60,
    prismRot: 180,
    baseN: 1.48,
    screenDist: 3.5,
    lightType: 'white',
    mouse: { mode: 'idle', target: null, startSx: 0, startSy: 0, offSx: 0, offSy: 0, startRot: 0, startAngle: 0, moved: false },
    cursor: 'default',
    rays: [],
    hits: [],
  })

  const [tick, setTick] = useState(0)
  const rerender = () => setTick(t => t + 1)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const renderer = new SceneRenderer(canvas)
    rendererRef.current = renderer
    renderer.resize()

    const loop = () => { renderFrame(renderer); animRef.current = requestAnimationFrame(loop) }
    loop()

    function getPos(e) {
      const rect = canvas.getBoundingClientRect()
      return [e.clientX - rect.left, e.clientY - rect.top]
    }

    function onDown(e) {
      const st = S.current
      const [sx, sy] = getPos(e)
      const r = renderer
      const [flSx, flSy] = r.worldToScreen(st.flashX, st.flashY)
      const s = r.scale
      const bw = 1.0 * s, bh = 0.5 * s

      // 红色按钮命中检测
      const dirRad0 = st.flashDir * Math.PI / 180
      const angle0 = -dirRad0
      const ledLX = -bw * 0.1, ledLY = -bh / 2 - bh * 0.08
      const ledSx = flSx + ledLX * Math.cos(angle0) - ledLY * Math.sin(angle0)
      const ledSy = flSy + ledLX * Math.sin(angle0) + ledLY * Math.cos(angle0)
      if (Math.sqrt((sx - ledSx) ** 2 + (sy - ledSy) ** 2) < bh * 0.2) {
        st.mouse = { mode: 'pressed', target: 'button', startSx: sx, startSy: sy, moved: false }
        st.cursor = 'pointer'; rerender(); return
      }
      if (Math.abs(sx - flSx) < bw * 0.7 && Math.abs(sy - flSy) < bh) {
        st.mouse = { mode: 'drag', target: 'flashlight', startSx: sx, startSy: sy, offSx: sx - flSx, offSy: sy - flSy, moved: false }
        st.cursor = 'grabbing'; rerender(); return
      }
      const [pcx, pcy] = r.worldToScreen(0, 0)
      if (Math.sqrt((sx - pcx) ** 2 + (sy - pcy) ** 2) < 70) {
        st.mouse = { mode: 'drag', target: 'prism', startSx: sx, startSy: sy, startRot: st.prismRot, startAngle: Math.atan2(sy - pcy, sx - pcx) * 180 / Math.PI, moved: false }
        st.cursor = 'crosshair'; rerender()
      }
    }

    function onMove(e) {
      const st = S.current; const m = st.mouse; const [sx, sy] = getPos(e)
      if (m.mode === 'drag' && m.target === 'flashlight') {
        m.moved = true
        const [wx, wy] = renderer.screenToWorld(sx - m.offSx, sy - m.offSy)
        st.flashX = wx; st.flashY = wy
        const v = prismVerts(0, 0, 1.2, st.prismRot)
        st.flashDir = Math.atan2((v[0].y + v[2].y) / 2 - wy, (v[0].x + v[2].x) / 2 - wx) * 180 / Math.PI
        computeRays(); rerender(); return
      }
      if (m.mode === 'drag' && m.target === 'prism') {
        m.moved = true
        const [pcx, pcy] = renderer.worldToScreen(0, 0)
        st.prismRot = Math.round(m.startRot + Math.atan2(sy - pcy, sx - pcx) * 180 / Math.PI - m.startAngle)
        computeRays(); rerender(); return
      }
      if (m.mode === 'pressed') {
        if (Math.sqrt((sx - m.startSx) ** 2 + (sy - m.startSy) ** 2) > 5) {
          m.moved = true; m.mode = 'drag'; m.target = 'flashlight'
          const [fsx, fsy] = renderer.worldToScreen(st.flashX, st.flashY)
          m.offSx = m.startSx - fsx; m.offSy = m.startSy - fsy
          st.cursor = 'grabbing'; rerender()
        }
        return
      }
      // hover
      const [fsx2, fsy2] = renderer.worldToScreen(st.flashX, st.flashY)
      const s = renderer.scale, bw = 1.0 * s, bh = 0.5 * s
      const [pcx, pcy] = renderer.worldToScreen(0, 0)
      let cur = 'default'
      if (Math.abs(sx - fsx2) < bw * 0.7 && Math.abs(sy - fsy2) < bh) cur = 'grab'
      else if (Math.sqrt((sx - pcx) ** 2 + (sy - pcy) ** 2) < 70) cur = 'grab'
      if (cur !== st.cursor) { st.cursor = cur; rerender() }
    }

    function onUp() {
      const st = S.current
      if (st.mouse.mode === 'pressed' && st.mouse.target === 'button' && !st.mouse.moved) {
        st.flashOn = !st.flashOn; computeRays()
      }
      st.mouse = { mode: 'idle', target: null, moved: false }; st.cursor = 'default'; rerender()
    }

    function onLeave() { S.current.mouse = { mode: 'idle', target: null, moved: false }; S.current.cursor = 'default'; rerender() }

    canvas.addEventListener('mousedown', onDown)
    canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('mouseup', onUp)
    canvas.addEventListener('mouseleave', onLeave)
    canvas.addEventListener('contextmenu', e => e.preventDefault())
    const onResize = () => renderer.resize()
    window.addEventListener('resize', onResize)
    computeRays()

    return () => {
      canvas.removeEventListener('mousedown', onDown)
      canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('mouseup', onUp)
      canvas.removeEventListener('mouseleave', onLeave)
      window.removeEventListener('resize', onResize)
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [])

  // ===== 光路计算 =====
  function computeRays() {
    try {
      const st = S.current
      const verts = prismVerts(0, 0, 1.2, st.prismRot)
      const dirRad = st.flashDir * Math.PI / 180
      const beamDir = { x: Math.cos(dirRad), y: Math.sin(dirRad) }
      const origin = { x: st.flashX, y: st.flashY }

      // 三条边 + 朝外法线
      const edges = []
      for (let i = 0; i < 3; i++) {
        const a = verts[i], b = verts[(i + 1) % 3]
        const dx = b.x - a.x, dy = b.y - a.y
        const len = Math.sqrt(dx * dx + dy * dy)
        let nx = dy / len, ny = -dx / len
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
        if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny }
        edges.push({ a, b, nx, ny })
      }

      const colors = st.lightType === 'white' ? SPECTRUM
        : st.lightType === 'red' ? [SPECTRUM[0]]
        : st.lightType === 'green' ? [SPECTRUM[3]]
        : [SPECTRUM[4]]

      const rays = [], hits = []
      if (!st.flashOn) { st.rays = rays; st.hits = hits; return }

      // 找入射面
      let entryIdx = -1, h1 = null
      for (let i = 0; i < 3; i++) {
        const hit = raySegHit(origin, beamDir, edges[i].a, edges[i].b)
        if (hit && (!h1 || hit.t < h1.t)) { h1 = hit; entryIdx = i }
      }

      if (!h1) {
        // 未命中棱镜
        rays.push({ segs: [{ from: origin, to: { x: origin.x + beamDir.x * 12, y: origin.y + beamDir.y * 12 } }], color: '#ffffff', name: '', n: 1 })
        st.rays = rays; st.hits = hits; return
      }

      // 入射法线（指向空气侧，与入射光反向）
      const e0 = edges[entryIdx]
      let inNx = e0.nx, inNy = e0.ny
      if (inNx * beamDir.x + inNy * beamDir.y > 0) { inNx = -inNx; inNy = -inNy }

      for (const spec of colors) {
        const n = st.baseN + spec.nOff

        // 第一次折射：空气→玻璃
        const r1 = refract(beamDir, { x: inNx, y: inNy }, 1.0, n)
        if (!r1) continue

        const segs = [{ from: origin, to: { x: h1.x, y: h1.y } }]
        let curPt = { x: h1.x, y: h1.y }
        let curDir = { x: r1.x, y: r1.y }
        let lastFace = entryIdx
        let exited = false

        for (let bounce = 0; bounce < 5; bounce++) {
          // 找下一个交面
          let nextFace = -1, hNext = null
          for (let j = 0; j < 3; j++) {
            if (j === lastFace) continue
            const hit = raySegHit(curPt, curDir, edges[j].a, edges[j].b)
            if (hit && (!hNext || hit.t < hNext.t)) { hNext = hit; nextFace = j }
          }
          if (!hNext) break

          // 出射法线（指向玻璃侧 = 朝外法线取反）
          const ej = edges[nextFace]
          let exitNx = -ej.nx, exitNy = -ej.ny

          // 尝试折射出射（玻璃→空气）
          const r2 = refract(curDir, { x: exitNx, y: exitNy }, n, 1.0)
          if (r2) {
            // 成功出射
            segs.push({ from: { x: curPt.x, y: curPt.y }, to: { x: hNext.x, y: hNext.y } })
            // 终点锁定光屏
            const tScr = (st.screenDist - hNext.x) / r2.x
            if (tScr > 0) {
              const sy = hNext.y + r2.y * tScr
              segs.push({ from: { x: hNext.x, y: hNext.y }, to: { x: st.screenDist, y: sy } })
              hits.push({ y: sy, color: spec.color, name: spec.name, n })
            }
            exited = true; break
          } else {
            // 全内反射 → 镜面反射
            const dot = curDir.x * exitNx + curDir.y * exitNy
            curDir = { x: curDir.x - 2 * dot * exitNx, y: curDir.y - 2 * dot * exitNy }
            segs.push({ from: { x: curPt.x, y: curPt.y }, to: { x: hNext.x, y: hNext.y } })
            curPt = { x: hNext.x, y: hNext.y }
            lastFace = nextFace
          }
        }
        rays.push({ segs, color: spec.color, name: spec.name, n })
      }

      st.rays = rays; st.hits = hits
    } catch (e) { console.warn('computeRays error:', e) }
  }

  // ===== 渲染 =====
  function renderFrame(r) {
    try {
      const ctx = r.ctx, st = S.current
      r.clear()
      ctx.fillStyle = '#0a0e14'
      ctx.fillRect(0, 0, r.screenW, r.screenH)

      // ① 光屏（始终显示）
      drawScreen(ctx, r, st)
      // ② 光束
      if (st.flashOn && st.rays.length > 0) drawBeams(ctx, r, st)

      // DEBUG: 显示光路数据
      if (st.flashOn) {
        ctx.fillStyle = '#0f0'; ctx.font = '12px monospace'; ctx.textAlign = 'left'
        ctx.fillText(`rays=${st.rays.length} hits=${st.hits.length}`, 16, r.screenH - 40)
        if (st.rays.length > 0) ctx.fillText(`segs=${st.rays[0].segs.length}`, 16, r.screenH - 24)
      }
      // ③ 棱镜（画在光束上面）
      drawPrism(ctx, r, st)
      // ④ 激光器
      drawLaser(ctx, r, st)

      // ⑤ 实验说明（画在canvas左上角）
      try {
        ctx.save()
        ctx.textBaseline = 'top'
        const descW = 420, descH = 78
        ctx.fillStyle = 'rgba(13,17,23,0.9)'
        ctx.fillRect(10, 10, descW, descH)
        ctx.strokeStyle = 'rgba(79,195,247,0.2)'
        ctx.lineWidth = 1
        ctx.strokeRect(10, 10, descW, descH)
        ctx.textAlign = 'left'
        ctx.fillStyle = '#4FC3F7'; ctx.font = 'bold 12px sans-serif'
        ctx.fillText('\u{1F4D6} 实验说明', 18, 15)
        ctx.font = '11px sans-serif'; ctx.fillStyle = '#c9d1d9'
        ctx.fillText('白光通过三棱镜时，由于不同波长的光在同一介质中折射率不同：', 18, 33)
        ctx.fillStyle = '#FFD700'; ctx.fillText('紫光折射率最大、偏折最大', 18, 49)
        let x = 18 + ctx.measureText('紫光折射率最大、偏折最大').width
        ctx.fillStyle = '#c9d1d9'; ctx.fillText('；', x, 49); x += ctx.measureText('；').width
        ctx.fillStyle = '#FF4444'; ctx.fillText('红光折射率最小、偏折最小', x, 49)
        x += ctx.measureText('红光折射率最小、偏折最小').width
        ctx.fillStyle = '#c9d1d9'; ctx.fillText('。', x, 49)
        ctx.fillStyle = '#8b949e'
        ctx.fillText('白光被分解为七色光谱，称为光的色散。', 18, 65)
        ctx.restore()
      } catch(e) {}










    } catch (e) { console.warn('render error:', e) }
  }

  function drawBeams(ctx, r, st) {
    ctx.save()
    try {
      for (const ray of st.rays) {
        for (let i = 0; i < ray.segs.length; i++) {
          const seg = ray.segs[i]
          const [x1, y1] = r.worldToScreen(seg.from.x, seg.from.y)
          const [x2, y2] = r.worldToScreen(seg.to.x, seg.to.y)
          const color = (i === 0 && st.lightType === 'white') ? '#ffffff' : ray.color
          const alpha = i === 0 ? 0.8 : 0.9
          // 粗光束
          ctx.strokeStyle = color
          ctx.lineWidth = i === 0 ? 4 : 3
          ctx.globalAlpha = alpha * 0.3
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
          // 细光束
          ctx.lineWidth = i === 0 ? 2 : 1.5
          ctx.globalAlpha = alpha
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
        }
      }
    } finally { ctx.restore() }
  }

  function drawPrism(ctx, r, st) {
    const verts = prismVerts(0, 0, 1.2, st.prismRot)
    const pts = verts.map(v => r.worldToScreen(v.x, v.y))
    // 填充
    ctx.fillStyle = 'rgba(140,180,220,0.08)'
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    ctx.lineTo(pts[1][0], pts[1][1])
    ctx.lineTo(pts[2][0], pts[2][1])
    ctx.closePath()
    ctx.fill()
    // 边框
    ctx.strokeStyle = 'rgba(140,180,220,0.6)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    ctx.lineTo(pts[1][0], pts[1][1])
    ctx.lineTo(pts[2][0], pts[2][1])
    ctx.closePath()
    ctx.stroke()
  }

  function drawScreen(ctx, r, st) {
    const [sx] = r.worldToScreen(st.screenDist, 0)
    const [_, cy] = r.worldToScreen(0, 0)
    const scrH = 14.0 * r.scale

    // 屏幕主体
    const grad = ctx.createLinearGradient(sx - 5, 0, sx + 5, 0)
    grad.addColorStop(0, '#2a0000'); grad.addColorStop(0.5, '#440000'); grad.addColorStop(1, '#2a0000')
    ctx.fillStyle = grad
    ctx.fillRect(sx - 5, cy - scrH / 2, 10, scrH)
    ctx.strokeStyle = '#cc2222'; ctx.lineWidth = 2
    ctx.strokeRect(sx - 5, cy - scrH / 2, 10, scrH)
    // 支架
    ctx.fillStyle = '#555'; ctx.fillRect(sx - 12, cy + scrH / 2, 24, 4)
    ctx.fillStyle = '#444'; ctx.fillRect(sx - 3, cy + scrH / 2, 6, 22)
    ctx.fillStyle = '#333'; ctx.fillRect(sx - 10, cy + scrH / 2 + 22, 20, 4)

    // 色散光斑
    if (st.flashOn && st.hits.length > 0) {
      const sorted = [...st.hits].sort((a, b) => a.y - b.y)
      if (sorted.length > 1) {
        const [topY] = r.worldToScreen(st.screenDist, sorted[0].y)
        const [botY] = r.worldToScreen(st.screenDist, sorted[sorted.length - 1].y)
        const bandGrad = ctx.createLinearGradient(0, topY, 0, botY)
        for (const h of sorted) {
          const [py] = r.worldToScreen(st.screenDist, h.y)
          const ratio = (botY - topY) !== 0 ? Math.max(0, Math.min(1, (py - topY) / (botY - topY))) : 0.5
          bandGrad.addColorStop(ratio, h.color)
        }
        ctx.fillStyle = bandGrad; ctx.globalAlpha = 0.85
        ctx.fillRect(sx - 18, topY, 36, botY - topY)
        ctx.globalAlpha = 1
      }
      for (const h of sorted) {
        const [hy] = r.worldToScreen(st.screenDist, h.y)
        const spotR = Math.max(10, r.scale * 0.08)
        const glow = ctx.createRadialGradient(sx, hy, 0, sx, hy, spotR)
        glow.addColorStop(0, h.color); glow.addColorStop(0.6, h.color + '66'); glow.addColorStop(1, h.color + '00')
        ctx.fillStyle = glow; ctx.fillRect(sx - spotR, hy - spotR, spotR * 2, spotR * 2)
      }
    }
  }

  function drawLaser(ctx, r, st) {
    const [sx, sy] = r.worldToScreen(st.flashX, st.flashY)
    const s = r.scale
    const bw = 1.0 * s, bh = 0.5 * s

    ctx.save()
    ctx.translate(sx, sy)
    ctx.rotate(-st.flashDir * Math.PI / 180)

    const rr = bh * 0.15
    const left = -bw * 0.5, right = bw * 0.35
    const lensX = right + rr

    // 筒身
    const bodyGrad = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2)
    bodyGrad.addColorStop(0, '#2a2a2a'); bodyGrad.addColorStop(0.3, '#444'); bodyGrad.addColorStop(0.5, '#555')
    bodyGrad.addColorStop(0.7, '#3a3a3a'); bodyGrad.addColorStop(1, '#222')
    ctx.fillStyle = bodyGrad
    ctx.beginPath()
    ctx.moveTo(left + rr, -bh / 2); ctx.lineTo(right, -bh / 2)
    ctx.arcTo(right + rr, -bh / 2, right + rr, -bh / 2 + rr, rr)
    ctx.lineTo(right + rr, bh / 2 - rr)
    ctx.arcTo(right + rr, bh / 2, right, bh / 2, rr)
    ctx.lineTo(left + rr, bh / 2)
    ctx.arcTo(left, bh / 2, left, bh / 2 - rr, rr)
    ctx.lineTo(left, -bh / 2 + rr)
    ctx.arcTo(left, -bh / 2, left + rr, -bh / 2, rr)
    ctx.closePath(); ctx.fill()
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.5; ctx.stroke()

    // 前端金属环 + 透镜
    ctx.fillStyle = '#666'; ctx.fillRect(lensX - 4, -bh / 2 - 2, 8, bh + 4)
    const lg = ctx.createRadialGradient(lensX, 0, 0, lensX, 0, bh * 0.3)
    if (st.flashOn) {
      const bc = st.lightType === 'white' ? '#ffffff' : st.lightType === 'red' ? '#FF0000' : st.lightType === 'green' ? '#00CC00' : '#0066FF'
      lg.addColorStop(0, bc); lg.addColorStop(0.5, bc + '88'); lg.addColorStop(1, '#333')
    } else { lg.addColorStop(0, '#555'); lg.addColorStop(1, '#222') }
    ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(lensX, 0, bh * 0.3, 0, Math.PI * 2); ctx.fill()

    // 红色按钮
    const btnX = -bw * 0.1, btnY = -bh / 2 - bh * 0.08, ledR = bh * 0.14
    ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(btnX, btnY, ledR + 4, 0, Math.PI * 2); ctx.fill()
    const lgLed = ctx.createRadialGradient(btnX - ledR * 0.2, btnY - ledR * 0.2, 0, btnX, btnY, ledR)
    if (st.flashOn) { lgLed.addColorStop(0, '#f44'); lgLed.addColorStop(0.6, '#c00'); lgLed.addColorStop(1, '#800') }
    else { lgLed.addColorStop(0, '#844'); lgLed.addColorStop(0.6, '#522'); lgLed.addColorStop(1, '#311') }
    ctx.fillStyle = lgLed; ctx.beginPath(); ctx.arc(btnX, btnY, ledR, 0, Math.PI * 2); ctx.fill()

    // 纹理
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1
    for (let i = left + bh * 0.3; i < right - bh * 0.2; i += bh * 0.2) {
      ctx.beginPath(); ctx.moveTo(i, -bh / 2 + 3); ctx.lineTo(i, bh / 2 - 3); ctx.stroke()
    }

    ctx.restore()
  }

  const st = S.current

  return (
    <div style={S_.container}>
      <div style={S_.toolbar}>
        <span style={S_.title}>🔬 三棱镜色散</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {[{ k: 'white', l: '白光', c: '#ffffff' }, { k: 'red', l: '红光', c: '#FF0000' }, { k: 'green', l: '绿光', c: '#00CC00' }, { k: 'blue', l: '蓝光', c: '#0066FF' }].map(m => (
            <button key={m.k} style={{ ...S_.modeBtn, background: st.lightType === m.k ? m.c : 'transparent', color: st.lightType === m.k ? (m.k === 'white' ? '#000' : '#ffffff') : '#8b949e', borderColor: st.lightType === m.k ? m.c : '#30363d' }}
              onClick={() => { S.current.lightType = m.k; computeRays(); rerender() }}>{m.l}</button>
          ))}
        </div>
      </div>
      <div style={S_.main}>
        <canvas ref={canvasRef} style={{ ...S_.canvas, cursor: st.cursor }} />
        <div style={S_.panel}>
          <div style={S_.sec}>
            <div style={S_.secTitle}>⚙️ 参数</div>
            <label style={S_.label}>折射率 n₀ =
              <input type="range" min="1.3" max="2.0" step="0.01" value={st.baseN} onChange={e => { S.current.baseN = +e.target.value; computeRays(); rerender() }} style={S_.slider} />
              <span style={S_.val}>{st.baseN.toFixed(3)}</span>
            </label>
            <label style={S_.label}>屏距 L =
              <input type="range" min="1" max="6" step="0.1" value={st.screenDist} onChange={e => { S.current.screenDist = +e.target.value; rerender() }} style={S_.slider} />
              <span style={S_.val}>{st.screenDist.toFixed(1)} m</span>
            </label>
          </div>
          <div style={S_.sec}>
            <div style={S_.secTitle}>📊 数据</div>
            {st.hits.length > 0 ? [...st.hits].sort((a, b) => a.y - b.y).map((h, i) =>
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0' }}>
                <span style={{ color: h.color, fontWeight: 600 }}>{h.name}</span>
                <span style={{ color: h.color, fontFamily: 'monospace' }}>n={h.n.toFixed(3)}</span>
              </div>
            ) : <div style={{ fontSize: 12, color: '#484f58' }}>点击红点开灯</div>}
          </div>
          <div style={S_.sec}>
            <div style={S_.secTitle}>💡 操作</div>
            <div style={{ fontSize: 11, color: '#484f58', padding: '2px 0' }}>🔴 红点开关</div>
            <div style={{ fontSize: 11, color: '#484f58', padding: '2px 0' }}>↔ 拖拽移动</div>
            <div style={{ fontSize: 11, color: '#484f58', padding: '2px 0' }}>↻ 拖拽旋转</div>
          </div>
        </div>
      </div>
      <div style={S_.status}>
        <span style={{ color: st.flashOn && st.hits.length >= 2 ? '#FFD700' : '#484f58' }}>
          {st.flashOn && st.hits.length >= 2
            ? (() => { const s = [...st.hits].sort((a, b) => a.y - b.y); const d = (h) => Math.atan2(h.y - st.flashY, st.screenDist - st.flashX) * 180 / Math.PI; return `红→紫 Δδ=${(d(s[s.length-1]) - d(s[0])).toFixed(2)}°` })()
            : '点击红点开灯'}
        </span>
        <span style={{ color: '#484f58', marginLeft: 'auto' }}>n={st.baseN.toFixed(3)}</span>
      </div>
    </div>
  )
}

const S_ = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#0d1117', color: '#c9d1d9', fontFamily: 'system-ui, sans-serif' },
  toolbar: { height: 44, background: '#161b22', borderBottom: '1px solid #30363d', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flexShrink: 0 },
  title: { fontSize: 15, fontWeight: 600 },
  modeBtn: { padding: '4px 10px', fontSize: 11, borderRadius: 4, border: '1px solid #30363d', cursor: 'pointer', fontFamily: 'inherit' },
  main: { flex: 1, display: 'flex', overflow: 'hidden' },
  canvas: { flex: 1, width: '100%' },
  panel: { width: 200, background: '#161b22', borderLeft: '1px solid #30363d', overflowY: 'auto', flexShrink: 0 },
  sec: { padding: '10px 12px', borderBottom: '1px solid #21262d' },
  secTitle: { fontSize: 13, fontWeight: 600, marginBottom: 6 },
  label: { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12, color: '#8b949e', marginBottom: 6 },
  slider: { width: '100%', accentColor: '#4FC3F7' },
  val: { color: '#4FC3F7', fontWeight: 600, fontFamily: 'monospace', fontSize: 12 },
  status: { height: 24, background: '#161b22', borderTop: '1px solid #30363d', display: 'flex', alignItems: 'center', padding: '0 14px', fontSize: 11, color: '#484f58', flexShrink: 0 },
}
