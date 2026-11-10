const fs = require('fs')
const p = 'src/lab/ui/circuitKit.js'
let t = fs.readFileSync(p, 'utf8')
const oldTerm = [
  'export function findTermAt(components, mx, my, R = 30) {',
  '  for (const comp of components) {',
  '    const terms = getTerminals(comp)',
  '    for (let i = 0; i < terms.length; i++) {',
  '      const dx = mx - terms[i].x, dy = my - terms[i].y',
  '      if (dx * dx + dy * dy <= R * R) return { compId: comp.id, termIdx: i }',
  '    }',
  '  }',
  '  return null',
  '}',
].join('\n')
const newTerm = [
  'export function findTermAt(components, mx, my, R = 30) {',
  '  for (const comp of components) {',
  '    // 万用表机身较大：端子热区收窄，避免整表被当成接线柱抢走点击',
  '    const r = comp.type === \'multimeter\' ? 16 : R',
  '    const terms = getTerminals(comp)',
  '    for (let i = 0; i < terms.length; i++) {',
  '      const dx = mx - terms[i].x, dy = my - terms[i].y',
  '      if (dx * dx + dy * dy <= r * r) return { compId: comp.id, termIdx: i }',
  '    }',
  '  }',
  '  return null',
  '}',
].join('\n')
if (!t.includes(oldTerm)) { console.error('term block not found'); process.exit(1) }
t = t.replace(oldTerm, newTerm)
const oldComp = [
  'export function findCompAt(components, mx, my, R = 24) {',
  '  for (let i = components.length - 1; i >= 0; i--) {',
  '    const c = components[i]',
  '    const dx = mx - c.x, dy = my - c.y',
  '    if (dx * dx + dy * dy <= R * R) return c',
  '  }',
  '  return null',
  '}',
].join('\n')
const newComp = [
  'export function findCompAt(components, mx, my, R = 24) {',
  '  for (let i = components.length - 1; i >= 0; i--) {',
  '    const c = components[i]',
  '    const dx = mx - c.x, dy = my - c.y',
  '    if (c.type === \'multimeter\') {',
  '      // 机身 80x62：盒状热区，轻点/拖动落在表壳上',
  '      if (Math.abs(dx) <= 48 && Math.abs(dy) <= 38) return c',
  '    } else if (dx * dx + dy * dy <= R * R) return c',
  '  }',
  '  return null',
  '}',
].join('\n')
if (!t.includes(oldComp)) { console.error('comp block not found'); process.exit(1) }
t = t.replace(oldComp, newComp)
fs.writeFileSync(p, t)
console.log('patched ok')
