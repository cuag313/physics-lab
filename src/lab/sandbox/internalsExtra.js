/**
 * sandbox/internalsExtra.js — 新增器材的「拆开看内部结构」剖视图
 *
 * 现有 render/internals.js 已覆盖 灯泡/电阻/变阻器/电表/电池/开关，
 * 这里补齐 学生电源 与 灵敏电流计 两个新器材的剖面图。
 * 统一走 drawInternalAny：已知类型回落 drawInternal，新类型走本地绘制。
 */

import { drawInternal } from '../render/internals.js'

const FONT = '11px "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif'

function part(ctx, x, y, name, desc, color, align = 'left') {
  const tx = x + 8, ty = y
  const ax = x + 3, ay = y + 3
  ctx.strokeStyle = 'rgba(90,100,110,0.6)'
  ctx.lineWidth = 0.6
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  ctx.lineTo(tx, ty)
  ctx.stroke()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(ax, ay, 2.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#1f2933'
  ctx.font = `700 ${FONT}`
  ctx.textAlign = align
  ctx.textBaseline = 'top'
  ctx.fillText(name, tx, ty - 1)
  ctx.font = FONT
  ctx.fillStyle = '#6b7280'
  ctx.fillText(desc, tx, ty + 13)
  return { name, desc, color }
}

function hatchRect(ctx, x, y, w, h, gap = 5, color = 'rgba(90,100,110,0.35)') {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.strokeStyle = color
  ctx.lineWidth = 0.6
  for (let i = -h; i < w + h; i += gap) {
    ctx.beginPath()
    ctx.moveTo(x + i, y + h)
    ctx.lineTo(x + i + h, y)
    ctx.stroke()
  }
  ctx.restore()
}

// ────────────────────────────────────────────────────────────────
//  学生电源内部：变压器 → 整流 → 滤波 → 稳压 → 输出
// ────────────────────────────────────────────────────────────────

function drawPowerSupplyInternal(ctx, w, h) {
  ctx.clearRect(0, 0, w, h)

  // 剖开外壳（上、下两半，露出内部）
  ctx.fillStyle = '#c9ccd1'
  ctx.fillRect(0, 0, w, 18)
  ctx.fillRect(0, h - 18, w, 18)
  ctx.fillStyle = '#8a9099'
  ctx.fillRect(0, 16, w, 4)
  ctx.fillRect(0, h - 22, w, 4)
  hatchRect(ctx, 0, 0, w, 16, 6, 'rgba(120,130,140,0.35)')
  hatchRect(ctx, 0, h - 16, w, 16, 6, 'rgba(120,130,140,0.35)')

  const parts = []

  // 1. 变压器（铁芯 + 原/副绕组）
  const tx = 52, ty = 78
  ctx.fillStyle = '#5c6b7a'
  ctx.beginPath()
  ctx.roundRect(tx - 6, ty - 22, 12, 44, 2)
  ctx.fill()
  ctx.beginPath()
  ctx.roundRect(tx - 22, ty - 6, 44, 12, 2)
  ctx.fill()
  ctx.strokeStyle = '#c8814a'
  ctx.lineWidth = 2
  // 原边线圈
  for (let i = 0; i < 5; i++) {
    ctx.beginPath()
    ctx.arc(tx - 16, ty - 14, 7, Math.PI * 0.9, Math.PI * 2.1)
    ctx.stroke()
    ctx.translate(0, 0)
  }
  ctx.strokeStyle = '#a05f2e'
  for (let i = 0; i < 5; i++) {
    ctx.beginPath()
    ctx.arc(tx + 16, ty + 14, 7, -Math.PI * 1.1, Math.PI * 0.1)
    ctx.stroke()
  }
  parts.push(part(ctx, tx + 24, ty - 24, '降压变压器', '把 220V 交流电降到安全低电压', '#5c6b7a'))

  // 2. 整流桥（四只二极管）
  const rx = 122, ry = 88
  ctx.strokeStyle = '#3a4048'
  ctx.lineWidth = 1.4
  for (const [dx, dy] of [[-10, -6], [10, -6], [-10, 6], [10, 6]]) {
    ctx.beginPath()
    ctx.moveTo(rx + dx, ry + dy - 5)
    ctx.lineTo(rx + dx, ry + dy + 5)
    ctx.stroke()
    ctx.fillStyle = '#2f3438'
    ctx.beginPath()
    ctx.moveTo(rx + dx - 3, ry + dy)
    ctx.lineTo(rx + dx + 3, ry + dy - 3)
    ctx.lineTo(rx + dx + 3, ry + dy + 3)
    ctx.closePath()
    ctx.fill()
  }
  parts.push(part(ctx, rx + 16, ry - 22, '整流桥', '四只二极管把交流变脉动直流', '#2f3438'))

  // 3. 滤波电容
  const cx = 176, cy = 88
  ctx.fillStyle = '#4a4d52'
  ctx.beginPath()
  ctx.roundRect(cx - 9, cy - 20, 18, 40, 5)
  ctx.fill()
  ctx.strokeStyle = '#c4b89a'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(cx - 9, cy + 8)
  ctx.lineTo(cx + 9, cy + 8)
  ctx.stroke()
  ctx.strokeStyle = '#6f7680'
  ctx.beginPath()
  ctx.moveTo(cx - 4, cy - 20); ctx.lineTo(cx - 4, cy - 26)
  ctx.moveTo(cx + 4, cy - 20); ctx.lineTo(cx + 4, cy - 26)
  ctx.stroke()
  parts.push(part(ctx, cx + 16, cy - 28, '滤波电容', '把脉动直流平滑成稳定直流', '#4a4d52'))

  // 4. 稳压电路（IC）
  const sx = 232, sy = 88
  ctx.fillStyle = '#2f3438'
  ctx.beginPath()
  ctx.roundRect(sx - 12, sy - 12, 24, 24, 3)
  ctx.fill()
  ctx.fillStyle = '#e8e0cf'
  ctx.font = 'bold 9px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('REG', sx, sy)
  parts.push(part(ctx, sx + 18, sy - 20, '稳压电路', '保持输出电压稳定，不随负载波动', '#2f3438'))

  // 5. 调压旋钮（右下，用连线标出）
  const kx = 268, ky = 130
  ctx.fillStyle = '#c8814a'
  ctx.beginPath()
  ctx.arc(kx, ky, 12, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#a05f2e'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.strokeStyle = '#3a4048'
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(kx, ky)
  ctx.lineTo(kx + 8, ky - 6)
  ctx.stroke()
  parts.push(part(ctx, kx - 6, ky + 18, '调压旋钮', '改变基准电压，连续调节输出电压', '#c8814a', 'center'))

  // 6. 输出接线柱
  parts.push(part(ctx, 196, 150, '输出接线柱', '红（+）黑（−），接外部电路', '#c0392b', 'center'))

  // 电路连线
  ctx.strokeStyle = 'rgba(90,100,110,0.5)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(tx + 16, ty - 6); ctx.lineTo(rx - 12, ry - 6)
  ctx.moveTo(rx + 12, ry); ctx.lineTo(cx - 9, cy - 4)
  ctx.moveTo(cx + 9, cy); ctx.lineTo(sx - 12, sy)
  ctx.moveTo(sx + 12, sy); ctx.lineTo(kx - 10, ky - 8)
  ctx.stroke()

  return { title: '学生电源', parts }
}

// ────────────────────────────────────────────────────────────────
//  灵敏电流计内部：磁电式表头（磁铁 + 动圈 + 游丝 + 指针）
// ────────────────────────────────────────────────────────────────

function drawGalvanometerInternal(ctx, w, h) {
  ctx.clearRect(0, 0, w, h)

  // 剖开外壳
  ctx.fillStyle = '#c9ccd1'
  ctx.fillRect(0, 0, w, 16)
  ctx.fillRect(0, h - 16, w, 16)
  ctx.fillStyle = '#8a9099'
  ctx.fillRect(0, 12, w, 4)
  ctx.fillRect(0, h - 20, w, 4)
  hatchRect(ctx, 0, 0, w, 12, 6, 'rgba(120,130,140,0.35)')
  hatchRect(ctx, 0, h - 12, w, 12, 6, 'rgba(120,130,140,0.35)')

  const parts = []
  const cx = 130, cy = 110

  // 1. 永久磁铁（N / S 极）
  ctx.fillStyle = '#5c6b7a'
  ctx.beginPath()
  ctx.moveTo(cx - 78, cy - 30); ctx.lineTo(cx - 60, cy - 40); ctx.lineTo(cx - 60, cy + 40); ctx.lineTo(cx - 78, cy + 30)
  ctx.closePath(); ctx.fill()
  ctx.beginPath()
  ctx.moveTo(cx + 78, cy - 30); ctx.lineTo(cx + 60, cy - 40); ctx.lineTo(cx + 60, cy + 40); ctx.lineTo(cx + 78, cy + 30)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#c0392b'
  ctx.font = 'bold 14px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('N', cx - 70, cy - 6)
  ctx.fillStyle = '#1a5ca8'
  ctx.fillText('S', cx + 70, cy - 6)
  parts.push(part(ctx, cx - 96, cy - 46, '永久磁铁', '产生稳定磁场（N / S 两极）', '#5c6b7a'))

  // 2. 软铁芯（圆柱）
  ctx.fillStyle = '#9aa7b0'
  ctx.beginPath()
  ctx.arc(cx, cy, 16, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#6f7680'
  ctx.lineWidth = 1
  ctx.stroke()
  parts.push(part(ctx, cx - 40, cy - 44, '软铁芯', '集中磁力线，增强磁场', '#9aa7b0'))

  // 3. 动圈（矩形线圈，可绕轴转动）
  ctx.strokeStyle = '#c8814a'
  ctx.lineWidth = 2.4
  ctx.beginPath()
  ctx.roundRect(cx - 11, cy - 34, 22, 68, 6)
  ctx.stroke()
  // 线圈匝数示意
  ctx.strokeStyle = '#a05f2e'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(cx - 14, cy - 30, 28, 60, 6)
  ctx.stroke()
  parts.push(part(ctx, cx + 26, cy - 46, '可动线圈', '通电后在磁场中受安培力而偏转', '#c8814a'))

  // 4. 游丝（上下两根螺旋弹簧）
  ctx.strokeStyle = '#7a828c'
  ctx.lineWidth = 1
  for (const sy of [cy - 26, cy + 26]) {
    ctx.beginPath()
    for (let a = 0; a <= Math.PI * 2.6; a += 0.35) {
      const rr = 2 + a * 0.9
      const px = cx + Math.cos(a) * rr, py = sy + Math.sin(a) * rr * 0.4
      if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.stroke()
  }
  parts.push(part(ctx, cx + 34, cy + 16, '游丝弹簧', '产生回复力矩，让指针停在对应刻度', '#7a828c'))

  // 5. 指针 + 转轴
  ctx.strokeStyle = '#c0392b'
  ctx.lineWidth = 1.8
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + 34, cy - 30)
  ctx.stroke()
  ctx.fillStyle = '#2f3438'
  ctx.beginPath()
  ctx.arc(cx, cy, 3, 0, Math.PI * 2)
  ctx.fill()
  parts.push(part(ctx, cx + 34, cy - 58, '指针', '固定在转轴上，随线圈一起偏转', '#c0392b'))

  // 6. 接线柱
  parts.push(part(ctx, 236, 96, '接线柱', '红（+）黑（−），串入待测电路', '#c0392b', 'center'))

  return { title: '灵敏电流计', parts }
}

/** 统一入口：拆开面板的剖视图绘制 */
export function drawInternalAny(ctx, w, h, type) {
  if (type === 'powerSupply') return drawPowerSupplyInternal(ctx, w, h)
  if (type === 'galvanometer') return drawGalvanometerInternal(ctx, w, h)
  return drawInternal(ctx, w, h, type)
}
