/**
 * ElectricInstruments3D — 拟物电学器材（R3F）
 *
 * 材质分层：塑料壳 / 金属端子 / 玻璃罩 / 陶瓷 / 发光
 * 每件仪器是一个独立组件，可拼进任意 3D 电路场景。
 */

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text, RoundedBox } from '@react-three/drei'
import * as THREE from 'three'

/* ---------- 共享材质 ---------- */
export const MAT = {
  blackPlastic: { color: '#1a1a1e', roughness: 0.45, metalness: 0.15 },
  darkPlastic: { color: '#2a2a32', roughness: 0.5, metalness: 0.1 },
  redPlastic: { color: '#c62828', roughness: 0.4, metalness: 0.1 },
  bluePlastic: { color: '#1565c0', roughness: 0.4, metalness: 0.1 },
  cream: { color: '#f5f0e6', roughness: 0.55, metalness: 0.05 },
  metal: { color: '#c0c6d0', roughness: 0.28, metalness: 0.92 },
  copper: { color: '#d4a574', roughness: 0.35, metalness: 0.85 },
  brass: { color: '#c9a227', roughness: 0.32, metalness: 0.9 },
  rubber: { color: '#222', roughness: 0.85, metalness: 0.02 },
  ceramic: { color: '#e8e0d4', roughness: 0.7, metalness: 0.05 },
  glassFace: { color: '#dfe9f5', roughness: 0.12, metalness: 0.08 },
}

function Metal({ children, ...props }) {
  return (
    <meshStandardMaterial {...MAT.metal} {...props}>
      {children}
    </meshStandardMaterial>
  )
}

/* ---------- 端子（接线柱） ---------- */
export function Terminal({ position = [0, 0, 0], color = '#d4a574', height = 0.12 }) {
  return (
    <group position={position}>
      <mesh castShadow position={[0, height / 2, 0]}>
        <cylinderGeometry args={[0.045, 0.055, height, 20]} />
        <meshStandardMaterial {...MAT.metal} color={color} />
      </mesh>
      <mesh castShadow position={[0, height + 0.02, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.04, 20]} />
        <meshStandardMaterial {...MAT.brass} />
      </mesh>
    </group>
  )
}

/* ---------- 电池 ---------- */
export function Battery3D({ position = [0, 0, 0], voltage = 3, onClick }) {
  return (
    <group position={position} onClick={onClick}>
      {/* 底座橡胶脚 */}
      <mesh castShadow receiveShadow position={[0, 0.03, 0]}>
        <boxGeometry args={[1.35, 0.06, 0.72]} />
        <meshStandardMaterial {...MAT.rubber} />
      </mesh>
      {/* 主体 */}
      <RoundedBox castShadow receiveShadow args={[1.3, 0.38, 0.68]} radius={0.05} position={[0, 0.26, 0]}>
        <meshStandardMaterial {...MAT.blackPlastic} />
      </RoundedBox>
      {/* 顶部面板 */}
      <mesh castShadow position={[0, 0.46, 0]}>
        <boxGeometry args={[1.22, 0.04, 0.6]} />
        <meshStandardMaterial color="#2c2c34" roughness={0.4} metalness={0.2} />
      </mesh>
      {/* 电压标签条 */}
      <mesh position={[0, 0.28, 0.35]}>
        <planeGeometry args={[0.9, 0.16]} />
        <meshStandardMaterial color="#e53935" roughness={0.5} />
      </mesh>
      <Text position={[0, 0.28, 0.355]} fontSize={0.1} color="#fff" anchorX="center" anchorY="middle">
        {`${voltage.toFixed(1)}V`}
      </Text>
      {/* 极性标记 */}
      <Text position={[0.5, 0.52, 0]} fontSize={0.14} color="#ef5350" anchorX="center">
        +
      </Text>
      <Text position={[-0.5, 0.52, 0]} fontSize={0.14} color="#64b5f6" anchorX="center">
        −
      </Text>
      {/* 端子 */}
      <Terminal position={[0.48, 0.48, 0]} color="#e57373" />
      <Terminal position={[-0.48, 0.48, 0]} color="#64b5f6" />
    </group>
  )
}

/* ---------- 小灯泡 ---------- */
export function Bulb3D({ position = [0, 0, 0], brightness = 0, onClick }) {
  const lightRef = useRef()
  const glow = THREE.MathUtils.clamp(brightness, 0, 1)

  useFrame((_, dt) => {
    if (lightRef.current) {
      const target = 0.15 + glow * 2.8
      lightRef.current.intensity += (target - lightRef.current.intensity) * Math.min(1, dt * 6)
    }
  })

  return (
    <group position={position} onClick={onClick}>
      {/* 木纹/胶木底座 */}
      <mesh castShadow receiveShadow position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.28, 0.32, 0.16, 32]} />
        <meshStandardMaterial color="#3e2723" roughness={0.7} metalness={0.15} />
      </mesh>
      {/* 金属灯头螺纹 */}
      <mesh castShadow position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.16, 0.18, 0.12, 24]} />
        <meshStandardMaterial {...MAT.metal} />
      </mesh>
      <mesh castShadow position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.12, 0.14, 0.06, 24]} />
        <meshStandardMaterial {...MAT.copper} />
      </mesh>
      {/* 玻璃泡 */}
      <mesh castShadow position={[0, 0.52, 0]}>
        <sphereGeometry args={[0.26, 32, 32]} />
        <meshPhysicalMaterial
          color={glow > 0.05 ? '#fff2c0' : '#e3f2fd'}
          transmission={0.85}
          thickness={0.35}
          roughness={0.08}
          metalness={0}
          transparent
          opacity={glow > 0.05 ? 0.55 + glow * 0.35 : 0.35}
          emissive={glow > 0.05 ? '#ffc107' : '#000'}
          emissiveIntensity={glow * 2.2}
        />
      </mesh>
      {/* 灯丝 */}
      <mesh position={[0, 0.52, 0]}>
        <torusGeometry args={[0.06, 0.012, 8, 24]} />
        <meshStandardMaterial
          color={glow > 0.05 ? '#fff59d' : '#795548'}
          emissive={glow > 0.05 ? '#ffeb3b' : '#000'}
          emissiveIntensity={glow * 3}
          metalness={0.6}
          roughness={0.3}
        />
      </mesh>
      {/* 点光源 */}
      <pointLight
        ref={lightRef}
        position={[0, 0.55, 0]}
        color="#ffe082"
        intensity={0.2}
        distance={6}
        decay={1.6}
        castShadow
      />
      {/* 光晕环 */}
      {glow > 0.08 && (
        <mesh position={[0, 0.52, 0]}>
          <sphereGeometry args={[0.26 + glow * 0.22, 16, 16]} />
          <meshBasicMaterial color="#ffc107" transparent opacity={glow * 0.12} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}

/* ---------- 开关（单刀单掷） ---------- */
export function Switch3D({ position = [0, 0, 0], closed = true, onToggle }) {
  const leverRef = useRef()
  const targetAngle = closed ? 0 : -0.55

  useFrame((_, dt) => {
    if (!leverRef.current) return
    const t = leverRef.current.rotation.z
    leverRef.current.rotation.z = t + (targetAngle - t) * Math.min(1, dt * 10)
  })

  return (
    <group position={position} onClick={(e) => { e.stopPropagation(); onToggle?.() }}>
      {/* 陶瓷/胶木底板 */}
      <mesh castShadow receiveShadow position={[0, 0.05, 0]}>
        <boxGeometry args={[1.1, 0.1, 0.55]} />
        <meshStandardMaterial {...MAT.cream} />
      </mesh>
      {/* 金属底板边框 */}
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[1.18, 0.03, 0.62]} />
        <meshStandardMaterial {...MAT.metal} />
      </mesh>
      {/* 左右接线柱 */}
      <Terminal position={[-0.42, 0.1, 0]} color="#d4a574" height={0.1} />
      <Terminal position={[0.42, 0.1, 0]} color="#d4a574" height={0.1} />
      {/* 刀闸转轴 */}
      <mesh castShadow position={[0, 0.18, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.14, 16]} />
        <meshStandardMaterial {...MAT.metal} />
      </mesh>
      {/* 闸刀 */}
      <group ref={leverRef} position={[-0.42, 0.2, 0]}>
        <mesh castShadow position={[0.42, 0, 0]}>
          <boxGeometry args={[0.84, 0.035, 0.1]} />
          <meshStandardMaterial color="#b0bec5" metalness={0.85} roughness={0.3} />
        </mesh>
        {/* 手柄胶木 */}
        <mesh castShadow position={[0.82, 0, 0]}>
          <boxGeometry args={[0.18, 0.07, 0.14]} />
          <meshStandardMaterial color="#4e342e" roughness={0.6} />
        </mesh>
      </group>
      <Text position={[0, 0.28, 0.32]} fontSize={0.1} color="#5d4037" anchorX="center">
        {closed ? '通' : '断'}
      </Text>
    </group>
  )
}

/* ---------- 电表（电流表 / 电压表） ---------- */
export function Meter3D({
  position = [0, 0, 0],
  kind = 'A',
  reading = 0,
  range = 3,
  onClick,
}) {
  const needleRef = useRef()
  // 指针：-120° ~ +120°
  const target = THREE.MathUtils.clamp(Math.abs(reading) / (range || 1), 0, 1)
  const targetAngle = (-Math.PI * 0.65) + target * (Math.PI * 1.3)

  useFrame((_, dt) => {
    if (!needleRef.current) return
    const z = needleRef.current.rotation.z
    needleRef.current.rotation.z = z + (targetAngle - z) * Math.min(1, dt * 7)
  })

  const faceColor = kind === 'A' ? '#1b5e20' : '#0d47a1'
  const label = kind === 'A' ? 'A' : 'V'

  return (
    <group position={position} onClick={onClick}>
      {/* 金属支架脚 */}
      <mesh castShadow receiveShadow position={[0, 0.04, 0]}>
        <boxGeometry args={[0.78, 0.08, 0.42]} />
        <meshStandardMaterial {...MAT.metal} />
      </mesh>
      {/* 表壳 */}
      <mesh castShadow receiveShadow position={[0, 0.52, 0]} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[0.42, 0.42, 0.22, 48]} />
        <meshStandardMaterial color="#1a237e" roughness={0.4} metalness={0.35} />
      </mesh>
      {/* 表圈 */}
      <mesh position={[0, 0.64, 0]}>
        <torusGeometry args={[0.38, 0.035, 12, 48]} />
        <meshStandardMaterial {...MAT.brass} />
      </mesh>
      {/* 表盘玻璃 + 刻度盘 */}
      <mesh position={[0, 0.645, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.36, 48]} />
        <meshStandardMaterial color={faceColor} roughness={0.25} metalness={0.1} />
      </mesh>
      {/* 玻璃反光层 */}
      <mesh position={[0, 0.66, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.36, 48]} />
        <meshPhysicalMaterial
          color="#ffffff"
          transparent
          opacity={0.12}
          roughness={0.05}
          metalness={0.05}
          transmission={0.3}
        />
      </mesh>
      {/* 刻度线 */}
      {Array.from({ length: 11 }).map((_, i) => {
        const a = (-Math.PI * 0.65) + (i / 10) * (Math.PI * 1.3)
        const x = Math.sin(a) * 0.28
        const y = 0.67
        const z = -Math.cos(a) * 0.28
        return (
          <mesh key={i} position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.012, i % 5 === 0 ? 0.08 : 0.045]} />
            <meshBasicMaterial color="#eceff1" />
          </mesh>
        )
      })}
      {/* 指针 */}
      <group ref={needleRef} position={[0, 0.68, 0]} rotation={[0, 0, 0]}>
        <mesh position={[0, 0, -0.15]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.018, 0.3]} />
          <meshBasicMaterial color="#ff5252" side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.035, 16]} />
          <meshBasicMaterial color="#fafafa" />
        </mesh>
      </group>
      {/* 单位字母 */}
      <Text position={[0, 0.7, 0.12]} fontSize={0.12} color="#e3f2fd" anchorX="center" rotation={[-Math.PI / 2, 0, 0]}>
        {label}
      </Text>
      {/* 端子 */}
      <Terminal position={[0.32, 0.1, 0.18]} color="#e57373" height={0.1} />
      <Terminal position={[-0.32, 0.1, 0.18]} color="#64b5f6" height={0.1} />
    </group>
  )
}

/* ---------- 定值电阻（色环） ---------- */
export function Resistor3D({ position = [0, 0, 0], ohms = 10 }) {
  const bands = useMemo(() => {
    // 简化四色环
    const palette = ['#000', '#4e342e', '#e53935', '#ff9800', '#fdd835', '#4caf50', '#2196f3', '#7e57c2', '#9e9e9e', '#fff']
    const d = Math.max(0, Math.min(9, Math.floor(Math.log10(Math.max(1, ohms)))))
    return [palette[d], palette[Math.min(9, d + 1)], '#c62828', '#c9a227']
  }, [ohms])

  return (
    <group position={position}>
      {/* 引线 */}
      <mesh castShadow position={[0, 0.18, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.018, 0.018, 1.15, 12]} />
        <meshStandardMaterial {...MAT.copper} />
      </mesh>
      {/* 陶瓷管 */}
      <mesh castShadow receiveShadow position={[0, 0.18, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.12, 0.12, 0.72, 28]} />
        <meshStandardMaterial {...MAT.ceramic} />
      </mesh>
      {/* 色环 */}
      {bands.map((c, i) => (
        <mesh key={i} position={[-0.22 + i * 0.11, 0.18, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.125, 0.125, 0.035, 28]} />
          <meshStandardMaterial color={c} roughness={0.45} />
        </mesh>
      ))}
      <Text position={[0, 0.36, 0]} fontSize={0.1} color="#5d4037" anchorX="center">
        {`${ohms}Ω`}
      </Text>
    </group>
  )
}

/* ---------- 滑动变阻器 ---------- */
export function Rheostat3D({ position = [0, 0, 0], slider = 0.5, onSlider }) {
  const sliderRef = useRef()

  useFrame(() => {
    if (sliderRef.current) {
      const x = -0.55 + slider * 1.1
      sliderRef.current.position.x += (x - sliderRef.current.position.x) * 0.2
    }
  })

  return (
    <group position={position}>
      {/* 底座 */}
      <mesh castShadow receiveShadow position={[0, 0.05, 0]}>
        <boxGeometry args={[1.55, 0.1, 0.55]} />
        <meshStandardMaterial color="#37474f" roughness={0.55} metalness={0.2} />
      </mesh>
      {/* 陶瓷线绕管 */}
      <mesh castShadow position={[0, 0.28, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.16, 0.16, 1.2, 32]} />
        <meshStandardMaterial {...MAT.ceramic} />
      </mesh>
      {/* 绕线纹理 */}
      {Array.from({ length: 18 }).map((_, i) => (
        <mesh key={i} position={[-0.55 + i * 0.065, 0.28, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.162, 0.008, 6, 20]} />
          <meshStandardMaterial color="#8d6e63" metalness={0.4} roughness={0.5} />
        </mesh>
      ))}
      {/* 金属杆 */}
      <mesh castShadow position={[0, 0.55, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.035, 0.035, 1.3, 16]} />
        <meshStandardMaterial {...MAT.metal} />
      </mesh>
      {/* 支架 */}
      {[-0.55, 0.55].map((x) => (
        <mesh key={x} castShadow position={[x, 0.4, 0]}>
          <boxGeometry args={[0.08, 0.35, 0.08]} />
          <meshStandardMaterial {...MAT.metal} />
        </mesh>
      ))}
      {/* 滑片 */}
      <group ref={sliderRef} position={[0, 0, 0]}>
        <mesh castShadow position={[0, 0.42, 0]}>
          <boxGeometry args={[0.18, 0.12, 0.22]} />
          <meshStandardMaterial color="#c62828" metalness={0.35} roughness={0.4} />
        </mesh>
        <mesh castShadow position={[0, 0.55, 0]}>
          <boxGeometry args={[0.06, 0.12, 0.08]} />
          <meshStandardMaterial {...MAT.metal} />
        </mesh>
        <Text position={[0, 0.72, 0]} fontSize={0.1} color="#c62828" anchorX="center">
          ⇔
        </Text>
      </group>
      {/* 端子 */}
      <Terminal position={[0.72, 0.1, 0]} color="#d4a574" height={0.1} />
      <Terminal position={[-0.72, 0.1, 0]} color="#d4a574" height={0.1} />
      <Terminal position={[0.72, 0.1, 0.28]} color="#d4a574" height={0.1} />
    </group>
  )
}

/* ---------- 导线（曲线管） ---------- */
export function Wire3D({ points = [], color = '#e53935', radius = 0.028 }) {
  const curve = useMemo(() => {
    if (points.length < 2) return null
    const pts = points.map((p) => new THREE.Vector3(p[0], p[1], p[2]))
    // 轻微下垂
    if (pts.length === 2) {
      const mid = pts[0].clone().add(pts[1]).multiplyScalar(0.5)
      mid.y -= 0.12
      return new THREE.CatmullRomCurve3([pts[0], mid, pts[1]])
    }
    return new THREE.CatmullRomCurve3(pts)
  }, [points])

  if (!curve) return null

  return (
    <mesh castShadow>
      <tubeGeometry args={[curve, 24, radius, 8, false]} />
      <meshStandardMaterial color={color} roughness={0.45} metalness={0.35} />
    </mesh>
  )
}

/* ---------- 实验台面 ---------- */
export function LabTable({ size = [8, 5] }) {
  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[size[0], size[1]]} />
        <meshStandardMaterial color="#2b221c" roughness={0.9} metalness={0.05} />
      </mesh>
      {/* 台面厚度 */}
      <mesh receiveShadow position={[0, -0.08, 0]}>
        <boxGeometry args={[size[0], 0.16, size[1]]} />
        <meshStandardMaterial color="#1a1410" roughness={0.85} />
      </mesh>
    </group>
  )
}
