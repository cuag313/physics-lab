/**
 * sandbox3d/catalog3d.js — 3D 器材目录与组件注册表
 *
 * 复用 2D catalog.js 的 9 件电学器材元数据，补充 3 件 3D 拟物道具
 * （红黑导线 / 万用表 / 接线板）。每件器材对应一个 components3d/*.jsx 文件。
 */

import { ELECTRIC_COMPONENTS } from '../sandbox/catalog.js'
import {
  Ammeter3D, Voltmeter3D, Battery3D, Bulb3D,
  Resistor3D, Rheostat3D, Switch3D,
} from '../three/ImageCards3d.jsx'
import PowerSupply3D from './components3d/PowerSupply.jsx'
import Galvanometer3D from './components3d/Galvanometer.jsx'
import Wire3D from './components3d/Wire.jsx'
import Multimeter3D from './components3d/Multimeter.jsx'
import JunctionBoard3D from './components3d/JunctionBoard.jsx'

const EXTRA_3D = [
  { type: 'wire', label: '红黑导线', short: '导线', icon: '🔌', desc: '带香蕉插头的实验引线', defaults: {}, params: [], internal: 'wire' },
  { type: 'multimeter', label: '万用表', short: '万用表', icon: '📟', desc: '手持数字多用表（V/A/Ω）', defaults: {}, params: [], internal: 'multimeter' },
  { type: 'junctionBoard', label: '接线板', short: '接线板', icon: '🧮', desc: '多端子接线排', defaults: {}, params: [], internal: 'junctionBoard' },
]

const COMPONENT_3D = {
  battery: Battery3D,
  powerSupply: PowerSupply3D,
  bulb: Bulb3D,
  resistor: Resistor3D,
  rheostat: Rheostat3D,
  switch: Switch3D,
  ammeter: Ammeter3D,
  voltmeter: Voltmeter3D,
  galvanometer: Galvanometer3D,
  wire: Wire3D,
  multimeter: Multimeter3D,
  junctionBoard: JunctionBoard3D,
}

/** 3D 器材栏分组（12 件全在此） */
export const INSTRUMENT_GROUPS_3D = [
  { key: 'electric', label: '电学', icon: '⚡', items: [...ELECTRIC_COMPONENTS, ...EXTRA_3D] },
]

/** 按类型取 3D 器材定义 */
export function componentDef3D(type) {
  return [...ELECTRIC_COMPONENTS, ...EXTRA_3D].find((c) => c.type === type) || null
}

/** 按类型取 3D 组件 */
export function component3D(type) {
  return COMPONENT_3D[type] || null
}
