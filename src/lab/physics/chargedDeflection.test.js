import { describe, it, expect } from 'vitest'
import { deflectionSolve, selectorPath, speedFromAccel, accelSolve } from './chargedDeflection'

describe('chargedDeflection：平行板偏转', () => {
  const base = { Ua: 4000, U: 240, L: 0.06, d: 0.014, D: 0.06 }

  it('v₀ = √(2eUa/m)，4 kV 约 3.75×10⁷ m/s', () => {
    expect(speedFromAccel(4000)).toBeCloseTo(3.7507e7, -5)
    expect(speedFromAccel(0)).toBe(0)
  })

  it('板内 y₁ = ½at²，出板后按出射方向直线延伸到屏', () => {
    const s = deflectionSolve(base)
    expect(s.t1).toBeCloseTo(0.06 / s.v0, 12)
    expect(s.y1).toBeCloseTo(0.5 * s.a * s.t1 * s.t1, 15)
    // 屏上位移 = 出板位移 + 出板竖速 × 漂移时间（这才是物理上正确的「不续抛物线」）
    expect(s.y2).toBeCloseTo(s.y1 + s.vy * (base.D / s.v0), 15)
    expect(s.y1mm).toBeGreaterThan(2)
    expect(s.y1mm).toBeLessThan(5)
    expect(s.y2mm).toBeGreaterThan(10)
    expect(s.hit).toBe('none')
  })

  it('U=0 时走直线；U 反号时上下翻转', () => {
    const zero = deflectionSolve({ ...base, U: 0 })
    expect(zero.y1).toBe(0)
    expect(zero.y2).toBe(0)
    const neg = deflectionSolve({ ...base, U: -240 })
    expect(neg.y1).toBeCloseTo(-deflectionSolve(base).y1, 15)
  })

  it('偏转量 ∝ U，与 v₀² 成反比', () => {
    const a = deflectionSolve({ ...base, U: 120 })
    const b = deflectionSolve({ ...base, U: 240 })
    expect(b.y1).toBeCloseTo(2 * a.y1, 15)
    const fast = deflectionSolve({ ...base, Ua: 8000 })
    const slow = deflectionSolve({ ...base, Ua: 2000 })
    // y₁ ∝ Ua⁻¹（板内时间 ∝ 1/v₀，a 不变）
    expect(fast.y1 * 4).toBeCloseTo(slow.y1, 12)
  })

  it('偏转超过板距一半判撞板，不再算屏上落点', () => {
    const s = deflectionSolve({ Ua: 1000, U: 300, L: 0.07, d: 0.006, D: 0.06 })
    expect(s.hit).not.toBe('none')
    expect(s.t2).toBe(0)
    expect(s.y2).toBe(s.y1)
  })
})

describe('chargedDeflection：沿场方向直线加速 / 减速', () => {
  it('加速：a=eE/m，末速度满足动能定理 v₁²=v₀²+2aL', () => {
    const v0 = 3.7507e7
    const s = accelSolve({ v0, E: 1.714e4, L: 0.06 })
    expect(s.a).toBeGreaterThan(0)
    expect(s.decel).toBe(false)
    // 末速度由动能定理 v₁² = v₀² + 2aL 给出，与 v1Kin 同源
    expect(s.v1).toBeCloseTo(s.v1Kin, 8)
    expect(s.v1).toBeGreaterThan(v0)
  })

  it('减速：电子受力与速度反向，板内减到 0 记停在转向点', () => {
    const v0 = 3.7507e7
    // 取足够大的反向场，使板内速度先减到 0
    const s = accelSolve({ v0, E: -1.714e6, L: 0.06 })
    expect(s.a).toBeLessThan(0)
    expect(s.decel).toBe(true)
    expect(s.stop).toBe(true)
    expect(s.v1).toBe(0)
    expect(s.x).toBeLessThan(0.06)
    expect(s.v1Kin).toBeCloseTo(0, 8)
  })

  it('U=0 时加速度为 0，匀速直线', () => {
    const v0 = 3.7507e7
    const s = accelSolve({ v0, E: 0, L: 0.06 })
    expect(s.a).toBe(0)
    expect(s.v1).toBeCloseTo(v0, 12)
  })

  it('加速/减速在板内全程不折返：v1 与动能定理 v1Kin 一致', () => {
    const v0 = 3.7507e7
    const up = accelSolve({ v0, E: 1.714e4, L: 0.06 })
    const down = accelSolve({ v0, E: -1.714e4, L: 0.06 })
    // 未停住时：实际末速度必须等于动能定理值，不允许 v1 偏大、v1Kin 偏小
    expect(up.v1).toBeCloseTo(up.v1Kin, 8)
    expect(Math.abs(down.v1)).toBeCloseTo(down.v1Kin, 8)
    expect(down.stop).toBe(false)
  })
})

describe('chargedDeflection：速度选择器 E⊥B', () => {
  const base = { U: 240, d: 0.014, L: 0.06, D: 0.06 }
  const sol = deflectionSolve({ Ua: 4000, U: 240, L: 0.06, d: 0.014, D: 0.06 })

  it('B = E/v₀ 时电子直线穿过', () => {
    const B = (base.U / base.d) / sol.v0
    const p = selectorPath({ ...base, B, v0: sol.v0 })
    expect(p.vMatch).toBeCloseTo(sol.v0, 0)
    expect(p.hit).toBe('none')
    expect(Math.abs(p.yAtScreen)).toBeLessThan(1e-6)
    expect(p.straight).toBe(true)
  })

  it('速度偏大 / 偏小分别向两侧弯', () => {
    const B = (base.U / base.d) / sol.v0
    const fast = selectorPath({ ...base, B, v0: sol.v0 * 1.5 })
    const slow = selectorPath({ ...base, B, v0: sol.v0 * 0.6 })
    expect(fast.yAtScreen).toBeLessThan(0)
    expect(slow.yAtScreen).toBeGreaterThan(0)
    expect(Math.abs(fast.yAtScreen)).toBeGreaterThan(base.d * 0.1)
  })

  it('B=0 时只剩电场，等同普通偏转', () => {
    const p = selectorPath({ ...base, B: 0, v0: sol.v0 })
    expect(p.vMatch).toBe(Infinity)
    expect(p.yAtScreen).toBeGreaterThan(0)
  })

  it('质子在 v=E/B 匹配速度下同样直线穿过（荷质比修正不影响选择条件）', () => {
    const vMatch = (base.U / base.d) / 0.46e-3
    const p = selectorPath({ ...base, B: 0.46e-3, v0: vMatch, q: 1, m: 1836 })
    expect(p.hit).toBe('none')
    expect(Math.abs(p.yAtScreen)).toBeLessThan(1e-6)
    expect(p.straight).toBe(true)
  })
})
