/**
 * 测试电路引擎：伏安法测电阻
 * 
 * 电路：电源6V → 开关 → 滑线变阻器10Ω → 安培表 → 灯泡15Ω → 回到电源
 * 伏特表并联在灯泡两端
 * 
 * 预期结果：
 *   总电阻 = 10 + 15 = 25Ω
 *   电流 I = 6/25 = 0.24A
 *   灯泡电压 U = 0.24 × 15 = 3.6V
 *   灯泡功率 P = 3.6 × 0.24 = 0.864W
 */

import { CircuitGraph, CircuitSolver } from './index.js'

const graph = new CircuitGraph()

// 添加元件
const battery   = graph.addComponent('battery',   200, 360, { voltage: 6 })
const sw        = graph.addComponent('switch',    380, 360, { closed: true })
const rheostat  = graph.addComponent('rheostat',  380, 120, { resistance: 10 })
const ammeter   = graph.addComponent('ammeter',   580, 120, {})
const bulb      = graph.addComponent('bulb',      680, 240, { resistance: 15 })
const voltmeter = graph.addComponent('voltmeter', 800, 240, {})

// 接线（串联主回路）
graph.addWire({ componentId: battery.id, portIndex: 1 }, { componentId: sw.id, portIndex: 0 })        // 电源正 → 开关
graph.addWire({ componentId: sw.id, portIndex: 1 },      { componentId: rheostat.id, portIndex: 1 })   // 开关 → 变阻器
graph.addWire({ componentId: rheostat.id, portIndex: 0 },{ componentId: ammeter.id, portIndex: 0 })    // 变阻器 → 安培表
graph.addWire({ componentId: ammeter.id, portIndex: 1 }, { componentId: bulb.id, portIndex: 1 })       // 安培表 → 灯泡
graph.addWire({ componentId: bulb.id, portIndex: 0 },    { componentId: battery.id, portIndex: 0 })    // 灯泡 → 电源负

// 伏特表并联在灯泡两端
graph.addWire({ componentId: voltmeter.id, portIndex: 0 }, { componentId: bulb.id, portIndex: 0 })
graph.addWire({ componentId: voltmeter.id, portIndex: 1 }, { componentId: bulb.id, portIndex: 1 })

// 验证
const v = graph.validate()
console.log('=== 电路验证 ===')
console.log(v)

if (v.ok) {
  // 求解
  const info = graph.getCircuitInfo()
  console.log('\n=== 拓扑信息 ===')
  console.log('节点数:', info.nodeCount)
  console.log('接地点:', info.groundNode)

  const solver = new CircuitSolver()
  const results = solver.solve(info)

  console.log('\n=== 求解结果 ===')
  for (const [id, r] of results) {
    const comp = graph.getComponent(id)
    console.log(`${comp.type.padEnd(10)} #${id}: I=${r.current.toFixed(4)}A  U=${r.voltage.toFixed(3)}V  P=${r.power.toFixed(4)}W`)
  }

  // 验证灯泡
  const bulbR = results.get(bulb.id)
  console.log('\n=== 验证 ===')
  console.log(`灯泡电流: ${bulbR.current.toFixed(4)}A (预期 0.2400A)`)
  console.log(`灯泡电压: ${bulbR.voltage.toFixed(3)}V (预期 3.600V)`)
  console.log(`灯泡功率: ${bulbR.power.toFixed(4)}W (预期 0.8640W)`)
} else {
  console.log('电路验证失败:', v.reason)
}
