/* bulbBenchPhoto — 灯泡场景的「实拍器材」实验台
 *
 * 「原先的模式」= 全站电学场景用的同一套实拍器材图（public/assets/equipment/fig/*_c.png），
 * 接线柱坐标直接沿用 src/lab/scenes/electricSvgInstruments.js 里 TYPES 的实测值
 * （那里每个柱心都是在 4 倍 1:1 渲染上逐柱量出来的，不要在这里另估一套）。
 *
 * 画法：照片打底（照片里没有可动件），可动件用矢量补
 *   · 电压表/电流表 → 照片 + 红指针（机芯枢轴、针长、刻度角都用 TYPES.ammeterA / TYPES.voltmeter 的实测值）
 *   · 滑变     → rheostat_c2.png（无滑片整机）+ 矢量滑片（黑柄 / 压板 / 两根触臂，形状照拆解图那块零件）
 *   · 开关     → switch_c.png（底座 + 黑红两柱）+ 矢量闸刀（黑柄，闭合时压到触点上）
 *   · 灯泡     → bulb_c.png + screen 混合的暖光（灯丝中心 89/176、25/83）
 *   · 电源     → battery_c.png（两节干电池横放，柱在照片上）
 * 导线一律「柱到柱」，不再用原来那种横贯全台的导轨条 —— 实拍器材的柱子是同一行的，
 * 导轨一定会压过机壳。
 */
import { rr, T, clamp } from './labArtKit.js'
import { shade } from '../render/wire.js'
import { TYPES } from './electricSvgInstruments.js'

const FIG = '/physics-lab/assets/equipment/fig'
const SRC = {
  // 表盘用「去掉指针」的版本（*_n.png：原图的指针已按同色补平），指针照读数现画
  v: 'voltmeter2_n.png',
  a: 'ammeterA_n.png',
  bulb: 'bulb_c.png',
  rh: 'rheostat_c2.png',
  sw: 'switch_c.png',
  bat: 'battery_c.png',
}

/* TYPES 里的实测几何（单位＝各器材自己的视图框） */
const DEV = {
  v: { w: 130, h: 130, t: { neg: [29, 104], mid: [65, 104], full: [100, 104] }, hub: [128 / 256, 164 / 256], len: 104 / 256, ang0: -26.5, span: 78.7 },
  a: { w: 150, h: 150, t: { neg: [33, 120], mid: [75, 120], full: [115, 120] }, hub: [128 / 256, 164 / 256], len: 104 / 256, ang0: -26.5, span: 78.7 },
  bulb: { w: 176, h: 83, t: { a: [26, 52], b: [146, 52] }, fil: [89, 41], glass: [89, 31, 27] },
  sw: { w: 176, h: 110, t: { a: [26, 82], b: [151, 82] }, base: 92 },
  rh: { w: 190, h: 79, t: { tl: [5, 5], tr: [184, 6], bl: [18, 39], br: [174, 39] }, coil: [34, 158], rod: 5.9 },
  bat: { w: 150, h: 46, t: { n: [16, 22], p: [135, 22] }, photoH: 42 },
}

const CACHE = new Map()
let NOTIFY = null

/* ── 开关：直接搬 electricSvgInstruments 里那件矢量（「自己动手」台面上同一把） ──
 * TYPES.switch 是纯 SVG（底座 + 黑红两柱 + 铰链立柱 + 抬起的闸刀 + 黑柄，柱心 26/151 @ y82），
 * 没有外链图片，转 data URL 光栅化后按 176×110 铺进台面，开合同一几何、柱心与导线端点一致。 */
const SW_ART = { closed: null, open: null }
function ensureSwitchArt() {
  if (SW_ART.closed) return
  for (const st of [true, false]) {
    const key = st ? 'closed' : 'open'
    const svg = TYPES.switch.render({ id: 'bench', closed: st })
      .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
    const img = new Image()
    const e = { img, ok: false }
    img.onload = () => { e.ok = true; if (NOTIFY) NOTIFY() }
    img.onerror = () => { if (NOTIFY) NOTIFY() }
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    SW_ART[key] = e
  }
}

/** 每帧调用都安全：已加载的直接返回，未加载完的补一个回调（加载完触发重绘） */
export function loadBenchPhotos(cb) {
  if (cb) NOTIFY = cb
  for (const key of Object.keys(SRC)) {
    if (CACHE.has(key)) continue
    const img = new Image()
    const e = { img, ok: false, bad: false }
    img.onload = () => { e.ok = true; if (NOTIFY) NOTIFY() }
    img.onerror = () => { e.bad = true; if (NOTIFY) NOTIFY() }
    img.src = `${FIG}/${SRC[key]}`
    CACHE.set(key, e)
  }
  ensureSwitchArt()
}

export function benchPhotosReady() {
  return Object.keys(SRC).every((k) => CACHE.get(k)?.ok)
}

/* ── 版式：①迷你台与 Tab2 实验台共用一份，靠 dev 缩放器材大小 ── */
export function benchLayout(c, k, dev = 1) {
  const d = k * dev
  const S = (key) => ({ w: DEV[key].w * d, h: DEV[key].h * d })
  const yT = c.y + 0.30 * c.h
  const benchY = c.y + c.h - 0.185 * c.h

  const bulb = { ...S('bulb'), x: c.x + 0.115 * c.w, y: 0 }
  bulb.y = yT - (DEV.bulb.t.a[1] / DEV.bulb.h) * bulb.h
  // 电流表不贴右边缘，留在右上、离边框一截，右边留给「电流表 → 滑变」那条大弧
  const a = { ...S('a'), x: c.x + 0.63 * c.w - (DEV.a.w * d) / 2, y: 0 }
  a.y = yT - (DEV.a.t.neg[1] / DEV.a.h) * a.h
  const v = { ...S('v'), x: 0, y: 0 }
  // 电压表压在灯泡下方：让它的「−」柱与灯泡 1 号柱同一根竖线，两根引线都不会拐弯
  v.x = bulb.x + (DEV.bulb.t.a[0] / DEV.bulb.w) * bulb.w - (DEV.v.t.neg[0] / DEV.v.w) * v.w
  v.y = yT + 0.56 * v.h

  const rh = { ...S('rh'), x: c.x + 0.78 * c.w - (DEV.rh.w * d) / 2, y: 0 }
  rh.y = benchY - rh.h
  // 开关单独摆在底部中间（与电池、滑变都隔开一段），照参考图那条「电池—开关—滑变」
  const sw = { ...S('sw'), x: c.x + 0.42 * c.w - (DEV.sw.w * d) / 2, y: 0 }
  // 照片 226×158 → 176×123（上缘比视图框高 13，柱仍落在 110 框的 y=82）
  sw.y = benchY - sw.h
  const bat = { ...S('bat'), x: c.x + 0.05 * c.w, y: 0 }
  bat.y = benchY - bat.h

  const pt = (b, key, id) => [
    b.x + (DEV[key].t[id][0] / DEV[key].w) * b.w,
    b.y + (DEV[key].t[id][1] / DEV[key].h) * b.h,
  ]

  return {
    d, yT, benchY, bulb, v, a, sw, rh, bat,
    vN: pt(v, 'v', 'neg'), vP: pt(v, 'v', 'mid'),
    bA: pt(bulb, 'bulb', 'a'), bB: pt(bulb, 'bulb', 'b'),
    aN: pt(a, 'a', 'neg'), aP: pt(a, 'a', 'mid'),
    sA: pt(sw, 'sw', 'a'), sB: pt(sw, 'sw', 'b'),
    rL: pt(rh, 'rh', 'tl'), rR: pt(rh, 'rh', 'tr'),
    rBL: pt(rh, 'rh', 'bl'), rBR: pt(rh, 'rh', 'br'),
    pN: pt(bat, 'bat', 'n'), pP: pt(bat, 'bat', 'p'),
  }
}

/* 滑片在瓷筒上的横坐标（0..1 → 绕线两端） */
export function wiperXOf(L, ratio) {
  const a = DEV.rh.coil[0] / DEV.rh.w
  const b = DEV.rh.coil[1] / DEV.rh.w
  return L.rh.x + (a + clamp(ratio, 0, 1) * (b - a)) * L.rh.w
}

/* ── 单件器材 ── */
function photo(ctx, key, x, y, w, h) {
  const e = CACHE.get(key)
  if (e && e.ok) {
    ctx.drawImage(e.img, x, y, w, h)
    return true
  }
  ctx.save()
  ctx.fillStyle = '#EDF2F5'
  ctx.strokeStyle = '#DCE5EA'
  ctx.lineWidth = 1
  rr(ctx, x, y, w, h, Math.min(8, h / 6))
  ctx.fill()
  ctx.stroke()
  ctx.restore()
  return false
}

/* 表盘：照片里那根指针拿不掉，所以照 electricSvgInstruments 的做法把整个盘面盖住重画
 * （那边也是「照片只提供机壳和柱，盘面用 meterFaceSVG 重绘」）。
 * 角度沿用实测：0 位 243.5°、满偏 322.2°（以正上方为 0、右为正） */
/* 表头：机壳、表盘、刻度、数字全部用实拍图（*_n.png 已把原图的指针去掉），
 * 这里只画「会动的红指针 + 轴心」。角度沿用实测：0 位 −26.5°、满偏 +52.2° */
function drawNeedle(ctx, b, key, frac) {
  const D = DEV[key]
  const f = clamp(frac || 0, -0.28, 1)
  const K = b.w / 256
  const hx = b.x + D.hub[0] * b.w
  const hy = b.y + D.hub[1] * b.h
  const L = D.len * b.h
  const ang = ((D.ang0 + f * D.span) * Math.PI) / 180
  const nx = Math.sin(ang)
  const ny = -Math.cos(ang)
  const px = -ny
  const py = nx
  const tipX = hx + nx * L
  const tipY = hy + ny * L
  ctx.save()
  ctx.lineCap = 'round'
  // 针影（像真的指针压在盘面上）
  ctx.strokeStyle = 'rgba(96,104,110,0.26)'
  ctx.lineWidth = Math.max(1, 2.5 * K)
  ctx.beginPath()
  ctx.moveTo(hx + 1.1 * K, hy + 1.1 * K)
  ctx.lineTo(tipX + 1.1 * K, tipY + 1.1 * K)
  ctx.stroke()
  // 针身
  ctx.strokeStyle = '#D81E24'
  ctx.lineWidth = Math.max(1.1, 2.1 * K)
  ctx.beginPath()
  ctx.moveTo(hx, hy)
  ctx.lineTo(tipX, tipY)
  ctx.stroke()
  // 针身侧光（原图的指针是亮面细条）
  ctx.strokeStyle = 'rgba(255,255,255,0.62)'
  ctx.lineWidth = Math.max(0.6, 0.7 * K)
  ctx.beginPath()
  ctx.moveTo(hx + px * 0.9 * K, hy + py * 0.9 * K)
  ctx.lineTo(tipX + px * 0.9 * K, tipY + py * 0.9 * K)
  ctx.stroke()
  // 轴心
  const r = 11 * K
  const g = ctx.createRadialGradient(hx - r * 0.3, hy - r * 0.35, r * 0.12, hx, hy, r)
  g.addColorStop(0, '#FBFCFC')
  g.addColorStop(0.55, '#DDE1E3')
  g.addColorStop(1, '#AEB4B9')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(hx, hy, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(120,128,134,0.7)'
  ctx.lineWidth = Math.max(0.7, 1 * K)
  ctx.stroke()
  ctx.fillStyle = 'rgba(146,152,158,0.9)'
  ctx.beginPath()
  ctx.arc(hx, hy, 3 * K, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawMeter(ctx, b, key, frac) {
  photo(ctx, key, b.x, b.y, b.w, b.h)
  drawNeedle(ctx, b, key, frac)
}

function drawBulbArt(ctx, b, bright) {
  const sx = b.w / DEV.bulb.w
  const gx = b.x + DEV.bulb.glass[0] * sx
  const gy = b.y + DEV.bulb.glass[1] * sx
  const gr = DEV.bulb.glass[2] * sx
  const fx = b.x + DEV.bulb.fil[0] * sx
  const fy = b.y + DEV.bulb.fil[1] * sx
  const b2 = Math.min(1, Math.max(0, bright))

  // ① 罩外的暖光：先铺在背景上，亮起来时灯罩周围有一圈 amber
  if (b2 > 0.02) {
    const g = ctx.createRadialGradient(gx, gy, gr * 0.9, gx, gy, gr * 1.9)
    g.addColorStop(0, `rgba(255,206,120,${(0.34 * b2).toFixed(3)})`)
    g.addColorStop(1, 'rgba(255,196,110,0)')
    ctx.save()
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(gx, gy, gr * 1.9, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  photo(ctx, 'bulb', b.x, b.y, b.w, b.h)

  if (b2 > 0.02) {
    // ② 罩内染色：白玻璃在 multiply 下变成琥珀色，像灯丝把罩子照亮
    ctx.save()
    ctx.globalCompositeOperation = 'multiply'
    const g = ctx.createRadialGradient(fx, fy, 0, gx, gy, gr * 0.98)
    g.addColorStop(0, `rgba(255,188,92,${(0.74 * b2).toFixed(3)})`)
    g.addColorStop(0.6, `rgba(255,206,140,${(0.46 * b2).toFixed(3)})`)
    g.addColorStop(1, 'rgba(255,236,214,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(gx, gy, gr * 0.98, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // ③ 灯丝亮核：正常叠加，白偏黄的小亮斑
    const cr = (5 + 7 * b2) * sx
    ctx.save()
    const cg = ctx.createRadialGradient(fx, fy, 0, fx, fy, cr)
    cg.addColorStop(0, `rgba(255,252,232,${(0.95 * b2).toFixed(3)})`)
    cg.addColorStop(0.45, `rgba(255,224,150,${(0.55 * b2).toFixed(3)})`)
    cg.addColorStop(1, 'rgba(255,196,110,0)')
    ctx.fillStyle = cg
    ctx.beginPath()
    ctx.arc(fx, fy, cr, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

function drawRheostatArt(ctx, L, ratio, live) {
  const b = L.rh
  const sx = b.w / DEV.rh.w
  const sy = b.h / DEV.rh.h
  photo(ctx, 'rh', b.x, b.y, b.w, b.h)
  // 通电段：瓷筒上的绕线着金黄（照片是灰金属色，用 multiply 压出暖调）
  const x0 = b.x + DEV.rh.coil[0] * sx
  const xw = wiperXOf(L, ratio)
  if (live) {
    const seg0 = Math.min(x0, xw)
    const seg1 = Math.max(x0, xw)
    const y0 = b.y + 16.5 * sy
    const y1 = b.y + 50 * sy
    ctx.save()
    ctx.globalCompositeOperation = 'multiply'
    // 上下两端淡出，边缘正好落在瓷筒的轮廓里，不会露出黄边
    const gg = ctx.createLinearGradient(0, y0, 0, y1)
    gg.addColorStop(0, 'rgba(255,196,64,0)')
    gg.addColorStop(0.22, 'rgba(255,196,64,0.58)')
    gg.addColorStop(0.78, 'rgba(255,196,64,0.58)')
    gg.addColorStop(1, 'rgba(255,196,64,0)')
    ctx.fillStyle = gg
    rr(ctx, seg0, y0, Math.max(2, seg1 - seg0), y1 - y0, 3)
    ctx.fill()
    ctx.restore()
  }
  // 滑片（矢量补件）：落影 → 压板 → 两根钢触臂 → 黑柄
  const rodY = b.y + DEV.rh.rod * sy
  ctx.save()
  ctx.fillStyle = 'rgba(11,17,24,0.16)'
  ctx.beginPath()
  ctx.ellipse(xw, b.y + 19.6 * sy, 7.6 * sx, 8.2 * sy, 0, 0, Math.PI * 2)
  ctx.fill()
  const gpl = ctx.createLinearGradient(xw, b.y + 6 * sy, xw, b.y + 28 * sy)
  gpl.addColorStop(0, '#A7B5C3')
  gpl.addColorStop(0.48, '#E3EBF3')
  gpl.addColorStop(1, '#FBFDFF')
  ctx.fillStyle = gpl
  ctx.strokeStyle = 'rgba(125,136,148,0.9)'
  ctx.lineWidth = Math.max(0.6, 0.55 * sy)
  ctx.beginPath()
  ctx.moveTo(xw - 6.4 * sx, b.y + 6.6 * sy)
  ctx.lineTo(xw + 6.4 * sx, b.y + 6.6 * sy)
  ctx.lineTo(xw + 6.4 * sx, b.y + 20.6 * sy)
  ctx.quadraticCurveTo(xw + 6.4 * sx, b.y + 27.6 * sy, xw, b.y + 27.6 * sy)
  ctx.quadraticCurveTo(xw - 6.4 * sx, b.y + 27.6 * sy, xw - 6.4 * sx, b.y + 20.6 * sy)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  // 钢触臂 + 触头
  const arm = ctx.createLinearGradient(xw - 8 * sx, 0, xw + 8 * sx, 0)
  arm.addColorStop(0, '#9AA5B1')
  arm.addColorStop(0.5, '#E4EAF0')
  arm.addColorStop(1, '#8D98A4')
  ctx.fillStyle = arm
  ctx.strokeStyle = '#6F7A86'
  ctx.lineWidth = Math.max(0.4, 0.45 * sy)
  for (const dx of [-8.0, 6.1]) {
    rr(ctx, xw + dx * sx, b.y + 5.4 * sy, 1.9 * sx, 10.4 * sy, 0.9 * sy)
    ctx.fill()
    ctx.stroke()
  }
  ctx.fillStyle = '#2F363E'
  for (const dx of [-7.05, 7.05]) {
    ctx.beginPath()
    ctx.arc(xw + dx * sx, b.y + 15.4 * sy, 1.35 * sx, 0, Math.PI * 2)
    ctx.fill()
  }
  // 黑柄
  const gh = ctx.createLinearGradient(0, rodY - 5.3 * sy, 0, rodY + 0.9 * sy)
  gh.addColorStop(0, '#4B515A')
  gh.addColorStop(0.55, '#2A2E34')
  gh.addColorStop(1, '#121417')
  ctx.fillStyle = gh
  ctx.strokeStyle = '#0B0D10'
  ctx.lineWidth = Math.max(0.6, 0.9 * sy)
  rr(ctx, xw - 8.4 * sx, rodY - 5.3 * sy, 16.8 * sx, 6.2 * sy, 2.6 * sy)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = 'rgba(90,96,106,0.55)'
  rr(ctx, xw - 4.8 * sx, rodY - 3.7 * sy, 9.6 * sx, 1.3 * sy, 0.65 * sy)
  ctx.fill()
  ctx.restore()
}

/* 开关 = 「自己动手」台面上那把（TYPES.switch 矢量，开/合两帧光栅化）；
 * 矢量图还没解码完就退回上一版「照片 + 自绘闸刀」，不闪空。 */
function drawSwitchArt(ctx, b, closed) {
  const e = SW_ART[closed ? 'closed' : 'open']
  if (e && e.ok) {
    ctx.drawImage(e.img, b.x, b.y, b.w, b.h)
    return
  }
  drawSwitchArtLegacy(ctx, b, closed)
}

function drawSwitchArtLegacy(ctx, b, closed) {
  // 照片 226×158：按 176 宽铺开＝123 高，底座下缘对齐视图框底（110）
  const sy = b.h / DEV.sw.h
  const ph = 123 * sy
  photo(ctx, 'sw', b.x, b.y - 13 * sy, b.w, ph)
  // 柱子坐标（与接线柱一致）：黑柱 a、红柱 b，闸刀落在两柱之间那条线上
  const ax = b.x + (DEV.sw.t.a[0] / DEV.sw.w) * b.w
  const bx2 = b.x + (DEV.sw.t.b[0] / DEV.sw.w) * b.w
  const by = b.y + (DEV.sw.t.a[1] / DEV.sw.h) * b.h
  const baseY = b.y + (DEV.sw.base / DEV.sw.h) * b.h
  const pivotX = ax + 15 * sy
  const pivotY = by - 2 * sy
  const bladeL = bx2 - pivotX - 5 * sy
  const ang = closed ? 0 : -0.46
  ctx.save()
  ctx.translate(pivotX, pivotY)
  ctx.rotate(ang)
  // 闸刀：银灰厚刀片（上缘受光、下缘压暗），端头黑柄
  const gb = ctx.createLinearGradient(0, -4.6 * sy, 0, 4.6 * sy)
  gb.addColorStop(0, '#FDFEFF')
  gb.addColorStop(0.18, '#E6EBEF')
  gb.addColorStop(0.62, '#B7C1C9')
  gb.addColorStop(1, '#78838E')
  ctx.fillStyle = gb
  ctx.strokeStyle = 'rgba(74,84,94,0.85)'
  ctx.lineWidth = Math.max(0.6, 0.9 * sy)
  rr(ctx, 0, -4.6 * sy, bladeL, 9.2 * sy, 3.2 * sy)
  ctx.fill()
  ctx.stroke()
  // 刀身边缘的一条高光，别让银条看起来像塑料
  ctx.fillStyle = 'rgba(255,255,255,0.72)'
  rr(ctx, 2 * sy, -3.4 * sy, bladeL - 4 * sy, 1.5 * sy, 0.8 * sy)
  ctx.fill()
  // 黑柄（照图标：厚胶木柄，端头略收）
  const hx0 = bladeL - 28 * sy
  const gk = ctx.createLinearGradient(0, -7.4 * sy, 0, 7.4 * sy)
  gk.addColorStop(0, '#5A6068')
  gk.addColorStop(0.42, '#2C3238')
  gk.addColorStop(1, '#15181B')
  ctx.fillStyle = gk
  ctx.strokeStyle = 'rgba(20,22,25,0.9)'
  ctx.lineWidth = Math.max(0.6, 0.8 * sy)
  rr(ctx, hx0, -7.4 * sy, 31 * sy, 14.8 * sy, 4 * sy)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.16)'
  rr(ctx, hx0 + 3 * sy, -6.4 * sy, 23 * sy, 2.4 * sy, 1.2 * sy)
  ctx.fill()
  ctx.restore()

  // 铰链立柱 + 转轴（不随闸刀转，压在刀根上）
  const gpost = ctx.createLinearGradient(pivotX - 6 * sy, 0, pivotX + 6 * sy, 0)
  gpost.addColorStop(0, '#8C959D')
  gpost.addColorStop(0.35, '#D6DCE1')
  gpost.addColorStop(0.72, '#AAB3BB')
  gpost.addColorStop(1, '#7B858E')
  ctx.save()
  ctx.fillStyle = gpost
  ctx.strokeStyle = 'rgba(70,78,86,0.75)'
  ctx.lineWidth = Math.max(0.5, 0.7 * sy)
  rr(ctx, pivotX - 5.5 * sy, pivotY, 11 * sy, baseY - pivotY + 1 * sy, 3 * sy)
  ctx.fill()
  ctx.stroke()
  // 转轴螺钉
  const gs = ctx.createRadialGradient(pivotX - 1.4 * sy, pivotY - 1.6 * sy, 0.4 * sy, pivotX, pivotY, 5.2 * sy)
  gs.addColorStop(0, '#FDFEFF')
  gs.addColorStop(0.6, '#C9D0D6')
  gs.addColorStop(1, '#8B949C')
  ctx.fillStyle = gs
  ctx.beginPath()
  ctx.arc(pivotX, pivotY, 5.2 * sy, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(88,96,104,0.8)'
  ctx.lineWidth = Math.max(0.5, 0.7 * sy)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(96,104,112,0.75)'
  ctx.lineWidth = Math.max(0.5, 0.9 * sy)
  ctx.beginPath()
  ctx.moveTo(pivotX - 2.6 * sy, pivotY + 1.8 * sy)
  ctx.lineTo(pivotX + 2.6 * sy, pivotY - 1.8 * sy)
  ctx.stroke()
  ctx.restore()
  // 合上时刀刃压在红柱上：补一点暗影，避免像悬在空中
  if (closed) {
    ctx.save()
    ctx.fillStyle = 'rgba(60,40,30,0.18)'
    ctx.beginPath()
    ctx.ellipse(bx2, by + 3 * sy, 9 * sy, 3 * sy, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

function drawBatteryArt(ctx, b, k) {
  const sy = b.h / DEV.bat.h
  photo(ctx, 'bat', b.x, b.y, b.w, (DEV.bat.photoH) * sy)
  T(ctx, `${3} V 学生电源`, b.x, b.y - 7 * k, { size: Math.round(9 * k), color: '#6B7A83' })
}

function dot(ctx, p, k) {
  ctx.fillStyle = '#2C3841'
  ctx.beginPath()
  ctx.arc(p[0], p[1], 2.6 * k, 0, Math.PI * 2)
  ctx.fill()
}

/* ── 主绘制 ── */
export function drawPhotoBench(ctx, c, s, calc, k, o = {}) {
  const dev = o.dev || 1
  const L = benchLayout(c, k, dev)
  const lw = Math.max(3.0, 4.4 * k * dev)      // 线芯直径（外皮再 +1.9）
  const gap = Math.max(20, 38 * k * dev)       // 相邻黄点的弧长间距（照「自己动手」的电子流）
  const spd = 120 * k * dev                    // 黄点流速（px/s）
  const tNow = s.time || 0
  const red = '#E5352B'                        // 与「自己动手」那套红导线同色
  const dark = '#1F2937'

  /* 二次贝塞尔按弧长采样：黄点要沿电缆等距流动，不能按参数 t 均分（那样两头会挤） */
  const sampler = (p, cxp, cyp, q) => {
    const N = 26
    const pts = [{ x: p[0], y: p[1], s: 0 }]
    let s = 0
    for (let i = 1; i <= N; i++) {
      const t = i / N
      const mt = 1 - t
      const x = mt * mt * p[0] + 2 * mt * t * cxp + t * t * q[0]
      const y = mt * mt * p[1] + 2 * mt * t * cyp + t * t * q[1]
      s += Math.hypot(x - pts[i - 1].x, y - pts[i - 1].y)
      pts.push({ x, y, s })
    }
    return { pts, len: s }
  }
  const atArc = (g, dist) => {
    const total = g.len || 1
    const d = ((dist % total) + total) % total
    const pts = g.pts
    let lo = 0
    let hi = pts.length - 1
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1
      if (pts[mid].s <= d) lo = mid; else hi = mid
    }
    const a = pts[lo]
    const b = pts[hi]
    const kk = b.s > a.s ? (d - a.s) / (b.s - a.s) : 0
    return { x: a.x + (b.x - a.x) * kk, y: a.y + (b.y - a.y) * kk }
  }
  /* 端头「裸铜丝绕在柱脚上」：照 wireSvg.wrapLayers 的样子，两匝半椭圆 + 一小截线头 */
  const wrapCopper = (pt, dir) => {
    const rx = lw * 1.16
    const ry = lw * 0.46
    ctx.save()
    ctx.lineWidth = Math.max(0.9, lw * 0.22)
    for (let i = 0; i < 2; i++) {
      const yy = pt[1] - i * lw * 0.62 + lw * 0.10
      ctx.strokeStyle = '#4A2E12'
      ctx.beginPath()
      ctx.ellipse(pt[0], yy + 0.8, rx, ry, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = '#C07A30'
      ctx.beginPath()
      ctx.ellipse(pt[0], yy, rx, ry, 0, Math.PI * 1.15, Math.PI * 2.05)
      ctx.stroke()
      ctx.beginPath()
      ctx.ellipse(pt[0], yy, rx, ry, 0, -Math.PI * 0.15, Math.PI * 0.95)
      ctx.stroke()
      ctx.strokeStyle = '#F0C897'
      ctx.beginPath()
      ctx.ellipse(pt[0], yy - lw * 0.10, rx * 0.9, ry * 0.9, 0, Math.PI * 1.2, Math.PI * 1.85)
      ctx.stroke()
    }
    ctx.restore()
    ctx.save()
    ctx.strokeStyle = '#C07A30'
    ctx.lineWidth = Math.max(0.9, lw * 0.2)
    ctx.beginPath()
    ctx.moveTo(pt[0] + dir * rx * 0.8, pt[1] + ry * 0.5)
    ctx.quadraticCurveTo(pt[0] + dir * (rx + lw * 0.5), pt[1] + lw * 0.3, pt[0] + dir * (rx + lw * 0.9), pt[1] - lw * 0.2)
    ctx.stroke()
    ctx.restore()
  }

  /* 一根电缆：落影 → 外皮 → 本色 → 上偏高光 → 两端裸铜丝 → 黄点
     flow: +1 电流从 p 流向 q，-1 反过来，0 不通电（不画黄点） */
  const cable = (p, q, color, bow, flow = 0) => {
    const dx = q[0] - p[0]
    const dy = q[1] - p[1]
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    const cxp = (p[0] + q[0]) / 2 + nx * bow
    const cyp = (p[1] + q[1]) / 2 + ny * bow
    const g = sampler(p, cxp, cyp, q)
    const casing = shade(color, -0.5)
    const sheen = shade(color, 0.85)
    const path = (dyOff) => {
      ctx.beginPath()
      ctx.moveTo(p[0], p[1] + dyOff)
      ctx.quadraticCurveTo(cxp, cyp + dyOff, q[0], q[1] + dyOff)
      ctx.stroke()
    }
    ctx.save()
    ctx.lineCap = 'round'
    ctx.strokeStyle = 'rgba(15,23,42,0.20)'
    ctx.lineWidth = lw + 3.0
    path(2.6)
    ctx.strokeStyle = casing
    ctx.lineWidth = lw + 1.9
    path(0)
    ctx.strokeStyle = color
    ctx.lineWidth = lw
    path(0)
    ctx.strokeStyle = sheen
    ctx.lineWidth = Math.max(1, lw * 0.32)
    ctx.globalAlpha = 0.62
    path(-lw * 0.26)
    ctx.globalAlpha = 1
    ctx.restore()
    const sgn = (v) => (v >= 0 ? 1 : -1)
    wrapCopper(p, -sgn(cxp - p[0]))
    wrapCopper(q, sgn(cxp - q[0]))
    if (!flow || g.len < 34) return
    const n = Math.max(1, Math.round(g.len / gap))
    const step = g.len / n
    ctx.save()
    for (let i = 0; i < n; i++) {
      const pos = tNow * spd * flow + i * step
      const pt = atArc(g, pos)
      ctx.fillStyle = 'rgba(255,213,74,0.34)'
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, lw * 0.78, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#FFD54A'
      ctx.strokeStyle = '#8A6A00'
      ctx.lineWidth = 0.9
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, lw * 0.50, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#5F4700'
      ctx.beginPath()
      ctx.ellipse(pt.x, pt.y, lw * 0.34, lw * 0.14, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  if (!benchPhotosReady()) {
    ctx.save()
    ctx.fillStyle = '#F4F8FA'
    rr(ctx, c.x, c.y, c.w, c.h, 12)
    ctx.fill()
    ctx.restore()
    T(ctx, '器材图加载中…', c.x + c.w / 2, c.y + c.h / 2, { size: Math.round(13 * k), color: '#7A8790', align: 'center' })
    return L
  }

  // ── 导线：柱到柱（先画线，器材压住线的中段，等于线走在器材后面） ──
  const on = s.closed ? 1 : 0                   // 断开时不画黄点（真的没有电流）
  cable(L.vN, L.bA, dark, 0, on * 1)            // 电压表 − ↔ 灯泡 1（电流 vN → bA）
  cable(L.vP, L.bB, red, 14, on * -1)           // 电压表 3V ↔ 灯泡 2（短弧回到灯脚）
  cable(L.bB, L.aN, red, -36, on * 1)           // 灯泡 2 ↔ 电流表 −（顶部小拱）
  cable(L.aP, L.rR, red, -76, on * -1)          // 电流表 0.6A ↔ 滑变上右（滑片端）：贴着右缘的大弧
  cable(L.bA, L.pN, dark, 60, on * 1)           // 灯泡 1 ↔ 电源 −：沿左缘包一大圈
  cable(L.pP, L.sA, red, 0, on * 1)             // 电源 + ↔ 开关
  cable(L.sB, L.rBL, red, 26, on * 1)           // 开关 ↔ 滑变下左：限流接法只接两端（下左 + 滑片上右）

  // ── 器材 ──
  drawBulbArt(ctx, L.bulb, clamp(calc.P / (2.5 * 0.3), 0, 1))
  drawMeter(ctx, L.v, 'v', o.vFrac ?? (s.closed ? calc.U / 3 : 0))
  drawMeter(ctx, L.a, 'a', o.aFrac ?? (s.closed ? calc.I / 0.6 : 0))
  drawSwitchArt(ctx, L.sw, s.closed)
  drawRheostatArt(ctx, L, o.ratio ?? s.ratio, !!s.closed)
  drawBatteryArt(ctx, L.bat, k)

  // ── 柱 + 标注 ──
  for (const p of [L.vN, L.vP, L.bA, L.bB, L.aN, L.aP, L.sA, L.sB, L.rL, L.rR, L.rBL, L.rBR, L.pN, L.pP]) dot(ctx, p, k * dev)
  const fs = Math.round(9 * k * Math.max(0.82, dev))
  const cap = o.caption !== false
  if (cap) {
    T(ctx, `小灯泡 2.5 V 0.3 A`, L.bulb.x + L.bulb.w / 2, L.bulb.y - 9 * k * dev, {
      size: Math.round(9.5 * k * Math.max(0.82, dev)), color: '#25313A', align: 'center', bold: true,
    })
    T(ctx, `电压表（并在灯上）`, L.v.x + L.v.w / 2, L.v.y + L.v.h + 12 * k * dev, {
      size: fs, color: '#4B5A66', align: 'center',
    })
    T(ctx, `电流表 0~0.6 A（外接）`, L.a.x + L.a.w / 2, L.a.y - 9 * k * dev, {
      size: fs, color: '#B3261E', align: 'center', bold: true,
    })
    T(ctx, `滑变 ${20} Ω`, L.rh.x + L.rh.w / 2, L.rh.y - 9 * k * dev, {
      size: fs, color: '#6B7A83', align: 'center',
    })
  }

  // 滑片位置读数（小幅贴在滑变下方）：限流接法里这个位置就是串进回路的电阻
  if (cap) {
    const pos = o.ratio ?? s.ratio
    T(ctx, `滑片 ${(pos * 100).toFixed(0)}%　R = ${(20 * pos).toFixed(1)} Ω`,
      L.rh.x + L.rh.w, L.rh.y + L.rh.h + 12 * k * dev, {
        size: fs, color: s.closed ? '#1565C0' : '#8A9AA4', align: 'right', bold: !!s.closed,
      })
  }
  return L
}

