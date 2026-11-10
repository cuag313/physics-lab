/**
 * circuitKit — 电路类实验共用绘制/交互工具
 * 以「串并联电路规律」验收通过的行为为金标准：
 * 三次贝塞尔接线 · 接线柱圆形热区（电源加大）· 变阻器左右止点 · 灯泡连续渐变
 * 另含 PhET 风格版式工具：浅色工作区 · 贴元件读数芯片 · 显示勾选行
 */

/** 接线柱位置：左右两端；电源半长更大；万用表用底部红黑插孔 */
export function getTerminals(comp) {
  const c = Math.cos(comp.rotation || 0), sn = Math.sin(comp.rotation || 0)
  if (comp.type === 'multimeter') {
    // 端子就是底部红黑插孔（与表笔同源）
    return [MULTIMETER_JACK.R, MULTIMETER_JACK.B].map(j => ({
      x: comp.x + j.x * c - j.y * sn,
      y: comp.y + j.x * sn + j.y * c,
    }))
  }
  const half = 40
  return [
    { x: comp.x - half * c, y: comp.y - half * sn },
    { x: comp.x + half * c, y: comp.y + half * sn },
  ]
}

export function getTermPos(comp, idx) { return getTerminals(comp)[idx] }

/** 接线热点：以接线柱为圆心的圆形热区（R 调大到 36，降低「点不中」概率） */
export function findTermAt(components, mx, my, R = 36) {
  for (const comp of components) {
    // 万用表机身较大：端子热区收窄，避免整表被当成接线柱抢走点击
    const r = comp.type === 'multimeter' ? 14 : R
    const terms = getTerminals(comp)
    for (let i = 0; i < terms.length; i++) {
      const dx = mx - terms[i].x, dy = my - terms[i].y
      if (dx * dx + dy * dy <= r * r) return { compId: comp.id, termIdx: i }
    }
  }
  return null
}

/** 连线目标吸附：更大圆区，排除源元件 */
export function findTermNear(components, mx, my, exceptCompId, R = 46) {
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
    if (c.type === 'multimeter') {
      // 机身约 98×84：盒状热区，轻点/拖动落在表壳上
      if (Math.abs(dx) <= 58 && Math.abs(dy) <= 52) return c
    } else if (dx * dx + dy * dy <= R * R) return c
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

/**
 * 浅色工作区卡片 —— 电路画在一块独立的浅蓝面板上，视觉焦点集中到实验本身
 * @param rect {x,y,w,h} 画布绝对坐标
 */
export function drawWorkspace(ctx, rect) {
  const { x, y, w, h } = rect
  ctx.fillStyle = '#e8f3ff'
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill()
  ctx.strokeStyle = '#bcd7f2'; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.stroke()
}

/**
 * 贴元件读数芯片 —— 数值跟着元件走，不再只堆在右侧面板
 * @param opts.align 'center' | 'left' | 'right'（默认 center）
 * @returns 芯片包围盒，便于调用方登记点击区
 */
export function drawReadoutChip(ctx, x, y, text, color = '#1565C0', opts = {}) {
  const { align = 'center', font = 11, padX = 7, bg = 'rgba(255,255,255,0.96)' } = opts
  ctx.save()
  ctx.font = `bold ${font}px ui-monospace, Consolas, monospace`
  const tw = ctx.measureText(String(text)).width
  const w = tw + padX * 2
  const h = font + 9
  let bx = x - w / 2
  if (align === 'left') bx = x
  else if (align === 'right') bx = x - w
  const by = y - h / 2
  ctx.fillStyle = bg
  ctx.beginPath(); ctx.roundRect(bx, by, w, h, h / 2); ctx.fill()
  ctx.strokeStyle = color; ctx.lineWidth = 1.2
  ctx.beginPath(); ctx.roundRect(bx, by, w, h, h / 2); ctx.stroke()
  ctx.fillStyle = color
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(String(text), bx + w / 2, by + h / 2 + 0.5)
  ctx.restore()
  return { x: bx, y: by, w, h }
}

/**
 * 「显示」勾选行 —— PhET 式右侧开关：勾选才在画布上显示对应读数
 * @param items  [{key,label}]
 * @param state  {key: boolean}
 * @param opts   {font, gap, maxW} maxW 超宽自动换行
 * @returns [{key,x,y,w,h}] 调用方据此登记点击区
 */
export function drawToggleRow(ctx, x, y, items, state, opts = {}) {
  const { font = 11, gap = 6, maxW = Infinity } = opts
  const rowH = font + 12
  const rects = []
  ctx.save()
  ctx.font = `${font}px sans-serif`
  let cx = x, cy = y
  for (const it of items) {
    const w = ctx.measureText(it.label).width + 32
    if (cx > x && cx + w > x + maxW) { cx = x; cy += rowH + 5 }
    const on = !!state[it.key]
    ctx.fillStyle = on ? '#e8f2fd' : 'rgba(255,255,255,0.92)'
    ctx.beginPath(); ctx.roundRect(cx, cy, w, rowH, 6); ctx.fill()
    ctx.strokeStyle = on ? '#4A90D9' : '#d0d7de'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(cx, cy, w, rowH, 6); ctx.stroke()

    const bx = cx + 6, by = cy + rowH / 2 - 5
    ctx.fillStyle = on ? '#4A90D9' : '#fff'
    ctx.strokeStyle = on ? '#4A90D9' : '#b0b8c0'
    ctx.beginPath(); ctx.roundRect(bx, by, 10, 10, 2); ctx.fill(); ctx.stroke()
    if (on) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(bx + 2.6, by + 5.2); ctx.lineTo(bx + 4.4, by + 7.2); ctx.lineTo(bx + 7.4, by + 3.2); ctx.stroke()
      ctx.lineCap = 'butt'
    }
    ctx.fillStyle = on ? '#1a5a8a' : '#777'
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText(it.label, bx + 15, cy + rowH / 2 + 0.5)
    rects.push({ key: it.key, x: cx, y: cy, w, h: rowH })
    cx += w + gap
  }
  ctx.restore()
  return rects
}

// ══════════════════════════════════════════════════════════
//  实物化器材 —— 按真实教学器材外观绘制
//  基准尺寸按接线柱 ±40 设计，演示区可用 scale 缩小
// ══════════════════════════════════════════════════════════

/** 按近似最大值选电表量程（教学表 0.6A/3A、3V/15V） */
export function meterRange(kind, approxMax = 0) {
  if (kind === 'A') {
    for (const s of [0.6, 3, 5]) if (approxMax <= s) return s
    return 5
  }
  for (const s of [3, 15, 30]) if (approxMax <= s) return s
  return 30
}

/** 干电池（PhET 风格单节 5 号电池）半宽，供导线让位 */
export const BATTERY_HALF = 23

/** 干电池组实物：单节 AA 电池 —— 铜正极帽 + 银壳 + 标签色带（电压由读数芯片表达） */
export function drawRealBattery(ctx, x, y) {
  const w = BATTERY_HALF * 2, h = 17
  ctx.save(); ctx.translate(x, y)
  // 壳体
  const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2)
  g.addColorStop(0, '#f7f9fa'); g.addColorStop(0.4, '#d5dde2'); g.addColorStop(1, '#8d9aa3')
  ctx.fillStyle = g; ctx.strokeStyle = '#5c6b74'; ctx.lineWidth = 1.2
  ctx.beginPath(); ctx.roundRect(-BATTERY_HALF, -h / 2, w, h, 6); ctx.fill(); ctx.stroke()
  // 负极底（左端）
  ctx.fillStyle = '#78909c'
  ctx.beginPath(); ctx.roundRect(-BATTERY_HALF, -h / 2 + 2, 5, h - 4, 2); ctx.fill()
  // 标签色带 + 品牌字样
  ctx.fillStyle = '#1565C0'
  ctx.fillRect(-BATTERY_HALF + 8, -h / 2 + 1, 16, h - 2)
  ctx.fillStyle = '#FFC107'
  ctx.fillRect(-BATTERY_HALF + 26, -h / 2 + 1, 4, h - 2)
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = 'bold 7.5px sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('AA', -BATTERY_HALF + 16, 0)
  // 高光
  ctx.fillStyle = 'rgba(255,255,255,0.65)'
  ctx.beginPath(); ctx.roundRect(-BATTERY_HALF + 4, -h / 2 + 2.5, w - 16, 3, 1.5); ctx.fill()
  // 正极铜帽（右端）
  ctx.fillStyle = '#c77b30'; ctx.strokeStyle = '#8d5524'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.roundRect(BATTERY_HALF - 5, -5, 5, 10, 2); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#c62828'; ctx.font = 'bold 10px sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
  ctx.fillText('+', BATTERY_HALF - 2, -h / 2 - 3)
  ctx.restore()
}

/** 闸刀开关实物：胶木底座 + 铜接线柱 + 黄铜闸刀 + 红色绝缘手柄 */
export function drawRealSwitch(ctx, x, y, on, scale = 1) {
  ctx.save(); ctx.translate(x, y)
  if (scale !== 1) ctx.scale(scale, scale)
  // 引线（与导线同高 y=0，接进两端接线柱）
  ctx.strokeStyle = '#90a4ae'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(-24, 0); ctx.moveTo(24, 0); ctx.lineTo(40, 0); ctx.stroke()
  // 胶木底座（在导线下方展开）
  const g = ctx.createLinearGradient(0, -6, 0, 10)
  g.addColorStop(0, '#6d4c41'); g.addColorStop(1, '#4e342e')
  ctx.fillStyle = g; ctx.strokeStyle = '#3e2723'; ctx.lineWidth = 1.2
  ctx.beginPath(); ctx.roundRect(-30, -6, 60, 16, 3); ctx.fill(); ctx.stroke()
  // 铜接线柱（柱心在 y=0，与导线齐平）
  for (const bx of [-22, 22]) {
    ctx.fillStyle = '#b07a3c'; ctx.strokeStyle = '#7a4f1e'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(bx, 0, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#8a5a22'
    ctx.beginPath(); ctx.arc(bx, 0, 1.8, 0, Math.PI * 2); ctx.fill()
  }
  // 闸刀（闭合水平贴合 / 断开上翘）
  const tipX = on ? 22 : 16, tipY = on ? 0 : -14
  ctx.strokeStyle = on ? '#e6b74a' : '#cfa027'; ctx.lineWidth = 4.5; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(tipX, tipY); ctx.stroke()
  ctx.lineCap = 'butt'
  // 绝缘手柄
  ctx.fillStyle = '#e53935'; ctx.strokeStyle = '#b71c1c'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.arc(tipX, tipY, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.restore()
}

/** 滑动变阻器实物：瓷筒密绕线圈 + 金属滑杆 + 橙色滑片 */
export function drawRealRheostat(ctx, x, y, R, maxR = 50, scale = 1) {
  ctx.save(); ctx.translate(x, y)
  if (scale !== 1) ctx.scale(scale, scale)
  // 引线：从导线高度斜接进瓷筒两端的接线柱
  ctx.strokeStyle = '#90a4ae'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(-33, 6); ctx.moveTo(40, 0); ctx.lineTo(33, 6); ctx.stroke()
  for (const px of [-31, 31]) {
    ctx.fillStyle = '#b07a3c'; ctx.strokeStyle = '#7a4f1e'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(px, 6, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  }
  // 瓷筒
  const g = ctx.createLinearGradient(0, -4, 0, 14)
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#efebe4'); g.addColorStop(1, '#cfc6bc')
  ctx.fillStyle = g; ctx.strokeStyle = '#b7ada2'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.roundRect(-30, -4, 60, 18, 5); ctx.fill(); ctx.stroke()
  // 密绕线圈
  ctx.save()
  ctx.beginPath(); ctx.roundRect(-30, -4, 60, 18, 5); ctx.clip()
  ctx.strokeStyle = '#8d6e63'; ctx.lineWidth = 1.6
  for (let i = 0; i < 26; i++) {
    const px = -29 + i * 2.35
    ctx.beginPath(); ctx.moveTo(px, -6); ctx.lineTo(px, 16); ctx.stroke()
  }
  ctx.restore()
  // 支脚
  ctx.fillStyle = '#78909c'
  ctx.beginPath(); ctx.roundRect(-26, 14, 8, 5, 1); ctx.fill()
  ctx.beginPath(); ctx.roundRect(18, 14, 8, 5, 1); ctx.fill()
  // 金属滑杆
  ctx.strokeStyle = '#b0bec5'; ctx.lineWidth = 3.5
  ctx.beginPath(); ctx.moveTo(-34, -14); ctx.lineTo(34, -14); ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(-34, -15.4); ctx.lineTo(34, -15.4); ctx.stroke()
  // 滑片 + 触点
  const ratio = Math.max(0, Math.min(1, (R || 0) / maxR))
  const sx = -28 + ratio * 56
  ctx.fillStyle = '#ef6c00'; ctx.strokeStyle = '#e65100'; ctx.lineWidth = 1.2
  ctx.beginPath(); ctx.roundRect(sx - 5, -19, 10, 9, 2); ctx.fill(); ctx.stroke()
  ctx.strokeStyle = '#e65100'; ctx.lineWidth = 2.5
  ctx.beginPath(); ctx.moveTo(sx, -10); ctx.lineTo(sx, -3); ctx.stroke()
  ctx.restore()
}

/** 色环电阻实物：釉面本体 + 四道色环 + 两端引线 */
export function drawRealResistor(ctx, x, y, scale = 1) {
  ctx.save(); ctx.translate(x, y)
  if (scale !== 1) ctx.scale(scale, scale)
  ctx.strokeStyle = '#b0bec5'; ctx.lineWidth = 1.8
  ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(-22, 0); ctx.moveTo(22, 0); ctx.lineTo(40, 0); ctx.stroke()
  const g = ctx.createLinearGradient(0, -8, 0, 8)
  g.addColorStop(0, '#f5e9db'); g.addColorStop(0.5, '#e6d3bd'); g.addColorStop(1, '#cbb59a')
  ctx.fillStyle = g; ctx.strokeStyle = '#a1887f'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.roundRect(-22, -8, 44, 16, 7); ctx.fill(); ctx.stroke()
  for (const [i, c] of ['#b71c1c', '#1565c0', '#ef6c00', '#ffd54f'].entries()) {
    ctx.fillStyle = c; ctx.fillRect(-14 + i * 7, -8, 3.5, 16)
  }
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.fillRect(-16, -6, 34, 2)
  ctx.restore()
}

/**
 * 教学电表实物：黑壳 + 白表盘刻度弧 + 指针 + 红黑接线柱
 * @param opts {kind:'A'|'V', value, max 量程, scale, showValue}
 */
export function drawRealMeter(ctx, x, y, opts = {}) {
  const { kind = 'A', value = 0, max = 3, scale = 1, showValue = true } = opts
  const W = 76, H = 62
  ctx.save(); ctx.translate(x, y)
  if (scale !== 1) ctx.scale(scale, scale)

  // 外壳
  const shell = ctx.createLinearGradient(0, -H / 2, 0, H / 2)
  shell.addColorStop(0, '#51585d'); shell.addColorStop(0.5, '#33383c'); shell.addColorStop(1, '#202427')
  ctx.fillStyle = shell; ctx.strokeStyle = '#14171a'; ctx.lineWidth = 1.4
  ctx.beginPath(); ctx.roundRect(-W / 2, -H / 2, W, H, 7); ctx.fill(); ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.10)'
  ctx.beginPath(); ctx.roundRect(-W / 2 + 4, -H / 2 + 3, W - 8, 5, 3); ctx.fill()

  // 表盘窗
  ctx.fillStyle = '#fdfdf8'; ctx.strokeStyle = '#c7ccd0'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.roundRect(-32, -24, 64, 34, 4); ctx.fill(); ctx.stroke()

  // 刻度弧（上半弧 200°→340°）
  const cx = 0, cy = 4, r = 22
  const a0 = (200 * Math.PI) / 180, a1 = (340 * Math.PI) / 180
  ctx.strokeStyle = '#555'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke()
  ctx.font = '7px sans-serif'; ctx.fillStyle = '#666'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  for (let i = 0; i <= 10; i++) {
    const a = a0 + ((a1 - a0) * i) / 10
    const len = i % 5 === 0 ? 6 : 3.5
    const x1 = cx + Math.cos(a) * r, y1 = cy + Math.sin(a) * r
    const x2 = cx + Math.cos(a) * (r - len), y2 = cy + Math.sin(a) * (r - len)
    ctx.strokeStyle = '#333'; ctx.lineWidth = i % 5 === 0 ? 1.4 : 0.9
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    if (i % 5 === 0) {
      ctx.fillStyle = '#777'
      const lab = Math.round((max * i) / 10 * 100) / 100
      ctx.fillText(String(lab), cx + Math.cos(a) * (r - 11), cy + Math.sin(a) * (r - 11))
    }
  }

  // 表盘符号（指针之下）
  const symColor = kind === 'A' ? '#c62828' : '#1b5e20'
  ctx.fillStyle = symColor; ctx.font = 'bold 14px sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(kind, 0, -4)

  // 指针（clamp 到量程，超量程贴满）
  const t = max > 0 ? Math.max(0, Math.min(1, (value || 0) / max)) : 0
  const pa = a0 + (a1 - a0) * t
  ctx.strokeStyle = '#d84315'; ctx.lineWidth = 1.8; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(cx, cy)
  ctx.lineTo(cx + Math.cos(pa) * (r - 2), cy + Math.sin(pa) * (r - 2))
  ctx.stroke(); ctx.lineCap = 'butt'
  ctx.fillStyle = '#263238'
  ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill()

  // 表笔引线：从两侧接线口沿机壳下行，接到红(左)/黑(右)接线柱
  for (const sgn of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(sgn * 40, 0)
    ctx.lineTo(sgn * 40, 16)
    ctx.lineTo(sgn * 27, 20)
    ctx.lineCap = 'round'
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 4.5
    ctx.stroke()
    ctx.strokeStyle = '#dfe6ea'; ctx.lineWidth = 2.2
    ctx.stroke()
    ctx.lineCap = 'butt'
  }
  // 接线柱：红(+)在左，黑(−)在右
  for (const [bx, c, dk] of [[-27, '#e53935', '#b71c1c'], [27, '#212121', '#000']]) {
    ctx.fillStyle = '#b0bec5'
    ctx.beginPath(); ctx.roundRect(bx - 6.5, 14, 13, 13, 3); ctx.fill()
    ctx.fillStyle = c; ctx.strokeStyle = dk; ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(bx, 20.5, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.beginPath(); ctx.arc(bx - 1.5, 19, 1.6, 0, Math.PI * 2); ctx.fill()
  }

  // 表盘右下印量程
  ctx.fillStyle = '#888'; ctx.font = '7px sans-serif'
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
  ctx.fillText(`${max}${kind}`, 30, 8)

  ctx.restore()
  // 读数芯片由调用方按绝对坐标绘制（不随元件旋转）
  return { showValue, w: W * scale, h: H * scale }
}

/**
 * 万用表 V/A 档位按钮（机身局部坐标，与 drawRealMultimeter 绘制一致）
 * 点击即切档 —— 比「点整表切换」更直白
 */
export const MULTIMETER_MODE_BTN = [
  { label: 'V', x: -40, y: 14, w: 38, h: 16, tint: '#1976d2' },
  { label: 'A', x: 2, y: 14, w: 38, h: 16, tint: '#e65100' },
]

/** 命中 V/A 档位按钮：返回 'V' | 'A' | null（world 坐标，含 8px 容差） */
export function hitMultimeterModeBtn(comp, mx, my) {
  const cos = Math.cos(comp.rotation || 0), sin = Math.sin(comp.rotation || 0)
  const dx = mx - comp.x, dy = my - comp.y
  // 世界 → 机身局部
  const lx = dx * cos + dy * sin
  const ly = -dx * sin + dy * cos
  for (const b of MULTIMETER_MODE_BTN) {
    if (lx >= b.x - 12 && lx <= b.x + b.w + 12 && ly >= b.y - 12 && ly <= b.y + b.h + 12) return b.label
  }
  return null
}

/**
 * 万用表：仿 PhET 电压表仪态 — 蓝灰仪器壳 + 内嵌读数窗 + V/A 档位条 + 红黑插孔
 * 点 V / A 按钮切换档位
 * @param opts {mode:'V'|'A', value, scale}
 */
export function drawRealMultimeter(ctx, x, y, opts = {}) {
  const { mode = 'V', value = 0, scale = 1 } = opts
  const W = 100, H = 94
  const live = value != null
  const isA = mode === 'A'
  ctx.save(); ctx.translate(x, y)
  if (scale !== 1) ctx.scale(scale, scale)

  // 落影：让表「浮」在网格纸上
  ctx.fillStyle = 'rgba(0,0,0,0.10)'
  ctx.beginPath(); ctx.roundRect(-W / 2 + 2, -H / 2 + 5, W, H, 14); ctx.fill()

  // 壳体：PhET 电压表式蓝灰，上浅下深
  const bodyGrad = ctx.createLinearGradient(0, -H / 2, 0, H / 2)
  bodyGrad.addColorStop(0, '#e8edf1')
  bodyGrad.addColorStop(0.38, '#b8c4cc')
  bodyGrad.addColorStop(1, '#7f909c')
  ctx.fillStyle = bodyGrad
  ctx.strokeStyle = '#455a64'
  ctx.lineWidth = 2.2
  ctx.beginPath(); ctx.roundRect(-W / 2, -H / 2, W, H, 14); ctx.fill(); ctx.stroke()
  // 顶部高光棱
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.beginPath(); ctx.roundRect(-W / 2 + 6, -H / 2 + 4, W - 12, 5, 3); ctx.fill()

  // 型号丝印：万用表 · DC
  ctx.fillStyle = '#37474f'
  ctx.font = 'bold 11px "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('万用表', 0, -H / 2 + 15)
  ctx.fillStyle = '#546e7a'
  ctx.font = 'bold 8px sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText('DC', W / 2 - 10, -H / 2 + 15)

  // 读数窗：内嵌黑框 + 奶油屏（上半区，避开档位/插孔）
  const rw = 82, rh = 30, ry = -H / 2 + 24
  ctx.fillStyle = '#37474f'
  ctx.beginPath(); ctx.roundRect(-rw / 2 - 3, ry - 3, rw + 6, rh + 6, 8); ctx.fill()
  const lcd = ctx.createLinearGradient(0, ry, 0, ry + rh)
  lcd.addColorStop(0, '#fffef5')
  lcd.addColorStop(1, '#e8e4d4')
  ctx.fillStyle = lcd
  ctx.beginPath(); ctx.roundRect(-rw / 2, ry, rw, rh, 5); ctx.fill()
  // 档位角标 DCV / DCA
  ctx.fillStyle = '#607d8b'
  ctx.font = 'bold 8px sans-serif'
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  ctx.fillText(isA ? 'DCA' : 'DCV', -rw / 2 + 5, ry + 4)
  // 主读数
  ctx.fillStyle = live ? '#1a237e' : '#9e9e9e'
  ctx.font = 'bold 18px ui-monospace, Consolas, monospace'
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
  if (live) {
    const txt = isA ? (value || 0).toFixed(3) : (value || 0).toFixed(2)
    ctx.fillText(txt, rw / 2 - 14, ry + rh / 2 + 2)
  } else {
    ctx.fillText('----', rw / 2 - 14, ry + rh / 2 + 2)
  }
  ctx.font = 'bold 12px sans-serif'
  ctx.fillStyle = isA ? '#e65100' : '#1565c0'
  ctx.fillText(isA ? 'A' : 'V', rw / 2 - 4, ry + rh / 2 + 2)

  // V / A 档位条（当前档高亮，PhET 按钮蓝）—— 独占中带，不与插孔重叠
  // 命中区与绘制一致，见 MULTIMETER_MODE_BTN
  ctx.font = 'bold 13px sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  for (const [bx, by, bw, bh, label, active, tint] of MULTIMETER_MODE_BTN.map(b =>
    [b.x, b.y, b.w, b.h, b.label, b.label === (isA ? 'A' : 'V'), b.tint])) {
    ctx.fillStyle = active ? tint : 'rgba(69,90,100,0.28)'
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 10); ctx.fill()
    if (active) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.roundRect(bx + 0.5, by + 0.5, bw - 1, bh - 1, 10); ctx.stroke()
    }
    ctx.fillStyle = active ? '#fff' : '#546e7a'
    ctx.fillText(label, bx + bw / 2, by + bh / 2)
  }

  // 底部红黑插孔：金属座圈 + 彩色芯（表笔线起点 / 接线柱）
  for (const [px, col, dk] of [[-28, '#e53935', '#b71c1c'], [28, '#212121', '#000']]) {
    const ring = ctx.createLinearGradient(px - 10, 0, px + 10, 0)
    ring.addColorStop(0, '#cfd8dc'); ring.addColorStop(0.5, '#90a4ae'); ring.addColorStop(1, '#607d8b')
    ctx.fillStyle = ring
    ctx.beginPath(); ctx.roundRect(px - 11, H / 2 - 18, 22, 20, 7); ctx.fill()
    ctx.fillStyle = col; ctx.strokeStyle = dk; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(px, H / 2 - 8, 6.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.beginPath(); ctx.arc(px - 2, H / 2 - 13.5, 2.2, 0, Math.PI * 2); ctx.fill()
  }

  ctx.restore()
}

/** 万用表表笔插孔（表笔线起点，元件局部坐标）：红在左、黑在右 */
export const MULTIMETER_JACK = {
  R: { x: -28, y: 39 },
  B: { x: 28, y: 39 },
}
