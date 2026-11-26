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
import { symBattery, symSwitch, symResistor, symRheostat, symMeter, symHalf, SYM_INK } from '../render/symbols.js'

/**
 * VoltAmpereMethodHSScene — 高中：伏安法测电阻（电流表内接 / 外接）
 *
 *   Tab1 📖 电路演示 —— 暖色底 + 标准符号回路；一枚药丸切换「电流表外接 / 内接」，
 *                        对比两套接法的 U测、I测、R测 与系统误差方向：
 *                          外接：电压表测 Rx 电压准，电流表测 Ix+Iv 偏大 → R测 偏小
 *                          内接：电流表测 Ix 准，电压表测 Ux+UA 偏大 → R测 偏大
 *                        可调待测电阻 Rx、滑变限流；记录多组数据对比。
 *   Tab2 🔧 自己动手 —— 与简单电路同一套 1:1 SVG 器材（同一器材栏 9 件 + 三色导线）+
 *                        一键透视内部结构 + 实验记录表（都在 BuilderSVG 里）。
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

const RHEO_MAX = 20          // 20Ω 2A 滑动变阻器（限流）
const RX_SET = [5, 10, 20, 50, 100] // 待测电阻可选档位
const MAX_REC = 3            // 最多记 3 组
const RA = CFG.AMM_R         // 电流表内阻（Ω）
const RV = 2000              // 电压表内阻（Ω，取教学演示量级使外接分流误差可见）

/** 按接法计算测量值（含系统误差）。外接：I 偏大；内接：U 偏大。 */
function solve(s) {
  const Rr = Math.round(s.ratio * RHEO_MAX * 10) / 10
  const Rx = RX_SET[s.rIdx]
  const U0 = CFG.VS.V
  const on = s.switchClosed
  if (!on) return { Rr, Rx, U0, I: 0, Umeas: 0, Rmeas: 0, err: 0, mode: s.mode }

  if (s.mode === 'outer') {
    // 外接：Rx 与 RV 并联，再与 Rr、RA 串联；电压表读数 = 并联端电压
    const Rpar = (Rx * RV) / (Rx + RV)
    const I = U0 / (Rr + RA + Rpar)          // 电流表读数（Ix+Iv，偏大）
    const Umeas = I * Rpar                    // 电压表读数（Rx 两端电压，准）
    const Rmeas = Umeas / I
    const err = ((Rmeas - Rx) / Rx) * 100
    return { Rr, Rx, U0, I, Umeas, Rmeas, err, mode: s.mode }
  }
  // 内接：Rx 与 RA 串联，再与 Rr 串联；电压表并在 Rx+A 两端
  const I = U0 / (Rr + RA + Rx)              // 电流表读数（Ix，准）
  const Umeas = I * (Rx + RA)                 // 电压表读数（Ux+UA，偏大）
  const Rmeas = Umeas / I
  const err = ((Rmeas - Rx) / Rx) * 100
  return { Rr, Rx, U0, I, Umeas, Rmeas, err, mode: s.mode }
}

export default function VoltAmpereMethodHSScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const builderRef = useRef(null)

  const S = useRef({
    tab: 1,
    mode: 'outer',          // outer = 电流表外接；inner = 电流表内接
    switchClosed: false,
    time: 0,
    ratio: 1,              // 滑片位置：1 = 阻值最大（右端）
    rIdx: 1,               // 待测电阻档位下标（RX_SET[1] = 10Ω）
    records: [],            // [{ mode, rx, u, i, r }]
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
    const loop = () => { S.current.time += 1 / 60; render(R); animRef.current = requestAnimationFrame(loop) }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

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
    const sol = solve(s)
    const lay = fitLayout(W, H)

    /* ── 知识卡片（与简单电路同一套几何）── */
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
    // 回路下方需放：接法药丸、Rx 档位条、记录按钮、误差文字（三行控件 + 一行说明），
    // 按总高反解最大可行回路宽，避免下方控件与回路器件标注挤压重叠。
    const chipUp = 62 * scaleOf(420)
    const chipDn = 150 * scaleOf(420)
    const fits = (wCand) => {
      return wCand * 0.52 + chipUp + chipDn + 6 <= areaH
    }
    let loW = 180, hiW = Math.min(areaW * 0.74, 540)
    for (let i = 0; i < 14; i++) {
      const midW = (loW + hiW) / 2
      if (fits(midW)) loW = midW; else hiW = midW
    }
    const loopW = Math.max(180, loW)
    const scale = scaleOf(loopW)
    const loopH = loopW * 0.52
    const x0 = left + (areaW - loopW) / 2
    const y0 = top + Math.max(chipUp + 2, (areaH - (loopH + chipUp + chipDn)) / 2) + chipUp
    const x1 = x0 + loopW, y1 = y0 + loopH
    const midY = y0 + loopH / 2

    // 上边：滑变（左）、电流表（右）；右边宽边：待测电阻；下边：电源、开关
    const rheoX = x0 + loopW * 0.30
    const amX = x0 + loopW * 0.74
    const battX = x0 + loopW * 0.22
    const swX = x0 + loopW * 0.66
    const rxCY = midY                                    // 待测电阻挂在右竖支路中部

    const wc = on ? '#1565C0' : '#9aa7b1'
    const ink = on ? SYM_INK : '#7c8a93'
    const lw = 2 * scale + 0.6

    const hRheo = symHalf('rheostat', scale)
    const hMeter = symHalf('meter', scale)
    const hRes = 42 * scale / 2                          // R_x 竖放：沿竖直导线半长（长边）
    const hBat = symHalf('battery', scale, 2)
    const hSw = symHalf('switch', scale)

    // ─── 导线（符号处留缺口）───
    drawLine(ctx, x0, y0, rheoX - hRheo, y0, wc, lw)
    drawLine(ctx, rheoX + hRheo, y0, amX - hMeter, y0, wc, lw)
    drawLine(ctx, amX + hMeter, y0, x1, y0, wc, lw)
    drawLine(ctx, x1, y0, x1, rxCY - hRes, wc, lw)       // 右竖边：上半段到 R_x
    drawLine(ctx, x1, rxCY + hRes, x1, y1, wc, lw)       // 右竖边：R_x 下半段到下角
    drawLine(ctx, x0, y0, x0, y1, wc, lw)
    drawLine(ctx, x0, y1, battX - hBat, y1, wc, lw)
    drawLine(ctx, battX + hBat, y1, swX - hSw, y1, wc, lw)
    drawLine(ctx, swX + hSw, y1, x1, y1, wc, lw)

    // 电压表接法（严格按手绘：V 支路竖直，从上横线到下横线，V 圆在支路中部）
    //  外接：V 竖线在 R_x 左侧，上接点接 R_x 上端（A 在 V 测量范围之外 → 在外）；
    //  内接：V 竖线整体左移到 A 左端节点正下方，把 A 圈进 V 的测量范围 → 在内；下接点接下横线。
    const volR = 13 * scale
    const vOuterX = x1 - 34 * scale                        // 外接 V 支路 x（R_x 左侧）
    const vInnerX = amX - hMeter                             // 内接 V 支路 x（A 左端节点）
    const vX = s.mode === 'outer' ? vOuterX : vInnerX
    ctx.save()
    ctx.strokeStyle = on ? '#7CB342' : '#9aa7b1'
    ctx.lineWidth = 1.6 * scale + 0.4
    ctx.beginPath()
    // 竖直支路：上横线 → 下横线（V 圆压在中部）
    ctx.moveTo(vX, y0); ctx.lineTo(vX, y1)
    // 下接点：支路下端 → 下横线右端（R_x 下端）
    ctx.moveTo(vX, y1); ctx.lineTo(x1, y1)
    ctx.stroke()
    ctx.restore()

    // ─── 符号 ───
    const geo = symRheostat(ctx, rheoX, y0, { scale, ratio: s.ratio, ink })
    symMeter(ctx, amX, y0, { kind: 'A', scale, ink })
    symResistor(ctx, x1, rxCY, { scale, ink, axis: 'v' })
    symMeter(ctx, vX, rxCY, { kind: 'V', scale, ink: on ? '#558B2F' : ink })
    symBattery(ctx, battX, y1, { n: 2, scale, ink, flip: true })
    symSwitch(ctx, swX, y1, { closed: on, scale, ink })

    // 电子流动
    if (on) {
      const path = [
        { x: battX + hBat, y: y1 }, { x: swX - hSw, y: y1 },
        { x: swX + hSw, y: y1 }, { x: x1, y: y1 },
        { x: x1, y: rxCY + hRes }, { x: x1, y: rxCY - hRes },
        { x: x1, y: y0 },
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
    // 滑片可点 / 可拖
    const sliderArea = { x: rheoX - hRheo, y: y0 - 26 * scale, w: hRheo * 2, h: 44 * scale }
    const slideTo = (mx) => {
      const r = Math.max(0, Math.min(1, (mx - (rheoX - hRheo)) / (hRheo * 2)))
      S.current.ratio = Math.round(r * 20) / 20
      forceUpdate(n => n + 1)
    }
    canvasRef.current._clickAreas.push({ ...sliderArea, onClick: slideTo, onDrag: slideTo })
    canvasRef.current._sliderArea = sliderArea

    // ─── 回路下方：左列垂直堆叠（接法药丸 → Rx 档位条 → 记录按钮 → 误差说明）───
    const belowY = y1 + 46 * scale
    const colW = Math.min(230 * scale, loopW * 0.62)
    const rowH = 30 * scale, rowGap = 35 * scale

    // 接法切换药丸（外接 / 内接）
    const pillW = colW, pillH = rowH
    const pillX = x0, pillY = belowY
    const halfW = pillW / 2
    const pills = [
      { key: 'outer', label: '电流表外接' },
      { key: 'inner', label: '电流表内接' },
    ]
    ctx.save()
    ctx.fillStyle = '#F5F0E8'; ctx.strokeStyle = '#D8CBB8'; ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.roundRect(pillX, pillY, pillW, pillH, pillH / 2); ctx.fill(); ctx.stroke()
    pills.forEach((p, i) => {
      const px = pillX + i * halfW
      const active = s.mode === p.key
      if (active) {
        ctx.fillStyle = '#E0761F'
        ctx.beginPath(); ctx.roundRect(px + 3, pillY + 3, halfW - 6, pillH - 6, pillH / 2 - 3); ctx.fill()
      }
      ctx.fillStyle = active ? '#fff' : '#8A7A64'
      ctx.font = `bold ${Math.max(10, Math.round(12 * scale))}px "Microsoft YaHei", sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(p.label, px + halfW / 2, pillY + pillH / 2)
    })
    ctx.restore()
    canvasRef.current._clickAreas.push({
      x: pillX, y: pillY, w: pillW, h: pillH,
      onClick: () => {
        S.current.mode = s.mode === 'outer' ? 'inner' : 'outer'
        forceUpdate(n => n + 1)
      },
    })

    // 待测电阻档位切换
    const rxW = colW, rxH = rowH
    const rxX0 = x0, rxY = belowY + rowGap
    ctx.save()
    ctx.font = `${Math.max(10, Math.round(11 * scale))}px sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    RX_SET.forEach((r, i) => {
      const bw = rxW / RX_SET.length
      const bx = rxX0 + i * bw
      const active = s.rIdx === i
      ctx.fillStyle = active ? '#1565C0' : '#EAF1F5'
      ctx.beginPath(); ctx.roundRect(bx + 3, rxY + 3, bw - 6, rxH - 6, 6); ctx.fill()
      ctx.fillStyle = active ? '#fff' : '#5D7079'
      ctx.fillText(`${r}Ω`, bx + bw / 2, rxY + rxH / 2)
    })
    ctx.restore()
    canvasRef.current._clickAreas.push({
      x: rxX0, y: rxY, w: rxW, h: rxH,
      onClick: (mx) => {
        const bw = rxW / RX_SET.length
        const i = Math.max(0, Math.min(RX_SET.length - 1, Math.floor((mx - rxX0) / bw)))
        S.current.rIdx = i
        forceUpdate(n => n + 1)
      },
    })

    // 记录按钮
    const recW = colW, recH = rowH
    const recX = x0, recY = belowY + rowGap * 2
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
      recX + recW / 2, recY + recH / 2
    )
    ctx.restore()
    if (recActive) {
      canvasRef.current._clickAreas.push({
        x: recX, y: recY, w: recW, h: recH,
        onClick: () => {
          const cur = solve(s)
          if (cur.I <= 0.005) return
          S.current.records.push({ mode: cur.mode, rx: cur.Rx, u: cur.Umeas, i: cur.I, r: cur.Rmeas })
          forceUpdate(n => n + 1)
        },
      })
    }

    // 调试/验收钩子
    canvasRef.current._dbg = {
      swX, swY: y1, rheoX, rheoY: y0, hRheo, hSw, rxCY, recX: recX + recW / 2, recY: recY + recH / 2, scale,
      mode: s.mode, Rmeas: sol.Rmeas, err: sol.err,
    }

    // ─── 标注 ───
    const labelFont = Math.max(9, Math.round(11 * scale))
    ctx.fillStyle = '#667'; ctx.font = `${labelFont}px sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('电源', battX, y1 + 26 * scale)
    ctx.fillText(on ? '开关（闭合）' : '开关（断开）', swX, y1 + 26 * scale)
    ctx.textAlign = 'right'
    ctx.fillText(`R_x = ${sol.Rx} Ω`, x1 - 4, rxCY + hRes + 12 * scale)
    ctx.textAlign = 'center'
    ctx.fillText('电流表 A（串联）', amX, y0 - 34 * scale)
    ctx.fillText(`滑动变阻器  R₁ = ${sol.Rr.toFixed(1)} Ω（0～20 Ω）`, rheoX, y0 + 20 * scale)
    ctx.fillText(s.mode === 'outer' ? 'V 并在 R_x 两端' : 'V 并在 R_x+A 两端', vX, rxCY - volR - 14 * scale)
    ctx.textAlign = 'left'
    ctx.fillText(`V 表：${sol.Umeas.toFixed(2)} V`, vX - volR - 70, rxCY - 5 * scale)
    ctx.textAlign = 'center'
    ctx.fillText(`A 表：${sol.I.toFixed(3)} A`, amX, y0 + 20 * scale)

    // 误差方向标注（记录按钮下方，左列对齐）
    ctx.fillStyle = '#B08954'; ctx.font = `${labelFont}px sans-serif`
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    const errNote = s.mode === 'outer'
      ? '外接：I 偏大 → R测 偏小（电压表分流）'
      : '内接：U 偏大 → R测 偏大（电流表分压）'
    ctx.fillText(errNote, x0, recY + recH + 8 * scale)

    // 电流方向（左竖线上，向上）
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
      ctx.fillText('e⁻→', x0 + loopW * 0.52, y0 + 21 * scale)
    }

    // ─── 知识卡片 ───
    const SECTIONS = buildSections(s.records)
    if (lay.compact) {
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      let ky = panel.y + 12
      const px = panel.x + 14
      ctx.font = `bold ${lay.font.data}px monospace`; ctx.fillStyle = '#333'
      ctx.fillText(`R_x = ${sol.Rx} Ω`, px, ky); ky += 18
      ctx.fillText(`R₁ = ${sol.Rr.toFixed(1)} Ω`, px, ky); ky += 18
      ctx.fillText(`I = ${sol.I.toFixed(3)} A`, px, ky); ky += 18
      ctx.fillText(`U = ${sol.Umeas.toFixed(2)} V`, px, ky); ky += 18
      ctx.fillText(`R测 = ${sol.Rmeas.toFixed(2)} Ω（误差 ${sol.err.toFixed(1)}%）`, px, ky)
      ctx.fillStyle = on ? '#2E7D32' : '#888'
      ctx.font = `bold ${lay.font.body}px sans-serif`
      ctx.fillText(on ? '● 通路' : '○ 断路', px, ky + 18)
      ctx.textBaseline = 'alphabetic'
      canvasRef.current._cardBox = null
      return
    }

    const cardOut = drawKnowledgeCard(ctx, panel, SECTIONS, {
      title: '📖 伏安法测电阻（内外接）',
      scroll: s.cardScroll,
      tip: (c, tx, ty) => {
        if (on) {
          c.fillStyle = '#C2410C'
          c.fillText(
            `● 闭合：${s.mode === 'outer' ? '外接' : '内接'}　R_x=${sol.Rx} Ω　I=${sol.I.toFixed(3)} A　U=${sol.Umeas.toFixed(2)} V　R测=${sol.Rmeas.toFixed(2)} Ω（${sol.err >= 0 ? '+' : ''}${sol.err.toFixed(1)}%）`,
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
  }

  /* ── 知识卡片内容 ── */
  function buildSections(records) {
    const rows = records.map((r, i) => [
      [`第 ${i + 1} 次（${r.mode === 'outer' ? '外接' : '内接'}）：Rx=`], [`${r.rx}Ω`, '#C2410C', 1],
      ['，U='], [`${r.u.toFixed(2)}V`, '#C2410C', 1], ['，I='], [`${r.i.toFixed(3)}A`, '#C2410C', 1],
      [' → R测='], [`${r.r.toFixed(2)}Ω`, '#15803D', 1],
    ])
    if (!rows.length) {
      rows.push([['闭合开关后切换接法、调滑片，点下方「📋 记录一组数据」，对比内外接的 R测 与误差。']])
    }

    return [
      {
        t: '实验目的', c: '#E0761F',
        items: [
          [['掌握伏安法测电阻的两种接法：'], ['电流表外接', '#15803D', 1], ['与'], ['电流表内接', '#15803D', 1], ['。']],
          [['分析两种接法的'], ['系统误差来源', '#C2410C', 1], ['及方向，会根据待测电阻大小选择合适接法。']],
          [['会画电路图、按图连线、正确读表与记录数据。']],
        ],
      },
      {
        t: '实验原理', c: '#C98A12',
        items: [
          [['由'], ['R = U/I', '#DC2626', 1], ['，电压表测电压 U、电流表测电流 I，比值即测得电阻。']],
          [['电表非理想：电流表有内阻 '], ['R_A', '#C2410C', 1], ['，电压表有内阻 '], ['R_V', '#C2410C', 1], ['，接入后会带来分流 / 分压。']],
          [['外接法电压表直接并在 Rx 两端；内接法电流表与 Rx 串联后再被电压表整体测量。']],
        ],
      },
      {
        t: '两种接法与误差', c: '#C2410C',
        items: [
          [['① 电流表外接：'], ['I测 = Ix + Iv（偏大）', '#C2410C', 1], ['，U测 准 → R测 = U/I 偏'], ['小', '#C2410C', 1], ['。Rx 越小、R_V 越大，分流影响越小。']],
          [['② 电流表内接：'], ['U测 = Ux + UA（偏大）', '#C2410C', 1], ['，I测 准 → R测 偏'], ['大', '#C2410C', 1], ['。Rx 越大、R_A 越小，分压影响越小。']],
          [['误差方向：'], ['「小外小，大内大」', '#DC2626', 1], ['——外接偏小，内接偏大。']],
        ],
      },
      {
        t: '接法选择（口诀）', c: '#CA8A04',
        items: [
          [['待测电阻'], ['较大（R_x ≫ R_A）', '#15803D', 1], ['，与 R_V 相比不太大时，选'], ['内接法', '#C2410C', 1], ['（电流表分压影响小）。']],
          [['待测电阻'], ['较小（R_x ≪ R_V）', '#15803D', 1], ['，与 R_A 相比不太大时，选'], ['外接法', '#C2410C', 1], ['（电压表分流影响小）。']],
          [['难以判断时用'], ['试触法', '#C2410C', 1], ['：触头在两表间移动，看两表读数变化幅度，变化大的那只表避免其误差来源。']],
        ],
      },
      {
        t: '数据处理', c: '#B45309',
        items: [
          [['每组分别算'], ['R测 = U/I', '#DC2626', 1], ['；多次测量取平均，减小'], ['偶然误差', '#15803D', 1], ['。']],
          [['内接法测得值可修正：'], ['R_x = R测 − R_A', '#15803D', 1], ['；外接法受 R_V 并联影响，修正较复杂。']],
        ],
      },
      { t: '本次测量记录', c: '#15803D', items: rows },
      {
        t: '注意事项', c: '#DC2626',
        items: [
          [['连线、改线时开关必须'], ['断开', '#DC2626', 1], ['；闭合前滑片在'], ['阻值最大处', '#DC2626', 1], ['。']],
          [['电流表'], ['串联', '#15803D', 1], ['、电压表'], ['并联', '#15803D', 1], ['；正负柱不能接反，量程先大后小、先试触。']],
          [['读数视线正对表盘，'], ['估读到最小分度下一位', '#C2410C', 1], ['；滑动变阻器限流接入，保护电路。']],
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
    S.current.mode = 'outer'
    S.current.ratio = 1
    S.current.rIdx = 1
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
      title="伏安法测电阻（内接/外接）"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t) }}
      tab1Label="📖 电路演示"
      tab2Label="🔧 自己动手"
      onReset={handleReset}
      desc={tab === 1 ? (
        <>
          <b>伏安法测电阻（内外接）</b>
          <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
            外接 / 内接切换 · 对比 R测 与系统误差 · 按 Rx 大小选接法
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
            purpose="对比电流表内接 / 外接的测量值与系统误差，学会按待测电阻大小选择接法。"
            steps={[
              '切换「外接 / 内接」，观察电压表、电流表所测对象',
              '闭合开关，读 U 与 I，比较 R测 偏大还是偏小',
              '换不同 Rx 档位，记录多组数据并分析误差方向',
            ]}
            hint="小外小、大内大：外接 R测 偏小，内接 R测 偏大。"
          />
        ) : (
          <InfoDock
            align="left"
            offset={{ left: 26, top: 26 }}
            hint="点右侧器材加入 → 拖拽移动 → 点接线柱连线。电流表串联、电压表并联在待测电阻两端，滑变「一上一下」；轻点开关通断，双击电表看读数，双击器材或按 Delete 删除。"
            hintTitle="操作说明"
          />
        )}
        {tab === 2 && (
          <BuilderPalette side="right"
            items={[
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
