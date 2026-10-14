/**
 * ElectricLab3DScene — 3D 拟物电学实验台
 *
 * 目标：器材看起来像“真仪器”，不是示意图。
 * 交互：拖动旋转视角、开关闭合、调电压/变阻器、灯泡发光、电表指针。
 */

import { Suspense, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, ContactShadows } from '@react-three/drei'
import SceneShell from '../ui/SceneShell'
import {
  LabTable,
  Battery3D,
  Bulb3D,
  Switch3D,
  Meter3D,
  Resistor3D,
  Rheostat3D,
  Wire3D,
} from '../three/ElectricInstruments3D'

function CircuitRig({ closed, voltage, slider, brightness, current, onToggle }) {
  const wires = useMemo(() => {
    const V = voltage
    return [
      // 电池 + → 开关
      { color: '#e53935', points: [[1.7, 0.55, 0], [2.35, 0.7, 0], [2.7, 0.35, 0]] },
      // 开关 → 电流表
      { color: '#e53935', points: [[3.55, 0.35, 0], [3.9, 0.7, 0], [3.7, 0.45, 0.35]] },
      // 电流表 → 灯泡
      { color: '#e53935', points: [[3.35, 0.45, 0.55], [2.8, 0.85, 0.7], [1.95, 0.45, 0.7]] },
      // 灯泡 → 变阻器
      { color: '#e53935', points: [[1.35, 0.45, 0.7], [0.6, 0.85, 0.5], [0.55, 0.35, 0.15]] },
      // 变阻器 → 电池 −
      { color: '#1565c0', points: [[-1.25, 0.35, 0], [-1.85, 0.75, -0.15], [-2.1, 0.55, 0]] },
    ]
  }, [voltage])

  return (
    <group>
      <LabTable size={[10, 6]} />

      {/* 电池 */}
      <Battery3D position={[-2.2, 0, 0]} voltage={voltage} />

      {/* 开关 */}
      <Switch3D position={[2.1, 0, 0]} closed={closed} onToggle={onToggle} />

      {/* 电流表 */}
      <Meter3D
        position={[2.9, 0, 0.55]}
        kind="A"
        reading={current}
        range={3}
      />

      {/* 小灯泡 */}
      <Bulb3D position={[1.2, 0, 0.85]} brightness={brightness} />

      {/* 电阻（辅助负载） */}
      <Resistor3D position={[-0.2, 0, -1.2]} ohms={10} />

      {/* 滑动变阻器 */}
      <Rheostat3D position={[-1.2, 0, 0.2]} slider={slider} />

      {/* 导线 */}
      {wires.map((w, i) => (
        <Wire3D key={i} {...w} />
      ))}

      {/* 电压表并联在灯泡两端示意 */}
      <Meter3D
        position={[0.3, 0, 1.6]}
        kind="V"
        reading={closed ? voltage * (brightness > 0 ? 0.85 : 0) : 0}
        range={15}
      />
      <Wire3D
        color="#4caf50"
        points={[[1.55, 0.55, 1.0], [1.1, 0.9, 1.35], [0.65, 0.55, 1.6]]}
      />
      <Wire3D
        color="#4caf50"
        points={[[-0.05, 0.55, 1.6], [0.5, 0.9, 1.25], [1.0, 0.55, 0.95]]}
      />
    </group>
  )
}

function Lights() {
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[6, 10, 4]}
        intensity={1.15}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={30}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
      />
      <directionalLight position={[-5, 6, -3]} intensity={0.35} color="#b3e5fc" />
      <hemisphereLight args={['#cfe8ff', '#2b221c', 0.35]} />
    </>
  )
}

export default function ElectricLab3DScene() {
  const [closed, setClosed] = useState(true)
  const [voltage, setVoltage] = useState(3)
  const [slider, setSlider] = useState(0.35)

  // 简化电路：I ≈ U / (R灯 + R变)
  const rBulb = 10
  const rRheo = 2 + slider * 18
  const current = closed ? voltage / (rBulb + rRheo) : 0
  const brightness = closed
    ? Math.min(1, (current * current * rBulb) / (voltage * voltage / rBulb || 1))
    : 0

  return (
    <SceneShell
      title="3D 物理实验台 · 电学仪器"
      showTabs={false}
      onReset={() => {
        setClosed(true)
        setVoltage(3)
        setSlider(0.35)
      }}
      toolbarExtra={(
        <>
          <button type="button" style={btn(closed)} onClick={() => setClosed((c) => !c)}>
            {closed ? '闭合 · 点击断开' : '断开 · 点击闭合'}
          </button>
          <label style={lab}>电源 U
            <input type="range" min="1.5" max="12" step="0.5" value={voltage}
              onChange={(e) => setVoltage(+e.target.value)} style={sl} />
            <span style={val}>{voltage.toFixed(1)}V</span>
          </label>
          <label style={lab}>变阻器
            <input type="range" min="0" max="1" step="0.01" value={slider}
              onChange={(e) => setSlider(+e.target.value)} style={sl} />
            <span style={val}>{(2 + slider * 18).toFixed(1)}Ω</span>
          </label>
          <label style={lab}>I ≈ {current.toFixed(3)}A</label>
        </>
      )}
      desc={<span>左键旋转 · 滚轮缩放 · 右键平移。点击开关可通断；调电压/变阻器观察灯泡亮度与指针。</span>}
    >
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [5.2, 4.2, 6.2], fov: 42, near: 0.1, far: 60 }}
        style={{ width: '100%', height: '100%', background: '#1a222c' }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={['#1a222c']} />
        <fog attach="fog" args={['#1a222c', 12, 28]} />
        <Suspense fallback={null}>
          <Lights />
          <CircuitRig
            closed={closed}
            voltage={voltage}
            slider={slider}
            brightness={brightness}
            current={current}
            onToggle={() => setClosed((c) => !c)}
          />
          <ContactShadows
            position={[0, 0.01, 0]}
            opacity={0.55}
            scale={16}
            blur={2.2}
            far={4}
          />
          <OrbitControls
            makeDefault
            target={[0.4, 0.4, 0]}
            maxPolarAngle={Math.PI * 0.48}
            minDistance={3}
            maxDistance={16}
            enableDamping
          />
        </Suspense>
      </Canvas>
    </SceneShell>
  )
}

const lab = { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#666' }
const sl = { width: 90, accentColor: '#4A90D9' }
const val = { color: '#4A90D9', fontWeight: 600, minWidth: 40 }
const btn = (on) => ({
  background: on ? '#2e7d32' : '#757575',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  padding: '6px 12px',
  fontSize: 12,
  cursor: 'pointer',
  fontWeight: 600,
})
