/**
 * sandbox3d/stage.js — 实验台、地面、布光、阴影
 *
 * 深灰防静电台面 + 木纹工作台（可切换），三点布光 + ContactShadows，
 * 背景带一点纵深雾（不纯黑）。
 */

import { useMemo } from 'react'
import { ContactShadows } from '@react-three/drei'
import * as THREE from 'three'

/** 主光：5000K 暖白（方向光，投影） */
function Lights() {
  return (
    <>
      <ambientLight intensity={0.35} color="#ffffff" />
      <hemisphereLight args={['#cfe8ff', '#2b221c', 0.4]} />
      <directionalLight
        position={[6, 9, 5]}
        intensity={1.35}
        color="#ffe8c0"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={40}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-6, 5, -4]} intensity={0.45} color="#b3d9ff" />
      <directionalLight position={[0, 4, 6]} intensity={0.25} color="#dfe8ff" />
    </>
  )
}

/** 木纹工作台（可切换），台面顶面位于 y=0，器材直接落座 */
export function Workbench({ wood = true }) {
  const top = useMemo(() => {
    if (!wood) return null
    // 程序化木纹：用 CanvasTexture 画暖木色横纹，避免外挂贴图
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 512
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#a9744f'
    ctx.fillRect(0, 0, 512, 512)
    for (let i = 0; i < 60; i++) {
      ctx.strokeStyle = `rgba(${70 + Math.random() * 60},${40 + Math.random() * 30},${20 + Math.random() * 15},${0.12 + Math.random() * 0.25})`
      ctx.lineWidth = 1 + Math.random() * 4
      const y = Math.random() * 512
      ctx.beginPath()
      ctx.moveTo(0, y)
      for (let x = 0; x <= 512; x += 32) {
        ctx.lineTo(x, y + (Math.random() - 0.5) * 14)
      }
      ctx.stroke()
    }
    const t = new THREE.CanvasTexture(c)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(4, 3)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [wood])

  if (!wood) {
    return (
      <>
        {/* 灰色防静电整面台 */}
        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <planeGeometry args={[20, 14]} />
          <meshStandardMaterial color="#3a4046" roughness={0.92} metalness={0.03} />
        </mesh>
        <mesh position={[0, -0.14, 0]}>
          <boxGeometry args={[20, 0.28, 14]} />
          <meshStandardMaterial color="#2b3035" roughness={0.9} metalness={0.05} />
        </mesh>
      </>
    )
  }

  return (
    <group>
      {/* 木纹台面（顶面 y=0） */}
      <mesh receiveShadow position={[0, -0.08, 0]}>
        <boxGeometry args={[19, 0.16, 13]} />
        <meshStandardMaterial color="#8a5a35" roughness={0.7} metalness={0.05} />
      </mesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <planeGeometry args={[19, 13]} />
        <meshStandardMaterial map={top} roughness={0.55} metalness={0.04} />
      </mesh>
      {/* 深灰防静电台垫（铺在木台中央，器材的主要落座区） */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
        <planeGeometry args={[15, 9]} />
        <meshStandardMaterial color="#3c4248" roughness={0.9} metalness={0.04} />
      </mesh>
      {/* 桌腿 */}
      {[[-8.6, -5.6], [8.6, -5.6], [-8.6, 5.6], [8.6, 5.6]].map(([x, z], i) => (
        <mesh key={i} castShadow position={[x, -0.75, z]}>
          <boxGeometry args={[0.55, 1.35, 0.55]} />
          <meshStandardMaterial color="#6e4a2c" roughness={0.7} metalness={0.08} />
        </mesh>
      ))}
    </group>
  )
}

/** 台面落座阴影（drei ContactShadows） */
export function GroundShadows() {
  return (
    <ContactShadows
      position={[0, 0.012, 0]}
      opacity={0.6}
      scale={20}
      blur={2.4}
      far={5}
      resolution={1024}
      color="#000000"
    />
  )
}

/** 场景背景雾 + 环境光，合并在一个组件里方便挂到 Canvas */
export function Stage({ wood = true }) {
  return (
    <>
      <color attach="background" args={['#141a20']} />
      <fog attach="fog" args={['#141a20', 14, 34]} />
      <Lights />
      <Workbench wood={wood} />
      <GroundShadows />
    </>
  )
}
