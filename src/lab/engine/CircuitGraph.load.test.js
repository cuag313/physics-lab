/**
 * CircuitGraph.validate() 负载校验（2026-10 新增，独立文件承载新行为）
 *
 * 背景：原 validate() 强制要求至少一个灯泡（"缺少灯泡"），挡住「纯电阻验证 I=U/R」
 * 这一标准实验电路。改为「灯泡 | 电阻 | 滑动变阻器」任一存在即视为有负载。
 * 按项目规则：新行为用新测试文件承载，不往 CircuitGraph.test.js 里堆。
 */
import { describe, it, expect } from 'vitest'
import { CircuitGraph } from './CircuitGraph.js'

describe('validate() 负载校验', () => {
  it('纯电阻电路（无灯泡）：应验证通过', () => {
    const g = new CircuitGraph()
    const bat = g.addComponent('battery', 0, 0, { voltage: 6 })
    const res = g.addComponent('resistor', 0, 0, { resistance: 10 })
    g.addWire({ componentId: bat.id, portIndex: 1 }, { componentId: res.id, portIndex: 1 })
    g.addWire({ componentId: res.id, portIndex: 0 }, { componentId: bat.id, portIndex: 0 })
    const v = g.validate()
    expect(v.ok, v.reason).toBe(true)
  })

  it('滑动变阻器作负载：应验证通过', () => {
    const g = new CircuitGraph()
    const bat = g.addComponent('battery', 0, 0, { voltage: 6 })
    const rheo = g.addComponent('rheostat', 0, 0, { resistance: 10 })
    g.addWire({ componentId: bat.id, portIndex: 1 }, { componentId: rheo.id, portIndex: 1 })
    g.addWire({ componentId: rheo.id, portIndex: 0 }, { componentId: bat.id, portIndex: 0 })
    const v = g.validate()
    expect(v.ok, v.reason).toBe(true)
  })

  it('只有电源+电表（无负载）：应报「缺少负载」', () => {
    const g = new CircuitGraph()
    const bat = g.addComponent('battery', 0, 0, { voltage: 6 })
    const am = g.addComponent('ammeter', 0, 0, {})
    g.addWire({ componentId: bat.id, portIndex: 1 }, { componentId: am.id, portIndex: 1 })
    g.addWire({ componentId: am.id, portIndex: 0 }, { componentId: bat.id, portIndex: 0 })
    const v = g.validate()
    expect(v.ok).toBe(false)
    expect(v.reason).toContain('缺少负载')
  })

  it('灯泡负载仍然通过（回归保护）', () => {
    const g = new CircuitGraph()
    const bat = g.addComponent('battery', 0, 0, { voltage: 6 })
    const bulb = g.addComponent('bulb', 0, 0, { resistance: 15 })
    g.addWire({ componentId: bat.id, portIndex: 1 }, { componentId: bulb.id, portIndex: 1 })
    g.addWire({ componentId: bulb.id, portIndex: 0 }, { componentId: bat.id, portIndex: 0 })
    const v = g.validate()
    expect(v.ok, v.reason).toBe(true)
  })
})
