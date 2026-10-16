/**
 * 画布布局：电脑宽裕 / 手机横屏紧凑
 *
 * 电脑：画布高、宽裕时，右侧可画数据板；说明步骤不占画布
 * 手机：高较矮，电路尽量吃满，只留底部一行读数
 */
export function fitLayout(W, H) {
  const compact = H < 380 || W / Math.max(H, 1) > 2.4
  if (compact) {
    return {
      compact: true,
      // 电路区：上下少留白
      circuit: { L: W * 0.04, R: W * 0.62, T: 28, B: H - 36 },
      // 读数条
      readout: { x: W * 0.64, y: 8, w: W * 0.34, h: H - 16 },
      guide: null, // 说明走 InfoDock，不画在画布
      font: { title: 12, label: 10, body: 11, data: 11 },
    }
  }
  return {
    compact: false,
    circuit: { L: W * 0.05, R: W * 0.52, T: 56, B: H - 48 },
    readout: { x: W * 0.56, y: 48, w: W * 0.4, h: H - 88 },
    guide: { w: 240, h: 92 },
    font: { title: 15, label: 10, body: 12, data: 12 },
  }
}

/** 在 rect 内画圆角白底说明框（仅桌面使用） */
export function drawPanel(ctx, rect, title) {
  const { x, y, w, h } = rect
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 8)
  ctx.fill()
  ctx.strokeStyle = '#ddd'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 8)
  ctx.stroke()
  if (title) {
    ctx.fillStyle = '#1565C0'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(title, x + 12, y + 10)
  }
  return { x: x + 12, y: y + (title ? 32 : 12), w: w - 24, h: h - (title ? 44 : 24) }
}

/** 自动换行文字 */
export function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const chars = String(text).split('')
  let line = ''
  let yy = y
  for (let i = 0; i < chars.length; i++) {
    const test = line + chars[i]
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy)
      line = chars[i]
      yy += lineHeight
    } else {
      line = test
    }
  }
  if (line) ctx.fillText(line, x, yy)
  return yy + lineHeight
}
