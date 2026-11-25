import { useState, useRef, useEffect } from 'react'
import { eventToCanvas } from '../utils/pointerPos'
import SceneShell from '../ui/SceneShell'
import { SYM_INK, symHalf, symBattery, symACSource, symSwitch, symBulb, symInductor } from '../render/symbols'
import { strokeBezierWire, strokeWirePreview } from '../ui/circuitKit'
import { figURL, TYPES } from './electricSvgInstruments'

/**
 * SelfInductionScene — 自感与互感
 *
 * 电学口径（与「电容器充放电」同一套画法：演示页一律标准电路符号）：
 *   τ = L/R          单位 Ω·H = s
 *   通电自感（L 与小灯泡串联）：I = (U/R)(1−e^(−t/τ))，ε_L = −L·dI/dt = −U·e^(−t/τ)（阻碍电流增大）
 *   断电自感（L 与小灯泡并联）：电源退出后 L 维持原电流经灯泡回路流动，I = I₀·e^(−t/τ)，灯泡闪亮
 *   通直流阻交流：直流稳定后 X_L = 0，L 相当于导线，只有 R 限流；
 *                 交流 X_L = ωL = 2πfL，I = U/√(R²+X_L²)，f 越高阻碍越大
 *
 * Step1 通电自感：合闸，灯泡由暗到亮，电流慢慢升到 U/R
 * Step2 断电自感：先闭合到稳态，再断开，灯泡闪亮一下
 * Step3 τ=L/R：改 L 或 R 看 τ 变化，可把曲线存成对比
 * Step4 通直流·阻交流：同一线圈换直流/交流，看感抗与灯泡亮度随频率变化
 */

const FONT = '"PingFang SC","Microsoft YaHei",system-ui,-apple-system,sans-serif'
const C = {
  bg: '#EDF2F5', card: '#FFFFFF', line: '#DFE8EC', teal: '#12A69B', tealDark: '#0B7F77',
  tealSoft: '#E6F4F2', pos: '#DE453F', posSoft: '#FDEDEC', neg: '#2C6FAF', negSoft: '#EAF1F8',
  gold: '#E2A33C', ink: '#22313A', sub: '#5D7079', faint: '#93A5AD',
}

const STEPS = [
  { key: 1, label: '① 通电自感', sub: 'L 与小灯泡串联：合闸后自感电动势 ε=−L·dI/dt 阻碍电流增大，灯泡由暗到亮，电流按 e^(−t/τ) 升到 U/R' },
  { key: 2, label: '② 断电自感', sub: 'L 与小灯泡并联：断开开关后电源退出，L 维持原来的电流经灯泡回路继续流动，灯泡闪亮一下再熄灭' },
  { key: 3, label: '③ 时间常数 τ=L/R', sub: 'τ(s)=L(H)/R(Ω)：L 越大、R 越小，τ 越大、电流变化越慢；把不同 τ 的曲线叠在一起对比' },
  { key: 4, label: '④ 通直流·阻交流', sub: '同一线圈：直流（f=0）时感抗 X_L=0，稳定后 L 相当于导线；交流时 X_L=2πfL，频率越高阻碍越大、灯泡越暗' },
  { key: 5, label: '⑤ 互感', sub: '原、副线圈共用铁芯：原线圈电流变化 → 磁通变化 → 副线圈得 ε₂=M·dI₁/dt；互感靠「变化的电流」——交流持续有效，直流只有通断的瞬间才有 ε₂' },
]

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
function setFont(ctx, size, weight = '') { ctx.font = `${weight ? weight + ' ' : ''}${size}px ${FONT}` }
function fitFont(ctx, text, maxW, size, weight = '') {
  let fs = size
  setFont(ctx, fs, weight)
  while (ctx.measureText(text).width > maxW && fs > 7) { fs -= 0.5; setFont(ctx, fs, weight) }
  return fs
}
function fmtT(sec) {
  if (Math.abs(sec) >= 1) return `${Number(sec.toFixed(sec >= 10 ? 0 : 2))} s`
  return `${Math.round(sec * 1000)} ms`
}
function fmtNum(v) {
  if (Math.abs(v) < 0.0001) return '0'
  const a = Math.abs(v)
  return a >= 10 ? v.toFixed(0) : a >= 1 ? v.toFixed(1) : v.toFixed(2)
}
function arrowHead(ctx, x, y, dx, dy, color, size = 6) {
  const len = Math.hypot(dx, dy)
  if (len < 0.01) return
  const nx = dx / len, ny = dy / len
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x + nx * size, y + ny * size)
  ctx.lineTo(x - nx * size * 0.5 + ny * size * 0.6, y - ny * size * 0.5 - nx * size * 0.6)
  ctx.lineTo(x - nx * size * 0.5 - ny * size * 0.6, y - ny * size * 0.5 + nx * size * 0.6)
  ctx.closePath(); ctx.fill()
}

// ───── RL 物理 ─────
const tauOf = (L, R) => Math.max(L, 1e-3) / Math.max(R, 1e-3)          // s
const iOn = (t, tau, I0) => I0 * (1 - Math.exp(-t / tau))
const iOff = (t, tau, I0) => I0 * Math.exp(-t / tau)
const emfOn = (t, tau, U) => -U * Math.exp(-t / tau)                   // 阻碍电流增大 → 负
const emfOff = (t, tau, U) => U * Math.exp(-t / tau)                   // 维持电流 → 正
const xLof = (f, L) => 2 * Math.PI * f * L                             // Ω

function makeLayout(W, H) {
  const stage = { x0: 24, x1: Math.max(W * 0.56, W - 300), y0: 76, y1: H - 126 }
  const panel = { x: W - 282, y: 76, w: 262, h: stage.y1 - 76 }
  const box = { x: stage.x0 + 16, y: stage.y0 + 16, w: stage.x1 - stage.x0 - 32, h: stage.y1 - stage.y0 - 32 }
  const toolbar = { x: 14, y: H - 112, w: W - 28, h: 88 }
  return { stage, panel, box, toolbar }
}

export default function SelfInductionScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const cardRect = useRef(null)      // 右侧「要点/应用」卡片最后一次绘制的矩形与可滚距离

  const S = useRef({
    tab: 1, step: 1,
    closed: false, t: 0,                       // t 单位 s
    U: 12, L: 1.5, R: 5, f: 2,
    r1: 1, n: 2, kc: 0.9, evt: null,           // ⑤ 互感：原线圈内阻 r₁ / 匝数比 n=N₂/N₁ / 耦合系数 k / 本次事件
    cardScroll: 0,                             // 右侧「要点/应用」卡片：装不下时滚轮滚动
    ghosts: [], toast: null,
    // 自己动手：接线 → 识别回路 → 跑 RL 通电自感
    nextId: 1,
    diy: {
      comps: [], wires: [], sel: null, t: 0, connecting: null, drag: null,
      hold: null, mx: 0, my: 0, wireColor: '#F44336', lastTap: null, hot: false,
      evt: null,                               // 互感回路：'on' | 'off' | null（本次通断事件）
    },
  })

  const [tab, setTab] = useState(1)
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const R2 = {
      canvas, ctx: canvas.getContext('2d'), W: 0, H: 0,
      resize() {
        canvas.width = canvas.clientWidth * devicePixelRatio
        canvas.height = canvas.clientHeight * devicePixelRatio
        this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
        this.W = canvas.clientWidth; this.H = canvas.clientHeight
      },
    }
    R2.resize(); canvasRef.current._R = R2
    let last = performance.now()
    const loop = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05); last = now
      const s = S.current
      if (s.tab === 1) {
        const tau = tauOf(s.L, s.R)
        if (s.step === 2) {
          if (!s.closed && s.t * 1000 < 5 * tau * 1000) s.t = Math.min(s.t + dt, 5 * tau)
        } else if (s.step === 4) {
          if (s.closed) s.t += dt
        } else if (s.step === 5) {
          const tau5 = tauOf(s.L, s.r1)
          if (s.evt && s.t < 5 * tau5) s.t = Math.min(s.t + dt, 5 * tau5)
        } else if (s.closed && s.t < 5 * tau) {
          s.t = Math.min(s.t + dt, 5 * tau)
        }
      } else {
        // 自己动手：回路接通（开关闭合）后电流按 i = I₀(1−e^(−t/τ)) 上升
        const res = analyseLoop(s.diy)
        S.current.diyDbg = { ok: res.ok, mode: res.mode || '', tau: res.tau, reason: res.reason || '', sw: res.switchComp ? res.switchComp.closed : 'none' }
        if (res.ok) {
          const swOpen = res.switchComp && !res.switchComp.closed
          if (res.mode === 'mutual') {
            // 互感：只有「本次事件」之后才有 ε₂，按 τ₁ 衰减（合闸、断闸各算一次）
            if (s.diy.evt && s.diy.t < 5 * res.tau) s.diy.t = Math.min(s.diy.t + dt, 5 * res.tau)
          } else if (res.mode === 'shunt') {
            if (!swOpen) { s.diy.hot = true; if (s.diy.t > 0) s.diy.t = 0 }   // 闭合：稳态，不动
            else if (s.diy.hot && s.diy.t < 5 * res.tau) s.diy.t = Math.min(s.diy.t + dt, 5 * res.tau)
          } else if (!swOpen) {
            s.diy.hot = true
            if (s.diy.t < 5 * res.tau) s.diy.t = Math.min(s.diy.t + dt, 5 * res.tau)
          }
        } else if (s.diy.t > 0) s.diy.t = 0
      }
      render(R2)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R2.resize.bind(R2))
    // 滚轮要能 preventDefault（页面别跟着滚），必须用非 passive 的原生监听
    const cv = canvasRef.current
    if (cv) cv.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      if (cv) cv.removeEventListener('wheel', handleWheel)
    }
  }, [])

  function pushArea(a) { canvasRef.current._clickAreas.push(a) }
  function say(text) { S.current.toast = { text, until: Date.now() + 2200 } }

  function render(R2) {
    try {
      const ctx = R2.ctx, W = R2.W, H = R2.H
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H)
      canvasRef.current._clickAreas = []
      canvasRef.current._palAreas = []
      if (S.current.tab === 1) renderDemo(ctx, W, H)
      else renderDiy(ctx, W, H)
      canvasRef.current._dbg = {
        step: S.current.step, tab: S.current.tab, t: +S.current.t.toFixed(3),
        diyT: +S.current.diy.t.toFixed(3),
        diyDbg: S.current.diyDbg || null,
        diyComps: S.current.diy.comps.length, diyWires: S.current.diy.wires.length,
        diyCompList: S.current.diy.comps.map((c) => ({ type: c.type, x: Math.round(c.x), y: Math.round(c.y), closed: !!c.closed, h: c.h, r: c.r, u: c.u })),
        info: { closed: S.current.closed, U: S.current.U, L: S.current.L, R: S.current.R, f: S.current.f },
        cardScroll: +(S.current.cardScroll || 0).toFixed(1), cardMax: +((cardRect.current && cardRect.current.maxScroll) || 0).toFixed(1),
        diyGrip: (() => {
          // 探针用：闸刀黑柄在「闭合 / 断开」两个姿态下的屏幕中心（画布坐标）
          const v = canvasRef.current._diyView
          if (!v) return null
          const bx = figBox('switch')
          const at = (c, cl) => {
            const g = swGripBox(cl)
            const lx = bx.x0 + ((g.x0 + g.x1) / 2) * bx.scale
            const ly = bx.y0 + ((g.y0 + g.y1) / 2) * bx.scale
            return { x: Math.round(v.ox + (c.x + lx * v.k) * v.sc), y: Math.round(v.oy + (c.y + ly * v.k) * v.sc) }
          }
          return S.current.diy.comps.filter((c) => c.type === 'switch')
            .map((c) => ({ id: c.id, closed: at(c, true), open: at(c, false) }))
        })(),
        areas: canvasRef.current._clickAreas.map((a) => ({ n: a.n || '', x: Math.round(a.x), y: Math.round(a.y), w: Math.round(a.w), h: Math.round(a.h) })),
      }
    } catch (e) { console.error('render error:', e) }
  }

  // ═════════════════════════════════════════════
  //  Tab1 实验演示
  // ═════════════════════════════════════════════
  function infoOf(s) {
    const tau = tauOf(s.L, s.R)
    const I0 = s.U / Math.max(s.R, 1e-3)
    let I = 0, emf = 0, done = false
    if (s.step === 2) {
      I = s.closed ? I0 : iOff(s.t, tau, I0)
      emf = s.closed ? 0 : emfOff(s.t, tau, s.U)
      done = !s.closed && s.t >= 5 * tau - 1e-6
    } else if (s.step === 4) {
      const X = xLof(s.f, s.L)
      const Z = Math.hypot(s.R, X)
      const Irms = s.U / Z
      I = s.closed ? Irms : 0
      done = false
      return {
        tau, I0, X, Z, Irms, I, done,
        phi: Math.atan2(X, s.R),
        iPeak: Math.SQRT2 * Irms,
        bright: s.closed ? Math.pow(clamp(I / I0, 0, 1), 1.15) : 0,
      }
    } else if (s.step === 5) {
      // ⑤ 互感：原回路 r₁ + L₁ 里 I₁ 缓慢上升；副回路只有「磁通在变」时才有 ε₂=M·dI₁/dt
      const r1 = s.r1 ?? 1
      const tau5 = tauOf(s.L, r1)
      const I1s = s.U / r1
      const n = s.n ?? 2
      const kc = s.kc ?? 0.9
      const M = kc * n * s.L                        // M = k√(L₁L₂)，L₂=n²L₁ → M = k·n·L₁
      const peak = M * (s.U / Math.max(s.L, 1e-6))  // = k·n·U：合闸与断闸的 ε₂ 峰值相同
      const I1 = s.evt === 'on' ? iOn(s.t, tau5, I1s) : 0
      const e2 = s.evt ? peak * Math.exp(-s.t / tau5) : peak
      const bright = s.evt ? clamp(e2 / peak, 0, 1) : 0
      return {
        tau: tau5, I0: I1s, I: I1, emf: e2, emfPeak: peak, M, done: !!s.evt && s.t >= 5 * tau5 - 1e-6,
        bright, X: 0, Z: 0, Irms: 0, phi: 0, iPeak: 0,
      }
    } else {
      I = s.closed ? iOn(s.t, tau, I0) : 0
      emf = s.closed ? emfOn(s.t, tau, s.U) : 0
      done = s.closed && s.t >= 5 * tau - 1e-6
    }
    const bright = s.step === 2
      ? Math.pow(clamp(I / I0, 0, 1), 1.15)
      : Math.pow(clamp(I / I0, 0, 1), 1.15)
    return { tau, I0, I, emf, done, bright, X: 0, Z: s.R, Irms: I, phi: 0, iPeak: 0 }
  }

  function renderDemo(ctx, W, H) {
    const s = S.current
    const L = makeLayout(W, H)
    drawHeader(ctx, W, s)
    drawStageCard(ctx, L)
    const splitY = L.box.y + L.box.h * 0.60
    const circA = { x: L.box.x + 10, y: L.box.y + 30, w: L.box.w - 20, h: splitY - L.box.y - 40 }
    const chW = (L.box.w - 34) / 2
    const chA = { x: L.box.x + 10, y: splitY, w: chW, h: L.box.y + L.box.h - splitY - 10 }
    const chB = { x: L.box.x + 24 + chW, y: splitY, w: chW, h: L.box.y + L.box.h - splitY - 10 }
    const info = infoOf(s)

    drawCircuit(ctx, circA, s, info)
    if (s.step === 4) {
      drawChart(ctx, chA, s, info, 'wave')
      drawChart(ctx, chB, s, info, 'If')
    } else if (s.step === 5) {
      drawChart(ctx, chA, s, info, 'I')
      drawChart(ctx, chB, s, info, 'M')
    } else {
      drawChart(ctx, chA, s, info, 'I')
      drawChart(ctx, chB, s, info, 'E')
    }
    drawPanel(ctx, L, s, info)
    drawToolbar(ctx, W, L, s, info)
    drawToast(ctx, W, s)
  }

  function drawHeader(ctx, W, s) {
    const bw = 118, bh = 30, gap = 10
    const total = STEPS.length * bw + (STEPS.length - 1) * gap
    const x0 = (W - total) / 2
    STEPS.forEach((st, i) => {
      const x = x0 + i * (bw + gap), y = 10
      const active = s.step === st.key
      ctx.beginPath(); ctx.roundRect(x, y, bw, bh, 9)
      ctx.fillStyle = active ? C.teal : C.card; ctx.fill()
      ctx.strokeStyle = active ? C.tealDark : C.line; ctx.lineWidth = 1; ctx.stroke()
      setFont(ctx, 11.5, 'bold'); ctx.fillStyle = active ? '#fff' : C.sub
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(st.label, x + bw / 2, y + bh / 2 + 1)
      pushArea({ n: `step${st.key}`, x, y, w: bw, h: bh, onClick: () => goStep(st.key) })
    })
    ctx.fillStyle = C.sub
    fitFont(ctx, STEPS[s.step - 1].sub, W - 90, 12)
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
    ctx.fillText(STEPS[s.step - 1].sub, W / 2, 58)
    ctx.textBaseline = 'alphabetic'
  }

  function goStep(key) {
    const s = S.current
    s.step = key
    s.t = 0
    s.evt = null
    if (key === 2) { s.closed = true; s.t = 5 * tauOf(s.L, s.R) }   // 先给到稳态电流，再断开看自感
    else if (key === 4 || key === 5) s.closed = true
    else s.closed = false
    if (key === 5) s.closed = false
  }

  function drawStageCard(ctx, L) {
    const { stage, box } = L
    ctx.beginPath(); ctx.roundRect(stage.x0, stage.y0, stage.x1 - stage.x0, stage.y1 - stage.y0, 12)
    ctx.fillStyle = '#FFFFFF'; ctx.fill()
    ctx.strokeStyle = '#E7EEF2'; ctx.lineWidth = 1; ctx.stroke()
    ctx.fillStyle = 'rgba(140,165,175,0.2)'
    for (let x = box.x + 14; x < box.x + box.w; x += 28) {
      for (let y = box.y + 14; y < box.y + box.h; y += 28) { ctx.beginPath(); ctx.arc(x, y, 0.9, 0, Math.PI * 2); ctx.fill() }
    }
  }

  // ── 电路（标准符号）──
  function circuitK(a) { return clamp(Math.min(a.w / 880, a.h / 230), 0.85, 1.5) }

  function drawCircuit(ctx, a, s, info) {
    if (s.step === 2) drawCircuitParallel(ctx, a, s, info)
    else if (s.step === 5) drawCircuitMutual(ctx, a, s, info)
    else drawCircuitSeries(ctx, a, s, info)
  }

  function wireSeg(ctx, x0, y0, x1, y1, col, lw) {
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.lineCap = 'butt'
  }

  // 串联：上边 电源 + 开关｜左边 小灯泡｜右边 电感｜下边 导线（步骤 1 / 3 / 4）
  function drawCircuitSeries(ctx, a, s, info) {
    const k = circuitK(a)
    const lw = 2.4 * k
    const x1 = a.x + a.w * 0.12, x2 = a.x + a.w * 0.90
    const yTop = a.y + a.h * 0.20, yBot = a.y + a.h * 0.88, yMid = (yTop + yBot) / 2
    const bx = x1 + (x2 - x1) * 0.26
    const sx = x1 + (x2 - x1) * 0.62
    const on = s.closed
    const ac = s.step === 4 && s.f > 0
    const wireCol = on ? '#1E7F8E' : '#B4C4CB'
    const ink = on ? SYM_INK : '#93A5AD'

    const hBat = ac ? 19 * k : symHalf('battery', k, 2, 'h')
    const hSw = symHalf('switch', k)
    const hBulb = symHalf('bulb', k)
    const hInd = symHalf('inductor', k)

    // 导线（符号处留缺口）
    wireSeg(ctx, x1, yTop, bx - hBat, yTop, wireCol, lw)
    wireSeg(ctx, bx + hBat, yTop, sx - hSw, yTop, wireCol, lw)
    wireSeg(ctx, sx + hSw, yTop, x2, yTop, wireCol, lw)
    wireSeg(ctx, x2, yTop, x2, yMid - hInd, wireCol, lw)
    wireSeg(ctx, x2, yMid + hInd, x2, yBot, wireCol, lw)
    wireSeg(ctx, x2, yBot, x1, yBot, wireCol, lw)
    wireSeg(ctx, x1, yBot, x1, yMid + hBulb, wireCol, lw)
    wireSeg(ctx, x1, yTop, x1, yMid - hBulb, wireCol, lw)

    // 电源：直流电池组（竖长一短）／交流符号
    if (ac) symACSource(ctx, bx, yTop, { scale: k, ink, fHz: s.f })
    else symBattery(ctx, bx, yTop, { n: 2, scale: k, ink })

    // 开关
    symSwitch(ctx, sx, yTop, { closed: on, scale: k, ink })

    // 小灯泡（⊗ + 亮度光晕，亮度是演示需求，符号本身仍是标准画法）
    const bright = info.bright
    if (bright > 0.02) {
      const gr = (16 + 20 * bright) * k
      const gl = ctx.createRadialGradient(x1, yMid, 2, x1, yMid, gr)
      gl.addColorStop(0, `rgba(255,232,130,${0.5 * bright + 0.05})`)
      gl.addColorStop(0.45, `rgba(255,214,120,${0.24 * bright})`)
      gl.addColorStop(1, 'rgba(255,205,110,0)')
      ctx.beginPath(); ctx.arc(x1, yMid, gr, 0, Math.PI * 2); ctx.fillStyle = gl; ctx.fill()
    }
    symBulb(ctx, x1, yMid, {
      scale: k, ink: bright > 0.12 ? '#B26A00' : ink, r: 13,
      fill: bright > 0.03 ? `rgba(255,226,132,${0.14 + 0.6 * bright})` : null,
    })

    // 电感（线圈）
    symInductor(ctx, x2, yMid, { scale: k, ink, axis: 'v' })

    // 电流箭头
    const iRatio = clamp(Math.abs(info.I) / Math.max(info.I0, 1e-3), 0, 1)
    if (on && iRatio > 0.03) {
      const al = 0.25 + 0.6 * iRatio
      const col = `rgba(30,127,142,${al})`
      arrowHead(ctx, x1 + (x2 - x1) * 0.45, yTop, 1, 0, col, 6 * k)
      arrowHead(ctx, x1 + (x2 - x1) * 0.80, yTop, 1, 0, col, 6 * k)
      arrowHead(ctx, x2, yMid + (yBot - yMid) * 0.55, 0, 1, col, 6 * k)
      arrowHead(ctx, x1 + (x2 - x1) * 0.60, yBot, -1, 0, col, 6 * k)
      arrowHead(ctx, x1 + (x2 - x1) * 0.30, yBot, -1, 0, col, 6 * k)
      arrowHead(ctx, x1, yMid - (yMid - yTop) * 0.55, 0, -1, col, 6 * k)
    }

    // 标注
    setFont(ctx, Math.round(9.5 * k), 'bold'); ctx.fillStyle = C.sub
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText(`L = ${s.L.toFixed(2)} H`, x2 + 14 * k, yMid - 8 * k)
    ctx.textAlign = 'right'
    ctx.fillText(`小灯泡 R = ${s.R} Ω`, x1 - 12 * k, yMid - 6 * k)
    ctx.textAlign = 'left'
    ctx.fillText(ac ? `交流电源 ${s.U} V（有效值）· ${s.f} Hz` : `电源 ${s.U} V`, bx + 26 * k, yTop - 30 * k)
    if (ac) {
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      setFont(ctx, Math.round(9 * k), 'bold'); ctx.fillStyle = C.tealDark
      ctx.fillText(`X_L = 2πfL = ${fmtNum(info.X)} Ω`, bx + 26 * k, yTop + 26 * k)
    }
    ctx.textBaseline = 'alphabetic'

    // 状态条
    const tagY = a.y + 2
    const tag = !on
      ? '开关断开 · 无电流'
      : s.step === 1
        ? (info.done ? '已到稳态 I=U/R · 电感相当于导线' : '通电自感：电流缓慢增大')
        : s.step === 3
          ? `τ = ${fmtT(info.tau)}：看曲线疏密`
          : (s.f > 0 ? '交流：感抗阻碍电流（阻交流）' : '直流：感抗为零，电流最大（通直流）')
    setFont(ctx, 10, 'bold')
    const tw = ctx.measureText(tag).width + 22
    ctx.beginPath(); ctx.roundRect(a.x + 6, tagY, tw, 22, 11)
    ctx.fillStyle = on ? 'rgba(18,166,155,0.12)' : 'rgba(147,165,173,0.12)'
    ctx.fill()
    ctx.fillStyle = on ? C.tealDark : C.faint
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(tag, a.x + 6 + tw / 2, tagY + 11)

    setFont(ctx, 9); ctx.fillStyle = C.faint
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
    ctx.fillText(s.step === 2 ? '' : (s.step === 4 ? '把频率调大：灯泡越来越暗，就是「阻交流」' : 'L 与灯泡串联：串联回路的电流处处相同'), a.x + a.w - 8, tagY + 11)
    ctx.textBaseline = 'alphabetic'

    pushArea({
      n: 'switch',
      x: sx - hSw - 8 * k, y: yTop - 26 * k, w: hSw * 2 + 16 * k, h: 40 * k,
      onClick: () => toggleSwitch(),
    })
  }

  // 并联：上边 电源 + 开关 → 左竖导线 ｜中间竖 电感 ｜右边竖 小灯泡（步骤 2 断电自感）
  function drawCircuitParallel(ctx, a, s, info) {
    const k = circuitK(a)
    const lw = 2.4 * k
    const x1 = a.x + a.w * 0.10, xm = a.x + a.w * 0.60, x3 = a.x + a.w * 0.90
    const yTop = a.y + a.h * 0.22, yBot = a.y + a.h * 0.88, yMid = (yTop + yBot) / 2
    const bx = x1 + (xm - x1) * 0.30
    const sx = x1 + (xm - x1) * 0.70
    const on = s.closed
    const sourceCol = on ? '#1E7F8E' : '#C6D3D8'   // 电源支路：开关断开后灰掉
    const loopCol = '#1E7F8E'                        // L–灯泡回路始终闭合（断电后仍有电流）
    const ink = SYM_INK

    const hBat = symHalf('battery', k, 2, 'h')
    const hSw = symHalf('switch', k)
    const hBulb = symHalf('bulb', k)
    const hInd = symHalf('inductor', k)

    // 电源支路（上边 x1→xm）
    wireSeg(ctx, x1, yTop, bx - hBat, yTop, sourceCol, lw)
    wireSeg(ctx, bx + hBat, yTop, sx - hSw, yTop, sourceCol, lw)
    wireSeg(ctx, sx + hSw, yTop, xm, yTop, sourceCol, lw)
    // L–灯泡 并联回路（上边 xm→x3、下边、两竖）
    wireSeg(ctx, xm, yTop, x3, yTop, loopCol, lw)
    wireSeg(ctx, x3, yTop, x3, yMid - hBulb, loopCol, lw)
    wireSeg(ctx, x3, yMid + hBulb, x3, yBot, loopCol, lw)
    wireSeg(ctx, x3, yBot, x1, yBot, loopCol, lw)
    wireSeg(ctx, x1, yBot, x1, yTop, sourceCol, lw)
    wireSeg(ctx, xm, yTop, xm, yMid - hInd, loopCol, lw)
    wireSeg(ctx, xm, yMid + hInd, xm, yBot, loopCol, lw)

    symBattery(ctx, bx, yTop, { n: 2, scale: k, ink: on ? ink : '#93A5AD' })
    symSwitch(ctx, sx, yTop, { closed: on, scale: k, ink: on ? ink : '#93A5AD' })
    symInductor(ctx, xm, yMid, { scale: k, ink, axis: 'v' })

    const bright = info.bright
    if (bright > 0.02) {
      const gr = (16 + 20 * bright) * k
      const gl = ctx.createRadialGradient(x3, yMid, 2, x3, yMid, gr)
      gl.addColorStop(0, `rgba(255,232,130,${0.5 * bright + 0.05})`)
      gl.addColorStop(0.45, `rgba(255,214,120,${0.24 * bright})`)
      gl.addColorStop(1, 'rgba(255,205,110,0)')
      ctx.beginPath(); ctx.arc(x3, yMid, gr, 0, Math.PI * 2); ctx.fillStyle = gl; ctx.fill()
    }
    symBulb(ctx, x3, yMid, {
      scale: k, ink: bright > 0.12 ? '#B26A00' : ink, r: 13,
      fill: bright > 0.03 ? `rgba(255,226,132,${0.14 + 0.6 * bright})` : null,
    })

    // 电流箭头：闭合时走外圈（L 与灯泡都往下）；断开后只剩 L→灯泡回路（灯泡里电流反向）
    const iRatio = clamp(Math.abs(info.I) / Math.max(info.I0, 1e-3), 0, 1)
    if (iRatio > 0.03) {
      const col = `rgba(30,127,142,${0.25 + 0.6 * iRatio})`
      if (on) {
        arrowHead(ctx, bx + hBat + 16 * k, yTop, 1, 0, col, 6 * k)
        arrowHead(ctx, (xm + x3) / 2, yTop, 1, 0, col, 6 * k)
        arrowHead(ctx, x3, yMid + hBulb + 16 * k, 0, 1, col, 6 * k)
        arrowHead(ctx, xm, yMid - hInd - 16 * k, 0, 1, col, 6 * k)
        arrowHead(ctx, x1 + (x3 - x1) * 0.45, yBot, -1, 0, col, 6 * k)
      } else {
        arrowHead(ctx, xm, yMid + hInd + 16 * k, 0, 1, col, 6 * k)
        arrowHead(ctx, xm + (x3 - xm) * 0.55, yBot, 1, 0, col, 6 * k)
        arrowHead(ctx, x3, yMid - hBulb - 16 * k, 0, -1, col, 6 * k)
        arrowHead(ctx, xm + (x3 - xm) * 0.45, yTop, -1, 0, col, 6 * k)
      }
    }

    setFont(ctx, Math.round(9.5 * k), 'bold'); ctx.fillStyle = C.sub
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText(`L = ${s.L.toFixed(2)} H`, xm + 14 * k, yMid - 8 * k)
    ctx.fillText(`小灯泡 R = ${s.R} Ω`, x3 + 12 * k, yMid - 6 * k)
    ctx.textAlign = 'left'
    ctx.fillText(`电源 ${s.U} V`, bx + 26 * k, yTop - 30 * k)
    ctx.textBaseline = 'alphabetic'

    const tagY = a.y + 2
    const tag = on ? '通电稳态：电源同时给 L 和灯泡供电' : (info.done ? '自感电流衰减完毕 · 灯泡熄灭' : '断电自感：L 维持电流经灯泡回路')
    setFont(ctx, 10, 'bold')
    const tw = ctx.measureText(tag).width + 22
    ctx.beginPath(); ctx.roundRect(a.x + 6, tagY, tw, 22, 11)
    ctx.fillStyle = on ? 'rgba(18,166,155,0.12)' : 'rgba(222,69,63,0.10)'
    ctx.fill()
    ctx.fillStyle = on ? C.tealDark : C.pos
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(tag, a.x + 6 + tw / 2, tagY + 11)

    setFont(ctx, 9); ctx.fillStyle = C.faint
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
    ctx.fillText('L 与灯泡并联：开关只切电源，L–灯泡回路仍闭着', a.x + a.w - 8, tagY + 11)
    ctx.textBaseline = 'alphabetic'

    pushArea({
      n: 'switch',
      x: sx - hSw - 8 * k, y: yTop - 26 * k, w: hSw * 2 + 16 * k, h: 40 * k,
      onClick: () => toggleSwitch(),
    })
  }

  // 互感：左 原回路（电源 + 开关 + 原线圈 L₁）｜右 副回路（副线圈 L₂ + 小灯泡）
  // 两线圈竖放在中间、共用铁芯（标准变压器画法：两组线圈 + 铁芯线 + 同名端圆点）
  // 变压器符号（铁氧体磁心画法，照用户给的参照图）：
  //   两个绕组各 3 个半圆，向两侧"向外"鼓；中间一条竖线＝铁芯；
  //   上下各一条水平引线，端头正好落在 halfW 处（= 两回路竖线的位置）。
  //   halfW：引线端头到中心的距离；hH：半高（上下引线之间的距离是 2hH）。
  function drawXfSymbol(ctx, cx, cy, halfW, hH, k, ink) {
    const r = (2 * hH) / 6                       // 3 匝 → 每匝半圆半径
    const bx = Math.max(12 * k, halfW * 0.42)    // 绕组竖直中线的偏移
    const coreH = hH + 8 * k
    ctx.strokeStyle = ink; ctx.lineCap = 'butt'; ctx.lineJoin = 'miter'
    ctx.lineWidth = 3.6 * k
    ctx.beginPath(); ctx.moveTo(cx, cy - coreH); ctx.lineTo(cx, cy + coreH); ctx.stroke()

    ctx.lineWidth = 2.8 * k
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    const winding = (dir) => {
      ctx.save(); ctx.translate(cx, cy)
      if (dir < 0) ctx.scale(-1, 1)              // 左侧镜像
      ctx.strokeStyle = ink
      ctx.beginPath()
      ctx.moveTo(halfW, -hH)                     // 上引线：从回路竖线拐进来
      ctx.lineTo(bx, -hH)
      // 3 匝：每匝都是朝铁芯一侧鼓的半圆（用三次贝塞尔画，方向不会随镜像搞反）
      const c = (4 * r) / 3
      for (let i = 0; i < 3; i++) {
        const y0 = -hH + i * 2 * r
        ctx.bezierCurveTo(bx - c, y0, bx - c, y0 + 2 * r, bx, y0 + 2 * r)
      }
      ctx.moveTo(bx, hH)
      ctx.lineTo(halfW, hH)                      // 下引线
      ctx.stroke()
      ctx.restore()
    }
    winding(1); winding(-1)
  }

  function drawCircuitMutual(ctx, a, s, info) {
    const k = circuitK(a)
    const lw = 2.4 * k
    const xP1 = a.x + a.w * 0.05, xP2 = a.x + a.w * 0.40
    const xS1 = a.x + a.w * 0.52, xS2 = a.x + a.w * 0.93
    const yTop = a.y + a.h * 0.20, yBot = a.y + a.h * 0.86, yMid = (yTop + yBot) / 2
    const bx = xP1 + (xP2 - xP1) * 0.24
    const sx = xP1 + (xP2 - xP1) * 0.66
    const on = s.closed
    const hot = !!s.evt && info.emf > info.emfPeak * 0.03     // 正在出感应电动势
    const priCol = on ? '#1E7F8E' : '#B4C4CB'
    const secCol = hot ? '#1E7F8E' : '#C6D3D8'
    const ink = on ? SYM_INK : '#93A5AD'

    const hBat = symHalf('battery', k, 2, 'h')
    const hSw = symHalf('switch', k)
    const hT = 36 * k                     // 变压器符号的半高（上下水平引线到中心线）
    const hBulb = symHalf('bulb', k)
    const halfW = (xS1 - xP2) / 2         // 两侧引线正好落在两个回路的竖线上

    // 原回路
    wireSeg(ctx, xP1, yTop, bx - hBat, yTop, priCol, lw)
    wireSeg(ctx, bx + hBat, yTop, sx - hSw, yTop, priCol, lw)
    wireSeg(ctx, sx + hSw, yTop, xP2, yTop, priCol, lw)
    wireSeg(ctx, xP2, yTop, xP2, yMid - hT, priCol, lw)
    wireSeg(ctx, xP2, yMid + hT, xP2, yBot, priCol, lw)
    wireSeg(ctx, xP2, yBot, xP1, yBot, priCol, lw)
    wireSeg(ctx, xP1, yBot, xP1, yTop, priCol, lw)
    // 副回路
    wireSeg(ctx, xS1, yTop, xS2, yTop, secCol, lw)
    wireSeg(ctx, xS2, yTop, xS2, yMid - hBulb, secCol, lw)
    wireSeg(ctx, xS2, yMid + hBulb, xS2, yBot, secCol, lw)
    wireSeg(ctx, xS2, yBot, xS1, yBot, secCol, lw)
    wireSeg(ctx, xS1, yBot, xS1, yMid + hT, secCol, lw)
    wireSeg(ctx, xS1, yMid - hT, xS1, yTop, secCol, lw)

    symBattery(ctx, bx, yTop, { n: 2, scale: k, ink })
    symSwitch(ctx, sx, yTop, { closed: on, scale: k, ink })

    // 标准变压器符号（照用户给的「铁氧体磁心变压器」符号画）：
    //   两侧各 3 个向外鼓的半圆绕组（共用一条中线，图上呈 W 形），中间一条竖铁芯线，
    //   上下两条水平引线一直伸到两个回路的竖线 —— 这正是课本/图册里互感的画法
    const xc = (xP2 + xS1) / 2
    drawXfSymbol(ctx, xc, yMid, halfW, hT, k, ink)

    // 同名端：两绕组上端各一个小圆点（都取上方那根引线的端头）
    ctx.beginPath(); ctx.arc(xP2 + 11 * k, yMid - hT, 2.6 * k, 0, Math.PI * 2)
    ctx.fillStyle = C.pos; ctx.fill()
    ctx.beginPath(); ctx.arc(xS1 - 11 * k, yMid - hT, 2.6 * k, 0, Math.PI * 2)
    ctx.fillStyle = C.pos; ctx.fill()

    // 小灯泡（副回路）+ 亮度光晕
    const bright = info.bright
    if (bright > 0.02) {
      const gr = (16 + 22 * bright) * k
      const gl = ctx.createRadialGradient(xS2, yMid, 2, xS2, yMid, gr)
      gl.addColorStop(0, `rgba(255,232,130,${0.5 * bright + 0.05})`)
      gl.addColorStop(0.45, `rgba(255,214,120,${0.24 * bright})`)
      gl.addColorStop(1, 'rgba(255,205,110,0)')
      ctx.beginPath(); ctx.arc(xS2, yMid, gr, 0, Math.PI * 2); ctx.fillStyle = gl; ctx.fill()
    }
    symBulb(ctx, xS2, yMid, {
      scale: k, ink: bright > 0.12 ? '#B26A00' : ink, r: 13,
      fill: bright > 0.03 ? `rgba(255,226,132,${0.14 + 0.6 * bright})` : null,
    })

    // 电流箭头：原回路；副回路的电流方向与「磁通增加」相反抗（Lenz）
    const iRatio = clamp(info.I / Math.max(info.I0, 1e-3), 0, 1)
    if (iRatio > 0.03) {
      const col = `rgba(30,127,142,${0.25 + 0.6 * iRatio})`
      arrowHead(ctx, bx + hBat + 18 * k, yTop, 1, 0, col, 6 * k)
      arrowHead(ctx, xP2, yMid - hT - 16 * k, 0, 1, col, 6 * k)
      arrowHead(ctx, xP1 + (xP2 - xP1) * 0.5, yBot, -1, 0, col, 6 * k)
    }
    if (hot) {
      const col = `rgba(222,69,63,${0.35 + 0.5 * clamp(info.emf / Math.max(info.emfPeak, 1e-3), 0, 1)})`
      arrowHead(ctx, xS1, yMid + hT + 16 * k, 0, -1, col, 6 * k)
      arrowHead(ctx, xS2, yMid - hBulb - 20 * k, 0, 1, col, 6 * k)
    }

    // 标注
    setFont(ctx, Math.round(9.5 * k), 'bold'); ctx.fillStyle = C.sub
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText(`电源 ${s.U} V`, bx + 24 * k, yTop + 20 * k)
    ctx.textAlign = 'right'
    ctx.fillText(`原线圈 L₁ = ${s.L.toFixed(2)} H（N₁ 匝）`, xP2 - 8 * k, yMid - hT - 22 * k)
    ctx.textAlign = 'left'
    ctx.fillText(`副线圈 L₂（N₂:N₁ = ${(s.n ?? 2)}:1）`, xS1 + 8 * k, yMid - hT - 22 * k)
    ctx.textAlign = 'right'
    ctx.fillText(`小灯泡 R = ${s.R} Ω`, xS2 - 14 * k, yMid - hBulb - 22 * k)
    ctx.textAlign = 'center'; ctx.fillStyle = C.ink
    ctx.fillText('铁 芯', xc, yMid + hT + 16 * k)
    ctx.textBaseline = 'alphabetic'

    // 状态条
    const tagY = a.y + 2
    const tag = !on
      ? (info.done ? '感应电动势衰减完毕 · 灯泡熄灭（稳态没有互感电动势）' : (s.evt ? '断闸瞬间：磁通减小 → ε₂ 反向，灯泡再闪一下' : '开关断开 · 无电流、无磁通变化'))
      : (info.done ? '原电流已稳定：dI₁/dt=0 → ε₂=0，灯泡不亮' : '合闸瞬间：磁通增大 → ε₂ 最大，灯泡先闪亮')
    setFont(ctx, 10, 'bold')
    const tw = ctx.measureText(tag).width + 22
    ctx.beginPath(); ctx.roundRect(a.x + 6, tagY, tw, 22, 11)
    ctx.fillStyle = hot ? 'rgba(222,69,63,0.10)' : 'rgba(18,166,155,0.12)'
    ctx.fill()
    ctx.fillStyle = hot ? C.pos : (on ? C.tealDark : C.faint)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(tag, a.x + 6 + tw / 2, tagY + 11)

    setFont(ctx, 9); ctx.fillStyle = C.faint
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
    ctx.fillText('两个回路各自独立：只有磁通「在变」时副线圈才有电流', a.x + a.w - 8, tagY + 11)
    ctx.textBaseline = 'alphabetic'

    pushArea({
      n: 'switch',
      x: sx - hSw - 8 * k, y: yTop - 26 * k, w: hSw * 2 + 16 * k, h: 40 * k,
      onClick: () => toggleSwitch(),
    })
  }

  function toggleSwitch() {
    const s = S.current
    if (s.step === 2) {
      if (s.closed) {
        s.closed = false; s.t = 0
        say('断开开关：L 维持电流，灯泡闪亮一下')
      } else {
        s.closed = true; s.t = 5 * tauOf(s.L, s.R)
        say('已闭合到稳态，可再次断开观察断电自感')
      }
    } else if (s.step === 5) {
      s.closed = !s.closed
      s.t = 0
      s.evt = s.closed ? 'on' : 'off'
      say(s.closed
        ? '合闸：原电流增大 → 磁通增大 → ε₂ 最大，副回路灯泡闪一下'
        : '断闸：磁通减小 → ε₂ 反向，灯泡再闪一下，随后衰减到 0')
    } else {
      s.closed = !s.closed
      s.t = 0
      say(s.closed ? '开关闭合' : '开关断开')
    }
  }

  // ── 曲线 ──
  function drawChart(ctx, box, s, info, kind) {
    ctx.beginPath(); ctx.roundRect(box.x, box.y, box.w, box.h, 8)
    ctx.fillStyle = '#FFFFFF'; ctx.fill()
    ctx.strokeStyle = '#E4EDF1'; ctx.lineWidth = 1; ctx.stroke()
    const m = { l: 46, r: 14, t: 30, b: 26 }
    const px0 = box.x + m.l, py0 = box.y + m.t
    const pw = box.w - m.l - m.r, ph = box.h - m.t - m.b
    const titles = {
      I: s.step === 5 ? '原线圈电流 I₁ – t（A）' : '电流 I – t（A）',
      E: '自感电动势 ε_L – t（V）',
      M: '副线圈感应电动势 ε₂ – t（V）',
      wave: 'u(t) 与 i(t) 波形（各自归一）',
      If: '电流有效值 I – 频率 f',
    }
    setFont(ctx, 10.5, 'bold'); ctx.fillStyle = C.ink
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText(titles[kind], box.x + 12, box.y + 9)
    setFont(ctx, 8.5, 'bold'); ctx.fillStyle = C.tealDark
    ctx.textAlign = 'right'
    const badge = kind === 'If' ? '通直流 · 阻交流'
      : kind === 'wave'
        ? (s.f > 0 ? `f = ${s.f} Hz · i 滞后 ${Math.round((info.phi * 180) / Math.PI)}°` : '直流 f = 0 · L 不阻碍')
        : kind === 'M'
          ? `M = ${info.M.toFixed(2)} H · k = ${(s.kc ?? 0.9)}`
          : (s.step === 5 ? '互感（原回路）' : s.step === 2 ? '断电自感' : '通电自感')
    ctx.fillText(badge, box.x + box.w - 12, box.y + 10)

    // 网格 + 坐标轴
    ctx.strokeStyle = '#F0F5F7'; ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const x = px0 + (pw * i) / 4
      ctx.beginPath(); ctx.moveTo(x, py0); ctx.lineTo(x, py0 + ph); ctx.stroke()
      const y = py0 + (ph * i) / 4
      ctx.beginPath(); ctx.moveTo(px0, y); ctx.lineTo(px0 + pw, y); ctx.stroke()
    }
    ctx.strokeStyle = '#C7D5DB'; ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.moveTo(px0, py0); ctx.lineTo(px0, py0 + ph); ctx.lineTo(px0 + pw, py0 + ph); ctx.stroke()

    if (kind === 'I') {
      const tau = info.tau
      const xMax = 5 * tau
      const yMax = info.I0 * 1.08
      const X = (t) => px0 + clamp(t / xMax, 0, 1) * pw
      const Y = (v) => py0 + ph - clamp(v / yMax, 0, 1) * ph
      ctx.strokeStyle = '#DCE6EA'; ctx.setLineDash([5, 4])
      ctx.beginPath(); ctx.moveTo(px0, Y(info.I0)); ctx.lineTo(px0 + pw, Y(info.I0)); ctx.stroke()
      ctx.setLineDash([])
      setFont(ctx, 8); ctx.fillStyle = C.faint
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'
      ctx.fillText(s.step === 5 ? 'U/r₁' : 'U/R', px0 + 5, Y(info.I0) - 3)
      // 对比曲线（步骤 3）
      if (s.step === 3) {
        s.ghosts.forEach((gh, gi) => {
          const col = ['rgba(226,163,60,0.85)', 'rgba(44,111,175,0.8)', 'rgba(94,140,120,0.8)'][gi % 3]
          const tauG = tauOf(gh.L, gh.R), xG = 5 * tauG
          ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.setLineDash([6, 4])
          ctx.beginPath()
          for (let i = 0; i <= 60; i++) {
            const t = (xG * i) / 60
            const v = iOn(t, tauG, gh.U / gh.R)
            const xx = px0 + clamp(t / xMax, 0, 1) * pw
            const yy = Y(v)
            if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy)
          }
          ctx.stroke(); ctx.setLineDash([])
        })
      }
      // 当前曲线：未发生的部分画虚线（预测），已经走过的部分画实线
      const curveAt = (t) => (s.step === 2 ? iOff(t, tau, info.I0) : iOn(t, tau, info.I0))
      const solidTo = s.step === 2
        ? (s.closed ? 0 : Math.min(s.t, xMax))
        : (s.closed ? Math.min(s.t, xMax) : 0)
      ctx.strokeStyle = 'rgba(44,111,175,0.42)'; ctx.lineWidth = 1.6; ctx.setLineDash([5, 4])
      ctx.beginPath()
      for (let i = 0; i <= 72; i++) {
        const t = (xMax * i) / 72
        const xx = X(t), yy = Y(curveAt(t))
        if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy)
      }
      ctx.stroke(); ctx.setLineDash([])
      if (solidTo > 1e-4) {
        ctx.strokeStyle = C.neg; ctx.lineWidth = 2.2
        ctx.beginPath()
        const n = Math.max(2, Math.round((72 * solidTo) / xMax))
        for (let i = 0; i <= n; i++) {
          const t = (solidTo * i) / n
          const xx = X(t), yy = Y(curveAt(t))
          if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy)
        }
        ctx.stroke()
      }
      // 刻度
      setFont(ctx, 8.5); ctx.fillStyle = C.faint
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      for (let i = 1; i <= 4; i++) ctx.fillText(fmtT((xMax * i) / 4), px0 + (pw * i) / 4, py0 + ph + 5)
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
      for (let i = 0; i <= 4; i++) ctx.fillText(fmtNum((yMax * i) / 4), px0 - 8, py0 + ph - (ph * i) / 4)
      // τ 标记
      if (tau < xMax) {
        ctx.strokeStyle = 'rgba(226,163,60,0.5)'; ctx.setLineDash([4, 3])
        ctx.beginPath(); ctx.moveTo(X(tau), py0); ctx.lineTo(X(tau), py0 + ph); ctx.stroke()
        ctx.setLineDash([])
      }
      // 游标
      if (info.I > 0.0005) {
        const cx = X(Math.min(s.t, xMax))
        const cy = Y(info.I)
        ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, Math.PI * 2)
        ctx.fillStyle = C.neg; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.stroke()
      }
      setFont(ctx, 8.5, 'bold'); ctx.fillStyle = C.neg
      ctx.textAlign = 'right'; ctx.textBaseline = 'top'
      ctx.fillText(`${info.I.toFixed(2)} A`, box.x + box.w - 14, box.y + 26)
    } else if (kind === 'E') {
      const tau = info.tau
      const xMax = 5 * tau
      const yMax = s.U * 1.08
      const zeroY = py0 + ph / 2
      const X = (t) => px0 + clamp(t / xMax, 0, 1) * pw
      const Y = (v) => zeroY - clamp(v / yMax, -1, 1) * (ph / 2)
      ctx.strokeStyle = '#DCE6EA'; ctx.setLineDash([5, 4])
      ctx.beginPath(); ctx.moveTo(px0, zeroY); ctx.lineTo(px0 + pw, zeroY); ctx.stroke()
      ctx.setLineDash([])
      ctx.strokeStyle = C.pos; ctx.lineWidth = 2.2
      ctx.beginPath()
      for (let i = 0; i <= 72; i++) {
        const t = (xMax * i) / 72
        // 断电自感：断开后 ε 与电流同向（维持电流）→ 从 +U 指数衰减；
        // 通电自感：ε 阻碍电流增大 → 从 −U 指数回到 0
        const v = s.step === 2
          ? (s.closed ? 0 : s.U * Math.exp(-t / tau))
          : (s.closed ? -s.U * Math.exp(-t / tau) : 0)
        const xx = X(t), yy = Y(v)
        if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy)
      }
      ctx.stroke()
      setFont(ctx, 8.5); ctx.fillStyle = C.faint
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      for (let i = 1; i <= 4; i++) ctx.fillText(fmtT((xMax * i) / 4), px0 + (pw * i) / 4, py0 + ph + 5)
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
      ctx.fillText('0', px0 - 8, zeroY)
      ctx.fillText(`+${fmtNum(yMax)}`, px0 - 8, py0 + 4)
      ctx.fillText(`−${fmtNum(yMax)}`, px0 - 8, py0 + ph - 4)
      setFont(ctx, 8.5, 'bold'); ctx.fillStyle = C.pos
      ctx.textAlign = 'right'; ctx.textBaseline = 'top'
      ctx.fillText(`${Math.abs(info.emf).toFixed(2)} V`, box.x + box.w - 14, box.y + 26)
      setFont(ctx, 7.8); ctx.fillStyle = C.sub
      ctx.textAlign = 'left'
      ctx.textBaseline = s.step === 2 ? 'bottom' : 'top'
      ctx.fillText(s.step === 2 ? 'ε 与电流同向：维持电流' : 'ε 与电流反向：阻碍电流增大',
        px0 + 6, s.step === 2 ? py0 + ph - 8 : py0 + 6)
      // 曲线恒为 0 时补一句说明，免得图表看着“死掉”
      const flat = s.step === 2 ? s.closed : !s.closed
      if (flat) {
        setFont(ctx, 8); ctx.fillStyle = C.faint
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
        ctx.fillText(s.step === 2
          ? '此刻已到稳态：ε = 0；断开瞬间 ε 会跳到 U 再指数衰减'
          : '合闸后 ε 从 −U 回到 0（阻碍电流增大）', px0 + pw / 2, py0 + ph - 10)
      }
    } else if (kind === 'M') {
      // 副线圈感应电动势 ε₂：合闸/断闸瞬间跳到峰值，再按 e^(−t/τ₁) 衰减到 0
      const tau = info.tau
      const xMax = 5 * tau
      const yMax = info.emfPeak * 1.15
      const X = (t) => px0 + clamp(t / xMax, 0, 1) * pw
      const Y = (v) => py0 + ph - clamp(v / yMax, 0, 1) * ph
      const curve = (t) => info.emfPeak * Math.exp(-t / tau)
      // 预测曲线（虚线）
      ctx.strokeStyle = 'rgba(222,69,63,0.42)'; ctx.lineWidth = 1.6; ctx.setLineDash([5, 4])
      ctx.beginPath()
      for (let i = 0; i <= 72; i++) {
        const t = (xMax * i) / 72
        const xx = X(t), yy = Y(curve(t))
        if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy)
      }
      ctx.stroke(); ctx.setLineDash([])
      // 已走过部分（实线）
      if (s.evt) {
        const to = Math.min(s.t, xMax)
        ctx.strokeStyle = C.pos; ctx.lineWidth = 2.2
        ctx.beginPath()
        const n = Math.max(2, Math.round((72 * to) / xMax))
        for (let i = 0; i <= n; i++) {
          const t = (to * i) / n
          const xx = X(t), yy = Y(curve(t))
          if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy)
        }
        ctx.stroke()
        const cx = X(Math.min(s.t, xMax)), cy = Y(info.emf)
        ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, Math.PI * 2)
        ctx.fillStyle = C.pos; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.stroke()
      }
      // 刻度
      setFont(ctx, 8.5); ctx.fillStyle = C.faint
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      for (let i = 1; i <= 4; i++) ctx.fillText(fmtT((xMax * i) / 4), px0 + (pw * i) / 4, py0 + ph + 5)
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
      for (let i = 0; i <= 4; i++) ctx.fillText(fmtNum((yMax * i) / 4), px0 - 8, py0 + ph - (ph * i) / 4)
      // 峰值参考线
      ctx.strokeStyle = 'rgba(226,163,60,0.45)'; ctx.setLineDash([4, 3])
      ctx.beginPath(); ctx.moveTo(px0, Y(info.emfPeak)); ctx.lineTo(px0 + pw, Y(info.emfPeak)); ctx.stroke()
      ctx.setLineDash([])
      setFont(ctx, 8, 'bold'); ctx.fillStyle = C.gold
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'
      ctx.fillText(`ε₂ 峰值 ${info.emfPeak.toFixed(1)} V = k·n·U`, px0 + 6, Y(info.emfPeak) - 3)
      // 读数
      setFont(ctx, 8.5, 'bold'); ctx.fillStyle = C.pos
      ctx.textAlign = 'right'; ctx.textBaseline = 'top'
      ctx.fillText(s.evt ? `${Math.abs(info.emf).toFixed(2)} V` : '待合闸', box.x + box.w - 14, box.y + 26)
      setFont(ctx, 7.8); ctx.fillStyle = C.sub
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'
      ctx.fillText('磁通在变才有 ε₂：稳态 dI₁/dt = 0 → ε₂ = 0，灯泡不亮', px0 + 6, py0 + ph - 6)
    } else if (kind === 'wave') {
      // u(t) 与 i(t) 各自按自己的峰值归一（否则 50 Hz 时 i≈0.03 A，两条线不能同框看相位）
      const f = s.f
      const tau = info.tau
      const period = f > 0 ? 1 / f : 0
      const xMax = f > 0 ? 2 * period : Math.max(3 * tau, 0.4)
      const zeroY = py0 + ph / 2
      const X = (t) => px0 + clamp(t / xMax, 0, 1) * pw
      const Y = (v) => zeroY - clamp(v, -1, 1) * (ph / 2) * 0.86
      ctx.strokeStyle = '#DCE6EA'; ctx.setLineDash([5, 4])
      ctx.beginPath(); ctx.moveTo(px0, zeroY); ctx.lineTo(px0 + pw, zeroY); ctx.stroke()
      ctx.setLineDash([])
      // u(t)：细虚线
      ctx.strokeStyle = 'rgba(44,111,175,0.55)'; ctx.lineWidth = 1.5
      ctx.beginPath()
      for (let i = 0; i <= 90; i++) {
        const t = (xMax * i) / 90
        const v = f > 0 ? Math.sin(2 * Math.PI * f * t) : 1
        const xx = X(t), yy = Y(v)
        if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy)
      }
      ctx.stroke()
      // i(t)：实线（比 u 滞后 φ）
      ctx.strokeStyle = C.neg; ctx.lineWidth = 2.2
      ctx.beginPath()
      for (let i = 0; i <= 90; i++) {
        const t = (xMax * i) / 90
        const v = f > 0 ? Math.sin(2 * Math.PI * f * t - info.phi) : 1
        const xx = X(t), yy = Y(v)
        if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy)
      }
      ctx.stroke()
      setFont(ctx, 8.5); ctx.fillStyle = C.faint
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      for (let i = 1; i <= 4; i++) ctx.fillText(fmtT((xMax * i) / 4), px0 + (pw * i) / 4, py0 + ph + 5)
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
      ctx.fillText('0', px0 - 8, zeroY)
      ctx.fillText('+1', px0 - 8, zeroY - ph * 0.43)
      // 曲线名直接标在各自波峰上（图里不再放图例块，避免压住波形）
      setFont(ctx, 8, 'bold'); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
      if (f > 0) {
        ctx.fillStyle = 'rgba(44,111,175,0.95)'
        ctx.fillText('u(t)', X(period / 4), Y(1) - 2)
        ctx.fillStyle = C.neg
        const tIm = period * (0.25 + info.phi / (2 * Math.PI))
        ctx.fillText('i(t)', X(clamp(tIm, period * 0.05, xMax * 0.96)), Y(1) - 2)
      } else {
        setFont(ctx, 8); ctx.fillStyle = C.sub
        ctx.textAlign = 'left'; ctx.textBaseline = 'top'
        ctx.fillText('直流：u 与 i 同相，L 相当于导线', px0 + 6, py0 + 16)
      }
    } else {
      // I–f 曲线：通直阻交
      const fMax = 50
      const yMax = info.I0 * 1.34
      const X = (f) => px0 + clamp(f / fMax, 0, 1) * pw
      const Y = (v) => py0 + ph - clamp(v / yMax, 0, 1) * ph
      ctx.strokeStyle = 'rgba(18,166,155,0.35)'; ctx.setLineDash([5, 4])
      ctx.beginPath(); ctx.moveTo(px0, Y(info.I0)); ctx.lineTo(px0 + pw, Y(info.I0)); ctx.stroke()
      ctx.setLineDash([])
      setFont(ctx, 7.8); ctx.fillStyle = C.tealDark
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'
      ctx.fillText('f = 0（直流）：I = U/R，畅通无阻', px0 + 6, Y(info.I0) - 4)
      ctx.strokeStyle = C.neg; ctx.lineWidth = 2.2
      ctx.beginPath()
      for (let i = 0; i <= 90; i++) {
        const f = (fMax * i) / 90
        const v = s.U / Math.hypot(s.R, xLof(f, s.L))
        const xx = X(f), yy = Y(v)
        if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy)
      }
      ctx.stroke()
      // 当前点
      const cx = X(s.f), cy = Y(info.I)
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2)
      ctx.fillStyle = C.gold; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke()
      setFont(ctx, 8.5); ctx.fillStyle = C.faint
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      for (let i = 0; i <= 5; i++) ctx.fillText(`${(fMax * i) / 5}`, px0 + (pw * i) / 5, py0 + ph + 5)
      ctx.textAlign = 'center'
      ctx.fillText('f (Hz)', px0 + pw / 2, py0 + ph + 15)
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
      for (let i = 0; i <= 4; i++) ctx.fillText(fmtNum((yMax * i) / 4), px0 - 8, py0 + ph - (ph * i) / 4)
      setFont(ctx, 8.5, 'bold'); ctx.fillStyle = C.gold
      ctx.textAlign = 'right'; ctx.textBaseline = 'top'
      ctx.fillText(`${info.I.toFixed(2)} A`, box.x + box.w - 14, box.y + 26)
    }
    ctx.textBaseline = 'alphabetic'
  }

  // ── 右侧数据面板 ──
  function drawPanel(ctx, L, s, info) {
    const { panel } = L
    const x = panel.x, w = panel.w, y = panel.y, h = panel.h
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 10)
    ctx.fillStyle = C.card; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke()
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'

    let ky = y + 14
    setFont(ctx, 12, 'bold'); ctx.fillStyle = C.ink
    const head = s.step === 4 ? '感抗与电流' : s.step === 3 ? '时间常数 τ = L/R' : s.step === 5 ? '互感电动势 ε₂' : '自感电动势 ε_L'
    ctx.fillText(head, x + 14, ky)
    setFont(ctx, 9); ctx.fillStyle = C.faint
    ctx.fillText(s.step === 4 ? '同一线圈：直流畅通、交流受阻' : s.step === 5 ? 'ε₂ = M·dI₁/dt，M = k·n·L₁' : 'ε = −L·dI/dt，τ = L/R', x + 14, ky + 17)

    ky += 40
    if (s.step === 4) {
      setFont(ctx, 22, 'bold'); ctx.fillStyle = info.I > 0.001 ? C.neg : C.faint
      ctx.fillText(`${info.I.toFixed(2)}`, x + 14, ky)
      setFont(ctx, 11, 'bold'); ctx.fillStyle = C.sub
      ctx.fillText('A', x + 100, ky + 10)
      ky += 36
    } else if (s.step === 3) {
      setFont(ctx, 22, 'bold'); ctx.fillStyle = C.tealDark
      ctx.fillText(fmtT(info.tau), x + 14, ky)
      setFont(ctx, 10, 'bold'); ctx.fillStyle = C.sub
      ctx.fillText(`= ${s.L.toFixed(2)} H / ${s.R} Ω`, x + 14, ky + 30)
      ky += 52
    } else if (s.step === 5) {
      setFont(ctx, 22, 'bold'); ctx.fillStyle = s.evt ? C.pos : C.faint
      ctx.fillText(s.evt ? `${Math.abs(info.emf).toFixed(2)}` : '—', x + 14, ky)
      setFont(ctx, 11, 'bold'); ctx.fillStyle = C.sub
      ctx.fillText('V', x + (s.evt ? 86 : 44), ky + 10)
      ky += 36
    } else {
      setFont(ctx, 22, 'bold'); ctx.fillStyle = info.emf >= 0 ? C.pos : C.neg
      ctx.fillText(`${Math.abs(info.emf).toFixed(2)}`, x + 14, ky)
      setFont(ctx, 11, 'bold'); ctx.fillStyle = C.sub
      ctx.fillText('V', x + 118, ky + 10)
      ky += 36
    }

    const rows = []
    if (s.step === 4) {
      rows.push(['频率 f', s.f === 0 ? '0 Hz（直流）' : `${s.f} Hz`])
      rows.push(['感抗 X_L=2πfL', `${fmtNum(info.X)} Ω`])
      rows.push(['阻抗 Z', `${fmtNum(info.Z)} Ω`])
      rows.push(['电流 I=U/Z', `${info.I.toFixed(2)} A`])
      rows.push(['相位差 φ', `${Math.round((info.phi * 180) / Math.PI)}°`])
      rows.push(['灯泡亮度', s.closed ? `${Math.round(info.bright * 100)}%` : '0%'])
      rows.push(['自感系数 L', `${s.L.toFixed(2)} H`])
      rows.push(['灯丝电阻 R', `${s.R} Ω`])
    } else if (s.step === 5) {
      const n = s.n ?? 2
      rows.push(['本次事件', s.evt === 'on' ? '合闸（磁通增大）' : s.evt === 'off' ? '断闸（磁通减小）' : '还没通断'])
      rows.push(['原线圈电流 I₁', s.evt === 'on' ? `${info.I.toFixed(2)} A` : '0.00 A'])
      rows.push(['副线圈 ε₂ = M·dI₁/dt', `${Math.abs(info.emf).toFixed(2)} V`])
      rows.push(['ε₂ 峰值 = k·n·U', `${info.emfPeak.toFixed(1)} V`])
      rows.push(['互感系数 M', `${info.M.toFixed(2)} H`])
      rows.push(['匝数比 N₂:N₁', `${n}:1`])
      rows.push(['原线圈内阻 r₁', `${(s.r1 ?? 1)} Ω`])
      rows.push(['τ₁ = L₁/r₁', fmtT(info.tau)])
      rows.push(['灯泡亮度', `${Math.round(info.bright * 100)}%`])
    } else {
      rows.push(['时间 t', fmtT(s.t)])
      rows.push(['电流 I', s.step === 2
        ? (s.closed ? `${info.I0.toFixed(2)} A（稳态）` : `${info.I.toFixed(2)} A 衰减中`)
        : (!s.closed ? '0.00 A（开关断开）' : `${info.I.toFixed(2)} A`)])
      rows.push(['ε_L = −L·dI/dt', s.closed || s.step === 2 ? `${Math.abs(info.emf).toFixed(2)} V` : '0.00 V'])
      rows.push(['灯泡亮度', `${Math.round(info.bright * 100)}%`])
      rows.push(['自感系数 L', `${s.L.toFixed(2)} H`])
      rows.push(['灯丝电阻 R', `${s.R} Ω`])
      rows.push(['τ = L/R', fmtT(info.tau)])
      rows.push(['5τ（99.3%）', fmtT(5 * info.tau)])
      rows.push(['稳态 I₀=U/R', `${info.I0.toFixed(2)} A`])
    }
    for (const [k, v] of rows) {
      setFont(ctx, 9.5); ctx.fillStyle = C.sub
      ctx.textAlign = 'left'
      ctx.fillText(k, x + 14, ky)
      setFont(ctx, 10, 'bold'); ctx.fillStyle = C.ink
      ctx.textAlign = 'right'; fitFont(ctx, v, w - 132, 10, 'bold')
      ctx.fillText(v, x + w - 14, ky)
      ky += 17
    }
    ctx.textAlign = 'left'

    ky += 6
    ctx.strokeStyle = '#EDF2F5'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(x + 12, ky); ctx.lineTo(x + w - 12, ky); ctx.stroke()
    ky += 10
    const headline = s.step === 1
      ? (!s.closed ? '合闸：电流从 0 开始按 e^(−t/τ) 增大' : (info.done ? '已到稳态：I=U/R，L 相当于导线（通直流）' : '通电自感：ε 阻碍电流增大，灯泡慢慢变亮'))
      : s.step === 2
        ? (s.closed ? '开关闭合中：L 与灯泡各有一份电流，先稳定下来' : (info.done ? '断电自感结束：电流衰减到 0，灯泡熄灭' : '断电自感：L 维持电流，灯泡闪亮一下'))
        : s.step === 3
          ? `τ=${fmtT(info.tau)}：1τ 到 63.2%，5τ 到 99.3%`
          : s.step === 5
            ? (!s.evt ? '合闸或断闸瞬间：磁通突变 → 副线圈出电动势，灯泡闪一下' : (info.done ? 'ε₂ 衰减到 0：磁通不再变化，灯泡熄灭' : 'ε₂ 正按 e^(−t/τ₁) 衰减，灯泡由亮转暗'))
            : (s.f === 0 ? '直流：X_L=0，L 相当于导线，I=U/R 最大（通直流）' : '交流：X_L=2πfL 阻碍电流，f 越高 I 越小（阻交流）')
    setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.tealDark
    fitFont(ctx, headline, w - 28, 9.5, 'bold')
    ctx.fillText(headline, x + 14, ky)

    // ── 要点 / 应用卡片：字号偏大，文字装不下时可滚轮上下滚 ──
    // 卡片高度跟着面板剩余空间走，矮屏幕也不会压住上面的数据表
    const cardH = Math.max(150, Math.min(196, y + h - 8 - (ky + 24)))
    const cardY = Math.min(ky + 24, y + h - cardH - 8)
    const cardX = x + 12, cardW = w - 24
    ctx.beginPath(); ctx.roundRect(cardX, cardY, cardW, cardH, 8)
    ctx.fillStyle = '#F6FBF9'; ctx.fill()
    ctx.strokeStyle = '#DCEBE7'; ctx.lineWidth = 1; ctx.stroke()
    setFont(ctx, 11.5, 'bold'); ctx.fillStyle = C.tealDark
    const cardTitle = s.step === 1 ? '通电自感的三个特征' : s.step === 2 ? '断电自感的三个特征' : s.step === 3 ? 'τ 的物理意义' : s.step === 5 ? '互感的应用（很广）' : '电感：通直流、阻交流'
    ctx.fillText(cardTitle, cardX + 12, cardY + 10)

    // h = 小标题行（粗体、大一号）；t = 正文行；sp = 该行后额外留白
    const items = s.step === 5 ? [
      { h: '互感靠「变化的电流」', col: '#B4553B', sp: 2 },
      { t: '交流里持续有效（变压器就靠它）', sp: 2 },
      { t: '直流只有通断瞬间才有 ε₂ —— 交流才持续', sp: 9 },
      { h: '① 手机无线充电', sp: 2 },
      { t: '充电板线圈 ↔ 手机背面线圈，隔空送电', sp: 9 },
      { h: '② 变压器（输配电）', sp: 2 },
      { t: '铁芯把磁通「关」在芯里，k≈1', sp: 9 },
      { h: '③ 点火线圈（本质就是变压器）', sp: 2 },
      { t: '断闸 ε₂ 上万伏 → 点燃火花塞', sp: 2 },
    ] : (s.step === 1 ? [
      '• 合闸瞬间 I=0，电流不能突变，灯泡先暗',
      '• ε=−L·dI/dt 与电流方向相反，阻碍电流增大',
      '• 电流按 e^(−t/τ) 上升，1τ 到 63.2%，5τ 到 99.3%',
      '• 稳态时 dI/dt=0，ε=0，L 对直流相当于导线',
      '• L 越大 τ 越大，灯泡亮起来越慢',
      '• 电感「通直流」：稳定后只有灯丝电阻限流',
    ] : s.step === 2 ? [
      '• 断开瞬间电流不能突变，L 维持原电流继续流动',
      '• ε=−L·dI/dt 与电流同向，相当于一个临时电源',
      '• 灯泡回路仍闭合：L 的电流经灯泡继续流，灯闪亮',
      '• 灯泡里的电流方向与原来相反（看箭头）',
      '• 电流按 e^(−t/τ) 衰减，L 越大、闪亮越久',
      '• 断开时 ε 可能远高于电源电压，实际要防触电',
    ] : s.step === 3 ? [
      '• τ = L/R，单位：H/Ω = s',
      '• τ 只由 L、R 决定，与电源电压无关',
      '• L 越大 τ 越大，电流上升/衰减越慢',
      '• R 越大 τ 越小，但稳态电流 U/R 也越小',
      '• 把 C 换成 L 就是 RL 回路：电容 τ=RC、电感 τ=L/R',
      '• 5τ 后按稳态处理（误差 < 0.7%）',
    ] : [
      '• 直流：f=0 → X_L=2πfL=0，稳定后 L 就是导线',
      '• 交流：X_L=ωL 随频率成正比增大，阻碍电流',
      '• 所以电感「通直流、阻交流」，高频近乎断路',
      '• 电流滞后电压 φ=arctan(ωL/R)，L 越大滞后越多',
      '• 交流有效值 I=U/√(R²+X_L²)，与频率成反比',
      '• 电容「隔直通交」，电感「通直阻交」——一对反着来',
    ]).map((t) => ({ t, sp: 4 }))

    const viewTop = cardY + 34, viewH = cardH - 42
    const lineH = (it) => (it.h ? 22 : 19)
    const total = items.reduce((a, it) => a + lineH(it) + (it.sp || 0), 0) + 12
    const maxScroll = Math.max(0, total - viewH)
    if (maxScroll <= 1) S.current.cardScroll = 0
    S.current.cardScroll = clamp(S.current.cardScroll || 0, 0, maxScroll)
    cardRect.current = { x: cardX, y: cardY, w: cardW, h: cardH, maxScroll }

    ctx.save()
    ctx.beginPath(); ctx.rect(cardX + 6, viewTop, cardW - 18, viewH); ctx.clip()
    let cy2 = viewTop - S.current.cardScroll
    ctx.textBaseline = 'top'
    for (const it of items) {
      if (it.h) {
        setFont(ctx, 11.5, 'bold'); ctx.fillStyle = it.col || C.tealDark
        fitFont(ctx, it.h, cardW - 30, 11.5, 'bold')
        ctx.fillText(it.h, cardX + 12, cy2 + 3)
      } else {
        setFont(ctx, 10.2); ctx.fillStyle = C.sub
        fitFont(ctx, it.t, cardW - 30, 10.2)
        ctx.fillText(it.t, cardX + 12, cy2 + 2)
      }
      cy2 += lineH(it) + (it.sp || 0)
    }
    ctx.restore()
    if (maxScroll > 1) {
      // 底部淡出：滚下去的内容不会像被「切断」一样生硬
      const fadeH = 15
      ctx.save()
      ctx.beginPath(); ctx.roundRect(cardX, cardY, cardW, cardH, 8); ctx.clip()
      const g = ctx.createLinearGradient(0, viewTop + viewH - fadeH, 0, viewTop + viewH)
      g.addColorStop(0, 'rgba(246,251,249,0)'); g.addColorStop(1, 'rgba(246,251,249,1)')
      if (S.current.cardScroll < maxScroll - 2) {
        ctx.fillStyle = g; ctx.fillRect(cardX, viewTop + viewH - fadeH, cardW, fadeH)
      }
      if (S.current.cardScroll > 1) {
        const gt = ctx.createLinearGradient(0, viewTop, 0, viewTop + 13)
        gt.addColorStop(0, 'rgba(246,251,249,1)'); gt.addColorStop(1, 'rgba(246,251,249,0)')
        ctx.fillStyle = gt; ctx.fillRect(cardX, viewTop, cardW, 13)
      }
      ctx.restore()
      const bob = cardX + cardW - 7
      ctx.beginPath(); ctx.roundRect(bob, viewTop, 3.4, viewH, 2)
      ctx.fillStyle = 'rgba(147,165,173,0.22)'; ctx.fill()
      const th = Math.max(16, (viewH / total) * viewH)
      const ty = viewTop + (S.current.cardScroll / maxScroll) * (viewH - th)
      ctx.beginPath(); ctx.roundRect(bob, ty, 3.4, th, 2)
      ctx.fillStyle = 'rgba(18,166,155,0.6)'; ctx.fill()
    }
    ctx.textBaseline = 'alphabetic'
  }

  // ── 工具条 ──
  function drawToolbar(ctx, W, L, s, info) {
    const T = L.toolbar
    ctx.beginPath(); ctx.roundRect(T.x, T.y, T.w, T.h, 10)
    ctx.fillStyle = C.card; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke()
    const rowY = T.y + 22
    let bx = T.x + 20

    const sliderBlock = (label, valueTxt, ratio, name, onChange, accent, disabled) => {
      setFont(ctx, 9.5, 'bold'); ctx.fillStyle = disabled ? C.faint : C.ink
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText(label, bx, rowY - 12)
      setFont(ctx, 10, 'bold'); ctx.fillStyle = disabled ? C.faint : (accent || C.tealDark)
      ctx.textAlign = 'right'
      ctx.fillText(valueTxt, bx + 142, rowY - 12)
      ctx.textAlign = 'left'
      drawSlider(ctx, { x: bx, y: rowY + 8, w: 142, ratio, accent, name, onChange, disabled })
      bx += 166
    }

    const isMutual = s.step === 5
    sliderBlock(isMutual ? '原线圈自感 L₁' : '自感系数 L', `${s.L.toFixed(2)} H`, (s.L - 0.2) / 2.8, 'lSlider', (r) => {
      S.current.L = Math.round((0.2 + r * 2.8) * 100) / 100
      S.current.t = 0
      S.current.evt = null
    }, C.gold)
    if (isMutual) {
      sliderBlock('匝数比 N₂:N₁', `${(s.n ?? 2)} : 1`, ((s.n ?? 2) - 1) / 2, 'nSlider', (r) => {
        S.current.n = Math.round(1 + r * 2)
        S.current.t = 0
        S.current.evt = null
      }, C.teal)
    } else {
      sliderBlock('灯丝电阻 R', `${s.R} Ω`, (s.R - 2) / 18, 'rSlider', (r) => {
        S.current.R = Math.round(2 + r * 18)
        S.current.t = 0
      }, C.neg)
    }
    if (isMutual) {
      sliderBlock('灯丝电阻 R', `${s.R} Ω`, (s.R - 2) / 18, 'rSlider', (r) => {
        S.current.R = Math.round(2 + r * 18)
        S.current.t = 0
        S.current.evt = null
      }, C.neg)
    } else {
      sliderBlock('交流频率 f', s.f === 0 ? '0 Hz（直流）' : `${s.f} Hz`, s.f / 50, 'fSlider', (r) => {
        S.current.f = Math.round(r * 50)
        S.current.t = 0
      }, C.teal, s.step !== 4)
    }

    if (s.step !== 4) {
      drawBtn(ctx, bx, rowY - 16, 74, 26, s.closed ? '⏸ 断开' : '▶ 闭合', s.closed ? 'plain' : 'primary', () => toggleSwitch(), 'switchBtn')
      bx += 82
    } else {
      drawBtn(ctx, bx, rowY - 16, 62, 26, '直流 0 Hz', s.f === 0 ? 'primary' : 'plain', () => { S.current.f = 0; S.current.t = 0 }, 'preset0')
      bx += 68
      drawBtn(ctx, bx, rowY - 16, 62, 26, '工频 50 Hz', s.f === 50 ? 'primary' : 'plain', () => { S.current.f = 50; S.current.t = 0 }, 'preset50')
      bx += 68
    }
    drawBtn(ctx, bx, rowY - 16, 66, 26, '↺ 重置', 'ghost', () => {
      const st = S.current
      st.t = 0; st.L = 1.5; st.R = 5; st.f = 2; st.ghosts = []; st.evt = null
      st.n = 2; st.kc = 0.9; st.r1 = 1
      st.closed = st.step === 2 || st.step === 4
      if (st.step === 2) st.t = 5 * tauOf(st.L, st.R)
      say('已恢复初始状态')
    }, 'resetBtn')
    bx += 74
    if (s.step === 3) {
      drawBtn(ctx, bx, rowY - 16, 84, 26, '＋存对比曲线', 'plain', () => {
        const st = S.current
        if (st.ghosts.length >= 3) st.ghosts.shift()
        st.ghosts.push({ L: st.L, R: st.R, U: st.U })
        st.t = 0
        say(`已保存 τ=${fmtT(tauOf(st.L, st.R))} 的曲线`)
      }, 'ghostSave')
      bx += 92
      drawBtn(ctx, bx, rowY - 16, 66, 26, '清对比', 'ghost', () => { S.current.ghosts = [] }, 'ghostClear')
    }

    setFont(ctx, 8.5); ctx.fillStyle = C.faint
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    const hint = s.step === 1
      ? '合闸后灯泡慢慢变亮：电流不能突变，ε=−L·dI/dt 一直阻碍它增大，5τ 后才接近 U/R'
      : s.step === 2
        ? '先闭合到稳态，再断开：电源退出，L 维持电流经灯泡回路继续流，灯泡闪亮一下（灯里电流方向反了）'
        : s.step === 3
          ? 'τ=L/R：改 L 或 R，曲线疏密与灯泡亮/暗的快慢同时变化；把不同 τ 存成对比曲线最直观'
          : s.step === 5
            ? '两个回路各自闭合、只靠铁芯耦合：合闸和断闸的瞬间灯泡各闪一下，稳态时 ε₂=0、灯不亮——这就是互感'
            : 'f 越大感抗越大、灯泡越暗；拉到 0 Hz 就是直流，感抗为 0、灯泡最亮——这就是「通直流、阻交流」'
    const tail = s.step === 5
      ? `（τ₁=${fmtT(info.tau)}，ε₂ 峰值=${info.emfPeak.toFixed(1)} V）`
      : `（τ=${fmtT(info.tau)}，I₀=${info.I0.toFixed(2)} A）`
    fitFont(ctx, `${hint}${tail}`, T.w - 60, 8.5)
    ctx.fillText(`${hint}${tail}`, T.x + 20, T.y + 54)
    ctx.textBaseline = 'alphabetic'
  }

  function drawSlider(ctx, { x, y, w, ratio, onChange, accent, name, disabled }) {
    const ac = accent || C.teal
    ctx.beginPath(); ctx.roundRect(x, y - 3, w, 6, 3); ctx.fillStyle = '#DCE4E8'; ctx.fill()
    if (!disabled) { ctx.beginPath(); ctx.roundRect(x, y - 3, Math.max(3, clamp(ratio, 0, 1) * w), 6, 3); ctx.fillStyle = ac; ctx.fill() }
    const kx = x + clamp(ratio, 0, 1) * w
    ctx.beginPath(); ctx.arc(kx, y, 6.5, 0, Math.PI * 2)
    ctx.fillStyle = disabled ? '#E4EBEF' : '#fff'; ctx.fill()
    ctx.strokeStyle = disabled ? '#C9D6DB' : ac; ctx.lineWidth = 1.6; ctx.stroke()
    if (!disabled) pushArea({ n: name || 'slider', x: x - 10, y: y - 14, w: w + 20, h: 28, drag: 'slider', setX: (mx) => onChange(clamp((mx - x) / w, 0, 1)) })
  }

  function drawBtn(ctx, x, y, w, h, label, tone, onClick, name) {
    const t = {
      primary: { bg: C.teal, bd: C.tealDark, fg: '#fff' },
      plain: { bg: '#F3F8F9', bd: '#D2E1E6', fg: '#205863' },
      ghost: { bg: '#F6F7F8', bd: '#DDE3E6', fg: '#7A8A92' },
    }[tone] || { bg: '#fff', bd: '#ddd', fg: '#333' }
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 7)
    ctx.fillStyle = t.bg; ctx.fill(); ctx.strokeStyle = t.bd; ctx.lineWidth = 1; ctx.stroke()
    setFont(ctx, 10, 'bold'); ctx.fillStyle = t.fg
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    fitFont(ctx, label, w - 8, 10, 'bold')
    ctx.fillText(label, x + w / 2, y + h / 2 + 0.5)
    pushArea({ n: name || 'btn', x, y, w, h, onClick })
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'
  }

  function drawToast(ctx, W, s) {
    if (!s.toast || Date.now() > s.toast.until) return
    const text = s.toast.text
    setFont(ctx, 11, 'bold')
    const tw = ctx.measureText(text).width + 30
    const x = (W - tw) / 2, y = (ctx.canvas.height / devicePixelRatio) - 168
    ctx.beginPath(); ctx.roundRect(x, y, tw, 26, 13)
    ctx.fillStyle = 'rgba(24,40,48,0.92)'; ctx.fill()
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(text, W / 2, y + 13)
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'
  }

  // ═════════════════════════════════════════════
  //  Tab2 自己动手：接线 → 识别回路 → 跑 RL 通电自感
  //  与「⚡电容器充放电」同一套接线口径：点两个接线柱即连线、四色导线、
  //  器材沿用项目既有实拍/SVG（蓄电池 / 小灯泡 / 单向闸刀），线圈 L 用教学演示线圈矢量图
  // ═════════════════════════════════════════════
  function diyGeom(W, H) {
    const palW = 186, palX = W - palW - 12
    const org = { x: 14, y: 56 }
    const aw = palX - 12 - org.x, ah = H - 24 - org.y
    const sc = clamp(Math.min(aw / 900, ah / 560), 1, 1.34)
    DIYK = clamp(sc * 1.45, 1.7, 2.4)   // 大屏上器材跟着放大，避免"小零件拉长线"
    const area = { x1: aw / sc, y1: ah / sc }
    return { palW, palX, org, sc, area }
  }

  // 端口距离按"实拍图目标宽度"反推：柱帽正好落在端口上，三种器材视觉大小协调
  const TERM = {
    battery: 28.6,   // 蓄电池 accumulator_c.png 175×180：黑柱 (45,14)、红柱 (132,14)
    bulb: 37.6,      // 小灯泡 bulb_c.png 256×121：左 (38,74)、右 (213,74)
    switch: 32.7,    // 单向闸刀 SVG 176×110：柱心 26 / 151
    coil: 54,        // 演示线圈（矢量，本地坐标）：两柱 ±54
    transformer: 44, // 可拆变压器（矢量，本地坐标）：左一对柱 −44/−20，右一对柱 +20/+44
    mutualcoil: 34,  // 简易互感线圈（两只线圈筒）：柱 −58/−34 与 +34/+58
  }
  // 四柱器材：左右各一组（0、1 = 原线圈；2、3 = 副线圈），其余器材都是两个柱
  const PORT_X = { transformer: [-44, -20, 20, 44], mutualcoil: [-58, -34, 34, 58] }
  const portNum = (type) => (PORT_X[type] ? PORT_X[type].length : 2)
  let DIYK = 1.5   // 器材绘制放大倍数（随画布尺寸自适应，接线柱距离同步放大）

  // 单向闸刀的开合热点 = 刀末端的**黑色绝缘柄**（与 electricSvgInstruments 的 bladeSVG 同源：
  // 柄 rect 139,56.25,27,16.5，随刀绕铰链轴心 46.3,64.5 转 −27°）。捏柄才扳得动，点底座只选中/拖动。
  const SW_PIVOT = [46.3, 64.5], SW_GRIP = { x: 139, y: 56.25, w: 27, h: 16.5 }
  function swGripBox(closed) {
    const th = (closed ? 0 : -27) * Math.PI / 180
    const cos = Math.cos(th), sin = Math.sin(th)
    const cx = SW_GRIP.x + SW_GRIP.w / 2, cy = SW_GRIP.y + SW_GRIP.h / 2
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const dx = sx * SW_GRIP.w / 2, dy = sy * SW_GRIP.h / 2
      const px = cx + dx, py = cy + dy
      const rx = SW_PIVOT[0] + (px - SW_PIVOT[0]) * cos - (py - SW_PIVOT[1]) * sin
      const ry = SW_PIVOT[1] + (px - SW_PIVOT[0]) * sin + (py - SW_PIVOT[1]) * cos
      if (rx < x0) x0 = rx; if (rx > x1) x1 = rx
      if (ry < y0) y0 = ry; if (ry > y1) y1 = ry
    }
    return { x0, y0, x1, y1 }
  }
  // 柄框 → 器材本地坐标（drawDiyComp 里已 scale(DIYK)，不要再乘 DIYK）
  function swGripLocal(comp) {
    const g = swGripBox(comp.closed), bx = figBox('switch')
    if (!bx) return null
    return { x: bx.x0 + g.x0 * bx.scale, y: bx.y0 + g.y0 * bx.scale, w: (g.x1 - g.x0) * bx.scale, h: (g.y1 - g.y0) * bx.scale }
  }
  // 柄框 → 世界坐标（命中判定用；多给 5 个图内像素的容错）
  function swGripWorld(comp) {
    const g = swGripBox(comp.closed), bx = figBox('switch')
    if (!bx) return null
    const pad = 5
    return {
      x0: comp.x + (bx.x0 + (g.x0 - pad) * bx.scale) * DIYK,
      x1: comp.x + (bx.x0 + (g.x1 + pad) * bx.scale) * DIYK,
      y0: comp.y + (bx.y0 + (g.y0 - pad) * bx.scale) * DIYK,
      y1: comp.y + (bx.y0 + (g.y1 + pad) * bx.scale) * DIYK,
    }
  }

  function termPos(comp, i) {
    const px = PORT_X[comp.type]
    if (px) return { x: comp.x + px[i] * DIYK, y: comp.y }
    const d = (TERM[comp.type] || 26) * DIYK
    return { x: comp.x + (i === 0 ? -d : d), y: comp.y }
  }
  // 接线：两根柱之间加一条线（同一条不许重复接），颜色取当前选的导线颜色
  function addWire(a, b) {
    const dy = S.current.diy
    const dup = dy.wires.some((w) => (
      (w.from.compId === a.compId && w.from.port === a.port && w.to.compId === b.compId && w.to.port === b.port)
      || (w.to.compId === a.compId && w.to.port === a.port && w.from.compId === b.compId && w.from.port === b.port)
    ))
    if (!dup) dy.wires.push({ id: dy.wires.length + 1, from: { compId: a.compId, port: a.port }, to: { compId: b.compId, port: b.port }, color: dy.wireColor })
    dy.t = 0
    dy.hot = false
    dy.evt = null
  }

  // 回路识别（与电容器场景同一套口径 + 并联续流）：
  //   先把「只用导线相连」的接线柱并成节点组，再把每个器材当作节点组之间的一条边，
  //   从 电源0 到 电源1 走最短的器材路径 → 串联；若另一个器材两端与路径上的器材同组 → 并联（续流）
  function analyseLoop(dy) {
    const par = new Map()
    const find = (x) => {
      if (!par.has(x)) par.set(x, x)
      let r = x
      while (par.get(r) !== r) r = par.get(r)
      let c = x
      while (par.get(c) !== c) { const nx = par.get(c); par.set(c, r); c = nx }
      return r
    }
    const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) par.set(ra, rb) }
    for (const w of dy.wires) union(`${w.from.compId}:${w.from.port}`, `${w.to.compId}:${w.to.port}`)

    const src = dy.comps.find((c) => c.type === 'battery')
    if (!src) return { ok: false, reason: '先放一个电源（蓄电池 12 V）' }

    const edgesOf = new Map()
    const addEdge = (c, p0, p1, wind) => {
      const a = find(`${c.id}:${p0}`), b = find(`${c.id}:${p1}`)
      if (a === b) return                   // 两端被导线短接：无电流，跳过
      if (!edgesOf.has(a)) edgesOf.set(a, [])
      if (!edgesOf.has(b)) edgesOf.set(b, [])
      edgesOf.get(a).push({ comp: c, to: b, wind })
      edgesOf.get(b).push({ comp: c, to: a, wind })
    }
    for (const c of dy.comps) {
      if (c.id === src.id) continue          // 电源自身不做穿行边，免得 0→1 直接短路
      if (c.type === 'transformer' || c.type === 'mutualcoil') { // 双绕组：两组彼此不通，各算一条边
        addEdge(c, 0, 1, 'p')
        addEdge(c, 2, 3, 's')
      } else addEdge(c, 0, 1, null)
    }

    const start = find(`${src.id}:0`), goal = find(`${src.id}:1`)
    const prev = new Map([[start, null]])
    const q = [start]
    let reached = false
    while (q.length) {
      const cur = q.shift()
      if (cur === goal) { reached = true; break }
      for (const e of edgesOf.get(cur) || []) {
        if (prev.has(e.to)) continue
        prev.set(e.to, { from: cur, comp: e.comp, to: e.to, wind: e.wind })
        q.push(e.to)
      }
    }
    if (!reached) {
      return { ok: false, reason: '回路没有闭合：用导线把电源、开关、线圈 L、小灯泡接成一个环' }
    }
    const pathComps = []
    let node = goal
    while (node !== start) {
      const p = prev.get(node)
      if (!p) break
      pathComps.unshift({ comp: p.comp, wind: p.wind })
      node = p.from
    }

    const tfEdge = pathComps.find((e) => e.wind === 'p')
    if (tfEdge) {
      // ── 互感回路：原回路（电源+开关+第一个线圈）+ 副回路（第二个线圈+小灯泡）──
      const tf = tfEdge.comp
      const isCoil = tf.type === 'mutualcoil'
      // 可拆变压器：N₂:N₁ 可调、k≈0.9；简易互感线圈：1:1，插铁芯 k≈0.9、空气芯 k≈0.28
      const n = isCoil ? 1 : (tf.n ?? 2)
      const kc = isCoil ? (tf.core ? 0.9 : 0.28) : (tf.kc ?? 0.9)
      const Ls = tf.h ?? (isCoil ? 1.0 : 1.5)
      const r1 = 1
      const U = (src.u ?? 12)
      const switchComp = pathComps.find((e) => e.comp.type === 'switch')?.comp || null
      // 开关断开也照常识别成互感回路：没通电只是 ε₂=0，重搭时不用退回「回路还没搭好」
      // 副线圈回路：从 tf 的 2 号柱走到 3 号柱（不许穿原线圈那条边）
      const sStart = find(`${tf.id}:2`), sGoal = find(`${tf.id}:3`)
      if (sStart === sGoal) return { ok: false, reason: '副线圈的两个柱子被导线短接了' }
      const sprev = new Map([[sStart, null]])
      const sq = [sStart]
      let sReached = false
      while (sq.length) {
        const cur = sq.shift()
        if (cur === sGoal) { sReached = true; break }
        for (const e of edgesOf.get(cur) || []) {
          if (e.comp === tf) continue          // 不能从变压器自己身上穿过去
          if (sprev.has(e.to)) continue
          sprev.set(e.to, { from: cur, comp: e.comp, to: e.to })
          sq.push(e.to)
        }
      }
      if (!sReached) return { ok: false, reason: '副线圈回路还没闭合：把副线圈的两个柱子接到小灯泡两端' }
      const secComps = []
      let sn = sGoal
      while (sn !== sStart) {
        const p = sprev.get(sn)
        if (!p) break
        secComps.unshift(p.comp)
        sn = p.from
      }
      const bulb = secComps.find((c) => c.type === 'bulb')
      if (!bulb) return { ok: false, reason: `副线圈回路里还没有小灯泡（路径 ${secComps.map((c) => c.type).join('/') || '空'}）` }
      const Rk = bulb.r || 5
      return {
        ok: true, mode: 'mutual', U, Ls, r1, n, kc, Rk,
        isCoil, core: !!tf.core, tf,
        M: kc * n * Ls, ePeak: kc * n * U, tau: Ls / r1,
        I2Normal: U / Rk, I2Peak: (kc * n * U) / Rk,
        switchComp, bulb,
      }
    }

    const compsOnPath = pathComps.map((e) => e.comp)
    const coils = compsOnPath.filter((c) => c.type === 'coil')
    const bulbs = compsOnPath.filter((c) => c.type === 'bulb')
    const switchComp = compsOnPath.find((c) => c.type === 'switch') || null
    const openSwitch = !!(switchComp && !switchComp.closed)
    const U = (src.u ?? 12)

    // 串联：电源回路里同时有 L 和灯泡
    if (coils.length && bulbs.length) {
      if (openSwitch) return { ok: false, reason: '开关是断开的：点闸刀黑柄（或点面板按钮）闭合', needClose: true }
      const Rk = bulbs.reduce((a, c) => a + (c.r || 5), 0)
      const Ls = coils.reduce((a, c) => a + (c.h || 1.5), 0)
      return { ok: true, mode: 'series', U, Rk, Ls, tau: Ls / Rk, I0: U / Rk, switchComp }
    }

    // 电源回路里只有 L（或只有灯泡）：看另一个是否与它两端同组 → 并联续流
    const onPath = coils[0] || bulbs[0]
    if (!onPath) return { ok: false, reason: '回路里还没有线圈（电感 L）' }
    const partner = (onPath.type === 'coil' ? dy.comps.filter((c) => c.type === 'bulb') : dy.comps.filter((c) => c.type === 'coil'))
      .find((c) => find(`${c.id}:0`) === find(`${onPath.id}:0`) && find(`${c.id}:1`) === find(`${onPath.id}:1`))
    if (!partner) {
      return { ok: false, reason: onPath.type === 'coil' ? '回路里还没有小灯泡' : '回路里还没有线圈（电感 L）' }
    }

    // 并联续流（L ∥ 灯泡，开关只切电源支路）：
    //   闭合：线圈按 r_L=1 Ω 取大电流 I_L=U/r_L，灯泡按 U/R 正常亮；
    //   断开：L 的电流经灯泡继续流，起始比正常亮 I_L/I_bulb 倍 → 灯泡闪亮，τ = L/(r_L + R灯)
    const Ls = coils.length ? coils.reduce((a, c) => a + (c.h || 1.5), 0) : partner.h || 1.5
    const Rk = (onPath.type === 'bulb' ? onPath.r : partner.r) || 5
    const rL = 1
    return {
      ok: true, mode: 'shunt', U, Rk, rL, Ls,
      tau: Ls / (rL + Rk), I0: U / rL, Ib0: U / Rk, flashX: (U / rL) / (U / Rk),
      openSwitch, switchComp, coilComp: onPath.type === 'coil' ? onPath : partner,
    }
  }

  // 扳一下闸刀（黑柄或面板按钮都走这里）：串联/并联/互感三种口径的提示与状态复位
  function toggleSwitchComp(comp) {
    const dy = S.current.diy
    comp.closed = !comp.closed
    dy.t = 0
    const r = analyseLoop(dy)
    if (r.ok && r.mode === 'mutual') {
      dy.evt = comp.closed ? 'on' : 'off'
      say(comp.closed
        ? '合闸：原线圈电流上升 → 磁通变化 → 副线圈的灯泡闪一下'
        : '断闸：磁通减小 → 副线圈反向再闪一下')
      return
    }
    dy.evt = null
    if (comp.closed) {
      say(r.ok && r.mode === 'shunt'
        ? '合闸：灯泡立刻正常亮；L 里的电流按 τ=L/r_L 慢慢爬到 I_L（通直流后 L 才相当于导线）'
        : '开关闭合：电流从 0 按 e^(−t/τ) 升到 I₀')
    } else if (r.ok && r.mode === 'shunt') {
      say('开关断开：L 的电流经灯泡续流，灯泡闪亮一下')
    } else if (r.ok) {
      say('开关断开：L 想维持电流却无路可走，实景会打火')
    } else {
      say('开关断开')
    }
  }

  // 当前时刻的电流/亮度（串联与并联续流两种走法各自算）
  function diyNow(res, dy) {
    if (!res.ok) return { iL: 0, iBulb: 0, bright: 0, open: false, flashing: false, emf: 0 }
    const open = !!res.switchComp && !res.switchComp.closed
    if (res.mode === 'mutual') {
      // 互感：ε₂ = M·dI₁/dt = k·n·U·e^(−t/τ₁)，副线圈里 i₂ = ε₂/R灯
      if (!dy.evt) return { iL: 0, iBulb: 0, bright: 0, open, flashing: false, emf: 0 }
      const e = res.ePeak * Math.exp(-dy.t / Math.max(res.tau, 1e-6))
      const i2 = e / res.Rk
      const ratio = i2 / Math.max(res.I2Normal, 1e-6)
      return { iL: 0, iBulb: i2, bright: clamp(ratio, 0, 2.2) / 1.6, open, flashing: ratio > 1.02, emf: e }
    }
    if (res.mode === 'shunt') {
      if (!open) return { iL: res.I0, iBulb: res.Ib0, bright: 1, open: false, flashing: false }
      const i = res.I0 * Math.exp(-dy.t / Math.max(res.tau, 1e-6))
      const ratio = i / Math.max(res.Ib0, 1e-6)
      return { iL: i, iBulb: i, bright: clamp(ratio, 0, 2.4) / 1.5, open: true, flashing: ratio > 1.05 }
    }
    const i = open ? 0 : res.I0 * (1 - Math.exp(-dy.t / Math.max(res.tau, 1e-6)))
    return { iL: i, iBulb: i, bright: Math.pow(clamp(i / Math.max(res.I0, 1e-6), 0, 1), 1.15), open, flashing: false }
  }

  function renderDiy(ctx, W, H) {
    const s = S.current, dy = s.diy
    const A = diyGeom(W, H)
    canvasRef.current._diyView = { ox: A.org.x, oy: A.org.y, sc: A.sc, k: DIYK }
    const res = analyseLoop(dy)
    const now = diyNow(res, dy)
    if (res.ok) {
      const open = res.switchComp && !res.switchComp.closed
      if (res.mode === 'mutual') {
        if (!dy.evt) dy.t = 0
        else if (dy.t >= 5 * res.tau) dy.t = 5 * res.tau
      } else if (res.mode === 'shunt') {
        if (!open && dy.t > 0) dy.t = 0          // 并联：闭合时直接停在稳态
        else if (open && dy.t >= 5 * res.tau) dy.t = 5 * res.tau
      } else if (!open && dy.t >= 5 * res.tau) dy.t = 5 * res.tau
    } else if (dy.t > 0 && !res.needClose) dy.t = 0

    setFont(ctx, 13, 'bold'); ctx.fillStyle = C.ink
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('自己动手 · 搭一个通电／断电自感电路', A.org.x + 4, 14)
    setFont(ctx, 10); ctx.fillStyle = C.sub
    fitFont(ctx, '点右侧器材再点画布落位；点两个接线柱连线（点器材本体即吸附到最近的柱）；点闸刀黑柄通断；右键删除。「一键标准电路」= 串联通电自感，「一键并联续流」= L ∥ 灯泡，「一键互感回路」= 变压器原、副线圈各接一边', A.area.x1 * A.sc - 8, 10)
    ctx.fillText('点右侧器材再点画布落位；点两个接线柱连线（点器材本体即吸附到最近的柱）；点闸刀黑柄通断；右键删除。「一键标准电路」= 串联通电自感，「一键并联续流」= L ∥ 灯泡，「一键互感回路」= 变压器原、副线圈各接一边', A.org.x + 4, 33)

    ctx.save(); ctx.translate(A.org.x, A.org.y); ctx.scale(A.sc, A.sc)
    ctx.beginPath(); ctx.roundRect(0, 0, A.area.x1, A.area.y1, 10)
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#E7EEF2'; ctx.lineWidth = 1; ctx.stroke()
    ctx.fillStyle = 'rgba(140,165,175,0.2)'
    for (let x = 14; x < A.area.x1; x += 26) {
      for (let y = 14; y < A.area.y1; y += 26) { ctx.beginPath(); ctx.arc(x, y, 0.9, 0, Math.PI * 2); ctx.fill() }
    }

    // 导线（三次贝塞尔，从接线柱水平出线 —— 与项目其它电学「自己动手」同一套走线）
    for (const w of dy.wires) {
      const c1 = dy.comps.find((c) => c.id === w.from.compId)
      const c2 = dy.comps.find((c) => c.id === w.to.compId)
      if (!c1 || !c2) continue
      const p1 = termPos(c1, w.from.port), p2 = termPos(c2, w.to.port)
      strokeBezierWire(ctx, p1, p2, w.color || dy.wireColor, null, null, w.from.port, w.to.port)
    }
    if (dy.connecting) {
      const c1 = dy.comps.find((c) => c.id === dy.connecting.compId)
      if (c1) {
        const p1 = termPos(c1, dy.connecting.port)
        strokeWirePreview(ctx, p1, { x: dy.mx, y: dy.my }, '#FF9800', dy.connecting.port)
      }
    }
    // 小灯泡亮度：串联按 i/I₀ 归一；并联续流在断开瞬间可超过 100%（闪一下）
    for (const c of dy.comps) drawDiyComp(ctx, c, dy.sel === c.id, now.bright)

    // 接线模式下把所有接线柱标成热点（画在器材之上，否则被实拍图盖住）：点任意两个就接上
    if (dy.connecting) {
      for (const c of dy.comps) {
        for (let i = 0; i < portNum(c.type); i++) {
          const t = termPos(c, i)
          ctx.beginPath(); ctx.arc(t.x, t.y, 6.2, 0, Math.PI * 2)
          ctx.strokeStyle = 'rgba(226,163,60,0.95)'; ctx.lineWidth = 1.8; ctx.stroke()
          ctx.beginPath(); ctx.arc(t.x, t.y, 2.2, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(226,163,60,0.9)'; ctx.fill()
        }
      }
      const c1 = dy.comps.find((c) => c.id === dy.connecting.compId)
      if (c1) {
        const p1 = termPos(c1, dy.connecting.port)
        ctx.beginPath(); ctx.arc(p1.x, p1.y, 4.4, 0, Math.PI * 2)
        ctx.fillStyle = '#FF9800'; ctx.fill()
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.stroke()
      }
    }

    if (!dy.comps.length) {
      setFont(ctx, 12); ctx.fillStyle = C.faint
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('点右侧「一键标准电路」可立刻得到 电源—开关—线圈 L—小灯泡 的串联回路', A.area.x1 / 2, A.area.y1 / 2)
      ctx.textBaseline = 'alphabetic'
    }

    drawDiyStatus(ctx, A, res, dy, now)
    ctx.restore()

    drawDiyPalette(ctx, A, W, H, s, dy)
    if (dy.hold) { drawDiyIcon(ctx, dy.mx || 0, dy.my || 0, dy.hold, 1.3) }
    drawToast(ctx, W, s)
    pushArea({ n: 'diyStage', x: A.org.x, y: A.org.y, w: A.area.x1 * A.sc, h: A.area.y1 * A.sc })
  }

  // ── 器材图：与项目既有电学器材同一套（蓄电池 / 小灯泡 / 单向闸刀 SVG）──
  //    a、b 是实拍图里两个柱帽圆心的像素坐标，用来把柱帽对齐到引擎的端口 (±TERM, 0)
  const DIY_FIG = {
    battery: { file: 'accumulator_c.png', w: 175, h: 180, a: [45, 14], b: [132, 14] },
    bulb: { file: 'bulb_c.png', w: 256, h: 121, a: [38, 74], b: [213, 74] },
    switch: { svg: true, w: 176, h: 110, a: [26, 82], b: [151, 82] },
  }
  const DIY_SPRITE = new Map()
  // 单向闸刀 SVG 有「合/断」两态，各自栅格化一份（data URL → Image，纯矢量、不带外部图片）
  const SW_SPRITE = { open: null, closed: null }
  function switchSprite(closed) {
    const key = closed ? 'closed' : 'open'
    let e = SW_SPRITE[key]
    if (!e) {
      const img = new Image()
      e = { img, ready: false }
      img.onload = () => { e.ready = true }
      const svg = TYPES.switch.render({ id: closed ? 'siSwC' : 'siSwO', closed })
      // 独立成 data URL 时必须补 xmlns，否则浏览器不当作 SVG 图形（只显示 XML 树）
      const withNs = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(withNs)
      SW_SPRITE[key] = e
    }
    return e.ready ? { img: e.img, def: DIY_FIG.switch } : null
  }
  function diySprite(type, closed = false) {
    if (type === 'switch') return switchSprite(closed)
    const def = DIY_FIG[type]
    if (!def) return null
    let e = DIY_SPRITE.get(type)
    if (!e) {
      const img = new Image()
      e = { img, ready: false }
      img.onload = () => { e.ready = true }
      img.src = figURL(def.file)
      DIY_SPRITE.set(type, e)
    }
    return e.ready ? { img: e.img, def } : null
  }
  // 图片 → 本体坐标（柱帽落点对齐 ±TERM）
  function figBox(type) {
    if (type === 'transformer') return { scale: 1, term: TERM.transformer, x0: -80, y0: -56, w: 160, h: 152 }
    if (type === 'mutualcoil') return { scale: 1, term: TERM.mutualcoil, x0: -88, y0: -12, w: 176, h: 116 }
    const def = DIY_FIG[type]
    if (!def) return { scale: 1, term: TERM[type] || 26, x0: -66, y0: -48, w: 132, h: 62 }
    const term = TERM[type] || 26
    const scale = (2 * term) / (def.b[0] - def.a[0])
    return { scale, term, x0: -term - def.a[0] * scale, y0: -def.a[1] * scale, w: def.w * scale, h: def.h * scale }
  }
  function figPt(type, px, py) {
    const bx = figBox(type)
    return { x: bx.x0 + px * bx.scale, y: bx.y0 + py * bx.scale }
  }
  function compExtent(type) {
    const bx = figBox(type)
    const T = (TERM[type] || 26) * DIYK
    if (type === 'transformer') {
      return { x0: -80 * DIYK, x1: 80 * DIYK, y0: -56 * DIYK, y1: 98 * DIYK }
    }
    if (type === 'mutualcoil') {
      return { x0: -90 * DIYK, x1: 90 * DIYK, y0: -14 * DIYK, y1: 104 * DIYK }
    }
    if (!bx || !DIY_FIG[type]) {
      return { x0: -70 * DIYK, x1: 70 * DIYK, y0: -50 * DIYK, y1: 26 * DIYK }
    }
    // 命中框一律换算成世界坐标：器材是按 DIYK 放大后画出来的（figBox 是放大前的本地尺寸），
    // 少了这一步，可见开关的刀身（比端口线高出 70 多像素）就点不中、双击也不通断。
    return {
      x0: Math.min(bx.x0 * DIYK, -T), x1: Math.max((bx.x0 + bx.w) * DIYK, T),
      y0: bx.y0 * DIYK, y1: (bx.y0 + bx.h) * DIYK,
    }
  }

  // 演示线圈（照实物参考图 线圈_25.png 画）：浅灰底板 + 空气芯密绕铜螺线管 +
  // 两端铜引线下落 + 左黑右红接线柱（矢量，无照片）
  function drawCoil(ctx, comp) {
    const T = TERM.coil
    const N = 22, x0 = -46, x1 = 46, cy = -33, ry = 15, rx = 4.0
    // 底板投影
    ctx.beginPath(); ctx.ellipse(0, 15.4, 60, 2.2, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(120,132,140,0.12)'; ctx.fill()
    // 底板（浅灰塑料/铝板，上亮下暗）
    const bg = ctx.createLinearGradient(0, 4.5, 0, 14)
    bg.addColorStop(0, '#F4F7F8'); bg.addColorStop(0.2, '#DEE3E5'); bg.addColorStop(0.62, '#C4CACD'); bg.addColorStop(1, '#AEB5B9')
    ctx.beginPath(); ctx.roundRect(-68, 4.5, 136, 9.5, 1.6)
    ctx.fillStyle = bg; ctx.fill()
    ctx.strokeStyle = '#949CA1'; ctx.lineWidth = 0.8; ctx.stroke()
    // 板面高光条 + 下沿暗边
    ctx.beginPath(); ctx.moveTo(-65.5, 5.8); ctx.lineTo(65.5, 5.8)
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.1; ctx.stroke()
    ctx.beginPath(); ctx.moveTo(-65.5, 13.1); ctx.lineTo(65.5, 13.1)
    ctx.strokeStyle = 'rgba(90,100,106,0.3)'; ctx.lineWidth = 0.9; ctx.stroke()

    // 线圈在底板上的投影
    ctx.beginPath(); ctx.ellipse(0, 6.4, 47, 2.6, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(120,132,140,0.16)'; ctx.fill()

    // 两端铜引线：线圈端头 → 柱顶
    const lead = (sx) => {
      const lg = ctx.createLinearGradient(sx * 50 - 2.6, 0, sx * 50 + 2.6, 0)
      lg.addColorStop(0, '#8A4A12'); lg.addColorStop(0.35, '#DEA05A'); lg.addColorStop(0.6, '#C1732C'); lg.addColorStop(1, '#7B3F0E')
      ctx.beginPath()
      ctx.moveTo(sx * 44, cy)
      ctx.quadraticCurveTo(sx * 50.6, cy + 6, sx * 50.6, cy + 20)
      ctx.lineTo(sx * 50.6, 0)
      ctx.strokeStyle = lg; ctx.lineWidth = 3.4; ctx.lineCap = 'round'; ctx.stroke()
      ctx.lineCap = 'butt'
    }
    lead(-1); lead(1)

    // 空气芯密绕：一匝一个竖椭圆，匝间留缝，能看见背后的白底
    for (let i = 0; i < N; i++) {
      const cx = x0 + (i * (x1 - x0)) / (N - 1)
      const cg = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0)
      cg.addColorStop(0, '#7C3F11'); cg.addColorStop(0.16, '#CF8C43'); cg.addColorStop(0.4, '#F3BE7C')
      cg.addColorStop(0.62, '#C87A31'); cg.addColorStop(0.86, '#8E4B16'); cg.addColorStop(1, '#6B370C')
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
      ctx.strokeStyle = cg; ctx.lineWidth = 2.5; ctx.stroke()
      // 每匝右下的暗边（增强"铜线圆柱"的立体感）
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, Math.PI * 0.15, Math.PI * 0.85)
      ctx.strokeStyle = 'rgba(80,42,10,0.32)'; ctx.lineWidth = 0.8; ctx.stroke()
    }

    // 接线柱：银底圈 + 黑/红柱帽（与其它器材同款柱帽）
    const post = (x, red) => {
      // 银色底圈
      const sg = ctx.createLinearGradient(x - 5.6, 0, x + 5.6, 0)
      sg.addColorStop(0, '#6E7A80'); sg.addColorStop(0.4, '#D7DEE2'); sg.addColorStop(1, '#63707A')
      ctx.beginPath(); ctx.roundRect(x - 5.6, -1.6, 11.2, 5.2, 1.6)
      ctx.fillStyle = sg; ctx.fill()
      ctx.strokeStyle = 'rgba(60,70,76,0.6)'; ctx.lineWidth = 0.7; ctx.stroke()
      // 柱帽
      const g = ctx.createLinearGradient(x - 5, -10, x + 5, 0)
      if (red) { g.addColorStop(0, '#F4725F'); g.addColorStop(0.45, '#D8331F'); g.addColorStop(1, '#8E1B12') }
      else { g.addColorStop(0, '#6C757B'); g.addColorStop(0.42, '#33393D'); g.addColorStop(1, '#141819') }
      ctx.beginPath(); ctx.roundRect(x - 4.9, -9.6, 9.8, 8.6, 2.2)
      ctx.fillStyle = g; ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 0.7; ctx.stroke()
      // 帽顶椭圆 + 一道环形高光
      ctx.beginPath(); ctx.ellipse(x, -9.6, 4.9, 1.9, 0, 0, Math.PI * 2)
      ctx.fillStyle = red ? '#FF9184' : '#8A939A'; ctx.fill()
      ctx.beginPath(); ctx.ellipse(x, -4.6, 4.9, 1.5, 0, 0, Math.PI)
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 0.8; ctx.stroke()
    }
    post(-T, false); post(T, true)

    // 参数标签
    setFont(ctx, 9, 'bold'); ctx.fillStyle = C.ink
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(`L = ${(comp.h ?? 1.5).toFixed(2)} H`, 0, 17)
  }

  // 自己动手页的「可拆变压器」1:1 实物造型：
  //   黑塑料底座 + 左绿右红两块线圈托板 + 两筒铜绕组 + 顶上银托板与 4 个接线柱 +
  //   一根从**下方**插入、连通两线圈的硅钢片铁芯（两腿穿进线圈筒、底部一条横轭）。
  //   世界坐标原点 = 四个接线柱所在的那条水平线，机身整体在原点下方。
  function drawXfInst(ctx, comp) {
    const n = comp.n ?? 2

    // 硅钢片铁芯（先画，让线圈和底座压在它前面 —— 看起来就是"从下方插进线圈筒里"）：
    // 两条腿从底部横轭往上穿进左右线圈，顶端露出一点；底部一条横轭把两腿连成一条闭合磁路。
    const steel = (x, y, wid, hei, seamX) => {
      const g = ctx.createLinearGradient(x, 0, x + wid, 0)
      g.addColorStop(0, '#F0F4F6'); g.addColorStop(0.22, '#D2DADF'); g.addColorStop(0.55, '#AEB8BE')
      g.addColorStop(0.85, '#8E989E'); g.addColorStop(1, '#707A80')
      ctx.beginPath(); ctx.roundRect(x, y, wid, hei, 1.2)
      ctx.fillStyle = g; ctx.fill()
      ctx.strokeStyle = 'rgba(84,96,103,0.85)'; ctx.lineWidth = 0.8; ctx.stroke()
      for (const s of seamX) {                    // 叠片缝
        ctx.beginPath(); ctx.moveTo(s, y + 0.8); ctx.lineTo(s, y + hei - 0.8)
        ctx.strokeStyle = 'rgba(120,132,139,0.45)'; ctx.lineWidth = 0.6; ctx.stroke()
      }
    }
    steel(-38.5, -2, 13, 72, [-34, -29])          // 左腿（穿左线圈）
    steel(25.5, -2, 13, 72, [30, 35])             // 右腿（穿右线圈）
    steel(-52, 61, 104, 11, [-44, -36, -8, 8, 36, 44])   // 底部横轭：把两条腿连成一体

    // 底座
    ctx.beginPath()
    ctx.moveTo(-70, 48); ctx.lineTo(70, 48); ctx.lineTo(64, 64); ctx.lineTo(-64, 64)
    ctx.closePath()
    const bg = ctx.createLinearGradient(0, 48, 0, 64)
    bg.addColorStop(0, '#3C444A'); bg.addColorStop(0.3, '#272D31'); bg.addColorStop(1, '#131719')
    ctx.fillStyle = bg; ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.8; ctx.stroke()
    for (const sx of [-42, 0, 42]) {
      ctx.beginPath(); ctx.arc(sx, 56, 2.1, 0, Math.PI * 2)
      ctx.fillStyle = '#BCC4C9'; ctx.fill()
      ctx.beginPath(); ctx.moveTo(sx - 1.3, 56); ctx.lineTo(sx + 1.3, 56)
      ctx.strokeStyle = '#798389'; ctx.lineWidth = 0.9; ctx.stroke()
    }

    // 铁芯下半段：从线圈底下伸出来穿过底座，在底座下沿接上横轭
    steel(-38.5, 45, 13, 27, [-34, -29])
    steel(25.5, 45, 13, 27, [30, 35])
    steel(-46, 62, 92, 9, [-40, -32, -8, 8, 32, 40])

    // 线圈托板（左绿右红）
    const plate = (x0, x1, c0, c1) => {
      ctx.beginPath(); ctx.roundRect(x0, 44, x1 - x0, 8, 2)
      const g = ctx.createLinearGradient(0, 44, 0, 52)
      g.addColorStop(0, c0); g.addColorStop(1, c1)
      ctx.fillStyle = g; ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.8; ctx.stroke()
    }
    plate(-60, -4, '#43A96B', '#1F6E3D')
    plate(4, 60, '#DA5A4C', '#8C2A21')

    // 铜绕组（原线圈 N₁=6 匝，副线圈 6·n 匝 —— 匝数比一眼看得出）
    const winding = (x0, x1, turns) => {
      const g = ctx.createLinearGradient(x0, 0, x1, 0)
      g.addColorStop(0, '#5A2A07'); g.addColorStop(0.1, '#A05C1C'); g.addColorStop(0.32, '#E3A76C')
      g.addColorStop(0.55, '#C87E34'); g.addColorStop(0.84, '#8F4C17'); g.addColorStop(1, '#552705')
      ctx.beginPath(); ctx.roundRect(x0, 12, x1 - x0, 33, 4)
      ctx.fillStyle = g; ctx.fill()
      const top = 14, gap = 29 / turns
      for (let i = 0; i < turns; i++) {
        const y = top + i * gap
        ctx.beginPath(); ctx.roundRect(x0 + 1.6, y, x1 - x0 - 3.2, Math.max(1.5, gap * 0.6), 1)
        ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fill()
        ctx.beginPath(); ctx.moveTo(x0 + 1.6, y + gap * 0.82); ctx.lineTo(x1 - 1.6, y + gap * 0.82)
        ctx.strokeStyle = 'rgba(58,26,5,0.42)'; ctx.lineWidth = 0.9; ctx.stroke()
      }
      for (const y of [9.6, 43.4]) {            // 两端的浅灰塑料挡板
        ctx.beginPath(); ctx.roundRect(x0 - 1, y, x1 - x0 + 2, 4.6, 1.5)
        const pg = ctx.createLinearGradient(0, y, 0, y + 4.6)
        pg.addColorStop(0, '#F2F5F6'); pg.addColorStop(1, '#C3CBCF')
        ctx.fillStyle = pg; ctx.fill()
        ctx.strokeStyle = '#A9B1B5'; ctx.lineWidth = 0.7; ctx.stroke()
      }
    }
    winding(-54, -10, 6)
    winding(10, 54, Math.min(14, Math.max(4, Math.round(6 * n))))

    // 顶部银色标牌
    for (const [x0, x1] of [[-55, -9], [9, 55]]) {
      ctx.beginPath(); ctx.roundRect(x0, 3.2, x1 - x0, 7.4, 2)
      const g = ctx.createLinearGradient(0, 3.2, 0, 10.6)
      g.addColorStop(0, '#FAFCFD'); g.addColorStop(0.5, '#D7DFE3'); g.addColorStop(1, '#AAB4B9')
      ctx.fillStyle = g; ctx.fill()
      ctx.strokeStyle = '#8D979D'; ctx.lineWidth = 0.8; ctx.stroke()
    }

    // 4 个接线柱（左黑右红，与其它器材同款柱帽）
    const post = (x, red) => {
      ctx.beginPath(); ctx.roundRect(x - 1.6, -2.4, 3.2, 6, 1)
      ctx.fillStyle = '#CBD4D8'; ctx.fill()
      const g = ctx.createLinearGradient(x - 5, -10, x + 5, 0)
      if (red) { g.addColorStop(0, '#F4725F'); g.addColorStop(0.45, '#D8331F'); g.addColorStop(1, '#8E1B12') }
      else { g.addColorStop(0, '#6C757B'); g.addColorStop(0.42, '#33393D'); g.addColorStop(1, '#141819') }
      ctx.beginPath(); ctx.roundRect(x - 4.6, -10.4, 9.2, 9, 2.2)
      ctx.fillStyle = g; ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 0.7; ctx.stroke()
      ctx.beginPath(); ctx.ellipse(x, -10.4, 4.6, 1.8, 0, 0, Math.PI * 2)
      ctx.fillStyle = red ? '#FF9184' : '#8A939A'; ctx.fill()
    }
    post(-44, false); post(-20, true)
    post(20, false); post(44, true)

    // 器材标注
    setFont(ctx, 9, 'bold'); ctx.fillStyle = C.ink
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(`变压器 L₁=${(comp.h ?? 1.5).toFixed(2)} H　N₂:N₁=${n}:1`, 0, 78)
    setFont(ctx, 7.5); ctx.fillStyle = C.faint
    ctx.fillText('硅钢片铁芯从下方插入，把两个线圈连成一条磁路', 0, 89)
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
  }

  // 自己动手页的「简易互感线圈」1:1 实物造型（照实验室那种两只线圈筒画）：
  //   两只立着的铜线圈筒（红色绕线 + 顶银盘 + 浅蓝底座）×2，顶上共 4 个接线柱（左黑右红），
  //   可插一根 **U 形** 连通的硅钢片铁芯：两条腿插进左、右线圈筒的中心，底下一条横轭把它们连成 U
  //   （插入后两线圈磁通耦合变强，k 从 0.28 升到 0.9）。
  function drawMutualCoilInst(ctx, comp) {
    const core = comp.core !== false
    const post = (x, red) => {
      ctx.beginPath(); ctx.roundRect(x - 1.6, -2.4, 3.2, 6, 1)
      ctx.fillStyle = '#CBD4D8'; ctx.fill()
      const g = ctx.createLinearGradient(x - 5, -10, x + 5, 0)
      if (red) { g.addColorStop(0, '#F4725F'); g.addColorStop(0.45, '#D8331F'); g.addColorStop(1, '#8E1B12') }
      else { g.addColorStop(0, '#6C757B'); g.addColorStop(0.42, '#33393D'); g.addColorStop(1, '#141819') }
      ctx.beginPath(); ctx.roundRect(x - 4.6, -10.4, 9.2, 9, 2.2)
      ctx.fillStyle = g; ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 0.7; ctx.stroke()
      ctx.beginPath(); ctx.ellipse(x, -10.4, 4.6, 1.8, 0, 0, Math.PI * 2)
      ctx.fillStyle = red ? '#FF9184' : '#8A939A'; ctx.fill()
    }

    // 投影
    ctx.beginPath(); ctx.ellipse(0, 67, 78, 4.5, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(34,49,58,0.12)'; ctx.fill()

    // 连通的 U 形硅钢片铁芯（插上才有）：两条腿分别插进左、右线圈筒的**中心**，
    // 底下一条横轭把两条腿连成 U。上段先画（让线圈筒压在腿上，看着像穿在筒里），下段横轭稍后再补。
    const steel = (x, y, wid, hei, seamX) => {
      const g = ctx.createLinearGradient(x, 0, x + wid, 0)
      g.addColorStop(0, '#F0F4F6'); g.addColorStop(0.22, '#D2DADF'); g.addColorStop(0.55, '#AEB8BE')
      g.addColorStop(0.85, '#8E989E'); g.addColorStop(1, '#707A80')
      ctx.beginPath(); ctx.roundRect(x, y, wid, hei, 1.4)
      ctx.fillStyle = g; ctx.fill()
      ctx.strokeStyle = 'rgba(84,96,103,0.85)'; ctx.lineWidth = 0.8; ctx.stroke()
      for (const s of seamX) {
        ctx.beginPath(); ctx.moveTo(s, y + 0.8); ctx.lineTo(s, y + hei - 0.8)
        ctx.strokeStyle = 'rgba(120,132,139,0.45)'; ctx.lineWidth = 0.6; ctx.stroke()
      }
    }
    const LEG = [[-53, -39, [-49, -43]], [39, 53, [43, 49]]]   // 左腿 / 右腿（筒心 x=-46 / 46）
    if (core) {
      for (const [x0, x1, seam] of LEG) steel(x0, -3, x1 - x0, 80, seam)   // 腿：从筒顶一直往下
    } else {
      for (const [x0, x1] of LEG) {                                      // 抽掉铁芯：位置画虚线框
        ctx.setLineDash([5, 4])
        ctx.beginPath(); ctx.roundRect(x0, -3, x1 - x0, 80, 1.5)
        ctx.strokeStyle = 'rgba(150,163,171,0.7)'; ctx.lineWidth = 1; ctx.stroke()
        ctx.beginPath(); ctx.roundRect(-55, 67, 110, 10, 1.5)
        ctx.strokeStyle = 'rgba(150,163,171,0.7)'; ctx.stroke()
        ctx.setLineDash([])
      }
    }

    // 线圈筒（左 / 右）
    const tube = (x0, x1) => {
      // 浅蓝底座（矮一点，好让铁芯腿从底下露出来）
      ctx.beginPath(); ctx.roundRect(x0 - 6, 56, x1 - x0 + 12, 6, 2.5)
      const bg = ctx.createLinearGradient(0, 56, 0, 62)
      bg.addColorStop(0, '#DDEAF7'); bg.addColorStop(1, '#AFC7DF')
      ctx.fillStyle = bg; ctx.fill()
      ctx.strokeStyle = '#8FA8C0'; ctx.lineWidth = 0.8; ctx.stroke()
      // 铜筒
      const g = ctx.createLinearGradient(x0, 0, x1, 0)
      g.addColorStop(0, '#7A3D0C'); g.addColorStop(0.16, '#B97132'); g.addColorStop(0.4, '#E8B27A')
      g.addColorStop(0.62, '#C77E38'); g.addColorStop(0.86, '#95501A'); g.addColorStop(1, '#69330A')
      ctx.beginPath(); ctx.roundRect(x0, 7, x1 - x0, 51, 2.5)
      ctx.fillStyle = g; ctx.fill()
      ctx.strokeStyle = 'rgba(70,36,8,0.5)'; ctx.lineWidth = 0.8; ctx.stroke()
      // 红色绕线（一段段斜着绕上去，略带弧度）
      const turns = 6
      for (let i = 0; i < turns; i++) {
        const y = 11 + i * 8.4
        ctx.beginPath()
        ctx.moveTo(x0 + 1.5, y)
        ctx.bezierCurveTo(x0 + (x1 - x0) * 0.42, y + 3.2, x0 + (x1 - x0) * 0.62, y + 4.6, x1 - 1.5, y + 6.4)
        ctx.strokeStyle = 'rgba(90,20,14,0.35)'; ctx.lineWidth = 3; ctx.stroke()
        ctx.strokeStyle = '#D0402E'; ctx.lineWidth = 1.9; ctx.stroke()
      }
      // 顶银盘
      ctx.beginPath(); ctx.roundRect(x0 - 4, 1, x1 - x0 + 8, 7, 3)
      const pg = ctx.createLinearGradient(0, 1, 0, 8)
      pg.addColorStop(0, '#FAFCFD'); pg.addColorStop(0.5, '#D9E1E5'); pg.addColorStop(1, '#B3BDC2')
      ctx.fillStyle = pg; ctx.fill()
      ctx.strokeStyle = '#8D979D'; ctx.lineWidth = 0.8; ctx.stroke()
    }
    tube(-66, -26)
    tube(26, 66)

    // 铁芯下段：两条腿从矮底座底下露出来，由底部一条横轭连成 U（这就是「连通到两个线圈中心」）
    if (core) {
      steel(-53, 58, 14, 23, [-49, -43])
      steel(39, 58, 14, 23, [43, 49])
      steel(-55, 71, 110, 10, [-46, -26, -8, 8, 26, 46])
    }

    // 4 个接线柱：左筒 黑/红，右筒 黑/红
    post(-58, false); post(-34, true)
    post(34, false); post(58, true)

    // 器材标注
    setFont(ctx, 9, 'bold'); ctx.fillStyle = C.ink
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(`互感线圈 1:1　L₁=${(comp.h ?? 1.0).toFixed(2)} H　${core ? 'U 形铁芯 k≈0.9' : '无铁芯 k≈0.28'}`, 0, 86)
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
  }

  function drawDiyComp(ctx, comp, selected, live = 0) {
    const bx = figBox(comp.type)
    ctx.save(); ctx.translate(comp.x, comp.y); ctx.scale(DIYK, DIYK)
    if (selected) {
      const b = comp.type === 'coil'
        ? { x: -70, y: -48, w: 140, h: 74 }
        : comp.type === 'transformer'
          ? { x: -80, y: -56, w: 160, h: 152 }
          : { x: bx.x0 - 4, y: bx.y0 - 4, w: bx.w + 8, h: bx.h + 14 }
      ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 9)
      ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([])
    }

    if (comp.type === 'coil') {
      drawCoil(ctx, comp)
      ctx.restore()
      return
    }
    if (comp.type === 'transformer') {
      drawXfInst(ctx, comp)
      ctx.restore()
      return
    }
    if (comp.type === 'mutualcoil') {
      drawMutualCoilInst(ctx, comp)
      ctx.restore()
      return
    }

    const sp = diySprite(comp.type, comp.closed)
    // 小灯泡：先在实物图下面铺一层暖光（透过玻璃泡）
    const glass = comp.type === 'bulb' ? figPt('bulb', 128, 40) : null
    if (glass && live > 0.02) {
      const r = 52 * bx.scale
      const gr = ctx.createRadialGradient(glass.x, glass.y, 1.5, glass.x, glass.y, r)
      gr.addColorStop(0, `rgba(255,238,180,${0.66 * live + 0.1})`)
      gr.addColorStop(0.34, `rgba(255,212,132,${0.4 * live})`)
      gr.addColorStop(0.72, `rgba(255,198,110,${0.16 * live})`)
      gr.addColorStop(1, 'rgba(255,198,110,0)')
      ctx.beginPath(); ctx.arc(glass.x, glass.y, r, 0, Math.PI * 2)
      ctx.fillStyle = gr; ctx.fill()
    }
    if (sp) ctx.drawImage(sp.img, bx.x0, bx.y0, bx.w, bx.h)
    else {
      // 图片未加载完时的占位框
      ctx.beginPath(); ctx.roundRect(bx.x0, bx.y0, bx.w, bx.h, 6)
      ctx.fillStyle = '#EEF3F5'; ctx.fill(); ctx.strokeStyle = '#D6E1E6'; ctx.lineWidth = 1; ctx.stroke()
    }
    // 灯泡亮时玻璃内叠暖光（图已画上去，用 lighter 提亮）
    if (glass && live > 0.02) {
      const r = 42 * bx.scale
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      const wg = ctx.createRadialGradient(glass.x, glass.y, 1, glass.x, glass.y, r)
      wg.addColorStop(0, `rgba(255,250,228,${0.92 * live})`)
      wg.addColorStop(0.55, `rgba(255,226,158,${0.5 * live})`)
      wg.addColorStop(1, 'rgba(255,205,120,0)')
      ctx.beginPath(); ctx.arc(glass.x, glass.y, r, 0, Math.PI * 2)
      ctx.fillStyle = wg; ctx.fill()
      // 灯丝亮核
      const core = 11 * bx.scale
      const cgr = ctx.createRadialGradient(glass.x, glass.y, 0.5, glass.x, glass.y, core)
      cgr.addColorStop(0, `rgba(255,255,246,${0.95 * live})`)
      cgr.addColorStop(0.5, `rgba(255,238,190,${0.55 * live})`)
      cgr.addColorStop(1, 'rgba(255,230,170,0)')
      ctx.beginPath(); ctx.arc(glass.x, glass.y, core, 0, Math.PI * 2)
      ctx.fillStyle = cgr; ctx.fill()
      ctx.restore()
    }

    // 标注（放在器材下方，避开柱帽与导线）
    const ly = bx.y0 + bx.h + (bx.term > 30 ? 17 : 3)
    setFont(ctx, 9, 'bold'); ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    if (comp.type === 'battery') {
      ctx.fillStyle = C.ink
      ctx.fillText(`${comp.u || 12} V`, 0, ly)
    } else if (comp.type === 'bulb') {
      ctx.fillStyle = C.ink
      ctx.fillText(`小灯泡 ${comp.r || 5} Ω`, 0, ly)
    } else if (comp.type === 'switch') {
      ctx.fillStyle = comp.closed ? C.tealDark : C.faint
      ctx.fillText(comp.closed ? '闭合' : '断开', 0, ly + 1)
      // 选中时把「开合热点」画出来：刀末端那块黑色绝缘柄
      if (selected) {
        const hp = swGripLocal(comp)
        if (hp) {
          ctx.beginPath(); ctx.roundRect(hp.x - 2.5, hp.y - 2.5, hp.w + 5, hp.h + 5, 5)
          ctx.strokeStyle = 'rgba(226,163,60,0.95)'; ctx.lineWidth = 1.5; ctx.stroke()
        }
        setFont(ctx, 7.5); ctx.fillStyle = C.gold
        ctx.fillText('点黑柄开合', 0, ly + 13)
      }
    }
    ctx.restore()
  }

  function drawDiyIcon(ctx, x, y, type) {
    drawDiyComp(ctx, { type, x, y, closed: false, u: 12, r: 5, h: 1.5 }, false)
  }

  function drawDiyStatus(ctx, A, res, dy, now) {
    const w = 244, h = res.ok && res.mode === 'mutual' ? 118 : 104
    const x = A.area.x1 - w - 12, y = A.area.y1 - h - 12
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8)
    ctx.fillStyle = 'rgba(246,251,249,0.97)'; ctx.fill()
    ctx.strokeStyle = res.ok ? '#CFE5E0' : '#F0D9CC'; ctx.lineWidth = 1; ctx.stroke()
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    if (!res.ok) {
      setFont(ctx, 9.5, 'bold'); ctx.fillStyle = '#B4553B'
      ctx.fillText('回路还没搭好', x + 10, y + 9)
      setFont(ctx, 8.5); ctx.fillStyle = C.sub
      fitFont(ctx, res.reason, w - 20, 8.5)
      ctx.fillText(res.reason, x + 10, y + 26)
      setFont(ctx, 8.5); ctx.fillStyle = C.faint
      fitFont(ctx, '提示：电源—开关—线圈 L—灯泡串成一环；或 L 与灯泡并联、开关只切电源', w - 20, 8.5)
      ctx.fillText('提示：电源—开关—线圈 L—灯泡串成一环；或 L 与灯泡并联、开关只切电源', x + 10, y + 62)
      return
    }
    const tau = res.tau
    const tms = dy.t
    const open = now.open
    const shunt = res.mode === 'shunt'
    const mutual = res.mode === 'mutual'
    setFont(ctx, 9, 'bold'); ctx.fillStyle = C.tealDark
    ctx.fillText(mutual
      ? (res.isCoil
        ? `互感线圈 1:1  U=${res.U}V  L₁=${res.Ls.toFixed(2)}H  k=${res.kc}`
        : `互感：U=${res.U}V  L₁=${res.Ls.toFixed(2)}H  N₂:N₁=${res.n}:1`)
      : shunt
        ? `并联续流：U=${res.U}V  L=${res.Ls.toFixed(2)}H  R灯=${res.Rk}Ω`
        : `回路已识别：U=${res.U}V  R=${res.Rk}Ω  L=${res.Ls.toFixed(2)}H`, x + 10, y + 8)
    if (mutual) {
      ctx.textAlign = 'right'; setFont(ctx, 8.5, 'bold'); ctx.fillStyle = now.bright > 0.2 ? '#C4801A' : '#A9793B'
      ctx.fillText(`灯泡 ${Math.round(clamp(now.bright, 0, 1.4) * 100)}%`, x + w - 10, y + 8)
      ctx.textAlign = 'left'
    }

    if (mutual) {
      // 互感：只有通断那一瞬副线圈才有 ε₂，灯泡闪一下后熄灭
      setFont(ctx, 13, 'bold'); ctx.fillStyle = now.flashing ? C.pos : (now.emf > 0.3 ? '#C4801A' : C.faint)
      ctx.fillText(now.emf > 0.05 ? `${now.emf.toFixed(2)} V` : '0.00 V', x + 10, y + 22)
      setFont(ctx, 9); ctx.fillStyle = C.sub
      ctx.fillText('ε₂', x + 84, y + 28)
      ctx.fillText(`τ₁ = ${fmtT(tau)}`, x + 160, y + 28)
      setFont(ctx, 8.5); ctx.fillStyle = dy.evt ? '#B4553B' : C.sub
      const l1 = dy.evt
        ? (dy.evt === 'on' ? `合闸：ε₂ 峰值 ${res.ePeak.toFixed(1)} V，灯泡先闪亮` : `断闸：ε₂ 反向，峰值仍 ${res.ePeak.toFixed(1)} V`)
        : (open ? '开关断开：点闸刀黑柄（或面板按钮）合闸，灯泡会闪一下' : '原线圈通电后电流稳定，磁通不变 → 没有 ε₂')
      fitFont(ctx, l1, w - 20, 8.5)
      ctx.fillText(l1, x + 10, y + 41)
      setFont(ctx, 8.5); ctx.fillStyle = C.sub
      fitFont(ctx, '互感靠「变化的电流」：直流只有通断瞬间，交流才持续', w - 20, 8.5)
      ctx.fillText('互感靠「变化的电流」：直流只有通断瞬间，交流才持续', x + 10, y + 61)
      ctx.textAlign = 'left'
      // 迷你 ε₂–t（金色＝ε₂ 衰减，虚线＝峰值参考）
      const gx = x + 10, gy = y + 85, gw = w - 20, gh = 20
      ctx.strokeStyle = '#DCE8EC'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(gx, gy + gh); ctx.lineTo(gx + gw, gy + gh); ctx.stroke()
      ctx.setLineDash([4, 3]); ctx.strokeStyle = 'rgba(226,163,60,0.75)'
      ctx.beginPath(); ctx.moveTo(gx, gy + gh - (res.ePeak / (res.ePeak * 1.1)) * gh); ctx.lineTo(gx + gw, gy + gh - (res.ePeak / (res.ePeak * 1.1)) * gh); ctx.stroke()
      ctx.setLineDash([])
      ctx.strokeStyle = C.gold; ctx.lineWidth = 1.8
      ctx.beginPath()
      const xMax = 5 * tau
      for (let k = 0; k <= 40; k++) {
        const sec = (xMax * k) / 40
        const px = gx + (gw * k) / 40
        const py = gy + gh - (res.ePeak * Math.exp(-sec / tau) / (res.ePeak * 1.1)) * gh
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
      }
      ctx.stroke()
      if (dy.evt && dy.t > 0) {
        const px = gx + (gw * Math.min(dy.t / xMax, 1))
        const py = gy + gh - (now.emf / (res.ePeak * 1.1)) * gh
        ctx.beginPath(); ctx.arc(px, py, 3.2, 0, Math.PI * 2); ctx.fillStyle = C.gold; ctx.fill()
      }
      ctx.textBaseline = 'alphabetic'
      return
    }

    if (shunt) {
      // 并联：断开后看灯泡里的续流
      setFont(ctx, 13, 'bold'); ctx.fillStyle = now.flashing ? C.pos : C.neg
      ctx.fillText(`${(open ? now.iBulb : now.iBulb).toFixed(2)} A`, x + 10, y + 22)
      setFont(ctx, 9); ctx.fillStyle = C.sub
      ctx.fillText(open ? 'i灯（续流）' : 'i灯（正常）', x + 76, y + 28)
      ctx.fillText(`τ = ${fmtT(tau)}`, x + 160, y + 28)
      setFont(ctx, 8.5); ctx.fillStyle = open ? '#B4553B' : C.sub
      fitFont(ctx, open
        ? `L 的电流经灯泡续流：起始 ${res.I0.toFixed(1)} A ≈ 正常的 ${res.flashX.toFixed(1)} 倍`
        : `闭合稳态：I_L ≈ ${res.I0.toFixed(1)} A（L 通直流），灯泡正常亮`, w - 20, 8.5)
      ctx.fillText(open
        ? `L 的电流经灯泡续流：起始 ${res.I0.toFixed(1)} A ≈ 正常的 ${res.flashX.toFixed(1)} 倍`
        : `闭合稳态：I_L ≈ ${res.I0.toFixed(1)} A（L 通直流），灯泡正常亮`, x + 10, y + 46)
      ctx.textAlign = 'right'; ctx.fillStyle = '#C4801A'
      ctx.fillText(`灯丝亮度 ${Math.round(clamp(now.bright, 0, 1.6) * 100)}%`, x + w - 10, y + 60)
      ctx.textAlign = 'left'
      // 迷你 i灯–t：虚线＝正常电流，实线＝续流衰减
      const gx = x + 10, gy = y + 74, gw = w - 20, gh = 22
      const iMax = Math.max(res.I0, res.Ib0) * 1.05
      ctx.strokeStyle = '#DCE8EC'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(gx, gy + gh); ctx.lineTo(gx + gw, gy + gh); ctx.stroke()
      ctx.setLineDash([4, 3]); ctx.strokeStyle = 'rgba(147,165,173,0.8)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(gx, gy + gh - (res.Ib0 / iMax) * gh); ctx.lineTo(gx + gw, gy + gh - (res.Ib0 / iMax) * gh); ctx.stroke()
      ctx.setLineDash([])
      if (!open) {
        // 闭合态：灯泡电流就停在正常值（一条水平线）
        ctx.strokeStyle = C.pos; ctx.lineWidth = 1.8
        ctx.beginPath()
        ctx.moveTo(gx, gy + gh - (res.Ib0 / iMax) * gh)
        ctx.lineTo(gx + gw, gy + gh - (res.Ib0 / iMax) * gh)
        ctx.stroke()
        ctx.textBaseline = 'alphabetic'
        return
      }
      ctx.strokeStyle = C.pos; ctx.lineWidth = 1.8
      ctx.beginPath()
      const xMax = 5 * tau
      for (let k = 0; k <= 40; k++) {
        const sec = (xMax * k) / 40
        const px = gx + (gw * k) / 40
        const py = gy + gh - (res.I0 * Math.exp(-sec / tau) / iMax) * gh
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
      }
      ctx.stroke()
      if (open && tms > 0) {
        const px = gx + (gw * Math.min(dy.t / xMax, 1))
        const py = gy + gh - (now.iBulb / iMax) * gh
        ctx.beginPath(); ctx.arc(px, py, 3.2, 0, Math.PI * 2); ctx.fillStyle = C.gold; ctx.fill()
      }
      ctx.textBaseline = 'alphabetic'
      return
    }

    const ii = now.iL
    const lv = now.bright
    setFont(ctx, 13, 'bold'); ctx.fillStyle = C.neg
    ctx.fillText(`${ii.toFixed(2)} A`, x + 10, y + 22)
    setFont(ctx, 9); ctx.fillStyle = C.sub
    ctx.fillText('i', x + 76, y + 28)
    ctx.fillText(`τ = ${fmtT(tau)}`, x + 92, y + 28)
    setFont(ctx, 8.5); ctx.fillStyle = C.sub
    ctx.fillText(open
      ? '开关断开：串联回路无续流路径，电流瞬间归零'
      : (dy.t >= 5 * tau - 0.002 ? `已到稳态 I₀ = ${res.I0.toFixed(2)} A（L 相当于导线）` : `t = ${fmtT(tms)}　（${(dy.t / tau).toFixed(1)}τ）`), x + 10, y + 46)
    ctx.fillText(open
      ? '开关断开：串联回路无续流路径，电流瞬间归零'
      : `自感电动势 ε = ${(res.U * Math.exp(-dy.t / tau)).toFixed(2)} V（阻碍电流增大）`, x + 10, y + 60)
    ctx.textAlign = 'right'
    ctx.fillStyle = lv > 0.3 ? '#C4801A' : '#A9793B'
    ctx.fillText(`灯丝亮度 ${Math.round(lv * 100)}%`, x + w - 10, y + 60)
    ctx.textAlign = 'left'
    // 迷你 i–t
    const gx = x + 10, gy = y + 74, gw = w - 20, gh = 22
    ctx.strokeStyle = '#DCE8EC'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(gx, gy + gh); ctx.lineTo(gx + gw, gy + gh); ctx.stroke()
    ctx.strokeStyle = C.neg; ctx.lineWidth = 1.8
    ctx.beginPath()
    const xMax = 5 * tau
    for (let k = 0; k <= 40; k++) {
      const sec = (xMax * k) / 40
      const px = gx + (gw * k) / 40
      const py = gy + gh - (res.I0 * (1 - Math.exp(-sec / tau)) / Math.max(res.I0, 0.01)) * gh
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.stroke()
    if (tms > 0 && !open) {
      const px = gx + (gw * Math.min(dy.t / xMax, 1))
      const py = gy + gh - (ii / Math.max(res.I0, 0.01)) * gh
      ctx.beginPath(); ctx.arc(px, py, 3.2, 0, Math.PI * 2); ctx.fillStyle = C.gold; ctx.fill()
    }
    ctx.textBaseline = 'alphabetic'
  }

  function drawDiyPalette(ctx, A, W, H, s, dy) {
    const x = A.palX, w = A.palW, y = 12, h = H - 24
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 10)
    ctx.fillStyle = C.card; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke()
    setFont(ctx, 11.5, 'bold'); ctx.fillStyle = C.ink
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('器材区', x + 12, y + 12)

    const items = [
      { type: 'battery', name: '电源', sub: '蓄电池 12 V，可调' },
      { type: 'switch', name: '开关', sub: '单向闸刀，点黑柄通断' },
      { type: 'coil', name: '线圈 L', sub: '电感 1.5 H，可调' },
      { type: 'transformer', name: '变压器', sub: '可拆铁芯，N₂:N₁ 可调' },
      { type: 'mutualcoil', name: '互感线圈', sub: '两线圈 + 可插铁芯' },
      { type: 'bulb', name: '小灯泡', sub: '灯丝 5 Ω' },
    ]
    const rowH = 42
    items.forEach((it, i) => {
      const cy = y + 34 + i * rowH
      const hot = dy.hold === it.type
      ctx.beginPath(); ctx.roundRect(x + 8, cy, w - 16, rowH - 2, 8)
      ctx.fillStyle = '#FFFFFF'; ctx.fill()
      ctx.strokeStyle = hot ? C.teal : '#E1E8EB'; ctx.lineWidth = hot ? 2 : 1; ctx.stroke()
      drawGlyph(ctx, x + 30, cy + rowH / 2, it.type)
      setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.ink
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText(it.name, x + 54, cy + 13)
      setFont(ctx, 7.8); ctx.fillStyle = C.faint
      ctx.fillText(it.sub, x + 54, cy + 27)
      pushArea({ n: `diyPart:${it.type}`, x: x + 8, y: cy, w: w - 16, h: rowH - 2, holdType: it.type, cursor: 'pointer' })
    })

    let ky = y + 34 + items.length * rowH + 2
    setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.sub
    ctx.fillText('快捷', x + 12, ky)
    ky += 16
    drawBtn(ctx, x + 8, ky, w - 16, 26, '一键标准电路', 'primary', () => buildStandard(A), 'diyStandard')
    ky += 32
    drawBtn(ctx, x + 8, ky, w - 16, 26, '一键并联续流', 'plain', () => buildShunt(A), 'diyShunt')
    ky += 32
    drawBtn(ctx, x + 8, ky, w - 16, 26, '一键互感回路', 'plain', () => buildMutual(A), 'diyMutual')
    ky += 32
    drawBtn(ctx, x + 8, ky, w - 16, 26, '一键简易互感', 'plain', () => buildMutualCoil(A), 'diyMutualCoil')
    ky += 32
    drawBtn(ctx, x + 8, ky, w - 16, 26, '清空场地', 'ghost', () => {
      const st = S.current
      st.diy.comps = []; st.diy.wires = []; st.diy.sel = null; st.diy.t = 0; st.diy.hot = false; st.diy.evt = null
      say('场地已清空')
    }, 'diyClear')
    ky += 34

    // 导线颜色：与项目其它电学「自己动手」同口径（点色块 → 之后新接的线用这个颜色）
    ctx.textAlign = 'left'
    setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.sub
    ctx.fillText('导线颜色', x + 12, ky)
    ky += 16
    const WC = ['#F44336', '#FFC107', '#4CAF50', '#1E88E5']
    const chipW = Math.floor((w - 24 - 18) / 4), chipH = 18
    WC.forEach((hex, i) => {
      const cx = x + 12 + i * (chipW + 6)
      ctx.beginPath(); ctx.roundRect(cx, ky, chipW, chipH, 4)
      ctx.fillStyle = hex; ctx.fill()
      ctx.strokeStyle = dy.wireColor === hex ? C.ink : 'rgba(0,0,0,0.14)'
      ctx.lineWidth = dy.wireColor === hex ? 2 : 1; ctx.stroke()
      pushArea({ n: `diyWireColor${i}`, x: cx, y: ky, w: chipW, h: chipH, cursor: 'pointer', onClick: () => { dy.wireColor = hex } })
    })
    ky += chipH + 12

    // 选中器材参数
    const sel = dy.comps.find((c) => c.id === dy.sel)
    ctx.strokeStyle = '#EDF2F5'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(x + 10, ky); ctx.lineTo(x + w - 10, ky); ctx.stroke()
    ky += 10
    if (sel) {
      ctx.textAlign = 'left'
      setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.ink
      ctx.fillText('选中器材参数', x + 12, ky)
      ky += 16
      const cfg = sel.type === 'battery'
        ? { label: '电压 U', val: sel.u || 12, unit: 'V', min: 3, max: 20, step: 1, set: (v) => { sel.u = v } }
        : sel.type === 'bulb'
          ? { label: '灯丝电阻 R', val: sel.r || 5, unit: 'Ω', min: 2, max: 20, step: 1, set: (v) => { sel.r = v } }
          : sel.type === 'coil'
            ? { label: '电感 L', val: sel.h ?? 1.5, unit: 'H', min: 0.2, max: 3, step: 0.1, set: (v) => { sel.h = Math.round(v * 100) / 100 } }
            : sel.type === 'transformer'
              ? { label: '匝数比 N₂:N₁', val: sel.n ?? 2, unit: ':1', min: 1, max: 3, step: 1, set: (v) => { sel.n = Math.round(v) } }
              : sel.type === 'mutualcoil'
                ? { label: '电感 L₁', val: sel.h ?? 1.0, unit: 'H', min: 0.3, max: 2, step: 0.1, set: (v) => { sel.h = Math.round(v * 10) / 10 } }
                : null
      if (cfg) {
        setFont(ctx, 9); ctx.fillStyle = C.sub
        ctx.fillText(cfg.label, x + 12, ky)
        ctx.textAlign = 'right'; ctx.fillStyle = C.tealDark
        ctx.fillText(`${cfg.step < 1 ? cfg.val.toFixed(1) : Math.round(cfg.val)}${cfg.unit === ':1' ? ' : 1' : ' ' + cfg.unit}`, x + w - 12, ky)
        ctx.textAlign = 'left'
        ky += 12
        drawSlider(ctx, {
          x: x + 12, y: ky + 8, w: w - 24, ratio: (cfg.val - cfg.min) / (cfg.max - cfg.min),
          name: 'diyParam', onChange: (r) => {
            const raw = cfg.min + r * (cfg.max - cfg.min)
            cfg.set(cfg.step < 1 ? Math.round(raw * 10) / 10 : Math.round(raw))
            S.current.diy.t = 0
          },
        })
        ky += 30
      }
      if (sel.type === 'switch') {
        drawBtn(ctx, x + 8, ky, w - 16, 26, sel.closed ? '断开开关' : '闭合开关', 'plain', () => {
          toggleSwitchComp(sel)
        }, 'diySwitch')
        ky += 32
      }
      if (sel.type === 'coil') {
        if (ky + 14 < y + h - 8) {
          setFont(ctx, 8); ctx.fillStyle = C.faint
          fitFont(ctx, 'τ = L/R：L 越大，电流升得越慢', w - 24, 8)
          ctx.fillText('τ = L/R：L 越大，电流升得越慢', x + 12, ky)
          ky += 14
        }
      }
      if (sel.type === 'transformer') {
        if (ky + 14 < y + h - 8) {
          setFont(ctx, 8); ctx.fillStyle = C.faint
          fitFont(ctx, '原线圈接电源侧、副线圈接灯泡侧；只有通断瞬间灯泡才闪', w - 24, 8)
          ctx.fillText('原线圈接电源侧、副线圈接灯泡侧；只有通断瞬间灯泡才闪', x + 12, ky)
          ky += 14
        }
      }
      if (sel.type === 'mutualcoil') {
        drawBtn(ctx, x + 8, ky, w - 16, 26, sel.core !== false ? '抽出铁芯（k 变小）' : '插入铁芯（k 变大）', 'plain', () => {
          const dy2 = S.current.diy
          sel.core = sel.core === false
          dy2.t = 0
          dy2.evt = null
          say(sel.core ? '插入铁芯：两线圈磁通「连通」，互感变强（k≈0.9）' : '抽出铁芯：只剩空气耦合，互感变弱（k≈0.28）')
        }, 'diyCore')
        ky += 30
        if (ky + 12 < y + h - 8) {
          setFont(ctx, 8); ctx.fillStyle = C.faint
          fitFont(ctx, '左筒 0/1 = 原线圈，右筒 2/3 = 副线圈', w - 24, 8)
          ctx.fillText('左筒 0/1 = 原线圈，右筒 2/3 = 副线圈', x + 12, ky)
          ky += 14
        }
      }
    } else {
      setFont(ctx, 9); ctx.fillStyle = C.faint
      ctx.textAlign = 'left'
      ctx.fillText('单击画布中的器材可改参数', x + 12, ky)
      ky += 18
    }

    // 提示（贴着参数区下沿；矮屏幕放不下就自动少列几条，实在没地方就不画，绝不溢出面板）
    const tipY = Math.max(ky + 10, y + h - 130)
    const avail = y + h - 8 - tipY
    if (avail >= 70) {
      const tipH = clamp(avail, 70, 126)
      ctx.beginPath(); ctx.roundRect(x + 8, tipY, w - 16, tipH, 8)
      ctx.fillStyle = '#F6FBF9'; ctx.fill()
      ctx.strokeStyle = '#DCEBE7'; ctx.lineWidth = 1; ctx.stroke()
      setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.tealDark
      ctx.textAlign = 'left'
      ctx.fillText('这样做', x + 18, tipY + 9)
      const tips = [
        '① 点器材 → 再点画布落位',
        '② 点两个接线柱 → 连一根线',
        '③ 点闸刀黑柄 → 通断',
        '④ 右键器材 → 删除',
        '⑤ 串联跑 i–t，并联看灯泡闪亮',
        '⑥ 双绕组（变压器 / 互感线圈）：左 0/1、右 2/3',
      ]
      setFont(ctx, 8.5); ctx.fillStyle = C.sub
      tips.forEach((t, i) => {
        if (26 + i * 15 > tipH - 6) return
        fitFont(ctx, t, w - 40, 8.5)
        ctx.fillText(t, x + 18, tipY + 26 + i * 15)
      })
    }
  }

  function drawGlyph(ctx, x, y, type) {
    ctx.save(); ctx.translate(x, y)
    if (type === 'transformer') {
      // 器材区图标：两只铜绕组 + 从下方插入的连通硅钢片铁芯（无顶部压紧架）
      for (const [x0, x1] of [[-14, -3], [3, 14]]) {
        const g = ctx.createLinearGradient(x0, 0, x1, 0)
        g.addColorStop(0, '#6B3410'); g.addColorStop(0.35, '#DA9B60'); g.addColorStop(1, '#7A3F0F')
        ctx.beginPath(); ctx.roundRect(x0, -5, x1 - x0, 11, 2)
        ctx.fillStyle = g; ctx.fill()
        ctx.beginPath(); ctx.roundRect(x0 - 0.8, -6.4, x1 - x0 + 1.6, 2, 0.7)
        ctx.fillStyle = '#DFE6EA'; ctx.fill()
      }
      for (const cx of [-8.5, 8.5]) {          // 两条铁芯腿
        const g = ctx.createLinearGradient(cx - 1.6, 0, cx + 1.6, 0)
        g.addColorStop(0, '#E6ECEF'); g.addColorStop(0.6, '#AFB9BF'); g.addColorStop(1, '#828C92')
        ctx.beginPath(); ctx.roundRect(cx - 1.6, -7.4, 3.2, 10.4, 0.8)
        ctx.fillStyle = g; ctx.fill()
      }
      ctx.beginPath(); ctx.roundRect(-11.5, 3.6, 23, 2.8, 0.9)   // 底部横轭
      const gy = ctx.createLinearGradient(0, 3.6, 0, 6.4)
      gy.addColorStop(0, '#DFE6EA'); gy.addColorStop(1, '#8E989E')
      ctx.fillStyle = gy; ctx.fill()
      for (const [sx, red] of [[-13, false], [-4, true], [4, false], [13, true]]) {
        ctx.beginPath(); ctx.roundRect(sx - 1.4, -9.4, 2.8, 2.6, 0.8)
        ctx.fillStyle = red ? '#D8331F' : '#33393D'; ctx.fill()
      }
      ctx.restore()
      return
    }
    if (type === 'mutualcoil') {
      // 器材区图标：两只立着的线圈筒 + U 形铁芯（两腿插进筒心、底下横轭连通）
      for (const cx of [-8, 8]) {                 // 两条腿（先画，让线圈筒压在上面）
        ctx.beginPath(); ctx.roundRect(cx - 1.6, -7.4, 3.2, 15, 0.8)
        const gg = ctx.createLinearGradient(cx - 1.6, 0, cx + 1.6, 0)
        gg.addColorStop(0, '#E6ECEF'); gg.addColorStop(0.6, '#AFB9BF'); gg.addColorStop(1, '#828C92')
        ctx.fillStyle = gg; ctx.fill()
      }
      for (const x0 of [-12, 2]) {
        const g = ctx.createLinearGradient(x0, 0, x0 + 10, 0)
        g.addColorStop(0, '#8B4A12'); g.addColorStop(0.4, '#E0A66B'); g.addColorStop(1, '#7A3F0F')
        ctx.beginPath(); ctx.roundRect(x0, -6, 10, 9, 1.2)
        ctx.fillStyle = g; ctx.fill()
        ctx.beginPath(); ctx.roundRect(x0 - 1, -7.6, 12, 2.2, 0.8)
        ctx.fillStyle = '#DFE6EA'; ctx.fill()
        ctx.beginPath(); ctx.roundRect(x0 - 1, 2.6, 12, 2.2, 0.8)
        ctx.fillStyle = '#BBD0E4'; ctx.fill()
      }
      for (const cx of [-8, 8]) {                 // 腿从底座下面露出来
        ctx.beginPath(); ctx.roundRect(cx - 1.6, 4.4, 3.2, 4.4, 0.6)
        ctx.fillStyle = '#B9C3C9'; ctx.fill()
      }
      ctx.beginPath(); ctx.roundRect(-11, 6.6, 22, 2.4, 0.7)     // 底部横轭 → U
      const gy2 = ctx.createLinearGradient(0, 6.6, 0, 9)
      gy2.addColorStop(0, '#DFE6EA'); gy2.addColorStop(1, '#8E989E')
      ctx.fillStyle = gy2; ctx.fill()
      for (const [sx, red] of [[-11, false], [-3, true], [3, false], [11, true]]) {
        ctx.beginPath(); ctx.roundRect(sx, -9.4, 2.6, 2.2, 0.7)
        ctx.fillStyle = red ? '#D8331F' : '#33393D'; ctx.fill()
      }
      ctx.restore()
      return
    }
    if (type === 'coil') {
      // 器材区图标：小线圈（浅灰底板 + 铜色四匝 + 黑/红小柱）
      ctx.beginPath(); ctx.roundRect(-16, 5, 32, 5, 1.2)
      const g = ctx.createLinearGradient(0, 5, 0, 10)
      g.addColorStop(0, '#EDF1F3'); g.addColorStop(1, '#B7BFC3')
      ctx.fillStyle = g; ctx.fill()
      ctx.strokeStyle = '#9AA3A8'; ctx.lineWidth = 0.7; ctx.stroke()
      for (let i = 0; i < 5; i++) {
        const cx = -9 + i * 4.5
        ctx.beginPath(); ctx.ellipse(cx, -4, 2.4, 7.4, 0, 0, Math.PI * 2)
        ctx.strokeStyle = '#C9762B'; ctx.lineWidth = 2; ctx.stroke()
      }
      ctx.beginPath(); ctx.roundRect(-13.5, -2.5, 3.6, 3.4, 1); ctx.fillStyle = '#2B3033'; ctx.fill()
      ctx.beginPath(); ctx.roundRect(9.9, -2.5, 3.6, 3.4, 1); ctx.fillStyle = '#D8331F'; ctx.fill()
      ctx.restore()
      return
    }
    // 器材区图标直接用同一套器材图（等比缩进小框）；单向闸刀取合闸态，一眼认得出是闸刀
    const sp = diySprite(type, true), bx = figBox(type)
    if (!sp || !bx || !DIY_FIG[type]) {
      ctx.strokeStyle = '#9FB3BB'; ctx.lineWidth = 1.4
      ctx.beginPath(); ctx.roundRect(-11, -8, 22, 16, 3); ctx.stroke()
      ctx.restore()
      return
    }
    const sc = Math.min(38 / bx.w, 26 / bx.h)
    const cx = bx.x0 + bx.w / 2, cy = bx.y0 + bx.h / 2
    ctx.drawImage(sp.img, (bx.x0 - cx) * sc, (bx.y0 - cy) * sc, bx.w * sc, bx.h * sc)
    ctx.restore()
  }

  function buildStandard(A) {
    const dy = S.current.diy
    // 标准矩形回路：上沿 开关—线圈，下沿 电源—小灯泡，左右两侧竖直导线
    const mk = (type, x, y, extra) => ({ id: S.current.nextId++, type, x, y, closed: false, ...extra })
    const DB = TERM.battery * DIYK, DS = TERM.switch * DIYK, DC = TERM.coil * DIYK, DL = TERM.bulb * DIYK
    const XL = A.area.x1 * 0.16 + 40, XR = A.area.x1 * 0.84 - 40
    const yT = A.area.y1 * 0.20, yB = A.area.y1 * 0.62
    const sw = mk('switch', XL + DS, yT, {})
    const co = mk('coil', XR - DC, yT, { h: 1.5 })
    const bat = mk('battery', XL + DB, yB, { u: 12 })
    const bl = mk('bulb', XR - DL, yB, { r: 5 })
    dy.comps = [bat, sw, co, bl]
    // 沿矩形四边连线：左边（开关0—电源0）· 上边（开关1—线圈0）· 右边（线圈1—灯泡1）· 下边（灯泡0—电源1）
    const wc = dy.wireColor
    dy.wires = [
      { id: 1, from: { compId: sw.id, port: 0 }, to: { compId: bat.id, port: 0 }, color: wc },
      { id: 2, from: { compId: sw.id, port: 1 }, to: { compId: co.id, port: 0 }, color: wc },
      { id: 3, from: { compId: co.id, port: 1 }, to: { compId: bl.id, port: 1 }, color: wc },
      { id: 4, from: { compId: bl.id, port: 0 }, to: { compId: bat.id, port: 1 }, color: wc },
    ]
    dy.sel = sw.id
    dy.t = 0
    say('已搭好标准回路：电源—开关—线圈 L—小灯泡，点闸刀黑柄即可合闸')
  }

  function buildShunt(A) {
    const dy = S.current.diy
    // 并联续流：开关只串在电源支路；线圈 L 与小灯泡并排在同一对上（L ∥ 灯泡）
    const mk = (type, x, y, extra) => ({ id: S.current.nextId++, type, x, y, closed: false, ...extra })
    const DB = TERM.battery * DIYK, DS = TERM.switch * DIYK, DC = TERM.coil * DIYK, DL = TERM.bulb * DIYK
    const XL = A.area.x1 * 0.16 + 40, XR = A.area.x1 * 0.84 - 40
    const yT = A.area.y1 * 0.20, yB = A.area.y1 * 0.62
    const sw = mk('switch', XL + DS, yT, { closed: true })   // 并联搭法直接先处在闭合态（线圈已通电）
    const co = mk('coil', XR - DC, yT, { h: 1.5 })
    const bat = mk('battery', XL + DB, yB, { u: 12 })
    const bl = mk('bulb', XR - DL, yB, { r: 5 })
    dy.comps = [bat, sw, co, bl]
    const wc = dy.wireColor
    dy.wires = [
      { id: 1, from: { compId: sw.id, port: 0 }, to: { compId: bat.id, port: 0 }, color: wc },
      { id: 2, from: { compId: sw.id, port: 1 }, to: { compId: co.id, port: 0 }, color: wc },
      { id: 3, from: { compId: co.id, port: 0 }, to: { compId: bl.id, port: 0 }, color: wc },
      { id: 4, from: { compId: co.id, port: 1 }, to: { compId: bl.id, port: 1 }, color: wc },
      { id: 5, from: { compId: bat.id, port: 1 }, to: { compId: bl.id, port: 1 }, color: wc },
    ]
    dy.sel = sw.id
    dy.t = 0
    say('已搭好并联续流回路：开关只切电源支路，断开后 L 的电流经灯泡续流，灯泡闪一下')
  }

  function buildMutual(A) {
    const dy = S.current.diy
    // 互感：变压器原线圈（左 0/1）与电源+开关成环；副线圈（右 2/3）只带一个小灯泡
    const mk = (type, x, y, extra) => ({ id: S.current.nextId++, type, x, y, closed: false, ...extra })
    const DB = TERM.battery * DIYK, DS = TERM.switch * DIYK, DL = TERM.bulb * DIYK
    const midX = A.area.x1 * 0.50
    const yT = A.area.y1 * 0.26
    const tf = mk('transformer', midX, yT, { h: 1.5, n: 2, kc: 0.9 })
    const sw = mk('switch', midX - 260, yT, {})
    const bat = mk('battery', midX - 260, A.area.y1 * 0.72, { u: 12 })
    const bl = mk('bulb', midX + 210 * DIYK, yT + 46 * DIYK, { r: 5 })
    dy.comps = [bat, sw, tf, bl]
    const wc = dy.wireColor
    dy.wires = [
      { id: 1, from: { compId: sw.id, port: 0 }, to: { compId: bat.id, port: 0 }, color: wc },
      { id: 2, from: { compId: sw.id, port: 1 }, to: { compId: tf.id, port: 0 }, color: wc },
      { id: 3, from: { compId: tf.id, port: 1 }, to: { compId: bat.id, port: 1 }, color: wc },
      { id: 4, from: { compId: tf.id, port: 2 }, to: { compId: bl.id, port: 0 }, color: wc },
      { id: 5, from: { compId: tf.id, port: 3 }, to: { compId: bl.id, port: 1 }, color: wc },
    ]
    dy.sel = sw.id
    dy.t = 0
    dy.evt = null
    dy.hot = false
    say('已搭好互感回路：变压器原线圈接电源+开关、副线圈接灯泡，点闸刀通断看灯泡闪')
  }

  // 简易互感：两只线圈筒（左 0/1 原线圈接电源+开关，右 2/3 副线圈接灯泡），可插铁芯
  function buildMutualCoil(A) {
    const dy = S.current.diy
    const mk = (type, x, y, extra) => ({ id: S.current.nextId++, type, x, y, closed: false, ...extra })
    const DB = TERM.battery * DIYK, DS = TERM.switch * DIYK, DL = TERM.bulb * DIYK
    const midX = A.area.x1 * 0.50
    const yT = A.area.y1 * 0.24
    const mc = mk('mutualcoil', midX, yT, { h: 1.0, core: true })
    const sw = mk('switch', midX - 260, yT, {})
    const bat = mk('battery', midX - 260, A.area.y1 * 0.74, { u: 12 })
    const bl = mk('bulb', midX + 205 * DIYK, yT + 52 * DIYK, { r: 5 })
    dy.comps = [bat, sw, mc, bl]
    const wc = dy.wireColor
    dy.wires = [
      { id: 1, from: { compId: sw.id, port: 0 }, to: { compId: bat.id, port: 0 }, color: wc },
      { id: 2, from: { compId: sw.id, port: 1 }, to: { compId: mc.id, port: 0 }, color: wc },
      { id: 3, from: { compId: mc.id, port: 1 }, to: { compId: bat.id, port: 1 }, color: wc },
      { id: 4, from: { compId: mc.id, port: 2 }, to: { compId: bl.id, port: 0 }, color: wc },
      { id: 5, from: { compId: mc.id, port: 3 }, to: { compId: bl.id, port: 1 }, color: wc },
    ]
    dy.sel = sw.id
    dy.t = 0
    dy.evt = null
    dy.hot = false
    say('已搭好简易互感：左线圈接电源+开关、右线圈接灯泡，插/抽铁芯看灯泡闪得多亮')
  }

  // ═════════════════════════════════════════════
  //  交互（Tab1 演示 / Tab2 接线，同一套命中判定）
  // ═════════════════════════════════════════════
  function getPos(e) { return eventToCanvas(canvasRef.current, e) }
  const hitArea = (a, x, y) => x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h

  function handleMouseDown(e) {
    if (e.button !== 0) return
    const s = S.current
    const { x, y } = getPos(e)
    for (const a of canvasRef.current._clickAreas || []) {
      if (!hitArea(a, x, y)) continue
      if (a.drag === 'slider') { s.dragSlider = a; a.setX(x); return }
      if (a.holdType) { s.diy.hold = a.holdType; s.diy.mx = x; s.diy.my = y; return }
      if (a.onClick) { a.onClick(); return }
    }
    if (s.tab !== 2) return

    const dy = s.diy
    const A = diyGeom(canvasRef.current._R.W, canvasRef.current._R.H)
    const Pt = { x: (x - A.org.x) / A.sc, y: (y - A.org.y) / A.sc }
    if (dy.hold) {
      const t = dy.hold
      const c = {
        id: s.nextId++, type: t, x: Pt.x, y: Pt.y, closed: false,
        u: 12, r: 5, h: t === 'mutualcoil' ? 1.0 : 1.5, n: 2, kc: 0.9, core: true,
      }
      dy.comps.push(c)
      dy.sel = c.id
      dy.hold = null
      dy.t = 0
      dy.evt = null
      const NAMES = { battery: '电源', switch: '开关', coil: '线圈 L', bulb: '小灯泡', transformer: '变压器', mutualcoil: '互感线圈' }
      say(`已放入${NAMES[t] || '器材'}`)
      return
    }
    // 闸刀黑柄：捏柄就开合。这条必须排在接线柱判定之前 —— 刀合上时黑柄正好压在右柱帽上方
    if (!dy.connecting) {
      let gripHit = null
      for (const c of dy.comps) {
        if (c.type !== 'switch') continue
        const g = swGripWorld(c)
        if (g && Pt.x > g.x0 && Pt.x < g.x1 && Pt.y > g.y0 && Pt.y < g.y1) gripHit = c
      }
      if (gripHit) {
        const dPost = Math.min(
          Math.hypot(Pt.x - termPos(gripHit, 0).x, Pt.y - termPos(gripHit, 0).y),
          Math.hypot(Pt.x - termPos(gripHit, 1).x, Pt.y - termPos(gripHit, 1).y),
        )
        if (dPost > 9 * DIYK / 1.7) {
          dy.sel = gripHit.id
          // 每一次按柄都真的扳一下：断开后立刻再合闸也要马上响应，
          // 不能把 180 ms 内的第二下吞掉（那样画面会停在旧的开合状态里继续算）
          toggleSwitchComp(gripHit)
          dy.lastTap = null
          return
        }
      }
    }
    // 点接线柱 → 连线（取最近的一根；柱子本身只有几个像素，容错给到 22 世界像素）
    const TR = 22 * DIYK / 1.7
    let best = null
    for (const c of dy.comps) {
      for (let i = 0; i < portNum(c.type); i++) {
        const t = termPos(c, i)
        const d = Math.hypot(Pt.x - t.x, Pt.y - t.y)
        if (d < TR && (!best || d < best.d)) best = { compId: c.id, port: i, d }
      }
    }
    if (best) {
      if (dy.connecting) {
        if (!(dy.connecting.compId === best.compId && dy.connecting.port === best.port)) {
          addWire(dy.connecting, best)
        }
        dy.connecting = null
      } else {
        dy.connecting = { compId: best.compId, port: best.port }
      }
      dy.sel = best.compId
      dy.lastTap = null
      return
    }
    const pk = DIYK / 1.5
    const picked = [...dy.comps].reverse().find((c) => {
      const e = compExtent(c.type)
      const pad = 6 * pk
      return Pt.x > c.x + e.x0 - pad && Pt.x < c.x + e.x1 + pad && Pt.y > c.y + e.y0 - pad && Pt.y < c.y + e.y1 + pad
    })
    if (picked) {
      // 已点了一根柱、正在连线时，点器材本身（不用非点准柱头）就接到它最近的那根柱
      if (dy.connecting) {
        const near = Array.from({ length: portNum(picked.type) }, (_, i) => i)
          .map((i) => ({ i, d: Math.hypot(Pt.x - termPos(picked, i).x, Pt.y - termPos(picked, i).y) }))
          .sort((a, b) => a.d - b.d)[0].i
        if (!(dy.connecting.compId === picked.id && dy.connecting.port === near)) {
          addWire(dy.connecting, { compId: picked.id, port: near })
        }
        dy.connecting = null
        dy.sel = picked.id
        dy.lastTap = null
        return
      }
      dy.lastTap = null
      dy.sel = picked.id
      dy.drag = 'comp'
      s.dragOff = { x: Pt.x - picked.x, y: Pt.y - picked.y }
      return
    }
    dy.sel = null
    dy.connecting = null
    dy.lastTap = null
  }

  function handleMouseMove(e) {
    const s = S.current
    const { x, y } = getPos(e)
    if (s.dragSlider) { s.dragSlider.setX(x); return }
    if (s.tab !== 2) return
    const dy = s.diy
    const R2 = canvasRef.current._R
    if (!R2) return
    const A = diyGeom(R2.W, R2.H)
    const Pt = { x: (x - A.org.x) / A.sc, y: (y - A.org.y) / A.sc }
    if (dy.hold) { dy.mx = x; dy.my = y; return }
    if (dy.connecting) {
      // 预览线画在世界坐标里，这里存回世界坐标
      dy.mx = Pt.x; dy.my = Pt.y
    }
    if (dy.drag === 'comp') {
      const c = dy.comps.find((cc) => cc.id === dy.sel)
      if (c) {
        if (dy.lastTap && Math.hypot(Pt.x - dy.lastTap.x, Pt.y - dy.lastTap.y) > 18) dy.lastTap = null
        const e2 = compExtent(c.type)
        c.x = clamp(Pt.x - (s.dragOff?.x || 0), 12 - e2.x0, A.area.x1 - 12 - e2.x1)
        c.y = clamp(Pt.y - (s.dragOff?.y || 0), 8 - e2.y0, A.area.y1 - 8 - e2.y1)
      }
      return
    }
  }

  function handleMouseUp() {
    S.current.dragSlider = null
    S.current.diy.drag = null
  }

  // 右侧卡片文字装不下时：滚轮在卡片上滚动查看（不改变任何物理量）
  function handleWheel(e) {
    const s = S.current
    if (s.tab !== 1 || !cardRect.current) return
    const r = cardRect.current
    if (r.maxScroll <= 1) return
    const { x, y } = getPos(e)
    if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) return
    s.cardScroll = clamp((s.cardScroll || 0) + e.deltaY * 0.6, 0, r.maxScroll)
    e.preventDefault()
  }

  function handleContextMenu(e) {
    e.preventDefault()
    const s = S.current
    if (s.tab !== 2) return
    const { x, y } = getPos(e)
    const R2 = canvasRef.current._R
    if (!R2) return
    const A = diyGeom(R2.W, R2.H)
    const Pt = { x: (x - A.org.x) / A.sc, y: (y - A.org.y) / A.sc }
    const idx = s.diy.comps.findIndex((c) => {
      const e2 = compExtent(c.type)
      return Pt.x > c.x + e2.x0 - 6 && Pt.x < c.x + e2.x1 + 6 && Pt.y > c.y + e2.y0 - 6 && Pt.y < c.y + e2.y1 + 6
    })
    if (idx >= 0) {
      const id = s.diy.comps[idx].id
      s.diy.comps.splice(idx, 1)
      s.diy.wires = s.diy.wires.filter((w) => w.from.compId !== id && w.to.compId !== id)
      if (s.diy.sel === id) s.diy.sel = null
      s.diy.t = 0
      say('器材已删除')
    }
  }

  return (
    <SceneShell
      title="自感与互感"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t); forceUpdate(n => n + 1) }}
      tab1Label="📊 实验演示"
      tab2Label="🔧 自己动手"
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={handleContextMenu}
      />
    </SceneShell>
  )
}
