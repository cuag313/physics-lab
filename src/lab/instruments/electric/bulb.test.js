import { describe, expect, it } from 'vitest'
import { Bulb } from './Bulb'

/** 直接设置上一帧 v/i（引擎 solve 后的值） */
function settle(b, v, i) {
  b.voltage = v
  b.current = i
  b.update(1 / 60)
}

describe('灯丝电阻随温度变化', () => {
  it('冷态 P=0：R=3Ω，T=20°C，灯不亮', () => {
    const b = new Bulb()
    settle(b, 0, 0)
    expect(b.ratedPower).toBeCloseTo(0.9) // 3V² / 10Ω
    expect(b.computeResistance()).toBeCloseTo(3)
    expect(b.resistance).toBeCloseTo(3)
    expect(b.temperature).toBeCloseTo(20)
    expect(b.state.brightness).toBe(0)
  })

  it('额定 P=P_rated：R=10Ω，T=2500°C，亮度满', () => {
    const b = new Bulb()
    settle(b, 3, 0.3) // P = 0.9W
    expect(b.power).toBeCloseTo(0.9)
    expect(b.computeResistance()).toBeCloseTo(10)
    expect(b.temperature).toBeCloseTo(2500)
    expect(b.state.brightness).toBeCloseTo(1)
  })

  it('半功率：R = 3 + 7*0.5 = 6.5Ω，T = 1260°C', () => {
    const b = new Bulb()
    settle(b, 3, 0.15) // P = 0.45W
    expect(b.computeResistance()).toBeCloseTo(6.5)
    expect(b.temperature).toBeCloseTo(1260)
    expect(b.state.brightness).toBeCloseTo(0.5)
  })

  it('过额定：R 饱和在 10Ω，T 可超过 2500°C', () => {
    const b = new Bulb()
    settle(b, 4, 1) // P = 4W ≫ P_rated
    expect(b.computeResistance()).toBeCloseTo(10)
    expect(b.temperature).toBeGreaterThan(2500)
    expect(b.state.brightness).toBeCloseTo(1) // 亮度封顶
  })

  it('电阻随功耗单调上升（I–U 曲线弯曲的来源）', () => {
    const b = new Bulb()
    const rs = [0, 0.1, 0.3, 0.6, 0.9, 1.5].map((P) => {
      b.voltage = 1
      b.current = P
      return b.computeResistance()
    })
    for (let i = 1; i < rs.length; i++) expect(rs[i]).toBeGreaterThanOrEqual(rs[i - 1])
    expect(rs[0]).toBeCloseTo(3)
    expect(rs[rs.length - 1]).toBeCloseTo(10)
  })

  it('I–U 曲线：低压段电流偏大（近冷态），高压段饱和在 U/10Ω', () => {
    // 模拟引擎逐帧迭代：R 由上一帧功耗更新
    const iu = (U) => {
      const b = new Bulb()
      let I = 0
      for (let n = 0; n < 200; n++) {
        b.voltage = U
        b.current = I
        I = U / b.computeResistance()
      }
      return I
    }
    const i1 = iu(1)
    const i3 = iu(3)
    const i6 = iu(6)
    // 1V：比热态模型（0.1A）明显偏大，接近冷态
    expect(i1).toBeCloseTo(0.214, 2)
    expect(i1).toBeGreaterThan(0.1)
    // 3V 额定：恰好 0.3A
    expect(i3).toBeCloseTo(0.3, 3)
    // 6V：电阻饱和 → 电流饱和
    expect(i6).toBeCloseTo(0.6, 3)
  })
})
