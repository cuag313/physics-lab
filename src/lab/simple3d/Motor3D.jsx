/* ⚡ 电动机本体 —— 真 3D（R3F/three），按 NOBOOK 的器材比例建模。
 *
 * 为什么上 3D：2D canvas 无论怎么画渐变/倒角，都画不出"孔是通的、块有厚度、光有方向"。
 * NB 的那台电动机就是 3D 渲染（透视、明暗、投影都是算出来的）。这里用同一套办法：
 *   两块极靴 = 用 Shape(矩形挖半圆) 沿 z 挤出（ExtrudeGeometry + bevel）→ 中间自然留出一个**真通孔**；
 *   孔壁 = 挤出的内侧面，有光就有明暗，不用再"画"假孔壁。
 *
 * 坐标系：正交相机，1 单位 = 1 设计像素（与 ElectricMotorScene 的 D 完全同一套坐标系），
 * 所以 2D 画的电路、电流符号、标注都能和 3D 的线圈、电刷像素级对齐。
 * 3D 里 y 向上，2D 设计坐标 y 向下 → 组整体绕原点建模，用 group.position 把孔心搬到 (cx, cy)。
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
const TUBE = 3.6       // 铜管半径
const EGY = 124        // 换向器中心到孔心的距离（= D.egy - D.cy）
const EG_R = 26        // 换向器外半径（= D.egyR）
const EG_RIN = 11      // 换向器轴孔半径
const EG_D = 8         // 换向器厚度
const BR_DX = 35       // 电刷中心到轴的距离（= D.brushDx）

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

/* 半环（换向片）：外弧 + 内弧围成一条铜箍，沿 z 挤出 */
function ringShape(a0, a1) {
  const s = new THREE.Shape()
  s.moveTo(Math.cos(a0) * EG_R, Math.sin(a0) * EG_R)
  s.absarc(0, 0, EG_R, a0, a1, false)
  s.absarc(0, 0, EG_RIN, a1, a0, true)
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
    return { pos: v1.add(v2).multiplyScalar(0.5).toArray(), q, len }
  }, [from, to])
  return (
    <mesh position={m.pos} quaternion={m.q} castShadow>
      <cylinderGeometry args={[r, r, m.len, 14]} />
      <meshStandardMaterial color={color} metalness={metal} roughness={rough} />
    </mesh>
  )
}

/* ─────────── 场景内部 ─────────── */
function MotorBody({ getState }) {
  const coilRef = useRef(), comRef = useRef()
  const matL = useRef(), matR = useRef()
  const sprN1 = useRef(), sprS1 = useRef(), sprN2 = useRef(), sprS2 = useRef()
  const colL = useRef(), colR = useRef(), colTop = useRef()
  const texN = useMemo(() => makeLetterTexture('N', '#ffffff'), [])
  const texS = useMemo(() => makeLetterTexture('S', '#ffffff'), [])

  const geoL = useMemo(() => new THREE.ExtrudeGeometry(poleShape(-1), {
    depth: DEPTH, bevelEnabled: true, bevelSize: 2.2, bevelThickness: 2.2, bevelSegments: 2, curveSegments: 40,
  }), [])
  const geoR = useMemo(() => new THREE.ExtrudeGeometry(poleShape(1), {
    depth: DEPTH, bevelEnabled: true, bevelSize: 2.2, bevelThickness: 2.2, bevelSegments: 2, curveSegments: 40,
  }), [])
  const geoC0 = useMemo(() => new THREE.ExtrudeGeometry(ringShape(-Math.PI / 2, Math.PI / 2), {
    depth: EG_D, bevelEnabled: true, bevelSize: 0.7, bevelThickness: 0.7, bevelSegments: 1, curveSegments: 28,
  }), [])
  const geoC1 = useMemo(() => new THREE.ExtrudeGeometry(ringShape(Math.PI / 2, Math.PI * 1.5), {
    depth: EG_D, bevelEnabled: true, bevelSize: 0.7, bevelThickness: 0.7, bevelSegments: 1, curveSegments: 28,
  }), [])

  useFrame(() => {
    const s = getState()
    const theta = s.theta || 0
    if (coilRef.current) coilRef.current.rotation.y = theta
    /* 换向器：与线圈同相地"换边"。它是朝向观察者的圆环，绕 z 自转，从正面看永远是圆，
       只有绝缘缝在转 —— NB 也是这样读的。 */
    if (comRef.current) comRef.current.rotation.z = theta
    /* 磁场方向：N 在左（field=true）还是 S 在左 —— 块色与字母一起换 */
    const leftIsN = s.field !== false
    if (matL.current) matL.current.color.set(leftIsN ? '#D63031' : '#2F6FE8')
    if (matR.current) matR.current.color.set(leftIsN ? '#2F6FE8' : '#D63031')
    if (sprN1.current) sprN1.current.visible = leftIsN
    if (sprS1.current) sprS1.current.visible = !leftIsN
    if (sprN2.current) sprN2.current.visible = !leftIsN
    if (sprS2.current) sprS2.current.visible = leftIsN
    /* 线圈通电时的红/蓝：电流从哪端进出由 curSign 决定（与 2D 同一口径） */
    const iNow = typeof s.iNow === 'number' ? s.iNow : s.I
    const sgnI = Math.sign(iNow) || 0
    const curSign = sgnI * (s.commutator ? 1 : (Math.cos(theta) >= 0 ? 1 : -1))
    const on = s.switchClosed && Math.abs(iNow) > 0.02
    const cR2 = on ? (curSign > 0 ? '#DC2626' : '#2563EB') : '#9A8A76'
    const cL2 = on ? (curSign > 0 ? '#2563EB' : '#DC2626') : '#9A8A76'
    if (colR.current) colR.current.color.set(cR2)
    if (colL.current) colL.current.color.set(cL2)
    if (colTop.current) colTop.current.color.set(cR2)
  })

  return (
    <group>
      {/* 两块极靴：内侧面就是孔壁（通孔是真的，没有一块"挡在后面"的板） */}
      <mesh geometry={geoL} position={[0, 0, -DEPTH / 2]} castShadow receiveShadow>
        <meshStandardMaterial ref={matL} color="#D63031" metalness={0.1} roughness={0.46} />
      </mesh>
      <mesh geometry={geoR} position={[0, 0, -DEPTH / 2]} castShadow receiveShadow>
        <meshStandardMaterial ref={matR} color="#2F6FE8" metalness={0.1} roughness={0.46} />
      </mesh>
      {/* N / S：两套 sprite 靠 visible 切换（磁场反向时字母跟着换边） */}
      <sprite ref={sprN1} position={[-(R + W / 2), 2, DEPTH / 2 + 26]} scale={[52, 52, 1]} renderOrder={3}>
        <spriteMaterial map={texN} transparent depthTest={false} depthWrite={false} />
      </sprite>
      <sprite ref={sprS1} position={[-(R + W / 2), 2, DEPTH / 2 + 26]} scale={[52, 52, 1]} renderOrder={3} visible={false}>
        <spriteMaterial map={texS} transparent depthTest={false} depthWrite={false} />
      </sprite>
      <sprite ref={sprN2} position={[(R + W / 2), 2, DEPTH / 2 + 26]} scale={[52, 52, 1]} renderOrder={3}>
        <spriteMaterial map={texN} transparent depthTest={false} depthWrite={false} />
      </sprite>
      <sprite ref={sprS2} position={[(R + W / 2), 2, DEPTH / 2 + 26]} scale={[52, 52, 1]} renderOrder={3} visible={false}>
        <spriteMaterial map={texS} transparent depthTest={false} depthWrite={false} />
      </sprite>

      {/* 转轴（竖直，贯穿孔，落到换向器） */}
      <mesh position={[0, (BH - EGY) / 2 - 4, 0]}>
        <cylinderGeometry args={[3.0, 3.0, BH + EGY + 8, 16]} />
        <meshStandardMaterial color="#AEB8C4" metalness={0.75} roughness={0.3} />
      </mesh>

      {/* 线圈：单匝开口框（左竖边 → 上边 → 右竖边，底边不闭合），绕竖直轴转 */}
      <group ref={coilRef}>
        <mesh position={[-AH, 0, 0]}>
          <cylinderGeometry args={[TUBE, TUBE, 2 * BH, 16]} />
          <meshStandardMaterial ref={colL} color="#2563EB" metalness={0.5} roughness={0.36} />
        </mesh>
        <mesh position={[AH, 0, 0]}>
          <cylinderGeometry args={[TUBE, TUBE, 2 * BH, 16]} />
          <meshStandardMaterial ref={colR} color="#DC2626" metalness={0.5} roughness={0.36} />
        </mesh>
        <mesh position={[0, BH, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[TUBE, TUBE, 2 * AH + 2 * TUBE, 16]} />
          <meshStandardMaterial ref={colTop} color="#DC2626" metalness={0.5} roughness={0.36} />
        </mesh>
        {/* 两条引线：从开口两端直插换向器 */}
        <Seg from={[-AH, -BH, 0]} to={[-7, -EGY + 8, 0]} r={1.5} color="#B87333" />
        <Seg from={[AH, -BH, 0]} to={[7, -EGY + 8, 0]} r={1.5} color="#B87333" />
      </group>

      {/* 换向器：两片半环（朝向观察者），中间的轴孔是黑的 */}
      <group ref={comRef} position={[0, -EGY, 0]}>
        <mesh geometry={geoC0} position={[0, 0, -EG_D / 2]}>
          <meshStandardMaterial color="#CE8330" metalness={0.3} roughness={0.3} />
        </mesh>
        <mesh geometry={geoC1} position={[0, 0, -EG_D / 2]}>
          <meshStandardMaterial color="#A65D22" metalness={0.28} roughness={0.34} />
        </mesh>
        <mesh position={[0, 0, -EG_D / 2 - 0.6]}>
          <cylinderGeometry args={[EG_RIN - 0.6, EG_RIN - 0.6, EG_D * 1.6, 20]} />
          <meshStandardMaterial color="#251708" roughness={0.85} metalness={0.1} />
        </mesh>
      </group>

      {/* 两个电刷（固定）：碳块压住换向片 */}
      {[-1, 1].map((sx) => (
        <mesh key={'br' + sx} position={[sx * BR_DX, -EGY, 0]}>
          <boxGeometry args={[12, 11, 16]} />
          <meshStandardMaterial color="#39414D" roughness={0.8} metalness={0.15} />
        </mesh>
      ))}
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
      <ambientLight intensity={0.66} />
      <directionalLight position={[-560, 860, 940]} intensity={1.25} color="#ffffff" />
      <directionalLight position={[720, -260, 700]} intensity={0.46} color="#d9e6ff" />
      <directionalLight position={[120, 380, -900]} intensity={0.4} color="#ffe9cc" />
      <group position={[cx - vw / 2, vh / 2 - cy, 0]}>
        {/* 微微斜一点（绕 y 9°、绕 x 3°）：正对着看两块板就成了平面贴纸，
            斜一点才露出孔的深度与块的顶面 —— NB 的立体感就是这么来的 */}
        <group rotation={[0.045, 0.13, 0]}>
          <MotorBody getState={getState} />
        </group>
      </group>
    </Canvas>
  )
}
