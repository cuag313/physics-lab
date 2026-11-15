import { useState, useRef, useEffect, useCallback } from 'react'
import { eventToCanvas } from '../utils/pointerPos'
import SceneShell from '../ui/SceneShell'
import InfoDock from '../ui/InfoDock'
import BuilderPalette from '../ui/BuilderPalette'
import { fitLayout } from '../ui/canvasLayout'
import { drawKnowledgeCard } from '../ui/knowledgeCard'
import BuilderSVG from '../simple3d/BuilderSVG.jsx'
import { TYPES } from './electricSvgInstruments.js'
import { CFG } from '../engine/electricLab.js'
import { symBattery, symSwitch, symRheostat, symMeter, symHalf, SYM_INK } from '../render/symbols.js'

/**
 * JouleLawScene — 探究焦耳定律 Q = I²Rt（第 6 个按「简单电路」模板改造的电学实验）
 *
 *   Tab1 📖 电路演示 —— 暖色底 + 标准符号回路：
 *                        上边 滑变（左）+ 电流表（右）串联
 *                        下边 电源 → 煤油瓶 R₁=5Ω → 煤油瓶 R₂=10Ω → 开关
 *                        两瓶串联 ⇒ 电流相同 ⇒ 升温快慢只由 R 决定（Q = I²Rt，转换法看温度计）
 *                        点/拖滑片改变电流、点开关通断、点「记录一组数据」攒 4 组
 *   Tab2 🔧 自己动手 —— 与简单电路同一套 1:1 SVG 器材（9 件器材栏 + 三色导线）+
 *                        一键透视内部结构 + 实验记录表（都在 BuilderSVG 里）
 */

/** 器材栏缩略图：与桌面器材同源 */
function thumb(type) {
  const t = TYPES[type]
  if (!t) return null
  const svg = t.render(
    { id: `pal-${type}`, closed: true, showRead: false, f: 0.4 },
    { bright: 0.55, frac: 0.35, I: 0, f: 0.4, rays: false }
  )
  return <span dangerouslySetInnerHTML={{ __html: svg }} />
}

const RHEO_MAX = 20       // 20Ω 2A 滑动变阻器
const R1H = 5.0           // 煤油瓶 ① 里的电阻丝
const R2H = 10.0          // 煤油瓶 ② 里的电阻丝
const T0 = 20.0           // 初始温度 ℃
const TMAX = 95.0         // 显示上限（再高就沸腾了，实验不做到那一步）
const CV = 0.15           // 虚拟热容 J/℃：两瓶等质量煤油等比热 ⇒ ΔT ∝ Q
const QCAP = (TMAX - T0) * CV
const MAX_REC = 4

export default function JouleLawScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const builderRef = useRef(null)

  const S = useRef({
    tab: 1,
    switchClosed: false,
    time: 0,                // 动画时间（电子流动）
    tOn: 0,                 // 累计通电时间 s
    ratio: 1,               // 滑片位置：1 = 阻值最大（右端）
    q1: 0, q2: 0,           // 两瓶已产生的热量 J
    records: [],            // [{ t, i, t1, t2, q1, q2 }]
    wireColor: '#F44336',
    dragging: false,
    cardScroll: 0,
    cardDrag: null,
  })

  const [tab, setTab] = useState(1)
  const [, forceUpdate] = useState(0)

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
    R.resize(); canvasRef.current._R = R
    const loop = () => {
      const s = S.current
      s.time += 1 / 60
      if (s.switchClosed) {
        // 闭合期间热量随时间累积：P = I²R，Q = P·t
        const Rr = s.ratio * RHEO_MAX
        const I = CFG.VS.V / (R1H + R2H + Rr + CFG.AMM_R)
        s.tOn += 1 / 60
        s.q1 = Math.min(QCAP, s.q1 + (I * I * R1H) / 60)
        s.q2 = Math.min(QCAP, s.q2 + (I * I * R2H) / 60)
      }
      render(R)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  /** 物理：两瓶 + 滑变 + 电流表内阻串联；两瓶电流相同 */
  function solve() {
    const s = S.current
    const Rr = Math.round(s.ratio * RHEO_MAX * 10) / 10
    const I = s.switchClosed ? CFG.VS.V / (R1H + R2H + Rr + CFG.AMM_R) : 0
    const P1 = I * I * R1H, P2 = I * I * R2H
    const T1 = T0 + s.q1 / CV, T2 = T0 + s.q2 / CV
    return { Rr, I, P1, P2, T1, T2 }
  }

  function render(R) {
    const ctx = R.ctx, W = R.W, H = R.H
    ctx.clearRect(0, 0, W, H)
    const bg = ctx.createLinearGradient(0, 0, W * 0.35, H)
    bg.addColorStop(0, '#FFFCF5'); bg.addColorStop(0.55, '#FDF4E6'); bg.addColorStop(1, '#FBEDD9')
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
    canvasRef.current._clickAreas = []
    if (S.current.tab === 1) renderDemo(ctx, W, H)
  }

  // ================================================================
  //  Tab 1：电路演示
  // ================================================================
  function renderDemo(ctx, W, H) {
    const s = S.current
    const on = s.switchClosed
    const sol = solve()
    const layBase = fitLayout(W, H)
    /* 「半紧凑」：宽而矮的窗口（如 1280×640）仍保留右侧知识卡，只把电路压扁 */
    const lay = (layBase.compact && W >= 900 && H >= 400)
      ? {
        compact: false,
        circuit: { L: W * 0.04, R: W * 0.52, T: 48, B: H - 40 },
        readout: layBase.readout,
        guide: null,
        font: { title: 15, label: 10, body: 12, data: 12 },
      }
      : layBase

    const RAIL = 46
    let panel
    if (!lay.compact) {
      const pw = Math.max(360, Math.min(W * (H < 820 ? 0.52 : 0.40), 780))
      panel = { x: W - 16 - RAIL - pw, y: 10, w: pw, h: H - 20 }
      lay.circuit.R = Math.min(lay.circuit.R, panel.x - 20)
    } else {
      const pw = Math.max(196, Math.min(W * 0.3, 330))
      panel = { x: W - 14 - RAIL - pw, y: 12, w: pw, h: 108 }
      lay.circuit.R = Math.min(lay.circuit.R, panel.x - 14)
    }

    const left = lay.circuit.L, right = lay.circuit.R
    const top = lay.circuit.T, bottom = lay.circuit.B - (lay.compact ? 0 : 36)
    const areaW = right - left, areaH = bottom - top

    const scaleOf = (w) => Math.max(0.55, Math.min(1.1, w / 420))
    let loopW = Math.min(areaW * 0.74, 540)
    const fits = (w) => {
      const sc = scaleOf(w)
      return w * 0.52 + 62 * sc + 150 * sc + 8 <= areaH
    }
    if (!fits(loopW)) {
      let lo = 180, hi = loopW
      for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m }
      loopW = lo
    }
    const chipUp = 62 * scaleOf(loopW), chipDn = 150 * scaleOf(loopW)
    const scale = scaleOf(loopW)
    const loopH = loopW * 0.52
    const x0 = left + (areaW - loopW) / 2
    const y0 = top + Math.max(chipUp + 4, (areaH - (loopH + chipUp + chipDn)) / 2) + chipUp
    const x1 = x0 + loopW, y1 = y0 + loopH
    const midX = x0 + loopW / 2, midY = y0 + loopH / 2

    // 上边：滑变（左）、电流表（右）；下边：电源、煤油瓶①②、开关
    const rheoX = x0 + loopW * 0.26
    const amX = x0 + loopW * 0.74
    const battX = x0 + loopW * 0.14
    const b1X = x0 + loopW * 0.40
    const b2X = x0 + loopW * 0.64
    const swX = x0 + loopW * 0.86
    const gap = 15 * scale          // 瓶底两根引线的半间距（导线在此让位）

    const wc = on ? '#1565C0' : '#9aa7b1'
    const ink = on ? SYM_INK : '#7c8a93'
    const lw = 2 * scale + 0.6

    const hRheo = symHalf('rheostat', scale)
    const hMeter = symHalf('meter', scale)
    const hBat = symHalf('battery', scale, 2)
    const hSw = symHalf('switch', scale)

    // ─── 导线（瓶处在 y1 上让位给两根引线）───
    drawLine(ctx, x0, y0, rheoX - hRheo, y0, wc, lw)
    drawLine(ctx, rheoX + hRheo, y0, amX - hMeter, y0, wc, lw)
    drawLine(ctx, amX + hMeter, y0, x1, y0, wc, lw)
    drawLine(ctx, x1, y0, x1, y1, wc, lw)
    drawLine(ctx, x0, y0, x0, y1, wc, lw)
    drawLine(ctx, x0, y1, battX - hBat, y1, wc, lw)
    drawLine(ctx, battX + hBat, y1, b1X - gap, y1, wc, lw)
    drawLine(ctx, b1X + gap, y1, b2X - gap, y1, wc, lw)
    drawLine(ctx, b2X + gap, y1, swX - hSw, y1, wc, lw)
    drawLine(ctx, swX + hSw, y1, x1, y1, wc, lw)

    // ─── 符号 ───
    const geo = symRheostat(ctx, rheoX, y0, { scale, ratio: s.ratio, ink })
    symMeter(ctx, amX, y0, { kind: 'A', scale, ink })
    symBattery(ctx, battX, y1, { n: 2, scale, ink, flip: true })
    symSwitch(ctx, swX, y1, { closed: on, scale, ink })

    // ─── 两个煤油瓶 ───
    drawBottle(ctx, b1X, y1, { scale, Rw: R1H, temp: sol.T1, q: s.q1, on, time: s.time, wc })
    drawBottle(ctx, b2X, y1, { scale, Rw: R2H, temp: sol.T2, q: s.q2, on, time: s.time, wc })

    // 电子流动（滑变内部走「左端 → 线圈 → 箭头杆 → 横线 → 右端」；瓶处沿引线贴底绕过）
    if (on) {
      const path = [
        { x: battX + hBat, y: y1 },
        { x: b1X - gap, y: y1 }, { x: b1X - gap, y: y1 - 8 * scale },
        { x: b1X + gap, y: y1 - 8 * scale }, { x: b1X + gap, y: y1 },
        { x: b2X - gap, y: y1 }, { x: b2X - gap, y: y1 - 8 * scale },
        { x: b2X + gap, y: y1 - 8 * scale }, { x: b2X + gap, y: y1 },
        { x: swX + hSw, y: y1 },
        { x: x1, y: y1 }, { x: x1, y: y0 },
        { x: amX + hMeter, y: y0 }, { x: amX - hMeter, y: y0 },
        { x: rheoX + geo.half, y: y0 },
        { x: rheoX + geo.W / 2, y: y0 }, { x: rheoX + geo.W / 2, y: geo.topY },
        { x: geo.ax, y: geo.topY },
        { x: geo.ax, y: y0 },
        { x: rheoX - geo.W / 2, y: y0 }, { x: rheoX - geo.half, y: y0 },
        { x: x0, y: y0 }, { x: x0, y: y1 },
        { x: battX - hBat, y: y1 },
      ]
      drawCurrentFlow(ctx, path, s.time, 0.5)
    }

    // 开关可点
    canvasRef.current._clickAreas.push({
      x: swX - hSw - 12, y: y1 - 22, w: (hSw + 12) * 2, h: 44,
      onClick: () => { S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1) },
    })
    // 滑片连续可调（不做档位吸附，滑片跟手走）
    const travel = Math.max(6 * scale, geo.W / 2 - 7 * scale)
    const sliderArea = { x: rheoX - travel, y: y0 - 26 * scale, w: travel * 2, h: 44 * scale }
    const slideTo = (mx) => {
      S.current.ratio = Math.max(0, Math.min(1, (mx - (rheoX - travel)) / (travel * 2)))
      forceUpdate(n => n + 1)
    }
    canvasRef.current._clickAreas.push({ ...sliderArea, onClick: slideTo, onDrag: slideTo })
    canvasRef.current._sliderArea = sliderArea

    // 记录按钮（回路下方）
    const recW = 176 * scale, recH = 32 * scale
    const recX = midX - recW / 2, recY = y1 + 58 * scale
    const recount = s.records.length
    const recActive = on && recount < MAX_REC
    ctx.save()
    ctx.fillStyle = recActive ? '#FFF3E0' : '#F5F0E8'
    ctx.strokeStyle = recActive ? '#E0761F' : '#D8CBB8'
    ctx.lineWidth = 1.4
    ctx.beginPath(); ctx.roundRect(recX, recY, recW, recH, recH / 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = recActive ? '#C2410C' : '#A79884'
    ctx.font = `bold ${Math.max(10, Math.round(12 * scale))}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(
      recount >= MAX_REC ? `已记录 ${MAX_REC} 组（点「重置」清空）` : `📋 记录一组数据（${recount}/${MAX_REC}）`,
      midX, recY + recH / 2
    )
    ctx.restore()
    if (recActive) {
      canvasRef.current._clickAreas.push({
        x: recX, y: recY, w: recW, h: recH,
        onClick: () => {
          const cur = solve()
          if (cur.I <= 0.005) return
          S.current.records.push({ t: S.current.tOn, i: cur.I, t1: cur.T1, t2: cur.T2, q1: S.current.q1, q2: S.current.q2 })
          forceUpdate(n => n + 1)
        },
      })
    }

    // 调试/验收钩子
    canvasRef.current._dbg = {
      swX, swY: y1, rheoX, rheoY: y0, hRheo, hSw, b1X, b2X,
      recX: midX, recY: recY + recH / 2, scale,
      closed: on, ratio: s.ratio, I: sol.I, T1: sol.T1, T2: sol.T2,
      q1: s.q1, q2: s.q2, tOn: s.tOn, recN: recount,
    }

    // ─── 标注 ───
    const labelFont = Math.max(9, Math.round(11 * scale))
    ctx.fillStyle = '#667'; ctx.font = `${labelFont}px sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('电源', battX, y1 + 26 * scale)
    ctx.fillText(on ? '开关（闭合）' : '开关（断开）', swX, y1 + 26 * scale)
    ctx.fillStyle = '#8A5A2B'; ctx.font = `bold ${labelFont}px sans-serif`
    ctx.fillText(`R₁ = ${R1H.toFixed(0)} Ω`, b1X, y1 + 12 * scale)
    ctx.fillText(`T₁ = ${sol.T1.toFixed(1)} ℃`, b1X, y1 + 26 * scale)
    ctx.fillText(`R₂ = ${R2H.toFixed(0)} Ω`, b2X, y1 + 12 * scale)
    ctx.fillText(`T₂ = ${sol.T2.toFixed(1)} ℃`, b2X, y1 + 26 * scale)

    ctx.fillStyle = '#667'; ctx.font = `${labelFont}px sans-serif`
    ctx.fillText('电流表 A（串联）', amX, y0 - 34 * scale)
    ctx.fillText(
      scale < 0.95
        ? `R₁ = ${sol.Rr.toFixed(1)} Ω`
        : `滑动变阻器  R₁ = ${sol.Rr.toFixed(1)} Ω（0～20 Ω）`,
      rheoX, y0 + 20 * scale
    )
    ctx.textAlign = 'center'
    ctx.fillText(`A 表：${sol.I.toFixed(2)} A`, amX, y0 + 20 * scale)

    // 滑片说明
    ctx.fillStyle = '#B08954'; ctx.font = `${labelFont}px sans-serif`
    ctx.fillText('← 左移电流大、升温快　·　右移电流小、升温慢 →', rheoX + 22 * scale, y0 + 38 * scale)

    // 电流方向（左竖线上，向上）+ 一侧 e⁻
    if (on) {
      const ax = x0 + 18 * scale
      const ya = y1 - 22 * scale, yb = midY + 6 * scale
      ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2.2 * scale; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(ax, ya); ctx.lineTo(ax, yb); ctx.stroke(); ctx.lineCap = 'butt'
      ctx.fillStyle = '#E53935'
      ctx.beginPath(); ctx.moveTo(ax, yb - 10 * scale)
      ctx.lineTo(ax - 5 * scale, yb); ctx.lineTo(ax + 5 * scale, yb); ctx.closePath(); ctx.fill()
      ctx.font = `bold ${labelFont + 1}px sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText('电流 I', ax + 10 * scale, (ya + yb) / 2)
      ctx.fillStyle = '#B8860B'; ctx.font = `${labelFont}px sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText('e⁻↓', ax + 10 * scale, yb + 10 * scale)
      ctx.fillText('e⁻→', x0 + loopW * 0.50, y0 + 21 * scale)
    }

    // ─── 知识卡片 ───
    const SECTIONS = buildSections(s.records)
    if (lay.compact) {
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      let ky = panel.y + 12
      const px = panel.x + 14
      ctx.font = `bold ${lay.font.data}px monospace`; ctx.fillStyle = '#333'
      ctx.fillText(`R₁ = ${sol.Rr.toFixed(1)} Ω`, px, ky); ky += 18
      ctx.fillText(`I = ${sol.I.toFixed(2)} A`, px, ky); ky += 18
      ctx.fillText(`T₁ = ${sol.T1.toFixed(1)} ℃`, px, ky); ky += 18
      ctx.fillText(`T₂ = ${sol.T2.toFixed(1)} ℃`, px, ky); ky += 18
      ctx.fillStyle = on ? '#2E7D32' : '#888'
      ctx.font = `bold ${lay.font.body}px sans-serif`
      ctx.fillText(on ? '● 通路' : '○ 断路', px, ky)
      ctx.textBaseline = 'alphabetic'
      canvasRef.current._cardBox = null
      return
    }

    const cardOut = drawKnowledgeCard(ctx, panel, SECTIONS, {
      title: '📖 焦耳定律知识',
      scroll: s.cardScroll,
      tip: (c, tx, ty) => {
        if (on) {
          c.fillStyle = '#C2410C'
          c.fillText(
            `● 通电 t = ${s.tOn.toFixed(1)} s｜I = ${sol.I.toFixed(2)} A｜T₁ = ${sol.T1.toFixed(1)} ℃｜T₂ = ${sol.T2.toFixed(1)} ℃`,
            tx, ty + 10
          )
        } else {
          c.fillStyle = '#B08954'
          c.fillText('○ 断开：滑片先移到阻值最大处（最右），再闭合开关（点画面里的开关）', tx, ty + 10)
        }
      },
    })
    canvasRef.current._cardBox = cardOut
      ? { x: panel.x, y: panel.y + 2, w: panel.w, h: cardOut.cardH, maxScroll: cardOut.maxScroll, scroll: cardOut.scroll }
      : null
    ctx.textBaseline = 'alphabetic'

    if (canvasRef.current._dbg) {
      const cbox = canvasRef.current._cardBox
      canvasRef.current._dbg.cardMax = cbox ? cbox.maxScroll : 0
      canvasRef.current._dbg.cardScroll = S.current.cardScroll
      canvasRef.current._dbg.card = cbox
    }
  }

  /* ── 知识卡片内容（7 节，第 6 节是本次记录）── */
  function buildSections(records) {
    const rows = records.map((r, i) => {
      const d1 = r.t1 - T0, d2 = r.t2 - T0
      const ratio = d1 > 0.3 ? (d2 / d1) : null
      return [
        [`第 ${i + 1} 次：t = `], [`${r.t.toFixed(1)} s`, '#C2410C', 1],
        ['，I = '], [`${r.i.toFixed(2)} A`, '#C2410C', 1],
        ['，T₁ = '], [`${r.t1.toFixed(1)} ℃`, '#B45309', 1],
        ['，T₂ = '], [`${r.t2.toFixed(1)} ℃`, '#B45309', 1],
        ratio ? ['　ΔT₂/ΔT₁ = ' + ratio.toFixed(2), '#15803D', 1] : [''],
      ]
    })
    if (records.length) {
      const last = records[records.length - 1]
      const d1 = last.t1 - T0, d2 = last.t2 - T0
      if (d1 > 0.3) {
        rows.push([
          ['ΔT 之比 = '], [`${(d2 / d1).toFixed(2)}`, '#DC2626', 1],
          ['，理论 Q₂/Q₁ = R₂/R₁ = '], ['2.00', '#15803D', 1],
          ['（同电流、同时间）'],
        ])
      }
    }
    if (!rows.length) {
      rows.push([['闭合开关后点下方「📋 记录一组数据」，记下 t、I 和两瓶温度，看 ΔT 之比。']])
    }

    return [
      {
        t: '实验目的', c: '#E0761F',
        items: [
          [['探究电流通过导体产生的热量 Q 与'], ['电流 I', '#C2410C', 1], ['、'], ['电阻 R', '#C2410C', 1], ['、'], ['通电时间 t', '#C2410C', 1], [' 的关系，得出 '], ['Q = I²Rt', '#DC2626', 1], ['。']],
          [['学会用'], ['转换法', '#15803D', 1], ['：热量看不见，用温度计示数升高（煤油升温）来反映 Q 的多少。']],
          [['学会用'], ['控制变量法', '#15803D', 1], ['：两瓶串联保证 I、t 相同，只比较 R 不同的效果。']],
        ],
      },
      {
        t: '实验器材', c: '#C98A12',
        items: [
          [['干电池组（3 V）、开关、'], ['电流表', '#C2410C', 1], ['、'], ['滑动变阻器（20 Ω 2 A）', '#EA8C1B', 1], ['、导线。']],
          [['两个'], ['完全相同的烧瓶', '#C2410C', 1], ['，装'], ['等质量、同种的煤油', '#C2410C', 1], ['，瓶内分别浸一段电阻丝 '], ['R₁ = 5 Ω', '#EA8C1B', 1], [' 和 '], ['R₂ = 10 Ω', '#EA8C1B', 1], ['。']],
          [['两支'], ['相同的温度计', '#C2410C', 1], ['（玻璃泡浸没在煤油中，不碰电阻丝和瓶壁）。']],
        ],
      },
      {
        t: '实验步骤', c: '#CA8A04',
        items: [
          [['① '], ['断开开关', '#DC2626', 1], ['，把两瓶的电阻丝'], ['串联', '#15803D', 1], ['接入电路（这样通过它们的 '], ['I 相同', '#15803D', 1], ['）。']],
          [['② 滑变「一上一下」串入电路，闭合前把滑片移到'], ['阻值最大处', '#DC2626', 1], ['，记下两温度计的初温。']],
          [['③ '], ['闭合开关', '#15803D', 1], ['，开始计时，读出电流 I。']],
          [['④ 通电一段时间，每隔几秒记一次 t、I、T₁、T₂，比较两瓶升温快慢。']],
          [['⑤ 再改变滑片位置（改变 I）重做，比较不同电流下的升温快慢；'], ['断开开关', '#DC2626', 1], ['，整理器材。']],
        ],
      },
      {
        t: '电路与接法', c: '#C2410C',
        items: [
          [['两段电阻丝'], ['串联', '#15803D', 1], ['在同一回路里 ⇒ 通过的'], ['电流 I 相同、通电时间 t 相同', '#DC2626', 1], ['，只有 R 不同。']],
          [['电流表'], ['串联', '#15803D', 1], ['在回路里（'], ['+ 柱进、− 柱出', '#DC2626', 1], ['），本实验约 0.2 A，用 0～0.6 A 档。']],
          [['滑动变阻器'], ['改变电流大小', '#C2410C', 1], ['，也可保护电路；接法「一上一下」。']],
          [['温度计'], ['玻璃泡要浸没在煤油中', '#DC2626', 1], ['，读数时视线与液柱顶端齐平。']],
        ],
      },
      {
        t: '数据处理：为什么是 Q = I²Rt', c: '#B45309',
        items: [
          [['焦耳定律：'], ['Q = I²Rt', '#DC2626', 1], ['（Q 热量 J，I 电流 A，R 电阻 Ω，t 时间 s）。']],
          [['同 I、同 t 时 '], ['Q ∝ R', '#15803D', 1], ['：R₂ = 2R₁ ⇒ Q₂ = 2Q₁ ⇒ '], ['T₂ 升得比 T₁ 快一倍', '#C2410C', 1], ['。']],
          [['同 R、同 t 时 '], ['Q ∝ I²', '#15803D', 1], ['：电流变成 2 倍，热量变成 '], ['4 倍', '#C2410C', 1], ['（不是 2 倍）。']],
          [['同 I、同 R 时 '], ['Q ∝ t', '#15803D', 1], ['：通电越久越热。']],
          [['温度计示数只是'], ['间接反映', '#C2410C', 1], ['热量，不能把「温度」直接当成「热量」；两瓶必须'], ['等质量、同种煤油', '#DC2626', 1], ['，升温才可比。']],
        ],
      },
      { t: '本次测量记录', c: '#15803D', items: rows },
      {
        t: '注意事项', c: '#DC2626',
        items: [
          [['连线、改线时开关必须'], ['断开', '#DC2626', 1], ['；闭合前滑片在'], ['阻值最大处', '#DC2626', 1], ['。']],
          [['通电时间不要过长，煤油温度别升得太高'], ['（超过 60 ℃ 就停）', '#DC2626', 1], ['，以免烫伤或煤油溢出。']],
          [['两瓶必须'], ['等质量、同种煤油', '#DC2626', 1], ['，温度计规格相同，否则升温不可比。']],
          [['电表'], ['正负柱不能接反', '#DC2626', 1], ['，量程不能超；先试触再闭合。']],
        ],
      },
    ]
  }

  // ================================================================
  //  交互
  // ================================================================
  const getPos = (e) => eventToCanvas(canvasRef.current, e)

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    const { x, y } = getPos(e)
    if (S.current.tab !== 1) return
    // 知识卡片内容较多时：按住卡片上下拖动即可滚动
    const box = canvasRef.current._cardBox
    if (box && box.maxScroll > 0 && x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
      S.current.cardDrag = { y0: y, s0: S.current.cardScroll }
      return
    }
    for (const a of canvasRef.current._clickAreas) {
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) {
        S.current.dragging = !!a.onDrag
        a.onClick?.(x)
        return
      }
    }
  }, [])

  const handleMouseMove = useCallback((e) => {
    if (S.current.tab !== 1) return
    if (S.current.cardDrag) {
      const { y } = getPos(e)
      const box = canvasRef.current._cardBox
      const b = S.current.cardDrag
      S.current.cardScroll = Math.max(0, Math.min(box?.maxScroll || 0, b.s0 - (y - b.y0)))
      forceUpdate(n => n + 1)
      return
    }
    if (!S.current.dragging) return
    const { x } = getPos(e)
    const a = canvasRef.current._clickAreas.find((k) => k.onDrag)
    a?.onDrag?.(x)
  }, [])

  const handleMouseUp = useCallback(() => {
    S.current.dragging = false
    S.current.cardDrag = null
  }, [])

  const handleWheel = useCallback((e) => {
    const box = canvasRef.current?._cardBox
    if (!box || !box.maxScroll) return
    const { x, y } = getPos(e)
    if (x < box.x || x > box.x + box.w || y < box.y || y > box.y + box.h) return
    S.current.cardScroll = Math.max(0, Math.min(box.maxScroll, S.current.cardScroll + e.deltaY))
    forceUpdate(n => n + 1)
  }, [])

  const handleReset = useCallback(() => {
    S.current.switchClosed = false
    S.current.ratio = 1
    S.current.records = []
    S.current.q1 = 0
    S.current.q2 = 0
    S.current.tOn = 0
    S.current.cardScroll = 0
    builderRef.current?.reset()
    forceUpdate(n => n + 1)
  }, [])

  const handleAddFromPalette = useCallback((type) => { builderRef.current?.add(type) }, [])
  const handleDropFromPalette = useCallback((type, clientX, clientY) => { builderRef.current?.addAt(type, clientX, clientY) }, [])
  const handlePickColor = useCallback((color) => { S.current.wireColor = color; forceUpdate(v => v + 1) }, [])

  return (
    <SceneShell
      title="探究焦耳定律"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t) }}
      tab1Label="📖 电路演示"
      tab2Label="🔧 自己动手"
      onReset={handleReset}
      desc={tab === 1 ? (
        <>
          <b>探究焦耳定律</b>
          <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
            电路演示：两瓶等量煤油串联同电流 · 升温看热量 · Q = I²Rt
          </span>
        </>
      ) : null}
    >
      <div style={{ display: 'flex', flexDirection: 'row', flex: 1, minHeight: 0, width: '100%' }}>
        <canvas
          ref={canvasRef}
          className="canvas-fill"
          style={{ width: '100%', flex: 1, minHeight: 0, display: tab === 1 ? 'block' : 'none', touchAction: 'none' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        />
        {tab === 2 && (
          <BuilderSVG ref={builderRef} wireColor={S.current.wireColor} />
        )}
        {tab === 1 ? (
          <InfoDock
            purpose="探究电流产生的热量与电流、电阻、通电时间的关系，得出 Q = I²Rt。"
            steps={[
              '两瓶煤油等量、同种，瓶内电阻丝 R₁=5Ω、R₂=10Ω 串联',
              '滑片先放阻值最大处，再点开关闭合',
              '通电一会儿，看两支温度计谁升得快',
              '点「记录一组数据」，再改滑片换电流重做',
            ]}
            hint="两瓶串联 ⇒ I、t 相同，只有 R 不同 ⇒ ΔT 之比 = R 之比 = 2。"
          />
        ) : (
          <InfoDock
            align="left"
            offset={{ left: 26, top: 26 }}
            hint="点右侧器材加入 → 拖拽移动 → 点接线柱连线。电流表串联、滑变「一上一下」；轻点开关通断，双击电表看读数，双击器材或按 Delete 删除。"
            hintTitle="操作说明"
          />
        )}
        {tab === 2 && (
          <BuilderPalette side="right"
            items={[
              // 与「简单电路」完全同一套器材
              { type: 'battery', name: '电池组', icon: thumb('battery') },
              { type: 'accumulator', name: '蓄电池', icon: thumb('accumulator') },
              { type: 'bulb', name: '灯泡', icon: thumb('bulb') },
              { type: 'switch', name: '开关', icon: thumb('switch') },
              { type: 'resistor5', name: '电阻', icon: thumb('resistor5') },
              { type: 'rheostat', name: '滑变', icon: thumb('rheostat') },
              { type: 'ammeter', name: '电流表', icon: thumb('ammeter') },
              { type: 'ammeterA', name: '安培表', icon: thumb('ammeterA') },
              { type: 'voltmeter', name: '电压表', icon: thumb('voltmeter') },
            ]}
            wireColor={S.current.wireColor}
            onPickColor={handlePickColor}
            onAdd={handleAddFromPalette}
            onDropAt={handleDropFromPalette}
            hint="点选或拖到桌面加入"
          />
        )}
      </div>
    </SceneShell>
  )
}

/* ── 煤油瓶（电阻丝 + 温度计 + 气泡）── */
function drawBottle(ctx, cx, baseY, o) {
  const { scale, Rw, temp, q, on, time, wc } = o
  const sc = scale
  const w = 34 * sc, h = 46 * sc
  const by = baseY - 14 * sc - h        // 瓶底 y（留 14sc 给引线）
  const bx = cx - w / 2
  const hf = Math.min(1, q / 6)

  // 两根引线（瓶底 → 导线）
  ctx.strokeStyle = wc; ctx.lineWidth = 2 * sc + 0.5; ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx - 15 * sc, baseY); ctx.lineTo(cx - 15 * sc, by + h - 3 * sc)
  ctx.moveTo(cx + 15 * sc, baseY); ctx.lineTo(cx + 15 * sc, by + h - 3 * sc)
  ctx.stroke()

  // 瓶身
  ctx.fillStyle = 'rgba(255,255,255,0.94)'
  ctx.strokeStyle = '#A8C0CE'; ctx.lineWidth = 1.6 * sc
  ctx.beginPath(); ctx.roundRect(bx, by, w, h, 6 * sc); ctx.fill(); ctx.stroke()

  // 煤油（受热后略微变暖）
  const oilTop = by + h * 0.30
  ctx.fillStyle = hf > 0.05 && on
    ? `rgba(255,${Math.round(208 - 40 * hf)},${Math.round(120 - 30 * hf)},0.55)`
    : 'rgba(255,208,120,0.5)'
  ctx.beginPath(); ctx.roundRect(bx + 2 * sc, oilTop, w - 4 * sc, h - (oilTop - by) - 2 * sc, 4 * sc); ctx.fill()

  // 电阻丝（红热程度随热量）
  const ry = by + h * 0.66
  const sx1 = bx + 6 * sc, sx2 = bx + w - 6 * sc
  // 电阻丝两端接回引线（看着是接在电路里，不是悬空的）
  ctx.strokeStyle = '#9A7B54'; ctx.lineWidth = 1.2 * sc
  ctx.beginPath()
  ctx.moveTo(cx - 15 * sc, by + h - 3 * sc); ctx.lineTo(sx1, ry)
  ctx.moveTo(cx + 15 * sc, by + h - 3 * sc); ctx.lineTo(sx2, ry)
  ctx.stroke()
  ctx.strokeStyle = `rgba(214,64,32,${0.45 + 0.55 * hf})`
  ctx.lineWidth = 1.8 * sc
  ctx.beginPath(); ctx.moveTo(sx1, ry)
  for (let i = 1; i <= 4; i++) {
    ctx.lineTo(sx1 + (sx2 - sx1) * (i / 4), ry + (i % 2 ? -4 * sc : 4 * sc))
  }
  ctx.stroke()

  // 气泡（受热上升）
  if (on && hf > 0.08) {
    ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.3 * hf})`
    for (let i = 0; i < 3; i++) {
      const ph = (time * 0.7 + i * 0.33) % 1
      const y2 = ry - ph * (ry - oilTop) * 0.9
      ctx.beginPath(); ctx.arc(bx + w * (0.34 + i * 0.15), y2, 1.6 * sc, 0, Math.PI * 2); ctx.fill()
    }
  }

  // 温度计（瓶顶向上伸出的细管）
  const th = 30 * sc, tw = 5.4 * sc
  ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#9FB6C4'; ctx.lineWidth = 1.2 * sc
  ctx.beginPath(); ctx.roundRect(cx - tw / 2, by - th, tw, th + 9 * sc, tw / 2); ctx.fill(); ctx.stroke()
  const frac = Math.max(0, Math.min(1, (temp - T0) / (TMAX - T0)))
  const liqH = Math.max(2 * sc, (th - 5 * sc) * frac)
  ctx.fillStyle = '#E53935'
  ctx.beginPath(); ctx.roundRect(cx - 1.2 * sc, by - 3 * sc - liqH, 2.4 * sc, liqH, 1.2 * sc); ctx.fill()
  ctx.beginPath(); ctx.arc(cx, by + 3 * sc, 2.6 * sc, 0, Math.PI * 2); ctx.fill()
}

// ─── 画辅助 ───
function drawLine(ctx, x1, y1, x2, y2, color, w) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
}

/** 电子流动（黄点） */
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
