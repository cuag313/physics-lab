/**
 * sandbox3d/store.js — 电学沙盒共享电路模型（2D 电路图 / 3D 拟物视图唯一真源）
 *
 * 同一个电路模型在 2D 与 3D 之间实时同步：两端都只读写这里，
 * 求解统一走 ../sandbox/circuit.js 的 solveCircuit()，因此读数天然一致。
 *
 * 只放「模型 + 选择 + 模式 + 历史」，渲染循环相关状态（results/diag/view/
 * 交互态）仍留在各自视图内部，避免跨视图互相污染。
 */

import { create } from 'zustand'

const MAX_HISTORY = 50

/** 历史快照只序列化模型本身 */
function snapshotModel(state) {
  return JSON.stringify({ components: state.components, wires: state.wires })
}

function restoreModel(data) {
  const components = Array.isArray(data?.components) ? data.components : []
  const wires = Array.isArray(data?.wires) ? data.wires : []
  let nextId = 1
  for (const c of components) nextId = Math.max(nextId, (c.id || 0) + 1)
  for (const w of wires) nextId = Math.max(nextId, (w.id || 0) + 1)
  return { components, wires, nextId }
}

export const useCircuitStore = create((set, get) => ({
  // 当前视图：'2d' | '3d'
  mode: '3d',

  // 电路模型
  components: [],
  wires: [],
  nextId: 1,

  // 选中元件（2D / 3D 共用，保证切换视图时选中不丢）
  selectedId: null,

  // 撤销栈（50 步）
  history: [],

  setMode: (mode) => set({ mode: mode === '2d' ? '2d' : '3d' }),

  select: (id) => set({ selectedId: id ?? null }),

  pushUndo: () => {
    const history = get().history
    const next = history.concat(snapshotModel(get()))
    if (next.length > MAX_HISTORY) next.shift()
    set({ history: next })
  },

  undo: () => {
    const history = get().history
    if (!history.length) return false
    const last = history[history.length - 1]
    const next = history.slice(0, -1)
    let data = null
    try { data = JSON.parse(last) } catch (_) { /* 忽略坏快照 */ }
    set({ ...restoreModel(data), selectedId: null, history: next })
    return true
  },

  /** 从存档恢复（清空历史） */
  load: (data) => {
    set({ ...restoreModel(data), selectedId: null, history: [] })
  },

  addComponent: (type, x, y, extra = {}) => {
    get().pushUndo()
    const id = extra.useId ?? get().nextId
    const def = extra.def || {}
    const comp = {
      id,
      type,
      x,
      y,
      props: { ...(def.defaults || {}), ...(extra.props || {}) },
    }
    set((s) => ({
      components: s.components.concat(comp),
      nextId: Math.max(s.nextId, id + 1),
      selectedId: id,
    }))
    return comp
  },

  moveComponent: (id, x, y) => {
    set((s) => ({
      components: s.components.map((c) => (c.id === id ? { ...c, x, y } : c)),
    }))
  },

  setParam: (id, key, value) => {
    set((s) => ({
      components: s.components.map((c) =>
        c.id === id ? { ...c, props: { ...c.props, [key]: value } } : c,
      ),
    }))
  },

  deleteComponent: (id) => {
    get().pushUndo()
    set((s) => ({
      components: s.components.filter((c) => c.id !== id),
      wires: s.wires.filter((w) => w.from.compId !== id && w.to.compId !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    }))
  },

  copyComponent: (id) => {
    const src = get().components.find((c) => c.id === id)
    if (!src) return null
    get().pushUndo()
    const c = {
      id: get().nextId,
      type: src.type,
      x: src.x + 36,
      y: src.y + 36,
      props: { ...src.props },
    }
    set((s) => ({
      components: s.components.concat(c),
      nextId: Math.max(s.nextId, c.id + 1),
      selectedId: c.id,
    }))
    return c
  },

  addWire: (from, to) => {
    get().pushUndo()
    const w = { id: get().nextId, from: { ...from }, to: { ...to } }
    set((s) => ({
      wires: s.wires.concat(w),
      nextId: Math.max(s.nextId, w.id + 1),
    }))
    return w
  },

  deleteWire: (id) => {
    get().pushUndo()
    set((s) => ({ wires: s.wires.filter((w) => w.id !== id) }))
  },

  clearAll: () => {
    if (!get().components.length && !get().wires.length) return
    get().pushUndo()
    set({ components: [], wires: [], selectedId: null })
  },
}))
