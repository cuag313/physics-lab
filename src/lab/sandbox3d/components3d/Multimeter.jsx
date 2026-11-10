/**
 * components3d/Multimeter.jsx — 万用表（手持数字多用表，3D 拟物道具）
 *
 * 阶段 A 仅作外观道具；测量语义（V/A/Ω 挡位）在后续阶段接入。
 */
import { MAT, BasePlate, Terminal, SilkText } from './common.jsx'
import { TERM_LOCAL } from '../model3d.js'

export default function Multimeter3D({ onTermHover, onTermClick }) {
  return (
    <group>
      <BasePlate width={1.5} depth={0.5} topY={0.05} />

      {/* 机身（斜立） */}
      <group position={[0, 0.42, -0.02]} rotation={[-0.18, 0, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.72, 1.28, 0.26]} />
          <meshStandardMaterial color="#f0b429" roughness={0.5} metalness={0.1} />
        </mesh>
        {/* 前面板 */}
        <mesh position={[0, 0.1, 0.14]}>
          <boxGeometry args={[0.66, 0.9, 0.01]} />
          <meshStandardMaterial color="#2b2d33" roughness={0.4} metalness={0.2} />
        </mesh>
        {/* LCD 屏 */}
        <mesh position={[0, 0.34, 0.15]}>
          <boxGeometry args={[0.5, 0.26, 0.01]} />
          <meshStandardMaterial color="#b9d9a8" roughness={0.25} metalness={0.05} />
        </mesh>
        <SilkText text="1888" position={[0, 0.34, 0.16]} height={0.14} color="#1a2a16" />
        {/* 旋转挡位盘 */}
        <mesh position={[0, -0.02, 0.15]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.16, 0.16, 0.02, 32]} />
          <meshStandardMaterial {...MAT.bakeliteDark} />
        </mesh>
        <mesh position={[0, -0.02, 0.16]} rotation={[0, 0, -0.6]}>
          <boxGeometry args={[0.2, 0.014, 0.014]} />
          <meshStandardMaterial color="#c62828" roughness={0.4} />
        </mesh>
      </group>

      <SilkText text="万用表" position={[0, 0.06, 0.16]} height={0.05} color="#c9d1d9" />

      <Terminal portIdx={0} position={TERM_LOCAL[0]} color="black" onHover={onTermHover} onClick={onTermClick} />
      <Terminal portIdx={1} position={TERM_LOCAL[1]} color="red" onHover={onTermHover} onClick={onTermClick} />
    </group>
  )
}
