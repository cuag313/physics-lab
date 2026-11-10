/**
 * CircuitGraph.js — 电路拓扑图引擎
 * 
 * 核心功能：
 * 1. 元件(Components) + 端口(Ports) + 导线(Wires) 数据结构
 * 2. Union-Find 自动合并连通端口为节点(Nodes)
 * 3. 串并联拓扑验证
 * 4. 为 MNA 求解器提供矩阵输入
 */

import { METER_R } from './CircuitSolver.js'

// ─── 端口定义（每种元件的接线柱位置）───
export const PORT_DEFS = {
  battery:    [{ x: -44, y: 0 }, { x: 44, y: 0 }],
  switch:     [{ x: -26, y: 0 }, { x: 26, y: 0 }],
  ammeter:    [{ x: -30, y: 0 }, { x: 30, y: 0 }],
  voltmeter:  [{ x: -30, y: 0 }, { x: 30, y: 0 }],
  multimeter: [{ x: -28, y: 36 }, { x: 28, y: 36 }],   // 万用表：底部红黑插孔，按档位当电流表或电压表用
  // 滑动变阻器 5 柱（真实初中器材）：A/B=电阻丝两端，P=滑片，tl/tr=金属杆两端
  rheostat:   [{ x: -40, y: 0 }, { x: 40, y: 0 }, { x: 0, y: -14 }, { x: -22, y: -14 }, { x: 22, y: -14 }],
  bulb:       [{ x: -20, y: 20 }, { x: 20, y: 20 }],
  resistor:   [{ x: -42, y: 0 }, { x: 42, y: 0 }],
  inductor:   [{ x: -30, y: 0 }, { x: 30, y: 0 }],
  capacitor:  [{ x: -30, y: 0 }, { x: 30, y: 0 }],
  transformer:[{ x: -40, y: -10 }, { x: 40, y: -10 }],  // 原边2端子（简化）
}

// ─── 滑动变阻器接入方式分类（与 instruments/electric/Rheostat.js 同一模型）───
// 电阻丝只在 A-B 之间连续；P/tl/tr 经金属杆连通（等电位，电阻=0）。
// 按实际接了哪两个接线柱输出单一等效电阻——不把左右两段同时注入矩阵。
const RHEO_PORT_ID = ['left', 'right', 'wiper', 'tl', 'tr']
const RHEO_ROD = ['wiper', 'tl', 'tr']

/**
 * @param {Set<string>} wired 已接线的端口 id
 * @returns {{mode:'left-wire'|'right-wire'|'full-wire'|'short'|'open', r_eff:number, warning:string|null}}
 */
function classifyRheostatConnection(wired, sliderPos, totalR) {
  const pos = Math.min(1, Math.max(0, Number(sliderPos) || 0))
  const Rt = Math.max(Number(totalR) || 0, 0)
  const hasL = wired.has('left')
  const hasR = wired.has('right')
  const rod = RHEO_ROD.filter((id) => wired.has(id))
  const hasRod = rod.length > 0

  // tl+tr / P+上端：金属杆短路，0Ω
  if (rod.length >= 2 && !hasL && !hasR) {
    return { mode: 'short', r_eff: 0, warning: '上端接线柱经金属杆连通，接入电阻 0Ω（相当于导线）' }
  }

  const groups = (hasL ? 1 : 0) + (hasR ? 1 : 0) + (hasRod ? 1 : 0)
  if (groups <= 1) return { mode: 'open', r_eff: Infinity, warning: null }

  if (hasL && hasRod && !hasR) return { mode: 'left-wire', r_eff: Rt * pos, warning: null }
  if (hasR && hasRod && !hasL) return { mode: 'right-wire', r_eff: Rt * (1 - pos), warning: null }
  return { mode: 'full-wire', r_eff: Rt, warning: '已接入电阻丝两端 A、B，滑片不起作用，接入最大阻值' }
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
    // 滑动变阻器金属杆：滑片 P 与上端 tl/tr 等电位（电阻=0）
    for (const comp of this.components) {
      if (comp.type !== 'rheostat' || comp.ports.length < 5) continue
      uf.union(uf._key(comp.id, comp.ports[2].index), uf._key(comp.id, comp.ports[3].index))
      uf.union(uf._key(comp.id, comp.ports[3].index), uf._key(comp.id, comp.ports[4].index))
    }

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
    if (comp.type === 'rheostat') {
      const { pair } = this._rheoConnection(comp)
      if (!pair) return null
      return [comp.ports[pair[0]].nodeId, comp.ports[pair[1]].nodeId]
    }
    return [comp.ports[0].nodeId, comp.ports[1].nodeId]
  }

  /**
   * 滑动变阻器实际接入分析：
   * 识别实际连了哪两个接线柱，输出等效电阻与对应的端口下标对。
   */
  _rheoConnection(comp) {
    const p = comp.props || {}
    const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
    const sliderPos = Math.min(1, Math.max(0, num(p.sliderPos, 0.5)))
    const totalR = Math.max(num(p.totalResistance, num(p.resistance, 20)), 0)
    const wired = new Set()
    const wiredIdx = []
    for (const w of this.wires) {
      for (const end of [w.from, w.to]) {
        if (end.componentId !== comp.id) continue
        const id = RHEO_PORT_ID[end.portIndex]
        if (id && !wired.has(id)) { wired.add(id); wiredIdx.push(end.portIndex) }
      }
    }
    const { mode, r_eff, warning } = classifyRheostatConnection(wired, sliderPos, totalR)
    const rodIdx = wiredIdx.filter((i) => i >= 2)
    let pair = null
    if (mode === 'left-wire') pair = [0, rodIdx[0]]
    else if (mode === 'right-wire') pair = [1, rodIdx[0]]
    else if (mode === 'full-wire') pair = [0, 1]
    else if (mode === 'short') pair = [rodIdx[0], rodIdx[1]]
    return { mode, r_eff, warning, pair }
  }

  /** 滑动变阻器接入方式：{ mode, r_eff, warning } */
  getEffectiveConnection(comp) {
    const c = comp && comp.ports ? comp : this.getComponent(comp)
    if (!c || c.type !== 'rheostat') return { mode: 'open', r_eff: Infinity, warning: null }
    const { mode, r_eff, warning } = this._rheoConnection(c)
    return { mode, r_eff, warning }
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

  // ─── BFS 检查两节点间是否有路径（可排除元件 id 或 id 集合）───
  hasPath(startNode, endNode, excludeCompIds = []) {
    const exclude = excludeCompIds instanceof Set
      ? excludeCompIds
      : new Set(Array.isArray(excludeCompIds) ? excludeCompIds : [excludeCompIds])
    const adj = this.buildNodeAdj()
    const vis = new Set([startNode]), q = [startNode]
    while (q.length) {
      const n = q.shift()
      if (n === endNode) return true
      for (const edge of (adj.get(n) || [])) {
        if (exclude.has(edge.compId)) continue
        if (!vis.has(edge.node)) { vis.add(edge.node); q.push(edge.node) }
      }
    }
    return false
  }

  // ─── 电路验证 ───
  validate() {
    if (!this.components.length) return { ok: false, reason: '没有器材' }
    if (!this.components.some(c => c.type === 'battery')) return { ok: false, reason: '缺少电源' }
    if (!this.components.some(c => c.type === 'bulb' || c.type === 'resistor' || c.type === 'rheostat')) {
      return { ok: false, reason: '缺少负载（灯泡、电阻或滑动变阻器）' }
    }

    this.analyzeNodes()

    const bat = this.components.find(c => c.type === 'battery')
    const batN0 = bat.ports[0].nodeId, batN1 = bat.ports[1].nodeId

    // 短路判定（修正，优先级最高）：不再只认「一根导线直连电源两端」这种最笨的情形。
    // 只要正负极经 Union-Find 合并成同一个节点（不论绕了几根线、几个开关），
    // 就是短路。旧版遇到「电源 + → 开关 → 导线 → 电源 −」会漏判，
    // 再交给求解器时矩阵矛盾，界面表现为电路无提示地全 0。
    if (batN0 === batN1) {
      return { ok: false, reason: '短路！电源正负极被导线直接连通' }
    }

    // 检查所有元件已连线（未连线的万用表除外：它是可选测量工具，靠表笔读数）
    const wired = new Set()
    for (const w of this.wires) { wired.add(w.from.componentId); wired.add(w.to.componentId) }
    const unwired = this.components.filter(c => !wired.has(c.id) && c.type !== 'multimeter')
    if (unwired.length) return { ok: false, reason: unwired.map(c => c.type).join('、') + '未连接' }

    // 检查闭合回路：外电路须能在不经过电源自身的情况下从正极回到负极
    if (!this.hasPath(batN1, batN0, [bat.id])) return { ok: false, reason: '断路：未形成闭合回路' }

    // 伏特表必须并联：去掉 V 表后外电路仍须闭合。
    // （若看 V 表两端是否有旁路，串联时电源会被算成旁路；若不排除电源，
    //   hasPath(batN1,batN0) 也永远为真。）
    const voltageMeters = this.components.filter(c =>
      c.type === 'voltmeter' || (c.type === 'multimeter' && c.props && c.props.mode !== 'A')
    )
    for (const vm of voltageMeters) {
      if (!wired.has(vm.id)) continue
      const exclude = [bat.id, ...voltageMeters.map(m => m.id)]
      if (!this.hasPath(batN1, batN0, exclude)) {
        return { ok: false, reason: '伏特表串联→断路（应并联在待测元件两端）' }
      }
    }

    // 安培表不能并联（有另一个元件直接接在同一对节点上→短路）
    const ammeters = this.components.filter(c =>
      c.type === 'ammeter' || (c.type === 'multimeter' && c.props && c.props.mode === 'A')
    )
    for (const am of ammeters) {
      if (!wired.has(am.id)) continue
      const amPair = this.getNodePair(am)
      if (!amPair) continue
      const directParallel = this.components.find(c => {
        if (c.id === am.id) return false
        const p = this.getNodePair(c); if (!p) return false
        return (p[0] === amPair[0] && p[1] === amPair[1]) || (p[0] === amPair[1] && p[1] === amPair[0])
      })
      if (directParallel) return { ok: false, reason: '安培表并联→短路（应串联在电路中）' }
    }

    return { ok: true, reason: '电路正常，可以实验' }
  }

  // ─── 获取电路拓扑信息（供Solver用）───
  // 极性约定：ports[0] = 负接线柱，ports[1] = 正接线柱，
  // 求解器据此令 V(ports[1]) - V(ports[0]) = 电动势，
  // 与界面把「+」画在右端（port 1）保持一致。
  getCircuitInfo() {
    this.analyzeNodes()
    const nodeCount = new Set(this.components.flatMap(c => c.ports.map(p => p.nodeId))).size
    const battery = this.components.find(c => c.type === 'battery')
    const groundNode = battery ? battery.ports[0].nodeId : 0

    return {
      nodeCount: Math.max(1, nodeCount),
      groundNode,
      components: this.components.map(comp => {
        const pair = this.getNodePair(comp)
        const emf = Number(comp.props?.voltage)
        return {
          id: comp.id,
          type: comp.type,
          node1: pair ? pair[0] : -1,
          node2: pair ? pair[1] : -1,
          resistance: this.getResistance(comp),
          voltage: comp.type === 'battery' ? (Number.isFinite(emf) ? emf : 6) : 0,
          isVoltageSource: comp.type === 'battery',
          isOpen: (comp.type === 'switch' && !comp.props.closed)
            || (comp.type === 'rheostat' && this._rheoConnection(comp).mode === 'open'),
        }
      }),
    }
  }

  /**
   * 元件等效阻值（Ω）
   * 无源元件优先取 props.resistance（这样参数面板改阻值才能生效），
   * 电表用统一的内阻模型，不允许被界面随意改动，保证读数可信。
   */
  getResistance(comp) {
    const p = comp.props || {}
    const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
    switch (comp.type) {
      case 'resistor': return Math.max(num(p.resistance, 100), 1e-3)
      case 'bulb': return Math.max(num(p.resistance, 15), 1e-3)
      case 'rheostat': {
        // 按实际接入的两个接线柱取单一等效电阻（不把左右两段同时注入）
        const { mode, r_eff } = this._rheoConnection(comp)
        if (mode === 'open') return 1e9
        return Math.max(r_eff, 1e-6) // 0Ω 允许（滑片止点/金属杆短路）
      }
      case 'inductor': return 0.001 // 直流稳态：电感近似短路
      case 'capacitor': return 1e9 // 直流稳态：电容近似开路
      case 'transformer': return 0.001 // 原边绕组直流近似短路（暂不处理副边）
      case 'ammeter': return METER_R.ammeter // 极小内阻
      case 'voltmeter': return METER_R.voltmeter // 极大内阻
      case 'multimeter': return p.mode === 'A' ? 0.001 : 1e6 // A档当电流表，V档当电压表
      case 'switch': return p.closed ? 0.001 : 1e9 // 断开时视为开路
      default: return 1e6
    }
  }
}
