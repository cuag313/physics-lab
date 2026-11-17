/* 直接用引擎验证 NB 家庭电路拓扑：node scripts/dbg-nb.mjs */
import { solveCircuit, CFG } from '../src/lab/engine/electricLab.js'

const comps = [
  { id: 1, type: 'mains', x: 0, y: 0 },
  { id: 2, type: 'energyMeter', x: 0, y: 0 },
  { id: 3, type: 'breaker', x: 0, y: 0, closed: true },
  { id: 4, type: 'ground', x: 0, y: 0 },
  { id: 5, type: 'busHot', x: 0, y: 0 },
  { id: 6, type: 'busZero', x: 0, y: 0 },
  { id: 7, type: 'busEarth', x: 0, y: 0 },
  { id: 8, type: 'switch', x: 0, y: 0, closed: true },
  { id: 9, type: 'lamp220', x: 0, y: 0 },
  { id: 10, type: 'switch', x: 0, y: 0, closed: true },
  { id: 11, type: 'lamp220', x: 0, y: 0 },
  { id: 12, type: 'socket2', x: 0, y: 0 },
  { id: 13, type: 'socket3', x: 0, y: 0 },
  { id: 14, type: 'tv', x: 0, y: 0 },
]
const w = (id, a, b) => ({ id, a: a.replace('@', `${comps.find((c) => c.keyName === a.split(':')[0])?.id || 0}`), b })
let wid = 100
const pairs = [
  ['1:l', '2:i1'], ['1:n', '2:i2'],
  ['2:o1', '3:li'], ['2:o2', '3:ni'],
  ['3:lo', '5:t1'], ['3:no', '6:t1'], ['4:e', '7:t1'],
  ['5:t2', '8:a'], ['8:b', '9:a'], ['9:b', '6:t2'],
  ['5:t4', '10:a'], ['10:b', '11:a'], ['11:b', '6:t4'],
  ['5:t6', '12:l'], ['6:t6', '12:n'],
  ['5:t8', '13:l'], ['6:t8', '13:n'], ['7:t8', '13:e'],
  ['13:l', '14:a'], ['13:n', '14:b'],
]
const wires = pairs.map(([a, b]) => ({ id: wid++, a, b }))

const out = solveCircuit(comps, wires)
console.log('diag:', JSON.stringify(out.diagnostics))
for (const c of comps) {
  const o = out[c.id] || {}
  console.log(`#${c.id} ${c.type.padEnd(11)} I=${(o._I ?? 0).toFixed(4)} V=${(o._V ?? 0).toFixed(1)} P=${(o._P ?? 0).toFixed(1)}`)
}
console.log('wireI:', JSON.stringify(Object.fromEntries(Object.entries(out._wireI || {}).map(([k, v]) => [k, Number(v).toFixed(3)]))))

