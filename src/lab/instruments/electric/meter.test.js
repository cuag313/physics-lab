import { describe, expect, it } from 'vitest'
import { Ammeter } from './Ammeter'
import { Voltmeter } from './Voltmeter'

/** 手动“接线”：往端口 connectedTo 里塞一条即可 */
function connect(inst, ...ids) {
  for (const id of ids) inst.getPort(id).connectedTo.push({ instrumentId: 'other', portId: 'x' })
}

describe('电流表：接线柱定量程 + 带符号指针', () => {
  it('导线接 mid→0.6A，接 full→3A（full 优先）', () => {
    const a1 = new Ammeter()
    connect(a1, 'neg', 'mid')
    a1.syncRangeFromPorts()
    expect(a1.params.selectedRange.value).toBe('0.6')
    expect(a1.range).toBeCloseTo(0.6)

    const a2 = new Ammeter()
    connect(a2, 'neg', 'full')
    a2.syncRangeFromPorts()
    expect(a2.params.selectedRange.value).toBe('3')

    const a3 = new Ammeter()
    connect(a3, 'neg', 'mid', 'full')
    a3.syncRangeFromPorts()
    expect(a3.params.selectedRange.value).toBe('3')
  })

  it('正电流：指针带阻尼趋向 (I/量程)*满偏角，读数带符号', () => {
    const a = new Ammeter()
    connect(a, 'neg', 'mid') // 量程 0.6A
    a.current = 0.3
    for (let i = 0; i < 60; i++) a.update(1 / 60)
    expect(a.state.reverse).toBe(false)
    expect(a.state.angle).toBeCloseTo(Math.PI * 0.75, 2) // 0.3/0.6 = 半偏
    expect(a.state.reading).toBeCloseTo(0.3)
  })

  it('负电流：反偏直接撞 -5° 限位（不平滑），读数带负号', () => {
    const a = new Ammeter()
    connect(a, 'neg', 'mid')
    a.current = 0.3
    a.update(1 / 60)
    a.current = -0.2
    a.update(1 / 60) // 一帧即到限位
    expect(a.state.reverse).toBe(true)
    expect(a.state.angle).toBeCloseTo(-5 * Math.PI / 180, 6)
    expect(a.state.reading).toBeCloseTo(-0.2)
  })

  it('零电流：指针回零', () => {
    const a = new Ammeter()
    connect(a, 'neg', 'full')
    a.current = 1.5
    for (let i = 0; i < 60; i++) a.update(1 / 60)
    expect(a.state.angle).toBeGreaterThan(0.1)
    a.current = 0
    for (let i = 0; i < 120; i++) a.update(1 / 60)
    expect(Math.abs(a.state.angle)).toBeLessThan(0.01)
    expect(a.state.reverse).toBe(false)
  })
})

describe('电压表：接线柱定量程 + 带符号指针', () => {
  it('mid→3V，full→15V；反偏撞限位', () => {
    const v = new Voltmeter()
    connect(v, 'neg', 'full')
    v.syncRangeFromPorts()
    expect(v.params.selectedRange.value).toBe('15')
    expect(v.range).toBeCloseTo(15)

    v.voltage = -3
    v.update(1 / 60)
    expect(v.state.reverse).toBe(true)
    expect(v.state.angle).toBeCloseTo(-5 * Math.PI / 180, 6)

    const v2 = new Voltmeter()
    connect(v2, 'neg', 'mid')
    v2.syncRangeFromPorts()
    expect(v2.range).toBeCloseTo(3)
    v2.voltage = 1.5
    for (let i = 0; i < 60; i++) v2.update(1 / 60)
    expect(v2.state.angle).toBeCloseTo(Math.PI * 0.75, 2) // 1.5/3 = 半偏
  })
})
