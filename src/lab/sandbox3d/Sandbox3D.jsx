/**
 * sandbox3d/Sandbox3D.jsx — 3D 拟物电学实验室（页面壳）
 *
 * 顶部工具栏 / 左器材栏 / 中央 Canvas / 右参数读数 / 底部状态栏。
 * 电路模型读写 sandbox3d/store.js（与 2D 共用），求解统一走 solveCircuit()。
 *
 * 交互：OrbitControls 旋转/缩放/平移，器材 raycast 拖拽（落点投影圈 + 0.5cm 吸附，
 * 自动落到台面高度），双击聚焦（300ms easeOutCubic）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { useCircuitStore } from './store.js'
import { solveCircuit } from '../sandbox/circuit.js'
import {
  toScene3, toWorld2, termWorld3, footprintOf, WORLD_TO_UNIT,
} from './model3d.js'
import { Stage } from './stage.jsx'
import { GroundRing } from './components3d/common.jsx'
import { Wire3D, WirePreview } from './wires3d.jsx'
import { INSTRUMENT_GROUPS_3D, componentDef3D, component3D } from './catalog3d.js'

const SNAP_DIST = 0.05 // 0.5 cm（3D 单位）
const TABLE_Y = 0 // 器材落座高度

/* ════════════════════════════════════════════════════════════
 *  3D 场景（Canvas 内部）
 * ════════════════════════════════════════════════════════════ */
function Sandbox3DScene({ components, wires, results, selectedId, wood }) {
  const { camera, gl } = useThree()
  const controlsRef = useRef()
  const dragRef = useRef(null)
  const focusRef = useRef(null)
  const [dragHint, setDragHint] = useState(null)

  const byId = useMemo(() => new Map(components.map((c) => [c.id, c])), [components])

  /** 屏幕坐标 → 台面（y=0）交点 */
  const toTablePoint = useCallback((ev) => {
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

  /** 落点吸附：与相邻器材 0.5cm 内对齐边 */
  const snapScene = useCallback((compId, tx, tz) => {
    const st = useCircuitStore.getState()
    const comp = st.components.find((c) => c.id === compId)
    if (!comp) return { x: tx, z: tz }
    const fp = footprintOf(comp.type)
    let x = tx
    let z = tz
    for (const other of st.components) {
      if (other.id === compId) continue
      const fo = footprintOf(other.type)
      const ox = other.x * WORLD_TO_UNIT
      const oz = other.y * WORLD_TO_UNIT
      const overlapX = Math.abs(z - oz) < fp.hd + fo.hd
      const overlapZ = Math.abs(x - ox) < fp.hw + fo.hw
      if (overlapX) {
        const d1 = (ox - fo.hw) - (x + fp.hw)
        const d2 = (ox + fo.hw) - (x - fp.hw)
        if (Math.abs(d1) < SNAP_DIST) x += d1
        else if (Math.abs(d2) < SNAP_DIST) x += d2
      }
      if (overlapZ) {
        const d3 = (oz - fo.hd) - (z + fp.hd)
        const d4 = (oz + fo.hd) - (z - fp.hd)
        if (Math.abs(d3) < SNAP_DIST) z += d3
        else if (Math.abs(d4) < SNAP_DIST) z += d4
      }
    }
    return { x, z }
  }, [])

  const beginDrag = useCallback((comp, ev) => {
    ev.stopPropagation()
    if (wireRef.current) return // 接线进行中，不进入拖拽
    useCircuitStore.getState().select(comp.id)
    const p = toTablePoint(ev)
    if (!p) return
    const s = toScene3(comp)
    dragRef.current = {
      compId: comp.id, grabDx: p.x - s.x, grabDz: p.z - s.z,
      moved: false, startX: ev.clientX, startY: ev.clientY,
    }
    if (controlsRef.current) controlsRef.current.enabled = false
    setDragHint({ x: s.x, z: s.z })
  }, [toTablePoint])

  /* ── 3D 接线：接线柱按下拉线，磁吸对准，松手连接 ── */
  const wireRef = useRef(null)
  const [wireTip, setWireTip] = useState(null)
  const [hoverTerm, setHoverTerm] = useState(null)
  const hoverTermRef = useRef(null)

  /** 屏幕距离最近的接线柱（磁吸阈值 26px），排除起点元件 */
  const findSnapTerm = useCallback((cx, cy, excludeCompId) => {
    const rect = gl.domElement.getBoundingClientRect()
    let best = null
    let bestD = 42
    for (const c of useCircuitStore.getState().components) {
      if (c.id === excludeCompId) continue
      for (let i = 0; i < 2; i++) {
        const w = termWorld3(c, i)
        const v = new THREE.Vector3(w[0], w[1], w[2]).project(camera)
        const sx = rect.left + ((v.x + 1) / 2) * rect.width
        const sy = rect.top + ((1 - v.y) / 2) * rect.height
        const d = Math.hypot(cx - sx, cy - sy)
        if (d < bestD) {
          bestD = d
          best = { compId: c.id, termIdx: i }
        }
      }
    }
    return best
  }, [camera, gl])

  const startWire = useCallback((portIdx, compId, ev) => {
    ev.stopPropagation()
    if (controlsRef.current) controlsRef.current.enabled = false
    wireRef.current = { from: { compId, portIdx } }
    const p = toTablePoint(ev)
    if (p) setWireTip([p.x, 0.35, p.z])
  }, [toTablePoint])

  // 器材栏拖入台面：DOM drop 事件 → 反投影到台面 → 添加器材
  useEffect(() => {
    const add = (type, clientX, clientY) => {
      const p = toTablePoint({ clientX, clientY })
      if (!p) return
      const def = componentDef3D(type)
      if (!def) return
      const wp = toWorld2({ x: p.x, z: p.z })
      useCircuitStore.getState().addComponent(type, wp.x, wp.y, { def })
    }
    // 调试钩子：接线柱屏幕坐标（QA 拉线用）
    const termScreen = (compId, portIdx) => {
      const c = useCircuitStore.getState().components.find((x) => x.id === compId)
      if (!c) return null
      const w = termWorld3(c, portIdx)
      const rect = gl.domElement.getBoundingClientRect()
      const v = new THREE.Vector3(w[0], w[1], w[2]).project(camera)
      return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height }
    }
    window.__lab3dAddAt = add
    window.__lab3dTermScreen = termScreen
    window.__lab3dStore = useCircuitStore
    window.__lab3dCam = () => camera.position.toArray().map((v) => Math.round(v * 100) / 100)
    return () => {
      delete window.__lab3dAddAt
      delete window.__lab3dTermScreen
      delete window.__lab3dStore
      delete window.__lab3dCam
    }
  }, [toTablePoint, camera, gl])

  const focusOn = useCallback((comp) => {
    const s = toScene3(comp)
    const target = new THREE.Vector3(s.x, 0.4, s.z)
    const dir = new THREE.Vector3(1.3, 1.0, 1.4).normalize().multiplyScalar(1.6)
    focusRef.current = {
      target,
      position: target.clone().add(dir),
      start: performance.now(),
      duration: 300,
      fromPos: camera.position.clone(),
      fromTarget: (controlsRef.current?.target || new THREE.Vector3(0, 0.4, 0)).clone(),
    }
    // 聚焦期间禁用 OrbitControls，避免其 update() 覆盖手动 lerp
    if (controlsRef.current) controlsRef.current.enabled = false
  }, [camera])

  // 拖拽 / 接线：window 监听，raycast 到台面
  useEffect(() => {
    const move = (ev) => {
      const d = dragRef.current
      const w = wireRef.current
      if (d) {
        if (Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) > 4) d.moved = true
        const p = toTablePoint(ev)
        if (!p) return
        const raw = { x: p.x - d.grabDx, z: p.z - d.grabDz }
        const snapped = snapScene(d.compId, raw.x, raw.z)
        setDragHint({ x: snapped.x, z: snapped.z })
        const wp = toWorld2(snapped)
        useCircuitStore.getState().moveComponent(d.compId, wp.x, wp.y)
        return
      }
      if (w) {
        const snap = findSnapTerm(ev.clientX, ev.clientY, w.from.compId)
        if (snap) {
          const comp = useCircuitStore.getState().components.find((c) => c.id === snap.compId)
          if (comp) {
            const t = termWorld3(comp, snap.termIdx)
            hoverTermRef.current = snap
            setHoverTerm(snap)
            setWireTip([t[0], t[1], t[2]])
            return
          }
        }
        hoverTermRef.current = null
        setHoverTerm(null)
        const p = toTablePoint(ev)
        if (p) setWireTip([p.x, 0.35, p.z])
      }
    }
    const up = (ev) => {
      if (dragRef.current) {
        const d = dragRef.current
        dragRef.current = null
        setDragHint(null)
        if (controlsRef.current) controlsRef.current.enabled = true
        // 轻点（未拖动）：开关切换通断
        if (!d.moved) {
          const comp = useCircuitStore.getState().components.find((c) => c.id === d.compId)
          if (comp && comp.type === 'switch') {
            useCircuitStore.getState().setParam(comp.id, 'closed', comp.props?.closed !== true)
          }
        }
      }
      const w = wireRef.current
      if (w) {
        const target = findSnapTerm(ev.clientX, ev.clientY, w.from.compId) || hoverTermRef.current
        if (target && target.compId !== w.from.compId) {
          useCircuitStore.getState().addWire(
            { compId: w.from.compId, portIdx: w.from.portIdx },
            { compId: target.compId, portIdx: target.termIdx },
          )
        }
        wireRef.current = null
        setWireTip(null)
        setHoverTerm(null)
        hoverTermRef.current = null
        if (controlsRef.current) controlsRef.current.enabled = true
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [toTablePoint, snapScene, findSnapTerm])

  // 接线起点：DOM 层按下即按「屏幕邻近接线柱」拉线
  // （图卡/热区遮挡时 mesh 命中不可靠，这里不依赖 raycast）
  useEffect(() => {
    const el = gl.domElement
    const down = (ev) => {
      const hit = findSnapTerm(ev.clientX, ev.clientY, null)
      if (hit) {
        ev.preventDefault()
        startWire(hit.termIdx, hit.compId, ev)
      }
    }
    el.addEventListener('pointerdown', down)
    return () => el.removeEventListener('pointerdown', down)
  }, [gl, findSnapTerm, startWire])

  // 聚焦视角：300ms easeOutCubic lerp
  useFrame(() => {
    const f = focusRef.current
    if (!f) return
    const t = Math.min(1, (performance.now() - f.start) / f.duration)
    const k = 1 - Math.pow(1 - t, 3)
    camera.position.lerpVectors(f.fromPos, f.position, k)
    if (controlsRef.current) controlsRef.current.target.lerpVectors(f.fromTarget, f.target, k)
    if (t >= 1) {
      focusRef.current = null
      if (controlsRef.current) {
        controlsRef.current.target.copy(f.target)
        controlsRef.current.update()
        controlsRef.current.enabled = true
      }
    }
  })

  return (
    <>
      <Stage wood={wood} />

      {components.map((c) => {
        const Instrument = component3D(c.type)
        if (!Instrument) return null
        const s = toScene3(c)
        const fp = footprintOf(c.type)
        return (
          <group
            key={c.id}
            position={[s.x, TABLE_Y, s.z]}
            onPointerDown={(ev) => beginDrag(c, ev)}
            onDoubleClick={(ev) => { ev.stopPropagation(); focusOn(c) }}
          >
            <Instrument
              comp={c}
              results={results}
              onTermClick={() => useCircuitStore.getState().select(c.id)}
              onTermHover={(portIdx, hov) => {
                if (hov) { hoverTermRef.current = { compId: c.id, termIdx: portIdx }; setHoverTerm(hoverTermRef.current) }
                else if (hoverTermRef.current && hoverTermRef.current.compId === c.id && hoverTermRef.current.termIdx === portIdx) {
                  hoverTermRef.current = null
                  setHoverTerm(null)
                }
              }}
              onTermDown={(portIdx, ev) => startWire(portIdx, c.id, ev)}
            />
            {c.id === selectedId && <GroundRing radius={Math.max(fp.hw, fp.hd) * 1.05} color="#4A90D9" />}
          </group>
        )
      })}

      {/* 落点投影圈 */}
      {dragHint && (
        <group position={[dragHint.x, TABLE_Y, dragHint.z]}>
          <GroundRing radius={0.5} color="#3ddc84" opacity={0.9} />
        </group>
      )}

      {/* 已有导线（2D 搭好的电路切到 3D 时同步显示） */}
      {wires.map((w) => {
        const a = byId.get(w.from.compId)
        const b = byId.get(w.to.compId)
        if (!a || !b) return null
        return (
          <Wire3D
            key={w.id}
            points={[termWorld3(a, w.from.portIdx), termWorld3(b, w.to.portIdx)]}
            color="#e53935"
          />
        )
      })}

      {/* 接线预览线 */}
      {wireRef.current && wireTip && (
        <WirePreview
          from={termWorld3(byId.get(wireRef.current.from.compId) || { x: 0, y: 0, type: 'bulb' }, wireRef.current.from.portIdx)}
          to={wireTip}
          snapped={!!hoverTerm && hoverTerm.compId !== wireRef.current.from.compId}
        />
      )}

      <OrbitControls
        ref={controlsRef}
        makeDefault
        target={[0, 0.4, 0]}
        maxPolarAngle={Math.PI * (88 / 180)}
        minDistance={1.2}
        maxDistance={7}
        enableDamping
        dampingFactor={0.08}
      />
    </>
  )
}

/* ════════════════════════════════════════════════════════════
 *  页面壳
 * ════════════════════════════════════════════════════════════ */
export default function Sandbox3D() {
  const components = useCircuitStore((s) => s.components)
  const wires = useCircuitStore((s) => s.wires)
  const selectedId = useCircuitStore((s) => s.selectedId)
  const [wood, setWood] = useState(true)
  const [toast, setToast] = useState(null)

  // solveCircuit 只在模型变化时跑（不放进 useFrame）
  const solved = useMemo(() => solveCircuit(components, wires), [components, wires])
  const results = solved.results
  const diagnostics = solved.diagnostics

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 1600)
    return () => clearTimeout(id)
  }, [toast])

  const selectedComp = useMemo(
    () => components.find((c) => c.id === selectedId) || null,
    [components, selectedId],
  )

  const addAt = useCallback((type) => {
    const def = componentDef3D(type)
    if (!def) return
    const st = useCircuitStore.getState()
    // 网格槽位摆放，避免器材重叠导致接线柱热区互抢事件
    const n = st.components.length
    const col = n % 3
    const row = Math.floor(n / 3) % 2
    const wx = (col - 1) * 78
    const wy = (row === 0 ? -16 : 26)
    return st.addComponent(type, wx, wy, { def })
  }, [])

  const save = useCallback(() => {
    const s = useCircuitStore.getState()
    localStorage.setItem('circuit-sandbox-v1', JSON.stringify({ components: s.components, wires: s.wires }))
    setToast('已保存电路')
  }, [])

  const undo = useCallback(() => {
    if (!useCircuitStore.getState().undo()) setToast('没有可撤销的操作')
  }, [])

  return (
    <div style={styles.root}>
      <Toolbar3D
        wood={wood}
        onToggleWood={() => setWood((w) => !w)}
        onClear={() => useCircuitStore.getState().clearAll()}
        onUndo={undo}
        onSave={save}
        count={components.length}
      />

      <div style={styles.main}>
        <Sidebar3D onAdd={addAt} />

        <div
          style={styles.canvasWrap}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
          onDrop={(e) => {
            e.preventDefault()
            const type = e.dataTransfer.getData('text/plain')
            if (type && window.__lab3dAddAt) window.__lab3dAddAt(type, e.clientX, e.clientY)
          }}
        >
          <Canvas
            shadows
            dpr={[1, 2]}
            camera={{ position: [2.6, 2.1, 3.1], fov: 42, near: 0.1, far: 60 }}
            gl={{ antialias: true }}
            style={{ width: '100%', height: '100%' }}
          >
            <Sandbox3DScene
              components={components}
              wires={wires}
              results={results}
              selectedId={selectedId}
              wood={wood}
            />
          </Canvas>

          <StatusBar3D
            diagnostics={diagnostics}
            count={components.length}
            wires={wires.length}
          />
        </div>

        <RightPanel3D comp={selectedComp} results={results} />
      </div>

      {toast && <div style={styles.toast}>{toast}</div>}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
 *  顶部工具栏
 * ════════════════════════════════════════════════════════════ */
function Toolbar3D({ wood, onToggleWood, onClear, onUndo, onSave, count }) {
  return (
    <div style={styles.toolbar}>
      <div style={styles.toolbarTitle}>🔬 3D 拟物电学实验室</div>
      <div style={styles.toolbarGroup}>
        <button style={styles.tbBtn} onClick={onClear} title="清空实验台">🗑 清空</button>
        <button style={styles.tbBtn} onClick={onUndo} title="撤销上一步">↩ 撤销</button>
        <button style={styles.tbBtn} onClick={onSave} title="保存电路到本地">💾 保存</button>
        <button
          style={{ ...styles.tbBtn, background: wood ? 'rgba(255,176,32,0.18)' : 'rgba(90,169,255,0.16)', borderColor: wood ? 'rgba(255,176,32,0.55)' : 'rgba(90,169,255,0.5)' }}
          onClick={onToggleWood}
          title="切换台面材质"
        >
          {wood ? '🪵 木纹台面' : '⬛ 防静电台面'}
        </button>
      </div>
      <div style={styles.toolbarCount}>器材 {count}</div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
 *  左侧器材栏
 * ════════════════════════════════════════════════════════════ */
function Sidebar3D({ onAdd }) {
  return (
    <div style={styles.sidebar}>
      <div style={styles.itemList}>
        {INSTRUMENT_GROUPS_3D[0].items.map((def) => (
          <div
            key={def.type}
            style={styles.item}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', def.type)
              e.dataTransfer.effectAllowed = 'copy'
            }}
            onClick={() => onAdd(def.type)}
            title={`${def.label} — 点击添加 / 拖入台面\n${def.desc}`}
          >
            <div style={styles.itemIcon}>{def.icon}</div>
            <div style={styles.itemLabel}>{def.label}</div>
          </div>
        ))}
      </div>
      <div style={styles.sidebarHint}>
        <div>· 点击或拖拽器材到台面</div>
        <div>· 左键拖拽移动器材</div>
        <div>· 从接线柱拉线手动接线</div>
        <div>· 点击开关切换通断</div>
        <div>· 左键旋转 · 滚轮缩放 · 右键平移</div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
 *  右侧参数 / 读数面板
 * ════════════════════════════════════════════════════════════ */
function RightPanel3D({ comp, results }) {
  if (!comp) {
    return (
      <div style={styles.right}>
        <div style={styles.rightTitle}>实验台</div>
        <div style={styles.readoutCard}>
          <div style={styles.readoutLabel}>操作提示</div>
          <div style={styles.tips}>
            <div>· 选中器材后在此改参数</div>
            <div>· 读数带符号，正负与接线方向一致</div>
            <div>· 电流表串联、电压表并联</div>
          </div>
        </div>
      </div>
    )
  }

  const def = componentDef3D(comp.type)
  const r = results.get(comp.id) || {}
  const title = def?.label || comp.type
  const readouts = []

  // 读数保留符号（禁止 Math.abs 消号）
  if (comp.type === 'ammeter') readouts.push(['电流', `${(r.current || 0).toFixed(3)} A`])
  if (comp.type === 'voltmeter') readouts.push(['电压', `${(r.voltage || 0).toFixed(2)} V`])
  if (comp.type === 'galvanometer') readouts.push(['电流', `${((r.current || 0) * 1000).toFixed(2)} mA`])
  if (comp.type === 'battery' || comp.type === 'powerSupply') readouts.push(['输出电流', `${(r.current || 0).toFixed(3)} A`])
  if (comp.type === 'bulb') readouts.push(['功率', `${(r.power || 0).toFixed(3)} W`])
  if (comp.type === 'resistor' || comp.type === 'rheostat') readouts.push(['功率', `${(r.power || 0).toFixed(3)} W`])
  if (comp.type === 'switch') readouts.push(['状态', comp.props.closed ? '闭合' : '断开'])

  return (
    <div style={styles.right}>
      <div style={styles.rightTitle}>{def?.icon} {title}</div>

      {readouts.length > 0 && (
        <div style={styles.readoutCard}>
          {readouts.map(([k, v]) => (
            <div key={k} style={styles.readoutRow}>
              <span style={styles.readoutLabel}>{k}</span>
              <span style={styles.readoutVal}>{v}</span>
            </div>
          ))}
        </div>
      )}

      {comp.type === 'switch' && (
        <div style={styles.paramRow}>
          <span style={styles.paramLabel}>通断</span>
          <button
            style={{ ...styles.toggleBtn, background: comp.props.closed ? '#1f3a2c' : '#3a2226', color: comp.props.closed ? '#7ce8b0' : '#ff9d95' }}
            onClick={() => useCircuitStore.getState().setParam(comp.id, 'closed', comp.props.closed !== true)}
          >
            {comp.props.closed ? '闭合（点击断开）' : '断开（点击闭合）'}
          </button>
        </div>
      )}

      {comp.type === 'powerSupply' && (
        <div style={styles.paramRow}>
          <span style={styles.paramLabel}>电源</span>
          <button
            style={{ ...styles.toggleBtn, background: comp.props.on !== false ? '#1f3a2c' : '#3a2226', color: comp.props.on !== false ? '#7ce8b0' : '#ff9d95' }}
            onClick={() => useCircuitStore.getState().setParam(comp.id, 'on', comp.props.on === false)}
          >
            {comp.props.on !== false ? '已通电（点击断电）' : '已断电（点击通电）'}
          </button>
        </div>
      )}

      {(def?.params || []).map((p) => {
        const val = comp.props[p.key] ?? 0
        if (p.kind === 'range') {
          return (
            <div key={p.key} style={styles.paramRow}>
              <span style={styles.paramLabel}>{p.label}</span>
              <div style={styles.presetRow}>
                {p.options.map((v) => (
                  <button
                    key={v}
                    style={{
                      ...styles.presetBtn,
                      background: Math.abs(val - v) < 1e-9 ? 'rgba(74,144,217,0.30)' : 'rgba(255,255,255,0.06)',
                      borderColor: Math.abs(val - v) < 1e-9 ? 'rgba(74,144,217,0.85)' : 'rgba(255,255,255,0.12)',
                    }}
                    onClick={() => useCircuitStore.getState().setParam(comp.id, p.key, v)}
                  >
                    {p.unit === 'mA' ? `0~${v * 1000}mA` : `0~${v}${p.unit}`}
                  </button>
                ))}
              </div>
            </div>
          )
        }
        return (
          <div key={p.key} style={styles.paramRow}>
            <div style={styles.paramHead}>
              <span style={styles.paramLabel}>{p.label}</span>
              <span style={styles.paramVal}>{formatNum(val)} <span style={styles.paramUnit}>{p.unit}</span></span>
            </div>
            <input
              type="range"
              min={p.min}
              max={p.max}
              step={p.step}
              value={val}
              style={styles.range}
              onChange={(e) => useCircuitStore.getState().setParam(comp.id, p.key, parseFloat(e.target.value))}
            />
            {p.presets && (
              <div style={styles.presetRow}>
                {p.presets.map((v) => (
                  <button
                    key={v}
                    style={{
                      ...styles.presetBtn,
                      background: Math.abs(val - v) < 1e-9 ? 'rgba(74,144,217,0.30)' : 'rgba(255,255,255,0.06)',
                    }}
                    onClick={() => useCircuitStore.getState().setParam(comp.id, p.key, v)}
                  >
                    {v}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function formatNum(v) {
  if (!Number.isFinite(v)) return '--'
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

/* ════════════════════════════════════════════════════════════
 *  状态栏
 * ════════════════════════════════════════════════════════════ */
function StatusBar3D({ diagnostics, count, wires }) {
  const short = diagnostics?.short
  return (
    <div style={styles.statusBar}>
      <span style={{ color: '#7ce8b0' }}>● 仿真运行中</span>
      <span>器材 {count}</span>
      <span>导线 {wires}</span>
      <span style={{ color: short ? '#ff8a80' : '#8a97a5' }}>{short ? '⚠ 短路' : (diagnostics?.reason || '')}</span>
      <span style={{ marginLeft: 'auto', color: '#5a6670' }}>左键旋转 · 滚轮缩放 · 右键平移 · 拖拽器材 · 双击聚焦</span>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
 *  样式（与 2D 沙盒同源深色主题）
 * ════════════════════════════════════════════════════════════ */
const styles = {
  root: {
    display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0,
    background: '#0d1117', color: '#c9d1d9', overflow: 'hidden',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif',
  },
  toolbar: {
    minHeight: 44, background: '#161b22', borderBottom: '1px solid #30363d',
    display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', flexShrink: 0, flexWrap: 'wrap',
  },
  toolbarTitle: { fontSize: 14, fontWeight: 700, color: '#e6edf3', whiteSpace: 'nowrap' },
  toolbarGroup: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  toolbarCount: { marginLeft: 'auto', fontSize: 12, color: '#8b949e', whiteSpace: 'nowrap' },
  tbBtn: {
    padding: '5px 11px', background: '#21262d', color: '#c9d1d9',
    border: '1px solid #30363d', borderRadius: 6, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
  },

  main: { flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 },

  sidebar: {
    width: 116, flexShrink: 0, background: '#161b22', borderRight: '1px solid #30363d',
    display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden',
  },
  itemList: { flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 },
  item: {
    padding: 6, borderRadius: 8, cursor: 'grab', textAlign: 'center',
    background: 'rgba(255,255,255,0.03)', border: '1px solid transparent', userSelect: 'none',
  },
  itemIcon: { fontSize: 20, lineHeight: 1.2 },
  itemLabel: { fontSize: 11, color: '#aab7c2', marginTop: 2, whiteSpace: 'nowrap' },
  sidebarHint: {
    padding: 10, fontSize: 10, color: '#5a6670', lineHeight: 1.7,
    borderTop: '1px solid #21262d', flexShrink: 0,
  },

  canvasWrap: { flex: 1, position: 'relative', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' },
  statusBar: {
    minHeight: 24, background: '#161b22', borderTop: '1px solid #30363d',
    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    padding: '2px 14px', fontSize: 11, color: '#8b949e', flexShrink: 0,
  },

  right: {
    width: 224, flexShrink: 0, background: '#161b22', borderLeft: '1px solid #30363d',
    display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'auto', padding: 12,
  },
  rightTitle: { fontSize: 14, fontWeight: 700, color: '#e6edf3', marginBottom: 10 },
  readoutCard: {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8, padding: 10, marginBottom: 10,
  },
  readoutRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
  readoutLabel: { fontSize: 11, color: '#8b98a5' },
  readoutVal: { fontSize: 13, fontWeight: 700, color: '#7cc4ff', fontFamily: 'ui-monospace, Consolas, monospace' },
  tips: { fontSize: 11, color: '#8b98a5', lineHeight: 1.8 },

  paramRow: { marginBottom: 12 },
  paramHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  paramLabel: { fontSize: 11, color: '#9fb3c4' },
  paramVal: { fontSize: 13, fontWeight: 700, color: '#7cc4ff', fontFamily: 'ui-monospace, Consolas, monospace' },
  paramUnit: { fontSize: 10, color: '#6e8ba3' },
  range: { width: '100%', accentColor: '#4A90D9', margin: '4px 0 2px' },
  presetRow: { display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 },
  presetBtn: {
    padding: '4px 7px', fontSize: 10.5, fontWeight: 600, cursor: 'pointer', borderRadius: 6,
    color: '#c9d1d9', border: '1px solid rgba(255,255,255,0.12)',
  },
  toggleBtn: {
    width: '100%', padding: '7px 8px', marginTop: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer',
    border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7,
  },

  toast: {
    position: 'fixed', bottom: 44, left: '50%', transform: 'translateX(-50%)',
    padding: '8px 18px', borderRadius: 20, background: 'rgba(20,26,32,0.95)',
    border: '1px solid rgba(90,169,255,0.4)', color: '#cfe4ff', fontSize: 12.5, zIndex: 70,
  },
}
