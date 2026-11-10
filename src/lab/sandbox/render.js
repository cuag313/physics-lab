/**
 * sandbox/render.js — 沙盒渲染层
 *
 * 复用 render/ 下的写实教具基元（parts / wire / needle / workbench / theme），
 * 并补充两个新器材：学生电源（drawPowerSupply）、灵敏电流计（drawGalvanometer）。
 * 所有元件都在本地坐标绘制，接线柱固定在 (±40, 0)。
 */

import { drawBench } from '../render/workbench.js'
import {
  drawBattery, drawBulb, drawSwitch, drawResistor, drawRheostat, drawMeter,
} from '../render/parts.js'
import {
  T, rr, vGrad, hGrad, glossBand, edgeDark, drawScrew, drawBindingPost, label, fmt,
} from '../render/theme.js'
import { wirePath, drawWire, drawWirePreview, drawFlow, flowSpeed } from '../render/wire.js'
import { stepNeedle, peekNeedle, METER_SCALES } from '../render/needle.js'
import { termWorld, bulbState } from './circuit.js'

// ────────────────────────────────────────────────────────────────
//  本地小工具
// ────────────────────────────────────────────────────────────────

function softShadow(ctx, x, y, w, h, r = 6) {
  ctx.fillStyle = 'rgba(0,0,0,0.20)'
  rr(ctx, x - 1, y + 3, w + 2, h, r)
  ctx.fill()
  ctx.fillStyle = 'rgba(0,0,0,0.12)'
  rr(ctx, x - 4, y + 6, w + 8, h, r + 3)
  ctx.fill()
}

// ────────────────────────────────────────────────────────────────
//  新器材 1：学生电源（直流稳压电源）
// ────────────────────────────────────────────────────────────────

export function drawPowerSupply(ctx, o = {}) {
  const { voltage = 6, on = true } = o
  const W = 108, H = 58
  ctx.save()

  // 金属外壳（蓝灰三段渐变）
  softShadow(ctx, -W / 2, -H / 2, W, H, 8)
  ctx.fillStyle = vGrad(ctx, 0, -H / 2, H / 2, ['#4d6675', '#31414d', '#1b252c'])
  rr(ctx, -W / 2, -H / 2, W, H, 8)
  ctx.fill()
  edgeDark(ctx, () => rr(ctx, -W / 2, -H / 2, W, H, 8), 1.8, 0.45)
  glossBand(ctx, -W / 2 + 4, -H / 2 + 2, W - 8, 6, 0.22)
  drawScrew(ctx, -W / 2 + 7, -H / 2 + 7, 2.6, 0.4)
  drawScrew(ctx, W / 2 - 7, -H / 2 + 7, 2.6, -0.4)

  // 面板分隔线
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(-W / 2 + 6, H / 2 - 24)
  ctx.lineTo(W / 2 - 6, H / 2 - 24)
  ctx.stroke()

  // 数字电压显示窗
  const dw = 52, dh = 20, dx = -dw / 2, dy = -H / 2 + 12
  ctx.fillStyle = '#1a1f23'
  rr(ctx, dx - 3, dy - 3, dw + 6, dh + 6, 4)
  ctx.fill()
  ctx.fillStyle = on ? '#eaffea' : '#2a2e33'
  rr(ctx, dx, dy, dw, dh, 2)
  ctx.fill()
  label(ctx, on ? `${fmt(voltage, 1)}` : '--', dx + dw / 2 - 10, dy + dh / 2, {
    size: 12, color: on ? '#c62828' : '#5a626a', weight: '800', baseline: 'middle', align: 'right',
    font: 'ui-monospace, Consolas, monospace',
  })
  label(ctx, 'V', dx + dw / 2 - 3, dy + dh / 2, {
    size: 8, color: on ? '#8a2a2a' : '#5a626a', weight: '700', baseline: 'middle', align: 'left',
  })

  // 型号丝印
  label(ctx, '学生电源', -W / 2 + 18, -H / 2 + 11, { size: 8, color: 'rgba(200,220,235,0.85)', weight: '700', align: 'left' })
  label(ctx, 'DC OUTPUT', W / 2 - 8, -H / 2 + 11, { size: 6, color: 'rgba(180,200,215,0.6)', weight: '600', align: 'right' })

  // 调压旋钮
  const kx = -10, ky = H / 2 - 12
  ctx.fillStyle = hGrad(ctx, kx - 8, kx + 8, ky, T.chrome)
  ctx.beginPath()
  ctx.arc(kx, ky, 8, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'
  ctx.lineWidth = 0.8
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.beginPath()
  ctx.arc(kx - 2.5, ky - 3, 1.8, 0, Math.PI * 2)
  ctx.fill()
  // 旋钮指示线
  ctx.strokeStyle = '#c62828'
  ctx.lineWidth = 1.6
  ctx.lineCap = 'round'
  const ang = -0.5 + (Math.max(0, Math.min(12, voltage)) / 12) * 2.1
  ctx.beginPath()
  ctx.moveTo(kx, ky)
  ctx.lineTo(kx + Math.cos(ang) * 6, ky + Math.sin(ang) * 6)
  ctx.stroke()
  ctx.lineCap = 'butt'
  label(ctx, '电压', kx, ky + 13, { size: 6.5, color: 'rgba(200,215,225,0.7)', weight: '600' })

  // 电源指示灯
  const lx = 22, ly = H / 2 - 12
  ctx.fillStyle = on ? '#3ddc84' : '#3a444c'
  ctx.beginPath()
  ctx.arc(lx, ly, 3.4, 0, Math.PI * 2)
  ctx.fill()
  if (on) {
    ctx.fillStyle = 'rgba(61,220,132,0.35)'
    ctx.beginPath()
    ctx.arc(lx, ly, 7, 0, Math.PI * 2)
    ctx.fill()
  }
  label(ctx, 'POWER', lx, ly - 8, { size: 6, color: 'rgba(200,215,225,0.6)', weight: '600' })

  ctx.restore()
}

// ────────────────────────────────────────────────────────────────
//  新器材 2：灵敏电流计（检流计，零刻度居中）
// ────────────────────────────────────────────────────────────────

export function drawGalvanometer(ctx, o = {}) {
  const { value = 0, range = 0.05, needle = 0 } = o
  const W = 62, H = 56
  const signed = Math.max(-1.05, Math.min(1.05, needle))
  ctx.save()

  // 外壳（深色胶木）
  softShadow(ctx, -W / 2, -H / 2, W, H, 8)
  ctx.fillStyle = vGrad(ctx, 0, -H / 2, H / 2, ['#4a5259', '#2f363b', '#1b2024'])
  rr(ctx, -W / 2, -H / 2, W, H, 8)
  ctx.fill()
  edgeDark(ctx, () => rr(ctx, -W / 2, -H / 2, W, H, 8), 1.8, 0.45)
  glossBand(ctx, -W / 2 + 3, -H / 2 + 2, W - 6, 6, 0.30)

  // 表盘窗
  const dw = W - 12, dh = H - 24
  const dx = -dw / 2, dy = -H / 2 + 4
  ctx.fillStyle = vGrad(ctx, 0, dy, dy + dh, T.dial)
  rr(ctx, dx, dy, dw, dh, 3)
  ctx.fill()
  edgeDark(ctx, () => rr(ctx, dx, dy, dw, dh, 3), 1.2, 0.35)

  // 零刻度居中：上半弧 180°→360°（左→右，顶部为 0）
  const cx = 0, cy = dy + dh - 6, r = dh - 10
  const A0 = Math.PI, A1 = Math.PI * 2
  ctx.strokeStyle = 'rgba(40,42,40,0.9)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(cx, cy, r, A0, A1)
  ctx.stroke()

  // 刻度：左右各 5 格（共 10 格，0 在中间）
  const DIV = 10
  for (let i = 0; i <= DIV; i++) {
    const a = A0 + ((A1 - A0) * i) / DIV
    const major = i % 5 === 0
    const len = major ? 5.5 : 3
    ctx.strokeStyle = major ? 'rgba(30,30,28,0.95)' : 'rgba(60,60,56,0.8)'
    ctx.lineWidth = major ? 1.2 : 0.7
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
    ctx.lineTo(cx + Math.cos(a) * (r - len), cy + Math.sin(a) * (r - len))
    ctx.stroke()
    if (major) {
      const v = Math.round((range * 1000) * ((i / DIV) * 2 - 1)) / 1000 // 左负右正（mA）
      label(ctx, String(Math.abs(v)), cx + Math.cos(a) * (r - 10), cy + Math.sin(a) * (r - 10), {
        size: 6.5, color: '#2b2b28', weight: '700', baseline: 'middle',
      })
    }
  }
  // 零刻度「0」与单位
  label(ctx, '0', cx, cy - r - 3, { size: 6.5, color: '#2b2b28', weight: '700', baseline: 'bottom' })
  label(ctx, 'G', cx, cy - 6, { size: 12, color: '#1b5e20', weight: '800', baseline: 'middle' })
  label(ctx, 'μA', cx, cy + 8, { size: 6, color: 'rgba(60,60,56,0.85)', weight: '700' })

  // 指针（随 signed 偏转）
  const pa = (A0 + A1) / 2 - signed * (Math.PI / 2)
  const nx = Math.cos(pa), ny = Math.sin(pa)
  ctx.save()
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'
  ctx.lineWidth = 2.6
  ctx.beginPath()
  ctx.moveTo(cx + nx * -3 + 0.8, cy + ny * -3 + 1)
  ctx.lineTo(cx + nx * (r - 2) + 0.8, cy + ny * (r - 2) + 1)
  ctx.stroke()
  ctx.strokeStyle = '#b71c1c'
  ctx.lineWidth = 1.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx + nx * -3, cy + ny * -3)
  ctx.lineTo(cx + nx * (r - 2), cy + ny * (r - 2))
  ctx.stroke()
  ctx.lineCap = 'butt'
  ctx.fillStyle = hGrad(ctx, cx - 3, cx + 3, cy, T.chrome)
  ctx.beginPath()
  ctx.arc(cx, cy, 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'
  ctx.lineWidth = 0.7
  ctx.stroke()
  ctx.restore()

  // 读数
  const shown = Math.abs(value || 0)
  label(ctx, `${fmt(shown * 1000, 1)}μA`, 0, H / 2 - 5, {
    size: 8, color: 'rgba(180,225,255,0.95)', weight: '700', font: 'ui-monospace, Consolas, monospace',
  })

  ctx.restore()
}

// ────────────────────────────────────────────────────────────────
//  元件绘制分发
// ────────────────────────────────────────────────────────────────

/** 电表目标偏转比例（普通表 0..1.05，检流计 -1.05..+1.05） */
function meterTarget(comp, results) {
  const r = results.get(comp.id)
  if (comp.type === 'galvanometer') {
    const range = comp.props.range || 0.05
    const v = r ? r.current : 0
    return Math.max(-1.05, Math.min(1.05, v / range))
  }
  if (comp.type === 'ammeter') {
    const range = comp.props.range || 3
    const v = r ? Math.abs(r.current) : 0
    return Math.max(-0.06, Math.min(1.05, v / range))
  }
  if (comp.type === 'voltmeter') {
    const range = comp.props.range || 15
    const v = r ? Math.abs(r.voltage) : 0
    return Math.max(-0.06, Math.min(1.05, v / range))
  }
  return 0
}

function isMeter(type) {
  return type === 'ammeter' || type === 'voltmeter' || type === 'galvanometer'
}

/** 在元件本地坐标绘制本体（不画接线柱） */
export function drawComponent(ctx, comp, o = {}) {
  const r = o.results && o.results.get(comp.id)
  const needle = o.needles ? (o.needles.get(comp.id) ?? 0) : 0
  const p = comp.props || {}

  ctx.save()
  ctx.translate(comp.x, comp.y)

  switch (comp.type) {
    case 'battery':
      drawBattery(ctx, { voltage: p.voltage ?? 3 })
      break
    case 'powerSupply':
      drawPowerSupply(ctx, { voltage: p.voltage ?? 6, on: p.on !== false })
      break
    case 'bulb': {
      const bs = bulbState(comp, o.results || new Map())
      drawBulb(ctx, { brightness: bs.brightness, overload: bs.overload })
      break
    }
    case 'resistor':
      drawResistor(ctx, { resistance: p.resistance ?? 10 })
      break
    case 'rheostat':
      drawRheostat(ctx, { R: p.resistance ?? 20, maxR: p.maxR ?? 50 })
      break
    case 'switch':
      drawSwitch(ctx, { closed: p.closed !== false })
      break
    case 'ammeter':
      drawMeter(ctx, {
        kind: 'A', value: r ? Math.abs(r.current) : 0,
        range: p.range ?? 3, needle, over: Math.abs(needle) >= 1.04,
      })
      break
    case 'voltmeter':
      drawMeter(ctx, {
        kind: 'V', value: r ? Math.abs(r.voltage) : 0,
        range: p.range ?? 15, needle, over: Math.abs(needle) >= 1.04,
      })
      break
    case 'galvanometer':
      drawGalvanometer(ctx, { value: r ? r.current : 0, range: p.range ?? 0.05, needle })
      break
  }
  ctx.restore()

  // 接线柱（电表本体已自带红黑接线柱，其余器材这里统一补画）
  if (!isMeter(comp.type)) {
    const left = termWorld(comp, 0)
    const right = termWorld(comp, 1)
    const isSource = comp.type === 'battery' || comp.type === 'powerSupply'
    drawBindingPost(ctx, {
      x: left.x, y: left.y, r: 6,
      color: isSource ? '#1b1b1b' : null,
      hover: o.hoverTerm && o.hoverTerm.compId === comp.id && o.hoverTerm.portIdx === 0,
      active: o.activeTerm && o.activeTerm.compId === comp.id && o.activeTerm.portIdx === 0,
    })
    drawBindingPost(ctx, {
      x: right.x, y: right.y, r: 6,
      color: isSource ? '#c62828' : null,
      hover: o.hoverTerm && o.hoverTerm.compId === comp.id && o.hoverTerm.portIdx === 1,
      active: o.activeTerm && o.activeTerm.compId === comp.id && o.activeTerm.portIdx === 1,
    })
  }

  // 选中高亮框
  if (o.selectedId === comp.id) {
    ctx.save()
    ctx.strokeStyle = 'rgba(90,169,255,0.9)'
    ctx.lineWidth = 1.4 / (o.viewScale || 1)
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    rr(ctx, comp.x - 48, comp.y - 34, 96, 68, 8)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }
}

// ────────────────────────────────────────────────────────────────
//  导线粒子相位（模块级，随帧推进）
// ────────────────────────────────────────────────────────────────

const _wirePhase = new Map()

function wireKey(w) { return w.id }

// ────────────────────────────────────────────────────────────────
//  主渲染帧
// ────────────────────────────────────────────────────────────────

export function renderFrame(ctx, W, H, s) {
  const dpr = s.dpr || 1

  // 1) 桌面（CSS 像素空间）
  ctx.save()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W, H)
  drawBench(ctx, W, H, { time: s.time || 0 })
  ctx.restore()

  // 2) 世界空间（缩放 + 平移）
  const v = s.view
  ctx.save()
  ctx.setTransform(dpr * v.scale, 0, 0, dpr * v.scale, dpr * v.ox, dpr * v.oy)

  // 3) 导线
  for (const w of s.wires) {
    const a = s.components.find((c) => c.id === w.from.compId)
    const b = s.components.find((c) => c.id === w.to.compId)
    if (!a || !b) continue
    const f = termWorld(a, w.from.portIdx)
    const t = termWorld(b, w.to.portIdx)
    const path = wirePath(f, t, w.from.portIdx, w.to.portIdx, w.m1, w.m2)
    const cur = s.wireCurrent ? s.wireCurrent(w) : 0
    const energized = s.running && Math.abs(cur) > 1e-4
    drawWire(ctx, path, { color: '#e53935', width: 4, energized, dim: !energized })
  }

  // 4) 元件（先算指针目标，逐帧推进阻尼指针）
  const needles = new Map()
  for (const c of s.components) {
    if (!isMeter(c.type)) continue
    const target = meterTarget(c, s.results)
    const key = `sbox:${c.id}`
    let n
    if (c.type === 'galvanometer') {
      // 检流计零刻度居中：把 [-1,1] 映射到 [0,1] 走阻尼，再映射回来
      const t01 = Math.max(0, Math.min(1, (target + 1) / 2))
      const n01 = s.running ? stepNeedle(key, t01, s.dt || 0.016) : peekNeedle(key)
      n = n01 * 2 - 1
    } else {
      n = s.running ? stepNeedle(key, target, s.dt || 0.016) : peekNeedle(key)
    }
    needles.set(c.id, n)
  }

  for (const c of s.components) {
    drawComponent(ctx, c, {
      results: s.results,
      needles,
      selectedId: s.selectedId,
      hoverTerm: s.hoverTerm,
      activeTerm: s.activeTerm,
      viewScale: v.scale,
      running: s.running,
    })
  }

  // 5) 电流粒子流（只在运行且通电时）
  if (s.running) {
    for (const w of s.wires) {
      const a = s.components.find((c) => c.id === w.from.compId)
      const b = s.components.find((c) => c.id === w.to.compId)
      if (!a || !b) continue
      const cur = s.wireCurrent ? s.wireCurrent(w) : 0
      if (Math.abs(cur) < 1e-4) continue
      const f = termWorld(a, w.from.portIdx)
      const t = termWorld(b, w.to.portIdx)
      const path = wirePath(f, t, w.from.portIdx, w.to.portIdx, w.m1, w.m2)
      const key = wireKey(w)
      const speed = flowSpeed(cur)
      const phase = ((_wirePhase.get(key) ?? 0) + speed * (s.dt || 0.016)) % 1
      _wirePhase.set(key, phase)
      drawFlow(ctx, path, { phase, dir: cur >= 0 ? 1 : -1, current: cur, mode: 'I' })
    }
  }

  // 6) 连线预览
  if (s.wiring) {
    const a = s.components.find((c) => c.id === s.wiring.compId)
    if (a) {
      const f = termWorld(a, s.wiring.portIdx)
      const t = s.wiring.mouse
      const path = wirePath(f, t, s.wiring.portIdx, s.wiring.portIdx)
      drawWirePreview(ctx, path, { snapped: !!s.wiring.snapped })
    }
  }

  ctx.restore()
}

// ────────────────────────────────────────────────────────────────
//  侧边栏缩略图
// ────────────────────────────────────────────────────────────────

/** 在给定 canvas 上画一个器材缩略图（写实缩小版） */
export function renderThumb(canvas, type, def) {
  const dpr = window.devicePixelRatio || 1
  const w = canvas.width / dpr
  const h = canvas.height / dpr
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  // 半透明底座，让器材「坐」在上面
  ctx.fillStyle = 'rgba(255,255,255,0.05)'
  rr(ctx, 2, h - 8, w - 4, 6, 3)
  ctx.fill()

  const p = def?.defaults || {}
  ctx.save()
  ctx.translate(w / 2, h / 2 - 3)
  ctx.scale(0.44, 0.44)

  switch (type) {
    case 'battery': drawBattery(ctx, { voltage: p.voltage ?? 3 }); break
    case 'powerSupply': drawPowerSupply(ctx, { voltage: p.voltage ?? 6, on: true }); break
    case 'bulb': drawBulb(ctx, { brightness: 0.5, overload: 0 }); break
    case 'resistor': drawResistor(ctx, { resistance: p.resistance ?? 10 }); break
    case 'rheostat': drawRheostat(ctx, { R: p.resistance ?? 20, maxR: 50 }); break
    case 'switch': drawSwitch(ctx, { closed: false }); break
    case 'ammeter': drawMeter(ctx, { kind: 'A', value: 0.9, range: 3, needle: 0.3, over: false }); break
    case 'voltmeter': drawMeter(ctx, { kind: 'V', value: 3, range: 15, needle: 0.2, over: false }); break
    case 'galvanometer': drawGalvanometer(ctx, { value: 0.00002, range: 0.05, needle: 0.4 }); break
  }
  ctx.restore()
}

export { METER_SCALES }
