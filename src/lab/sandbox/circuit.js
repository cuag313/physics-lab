/**
 * sandbox/circuit.js — 电路数据模型 + 求解胶水
 *
 * 只依赖 engine/CircuitSolver.js（改进节点法 MNA），复用其正确性；
 * 拓扑（Union-Find 合并连通端口 → 节点）在本地实现，端口统一在 (±40, 0)。
 *
 * 极性约定与 CircuitSolver 一致：
 *   ports[0] = 负接线柱（左，x-40），ports[1] = 正接线柱（右，x+40）
 *   元件电流 current > 0 表示从 ports[0] 内部流向 ports[1]。
 */

import { CircuitSolver, METER_R } from '../engine/CircuitSolver.js'

/** 每个元件两个接线柱（相对元件中心，本地坐标） */
export const TERM_OFFSET = 40

let _nextId = 1

/** 新建一个元件实例 */
export function createComponent(type, x, y, extra = {}) {
  const def = extra.def || {}
  return {
    id: extra.useId ?? _nextId++,
    type,
    x,
    y,
    props: { ...(def.defaults || {}), ...(extra.props || {}) },
    // 开关/电源的便捷布尔也冗余到 props，参数面板与求解器统一读 props
  }
}

/** 取元件的世界坐标接线柱 */
export function termWorld(comp, idx) {
  const s = idx === 0 ? -1 : 1
  return { x: comp.x + s * TERM_OFFSET, y: comp.y }
}

/** 取元件 props 数值（安全） */
function num(v, d) {
  return typeof v === 'number' && Number.isFinite(v) ? v : d
}

/** 元件等效电阻（Ω） */
export function resistanceOf(comp) {
  const p = comp.props || {}
  switch (comp.type) {
    case 'resistor': return Math.max(num(p.resistance, 10), 1e-3)
    case 'bulb': return Math.max(num(p.resistance, 10), 1e-3)
    case 'rheostat': return Math.max(num(p.resistance, 20), 0)
    case 'galvanometer': return Math.max(num(p.resistance, 50), 1e-3)
    case 'ammeter': return METER_R.ammeter
    case 'voltmeter': return METER_R.voltmeter
    case 'switch': return p.closed ? 0.001 : 1e9
    default: return 1e6
  }
}

/** 是否为电压源（干电池组 / 学生电源接通） */
export function isVoltageSource(comp) {
  if (comp.type === 'battery') return true
  if (comp.type === 'powerSupply') return comp.props.on !== false
  return false
}

/** 元件电动势（V），非电源返回 0 */
export function emfOf(comp) {
  if (!isVoltageSource(comp)) return 0
  if (comp.type === 'powerSupply') return num(comp.props.voltage, 6)
  return num(comp.props.voltage, 3)
}

/** 是否为断路元件（断开的开关 / 关掉的电源） */
export function isOpen(comp) {
  if (comp.type === 'switch') return comp.props.closed !== true
  if (comp.type === 'powerSupply') return comp.props.on === false
  return false
}

/** 建立节点（Union-Find），给每个端口标 nodeId，返回节点总数 */
function assignNodes(components, wires) {
  const p = new Map()
  const find = (k) => {
    if (!p.has(k)) p.set(k, k)
    if (p.get(k) !== k) p.set(k, find(p.get(k)))
    return p.get(k)
  }
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) p.set(ra, rb) }
  const key = (cid, pi) => `${cid}:${pi}`

  for (const c of components) { find(key(c.id, 0)); find(key(c.id, 1)) }
  for (const w of wires) union(key(w.from.compId, w.from.portIdx), key(w.to.compId, w.to.portIdx))

  const nodeMap = new Map()
  let n = 0
  for (const c of components) {
    for (let i = 0; i < 2; i++) {
      const r = find(key(c.id, i))
      if (!nodeMap.has(r)) nodeMap.set(r, n++)
      c._node[i] = nodeMap.get(r)
    }
  }
  return n
}

/** 组装给 CircuitSolver 的输入 */
export function buildCircuitInfo(components, wires) {
  for (const c of components) c._node = [0, 0]
  const nodeCount = assignNodes(components, wires)

  const src = components.find((c) => c.type === 'battery' || c.type === 'powerSupply')
  const groundNode = src ? src._node[0] : (components.length ? components[0]._node[0] : 0)

  const comps = components.map((c) => ({
    id: c.id,
    type: c.type,
    node1: c._node[0],
    node2: c._node[1],
    resistance: resistanceOf(c),
    voltage: emfOf(c),
    isVoltageSource: isVoltageSource(c),
    isOpen: isOpen(c),
  }))

  return { nodeCount: Math.max(1, nodeCount), groundNode, components: comps }
}

/** 求解电路，返回 { results: Map<id,{current,voltage,power}>, diagnostics } */
export function solveCircuit(components, wires) {
  if (!components.length) {
    return { results: new Map(), diagnostics: { short: false, reason: '空实验台', maxCurrent: 0, sourceCount: 0 } }
  }
  const info = buildCircuitInfo(components, wires)
  const solver = new CircuitSolver()
  const results = solver.solve(info)
  return { results, diagnostics: results.diagnostics || { short: false, reason: '正常', maxCurrent: 0, sourceCount: 0 } }
}

/**
 * 导线中的电流（带符号，A）：从「from 端口」流出的电流。
 * 渲染层据此决定电流粒子的方向与速度。
 */
export function wireCurrentFrom(wire, components, results) {
  const c = components.find((c) => c.id === wire.from.compId)
  const r = results.get(c && c.id)
  if (!r) return 0
  return wire.from.portIdx === 0 ? -r.current : r.current
}

/** 灯泡亮度 0~1（按功率 vs 额定功率）与过载标志 */
export function bulbState(comp, results) {
  const r = results.get(comp.id)
  if (!r) return { brightness: 0, overload: 0 }
  const R = resistanceOf(comp)
  const ratedV = num(comp.props.ratedV, 2.5)
  const ratedP = (ratedV * ratedV) / R
  const power = Math.abs(r.power || 0)
  const brightness = ratedP > 0 ? Math.min(1.2, power / ratedP) : (power > 0 ? 1 : 0)
  const ratedI = ratedV / R
  const overload = Math.max(0, (Math.abs(r.current) - ratedI) / ratedI)
  return { brightness: Math.max(0, Math.min(1, brightness)), overload: Math.min(1, overload) }
}
