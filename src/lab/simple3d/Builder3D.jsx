/**
 * simple3d/Builder3D.jsx — 简单电路「自己动手」3D 搭建器
 *
 * 浅色摄影棚实验台 + 按参考图复刻的 3D 器材。交互：
 *   - 右侧器材栏点选添加（add）→ 拖拽移动
 *   - 点接线柱拖出导线，落到另一接线柱完成连接
 *   - 轻点开关通断，双击/右键删除器材
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { Equipment3D, termsFor } from './equipment.jsx'
import { Wire3D, WirePreview } from '../sandbox3d/wires3d.jsx'

const TABLE_Y = 0
/** 接线吸附半径（屏幕像素）：指针进入接线柱该距离即磁吸（高度无关） */
const SNAP_PX = 42

/** 电路通断检测（电源+灯泡成环，且所有开关闭合） */
function checkCircuit(components, wires) {
  const batteries = components.filter((c) => c.type === 'battery')
  const switches_ = components.filter((c) => c.type === 'switch')
  const bulbs = components.filter((c) => c.type === 'bulb')
  if (batteries.length === 0 || bulbs.length === 0) return { closed: false, reason: '需要电源和灯泡' }

  const adj = {}
  for (const c of components) adj[c.id] = new Set()
  for (const w of wires) {
    adj[w.from.compId]?.add(w.to.compId)
    adj[w.to.compId]?.add(w.from.compId)
  }
  const allConnected = components.every((c) => adj[c.id]?.size >= 2)
  if (!allConnected) return { closed: false, reason: '电路未闭合（有器材未连接）' }

  const battery = batteries[0]
  const visited = new Set()
  let hasLoop = false
  function dfs(node, depth) {
    if (depth > 0 && node === battery.id) { hasLoop = true; return }
    if (visited.has(node) || depth > components.length) return
    visited.add(node)
    for (const next of adj[node] || []) dfs(next, depth + 1)
  }
  dfs(battery.id, 0)
  if (!hasLoop) return { closed: false, reason: '电路未形成闭合回路' }
  for (const sw of switches_) if (sw.closed === false) return { closed: false, reason: '开关断开' }
  return { closed: true, reason: '电路正常，灯泡亮' }
}

/** 某端口世界坐标（按器材类型取接线柱本地坐标） */
function termWorld(comp, termIdx) {
  const terms = termsFor(comp.type)
  const t = terms[termIdx] || terms[0]
  return [comp.x + t[0], t[1], comp.y + t[2]]
}

/* ══════════ 场景内部（Canvas 内） ══════════ */
function BuilderScene({ components, wires, wireColor, onUpdate, onSlide, onToggle, onRemove, onConnect, selId, onSelect }) {
  const { camera, gl } = useThree()
  const controlsRef = useRef()
  const dragRef = useRef(null) // { id, grabDx, grabDz, moved, startX, startY }
  const wireRef = useRef(null) // { from:{compId,termIdx} }
  const hoverTermRef = useRef(null) // 同步热区命中（onUp 及时读取）
  const [wireTip, setWireTip] = useState(null) // [x,y,z] 预览线末端
  const [hoverTerm, setHoverTerm] = useState(null)
  const [, tick] = useState(0)
  const lastUpRef = useRef({ t: 0, x: 0, y: 0 })

  const byId = useMemo(() => new Map(components.map((c) => [c.id, c])), [components])

  /** 屏幕坐标 → 台面（y = TABLE_Y）交点 */
  const toTable = useCallback((ev) => {
    const dom = ev.nativeEvent || ev
    const rect = gl.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((dom.clientX - rect.left) / rect.width) * 2 - 1,
      -((dom.clientY - rect.top) / rect.height) * 2 + 1,
    )
    const ray = new THREE.Raycaster()
    ray.setFromCamera(ndc, camera)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TABLE_Y)
    const p = new THREE.Vector3()
    return ray.ray.intersectPlane(plane, p) ? p : null
  }, [camera, gl])

  /** 屏幕坐标 → 接线高度平面（默认取拖线起点高度）交点 */
  const toTermPlane = useCallback((ev, y = 0.35) => {
    const dom = ev.nativeEvent || ev
    const rect = gl.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((dom.clientX - rect.left) / rect.width) * 2 - 1,
      -((dom.clientY - rect.top) / rect.height) * 2 + 1,
    )
    const ray = new THREE.Raycaster()
    ray.setFromCamera(ndc, camera)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y)
    const p = new THREE.Vector3()
    return ray.ray.intersectPlane(plane, p) ? p : null
  }, [camera, gl])

  /* ─── 拖拽 / 接线：window 监听 ─── */
  /** 找吸附目标：指针屏幕坐标离哪个接线柱最近（高度无关，视觉磁吸），排除起点器材 */
  const findSnapTerm = useCallback((clientX, clientY, excludeCompId) => {
    const rect = gl.domElement.getBoundingClientRect()
    let best = null
    let bestD = SNAP_PX
    const v = new THREE.Vector3()
    for (const comp of components) {
      if (comp.id === excludeCompId) continue
      const terms = termsFor(comp.type)
      for (let i = 0; i < 2; i++) {
        const t = terms[i]
        v.set(comp.x + t[0], t[1], comp.y + t[2]).project(camera)
        const sx = rect.x + ((v.x + 1) / 2) * rect.width
        const sy = rect.y + ((1 - v.y) / 2) * rect.height
        const dist = Math.hypot(sx - clientX, sy - clientY)
        if (dist < bestD) {
          bestD = dist
          best = { compId: comp.id, termIdx: i }
        }
      }
    }
    return best
  }, [components, camera, gl])

  const onMove = useCallback((ev) => {
    const d = dragRef.current
    const w = wireRef.current
    if (d) {
      if (Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) > 4) d.moved = true
      if (d.mode === 'slide') {
        // 滑片：沿导杆方向滑动（限位 0..1），按滑杆高度平面反算
        const sp = toTermPlane(ev, d.planeY)
        if (!sp) return
        const comp = byId.get(d.id)
        if (comp) onSlide(d.id, Math.max(0, Math.min(1, (sp.x - comp.x + 0.62) / 1.24)))
        return
      }
      const p = toTable(ev)
      if (!p) return
      onUpdate(d.id, p.x - d.grabDx, p.z - d.grabDz)
      return
    }
    if (w) {
      const p = toTermPlane(ev, w.planeY)
      // 距离吸附：指针靠近接线柱（屏幕距离）即磁吸对准
      const snap = findSnapTerm(ev.clientX, ev.clientY, w.from.compId)
      if (snap) {
        const comp = byId.get(snap.compId)
        const t = termsFor(comp.type)[snap.termIdx]
        hoverTermRef.current = snap
        setHoverTerm(snap)
        setWireTip([comp.x + t[0], t[1], comp.y + t[2]])
      } else {
        hoverTermRef.current = null
        setHoverTerm(null)
        if (p) setWireTip([p.x, p.y, p.z])
      }
    }
  }, [toTable, toTermPlane, onUpdate, onSlide, findSnapTerm, byId])

  const onUp = useCallback((ev) => {
    const d = dragRef.current
    const w = wireRef.current
    if (d) {
      dragRef.current = null
      if (controlsRef.current) controlsRef.current.enabled = true
      if (d.mode === 'slide') {
        tick((n) => n + 1)
        return
      }
      // 轻点（未拖动）：开关切换通断；双击：删除
      const now = performance.now()
      const prev = lastUpRef.current
      const isDouble = now - prev.t < 350 && Math.hypot(ev.clientX - prev.x, ev.clientY - prev.y) < 28
      lastUpRef.current = { t: now, x: ev.clientX, y: ev.clientY }
      const comp = byId.get(d.id)
      if (isDouble && !d.moved && comp) {
        onRemove(d.id)
        return
      }
      if (!d.moved && comp && comp.type === 'switch') {
        onToggle(d.id)
        return
      }
      tick((n) => n + 1)
      return
    }
    if (w) {
      // 连接：屏幕距离吸附（高度无关），hoverRef 作兜底
      const target = findSnapTerm(ev.clientX, ev.clientY, w.from.compId) || hoverTermRef.current
      if (target && target.compId !== w.from.compId) {
        onConnect(w.from, { compId: target.compId, termIdx: target.termIdx })
      }
      wireRef.current = null
      setWireTip(null)
      setHoverTerm(null)
      hoverTermRef.current = null
      tick((n) => n + 1)
    }
  }, [byId, onRemove, onToggle, onConnect, findSnapTerm, toTermPlane])

  /* ─── 按下：接线柱 → 拉线；器材 → 拖拽 ─── */
  const startWire = useCallback((compId, termIdx, ev) => {
    ev.stopPropagation()
    const comp = byId.get(compId)
    const planeY = comp ? termsFor(comp.type)[termIdx][1] : 0.35
    wireRef.current = { from: { compId, termIdx }, planeY }
    const p = toTermPlane(ev, planeY)
    if (p) setWireTip([p.x, p.y, p.z])
    if (controlsRef.current) controlsRef.current.enabled = false
    tick((n) => n + 1)
  }, [toTermPlane, byId])

  const startDrag = useCallback((comp, ev) => {
    ev.stopPropagation()
    onSelect(comp.id)
    const p = toTable(ev)
    if (!p) return
    dragRef.current = {
      id: comp.id,
      grabDx: p.x - comp.x,
      grabDz: p.z - comp.y,
      moved: false,
      startX: ev.clientX,
      startY: ev.clientY,
    }
    if (controlsRef.current) controlsRef.current.enabled = false
    tick((n) => n + 1)
  }, [toTable, onSelect])

  /* 滑片拖拽（滑线变阻器） */
  const startSlide = useCallback((comp, ev) => {
    dragRef.current = {
      id: comp.id,
      mode: 'slide',
      planeY: 0.64,
      moved: false,
      startX: ev.clientX,
      startY: ev.clientY,
    }
    if (controlsRef.current) controlsRef.current.enabled = false
    tick((n) => n + 1)
  }, [])

  const handleTermOver = useCallback((compId, termIdx) => {
    hoverTermRef.current = { compId, termIdx }
    setHoverTerm(hoverTermRef.current)
  }, [])

  const handleTermOut = useCallback((compId, termIdx) => {
    if (hoverTermRef.current && hoverTermRef.current.compId === compId && hoverTermRef.current.termIdx === termIdx) {
      hoverTermRef.current = null
    }
    setHoverTerm((h) => (h && h.compId === compId && h.termIdx === termIdx ? null : h))
  }, [])

  /* 拖拽 / 接线期间的 window 指针监听（常驻，内部按 ref 空转） */
  useEffect(() => {
    const move = (ev) => onMove(ev)
    const up = (ev) => onUp(ev)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [onMove, onUp])

  return (
    <>
      {/* 浅色摄影棚背景与布光（对齐参考图产品渲染观感） */}
      <color attach="background" args={['#d9dfe6']} />
      <fog attach="fog" args={['#d9dfe6', 18, 42]} />
      <ambientLight intensity={0.82} color="#ffffff" />
      <hemisphereLight args={['#f2f6fa', '#9aa4ae', 0.55]} />
      <directionalLight
        position={[5, 8.5, 6]}
        intensity={1.5}
        color="#fff4e2"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={30}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-bias={-0.0003}
      />
      <directionalLight position={[-6, 5, -4]} intensity={0.5} color="#cfe2ff" />
      <directionalLight position={[0, 3.5, 7]} intensity={0.28} color="#e8eefc" />

      {/* 浅灰白实验台面 */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, TABLE_Y, 0]}>
        <planeGeometry args={[22, 15]} />
        <meshStandardMaterial color="#e9ecef" roughness={0.88} metalness={0.03} />
      </mesh>
      <mesh position={[0, -0.13, 0]}>
        <boxGeometry args={[22, 0.26, 15]} />
        <meshStandardMaterial color="#d5d9dd" roughness={0.9} metalness={0.03} />
      </mesh>
      <ContactShadows position={[0, 0.012, 0]} opacity={0.42} scale={18} blur={2.2} far={5} resolution={1024} color="#5a6270" />

      {/* 器材 */}
      {components.map((comp) => {
        const glow = comp.type === 'bulb' ? (comp._glow || 0) : 0
        return (
          <group
            key={comp.id}
            position={[comp.x, TABLE_Y, comp.y]}
            onPointerDown={(e) => startDrag(comp, e)}
            onPointerOver={(e) => { e.stopPropagation(); gl.domElement.style.cursor = 'grab' }}
            onPointerOut={() => { gl.domElement.style.cursor = 'default' }}
            onContextMenu={(e) => { e.stopPropagation(); e.nativeEvent?.preventDefault?.(); onRemove(comp.id) }}
            onDoubleClick={(e) => { e.stopPropagation(); onRemove(comp.id) }}
          >
            <Equipment3D
              type={comp.type}
              closed={comp.closed !== false}
              glow={glow}
              slide={comp.slide ?? 0.2}
              onSlideDown={(e) => startSlide(comp, e)}
            />
            {selId === comp.id && (
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, 0]}>
                <ringGeometry args={[0.62, 0.65, 48]} />
                <meshBasicMaterial color="#4a90d9" transparent opacity={0.75} depthWrite={false} side={THREE.DoubleSide} />
              </mesh>
            )}
            {/* 接线柱热区（以螺帽中段为心，覆盖整柱） */}
            {termsFor(comp.type).map((t, i) => {
              const hovered = hoverTerm && hoverTerm.compId === comp.id && hoverTerm.termIdx === i
              return (
                <mesh
                  key={i}
                  position={t}
                  onPointerDown={(e) => startWire(comp.id, i, e)}
                  onPointerOver={(e) => { e.stopPropagation(); handleTermOver(comp.id, i); gl.domElement.style.cursor = 'crosshair' }}
                  onPointerOut={(e) => { e.stopPropagation(); handleTermOut(comp.id, i); gl.domElement.style.cursor = 'default' }}
                >
                  <sphereGeometry args={[0.3, 10, 10]} />
                  {hovered ? (
                    <meshBasicMaterial color="#3ddc84" transparent opacity={0.3} depthWrite={false} />
                  ) : (
                    <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                  )}
                </mesh>
              )
            })}
          </group>
        )
      })}

      {/* 已接导线 */}
      {wires.map((w) => {
        const fc = byId.get(w.from.compId)
        const tc = byId.get(w.to.compId)
        if (!fc || !tc) return null
        return (
          <Wire3D
            key={w.id}
            points={[termWorld(fc, w.from.termIdx), termWorld(tc, w.to.termIdx)]}
            color={w.color || wireColor}
          />
        )
      })}

      {/* 接线预览 */}
      {wireRef.current && wireTip && (
        <WirePreview
          from={termWorld(byId.get(wireRef.current.from.compId) || { x: 0, y: 0 }, wireRef.current.from.termIdx)}
          to={wireTip}
          snapped={!!hoverTerm && hoverTerm.compId !== wireRef.current.from.compId}
        />
      )}

      <OrbitControls
        ref={controlsRef}
        target={[0, 0.35, 0]}
        enableDamping
        dampingFactor={0.08}
        minPolarAngle={0.12}
        maxPolarAngle={Math.PI / 2 - 0.03}
        minDistance={2.2}
        maxDistance={11}
      />
    </>
  )
}

/* ══════════ 对外组件：状态 + 命令式 API ══════════ */
const Builder3D = forwardRef(function Builder3D({ wireColor = '#F44336' }, ref) {
  const [components, setComponents] = useState([])
  const [wires, setWires] = useState([])
  const [selId, setSelId] = useState(null)
  const nextId = useRef(1)

  /* 灯泡亮度由电路状态推导，注入到渲染数据 */
  const circuit = useMemo(() => checkCircuit(components, wires), [components, wires])
  const litComponents = useMemo(
    () => components.map((c) => (c.type === 'bulb' ? { ...c, _glow: circuit.closed ? 1 : 0 } : c)),
    [components, circuit],
  )

  const updatePos = useCallback((id, x, z) => {
    setComponents((cs) => cs.map((c) => (c.id === id ? { ...c, x, y: z } : c)))
  }, [])

  const updateSlide = useCallback((id, slide) => {
    setComponents((cs) => cs.map((c) => (c.id === id ? { ...c, slide } : c)))
  }, [])

  const toggleSwitch = useCallback((id) => {
    setComponents((cs) => cs.map((c) => (c.id === id && c.type === 'switch' ? { ...c, closed: c.closed === false } : c)))
  }, [])

  const removeComp = useCallback((id) => {
    setComponents((cs) => cs.filter((c) => c.id !== id))
    setWires((ws) => ws.filter((w) => w.from.compId !== id && w.to.compId !== id))
    setSelId((s) => (s === id ? null : s))
  }, [])

  const connect = useCallback((from, to) => {
    setWires((ws) => {
      const dup = ws.some(
        (w) =>
          (w.from.compId === from.compId && w.from.termIdx === from.termIdx && w.to.compId === to.compId && w.to.termIdx === to.termIdx) ||
          (w.to.compId === from.compId && w.to.termIdx === from.termIdx && w.from.compId === to.compId && w.from.termIdx === to.termIdx),
      )
      if (dup) return ws
      return [...ws, { id: nextId.current++, from, to, color: wireColor }]
    })
  }, [wireColor])

  useImperativeHandle(ref, () => ({
    add(type) {
      const id = nextId.current++
      setComponents((cs) => {
        // 2 列网格摆放，逐行下移，多件不叠压
        const col = cs.length % 2
        const row = Math.floor(cs.length / 2)
        const x = col === 0 ? -1.55 : 1.55
        const z = -1.15 + row * 2.5
        return [...cs, { id, type, x, y: z, rotation: 0, closed: type === 'switch' ? false : true, slide: 0.2 }]
      })
      setSelId(id)
    },
    reset() {
      setComponents([])
      setWires([])
      setSelId(null)
    },
  }), [])

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex' }}>
      <Canvas
        shadows
        style={{ width: '100%', height: '100%' }}
        camera={{ position: [3.1, 3.5, 5.4], fov: 38, near: 0.1, far: 60 }}
        onPointerMissed={() => setSelId(null)}
      >
        <BuilderScene
          components={litComponents}
          wires={wires}
          wireColor={wireColor}
          onUpdate={updatePos}
          onSlide={updateSlide}
          onToggle={toggleSwitch}
          onRemove={removeComp}
          onConnect={connect}
          selId={selId}
          onSelect={setSelId}
        />
      </Canvas>

      {/* 状态浮层 */}
      <div
        style={{
          position: 'absolute', left: 12, bottom: 12,
          padding: '6px 12px', borderRadius: 8,
          background: circuit.closed ? 'rgba(46,125,50,0.92)' : 'rgba(198,40,40,0.9)',
          color: '#fff', fontSize: 12, fontWeight: 600, pointerEvents: 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
        }}
      >
        {circuit.closed ? '✅ ' : '❌ '}{circuit.reason}
      </div>
    </div>
  )
})

export default Builder3D
