/**
 * CircuitSolver.js — 直流电路求解器（节点电压法 / 改进节点法 MNA）
 *
 * ────────────────────────────────────────────────────────────────
 *  改造说明（相对旧版的三处修正）
 *  1. 接地处理：旧版用「G[0][0] += 1e12」的大数法接地，会让矩阵条件数恶化到
 *     1e12 量级，安培表内阻 1e-3Ω（g=1e3）时数值误差明显。现改为
 *     **直接消去接地节点所在的行与列**，矩阵条件数只由元件本身决定。
 *  2. 浮空节点：旧版对没有任何接地通路的节点会得到奇异矩阵并静默返回全 0。
 *     现对每个节点加 1e-9 S 的对地漏电导（GMIN，SPICE 的通行做法），
 *     既保证可解，又不会影响 1e-3 ~ 1e6 量级元件的读数（误差 < 1e-4）。
 *  3. 短路/过载：旧版遇到电源两端被导线短接时矩阵矛盾，直接返回全 0 ——
 *     界面上表现为「电路安静地坏掉」。现在会给出 diagnostics.short，
 *     并保留电源的大电流读数，让上层可以做警示动画。
 *
 * ────────────────────────────────────────────────────────────────
 *  符号约定（渲染层/电流动画依赖，改动前请先读）
 *  · 每个元件两个接线柱：ports[0] = 负端，ports[1] = 正端。
 *  · 元件电流 current 定义为「元件内部从 ports[0] 流向 ports[1]」为正值。
 *      - 电阻/灯泡/电表：current = (V0 - V1) / R
 *      - 电源：current 即电池内部从负极到正极的电流，
 *              放电时为正 → 恰好等于外电路的干路电流，可直接当"总电流"用。
 *  · 电压源方程：V(ports[1]) - V(ports[0]) = E
 *    （旧版是 V0 - V1 = E，导致界面上画在右侧的"+"其实是低电位端，已修正）
 */

/** 电表内阻模型：电流表近似短路、电压表近似断路（与旧模型保持一致） */
export const METER_R = {
  ammeter: 0.001, // 电流表：1mΩ，串入电路几乎不影响电流
  voltmeter: 1e6, // 电压表：1MΩ，并联时几乎不分流
}

/** 教学直流电路里，超过这个电流就判定为短路/过载（6V 电源 + 0.01Ω 电流表 ≈ 600A） */
export const SHORT_CIRCUIT_CURRENT = 20 // A

/** 对地漏电导，稳定浮空子网络（SPICE 的 GMIN） */
const GMIN = 1e-9

export class CircuitSolver {
  constructor() {
    this.results = null
  }

  /**
   * 求解电路
   * @param {object} info CircuitGraph.getCircuitInfo() 的输出
   *   { nodeCount, groundNode, components: [{id,type,node1,node2,resistance,voltage,isVoltageSource,isOpen}] }
   * @returns {Map<compId, {current, voltage, power, nodeVoltages}>
   *           额外挂载：
   *           .nodeVoltages  按原始 nodeId 索引的节点电势
   *           .diagnostics   { short, reason, maxCurrent, sourceCount }
   */
  solve(info) {
    const safe = info || {}
    const components = Array.isArray(safe.components) ? safe.components : []
    const nodeCount = Math.max(1, safe.nodeCount || 1)
    const groundNode = safe.groundNode || 0

    // ── 退化情况：没有元件 / 只有孤立节点 —— 直接返回全 0，保证上层不崩 ──
    if (!components.length) return this._zeroResult(nodeCount, components)

    // ── 未知量编排：除接地点外的节点电势 + 每个电压源的支路电流 ──
    const nodeIndex = new Array(nodeCount).fill(-1)
    let m = 0
    for (let i = 0; i < nodeCount; i++) {
      if (i !== groundNode) nodeIndex[i] = m++
    }
    const sources = components.filter((c) => c.isVoltageSource)
    const size = m + sources.length

    if (size === 0) return this._zeroResult(nodeCount, components)

    const A = Array.from({ length: size }, () => new Float64Array(size))
    const z = new Float64Array(size)

    // 行/列索引 <0 表示该端子接在地上：接地行被消去，故直接跳过
    const stamp = (r, c, v) => {
      if (r < 0 || c < 0) return
      A[r][c] += v
    }

    // ── 导通元件（电阻/灯泡/滑动变阻器/电表…）──
    for (const comp of components) {
      if (comp.isVoltageSource) continue
      if (comp.isOpen) continue // 断开的开关：不注入任何电导
      const n1 = nodeIndex[comp.node1]
      const n2 = nodeIndex[comp.node2]
      if (n1 === n2) continue // 两端同节点 → 被短路，导纳无意义
      const R = Math.max(comp.resistance || 0, 1e-6)
      const g = 1 / R
      stamp(n1, n1, g)
      stamp(n2, n2, g)
      stamp(n1, n2, -g)
      stamp(n2, n1, -g)
    }

    // ── 电压源 ──
    // KCL：支路电流 I 从 ports[0] 流入电源、从 ports[1] 流出电源内部
    // 约束：V(ports[1]) - V(ports[0]) = E
    sources.forEach((comp, k) => {
      const n1 = nodeIndex[comp.node1]
      const n2 = nodeIndex[comp.node2]
      const col = m + k
      stamp(n1, col, 1)
      stamp(n2, col, -1)
      stamp(col, n2, 1)
      stamp(col, n1, -1)
      z[col] = comp.voltage || 0
    })

    // ── GMIN：每个非接地节点对地 1nS，避免浮空子网络导致奇异矩阵 ──
    for (let i = 0; i < nodeCount; i++) {
      const r = nodeIndex[i]
      if (r >= 0) A[r][r] += GMIN
    }

    const x = this.gaussianElimination(A, z)
    if (!x) return this._zeroResult(nodeCount, components)

    // ── 节点电势 ──
    const nodeVoltages = new Array(nodeCount).fill(0)
    for (let i = 0; i < nodeCount; i++) {
      const r = nodeIndex[i]
      if (r >= 0) nodeVoltages[i] = x[r]
    }

    // ── 元件电流/电压/功率 ──
    const results = new Map()
    let maxCurrent = 0
    let shortedSource = false

    for (const comp of components) {
      const v1 = nodeVoltages[comp.node1] || 0
      const v2 = nodeVoltages[comp.node2] || 0
      const vDrop = v1 - v2 // ports[0] 相对 ports[1] 的电势差

      let current = 0
      let voltage = vDrop
      if (comp.isVoltageSource) {
        const k = sources.indexOf(comp)
        current = x[m + k] || 0
        voltage = comp.voltage || 0 // 电源电动势
        if (comp.node1 === comp.node2) shortedSource = true
      } else if (comp.isOpen) {
        current = 0 // 断路：开关两端有电势差但无电流
      } else if (comp.node1 === comp.node2) {
        current = 0 // 被导线短接的元件
      } else {
        const R = Math.max(comp.resistance || 0, 1e-6)
        current = vDrop / R
      }

      const absI = Math.abs(current)
      if (absI > maxCurrent) maxCurrent = absI

      results.set(comp.id, {
        current,
        voltage,
        power: Math.abs(voltage * current),
        terminalVoltage: Math.abs(v2 - v1), // 电源端电压（内阻为 0 时等于电动势）
        nodeVoltages: [v1, v2],
      })
    }

    const isShort = shortedSource || maxCurrent >= SHORT_CIRCUIT_CURRENT
    results.nodeVoltages = nodeVoltages

    // ── 错误接法检测（solve 后）──
    // 电流表被并联在元件两端：未串在支路（与另一元件同节点对）且两端电位差 > 0.5V
    // 电压表串在干路：无并联对象且所在支路电流（短接该表的探针值）> 0.01A
    let ammeterParallel = false
    let voltmeterSeries = false
    const directParallel = (comp) => components.some((o) =>
      o.id !== comp.id && o.node1 === comp.node1 && o.node2 === comp.node2)
    if (!info._noDiag) {
      for (const comp of components) {
        const r = results.get(comp.id)
        if (!r) continue
        if (comp.type === 'ammeter' && directParallel(comp) && Math.abs(r.voltage) > 0.5) {
          ammeterParallel = true
        }
        if (comp.type === 'voltmeter' && !directParallel(comp)) {
          // 探针：把电压表短接后所在支路的电流
          const probeInfo = {
            ...info,
            _noDiag: true,
            components: info.components.map((c) => (c.id === comp.id ? { ...c, resistance: 1e-4 } : c)),
          }
          const pr = new CircuitSolver().solve(probeInfo)
          if (Math.abs(pr.get(comp.id)?.current || 0) > 0.01) voltmeterSeries = true
        }
      }
    }

    results.diagnostics = {
      short: isShort,
      reason: isShort ? '短路：电流过大，电源被直接短接' : '正常',
      maxCurrent,
      sourceCount: sources.length,
      ammeterParallel,
      voltmeterSeries,
    }
    this.results = results
    return results
  }

  /** 退化/求解失败时的统一返回：全 0，结构完整，避免上层判空 */
  _zeroResult(nodeCount, components) {
    const results = new Map()
    for (const comp of components) {
      results.set(comp.id, { current: 0, voltage: 0, power: 0, terminalVoltage: 0, nodeVoltages: [0, 0] })
    }
    results.nodeVoltages = new Array(nodeCount).fill(0)
    results.diagnostics = { short: false, reason: '电路不完整', maxCurrent: 0, sourceCount: 0, ammeterParallel: false, voltmeterSeries: false }
    return results
  }

  /**
   * 高斯消元（列主元）
   * @param {Float64Array[]} A n×n
   * @param {Float64Array} b n
   * @returns {Float64Array|null} 奇异矩阵返回 null
   */
  gaussianElimination(A, b) {
    const n = A.length
    if (!n) return null
    // 复制成增广矩阵，避免污染调用方数据
    const M = A.map((row, i) => {
      const r = new Float64Array(n + 1)
      r.set(row)
      r[n] = b[i]
      return r
    })

    for (let col = 0; col < n; col++) {
      // 选主元
      let pivot = col
      let maxAbs = Math.abs(M[col][col])
      for (let row = col + 1; row < n; row++) {
        const v = Math.abs(M[row][col])
        if (v > maxAbs) {
          maxAbs = v
          pivot = row
        }
      }
      if (maxAbs < 1e-12) return null // 奇异：拓扑上真的无解
      if (pivot !== col) {
        const tmp = M[col]
        M[col] = M[pivot]
        M[pivot] = tmp
      }
      // 消元
      const diag = M[col][col]
      for (let row = col + 1; row < n; row++) {
        const factor = M[row][col] / diag
        if (!factor) continue
        for (let j = col; j <= n; j++) M[row][j] -= factor * M[col][j]
      }
    }

    // 回代
    const x = new Float64Array(n)
    for (let i = n - 1; i >= 0; i--) {
      let sum = M[i][n]
      for (let j = i + 1; j < n; j++) sum -= M[i][j] * x[j]
      x[i] = sum / M[i][i]
      if (!Number.isFinite(x[i])) return null
    }
    return x
  }

  /** 取某元件结果 */
  getResult(compId) {
    return this.results?.get(compId) || { current: 0, voltage: 0, power: 0 }
  }
}

/**
 * 导线电流符号：返回沿「from 端子 → to 端子」方向的电流（安培，带符号）
 * 渲染层据此决定导线内电子流动的方向与速度。
 *
 * 推导：元件内部电流定义为 ports[0]→ports[1] 为正，
 * 所以「从 port 0 流出元件」的电流是 -I，从 port 1 流出的是 +I。
 */
export function wireCurrent(fromComp, fromPort, results) {
  const r = results?.get(fromComp.id)
  if (!r) return 0
  return fromPort === 0 ? -r.current : r.current
}
