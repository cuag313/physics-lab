/**
 * engine/index.js — 电路引擎统一导出
 * 
 * 使用方式：
 *   import { CircuitGraph, CircuitSolver, solveCircuit } from '../engine'
 * 
 * 快捷用法 solveCircuit(components, wires, switchClosed, sliderR):
 *   1. 从简化数据构建 CircuitGraph
 *   2. 运行 MNA 求解
 *   3. 返回 { ok, reason, results: Map<compId, {I, U, P}> }
 */

export { CircuitGraph, PORT_DEFS } from './CircuitGraph.js'
export { CircuitSolver } from './CircuitSolver.js'

import { CircuitGraph } from './CircuitGraph.js'
import { CircuitSolver } from './CircuitSolver.js'

/**
 * 快捷求解：从简化元件/导线数据直接求解
 * 
 * @param {Array} components - [{id, type, x, y, props?}]
 * @param {Array} wires - [{id, from:{componentId,portIndex}, to:{componentId,portIndex}}]
 * @param {number} voltage - 电源电压
 * @param {number} bulbR - 灯泡电阻
 * @param {number} rheostatR - 滑动变阻器电阻
 * @returns {{ ok, reason, results: Map<compId, {current, voltage, power}>, bulbBrightness }}
 */
export function solveCircuit(components, wires, voltage, bulbR, rheostatR) {
  const graph = new CircuitGraph()

  // 构建电路图
  for (const c of components) {
    const props = { ...c.props }
    if (c.type === 'battery') props.voltage = voltage
    if (c.type === 'bulb') props.resistance = bulbR
    if (c.type === 'rheostat') props.resistance = rheostatR
    if (c.type === 'switch') props.closed = c.closed !== false
    graph.addComponent(c.type, c.x, c.y, props, c.id)
  }

  for (const w of wires) {
    graph.addWire(w.from, w.to)
  }

  // 验证电路
  const validation = graph.validate()
  if (!validation.ok) return { ok: false, reason: validation.reason, results: new Map(), bulbBrightness: 0 }

  // MNA 求解
  const info = graph.getCircuitInfo()
  const solver = new CircuitSolver()
  const results = solver.solve(info)

  // 计算灯泡亮度（功率比）
  const bulbComp = components.find(c => c.type === 'bulb')
  const bulbResult = bulbComp ? results.get(bulbComp.id) : null
  const maxPower = (voltage / bulbR) ** 2 * bulbR  // 最大功率（滑动变阻器=0时）
  const bulbBrightness = bulbResult ? Math.max(0.08, Math.min(1, bulbResult.power / maxPower)) : 0

  return { ok: true, reason: validation.reason, results, bulbBrightness }
}
