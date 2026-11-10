/**
 * simple3d/equipment.jsx — 简单电路 3D 器材（对齐 NB 物理实验参考图 v2）
 *
 * 共性：薄窄斜面底座 + 镀铬圆盘接线柱 + 矮胖滚花螺帽（红=正、黑=负）+ 机制件浅银灰（无黄铜）。
 *   - 单向开关：粗圆杆闸刀 + 黑色粗圆柄 + 铰链/斜口静触柱（图 1）
 *   - 灯泡：白瓷罐口灯座 + 大球形铬感玻璃泡 + 双支架钨丝（图 2）
 *   - 电源：托盘 + 两节加长横放电池 + ± 丝印（图 3）
 *   - 电阻：瓷瓶/腰鼓轮廓 + 三色环（图 4）
 *   - 滑线变阻器：大法兰盘 + 细密绕线瓷管 + 导杆滑座 + 四柱（图 5）
 */

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Ammeter3D, Voltmeter3D, METER_TERMS } from './Meters3d.jsx'

export const C3 = {
  base: '#e4e7ea',
  baseTop: '#eef0f2',
  rod: '#d8dce0',
  grip: '#2a2d31',
  gray: '#c8cdd3',
  grayDark: '#aeb4bb',
  chrome: '#cfd4da',
  chromeDark: '#b9bfc6',
  capRed: '#d13b2e',
  capBlack: '#22252a',
  socket: '#f2f3f5',
  glass: '#dfe8f0',
  cellBody: '#3a3e45',
  cellBand: '#c8814a',
  cellNub: '#c5c9cf',
  ceramic: '#ecdfc7',
  leg: '#c5c9cf',
  slider: '#2e3136',
}

/** 导线锚点（≈螺帽中段高度）：黑柱=左/负，红柱=右/正 */
export const TERMS3 = {
  switch: [[-0.86, 0.25, 0], [0.86, 0.25, 0]],
  bulb: [[-0.86, 0.25, 0], [0.86, 0.25, 0]],
  battery: [[-0.86, 0.25, 0], [0.86, 0.25, 0]],
  resistor: [[-0.86, 0.25, 0], [0.86, 0.25, 0]],
  // 滑线变阻器「一上一下」：左下 + 右上
  rheostat: [[-0.88, 0.3, 0], [0.88, 0.77, 0]],
  // 电表三柱：左 −黑 / 中小量程红 / 右大量程红（J0407/J0408）
  ammeter: METER_TERMS,
  voltmeter: METER_TERMS,
}
export const termsFor = (type) => TERMS3[type] || TERMS3.switch

/* ───────────── 接线柱：镀铬圆盘 + 矮胖滚花螺帽 ───────────── */
function Post({ color, position, scale = 1 }) {
  return (
    <group position={position} scale={scale}>
      {/* 镀铬圆盘底座 */}
      <mesh castShadow position={[0, 0.024, 0]}>
        <cylinderGeometry args={[0.165, 0.188, 0.048, 30]} />
        <meshStandardMaterial color={C3.chrome} roughness={0.22} metalness={0.85} />
      </mesh>
      {/* 铬颈圈 */}
      <mesh castShadow position={[0, 0.063, 0]}>
        <cylinderGeometry args={[0.112, 0.13, 0.032, 24]} />
        <meshStandardMaterial color={C3.chromeDark} roughness={0.28} metalness={0.82} />
      </mesh>
      {/* 滚花螺帽（棱面模拟竖纹） */}
      <mesh castShadow position={[0, 0.152, 0]}>
        <cylinderGeometry args={[0.13, 0.143, 0.145, 14]} />
        <meshStandardMaterial color={color} roughness={0.38} metalness={0.12} />
      </mesh>
      {/* 浅圆顶 */}
      <mesh castShadow position={[0, 0.213, 0]} scale={[1, 0.55, 1]}>
        <sphereGeometry args={[0.132, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={color} roughness={0.38} metalness={0.12} />
      </mesh>
    </group>
  )
}

/* ───────────── 薄窄斜面底座 ───────────── */
function SlabBase({ width = 2.1, depth = 0.62, children }) {
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.038, 0]}>
        <boxGeometry args={[width, 0.076, depth]} />
        <meshStandardMaterial color={C3.base} roughness={0.42} metalness={0.08} />
      </mesh>
      <mesh castShadow position={[0, 0.085, 0]}>
        <boxGeometry args={[width - 0.12, 0.022, depth - 0.09]} />
        <meshStandardMaterial color={C3.baseTop} roughness={0.38} metalness={0.08} />
      </mesh>
      {children}
    </group>
  )
}

/* 底座前缘彩色短划条（图 1 风格） */
function DashStrip({ depth = 0.62 }) {
  const cols = ['#2aa5a5', '#4caf50', '#cddc39', '#e53935']
  return (
    <group>
      {cols.map((c, i) => (
        <mesh key={c} position={[-0.21 + i * 0.14, 0.032, depth / 2 + 0.003]}>
          <boxGeometry args={[0.115, 0.016, 0.008]} />
          <meshBasicMaterial color={c} />
        </mesh>
      ))}
    </group>
  )
}

/* ───────────── 单向开关（图 1） ───────────── */
export function KnifeSwitch3D({ closed = false }) {
  const leverRef = useRef()
  const target = closed ? 0 : 0.5

  useFrame((_, dt) => {
    if (!leverRef.current) return
    const z = leverRef.current.rotation.z
    leverRef.current.rotation.z = z + (target - z) * Math.min(1, dt * 9)
  })

  return (
    <SlabBase>
      <DashStrip />
      {/* 底部细连杆 */}
      <mesh position={[-0.1, 0.155, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.026, 0.026, 1.12, 12]} />
        <meshStandardMaterial color={C3.grayDark} roughness={0.3} metalness={0.7} />
      </mesh>

      {/* 铰链座（浅银灰） */}
      <mesh castShadow position={[-0.62, 0.235, 0]}>
        <boxGeometry args={[0.21, 0.28, 0.17]} />
        <meshStandardMaterial color={C3.gray} roughness={0.35} metalness={0.35} />
      </mesh>
      <mesh castShadow position={[-0.62, 0.355, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.038, 0.038, 0.24, 14]} />
        <meshStandardMaterial color={C3.chromeDark} roughness={0.25} metalness={0.8} />
      </mesh>

      {/* 闸刀：粗圆杆 + 黑色粗圆柄（绕铰链旋转） */}
      <group ref={leverRef} position={[-0.62, 0.47, 0]}>
        <mesh castShadow position={[0.61, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.095, 0.095, 1.22, 22]} />
          <meshStandardMaterial color={C3.rod} roughness={0.3} metalness={0.3} />
        </mesh>
        <mesh castShadow position={[1.48, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.15, 0.15, 0.52, 22]} />
          <meshStandardMaterial color={C3.grip} roughness={0.42} metalness={0.1} />
        </mesh>
        <mesh castShadow position={[1.745, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <sphereGeometry args={[0.15, 18, 12]} />
          <meshStandardMaterial color={C3.grip} roughness={0.42} metalness={0.1} />
        </mesh>
      </group>

      {/* 静触柱（圆顶柱 + 斜口夹片） */}
      <mesh castShadow position={[0.42, 0.245, 0]}>
        <boxGeometry args={[0.17, 0.29, 0.15]} />
        <meshStandardMaterial color={C3.gray} roughness={0.35} metalness={0.35} />
      </mesh>
      <mesh castShadow position={[0.42, 0.415, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.075, 0.075, 0.15, 20]} />
        <meshStandardMaterial color={C3.gray} roughness={0.32} metalness={0.38} />
      </mesh>
      {/* 斜口夹片 */}
      <mesh position={[0.42, 0.455, 0.075]} rotation={[0.28, 0, 0]}>
        <boxGeometry args={[0.13, 0.1, 0.022]} />
        <meshStandardMaterial color={C3.grayDark} roughness={0.32} metalness={0.45} />
      </mesh>
      <mesh position={[0.42, 0.455, -0.075]} rotation={[-0.28, 0, 0]}>
        <boxGeometry args={[0.13, 0.1, 0.022]} />
        <meshStandardMaterial color={C3.grayDark} roughness={0.32} metalness={0.45} />
      </mesh>

      <Post color={C3.capBlack} position={[-0.86, 0.096, 0]} />
      <Post color={C3.capRed} position={[0.86, 0.096, 0]} />
    </SlabBase>
  )
}

/* ───────────── 灯泡（图 2）：白瓷罐口灯座 + 大铬感玻璃球 ───────────── */
export function BulbSocket3D({ lit = false, glow = 0 }) {
  const lightRef = useRef()
  const g = Math.max(0, Math.min(1, glow))

  useFrame((_, dt) => {
    if (!lightRef.current) return
    const target = lit ? 1.2 + g * 3 : 0
    lightRef.current.intensity += (target - lightRef.current.intensity) * Math.min(1, dt * 6)
  })

  const filColor = lit ? '#fff3b0' : '#33373d'
  const filEmissive = lit ? '#ffcc44' : '#000'

  return (
    <SlabBase>
      {/* 橙色前缘带（图 2） */}
      <mesh position={[0, 0.038, 0.313]}>
        <boxGeometry args={[2.05, 0.052, 0.008]} />
        <meshStandardMaterial color="#f5a623" roughness={0.4} metalness={0.05} />
      </mesh>

      {/* 白瓷罐口灯座 */}
      <mesh castShadow position={[0, 0.135, 0]}>
        <cylinderGeometry args={[0.32, 0.355, 0.08, 36]} />
        <meshStandardMaterial color={C3.socket} roughness={0.32} metalness={0.05} />
      </mesh>
      <mesh castShadow position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.245, 0.285, 0.26, 36]} />
        <meshStandardMaterial color={C3.socket} roughness={0.32} metalness={0.05} />
      </mesh>
      {/* 座口圆环 */}
      <mesh castShadow position={[0, 0.435, 0]}>
        <torusGeometry args={[0.235, 0.022, 10, 36]} />
        <meshStandardMaterial color="#e8eaee" roughness={0.3} metalness={0.08} />
      </mesh>

      {/* 大球形玻璃泡（铬感） */}
      <mesh castShadow position={[0, 0.88, 0]}>
        <sphereGeometry args={[0.47, 42, 30]} />
        <meshPhysicalMaterial
          color={C3.glass}
          transparent
          opacity={0.4}
          roughness={0.03}
          metalness={0.35}
          transmission={0.45}
          thickness={0.5}
          ior={1.45}
          emissive={lit ? '#ffc107' : '#000'}
          emissiveIntensity={g * 0.5}
        />
      </mesh>

      {/* 泡内：玻珠芯柱 + 粗双支架 + 粗钨丝线圈 */}
      <group position={[0, 0.62, 0]}>
        <mesh>
          <cylinderGeometry args={[0.05, 0.075, 0.2, 14]} />
          <meshStandardMaterial color="#cfd6dc" roughness={0.28} metalness={0.12} transparent opacity={0.72} />
        </mesh>
        <mesh position={[0, 0.13, 0]}>
          <sphereGeometry args={[0.085, 14, 12]} />
          <meshStandardMaterial color="#cfd6dc" roughness={0.25} metalness={0.12} transparent opacity={0.72} />
        </mesh>
        <mesh position={[-0.085, 0.28, 0]} rotation={[0, 0, 0.15]}>
          <cylinderGeometry args={[0.017, 0.017, 0.38, 10]} />
          <meshStandardMaterial color="#a8afb8" roughness={0.3} metalness={0.8} />
        </mesh>
        <mesh position={[0.085, 0.28, 0]} rotation={[0, 0, -0.15]}>
          <cylinderGeometry args={[0.017, 0.017, 0.38, 10]} />
          <meshStandardMaterial color="#a8afb8" roughness={0.3} metalness={0.8} />
        </mesh>
        {/* 钨丝粗线圈 */}
        {[-0.068, -0.023, 0.023, 0.068].map((x) => (
          <mesh key={x} position={[x, 0.48, 0]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.052, 0.015, 10, 18]} />
            <meshStandardMaterial
              color={filColor}
              emissive={filEmissive}
              emissiveIntensity={lit ? 1.7 + g : 0}
              metalness={0.45}
              roughness={0.4}
            />
          </mesh>
        ))}
      </group>

      {lit && (
        <mesh position={[0, 0.88, 0]}>
          <sphereGeometry args={[0.6 + g * 0.24, 16, 16]} />
          <meshBasicMaterial color="#ffc846" transparent opacity={g * 0.1} depthWrite={false} />
        </mesh>
      )}
      <pointLight ref={lightRef} position={[0, 0.88, 0]} color="#ffe082" intensity={0} distance={5} decay={1.8} />

      <Post color={C3.capBlack} position={[-0.86, 0.096, 0]} />
      <Post color={C3.capRed} position={[0.86, 0.096, 0]} />
    </SlabBase>
  )
}

/* ───────────── 电源（图 3）：托盘 + 两节加长横放电池 ───────────── */
export function BatteryCell3D() {
  return (
    <SlabBase>
      {/* 蓝点（图 3） */}
      <mesh position={[0.62, 0.097, 0.2]}>
        <cylinderGeometry args={[0.022, 0.022, 0.012, 12]} />
        <meshBasicMaterial color="#2962ff" />
      </mesh>

      {/* 浅托盘 + 薄端片 */}
      <mesh castShadow receiveShadow position={[0, 0.125, 0]}>
        <boxGeometry args={[1.52, 0.06, 0.56]} />
        <meshStandardMaterial color={C3.baseTop} roughness={0.42} metalness={0.08} />
      </mesh>
      {[-0.7, 0.7].map((x) => (
        <mesh key={x} castShadow position={[x, 0.26, 0]}>
          <boxGeometry args={[0.038, 0.22, 0.42]} />
          <meshStandardMaterial color={C3.base} roughness={0.42} metalness={0.1} />
        </mesh>
      ))}

      {/* 两节电池（加长、加粗，占底座约 85%） */}
      <group position={[0, 0.385, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} position={[-0.63, 0, 0]}>
          <cylinderGeometry args={[0.052, 0.052, 0.06, 12]} />
          <meshStandardMaterial color={C3.cellNub} roughness={0.3} metalness={0.8} />
        </mesh>
        {/* A 节筒体（印 −） */}
        <mesh castShadow rotation={[0, 0, Math.PI / 2]} position={[-0.365, 0, 0]}>
          <cylinderGeometry args={[0.23, 0.23, 0.47, 30]} />
          <meshStandardMaterial color={C3.cellBody} roughness={0.4} metalness={0.32} />
        </mesh>
        <mesh position={[-0.42, 0.065, 0.222]}>
          <boxGeometry args={[0.115, 0.026, 0.012]} />
          <meshStandardMaterial color="#eef0f2" roughness={0.45} metalness={0.05} />
        </mesh>
        {/* A 节铜环 */}
        <mesh rotation={[0, 0, Math.PI / 2]} position={[-0.065, 0, 0]}>
          <cylinderGeometry args={[0.239, 0.239, 0.13, 30]} />
          <meshStandardMaterial color={C3.cellBand} roughness={0.38} metalness={0.42} />
        </mesh>
        {/* 中间接触点 */}
        <mesh rotation={[0, 0, Math.PI / 2]} position={[0.028, 0, 0]}>
          <cylinderGeometry args={[0.048, 0.048, 0.055, 12]} />
          <meshStandardMaterial color={C3.cellNub} roughness={0.3} metalness={0.8} />
        </mesh>
        {/* B 节筒体 */}
        <mesh castShadow rotation={[0, 0, Math.PI / 2]} position={[0.29, 0, 0]}>
          <cylinderGeometry args={[0.23, 0.23, 0.47, 30]} />
          <meshStandardMaterial color={C3.cellBody} roughness={0.4} metalness={0.32} />
        </mesh>
        {/* B 节铜环（印 +） */}
        <mesh rotation={[0, 0, Math.PI / 2]} position={[0.59, 0, 0]}>
          <cylinderGeometry args={[0.239, 0.239, 0.13, 30]} />
          <meshStandardMaterial color={C3.cellBand} roughness={0.38} metalness={0.42} />
        </mesh>
        <mesh position={[0.59, 0.075, 0.233]}>
          <boxGeometry args={[0.1, 0.024, 0.012]} />
          <meshStandardMaterial color="#eef0f2" roughness={0.45} metalness={0.05} />
        </mesh>
        <mesh position={[0.59, 0.075, 0.234]}>
          <boxGeometry args={[0.024, 0.1, 0.012]} />
          <meshStandardMaterial color="#eef0f2" roughness={0.45} metalness={0.05} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} position={[0.678, 0, 0]}>
          <cylinderGeometry args={[0.052, 0.052, 0.05, 12]} />
          <meshStandardMaterial color={C3.cellNub} roughness={0.3} metalness={0.8} />
        </mesh>
      </group>

      <Post color={C3.capBlack} position={[-0.86, 0.096, 0]} />
      <Post color={C3.capRed} position={[0.86, 0.096, 0]} />
    </SlabBase>
  )
}

/* ───────────── 电阻（图 4）：瓷瓶/腰鼓轮廓 + 三色环 ───────────── */
export function Resistor3D() {
  return (
    <SlabBase>
      <DashStrip />
      {/* 瓷瓶轮廓：尖头 → 鼓腹 → 收腰（色环）→ 鼓腹 → 尖头 */}
      {[-1, 1].map((s) => (
        <group key={s}>
          {/* 引线尖头 */}
          <mesh castShadow position={[s * 0.475, 0.3, 0]} rotation={[0, 0, s * Math.PI / 2]}>
            <cylinderGeometry args={[0.03, 0.085, 0.1, 18]} />
            <meshStandardMaterial color={C3.ceramic} roughness={0.3} metalness={0.06} />
          </mesh>
          {/* 鼓腹 */}
          <mesh castShadow position={[s * 0.335, 0.3, 0]}>
            <sphereGeometry args={[0.195, 24, 18]} />
            <meshStandardMaterial color={C3.ceramic} roughness={0.28} metalness={0.06} />
          </mesh>
          {/* 肩部收窄 */}
          <mesh castShadow position={[s * 0.175, 0.3, 0]} rotation={[0, 0, s * Math.PI / 2]}>
            <cylinderGeometry args={[0.195, 0.138, 0.12, 22]} />
            <meshStandardMaterial color={C3.ceramic} roughness={0.28} metalness={0.06} />
          </mesh>
          {/* 引线 */}
          <mesh castShadow position={[s * 0.685, 0.3, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.023, 0.023, 0.32, 10]} />
            <meshStandardMaterial color={C3.chromeDark} roughness={0.28} metalness={0.8} />
          </mesh>
        </group>
      ))}
      {/* 收腰中段 */}
      <mesh castShadow position={[0, 0.3, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.138, 0.138, 0.26, 24]} />
        <meshStandardMaterial color={C3.ceramic} roughness={0.28} metalness={0.06} />
      </mesh>
      {/* 三色环 */}
      {[
        [-0.085, '#4a2516'],
        [0, '#181818'],
        [0.085, '#b71c1c'],
      ].map(([x, col]) => (
        <mesh key={x} position={[x, 0.3, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.146, 0.146, 0.062, 24]} />
          <meshStandardMaterial color={col} roughness={0.38} metalness={0.08} />
        </mesh>
      ))}

      <Post color={C3.capBlack} position={[-0.86, 0.096, 0]} />
      <Post color={C3.capRed} position={[0.86, 0.096, 0]} />
    </SlabBase>
  )
}

/* ───────────── 滑线变阻器（图 5）：大法兰 + 细密绕线 + 导杆滑座 ───────────── */
function useWindingTexture() {
  return useMemo(() => {
    if (typeof document === 'undefined') return null
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 32
    const m = c.getContext('2d')
    m.fillStyle = '#aeb4bc'
    m.fillRect(0, 0, 256, 32)
    m.fillStyle = '#7d858e'
    for (let x = 0; x < 256; x += 3) m.fillRect(x, 0, 1.3, 32)
    const t = new THREE.CanvasTexture(c)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(46, 1)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
}

export function Rheostat3D({ slide = 0.2, onSlideDown }) {
  const winding = useWindingTexture()
  const sx = -0.62 + Math.max(0, Math.min(1, slide)) * 1.24

  return (
    <group>
      {/* 宽扁斜板支架腿 */}
      {[-0.82, 0.82].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh castShadow position={[-0.135, 0.235, 0]} rotation={[0, 0, 0.36]}>
            <boxGeometry args={[0.055, 0.52, 0.32]} />
            <meshStandardMaterial color={C3.leg} roughness={0.4} metalness={0.4} />
          </mesh>
          <mesh castShadow position={[0.135, 0.235, 0]} rotation={[0, 0, -0.36]}>
            <boxGeometry args={[0.055, 0.52, 0.32]} />
            <meshStandardMaterial color={C3.leg} roughness={0.4} metalness={0.4} />
          </mesh>
          {/* 顶梁（托法兰与导杆支座） */}
          <mesh castShadow position={[0, 0.5, 0]}>
            <boxGeometry args={[0.34, 0.06, 0.34]} />
            <meshStandardMaterial color={C3.leg} roughness={0.4} metalness={0.4} />
          </mesh>
          <mesh castShadow position={[0, 0.585, 0]}>
            <boxGeometry args={[0.16, 0.11, 0.16]} />
            <meshStandardMaterial color={C3.leg} roughness={0.4} metalness={0.4} />
          </mesh>
        </group>
      ))}

      {/* 大圆形法兰盘（不参与拾取，避免遮挡接线柱热区） */}
      {[-0.8, 0.8].map((x) => (
        <group key={x} position={[x, 0.4, 0]}>
          <mesh castShadow rotation={[0, 0, Math.PI / 2]} raycast={() => null}>
            <cylinderGeometry args={[0.34, 0.34, 0.055, 36]} />
            <meshStandardMaterial color={C3.chrome} roughness={0.28} metalness={0.75} />
          </mesh>
          <mesh castShadow rotation={[0, 0, Math.PI / 2]} position={[x > 0 ? 0.032 : -0.032, 0, 0]} raycast={() => null}>
            <cylinderGeometry args={[0.26, 0.26, 0.03, 30]} />
            <meshStandardMaterial color={C3.chromeDark} roughness={0.3} metalness={0.72} />
          </mesh>
        </group>
      ))}

      {/* 细密绕线瓷管 */}
      <mesh castShadow receiveShadow position={[0, 0.4, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.165, 0.165, 1.56, 30]} />
        <meshStandardMaterial map={winding || undefined} color={winding ? '#ffffff' : '#aeb4bc'} roughness={0.5} metalness={0.5} />
      </mesh>

      {/* 导杆 */}
      <mesh position={[0, 0.64, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.026, 0.026, 1.78, 12]} />
        <meshStandardMaterial color={C3.chromeDark} roughness={0.26} metalness={0.82} />
      </mesh>

      {/* 滑座（可拖动） */}
      <group position={[sx, 0.64, 0]}>
        <mesh castShadow position={[0, -0.06, 0]}>
          <boxGeometry args={[0.24, 0.22, 0.24]} />
          <meshStandardMaterial color={C3.slider} roughness={0.45} metalness={0.18} />
        </mesh>
        <mesh castShadow position={[0, 0.105, 0]}>
          <cylinderGeometry args={[0.088, 0.1, 0.11, 12]} />
          <meshStandardMaterial color={C3.slider} roughness={0.42} metalness={0.18} />
        </mesh>
        {/* 触头连杆 */}
        <mesh position={[0, -0.245, 0]}>
          <boxGeometry args={[0.06, 0.17, 0.055]} />
          <meshStandardMaterial color={C3.chromeDark} roughness={0.3} metalness={0.8} />
        </mesh>
        {/* 拖拽热区 */}
        <mesh
          position={[0, 0, 0]}
          onPointerDown={(e) => { e.stopPropagation(); onSlideDown?.(e) }}
          onPointerOver={(e) => e.stopPropagation()}
        >
          <boxGeometry args={[0.42, 0.55, 0.46]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>

      {/* 四接线柱（左黑右红，小号；交互=左下+右上） */}
      <Post color={C3.capBlack} position={[-0.88, 0.17, 0]} scale={0.85} />
      <Post color={C3.capBlack} position={[-0.88, 0.64, 0]} scale={0.85} />
      <Post color={C3.capRed} position={[0.88, 0.17, 0]} scale={0.85} />
      <Post color={C3.capRed} position={[0.88, 0.64, 0]} scale={0.85} />
    </group>
  )
}

/* ───────────── 分发器 ───────────── */
export function Equipment3D({ type, closed, glow, slide, onSlideDown }) {
  if (type === 'switch') return <KnifeSwitch3D closed={closed} />
  if (type === 'bulb') return <BulbSocket3D lit={!!glow && glow > 0.02} glow={glow || 0} />
  if (type === 'battery') return <BatteryCell3D />
  if (type === 'rheostat') return <Rheostat3D slide={slide} onSlideDown={onSlideDown} />
  if (type === 'ammeter') return <Ammeter3D />
  if (type === 'voltmeter') return <Voltmeter3D />
  return <Resistor3D />
}
