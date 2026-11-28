/**
 * ampereArt — 「探究安培力影响因素」专用美术件
 *
 * 照抖音实验视频的器材口径：
 *   ① drawSupply   可调直流电源（数显电流 + 旋钮 + 电源开关 + 接线柱）
 *   ② drawBalance  0.01 g 无线电子天平（秤盘 + 数显 + 置零键）
 *   ③ drawRig      安培力实验支架：亚克力框 + 角度盘 + U 形磁铁 + 单匝导线 + 磁场箭头
 *   ④ drawChart    三个探究各自的 F–x 图像（F 用天平读数 m/g 表示）
 * 其余（实验台、卡片、按钮）走 labArtKit。
 */
import { rr, T, line, clamp, softCard, chip } from './labArtKit'

const COPPER = '#C0763C'
const ACRYLIC = 'rgba(208,226,234,0.62)'
const ACRYLIC_EDGE = '#A9C2CF'

/* ==================================================================
 *  ① 直流电源
 * ================================================================== */
export function drawSupply(ctx, box, k, o = {}) {
  const { x, y, w, h } = box
  ctx.save()
  ctx.shadowColor = 'rgba(60,80,70,0.16)'
  ctx.shadowBlur = 12
  ctx.shadowOffsetY = 4
  const g = ctx.createLinearGradient(x, y, x, y + h)
  g.addColorStop(0, '#F2F6F8')
  g.addColorStop(1, '#D8E1E7')
  ctx.fillStyle = g
  rr(ctx, x, y, w, h, 12)
  ctx.fill()
  ctx.restore()
  ctx.strokeStyle = '#B7C5CE'
  ctx.lineWidth = 1.2
  rr(ctx, x, y, w, h, 12)
  ctx.stroke()

  // 前面板
  ctx.fillStyle = '#FBFDFE'
  rr(ctx, x + 10, y + 10, w - 20, h * 0.62, 8)
  ctx.fill()

  // 数显
  const lc = { x: x + 20, y: y + 18, w: w - 40, h: 38 }
  ctx.fillStyle = '#0C2A22'
  rr(ctx, lc.x, lc.y, lc.w, lc.h, 5)
  ctx.fill()
  T(ctx, '电流  I', lc.x + 8, lc.y + 12, { size: 8.5, color: '#7FBFA4' })
  T(ctx, `${o.I.toFixed(2)} A`, lc.x + lc.w - 8, lc.y + 22, {
    size: 15, color: '#7BF3A6', align: 'right', mono: true, bold: true,
  })

  // 电流旋钮
  const knob = { cx: x + 42, cy: y + 96, r: 22 }
  ctx.fillStyle = '#EDF1F4'
  ctx.beginPath()
  ctx.arc(knob.cx, knob.cy, knob.r + 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#B9C7D0'
  ctx.lineWidth = 1.2
  ctx.stroke()
  const a = (-120 + ((o.I - 0.2) / 1.0) * 240) * Math.PI / 180
  ctx.fillStyle = '#DCE4E9'
  ctx.beginPath()
  ctx.arc(knob.cx, knob.cy, knob.r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#8C9BA6'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(knob.cx, knob.cy)
  ctx.lineTo(knob.cx + Math.sin(a) * knob.r * 0.86, knob.cy - Math.cos(a) * knob.r * 0.86)
  ctx.stroke()
  T(ctx, '电流调节', knob.cx, knob.cy + knob.r + 14, { size: 8, color: '#6B7A83', align: 'center' })

  // 电源开关
  const sw = { x: x + 96, y: y + 76, w: 44, h: 40 }
  ctx.fillStyle = '#E2E9ED'
  rr(ctx, sw.x, sw.y, sw.w, sw.h, 6)
  ctx.fill()
  ctx.strokeStyle = '#B7C5CE'
  ctx.lineWidth = 1
  rr(ctx, sw.x, sw.y, sw.w, sw.h, 6)
  ctx.stroke()
  ctx.fillStyle = o.closed ? '#2E9E5B' : '#C0392B'
  rr(ctx, sw.x + 8, sw.y + (o.closed ? 18 : 5), sw.w - 16, 16, 4)
  ctx.fill()
  T(ctx, o.closed ? 'ON' : 'OFF', sw.x + sw.w / 2, sw.y + (o.closed ? 10 : 31), {
    size: 8, color: '#4B5A66', align: 'center', bold: true,
  })
  T(ctx, '电源开关', sw.x + sw.w / 2, sw.y + sw.h + 12, { size: 8, color: '#6B7A83', align: 'center' })

  // 接线柱
  const termNeg = { x: x + 32, y: y + h - 22 }
  const termPos = { x: x + 80, y: y + h - 22 }
  for (const [t, col, txt] of [[termNeg, '#1B2A33', '−'], [termPos, '#C0392B', '+']]) {
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.arc(t.x, t.y, 7, 0, Math.PI * 2)
    ctx.fill()
    T(ctx, txt, t.x + (col === '#C0392B' ? 13 : -13), t.y + 1, { size: 9, color: col === '#C0392B' ? '#B3261E' : '#4B5A66', align: 'center', bold: true })
  }
  T(ctx, '直流电源 0–1.5 A', x + w - 12, y + h - 8, { size: 8, color: '#8A959C', align: 'right' })
  return { knob, switchHit: { x: sw.x - 4, y: sw.y - 4, w: sw.w + 8, h: sw.h + 8 }, termPos, termNeg }
}

/* ==================================================================
 *  ② 电子天平
 * ================================================================== */
export function drawBalance(ctx, box, k, o = {}) {
  const { x, y, w, h } = box
  const cx = x + w / 2

  // 秤盘
  ctx.fillStyle = '#C9D4DB'
  ctx.beginPath()
  ctx.ellipse(cx, y - 12, w * 0.30, 15, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#9FB0BA'
  ctx.lineWidth = 1.2
  ctx.stroke()
  ctx.fillStyle = '#E3EAEF'
  ctx.beginPath()
  ctx.ellipse(cx, y - 14, w * 0.30, 13, 0, 0, Math.PI * 2)
  ctx.fill()
  // 立柱
  ctx.fillStyle = '#B8C5CE'
  rr(ctx, cx - 12, y - 6, 24, 16, 4)
  ctx.fill()

  // 机身
  ctx.save()
  ctx.shadowColor = 'rgba(60,80,70,0.16)'
  ctx.shadowBlur = 12
  ctx.shadowOffsetY = 4
  const g = ctx.createLinearGradient(x, y, x, y + h)
  g.addColorStop(0, '#F4F7F9')
  g.addColorStop(1, '#D6DFE5')
  ctx.fillStyle = g
  rr(ctx, x, y, w, h, 10)
  ctx.fill()
  ctx.restore()
  ctx.strokeStyle = '#B7C5CE'
  ctx.lineWidth = 1.2
  rr(ctx, x, y, w, h, 10)
  ctx.stroke()

  // 数显
  const lc = { x: cx - 62, y: y + 24, w: 124, h: 48 }
  ctx.fillStyle = '#0C2A22'
  rr(ctx, lc.x, lc.y, lc.w, lc.h, 5)
  ctx.fill()
  T(ctx, o.reading.toFixed(2), lc.x + lc.w - 12, lc.y + 22, {
    size: 19, color: '#7BF3A6', align: 'right', mono: true, bold: true,
  })
  T(ctx, 'g', lc.x + lc.w - 10, lc.y + 38, { size: 8, color: '#7FBFA4', align: 'right' })

  // 置零键
  const tare = { x: x + 14, y: y + 30, w: 56, h: 36 }
  ctx.fillStyle = o.tare ? '#DDF3E4' : '#E8EDF1'
  rr(ctx, tare.x, tare.y, tare.w, tare.h, 5)
  ctx.fill()
  ctx.strokeStyle = '#B7C5CE'
  ctx.lineWidth = 1
  rr(ctx, tare.x, tare.y, tare.w, tare.h, 5)
  ctx.stroke()
  T(ctx, '置零', tare.x + tare.w / 2, tare.y + 13, { size: 8.6, color: '#33526E', align: 'center', bold: true })
  T(ctx, 'TARE', tare.x + tare.w / 2, tare.y + 25, { size: 7, color: '#8A959C', align: 'center' })

  // 电源灯
  ctx.fillStyle = '#2E9E5B'
  ctx.beginPath()
  ctx.arc(x + w - 24, y + 40, 4, 0, Math.PI * 2)
  ctx.fill()
  T(ctx, '0.01 g', x + w - 14, y + h - 12, { size: 8.6, color: '#6B7A83', align: 'right', bold: true })
  T(ctx, '电子天平', x + 14, y + h - 12, { size: 8.6, color: '#6B7A83' })

  return { tare, panCx: cx, panY: y - 14 }
}

/* ==================================================================
 *  ③ 安培力实验支架（亚克力框 + 角度盘 + U 形磁铁 + 单匝导线）
 * ================================================================== */
export function drawRig(ctx, o = {}) {
  const cx = o.cx
  const topY = o.topY
  const panY = o.panY
  const theta = clamp(o.theta, 0, 90)
  const lenCm = o.lenCm || 3

  // 亚克力立柱（半透明）
  for (const dx of [-84, 84]) {
    ctx.fillStyle = ACRYLIC
    rr(ctx, cx + dx - 4, topY + 10, 8, panY - topY - 34, 3)
    ctx.fill()
    ctx.strokeStyle = ACRYLIC_EDGE
    ctx.lineWidth = 1
    rr(ctx, cx + dx - 4, topY + 10, 8, panY - topY - 34, 3)
    ctx.stroke()
  }
  // 顶板
  ctx.fillStyle = ACRYLIC
  rr(ctx, cx - 92, topY, 184, 12, 4)
  ctx.fill()
  ctx.strokeStyle = ACRYLIC_EDGE
  rr(ctx, cx - 92, topY, 184, 12, 4)
  ctx.stroke()

  // 顶板两端的接线柱：电源的红/黑线接在这里（柱体露在顶板下方，才看得见）
  const termA = { x: cx - 58, y: topY + 20 }
  const termB = { x: cx + 58, y: topY + 20 }
  for (const [t, col] of [[termA, '#C0392B'], [termB, '#16232B']]) {
    ctx.fillStyle = col
    rr(ctx, t.x - 1.8, topY + 11, 3.6, 7, 1.6)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(t.x, t.y, 4.6, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.beginPath()
    ctx.arc(t.x - 1.2, t.y - 1.4, 1.6, 0, Math.PI * 2)
    ctx.fill()
  }

  // 导线在水平面上的投影宽度：线框绕竖直轴转过 α，底边投影 = l·sinα
  const wPx = clamp(lenCm * 18 * Math.sin((theta * Math.PI) / 180), 0, 66)
  const socketY = 332
  const sockA = { x: cx - wPx / 2, y: socketY }
  const sockB = { x: cx + wPx / 2, y: socketY }

  // 支架内部走线：接线柱 → 竖直下行（贴着角度盘外侧）→ 横向到两个插孔
  const jumper = (tx, ty, sx, col) => {
    line(ctx, tx, ty, tx, socketY, col, 1.6)
    line(ctx, tx, socketY, sx, socketY, col, 1.6)
  }
  jumper(termA.x, termA.y, sockA.x, '#C0392B')
  jumper(termB.x, termB.y, sockB.x, '#16232B')

  // 角度盘
  const dial = { cx, cy: topY + 70, r: 44 }
  ctx.fillStyle = 'rgba(245,250,252,0.95)'
  ctx.beginPath()
  ctx.arc(dial.cx, dial.cy, dial.r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#B9CDD8'
  ctx.lineWidth = 1.2
  ctx.stroke()
  for (let a = 0; a <= 90; a += 10) {
    const rad = (a * Math.PI) / 180
    const x1 = dial.cx + Math.cos(rad) * (dial.r - 3)
    const y1 = dial.cy - Math.sin(rad) * (dial.r - 3)
    const x2 = dial.cx + Math.cos(rad) * (dial.r - (a % 30 === 0 ? 10 : 6))
    const y2 = dial.cy - Math.sin(rad) * (dial.r - (a % 30 === 0 ? 10 : 6))
    line(ctx, x1, y1, x2, y2, '#7F97A3', 1)
    if (a % 30 === 0) {
      T(ctx, String(a), dial.cx + Math.cos(rad) * (dial.r - 16), dial.cy - Math.sin(rad) * (dial.r - 16), {
        size: 7.6, color: '#4B5A66', align: 'center',
      })
    }
  }
  const prad = (theta * Math.PI) / 180
  line(ctx, dial.cx, dial.cy,
    dial.cx + Math.cos(prad) * (dial.r - 24),
    dial.cy - Math.sin(prad) * (dial.r - 24), '#C2410C', 2)
  ctx.fillStyle = '#C2410C'
  ctx.beginPath()
  ctx.arc(dial.cx, dial.cy, 3.5, 0, Math.PI * 2)
  ctx.fill()
  T(ctx, '转线圈', dial.cx, dial.cy + 20, { size: 7.2, color: '#8A5A2B', align: 'center' })

  // 两个插孔（单匝导线的两端插在这里）
  for (const [t, col] of [[sockA, '#C0392B'], [sockB, '#16232B']]) {
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.arc(t.x, t.y, 3, 0, Math.PI * 2)
    ctx.fill()
  }

  /* ---------- U 形磁铁：两极一前一后，磁感线垂直纸面向里 ---------- */
  const gap = 76
  const poleTopBack = panY - 126
  const poleTopFront = panY - 110
  const poleH = 112
  // 底座（压在秤盘上）
  ctx.fillStyle = '#9AA6AE'
  rr(ctx, cx - 80, panY - 12, 160, 12, 3)
  ctx.fill()
  ctx.strokeStyle = '#7C888F'
  ctx.lineWidth = 1
  rr(ctx, cx - 80, panY - 12, 160, 12, 3)
  ctx.stroke()
  // 后极 S（蓝，偏左上：表示在纸面后方）
  const rb = { x: cx - gap / 2 - 36, y: poleTopBack, w: 36, h: poleH }
  const bg = ctx.createLinearGradient(rb.x, 0, rb.x + rb.w, 0)
  bg.addColorStop(0, '#244F86')
  bg.addColorStop(0.5, '#3B76BE')
  bg.addColorStop(1, '#2E5C97')
  ctx.fillStyle = bg
  rr(ctx, rb.x, rb.y, rb.w, rb.h, 4)
  ctx.fill()
  T(ctx, 'S', rb.x + rb.w / 2, rb.y + 18, { size: 12, color: '#fff', align: 'center', bold: true })
  T(ctx, '后', rb.x + rb.w / 2, rb.y - 7, { size: 7, color: '#3B6FB6', align: 'center' })
  // 前极 N（红，偏右下：表示靠近观察者）
  const rf = { x: cx + gap / 2, y: poleTopFront, w: 36, h: poleH - 4 }
  const rg2 = ctx.createLinearGradient(rf.x, 0, rf.x + rf.w, 0)
  rg2.addColorStop(0, '#B02B1F')
  rg2.addColorStop(0.5, '#E05A45')
  rg2.addColorStop(1, '#C0392B')
  ctx.fillStyle = rg2
  rr(ctx, rf.x, rf.y, rf.w, rf.h, 4)
  ctx.fill()
  T(ctx, 'N', rf.x + rf.w / 2, rf.y + 18, { size: 12, color: '#fff', align: 'center', bold: true })
  T(ctx, '前', rf.x + rf.w / 2, rf.y - 7, { size: 7, color: '#B3261E', align: 'center' })

  // 磁感线：从 N（前）指向 S（后）→ 垂直纸面向里，用 ⊗ 表示
  const crossed = (mx, my) => {
    ctx.strokeStyle = 'rgba(45,110,185,0.85)'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.arc(mx, my, 4.2, 0, Math.PI * 2)
    ctx.stroke()
    line(ctx, mx - 2.8, my - 2.8, mx + 2.8, my + 2.8, 'rgba(45,110,185,0.85)', 1.2)
    line(ctx, mx + 2.8, my - 2.8, mx - 2.8, my + 2.8, 'rgba(45,110,185,0.85)', 1.2)
  }
  for (const [mx, my] of [
    [cx - 32.5, panY - 114], [cx + 32.5, panY - 114],
    [cx - 32.5, panY - 68], [cx + 32.5, panY - 68],
  ]) crossed(mx, my)

  /* ---------- 单匝 U 形导线：两腿插在插孔里，底边在磁铁缝隙中 ---------- */
  const loopBot = panY - 44
  const LEAD = '#8C9BA6' // 引线/线框两腿：灰铜色（不在磁场里的部分）
  const ACTIVE = '#E1A03A' // 磁场中真正受力的一小段：金色
  if (wPx > 2) {
    line(ctx, sockA.x, socketY, sockA.x, loopBot, LEAD, 2.6)
    line(ctx, sockB.x, socketY, sockB.x, loopBot, LEAD, 2.6)
    line(ctx, sockA.x, loopBot, sockB.x, loopBot, ACTIVE, 4.4)
    line(ctx, sockA.x, loopBot - 1, sockB.x, loopBot - 1, '#F6C97A', 1.2)
  } else {
    line(ctx, cx, socketY, cx, loopBot, LEAD, 2.6)
  }

  // 电流方向：底边上由左向右（从红接线柱 → 左腿 → 底边 → 右腿 → 黑接线柱）
  if (o.closed) {
    if (wPx > 12) {
      ctx.fillStyle = '#7A3E12'
      for (let i = 0; i < 2; i++) {
        const ax = cx - wPx / 4 + i * (wPx / 2)
        ctx.beginPath()
        ctx.moveTo(ax + 6, loopBot)
        ctx.lineTo(ax - 2, loopBot - 4.2)
        ctx.lineTo(ax - 2, loopBot + 4.2)
        ctx.closePath()
        ctx.fill()
      }
    } else {
      // 线框转到几乎与纸面垂直：电流穿出纸面，用 ⊙ 表示
      ctx.strokeStyle = ACTIVE
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.arc(cx, loopBot, 5, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = ACTIVE
      ctx.beginPath()
      ctx.arc(cx, loopBot, 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // 安培力 F：竖直向上（左手定则：B 入纸面、I 向右 → F 向上）
  const sinA = Math.sin((theta * Math.PI) / 180)
  if (o.closed && sinA > 0.06) {
    line(ctx, cx, loopBot - 6, cx, loopBot - 42, '#C62828', 2.6)
    ctx.fillStyle = '#C62828'
    ctx.beginPath()
    ctx.moveTo(cx, loopBot - 50)
    ctx.lineTo(cx - 5, loopBot - 38)
    ctx.lineTo(cx + 5, loopBot - 38)
    ctx.closePath()
    ctx.fill()
    T(ctx, 'F', cx + 8, loopBot - 38, { size: 10.5, color: '#B3261E', bold: true })
    // F′：磁铁受到的反作用力，向下压秤盘
    line(ctx, cx - 13, loopBot + 4, cx - 13, loopBot + 26, 'rgba(138,90,43,0.85)', 1.6)
    ctx.fillStyle = '#8A5A2B'
    ctx.beginPath()
    ctx.moveTo(cx - 13, loopBot + 30)
    ctx.lineTo(cx - 16.5, loopBot + 22)
    ctx.lineTo(cx - 9.5, loopBot + 22)
    ctx.closePath()
    ctx.fill()
    T(ctx, 'F′', cx - 24, loopBot + 18, { size: 8, color: '#8A5A2B', bold: true, align: 'right' })
  }

  /* ---------- 伪 3D：俯视导线与磁场的夹角（局部放大） ---------- */
  drawAngle3D(ctx, { x: 424, y: 332, w: 186, h: 178 }, { theta, lenCm })

  // 长度标注：金色一段才是磁场中的 l
  line(ctx, cx + 96, loopBot + 1, cx + 108, loopBot + 1, ACTIVE, 3)
  T(ctx, `l = ${lenCm.toFixed(0)} cm（金段）`, cx + 113, loopBot + 3, {
    size: 8, color: '#8A5A2B', bold: true,
  })

  return { dial, termA, termB, sockA, sockB }
}

/* ==================================================================
 *  俯视夹角图：真实的俯视图（水平面是正投影，90° 真的画成直角）
 *  磁力线 B 沿水平方向指向磁铁后方；导体与 B 的夹角就是 α；
 *  导体垂直于 B 的分量（有效长度）就是 l·sinα。
 *  Tab1 原理卡与 Tab2 的「俯视 3D」小卡共用这一套画法。
 * ================================================================== */
export function drawAngleTopView(ctx, o = {}) {
  const theta = clamp(o.theta == null ? 90 : o.theta, 0, 90)
  const cx = o.cx
  const cy = o.cy
  const R = o.R || 40
  const s = Math.sin((theta * Math.PI) / 180)
  const c = Math.cos((theta * Math.PI) / 180)
  const P = R * 1.18
  const Q = R * 0.86

  // 水平面（正投影，所以是矩形而不是平行四边形）
  ctx.fillStyle = 'rgba(226,240,248,0.55)'
  rr(ctx, cx - P, cy - Q, P * 2, Q * 2, 3)
  ctx.fill()
  ctx.strokeStyle = 'rgba(120,150,170,0.5)'
  ctx.lineWidth = 1
  rr(ctx, cx - P, cy - Q, P * 2, Q * 2, 3)
  ctx.stroke()

  // 磁力线：沿深度方向（画面上向上）指向后方
  for (const dx of [-P * 0.7, P * 0.7]) {
    const x0 = cx + dx
    const y0 = cy + Q * 0.8
    const y1 = cy - Q * 0.86
    line(ctx, x0, y0, x0, y1, 'rgba(45,110,185,0.72)', 1)
    ctx.fillStyle = 'rgba(45,110,185,0.85)'
    ctx.beginPath()
    ctx.moveTo(x0, y1 - R * 0.1)
    ctx.lineTo(x0 - R * 0.055, y1 + R * 0.015)
    ctx.lineTo(x0 + R * 0.055, y1 + R * 0.015)
    ctx.closePath()
    ctx.fill()
  }
  if (theta > 8) {
    T(ctx, 'B', cx - P * 0.7 - R * 0.11, cy - Q * 0.5, {
      size: Math.max(7, R * 0.19), color: '#2D6EB9', bold: true, align: 'right',
    })
  }

  // 导体（金色受力段），方向与 B 成 α
  const ux = s
  const uy = -c
  const x1 = cx - ux * R
  const y1w = cy - uy * R
  const x2 = cx + ux * R
  const y2w = cy + uy * R
  line(ctx, x1, y1w, x2, y2w, '#E1A03A', Math.max(2.6, R * 0.105))
  line(ctx, x1, y1w - 1, x2, y2w - 1, 'rgba(255,225,160,0.75)', Math.max(1, R * 0.03))

  // 电流方向：导线上的小箭头
  {
    const axp = cx - ux * R * 0.55
    const ayp = cy - uy * R * 0.55
    const nx = -uy
    const ny = ux
    ctx.fillStyle = '#B4701E'
    ctx.beginPath()
    ctx.moveTo(axp + ux * R * 0.1, ayp + uy * R * 0.1)
    ctx.lineTo(axp - ux * R * 0.04 + nx * R * 0.06, ayp - uy * R * 0.04 + ny * R * 0.06)
    ctx.lineTo(axp - ux * R * 0.04 - nx * R * 0.06, ayp - uy * R * 0.04 - ny * R * 0.06)
    ctx.closePath()
    ctx.fill()
  }

  // α 圆弧（半径固定，画出来就是真实角度）
  if (theta >= 5) {
    ctx.save()
    ctx.setLineDash([3, 3])
    ctx.strokeStyle = 'rgba(194,65,12,0.85)'
    ctx.lineWidth = 1.1
    ctx.beginPath()
    for (let a = 0; a <= theta + 0.01; a += 3) {
      const r2 = ((a * Math.PI) / 180)
      const qx = cx + Math.sin(r2) * R * 0.5
      const qy = cy - Math.cos(r2) * R * 0.5
      if (a === 0) ctx.moveTo(qx, qy)
      else ctx.lineTo(qx, qy)
    }
    ctx.stroke()
    ctx.restore()
  }

  // 有效长度：导体垂直于 B 的分量 = l sinα
  if (s > 0.1) {
    const yb = cy + Q + R * 0.14
    line(ctx, cx - s * R, yb, cx + s * R, yb, '#B4701E', Math.max(1.4, R * 0.045))
    for (const xx of [cx - s * R, cx + s * R]) {
      line(ctx, xx, yb - R * 0.07, xx, yb + R * 0.07, '#B4701E', Math.max(1, R * 0.035))
    }
    if (o.labels === true) {
      T(ctx, 'l sinα', cx + s * R + R * 0.09, yb + R * 0.05, {
        size: Math.max(7, R * 0.17), color: '#8A5A2B', bold: true,
      })
    }
  }

  // F：垂直于这个面向上（俯视图里看作“出纸面”，用 ⊙ 表示）
  if (s > 0.06) {
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(cx, cy, R * 0.17, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#C62828'
    ctx.lineWidth = 1.2
    ctx.stroke()
    ctx.fillStyle = '#C62828'
    ctx.beginPath()
    ctx.arc(cx, cy, R * 0.06, 0, Math.PI * 2)
    ctx.fill()
    if (o.labels === true) {
      const nfx = Math.cos((theta * Math.PI) / 180)
      const nfy = Math.sin((theta * Math.PI) / 180)
      T(ctx, 'F', cx + nfx * R * 0.3, cy + nfy * R * 0.3, {
        size: Math.max(7.2, R * 0.19), color: '#B3261E', bold: true, align: 'center',
      })
    }
  }

  if (o.labels && theta > 12) {
    const half = (theta * Math.PI) / 360
    T(ctx, 'α', cx + Math.sin(half) * R * 0.68, cy - Math.cos(half) * R * 0.68, {
      size: Math.max(7, R * 0.18), color: '#C2410C', bold: true, align: 'center',
    })
    if (o.labels === true) {
      T(ctx, 'I', cx - ux * R * 0.55 - uy * R * 0.26, cy - uy * R * 0.55 + ux * R * 0.26, {
        size: Math.max(7.2, R * 0.19), color: '#B4701E', bold: true, align: 'center',
      })
    }
  }
}

/* ==================================================================
 *  Tab2 右侧小卡：俯视夹角（带标题与有效长度）
 * ================================================================== */
export function drawAngle3D(ctx, box, o = {}) {
  const theta = clamp(o.theta, 0, 90)
  const { x, y, w, h } = box
  const lenCm = o.lenCm == null ? 3 : o.lenCm
  softCard(ctx, x, y, w, h, '#F8FBFF', '#CFE0EE')
  T(ctx, '俯视：导体与磁力线夹角', x + 12, y + 20, { size: 8.4, bold: true, color: '#0E4B86' })
  T(ctx, `α = ${Math.round(theta)}°`, x + w - 12, y + 20, {
    size: 9.4, color: '#C2410C', align: 'right', bold: true,
  })
  T(ctx, '磁力线沿水平方向指向磁铁后方', x + 12, y + 34, { size: 7, color: '#3E6FA8' })
  T(ctx, `有效长度 l sinα = ${(lenCm * Math.sin((theta * Math.PI) / 180)).toFixed(2)} cm`, x + 12, y + 47, {
    size: 7.2, color: theta >= 88 ? '#1E6B3B' : '#8A5A2B', bold: true,
  })

  drawAngleTopView(ctx, { cx: x + w / 2, cy: y + 104, R: 40, theta, labels: 'angle' })

  T(ctx, 'α=90° 时导体⊥B，F = BIL 最大', x + 12, y + h - 9, { size: 7, color: '#5B7182' })
}

/* ==================================================================
 *  ④ F–x 图像
 * ================================================================== */
export function drawChart(ctx, box, k, o = {}) {
  const xMax = o.xMax || 1
  const yMax = o.yMax || 4
  const padL = box.x + 40
  const padR = box.x + box.w - 14
  const padT = box.y + 12
  const padB = box.y + box.h - 30
  const plot = { x: padL, y: padT, w: padR - padL, h: padB - padT }
  const px = (v) => plot.x + clamp(v / xMax, 0, 1) * plot.w
  const py = (v) => plot.y + plot.h - clamp(v / yMax, 0, 1) * plot.h
  const ticks = o.xTicks || 4

  for (let i = 0; i <= ticks; i++) {
    const gx = plot.x + (i / ticks) * plot.w
    const gy = plot.y + (i / ticks) * plot.h
    line(ctx, gx, plot.y, gx, plot.y + plot.h, 'rgba(120,150,170,0.18)', 1)
    line(ctx, plot.x, gy, plot.x + plot.w, gy, 'rgba(120,150,170,0.18)', 1)
    T(ctx, ((xMax / ticks) * i).toFixed(o.xDec == null ? 1 : o.xDec), gx, plot.y + plot.h + 12, {
      size: 7.6, color: '#6B7A83', align: 'center',
    })
    T(ctx, (yMax - (yMax / ticks) * i).toFixed(1), plot.x - 6, gy, {
      size: 7.6, color: '#6B7A83', align: 'right',
    })
  }
  line(ctx, plot.x, plot.y + plot.h, plot.x + plot.w, plot.y + plot.h, '#5A6670', 1.2)
  line(ctx, plot.x, plot.y, plot.x, plot.y + plot.h, '#5A6670', 1.2)
  T(ctx, o.xLabel || '', plot.x + plot.w - 4, plot.y + plot.h - 9, {
    size: 8.2, color: '#8A959C', align: 'right', bold: true,
  })
  T(ctx, 'm / g', plot.x + plot.w - 4, plot.y + 8, { size: 8.2, color: '#8A959C', align: 'right', bold: true })

  ctx.save()
  ctx.beginPath()
  ctx.rect(plot.x - 6, plot.y - 6, plot.w + 12, plot.h + 12)
  ctx.clip()
  if (o.fit && o.xMax) {
    line(ctx, px(0), py(o.fit.a), px(xMax), py(o.fit.a + o.fit.b * xMax), '#E0761F', 2.2)
  }
  for (const p of o.points || []) {
    ctx.fillStyle = '#1E6B3B'
    ctx.beginPath()
    ctx.arc(px(p.x), py(p.y), 3.2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  if (!(o.points || []).length) {
    T(ctx, '还没有数据', plot.x + plot.w / 2, plot.y + plot.h / 2 - 8, {
      size: 9, color: '#B9C4CB', align: 'center', bold: true,
    })
    T(ctx, '合闸后点「记录这一组」', plot.x + plot.w / 2, plot.y + plot.h / 2 + 8, {
      size: 8, color: '#B9C4CB', align: 'center',
    })
  }
  if (o.fit) {
    T(ctx, `k = ${o.fit.b.toFixed(2)} g/${o.xUnit || ''}`, plot.x + 6, plot.y + 12, {
      size: 8.4, color: '#C2410C', bold: true,
    })
  }
  return { plot }
}
