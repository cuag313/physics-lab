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
 *                        控制变量法：① 改滑片 ⇒ I 变（线圈固定 10 匝）② 抽/插软铁芯 ⇒ μ 变
 *                        磁性强弱 = N·I·μ，用「吸住大头针的枚数」读数（转换法）
 *   Tab2 🔧 自己动手 —— 与简单电路同一套 1:1 SVG 器材（9 件基础器材 + 本专题专用「电磁铁」）+
 *                        一键透视内部结构 + 实验记录表（都在 BuilderSVG 里）
 */

/** 器材栏缩略图：与桌面器材同源 */
function thumb(type) {
  const t = TYPES[type]
  if (!t) return null
  let svg = t.render(
    { id: `pal-${type}`, closed: true, showRead: false, f: 0.4, turns: 10, core: true },
    { bright: 0.55, frac: 0.35, I: 0, f: 0.4, rays: false, pins: 3 }
  )
  /* 电磁铁是竖高的器材，按通用 40×24 缩略框会看不清 → 单独给到 42×40 */
  if (type === 'electromagnet') svg = svg.replace('<svg width="210" height="200"', '<svg style="width:42px;height:40px"')
  return <span dangerouslySetInnerHTML={{ __html: svg }} />
}

const RHEO_MAX = 20          // 20Ω 2A 滑动变阻器
const TURNS = 10             // 本实验固定 10 匝（线圈画满 10 圈，学生可以直接数圈）
const R_PER_TURN = 0.12      // 每匝线圈电阻 Ω
const CORE_MU = 0.25         // 无铁芯时的磁性倍率
const PIN_K = 1.2            // 1.2 N·A ≈ 能吸住 1 枚大头针
const PIN_MAX = 15           // 显示上限
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
    core: true,             // 软铁芯是否插在线圈里
    records: [],            // [{ i, n, core, rr, pins }]
    wireColor: '#F44336',
    dragging: false,
    cardScroll: 0,
    cardDrag: null,
    needle: { ang: Math.PI, vel: 0 },  // 两端小磁针的指针（π = N 朝左，断开位；通电后转到 0 = N 朝右）
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
      // 小磁针：通电且有铁芯时受磁场作用转到"异名磁极相吸"的方向（阻尼摆动）
      // 铁芯左端 S、右端 N ⇒ 两端磁针的 N 极都被拉向右：左端 N 被 S 吸、右端 S 被 N 吸 → 都转到 0（N 朝右）
      const tgt = (s.switchClosed && s.core) ? 0 : Math.PI
      const nd = s.needle
      nd.vel += (tgt - nd.ang) * 0.055
      nd.vel *= 0.885
      nd.ang += nd.vel
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
    const turns = TURNS
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
    const gap = 118 * scale         // 电磁铁横躺后的占位半宽（导线接在线圈两端、绕开小磁针）
    const eg = emGeom(emX, y1, scale, sol.turns)

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
    // 电磁铁：导线接到线圈下方（两根引线竖直落到干线，同手绘图）
    drawLine(ctx, battX + hBat, y1, eg.lp.x, y1, wc, lw)
    drawLine(ctx, eg.lp.x, y1, eg.lp.x, eg.lp.y, wc, lw)
    drawLine(ctx, eg.rp.x, y1, eg.rp.x, eg.rp.y, wc, lw)
    drawLine(ctx, eg.rp.x, y1, swX - hSw, y1, wc, lw)
    drawLine(ctx, swX + hSw, y1, x1, y1, wc, lw)

    // ─── 符号 ───
    const geo = symRheostat(ctx, rheoX, y0, { scale, ratio: s.ratio, ink })
    symMeter(ctx, amX, y0, { kind: 'A', scale, ink })
    symBattery(ctx, battX, y1, { n: 2, scale, ink, flip: true })
    symSwitch(ctx, swX, y1, { closed: on, scale, ink })

    // ─── 电磁铁 ───
    drawEM(ctx, emX, y1, {
      scale, turns: sol.turns, I: sol.I, pins: sol.pins,
      core: s.core, on, time: s.time, needle: s.needle, gap,
    })

    // 电子流动：从电源 + 极出发，绕一圈回到 − 极（穿过线圈的一段隐藏：电流在线圈里绕圈）
    if (on) {
      const path = [
        { x: battX + hBat, y: y1 },
        { x: eg.lp.x, y: y1 },
        eg.lp,
        eg.rp,
        { x: eg.rp.x, y: y1 },
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
      // 隐藏区覆盖「两根引线之间 + 线圈本体 + 两引线落点之间的横段」，电子进了线圈就消失、从另一端出来
      drawCurrentFlow(ctx, path, s.time, 0.5, {
        x: eg.lp.x, y: eg.cT - 2, w: eg.rp.x - eg.lp.x, h: (eg.lp.y + 8) - (eg.cT - 2),
      })
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

    // ─── 铁芯按钮 + 记录按钮（单行；匝数固定 10 匝，不再给切换按钮）───
    const chipFont = Math.max(10, Math.round(12 * scale))
    const bh = 28 * scale
    const bY = y1 + 40 * scale
    const b2Y = bY
    const turnBtns = []
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
      closed: on, ratio: s.ratio, turns: sol.turns, core: s.core,
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
      const txt = scale < 0.95
        ? `⚠ 超量程 0～${CFG.AMM_FS} A：滑片右移`
        : `⚠ 超量程（0～${CFG.AMM_FS} A）—— 把滑片右移减小电流`
      let fs2 = labelFont
      ctx.font = `bold ${fs2}px sans-serif`
      while (ctx.measureText(txt).width > loopW + 36 && fs2 > 8.5) {
        fs2 -= 0.5; ctx.font = `bold ${fs2}px sans-serif`
      }
      ctx.fillStyle = '#DC2626'; ctx.textAlign = 'center'
      ctx.fillText(txt, x0 + loopW / 2, y0 + 36 * scale)
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
      // 匝数固定 10 匝，可比的一对只剩「同 N 不同 I」和「同 N、I 不同铁芯」
      const a = records[0], last = records[records.length - 1]
      if (last.n === a.n && Math.abs(last.i - a.i) > 0.05 && a.core === last.core) {
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
      rows.push([['点「📋 记录一组数据」，记下匝数、电流、铁芯、吸住的针数。']])
    }

    return [
      {
        t: '实验目的', c: '#E0761F',
        items: [
          [['探究电磁铁的'], ['磁性强弱', '#C2410C', 1], ['与哪些因素有关，得出 '], ['磁性 ∝ 匝数 N × 电流 I × 铁芯', '#DC2626', 1], ['。']],
          [['学会用'], ['转换法', '#15803D', 1], ['：磁性看不见，用「'], ['吸住大头针的枚数', '#C2410C', 1], ['」来比较磁性强弱。']],
          [['学会用'], ['控制变量法', '#15803D', 1], ['：研究一个因素时，其余因素必须保持不变（本实验线圈固定 10 匝，只改电流或插拔铁芯）。']],
        ],
      },
      {
        t: '实验器材', c: '#C98A12',
        items: [
          [['干电池组（3 V）、开关、'], ['电流表', '#C2410C', 1], ['、'], ['滑动变阻器（20 Ω 2 A）', '#EA8C1B', 1], ['、导线若干。']],
          [[''], ['电磁铁', '#EA8C1B', 1], ['：一个'], ['10 匝线圈', '#EA8C1B', 1], ['（线一圈一圈绕满 10 圈，可以数）+ 一根'], ['软铁芯', '#EA8C1B', 1], ['。']],
          [[''], ['大头针', '#C2410C', 1], ['（或小铁钉）一盒 —— 用来"读"磁性强弱。']],
        ],
      },
      {
        t: '实验步骤', c: '#CA8A04',
        items: [
          [['① 按图连线：电源、开关、'], ['电流表（串联）', '#15803D', 1], ['、滑动变阻器、电磁铁线圈串成一个回路，闭合前滑片在'], ['阻值最大处', '#DC2626', 1], ['。']],
          [['② 把铁芯'], ['插入线圈', '#15803D', 1], ['，闭合开关，读出电流 I，把电磁铁下端靠近大头针，数'], ['吸住几枚', '#C2410C', 1], ['。']],
          [['③ 保持'], ['匝数、铁芯不变', '#DC2626', 1], ['，移动滑片改变电流，重做 2～3 次 ⇒ 看磁性怎样随电流变。']],
          [['④ 保持'], ['匝数、电流不变', '#DC2626', 1], ['，'], ['抽出铁芯', '#DC2626', 1], ['重做 ⇒ 看磁性怎样变。断开开关，整理器材。']],
        ],
      },
      {
        t: '电路与接法', c: '#C2410C',
        items: [
          [['电流表'], ['串联', '#15803D', 1], ['在回路里（'], ['+ 柱进、− 柱出', '#DC2626', 1], ['），本实验约 0.2～0.5 A，用 0～0.6 A 档。']],
          [['滑动变阻器接法「'], ['一上一下', '#15803D', 1], ['」串入电路：既改变电流，又起保护作用。']],
          [['本实验线圈'], ['固定 10 匝', '#C2410C', 1], ['（0.12 Ω/匝 ≈ 1.2 Ω）；线圈匝数越多电阻越大，因此真实器材换匝数后电流会变，要重新调滑片。']],
          [['线圈的两个接线柱接到电路里；'], ['铁芯插在线圈中间', '#DC2626', 1], ['，插拔时先断开开关。']],
        ],
      },
      {
        t: '为什么磁性 ∝ N·I', c: '#B45309',
        items: [
          [['通电导线周围有磁场；把导线绕成'], ['线圈', '#15803D', 1], ['，每一匝的磁场叠加，'], ['匝数越多磁场越强', '#C2410C', 1], ['。']],
          [['电流越大，磁场越强：'], ['磁性 ∝ I', '#15803D', 1], ['（同一个线圈，电流加倍 → 磁性约加倍）。']],
          [['插入'], ['软铁芯', '#15803D', 1], ['后铁芯被磁化，磁性可增大'], ['几倍到十几倍', '#DC2626', 1], ['；抽出铁芯磁性骤减；两端放小磁针可判磁极。']],
          [['磁性 ∝ N × I × μ', '#DC2626', 1], ['；绕向定磁极：电流从 '], ['右端接线柱流入线圈', '#C2410C', 1], ['，右手四指顺电流环绕握住线圈，拇指指向'], ['右端 = N 极', '#C2410C', 1], ['（左端为 S 极）。']],
          [['磁力线走向：'], ['外部由 N 极出发回到 S 极', '#15803D', 1], ['（图中绕铁芯两端的虚线），'], ['铁芯内部由 S 极指向 N 极', '#7C3AED', 1], ['（图中铁芯里的虚线箭头，向右）。']],
          [['小磁针怎么转：接通的瞬间磁针转动，磁针 S 极被吸向电磁铁 N 极（'], ['异名磁极相吸', '#C2410C', 1], ['）。']],
        ],
      },
      { t: '本次测量记录', c: '#15803D', items: rows },
      {
        t: '注意事项', c: '#DC2626',
        items: [
          [['连线、插拔铁芯时开关必须'], ['断开', '#DC2626', 1], ['；闭合前滑片在'], ['阻值最大处', '#DC2626', 1], ['。']],
          [['通电时间不宜过长 —— 线圈'], ['发热会烧坏漆包线', '#DC2626', 1], ['，也不要用大电流长时间通电。']],
          [['电表'], ['正负柱不能接反', '#DC2626', 1], ['、量程不能超；先试触再闭合。']],
          [['比较磁性大小时，'], ['只改变一个因素', '#DC2626', 1], ['，其余必须相同（本实验匝数固定，只改电流或插拔铁芯）。']],
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
    S.current.needle = { ang: Math.PI, vel: 0 }
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
            电路演示：改变电流 / 插拔铁芯 · 吸住大头针数就是磁性强弱
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
            purpose="探究电磁铁的磁性强弱与电流大小、铁芯有无的关系（线圈固定 10 匝）。"
            steps={[
              '滑片先放阻值最大处，再点开关闭合',
              '看电磁铁两端标注的 N / S 和铁芯上的磁力线',
              '看电磁铁下端吸住几枚大头针',
              '移动滑片改变电流，看针数变化',
              '点「铁芯」按钮抽插铁芯，再看针数变化',
              '点「记录一组数据」，凑齐几组不同条件做对照',
            ]}
            hint="磁性 ∝ N × I × μ：本实验线圈固定 10 匝，只改电流或插拔铁芯。"
          />
        ) : (
          <InfoDock
            align="left"
            offset={{ left: 26, top: 26 }}
            hint="点右侧器材加入 → 拖拽移动 → 点接线柱连线。轻点开关通断，双击电表看读数；双击电磁铁插/抽铁芯，双击其它器材或按 Delete 删除。"
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

/* ── 电磁铁（横躺）：软铁芯水平穿过密绕线圈，磁极在铁芯两端 ── */
function drawEM(ctx, cx, baseY, o) {
  const { scale, turns, I, pins, core, on, time, needle } = o
  const sc = scale
  const g = emGeom(cx, baseY, sc, turns)
  const { cy, coreLen, coreH, coilW, coilH, cL, cR, cT, cB } = g
  const hot = on ? Math.min(1, Math.max(0, I) / 0.6) : 0
  const lift = core ? 0 : 64 * sc            // 抽出：铁芯整体抬到线圈上方
  const ccy = cy - lift
  const coreBody = core ? '#A8B3BE' : '#CFD6DE'
  const coreLine = core ? '#78838F' : '#AAB5C0'
  const wire = on
    ? `rgb(${Math.round(198 + 38 * hot)},${Math.round(124 + 32 * hot)},${Math.round(54 - 14 * hot)})`
    : '#C08434'

  // ── 软铁芯：一根水平圆柱（两端不收缩、不画端面圆）
  const yT = cy - coreH / 2, yB = cy + coreH / 2
  ctx.fillStyle = coreBody; ctx.strokeStyle = coreLine; ctx.lineWidth = 1.1 * sc
  ctx.beginPath(); ctx.roundRect(cx - coreLen / 2, ccy - coreH / 2, coreLen, coreH, coreH / 2); ctx.fill(); ctx.stroke()
  ctx.fillStyle = 'rgba(240,246,252,0.48)'
  ctx.beginPath(); ctx.roundRect(cx - coreLen / 2 + 9 * sc, ccy - coreH / 2 + 4 * sc, coreLen - 18 * sc, 3.6 * sc, 1.8 * sc); ctx.fill()

  // ── 铁芯内部的磁力线（S → N，画在铁芯之上、线圈之下：圈间缝隙里能看到）
  if (on && core) {
    const ph = 0.5 + 0.5 * Math.sin(time * 2.2)
    const al = 0.34 + 0.20 * ph * (0.4 + hot)
    const mx0 = cx - coreLen / 2 + 7 * sc, mx1 = cx + coreLen / 2 - 7 * sc
    ctx.strokeStyle = `rgba(37,99,235,${al.toFixed(2)})`
    ctx.lineWidth = 1.15 * sc
    ctx.setLineDash([3.2 * sc, 2.8 * sc])
    for (const k of [-1, 0, 1]) {
      const yy = ccy + k * coreH * 0.24
      ctx.beginPath(); ctx.moveTo(mx1, yy); ctx.lineTo(mx0, yy); ctx.stroke()
    }
    ctx.setLineDash([])
    // 中轴上的箭头：内部磁力线由 S 极指向 N 极，即左 → 右
    ctx.fillStyle = `rgba(37,99,235,${Math.min(0.9, al + 0.28).toFixed(2)})`
    for (const ax of [cx - 26 * sc, cx + 20 * sc]) {
      ctx.beginPath()
      ctx.moveTo(ax + 3.0 * sc, ccy)
      ctx.lineTo(ax - 3.0 * sc, ccy - 2.9 * sc)
      ctx.lineTo(ax - 3.0 * sc, ccy + 2.9 * sc)
      ctx.closePath(); ctx.fill()
    }
  }

  // ── 线圈：一条**连续螺旋线**的侧视投影（正弦波）
  //    前面（cos>0）可见；背面（cos<0）且落在铁芯轮廓内（|sin| < r/R）的那段被铁芯挡住 → 断开不画
  const loops = g.loops
  const gapX = coilW / loops              // 每圈轴向长度 = 正弦的一个周期
  const Rcoil = coreH / 2 + 3 * sc        // 线圈半径（比铁芯粗一圈）
  const rCore = coreH / 2                 // 铁芯半径
  // ↓ 左端起笔：x=cL 落在铁芯**上沿**、正在由背面转入前面（sin=+r/R 递增，cos>0）
  //   右端收在上沿（转入背面处），最右边不会冒出铁芯上方的尖角或下方的圆弧
  //   两端引线都只画"铁芯下沿以外"的可见段 —— 穿过铁芯的那截被挡住，直接不画
  const kRatio = rCore / Rcoil
  const phase0 = Math.asin(kRatio)
  const xEnd = cL + gapX * (loops - 0.5 - Math.asin(kRatio) / Math.PI)   // 收在铁芯上沿（转入背面处）
  ctx.strokeStyle = wire; ctx.lineWidth = 2.9 * sc; ctx.lineCap = 'round'
  ctx.beginPath()
  let pen = false
  for (let x = cL; x <= xEnd + 0.01; x += 0.6) {
    const th = (2 * Math.PI * (x - cL)) / gapX + phase0
    const sy = Math.sin(th), cz = Math.cos(th)
    const yy = cy - Rcoil * sy
    const hidden = cz < 0 && Math.abs(sy) < kRatio
    if (hidden) { pen = false; continue }
    if (!pen) { ctx.moveTo(x, yy); pen = true } else { ctx.lineTo(x, yy) }
  }
  ctx.stroke()
  ctx.lineCap = 'butt'
  // 两根引线：右引线只画"铁芯下沿以外"的可见部分（穿过铁芯那截被挡住，不画）；
  // 左引线保持手绘稿的走法 —— 从上沿一路斜穿铁芯接干线
  ctx.strokeStyle = wire; ctx.lineWidth = 2.6 * sc
  const leadFrom = (x0, y0, x1, y1) => {
    const yBot = cy + rCore
    const t = (yBot - y0) / (y1 - y0)
    const xb = x0 + (x1 - x0) * t
    ctx.beginPath(); ctx.moveTo(xb, yBot); ctx.lineTo(x1, y1); ctx.stroke()
  }
  ctx.beginPath(); ctx.moveTo(cL, cy - rCore); ctx.lineTo(g.lp.x, g.lp.y); ctx.stroke()
  leadFrom(xEnd, cy - rCore, g.rp.x, g.rp.y)

  // ── 磁极标记：铁芯以上、两端各一个（右手螺旋：电流从右端入线圈 ⇒ 右 N 红、左 S 蓝）
  if (on && core) {
    const fz = Math.max(11, Math.round(13 * sc))
    const px = coreLen / 2 - 7 * sc
    ctx.font = `bold ${fz}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillStyle = '#2563EB'; ctx.fillText('S', cx - px, ccy - coreH / 2 - 9 * sc)
    ctx.fillStyle = '#DC2626'; ctx.fillText('N', cx + px, ccy - coreH / 2 - 9 * sc)
  }

  // ── 磁感线：两端环绕（通电 + 插着铁芯；抽芯后磁性骤减不再画）
  if (on && core) {
    const ph = 0.5 + 0.5 * Math.sin(time * 2.2)
    ctx.strokeStyle = `rgba(37,99,235,${0.24 + 0.18 * ph * (0.4 + hot)})`
    ctx.lineWidth = 1.2 * sc
    ctx.setLineDash([3.5 * sc, 3 * sc])
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        ctx.beginPath()
        ctx.ellipse(cx + s * (coreLen / 2 + 0.5 * sc), ccy, (5.2 + k * 1.4) * sc, (22 + k * 9) * sc, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
    ctx.setLineDash([])
  }

  // ── 抽出铁芯的提示（此时不标磁极）
  if (!core) {
    ctx.fillStyle = '#DC2626'; ctx.font = `bold ${Math.max(8, Math.round(10 * sc))}px sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('铁芯已抽出（磁性骤减）', cx, ccy - coreH / 2 - 10 * sc)
  }

  // ── 大头针：吸在铁芯一端（磁极处磁性最强）下方散开
  if (pins > 0) {
    const pinX = cx - (coreLen / 2 - 6 * sc)
    const pinY0 = core ? cy + coreH / 2 : cy + coilH / 2 - 2 * sc
    const gPin = Math.min(4.0, 42 / Math.max(1, pins - 1)) * sc
    for (let i = 0; i < pins; i++) {
      const off = (i - (pins - 1) / 2) * gPin
      const y2 = pinY0 + (11 + Math.abs(off) / sc * 0.30) * sc
      ctx.strokeStyle = '#6B7280'; ctx.lineWidth = 1.4 * sc; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(pinX + off * 0.18, pinY0 + 1 * sc); ctx.lineTo(pinX + off, y2); ctx.stroke()
      ctx.fillStyle = '#94A3B8'
      ctx.beginPath(); ctx.arc(pinX + off, y2 + 1.4 * sc, 1.9 * sc, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#5B6470'; ctx.lineWidth = 0.55 * sc
      ctx.beginPath(); ctx.arc(pinX + off, y2 + 1.4 * sc, 1.9 * sc, 0, Math.PI * 2); ctx.stroke()
    }
    ctx.lineCap = 'butt'
  }

  // ── 铁芯两端的小磁针：断开时 N 朝左（地磁北），通电后按异名磁极相吸都转到 N 朝右
  for (const n of [g.nL, g.nR]) {
    const r = g.nr
    ctx.fillStyle = 'rgba(252,249,241,0.94)'
    ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#B9B0A0'; ctx.lineWidth = 1.2 * sc
    ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = 'rgba(185,176,160,0.55)'; ctx.lineWidth = 0.8 * sc
    ctx.beginPath(); ctx.arc(n.x, n.y, r - 2.4 * sc, 0, Math.PI * 2); ctx.stroke()
    ctx.save(); ctx.translate(n.x, n.y); ctx.rotate(needle ? needle.ang : 0)
    const L = r - 3.2 * sc, W = 1.9 * sc
    ctx.beginPath(); ctx.moveTo(L, 0); ctx.lineTo(0, -W); ctx.lineTo(0, 0); ctx.closePath()
    ctx.fillStyle = '#DC2626'; ctx.fill()
    ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(0, W); ctx.lineTo(0, 0); ctx.closePath()
    ctx.fillStyle = '#2563EB'; ctx.fill()
    ctx.restore()
    ctx.fillStyle = '#6B7280'
    ctx.beginPath(); ctx.arc(n.x, n.y, 1.5 * sc, 0, Math.PI * 2); ctx.fill()
  }

  ctx.textBaseline = 'alphabetic'
}

// ─── 画辅助 ───
function drawLine(ctx, x1, y1, x2, y2, color, w) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
}

/** 电子流动（黄点）；skipRect 内的点不画（穿线圈那一段不出现） */
function drawCurrentFlow(ctx, points, time, speed, skipRect) {
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
        const px = seg.x + (seg.ex - seg.x) * r, py = seg.y + (seg.ey - seg.y) * r
        if (skipRect && px > skipRect.x && px < skipRect.x + skipRect.w
          && py > skipRect.y && py < skipRect.y + skipRect.h) break
        ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill()
        break
      }
      pos -= seg.len
    }
  }
}

/** 电磁铁（横躺 "裸绕" 螺线管）的几何：drawEM 与导线/电子路径共用，保证接线口对得上 */
function emGeom(cx, baseY, sc, turns) {
  const cy = baseY - 66 * sc
  const coreLen = 160 * sc, coreH = 26 * sc
  const coilW = 132 * sc                 // 固定 10 圈，每圈之间留缝隙能看到铁芯
  const coilH = 44 * sc
  const cL = cx - coilW / 2, cR = cx + coilW / 2
  const cT = cy - coilH / 2, cB = cy + coilH / 2
  const loops = 10                       // 线圈圈数 = 匝数，学生能一圈一圈数出来
  const gapX = coilW / loops
  const Rcoil = coreH / 2 + 3 * sc
  const rCore = coreH / 2
  const xEnd = cL + gapX * (loops - 0.5 - Math.asin(rCore / Rcoil) / Math.PI)
  return {
    cy, coreLen, coreH, coilW, coilH, cL, cR, cT, cB, loops, gapX, Rcoil, xEnd,
    lp: { x: cL - 8 * sc, y: cy + Rcoil + 12 * sc },   // 左引线：从上沿收笔处斜下穿过铁芯 → 落点
    rp: { x: xEnd + 8 * sc, y: cy + Rcoil + 12 * sc }, // 右引线：从下沿收笔处直接向下 → 落点
    nL: { x: cx - (coreLen / 2 + 21 * sc), y: cy },  // 左端小磁针
    nR: { x: cx + (coreLen / 2 + 21 * sc), y: cy },  // 右端小磁针
    nr: 13.5 * sc,
  }
}
