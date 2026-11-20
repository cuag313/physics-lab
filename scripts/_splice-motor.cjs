const fs = require('fs')
const p = 'D:/PythonProject/physics-lab/src/lab/scenes/electricSvgInstruments.js'
const src = fs.readFileSync(p, 'utf8')
const blk = fs.readFileSync('D:/PythonProject/physics-lab/scripts/_motor-block.js', 'utf8')
const a = src.indexOf('  /* ── 小电动机（')
const b = src.indexOf('  /* ── 发光二极管')
if (a < 0 || b < 0 || b <= a) { console.log('MARKERS FAIL', a, b); process.exit(1) }
const out = src.slice(0, a) + blk + src.slice(b)
fs.writeFileSync(p, out, 'utf8')
console.log('OK replaced', (b - a), 'chars ->', blk.length)
