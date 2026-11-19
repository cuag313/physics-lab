/* ⚡ 电动机本体 —— 真 3D（R3F/three），照 NOBOOK 那台器材的比例与配色建模。
 *
 * 为什么上 3D：2D canvas 无论怎么画渐变/倒角，都画不出"孔是通的、块有厚度、光有方向"。
 * 参照物是项目素材库里的 `public/assets/iconsnewname/电磁学实验装置.png`（NB 同款）：
 *   红 N 块 / 蓝 S 块中间留一个正圆通孔；线圈是一根红→蓝渐变的铜条框；
 *   下方换向器是「灰色外壳环 + 左右两片红蓝半环 + 白色轴孔」；两侧两块黑电刷压住它。
 * 这里用同一套办法做：极靴 = Shape(矩形挖半圆) 沿 z 挤出（ExtrudeGeometry + bevel）
 *   → 中间是真通孔，孔壁就是挤出的内侧面，有光自然有明暗。
 *
 * 坐标系：正交相机，1 单位 = 1 设计像素（与 ElectricMotorScene 的 D 完全同一套），
 * 所以 2D 画的电路、电流符号、标注都能和 3D 的线圈、电刷像素级对齐。
 * 3D 里 y 向上，2D 设计坐标 y 向下 → 以孔心为原点建模，再用 group.position 搬到 (cx, cy)。
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

const R = 116          // 腔体（通孔）半径
const W = 56           // 极靴厚度（沿 x 的块宽）
const HY = 112         // 极靴半高
const DEPTH = 66       // 极靴沿 z 的厚度（孔的深度）
const AH = 66          // 线圈半宽（= D.aH）
const BH = 50          // 线圈半高（= D.bH）
const TUBE = 3.4       // 线圈铜条半径
const EGY = 124        // 换向器中心到孔心的距离（= D.egy - D.cy）
const EG_R = 26.5      // 换向器灰色外壳外半径
const EG_RM = 21.5     // 外壳内沿 = 半环外沿
const EG_RIN = 7.5     // 轴孔半径
const EG_D = 9         // 换向器厚度
const BR_DX = 35       // 电刷中心到轴的距离（= D.brushDx）
const BASE_Y = -152    // 底座台面上表面的 y（换向器下方 28 单位）
const POST_DX = 152    // 接线柱离轴的距离（2D 电路的接线点也在 cx ± 152）

const C_RED = new THREE.Color('#E23B3B')
const C_BLUE = new THREE.Color('#2E6BE5')
const C_OFF = new THREE.Color('#8E8275')

/* 极靴平面形状：外矩内弧（弧 = 孔壁）—— left: 逆时针走圆弧，right: 顺时针 */
function poleShape(dir) {
  const ax = Math.sqrt(Math.max(1, R * R - HY * HY))
  const xOut = dir * (R + W)
  const xIn = dir * ax
  const s = new THREE.Shape()
  s.moveTo(xOut, HY)
  s.lineTo(xIn, HY)
  s.absarc(0, 0, R, Math.atan2(HY, xIn), Math.atan2(-HY, xIn), dir > 0)
  s.lineTo(xOut, -HY)
  s.closePath()
  return s
}

/* 环形扇片：外弧 + 内弧围成一圈，沿 z 挤出 */
function ringShape(a0, a1, rOut = EG_R, rIn = EG_RIN) {
  const s = new THREE.Shape()
  s.moveTo(Math.cos(a0) * rOut, Math.sin(a0) * rOut)
  s.absarc(0, 0, rOut, a0, a1, false)
  s.absarc(0, 0, rIn, a1, a0, true)
  s.closePath()
  return s
}

function makeLetterTexture(ch, color) {
  const c = document.createElement('canvas')
  c.width = 128; c.height = 128
  const g = c.getContext('2d')
  g.clearRect(0, 0, 128, 128)
  g.font = '900 100px "Microsoft YaHei", system-ui, sans-serif'
  g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillStyle = 'rgba(0,0,0,0.18)'
  g.fillText(ch, 65, 67)
  g.fillStyle = color
  g.fillText(ch, 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.anisotropy = 4
  return t
}

/* 任意两点之间的铜管 */
function Seg({ from, to, r = 1.6, color = '#B87333', metal = 0.5, rough = 0.38 }) {
  const m = useMemo(() => {
    const v1 = new THREE.Vector3(...from), v2 = new THREE.Vector3(...to)
    const d = v2.clone().sub(v1)
    const len = d.length()
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())
    return { pos: v1.clone().add(v2).multiplyScalar(0.5).toArray(), q, len }
  }, [from, to])
  return (
    <mesh position={m.pos} quaternion={m.q} castShadow>
      <cylinderGeometry args={[r, r, m.len, 14]} />
      <meshStandardMaterial color={color} metalness={metal} roughness={rough} />
    </mesh>
  )
}

/* 一根"红→蓝渐变"的铜条：沿 u∈[0,1] 的起止色插值，拆成 N 段短柱，
   换向（或断电）时只更新这几个材质的颜色，不必每帧重建几何 */
const GRAD_SEGS = 7

function GradBar({ from, to, r = TUBE, matRefs, idx }) {
  const parts = useMemo(() => {
    const v1 = new THREE.Vector3(...from), v2 = new THREE.Vector3(...to)
    const out = []
    for (let i = 0; i < GRAD_SEGS; i++) {
      const t0 = i / GRAD_SEGS, t1 = (i + 1) / GRAD_SEGS
      const p0 = v1.clone().lerp(v2, t0), p1 = v1.clone().lerp(v2, t1)
      const d = p1.clone().sub(p0)
      const len = d.length() + r * 1.4   // 相邻段重叠一点，避免看到接缝
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize())
      out.push({ pos: p0.clone().add(p1).multiplyScalar(0.5).toArray(), q, len, t: (t0 + t1) / 2 })
    }
    return out
  }, [from, to, r])
  return parts.map((p, i) => (
    <mesh key={i} position={p.pos} quaternion={p.q} castShadow>
      <cylinderGeometry args={[r, r, p.len, 12]} />
      <meshStandardMaterial ref={(el) => { if (el) matRefs.current[idx + i] = el }} color="#DC2626" metalness={0.42} roughness={0.34} />
    </mesh>
  ))
}

/* ─────────── 场景内部 ─────────── */
function MotorBody({ getState }) {
  const coilRef = useRef(), comRef = useRef()
  const matL = useRef(), matR = useRef()
  const sprN1 = useRef(), sprS1 = useRef(), sprN2 = useRef(), sprS2 = useRef()
  const segHalf0 = useRef(), segHalf1 = useRef()
  const coilMats = useRef([])
  const lastSign = useRef(999)
  const texN = useMemo(() => makeLetterTexture('N', '#ffffff'), [])
  const texS = useMemo(() => makeLetterTexture('S', '#ffffff'), [])

  const geoL = useMemo(() => new THREE.ExtrudeGeometry(poleShape(-1), {
    depth: DEPTH, bevelEnabled: true, bevelSize: 2.6, bevelThickness: 2.6, bevelSegments: 3, curveSegments: 48,
  }), [])
  const geoR = useMemo(() => new THREE.ExtrudeGeometry(poleShape(1), {
    depth: DEPTH, bevelEnabled: true, bevelSize: 2.6, bevelThickness: 2.6, bevelSegments: 3, curveSegments: 48,
  }), [])
  /* 换向器：左右两片半环（中间留 1.2° 绝缘缝）+ 一圈灰色外壳 */
  const geoC0 = useMemo(() => new THREE.ExtrudeGeometry(ringShape(-Math.PI / 2 + 0.011, Math.PI / 2 - 0.011, EG_RM, EG_RIN), {
    depth: EG_D, bevelEnabled: true, bevelSize: 0.8, bevelThickness: 0.8, bevelSegments: 2, curveSegments: 32,
  }), [])
  const geoC1 = useMemo(() => new THREE.ExtrudeGeometry(ringShape(Math.PI / 2 + 0.011, Math.PI * 1.5 - 0.011, EG_RM, EG_RIN), {
    depth: EG_D, bevelEnabled: true, bevelSize: 0.8, bevelThickness: 0.8, bevelSegments: 2, curveSegments: 32,
  }), [])
  const geoShell = useMemo(() => new THREE.ExtrudeGeometry(ringShape(0, Math.PI * 2, EG_R, EG_RM), {
    depth: EG_D * 1.05, bevelEnabled: true, bevelSize: 0.8, bevelThickness: 0.8, bevelSegments: 2, curveSegments: 40,
  }), [])

  useFrame(() => {
    const s = getState()
    const theta = s.theta || 0
    if (coilRef.current) coilRef.current.rotation.y = theta
    /* 换向器：与线圈同相地"换边"。它是朝向观察者的圆环，绕 z 自转，从正面看永远是圆，
       只有两片半环的绝缘缝在转 —— NB 也是这样读的。 */
    if (comRef.current) comRef.current.rotation.z = theta
    /* 磁场方向：N 在左（field=true）还是 S 在左 —— 块色与字母一起换 */
    const leftIsN = s.field !== false
    if (matL.current) matL.current.color.set(leftIsN ? '#D8302F' : '#2E6BE5')
    if (matR.current) matR.current.color.set(leftIsN ? '#2E6BE5' : '#D8302F')
    if (sprN1.current) sprN1.current.visible = leftIsN
    if (sprS1.current) sprS1.current.visible = !leftIsN
    if (sprN2.current) sprN2.current.visible = !leftIsN
    if (sprS2.current) sprS2.current.visible = leftIsN
    /* 电流方向：决定线圈"红端→蓝端"的走向，以及换向器两片半环谁红谁蓝 */
    const iNow = typeof s.iNow === 'number' ? s.iNow : s.I
    const sgnI = Math.sign(iNow) || 0
    const curSign = sgnI * (s.commutator ? 1 : (Math.cos(theta) >= 0 ? 1 : -1))
    const on = s.switchClosed && Math.abs(iNow) > 0.02
    const key = on ? curSign : 0
    if (key !== lastSign.current) {
      lastSign.current = key
      const a = key === 0 ? C_OFF.clone() : (key > 0 ? C_RED.clone() : C_BLUE.clone())
      const b = key === 0 ? C_OFF.clone() : (key > 0 ? C_BLUE.clone() : C_RED.clone())
      const tmp = new THREE.Color()
      let n = 0
      for (const m of coilMats.current) {
        if (!m) continue
        const u = n / (coilMats.current.length - 1)
        const k = Math.min(1, Math.max(0, (u - 0.455) / 0.09))   // 两侧竖边保持纯色，只在顶边过渡
        m.color.copy(tmp.copy(a).lerp(b, k))
        n++
      }
      if (segHalf0.current) segHalf0.current.color.copy(key >= 0 ? C_RED : C_BLUE)
      if (segHalf1.current) segHalf1.current.color.copy(key >= 0 ? C_BLUE : C_RED)
    }
  })

  return (
    <group>
      {/* 两块极靴：内侧面就是孔壁（通孔是真的，没有一块"挡在后面"的板） */}
      <mesh geometry={geoL} position={[0, 0, -DEPTH / 2]} castShadow receiveShadow>
        <meshStandardMaterial ref={matL} color="#D8302F" metalness={0.14} roughness={0.4} />
      </mesh>
      <mesh geometry={geoR} position={[0, 0, -DEPTH / 2]} castShadow receiveShadow>
        <meshStandardMaterial ref={matR} color="#2E6BE5" metalness={0.14} roughness={0.4} />
      </mesh>
      {/* N / S：两套 sprite 靠 visible 切换（磁场反向时字母跟着换边） */}
      <sprite ref={sprN1} position={[-(R + W / 2), 2, DEPTH / 2 + 26]} scale={[72, 72, 1]} renderOrder={3}>
        <spriteMaterial map={texN} transparent depthTest={false} depthWrite={false} />
      </sprite>
      <sprite ref={sprS1} position={[-(R + W / 2), 2, DEPTH / 2 + 26]} scale={[72, 72, 1]} renderOrder={3} visible={false}>
        <spriteMaterial map={texS} transparent depthTest={false} depthWrite={false} />
      </sprite>
      <sprite ref={sprN2} position={[(R + W / 2), 2, DEPTH / 2 + 26]} scale={[72, 72, 1]} renderOrder={3}>
        <spriteMaterial map={texN} transparent depthTest={false} depthWrite={false} />
      </sprite>
      <sprite ref={sprS2} position={[(R + W / 2), 2, DEPTH / 2 + 26]} scale={[72, 72, 1]} renderOrder={3} visible={false}>
        <spriteMaterial map={texS} transparent depthTest={false} depthWrite={false} />
      </sprite>

      {/* 转轴（竖直，贯穿孔，落到换向器） */}
      <mesh position={[0, (BH - EGY) / 2 - 4, 0]}>
        <cylinderGeometry args={[2.8, 2.8, BH + EGY + 8, 18]} />
        <meshStandardMaterial color="#B6BFC9" metalness={0.6} roughness={0.34} />
      </mesh>

      {/* 线圈：单匝开口框（左竖边 → 上边 → 右竖边，底边不闭合），绕竖直轴转；
          框条是"从红渐变到蓝"的，沿电流走向读色（与图标同款） */}
      <group ref={coilRef}>
        <GradBar from={[-AH, -BH, 0]} to={[-AH, BH, 0]} matRefs={coilMats} idx={0} />
        <GradBar from={[-AH, BH, 0]} to={[AH, BH, 0]} matRefs={coilMats} idx={GRAD_SEGS} />
        <GradBar from={[AH, BH, 0]} to={[AH, -BH, 0]} matRefs={coilMats} idx={GRAD_SEGS * 2} />
        {/* 两条引线：从开口两端直插换向器 */}
        <Seg from={[-AH, -BH, 0]} to={[-7, -EGY + 6, 0]} r={1.5} color="#B87333" />
        <Seg from={[AH, -BH, 0]} to={[7, -EGY + 6, 0]} r={1.5} color="#B87333" />
      </group>

      {/* 换向器：灰色外壳环（不转）+ 两片红蓝半环（跟着转）+ 白色轴孔 */}
      <group position={[0, -EGY, 0]}>
        <mesh geometry={geoShell} position={[0, 0, -EG_D / 2 - 0.4]}>
          <meshStandardMaterial color="#9DA7B2" metalness={0.45} roughness={0.42} />
        </mesh>
        <group ref={comRef}>
          <mesh geometry={geoC0} position={[0, 0, -EG_D / 2]}>
            <meshStandardMaterial ref={segHalf0} color="#E23B3B" metalness={0.3} roughness={0.32} />
          </mesh>
          <mesh geometry={geoC1} position={[0, 0, -EG_D / 2]}>
            <meshStandardMaterial ref={segHalf1} color="#2E6BE5" metalness={0.3} roughness={0.32} />
          </mesh>
        </group>
        <mesh position={[0, 0, -EG_D / 2 + 1]}>
          <cylinderGeometry args={[EG_RIN, EG_RIN, EG_D + 1.5, 24]} />
          <meshStandardMaterial color="#F7F2E8" metalness={0.05} roughness={0.7} />
        </mesh>
      </group>

      {/* 两个电刷（固定）：碳块压住换向片 */}
      {[-1, 1].map((sx) => (
        <mesh key={'br' + sx} position={[sx * BR_DX, -EGY, 0]}>
          <boxGeometry args={[12, 11, 17]} />
          <meshStandardMaterial color="#39414D" roughness={0.78} metalness={0.18} />
        </mesh>
      ))}

      {/* 底座 + 立柱 + 两个接线柱（照素材库图标：银灰台面、左黑右红香蕉插座） */}
      <group>
        {/* 台面（上小下大，像个铸铁台） */}
        <mesh position={[0, BASE_Y - 10, 0]}>
          <boxGeometry args={[352, 20, 88]} />
          <meshStandardMaterial color="#D8DFE7" metalness={0.3} roughness={0.45} />
        </mesh>
        <mesh position={[0, BASE_Y - 29, 0]}>
          <boxGeometry args={[368, 18, 96]} />
          <meshStandardMaterial color="#B7C1CB" metalness={0.28} roughness={0.52} />
        </mesh>
        {/* 立柱：把换向器撑在台面上 */}
        <mesh position={[0, -EGY - (Math.abs(BASE_Y) - EGY) / 2, 0]}>
          <boxGeometry args={[22, Math.abs(BASE_Y) - EGY - EG_D / 2, 38]} />
          <meshStandardMaterial color="#C4CCD5" metalness={0.34} roughness={0.44} />
        </mesh>
        {/* 接线柱：左黑右红 */}
        {[-1, 1].map((sx) => (
          <group key={'po' + sx} position={[sx * POST_DX, BASE_Y, 0]}>
            <mesh position={[0, 6, 0]}>
              <cylinderGeometry args={[6.6, 7.6, 12, 18]} />
              <meshStandardMaterial color={sx < 0 ? '#33383F' : '#C6303A'} metalness={0.42} roughness={0.4} />
            </mesh>
            <mesh position={[0, 13, 0]}>
              <cylinderGeometry args={[8.8, 8.8, 4, 18]} />
              <meshStandardMaterial color={sx < 0 ? '#3D434B' : '#D8393F'} metalness={0.4} roughness={0.42} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  )
}

/* 正交相机自己锁死视锥：canvas 的 CSS 尺寸 = vw*sc × vh*sc，视锥 = vw × vh 单位
   → 1 单位正好 = sc 个 CSS 像素，与 2D 层同一套设计坐标严丝合缝（R3F 会在 resize 时覆盖，所以每帧校正） */
function LockCamera({ vw, vh }) {
  const { camera } = useThree()
  useFrame(() => {
    const c = camera
    if (c.left !== -vw / 2 || c.right !== vw / 2 || c.zoom !== 1) {
      c.left = -vw / 2; c.right = vw / 2; c.top = vh / 2; c.bottom = -vh / 2
      c.zoom = 1; c.updateProjectionMatrix()
    }
  })
  return null
}

export default function Motor3D({ sc, ox, oy, vw, vh, cx, cy, getState }) {
  return (
    <Canvas
      orthographic
      dpr={Math.min(2, window.devicePixelRatio || 1)}
      gl={{ alpha: true, antialias: true }}
      camera={{ position: [0, 0, 1200], left: -vw / 2, right: vw / 2, top: vh / 2, bottom: -vh / 2, near: 0.5, far: 4000 }}
      style={{ position: 'absolute', left: ox, top: oy, width: vw * sc, height: vh * sc, pointerEvents: 'none' }}
    >
      <LockCamera vw={vw} vh={vh} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[-560, 860, 940]} intensity={1.2} color="#ffffff" />
      <directionalLight position={[720, -260, 700]} intensity={0.48} color="#d9e6ff" />
      <directionalLight position={[120, 380, -900]} intensity={0.4} color="#ffe9cc" />
      <group position={[cx - vw / 2, vh / 2 - cy, 0]}>
        {/* 微微斜一点：正对着看两块板就成了平面贴纸，斜一点才露出孔的深度与块的顶面 */}
        <group rotation={[0.035, 0.1, 0]}>
          <MotorBody getState={getState} />
        </group>
      </group>
    </Canvas>
  )
}
