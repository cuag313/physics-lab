/**
 * simple3d/Meters3d.jsx — 人教版 J0407 电流表 / J0408 电压表
 *
 * 形态（用户拍板）：炭黑圆角方壳 4:3 + 前表面参考图贴图（刻度/数字/A|V/指针全来自贴图）
 * + 表盘细银边 + 玻璃斜向高光 + 底部三扁平接线柱（左黑 −/中红 0.6A|3V/右红 3A|15V）。
 * 贴图法基线 = sandbox3d/components3d/Ammeter.jsx（用户已验收），此处放大到简单电路台面比例。
 */

import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { Text } from '@react-three/drei'

/* 简单电路台面比例：与 SlabBase 宽 2.1 的器材同框不突兀 */
const W = 1.56
const H = 1.17
const D = 0.72

/* 表盘（贴图内白色圆角矩形）→ 前表面局部坐标。
   贴图 Y 翻转：图像顶部 → 前表面顶部。比例沿用已验收的 24/248、30/210。 */
function dialRect(w, h) {
  return {
    x0: -w / 2 + (24 / 256) * w,
    x1: -w / 2 + (248 / 256) * w,
    y0: h * (1 - 210 / 256),
    y1: h * (1 - 30 / 256),
  }
}
const DIAL = dialRect(W, H)

/* 三接线柱横排（底部前缘）：左 − / 中小量程 / 右大量程 */
const TERM_X = [-0.46, 0, 0.46]
/** 导线锚点（螺帽中段高度，与 FlatPost 帽心对齐） */
export const METER_TERMS = TERM_X.map((x) => [x, 0.13, D / 2 + 0.035])

/* 炭黑壳（与参考图壳色 #20242a 一致） */
const SHELL = '#20242a'
const SHELL_DARK = '#161a1f'
const BRASS = '#c9a227'
const CAP_BLACK = '#1b1b1b'
const CAP_RED = '#c62828'

/* ───────────── 扁平接线柱：矮黄铜底座 + 顶部圆帽 ───────────── */
function FlatPost({ x, capColor }) {
  return (
    <group position={[x, 0, D / 2 + 0.035]}>
      {/* 矮黄铜底座 */}
      <mesh castShadow position={[0, 0.055, 0]}>
        <cylinderGeometry args={[0.055, 0.062, 0.06, 20]} />
        <meshStandardMaterial color={BRASS} roughness={0.35} metalness={0.85} />
      </mesh>
      {/* 顶部圆帽 */}
      <mesh castShadow position={[0, 0.115, 0]}>
        <cylinderGeometry args={[0.075, 0.075, 0.06, 22]} />
        <meshStandardMaterial color={capColor} roughness={0.4} metalness={0.15} />
      </mesh>
      <mesh position={[0, 0.148, 0]} scale={[1, 0.5, 1]}>
        <sphereGeometry args={[0.075, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={capColor} roughness={0.4} metalness={0.15} />
      </mesh>
    </group>
  )
}

/* ───────────── 电表主体（ammeter / voltmeter 共用） ───────────── */
function MeterBox({ image, label, labels }) {
  const [tex, setTex] = useState(null)

  useEffect(() => {
    let alive = true
    new THREE.TextureLoader().load(image, (t) => {
      if (!alive) return
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 8
      t.minFilter = THREE.LinearFilter
      setTex(t)
    })
    return () => { alive = false }
  }, [image])

  const cx = (DIAL.x0 + DIAL.x1) / 2
  const cy = DIAL.y0 + (DIAL.y1 - DIAL.y0) * 0.45

  return (
    <group>
      {/* 底部托垫：让电表「坐」在台面上 */}
      <mesh receiveShadow position={[0, 0.022, 0]}>
        <boxGeometry args={[W * 1.02, 0.045, D * 1.02]} />
        <meshStandardMaterial color={SHELL_DARK} roughness={0.6} metalness={0.2} />
      </mesh>

      {/* 炭黑圆角方壳 */}
      <mesh castShadow receiveShadow position={[0, H / 2 + 0.045, 0]}>
        <boxGeometry args={[W, H, D]} />
        <meshStandardMaterial color={SHELL} roughness={0.5} metalness={0.32} />
      </mesh>
      {/* 顶部微凸盖（实物外壳顶面略高出前框） */}
      <mesh castShadow position={[0, H + 0.045, 0]}>
        <boxGeometry args={[W * 0.985, 0.035, D * 0.985]} />
        <meshStandardMaterial color={SHELL_DARK} roughness={0.55} metalness={0.28} />
      </mesh>

      {/* 前表面表盘贴图（贴图四周透明区/壳色即黑壳） */}
      {tex && (
        <mesh position={[0, H / 2 + 0.045, D / 2 + 0.008]}>
          <planeGeometry args={[W, H]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
      )}

      {/* 玻璃斜向高光（左上→右下） */}
      <mesh position={[cx, cy, D / 2 + 0.018]} rotation={[0, 0, -0.6]}>
        <planeGeometry args={[W * 0.55, 0.055]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.16} depthWrite={false} />
      </mesh>

      {/* 品牌丝印（壳顶右上角小白字，实物常见铭牌位） */}
      <Text position={[W * 0.32, H + 0.075, D * 0.18]} fontSize={0.07} color="#8a919b" anchorX="center" anchorY="middle">
        {label}
      </Text>

      {/* 三扁平接线柱 */}
      <FlatPost x={TERM_X[0]} capColor={CAP_BLACK} />
      <FlatPost x={TERM_X[1]} capColor={CAP_RED} />
      <FlatPost x={TERM_X[2]} capColor={CAP_RED} />

      {/* 底部面板丝印（白字，位于接线柱正下方） */}
      {labels.map((t, i) => (
        <Text
          key={t}
          position={[TERM_X[i], 0.052, D / 2 + 0.012]}
          fontSize={0.085}
          color="#e8eaed"
          anchorX="center"
          anchorY="middle"
        >
          {t}
        </Text>
      ))}
    </group>
  )
}

/* J0407 直流电流表：0~0.6A / 0~3A */
export function Ammeter3D() {
  return (
    <MeterBox
      image="/physics-lab/assets/ammeter.png"
      label="J0407"
      labels={['−', '0.6A', '3A']}
    />
  )
}

/* J0408 直流电压表：0~3V / 0~15V */
export function Voltmeter3D() {
  return (
    <MeterBox
      image="/physics-lab/assets/voltmeter.png"
      label="J0408"
      labels={['−', '3V', '15V']}
    />
  )
}
