/**
 * sandbox3d/wires3d.js — 管状导线 + 插头护套 + 接线预览线
 *
 * 阶段 B 接线时使用；阶段 A 先提供渲染基元（不放进 useFrame，无状态）。
 * 导线为 CatmullRomCurve3 + TubeGeometry，两端加香蕉插头护套。
 */

import { useMemo } from 'react'
import * as THREE from 'three'

/** 点数组 → CatmullRomCurve3（两点时自动补一个轻微下垂的中点） */
export function wireCurve(points, sag = 0.1) {
  const pts = points.map((p) => new THREE.Vector3(p[0], p[1], p[2]))
  if (pts.length === 2) {
    const mid = pts[0].clone().add(pts[1]).multiplyScalar(0.5)
    mid.y -= sag
    return new THREE.CatmullRomCurve3([pts[0], mid, pts[1]])
  }
  return new THREE.CatmullRomCurve3(pts)
}

/** 插头护套：在曲线端点沿切向伸出的橡胶套 + 金属头 */
function Plug({ position, tangent, color = '#1a1a1a' }) {
  const rot = useMemo(() => {
    const m = new THREE.Matrix4()
    const up = new THREE.Vector3(0, 1, 0)
    const axis = new THREE.Vector3().crossVectors(up, tangent).normalize()
    const angle = Math.acos(THREE.MathUtils.clamp(up.dot(tangent), -1, 1))
    if (axis.lengthSq() < 1e-6) return [0, 0, 0]
    m.makeRotationAxis(axis, angle)
    const e = new THREE.Euler().setFromRotationMatrix(m)
    return [e.x, e.y, e.z]
  }, [tangent])

  return (
    <group position={position} rotation={rot}>
      <mesh castShadow>
        <cylinderGeometry args={[0.035, 0.04, 0.09, 16]} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.15} />
      </mesh>
      <mesh position={[0, 0.075, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.07, 16]} />
        <meshStandardMaterial color="#c9a227" roughness={0.32} metalness={0.9} />
      </mesh>
    </group>
  )
}

/** 一条已接好的导线 */
export function Wire3D({ points = [], color = '#e53935', radius = 0.02, plugColor }) {
  const curve = useMemo(() => (points.length >= 2 ? wireCurve(points) : null), [points])
  const tangents = useMemo(() => {
    if (!curve) return []
    return [
      curve.getTangentAt(0).normalize(),
      curve.getTangentAt(1).normalize(),
    ]
  }, [curve])

  if (!curve) return null

  return (
    <group>
      <mesh castShadow>
        <tubeGeometry args={[curve, 24, radius, 8, false]} />
        <meshStandardMaterial color={color} roughness={0.45} metalness={0.3} />
      </mesh>
      <Plug position={curve.getPointAt(0)} tangent={tangents[0]} color={plugColor ?? '#1a1a1a'} />
      <Plug position={curve.getPointAt(1)} tangent={tangents[1].clone().negate()} color={plugColor ?? '#c62828'} />
    </group>
  )
}

/** 接线预览线：虚线感（用低不透明度的细管），吸附到目标时变绿 */
export function WirePreview({ from, to, snapped = false }) {
  const points = useMemo(() => (from && to ? [[from[0], from[1], from[2]], [to[0], to[1], to[2]]] : []), [from, to])
  const curve = useMemo(() => (points.length >= 2 ? wireCurve(points, 0.05) : null), [points])
  if (!curve) return null
  return (
    <mesh renderOrder={3}>
      <tubeGeometry args={[curve, 16, 0.012, 6, false]} />
      <meshBasicMaterial color={snapped ? '#3ddc84' : '#9fb3c4'} transparent opacity={snapped ? 0.9 : 0.55} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}
