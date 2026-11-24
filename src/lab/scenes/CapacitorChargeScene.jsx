import { useState, useRef, useEffect } from 'react'
import { eventToCanvas } from '../utils/pointerPos'
import SceneShell from '../ui/SceneShell'
import { figURL } from './electricSvgInstruments'

/**
 * CapacitorChargeScene — 电容器充放电
 *
 * 电学口径（R 用 kΩ、C 用 μF、U 用 V）：
 *   τ = RC  →  τ(ms) = R(kΩ) × C(μF)        （这个换算刚好是 1:1，便于教学）
 *   I₀ = U/R →  I(mA) = U(V) / R(kΩ)
 *   充电：U_C = U(1−e^(−t/τ))，I = +(U/R)e^(−t/τ)
 *   放电：U_C = U·e^(−t/τ)，  I = −(U/R)e^(−t/τ)
 *   Q = CU（μC），能量 E = ½CU²；1τ → 63.2%，5τ → 99.3%
 *
 * Step1 充电：开关扳到「充电」，极板电荷积累、U_C 上升、I 指数衰减
 * Step2 放电：开关扳到「放电」（短接电源），电容器当电源，电流反向、U_C 指数下降
 * Step3 τ=RC：改 C 或 R 看 τ 变化，可把当前曲线存为对比曲线（多条 U–t 叠加）
 * Tab2 自己动手：自己接线搭 RC 回路，程序自动识别回路并跑真实充放电
 */

const FONT = '"PingFang SC","Microsoft YaHei",system-ui,-apple-system,sans-serif'
const C = {
  bg: '#EDF2F5', card: '#FFFFFF', line: '#DFE8EC', teal: '#12A69B', tealDark: '#0B7F77',
  tealSoft: '#E6F4F2', pos: '#DE453F', posSoft: '#FDEDEC', neg: '#2C6FAF', negSoft: '#EAF1F8',
  gold: '#E2A33C', ink: '#22313A', sub: '#5D7079', faint: '#93A5AD',
}

const STEPS = [
  { key: 1, label: '① 充电过程', sub: '开关扳到充电位：电源经小灯泡给 C 充电，灯泡一开始最亮、随后逐渐变暗直至熄灭；U_C 与 Q 指数上升，约 5τ 充满（99.3%）' },
  { key: 2, label: '② 放电过程', sub: '开关扳到放电位：电源被断开，电容器当电源经小灯泡反向放电，灯泡再次由亮变暗后熄灭，U_C 指数下降至 0' },
  { key: 3, label: '③ 时间常数 τ=RC', sub: 'τ(ms)=R(kΩ)×C(μF)：改 C 或灯丝电阻即改 τ，τ 越大充放电越慢、灯泡变暗也越慢；把不同 τ 的曲线叠在一起对比' },
]

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
function setFont(ctx, size, weight = '') { ctx.font = `${weight ? weight + ' ' : ''}${size}px ${FONT}` }
function fitFont(ctx, text, maxW, size, weight = '') {
  let fs = size
  setFont(ctx, fs, weight)
  while (ctx.measureText(text).width > maxW && fs > 7) { fs -= 0.5; setFont(ctx, fs, weight) }
  return fs
}
function fmtT(ms) {
  if (Math.abs(ms) >= 1000) {
    const v = ms / 1000
    return `${Number(v.toFixed(v >= 100 ? 0 : 1))} s`
  }
  return `${Math.round(ms)} ms`
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

// ───── RC 物理 ─────
const tauOf = (Rk, Cmu) => Rk * Cmu                                  // ms
const uOf = (ms, tau, U, mode) => (mode === 'charge' ? U * (1 - Math.exp(-ms / tau)) : U * Math.exp(-ms / tau))
const iOf = (ms, tau, U, Rk, mode) => (mode === 'charge' ? 1 : -1) * (U / Rk) * Math.exp(-ms / tau)
// 自己动手页的灯丝相对亮度：按时间常数衰减，再按电源电压相对 12 V 压缩一次（3 V 干电池明显更暗）
const diyBright = (ms, tau, U) => Math.pow(Math.exp(-ms / Math.max(tau, 1)), 0.62)
  * Math.pow(clamp((U || 12) / 12, 0.1, 1), 0.5)

function makeLayout(W, H) {
  const stage = { x0: 24, x1: Math.max(W * 0.56, W - 300), y0: 76, y1: H - 126 }
  const panel = { x: W - 282, y: 76, w: 262, h: stage.y1 - 76 }
  const box = { x: stage.x0 + 16, y: stage.y0 + 16, w: stage.x1 - stage.x0 - 32, h: stage.y1 - stage.y0 - 32 }
  const toolbar = { x: 14, y: H - 112, w: W - 28, h: 88 }
  return { stage, panel, box, toolbar }
}

export default function CapacitorChargeScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1, step: 1, mode: 'charge', closed: false, t: 0,            // 秒
    U: 12, Cmu: 100, Rk: 10, ghosts: [],
    toast: null, switchNote: 0,
    // DIY
    diy: {
      comps: [], wires: [], sel: null, hold: null, mx: 0, my: 0,
      drag: null, off: { x: 0, y: 0 }, connecting: null, t: 0, ready: false,
    },
    nextId: 1,
  })

  const [tab, setTab] = useState(1)
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const R = {
      canvas, ctx: canvas.getContext('2d'), W: 0, H: 0,
      resize() {
        canvas.width = canvas.clientWidth * devicePixelRatio
        canvas.height = canvas.clientHeight * devicePixelRatio
        this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
        this.W = canvas.clientWidth; this.H = canvas.clientHeight
      },
    }
    R.resize(); canvasRef.current._R = R
    let last = performance.now()
    const loop = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05); last = now
      const s = S.current
      if (s.tab === 1) {
        const tau = tauOf(s.Rk, s.Cmu)
        if (s.closed && s.t * 1000 < 5 * tau) s.t = Math.min(s.t + dt, (5 * tau) / 1000)
      } else {
        const dy = s.diy
        const res = analyseLoop(dy)
        if (res.ok && (res.switchesClosed)) dy.t += dt
      }
      render(R)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function pushArea(a) { canvasRef.current._clickAreas.push(a) }
  function say(text) { S.current.toast = { text, until: Date.now() + 2200 } }

  function render(R) {
    try {
      const ctx = R.ctx, W = R.W, H = R.H
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H)
      canvasRef.current._clickAreas = []
      if (S.current.tab === 1) renderDemo(ctx, W, H)
      else renderDiy(ctx, W, H)
      canvasRef.current._dbg = {
        step: S.current.step, tab: S.current.tab, t: S.current.t,
        info: { U: S.current.U, Cmu: S.current.Cmu, Rk: S.current.Rk, mode: S.current.mode, closed: S.current.closed },
        areas: canvasRef.current._clickAreas.map((a) => ({ n: a.n || '', x: Math.round(a.x), y: Math.round(a.y), w: Math.round(a.w), h: Math.round(a.h) })),
        diy: { K: +DIYK.toFixed(2), comps: S.current.diy.comps.map((c) => c.type + '@' + Math.round(c.x) + ',' + Math.round(c.y)), wires: S.current.diy.wires.length, closed: S.current.diy.comps.map((c) => !!c.closed) },
      }
    } catch (e) { console.error('render error:', e) }
  }

  // ═════════════════════════════════════════════
  //  Tab1
  // ═════════════════════════════════════════════
  function infoOf(s) {
    const tau = tauOf(s.Rk, s.Cmu)
    const U = s.U, Rk = s.Rk, Cmu = s.Cmu, mode = s.mode
    const tms = s.t * 1000
    const uc = uOf(tms, tau, U, mode)
    const i = iOf(tms, tau, U, Rk, mode)
    const q = Cmu * uc               // μC
    const E = 0.5 * Cmu * uc * uc    // μJ
    const iShow = s.closed ? i : 0   // 开关断开时电流为 0（曲线仍显示理论形状）
    // 稳态判定：充电到 5τ 视为充满；放电到 U_C≈0 视为放完。两者电路都仍然闭合
    const done = s.closed && tms >= 5 * tau - 0.5
    return { tau, U, Rk, Cmu, mode, tms, uc, i, iShow, q, E, done, I0: U / Rk, Q0: Cmu * U }
  }

  function renderDemo(ctx, W, H) {
    const s = S.current
    const L = makeLayout(W, H)
    drawHeader(ctx, W, s)
    drawStageCard(ctx, L)

    // 电路在上（约 58%），两张曲线在下
    const splitY = L.box.y + L.box.h * 0.60
    const circA = { x: L.box.x + 10, y: L.box.y + 30, w: L.box.w - 20, h: splitY - L.box.y - 40 }
    const chW = (L.box.w - 34) / 2
    const chA = { x: L.box.x + 10, y: splitY, w: chW, h: L.box.y + L.box.h - splitY - 10 }
    const chB = { x: L.box.x + 24 + chW, y: splitY, w: chW, h: L.box.y + L.box.h - splitY - 10 }
    const info = infoOf(s)

    drawCircuit(ctx, circA, s, info)
    drawChart(ctx, chA, s, info, 'I')
    drawChart(ctx, chB, s, info, 'U')
    drawPanel(ctx, L, s, info)
    drawToolbar(ctx, W, L, s, info)
    drawToast(ctx, W, s)
  }

  function drawHeader(ctx, W, s) {
    const bw = 138, bh = 30, gap = 10
    const total = STEPS.length * bw + (STEPS.length - 1) * gap
    const x0 = (W - total) / 2
    STEPS.forEach((st, i) => {
      const x = x0 + i * (bw + gap), y = 10
      const active = s.step === st.key
      ctx.beginPath(); ctx.roundRect(x, y, bw, bh, 9)
      ctx.fillStyle = active ? C.teal : C.card; ctx.fill()
      ctx.strokeStyle = active ? C.tealDark : C.line; ctx.lineWidth = 1; ctx.stroke()
      setFont(ctx, 12, 'bold'); ctx.fillStyle = active ? '#fff' : C.sub
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(st.label, x + bw / 2, y + bh / 2 + 1)
      pushArea({ n: `step${st.key}`, x, y, w: bw, h: bh, onClick: () => goStep(st.key) })
    })
    ctx.fillStyle = C.sub
    fitFont(ctx, STEPS[s.step - 1].sub, W - 90, 12)
    ctx.fillText(STEPS[s.step - 1].sub, W / 2, 58)
    ctx.textBaseline = 'alphabetic'
  }

  function goStep(key) {
    const s = S.current
    s.step = key
    s.mode = key === 2 ? 'discharge' : 'charge'
    s.t = 0
    s.closed = false
    s.switchNote = 0
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

  // ── 电路 ──
  function circuitGeom(a) {
    const k = clamp(Math.min(a.w / 940, a.h / 240), 0.85, 1.5)
    const x1 = a.x + a.w * 0.25, x2 = a.x + a.w * 0.86
    const yTop = a.y + a.h * 0.15, yBot = a.y + a.h * 0.96
    const yc = yTop + (yBot - yTop) * 0.62
    const rW = 84 * k, rc = (x1 + x2) / 2
    return { x1, x2, yTop, yBot, yc, r0: rc - rW / 2, r1: rc + rW / 2, rMid: rc, k, lw: 2.4 * k }
  }

  function drawCircuit(ctx, a, s, info) {
    const g = circuitGeom(a)
    const k = g.k
    const on = s.closed
    const isCharge = s.mode === 'charge'
    const wireCol = on ? '#1E7F8E' : '#B4C4CB'
    const lw = g.lw

    const seg = (x0, y0, x1, y1, col = wireCol, w = lw) => {
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.lineCap = 'butt'
    }

    // 顶部导线 —— 小灯泡（灯座两端接进回路）
    seg(g.x1, g.yTop, g.r0, g.yTop)
    seg(g.r1, g.yTop, g.x2, g.yTop)
    // 灯泡亮度 ∝ 功率 P=I²R（教学上按 (I/I₀)^1.15 映射，抵消视觉非线性）
    const i0 = Math.max(s.U / s.Rk, 0.001)
    const bright = on ? Math.pow(clamp(Math.abs(info.iShow) / i0, 0, 1), 1.15) : 0
    drawBulb(ctx, g.r0, g.r1, g.yTop, k, bright)
    // 右侧 —— 电容
    seg(g.x2, g.yTop, g.x2, g.yc - 10 * k)
    seg(g.x2, g.yc + 10 * k, g.x2, g.yBot)
    drawCapacitor(ctx, g.x2, g.yc, s, info, k)
    // 左侧：单刀双掷闸刀（底座在下、刀向上摆向两根立柱的柱帽）
    const yPiv = g.yTop + 56 * k
    const pivot = { x: g.x1, y: yPiv }
    seg(g.x1, g.yTop, g.x1, yPiv - 1 * k)
    const sw = drawSwitch(ctx, pivot, s, isCharge, k * 1.14)
    const cR = sw.rightFoot, cL = sw.leftFoot
    // 充电支路（含电池）——刀离开该掷点时整条支路断开
    const by = g.yBot - 38 * k
    const chCol = on && isCharge ? wireCol : '#CBD8DD'
    seg(cR.x, cR.y, cR.x, by - 27 * k, chCol)
    drawBattery(ctx, cR.x, by, k)
    seg(cR.x, by + 27 * k, cR.x, g.yBot, chCol)
    // 放电支路：从放电掷点竖直到底沿，再沿底边回到电容
    const disCol = on && !isCharge ? wireCol : '#CBD8DD'
    seg(cL.x, cL.y, cL.x, g.yBot, disCol)
    seg(cL.x, g.yBot, cR.x, g.yBot, disCol)
    // 底边：电容下极板 → 放电掷点
    seg(g.x2, g.yBot, cL.x, g.yBot)
    setFont(ctx, Math.round(8 * k), 'bold'); ctx.fillStyle = on && !isCharge ? C.neg : '#9CB0B8'
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
    ctx.fillText('放电支路（拨此位时电源断开）', cL.x - 10, g.yBot - 12)

    // 电流方向与流动（到达稳态 I≈0 时不再画箭头）
    if (on && !info.done && Math.abs(info.i) > 0.004) {
      drawCurrentFlow(ctx, g, s, info, isCharge ? cR.x : cL.x)
    }

    // 标注
    setFont(ctx, Math.round(9.5 * k), 'bold'); ctx.fillStyle = C.sub
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    fitFont(ctx, `小灯泡 · 灯丝 ${s.Rk} kΩ`, (g.r1 - g.r0) + 60 * k, 9.5 * k, 'bold')
    ctx.fillText(`小灯泡 · 灯丝 ${s.Rk} kΩ`, g.rMid, g.yTop + 15 * k)
    ctx.textAlign = 'left'
    ctx.fillText(`C = ${s.Cmu} μF`, g.x2 + 34 * k, g.yc - 32 * k)
    ctx.fillText(`Q = ${info.q.toFixed(0)} μC`, g.x2 + 34 * k, g.yc + 20 * k)
    ctx.fillText(`U₀ = ${s.U} V`, cR.x + 26 * k, by - 6 * k)
    // 状态条
    const tagY = a.y + 2
    const tag = !on
      ? (isCharge ? '开关断开 · 未充电' : '开关断开 · 停止放电')
      : isCharge
        ? (info.done ? '已充满 I≈0 · 电路仍闭合' : '充电中')
        : (info.done ? '已放电完毕 · 电路仍闭合' : '放电中')
    setFont(ctx, 10, 'bold')
    const tw = ctx.measureText(tag).width + 22
    ctx.beginPath(); ctx.roundRect(a.x + 6, tagY, tw, 22, 11)
    ctx.fillStyle = on ? (isCharge ? 'rgba(18,166,155,0.12)' : 'rgba(44,111,175,0.12)') : 'rgba(147,165,173,0.12)'
    ctx.fill()
    ctx.fillStyle = on ? (isCharge ? C.tealDark : C.neg) : C.faint
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(tag, a.x + 6 + tw / 2, tagY + 11)

    setFont(ctx, 9); ctx.fillStyle = C.faint
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
    ctx.fillText(isCharge ? '刀在充电位：电源—灯丝—C 串联闭合' : '刀在放电位：C 经灯丝放电，电源支路断开', a.x + a.w - 8, tagY + 11)
    ctx.textBaseline = 'alphabetic'
  }

  // 小灯泡本体（实物造型：灯座 + 螺口 + 玻璃泡 + 灯丝）。bright 0..1 控制发光
  function drawBulbShape(ctx, cx, y, k = 1, bright = 0, half = 20) {
    const b = clamp(bright, 0, 1)
    const r = clamp(half * 0.86, 9 * k, 21 * k)
    const cy = y - 10 * k - r
    // 光晕
    if (b > 0.02) {
      const gr = ctx.createRadialGradient(cx, cy, 1.5 * k, cx, cy, r * 3.5)
      gr.addColorStop(0, `rgba(255,240,190,${0.5 * b + 0.08})`)
      gr.addColorStop(0.34, `rgba(255,214,136,${0.3 * b})`)
      gr.addColorStop(0.72, `rgba(255,204,120,${0.1 * b})`)
      gr.addColorStop(1, 'rgba(255,198,110,0)')
      ctx.beginPath(); ctx.arc(cx, cy, r * 3.5, 0, Math.PI * 2)
      ctx.fillStyle = gr; ctx.fill()
    }
    // 灯座（白色陶瓷/胶木座，两端带接线螺丝）
    const baseH = 12 * k
    ctx.beginPath(); ctx.roundRect(cx - half, y - baseH / 2, half * 2, baseH, 3.5 * k)
    const bgd = ctx.createLinearGradient(0, y - baseH / 2, 0, y + baseH / 2)
    bgd.addColorStop(0, '#FFFFFF'); bgd.addColorStop(0.62, '#EDF3F2'); bgd.addColorStop(1, '#D2DFDC')
    ctx.fillStyle = bgd; ctx.fill()
    ctx.strokeStyle = '#BFD0CB'; ctx.lineWidth = 1.1 * k; ctx.stroke()
    ctx.fillStyle = '#AFBEBC'
    for (const sx of [-half + 4.5 * k, half - 4.5 * k]) {
      ctx.beginPath(); ctx.arc(cx + sx, y, 2.1 * k, 0, Math.PI * 2); ctx.fill()
    }
    // 螺口（金属螺纹，3 道）
    const neckTop = y - 8 * k
    const mg = ctx.createLinearGradient(cx - 8 * k, 0, cx + 8 * k, 0)
    mg.addColorStop(0, '#8C969B'); mg.addColorStop(0.38, '#DCE3E6'); mg.addColorStop(1, '#7C878C')
    ctx.fillStyle = mg
    ctx.beginPath()
    ctx.moveTo(cx - 8.4 * k, neckTop); ctx.lineTo(cx + 8.4 * k, neckTop)
    ctx.lineTo(cx + 6.6 * k, y - 5.6 * k); ctx.lineTo(cx - 6.6 * k, y - 5.6 * k)
    ctx.closePath(); ctx.fill()
    ctx.strokeStyle = 'rgba(70,80,86,0.5)'; ctx.lineWidth = 0.7 * k
    for (let i = 0; i < 3; i++) {
      const yy = neckTop + (i + 0.65) * 1.9 * k
      ctx.beginPath(); ctx.moveTo(cx - 8 * k, yy); ctx.lineTo(cx + 8 * k, yy); ctx.stroke()
    }
    // 玻璃泡
    const glass = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.34, 1 * k, cx, cy, r + 2 * k)
    if (b > 0.03) {
      glass.addColorStop(0, `rgba(255,247,219,${0.55 + 0.4 * b})`)
      glass.addColorStop(0.62, `rgba(255,226,146,${0.26 + 0.5 * b})`)
      glass.addColorStop(1, `rgba(255,210,112,${0.10 + 0.42 * b})`)
    } else {
      glass.addColorStop(0, 'rgba(245,251,253,0.97)')
      glass.addColorStop(0.72, 'rgba(228,240,246,0.92)')
      glass.addColorStop(1, 'rgba(205,222,232,0.94)')
    }
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = glass; ctx.fill()
    ctx.strokeStyle = b > 0.3 ? 'rgba(228,164,48,0.85)' : '#B4C9D4'
    ctx.lineWidth = 1.15 * k; ctx.stroke()
    // 灯丝：两根引丝 + 中部 M 形灯丝，随亮度由灰变亮黄
    const fA = cx - r * 0.24, fB = cx + r * 0.24
    const top = cy - r * 0.22, bot = cy + r * 0.3
    ctx.lineCap = 'round'
    ctx.strokeStyle = b > 0.5 ? '#FFF7DC' : b > 0.1 ? '#EBC77F' : '#A3B0B6'
    ctx.lineWidth = 1.1 * k
    ctx.beginPath()
    ctx.moveTo(fA, y - 6.5 * k); ctx.lineTo(fA, bot)
    ctx.moveTo(fB, y - 6.5 * k); ctx.lineTo(fB, bot)
    ctx.moveTo(fA, bot)
    for (let i = 0; i < 4; i++) {
      const fx = fA + ((i + 1) * (fB - fA)) / 5
      ctx.lineTo(fx, i % 2 ? bot : top)
    }
    ctx.lineTo(fB, bot)
    ctx.stroke()
    if (b > 0.12) {
      ctx.strokeStyle = `rgba(255,252,226,${0.5 * b})`
      ctx.lineWidth = 3 * k
      ctx.beginPath()
      ctx.moveTo(fA, bot)
      for (let i = 0; i < 4; i++) {
        const fx = fA + ((i + 1) * (fB - fA)) / 5
        ctx.lineTo(fx, i % 2 ? bot : top)
      }
      ctx.lineTo(fB, bot)
      ctx.stroke()
    }
    ctx.lineCap = 'butt'
  }

  function drawBulb(ctx, x0, x1, y, k, bright) {
    const cx = (x0 + x1) / 2
    const half = Math.min(26 * k, Math.max(17 * k, (x1 - x0) / 2 - 6 * k))
    ctx.strokeStyle = '#7E949C'; ctx.lineWidth = 1.8 * k
    ctx.beginPath()
    ctx.moveTo(x0, y); ctx.lineTo(cx - half, y)
    ctx.moveTo(cx + half, y); ctx.lineTo(x1, y)
    ctx.stroke()
    drawBulbShape(ctx, cx, y, k, bright, half)
  }

  function drawCapacitor(ctx, x, y, s, info, k = 1) {
    const uc = info.uc, U = s.U
    const frac = clamp(uc / Math.max(U, 0.001), 0, 1)
    const half = 26 * k, gap = 10 * k
    // 极板间的电场着色（上正下负，与极板同色）
    if (frac > 0.02) {
      const gdt = ctx.createLinearGradient(0, y - gap, 0, y + gap)
      gdt.addColorStop(0, `rgba(222,69,63,${0.06 + frac * 0.14})`)
      gdt.addColorStop(1, `rgba(44,111,175,${0.06 + frac * 0.14})`)
      ctx.fillStyle = gdt; ctx.fillRect(x - half, y - gap, half * 2, gap * 2)
    }
    // 两块极板（水平）：上板接电源正 → 带正电
    ctx.strokeStyle = C.pos; ctx.lineWidth = 3.4 * k; ctx.lineCap = 'butt'
    ctx.beginPath(); ctx.moveTo(x - half, y - gap); ctx.lineTo(x + half, y - gap); ctx.stroke()
    ctx.strokeStyle = C.neg
    ctx.beginPath(); ctx.moveTo(x - half, y + gap); ctx.lineTo(x + half, y + gap); ctx.stroke()
    // 极板电荷符号（贴在极板内侧）
    const n = Math.max(0, Math.round(frac * 5))
    setFont(ctx, Math.round(7.5 * k), 'bold')
    for (let i = 0; i < n; i++) {
      const px = x - 20 * k + i * 10 * k
      ctx.fillStyle = C.pos; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
      ctx.fillText('+', px, y - 1)
      ctx.fillStyle = C.neg; ctx.textBaseline = 'top'
      ctx.fillText('−', px, y + 1)
    }
    ctx.textBaseline = 'alphabetic'
  }

  function drawBattery(ctx, x, y, k = 1) {
    // 干电池（真实器材造型）：外壳 + 顶端凸起，与电容器极板明显区分
    const w = 34 * k, h = 52 * k
    const gdt = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0)
    gdt.addColorStop(0, '#2E7D5B'); gdt.addColorStop(0.35, '#59B58E'); gdt.addColorStop(1, '#2A7354')
    ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, 5 * k)
    ctx.fillStyle = gdt; ctx.fill()
    ctx.strokeStyle = '#215E45'; ctx.lineWidth = 1.2 * k; ctx.stroke()
    ctx.beginPath(); ctx.roundRect(x - 6 * k, y - h / 2 - 6 * k, 12 * k, 7 * k, 3 * k)
    ctx.fillStyle = '#C6D2CD'; ctx.fill(); ctx.strokeStyle = '#9FAFA8'; ctx.lineWidth = 1; ctx.stroke()
    setFont(ctx, Math.round(8.5 * k), 'bold'); ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('12V', x, y + 2)
    setFont(ctx, Math.round(10 * k), 'bold'); ctx.fillStyle = '#FFFFFF'
    ctx.fillText('+', x, y - 16 * k)
    ctx.fillStyle = '#D8EDE5'
    ctx.fillText('−', x, y + 17 * k)
    ctx.textBaseline = 'alphabetic'
  }

  // 单刀双掷闸刀开关（沿用项目既有器材造型）：
  //   胶木底板（顶面 + 前立面，四角螺丝）+ 左右两根接线柱（柱帽朝上）+ 中央轴座 + 钢质刀杆（末端黑色绝缘柄）
  //   合闸时刀身以 45° 压到掷点柱帽上；柱帽最后画，压住刀身下缘 → 刀"搭"在帽上
  function drawSwitch(ctx, pivot, s, isCharge, k = 1) {
    const postX = 36 * k
    const capY = pivot.y - 36 * k           // 45° 摆角：横向 36k、竖向 36k
    const capR = 6.6 * k
    const baseTop = pivot.y - 2 * k         // 轴座坐在底板上
    const baseFront = baseTop + 9 * k       // 顶面 → 前立面分界
    const baseBot = baseTop + 19 * k
    const halfTop = postX + 22 * k
    const halfBot = halfTop + 4 * k
    const footY = baseBot
    const leftFoot = { x: pivot.x - postX, y: footY }
    const rightFoot = { x: pivot.x + postX, y: footY }
    const dir = isCharge ? 1 : -1

    // ── 底板：顶面（浅灰、可见小透视）+ 前立面（深一档）──
    ctx.beginPath()
    ctx.moveTo(pivot.x - halfTop, baseTop)
    ctx.lineTo(pivot.x + halfTop, baseTop)
    ctx.lineTo(pivot.x + halfBot, baseBot)
    ctx.lineTo(pivot.x - halfBot, baseBot)
    ctx.closePath()
    const pdt = ctx.createLinearGradient(0, baseFront, 0, baseBot)
    pdt.addColorStop(0, '#C3CCD1'); pdt.addColorStop(0.5, '#AFBAC0'); pdt.addColorStop(1, '#9AA7AE')
    ctx.fillStyle = pdt; ctx.fill()
    // 顶面
    ctx.beginPath()
    ctx.moveTo(pivot.x - halfTop, baseTop)
    ctx.lineTo(pivot.x + halfTop, baseTop)
    ctx.lineTo(pivot.x + halfTop + 1.6 * k, baseFront)
    ctx.lineTo(pivot.x - halfTop - 1.6 * k, baseFront)
    ctx.closePath()
    const ptp = ctx.createLinearGradient(0, baseTop, 0, baseFront)
    ptp.addColorStop(0, '#FAFCFD'); ptp.addColorStop(0.55, '#E6EBEE'); ptp.addColorStop(1, '#D3DBDF')
    ctx.fillStyle = ptp; ctx.fill()
    ctx.strokeStyle = '#9BAAB1'; ctx.lineWidth = 1 * k
    ctx.beginPath()
    ctx.moveTo(pivot.x - halfTop, baseTop)
    ctx.lineTo(pivot.x + halfTop, baseTop)
    ctx.lineTo(pivot.x + halfTop + 1.6 * k, baseFront)
    ctx.lineTo(pivot.x - halfTop - 1.6 * k, baseFront)
    ctx.closePath(); ctx.stroke()
    // 顶面高光
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 0.9 * k
    ctx.beginPath(); ctx.moveTo(pivot.x - halfTop + 1 * k, baseTop + 0.8 * k); ctx.lineTo(pivot.x + halfTop - 1 * k, baseTop + 0.8 * k); ctx.stroke()
    // 四角螺丝（顶面）
    for (const sx of [-(halfTop - 7.5 * k), halfTop - 7.5 * k]) {
      ctx.beginPath(); ctx.arc(pivot.x + sx, baseTop + 3.6 * k, 2.2 * k, 0, Math.PI * 2)
      ctx.fillStyle = '#8E9CA3'; ctx.fill()
      ctx.strokeStyle = '#7C8A91'; ctx.lineWidth = 0.6 * k
      ctx.beginPath(); ctx.moveTo(pivot.x + sx - 1.2 * k, baseTop + 3.6 * k); ctx.lineTo(pivot.x + sx + 1.2 * k, baseTop + 3.6 * k); ctx.stroke()
    }

    // ── 中央轴座（刀刃的轴，坐在底板顶面上）──
    ctx.fillStyle = '#8C9AA2'
    ctx.beginPath(); ctx.roundRect(pivot.x - 7.4 * k, pivot.y - 3 * k, 14.8 * k, 11 * k, 2.2 * k); ctx.fill()
    ctx.strokeStyle = '#6E7C84'; ctx.lineWidth = 1 * k; ctx.stroke()
    const axg = ctx.createRadialGradient(pivot.x - 1.8 * k, pivot.y - 1.6 * k, 0.8 * k, pivot.x, pivot.y, 6.2 * k)
    axg.addColorStop(0, '#FFFFFF'); axg.addColorStop(0.5, '#CFD9DD'); axg.addColorStop(1, '#7C8A91')
    ctx.beginPath(); ctx.arc(pivot.x, pivot.y, 5.8 * k, 0, Math.PI * 2)
    ctx.fillStyle = axg; ctx.fill()
    ctx.strokeStyle = '#67757D'; ctx.lineWidth = 1 * k; ctx.stroke()
    ctx.beginPath(); ctx.arc(pivot.x, pivot.y, 1.9 * k, 0, Math.PI * 2)
    ctx.fillStyle = '#57666E'; ctx.fill()

    // ── 两根接线柱（立在底板顶面上，柱帽在最上方）──
    const posts = [
      { x: pivot.x - postX, active: !isCharge },
      { x: pivot.x + postX, active: isCharge },
    ]
    for (const pt of posts) {
      const p = pt.x
      // 柱脚垫片（把柱子"钉"在顶面上，略宽于柱身，露出边沿）
      ctx.beginPath(); ctx.roundRect(p - 6.4 * k, baseTop + 0.8 * k, 12.8 * k, 4.4 * k, 1.6 * k)
      ctx.fillStyle = pt.active ? '#0F8C83' : '#B4C1C7'; ctx.fill()
      ctx.strokeStyle = pt.active ? '#0A6E68' : '#9AABB2'; ctx.lineWidth = 0.8 * k; ctx.stroke()
      // 柱身
      const pst = ctx.createLinearGradient(p - 3.6 * k, 0, p + 3.6 * k, 0)
      pst.addColorStop(0, pt.active ? '#066C64' : '#7F8F97')
      pst.addColorStop(0.4, pt.active ? '#38C3B6' : '#DCE4E8')
      pst.addColorStop(1, pt.active ? '#04564F' : '#8E9EA6')
      ctx.fillStyle = pst
      ctx.fillRect(p - 3.6 * k, capY + capR * 0.3, 7.2 * k, baseTop + 1.4 * k - (capY + capR * 0.3))
    }

    // ── 两个静触点夹片（单刀双掷：中轴左右各一，刀落在缝里）──
    const clipOff = postX - 12 * k
    const clipTopY = pivot.y - 26 * k
    for (const sg of [-1, 1]) {
      const cx = pivot.x + sg * clipOff
      const on = (sg > 0) === isCharge
      const ch = baseTop - clipTopY
      const cg2 = ctx.createLinearGradient(cx - 4.4 * k, 0, cx + 4.4 * k, 0)
      cg2.addColorStop(0, '#7A8A93'); cg2.addColorStop(0.42, '#EFF4F6')
      cg2.addColorStop(0.68, '#C2CED4'); cg2.addColorStop(1, '#74848D')
      ctx.beginPath(); ctx.roundRect(cx - 4.4 * k, clipTopY, 8.8 * k, ch, 2.6 * k)
      ctx.fillStyle = cg2; ctx.fill()
      ctx.strokeStyle = '#68787F'; ctx.lineWidth = 0.8 * k; ctx.stroke()
      // 顶弧高光 + 中间夹缝
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 0.7 * k
      ctx.beginPath(); ctx.arc(cx, clipTopY + 2.6 * k, 3.5 * k, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke()
      ctx.beginPath(); ctx.roundRect(cx - 1.5 * k, clipTopY + 2.4 * k, 3 * k, ch - 2.4 * k, 1 * k)
      ctx.fillStyle = on ? 'rgba(3,58,55,0.8)' : 'rgba(56,72,80,0.5)'; ctx.fill()
    }

    // ── 刀杆（钢色柱面，刀尖插进夹缝，末端黑色绝缘柄）──
    const target = { x: pivot.x + dir * (clipOff + 4 * k), y: clipTopY + 10 * k }
    const baseAng = Math.atan2(target.y - pivot.y, target.x - pivot.x)
    const ang = s.closed ? baseAng : baseAng + (dir > 0 ? -30 : 30) * Math.PI / 180
    const L = Math.hypot(clipOff + 4 * k, pivot.y - (clipTopY + 10 * k))
    ctx.save()
    ctx.translate(pivot.x, pivot.y)
    ctx.rotate(ang)
    const bg2 = ctx.createLinearGradient(0, -3 * k, 0, 3 * k)
    bg2.addColorStop(0, '#F4F7F8'); bg2.addColorStop(0.42, '#C6CFD4'); bg2.addColorStop(1, '#828E95')
    ctx.strokeStyle = bg2; ctx.lineWidth = 5.4 * k; ctx.lineCap = 'butt'
    ctx.beginPath(); ctx.moveTo(4 * k, 0); ctx.lineTo(L + 1 * k, 0); ctx.stroke()
    // 刀尖铜触点（插进夹缝）
    ctx.fillStyle = s.closed ? '#CFE4E1' : '#C3CED3'
    ctx.beginPath(); ctx.roundRect(L - 6.4 * k, -3.0 * k, 5.2 * k, 6 * k, 1.2 * k); ctx.fill()
    // 黑色绝缘柄（刀尾，长度收到不压柱帽）
    const hdt = ctx.createLinearGradient(0, -5.2 * k, 0, 5.2 * k)
    hdt.addColorStop(0, '#4C5157'); hdt.addColorStop(0.42, '#232426'); hdt.addColorStop(1, '#15171A')
    ctx.beginPath(); ctx.roundRect(0.26 * L, -4.8 * k, 0.36 * L, 9.6 * k, 3.6 * k)
    ctx.fillStyle = hdt; ctx.fill()
    ctx.strokeStyle = '#0F1012'; ctx.lineWidth = 0.9 * k; ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 0.8 * k
    ctx.beginPath(); ctx.moveTo(0.32 * L, -2.9 * k); ctx.lineTo(0.56 * L, -2.9 * k); ctx.stroke()
    ctx.restore()

    // ── 柱帽最后画：压住刀身下缘 → 刀"搭"在帽上 ──
    for (const pt of posts) {
      const p = pt.x
      const cg = ctx.createRadialGradient(p - capR * 0.3, capY - capR * 0.36, capR * 0.14, p, capY, capR)
      cg.addColorStop(0, pt.active ? '#A7F3E7' : '#FBFDFD')
      cg.addColorStop(0.46, pt.active ? '#17A99D' : '#CFD9DD')
      cg.addColorStop(1, pt.active ? '#08726B' : '#93A6AE')
      ctx.beginPath(); ctx.arc(p, capY, capR, 0, Math.PI * 2)
      ctx.fillStyle = cg; ctx.fill()
      ctx.strokeStyle = pt.active ? '#0A6F68' : '#87999F'; ctx.lineWidth = 1 * k; ctx.stroke()
      ctx.beginPath(); ctx.arc(p, capY, capR * 0.42, 0, Math.PI * 2)
      ctx.fillStyle = pt.active ? '#065C57' : '#9CADB5'; ctx.fill()
      ctx.strokeStyle = pt.active ? 'rgba(4,72,68,0.32)' : 'rgba(110,124,132,0.32)'; ctx.lineWidth = 0.7 * k
      for (let i = -1.5; i <= 1.5; i++) {
        const hx = p + i * 3 * k
        const hh = Math.sqrt(Math.max(0, capR * capR - (i * 3 * k) ** 2)) - 2.2 * k
        if (hh <= 0) continue
        ctx.beginPath(); ctx.moveTo(hx, capY - hh); ctx.lineTo(hx, capY + hh); ctx.stroke()
      }
    }

    // ── 掷点标签（放在柱外侧，避开柱身与刀）──
    setFont(ctx, Math.round(8.5 * k), 'bold'); ctx.textBaseline = 'middle'
    ctx.fillStyle = isCharge ? C.tealDark : C.faint
    ctx.textAlign = 'left'
    ctx.fillText('① 充电', pivot.x + postX + 9 * k, capY + 2 * k)
    ctx.fillStyle = !isCharge ? C.neg : C.faint
    ctx.textAlign = 'right'
    ctx.fillText('② 放电', pivot.x - postX - 9 * k, capY + 2 * k)
    ctx.textAlign = 'center'
    // 点击区
    pushArea({
      n: 'switch',
      x: pivot.x - 60 * k, y: capY - 14 * k, w: 120 * k, h: (footY - capY) + 18 * k,
      onClick: () => toggleSwitch(),
    })
    ctx.textBaseline = 'alphabetic'
    return { leftFoot, rightFoot }
  }

  function toggleSwitch() {
    const s = S.current
    s.closed = !s.closed
    s.t = 0
    say(s.closed
      ? (s.mode === 'charge' ? '开关闭合，开始充电：灯泡先最亮，随 I 减小逐渐变暗' : '开关闭合，开始放电：灯泡先最亮，随后变暗直至熄灭')
      : '开关断开')
  }

  // 电流流动（沿回路的小箭头）
  function drawCurrentFlow(ctx, g, s, info, lx = g.x1) {
    const isCharge = s.mode === 'charge'
    // 顶边分两段绕开灯泡本体（箭头不压在灯丝上）
    const pts = [
      [g.r1, g.yTop], [g.x2, g.yTop], [g.x2, g.yBot], [lx, g.yBot], [lx, g.yTop], [g.r0, g.yTop],
    ]
    // 周长与分段
    let total = 0
    const segs = []
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1]
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      segs.push({ a, b, len, start: total })
      total += len
    }
    const phase = ((performance.now() / 1000) * (0.55 + Math.abs(info.i) / Math.max(info.I0, 0.001) * 1.2)) % 1
    const cnt = 4
    for (let j = 0; j < cnt; j++) {
      let u = (phase + j / cnt) % 1
      if (!isCharge) u = 1 - u
      const dist = u * total
      let sg = segs[0]
      for (const sgi of segs) if (dist >= sgi.start && dist <= sgi.start + sgi.len) { sg = sgi; break }
      const f = (dist - sg.start) / sg.len
      const x = sg.a[0] + (sg.b[0] - sg.a[0]) * f
      const y = sg.a[1] + (sg.b[1] - sg.a[1]) * f
      const col = isCharge ? C.pos : C.neg
      arrowHead(ctx, x, y, sg.b[0] - sg.a[0], sg.b[1] - sg.a[1], col, 5.5 * (g.k || 1))
    }
    setFont(ctx, Math.round(9 * (g.k || 1)), 'bold'); ctx.fillStyle = isCharge ? C.pos : C.neg
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText(`I = ${Math.abs(info.i).toFixed(2)} mA ${isCharge ? '（顺时针）' : '（逆时针）'}`, g.x1 + 8, g.yBot + 14)
    ctx.textBaseline = 'alphabetic'
  }

  // ── 曲线 ──
  function drawChart(ctx, box, s, info, kind) {
    const isI = kind === 'I'
    ctx.beginPath(); ctx.roundRect(box.x, box.y, box.w, box.h, 8)
    ctx.fillStyle = '#FFFFFF'; ctx.fill()
    ctx.strokeStyle = '#E4EDF1'; ctx.lineWidth = 1; ctx.stroke()

    const m = { l: 46, r: 14, t: 30, b: 26 }
    const px0 = box.x + m.l, py0 = box.y + m.t
    const pw = box.w - m.l - m.r, ph = box.h - m.t - m.b

    // 标题
    setFont(ctx, 10.5, 'bold'); ctx.fillStyle = C.ink
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText(isI ? '电流 I – t（mA）' : '电压 U_C – t（V）', box.x + 12, box.y + 9)
    setFont(ctx, 8.5, 'bold'); ctx.fillStyle = C.tealDark
    ctx.textAlign = 'right'
    ctx.fillText(s.mode === 'charge' ? '充电' : '放电', box.x + box.w - 12, box.y + 10)

    const tauNow = info.tau
    // 对比曲线只画在 U–t 图上（多个 τ 叠在一张图里最有教学意义）
    const ghosts = s.step === 3 && !isI ? s.ghosts : []
    const ghostTaus = s.step === 3 ? s.ghosts.map((g) => 5 * tauOf(g.Rk, g.Cmu)) : []
    const xMax = Math.max(5 * tauNow, ...ghostTaus, 1)
    const yMaxI = info.I0 * 1.08
    const yMaxU = Math.max(info.U, ...ghosts.map((g) => g.U), 0.001) * 1.06

    const X = (ms) => px0 + (ms / xMax) * pw
    let zeroY = py0 + ph
    if (isI) zeroY = py0 + ph / 2

    // 网格
    ctx.strokeStyle = '#F0F5F7'; ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const x = px0 + (pw * i) / 4
      ctx.beginPath(); ctx.moveTo(x, py0); ctx.lineTo(x, py0 + ph); ctx.stroke()
    }
    for (let i = 0; i <= 4; i++) {
      const y = py0 + (ph * i) / 4
      ctx.beginPath(); ctx.moveTo(px0, y); ctx.lineTo(px0 + pw, y); ctx.stroke()
    }
    // 轴
    ctx.strokeStyle = '#C7D5DB'; ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.moveTo(px0, py0); ctx.lineTo(px0, py0 + ph); ctx.lineTo(px0 + pw, py0 + ph); ctx.stroke()
    if (isI) {
      ctx.strokeStyle = '#DCE6EA'; ctx.setLineDash([5, 4])
      ctx.beginPath(); ctx.moveTo(px0, zeroY); ctx.lineTo(px0 + pw, zeroY); ctx.stroke()
      ctx.setLineDash([])
    }
    // 刻度
    setFont(ctx, 8.5); ctx.fillStyle = C.faint
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    for (let i = 0; i <= 4; i++) {
      if (i === 0) continue
      const ms = (xMax * i) / 4
      ctx.fillText(fmtT(ms), px0 + (pw * i) / 4, py0 + ph + 5)
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
    for (let i = 0; i <= 4; i++) {
      const v = isI ? (yMaxI * (2 - i)) / 2 : (yMaxU * (4 - i)) / 4
      const txt = fmtNum(Math.abs(v))
      ctx.fillText(v < -0.001 ? `−${txt}` : txt, px0 - 8, isI ? zeroY - (v / yMaxI) * (ph / 2) : py0 + ph - (v / yMaxU) * ph)
    }
    ctx.textBaseline = 'alphabetic'

    // τ 与 5τ
    const markTau = (ms, label, col, dashed) => {
      // 落在坐标区右边界时就是边框本身，不再画线标注
      if (ms > xMax - 1) return
      ctx.strokeStyle = col; ctx.lineWidth = 1
      if (dashed) ctx.setLineDash([4, 4])
      ctx.beginPath(); ctx.moveTo(X(ms), py0); ctx.lineTo(X(ms), py0 + ph); ctx.stroke()
      ctx.setLineDash([])
      // 标在坐标区底部（白底小标签，避开右上角读数与坐标轴文字）
      setFont(ctx, 7.5, 'bold')
      const lw2 = ctx.measureText(label).width
      const bx = clamp(X(ms) - lw2 / 2 - 3, px0 + 4, px0 + pw - lw2 - 6)
      ctx.fillStyle = 'rgba(255,255,255,0.94)'
      ctx.beginPath(); ctx.roundRect(bx, py0 + ph - 16, lw2 + 6, 12, 3); ctx.fill()
      ctx.fillStyle = col
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText(label, bx + 3, py0 + ph - 10)
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
    }
    markTau(tauNow, 'τ', 'rgba(18,166,155,0.55)', true)
    markTau(5 * tauNow, '5τ', 'rgba(147,165,173,0.6)', true)

    // 对比曲线（ghost）
    const ghostCols = ['rgba(226,163,60,0.85)', 'rgba(44,111,175,0.8)', 'rgba(94,140,120,0.8)']
    ghosts.forEach((gh, gi) => {
      const tauG = tauOf(gh.Rk, gh.Cmu)
      const col = ghostCols[gi % ghostCols.length]
      ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.setLineDash([6, 4])
      ctx.beginPath()
      for (let k = 0; k <= 60; k++) {
        const ms = (xMax * k) / 60
        const v = uOf(ms, tauG, gh.U, gh.mode)
        const yy = py0 + ph - (v / yMaxU) * ph
        if (k === 0) ctx.moveTo(X(ms), yy); else ctx.lineTo(X(ms), yy)
      }
      ctx.stroke(); ctx.setLineDash([])
    })

    // 当前曲线
    ctx.strokeStyle = isI ? C.neg : C.pos; ctx.lineWidth = 2.2
    ctx.beginPath()
    for (let k = 0; k <= 72; k++) {
      const ms = (xMax * k) / 72
      const v = isI ? iOf(ms, tauNow, info.U, info.Rk, info.mode) : uOf(ms, tauNow, info.U, info.mode)
      const yy = isI ? zeroY - (v / yMaxI) * (ph / 2) : py0 + ph - (v / yMaxU) * ph
      if (k === 0) ctx.moveTo(X(ms), yy); else ctx.lineTo(X(ms), yy)
    }
    ctx.stroke()

    // 游标：当前时刻
    if (info.tms > 0) {
      const cx = X(info.tms)
      ctx.strokeStyle = 'rgba(34,49,58,0.18)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(cx, py0); ctx.lineTo(cx, py0 + ph); ctx.stroke()
      const v = isI ? info.i : info.uc
      const yy = isI ? zeroY - (v / yMaxI) * (ph / 2) : py0 + ph - (v / yMaxU) * ph
      ctx.beginPath(); ctx.arc(cx, Math.max(py0, Math.min(py0 + ph, yy)), 4.5, 0, Math.PI * 2)
      ctx.fillStyle = isI ? C.neg : C.pos; ctx.fill()
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.stroke()
    }
    // 曲线读数（曲线端点处）
    const vNow = isI ? Math.abs(info.iShow) : info.uc
    setFont(ctx, 8.5, 'bold'); ctx.fillStyle = isI ? C.neg : C.pos
    ctx.textAlign = 'right'; ctx.textBaseline = 'top'
    ctx.fillText(isI ? `${vNow.toFixed(2)} mA` : `${vNow.toFixed(2)} V`, box.x + box.w - 14, box.y + 26)

    // U–t 图右下角图例：当前曲线 + 对比曲线
    if (!isI && s.step === 3) {
      const entries = [{ col: C.pos, label: `τ=${fmtT(tauNow)} 当前`, dash: false }]
      s.ghosts.forEach((gh, gi) => entries.push({ col: ghostCols[gi % ghostCols.length], label: `τ=${fmtT(tauOf(gh.Rk, gh.Cmu))}`, dash: true }))
      const lx = px0 + pw - 8
      setFont(ctx, 7.8, 'bold')
      entries.slice(0, 4).forEach((en, i) => {
        const ly = py0 + ph - 10 - i * 12
        const tw = ctx.measureText(en.label).width
        ctx.strokeStyle = en.col; ctx.lineWidth = 1.8
        if (en.dash) ctx.setLineDash([4, 3])
        ctx.beginPath(); ctx.moveTo(lx - tw - 16, ly); ctx.lineTo(lx - tw - 4, ly); ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = en.col; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
        ctx.fillText(en.label, lx, ly)
      })
      ctx.textAlign = 'right'
    }
    ctx.textBaseline = 'alphabetic'
  }

  // ── 右栏 ──
  function drawPanel(ctx, L, s, info) {
    const { panel } = L
    const x = panel.x, w = panel.w, y = panel.y, h = panel.h
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 10)
    ctx.fillStyle = C.card; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke()
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'

    let ky = y + 14
    setFont(ctx, 12, 'bold'); ctx.fillStyle = C.ink
    ctx.fillText(s.step === 3 ? '时间常数 τ = RC' : '电容电压 U_C', x + 14, ky)
    setFont(ctx, 9); ctx.fillStyle = C.faint
    ctx.fillText(s.step === 3 ? 'τ(ms)=R(kΩ)×C(μF)，改参数即改 τ' : '闭合开关后随时间变化', x + 14, ky + 17)

    ky += 40
    if (s.step === 3) {
      setFont(ctx, 22, 'bold'); ctx.fillStyle = C.tealDark
      ctx.fillText(fmtT(info.tau), x + 14, ky)
      setFont(ctx, 10, 'bold'); ctx.fillStyle = C.sub
      ctx.fillText(`= ${s.Rk} kΩ × ${s.Cmu} μF`, x + 14, ky + 30)
      ky += 56
    } else {
      setFont(ctx, 22, 'bold'); ctx.fillStyle = info.mode === 'charge' ? C.pos : C.neg
      ctx.fillText(`${info.uc.toFixed(2)}`, x + 14, ky)
      setFont(ctx, 11, 'bold'); ctx.fillStyle = C.sub
      ctx.fillText('V', x + 132, ky + 10)
      ky += 40
    }

    const rows = []
    rows.push(['时间 t', fmtT(info.tms)])
    rows.push(['电流 I', info.done
      ? (info.mode === 'charge' ? '≈0 mA（电容隔直流）' : '≈0 mA（电荷已中和）')
      : !s.closed
        ? '0.00 mA（开关断开）'
        : `${Math.abs(info.iShow).toFixed(2)} mA ${info.mode === 'charge' ? '顺时针' : '逆时针'}`])
    rows.push(['灯泡亮度', info.done ? '已熄灭' : `${Math.round(Math.pow(clamp(Math.abs(info.iShow) / Math.max(info.I0, 0.001), 0, 1), 1.15) * 100)}%`])
    rows.push(['极板电荷 Q', `${info.q.toFixed(0)} μC`])
    rows.push(['时间常数 τ', fmtT(info.tau)])
    rows.push(['5τ（99.3%）', fmtT(5 * info.tau)])
    rows.push(['储能 E=½CU²', info.E >= 1000 ? `${(info.E / 1000).toFixed(2)} mJ` : `${info.E.toFixed(0)} μJ`])
    rows.push(['I₀ = U₀/R', `${(info.U / info.Rk).toFixed(2)} mA`])
    for (const [k, v] of rows) {
      setFont(ctx, 9.5); ctx.fillStyle = C.sub
      ctx.fillText(k, x + 14, ky)
      setFont(ctx, 10, 'bold'); ctx.fillStyle = C.ink
      ctx.textAlign = 'right'; fitFont(ctx, v, w - 132, 10, 'bold')
      ctx.fillText(v, x + w - 14, ky)
      ctx.textAlign = 'left'
      ky += 17
    }

    // 结论条
    ky += 6
    ctx.strokeStyle = '#EDF2F5'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(x + 12, ky); ctx.lineTo(x + w - 12, ky); ctx.stroke()
    ky += 10
    const headline = s.step === 1
      ? (s.closed
        ? (info.done
          ? '已充满：I≈0，灯泡熄灭，电容对直流相当于开路，但电路仍闭合'
          : `充电中：I 从 ${(info.U / info.Rk).toFixed(1)} mA 衰减，灯泡逐渐变暗，U_C 上升`)
        : '开关未闭合，合闸后灯泡先最亮再变暗')
      : s.step === 2
        ? (s.closed
          ? (info.done ? '放电结束：极板电荷中和完毕，灯泡熄灭，I≈0，电路仍闭合' : '放电中：I 反向衰减，灯泡再次由亮变暗，U_C 下降')
          : '开关未闭合，合闸后灯泡先最亮再变暗')
        : `τ 越大曲线越缓：${fmtT(info.tau)} 内充到 63%`
    setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.tealDark
    fitFont(ctx, headline, w - 28, 9.5, 'bold')
    ctx.fillText(headline, x + 14, ky)

    // 说明卡
    const cardY = Math.min(ky + 26, y + h - 196)
    ctx.beginPath(); ctx.roundRect(x + 12, cardY, w - 24, 178, 8)
    ctx.fillStyle = '#F6FBF9'; ctx.fill()
    ctx.strokeStyle = '#DCEBE7'; ctx.lineWidth = 1; ctx.stroke()
    setFont(ctx, 10, 'bold'); ctx.fillStyle = C.tealDark
    const cardTitle = s.step === 1 ? '充电的三个特征' : s.step === 2 ? '放电的三个特征' : 'τ 的物理意义'
    ctx.fillText(cardTitle, x + 24, cardY + 12)
    const bullets = s.step === 1 ? [
      '• 合闸瞬间 I 最大 = U₀/R，灯泡最亮，U_C = 0',
      '• I 按 e^(−t/τ) 衰减，灯泡功率 P=I²R 随之骤减',
      '• 灯丝电阻随温度变化，本场景按恒定 R 处理',
      '• U_C 按 1−e^(−t/τ) 上升，1τ 到 63.2%，5τ 到 99.3%',
      '• 稳态 I≈0、灯泡熄灭，电容隔直流但电路仍闭合',
    ] : s.step === 2 ? [
      '• 拨到放电位后电源被断开，C 相当于电源',
      '• 电流方向与充电时相反（看箭头）',
      '• 灯泡同样先亮后暗，U_C 按 e^(−t/τ) 下降到 0',
      '• 时间常数仍是 τ = RC（R 即灯丝电阻）',
      '• 能量从电场放出：E = ½CU²',
    ] : [
      '• τ = RC，单位：Ω·F = s',
      '• 本场景口径：τ(ms) = R(kΩ)×C(μF)',
      '• τ 只由 R、C 决定，与 U₀ 无关',
      '• C 越大储能越多，充满越慢、灯泡亮得越久',
      '• 灯丝电阻 R 越大，电流越小、灯泡越暗、τ 越大',
    ]
    setFont(ctx, 9); ctx.fillStyle = C.sub
    bullets.forEach((t, i) => {
      fitFont(ctx, t, w - 52, 9)
      ctx.fillText(t, x + 24, cardY + 32 + i * 27)
    })
    ctx.textBaseline = 'alphabetic'
  }

  // ── 工具条 ──
  function drawToolbar(ctx, W, L, s, info) {
    const T = L.toolbar
    ctx.beginPath(); ctx.roundRect(T.x, T.y, T.w, T.h, 10)
    ctx.fillStyle = C.card; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke()
    const rowY = T.y + 22
    let bx = T.x + 20

    const sliderBlock = (label, valueTxt, ratio, name, onChange, accent) => {
      setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.ink
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText(label, bx, rowY - 12)
      setFont(ctx, 10, 'bold'); ctx.fillStyle = accent || C.tealDark
      ctx.textAlign = 'right'
      ctx.fillText(valueTxt, bx + 142, rowY - 12)
      ctx.textAlign = 'left'
      drawSlider(ctx, { x: bx, y: rowY + 8, w: 142, ratio, accent, name, onChange })
      bx += 166
    }

    sliderBlock('电源电压 U₀', `${s.U} V`, (s.U - 3) / 17, 'uSlider', (r) => {
      S.current.U = Math.round(3 + r * 17)
      S.current.t = 0
    }, C.pos)
    sliderBlock('电容 C', `${s.Cmu} μF`, (s.Cmu - 10) / 490, 'cSlider', (r) => {
      S.current.Cmu = Math.round(10 + r * 490)
      S.current.t = 0
    }, C.neg)
    sliderBlock('灯丝电阻 R', `${s.Rk} kΩ`, (s.Rk - 1) / 49, 'rSlider', (r) => {
      S.current.Rk = Math.round(1 + r * 49)
      S.current.t = 0
    }, C.gold)

    drawBtn(ctx, bx, rowY - 16, 74, 26, s.closed ? '⏸ 断开' : '▶ 闭合', s.closed ? 'plain' : 'primary', () => toggleSwitch(), 'switchBtn')
    bx += 82
    drawBtn(ctx, bx, rowY - 16, 66, 26, '↺ 重置', 'ghost', () => {
      const st = S.current
      st.t = 0; st.closed = false; st.ghosts = []
      st.U = 12; st.Cmu = 100; st.Rk = 10
      say('已恢复初始状态')
    }, 'resetBtn')
    bx += 74
    if (s.step === 3) {
      drawBtn(ctx, bx, rowY - 16, 84, 26, '＋存对比曲线', 'plain', () => {
        const st = S.current
        if (st.ghosts.length >= 3) st.ghosts.shift()
        st.ghosts.push({ Rk: st.Rk, Cmu: st.Cmu, U: st.U, mode: st.mode })
        st.t = 0
        say(`已保存 τ=${fmtT(tauOf(st.Rk, st.Cmu))} 的曲线`)
      }, 'ghostSave')
      bx += 92
      drawBtn(ctx, bx, rowY - 16, 66, 26, '清对比', 'ghost', () => { S.current.ghosts = []; }, 'ghostClear')
    }

    setFont(ctx, 8.5); ctx.fillStyle = C.faint
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    const hint = s.step === 1
      ? '充电：合闸瞬间灯泡最亮（I 最大），随 U_C 升高电流减小，灯泡渐暗；5τ 后 I≈0、灯彻底熄灭'
      : s.step === 2
        ? '放电：电源被断开，C 经灯泡（灯丝电阻）放电，电流方向反过来；灯泡再次先亮后暗，U_C 从 U₀ 指数降到 0'
        : 'τ = R×C：改 C 或灯丝电阻 R，曲线疏密与灯泡变暗的快慢同时变化；把不同 τ 存成对比曲线最直观'
    fitFont(ctx, `${hint}　（τ=${fmtT(info.tau)}，I₀=${(info.U / info.Rk).toFixed(1)} mA）`, T.w - 60, 8.5)
    ctx.fillText(`${hint}　（τ=${fmtT(info.tau)}，I₀=${(info.U / info.Rk).toFixed(1)} mA）`, T.x + 20, T.y + 54)
    ctx.textBaseline = 'alphabetic'
  }

  function drawSlider(ctx, { x, y, w, ratio, onChange, accent, name }) {
    const ac = accent || C.teal
    ctx.beginPath(); ctx.roundRect(x, y - 3, w, 6, 3); ctx.fillStyle = '#DCE4E8'; ctx.fill()
    ctx.beginPath(); ctx.roundRect(x, y - 3, Math.max(3, clamp(ratio, 0, 1) * w), 6, 3); ctx.fillStyle = ac; ctx.fill()
    const kx = x + clamp(ratio, 0, 1) * w
    ctx.beginPath(); ctx.arc(kx, y, 6.5, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = ac; ctx.lineWidth = 1.6; ctx.stroke()
    pushArea({ n: name || 'slider', x: x - 10, y: y - 14, w: w + 20, h: 28, drag: 'slider', setX: (mx) => onChange(clamp((mx - x) / w, 0, 1)) })
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
    ctx.textBaseline = 'alphabetic'
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
    ctx.textBaseline = 'alphabetic'
  }

  // ═════════════════════════════════════════════
  //  Tab2 自己动手：接线 → 识别回路 → 跑 RC
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
  const FIG_W = { battery: 100, resistor: 110, switch: 92, cell: 120, rheostat: 132 }
  const TERM = {
    battery: Math.round(FIG_W.battery / 2 * (87 / 175) * 10) / 10,     // 28.6
    resistor: Math.round(FIG_W.resistor / 2 * (175 / 256) * 10) / 10,  // 37.6
    switch: Math.round(FIG_W.switch / 2 * (168 / 226) * 10) / 10,      // 34.2
    capacitor: 26,
    // 干电池组实拍图 1024×288：黑柱 (105,157)、红柱 (924,157)
    cell: Math.round(FIG_W.cell / 2 * ((924 - 105) / 1024) * 10) / 10,       // 48.0
    // 滑动变阻器实拍图 448×186：左下柱 (24,150)、右下柱 (395,150)
    rheostat: Math.round(FIG_W.rheostat / 2 * ((395 - 24) / 448) * 10) / 10,  // 54.7
  }
  let DIYK = 1.5   // 器材绘制放大倍数（随画布尺寸自适应，接线柱距离同步放大）
  function termPos(comp, i) {
    const d = (TERM[comp.type] || 26) * DIYK
    return { x: comp.x + (i === 0 ? -d : d), y: comp.y }
  }

  // 滑动变阻器接入电阻（Ω）：总阻 × 滑片位置（两端口简化模型，串在回路里）
  const rheostatOhm = (c) => clamp((c.rt ?? 50), 0, 10000) * clamp((c.sp ?? 0.5), 0, 1)

  // 回路识别：端口图 + DFS 找 电源 0→1 的回路
  function analyseLoop(dy) {
    const nodes = new Set()
    const adj = new Map()
    const SRC = (t) => t === 'battery' || t === 'cell'
    const addEdge = (a, b, tag, meta) => {
      if (!adj.has(a)) adj.set(a, [])
      if (!adj.has(b)) adj.set(b, [])
      adj.get(a).push({ to: b, tag, meta })
      adj.get(b).push({ to: a, tag, meta })
      nodes.add(a); nodes.add(b)
    }
    for (const w of dy.wires) addEdge(`${w.from.compId}:${w.from.port}`, `${w.to.compId}:${w.to.port}`, 'wire', null)
    for (const c of dy.comps) {
      const open = c.type === 'switch' && !c.closed
      addEdge(`${c.id}:0`, `${c.id}:1`, 'comp', { comp: c, open })
    }
    const srcs = dy.comps.filter((c) => SRC(c.type))
    if (!srcs.length) return { ok: false, reason: '先放一个电源（蓄电池或干电池）' }
    const start = `${srcs[0].id}:0`, goal = `${srcs[0].id}:1`
    // DFS：起始电源自身不经内部边（避免一步闭合）；串联在同一回路里的其他电源要能穿过去
    let best = null
    const stack = [{ node: start, path: [], comps: new Set(), openSwitch: false }]
    const visited = new Set([start])
    while (stack.length) {
      const cur = stack.pop()
      if (cur.node === goal) {
        if (cur.path.length && (!best || cur.path.length < best.path.length)) {
          best = { path: cur.path, comps: cur.comps, openSwitch: cur.openSwitch }
        }
        continue
      }
      for (const e of adj.get(cur.node) || []) {
        if (e.tag === 'comp' && e.meta.comp.id === srcs[0].id) continue
        if (visited.has(e.to) && e.to !== goal) continue
        const comps = new Set(cur.comps)
        if (e.tag === 'comp') comps.add(e.meta.comp)
        stack.push({ node: e.to, path: [...cur.path, e], comps, openSwitch: cur.openSwitch || (e.tag === 'comp' && e.meta.open) })
        visited.add(e.to)
      }
    }
    if (!best) return { ok: false, reason: '回路没有闭合：用导线把电源、小灯泡、电容器接成环' }
    const caps = [...best.comps].filter((c) => c.type === 'capacitor')
    const res = [...best.comps].filter((c) => c.type === 'resistor')
    const rheos = [...best.comps].filter((c) => c.type === 'rheostat')

    if (!caps.length) return { ok: false, reason: '回路里还没有电容器' }
    if (!res.length) return { ok: false, reason: '回路里还没有小灯泡' }
    if (best.openSwitch) return { ok: false, reason: '开关是断开的：双击开关（或点面板按钮）闭合', needClose: true }
    // 串在回路里的电源电压相加（干电池组每盒 2 节 AA = 3 V），台上没接线的电源不计入
    const loopSrcs = [srcs[0], ...[...best.comps].filter((c) => SRC(c.type))]
    const U = loopSrcs.reduce((a, c) => a + (c.u ?? (c.type === 'cell' ? 3 : 12)), 0)
    const Rk = res.reduce((a, c) => a + (c.r || 10), 0) + rheos.reduce((a, c) => a + rheostatOhm(c) / 1000, 0)
    const Cmu = caps.reduce((a, c) => a + (c.c || 100), 0)
    return {
      ok: true, U, Cmu, Rk,
      Rheo: rheos.length ? rheos.reduce((a, c) => a + rheostatOhm(c), 0) : 0,
      tau: tauOf(Rk, Cmu),
      switchesClosed: true,
    }
  }

  function renderDiy(ctx, W, H) {
    const s = S.current, dy = s.diy
    const A = diyGeom(W, H)
    const res = analyseLoop(dy)
    if (res.ok) {
      const tau = res.tau
      if (dy.t * 1000 >= 5 * tau) dy.t = 5 * tau / 1000
    } else if (dy.t > 0 && !res.needClose) dy.t = 0

    setFont(ctx, 13, 'bold'); ctx.fillStyle = C.ink
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('自己动手 · 搭一个 RC 充放电电路', A.org.x + 4, 14)
    setFont(ctx, 10); ctx.fillStyle = C.sub
    ctx.fillText('点右侧器材再点画布落位；点两个接线柱连线；双击开关通断；右键删除。程序自动识别回路并跑真实 RC 曲线', A.org.x + 4, 33)

    ctx.save(); ctx.translate(A.org.x, A.org.y); ctx.scale(A.sc, A.sc)
    ctx.beginPath(); ctx.roundRect(0, 0, A.area.x1, A.area.y1, 10)
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#E7EEF2'; ctx.lineWidth = 1; ctx.stroke()
    ctx.fillStyle = 'rgba(140,165,175,0.2)'
    for (let x = 14; x < A.area.x1; x += 26) {
      for (let y = 14; y < A.area.y1; y += 26) { ctx.beginPath(); ctx.arc(x, y, 0.9, 0, Math.PI * 2); ctx.fill() }
    }

    // 导线（软弯）
    for (const w of dy.wires) {
      const c1 = dy.comps.find((c) => c.id === w.from.compId)
      const c2 = dy.comps.find((c) => c.id === w.to.compId)
      if (!c1 || !c2) continue
      const p1 = termPos(c1, w.from.port), p2 = termPos(c2, w.to.port)
      drawWireCurve(ctx, p1, p2, '#1E7F8E')
    }
    if (dy.connecting) {
      const c1 = dy.comps.find((c) => c.id === dy.connecting.compId)
      if (c1) {
        const p1 = termPos(c1, dy.connecting.port)
        ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = 'rgba(226,163,60,0.9)'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(dy.mx, dy.my); ctx.stroke(); ctx.restore()
      }
    }
    // 灯泡亮度：回路跑起来后按 e^(−t/τ) 衰减，并按电源电压高低再压一档
    const liveB = res.ok ? diyBright(dy.t * 1000, res.tau, res.U) : 0
    for (const c of dy.comps) drawDiyComp(ctx, c, dy.sel === c.id, liveB)

    if (!dy.comps.length) {
      setFont(ctx, 12); ctx.fillStyle = C.faint
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('点右侧「一键标准电路」可立刻得到 电源—开关—R—C 的充放电回路', A.area.x1 / 2, A.area.y1 / 2)
      ctx.textBaseline = 'alphabetic'
    }

    // 运行状态与读数
    drawDiyStatus(ctx, A, res, dy)
    ctx.restore()

    drawDiyPalette(ctx, A, W, H, s, dy)
    if (dy.hold) { drawDiyIcon(ctx, dy.mx || 0, dy.my || 0, dy.hold, 1.3) }
    drawToast(ctx, W, s)
    pushArea({ n: 'diyStage', x: A.org.x, y: A.org.y, w: A.area.x1 * A.sc, h: A.area.y1 * A.sc })
  }

  function drawWireCurve(ctx, p1, p2, col, dashed = false) {
    const dx = p2.x - p1.x, dy = p2.y - p1.y
    ctx.strokeStyle = col; ctx.lineWidth = 2.2
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    if (dashed) ctx.setLineDash([5, 4])
    const adx = Math.abs(dx), ady = Math.abs(dy)
    if (adx > 26 && ady > 26) {
      // 横平竖直的“搭线”走法：先横后竖，拐角做小圆角
      const mx = p1.x + dx * 0.5, r = Math.min(7, adx / 2, ady / 2)
      const sy = Math.sign(dy)
      ctx.beginPath()
      ctx.moveTo(p1.x, p1.y)
      ctx.lineTo(mx - r, p1.y)
      ctx.quadraticCurveTo(mx, p1.y, mx, p1.y + sy * r)
      ctx.lineTo(mx, p2.y - sy * r)
      ctx.quadraticCurveTo(mx, p2.y, mx + r, p2.y)
      ctx.lineTo(p2.x, p2.y)
      ctx.stroke()
    } else if (adx > 26 || ady > 26) {
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke()
    } else {
      // 短线才做“软导线”下垂，长线一律拉直
      const nlen = Math.hypot(dx, dy) || 1
      const sag = Math.min(9, nlen * 0.2)
      const nx = -dy / nlen, ny = dx / nlen
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y)
      ctx.quadraticCurveTo((p1.x + p2.x) / 2 + nx * sag, (p1.y + p2.y) / 2 + ny * sag, p2.x, p2.y)
      ctx.stroke()
    }
    ctx.setLineDash([]); ctx.lineCap = 'butt'; ctx.lineJoin = 'miter'
  }

  // ── 器材实拍图：与项目既有电学器材同一套（蓄电池 / 小灯泡 / 闸刀底座）──
  //    a、b 是实拍图里两个柱帽圆心的像素坐标，用来把柱帽对齐到引擎的端口 (±TERM, 0)
  const DIY_FIG = {
    battery: { file: 'accumulator_c.png', w: 175, h: 180, a: [45, 14], b: [132, 14] },
    resistor: { file: 'bulb_c.png', w: 256, h: 121, a: [38, 74], b: [213, 74] },
    switch: { file: 'switch_c.png', w: 226, h: 158, a: [32, 124], b: [200, 124] },
    // 干电池组（两节 AA 电池盒）：黑柱 105,157 / 红柱 924,157
    cell: { file: 'battery_c.png', w: 1024, h: 288, a: [105, 157], b: [924, 157] },
    // 滑动变阻器：左下 24,150 / 右下 395,150（两柱同高，与两端口模型对齐）
    rheostat: { file: 'rheostat_c2.png', w: 448, h: 186, a: [24, 150], b: [395, 150] },
  }
  const DIY_SPRITE = new Map()
  function diySprite(type) {
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
    const def = DIY_FIG[type]
    if (!def) return null
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
    if (!bx) return { x0: -34, x1: 34, y0: -26, y1: 28 }
    return { x0: Math.min(bx.x0, -bx.term), x1: Math.max(bx.x0 + bx.w, bx.term), y0: bx.y0, y1: bx.y0 + bx.h }
  }

  function drawDiyComp(ctx, comp, selected, live = 0) {
    const bx = figBox(comp.type)
    ctx.save(); ctx.translate(comp.x, comp.y); ctx.scale(DIYK, DIYK)
    if (selected) {
      const b = bx
        ? { x: bx.x0 - 4, y: bx.y0 - 4, w: bx.w + 8, h: bx.h + 14 }
        : { x: -33, y: -21, w: 66, h: 42 }
      ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 9)
      ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([])
    }

    if (comp.type === 'capacitor' || !bx) {
      // 平行板电容器：两块金属极板（实物造型，保留平板）
      ctx.strokeStyle = C.neg; ctx.lineWidth = 3.8
      ctx.beginPath(); ctx.moveTo(-6, -15); ctx.lineTo(-6, 15); ctx.stroke()
      ctx.strokeStyle = C.pos
      ctx.beginPath(); ctx.moveTo(6, -15); ctx.lineTo(6, 15); ctx.stroke()
      const lead = 6.4, td = TERM[comp.type] || 26
      ctx.strokeStyle = '#7E949C'; ctx.lineWidth = 1.8
      ctx.beginPath(); ctx.moveTo(-lead, 0); ctx.lineTo(-td, 0); ctx.moveTo(lead, 0); ctx.lineTo(td, 0); ctx.stroke()
      for (const sx of [-td, td]) {
        ctx.beginPath(); ctx.arc(sx, 0, 4.4, 0, Math.PI * 2)
        ctx.fillStyle = '#fff'; ctx.fill()
        ctx.strokeStyle = '#6E8790'; ctx.lineWidth = 1.6; ctx.stroke()
      }
      setFont(ctx, 9, 'bold'); ctx.fillStyle = C.ink
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText(`${comp.c || 100} μF`, 0, 17)
      ctx.restore()
      return
    }

    const sp = diySprite(comp.type)
    // 小灯泡：先在实物图下面铺一层暖光（透过玻璃泡）
    const glass = comp.type === 'resistor' ? figPt('resistor', 128, 40) : null
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
      // 灯丝发光（M 形折线，随亮度由暗到亮）
      const fw = 6.4 * bx.scale, fh = 3.4 * bx.scale
      ctx.translate(glass.x, glass.y)
      ctx.strokeStyle = `rgba(255,238,164,${0.92 * live})`
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(-fw, fh * 0.8); ctx.lineTo(-fw * 0.42, -fh); ctx.lineTo(0, fh); ctx.lineTo(fw * 0.42, -fh); ctx.lineTo(fw, fh * 0.8)
      ctx.stroke()
      ctx.restore()
    }

    if (comp.type === 'switch') {
      // 轴座 + 静触点夹片 + 刀（底座的柱帽由实拍图提供）
      const axX = -bx.term * 0.44, clipX = bx.term * 0.60
      const plateY = -2.2 * bx.scale / 0.874  // 与底座顶面齐平（按底板比例折算）
      // 静触点夹片（U 形，两片薄板 + 顶弧）
      const clipTop = plateY - 8.2, clipBot = plateY
      const cg = ctx.createLinearGradient(clipX - 4.6, 0, clipX + 4.6, 0)
      cg.addColorStop(0, '#7E9099'); cg.addColorStop(0.4, '#E7EEF1'); cg.addColorStop(0.62, '#B9C6CC'); cg.addColorStop(1, '#7A8C95')
      ctx.beginPath()
      ctx.moveTo(clipX - 4.2, clipBot)
      ctx.lineTo(clipX - 4.2, clipTop + 2.4)
      ctx.quadraticCurveTo(clipX - 4.2, clipTop, clipX - 1.8, clipTop)
      ctx.lineTo(clipX + 1.8, clipTop)
      ctx.quadraticCurveTo(clipX + 4.2, clipTop, clipX + 4.2, clipTop + 2.4)
      ctx.lineTo(clipX + 4.2, clipBot)
      ctx.lineTo(clipX + 2.0, clipBot)
      ctx.lineTo(clipX + 2.0, clipTop + 2.6)
      ctx.lineTo(clipX - 2.0, clipTop + 2.6)
      ctx.lineTo(clipX - 2.0, clipBot)
      ctx.closePath()
      ctx.fillStyle = cg; ctx.fill()
      ctx.strokeStyle = '#798B94'; ctx.lineWidth = 0.6; ctx.stroke()
      // 轴座（银色竖板 + 白色轴环 + 深色轴孔）
      ctx.beginPath(); ctx.roundRect(axX - 4.7, clipTop - 0.4, 9.4, -clipTop + 1.2, 3.2)
      const ag = ctx.createLinearGradient(axX - 4.7, 0, axX + 4.7, 0)
      ag.addColorStop(0, '#7E9099'); ag.addColorStop(0.34, '#D7E2E7'); ag.addColorStop(0.7, '#B4C2C9'); ag.addColorStop(1, '#778992')
      ctx.fillStyle = ag; ctx.fill()
      ctx.strokeStyle = '#6E828B'; ctx.lineWidth = 0.6; ctx.stroke()
      const ringY = clipTop + 4.2
      ctx.beginPath(); ctx.arc(axX, ringY, 3.1, 0, Math.PI * 2)
      const rg = ctx.createRadialGradient(axX - 1, ringY - 1.2, 0.6, axX, ringY, 3.1)
      rg.addColorStop(0, '#FFFFFF'); rg.addColorStop(0.72, '#D3DEE3'); rg.addColorStop(1, '#96A7AF')
      ctx.fillStyle = rg; ctx.fill()
      ctx.strokeStyle = '#6B7F88'; ctx.lineWidth = 0.8; ctx.stroke()
      ctx.beginPath(); ctx.arc(axX, ringY, 1.25, 0, Math.PI * 2)
      ctx.fillStyle = '#4E5D65'; ctx.fill()
      // 刀：合闸压向夹片，断开抬起 30°
      const L = clipX - 3.0 - axX
      const ang = comp.closed ? 0 : -40 * Math.PI / 180
      const tipX = axX + Math.cos(ang) * L, tipY = ringY + Math.sin(ang) * L
      const bx0 = axX + 2 * Math.cos(ang), by0 = ringY + 2 * Math.sin(ang)
      ctx.save()
      ctx.translate(bx0, by0); ctx.rotate(ang)
      ctx.beginPath(); ctx.roundRect(0, -2.3, L - 2, 4.6, 1.4)
      const kg = ctx.createLinearGradient(0, -2.3, 0, 2.3)
      kg.addColorStop(0, '#EDF2F4'); kg.addColorStop(0.3, '#C6D2D8'); kg.addColorStop(0.72, '#98A8B0'); kg.addColorStop(1, '#6F7E86')
      ctx.fillStyle = kg; ctx.fill()
      ctx.strokeStyle = '#67767E'; ctx.lineWidth = 0.55; ctx.stroke()
      ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 0.6
      ctx.beginPath(); ctx.moveTo(1.6, -1.5); ctx.lineTo(L - 3.4, -1.5); ctx.stroke()
      // 黑色绝缘柄（刀梢一段，断开时与参考图一致）
      ctx.beginPath(); ctx.roundRect(0.56 * L, -5.0, 0.38 * L, 10.0, 2.8)
      const hg = ctx.createLinearGradient(0, -5.0, 0, 5.0)
      hg.addColorStop(0, '#5A5F65'); hg.addColorStop(0.42, '#2A2D31'); hg.addColorStop(1, '#121416')
      ctx.fillStyle = hg; ctx.fill()
      ctx.strokeStyle = '#0D0F11'; ctx.lineWidth = 0.7; ctx.stroke()
      ctx.strokeStyle = 'rgba(255,255,255,0.24)'; ctx.lineWidth = 0.55
      ctx.beginPath(); ctx.moveTo(0.62 * L, -2.9); ctx.lineTo(0.90 * L, -2.9); ctx.stroke()
      ctx.restore()
      ctx.lineCap = 'butt'
    }

    // 滑动变阻器：实拍图只有滑杆与线圈，滑片用「黑色手轮 + 银色导杆」补出来
    if (comp.type === 'rheostat') {
      const sp = clamp(comp.sp ?? 0.5, 0, 1)
      const k = bx.scale
      const ix = 30 + (417 - 30) * sp
      const rod = figPt('rheostat', ix, 30)
      const coilTop = figPt('rheostat', ix, 56)
      // 银色导杆（从手轮下沿穿过滑杆，探到线圈顶面）
      const arm = ctx.createLinearGradient(rod.x - 5 * k, 0, rod.x + 5 * k, 0)
      arm.addColorStop(0, '#71828B'); arm.addColorStop(0.35, '#F0F5F8'); arm.addColorStop(0.75, '#B7C5CC'); arm.addColorStop(1, '#6C7D86')
      ctx.fillStyle = arm
      ctx.beginPath(); ctx.roundRect(rod.x - 5 * k, rod.y - 4 * k, 10 * k, (coilTop.y - rod.y) + 8 * k, 2 * k)
      ctx.fill()
      ctx.strokeStyle = '#5F7079'; ctx.lineWidth = 0.9 * k; ctx.stroke()
      // 黑色手轮（坐在滑杆上方，压住杆身）
      ctx.beginPath(); ctx.roundRect(rod.x - 12 * k, rod.y - 26 * k, 24 * k, 24 * k, 4 * k)
      const kn = ctx.createLinearGradient(rod.x - 12 * k, 0, rod.x + 12 * k, 0)
      kn.addColorStop(0, '#20252A'); kn.addColorStop(0.32, '#5A6067'); kn.addColorStop(0.6, '#33383E'); kn.addColorStop(1, '#15181B')
      ctx.fillStyle = kn; ctx.fill()
      ctx.strokeStyle = '#101316'; ctx.lineWidth = 1 * k; ctx.stroke()
      // 手轮上的罗纹（三道横纹）
      ctx.strokeStyle = 'rgba(255,255,255,0.26)'; ctx.lineWidth = 0.7 * k
      for (let j = 0; j < 3; j++) {
        const yy = rod.y - 21 * k + j * 6 * k
        ctx.beginPath(); ctx.moveTo(rod.x - 9.5 * k, yy); ctx.lineTo(rod.x + 9.5 * k, yy); ctx.stroke()
      }
    }

    // 标注（放在器材下方，避开柱帽与导线）
    const ly = bx.y0 + bx.h + (bx.term > 30 ? 17 : 3)
    setFont(ctx, 9, 'bold'); ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    if (comp.type === 'battery') {
      ctx.fillStyle = C.ink
      ctx.fillText(`${comp.u || 12} V`, 0, ly)
    } else if (comp.type === 'cell') {
      ctx.fillStyle = C.ink
      ctx.fillText(`干电池组 ${comp.u ?? 3} V`, 0, ly)
    } else if (comp.type === 'resistor') {
      ctx.fillStyle = C.ink
      ctx.fillText(`小灯泡 ${comp.r || 10} kΩ`, 0, ly)
    } else if (comp.type === 'rheostat') {
      const sp = Math.round(clamp(comp.sp ?? 0.5, 0, 1) * 100)
      ctx.fillStyle = C.ink
      ctx.fillText(`滑动变阻器 ${Math.round(rheostatOhm(comp))} Ω · 滑片 ${sp}%`, 0, ly)
    } else if (comp.type === 'switch') {
      ctx.fillStyle = comp.closed ? C.tealDark : C.faint
      ctx.fillText(comp.closed ? '闭合' : '断开', 0, ly + 1)
    }
    ctx.restore()
  }

  function drawDiyIcon(ctx, x, y, type) {
    drawDiyComp(ctx, { type, x, y, closed: false, u: 12, r: 10, c: 100 }, false)
  }

  function drawDiyStatus(ctx, A, res, dy) {
    const w = 236, h = 104
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
      ctx.fillText('提示：电源、小灯泡、电容器要串成一个环，开关串在环里', x + 10, y + 62)
      return
    }
    const tau = res.tau
    const tms = dy.t * 1000
    const uc = uOf(tms, tau, res.U, 'charge')
    const ii = iOf(tms, tau, res.U, res.Rk, 'charge')
    setFont(ctx, 9, 'bold'); ctx.fillStyle = C.tealDark
    ctx.fillText(`回路已识别：U=${res.U}V  R=${res.Rk.toFixed(2)}kΩ  C=${res.Cmu}μF`, x + 10, y + 8)
    setFont(ctx, 13, 'bold'); ctx.fillStyle = C.pos
    ctx.fillText(`${uc.toFixed(2)} V`, x + 10, y + 22)
    setFont(ctx, 9); ctx.fillStyle = C.sub
    ctx.fillText(`U_C`, x + 74, y + 28)
    ctx.fillText(`τ = ${fmtT(tau)}`, x + 118, y + 28)
    setFont(ctx, 8.5); ctx.fillStyle = C.sub
    ctx.fillText(tms >= 5 * tau - 0.5
      ? `已充满 I≈0　　Q = ${(res.Cmu * uc).toFixed(0)} μC`
      : `I = ${Math.abs(ii).toFixed(2)} mA　　Q = ${(res.Cmu * uc).toFixed(0)} μC`, x + 10, y + 46)
    ctx.fillText(`t = ${fmtT(tms)}　（${(tms / tau).toFixed(1)}τ）`, x + 10, y + 60)
    const lv = diyBright(tms, tau, res.U)
    ctx.textAlign = 'right'
    ctx.fillStyle = tms >= 5 * tau - 0.5 ? C.faint : (lv > 0.3 ? '#C4801A' : '#A9793B')
    ctx.fillText(tms >= 5 * tau - 0.5 ? '灯丝已熄灭' : `灯丝亮度 ${Math.round(lv * 100)}%`, x + w - 10, y + 60)
    ctx.textAlign = 'left'
    // 迷你 U–t
    const gx = x + 10, gy = y + 74, gw = w - 20, gh = 22
    ctx.strokeStyle = '#DCE8EC'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(gx, gy + gh); ctx.lineTo(gx + gw, gy + gh); ctx.stroke()
    ctx.strokeStyle = C.pos; ctx.lineWidth = 1.8
    ctx.beginPath()
    const xMax = 5 * tau
    for (let k = 0; k <= 40; k++) {
      const ms = (xMax * k) / 40
      const px = gx + (gw * k) / 40, py = gy + gh - (uOf(ms, tau, res.U, 'charge') / Math.max(res.U, 0.01)) * gh
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.stroke()
    if (tms > 0) {
      const px = gx + (gw * Math.min(tms / xMax, 1))
      const py = gy + gh - (uc / Math.max(res.U, 0.01)) * gh
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
      { type: 'cell', name: '干电池组', sub: '2 节 AA，3 V（可串联）' },
      { type: 'switch', name: '开关', sub: '双击通断' },
      { type: 'resistor', name: '小灯泡', sub: '灯丝 10 kΩ，可调' },
      { type: 'rheostat', name: '滑动变阻器', sub: '总阻 50 Ω，滑片可调' },
      { type: 'capacitor', name: '电容器 C', sub: '100 μF，可调' },
    ]
    items.forEach((it, i) => {
      const cy = y + 34 + i * 47
      const hot = dy.hold === it.type
      ctx.beginPath(); ctx.roundRect(x + 8, cy, w - 16, 42, 8)
      ctx.fillStyle = '#FFFFFF'; ctx.fill()
      ctx.strokeStyle = hot ? C.teal : '#E1E8EB'; ctx.lineWidth = hot ? 2 : 1; ctx.stroke()
      drawGlyph(ctx, x + 30, cy + 21, it.type)
      setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.ink
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText(it.name, x + 54, cy + 14)
      setFont(ctx, 7.8); ctx.fillStyle = C.faint
      ctx.fillText(it.sub, x + 54, cy + 28)
      pushArea({ n: `diyPart:${it.type}`, x: x + 8, y: cy, w: w - 16, h: 42, holdType: it.type, cursor: 'pointer' })
    })

    let ky = y + 34 + items.length * 47 + 2
    setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.sub
    ctx.fillText('快捷', x + 12, ky)
    ky += 16
    drawBtn(ctx, x + 8, ky, w - 16, 26, '一键标准电路', 'primary', () => buildStandard(A), 'diyStandard')
    ky += 32
    drawBtn(ctx, x + 8, ky, w - 16, 26, '清空场地', 'ghost', () => {
      const st = S.current
      st.diy.comps = []; st.diy.wires = []; st.diy.sel = null; st.diy.t = 0
      say('场地已清空')
    }, 'diyClear')
    ky += 34

    // 选中器材参数
    const sel = dy.comps.find((c) => c.id === dy.sel)
    ctx.strokeStyle = '#EDF2F5'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(x + 10, ky); ctx.lineTo(x + w - 10, ky); ctx.stroke()
    ky += 10
    if (sel) {
      setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.ink
      fitFont(ctx, '选中器材参数', w - 24, 9.5)
      ctx.fillText('选中器材参数', x + 12, ky)
      ky += 16
      const cfg = sel.type === 'battery'
        ? { label: '电压 U', val: sel.u || 12, unit: 'V', min: 3, max: 20, set: (v) => { sel.u = v } }
        : sel.type === 'resistor'
          ? { label: '灯丝电阻 R', val: sel.r || 10, unit: 'kΩ', min: 1, max: 50, set: (v) => { sel.r = v } }
          : sel.type === 'capacitor'
            ? { label: '电容 C', val: sel.c || 100, unit: 'μF', min: 10, max: 500, set: (v) => { sel.c = v } }
            : null
      if (cfg) {
        setFont(ctx, 9); ctx.fillStyle = C.sub
        ctx.fillText(cfg.label, x + 12, ky)
        ctx.textAlign = 'right'; ctx.fillStyle = C.tealDark
        ctx.fillText(`${cfg.val} ${cfg.unit}`, x + w - 12, ky)
        ctx.textAlign = 'left'
        ky += 12
        drawSlider(ctx, {
          x: x + 12, y: ky + 8, w: w - 24, ratio: (cfg.val - cfg.min) / (cfg.max - cfg.min),
          name: 'diyParam', onChange: (r) => {
            cfg.set(Math.round(cfg.min + r * (cfg.max - cfg.min)))
            S.current.diy.t = 0
          },
        })
        ky += 30
      }
      if (sel.type === 'rheostat') {
        const sp = clamp(sel.sp ?? 0.5, 0, 1)
        setFont(ctx, 9); ctx.fillStyle = C.sub
        ctx.fillText('滑片位置（总阻 50 Ω）', x + 12, ky)
        ctx.textAlign = 'right'; ctx.fillStyle = C.tealDark
        ctx.fillText(`接入 ${Math.round(rheostatOhm(sel))} Ω`, x + w - 12, ky)
        ctx.textAlign = 'left'
        ky += 12
        drawSlider(ctx, {
          x: x + 12, y: ky + 8, w: w - 24, ratio: sp,
          name: 'diyParam', onChange: (r) => { sel.sp = r; S.current.diy.t = 0 },
        })
        ky += 28
        setFont(ctx, 8); ctx.fillStyle = C.faint
        fitFont(ctx, '变阻器串在回路里起限流作用，对 τ 影响很小', w - 24, 8)
        ctx.fillText('变阻器串在回路里起限流作用，对 τ 影响很小', x + 12, ky)
        ky += 14
      }
      if (sel.type === 'cell') {
        setFont(ctx, 9); ctx.fillStyle = C.sub
        ctx.fillText('干电池组：2 节 AA 串联 = 3 V', x + 12, ky)
        ky += 14
        setFont(ctx, 8); ctx.fillStyle = C.faint
        fitFont(ctx, '多放几盒用导线串起来，电压相加', w - 24, 8)
        ctx.fillText('多放几盒用导线串起来，电压相加', x + 12, ky)
        ky += 14
      }
      if (sel.type === 'switch') {
        drawBtn(ctx, x + 8, ky, w - 16, 26, sel.closed ? '断开开关' : '闭合开关', 'plain', () => {
          sel.closed = !sel.closed
          S.current.diy.t = 0
        }, 'diySwitch')
        ky += 32
      }
    } else {
      setFont(ctx, 9); ctx.fillStyle = C.faint
      ctx.textAlign = 'left'
      fitFont(ctx, '单击画布中的器材可改参数', w - 24, 9)
      ctx.fillText('单击画布中的器材可改参数', x + 12, ky)
      ky += 18
    }

    // 提示（贴着参数区下沿，避免与滑条挤在一起）
    const tipY = Math.max(ky + 10, y + h - 128 - 10)
    ctx.beginPath(); ctx.roundRect(x + 8, tipY, w - 16, 128, 8)
    ctx.fillStyle = '#F6FBF9'; ctx.fill()
    ctx.strokeStyle = '#DCEBE7'; ctx.lineWidth = 1; ctx.stroke()
    setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.tealDark
    ctx.textAlign = 'left'
    ctx.fillText('这样做', x + 18, tipY + 9)
    const tips = [
      '① 点器材 → 再点画布落位',
      '② 点两个接线柱 → 连一根线',
      '③ 双击开关 / 面板按钮 → 通断',
      '④ 右键器材 → 删除',
      '⑤ 回路接通后自动跑 RC 曲线',
    ]
    setFont(ctx, 8.5); ctx.fillStyle = C.sub
    tips.forEach((t, i) => {
      fitFont(ctx, t, w - 40, 8.5)
      ctx.fillText(t, x + 18, tipY + 28 + i * 19)
    })
  }

  function drawGlyph(ctx, x, y, type) {
    ctx.save(); ctx.translate(x, y)
    if (type === 'capacitor') {
      ctx.strokeStyle = C.pos; ctx.lineWidth = 2.4
      ctx.beginPath(); ctx.moveTo(-3, -9); ctx.lineTo(-3, 9); ctx.stroke()
      ctx.strokeStyle = C.neg
      ctx.beginPath(); ctx.moveTo(3, -9); ctx.lineTo(3, 9); ctx.stroke()
      ctx.restore()
      return
    }
    // 器材区图标直接用同一套实拍图（等比缩进小框）
    const sp = diySprite(type), bx = figBox(type)
    if (!sp || !bx) {
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
    // 标准矩形回路：上沿 开关—电阻，下沿 电源—电容，左右两侧竖直导线
    const mk = (type, x, y, extra) => ({ id: S.current.nextId++, type, x, y, closed: false, ...extra })
    // 接线柱偏移随 DIYK 变化（值取自 TERM，与器材实拍图的柱帽严格重合）
    const DB = TERM.battery * DIYK, DS = TERM.switch * DIYK, DC = TERM.capacitor * DIYK, DR = TERM.resistor * DIYK
    const XL = A.area.x1 * 0.18 + 40, XR = A.area.x1 * 0.82 - 40
    const yT = A.area.y1 * 0.20, yB = A.area.y1 * 0.64
    const sw = mk('switch', XL + DS, yT, {})
    const bat = mk('battery', XL + DB, yB, { u: 12 })
    const rs = mk('resistor', XR - DR, yT, { r: 10 })
    const cap = mk('capacitor', XR - DC, yB, { c: 100 })
    dy.comps = [bat, sw, rs, cap]
    // 沿矩形四边连线：左边（开关0—电源0）· 上边（开关1—电阻0）· 右边（电阻1—电容1）· 下边（电容0—电源1）
    dy.wires = [
      { id: 1, from: { compId: sw.id, port: 0 }, to: { compId: bat.id, port: 0 } },
      { id: 2, from: { compId: sw.id, port: 1 }, to: { compId: rs.id, port: 0 } },
      { id: 3, from: { compId: rs.id, port: 1 }, to: { compId: cap.id, port: 1 } },
      { id: 4, from: { compId: cap.id, port: 0 }, to: { compId: bat.id, port: 1 } },
    ]
    dy.sel = sw.id
    dy.t = 0
    say('已搭好标准回路：电源—开关—R—C，双击开关即可充电')
  }

  // ═════════════════════════════════════════════
  //  交互
  // ═════════════════════════════════════════════
  function getPos(e) { return eventToCanvas(canvasRef.current, e) }
  const hit = (a, x, y) => x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h

  function handleMouseDown(e) {
    if (e.button !== 0) return
    const s = S.current
    const { x, y } = getPos(e)
    const areas = canvasRef.current._clickAreas || []

    if (s.tab === 1) {
      for (const a of areas) {
        if (!hit(a, x, y)) continue
        if (a.drag === 'slider') { s.dragSlider = a; a.setX(x); return }
        if (a.onClick) { a.onClick(); return }
      }
      return
    }

    const dy = s.diy
    for (const a of areas) {
      if (!hit(a, x, y)) continue
      if (a.holdType) { dy.hold = a.holdType; dy.mx = x; dy.my = y; return }
      if (a.drag === 'slider') { s.dragSlider = a; a.setX(x); return }
      if (a.onClick) { a.onClick(); return }
    }
    const A = diyGeom(canvasRef.current._R.W, canvasRef.current._R.H)
    const Pt = { x: (x - A.org.x) / A.sc, y: (y - A.org.y) / A.sc }
    if (dy.hold) {
      const t = dy.hold
      const c = {
        id: s.nextId++, type: t, x: Pt.x, y: Pt.y, closed: false,
        u: t === 'cell' ? 3 : 12, r: 10, c: 100, rt: 50, sp: 0.5,
      }
      dy.comps.push(c)
      dy.sel = c.id
      dy.hold = null
      dy.t = 0
      const NAMES = { battery: '电源', switch: '开关', resistor: '小灯泡', capacitor: '电容器', cell: '干电池组', rheostat: '滑动变阻器' }
      say(`已放入${NAMES[t] || '器材'}`)
      return
    }
    // 点接线柱 → 连线
    for (const c of [...dy.comps].reverse()) {
      for (let i = 0; i < 2; i++) {
        const t = termPos(c, i)
        if (Math.hypot(Pt.x - t.x, Pt.y - t.y) < 16 * DIYK / 1.5) {
          if (dy.connecting) {
            if (!(dy.connecting.compId === c.id && dy.connecting.port === i)) {
              dy.wires.push({ id: dy.wires.length + 1, from: { compId: dy.connecting.compId, port: dy.connecting.port }, to: { compId: c.id, port: i } })
              dy.t = 0
            }
            dy.connecting = null
          } else {
            dy.connecting = { compId: c.id, port: i }
          }
          return
        }
      }
    }
    const pk = DIYK / 1.5
    const picked = [...dy.comps].reverse().find((c) => {
      const e = compExtent(c.type)
      const pad = 6 * pk
      return Pt.x > c.x + e.x0 - pad && Pt.x < c.x + e.x1 + pad && Pt.y > c.y + e.y0 - pad && Pt.y < c.y + e.y1 + pad
    })
    if (picked) {
      dy.sel = picked.id
      dy.drag = 'comp'
      s.dragOff = { x: Pt.x - picked.x, y: Pt.y - picked.y }
      return
    }
    dy.sel = null
    dy.connecting = null
  }

  function handleMouseMove(e) {
    const s = S.current
    const { x, y } = getPos(e)
    if (s.tab === 1) {
      if (s.dragSlider) s.dragSlider.setX(x)
      return
    }
    const dy = s.diy
    const R = canvasRef.current._R
    if (!R) return
    const A = diyGeom(R.W, R.H)
    const Pt = { x: (x - A.org.x) / A.sc, y: (y - A.org.y) / A.sc }
    if (dy.hold) { dy.mx = x; dy.my = y; return }
    if (dy.connecting) { dy.mx = Pt.x; dy.my = Pt.y }
    if (dy.drag === 'comp') {
      const c = dy.comps.find((cc) => cc.id === dy.sel)
      if (c) {
        const e = compExtent(c.type)
        c.x = clamp(Pt.x - (s.dragOff?.x || 0), 12 - e.x0, A.area.x1 - 12 - e.x1)
        c.y = clamp(Pt.y - (s.dragOff?.y || 0), 8 - e.y0, A.area.y1 - 8 - e.y1)
      }
      return
    }
    if (s.dragSlider) s.dragSlider.setX(x)
  }

  function handleMouseUp() {
    const s = S.current
    s.dragSlider = null
    s.diy.drag = null
  }

  function handleDoubleClick(e) {
    const s = S.current
    if (s.tab !== 2) return
    const { x, y } = getPos(e)
    const R = canvasRef.current._R
    const A = diyGeom(R.W, R.H)
    const Pt = { x: (x - A.org.x) / A.sc, y: (y - A.org.y) / A.sc }
    const c = s.diy.comps.find((cc) => {
      if (cc.type !== 'switch') return false
      const e = compExtent(cc.type)
      return Pt.x > cc.x + e.x0 - 6 && Pt.x < cc.x + e.x1 + 6 && Pt.y > cc.y + e.y0 - 6 && Pt.y < cc.y + e.y1 + 6
    })
    if (c) { c.closed = !c.closed; s.diy.t = 0; say(c.closed ? '开关闭合' : '开关断开') }
  }

  function handleContextMenu(e) {
    e.preventDefault()
    const s = S.current
    if (s.tab !== 2) return
    const { x, y } = getPos(e)
    const R = canvasRef.current._R
    const A = diyGeom(R.W, R.H)
    const Pt = { x: (x - A.org.x) / A.sc, y: (y - A.org.y) / A.sc }
    const idx = s.diy.comps.findIndex((c) => {
      const e = compExtent(c.type)
      return Pt.x > c.x + e.x0 - 6 && Pt.x < c.x + e.x1 + 6 && Pt.y > c.y + e.y0 - 6 && Pt.y < c.y + e.y1 + 6
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
      title="电容器充放电"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t); forceUpdate((n) => n + 1) }}
      tab1Label="📊 实验演示"
      tab2Label="🔧 自己动手"
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} />
    </SceneShell>
  )
}
