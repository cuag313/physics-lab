/**
 * RealInstruments3D — 写实电学器材（对齐 public/assets/equipment 参考图）
 *
 * 形态依据（用户指定参考图）：
 *   - ammeter.png / voltmeter.png —— 人教版 J0407/J0408 直流电表：立式炭黑方壳、
 *     上部弧形刻度盘（指针自盘底中心摆动）、下部三接线柱（−/小量程/大量程）
 *   - battery.png —— 学生电源：蓝色箱体、顶面红黑接线柱
 *   - switch.png —— 单刀闸刀开关：灰铁底座、铰链闸刀（断开时斜置约 40°）、绝缘手柄
 *   - rheostat.png —— 滑动变阻器：瓷管密绕电阻丝 + 金属导杆 + 滑片 + 四接线柱
 *   - resistor.png —— 定值电阻：陶瓷/线绕体 + 金属端帽 + 底座接线柱
 *   - bulb_on.png —— 小灯泡：玻璃泡 + 钨丝 + 螺口灯座
 *
 * 与 ElectricInstruments3D 的接口保持一致（position / kind / reading / range /
 * voltage / brightness / closed / slider / ohms / points / color），场景侧只改 import。
 */

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text, RoundedBox } from '@react-three/drei'
import * as THREE from 'three'

/* ============================== 共享材质 ============================== */
export const MAT = {
  charcoal: { color: '#20242a', roughness: 0.5, metalness: 0.32 },
  charcoalDark: { color: '#161a1f', roughness: 0.55, metalness: 0.28 },
  blueBox: { color: '#3f5daa', roughness: 0.45, metalness: 0.18 },
  blueBoxDark: { color: '#2c407c', roughness: 0.5, metalness: 0.15 },
  grayMetal: { color: '#9aa2ab', roughness: 0.38, metalness: 0.55 },
  grayMetalDark: { color: '#6d757e', roughness: 0.45, metalness: 0.5 },
  steel: { color: '#c0c6d0', roughness: 0.28, metalness: 0.9 },
  brass: { color: '#c9a227', roughness: 0.32, metalness: 0.9 },
  copper: { color: '#d4a574', roughness: 0.35, metalness: 0.85 },
  ceramic: { color: '#e8dcc4', roughness: 0.6, metalness: 0.05 },
  rubber: { color: '#1a1a1a', roughness: 0.9, metalness: 0.02 },
  redPlastic: { color: '#c62828', roughness: 0.4, metalness: 0.1 },
  blackPlastic: { color: '#1b1d22', roughness: 0.5, metalness: 0.12 },
}

/* ============================== 丝印文字 ============================== */
/** CanvasTexture 丝印（支持中文，不依赖外部字体） */
export function SilkText({ text, position = [0, 0, 0], rotation = [0, 0, 0], height = 0.1, color = '#e8e8e8', fontSize = 64, weight = 700 }) {
  const { tex, aspect } = useMemo(() => {
    if (typeof document === 'undefined') return { tex: null, aspect: 1 }
    const font = `${weight} ${fontSize}px "Microsoft YaHei","PingFang SC","Segoe UI",sans-serif`
    const c = document.createElement('canvas')
    const m = c.getContext('2d')
    m.font = font
    const w = Math.ceil(m.measureText(text).width) + 16
    const h = Math.ceil(fontSize * 1.4) + 8
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
    t.anisotropy = 4
    t.minFilter = THREE.LinearFilter
    return { tex: t, aspect: w / h }
  }, [text, fontSize, color, weight])
  if (!tex) return null
  return (
    <mesh position={position} rotation={rotation} renderOrder={2}>
      <planeGeometry args={[height * aspect, height]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  )
}

/* ============================== 接线柱 ============================== */
/** 矮黄铜底座 + 顶帽（红/黑/黄铜），可接导线 */
export function Post({ position = [0, 0, 0], color = 'black', height = 0.14, cap = 0.085 }) {
  const nut = color === 'red' ? '#c62828' : color === 'black' ? '#1b1b1b' : '#c9a227'
  return (
    <group position={position}>
      {/* 底座 */}
      <mesh castShadow position={[0, 0.028, 0]}>
        <cylinderGeometry args={[cap * 0.78, cap * 0.92, 0.056, 22]} />
        <meshStandardMaterial {...MAT.brass} />
      </mesh>
      {/* 螺柱 */}
      <mesh castShadow position={[0, height / 2 + 0.03, 0]}>
        <cylinderGeometry args={[cap * 0.38, cap * 0.42, height, 18]} />
        <meshStandardMaterial color="#b8a06a" roughness={0.4} metalness={0.75} />
      </mesh>
      {/* 顶帽 */}
      <mesh castShadow position={[0, height + 0.045, 0]}>
        <cylinderGeometry args={[cap, cap, 0.052, 22]} />
        <meshStandardMaterial color={nut} roughness={0.38} metalness={0.2} />
      </mesh>
      <mesh position={[0, height + 0.072, 0]} scale={[1, 0.55, 1]}>
        <sphereGeometry args={[cap, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={nut} roughness={0.38} metalness={0.2} />
      </mesh>
    </group>
  )
}

/* ============================== 电表 J0407 / J0408 ============================== */

/** 弧形刻度盘贴图：盘底中心为指针枢轴，弧线在上方 150°→30° */
function useDialTexture(kind, range) {
  return useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 768
    c.height = 512
    const ctx = c.getContext('2d')
    const px = 384
    const py = 430 // 枢轴（盘底中心）

    // 盘纸：暖白径向渐变
    const g = ctx.createRadialGradient(px, py - 120, 40, px, py - 120, 420)
    g.addColorStop(0, '#fdfbf5')
    g.addColorStop(0.7, '#f2eee1')
    g.addColorStop(1, '#d9d2bd')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 768, 512)

    const pt = (deg, r) => [px + r * Math.cos((deg * Math.PI) / 180), py - r * Math.sin((deg * Math.PI) / 180)]
    const a0 = 150 // 零位（左）
    const a1 = 30 // 满度（右）
    const R = 340

    // 主弧
    ctx.strokeStyle = 'rgba(40,42,40,0.92)'
    ctx.lineWidth = 7
    ctx.beginPath()
    ctx.arc(px, py, R - 16, (a1 * Math.PI) / 180, (a0 * Math.PI) / 180)
    ctx.stroke()

    // 刻度：30 小格，每 5 格一大格（对应 0.5 一大格）
    const DIV = 30
    for (let i = 0; i <= DIV; i++) {
      const a = a0 + ((a1 - a0) * i) / DIV
      const major = i % 5 === 0
      const len = major ? 36 : 20
      ctx.strokeStyle = major ? 'rgba(30,30,28,0.95)' : 'rgba(60,60,56,0.85)'
      ctx.lineWidth = major ? 8 : 4.5
      const [x1, y1] = pt(a, R - 16)
      const [x2, y2] = pt(a, R - 16 - len)
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
      if (major) {
        const v = (range * i) / DIV
        const label = v === 0 ? '0' : v % 1 === 0 ? String(v) : v.toFixed(1)
        const [tx, ty] = pt(a, R - 72)
        ctx.fillStyle = '#2b2b28'
        ctx.font = '800 40px "Microsoft YaHei",sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, tx, ty)
      }
    }

    // 内侧副刻度（0.6A / 3V 小量程）
    const smallRange = kind === 'A' ? 0.6 : 3
    for (let i = 0; i <= 6; i++) {
      const a = a0 + ((a1 - a0) * i) / 6
      const [tx, ty] = pt(a, R - 130)
      ctx.fillStyle = 'rgba(70,70,66,0.9)'
      ctx.font = '700 30px "Microsoft YaHei",sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const v = (smallRange * i) / 6
      ctx.fillText(v === 0 ? '0' : v % 1 === 0 ? String(v) : v.toFixed(1), tx, ty)
    }

    // 单位字母
    ctx.fillStyle = '#1b5e20'
    ctx.font = '800 110px "Microsoft YaHei",sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(kind, px, py - 150)

    // 量程标注
    ctx.fillStyle = 'rgba(60,60,56,0.9)'
    ctx.font = '700 34px "Microsoft YaHei",sans-serif'
    ctx.fillText(`0~${range}${kind}`, px, py - 62)

    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    return tex
  }, [kind, range])
}

/* 表盘窗口（前表面局部尺寸） */
const DIAL_W = 1.06
const DIAL_H = 0.6
const DIAL_CY = 0.73 // 窗口中心的绝对高度（台面为 y=0）
const PIVOT_Y = 0.535 // 指针枢轴高度
const POST_Y = 0.02

/**
 * 直流电表（kind='A' 电流表 / 'V' 电压表）
 * 立式炭黑圆角方壳 + 弧形刻度盘 + 可动指针 + 三接线柱（−/小量程/大量程）
 */
export function Meter3D({ position = [0, 0, 0], kind = 'A', reading = 0, range = 3, onClick }) {
  const needleRef = useRef()
  const tex = useDialTexture(kind, range)
  const W = 1.35
  const H = 1.16
  const D = 0.52

  const target = THREE.MathUtils.clamp(Math.abs(reading) / (range || 1), 0, 1)
  // 枢轴在盘底，指针朝上为 0°；零位在左（+60°），满度在右（-60°）
  const targetZ = 1.047 - target * 2.094

  useFrame((_, dt) => {
    if (!needleRef.current) return
    const z = needleRef.current.rotation.z
    needleRef.current.rotation.z = z + (targetZ - z) * Math.min(1, dt * 8)
  })

  const rangeLabel = kind === 'A' ? ['−', '0.6A', '3A'] : ['−', '3V', '15V']

  return (
    <group position={position} onClick={onClick}>
      {/* 底垫 */}
      <mesh receiveShadow position={[0, 0.022, 0]}>
        <boxGeometry args={[W * 1.03, 0.045, D * 1.03]} />
        <meshStandardMaterial {...MAT.charcoalDark} />
      </mesh>

      {/* 炭黑圆角方壳 */}
      <RoundedBox castShadow receiveShadow args={[W, H, D]} radius={0.05} smoothness={4} position={[0, H / 2 + 0.045, 0]}>
        <meshStandardMaterial {...MAT.charcoal} />
      </RoundedBox>

      {/* 顶部微凸盖 */}
      <mesh castShadow position={[0, H + 0.055, 0]}>
        <boxGeometry args={[W * 0.985, 0.035, D * 0.985]} />
        <meshStandardMaterial {...MAT.charcoalDark} />
      </mesh>

      {/* 表盘银边框（圆角矩形环） */}
      <mesh position={[0, DIAL_CY, D / 2 + 0.008]}>
        <planeGeometry args={[DIAL_W + 0.05, DIAL_H + 0.05]} />
        <meshStandardMaterial color="#c7ccd4" roughness={0.28} metalness={0.85} />
      </mesh>

      {/* 表盘贴图 */}
      <mesh position={[0, DIAL_CY, D / 2 + 0.014]}>
        <planeGeometry args={[DIAL_W, DIAL_H]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>

      {/* 指针（3D，可动） */}
      <group ref={needleRef} position={[0, PIVOT_Y, D / 2 + 0.02]} rotation={[0, 0, 1.047]}>
        <mesh position={[0, 0.21, 0]}>
          <boxGeometry args={[0.014, 0.42, 0.004]} />
          <meshBasicMaterial color="#b71c1c" />
        </mesh>
        {/* 配重尾 */}
        <mesh position={[0, -0.055, 0]}>
          <boxGeometry args={[0.02, 0.11, 0.004]} />
          <meshBasicMaterial color="#b71c1c" />
        </mesh>
        {/* 轴承 */}
        <mesh position={[0, 0, 0.002]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.022, 0.022, 0.008, 20]} />
          <meshStandardMaterial {...MAT.steel} />
        </mesh>
      </group>

      {/* 玻璃斜向高光 */}
      <mesh position={[0, DIAL_CY, D / 2 + 0.024]} rotation={[0, 0, -0.55]}>
        <planeGeometry args={[DIAL_W * 0.5, 0.05]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.14} depthWrite={false} />
      </mesh>

      {/* 品牌丝印 */}
      <SilkText text={kind === 'A' ? 'J0407' : 'J0408'} position={[W * 0.31, H * 0.92, D / 2 + 0.012]} height={0.055} color="#8a919b" />

      {/* 下部面板：三接线柱 */}
      {[-0.42, 0, 0.42].map((x, i) => (
        <group key={x}>
          <Post position={[x, POST_Y, D / 2 - 0.02]} color={i === 0 ? 'black' : 'red'} height={0.11} cap={0.075} />
          <SilkText text={rangeLabel[i]} position={[x, POST_Y + 0.005, D / 2 + 0.055]} height={0.06} color="#e8eaed" />
        </group>
      ))}
    </group>
  )
}

/** 电流表 */
export function Ammeter3D(props) {
  return <Meter3D {...props} kind="A" />
}

/** 电压表 */
export function Voltmeter3D(props) {
  return <Meter3D {...props} kind="V" />
}

/* ============================== 学生电源（battery.png） ============================== */
/**
 * 蓝色箱体 + 顶面红黑接线柱 + 电压铭牌
 * 参考图：battery.png —— 蓝色矩形箱体，顶面两个接线柱
 */
export function Battery3D({ position = [0, 0, 0], voltage = 3, onClick }) {
  const W = 1.55
  const H = 0.82
  const D = 0.78

  return (
    <group position={position} onClick={onClick}>
      {/* 底垫 */}
      <mesh receiveShadow position={[0, 0.022, 0]}>
        <boxGeometry args={[W * 1.03, 0.045, D * 1.03]} />
        <meshStandardMaterial {...MAT.rubber} />
      </mesh>

      {/* 蓝色箱体 */}
      <RoundedBox castShadow receiveShadow args={[W, H, D]} radius={0.04} smoothness={4} position={[0, H / 2 + 0.045, 0]}>
        <meshStandardMaterial {...MAT.blueBox} />
      </RoundedBox>

      {/* 顶面深色面板 */}
      <mesh castShadow position={[0, H + 0.055, 0]}>
        <boxGeometry args={[W * 0.97, 0.035, D * 0.97]} />
        <meshStandardMaterial {...MAT.blueBoxDark} />
      </mesh>

      {/* 顶面红黑接线柱（左黑 −、右红 +） */}
      <Post position={[-0.42, H + 0.07, 0]} color="black" height={0.1} cap={0.09} />
      <Post position={[0.42, H + 0.07, 0]} color="red" height={0.1} cap={0.09} />

      {/* 顶面丝印 */}
      <SilkText text="+" position={[0.42, H + 0.085, 0.22]} height={0.09} color="#ff6f60" rotation={[-Math.PI / 2, 0, 0]} />
      <SilkText text="−" position={[-0.42, H + 0.085, 0.22]} height={0.09} color="#9fc0e0" rotation={[-Math.PI / 2, 0, 0]} />

      {/* 正面电压铭牌 */}
      <mesh position={[0, H * 0.62, D / 2 + 0.008]}>
        <planeGeometry args={[0.92, 0.2]} />
        <meshStandardMaterial color="#e53935" roughness={0.5} />
      </mesh>
      <Text position={[0, H * 0.62, D / 2 + 0.015]} fontSize={0.12} color="#fff" anchorX="center" anchorY="middle">
        {`${voltage.toFixed(1)}V`}
      </Text>

      {/* 正面品牌丝印 */}
      <SilkText text="学生电源" position={[0, H * 0.28, D / 2 + 0.01]} height={0.07} color="#c9d1d9" />
    </group>
  )
}

/* ============================== 单刀闸刀开关（switch.png） ============================== */
/**
 * 灰铁底座 + 铰链 + 闸刀（断开斜置 ~40°）+ 红色绝缘手柄 + 两端接线柱
 * 参考图：switch.png —— 闸刀斜向上，灰白金属质感
 */
export function Switch3D({ position = [0, 0, 0], closed = true, onToggle }) {
  const leverRef = useRef()
  const target = closed ? 0 : -0.72 // 闭合水平，断开上翘约 41°

  useFrame((_, dt) => {
    if (!leverRef.current) return
    const z = leverRef.current.rotation.z
    leverRef.current.rotation.z = z + (target - z) * Math.min(1, dt * 9)
  })

  return (
    <group position={position} onClick={(e) => { e.stopPropagation(); onToggle?.() }}>
      {/* 灰铁底座 */}
      <mesh castShadow receiveShadow position={[0, 0.055, 0]}>
        <boxGeometry args={[1.7, 0.11, 0.56]} />
        <meshStandardMaterial {...MAT.grayMetal} />
      </mesh>
      {/* 底座深色面板条 */}
      <mesh position={[0, 0.115, 0.285]}>
        <boxGeometry args={[1.62, 0.02, 0.01]} />
        <meshStandardMaterial {...MAT.grayMetalDark} />
      </mesh>

      {/* 左右接线柱 */}
      <Post position={[-0.72, 0.11, 0]} color="black" height={0.1} cap={0.085} />
      <Post position={[0.72, 0.11, 0]} color="red" height={0.1} cap={0.085} />

      {/* 铰链座（左） */}
      <mesh castShadow position={[-0.5, 0.19, 0]}>
        <boxGeometry args={[0.12, 0.13, 0.16]} />
        <meshStandardMaterial {...MAT.grayMetalDark} />
      </mesh>
      {/* 铰链轴 */}
      <mesh castShadow position={[-0.5, 0.26, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.028, 0.028, 0.14, 14]} />
        <meshStandardMaterial {...MAT.steel} />
      </mesh>

      {/* 静触柱（右）：立柱 + 斜口夹片 */}
      <mesh castShadow position={[0.5, 0.19, 0]}>
        <boxGeometry args={[0.11, 0.13, 0.14]} />
        <meshStandardMaterial {...MAT.grayMetalDark} />
      </mesh>
      <mesh castShadow position={[0.5, 0.3, 0]}>
        <boxGeometry args={[0.055, 0.11, 0.1]} />
        <meshStandardMaterial {...MAT.grayMetal} />
      </mesh>
      {/* 斜口夹片 */}
      <mesh position={[0.5, 0.355, 0.052]} rotation={[0.3, 0, 0]}>
        <boxGeometry args={[0.1, 0.07, 0.014]} />
        <meshStandardMaterial {...MAT.steel} />
      </mesh>
      <mesh position={[0.5, 0.355, -0.052]} rotation={[-0.3, 0, 0]}>
        <boxGeometry args={[0.1, 0.07, 0.014]} />
        <meshStandardMaterial {...MAT.steel} />
      </mesh>

      {/* 闸刀（绕左铰链旋转） */}
      <group ref={leverRef} position={[-0.5, 0.27, 0]}>
        {/* 刀身 */}
        <mesh castShadow position={[0.52, 0, 0]}>
          <boxGeometry args={[1.04, 0.02, 0.078]} />
          <meshStandardMaterial color="#b0bec5" metalness={0.85} roughness={0.28} />
        </mesh>
        {/* 红色绝缘手柄 */}
        <mesh castShadow position={[1.12, 0, 0]}>
          <boxGeometry args={[0.22, 0.065, 0.13]} />
          <meshStandardMaterial {...MAT.redPlastic} />
        </mesh>
        <mesh castShadow position={[1.245, 0, 0]}>
          <sphereGeometry args={[0.068, 16, 12]} />
          <meshStandardMaterial {...MAT.redPlastic} />
        </mesh>
      </group>

      <SilkText text={closed ? '闭合' : '断开'} position={[0, 0.125, 0.285]} height={0.055} color={closed ? '#7ce8b0' : '#ff9d95'} />
      <SilkText text="单刀开关" position={[0, 0.06, 0.285]} height={0.042} color="#c9d1d9" />
    </group>
  )
}

/* ============================== 滑动变阻器（rheostat.png） ============================== */
/**
 * 深灰底座 + 两端支架 + 瓷管密绕电阻丝 + 金属导杆 + 滑片 + 四接线柱
 * 参考图：rheostat.png —— 灰金属框架、中间瓷管绕线
 */
export function Rheostat3D({ position = [0, 0, 0], slider = 0.5, onSlider }) {
  void onSlider
  const sliderRef = useRef()

  const coilTex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 32
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#c9855a'
    ctx.fillRect(0, 0, 256, 32)
    for (let i = 0; i < 64; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#a05a30' : '#6f3a1c'
      ctx.fillRect(i * 4, 0, 2, 32)
    }
    const t = new THREE.CanvasTexture(c)
    t.wrapS = THREE.RepeatWrapping
    t.repeat.set(18, 1)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])

  useFrame(() => {
    if (sliderRef.current) {
      const x = -0.56 + slider * 1.12
      sliderRef.current.position.x += (x - sliderRef.current.position.x) * 0.22
    }
  })

  return (
    <group position={position}>
      {/* 深灰底座 */}
      <mesh castShadow receiveShadow position={[0, 0.055, 0]}>
        <boxGeometry args={[1.8, 0.11, 0.6]} />
        <meshStandardMaterial color="#4f5762" roughness={0.55} metalness={0.3} />
      </mesh>

      {/* 两端金属支架 */}
      {[-0.56, 0.56].map((x) => (
        <group key={x}>
          <mesh castShadow position={[x, 0.18, 0]}>
            <boxGeometry args={[0.08, 0.24, 0.18]} />
            <meshStandardMaterial {...MAT.grayMetal} />
          </mesh>
          <mesh castShadow position={[x, 0.36, 0]}>
            <boxGeometry args={[0.08, 0.12, 0.18]} />
            <meshStandardMaterial {...MAT.grayMetalDark} />
          </mesh>
        </group>
      ))}

      {/* 瓷管 */}
      <mesh castShadow receiveShadow position={[0, 0.21, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.135, 0.135, 1.0, 32]} />
        <meshStandardMaterial {...MAT.ceramic} />
      </mesh>
      {/* 密绕电阻丝 */}
      <mesh position={[0, 0.21, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.14, 0.14, 1.0, 32]} />
        <meshStandardMaterial map={coilTex} roughness={0.5} metalness={0.35} />
      </mesh>
      {/* 端环 */}
      {[-0.5, 0.5].map((x) => (
        <mesh key={x} position={[x, 0.21, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.15, 0.15, 0.05, 24]} />
          <meshStandardMaterial {...MAT.brass} />
        </mesh>
      ))}

      {/* 金属导杆 */}
      <mesh castShadow position={[0, 0.42, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.022, 0.022, 1.15, 16]} />
        <meshStandardMaterial {...MAT.steel} />
      </mesh>

      {/* 滑片 */}
      <group ref={sliderRef} position={[0, 0, 0]}>
        <mesh castShadow position={[0, 0.485, 0]}>
          <boxGeometry args={[0.16, 0.1, 0.2]} />
          <meshStandardMaterial color="#2e3136" roughness={0.42} metalness={0.3} />
        </mesh>
        <mesh castShadow position={[0, 0.42, 0]}>
          <boxGeometry args={[0.05, 0.11, 0.06]} />
          <meshStandardMaterial {...MAT.steel} />
        </mesh>
        {/* 触点弹簧片 */}
        <mesh position={[0, 0.32, 0]}>
          <boxGeometry args={[0.018, 0.12, 0.018]} />
          <meshStandardMaterial color="#c6cbd2" roughness={0.3} metalness={0.85} />
        </mesh>
      </group>

      {/* 四接线柱：前下两柱为电路端口 */}
      <Post position={[-0.78, 0.11, 0.2]} color="black" height={0.1} cap={0.085} />
      <Post position={[0.78, 0.11, 0.2]} color="red" height={0.1} cap={0.085} />
      <Post position={[-0.78, 0.11, -0.2]} color="brass" height={0.1} cap={0.085} />
      <Post position={[0.78, 0.11, -0.2]} color="brass" height={0.1} cap={0.085} />

      <SilkText text="滑动变阻器" position={[0, 0.085, 0.305]} height={0.05} color="#c9d1d9" />
      <SilkText text="50Ω 2A" position={[0, 0.038, 0.305]} height={0.038} color="#9aa2ab" />
    </group>
  )
}

/* ============================== 定值电阻（resistor.png） ============================== */
/**
 * 陶瓷/线绕电阻体（tan 棕陶）+ 金属端帽 + 底座接线柱
 * 参考图：resistor.png —— 棕陶体 + 两端金属端帽 + 底座
 */
export function Resistor3D({ position = [0, 0, 0], ohms = 10 }) {
  const bands = useMemo(() => {
    const palette = ['#000', '#4e342e', '#e53935', '#ff9800', '#fdd835', '#4caf50', '#2196f3', '#7e57c2', '#9e9e9e', '#fff']
    const d = Math.max(0, Math.min(9, Math.floor(Math.log10(Math.max(1, ohms)))))
    return [palette[d], palette[Math.min(9, d + 1)], '#c62828', '#c9a227']
  }, [ohms])

  return (
    <group position={position}>
      {/* 底座 */}
      <mesh castShadow receiveShadow position={[0, 0.05, 0]}>
        <boxGeometry args={[1.25, 0.1, 0.5]} />
        <meshStandardMaterial color="#6d757e" roughness={0.5} metalness={0.35} />
      </mesh>

      {/* 两端立柱（撑起电阻体） */}
      {[-0.36, 0.36].map((x) => (
        <mesh key={x} castShadow position={[x, 0.16, 0]}>
          <boxGeometry args={[0.06, 0.12, 0.1]} />
          <meshStandardMaterial {...MAT.grayMetal} />
        </mesh>
      ))}

      {/* 电阻体（棕陶横圆柱） */}
      <mesh castShadow receiveShadow position={[0, 0.26, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.13, 0.13, 0.72, 32]} />
        <meshStandardMaterial color="#b08968" roughness={0.55} metalness={0.08} />
      </mesh>

      {/* 色环 */}
      {bands.map((c, i) => (
        <mesh key={i} position={[-0.22 + i * 0.13, 0.26, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.135, 0.135, 0.032, 32]} />
          <meshStandardMaterial color={c} roughness={0.45} />
        </mesh>
      ))}

      {/* 金属端帽 */}
      {[-0.36, 0.36].map((x) => (
        <mesh key={x} castShadow position={[x, 0.26, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.115, 0.115, 0.07, 24]} />
          <meshStandardMaterial {...MAT.steel} />
        </mesh>
      ))}

      {/* 引线到接线柱 */}
      {[-0.36, 0.36].map((x) => (
        <mesh key={x} position={[x, 0.13, 0]}>
          <cylinderGeometry args={[0.014, 0.014, 0.12, 10]} />
          <meshStandardMaterial {...MAT.copper} />
        </mesh>
      ))}

      {/* 接线柱 */}
      <Post position={[-0.52, 0.1, 0]} color="black" height={0.1} cap={0.08} />
      <Post position={[0.52, 0.1, 0]} color="red" height={0.1} cap={0.08} />

      <SilkText text={`${ohms}Ω`} position={[0, 0.265, 0.135]} height={0.07} color="#f5e6d0" rotation={[0, 0, 0]} />
      <SilkText text="定值电阻" position={[0, 0.075, 0.255]} height={0.042} color="#c9d1d9" />
    </group>
  )
}

/* ============================== 小灯泡（bulb_on.png） ============================== */
/**
 * 玻璃泡 + 钨丝 + 螺口灯座 + 底座接线柱
 * 通电时灯丝发光 + 点光源 + 光晕
 */
export function Bulb3D({ position = [0, 0, 0], brightness = 0, onClick }) {
  const lightRef = useRef()
  const glow = THREE.MathUtils.clamp(brightness, 0, 1)

  useFrame((_, dt) => {
    if (!lightRef.current) return
    const target = 0.12 + glow * 3.0
    lightRef.current.intensity += (target - lightRef.current.intensity) * Math.min(1, dt * 6)
  })

  const filColor = glow > 0.05 ? '#fff3b0' : '#5c6166'
  const filEmissive = glow > 0.05 ? '#ffd54f' : '#000'

  return (
    <group position={position} onClick={onClick}>
      {/* 底座 */}
      <mesh castShadow receiveShadow position={[0, 0.05, 0]}>
        <boxGeometry args={[0.95, 0.1, 0.55]} />
        <meshStandardMaterial color="#3e2723" roughness={0.65} metalness={0.15} />
      </mesh>

      {/* 胶木灯座 */}
      <mesh castShadow receiveShadow position={[0, 0.17, 0]}>
        <cylinderGeometry args={[0.24, 0.29, 0.16, 32]} />
        <meshStandardMaterial color="#3e2b22" roughness={0.62} metalness={0.1} />
      </mesh>

      {/* 铜螺口 */}
      <mesh castShadow position={[0, 0.31, 0]}>
        <cylinderGeometry args={[0.12, 0.14, 0.11, 24]} />
        <meshStandardMaterial {...MAT.copper} />
      </mesh>
      {[0.325, 0.352, 0.378].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <torusGeometry args={[0.132, 0.006, 6, 24]} />
          <meshStandardMaterial color="#8a6d1a" roughness={0.4} metalness={0.8} />
        </mesh>
      ))}

      {/* 玻璃泡 */}
      <mesh castShadow position={[0, 0.58, 0]}>
        <sphereGeometry args={[0.25, 32, 32]} />
        <meshPhysicalMaterial
          color={glow > 0.05 ? '#fff2c0' : '#e3f0fb'}
          transmission={0.85}
          thickness={0.35}
          roughness={0.08}
          metalness={0}
          transparent
          opacity={glow > 0.05 ? 0.55 + glow * 0.32 : 0.32}
          emissive={glow > 0.05 ? '#ffc107' : '#000'}
          emissiveIntensity={glow * 2.0}
        />
      </mesh>

      {/* 灯丝支架 + V 形钨丝 */}
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 0.2, 8]} />
        <meshStandardMaterial color="#9aa4ad" roughness={0.4} metalness={0.7} />
      </mesh>
      <mesh position={[0, 0.58, 0]}>
        <torusGeometry args={[0.055, 0.011, 8, 20]} />
        <meshStandardMaterial color={filColor} emissive={filEmissive} emissiveIntensity={glow * 2.6} metalness={0.5} roughness={0.3} />
      </mesh>

      {/* 光晕 */}
      {glow > 0.08 && (
        <mesh position={[0, 0.58, 0]}>
          <sphereGeometry args={[0.28 + glow * 0.2, 16, 16]} />
          <meshBasicMaterial color="#ffc107" transparent opacity={glow * 0.11} depthWrite={false} />
        </mesh>
      )}
      <pointLight ref={lightRef} position={[0, 0.6, 0]} color="#ffe082" intensity={0} distance={6} decay={1.7} />

      {/* 接线柱 */}
      <Post position={[-0.36, 0.1, 0]} color="black" height={0.1} cap={0.08} />
      <Post position={[0.36, 0.1, 0]} color="red" height={0.1} cap={0.08} />

      <SilkText text="小灯泡" position={[0, 0.075, 0.28]} height={0.045} color="#c9d1d9" />
    </group>
  )
}

/* ============================== 导线（曲线管） ============================== */
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
