import { useState, useRef, useEffect, useCallback } from 'react'
import { eventToCanvas } from '../utils/pointerPos'
import { CircuitGraph, CircuitSolver } from '../engine/index.js'
import { wireCurrent } from '../engine/CircuitSolver.js'
import SceneShell from '../ui/SceneShell'
import InfoDock from '../ui/InfoDock'
import BuilderPalette from '../ui/BuilderPalette'
import ComponentParamPanel from '../ui/ComponentParamPanel'
import CircuitReadoutPanel from '../ui/CircuitReadoutPanel'
import ContextMenu from '../ui/ContextMenu'
import InternalPanel from '../ui/InternalPanel'
import { fitLayout, drawPanel } from '../ui/canvasLayout'
import {
  getTerminals, getTermPos, findTermAt, findTermNear,
  bezierCtrl,
  findCompAt, findCompWide, mapSliderR,
  drawGuideBubble,
  drawWorkspace, drawReadoutChip, drawToggleRow,
  drawRealMultimeter,
  MULTIMETER_JACK,
  hitMultimeterModeBtn,
  meterRange,
} from '../ui/circuitKit'
// ── 渲染层：Tab1 标准电路符号 / Tab2 写实教具 ──
import { symBattery, symSwitch, symResistor, symRheostat, symMeter, symHalf, SYM_INK } from '../render/symbols.js'
// ── 渲染层（写实教具）：元件、导线、桌面、表盘指针 ──
import { drawBench, drawWorkArea } from '../render/workbench.js'
import {
  drawBattery as drawRealBattery2,
  drawBulb as drawRealBulb2,
  drawSwitch as drawRealSwitch2,
  drawResistor as drawRealResistor2,
  drawRheostat as drawRealRheostat2,
  drawMeter as drawRealMeter2,
  drawTerminal as drawPost,
  needleRatio,
  rheostatSliderX,
} from '../render/parts.js'
import { wirePath, drawWire, drawWirePreview, drawFlow, flowSpeed, bezierAt } from '../render/wire.js'
import { stepNeedle, resetNeedles, dropNeedle, scaleSpec } from '../render/needle.js'

// 模块级数据（跨渲染保留，不被组件重渲染重置）
let dataIUStore = []
let dataIRStore = []

// ─── 数据分析：线性拟合 + 平均值/相对误差 ───

/** 最小二乘拟合 y = kx + b，返回 {k, b, r2}（样本<2 或退化时返回 null） */
function linearFit(xs, ys) {
  const n = xs.length
  if (n < 2) return null
  let sx = 0, sy = 0, sxx = 0, sxy = 0
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i] }
  const denom = n * sxx - sx * sx
  if (Math.abs(denom) < 1e-12) return null
  const k = (n * sxy - sx * sy) / denom
  const b = (sy - k * sx) / n
  let ssTot = 0, ssRes = 0
  const meanY = sy / n
  for (let i = 0; i < n; i++) {
    const pred = k * xs[i] + b
    ssTot += (ys[i] - meanY) ** 2
    ssRes += (ys[i] - pred) ** 2
  }
  const r2 = ssTot > 1e-12 ? 1 - ssRes / ssTot : 1
  return { k, b, r2 }
}

/** Step1（I-U）：拟合 I = k·U + b，k≈1/R；U/I 反推电阻的平均值与相对误差 */
function analyzeIU(data, fallbackR) {
  const pts = data.filter(d => d.I > 1e-9)
  const fit = linearFit(pts.map(d => d.U), pts.map(d => d.I))
  const Rs = pts.map(d => d.U / d.I)
  const avgR = Rs.length ? Rs.reduce((a, c) => a + c, 0) / Rs.length : 0
  const noms = pts.map(d => (typeof d.R_nom === 'number' ? d.R_nom : fallbackR)).filter(v => v > 0)
  const nominal = noms.length ? noms.reduce((a, c) => a + c, 0) / noms.length : fallbackR
  const err = nominal > 0 && avgR > 0 ? (avgR - nominal) / nominal * 100 : 0
  return { fit, avgR, err, nominal, n: pts.length }
}

/** Step2（I-1/R）：拟合 I = k·(1/R) + b，k≈U；I·R 反推电压的平均值与相对误差 */
function analyzeIR(data, fallbackU) {
  const pts = data.filter(d => d.R > 0)
  const fit = linearFit(pts.map(d => 1 / d.R), pts.map(d => d.I))
  const Us = pts.map(d => d.I * d.R)
  const avgU = Us.length ? Us.reduce((a, c) => a + c, 0) / Us.length : 0
  const noms = pts.map(d => (typeof d.U_nom === 'number' ? d.U_nom : fallbackU)).filter(v => v > 0)
  const nominal = noms.length ? noms.reduce((a, c) => a + c, 0) / noms.length : fallbackU
  const err = nominal > 0 && avgU > 0 ? (avgU - nominal) / nominal * 100 : 0
  return { fit, avgU, err, nominal, n: pts.length }
}

/** 导出 CSV（带 BOM，Excel 直接识别中文表头） */
function exportCSV(step) {
  const isStep1 = step === 1
  const data = isStep1 ? dataIUStore : dataIRStore
  if (!data.length) return
  const lines = [isStep1 ? '序号,U(V),I(A),R=U/I(Ω),R标称(Ω)' : '序号,R(Ω),I(A),1/R(1/Ω),U标称(V)']
  data.forEach((d, i) => {
    if (isStep1) {
      const R = d.I > 0 ? (d.U / d.I).toFixed(2) : ''
      lines.push(`${i + 1},${d.U},${d.I},${R},${d.R_nom ?? ''}`)
    } else {
      lines.push(`${i + 1},${d.R},${d.I},${(1 / d.R).toFixed(4)},${d.U_nom ?? ''}`)
    }
  })
  const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = isStep1 ? '欧姆定律_数据_I-U.csv' : '欧姆定律_数据_I-R.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ─── 电表拖放自动接入：电流表→串入导线，电压表→并联到元件 ───

function distToSeg(px, py, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2)) : 0
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy))
}

function nearestWire(s, x, y, maxD = 34) {
  let best = null, bestD = maxD
  for (const w of s.wires) {
    const fc = s.components.find(c => c.id === w.from.compId)
    const tc = s.components.find(c => c.id === w.to.compId)
    if (!fc || !tc) continue
    const a = getTermPos(fc, w.from.termIdx), b = getTermPos(tc, w.to.termIdx)
    const d = distToSeg(x, y, a, b)
    if (d < bestD) { bestD = d; best = { wire: w, a, b } }
  }
  return best
}

function compAtPoint(s, x, y, excludeId) {
  for (let i = s.components.length - 1; i >= 0; i--) {
    const c = s.components[i]
    if (c.id === excludeId) continue
    if (Math.abs(c.x - x) <= 46 && Math.abs(c.y - y) <= 38) return c
  }
  return null
}

function meterIsFree(s, meterId) {
  return !s.wires.some(o => o.from.compId === meterId || o.to.compId === meterId)
}

/** 表类器材的接入方式：series=串到导线上，shunt=并到元件两端 */
function meterKind(comp) {
  if (!comp) return null
  if (comp.type === 'ammeter') return 'series'
  if (comp.type === 'voltmeter') return 'shunt'
  if (comp.type === 'multimeter') return comp.props && comp.props.mode === 'A' ? 'series' : 'shunt'
  return null
}

/** 拖动电表时计算落点：返回 {kind, ok, why?}，ok=false 表示悬停可见但不可自动接入 */
function computeDropTarget(s, comp, x, y) {
  if (!comp || !s.dragMoved) return null
  const kind = meterKind(comp)
  if (kind === 'series') {
    const hit = nearestWire(s, x, y, 34)
    if (!hit) return null
    if (!meterIsFree(s, comp.id)) return { kind: 'wire', wireId: hit.wire.id, ok: false, why: '电表已接线' }
    const len = Math.hypot(hit.b.x - hit.a.x, hit.b.y - hit.a.y)
    if (len < 100) return { kind: 'wire', wireId: hit.wire.id, ok: false, why: '导线太短，放不进电表' }
    return { kind: 'wire', wireId: hit.wire.id, ok: true, a: hit.a, b: hit.b }
  }
  if (kind === 'shunt') {
    const t = compAtPoint(s, x, y, comp.id)
    if (!t) return null
    if (!meterIsFree(s, comp.id)) return { kind: 'comp', compId: t.id, ok: false, why: '电表已接线' }
    return { kind: 'comp', compId: t.id, ok: true }
  }
  return null
}

// ─── 万用表表笔：吸附测点、读两点电压、夹导线串入 ───

/** 吸附目标 → {compId, port}：导线上的点映射到该导线的起点（同节点） */
function snapToPort(s, snap) {
  if (!snap) return null
  if (snap.kind === 'port') return { compId: snap.compId, port: snap.port }
  if (snap.kind === 'wire') {
    const w = s.wires.find(o => o.id === snap.wireId)
    if (w) return { compId: w.from.compId, port: w.from.termIdx }
  }
  return null
}

/** V 档：两笔吸附的测点之间的电势差（未就位返回 null） */
function probeVoltage(s, comp, er) {
  const probes = comp.props && comp.props.probes
  if (!probes || !er || !er.ok || !er.portNode) return null
  const nv = er.results && er.results.nodeVoltages
  if (!nv) return null
  const a = snapToPort(s, probes.R.snap), b = snapToPort(s, probes.B.snap)
  if (!a || !b) return null
  const na = er.portNode.get(`${a.compId}:${a.port}`), nb = er.portNode.get(`${b.compId}:${b.port}`)
  if (na == null || nb == null) return null
  return Math.abs((nv[na] || 0) - (nv[nb] || 0))
}

/** A 档：两笔是否分别夹在同一段导线的两端 */
function probeClampWire(s, comp) {
  const probes = comp.props && comp.props.probes
  if (!probes) return null
  const a = probes.R.snap, b = probes.B.snap
  if (!a || !b || a.kind !== 'port' || b.kind !== 'port') return null
  const pa = `${a.compId}:${a.port}`, pb = `${b.compId}:${b.port}`
  for (const w of s.wires) {
    const f = `${w.from.compId}:${w.from.termIdx}`, t = `${w.to.compId}:${w.to.termIdx}`
    if ((pa === f && pb === t) || (pa === t && pb === f)) return w
  }
  return null
}

/** 表笔落点吸附：先接线柱、再导线上的点（不吸自家插孔，免得笔尖钉死在表上） */
function probeSnapAt(s, x, y, selfId) {
  const t = findTermAt(s.components, x, y, 32)
  if (t && t.compId !== selfId) return { kind: 'port', compId: t.compId, port: t.termIdx }
  const w = nearestWire(s, x, y, 24)
  if (w) return { kind: 'wire', wireId: w.wire.id }
  return null
}

/** 表笔命中：整支笔身（笔尖→笔杆尾）的线段距离，取更近的那支 */
function hitProbeAt(comp, mx, my) {
  const probes = comp.props && comp.props.probes
  if (!probes) return null
  const cos = Math.cos(comp.rotation || 0), sin = Math.sin(comp.rotation || 0)
  let best = null, bestD = 36
  for (const key of ['R', 'B']) {
    const p = probes[key]
    if (!p) continue
    // 笔身方向：插孔 → 笔尖（与 drawProbes 的线弧方向一致）
    const j = MULTIMETER_JACK[key]
    const jx = comp.x + j.x * cos - j.y * sin
    const jy = comp.y + j.x * sin + j.y * cos
    const dx = p.x - jx, dy = p.y - jy
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len, uy = dy / len
    // 线段：笔杆尾(尖后 32px) → 笔尖前 16px
    const ax = p.x - ux * 32, ay = p.y - uy * 32
    const bx = p.x + ux * 16, by = p.y + uy * 16
    const d = distToSeg(mx, my, { x: ax, y: ay }, { x: bx, y: by })
    if (d < bestD) { bestD = d; best = key }
  }
  return best
}

/** 表笔复位到插孔（机身局部坐标 → 世界坐标） */
function resetProbe(comp, key) {
  // 默认垂在表体下方，红偏左、黑偏右，避免两支笔叠在插孔上看不见
  const j = MULTIMETER_JACK[key]
  const dropX = key === 'R' ? -38 : 38
  const dropY = 62
  const cos = Math.cos(comp.rotation || 0), sin = Math.sin(comp.rotation || 0)
  const lx = j.x + dropX * 0.35, ly = j.y + dropY
  return {
    x: comp.x + lx * cos - ly * sin,
    y: comp.y + lx * sin + ly * cos,
    snap: null,
  }
}

/** 执行自动接入，成功返回 true */
function applyAutoConnect(s, meterId, dt, bounds) {
  const comp = s.components.find(k => k.id === meterId)
  if (!comp || !dt || !dt.ok) return false
  const addWire = (from, to) => s.wires.push({
    id: s.nextId++, from, to, color: s.wireColor, mid1X: null, mid1Y: null, mid2X: null, mid2Y: null,
  })

  if (dt.kind === 'wire') {
    const idx = s.wires.findIndex(w => w.id === dt.wireId)
    if (idx < 0) return false
    const w = s.wires[idx]
    const fc = s.components.find(c => c.id === w.from.compId)
    const tc = s.components.find(c => c.id === w.to.compId)
    if (!fc || !tc) return false
    const a = getTermPos(fc, w.from.termIdx), b = getTermPos(tc, w.to.termIdx)
    if (Math.hypot(b.x - a.x, b.y - a.y) < 100) return false
    // 电流表贴合到导线中点；表盘尽量朝上（超过±90°就翻转180°并交换两端接线）
    let rot = Math.atan2(b.y - a.y, b.x - a.x)
    let swap = false
    if (rot > Math.PI / 2 || rot < -Math.PI / 2) {
      rot += Math.PI
      if (rot > Math.PI) rot -= Math.PI * 2
      swap = true
    }
    comp.rotation = rot
    comp.x = (a.x + b.x) / 2
    comp.y = (a.y + b.y) / 2
    s.wires.splice(idx, 1)
    if (swap) {
      addWire(w.from, { compId: meterId, termIdx: 1 })
      addWire({ compId: meterId, termIdx: 0 }, w.to)
    } else {
      addWire(w.from, { compId: meterId, termIdx: 0 })
      addWire({ compId: meterId, termIdx: 1 }, w.to)
    }
    return true
  }

  if (dt.kind === 'comp') {
    const t = s.components.find(k => k.id === dt.compId)
    if (!t) return false
    const dup = (c0, i0, c1, i1) => s.wires.some(o =>
      (o.from.compId === c0 && o.from.termIdx === i0 && o.to.compId === c1 && o.to.termIdx === i1) ||
      (o.to.compId === c0 && o.to.termIdx === i0 && o.from.compId === c1 && o.from.termIdx === i1))
    let added = 0
    if (!dup(meterId, 0, t.id, 0)) { addWire({ compId: meterId, termIdx: 0 }, { compId: t.id, termIdx: 0 }); added++ }
    if (!dup(meterId, 1, t.id, 1)) { addWire({ compId: meterId, termIdx: 1 }, { compId: t.id, termIdx: 1 }); added++ }
    if (!added) return false
    // 电压表摆到元件下方（放不下就摆上方），端子与元件两端一一对应
    comp.rotation = 0
    comp.x = t.x
    const below = t.y + 58
    comp.y = (bounds && below > bounds.h - 46) ? t.y - 58 : below
    return true
  }
  return false
}

/** 新元件的出厂参数（与参数面板、求解器读取的字段保持同一套） */
function defaultProps(type) {
  switch (type) {
    case 'battery': return { voltage: 3 }              // 电源电压 V
    case 'bulb': return { resistance: 10, ratedV: 2.5 } // 灯丝电阻 / 额定电压
    case 'resistor': return { resistance: 10 }          // 定值电阻 Ω
    case 'rheostat': return { resistance: 20 }          // 接入阻值 Ω（0~50）
    case 'ammeter': return { range: 0.6 }               // 量程 0~0.6A
    case 'voltmeter': return { range: 3 }               // 量程 0~3V
    default: return {}
  }
}

/**
 * OhmsLawScene — 探究电流与电压、电阻的关系（欧姆定律）
 *
 * Tab1: 演示 — 控制变量法
 *   Step1: R不变，改变U → 测I → 绘I-U图 → 正比
 *   Step2: U不变，改变R → 测I → 绘I-R图 → 反比
 * Tab2: 自己动手搭电路
 */
export default function OhmsLawScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,
    switchClosed: false,
    R: 10,            // 定值电阻 Ω
    R_slider: 10,     // 滑块显示用
    U: 3,             // 电压 V
    U_slider: 3,
    sliderR: 20,      // 滑动变阻器接入电阻
    time: 0,
    // PhET 式显示控制：读数贴元件、数值平滑过渡
    smooth: true,               // 「平滑」开关：显示值缓动趋近真实值
    dispI: 0, dispU: 0,         // 平滑后的显示值（记录仍用真实值）
    show: { U: true, I: true, flow: true },
    dropTarget: null,          // 电表拖放落点（串入/并联预览）
    dragProbe: null,           // 正在拖的表笔 {id, key}
    dataIU: [],       // Step1 数据 [{U, I}]
    dataIR: [],       // Step2 数据 [{R, I}]
    // Tab2
    components: [],
    wires: [],
    dragId: null,
    dragOffX: 0, dragOffY: 0,
    connecting: null,
    hoverTerm: null,
    nextId: 1,
    wireColor: '#F44336',
    // ── 渲染/交互新增状态 ──
    dt: 1 / 60,              // 真实帧间隔（指针阻尼、粒子推进都要用）
    _lastT: 0,
    _rev: 0,                 // 拓扑+参数版本号：变了才重新求解（省掉每帧建图）
    _cache: null,            // {rev, result} 求解缓存
    _flow: new Map(),        // 导线 id → 粒子相位（0..1）
    flowMode: 'I',           // 'I' = 电流方向, 'e' = 电子方向
    showFlow: true,          // 是否显示电流粒子
    hoverComp: null,         // 悬停元件 id（做描边高亮）
    editingId: null,         // 参数面板正在编辑的元件 id
  })

  const [tab, setTab] = useState(1)
  const [, setStep] = useState(1)
  const [, forceUpdate] = useState(0)
  const [conclusionOpen, setConclusionOpen] = useState(false)
  // 参数面板：正在编辑的元件 id + 锚点（画布坐标，面板贴着元件弹出）
  const [editingId, setEditingId] = useState(null)
  const [anchor, setAnchor] = useState({ x: 0, y: 0 })
  // 右键菜单（拆开看内部 / 复制 / 删除）与「拆开看内部结构」浮层
  const [ctxMenu, setCtxMenu] = useState(null)
  const [internal, setInternal] = useState(null)
  // 轻量提示（保存/载入/导出的反馈）
  const [toast, setToast] = useState(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const R = { canvas, ctx: canvas.getContext('2d'), W: 0, H: 0,
      resize() {
        const rect = { width: canvas.clientWidth, height: canvas.clientHeight }
        canvas.width = rect.width * devicePixelRatio
        canvas.height = rect.height * devicePixelRatio
        this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
        this.W = rect.width; this.H = rect.height
      },
    }
    R.resize(); canvasRef.current._R = R
    canvasRef.current._S = S   // 供 QA 脚本读取元件/表笔坐标
    // 主循环：用真实时间步长驱动（指针阻尼/粒子速度才稳定）
    const loop = (ts) => {
      const now = ts || 0
      const s = S.current
      const dt = s._lastT ? Math.min(0.05, Math.max(0, (now - s._lastT) / 1000)) : 1 / 60
      s._lastT = now
      // 仿真暂停：时间与指针冻结，画面仍重绘（可继续搭电路）
      s.dt = s.paused ? 0 : dt
      if (!s.paused) s.time += dt
      render(R)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function render(R) {
    const ctx = R.ctx, W = R.W, H = R.H
    ctx.clearRect(0, 0, W, H)
    if (S.current.tab === 1) {
      // 演示页：浅色工作区（教学讲解用，保持原有的清爽阅读感）
      ctx.fillStyle = '#f0f4f8'; ctx.fillRect(0, 0, W, H)
    } else {
      // 自己动手页：深色实验桌面（写实器材 + 环境光 + 暗角）
      drawBench(ctx, W, H, { time: S.current.time })
    }
    canvasRef.current._clickAreas = []
    canvasRef.current._palAreas = []
    if (S.current.tab === 1) renderDemo(ctx, W, H)
    else renderBuilder(ctx, W, H)
  }

  // ================================================================
  //  Tab 1：控制变量法演示
  // ================================================================
  function renderDemo(ctx, W, H) {
    const s = S.current
    const on = s.switchClosed
    const lay = fitLayout(W, H)
    const circuitLeft = lay.circuit.L, circuitRight = lay.circuit.R
    const circuitTop = lay.circuit.T, circuitBottom = lay.circuit.B

    // 计算电路（断开时 U_R=0）
    // Step2 的前提是「U 不变」：滑动变阻器锁 0Ω，使 R 两端电压恒等于电源电压
    if (s.step === 2) s.sliderR = 0
    let I = 0, U_R = 0
    if (on) {
      const Rtotal = s.R + s.sliderR
      I = s.U / Rtotal
      U_R = I * s.R
    }
    // 读数量化：按所选量程估读，显示与「记录」写入同一套值（学生真正读到的数）
    const rangeA = meterRange('A', s.U / Math.max(s.R, 1))
    const rangeV = meterRange('V', s.U)
    const I_read = on ? quantizeReading(I, readResolution('A', rangeA)) : 0
    const U_read = on ? quantizeReading(U_R, readResolution('V', rangeV)) : 0

    // 平滑显示：指针/数值缓动趋近读数
    const tI = I_read
    const tU = U_read
    if (s.smooth) {
      s.dispI += (tI - s.dispI) * 0.16
      s.dispU += (tU - s.dispU) * 0.16
      if (Math.abs(s.dispI - tI) < 1e-5) s.dispI = tI
      if (Math.abs(s.dispU - tU) < 1e-5) s.dispU = tU
    } else {
      s.dispI = tI; s.dispU = tU
    }

    // 浅色工作区：电路独立成一块面板，右边界让开数据面板
    const cardX = Math.max(6, circuitLeft - 24)
    const cardY = Math.max(2, circuitTop - 46)
    const cardR = Math.min(circuitRight + 24, lay.readout.x - 6)
    drawWorkspace(ctx, { x: cardX, y: cardY, w: cardR - cardX, h: circuitBottom - cardY })

    // 电路图（下边留出 40px：电池/开关标注不贴工作区边、不压步骤条）
    const wireBottom = circuitBottom - 40
    drawCircuit(ctx, circuitLeft, circuitRight, circuitTop, wireBottom, on, s, s.dispI, s.dispU)

    // 右侧：数据+图像（fitLayout）
    drawRightPanel(ctx, W, H, s, on, I_read, U_read, lay)

    // 底部步骤导航
    drawStepNav(ctx, W, H, s, lay)
  }

  /**
   * Tab1 电路图 —— 标准电路符号（「电路图」画法，教科书式），在区域内居中、适度缩小。
   * 物理与交互都不变：电源→开关→A表→滑变→定值电阻 串联回路，V 表并在定值电阻两端。
   */
  function drawCircuit(ctx, left, right, top, bottom, on, s, dispI, dispU) {
    const qA = readResolution('A', meterRange('A', s.U / Math.max(s.R, 1)))
    const qV = readResolution('V', meterRange('V', s.U))
    const wc = on ? '#1565C0' : '#9aa7b1'
    const ink = on ? SYM_INK : '#7c8a93'

    // ── 构图：主回路横构图 + 电压表门形，在给定区域内居中、适度缩小 ──
    const areaW = right - left, areaH = bottom - top
    const W = Math.min(areaW * 0.76, 520)   // 主回路宽（左右导线间距）
    const scale = Math.max(0.55, Math.min(1.1, W / 480))
    const H = W * 0.40                      // 主回路高（上下导线间距）
    const gateD = H * 0.58                  // 电压表门形深度
    const chipUp = 42 * scale               // 上排读数芯片伸出主回路的高度
    const chipDn = 38 * scale               // 下排读数芯片伸出主回路的高度
    const x0 = left + (areaW - W) / 2
    // 垂直居中按"含读数芯片"的整体高度算，视觉重心才落在正中
    const y0 = top + Math.max(chipUp + 4, (areaH - (H + chipUp + chipDn)) / 2) + chipUp
    const x1 = x0 + W, y1 = y0 + H

    // 三列布局：左=电源/A表，中=开关/滑变，右=定值电阻+V表门形
    const colL = x0 + W * 0.15, colM = x0 + W * 0.50, colR = x0 + W * 0.82
    const battX = colL, swX = colM
    const amX = colL, rheoX = colM, resX = colR

    // 符号在导线上占用的半宽（导线据此断开留缺口）
    const hBat = symHalf('battery', scale, 2)
    const hSw = symHalf('switch', scale)
    const hAm = symHalf('meter', scale)
    const hRheo = symHalf('rheostat', scale)
    const hRes = symHalf('resistor', scale)
    const hVol = hAm
    const lw = 2 * scale + 0.6

    // ── 导线（横平竖直）──
    // 下边：电源 + 开关
    drawLine(ctx, x0, y1, battX - hBat, y1, wc, lw)
    drawLine(ctx, battX + hBat, y1, swX - hSw, y1, wc, lw)
    drawLine(ctx, swX + hSw, y1, x1, y1, wc, lw)
    // 上边：A表 + 滑动变阻器 + 定值电阻
    drawLine(ctx, x0, y0, amX - hAm, y0, wc, lw)
    drawLine(ctx, amX + hAm, y0, rheoX - hRheo, y0, wc, lw)
    drawLine(ctx, rheoX + hRheo, y0, resX - hRes, y0, wc, lw)
    drawLine(ctx, resX + hRes, y0, x1, y0, wc, lw)
    // 左右两边
    drawLine(ctx, x0, y0, x0, y1, wc, lw)
    drawLine(ctx, x1, y0, x1, y1, wc, lw)

    // 电压表门形：从定值电阻两侧引下，接 V 表
    const volY = y0 + gateD
    const tap = hRes + 12 * scale
    drawLine(ctx, resX - tap, y0, resX - tap, volY, wc, lw)
    drawLine(ctx, resX + tap, y0, resX + tap, volY, wc, lw)
    drawLine(ctx, resX - tap, volY, resX - hVol, volY, wc, lw)
    drawLine(ctx, resX + hVol, volY, resX + tap, volY, wc, lw)
    drawJoint(ctx, resX - tap, y0, wc)
    drawJoint(ctx, resX + tap, y0, wc)

    // ── 电流流动（先画，后压符号：粒子从元件下方"流过"）──
    if (on && s.show.flow) {
      drawCurrentFlow(ctx, [
        { x: battX + hBat, y: y1 }, { x: swX, y: y1 }, { x: x1, y: y1 },
        { x: x1, y: y0 }, { x: resX, y: y0 }, { x: rheoX, y: y0 },
        { x: amX, y: y0 }, { x: x0, y: y0 }, { x: x0, y: y1 }, { x: battX - hBat, y: y1 },
      ], s.time, 0.5)
    }

    // ── 电路符号 ──
    symBattery(ctx, battX, y1, { n: 2, scale, ink })
    symSwitch(ctx, swX, y1, { closed: on, scale, ink })
    symMeter(ctx, amX, y0, { kind: 'A', scale, ink })
    symRheostat(ctx, rheoX, y0, { scale, ink, ratio: s.sliderR / 50 })
    symResistor(ctx, resX, y0, { scale, ink })
    symMeter(ctx, resX, volY, { kind: 'V', scale, ink })

    // ── 读数/设置值芯片：测量值在各自表旁，设置值在元件正上方/正下方 ──
    const chipY = y0 - 32 * scale
    const chipY2 = y1 + 28 * scale
    drawReadoutChip(ctx, battX, chipY2, `U源 ${s.U.toFixed(1)}V`, '#2E7D32', { font: Math.max(9, 11 * scale) })
    drawReadoutChip(ctx, rheoX, chipY, `R滑 ${s.sliderR}Ω`, '#546E7A', { font: Math.max(9, 11 * scale) })
    if (s.show.I) drawReadoutChip(ctx, amX, chipY, `I ${fmtRead(dispI, qA)}A`, '#C62828', { font: Math.max(9, 11 * scale) })

    // Step1：点滑动变阻器（含其读数芯片）调节接入阻值
    if (s.step === 1) {
      canvasRef.current._clickAreas.push({
        x: rheoX - hRheo - 10, y: chipY - 12, w: (hRheo + 10) * 2, h: 56,
        onClick: (mx) => {
          const r = Math.max(0, Math.min(1, (mx - (rheoX - hRheo)) / (hRheo * 2)))
          S.current.sliderR = Math.round(r * 50)
        }
      })
    }
    // Step2：R 读数芯片自带 − / + 步进
    if (s.step === 2) {
      const rChip = drawReadoutChip(ctx, resX, chipY, `R ${s.R}Ω`, '#E65100', { font: Math.max(9, 11 * scale) })
      for (const [dx, dv] of [[-1, -5], [1, 5]]) {
        const bx = dx < 0 ? rChip.x - 22 : rChip.x + rChip.w + 2
        ctx.fillStyle = '#FF9800'; ctx.strokeStyle = '#E65100'; ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.arc(bx + 9, chipY, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
        ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(dv > 0 ? '+' : '−', bx + 9, chipY + 0.5)
        canvasRef.current._clickAreas.push({
          x: bx - 2, y: chipY - 11, w: 22, h: 22,
          onClick: () => {
            const v = Math.max(5, Math.min(30, S.current.R + dv))
            S.current.R = v; S.current.R_slider = v
            forceUpdate(n => n + 1)
          }
        })
      }
    } else {
      drawReadoutChip(ctx, resX, chipY, `R ${s.R}Ω`, '#E65100', { font: Math.max(9, 11 * scale) })
    }
    if (s.show.U) drawReadoutChip(ctx, resX, volY + 28 * scale, `U ${fmtRead(dispU, qV)}V`, '#2E7D32', { font: Math.max(9, 11 * scale) })

    // 开关：整块可点（通断）
    canvasRef.current._clickAreas.push({
      x: swX - hSw - 10, y: y1 - 22, w: (hSw + 10) * 2, h: 44,
      onClick: () => { S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1) }
    })
  }

  /** 导线接点（并联引出处的焊点） */
  function drawJoint(ctx, x, y, color) {
    ctx.fillStyle = color
    ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill()
  }

  // 「显示」勾选行 → 画布点击区
  function pushToggleAreas(rects) {
    for (const r of rects) {
      canvasRef.current._clickAreas.push({
        x: r.x, y: r.y, w: r.w, h: r.h,
        onClick: () => { S.current.show[r.key] = !S.current.show[r.key] },
      })
    }
  }

  // ─── 右侧：数据表格+图像 ───
  function drawRightPanel(ctx, W, H, s, on, I, U_R, layIn) {
    s = S.current
    const lay = layIn || fitLayout(W, H)
    const ro = lay.readout
    const qA = readResolution('A', meterRange('A', s.U / Math.max(s.R, 1)))
    const qV = readResolution('V', meterRange('V', s.U))
    const inner = drawPanel(ctx, ro, lay.compact ? null : '📖 实验数据')
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    let ky = inner.y
    let px = inner.x
    let pw = inner.w

    // 手机：紧凑读数
    if (lay.compact) {
      const Ub = on ? U_R : 0
      const Ib = on ? I : 0
      ctx.font = `bold ${lay.font.data}px monospace`
      ctx.fillStyle = '#333'
      ctx.fillText(`U = ${fmtRead(Ub, qV)} V`, px, ky); ky += 18
      ctx.fillText(`I = ${fmtRead(Ib, qA)} A`, px, ky); ky += 18
      ctx.fillStyle = '#FF6F00'
      ctx.fillText(`R = ${s.R} Ω`, px, ky); ky += 18
      ctx.fillStyle = '#888'
      ctx.font = `${lay.font.body}px sans-serif`
      ctx.fillText(`R滑 ${s.sliderR}Ω`, px, ky); ky += 16
      ctx.fillStyle = on ? '#2E7D32' : '#888'
      ctx.font = `bold ${lay.font.body}px sans-serif`
      ctx.fillText(on ? '● 闭合' : '○ 断开 U=0', px, ky); ky += 20
      // 「显示」勾选：手机端面板够宽才画
      if (ro.w >= 150) {
        const rects = drawToggleRow(ctx, px, ky, [
          { key: 'U', label: 'U值' }, { key: 'I', label: 'I值' }, { key: 'flow', label: '流动' },
        ], s.show, { font: 10, maxW: ro.w })
        pushToggleAreas(rects)
      }
      ctx.textBaseline = 'alphabetic'
      return
    }

    // 以下沿用 px+14 对齐
    px = inner.x - 14
    pw = inner.w + 28

    // 「显示」勾选行（PhET 右侧控制栏：勾选才把读数画到电路上）
    ctx.fillStyle = '#1a5a8a'; ctx.font = 'bold 12px sans-serif'
    ctx.fillText('显示', px, ky + 5)
    const tRects = drawToggleRow(ctx, px + 42, ky, [
      { key: 'U', label: '电压值' },
      { key: 'I', label: '电流值' },
      { key: 'flow', label: '电流流动' },
    ], s.show, { font: 11, maxW: pw - 42 })
    pushToggleAreas(tRects)
    ky = tRects.reduce((m, r) => Math.max(m, r.y + r.h), 0) + 12

    // 实验目的（单行收窄）
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 12px sans-serif'
    ctx.fillText('🎯 实验目的：', px, ky)
    ctx.font = '11px sans-serif'; ctx.fillStyle = '#444'
    const aim = s.step === 1
      ? '保持 R 不变，改变 U，研究 I 与 U 关系'
      : '保持 U 不变，改变 R，研究 I 与 R 关系'
    ctx.fillText(aim, px + 80, ky); ky += 24

    if (s.step === 1) {
      ctx.fillText('📖 探究 I 与 U 的关系（R不变）', px + 14, ky); ky += 26
      ctx.font = '12px sans-serif'; ctx.fillStyle = '#555'
      ctx.fillText(`R = ${s.R} Ω（不变）   U_R = ${fmtRead(U_R, qV)} V   I = ${fmtRead(I, qA)} A`, px + 14, ky); ky += 24

      // 数据表格（带边框）
      if (dataIUStore.length > 0) {
        ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'
        ctx.fillText('📊 实验数据', px + 14, ky)
        // 导出 CSV
        const csvX = px + 88
        ctx.fillStyle = '#E3F2FD'
        ctx.beginPath(); ctx.roundRect(csvX, ky - 2, 56, 15, 4); ctx.fill()
        ctx.strokeStyle = '#90CAF9'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.roundRect(csvX, ky - 2, 56, 15, 4); ctx.stroke()
        ctx.fillStyle = '#1565C0'; ctx.font = '9px sans-serif'
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText('导出CSV', csvX + 28, ky + 5.5)
        canvasRef.current._clickAreas.push({ x: csvX, y: ky - 2, w: 56, h: 15, onClick: () => exportCSV(1) })
        ctx.textAlign = 'left'; ctx.textBaseline = 'top'
        ky += 17
        const colW = [35, 60, 60, 75]
        const rowH = 16
        const tblW = colW.reduce((a, b) => a + b, 0)
        const tblX = px + 14
        // 只显示最近 8 组，数据多了也不撑破右侧面板
        const MAX_ROWS = 8
        const start = Math.max(0, dataIUStore.length - MAX_ROWS)
        const rows = dataIUStore.length - start
        // 表头
        const headers = ['序号', 'U(V)', 'I(A)', 'R=U/I(Ω)']
        ctx.fillStyle = '#E3F2FD'; ctx.strokeStyle = '#90CAF9'; ctx.lineWidth = 1
        ctx.fillRect(tblX, ky, tblW, rowH)
        ctx.strokeRect(tblX, ky, tblW, rowH)
        ctx.fillStyle = '#1565C0'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        let cx2 = tblX
        for (let c = 0; c < 4; c++) { ctx.fillText(headers[c], cx2 + colW[c]/2, ky + rowH/2); cx2 += colW[c] }
        ky += rowH
        // 数据行
        ctx.font = '10px monospace'; ctx.fillStyle = '#333'
        for (let i = 0; i < rows; i++) {
          const d = dataIUStore[start + i]
          const R_calc = d.I > 0 ? (d.U / d.I) : 0
          if (i % 2 === 0) { ctx.fillStyle = '#F5F5F5'; ctx.fillRect(tblX, ky, tblW, rowH) }
          ctx.strokeStyle = '#E0E0E0'; ctx.strokeRect(tblX, ky, tblW, rowH)
          ctx.fillStyle = '#333'
          const vals = [String(start + i + 1), d.U.toFixed(2), d.I.toFixed(2), R_calc.toFixed(1)]
          let cx3 = tblX
          for (let c = 0; c < 4; c++) { ctx.fillText(vals[c], cx3 + colW[c]/2, ky + rowH/2); cx3 += colW[c] }
          ky += rowH
        }
        ctx.textAlign = 'left'; ctx.textBaseline = 'top'
        if (start > 0) {
          ctx.fillStyle = '#888'; ctx.font = '9px sans-serif'
          ctx.fillText(`…共 ${dataIUStore.length} 组，仅显示最近 ${rows} 组`, tblX, ky); ky += 13
        }
        // 平均值 + 相对误差（多次测量 → 平均 → 与标称值比对）
        const an = analyzeIU(dataIUStore, s.R)
        ctx.fillStyle = '#1B5E20'; ctx.font = 'bold 10px sans-serif'
        ctx.fillText(`R 平均 = ${an.avgR.toFixed(2)} Ω    相对误差 = ${an.err >= 0 ? '+' : ''}${an.err.toFixed(1)}%`, tblX, ky); ky += 16
        // I-U 图 + 最小二乘拟合
        drawGraph(ctx, px + 14, ky, pw - 28, 118, dataIUStore, 'U (V)', 'I (A)', d => d.U, d => d.I, '#4A90D9', an.fit)
        ky += 122
        if (an.fit) {
          ctx.fillStyle = '#4A90D9'; ctx.font = '9px monospace'
          const inv = an.fit.k > 1e-9 ? (1 / an.fit.k).toFixed(2) : '∞'
          ctx.fillText(`拟合 I=${an.fit.k.toFixed(3)}·U${an.fit.b >= 0 ? '+' : '−'}${Math.abs(an.fit.b).toFixed(3)}  →  1/k = ${inv} Ω`, px + 14, ky)
        }
      } else {
        ctx.fillStyle = '#888'; ctx.font = '11px sans-serif'
        ctx.fillText('闭合开关 → 调节U → 点"记录"采集数据', px + 14, ky); ky += 18
        ctx.fillText('至少采集3组数据', px + 14, ky)
      }
    } else {
      ctx.fillText('📖 探究 I 与 R 的关系（U不变）', px + 14, ky); ky += 26
      ctx.font = '12px sans-serif'; ctx.fillStyle = '#555'
      ctx.fillText(`U = ${s.U.toFixed(1)} V（不变）   R = ${s.R} Ω   I = ${fmtRead(I, qA)} A`, px + 14, ky); ky += 24

      if (dataIRStore.length > 0) {
        ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'
        ctx.fillText('📊 实验数据', px + 14, ky)
        const csvX = px + 88
        ctx.fillStyle = '#FFF3E0'
        ctx.beginPath(); ctx.roundRect(csvX, ky - 2, 56, 15, 4); ctx.fill()
        ctx.strokeStyle = '#FFCC80'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.roundRect(csvX, ky - 2, 56, 15, 4); ctx.stroke()
        ctx.fillStyle = '#E65100'; ctx.font = '9px sans-serif'
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText('导出CSV', csvX + 28, ky + 5.5)
        canvasRef.current._clickAreas.push({ x: csvX, y: ky - 2, w: 56, h: 15, onClick: () => exportCSV(2) })
        ctx.textAlign = 'left'; ctx.textBaseline = 'top'
        ky += 17
        const colW = [35, 60, 60, 75]
        const rowH = 16
        const tblW = colW.reduce((a, b) => a + b, 0)
        const tblX = px + 14
        const MAX_ROWS = 8
        const start = Math.max(0, dataIRStore.length - MAX_ROWS)
        const rows = dataIRStore.length - start
        const headers = ['序号', 'R(Ω)', 'I(A)', '1/R(1/Ω)']
        ctx.fillStyle = '#FFF3E0'; ctx.strokeStyle = '#FFCC80'; ctx.lineWidth = 1
        ctx.fillRect(tblX, ky, tblW, rowH); ctx.strokeRect(tblX, ky, tblW, rowH)
        ctx.fillStyle = '#E65100'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        let cx2 = tblX
        for (let c = 0; c < 4; c++) { ctx.fillText(headers[c], cx2 + colW[c]/2, ky + rowH/2); cx2 += colW[c] }
        ky += rowH
        ctx.font = '10px monospace'; ctx.fillStyle = '#333'
        for (let i = 0; i < rows; i++) {
          const d = dataIRStore[start + i]
          if (i % 2 === 0) { ctx.fillStyle = '#F5F5F5'; ctx.fillRect(tblX, ky, tblW, rowH) }
          ctx.strokeStyle = '#E0E0E0'; ctx.strokeRect(tblX, ky, tblW, rowH)
          ctx.fillStyle = '#333'
          const vals = [String(start + i + 1), d.R.toFixed(0), d.I.toFixed(2), (1/d.R).toFixed(4)]
          let cx3 = tblX
          for (let c = 0; c < 4; c++) { ctx.fillText(vals[c], cx3 + colW[c]/2, ky + rowH/2); cx3 += colW[c] }
          ky += rowH
        }
        ctx.textAlign = 'left'; ctx.textBaseline = 'top'
        if (start > 0) {
          ctx.fillStyle = '#888'; ctx.font = '9px sans-serif'
          ctx.fillText(`…共 ${dataIRStore.length} 组，仅显示最近 ${rows} 组`, tblX, ky); ky += 13
        }
        // I·R 反推电压的平均值与相对误差（U 应保持不变）
        const an = analyzeIR(dataIRStore, s.U)
        ctx.fillStyle = '#B23C00'; ctx.font = 'bold 10px sans-serif'
        ctx.fillText(`U 平均 = ${an.avgU.toFixed(2)} V    相对误差 = ${an.err >= 0 ? '+' : ''}${an.err.toFixed(1)}%`, tblX, ky); ky += 16
        drawGraph(ctx, px + 14, ky, pw - 28, 118, dataIRStore, '1/R (1/Ω)', 'I (A)', d => 1/d.R, d => d.I, '#E53935', an.fit)
        ky += 122
        if (an.fit) {
          ctx.fillStyle = '#E53935'; ctx.font = '9px monospace'
          ctx.fillText(`拟合 I=${an.fit.k.toFixed(3)}·(1/R)${an.fit.b >= 0 ? '+' : '−'}${Math.abs(an.fit.b).toFixed(3)}  →  k = ${an.fit.k.toFixed(2)} V ≈ U`, px + 14, ky)
        }
      } else {
        ctx.fillStyle = '#888'; ctx.font = '11px sans-serif'
        ctx.fillText('闭合开关 → 调节R → 点"记录"采集数据', px + 14, ky); ky += 18
        ctx.fillText('至少采集3组不同R的数据', px + 14, ky)
      }
    }
    ctx.textBaseline = 'alphabetic'
  }

  // I-U / I-R 图（可叠加最小二乘拟合直线）
  function drawGraph(ctx, x, y, w, h, data, xLabel, yLabel, getX, getY, color, fit) {
    ctx.fillStyle = '#f8f9fa'; ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h)

    if (data.length < 2) return

    const valsX = data.map(getX), valsY = data.map(getY)
    const maxX = Math.max(...valsX) * 1.15 || 1
    const maxY = Math.max(...valsY) * 1.15 || 1

    // 坐标轴
    const ox = x + 30, oy = y + h - 20, gw = w - 40, gh = h - 30
    ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(ox, oy - gh); ctx.lineTo(ox, oy); ctx.lineTo(ox + gw, oy); ctx.stroke()

    // 刻度
    ctx.fillStyle = '#888'; ctx.font = '8px monospace'
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(xLabel, ox + gw / 2, oy + 4)
    ctx.save(); ctx.translate(x + 8, oy - gh / 2); ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(yLabel, 0, 0); ctx.restore()

    // 拟合直线（虚线）：从数据 x 范围两端延伸
    if (fit) {
      const x0 = Math.min(...valsX), x1 = Math.max(...valsX)
      const y0 = fit.k * x0 + fit.b, y1 = fit.k * x1 + fit.b
      const mapX = (v) => ox + (v / maxX) * gw
      const mapY = (v) => oy - (v / maxY) * gh
      ctx.save()
      ctx.strokeStyle = color; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.6
      ctx.setLineDash([5, 4])
      ctx.beginPath(); ctx.moveTo(mapX(x0), mapY(y0)); ctx.lineTo(mapX(x1), mapY(y1)); ctx.stroke()
      ctx.restore()
      // 拟合参数角标
      ctx.fillStyle = color; ctx.font = 'bold 9px monospace'
      ctx.textAlign = 'right'; ctx.textBaseline = 'top'
      ctx.fillText(`k=${fit.k.toFixed(3)}  R²=${fit.r2.toFixed(3)}`, x + w - 5, y + 4)
    }

    // 数据点+连线
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath()
    for (let i = 0; i < data.length; i++) {
      const px = ox + (getX(data[i]) / maxX) * gw
      const py = oy - (getY(data[i]) / maxY) * gh
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.stroke()
    ctx.fillStyle = color
    for (let i = 0; i < data.length; i++) {
      const px = ox + (getX(data[i]) / maxX) * gw
      const py = oy - (getY(data[i]) / maxY) * gh
      ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2); ctx.fill()
    }
  }

  // ─── 步骤导航 ───
  function drawStepNav(ctx, W, H, s, layIn) {
    const lay = layIn || fitLayout(W, H)
    const steps = [
      { n: 1, label: '① R不变 → I∝U', short: '①' },
      { n: 2, label: '② U不变 → I∝1/R', short: '②' },
    ]
    // 记录：写入按仪表估读分辨率量化后的读数（学生实际记到本子上的值）
    const doRecord = () => {
      const sc = S.current
      if (!sc.switchClosed) return
      const sliderR = sc.step === 2 ? 0 : sc.sliderR // Step2 保持 U 不变：滑变锁 0Ω
      const I_true = sc.U / (sc.R + sliderR)
      const U_true = I_true * sc.R
      const rangeA = meterRange('A', sc.U / Math.max(sc.R, 1))
      const rangeV = meterRange('V', sc.U)
      const I_val = quantizeReading(I_true, readResolution('A', rangeA))
      const U_val = quantizeReading(U_true, readResolution('V', rangeV))
      if (sc.step === 1) {
        // R_nom 是记录时的标称电阻，误差分析用它而不是"当前"R（防止中途改 R 污染历史数据）
        dataIUStore.push({ U: U_val, I: I_val, R_nom: sc.R })
      } else {
        dataIRStore.push({ R: sc.R, I: I_val, U_nom: sc.U })
      }
      forceUpdate(n => n + 1)
    }
    const doClear = () => {
      if (s.step === 1) dataIUStore = []; else dataIRStore = []
      forceUpdate(n => n + 1)
    }
    if (lay.compact) {
      // 底部空带横排：原右上位置会被 InfoDock 气泡盖住，点不到
      const bw = 36, bh = 28
      const y = H - bh - 6
      let x = 10
      steps.forEach((st) => {
        const active = s.step === st.n
        ctx.fillStyle = active ? '#FF9800' : '#ffffffee'
        ctx.beginPath(); ctx.roundRect(x, y, bw, bh, 6); ctx.fill()
        ctx.strokeStyle = active ? '#E65100' : '#d0d7de'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.roundRect(x, y, bw, bh, 6); ctx.stroke()
        ctx.fillStyle = active ? '#fff' : '#555'
        ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(st.short, x + bw / 2, y + bh / 2)
        canvasRef.current._clickAreas.push({ x, y, w: bw, h: bh, onClick: () => {
          S.current.step = st.n; S.current.switchClosed = false; S.current.sliderR = 0; setStep(st.n); forceUpdate(n => n + 1)
        }})
        x += bw + 6
      })
      // 记录 / 清除：手机端也要能采数据
      const recX = x + 6
      ctx.fillStyle = '#4CAF50'
      ctx.beginPath(); ctx.roundRect(recX, y, 52, bh, 6); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'
      ctx.fillText('记录', recX + 26, y + bh / 2)
      canvasRef.current._clickAreas.push({ x: recX, y, w: 52, h: bh, onClick: doRecord })
      const clrX = recX + 58
      ctx.fillStyle = '#ffffffee'
      ctx.beginPath(); ctx.roundRect(clrX, y, 44, bh, 6); ctx.fill()
      ctx.strokeStyle = '#d0d7de'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.roundRect(clrX, y, 44, bh, 6); ctx.stroke()
      ctx.fillStyle = '#555'
      ctx.fillText('清除', clrX + 22, y + bh / 2)
      canvasRef.current._clickAreas.push({ x: clrX, y, w: 44, h: bh, onClick: doClear })
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
      return
    }
    const navY = H - 36
    ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    const totalW = 280, startX = (W * 0.52 - totalW) / 2
    steps.forEach((st, i) => {
      const bx = startX + i * 145
      const active = s.step === st.n
      ctx.fillStyle = active ? '#FF9800' : '#e0e0e0'
      ctx.beginPath(); ctx.roundRect(bx, navY, 135, 28, 6); ctx.fill()
      ctx.fillStyle = active ? '#fff' : '#666'
      ctx.font = active ? 'bold 11px sans-serif' : '11px sans-serif'
      ctx.fillText(st.label, bx + 67, navY + 14)
      canvasRef.current._clickAreas.push({ x: bx, y: navY, w: 135, h: 28, onClick: () => {
        S.current.step = st.n; S.current.switchClosed = false; S.current.sliderR = 0; setStep(st.n); forceUpdate(n => n + 1)
      }})
    })

    // 记录按钮
    const recX = startX + 300
    ctx.fillStyle = '#4CAF50'
    ctx.beginPath(); ctx.roundRect(recX, navY, 80, 28, 6); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('📝 记录', recX + 40, navY + 14)
    canvasRef.current._clickAreas.push({ x: recX, y: navY, w: 80, h: 28, onClick: doRecord })

    // 清除按钮
    const clrX = recX + 90
    ctx.fillStyle = '#f0f0f0'
    ctx.beginPath(); ctx.roundRect(clrX, navY, 60, 28, 6); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(clrX, navY, 60, 28, 6); ctx.stroke()
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'
    ctx.fillText('清除', clrX + 30, navY + 14)
    canvasRef.current._clickAreas.push({ x: clrX, y: navY, w: 60, h: 28, onClick: doClear })

    ctx.textBaseline = 'alphabetic'
  }

  function drawLine(ctx, x1, y1, x2, y2, color, w) {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
  }

  function drawCurrentFlow(ctx, points, time, speed) {
    let totalLen = 0; const segs = []
    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1].x - points[i].x, dy = points[i + 1].y - points[i].y
      const len = Math.sqrt(dx * dx + dy * dy)
      segs.push({ ...points[i], ex: points[i + 1].x, ey: points[i + 1].y, len }); totalLen += len
    }
    ctx.fillStyle = '#FFEB3B'
    const n = Math.max(5, Math.floor(totalLen / 45))
    for (let d = 0; d < n; d++) {
      let pos = ((time * speed * 100 + d * (totalLen / n)) % totalLen)
      for (const seg of segs) {
        if (pos <= seg.len) {
          const r = pos / seg.len
          ctx.beginPath(); ctx.arc(seg.x + (seg.ex - seg.x) * r, seg.y + (seg.ey - seg.y) * r, 3, 0, Math.PI * 2); ctx.fill()
          break
        }
        pos -= seg.len
      }
    }
  }

  // ================================================================
  //  Tab 2：自己动手（复用 SimpleCircuit 模板）
  // ================================================================
  /** 电表拖放预览：电流档→导线串入位，电压档→元件并联框（绿=可接入，红=原因） */
  function drawDropPreview(ctx, s) {
    const dt = s.dropTarget
    if (!dt || !s.dragId) return
    const dc = s.components.find(k => k.id === s.dragId)
    const isMulti = dc && dc.type === 'multimeter'
    const name = isMulti
      ? ((dc.props && dc.props.mode === 'A') ? '万用表·电流档' : '万用表·电压档')
      : (dt.kind === 'wire' ? '电流表' : '电压表')
    const color = dt.ok ? '#2E7D32' : '#F44336'
    ctx.save()
    if (dt.kind === 'wire') {
      const w = s.wires.find(o => o.id === dt.wireId)
      const fc = w && s.components.find(c => c.id === w.from.compId)
      const tc = w && s.components.find(c => c.id === w.to.compId)
      if (w && fc && tc) {
        const a = getTermPos(fc, w.from.termIdx), b = getTermPos(tc, w.to.termIdx)
        ctx.globalAlpha = 0.45; ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
        ctx.globalAlpha = 1; ctx.lineCap = 'butt'
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
        if (dt.ok) {
          ctx.save()
          ctx.translate(mx, my); ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x))
          ctx.setLineDash([6, 5]); ctx.strokeStyle = color; ctx.lineWidth = 1.8
          ctx.strokeRect(-40, -31, 80, 62)
          ctx.restore()
          ctx.setLineDash([])
        }
        ctx.fillStyle = color; ctx.font = 'bold 11px sans-serif'
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
        ctx.fillText(dt.ok ? `松手：${name}串入` : dt.why, mx, my - 42)
      }
    } else if (dt.kind === 'comp') {
      const t = s.components.find(c => c.id === dt.compId)
      if (t) {
        ctx.setLineDash([6, 5]); ctx.strokeStyle = color; ctx.lineWidth = 1.8
        ctx.strokeRect(t.x - 46, t.y - 38, 92, 76)
        ctx.setLineDash([])
        ctx.fillStyle = color; ctx.font = 'bold 11px sans-serif'
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
        ctx.fillText(dt.ok ? `松手：${name}并联到此` : dt.why, t.x, t.y - 44)
      }
    }
    ctx.restore()
  }

  /** 万用表表笔：插孔→笔尖的线 + 笔尖 + 测点吸附圈 + 档位提示 */
  function drawProbes(ctx, comp, s) {
    const probes = comp.props && comp.props.probes
    if (!probes) return
    const mode = comp.props.mode || 'V'
    const cos = Math.cos(comp.rotation || 0), sin = Math.sin(comp.rotation || 0)
    const dragging = s.dragProbe && s.dragProbe.id === comp.id ? s.dragProbe.key : null

    for (const key of ['R', 'B']) {
      const p = probes[key]
      const j = MULTIMETER_JACK[key]
      const jx = comp.x + j.x * cos - j.y * sin
      const jy = comp.y + j.x * sin + j.y * cos
      // 吸附到接线柱时笔尖钉在测点上
      if (p.snap && p.snap.kind === 'port') {
        const t = s.components.find(c => c.id === p.snap.compId)
        if (t) { const tp = getTermPos(t, p.snap.port); p.x = tp.x; p.y = tp.y }
      }
      const col = key === 'R' ? '#e85d4c' : '#2b2f33'
      const grip = key === 'R' ? '#f07360' : '#3d4348'
      const dx = p.x - jx, dy = p.y - jy
      const len = Math.hypot(dx, dy) || 1
      const ux = dx / len, uy = dy / len
      // PhET 风格：线弧更弯更粗，像真实表笔线
      const sag = Math.min(36, 18 + len * 0.18)
      const mx = (jx + p.x) / 2 + (-uy) * sag
      const my = (jy + p.y) / 2 + (ux) * sag
      ctx.lineCap = 'round'
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 6
      ctx.beginPath(); ctx.moveTo(jx, jy); ctx.quadraticCurveTo(mx, my, p.x, p.y); ctx.stroke()
      ctx.strokeStyle = col; ctx.lineWidth = 3.6
      ctx.beginPath(); ctx.moveTo(jx, jy); ctx.quadraticCurveTo(mx, my, p.x, p.y); ctx.stroke()
      ctx.lineCap = 'butt'
      // 大探针笔：长金属尖 + 粗笔杆（PhET 电压表造型）
      const ang = Math.atan2(p.y - my, p.x - mx)
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang)
      // 金属尖
      const tipGrad = ctx.createLinearGradient(0, -3, 18, 3)
      tipGrad.addColorStop(0, '#f5f7fa'); tipGrad.addColorStop(1, '#9aa7b0')
      ctx.fillStyle = tipGrad; ctx.strokeStyle = '#6d7a82'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(20, -4.2); ctx.lineTo(20, 4.2); ctx.closePath(); ctx.fill(); ctx.stroke()
      // 护套
      ctx.fillStyle = '#c5ced4'; ctx.strokeStyle = '#8a969e'
      ctx.beginPath(); ctx.roundRect(-2, -5.5, 10, 11, 2); ctx.fill(); ctx.stroke()
      // 笔杆
      ctx.fillStyle = grip; ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.2
      ctx.beginPath(); ctx.roundRect(-28, -7.5, 28, 15, 7); ctx.fill(); ctx.stroke()
      // 高光
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ctx.beginPath(); ctx.roundRect(-24, -5.2, 18, 3.2, 2); ctx.fill()
      // 尾部线套
      ctx.fillStyle = '#222'
      ctx.beginPath(); ctx.roundRect(-34, -3.5, 8, 7, 3); ctx.fill()
      ctx.restore()
      // 吸附状态
      if (p.snap) {
        ctx.strokeStyle = '#2E7D32'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, Math.PI * 2); ctx.stroke()
      } else if (dragging === key) {
        ctx.strokeStyle = 'rgba(46,125,50,0.6)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3])
        ctx.beginPath(); ctx.arc(p.x, p.y, 12, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([])
      }
    }

    // 档位提示
    if (!dragging && !(mode === 'A' && probeClampWire(s, comp))) return
    ctx.save()
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    if (mode === 'A') {
      const w = probeClampWire(s, comp)
      if (w) {
        const fc = s.components.find(c => c.id === w.from.compId)
        const tc = s.components.find(c => c.id === w.to.compId)
        if (fc && tc) {
          const a = getTermPos(fc, w.from.termIdx), b = getTermPos(tc, w.to.termIdx)
          ctx.strokeStyle = 'rgba(46,125,50,0.5)'; ctx.lineWidth = 6; ctx.lineCap = 'round'
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.lineCap = 'butt'
          ctx.fillStyle = '#2E7D32'
          ctx.fillText('松手：万用表串入这段导线', (a.x + b.x) / 2, (a.y + b.y) / 2 - 44)
        }
      } else {
        ctx.fillStyle = '#c62828'
        ctx.fillText('红黑表笔分别接到同一段导线两端', comp.x, comp.y + 58)
      }
    } else {
      const ready = probes.R.snap && probes.B.snap
      ctx.fillStyle = ready ? '#2E7D32' : '#c62828'
      ctx.fillText(ready ? '两点电压已显示在屏幕' : '把红黑表笔接到两个测点（接线柱/导线）', comp.x, comp.y + 58)
    }
    ctx.restore()
  }

  // ================================================================
  //  Tab 2：自己动手 —— 写实器材实验台
  //  渲染顺序：垫板 → 导线(含电流粒子) → 连线预览 → 元件 → 接线柱 → 状态层
  // ================================================================

  /** 电路工作区（垫板）矩形 */
  function workAreaRect(W, H) {
    return { x: 8, y: 10, w: Math.max(80, W - 16), h: Math.max(80, H - 44) }
  }

  // ── 元件参数的唯一读取入口（默认值与添加器材时写入的一致）──
  const batteryVoltage = (c) => (typeof c.props?.voltage === 'number' ? c.props.voltage : 3)
  const resistorValue = (c) => (typeof c.props?.resistance === 'number' ? c.props.resistance : 10)
  const rheostatValue = (c) => (typeof c.props?.resistance === 'number' ? c.props.resistance : 20)
  const meterRangeOf = (c, kind) => {
    const r = c.props?.range
    return typeof r === 'number' && r > 0 ? r : kind === 'A' ? 0.6 : 3
  }
  // ── 读数估读（模拟真实仪表读数规则）──
  // 分度值 0.02 → 半格估读 0.01；0.1 → 1/10 估读 0.01；0.5 → 1/5 估读 0.1
  const readResolution = (kind, range) => {
    const minor = scaleSpec(kind, range).minor
    return minor >= 0.5 ? 0.1 : minor >= 0.1 ? 0.01 : minor / 2
  }
  /** 真值 → 仪表读数（按估读分辨率取整） */
  const quantizeReading = (v, res) => Math.round((v || 0) / res) * res
  /** 按估读分辨率格式化读数（0.01→两位小数，0.1→一位小数） */
  const fmtRead = (v, res) => (v || 0).toFixed(res < 0.05 ? 2 : 1)
  const BULB_RATED_V = 2.5 // 教学小灯泡额定电压（出厂值，实际取 props.ratedV）
  const RHEO_MAX = 50 // 滑动变阻器最大阻值

  /**
   * 灯泡工作状态
   * 亮度按「实际功率 / 额定功率」折算：灯丝温度≈功率的 0.45 次方，
   * 所以电压从 0 慢慢升高时，是先暗红、再橙、最后白炽，而不是"啪"地全亮。
   */
  function bulbState(comp, res) {
    const R = typeof comp.props?.resistance === 'number' ? comp.props.resistance : 10
    const ratedV = typeof comp.props?.ratedV === 'number' ? comp.props.ratedV : BULB_RATED_V
    const ratedP = (ratedV * ratedV) / Math.max(R, 0.1)
    const P = res ? Math.abs(res.power) : 0
    const ratio = ratedP > 0 ? P / ratedP : 0
    const brightness = ratio > 0 ? Math.min(1, Math.pow(ratio, 0.45)) : 0
    const overload = ratio > 1.4 ? Math.min(1, (ratio - 1.4) / 2.4) : 0
    return { brightness, overload, power: P, ratio }
  }

  /** 导线内电流（带符号：正 = 沿 wire.from → wire.to 流动） */
  function wireAmpere(wire, er) {
    if (!er || !er.ok || !er.results) return 0
    const fc = S.current.components.find((c) => c.id === wire.from.compId)
    if (!fc) return 0
    return wireCurrent({ id: fc.id }, wire.from.termIdx, er.results)
  }

  /** 接线柱极帽颜色：电源/电表按真实器材分红黑，其余裸铜 */
  function terminalColor(type, idx) {
    if (type === 'battery' || type === 'ammeter' || type === 'voltmeter') {
      return idx === 1 ? '#c62828' : '#1b1b1b'
    }
    return null
  }

  function renderBuilder(ctx, W, H) {
    const s = S.current
    const area = workAreaRect(W, H)
    const er = solveSceneCircuit()
    const shorted = !!(er.diagnostics && er.diagnostics.short)

    // ① 工作区垫板：电路导通时微微提亮，暗示"有电"
    drawWorkArea(ctx, area, { glow: er.ok && !shorted ? 1 : 0 })

    // ② 导线（压在器材下面，符合真实接线顺序）
    for (const wire of s.wires) drawBuilderWire(ctx, wire, er)

    // ③ 连线预览：吸附到接线柱时整条变绿并显示锁环
    if (s.connecting) {
      const fc = s.components.find((c) => c.id === s.connecting.compId)
      if (fc) {
        const ft = getTermPos(fc, s.connecting.termIdx)
        const snap = s.hoverTerm
        const target = snap
          ? getTermPos(s.components.find((c) => c.id === snap.compId), snap.termIdx)
          : { x: s.connecting.mx, y: s.connecting.my }
        const path = wirePath(ft, target, s.connecting.termIdx, snap ? snap.termIdx : 1)
        drawWirePreview(ctx, path, { snapped: !!snap })
        if (snap) {
          // 磁吸锁定环（轻微呼吸，手感提示）
          const pulse = 1 + 0.12 * Math.sin(s.time * 9)
          ctx.strokeStyle = 'rgba(61,220,132,0.9)'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(target.x, target.y, 13 * pulse, 0, Math.PI * 2)
          ctx.stroke()
          ctx.strokeStyle = 'rgba(61,220,132,0.35)'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.arc(target.x, target.y, 19 * pulse, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
    }

    // ④ 电表拖放落点预览（电流表→串入导线，电压表→并联到元件）
    drawDropPreview(ctx, s)

    // ⑤ 元件（含表盘指针动力学）
    for (const comp of s.components) drawBuilderComp(ctx, comp, s, er)

    // ⑥ 万用表表笔（画在所有器材之上，跨机身）
    for (const comp of s.components) if (comp.type === 'multimeter') drawProbes(ctx, comp, s)

    // ⑦ 短路警示
    if (shorted) {
      const flash = 0.6 + 0.4 * Math.sin(s.time * 10)
      ctx.save()
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const text = '⚠ 短路：电流过大，请检查是否把电源两端直接连通'
      const w = ctx.measureText(text).width + 26
      const bx = W / 2 - w / 2, by = area.y + 8
      ctx.fillStyle = `rgba(120,12,10,${0.82 * flash})`
      ctx.beginPath()
      ctx.roundRect(bx, by, w, 24, 12)
      ctx.fill()
      ctx.strokeStyle = `rgba(255,82,82,${0.9 * flash})`
      ctx.lineWidth = 1.4
      ctx.stroke()
      ctx.fillStyle = '#ffd9d6'
      ctx.fillText(text, W / 2, by + 12.5)
      ctx.restore()
    }

    // ⑧ 操作说明（固定左上角，可折叠）
    {
      const lines = [
        '点器材栏添加元件，拖到桌面任意位置',
        '点接线柱拖出导线，靠近另一接线柱自动吸附',
        '轻点开关通断；拖滑片改变变阻器阻值',
        '双击元件打开参数面板；右键删除元件/导线',
      ]
      const g = drawGuideBubble(ctx, area.x + 4, area.y + 4, true, s._guideExpanded, lines, () => {
        s._guideExpanded = !s._guideExpanded
        forceUpdate((n) => n + 1)
      })
      canvasRef.current._clickAreas.push(g)
    }

    // ⑨ 未连线提示（虚线框，柔化以免破坏画面）
    const wiredIds = new Set()
    for (const w of s.wires) { wiredIds.add(w.from.compId); wiredIds.add(w.to.compId) }
    ctx.save()
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = 'rgba(255,140,120,0.45)'
    ctx.lineWidth = 1.2
    for (const comp of s.components) {
      if (wiredIds.has(comp.id) || comp.type === 'multimeter') continue
      ctx.strokeRect(comp.x - 44, comp.y - 32, 88, 64)
      ctx.setLineDash([])
      label2(ctx, '未接线', comp.x, comp.y - 36, 'rgba(255,160,140,0.85)')
      ctx.setLineDash([4, 4])
    }
    ctx.restore()

    // ⑩ 底部状态行 + 电流方向图例
    drawBuilderStatus(ctx, W, H, area, er, shorted)
  }

  function drawBuilderStatus(ctx, W, H, area, er, shorted) {
    const s = S.current
    const y = H - 20
    ctx.save()
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'

    // 电路状态灯
    const ok = er.ok && !shorted
    ctx.fillStyle = shorted ? '#ff4b3e' : ok ? '#3ddc84' : 'rgba(255,180,80,0.9)'
    ctx.beginPath()
    ctx.arc(area.x + 12, y, 4, 0, Math.PI * 2)
    ctx.fill()
    if (ok) {
      const g = ctx.createRadialGradient(area.x + 12, y, 0, area.x + 12, y, 12)
      g.addColorStop(0, 'rgba(61,220,132,0.5)')
      g.addColorStop(1, 'rgba(61,220,132,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(area.x + 12, y, 12, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.fillStyle = shorted ? '#ff9d95' : ok ? 'rgba(200,235,220,0.92)' : 'rgba(255,205,150,0.9)'
    ctx.fillText(er.ok ? (shorted ? '短路' : er.reason) : er.reason || '电路未闭合', area.x + 22, y)

    // 电流方向图例
    if (s.showFlow) {
      const isE = s.flowMode === 'e'
      const [r, g, b] = isE ? [90, 200, 255] : [255, 214, 110]
      const txt = isE ? '电子 e⁻ 流向（负→正）' : '电流 I 方向（正→负）'
      ctx.font = '10px sans-serif'
      const tw = ctx.measureText(txt).width
      const bx = area.x + area.w - tw - 34
      ctx.fillStyle = `rgba(${r},${g},${b},0.95)`
      ctx.beginPath()
      ctx.arc(bx - 8, y, 3, 0, Math.PI * 2)
      ctx.fill()
      const gr = ctx.createRadialGradient(bx - 8, y, 0, bx - 8, y, 7)
      gr.addColorStop(0, `rgba(${r},${g},${b},0.55)`)
      gr.addColorStop(1, `rgba(${r},${g},${b},0)`)
      ctx.fillStyle = gr
      ctx.beginPath()
      ctx.arc(bx - 8, y, 7, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(210,225,235,0.78)'
      ctx.textAlign = 'left'
      ctx.fillText(txt, bx, y)
    }
    ctx.restore()
  }

  /** 小号浅色丝印（深色背景专用） */
  function label2(ctx, text, x, y, color = 'rgba(210,225,235,0.8)') {
    ctx.save()
    ctx.font = '600 9px sans-serif'
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText(text, x, y)
    ctx.restore()
  }

  // ────────────────────────────────────────────────────────────
  //  单个元件
  // ────────────────────────────────────────────────────────────
  function drawBuilderComp(ctx, comp, s, er) {
    const { x, y, type } = comp
    const isClosed = !!(er && er.ok) && !(er.diagnostics && er.diagnostics.short)
    const res = er && er.ok && er.results ? er.results.get(comp.id) : null

    // 悬停/选中：在元件下面垫一层柔光，代替以前生硬的红框
    if (s.hoverComp === comp.id && !s.dragId) {
      const g = ctx.createRadialGradient(x, y, 4, x, y, 52)
      g.addColorStop(0, 'rgba(90,169,255,0.16)')
      g.addColorStop(1, 'rgba(90,169,255,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.ellipse(x, y + 2, 54, 34, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(comp.rotation || 0)
    if (s.dragId === comp.id) ctx.globalAlpha = 0.9

    if (type === 'battery') {
      drawRealBattery2(ctx, { voltage: batteryVoltage(comp) })
    } else if (type === 'bulb') {
      const st = bulbState(comp, isClosed ? res : null)
      drawRealBulb2(ctx, { brightness: st.brightness, overload: st.overload })
    } else if (type === 'switch') {
      drawRealSwitch2(ctx, { closed: comp.closed !== false })
    } else if (type === 'resistor') {
      drawRealResistor2(ctx, { resistance: resistorValue(comp) })
    } else if (type === 'rheostat') {
      drawRealRheostat2(ctx, {
        R: rheostatValue(comp),
        maxR: RHEO_MAX,
        dragging: s.dragId === 'rheo_' + comp.id,
      })
    } else if (type === 'ammeter' || type === 'voltmeter') {
      const kind = type === 'ammeter' ? 'A' : 'V'
      const raw = res ? (kind === 'A' ? res.current : res.voltage) : 0
      // 极性约定（见 CircuitSolver.js）：raw<=0 为正确接法（电流自红接线柱流入）；
      // raw>0 = 反接 → 指针反向偏转撞左止挡，读数按绝对值显示并打反接告警
      const reversed = raw > 1e-6
      const value = Math.abs(raw)
      const range = meterRangeOf(comp, kind)
      const target = (reversed ? -1 : 1) * needleRatio(value, range)
      const needle = stepNeedle(`${comp.id}:${kind}:${range}`, target, s.dt)
      drawRealMeter2(ctx, {
        kind,
        value,
        range,
        needle,
        over: !reversed && value > range * 1.02,
        spec: scaleSpec(kind, range),
      })
    } else if (type === 'multimeter') {
      // 万用表沿用原有写实绘制（含表笔、档位按钮）
      const mode = (comp.props && comp.props.mode) || 'V'
      const wired = s.wires.some((w) => w.from.compId === comp.id || w.to.compId === comp.id)
      let value = null
      if (mode === 'A') {
        if (wired && res) value = Math.abs(res.current)
      } else {
        const v = probeVoltage(s, comp, er)
        if (v != null) value = v
        else if (wired && res) value = Math.abs(res.voltage)
      }
      drawRealMultimeter(ctx, 0, 0, { mode, value })
    }

    ctx.globalAlpha = 1
    ctx.restore()

    // ── 读数芯片 + 反接提示（绝对坐标，不随元件旋转）──
    if (type === 'ammeter' || type === 'voltmeter') {
      const kind = type === 'ammeter' ? 'A' : 'V'
      const raw = res ? (kind === 'A' ? res.current : res.voltage) : 0
      const reversed = raw > 1e-6 // 黑接线柱接高电位 = 反接
      const range = meterRangeOf(comp, kind)
      const q = readResolution(kind, range)
      const value = quantizeReading(Math.abs(raw), q)
      const txt = kind === 'A'
        ? `I ${value.toFixed(q < 0.05 ? 2 : 1)} A`
        : `U ${value.toFixed(q < 0.05 ? 2 : 1)} V`
      drawReadoutChip(ctx, x, y + 40, txt, kind === 'A' ? '#C62828' : '#2E7D32')
      if (reversed) {
        label2(ctx, kind === 'A' ? '⚠ 电流反接' : '⚠ 电压反接', x, y - 30, 'rgba(255,150,140,0.9)')
      }
    } else if (type === 'bulb' && isClosed && res) {
      const st = bulbState(comp, res)
      drawReadoutChip(ctx, x, y + 26, `P ${st.power.toFixed(2)} W`, st.overload > 0 ? '#C62828' : '#B26A00')
      if (st.overload > 0.15) label2(ctx, '⚠ 过载', x, y - 46, `rgba(255,120,110,${0.7 + 0.3 * Math.sin(s.time * 8)})`)
    }

    // ── 接线柱（电表自己画了红黑柱，避免重复）──
    if (type === 'multimeter') return
    const terms = getTerminals(comp)
    for (let i = 0; i < terms.length; i++) {
      const t = terms[i]
      const hov = s.hoverTerm && s.hoverTerm.compId === comp.id && s.hoverTerm.termIdx === i
      const src = s.connecting && s.connecting.compId === comp.id && s.connecting.termIdx === i
      if (type === 'ammeter' || type === 'voltmeter') continue
      drawPost(ctx, { x: t.x, y: t.y, color: terminalColor(type, i), hover: hov, active: src })
    }
  }

  // ────────────────────────────────────────────────────────────
  //  单根导线（胶皮铜线 + 电流粒子）
  // ────────────────────────────────────────────────────────────
  function drawBuilderWire(ctx, wire, er) {
    const s = S.current
    const fc = s.components.find((c) => c.id === wire.from.compId)
    const tc = s.components.find((c) => c.id === wire.to.compId)
    if (!fc || !tc) return
    const f = getTermPos(fc, wire.from.termIdx)
    const t = getTermPos(tc, wire.to.termIdx)
    const path = wirePath(
      f, t, wire.from.termIdx, wire.to.termIdx,
      wire.mid1X != null ? { x: wire.mid1X, y: wire.mid1Y } : null,
      wire.mid2X != null ? { x: wire.mid2X, y: wire.mid2Y } : null,
    )
    const amp = wireAmpere(wire, er)
    const live = Math.abs(amp) > 1e-4
    const shorted = !!(er.diagnostics && er.diagnostics.short)

    drawWire(ctx, path, {
      color: shorted && live ? '#ff5252' : wire.color || '#e53935',
      width: 3.6,
      energized: live,
      dim: !er.ok,
    })

    // 电流粒子：相位按本导线电流速度积分，所以串联回路里各段速度一致
    if (s.showFlow && live) {
      let ph = s._flow.get(wire.id) || 0
      ph = (ph + (s.dt || 1 / 60) * flowSpeed(amp)) % 1
      s._flow.set(wire.id, ph)
      drawFlow(ctx, path, {
        phase: ph,
        dir: amp >= 0 ? 1 : -1,
        current: amp,
        mode: s.flowMode,
        spacing: 32,
      })
    }
  }

  // ────────────────────────────────────────────────────────────
  //  Tab2 求解：把 components/wires 喂给 CircuitGraph → MNA 求解
  //  注意：这里不再自己写一套"是否闭合"的判断。
  //  旧版 checkCircuit() 按「元件度数≥2 + DFS 回环」判闭合，会把
  //  「滑动变阻器滑到 0Ω」「灯泡被导线短接」这类真实现象判错，
  //  也会漏掉电源被开关短接。现在一律以引擎的拓扑校验 + 求解结果为准。
  // ────────────────────────────────────────────────────────────
  function solveSceneCircuit() {
    const s = S.current
    // 版本号没变就复用上一次结果（拖动元件不影响电路，省掉每帧建图）
    if (s._cache && s._cache.rev === s._rev) return s._cache.result
    const result = computeCircuit()
    s._cache = { rev: s._rev, result }
    return result
  }

  /** 拓扑或参数变化时调用：让下一帧重新求解 */
  function invalidateCircuit() {
    S.current._rev = (S.current._rev || 0) + 1
  }

  function computeCircuit() {
    const s = S.current
    // 白名单过滤：只保留电路认识的元件类型
    const ALLOWED = new Set(['battery', 'bulb', 'switch', 'resistor', 'rheostat', 'inductor', 'capacitor', 'ammeter', 'voltmeter', 'multimeter'])
    const before = s.components.length
    s.components = s.components.filter(c => ALLOWED.has(c.type))
    if (s.components.length !== before) {
      const kept = new Set(s.components.map(c => c.id))
      s.wires = s.wires.filter(w => kept.has(w.from.compId) && kept.has(w.to.compId))
    }

    if (!s.components.length) {
      return { ok: false, reason: '从右侧器材栏拖入元件开始搭电路', results: new Map(), portNode: new Map(), diagnostics: null }
    }

    const g = new CircuitGraph()
    for (const comp of s.components) {
      // 参数一律从元件自身的 props 取（参数面板改的就是它）
      const props = { ...(comp.props || {}) }
      if (comp.type === 'bulb') props.resistance = typeof comp.props?.resistance === 'number' ? comp.props.resistance : 10
      if (comp.type === 'resistor') props.resistance = resistorValue(comp)
      if (comp.type === 'rheostat') props.resistance = rheostatValue(comp)
      if (comp.type === 'inductor') props.resistance = 1
      if (comp.type === 'capacitor') props.resistance = 1000000
      if (comp.type === 'switch') props.closed = comp.closed !== false
      if (comp.type === 'battery') props.voltage = batteryVoltage(comp)
      if (comp.type === 'multimeter') props.mode = (comp.props && comp.props.mode) || 'V'
      g.addComponent(comp.type, comp.x, comp.y, props, comp.id)
    }
    for (const wire of s.wires) {
      g.addWire(
        { componentId: wire.from.compId, portIndex: wire.from.termIdx },
        { componentId: wire.to.compId, portIndex: wire.to.termIdx }
      )
    }
    try {
      const v = g.validate()
      const info = g.getCircuitInfo()
      const solver = new CircuitSolver()
      const results = solver.solve(info)
      // 端子 → 节点号：表笔按测点读两点电势差用
      const portNode = new Map()
      for (const c of g.components) c.ports.forEach((p, i) => portNode.set(`${c.id}:${i}`, p.nodeId))
      const diagnostics = results.diagnostics || null
      // 拓扑不通时仍然把电流留在结果里（短路电流需要显示），只是标记 ok=false
      if (!v.ok) return { ok: false, reason: v.reason, results, portNode, diagnostics }
      return { ok: true, reason: v.reason, results, portNode, diagnostics }
    } catch (e) {
      return { ok: false, reason: '求解失败：' + (e.message || e), results: new Map(), portNode: new Map(), diagnostics: null }
    }
  }

  // getTerminals / getTermPos / findTermAt / findCompAt 从 circuitKit 导入
  function findTerm(mx, my) {
    return findTermAt(S.current.components, mx, my)
  }
  function findComp(mx, my) {
    return findCompAt(S.current.components, mx, my)
  }

  const getPos = (e) => eventToCanvas(canvasRef.current, e)

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    const s = S.current; const { x, y } = getPos(e)
    if (s.tab === 1) {
      for (const a of canvasRef.current._clickAreas) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(x, y); return } }
      return
    }
    // 先抓表笔（整支笔身热区，优先于元件/接线柱/机身）
    for (const c of s.components) {
      if (c.type !== 'multimeter' || !c.props || !c.props.probes) continue
      const key = hitProbeAt(c, x, y)
      if (key) {
        s.dragId = null; s.dropTarget = null
        s.dragProbe = { id: c.id, key }
        s.dragMoved = false; s.dragStart = { x, y }
        forceUpdate(n => n + 1)
        return
      }
    }
    for (const a of canvasRef.current._palAreas) {
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) {
        if (a.action === 'color') { s.wireColor = a.color; forceUpdate(n => n + 1); return }
        if (a.type) {
          const id = s.nextId++
          s.components.push({
            id, type: a.type, x, y, rotation: 0,
            closed: a.type === 'switch' ? false : true,
            props: defaultProps(a.type),
          })
          s.dragId = id; s.dragOffX = 0; s.dragOffY = 0
          s.dragMoved = false; s.dragStart = { x, y }
          invalidateCircuit()
          forceUpdate(n => n + 1); return
        }
      }
    }
    // 先检测是否点中滑线变阻器的滑片（世界坐标→本地坐标，旋转后热区仍对准滑片）
    for (const comp of s.components) {
      if (comp.type !== 'rheostat') continue
      const cos = Math.cos(comp.rotation || 0), sin = Math.sin(comp.rotation || 0)
      const dx = x - comp.x, dy = y - comp.y
      const lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos
      const sliderX = rheostatSliderX(rheostatValue(comp), RHEO_MAX)
      if (Math.abs(lx - sliderX) < 14 && ly > -26 && ly < -2) {
        s.dragId = 'rheo_' + comp.id
        s.dragMoved = false; s.dragStart = { x, y }
        forceUpdate(n => n + 1); return
      }
    }
    // 万用表：先认 V/A 档位按钮（点即切档），再机身拖动；贴近插孔才连线
    for (const comp of s.components) {
      if (comp.type !== 'multimeter') continue
      const dx = x - comp.x, dy = y - comp.y
      if (Math.abs(dx) > 58 || Math.abs(dy) > 52) continue
      // V / A 按钮：点一下就切档（不等 mouseup，反馈立刻可见）
      const modeBtn = hitMultimeterModeBtn(comp, x, y)
      if (modeBtn) {
        const next = modeBtn === 'A' ? 'A' : 'V'
        comp.props = { ...(comp.props || {}), mode: next }
        s.dragId = null; s.dragMoved = false; s.dragStart = null
        forceUpdate(n => n + 1)
        return
      }
      const terms = getTerminals(comp)
      const nearTerm = terms.some(t => Math.hypot(x - t.x, y - t.y) <= 18)
      if (nearTerm) break
      s.dragId = comp.id; s.dragOffX = x - comp.x; s.dragOffY = y - comp.y
      s.dragMoved = false; s.dragStart = { x, y }
      forceUpdate(n => n + 1)
      return
    }
    const term = findTerm(x, y)
    if (term) { s.connecting = { ...term, mx: x, my: y }; s.dragMoved = false; forceUpdate(n => n + 1); return }
    for (const wire of s.wires) {
      const fc = s.components.find(c => c.id === wire.from.compId)
      const tc = s.components.find(c => c.id === wire.to.compId)
      if (!fc || !tc) continue
      const f = getTermPos(fc, wire.from.termIdx), t = getTermPos(tc, wire.to.termIdx)
      const ctrl = bezierCtrl(f, t, wire.from.termIdx, wire.to.termIdx,
        wire.mid1X != null ? { x: wire.mid1X, y: wire.mid1Y } : null,
        wire.mid2X != null ? { x: wire.mid2X, y: wire.mid2Y } : null)
      if ((x - ctrl.m1x) ** 2 + (y - ctrl.m1y) ** 2 < 256) {
        s.dragId = 'wire_' + wire.id + '_1'; s.dragMoved = false; s.dragStart = { x, y }
        forceUpdate(n => n + 1); return
      }
      if ((x - ctrl.m2x) ** 2 + (y - ctrl.m2y) ** 2 < 256) {
        s.dragId = 'wire_' + wire.id + '_2'; s.dragMoved = false; s.dragStart = { x, y }
        forceUpdate(n => n + 1); return
      }
    }
    const comp = findComp(x, y)
    if (comp) {
      s.dragId = comp.id; s.dragOffX = x - comp.x; s.dragOffY = y - comp.y
      s.dragMoved = false; s.dragStart = { x, y }
      forceUpdate(n => n + 1)
    }
  }, [])

  const handleMouseMove = useCallback((e) => {
    const s = S.current; const { x, y } = getPos(e)
    if (s.tab !== 2) return
    // 拖表笔：笔尖跟随指针并吸附测点
    if (s.dragProbe) {
      if (s.dragStart && Math.hypot(x - s.dragStart.x, y - s.dragStart.y) > 10) s.dragMoved = true
      const c = s.components.find(k => k.id === s.dragProbe.id)
      if (c && c.props && c.props.probes) {
        const p = c.props.probes[s.dragProbe.key]
        p.x = x; p.y = y
        p.snap = probeSnapAt(s, x, y, c.id)
      }
      return
    }
    // 拖拽只改 S.current，rAF 重绘 —— 不 forceUpdate
    if (s.dragId) {
      s.dropTarget = null
      if (typeof s.dragId === 'string' && s.dragId.startsWith('rheo_')) {
        const compId = parseInt(s.dragId.slice(5))
        const comp = s.components.find(c => c.id === compId)
        if (comp) {
          if (s.dragStart && Math.hypot(x - s.dragStart.x, y - s.dragStart.y) > 10) s.dragMoved = true
          // 滑片位置用本地 x（与渲染一致），旋转后拖动不跑偏
          const cos = Math.cos(comp.rotation || 0), sin = Math.sin(comp.rotation || 0)
          const lx = (x - comp.x) * cos + (y - comp.y) * sin
          const next = mapSliderR(lx, -26, 26, RHEO_MAX)
          if (next !== comp.props.resistance) {
            comp.props.resistance = next
            invalidateCircuit() // 阻值变了 → 下一帧立刻重算
          }
        }
        return
      }
      if (typeof s.dragId === 'string' && s.dragId.startsWith('wire_')) {
        const parts = s.dragId.split('_')
        const wire = s.wires.find(w => w.id === parseInt(parts[1]))
        if (wire) {
          if (s.dragStart && Math.hypot(x - s.dragStart.x, y - s.dragStart.y) > 10) s.dragMoved = true
          if (parseInt(parts[2]) === 1) { wire.mid1X = x; wire.mid1Y = y }
          else { wire.mid2X = x; wire.mid2Y = y }
        }
        return
      }
      const c = s.components.find(k => k.id === s.dragId)
      if (c) {
        if (s.dragStart && Math.hypot(x - s.dragStart.x, y - s.dragStart.y) > 10) s.dragMoved = true
        const prevX = c.x, prevY = c.y
        c.x = x - s.dragOffX; c.y = y - s.dragOffY
        // 挪动表身时，未吸附的表笔跟着走（吸附住的留在测点上）
        if (c.type === 'multimeter' && c.props && c.props.probes) {
          const dx = c.x - prevX, dy = c.y - prevY
          for (const key of ['R', 'B']) {
            const p = c.props.probes[key]
            if (!p.snap) { p.x += dx; p.y += dy }
          }
        }
        // 电表悬停落点：电流表找导线、电压表找元件
        s.dropTarget = computeDropTarget(s, c, x, y)
      }
      return
    }
    if (s.connecting) {
      s.connecting.mx = x; s.connecting.my = y
      s.hoverTerm = findTermNear(S.current.components, x, y, s.connecting.compId)
      return
    }
    s.hoverTerm = findTerm(x, y)
    const hov = s.hoverTerm ? null : findComp(x, y)
    s.hoverComp = hov ? hov.id : null
    canvasRef.current.style.cursor = s.hoverTerm
      ? 'crosshair'
      : hov
        ? (hov.type === 'rheostat' ? 'ew-resize' : 'grab')
        : 'default'
  }, [])

  const handleMouseUp = useCallback((e) => {
    const s = S.current
    if (e) {
      try { s._lastUpPos = getPos(e) } catch (_) { s._lastUpPos = null }
    }
    const now = performance.now()
    const upPos = s._lastUpPos
    if (s.tab === 2 && upPos) {
      const isDouble = s._lastUpT && (now - s._lastUpT) < 350
        && s._lastUpPrev
        && Math.hypot(upPos.x - s._lastUpPrev.x, upPos.y - s._lastUpPrev.y) < 28
      if (isDouble && !s.dragMoved) {
        let comp = findComp(upPos.x, upPos.y)
        if (!comp) comp = findCompWide(S.current.components, upPos.x, upPos.y)
        if (comp) {
          // 双击 = 打开参数面板（旧版是双击删除，容易误删，已改为右键删除）
          s.dragId = null; s.connecting = null
          s._lastUpT = 0; s._lastUpPrev = null
          setEditingId(comp.id)
          setAnchor({ x: comp.x, y: comp.y })
          forceUpdate(n => n + 1)
          return
        }
      }
      s._lastUpPrev = upPos
      s._lastUpT = now
    }
    // 松开表笔：电流档若夹住同一段导线两端 → 自动串入，表笔收回
    if (s.dragProbe) {
      const dp = s.dragProbe
      s.dragProbe = null; s.dragMoved = false; s.dragStart = null
      const c = s.components.find(k => k.id === dp.id)
      if (c && c.props && c.props.probes) {
        const mode = c.props.mode || 'V'
        if (mode === 'A' && meterIsFree(s, c.id)) {
          const w = probeClampWire(s, c)
          if (w && applyAutoConnect(s, c.id, { kind: 'wire', wireId: w.id, ok: true }, null)) {
            c.props.probes.R = resetProbe(c, 'R')
            c.props.probes.B = resetProbe(c, 'B')
            invalidateCircuit()
          }
        }
      }
      forceUpdate(n => n + 1)
      return
    }
    if (s.dragId) {
      const id = s.dragId
      const moved = s.dragMoved
      const dt = s.dropTarget
      s.dropTarget = null
      // 拖着电表落到导线/元件上：松手即接入（电流表串入、电压表并联）
      if (moved && typeof id === 'number' && dt && dt.ok) {
        const R0 = canvasRef.current._R
        if (applyAutoConnect(s, id, dt, R0 ? { w: R0.W, h: R0.H } : null)) {
          invalidateCircuit()
          s.dragId = null; s.dragMoved = false; s.dragStart = null
          forceUpdate(n => n + 1)
          return
        }
      }
      s.dragId = null; s.dragMoved = false; s.dragStart = null
      // 轻点开关：切换通断。万用表只认 V/A 按钮，避免点壳误切档
      if (!moved && typeof id === 'number') {
        const c = s.components.find(k => k.id === id)
        if (c && c.type === 'switch') {
          c.closed = c.closed === false
          invalidateCircuit() // 通断瞬间立刻重算
          forceUpdate(n => n + 1)
          return
        }
      }
      forceUpdate(n => n + 1)
      return
    }
    if (s.connecting) {
      const t = s.hoverTerm
      if (t && t.compId !== s.connecting.compId) {
        const dup = s.wires.some(w =>
          (w.from.compId === s.connecting.compId && w.from.termIdx === s.connecting.termIdx && w.to.compId === t.compId && w.to.termIdx === t.termIdx) ||
          (w.to.compId === s.connecting.compId && w.to.termIdx === s.connecting.termIdx && w.from.compId === t.compId && w.from.termIdx === t.termIdx))
        if (!dup) {
          s.wires.push({ id: s.nextId++, from: { compId: s.connecting.compId, termIdx: s.connecting.termIdx }, to: t, color: s.wireColor, mid1X: null, mid1Y: null, mid2X: null, mid2Y: null })
          invalidateCircuit()
        }
      }
      s.connecting = null; s.hoverTerm = null; forceUpdate(n => n + 1)
    }
  }, [])

  // ── 撤销：每次「会改电路」的操作前压一帧快照（限 30 帧，防内存膨胀）──
  const pushHistory = useCallback(() => {
    const s = S.current
    if (!s.history) s.history = []
    s.history.push(JSON.parse(JSON.stringify({ components: s.components, wires: s.wires })))
    if (s.history.length > 30) s.history.shift()
  }, [])
  const undo = useCallback(() => {
    const s = S.current
    const snap = s.history && s.history.pop()
    if (!snap) return
    s.components = snap.components
    s.wires = snap.wires
    s._flow.clear()
    resetNeedles()
    invalidateCircuit()
    setCtxMenu(null)
    setInternal(null)
    setEditingId(null)
    forceUpdate(n => n + 1)
  }, [])

  /** 清空整个实验台（可撤销） */
  const clearBench = useCallback(() => {
    pushHistory()
    const s = S.current
    s.components = []; s.wires = []; s._flow.clear()
    resetNeedles()
    invalidateCircuit()
    setEditingId(null); setCtxMenu(null); setInternal(null)
    forceUpdate(n => n + 1)
  }, [pushHistory])

  /** 保存电路到浏览器本地（key 固定，重复保存即覆盖） */
  const saveCircuit = useCallback(() => {
    const s = S.current
    try {
      localStorage.setItem('physics-lab.ohmslaw.bench', JSON.stringify({
        components: s.components, wires: s.wires, nextId: s.nextId,
      }))
      setToast('已保存到浏览器本地')
    } catch {
      setToast('保存失败：' + (err && err.message ? err.message : '未知错误'))
    }
  }, [])

  /** 载入上次保存的电路 */
  const loadCircuit = useCallback(() => {
    const raw = localStorage.getItem('physics-lab.ohmslaw.bench')
    if (!raw) { setToast('还没有保存过电路'); return }
    try {
      const d = JSON.parse(raw)
      pushHistory()
      const s = S.current
      s.components = d.components || []
      s.wires = d.wires || []
      s.nextId = d.nextId || (s.components.length + 1)
      s._flow.clear()
      resetNeedles()
      invalidateCircuit()
      setEditingId(null); setCtxMenu(null); setInternal(null)
      setToast('已载入保存的电路')
      forceUpdate(n => n + 1)
    } catch {
      setToast('载入失败：数据已损坏')
    }
  }, [pushHistory])

  /** 导出电路图为 PNG（取当前画布位图） */
  const exportPNG = useCallback(() => {
    const cv = canvasRef.current
    if (!cv) return
    const a = document.createElement('a')
    a.href = cv.toDataURL('image/png')
    a.download = '欧姆定律_电路图.png'
    a.click()
    setToast('电路图已导出')
  }, [])

  /** 仿真启停：暂停后画面静止（电流粒子/指针不动），仍可继续搭电路 */
  const togglePause = useCallback(() => {
    S.current.paused = !S.current.paused
    forceUpdate(n => n + 1)
  }, [])

  /** 删除元件（含其导线与表针状态） */
  const deleteComp = useCallback((id) => {
    const s = S.current
    pushHistory()
    s.components = s.components.filter(c => c.id !== id)
    s.wires = s.wires.filter(w => w.from.compId !== id && w.to.compId !== id)
    dropNeedle(`${id}:A:0.6`); dropNeedle(`${id}:A:3`); dropNeedle(`${id}:V:3`); dropNeedle(`${id}:V:15`)
    if (editingId === id) setEditingId(null)
    invalidateCircuit()
    forceUpdate(n => n + 1)
  }, [pushHistory, editingId])

  /** 复制元件（偏移 36px，连同参数；不复制连线） */
  const copyComp = useCallback((id) => {
    const s = S.current
    const src = s.components.find(c => c.id === id)
    if (!src) return
    pushHistory()
    const nid = s.nextId++
    s.components.push({
      ...src, id: nid,
      x: src.x + 36, y: src.y + 36,
      props: JSON.parse(JSON.stringify(src.props || {})),
    })
    invalidateCircuit()
    forceUpdate(n => n + 1)
  }, [pushHistory])

  /**
   * 右键：弹出操作菜单（拆开看内部结构 / 复制 / 删除）
   * —— 元件优先；否则看是否点在导线上（删这根线）
   */
  const handleContextMenu = useCallback((e) => {
    const s = S.current
    if (s.tab !== 2) return
    e.preventDefault()
    const { x, y } = getPos(e)
    const comp = findComp(x, y) || findCompWide(s.components, x, y)
    if (comp) {
      setCtxMenu({
        x: e.clientX, y: e.clientY,
        items: [
          { icon: '🔬', label: '拆开看内部结构', onClick: () => setInternal({ type: comp.type, anchor: { x: 40, y: 40 } }) },
          { icon: '⧉', label: '复制元件', onClick: () => copyComp(comp.id) },
          { icon: '🗑', label: '删除元件', danger: true, onClick: () => deleteComp(comp.id) },
        ],
      })
      return
    }
    // 点到导线：删除该导线（线段命中测试，容差 8px）
    const wire = wireAtPoint(s, x, y, 8)
    if (wire) {
      setCtxMenu({
        x: e.clientX, y: e.clientY,
        items: [{ icon: '🗑', label: '删除导线', danger: true, onClick: () => {
          pushHistory()
          s.wires = s.wires.filter(w => w.id !== wire.id)
          s._flow.delete(wire.id)
          invalidateCircuit()
          forceUpdate(n => n + 1)
        } }],
      })
    }
  }, [copyComp, deleteComp, pushHistory])

  /** 命中测试：点到的是哪根导线（沿贝塞尔采样取最近距离） */
  function wireAtPoint(s, x, y, tol = 8) {
    let best = null, bestD = tol
    for (const w of s.wires) {
      const fc = s.components.find(c => c.id === w.from.compId)
      const tc = s.components.find(c => c.id === w.to.compId)
      if (!fc || !tc) continue
      const path = wirePath(
        getTermPos(fc, w.from.termIdx), getTermPos(tc, w.to.termIdx),
        w.from.termIdx, w.to.termIdx,
        w.mid1X != null ? { x: w.mid1X, y: w.mid1Y } : null,
        w.mid2X != null ? { x: w.mid2X, y: w.mid2Y } : null,
      )
      // 采样 18 段足够精确（导线最窄处 4px）
      for (let i = 0; i <= 18; i++) {
        const p = bezierAt(path, i / 18)
        const d = Math.hypot(p.x - x, p.y - y)
        if (d < bestD) { bestD = d; best = w }
      }
    }
    return best
  }

  /** 双击：打开元件参数面板 */
  const handleDoubleClick = useCallback((e) => {
    if (S.current.tab !== 2) return
    e.preventDefault()
    const { x, y } = getPos(e)
    let comp = findComp(x, y)
    if (!comp) comp = findCompWide(S.current.components, x, y)
    if (comp) {
      setEditingId(comp.id)
      setAnchor({ x: comp.x, y: comp.y })
      forceUpdate(n => n + 1)
    }
  }, [])

  /** 参数面板改值：写回 props → 让引擎重算（不改数据结构，只改参数） */
  const handleParamChange = useCallback((comp, key, value) => {
    if (!comp) return
    // 连续拖滑杆时按「同一元件+同一参数」合并成一次撤销记录
    const s = S.current
    const now = Date.now()
    const sig = `${comp.id}:${key}`
    if (s._histSig !== sig || now - (s._histT || 0) > 600) pushHistory()
    s._histSig = sig; s._histT = now
    if (key === '__closed') {
      comp.closed = !!value
    } else {
      comp.props = { ...(comp.props || {}), [key]: value }
    }
    invalidateCircuit()
    forceUpdate(n => n + 1)
  }, [pushHistory])

  /** 参数面板定位用：画布实际尺寸 */
  function canvasBounds() {
    const R = canvasRef.current && canvasRef.current._R
    return R ? { w: R.W, h: R.H } : { w: 320, h: 420 }
  }

  /**
   * 读数快照：供 CircuitReadoutPanel 轮询
   * 全部数值来自同一份 MNA 解，所以面板、表盘、粒子速度三者天然同步。
   */
  const buildReadout = useCallback(() => {
    const s = S.current
    const er = solveSceneCircuit()
    const res = er && er.ok && er.results ? er.results : null
    const short = !!(er.diagnostics && er.diagnostics.short)
    const bat = s.components.find(c => c.type === 'battery')
    const batRes = res && bat ? res.get(bat.id) : null
    const totalCurrent = batRes ? Math.abs(batRes.current) : 0
    const totalVoltage = bat ? batteryVoltage(bat) : 0

    // 各元件读数（表类显示它自己量到的量，其余显示真实端电压/电流）
    const nameOf = { battery: '电源', bulb: '灯泡', switch: '开关', resistor: '定值电阻', rheostat: '滑动变阻器', ammeter: '电流表', voltmeter: '电压表', multimeter: '万用表' }
    const colorOf = { battery: '#7ce8b0', bulb: '#ffd166', rheostat: '#ffa94d', ammeter: '#ff8a80', voltmeter: '#8ce99a' }
    const rows = s.components
      .filter(c => c.type !== 'switch')
      .map(c => {
        const r = res ? res.get(c.id) : null
        return {
          id: c.id,
          name: nameOf[c.type] || c.type,
          color: colorOf[c.type],
          U: r ? Math.abs(r.voltage) : 0,
          I: r ? Math.abs(r.current) : 0,
          P: r ? Math.abs(r.power) : 0,
        }
      })

    const state = short
      ? { text: '短路', color: '#ff4b3e' }
      : er.ok
        ? { text: totalCurrent > 1e-4 ? '通路' : '无电流', color: totalCurrent > 1e-4 ? '#3ddc84' : '#ffb020' }
        : { text: '断路', color: '#ffb020' }

    return {
      rows,
      total: {
        voltage: totalVoltage,
        current: totalCurrent,
        resistance: totalCurrent > 1e-6 ? totalVoltage / totalCurrent : 0,
        power: totalVoltage * totalCurrent,
      },
      state,
    }
  }, [])

  const handleReset = useCallback(() => {
    const s = S.current
    s.components = []; s.wires = []; s.switchClosed = false; s.dragId = null; s.connecting = null; s.dropTarget = null; s.dragProbe = null
    s._flow.clear()
    resetNeedles()      // 指针归零
    invalidateCircuit()
    setEditingId(null)
    dataIUStore = []; dataIRStore = []
    forceUpdate(n => n + 1)
  }, [])

  // 参数面板要编辑的元件（始终从实时数据里取，避免拿到过期副本）
  const editingComp = editingId != null
    ? S.current.components.find(c => c.id === editingId) || null
    : null

  // 结论：有数据就用拟合斜率/相对误差说话，数据不足才退回引导语
  const conclStep1 = S.current.step === 1
  const conclData = tab === 1 ? (conclStep1 ? dataIUStore : dataIRStore) : []
  const conclAn = tab === 1
    ? (conclStep1 ? analyzeIU(dataIUStore, S.current.R) : analyzeIR(dataIRStore, S.current.U))
    : null
  const hasFit = !!(conclAn && conclAn.fit && conclAn.n >= 2)
  const conclPhenomenon = tab === 2
    ? '自己动手测出 U、I、R，验证 I = U/R。'
    : hasFit
      ? (conclStep1
        ? `I-U 图线性拟合 k=${conclAn.fit.k.toFixed(3)} A/V，R²=${conclAn.fit.r2.toFixed(3)}，1/k=${conclAn.fit.k > 1e-9 ? (1 / conclAn.fit.k).toFixed(2) : '∞'} Ω；R 平均=${conclAn.avgR.toFixed(2)} Ω，相对误差 ${conclAn.err.toFixed(1)}%。R 一定时，I 与 U 成正比。`
        : `I-1/R 图线性拟合 k=${conclAn.fit.k.toFixed(2)} V，R²=${conclAn.fit.r2.toFixed(3)}；U 平均=${conclAn.avgU.toFixed(2)} V，相对误差 ${conclAn.err.toFixed(1)}%。U 一定时，I 与 1/R 成正比。`)
      : (conclStep1 ? 'R 不变时，电压越大电流越大，I-U 近似过原点直线。' : 'U 不变时，电阻越大电流越小，I 与 1/R 成正比。')

  return (
    <SceneShell
      title="探究电流与电压、电阻的关系"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t) }}
      tab1Label="📖 控制变量法"
      tab2Label="🔧 自己动手"
      onReset={handleReset}
      conclusionOpen={conclusionOpen}
      onConclusionToggle={() => setConclusionOpen(o => !o)}
      conclusion={{
        title: '查看结论',
        phenomenon: conclPhenomenon,
        dataRows: conclData.slice(-8).map(r =>
          conclStep1
            ? { U: r.U.toFixed(2), I: r.I.toFixed(2) }
            : { R: r.R, I: r.I.toFixed(2) }
        ),
        formula: tab === 1 && conclStep1 ? 'I ∝ U（R 一定）' : tab === 1 ? 'I ∝ 1/R（U 一定）' : 'I = U / R',
        summary: tab === 1
          ? (hasFit
            ? `基于 ${conclAn.n} 组数据拟合，R²=${conclAn.fit.r2.toFixed(3)}，I 与 ${conclStep1 ? 'U' : '1/R'} 的线性关系成立。`
            : '控制变量法：只改变一个量，观察电流如何变化。')
          : '多测几组数据，作 I-U 或 I-1/R 图像可验证正比关系。',
      }}      toolbarExtra={tab === 1 ? (
        <>
          <span style={styles.sep} />
          <label style={styles.lbl}>电源U：<input type="range" min="1" max="12" step="0.5" value={S.current.U}
            onChange={(e) => { S.current.U = parseFloat(e.target.value); forceUpdate(n => n + 1) }} style={styles.slider} /><span style={styles.val}>{S.current.U.toFixed(1)}V</span></label>
          <label style={styles.lbl}>R：<input type="range" min="5" max="50" step="1" value={S.current.R}
            onChange={(e) => { const v = parseInt(e.target.value); S.current.R = v; S.current.R_slider = v; forceUpdate(n => n + 1) }} style={styles.slider} /><span style={styles.val}>{S.current.R}Ω</span></label>
          <label style={styles.lbl}>滑动变阻器：<input type="range" min="0" max="50" step="1" value={S.current.sliderR} disabled={S.current.step === 2}
            onChange={(e) => { S.current.sliderR = parseInt(e.target.value); forceUpdate(n => n + 1) }} style={styles.slider} /><span style={styles.val}>{S.current.sliderR}Ω{S.current.step === 2 ? '（锁0）' : ''}</span></label>
          <label style={styles.lbl}>
            <input type="checkbox" checked={S.current.smooth}
              onChange={(e) => { S.current.smooth = e.target.checked; forceUpdate(n => n + 1) }} />
            平滑显示
          </label>
        </>
      ) : (
        // 自己动手页：仿真控制 + 编辑操作 + 电流可视化
        <>
          <button type="button" style={styles.btnMini}
            onClick={togglePause}>
            {S.current.paused ? '▶ 仿真：运行' : '⏸ 仿真：暂停'}
          </button>
          <button type="button" style={styles.btnMini} onClick={undo}>↩ 撤销</button>
          <button type="button" style={styles.btnMini} onClick={clearBench}>🗑 清空桌面</button>
          <span style={styles.sep} />
          <button type="button" style={styles.btnMini} onClick={saveCircuit}>💾 保存</button>
          <button type="button" style={styles.btnMini} onClick={loadCircuit}>📂 载入</button>
          <button type="button" style={styles.btnMini} onClick={exportPNG}>🖼 导出电路图</button>
          <span style={styles.sep} />
          <button type="button" style={styles.btnMini}
            onClick={() => { S.current.showFlow = !S.current.showFlow; forceUpdate(n => n + 1) }}>
            {S.current.showFlow ? '● 电流粒子：开' : '○ 电流粒子：关'}
          </button>
          <button type="button" style={styles.btnMini}
            onClick={() => { S.current.flowMode = S.current.flowMode === 'e' ? 'I' : 'e'; forceUpdate(n => n + 1) }}>
            {S.current.flowMode === 'e' ? '方向：电子 e⁻' : '方向：电流 I'}
          </button>
          <button type="button" style={styles.btnMini}
            onClick={() => {
              const s = S.current
              pushHistory()
              s.wires = []
              s._flow.clear()
              invalidateCircuit()
              forceUpdate(n => n + 1)
            }}>
            清除全部导线
          </button>
          <button type="button" style={styles.btnMini}
            onClick={() => {
              resetNeedles()
              forceUpdate(n => n + 1)
            }}>
            指针回零
          </button>
        </>
      )}
      desc={(
        <>
          <b>探究欧姆定律 I=U/R</b>
          <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
            {tab === 1 ? '控制变量法：①R不变改变U→I∝U ②U不变改变R→I∝1/R' : '从右侧器材栏添加元件，双击元件可改参数'}
          </span>
        </>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'row', flex: 1, minHeight: 0, width: '100%' }}>
        {/* 画布 + 浮层（读数面板 / 参数面板都挂在同一个定位容器里） */}
        <div style={{ position: 'relative', flex: 1, minWidth: 0, minHeight: 0, display: 'flex' }}>
          <canvas
            ref={canvasRef}
            className="canvas-fill" style={{ width: '100%', flex: 1, minHeight: 0, display: 'block', touchAction: 'none' }}
            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
            onContextMenu={handleContextMenu} onDoubleClick={handleDoubleClick}
          />
          {tab === 2 && <CircuitReadoutPanel getSnapshot={buildReadout} />}
          {tab === 2 && editingComp && (
            <ComponentParamPanel
              comp={editingComp}
              anchor={anchor}
              bounds={canvasBounds()}
              onChange={handleParamChange}
              onDelete={() => deleteComp(editingComp.id)}
              onClose={() => setEditingId(null)}
            />
          )}
          {/* 右键菜单：拆开看内部结构 / 复制 / 删除 */}
          {tab === 2 && ctxMenu && (
            <ContextMenu
              x={ctxMenu.x}
              y={ctxMenu.y}
              items={ctxMenu.items}
              onClose={() => setCtxMenu(null)}
            />
          )}
          {/* 拆开看内部结构（核心功能）：DOM 浮层 + 剖视图 */}
          {tab === 2 && internal && (
            <InternalPanel
              type={internal.type}
              anchor={internal.anchor}
              bounds={canvasBounds()}
              onClose={() => setInternal(null)}
            />
          )}
          {/* 轻量提示 */}
          {toast && (
            <div style={{
              position: 'absolute', left: '50%', bottom: 18, transform: 'translateX(-50%)',
              padding: '7px 16px', borderRadius: 999, zIndex: 70, pointerEvents: 'none',
              background: 'rgba(28,32,38,0.92)', color: '#e6edf3', fontSize: 12.5,
              border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
            }}>{toast}</div>
          )}
        </div>
        {tab === 1 ? (
          <InfoDock
            purpose="探究电流与电压、电阻的关系（控制变量法）。"
            steps={[
              '① R不变，改变U，记录 I，看 I-U 图',
              '② U不变，改变R，记录 I，看 I-R 图',
              '闭合开关 → 调参 → 点「记录」',
            ]}
            hint="U_R 为定值电阻两端电压（断开=0）。① 调滑动变阻器改变 U_R；② 变阻器锁 0Ω，改 R 保持 U 不变。电表读数按分度估读，可导出 CSV。"
          />
        ) : (
          <InfoDock
            hint="点器材栏添加元件 → 点接线柱拖出导线（靠近自动吸附）→ 轻点开关通断。双击元件改参数，右键删除元件/导线。"
            hintTitle="操作说明"
          />
        )}
        {tab === 2 && (
          <BuilderPalette side="right"
            items={[
              { type: 'battery', name: '电源', icon: '🔋' },
              { type: 'bulb', name: '灯泡', icon: '💡' },
              { type: 'switch', name: '开关', icon: '🔌' },
              { type: 'resistor', name: '电阻', icon: '⚡' },
              { type: 'rheostat', name: '滑变', icon: '🔧' },
              { type: 'ammeter', name: '电流表', icon: 'Ⓐ' },
              { type: 'voltmeter', name: '电压表', icon: 'Ⓥ' },
              { type: 'multimeter', name: '万用表', icon: 'DC' },
            ]}
            wireColor={S.current.wireColor}
            onPickColor={(c) => { S.current.wireColor = c; forceUpdate(n => n + 1) }}
            onAdd={(type) => {
              const s = S.current
              pushHistory()
              const r = canvasRef.current.getBoundingClientRect()
              const n = s.components.length
              const id = s.nextId++
              const nx = r.width * 0.35 + (n % 3) * 90
              const ny = r.height * 0.4 + (Math.floor(n / 3) % 3) * 80
              // 万用表出厂自带红黑表笔（收在插孔上）；其余元件用统一出厂参数
              const props = type === 'multimeter' ? (() => {
                const body = { x: nx, y: ny, rotation: 0 }
                return { mode: 'V', probes: { R: resetProbe(body, 'R'), B: resetProbe(body, 'B') } }
              })() : defaultProps(type)
              s.components.push({ id, type, x: nx, y: ny, rotation: 0, closed: type === 'switch' ? false : true, props })
              s.dragId = id; s.dragOffX = 0; s.dragOffY = 0
              s.guideDismissed = true
              invalidateCircuit()
              forceUpdate(v => v + 1)
            }}
            hint="左右滑动选器材"
          />
        )}
      </div>
    </SceneShell>
  )
}

const styles = {
  sep: { width: 1, height: 20, background: '#ddd' },
  lbl: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#666' },
  slider: { width: 70, accentColor: '#4A90D9' },
  val: { color: '#4A90D9', fontWeight: 600, minWidth: 35, fontSize: 12 },
  btnMini: {
    padding: '5px 9px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
    background: '#fff', color: '#37474f',
    border: '1px solid #d0d7de', borderRadius: 7,
  },
}
