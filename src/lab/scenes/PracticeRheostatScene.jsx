/**
 * PracticeRheostatScene — 练习使用滑动变阻器
 *
 * 对齐 NOBOOK「练习使用滑动变阻器」实验器材与物理逻辑：
 *   器材：干电池 / 电池组 · 开关 · 滑动变阻器 · 标准灯泡 · 随温度变化灯泡
 *         标准电流表 · 标准电压表
 *   物理：四接线柱「一上一下」限流接法 · 闭合前滑片置最大阻值
 *         I = U / (R灯 + R滑 + r) · 灯泡亮度随功率 · 随温度变化灯泡 R(T) 非线性
 *
 * Tab1 规范练习：预连标准串联电路（E1–S1–R1–A1–L1），电压表并联灯泡
 * Tab2 自己动手：拖器材、点接线柱连线、双击读数、右键删除
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { eventToCanvas } from '../utils/pointerPos'
import SceneShell from '../ui/SceneShell'
import BuilderPalette from '../ui/BuilderPalette'
import { fitLayout, drawPanel } from '../ui/canvasLayout'
import {
  getTerminals,
  strokeBezierWire, strokeWirePreview, bezierCtrl,
  drawTerminal, findCompAt, findCompWide,
  drawRealBattery, drawRealSwitch, drawRealRheostat, drawRealMeter,
  drawRealResistor, drawWorkspace, drawReadoutChip, meterRange,
} from '../ui/circuitKit'
import { CircuitGraph, CircuitSolver } from '../engine'
import { drawInternal } from '../render/internals.js'

const RHEO_MAX = 20 // 教学滑动变阻器常见铭牌「20Ω 2A」
const RHEO_RATING = '20Ω 2A'

/** 出厂参数 */
function defaultProps(type) {
  switch (type) {
    case 'battery': return { voltage: 3, cells: 2 }           // 电池组 2×1.5V
    case 'bulb': return { resistance: 10, ratedV: 2.5, tempDep: false }
    case 'bulbTemp': return { resistance: 8, ratedV: 2.5, tempDep: true }
    case 'resistor': return { resistance: 10 }
    case 'rheostat': return { resistance: RHEO_MAX, maxR: RHEO_MAX }
    case 'ammeter': return { range: 0.6 }
    case 'voltmeter': return { range: 3 }
    default: return {}
  }
}

/** 随温度变化灯泡：R 随功率上升（灯丝变热电阻变大），冷态约 1/3 热态 */
function tempBulbResistance(baseR, power) {
  const cold = baseR * 0.35
  const hot = baseR
  const t = Math.max(0, Math.min(1, Math.sqrt(Math.max(0, power) / 1.2)))
  return cold + (hot - cold) * t
}

/** 灯泡显示亮度：√(P/P额)，电流 0 → 全灭 */
function displayBrightness(power, ratedV, R) {
  const Prated = (ratedV * ratedV) / Math.max(R, 0.1)
  if (Prated <= 0) return 0
  return Math.max(0, Math.min(1, Math.sqrt(Math.max(0, power) / Prated)))
}

/** 接入阻值：一上一下=滑片对应值；两下=最大；两上=0 */
function effectiveRheoR(comp, wires) {
  const maxR = comp.props?.maxR ?? RHEO_MAX
  const sliderR = typeof comp.props?.resistance === 'number' ? comp.props.resistance : maxR
  // 四柱：0=左下 1=右下 2=左上 3=右上
  const used = new Set()
  for (const w of wires) {
    if (w.from.compId === comp.id) used.add(w.from.termIdx)
    if (w.to.compId === comp.id) used.add(w.to.termIdx)
  }
  if (used.size < 2) return sliderR
  const lowers = [...used].filter(i => i < 2)
  const uppers = [...used].filter(i => i >= 2)
  if (lowers.length === 2) return maxR
  if (uppers.length === 2) return 0
  if (lowers.length === 1 && uppers.length === 1) {
    // 一上一下：接入左下 → 滑片到右端阻值最大；接右下则相反
    return lowers[0] === 0 ? sliderR : Math.max(0, maxR - sliderR)
  }
  return sliderR
}

/** 滑片在本地坐标 x（与 drawRealRheostat / parts.rheostatSliderX 一致） */
function rheoSliderX(R, maxR = RHEO_MAX) {
  const ratio = Math.max(0, Math.min(1, (R || 0) / maxR))
  return -28 + ratio * 56
}

/** 四接线柱本地坐标：下左/下右/上左/上右 */
function rheoTerminalLocal() {
  return [
    { x: -40, y: 4 },
    { x: 40, y: 4 },
    { x: -34, y: -18 },
    { x: 34, y: -18 },
  ]
}

/** 元件端子（支持滑变四柱 / 灯泡底部两柱） */
function compTerminals(comp) {
  if (comp.type === 'rheostat') {
    const c = Math.cos(comp.rotation || 0), s = Math.sin(comp.rotation || 0)
    return rheoTerminalLocal().map(p => ({
      x: comp.x + p.x * c - p.y * s,
      y: comp.y + p.x * s + p.y * c,
    }))
  }
  if (comp.type === 'bulb' || comp.type === 'bulbTemp') {
    const c = Math.cos(comp.rotation || 0), s = Math.sin(comp.rotation || 0)
    return [{ x: -20, y: 16 }, { x: 20, y: 16 }].map(p => ({
      x: comp.x + p.x * c - p.y * s,
      y: comp.y + p.x * s + p.y * c,
    }))
  }
  return getTerminals(comp)
}

/** 滑变用户端子 → 引擎两端口 0/1（有效两极） */
function mapRheoPort(comp, termIdx, wires) {
  const used = new Set()
  for (const w of wires) {
    if (w.from.compId === comp.id) used.add(w.from.termIdx)
    if (w.to.compId === comp.id) used.add(w.to.termIdx)
  }
  const lowers = [...used].filter(i => i < 2)
  const uppers = [...used].filter(i => i >= 2)
  if (lowers.length === 2 && uppers.length === 0) {
    return termIdx === 0 ? 0 : 1
  }
  if (uppers.length === 2 && lowers.length === 0) {
    return termIdx === 2 ? 0 : 1
  }
  // 一上一下 / 其它：下→0，上→1
  return termIdx < 2 ? 0 : 1
}

export default function PracticeRheostatScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    switchClosed: false,
    time: 0,
    // Tab1
    sliderR: RHEO_MAX,
    dispI: 0, dispU: 0,
    data: [],
    // Tab2
    components: [],
    wires: [],
    dragId: null,
    dragOffX: 0,
    dragOffY: 0,
    dragMoved: false,
    dragStart: null,
    connecting: null,
    hoverTerm: null,
    nextId: 1,
    wireColor: '#F44336',
    readout: null,
    toast: null,
    guideDismissed: false,
  })

  const [tab, setTab] = useState(1)
  const [, forceUpdate] = useState(0)
  const [internal, setInternal] = useState(null) // {type,title}

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const R = {
      canvas, ctx: canvas.getContext('2d'), W: 0, H: 0,
      resize() {
        const rect = { width: canvas.clientWidth, height: canvas.clientHeight }
        canvas.width = rect.width * devicePixelRatio
        canvas.height = rect.height * devicePixelRatio
        this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
        this.W = rect.width; this.H = rect.height
      },
    }
    R.resize(); canvas._R = R
    const loop = () => {
      S.current.time += 1 / 60
      render(R)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    const onResize = () => R.resize()
    window.addEventListener('resize', onResize)
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  // ─────────────── 求解 ───────────────
  function solveTab1() {
    const s = S.current
    const U = 3, Rbulb0 = 10, r = 0
    let Rbulb = Rbulb0
    if (!s.switchClosed) return { ok: true, I: 0, Ubulb: 0, Urheo: 0, Pbulb: 0, Rbulb, total: Rbulb + s.sliderR }
    // 随温度变化：迭代 2 次即可收敛到教学精度
    for (let k = 0; k < 2; k++) {
      const Rtot = Rbulb + s.sliderR + r
      const I = U / Rtot
      const P = I * I * Rbulb
      Rbulb = tempBulbResistance(Rbulb0, P)
    }
    const Rtot = Rbulb + s.sliderR + r
    const I = U / Rtot
    const Ubulb = I * Rbulb
    const Urheo = I * s.sliderR
    return { ok: true, I, Ubulb, Urheo, Pbulb: I * I * Rbulb, Rbulb, total: Rtot }
  }

  function solveDesk() {
    const s = S.current
    // 先按接线方式算滑变有效阻
    for (const c of s.components) {
      if (c.type === 'rheostat') {
        const eff = effectiveRheoR(c, s.wires)
        c.props = { ...c.props, effectiveR: eff }
      }
    }
    if (!s.components.length) {
      return { ok: false, reason: '从右侧器材栏点选元件放到桌面', results: new Map() }
    }
    const g = new CircuitGraph()
    for (const comp of s.components) {
      const props = { ...(comp.props || {}) }
      if (comp.type === 'bulb' || comp.type === 'bulbTemp') {
        props.resistance = typeof comp.props?.resistance === 'number' ? comp.props.resistance : 10
        if (comp.type === 'bulbTemp') {
          // 用上次功率近似更新（单次求解足够教学演示）
          props.resistance = tempBulbResistance(props.resistance, comp._lastP || 0)
        }
      }
      if (comp.type === 'rheostat') props.resistance = comp.props?.effectiveR ?? comp.props?.resistance ?? RHEO_MAX
      if (comp.type === 'resistor') props.resistance = comp.props?.resistance ?? 10
      if (comp.type === 'switch') props.closed = comp.closed !== false
      if (comp.type === 'battery') props.voltage = comp.props?.voltage ?? 3
      // bulbTemp 映射为 bulb 求解
      const t = comp.type === 'bulbTemp' ? 'bulb' : comp.type
      g.addComponent(t, comp.x, comp.y, props, comp.id)
    }
    for (const wire of s.wires) {
      const mapPort = (compId, termIdx) => {
        const c = s.components.find(k => k.id === compId)
        if (c && c.type === 'rheostat') return mapRheoPort(c, termIdx, s.wires)
        return termIdx
      }
      g.addWire(
        { componentId: wire.from.compId, portIndex: mapPort(wire.from.compId, wire.from.termIdx) },
        { componentId: wire.to.compId, portIndex: mapPort(wire.to.compId, wire.to.termIdx) },
      )
    }
    try {
      const v = g.validate()
      const info = g.getCircuitInfo()
      const solver = new CircuitSolver()
      const results = solver.solve(info)
      // 更新随温度灯泡功率缓存
      for (const c of s.components) {
        if (c.type === 'bulbTemp') {
          const r = results.get(c.id)
          if (r) c._lastP = r.power
        }
      }
      if (!v.ok) return { ok: false, reason: v.reason, results }
      return { ok: true, reason: v.reason, results }
    } catch (e) {
      return { ok: false, reason: '求解失败：' + (e.message || e), results: new Map() }
    }
  }

  // ─────────────── 绘制 ───────────────
  function render(R) {
    const ctx = R.ctx, W = R.W, H = R.H
    ctx.clearRect(0, 0, W, H)
    // 深灰纯色实验台（对标 NB）
    ctx.fillStyle = '#53585F'
    ctx.fillRect(0, 0, W, H)
    canvasRef.current._clickAreas = []
    canvasRef.current._palAreas = []
    if (S.current.tab === 1) renderPractice(ctx, W, H)
    else renderBuilder(ctx, W, H)
  }

  // ── Tab1 规范练习 ──
  function renderPractice(ctx, W, H) {
    const s = S.current
    const lay = fitLayout(W, H)
    const sol = solveTab1()
    // 平滑显示
    s.dispI += (sol.I - s.dispI) * 0.15
    s.dispU += (sol.Ubulb - s.dispU) * 0.15

    // 工作台
    drawWorkspace(ctx, lay.circuit)
    // fitLayout.circuit 是 {L,R,T,B}，drawPanel 要 {x,y,w,h}
    const cRect = {
      x: lay.circuit.L, y: lay.circuit.T,
      w: lay.circuit.R - lay.circuit.L, h: lay.circuit.B - lay.circuit.T,
    }
    const box = drawPanel(ctx, cRect, '规范练习 · 串联限流电路')
    const inner = { L: box.x, T: box.y, R: box.x + box.w, B: box.y + box.h }

    // 电路布局：矩形回路
    const cx = (inner.L + inner.R) / 2
    const cy = (inner.T + inner.B) / 2
    const lw = Math.min(inner.R - inner.L, 640) * 0.42
    const lh = Math.min(inner.B - inner.T, 360) * 0.28

    const batX = cx - lw, batY = cy + lh
    const swX = cx - lw * 0.2, swY = cy + lh
    const rheoX = cx + lw * 0.55, rheoY = cy - lh
    const amX = cx + lw, amY = cy
    const bulbX = cx - lw * 0.15, bulbY = cy - lh
    const volX = cx - lw * 0.15, volY = cy + lh * 0.15

    const wire = '#E8EEF4'
    const lwW = 2.2
    // 导线
    strokeLine(ctx, batX, batY, swX, swY, wire, lwW)
    strokeLine(ctx, swX, swY, amX, amY, wire, lwW)
    strokeLine(ctx, amX, amY, rheoX, rheoY, wire, lwW)
    strokeLine(ctx, rheoX, rheoY, bulbX, bulbY, wire, lwW)
    strokeLine(ctx, bulbX, bulbY, batX, batY, wire, lwW)
    // 电压表并联灯泡
    strokeLine(ctx, bulbX, bulbY, volX, volY, '#8CE99A', 1.6)
    strokeLine(ctx, volX, volY, batX, batY, '#8CE99A', 1.6)

    // 电流方向粒子
    if (s.switchClosed && sol.I > 0.001) {
      drawFlow(ctx, [
        { x: batX, y: batY }, { x: swX, y: swY }, { x: amX, y: amY },
        { x: rheoX, y: rheoY }, { x: bulbX, y: bulbY }, { x: batX, y: batY },
      ], s.time, sol.I)
    }

    // ── 元件 ──
    // 电源（电池组）
    drawRealBattery(ctx, batX, batY)
    drawReadoutChip(ctx, batX, batY + 28, 'E1  3V', '#7CE8B0', { font: 11 })
    label(ctx, '干电池组', batX, batY + 44)

    // 开关
    drawRealSwitch(ctx, swX, swY, s.switchClosed)
    drawReadoutChip(ctx, swX, swY + 28, s.switchClosed ? 'S1 闭合' : 'S1 断开', s.switchClosed ? '#8CE99A' : '#FF8A80', { font: 11 })
    canvasRef.current._clickAreas.push({
      x: swX - 36, y: swY - 20, w: 72, h: 44,
      onClick: () => {
        if (!s.switchClosed && s.sliderR < RHEO_MAX - 0.5) {
          toast('闭合开关前，滑片应移到阻值最大处！')
        }
        s.switchClosed = !s.switchClosed
        forceUpdate(n => n + 1)
      },
    })

    // 滑动变阻器
    drawRealRheostat(ctx, rheoX, rheoY, s.sliderR, RHEO_MAX, 1.15)
    drawReadoutChip(ctx, rheoX, rheoY - 36, `R1  ${s.sliderR}Ω`, '#FFA94D', { font: 11 })
    label(ctx, `滑动变阻器 ${RHEO_RATING}`, rheoX, rheoY + 36)
    // 四柱标注
    ctx.font = '9px sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.textAlign = 'center'
    ctx.fillText('C', rheoX - 34, rheoY - 24)
    ctx.fillText('D', rheoX + 34, rheoY - 24)
    ctx.fillText('A', rheoX - 42, rheoY + 18)
    ctx.fillText('B', rheoX + 42, rheoY + 18)
    // 滑片热区（kind 标记，供拖拽命中）
    canvasRef.current._clickAreas.push({
      kind: 'rheoSlider',
      x: rheoX - 40, y: rheoY - 32, w: 80, h: 40,
      onClick: (mx) => {
        const r = Math.max(0, Math.min(1, (mx - (rheoX - 28 * 1.15)) / (56 * 1.15)))
        s.sliderR = Math.round(r * RHEO_MAX)
        forceUpdate(n => n + 1)
      },
    })

    // 电流表
    drawRealMeter(ctx, amX, amY, {
      kind: 'A', value: s.dispI, max: meterRange('A', sol.I * 1.4), showValue: true,
    })
    drawReadoutChip(ctx, amX, amY + 42, `${s.dispI.toFixed(2)}A`, '#FF8A80', { font: 13, bold: true })
    label(ctx, '标准电流表 A1', amX, amY + 58)

    // 灯泡（随温度变化）
    const bright = displayBrightness(sol.Pbulb, 2.5, sol.Rbulb)
    drawBulb(ctx, bulbX, bulbY, bright)
    drawReadoutChip(ctx, bulbX + 50, bulbY - 10, `L1  R=${sol.Rbulb.toFixed(1)}Ω`, '#FFD166', { font: 10 })
    label(ctx, '随温度变化灯泡', bulbX - 10, bulbY - 36)

    // 电压表
    drawRealMeter(ctx, volX, volY, {
      kind: 'V', value: s.dispU, max: meterRange('V', sol.Ubulb * 1.4), showValue: true,
    })
    drawReadoutChip(ctx, volX, volY + 42, `${s.dispU.toFixed(2)}V`, '#8CE99A', { font: 13, bold: true })
    label(ctx, '标准电压表 V1', volX, volY + 58)

    // ── 右侧数据/步骤 ──
    const panel = lay.readout
    const pBox = drawPanel(ctx, panel, '观察与记录')
    const p = { L: pBox.x, T: pBox.y, R: pBox.x + pBox.w, B: pBox.y + pBox.h }
    let y = p.T + 8
    const line = (t, c = '#D7E0EA') => {
      ctx.font = '12px sans-serif'; ctx.fillStyle = c; ctx.textAlign = 'left'
      ctx.fillText(t, p.L + 6, y); y += 18
    }
    line(`电源电压 U = 3.0 V`)
    line(`滑动变阻器 R1 = ${s.sliderR} Ω（最大 ${RHEO_MAX}Ω）`)
    line(`电流 I = ${sol.I.toFixed(3)} A`, '#FF8A80')
    line(`灯泡电压 U_L = ${sol.Ubulb.toFixed(2)} V`, '#8CE99A')
    line(`变阻器电压 U_R = ${sol.Urheo.toFixed(2)} V`, '#FFA94D')
    line(`灯丝电阻 R_L = ${sol.Rbulb.toFixed(1)} Ω`, '#FFD166')
    line(`灯泡功率 P = ${sol.Pbulb.toFixed(3)} W`)
    y += 6
    line('步骤：', '#9ECBFF')
    line('① 认识四接线柱：上C/D、下A/B', '#B8C4D0')
    line('② 接线「一上一下」串入电路', '#B8C4D0')
    line('③ 闭合前滑片置于阻值最大', '#B8C4D0')
    line('④ 移动滑片，观察 I、U、亮度', '#B8C4D0')

    // 记录按钮
    const btnY = p.B - 40
    const btn = { x: p.L + 10, y: btnY, w: (p.R - p.L) - 20, h: 32 }
    roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 6)
    ctx.fillStyle = '#2F6FED'; ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('📝 记录这组数据', btn.x + btn.w / 2, btn.y + 20)
    canvasRef.current._clickAreas.push({
      ...btn,
      onClick: () => {
        if (!s.switchClosed) { toast('请先闭合开关'); return }
        s.data.push({ R: s.sliderR, I: +sol.I.toFixed(3), U: +sol.Ubulb.toFixed(2) })
        if (s.data.length > 8) s.data.shift()
        toast('已记录')
        forceUpdate(n => n + 1)
      },
    })

    // 数据表
    if (s.data.length) {
      const ty = btnY - 12 - s.data.length * 16
      ctx.font = '10px sans-serif'; ctx.textAlign = 'left'
      ctx.fillStyle = '#9ECBFF'
      ctx.fillText('R1(Ω)   I(A)    U_L(V)', p.L + 10, ty - 4)
      s.data.forEach((d, i) => {
        ctx.fillStyle = '#D7E0EA'
        ctx.fillText(`${String(d.R).padStart(4)}   ${d.I.toFixed(2)}    ${d.U.toFixed(2)}`, p.L + 10, ty + 12 + i * 16)
      })
    }

    // 底部提示
    hintBar(ctx, W, H, s.switchClosed
      ? '拖动橙色滑片改变接入阻值 · 观察电流表示数与灯泡亮度 · 电压表测灯泡两端'
      : '⚠ 闭合开关前，请把滑片移到阻值最大处（最右）')

    // 结论气泡
    if (s.switchClosed && s.sliderR < 3 && sol.I > 0.2) {
      // 大电流时提示
    }
  }

  // ── Tab2 自己动手 ──
  function renderBuilder(ctx, W, H) {
    const s = S.current
    const sol = solveDesk()

    // 桌面
    drawWorkspace(ctx, { L: 0, T: 0, R: W - 120, B: H })

    // 连接预览
    if (s.connecting) {
      const src = s.components.find(c => c.id === s.connecting.compId)
      if (src) {
        const f = compTerminals(src)[s.connecting.termIdx]
        strokeWirePreview(ctx, f, { x: s.connecting.mx, y: s.connecting.my }, s.wireColor, s.connecting.termIdx)
      }
    }

    // 导线
    for (const wire of s.wires) {
      const fc = s.components.find(c => c.id === wire.from.compId)
      const tc = s.components.find(c => c.id === wire.to.compId)
      if (!fc || !tc) continue
      const f = compTerminals(fc)[wire.from.termIdx]
      const t = compTerminals(tc)[wire.to.termIdx]
      strokeBezierWire(
        ctx, f, t, wire.color || '#1565C0',
        wire.mid1X != null ? { x: wire.mid1X, y: wire.mid1Y } : null,
        wire.mid2X != null ? { x: wire.mid2X, y: wire.mid2Y } : null,
        wire.from.termIdx, wire.to.termIdx,
      )
    }

    // 元件
    for (const comp of s.components) {
      drawComp(ctx, comp, s, sol)
    }

    // 读数卡
    if (s.readout) drawReadoutCard(ctx, s.readout)

    // Toast
    if (s.toast && performance.now() - s.toast.t < 2200) {
      const tw = Math.min(420, W - 40)
      const tx = (W - 120 - tw) / 2, ty = 16
      roundRect(ctx, tx, ty, tw, 34, 8)
      ctx.fillStyle = 'rgba(20,24,28,0.88)'; ctx.fill()
      ctx.fillStyle = '#FFE082'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(s.toast.msg, tx + tw / 2, ty + 21)
    }

    // 右侧器材栏（DOM BuilderPalette 叠在画布外，这里画状态条）
    const statusX = W - 116
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fillRect(statusX, 0, 116, H)
    ctx.font = '11px sans-serif'; ctx.fillStyle = '#B8C4D0'; ctx.textAlign = 'center'
    ctx.fillText('电路状态', statusX + 58, 22)
    if (sol.ok) {
      const bat = s.components.find(c => c.type === 'battery')
      const I = bat ? Math.abs(sol.results.get(bat.id)?.current || 0) : 0
      ctx.fillStyle = '#8CE99A'
      ctx.fillText('✓ 闭合回路', statusX + 58, 44)
      ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'
      ctx.fillText(`I ≈ ${I.toFixed(2)}A`, statusX + 58, 68)
    } else {
      ctx.fillStyle = '#FF8A80'
      wrapText(ctx, sol.reason || '…', statusX + 10, 44, 96, 14)
    }

    // 底部提示
    hintBar(ctx, W, H, s.guideDismissed
      ? '点接线柱拉导线 · 滑变要「一上一下」 · 轻点开关通断 · 双击看读数 · 右键删除'
      : '从右侧添加：干电池 → 开关 → 滑动变阻器 → 电流表 → 灯泡，电压表并联灯泡')

    // 引导完成条件
    if (!s.guideDismissed && sol.ok && s.components.some(c => c.type === 'rheostat') && s.components.some(c => c.type === 'bulb' || c.type === 'bulbTemp')) {
      // 不自动改 guideDismissed，留给用户点提示
    }
  }

  function drawComp(ctx, comp, s, sol) {
    const { x, y, type, rotation } = comp
    const dragging = s.dragId === comp.id
    ctx.save(); ctx.translate(x, y); ctx.rotate(rotation || 0)
    if (dragging) ctx.globalAlpha = 0.65

    if (type === 'battery') {
      drawRealBattery(ctx, 0, 0)
    } else if (type === 'switch') {
      drawRealSwitch(ctx, 0, 0, comp.closed !== false)
    } else if (type === 'rheostat') {
      // 滑片位置跟 props.resistance（物理位置）；有效接入阻值单独标注
      const slider = comp.props?.resistance ?? RHEO_MAX
      const eff = comp.props?.effectiveR ?? slider
      drawRealRheostat(ctx, 0, 0, slider, RHEO_MAX, 1.1)
      // 四柱小字
      ctx.font = '8px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.textAlign = 'center'
      ctx.fillText('C', -34, -24); ctx.fillText('D', 34, -24)
      ctx.fillText('A', -42, 18); ctx.fillText('B', 42, 18)
      ctx.fillStyle = '#FFA94D'; ctx.font = 'bold 9px sans-serif'
      ctx.fillText(`接入 ${eff}Ω`, 0, 34)
    } else if (type === 'resistor') {
      drawRealResistor(ctx, 0, 0, 1)
    } else if (type === 'ammeter' || type === 'voltmeter') {
      const kind = type === 'ammeter' ? 'A' : 'V'
      const rid = comp.id
      const r = sol.results.get(rid)
      const value = r ? Math.abs(r.current && kind === 'A' ? r.current : r.voltage) : 0
      const max = meterRange(kind, value * 1.3 || (kind === 'A' ? 0.6 : 3))
      drawRealMeter(ctx, 0, 0, { kind, value, max, showValue: true })
      if (r) {
        drawReadoutChip(ctx, 0, 42, kind === 'A' ? `${Math.abs(r.current).toFixed(2)}A` : `${Math.abs(r.voltage).toFixed(2)}V`,
          kind === 'A' ? '#FF8A80' : '#8CE99A', { font: 11, bold: true })
      }
    } else if (type === 'bulb' || type === 'bulbTemp') {
      const r = sol.results.get(comp.id)
      const power = r ? r.power : 0
      const R = comp.props?.resistance ?? 10
      const bright = displayBrightness(power, comp.props?.ratedV ?? 2.5, R)
      drawBulb(ctx, 0, 0, bright, type === 'bulbTemp')
    }
    ctx.globalAlpha = 1
    ctx.restore()

    // 端子
    const terms = compTerminals(comp)
    for (let i = 0; i < terms.length; i++) {
      const t = terms[i]
      const hov = s.hoverTerm && s.hoverTerm.compId === comp.id && s.hoverTerm.termIdx === i
      const src = s.connecting && s.connecting.compId === comp.id && s.connecting.termIdx === i
      drawTerminal(ctx, t, hov, src)
    }

    // 名称标签
    const names = {
      battery: '电源', switch: '开关', rheostat: '滑变',
      bulb: '灯泡', bulbTemp: '随温度灯泡', resistor: '电阻',
      ammeter: '电流表', voltmeter: '电压表',
    }
    ctx.font = '10px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.textAlign = 'center'
    ctx.fillText(names[type] || type, x, y + (type === 'bulb' || type === 'bulbTemp' ? 40 : 36))
  }

  function drawReadoutCard(ctx, ro) {
    const w = 200, h = 78
    const x = Math.min(ro.x, (canvasRef.current._R?.W || 800) - w - 8)
    const y = Math.min(ro.y, (canvasRef.current._R?.H || 600) - h - 8)
    roundRect(ctx, x, y, w, h, 8)
    ctx.fillStyle = 'rgba(18,22,28,0.92)'; ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.stroke()
    ctx.fillStyle = '#9ECBFF'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText(ro.title, x + 12, y + 22)
    ctx.fillStyle = '#E8EEF4'; ctx.font = '13px sans-serif'
    ro.lines.forEach((ln, i) => ctx.fillText(ln, x + 12, y + 42 + i * 18))
  }

  // ─────────────── 小工具绘制 ───────────────
  function strokeLine(ctx, x1, y1, x2, y2, c, w) {
    ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    ctx.lineCap = 'butt'
  }
  function label(ctx, t, x, y) {
    ctx.font = '10px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.textAlign = 'center'; ctx.fillText(t, x, y)
  }
  function hintBar(ctx, W, H, text) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(0, H - 28, W, 28)
    ctx.fillStyle = '#D7E0EA'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(text, W / 2, H - 10)
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r)
  }
  function wrapText(ctx, text, x, y, maxW, lh) {
    let line = '', yy = y
    for (const ch of text) {
      if (ctx.measureText(line + ch).width > maxW) {
        ctx.fillText(line, x, yy); yy += lh; line = ch
      } else line += ch
    }
    if (line) ctx.fillText(line, x, yy)
  }
  function toast(msg) {
    S.current.toast = { msg, t: performance.now() }
  }

  function drawBulb(ctx, x, y, brightness, tempDep = false) {
    ctx.save(); ctx.translate(x, y)
    const lit = brightness > 0.03
    // 玻璃泡
    const g = ctx.createRadialGradient(0, -8, 4, 0, -8, 22)
    if (lit) {
      g.addColorStop(0, `rgba(255,236,160,${0.55 + 0.4 * brightness})`)
      g.addColorStop(1, `rgba(255,200,80,${0.15 + 0.25 * brightness})`)
    } else {
      g.addColorStop(0, 'rgba(220,230,240,0.25)')
      g.addColorStop(1, 'rgba(180,190,200,0.12)')
    }
    ctx.fillStyle = g
    ctx.strokeStyle = lit ? '#F9A825' : '#90A4AE'
    ctx.lineWidth = 1.6
    ctx.beginPath(); ctx.arc(0, -8, 18, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    // 灯丝
    ctx.strokeStyle = lit ? '#FF6F00' : '#78909C'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(-7, 2); ctx.lineTo(-4, -8); ctx.lineTo(0, -2); ctx.lineTo(4, -12); ctx.lineTo(7, -2)
    ctx.stroke()
    // 灯座
    ctx.fillStyle = '#90A4AE'; ctx.strokeStyle = '#607D8B'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(-9, 8, 18, 12, 2); ctx.fill(); ctx.stroke()
    // 光晕
    if (lit) {
      const glow = ctx.createRadialGradient(0, -8, 10, 0, -8, 48)
      glow.addColorStop(0, `rgba(255,220,100,${0.18 + 0.32 * brightness})`)
      glow.addColorStop(1, 'rgba(255,220,100,0)')
      ctx.fillStyle = glow
      ctx.beginPath(); ctx.arc(0, -8, 48, 0, Math.PI * 2); ctx.fill()
    }
    if (tempDep) {
      ctx.fillStyle = 'rgba(255,180,80,0.85)'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('R(T)', 0, 30)
    }
    ctx.restore()
  }

  function drawFlow(ctx, pts, time, I) {
    const speed = Math.min(2.2, 0.4 + Math.abs(I) * 12)
    const n = 5
    for (let i = 0; i < n; i++) {
      const t = ((time * speed + i / n) % 1)
      const p = pathPoint(pts, t)
      if (!p) continue
      const a = 0.35 + 0.5 * Math.min(1, Math.abs(I) * 4)
      ctx.fillStyle = `rgba(120,200,255,${a})`
      ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2); ctx.fill()
    }
  }
  function pathPoint(pts, t) {
    // 折线均匀取点
    let total = 0
    const segs = []
    for (let i = 0; i < pts.length - 1; i++) {
      const d = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y)
      segs.push(d); total += d
    }
    if (total <= 0) return null
    let dist = t * total
    for (let i = 0; i < segs.length; i++) {
      if (dist <= segs[i]) {
        const r = segs[i] ? dist / segs[i] : 0
        return {
          x: pts[i].x + (pts[i + 1].x - pts[i].x) * r,
          y: pts[i].y + (pts[i + 1].y - pts[i].y) * r,
        }
      }
      dist -= segs[i]
    }
    return pts[pts.length - 1]
  }

  // ─────────────── 交互 ───────────────
  const getPos = (e) => eventToCanvas(canvasRef.current, e)

  /** Tab1 滑片热区（与 renderPractice 里 clickAreas 同源） */
  function tab1SliderHit(x, y) {
    for (const a of canvasRef.current._clickAreas || []) {
      if (a.kind === 'rheoSlider' && x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) {
        return true
      }
    }
    return false
  }

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    const s = S.current
    const { x, y } = getPos(e)

    if (s.tab === 1) {
      // 滑片优先：命中则进入拖拽（连续调阻）
      if (tab1SliderHit(x, y)) {
        s._tab1DraggingSlider = true
        updateTab1Slider(x)
        return
      }
      for (const a of canvasRef.current._clickAreas) {
        if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) {
          a.onClick(x, y); return
        }
      }
      return
    }

    // Tab2
    const term = findTermAtCustom(s.components, x, y)
    if (term) {
      s.connecting = { ...term, mx: x, my: y }
      s.dragMoved = false
      forceUpdate(n => n + 1)
      return
    }
    // 滑变滑片
    for (const comp of s.components) {
      if (comp.type !== 'rheostat') continue
      const cos = Math.cos(comp.rotation || 0), sin = Math.sin(comp.rotation || 0)
      const dx = x - comp.x, dy = y - comp.y
      const lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos
      const R = comp.props?.effectiveR ?? comp.props?.resistance ?? RHEO_MAX
      const sliderX = rheoSliderX(R, RHEO_MAX)
      if (Math.abs(lx - sliderX) < 16 && ly > -28 && ly < 0) {
        s.dragId = 'rheo_' + comp.id
        s.dragMoved = false; s.dragStart = { x, y }
        forceUpdate(n => n + 1)
        return
      }
    }
    // 导线控制点
    for (const wire of s.wires) {
      const fc = s.components.find(c => c.id === wire.from.compId)
      const tc = s.components.find(c => c.id === wire.to.compId)
      if (!fc || !tc) continue
      const f = compTerminals(fc)[wire.from.termIdx]
      const t = compTerminals(tc)[wire.to.termIdx]
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
    const comp = findCompAt(s.components, x, y)
    if (comp) {
      s.dragId = comp.id
      s.dragOffX = x - comp.x; s.dragOffY = y - comp.y
      s.dragMoved = false; s.dragStart = { x, y }
      forceUpdate(n => n + 1)
    }
  }, [])

  const handleMouseMove = useCallback((e) => {
    const s = S.current
    const { x, y } = getPos(e)

    if (s.tab === 1) {
      // 拖滑片：若按住左键在变阻器附近
      if (e.buttons === 1) {
        const cv = canvasRef.current._R
        if (cv) {
          // 简化：在整个上半区横向拖动调节（教学足够）
          // 更精确：只在 slider 热区附近
        }
      }
      return
    }

    if (s.dragId) {
      if (typeof s.dragId === 'string' && s.dragId.startsWith('rheo_')) {
        const id = parseInt(s.dragId.slice(5), 10)
        const c = s.components.find(k => k.id === id)
        if (c) {
          const cos = Math.cos(c.rotation || 0), sin = Math.sin(c.rotation || 0)
          const dx = x - c.x, dy = y - c.y
          const lx = dx * cos + dy * sin
          const r = Math.max(0, Math.min(1, (lx - (-28)) / 56))
          c.props = { ...c.props, resistance: Math.round(r * RHEO_MAX) }
          s.dragMoved = true
        }
        return
      }
      if (typeof s.dragId === 'string' && s.dragId.startsWith('wire_')) {
        const parts = s.dragId.split('_')
        const wireId = parseInt(parts[1])
        const rivetIdx = parseInt(parts[2])
        const wire = s.wires.find(w => w.id === wireId)
        if (wire) {
          if (s.dragStart && Math.hypot(x - s.dragStart.x, y - s.dragStart.y) > 5) s.dragMoved = true
          if (rivetIdx === 1) { wire.mid1X = x; wire.mid1Y = y }
          else { wire.mid2X = x; wire.mid2Y = y }
        }
        return
      }
      const c = s.components.find(k => k.id === s.dragId)
      if (c) {
        if (s.dragStart && Math.hypot(x - s.dragStart.x, y - s.dragStart.y) > 5) s.dragMoved = true
        c.x = x - s.dragOffX; c.y = y - s.dragOffY
      }
      return
    }
    if (s.connecting) {
      s.connecting.mx = x; s.connecting.my = y
      s.hoverTerm = findTermNearCustom(s.components, x, y, s.connecting.compId)
      return
    }
    s.hoverTerm = findTermAtCustom(s.components, x, y)
    canvasRef.current.style.cursor = s.hoverTerm ? 'crosshair' : findCompAt(s.components, x, y) ? 'grab' : 'default'
  }, [])

  const handleMouseUp = useCallback((e) => {
    const s = S.current
    if (e) { try { s._lastUpPos = getPos(e) } catch { s._lastUpPos = null } }
    const now = performance.now()
    const upPos = s._lastUpPos

    if (s.tab === 2 && upPos) {
      const isDouble = s._lastUpT && (now - s._lastUpT) < 340
        && s._lastUpPrev
        && Math.hypot(upPos.x - s._lastUpPrev.x, upPos.y - s._lastUpPrev.y) < 28
      if (isDouble && !s.dragMoved) {
        let comp = findCompAt(s.components, upPos.x, upPos.y)
        if (!comp) comp = findCompWide(s.components, upPos.x, upPos.y)
        if (comp) {
          const sol = solveDesk()
          const r = sol.results.get(comp.id)
          const names = {
            battery: '电源', switch: '开关', rheostat: '滑动变阻器',
            bulb: '灯泡', bulbTemp: '随温度灯泡', resistor: '电阻',
            ammeter: '电流表', voltmeter: '电压表',
          }
          const lines = []
          if (comp.type === 'rheostat') {
            lines.push(`接入 R = ${(comp.props?.effectiveR ?? comp.props?.resistance ?? 0)} Ω`)
            lines.push(`铭牌 ${RHEO_RATING}`)
            lines.push('接法：一上一下 → 可变')
          } else if (r) {
            lines.push(`I = ${Math.abs(r.current).toFixed(3)} A`)
            lines.push(`U = ${Math.abs(r.voltage).toFixed(2)} V`)
            lines.push(`P = ${r.power.toFixed(3)} W`)
          } else {
            lines.push('尚未连入有效电路')
          }
          s.readout = { x: upPos.x + 8, y: upPos.y + 8, title: names[comp.type] || comp.type, lines }
          s._lastUpT = 0; s._lastUpPrev = null
          forceUpdate(n => n + 1)
          return
        }
      }
      s._lastUpPrev = upPos
      s._lastUpT = now
    }

    if (s.dragId) {
      const id = s.dragId
      const moved = s.dragMoved
      s.dragId = null; s.dragMoved = false; s.dragStart = null
      if (!moved && typeof id === 'number') {
        const c = s.components.find(k => k.id === id)
        if (c && c.type === 'switch') {
          if (c.closed !== false) {
            c.closed = false
          } else {
            // 检查滑变是否最大
            const rheo = s.components.find(k => k.type === 'rheostat')
            if (rheo && (rheo.props?.effectiveR ?? rheo.props?.resistance ?? 0) < RHEO_MAX - 0.5) {
              toast('⚠ 闭合前请把滑片移到阻值最大处')
            }
            c.closed = true
          }
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
          s.wires.push({
            id: s.nextId++,
            from: { compId: s.connecting.compId, termIdx: s.connecting.termIdx },
            to: { compId: t.compId, termIdx: t.termIdx },
            color: s.wireColor, mid1X: null, mid1Y: null, mid2X: null, mid2Y: null,
          })
          // 提示一上一下
          const a = s.components.find(c => c.id === s.connecting.compId)
          const b = s.components.find(c => c.id === t.compId)
          const rheo = a?.type === 'rheostat' ? a : b?.type === 'rheostat' ? b : null
          if (rheo) {
            const used = new Set()
            for (const w of s.wires) {
              if (w.from.compId === rheo.id) used.add(w.from.termIdx)
              if (w.to.compId === rheo.id) used.add(w.to.termIdx)
            }
            const lowers = [...used].filter(i => i < 2)
            const uppers = [...used].filter(i => i >= 2)
            if (used.size >= 2 && !(lowers.length === 1 && uppers.length === 1)) {
              toast('滑动变阻器应「一上一下」接线，才能连续变阻')
            }
          }
        }
      }
      s.connecting = null; s.hoverTerm = null
      forceUpdate(n => n + 1)
    }
  }, [])

  const handleContextMenu = useCallback((e) => {
    if (S.current.tab !== 2) return
    e.preventDefault()
    const { x, y } = getPos(e)
    const s = S.current
    let comp = findCompAt(s.components, x, y)
    if (!comp) comp = findCompWide(s.components, x, y)
    if (comp) {
      s.components = s.components.filter(c => c.id !== comp.id)
      s.wires = s.wires.filter(w => w.from.compId !== comp.id && w.to.compId !== comp.id)
      s.readout = null
      forceUpdate(n => n + 1)
      return
    }
    // 导线
    // 简化：点导线中点附近删除
    for (const wire of s.wires) {
      const fc = s.components.find(c => c.id === wire.from.compId)
      const tc = s.components.find(c => c.id === wire.to.compId)
      if (!fc || !tc) continue
      const f = compTerminals(fc)[wire.from.termIdx]
      const t = compTerminals(tc)[wire.to.termIdx]
      const mx = (f.x + t.x) / 2, my = (f.y + t.y) / 2
      if (Math.hypot(x - mx, y - my) < 24) {
        s.wires = s.wires.filter(w => w.id !== wire.id)
        forceUpdate(n => n + 1)
        return
      }
    }
    s.readout = null
    forceUpdate(n => n + 1)
  }, [])

  const handleReset = useCallback(() => {
    const s = S.current
    if (s.tab === 1) {
      s.sliderR = RHEO_MAX
      s.switchClosed = false
      s.data = []
      s.dispI = 0; s.dispU = 0
    } else {
      s.components = []; s.wires = []; s.readout = null
      s.dragId = null; s.connecting = null
    }
    forceUpdate(n => n + 1)
  }, [])

  const handleAddFromPalette = useCallback((type) => {
    const s = S.current
    const canvas = canvasRef.current
    if (!canvas) return
    const r = canvas.getBoundingClientRect()
    const n = s.components.length
    const x = r.width * 0.32 + (n % 3) * 100
    const y = r.height * 0.35 + (Math.floor(n / 3) % 3) * 90
    const id = s.nextId++
    const t = type === 'bulbTemp' ? 'bulbTemp' : type
    s.components.push({
      id, type: t, x, y, rotation: 0,
      closed: type === 'switch' ? false : true,
      props: defaultProps(type === 'bulbTemp' ? 'bulbTemp' : type),
    })
    s.dragId = id; s.dragOffX = 0; s.dragOffY = 0
    s.dragMoved = false; s.dragStart = { x, y }
    s.guideDismissed = true
    forceUpdate(v => v + 1)
  }, [])

  const handlePickColor = useCallback((color) => {
    S.current.wireColor = color
    forceUpdate(v => v + 1)
  }, [])

  function updateTab1Slider(mx) {
    const cv = canvasRef.current._R
    if (!cv) return
    const lay = fitLayout(cv.W, cv.H)
    const inner = lay.circuit
    const cx = (inner.L + inner.R) / 2
    const lw = Math.min(inner.R - inner.L, 640) * 0.42
    const rheoX = cx + lw * 0.55
    const left = rheoX - 28 * 1.15
    const width = 56 * 1.15
    const r = Math.max(0, Math.min(1, (mx - left) / width))
    const next = Math.round(r * RHEO_MAX)
    if (next !== S.current.sliderR) {
      S.current.sliderR = next
      forceUpdate(n => n + 1) // 刷新工具栏 R1 标签
    }
  }

  const mouseMoveAll = useCallback((e) => {
    if (S.current.tab === 1 && S.current._tab1DraggingSlider) {
      const { x } = getPos(e)
      updateTab1Slider(x)
      return
    }
    handleMouseMove(e)
  }, [handleMouseMove])

  const mouseUpAll = useCallback((e) => {
    S.current._tab1DraggingSlider = false
    handleMouseUp(e)
  }, [handleMouseUp])

  // ─────────────── UI ───────────────
  const paletteItems = [
    { type: 'battery', name: '干电池组', icon: '🔋' },
    { type: 'switch', name: '开关', icon: '🔌' },
    { type: 'rheostat', name: '滑动变阻器', icon: '🎚' },
    { type: 'bulb', name: '标准灯泡', icon: '💡' },
    { type: 'bulbTemp', name: '随温度灯泡', icon: '🌡' },
    { type: 'ammeter', name: '标准电流表', icon: 'Ⓐ' },
    { type: 'voltmeter', name: '标准电压表', icon: 'Ⓥ' },
    { type: 'resistor', name: '定值电阻', icon: '⚡' },
  ]

  return (
    <SceneShell
      title="练习使用滑动变阻器"
      tab={tab}
      onTabChange={(t) => {
        S.current.tab = t
        S.current.readout = null
        setTab(t)
        forceUpdate(n => n + 1)
      }}
      tab1Label="📖 规范练习"
      tab2Label="🔧 自己动手"
      onReset={handleReset}
      resetLabel={tab === 1 ? '重置实验' : '🧹 清空桌面'}
      purpose="掌握滑动变阻器的结构与「一上一下」接法；学会用它改变电路中的电流和部分电压。闭合开关前滑片应置于阻值最大处。"
      desc="器材与逻辑对齐 NOBOOK「练习使用滑动变阻器」：干电池组、开关、滑动变阻器（20Ω 2A）、标准灯泡 / 随温度变化灯泡、标准电流表、标准电压表。"
      toolbarExtra={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            style={btn}
            onClick={() => setInternal({ type: 'rheostat', title: '滑动变阻器 · 内部结构' })}
          >
            🔍 拆开看滑变
          </button>
          {tab === 1 ? (
            <>
              <span style={tag}>R1 = {S.current.sliderR}Ω</span>
              <span style={tag}>{S.current.switchClosed ? '开关：闭合' : '开关：断开'}</span>
            </>
          ) : (
            <span style={tag}>元件 {S.current.components.length} · 导线 {S.current.wires.length}</span>
          )}
        </div>
      }
    >
      <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
        <canvas
          ref={canvasRef}
          style={{ flex: 1, minWidth: 0, minHeight: 280, touchAction: 'none', display: 'block' }}
          onMouseDown={handleMouseDown}
          onMouseMove={mouseMoveAll}
          onMouseUp={mouseUpAll}
          onMouseLeave={() => { S.current._tab1DraggingSlider = false }}
          onContextMenu={handleContextMenu}
        />
        {tab === 2 && (
          <BuilderPalette
            items={paletteItems}
            wireColor={S.current.wireColor}
            onPickColor={handlePickColor}
            onAdd={handleAddFromPalette}
            hint="点选添加到桌面"
            side="right"
          />
        )}
      </div>

      {internal && (
        <InternalOverlay
          type={internal.type}
          title={internal.title}
          onClose={() => setInternal(null)}
        />
      )}
    </SceneShell>
  )
}

/** 带四柱的 findTermAt */
function findTermAtCustom(components, mx, my, R = 32) {
  for (const comp of components) {
    const terms = compTerminals(comp)
    for (let i = 0; i < terms.length; i++) {
      const dx = mx - terms[i].x, dy = my - terms[i].y
      if (dx * dx + dy * dy <= R * R) return { compId: comp.id, termIdx: i }
    }
  }
  return null
}

function findTermNearCustom(components, mx, my, exceptCompId, R = 42) {
  let best = null, bestD = Infinity
  for (const comp of components) {
    if (comp.id === exceptCompId) continue
    const terms = compTerminals(comp)
    for (let i = 0; i < terms.length; i++) {
      const dx = mx - terms[i].x, dy = my - terms[i].y
      const d = dx * dx + dy * dy
      if (d <= R * R && d < bestD) {
        bestD = d
        best = { compId: comp.id, termIdx: i }
      }
    }
  }
  return best
}

const btn = {
  padding: '6px 12px', borderRadius: 6, border: '1px solid #d0d7de',
  background: '#fff', cursor: 'pointer', fontSize: 12, color: '#24292f',
}
const tag = {
  fontSize: 11, color: '#57606a', background: '#f6f8fa',
  padding: '4px 8px', borderRadius: 4,
}

/** 内部结构浮层（DOM overlay，不碰 canvas 主循环） */
function InternalOverlay({ type, title, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    const dpr = devicePixelRatio || 1
    const w = 360, h = 260
    cv.width = w * dpr; cv.height = h * dpr
    cv.style.width = w + 'px'; cv.style.height = h + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#f7f4ee'
    ctx.fillRect(0, 0, w, h)
    try {
      const info = drawInternal(ctx, w, h, type)
      if (info?.parts?.length) {
        let y = 16
        ctx.font = '11px sans-serif'
        ctx.textAlign = 'right'
        for (const p of info.parts.slice(0, 6)) {
          ctx.fillStyle = p.color || '#666'
          ctx.fillRect(w - 150, y - 8, 10, 10)
          ctx.fillStyle = '#333'
          ctx.fillText(p.name, w - 12, y)
          y += 18
        }
      }
    } catch {
      ctx.fillStyle = '#666'; ctx.font = '12px sans-serif'
      ctx.fillText('内部结构绘制不可用', 20, 40)
    }
  }, [type])

  return (
    <div style={ov.wrap}>
      <div style={ov.panel}>
        <div style={ov.header}>
          <span>{title}</span>
          <button type="button" style={ov.close} onClick={onClose}>✕</button>
        </div>
        <canvas ref={ref} style={{ display: 'block', borderRadius: 6, background: '#f7f4ee' }} />
        <div style={ov.tip}>
          四个接线柱：上端 C/D 在金属滑杆两端，下端 A/B 在电阻丝两端。
          <b>一上一下</b> 串联接入才能连续改变阻值；两下=最大阻值；两上≈0Ω。
        </div>
      </div>
    </div>
  )
}

const ov = {
  wrap: {
    position: 'absolute', inset: 0, zIndex: 40,
    background: 'rgba(0,0,0,0.35)', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
  },
  panel: {
    background: '#fff', borderRadius: 10, padding: 12,
    boxShadow: '0 12px 40px rgba(0,0,0,0.25)', maxWidth: '92vw',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 8, fontWeight: 700, fontSize: 14, color: '#24292f',
  },
  close: {
    border: 'none', background: '#f0f0f0', borderRadius: 6,
    width: 28, height: 28, cursor: 'pointer', fontSize: 14,
  },
  tip: {
    marginTop: 8, fontSize: 12, color: '#57606a', lineHeight: 1.5, maxWidth: 360,
  },
}
