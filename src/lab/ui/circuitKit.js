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

/**
 * 操作说明气泡：固定在实验区左上角（不遮挡电路器材）
 * 高度随文字行数自适应，保证装下全部文字。
 * 返回 clickAreas 条目（整块可点开/收起），由调用方 push 到 canvas._clickAreas
 */
export function drawGuideBubble(ctx, cvX, cvY, compact, expanded, lines, onClick) {
  const lineH = compact ? 18 : 16
  const headH = compact ? 26 : 28
  const pad = 8
  const bodyH = expanded ? (lines.length * lineH + pad + 6) : 0
  const bh = headH + bodyH
  const bw = compact ? Math.min(200, Math.max(100, 16 + maxTextW(ctx, lines, compact))) : 220
  const bx = cvX + 10, by = cvY + 10

  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.strokeStyle = '#1976D2'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 6); ctx.fill(); ctx.stroke()

  // 标题栏
  ctx.fillStyle = '#1976D2'; ctx.font = 'bold 11px sans-serif'
  if (compact) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(expanded ? '收起 ▲' : '操作说明 ▼', bx + bw / 2, by + headH / 2)
  } else {
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('📖 操作说明', bx + 8, by + 7)
    ctx.textAlign = 'right'; ctx.font = '10px sans-serif'
    ctx.fillText(expanded ? '收起 ▲' : '展开 ▼', bx + bw - 8, by + 8)
  }

  // 正文：完整放下所有行
  if (expanded) {
    ctx.fillStyle = '#333'
    ctx.font = compact ? '10px sans-serif' : '11px sans-serif'
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(compact ? '· ' + lines[i] : lines[i], bx + 10, by + headH + pad + i * lineH)
    }
  }
  ctx.textBaseline = 'alphabetic'
  return { x: bx, y: by, w: bw, h: bh, onClick }
}

function maxTextW(ctx, lines, compact) {
  ctx.font = compact ? '10px sans-serif' : '11px sans-serif'
  let w = 0
  for (const t of lines) w = Math.max(w, ctx.measureText('· ' + t).width)
  return w
}

/** 串并联同款开关（插头式：底座+两接线柱+闸刀） */
export function drawBuilderSwitch(ctx, closed) {
  const sw = closed !== false
  ctx.fillStyle = '#ECEFF1'; ctx.strokeStyle = '#78909C'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.roundRect(-36, -16, 72, 32, 6); ctx.fill(); ctx.stroke()
  // 接线柱（插头脚）
  ctx.fillStyle = '#546E7A'
  ctx.beginPath(); ctx.arc(-24, 0, 5, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(24, 0, 5, 0, Math.PI * 2); ctx.fill()
  // 闸刀
  if (sw) {
    ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(24, 0); ctx.stroke(); ctx.lineCap = 'butt'
  } else {
    ctx.strokeStyle = '#F44336'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(16, -18); ctx.stroke(); ctx.lineCap = 'butt'
  }
  ctx.fillStyle = sw ? '#4CAF50' : '#F44336'
  ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  ctx.fillText(sw ? 'ON' : 'OFF', 0, 18)
  ctx.textBaseline = 'alphabetic'
}

/** 器材栏小图标（串并联同款） */
export function drawRealisticIcon(ctx, x, y, type) {
  ctx.save(); ctx.translate(x, y)
  if (type === 'battery') {
    ctx.fillStyle = '#81C784'; ctx.strokeStyle = '#388E3C'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.roundRect(-14, -10, 28, 20, 3); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('+ −', 0, 0)
  } else if (type === 'bulb') {
    ctx.fillStyle = '#FFFDE7'; ctx.strokeStyle = '#F9A825'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(0, -2, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#9E9E9E'; ctx.fillRect(-5, 8, 10, 5)
    ctx.strokeStyle = '#E65100'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(-4, -6); ctx.lineTo(4, 2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(4, -6); ctx.lineTo(-4, 2); ctx.stroke()
  } else if (type === 'switch') {
    ctx.fillStyle = '#ECEFF1'; ctx.strokeStyle = '#90A4AE'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.roundRect(-14, -6, 28, 12, 3); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#666'; ctx.beginPath(); ctx.arc(-8, 0, 2.5, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(8, 0, 2.5, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 2; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(5, -6); ctx.stroke(); ctx.lineCap = 'butt'
  } else if (type === 'resistor') {
    ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.roundRect(-14, -6, 28, 12, 2); ctx.fill(); ctx.stroke()
    const bands = ['#B71C1C', '#4CAF50', '#FF9800', '#FFD54F']
    bands.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(-10 + i * 7, -6, 4, 12) })
  } else if (type === 'rheostat') {
    ctx.fillStyle = '#EFEBE9'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.roundRect(-16, -6, 32, 12, 2); ctx.fill(); ctx.stroke()
    ctx.strokeStyle = '#5D4037'; ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = 0; i < 5; i++) {
      const px = -12 + i * 6, py = (i % 2 === 0) ? -3 : 3
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.stroke()
    ctx.fillStyle = '#E65100'
    ctx.beginPath(); ctx.moveTo(2, -10); ctx.lineTo(-1, -5); ctx.lineTo(5, -5); ctx.closePath(); ctx.fill()
  } else if (type === 'ammeter') {
    ctx.fillStyle = '#FFEBEE'; ctx.strokeStyle = '#E53935'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('A', 0, 0)
  } else if (type === 'voltmeter') {
    ctx.fillStyle = '#E8F5E9'; ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#4CAF50'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('V', 0, 0)
  }
  ctx.restore()
}

/**
 * 画布上的器材（串并联同款外观）
 * engineResult: { ok, results: Map<id, {current, voltage, power}> }
 * 灯泡亮度：优先随滑线变阻器连续渐变，其次按功率
 */
export function drawBuilderComp(ctx, comp, s, circuit, engineResult) {
  const { x, y, type, rotation } = comp
  const isClosed = circuit && circuit.closed
  ctx.save(); ctx.translate(x, y); ctx.rotate(rotation || 0)
  if (s.dragId === comp.id) ctx.globalAlpha = 0.6

  if (type === 'battery') {
    const grd = ctx.createLinearGradient(-35, -22, 35, 22)
    grd.addColorStop(0, '#A5D6A7'); grd.addColorStop(0.5, '#66BB6A'); grd.addColorStop(1, '#43A047')
    ctx.fillStyle = grd; ctx.strokeStyle = '#2E7D32'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(-35, -22, 70, 44, 6); ctx.fill(); ctx.stroke()
    ctx.strokeStyle = '#1B5E20'; ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.moveTo(-14, -16); ctx.lineTo(-14, 16); ctx.stroke()
    ctx.lineWidth = 5
    ctx.beginPath(); ctx.moveTo(14, -8); ctx.lineTo(14, 8); ctx.stroke()
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText('+', -40, -24)
    ctx.fillStyle = '#333'; ctx.font = 'bold 15px sans-serif'
    ctx.fillText('−', 40, -16)
    ctx.textBaseline = 'alphabetic'
  } else if (type === 'bulb') {
    const brightness = (() => {
      if (!isClosed) return 0
      const rheo = s.components.find(c => c.type === 'rheostat')
      if (rheo) {
        const rr = Math.max(0, Math.min(50, rheo.props?.resistance ?? 0))
        return 0.18 + 0.82 * (1 - rr / 50)
      }
      if (engineResult?.ok && engineResult.results) {
        const r = engineResult.results.get(comp.id)
        if (r && r.power != null) {
          const maxP = ((s.U || 6) ** 2) / 10
          const t = Math.max(0, Math.min(1, r.power / maxP))
          return 0.18 + 0.82 * t
        }
      }
      return isClosed ? 1 : 0
    })()
    const b = Math.max(0, Math.min(1, brightness))
    const mix = b
    const rC = Math.round(250 + (255 - 250) * mix)
    const gC = Math.round(250 + (235 - 250) * mix)
    const bC = Math.round(250 + (59 - 250) * mix)
    ctx.fillStyle = `rgb(${rC},${gC},${bC})`
    ctx.strokeStyle = b > 0.05 ? `rgb(${Math.round(180 + 69 * mix)},${Math.round(180 - 12 * mix)},${Math.round(180 - 140 * mix)})` : '#bbb'
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(0, -6, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.strokeStyle = b > 0.05 ? `rgba(230,80,0,${0.35 + 0.65 * mix})` : '#999'
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(-8, -14); ctx.lineTo(8, 2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(8, -14); ctx.lineTo(-8, 2); ctx.stroke()
    ctx.fillStyle = '#9E9E9E'; ctx.strokeStyle = '#616161'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(-10, 14, 20, 10, 2); ctx.fill(); ctx.stroke()
    if (b > 0.08) {
      const gr = 30 + 28 * mix
      const glow = ctx.createRadialGradient(0, -6, 15, 0, -6, gr)
      glow.addColorStop(0, `rgba(255,235,59,${0.12 + 0.35 * mix})`)
      glow.addColorStop(1, 'rgba(255,235,59,0)')
      ctx.fillStyle = glow
      ctx.beginPath(); ctx.arc(0, -6, gr, 0, Math.PI * 2); ctx.fill()
    }
    ctx.fillStyle = '#F57F17'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('灯泡', 0, 26)
  } else if (type === 'switch') {
    drawBuilderSwitch(ctx, comp.closed)
  } else if (type === 'resistor') {
    ctx.fillStyle = '#EFEBE9'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(-34, -14, 68, 28, 4); ctx.fill(); ctx.stroke()
    const bands = ['#B71C1C', '#43A047', '#FF6F00', '#FFD54F']
    bands.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(-24 + i * 15, -14, 8, 28) })
    ctx.fillStyle = '#333'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('10Ω', 0, 16)
  } else if (type === 'rheostat') {
    const r = comp.props?.resistance ?? 20
    ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#6D4C41'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(-40, -10, 80, 20, 3); ctx.fill(); ctx.stroke()
    ctx.strokeStyle = '#5D4037'; ctx.lineWidth = 1.2
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const px = -34 + i * 7, py = (i % 2 === 0) ? -6 : 6
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.stroke()
    ctx.strokeStyle = '#90A4AE'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(-40, -18); ctx.lineTo(40, -18); ctx.stroke()
    ctx.fillStyle = '#37474F'
    ctx.beginPath(); ctx.roundRect(-44, -26, 6, 16, 2); ctx.fill()
    ctx.beginPath(); ctx.roundRect(38, -26, 6, 16, 2); ctx.fill()
    for (let g = -32; g <= 32; g += 16) {
      ctx.strokeStyle = '#B0BEC5'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(g, -18); ctx.lineTo(g, -12); ctx.stroke()
    }
    const sliderX = -40 + (r / 50) * 80
    ctx.fillStyle = '#E65100'
    ctx.beginPath(); ctx.moveTo(sliderX, -18); ctx.lineTo(sliderX - 8, -5); ctx.lineTo(sliderX + 8, -5); ctx.closePath(); ctx.fill()
    ctx.beginPath(); ctx.arc(sliderX, -20, 7, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(`${r}Ω`, 0, 16)
    ctx.font = '8px sans-serif'; ctx.fillStyle = '#78909C'
    ctx.fillText('亮', -40, 28)
    ctx.fillText('暗', 40, 28)
  } else if (type === 'ammeter') {
    const r = (isClosed && engineResult?.ok && engineResult.results) ? engineResult.results.get(comp.id) : null
    const cur = r ? r.current : 0
    ctx.fillStyle = '#FFCDD2'; ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#B71C1C'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('A', 0, -8)
    ctx.fillStyle = '#333'; ctx.font = 'bold 10px monospace'
    ctx.fillText(isClosed ? `${Math.abs(cur).toFixed(2)}A` : '--', 0, 10)
  } else if (type === 'voltmeter') {
    const r = (isClosed && engineResult?.ok && engineResult.results) ? engineResult.results.get(comp.id) : null
    const volt = r ? Math.abs(r.voltage) : 0
    ctx.fillStyle = '#C8E6C9'; ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#1B5E20'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('V', 0, -8)
    ctx.fillStyle = '#333'; ctx.font = 'bold 10px monospace'
    ctx.fillText(isClosed ? `${volt.toFixed(1)}V` : '--', 0, 10)
  }
  // 中心拖动把手
  ctx.fillStyle = 'rgba(0,0,0,0.12)'
  ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 1; ctx.restore()

  // 接线柱（绝对坐标）
  const terms = getTerminals(comp)
  for (let i = 0; i < terms.length; i++) {
    const t = terms[i]
    const hov = s.hoverTerm && s.hoverTerm.compId === comp.id && s.hoverTerm.termIdx === i
    const src = s.connecting && s.connecting.compId === comp.id && s.connecting.termIdx === i
    drawTerminal(ctx, t, hov, src)
  }
}
