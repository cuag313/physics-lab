/**
 * 电学引擎 — 基于改进节点分析法(MNA)的电路求解器
 *
 * 核心流程：
 * 1. 从仪器和导线构建电路拓扑
 * 2. 分配节点编号
 * 3. 构建MNA矩阵 (G·v + B·i = s)
 * 4. 高斯消元求解
 * 5. 更新各仪器的电压/电流
 */

import { zeros, zerosVec, solve } from '../math/Matrix'

export class CircuitEngine {
  constructor() {
    this.instruments = []
    this.wires = []
    this.nodeCount = 0
    this.voltageSourceCount = 0
    this.solution = null
    this.valid = false
  }

  /**
   * 设置电路元件和导线
   */
  setCircuit(instruments, wires) {
    this.instruments = instruments
    this.wires = wires
    this.valid = false
  }

  /**
   * 构建电路拓扑并求解
   * @returns {boolean} 是否成功求解
   */
  solve() {
    // 1. 构建拓扑
    const topology = this._buildTopology()
    if (!topology) {
      this.valid = false
      return false
    }

    const { nodeMap, components, groundNode } = topology

    // 2. MNA求解
    try {
      this._solveMNA(nodeMap, components, groundNode)
      this.valid = true
      return true
    } catch (e) {
      console.warn('CircuitEngine solve failed:', e.message)
      this.valid = false
      return false
    }
  }

  /**
   * 构建电路拓扑
   * 分配节点编号，识别电路元件
   */
  _buildTopology() {
    // 用并查集合并相连的端口
    const parent = new Map()

    function find(x) {
      if (!parent.has(x)) parent.set(x, x)
      if (parent.get(x) !== x) parent.set(x, find(parent.get(x)))
      return parent.get(x)
    }

    function union(a, b) {
      const ra = find(a), rb = find(b)
      if (ra !== rb) parent.set(ra, rb)
    }

    // 每个端口的唯一标识
    function portKey(instId, portId) {
      return `${instId}:${portId}`
    }

    // 收集所有电学仪器
    const electricInstruments = this.instruments.filter(i =>
      i.category === 'electric' && i.type !== 'wire'
    )

    if (electricInstruments.length === 0) return null

    // 导线连接 → 合并端口
    for (const wire of this.wires) {
      union(
        portKey(wire.from.instrumentId, wire.from.portId),
        portKey(wire.to.instrumentId, wire.to.portId)
      )
    }

    // 滑动变阻器金属杆：滑片 P 与上端 C/D（tl/tr）等电位（电阻=0）
    for (const inst of electricInstruments) {
      if (inst.type !== 'rheostat') continue
      const rodKeys = ['wiper', 'tl', 'tr'].map((id) => portKey(inst.id, id))
      for (let i = 1; i < rodKeys.length; i++) union(rodKeys[0], rodKeys[i])
    }

    // 分配节点编号
    const nodeMap = new Map() // portKey → nodeId
    let nodeId = 0
    const rootToNode = new Map()

    for (const inst of electricInstruments) {
      for (const port of inst.ports) {
        const key = portKey(inst.id, port.id)
        const root = find(key)
        if (!rootToNode.has(root)) {
          rootToNode.set(root, nodeId++)
        }
        nodeMap.set(key, rootToNode.get(root))
        port.nodeId = rootToNode.get(root)
      }
    }

    if (nodeId === 0) return null

    // 选择接地节点（第一个电池的负极，或节点0）
    let groundNode = 0
    const battery = electricInstruments.find(i => i.type === 'battery')
    if (battery) {
      const negPort = battery.getPort('neg')
      if (negPort) {
        groundNode = nodeMap.get(portKey(battery.id, 'neg'))
      }
    }

    // 识别电路元件
    const components = []
    for (const inst of electricInstruments) {
      const nodeIds = inst.ports.map(p => nodeMap.get(portKey(inst.id, p.id)))

      switch (inst.type) {
        case 'battery':
          components.push({
            type: 'voltageSource',
            instrument: inst,
            nodePos: nodeMap.get(portKey(inst.id, 'pos')),
            nodeNeg: nodeMap.get(portKey(inst.id, 'neg')),
            voltage: inst.emf,
            resistance: inst.internalResistance
          })
          break

        case 'resistor':
        case 'bulb':
          components.push({
            type: 'resistor',
            instrument: inst,
            node1: nodeIds[0],
            node2: nodeIds[1],
            resistance: inst.resistance
          })
          break

        case 'switch':
          components.push({
            type: 'resistor',
            instrument: inst,
            node1: nodeIds[0],
            node2: nodeIds[1],
            resistance: inst.effectiveResistance
          })
          break

        case 'ammeter':
        case 'voltmeter':
          components.push({
            type: 'resistor',
            instrument: inst,
            // 量程柱决定接入点：导线接哪个柱就是哪个量程（full 优先，其次 mid）
            node1: nodeMap.get(portKey(inst.id, inst.getPort('full')?.isConnected ? 'full' : 'mid')),
            node2: nodeMap.get(portKey(inst.id, 'neg')),
            resistance: inst.resistance // 电流表内阻≈0，电压表内阻≈∞
          })
          break

        case 'rheostat': {
          // 按实际接入的两个接线柱注入单一等效电阻（不把左右两段同时注入）
          const conn = inst.getEffectiveConnection()
          if (conn.mode === 'open') {
            inst.voltage = 0
            inst.current = 0
            break
          }
          const nOf = (id) => nodeMap.get(portKey(inst.id, id))
          const rodWired = ['wiper', 'tl', 'tr'].filter((id) => inst.getPort(id)?.isConnected)
          let node1, node2
          if (conn.mode === 'left-wire') {
            node1 = nOf('left'); node2 = nOf(rodWired[0])
          } else if (conn.mode === 'right-wire') {
            node1 = nOf('right'); node2 = nOf(rodWired[0])
          } else if (conn.mode === 'full-wire') {
            node1 = nOf('left'); node2 = nOf('right')
          } else {
            // short：金属杆两柱，合并后为同一节点
            node1 = nOf(rodWired[0]); node2 = nOf(rodWired[1] ?? rodWired[0])
          }
          components.push({
            type: 'resistor',
            instrument: inst,
            node1, node2,
            resistance: Math.max(0.01, conn.r_eff)
          })
          break
        }
      }
    }

    return { nodeMap, components, groundNode, nodeCount: nodeId }
  }

  /**
   * MNA求解
   * 重新编号节点（排除接地节点），构建矩阵，求解
   */
  _solveMNA(nodeMap, components, groundNode) {
    // 重新编号（排除接地节点）
    const oldToNew = new Map()
    let n = 0
    for (const comp of components) {
      const nodes = [comp.node1, comp.node2, comp.nodePos, comp.nodeNeg].filter(x => x !== undefined)
      for (const node of nodes) {
        if (node !== groundNode && !oldToNew.has(node)) {
          oldToNew.set(node, n++)
        }
      }
    }

    if (n === 0) {
      // 所有节点都是地节点或无意义
      this._resetReadings()
      return
    }

    // 统计电压源数量
    const voltageSources = components.filter(c => c.type === 'voltageSource')
    const m = voltageSources.length
    const dim = n + m

    // 构建MNA矩阵 G·x = s
    const G = zeros(dim)
    const s = zerosVec(dim)

    // 电阻元件：填入电导矩阵
    for (const comp of components) {
      if (comp.type === 'resistor') {
        const i = comp.node1 === groundNode ? -1 : oldToNew.get(comp.node1)
        const j = comp.node2 === groundNode ? -1 : oldToNew.get(comp.node2)
        const g = 1 / comp.resistance // 电导

        if (i >= 0) G[i][i] += g
        if (j >= 0) G[j][j] += g
        if (i >= 0 && j >= 0) {
          G[i][j] -= g
          G[j][i] -= g
        }
      }
    }

    // 电压源元件：填入B矩阵和约束方程
    for (let k = 0; k < m; k++) {
      const comp = voltageSources[k]
      const i = comp.nodePos === groundNode ? -1 : oldToNew.get(comp.nodePos)
      const j = comp.nodeNeg === groundNode ? -1 : oldToNew.get(comp.nodeNeg)
      const row = n + k

      // KCL：电流从正极流出
      if (i >= 0) G[i][row] += 1
      if (j >= 0) G[j][row] -= 1

      // KVL约束：V_pos - V_neg = E
      if (i >= 0) G[row][i] += 1
      if (j >= 0) G[row][j] -= 1

      s[row] = comp.voltage
    }

    // 求解
    const x = solve(G, s)

    // 检测无效解（奇异矩阵导致全零）
    const hasVoltageSource = components.some(c => c.type === 'voltageSource')
    const allZero = x.every(v => Math.abs(v) < 1e-10)
    if (hasVoltageSource && allZero) {
      this._resetReadings()
      this.valid = false
      return
    }

    // 提取结果
    const nodeVoltages = new Map()
    nodeVoltages.set(groundNode, 0)
    for (const [oldNode, newNode] of oldToNew) {
      nodeVoltages.set(oldNode, x[newNode])
    }

    // 更新各仪器的电压/电流
    for (const comp of components) {
      if (comp.type === 'resistor') {
        const v1 = nodeVoltages.get(comp.node1) ?? 0
        const v2 = nodeVoltages.get(comp.node2) ?? 0
        const v = v1 - v2
        const i = v / comp.resistance

        // 带符号：仪表据此判断正向偏转 / 反偏（接反）
        comp.instrument.voltage = v
        comp.instrument.current = i

        // 极性信息（用于电流表方向）
        comp.instrument._voltageSign = v
        comp.instrument._currentSign = i
      }
    }

    // 电压源的电流
    for (let k = 0; k < m; k++) {
      const comp = voltageSources[k]
      const current = x[n + k]
      comp.instrument.current = Math.abs(current)
      comp.instrument._currentSign = current
    }
  }

  _resetReadings() {
    for (const inst of this.instruments) {
      inst.voltage = 0
      inst.current = 0
      inst._voltageSign = 0
      inst._currentSign = 0
    }
  }
}
