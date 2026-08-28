/**
 * 预设实验方案
 * 每个方案定义了仪器布局和连线
 */

export const PRESETS = {
  // ========== 电学实验 ==========

  /** 简单电路：电池 + 开关 + 灯泡 */
  simpleCircuit: {
    name: '简单电路',
    description: '电池 → 开关 → 灯泡，最基本的电路',
    category: 'electric',
    instruments: [
      { id: 'bat1', type: 'battery', x: -2.5, y: 0, params: { emf: 3 } },
      { id: 'sw1', type: 'switch', x: 0, y: 1.5 },
      { id: 'bulb1', type: 'bulb', x: 2.5, y: 0, params: { resistance: 10 } },
    ],
    wires: [
      { fromId: 'bat1', fromPort: 'pos', toId: 'sw1', toPort: 'left' },
      { fromId: 'sw1', fromPort: 'right', toId: 'bulb1', toPort: 'right' },
      { fromId: 'bulb1', fromPort: 'left', toId: 'bat1', toPort: 'neg' },
    ]
  },

  /** 串联电路：电池 + 开关 + 两个灯泡 */
  seriesCircuit: {
    name: '串联电路',
    description: '两个灯泡串联，电流相同，电压分配',
    category: 'electric',
    instruments: [
      { id: 'bat1', type: 'battery', x: -3, y: 0, params: { emf: 6 } },
      { id: 'sw1', type: 'switch', x: 0, y: 2 },
      { id: 'bulb1', type: 'bulb', x: 3, y: 1, params: { resistance: 10 } },
      { id: 'bulb2', type: 'bulb', x: 3, y: -1, params: { resistance: 20 } },
    ],
    wires: [
      { fromId: 'bat1', fromPort: 'pos', toId: 'sw1', toPort: 'left' },
      { fromId: 'sw1', fromPort: 'right', toId: 'bulb1', toPort: 'right' },
      { fromId: 'bulb1', fromPort: 'left', toId: 'bulb2', toPort: 'right' },
      { fromId: 'bulb2', fromPort: 'left', toId: 'bat1', toPort: 'neg' },
    ]
  },

  /** 并联电路 */
  parallelCircuit: {
    name: '并联电路',
    description: '两个灯泡并联，电压相同，电流分配',
    category: 'electric',
    instruments: [
      { id: 'bat1', type: 'battery', x: -3, y: 0, params: { emf: 6 } },
      { id: 'sw1', type: 'switch', x: -1.5, y: 2 },
      { id: 'bulb1', type: 'bulb', x: 1.5, y: 1.5, params: { resistance: 10 } },
      { id: 'bulb2', type: 'bulb', x: 1.5, y: -0.5, params: { resistance: 20 } },
    ],
    wires: [
      { fromId: 'bat1', fromPort: 'pos', toId: 'sw1', toPort: 'left' },
      { fromId: 'sw1', fromPort: 'right', toId: 'bulb1', toPort: 'right' },
      { fromId: 'sw1', fromPort: 'right', toId: 'bulb2', toPort: 'right' },
      { fromId: 'bulb1', fromPort: 'left', toId: 'bat1', toPort: 'neg' },
      { fromId: 'bulb2', fromPort: 'left', toId: 'bat1', toPort: 'neg' },
    ]
  },

  /** 伏安法测电阻 */
  voltAmpereMethod: {
    name: '伏安法测电阻',
    description: '电流表串联、电压表并联，测量电阻阻值',
    category: 'electric',
    instruments: [
      { id: 'bat1', type: 'battery', x: -3.5, y: 0, params: { emf: 6 } },
      { id: 'sw1', type: 'switch', x: -2, y: 2 },
      { id: 'ammeter', type: 'ammeter', x: 0, y: 2 },
      { id: 'resistor', type: 'resistor', x: 2, y: 0, params: { resistance: 10 } },
      { id: 'voltmeter', type: 'voltmeter', x: 2, y: -2, params: { range: 15 } },
    ],
    wires: [
      { fromId: 'bat1', fromPort: 'pos', toId: 'sw1', toPort: 'left' },
      { fromId: 'sw1', fromPort: 'right', toId: 'ammeter', toPort: 'pos' },
      { fromId: 'ammeter', fromPort: 'neg', toId: 'resistor', toPort: 'right' },
      { fromId: 'resistor', fromPort: 'left', toId: 'bat1', toPort: 'neg' },
      { fromId: 'voltmeter', fromPort: 'pos', toId: 'resistor', toPort: 'right' },
      { fromId: 'voltmeter', fromPort: 'neg', toId: 'resistor', toPort: 'left' },
    ]
  },

  /** 滑动变阻器限流接法 */
  rheostatCurrentLimit: {
    name: '滑动变阻器（限流）',
    description: '滑动变阻器串联接入，调节电流',
    category: 'electric',
    instruments: [
      { id: 'bat1', type: 'battery', x: -3, y: 0, params: { emf: 6 } },
      { id: 'sw1', type: 'switch', x: -1.5, y: 2 },
      { id: 'rheostat', type: 'rheostat', x: 1, y: 2, params: { totalResistance: 50, sliderPos: 0.5 } },
      { id: 'bulb1', type: 'bulb', x: 3, y: 0, params: { resistance: 10 } },
      { id: 'ammeter', type: 'ammeter', x: 0, y: -1 },
    ],
    wires: [
      { fromId: 'bat1', fromPort: 'pos', toId: 'sw1', toPort: 'left' },
      { fromId: 'sw1', fromPort: 'right', toId: 'rheostat', toPort: 'left' },
      { fromId: 'rheostat', fromPort: 'wiper', toId: 'bulb1', toPort: 'right' },
      { fromId: 'bulb1', fromPort: 'left', toId: 'ammeter', toPort: 'pos' },
      { fromId: 'ammeter', fromPort: 'neg', toId: 'bat1', toPort: 'neg' },
    ]
  },

  // ========== 光学实验 ==========

  /** 凸透镜成像 — 物距u=3.0m, f=1.0m → 像距v=1.5m, 倒立缩小实像 */
  convexLensImaging: {
    name: '凸透镜成像',
    description: '物体→凸透镜→光屏，探究物距与像距的关系（1/u+1/v=1/f）',
    category: 'optics',
    instruments: [
      { id: 'obj1', type: 'objectArrow', x: -3, y: 0, params: { objectHeight: 0.8 } },
      { id: 'lens1', type: 'convexLens', x: 0, y: 0, params: { focalLength: 1.0 } },
      { id: 'scr1', type: 'screen', x: 2, y: 0 },
      { id: 'img1', type: 'imageArrow', x: 1.5, y: 0 },
    ],
    wires: []
  },

  /** 凹透镜发散 — 平行光入射，发散光线，虚焦点 */
  concaveLensDiverge: {
    name: '凹透镜发散',
    description: '平行光→凹透镜→发散光线，反向延长线过虚焦点',
    category: 'optics',
    instruments: [
      { id: 'src1', type: 'lightSource', x: -4, y: 0, params: { rayCount: 20, spread: 10, direction: 0 } },
      { id: 'lens1', type: 'concaveLens', x: 0, y: 0, params: { focalLength: 1.0 } },
      { id: 'scr1', type: 'screen', x: 4, y: 0 },
    ],
    wires: []
  },

  /** 平面镜反射 — 入射角=反射角 */
  mirrorReflection: {
    name: '平面镜反射',
    description: '光线→平面镜→验证反射定律（入射角=反射角）',
    category: 'optics',
    instruments: [
      { id: 'src1', type: 'lightSource', x: -3, y: 2, params: { rayCount: 12, spread: 15, direction: -40 } },
      { id: 'mirror1', type: 'planeMirror', x: 0, y: 0, params: { angle: 90 } },
    ],
    wires: []
  },
}

/** 获取所有预设列表 */
export function getPresetList() {
  return Object.entries(PRESETS).map(([key, preset]) => ({
    key,
    name: preset.name,
    description: preset.description,
    category: preset.category,
  }))
}
