/**
 * parts.js — 写实教具渲染（渲染层·元件）
 *
 * ┌─ 坐标约定（与 circuitKit.getTerminals 一致）─────────────────┐
 * │ 每个元件都在「本地坐标」里绘制：原点在元件中心，              │
 * │ 两个接线柱固定在 (-40, 0) 和 (+40, 0)。                      │
 * │ 调用方负责 translate/rotate，本文件只画本体。                │
 * └──────────────────────────────────────────────────────────────┘
 *
 * 画法要点：所有元件都遵循同一套"拍照级"层次，避免风格跳跃：
 *   ① 桌面投影（偏移、无模糊 → 廉价但有效）
 *   ② 外壳（三段纵向渐变 + 深色描边）
 *   ③ 顶部高光条 + 底部反光（塑料的圆柱错觉）
 *   ④ 金属件（横向渐变 + 轮郭 + 高光点）
 *   ⑤ 功能层（灯丝、表盘指针、滑片、闸刀）
 *   ⑥ 标识层（丝印字、量程、极性符号）
 */

import {
  T, rr, vGrad, hGrad, glossBand, bounceLight, drawScrew, drawBindingPost,
  drawGlass, drawGlow, label, fmt, contactShadow, edgeDark,
} from './theme.js'

// ────────────────────────────────────────────────────────────────
//  公共小工具
// ────────────────────────────────────────────────────────────────

/**
 * 软投影：3 层半透明黑 + 接触阴影，模拟扩散阴影 + AO
 * 比 shadowBlur 便宜很多，且能做出"物体坐在桌面上"的层次
 */
function softShadow(ctx, x, y, w, h, r = 6) {
  // 接触阴影（紧贴底部，最暗）
  contactShadow(ctx, x + w / 2, y + h, w * 0.55, 4)
  // 扩散阴影（偏移、更大、更淡）
  ctx.fillStyle = 'rgba(0,0,0,0.20)'
  rr(ctx, x - 1, y + 3, w + 2, h, r)
  ctx.fill()
  ctx.fillStyle = 'rgba(0,0,0,0.12)'
  rr(ctx, x - 4, y + 6, w + 8, h, r + 3)
  ctx.fill()
}

/** 元件的丝印字（在深色桌面上用浅色，可读但不刺眼） */
function silk(ctx, text, x, y, o = {}) {
  label(ctx, text, x, y, { size: 8, color: 'rgba(220,232,240,0.72)', weight: '600', ...o })
}

/** 引线：从接线柱到元件本体的金属导线（钢色） */
function lead(ctx, x1, y1, x2, y2, w = 1.8) {
  ctx.strokeStyle = hGrad(ctx, Math.min(x1, x2), Math.max(x1, x2), (y1 + y2) / 2, T.steel)
  ctx.lineWidth = w
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  ctx.lineCap = 'butt'
}

// ────────────────────────────────────────────────────────────────
//  1. 电源（干电池 + 电池夹）
// ────────────────────────────────────────────────────────────────

/**
 * @param {object} o {voltage, hover}
 */
export function drawBattery(ctx, o = {}) {
  const { voltage = 3 } = o
  ctx.save()

  // 电池夹底座（黑色胶木）
  softShadow(ctx, -34, -11, 68, 24, 5)
  ctx.fillStyle = vGrad(ctx, 0, -11, 13, T.bakelite)
  rr(ctx, -34, -9, 68, 22, 4)
  ctx.fill()
  edgeDark(ctx, () => rr(ctx, -34, -9, 68, 22, 4), 1.6, 0.4)
  glossBand(ctx, -32, -8, 64, 5, 0.12)

  // 固定螺丝
  drawScrew(ctx, -28, 10, 2.6, 0.4)
  drawScrew(ctx, 28, 10, 2.6, -0.4)

  // 左右金属夹片（把电池卡住，同时连到接线柱）
  for (const [sx, dx] of [[-1, -40], [1, 40]]) {
    ctx.fillStyle = hGrad(ctx, sx > 0 ? 20 : -40, sx > 0 ? 40 : -20, 0, T.steel)
    rr(ctx, sx > 0 ? 20 : -40, -9, 20, 18, 2)
    ctx.fill()
    edgeDark(ctx, () => rr(ctx, sx > 0 ? 20 : -40, -9, 20, 18, 2), 1.2, 0.35)
    // 弹簧圈（左负极端）
    if (sx < 0) {
      ctx.strokeStyle = 'rgba(30,35,40,0.75)'
      ctx.lineWidth = 1
      for (let i = 0; i < 4; i++) {
        const px = -37 + i * 3.6
        ctx.beginPath()
        ctx.arc(px, 0, 3.4, -Math.PI * 0.45, Math.PI * 0.45)
        ctx.stroke()
      }
    }
    // 金属高光条
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    rr(ctx, sx > 0 ? 21 : -39, -8, 18, 2.2, 1)
    ctx.fill()
    void dx
  }

  // 电池本体（AA 干电池）
  const bw = 46, bh = 19
  softShadow(ctx, -bw / 2, -bh / 2 + 1, bw, bh, 8)
  // 银色外壳（5 段渐变：暗→亮→暗，模拟圆柱受光）
  ctx.fillStyle = vGrad(ctx, 0, -bh / 2, bh / 2, ['#d8e0e6', '#f4f7f8', '#c9d3d9', '#8d9aa2', '#5f6a71'])
  rr(ctx, -bw / 2, -bh / 2, bw, bh, 7)
  ctx.fill()
  edgeDark(ctx, () => rr(ctx, -bw / 2, -bh / 2, bw, bh, 7), 1.4, 0.4)

  // 蓝色标签带 + 金色细环
  ctx.fillStyle = '#1565c0'
  ctx.fillRect(-bw / 2 + 7, -bh / 2 + 1.5, 15, bh - 3)
  ctx.fillStyle = '#0d47a1'
  ctx.fillRect(-bw / 2 + 7, -bh / 2 + 1.5, 3, bh - 3)
  ctx.fillStyle = '#ffca28'
  ctx.fillRect(-bw / 2 + 23, -bh / 2 + 1.5, 3, bh - 3)
  // 标签文字
  label(ctx, 'AA', -bw / 2 + 14.5, 0, { size: 7, color: '#eaf4ff', weight: '700', baseline: 'middle' })
  label(ctx, `${fmt(voltage, 1)}V`, bw / 2 - 8, 0, { size: 7, color: '#37474f', weight: '700', baseline: 'middle', align: 'right' })

  // 圆柱高光（主镜面反射带）
  ctx.fillStyle = 'rgba(255,255,255,0.65)'
  rr(ctx, -bw / 2 + 4, -bh / 2 + 2, bw - 10, 2.8, 1.4)
  ctx.fill()
  // 次级冷反射带（对面）
  ctx.fillStyle = 'rgba(180,200,220,0.20)'
  rr(ctx, -bw / 2 + 6, bh / 2 - 5, bw - 12, 2, 1)
  ctx.fill()
  // 底部反光
  bounceLight(ctx, -bw / 2 + 3, bh / 2 - 5, bw - 6, 4, 0.18)
  // 负极平底 / 正极凸帽
  ctx.fillStyle = hGrad(ctx, -bw / 2 - 1, -bw / 2 + 4, 0, ['#6b767d', '#aab6bc', '#78848a'])
  rr(ctx, -bw / 2 - 1.5, -bh / 2 + 2, 4, bh - 4, 1.5)
  ctx.fill()
  ctx.fillStyle = hGrad(ctx, bw / 2 - 2, bw / 2 + 5, 0, T.brass)
  rr(ctx, bw / 2 - 1.5, -5, 5.5, 10, 2)
  ctx.fill()
  edgeDark(ctx, () => rr(ctx, bw / 2 - 1.5, -5, 5.5, 10, 2), 1, 0.4)

  // 极性丝印
  label(ctx, '−', -30, -15, { size: 11, color: 'rgba(180,200,215,0.85)', weight: '700', align: 'center' })
  label(ctx, '+', 30, -15, { size: 11, color: 'rgba(255,140,120,0.95)', weight: '700', align: 'center' })

  ctx.restore()
}

// ────────────────────────────────────────────────────────────────
//  2. 小灯泡（灯座 + 玻璃泡 + 灯丝）
// ────────────────────────────────────────────────────────────────

/**
 * @param {object} o {brightness 0..1, overload 0..1, ratedV}
 */
export function drawBulb(ctx, o = {}) {
  const { brightness = 0, overload = 0 } = o
  const b = Math.max(0, Math.min(1, brightness))
  const ov = Math.max(0, Math.min(1, overload))
  // 灯丝温色：暗红(0) → 橙 → 白炽(1)，过载时强制偏红
  const heat = Math.min(1, b * 0.75 + ov * 0.55)
  const filR = Math.round(90 + 165 * heat)
  const filG = Math.round(20 + 190 * Math.min(1, heat * 0.92))
  const filB = Math.round(20 + 190 * Math.max(0, heat - 0.45) * 1.6)

  ctx.save()

  // 灯座（胶木 + 铜螺口）
  softShadow(ctx, -30, -4, 60, 20, 4)
  ctx.fillStyle = vGrad(ctx, 0, -4, 16, T.bakelite)
  rr(ctx, -30, -4, 60, 20, 4)
  ctx.fill()
  edgeDark(ctx, () => rr(ctx, -30, -4, 60, 20, 4), 1.5, 0.4)
  glossBand(ctx, -28, -3, 56, 5, 0.16)
  drawScrew(ctx, -24, 13, 2.4, 0.3)
  drawScrew(ctx, 24, 13, 2.4, -0.3)

  // 两侧引线（接线柱 → 灯座）
  lead(ctx, -40, 0, -26, 0)
  lead(ctx, 40, 0, 26, 0)

  // 铜螺口（灯头）
  ctx.fillStyle = hGrad(ctx, -9, 9, -6, T.brass)
  rr(ctx, -8.5, -12, 17, 10, 3)
  ctx.fill()
  edgeDark(ctx, () => rr(ctx, -8.5, -12, 17, 10, 3), 1.2, 0.45)
  // 螺纹
  ctx.strokeStyle = 'rgba(0,0,0,0.28)'
  ctx.lineWidth = 0.9
  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    ctx.moveTo(-8.5, -10.5 + i * 2.6)
    ctx.lineTo(8.5, -11.4 + i * 2.6)
    ctx.stroke()
  }
  // 玻璃与灯头之间的颈部
  ctx.fillStyle = 'rgba(200,225,240,0.55)'
  rr(ctx, -6.5, -16, 13, 6, 2)
  ctx.fill()

  // 玻璃泡
  const cy = -28, gr = 14.5
  if (b > 0.02 || ov > 0.02) {
    drawGlow(ctx, 0, cy, gr * (1.7 + 2.1 * b) + ov * 8, {
      color: [255, Math.round(226 - 40 * ov), Math.round(150 - 90 * ov)],
      intensity: Math.min(1, 0.18 + 0.95 * b + 0.4 * ov),
    })
  }
  drawGlass(ctx, 0, cy, gr, { tint: `rgba(${Math.round(210 + 45 * heat)},${Math.round(235 - 40 * ov)},255,0.30)` })

  // 灯丝支架 + 灯丝（V 形盘绕）
  ctx.strokeStyle = 'rgba(120,132,140,0.9)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(-3.4, cy + 12)
  ctx.lineTo(-3.4, cy + 4)
  ctx.moveTo(3.4, cy + 12)
  ctx.lineTo(3.4, cy + 4)
  ctx.stroke()

  const filColor = `rgb(${filR},${filG},${filB})`
  ctx.strokeStyle = heat > 0.06 ? filColor : 'rgba(90,96,102,0.95)'
  ctx.lineWidth = heat > 0.06 ? 1.7 : 1.2
  ctx.lineJoin = 'round'
  if (heat > 0.06) {
    ctx.shadowColor = `rgba(${filR},${filG},${filB},0.95)`
    ctx.shadowBlur = 6 + 8 * heat
  }
  ctx.beginPath()
  ctx.moveTo(-3.4, cy + 4)
  // 锯齿状灯丝，像真实的绕丝
  for (let i = 0; i < 6; i++) {
    const px = -3.4 + (i + 0.5) * (6.8 / 6)
    const py = cy + 4 - (i % 2 === 0 ? 6.5 : 2.5)
    ctx.lineTo(px, py)
  }
  ctx.lineTo(3.4, cy + 4)
  ctx.stroke()
  ctx.shadowBlur = 0

  // 玻璃再罩一层（让灯丝看起来在泡内）
  ctx.globalAlpha = 0.5
  drawGlass(ctx, 0, cy, gr, { tint: 'rgba(235,245,255,0.16)' })
  ctx.globalAlpha = 1

  // 灯头下方的凹陷阴影
  ctx.fillStyle = 'rgba(0,0,0,0.30)'
  rr(ctx, -7, -14, 14, 3, 1.5)
  ctx.fill()

  // 过载警示
  if (ov > 0.05) {
    const flash = 0.55 + 0.45 * Math.sin(Date.now() / 90)
    ctx.strokeStyle = `rgba(255,72,54,${0.35 + 0.5 * flash * ov})`
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.arc(0, cy, gr + 4, 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.restore()
}

// ────────────────────────────────────────────────────────────────
//  3. 开关（闸刀开关）
// ────────────────────────────────────────────────────────────────

/**
 * @param {object} o {closed, hover}
 */
export function drawSwitch(ctx, o = {}) {
  const closed = o.closed !== false
  ctx.save()

  // 胶木底座
  softShadow(ctx, -30, -8, 60, 22, 4)
  ctx.fillStyle = vGrad(ctx, 0, -8, 14, ['#7b564a', '#4e342e', '#2b1d19'])
  rr(ctx, -30, -8, 60, 22, 4)
  ctx.fill()
  edgeDark(ctx, () => rr(ctx, -30, -8, 60, 22, 4), 1.5, 0.4)
  glossBand(ctx, -28, -7, 56, 5, 0.18)
  drawScrew(ctx, -25, 11, 2.6, 0.5)
  drawScrew(ctx, 25, 11, 2.6, -0.5)

  // 引线（接线柱 → 底座内的铜排）
  lead(ctx, -40, 0, -22, 0)
  lead(ctx, 40, 0, 22, 0)

  // 铰链座与刀座
  ctx.fillStyle = hGrad(ctx, -26, -18, 0, T.brass)
  rr(ctx, -24, -6, 8, 12, 2)
  ctx.fill()
  ctx.fillStyle = hGrad(ctx, 16, 26, 0, T.brass)
  rr(ctx, 16, -6, 9, 12, 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'
  ctx.lineWidth = 0.8
  ctx.stroke()

  // 闸刀：闭合时贴合刀座，断开时向上翘起
  const px = -20, py = 0
  const ang = closed ? 0 : -0.62
  ctx.save()
  ctx.translate(px, py)
  ctx.rotate(ang)
  // 刀身（黄铜，带高光）
  ctx.fillStyle = hGrad(ctx, 0, 44, 0, T.brass)
  rr(ctx, -1, -2.4, 45, 4.8, 2.4)
  ctx.fill()
  ctx.strokeStyle = 'rgba(70,45,10,0.85)'
  ctx.lineWidth = 0.8
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.42)'
  rr(ctx, 0, -2, 42, 1.4, 0.7)
  ctx.fill()
  // 红色绝缘手柄
  ctx.fillStyle = vGrad(ctx, 0, -5, 5, ['#ff6f60', '#e53935', '#a02318'])
  rr(ctx, 33, -5.5, 13, 11, 4)
  ctx.fill()
  ctx.strokeStyle = 'rgba(90,10,5,0.85)'
  ctx.lineWidth = 0.9
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  rr(ctx, 35, -4, 9, 2.4, 1.2)
  ctx.fill()
  ctx.restore()

  // 状态丝印
  silk(ctx, closed ? '闭合' : '断开', 0, 17, {
    size: 8,
    color: closed ? 'rgba(61,220,132,0.95)' : 'rgba(255,120,110,0.95)',
  })

  ctx.restore()
}

// ────────────────────────────────────────────────────────────────
//  4. 定值电阻（色环电阻）
// ────────────────────────────────────────────────────────────────

const DIGIT_COLOR = ['#1a1a1a', '#6d4c41', '#d32f2f', '#f57c00', '#fbc02d', '#388e3c', '#1976d2', '#7b1fa2', '#757575', '#fafafa']
const MULT_COLOR = ['#1a1a1a', '#6d4c41', '#d32f2f', '#f57c00', '#fbc02d', '#388e3c', '#1976d2', '#7b1fa2', '#757575', '#fafafa', '#c9a227', '#b0bec5']

/** 由阻值反推四色环（前两位有效数字 + 倍率 + 金色 ±5%） */
export function resistorBands(R) {
  const v = Math.abs(Number(R))
  if (!Number.isFinite(v) || v <= 0) return [DIGIT_COLOR[0], DIGIT_COLOR[0], MULT_COLOR[0], '#c9a227']
  let e = Math.floor(Math.log10(v)) - 1
  e = Math.max(0, Math.min(9, e))
  let mant = Math.round(v / Math.pow(10, e))
  if (mant >= 100) { mant = Math.round(mant / 10); e = Math.min(9, e + 1) }
  if (mant < 10) { mant *= 10; e = Math.max(0, e - 1) }
  const d1 = Math.floor(mant / 10) % 10
  const d2 = mant % 10
  return [DIGIT_COLOR[d1], DIGIT_COLOR[d2], MULT_COLOR[e] || '#c9a227', '#c9a227']
}

/**
 * @param {object} o {resistance, hover}
 */
export function drawResistor(ctx, o = {}) {
  const { resistance = 10 } = o
  ctx.save()

  // 两端引线
  lead(ctx, -40, 0, -20, 0, 1.6)
  lead(ctx, 40, 0, 20, 0, 1.6)

  // 釉面本体
  softShadow(ctx, -20, -8, 40, 16, 7)
  ctx.fillStyle = vGrad(ctx, 0, -8, 8, ['#f7ecd9', '#e3d0b4', '#bfa482', '#8d7355'])
  rr(ctx, -20, -8, 40, 16, 7)
  ctx.fill()
  edgeDark(ctx, () => rr(ctx, -20, -8, 40, 16, 7), 1.4, 0.35)
  // 顶部高光
  ctx.fillStyle = 'rgba(255,255,255,0.62)'
  rr(ctx, -17, -6.4, 34, 2.6, 1.3)
  ctx.fill()

  // 四道色环
  const bands = resistorBands(resistance)
  bands.forEach((c, i) => {
    ctx.fillStyle = c
    const x = -13 + i * 6.4
    ctx.fillRect(x, -7.2, 3.4, 14.4)
    // 环上的一点受光
    ctx.fillStyle = 'rgba(255,255,255,0.22)'
    ctx.fillRect(x, -7.2, 1, 14.4)
  })

  // 引脚焊点
  for (const sx of [-20, 20]) {
    ctx.fillStyle = hGrad(ctx, sx - 3, sx + 3, 0, T.steel)
    ctx.beginPath()
    ctx.arc(sx, 0, 2.4, 0, Math.PI * 2)
    ctx.fill()
  }

  silk(ctx, `${fmt(resistance, 1)}Ω`, 0, 11, { size: 9, color: 'rgba(255,236,200,0.9)' })

  ctx.restore()
}

// ────────────────────────────────────────────────────────────────
//  5. 滑动变阻器（瓷筒 + 电阻丝 + 金属滑杆）
// ────────────────────────────────────────────────────────────────

/** 滑片在本地坐标里的 x（供点击热区复用） */
export function rheostatSliderX(R, maxR = 50) {
  const ratio = Math.max(0, Math.min(1, (R || 0) / maxR))
  return -26 + ratio * 52
}

/**
 * @param {object} o {R, maxR, dragging}
 */
export function drawRheostat(ctx, o = {}) {
  const { R = 20, maxR = 50, dragging = false } = o
  const sliderX = rheostatSliderX(R, maxR)
  ctx.save()

  // 接线柱 → 瓷筒两端的引线
  lead(ctx, -40, 0, -30, 6, 1.8)
  lead(ctx, 40, 0, 30, 6, 1.8)

  // 瓷筒
  softShadow(ctx, -30, -3, 60, 20, 5)
  ctx.fillStyle = vGrad(ctx, 0, -3, 16, ['#ffffff', '#f2ece2', '#cfc4b6', '#9d9184'])
  rr(ctx, -30, -3, 60, 19, 5)
  ctx.fill()
  ctx.strokeStyle = 'rgba(110,98,86,0.8)'
  ctx.lineWidth = 1
  ctx.stroke()

  // 密绕电阻丝（只在瓷筒内部，带明暗）
  ctx.save()
  rr(ctx, -30, -3, 60, 19, 5)
  ctx.clip()
  for (let i = 0; i < 44; i++) {
    const px = -29.5 + i * 1.36
    const shade = i % 2 === 0 ? 'rgba(120,105,90,0.55)' : 'rgba(70,58,48,0.65)'
    ctx.strokeStyle = shade
    ctx.lineWidth = 1.1
    ctx.beginPath()
    ctx.moveTo(px, -4)
    ctx.lineTo(px, 17)
    ctx.stroke()
  }
  // 电阻丝整体受光
  const sheen = ctx.createLinearGradient(0, -3, 0, 16)
  sheen.addColorStop(0, 'rgba(255,255,255,0.42)')
  sheen.addColorStop(0.4, 'rgba(255,255,255,0.05)')
  sheen.addColorStop(1, 'rgba(0,0,0,0.30)')
  ctx.fillStyle = sheen
  ctx.fillRect(-30, -3, 60, 19)
  ctx.restore()

  // 端环
  for (const sx of [-30, 30]) {
    ctx.fillStyle = hGrad(ctx, sx - 3, sx + 3, 6, T.brass)
    rr(ctx, sx - 2.5, -3, 5, 19, 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'
    ctx.lineWidth = 0.7
    ctx.stroke()
  }

  // 支脚
  ctx.fillStyle = vGrad(ctx, 0, 16, 21, T.steel)
  rr(ctx, -24, 15, 9, 6, 1.5)
  ctx.fill()
  rr(ctx, 15, 15, 9, 6, 1.5)
  ctx.fill()

  // 金属滑杆
  ctx.fillStyle = hGrad(ctx, 0, 0, -12, T.chrome)
  ctx.fillStyle = vGrad(ctx, 0, -15, -9, T.chrome)
  rr(ctx, -33, -15, 66, 5.5, 2.5)
  ctx.fill()
  ctx.strokeStyle = 'rgba(30,40,46,0.6)'
  ctx.lineWidth = 0.7
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  rr(ctx, -31, -14.4, 62, 1.4, 0.7)
  ctx.fill()
  // 滑杆两端支架
  for (const sx of [-33, 30]) {
    ctx.fillStyle = vGrad(ctx, 0, -16, 3, T.steel)
    rr(ctx, sx, -16, 3.5, 19, 1.5)
    ctx.fill()
  }

  // 滑片（橙色工程塑料 + 触点）
  ctx.save()
  if (dragging) {
    ctx.shadowColor = 'rgba(255,152,0,0.85)'
    ctx.shadowBlur = 8
  }
  ctx.fillStyle = vGrad(ctx, 0, -22, -8, ['#ffb74d', '#ef6c00', '#bf360c'])
  rr(ctx, sliderX - 6, -22, 12, 11, 3)
  ctx.fill()
  ctx.strokeStyle = 'rgba(90,30,0,0.85)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  rr(ctx, sliderX - 4.5, -21, 9, 2.2, 1.1)
  ctx.fill()
  ctx.restore()
  // 触点弹簧片（压到电阻丝上）
  ctx.strokeStyle = 'rgba(200,210,215,0.9)'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(sliderX, -11)
  ctx.lineTo(sliderX, 0)
  ctx.stroke()
  ctx.lineCap = 'butt'

  // 阻值丝印 + 方向提示
  silk(ctx, `${fmt(R, 1)}Ω`, 0, 23, { size: 9, color: 'rgba(255,236,200,0.92)' })
  silk(ctx, '小', -34, 23, { size: 7, color: 'rgba(200,215,225,0.55)' })
  silk(ctx, '大', 34, 23, { size: 7, color: 'rgba(200,215,225,0.55)' })

  ctx.restore()
}

// ────────────────────────────────────────────────────────────────
//  6. 教学电表（电流表 / 电压表）：表盘 + 阻尼指针
// ────────────────────────────────────────────────────────────────

/**
 * @param {object} o
 *   {kind:'A'|'V', value, range, needle(0..1比例), over(是否超量程), hover}
 *   needle 由场景用 needle.js 逐帧算出后传入（保持本函数无状态）
 */
export function drawMeter(ctx, o = {}) {
  const { kind = 'A', value = 0, range = 3, needle = 0, over = false } = o
  const isA = kind === 'A'
  const accent = isA ? '#c62828' : '#1b5e20'
  const W = 62, H = 56
  ctx.save()

  // ── 外壳：深色胶木 + 上下渐变 ──
  softShadow(ctx, -W / 2, -H / 2, W, H, 8)
  ctx.fillStyle = vGrad(ctx, 0, -H / 2, H / 2, ['#4a5259', '#2f363b', '#1b2024'])
  rr(ctx, -W / 2, -H / 2, W, H, 8)
  ctx.fill()
  edgeDark(ctx, () => rr(ctx, -W / 2, -H / 2, W, H, 8), 1.8, 0.45)
  // 顶部倒角高光
  glossBand(ctx, -W / 2 + 3, -H / 2 + 2, W - 6, 6, 0.30)
  bounceLight(ctx, -W / 2 + 3, H / 2 - 5, W - 6, 4, 0.10)

  // ── 表盘窗 ──
  const dw = W - 12, dh = H - 22
  const dx = -dw / 2, dy = -H / 2 + 4
  ctx.fillStyle = vGrad(ctx, 0, dy, dy + dh, T.dial)
  rr(ctx, dx, dy, dw, dh, 3)
  ctx.fill()
  edgeDark(ctx, () => rr(ctx, dx, dy, dw, dh, 3), 1.2, 0.35)
  // 表盘纸的轻微暖光
  const paper = ctx.createLinearGradient(dx, dy, dx, dy + dh)
  paper.addColorStop(0, 'rgba(255,255,255,0.75)')
  paper.addColorStop(1, 'rgba(210,200,175,0.35)')
  ctx.fillStyle = paper
  rr(ctx, dx, dy, dw, dh, 3)
  ctx.fill()

  // ── 刻度弧 ──
  const cx = 0, cy = dy + dh - 9, r = dh - 13
  const a0 = (200 * Math.PI) / 180, a1 = (340 * Math.PI) / 180
  // 红色警示区（末 12%）
  ctx.strokeStyle = 'rgba(198,40,40,0.85)'
  ctx.lineWidth = 2.4
  ctx.beginPath()
  ctx.arc(cx, cy, r + 1.5, a0 + (a1 - a0) * 0.88, a1)
  ctx.stroke()
  // 主弧
  ctx.strokeStyle = 'rgba(40,42,40,0.9)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(cx, cy, r, a0, a1)
  ctx.stroke()

  // 刻度线：30 等分，每 5 格一个主刻度并标数字
  const DIV = 30
  for (let i = 0; i <= DIV; i++) {
    const a = a0 + ((a1 - a0) * i) / DIV
    const major = i % 5 === 0
    const len = major ? 5.5 : 3
    ctx.strokeStyle = major ? 'rgba(30,30,28,0.95)' : 'rgba(60,60,56,0.8)'
    ctx.lineWidth = major ? 1.2 : 0.7
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
    ctx.lineTo(cx + Math.cos(a) * (r - len), cy + Math.sin(a) * (r - len))
    ctx.stroke()
    if (major) {
      const v = (range * i) / DIV
      const txt = range <= 3 && range !== 3 ? v.toFixed(1) : String(Math.round(v * 10) / 10)
      label(ctx, txt, cx + Math.cos(a) * (r - 10.5), cy + Math.sin(a) * (r - 10.5), {
        size: 6.5, color: i / DIV > 0.88 ? '#b71c1c' : '#2b2b28', weight: '700', baseline: 'middle',
      })
    }
  }

  // 单位符号 + 量程丝印
  label(ctx, kind, 0, cy - 10, { size: 12, color: accent, weight: '800', baseline: 'middle' })
  label(ctx, `0~${range}${kind}`, 0, dy + dh - 1.5, { size: 6, color: 'rgba(60,60,56,0.85)', weight: '700', baseline: 'bottom' })

  // ── 指针（锥形 + 配重尾）──
  const t = Math.max(-0.06, Math.min(1.05, needle))
  const pa = a0 + (a1 - a0) * t
  const nx = Math.cos(pa), ny = Math.sin(pa)
  ctx.save()
  // 指针阴影
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'
  ctx.lineWidth = 2.6
  ctx.beginPath()
  ctx.moveTo(cx + nx * -3 + 0.8, cy + ny * -3 + 1)
  ctx.lineTo(cx + nx * (r - 2) + 0.8, cy + ny * (r - 2) + 1)
  ctx.stroke()
  // 针体：根部粗、尖端细（用两条锥线模拟）
  ctx.strokeStyle = over ? '#e53935' : '#b71c1c'
  ctx.lineWidth = 1.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx + nx * -3, cy + ny * -3)
  ctx.lineTo(cx + nx * (r - 2), cy + ny * (r - 2))
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(cx + nx * -2 - 0.4, cy + ny * -2 - 0.4)
  ctx.lineTo(cx + nx * (r - 4) - 0.4, cy + ny * (r - 4) - 0.4)
  ctx.stroke()
  ctx.lineCap = 'butt'
  // 轴承
  ctx.fillStyle = hGrad(ctx, cx - 3, cx + 3, cy, T.chrome)
  ctx.beginPath()
  ctx.arc(cx, cy, 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'
  ctx.lineWidth = 0.7
  ctx.stroke()
  ctx.restore()

  // 超量程：整盘红光
  if (over) {
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, W * 0.75)
    g.addColorStop(0, `rgba(255,72,54,${0.20 + 0.10 * Math.sin(Date.now() / 120)})`)
    g.addColorStop(1, 'rgba(255,72,54,0)')
    ctx.fillStyle = g
    rr(ctx, dx, dy, dw, dh, 3)
    ctx.fill()
  }

  // ── 表窗玻璃反光 ──
  ctx.save()
  rr(ctx, dx, dy, dw, dh, 3)
  ctx.clip()
  ctx.fillStyle = 'rgba(255,255,255,0.16)'
  ctx.beginPath()
  ctx.moveTo(dx + dw * 0.08, dy + dh)
  ctx.lineTo(dx + dw * 0.42, dy)
  ctx.lineTo(dx + dw * 0.60, dy)
  ctx.lineTo(dx + dw * 0.24, dy + dh)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  // ── 调零螺钉 ──
  drawScrew(ctx, -W / 2 + 6, H / 2 - 6, 2.4, 0.2)

  // ── 接线柱：黑(−)在左、红(+)在右 —— 与 ports[0]/ports[1] 一一对应 ──
  // 位置必须正好落在 (±40, 0)：这是 circuitKit.getTerminals 的接线柱坐标，
  // 视觉柱心与电气端子重合，接线时才不会有"线没插上"的错觉。
  ctx.fillStyle = vGrad(ctx, 0, -5, 5, T.steel)
  rr(ctx, -W / 2 - 6, -3.5, 9, 7, 2)
  ctx.fill()
  rr(ctx, W / 2 - 3, -3.5, 9, 7, 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'
  ctx.lineWidth = 0.7
  ctx.stroke()
  drawBindingPost(ctx, { x: -40, y: 0, color: '#1b1b1b', r: 5.6 })
  drawBindingPost(ctx, { x: 40, y: 0, color: '#c62828', r: 5.6 })

  // 极性丝印
  label(ctx, '−', -26, -H / 2 + 12, { size: 7, color: 'rgba(200,215,225,0.8)', weight: '700' })
  label(ctx, '+', 26, -H / 2 + 12, { size: 7, color: 'rgba(255,150,140,0.95)', weight: '700' })

  // 读数（丝印在表壳下方，和指针同步）
  const shown = Math.abs(value || 0)
  label(ctx, `${fmt(shown, range >= 10 ? 1 : 2)}${kind}`, 0, H / 2 - 4.5, {
    size: 8.5, color: over ? '#ff8a80' : 'rgba(180,225,255,0.95)', weight: '700', font: 'ui-monospace, Consolas, monospace',
  })

  ctx.restore()
}

// ────────────────────────────────────────────────────────────────
//  7. 接线柱（复用 kit 的热区，这里只负责画）
// ────────────────────────────────────────────────────────────────

/**
 * @param {object} o {x, y, color, hover, active, snap}
 */
export function drawTerminal(ctx, o) {
  drawBindingPost(ctx, o)
}

/**
 * 电流表/电压表的指针角度进度（渲染层只需要比例，角度在 drawMeter 内换算）
 * 超量程时返回 1.05（打表）
 */
export function needleRatio(value, range) {
  if (!range || !Number.isFinite(value)) return 0
  const r = value / range
  if (r > 1.04) return 1.05
  if (r < -0.05) return -0.06
  return r
}
