/**
 * ImageInstruments3D — 用 equipment 器材图（矢量风格插画）做台面器材
 *
 * 与 RealInstruments3D / ElectricInstruments3D 接口一致（position / kind / reading /
 * range / voltage / brightness / closed / slider / ohms / points / color / onToggle），
 * ElectricLab3DScene 只改 import，物理逻辑（电路计算、开关通断、滑变调阻）不动。
 *
 * 每件器材 = 一张立在台面上的贴图平面（朝相机缓转，任意视角可读）：
 *   - ammeter.png / voltmeter.png —— J0407/J0408 电表（表盘+底座+接线柱）
 *   - battery.png —— 学生电源 | switch.png —— 闸刀开关 | rheostat.png —— 滑线变阻器
 *   - resistor.png —— 定值电阻 | bulb_on.png —— 小灯泡
 * 状态反馈叠加在贴图上：
 *   - 电表：盘底枢轴处的 3D 动画指针（贴图里的烘焙指针已抹掉）
 *   - 灯泡：按 brightness 调贴图亮度 + 点光源 + 光晕
 *   - 开关：闭合/断开状态牌 + 整体明暗
 */

import { useMemo, useRef, useState, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const BASE = '/physics-lab/assets/equipment'

/* 各图的内容包围盒（去透明边后）与盘面枢轴（图像像素坐标） */
const SPEC = {
  ammeter: { file: 'ammeter.png', size: [128, 256], box: [3, 53, 120, 190], pivot: [61, 141], needle: 0.42 },
  voltmeter: { file: 'voltmeter.png', size: [256, 256], box: [4, 0, 251, 252], pivot: [127, 151], needle: 0.46 },
  battery: { file: 'battery.png', size: [256, 256], box: [14, 2, 188, 181] },
  switch: { file: 'switch.png', size: [256, 256], box: [3, 57, 228, 214] },
  rheostat: { file: 'rheostat.png', size: [256, 256], box: [17, 76, 240, 168] },
  resistor: { file: 'resistor.png', size: [256, 256], box: [0, 68, 255, 188] },
  bulb: { file: 'bulb_on.png', size: [64, 64], box: [0, 0, 63, 63] },
}

/* 台面世界尺寸（宽 × 高），底边贴台面 y=0 */
const WORLD = {
  ammeter: [0.99, 1.16],
  voltmeter: [1.13, 1.15],
  battery: [1.14, 1.17],
  switch: [1.62, 1.13],
  rheostat: [1.88, 0.78],
  resistor: [1.5, 0.71],
  bulb: [0.86, 0.86],
}

/* 加载贴图并按内容包围盒裁 UV */
function useEquipTexture(key) {
  const [tex, setTex] = useState(null)
  useEffect(() => {
    let alive = true
    const s = SPEC[key]
    new THREE.TextureLoader().load(`${BASE}/${s.file}`, (t) => {
      if (!alive) return
      const [W, H] = s.size
      const [x0, y0, x1, y1] = s.box
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 8
      t.minFilter = THREE.LinearFilter
      t.magFilter = THREE.LinearFilter
      t.wrapS = THREE.ClampToEdgeWrapping
      t.wrapT = THREE.ClampToEdgeWrapping
      t.repeat.set((x1 - x0 + 1) / W, (y1 - y0 + 1) / H)
      t.offset.set(x0 / W, 1 - (y1 + 1) / H)
      setTex(t)
    })
    return () => { alive = false }
  }, [key])
  return tex
}

/* 立在台面上的贴图平面：Y 轴缓转朝向相机（任意视角可读），底边贴台面 */
function Card({ tex, w, h, position = [0, 0, 0], color = '#ffffff', emissive, emissiveIntensity = 0, opacity = 1, onClick, children }) {
  const ref = useRef()
  const { camera } = useThree()

  useFrame((_, dt) => {
    if (!ref.current) return
    // 目标朝向：面朝相机（只绕 Y，保持立正）
    const dx = camera.position.x - ref.current.position.x
    const dz = camera.position.z - ref.current.position.z
    const target = Math.atan2(dx, dz)
    const cur = ref.current.rotation.y
    let d = target - cur
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    ref.current.rotation.y = cur + d * Math.min(1, dt * 6)
  })

  return (
    <group ref={ref} position={position}>
      {tex && (
        <mesh position={[0, h / 2, 0]} onClick={onClick ? (e) => { e.stopPropagation(); onClick() } : undefined}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial
            map={tex}
            color={color}
            transparent
            opacity={opacity}
            toneMapped={false}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
      {emissive && (
        <mesh position={[0, h / 2, 0.012]}>
          <planeGeometry args={[w * 1.12, h * 1.12]} />
          <meshBasicMaterial color={emissive} transparent opacity={emissiveIntensity} depthWrite={false} />
        </mesh>
      )}
      {children}
    </group>
  )
}

/* 电表动画指针：贴图盘底枢轴处的细红针，reading 驱动摆角 */
function Needle({ pivotUV, w, h, reading, range }) {
  const ref = useRef()
  const s = Math.abs(reading) / (range || 1)
  const t = Math.max(0, Math.min(1, s))
  const targetZ = 1.047 - t * 2.094 // 零位左(+60°) → 满度右(-60°)

  useFrame((_, dt) => {
    if (!ref.current) return
    const z = ref.current.rotation.z
    ref.current.rotation.z = z + (targetZ - z) * Math.min(1, dt * 8)
  })

  // 盘面枢轴的局部坐标（平面中心为原点，UV v 轴向上）
  const px = (pivotUV[0] - 0.5) * w
  const py = (pivotUV[1] - 0.5) * h

  return (
    <group ref={ref} position={[px, h / 2 + py, 0.02]} rotation={[0, 0, 1.047]}>
      <mesh position={[0, 0.17, 0]}>
        <boxGeometry args={[0.012, 0.34, 0.003]} />
        <meshBasicMaterial color="#b71c1c" transparent opacity={0.92} depthWrite={false} />
      </mesh>
      <mesh position={[0, -0.045, 0]}>
        <boxGeometry args={[0.016, 0.09, 0.003]} />
        <meshBasicMaterial color="#b71c1c" transparent opacity={0.92} depthWrite={false} />
      </mesh>
    </group>
  )
}

/* 状态牌（CanvasTexture 丝印，中文可用） */
function Badge({ text, position, height = 0.09, color = '#e8e8e8' }) {
  const { tex, aspect } = useMemo(() => {
    if (typeof document === 'undefined') return { tex: null, aspect: 1 }
    const fontSize = 64
    const font = `700 ${fontSize}px "Microsoft YaHei","PingFang SC",sans-serif`
    const c = document.createElement('canvas')
    const m = c.getContext('2d')
    m.font = font
    const w = Math.ceil(m.measureText(text).width) + 14
    const h = Math.ceil(fontSize * 1.4) + 6
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')
    ctx.font = font
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.fillStyle = color
    ctx.fillText(text, w / 2, h / 2)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.minFilter = THREE.LinearFilter
    return { tex: t, aspect: w / h }
  }, [text, color])
  if (!tex) return null
  return (
    <mesh position={position} renderOrder={3}>
      <planeGeometry args={[height * aspect, height]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  )
}

/* ============================== 电表（J0407 / J0408） ============================== */
export function Meter3D({ position = [0, 0, 0], kind = 'A', reading = 0, range = 3 }) {
  const key = kind === 'A' ? 'ammeter' : 'voltmeter'
  const tex = useEquipTexture(key)
  const [w, h] = WORLD[key]
  const sp = SPEC[key]
  const [x0, y0, x1, y1] = sp.box
  // 枢轴 UV（内容框内归一化，v 向上）
  const u0 = (sp.pivot[0] - x0) / (x1 - x0 + 1)
  const v0 = 1 - (sp.pivot[1] - y0) / (y1 - y0 + 1)

  return (
    <group position={position}>
      <Card tex={tex} w={w} h={h}>
        <Needle pivotUV={[u0, v0]} w={w} h={h} reading={reading} range={range} />
        <Badge text={kind === 'A' ? 'J0407' : 'J0408'} position={[w * 0.32, h + 0.02, 0.01]} height={0.05} color="#c9d1d9" />
      </Card>
    </group>
  )
}

export function Ammeter3D(props) { return <Meter3D {...props} kind="A" /> }
export function Voltmeter3D(props) { return <Meter3D {...props} kind="V" /> }

/* ============================== 学生电源 ============================== */
export function Battery3D({ position = [0, 0, 0], voltage = 3 }) {
  const tex = useEquipTexture('battery')
  const [w, h] = WORLD.battery
  return (
    <group position={position}>
      <Card tex={tex} w={w} h={h}>
        <Badge text={`${voltage.toFixed(1)}V`} position={[0, h * 0.42, 0.01]} height={0.11} color="#ffd166" />
        <Badge text="学生电源" position={[0, h * 0.18, 0.01]} height={0.06} color="#c9d1d9" />
      </Card>
    </group>
  )
}

/* ============================== 闸刀开关 ============================== */
export function Switch3D({ position = [0, 0, 0], closed = true, onToggle }) {
  const tex = useEquipTexture('switch')
  const [w, h] = WORLD.switch
  return (
    <group position={position}>
      <Card tex={tex} w={w} h={h} color={closed ? '#ffffff' : '#9aa2ab'} onClick={() => onToggle?.()}>
        <Badge text={closed ? '闭合' : '断开'} position={[0, h + 0.02, 0.01]} height={0.08} color={closed ? '#7ce8b0' : '#ff9d95'} />
        {/* 闭合态：一条横档压在闸刀位置，示意刀口接通 */}
        {closed && (
          <mesh position={[w * 0.02, h * 0.42, 0.015]}>
            <boxGeometry args={[w * 0.62, 0.028, 0.003]} />
            <meshBasicMaterial color="#8fd3a8" transparent opacity={0.55} depthWrite={false} />
          </mesh>
        )}
      </Card>
    </group>
  )
}

/* ============================== 滑线变阻器 ============================== */
export function Rheostat3D({ position = [0, 0, 0], slider = 0.5 }) {
  const tex = useEquipTexture('rheostat')
  const [w, h] = WORLD.rheostat
  const sliderRef = useRef()
  useFrame(() => {
    if (sliderRef.current) {
      const x = -w * 0.32 + slider * w * 0.64
      sliderRef.current.position.x += (x - sliderRef.current.position.x) * 0.22
    }
  })
  return (
    <group position={position}>
      <Card tex={tex} w={w} h={h}>
        {/* 滑片位置指示（随 slider 移动的亮标） */}
        <group ref={sliderRef} position={[0, h * 0.62, 0.015]}>
          <mesh>
            <boxGeometry args={[0.055, h * 0.3, 0.003]} />
            <meshBasicMaterial color="#ffd166" transparent opacity={0.8} depthWrite={false} />
          </mesh>
        </group>
        <Badge text="滑线变阻器" position={[0, h + 0.02, 0.01]} height={0.06} color="#c9d1d9" />
      </Card>
    </group>
  )
}

/* ============================== 定值电阻 ============================== */
export function Resistor3D({ position = [0, 0, 0], ohms = 10 }) {
  const tex = useEquipTexture('resistor')
  const [w, h] = WORLD.resistor
  return (
    <group position={position}>
      <Card tex={tex} w={w} h={h}>
        <Badge text={`${ohms}Ω`} position={[0, h * 0.55, 0.01]} height={0.08} color="#f5e6d0" />
        <Badge text="定值电阻" position={[0, h + 0.02, 0.01]} height={0.05} color="#c9d1d9" />
      </Card>
    </group>
  )
}

/* ============================== 小灯泡 ============================== */
export function Bulb3D({ position = [0, 0, 0], brightness = 0 }) {
  const tex = useEquipTexture('bulb')
  const [w, h] = WORLD.bulb
  const glow = Math.max(0, Math.min(1, brightness))
  const lightRef = useRef()
  useFrame((_, dt) => {
    if (lightRef.current) {
      const target = glow > 0.05 ? 0.4 + glow * 3.2 : 0
      lightRef.current.intensity += (target - lightRef.current.intensity) * Math.min(1, dt * 6)
    }
  })
  // 亮度：暗时贴图压暗，亮时正常 + 暖色偏移
  const dim = 0.32 + glow * 0.68
  return (
    <group position={position}>
      <Card tex={tex} w={w} h={h} color={new THREE.Color(dim, dim * (0.92 + glow * 0.08), dim * (0.82 + glow * 0.18))}>
        {glow > 0.06 && (
          <mesh position={[0, h * 0.55, 0.012]}>
            <planeGeometry args={[w * 1.5, h * 1.5]} />
            <meshBasicMaterial color="#ffc846" transparent opacity={glow * 0.16} depthWrite={false} />
          </mesh>
        )}
        <Badge text="小灯泡" position={[0, h + 0.02, 0.01]} height={0.05} color="#c9d1d9" />
      </Card>
      <pointLight ref={lightRef} position={[0, h * 0.6, 0.3]} color="#ffe082" intensity={0} distance={5} decay={1.8} />
    </group>
  )
}

/* ============================== 导线（保持 3D 管） ============================== */
export function Wire3D({ points = [], color = '#e53935', radius = 0.028 }) {
  const curve = useMemo(() => {
    if (points.length < 2) return null
    const pts = points.map((p) => new THREE.Vector3(p[0], p[1], p[2]))
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

/* ============================== 实验台面 ============================== */
export function LabTable({ size = [8, 5] }) {
  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[size[0], size[1]]} />
        <meshStandardMaterial color="#2b221c" roughness={0.9} metalness={0.05} />
      </mesh>
      <mesh receiveShadow position={[0, -0.08, 0]}>
        <boxGeometry args={[size[0], 0.16, size[1]]} />
        <meshStandardMaterial color="#1a1410" roughness={0.85} />
      </mesh>
    </group>
  )
}
