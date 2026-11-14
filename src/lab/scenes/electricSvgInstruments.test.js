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

describe('rheostat 渲染：通电线圈整段浅黄，随 mode / 通电状态变化', () => {
  const c = { f: 0.3, rmax: 10 }
  const xw = RHEO_TRACK.x0 + 0.3 * (RHEO_TRACK.x1 - RHEO_TRACK.x0)

  it('合上开关（live）+ left-wire：左段整圈绕线着浅黄；读数 = f*rmax', () => {
    const svg = rheo.render(c, { mode: 'left-wire', live: true })
    expect(svg).toContain('fill="url(#es-g-rheoLive)"')          // 通电着色（整面，不是一条线）
    expect(svg).toContain(`width="${(xw - 34).toFixed(1)}"`)     // 从绕线左端到滑片
    expect(svg).toContain(`R = ${(0.3 * 10).toFixed(1)} Ω`)
    expect(svg).not.toContain('es-rheo-flow')                    // 旧的流动粒子已删
    expect(svg).not.toContain('stroke="#f59e0b"')                // 旧的橙色指示线已删
  })

  it('开关断开（live=false）：绕线不着色', () => {
    const svg = rheo.render(c, { mode: 'left-wire', live: false })
    expect(svg).not.toContain('fill="url(#es-g-rheoLive)"')
  })

  it('right-wire：从滑片到绕线右端 x158；读数 = (1-f)*rmax', () => {
    const svg = rheo.render(c, { mode: 'right-wire', live: true })
    expect(svg).toContain(`x="${xw.toFixed(1)}"`)
    expect(svg).toContain(`width="${(158 - xw).toFixed(1)}"`)
    expect(svg).toContain(`R = ${(0.7 * 10).toFixed(1)} Ω`)
  })

  it('short：金属杆红色高亮 + 旁注短路，线圈不着色（电流不过绕线）', () => {
    const s = rheo.render(c, { mode: 'short', live: true })
    expect(s).toContain('短路')
    expect(s).toContain('stroke="#ef4444"')
    expect(s).not.toContain('fill="url(#es-g-rheoLive)"')
  })

  it('full-wire：整段绕线着色 + 旁注', () => {
    const f = rheo.render(c, { mode: 'full-wire', live: true })
    expect(f).toContain('最大阻值，不可调')
    expect(f).toContain(`width="${(158 - 34).toFixed(1)}"`)
    expect(f).toContain('R = 10.0 Ω')
  })

  it('滑片 xw 变化时通电段实时跟随', () => {
    const svg = rheo.render({ f: 0.8, rmax: 10 }, { mode: 'left-wire', live: true })
    const xw2 = RHEO_TRACK.x0 + 0.8 * (RHEO_TRACK.x1 - RHEO_TRACK.x0)
    expect(svg).toContain(`width="${(xw2 - 34).toFixed(1)}"`)    // 通电段右端跟到新滑片位置
  })
})

