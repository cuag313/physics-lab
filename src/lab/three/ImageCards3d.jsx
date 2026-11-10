/**
 * ImageCards3d — 沙盒用「器材图卡」组件（components3d API）
 *
 * 接口与 sandbox3d/components3d 一致：{ comp, results, onTermHover, onTermClick, onTermDown }
 *   comp    = { id, type, x, y, props }（store 模型）
 *   results = Map<id, { current, voltage, power }>（solveCircuit 输出）
 *   onTermDown(portIdx, ev) —— 接线柱按下（拉导线起点）
 *
 * 每件器材 = equipment 器材图贴在立式卡面上（固定朝向，接线柱世界坐标稳定），
 * 接线柱为不可见热区球（hover 高亮 / 按下拉线 / 点击选中）。
 * 状态可视化：
 *   - 开关：闸刀绕左铰链旋转（comp.props.closed），开/关两态
 *   - 灯泡：bulbState(comp, results).brightness 调贴图亮度 + 点光源
 *   - 电表：盘底枢轴动画指针（results 的 current / voltage）
 *   - 变阻器：滑片亮标随 props.resistance / maxR 移动
 *   - 电源：电压铭牌随 props.voltage
 */

import { useMemo, useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { bulbState } from '../sandbox/circuit.js'

const BASE = '/physics-lab/assets/equipment'

/* ── 器材图内容框（去透明边）与盘面枢轴（图像像素） ── */
const SPEC = {
  ammeter: { file: 'ammeter.png', size: [128, 256], box: [3, 53, 120, 190], pivot: [61, 141] },
  voltmeter: { file: 'voltmeter.png', size: [256, 256], box: [4, 0, 251, 252], pivot: [127, 151] },
  battery: { file: 'battery.png', size: [256, 256], box: [14, 2, 188, 181] },
  switch: { file: 'switch.png', size: [256, 256], box: [3, 57, 228, 214] },
  rheostat: { file: 'rheostat.png', size: [256, 256], box: [17, 76, 240, 168] },
  resistor: { file: 'resistor.png', size: [256, 256], box: [0, 68, 255, 188] },
  bulb: { file: 'bulb_on.png', size: [64, 64], box: [0, 0, 63, 63] },
}

/* ── 台面世界尺寸（宽×高），底边 y=0；接线柱本地坐标（x, y柱心, z） ── */
const SPEC2 = {
  ammeter: { w: 0.99, h: 1.16, terms: [[-0.34, 0.1, 0.03], [0.34, 0.1, 0.03]] },
  voltmeter: { w: 1.13, h: 1.15, terms: [[-0.38, 0.1, 0.03], [0.38, 0.1, 0.03]] },
  battery: { w: 1.14, h: 1.17, terms: [[-0.3, 1.02, 0.03], [0.3, 1.02, 0.03]] },
  switch: { w: 1.62, h: 1.13, terms: [[-0.58, 0.14, 0.03], [0.58, 0.14, 0.03]] },
  rheostat: { w: 1.88, h: 0.78, terms: [[-0.72, 0.12, 0.03], [0.72, 0.12, 0.03]] },
  resistor: { w: 1.5, h: 0.71, terms: [[-0.55, 0.1, 0.03], [0.55, 0.1, 0.03]] },
  bulb: { w: 0.86, h: 0.86, terms: [[-0.3, 0.1, 0.03], [0.3, 0.1, 0.03]] },
}

/** 各件器材接线柱本地坐标（供 model3d / 导线锚点复用） */
export function cardTermLocal(type, portIdx) {
  const s = SPEC2[type]
  return (s && s.terms[portIdx]) || [-0.5 + portIdx * 1.0, 0.1, 0.03]
}

/* ── 贴图加载（按内容框裁 UV） ── */
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

/* ── 接线柱热区（不可见球：hover 高亮 / 按下拉线 / 点击选中） ── */
function Term({ portIdx, position, onHover, onClick, onDown }) {
  const [hov, setHov] = useState(false)
  return (
    <group position={position}>
      <mesh
        onPointerOver={(e) => { e.stopPropagation(); setHov(true); onHover?.(portIdx, true) }}
        onPointerOut={(e) => { e.stopPropagation(); setHov(false); onHover?.(portIdx, false) }}
        onPointerDown={(e) => { e.stopPropagation(); onDown?.(portIdx, e) }}
        onClick={(e) => { e.stopPropagation(); onClick?.(portIdx) }}
      >
        <sphereGeometry args={[0.2, 12, 12]} />
        {hov ? (
          <meshBasicMaterial color="#3ddc84" transparent opacity={0.32} depthWrite={false} />
        ) : (
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        )}
      </mesh>
    </group>
  )
}

/* ── 丝印牌 ── */
function Badge({ text, position, height = 0.08, color = '#e8e8e8' }) {
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

/* ── 卡面基座：固定朝向的贴图平面 + 子层（不随相机转，
   保证接线柱热区 / 导线锚点 / 屏幕投影三者重合） ── */
function Card({ tex, w, h, color = '#ffffff', children }) {
  return (
    <group>
      {tex && (
        <mesh position={[0, h / 2, 0]}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial map={tex} color={color} transparent toneMapped={false} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}
      {children}
    </group>
  )
}

/* ── 动画指针（电表） ── */
function Needle({ pivotLocal, reading, range }) {
  const ref = useRef()
  const t = Math.max(0, Math.min(1, Math.abs(reading) / (range || 1)))
  const targetZ = 1.047 - t * 2.094
  useFrame((_, dt) => {
    if (!ref.current) return
    const z = ref.current.rotation.z
    ref.current.rotation.z = z + (targetZ - z) * Math.min(1, dt * 8)
  })
  return (
    <group ref={ref} position={[pivotLocal[0], pivotLocal[1], 0.02]} rotation={[0, 0, 1.047]}>
      <mesh position={[0, 0.16, 0]}>
        <boxGeometry args={[0.012, 0.32, 0.003]} />
        <meshBasicMaterial color="#b71c1c" transparent opacity={0.92} depthWrite={false} />
      </mesh>
      <mesh position={[0, -0.04, 0]}>
        <boxGeometry args={[0.016, 0.08, 0.003]} />
        <meshBasicMaterial color="#b71c1c" transparent opacity={0.92} depthWrite={false} />
      </mesh>
    </group>
  )
}

/* ══════════════ 电表（J0407 / J0408） ══════════════ */
export function MeterCard({ comp = {}, results, onTermHover, onTermClick, onTermDown, kind = 'A' }) {
  const key = kind === 'A' ? 'ammeter' : 'voltmeter'
  const tex = useEquipTexture(key)
  const s = SPEC2[key]
  const r = results?.get(comp.id)
  const reading = kind === 'A' ? (r ? r.current : 0) : (r ? r.voltage : 0)
  const range = kind === 'A' ? 3 : 15
  const sp = SPEC[key]
  const [x0, y0, x1, y1] = sp.box
  const u0 = (sp.pivot[0] - x0) / (x1 - x0 + 1)
  const v0 = 1 - (sp.pivot[1] - y0) / (y1 - y0 + 1)
  const pivotLocal = [(u0 - 0.5) * s.w, v0 * s.h]

  return (
    <group>
      <Card tex={tex} w={s.w} h={s.h}>
        <Needle pivotLocal={pivotLocal} reading={reading} range={range} />
        <Badge text={kind === 'A' ? 'J0407' : 'J0408'} position={[s.w * 0.32, s.h + 0.02, 0.01]} height={0.05} color="#c9d1d9" />
      </Card>
      <Term portIdx={0} position={s.terms[0]} onHover={onTermHover} onClick={onTermClick} onDown={onTermDown} />
      <Term portIdx={1} position={s.terms[1]} onHover={onTermHover} onClick={onTermClick} onDown={onTermDown} />
    </group>
  )
}
export function Ammeter3D(props) { return <MeterCard {...props} kind="A" /> }
export function Voltmeter3D(props) { return <MeterCard {...props} kind="V" /> }

/* ══════════════ 学生电源 ══════════════ */
export function Battery3D({ comp = {}, onTermHover, onTermClick, onTermDown }) {
  const tex = useEquipTexture('battery')
  const s = SPEC2.battery
  const v = comp.props?.voltage ?? 3
  return (
    <group>
      <Card tex={tex} w={s.w} h={s.h}>
        <Badge text={`${Number(v).toFixed(1)}V`} position={[0, s.h * 0.42, 0.01]} height={0.11} color="#ffd166" />
        <Badge text="学生电源" position={[0, s.h * 0.18, 0.01]} height={0.06} color="#c9d1d9" />
      </Card>
      <Term portIdx={0} position={s.terms[0]} onHover={onTermHover} onClick={onTermClick} onDown={onTermDown} />
      <Term portIdx={1} position={s.terms[1]} onHover={onTermHover} onClick={onTermClick} onDown={onTermDown} />
    </group>
  )
}

/* ══════════════ 闸刀开关（开/关两态，闸刀可动） ══════════════ */
export function Switch3D({ comp = {}, onTermHover, onTermClick, onTermDown }) {
  const tex = useEquipTexture('switch')
  const s = SPEC2.switch
  const closed = comp.props?.closed === true
  const leverRef = useRef()
  // 闸刀：绕左铰链旋转。开 = 翘起（对齐参考图），关 = 水平接通
  const target = closed ? 0 : -0.72
  useFrame((_, dt) => {
    if (!leverRef.current) return
    const z = leverRef.current.rotation.z
    leverRef.current.rotation.z = z + (target - z) * Math.min(1, dt * 10)
  })
  // 铰链在卡面左下（图像 x≈48,y≈160 → 局部）
  const hx = (0.199 - 0.5) * s.w
  const hy = 0.348 * s.h
  return (
    <group>
      <Card tex={tex} w={s.w} h={s.h} color={closed ? '#ffffff' : '#c9ced4'}>
        {/* 铰链座 */}
        <mesh position={[hx, hy - 0.02, 0.015]}>
          <boxGeometry args={[0.09, 0.12, 0.01]} />
          <meshBasicMaterial color="#6d757e" transparent opacity={0.85} depthWrite={false} />
        </mesh>
        {/* 闸刀（绕铰链旋转） */}
        <group ref={leverRef} position={[hx, hy, 0.02]} rotation={[0, 0, -0.72]}>
          <mesh position={[0.52, 0, 0]}>
            <boxGeometry args={[1.04, 0.028, 0.004]} />
            <meshBasicMaterial color="#b0bec5" transparent opacity={0.95} depthWrite={false} />
          </mesh>
          {/* 红色绝缘手柄 */}
          <mesh position={[1.02, 0, 0]}>
            <boxGeometry args={[0.2, 0.075, 0.005]} />
            <meshBasicMaterial color="#c62828" transparent opacity={0.95} depthWrite={false} />
          </mesh>
        </group>
        <Badge text={closed ? '闭合' : '断开'} position={[0, s.h + 0.02, 0.01]} height={0.08} color={closed ? '#7ce8b0' : '#ff9d95'} />
      </Card>
      <Term portIdx={0} position={s.terms[0]} onHover={onTermHover} onClick={onTermClick} onDown={onTermDown} />
      <Term portIdx={1} position={s.terms[1]} onHover={onTermHover} onClick={onTermClick} onDown={onTermDown} />
    </group>
  )
}

/* ══════════════ 滑线变阻器 ══════════════ */
export function Rheostat3D({ comp = {}, onTermHover, onTermClick, onTermDown }) {
  const tex = useEquipTexture('rheostat')
  const s = SPEC2.rheostat
  const R = comp.props?.resistance ?? 20
  const maxR = comp.props?.maxR ?? 50
  const t = Math.max(0, Math.min(1, R / maxR))
  const sliderRef = useRef()
  useFrame(() => {
    if (sliderRef.current) {
      const x = -s.w * 0.3 + t * s.w * 0.6
      sliderRef.current.position.x += (x - sliderRef.current.position.x) * 0.25
    }
  })
  return (
    <group>
      <Card tex={tex} w={s.w} h={s.h}>
        <group ref={sliderRef} position={[0, s.h * 0.62, 0.015]}>
          <mesh>
            <boxGeometry args={[0.05, s.h * 0.32, 0.003]} />
            <meshBasicMaterial color="#ffd166" transparent opacity={0.82} depthWrite={false} />
          </mesh>
        </group>
        <Badge text={`${Math.round(R)}Ω`} position={[0, s.h + 0.02, 0.01]} height={0.07} color="#ffd8a8" />
      </Card>
      <Term portIdx={0} position={s.terms[0]} onHover={onTermHover} onClick={onTermClick} onDown={onTermDown} />
      <Term portIdx={1} position={s.terms[1]} onHover={onTermHover} onClick={onTermClick} onDown={onTermDown} />
    </group>
  )
}

/* ══════════════ 定值电阻 ══════════════ */
export function Resistor3D({ comp = {}, onTermHover, onTermClick, onTermDown }) {
  const tex = useEquipTexture('resistor')
  const s = SPEC2.resistor
  const R = comp.props?.resistance ?? 10
  return (
    <group>
      <Card tex={tex} w={s.w} h={s.h}>
        <Badge text={`${R}Ω`} position={[0, s.h * 0.58, 0.01]} height={0.08} color="#f5e6d0" />
      </Card>
      <Term portIdx={0} position={s.terms[0]} onHover={onTermHover} onClick={onTermClick} onDown={onTermDown} />
      <Term portIdx={1} position={s.terms[1]} onHover={onTermHover} onClick={onTermClick} onDown={onTermDown} />
    </group>
  )
}

/* ══════════════ 小灯泡（亮度随电路） ══════════════ */
export function Bulb3D({ comp = {}, results, onTermHover, onTermClick, onTermDown }) {
  const tex = useEquipTexture('bulb')
  const s = SPEC2.bulb
  const bs = results && comp.id ? bulbState(comp, results) : { brightness: 0 }
  const glow = Math.max(0, Math.min(1, bs.brightness || 0))
  const lightRef = useRef()
  useFrame((_, dt) => {
    if (!lightRef.current) return
    const target = glow > 0.03 ? 0.3 + glow * 3.4 : 0
    lightRef.current.intensity += (target - lightRef.current.intensity) * Math.min(1, dt * 6)
  })
  const dim = 0.3 + glow * 0.7
  return (
    <group>
      <Card tex={tex} w={s.w} h={s.h} color={new THREE.Color(dim, dim * (0.92 + glow * 0.08), dim * (0.8 + glow * 0.2))}>
        {glow > 0.05 && (
          <mesh position={[0, s.h * 0.55, 0.012]}>
            <planeGeometry args={[s.w * 1.5, s.h * 1.5]} />
            <meshBasicMaterial color="#ffc846" transparent opacity={glow * 0.18} depthWrite={false} />
          </mesh>
        )}
      </Card>
      <pointLight ref={lightRef} position={[0, s.h * 0.6, 0.35]} color="#ffe082" intensity={0} distance={5} decay={1.8} />
      <Term portIdx={0} position={s.terms[0]} onHover={onTermHover} onClick={onTermClick} onDown={onTermDown} />
      <Term portIdx={1} position={s.terms[1]} onHover={onTermHover} onClick={onTermClick} onDown={onTermDown} />
    </group>
  )
}
