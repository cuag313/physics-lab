/**
 * CircuitSolver.js — 节点电压法（MNA）电路求解器
 * 
 * 输入：CircuitGraph.getCircuitInfo() 的拓扑数据
 * 输出：每个元件的电流、电压、功率
 * 
 * 原理：
 *   对 N 个节点 + M 个电压源，构建 (N+M)×(N+M) 矩阵
 *   G·x = b，其中 x = [V1,V2,...,VN, I_vs1,I_vs2,...]
 *   高斯消元求解
 */

export class CircuitSolver {
  constructor() {
    this.results = null
  }

  /**
   * 求解电路
   * @param {object} info - CircuitGraph.getCircuitInfo() 的输出
   * @returns {Map<compId, {current, voltage, power}>}
   */
  solve(info) {
    const { nodeCount, groundNode, components } = info

    // 收集电压源
    const vSources = components.filter(c => c.isVoltageSource)
    const vCount = vSources.length
    const n = nodeCount + vCount

    // 初始化矩阵和右侧向量
    const G = Array.from({ length: n }, () => Array(n).fill(0))
    const b = Array(n).fill(0)

    // 节点重映射：把 groundNode 映射到0，其他顺延
    const nodeMap = new Map()
    let mapped = 0
    for (let i = 0; i < nodeCount; i++) {
      nodeMap.set(i, i === groundNode ? 0 : ++mapped)
    }
    // 确保 groundNode → 0
    const remap = (node) => nodeMap.get(node) ?? node

    // 填充导纳矩阵
    for (const comp of components) {
      if (comp.isOpen) continue  // 断开的开关跳过

      const n1 = remap(comp.node1)
      const n2 = remap(comp.node2)

      if (comp.isVoltageSource) {
        // 电压源：在矩阵中增加一行一列
        const vIdx = nodeCount + vSources.indexOf(comp)
        // KVL: V(n1) - V(n2) = E
        G[n1][vIdx] += 1
        G[n2][vIdx] -= 1
        G[vIdx][n1] += 1
        G[vIdx][n2] -= 1
        b[vIdx] = comp.voltage
      } else {
        // 导纳元件（电阻、灯泡、滑动变阻器、安培表等）
        const R = Math.max(comp.resistance, 1e-9)  // 防止除零
        const g = 1.0 / R
        G[n1][n1] += g
        G[n2][n2] += g
        G[n1][n2] -= g
        G[n2][n1] -= g
      }
    }

    // 地节点约束：V(ground) = 0
    // 通过在 G[0][0] 加大数实现
    G[0][0] += 1e12
    b[0] = 0

    // 高斯消元
    const x = this.gaussianElimination(G, b)
    if (!x) {
      // 求解失败（奇异矩阵）
      const results = new Map()
      for (const comp of components) {
        results.set(comp.id, { current: 0, voltage: 0, power: 0 })
      }
      return results
    }

    // 提取节点电压
    const nodeVoltages = Array(nodeCount)
    for (let i = 0; i < nodeCount; i++) {
      nodeVoltages[i] = x[remap(i)] || 0
    }

    // 计算每个元件的电流、电压、功率
    const results = new Map()
    for (const comp of components) {
      const v1 = nodeVoltages[comp.node1] || 0
      const v2 = nodeVoltages[comp.node2] || 0
      const vDrop = v1 - v2  // 元件两端电压

      let current = 0
      if (comp.isVoltageSource) {
        // 电压源电流从 MNA 解中取
        const vIdx = nodeCount + vSources.indexOf(comp)
        current = x[vIdx] || 0
      } else if (comp.isOpen) {
        current = 0
      } else {
        const R = Math.max(comp.resistance, 1e-9)
        current = vDrop / R
      }

      const voltage = comp.isVoltageSource ? comp.voltage : vDrop
      const power = Math.abs(voltage * current)

      results.set(comp.id, {
        current: current,
        voltage: voltage,
        power: power,
        nodeVoltages: [v1, v2],
      })
    }

    this.results = results
    return results
  }

  /**
   * 高斯消元法（部分主元）
   */
  gaussianElimination(A, b) {
    const n = A.length
    // 增广矩阵
    const M = A.map((row, i) => [...row, b[i]])

    for (let col = 0; col < n; col++) {
      // 选主元
      let maxRow = col
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row
      }
      ;[M[col], M[maxRow]] = [M[maxRow], M[col]]

      if (Math.abs(M[col][col]) < 1e-15) continue  // 奇异

      // 消元
      for (let row = col + 1; row < n; row++) {
        const factor = M[row][col] / M[col][col]
        for (let j = col; j <= n; j++) {
          M[row][j] -= factor * M[col][j]
        }
      }
    }

    // 回代
    const x = Array(n).fill(0)
    for (let i = n - 1; i >= 0; i--) {
      if (Math.abs(M[i][i]) < 1e-15) continue
      x[i] = M[i][n]
      for (let j = i + 1; j < n; j++) {
        x[i] -= M[i][j] * x[j]
      }
      x[i] /= M[i][i]
    }

    return x
  }

  /**
   * 获取指定元件的结果
   */
  getResult(compId) {
    return this.results?.get(compId) || { current: 0, voltage: 0, power: 0 }
  }
}
