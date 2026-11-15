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
 * OhmsLawScene — 探究电流与电压、电阻的关系（欧姆定律，第 4 个按「简单电路」模板改造的电学实验）
 *
 *   Tab1 📖 电路演示 —— 暖色底 + 标准符号回路（滑变限流 + 电流表串联 + 电压表并联在 R 两端）
 *                        两枚药丸切换「Ⅰ 保持 R 不变，改变 U」「Ⅱ 保持 U 不变，改变 R」，
 *                        拖滑片 / 点电阻换值，右侧实时描点出 I–U 直线与 I–R 双曲线
 *   Tab2 🔧 自己动手 —— 与简单电路同一套 1:1 SVG 器材（同一器材栏 9 件 + 三色导线）+
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

const RHEO_MAX = 20            // 20Ω 2A 滑动变阻器
const R_FIXED = 10             // 实验 Ⅰ 的定值电阻（保持不变）
const R_SET = [5, 10, 15, 20]  // 实验 Ⅱ / Ⅲ 依次更换的定值电阻
const R_INT = 2.0              // 实验 Ⅲ 计入的电源内阻
const EMF = CFG.VS.V           // 电源电动势 3.0 V
const MAX_PTS = 6              // 每张图像最多描 6 个点

export default function OhmsLawScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const builderRef = useRef(null)

  const S = useRef({
    tab: 1,
    mode: 1,                // 1 = R 不变改 U；2 = U 不变改 R；3 = 全电路（计入内阻）
    switchClosed: false,
    time: 0,
    ratio: 1,               // 滑片位置：1 = 阻值最大（右端）
    rIdx: 1,                // 实验 Ⅱ / Ⅲ 当前定值电阻下标（R_SET[1] = 10Ω）
    pts: [],                // [{ x, y, u, i }] 已描的点（x：Ⅰ 是 U，Ⅱ 是 R，Ⅲ 是 I）
    wireColor: '#F44336',
    dragging: false,
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

  /**
   * 物理：定值电阻 R 与滑变、电流表内阻串联，电压表 1e7Ω 视为理想。
   *   Ⅰ、Ⅱ 按理想电源（内阻忽略，r=0）处理：滑变接入 0～20Ω 改 U，或换 R 改 I。
   *   Ⅲ 全电路：电源内阻 r = 2.0Ω 计入，滑变归 0（只留 R 做外电路），
   *      电压表跨接在电源两端读路端电压 U = E − I·r（开路时读 E）。
   */
  function solve() {
    const s = S.current
    const mode = s.mode
    const rInt = mode === 3 ? R_INT : 0
    const Rr = mode === 1 ? Math.round(s.ratio * RHEO_MAX * 10) / 10 : 0
    const R = mode === 1 ? R_FIXED : R_SET[s.rIdx]
    const I = s.switchClosed ? EMF / (R + Rr + rInt + CFG.AMM_R) : 0
    const Uout = I * (R + Rr)                         // 外电路（路端）电压
    const Udisp = mode === 3 ? (s.switchClosed ? Uout : EMF) : Uout   // Ⅲ 开路时电压表跨电源读 E
    return {
      mode, rInt, Rr, R, I, U: Uout, Udisp,
      Ur: I * rInt,                                    // 内电压
      Rmeas: I > 0.002 ? Uout / I : 0,
    }
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
    const top = lay.circuit.T, bottom = lay.circuit.B - (lay.compact ? 0 : 30)
    const areaW = right - left, areaH = bottom - top

    const scaleOf = (w) => Math.max(0.55, Math.min(1.1, w / 420))
    let loopW = Math.min(areaW * 0.76, 640)
    let chipUp = 50 * scaleOf(loopW)
    let chipDn = 258 * scaleOf(loopW)
    const room = areaH - (chipUp + chipDn + 6)
    if (room > 60) loopW = Math.min(loopW, room / 0.52)
    chipUp = 50 * scaleOf(loopW); chipDn = 258 * scaleOf(loopW)
    const scale = scaleOf(loopW)
    const loopH = loopW * 0.52
    const x0 = left + (areaW - loopW) / 2
    const y0 = top + Math.max(chipUp + 2, (areaH - (loopH + chipUp + chipDn)) / 2 + chipUp)
    const x1 = x0 + loopW, y1 = y0 + loopH
    const midX = x0 + loopW / 2, midY = y0 + loopH / 2

    // 上边：滑变（左）、电流表（右）；下边：电源、定值电阻、开关
    const rheoX = x0 + loopW * 0.28
    const amX = x0 + loopW * 0.70
    const battX = x0 + loopW * 0.18
    const rxX = x0 + loopW * 0.52
    const swX = x0 + loopW * 0.82

    const wc = on ? '#1565C0' : '#9aa7b1'
    const ink = on ? SYM_INK : '#7c8a93'
    const lw = 2 * scale + 0.6

    const hRheo = symHalf('rheostat', scale)
    const hMeter = symHalf('meter', scale)
    const hRes = symHalf('resistor', scale)
    const hBat = symHalf('battery', scale, 2)
    const hSw = symHalf('switch', scale)

    // ─── 导线（符号处留缺口）───
    drawLine(ctx, x0, y0, rheoX - hRheo, y0, wc, lw)
    drawLine(ctx, rheoX + hRheo, y0, amX - hMeter, y0, wc, lw)
    drawLine(ctx, amX + hMeter, y0, x1, y0, wc, lw)
    drawLine(ctx, x1, y0, x1, y1, wc, lw)
    drawLine(ctx, x0, y0, x0, y1, wc, lw)
    drawLine(ctx, x0, y1, battX - hBat, y1, wc, lw)
    drawLine(ctx, battX + hBat, y1, rxX - hRes, y1, wc, lw)
    drawLine(ctx, rxX + hRes, y1, swX - hSw, y1, wc, lw)
    drawLine(ctx, swX + hSw, y1, x1, y1, wc, lw)

    // 电压表：Ⅰ/Ⅱ 并联在定值电阻两端；Ⅲ 跨接在电源两端，直接读路端电压 U = E − Ir
    const useInt = sol.mode === 3
    const volY = y1 - 62 * scale, volR = 13 * scale, vTap = hRes + 24 * scale
    const vX = useInt ? battX : rxX
    const tapA = useInt ? battX - hBat - 8 * scale : rxX - vTap
    const tapB = useInt ? battX + hBat + 8 * scale : rxX + vTap
    ctx.save()
    ctx.strokeStyle = on ? '#7CB342' : '#9aa7b1'
    ctx.lineWidth = 1.6 * scale + 0.4
    ctx.beginPath()
    ctx.moveTo(tapA, y1); ctx.lineTo(tapA, volY); ctx.lineTo(vX - volR - 2, volY)
    ctx.moveTo(tapB, y1); ctx.lineTo(tapB, volY); ctx.lineTo(vX + volR + 2, volY)
    ctx.stroke()
    ctx.restore()

    // ─── 符号 ───
    const geo = symRheostat(ctx, rheoX, y0, { scale, ratio: s.ratio, ink })
    symMeter(ctx, amX, y0, { kind: 'A', scale, ink })
    symResistor(ctx, rxX, y1, { scale, ink })
    symMeter(ctx, vX, volY, { kind: 'V', scale, ink: on ? '#558B2F' : ink })
    symBattery(ctx, battX, y1, { n: 2, scale, ink, flip: true })
    symSwitch(ctx, swX, y1, { closed: on, scale, ink })

    // 电子流动（符号之后画：滑变内部走「左端 → 线圈 → 箭头杆 → 横线 → 右端」）
    if (on) {
      const path = [
        { x: battX + hBat, y: y1 }, { x: rxX - hRes, y: y1 },
        { x: rxX + hRes, y: y1 }, { x: swX + hSw, y: y1 },
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
    // 滑片可点 / 可拖（实验 Ⅱ 里滑变归 0，不允许拖）
    const sliderArea = { x: rheoX - hRheo, y: y0 - 26 * scale, w: hRheo * 2, h: 44 * scale }
    const slideTo = (mx) => {
      if (S.current.mode !== 1) return
      const r = Math.max(0, Math.min(1, (mx - (rheoX - hRheo)) / (hRheo * 2)))
      S.current.ratio = Math.round(r * 20) / 20
      forceUpdate(n => n + 1)
    }
    canvasRef.current._clickAreas.push({ ...sliderArea, onClick: slideTo, onDrag: slideTo })
    canvasRef.current._sliderArea = sliderArea

    // ─── 回路下方：左侧一列（三枚实验药丸 + 记录按钮），右侧实时描点图 ───
    const belowY = y1 + 46 * scale
    const colW = 216 * scale, bh = 28 * scale
    const pill1 = { x: x0, y: belowY, w: colW, h: bh }
    const pill2 = { x: x0, y: belowY + 35 * scale, w: colW, h: bh }
    const pill3 = { x: x0, y: belowY + 70 * scale, w: colW, h: bh }
    drawPill(ctx, pill1, 'Ⅰ  R 不变，改变 U', s.mode === 1, scale)
    drawPill(ctx, pill2, 'Ⅱ  U 不变，改变 R', s.mode === 2, scale)
    drawPill(ctx, pill3, 'Ⅲ  全电路：计入内阻 r', s.mode === 3, scale)
    canvasRef.current._clickAreas.push({
      ...pill1, onClick: () => { setMode(1) },
    })
    canvasRef.current._clickAreas.push({
      ...pill2, onClick: () => { setMode(2) },
    })
    canvasRef.current._clickAreas.push({
      ...pill3, onClick: () => { setMode(3) },
    })

    // 记录按钮
    const recW = colW, recH = 30 * scale
    const recX = x0, recY = belowY + 105 * scale
    const n = s.pts.length
    const recActive = on && n < MAX_PTS
    ctx.save()
    ctx.fillStyle = recActive ? '#FFF3E0' : '#F5F0E8'
    ctx.strokeStyle = recActive ? '#E0761F' : '#D8CBB8'
    ctx.lineWidth = 1.4
    ctx.beginPath(); ctx.roundRect(recX, recY, recW, recH, recH / 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = recActive ? '#C2410C' : '#A79884'
    ctx.font = `bold ${Math.max(9, Math.round(11 * scale))}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(n >= MAX_PTS ? `已描 ${MAX_PTS} 个点（点「重置」清空）` : `📋 记录一个数据点（${n}/${MAX_PTS}）`, recX + recW / 2, recY + recH / 2)
    ctx.restore()
    if (recActive) {
      canvasRef.current._clickAreas.push({
        x: recX, y: recY, w: recW, h: recH,
        onClick: () => {
          const cur = solve()
          if (cur.I <= 0.002) return
          const dx = cur.mode === 1 ? cur.U : cur.mode === 2 ? cur.R : cur.I
          const dy = cur.mode === 3 ? cur.U : cur.I
          S.current.pts.push({ x: dx, y: dy, u: cur.U, i: cur.I, r: cur.R })
          forceUpdate(v => v + 1)
        },
      })
    }

    // 图形面板（回路下方右侧，与左列同高起步）
    const chX = x0 + colW + 14 * scale
    const chart = { x: chX, y: belowY, w: x1 - chX, h: 196 * scale }
    drawChart(ctx, chart, s.pts, s.mode, scale)

    // 调试/验收钩子
    canvasRef.current._dbg = {
      swX, swY: y1, rheoX, rheoY: y0, hRheo, hSw, rxX, rY: y1 + 22 * scale,
      rxTap: vTap, scale,
      pill1X: pill1.x + pill1.w / 2, pill1Y: pill1.y + pill1.h / 2,
      pill2X: pill2.x + pill2.w / 2, pill2Y: pill2.y + pill2.h / 2,
      pill3X: pill3.x + pill3.w / 2, pill3Y: pill3.y + pill3.h / 2,
      recX: recX + recW / 2, recY: recY + recH / 2,
      chartX: chart.x, chartY: chart.y, chartW: chart.w, chartH: chart.h,
      mode: s.mode, closed: on, pts: s.pts.length,
    }

    // ─── 标注 ───
    const labelFont = Math.max(9, Math.round(11 * scale))
    const readFont = Math.max(9, Math.round(11.5 * scale))
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'

    ctx.fillStyle = '#667'; ctx.font = `${labelFont}px sans-serif`
    ctx.fillText(s.mode === 3 ? '电源  E = 3.00 V，r = 2.0 Ω' : '电源', battX, y1 + 20 * scale)
    ctx.fillText(on ? '开关（闭合）' : '开关（断开）', swX, y1 + 20 * scale)
    ctx.fillText(`滑动变阻器  R₁ = ${sol.Rr.toFixed(1)} Ω`, rheoX, y0 + 20 * scale)
    ctx.fillText('电流表 A（串联）', amX, y0 - 33 * scale)

    // 定值电阻标签（实验 Ⅱ / Ⅲ 可点换值）
    const canSwapR = s.mode !== 1
    ctx.fillStyle = canSwapR ? '#C2410C' : '#667'
    ctx.font = `${canSwapR ? 'bold ' : ''}${labelFont}px sans-serif`
    ctx.fillText(
      canSwapR ? `R = ${sol.R} Ω ▸ 点我换值` : `R = ${R_FIXED} Ω（不变）`,
      rxX, y1 + 20 * scale
    )
    if (canSwapR) {
      canvasRef.current._clickAreas.push({
        x: rxX - 62 * scale, y: y1 + 16 * scale, w: 124 * scale, h: 20 * scale,
        onClick: () => {
          S.current.rIdx = (S.current.rIdx + 1) % R_SET.length
          forceUpdate(v => v + 1)
        },
      })
    }

    // 电压表：名称与读数贴在 V 圈旁；Ⅲ 放在圈的右侧，避免压住电源与引线
    ctx.font = `${labelFont}px sans-serif`; ctx.textBaseline = 'top'
    if (useInt) {
      ctx.textAlign = 'left'
      ctx.fillStyle = '#558B2F'
      ctx.fillText('电压表 V（路端）', vX + volR + 12 * scale, volY - 15 * scale)
      ctx.fillStyle = '#C2410C'; ctx.font = `bold ${readFont}px monospace`
      ctx.fillText(`U = ${sol.Udisp.toFixed(2)} V`, vX + volR + 12 * scale, volY + 1 * scale)
      ctx.textAlign = 'center'
    } else {
      ctx.fillStyle = '#558B2F'
      ctx.fillText('电压表 V', vX, volY + volR + 8 * scale)
      ctx.fillStyle = '#C2410C'; ctx.font = `bold ${readFont}px monospace`
      ctx.fillText(`U = ${sol.Udisp.toFixed(2)} V`, vX, volY + volR + 22 * scale)
    }
    ctx.fillStyle = '#B45309'
    ctx.fillText(`I = ${sol.I.toFixed(2)} A`, amX, y0 + 20 * scale)

    // 滑片说明
    ctx.fillStyle = '#B08954'; ctx.font = `${labelFont}px sans-serif`
    ctx.fillText(
      s.mode === 1 ? '← 滑片左移 U 变大　·　右移 U 变小 →'
        : s.mode === 2 ? '实验 Ⅱ 滑变归 0（滑片在最左），U 保持 3 V'
          : '实验 Ⅲ：滑变归 0，换 R 看端电压怎么掉',
      rheoX, y0 + 36 * scale
    )

    // Ⅲ 模式的内电压补充读数（贴电源右上方）
    if (useInt && on) {
      ctx.fillStyle = '#A16207'
      ctx.font = `${labelFont}px monospace`
      ctx.textAlign = 'left'
      ctx.fillText(`I·r = ${sol.Ur.toFixed(2)} V`, battX + hBat + 26 * scale, y1 - 12 * scale)
      ctx.textAlign = 'center'
    }

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
      ctx.fillText('e⁻→', x0 + loopW * 0.5, y0 + 21 * scale)
    }

    // ─── 知识卡片 ───
    const SECTIONS = buildSections(s.pts, s.mode, sol)
    if (lay.compact) {
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      let ky = panel.y + 12
      const px = panel.x + 14
      ctx.font = `bold ${lay.font.data}px monospace`; ctx.fillStyle = '#333'
      ctx.fillText(`R₁ = ${sol.Rr.toFixed(1)} Ω`, px, ky); ky += 18
      ctx.fillText(`R = ${sol.R} Ω`, px, ky); ky += 18
      if (sol.mode === 3) { ctx.fillText(`E = ${EMF.toFixed(2)} V`, px, ky); ky += 18 }
      ctx.fillText(`U = ${sol.Udisp.toFixed(2)} V`, px, ky); ky += 18
      ctx.fillText(`I = ${sol.I.toFixed(2)} A`, px, ky); ky += 18
      ctx.fillStyle = on ? '#2E7D32' : '#888'
      ctx.font = `bold ${lay.font.body}px sans-serif`
      ctx.fillText(on ? '● 通路' : '○ 断路', px, ky)
      ctx.textBaseline = 'alphabetic'
      return
    }

    drawKnowledgeCard(ctx, panel, SECTIONS, {
      title: '📖 欧姆定律知识',
      tip: (c, tx, ty) => {
        if (on) {
          c.fillStyle = '#C2410C'
          c.fillText(
            sol.mode === 3
              ? `● 闭合：I = ${sol.I.toFixed(2)} A　U = E − Ir = ${EMF.toFixed(2)} − ${sol.I.toFixed(2)}×${R_INT.toFixed(1)} = ${sol.Udisp.toFixed(2)} V`
              : `● ${s.mode === 1 ? 'R 不变' : 'U 不变'}：U = ${sol.U.toFixed(2)} V　I = ${sol.I.toFixed(2)} A　U/I = ${sol.Rmeas.toFixed(1)} Ω`,
            tx, ty + 10
          )
        } else {
          c.fillStyle = '#B08954'
          c.fillText(
            sol.mode === 3
              ? '○ 开路：I = 0，电压表跨在电源两端 → 端电压 U = E = 3.00 V'
              : '○ 断开：滑片先移到阻值最大处（最右），再点画面里的开关闭合',
            tx, ty + 10
          )
        }
      },
    })
    ctx.textBaseline = 'alphabetic'
  }

  /** 实验模式切换：Ⅰ 从阻值最大起步；Ⅱ / Ⅲ 滑变归 0 并清空描点 */
  function setMode(m) {
    const s = S.current
    if (s.mode === m) return
    s.mode = m
    s.pts = []
    s.ratio = m === 1 ? 1 : 0
    forceUpdate(n => n + 1)
  }

  /* ── 知识卡片内容（7 节，第 5 节是本次描点记录）── */
  function buildSections(pts, mode, sol) {
    const rows = []
    if (mode === 1) {
      if (pts.length) {
        pts.forEach((p, i) => {
          rows.push([
            [`第 ${i + 1} 点：U = `], [`${p.u.toFixed(2)} V`, '#C2410C', 1],
            ['，I = '], [`${p.i.toFixed(2)} A`, '#C2410C', 1],
            [' → U/I = '], [`${(p.u / p.i).toFixed(1)} Ω`, '#15803D', 1],
          ])
        })
      } else {
        rows.push([['闭合开关后拖滑片改变 U，点「📋 记录一个数据点」，攒 3 个点就能看出 I 与 U 成正比。']])
      }
      rows.push([['U/I 三组都约等于 '], [`10 Ω`, '#DC2626', 1], ['（R 没变），说明 '], ['I = U/R', '#DC2626', 1], ['。']])
    } else if (mode === 2) {
      if (pts.length) {
        pts.forEach((p, i) => {
          rows.push([
            [`第 ${i + 1} 点：R = `], [`${p.r} Ω`, '#C2410C', 1],
            ['，I = '], [`${p.i.toFixed(2)} A`, '#C2410C', 1],
            [' → I·R = '], [`${(p.i * p.r).toFixed(2)} V`, '#15803D', 1],
          ])
        })
      } else {
        rows.push([['闭合开关，点「定值电阻」换 5/10/15/20 Ω，各记一点，就能看出 I 与 R 成反比。']])
      }
      rows.push([['I·R 三组都约等于 '], [`3.00 V`, '#DC2626', 1], ['（U 没变），说明 '], ['I = U/R', '#DC2626', 1], ['。']])
    } else {
      if (pts.length) {
        pts.forEach((p, i) => {
          rows.push([
            [`第 ${i + 1} 点：I = `], [`${p.i.toFixed(2)} A`, '#C2410C', 1],
            ['，U = '], [`${p.u.toFixed(2)} V`, '#C2410C', 1],
            [' → I·r = '], [`${(p.i * R_INT).toFixed(2)} V`, '#15803D', 1],
          ])
        })
      } else {
        rows.push([['闭合开关，点「定值电阻」换 5/10/15/20 Ω，各记一点：I 越大，端电压 U 掉得越多。']])
      }
      rows.push([['每次都有 '], ['U + I·r = 3.00 V', '#DC2626', 1], ['（电动势守恒），即 '], ['U = E − I·r', '#DC2626', 1], ['。']])
    }

    return [
      {
        t: '实验目的', c: '#E0761F',
        items: [
          [['探究'], ['电流跟电压、电阻的关系', '#C2410C', 1], ['，学会用'], ['控制变量法', '#DC2626', 1], ['做实验。']],
          [['用图像（I–U、I–R）把数据变成规律，归纳出 '], ['欧姆定律 I = U/R', '#DC2626', 1], ['。']],
        ],
      },
      {
        t: '实验器材', c: '#C98A12',
        items: [
          [['干电池组、开关、'], ['定值电阻', '#C2410C', 1], ['（5 / 10 / 15 / 20 Ω）、'], ['电流表', '#C2410C', 1], ['、'], ['电压表', '#C2410C', 1], ['、'], ['滑动变阻器（20 Ω 2 A）', '#EA8C1B', 1], ['、导线。']],
        ],
      },
      {
        t: mode === 3 ? '全电路欧姆定律' : '控制变量法', c: '#CA8A04',
        items: mode === 3 ? [
          [['电源不是理想的：电动势 '], ['E = 3.00 V', '#C2410C', 1], ['，内阻 '], [`r = ${R_INT.toFixed(1)} Ω`, '#C2410C', 1], ['，内阻上要分掉 '], ['I·r', '#DC2626', 1], ['。']],
          [['闭合开关：'], ['I = E/(R + r)', '#DC2626', 1], ['，端电压 '], ['U = E − I·r', '#DC2626', 1], ['（也等于 I·R）。']],
          [['开路（断开开关）：I = 0 → '], ['U = E = 3.00 V', '#15803D', 1], ['，此时电压表跨在电源两端读的就是 E。']],
          [['短路（R = 0）：I短 = E/r = 1.5 A，端电压几乎为 0 —— '], ['绝不允许短接电源', '#DC2626', 1], ['。']],
        ] : [
          [['研究 I 与 U：保持 '], ['R 不变', '#15803D', 1], ['，只改变 R 两端的 U（拖滑片），看 I 怎么变。']],
          [['研究 I 与 R：保持 '], ['U 不变', '#15803D', 1], ['，只改变 R 的阻值（换电阻），看 I 怎么变。']],
          [['两组实验都不能同时改两个量，否则说不清是谁影响了 I。']],
        ],
      },
      {
        t: '实验步骤', c: '#B45309',
        items: [
          [['① '], ['断开开关', '#DC2626', 1], ['按图连线：电流表'], ['串联', '#15803D', 1], ['，电压表'], ['并联', '#15803D', 1], ['在定值电阻两端，滑变「一上一下」，滑片置'], ['阻值最大处', '#DC2626', 1], ['。']],
          [['② 闭合开关，调滑片使 U 分别为 1.0 / 2.0 / 3.0 V，记下对应 I。']],
          [['③ 换 5 / 10 / 15 / 20 Ω，保持 U = 3.0 V，分别记下 I。']],
          [['④ '], ...(mode === 3
            ? [['描点画 U–I 图像：纵截距是 E，斜率绝对值是 r。']]
            : [['用数据描点画 I–U、I–R 图像，归纳规律。']])],
          [['⑤ '], ['断开开关', '#DC2626', 1], ['，拆线整理器材。']],
        ],
      },
      { t: '本次数据记录', c: '#15803D', items: rows },
      {
        t: '实验结论', c: '#C2410C',
        items: mode === 3 ? [
          [['U–I 图像是一条'], ['下降的直线', '#DC2626', 1], ['：纵截距就是 '], ['E = 3.00 V', '#C2410C', 1], ['，斜率的绝对值就是内阻 '], [`r = ${R_INT.toFixed(1)} Ω`, '#C2410C', 1], ['。']],
          [['I 越大，内阻分掉的 I·r 越大，'], ['端电压 U 越低', '#DC2626', 1], [' —— 用电高峰灯变暗就是这个原因。']],
          [['全电路欧姆定律：'], ['I = E/(R + r)', '#DC2626', 1], ['，电源内部也有电阻，电流在内部也要「消耗」电压。']],
        ] : [
          [['R 一定：'], ['I 与 U 成正比', '#DC2626', 1], ['，I–U 图像是过原点的直线，I₁ : I₂ = U₁ : U₂。']],
          [['U 一定：'], ['I 与 R 成反比', '#DC2626', 1], ['，I–R 图像是双曲线，I₁ : I₂ = R₂ : R₁。']],
          [['欧姆定律：'], ['I = U/R', '#DC2626', 1], ['——通过导体的电流跟导体两端电压成正比、跟导体电阻成反比。']],
        ],
      },
      {
        t: '注意事项', c: '#DC2626',
        items: [
          [['连线、改线时开关必须'], ['断开', '#DC2626', 1], ['；闭合前滑片在'], ['阻值最大处', '#DC2626', 1], ['。']],
          [['电流表'], ['串联', '#15803D', 1], ['、电压表'], ['并联', '#15803D', 1], ['，'], ['正负柱不能接反', '#DC2626', 1], ['，量程先大后小、先试触。']],
          [['本实验必须用'], ['定值电阻', '#C2410C', 1], ['：灯泡灯丝电阻随温度变化，测不出「R 不变」。']],
          [['读数时视线正对表盘，'], ['估读到最小分度的下一位', '#C2410C', 1], ['。']],
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
    for (const a of canvasRef.current._clickAreas) {
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) {
        S.current.dragging = !!a.onDrag
        a.onClick?.(x)
        return
      }
    }
  }, [])

  const handleMouseMove = useCallback((e) => {
    if (!S.current.dragging || S.current.tab !== 1) return
    const { x } = getPos(e)
    const a = canvasRef.current._clickAreas.find((k) => k.onDrag)
    a?.onDrag?.(x)
  }, [])

  const handleMouseUp = useCallback(() => { S.current.dragging = false }, [])

  const handleReset = useCallback(() => {
    S.current.switchClosed = false
    S.current.mode = 1
    S.current.ratio = 1
    S.current.rIdx = 1
    S.current.pts = []
    builderRef.current?.reset()
    forceUpdate(n => n + 1)
  }, [])

  const handleAddFromPalette = useCallback((type) => { builderRef.current?.add(type) }, [])
  const handleDropFromPalette = useCallback((type, clientX, clientY) => { builderRef.current?.addAt(type, clientX, clientY) }, [])
  const handlePickColor = useCallback((color) => { S.current.wireColor = color; forceUpdate(v => v + 1) }, [])

  return (
    <SceneShell
      title="探究电流与电压、电阻的关系"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t) }}
      tab1Label="📖 电路演示"
      tab2Label="🔧 自己动手"
      onReset={handleReset}
      desc={tab === 1 ? (
        <>
          <b>欧姆定律</b>
          <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
            控制变量法：R 不变改 U · U 不变改 R · 计入内阻用全电路 U = E − Ir
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
        />
        {tab === 2 && (
          <BuilderSVG ref={builderRef} wireColor={S.current.wireColor} />
        )}
        {tab === 1 ? (
          <InfoDock
            purpose="探究电流与电压、电阻的关系，用控制变量法和图像归纳出欧姆定律 I=U/R；再把电源内阻算进去，认识全电路欧姆定律 U=E−Ir。"
            steps={[
              '闭合开关前，滑片放在阻值最大处',
              '实验 Ⅰ：保持 R = 10 Ω，拖滑片让 U 依次为 1.0 / 2.0 / 3.0 V，各记一点',
              '实验 Ⅱ：保持 U = 3 V，点定值电阻换 5 / 10 / 15 / 20 Ω，各记一点',
              '实验 Ⅲ：计入电源内阻 r = 2 Ω，电压表跨在电源两端读路端电压；先断开看 U = E，再闭合看 U = E − Ir',
            ]}
            hint="R 不变时 U/I 恒为 R；U 不变时 I·R 恒为 U；计入内阻后 U + I·r 恒为 E。"
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

// ─── 画辅助 ───
function drawLine(ctx, x1, y1, x2, y2, color, w) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
}

/** 一枚实验模式药丸（选中＝暖橙实底） */
function drawPill(ctx, r, text, active, scale) {
  const h = r.h
  ctx.save()
  ctx.fillStyle = active ? '#E0761F' : '#FFF8EC'
  ctx.strokeStyle = active ? '#C2410C' : '#E3CFB0'
  ctx.lineWidth = 1.4
  ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, h, h / 2); ctx.fill(); ctx.stroke()
  ctx.fillStyle = active ? '#fff' : '#A1723B'
  ctx.font = `bold ${Math.max(9, Math.round(11.5 * scale))}px "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(text, r.x + r.w / 2, r.y + h / 2)
  ctx.restore()
}

/**
 * 实时描点图：Ⅰ 画 I–U（过原点直线），Ⅱ 画 I–R（双曲线）。
 * 虚线是理想关系，实心点是用户记录的真实读数。
 */
function drawChart(ctx, box, pts, mode, k) {
  const xMax = mode === 1 ? 3.2 : mode === 2 ? 24 : 0.6
  const yMax = mode === 1 ? 0.32 : mode === 2 ? 0.64 : 3.2
  const padL = 34 * k, padB = 22 * k, padT = 32 * k, padR = 10 * k
  const px = box.x + padL, py = box.y + box.h - padB
  const pw = box.w - padL - padR, ph = box.h - padB - padT

  ctx.save()
  ctx.fillStyle = '#FFFDF6'
  ctx.strokeStyle = '#EADFC8'
  ctx.lineWidth = 1.2
  ctx.beginPath(); ctx.roundRect(box.x, box.y, box.w, box.h, 8 * k); ctx.fill(); ctx.stroke()

  // 标题（居中；图表窄时用短标题，避免压住左上角的轴名）
  const title = mode === 1 ? 'I–U 图像（R 保持不变）'
    : mode === 2 ? 'I–R 图像（U 保持不变）'
      : 'U–I 图像（全电路，斜率 = −r）'
  const titleShort = mode === 1 ? 'I–U（R 不变）' : mode === 2 ? 'I–R（U 不变）' : 'U–I（斜率 = −r）'
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  ctx.fillStyle = '#8A7256'
  const titleFs = Math.max(8, Math.round(10.5 * k))
  ctx.font = `bold ${titleFs}px sans-serif`
  const useTitle = ctx.measureText(title).width > box.w - 76 * k ? titleShort : title
  ctx.fillText(useTitle, box.x + box.w / 2 + 10 * k, box.y + 5 * k)

  // 轴
  ctx.strokeStyle = '#C9B79A'; ctx.lineWidth = 1.2
  ctx.beginPath(); ctx.moveTo(px, py - ph); ctx.lineTo(px, py); ctx.lineTo(px + pw, py); ctx.stroke()

  // 刻度与数字
  const fs = Math.max(8, Math.round(9.5 * k))
  ctx.font = `${fs}px monospace`; ctx.fillStyle = '#A08A6A'
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  for (let i = 1; i <= 4; i++) {
    const x = px + (pw * i) / 4
    ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x, py + 3 * k); ctx.stroke()
    ctx.fillText(formatTick(mode, (xMax * i) / 4), x, py + 5 * k)
  }
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
  for (let i = 1; i <= 4; i++) {
    const y = py - (ph * i) / 4
    ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px - 3 * k, y); ctx.stroke()
    ctx.fillText(formatTick(mode, (yMax * i) / 4, true), px - 5 * k, y)
  }

  // 轴名（y 轴名放标题下一行，与顶端刻度错开；x 轴名在右下）
  ctx.fillStyle = '#8A7256'; ctx.font = `bold ${Math.max(8, Math.round(9.5 * k))}px sans-serif`
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  ctx.fillText(mode === 3 ? 'U / V' : 'I / A', box.x + 8 * k, box.y + 18 * k)
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'
  ctx.fillText(mode === 1 ? 'U / V' : mode === 2 ? 'R / Ω' : 'I / A', px + pw, py - 5 * k)

  // 关系曲线（理想值，绿虚线）
  ctx.strokeStyle = '#7CB342'; ctx.lineWidth = 1.5; ctx.setLineDash([5 * k, 4 * k])
  ctx.beginPath()
  if (mode === 1) {
    const uEnd = Math.min(xMax, R_FIXED * yMax)
    ctx.moveTo(px, py)
    ctx.lineTo(px + (pw * uEnd) / xMax, py - (ph * (uEnd / R_FIXED)) / yMax)
  } else if (mode === 2) {
    let first = true
    for (let i = 0; i <= 60; i++) {
      const R = 3 + (xMax - 3) * (i / 60)
      const I = EMF / R
      if (I > yMax) continue
      const x = px + (pw * R) / xMax, y = py - (ph * I) / yMax
      if (first) { ctx.moveTo(x, y); first = false } else ctx.lineTo(x, y)
    }
  } else {
    // U = E − I·r：从 (0, E) 斜向下，斜率 −r
    const iEnd = Math.max(0, Math.min(xMax, (EMF - 0) / R_INT))
    ctx.moveTo(px, py - ph * EMF / yMax)
    ctx.lineTo(px + (pw * iEnd) / xMax, py - ph * Math.max(0, EMF - iEnd * R_INT) / yMax)
  }
  ctx.stroke(); ctx.setLineDash([])

  // Ⅲ：开路点 (0, E) —— 空心点，标「开路」
  if (mode === 3) {
    const ox = px, oy = py - (ph * EMF) / yMax
    ctx.strokeStyle = '#2E7D32'; ctx.lineWidth = 1.6
    ctx.beginPath(); ctx.arc(ox, oy, 3.6 * k, 0, Math.PI * 2); ctx.stroke()
    ctx.fillStyle = '#2E7D32'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'
    ctx.font = `${Math.max(8, Math.round(9 * k))}px sans-serif`
    ctx.fillText('开路 U=E', ox + 6 * k, oy - 3 * k)
  }

  // 描出的实测点
  for (const p of pts) {
    const x = px + (pw * Math.min(p.x, xMax)) / xMax
    const y = py - (ph * Math.min(p.y, yMax)) / yMax
    ctx.fillStyle = '#C2410C'
    ctx.beginPath(); ctx.arc(x, y, 3.6 * k, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke()
  }
  ctx.restore()
}

function formatTick(mode, v, isY = false) {
  if (mode === 3) return isY ? v.toFixed(1) : v.toFixed(2)
  if (isY) return v.toFixed(2)
  return mode === 1 ? v.toFixed(1) : v.toFixed(0)
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
