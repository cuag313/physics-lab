/**
 * emfArt — 「测量电源电动势和内阻」专用美术件
 *
 * 只放这一课独有的两件：
 *   ① drawBatterySection 干电池剖面（Tab1 讲 ε 与 r 的来源，可点部位高亮）
 *   ② drawUIChart        U-I 图像卡（Tab1 演示 / Tab2 记录点 + 拟合直线共用）
 * 其余器材（电池组、闸刀、滑动变阻器、电表、导线）一律走 labArtKit 共享件。
 */
import { rr, T, line, hexA, softCard, chip, clamp } from './labArtKit'

const BRASS = '#C9A24B'
const ZINC = '#B9BFC4'

/**
 * 干电池剖面（竖放）
 * b: 外接矩形；k: 缩放；o.focus: 高亮部位索引（-1 无）
 * 返回各部位的点击中心 { rod, paste, shell, electrolyte }
 */
export function drawBatterySection(ctx, b, k, o = {}) {
  const focus = o.focus == null ? -1 : o.focus
  const cw = b.w * 0.46
  const ch = b.h * 0.80
  const cx = b.x + b.w * 0.42
  const cy = b.y + b.h * 0.52
  const x0 = cx - cw / 2
  const y0 = cy - ch / 2
  const rrR = Math.max(6, cw * 0.10)

  ctx.save()
  // 投影
  ctx.fillStyle = 'rgba(40,58,48,0.14)'
  rr(ctx, x0 + 5, y0 + 7, cw, ch, rrR)
  ctx.fill()

  // 锌筒外壳
  const shellG = ctx.createLinearGradient(x0, y0, x0 + cw, y0)
  shellG.addColorStop(0, '#8E979D')
  shellG.addColorStop(0.16, ZINC)
  shellG.addColorStop(0.45, '#E3E7EA')
  shellG.addColorStop(0.78, '#A7B0B6')
  shellG.addColorStop(1, '#7C858B')
  ctx.fillStyle = focus === 2 ? '#DCE6EE' : shellG
  rr(ctx, x0, y0, cw, ch, rrR)
  ctx.fill()
  ctx.strokeStyle = focus === 2 ? '#4C97E8' : '#6E777D'
  ctx.lineWidth = focus === 2 ? 2 : 1.2
  rr(ctx, x0, y0, cw, ch, rrR)
  ctx.stroke()

  // 顶部铜帽 + 正极
  const capW = cw * 0.34
  ctx.fillStyle = BRASS
  rr(ctx, cx - capW / 2, y0 - ch * 0.045, capW, ch * 0.052, 3)
  ctx.fill()
  ctx.strokeStyle = '#8E6E29'
  ctx.lineWidth = 1
  ctx.stroke()
  T(ctx, '+', cx, y0 - ch * 0.058, { size: Math.round(11 * k), color: '#C62828', align: 'center', bold: true })

  // 内部空腔
  const ix = x0 + cw * 0.10
  const iy = y0 + ch * 0.055
  const iw = cw * 0.80
  const ih = ch * 0.875
  // 电解液/糊
  ctx.fillStyle = focus === 3 ? '#DDF1F6' : '#EDF4F1'
  rr(ctx, ix, iy, iw, ih, rrR * 0.7)
  ctx.fill()
  // MnO₂ 浆（紧贴碳棒外）
  ctx.fillStyle = focus === 1 ? '#7A5A46' : '#5E4436'
  rr(ctx, ix + iw * 0.16, iy + ih * 0.03, iw * 0.68, ih * 0.94, rrR * 0.6)
  ctx.fill()

  // 碳棒
  const rodW = iw * 0.18
  const rodG = ctx.createLinearGradient(cx - rodW / 2, 0, cx + rodW / 2, 0)
  rodG.addColorStop(0, '#2A2E32')
  rodG.addColorStop(0.4, '#4B5257')
  rodG.addColorStop(1, '#1D2124')
  ctx.fillStyle = focus === 0 ? '#3D4850' : rodG
  rr(ctx, cx - rodW / 2, iy + ih * 0.02, rodW, ih * 0.90, 2)
  ctx.fill()
  ctx.strokeStyle = focus === 0 ? '#4C97E8' : 'rgba(10,14,18,0.7)'
  ctx.lineWidth = focus === 0 ? 2 : 1
  ctx.stroke()

  // 顶部封口 + 密封圈
  ctx.fillStyle = '#7C6A55'
  rr(ctx, x0 + cw * 0.06, y0 + ch * 0.012, cw * 0.88, ch * 0.030, 2)
  ctx.fill()
  // 底部锌筒底
  ctx.fillStyle = BRASS
  rr(ctx, x0 + cw * 0.02, y0 + ch * 0.955, cw * 0.96, ch * 0.035, 2)
  ctx.fill()
  T(ctx, '−', cx, y0 + ch * 1.020, { size: Math.round(11 * k), color: '#1565C0', align: 'center', bold: true })

  // 铭牌（贴在筒身下部，避开碳棒与引线）
  ctx.fillStyle = 'rgba(255,255,255,0.88)'
  rr(ctx, x0 + cw * 0.08, y0 + ch * 0.855, cw * 0.84, ch * 0.085, 4)
  ctx.fill()
  T(ctx, '1.5 V　R6 / AA', cx, y0 + ch * 0.898, { size: Math.round(8.6 * k), color: '#41505B', align: 'center', bold: true })

  // 部位标注（引线到右侧）
  const marks = [
    { n: 1, t: '碳棒（正极）', px: cx, py: iy + ih * 0.16 },
    { n: 2, t: 'MnO₂ 糊状物', px: cx + iw * 0.38, py: iy + ih * 0.52 },
    { n: 3, t: '锌筒（负极）', px: x0 + cw * 0.03, py: y0 + ch * 0.72 },
    { n: 4, t: '电解液（内阻来源）', px: ix + iw * 0.10, py: iy + ih * 0.82 },
  ]
  const armX = b.x + b.w * 0.90
  for (const m of marks) {
    const on = focus === m.n - 1
    const ly = b.y + b.h * (0.16 + (m.n - 1) * 0.20)
    line(ctx, m.px, m.py, armX - 6, ly, on ? '#4C97E8' : 'rgba(90,110,120,0.55)', on ? 1.6 : 1)
    ctx.fillStyle = on ? '#4C97E8' : '#5E6B75'
    ctx.beginPath()
    ctx.arc(armX - 6, ly, 2.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = on ? '#4C97E8' : '#EFE7DA'
    ctx.beginPath()
    ctx.arc(armX + 8, ly, 8.5 * k, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = on ? '#2472C8' : '#C9B48E'
    ctx.lineWidth = 1.2
    ctx.stroke()
    T(ctx, String(m.n), armX + 8, ly, { size: Math.round(8.5 * k), color: on ? '#fff' : '#7A6440', align: 'center', bold: true })
    T(ctx, m.t, armX + 20, ly, { size: Math.round(9 * k), color: on ? '#1565C0' : '#4B5A66', bold: on })
  }
  ctx.restore()

  return {
    parts: {
      rod: { x: cx, y: iy + ih * 0.18, r: Math.max(10, rodW * 1.4) },
      paste: { x: cx + iw * 0.36, y: iy + ih * 0.50, r: Math.max(12, iw * 0.20) },
      shell: { x: x0 + cw * 0.05, y: y0 + ch * 0.62, r: Math.max(10, cw * 0.10) },
      electrolyte: { x: ix + iw * 0.12, y: iy + ih * 0.83, r: Math.max(10, iw * 0.12) },
    },
  }
}

/**
 * U-I 图像卡
 * o: { points, E, r, fit, op, title, showFormula, recordButton }
 * 返回 { plot:{x,y,w,h}, btn:{x,y,w,h}|null }
 */
export function drawUIChart(ctx, box, k, o = {}) {
  softCard(ctx, box.x, box.y, box.w, box.h, '#FFFFFF', '#DFE7EC')
  const title = o.title == null ? 'U-I 图像' : o.title
  if (title) {
    T(ctx, title, box.x + 14 * k, box.y + 20 * k, {
      size: Math.round(11.5 * k), bold: true, color: '#25313A',
    })
  }
  if (o.subtitle) {
    T(ctx, o.subtitle, box.x + box.w - 14 * k, box.y + 20 * k, {
      size: Math.round(9 * k), color: '#8A959C', align: 'right',
    })
  }

  const padL = box.x + 54 * k
  const padB = box.y + box.h - 52 * k
  const padR = box.x + box.w - 26 * k
  const padT = box.y + 42 * k
  const plot = { x: padL, y: padT, w: padR - padL, h: padB - padT }

  const xMax = 0.55
  const yMax = 3.2
  const px = (v) => plot.x + clamp(v / xMax, 0, 1) * plot.w
  const py = (v) => plot.y + plot.h - clamp(v / yMax, 0, 1) * plot.h

  // 网格
  ctx.save()
  ctx.strokeStyle = 'rgba(120,150,170,0.22)'
  ctx.lineWidth = 1
  for (let i = 0; i <= 5; i++) {
    const gx = plot.x + (i / 5) * plot.w
    line(ctx, gx, plot.y, gx, plot.y + plot.h, 'rgba(120,150,170,0.16)', 1)
  }
  for (let i = 0; i <= 4; i++) {
    const gy = plot.y + (i / 4) * plot.h
    line(ctx, plot.x, gy, plot.x + plot.w, gy, 'rgba(120,150,170,0.16)', 1)
  }
  // 轴
  line(ctx, plot.x, plot.y + plot.h, plot.x + plot.w, plot.y + plot.h, '#5A6670', 1.2)
  line(ctx, plot.x, plot.y, plot.x, plot.y + plot.h, '#5A6670', 1.2)

  // 刻度
  for (let i = 0; i <= 5; i++) {
    const v = (xMax / 5) * i
    const gx = px(v)
    line(ctx, gx, plot.y + plot.h, gx, plot.y + plot.h + 3, '#8A959C', 1)
    T(ctx, v.toFixed(1), gx, plot.y + plot.h + 13 * k, {
      size: Math.round(8 * k), color: '#6B7A83', align: 'center',
    })
  }
  for (let i = 0; i <= 4; i++) {
    const v = (yMax / 4) * i
    const gy = py(v)
    line(ctx, plot.x, gy, plot.x - 3, gy, '#8A959C', 1)
    T(ctx, v.toFixed(1), plot.x - 8 * k, gy, {
      size: Math.round(8 * k), color: '#6B7A83', align: 'right',
    })
  }
  T(ctx, 'I / A', plot.x + plot.w - 6 * k, plot.y + plot.h - 10 * k, {
    size: Math.round(8.6 * k), color: '#8A959C', align: 'right', bold: true,
  })
  T(ctx, 'U / V', plot.x + plot.w - 6 * k, plot.y + 10 * k, {
    size: Math.round(8.6 * k), color: '#8A959C', align: 'right', bold: true,
  })

  // 理论线 U = E − rI
  if (Number.isFinite(o.E)) {
    const iShort = o.E / (o.r || 0.9)
    line(ctx, px(0), py(o.E), px(Math.min(iShort, xMax)), py(o.E - (o.r || 0.9) * Math.min(iShort, xMax)),
      'rgba(30,107,59,0.55)', 1.4)
  }
  // 拟合线
  if (o.fit) {
    const a = o.fit.a
    const b = o.fit.b
    const iEnd = xMax
    const uEnd = a + b * iEnd
    ctx.save()
    ctx.setLineDash([])
    line(ctx, px(0), py(a), px(iEnd), py(uEnd), '#E0761F', 2.2)
    ctx.restore()
  }

  // 记录点
  for (const p of o.points || []) {
    ctx.fillStyle = '#15803D'
    ctx.beginPath()
    ctx.arc(px(p.I), py(p.U), 3.2 * k, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // 当前工作点
  if (o.op && Number.isFinite(o.op.I) && Number.isFinite(o.op.U)) {
    const ox = px(o.op.I)
    const oy = py(o.op.U)
    ctx.strokeStyle = '#C62828'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(ox, oy, 5.5 * k, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = 'rgba(198,40,40,0.85)'
    ctx.beginPath()
    ctx.arc(ox, oy, 2, 0, Math.PI * 2)
    ctx.fill()
  }

  // 截距标注
  if (o.fit) {
    T(ctx, `ε=${o.fit.a.toFixed(2)} V`, px(0) + 6 * k, py(o.fit.a) - 9 * k, {
      size: Math.round(8.5 * k), color: '#E0761F', bold: true,
    })
  }

  // 记录按钮
  let btn = null
  if (o.recordButton) {
    const bw = box.w * 0.42
    const bh = 26 * k
    btn = { x: box.x + 14 * k, y: box.y + box.h - 34 * k, w: bw, h: bh }
    ctx.fillStyle = o.recordEnabled ? '#15803D' : '#B9C4CB'
    rr(ctx, btn.x, btn.y, btn.w, btn.h, 7)
    ctx.fill()
    T(ctx, '📌 记录这一组', btn.x + btn.w / 2, btn.y + bh / 2, {
      size: Math.round(9.5 * k), color: '#fff', align: 'center', bold: true,
    })
  }
  ctx.restore()
  return { plot, btn, px, py, xMax, yMax }
}

/** 拟合直线（最小二乘）：U = a + b I */
export function fitLine(points) {
  const n = points.length
  if (n < 2) return null
  let si = 0
  let su = 0
  let sii = 0
  let siu = 0
  for (const p of points) {
    si += p.I
    su += p.U
    sii += p.I * p.I
    siu += p.I * p.U
  }
  const den = n * sii - si * si
  if (Math.abs(den) < 1e-9) return null
  const b = (n * siu - si * su) / den
  const a = (su - b * si) / n
  return { a, b, r: -b }
}

/** 数据小表：最近记录 */
export function drawRecordList(ctx, box, k, points, o = {}) {
  softCard(ctx, box.x, box.y, box.w, box.h, '#FFFCF6', '#F2DCC0')
  T(ctx, '记录表', box.x + 12 * k, box.y + 18 * k, {
    size: Math.round(10.5 * k), bold: true, color: '#C2410C',
  })
  T(ctx, `${points.length} 组`, box.x + box.w - 12 * k, box.y + 18 * k, {
    size: Math.round(9 * k), color: '#8A6D3B', align: 'right',
  })
  const rows = points.slice(-4)
  const step = Math.min(22 * k, (box.h - 34 * k) / 4)
  rows.forEach((p, i) => {
    const yy = box.y + 34 * k + i * step
    chip(ctx, box.x + 12 * k, yy - 8 * k, box.w - 24 * k, 16 * k, '', hexA('#C2410C', 0.06), k)
    T(ctx, `I=${p.I.toFixed(2)}A`, box.x + 18 * k, yy, { size: Math.round(8.8 * k), color: '#7A4A22', mono: true })
    T(ctx, `U=${p.U.toFixed(2)}V`, box.x + box.w * 0.55, yy, { size: Math.round(8.8 * k), color: '#7A4A22', mono: true })
  })
  void o
}
