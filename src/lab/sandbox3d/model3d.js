/**
 * sandbox3d/model3d.js — 元件与导线的 3D 摆放映射
 *
 * 尺度约定：1 个 3D 单位 = 10 cm（0.1 m）。所有器材都按真实教具尺寸建模，
 * 因此灯光 / 雾 / ContactShadows 都用同一套单位，材质的 PBR 参数也按米级光照调校。
 *
 * 2D 世界坐标 → 3D：2D 里接线柱固定在 (±40, 0)，两柱相距 80 个世界单位；
 * 3D 里两接线柱相距 12 cm（1.2 单位），故 1 个 2D 世界单位 = 0.015 个 3D 单位。
 */

import { TERM_OFFSET } from '../sandbox/circuit.js'

/** 1 个 3D 单位 = 10 cm（文档语义：`cm()` 把厘米换算成 3D 单位） */
export const UNIT = 0.1

/** 厘米 → 3D 单位 */
export const cm = (v) => v / 10

/** 2D 世界单位 → 3D 单位 */
export const WORLD_TO_UNIT = 0.015

/** 两接线柱间距（3D 单位）：80 世界单位 × 0.015 = 1.2 单位 = 12 cm */
export const TERM_SPACING = TERM_OFFSET * 2 * WORLD_TO_UNIT

/** 接线柱本地坐标（相对元件中心，y 为柱底高度）：ports[0] 左/负、ports[1] 右/正 */
export const TERM_LOCAL = [
  [-TERM_SPACING / 2, 0.05, 0],
  [TERM_SPACING / 2, 0.05, 0],
]

/** 接线柱顶帽高度（接线预览线 / 插头的吸附锚点） */
export const TERM_TOP = 0.2

/**
 * 各器材接线柱的本地坐标（相对元件中心，[x, y柱底, z]）。
 * 图卡器材（ImageCards3d）的接线柱贴在卡面下缘/顶缘；
 * ports[0] 负/左，ports[1] 正/右 —— 与求解器约定一致。
 */
export const TERMINALS = {
  ammeter: { 0: [-0.34, 0.1, 0.03], 1: [0.34, 0.1, 0.03] },
  voltmeter: { 0: [-0.38, 0.1, 0.03], 1: [0.38, 0.1, 0.03] },
  battery: { 0: [-0.3, 1.02, 0.03], 1: [0.3, 1.02, 0.03] },
  switch: { 0: [-0.58, 0.14, 0.03], 1: [0.58, 0.14, 0.03] },
  rheostat: { 0: [-0.72, 0.12, 0.03], 1: [0.72, 0.12, 0.03] },
  resistor: { 0: [-0.55, 0.1, 0.03], 1: [0.55, 0.1, 0.03] },
  bulb: { 0: [-0.3, 0.1, 0.03], 1: [0.3, 0.1, 0.03] },
  galvanometer: { 0: [-0.13, 0.04, 0.14], 1: [0.13, 0.04, 0.14] },
  multimeter: { 0: [-0.2, 0.05, 0.1], 1: [0.2, 0.05, 0.1] },
}

/** 取某类型器材某端口的本地接线柱坐标（缺省用 (±0.6, 0.05, 0)） */
export function terminalLocal(type, portIdx) {
  return (TERMINALS[type] && TERMINALS[type][portIdx]) || TERM_LOCAL[portIdx] || TERM_LOCAL[0]
}

/** 2D 元件中心 (x, y) → 3D 台面位置 (x, z) */
export function toScene3(p) {
  return { x: p.x * WORLD_TO_UNIT, z: p.y * WORLD_TO_UNIT }
}

/** 3D 台面位置 → 2D 世界坐标 */
export function toWorld2(pos) {
  return { x: pos.x / WORLD_TO_UNIT, y: pos.z / WORLD_TO_UNIT }
}

/** 某元件端口在 3D 世界里的接线柱坐标（[x, y, z]，y 取接线柱自身高度） */
export function termWorld3(comp, portIdx) {
  const s = toScene3(comp)
  const t = terminalLocal(comp.type, portIdx)
  return [s.x + t[0], t[1], s.z + t[2]]
}

/**
 * 器材落地包围盒（半宽、半深，3D 单位），用于拖拽吸附与地面投影圈。
 * 台面吸附阈值见 Sandbox3D 里的 SNAP_DIST（0.5 cm）。
 */
export const FOOTPRINTS = {
  battery: { hw: 0.42, hd: 0.24 },
  powerSupply: { hw: 0.5, hd: 0.26 },
  bulb: { hw: 0.3, hd: 0.3 },
  resistor: { hw: 0.42, hd: 0.16 },
  rheostat: { hw: 0.66, hd: 0.24 },
  switch: { hw: 0.4, hd: 0.2 },
  ammeter: { hw: 0.6, hd: 0.16 },
  voltmeter: { hw: 0.6, hd: 0.16 },
  galvanometer: { hw: 0.42, hd: 0.2 },
  multimeter: { hw: 0.28, hd: 0.14 },
  junctionBoard: { hw: 0.5, hd: 0.2 },
  wire: { hw: 0.24, hd: 0.24 },
}

/** 取某类型器材的落地半宽/半深（未知类型给一个默认值） */
export function footprintOf(type) {
  return FOOTPRINTS[type] || { hw: 0.4, hd: 0.24 }
}
