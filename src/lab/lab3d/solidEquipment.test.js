/**
 * 3D 实体器材建模的回归测试。
 *
 * 目的：防止某件器材在 buildSolid 里没有实体分支，悄悄回退成
 * "SVG 剪影挤出的平板"（用户明确否决过的那种伪 3D）。
 */
import { describe, it, expect } from 'vitest'
import { buildSolid, SOLID_TYPES } from './solidEquipment.js'

const TERMS = [
  { id: 'neg', x: 20, y: 60 },
  { id: 'pos', x: 120, y: 60 },
]

describe('3D 实体器材建模', () => {
  it('声明的每种器材都能造出实体组，不会返回 null 回退成剪影', () => {
    // 电流表 / 电压表的表盘是 CanvasTexture（需要浏览器 canvas，node 里拿不到 2d 上下文），
    // 这两类在浏览器里另有实测；这里覆盖其余全部类型。
    const types = [...SOLID_TYPES].filter((t) => t !== 'ammeter' && t !== 'voltmeter')
    for (const type of types) {
      const b = buildSolid(type, { w: 190, h: 150, terminals: TERMS, fs: 3 })
      expect(b, `器材 ${type} 应能实体建模`).toBeTruthy()
      expect(b.group.children.length, `器材 ${type} 实体应有几何体`).toBeGreaterThan(0)
      expect(typeof b.thickness).toBe('number')
    }
  })

  it('接线柱按 terminals 像素坐标摆进组里（看得见的柱就是点得到的柱）', () => {
    const b = buildSolid('resistor5', { w: 190, h: 150, terminals: TERMS })
    const posts = b.group.children.filter((c) => c.userData && c.userData.terminal)
    expect(posts.map((p) => p.userData.terminal)).toEqual(['neg', 'pos'])
  })

  it('电阻变体 resistor5/10/15 都走实体建模', () => {
    for (const t of ['resistor5', 'resistor10', 'resistor15']) {
      const b = buildSolid(t, { w: 120, h: 80, terminals: TERMS })
      expect(b, `${t} 应能实体建模`).toBeTruthy()
      expect(b.group.children.length).toBeGreaterThan(0)
    }
  })
})
