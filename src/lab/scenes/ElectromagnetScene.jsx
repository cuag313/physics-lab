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
 * ElectromagnetScene — 探究电磁铁的磁性（第 7 个按「简单电路」模板改造的电学实验）
 *
 *   Tab1 📖 电路演示 —— 暖色底 + 标准符号回路：
 *                        上边 滑变（左）+ 电流表（右）串联
 *                        下边 电源 → 电磁铁（线圈 + 软铁芯 + 吸起的头针）→ 开关
 *                        控制变量法：① 改滑片 ⇒ I 变（N 不变）② 换匝数 ⇒ N 变（I 用滑片调回）
 *                                    ③ 插/抽软铁芯 ⇒ μ 变（N、I 不变）
 *                        磁性强弱 = N·I·μ，用「吸住大头针的枚数」读数（转换法）
 *   Tab2 🔧 自己动手 —— 与简单电路同一套 1:1 SVG 器材（9 件基础器材 + 本专题专用「电磁铁」）+
 *                        一键透视内部结构 + 实验记录表（都在 BuilderSVG 里）
 */

/** 器材栏缩略图：与桌面器材同源 */
function thumb(type) {
  const t = TYPES[type]
  if (!t) return null
  let svg = t.render(
    { id: `pal-${type}`, closed: true, showRead: false, f: 0.4, turns: 20, core: true },
    { bright: 0.55, frac: 0.35, I: 0, f: 0.4, rays: false, pins: 3 }
  )
  /* 电磁铁是竖高的器材，按通用 40×24 缩略框会看不清 → 单独给到 42×40 */
  if (type === 'electromagnet') svg = svg.replace('<svg width="210" height="200"', '<svg style="width:42px;height:40px"')
  return <span dangerouslySetInnerHTML={{ __html: svg }} />
}

const RHEO_MAX = 20          // 20Ω 2A 滑动变阻器
const TURN_OPTS = [10, 20, 30] // 三档匝数（换线圈）
const R_PER_TURN = 0.25      // 每匝线圈电阻 Ω（匝数越多导线越长、电阻越大）
const CORE_MU = 0.25         // 无铁芯时的磁性倍率
const PIN_K = 1.2            // 1.2 N·A ≈ 能吸住 1 枚大头针
const PIN_MAX = 12           // 显示上限
const MAX_REC = 4

export default function ElectromagnetScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const builderRef = useRef(null)

  const S = useRef({
    tab: 1,
    switchClosed: false,
    time: 0,                // 动画时间（电子流动 / 磁感线脉动）
    ratio: 1,               // 滑片位置：1 = 阻值最大（右端）
    ti: 1,                  // 匝数档位索引（默认 20 匝）
    core: true,             // 软铁芯是否插在线圈里
    records: [],            // [{ i, n, core, rr, pins }]
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
      render(R)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  /** 物理：线圈 + 滑变 + 电流表内阻 + 电源内阻串联；磁性 ∝ N·I·μ */
  function solve() {
    const s = S.current
    const turns = TURN_OPTS[s.ti]
    const Rr = Math.round(s.ratio * RHEO_MAX * 10) / 10
    const Rc = R_PER_TURN * turns
    const Rtot = Rc + Rr + CFG.AMM_R + CFG.VS.r
    const I = s.switchClosed ? CFG.VS.V / Rtot : 0
    const mu = s.core ? 1 : CORE_MU
    const strength = turns * I * mu
    const pins = I > 1e-6 ? Math.min(PIN_MAX, Math.max(0, Math.floor(strength / PIN_K))) : 0
    return { turns, Rr, Rc, Rtot, I, mu, strength, pins }
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
    const top = lay.circuit.T, bottom = lay.circuit.B - (lay.compact ? 0 : 30)
    const areaW = right - left, areaH = bottom - top

    const scaleOf = (w) => Math.max(0.55, Math.min(1.1, w / 420))
    let loopW = Math.min(areaW * 0.74, 540)
    const fits = (w) => {
      const sc = scaleOf(w)
      return w * 0.52 + 62 * sc + 176 * sc + 8 <= areaH
    }
    if (!fits(loopW)) {
      let lo = 180, hi = loopW
      for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m }
      loopW = lo
    }
    const chipUp = 62 * scaleOf(loopW), chipDn = 176 * scaleOf(loopW)
    const scale = scaleOf(loopW)
    const loopH = loopW * 0.52
    const x0 = left + (areaW - loopW) / 2
    const y0 = top + Math.max(chipUp + 4, (areaH - (loopH + chipUp + chipDn)) / 2) + chipUp
    const x1 = x0 + loopW, y1 = y0 + loopH
    const midX = x0 + loopW / 2

    // 上边：滑变（左）、电流表（右）；下边：电源、电磁铁、开关
    const rheoX = x0 + loopW * 0.26
    const amX = x0 + loopW * 0.74
    const battX = x0 + loopW * 0.14
    const emX = x0 + loopW * 0.56
    const swX = x0 + loopW * 0.86
    const gap = 44 * scale          // 电磁铁两根引线的半间距（大头针挂在中间，不压引线）

    const wc = on ? '#1565C0' : '#9aa7b1'
    const ink = on ? SYM_INK : '#7c8a93'
    const lw = 2 * scale + 0.6

    const hRheo = symHalf('rheostat', scale)
    const hMeter = symHalf('meter', scale)
    const hBat = symHalf('battery', scale, 2)
    const hSw = symHalf('switch', scale)

    // ─── 导线（电磁铁处在 y1 上让位给两根引线）───
    drawLine(ctx, x0, y0, rheoX - hRheo, y0, wc, lw)
    drawLine(ctx, rheoX + hRheo, y0, amX - hMeter, y0, wc, lw)
    drawLine(ctx, amX + hMeter, y0, x1, y0, wc, lw)
    drawLine(ctx, x1, y0, x1, y1, wc, lw)
    drawLine(ctx, x0, y0, x0, y1, wc, lw)
    drawLine(ctx, x0, y1, battX - hBat, y1, wc, lw)
    drawLine(ctx, battX + hBat, y1, emX - gap, y1, wc, lw)
    drawLine(ctx, emX + gap, y1, swX - hSw, y1, wc, lw)
    drawLine(ctx, swX + hSw, y1, x1, y1, wc, lw)

    // ─── 符号 ───
    const geo = symRheostat(ctx, rheoX, y0, { scale, ratio: s.ratio, ink })
    symMeter(ctx, amX, y0, { kind: 'A', scale, ink })
    symBattery(ctx, battX, y1, { n: 2, scale, ink, flip: true })
    symSwitch(ctx, swX, y1, { closed: on, scale, ink })

    // ─── 电磁铁 ───
    drawEM(ctx, emX, y1, {
      scale, turns: sol.turns, I: sol.I, pins: sol.pins,
      core: s.core, on, time: s.time, wc,
    })

    // 电子流动：从电源 + 极出发，绕一圈回到 − 极（电磁铁处贴底绕过引线）
    if (on) {
      const path = [
        { x: battX + hBat, y: y1 },
        { x: emX - gap, y: y1 }, { x: emX - gap, y: y1 - 10 * scale },
        { x: emX + gap, y: y1 - 10 * scale }, { x: emX + gap, y: y1 },
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
      x: swX - hSw - 12, y: y1 - 22 * scale, w: (hSw + 12) * 2, h: 44 * scale,
      onClick: () => { S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1) },
    })
    // 滑片连续可调
    const travel = Math.max(6 * scale, geo.W / 2 - 7 * scale)
    const sliderArea = { x: rheoX - travel, y: y0 - 26 * scale, w: travel * 2, h: 44 * scale }
    const slideTo = (mx) => {
      S.current.ratio = Math.max(0, Math.min(1, (mx - (rheoX - travel)) / (travel * 2)))
      forceUpdate(n => n + 1)
    }
    canvasRef.current._clickAreas.push({ ...sliderArea, onClick: slideTo, onDrag: slideTo })
    canvasRef.current._sliderArea = sliderArea

    // ─── 匝数三档按钮（第一行）───
    const chipFont = Math.max(10, Math.round(12 * scale))
    const bw = 84 * scale, bh = 28 * scale, bgap = 9 * scale
    const bY = y1 + 40 * scale
    const b0 = midX - (bw * 3 + bgap * 2) / 2
    const turnBtns = []
    for (let i = 0; i < 3; i++) {
      const bx = b0 + i * (bw + bgap)
      const sel = s.ti === i
      ctx.save()
      ctx.fillStyle = sel ? '#FDE7C8' : '#FFF8EE'
      ctx.strokeStyle = sel ? '#E0761F' : '#DCC8AA'
      ctx.lineWidth = sel ? 2 : 1.2
      ctx.beginPath(); ctx.roundRect(bx, bY, bw, bh, bh / 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = sel ? '#C2410C' : '#8A7355'
      ctx.font = `bold ${chipFont}px "Microsoft YaHei", sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(`${TURN_OPTS[i]} 匝`, bx + bw / 2, bY + bh / 2)
      ctx.restore()
      turnBtns.push({ x: bx, y: bY, w: bw, h: bh })
      canvasRef.current._clickAreas.push({
        x: bx, y: bY, w: bw, h: bh,
        onClick: () => { S.current.ti = i; forceUpdate(n => n + 1) },
      })
    }

    // ─── 铁芯按钮 + 记录按钮（第二行）───
    const b2Y = bY + bh + 10 * scale
    const coreW2 = 136 * scale, recW = 172 * scale, recH = bh
    const coreX = midX - 8 * scale - coreW2
    const recX = midX + 8 * scale
    ctx.save()
    ctx.fillStyle = s.core ? '#EAF3E6' : '#F3F1EC'
    ctx.strokeStyle = s.core ? '#15803D' : '#CFC6B6'
    ctx.lineWidth = 1.4
    ctx.beginPath(); ctx.roundRect(coreX, b2Y, coreW2, recH, recH / 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = s.core ? '#166534' : '#8A7355'
    ctx.font = `bold ${Math.max(10, Math.round(11.5 * scale))}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(s.core ? '🔩 铁芯：已插入' : '🔩 铁芯：已抽出', coreX + coreW2 / 2, b2Y + recH / 2)
    ctx.restore()
    canvasRef.current._clickAreas.push({
      x: coreX, y: b2Y, w: coreW2, h: recH,
      onClick: () => { S.current.core = !S.current.core; forceUpdate(n => n + 1) },
    })

    const recount = s.records.length
    const recActive = on && recount < MAX_REC
    ctx.save()
    ctx.fillStyle = recActive ? '#FFF3E0' : '#F5F0E8'
    ctx.strokeStyle = recActive ? '#E0761F' : '#D8CBB8'
    ctx.lineWidth = 1.4
    ctx.beginPath(); ctx.roundRect(recX, b2Y, recW, recH, recH / 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = recActive ? '#C2410C' : '#A79884'
    ctx.font = `bold ${Math.max(10, Math.round(12 * scale))}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(
      recount >= MAX_REC ? `已记录 ${MAX_REC} 组（点「重置」清空）` : `📋 记录一组数据（${recount}/${MAX_REC}）`,
      recX + recW / 2, b2Y + recH / 2
    )
    ctx.restore()
    if (recActive) {
      canvasRef.current._clickAreas.push({
        x: recX, y: b2Y, w: recW, h: recH,
        onClick: () => {
          const cur = solve()
          if (cur.I <= 0.005) return
          S.current.records.push({
            i: cur.I, n: cur.turns, core: S.current.core, rr: cur.Rr, pins: cur.pins,
            strength: cur.strength,
          })
          forceUpdate(n => n + 1)
        },
      })
    }

    // 调试/验收钩子
    canvasRef.current._dbg = {
      swX, swY: y1, rheoX, rheoY: y0, hRheo, hSw, emX, scale,
      turnBtn: turnBtns, coreBtn: { x: coreX + coreW2 / 2, y: b2Y + recH / 2 },
      recX: recX + recW / 2, recY: b2Y + recH / 2,
      closed: on, ratio: s.ratio, ti: s.ti, turns: sol.turns, core: s.core,
      I: sol.I, pins: sol.pins, strength: sol.strength, recN: recount,
    }

    // ─── 标注 ───
    const labelFont = Math.max(9, Math.round(11 * scale))
    ctx.fillStyle = '#667'; ctx.font = `${labelFont}px sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('电源', battX, y1 + 24 * scale)
    ctx.fillText(on ? '开关（闭合）' : '开关（断开）', swX, y1 + 24 * scale)
    ctx.fillStyle = '#8A5A2B'; ctx.font = `bold ${labelFont}px sans-serif`
    ctx.fillText(`线圈 ${sol.turns} 匝 · R = ${sol.Rc.toFixed(1)} Ω`, emX, y1 + 12 * scale)
    ctx.fillText(`吸住 ${sol.pins} 枚大头针`, emX, y1 + 24 * scale)

    ctx.fillStyle = '#667'; ctx.font = `${labelFont}px sans-serif`
    ctx.fillText('电流表 A（串联）', amX, y0 - 34 * scale)
    ctx.fillText(
      scale < 0.95
        ? `滑变 R₁ = ${sol.Rr.toFixed(1)} Ω`
        : `滑动变阻器  R₁ = ${sol.Rr.toFixed(1)} Ω（0～20 Ω）`,
      rheoX, y0 + 20 * scale
    )
    ctx.fillText(`A 表：${sol.I.toFixed(2)} A`, amX, y0 + 20 * scale)

    // 电流表超量程：真表不允许，必须右移滑片减小电流
    if (on && sol.I > CFG.AMM_FS) {
      ctx.fillStyle = '#DC2626'; ctx.textAlign = 'center'; ctx.font = `bold ${labelFont}px sans-serif`
      ctx.fillText(`⚠ 超量程（0～${CFG.AMM_FS} A）—— 把滑片右移减小电流`, amX, y0 + 36 * scale)
    }

    // 滑片说明
    ctx.fillStyle = '#B08954'; ctx.font = `${labelFont}px sans-serif`; ctx.textAlign = 'center'
    ctx.fillText('← 磁性增强　　减弱 →', rheoX + 8 * scale, y0 + 56 * scale)

    // 电流方向（左竖线上，向上）+ 一侧 e⁻
    if (on) {
      const ax = x0 + 18 * scale
      const ya = y1 - 22 * scale, yb = y0 + loopH * 0.5
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
    }

    // ─── 知识卡片 ───
    const SECTIONS = buildSections(s.records)
    if (lay.compact) {
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      let ky = panel.y + 12
      const px = panel.x + 14
      ctx.font = `bold ${lay.font.data}px monospace`; ctx.fillStyle = '#333'
      ctx.fillText(`N = ${sol.turns} 匝`, px, ky); ky += 18
      ctx.fillText(`I = ${sol.I.toFixed(2)} A`, px, ky); ky += 18
      ctx.fillText(`针数 = ${sol.pins} 枚`, px, ky); ky += 18
      ctx.fillText(`铁芯 ${s.core ? '已插' : '抽出'}`, px, ky); ky += 18
      ctx.fillStyle = on ? '#2E7D32' : '#888'
      ctx.font = `bold ${lay.font.body}px sans-serif`
      ctx.fillText(on ? '● 通路' : '○ 断路', px, ky)
      ctx.textBaseline = 'alphabetic'
      canvasRef.current._cardBox = null
      return
    }

    const cardOut = drawKnowledgeCard(ctx, panel, SECTIONS, {
      title: '📖 电磁铁知识',
      scroll: s.cardScroll,
      tip: (c, tx, ty) => {
        if (on) {
          c.fillStyle = '#C2410C'
          c.fillText(
            `● 通路｜N = ${sol.turns} 匝｜I = ${sol.I.toFixed(2)} A｜铁芯${s.core ? '已插入' : '已抽出'}｜吸 ${sol.pins} 枚针`,
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
    const rows = records.map((r, i) => [
      [`第 ${i + 1} 次：`],
      [`${r.n} 匝`, '#7C3AED', 1],
      ['，I = '], [`${r.i.toFixed(2)} A`, '#C2410C', 1],
      ['，铁芯'], [`${r.core ? '插入' : '抽出'}`, r.core ? '#15803D' : '#DC2626', 1],
      ['，吸 '], [`${r.pins} 枚`, '#B45309', 1],
      ['针（N·I = ' + r.strength.toFixed(1) + '）'],
    ])
    if (records.length >= 2) {
      // 找出「同 I 不同 N」或「同 N 不同 I」的一对，给出定量对照
      const a = records[0], last = records[records.length - 1]
      if (Math.abs(last.i - a.i) < 0.05 && last.n !== a.n) {
        rows.push([
          ['对照：I 基本相同（' + last.i.toFixed(2) + ' A），匝数 '],
          [`${a.n} → ${last.n}`, '#7C3AED', 1],
          ['（' + (last.n / a.n).toFixed(1) + ' 倍），针数 '],
          [`${a.pins} → ${last.pins}`, '#DC2626', 1],
          [' ⇒ 磁性 ∝ 匝数'],
        ])
      } else if (last.n === a.n && Math.abs(last.i - a.i) > 0.05) {
        rows.push([
          ['对照：N 相同（' + last.n + ' 匝），电流 '],
          [`${a.i.toFixed(2)} → ${last.i.toFixed(2)} A`, '#C2410C', 1],
          ['（' + (last.i / Math.max(a.i, 0.01)).toFixed(1) + ' 倍），针数 '],
          [`${a.pins} → ${last.pins}`, '#DC2626', 1],
          [' ⇒ 磁性 ∝ 电流'],
        ])
      } else if (a.core !== last.core && last.n === a.n && Math.abs(last.i - a.i) < 0.05) {
        rows.push([
          ['对照：N、I 相同，铁芯 '],
          [`${a.core ? '插入' : '抽出'} → ${last.core ? '插入' : '抽出'}`, '#15803D', 1],
          ['，针数 '],
          [`${a.pins} → ${last.pins}`, '#DC2626', 1],
          [' ⇒ 铁芯让磁性大大增强'],
        ])
      }
    }
    if (!rows.length) {
      rows.push([['闭合开关后点「📋 记录一组数据」，记下匝数、电流、铁芯和吸住的针数。']])
    }

    return [
      {
        t: '实验目的', c: '#E0761F',
        items: [
          [['探究电磁铁的'], ['磁性强弱', '#C2410C', 1], ['与哪些因素有关，得出 '], ['磁性 ∝ 匝数 N × 电流 I × 铁芯', '#DC2626', 1], ['。']],
          [['学会用'], ['转换法', '#15803D', 1], ['：磁性看不见，用「'], ['吸住大头针的枚数', '#C2410C', 1], ['」来比较磁性强弱。']],
          [['学会用'], ['控制变量法', '#15803D', 1], ['：研究一个因素时，其余因素必须保持不变（改匝数后要用滑变把电流调回原值）。']],
        ],
      },
      {
        t: '实验器材', c: '#C98A12',
        items: [
          [['干电池组（3 V）、开关、'], ['电流表', '#C2410C', 1], ['、'], ['滑动变阻器（20 Ω 2 A）', '#EA8C1B', 1], ['、导线若干。']],
          [[''], ['电磁铁', '#EA8C1B', 1], ['：线圈（本实验备 10 匝 / 20 匝 / 30 匝三种，见器材「电磁铁」）+ 一根'], ['软铁芯', '#EA8C1B', 1], ['。']],
          [[''], ['大头针', '#C2410C', 1], ['（或小铁钉）一盒 —— 用来"读"磁性强弱。']],
        ],
      },
      {
        t: '实验步骤', c: '#CA8A04',
        items: [
          [['① 按图连线：电源、开关、'], ['电流表（串联）', '#15803D', 1], ['、滑动变阻器、电磁铁线圈串成一个回路，闭合前滑片在'], ['阻值最大处', '#DC2626', 1], ['。']],
          [['② 把铁芯'], ['插入线圈', '#15803D', 1], ['，闭合开关，读出电流 I，把电磁铁下端靠近大头针，数'], ['吸住几枚', '#C2410C', 1], ['。']],
          [['③ 保持'], ['匝数不变', '#DC2626', 1], ['，移动滑片改变电流，重做 2～3 次 ⇒ 看磁性怎样随电流变。']],
          [['④ 保持'], ['电流不变', '#DC2626', 1], ['（换匝数后必须重新调滑片把 I 调回原值），换 10 匝 / 20 匝 / 30 匝线圈重做 ⇒ 看磁性怎样随匝数变。']],
          [['⑤ 保持匝数、电流都不变，'], ['抽出铁芯', '#DC2626', 1], ['重做 ⇒ 看磁性怎样变。断开开关，整理器材。']],
        ],
      },
      {
        t: '电路与接法', c: '#C2410C',
        items: [
          [['电流表'], ['串联', '#15803D', 1], ['在回路里（'], ['+ 柱进、− 柱出', '#DC2626', 1], ['），本实验约 0.2～0.5 A，用 0～0.6 A 档。']],
          [['滑动变阻器接法「'], ['一上一下', '#15803D', 1], ['」串入电路：既改变电流，又起保护作用。']],
          [['线圈'], ['匝数越多，导线越长、电阻越大', '#C2410C', 1], ['（本实验按每匝 0.25 Ω 计），所以换匝数后电流会变 —— 这正是必须重新调滑片的原因。']],
          [['线圈的两个接线柱接到电路里；'], ['铁芯插在线圈中间', '#DC2626', 1], ['，插拔时先断开开关。']],
        ],
      },
      {
        t: '为什么磁性 ∝ N·I', c: '#B45309',
        items: [
          [['通电导线周围有磁场；把导线绕成'], ['线圈', '#15803D', 1], ['，每一匝的磁场叠加，'], ['匝数越多磁场越强', '#C2410C', 1], ['。']],
          [['电流越大，磁场越强：'], ['磁性 ∝ I', '#15803D', 1], ['（同一个线圈，电流加倍 → 磁性约加倍）。']],
          [['插入'], ['软铁芯', '#15803D', 1], ['后铁芯被磁化，相当于给磁场加了一条"低阻通路"，磁性可以增大'], ['几倍到十几倍', '#DC2626', 1], ['；抽出铁芯磁性骤减。']],
          [['所以：'], ['磁性 ∝ N × I × μ', '#DC2626', 1], ['（μ 由铁芯决定）。这也是电磁铁比永久磁铁好用的原因 —— '], ['磁性能用开关和电流随时控制', '#15803D', 1], ['。']],
        ],
      },
      { t: '本次测量记录', c: '#15803D', items: rows },
      {
        t: '注意事项', c: '#DC2626',
        items: [
          [['连线、换线圈、插拔铁芯时开关必须'], ['断开', '#DC2626', 1], ['；闭合前滑片在'], ['阻值最大处', '#DC2626', 1], ['。']],
          [['通电时间不宜过长 —— 线圈'], ['发热会烧坏漆包线', '#DC2626', 1], ['，也不要用大电流长时间通电。']],
          [['电表'], ['正负柱不能接反', '#DC2626', 1], ['、量程不能超；先试触再闭合。']],
          [['比较磁性大小时，'], ['只改变一个因素', '#DC2626', 1], ['，其余必须相同（尤其换匝数后要调回同一电流）。']],
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
    S.current.ti = 1
    S.current.core = true
    S.current.records = []
    S.current.cardScroll = 0
    builderRef.current?.reset()
    forceUpdate(n => n + 1)
  }, [])

  const handleAddFromPalette = useCallback((type) => { builderRef.current?.add(type) }, [])
  const handleDropFromPalette = useCallback((type, clientX, clientY) => { builderRef.current?.addAt(type, clientX, clientY) }, [])
  const handlePickColor = useCallback((color) => { S.current.wireColor = color; forceUpdate(v => v + 1) }, [])

  return (
    <SceneShell
      title="电磁铁磁性影响因素"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t) }}
      tab1Label="📖 电路演示"
      tab2Label="🔧 自己动手"
      onReset={handleReset}
      desc={tab === 1 ? (
        <>
          <b>探究电磁铁的磁性</b>
          <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
            电路演示：电流、匝数、铁芯三因素 · 吸住大头针数就是磁性强弱
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
            align="left"
            offset={{ left: 22, top: 18 }}
            purpose="探究电磁铁的磁性强弱与电流、线圈匝数、铁芯的关系。"
            steps={[
              '滑片先放阻值最大处，再点开关闭合',
              '看电磁铁下端吸住几枚大头针',
              '点「10/20/30 匝」换线圈，看针数变化',
              '点「铁芯」按钮插拔铁芯，再看针数变化',
              '点「记录一组数据」，凑齐三组不同条件做对照',
            ]}
            hint="磁性 ∝ N × I × μ：改匝数后电流会变，要用滑片把 I 调回原值再比较。"
          />
        ) : (
          <InfoDock
            align="left"
            offset={{ left: 26, top: 26 }}
            hint="点右侧器材加入 → 拖拽移动 → 点接线柱连线。轻点开关通断，双击电表看读数；双击电磁铁插/抽铁芯，Shift+单击电磁铁换线圈（10→20→30 匝），双击其它器材或按 Delete 删除。"
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
              // 本专题专用：线圈 + 可插拔软铁芯 + 吸起的大头针
              { type: 'electromagnet', name: '电磁铁', icon: thumb('electromagnet') },
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

/* ── 电磁铁：软铁芯 + 绕线线圈 + 吸住的大头针 ── */
function drawEM(ctx, cx, baseY, o) {
  const { scale, turns, I, pins, core, on, time, wc } = o
  const sc = scale
  const coreW = 13 * sc
  const coreH = 108 * sc
  const magnetBot = baseY - 30 * sc         // 磁极原位（线圈下端、大头针挂点）
  const lift = core ? 0 : 80 * sc           // 抽出后整个铁芯移到线圈上方
  const coreBot = magnetBot - lift
  const coreTop = coreBot - coreH
  const hot = on ? Math.min(1, I / 0.6) : 0

  // 两根引线（底座 → 导线）
  ctx.strokeStyle = wc; ctx.lineWidth = 2 * sc + 0.5; ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx - 44 * sc, baseY); ctx.lineTo(cx - 17 * sc, baseY - 4 * sc)
  ctx.moveTo(cx + 44 * sc, baseY); ctx.lineTo(cx + 17 * sc, baseY - 4 * sc)
  ctx.stroke()
  ctx.lineCap = 'butt'

  // 软铁芯（金属棒；抽出时整个移到线圈上方、颜色变浅）
  ctx.fillStyle = core ? '#9AA4AF' : '#CFD6DE'
  ctx.strokeStyle = core ? '#6B7684' : '#AAB5C0'
  ctx.lineWidth = 1.2 * sc
  ctx.beginPath(); ctx.roundRect(cx - coreW / 2, coreTop, coreW, coreH, 4 * sc); ctx.fill(); ctx.stroke()
  ctx.fillStyle = core ? 'rgba(232,238,244,0.55)' : 'rgba(232,238,244,0.35)'
  ctx.beginPath(); ctx.roundRect(cx - coreW / 2 + 2 * sc, coreTop + 4 * sc, 4 * sc, coreH - 10 * sc, 2 * sc); ctx.fill()

  // 线圈：匝数越多绕得越长（10 匝最短、30 匝最长），位置固定在磁极上方
  const coilH = (52 + (turns - 10) * 0.9) * sc
  const cy1 = magnetBot - 14 * sc
  const cy0 = cy1 - coilH
  const nL = Math.max(6, Math.floor((coilH - 10 * sc) / (5.4 * sc)))
  const coilBody = on
    ? `rgb(${Math.round(198 + 40 * hot)},${Math.round(120 + 40 * hot)},${Math.round(52 - 20 * hot)})`
    : '#C8813E'
  const coilEdge = on ? '#9A5B22' : '#8B5A2B'
  const cw2 = 15 * sc          // 绕线柱半宽
  // 绕线柱本体（密绕漆包线包住铁芯）
  ctx.fillStyle = coilBody
  ctx.strokeStyle = coilEdge; ctx.lineWidth = 1 * sc
  ctx.beginPath(); ctx.roundRect(cx - cw2, cy0, cw2 * 2, coilH, 6 * sc); ctx.fill(); ctx.stroke()
  // 斜向绕线纹理（裁在柱体内部）
  ctx.save()
  ctx.beginPath(); ctx.roundRect(cx - cw2 + 1, cy0 + 1, cw2 * 2 - 2, coilH - 2, 5 * sc); ctx.clip()
  ctx.strokeStyle = coilEdge; ctx.lineWidth = 1.25 * sc
  for (let i = 0; i < nL * 2; i++) {
    const y = cy0 + i * (coilH / (nL * 2)) + 1
    ctx.beginPath()
    ctx.moveTo(cx - cw2, y); ctx.lineTo(cx + cw2, y + 6 * sc)
    ctx.stroke()
  }
  ctx.restore()
  // 左侧高光 + 端面椭圆
  ctx.fillStyle = 'rgba(239,192,138,0.42)'
  ctx.beginPath(); ctx.roundRect(cx - cw2 + 2 * sc, cy0 + 3 * sc, 4 * sc, coilH - 6 * sc, 2 * sc); ctx.fill()
  ctx.strokeStyle = coilEdge; ctx.lineWidth = 1 * sc
  ctx.fillStyle = coilBody
  for (const yy of [cy0, cy0 + coilH]) {
    ctx.beginPath(); ctx.ellipse(cx, yy, cw2, 4.6 * sc, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  }

  // 磁极标记 N / S（铁芯抽出后不标磁极，避免与上方说明文字打架）
  if (on && core) {
    ctx.fillStyle = '#C2410C'; ctx.font = `bold ${Math.max(9, Math.round(11 * sc))}px sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('N', cx, coreTop + 10 * sc)
    ctx.fillStyle = '#1D4ED8'
    ctx.fillText('S', cx, magnetBot - 6 * sc)
  }

  // 磁感线（通电时底端向外拱起，随时间轻微脉动）
  if (on) {
    const ph = 0.5 + 0.5 * Math.sin(time * 2.2)
    ctx.strokeStyle = `rgba(37,99,235,${0.22 + 0.18 * ph * (0.4 + hot)})`
    ctx.lineWidth = 1.2 * sc
    ctx.setLineDash([4 * sc, 3 * sc])
    for (let k = 0; k < 2; k++) {
      const r = (16 + k * 8) * sc
      ctx.beginPath()
      ctx.moveTo(cx - r, magnetBot)
      ctx.bezierCurveTo(cx - r * 0.9, magnetBot + r * 0.55, cx + r * 0.9, magnetBot + r * 0.55, cx + r, magnetBot)
      ctx.stroke()
    }
    ctx.setLineDash([])
  }

  // 大头针：挂在磁极下方，左右两列
  for (let i = 0; i < pins; i++) {
    const col = i % 2 ? 1 : -1
    const row = Math.floor(i / 2)
    const px = cx + col * (7 + row * 5.4) * sc
    ctx.strokeStyle = '#6B7280'; ctx.lineWidth = 1.5 * sc; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(px, magnetBot + 2 * sc); ctx.lineTo(px, magnetBot + 12 * sc); ctx.stroke()
    ctx.fillStyle = '#94A3B8'
    ctx.beginPath(); ctx.arc(px, magnetBot + 13.4 * sc, 2.1 * sc, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#5B6470'; ctx.lineWidth = 0.6 * sc
    ctx.beginPath(); ctx.arc(px, magnetBot + 13.4 * sc, 2.1 * sc, 0, Math.PI * 2); ctx.stroke()
  }
  ctx.lineCap = 'butt'
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
