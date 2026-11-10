/**
 * theme.js — 写实教具绘制基元（渲染层公共底座）
 *
 * 目标：用纯 Canvas2D 画出「像真仪器」的质感，而不是扁平图标。
 * 关键手法（本文件逐一封装）：
 *   1. 塑料壳 = 纵向三段渐变 + 顶部高光条 + 底部反光 + 深色描边
 *   2. 金属件 = 多段横向渐变（模拟圆柱受光）+ 深色轮郭 + 高光点
 *   3. 投影   = 偏移同形 + 半透明黑，营造"浮在桌面上"的层次
 *   4. 玻璃   = 半透明填充 + 两道镜面高光弧 + 边缘亮线
 *
 * 所有函数只依赖 ctx 与传入坐标，不改动全局状态之外的任何东西
 * （需要 save/restore 的函数内部自己处理）。
 */

/** 全局配色（深色实验桌面 + 教具本体） */
export const T = {
  // 工作台
  benchHi: '#2b3238',
  benchLo: '#12161a',
  benchTint: 'rgba(120, 180, 255, 0.05)',
  // 塑料壳体
  plastic: ['#5b646b', '#3a4249', '#232a30'],
  plasticLight: ['#eef3f6', '#cdd6dc', '#9aa6ae'],
  bakelite: ['#6d4c41', '#4e342e', '#2e1f1b'],
  // 金属（多段渐变模拟圆柱受光：暗→亮→暗）
  brass: ['#4a3210', '#8b6914', '#d4a843', '#f3d79a', '#d4a843', '#8b6914', '#4a3210'],
  steel: ['#2c3338', '#5a666c', '#a8b8c0', '#e2ecf0', '#a8b8c0', '#5a666c', '#2c3338'],
  chrome: ['#4a5258', '#8a969c', '#d0dce2', '#ffffff', '#d0dce2', '#8a969c', '#4a5258'],
  // 导线
  wireShadow: 'rgba(0, 0, 0, 0.38)',
  // 电表
  dial: ['#fffdf4', '#efe9d8'],
  dialInk: '#2a2a26',
  needle: '#c62828',
  // 状态色
  ok: '#3ddc84',
  warn: '#ffb020',
  danger: '#ff4b3e',
  info: '#5aa9ff',
}

/** 圆角矩形路径（不 fill/stroke，交给调用方） */
export function rr(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2))
}

/**
 * 纵向三段渐变 —— 塑料/陶瓷等受光面
 * @param {number[]} colors [top, mid, bottom]
 */
export function vGrad(ctx, x, yTop, yBottom, colors) {
  const g = ctx.createLinearGradient(x, yTop, x, yBottom)
  const n = colors.length - 1
  colors.forEach((c, i) => g.addColorStop(i / n, c))
  return g
}

/**
 * 横向多段渐变 —— 金属圆柱受光（左暗→高光→右暗）
 * @param {string[]} colors 从左到右
 */
export function hGrad(ctx, xLeft, xRight, y, colors) {
  const g = ctx.createLinearGradient(xLeft, y, xRight, y)
  const n = colors.length - 1
  colors.forEach((c, i) => g.addColorStop(i / n, c))
  return g
}

/**
 * 投影：先画一层偏移+模糊的暗形，再画本体
 * @param {() => void} drawBody 画本体的回调
 */
export function withShadow(ctx, drawBody, { dx = 0, dy = 3, blur = 6, color = 'rgba(0,0,0,0.42)' } = {}) {
  ctx.save()
  ctx.shadowColor = color
  ctx.shadowBlur = blur
  ctx.shadowOffsetX = dx
  ctx.shadowOffsetY = dy
  drawBody()
  ctx.restore()
}

/** 顶部高光条（塑料件的镜面反射带） */
export function glossBand(ctx, x, y, w, h, alpha = 0.45) {
  const g = ctx.createLinearGradient(x, y, x, y + h)
  g.addColorStop(0, `rgba(255,255,255,${alpha})`)
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  rr(ctx, x, y, w, h, h / 2)
  ctx.fill()
}

/** 底部反光（让壳体不"死黑"） */
export function bounceLight(ctx, x, y, w, h, alpha = 0.14) {
  const g = ctx.createLinearGradient(x, y + h, x, y)
  g.addColorStop(0, `rgba(255,255,255,${alpha})`)
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  rr(ctx, x, y, w, h, h / 2)
  ctx.fill()
}

/**
 * 接触阴影 / 环境光遮蔽（AO）：物体底部紧贴桌面的暗影
 * 比 softShadow 更紧、更暗，让物体"坐"在桌面上
 */
export function contactShadow(ctx, cx, cy, rx, ry = rx * 0.35) {
  ctx.save()
  const g = ctx.createRadialGradient(cx, cy + ry * 0.3, 0, cx, cy + ry * 0.3, rx)
  g.addColorStop(0, 'rgba(0,0,0,0.38)')
  g.addColorStop(0.5, 'rgba(0,0,0,0.18)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(cx, cy + ry * 0.3, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/**
 * 边缘暗化：沿轮廓画一圈深色，模拟环境光遮蔽的深度感
 * @param {() => void} drawOutline 画轮廓路径的回调（已 beginPath，只需 lineTo/arc 等）
 */
export function edgeDark(ctx, drawOutline, width = 1.8, alpha = 0.35) {
  ctx.save()
  ctx.strokeStyle = `rgba(0,0,0,${alpha})`
  ctx.lineWidth = width
  ctx.lineJoin = 'round'
  drawOutline()
  ctx.stroke()
  ctx.restore()
}

/** 十字/一字螺丝（接线柱旁、底座固定螺丝） */
export function drawScrew(ctx, x, y, r = 4, angle = 0.6, tint = 'steel') {
  const colors = tint === 'brass' ? T.brass : T.steel
  ctx.fillStyle = hGrad(ctx, x - r, x + r, y, colors)
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'
  ctx.lineWidth = 0.7
  ctx.stroke()
  // 一字槽
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.strokeStyle = 'rgba(0,0,0,0.62)'
  ctx.lineWidth = Math.max(0.8, r * 0.28)
  ctx.beginPath()
  ctx.moveTo(-r * 0.62, 0)
  ctx.lineTo(r * 0.62, 0)
  ctx.stroke()
  ctx.restore()
}

/**
 * 接线柱（铜柱 + 滚花螺母 + 彩色极帽）
 * 材质参考实物照片：铜柱暖金渐变、螺母冷钢高光、极帽光泽塑料
 * @param {object} o {x, y, color?:'#c62828'|'#111', hover, active, snap, r}
 */
export function drawBindingPost(ctx, o) {
  const { x, y, color = null, hover = false, active = false, snap = false, r = 7 } = o
  ctx.save()
  // 磁吸/悬停光晕（光晕半径 ≥ 热区半径，点击前先看到反馈）
  if (hover || snap || active) {
    const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 3.8)
    const c = active ? '255,152,0' : snap ? '61,220,132' : '90,169,255'
    g.addColorStop(0, `rgba(${c},0.42)`)
    g.addColorStop(1, `rgba(${c},0)`)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r * 3.8, 0, Math.PI * 2)
    ctx.fill()
  }
  // 底座铜柱（暖金多段渐变，左暗→高光→右暗）
  ctx.fillStyle = hGrad(ctx, x - r, x + r, y, T.brass)
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.65)'
  ctx.lineWidth = 1
  ctx.stroke()
  // 滚花螺母外圈（冷钢，高对比）
  ctx.fillStyle = hGrad(ctx, x - r * 0.72, x + r * 0.72, y, T.chrome)
  ctx.beginPath()
  ctx.arc(x, y, r * 0.72, 0, Math.PI * 2)
  ctx.fill()
  // 极帽（光泽塑料：底色 + 顶部亮斑 + 边缘暗）
  const capColor = color
  if (capColor) {
    // 底色
    ctx.fillStyle = capColor
    ctx.beginPath()
    ctx.arc(x, y, r * 0.52, 0, Math.PI * 2)
    ctx.fill()
    // 顶部亮斑（光泽塑料的高光）
    const capG = ctx.createRadialGradient(x - r * 0.15, y - r * 0.18, 0, x, y, r * 0.52)
    capG.addColorStop(0, 'rgba(255,255,255,0.45)')
    capG.addColorStop(0.5, 'rgba(255,255,255,0.08)')
    capG.addColorStop(1, 'rgba(0,0,0,0.25)')
    ctx.fillStyle = capG
    ctx.beginPath()
    ctx.arc(x, y, r * 0.52, 0, Math.PI * 2)
    ctx.fill()
    // 边缘暗圈
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'
    ctx.lineWidth = 0.8
    ctx.stroke()
  }
  // 高光点（金属/塑料通用的镜面反射）
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.beginPath()
  ctx.arc(x - r * 0.28, y - r * 0.32, r * 0.18, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** 玻璃外壳：半透明体 + 两道镜面反射 */
export function drawGlass(ctx, cx, cy, r, { tint = 'rgba(220,240,255,0.30)', alpha = 1 } = {}) {
  ctx.save()
  ctx.globalAlpha = alpha
  // 玻璃体
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.15, cx, cy, r)
  g.addColorStop(0, 'rgba(255,255,255,0.55)')
  g.addColorStop(0.55, tint)
  g.addColorStop(1, 'rgba(150,180,200,0.42)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  // 边缘亮线
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'
  ctx.lineWidth = 1.1
  ctx.beginPath()
  ctx.arc(cx, cy, r - 0.6, 0, Math.PI * 2)
  ctx.stroke()
  // 镜面反射 1：左上大弧
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.lineWidth = Math.max(1.4, r * 0.14)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.66, Math.PI * 1.08, Math.PI * 1.42)
  ctx.stroke()
  // 镜面反射 2：右下小弧
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'
  ctx.lineWidth = Math.max(1, r * 0.08)
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.72, Math.PI * 0.12, Math.PI * 0.34)
  ctx.stroke()
  ctx.lineCap = 'butt'
  ctx.restore()
}

/** 暖黄光晕（灯泡亮起、指示灯） */
export function drawGlow(ctx, x, y, radius, { color = [255, 226, 120], intensity = 1 } = {}) {
  if (intensity <= 0.001) return
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius)
  const [r, gg, b] = color
  g.addColorStop(0, `rgba(${r},${gg},${b},${0.85 * intensity})`)
  g.addColorStop(0.32, `rgba(${r},${gg},${b},${0.34 * intensity})`)
  g.addColorStop(1, `rgba(${r},${gg},${b},0)`)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
}

/** 文字（统一字体，避免各器材字号飘） */
export function label(ctx, text, x, y, { size = 9, color = '#cfd8dc', weight = '600', align = 'center', baseline = 'top', font = 'sans-serif' } = {}) {
  ctx.save()
  ctx.font = `${weight} ${size}px ${font}`
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = baseline
  ctx.fillText(text, x, y)
  ctx.restore()
}

/** 数值格式化：自动选有效位，避免出现 0.0000001 之类 */
export function fmt(v, digits = 2) {
  if (!Number.isFinite(v)) return '--'
  const a = Math.abs(v)
  if (a >= 100) return v.toFixed(0)
  if (a >= 10) return v.toFixed(Math.min(1, digits))
  return v.toFixed(digits)
}
