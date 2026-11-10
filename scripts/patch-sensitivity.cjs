const fs = require('fs')

// ── 1) circuitKit: 更小的万用表端子热区 + 更大的机身盒 ──
{
  const p = 'src/lab/ui/circuitKit.js'
  let t = fs.readFileSync(p, 'utf8')
  t = t.replace(
    "const r = comp.type === 'multimeter' ? 16 : R",
    "const r = comp.type === 'multimeter' ? 12 : R"
  )
  t = t.replace(
    "if (Math.abs(dx) <= 48 && Math.abs(dy) <= 38) return c",
    "if (Math.abs(dx) <= 52 && Math.abs(dy) <= 42) return c"
  )
  // 表笔插孔视觉再大一点，方便点
  t = t.replace(
    "export function drawRealMultimeter(ctx, x, y, opts = {}) {\n  const { mode = 'V', value = 0, scale = 1 } = opts\n  const W = 80, H = 62",
    "export function drawRealMultimeter(ctx, x, y, opts = {}) {\n  const { mode = 'V', value = 0, scale = 1.15 } = opts\n  const W = 80, H = 62"
  )
  fs.writeFileSync(p, t)
  console.log('circuitKit ok')
}

// ── 2) OhmsLawScene: 表笔热区放大 + 机身优先命中 + 点击容差 ──
{
  const p = 'src/lab/scenes/OhmsLawScene.jsx'
  let t = fs.readFileSync(p, 'utf8')

  // 表笔 15 → 24
  if (!t.includes('Math.hypot(x - p.x, y - p.y) <= 15')) {
    console.error('probe radius marker missing')
    process.exit(1)
  }
  t = t.replace(
    'Math.hypot(x - p.x, y - p.y) <= 15',
    'Math.hypot(x - p.x, y - p.y) <= 24'
  )

  // 机身优先：在 findTerm 之前插入万用表盒状命中
  const oldPre = `    const term = findTerm(x, y)
    if (term) { s.connecting = { ...term, mx: x, my: y }; s.dragMoved = false; forceUpdate(n => n + 1); return }`
  const newPre = `    // 万用表机身优先：点壳=拖动/轻点切档，只有贴近接线柱才连线
    for (const comp of s.components) {
      if (comp.type !== 'multimeter') continue
      const dx = x - comp.x, dy = y - comp.y
      if (Math.abs(dx) > 52 || Math.abs(dy) > 42) continue
      const terms = getTerminals(comp)
      const nearTerm = terms.some(t => Math.hypot(x - t.x, y - t.y) <= 14)
      if (nearTerm) break
      s.dragId = comp.id; s.dragOffX = x - comp.x; s.dragOffY = y - comp.y
      s.dragMoved = false; s.dragStart = { x, y }
      forceUpdate(n => n + 1)
      return
    }
    const term = findTerm(x, y)
    if (term) { s.connecting = { ...term, mx: x, my: y }; s.dragMoved = false; forceUpdate(n => n + 1); return }`
  if (!t.includes(oldPre)) {
    console.error('findTerm block missing')
    process.exit(1)
  }
  t = t.replace(oldPre, newPre)

  // 点击容差 5→10，避免轻点被当成拖动
  t = t.split('Math.hypot(x - s.dragStart.x, y - s.dragStart.y) > 5').join('Math.hypot(x - s.dragStart.x, y - s.dragStart.y) > 10')

  fs.writeFileSync(p, t)
  console.log('OhmsLawScene ok')
}
