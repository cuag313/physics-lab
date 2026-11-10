import { describe, expect, it } from 'vitest'
import { CircuitGraph, CircuitSolver, solveCircuit } from './index.js'

/** 主回路：battery(+) → sw → [rheo][am] → bulb → battery(-)，与 test-circuit.mjs 极性一致 */
function buildSeriesLoop(g, { voltage = 6, bulbR = 15, switchClosed = true, withAmmeter = false, withRheostat = false } = {}) {
  const bat = g.addComponent('battery', 0, 0, { voltage })
  const sw = g.addComponent('switch', 0, 0, { closed: switchClosed })
  const bulb = g.addComponent('bulb', 0, 0, { resistance: bulbR })
  const rheo = withRheostat ? g.addComponent('rheostat', 0, 0, { resistance: 10 }) : null
  const am = withAmmeter ? g.addComponent('ammeter', 0, 0, {}) : null

  // bat+ → sw
  g.addWire({ componentId: bat.id, portIndex: 1 }, { componentId: sw.id, portIndex: 0 })
  let tail = sw
  let tailPort = 1
  if (rheo) {
    g.addWire({ componentId: tail.id, portIndex: tailPort }, { componentId: rheo.id, portIndex: 1 })
    tail = rheo; tailPort = 0
  }
  if (am) {
    g.addWire({ componentId: tail.id, portIndex: tailPort }, { componentId: am.id, portIndex: 0 })
    tail = am; tailPort = 1
  }
  // → bulb(+)，bulb(-) → bat-
  g.addWire({ componentId: tail.id, portIndex: tailPort }, { componentId: bulb.id, portIndex: 1 })
  g.addWire({ componentId: bulb.id, portIndex: 0 }, { componentId: bat.id, portIndex: 0 })
  return { bat, sw, bulb, am, rheo }
}

describe('CircuitGraph.validate', () => {
  it('伏安法电路：开关闭合验证通过，电流≈0.24A，灯泡电压≈3.6V', () => {
    const g = new CircuitGraph()
    const { bat, bulb, am } = buildSeriesLoop(g, { voltage: 6, bulbR: 15, withAmmeter: true, withRheostat: true })
    const vm = g.addComponent('voltmeter', 0, 0, {})
    g.addWire({ componentId: vm.id, portIndex: 0 }, { componentId: bulb.id, portIndex: 0 })
    g.addWire({ componentId: vm.id, portIndex: 1 }, { componentId: bulb.id, portIndex: 1 })

    const v = g.validate()
    expect(v.ok, v.reason).toBe(true)

    const r = new CircuitSolver().solve(g.getCircuitInfo())
    const expectedI = 6 / 25 // 10Ω 变阻器 + 15Ω 灯泡
    expect(Math.abs(Math.abs(r.get(am.id).current) - expectedI)).toBeLessThan(0.001)
    // 灯泡端电压取绝对值：电压正负只反映「ports[0]−ports[1]」的符号约定，
    // 现已修正为 ports[1] 是高电位端（与界面把「+」画在右端一致）
    expect(Math.abs(Math.abs(r.get(bulb.id).voltage) - 3.6)).toBeLessThan(0.01)
  })

  it('开关断开：验证通过，电流≈0', () => {
    const g = new CircuitGraph()
    const { bulb } = buildSeriesLoop(g, { voltage: 6, bulbR: 15, switchClosed: false })
    const v = g.validate()
    expect(v.ok, v.reason).toBe(true)
    const r = new CircuitSolver().solve(g.getCircuitInfo())
    expect(Math.abs(r.get(bulb.id).current)).toBeLessThan(0.0001)
  })

  it('安培表串联：验证通过', () => {
    const g = new CircuitGraph()
    buildSeriesLoop(g, { withAmmeter: true })
    const v = g.validate()
    expect(v.ok, v.reason).toBe(true)
  })

  it('安培表并联灯泡：应报错', () => {
    const g = new CircuitGraph()
    const bat = g.addComponent('battery', 0, 0, { voltage: 6 })
    const am = g.addComponent('ammeter', 0, 0, {})
    const bulb = g.addComponent('bulb', 0, 0, { resistance: 15 })
    g.addWire({ componentId: bat.id, portIndex: 1 }, { componentId: am.id, portIndex: 0 })
    g.addWire({ componentId: bat.id, portIndex: 1 }, { componentId: bulb.id, portIndex: 1 })
    g.addWire({ componentId: am.id, portIndex: 1 }, { componentId: bat.id, portIndex: 0 })
    g.addWire({ componentId: bulb.id, portIndex: 0 }, { componentId: bat.id, portIndex: 0 })
    const v = g.validate()
    expect(v.ok).toBe(false)
    expect(v.reason).toContain('安培表')
  })

  it('伏特表并联灯泡：验证通过', () => {
    const g = new CircuitGraph()
    const { bulb } = buildSeriesLoop(g)
    const vm = g.addComponent('voltmeter', 0, 0, {})
    g.addWire({ componentId: vm.id, portIndex: 0 }, { componentId: bulb.id, portIndex: 0 })
    g.addWire({ componentId: vm.id, portIndex: 1 }, { componentId: bulb.id, portIndex: 1 })
    const v = g.validate()
    expect(v.ok, v.reason).toBe(true)
  })

  it('伏特表串联在主回路：应报错', () => {
    const g = new CircuitGraph()
    const bat = g.addComponent('battery', 0, 0, { voltage: 6 })
    const bulb = g.addComponent('bulb', 0, 0, { resistance: 15 })
    const vm = g.addComponent('voltmeter', 0, 0, {})
    g.addWire({ componentId: bat.id, portIndex: 1 }, { componentId: vm.id, portIndex: 0 })
    g.addWire({ componentId: vm.id, portIndex: 1 }, { componentId: bulb.id, portIndex: 1 })
    g.addWire({ componentId: bulb.id, portIndex: 0 }, { componentId: bat.id, portIndex: 0 })
    const v = g.validate()
    expect(v.ok).toBe(false)
    expect(v.reason).toContain('伏特表')
  })

  it('缺少负载：应报错', () => {
    const g = new CircuitGraph()
    g.addComponent('battery', 0, 0, { voltage: 6 })
    const v = g.validate()
    expect(v.ok).toBe(false)
    expect(v.reason).toContain('缺少负载')
  })

  it('元件未连线：应报错', () => {
    const g = new CircuitGraph()
    g.addComponent('battery', 0, 0, { voltage: 6 })
    g.addComponent('bulb', 0, 0, { resistance: 15 })
    const v = g.validate()
    expect(v.ok).toBe(false)
    expect(v.reason).toContain('未连接')
  })
})

describe('solveCircuit 快捷函数', () => {
  it('开关闭合回路：验证通过且灯泡亮度>0', () => {
    const r = solveCircuit(
      [
        { id: 1, type: 'battery', x: 0, y: 0, props: {} },
        { id: 2, type: 'switch', x: 0, y: 0, props: { closed: true } },
        { id: 3, type: 'bulb', x: 0, y: 0, props: {} },
      ],
      [
        { from: { componentId: 1, portIndex: 1 }, to: { componentId: 2, portIndex: 0 } },
        { from: { componentId: 2, portIndex: 1 }, to: { componentId: 3, portIndex: 1 } },
        { from: { componentId: 3, portIndex: 0 }, to: { componentId: 1, portIndex: 0 } },
      ],
      6, 15, 0,
    )
    expect(r.ok, r.reason).toBe(true)
    expect(r.results.get(3).current).not.toBe(0)
    expect(r.bulbBrightness).toBeGreaterThan(0)
  })
})

describe('万用表（multimeter）', () => {
  it('A 档等效电流表内阻，V 档等效电压表内阻', () => {
    const g = new CircuitGraph()
    const mA = g.addComponent('multimeter', 0, 0, { mode: 'A' })
    const mV = g.addComponent('multimeter', 0, 0, { mode: 'V' })
    expect(g.getResistance(mA)).toBeCloseTo(0.001, 6)
    expect(g.getResistance(mV)).toBeCloseTo(1e6, 0)
  })

  it('未连线的万用表不阻塞 validate()', () => {
    const g = new CircuitGraph()
    buildSeriesLoop(g, { withAmmeter: true })
    g.addComponent('multimeter', 80, 80, { mode: 'V', probes: { red: null, black: null } })
    const v = g.validate()
    expect(v.ok, v.reason).toBe(true)
  })

  it('V 档串入主回路应报错，A 档串入可通过', () => {
    const gV = new CircuitGraph()
    const bat = gV.addComponent('battery', 0, 0, { voltage: 6 })
    const bulb = gV.addComponent('bulb', 0, 0, { resistance: 15 })
    const mV = gV.addComponent('multimeter', 0, 0, { mode: 'V' })
    gV.addWire({ componentId: bat.id, portIndex: 1 }, { componentId: mV.id, portIndex: 0 })
    gV.addWire({ componentId: mV.id, portIndex: 1 }, { componentId: bulb.id, portIndex: 1 })
    gV.addWire({ componentId: bulb.id, portIndex: 0 }, { componentId: bat.id, portIndex: 0 })
    const vV = gV.validate()
    expect(vV.ok).toBe(false)
    expect(vV.reason).toContain('伏特表')

    const gA = new CircuitGraph()
    const bat2 = gA.addComponent('battery', 0, 0, { voltage: 6 })
    const bulb2 = gA.addComponent('bulb', 0, 0, { resistance: 15 })
    const mA = gA.addComponent('multimeter', 0, 0, { mode: 'A' })
    gA.addWire({ componentId: bat2.id, portIndex: 1 }, { componentId: mA.id, portIndex: 0 })
    gA.addWire({ componentId: mA.id, portIndex: 1 }, { componentId: bulb2.id, portIndex: 1 })
    gA.addWire({ componentId: bulb2.id, portIndex: 0 }, { componentId: bat2.id, portIndex: 0 })
    const vA = gA.validate()
    expect(vA.ok, vA.reason).toBe(true)
  })
})

describe('CircuitSolver.nodeVoltages', () => {
  it('nodeVoltages 长度 === nodeCount，且与灯泡端电压自洽', () => {
    const g = new CircuitGraph()
    const { bat, bulb } = buildSeriesLoop(g, { voltage: 6, bulbR: 15, withAmmeter: true, withRheostat: true })
    const vm = g.addComponent('voltmeter', 0, 0, {})
    g.addWire({ componentId: vm.id, portIndex: 0 }, { componentId: bulb.id, portIndex: 0 })
    g.addWire({ componentId: vm.id, portIndex: 1 }, { componentId: bulb.id, portIndex: 1 })

    const info = g.getCircuitInfo()
    const r = new CircuitSolver().solve(info)

    expect(Array.isArray(r.nodeVoltages)).toBe(true)
    expect(r.nodeVoltages.length).toBe(info.nodeCount)

    // 灯泡端电压 = 两端节点电势差
    const [n1, n2] = g.getNodePair(bulb)
    const vDiff = Math.abs(r.nodeVoltages[n1] - r.nodeVoltages[n2])
    expect(Math.abs(vDiff - Math.abs(r.get(bulb.id).voltage))).toBeLessThan(0.01)

    // 电源两端电势差 ≈ 电动势
    const [b0, b1] = g.getNodePair(bat)
    const emf = Math.abs(r.nodeVoltages[b1] - r.nodeVoltages[b0])
    expect(Math.abs(emf - 6)).toBeLessThan(0.05)
  })

  it('求解失败时 nodeVoltages 仍为长度 nodeCount 的零数组', () => {
    const solver = new CircuitSolver()
    // 构造奇异矩阵：两节点短接且无独立电压源回路时 solve 走失败分支
    // 这里用空 components + 非法 nodeCount 触发失败路径
    const results = solver.solve({ nodeCount: 3, groundNode: 0, components: [] })
    expect(results.nodeVoltages).toEqual([0, 0, 0])
  })
})
