import { describe, expect, it } from 'vitest'
import { CircuitGraph } from './CircuitGraph.js'
import { CircuitSolver, wireCurrent, SHORT_CIRCUIT_CURRENT } from './CircuitSolver.js'

/** 串一个开关的电池回路：bat(+) → sw → bulb → bat(−) */
function simpleLoop({ voltage = 6, bulbR = 12, closed = true } = {}) {
  const g = new CircuitGraph()
  const bat = g.addComponent('battery', 0, 0, { voltage })
  const sw = g.addComponent('switch', 0, 0, { closed })
  const bulb = g.addComponent('bulb', 0, 0, { resistance: bulbR })
  g.addWire({ componentId: bat.id, portIndex: 1 }, { componentId: sw.id, portIndex: 0 })
  g.addWire({ componentId: sw.id, portIndex: 1 }, { componentId: bulb.id, portIndex: 1 })
  g.addWire({ componentId: bulb.id, portIndex: 0 }, { componentId: bat.id, portIndex: 0 })
  return { g, bat, sw, bulb }
}

const solveGraph = (g) => new CircuitSolver().solve(g.getCircuitInfo())

describe('短路检测（旧版漏判）', () => {
  it('电源两极再跨接一根导线：validate 报短路', () => {
    const { g, bat } = simpleLoop({ voltage: 6, bulbR: 12 })
    // 学生常见的错误接法：在电源两端再并一根导线
    g.addWire({ componentId: bat.id, portIndex: 0 }, { componentId: bat.id, portIndex: 1 })
    const v = g.validate()
    expect(v.ok).toBe(false)
    expect(v.reason).toContain('短路')
  })

  it('电源 + 开关构成回路但没有负载：求解器判定为短路（旧版会静默全 0）', () => {
    const g = new CircuitGraph()
    const bat = g.addComponent('battery', 0, 0, { voltage: 6 })
    const sw = g.addComponent('switch', 0, 0, { closed: true })
    g.addWire({ componentId: bat.id, portIndex: 1 }, { componentId: sw.id, portIndex: 0 })
    g.addWire({ componentId: sw.id, portIndex: 1 }, { componentId: bat.id, portIndex: 0 })
    const r = solveGraph(g)
    // 开关只有 0.001Ω，6V 下电流极大
    expect(Math.abs(r.get(bat.id).current)).toBeGreaterThan(SHORT_CIRCUIT_CURRENT)
    expect(r.diagnostics.short).toBe(true)
  })

  it('灯泡被导线短接：灯泡电流为 0，且求解器给出短路诊断', () => {
    const { g, bulb, bat } = simpleLoop()
    // 在灯泡两端再并一根导线 → 灯泡被短接
    g.addWire({ componentId: bulb.id, portIndex: 0 }, { componentId: bulb.id, portIndex: 1 })
    const r = solveGraph(g)
    expect(Math.abs(r.get(bulb.id).current)).toBeLessThan(1e-6)
    // 干路只剩导线+开关的极小电阻 → 电流巨大
    expect(Math.abs(r.get(bat.id).current)).toBeGreaterThan(SHORT_CIRCUIT_CURRENT)
    expect(r.diagnostics.short).toBe(true)
  })

  it('正常电路不应误报短路', () => {
    const { g } = simpleLoop()
    const r = solveGraph(g)
    expect(r.diagnostics.short).toBe(false)
  })
})

describe('浮空节点不再让矩阵奇异', () => {
  it('一堆没接线的元件也返回有限数值（旧版会全 0 或 NaN）', () => {
    const g = new CircuitGraph()
    g.addComponent('battery', 0, 0, { voltage: 6 })
    g.addComponent('bulb', 100, 0, { resistance: 12 })
    g.addComponent('resistor', 200, 0, { resistance: 10 })
    const r = solveGraph(g)
    expect(r.nodeVoltages.length).toBe(g.getCircuitInfo().nodeCount)
    for (const v of r.nodeVoltages) expect(Number.isFinite(v)).toBe(true)
  })

  it('电压表串在只含电源的悬空支路上也不会崩', () => {
    const g = new CircuitGraph()
    const bat = g.addComponent('battery', 0, 0, { voltage: 6 })
    const vm = g.addComponent('voltmeter', 0, 0, {})
    g.addWire({ componentId: bat.id, portIndex: 1 }, { componentId: vm.id, portIndex: 0 })
    const r = solveGraph(g)
    expect(Number.isFinite(r.get(vm.id).voltage)).toBe(true)
  })
})

describe('电表内阻模型', () => {
  it('电流表串入后电流几乎不变（相对误差 < 0.1%）', () => {
    const plain = simpleLoop()
    const r1 = solveGraph(plain.g)

    const withMeter = simpleLoop()
    const am = withMeter.g.addComponent('ammeter', 0, 0, {})
    // 把 sw→bulb 的导线拆成 sw→am→bulb
    withMeter.g.wires = withMeter.g.wires.filter((w) => !(w.from.componentId === withMeter.sw.id && w.to.componentId === withMeter.bulb.id))
    withMeter.g.addWire({ componentId: withMeter.sw.id, portIndex: 1 }, { componentId: am.id, portIndex: 0 })
    withMeter.g.addWire({ componentId: am.id, portIndex: 1 }, { componentId: withMeter.bulb.id, portIndex: 1 })
    const r2 = solveGraph(withMeter.g)

    const i1 = Math.abs(r1.get(plain.bulb.id).current)
    const i2 = Math.abs(r2.get(withMeter.bulb.id).current)
    expect(Math.abs(i2 - i1) / i1).toBeLessThan(0.001)
    // 电流表读到的就是干路电流
    expect(Math.abs(Math.abs(r2.get(am.id).current) - i2) / i2).toBeLessThan(0.001)
  })

  it('电压表并联在灯泡两端：读数等于灯泡端电压，分流极小', () => {
    const { g, bulb } = simpleLoop()
    const vm = g.addComponent('voltmeter', 0, 0, {})
    g.addWire({ componentId: vm.id, portIndex: 0 }, { componentId: bulb.id, portIndex: 0 })
    g.addWire({ componentId: vm.id, portIndex: 1 }, { componentId: bulb.id, portIndex: 1 })
    const r = solveGraph(g)
    const ub = Math.abs(r.get(bulb.id).voltage)
    const uv = Math.abs(r.get(vm.id).voltage)
    expect(Math.abs(ub - uv)).toBeLessThan(0.001)
    // 电压表分流 < 0.01% 干路电流
    expect(Math.abs(r.get(vm.id).current)).toBeLessThan(Math.abs(r.get(bulb.id).current) * 1e-4)
  })
})

describe('wireCurrent 电流方向', () => {
  it('沿「从电源正极流出」的导线方向为正', () => {
    const { g, bat, sw, bulb } = simpleLoop({ voltage: 6, bulbR: 12 })
    const r = solveGraph(g)
    // 电源 ports[1] 是正极：从正极流出 = 电流沿 port1 → 外部
    const iOut = wireCurrent(bat, 1, r)
    const iIn = wireCurrent(bat, 0, r)
    expect(iOut).toBeGreaterThan(0)
    expect(iIn).toBeLessThan(0)
    // 干路电流大小 = 6V / 12Ω = 0.5A
    expect(Math.abs(iOut)).toBeCloseTo(0.5, 3)
    // 开关是串在干路上的同一个电流，方向由「从哪个端子流出」决定
    expect(Math.abs(wireCurrent(sw, 1, r))).toBeCloseTo(0.5, 3)
    expect(Math.abs(wireCurrent(bulb, 0, r))).toBeCloseTo(0.5, 3)
  })
})

describe('滑动变阻器实时调节', () => {
  it('接入阻值从 0 调到最大，干路电流单调下降', () => {
    const runs = [0, 5, 10, 20].map((R) => {
      const g = new CircuitGraph()
      const bat = g.addComponent('battery', 0, 0, { voltage: 6 })
      const rheo = g.addComponent('rheostat', 0, 0, { resistance: R })
      const bulb = g.addComponent('bulb', 0, 0, { resistance: 10 })
      g.addWire({ componentId: bat.id, portIndex: 1 }, { componentId: rheo.id, portIndex: 1 })
      g.addWire({ componentId: rheo.id, portIndex: 0 }, { componentId: bulb.id, portIndex: 1 })
      g.addWire({ componentId: bulb.id, portIndex: 0 }, { componentId: bat.id, portIndex: 0 })
      const r = solveGraph(g)
      return { R, I: Math.abs(r.get(bat.id).current), Ub: Math.abs(r.get(bulb.id).voltage) }
    })
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i].I).toBeLessThan(runs[i - 1].I)
      expect(runs[i].Ub).toBeLessThan(runs[i - 1].Ub)
    }
    // 定量核对：6V / (0+10)Ω = 0.6A，6V / (20+10)Ω = 0.2A
    expect(runs[0].I).toBeCloseTo(0.6, 2)
    expect(runs[3].I).toBeCloseTo(0.2, 2)
  })
})

describe('串并联规律（数值正确性）', () => {
  it('串联：各处电流相同，电压按阻值分配', () => {
    const g = new CircuitGraph()
    const bat = g.addComponent('battery', 0, 0, { voltage: 12 })
    const r1 = g.addComponent('resistor', 0, 0, { resistance: 10 })
    const r2 = g.addComponent('resistor', 0, 0, { resistance: 30 })
    g.addWire({ componentId: bat.id, portIndex: 1 }, { componentId: r1.id, portIndex: 1 })
    g.addWire({ componentId: r1.id, portIndex: 0 }, { componentId: r2.id, portIndex: 1 })
    g.addWire({ componentId: r2.id, portIndex: 0 }, { componentId: bat.id, portIndex: 0 })
    const r = solveGraph(g)
    expect(Math.abs(r.get(r1.id).current)).toBeCloseTo(0.3, 4)
    expect(Math.abs(r.get(r2.id).current)).toBeCloseTo(0.3, 4)
    expect(Math.abs(r.get(r1.id).voltage)).toBeCloseTo(3, 4)
    expect(Math.abs(r.get(r2.id).voltage)).toBeCloseTo(9, 4)
  })

  it('并联：各支路电压相同，电流按阻值反比分配', () => {
    const g = new CircuitGraph()
    const bat = g.addComponent('battery', 0, 0, { voltage: 6 })
    const r1 = g.addComponent('resistor', 0, 0, { resistance: 10 })
    const r2 = g.addComponent('resistor', 0, 0, { resistance: 20 })
    g.addWire({ componentId: bat.id, portIndex: 1 }, { componentId: r1.id, portIndex: 1 })
    g.addWire({ componentId: bat.id, portIndex: 1 }, { componentId: r2.id, portIndex: 1 })
    g.addWire({ componentId: r1.id, portIndex: 0 }, { componentId: bat.id, portIndex: 0 })
    g.addWire({ componentId: r2.id, portIndex: 0 }, { componentId: bat.id, portIndex: 0 })
    const r = solveGraph(g)
    expect(Math.abs(r.get(r1.id).voltage)).toBeCloseTo(6, 3)
    expect(Math.abs(r.get(r2.id).voltage)).toBeCloseTo(6, 3)
    expect(Math.abs(r.get(r1.id).current)).toBeCloseTo(0.6, 3)
    expect(Math.abs(r.get(r2.id).current)).toBeCloseTo(0.3, 3)
    // 干路 = 各支路之和
    expect(Math.abs(r.get(bat.id).current)).toBeCloseTo(0.9, 3)
  })
})
