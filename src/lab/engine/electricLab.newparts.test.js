/**
 * electricLab.newparts.test.js — 新增器材（初中必做 / 家庭电路 / 高中拓展）MNA 回归
 *
 * 覆盖：定值电阻 · 单刀双掷 · 电动机 · 二极管（分段线性）
 *      · 保险丝（过流熔断）· 测电笔 · 验电器 · 电阻箱 · 多用电表三档 · 电磁继电器 · 市电
 */
import { describe, expect, it } from 'vitest'
import { solveCircuit, CFG, resBoxOhms, TERM_IDS } from './electricLab'

const loop = (comps, wires) => solveCircuit(comps, wires)
const near = (a, b, tol = 1e-3) => Math.abs(a - b) <= tol

describe('TERM_IDS 注册', () => {
  it('全部新类型都有接线柱定义', () => {
    for (const t of ['resistor5', 'resistor10', 'resistor15', 'switch2', 'motor', 'diode',
      'fuse', 'testPencil', 'electroscope', 'resBox', 'multimeter', 'relay', 'mains']) {
      expect(TERM_IDS[t], t).toBeTruthy()
      expect(TERM_IDS[t].length).toBeGreaterThan(1)
    }
  })
})

describe('定值电阻 5/10/15Ω', () => {
  for (const [type, R] of [['resistor5', 5], ['resistor10', 10], ['resistor15', 15]]) {
    it(`${type}：I = 3/(${R}+0.1)`, () => {
      const out = loop(
        [{ id: 1, type: 'battery' }, { id: 2, type }],
        [{ id: 1, a: '1:p', b: '2:a' }, { id: 2, a: '2:b', b: '1:n' }])
      expect(near(out[2]._I, 3 / (R + 0.1), 1e-6)).toBe(true)
      expect(out[2]._R).toBe(R)
    })
  }
})

describe('单刀双掷开关', () => {
  for (const pos of [0, 1]) {
    it(`pos=${pos} 时接通掷点 ${pos === 0 ? 'A' : 'B'}`, () => {
      const out = loop(
        [{ id: 1, type: 'battery' }, { id: 2, type: 'switch2', pos }, { id: 3, type: 'resistor5' }],
        [
          { id: 1, a: '1:p', b: '2:com' },
          { id: 2, a: `2:${pos === 0 ? 'a' : 'b'}`, b: '3:a' },
          { id: 3, a: '3:b', b: '1:n' },
        ])
      expect(near(out[2]._I, 3 / 5.101, 1e-4)).toBe(true)
      expect(out[2]._pos).toBe(pos)
    })
  }
})

describe('二极管（分段线性）', () => {
  const fwd = () => loop(
    [{ id: 1, type: 'battery' }, { id: 2, type: 'diode' }, { id: 3, type: 'resistor5' }],
    [
      { id: 1, a: '1:p', b: '2:a' },
      { id: 2, a: '2:k', b: '3:a' },
      { id: 3, a: '3:b', b: '1:n' },
    ])
  it('正向导通：I = (3 − VF)/(RF + 5 + 0.1)', () => {
    const out = fwd()
    expect(out[2]._on).toBe(true)
    expect(near(out[2]._I, (3 - CFG.DIODE_VF) / (CFG.DIODE_RF + 5.1), 1e-3)).toBe(true)
  })
  it('反向截止：不亮、电流≈0', () => {
    const out = loop(
      [{ id: 1, type: 'battery' }, { id: 2, type: 'diode' }, { id: 3, type: 'resistor5' }],
      [
        { id: 1, a: '1:p', b: '3:a' },
        { id: 2, a: '3:b', b: '2:k' },
        { id: 3, a: '2:a', b: '1:n' },
      ])
    expect(out[2]._on).toBe(false)
    expect(Math.abs(out[2]._I)).toBeLessThan(1e-6)
  })
})

describe('保险丝', () => {
  it('正常电流不熔断', () => {
    const out = loop(
      [{ id: 1, type: 'battery' }, { id: 2, type: 'fuse' }, { id: 3, type: 'resistor15' }],
      [
        { id: 1, a: '1:p', b: '2:a' },
        { id: 2, a: '2:b', b: '3:a' },
        { id: 3, a: '3:b', b: '1:n' },
      ])
    expect(out[2]._blown).toBe(false)
  })
  it('过流熔断且断开回路', () => {
    const out = loop(
      [{ id: 1, type: 'battery' }, { id: 2, type: 'fuse' }],
      [{ id: 1, a: '1:p', b: '2:a' }, { id: 2, a: '2:b', b: '1:n' }])
    expect(out[2]._blown).toBe(true)
    expect(Math.abs(out[1]._I)).toBeLessThan(1e-5)
  })
  it('blown 状态持久断开', () => {
    const out = loop(
      [{ id: 1, type: 'battery' }, { id: 2, type: 'fuse', blown: true }, { id: 3, type: 'resistor5' }],
      [
        { id: 1, a: '1:p', b: '2:a' },
        { id: 2, a: '2:b', b: '3:a' },
        { id: 3, a: '3:b', b: '1:n' },
      ])
    expect(out[2]._blown).toBe(true)
    expect(Math.abs(out[1]._I)).toBeLessThan(1e-5)
  })
})

describe('测电笔 / 验电器', () => {
  it('220V 火线氖管发光，3V 电池不发光', () => {
    const on = loop(
      [{ id: 1, type: 'mains' }, { id: 2, type: 'testPencil' }],
      [{ id: 1, a: '1:l', b: '2:tip' }, { id: 2, a: '2:tail', b: '1:n' }])
    expect(on[2]._glow).toBe(true)
    const off = loop(
      [{ id: 1, type: 'battery' }, { id: 2, type: 'testPencil' }],
      [{ id: 1, a: '1:p', b: '2:tip' }, { id: 2, a: '2:tail', b: '1:n' }])
    expect(off[2]._glow).toBe(false)
  })
  it('验电器两柱电位差驱动箔片', () => {
    const out = loop(
      [{ id: 1, type: 'battery' }, { id: 2, type: 'electroscope' }],
      [{ id: 1, a: '1:p', b: '2:cap' }, { id: 2, a: '2:gnd', b: '1:n' }])
    expect(near(out[2]._V, 3, 0.05)).toBe(true)
  })
})

describe('电阻箱', () => {
  it('拨盘读数 dials=[×1k,×100,×10,×1]', () => {
    expect(resBoxOhms([1, 2, 3, 4])).toBe(1234)
    expect(resBoxOhms([0, 0, 1, 0])).toBe(10)
    expect(resBoxOhms(undefined)).toBe(0)
  })
  it('参与 MNA 求解', () => {
    const out = loop(
      [{ id: 1, type: 'battery' }, { id: 2, type: 'resBox', dials: [0, 0, 1, 0] }],
      [{ id: 1, a: '1:p', b: '2:a' }, { id: 2, a: '2:b', b: '1:n' }])
    expect(out[2]._R).toBe(10)
    expect(near(out[2]._I, 3 / 10.1, 1e-4)).toBe(true)
  })
})

describe('多用电表三档', () => {
  it('电压档测端电压', () => {
    const out = loop(
      [{ id: 1, type: 'battery' }, { id: 2, type: 'multimeter', mode: 'V' }],
      [{ id: 1, a: '1:p', b: '2:in' }, { id: 2, a: '2:com', b: '1:n' }])
    expect(near(out[2]._V, 3, 0.01)).toBe(true)
  })
  it('电流档串入回路', () => {
    const out = loop(
      [{ id: 1, type: 'battery' }, { id: 2, type: 'multimeter', mode: 'A' }, { id: 3, type: 'resistor5' }],
      [
        { id: 1, a: '1:p', b: '2:in' },
        { id: 2, a: '2:com', b: '3:a' },
        { id: 3, a: '3:b', b: '1:n' },
      ])
    expect(near(out[2]._I, 3 / (5 + CFG.MM_A_R + 0.1), 1e-3)).toBe(true)
  })
  it('欧姆档测外接电阻', () => {
    const out = loop(
      [{ id: 1, type: 'multimeter', mode: 'Ω' }, { id: 2, type: 'resistor5' }],
      [{ id: 1, a: '1:in', b: '2:a' }, { id: 2, a: '2:b', b: '1:com' }])
    expect(near(out[2]._R, 5, 0.05)).toBe(true)
  })
})

describe('电磁继电器', () => {
  const coilLoop = (extraR) => {
    const comps = [
      { id: 1, type: 'battery' },
      { id: 2, type: 'relay' },
      ...extraR.map((r, i) => ({ id: 10 + i, type: `resistor${r}` })),
    ]
    const wires = [
      { id: 1, a: '1:p', b: '2:ck1' },
      { id: 2, a: '2:ck2', b: `10:a` },
    ]
    // 电阻串联到电源负极
    extraR.forEach((r, i) => {
      wires.push({ id: 100 + i, a: `${10 + i}:b`, b: i + 1 < extraR.length ? `${11 + i}:a` : '1:n' })
    })
    return loop(comps, wires)
  }
  it('线圈电流 ≥ 50mA → 吸合、触点闭合', () => {
    const out = coilLoop([15]) // 3/(30+15+0.1) ≈ 66mA
    expect(out[2]._pulled).toBe(true)
  })
  it('线圈电流 < 50mA → 释放、触点断开', () => {
    const out = coilLoop([15, 15, 15]) // 3/(30+45+0.1) ≈ 40mA
    expect(out[2]._pulled).toBe(false)
  })
  it('吸合后工作回路导通', () => {
    const out = loop(
      [
        { id: 1, type: 'battery' }, { id: 2, type: 'relay' },
        { id: 3, type: 'resistor15' }, { id: 4, type: 'mains' }, { id: 5, type: 'resistor15' },
      ],
      [
        // 控制回路：battery → 线圈 → 15Ω → battery
        { id: 1, a: '1:p', b: '2:ck1' },
        { id: 2, a: '2:ck2', b: '3:a' },
        { id: 3, a: '3:b', b: '1:n' },
        // 工作回路：mains → 触点 → 15Ω → mains
        { id: 4, a: '4:l', b: '2:ct1' },
        { id: 5, a: '2:ct2', b: '5:a' },
        { id: 6, a: '5:b', b: '4:n' },
      ])
    expect(out[2]._pulled).toBe(true)
    expect(near(out[5]._I, 220 / 15.1, 1e-2)).toBe(true)
  })
})

describe('小电动机 / 家庭电源', () => {
  it('电动机线圈电阻参与求解', () => {
    const out = loop(
      [{ id: 1, type: 'battery' }, { id: 2, type: 'motor' }],
      [{ id: 1, a: '1:p', b: '2:a' }, { id: 2, a: '2:b', b: '1:n' }])
    expect(near(out[2]._I, 3 / (CFG.MOTOR_R + 0.1), 1e-4)).toBe(true)
  })
  it('家庭电源 220V（有效值）', () => {
    const out = loop(
      [{ id: 1, type: 'mains' }, { id: 2, type: 'resistor15' }],
      [{ id: 1, a: '1:l', b: '2:a' }, { id: 2, a: '2:b', b: '1:n' }])
    expect(near(out[2]._I, 220 / 15.1, 1e-2)).toBe(true)
  })
})
