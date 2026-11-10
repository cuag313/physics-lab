/**
 * sandbox/catalog.js — 器材目录（左侧侧边栏数据源）
 *
 * 只放数据与元信息，不认识电路拓扑 / 渲染。
 * electric 组是完整可用的电学器材；力学/光学/热学作为分组占位，
 * 保证界面布局与「NB 物理实验」一致，后续再往里填器材。
 */

/** 电学器材（全部可用，1:1 写实教具） */
export const ELECTRIC_COMPONENTS = [
  {
    type: 'battery',
    label: '干电池组',
    short: '电池组',
    icon: '🔋',
    desc: '可调电压干电池组（1.5V × N）',
    defaults: { voltage: 3 },
    internal: 'battery',
    params: [
      { key: 'voltage', label: '电压', unit: 'V', min: 1.5, max: 12, step: 0.5, presets: [1.5, 3, 4.5, 6, 9] },
    ],
  },
  {
    type: 'powerSupply',
    label: '学生电源',
    short: '电源',
    icon: '🔌',
    desc: '0~12V 可调直流稳压电源',
    defaults: { voltage: 6, on: true },
    internal: 'powerSupply',
    params: [
      { key: 'voltage', label: '电压', unit: 'V', min: 1.5, max: 12, step: 0.5, presets: [3, 6, 9, 12] },
    ],
  },
  {
    type: 'bulb',
    label: '小灯泡',
    short: '灯泡',
    icon: '💡',
    desc: '2.5V 白炽小灯泡（含灯座）',
    defaults: { resistance: 10, ratedV: 2.5 },
    internal: 'bulb',
    params: [
      { key: 'resistance', label: '灯丝电阻', unit: 'Ω', min: 5, max: 40, step: 1, presets: [5, 10, 15, 20] },
      { key: 'ratedV', label: '额定电压', unit: 'V', min: 1.5, max: 6, step: 0.5, presets: [2.5, 3.8, 6] },
    ],
  },
  {
    type: 'resistor',
    label: '定值电阻',
    short: '电阻',
    icon: '🟫',
    desc: '四色环定值电阻',
    defaults: { resistance: 10 },
    internal: 'resistor',
    params: [
      { key: 'resistance', label: '阻值', unit: 'Ω', min: 1, max: 100, step: 1, presets: [5, 10, 15, 20, 50] },
    ],
  },
  {
    type: 'rheostat',
    label: '滑动变阻器',
    short: '变阻器',
    icon: '🎚️',
    desc: '50Ω 2A 瓷筒滑动变阻器',
    defaults: { resistance: 20, maxR: 50 },
    internal: 'rheostat',
    params: [
      { key: 'resistance', label: '接入阻值', unit: 'Ω', min: 0, max: 50, step: 1, presets: [0, 10, 20, 50] },
    ],
  },
  {
    type: 'switch',
    label: '单刀开关',
    short: '开关',
    icon: '🔘',
    desc: '单刀单掷闸刀开关',
    defaults: { closed: false },
    internal: 'switch',
    params: [],
  },
  {
    type: 'ammeter',
    label: '电流表',
    short: '电流表',
    icon: '🅰',
    desc: '0~0.6A / 0~3A 直流电流表',
    defaults: { range: 3 },
    internal: 'ammeter',
    params: [
      { key: 'range', label: '量程', unit: 'A', kind: 'range', options: [0.6, 3] },
    ],
  },
  {
    type: 'voltmeter',
    label: '电压表',
    short: '电压表',
    icon: '🅥',
    desc: '0~3V / 0~15V 直流电压表',
    defaults: { range: 15 },
    internal: 'voltmeter',
    params: [
      { key: 'range', label: '量程', unit: 'V', kind: 'range', options: [3, 15] },
    ],
  },
  {
    type: 'galvanometer',
    label: '灵敏电流计',
    short: '电流计',
    icon: '🅖',
    desc: '检流计（零刻度居中，检测微小电流）',
    defaults: { range: 0.05, resistance: 50 },
    internal: 'galvanometer',
    params: [
      { key: 'range', label: '量程', unit: 'mA', kind: 'range', options: [0.005, 0.05] },
      { key: 'resistance', label: '内阻', unit: 'Ω', min: 10, max: 500, step: 10, presets: [50, 100] },
    ],
  },
]

/** 侧边栏分组（电学完整，其余为占位分组） */
export const COMPONENT_GROUPS = [
  { key: 'electric', label: '电学', icon: '⚡', items: ELECTRIC_COMPONENTS },
  { key: 'mechanics', label: '力学', icon: '⚙️', items: [], placeholder: '力学器材即将上线' },
  { key: 'optics', label: '光学', icon: '🔬', items: [], placeholder: '光学器材即将上线' },
  { key: 'thermal', label: '热学', icon: '🌡️', items: [], placeholder: '热学器材即将上线' },
]

const BY_TYPE = new Map(ELECTRIC_COMPONENTS.map((c) => [c.type, c]))

/** 按类型取器材定义 */
export function componentDef(type) {
  return BY_TYPE.get(type) || null
}
