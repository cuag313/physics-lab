import { describe, expect, it } from 'vitest'
import { TYPES, rheostatMode, RHEO_TRACK } from './electricSvgInstruments'

const rheo = TYPES.rheostat

describe('rheostatMode：按实际接线柱判定接入方式', () => {
  it('bl+tl/tr → left-wire；br+tl/tr → right-wire', () => {
    expect(rheostatMode(new Set(['bl', 'tl']))).toBe('left-wire')
    expect(rheostatMode(new Set(['bl', 'tr']))).toBe('left-wire')
    expect(rheostatMode(new Set(['br', 'tl']))).toBe('right-wire')
  })
  it('bl+br → full-wire；tl+tr → short；单柱/悬空 → open', () => {
    expect(rheostatMode(new Set(['bl', 'br']))).toBe('full-wire')
    expect(rheostatMode(new Set(['tl', 'tr']))).toBe('short')
    expect(rheostatMode(new Set(['bl']))).toBe('open')
    expect(rheostatMode(new Set())).toBe('open')
  })
})

describe('rheostat 渲染：有效段高亮随 mode 变化', () => {
  const c = { f: 0.3, rmax: 10 }
  const xw = RHEO_TRACK.x0 + 0.3 * (RHEO_TRACK.x1 - RHEO_TRACK.x0)

  it('left-wire：左段亮橙高亮 + 流动粒子；读数 = f*rmax', () => {
    const svg = rheo.render(c, { mode: 'left-wire' })
    expect(svg).toContain('es-rheo-flow')                 // 流动粒子
    expect(svg).toContain('stroke="#f59e0b"')             // 亮橙
    expect(svg).toContain(`R = ${(0.3 * 10).toFixed(1)} Ω`)
  })

  it('right-wire：高亮从滑片到右柱；读数 = (1-f)*rmax', () => {
    const svg = rheo.render(c, { mode: 'right-wire' })
    expect(svg).toContain('es-rheo-flow')
    // 高亮沿瓷筒冠顶走（y23.5），右段到绕线右端 x159
    expect(svg).toMatch(/L159 23.5/)
    expect(svg).toContain(`R = ${(0.7 * 10).toFixed(1)} Ω`)
  })

  it('short：金属杆红色高亮 + 旁注短路；full-wire：整段灰色 + 旁注', () => {
    const s = rheo.render(c, { mode: 'short' })
    expect(s).toContain('短路')
    expect(s).toContain('stroke="#ef4444"')

    const f = rheo.render(c, { mode: 'full-wire' })
    expect(f).toContain('最大阻值，不可调')
    expect(f).toContain('stroke="#8b95a5"')
    expect(f).toContain('R = 10.0 Ω')
  })

  it('滑片 xw 变化时高亮段实时跟随', () => {
    const svg = rheo.render({ f: 0.8, rmax: 10 }, { mode: 'left-wire' })
    const xw2 = RHEO_TRACK.x0 + 0.8 * (RHEO_TRACK.x1 - RHEO_TRACK.x0)
    expect(svg).toContain(`L${xw2.toFixed(1)} 23.5`)       // 左段高亮终点跟到新滑片位置（沿冠顶）
  })
})
