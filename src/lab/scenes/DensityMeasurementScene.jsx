/**
 * DensityMeasurementScene — 测量物质密度（托盘天平·NB美术版）
 * 3个编号待测物体，逐一测量
 */

import { useRef, useEffect, useState, useCallback } from 'react'

const MATERIALS = {
  iron:    { name: '铁块', density: 7.87, mass: 78.7, volume: 10, color: '#5a5a5a', color2: '#787878', color3: '#4a4a4a' },
  aluminum:{ name: '铝块', density: 2.70, mass: 27.0, volume: 10, color: '#b0b0b0', color2: '#d0d0d0', color3: '#909090' },
  copper:  { name: '铜块', density: 8.96, mass: 89.6, volume: 10, color: '#b87333', color2: '#d4945a', color3: '#9a5a1a' },
  stone:   { name: '石块', density: 2.60, mass: 52.0, volume: 20, color: '#8a7a6a', color2: '#a89888', color3: '#6a5a4a' },
  wood:    { name: '木块', density: 0.60, mass: 6.0,  volume: 10, color: '#a08060', color2: '#c0a080', color3: '#806040' },
}

// 3个待测物体
const OBJECT_LIST = [
  { id: 'obj1', num: 1, materialKey: 'iron' },
  { id: 'obj2', num: 2, materialKey: 'aluminum' },
  { id: 'obj3', num: 3, materialKey: 'copper' },
]

const WEIGHTS = [
  { value: 200, r: 18, h: 14, id: 'a' },
  { value: 100, r: 15, h: 12, id: 'b' },
  { value: 50,  r: 13, h: 10, id: 'c' },
  { value: 20,  r: 11, h: 8,  id: 'd' },
  { value: 20,  r: 11, h: 8,  id: 'e' },
  { value: 10,  r: 9,  h: 7,  id: 'f' },
  { value: 10,  r: 9,  h: 7,  id: 'f2' },
  { value: 5,   r: 7,  h: 6,  id: 'g' },
  { value: 5,   r: 7,  h: 6,  id: 'g2' },
]

export default function DensityMeasurementScene() {
  const canvasRef = useRef(null)
  const rafRef = useRef(null)
  const lastTimeRef = useRef(0)

  const sim = useRef({
    balanceZeroed: false,
    beamAngle: 0,
    beamTargetAngle: 0,
    weightsOnPan: [],
    riderPos: 0,
    waterV1: 25.0,
    waterV2: 25.0,
    objects: OBJECT_LIST.map((o) => ({
      ...o,
      material: MATERIALS[o.materialKey],
      onLeftPan: false,
      inCylinder: false,
      measuredMass: 0,
      measuredV1: 0,
      measuredV2: 0,
      measuredVolume: 0,
      completed: false,
      trialIndex: -1,
    })),
    activeObjIdx: -1,
    trials: [],
    dragging: null,
    dragX: 0, dragY: 0,
    screenW: 0, screenH: 0,
    anim: 0,
  })

  const [trials, setTrials] = useState([])
  const [activeObjIdx, setActiveObjIdx] = useState(-1)
  const [, forceUpdate] = useState(0)
  const triggerRender = useCallback(() => forceUpdate(n => n + 1), [])

  function getLayout() {
    const s = sim.current, w = s.screenW, h = s.screenH
    return {
      balX: w * 0.32, balY: h * 0.36,
      boxX: w * 0.06, boxY: h * 0.58,
      cylX: w * 0.72, cylY: h * 0.15,
      objPositions: [
        { x: w * 0.38, y: h * 0.80 },
        { x: w * 0.50, y: h * 0.80 },
        { x: w * 0.62, y: h * 0.80 },
      ],
      w, h,
    }
  }

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
      sim.current.screenW = r.width
      sim.current.screenH = r.height
    }
    resize()
    window.addEventListener('resize', resize)
    function loop(ts) {
      if (!lastTimeRef.current) lastTimeRef.current = ts
      const dt = Math.min((ts - lastTimeRef.current) / 1000, 0.05)
      lastTimeRef.current = ts
      sim.current.anim += dt
      const diff = sim.current.beamTargetAngle - sim.current.beamAngle
      sim.current.beamAngle += diff * Math.min(1, dt * 8)
      if (Math.abs(diff) > 0.0001) triggerRender()
      drawFrame(ctx)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      window.removeEventListener('resize', resize)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // ======== 天平逻辑 ========
  function getBalanceState() {
    const s = sim.current
    const leftMass = s.objects.reduce((a, o) => a + (o.onLeftPan ? o.material.mass : 0), 0)
    const rightMass = s.weightsOnPan.reduce((a, w) => a + w.value, 0) + s.riderPos
    return { leftMass, rightMass, diff: leftMass - rightMass }
  }

  function updateBalance() {
    const s = sim.current
    const { diff } = getBalanceState()
    s.beamTargetAngle = Math.max(-0.12, Math.min(0.12, -diff * 0.0025))
    if (Math.abs(diff) < 0.5) {
      const totalMass = parseFloat((s.weightsOnPan.reduce((a, w) => a + w.value, 0) + s.riderPos).toFixed(1))
      const onPanObjs = s.objects.filter(o => o.onLeftPan)
      if (onPanObjs.length === 1) {
        onPanObjs[0].measuredMass = totalMass
      } else if (onPanObjs.length > 1) {
        const totalTheory = onPanObjs.reduce((a, o) => a + o.material.mass, 0)
        onPanObjs.forEach(o => { o.measuredMass = parseFloat((totalMass * o.material.mass / totalTheory).toFixed(1)) })
      }
    }
  }

  // ======== 绘制 ========
  function drawFrame(ctx) {
    const s = sim.current, w = s.screenW, h = s.screenH
    if (!w || !h) return
    const L = getLayout()
    drawBackground(ctx, L)
    drawBalance(ctx, L)
    drawWeightBox(ctx, L)
    drawCylinder(ctx, L)
    drawObjects(ctx, L)
    drawDragging(ctx, L)
  }

  function drawBackground(ctx, L) {
    const { w, h } = L
    ctx.fillStyle = '#f0f0ec'
    ctx.fillRect(0, 0, w, h)
    const tableY = h * 0.76
    const grad = ctx.createLinearGradient(0, tableY, 0, h)
    grad.addColorStop(0, '#d6c8a8'); grad.addColorStop(1, '#c4b48e')
    ctx.fillStyle = grad
    ctx.fillRect(0, tableY, w, h - tableY)
    ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(0, tableY); ctx.lineTo(w, tableY); ctx.stroke()
  }

  function drawBalance(ctx, L) {
    const s = sim.current
    const { balX: bx, balY: by } = L

    // 底座
    const baseGrad = ctx.createLinearGradient(bx - 80, by + 68, bx + 80, by + 82)
    baseGrad.addColorStop(0, '#5a5a5a'); baseGrad.addColorStop(0.5, '#707070'); baseGrad.addColorStop(1, '#505050')
    ctx.fillStyle = baseGrad
    ctx.beginPath(); roundedRect(ctx, bx - 80, by + 68, 160, 14, 3); ctx.fill()
    ctx.fillStyle = '#4a4a4a'
    ctx.beginPath(); roundedRect(ctx, bx - 70, by + 82, 140, 8, 2); ctx.fill()
    // 立柱
    const pillarGrad = ctx.createLinearGradient(bx - 6, 0, bx + 6, 0)
    pillarGrad.addColorStop(0, '#606060'); pillarGrad.addColorStop(0.5, '#808080'); pillarGrad.addColorStop(1, '#585858')
    ctx.fillStyle = pillarGrad
    ctx.fillRect(bx - 6, by - 20, 12, 88)
    drawKnob(ctx, bx - 55, by + 60)
    drawKnob(ctx, bx + 55, by + 60)

    // 横梁
    ctx.save()
    ctx.translate(bx, by - 15)
    ctx.rotate(s.beamAngle)
    const beamGrad = ctx.createLinearGradient(0, -5, 0, 5)
    beamGrad.addColorStop(0, '#909090'); beamGrad.addColorStop(0.4, '#b0b0b0'); beamGrad.addColorStop(1, '#707070')
    ctx.fillStyle = beamGrad
    ctx.beginPath(); roundedRect(ctx, -130, -4, 260, 8, 2); ctx.fill()
    ctx.fillStyle = '#888'
    ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#444'
    ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(-3, 50); ctx.lineTo(3, 50); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#e53935'
    ctx.beginPath(); ctx.moveTo(-2, 45); ctx.lineTo(0, 52); ctx.lineTo(2, 45); ctx.closePath(); ctx.fill()

    const leftX = bx - 100 * Math.cos(s.beamAngle)
    const leftY = by - 15 - 100 * Math.sin(s.beamAngle)
    const rightX = bx + 100 * Math.cos(s.beamAngle)
    const rightY = by - 15 + 100 * Math.sin(s.beamAngle)
    ctx.restore()

    // 托盘
    const leftObjs = s.objects.filter(o => o.onLeftPan)
    drawPan(ctx, leftX, leftY, leftObjs, null)
    drawPan(ctx, rightX, rightY, null, s.weightsOnPan)

    // 刻度盘
    ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.arc(bx, by + 40, 16, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#bbb'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(bx, by + 40, 16, 0, Math.PI * 2); ctx.stroke()
    for (let i = -3; i <= 3; i++) {
      const a = i * 0.07
      ctx.strokeStyle = i === 0 ? '#4CAF50' : '#aaa'; ctx.lineWidth = i === 0 ? 2 : 1
      ctx.beginPath()
      ctx.moveTo(bx + 12 * Math.sin(a), by + 40 - 12 * Math.cos(a))
      ctx.lineTo(bx + 15 * Math.sin(a), by + 40 - 15 * Math.cos(a))
      ctx.stroke()
    }
    drawRiderScale(ctx, bx, by - 42, s.riderPos)

    // 状态提示
    ctx.textAlign = 'center'
    const onPanCount = s.objects.filter(o => o.onLeftPan).length
    if (onPanCount > 0 || s.weightsOnPan.length > 0) {
      const { diff } = getBalanceState()
      if (Math.abs(diff) < 0.5) {
        ctx.fillStyle = '#4CAF50'; ctx.font = 'bold 11px sans-serif'
        ctx.fillText('✓ 平衡', bx, by + 100)
      } else {
        ctx.fillStyle = '#FF9800'; ctx.font = '11px sans-serif'
        ctx.fillText(diff > 0 ? '左倾 ↑ 加砝码' : '右倾 ↓ 减砝码', bx, by + 100)
      }
    } else if (!s.balanceZeroed) {
      ctx.fillStyle = '#4A90D9'; ctx.font = '11px sans-serif'
      ctx.fillText('请点击平衡螺母调零', bx, by + 100)
    }
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'
    ctx.fillText('托盘天平', bx, by + 112)
  }

  function drawPan(ctx, x, y, objsOnPan, weights) {
    const px = x, py = y + 49
    const edgeY = py - 3
    ctx.strokeStyle = '#888'; ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(px - 24, edgeY); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(px + 24, edgeY); ctx.stroke()
    const g = ctx.createLinearGradient(px - 28, py, px + 28, py + 6)
    g.addColorStop(0, '#c0c0c0'); g.addColorStop(0.5, '#ddd'); g.addColorStop(1, '#aaa')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.ellipse(px, py, 28, 6, 0, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#999'; ctx.lineWidth = 0.8
    ctx.beginPath(); ctx.ellipse(px, py, 28, 6, 0, 0, Math.PI * 2); ctx.stroke()
    if (objsOnPan && objsOnPan.length > 0) {
      objsOnPan.forEach((o, i) => {
        const ox = px - 10 + i * 20
        drawOreBlock(ctx, ox, py - 12, o.material, o.num, true)
      })
    }
    if (weights && weights.length > 0) {
      let wx = px - 20
      weights.forEach((w) => {
        const def = WEIGHTS.find(d => d.value === w.value)
        if (def) { drawSmallWeight(ctx, wx + def.r, py - 8, def); wx += def.r * 2 + 3 }
      })
    }
  }

  function drawKnob(ctx, x, y) {
    const g = ctx.createRadialGradient(x - 2, y - 2, 0, x, y, 9)
    g.addColorStop(0, '#aaa'); g.addColorStop(1, '#666')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.stroke()
  }

  function drawRiderScale(ctx, bx, by, riderPos) {
    const scaleW = 220, scaleH = 10
    const sx = bx - scaleW / 2
    const sg = ctx.createLinearGradient(0, by, 0, by + scaleH)
    sg.addColorStop(0, '#ddd'); sg.addColorStop(1, '#bbb')
    ctx.fillStyle = sg
    ctx.fillRect(sx, by, scaleW, scaleH)
    ctx.strokeStyle = '#999'; ctx.lineWidth = 0.5
    ctx.strokeRect(sx, by, scaleW, scaleH)
    ctx.fillStyle = '#666'; ctx.font = '8px monospace'; ctx.textAlign = 'center'
    for (let v = 0; v <= 5; v += 0.5) {
      const x = sx + (v / 5) * scaleW
      const major = v % 1 === 0
      ctx.strokeStyle = '#666'; ctx.lineWidth = major ? 1 : 0.5
      ctx.beginPath(); ctx.moveTo(x, by); ctx.lineTo(x, by + (major ? 8 : 4)); ctx.stroke()
      if (major) ctx.fillText(`${v}`, x, by + scaleH + 10)
    }
    const riderX = sx + (riderPos / 5) * scaleW
    ctx.fillStyle = '#e53935'
    ctx.beginPath(); ctx.moveTo(riderX, by - 5); ctx.lineTo(riderX - 4, by + 1); ctx.lineTo(riderX + 4, by + 1); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#c62828'; ctx.fillRect(riderX - 3, by + 1, 6, scaleH - 1)
    ctx.fillStyle = '#e53935'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'
    ctx.fillText(`${riderPos.toFixed(1)}g`, riderX, by - 8)
  }

  function drawWeightBox(ctx, L) {
    const { boxX: bx, boxY: by } = L
    const s = sim.current
    const boxW = 200, boxH = 110
    const woodGrad = ctx.createLinearGradient(bx, by, bx, by + boxH)
    woodGrad.addColorStop(0, '#a08060'); woodGrad.addColorStop(0.5, '#8b6b4a'); woodGrad.addColorStop(1, '#7a5c3a')
    ctx.fillStyle = woodGrad
    ctx.beginPath(); roundedRect(ctx, bx, by, boxW, boxH, 5); ctx.fill()
    ctx.strokeStyle = '#5a4020'; ctx.lineWidth = 2
    ctx.beginPath(); roundedRect(ctx, bx, by, boxW, boxH, 5); ctx.stroke()
    ctx.strokeStyle = '#6a4a28'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(bx + 3, by + 18); ctx.lineTo(bx + boxW - 3, by + 18); ctx.stroke()
    ctx.fillStyle = '#f0e0c0'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('砝码盒', bx + boxW / 2, by + 13)

    let wx = bx + 12, wy = by + 28
    WEIGHTS.forEach((w) => {
      const onPan = s.weightsOnPan.some(wp => wp.id === w.id)
      ctx.fillStyle = 'rgba(0,0,0,0.15)'
      ctx.beginPath(); roundedRect(ctx, wx - 1, wy - 1, w.r * 2 + 2, w.h + 2, 2); ctx.fill()
      if (onPan) {
        ctx.fillStyle = 'rgba(90,60,30,0.3)'
        ctx.beginPath(); roundedRect(ctx, wx, wy, w.r * 2, w.h, 2); ctx.fill()
      } else {
        drawSmallWeight(ctx, wx + w.r, wy + w.h / 2, w)
      }
      w._x = wx; w._y = wy
      wx += w.r * 2 + 6
      if (wx + w.r * 2 > bx + boxW - 8) { wx = bx + 12; wy += 22 }
    })
    ctx.fillStyle = '#b0a080'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('拖拽砝码→右盘', bx + boxW / 2, by + boxH - 5)
  }

  function drawSmallWeight(ctx, cx, cy, w) {
    const r = w.r, h = w.h
    const sideGrad = ctx.createLinearGradient(cx - r, cy, cx + r, cy)
    sideGrad.addColorStop(0, '#888'); sideGrad.addColorStop(0.3, '#ccc'); sideGrad.addColorStop(0.7, '#bbb'); sideGrad.addColorStop(1, '#888')
    ctx.fillStyle = sideGrad
    ctx.beginPath()
    ctx.moveTo(cx - r, cy - h / 2); ctx.lineTo(cx + r, cy - h / 2); ctx.lineTo(cx + r, cy + h / 2); ctx.lineTo(cx - r, cy + h / 2)
    ctx.closePath(); ctx.fill()
    const topGrad = ctx.createLinearGradient(cx - r, cy - h / 2, cx + r, cy - h / 2)
    topGrad.addColorStop(0, '#aaa'); topGrad.addColorStop(0.5, '#ddd'); topGrad.addColorStop(1, '#aaa')
    ctx.fillStyle = topGrad
    ctx.beginPath(); ctx.ellipse(cx, cy - h / 2, r, r * 0.35, 0, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#777'; ctx.lineWidth = 0.5
    ctx.beginPath(); ctx.ellipse(cx, cy - h / 2, r, r * 0.35, 0, 0, Math.PI * 2); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = `bold ${Math.max(7, r - 2)}px sans-serif`; ctx.textAlign = 'center'
    ctx.fillText(`${w.value}`, cx, cy + 2)
  }

  function drawOreBlock(ctx, x, y, mat, num, small) {
    ctx.save(); ctx.translate(x, y)
    const sc = small ? 0.65 : 1
    ctx.scale(sc, sc)
    const pts = [[-16, -8], [-10, -14], [2, -13], [14, -9], [16, -2], [12, 8], [4, 12], [-8, 11], [-15, 4], [-17, -3]]
    const g = ctx.createLinearGradient(-16, -14, 16, 12)
    g.addColorStop(0, mat.color); g.addColorStop(0.4, mat.color2); g.addColorStop(0.7, mat.color); g.addColorStop(1, mat.color3)
    ctx.fillStyle = g
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach(p => ctx.lineTo(p[0], p[1])); ctx.closePath(); ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1.5; ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.beginPath(); ctx.moveTo(-10, -14); ctx.lineTo(2, -13); ctx.lineTo(6, -6); ctx.lineTo(-4, -7); ctx.closePath(); ctx.fill()
    // 编号圆圈
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.beginPath(); ctx.arc(0, -2, small ? 7 : 10, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = `bold ${small ? 9 : 13}px sans-serif`; ctx.textAlign = 'center'
    ctx.fillText(`${num}`, 0, small ? 1 : 3)
    // 名称
    if (!small) {
      ctx.fillStyle = '#ddd'; ctx.font = '8px sans-serif'
      ctx.fillText(mat.name, 0, 14)
    }
    ctx.restore()
  }

  function drawCylinder(ctx, L) {
    const s = sim.current
    const { cylX: cx, cylY: cy } = L
    const cylObj = s.objects.find(o => o.inCylinder)
    const cw = 64, ch = 280, maxVol = 50
    ctx.fillStyle = 'rgba(200, 220, 245, 0.12)'
    ctx.beginPath()
    ctx.moveTo(cx - cw / 2 + 4, cy); ctx.lineTo(cx + cw / 2 - 4, cy)
    ctx.quadraticCurveTo(cx + cw / 2, cy, cx + cw / 2, cy + 5)
    ctx.lineTo(cx + cw / 2, cy + ch - 5)
    ctx.quadraticCurveTo(cx + cw / 2, cy + ch, cx + cw / 2 - 4, cy + ch)
    ctx.lineTo(cx - cw / 2 + 4, cy + ch)
    ctx.quadraticCurveTo(cx - cw / 2, cy + ch, cx - cw / 2, cy + ch - 5)
    ctx.lineTo(cx - cw / 2, cy + 5)
    ctx.quadraticCurveTo(cx - cw / 2, cy, cx - cw / 2 + 4, cy)
    ctx.closePath(); ctx.fill()
    ctx.strokeStyle = 'rgba(100, 160, 220, 0.45)'; ctx.lineWidth = 2; ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(cx - cw / 2 + 6, cy + 10); ctx.lineTo(cx - cw / 2 + 6, cy + ch - 10); ctx.stroke()

    const waterLevel = cylObj ? s.waterV2 : s.waterV1
    const waterH = (waterLevel / maxVol) * ch
    const waterY = cy + ch - waterH
    const waterGrad = ctx.createLinearGradient(0, waterY, 0, cy + ch)
    waterGrad.addColorStop(0, 'rgba(66, 165, 245, 0.25)'); waterGrad.addColorStop(1, 'rgba(33, 150, 243, 0.4)')
    ctx.fillStyle = waterGrad
    ctx.beginPath()
    ctx.moveTo(cx - cw / 2 + 3, cy + ch); ctx.lineTo(cx - cw / 2 + 3, waterY); ctx.lineTo(cx + cw / 2 - 3, waterY); ctx.lineTo(cx + cw / 2 - 3, cy + ch)
    ctx.closePath(); ctx.fill()
    ctx.strokeStyle = 'rgba(33, 150, 243, 0.7)'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(cx - cw / 2 + 4, waterY + 2); ctx.quadraticCurveTo(cx, waterY - 3, cx + cw / 2 - 4, waterY + 2); ctx.stroke()

    if (cylObj) {
      ctx.save(); ctx.globalAlpha = 0.8
      drawOreBlock(ctx, cx, waterY + 28, cylObj.material, cylObj.num, false)
      ctx.restore()
    }

    ctx.fillStyle = '#777'; ctx.font = '9px monospace'; ctx.textAlign = 'left'
    for (let v = 0; v <= maxVol; v += 5) {
      const y = cy + ch - (v / maxVol) * ch; const major = v % 10 === 0
      ctx.strokeStyle = major ? '#888' : '#aaa'; ctx.lineWidth = major ? 1 : 0.5
      ctx.beginPath(); ctx.moveTo(cx + cw / 2, y); ctx.lineTo(cx + cw / 2 + (major ? 12 : 6), y); ctx.stroke()
      if (major) ctx.fillText(`${v}`, cx + cw / 2 + 14, y + 3)
    }

    const readingY = waterY + 2
    ctx.strokeStyle = '#e53935'; ctx.lineWidth = 1; ctx.setLineDash([4, 3])
    ctx.beginPath(); ctx.moveTo(cx - cw / 2 - 20, readingY); ctx.lineTo(cx + cw / 2 + 30, readingY); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#e53935'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right'
    ctx.fillText('👁 视线', cx - cw / 2 - 22, readingY + 4)
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'
    ctx.fillText(`V = ${waterLevel.toFixed(1)} mL`, cx, cy + ch + 22)
    if (cylObj) {
      const v1y = cy + ch - (cylObj.measuredV1 / maxVol) * ch
      const v2y = cy + ch - (cylObj.measuredV2 / maxVol) * ch
      ctx.fillStyle = '#2196F3'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right'
      ctx.fillText(`V₁=${cylObj.measuredV1.toFixed(1)}`, cx - cw / 2 - 5, v1y + 4)
      ctx.fillStyle = '#4CAF50'
      ctx.fillText(`V₂=${cylObj.measuredV2.toFixed(1)}`, cx - cw / 2 - 5, v2y + 4)
    }
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('量筒', cx, cy - 12)
    if (!cylObj) {
      const onPanObj = s.objects.find(o => o.onLeftPan && !o.completed)
      if (onPanObj) {
        ctx.fillStyle = '#4A90D9'; ctx.font = '11px sans-serif'
        ctx.fillText('↓ 拖拽物体入量筒', cx, cy + ch + 40)
      }
    }
  }

  function drawObjects(ctx, L) {
    const s = sim.current
    const positions = L.objPositions
    s.objects.forEach((o, i) => {
      if (o.onLeftPan || o.inCylinder || o.completed) return
      if (s.dragging === `object:${i}`) return
      const pos = positions[i]
      drawOreBlock(ctx, pos.x, pos.y, o.material, o.num, false)
      if (i === s.activeObjIdx) {
        ctx.strokeStyle = '#4A90D9'; ctx.lineWidth = 2.5; ctx.setLineDash([4, 3])
        ctx.beginPath(); ctx.arc(pos.x, pos.y, 26, 0, Math.PI * 2); ctx.stroke()
        ctx.setLineDash([])
      }
    })
  }

  function drawDragging(ctx, L) {
    const s = sim.current
    if (!s.dragging) return
    const dx = s.dragX, dy = s.dragY
    ctx.globalAlpha = 0.8
    if (s.dragging && s.dragging.startsWith('object:')) {
      const idx = parseInt(s.dragging.split(':')[1])
      const o = s.objects[idx]
      if (o) drawOreBlock(ctx, dx, dy, o.material, o.num, false)
    } else if (s.dragging.startsWith('weight:') || s.dragging.startsWith('weightOff:')) {
      const dragId = s.dragging.split(':')[1]
      const def = WEIGHTS.find(w => w.id === dragId)
      if (def) drawSmallWeight(ctx, dx, dy, def)
    }
    ctx.globalAlpha = 1
  }

  function roundedRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y)
    ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r)
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h)
    ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r)
    ctx.arcTo(x, y, x + r, y, r); ctx.closePath()
  }

  // ============ 交互 ============
  function getPos(e) {
    const r = canvasRef.current.getBoundingClientRect()
    const t = e.touches?.[0] || e.changedTouches?.[0]
    return [t ? t.clientX - r.left : e.clientX - r.left, t ? t.clientY - r.top : e.clientY - r.top]
  }

  useEffect(() => {
    function onMove(e) {
      const s = sim.current
      if (!s.dragging) return
      const [sx, sy] = getPos(e)
      s.dragX = sx; s.dragY = sy
      if (s.dragging === 'rider') {
        const L = getLayout()
        const riderSX = L.balX - 110
        s.riderPos = parseFloat((Math.max(0, Math.min(1, (sx - riderSX) / 220)) * 5).toFixed(1))
        updateBalance()
      }
      triggerRender(); e.preventDefault()
    }
    function onUp(e) {
      const s = sim.current
      if (!s.dragging) return
      const [sx, sy] = getPos(e)
      const L = getLayout()
      const a = s.beamAngle

      if (s.dragging && s.dragging.startsWith('object:')) {
        const idx = parseInt(s.dragging.split(':')[1])
        const o = s.objects[idx]
        const panX = L.balX - 100 * Math.cos(a)
        const panY = L.balY - 15 - 100 * Math.sin(a) + 49
        if (s.balanceZeroed && Math.abs(sx - panX) < 60 && Math.abs(sy - panY) < 50) {
          o.onLeftPan = true; s.activeObjIdx = idx; setActiveObjIdx(idx); updateBalance()
        }
        if (Math.abs(sx - L.cylX) < 50 && sy > L.cylY && sy < L.cylY + 310) {
          o.inCylinder = true
          o.measuredV1 = s.waterV1
          o.measuredV2 = s.waterV1 + o.material.volume
          o.measuredVolume = o.material.volume
          s.waterV2 = o.measuredV2
          s.activeObjIdx = idx; setActiveObjIdx(idx)
        }
      } else if (s.dragging.startsWith('weight:') || s.dragging.startsWith('weightOff:')) {
        const wid = s.dragging.split(':')[1]
        const panX = L.balX + 100 * Math.cos(a)
        const panY = L.balY - 15 + 100 * Math.sin(a) + 49
        const onPan = s.balanceZeroed && Math.abs(sx - panX) < 60 && Math.abs(sy - panY) < 50
        if (onPan) {
          const def = WEIGHTS.find(w => w.id === wid)
          if (def && !s.weightsOnPan.some(w => w.id === wid)) {
            s.weightsOnPan.push({ value: def.value, id: def.id }); updateBalance()
          }
        }
      } else if (s.dragging === 'rider') {
        updateBalance()
      }
      s.dragging = null; triggerRender()
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [triggerRender])

  const handlePointerDown = useCallback((e) => {
    const [sx, sy] = getPos(e)
    const s = sim.current
    const L = getLayout()
    const a = s.beamAngle

    // 调零螺母
    for (const dx of [-55, 55]) {
      if (Math.abs(sx - (L.balX + dx)) < 20 && Math.abs(sy - (L.balY + 60)) < 20) {
        s.balanceZeroed = true; s.beamAngle = 0; s.beamTargetAngle = 0
        triggerRender(); e.preventDefault(); return
      }
    }

    // 砝码盒中的砝码
    for (const w of WEIGHTS) {
      if (w._x == null) continue
      if (s.weightsOnPan.some(wp => wp.id === w.id)) continue
      if (sx >= w._x && sx <= w._x + w.r * 2 && sy >= w._y && sy <= w._y + w.h) {
        s.dragging = `weight:${w.id}`; s.dragX = sx; s.dragY = sy
        e.preventDefault(); return
      }
    }

    // 盘上砝码（可撤回）
    if (s.weightsOnPan.length > 0) {
      const panX = L.balX + 100 * Math.cos(a)
      const panY = L.balY - 15 + 100 * Math.sin(a) + 49
      if (Math.abs(sx - panX) < 40 && Math.abs(sy - panY) < 25) {
        const last = s.weightsOnPan[s.weightsOnPan.length - 1]
        s.dragging = `weightOff:${last.id}`; s.dragX = sx; s.dragY = sy
        e.preventDefault(); return
      }
    }

    // 游码
    const riderSX = L.balX - 120, riderSY = L.balY - 42
    if (sx >= riderSX && sx <= riderSX + 240 && sy >= riderSY - 20 && sy <= riderSY + 30) {
      s.dragging = 'rider'; e.preventDefault(); return
    }

    // 3个物体
    const positions = L.objPositions
    for (let i = 0; i < s.objects.length; i++) {
      const o = s.objects[i]
      if (o.inCylinder || o.completed) continue
      if (!o.onLeftPan) {
        const pos = positions[i]
        if (Math.abs(sx - pos.x) < 40 && Math.abs(sy - pos.y) < 35) {
          s.dragging = `object:${i}`; s.dragX = sx; s.dragY = sy
          s.activeObjIdx = i; setActiveObjIdx(i)
          e.preventDefault(); return
        }
      } else {
        const panX = L.balX - 100 * Math.cos(a)
        const panY = L.balY - 15 - 100 * Math.sin(a) + 49
        if (Math.abs(sx - panX) < 60 && Math.abs(sy - panY) < 40) {
          o.onLeftPan = false
          s.dragging = `object:${i}`; s.dragX = sx; s.dragY = sy
          s.activeObjIdx = i; setActiveObjIdx(i)
          updateBalance(); e.preventDefault(); return
        }
      }
    }
  }, [triggerRender])

  function handleReset() {
    const s = sim.current
    s.balanceZeroed = false; s.beamAngle = 0; s.beamTargetAngle = 0
    s.weightsOnPan = []; s.riderPos = 0
    s.waterV2 = s.waterV1
    s.objects.forEach((o) => {
      o.onLeftPan = false; o.inCylinder = false
      o.measuredMass = 0; o.measuredV1 = 0; o.measuredV2 = 0; o.measuredVolume = 0
      o.completed = false; o.trialIndex = -1
    })
    s.activeObjIdx = -1; setActiveObjIdx(-1)
    s.trials = []; s.dragging = null
    setTrials([]); triggerRender()
  }

  function handleRecord() {
    const s = sim.current
    let recorded = false
    s.objects.forEach(o => {
      if (o.completed || o.measuredMass <= 0 || o.measuredVolume <= 0) return
      const density = o.measuredMass / o.measuredVolume
      const trial = { num: o.num, name: o.material.name, mass: o.measuredMass, v1: o.measuredV1, v2: o.measuredV2, volume: o.measuredVolume, density }
      o.trialIndex = s.trials.length
      s.trials.push(trial)
      o.completed = true
      o.onLeftPan = false
      recorded = true
    })
    if (recorded) {
      s.objects.forEach(o => { if (o.inCylinder) o.inCylinder = false })
      s.waterV2 = s.waterV1
      setTrials([...s.trials])
      setActiveObjIdx(-1); s.activeObjIdx = -1
    }
  }

  function handleRedo(idx) {
    const s = sim.current
    const o = s.objects[idx]
    // 从trials中移除
    if (o.trialIndex >= 0) {
      s.trials.splice(o.trialIndex, 1)
      s.trials.forEach((t, i) => { const obj = s.objects.find(ob => ob.trialIndex > o.trialIndex && ob.num === t.num); if (obj) obj.trialIndex = i })
      setTrials([...s.trials])
    }
    o.onLeftPan = false; o.inCylinder = false
    o.measuredMass = 0; o.measuredV1 = 0; o.measuredV2 = 0; o.measuredVolume = 0
    o.completed = false; o.trialIndex = -1
    s.activeObjIdx = idx; setActiveObjIdx(idx)
    triggerRender()
  }

  const avgDensity = trials.length > 0 ? trials.reduce((a, t) => a + t.density, 0) / trials.length : null
  const canRecord = sim.current.balanceZeroed && sim.current.objects.some(o => !o.completed && o.measuredMass > 0 && o.measuredVolume > 0)

  return (
    <div style={st.page}>
      <div style={st.header}>
        <span style={st.headerTitle}>⚖️ 测量物质密度</span>
        <span style={st.headerSub}>ρ = m / V | 托盘天平 + 量筒排水法 | 3个待测物体</span>
      </div>
      <div style={st.main}>
        <div style={st.canvasWrap}>
          <canvas ref={canvasRef} style={st.canvas}
            onMouseDown={handlePointerDown}
            onTouchStart={handlePointerDown}
            onContextMenu={e => e.preventDefault()} />
        </div>
        <div style={st.rightPanel}>
          {/* 3个物体卡片 */}
          <div style={st.section}>
            <div style={st.sectionTitle}>🧪 待测物体（3个）</div>
            {sim.current.objects.map((o, i) => (
              <div key={i} style={{
                ...st.objCard,
                borderColor: o.completed ? '#4CAF50' : i === activeObjIdx ? '#4A90D9' : '#eee',
                background: o.completed ? 'rgba(76,175,80,0.06)' : i === activeObjIdx ? 'rgba(74,144,217,0.06)' : '#fff',
              }}>
                <div style={st.objCardHeader}>
                  <span style={{ ...st.objNum, background: o.completed ? '#4CAF50' : '#4A90D9' }}>{o.num}</span>
                  <span style={st.objName}>{o.material.name}</span>
                  {o.completed && <span style={st.objDone}>✓ 完成</span>}
                </div>
                <div style={st.objCardRow}>
                  <span>ρ={o.material.density} g/cm³</span>
                  <span>m={o.material.mass}g</span>
                  <span>V={o.material.volume}cm³</span>
                </div>
                {o.completed && o.trialIndex >= 0 && (
                  <div style={st.objCardRow}>
                    <span style={{ color: '#4CAF50', fontWeight: 700 }}>ρ测={trials[o.trialIndex]?.density.toFixed(2)}</span>
                    <span style={{ color: '#FF9800' }}>误差{(Math.abs(trials[o.trialIndex]?.density - o.material.density) / o.material.density * 100).toFixed(1)}%</span>
                    <button style={st.redoBtn} onClick={() => handleRedo(i)}>重做</button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 当前操作物体的数据 */}
          <div style={st.section}>
            <div style={st.sectionTitle}>📊 测量数据</div>
            {activeObjIdx >= 0 && activeObjIdx < sim.current.objects.length ? (() => {
              const o = sim.current.objects[activeObjIdx]
              return <>
                <div style={st.activeLabel}>当前：物体{o.num}（{o.material.name}）</div>
                {[
                  ['质量 m', o.measuredMass, 'g', '#4CAF50'],
                  ['初始体积 V₁', o.measuredV1, 'mL', '#2196F3'],
                  ['末体积 V₂', o.measuredV2, 'mL', '#2196F3'],
                  ['物体体积 V', o.measuredVolume, 'cm³', '#FF9800'],
                ].map(([label, val, unit, color], j) => (
                  <div key={j} style={st.dataRow}>
                    <span style={st.dataLabel}>{label}</span>
                    <span style={{ ...st.dataValue, color: val > 0 ? color : '#999' }}>{val > 0 ? `${val.toFixed(1)} ${unit}` : '待测量'}</span>
                  </div>
                ))}
                <div style={{ height: 1, background: 'rgba(0,0,0,0.06)', margin: '8px 0' }} />
                <div style={st.dataRow}>
                  <span style={st.dataLabel}>测量密度 ρ测</span>
                  <span style={{ ...st.dataValue, color: o.measuredMass > 0 && o.measuredVolume > 0 ? '#E6A800' : '#999', fontWeight: 700 }}>
                    {o.measuredMass > 0 && o.measuredVolume > 0 ? `${(o.measuredMass / o.measuredVolume).toFixed(2)} g/cm³` : '需m和V'}
                  </span>
                </div>
                {o.measuredMass > 0 && o.measuredVolume > 0 && (
                  <div style={st.dataRow}>
                    <span style={st.dataLabel}>误差</span>
                    <span style={{ ...st.dataValue, color: Math.abs((o.measuredMass / o.measuredVolume) - o.material.density) / o.material.density < 0.05 ? '#4CAF50' : '#FF9800' }}>
                      {(Math.abs((o.measuredMass / o.measuredVolume) - o.material.density) / o.material.density * 100).toFixed(1)}%
                    </span>
                  </div>
                )}
              </>
            })() : (
              <div style={{ padding: '12px 0', textAlign: 'center', color: '#bbb', fontSize: 11 }}>← 点击或拖拽物体开始测量</div>
            )}
          </div>

          {/* 操作按钮 */}
          <div style={st.section}>
            <div style={st.btnRow}>
              <button style={{ ...st.btn, background: canRecord ? '#2196F3' : '#ccc', color: canRecord ? '#fff' : '#999', cursor: canRecord ? 'pointer' : 'not-allowed' }} onClick={handleRecord} disabled={!canRecord}>📌 记录数据</button>
              <button style={{ ...st.btn, background: '#ef4444', color: '#fff' }} onClick={handleReset}>↺ 全部重置</button>
            </div>
          </div>

          {/* 实验记录表 */}
          <div style={st.section}>
            <div style={st.sectionTitle}>📋 实验记录</div>
            <div style={st.tableScroll}>
              <table style={st.table}>
                <thead><tr>{['#', '物体', 'm(g)', 'V₁', 'V₂', 'V', 'ρ测', '误差'].map(h => <th key={h} style={st.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {trials.length === 0 ? <tr><td colSpan={8} style={st.emptyTd}>暂无数据</td></tr>
                    : trials.map((t, i) => <tr key={i} style={i % 2 === 0 ? st.trEven : st.trOdd}>
                      <td style={st.td}>{t.num}</td>
                      <td style={st.td}>{t.name}</td>
                      <td style={st.tdNum}>{t.mass.toFixed(1)}</td>
                      <td style={st.tdNum}>{t.v1.toFixed(1)}</td>
                      <td style={st.tdNum}>{t.v2.toFixed(1)}</td>
                      <td style={st.tdNum}>{t.volume.toFixed(1)}</td>
                      <td style={st.tdNum}>{t.density.toFixed(2)}</td>
                      <td style={st.tdNum}>{
                        (() => {
                          const mat = MATERIALS[OBJECT_LIST.find(o => o.num === t.num)?.materialKey]
                          return mat ? `${(Math.abs(t.density - mat.density) / mat.density * 100).toFixed(1)}%` : '-'
                        })()
                      }</td>
                    </tr>)}
                </tbody>
              </table>
            </div>
            {avgDensity !== null && <div style={st.avgBox}>
              <div style={st.avgTitle}>📊 平均密度（{trials.length}次）</div>
              <div style={st.avgVal}>{avgDensity.toFixed(2)} g/cm³ = {(avgDensity * 1000).toFixed(0)} kg/m³</div>
            </div>}
          </div>

          {/* 实验步骤 */}
          <div style={st.section}>
            <div style={st.sectionTitle}>📝 实验步骤</div>
            <div style={st.steps}>
              {['① 点击平衡螺母调平天平', '② 拖拽物体①→左盘，加砝码+游码至平衡', '③ 记录质量m', '④ 拖拽物体①浸没量筒，读V₂-V₁', '⑤ 记录数据，自动进入物体②', '⑥ 重复步骤②~⑤完成3个物体', '⑦ 比较ρ测与ρ理论'].map((s, i) => <div key={i}>{s}</div>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const st = {
  page: { display: 'flex', flexDirection: 'column', width: '100%', height: '100vh', background: '#f0f0ec', color: '#333', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', overflow: 'hidden', userSelect: 'none' },
  header: { height: 44, flexShrink: 0, background: 'linear-gradient(135deg, #2e7d32, #1b5e20)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)', zIndex: 20 },
  headerTitle: { color: '#fff', fontSize: 15, fontWeight: 700 },
  headerSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  main: { display: 'flex', flex: 1, overflow: 'hidden' },
  canvasWrap: { flex: 1, position: 'relative', overflow: 'hidden' },
  canvas: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', touchAction: 'none' },
  rightPanel: { width: 280, flexShrink: 0, background: '#fff', borderLeft: '1px solid #e0e0e0', padding: '8px 10px', overflowY: 'auto', zIndex: 10 },
  section: { marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #eee' },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: '#666', marginBottom: 6, letterSpacing: 0.5 },
  objCard: { border: '1.5px solid #eee', borderRadius: 8, padding: '6px 10px', marginBottom: 6, transition: 'all 0.2s' },
  objCardHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 },
  objNum: { width: 22, height: 22, borderRadius: '50%', background: '#4A90D9', color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  objName: { fontSize: 13, fontWeight: 600, color: '#333' },
  objDone: { marginLeft: 'auto', color: '#4CAF50', fontSize: 11, fontWeight: 700 },
  objCardRow: { display: 'flex', gap: 10, fontSize: 10, color: '#888', marginTop: 2 },
  activeLabel: { fontSize: 11, fontWeight: 600, color: '#4A90D9', marginBottom: 6 },
  redoBtn: { marginLeft: 'auto', border: 'none', background: '#ef4444', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer' },
  dataRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' },
  dataLabel: { fontSize: 11, color: '#888' },
  dataValue: { fontSize: 12, fontWeight: 600, fontFamily: 'monospace' },
  btnRow: { display: 'flex', gap: 6 },
  btn: { flex: 1, border: 'none', borderRadius: 6, padding: '8px 10px', fontSize: 12, cursor: 'pointer', fontWeight: 600 },
  tableScroll: { maxHeight: 140, overflowY: 'auto', marginBottom: 6 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 10 },
  th: { background: '#f5f5f5', color: '#666', padding: '4px 6px', textAlign: 'center', fontWeight: 600, borderBottom: '1px solid #eee', position: 'sticky', top: 0 },
  td: { padding: '4px 6px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' },
  tdNum: { padding: '4px 6px', textAlign: 'right', borderBottom: '1px solid #f0f0f0', fontFamily: 'monospace' },
  emptyTd: { padding: 12, textAlign: 'center', color: '#bbb', fontStyle: 'italic' },
  trEven: { background: 'rgba(0,0,0,0.01)' },
  trOdd: { background: 'transparent' },
  avgBox: { background: 'rgba(76,175,80,0.08)', borderRadius: 6, padding: '8px 10px', borderLeft: '3px solid #4CAF50', marginTop: 6 },
  avgTitle: { fontSize: 10, fontWeight: 700, color: '#4CAF50', marginBottom: 4 },
  avgVal: { fontSize: 12, fontWeight: 700, color: '#2e7d32', fontFamily: 'monospace' },
  steps: { fontSize: 10, color: '#888', lineHeight: 1.8 },
}
