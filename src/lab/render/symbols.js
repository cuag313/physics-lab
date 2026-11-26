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
  switch2: { half: 26, lift: 34 },   // 单刀双掷：公共端到掷点跨距 half / 两掷点半跨距 lift
  capacitor: { plate: 30, gap: 8 },
  inductor: { r: 6.2, loops: 4 },
  resistor: { w: 42, h: 13 },
  rheostat: { w: 58, h: 13 },
  meter: { r: 14 },
}

/**
 * 符号在导线上占用的半宽（调用方据此断开导线）
 * @param {'battery'|'switch'|'switch2'|'capacitor'|'resistor'|'rheostat'|'meter'|'bulb'} kind
 * @param {'h'|'v'} axis 符号沿哪条导线放（水平 / 垂直）；半宽始终指"沿导线方向"的占用
 */
export function symHalf(kind, scale = 1, cells = 2, axis = 'h') {
  switch (kind) {
    case 'battery': {
      const b = SIZE.battery
      return (cells * b.pairGap + (cells - 1) * b.cellGap) * scale / 2
    }
    case 'switch': return (SIZE.switch.half + 3) * scale
    case 'switch2': return SIZE.switch2.half * scale
    case 'capacitor': return SIZE.capacitor.gap * scale / 2
    case 'inductor': return SIZE.inductor.loops * SIZE.inductor.r * scale
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
 * 交流电源（圆圈 + 正弦波），与电池符号区分：交流电源没有固定的正负极。
 * 半径 fixed，便于和电池在同一个位置互换而导线长度变化不大。
 */
export function symACSource(ctx, x, y, o = {}) {
  const { ink = INK, scale = 1, fHz = null } = o
  const k = scale
  const r = 19 * k
  ctx.save()
  ctx.strokeStyle = ink
  ctx.lineWidth = 2.1 * k
  ctx.fillStyle = '#ffffff'
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  /* 正弦波：两个周期，上下各 6 px，完全落在圆内 */
  ctx.lineWidth = 1.7 * k
  ctx.beginPath()
  for (let i = 0; i <= 40; i++) {
    const t = i / 40
    const px = x - r * 0.72 + r * 1.44 * t
    const py = y - Math.sin(t * Math.PI * 4) * r * 0.34
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
  }
  ctx.stroke()
  if (fHz) {
    ctx.font = `bold ${9 * k}px sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('~', x, y + r + 1)
  }
  ctx.restore()
  return { half: r }
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

/**
 * 开关（单刀双掷 / 换向开关）
 * 公共端在左（一个圆点），右边上下两个掷点；闸刀摆向选中的掷点，pos=0 上掷、pos=1 下掷；
 * closed=false 时刀从中位偏出、离开掷点。axis='v' 时公共端朝上、两掷点在下方（竖着放在竖直导线上）。
 * 返回三个端点的绝对坐标 { com, a, b } 供调用方接线。
 */
export function symSwitchSPDT(ctx, x, y, o = {}) {
  const { pos = 1, closed = true, scale = 1, ink = INK, axis = 'h' } = o
  const k = scale
  const s = SIZE.switch2
  const half = s.half * k, lift = s.lift * k
  const A = { x: half, y: -lift }
  const B = { x: half, y: lift }
  const sel = pos === 0 ? A : B
  const full = Math.hypot(sel.x + half, sel.y)
  const ang0 = Math.atan2(sel.y, sel.x + half)
  // 断开：刀停在两掷点之间（角度不变、长度收短），明显没搭上任何一个掷点
  const ang = ang0
  const len = closed ? full : full * 0.58
  ctx.save()
  ctx.translate(x, y)
  if (axis === 'v') ctx.rotate(Math.PI / 2)
  ctx.strokeStyle = ink
  ctx.fillStyle = ink
  ctx.lineCap = 'round'
  ctx.lineWidth = 2.3 * k
  // 闸刀（从公共端转轴伸出）
  ctx.beginPath()
  ctx.moveTo(-half, 0)
  ctx.lineTo(-half + Math.cos(ang) * len, Math.sin(ang) * len)
  ctx.stroke()
  // 三个接线点
  const dotR = 2.2 * k
  for (const p of [{ x: -half, y: 0 }, A, B]) {
    ctx.beginPath(); ctx.arc(p.x, p.y, dotR, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
  const toAbs = (p) => (axis === 'v' ? { x: x - p.y, y: y + p.x } : { x: x + p.x, y: y + p.y })
  return { half: half * k, com: toAbs({ x: -half, y: 0 }), a: toAbs(A), b: toAbs(B) }
}

/**
 * 电容器：两片平行等长极板（教科书画法），极板垂直于导线。
 * axis='h' 时极板竖立、导线左右接入；axis='v' 时极板水平、导线上下接入。
 */
export function symCapacitor(ctx, x, y, o = {}) {
  const { scale = 1, ink = INK, axis = 'h' } = o
  const k = scale
  const c = SIZE.capacitor
  const P = c.plate * k, G = c.gap * k
  ctx.save()
  ctx.translate(x, y)
  if (axis === 'v') ctx.rotate(Math.PI / 2)
  ctx.strokeStyle = ink
  ctx.lineWidth = 2.4 * k
  ctx.lineCap = 'butt'
  for (const px of [-G / 2, G / 2]) {
    ctx.beginPath(); ctx.moveTo(px, -P / 2); ctx.lineTo(px, P / 2); ctx.stroke()
  }
  ctx.restore()
  return { half: G / 2 }
}

/**
 * 电感（线圈）：连续 n 个半圆（人教版「线圈」画法），半圆骑在导线上。
 * axis='h' 时沿水平导线、半圆朝上鼓；axis='v' 时沿竖直导线、半圆朝右鼓。
 * 铁芯版本 core=true 时在线圈上方加一条与导线平行的小横线（表示有铁芯）。
 */
export function symInductor(ctx, x, y, o = {}) {
  const { scale = 1, ink = INK, loops = SIZE.inductor.loops, axis = 'h', core = false } = o
  const k = scale
  const r = SIZE.inductor.r * k
  const W = loops * 2 * r
  ctx.save()
  ctx.translate(x, y)
  if (axis === 'v') ctx.rotate(Math.PI / 2)
  ctx.strokeStyle = ink
  ctx.fillStyle = ink
  ctx.lineWidth = 1.9 * k
  ctx.lineCap = 'butt'
  for (let i = 0; i < loops; i++) {
    const cx = -W / 2 + r + i * 2 * r
    ctx.beginPath(); ctx.arc(cx, 0, r, Math.PI, 0); ctx.stroke()
  }
  if (core) {
    // 铁芯：与导线平行的一条短线（画在线圈内侧，贴住半圆根部）
    ctx.lineWidth = 2.4 * k
    ctx.beginPath(); ctx.moveTo(-W / 2 + 1.5 * k, -1.2 * k); ctx.lineTo(W / 2 - 1.5 * k, -1.2 * k); ctx.stroke()
  }
  ctx.restore()
  return { half: W / 2 }
}

/** 定值电阻：空心矩形（人教版画法，不用锯齿） */
export function symResistor(ctx, x, y, o = {}) {
  const { scale = 1, ink = INK, axis = 'h' } = o
  const k = scale
  const W = SIZE.resistor.w * k, H = SIZE.resistor.h * k
  ctx.save()
  ctx.translate(x, y)
  if (axis === 'v') ctx.rotate(Math.PI / 2)   // 竖放：绕中心旋转，沿竖直导线上下接入
  ctx.strokeStyle = ink
  ctx.fillStyle = '#fff'
  ctx.lineWidth = 1.7 * k
  ctx.beginPath(); ctx.rect(-W / 2, -H / 2, W, H); ctx.fill(); ctx.stroke()
  ctx.restore()
  return { half: W / 2 }
}

/**
 * 滑动变阻器：空心矩形（电阻体）+ 可移动的滑片箭头
 * 箭头横坐标随 ratio（滑片位置 0..1）沿电阻体滑动：0=左端、1=右端，
 * 与 render/parts.js 的 rheostatSliderX 取向一致（阻值越大越靠右）。
 * 画法（教科书的四柱画法）：矩形电阻体 + 上方可移动箭头，箭头尾部（端点）向右引一条横线，
 * 折下去接在电阻体右端的接线柱上 —— 表示滑片柱与右端柱相通。
 * 返回几何量 { half, W, H, ax, topY, y } 供调用方顺着符号画电子流动（左端 → 箭头 → 横线 → 右端）。
 */
export function symRheostat(ctx, x, y, o = {}) {
  const { scale = 1, ink = INK, ratio = 0.5 } = o
  const k = scale
  const W = SIZE.rheostat.w * k, H = SIZE.rheostat.h * k
  const travel = W / 2 - 7 * k
  const ax = x + (Math.max(0, Math.min(1, ratio)) * 2 - 1) * travel
  const tipY = y - H / 2 + 1 * k   // 箭头尖压到电阻体上边
  const topY = y - H / 2 - 13 * k  // 箭头尾部（引线起点）高度
  ctx.save()
  ctx.strokeStyle = ink
  ctx.fillStyle = '#fff'
  ctx.lineWidth = 1.7 * k
  // 电阻体
  ctx.beginPath(); ctx.rect(x - W / 2, y - H / 2, W, H); ctx.fill(); ctx.stroke()
  // 滑片：竖直杆 + 向下箭头（杆顶就是箭头尾部，也是引线最左端）
  ctx.beginPath(); ctx.moveTo(ax, topY); ctx.lineTo(ax, tipY - 3.5 * k); ctx.stroke()
  const aw = 4.6 * k, ah = 5.6 * k
  ctx.fillStyle = ink
  ctx.beginPath()
  ctx.moveTo(ax, tipY + 1.5 * k)
  ctx.lineTo(ax - aw, tipY + 1.5 * k - ah)
  ctx.lineTo(ax + aw, tipY + 1.5 * k - ah)
  ctx.closePath(); ctx.fill()
  // 滑片引线：从箭头尾部（ax, topY）向右拉横线，再折下接电阻体右端
  ctx.strokeStyle = ink
  ctx.beginPath()
  ctx.moveTo(ax, topY)
  ctx.lineTo(x + W / 2, topY)
  ctx.lineTo(x + W / 2, y - H / 2)
  ctx.stroke()
  ctx.restore()
  return { half: W / 2 + 3 * k, W, H, ax, topY, tipY, y }
}

/** 小灯泡：圆圈 + 叉丝（人教版灯泡符号 ⊗）。fill 可给圆内叠一层暖色（表示正在发光） */
export function symBulb(ctx, x, y, o = {}) {
  const { scale = 1, ink = INK, r = 13, fill = null } = o
  const k = scale
  const R = r * k
  ctx.save()
  ctx.strokeStyle = ink
  ctx.fillStyle = fill || '#fff'
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
