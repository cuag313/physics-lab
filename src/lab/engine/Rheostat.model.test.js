import { describe, expect, it } from 'vitest'
import { CircuitGraph, CircuitSolver } from './index.js'
import { Rheostat } from '../instruments/electric/Rheostat.js'

/**
 * 滑动变阻器端口模型（真实初中器材）：
 * 电阻丝只在 A-B 之间连续；P/tl/tr 经金属杆连通。
 * 按实际接入的两个接线柱输出单一等效电阻，不把左右两段同时注入矩阵。
 *
 * 端口下标：0=A(left) 1=B(right) 2=P(wiper) 3=tl 4=tr
 */

const V = 1.5
const R_TOTAL = 10
const R_BULB = 10

/** 1.5V 电池 + 10Ω 变阻器 + 灯泡 串联；aIdx/bIdx 为变阻器实际接入的两个端口下标 */
function buildLoop(g, { sliderPos = 0.3, aIdx = 0, bIdx = 2, totalResistance = R_TOTAL, voltage = V } = {}) {
  const bat = g.addComponent('battery', 0, 0, { voltage })
  const rheo = g.addComponent('rheostat', 0, 0, { totalResistance, sliderPos })
  const bulb = g.addComponent('bulb', 0, 0, { resistance: R_BULB })
  g.addWire({ componentId: bat.id, portIndex: 1 }, { componentId: rheo.id, portIndex: aIdx })
  g.addWire({ componentId: rheo.id, portIndex: bIdx }, { componentId: bulb.id, portIndex: 1 })
  g.addWire({ componentId: bulb.id, portIndex: 0 }, { componentId: bat.id, portIndex: 0 })
  return { bat, rheo, bulb }
}

function solveLoop(g) {
  return new CircuitSolver().solve(g.getCircuitInfo())
}

describe('滑动变阻器端口模型：按实际接线柱输出等效电阻', () => {
  it('A+P 且 sliderPos=0.3：左段 R=3Ω，电流 = 1.5 / (3 + R_bulb)', () => {
    const g = new CircuitGraph()
    const { bat, rheo, bulb } = buildLoop(g, { aIdx: 0, bIdx: 2, sliderPos: 0.3 })

    const conn = g.getEffectiveConnection(rheo)
    expect(conn.mode).toBe('left-wire')
    expect(conn.r_eff).toBeCloseTo(3, 10)

    // 单一等效电阻注入：getCircuitInfo 里变阻器只有一条记录
    const info = g.getCircuitInfo()
    const entries = info.components.filter((c) => c.id === rheo.id)
    expect(entries).toHaveLength(1)
    expect(entries[0].resistance).toBeCloseTo(3, 10)

    const r = solveLoop(g)
    const expectedI = V / (3 + R_BULB)
    expect(Math.abs(r.get(bat.id).current)).toBeCloseTo(expectedI, 6)
    expect(Math.abs(r.get(bulb.id).current)).toBeCloseTo(expectedI, 6)
  })

  it('A+tl / A+tr 与 A+P 等价（上端柱经金属杆与滑片连通）', () => {
    for (const upper of [3, 4]) {
      const g = new CircuitGraph()
      const { rheo } = buildLoop(g, { aIdx: 0, bIdx: upper, sliderPos: 0.3 })
      const conn = g.getEffectiveConnection(rheo)
      expect(conn.mode).toBe('left-wire')
      expect(conn.r_eff).toBeCloseTo(3, 10)
    }
  })

  it('B+P 且 sliderPos=0.3：右段 R=7Ω', () => {
    const g = new CircuitGraph()
    const { bat, rheo } = buildLoop(g, { aIdx: 1, bIdx: 2, sliderPos: 0.3 })
    const conn = g.getEffectiveConnection(rheo)
    expect(conn.mode).toBe('right-wire')
    expect(conn.r_eff).toBeCloseTo(7, 10)
    const r = solveLoop(g)
    expect(Math.abs(r.get(bat.id).current)).toBeCloseTo(V / (7 + R_BULB), 6)
  })

  it('A+B：全连电阻丝，R=10Ω 与滑片位置无关，返回中文提示', () => {
    for (const sliderPos of [0, 0.5, 1]) {
      const g = new CircuitGraph()
      const { bat, rheo } = buildLoop(g, { aIdx: 0, bIdx: 1, sliderPos })
      const conn = g.getEffectiveConnection(rheo)
      expect(conn.mode).toBe('full-wire')
      expect(conn.r_eff).toBeCloseTo(R_TOTAL, 10)
      expect(conn.warning).toBeTruthy()
      expect(typeof conn.warning).toBe('string')
      const r = solveLoop(g)
      expect(Math.abs(r.get(bat.id).current)).toBeCloseTo(V / (R_TOTAL + R_BULB), 6)
    }
  })

  it('tl+tr：金属杆短路，R=0，电流 = 1.5 / R_bulb', () => {
    const g = new CircuitGraph()
    const { bat, rheo, bulb } = buildLoop(g, { aIdx: 3, bIdx: 4, sliderPos: 0.3 })
    const conn = g.getEffectiveConnection(rheo)
    expect(conn.mode).toBe('short')
    expect(conn.r_eff).toBe(0)
    expect(conn.warning).toBeTruthy()
    const r = solveLoop(g)
    // 两柱并成同一节点，变阻器等效为导线
    expect(Math.abs(r.get(bat.id).current)).toBeCloseTo(V / R_BULB, 4)
    expect(Math.abs(r.get(bulb.id).current)).toBeCloseTo(V / R_BULB, 4)
  })

  it('P+上端同样短路；只接一个接线柱/悬空为开路', () => {
    const g1 = new CircuitGraph()
    const { rheo: r1 } = buildLoop(g1, { aIdx: 2, bIdx: 3 })
    expect(g1.getEffectiveConnection(r1).mode).toBe('short')

    const g2 = new CircuitGraph()
    const rheo2 = g2.addComponent('rheostat', 0, 0, { totalResistance: R_TOTAL })
    g2.addWire({ componentId: rheo2.id, portIndex: 0 }, { componentId: rheo2.id, portIndex: 0 })
    expect(g2.getEffectiveConnection(rheo2).mode).toBe('open')

    const g3 = new CircuitGraph()
    const rheo3 = g3.addComponent('rheostat', 0, 0, { totalResistance: R_TOTAL })
    expect(g3.getEffectiveConnection(rheo3).mode).toBe('open')
    expect(rheo3).toBeTruthy()
  })

  it('A+B+P 三柱全接：电阻丝全连优先，滑片无效', () => {
    const g = new CircuitGraph()
    const bat = g.addComponent('battery', 0, 0, { voltage: V })
    const rheo = g.addComponent('rheostat', 0, 0, { totalResistance: R_TOTAL, sliderPos: 0.3 })
    const bulb = g.addComponent('bulb', 0, 0, { resistance: R_BULB })
    g.addWire({ componentId: bat.id, portIndex: 1 }, { componentId: rheo.id, portIndex: 0 })
    g.addWire({ componentId: rheo.id, portIndex: 1 }, { componentId: bulb.id, portIndex: 1 })
    g.addWire({ componentId: rheo.id, portIndex: 2 }, { componentId: bulb.id, portIndex: 1 })
    g.addWire({ componentId: bulb.id, portIndex: 0 }, { componentId: bat.id, portIndex: 0 })
    const conn = g.getEffectiveConnection(rheo)
    expect(conn.mode).toBe('full-wire')
    expect(conn.r_eff).toBeCloseTo(R_TOTAL, 10)
    expect(conn.warning).toBeTruthy()
  })
})

describe('Rheostat 仪器 getEffectiveConnection()', () => {
  const make = () => {
    const rh = new Rheostat()
    rh.setParam('totalResistance', R_TOTAL)
    rh.setParam('sliderPos', 0.3)
    return rh
  }
  const connect = (rh, ...ids) => {
    for (const id of ids) rh.getPort(id).connectedTo.push({ instrumentId: 'other', portId: 'x' })
  }

  it('A+P → left-wire，r_eff = 3', () => {
    const rh = make()
    connect(rh, 'left', 'wiper')
    const conn = rh.getEffectiveConnection()
    expect(conn.mode).toBe('left-wire')
    expect(conn.r_eff).toBeCloseTo(3, 10)
    expect(conn.warning).toBeNull()
  })

  it('B+P → right-wire，r_eff = 7', () => {
    const rh = make()
    connect(rh, 'right', 'wiper')
    const conn = rh.getEffectiveConnection()
    expect(conn.mode).toBe('right-wire')
    expect(conn.r_eff).toBeCloseTo(7, 10)
    expect(conn.warning).toBeNull()
  })

  it('A+B → full-wire，r_eff = 10 且有中文提示', () => {
    const rh = make()
    connect(rh, 'left', 'right')
    const conn = rh.getEffectiveConnection()
    expect(conn.mode).toBe('full-wire')
    expect(conn.r_eff).toBeCloseTo(R_TOTAL, 10)
    expect(typeof conn.warning).toBe('string')
    expect(conn.warning.length).toBeGreaterThan(0)
  })

  it('tl+tr → short，r_eff = 0 且有中文提示', () => {
    const rh = make()
    connect(rh, 'tl', 'tr')
    const conn = rh.getEffectiveConnection()
    expect(conn.mode).toBe('short')
    expect(conn.r_eff).toBe(0)
    expect(typeof conn.warning).toBe('string')
  })

  it('单柱/悬空 → open', () => {
    const rh = make()
    connect(rh, 'left')
    expect(rh.getEffectiveConnection().mode).toBe('open')
    const rh2 = make()
    expect(rh2.getEffectiveConnection().mode).toBe('open')
  })
})
