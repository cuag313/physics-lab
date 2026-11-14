import { solveCircuit } from '../src/lab/engine/electricLab.js'

const K = (id, t) => `${id}:${t}`
const base = (rev) => {
  const comps = [
    { id: 1, type: 'battery', x: 0, y: 0 },
    { id: 2, type: 'bulb', x: 0, y: 0 },
    { id: 3, type: 'ammeter', x: 0, y: 0 },
    { id: 4, type: 'switch', x: 0, y: 0, closed: true },
  ]
  const wires = [
    { id: 1, a: K(1, 'p'), b: K(2, 'a') },
    { id: 2, a: K(2, 'b'), b: K(3, rev ? 'neg' : 'pos') },
    { id: 3, a: K(3, rev ? 'pos' : 'neg'), b: K(4, 'b') },
    { id: 4, a: K(4, 'a'), b: K(1, 'n') },
  ]
  return { comps, wires }
}

for (const rev of [false, true]) {
  const { comps, wires } = base(rev)
  const out = solveCircuit(comps, wires)
  const o = out[3]
  console.log(rev ? 'reverse' : 'forward', 'I=', o._I?.toFixed(4), 'fs=', o._fs, 'over=', o._over, 'rev=', o._rev,
    'frac(scene)=', (o._I / o._fs).toFixed(3), 'ang=', ((o._I / o._fs) * 52.5).toFixed(1))
}
