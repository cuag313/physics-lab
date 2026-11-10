/**
 * components3d/Wire.jsx — 红黑导线（带香蕉插头的实验引线，盘绕形态）
 *
 * 注：这是器材栏里的「导线」教具（盘成一卷放台上）。真正的电路连线是
 * wires3d.js 里的管状导线，在阶段 B 接线时使用。
 */
import { MAT, BasePlate, Terminal, SilkText } from './common.jsx'
import { TERM_LOCAL } from '../model3d.js'

export default function Wire3D({ onTermHover, onTermClick }) {
  return (
    <group>
      <BasePlate width={1.4} depth={0.5} topY={0.04} />

      {/* 红色绝缘皮线圈 */}
      <mesh castShadow receiveShadow position={[0, 0.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.2, 0.035, 12, 40]} />
        <meshStandardMaterial color="#c62828" roughness={0.6} metalness={0.05} />
      </mesh>
      <mesh position={[0, 0.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.2, 0.042, 12, 40]} />
        <meshStandardMaterial color="#8e1c1c" roughness={0.6} metalness={0.05} transparent opacity={0.35} />
      </mesh>

      {/* 两端香蕉插头 */}
      {[-0.6, 0.6].map((x, i) => (
        <group key={x} position={[x, 0.16, 0]} rotation={[0, 0, i === 0 ? 0 : Math.PI]}>
          <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.02, 0.02, 0.12, 16]} />
            <meshStandardMaterial {...MAT.brass} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]} position={[0.06, 0, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 0.1, 16]} />
            <meshStandardMaterial color={i === 0 ? '#1a1a1a' : '#c62828'} roughness={0.5} metalness={0.15} />
          </mesh>
        </group>
      ))}

      <SilkText text="红黑导线" position={[0, 0.03, 0.18]} height={0.05} color="#c9d1d9" />

      <Terminal portIdx={0} position={TERM_LOCAL[0]} color="black" onHover={onTermHover} onClick={onTermClick} />
      <Terminal portIdx={1} position={TERM_LOCAL[1]} color="red" onHover={onTermHover} onClick={onTermClick} />
    </group>
  )
}
