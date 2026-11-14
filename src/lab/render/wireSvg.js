/**
 * wireSvg.js — SVG 层「连续软电线」几何与配色
 *
 * 与 render/wire.js 的 canvas 画法是同一套外观（外皮 + 本色 + 上偏高光 + 两端护套），
 * 但几何不用 Verlet 粒子链：粒子链在重力下会坠成圆底袋，看起来像一串点而不是线。
 * 这里改成一根三次贝塞尔：
 *   · 从接线柱先「横向出线」（像真导线从柱脚拔出时那样先离开器材），再横过去落到另一柱；
 *   · 控制点只在水平方向伸展 + 纵向小幅抖动（由 seed 决定，同一根线每次画都一样），
 *     所以不会下垂，每根又都不一样（随手放的感觉）。
 */

import { shade } from './wire.js'

/** 稳定散列：同一 seed → 同一形状（0..1） */
function rnd(seed) {
  let x = (Math.imul(seed | 0, 0x9e3779b1) ^ 0x85ebca6b) >>> 0
  x = (x ^ (x >>> 13)) >>> 0
  x = Math.imul(x, 0xc2b2ae35) >>> 0
  x = (x ^ (x >>> 16)) >>> 0
  return x / 4294967296
}

/**
 * 导线控制点
 * @param {{x,y}} p1 起点（接线柱帽下方锚点）
 * @param {{x,y}} p2 终点
 * @param {number} out1 起点出线方向（-1 向左 / +1 向右）
 * @param {number} out2 终点出线方向
 * @param {number} seed 稳定随机种子（一般用 wire id）
 */
export function wireCurve(p1, p2, out1 = 1, out2 = -1, seed = 0) {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const dist = Math.hypot(dx, dy) || 1
  const ext = Math.min(48, Math.max(14, dist * 0.34))
  const k1 = 0.6 + rnd(seed) * 0.55
  const k2 = 0.6 + rnd(seed + 17) * 0.55
  // 纵向抖动 ±5：让每根线的弧度和高度都不同，但不往下压
  const lift1 = (rnd(seed + 3) - 0.5) * 10
  const lift2 = (rnd(seed + 29) - 0.5) * 10
  const c1 = { x: p1.x + out1 * ext * k1, y: p1.y + lift1 }
  const c2 = { x: p2.x + out2 * ext * k2, y: p2.y + lift2 }
  return { p0: { x: p1.x, y: p1.y }, c1, c2, p1: { x: p2.x, y: p2.y } }
}

const r1 = (v) => Math.round(v * 10) / 10

/** 贝塞尔的 d 字符串；dy 整体纵向平移（画高光时用） */
export function curveD(cur, dy = 0) {
  const { p0, c1, c2, p1 } = cur
  return `M${r1(p0.x)} ${r1(p0.y + dy)} C${r1(c1.x)} ${r1(c1.y + dy)} ${r1(c2.x)} ${r1(c2.y + dy)} ${r1(p1.x)} ${r1(p1.y + dy)}`
}

/** 中点（选中导线的删除按钮放这里） */
export function curveMid(cur) {
  const { p0, c1, c2, p1 } = cur
  return {
    x: 0.125 * p0.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * p1.x,
    y: 0.125 * p0.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * p1.y,
  }
}

/**
 * 一根导线要画的几层（圆柱感：落影 → 外皮 → 本色 → 上偏高光）
 * @param {number} w 线径（本色宽度）
 */
export function wireLayers(cur, color, w = 4.2) {
  return {
    d: curveD(cur),
    dSheen: curveD(cur, -w * 0.24),
    dShadow: curveD(cur, 3),
    casing: shade(color, -0.52),
    core: color,
    sheen: shade(color, 0.85),
    w,
  }
}

/** 导线端头护套（画在柱帽正下方的柱脚上，让"夹住了"看得见） */
export function bootLayers(color, w = 4.2) {
  return {
    r: w * 1.25,       // 比线径粗一圈：像真导线的橡皮护套扣在柱脚上
    ring: shade(color, -0.55),
    body: shade(color, -0.12),
    light: shade(color, 0.55),
  }
}
