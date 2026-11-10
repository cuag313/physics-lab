/**
 * components3d/JunctionBoard.jsx — 接线板（端子排，3D 拟物道具）
 *
 * 阶段 A 仅作外观道具；多端子接线语义在后续阶段接入。
 */
import { MAT, BasePlate, Terminal, SilkText } from './common.jsx'
import { TERM_LOCAL } from '../model3d.js'

const EXTRA_POSTS = [-0.3, -0.15, 0.15, 0.3]

export default function JunctionBoard3D({ onTermHover, onTermClick }) {
  return (
    <group>
      <BasePlate width={1.6} depth={0.5} topY={0.05} />

      {/* 端子排主体 */}
      <mesh castShadow receiveShadow position={[0, 0.09, 0]}>
        <boxGeometry args={[1.4, 0.08, 0.3]} />
        <meshStandardMaterial {...MAT.bakelite} />
      </mesh>
      {/* 顶部金属导条 */}
      <mesh position={[0, 0.14, 0]}>
        <boxGeometry args={[1.4, 0.015, 0.3]} />
        <meshStandardMaterial {...MAT.steel} />
      </mesh>

      {/* 8 个接线柱：两端为电路端口，中间为装饰端子 */}
      {EXTRA_POSTS.map((x, i) => (
        <Terminal key={x} portIdx={10 + i} position={[x, 0.05, 0.16]} color={i % 2 === 0 ? 'black' : 'red'} />
      ))}

      <SilkText text="接线板" position={[0, 0.03, -0.1]} height={0.05} color="#c9d1d9" />

      <Terminal portIdx={0} position={TERM_LOCAL[0]} color="black" onHover={onTermHover} onClick={onTermClick} />
      <Terminal portIdx={1} position={TERM_LOCAL[1]} color="red" onHover={onTermHover} onClick={onTermClick} />
    </group>
  )
}
