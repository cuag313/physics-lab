/**
 * 把屏幕/触点坐标映射到 canvas 逻辑坐标（CSS 像素）。
 *
 * 强制横屏时 #root 是 transform: rotate(90deg)，
 * getBoundingClientRect() 返回的是旋转后的包围盒，
 * 直接 clientX-left 会得到完全错误的点，导致“点不动”。
 */
export function mapClientToCanvas(canvas, clientX, clientY) {
  if (!canvas) return { x: 0, y: 0 }
  const rect = canvas.getBoundingClientRect()
  const forced = typeof document !== 'undefined'
    && document.documentElement.classList.contains('force-landscape')

  if (!forced) {
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  // #root: left:100%; top:0; transform-origin: top left; rotate(90deg) CW
  // 逆变换：local.x = 视觉 y；local.y = 视觉宽度 - 视觉 x
  const ax = clientX - rect.left
  const ay = clientY - rect.top
  return {
    x: ay,
    y: rect.width - ax,
  }
}

export function eventToCanvas(canvas, e) {
  if (!canvas) return { x: 0, y: 0 }
  // 优先用浏览器给出的本地坐标（对 CSS 旋转已经算对）
  if (e && e.target === canvas && typeof e.offsetX === 'number' && typeof e.offsetY === 'number') {
    // 合成 MouseEvent 的 offsetX 常为 0，此时退回逆变换
    const maybeFake = e.offsetX === 0 && e.offsetY === 0 && (e.clientX || e.clientY)
    if (!maybeFake) return { x: e.offsetX, y: e.offsetY }
  }
  const t = (e.touches && e.touches[0])
    || (e.changedTouches && e.changedTouches[0])
    || e
  if (t && t.clientX != null) {
    return mapClientToCanvas(canvas, t.clientX, t.clientY)
  }
  if (e && e.offsetX != null) {
    return { x: e.offsetX, y: e.offsetY }
  }
  return { x: 0, y: 0 }
}
