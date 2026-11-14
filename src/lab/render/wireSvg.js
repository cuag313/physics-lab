/**
 * wireSvg.js — SVG 层「连续软电线」几何与配色
 *
 * 与 render/wire.js 的 canvas 画法是同一套外观（外皮 + 本色 + 上偏高光 + 两端护套），
 * 但几何不用 Verlet 粒子链：粒子链在重力下会坠成圆底袋，看起来像一串点而不是线。
 * 这里改成一条三次贝塞尔：
 *   · 从接线柱先「横向出线」（像真导线从柱脚拔出时那样先离开器材），再横过去落到另一柱；
 *   · 控制点只在水平方向伸展 + 纵向小幅抖动（由 seed 决定，同一根线每次画都一样），
 *     所以不会下垂，每根又都不一样（随手放的感觉）：
 *     出线段长短、出线偏角、两个控制点各往弦的哪一侧鼓，全按 seed 取，四种性格混在一起，
 *     整盘看过去不像一圈同心弧，而像随手把几根线摊在桌上。
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
  const R = (k) => rnd(seed + k)

  // 出线段：两端各取不同长度（0.22..0.62 弦长），像随手捋出来的一段一段
  const e1 = dist * (0.22 + R(1) * 0.40)
  const e2 = dist * (0.22 + R(2) * 0.40)
  // 出线偏角：整体偏"往外下方拔"（真导线从柱脚拔出时先往桌面方向走），
  // 只偶尔微微上扬一点，绝不往上越过柱帽
  const a1 = (R(3) - 0.3) * 0.50
  const a2 = (R(4) - 0.3) * 0.50
  const c1 = { x: p1.x + out1 * e1 * Math.cos(a1), y: p1.y + e1 * Math.sin(a1) }
  const c2 = { x: p2.x + out2 * e2 * Math.cos(a2), y: p2.y + e2 * Math.sin(a2) }

  // 鼓向：两个控制点各往弦的哪一侧鼓一点（最多 0.13 弦长），
  // 同侧 → 一条偏到一边的弧；异侧 → S 形；接近 0 → 几乎笔直的斜线。
  // 只允许往上鼓，或者最多略低一点点（0.04 弦长），绝不坠成袋状。
  const nx = -dy / dist
  const ny = dx / dist
  const amp = dist * (0.03 + R(5) * 0.10)
  const b1 = (R(6) - 0.35) * 2 * amp
  const b2 = (R(7) - 0.35) * 2 * amp
  const downCap = dist * 0.04
  const push = (c, b) => {
    let y = c.y + ny * -b // -b：正值为向上鼓
    if (y > Math.max(p1.y, p2.y) + downCap) y = Math.max(p1.y, p2.y) + downCap
    return { x: c.x + nx * -b, y }
  }
  return { p0: { x: p1.x, y: p1.y }, c1: push(c1, b1), c2: push(c2, b2), p1: { x: p2.x, y: p2.y } }
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
    // 别做得比柱帽还大：真护套是套在柱脚上的一小段，太大就成了柱子旁边的红球
    r: w * 0.98,
    ring: shade(color, -0.55),
    body: shade(color, -0.12),
    light: shade(color, 0.55),
  }
}

/**
 * 导线端头"裸铜丝绕在接线柱上"
 *
 * 真接法：导线外皮在离柱子几毫米处被剥掉，露出里面的铜丝，铜丝在柱脚的
 * 螺栓上绕一两匝、拧紧，再把柱帽拧下来压住。所以端头不该是一颗彩色圆球，
 * 而应是「外皮到柱子前就没了 + 一小圈铜色线圈扣在柱脚上」。
 * 这里给两匝椭圆环的几何，下面各场景自己按顺序描（暗底 → 铜色 → 高光）。
 */
/**
 * 导线端头"裸铜丝绕在接线柱上"
 *
 * 真接法：外皮在离柱子几毫米处剥掉，露出铜丝，铜丝在柱脚的接线柱上绕一两匝拧紧，
 * 再把柱帽压下来。端头因此不该是一颗彩色圆球，而应是「外皮到柱子前就没了 +
 * 一小段裸铜丝盘在柱脚上」。这里给的是**螺旋路径**：几圈同心的椭圆环叠一起会糊成
 * 一个铜垫圈，螺旋线才能看出"往上绕"的方向。
 */
export function wrapLayers(color, w = 4.2) {
  const rx = w * 1.16          // 绕在柱脚上的横向半径
  const ry = w * 0.46          // 立面看是扁的（视线略高）
  const turns = 2.15
  const y0 = w * 0.10          // 最下面一匝在柱脚略下方
  const rise = -w * 1.34       // 一共往上爬这么高（匝与匝要留缝，糊一起就成了铜疙瘩）
  const N = 34
  const pts = []
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * turns * Math.PI * 2
    const k = i / N
    const rr = 1 - 0.16 * k                      // 越往上略收
    const a = 2.05 + t                            // 起点在左下前方
    pts.push({ x: rx * rr * Math.cos(a), y: y0 + rise * k + ry * rr * Math.sin(a) })
  }
  const d = 'M' + pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L')
  const dHi = 'M' + pts.map((p) => `${p.x.toFixed(1)} ${(p.y - w * 0.16).toFixed(1)}`).join(' L')
  return {
    rx, ry,
    d,
    dHi,
    sw: Math.max(0.85, w * 0.21),                  // 裸铜丝比整根电缆细得多
    metal: '#c07a30',
    metalHi: '#f0c897',
    metalDark: '#4a2e12',
    // 柱脚外侧留一小截拧出来的线头，不修边幅才像手工绕的
    tail: `M${(rx * 0.82).toFixed(1)} ${(y0 + ry * 0.45).toFixed(1)} q${(w * 0.5).toFixed(1)} ${(w * 0.3).toFixed(1)} ${(w * 0.9).toFixed(1)} ${(-w * 0.25).toFixed(1)}`,
  }
}
