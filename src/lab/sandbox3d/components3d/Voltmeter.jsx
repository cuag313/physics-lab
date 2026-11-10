/**
 * components3d/Voltmeter.jsx — 0~3V / 0~15V 直流电压表
 * 与电流表同款方形银灰金属壳 + 大圆白底表盘，底部前缘红/黑接线柱。
 */
import { Terminal, MeterDial, MeterCase } from './common.jsx'
import { terminalLocal } from '../model3d.js'

export default function Voltmeter3D({ comp = {}, results, onTermHover, onTermClick }) {
  const p = comp.props || {}
  const range = p.range ?? 15
  const r = results?.get(comp.id)
  const value = r ? r.voltage : 0

  return (
    <group>
      <MeterCase radius={0.42}>
        <MeterDial kind="V" range={range} value={value} unit="V" accent="#1b5e20" radius={0.41} />
      </MeterCase>
      <Terminal portIdx={0} position={terminalLocal('voltmeter', 0)} color="black" onHover={onTermHover} onClick={onTermClick} />
      <Terminal portIdx={1} position={terminalLocal('voltmeter', 1)} color="red" onHover={onTermHover} onClick={onTermClick} />
    </group>
  )
}
