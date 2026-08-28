import { useRef, useEffect, useState } from 'react'
import { SceneRenderer } from '../renderers/SceneRenderer'

/**
 * InterferenceDiffractionScene — 光的干涉与衍射实验
 *
 * 激光器（红色按钮）→ 双缝/单缝 → 观察屏
 */

const WAVELENGTH_COLOR = (wl) => {
  if (wl < 420) return '#8B00FF'
  if (wl < 460) return '#4400FF'
  if (wl < 500) return '#0088FF'
  if (wl < 540) return '#00CC66'
  if (wl < 580) return '#88CC00'
  if (wl < 620) return '#FFAA00'
  if (wl < 660) return '#FF4400'
  return '#CC0000'
}

export default function InterferenceDiffractionScene() {
  const canvasRef = useRef(null)
  const rendererRef = useRef(null)
  const animRef = useRef(null)

  // ===== 单一状态源 =====
  const S = useRef({
    laserOn: false,
    laserX: -5,
    laserY: 0,
    mode: 'interference',  // 'interference' | 'diffraction' | 'both'
    slitSep: 0.4,
    slitWidth: 0.08,
    wavelength: 550,
    screenDist: 2.0,
    // 鼠标交互
    mouse: { mode: 'idle', target: null, startSx: 0, startSy: 0, offSx: 0, offSy: 0, moved: false },
    cursor: 'default',
    // 计算结果
    pattern: null,
    fringeSpacing: 0,
  })

  // tick 仅用于触发 React 重绘（UI 面板用）
  const [tick, setTick] = useState(0)
  const rerender = () => setTick(t => t + 1)

  // ===== 初始化渲染器 + 绑定事件 =====
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const renderer = new SceneRenderer(canvas)
    rendererRef.current = renderer
    renderer.resize()

    // 渲染循环
    const loop = () => {
      renderFrame(renderer)
      animRef.current = requestAnimationFrame(loop)
    }
    loop()

    // ===== 鼠标事件（绑定一次，读写 S.current）=====
    function getMousePos(e) {
      const rect = canvas.getBoundingClientRect()
      return [e.clientX - rect.left, e.clientY - rect.top]
    }

    function onDown(e) {
      const st = S.current
      const [sx, sy] = getMousePos(e)
      const r = renderer

      const [lSx, lSy] = r.worldToScreen(st.laserX, st.laserY)
      const s = r.scale
      const bw = 0.8 * s * 1.1   // 筒身宽
      const bh = 0.4 * s          // 筒身高

      // 按钮（筒身上方小圆）
      const btnX = lSx - bw * 0.1
      const btnY = lSy - bh * 0.5 - bh * 0.2 * 0.3
      const btnR = bh * 0.2
      const dBtn = Math.sqrt((sx - btnX) ** 2 + (sy - btnY) ** 2)

      if (dBtn < btnR * 3.5) {
        st.mouse = { mode: 'pressed', target: 'button', startSx: sx, startSy: sy, moved: false }
        st.cursor = 'pointer'
        rerender()
        return
      }
      if (Math.abs(sx - lSx) < bw * 0.7 && Math.abs(sy - lSy) < bh) {
        st.mouse = { mode: 'drag', target: 'laser', startSx: sx, startSy: sy, offSx: sx - lSx, offSy: sy - lSy, moved: false }
        st.cursor = 'grabbing'
        rerender()
        return
      }
    }

    function onMove(e) {
      const st = S.current
      const m = st.mouse
      const [sx, sy] = getMousePos(e)

      if (m.mode === 'drag' && m.target === 'laser') {
        m.moved = true
        const [newWx, newWy] = renderer.screenToWorld(sx - m.offSx, sy - m.offSy)
        st.laserX = newWx
        st.laserY = newWy
        computePattern()
        rerender()
        return
      }
      if (m.mode === 'pressed') {
        const dx = sx - m.startSx, dy = sy - m.startSy
        if (Math.sqrt(dx * dx + dy * dy) > 5) {
          m.moved = true
          const [lSx, lSy] = renderer.worldToScreen(st.laserX, st.laserY)
          m.mode = 'drag'
          m.target = 'laser'
          m.offSx = m.startSx - lSx
          m.offSy = m.startSy - lSy
          st.cursor = 'grabbing'
          rerender()
        }
        return
      }

      // 悬停
      const [lSx, lSy] = renderer.worldToScreen(st.laserX, st.laserY)
      const s = renderer.scale
      const bw = 0.8 * s * 1.1
      const bh = 0.4 * s
      const btnX = lSx - bw * 0.1
      const btnY = lSy - bh * 0.5 - bh * 0.2 * 0.3
      const btnR = bh * 0.2
      const dBtn = Math.sqrt((sx - btnX) ** 2 + (sy - btnY) ** 2)

      let newCursor = 'default'
      if (dBtn < btnR * 3.5) newCursor = 'pointer'
      else if (Math.abs(sx - lSx) < bw * 0.7 && Math.abs(sy - lSy) < bh) newCursor = 'grab'

      if (newCursor !== st.cursor) {
        st.cursor = newCursor
        rerender()
      }
    }

    function onUp() {
      const st = S.current
      const m = st.mouse
      if (m.mode === 'pressed' && !m.moved) {
        st.laserOn = !st.laserOn
        computePattern()
      }
      st.mouse = { mode: 'idle', target: null, moved: false }
      st.cursor = 'default'
      rerender()
    }

    function onLeave() {
      S.current.mouse = { mode: 'idle', target: null, moved: false }
      S.current.cursor = 'default'
      rerender()
    }

    function onCtx(e) { e.preventDefault() }

    canvas.addEventListener('mousedown', onDown)
    canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('mouseup', onUp)
    canvas.addEventListener('mouseleave', onLeave)
    canvas.addEventListener('contextmenu', onCtx)

    const onResize = () => renderer.resize()
    window.addEventListener('resize', onResize)

    // 初始计算
    computePattern()

    return () => {
      canvas.removeEventListener('mousedown', onDown)
      canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('mouseup', onUp)
      canvas.removeEventListener('mouseleave', onLeave)
      canvas.removeEventListener('contextmenu', onCtx)
      window.removeEventListener('resize', onResize)
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [])  // 只运行一次

  // ===== 物理计算 =====
  function computePattern() {
    const st = S.current
    const d = st.slitSep * 1e-3
    const a = st.slitWidth * 1e-3
    const wl = st.wavelength * 1e-9
    const L = st.screenDist
    const screenH = 3.0
    const N = 600

    const pattern = []
    for (let i = 0; i < N; i++) {
      const y = -screenH / 2 + (screenH / (N - 1)) * i
      const sinTheta = y / Math.sqrt(y * y + L * L)
      const phaseI = Math.PI * d * sinTheta / wl
      const I_interf = Math.cos(phaseI) ** 2
      const phaseD = Math.PI * a * sinTheta / wl
      const I_diff = Math.abs(phaseD) < 1e-10 ? 1 : (Math.sin(phaseD) / phaseD) ** 2
      let I = 1
      if (st.mode === 'interference') I = I_interf
      else if (st.mode === 'diffraction') I = I_diff
      else I = I_interf * I_diff
      pattern.push({ y, I, I_interf, I_diff })
    }
    st.pattern = pattern
    st.fringeSpacing = wl * L / d
  }

  // ===== 渲染 =====
  function renderFrame(renderer) {
    const ctx = renderer.ctx
    const st = S.current
    renderer.clear()
    ctx.fillStyle = '#0a0e14'
    ctx.fillRect(0, 0, renderer.screenW, renderer.screenH)

    if (st.laserOn && st.pattern) drawLaserBeam(ctx, renderer, st)
    drawSlits(ctx, renderer, st)
    if (st.laserOn && st.pattern) drawScreen(ctx, renderer, st)
    drawLaser(ctx, renderer, st)
    if (st.pattern) drawDescription(ctx, renderer, st)
  }

  function drawLaserBeam(ctx, r, st) {
    const [lx, ly] = r.worldToScreen(st.laserX, st.laserY)
    const [sx, sy] = r.worldToScreen(0, 0)
    const color = WAVELENGTH_COLOR(st.wavelength)
    const beamW = Math.max(3, r.scale * 0.03)

    ctx.strokeStyle = color
    ctx.lineWidth = beamW * 4; ctx.globalAlpha = 0.06
    ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(sx, sy); ctx.stroke()
    ctx.lineWidth = beamW * 2; ctx.globalAlpha = 0.15
    ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(sx, sy); ctx.stroke()
    ctx.lineWidth = beamW; ctx.globalAlpha = 0.7
    ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(sx, sy); ctx.stroke()
    ctx.globalAlpha = 1

    const [scrX] = r.worldToScreen(st.screenDist, 0)
    const beamLen = scrX - sx
    ctx.fillStyle = color
    ctx.globalAlpha = 0.04
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(sx + beamLen, sy - beamLen * 0.15)
    ctx.lineTo(sx + beamLen, sy + beamLen * 0.15)
    ctx.closePath(); ctx.fill()
    ctx.globalAlpha = 1

    ctx.fillStyle = color; ctx.globalAlpha = 0.8
    ctx.beginPath(); ctx.arc(sx, sy, 4, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1
  }

  function drawSlits(ctx, r, st) {
    const [sx, sy] = r.worldToScreen(0, 0)
    const boardH = 140, boardW = 10, slitGap = 40, slitOpen = 10
    const color = WAVELENGTH_COLOR(st.wavelength)

    ctx.fillStyle = '#1a2030'
    ctx.fillRect(sx - boardW / 2, sy - boardH, boardW, boardH * 2)
    ctx.strokeStyle = '#4a5568'; ctx.lineWidth = 1
    ctx.strokeRect(sx - boardW / 2, sy - boardH, boardW, boardH * 2)

    if (st.mode === 'diffraction') {
      const slitH = slitOpen
      ctx.fillStyle = '#0a0e14'
      ctx.fillRect(sx - boardW / 2 - 1, sy - slitH / 2, boardW + 2, slitH)
      ctx.shadowColor = color; ctx.shadowBlur = 12
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.globalAlpha = 0.7
      ctx.beginPath(); ctx.moveTo(sx - boardW / 2, sy - slitH / 2); ctx.lineTo(sx + boardW / 2, sy - slitH / 2); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(sx - boardW / 2, sy + slitH / 2); ctx.lineTo(sx + boardW / 2, sy + slitH / 2); ctx.stroke()
      ctx.shadowBlur = 0; ctx.globalAlpha = 1
      const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, slitH)
      grad.addColorStop(0, color + '44'); grad.addColorStop(1, color + '00')
      ctx.fillStyle = grad; ctx.fillRect(sx - boardW, sy - slitH, boardW * 2, slitH * 2)
      ctx.fillStyle = '#FF9800'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText(`a=${(st.slitWidth * 1000).toFixed(0)}μm`, sx + boardW / 2 + 8, sy + 4)
    } else {
      const halfGap = slitGap / 2, slitH = slitOpen
      ctx.fillStyle = '#0a0e14'
      ctx.fillRect(sx - boardW / 2 - 1, sy - halfGap - slitH / 2, boardW + 2, slitH)
      ctx.fillRect(sx - boardW / 2 - 1, sy + halfGap - slitH / 2, boardW + 2, slitH)
      ctx.shadowColor = color; ctx.shadowBlur = 12
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.globalAlpha = 0.7
      ctx.beginPath(); ctx.moveTo(sx - boardW / 2, sy - halfGap - slitH / 2); ctx.lineTo(sx + boardW / 2, sy - halfGap - slitH / 2); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(sx - boardW / 2, sy - halfGap + slitH / 2); ctx.lineTo(sx + boardW / 2, sy - halfGap + slitH / 2); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(sx - boardW / 2, sy + halfGap - slitH / 2); ctx.lineTo(sx + boardW / 2, sy + halfGap - slitH / 2); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(sx - boardW / 2, sy + halfGap + slitH / 2); ctx.lineTo(sx + boardW / 2, sy + halfGap + slitH / 2); ctx.stroke()
      ctx.shadowBlur = 0; ctx.globalAlpha = 1
      const g1 = ctx.createRadialGradient(sx, sy - halfGap, 0, sx, sy - halfGap, slitH)
      g1.addColorStop(0, color + '44'); g1.addColorStop(1, color + '00')
      ctx.fillStyle = g1; ctx.fillRect(sx - boardW, sy - halfGap - slitH, boardW * 2, slitH * 2)
      const g2 = ctx.createRadialGradient(sx, sy + halfGap, 0, sx, sy + halfGap, slitH)
      g2.addColorStop(0, color + '44'); g2.addColorStop(1, color + '00')
      ctx.fillStyle = g2; ctx.fillRect(sx - boardW, sy + halfGap - slitH, boardW * 2, slitH * 2)
      ctx.fillStyle = '#4FC3F7'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText('S₁', sx + boardW / 2 + 8, sy - halfGap + 4)
      ctx.fillText('S₂', sx + boardW / 2 + 8, sy + halfGap + 4)
      const arrowX = sx - boardW / 2 - 16
      ctx.strokeStyle = 'rgba(79,195,247,0.5)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3])
      ctx.beginPath(); ctx.moveTo(arrowX, sy - halfGap); ctx.lineTo(arrowX, sy + halfGap); ctx.stroke(); ctx.setLineDash([])
      ctx.fillStyle = '#4FC3F7'
      ctx.beginPath(); ctx.moveTo(arrowX, sy - halfGap); ctx.lineTo(arrowX - 3, sy - halfGap + 6); ctx.lineTo(arrowX + 3, sy - halfGap + 6); ctx.closePath(); ctx.fill()
      ctx.beginPath(); ctx.moveTo(arrowX, sy + halfGap); ctx.lineTo(arrowX - 3, sy + halfGap - 6); ctx.lineTo(arrowX + 3, sy + halfGap - 6); ctx.closePath(); ctx.fill()
      ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'right'
      ctx.fillText(`d=${(st.slitSep * 1000).toFixed(1)}mm`, arrowX - 4, sy + 4)
    }
    ctx.fillStyle = '#8b949e'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(st.mode === 'diffraction' ? '单缝' : '双缝', sx, sy - boardH - 10)
  }

  function drawScreen(ctx, r, st) {
    const [sx] = r.worldToScreen(st.screenDist, 0)
    const [_, cy] = r.worldToScreen(0, 0)
    const scrHPx = 3.0 * r.scale
    const color = WAVELENGTH_COLOR(st.wavelength)
    const pattern = st.pattern

    ctx.fillStyle = '#0d1117'
    ctx.fillRect(sx - 4, cy - scrHPx / 2, 8, scrHPx)
    ctx.strokeStyle = '#30363d'; ctx.lineWidth = 1
    ctx.strokeRect(sx - 4, cy - scrHPx / 2, 8, scrHPx)
    ctx.fillStyle = '#333'
    ctx.fillRect(sx - 10, cy + scrHPx / 2, 20, 6)
    ctx.fillRect(sx - 4, cy + scrHPx / 2, 8, 24)

    for (let i = 0; i < pattern.length; i++) {
      const p = pattern[i]
      const [py] = r.worldToScreen(st.screenDist, p.y)
      const nextY = i < pattern.length - 1 ? pattern[i + 1].y : p.y
      const [npy] = r.worldToScreen(st.screenDist, nextY)
      const h = Math.max(1, Math.abs(npy - py))
      ctx.globalAlpha = Math.pow(Math.max(0, Math.min(1, p.I)), 0.6)
      ctx.fillStyle = color
      ctx.fillRect(sx - 14, py - h / 2, 28, h)
    }
    ctx.globalAlpha = 1

    ctx.fillStyle = '#8b949e'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('观察屏', sx, cy + scrHPx / 2 + 36)

    const [lx0] = r.worldToScreen(0, 0)
    const ly = cy + scrHPx / 2 + 50
    ctx.strokeStyle = 'rgba(79,195,247,0.3)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(lx0, ly); ctx.lineTo(sx, ly); ctx.stroke(); ctx.setLineDash([])
    ctx.fillStyle = '#4FC3F7'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(`L = ${st.screenDist.toFixed(1)}m`, (lx0 + sx) / 2, ly + 14)

    if (st.mode !== 'diffraction' && st.fringeSpacing > 0) {
      const fsPx = st.fringeSpacing * r.scale
      if (fsPx > 4) {
        const annotX = sx + 24
        ctx.strokeStyle = 'rgba(255,215,0,0.4)'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(annotX, cy); ctx.lineTo(annotX, cy + fsPx); ctx.stroke()
        ctx.fillStyle = '#FFD700'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'
        ctx.fillText(`Δy=${(st.fringeSpacing * 1000).toFixed(2)}mm`, annotX + 4, cy + fsPx / 2 + 3)
      }
    }

    // 光强曲线
    const curveW = 50
    const curveX = sx - 30
    ctx.strokeStyle = 'rgba(100,180,255,0.15)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(curveW, cy - scrHPx / 2); ctx.lineTo(curveW, cy + scrHPx / 2); ctx.stroke()
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath()
    for (let i = 0; i < pattern.length; i++) {
      const [py] = r.worldToScreen(st.screenDist, pattern[i].y)
      const px = curveX - curveW + pattern[i].I * curveW
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.stroke()
  }

  function drawLaser(ctx, renderer, st) {
    const [lx, ly] = renderer.worldToScreen(st.laserX, st.laserY)
    const s = renderer.scale
    const bodyW = 0.8 * s, bodyH = 0.4 * s
    const color = WAVELENGTH_COLOR(st.wavelength)

    ctx.save(); ctx.translate(lx, ly)

    if (st.laserOn) {
      const glow = ctx.createRadialGradient(bodyW * 0.4, 0, 0, bodyW * 0.4, 0, bodyW * 0.6)
      glow.addColorStop(0, color + '88'); glow.addColorStop(0.5, color + '22'); glow.addColorStop(1, color + '00')
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(bodyW * 0.4, 0, bodyW * 0.6, 0, Math.PI * 2); ctx.fill()
    }

    const bw = bodyW * 1.1, bh = bodyH
    const bodyGrad = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2)
    bodyGrad.addColorStop(0, '#882222'); bodyGrad.addColorStop(0.3, '#cc3333'); bodyGrad.addColorStop(0.5, '#dd4444'); bodyGrad.addColorStop(0.7, '#bb3333'); bodyGrad.addColorStop(1, '#772222')
    ctx.fillStyle = bodyGrad
    const r2 = bh * 0.2
    ctx.beginPath()
    ctx.moveTo(-bw * 0.5 + r2, -bh / 2); ctx.lineTo(bw * 0.3, -bh / 2)
    ctx.arcTo(bw * 0.3 + r2, -bh / 2, bw * 0.3 + r2, -bh / 2 + r2, r2)
    ctx.lineTo(bw * 0.3 + r2, bh / 2 - r2)
    ctx.arcTo(bw * 0.3 + r2, bh / 2, bw * 0.3, bh / 2, r2)
    ctx.lineTo(-bw * 0.5 + r2, bh / 2)
    ctx.arcTo(-bw * 0.5, bh / 2, -bw * 0.5, bh / 2 - r2, r2)
    ctx.lineTo(-bw * 0.5, -bh / 2 + r2)
    ctx.arcTo(-bw * 0.5, -bh / 2, -bw * 0.5 + r2, -bh / 2, r2)
    ctx.closePath(); ctx.fill()
    ctx.strokeStyle = '#551111'; ctx.lineWidth = 1.5; ctx.stroke()

    const lensX = bw * 0.3 + r2
    ctx.fillStyle = st.laserOn ? color : '#333'
    ctx.beginPath(); ctx.arc(lensX, 0, bh * 0.25, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#551111'; ctx.lineWidth = 1; ctx.stroke()

    // 红色按钮
    const btnR = bh * 0.2, btnX = -bw * 0.1, btnY = -bh / 2 - btnR * 0.3
    ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(btnX, btnY, btnR * 1.3, 0, Math.PI * 2); ctx.fill()
    const btnGrad = ctx.createRadialGradient(btnX - btnR * 0.2, btnY - btnR * 0.2, 0, btnX, btnY, btnR)
    if (st.laserOn) { btnGrad.addColorStop(0, '#ff4444'); btnGrad.addColorStop(0.7, '#cc0000'); btnGrad.addColorStop(1, '#880000') }
    else { btnGrad.addColorStop(0, '#ff6666'); btnGrad.addColorStop(0.7, '#dd2222'); btnGrad.addColorStop(1, '#aa0000') }
    ctx.fillStyle = btnGrad; ctx.beginPath(); ctx.arc(btnX, btnY, btnR, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(btnX - btnR * 0.15, btnY - btnR * 0.15, btnR * 0.4, btnR * 0.25, -0.5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = st.laserOn ? '#ff4444' : '#666'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(st.laserOn ? 'ON' : 'OFF', btnX, btnY + btnR * 1.8)

    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1
    for (let i = -bw * 0.35; i < bw * 0.1; i += bh * 0.25) {
      ctx.beginPath(); ctx.moveTo(i, -bh / 2 + 2); ctx.lineTo(i, bh / 2 - 2); ctx.stroke()
    }

    ctx.restore()

    ctx.fillStyle = st.laserOn ? color : '#8b949e'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('激光器', lx, ly + bodyH * 1.3)
  }

  function drawDescription(ctx, r, st) {
    const x = 16; let y = 20
    ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    const title = st.mode === 'interference' ? '双缝干涉' : st.mode === 'diffraction' ? '单缝衍射' : '干涉+衍射'
    ctx.fillStyle = '#c9d1d9'; ctx.font = 'bold 16px sans-serif'
    ctx.fillText(`🔬 ${title}`, x, y); y += 28
    const color = WAVELENGTH_COLOR(st.wavelength)
    ctx.fillStyle = color; ctx.font = 'bold 13px serif'
    if (st.mode === 'interference' || st.mode === 'both') { ctx.fillText('明纹: d·sinθ = mλ', x, y); y += 20 }
    if (st.mode === 'diffraction' || st.mode === 'both') { ctx.fillStyle = '#FF9800'; ctx.fillText('暗纹: a·sinθ = mλ', x, y); y += 20 }
    if (st.laserOn) {
      y += 6
      ctx.fillStyle = '#8b949e'; ctx.font = '12px sans-serif'
      ctx.fillText(`缝间距 d = ${(st.slitSep * 1000).toFixed(1)} mm`, x, y); y += 18
      ctx.fillText(`缝宽 a = ${(st.slitWidth * 1000).toFixed(0)} μm`, x, y); y += 18
      ctx.fillText(`屏距 L = ${st.screenDist.toFixed(1)} m`, x, y); y += 18
      ctx.fillStyle = '#FFD700'; ctx.font = 'bold 12px sans-serif'
      if (st.mode !== 'diffraction' && st.fringeSpacing > 0) { ctx.fillText(`条纹间距 Δy = ${(st.fringeSpacing * 1000).toFixed(3)} mm`, x, y); y += 18 }
      ctx.fillStyle = '#8b949e'; ctx.font = '11px sans-serif'
      ctx.fillText(`最大级数 m ≈ ${Math.floor(st.slitSep * 1e-3 / (st.wavelength * 1e-9))}`, x, y)
    } else {
      y += 10; ctx.fillStyle = '#484f58'; ctx.font = '12px sans-serif'
      ctx.fillText('点击激光器红色按钮开灯', x, y)
    }
  }

  // ===== UI 控件（React）=====
  const st = S.current
  const color = WAVELENGTH_COLOR(st.wavelength)

  const ruleText = !st.laserOn ? { text: '点击激光器红色按钮开灯', color: '#484f58' }
    : st.mode === 'interference' ? { text: `双缝干涉：Δy = λL/d = ${(st.fringeSpacing * 1000).toFixed(3)}mm`, color: '#4CAF50' }
    : st.mode === 'diffraction' ? { text: `单缝衍射：中央明纹宽度 ∝ 2λL/a`, color: '#FF9800' }
    : { text: `干涉×衍射：I = I₀·cos²·sinc²`, color: '#4FC3F7' }

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <span style={styles.title}>🔬 光的干涉与衍射</span>
        <div style={styles.toolbarActions}>
          <div style={styles.modeGroup}>
            {[{ key: 'interference', label: '双缝干涉' }, { key: 'diffraction', label: '单缝衍射' }, { key: 'both', label: '干涉+衍射' }].map(m => (
              <button key={m.key} style={{
                ...styles.modeBtn,
                background: st.mode === m.key ? '#2196F3' : 'transparent',
                color: st.mode === m.key ? '#fff' : '#8b949e',
                borderColor: st.mode === m.key ? '#2196F3' : '#30363d',
              }} onClick={() => { S.current.mode = m.key; computePattern(); rerender() }}>{m.label}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={styles.main}>
        <canvas ref={canvasRef} style={{ ...styles.canvas, cursor: st.cursor }} />

        <div style={styles.panel}>
          <div style={styles.panelSection}>
            <div style={styles.panelTitle}>📐 公式</div>
            {(st.mode === 'interference' || st.mode === 'both') && <><div style={styles.formula}><span style={styles.formulaMain}>d·sinθ = mλ</span></div><div style={styles.formulaSub}>双缝干涉明纹条件</div></>}
            {(st.mode === 'diffraction' || st.mode === 'both') && <><div style={{ ...styles.formula, marginTop: 8 }}><span style={{ ...styles.formulaMain, color: '#FF9800' }}>a·sinθ = mλ</span></div><div style={styles.formulaSub}>单缝衍射暗纹条件</div></>}
          </div>

          <div style={styles.panelSection}>
            <div style={styles.panelTitle}>⚙️ 参数调节</div>
            <label style={styles.sliderLabel}>缝间距 d =
              <input type="range" min="0.1" max="1.0" step="0.01" value={st.slitSep} onChange={(e) => { S.current.slitSep = parseFloat(e.target.value); computePattern(); rerender() }} style={styles.slider} />
              <span style={styles.sliderValue}>{st.slitSep.toFixed(2)} mm</span>
            </label>
            <label style={styles.sliderLabel}>缝宽 a =
              <input type="range" min="0.01" max="0.5" step="0.01" value={st.slitWidth} onChange={(e) => { S.current.slitWidth = parseFloat(e.target.value); computePattern(); rerender() }} style={styles.slider} />
              <span style={styles.sliderValue}>{(st.slitWidth * 1000).toFixed(0)} μm</span>
            </label>
            <label style={styles.sliderLabel}>波长 λ =
              <input type="range" min="380" max="700" step="5" value={st.wavelength} onChange={(e) => { S.current.wavelength = parseFloat(e.target.value); computePattern(); rerender() }} style={{ ...styles.slider, accentColor: color }} />
              <span style={{ ...styles.sliderValue, color }}>{st.wavelength} nm</span>
            </label>
            <label style={styles.sliderLabel}>屏距 L =
              <input type="range" min="0.5" max="5.0" step="0.1" value={st.screenDist} onChange={(e) => { S.current.screenDist = parseFloat(e.target.value); computePattern(); rerender() }} style={styles.slider} />
              <span style={styles.sliderValue}>{st.screenDist.toFixed(1)} m</span>
            </label>
          </div>

          <div style={styles.panelSection}>
            <div style={styles.panelTitle}>📊 实时数据</div>
            <DataRow label="条纹间距 Δy" value={st.laserOn ? `${(st.fringeSpacing * 1000).toFixed(3)} mm` : '—'} color="#FFD700" />
            <DataRow label="波长 λ" value={`${st.wavelength} nm`} color={color} />
            <DataRow label="最大级数" value={`m ≈ ${Math.floor(st.slitSep * 1e-3 / (st.wavelength * 1e-9))}`} color="#4FC3F7" />
          </div>

          <div style={styles.panelSection}>
            <div style={styles.panelTitle}>💡 物理要点</div>
            {st.mode === 'interference' && <><div style={styles.rayDesc}><span style={{ color: '#FFD700' }}>①</span> 两束相干光叠加产生明暗条纹</div><div style={styles.rayDesc}><span style={{ color: '#4CAF50' }}>②</span> 明纹间距 Δy = λL/d</div><div style={styles.rayDesc}><span style={{ color: '#4FC3F7' }}>③</span> d越小、L越大 → 条纹越宽</div></>}
            {st.mode === 'diffraction' && <><div style={styles.rayDesc}><span style={{ color: '#FF9800' }}>①</span> 光通过狭缝后偏离直线传播</div><div style={styles.rayDesc}><span style={{ color: '#4CAF50' }}>②</span> 中央明纹最宽最亮</div><div style={styles.rayDesc}><span style={{ color: '#4FC3F7' }}>③</span> a越小 → 衍射越明显</div></>}
            {st.mode === 'both' && <><div style={styles.rayDesc}><span style={{ color: '#FFD700' }}>①</span> 双缝干涉受单缝衍射调制</div><div style={styles.rayDesc}><span style={{ color: '#4CAF50' }}>②</span> 合成光强 = 干涉 × 衍射</div><div style={styles.rayDesc}><span style={{ color: '#4FC3F7' }}>③</span> 缺级：d/a为整数时某些级消失</div></>}
          </div>

          <div style={styles.panelSection}>
            <div style={styles.panelTitle}>🎯 操作</div>
            <div style={styles.hint}>🔴 点击红色按钮开激光器</div>
            <div style={styles.hint}>↔ 拖拽激光器调整位置</div>
            <div style={styles.hint}>调节波长观察颜色变化</div>
          </div>
        </div>
      </div>

      <div style={styles.statusBar}>
        <span style={{ color: ruleText.color }}>{ruleText.text}</span>
        <span style={{ color: '#484f58', marginLeft: 'auto' }}>
          {st.mode === 'interference' ? '双缝干涉' : st.mode === 'diffraction' ? '单缝衍射' : '干涉+衍射'} · λ={st.wavelength}nm
        </span>
      </div>
    </div>
  )
}

function DataRow({ label, value, color }) {
  return <div style={styles.dataRow}><span style={styles.dataLabel}>{label}</span><span style={{ ...styles.dataValue, color }}>{value}</span></div>
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#0d1117', color: '#c9d1d9', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  toolbar: { height: 44, background: '#161b22', borderBottom: '1px solid #30363d', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flexShrink: 0 },
  title: { fontSize: 15, fontWeight: 600 },
  toolbarActions: { display: 'flex', alignItems: 'center', gap: 12 },
  modeGroup: { display: 'flex', gap: 4 },
  modeBtn: { padding: '4px 12px', fontSize: 12, borderRadius: 4, border: '1px solid #30363d', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' },
  main: { flex: 1, display: 'flex', overflow: 'hidden' },
  canvas: { flex: 1, width: '100%' },
  panel: { width: 260, background: '#161b22', borderLeft: '1px solid #30363d', overflowY: 'auto', flexShrink: 0 },
  panelSection: { padding: '12px 14px', borderBottom: '1px solid #21262d' },
  panelTitle: { fontSize: 13, fontWeight: 600, color: '#c9d1d9', marginBottom: 8 },
  formula: { textAlign: 'center', margin: '6px 0' },
  formulaMain: { fontSize: 18, fontWeight: 700, color: '#4FC3F7', fontFamily: 'Georgia, "Times New Roman", serif', letterSpacing: 1 },
  formulaSub: { textAlign: 'center', fontSize: 11, color: '#8b949e', marginTop: 2 },
  sliderLabel: { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12, color: '#8b949e', marginBottom: 8 },
  slider: { width: '100%', accentColor: '#4FC3F7' },
  sliderValue: { color: '#4FC3F7', fontWeight: 600, fontFamily: 'monospace', fontSize: 12 },
  dataRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: 12 },
  dataLabel: { color: '#8b949e' },
  dataValue: { fontWeight: 600, fontFamily: 'monospace', fontSize: 13 },
  rayDesc: { fontSize: 12, color: '#8b949e', padding: '2px 0' },
  hint: { fontSize: 11, color: '#484f58', padding: '2px 0' },
  statusBar: { height: 24, background: '#161b22', borderTop: '1px solid #30363d', display: 'flex', alignItems: 'center', gap: 20, padding: '0 14px', fontSize: 11, color: '#484f58', flexShrink: 0 },
}
