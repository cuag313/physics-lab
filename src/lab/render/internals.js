/**
 * internals.js — 元件内部结构教学剖视图（「拆开看内部结构」）
 *
 * 本模块是纯 Canvas2D 绘图层：只负责把每种电学元件的内部构造
 * 以教学剖视图（半剖 / 局部剖 + 45° 细剖面线 + 点画线中心线）的
 * 方式画出来，并给出可作图注的部件清单。
 *
 * 本文件不知道任何电路拓扑、连接关系或物理公式，也不读写场景状态；
 * 唯一职责是「画清楚里面长什么样」。上层「拆开看内部结构」覆盖面板
 * 调用 drawInternal() 得到标题与部件表，再自行渲染图例。
 *
 * 画法约定（与制图课一致）：
 *   - 外壳被局部切开，切口处画出壁厚，壁上打 45° 细剖面线
 *   - 对称件画点画线中心线
 *   - 绕组类零件（灯丝、电阻丝、动圈）画成一圈一圈的真实绕线
 *   - 细实线引出线 + 小字标注每个部件
 */

// ---------------------------------------------------------------------------
// 配色（克制的实验室教具色板，扁平填色 + 细线描边，不用游戏感渐变）
// ---------------------------------------------------------------------------
const P = {
  plastic: '#c9ccd1',
  plasticDark: '#8a9099',
  metal: '#b8bec6',
  metalDark: '#6f7680',
  copper: '#c8814a',
  copperDark: '#a05f2e',
  ceramic: '#e8e0cf',
  ceramicDark: '#c4b89a',
  glass: 'rgba(180, 215, 235, 0.28)',
  glassEdge: 'rgba(140, 180, 210, 0.85)',
  glassWall: 'rgba(160, 195, 220, 0.55)',
  magnet: '#5c6b7a',
  magnetDark: '#3e4a56',
  insulator: '#3a4048',
  ink: '#1f2933',
  hatch: 'rgba(90, 100, 110, 0.48)',
  center: 'rgba(107, 114, 128, 0.55)',
  leader: '#6b7280',
  tungsten: '#c4b49a',
  zinc: '#9aa7b0',
  carbon: '#2f3438',
  mno2: '#4a4d52',
  red: '#c0392b',
  blackTerm: '#1a1d21',
  spring: '#7a828c',
  enamel: '#6b5b4a',
  paste: '#6a6e74',
  labelInk: '#374151',
}

const FONT_LABEL = '11px "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif'

// ---------------------------------------------------------------------------
// 基础工具
// ---------------------------------------------------------------------------

/** 在 save/restore 中执行 fn */
function withSave(ctx, fn) {
  ctx.save()
  try {
    fn()
  } finally {
    ctx.restore()
  }
}

/** 软阴影椭圆（整机底部唯一阴影） */
function softShadow(ctx, cx, cy, rx, ry) {
  withSave(ctx, () => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry))
    g.addColorStop(0, 'rgba(0, 0, 0, 0.18)')
    g.addColorStop(0.55, 'rgba(0, 0, 0, 0.08)')
    g.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.fill()
  })
}

/** 45° 细剖面线，裁剪到矩形区域 */
function hatchRect(ctx, x, y, w, h, opts = {}) {
  const { gap = 5, color = P.hatch, lw = 0.55 } = opts
  withSave(ctx, () => {
    ctx.beginPath()
    ctx.rect(x, y, w, h)
    ctx.clip()
    ctx.strokeStyle = color
    ctx.lineWidth = lw
    const d = w + h
    for (let i = -d; i < d * 2; i += gap) {
      ctx.beginPath()
      ctx.moveTo(x + i, y)
      ctx.lineTo(x + i - h, y + h)
      ctx.stroke()
    }
  })
}

/** 45° 细剖面线，裁剪到任意路径 */
function hatchPath(ctx, pathFn, bounds, opts = {}) {
  const { gap = 5, color = P.hatch, lw = 0.55 } = opts
  const [bx, by, bw, bh] = bounds
  withSave(ctx, () => {
    pathFn()
    ctx.clip()
    ctx.strokeStyle = color
    ctx.lineWidth = lw
    const d = bw + bh
    for (let i = -d; i < d * 2; i += gap) {
      ctx.beginPath()
      ctx.moveTo(bx + i, by)
      ctx.lineTo(bx + i - bh, by + bh)
      ctx.stroke()
    }
  })
}

/** 点画线中心线（长画-点-长画） */
function centerLine(ctx, x1, y1, x2, y2, color = P.center) {
  withSave(ctx, () => {
    ctx.strokeStyle = color
    ctx.lineWidth = 0.7
    ctx.setLineDash([7, 2.2, 1.4, 2.2])
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    ctx.setLineDash([])
  })
}

/** 圆角矩形路径 */
function rrPath(ctx, x, y, w, h, r) {
  const rad = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2)
  ctx.beginPath()
  ctx.moveTo(x + rad, y)
  ctx.arcTo(x + w, y, x + w, y + h, rad)
  ctx.arcTo(x + w, y + h, x, y + h, rad)
  ctx.arcTo(x, y + h, x, y, rad)
  ctx.arcTo(x, y, x + w, y, rad)
  ctx.closePath()
}

function fillStroke(ctx, fill, stroke = P.ink, lw = 1.1) {
  if (fill) {
    ctx.fillStyle = fill
    ctx.fill()
  }
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = lw
    ctx.stroke()
  }
}

/**
 * 螺旋绕组（灯丝 / 双螺旋）：沿 (x1,y1)→(x2,y2) 画一圈圈线圈
 * @param {number} radius 螺旋半径
 * @param {number} turns  匝数
 */
function drawHelix(ctx, x1, y1, x2, y2, radius, turns, color, lw = 1.15) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const nx = -uy
  const ny = ux
  ctx.strokeStyle = color
  ctx.lineWidth = lw
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  const steps = Math.max(36, Math.round(turns * 14))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const ang = t * turns * Math.PI * 2
    const px = x1 + dx * t + nx * Math.cos(ang) * radius
    const py = y1 + dy * t + ny * Math.sin(ang) * radius
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.stroke()
}

/**
 * 密绕线圈侧视：在 (x,y,w,h) 区域内画 turns 个椭圆截面的绕线
 * 用于电阻丝绕线、滑动变阻器绕线
 */
function drawDenseCoil(ctx, x, y, w, h, turns, color, lw = 0.95, phase = 0) {
  const step = w / turns
  ctx.strokeStyle = color
  ctx.lineWidth = lw
  ctx.lineJoin = 'round'
  for (let i = 0; i < turns; i++) {
    const cx = x + step * (i + 0.5)
    const ry = h / 2
    const rx = step * 0.62
    // 用上下两条弧近似一圈绕线的侧影
    ctx.beginPath()
    ctx.ellipse(cx, y + ry, rx, ry, 0, Math.PI * 0.12 + phase, Math.PI * 0.88 + phase)
    ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(cx, y + ry, rx, ry, 0, Math.PI * 1.12 + phase, Math.PI * 1.88 + phase)
    ctx.stroke()
    // 竖直过渡边
    ctx.beginPath()
    ctx.moveTo(cx + rx * Math.cos(Math.PI * 0.88 + phase), y + ry + ry * Math.sin(Math.PI * 0.88 + phase))
    ctx.lineTo(cx + rx * Math.cos(Math.PI * 1.12 + phase), y + ry + ry * Math.sin(Math.PI * 1.12 + phase))
    ctx.stroke()
  }
}

/**
 * 绕组矩形截面（动圈）：在矩形内画一圈圈横向绕线
 */
function drawCoilWindings(ctx, x, y, w, h, rows, color, lw = 0.85) {
  ctx.strokeStyle = color
  ctx.lineWidth = lw
  const step = h / rows
  for (let i = 1; i < rows; i++) {
    const yy = y + step * i
    ctx.beginPath()
    ctx.moveTo(x + 1.2, yy)
    ctx.lineTo(x + w - 1.2, yy)
    ctx.stroke()
  }
  // 两端封边
  ctx.lineWidth = 1.1
  ctx.strokeRect(x, y, w, h)
}

/**
 * 螺旋弹簧俯视（游丝）：阿基米德螺旋
 */
function drawSpiralSpring(ctx, cx, cy, r0, r1, turns, color, lw = 1.1) {
  ctx.strokeStyle = color
  ctx.lineWidth = lw
  ctx.lineJoin = 'round'
  ctx.beginPath()
  const steps = Math.round(turns * 40)
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const ang = t * turns * Math.PI * 2
    const r = r0 + (r1 - r0) * t
    const px = cx + Math.cos(ang) * r
    const py = cy + Math.sin(ang) * r
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.stroke()
}

/** 直螺旋弹簧侧视（开关里的压簧） */
function drawCoilSpring(ctx, x, y, w, h, coils, color, lw = 1.1) {
  ctx.strokeStyle = color
  ctx.lineWidth = lw
  const step = h / coils
  for (let i = 0; i < coils; i++) {
    const yy = y + step * i
    ctx.beginPath()
    ctx.ellipse(x + w / 2, yy + step / 2, w / 2, step * 0.48, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
}

/**
 * 螺纹圆柱侧视（灯头螺纹）：矩形轮廓 + 波浪螺纹线
 */
function drawThreadedBarrel(ctx, x, y, w, h, turns, color, edge) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.fill()
  ctx.strokeStyle = edge
  ctx.lineWidth = 1.1
  ctx.stroke()
  // 螺纹牙型
  ctx.strokeStyle = edge
  ctx.lineWidth = 0.75
  const step = h / turns
  for (let i = 1; i < turns; i++) {
    const yy = y + step * i
    ctx.beginPath()
    ctx.moveTo(x, yy)
    ctx.lineTo(x + w, yy)
    ctx.stroke()
  }
  // 轻微斜向阴影，示意螺纹旋向
  hatchRect(ctx, x, y, w, h, { gap: 7, color: 'rgba(80, 90, 100, 0.22)', lw: 0.5 })
}

/** 红黑接线柱 */
function drawTerminal(ctx, x, y, r, color, ring = P.metal) {
  ctx.fillStyle = ring
  ctx.beginPath()
  ctx.arc(x, y, r + 2.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = P.ink
  ctx.lineWidth = 1
  ctx.stroke()
}

/** N/S 磁极标注 */
function drawPoleMark(ctx, x, y, text, color = P.ink) {
  withSave(ctx, () => {
    ctx.fillStyle = color
    ctx.font = 'bold 12px "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x, y)
  })
}

// ---------------------------------------------------------------------------
// 标注（引出线 + 小字）
// ---------------------------------------------------------------------------

/**
 * @typedef {object} PartMark
 * @property {string} name
 * @property {string} desc
 * @property {string} color
 * @property {number[]} at   设计坐标：引出线起点（部件上）
 * @property {number[]} to   设计坐标：文字锚点
 * @property {'left'|'right'|'center'} [align]
 */

/** 画单条引出线 + 文字（屏幕坐标） */
function drawLeaderLabel(ctx, ax, ay, tx, ty, text, align, color) {
  withSave(ctx, () => {
    ctx.strokeStyle = P.leader
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(tx, ty)
    ctx.stroke()

    // 部件端小圆点（用该部件主色，便于和图例对照）
    ctx.fillStyle = color || P.leader
    ctx.beginPath()
    ctx.arc(ax, ay, 1.7, 0, Math.PI * 2)
    ctx.fill()

    // 文字底衬，避免与图形叠色后不可读
    ctx.font = FONT_LABEL
    const tw = ctx.measureText(text).width
    const padX = 3
    const padY = 2
    const th = 13
    let bx = tx
    if (align === 'right') bx = tx - tw
    else if (align === 'center') bx = tx - tw / 2
    ctx.fillStyle = 'rgba(248, 249, 251, 0.88)'
    ctx.fillRect(bx - padX, ty - th + padY, tw + padX * 2, th)

    ctx.fillStyle = P.labelInk
    ctx.textAlign = align === 'right' ? 'right' : align === 'center' ? 'center' : 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(text, tx, ty)
  })
}

/**
 * 批量画标注。toScreen: (x,y) => [sx, sy] 将设计坐标映到屏幕坐标。
 */
function drawLabels(ctx, parts, toScreen) {
  for (const p of parts) {
    const [ax, ay] = toScreen(p.at[0], p.at[1])
    const [tx, ty] = toScreen(p.to[0], p.to[1])
    drawLeaderLabel(ctx, ax, ay, tx, ty, p.name, p.align || 'left', p.color)
  }
}

/** 把 PartMark 剥成对外 API 的 parts */
function toApiParts(parts) {
  return parts.map((p) => ({ name: p.name, desc: p.desc, color: p.color }))
}

// ---------------------------------------------------------------------------
// 舞台：把 520×420 设计坐标等比缩放进 w×h（留边距，必要时缩小）
// ---------------------------------------------------------------------------

const DESIGN_W = 520
const DESIGN_H = 420

function fitStage(w, h) {
  const pad = 14
  const scale = Math.min((w - pad * 2) / DESIGN_W, (h - pad * 2) / DESIGN_H)
  const s = Math.max(0.25, scale)
  const ox = (w - DESIGN_W * s) / 2
  const oy = (h - DESIGN_H * s) / 2
  return { s, ox, oy }
}

// ===========================================================================
// 元件剖视绘制
// ===========================================================================

/**
 * 小灯泡剖视
 * 玻璃壳（半透明）· 钨丝灯丝（双螺旋）· 两根灯丝支架 · 玻璃珠芯柱 ·
 * 金属灯头（螺纹）· 灯头绝缘体 · 锡焊点
 */
function drawBulb(ctx) {
  const parts = []
  const cx = 260

  // --- 底部环境阴影 ---
  softShadow(ctx, cx, 372, 78, 12)

  // --- 金属灯头（螺纹筒） ---
  const baseX = cx - 38
  const baseY = 286
  const baseW = 76
  const baseH = 78
  drawThreadedBarrel(ctx, baseX, baseY, baseW, baseH, 7, P.metal, P.metalDark)
  // 灯头顶部法兰
  ctx.fillStyle = P.metal
  ctx.beginPath()
  ctx.rect(baseX - 5, baseY - 8, baseW + 10, 10)
  ctx.fill()
  ctx.strokeStyle = P.ink
  ctx.lineWidth = 1.1
  ctx.stroke()
  hatchRect(ctx, baseX - 5, baseY - 8, baseW + 10, 10, { gap: 4.5 })

  // --- 灯头绝缘体（黑胶圈） ---
  const insY = baseY - 26
  ctx.fillStyle = P.insulator
  ctx.beginPath()
  ctx.rect(baseX + 2, insY, baseW - 4, 18)
  ctx.fill()
  ctx.strokeStyle = P.ink
  ctx.lineWidth = 1.1
  ctx.stroke()
  hatchRect(ctx, baseX + 2, insY, baseW - 4, 18, { gap: 4, color: 'rgba(200, 205, 210, 0.28)' })

  // --- 锡焊点（底端中心触点 + 两侧焊点） ---
  ctx.fillStyle = P.copper
  ctx.beginPath()
  ctx.ellipse(cx, baseY + baseH - 4, 11, 5, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = P.copperDark
  ctx.lineWidth = 1
  ctx.stroke()

  const solderY = insY + 4
  for (const sx of [cx - 16, cx + 16]) {
    ctx.fillStyle = P.copper
    ctx.beginPath()
    ctx.ellipse(sx, solderY, 5.5, 3.2, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = P.copperDark
    ctx.lineWidth = 0.9
    ctx.stroke()
  }

  // --- 玻璃珠芯柱 ---
  const stemTop = 188
  const stemBot = insY + 2
  ctx.fillStyle = P.glass
  ctx.beginPath()
  ctx.moveTo(cx - 14, stemBot)
  ctx.quadraticCurveTo(cx - 18, stemTop + 30, cx - 10, stemTop)
  ctx.lineTo(cx + 10, stemTop)
  ctx.quadraticCurveTo(cx + 18, stemTop + 30, cx + 14, stemBot)
  ctx.closePath()
  fillStroke(ctx, P.glass, P.glassEdge, 1.15)
  // 芯柱壁厚剖面
  hatchRect(ctx, cx - 14, stemTop, 5, stemBot - stemTop, { gap: 4, color: 'rgba(120, 155, 180, 0.55)' })
  hatchRect(ctx, cx + 9, stemTop, 5, stemBot - stemTop, { gap: 4, color: 'rgba(120, 155, 180, 0.55)' })

  // --- 导丝 / 灯丝支架（两根） ---
  const supportTop = 142
  const supportBot = solderY - 1
  for (const sx of [cx - 16, cx + 16]) {
    ctx.strokeStyle = P.metalDark
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(sx, supportBot)
    ctx.lineTo(sx, supportTop)
    ctx.stroke()
    // 支架脚
    ctx.lineWidth = 1.3
    ctx.beginPath()
    ctx.moveTo(sx - 4, supportTop)
    ctx.lineTo(sx, supportTop - 6)
    ctx.lineTo(sx + 4, supportTop)
    ctx.stroke()
  }

  // --- 钨丝灯丝（双螺旋） ---
  // 外螺旋 + 内螺旋，视觉上是「双螺旋」
  drawHelix(ctx, cx - 16, supportTop - 6, cx + 16, supportTop - 6, 5.2, 9, P.tungsten, 1.25)
  drawHelix(ctx, cx - 16, supportTop - 6, cx + 16, supportTop - 6, 2.4, 9, '#8a7a62', 0.85)

  // --- 玻璃壳（局部剖：右侧切开） ---
  const bulbTop = 62
  const bulbR = 88
  const neckY = 210
  // 外轮廓完整画出
  const glassPath = () => {
    ctx.beginPath()
    ctx.moveTo(cx, bulbTop)
    ctx.bezierCurveTo(cx + bulbR, bulbTop + 8, cx + bulbR, neckY - 40, cx + 34, neckY)
    ctx.lineTo(cx + 16, stemBot)
    ctx.lineTo(cx - 16, stemBot)
    ctx.lineTo(cx - 34, neckY)
    ctx.bezierCurveTo(cx - bulbR, neckY - 40, cx - bulbR, bulbTop + 8, cx, bulbTop)
    ctx.closePath()
  }

  // 玻璃体（半透明）
  glassPath()
  fillStroke(ctx, P.glass, P.glassEdge, 1.3)

  // 局部剖切口（右侧）：假想切掉一块玻璃，露出内腔与壁厚
  withSave(ctx, () => {
    // 切口轮廓（不规则破裂线）
    ctx.beginPath()
    ctx.moveTo(cx + 28, bulbTop + 18)
    ctx.bezierCurveTo(cx + 70, bulbTop + 30, cx + 82, 150, cx + 62, 186)
    ctx.bezierCurveTo(cx + 48, 208, cx + 40, 220, cx + 30, 228)
    // 回切到壳内表面
    ctx.bezierCurveTo(cx + 22, 210, cx + 30, 160, cx + 18, 110)
    ctx.bezierCurveTo(cx + 12, 80, cx + 18, 40, cx + 28, bulbTop + 18)
    ctx.closePath()
    ctx.fillStyle = 'rgba(232, 238, 244, 0.92)'
    ctx.fill()
    // 切开处的玻璃壁厚剖面线
    hatchPath(
      ctx,
      () => {
        ctx.beginPath()
        ctx.moveTo(cx + 28, bulbTop + 18)
        ctx.bezierCurveTo(cx + 70, bulbTop + 30, cx + 82, 150, cx + 62, 186)
        ctx.bezierCurveTo(cx + 48, 208, cx + 40, 220, cx + 30, 228)
        ctx.lineTo(cx + 36, 232)
        ctx.bezierCurveTo(cx + 50, 216, cx + 58, 196, cx + 70, 176)
        ctx.bezierCurveTo(cx + 88, 146, cx + 78, bulbTop + 40, cx + 34, bulbTop + 24)
        ctx.closePath()
      },
      [cx, bulbTop, bulbR + 10, 200],
      { gap: 4, color: 'rgba(110, 145, 175, 0.55)' },
    )
  })

  // 壳口高光（教学图克制，只留一道细弧）
  withSave(ctx, () => {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.ellipse(cx - 36, 130, 18, 52, -0.35, -1.1, 1.1)
    ctx.stroke()
  })

  // 中心线
  centerLine(ctx, cx, bulbTop - 8, cx, baseY + baseH + 6)

  // --- 图注 ---
  parts.push({
    name: '钨丝灯丝',
    desc: '通电发热发光的双螺旋钨丝，熔点高、发光效率高',
    color: P.tungsten,
    at: [cx + 6, supportTop - 6],
    to: [cx + 128, 118],
    align: 'left',
  })
  parts.push({
    name: '灯丝支架',
    desc: '支撑钨丝并把电流从导丝引到灯丝两端',
    color: P.metalDark,
    at: [cx - 16, 168],
    to: [cx - 118, 150],
    align: 'right',
  })
  parts.push({
    name: '玻璃壳',
    desc: '抽成真空（或充惰性气体），保护钨丝不被氧化',
    color: P.glassEdge,
    at: [cx - 58, 120],
    to: [cx - 130, 88],
    align: 'right',
  })
  parts.push({
    name: '玻璃珠芯柱',
    desc: '固定导丝并与灯头绝缘，支撑整个内芯',
    color: P.glassWall,
    at: [cx - 8, 210],
    to: [cx - 122, 236],
    align: 'right',
  })
  parts.push({
    name: '金属灯头',
    desc: '螺纹旋入灯座，兼作一个电极',
    color: P.metal,
    at: [cx + 38, 320],
    to: [cx + 108, 318],
    align: 'left',
  })
  parts.push({
    name: '灯头绝缘体',
    desc: '把中心触点与螺纹灯头彼此绝缘',
    color: P.insulator,
    at: [cx + 36, insY + 9],
    to: [cx + 112, 268],
    align: 'left',
  })
  parts.push({
    name: '锡焊点',
    desc: '把导丝焊牢在灯头触点上，保证接触良好',
    color: P.copper,
    at: [cx + 16, solderY],
    to: [cx + 112, 248],
    align: 'left',
  })

  return parts
}

/**
 * 定值电阻剖视
 * 陶瓷管 · 电阻丝密绕线圈 · 引出线 · 绝缘漆层 · 端面金属帽 · 色环标识
 */
function drawResistor(ctx) {
  const parts = []
  const cx = 260
  const cy = 210

  softShadow(ctx, cx, cy + 78, 150, 14)

  const tubeX = 148
  const tubeW = 224
  const tubeY = cy - 28
  const tubeH = 56

  // --- 陶瓷管（两端未被绕线覆盖处可见 + 剖切露出管壁） ---
  ctx.fillStyle = P.ceramic
  ctx.beginPath()
  ctx.rect(tubeX, tubeY, tubeW, tubeH)
  ctx.fill()
  ctx.strokeStyle = P.ink
  ctx.lineWidth = 1.15
  ctx.stroke()

  // --- 电阻丝密绕线圈 ---
  const coilX = tubeX + 18
  const coilW = tubeW - 36
  drawDenseCoil(ctx, coilX, tubeY + 6, coilW, tubeH - 12, 22, P.copper, 1.0)

  // --- 绝缘漆层（半透明覆在绕线外） ---
  ctx.fillStyle = 'rgba(107, 91, 74, 0.16)'
  ctx.beginPath()
  ctx.rect(coilX, tubeY + 4, coilW, tubeH - 8)
  ctx.fill()
  ctx.strokeStyle = 'rgba(107, 91, 74, 0.55)'
  ctx.lineWidth = 1
  ctx.stroke()

  // --- 局部剖：切开一段漆层与绕线，露出瓷管壁厚 ---
  const cutX = tubeX + 52
  const cutW = 54
  withSave(ctx, () => {
    ctx.beginPath()
    ctx.rect(cutX, tubeY + 2, cutW, tubeH - 4)
    ctx.fillStyle = 'rgba(236, 232, 220, 0.95)'
    ctx.fill()
    // 瓷管壁剖面（上下壁厚）
    hatchRect(ctx, cutX, tubeY + 2, cutW, 8, { gap: 3.6, color: 'rgba(120, 110, 85, 0.55)' })
    hatchRect(ctx, cutX, tubeY + tubeH - 10, cutW, 8, { gap: 3.6, color: 'rgba(120, 110, 85, 0.55)' })
    // 剖到的几匝电阻丝（截面）
    ctx.strokeStyle = P.copperDark
    ctx.lineWidth = 1.2
    for (let i = 0; i < 5; i++) {
      const sx = cutX + 8 + i * 10
      ctx.beginPath()
      ctx.ellipse(sx, cy, 3.2, 7.5, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.strokeStyle = P.ink
    ctx.lineWidth = 1
    ctx.strokeRect(cutX, tubeY + 2, cutW, tubeH - 4)
  })

  // --- 端面金属帽 ---
  for (const dir of [-1, 1]) {
    const mx = dir < 0 ? tubeX - 22 : tubeX + tubeW
    ctx.fillStyle = P.metal
    ctx.beginPath()
    ctx.rect(mx, tubeY - 4, 22, tubeH + 8)
    ctx.fill()
    ctx.strokeStyle = P.ink
    ctx.lineWidth = 1.15
    ctx.stroke()
    hatchRect(ctx, mx, tubeY - 4, 22, tubeH + 8, { gap: 5, color: 'rgba(80, 90, 100, 0.25)' })
  }

  // --- 两端引出线 ---
  ctx.strokeStyle = P.metalDark
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(tubeX - 22, cy)
  ctx.lineTo(tubeX - 92, cy)
  ctx.moveTo(tubeX + tubeW + 22, cy)
  ctx.lineTo(tubeX + tubeW + 92, cy)
  ctx.stroke()
  ctx.lineCap = 'butt'

  // --- 色环 / 标称标识 ---
  const bands = ['#3a4048', '#c0392b', '#c8814a', '#c4a35a']
  const bandX = tubeX + tubeW - 36
  bands.forEach((c, i) => {
    ctx.fillStyle = c
    ctx.fillRect(bandX + i * 8, tubeY + 3, 5, tubeH - 6)
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'
    ctx.lineWidth = 0.6
    ctx.strokeRect(bandX + i * 8, tubeY + 3, 5, tubeH - 6)
  })

  // 中心线
  centerLine(ctx, tubeX - 96, cy, tubeX + tubeW + 96, cy)
  centerLine(ctx, cx, tubeY - 16, cx, tubeY + tubeH + 16)

  // --- 图注 ---
  parts.push({
    name: '陶瓷管',
    desc: '耐热绝缘骨架，支撑绕线并散热',
    color: P.ceramic,
    at: [cutX + 20, tubeY + tubeH - 6],
    to: [cutX + 8, cy + 96],
    align: 'center',
  })
  parts.push({
    name: '电阻丝密绕线圈',
    desc: '高电阻率合金丝一圈一圈密绕，决定阻值大小',
    color: P.copper,
    at: [coilX + 110, tubeY + 8],
    to: [cx + 10, cy - 92],
    align: 'center',
  })
  parts.push({
    name: '绝缘漆层',
    desc: '涂在绕线外面的绝缘漆，防止匝间短路',
    color: P.enamel,
    at: [coilX + 30, tubeY + tubeH - 6],
    to: [tubeX - 24, cy + 88],
    align: 'right',
  })
  parts.push({
    name: '引出线',
    desc: '把电阻丝两端引出，接到电路中',
    color: P.metalDark,
    at: [tubeX - 70, cy],
    to: [tubeX - 70, cy - 78],
    align: 'center',
  })
  parts.push({
    name: '端面金属帽',
    desc: '压紧电阻丝端头并与引出线可靠相连',
    color: P.metal,
    at: [tubeX + tubeW + 11, cy - 16],
    to: [tubeX + tubeW + 78, cy - 78],
    align: 'left',
  })
  parts.push({
    name: '色环标识',
    desc: '用色环表示标称阻值与误差',
    color: '#c0392b',
    at: [bandX + 12, tubeY + 4],
    to: [tubeX + tubeW + 86, cy + 42],
    align: 'left',
  })

  return parts
}

/**
 * 滑动变阻器剖视
 * 瓷筒 · 密绕电阻丝 · 金属滑杆 · 滑片（接触弹片）· 接触点 ·
 * 接线柱（一上一下）· 两端陶瓷挡板
 */
function drawRheostat(ctx) {
  const parts = []
  const cx = 260
  const cy = 230

  softShadow(ctx, cx, cy + 88, 170, 15)

  // --- 两端陶瓷挡板 ---
  for (const bx of [112, 388]) {
    ctx.fillStyle = P.ceramic
    rrPath(ctx, bx - 14, cy - 52, 28, 104, 4)
    fillStroke(ctx, P.ceramic, P.ink, 1.15)
    hatchRect(ctx, bx - 14, cy - 52, 8, 104, { gap: 4.5, color: 'rgba(120, 110, 85, 0.5)' })
    hatchRect(ctx, bx + 6, cy - 52, 8, 104, { gap: 4.5, color: 'rgba(120, 110, 85, 0.5)' })
  }

  // --- 瓷筒 ---
  const tubeX = 126
  const tubeW = 268
  const tubeY = cy - 22
  const tubeH = 44
  ctx.fillStyle = P.ceramic
  rrPath(ctx, tubeX, tubeY, tubeW, tubeH, 6)
  fillStroke(ctx, P.ceramic, P.ink, 1.15)

  // --- 密绕电阻丝 ---
  drawDenseCoil(ctx, tubeX + 8, tubeY + 5, tubeW - 16, tubeH - 10, 26, P.copper, 0.95)

  // 局部剖：露出瓷筒壁厚
  const cutX = 168
  const cutW = 48
  withSave(ctx, () => {
    ctx.beginPath()
    ctx.rect(cutX, tubeY + 2, cutW, tubeH - 4)
    ctx.fillStyle = 'rgba(236, 232, 220, 0.95)'
    ctx.fill()
    hatchRect(ctx, cutX, tubeY + 2, cutW, 7, { gap: 3.5, color: 'rgba(120, 110, 85, 0.55)' })
    hatchRect(ctx, cutX, tubeY + tubeH - 9, cutW, 7, { gap: 3.5, color: 'rgba(120, 110, 85, 0.55)' })
    ctx.strokeStyle = P.ink
    ctx.lineWidth = 1
    ctx.strokeRect(cutX, tubeY + 2, cutW, tubeH - 4)
  })

  // --- 金属滑杆 ---
  const rodY = cy - 62
  ctx.fillStyle = P.metal
  rrPath(ctx, 118, rodY - 5, 284, 10, 5)
  fillStroke(ctx, P.metal, P.ink, 1.1)
  // 杆中心线
  centerLine(ctx, 110, rodY, 410, rodY)

  // --- 滑片（接触弹片）+ 接触点 ---
  const sliderX = 268
  // 滑片座
  ctx.fillStyle = P.metalDark
  rrPath(ctx, sliderX - 16, rodY - 8, 32, 18, 3)
  fillStroke(ctx, P.metalDark, P.ink, 1.1)
  // 弹片向下压在电阻丝上
  ctx.fillStyle = P.spring
  ctx.beginPath()
  ctx.moveTo(sliderX - 12, rodY + 8)
  ctx.quadraticCurveTo(sliderX - 8, cy - 8, sliderX - 3, tubeY + 2)
  ctx.lineTo(sliderX + 3, tubeY + 2)
  ctx.quadraticCurveTo(sliderX + 8, cy - 8, sliderX + 12, rodY + 8)
  ctx.closePath()
  fillStroke(ctx, P.spring, P.ink, 1.05)
  // 接触点（小触头）
  ctx.fillStyle = P.copper
  ctx.beginPath()
  ctx.ellipse(sliderX, tubeY + 4, 5, 3.2, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = P.copperDark
  ctx.lineWidth = 1
  ctx.stroke()

  // --- 四个接线柱（一上一下）---
  // 滑杆两端（上）
  for (const [tx, color] of [
    [118, P.blackTerm],
    [402, P.red],
  ]) {
    ctx.fillStyle = P.metal
    rrPath(ctx, tx - 12, rodY - 14, 24, 28, 3)
    fillStroke(ctx, P.metal, P.ink, 1.05)
    drawTerminal(ctx, tx, rodY, 7, color)
  }
  // 瓷筒两端（下）
  for (const [tx, color] of [
    [126, P.blackTerm],
    [394, P.red],
  ]) {
    ctx.fillStyle = P.metal
    rrPath(ctx, tx - 12, cy + 34, 24, 30, 3)
    fillStroke(ctx, P.metal, P.ink, 1.05)
    drawTerminal(ctx, tx, cy + 62, 7, color)
  }

  // 瓷筒中心线
  centerLine(ctx, 100, cy, 420, cy)

  // --- 图注 ---
  parts.push({
    name: '瓷筒',
    desc: '绝缘耐热的陶瓷筒，作为电阻丝骨架',
    color: P.ceramic,
    at: [cutX + 20, tubeY + tubeH - 5],
    to: [cutX + 4, cy + 118],
    align: 'center',
  })
  parts.push({
    name: '密绕电阻丝',
    desc: '在瓷筒上一圈圈密绕的电阻丝，改变接入长度即改变阻值',
    color: P.copper,
    at: [300, tubeY + 8],
    to: [cx + 40, cy - 118],
    align: 'center',
  })
  parts.push({
    name: '金属滑杆',
    desc: '上方金属杆，滑片可在杆上滑动并导出电流',
    color: P.metal,
    at: [340, rodY],
    to: [410, rodY - 42],
    align: 'left',
  })
  parts.push({
    name: '滑片',
    desc: '带弹片的滑片压在电阻丝上，改变接入电路的匝数',
    color: P.spring,
    at: [sliderX + 8, cy - 18],
    to: [sliderX + 78, cy - 52],
    align: 'left',
  })
  parts.push({
    name: '接触点',
    desc: '滑片与电阻丝可靠接触的位置，电流由此流入/流出',
    color: P.copper,
    at: [sliderX, tubeY + 4],
    to: [sliderX + 72, tubeY + 38],
    align: 'left',
  })
  parts.push({
    name: '接线柱',
    desc: '共四个，接线时要「一上一下」串联接入电路',
    color: P.red,
    at: [402, rodY],
    to: [430, rodY + 28],
    align: 'left',
  })
  parts.push({
    name: '陶瓷挡板',
    desc: '两端挡板固定瓷筒并绝缘隔离',
    color: P.ceramicDark,
    at: [112, cy - 40],
    to: [72, cy - 40],
    align: 'right',
  })

  return parts
}

/**
 * 磁电式表头公共内芯（动圈 + 磁铁 + 铁芯 + 游丝 + 指针 + 刻度盘）
 * 电流表 / 电压表共用，返回部件标注（不含表头之外的分流/分压电阻）
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} opt
 * @param {number} opt.ox      表头局部坐标原点 X
 * @param {number} opt.oy
 * @param {number} opt.scale   相对默认尺寸的缩放
 */
function drawMeterMovement(ctx, ox, oy) {
  const marks = []
  const cx = ox + 150
  const cy = oy + 168

  // --- 永久磁铁（马蹄形侧视：左右两极 + 上轭） ---
  // 上轭
  ctx.fillStyle = P.magnet
  rrPath(ctx, cx - 78, cy - 88, 156, 26, 4)
  fillStroke(ctx, P.magnet, P.ink, 1.15)
  hatchRect(ctx, cx - 78, cy - 88, 156, 26, { gap: 5, color: 'rgba(30, 40, 50, 0.28)' })
  // 左极掌
  ctx.fillStyle = P.magnet
  rrPath(ctx, cx - 78, cy - 62, 30, 100, 3)
  fillStroke(ctx, P.magnet, P.ink, 1.15)
  hatchRect(ctx, cx - 78, cy - 62, 10, 100, { gap: 5, color: 'rgba(30, 40, 50, 0.28)' })
  // 右极掌
  ctx.fillStyle = P.magnet
  rrPath(ctx, cx + 48, cy - 62, 30, 100, 3)
  fillStroke(ctx, P.magnet, P.ink, 1.15)
  hatchRect(ctx, cx + 68, cy - 62, 10, 100, { gap: 5, color: 'rgba(30, 40, 50, 0.28)' })

  drawPoleMark(ctx, cx - 63, cy - 36, 'N')
  drawPoleMark(ctx, cx + 63, cy - 36, 'S')

  // --- 软铁芯（圆柱） ---
  ctx.fillStyle = P.metal
  ctx.beginPath()
  ctx.arc(cx, cy, 34, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = P.ink
  ctx.lineWidth = 1.15
  ctx.stroke()
  // 铁芯中心线
  centerLine(ctx, cx - 48, cy, cx + 48, cy)
  centerLine(ctx, cx, cy - 48, cx, cy + 48)

  // --- 动圈（线圈绕组，绕在铁芯外的框架上） ---
  const coilW = 78
  const coilH = 96
  const coilX = cx - coilW / 2
  const coilY = cy - coilH / 2
  // 线圈骨架
  ctx.fillStyle = 'rgba(180, 190, 200, 0.25)'
  ctx.fillRect(coilX, coilY, coilW, coilH)
  // 左右边的绕组（一圈圈）
  drawCoilWindings(ctx, coilX, coilY, 16, coilH, 10, P.copper, 0.85)
  drawCoilWindings(ctx, coilX + coilW - 16, coilY, 16, coilH, 10, P.copper, 0.85)
  // 上下边绕组
  drawCoilWindings(ctx, coilX, coilY, coilW, 12, 2, P.copper, 0.85)
  drawCoilWindings(ctx, coilX, coilY + coilH - 12, coilW, 12, 2, P.copper, 0.85)

  marks.push({
    name: '永久磁铁',
    desc: '提供均匀磁场，N/S 极掌夹住动圈',
    color: P.magnet,
    at: [cx - 63, cy - 70],
    to: [cx - 128, cy - 96],
    align: 'right',
  })
  marks.push({
    name: '软铁芯',
    desc: '圆柱形软铁芯与极掌构成均匀辐射磁场',
    color: P.metal,
    at: [cx, cy + 10],
    to: [cx + 8, cy + 78],
    align: 'left',
  })
  marks.push({
    name: '动圈',
    desc: '漆包线绕成的可动线圈，通电后在磁场中受力偏转',
    color: P.copper,
    at: [coilX + coilW - 8, coilY + 20],
    to: [cx + 118, cy - 62],
    align: 'left',
  })

  // --- 游丝（螺旋弹簧）+ 指针轴 ---
  const shaftTop = cy - 118
  // 轴
  ctx.strokeStyle = P.metalDark
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx, shaftTop)
  ctx.lineTo(cx, oy + 48)
  ctx.stroke()
  // 游丝（上）
  drawSpiralSpring(ctx, cx, cy - 26, 6, 18, 3.2, P.spring, 1.15)
  // 游丝（下，配对游丝，教具常有两根）
  drawSpiralSpring(ctx, cx, cy + 30, 6, 16, 2.8, P.spring, 1.15)

  marks.push({
    name: '游丝',
    desc: '螺旋弹簧提供反作用力矩，并把电流通入动圈',
    color: P.spring,
    at: [cx + 16, cy - 22],
    to: [cx + 96, cy - 28],
    align: 'left',
  })

  // --- 平衡锤 ---
  ctx.fillStyle = P.metalDark
  ctx.beginPath()
  ctx.ellipse(cx - 26, cy + 52, 8, 5, -0.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = P.ink
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.strokeStyle = P.metalDark
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(cx, cy + 40)
  ctx.lineTo(cx - 24, cy + 50)
  ctx.stroke()

  marks.push({
    name: '平衡锤',
    desc: '配重使可动部分重心落在转轴上，减小倾斜误差',
    color: P.metalDark,
    at: [cx - 26, cy + 52],
    to: [cx - 108, cy + 72],
    align: 'right',
  })

  // --- 指针 ---
  const pivotY = oy + 128
  // 指针轴套
  ctx.fillStyle = P.metal
  ctx.beginPath()
  ctx.arc(cx, pivotY, 5, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = P.ink
  ctx.lineWidth = 1
  ctx.stroke()
  // 指针（略偏右，教学示意）
  ctx.strokeStyle = P.red
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(cx, pivotY)
  ctx.lineTo(cx + 52, oy + 58)
  ctx.stroke()
  // 针尖
  ctx.fillStyle = P.red
  ctx.beginPath()
  ctx.moveTo(cx + 52, oy + 58)
  ctx.lineTo(cx + 46, oy + 66)
  ctx.lineTo(cx + 56, oy + 62)
  ctx.closePath()
  ctx.fill()

  marks.push({
    name: '指针',
    desc: '随动圈偏转指示读数',
    color: P.red,
    at: [cx + 40, oy + 78],
    to: [cx + 108, oy + 70],
    align: 'left',
  })
  marks.push({
    name: '指针轴',
    desc: '带动指针偏转的转轴，与动圈固定在同一轴系上',
    color: P.metalDark,
    at: [cx, cy - 90],
    to: [cx - 118, oy + 96],
    align: 'right',
  })

  // --- 刻度盘 ---
  const dialY = oy + 36
  const dialW = 220
  const dialH = 42
  const dialX = cx - dialW / 2
  ctx.fillStyle = '#f3f0e6'
  rrPath(ctx, dialX, dialY, dialW, dialH, 6)
  fillStroke(ctx, '#f3f0e6', P.ink, 1.15)
  // 刻度弧
  ctx.strokeStyle = P.ink
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(cx, pivotY + 10, 92, Math.PI * 1.18, Math.PI * 1.82)
  ctx.stroke()
  // 刻度线
  for (let i = 0; i <= 10; i++) {
    const ang = Math.PI * 1.18 + (Math.PI * 0.64 * i) / 10
    const r1 = i % 5 === 0 ? 82 : 87
    const x1 = cx + Math.cos(ang) * r1
    const y1 = pivotY + 10 + Math.sin(ang) * r1
    const x2 = cx + Math.cos(ang) * 92
    const y2 = pivotY + 10 + Math.sin(ang) * 92
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }

  marks.push({
    name: '刻度盘',
    desc: '标出被测电流/电压的示数刻度',
    color: '#f3f0e6',
    at: [dialX + 30, dialY + 22],
    to: [dialX - 28, dialY + 22],
    align: 'right',
  })

  // --- 调零螺钉 ---
  const adjX = cx - 96
  const adjY = cy + 78
  ctx.fillStyle = P.metal
  rrPath(ctx, adjX - 10, adjY - 6, 20, 14, 3)
  fillStroke(ctx, P.metal, P.ink, 1.05)
  ctx.strokeStyle = P.metalDark
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(adjX - 6, adjY + 1)
  ctx.lineTo(adjX + 6, adjY + 1)
  ctx.moveTo(adjX, adjY - 5)
  ctx.lineTo(adjX, adjY + 7)
  ctx.stroke()

  marks.push({
    name: '调零螺钉',
    desc: '机械调零，使无电流时指针指在零刻度',
    color: P.metal,
    at: [adjX, adjY + 8],
    to: [adjX - 18, adjY + 52],
    align: 'right',
  })

  return { marks, cx, cy, coilX, coilY, coilW, coilH }
}

/**
 * 电流表剖视
 * 动圈 · 永久磁铁 · 软铁芯 · 游丝 · 指针 · 平衡锤 · 刻度盘 ·
 * 调零螺钉 · 红黑接线柱 · 分流器（并联分流）
 */
function drawAmmeter(ctx) {
  const parts = []
  const cx = 250

  softShadow(ctx, cx, 372, 168, 14)

  // --- 外壳（局部剖：右下角切开） ---
  const caseX = 78
  const caseY = 52
  const caseW = 344
  const caseH = 290
  ctx.fillStyle = P.plastic
  rrPath(ctx, caseX, caseY, caseW, caseH, 14)
  fillStroke(ctx, P.plastic, P.ink, 1.3)
  // 壳壁剖面（局部切开右下）
  const cutX = caseX + caseW - 70
  const cutY = caseY + caseH - 86
  withSave(ctx, () => {
    rrPath(ctx, cutX, cutY, 58, 74, 8)
    ctx.fillStyle = 'rgba(232, 236, 240, 0.95)'
    ctx.fill()
    ctx.strokeStyle = P.ink
    ctx.lineWidth = 1
    ctx.stroke()
    // 壁厚剖面线
    hatchRect(ctx, cutX, cutY, 58, 10, { gap: 4, color: 'rgba(80, 90, 100, 0.4)' })
    hatchRect(ctx, cutX, cutY + 64, 58, 10, { gap: 4, color: 'rgba(80, 90, 100, 0.4)' })
    hatchRect(ctx, cutX + 48, cutY, 10, 74, { gap: 4, color: 'rgba(80, 90, 100, 0.4)' })
  })

  // --- 表头内部结构 ---
  const mov = drawMeterMovement(ctx, caseX + 30, caseY + 20)

  // --- 分流器 / 分流电阻（并联在动圈两端） ---
  const shuntX = caseX + 36
  const shuntY = caseY + 228
  const shuntW = 96
  const shuntH = 28
  ctx.fillStyle = P.insulator
  rrPath(ctx, shuntX, shuntY, shuntW, shuntH, 4)
  fillStroke(ctx, P.insulator, P.ink, 1.15)
  // 分流电阻丝（密绕）
  drawDenseCoil(ctx, shuntX + 8, shuntY + 6, shuntW - 16, shuntH - 12, 12, P.copper, 0.85)
  // 并联接线：从分流器两端画到动圈两端（示意并联）
  ctx.strokeStyle = P.copper
  ctx.lineWidth = 1.6
  ctx.setLineDash([5, 3])
  ctx.beginPath()
  ctx.moveTo(shuntX + 4, shuntY)
  ctx.lineTo(shuntX + 4, mov.coilY + mov.coilH + 8)
  ctx.lineTo(mov.coilX + 8, mov.coilY + mov.coilH + 8)
  ctx.moveTo(shuntX + shuntW - 4, shuntY)
  ctx.lineTo(shuntX + shuntW - 4, mov.coilY + mov.coilH + 8)
  ctx.lineTo(mov.coilX + mov.coilW - 8, mov.coilY + mov.coilH + 8)
  ctx.stroke()
  ctx.setLineDash([])
  // 「并」字
  ctx.fillStyle = P.copperDark
  ctx.font = '11px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('并联', shuntX + shuntW + 8, shuntY + shuntH / 2)

  // --- 接线柱（红 / 黑）---
  const termY = caseY + caseH - 28
  drawTerminal(ctx, caseX + 78, termY, 10, P.red)
  drawTerminal(ctx, caseX + 150, termY, 10, P.blackTerm)
  // 柱脚
  ctx.fillStyle = P.metal
  ctx.fillRect(caseX + 70, termY - 22, 16, 22)
  ctx.fillRect(caseX + 142, termY - 22, 16, 22)
  ctx.strokeStyle = P.ink
  ctx.lineWidth = 1
  ctx.strokeRect(caseX + 70, termY - 22, 16, 22)
  ctx.strokeRect(caseX + 142, termY - 22, 16, 22)

  // --- 图注 ---
  for (const m of mov.marks) parts.push(m)
  parts.push({
    name: '分流器',
    desc: '电流表关键件：低阻值分流电阻与动圈并联，分流大部分电流',
    color: P.insulator,
    at: [shuntX + shuntW / 2, shuntY + shuntH],
    to: [shuntX + shuntW / 2 - 10, shuntY + shuntH + 48],
    align: 'center',
  })
  parts.push({
    name: '接线柱',
    desc: '红色为正接线柱、黑色为负接线柱，串联接入电路',
    color: P.red,
    at: [caseX + 78, termY + 10],
    to: [caseX + 48, termY + 52],
    align: 'right',
  })

  return parts
}

/**
 * 电压表剖视
 * 磁电式表头（动圈、磁铁、铁芯、游丝、指针、刻度盘）+
 * 串联分压电阻（降压电阻），并标注串/并关系
 */
function drawVoltmeter(ctx) {
  const parts = []
  const cx = 250

  softShadow(ctx, cx, 372, 168, 14)

  const caseX = 78
  const caseY = 52
  const caseW = 344
  const caseH = 290
  ctx.fillStyle = P.plastic
  rrPath(ctx, caseX, caseY, caseW, caseH, 14)
  fillStroke(ctx, P.plastic, P.ink, 1.3)

  // 局部剖（左下）
  const cutX = caseX + 12
  const cutY = caseY + caseH - 86
  withSave(ctx, () => {
    rrPath(ctx, cutX, cutY, 58, 74, 8)
    ctx.fillStyle = 'rgba(232, 236, 240, 0.95)'
    ctx.fill()
    ctx.strokeStyle = P.ink
    ctx.lineWidth = 1
    ctx.stroke()
    hatchRect(ctx, cutX, cutY, 58, 10, { gap: 4, color: 'rgba(80, 90, 100, 0.4)' })
    hatchRect(ctx, cutX, cutY + 64, 58, 10, { gap: 4, color: 'rgba(80, 90, 100, 0.4)' })
    hatchRect(ctx, cutX, cutY, 10, 74, { gap: 4, color: 'rgba(80, 90, 100, 0.4)' })
  })

  // --- 表头 ---
  const mov = drawMeterMovement(ctx, caseX + 60, caseY + 20)

  // --- 分压电阻（串联降压） ---
  const multX = caseX + 210
  const multY = caseY + 220
  const multW = 108
  const multH = 30
  ctx.fillStyle = P.enamel
  rrPath(ctx, multX, multY, multW, multH, 4)
  fillStroke(ctx, P.enamel, P.ink, 1.15)
  drawDenseCoil(ctx, multX + 8, multY + 7, multW - 16, multH - 14, 14, P.copper, 0.9)

  // 串联接线：从动圈一端经分压电阻再回到另一测量端
  ctx.strokeStyle = P.copper
  ctx.lineWidth = 1.7
  ctx.setLineDash([5, 3])
  ctx.beginPath()
  ctx.moveTo(mov.coilX + 8, mov.coilY + mov.coilH + 8)
  ctx.lineTo(mov.coilX + 8, multY + multH / 2)
  ctx.lineTo(multX, multY + multH / 2)
  ctx.moveTo(multX + multW, multY + multH / 2)
  ctx.lineTo(multX + multW + 24, multY + multH / 2)
  ctx.lineTo(multX + multW + 24, mov.coilY + mov.coilH + 8)
  ctx.lineTo(mov.coilX + mov.coilW - 8, mov.coilY + mov.coilH + 8)
  ctx.stroke()
  ctx.setLineDash([])

  ctx.fillStyle = P.copperDark
  ctx.font = '11px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('串联', multX + multW + 30, multY + multH / 2 - 16)

  // --- 接线柱 ---
  const termY = caseY + caseH - 28
  drawTerminal(ctx, caseX + 78, termY, 10, P.red)
  drawTerminal(ctx, caseX + 150, termY, 10, P.blackTerm)
  ctx.fillStyle = P.metal
  ctx.fillRect(caseX + 70, termY - 22, 16, 22)
  ctx.fillRect(caseX + 142, termY - 22, 16, 22)
  ctx.strokeStyle = P.ink
  ctx.lineWidth = 1
  ctx.strokeRect(caseX + 70, termY - 22, 16, 22)
  ctx.strokeRect(caseX + 142, termY - 22, 16, 22)

  for (const m of mov.marks) parts.push(m)
  parts.push({
    name: '分压电阻',
    desc: '电压表关键件：高阻值电阻与表头串联，分走大部分电压',
    color: P.enamel,
    at: [multX + multW / 2, multY + multH],
    to: [multX + multW / 2, multY + multH + 48],
    align: 'center',
  })
  parts.push({
    name: '接线柱',
    desc: '红正黑负，并联在被测电路两端',
    color: P.red,
    at: [caseX + 78, termY + 10],
    to: [caseX + 48, termY + 52],
    align: 'right',
  })

  return parts
}

/**
 * 干电池剖视
 * 锌筒（负极）· 碳棒（正极）· 二氧化锰电解质糊 · 铜帽 ·
 * 绝缘垫圈 · 封口沥青/塑料盖 · 外包装
 */
function drawBattery(ctx) {
  const parts = []
  const cx = 260
  const cy = 210

  softShadow(ctx, cx, 372, 72, 12)

  // 外形尺寸
  const bodyW = 110
  const bodyH = 240
  const bodyX = cx - bodyW / 2
  const bodyY = cy - bodyH / 2 + 20

  // --- 外包装（局部剖：右侧切开） ---
  // 左半外包装纸
  ctx.fillStyle = '#c8b48a'
  ctx.beginPath()
  ctx.rect(bodyX, bodyY, bodyW * 0.42, bodyH)
  ctx.fill()
  ctx.strokeStyle = P.ink
  ctx.lineWidth = 1.2
  ctx.stroke()
  // 右半切开，露出内部
  ctx.fillStyle = 'rgba(232, 236, 240, 0.35)'
  ctx.fillRect(bodyX + bodyW * 0.42, bodyY, bodyW * 0.58, bodyH)

  // --- 锌筒（负极）---
  const zincX = bodyX + 10
  const zincY = bodyY + 28
  const zincW = bodyW - 20
  const zincH = bodyH - 48
  ctx.fillStyle = P.zinc
  // 左壁
  ctx.fillRect(zincX, zincY, 14, zincH)
  // 右壁（剖面）
  ctx.fillRect(zincX + zincW - 14, zincY, 14, zincH)
  // 底
  ctx.fillRect(zincX, zincY + zincH - 14, zincW, 14)
  ctx.strokeStyle = P.ink
  ctx.lineWidth = 1.1
  ctx.strokeRect(zincX, zincY, 14, zincH)
  ctx.strokeRect(zincX + zincW - 14, zincY, 14, zincH)
  ctx.strokeRect(zincX, zincY + zincH - 14, zincW, 14)
  // 锌筒剖面线
  hatchRect(ctx, zincX, zincY, 14, zincH, { gap: 4, color: 'rgba(60, 70, 80, 0.4)' })
  hatchRect(ctx, zincX + zincW - 14, zincY, 14, zincH, { gap: 4, color: 'rgba(60, 70, 80, 0.4)' })
  hatchRect(ctx, zincX, zincY + zincH - 14, zincW, 14, { gap: 4, color: 'rgba(60, 70, 80, 0.4)' })

  // --- 二氧化锰电解质糊 ---
  ctx.fillStyle = P.mno2
  ctx.fillRect(zincX + 14, zincY + 10, zincW - 28, zincH - 24)
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth = 0.8
  ctx.strokeRect(zincX + 14, zincY + 10, zincW - 28, zincH - 24)
  // 颗粒感
  withSave(ctx, () => {
    ctx.beginPath()
    ctx.rect(zincX + 14, zincY + 10, zincW - 28, zincH - 24)
    ctx.clip()
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    for (let i = 0; i < 40; i++) {
      const px = zincX + 18 + ((i * 37) % (zincW - 36))
      const py = zincY + 14 + ((i * 53) % (zincH - 32))
      ctx.fillRect(px, py, 3, 3)
    }
  })

  // --- 碳棒（正极）---
  const rodW = 18
  const rodX = cx - rodW / 2
  const rodY = bodyY - 8
  const rodH = zincH - 30
  ctx.fillStyle = P.carbon
  ctx.fillRect(rodX, rodY, rodW, rodH)
  ctx.strokeStyle = P.ink
  ctx.lineWidth = 1.15
  ctx.strokeRect(rodX, rodY, rodW, rodH)
  hatchRect(ctx, rodX, rodY, rodW, rodH, { gap: 5, color: 'rgba(200, 205, 210, 0.18)' })

  // --- 铜帽 ---
  ctx.fillStyle = P.copper
  rrPath(ctx, rodX - 10, rodY - 18, rodW + 20, 22, 3)
  fillStroke(ctx, P.copper, P.ink, 1.15)
  hatchRect(ctx, rodX - 10, rodY - 18, rodW + 20, 8, { gap: 3.5, color: 'rgba(80, 50, 20, 0.35)' })

  // --- 绝缘垫圈 ---
  ctx.fillStyle = P.insulator
  rrPath(ctx, bodyX + 14, bodyY + 2, bodyW - 28, 14, 3)
  fillStroke(ctx, P.insulator, P.ink, 1.1)
  hatchRect(ctx, bodyX + 14, bodyY + 2, bodyW - 28, 14, { gap: 4, color: 'rgba(200, 205, 210, 0.22)' })

  // --- 封口沥青 / 塑料盖 ---
  ctx.fillStyle = '#4a3f38'
  rrPath(ctx, bodyX + 6, bodyY - 6, bodyW - 12, 16, 3)
  fillStroke(ctx, '#4a3f38', P.ink, 1.1)
  hatchRect(ctx, bodyX + 6, bodyY - 6, bodyW - 12, 16, { gap: 4, color: 'rgba(220, 180, 120, 0.2)' })

  // 中心线
  centerLine(ctx, cx, bodyY - 30, cx, bodyY + bodyH + 10)

  // --- 图注 ---
  parts.push({
    name: '锌筒',
    desc: '负极，锌被氧化放出电子，是电池的阳极材料',
    color: P.zinc,
    at: [zincX + 7, cy + 40],
    to: [zincX - 48, cy + 40],
    align: 'right',
  })
  parts.push({
    name: '碳棒',
    desc: '正极，导电并作为正极引出端',
    color: P.carbon,
    at: [rodX + rodW / 2, rodY + rodH / 2],
    to: [rodX + 78, rodY + 40],
    align: 'left',
  })
  parts.push({
    name: '二氧化锰电解质糊',
    desc: '去极化剂与电解质糊，维持持续放电',
    color: P.mno2,
    at: [zincX + zincW - 24, cy + 10],
    to: [zincX + zincW + 62, cy + 10],
    align: 'left',
  })
  parts.push({
    name: '铜帽',
    desc: '压在碳棒顶端，作为正极接触头',
    color: P.copper,
    at: [rodX + rodW / 2, rodY - 10],
    to: [rodX + 82, rodY - 18],
    align: 'left',
  })
  parts.push({
    name: '绝缘垫圈',
    desc: '隔离正极铜帽与负极锌筒，防止短路',
    color: P.insulator,
    at: [bodyX + 24, bodyY + 9],
    to: [bodyX - 42, bodyY + 9],
    align: 'right',
  })
  parts.push({
    name: '封口盖',
    desc: '沥青或塑料封口，防止电解液泄漏与干涸',
    color: '#4a3f38',
    at: [bodyX + bodyW - 20, bodyY + 2],
    to: [bodyX + bodyW + 58, bodyY - 8],
    align: 'left',
  })
  parts.push({
    name: '外包装',
    desc: '商标绝缘纸，标明型号与极性',
    color: '#c8b48a',
    at: [bodyX + 8, bodyY + 70],
    to: [bodyX - 42, bodyY + 70],
    align: 'right',
  })

  return parts
}

/**
 * 单刀开关剖视
 * 闸刀（铜片）· 触点 · 弹簧 · 绝缘底座 · 绝缘手柄 · 两个接线柱
 */
function drawSwitch(ctx) {
  const parts = []
  const cx = 260
  const cy = 230

  softShadow(ctx, cx, cy + 92, 150, 14)

  // --- 绝缘底座 ---
  const baseX = 120
  const baseY = cy + 10
  const baseW = 280
  const baseH = 56
  ctx.fillStyle = P.plastic
  rrPath(ctx, baseX, baseY, baseW, baseH, 6)
  fillStroke(ctx, P.plastic, P.ink, 1.2)
  // 壁厚剖面（底部剖开一条）
  hatchRect(ctx, baseX + 2, baseY + baseH - 10, baseW - 4, 8, { gap: 4, color: 'rgba(80, 90, 100, 0.4)' })

  // --- 两个接线柱 ---
  drawTerminal(ctx, baseX + 36, baseY + 28, 11, P.blackTerm)
  drawTerminal(ctx, baseX + baseW - 36, baseY + 28, 11, P.red)
  // 柱脚与内部连线
  ctx.fillStyle = P.metal
  ctx.fillRect(baseX + 28, baseY + 28, 16, 28)
  ctx.fillRect(baseX + baseW - 44, baseY + 28, 16, 28)
  ctx.strokeStyle = P.ink
  ctx.lineWidth = 1
  ctx.strokeRect(baseX + 28, baseY + 28, 16, 28)
  ctx.strokeRect(baseX + baseW - 44, baseY + 28, 16, 28)

  // --- 触点（接触片）---
  // 固定触点（右）
  const contactX = baseX + baseW - 52
  const contactY = baseY + 8
  ctx.fillStyle = P.copper
  rrPath(ctx, contactX - 8, contactY - 6, 18, 16, 2)
  fillStroke(ctx, P.copper, P.ink, 1.1)
  // 活动触点（闸刀端部）
  const pivotX = baseX + 52
  const pivotY = baseY + 18

  // --- 闸刀（铜片），闭合位 -->
  const bladeAngle = -0.28
  withSave(ctx, () => {
    ctx.translate(pivotX, pivotY)
    ctx.rotate(bladeAngle)
    // 铜片
    ctx.fillStyle = P.copper
    rrPath(ctx, -8, -5, 170, 10, 2)
    fillStroke(ctx, P.copper, P.ink, 1.15)
    // 铜片剖面线（细）
    hatchRect(ctx, -8, -5, 170, 10, { gap: 5, color: 'rgba(80, 50, 20, 0.22)' })
    // 绝缘手柄
    ctx.fillStyle = P.plasticDark
    rrPath(ctx, 150, -12, 52, 24, 5)
    fillStroke(ctx, P.plasticDark, P.ink, 1.15)
    hatchRect(ctx, 150, -12, 8, 24, { gap: 4, color: 'rgba(80, 90, 100, 0.35)' })
    hatchRect(ctx, 194, -12, 8, 24, { gap: 4, color: 'rgba(80, 90, 100, 0.35)' })
    // 手柄端
    ctx.fillStyle = P.insulator
    rrPath(ctx, 196, -10, 14, 20, 3)
    fillStroke(ctx, P.insulator, P.ink, 1.05)
  })

  // --- 弹簧（压在闸刀下）---
  drawCoilSpring(ctx, pivotX - 14, pivotY + 12, 28, 36, 5, P.spring, 1.15)
  // 弹簧导杆
  ctx.strokeStyle = P.metalDark
  ctx.lineWidth = 1.3
  ctx.beginPath()
  ctx.moveTo(pivotX, pivotY + 8)
  ctx.lineTo(pivotX, pivotY + 52)
  ctx.stroke()

  // 转轴
  ctx.fillStyle = P.metalDark
  ctx.beginPath()
  ctx.arc(pivotX, pivotY, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = P.ink
  ctx.lineWidth = 1
  ctx.stroke()
  centerLine(ctx, pivotX - 20, pivotY, pivotX + 20, pivotY)

  // --- 图注 ---
  parts.push({
    name: '闸刀',
    desc: '铜质闸刀片，闭合时接通电路',
    color: P.copper,
    at: [pivotX + 80, pivotY - 14],
    to: [pivotX + 80, pivotY - 72],
    align: 'center',
  })
  parts.push({
    name: '触点',
    desc: '闸刀与静触片的接触面，要求接触电阻小',
    color: P.copperDark,
    at: [contactX, contactY],
    to: [contactX + 48, contactY - 48],
    align: 'left',
  })
  parts.push({
    name: '弹簧',
    desc: '压紧闸刀，保证触点接触可靠并加速分断',
    color: P.spring,
    at: [pivotX + 16, pivotY + 30],
    to: [pivotX + 68, pivotY + 58],
    align: 'left',
  })
  parts.push({
    name: '绝缘底座',
    desc: '绝缘支撑整个开关，防止漏电与短路',
    color: P.plastic,
    at: [cx, baseY + baseH],
    to: [cx, baseY + baseH + 52],
    align: 'center',
  })
  parts.push({
    name: '绝缘手柄',
    desc: '手持部分绝缘，保证操作安全',
    color: P.plasticDark,
    at: [pivotX + 170, pivotY - 22],
    to: [pivotX + 170, pivotY - 78],
    align: 'center',
  })
  parts.push({
    name: '接线柱',
    desc: '两个接线柱串联接入电路',
    color: P.blackTerm,
    at: [baseX + 36, baseY + 40],
    to: [baseX + 8, baseY + 88],
    align: 'right',
  })

  return parts
}

/**
 * 万用表剖视
 * 表头 · 转换开关 · 分流/分压电阻网络 · 表笔插孔 · 电池 · 调零旋钮
 */
function drawMultimeter(ctx) {
  const parts = []
  const cx = 260

  softShadow(ctx, cx, 382, 176, 14)

  const caseX = 64
  const caseY = 40
  const caseW = 392
  const caseH = 330

  // --- 外壳（右下角局部剖） ---
  ctx.fillStyle = P.plastic
  rrPath(ctx, caseX, caseY, caseW, caseH, 16)
  fillStroke(ctx, P.plastic, P.ink, 1.3)

  const cutX = caseX + caseW - 86
  const cutY = caseY + caseH - 100
  withSave(ctx, () => {
    rrPath(ctx, cutX, cutY, 72, 86, 8)
    ctx.fillStyle = 'rgba(232, 236, 240, 0.95)'
    ctx.fill()
    ctx.strokeStyle = P.ink
    ctx.lineWidth = 1
    ctx.stroke()
    hatchRect(ctx, cutX, cutY, 72, 10, { gap: 4, color: 'rgba(80, 90, 100, 0.4)' })
    hatchRect(ctx, cutX, cutY + 76, 72, 10, { gap: 4, color: 'rgba(80, 90, 100, 0.4)' })
    hatchRect(ctx, cutX + 62, cutY, 10, 86, { gap: 4, color: 'rgba(80, 90, 100, 0.4)' })
  })

  // --- 表头（上半） ---
  const headX = caseX + 48
  const headY = caseY + 24
  // 刻度窗
  ctx.fillStyle = '#f3f0e6'
  rrPath(ctx, headX, headY, 200, 78, 8)
  fillStroke(ctx, '#f3f0e6', P.ink, 1.15)
  // 刻度线
  for (let i = 0; i <= 12; i++) {
    const x = headX + 16 + i * 14
    const len = i % 3 === 0 ? 18 : 10
    ctx.strokeStyle = P.ink
    ctx.lineWidth = 0.9
    ctx.beginPath()
    ctx.moveTo(x, headY + 56)
    ctx.lineTo(x, headY + 56 - len)
    ctx.stroke()
  }
  // 指针
  ctx.strokeStyle = P.red
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(headX + 100, headY + 72)
  ctx.lineTo(headX + 148, headY + 18)
  ctx.stroke()
  // 简化表头内部（动圈 + 磁铁）
  ctx.fillStyle = P.magnet
  rrPath(ctx, headX + 28, headY + 62, 48, 18, 2)
  fillStroke(ctx, P.magnet, P.ink, 1)
  ctx.fillStyle = P.metal
  ctx.beginPath()
  ctx.arc(headX + 100, headY + 70, 14, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = P.ink
  ctx.lineWidth = 1
  ctx.stroke()
  drawCoilWindings(ctx, headX + 86, headY + 56, 28, 28, 5, P.copper, 0.8)
  drawSpiralSpring(ctx, headX + 100, headY + 70, 4, 11, 2.4, P.spring, 0.9)

  parts.push({
    name: '表头',
    desc: '磁电式测量机构（动圈+磁铁+游丝），指示被测量',
    color: P.magnet,
    at: [headX + 52, headY + 72],
    to: [headX - 28, headY + 40],
    align: 'right',
  })
  parts.push({
    name: '刻度盘',
    desc: '多条刻度分别对应电流、电压、电阻等量程',
    color: '#f3f0e6',
    at: [headX + 20, headY + 20],
    to: [headX - 28, headY + 8],
    align: 'right',
  })

  // --- 转换开关（旋钮 + 触点盘） ---
  const knobX = caseX + 120
  const knobY = caseY + 168
  // 触点盘
  ctx.fillStyle = P.metal
  ctx.beginPath()
  ctx.arc(knobX, knobY, 46, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = P.ink
  ctx.lineWidth = 1.15
  ctx.stroke()
  // 触点
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 - Math.PI / 2
    const px = knobX + Math.cos(ang) * 32
    const py = knobY + Math.sin(ang) * 32
    ctx.fillStyle = P.copper
    ctx.beginPath()
    ctx.arc(px, py, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = P.copperDark
    ctx.lineWidth = 0.8
    ctx.stroke()
  }
  // 旋钮
  ctx.fillStyle = P.insulator
  rrPath(ctx, knobX - 18, knobY - 18, 36, 36, 8)
  fillStroke(ctx, P.insulator, P.ink, 1.15)
  // 指示标
  ctx.strokeStyle = P.red
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(knobX, knobY)
  ctx.lineTo(knobX, knobY - 16)
  ctx.stroke()

  parts.push({
    name: '转换开关',
    desc: '旋转切换量程，触点盘接通对应电阻支路',
    color: P.insulator,
    at: [knobX, knobY - 18],
    to: [knobX, knobY - 62],
    align: 'center',
  })
  parts.push({
    name: '触点盘',
    desc: '扇形触点随旋钮转动，选通不同档位',
    color: P.copper,
    at: [knobX + 32, knobY],
    to: [knobX + 72, knobY + 28],
    align: 'left',
  })

  // --- 分流 / 分压电阻网络 ---
  const netX = caseX + 220
  const netY = caseY + 150
  const netW = 120
  const netH = 100
  ctx.fillStyle = 'rgba(200, 205, 210, 0.35)'
  rrPath(ctx, netX, netY, netW, netH, 6)
  fillStroke(ctx, 'rgba(200, 205, 210, 0.35)', P.ink, 1.1)
  // 三个电阻
  const resColors = [P.copper, P.enamel, P.insulator]
  for (let i = 0; i < 3; i++) {
    const rx = netX + 14
    const ry = netY + 12 + i * 30
    ctx.fillStyle = resColors[i]
    rrPath(ctx, rx, ry, 70, 18, 3)
    fillStroke(ctx, resColors[i], P.ink, 1)
    drawDenseCoil(ctx, rx + 6, ry + 4, 58, 10, 8, i === 0 ? P.copper : P.tungsten, 0.7)
  }
  // 连到转换开关的走线
  ctx.strokeStyle = P.copper
  ctx.lineWidth = 1.3
  ctx.setLineDash([4, 3])
  ctx.beginPath()
  ctx.moveTo(knobX + 40, knobY + 20)
  ctx.lineTo(netX + 10, netY + 10)
  ctx.moveTo(knobX + 40, knobY + 28)
  ctx.lineTo(netX + 10, netY + 40)
  ctx.moveTo(knobX + 40, knobY + 36)
  ctx.lineTo(netX + 10, netY + 70)
  ctx.stroke()
  ctx.setLineDash([])

  parts.push({
    name: '分流/分压电阻网络',
    desc: '各量程的分流、分压与限流电阻，由转换开关选通',
    color: P.enamel,
    at: [netX + netW, netY + 50],
    to: [netX + netW + 18, netY + 50],
    align: 'left',
  })

  // --- 电池（电阻挡） ---
  const batX = caseX + 40
  const batY = caseY + 250
  ctx.fillStyle = P.zinc
  rrPath(ctx, batX, batY, 56, 28, 3)
  fillStroke(ctx, P.zinc, P.ink, 1.1)
  hatchRect(ctx, batX, batY, 56, 28, { gap: 4.5, color: 'rgba(60, 70, 80, 0.35)' })
  ctx.fillStyle = P.copper
  rrPath(ctx, batX + 56, batY + 6, 12, 16, 2)
  fillStroke(ctx, P.copper, P.ink, 1)

  parts.push({
    name: '电池',
    desc: '供欧姆挡使用，为电阻挡测量提供内置电源',
    color: P.zinc,
    at: [batX + 28, batY + 28],
    to: [batX + 28, batY + 62],
    align: 'center',
  })

  // --- 调零旋钮 ---
  const adjX = caseX + 150
  const adjY = caseY + 268
  ctx.fillStyle = P.plasticDark
  ctx.beginPath()
  ctx.arc(adjX, adjY, 18, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = P.ink
  ctx.lineWidth = 1.1
  ctx.stroke()
  ctx.strokeStyle = P.metalDark
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(adjX, adjY)
  ctx.lineTo(adjX, adjY - 12)
  ctx.stroke()

  parts.push({
    name: '调零旋钮',
    desc: '欧姆调零：两表笔短接后调节指针指到 0 Ω',
    color: P.plasticDark,
    at: [adjX, adjY + 18],
    to: [adjX, adjY + 52],
    align: 'center',
  })

  // --- 表笔插孔（红 / 黑） ---
  const jackY = caseY + caseH - 40
  drawTerminal(ctx, caseX + 80, jackY, 13, P.blackTerm)
  drawTerminal(ctx, caseX + 130, jackY, 13, P.red)
  // 插孔中心孔
  for (const [jx, jc] of [
    [caseX + 80, '#0d0f12'],
    [caseX + 130, '#0d0f12'],
  ]) {
    ctx.fillStyle = jc
    ctx.beginPath()
    ctx.arc(jx, jackY, 5, 0, Math.PI * 2)
    ctx.fill()
  }

  parts.push({
    name: '表笔插孔',
    desc: '红表笔插正极孔、黑表笔插公共端孔',
    color: P.red,
    at: [caseX + 130, jackY + 13],
    to: [caseX + 130, jackY + 52],
    align: 'center',
  })

  return parts
}

// ---------------------------------------------------------------------------
// 注册表
// ---------------------------------------------------------------------------

const RENDERERS = {
  bulb: { title: '小灯泡', draw: drawBulb },
  resistor: { title: '定值电阻', draw: drawResistor },
  rheostat: { title: '滑动变阻器', draw: drawRheostat },
  ammeter: { title: '电流表', draw: drawAmmeter },
  voltmeter: { title: '电压表', draw: drawVoltmeter },
  battery: { title: '干电池', draw: drawBattery },
  switch: { title: '单刀开关', draw: drawSwitch },
  multimeter: { title: '万用表', draw: drawMultimeter },
}

// ---------------------------------------------------------------------------
// 公共 API
// ---------------------------------------------------------------------------

/**
 * 在 w×h 的画布上绘制 type 元件的内部结构剖视图（居中、自适应缩放）
 * @param ctx  CanvasRenderingContext2D（已设置好尺寸，坐标系 0..w, 0..h）
 * @param w,h  画布尺寸（CSS 像素）
 * @param type 元件类型字符串：bulb | resistor | rheostat | ammeter | voltmeter | battery | switch | multimeter
 * @param o    { accent?: string, ink?: string } 可选配色
 * @returns {{ title: string, parts: Array<{ name: string, desc: string, color: string }> }}
 *          title = 元件名；parts = 图注列表（name 部件名、desc 一句话作用、color 该部件在图里的主色）
 */
export function drawInternal(ctx, w, h, type, o = {}) {
  const accent = o.accent || P.copper
  const ink = o.ink || P.ink
  // 保留参数位：目前图注线色固定为 leader 灰，accent/ink 预留给外层主题
  void accent
  void ink

  const def = RENDERERS[type]
  if (!def) {
    return { title: String(type || ''), parts: [] }
  }

  const { s, ox, oy } = fitStage(w, h)

  ctx.save()
  ctx.translate(ox, oy)
  ctx.scale(s, s)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'butt'

  let marks = []
  try {
    marks = def.draw(ctx) || []
  } finally {
    ctx.restore()
  }

  const toScreen = (x, y) => [ox + x * s, oy + y * s]
  drawLabels(ctx, marks, toScreen)

  return {
    title: def.title,
    parts: toApiParts(marks),
  }
}

