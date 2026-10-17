/**
 * circuitKit — 电路类实验共用绘制/交互工具
 * 以「串并联电路规律」验收通过的行为为金标准：
 * 三次贝塞尔接线 · 接线柱圆形热区（电源加大）· 变阻器左右止点 · 灯泡连续渐变
 */

/** 接线柱位置：左右两端；电源半长更大 */
export function getTerminals(comp) {
  const c = Math.cos(comp.rotation || 0), sn = Math.sin(comp.rotation || 0)
  const half = comp.type === 'battery' ? 38 : 40
  return [
    { x: comp.x - half * c, y: comp.y - half * sn },
    { x: comp.x + half * c, y: comp.y + half * sn },
  ]
}

export function getTermPos(comp, idx) { return getTerminals(comp)[idx] }

/** 接线热点：以接线柱为圆心的圆形热区 */
export function findTermAt(components, mx, my, R = 30) {
  for (const comp of components) {
    const terms = getTerminals(comp)
    for (let i = 0; i < terms.length; i++) {
      const dx = mx - terms[i].x, dy = my - terms[i].y
      if (dx * dx + dy * dy <= R * R) return { compId: comp.id, termIdx: i }
    }
  }
  return null
}

/** 连线目标吸附：更大圆区，排除源元件 */
export function findTermNear(components, mx, my, exceptCompId, R = 38) {
  let best = null, bestD = Infinity
  for (const comp of components) {
    if (comp.id === exceptCompId) continue
    const terms = getTerminals(comp)
    for (let i = 0; i < terms.length; i++) {
      const dx = mx - terms[i].x, dy = my - terms[i].y
      const d = dx * dx + dy * dy
      if (d <= R * R && d < bestD) {
        bestD = d
        best = { compId: comp.id, termIdx: i }
      }
    }
  }
  return best
}

/** 三次贝塞尔：从接线柱水平出线，曲线圆润 */
export function strokeBezierWire(ctx, f, t, color, m1, m2, fIdx = 0, tIdx = 1) {
  const ext = 42
  const fOut = fIdx === 0 ? -1 : 1
  const tOut = tIdx === 0 ? -1 : 1
  const c1 = m1 || { x: f.x + fOut * ext, y: f.y }
  const c2 = m2 || { x: t.x + tOut * ext, y: t.y }
  ctx.strokeStyle = color
  ctx.lineWidth = 1.8
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(f.x, f.y)
  ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, t.x, t.y)
  ctx.stroke()
  ctx.lineCap = 'butt'
  if (m1 || m2) {
    ctx.fillStyle = 'rgba(21,101,192,0.85)'
    if (m1) { ctx.beginPath(); ctx.arc(m1.x, m1.y, 3.5, 0, Math.PI * 2); ctx.fill() }
    if (m2) { ctx.beginPath(); ctx.arc(m2.x, m2.y, 3.5, 0, Math.PI * 2); ctx.fill() }
  }
  return { c1, c2 }
}

/** 连线预览：从接线柱水平出线的三次贝塞尔 */
export function strokeWirePreview(ctx, f, t, color, fIdx = 0) {
  const ext = 42
  const fOut = fIdx === 0 ? -1 : 1
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.setLineDash([6, 4])
  ctx.beginPath()
  ctx.moveTo(f.x, f.y)
  ctx.bezierCurveTo(f.x + fOut * ext, f.y, t.x + fOut * ext * 0.35, t.y, t.x, t.y)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.lineCap = 'butt'
}

/** 贝塞尔默认控制点（与 strokeBezierWire 一致） */
export function bezierCtrl(f, t, fIdx = 0, tIdx = 1, m1, m2) {
  const ext = 42
  const fOut = fIdx === 0 ? -1 : 1
  const tOut = tIdx === 0 ? -1 : 1
  return {
    m1x: m1?.x ?? f.x + fOut * ext,
    m1y: m1?.y ?? f.y,
    m2x: m2?.x ?? t.x + tOut * ext,
    m2y: m2?.y ?? t.y,
  }
}

/**
 * 灯泡亮度：随滑线变阻器连续渐变
 * 左 0Ω 最亮，右最大最暗但不熄灭
 * maxR 默认 50，无变阻器时传 0 则闭合=最亮
 */
export function bulbBrightness(on, sliderR = 0, maxR = 50) {
  if (!on) return 0
  if (!maxR) return 1
  const r = Math.max(0, Math.min(maxR, sliderR ?? 0))
  return 0.18 + 0.82 * (1 - r / maxR)
}

/** 标准灯泡符号：连续渐变（不是亮/灭两档） */
export function drawStdBulb(ctx, x, y, brightness) {
  const b = Math.max(0, Math.min(1, brightness || 0))
  const lit = b > 0.05
  const mix = lit ? b : 0
  const rC = Math.round(245 + (255 - 245) * mix)
  const gC = Math.round(245 + (235 - 245) * mix)
  const bC = Math.round(245 + (59 - 245) * mix)
  ctx.fillStyle = 'rgb(' + rC + ',' + gC + ',' + bC + ')'
  const edge = lit ? 0.35 + 0.65 * mix : 0
  ctx.strokeStyle = 'rgb(' + Math.round(153 + (249 - 153) * edge) + ',' + Math.round(153 + (168 - 153) * edge) + ',' + Math.round(153 + (40 - 153) * edge) + ')'
  ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.strokeStyle = lit ? 'rgba(230,80,0,' + (0.4 + 0.6 * mix) + ')' : '#999'
  ctx.lineWidth = 1.5
  const s = 14 * 0.55
  ctx.beginPath(); ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.stroke()
  if (lit && b > 0.08) {
    const gr = 28 + 30 * mix
    const glow = ctx.createRadialGradient(x, y, 14, x, y, gr)
    glow.addColorStop(0, 'rgba(255,235,59,' + (0.12 + 0.35 * mix) + ')')
    glow.addColorStop(1, 'rgba(255,235,59,0)')
    ctx.fillStyle = glow
    ctx.beginPath(); ctx.arc(x, y, gr, 0, Math.PI * 2); ctx.fill()
  }
}

/**
 * 滑线变阻器符号（箭头可移动）
 * 止点：左=0Ω 最亮，右=最大最暗不灭
 */
export function drawRheoSym(ctx, x, y, sliderR, maxR = 50) {
  const w = 70, h = 22
  const sr = sliderR != null ? sliderR : 20
  ctx.fillStyle = '#EFEBE9'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, 4); ctx.fill(); ctx.stroke()
  ctx.strokeStyle = '#5D4037'; ctx.lineWidth = 1.5; ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const px = x - w / 2 + 8 + i * (w - 16) / 5
    const py = y + (i % 2 === 0 ? -5 : 5)
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
  }
  ctx.stroke()
  const sliderX = x - w / 2 + 8 + (sr / maxR) * (w - 16)
  ctx.fillStyle = '#E65100'; ctx.beginPath()
  ctx.moveTo(sliderX, y - h / 2 - 8); ctx.lineTo(sliderX - 4, y - h / 2 - 2); ctx.lineTo(sliderX + 4, y - h / 2 - 2)
  ctx.closePath(); ctx.fill()
  // 止点标记
  ctx.fillStyle = '#999'
  ctx.fillRect(x - w / 2 + 2, y - h / 2 - 2, 2, h + 4)
  ctx.fillRect(x + w / 2 - 4, y - h / 2 - 2, 2, h + 4)
}

/** 变阻器滑片映射：带左右止点吸附（0 / maxR） */
export function mapSliderR(x, minX, maxX, maxR = 50) {
  let nx = Math.max(minX, Math.min(maxX, x))
  if (nx <= minX + 4) nx = minX
  if (nx >= maxX - 4) nx = maxX
  return Math.round(((nx - minX) / (maxX - minX)) * maxR)
}

/** 接线柱绘制：圆形热区，hover 高亮 */
export function drawTerminal(ctx, t, hov, src) {
  if (hov) {
    ctx.fillStyle = 'rgba(76,175,80,0.22)'
    ctx.beginPath(); ctx.arc(t.x, t.y, 16, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#4CAF50'
  } else if (src) {
    ctx.fillStyle = '#FF9800'
  } else {
    ctx.fillStyle = '#fff'
  }
  ctx.strokeStyle = hov ? '#2E7D32' : src ? '#E65100' : '#455A64'
  ctx.lineWidth = 2.5
  ctx.beginPath(); ctx.arc(t.x, t.y, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.fillStyle = hov ? '#1B5E20' : src ? '#BF360C' : '#78909C'
  ctx.beginPath(); ctx.arc(t.x, t.y, 3, 0, Math.PI * 2); ctx.fill()
}

/** 拖动热点：仅器材正中央，避免和端子抢 */
export function findCompAt(components, mx, my, R = 24) {
  for (let i = components.length - 1; i >= 0; i--) {
    const c = components[i]
    const dx = mx - c.x, dy = my - c.y
    if (dx * dx + dy * dy <= R * R) return c
  }
  return null
}

/** 双击删除：热点放宽到整个元件 */
export function findCompWide(components, mx, my) {
  for (const c of components) {
    if (Math.abs(mx - c.x) < 52 && Math.abs(my - c.y) < 40) return c
  }
  return null
}
