/**
 * components3d/PowerSupply.jsx — 学生电源（0~12V 可调直流稳压电源，J1202 型）
 * 竖立箱体 + 前面板（电压显示窗 / 调压旋钮 / 指示灯 / 电源开关 / 红黑输出接线柱）。
 */
import { MAT, BasePlate, Terminal, SilkText } from './common.jsx'
import { TERM_LOCAL } from '../model3d.js'

export default function PowerSupply3D({ comp = {}, onTermHover, onTermClick }) {
  const p = comp.props || {}
  const voltage = p.voltage ?? 6
  const on = p.on !== false

  return (
    <group>
      <BasePlate width={1.5} depth={0.7} topY={0.05} />

      {/* 竖立箱体（浅灰 ABS，微向后倾便于俯视读数） */}
      <group position={[0, 0.06, -0.02]} rotation={[0.09, 0, 0]}>
        <mesh castShadow receiveShadow position={[0, 0.44, 0]}>
          <boxGeometry args={[0.85, 0.88, 0.28]} />
          <meshStandardMaterial color="#c9ced4" roughness={0.5} metalness={0.1} />
        </mesh>
        {/* 前面板（略深色） */}
        <mesh position={[0, 0.44, 0.145]}>
          <boxGeometry args={[0.77, 0.8, 0.012]} />
          <meshStandardMaterial color="#3a4148" roughness={0.45} metalness={0.2} />
        </mesh>

        {/* 电压数字显示窗 */}
        <mesh position={[0, 0.68, 0.156]}>
          <boxGeometry args={[0.42, 0.16, 0.008]} />
          <meshStandardMaterial color="#0c1014" roughness={0.3} metalness={0.2} />
        </mesh>
        <SilkText text={on ? voltage.toFixed(1) : '--'} position={[0.09, 0.68, 0.162]} height={0.1} color={on ? '#ff5a4a' : '#5a626a'} />
        <SilkText text="V" position={[-0.18, 0.68, 0.162]} height={0.06} color="#9fb4c0" />

        {/* 调压旋钮（黑色 + 白色指示线） */}
        <mesh position={[-0.24, 0.46, 0.16]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.04, 28]} />
          <meshStandardMaterial {...MAT.absBlack} />
        </mesh>
        <mesh position={[-0.24, 0.46, 0.184]} rotation={[0, 0, -0.5 + (voltage / 12) * 2.2]}>
          <boxGeometry args={[0.1, 0.012, 0.012]} />
          <meshStandardMaterial color="#e8e8e8" roughness={0.4} />
        </mesh>
        <SilkText text="电压" position={[-0.24, 0.34, 0.162]} height={0.05} color="#c9d1d9" />

        {/* 电源指示灯 */}
        <mesh position={[0.24, 0.56, 0.16]}>
          <sphereGeometry args={[0.022, 16, 16]} />
          <meshStandardMaterial color={on ? '#3ddc84' : '#3a444c'} emissive={on ? '#3ddc84' : '#000'} emissiveIntensity={on ? 1.8 : 0} />
        </mesh>

        {/* 电源开关（翘板） */}
        <mesh position={[0.24, 0.4, 0.16]}>
          <boxGeometry args={[0.14, 0.05, 0.03]} />
          <meshStandardMaterial color="#22262b" roughness={0.4} metalness={0.15} />
        </mesh>

        <SilkText text="学生电源" position={[0, 0.2, 0.162]} height={0.06} color="#dfe7ee" />
        <SilkText text="DC OUTPUT" position={[0, 0.13, 0.162]} height={0.04} color="#8b98a5" />
      </group>

      <Terminal portIdx={0} position={TERM_LOCAL[0]} color="black" onHover={onTermHover} onClick={onTermClick} />
      <Terminal portIdx={1} position={TERM_LOCAL[1]} color="red" onHover={onTermHover} onClick={onTermClick} />
    </group>
  )
}
