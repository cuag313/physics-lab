/**
 * components3d/Resistor.jsx — 定值电阻（陶瓷基体 + 四色环 + 端帽引线）
 */
import { MAT, BasePlate, Terminal, SilkText } from './common.jsx'
import { TERM_LOCAL } from '../model3d.js'
import { resistorBands } from '../../render/parts.js'

export default function Resistor3D({ comp = {}, onTermHover, onTermClick }) {
  const p = comp.props || {}
  const R = p.resistance ?? 10
  const bands = resistorBands(R)

  return (
    <group>
      <BasePlate width={1.5} depth={0.5} topY={0.05} />

      {/* 两端引线（接线柱 → 电阻体） */}
      <mesh castShadow position={[-0.36, 0.18, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.014, 0.014, 0.48, 12]} />
        <meshStandardMaterial {...MAT.copper} />
      </mesh>
      <mesh castShadow position={[0.36, 0.18, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.014, 0.014, 0.48, 12]} />
        <meshStandardMaterial {...MAT.copper} />
      </mesh>

      {/* 陶瓷基体（横放圆柱，釉面微反光） */}
      <mesh castShadow receiveShadow position={[0, 0.18, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.12, 0.12, 0.72, 32]} />
        <meshStandardMaterial color="#e8dcc4" roughness={0.32} metalness={0.05} />
      </mesh>

      {/* 四色环 */}
      {bands.map((c, i) => (
        <mesh key={i} position={[-0.22 + i * 0.15, 0.18, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.126, 0.126, 0.04, 32]} />
          <meshStandardMaterial color={c} roughness={0.45} />
        </mesh>
      ))}

      {/* 端帽 */}
      {[-0.36, 0.36].map((x) => (
        <mesh key={x} position={[x, 0.18, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.11, 0.11, 0.06, 24]} />
          <meshStandardMaterial {...MAT.steel} />
        </mesh>
      ))}

      <SilkText text={`${R}Ω`} position={[0, 0.35, 0]} height={0.08} color="#e8dcc8" />

      <Terminal portIdx={0} position={TERM_LOCAL[0]} color="brass" onHover={onTermHover} onClick={onTermClick} />
      <Terminal portIdx={1} position={TERM_LOCAL[1]} color="brass" onHover={onTermHover} onClick={onTermClick} />
    </group>
  )
}
