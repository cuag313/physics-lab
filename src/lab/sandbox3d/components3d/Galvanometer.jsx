/**
 * components3d/Galvanometer.jsx — 灵敏电流计（检流计，零刻度居中）
 * 方形银灰金属壳 + 圆形表盘（零刻度中央，指针左右偏转），底部前缘红/黑接线柱。
 */
import { Terminal, MeterDial, MeterCase } from './common.jsx'
import { terminalLocal } from '../model3d.js'

export default function Galvanometer3D({ comp = {}, results, onTermHover, onTermClick }) {
  const p = comp.props || {}
  const range = p.range ?? 0.05
  const r = results?.get(comp.id)
  const value = r ? r.current : 0

  return (
    <group>
      <MeterCase radius={0.4}>
        <MeterDial kind="G" range={range} value={value} unit="μA" accent="#1b5e20" zeroCenter radius={0.39} />
      </MeterCase>
      <Terminal portIdx={0} position={terminalLocal('galvanometer', 0)} color="black" onHover={onTermHover} onClick={onTermClick} />
      <Terminal portIdx={1} position={terminalLocal('galvanometer', 1)} color="red" onHover={onTermHover} onClick={onTermClick} />
    </group>
  )
}
