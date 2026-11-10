/**
 * components3d/Bulb.jsx — 小灯泡（含灯座）：玻璃泡 + 钨丝 + 铜螺口 + 胶木灯座
 */
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MAT, BasePlate, Terminal, SilkText } from './common.jsx'
import { TERM_LOCAL } from '../model3d.js'
import { bulbState } from '../../sandbox/circuit.js'

export default function Bulb3D({ comp = {}, results, onTermHover, onTermClick }) {
  const lightRef = useRef()
  const bs = results ? bulbState(comp, results) : { brightness: 0, overload: 0 }
  const glow = Math.max(0, Math.min(1.2, bs.brightness))
  const lit = glow > 0.03

  useFrame((_, dt) => {
    if (lightRef.current) {
      const target = lit ? 0.3 + glow * 3.2 : 0
      lightRef.current.intensity += (target - lightRef.current.intensity) * Math.min(1, dt * 6)
    }
  })

  const filColor = lit ? '#fff3b0' : '#6b6f74'
  const filEmissive = lit ? '#ffd54f' : '#000'

  return (
    <group>
      <BasePlate width={1.4} depth={0.6} topY={0.05} />

      {/* 胶木灯座 */}
      <mesh castShadow receiveShadow position={[0, 0.14, 0]}>
        <cylinderGeometry args={[0.26, 0.3, 0.18, 32]} />
        <meshStandardMaterial {...MAT.bakelite} />
      </mesh>

      {/* 铜螺口（灯头） */}
      <mesh castShadow position={[0, 0.28, 0]}>
        <cylinderGeometry args={[0.11, 0.13, 0.1, 24]} />
        <meshStandardMaterial {...MAT.brass} />
      </mesh>
      {[0.3, 0.325, 0.35].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <torusGeometry args={[0.12, 0.005, 6, 24]} />
          <meshStandardMaterial color="#8a6d1a" roughness={0.4} metalness={0.8} />
        </mesh>
      ))}

      {/* 玻璃泡 */}
      <mesh castShadow position={[0, 0.5, 0]}>
        <sphereGeometry args={[0.24, 32, 32]} />
        <meshPhysicalMaterial
          color={lit ? '#fff2c0' : '#e3f0fb'}
          transmission={0.85}
          thickness={0.4}
          roughness={0.08}
          metalness={0}
          transparent
          opacity={lit ? 0.6 + glow * 0.3 : 0.34}
          emissive={lit ? '#ffc107' : '#000'}
          emissiveIntensity={glow * 1.6}
        />
      </mesh>

      {/* 灯丝支架 + 灯丝（V 形绕丝） */}
      <mesh position={[0, 0.5, 0]} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[0.006, 0.006, 0.16, 8]} />
        <meshStandardMaterial color="#9aa4ad" roughness={0.4} metalness={0.7} />
      </mesh>
      <mesh position={[-0.05, 0.52, 0]}>
        <torusGeometry args={[0.035, 0.009, 8, 16]} />
        <meshStandardMaterial color={filColor} emissive={filEmissive} emissiveIntensity={glow * 2.4} metalness={0.5} roughness={0.3} />
      </mesh>

      {/* 光晕 + 点光源 */}
      {lit && (
        <mesh position={[0, 0.5, 0]}>
          <sphereGeometry args={[0.26 + glow * 0.18, 16, 16]} />
          <meshBasicMaterial color="#ffc107" transparent opacity={glow * 0.1} depthWrite={false} />
        </mesh>
      )}
      <pointLight ref={lightRef} position={[0, 0.52, 0]} color="#ffe082" intensity={0} distance={5} decay={1.8} />

      <SilkText text="小灯泡" position={[0, 0.06, 0.28]} height={0.05} color="#c9d1d9" />

      <Terminal portIdx={0} position={TERM_LOCAL[0]} color="black" onHover={onTermHover} onClick={onTermClick} />
      <Terminal portIdx={1} position={TERM_LOCAL[1]} color="red" onHover={onTermHover} onClick={onTermClick} />
    </group>
  )
}
