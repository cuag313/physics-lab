/**
 * wire.js — 导线渲染 + 电流可视化（渲染层·导线）
 *
 * 真实实验导线是「带胶皮的铜芯线」：
 *   · 外皮有体积感 → 用「深色描边 + 本色 + 上偏一点的高光」三笔画法模拟圆柱
 *   · 落影压在桌面上 → 整条贝塞尔偏移几像素画一遍半透明黑
 *   · 两端有插头/鳄鱼夹 → 在接线柱位置补一个金属护套，让"插上了"这件事看得见
 *
 * 电流可视化：沿贝塞尔按弧长均匀撒发光粒子，
 *   · 默认表示**电流 I 的方向**（电源正极 → 外电路 → 负极），
 *   · 可切换为**电子 e⁻ 的方向**（与电流反向），图例由场景负责标注。
 */

import { hGrad } from './theme.js'

/** 出线伸展距离（与 circuitKit.strokeBezierWire 保持一致，保证手柄拖拽对得上） */
const EXT = 42

/**
 * 计算导线贝塞尔控制点
 * @param {{x,y}} f 起点接线柱
 * @param {{x,y}} t 终点接线柱
 * @param {number} fIdx 起点端子索引（0=左端出线向左，1=右端向右）
 * @param {number} tIdx 终点端子索引
 * @param {{x,y}|null} m1 用户拖动的手柄1
 * @param {{x,y}|null} m2 用户拖动的手柄2
 */
export function wirePath(f, t, fIdx = 0, tIdx = 1, m1 = null, m2 = null) {
  const fOut = fIdx === 0 ? -1 : 1
  const tOut = tIdx === 0 ? -1 : 1
  return {
    p0: { x: f.x, y: f.y },
    c1: m1 || { x: f.x + fOut * EXT, y: f.y },
    c2: m2 || { x: t.x + tOut * EXT, y: t.y },
    p1: { x: t.x, y: t.y },
    fOut,
    tOut,
  }
}

/** 贝塞尔上取点 */
export function bezierAt(path, u) {
  const v = 1 - u
  const a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u
  return {
    x: a * path.p0.x + b * path.c1.x + c * path.c2.x + d * path.p1.x,
    y: a * path.p0.y + b * path.c1.y + c * path.c2.y + d * path.p1.y,
  }
}

/** 弧长表：把参数 u 转换成等距采样，粒子才会匀速 */
function pathTable(path, n = 36) {
  const pts = []
  let total = 0
  let prev = bezierAt(path, 0)
  pts.push({ u: 0, x: prev.x, y: prev.y, s: 0 })
  for (let i = 1; i <= n; i++) {
    const u = i / n
    const p = bezierAt(path, u)
    total += Math.hypot(p.x - prev.x, p.y - prev.y)
    pts.push({ u, x: p.x, y: p.y, s: total })
    prev = p
  }
  return { pts, total }
}

/** 按弧长取点 */
function pointAtS(table, s) {
  const { pts, total } = table
  if (total <= 0) return { x: pts[0].x, y: pts[0].y }
  const target = Math.max(0, Math.min(total, s))
  // 二分查找所在区间
  let lo = 0, hi = pts.length - 1
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (pts[mid].s <= target) lo = mid
    else hi = mid
  }
  const a = pts[lo], b = pts[hi]
  const span = b.s - a.s
  const k = span > 1e-6 ? (target - a.s) / span : 0
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
}

/** 颜色明暗调整（支持 #rgb / #rrggbb） */
export function shade(hex, amount) {
  let h = String(hex || '#888888').replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const num = parseInt(h, 16)
  if (!Number.isFinite(num)) return hex
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)))
  const r = clamp(((num >> 16) & 255) * (1 + amount))
  const g = clamp(((num >> 8) & 255) * (1 + amount))
  const b = clamp((num & 255) * (1 + amount))
  return `rgb(${r},${g},${b})`
}

/**
 * 画一根导线
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} path wirePath() 的结果
 * @param {object} o {color, width, energized, dim, selected}
 */
export function drawWire(ctx, path, o = {}) {
  const color = o.color || '#e53935'
  const w = o.width || 4
  const dim = !!o.dim
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (dim) ctx.globalAlpha = 0.55

  // ① 桌面落影（偏移 + 淡）
  ctx.strokeStyle = 'rgba(0,0,0,0.30)'
  ctx.lineWidth = w + 2.6
  ctx.beginPath()
  ctx.moveTo(path.p0.x + 0.5, path.p0.y + 3.5)
  ctx.bezierCurveTo(path.c1.x + 0.5, path.c1.y + 3.5, path.c2.x + 0.5, path.c2.y + 3.5, path.p1.x + 0.5, path.p1.y + 3.5)
  ctx.stroke()

  // ② 外皮轮廓（深一档，制造边缘）
  ctx.strokeStyle = shade(color, -0.52)
  ctx.lineWidth = w + 1.8
  ctx.beginPath()
  ctx.moveTo(path.p0.x, path.p0.y)
  ctx.bezierCurveTo(path.c1.x, path.c1.y, path.c2.x, path.c2.y, path.p1.x, path.p1.y)
  ctx.stroke()

  // ③ 外皮本色
  if (o.energized) {
    ctx.shadowColor = shade(color, 0.35)
    ctx.shadowBlur = 5
  }
  ctx.strokeStyle = color
  ctx.lineWidth = w
  ctx.beginPath()
  ctx.moveTo(path.p0.x, path.p0.y)
  ctx.bezierCurveTo(path.c1.x, path.c1.y, path.c2.x, path.c2.y, path.p1.x, path.p1.y)
  ctx.stroke()
  ctx.shadowBlur = 0

  // ④ 顶部高光（整条上移一点，模拟左上光源）
  ctx.strokeStyle = shade(color, 0.75)
  ctx.lineWidth = Math.max(1, w * 0.34)
  ctx.beginPath()
  ctx.moveTo(path.p0.x - 0.4, path.p0.y - w * 0.22)
  ctx.bezierCurveTo(path.c1.x - 0.4, path.c1.y - w * 0.22, path.c2.x - 0.4, path.c2.y - w * 0.22, path.p1.x - 0.4, path.p1.y - w * 0.22)
  ctx.stroke()

  // ⑤ 两端插头护套
  drawBoot(ctx, path.p0, color, w)
  drawBoot(ctx, path.p1, color, w)

  ctx.restore()
}

/** 导线端头的护套/插头 */
function drawBoot(ctx, p, color, w) {
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.fillStyle = hGrad(ctx, -w * 0.9, w * 0.9, 0, [shade(color, -0.45), shade(color, 0.2), shade(color, -0.55)])
  ctx.beginPath()
  ctx.arc(0, 0, w * 0.86, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'
  ctx.lineWidth = 0.8
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.42)'
  ctx.beginPath()
  ctx.arc(-w * 0.24, -w * 0.3, w * 0.22, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/**
 * 连线预览（拖拽中）
 * @param {object} o {color, snapped, pulse}
 */
export function drawWirePreview(ctx, path, o = {}) {
  const color = o.snapped ? '#3ddc84' : '#5aa9ff'
  ctx.save()
  ctx.lineCap = 'round'
  ctx.strokeStyle = 'rgba(0,0,0,0.28)'
  ctx.lineWidth = 5.6
  ctx.beginPath()
  ctx.moveTo(path.p0.x, path.p0.y + 3)
  ctx.bezierCurveTo(path.c1.x, path.c1.y + 3, path.c2.x, path.c2.y + 3, path.p1.x, path.p1.y + 3)
  ctx.stroke()

  ctx.setLineDash([7, 5])
  ctx.strokeStyle = color
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(path.p0.x, path.p0.y)
  ctx.bezierCurveTo(path.c1.x, path.c1.y, path.c2.x, path.c2.y, path.p1.x, path.p1.y)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
}

/**
 * 电流粒子流
 * @param {object} o
 *   {phase 0..1, dir ±1, current 安培, spacing, mode:'I'|'e', color, alpha}
 * 说明：phase 由场景按「速度 ∝ 电流」累加，保证大电流时粒子跑得快。
 */
export function drawFlow(ctx, path, o = {}) {
  const current = Math.abs(o.current || 0)
  if (current < 1e-4) return
  const table = pathTable(path, Math.max(10, Math.min(40, Math.round((path.p0.x - path.p1.x) / 6) + 14)))
  if (table.total < 12) return

  const spacing = o.spacing || 30
  const count = Math.max(2, Math.min(16, Math.floor(table.total / spacing)))
  const phase = ((o.phase ?? 0) % 1 + 1) % 1
  const dir = (o.dir || 1) >= 0 ? 1 : -1
  const isElectron = o.mode === 'e'
  // 电流方向：正极→外电路→负极；电子方向相反
  const travelSign = isElectron ? -dir : dir

  // 粒子颜色：电流=暖黄（像载流子发热），电子=青蓝
  const base = o.color || (isElectron ? [90, 200, 255] : [255, 214, 110])
  const [r, g, b] = base
  const alpha = o.alpha ?? Math.min(1, 0.45 + Math.min(current, 1.5) * 0.5)

  for (let i = 0; i < count; i++) {
    const u = (i + phase) / count
    const s = (travelSign > 0 ? u : 1 - u) * table.total
    const p = pointAtS(table, s)
    // 尾部拖影：沿运动反方向取两个点
    const tail = pointAtS(table, s - travelSign * 6)
    const tail2 = pointAtS(table, s - travelSign * 12)

    // 拖影
    const grad = ctx.createLinearGradient(tail2.x, tail2.y, p.x, p.y)
    grad.addColorStop(0, `rgba(${r},${g},${b},0)`)
    grad.addColorStop(1, `rgba(${r},${g},${b},${0.55 * alpha})`)
    ctx.strokeStyle = grad
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(tail2.x, tail2.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()

    // 粒子本体（带辉光）
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 4.6)
    glow.addColorStop(0, `rgba(255,255,255,${0.95 * alpha})`)
    glow.addColorStop(0.35, `rgba(${r},${g},${b},${0.9 * alpha})`)
    glow.addColorStop(1, `rgba(${r},${g},${b},0)`)
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(p.x, p.y, 4.6, 0, Math.PI * 2)
    ctx.fill()
    void tail
  }
  ctx.lineCap = 'butt'
}

/** 当前电流 → 粒子相位推进速度（每秒圈数） */
export function flowSpeed(current) {
  const i = Math.abs(current || 0)
  if (i < 1e-4) return 0
  // 电流越大越快，但设上限避免闪烁
  return Math.min(2.4, 0.25 + Math.log10(1 + i * 900) * 0.55)
}
