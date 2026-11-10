/**
 * ElectricLab3DSandbox — 3D 电学实验台（完整可动手沙盒）
 *
 * 器材栏点击/拖入 → 台面拖拽移动 → 接线柱拉线手动连接 → 开关通断 →
 * 滑动变阻器调阻 → 灯泡亮度联动 → 电表指针随电路摆动。
 * 电路模型与求解统一走 sandbox3d/store.js + sandbox/circuit.js（MNA 节点法）。
 */

import Sandbox3D from '../sandbox3d/Sandbox3D.jsx'

export default function ElectricLab3DSandbox() {
  return (
    <div style={{ width: '100%', height: '100%', minHeight: 480 }}>
      <Sandbox3D />
    </div>
  )
}
