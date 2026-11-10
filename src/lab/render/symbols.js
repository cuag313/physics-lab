/**
 * symbols.js — 标准电路符号（「电路图」画法，人教版初中物理）
 *
 * 与 parts.js（写实教具）并列的一层：只画"一个符号"，不认识电路拓扑、不做物理判断。
 * 所有符号以 (x,y) 为几何中心，沿**水平导线**放置（本实验的元件都在水平段上），
 * 横平竖直、线宽统一，观感对齐教科书电路图。
 *
 * 布局方需要「先量后画」：先用 symHalf() 得到符号在导线上占用的半宽、
 * 断开导线留缺口，再调用对应 sym*() 把符号画上去。
 */

const INK = '#2f3e4a'
export const SYM_INK = INK

/** 符号尺寸基准（scale=1 时的像素值）；draw 与 symHalf 都用这一套数字，避免两处不一致 */
const SIZE = {
  battery: { longH: 19, shortH: 9, pairGap: 7, cellGap: 13 },
  switch: { half: 16, lift: 13 },
  resistor: { w: 42, h: 13 },
  rheostat: { w: 46, h: 13 },
  meter: { r: 14 },
}

/**
 * 符号在导线上占用的半宽（调用方据此断开导线）
 * @param {'battery'|'switch'|'resistor'|'rheostat'|'meter'} kind
 */
export function symHalf(kind, scale = 1, cells = 2) {
  switch (kind) {
    case 'battery': {
      const b = SIZE.battery
      return (cells * b.pairGap + (cells - 1) * b.cellGap) * scale / 2
    }
    case 'switch': return (SIZE.switch.half + 3) * scale
    case 'resistor': return SIZE.resistor.w * scale / 2
    case 'rheostat': return (SIZE.rheostat.w / 2 + 3) * scale
    case 'bulb': return SIZE.meter.r * scale
    default: return SIZE.meter.r * scale
  }
}

/**
 * 电池组（直流电源）
 * 画法：垂直于导线的**长细线=正极**、**短粗线=负极**，n 节串联。
 * 默认 + 在右、− 在左（与 circuitKit.drawRealBattery 一致）；flip:true 时镜像为 + 在左，
 * 供那些以「电子自 − 出发」叙述流向的场景保持原朝向，不必反转电流/电子动画。
 */
export function symBattery(ctx, x, y, o = {}) {
  const { n = 2, scale = 1, ink = INK, showPolarity = true, flip = false } = o
  const k = scale
  const b = SIZE.battery
  const longH = b.longH * k
  const shortH = b.shortH * k
  const pairGap = b.pairGap * k
  const cellGap = b.cellGap * k
  const totalW = n * pairGap + (n - 1) * cellGap
  const x0 = x - totalW / 2
  ctx.save()
  ctx.lineCap = 'round'
  ctx.strokeStyle = ink
  // flip 时整体水平镜像：正极板落在左侧
  const dir = flip ? -1 : 1
  let px = flip ? x0 + totalW : x0
  for (let i = 0; i < n; i++) {
    ctx.lineWidth = 3.2 * k
    ctx.beginPath(); ctx.moveTo(px, y - shortH / 2); ctx.lineTo(px, y + shortH / 2); ctx.stroke()
    const qx = px + pairGap * dir
    ctx.lineWidth = 1.7 * k
    ctx.beginPath(); ctx.moveTo(qx, y - longH / 2); ctx.lineTo(qx, y + longH / 2); ctx.stroke()
    px = qx + cellGap * dir
  }
  if (showPolarity) {
    // 极性标注统一放在导线上方，避免与元件下方的读数芯片打架
    ctx.fillStyle = ink
    ctx.font = `bold ${11 * k}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    const ly = y - longH / 2 - 2 * k
    ctx.fillText(flip ? '+' : '−', x0, ly)
    ctx.fillText(flip ? '−' : '+', x0 + totalW, ly)
  }
  ctx.restore()
  return { half: totalW / 2 }
}

/**
 * 开关（单刀单掷）
 * 闭合：闸刀贴合导线；断开：闸刀抬起。两端画实心接线柱。
 */
export function symSwitch(ctx, x, y, o = {}) {
  const { closed = true, scale = 1, ink = INK } = o
  const k = scale
  const s = SIZE.switch
  const half = s.half * k
  const x1 = x - half, x2 = x + half
  ctx.save()
  ctx.strokeStyle = ink
  ctx.fillStyle = ink
  ctx.lineCap = 'round'
  ctx.lineWidth = 1.9 * k
  ctx.beginPath()
  ctx.moveTo(x1, y)
  if (closed) ctx.lineTo(x2, y)
  else ctx.lineTo(x2 - 3 * k, y - s.lift * k)
  ctx.stroke()
  const dotR = 2.1 * k
  ctx.beginPath(); ctx.arc(x1, y, dotR, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(x2, y, dotR, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
  return { half: half + 3 * k }
}

/** 定值电阻：空心矩形（人教版画法，不用锯齿） */
export function symResistor(ctx, x, y, o = {}) {
  const { scale = 1, ink = INK } = o
  const k = scale
  const W = SIZE.resistor.w * k, H = SIZE.resistor.h * k
  ctx.save()
  ctx.strokeStyle = ink
  ctx.fillStyle = '#fff'
  ctx.lineWidth = 1.7 * k
  ctx.beginPath(); ctx.rect(x - W / 2, y - H / 2, W, H); ctx.fill(); ctx.stroke()
  ctx.restore()
  return { half: W / 2 }
}

/**
 * 滑动变阻器：空心矩形（电阻体）+ 可移动的滑片箭头
 * 箭头横坐标随 ratio（滑片位置 0..1）沿电阻体滑动：0=左端、1=右端，
 * 与 render/parts.js 的 rheostatSliderX 取向一致（阻值越大越靠右）。
 * 画法：滑杆（横线）+ 竖直箭头向下压在电阻体上边，表示滑片接触点。
 */
export function symRheostat(ctx, x, y, o = {}) {
  const { scale = 1, ink = INK, ratio = 0.5 } = o
  const k = scale
  const W = SIZE.rheostat.w * k, H = SIZE.rheostat.h * k
  const travel = W / 2 - 4 * k
  const ax = x + (Math.max(0, Math.min(1, ratio)) * 2 - 1) * travel
  const tipY = y - H / 2 + 1 * k   // 箭头尖压到电阻体上边
  const topY = y - H / 2 - 12 * k  // 滑杆高度
  ctx.save()
  ctx.strokeStyle = ink
  ctx.fillStyle = '#fff'
  ctx.lineWidth = 1.7 * k
  // 电阻体
  ctx.beginPath(); ctx.rect(x - W / 2, y - H / 2, W, H); ctx.fill(); ctx.stroke()
  // 滑杆（横线）+ 滑片箭头
  ctx.beginPath(); ctx.moveTo(ax - 5 * k, topY); ctx.lineTo(ax + 5 * k, topY); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(ax, topY); ctx.lineTo(ax, tipY - 3.5 * k); ctx.stroke()
  const aw = 4.6 * k, ah = 5.6 * k
  ctx.fillStyle = ink
  ctx.beginPath()
  ctx.moveTo(ax, tipY + 1.5 * k)
  ctx.lineTo(ax - aw, tipY + 1.5 * k - ah)
  ctx.lineTo(ax + aw, tipY + 1.5 * k - ah)
  ctx.closePath(); ctx.fill()
  ctx.restore()
  return { half: W / 2 + 3 * k }
}

/** 小灯泡：圆圈 + 叉丝（人教版灯泡符号 ⊗） */
export function symBulb(ctx, x, y, o = {}) {
  const { scale = 1, ink = INK, r = 13 } = o
  const k = scale
  const R = r * k
  ctx.save()
  ctx.strokeStyle = ink
  ctx.fillStyle = '#fff'
  ctx.lineWidth = 1.7 * k
  ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  // 叉丝：两条对角线（在圆内）
  ctx.lineWidth = 1.5 * k
  const d = R * 0.72
  ctx.beginPath()
  ctx.moveTo(x - d, y - d); ctx.lineTo(x + d, y + d)
  ctx.moveTo(x + d, y - d); ctx.lineTo(x - d, y + d)
  ctx.stroke()
  ctx.restore()
  return { half: R }
}

/** 电表（电流表 / 电压表）：圆圈 + 衬线斜体字母（教科书画法） */
export function symMeter(ctx, x, y, o = {}) {
  const { kind = 'A', scale = 1, ink = INK } = o
  const k = scale
  const R = SIZE.meter.r * k
  ctx.save()
  ctx.strokeStyle = ink
  ctx.fillStyle = '#fff'
  ctx.lineWidth = 1.7 * k
  ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.fillStyle = ink
  ctx.font = `italic bold ${16 * k}px "Times New Roman", "Songti SC", serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(kind, x, y + 1 * k)
  ctx.restore()
  return { half: R }
}
