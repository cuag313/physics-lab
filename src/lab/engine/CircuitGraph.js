/**
 * CircuitGraph.js — 电路拓扑图引擎
 * 
 * 核心功能：
 * 1. 元件(Components) + 端口(Ports) + 导线(Wires) 数据结构
 * 2. Union-Find 自动合并连通端口为节点(Nodes)
 * 3. 串并联拓扑验证
 * 4. 为 MNA 求解器提供矩阵输入
 */

// ─── 端口定义（每种元件的接线柱位置）───
export const PORT_DEFS = {
  battery:   [{ x: -44, y: 0 }, { x: 44, y: 0 }],
  switch:    [{ x: -26, y: 0 }, { x: 26, y: 0 }],
  ammeter:   [{ x: -30, y: 0 }, { x: 30, y: 0 }],
  voltmeter: [{ x: -30, y: 0 }, { x: 30, y: 0 }],
  rheostat:  [{ x: -40, y: 0 }, { x: 40, y: 0 }],
  bulb:      [{ x: -20, y: 20 }, { x: 20, y: 20 }],
  resistor:  [{ x: -42, y: 0 }, { x: 42, y: 0 }],
}

// ─── Union-Find ───
class UnionFind {
  constructor() { this._p = new Map() }
  _key(cid, pi) { return `${cid}:${pi}` }
  find(k) {
    if (!this._p.has(k)) this._p.set(k, k)
    if (this._p.get(k) !== k) this._p.set(k, this.find(this._p.get(k)))
    return this._p.get(k)
  }
  union(a, b) { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this._p.set(ra, rb) }
  init(cid, pi) { this.find(this._key(cid, pi)) }
  root(cid, pi) { return this.find(this._key(cid, pi)) }
}

// ─── 电路图 ───
export class CircuitGraph {
  constructor() {
    this.components = []
    this.wires = []
    this._nextId = 1
  }

  // ─── 元件管理 ───
  addComponent(type, x, y, props = {}, useId = null) {
    const id = useId != null ? useId : this._nextId++
    if (useId != null && useId >= this._nextId) this._nextId = useId + 1
    const defs = PORT_DEFS[type] || [{ x: -30, y: 0 }, { x: 30, y: 0 }]
    const comp = {
      id, type, x, y,
      props: { resistance: 0, voltage: 0, closed: false, ...props },
      ports: defs.map((d, i) => ({ componentId: id, index: i, relX: d.x, relY: d.y, nodeId: -1 })),
      current: 0, voltage: 0,
    }
    this.components.push(comp)
    return comp
  }

  removeComponent(id) {
    this.components = this.components.filter(c => c.id !== id)
    this.wires = this.wires.filter(w => w.from.componentId !== id && w.to.componentId !== id)
  }

  getComponent(id) { return this.components.find(c => c.id === id) }

  // ─── 导线管理 ───
  addWire(from, to) {
    const wire = { id: this._nextId++, from: { ...from }, to: { ...to }, color: null, mid1X: null, mid1Y: null, mid2X: null, mid2Y: null }
    this.wires.push(wire)
    return wire
  }

  removeWire(id) { this.wires = this.wires.filter(w => w.id !== id) }

  // ─── 端口位置 ───
  getPortPos(compId, portIndex) {
    const comp = this.getComponent(compId)
    if (!comp || !comp.ports[portIndex]) return null
    const p = comp.ports[portIndex]
    return { x: comp.x + p.relX, y: comp.y + p.relY }
  }

  findPortNear(x, y, maxDist = 22) {
    let best = null, bestD = maxDist * maxDist
    for (const comp of this.components) {
      for (const port of comp.ports) {
        const px = comp.x + port.relX, py = comp.y + port.relY
        const d = (px - x) ** 2 + (py - y) ** 2
        if (d < bestD) { bestD = d; best = { componentId: comp.id, portIndex: port.index } }
      }
    }
    return best
  }

  findComponentNear(x, y, maxDist = 50) {
    for (let i = this.components.length - 1; i >= 0; i--) {
      const c = this.components[i]
      if (Math.abs(x - c.x) < maxDist && Math.abs(y - c.y) < maxDist) return c
    }
    return null
  }

  // ─── 节点分析（Union-Find 合并连通端口）───
  analyzeNodes() {
    const uf = new UnionFind()
    for (const comp of this.components)
      for (const port of comp.ports) uf.init(comp.id, port.index)
    for (const wire of this.wires)
      uf.union(uf._key(wire.from.componentId, wire.from.portIndex),
               uf._key(wire.to.componentId, wire.to.portIndex))

    const nodeMap = new Map(); let nextNode = 0
    for (const comp of this.components)
      for (const port of comp.ports) {
        const root = uf.root(comp.id, port.index)
        if (!nodeMap.has(root)) nodeMap.set(root, nextNode++)
        port.nodeId = nodeMap.get(root)
      }
    return nextNode
  }

  // ─── 获取元件的节点对 ───
  getNodePair(comp) {
    if (comp.ports.length < 2) return null
    return [comp.ports[0].nodeId, comp.ports[1].nodeId]
  }

  // ─── 构建邻接表（节点间通过元件连接）───
  buildNodeAdj() {
    const adj = new Map()
    const addEdge = (a, b, compId) => {
      if (!adj.has(a)) adj.set(a, [])
      adj.get(a).push({ node: b, compId })
    }
    for (const comp of this.components) {
      const pair = this.getNodePair(comp)
      if (!pair) continue
      addEdge(pair[0], pair[1], comp.id)
      addEdge(pair[1], pair[0], comp.id)
    }
    return adj
  }

  // ─── BFS 检查两节点间是否有路径（可排除某元件）───
  hasPath(startNode, endNode, excludeCompId = -1) {
    const adj = this.buildNodeAdj()
    const vis = new Set([startNode]), q = [startNode]
    while (q.length) {
      const n = q.shift()
      if (n === endNode) return true
      for (const edge of (adj.get(n) || [])) {
        if (edge.compId === excludeCompId) continue
        if (!vis.has(edge.node)) { vis.add(edge.node); q.push(edge.node) }
      }
    }
    return false
  }

  // ─── 电路验证 ───
  validate() {
    if (!this.components.length) return { ok: false, reason: '没有器材' }
    if (!this.components.some(c => c.type === 'battery')) return { ok: false, reason: '缺少电源' }
    if (!this.components.some(c => c.type === 'bulb')) return { ok: false, reason: '缺少灯泡' }

    // 检查所有元件已连线
    const wired = new Set()
    for (const w of this.wires) { wired.add(w.from.componentId); wired.add(w.to.componentId) }
    const unwired = this.components.filter(c => !wired.has(c.id))
    if (unwired.length) return { ok: false, reason: unwired.map(c => c.type).join('、') + '未连接' }

    this.analyzeNodes()

    const bat = this.components.find(c => c.type === 'battery')
    const batN0 = bat.ports[0].nodeId, batN1 = bat.ports[1].nodeId

    // 检查闭合回路
    if (!this.hasPath(batN1, batN0)) return { ok: false, reason: '断路：未形成闭合回路' }

    // 检查短路（电源正负极直接相连）
    for (const w of this.wires) {
      if (w.from.componentId === bat.id && w.to.componentId === bat.id)
        return { ok: false, reason: '短路！' }
    }

    // 伏特表必须并联（与某个元件共享同一对节点）
    const vm = this.components.find(c => c.type === 'voltmeter')
    if (vm && wired.has(vm.id)) {
      const vmPair = this.getNodePair(vm)
      if (vmPair) {
        const hasParallelTarget = this.components.find(c => {
          if (c.id === vm.id || c.type === 'battery') return false  // 不和电源比
          const p = this.getNodePair(c); if (!p) return false
          return (p[0] === vmPair[0] && p[1] === vmPair[1]) || (p[0] === vmPair[1] && p[1] === vmPair[0])
        })
        if (!hasParallelTarget) return { ok: false, reason: '伏特表串联→断路（应并联在灯泡两端）' }
      }
    }

    // 安培表不能并联（有另一个元件直接接在同一对节点上→短路）
    const am = this.components.find(c => c.type === 'ammeter')
    if (am && wired.has(am.id)) {
      const amPair = this.getNodePair(am)
      if (amPair) {
        const directParallel = this.components.find(c => {
          if (c.id === am.id) return false
          const p = this.getNodePair(c); if (!p) return false
          return (p[0] === amPair[0] && p[1] === amPair[1]) || (p[0] === amPair[1] && p[1] === amPair[0])
        })
        if (directParallel) return { ok: false, reason: '安培表并联→短路（应串联在电路中）' }
      }
    }

    return { ok: true, reason: '电路正常，可以实验' }
  }

  // ─── 获取电路拓扑信息（供Solver用）───
  getCircuitInfo() {
    this.analyzeNodes()
    const nodeCount = new Set(this.components.flatMap(c => c.ports.map(p => p.nodeId))).size
    const battery = this.components.find(c => c.type === 'battery')
    const groundNode = battery ? battery.ports[0].nodeId : 0

    return {
      nodeCount,
      groundNode,
      components: this.components.map(comp => {
        const pair = this.getNodePair(comp)
        return {
          id: comp.id,
          type: comp.type,
          node1: pair ? pair[0] : -1,
          node2: pair ? pair[1] : -1,
          resistance: this.getResistance(comp),
          voltage: comp.type === 'battery' ? (comp.props.voltage || 6) : 0,
          isVoltageSource: comp.type === 'battery',
          isOpen: comp.type === 'switch' && !comp.props.closed,
        }
      }),
    }
  }

  getResistance(comp) {
    switch (comp.type) {
      case 'resistor': return comp.props.resistance || 100
      case 'bulb': return comp.props.resistance || 15
      case 'rheostat': return comp.props.resistance || 10
      case 'ammeter': return 0.001  // 近似短路
      case 'voltmeter': return 1e6   // 近似断路
      case 'switch': return comp.props.closed ? 0.001 : 1e9
      default: return 1e6
    }
  }
}
