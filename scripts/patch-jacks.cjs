const fs = require('fs')
const p = 'src/lab/ui/circuitKit.js'
let t = fs.readFileSync(p, 'utf8')
const oldJ = `export const MULTIMETER_JACK = {
  R: { x: -27, y: 25.5 },
  B: { x: 27, y: 25.5 },
}`
const newJ = `export const MULTIMETER_JACK = {
  R: { x: -22, y: 31 },
  B: { x: 22, y: 31 },
}`
if (!t.includes(oldJ)) { console.error('jack block missing'); process.exit(1) }
t = t.replace(oldJ, newJ)
fs.writeFileSync(p, t)
console.log('jacks ok')
