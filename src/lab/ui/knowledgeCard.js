/**
 * ui/knowledgeCard.js — Tab1 右上角「暖色知识卡片」的公共画法
 *
 * 从 SimpleCircuitScene 的 drawKnowledge 原样抽出，供各电学场景复用：
 * 卡片自动从 13px 逐档收缩到 8px 去找能装下 7 节内容的字号；
 * 内容区 clip 兜底，极端小窗口也保证字只在框内、不压到底部读数行。
 *
 * SECTIONS 结构：[{ t: '小节名', c: '#颜色', items: [ [ ['普通文字'], ['高亮文字','#色',1], ... ] ] }]
 *   一个 item 是一行富文本，runs 里每个元素 = [文字, 颜色?, 加粗?]
 */
export function drawKnowledgeCard(ctx, rect, SECTIONS, opts = {}) {
  const { x, y, w, h } = rect
  const pad = 16
  const left = x + pad
  const maxW = w - pad * 2
  const headH = 12 + 34 + 18          // 标题药丸占高
  const tipH = opts.tip ? 34 : 12     // 底部读数/提示行

  const rhythm = (fs) => (fs >= 11
    ? { line: 6, item: 3, sec: 7, head: 26 }
    : fs >= 9.5
      ? { line: 5, item: 2.5, sec: 5, head: 24 }
      : { line: 4.5, item: 2, sec: 4, head: 22 })

  const measure = (fs) => {
    const R = rhythm(fs)
    let total = 0
    for (const sec of SECTIONS) {
      total += R.head
      for (const it of sec.items) {
        ctx.font = `${fs}px "Microsoft YaHei", sans-serif`
        total += layoutRuns(ctx, it, maxW - 16, fs).length * (fs + R.line) + R.item
      }
      total += R.sec
    }
    return total
  }

  const FITS = [13, 12.5, 12, 11.5, 11, 10.5, 10, 9.5, 9, 8.5, 8]
  let fs = FITS[FITS.length - 1], contentH = 0
  for (const cand of FITS) { fs = cand; contentH = measure(cand); if (headH + contentH + tipH + 14 <= h) break }
  const cardH = Math.min(h, headH + contentH + tipH + 14)
  const R = rhythm(fs)

  ctx.save()
  // 卡片：暖白渐变 + 暖描边 + 柔和投影（高度=内容高，不留大片空白）
  ctx.shadowColor = 'rgba(203,132,62,0.22)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6
  ctx.fillStyle = '#FFFCF6'
  ctx.beginPath(); ctx.roundRect(x, y, w, cardH, 14); ctx.fill()
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0
  const cardBg = ctx.createLinearGradient(x, y, x, y + cardH)
  cardBg.addColorStop(0, 'rgba(255,251,244,1)')
  cardBg.addColorStop(1, 'rgba(255,243,227,1)')
  ctx.fillStyle = cardBg
  ctx.beginPath(); ctx.roundRect(x, y, w, cardH, 14); ctx.fill()
  ctx.strokeStyle = '#F2DCC0'; ctx.lineWidth = 1.2
  ctx.beginPath(); ctx.roundRect(x, y, w, cardH, 14); ctx.stroke()

  // 标题药丸（暖橙渐变胶囊 + 高光）；宽度按标题实测，短标题不留大空
  const title = opts.title || '📖 知识点'
  ctx.font = 'bold 14px "Microsoft YaHei", sans-serif'
  const tW = Math.max(132, ctx.measureText(title).width + 34), tH = 34
  const gTitle = ctx.createLinearGradient(x + pad, y + 12, x + pad + tW, y + 12 + tH)
  gTitle.addColorStop(0, '#F59E0B'); gTitle.addColorStop(1, '#EA580C')
  ctx.fillStyle = gTitle
  ctx.beginPath(); ctx.roundRect(x + pad, y + 12, tW, tH, 17); ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.28)'
  ctx.beginPath(); ctx.roundRect(x + pad + 5, y + 15, tW - 10, 9, 5); ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(title, x + pad + tW / 2, y + 12 + tH / 2 + 1)

  // 内容区裁剪：极端小窗口下也保证字只在框内、不压到底部读数行
  ctx.save()
  ctx.beginPath()
  ctx.rect(left - 6, y + 2, maxW + 12, cardH - tipH - 2)
  ctx.clip()

  let cy = y + headH
  for (const sec of SECTIONS) {
    // 小节标题：左侧色条 + 同色淡药丸
    ctx.fillStyle = sec.c
    ctx.beginPath(); ctx.roundRect(left - 2, cy + 5, 3.4, 13, 2); ctx.fill()
    ctx.font = `bold ${Math.min(12.5, fs + 1.5)}px "Microsoft YaHei", sans-serif`
    const tw = ctx.measureText(sec.t).width
    ctx.fillStyle = hexA(sec.c, 0.13)
    ctx.beginPath(); ctx.roundRect(left + 6, cy + 1, tw + 16, 21, 10); ctx.fill()
    ctx.fillStyle = sec.c
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText(sec.t, left + 14, cy + 12)
    cy += R.head

    for (const it of sec.items) {
      ctx.fillStyle = sec.c
      ctx.beginPath(); ctx.arc(left + 5, cy + (fs + R.line) / 2 - 1, 2.6, 0, Math.PI * 2); ctx.fill()
      for (const ln of layoutRuns(ctx, it, maxW - 16, fs)) {
        let lx = left + 14
        for (const run of ln) {
          ctx.font = `${run.b ? 'bold ' : ''}${fs}px "Microsoft YaHei", sans-serif`
          ctx.fillStyle = run.c || '#5A4636'
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
          ctx.fillText(run.s, lx, cy + (fs + R.line) / 2 - 1)
          lx += ctx.measureText(run.s).width
        }
        cy += fs + R.line
      }
      cy += R.item
    }
    cy += R.sec
  }
  ctx.restore()

  // 底部读数/提示行
  if (opts.tip) {
    ctx.font = '11.5px "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    const tipY = y + cardH - 22
    ctx.fillStyle = '#E8D3B6'
    ctx.beginPath(); ctx.roundRect(left, tipY - 0.5, maxW, 1, 0.5); ctx.fill()
    opts.tip(ctx, left, tipY, maxW, fs)
  }
  ctx.restore()
}

/** 富文本按宽度折行：返回 {s, c, b}[] 的行数组 */
export function layoutRuns(ctx, runs, maxW, fs) {
  const lines = []
  let cur = [], curW = 0, buf = '', bufC = null, bufB = false
  const flushBuf = () => {
    if (buf) cur.push({ s: buf, c: bufC, b: bufB })
    buf = ''
  }
  for (const r of runs) {
    const txt = r[0], color = r[1], bold = !!r[2]
    ctx.font = `${bold ? 'bold ' : ''}${fs}px "Microsoft YaHei", sans-serif`
    bufC = color; bufB = bold
    for (const ch of String(txt)) {
      const chW = ctx.measureText(ch).width
      if (curW + chW > maxW && (cur.length || buf)) {
        flushBuf(); lines.push(cur); cur = []; curW = 0
      }
      buf += ch; curW += chW
    }
    flushBuf()
  }
  flushBuf()
  if (cur.length) lines.push(cur)
  return lines
}

/** #RRGGBB + alpha → rgba() */
export function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}
