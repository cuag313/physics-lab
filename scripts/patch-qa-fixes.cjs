const fs = require('fs')

// ── circuitKit: 按钮上移避开插孔，命中加大 ──
{
  const p = 'src/lab/ui/circuitKit.js'
  let t = fs.readFileSync(p, 'utf8')
  t = t.replace(
    `export const MULTIMETER_MODE_BTN = [
  { label: 'V', x: -38, y: 10, w: 36, h: 18, tint: '#1976d2' },
  { label: 'A', x: 2, y: 10, w: 36, h: 18, tint: '#e65100' },
]`,
    `export const MULTIMETER_MODE_BTN = [
  { label: 'V', x: -40, y: 4, w: 38, h: 16, tint: '#1976d2' },
  { label: 'A', x: 2, y: 4, w: 38, h: 16, tint: '#e65100' },
]`
  )
  // 命中容差 8 → 12
  t = t.replace(
    'if (lx >= b.x - 8 && lx <= b.x + b.w + 8 && ly >= b.y - 8 && ly <= b.y + b.h + 8) return b.label',
    'if (lx >= b.x - 12 && lx <= b.x + b.w + 12 && ly >= b.y - 12 && ly <= b.y + b.h + 12) return b.label'
  )
  // 读数窗下移一点，给按钮让位（ry = -H/2+24 保持，按钮 y=4 在读数窗下方需检查）
  // H=94: 读数窗 ry=-23..7；按钮 y=4..20 → 仍重叠读数窗下沿
  // 改为按钮 y=12，插孔上移到 H/2-20
  t = t.replace(
    `export const MULTIMETER_MODE_BTN = [
  { label: 'V', x: -40, y: 4, w: 38, h: 16, tint: '#1976d2' },
  { label: 'A', x: 2, y: 4, w: 38, h: 16, tint: '#e65100' },
]`,
    `export const MULTIMETER_MODE_BTN = [
  { label: 'V', x: -40, y: 14, w: 38, h: 16, tint: '#1976d2' },
  { label: 'A', x: 2, y: 14, w: 38, h: 16, tint: '#e65100' },
]`
  )
  // 插孔略下移，避免与按钮 y=14-30 重叠（插孔原 H/2-22=25）
  t = t.replace(
    'ctx.beginPath(); ctx.roundRect(px - 11, H / 2 - 22, 22, 22, 7); ctx.fill()',
    'ctx.beginPath(); ctx.roundRect(px - 11, H / 2 - 18, 22, 20, 7); ctx.fill()'
  )
  t = t.replace(
    'ctx.beginPath(); ctx.arc(px, H / 2 - 11, 6.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()',
    'ctx.beginPath(); ctx.arc(px, H / 2 - 8, 6.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()'
  )
  t = t.replace(
    `export const MULTIMETER_JACK = {
  R: { x: -28, y: 36 },
  B: { x: 28, y: 36 },
}`,
    `export const MULTIMETER_JACK = {
  R: { x: -28, y: 39 },
  B: { x: 28, y: 39 },
}`
  )
  // 侧面接线柱不要盖在脸上：万用表改为底部插孔当接线点已在 getTerminals 处理，这里先让 getTerminals 贴边
  t = t.replace(
    `export function getTerminals(comp) {
  const c = Math.cos(comp.rotation || 0), sn = Math.sin(comp.rotation || 0)
  const half = comp.type === 'battery' ? 38 : 40`,
    `export function getTerminals(comp) {
  const c = Math.cos(comp.rotation || 0), sn = Math.sin(comp.rotation || 0)
  // 万用表壳体更宽（W=100），接线柱放到壳体外沿，避免盖住读数/按钮
  const half = comp.type === 'battery' ? 38 : (comp.type === 'multimeter' ? 54 : 40)`
  )
  fs.writeFileSync(p, t)
  console.log('kit ok')
}

// ── OhmsLaw: 去掉「轻点整表切档」兜底，只认 V/A 按钮 ──
{
  const p = 'src/lab/scenes/OhmsLawScene.jsx'
  let t = fs.readFileSync(p, 'utf8')
  const old = `      // 轻点开关：切换通断；轻点万用表机身（未点中 V/A 纽）也切档，作兜底
      if (!moved && typeof id === 'number') {
        const c = s.components.find(k => k.id === id)
        if (c && c.type === 'switch') {
          c.closed = c.closed === false
          forceUpdate(n => n + 1)
          return
        }
        if (c && c.type === 'multimeter') {
          c.props = { ...(c.props || {}), mode: (c.props && c.props.mode === 'A') ? 'V' : 'A' }
          forceUpdate(n => n + 1)
          return
        }
      }`
  const neu = `      // 轻点开关：切换通断。万用表只认 V/A 按钮，避免点壳误切档
      if (!moved && typeof id === 'number') {
        const c = s.components.find(k => k.id === id)
        if (c && c.type === 'switch') {
          c.closed = c.closed === false
          forceUpdate(n => n + 1)
          return
        }
      }`
  if (!t.includes(old)) { console.error('mouseup block missing'); process.exit(1) }
  t = t.replace(old, neu)
  fs.writeFileSync(p, t)
  console.log('scene ok')
}
