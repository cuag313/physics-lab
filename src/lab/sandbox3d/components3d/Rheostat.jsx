/**
 * components3d/Rheostat.jsx — 50Ω 2A 瓷筒滑动变阻器（四接线柱）
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import { MAT, BasePlate, Terminal, SilkText } from './common.jsx'
import { TERM_LOCAL, WORLD_TO_UNIT } from '../model3d.js'
import { rheostatSliderX } from '../../render/parts.js'

export default function Rheostat3D({ comp = {}, onTermHover, onTermClick }) {
  const p = comp.props || {}
  const R = p.resistance ?? 20
  const maxR = p.maxR ?? 50
  // 2D 滑片 x（-26..26 世界单位）→ 3D
  const sliderX = rheostatSliderX(R, maxR) * WORLD_TO_UNIT

  const coilTex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 32
    const ctx = c.getContext('2d')
    // 铜色电阻丝：橙铜底 + 细密深棕线匝
    ctx.fillStyle = '#c9855a'
    ctx.fillRect(0, 0, 256, 32)
    for (let i = 0; i < 64; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#a05a30' : '#6f3a1c'
      ctx.fillRect(i * 4, 0, 2, 32)
    }
    const t = new THREE.CanvasTexture(c)
    t.wrapS = THREE.RepeatWrapping
    t.repeat.set(16, 1)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])

  return (
    <group>
      <BasePlate width={1.7} depth={0.6} topY={0.05} />

      {/* 两端金属支架 */}
      {[-0.42, 0.42].map((x) => (
        <group key={x}>
          <mesh castShadow position={[x, 0.16, 0]}>
            <boxGeometry args={[0.07, 0.22, 0.16]} />
            <meshStandardMaterial {...MAT.steel} />
          </mesh>
          <mesh castShadow position={[x, 0.34, 0]}>
            <boxGeometry args={[0.07, 0.1, 0.16]} />
            <meshStandardMaterial {...MAT.steel} />
          </mesh>
        </group>
      ))}

      {/* 瓷筒 */}
      <mesh castShadow receiveShadow position={[0, 0.2, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.13, 0.13, 0.9, 32]} />
        <meshStandardMaterial {...MAT.ceramic} />
      </mesh>
      {/* 密绕电阻丝（条纹贴图） */}
      <mesh position={[0, 0.2, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.135, 0.135, 0.9, 32]} />
        <meshStandardMaterial map={coilTex} roughness={0.5} metalness={0.35} />
      </mesh>
      {/* 端环 */}
      {[-0.45, 0.45].map((x) => (
        <mesh key={x} position={[x, 0.2, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.14, 0.14, 0.04, 24]} />
          <meshStandardMaterial {...MAT.brass} />
        </mesh>
      ))}

      {/* 金属滑杆 */}
      <mesh castShadow position={[0, 0.4, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.022, 0.022, 1.0, 16]} />
        <meshStandardMaterial {...MAT.steel} />
      </mesh>

      {/* 滑片（黑色胶木滑块 + 金属触点，压在电阻丝上） */}
      <group position={[sliderX, 0, 0]}>
        <mesh castShadow position={[0, 0.46, 0]}>
          <boxGeometry args={[0.15, 0.09, 0.19]} />
          <meshStandardMaterial {...MAT.bakeliteDark} />
        </mesh>
        <mesh castShadow position={[0, 0.4, 0]}>
          <boxGeometry args={[0.05, 0.1, 0.06]} />
          <meshStandardMaterial {...MAT.steel} />
        </mesh>
        {/* 触点弹簧片（压到电阻丝） */}
        <mesh position={[0, 0.31, 0]}>
          <boxGeometry args={[0.02, 0.12, 0.02]} />
          <meshStandardMaterial color="#c6cbd2" roughness={0.3} metalness={0.85} />
        </mesh>
      </group>

      <SilkText text={`${R}Ω`} position={[0, 0.55, 0]} height={0.08} color="#ffd8a8" />
      <SilkText text="50Ω 2A" position={[0, 0.09, 0.24]} height={0.06} color="#c9d1d9" />
      <SilkText text="滑动变阻器" position={[0, 0.045, 0.24]} height={0.05} color="#c9d1d9" />

      {/* 四接线柱：前面两个为电路端口（0/1），后面两个为额外端 */}
      <Terminal portIdx={0} position={TERM_LOCAL[0]} color="black" onHover={onTermHover} onClick={onTermClick} />
      <Terminal portIdx={1} position={TERM_LOCAL[1]} color="red" onHover={onTermHover} onClick={onTermClick} />
      <Terminal portIdx={2} position={[-0.6, 0.05, 0.24]} color="brass" />
      <Terminal portIdx={3} position={[0.6, 0.05, 0.24]} color="brass" />
    </group>
  )
}
