/**
 * 电路引擎全面测试
 * 测试6种场景，覆盖所有验证逻辑
 */

import { CircuitGraph, CircuitSolver, solveCircuit } from './index.js'

let pass = 0, fail = 0
function test(name, ok, detail = '') {
  if (ok) { pass++; console.log(`✅ ${name}`) }
  else { fail++; console.log(`❌ ${name} ${detail}`) }
}

// ── 测试1：标准伏安法电路（开关闭合）──
{
  const g = new CircuitGraph()
  const bat = g.addComponent('battery', 0, 0, { voltage: 6 })
  const sw = g.addComponent('switch', 0, 0, { closed: true })
  const rheo = g.addComponent('rheostat', 0, 0, { resistance: 10 })
  const am = g.addComponent('ammeter', 0, 0, {})
  const bulb = g.addComponent('bulb', 0, 0, { resistance: 15 })
  const vm = g.addComponent('voltmeter', 0, 0, {})
  g.addWire({ componentId: bat.id, portIndex: 1 }, { componentId: sw.id, portIndex: 0 })
  g.addWire({ componentId: sw.id, portIndex: 1 }, { componentId: rheo.id, portIndex: 1 })
  g.addWire({ componentId: rheo.id, portIndex: 0 }, { componentId: am.id, portIndex: 0 })
  g.addWire({ componentId: am.id, portIndex: 1 }, { componentId: bulb.id, portIndex: 1 })
  g.addWire({ componentId: bulb.id, portIndex: 0 }, { componentId: bat.id, portIndex: 0 })
  g.addWire({ componentId: vm.id, portIndex: 0 }, { componentId: bulb.id, portIndex: 0 })
  g.addWire({ componentId: vm.id, portIndex: 1 }, { componentId: bulb.id, portIndex: 1 })
  const v = g.validate()
  test('伏安法电路-验证通过', v.ok, v.reason)
  if (v.ok) {
    const info = g.getCircuitInfo()
    const solver = new CircuitSolver()
    const r = solver.solve(info)
    const bulbR = r.get(bulb.id)
    const ammR = r.get(am.id)
    const I = ammR.current
    const expected_I = 6 / 25  // 0.24A
    test('伏安法-电流≈0.24A', Math.abs(Math.abs(I) - expected_I) < 0.001, `got ${I.toFixed(4)}`)
    test('伏安法-灯泡电压≈3.6V', Math.abs(bulbR.voltage - 3.6) < 0.01, `got ${bulbR.voltage.toFixed(3)}`)
  }
}

// ── 测试2：开关断开 ──
{
  const g = new CircuitGraph()
  const bat = g.addComponent('battery', 0, 0, { voltage: 6 })
  const sw = g.addComponent('switch', 0, 0, { closed: false })
  const bulb = g.addComponent('bulb', 0, 0, { resistance: 15 })
  g.addWire({ componentId: bat.id, portIndex: 1 }, { componentId: sw.id, portIndex: 0 })
  g.addWire({ componentId: sw.id, portIndex: 1 }, { componentId: bulb.id, portIndex: 1 })
  g.addWire({ componentId: bulb.id, portIndex: 0 }, { componentId: bat.id, portIndex: 0 })
  const v = g.validate()
  // 开关断开=1e9Ω，电路仍然"连通"但电流极小
  test('开关断开-验证通过', v.ok, v.reason)
  if (v.ok) {
    const info = g.getCircuitInfo()
    const solver = new CircuitSolver()
    const r = solver.solve(info)
    const bulbR = r.get(bulb.id)
    test('开关断开-电流≈0', Math.abs(bulbR.current) < 0.0001, `got ${bulbR.current}`)
  }
}

// ── 测试3：安培表串联（正确）──
{
  const g = new CircuitGraph()
  const bat = g.addComponent('battery', 0, 0, { voltage: 6 })
  const am = g.addComponent('ammeter', 0, 0, {})
  const bulb = g.addComponent('bulb', 0, 0, { resistance: 15 })
  g.addWire({ componentId: bat.id, portIndex: 1 }, { componentId: am.id, portIndex: 0 })
  g.addWire({ componentId: am.id, portIndex: 1 }, { componentId: bulb.id, portIndex: 1 })
  g.addWire({ componentId: bulb.id, portIndex: 0 }, { componentId: bat.id, portIndex: 0 })
  const v = g.validate()
  test('安培表串联-验证通过', v.ok, v.reason)
}

// ── 测试4：安培表并联（错误=短路）──
{
  const g = new CircuitGraph()
  const bat = g.addComponent('battery', 0, 0, { voltage: 6 })
  const am = g.addComponent('ammeter', 0, 0, {})
  const bulb = g.addComponent('bulb', 0, 0, { resistance: 15 })
  // 安培表和灯泡并联（同一对节点）
  g.addWire({ componentId: bat.id, portIndex: 1 }, { componentId: am.id, portIndex: 0 })
  g.addWire({ componentId: bat.id, portIndex: 1 }, { componentId: bulb.id, portIndex: 1 })
  g.addWire({ componentId: am.id, portIndex: 1 }, { componentId: bat.id, portIndex: 0 })
  g.addWire({ componentId: bulb.id, portIndex: 0 }, { componentId: bat.id, portIndex: 0 })
  const v = g.validate()
  test('安培表并联-应报错', !v.ok && v.reason.includes('安培表'), v.reason)
}

// ── 测试5：伏特表并联在灯泡（正确）──
{
  const g = new CircuitGraph()
  const bat = g.addComponent('battery', 0, 0, { voltage: 6 })
  const bulb = g.addComponent('bulb', 0, 0, { resistance: 15 })
  const vm = g.addComponent('voltmeter', 0, 0, {})
  // 主回路
  g.addWire({ componentId: bat.id, portIndex: 1 }, { componentId: bulb.id, portIndex: 1 })
  g.addWire({ componentId: bulb.id, portIndex: 0 }, { componentId: bat.id, portIndex: 0 })
  // 伏特表并联在灯泡
  g.addWire({ componentId: vm.id, portIndex: 0 }, { componentId: bulb.id, portIndex: 0 })
  g.addWire({ componentId: vm.id, portIndex: 1 }, { componentId: bulb.id, portIndex: 1 })
  const v = g.validate()
  test('伏特表并联灯泡-验证通过', v.ok, v.reason)
}

// ── 测试6：伏特表串联在主回路（错误）──
{
  const g = new CircuitGraph()
  const bat = g.addComponent('battery', 0, 0, { voltage: 6 })
  const bulb = g.addComponent('bulb', 0, 0, { resistance: 15 })
  const vm = g.addComponent('voltmeter', 0, 0, {})
  // 伏特表串联在主回路（没有其他元件共享节点）
  g.addWire({ componentId: bat.id, portIndex: 1 }, { componentId: vm.id, portIndex: 0 })
  g.addWire({ componentId: vm.id, portIndex: 1 }, { componentId: bulb.id, portIndex: 1 })
  g.addWire({ componentId: bulb.id, portIndex: 0 }, { componentId: bat.id, portIndex: 0 })
  const v = g.validate()
  test('伏特表串联-应报错', !v.ok && v.reason.includes('伏特表'), v.reason)
}

// ── 测试7：solveCircuit快捷函数 ──
{
  const comps = [
    { id: 1, type: 'battery', x: 0, y: 0, props: {} },
    { id: 2, type: 'switch', x: 0, y: 0, props: { closed: true } },
    { id: 3, type: 'bulb', x: 0, y: 0, props: {} },
  ]
  const wires = [
    { from: { componentId: 1, portIndex: 1 }, to: { componentId: 2, portIndex: 0 } },
    { from: { componentId: 2, portIndex: 1 }, to: { componentId: 3, portIndex: 1 } },
    { from: { componentId: 3, portIndex: 0 }, to: { componentId: 1, portIndex: 0 } },
  ]
  const r = solveCircuit(comps, wires, 6, 15, 0)
  test('solveCircuit-验证通过', r.ok, r.reason)
  if (r.ok) {
    const bulbR = r.results.get(3)
    test('solveCircuit-灯泡亮度>0', r.bulbBrightness > 0, `brightness=${r.bulbBrightness}`)
  }
}

// ── 测试8：缺少元件 ──
{
  const g = new CircuitGraph()
  g.addComponent('battery', 0, 0, { voltage: 6 })
  const v = g.validate()
  test('缺少灯泡-应报错', !v.ok && v.reason.includes('灯泡'), v.reason)
}

// ── 测试9：元件未连线 ──
{
  const g = new CircuitGraph()
  g.addComponent('battery', 0, 0, { voltage: 6 })
  g.addComponent('bulb', 0, 0, { resistance: 15 })
  const v = g.validate()
  test('未连线-应报错', !v.ok && v.reason.includes('未连接'), v.reason)
}

// ── 总结 ──
console.log(`\n=== 测试结果: ${pass} 通过, ${fail} 失败 ===`)
if (fail > 0) process.exit(1)
