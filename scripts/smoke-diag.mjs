// 临时冒烟：electricLab diagnostics + _wireI
import { solveCircuit } from '../src/lab/engine/electricLab.js'

const battery = { id: 1, type: 'battery' }
const bulb = { id: 2, type: 'bulb' }
const amm = { id: 3, type: 'ammeter' }
const sw = { id: 4, type: 'switch', closed: true }
const vm = { id: 5, type: 'voltmeter' }
const w = (a, b) => ({ id: Math.random(), a, b })

// 1) 正常串联：bat+ → bulb → amm → bat-，导线电流应处处相等
{
  const wires = [w('1:p', '2:a'), w('2:b', '3:mid'), w('3:neg', '1:n')]
  const out = solveCircuit([battery, bulb, amm], wires)
  const I = out[1]._I
  const vals = Object.values(out._wireI).map(Math.abs)
  console.log('T1 series: I=', I.toFixed(3), 'wireI=', vals.map((x) => x.toFixed(3)).join(','), 'diag=', JSON.stringify(out.diagnostics))
  console.log('  T1', Math.abs(vals[0] - I) < 1e-6 && !out.diagnostics.short && !out.diagnostics.ammeterParallel && !out.diagnostics.voltmeterSeries ? 'PASS' : 'FAIL')
}

// 2) 电流表并联在灯泡两端（未串在支路）
{
  const wires = [w('1:p', '2:a'), w('1:p', '3:mid'), w('2:b', '1:n'), w('3:neg', '1:n')]
  const out = solveCircuit([battery, bulb, amm], wires)
  console.log('T2 ammeter-parallel: diag=', JSON.stringify(out.diagnostics), '→', out.diagnostics.ammeterParallel ? 'PASS' : 'FAIL')
}

// 3) 电压表串在干路
{
  const wires = [w('1:p', '5:mid'), w('5:neg', '2:a'), w('2:b', '1:n')]
  const out = solveCircuit([battery, bulb, vm], wires)
  console.log('T3 voltmeter-series: diag=', JSON.stringify(out.diagnostics), '→', out.diagnostics.voltmeterSeries ? 'PASS' : 'FAIL')
}

// 4) 电源短路
{
  const wires = [w('1:p', '4:a'), w('4:b', '1:n')]
  const out = solveCircuit([battery, sw], wires)
  console.log('T4 short: diag=', JSON.stringify(out.diagnostics), '→', out.diagnostics.short ? 'PASS' : 'FAIL')
}

// 5) 正常电压表并联不应误报
{
  const wires = [w('1:p', '2:a'), w('2:b', '1:n'), w('5:mid', '2:a'), w('5:neg', '2:b')]
  const out = solveCircuit([battery, bulb, vm], wires)
  console.log('T5 voltmeter-parallel clean: diag=', JSON.stringify(out.diagnostics), '→', !out.diagnostics.voltmeterSeries && !out.diagnostics.ammeterParallel ? 'PASS' : 'FAIL')
}
