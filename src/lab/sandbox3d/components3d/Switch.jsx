/**
 * components3d/Switch.jsx — 单刀单掷闸刀开关
 */
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MAT, BasePlate, Terminal, SilkText } from './common.jsx'
import { TERM_LOCAL } from '../model3d.js'

export default function Switch3D({ comp = {}, onTermHover, onTermClick }) {
  const leverRef = useRef()
  const closed = comp.props?.closed === true
  const target = closed ? 0 : -0.95 // 弧度：闭合平放，断开向上翘

  useFrame((_, dt) => {
    if (!leverRef.current) return
    const z = leverRef.current.rotation.z
    leverRef.current.rotation.z = z + (target - z) * Math.min(1, dt * 10)
  })

  return (
    <group>
      <BasePlate width={1.5} depth={0.6} topY={0.05} />

      {/* 铰链座与刀座（黄铜） */}
      <mesh castShadow position={[-0.22, 0.1, 0]}>
        <boxGeometry args={[0.09, 0.12, 0.18]} />
        <meshStandardMaterial {...MAT.brass} />
      </mesh>
      {/* 刀座：两片黄铜夹片（闸刀闭合时卡入其间） */}
      <mesh castShadow position={[0.22, 0.1, -0.045]}>
        <boxGeometry args={[0.1, 0.13, 0.03]} />
        <meshStandardMaterial {...MAT.brass} />
      </mesh>
      <mesh castShadow position={[0.22, 0.1, 0.045]}>
        <boxGeometry args={[0.1, 0.13, 0.03]} />
        <meshStandardMaterial {...MAT.brass} />
      </mesh>

      {/* 闸刀（绕左铰链旋转） */}
      <group ref={leverRef} position={[-0.22, 0.16, 0]}>
        {/* 刀身（银钢色金属片） */}
        <mesh castShadow position={[0.23, 0, 0]}>
          <boxGeometry args={[0.5, 0.012, 0.075]} />
          <meshStandardMaterial {...MAT.nickel} />
        </mesh>
        {/* 红色绝缘手柄 */}
        <mesh castShadow position={[0.44, 0, 0]}>
          <boxGeometry args={[0.13, 0.05, 0.11]} />
          <meshStandardMaterial color="#c62828" roughness={0.4} metalness={0.08} />
        </mesh>
      </group>

      <SilkText text={closed ? '闭合' : '断开'} position={[0, 0.09, 0.24]} height={0.07} color={closed ? '#7ce8b0' : '#ff9d95'} />
      <SilkText text="单刀开关" position={[0, 0.045, 0.24]} height={0.05} color="#c9d1d9" />

      <Terminal portIdx={0} position={TERM_LOCAL[0]} color="black" onHover={onTermHover} onClick={onTermClick} />
      <Terminal portIdx={1} position={TERM_LOCAL[1]} color="red" onHover={onTermHover} onClick={onTermClick} />
    </group>
  )
}
