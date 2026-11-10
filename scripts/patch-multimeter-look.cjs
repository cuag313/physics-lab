const fs = require('fs')

// ── 表体：保留 PhET 暖色，但明确是「万用表」，读数 + V/A 双档 ──
{
  const p = 'src/lab/ui/circuitKit.js'
  let t = fs.readFileSync(p, 'utf8')
  const startMarker = 'export function drawRealMultimeter(ctx, x, y, opts = {}) {'
  const endMarker = '/** 万用表表笔插孔（表笔线起点，元件局部坐标）：红在左、黑在右 */'
  const start = t.indexOf(startMarker)
  const end = t.indexOf(endMarker)
  if (start < 0 || end < 0) { console.error('body markers missing'); process.exit(1) }

  const fn = `export function drawRealMultimeter(ctx, x, y, opts = {}) {
  const { mode = 'V', value = 0, scale = 1.15 } = opts
  const W = 92, H = 72
  const live = value != null
  const isA = mode === 'A'
  ctx.save(); ctx.translate(x, y)
  if (scale !== 1) ctx.scale(scale, scale)

  // 壳体：暖橙但更「仪器」，上浅下深
  const bodyGrad = ctx.createLinearGradient(0, -H / 2, 0, H / 2)
  bodyGrad.addColorStop(0, '#ffc107')
  bodyGrad.addColorStop(0.5, '#ff9800')
  bodyGrad.addColorStop(1, '#ef6c00')
  ctx.fillStyle = bodyGrad
  ctx.strokeStyle = '#4e342e'
  ctx.lineWidth = 3
  ctx.beginPath(); ctx.roundRect(-W / 2, -H / 2, W, H, 16); ctx.fill(); ctx.stroke()

  // 顶部丝印：万用表
  ctx.fillStyle = '#3e2723'
  ctx.font = 'bold 12px "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('万用表', 0, -H / 2 + 14)

  // 读数窗
  const rw = 70, rh = 26
  ctx.fillStyle = '#fffef8'
  ctx.strokeStyle = '#6d4c41'
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.roundRect(-rw / 2, -14, rw, rh, 6); ctx.fill(); ctx.stroke()
  // 档位角标 DCV / DCA
  ctx.fillStyle = '#5d4037'
  ctx.font = 'bold 8px sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(isA ? 'DCA' : 'DCV', -rw / 2 + 5, -14 + 8)
  // 主读数
  ctx.fillStyle = '#212121'
  ctx.font = 'bold 17px ui-monospace, Consolas, monospace'
  ctx.textAlign = 'right'
  if (live) {
    const txt = isA ? (value || 0).toFixed(3) : (value || 0).toFixed(2)
    ctx.fillText(txt, rw / 2 - 16, -1)
  } else {
    ctx.fillText('----', rw / 2 - 16, -1)
  }
  ctx.font = 'bold 11px sans-serif'
  ctx.fillStyle = isA ? '#e65100' : '#1565c0'
  ctx.fillText(isA ? 'A' : 'V', rw / 2 - 5, -1)

  // V / A 档位条（当前档高亮）
  ctx.font = 'bold 11px sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  // V
  ctx.fillStyle = isA ? 'rgba(62,39,35,0.35)' : '#1565c0'
  ctx.beginPath(); ctx.roundRect(-36, 18, 32, 18, 9); ctx.fill()
  ctx.fillStyle = '#fff'; ctx.fillText('V', -20, 27)
  // A
  ctx.fillStyle = isA ? '#e65100' : 'rgba(62,39,35,0.35)'
  ctx.beginPath(); ctx.roundRect(4, 18, 32, 18, 9); ctx.fill()
  ctx.fillStyle = '#fff'; ctx.fillText('A', 20, 27)

  // 底部红黑插孔（表笔线起点）
  for (const [px, col, dk] of [[-24, '#e53935', '#b71c1c'], [24, '#212121', '#000']]) {
    ctx.fillStyle = '#5d4037'
    ctx.beginPath(); ctx.roundRect(px - 8, H / 2 - 16, 16, 16, 5); ctx.fill()
    ctx.fillStyle = col; ctx.strokeStyle = dk; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(px, H / 2 - 8, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  }

  ctx.restore()
}

`
  t = t.slice(0, start) + fn + t.slice(end)

  // 插孔与新壳体对齐
  t = t.replace(
    `export const MULTIMETER_JACK = {
  R: { x: -22, y: 31 },
  B: { x: 22, y: 31 },
}`,
    `export const MULTIMETER_JACK = {
  R: { x: -24, y: 28 },
  B: { x: 24, y: 28 },
}`
  )
  fs.writeFileSync(p, t)
  console.log('body ok')
}

// ── 表笔默认垂在表下（不叠在插孔上），红左黑右 ──
{
  const p = 'src/lab/scenes/OhmsLawScene.jsx'
  let t = fs.readFileSync(p, 'utf8')
  const oldReset = `function resetProbe(comp, key) {
  const j = MULTIMETER_JACK[key]
  const cos = Math.cos(comp.rotation || 0), sin = Math.sin(comp.rotation || 0)
  return { x: comp.x + j.x * cos - j.y * sin, y: comp.y + j.x * sin + j.y * cos, snap: null }
}`
  const newReset = `function resetProbe(comp, key) {
  // 默认垂在表体下方，红偏左、黑偏右，避免两支笔叠在插孔上看不见
  const j = MULTIMETER_JACK[key]
  const dropX = key === 'R' ? -36 : 36
  const dropY = 58
  const cos = Math.cos(comp.rotation || 0), sin = Math.sin(comp.rotation || 0)
  const lx = j.x + dropX * 0.35, ly = j.y + dropY
  return {
    x: comp.x + lx * cos - ly * sin,
    y: comp.y + lx * sin + ly * cos,
    snap: null,
  }
}`
  if (!t.includes(oldReset)) { console.error('resetProbe missing'); process.exit(1) }
  t = t.replace(oldReset, newReset)
  fs.writeFileSync(p, t)
  console.log('probes reset ok')
}
