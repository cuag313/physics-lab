/**
 * components3d/Ammeter.jsx — 0~0.6A / 0~3A 直流电流表
 *
 * 炭黑圆角方壳（≈4:3）+ 前表面贴参考图（刻度/数字/A/指针全部来自贴图）
 * + 底部黑/红/红扁平接线柱 + 丝印 −/0.6A/3A + 表盘细银边框 + 玻璃斜高光。
 */

import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { RoundedBox, Text } from '@react-three/drei'
import { Terminal } from '../../three/ElectricInstruments3D.jsx'
import { terminalLocal } from '../model3d.js'

const AM_IMAGE = '/physics-lab/assets/ammeter.png'
const W = 1.2
const H = 0.9
const D = 0.26

// 表盘（贴图内白色圆角矩形）映射到前表面包围盒。纹理 Y 翻转：图像顶部 → 前表面顶部。
const DIAL = { x0: -0.4875, x1: 0.5625, y0: 0.1617, y1: 0.7945 }

function roundedRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
}

export default function Ammeter3D({ comp = {}, results, onTermHover, onTermClick }) {
  void comp
  void results
  const [tex, setTex] = useState(null)

  useEffect(() => {
    let alive = true
    new THREE.TextureLoader().load(AM_IMAGE, (t) => {
      if (!alive) return
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 8
      t.minFilter = THREE.LinearFilter
      setTex(t)
    })
    return () => { alive = false }
  }, [])

  const cx = (DIAL.x0 + DIAL.x1) / 2
  const cy = (DIAL.y0 + DIAL.y1) / 2
  const dw = DIAL.x1 - DIAL.x0
  const dh = DIAL.y1 - DIAL.y0

  // 表盘外圈细银边（圆角矩形环）
  const frameGeom = useMemo(() => {
    const t = 0.02
    const r = 0.08
    const shape = new THREE.Shape()
    roundedRect(shape, DIAL.x0 - t, DIAL.y0 - t, dw + 2 * t, dh + 2 * t, r)
    const hole = new THREE.Path()
    roundedRect(hole, DIAL.x0, DIAL.y0, dw, dh, r - t)
    shape.holes.push(hole)
    return new THREE.ShapeGeometry(shape)
  }, [])

  const t0 = terminalLocal('ammeter', 0)
  const t1 = terminalLocal('ammeter', 1)

  return (
    <group>
      {/* 炭黑圆角方壳 */}
      <RoundedBox args={[W, H, D]} radius={0.07} smoothness={4} castShadow receiveShadow position={[0, H / 2, 0]}>
        <meshStandardMaterial color="#20242a" roughness={0.5} metalness={0.3} />
      </RoundedBox>

      {/* 前表面表盘贴图（贴图四周透明边透出黑壳） */}
      {tex && (
        <mesh position={[0, H / 2, D / 2 + 0.006]}>
          <planeGeometry args={[W, H]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
      )}

      {/* 表盘外圈细银边（圆角矩形环） */}
      <mesh geometry={frameGeom} position={[0, 0, D / 2 + 0.012]}>
        <meshStandardMaterial color="#c7ccd4" roughness={0.25} metalness={0.9} />
      </mesh>

      {/* 玻璃斜向高光（左上→右下） */}
      <mesh position={[cx, cy, D / 2 + 0.02]} rotation={[0, 0, -0.6]}>
        <planeGeometry args={[0.62, 0.05]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.15} depthWrite={false} />
      </mesh>

      {/* 底部三扁平接线柱：左黑(−) / 中红(0.6A) / 右红(3A) */}
      <Terminal position={[t0[0], 0.05, D / 2 + 0.03]} color="#c9a227" height={0.06} capColor="#1b1b1b" />
      <Terminal position={[0, 0.05, D / 2 + 0.03]} color="#c9a227" height={0.06} capColor="#c62828" />
      <Terminal position={[t1[0], 0.05, D / 2 + 0.03]} color="#c9a227" height={0.06} capColor="#c62828" />

      {/* 底部面板丝印（白字，位于接线柱正下方） */}
      <Text position={[t0[0], 0.015, D / 2 + 0.014]} fontSize={0.075} color="#ffffff" anchorX="center" anchorY="middle">
        −
      </Text>
      <Text position={[0, 0.015, D / 2 + 0.014]} fontSize={0.075} color="#ffffff" anchorX="center" anchorY="middle">
        0.6A
      </Text>
      <Text position={[t1[0], 0.015, D / 2 + 0.014]} fontSize={0.075} color="#ffffff" anchorX="center" anchorY="middle">
        3A
      </Text>
    </group>
  )
}
