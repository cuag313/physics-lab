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
      'fuse', 'testPencil', 'electroscope', 'resBox', 'multimeter', 'relay', 'mains', 'energyMeter',
      'jouleTube', 'accumulator', 'jouleSet', 'washer', 'kettle']) {
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

describe('电池端电压（内阻分压）', () => {
  it('带载时 U端 = E − I·r', () => {
    const out = loop(
      [{ id: 1, type: 'battery' }, { id: 2, type: 'resistor5' }],
      [{ id: 1, a: '1:p', b: '2:a' }, { id: 2, a: '2:b', b: '1:n' }])
    const I = 3 / (CFG.VS.r + 5)
    expect(near(out[1]._I, I, 1e-6)).toBe(true)
    expect(near(out[1]._V, 3 - I * CFG.VS.r, 1e-6)).toBe(true)
    expect(near(out[1]._Ir, I * CFG.VS.r, 1e-6)).toBe(true)
    expect(out[1]._emf).toBe(3)
  })
  it('短路时端电压塌到 0，电动势全部降在内阻上', () => {
    const out = loop([{ id: 1, type: 'battery' }], [{ id: 1, a: '1:p', b: '1:n' }])
    expect(near(out[1]._I, 3 / CFG.VS.r, 1e-3)).toBe(true) // 30A
    expect(out[1]._V).toBeLessThan(0.01)
    expect(near(out[1]._Ir, 3, 1e-3)).toBe(true)
  })
  it('蓄电池按 12V 电动势求解，电池组按 3V', () => {
    const outAcc = loop(
      [{ id: 1, type: 'accumulator' }, { id: 2, type: 'resistor5' }],
      [{ id: 1, a: '1:p', b: '2:a' }, { id: 2, a: '2:b', b: '1:n' }])
    const Ia = CFG.ACC_V / (CFG.VS.r + 5)
    expect(near(outAcc[1]._emf, CFG.ACC_V, 1e-6)).toBe(true)
    expect(near(outAcc[2]._I, Ia, 1e-6)).toBe(true)

    const outBat = loop(
      [{ id: 1, type: 'battery' }, { id: 2, type: 'resistor5' }],
      [{ id: 1, a: '1:p', b: '2:a' }, { id: 2, a: '2:b', b: '1:n' }])
    expect(near(outBat[1]._emf, CFG.VS.V, 1e-6)).toBe(true)
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

describe('伏安法测电阻的系统误差（内接 / 外接）', () => {
  // 共同部分：battery → 电流表（两柱表，红柱 pos）→ R → battery
  const base = [
    { id: 1, a: '1:p', b: '3:neg' },
    { id: 2, a: '3:pos', b: '2:a' },
    { id: 3, a: '2:b', b: '1:n' },
  ]
  const comps = [
    { id: 1, type: 'battery' },
    { id: 2, type: 'resistor5' },
    { id: 3, type: 'ammeter' },
    { id: 4, type: 'voltmeter' },
  ]

  it('内接：电压表跨在 R + 电流表 上，R测 = R + R_A，偏大', () => {
    const out = loop(comps, [
      ...base,
      { id: 4, a: '4:full', b: '3:neg' }, // 跨到电流表靠电源那一端
      { id: 5, a: '4:neg', b: '2:b' },
    ])
    const va = out._va.find((x) => x.id === 2)
    expect(va.mode).toBe('internal')
    expect(near(va.measured, 5 + CFG.AMM_R, 1e-3)).toBe(true)
    expect(va.errorPct).toBeGreaterThan(0)
  })

  it('外接：电压表只并在 R 上，R测 = R∥R_V，偏小但可忽略', () => {
    const out = loop(comps, [
      ...base,
      { id: 4, a: '4:full', b: '2:a' }, // 直接并到 R 两端
      { id: 5, a: '4:neg', b: '2:b' },
    ])
    const va = out._va.find((x) => x.id === 2)
    expect(va.mode).toBe('external')
    expect(va.measured).toBeLessThan(5)
    expect(5 - va.measured).toBeLessThan(1e-3)
    expect(va.errorPct).toBeLessThan(0)
  })

  it('电路里没有定值电阻时不产生测量记录（不乱报）', () => {
    const out = loop(
      [{ id: 1, type: 'battery' }, { id: 3, type: 'ammeter' }, { id: 4, type: 'voltmeter' }],
      [
        { id: 1, a: '1:p', b: '3:neg' },
        { id: 2, a: '3:pos', b: '1:n' },
        { id: 3, a: '4:full', b: '1:p' },
        { id: 4, a: '4:neg', b: '1:n' },
      ])
    expect(out._va).toBeUndefined()
  })
})

describe('焦耳定律 U 形管', () => {
  it('两支管串联：电流相同，发热功率之比 = R2 : R1', () => {
    const out = loop(
      [{ id: 1, type: 'battery' }, { id: 2, type: 'jouleTube' }],
      [{ id: 1, a: '1:p', b: '2:a' }, { id: 2, a: '2:b', b: '1:n' }])
    const I = 3 / (CFG.JOULE_R1 + CFG.JOULE_R2 + CFG.VS.r)
    expect(near(out[2]._I, I, 1e-6)).toBe(true)
    expect(near(out[2]._P1, I * I * CFG.JOULE_R1, 1e-9)).toBe(true)
    expect(near(out[2]._P2, I * I * CFG.JOULE_R2, 1e-9)).toBe(true)
    // R2 = 4Ω 是 R1 = 2Ω 的两倍 → 同一时刻右侧液柱上升也是左侧的两倍
    expect(near(out[2]._P2 / out[2]._P1, 2, 1e-9)).toBe(true)
  })

  it('断电后 _I 归零，热量不再增加（液柱靠场景积分保持，不回落）', () => {
    const out = loop(
      [{ id: 1, type: 'battery' }, { id: 2, type: 'switch', closed: false }, { id: 3, type: 'jouleTube' }],
      [
        { id: 1, a: '1:p', b: '2:a' },
        { id: 2, a: '2:b', b: '3:a' },
        { id: 3, a: '3:b', b: '1:n' },
      ])
    expect(Math.abs(out[3]._I)).toBeLessThan(1e-6)
    expect(out[3]._P1).toBeCloseTo(0, 12)
  })
})

describe('单相电能表', () => {
  it('1↔3 是电流线圈：串进回路后干路电流按线圈电阻算', () => {
    const out = loop(
      [{ id: 1, type: 'mains' }, { id: 2, type: 'energyMeter' }, { id: 3, type: 'resistor15' }],
      [
        { id: 1, a: '1:l', b: '2:i1' },   // 相线进 1
        { id: 2, a: '2:o1', b: '3:a' },   // 3 出线 → 负载
        { id: 3, a: '3:b', b: '2:i2' },   // 负载回零线进 2
        { id: 4, a: '2:o2', b: '1:n' },   // 4 出线回电源零线
      ])
    // 回路总电阻 = 线圈 0.02 + 零线段 0.001 + 负载 15 + 电源内阻 0.1
    expect(near(out[2]._I, 220 / 15.121, 1e-2)).toBe(true)
    expect(near(out[3]._I, 220 / 15.121, 1e-2)).toBe(true)
  })

  it('只接 1、2 两根进线（3、4 悬空）时电流线圈开路，不计量', () => {
    const out = loop(
      [{ id: 1, type: 'battery' }, { id: 2, type: 'energyMeter' }],
      [{ id: 1, a: '1:p', b: '2:i1' }, { id: 2, a: '2:i2', b: '1:n' }])
    expect(out[2]._I).toBeLessThan(1e-6)
  })
})

describe('焦耳定律演示器（A 组 5Ω + B 组 10Ω，四柱可各自接线）', () => {
  it('两组串起来：电流相同，P_B = 2 P_A（Q ∝ R）', () => {
    const out = loop(
      [{ id: 1, type: 'battery' }, { id: 2, type: 'jouleSet' }],
      [
        { id: 1, a: '1:p', b: '2:a1' },
        { id: 2, a: '2:a2', b: '2:b1' },   // A 组的另一头接 B 组：两段串联
        { id: 3, a: '2:b2', b: '1:n' },
      ])
    const I = 3 / (CFG.JOULE_SET_A + CFG.JOULE_SET_B + CFG.VS.r)
    expect(near(out[2]._I_A, I, 1e-6)).toBe(true)
    expect(near(out[2]._I_B, I, 1e-6)).toBe(true)
    expect(near(out[2]._P_A, I * I * CFG.JOULE_SET_A, 1e-9)).toBe(true)
    expect(near(out[2]._P_B, I * I * CFG.JOULE_SET_B, 1e-9)).toBe(true)
    expect(near(out[2]._P_B / out[2]._P_A, 2, 1e-6)).toBe(true)
  })

  it('只接 A 组（B 组悬空）：A 组按 5Ω 通电，B 组电流为 0', () => {
    const out = loop(
      [{ id: 1, type: 'battery' }, { id: 2, type: 'jouleSet' }],
      [
        { id: 1, a: '1:p', b: '2:a1' },
        { id: 2, a: '2:a2', b: '1:n' },
      ])
    expect(near(out[2]._I_A, 3 / (CFG.JOULE_SET_A + CFG.VS.r), 1e-6)).toBe(true)
    expect(out[2]._I_B).toBeCloseTo(0, 12)
    expect(out[2]._P_B).toBeCloseTo(0, 12)
  })
})

describe('电磁铁（线圈 + 软铁芯）', () => {
  const em = (turns, core) => loop(
    [{ id: 1, type: 'battery' }, { id: 2, type: 'electromagnet', turns, core }],
    [{ id: 1, a: '1:p', b: '2:a' }, { id: 2, a: '2:b', b: '1:n' }])

  it('线圈电阻随匝数增加：R = 0.12Ω × 匝数', () => {
    for (const turns of [10, 20, 30]) {
      const out = em(turns, true)
      expect(out[2]._R).toBeCloseTo(CFG.EM_R_PER_TURN * turns, 9)
      expect(out[2]._I).toBeCloseTo(3 / (CFG.EM_R_PER_TURN * turns + CFG.VS.r), 9)
      expect(out[2]._turns).toBe(turns)
    }
  })

  it('同一电路下匝数越多磁性越强（滑变不动也能看出差别）', () => {
    // 串一个 10Ω 定值电阻代替滑变，限住电流，避免三档都吸满（封顶 4 针）
    const emR = (turns) => loop(
      [{ id: 1, type: 'battery' }, { id: 2, type: 'electromagnet', turns, core: true }, { id: 3, type: 'resistor10' }],
      [
        { id: 1, a: '1:p', b: '2:a' },
        { id: 2, a: '2:b', b: '3:a' },
        { id: 3, a: '3:b', b: '1:n' },
      ])
    const p10 = emR(10)[2]._pins
    const p20 = emR(20)[2]._pins
    const p30 = emR(30)[2]._pins
    expect(p20).toBeGreaterThan(p10)
    expect(p30).toBeGreaterThan(p20)
  })

  it('磁性 ∝ N·I，针数 = floor(N·I / 1.8)，最多 4 枚；抽出铁芯后只剩 1/4', () => {
    const withCore = em(20, true)
    const noCore = em(20, false)
    const s1 = withCore[2]._strength, s2 = noCore[2]._strength
    expect(s1).toBeCloseTo(20 * withCore[2]._I, 9)
    expect(s2).toBeCloseTo(s1 * CFG.EM_CORE_MU, 9)   // 同一电流，磁性只剩 1/4
    expect(withCore[2]._pins).toBe(Math.min(CFG.EM_PIN_MAX, Math.floor(s1 / CFG.EM_PIN_K)))
    expect(noCore[2]._pins).toBe(Math.min(CFG.EM_PIN_MAX, Math.floor(s2 / CFG.EM_PIN_K)))
    expect(withCore[2]._pins).toBeGreaterThan(noCore[2]._pins)
  })

  it('断开开关：磁性、针数都归零', () => {
    const out = loop(
      [{ id: 1, type: 'battery' }, { id: 2, type: 'electromagnet', turns: 20, core: true }],
      [
        { id: 1, a: '1:p', b: '2:a' },
        { id: 2, a: '2:b', b: '1:n' },
      ])
    // 用开关串进去，确认断路时没有磁性
    const open = loop(
      [{ id: 1, type: 'battery' }, { id: 2, type: 'switch', closed: false }, { id: 3, type: 'electromagnet', turns: 20 }],
      [
        { id: 1, a: '1:p', b: '2:a' },
        { id: 2, a: '2:b', b: '3:a' },
        { id: 3, a: '3:b', b: '1:n' },
      ])
    expect(open[3]._strength).toBeCloseTo(0, 9)
    expect(open[3]._pins).toBe(0)
    expect(out[2]._pins).toBeGreaterThan(0)
  })
})

describe('滑动变阻器「一上一下」接法', () => {
  // 滑变内部被拆成 R1(bl→杆) / R2(杆→br) 两个电阻，逐段往 out._I 写回；
  // 取较大值：滑块停在左端时 R2 段电流≈0，直接覆盖会把"线圈在通电"抹成 0，
  // 场景里通电线圈的浅黄着色（dyn.live）就会整段消失。
  it('f=0.15 接 bl+tr：_I 是左段真实电流，不是右段那 0', () => {
    const R1 = 0.15 * CFG.RHEO_MAX
    const I = 3 / (R1 + CFG.BULB_R + CFG.VS.r)
    const out = loop(
      [{ id: 1, type: 'battery' }, { id: 2, type: 'rheostat', f: 0.15 }, { id: 3, type: 'bulb' }],
      [
        { id: 1, a: '1:p', b: '2:bl' },
        { id: 2, a: '2:tr', b: '3:b' },
        { id: 3, a: '3:a', b: '1:n' },
      ])
    expect(out[2]._I).toBeGreaterThan(1e-3)
    expect(near(out[2]._I, I, 1e-6)).toBe(true)
  })

  it('断开开关后 _I 归零（浅黄着色随之消失）', () => {
    const out = loop(
      [{ id: 1, type: 'battery' }, { id: 2, type: 'switch', closed: false }, { id: 3, type: 'rheostat', f: 0.15 }],
      [
        { id: 1, a: '1:p', b: '2:a' },
        { id: 2, a: '2:b', b: '3:bl' },
        { id: 3, a: '3:tr', b: '1:n' },
      ])
    expect(Math.abs(out[3]._I)).toBeLessThan(1e-6)
  })
})

describe('奥斯特实验板（通电直导线）', () => {
  it('TERM_IDS 注册 a/b 两柱', () => {
    expect(TERM_IDS.ostersBoard).toEqual(['a', 'b'])
  })

  it('串 10Ω 限流：I = 3/(0.02+10+0.1)，_I 取绝对值、_sign=+1', () => {
    const out = loop(
      [{ id: 1, type: 'battery' }, { id: 2, type: 'ostersBoard' }, { id: 3, type: 'resistor10' }],
      [
        { id: 1, a: '1:p', b: '2:a' },
        { id: 2, a: '2:b', b: '3:a' },
        { id: 3, a: '3:b', b: '1:n' },
      ])
    const I = 3 / (CFG.OSTER_WIRE_R + 10 + CFG.VS.r)
    expect(out[2]._I).toBeCloseTo(I, 9)
    expect(out[2]._bmag).toBeCloseTo(I, 9)
    expect(out[2]._sign).toBe(1)
    expect(out[2]._R).toBeCloseTo(CFG.OSTER_WIRE_R, 9)
  })

  it('电池反接：电流大小不变、_sign 变 −1（磁针反向偏转的依据）', () => {
    const wires = (rev) => [
      { id: 1, a: rev ? '1:n' : '1:p', b: '2:a' },
      { id: 2, a: '2:b', b: '3:a' },
      { id: 3, a: '3:b', b: rev ? '1:p' : '1:n' },
    ]
    const fwd = loop([{ id: 1, type: 'battery' }, { id: 2, type: 'ostersBoard' }, { id: 3, type: 'resistor10' }], wires(false))
    const rev = loop([{ id: 1, type: 'battery' }, { id: 2, type: 'ostersBoard' }, { id: 3, type: 'resistor10' }], wires(true))
    expect(rev[2]._I).toBeCloseTo(fwd[2]._I, 9)
    expect(fwd[2]._sign * rev[2]._sign).toBe(-1)
  })

  it('断开开关：_I = 0、_sign = 0（磁感线消失）', () => {
    const out = loop(
      [{ id: 1, type: 'battery' }, { id: 2, type: 'switch', closed: false }, { id: 3, type: 'ostersBoard' }],
      [
        { id: 1, a: '1:p', b: '2:a' },
        { id: 2, a: '2:b', b: '3:a' },
        { id: 3, a: '3:b', b: '1:n' },
      ])
    expect(Math.abs(out[3]._I)).toBeLessThan(1e-6)
    expect(out[3]._sign).toBe(0)
  })

  it('不串限流电阻就是短路：I≈3/(0.02+0.1)=25A，detectMisuse 会报', () => {
    const out = loop(
      [{ id: 1, type: 'battery' }, { id: 2, type: 'ostersBoard' }],
      [
        { id: 1, a: '1:p', b: '2:a' },
        { id: 2, a: '2:b', b: '1:n' },
      ])
    expect(out[2]._I).toBeCloseTo(3 / (CFG.OSTER_WIRE_R + CFG.VS.r), 6)
    expect(out[2]._I).toBeGreaterThan(2.5)
  })
})

describe('家用电器（洗衣机 500 W / 电热水壶 1500 W，R = U²/P）', () => {
  it('TERM_IDS 注册 a/b 两柱', () => {
    expect(TERM_IDS.washer).toEqual(['a', 'b'])
    expect(TERM_IDS.kettle).toEqual(['a', 'b'])
  })

  /* 家庭电路：家用交流电 l(火)→电器 a，电器 b→n(零)。engine 里插座内阻 0.1 Ω 串在回路中。 */
  const mainsLoop = (type) => loop(
    [{ id: 1, type: 'mains' }, { id: 2, type }],
    [
      { id: 1, a: '1:l', b: '2:a' },
      { id: 2, a: '2:b', b: '1:n' },
    ])

  it('两台电器按 220²/P 定阻：洗衣机 500 W→96.8 Ω、电热水壶 1500 W→32.27 Ω', () => {
    expect(mainsLoop('washer')[2]._R).toBeCloseTo(48400 / 500, 6)
    expect(mainsLoop('kettle')[2]._R).toBeCloseTo(48400 / 1500, 6)
  })

  it('接 220 V：I = 220/(R+0.1)，实际功率回到额定值（内阻偏差 ≤ 5%）', () => {
    for (const [type, p] of [['washer', 500], ['kettle', 1500]]) {
      const o = mainsLoop(type)[2]
      expect(o._I).toBeCloseTo(220 / (48400 / p + CFG.MAINS_R), 6)
      expect(o._P / p).toBeCloseTo(1, 1)
    }
  })

  it('只接 3 V 电池组时电流与功率都极小（这正是「表不走字」的根因）', () => {
    const out = loop(
      [{ id: 1, type: 'battery' }, { id: 2, type: 'washer' }],
      [
        { id: 1, a: '1:p', b: '2:a' },
        { id: 2, a: '2:b', b: '1:n' },
      ])
    expect(out[2]._I).toBeLessThan(0.06)
    expect(out[2]._P).toBeLessThan(2)   // 96.8 Ω 上 3 V 只有 0.09 W
  })

  it('两台并联在 220 V 两端：各自端电压 ≈ 220 V，干路电流 = 两支路之和', () => {
    // 插座 L → 表 1 → 表 3 → 开关 → 分成两支：洗衣机 / 电热水壶，各自另一端都回表的 4（零线）
    const out = loop(
      [{ id: 1, type: 'mains' }, { id: 2, type: 'energyMeter' }, { id: 3, type: 'switch', closed: true },
        { id: 4, type: 'washer' }, { id: 5, type: 'kettle' }],
      [
        { id: 1, a: '1:l', b: '2:i1' },
        { id: 2, a: '2:o1', b: '3:a' },
        { id: 3, a: '3:b', b: '4:a' },      // 支路 1：洗衣机
        { id: 4, a: '4:b', b: '2:o2' },     //   → 回表的 4 号柱（零线）
        { id: 5, a: '3:b', b: '5:a' },      // 支路 2：电热水壶
        { id: 6, a: '5:b', b: '2:o2' },
        { id: 7, a: '2:i2', b: '1:n' },
      ])
    const w = out[4], k = out[5]
    // 并联 → 两台端电压相同，且都接近 220 V（只被表内线圈/零线段与电源内阻吃掉一点）
    expect(near(w._I * w._R, 220, 1.5)).toBe(true)
    expect(near(k._I * k._R, 220, 1.5)).toBe(true)
    // 干路电流（表的电流线圈）= 两支路之和
    expect(near(out[2]._I, w._I + k._I, 1e-6)).toBe(true)
    // 功率叠加：合计 ≈ 2000 W（洗衣机 500 + 壶 1500）
    expect(w._P + k._P).toBeGreaterThan(1950)
    expect(w._P + k._P).toBeLessThan(2005)
  })

  it('两台串在同一条支路上（错接）：各自只分到 110 V 左右，总功率远小于 2000 W', () => {
    const out = loop(
      [{ id: 1, type: 'mains' }, { id: 2, type: 'washer' }, { id: 3, type: 'kettle' }],
      [
        { id: 1, a: '1:l', b: '2:a' },
        { id: 2, a: '2:b', b: '3:a' },
        { id: 3, a: '3:b', b: '1:n' },
      ])
    const w = out[2], k = out[3]
    expect(near(w._I * w._R, 164.9, 1)).toBe(true)   // 串联分压：96.8 : 32.3 ≈ 165 V : 55 V
    expect(w._I).toBeCloseTo(k._I, 6)
    expect(w._P + k._P).toBeLessThan(900)
  })
})

/* 2026-11-17：家庭电路「真器材」—— 交流电源符号 / 空气开关 / 面板开关 / 两孔·三孔插座 / 插脚吸附 */
describe('家庭电路真器材（交流电源 · 空气开关 · 面板开关 · 插座插脚）', () => {
  it('TERM_IDS 注册', () => {
    expect(TERM_IDS.acSource).toEqual(['l', 'n', 'e'])
    expect(TERM_IDS.breaker).toEqual(['li', 'ni', 'lo', 'no'])
    expect(TERM_IDS.wallSwitch).toEqual(['a', 'b'])
    expect(TERM_IDS.socket2).toEqual(['l', 'n'])
    expect(TERM_IDS.socket3).toEqual(['l', 'e', 'n'])
  })

  it('交流电源 = 220 V（与 mains 同一口径），接电器时 I = 220/(R+r)', () => {
    const out = loop(
      [{ id: 1, type: 'acSource' }, { id: 2, type: 'washer' }],
      [{ id: 1, a: '1:l', b: '2:a' }, { id: 2, a: '2:b', b: '1:n' }])
    expect(out[1]._emf).toBe(CFG.MAINS_V)
    expect(out[2]._I).toBeCloseTo(220 / (48400 / 500 + CFG.MAINS_R), 6)
  })

  it('电器插在两孔插座上（plug）：不用拉线，插脚 a/b 直接并到插座 L/N', () => {
    const out = loop(
      [{ id: 1, type: 'acSource' }, { id: 2, type: 'socket2' }, { id: 3, type: 'washer', plug: 2 }],
      [{ id: 1, a: '1:l', b: '2:l' }, { id: 2, a: '2:n', b: '1:n' }])
    expect(out[3]._I).toBeCloseTo(220 / (48400 / 500 + CFG.MAINS_R), 6)
    expect(out[3]._P / 500).toBeCloseTo(1, 1)
  })

  it('三孔插座插上电热水壶同样通电（E 柱不参与回路）', () => {
    const out = loop(
      [{ id: 1, type: 'acSource' }, { id: 2, type: 'socket3' }, { id: 3, type: 'kettle', plug: 2 }],
      [{ id: 1, a: '1:l', b: '2:l' }, { id: 2, a: '2:n', b: '1:n' }])
    expect(out[3]._I).toBeCloseTo(220 / (48400 / 1500 + CFG.MAINS_R), 6)
  })

  it('两台电器各插一只插座：并联，干路电流 = 两台之和', () => {
    const out = loop(
      [{ id: 1, type: 'acSource' }, { id: 2, type: 'socket2' }, { id: 3, type: 'socket3' },
        { id: 4, type: 'washer', plug: 2 }, { id: 5, type: 'kettle', plug: 3 }],
      [{ id: 1, a: '1:l', b: '2:l' }, { id: 2, a: '2:l', b: '3:l' }, { id: 2, a: '2:n', b: '3:n' },
        { id: 3, a: '3:n', b: '1:n' }])
    expect(near(out[1]._I, out[4]._I + out[5]._I, 1e-6)).toBe(true)
    expect(out[4]._I).toBeGreaterThan(2)
    expect(out[5]._I).toBeGreaterThan(6)
  })

  it('空气开关合闸通、分闸断（双极各自一条支路）', () => {
    for (const closed of [true, false]) {
      const out = loop(
        [{ id: 1, type: 'acSource' }, { id: 2, type: 'breaker', closed }, { id: 3, type: 'kettle' }],
        [
          { id: 1, a: '1:l', b: '2:li' }, { id: 2, a: '2:lo', b: '3:a' },
          { id: 3, a: '3:b', b: '2:ni' }, { id: 4, a: '2:no', b: '1:n' },
        ])
      if (closed) expect(out[3]._I).toBeGreaterThan(6)
      else expect(Math.abs(out[3]._I)).toBeLessThan(1e-5)
    }
  })

  it('面板开关与普通开关同口径', () => {
    const out = loop(
      [{ id: 1, type: 'acSource' }, { id: 2, type: 'wallSwitch', closed: true }, { id: 3, type: 'bulb' }],
      [
        { id: 1, a: '1:l', b: '2:a' }, { id: 2, a: '2:b', b: '3:a' },
        { id: 3, a: '3:b', b: '1:n' },
      ])
    // 面板开关合闸 0.001 Ω，再加上导线电阻 → 比理想值略小
    expect(near(out[3]._I, 220 / (CFG.BULB_R + CFG.MAINS_R), 0.02)).toBe(true)
  })
})
