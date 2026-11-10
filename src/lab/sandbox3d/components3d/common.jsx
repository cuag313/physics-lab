/**
 * sandbox3d/components3d/common.jsx — 共享材质 / 接线柱 / 铭牌 / 底座 / 选中环
 *
 * 12 件器材都从这取基础件，保证材质分层（ABS 塑料 / 胶木 / 黄铜 / 玻璃 / 橡胶 /
 * 陶瓷）与接线柱交互一致。每个文件只放自己那一件的几何，不堆通用逻辑。
 */

import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/* ---------- 材质分层（roughness / metalness 按材质给） ---------- */
export const MAT = {
  absBlack: { color: '#1b1d22', roughness: 0.42, metalness: 0.08 },
  absDark: { color: '#2a2d34', roughness: 0.5, metalness: 0.1 },
  absRed: { color: '#c62828', roughness: 0.4, metalness: 0.08 },
  absBlue: { color: '#1565c0', roughness: 0.4, metalness: 0.08 },
  absGreen: { color: '#2e7d32', roughness: 0.4, metalness: 0.08 },
  bakelite: { color: '#3e2b22', roughness: 0.62, metalness: 0.1 },
  bakeliteDark: { color: '#241a16', roughness: 0.66, metalness: 0.1 },
  brass: { color: '#c9a227', roughness: 0.32, metalness: 0.9 },
  copper: { color: '#d4a574', roughness: 0.35, metalness: 0.85 },
  steel: { color: '#b8bec6', roughness: 0.28, metalness: 0.9 },
  rubber: { color: '#1a1a1a', roughness: 0.9, metalness: 0.02 },
  ceramic: { color: '#ece2d2', roughness: 0.66, metalness: 0.04 },
  glass: { color: '#dce8f4', roughness: 0.06, metalness: 0 },
  nickel: { color: '#c6cbd2', roughness: 0.22, metalness: 0.94 },
  zinc: { color: '#9aa4ad', roughness: 0.4, metalness: 0.7 },
  carbon: { color: '#16161a', roughness: 0.5, metalness: 0.1 },
  silverCase: { color: '#c9cdd3', roughness: 0.45, metalness: 0.4 },
}

/* ---------- 铭牌丝印（CanvasTexture，支持中文，清晰不糊） ---------- */
export function useSilkTexture(text, { fontSize = 64, color = '#e8e8e8', weight = 700, pad = 10 } = {}) {
  return useMemo(() => {
    if (typeof document === 'undefined') return { tex: null, aspect: 1 }
    const font = `${weight} ${fontSize}px "Microsoft YaHei","PingFang SC","Segoe UI",sans-serif`
    const c = document.createElement('canvas')
    const m = c.getContext('2d')
    m.font = font
    const w = Math.ceil(m.measureText(text).width) + pad * 2
    const h = Math.ceil(fontSize * 1.4) + pad
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')
    ctx.font = font
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.fillStyle = color
    ctx.fillText(text, w / 2, h / 2)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    return { tex, aspect: w / h }
  }, [text, fontSize, color, weight, pad])
}

/** 铭牌：把文字做成平面贴片，贴在器材表面（depthWrite=false 避免与壳面闪烁） */
export function SilkText({ text, position = [0, 0, 0], rotation = [0, 0, 0], height = 0.1, color = '#e8e8e8', fontSize = 64, weight = 700, scale = 1 }) {
  const { tex, aspect } = useSilkTexture(text, { color, fontSize, weight })
  if (!tex) return null
  return (
    <mesh position={position} rotation={rotation} scale={scale} renderOrder={2}>
      <planeGeometry args={[height * aspect, height]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  )
}

/* ---------- 底座（胶木/工程塑料底板，接线柱统一落在这上面） ---------- */
export function BasePlate({ width = 1.4, depth = 0.7, topY = 0.05, color = MAT.bakeliteDark }) {
  return (
    <mesh castShadow receiveShadow position={[0, topY / 2, 0]}>
      <boxGeometry args={[width, topY, depth]} />
      <meshStandardMaterial {...color} />
    </mesh>
  )
}

/* ---------- 接线柱（可点选 + 悬停高亮环） ---------- */
export function Terminal({ portIdx = 0, position, color = 'brass', onHover, onClick, onPointerDown }) {
  const [hovered, setHovered] = useState(false)
  const show = hovered
  const nut = color === 'red' ? '#c62828' : color === 'black' ? '#1a1a1a' : color === 'blue' ? '#1565c0' : '#c9a227'

  return (
    <group
      position={position}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); onHover?.(portIdx, true) }}
      onPointerOut={(e) => { e.stopPropagation(); setHovered(false); onHover?.(portIdx, false) }}
      onClick={(e) => { e.stopPropagation(); onClick?.(portIdx) }}
      onPointerDown={(e) => { e.stopPropagation(); onPointerDown?.(portIdx, e) }}
    >
      {/* 螺柱 */}
      <mesh castShadow position={[0, 0.07, 0]}>
        <cylinderGeometry args={[0.022, 0.03, 0.14, 16]} />
        <meshStandardMaterial color="#b8a06a" roughness={0.4} metalness={0.7} />
      </mesh>
      {/* 螺母顶帽 */}
      <mesh castShadow position={[0, 0.15, 0]}>
        <cylinderGeometry args={[0.036, 0.036, 0.032, 6]} />
        <meshStandardMaterial color={nut} roughness={0.38} metalness={0.5} />
      </mesh>
      {/* 高亮环 */}
      {show && (
        <mesh position={[0, 0.16, 0]} rotation={[Math.PI / 2, 0, 0]} renderOrder={3}>
          <torusGeometry args={[0.055, 0.007, 10, 32]} />
          <meshBasicMaterial color="#4A90D9" toneMapped={false} />
        </mesh>
      )}
    </group>
  )
}

/* ---------- 选中 / 拖拽投影：地面圆环 ---------- */
export function GroundRing({ radius = 0.5, color = '#4A90D9', opacity = 0.85, y = 0.012 }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} renderOrder={2}>
      <ringGeometry args={[radius - 0.012, radius, 64]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  )
}

/* ---------- 通用：把器材 body 包一层，统一处理选中环 ---------- */
export function InstrumentBody({ children, position, selected, ringRadius, ...groupProps }) {
  return (
    <group position={position} {...groupProps}>
      {children}
      {selected && <GroundRing radius={ringRadius} />}
    </group>
  )
}

/* ---------- 教学电表表盘（电流表 / 电压表 / 灵敏电流计共用） ---------- */

function useDialTexture(kind, range, unit, accent, zeroCenter) {
  return useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 512
    const ctx = c.getContext('2d')
    const cx = 256
    const cy = 256
    const R = 232

    // 表盘纸：暖白 + 轻微径向渐变
    const g = ctx.createRadialGradient(cx, cy, 40, cx, cy, R)
    g.addColorStop(0, '#fdfbf5')
    g.addColorStop(0.75, '#f2eee1')
    g.addColorStop(1, '#d9d2bd')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.fill()

    const pt = (a, r) => [cx + r * Math.cos(a), cy - r * Math.sin(a)]
    const a0 = zeroCenter ? Math.PI : (200 * Math.PI) / 180
    const a1 = zeroCenter ? Math.PI * 2 : (340 * Math.PI) / 180
    const DIV = zeroCenter ? 10 : 30

    // 过载红区（非检流计，末 12%）
    if (!zeroCenter) {
      ctx.strokeStyle = 'rgba(198,40,40,0.85)'
      ctx.lineWidth = 7
      ctx.beginPath()
      ctx.arc(cx, cy, R - 14, a0 + (a1 - a0) * 0.88, a1)
      ctx.stroke()
    }

    // 主弧
    ctx.strokeStyle = 'rgba(40,42,40,0.9)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(cx, cy, R - 14, a0, a1)
    ctx.stroke()

    // 刻度与数字
    for (let i = 0; i <= DIV; i++) {
      const a = a0 + ((a1 - a0) * i) / DIV
      const major = i % 5 === 0
      const len = major ? 26 : 14
      ctx.strokeStyle = major ? 'rgba(30,30,28,0.95)' : 'rgba(60,60,56,0.8)'
      ctx.lineWidth = major ? 4 : 2
      const [x1, y1] = pt(a, R - 14)
      const [x2, y2] = pt(a, R - 14 - len)
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
      if (major) {
        const v = zeroCenter ? Math.round(range * 1000 * ((i / DIV) * 2 - 1)) / 1000 : (range * i) / DIV
        const label = zeroCenter ? String(Math.abs(v)) : (Number.isInteger(v) ? String(v) : v.toFixed(1))
        const [tx, ty] = pt(a, R - 50)
        ctx.fillStyle = i / DIV > 0.88 && !zeroCenter ? '#b71c1c' : '#2b2b28'
        ctx.font = '700 26px "Microsoft YaHei",sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, tx, ty)
      }
    }

    // 单位与量程
    ctx.fillStyle = accent
    ctx.font = '800 54px "Microsoft YaHei",sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(kind, cx, cy - 24)
    ctx.fillStyle = 'rgba(60,60,56,0.85)'
    ctx.font = '700 22px "Microsoft YaHei",sans-serif'
    ctx.fillText(zeroCenter ? unit : `0~${range}${unit}`, cx, cy + 88)

    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    return tex
  }, [kind, range, unit, accent, zeroCenter])
}

/**
 * 教学电表外壳（电流表/电压表/灵敏电流计共用）：
 * 圆形表头（短圆柱银灰壳 + 大圆白底表盘）+ 底部小底座（装红/黑接线柱）。
 * children 会放到表盘窗中心。
 */
export function MeterCase({ children, radius = 0.42, depth = 0.16 }) {
  return (
    <group>
      {/* 圆形表头 */}
      <group position={[0, radius, 0]}>
        <mesh castShadow receiveShadow rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[radius + 0.025, radius + 0.025, depth, 64]} />
          <meshStandardMaterial {...MAT.silverCase} />
        </mesh>
        {/* 表圈 */}
        <mesh position={[0, 0, depth / 2 + 0.004]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[radius, 0.014, 12, 64]} />
          <meshStandardMaterial {...MAT.steel} />
        </mesh>
        {/* 调零螺钉 */}
        <mesh position={[radius * 0.6, -radius * 0.5, depth / 2 + 0.012]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 0.02, 12]} />
          <meshStandardMaterial {...MAT.steel} />
        </mesh>
        {/* 表盘内容 */}
        <group position={[0, 0, depth / 2 + 0.012]}>{children}</group>
      </group>
      {/* 底部小底座（承接接线柱） */}
      <mesh castShadow receiveShadow position={[0, 0.035, 0]}>
        <boxGeometry args={[0.42, 0.07, 0.26]} />
        <meshStandardMaterial {...MAT.absDark} />
      </mesh>
    </group>
  )
}

/**
 * 表盘本体（独立 mesh 组），指针角度 = 真实读数映射。
 * value 为「带符号」读数：负值反偏（Stage B 要求，这里从源头就不做 abs）。
 */
export function MeterDial({ kind = 'A', range = 3, value = 0, unit, accent = '#1b5e20', zeroCenter = false, radius = 0.32 }) {
  const needleRef = useRef()
  const tex = useDialTexture(kind, range, unit, accent, zeroCenter)

  const target = zeroCenter
    ? THREE.MathUtils.clamp(value / (range || 1), -1.05, 1.05)
    : THREE.MathUtils.clamp(value / (range || 1), -0.06, 1.05)
  const a0 = zeroCenter ? Math.PI : (200 * Math.PI) / 180
  const a1 = zeroCenter ? Math.PI * 2 : (340 * Math.PI) / 180
  const pa = zeroCenter ? (a0 + a1) / 2 - target * (Math.PI / 2) : a0 + (a1 - a0) * target
  const targetZ = pa - Math.PI / 2

  useFrame((_, dt) => {
    if (!needleRef.current) return
    const z = needleRef.current.rotation.z
    needleRef.current.rotation.z = z + (targetZ - z) * Math.min(1, dt * 8)
  })

  return (
    <group>
      {/* 表圈 */}
      <mesh castShadow position={[0, 0, 0.002]}>
        <torusGeometry args={[radius + 0.02, 0.022, 12, 48]} />
        <meshStandardMaterial {...MAT.brass} />
      </mesh>
      {/* 表盘 */}
      <mesh position={[0, 0, 0]}>
        <circleGeometry args={[radius, 48]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      {/* 指针 */}
      <group ref={needleRef} position={[0, 0, 0.01]}>
        <mesh>
          <boxGeometry args={[0.01, radius * 0.86, 0.004]} />
          <meshBasicMaterial color="#b71c1c" />
        </mesh>
        <mesh position={[0, -radius * 0.16, 0]}>
          <boxGeometry args={[0.014, radius * 0.3, 0.004]} />
          <meshBasicMaterial color="#b71c1c" />
        </mesh>
      </group>
      {/* 轴承 */}
      <mesh position={[0, 0, 0.014]}>
        <cylinderGeometry args={[0.02, 0.02, 0.006, 20]} />
        <meshStandardMaterial {...MAT.steel} />
      </mesh>
      {/* 玻璃 */}
      <mesh position={[0, 0, 0.02]}>
        <circleGeometry args={[radius + 0.012, 48]} />
        <meshPhysicalMaterial
          color="#ffffff"
          transparent
          opacity={0.14}
          roughness={0.05}
          metalness={0.05}
          transmission={0.6}
          thickness={0.02}
        />
      </mesh>
    </group>
  )
}
