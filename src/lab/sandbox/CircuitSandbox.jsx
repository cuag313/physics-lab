/**
 * CircuitSandbox — 中学物理电学仿真实验室（自由搭建沙盒）
 *
 * 布局：顶部工具栏 · 左侧器材栏（可拖拽）· 中间深灰实验台画布 · 右侧参数面板。
 * 核心能力：拖拽摆放、接线柱拉线吸附、开关通断实时仿真（欧姆定律）、
 *           右键 删除/复制/拆开看内部结构、清空/撤销/保存/导出电路图、缩放平移。
 *
 * 复用 engine/CircuitSolver（改进节点法）+ render/ 写实教具基元，
 * 电气求解结果与真实欧姆定律一致。
 */

import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { COMPONENT_GROUPS, componentDef } from './catalog.js'
import {
  termWorld, solveCircuit, wireCurrentFrom,
} from './circuit.js'
import { renderFrame, renderThumb } from './render.js'
import { drawInternalAny } from './internalsExtra.js'
import { rheostatSliderX } from '../render/parts.js'
import { useCircuitStore } from '../sandbox3d/store.js'

const TERM_R = 12 // 接线柱命中半径（屏幕 px）
const SNAP_R = 18 // 连线吸附半径（屏幕 px）

export default function CircuitSandbox() {
  const canvasWrapRef = useRef(null)
  const canvasRef = useRef(null)

  // ── 模型唯一真源：sandbox3d/store.js（2D/3D 共享）──
  // 渲染循环每帧读 getState()，React 面板用下面订阅的 selectedId 触发重渲染。
  const selectedId = useCircuitStore((s) => s.selectedId)
  const componentCount = useCircuitStore((s) => s.components.length)
  const wireCount = useCircuitStore((s) => s.wires.length)

  // ── 视图/求解结果（渲染循环只读 ref，React 状态只用于触发面板刷新）──
  const resultsRef = useRef(new Map())
  const diagRef = useRef(null)
  const viewRef = useRef({ scale: 1.3, ox: 0, oy: 0 })
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 })
  const runningRef = useRef(true)
  const interactionRef = useRef({ mode: 'idle' })
  const lastTRef = useRef(0)

  // ── React 状态（触发 DOM 面板重渲染）──
  const [version, setVersion] = useState(0)
  const [running, setRunning] = useState(true)
  const [contextMenu, setContextMenu] = useState(null)
  const [internal, setInternal] = useState(null)
  const [toast, setToast] = useState(null)
  const [readoutTick, setReadoutTick] = useState(0)

  const bump = useCallback(() => setVersion((v) => v + 1), [])

  // 右侧读数每 250ms 刷新一次（画布指针由 rAF 驱动，读数面板降频避免整树频繁渲染）
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setReadoutTick((t) => t + 1), 250)
    return () => clearInterval(id)
  }, [running])

  // ── 坐标变换 ──
  const worldToScreen = useCallback((wx, wy) => {
    const v = viewRef.current
    return { x: wx * v.scale + v.ox, y: wy * v.scale + v.oy }
  }, [])
  const screenToWorld = useCallback((sx, sy) => {
    const v = viewRef.current
    return { x: (sx - v.ox) / v.scale, y: (sy - v.oy) / v.scale }
  }, [])

  const canvasPos = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }, [])

  // ── 历史 / 撤销（委托给共享 store）──
  const snapshot = useCallback(() => {
    const s = useCircuitStore.getState()
    return JSON.stringify({ components: s.components, wires: s.wires })
  }, [])
  const pushUndo = useCallback(() => useCircuitStore.getState().pushUndo(), [])
  const undo = useCallback(() => {
    if (!useCircuitStore.getState().undo()) setToast('没有可撤销的操作')
    bump()
  }, [bump])

  // ── 元件 / 导线操作 ──
  const addComponentAt = useCallback((type, world) => {
    const def = componentDef(type)
    if (!def) return
    const c = useCircuitStore.getState().addComponent(type, world.x, world.y, { def })
    bump()
    return c
  }, [bump])

  const deleteComponent = useCallback((id) => {
    useCircuitStore.getState().deleteComponent(id)
    bump()
  }, [bump])

  const copyComponent = useCallback((id) => {
    useCircuitStore.getState().copyComponent(id)
    bump()
  }, [bump])

  const deleteWire = useCallback((wid) => {
    useCircuitStore.getState().deleteWire(wid)
    bump()
  }, [bump])

  const clearAll = useCallback(() => {
    useCircuitStore.getState().clearAll()
    bump()
  }, [bump])

  const setParam = useCallback((id, key, value) => {
    useCircuitStore.getState().setParam(id, key, value)
    bump()
  }, [bump])

  // ── 命中检测 ──
  const findTermAt = useCallback((sx, sy) => {
    for (const c of useCircuitStore.getState().components) {
      for (let i = 0; i < 2; i++) {
        const t = termWorld(c, i)
        const p = worldToScreen(t.x, t.y)
        const dx = sx - p.x, dy = sy - p.y
        if (dx * dx + dy * dy <= TERM_R * TERM_R) return { compId: c.id, portIdx: i }
      }
    }
    return null
  }, [worldToScreen])

  const findTermNear = useCallback((sx, sy, exceptCompId) => {
    let best = null, bestD = SNAP_R * SNAP_R
    for (const c of useCircuitStore.getState().components) {
      if (c.id === exceptCompId) continue
      for (let i = 0; i < 2; i++) {
        const t = termWorld(c, i)
        const p = worldToScreen(t.x, t.y)
        const dx = sx - p.x, dy = sy - p.y
        const d = dx * dx + dy * dy
        if (d <= bestD) { bestD = d; best = { compId: c.id, portIdx: i } }
      }
    }
    return best
  }, [worldToScreen])

  const findCompAt = useCallback((wx, wy) => {
    const list = useCircuitStore.getState().components
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i]
      const hw = c.type === 'powerSupply' ? 56 : (c.type === 'ammeter' || c.type === 'voltmeter' || c.type === 'galvanometer' ? 36 : 44)
      const hh = c.type === 'powerSupply' ? 30 : 34
      if (Math.abs(wx - c.x) <= hw && Math.abs(wy - c.y) <= hh) return c
    }
    return null
  }, [])

  const hitWire = useCallback((sx, sy) => {
    let best = null, bestD = 9 * 9
    const components = useCircuitStore.getState().components
    for (const w of useCircuitStore.getState().wires) {
      const a = components.find((c) => c.id === w.from.compId)
      const b = components.find((c) => c.id === w.to.compId)
      if (!a || !b) continue
      const f = worldToScreen(termWorld(a, w.from.portIdx).x, termWorld(a, w.from.portIdx).y)
      const t = worldToScreen(termWorld(b, w.to.portIdx).x, termWorld(b, w.to.portIdx).y)
      const fIdx = w.from.portIdx, tIdx = w.to.portIdx
      const ext = 42 * viewRef.current.scale
      const fOut = fIdx === 0 ? -1 : 1
      const tOut = tIdx === 0 ? -1 : 1
      const c1 = { x: f.x + fOut * ext, y: f.y }
      const c2 = { x: t.x + tOut * ext, y: t.y }
      for (let k = 0; k <= 24; k++) {
        const u = k / 24
        const v = 1 - u
        const px = v * v * v * f.x + 3 * v * v * u * c1.x + 3 * v * u * u * c2.x + u * u * u * t.x
        const py = v * v * v * f.y + 3 * v * v * u * c1.y + 3 * v * u * u * c2.y + u * u * u * t.y
        const d = (sx - px) ** 2 + (sy - py) ** 2
        if (d < bestD) { bestD = d; best = w }
      }
    }
    return best
  }, [worldToScreen])

  // ── 鼠标交互 ──
  const handleMouseDown = useCallback((e) => {
    if (e.button === 1) { // 中键平移
      e.preventDefault()
      const p = canvasPos(e)
      interactionRef.current = { mode: 'pan', startSx: p.x, startSy: p.y, ox: viewRef.current.ox, oy: viewRef.current.oy }
      return
    }
    if (e.button !== 0) return
    const p = canvasPos(e)
    const w = screenToWorld(p.x, p.y)

    // 接线柱优先 → 拉线
    const term = findTermAt(p.x, p.y)
    if (term) {
      interactionRef.current = {
        mode: 'wire', wiring: { compId: term.compId, portIdx: term.portIdx, mouse: w, snapped: null },
        startSx: p.x, startSy: p.y,
      }
      useCircuitStore.getState().select(term.compId)
      bump()
      return
    }

    // 元件 → 选中 + 拖拽（滑变器滑片单独处理）
    const comp = findCompAt(w.x, w.y)
    if (comp) {
      useCircuitStore.getState().select(comp.id)
      bump()
      // 滑片命中
      if (comp.type === 'rheostat') {
        const R = comp.props.resistance ?? 20
        const maxR = comp.props.maxR ?? 50
        const sx = worldToScreen(comp.x + rheostatSliderX(R, maxR), comp.y - 18)
        if (Math.hypot(p.x - sx.x, p.y - sx.y) < 16) {
          pushUndo()
          interactionRef.current = { mode: 'slider', compId: comp.id }
          return
        }
      }
      pushUndo()
      interactionRef.current = { mode: 'drag', compId: comp.id, grabDx: w.x - comp.x, grabDy: w.y - comp.y, moved: false, startWx: w.x, startWy: w.y }
      return
    }

    // 空白 → 平移
    useCircuitStore.getState().select(null)
    bump()
    interactionRef.current = { mode: 'pan', startSx: p.x, startSy: p.y, ox: viewRef.current.ox, oy: viewRef.current.oy }
  }, [canvasPos, screenToWorld, findTermAt, findCompAt, worldToScreen, pushUndo, bump])

  const handleMouseMove = useCallback((e) => {
    const p = canvasPos(e)
    const w = screenToWorld(p.x, p.y)
    const it = interactionRef.current
    const cv = canvasRef.current

    if (it.mode === 'pan') {
      viewRef.current.ox = it.ox + (p.x - it.startSx)
      viewRef.current.oy = it.oy + (p.y - it.startSy)
      if (cv) cv.style.cursor = 'grabbing'
      return
    }
    if (it.mode === 'drag') {
      const c = useCircuitStore.getState().components.find((c) => c.id === it.compId)
      if (c) {
        useCircuitStore.getState().moveComponent(it.compId, w.x - it.grabDx, w.y - it.grabDy)
        if (Math.hypot(w.x - it.startWx, w.y - it.startWy) > 3) it.moved = true
      }
      if (cv) cv.style.cursor = 'grabbing'
      return
    }
    if (it.mode === 'slider') {
      const c = useCircuitStore.getState().components.find((c) => c.id === it.compId)
      if (c) {
        const maxR = c.props.maxR ?? 50
        let local = w.x - c.x
        local = Math.max(-26, Math.min(26, local))
        const R = Math.round(((local + 26) / 52) * maxR)
        useCircuitStore.getState().setParam(it.compId, 'resistance', R)
        bump()
      }
      if (cv) cv.style.cursor = 'ew-resize'
      return
    }
    if (it.mode === 'wire') {
      it.wiring.mouse = w
      it.wiring.snapped = findTermNear(p.x, p.y, it.wiring.compId)
      if (cv) cv.style.cursor = 'crosshair'
      return
    }

    // idle：悬停高亮
    const term = findTermAt(p.x, p.y)
    const comp = term ? null : findCompAt(w.x, w.y)
    it.hoverTerm = term
    if (cv) cv.style.cursor = term ? 'crosshair' : (comp ? 'grab' : 'default')
  }, [canvasPos, screenToWorld, findTermAt, findTermNear, findCompAt, bump])

  const handleMouseUp = useCallback((e) => {
    const it = interactionRef.current
    if (e.button === 1) {
      if (it.mode === 'pan') {
        interactionRef.current = { mode: 'idle' }
        if (canvasRef.current) canvasRef.current.style.cursor = 'default'
      }
      return
    }
    if (e.button !== 0) return
    const m = useCircuitStore.getState()

    if (it.mode === 'wire') {
      const snap = it.wiring.snapped
      const src = it.wiring.compId
      if (snap && snap.compId !== src) {
        // 去重：两端点已存在同一条线则不重复
        const dup = m.wires.some((w) =>
          (w.from.compId === src && w.from.portIdx === it.wiring.portIdx && w.to.compId === snap.compId && w.to.portIdx === snap.portIdx) ||
          (w.to.compId === src && w.to.portIdx === it.wiring.portIdx && w.from.compId === snap.compId && w.from.portIdx === snap.portIdx))
        if (!dup) {
          m.addWire(
            { compId: src, portIdx: it.wiring.portIdx },
            { compId: snap.compId, portIdx: snap.portIdx },
          )
        }
      }
    } else if (it.mode === 'drag') {
      // 开关：未拖动 = 点击 → 切换通断
      if (!it.moved) {
        const c = m.components.find((c) => c.id === it.compId)
        if (c && c.type === 'switch') {
          m.setParam(it.compId, 'closed', c.props.closed !== true)
        }
      }
    }

    interactionRef.current = { mode: 'idle', hoverTerm: it.hoverTerm }
    if (canvasRef.current) canvasRef.current.style.cursor = 'default'
    bump()
  }, [bump])

  const handleContextMenu = useCallback((e) => {
    e.preventDefault()
    const p = canvasPos(e)
    const w = screenToWorld(p.x, p.y)
    const term = findTermAt(p.x, p.y)
    const comp = term
      ? useCircuitStore.getState().components.find((c) => c.id === term.compId)
      : findCompAt(w.x, w.y)
    const wire = comp ? null : hitWire(p.x, p.y)
    if (comp) {
      useCircuitStore.getState().select(comp.id)
      bump()
      setContextMenu({ x: e.clientX, y: e.clientY, compId: comp.id })
    } else if (wire) {
      setContextMenu({ x: e.clientX, y: e.clientY, wireId: wire.id })
    } else {
      setContextMenu({ x: e.clientX, y: e.clientY, blank: true })
    }
  }, [canvasPos, screenToWorld, findTermAt, findCompAt, hitWire, bump])

  const handleDoubleClick = useCallback((e) => {
    const p = canvasPos(e)
    const w = screenToWorld(p.x, p.y)
    const comp = findCompAt(w.x, w.y)
    if (comp) openInternal(comp)
  }, [canvasPos, screenToWorld, findCompAt])

  // ── 拆开看内部 ──
  const openInternal = useCallback((comp) => {
    const def = componentDef(comp.type)
    const sp = worldToScreen(comp.x, comp.y)
    setInternal({ type: comp.type, label: def?.label || comp.type, x: sp.x, y: sp.y })
  }, [worldToScreen])

  // ── 滚轮缩放（原生监听，保证 passive:false）──
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onWheel = (e) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const v = viewRef.current
      const before = screenToWorld(sx, sy)
      const factor = Math.exp(-e.deltaY * 0.0012)
      const scale = Math.max(0.4, Math.min(3.5, v.scale * factor))
      v.scale = scale
      v.ox = sx - before.x * scale
      v.oy = sy - before.y * scale
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [screenToWorld])

  // ── 侧边栏拖放 ──
  const handleDragOver = useCallback((e) => { e.preventDefault() }, [])
  const handleDrop = useCallback((e) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('application/x-component')
    if (!type) return
    const p = canvasPos(e)
    const w = screenToWorld(p.x, p.y)
    addComponentAt(type, w)
  }, [canvasPos, screenToWorld, addComponentAt])

  // ── 初始化：尺寸、视图、恢复存档、渲染循环 ──
  useEffect(() => {
    const wrap = canvasWrapRef.current
    const cv = canvasRef.current
    if (!wrap || !cv) return

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      sizeRef.current = { w, h, dpr }
      cv.width = Math.max(1, Math.round(w * dpr))
      cv.height = Math.max(1, Math.round(h * dpr))
      // 首次初始化视图中心
      if (viewRef.current.ox === 0 && viewRef.current.oy === 0) {
        viewRef.current.ox = w / 2
        viewRef.current.oy = h / 2
      }
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    // 恢复上次保存的电路
    try {
      const saved = localStorage.getItem('circuit-sandbox-v1')
      if (saved) {
        useCircuitStore.getState().load(JSON.parse(saved))
        setVersion((v) => v + 1)
        setToast('已恢复上次电路')
      }
    } catch (_) {}

    let raf = 0
    const loop = (tms) => {
      const t = tms / 1000
      const dt = Math.min(0.05, t - (lastTRef.current || t))
      lastTRef.current = t

      const st = useCircuitStore.getState()
      const running = runningRef.current
      let results
      if (running && st.components.length) {
        const solved = solveCircuit(st.components, st.wires)
        results = solved.results
        diagRef.current = solved.diagnostics
      } else {
        results = new Map(st.components.map((c) => [c.id, { current: 0, voltage: 0, power: 0, terminalVoltage: 0 }]))
        diagRef.current = { short: false, reason: '仿真已暂停', maxCurrent: 0, sourceCount: 0 }
      }
      resultsRef.current = results

      const ctx = cv.getContext('2d')
      if (ctx && sizeRef.current.w > 0) {
        renderFrame(ctx, sizeRef.current.w, sizeRef.current.h, {
          dpr: sizeRef.current.dpr,
          view: viewRef.current,
          components: st.components,
          wires: st.wires,
          results,
          wireCurrent: (w) => wireCurrentFrom(w, st.components, results),
          selectedId: st.selectedId,
          hoverTerm: interactionRef.current.hoverTerm,
          activeTerm: interactionRef.current.mode === 'wire' ? interactionRef.current.wiring : null,
          wiring: interactionRef.current.mode === 'wire' ? interactionRef.current.wiring : null,
          running,
          dt,
          time: t,
        })
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [])

  // ── running 状态同步到 ref ──
  useEffect(() => { runningRef.current = running }, [running])
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 1600)
    return () => clearTimeout(id)
  }, [toast])

  // ── 工具栏动作 ──
  const saveCircuit = useCallback(() => {
    localStorage.setItem('circuit-sandbox-v1', snapshot())
    setToast('已保存电路')
  }, [snapshot])

  const exportPNG = useCallback(() => {
    const cv = canvasRef.current
    if (!cv) return
    const url = cv.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = '电路图.png'
    a.click()
  }, [])

  const menuItems = useMemo(() => {
    if (!contextMenu) return []
    if (contextMenu.blank) {
      return [
        { icon: '➕', label: '清空实验台', danger: true, onClick: clearAll },
      ]
    }
    if (contextMenu.wireId) {
      return [
        { icon: '🗑', label: '删除导线', danger: true, onClick: () => deleteWire(contextMenu.wireId) },
      ]
    }
    if (contextMenu.compId) {
      return [
        { icon: '🔬', label: '拆开看内部结构', onClick: () => { const c = useCircuitStore.getState().components.find((x) => x.id === contextMenu.compId); if (c) openInternal(c) } },
        { icon: '📋', label: '复制元件', onClick: () => copyComponent(contextMenu.compId) },
        { icon: '🗑', label: '删除元件', danger: true, onClick: () => deleteComponent(contextMenu.compId) },
      ]
    }
    return []
  }, [contextMenu, clearAll, deleteWire, deleteComponent, copyComponent, openInternal])

  const selectedComp = useMemo(
    () => useCircuitStore.getState().components.find((c) => c.id === selectedId) || null,
    [version, selectedId],
  )

  return (
    <div style={styles.root}>
      {/* 顶部工具栏 */}
      <Toolbar
        running={running}
        onToggleRun={() => setRunning((r) => !r)}
        onClear={clearAll}
        onUndo={undo}
        onSave={saveCircuit}
        onExport={exportPNG}
        count={componentCount}
      />

      <div style={styles.main}>
        {/* 左侧器材栏 */}
        <Sidebar onAdd={(type) => {
          const c = addComponentAt(type, { x: 0, y: 0 })
          if (c) {
            // 微调位置，避免叠在一起
            useCircuitStore.getState().moveComponent(c.id, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60)
            setVersion((x) => x + 1)
          }
        }} />

        {/* 中间画布 */}
        <div ref={canvasWrapRef} style={styles.canvasWrap}>
          <canvas
            ref={canvasRef}
            style={styles.canvas}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onContextMenu={handleContextMenu}
            onDoubleClick={handleDoubleClick}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          />

          {/* 状态栏 */}
          <StatusBar diag={diagRef.current} running={running} count={componentCount} wires={wireCount} />

          {/* 右键菜单 */}
          {contextMenu && (
            <ContextMenu x={contextMenu.x} y={contextMenu.y} items={menuItems} onClose={() => setContextMenu(null)} />
          )}

          {/* 拆开面板 */}
          {internal && (
            <InternalView
              type={internal.type}
              label={internal.label}
              anchor={internal}
              onClose={() => setInternal(null)}
            />
          )}
        </div>

        {/* 右侧参数面板 */}
        <RightPanel
          comp={selectedComp}
          results={resultsRef.current}
          diag={diagRef.current}
          version={version}
          tick={readoutTick}
          onParam={(id, key, value) => setParam(id, key, value)}
          onBeginEdit={pushUndo}
          onDelete={deleteComponent}
          onDisassemble={openInternal}
          onToggleSwitch={(id, closed) => setParam(id, 'closed', closed)}
          onTogglePower={(id, on) => setParam(id, 'on', on)}
        />
      </div>

      {/* toast */}
      {toast && <div style={styles.toast}>{toast}</div>}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  顶部工具栏
// ══════════════════════════════════════════════════════════════

function Toolbar({ running, onToggleRun, onClear, onUndo, onSave, onExport, count }) {
  return (
    <div style={styles.toolbar}>
      <div style={styles.toolbarTitle}>🔬 电学仿真实验室</div>
      <div style={styles.toolbarGroup}>
        <button style={styles.tbBtn} onClick={onClear} title="清空实验台">🗑 清空</button>
        <button style={styles.tbBtn} onClick={onUndo} title="撤销上一步">↩ 撤销</button>
        <button style={styles.tbBtn} onClick={onSave} title="保存电路到本地">💾 保存</button>
        <button style={styles.tbBtn} onClick={onExport} title="导出为 PNG 电路图">📤 导出电路图</button>
        <button
          style={{
            ...styles.tbBtn,
            background: running ? 'rgba(61,220,132,0.18)' : 'rgba(255,176,32,0.20)',
            borderColor: running ? 'rgba(61,220,132,0.6)' : 'rgba(255,176,32,0.6)',
            color: running ? '#7ce8b0' : '#ffd08a',
          }}
          onClick={onToggleRun}
          title="启动/暂停仿真"
        >
          {running ? '⏸ 暂停仿真' : '▶ 启动仿真'}
        </button>
      </div>
      <div style={styles.toolbarCount}>器材 {count}</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  左侧器材栏（分组 + 可拖拽缩略图）
// ══════════════════════════════════════════════════════════════

function Sidebar({ onAdd }) {
  const [active, setActive] = useState('electric')

  return (
    <div style={styles.sidebar}>
      {/* 分组标签 */}
      <div style={styles.groupTabs}>
        {COMPONENT_GROUPS.map((g) => (
          <div
            key={g.key}
            style={{
              ...styles.groupTab,
              background: active === g.key ? 'rgba(90,169,255,0.18)' : 'transparent',
              color: active === g.key ? '#cfe4ff' : '#8b98a5',
              borderColor: active === g.key ? 'rgba(90,169,255,0.6)' : 'transparent',
            }}
            onClick={() => setActive(g.key)}
          >
            <span>{g.icon}</span>
            <span>{g.label}</span>
          </div>
        ))}
      </div>

      {/* 器材列表 */}
      <div style={styles.itemList}>
        {COMPONENT_GROUPS.find((g) => g.key === active)?.items.map((def) => (
          <div
            key={def.type}
            style={styles.item}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/x-component', def.type)
              e.dataTransfer.effectAllowed = 'copy'
            }}
            onClick={() => onAdd(def.type)}
            title={`${def.label} — 拖到画布或点击添加\n${def.desc}`}
          >
            <Thumb def={def} />
            <div style={styles.itemLabel}>{def.label}</div>
          </div>
        ))}
        {COMPONENT_GROUPS.find((g) => g.key === active)?.items.length === 0 && (
          <div style={styles.placeholder}>
            {COMPONENT_GROUPS.find((g) => g.key === active)?.placeholder || '暂无器材'}
          </div>
        )}
      </div>

      <div style={styles.sidebarHint}>
        <div>· 拖拽/点击器材到画布</div>
        <div>· 点接线柱拉线，自动吸附</div>
        <div>· 点开关通断 · 右键更多</div>
        <div>· 双击元件拆开看内部</div>
      </div>
    </div>
  )
}

function Thumb({ def }) {
  const ref = useRef(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const dpr = window.devicePixelRatio || 1
    cv.width = 84 * dpr
    cv.height = 58 * dpr
    renderThumb(cv, def.type, def)
  }, [def])
  return <canvas ref={ref} style={{ width: 84, height: 58 }} />
}

// ══════════════════════════════════════════════════════════════
//  右侧参数面板
// ══════════════════════════════════════════════════════════════

function RightPanel({ comp, results, diag, version, tick, onParam, onBeginEdit, onDelete, onDisassemble, onToggleSwitch, onTogglePower }) {
  void version
  void tick
  if (!comp) {
    return (
      <div style={styles.right}>
        <div style={styles.rightTitle}>实验台</div>
        <div style={styles.readoutCard}>
          <div style={styles.readoutLabel}>电路状态</div>
          <div style={{ ...styles.readoutVal, color: diag?.short ? '#ff8a80' : '#7ce8b0' }}>
            {diag?.short ? '⚠ 短路' : (diag?.reason || '正常')}
          </div>
        </div>
        <div style={styles.tips}>
          <div style={styles.tipsTitle}>操作提示</div>
          <div>· 选中元件后在右侧修改参数</div>
          <div>· 电流表串联、电压表并联</div>
          <div>· 滑动变阻器拖滑片调阻值</div>
          <div>· 拆开元件可看内部结构</div>
        </div>
      </div>
    )
  }

  const def = componentDef(comp.type)
  const r = results.get(comp.id)
  const title = def?.label || comp.type
  const readouts = []

  if (comp.type === 'ammeter') readouts.push(['电流', `${Math.abs(r?.current || 0).toFixed(3)} A`])
  if (comp.type === 'voltmeter') readouts.push(['电压', `${Math.abs(r?.voltage || 0).toFixed(2)} V`])
  if (comp.type === 'galvanometer') readouts.push(['电流', `${((r?.current || 0) * 1000).toFixed(1)} μA`])
  if (comp.type === 'battery' || comp.type === 'powerSupply') readouts.push(['输出电流', `${Math.abs(r?.current || 0).toFixed(3)} A`])
  if (comp.type === 'bulb') readouts.push(['功率', `${Math.abs(r?.power || 0).toFixed(2)} W`])
  if (comp.type === 'resistor' || comp.type === 'rheostat') readouts.push(['功率', `${Math.abs(r?.power || 0).toFixed(2)} W`])
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

      {/* 开关 / 电源的专用开关 */}
      {comp.type === 'switch' && (
        <div style={styles.paramRow}>
          <span style={styles.paramLabel}>通断</span>
          <button
            style={{ ...styles.toggleBtn, background: comp.props.closed ? '#1f3a2c' : '#3a2226', color: comp.props.closed ? '#7ce8b0' : '#ff9d95' }}
            onClick={() => { onBeginEdit(); onToggleSwitch(comp.id, comp.props.closed !== true) }}
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
            onClick={() => { onBeginEdit(); onTogglePower(comp.id, comp.props.on === false) }}
          >
            {comp.props.on !== false ? '已通电（点击断电）' : '已断电（点击通电）'}
          </button>
        </div>
      )}

      {/* 参数滑杆 / 量程选择 */}
      {(def?.params || []).map((p) => {
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
                      background: Math.abs((comp.props[p.key] ?? p.options[0]) - v) < 1e-9 ? 'rgba(74,144,217,0.30)' : 'rgba(255,255,255,0.06)',
                      borderColor: Math.abs((comp.props[p.key] ?? p.options[0]) - v) < 1e-9 ? 'rgba(74,144,217,0.85)' : 'rgba(255,255,255,0.12)',
                    }}
                    onClick={() => { onBeginEdit(); onParam(comp.id, p.key, v) }}
                  >
                    {p.unit === 'mA' ? `0~${v * 1000}mA` : `0~${v}${p.unit}`}
                  </button>
                ))}
              </div>
            </div>
          )
        }
        const val = comp.props[p.key] ?? 0
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
              onPointerDown={onBeginEdit}
              onChange={(e) => onParam(comp.id, p.key, parseFloat(e.target.value))}
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
                    onClick={() => { onBeginEdit(); onParam(comp.id, p.key, v) }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}

      <div style={styles.rightActions}>
        <button style={styles.actionBtn} onClick={() => onDisassemble(comp)}>🔬 拆开看内部</button>
        <button style={{ ...styles.actionBtn, color: '#ff9d95', borderColor: 'rgba(255,82,82,0.5)' }} onClick={() => onDelete(comp.id)}>🗑 删除</button>
      </div>
    </div>
  )
}

function formatNum(v) {
  if (!Number.isFinite(v)) return '--'
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

// ══════════════════════════════════════════════════════════════
//  右键菜单
// ══════════════════════════════════════════════════════════════

function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', onKey) }
  }, [onClose])

  const h = items.length * 32 + 8
  const left = Math.max(6, Math.min(window.innerWidth - 160 - 6, x))
  const top = Math.max(6, Math.min(window.innerHeight - h - 6, y))

  return (
    <div ref={ref} style={{ ...styles.menu, left, top }}>
      {items.map((it, i) => (
        <button
          key={i}
          type="button"
          style={{ ...styles.menuItem, color: it.danger ? '#ff8a80' : '#e6edf3' }}
          onClick={() => { onClose(); it.onClick?.() }}
        >
          <span>{it.icon}</span>
          <span>{it.label}</span>
        </button>
      ))}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  拆开看内部结构（浮层）
// ══════════════════════════════════════════════════════════════

const INT_CW = 320
const INT_CH = 250

function InternalView({ type, label, anchor, onClose }) {
  const cvRef = useRef(null)
  const [meta, setMeta] = useState(null)
  const [pos, setPos] = useState({ x: anchor.x ?? 80, y: anchor.y ?? 80 })
  const dragRef = useRef(null)

  useEffect(() => {
    const cv = cvRef.current
    if (!cv) return
    const dpr = window.devicePixelRatio || 1
    cv.width = INT_CW * dpr
    cv.height = INT_CH * dpr
    const ctx = cv.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#f4f6f8'
    ctx.fillRect(0, 0, INT_CW, INT_CH)
    setMeta(drawInternalAny(ctx, INT_CW, INT_CH, type))
  }, [type])

  useEffect(() => {
    const move = (e) => {
      const d = dragRef.current
      if (!d) return
      setPos({
        x: Math.max(4, Math.min(window.innerWidth - 470, e.clientX - d.dx)),
        y: Math.max(4, Math.min(window.innerHeight - 140, e.clientY - d.dy)),
      })
    }
    const up = () => { dragRef.current = null }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  }, [])

  return (
    <div style={{ ...styles.internalPanel, left: pos.x, top: pos.y }}>
      <div
        style={styles.internalHead}
        onMouseDown={(e) => { dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }; e.preventDefault() }}
      >
        <span style={{ fontSize: 13, fontWeight: 700 }}>🔬 拆开看内部结构 — {label}</span>
        <span style={{ flex: 1 }} />
        <button type="button" style={styles.closeBtn} onClick={onClose}>✕</button>
      </div>
      <div style={{ display: 'flex', gap: 10, padding: 12 }}>
        <canvas ref={cvRef} style={{ width: INT_CW, height: INT_CH, borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', flex: '0 0 auto' }} />
        <div style={{ flex: 1, minWidth: 0, maxHeight: INT_CH, overflowY: 'auto' }}>
          <div style={{ fontSize: 11, color: '#8a97a5', marginBottom: 8, lineHeight: 1.5 }}>
            外壳切开，露出内部结构。
          </div>
          {(meta?.parts || []).map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 7, marginBottom: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, marginTop: 3, flex: '0 0 auto', background: p.color }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#e6edf3' }}>{p.name}</div>
                <div style={{ fontSize: 10.5, color: '#93a3b5', lineHeight: 1.45 }}>{p.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  状态栏
// ══════════════════════════════════════════════════════════════

function StatusBar({ diag, running, count, wires }) {
  return (
    <div style={styles.statusBar}>
      <span style={{ color: running ? '#7ce8b0' : '#ffd08a' }}>{running ? '● 仿真运行中' : '○ 仿真已暂停'}</span>
      <span>器材 {count}</span>
      <span>导线 {wires}</span>
      <span style={{ color: diag?.short ? '#ff8a80' : '#8a97a5' }}>{diag?.short ? '⚠ 短路' : diag?.reason || ''}</span>
      <span style={{ marginLeft: 'auto', color: '#5a6670' }}>滚轮缩放 · 拖空白平移 · 接线柱拉线 · 右键更多</span>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  样式
// ══════════════════════════════════════════════════════════════

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
    border: '1px solid #30363d', borderRadius: 6, fontSize: 12, cursor: 'pointer',
    whiteSpace: 'nowrap',
  },

  main: { flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 },

  sidebar: {
    width: 116, flexShrink: 0, background: '#161b22', borderRight: '1px solid #30363d',
    display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden',
  },
  groupTabs: { display: 'flex', flexDirection: 'column', padding: 8, gap: 4, borderBottom: '1px solid #21262d', flexShrink: 0 },
  groupTab: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '7px 9px', borderRadius: 7,
    fontSize: 12.5, cursor: 'pointer', border: '1px solid transparent', userSelect: 'none',
  },
  itemList: { flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 },
  item: {
    padding: 4, borderRadius: 8, cursor: 'grab', textAlign: 'center',
    background: 'rgba(255,255,255,0.03)', border: '1px solid transparent',
  },
  itemLabel: { fontSize: 11, color: '#aab7c2', marginTop: 1, whiteSpace: 'nowrap' },
  placeholder: { padding: 18, textAlign: 'center', fontSize: 11.5, color: '#5a6670', lineHeight: 1.6 },
  sidebarHint: {
    padding: 10, fontSize: 10, color: '#5a6670', lineHeight: 1.7,
    borderTop: '1px solid #21262d', flexShrink: 0,
  },

  canvasWrap: { flex: 1, position: 'relative', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' },
  canvas: { flex: 1, width: '100%', minHeight: 0, display: 'block', touchAction: 'none' },

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
  tipsTitle: { fontSize: 12, fontWeight: 700, color: '#c9d1d9', marginBottom: 4 },

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
  rightActions: { display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 10 },
  actionBtn: {
    flex: 1, padding: '7px 6px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
    background: 'rgba(90,169,255,0.12)', color: '#cfe4ff', border: '1px solid rgba(90,169,255,0.4)', borderRadius: 7,
  },

  menu: {
    position: 'fixed', width: 158, zIndex: 60, background: 'rgba(28,32,38,0.98)',
    border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '4px 0',
    boxShadow: '0 10px 28px rgba(0,0,0,0.45)',
  },
  menuItem: {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 32, padding: '0 12px',
    border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12.5, textAlign: 'left',
  },

  internalPanel: {
    position: 'absolute', width: 460, zIndex: 55, background: 'rgba(24,28,34,0.97)',
    border: '1px solid rgba(255,255,255,0.13)', borderRadius: 12, overflow: 'hidden',
    boxShadow: '0 16px 40px rgba(0,0,0,0.5)', color: '#e6edf3',
  },
  internalHead: {
    display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 12px',
    background: 'rgba(255,255,255,0.06)', cursor: 'move', userSelect: 'none',
  },
  closeBtn: {
    width: 24, height: 24, borderRadius: 6, border: 'none', cursor: 'pointer',
    background: 'rgba(255,255,255,0.10)', color: '#cbd5e1', fontSize: 13, lineHeight: '22px',
  },

  toast: {
    position: 'fixed', bottom: 44, left: '50%', transform: 'translateX(-50%)',
    padding: '8px 18px', borderRadius: 20, background: 'rgba(20,26,32,0.95)',
    border: '1px solid rgba(90,169,255,0.4)', color: '#cfe4ff', fontSize: 12.5, zIndex: 70,
  },
}
