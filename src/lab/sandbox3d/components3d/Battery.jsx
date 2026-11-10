/**
 * components3d/Battery.jsx — 干电池组（电池盒 + 1.5V × N 干电池）
 */
import { MAT, BasePlate, Terminal, SilkText } from './common.jsx'
import { TERM_LOCAL, cm } from '../model3d.js'

export default function Battery3D({ comp = {}, onTermHover, onTermClick }) {
  const p = comp.props || {}
  const voltage = p.voltage ?? 3

  return (
    <group>
      <BasePlate width={1.5} depth={0.7} topY={0.05} />

      {/* 电池盒（黑色 ABS） */}
      <mesh castShadow receiveShadow position={[0, 0.18, 0]}>
        <boxGeometry args={[1.1, 0.22, 0.52]} />
        <meshStandardMaterial {...MAT.absBlack} />
      </mesh>
      {/* 盒盖倒角高光 */}
      <mesh position={[0, 0.295, 0]}>
        <boxGeometry args={[1.0, 0.015, 0.46]} />
        <meshStandardMaterial color="#2e3138" roughness={0.4} metalness={0.15} />
      </mesh>

      {/* 两节 1 号干电池（银色锌筒 + 金色标签环 + 红色正极帽） */}
      {[-0.28, 0.28].map((x) => (
        <group key={x} position={[x, 0.31, 0]}>
          <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[cm(1.4), cm(1.4), cm(5.2), 24]} />
            <meshStandardMaterial {...MAT.zinc} />
          </mesh>
          {/* 金色标签环 */}
          <mesh rotation={[0, 0, Math.PI / 2]} position={[0, 0, 0]}>
            <cylinderGeometry args={[cm(1.45), cm(1.45), cm(2.0), 24]} />
            <meshStandardMaterial color="#e0a92e" roughness={0.5} metalness={0.15} />
          </mesh>
          {/* 正极铜帽 + 红色绝缘环 */}
          <mesh position={[cm(2.6), 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[cm(0.6), cm(0.6), cm(0.6), 16]} />
            <meshStandardMaterial {...MAT.brass} />
          </mesh>
          <mesh position={[cm(2.05), 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[cm(1.46), cm(1.46), cm(0.3), 24]} />
            <meshStandardMaterial color="#c62828" roughness={0.45} metalness={0.1} />
          </mesh>
        </group>
      ))}

      {/* 极性丝印 */}
      <SilkText text="+" position={[0.48, 0.33, 0]} height={0.1} color="#ff6f60" rotation={[0, 0, 0]} />
      <SilkText text="−" position={[-0.48, 0.33, 0]} height={0.1} color="#9fc0e0" rotation={[0, 0, 0]} />
      <SilkText text={`${voltage.toFixed(1)}V`} position={[0, 0.4, 0]} height={0.09} color="#e8e8e8" />
      <SilkText text="干电池组" position={[0, 0.12, 0.27]} height={0.06} color="#c9d1d9" />

      {/* 接线柱：ports[0] 负（黑）、ports[1] 正（红） */}
      <Terminal portIdx={0} position={TERM_LOCAL[0]} color="black" onHover={onTermHover} onClick={onTermClick} />
      <Terminal portIdx={1} position={TERM_LOCAL[1]} color="red" onHover={onTermHover} onClick={onTermClick} />
    </group>
  )
}
