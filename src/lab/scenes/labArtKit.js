/**
 * labArtKit — 实验场景共用的画布绘图基元 + 仪器美术件
 *
 * 统一风格来源：电表改装与校准场景（浅绿实验台、白盘黑框电表、胶木壳闸刀、
 * 瓷筒滑变、软导线）。新增电学场景请直接复用，不要另起一套，
 * 保证像素口径与交互热区一致。
 */

const THEME = {
  blue: ['#4C97E8', '#1E6FD0', '#0F4A93'],
  red: ['#EF5F57', '#C62828', '#8C1717'],
  wine: ['#C45550', '#9A2F2C', '#671917'],
  dark: ['#5E6B75', '#3B454D', '#232A30'],
}

export { THEME }

/* ==================================================================
 *  基础绘制工具
 * ================================================================== */
export function rr(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, Math.min(w, h) / 2)))
}

export function line(ctx, x1, y1, x2, y2, color, width) {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}

export function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

export function T(ctx, str, x, y, o = {}) {
  const {
    size = 12, color = '#243542', bold = false, align = 'left',
    base = 'middle', mono = false,
  } = o
  ctx.save()
  ctx.font = `${bold ? 'bold ' : ''}${size}px ${mono ? 'Consolas, "Courier New", monospace' : '"Microsoft YaHei", sans-serif'}`
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = base
  ctx.fillText(str, x, y)
  ctx.restore()
}

export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)) }

export function ease(s, key, target) {
  const cur = s.needle[key] || 0
  const next = cur + (target - cur) * 0.16
  s.needle[key] = Math.abs(target - next) < 0.002 ? target : next
  return s.needle[key]
}

/** 实验台垫：浅青绿板 + 细网格（对齐视频里的绿板） */
export function drawBoard(ctx, b) {
  ctx.save()
  ctx.shadowColor = 'rgba(86,108,90,0.16)'
  ctx.shadowBlur = 18
  ctx.shadowOffsetY = 6
  ctx.fillStyle = '#EDF3EC'
  rr(ctx, b.x, b.y, b.w, b.h, 18)
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  const g = ctx.createLinearGradient(b.x, b.y, b.x + b.w * 0.3, b.y + b.h)
  g.addColorStop(0, 'rgba(255,255,255,0.7)')
  g.addColorStop(1, 'rgba(208,226,212,0.55)')
  ctx.fillStyle = g
  rr(ctx, b.x, b.y, b.w, b.h, 18)
  ctx.fill()

  ctx.save()
  rr(ctx, b.x, b.y, b.w, b.h, 18)
  ctx.clip()
  ctx.strokeStyle = 'rgba(96,132,104,0.075)'
  ctx.lineWidth = 1
  for (let x = b.x + 26; x < b.x + b.w; x += 26) line(ctx, x, b.y, x, b.y + b.h, 'rgba(96,132,104,0.075)', 1)
  for (let y = b.y + 26; y < b.y + b.h; y += 26) line(ctx, b.x, y, b.x + b.w, y, 'rgba(96,132,104,0.075)', 1)
  ctx.restore()
  ctx.strokeStyle = '#D2E0D4'
  ctx.lineWidth = 1.2
  rr(ctx, b.x, b.y, b.w, b.h, 18)
  ctx.stroke()
  ctx.restore()
}

/** 通用说明卡（标题 + 若干行） */
export function noteCard(ctx, x, y, w, h, k, o) {
  softCard(ctx, x, y, w, h, o.fill || '#FFFFFF', o.stroke || '#E3E9ED')
  T(ctx, o.title, x + 12 * k, y + 16 * k, { size: Math.round(10.5 * k), bold: true, color: o.color })
  const n = Math.min(o.lines.length, Math.floor((h - 26 * k) / (17 * k)))
  for (let i = 0; i < n; i += 1) {
    T(ctx, `· ${o.lines[i]}`, x + 12 * k, y + 34 * k + i * 17 * k, {
      size: Math.round(9.5 * k), color: '#5B6B5F',
    })
  }
}

/** 白色小卡（结论牌 / 数据卡底） */
export function softCard(ctx, x, y, w, h, fill, stroke) {
  ctx.save()
  ctx.shadowColor = 'rgba(74,94,84,0.10)'
  ctx.shadowBlur = 10
  ctx.shadowOffsetY = 3
  ctx.fillStyle = fill
  rr(ctx, x, y, w, h, 10)
  ctx.fill()
  ctx.restore()
  ctx.strokeStyle = stroke
  ctx.lineWidth = 1
  rr(ctx, x, y, w, h, 10)
  ctx.stroke()
}

export function chip(ctx, x, y, w, h, txt, color, k) {
  ctx.save()
  ctx.fillStyle = hexA(color, 0.10)
  rr(ctx, x, y, w, h, h / 2)
  ctx.fill()
  ctx.strokeStyle = hexA(color, 0.35)
  ctx.lineWidth = 1
  rr(ctx, x, y, w, h, h / 2)
  ctx.stroke()
  ctx.restore()
  T(ctx, txt, x + w / 2, y + h / 2 + 1, {
    size: Math.round(10.5 * Math.max(0.8, k)), bold: true, color, align: 'center',
  })
}

export function drawButton(ctx, x, y, w, h, txt, color, enabled, k) {
  ctx.save()
  ctx.fillStyle = enabled ? color : '#9AA7AF'
  rr(ctx, x, y, w, h, 8)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  rr(ctx, x + 3, y + 2, w - 6, h * 0.4, 5)
  ctx.fill()
  ctx.restore()
  T(ctx, txt, x + w / 2, y + h / 2 + 1, {
    size: Math.round(10.5 * Math.max(0.8, k)), bold: true, color: '#fff', align: 'center',
  })
}

/** 带标签的一行滑条，返回下一行 y */
export function sliderRow(ctx, x, y, w, k, o) {
  const { label, value, min, max, step, unit, color, onDrag } = o
  const h = 16 * k
  T(ctx, label, x, y, { size: Math.round(10.5 * k), color: '#4B5A66', bold: true })
  T(ctx, `${Number(value).toFixed(step < 1 ? 1 : 0)} ${unit}`, x + w, y, {
    size: Math.round(11 * k), color, bold: true, align: 'right', mono: true,
  })
  const ty = y + h * 0.9
  line(ctx, x, ty, x + w, ty, '#D4DEE3', Math.max(2.4, 3.4 * k))
  const ratio = (value - min) / (max - min)
  line(ctx, x, ty, x + w * ratio, ty, color, Math.max(2.4, 3.4 * k))
  ctx.save()
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(x + w * ratio, ty, Math.max(5.5, 7 * k), 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = 1.6
  ctx.stroke()
  ctx.restore()
  areaForDrag(ctx, x, ty, w, step, min, max, onDrag, k)
  return ty + 12 * k
}

/** 公式板 */
export function formulaPlate(ctx, x, y, w, k, rows) {
  const h = (16 + rows.length * 26) * k
  softCard(ctx, x, y, w, h, '#FFFDF8', '#E8DCC8')
  ctx.save()
  ctx.fillStyle = '#C98A12'
  rr(ctx, x + 8 * k, y + 10 * k, 3, h - 20 * k, 2)
  ctx.fill()
  ctx.restore()
  rows.forEach((r, i) => {
    T(ctx, r.s, x + 18 * k, y + (18 + i * 26) * k, {
      size: Math.round((r.size || 10.5) * k), color: r.color || '#5B6B5F', bold: !!r.bold,
    })
  })
}

/** 统计卡（④ 的两张内阻-量程表） */
export function miniTable(ctx, x, y, w, k, o) {
  const rowH = 20 * k
  const headH = 24 * k
  const footH = o.foot ? 24 * k : 6 * k
  const h = headH + o.rows.length * rowH + footH
  softCard(ctx, x, y, w, h, '#FFFFFF', '#E3E9ED')
  const colW = (w - 20 * k) / o.head.length
  o.head.forEach((t, i) => {
    T(ctx, t, x + 10 * k + (i ? colW * (i + 1) : 0), y + 13 * k, {
      size: Math.round(9.5 * k), color: '#7A8790', bold: true, align: i ? 'right' : 'left',
    })
  })
  line(ctx, x + 8 * k, y + headH - 2 * k, x + w - 8 * k, y + headH - 2 * k, '#E7EDF1', 1)
  o.rows.forEach((row, ri) => {
    const ry = y + headH + rowH * (ri + 0.5)
    if (ri === 0) {
      ctx.fillStyle = hexA(o.color, 0.07)
      rr(ctx, x + 6 * k, ry - rowH / 2 + 1, w - 12 * k, rowH - 2, 4)
      ctx.fill()
    }
    row.forEach((cell, ci) => {
      T(ctx, String(cell), x + 10 * k + (ci ? colW * (ci + 1) : 0), ry, {
        size: Math.round(9.5 * k), color: ci === 0 ? '#42525E' : '#25313A', mono: ci > 0,
        align: ci ? 'right' : 'left', bold: ci === o.head.length - 1,
      })
    })
  })
  if (o.foot) {
    T(ctx, o.foot, x + 10 * k, y + h - 12 * k, { size: Math.round(9 * k), color: '#6B7A83' })
  }
}

export function statCard(ctx, x, y, w, h, fill, stroke, k, o) {
  softCard(ctx, x, y, w, h, fill, stroke)
  T(ctx, o.title, x + 12 * k, y + 18 * k, { size: Math.round(11.5 * k), bold: true, color: o.color })
  const colW = (w - 24 * k) / 4
  const hy = y + 40 * k
  o.head.forEach((h, i) => {
    T(ctx, h, x + 12 * k + i * colW + (i ? colW : 0), hy, {
      size: Math.round(9.5 * k), color: '#7A8790', align: i ? 'right' : 'left',
    })
  })
  const rowH = o.bars ? 22 * k : Math.min(24 * k, (h - 74 * k) / o.rows.length)
  o.rows.forEach((row, ri) => {
    const ry = hy + 18 * k + ri * rowH
    if (ri % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      rr(ctx, x + 8 * k, ry - rowH / 2 - 2, w - 16 * k, rowH, 5)
      ctx.fill()
    }
    row.forEach((cell, ci) => {
      T(ctx, String(cell), x + 12 * k + ci * colW + (ci ? colW : 0), ry, {
        size: Math.round(10 * k), color: ci === 0 ? '#42525E' : '#25313A', mono: ci > 0,
        align: ci ? 'right' : 'left',
        bold: ci === 3,
      })
    })
  })
  // 趋势条：把「量程越大 RA 越小 / RV 越大」画出来
  if (o.bars && o.bars.length) {
    const by0 = hy + 18 * k + o.rows.length * rowH + 8 * k
    const room = y + h - 34 * k - by0
    const gapY = 5 * k
    const barH = Math.max(5, Math.min(11 * k, (room - gapY * (o.bars.length - 1)) / o.bars.length))
    const labW = 42 * k
    const valW = 54 * k
    const trackW = w - 24 * k - labW - valW
    if (room > o.bars.length * 6 + gapY * (o.bars.length - 1)) {
      o.bars.forEach((b, i) => {
        const yy = by0 + i * (barH + gapY)
        T(ctx, b.label, x + 12 * k, yy + barH / 2, { size: Math.round(9 * k), color: '#6B7A83' })
        ctx.fillStyle = 'rgba(255,255,255,0.75)'
        rr(ctx, x + 12 * k + labW, yy, trackW, barH, barH / 2)
        ctx.fill()
        ctx.fillStyle = hexA(o.color, 0.72)
        rr(ctx, x + 12 * k + labW, yy, Math.max(2, trackW * b.frac), barH, barH / 2)
        ctx.fill()
        T(ctx, b.text, x + w - 12 * k, yy + barH / 2, { size: Math.round(9 * k), color: o.color, align: 'right', mono: true, bold: true })
      })
    }
  }
  T(ctx, o.foot, x + 12 * k, y + h - 10 * k, { size: Math.round(9.5 * k), color: '#6B7A83' })
}

export function rangeTicks(max) {
  if (max === 0.6) return [{ t: 0, s: '0' }, { t: 1 / 3, s: '0.2' }, { t: 2 / 3, s: '0.4' }, { t: 1, s: '0.6' }]
  if (max === 1) return [{ t: 0, s: '0' }, { t: 1 / 3, s: '0.33' }, { t: 2 / 3, s: '0.66' }, { t: 1, s: '1' }]
  if (max === 3) return [{ t: 0, s: '0' }, { t: 1 / 3, s: '1' }, { t: 2 / 3, s: '2' }, { t: 1, s: '3' }]
  if (max === 15) return [{ t: 0, s: '0' }, { t: 1 / 3, s: '5' }, { t: 2 / 3, s: '10' }, { t: 1, s: '15' }]
  return [{ t: 0, s: '0' }, { t: 0.5, s: (max / 2).toFixed(1) }, { t: 1, s: String(max) }]
}

/**
 * 教学电表（大画幅）：彩色胶木壳 + 黑框白盘 + 弧形刻度 + 红指针 + 红黑接线柱
 * o: {theme, letter, unit, frac, rangeText, ticks, k, showTerminals}
 */
export function drawMeterArt(ctx, x, y, w, h, o = {}) {
  const theme = THEME[o.theme] || THEME.blue
  const letter = o.letter || 'G'
  const unit = o.unit || ''
  const ticks = o.ticks || []
  const frac = Number.isFinite(o.frac) ? o.frac : 0
  const over = frac > 1.02
  const showTerms = o.showTerminals !== false
  const r = Math.max(7, w * 0.045)

  ctx.save()
  // 投影 + 底部厚度
  ctx.fillStyle = 'rgba(20,34,30,0.22)'
  rr(ctx, x + 4, y + 8, w, h, r)
  ctx.fill()

  const body = ctx.createLinearGradient(x, y, x + w * 0.2, y + h)
  body.addColorStop(0, theme[0])
  body.addColorStop(0.5, theme[1])
  body.addColorStop(1, theme[2])
  ctx.fillStyle = body
  rr(ctx, x, y, w, h, r)
  ctx.fill()

  ctx.save()
  rr(ctx, x, y, w, h, r)
  ctx.clip()
  const side = ctx.createLinearGradient(x, y, x + w, y)
  side.addColorStop(0, 'rgba(255,255,255,0.30)')
  side.addColorStop(0.10, 'rgba(255,255,255,0)')
  side.addColorStop(0.86, 'rgba(0,0,0,0.05)')
  side.addColorStop(1, 'rgba(0,0,0,0.30)')
  ctx.fillStyle = side
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = 'rgba(255,255,255,0.30)'
  ctx.fillRect(x + 8, y + 4, w - 16, Math.max(2, h * 0.016))
  ctx.restore()

  ctx.strokeStyle = 'rgba(10,24,32,0.55)'
  ctx.lineWidth = 1.2
  rr(ctx, x, y, w, h, r)
  ctx.stroke()

  // 表盘
  const dx = x + w * 0.085
  const dy = y + h * 0.085
  const dw = w * 0.83
  const dh = h * (showTerms ? 0.56 : 0.70)
  ctx.fillStyle = '#0C1317'
  rr(ctx, dx - 5, dy - 5, dw + 10, dh + 10, Math.max(6, w * 0.035))
  ctx.fill()
  const face = ctx.createRadialGradient(dx + dw / 2, dy + dh * 0.35, 4, dx + dw / 2, dy + dh * 0.35, dw * 0.62)
  face.addColorStop(0, '#FFFFFF')
  face.addColorStop(0.72, '#FDFDF9')
  face.addColorStop(1, '#E9EDE6')
  ctx.fillStyle = face
  rr(ctx, dx, dy, dw, dh, Math.max(4, w * 0.024))
  ctx.fill()
  ctx.save()
  rr(ctx, dx, dy, dw, dh, Math.max(4, w * 0.024))
  ctx.clip()
  const shade = ctx.createLinearGradient(dx, dy, dx, dy + dh * 0.5)
  shade.addColorStop(0, 'rgba(12,28,38,0.14)')
  shade.addColorStop(1, 'rgba(12,28,38,0)')
  ctx.fillStyle = shade
  ctx.fillRect(dx, dy, dw, dh * 0.5)
  ctx.restore()

  const hub = { x: dx + dw * 0.5, y: dy + dh * 0.95 }
  const rad = Math.min(dw * 0.43, dh * 0.82)
  const a0 = Math.PI * 200 / 180
  const a1 = Math.PI * 340 / 180
  ctx.strokeStyle = '#98A2A7'
  ctx.lineWidth = Math.max(0.8, w * 0.0035)
  ctx.beginPath()
  ctx.arc(hub.x, hub.y, rad, a0, a1)
  ctx.stroke()

  for (let i = 0; i <= 20; i++) {
    const a = a0 + (a1 - a0) * i / 20
    const big = i % 5 === 0
    const r1 = rad
    const r2 = rad - rad * (big ? 0.17 : 0.09)
    ctx.strokeStyle = big ? '#2B353A' : '#9AA4A8'
    ctx.lineWidth = big ? Math.max(1.1, w * 0.005) : Math.max(0.7, w * 0.0025)
    ctx.beginPath()
    ctx.moveTo(hub.x + Math.cos(a) * r1, hub.y + Math.sin(a) * r1)
    ctx.lineTo(hub.x + Math.cos(a) * r2, hub.y + Math.sin(a) * r2)
    ctx.stroke()
  }
  ticks.forEach((tk) => {
    const a = a0 + (a1 - a0) * tk.t
    T(ctx, tk.s, hub.x + Math.cos(a) * rad * 0.70, hub.y + Math.sin(a) * rad * 0.70, {
      size: Math.max(6.5, w * 0.040), color: '#49555B', align: 'center',
    })
  })

  // 表头符号（放在刻度弧内侧下方，避免压住刻度数字）
  T(ctx, letter, hub.x, hub.y - rad * 0.36, {
    size: Math.max(11, dh * 0.30), bold: true, color: over ? '#C62828' : '#233039', align: 'center',
  })
  if (unit) {
    T(ctx, unit, dx + dw * 0.90, hub.y - rad * 0.14, {
      size: Math.max(7, w * 0.032), color: '#79858B', align: 'center',
    })
  }

  // 指针
  const aN = a0 + (a1 - a0) * clamp(frac, -0.02, 1.06)
  const nx = hub.x + Math.cos(aN) * (rad - 1)
  const ny = hub.y + Math.sin(aN) * (rad - 1)
  ctx.strokeStyle = 'rgba(255,255,255,0.72)'
  ctx.lineWidth = Math.max(3, w * 0.017)
  ctx.beginPath()
  ctx.moveTo(hub.x, hub.y)
  ctx.lineTo(nx, ny)
  ctx.stroke()
  ctx.strokeStyle = over ? '#C62828' : '#B3261E'
  ctx.lineWidth = Math.max(1.5, w * 0.0075)
  ctx.beginPath()
  ctx.moveTo(hub.x, hub.y)
  ctx.lineTo(nx, ny)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(80,90,96,0.55)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(hub.x, hub.y)
  ctx.lineTo(hub.x - Math.cos(aN) * w * 0.03, hub.y - Math.sin(aN) * w * 0.03)
  ctx.stroke()
  ctx.fillStyle = '#3C474E'
  ctx.beginPath()
  ctx.arc(hub.x, hub.y, Math.max(2.6, w * 0.016), 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#A8B2B8'
  ctx.beginPath()
  ctx.arc(hub.x - w * 0.004, hub.y - w * 0.004, Math.max(1.2, w * 0.007), 0, Math.PI * 2)
  ctx.fill()

  // 玻璃反光
  ctx.save()
  rr(ctx, dx, dy, dw, dh, Math.max(4, w * 0.024))
  ctx.clip()
  ctx.fillStyle = 'rgba(255,255,255,0.30)'
  ctx.beginPath()
  ctx.moveTo(dx + dw * 0.10, dy)
  ctx.lineTo(dx + dw * 0.42, dy)
  ctx.lineTo(dx + dw * 0.02, dy + dh)
  ctx.lineTo(dx - dw * 0.22, dy + dh)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  if (!showTerms) {
    ctx.restore()
    return { terms: null }
  }

  // 底部接线区（黑胶木条 + 红黑接线柱 + 量程）
  // 接线柱中心固定在 0.845h —— 校准台的引线也按这个比例算，保证线和柱头严丝合缝
  const sh = Math.max(16, h * 0.20)
  const ty = y + h * 0.845
  const sy = ty - sh / 2
  ctx.fillStyle = 'rgba(12,20,26,0.90)'
  rr(ctx, x + w * 0.04, sy, w * 0.92, sh, Math.max(5, w * 0.03))
  ctx.fill()
  const tx1 = x + w * 0.26
  const tx2 = x + w * 0.74
  drawPost(ctx, tx1, ty, w * 0.055, '#1A1A1A')
  drawPost(ctx, tx2, ty, w * 0.055, '#C62828')
  T(ctx, '−', tx1, ty + sh * 0.42, { size: Math.max(7, w * 0.032), color: '#E2E8EC', align: 'center' })
  T(ctx, '+', tx2, ty + sh * 0.42, { size: Math.max(7, w * 0.032), color: '#FFD9D6', align: 'center' })
  if (o.rangeText) {
    T(ctx, o.rangeText, x + w * 0.5, sy + sh * 0.34, {
      size: Math.max(6.5, w * 0.030), color: 'rgba(255,255,255,0.75)', align: 'center',
    })
  }
  ctx.restore()
  return { terms: { neg: { x: tx1, y: ty }, pos: { x: tx2, y: ty } } }
}

/** 接线柱：铜柱 + 彩色胶木帽 */
export function drawPost(ctx, x, y, r, capColor) {
  ctx.save()
  ctx.fillStyle = '#B58A4E'
  ctx.beginPath()
  ctx.ellipse(x, y + r * 0.45, r, r * 0.5, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = capColor
  ctx.beginPath()
  ctx.ellipse(x, y, r, r * 0.72, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.beginPath()
  ctx.ellipse(x - r * 0.28, y - r * 0.2, r * 0.34, r * 0.22, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

export function arrowHead(ctx, x, y, dir, color, s) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x + dir * s, y)
  ctx.lineTo(x - dir * s * 0.4, y - s * 0.55)
  ctx.lineTo(x - dir * s * 0.4, y + s * 0.55)
  ctx.closePath()
  ctx.fill()
}

export function bracket(ctx, x1, x2, y, label, color, k) {
  line(ctx, x1, y, x1, y + 5 * k, color, 1.2)
  line(ctx, x1, y, x2, y, color, 1.2)
  line(ctx, x2, y, x2, y + 5 * k, color, 1.2)
  T(ctx, label, (x1 + x2) / 2, y - 8 * k, { size: Math.round(9.5 * k), color, align: 'center' })
}

/** 电池组实物 */
export function drawBatteryArt(ctx, cx, cy, w, h, k, label, label2) {
  const x = cx - w / 2
  const y = cy - h - 4 * k
  ctx.save()
  ctx.fillStyle = 'rgba(20,34,30,0.18)'
  rr(ctx, x + 3, y + 5, w, h, 8)
  ctx.fill()
  const g = ctx.createLinearGradient(x, y, x, y + h)
  g.addColorStop(0, '#2E3A45')
  g.addColorStop(0.5, '#22303A')
  g.addColorStop(1, '#141E26')
  ctx.fillStyle = g
  rr(ctx, x, y, w, h, 8)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'
  ctx.lineWidth = 1
  ctx.stroke()
  // 两节干电池露出顶面
  const cellW = w * 0.34
  const cellY = y + h * 0.12
  for (const dx of [-cellW * 0.62, cellW * 0.62]) {
    const gx = cx + dx - cellW / 2
    ctx.fillStyle = '#DDE4E8'
    rr(ctx, gx, cellY, cellW, h * 0.44, 4)
    ctx.fill()
    ctx.fillStyle = '#1565C0'
    rr(ctx, gx + cellW * 0.18, cellY + 2, cellW * 0.42, h * 0.40, 2)
    ctx.fill()
    ctx.fillStyle = '#C58A3C'
    rr(ctx, gx + cellW * 0.72, cellY + h * 0.10, cellW * 0.18, h * 0.24, 2)
    ctx.fill()
  }
  // 接线柱（落在母线高度上）
  const ty = cy
  drawPost(ctx, cx - w * 0.30, ty, Math.max(4.5, 5.4 * k), '#1A1A1A')
  drawPost(ctx, cx + w * 0.30, ty, Math.max(4.5, 5.4 * k), '#C62828')
  T(ctx, '−', cx - w * 0.30, ty - 13 * k, { size: Math.round(8.5 * k), color: 'rgba(230,236,240,0.85)', align: 'center' })
  T(ctx, '+', cx + w * 0.30, ty - 13 * k, { size: Math.round(8.5 * k), color: 'rgba(255,214,210,0.9)', align: 'center' })
  T(ctx, label2 || '电池组 3 V', cx, y + h * 0.74, {
    size: Math.round(9 * k), color: 'rgba(255,255,255,0.96)', bold: true, align: 'center',
  })
  if (label) {
    T(ctx, label, cx, y - 8 * k, { size: Math.round(9.5 * k), color: '#6B7A83', align: 'center' })
  }
  ctx.restore()
}

/** 闸刀开关 */
export function drawSwitchArt(ctx, cx, cy, w, closed, k) {
  const baseY = cy
  ctx.save()
  ctx.fillStyle = 'rgba(40,54,44,0.20)'
  rr(ctx, cx - w / 2 + 2, baseY - 20 * k + 3, w, 18 * k, 4)
  ctx.fill()
  const g = ctx.createLinearGradient(0, baseY - 20 * k, 0, baseY - 2 * k)
  g.addColorStop(0, '#6D4C41')
  g.addColorStop(1, '#462C24')
  ctx.fillStyle = g
  rr(ctx, cx - w / 2, baseY - 20 * k, w, 18 * k, 4)
  ctx.fill()
  ctx.strokeStyle = '#3A211A'
  ctx.lineWidth = 1
  ctx.stroke()
  const px1 = cx - w * 0.30
  const px2 = cx + w * 0.30
  drawPost(ctx, px1, baseY, Math.max(3.6, 4.4 * k), '#B58A4E')
  drawPost(ctx, px2, baseY, Math.max(3.6, 4.4 * k), '#B58A4E')
  // 闸刀
  const tipY = closed ? baseY - 2 * k : baseY - 36 * k
  ctx.strokeStyle = closed ? '#E2B34B' : '#C9962F'
  ctx.lineWidth = Math.max(3, 4 * k)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(px1, baseY - 2 * k)
  ctx.lineTo(closed ? px2 : px2 - 4 * k, tipY)
  ctx.stroke()
  ctx.lineCap = 'butt'
  // 手柄
  ctx.fillStyle = '#D32F2F'
  ctx.beginPath()
  ctx.arc(closed ? px2 : px2 - 4 * k, tipY, Math.max(3.2, 4.2 * k), 0, Math.PI * 2)
  ctx.fill()
  T(ctx, closed ? '合' : '断', cx, cy + 12 * k, {
    size: Math.round(9 * k), color: closed ? '#15803D' : '#8A9AA4', align: 'center',
  })
  ctx.restore()
}

/** 滑动变阻器（宽体）+ 滑片 + 可选滑片引出线 */
export function drawRheostatArt(ctx, cx, cy, w, ratio, k, o = {}) {
  const bodyW = w * 0.84
  const bodyH = Math.max(14, w * 0.13)
  const yBody = cy - 30 * k
  ctx.save()
  ctx.fillStyle = 'rgba(30,44,36,0.16)'
  rr(ctx, cx - bodyW / 2 + 3, yBody + 6, bodyW, bodyH, 8)
  ctx.fill()
  // 瓷筒
  const g = ctx.createLinearGradient(0, yBody, 0, yBody + bodyH)
  g.addColorStop(0, '#FFFFFF')
  g.addColorStop(0.45, '#F2EEE7')
  g.addColorStop(1, '#C9BEB2')
  ctx.fillStyle = g
  rr(ctx, cx - bodyW / 2, yBody, bodyW, bodyH, bodyH * 0.45)
  ctx.fill()
  ctx.strokeStyle = '#B9AEA2'
  ctx.lineWidth = 1
  ctx.stroke()
  // 密绕电阻丝
  ctx.save()
  rr(ctx, cx - bodyW / 2, yBody, bodyW, bodyH, bodyH * 0.45)
  ctx.clip()
  const n = Math.max(18, Math.round(bodyW / (3 * k)))
  for (let i = 0; i < n; i++) {
    const px = cx - bodyW / 2 + 3 + i * (bodyW - 6) / n
    ctx.strokeStyle = i % 2 ? 'rgba(88,72,58,0.62)' : 'rgba(140,120,100,0.55)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(px, yBody - 2)
    ctx.lineTo(px, yBody + bodyH + 2)
    ctx.stroke()
  }
  const sheen = ctx.createLinearGradient(0, yBody, 0, yBody + bodyH)
  sheen.addColorStop(0, 'rgba(255,255,255,0.40)')
  sheen.addColorStop(0.42, 'rgba(255,255,255,0.04)')
  sheen.addColorStop(1, 'rgba(0,0,0,0.24)')
  ctx.fillStyle = sheen
  ctx.fillRect(cx - bodyW / 2, yBody, bodyW, bodyH)
  ctx.restore()
  // 端环
  for (const dx of [-bodyW / 2, bodyW / 2]) {
    ctx.fillStyle = '#C79A4B'
    rr(ctx, cx + dx - 3, yBody - 1, 6, bodyH + 2, 2)
    ctx.fill()
  }
  // 金属滑杆
  const rodY = yBody - 16 * k
  ctx.fillStyle = '#B8C2C9'
  rr(ctx, cx - bodyW / 2 - 6 * k, rodY, bodyW + 12 * k, Math.max(3, 4.6 * k), 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  rr(ctx, cx - bodyW / 2 - 4 * k, rodY + 1, bodyW + 8 * k, 1.4 * k, 1)
  ctx.fill()
  // 支脚
  for (const dx of [-bodyW * 0.34, bodyW * 0.34]) {
    ctx.fillStyle = '#7E8B94'
    rr(ctx, cx + dx - 6 * k, yBody + bodyH - 2, 12 * k, 7 * k, 2)
    ctx.fill()
  }
  // 滑片
  const sx = cx - bodyW * 0.42 + clamp(ratio, 0, 1) * bodyW * 0.84
  ctx.fillStyle = '#EF6C00'
  ctx.strokeStyle = '#B34700'
  ctx.lineWidth = 1.2
  rr(ctx, sx - 7 * k, rodY - 8 * k, 14 * k, 15 * k, 3)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  rr(ctx, sx - 5 * k, rodY - 7 * k, 10 * k, 2 * k, 1)
  ctx.fill()
  // 触点
  ctx.strokeStyle = '#D8DEE2'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(sx, rodY + 7 * k)
  ctx.lineTo(sx, yBody + 2)
  ctx.stroke()
  // 引出线（分压用）
  if (o.wiper) {
    ctx.strokeStyle = '#C0392B'
    ctx.lineWidth = 2.6 * k
    ctx.beginPath()
    ctx.moveTo(sx, rodY - 8 * k)
    ctx.lineTo(sx, rodY - 18 * k)
    ctx.stroke()
  }
  ctx.restore()
  drawPost(ctx, cx - w * 0.42, cy, Math.max(4, 5 * k), '#1A1A1A')
  drawPost(ctx, cx + w * 0.42, cy, Math.max(4, 5 * k), '#C62828')
  if (o.label !== false) {
    T(ctx, o.label || '滑动变阻器', cx, yBody + bodyH + 12 * k, {
      size: Math.round(9 * k), color: '#6B7A83', align: 'center',
    })
  }
}

/** 环母线（可留缺口）：顶边被两只电表断开，底边被三件器材断开 */
export function busPath(ctx, o, color, lw) {
  const { L, R, T, B, r: rad, gapTop = [], gapBot = [] } = o
  const draw = () => {
    // 顶边
    let cursor = L + rad
    seg(cursor, T, R - rad, T, gapTop)
    // 底边（从右到左）
    seg(R - rad, B, L + rad, B, gapBot)
    // 左右竖边 + 圆角
    arc(L + rad, B - rad, rad, Math.PI / 2, Math.PI)
    arc(L + rad, T + rad, rad, Math.PI, Math.PI * 1.5)
    arc(R - rad, T + rad, rad, Math.PI * 1.5, Math.PI * 2)
    arc(R - rad, B - rad, rad, 0, Math.PI / 2)
    line(ctx, L, T + rad, L, B - rad, color, lw)
    line(ctx, R, T + rad, R, B - rad, color, lw)
  }
  const seg = (x1, y1, x2, y2, gaps) => {
    const step = x2 >= x1 ? 1 : -1
    const sorted = [...gaps].map(([a, b]) => (step > 0 ? [a, b] : [b, a])).sort((p, q) => (p[0] - q[0]) * step)
    let from = x1
    for (const [a, b] of sorted) {
      const cutStart = clamp(a, Math.min(x1, x2), Math.max(x1, x2))
      const cutEnd = clamp(b, Math.min(x1, x2), Math.max(x1, x2))
      if ((cutStart - from) * step > 2) line(ctx, from, y1, cutStart, y1, color, lw)
      from = cutEnd
    }
    if ((x2 - from) * step > 2) line(ctx, from, y1, x2, y2, color, lw)
  }
  const arc = (cx, cy, rad2, a1, a2) => {
    ctx.strokeStyle = color
    ctx.lineWidth = lw
    ctx.beginPath()
    ctx.arc(cx, cy, rad2, a1, a2)
    ctx.stroke()
  }
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  draw()
  ctx.restore()
}

/** 软导线（带下垂）：从 (x1,y1) 到 (x2,y2)，sag 控制弯曲量 */
export function drawLead(ctx, x1, y1, x2, y2, color, lw, flat) {
  if (lw <= 0) return
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy)
  if (len < 0.5) return
  const sag = flat ? 0 : Math.min(18, len * 0.14) * (dy >= 0 ? 1 : 0.4)
  const cx = (x1 + x2) / 2
  const cy = (y1 + y2) / 2 + sag
  const path = (c) => {
    c.beginPath()
    c.moveTo(x1, y1)
    if (sag <= 0.3) c.lineTo(x2, y2)
    else c.quadraticCurveTo(cx, cy, x2, y2)
    c.stroke()
  }
  ctx.strokeStyle = 'rgba(40,30,26,0.28)'
  ctx.lineWidth = lw + 1.6
  path(ctx)
  ctx.strokeStyle = color
  ctx.lineWidth = lw
  path(ctx)
}



/* ------------------------------------------------------------------
 * 热区注入：场景挂载时把自己的 area() 注册进来，
 * 纯绘制函数（滑条 / 量程药丸）就能登记点击与拖拽
 * ------------------------------------------------------------------ */
let AREA_SINK = null

export function setAreaSink(fn) { AREA_SINK = fn }

export function areaSink(a) { if (AREA_SINK) AREA_SINK(a) }

export function areaForDrag(ctx, x, ty, w, step, min, max, onDrag, k) {
  if (!AREA_SINK) return
  AREA_SINK({
    x: x - 6, y: ty - 12 * k, w: w + 12, h: 24 * k,
    onDrag: (mx) => {
      const v = min + clamp((mx - x) / w, 0, 1) * (max - min)
      const snapped = Math.round(v / step) * step
      onDrag(+snapped.toFixed(step < 1 ? 2 : 0))
    },
  })
}
