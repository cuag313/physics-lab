/**
 * HookeLawScene — 探究胡克定律（NB + PhET 融合版）
 * 修复版：Record采集、图表同步、工具栏精简、双Reset分离
 */

import { useRef, useEffect, useState, useCallback } from 'react'

const ELASTIC_LIMIT_RATIO = 0.6
const WALL_X = 70
const GAUGE_W = 120
const GAUGE_H = 36
const HANDLE_W = 20

function roundedRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r); ctx.closePath()
}

export default function HookeLawScene() {
  const canvasRef = useRef(null)
  const rafRef = useRef(null)
  const lastTimeRef = useRef(0)

  const sim = useRef({
    k1: 50, k2: 50,
    restLength: 0.20,
    currentLength: 0.20,
    mode: 'single',
    dragging: false, dragStartX: 0, dragStartLength: 0,
    paused: false, velocity: 0, externalForce: 0,
    showExtForce: true, showSpringForce: true, showNetForce: false,
    showComponent: false, showDisplacement: true, showEquilibrium: true, showValues: true,
    elasticLimit: false, gaugePointerX: 0,
    screenW: 0, screenH: 0, springY: 0, scale: 0,
  })

  const [k1, setK1] = useState(50)
  const [k2, setK2] = useState(50)
  const [mode, setMode] = useState('single')
  const [extForce, setExtForce] = useState(0)
  const [dataPoints, setDataPoints] = useState([])
  const [chartVisible, setChartVisible] = useState(false)
  const [paused, setPaused] = useState(false)
  const [showExtForce, setShowExtForce] = useState(true)
  const [showSpringForce, setShowSpringForce] = useState(true)
  const [showNetForce, setShowNetForce] = useState(false)
  const [showComponent, setShowComponent] = useState(false)
  const [showDisplacement, setShowDisplacement] = useState(true)
  const [showEquilibrium, setShowEquilibrium] = useState(true)
  const [showValues, setShowValues] = useState(true)
  const [, forceUpdate] = useState(0)
  const triggerRender = useCallback(() => forceUpdate(n => n + 1), [])

  useEffect(() => { sim.current.paused = paused }, [paused])

  // ============ 物理 ============
  function getEffectiveK() {
    return sim.current.mode === 'parallel' ? sim.current.k1 + sim.current.k2 : sim.current.k1
  }
  function getDisplacement() {
    return Math.max(0, sim.current.currentLength - sim.current.restLength)
  }
  function getSpringForce() {
    return getEffectiveK() * getDisplacement()
  }
  function isOverLimit() {
    return getDisplacement() / sim.current.restLength > ELASTIC_LIMIT_RATIO
  }

  // ============ 布局 ============
  function getLayout() {
    const s = sim.current
    const wallRight = WALL_X + 10
    const springStartX = wallRight
    const restLenPx = s.restLength * s.scale
    const curLenPx = s.currentLength * s.scale
    const springEndX = springStartX + curLenPx
    const gaugeStartX = springEndX
    const gaugeEndX = gaugeStartX + GAUGE_W
    const handleX = gaugeEndX
    const handleEndX = handleX + HANDLE_W
    const y = s.springY
    const restEndX = springStartX + restLenPx
    return { wallRight, springStartX, restLenPx, curLenPx, springEndX, gaugeStartX, gaugeEndX, handleX, handleEndX, y, restEndX }
  }

  // ============ Canvas 循环 ============
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
      s.springY = r.height / 2 - 10
      s.scale = 1250
      s.gaugePointerX = GAUGE_W / 2
    }
    resize()
    window.addEventListener('resize', resize)

    function loop(ts) {
      if (!lastTimeRef.current) lastTimeRef.current = ts
      const dt = Math.min((ts - lastTimeRef.current) / 1000, 0.05)
      lastTimeRef.current = ts
      if (!sim.current.paused) updatePhysics(dt)
      updateGaugeAnim(dt)
      drawFrame(ctx)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      window.removeEventListener('resize', resize)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  function updatePhysics(dt) {
    const s = sim.current
    const kEff = getEffectiveK()
    const springF = kEff * Math.max(0, s.currentLength - s.restLength)
    const netF = s.externalForce - springF
    const damping = 8
    s.velocity += (netF * 60 - damping * s.velocity) * dt
    s.currentLength += s.velocity * dt
    s.currentLength = Math.max(s.restLength * 0.5, Math.min(s.restLength * 2.0, s.currentLength))
    s.elasticLimit = isOverLimit()
  }

  function updateGaugeAnim(dt) {
    const s = sim.current
    const force = getSpringForce()
    const maxForce = getEffectiveK() * s.restLength * ELASTIC_LIMIT_RATIO * 1.3
    const targetX = (force / maxForce) * (GAUGE_W - 20) + 10
    s.gaugePointerX += (targetX - s.gaugePointerX) * Math.min(1, dt * 10)
  }

  // ============ 绘制 ============
  function drawFrame(ctx) {
    const s = sim.current
    const w = s.screenW, h = s.screenH
    if (!w || !h) return

    ctx.fillStyle = '#1a1d23'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1
    for (let gx = 0; gx < w; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke() }
    for (let gy = 0; gy < h; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke() }

    const L = getLayout()
    drawRuler(ctx, L)
    drawWall(ctx, L)
    drawSpringCoil(ctx, L)
    if (s.mode === 'parallel') drawSpringCoil2(ctx, L)
    drawGaugeBar(ctx, L)
    drawHandle(ctx, L)

    // 绘制顺序：标签背景→箭头→标签文字，确保箭头尖端不被覆盖
    if (s.showValues) drawLabelBgs(ctx, L)
    if (s.showDisplacement) drawDisplacementArrow(ctx, L)
    if (s.showSpringForce) drawForceArrow(ctx, L, 'spring')
    if (s.showExtForce) drawForceArrow(ctx, L, 'ext')
    if (s.showNetForce) drawForceArrow(ctx, L, 'net')
    if (s.showComponent) drawComponentArrow(ctx, L)
    if (s.showEquilibrium) drawEquilibriumLine(ctx, L)
    if (s.showValues) drawLabelTexts(ctx, L)
    if (s.elasticLimit) drawElasticWarning(ctx)
  }

  function drawWall(ctx, L) {
    const x = WALL_X, y = L.y
    const grad = ctx.createLinearGradient(x - 30, 0, x + 10, 0)
    grad.addColorStop(0, '#2d3139'); grad.addColorStop(1, '#4a5060')
    ctx.fillStyle = grad
    ctx.fillRect(x - 30, y - 60, 40, 120)
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1
    for (let i = -60; i < 120; i += 12) {
      ctx.beginPath(); ctx.moveTo(x - 30, y + i); ctx.lineTo(x + 10, y + i + 20); ctx.stroke()
    }
    ctx.strokeStyle = '#5a6070'; ctx.lineWidth = 2
    ctx.strokeRect(x - 30, y - 60, 40, 120)
    ctx.strokeStyle = '#3a3f4a'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(x - 30, y + 60); ctx.lineTo(sim.current.screenW - 20, y + 60); ctx.stroke()
  }

  function drawSpringCoil(ctx, L) {
    const y = L.y, startX = L.springStartX, endX = L.springEndX
    const len = endX - startX
    if (len < 10) return
    const coils = 18
    const amp = 16 / Math.max(sim.current.currentLength / sim.current.restLength, 0.5)
    const ratio = getDisplacement() / sim.current.restLength
    let color = '#60a5fa'
    if (sim.current.elasticLimit) color = '#ef4444'
    else if (ratio > 0.3) color = '#f59e0b'
    else if (ratio > 0.1) color = '#22c55e'

    ctx.strokeStyle = color; ctx.lineWidth = 2.5
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(startX, y)
    const headLen = len * 0.04, coilLen = len - headLen * 2, segW = coilLen / (coils * 2)
    let cx = startX + headLen; ctx.lineTo(cx, y)
    for (let i = 0; i < coils * 2; i++) { cx += segW; ctx.lineTo(cx, y + (i % 2 === 0 ? -amp : amp)) }
    ctx.lineTo(endX, y); ctx.stroke()
  }

  function drawSpringCoil2(ctx, L) {
    const y = L.y + 22, startX = L.springStartX, endX = L.springEndX
    const len = endX - startX; if (len < 10) return
    const coils = 18, amp = 12 / Math.max(sim.current.currentLength / sim.current.restLength, 0.5)
    ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 2
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(startX, y)
    const headLen = len * 0.04, coilLen = len - headLen * 2, segW = coilLen / (coils * 2)
    let cx = startX + headLen; ctx.lineTo(cx, y)
    for (let i = 0; i < coils * 2; i++) { cx += segW; ctx.lineTo(cx, y + (i % 2 === 0 ? -amp : amp)) }
    ctx.lineTo(endX, y); ctx.stroke()
  }

  function drawGaugeBar(ctx, L) {
    const s = sim.current
    const x = L.gaugeStartX, y = L.y, w = GAUGE_W, h = GAUGE_H

    const shellGrad = ctx.createLinearGradient(x, y - h / 2, x, y + h / 2)
    shellGrad.addColorStop(0, '#5a6070'); shellGrad.addColorStop(0.5, '#4a5060'); shellGrad.addColorStop(1, '#3a3f4a')
    ctx.fillStyle = shellGrad
    ctx.fillRect(x, y - h / 2 - 4, w, h + 8)
    ctx.strokeStyle = '#6b7280'; ctx.lineWidth = 1
    ctx.strokeRect(x, y - h / 2 - 4, w, h + 8)

    const barX = x + 10, barY = y - 8, barW = w - 20, barH = 16
    ctx.fillStyle = '#f0f0f0'
    ctx.beginPath(); roundedRect(ctx, barX, barY, barW, barH, 3); ctx.fill()

    const maxForce = getEffectiveK() * s.restLength * ELASTIC_LIMIT_RATIO * 1.3
    ctx.strokeStyle = '#333'; ctx.fillStyle = '#333'
    ctx.font = '7px sans-serif'; ctx.textAlign = 'center'
    for (let i = 0; i <= 10; i++) {
      const px = barX + (i / 10) * barW, major = i % 2 === 0
      ctx.lineWidth = major ? 1 : 0.5
      ctx.beginPath(); ctx.moveTo(px, barY); ctx.lineTo(px, barY + (major ? 10 : 5)); ctx.stroke()
      if (major) ctx.fillText((i / 10 * maxForce).toFixed(i === 0 ? 0 : 1), px, barY + barH + 8)
    }

    const limitPx = barX + 0.77 * barW
    ctx.fillStyle = 'rgba(239,68,68,0.2)'
    ctx.fillRect(limitPx, barY, barW * 0.23, barH)

    const ptrX = barX + Math.max(0, Math.min(1, (s.gaugePointerX - 10) / (GAUGE_W - 20))) * barW
    ctx.fillStyle = '#dc2626'
    ctx.beginPath(); ctx.moveTo(ptrX, barY - 4); ctx.lineTo(ptrX - 4, barY - 10); ctx.lineTo(ptrX + 4, barY - 10); ctx.closePath(); ctx.fill()
    ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(ptrX, barY - 4); ctx.lineTo(ptrX, barY + barH); ctx.stroke()

    const force = getSpringForce()
    ctx.fillStyle = s.elasticLimit ? '#dc2626' : '#1a1a2e'
    ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'
    ctx.fillText(force.toFixed(2) + ' N', x + w / 2, y + h / 2 + 4)
  }

  function drawHandle(ctx, L) {
    const x = L.handleX, y = L.y
    const hg = ctx.createLinearGradient(x, y - 14, x, y + 14)
    hg.addColorStop(0, '#6b7280'); hg.addColorStop(0.5, '#9ca3af'); hg.addColorStop(1, '#6b7280')
    ctx.fillStyle = hg
    ctx.beginPath(); roundedRect(ctx, x, y - 14, HANDLE_W, 28, 4); ctx.fill()
    ctx.strokeStyle = '#d1d5db'; ctx.lineWidth = 1
    ctx.beginPath(); roundedRect(ctx, x, y - 14, HANDLE_W, 28, 4); ctx.stroke()
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1
    for (let i = 0; i < 3; i++) {
      const lx = x + 6 + i * 5
      ctx.beginPath(); ctx.moveTo(lx, y - 6); ctx.lineTo(lx, y + 6); ctx.stroke()
    }
    ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(x + HANDLE_W, y); ctx.lineTo(x + HANDLE_W + 8, y); ctx.stroke()
    ctx.beginPath(); ctx.arc(x + HANDLE_W + 12, y, 4, Math.PI * 0.5, Math.PI * 1.5, false); ctx.stroke()
  }

  function drawRuler(ctx, L) {
    const s = sim.current
    const rulerY = L.y + 70, startX = L.springStartX, endX = s.screenW - 30
    const pxPerCm = s.scale * 0.01
    ctx.fillStyle = 'rgba(255,255,255,0.04)'
    ctx.fillRect(startX, rulerY - 6, endX - startX, 20)

    const zeroX = L.restEndX
    ctx.strokeStyle = 'rgba(33,150,243,0.5)'; ctx.lineWidth = 1; ctx.setLineDash([6, 4])
    ctx.beginPath(); ctx.moveTo(zeroX, L.y - 80); ctx.lineTo(zeroX, rulerY - 8); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#2196F3'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('0 cm', zeroX, rulerY + 16)

    ctx.fillStyle = '#8a8f9a'; ctx.strokeStyle = '#5a5f6a'; ctx.font = '9px sans-serif'
    const maxCm = Math.floor((endX - zeroX) / pxPerCm)
    for (let cm = 1; cm <= maxCm; cm++) {
      const x = zeroX + cm * pxPerCm; if (x > endX) break
      const major = cm % 5 === 0
      ctx.lineWidth = major ? 1.5 : 0.5
      ctx.beginPath(); ctx.moveTo(x, rulerY - (major ? 10 : 5)); ctx.lineTo(x, rulerY); ctx.stroke()
      if (major) ctx.fillText(`${cm}`, x, rulerY + 12)
    }

    if (s.showEquilibrium) {
      ctx.strokeStyle = 'rgba(76,175,80,0.5)'; ctx.lineWidth = 1.5; ctx.setLineDash([8, 4])
      ctx.beginPath(); ctx.moveTo(zeroX, L.y - 80); ctx.lineTo(zeroX, rulerY - 8); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#4CAF50'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText('L₀', zeroX + 4, L.y - 70)
    }
  }

  function drawForceArrow(ctx, L, type) {
    const y = L.y, hookX = L.springEndX
    let force, color, dir, arrowY
    if (type === 'spring') { force = getSpringForce(); color = '#4ade80'; dir = -1; arrowY = y - 40 }
    else if (type === 'ext') { force = sim.current.externalForce; color = '#facc15'; dir = 1; arrowY = y - 65 }
    else {
      force = Math.abs(sim.current.externalForce - getSpringForce())
      color = '#f87171'
      dir = sim.current.externalForce > getSpringForce() ? 1 : -1; arrowY = y + 55
      if (force < 0.01) return
    }
    if (force < 0.001) return

    const px = Math.max(18, Math.min(force * 5, 180))
    const startX = hookX, endX = startX + px * dir

    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 4
    ctx.beginPath(); ctx.moveTo(startX, arrowY); ctx.lineTo(endX, arrowY); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(endX, arrowY)
    ctx.lineTo(endX - 16 * dir, arrowY - 10); ctx.lineTo(endX - 16 * dir, arrowY + 10)
    ctx.closePath(); ctx.fill()
  }

  function drawComponentArrow(ctx, L) {
    const force = getSpringForce(); if (force < 0.01) return
    const y = L.y - 62, px = Math.max(10, Math.min(force * 5, 140)), sx = L.springEndX
    ctx.strokeStyle = '#a78bfa'; ctx.fillStyle = '#a78bfa'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx + px, y); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(sx + px, y); ctx.lineTo(sx + px - 10, y - 6); ctx.lineTo(sx + px - 10, y + 6); ctx.closePath(); ctx.fill()
    if (sim.current.showValues) {
      const tw = ctx.measureText('Fx').width, lx = sx + px / 2
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      roundedRect(ctx, lx - tw / 2 - 4, y - 22, tw + 8, 14, 3); ctx.fill()
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('Fx', lx, y - 10)
    }
  }

  function drawDisplacementArrow(ctx, L) {
    const dx = getDisplacement(); if (dx < 0.001) return
    const y = L.y + 60, startX = L.restEndX, endX = startX + dx * sim.current.scale
    ctx.strokeStyle = '#22d3ee'; ctx.fillStyle = '#22d3ee'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(endX, y); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(endX, y); ctx.lineTo(endX - 10, y - 6); ctx.lineTo(endX - 10, y + 6); ctx.closePath(); ctx.fill()
    ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(startX + 10, y - 6); ctx.lineTo(startX + 10, y + 6); ctx.closePath(); ctx.fill()
    if (sim.current.showValues) {
      const labelText = `Δx = ${(dx * 100).toFixed(1)} cm`
      ctx.font = 'bold 11px sans-serif'; const tw = ctx.measureText(labelText).width
      const labelX = (startX + endX) / 2
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      roundedRect(ctx, labelX - tw / 2 - 4, y - 24, tw + 8, 16, 3); ctx.fill()
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.fillText(labelText, labelX, y - 12)
    }
  }

  // 标签背景层（在箭头之前绘制，避免覆盖箭头尖端）
  function drawLabelBgs(ctx, L) {
    const s = sim.current
    const hookX = L.springEndX
    const y = L.y

    ctx.font = 'bold 11px sans-serif'

    // 弹力标签背景
    if (s.showSpringForce) {
      const force = getSpringForce()
      if (force > 0.001) {
        const px = Math.max(18, Math.min(force * 5, 180))
        const endX = hookX - px
        const labelText = `F弹 = ${force.toFixed(2)} N`
        const tw = ctx.measureText(labelText).width
        const labelX = Math.max(tw / 2 + 5, endX - tw / 2 - 10)
        ctx.fillStyle = 'rgba(0,0,0,0.75)'
        ctx.beginPath(); roundedRect(ctx, labelX - tw / 2 - 5, y - 40 - 24, tw + 10, 17, 3); ctx.fill()
      }
    }

    // 外力标签背景
    if (s.showExtForce) {
      const force = s.externalForce
      if (force > 0.001) {
        const px = Math.max(18, Math.min(force * 5, 180))
        const endX = hookX + px
        const labelText = `F外 = ${force.toFixed(2)} N`
        const tw = ctx.measureText(labelText).width
        const labelX = Math.min(s.screenW - tw / 2 - 5, endX + tw / 2 + 10)
        ctx.fillStyle = 'rgba(0,0,0,0.75)'
        ctx.beginPath(); roundedRect(ctx, labelX - tw / 2 - 5, y - 65 - 24, tw + 10, 17, 3); ctx.fill()
      }
    }

    // 位移标签背景
    if (s.showDisplacement) {
      const dx = getDisplacement()
      if (dx > 0.001) {
        const startX = L.restEndX
        const endX = startX + dx * s.scale
        const labelText = `Δx = ${(dx * 100).toFixed(1)} cm`
        const tw = ctx.measureText(labelText).width
        const labelX = (startX + endX) / 2
        ctx.fillStyle = 'rgba(0,0,0,0.75)'
        ctx.beginPath(); roundedRect(ctx, labelX - tw / 2 - 5, y + 60 - 24, tw + 10, 17, 3); ctx.fill()
      }
    }
  }

  // 标签文字层（在箭头之后绘制，确保文字在最上层）
  function drawLabelTexts(ctx, L) {
    const s = sim.current
    const hookX = L.springEndX
    const y = L.y

    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'

    // 弹力标签文字
    if (s.showSpringForce) {
      const force = getSpringForce()
      if (force > 0.001) {
        const px = Math.max(18, Math.min(force * 5, 180))
        const endX = hookX - px
        const labelText = `F弹 = ${force.toFixed(2)} N`
        const tw = ctx.measureText(labelText).width
        const labelX = Math.max(tw / 2 + 5, endX - tw / 2 - 10)
        ctx.fillStyle = '#ffffff'
        ctx.fillText(labelText, labelX, y - 40 - 11)
      }
    }

    // 外力标签文字
    if (s.showExtForce) {
      const force = s.externalForce
      if (force > 0.001) {
        const px = Math.max(18, Math.min(force * 5, 180))
        const endX = hookX + px
        const labelText = `F外 = ${force.toFixed(2)} N`
        const tw = ctx.measureText(labelText).width
        const labelX = Math.min(s.screenW - tw / 2 - 5, endX + tw / 2 + 10)
        ctx.fillStyle = '#ffffff'
        ctx.fillText(labelText, labelX, y - 65 - 11)
      }
    }

    // 位移标签文字
    if (s.showDisplacement) {
      const dx = getDisplacement()
      if (dx > 0.001) {
        const startX = L.restEndX
        const endX = startX + dx * s.scale
        const labelText = `Δx = ${(dx * 100).toFixed(1)} cm`
        const tw = ctx.measureText(labelText).width
        const labelX = (startX + endX) / 2
        ctx.fillStyle = '#ffffff'
        ctx.fillText(labelText, labelX, y + 60 - 11)
      }
    }
  }

  function drawEquilibriumLine() {}

  function drawElasticWarning(ctx) {
    const x = sim.current.screenW / 2
    const alpha = 0.6 + 0.4 * Math.sin(Date.now() / 200)
    ctx.fillStyle = `rgba(239,68,68,${alpha})`
    ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('⚠ 超出弹性限度！弹簧可能失效！', x, 30)
    ctx.fillStyle = 'rgba(239,68,68,0.15)'
    ctx.fillRect(x - 200, 10, 400, 28)
  }

  // ============ 交互 ============
  function getPos(e) {
    const r = canvasRef.current.getBoundingClientRect()
    return [(e.touches ? e.touches[0].clientX : e.clientX) - r.left, (e.touches ? e.touches[0].clientY : e.clientY) - r.top]
  }

  const handlePointerDown = useCallback((e) => {
    const [sx, sy] = getPos(e), L = getLayout(), y = L.y
    if (sx >= L.handleX - 5 && sx <= L.handleEndX + 15 && Math.abs(sy - y) < 30) {
      sim.current.dragging = true; sim.current.dragStartX = sx; sim.current.dragStartLength = sim.current.currentLength
      canvasRef.current.style.cursor = 'grabbing'; e.preventDefault(); return
    }
    if (sx >= L.gaugeStartX && sx <= L.gaugeEndX && Math.abs(sy - y) < GAUGE_H) {
      sim.current.dragging = true; sim.current.dragStartX = sx; sim.current.dragStartLength = sim.current.currentLength
      canvasRef.current.style.cursor = 'grabbing'; e.preventDefault()
    }
  }, [])

  const handlePointerMove = useCallback((e) => {
    const [sx] = getPos(e), s = sim.current
    if (s.dragging) {
      const dx = sx - s.dragStartX
      s.currentLength = Math.max(s.restLength * 0.5, Math.min(s.restLength * 2.0, s.dragStartLength + dx / s.scale))
      s.externalForce = getEffectiveK() * Math.max(0, s.currentLength - s.restLength)
      s.velocity = 0
      setExtForce(parseFloat(s.externalForce.toFixed(2)))
      triggerRender(); e.preventDefault()
    }
  }, [triggerRender])

  const handlePointerUp = useCallback(() => {
    sim.current.dragging = false
    if (canvasRef.current) canvasRef.current.style.cursor = 'default'
  }, [])

  // ============ 操作 ============

  // Record：采集当前 Δx 和 F，写入数据表格
  function handleRecord() {
    const s = sim.current
    const dx = Math.max(0, s.currentLength - s.restLength)
    const kEff = s.mode === 'parallel' ? s.k1 + s.k2 : s.k1
    const F = kEff * dx
    if (dx > 0.0001 && F > 0) {
      setDataPoints(prev => {
        const next = [...prev, { dx, F }]
        // 同步到 ref 供导出函数读取
        sim.current.dataPoints = next
        return next
      })
    }
  }

  // 仿真重置：只重置物理状态，保留表格和图表数据
  function handleSimReset() {
    const s = sim.current
    s.currentLength = s.restLength; s.externalForce = 0; s.velocity = 0
    s.elasticLimit = false; s.gaugePointerX = 10
    setExtForce(0)
  }

  // 数据重置：清空表格和图表，不改变物理状态
  function handleDataReset() {
    setDataPoints([])
    sim.current.dataPoints = []
    setChartVisible(false)
  }

  function handleGenerateChart() {
    setChartVisible(true)
  }

  function handleForceInput(val) {
    const f = Math.max(0, Math.min(val, getEffectiveK() * sim.current.restLength * 1.5))
    sim.current.externalForce = f
    const targetLen = sim.current.restLength + f / getEffectiveK()
    sim.current.currentLength = Math.max(sim.current.restLength * 0.5, Math.min(sim.current.restLength * 2.0, targetLen))
    sim.current.velocity = 0
    setExtForce(parseFloat(f.toFixed(2)))
    triggerRender()
  }

  function handleExportData() {
    const pts = sim.current.dataPoints || dataPoints
    if (pts.length === 0) return
    let csv = '序号,伸长量Δx(m),拉力F(N)\n'
    pts.forEach((p, i) => { csv += `${i + 1},${p.dx.toFixed(4)},${p.F.toFixed(3)}\n` })
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = '胡克定律实验数据.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  function syncView(key, val) {
    sim.current[key] = val; triggerRender()
  }

  // ============ 子组件 ============
  function DataTable() {
    return (
      <div style={st.tableWrap}>
        <div style={st.tableTitle}>📋 实验数据</div>
        <div style={st.tableScroll}>
          <table style={st.table}>
            <thead><tr><th style={st.th}>#</th><th style={st.th}>Δx (m)</th><th style={st.th}>F (N)</th></tr></thead>
            <tbody>
              {dataPoints.length === 0 ? <tr><td colSpan={3} style={st.emptyTd}>暂无数据</td></tr>
                : dataPoints.map((p, i) => (
                  <tr key={i} style={i % 2 === 0 ? st.trEven : st.trOdd}>
                    <td style={st.td}>{i + 1}</td>
                    <td style={st.tdNum}>{p.dx.toFixed(4)}</td>
                    <td style={st.tdNum}>{p.F.toFixed(3)}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  function ChartPanel() {
    if (!chartVisible) return null
    const pts = dataPoints
    if (pts.length === 0) return (
      <div style={st.chartModal}>
        <div style={st.chartModalHeader}>
          <span>📈 F - Δx 关系图像</span>
          <button style={st.chartCloseBtn} onClick={() => setChartVisible(false)}>✕</button>
        </div>
        <div style={{ padding: 40, textAlign: 'center', color: '#484f58' }}>请先采集数据</div>
      </div>
    )

    const maxX = Math.max(...pts.map(p => p.dx), 0.01)
    const maxY = Math.max(...pts.map(p => p.F), 0.5)
    let slope = 0, intercept = 0, r2 = 0
    if (pts.length >= 2) {
      const n = pts.length; let sx = 0, sy = 0, sxy = 0, sx2 = 0, sy2 = 0
      pts.forEach(p => { sx += p.dx; sy += p.F; sxy += p.dx * p.F; sx2 += p.dx * p.dx; sy2 += p.F * p.F })
      const denom = n * sx2 - sx * sx
      if (Math.abs(denom) > 1e-10) {
        slope = (n * sxy - sx * sy) / denom; intercept = (sy - slope * sx) / n
        const ssTot = sy2 - sy * sy / n, ssRes = pts.reduce((s, p) => s + (p.F - (slope * p.dx + intercept)) ** 2, 0)
        r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0
      }
    }

    const gw = 380, gh = 240, padL = 50, padB = 35, padR = 20, padT = 15
    const plotW = gw - padL - padR, plotH = gh - padB - padT
    // 原点在 (padL, gh - padB)，X向右增大，Y向上增大
    const toX = v => padL + (v / Math.max(maxX * 1.15, 0.001)) * plotW
    const toY = v => (gh - padB) - (v / Math.max(maxY * 1.15, 0.001)) * plotH

    return (
      <div style={st.chartModal}>
        <div style={st.chartModalHeader}>
          <span>📈 F - Δx 关系图像</span>
          <button style={st.chartCloseBtn} onClick={() => setChartVisible(false)}>✕</button>
        </div>
        <svg width={gw} height={gh} style={{ display: 'block', margin: '0 auto' }}>
          {/* Y轴 */}
          <line x1={padL} y1={padT} x2={padL} y2={gh - padB} stroke="#9ca3af" strokeWidth="1" />
          {/* X轴 */}
          <line x1={padL} y1={gh - padB} x2={gw - padR} y2={gh - padB} stroke="#9ca3af" strokeWidth="1" />
          {/* 原点标注 */}
          <text x={padL - 5} y={gh - padB + 14} textAnchor="end" fontSize="9" fill="#6b7280">0</text>
          {/* X轴刻度 */}
          {[0.25, 0.5, 0.75, 1].map(t => {
            const vx = maxX * 1.15 * t
            const x = toX(vx)
            if (x > gw - padR) return null
            return <g key={`x${t}`}><line x1={x} y1={gh - padB} x2={x} y2={gh - padB + 4} stroke="#6b7280" strokeWidth="1" /><text x={x} y={gh - padB + 14} textAnchor="middle" fontSize="8" fill="#6b7280">{vx.toFixed(2)}</text></g>
          })}
          {/* Y轴刻度 */}
          {[0.25, 0.5, 0.75, 1].map(t => {
            const vy = maxY * 1.15 * t
            const y = toY(vy)
            if (y < padT) return null
            return <g key={`y${t}`}><line x1={padL - 4} y1={y} x2={padL} y2={y} stroke="#6b7280" strokeWidth="1" /><text x={padL - 7} y={y + 3} textAnchor="end" fontSize="8" fill="#6b7280">{vy.toFixed(1)}</text></g>
          })}
          {/* 拟合线 */}
          {pts.length >= 2 && <line x1={toX(0)} y1={toY(intercept >= 0 ? intercept : 0)} x2={toX(maxX * 1.15)} y2={toY(slope * maxX * 1.15 + intercept)} stroke="#ef4444" strokeWidth="2" strokeDasharray="8,4" />
          }
          {/* 数据点 */}
          {pts.map((p, i) => <circle key={i} cx={toX(p.dx)} cy={toY(p.F)} r="5" fill="#3b82f6" stroke="#1e3a5f" strokeWidth="1.5" />)}
          {/* 实时点 */}
          {getDisplacement() > 0.001 && <circle cx={toX(getDisplacement())} cy={toY(getSpringForce())} r="6" fill="#f59e0b" stroke="#fff" strokeWidth="2" />}
          {/* 轴标签 */}
          <text x={gw / 2} y={gh - 2} textAnchor="middle" fontSize="11" fill="#9ca3af">Δx (m)</text>
          <text x={12} y={gh / 2} textAnchor="middle" fontSize="11" fill="#9ca3af" transform={`rotate(-90,12,${gh / 2})`}>F (N)</text>
          {/* k标注 */}
          {pts.length >= 2 && <text x={gw - padR - 5} y={padT + 14} textAnchor="end" fontSize="12" fill="#f59e0b" fontWeight="bold">k = {slope.toFixed(1)} N/m</text>}
        </svg>
        {pts.length >= 2 && (
          <div style={st.fitInfo}>
            <div>拟合斜率 k = <span style={{ color: '#f59e0b', fontWeight: 700 }}>{slope.toFixed(2)} N/m</span></div>
            <div>R² = {r2.toFixed(4)} | 截距 = {intercept.toFixed(3)} N</div>
            <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{pts.length} 个数据点</div>
          </div>
        )}
      </div>
    )
  }

  // ============ 渲染 ============
  return (
    <div style={st.page}>
      <div style={st.header}>
        <span style={st.headerTitle}>🔬 探究胡克定律</span>
        <span style={st.headerSub}>F = k·Δx | NB + PhET 融合仿真</span>
      </div>
      <div style={st.main}>
        {/* 左侧工具栏：只保留3个有效按钮 */}
        <div style={st.toolbar}>
          <button style={{ ...st.toolBtn, ...(paused ? { color: '#4ade80' } : { color: '#f87171' }) }}
            title={paused ? '继续仿真' : '暂停仿真'}
            onClick={() => setPaused(p => !p)}>
            {paused
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
            }
          </button>
          <div style={st.toolDivider} />
          <button style={{ ...st.toolBtn, color: '#9ca3af' }}
            title="仿真重置：弹簧回原长、力归零（保留表格数据）"
            onClick={handleSimReset}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 4v6h6M23 20v-6h-6" /><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" /></svg>
          </button>
        </div>

        {/* 左面板 */}
        <div style={st.leftPanel}>
          <DataTable />
          <div style={st.tableBtns}>
            <button style={st.btnRecord} onClick={handleRecord} title="采集当前伸长量和拉力">📌 Record</button>
            <button style={st.btnReset} onClick={handleDataReset} title="清空表格和图表数据">🗑 Reset</button>
            <button style={st.btnChart} onClick={handleGenerateChart} title="生成F-Δx关系图像">📈 Chart</button>
            <button style={st.btnExport} onClick={handleExportData} title="导出CSV数据文件">💾</button>
          </div>
        </div>

        <ChartPanel />

        <div style={st.canvasWrap}>
          <canvas ref={canvasRef} style={st.canvas}
            onMouseDown={handlePointerDown} onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp} onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown} onTouchMove={handlePointerMove} onTouchEnd={handlePointerUp}
            onContextMenu={e => e.preventDefault()} />
        </div>

        {/* 右面板 */}
        <div style={st.rightPanel}>
          <div style={st.section}>
            <div style={st.sectionTitle}>⚙️ 弹簧参数</div>
            <div style={st.controlRow}>
              <span style={st.controlLabel}>模式</span>
              <div style={st.modeSwitch}>
                <button style={{ ...st.modeBtn, ...(mode === 'single' ? st.modeBtnActive : {}) }}
                  onClick={() => { setMode('single'); sim.current.mode = 'single'; triggerRender() }}>单弹簧</button>
                <button style={{ ...st.modeBtn, ...(mode === 'parallel' ? st.modeBtnActive : {}) }}
                  onClick={() => { setMode('parallel'); sim.current.mode = 'parallel'; triggerRender() }}>并联</button>
              </div>
            </div>
            <div style={st.controlRow}>
              <span style={st.controlLabel}>k₁</span>
              <input type="range" min={10} max={200} step={1} value={k1} style={st.slider}
                onChange={e => { const v = +e.target.value; setK1(v); sim.current.k1 = v; triggerRender() }} />
              <span style={st.sliderVal}>{k1} N/m</span>
            </div>
            {mode === 'parallel' && (
              <>
                <div style={st.controlRow}>
                  <span style={st.controlLabel}>k₂</span>
                  <input type="range" min={10} max={200} step={1} value={k2} style={st.slider}
                    onChange={e => { const v = +e.target.value; setK2(v); sim.current.k2 = v; triggerRender() }} />
                  <span style={st.sliderVal}>{k2} N/m</span>
                </div>
                <div style={st.parallelInfo}>k_eff = k₁ + k₂ = <strong>{k1 + k2} N/m</strong></div>
              </>
            )}
          </div>

          <div style={st.section}>
            <div style={st.sectionTitle}>🎯 外力输入</div>
            <div style={st.forceInputWrap}>
              <input type="number" min={0} max={200} step={0.1} value={extForce.toFixed(2)}
                style={st.forceInput} onChange={e => handleForceInput(+e.target.value)} />
              <span style={st.forceUnit}>N</span>
            </div>
            <input type="range" min={0} max={getEffectiveK() * 0.25} step={0.01} value={extForce}
              style={{ ...st.slider, marginTop: 8 }}
              onChange={e => handleForceInput(+e.target.value)} />
          </div>

          <div style={st.section}>
            <div style={st.sectionTitle}>👁️ 显示项</div>
            {[
              { key: 'showExtForce', label: '外力矢量箭头', color: '#f59e0b', val: showExtForce, set: setShowExtForce },
              { key: 'showSpringForce', label: '弹力矢量箭头', color: '#22c55e', val: showSpringForce, set: setShowSpringForce },
              { key: 'showNetForce', label: '合力', color: '#ef4444', val: showNetForce, set: setShowNetForce },
              { key: 'showComponent', label: '分力', color: '#8b5cf6', val: showComponent, set: setShowComponent },
              { key: 'showDisplacement', label: '位移矢量箭头', color: '#06b6d4', val: showDisplacement, set: setShowDisplacement },
              { key: 'showEquilibrium', label: '平衡位置参考线', color: '#2196F3', val: showEquilibrium, set: setShowEquilibrium },
              { key: 'showValues', label: '数值标签', color: '#e5e7eb', val: showValues, set: setShowValues },
            ].map(item => (
              <label key={item.key} style={st.checkRow}>
                <input type="checkbox" checked={item.val}
                  onChange={e => { item.set(e.target.checked); syncView(item.key, e.target.checked) }} />
                <span style={{ ...st.checkDot, background: item.color }} />
                <span style={st.checkLabel}>{item.label}</span>
              </label>
            ))}
          </div>

          <div style={st.section}>
            <div style={st.formulaBox}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', marginBottom: 4 }}>📐 胡克定律</div>
              <div style={{ color: '#4CAF50', fontSize: 16, fontFamily: 'serif', fontWeight: 'bold' }}>F = k · Δx</div>
              {mode === 'parallel' && <div style={{ color: '#a78bfa', fontSize: 12, marginTop: 2 }}>k = k₁ + k₂</div>}
            </div>
          </div>

          <div style={st.section}>
            <div style={st.sectionTitle}>📊 实时数据</div>
            {[
              { l: '弹力 F', v: `${getSpringForce().toFixed(3)} N`, c: isOverLimit() ? '#ef4444' : '#22c55e' },
              { l: '伸长量 Δx', v: `${getDisplacement().toFixed(4)} m`, c: '#06b6d4' },
              { l: '验证 kΔx', v: `${(getEffectiveK() * getDisplacement()).toFixed(3)} N`, c: '#f59e0b' },
              { l: '数据点数', v: `${dataPoints.length}`, c: '#e5e7eb' },
            ].map(d => (
              <div key={d.l} style={st.dataRow}>
                <span style={st.dataLabel}>{d.l}</span>
                <span style={{ ...st.dataValue, color: d.c }}>{d.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const st = {
  page: { display: 'flex', flexDirection: 'column', width: '100%', height: '100vh', background: '#0d1117', color: '#e5e7eb', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace', overflow: 'hidden', userSelect: 'none' },
  header: { height: 44, flexShrink: 0, background: 'linear-gradient(135deg, #1e3a5f, #0d47a1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.3)', zIndex: 20 },
  headerTitle: { color: '#fff', fontSize: 15, fontWeight: 700 },
  headerSub: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  main: { display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' },
  toolbar: { position: 'absolute', top: 12, left: 12, zIndex: 15, background: 'rgba(30,35,45,0.95)', borderRadius: 10, padding: '8px 6px', display: 'flex', flexDirection: 'column', gap: 4, border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 4px 16px rgba(0,0,0,0.3)' },
  toolBtn: { width: 36, height: 36, borderRadius: 8, border: 'none', background: 'transparent', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, transition: 'all 0.15s' },
  toolDivider: { height: 1, background: 'rgba(255,255,255,0.08)', margin: '2px 4px' },
  leftPanel: { position: 'absolute', top: 12, left: 60, zIndex: 10, width: 280, maxHeight: 'calc(100vh - 70px)', background: 'rgba(22,27,34,0.95)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', padding: 14, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.3)' },
  tableWrap: { marginBottom: 10 },
  tableTitle: { fontSize: 12, fontWeight: 700, color: '#9ca3af', marginBottom: 8 },
  tableScroll: { maxHeight: 160, overflowY: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 11 },
  th: { background: '#21262d', color: '#8b949e', padding: '6px 8px', textAlign: 'center', fontWeight: 600, borderBottom: '1px solid #30363d', position: 'sticky', top: 0 },
  td: { padding: '5px 8px', textAlign: 'center', borderBottom: '1px solid #21262d' },
  tdNum: { padding: '5px 8px', textAlign: 'right', borderBottom: '1px solid #21262d', fontFamily: 'monospace' },
  emptyTd: { padding: 16, textAlign: 'center', color: '#484f58', fontStyle: 'italic' },
  trEven: { background: 'rgba(255,255,255,0.02)' },
  trOdd: { background: 'transparent' },
  tableBtns: { display: 'flex', gap: 6, marginBottom: 10 },
  btnRecord: { flex: 1, padding: '7px 0', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' },
  btnReset: { flex: 1, padding: '7px 0', borderRadius: 6, border: 'none', background: '#374151', color: '#9ca3af', fontSize: 11, fontWeight: 600, cursor: 'pointer' },
  btnChart: { flex: 1.3, padding: '7px 0', borderRadius: 6, border: 'none', background: '#059669', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' },
  btnExport: { width: 34, padding: '7px 0', borderRadius: 6, border: 'none', background: '#6366f1', color: '#fff', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  chartModal: { position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)', zIndex: 100, background: 'rgba(22,27,34,0.98)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', padding: 16, minWidth: 400 },
  chartModalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, fontSize: 13, fontWeight: 700, color: '#e5e7eb' },
  chartCloseBtn: { width: 28, height: 28, borderRadius: 6, border: 'none', background: 'rgba(255,255,255,0.08)', color: '#9ca3af', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  fitInfo: { marginTop: 8, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, fontSize: 11, color: '#9ca3af', lineHeight: 1.8 },
  canvasWrap: { flex: 1, position: 'relative', overflow: 'hidden' },
  canvas: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', touchAction: 'none' },
  rightPanel: { width: 220, flexShrink: 0, background: 'rgba(22,27,34,0.95)', borderLeft: '1px solid rgba(255,255,255,0.06)', padding: '14px 12px', overflowY: 'auto', zIndex: 10 },
  section: { marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.06)' },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 8, letterSpacing: 0.5 },
  controlRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  controlLabel: { fontSize: 12, color: '#9ca3af', minWidth: 24, fontWeight: 600 },
  slider: { flex: 1, accentColor: '#3b82f6', height: 4 },
  sliderVal: { fontSize: 11, fontWeight: 600, color: '#60a5fa', minWidth: 60, textAlign: 'right', fontFamily: 'monospace' },
  modeSwitch: { display: 'flex', gap: 2, background: '#161b22', borderRadius: 6, padding: 2, flex: 1 },
  modeBtn: { flex: 1, padding: '5px 0', borderRadius: 4, border: 'none', background: 'transparent', color: '#6b7280', fontSize: 11, fontWeight: 600, cursor: 'pointer' },
  modeBtnActive: { background: '#2563eb', color: '#fff' },
  parallelInfo: { fontSize: 11, color: '#a78bfa', padding: '6px 10px', background: 'rgba(167,139,250,0.1)', borderRadius: 6, marginBottom: 8, fontFamily: 'monospace' },
  forceInputWrap: { display: 'flex', alignItems: 'center', gap: 8 },
  forceInput: { width: 80, padding: '6px 8px', borderRadius: 6, border: '1px solid #30363d', background: '#161b22', color: '#e5e7eb', fontSize: 13, fontFamily: 'monospace', fontWeight: 600 },
  forceUnit: { fontSize: 12, color: '#6b7280' },
  checkRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', cursor: 'pointer' },
  checkDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  checkLabel: { fontSize: 12, color: '#9ca3af' },
}
