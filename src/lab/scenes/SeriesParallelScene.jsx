import { useState, useRef, useEffect, useCallback } from 'react'
import { eventToCanvas } from '../utils/pointerPos'
import SceneShell from '../ui/SceneShell'
import InfoDock from '../ui/InfoDock'
import BuilderPalette from '../ui/BuilderPalette'
import { fitLayout } from '../ui/canvasLayout'
import { drawKnowledgeCard } from '../ui/knowledgeCard'
import BuilderSVG from '../simple3d/BuilderSVG.jsx'
import { TYPES } from './electricSvgInstruments.js'
import { symBattery, symSwitch, symResistor, symMeter, symHalf, SYM_INK } from '../render/symbols.js'

/**
 * SeriesParallelScene — 串并联电路规律（第 3 个按「简单电路」模板改造的电学实验）
 *
 *   Tab1 📖 电路演示 —— 暖色底 + 符号回路，左上可切「串联 / 并联」
 *     串联：R₁、R₂ 串在回路里，电流表在右侧测干路，电压表并在 R₁（点它改测 R₂）
 *     并联：R₁、R₂ 两条支路并排，电流表在左侧测干路总电流，电压表并在支路两端
 *   Tab2 🔧 自己动手 —— 与简单电路同一套 1:1 SVG 器材（同 9 件器材栏 + 三色导线）
 */

function thumb(type) {
  const t = TYPES[type]
  if (!t) return null
  const svg = t.render(
    { id: `pal-${type}`, closed: true, showRead: false, f: 0.4 },
    { bright: 0.55, frac: 0.35, I: 0, f: 0.4, rays: false }
  )
  return <span dangerouslySetInnerHTML={{ __html: svg }} />
}

const R1 = 10, R2 = 20, VS = 3.0

export default function SeriesParallelScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const builderRef = useRef(null)

  const S = useRef({
    tab: 1,
    mode: 'series',        // 'series' | 'parallel'
    vTarget: 0,            // 串联时电压表测 R1(0) / R2(1)
    switchClosed: false,
    time: 0,
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

  /** 两种接法的电学量（理想表，导线无阻） */
  function solve() {
    const on = S.current.switchClosed
    if (S.current.mode === 'series') {
      const I = on ? VS / (R1 + R2) : 0
      return { I, U1: I * R1, U2: I * R2, Utot: I * (R1 + R2), Rtot: R1 + R2 }
    }
    const Rtot = (R1 * R2) / (R1 + R2)
    const I1 = on ? VS / R1 : 0, I2 = on ? VS / R2 : 0
    return { I1, I2, I: I1 + I2, U: on ? VS : 0, Rtot }
  }

  function render(R) {
    const ctx = R.ctx, W = R.W, H = R.H
    ctx.clearRect(0, 0, W, H)
    const bg = ctx.createLinearGradient(0, 0, W * 0.35, H)
    bg.addColorStop(0, '#FFFCF5'); bg.addColorStop(0.55, '#FDF4E6'); bg.addColorStop(1, '#FBEDD9')
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
    canvasRef.current._clickAreas = []
    canvasRef.current._dbg = {}
    if (S.current.tab === 1) renderDemo(ctx, W, H)
  }

  // ================================================================
  //  Tab 1
  // ================================================================
  function renderDemo(ctx, W, H) {
    const s = S.current
    const on = s.switchClosed
    const sol = solve()
    const lay = fitLayout(W, H)

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
    let loopW = Math.min(areaW * 0.76, 560)
    // 串联要摆三只电压表（总 + 两只分压），上方要留更高；并联仪表都在回路内
    const chipUp = (s.mode === 'series' ? 168 : 70) * scaleOf(loopW)
    const chipDn = 150 * scaleOf(loopW)
    const room = areaH - (chipUp + chipDn + 8)
    if (room > 60) loopW = Math.min(loopW, room / 0.52)
    const scale = scaleOf(loopW)
    const loopH = loopW * 0.52
    const x0 = left + (areaW - loopW) / 2
    // 竖向：芯片区（上方三只电压表）→ 回路 → 下方标签 + 药丸，三者都要在 areaH 内
    const padTop = Math.max(4, (areaH - (loopH + chipUp + chipDn)) / 2)
    const y0 = top + padTop + chipUp
    const x1 = x0 + loopW, y1 = y0 + loopH
    const midX = x0 + loopW / 2, midY = y0 + loopH / 2

    const wc = on ? '#1565C0' : '#9aa7b1'
    const ink = on ? SYM_INK : '#7c8a93'
    const lw = 2 * scale + 0.6
    const hRes = symHalf('resistor', scale)
    const hMeter = symHalf('meter', scale)
    const hBat = symHalf('battery', scale, 2)
    const hSw = symHalf('switch', scale)
    const labelFont = Math.max(9, Math.round(11 * scale))

    const series = s.mode === 'series'

    // ── 元件坐标（两套） ──
    // 串联：R₁、R₂ 串在上边，三只电压表（V₁、V₂ 分压 + V 总压）吊在上方导轨之上；
    //       电流表在右竖边测干路（串联处处相等）。
    // 并联：电源、开关放在「分叉前」的干路上；两条支路各串一只电流表（A₁、A₂），
    //       总电流表 A 在左竖边；电压表 V 竖直跨接在两条导轨之间（并联段两端）。
    const r1x = x0 + loopW * (series ? 0.28 : 0.56)
    const r2x = x0 + loopW * (series ? 0.66 : 1.0)
    const battX = x0 + loopW * (series ? 0.20 : 0.16)
    const swX = x0 + loopW * (series ? 0.72 : 0.34)

    if (series) drawSeries(ctx, { x0, y0, x1, y1, midY, r1x, r2x, battX, swX, hRes, hMeter, hBat, hSw, scale, ink, wc, lw, on, sol, labelFont })
    else drawParallel(ctx, { x0, y0, x1, y1, midX, midY, r1x, r2x, battX, swX, hRes, hMeter, hBat, hSw, scale, ink, wc, lw, on, sol, labelFont })

    // ── 接法切换（回路下方两颗药丸，贴住可用高度底部，绝不出框） ──
    const pw = 76 * scale, ph = 32 * scale, gap = 14 * scale
    const pY = Math.min(y1 + 64 * scale, bottom - ph - 4)
    const pxs = { series: midX - pw - gap / 2, parallel: midX + gap / 2 }
    const pill = (px, txt, active) => {
      ctx.save()
      ctx.fillStyle = active ? '#F97316' : '#FFF6EA'
      ctx.strokeStyle = active ? '#EA8C1B' : '#E5D3B8'
      ctx.lineWidth = 1.4
      ctx.beginPath(); ctx.roundRect(px, pY, pw, ph, ph / 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = active ? '#fff' : '#A16207'
      ctx.font = `bold ${Math.max(10, Math.round(13 * scale))}px "Microsoft YaHei", sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(txt, px + pw / 2, pY + ph / 2)
      ctx.restore()
    }
    pill(pxs.series, '串联', series)
    pill(pxs.parallel, '并联', !series)
    canvasRef.current._clickAreas.push({
      x: pxs.series, y: pY, w: pw, h: ph,
      onClick: () => { S.current.mode = 'series'; S.current.vTarget = 0; forceUpdate(n => n + 1) },
    })
    canvasRef.current._clickAreas.push({
      x: pxs.parallel, y: pY, w: pw, h: ph,
      onClick: () => { S.current.mode = 'parallel'; forceUpdate(n => n + 1) },
    })
    Object.assign(canvasRef.current._dbg, {
      swX, swY: y1, modeSeries: pxs.series + pw / 2, modeParallel: pxs.parallel + pw / 2, pillY: pY + ph / 2,
      r1x, r2x, midY, scale, closed: on, y0, y1, areaH, top, bottom,
    })

    // ── 知识卡 ──
    const SECTIONS = buildSections(sol, series)
    if (lay.compact) {
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      let ky = panel.y + 12
      const px = panel.x + 14
      ctx.font = `bold ${lay.font.data}px monospace`; ctx.fillStyle = '#333'
      if (series) {
        ctx.fillText(`I = ${sol.I.toFixed(2)} A`, px, ky); ky += 18
        ctx.fillText(`U₁ = ${sol.U1.toFixed(2)} V`, px, ky); ky += 18
        ctx.fillText(`U₂ = ${sol.U2.toFixed(2)} V`, px, ky); ky += 18
      } else {
        ctx.fillText(`U = ${sol.U.toFixed(2)} V`, px, ky); ky += 18
        ctx.fillText(`I₁ = ${sol.I1.toFixed(2)} A`, px, ky); ky += 18
        ctx.fillText(`I₂ = ${sol.I2.toFixed(2)} A`, px, ky); ky += 18
      }
      ctx.fillStyle = on ? '#2E7D32' : '#888'
      ctx.font = `bold ${lay.font.body}px sans-serif`
      ctx.fillText(on ? '● 通路' : '○ 断路', px, ky)
      ctx.textBaseline = 'alphabetic'
      return
    }

    drawKnowledgeCard(ctx, panel, SECTIONS, {
      title: '串并联电路规律',
      tip: (c, tx, ty) => {
        if (!on) {
          c.fillStyle = '#B08954'
          c.fillText(`○ 断开：先连好${series ? '串联' : '并联'}电路（点上方药丸切换接法），再闭合开关`, tx, ty + 10)
          return
        }
        c.fillStyle = '#C2410C'
        c.fillText(series
          ? `● 串联三表读数：A 表 I = ${sol.I.toFixed(2)} A｜V₁ 表 U₁ = ${sol.U1.toFixed(2)} V｜V₂ 表 U₂ = ${sol.U2.toFixed(2)} V｜V 表 U = ${sol.Utot.toFixed(2)} V（U₁+U₂ = U）`
          : `● 并联三表读数：A 表 I = ${sol.I.toFixed(2)} A｜A₁ 表 I₁ = ${sol.I1.toFixed(2)} A｜A₂ 表 I₂ = ${sol.I2.toFixed(2)} A｜V 表 U = ${sol.U.toFixed(2)} V（I₁+I₂ = I）`,
          tx, ty + 10)
      },
    })
    ctx.textBaseline = 'alphabetic'
  }

  /* ── 串联接法 ── */
  function drawSeries(ctx, g) {
    const { x0, y0, x1, y1, midY, r1x, r2x, battX, swX, hRes, hMeter, hBat, hSw, scale, ink, wc, lw, on, sol, labelFont } = g
    const s = S.current
    const volR = 13 * scale
    const voltInk = on ? '#558B2F' : ink

    // 导线（符号处留缺口）
    drawLine(ctx, x0, y0, r1x - hRes, y0, wc, lw)
    drawLine(ctx, r1x + hRes, y0, r2x - hRes, y0, wc, lw)
    drawLine(ctx, r2x + hRes, y0, x1, y0, wc, lw)
    drawLine(ctx, x1, y0, x1, midY - hMeter, wc, lw)
    drawLine(ctx, x1, midY + hMeter, x1, y1, wc, lw)
    drawLine(ctx, x0, y0, x0, y1, wc, lw)
    drawLine(ctx, x0, y1, battX - hBat, y1, wc, lw)
    drawLine(ctx, battX + hBat, y1, swX - hSw, y1, wc, lw)
    drawLine(ctx, swX + hSw, y1, x1, y1, wc, lw)

    // 三只电压表的并联引线：V₁ 并在 R₁、V₂ 并在 R₂，V 并在两只电阻串联后的整段
    const vTier = y0 - 58 * scale          // V₁ / V₂ 高度
    const vTotTier = y0 - 110 * scale       // 总电压表高度
    const tap = hRes + 14 * scale
    const tapTotL = r1x - hRes - 26 * scale
    const tapTotR = r2x + hRes + 26 * scale
    const vTotX = (r1x + r2x) / 2
    ctx.save()
    ctx.strokeStyle = on ? '#7CB342' : '#9aa7b1'
    ctx.lineWidth = 1.6 * scale + 0.4
    ctx.beginPath()
    // V₁
    ctx.moveTo(r1x - tap, y0); ctx.lineTo(r1x - tap, vTier); ctx.lineTo(r1x - volR - 2, vTier)
    ctx.moveTo(r1x + tap, y0); ctx.lineTo(r1x + tap, vTier); ctx.lineTo(r1x + volR + 2, vTier)
    // V₂
    ctx.moveTo(r2x - tap, y0); ctx.lineTo(r2x - tap, vTier); ctx.lineTo(r2x - volR - 2, vTier)
    ctx.moveTo(r2x + tap, y0); ctx.lineTo(r2x + tap, vTier); ctx.lineTo(r2x + volR + 2, vTier)
    // V 总
    ctx.moveTo(tapTotL, y0); ctx.lineTo(tapTotL, vTotTier); ctx.lineTo(vTotX - volR - 2, vTotTier)
    ctx.moveTo(tapTotR, y0); ctx.lineTo(tapTotR, vTotTier); ctx.lineTo(vTotX + volR + 2, vTotTier)
    ctx.stroke()
    ctx.restore()

    // 符号
    symResistor(ctx, r1x, y0, { scale, ink })
    symResistor(ctx, r2x, y0, { scale, ink })
    symMeter(ctx, x1, midY, { kind: 'A', scale, ink })
    symMeter(ctx, r1x, vTier, { kind: 'V', scale, ink: voltInk })
    symMeter(ctx, r2x, vTier, { kind: 'V', scale, ink: voltInk })
    symMeter(ctx, vTotX, vTotTier, { kind: 'V', scale, ink: voltInk })
    symBattery(ctx, battX, y1, { n: 2, scale, ink, flip: true })
    symSwitch(ctx, swX, y1, { closed: on, scale, ink })

    canvasRef.current._clickAreas.push({
      x: swX - hSw - 12, y: y1 - 22, w: (hSw + 12) * 2, h: 44,
      onClick: () => { S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1) },
    })

    // 电子流动：走外圈并在 R₁、R₂、电流表处留缺口
    if (on) {
      const path = [
        { x: battX + hBat, y: y1 }, { x: swX + hSw, y: y1 }, { x: x1, y: y1 },
        { x: x1, y: midY + hMeter }, { x: x1, y: midY - hMeter }, { x: x1, y: y0 },
        { x: r2x + hRes, y: y0 }, { x: r2x - hRes, y: y0 },
        { x: r1x + hRes, y: y0 }, { x: r1x - hRes, y: y0 },
        { x: x0, y: y0 }, { x: x0, y: y1 }, { x: battX - hBat, y: y1 },
      ]
      drawCurrentFlow(ctx, path, s.time, 0.5)
    }

    // 标注
    ctx.fillStyle = '#667'; ctx.font = `${labelFont}px sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('电源', battX, y1 + 26 * scale)
    ctx.fillText(on ? '开关（闭合）' : '开关（断开）', swX, y1 + 26 * scale)
    ctx.fillText('R₁ = 10 Ω', r1x, y0 + 22 * scale)
    ctx.fillText('R₂ = 20 Ω', r2x, y0 + 22 * scale)
    ctx.textAlign = 'right'
    ctx.fillText('电流表 A（干路，处处相等）', x1 - 20 * scale, midY - 16 * scale)
    ctx.fillText(`I = ${sol.I.toFixed(2)} A`, x1 - 20 * scale, midY + 4 * scale)

    // 分压表读数（写在表圈下方的并联框内）
    ctx.textAlign = 'center'
    ctx.fillStyle = '#B45309'
    ctx.fillText(`U₁ = ${sol.U1.toFixed(2)} V`, r1x, vTier + volR + 6 * scale)
    ctx.fillText(`U₂ = ${sol.U2.toFixed(2)} V`, r2x, vTier + volR + 6 * scale)
    ctx.fillStyle = '#C2410C'
    ctx.fillText('总电压表 V（测整段）', vTotX, vTotTier - volR - 26 * scale)
    ctx.fillText(`U = ${sol.Utot.toFixed(2)} V`, vTotX, vTotTier + volR + 6 * scale)
    // 串联等式，让读数自己说话
    ctx.fillStyle = '#15803D'
    ctx.fillText(`U₁ + U₂ = ${(sol.U1 + sol.U2).toFixed(2)} V = U`, vTotX, vTotTier - volR - 12 * scale)
  }

  /* ── 并联接法 ── */
  function drawParallel(ctx, g) {
    const { x0, y0, x1, y1, midX, midY, r1x, r2x, battX, swX, hRes, hMeter, hBat, hSw, scale, ink, wc, lw, on, sol, labelFont } = g
    const s = S.current

    // 干路 + 两条支路：电源、开关在分叉之前，右边不再另画一条把两条支路短路的导线
    const volR = 13 * scale
    // 支路里的电流表位置（电阻下方）
    const aY = midY + hRes + 14 * scale + hMeter
    const loopW = x1 - x0
    const vx = x0 + loopW * 0.42           // 电压表竖直跨接在两导轨之间（并联段两端）

    drawLine(ctx, x0, y0, r2x, y0, wc, lw)                    // 上边（两条支路的公共接点）
    drawLine(ctx, x0, y1, battX - hBat, y1, wc, lw)
    drawLine(ctx, battX + hBat, y1, swX - hSw, y1, wc, lw)
    drawLine(ctx, swX + hSw, y1, r2x, y1, wc, lw)             // 下边（公共接点，电压表引线在此接出）
    drawLine(ctx, x0, y0, x0, midY - hMeter, wc, lw)          // 左边干路（总电流表）
    drawLine(ctx, x0, midY + hMeter, x0, y1, wc, lw)
    // 电压表竖直引线（跨在并联段两端）
    drawLine(ctx, vx, y0, vx, midY - volR - 2, on ? '#7CB342' : '#9aa7b1', 1.6 * scale + 0.4)
    drawLine(ctx, vx, midY + volR + 2, vx, y1, on ? '#7CB342' : '#9aa7b1', 1.6 * scale + 0.4)
    // 两条支路：R 在上、A 在下
    for (const bx of [r1x, r2x]) {
      drawLine(ctx, bx, y0, bx, midY - hRes, wc, lw)
      drawLine(ctx, bx, midY + hRes, bx, aY - hMeter, wc, lw)
      drawLine(ctx, bx, aY + hMeter, bx, y1, wc, lw)
    }

    // 符号：两只电阻竖着放（旋转 90°）
    for (const bx of [r1x, r2x]) {
      ctx.save()
      ctx.translate(bx, midY); ctx.rotate(Math.PI / 2)
      symResistor(ctx, 0, 0, { scale, ink })
      ctx.restore()
    }
    symMeter(ctx, x0, midY, { kind: 'A', scale, ink })
    symMeter(ctx, vx, midY, { kind: 'V', scale, ink: on ? '#558B2F' : ink })
    symMeter(ctx, r1x, aY, { kind: 'A', scale, ink })
    symMeter(ctx, r2x, aY, { kind: 'A', scale, ink })
    symBattery(ctx, battX, y1, { n: 2, scale, ink, flip: true })
    symSwitch(ctx, swX, y1, { closed: on, scale, ink })

    canvasRef.current._clickAreas.push({
      x: swX - hSw - 12, y: y1 - 22, w: (hSw + 12) * 2, h: 44,
      onClick: () => { S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1) },
    })

    // 电子流动：干路（电源→开关→支路接点）+ R₁ 支路 + R₂ 支路
    if (on) {
      const main = [
        { x: battX + hBat, y: y1 }, { x: swX - hSw, y: y1 }, { x: swX + hSw, y: y1 },
        { x: r1x, y: y1 }, { x: r1x, y: aY + hMeter }, { x: r1x, y: aY - hMeter },
        { x: r1x, y: midY + hRes }, { x: r1x, y: midY - hRes }, { x: r1x, y: y0 },
        { x: x0, y: y0 }, { x: x0, y: midY - hMeter }, { x: x0, y: midY + hMeter },
        { x: x0, y: y1 }, { x: battX - hBat, y: y1 },
      ]
      drawCurrentFlow(ctx, main, s.time, 0.5)
      drawCurrentFlow(ctx, [
        { x: r2x, y: y0 }, { x: r2x, y: midY - hRes }, { x: r2x, y: midY + hRes },
        { x: r2x, y: aY - hMeter }, { x: r2x, y: aY + hMeter }, { x: r2x, y: y1 },
      ], s.time, 0.5)
    }

    // 标注
    ctx.fillStyle = '#667'; ctx.font = `${labelFont}px sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('电源', battX, y1 + 26 * scale)
    ctx.fillText(on ? '开关（闭合）' : '开关（断开）', swX, y1 + 26 * scale)
    // 电阻 / 支路电流表读数：各贴各自元件写，避免两个读数连成一行难以对应
    ctx.textAlign = 'left'
    ctx.fillText('R₁ = 10 Ω', r1x + hRes + 10, midY - 8 * scale)
    ctx.fillText(`A₁：${sol.I1.toFixed(2)} A`, r1x + hMeter + 10, aY - 4 * scale)
    ctx.textAlign = 'right'
    ctx.fillText('R₂ = 20 Ω', r2x - hRes - 10, midY - 8 * scale)
    ctx.fillText(`A₂：${sol.I2.toFixed(2)} A`, r2x - hMeter - 10, aY - 4 * scale)
    // 总表
    ctx.fillText('总电流表 A（干路）', x0 - 12 * scale, midY - 8 * scale)
    ctx.fillText(`I = ${sol.I.toFixed(2)} A`, x0 - 12 * scale, midY + 12 * scale)
    ctx.textAlign = 'center'
    ctx.fillStyle = '#B45309'
    ctx.fillText(`U = ${sol.U.toFixed(2)} V`, vx, midY + volR + 10 * scale)
    ctx.textAlign = 'center'
    ctx.fillStyle = '#15803D'
    ctx.fillText(`I₁ + I₂ = ${(sol.I1 + sol.I2).toFixed(2)} A = I`, (r1x + r2x) / 2, y1 + 26 * scale)
  }

  /* ── 卡片内容 ── */
  function buildSections(sol, series) {
    const dataRows = series
      ? [
          [['I = '], [`${sol.I.toFixed(2)} A`, '#C2410C', 1], ['（干路与各元件'], ['处处相等', '#DC2626', 1], ['）']],
          [['U₁ = '], [`${sol.U1.toFixed(2)} V`, '#C2410C', 1], ['，U₂ = '], [`${sol.U2.toFixed(2)} V`, '#C2410C', 1], ['，U = '], [`${sol.Utot.toFixed(2)} V`, '#DC2626', 1], ['（U = U₁+U₂）']],
          [['R = R₁ + R₂ = '], [`${sol.Rtot.toFixed(0)} Ω`, '#15803D', 1], ['；电压按电阻'], ['成正比分配', '#C2410C', 1], ['（大电阻分得多）']],
        ]
      : [
          [['U = '], [`${sol.U.toFixed(2)} V`, '#C2410C', 1], ['（各支路两端'], ['电压相等', '#DC2626', 1], ['）']],
          [['I₁ = '], [`${sol.I1.toFixed(2)} A`, '#C2410C', 1], ['，I₂ = '], [`${sol.I2.toFixed(2)} A`, '#C2410C', 1], ['，I = '], [`${sol.I.toFixed(2)} A`, '#DC2626', 1], ['（I = I₁+I₂）']],
          [['1/R = 1/R₁ + 1/R₂ → R = '], [`${sol.Rtot.toFixed(1)} Ω`, '#15803D', 1], ['；电流按电阻'], ['反比分配', '#C2410C', 1], ['（小电阻分流多）']],
        ]

    return [
      {
        t: '实验目的', c: '#E0761F',
        items: [
          [['探究'], ['串联', '#C2410C', 1], ['与'], ['并联', '#C2410C', 1], ['电路中电流、电压、电阻的规律。']],
          [['学会用电流表测干路/支路电流、电压表测各段电压，并会用'], ['I=U/R', '#DC2626', 1], ['算总电阻。']],
        ],
      },
      {
        t: '实验器材', c: '#C98A12',
        items: [
          [['电源、开关、定值电阻 '], ['R₁ = 10 Ω', '#C2410C', 1], ['、'], ['R₂ = 20 Ω', '#C2410C', 1], ['、']],
          [['电压表 '], ['3 只', '#C2410C', 1], ['（串联：V₁ 测 R₁、V₂ 测 R₂、V 测整段）']],
          [['电流表 '], ['3 只', '#C2410C', 1], ['（并联：A₁ 测 R₁ 支路、A₂ 测 R₂ 支路、A 测干路）'], ['、导线。']],
        ],
      },
      {
        t: '串联电路规律', c: '#CA8A04',
        items: [
          [['电流：'], ['I = I₁ = I₂', '#DC2626', 1], ['（只有一条路径，处处相等）。']],
          [['电压：'], ['U = U₁ + U₂', '#DC2626', 1], ['（总电压等于各部分电压之和）。']],
          [['电阻：'], ['R = R₁ + R₂', '#DC2626', 1], ['（相当于导体变长，总电阻比任一个都大）。']],
          [['分压：U₁ : U₂ = R₁ : R₂，'], ['大电阻分得电压多', '#C2410C', 1], ['。']],
        ],
      },
      {
        t: '并联电路规律', c: '#C2410C',
        items: [
          [['电压：'], ['U = U₁ = U₂', '#DC2626', 1], ['（各支路两端电压相等）。']],
          [['电流：'], ['I = I₁ + I₂', '#DC2626', 1], ['（干路电流等于各支路之和）。']],
          [['电阻：'], ['1/R = 1/R₁ + 1/R₂', '#DC2626', 1], ['（相当于导体变粗，总电阻比任一个都小）。']],
          [['分流：I₁ : I₂ = R₂ : R₁，'], ['小电阻分流多', '#C2410C', 1], ['。']],
        ],
      },
      {
        t: '实验步骤', c: '#B45309',
        items: [
          [['① 画电路图，'], ['断开开关', '#DC2626', 1], ['按图连线；电流表'], ['串联', '#15803D', 1], ['、电压表'], ['并联', '#15803D', 1], ['，正负柱别接反。']],
          [['② 串联：两电阻首尾相接，电压表分别并在 R₁、R₂ 和总两端，记 3 组数据。']],
          [['③ 并联：两电阻并排接在同一对节点上，电压表并在支路两端，电流表测干路。']],
          [['④ 比较数据，归纳「电流、电压、电阻」三条规律。']],
        ],
      },
      { t: series ? '本次数据（串联）' : '本次数据（并联）', c: '#15803D', items: dataRows },
      {
        t: '注意事项', c: '#DC2626',
        items: [
          [['连线、换接法时必须'], ['断开开关', '#DC2626', 1], ['；改接前先'], ['断开电源', '#DC2626', 1], ['。']],
          [['电表量程要合适，'], ['先用大量程试触', '#C2410C', 1], ['；「+」柱接高电位端。']],
          [['并联时不要把电源两极直接连起来'], ['（短路）', '#DC2626', 1], ['。']],
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

  const handleMouseMove = useCallback(() => {
    if (!S.current.dragging || S.current.tab !== 1) return
  }, [])

  const handleMouseUp = useCallback(() => { S.current.dragging = false }, [])

  const handleReset = useCallback(() => {
    S.current.switchClosed = false
    S.current.mode = 'series'
    S.current.vTarget = 0
    builderRef.current?.reset()
    forceUpdate(n => n + 1)
  }, [])

  const handleAddFromPalette = useCallback((type) => { builderRef.current?.add(type) }, [])
  const handleDropFromPalette = useCallback((type, clientX, clientY) => { builderRef.current?.addAt(type, clientX, clientY) }, [])
  const handlePickColor = useCallback((color) => { S.current.wireColor = color; forceUpdate(v => v + 1) }, [])

  return (
    <SceneShell
      title="串并联电路规律"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t) }}
      tab1Label="📖 电路演示"
      tab2Label="🔧 自己动手"
      onReset={handleReset}
      desc={tab === 1 ? (
        <>
          <b>串并联电路规律</b>
          <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
            电路演示：切换串联/并联 · 看 I、U、R 三条规律
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
            purpose="探究串联、并联电路中电流、电压、电阻的规律：I 处处相等 / U 相加 / R 相加；U 相等 / I 相加 / R 变小。"
            steps={[
              '点画面下方药丸切换「串联 / 并联」',
              '闭合开关，读三只表：串联读 U₁、U₂、U；并联读 I₁、I₂、I',
              '串联看 U₁ + U₂ = U；并联看 I₁ + I₂ = I',
            ]}
            hint="总表、分表都在电路里：串联用 3 只电压表（分压相加等于总压），并联用 3 只电流表（分流相加等于总流）。"
          />
        ) : (
          <InfoDock
            align="left"
            offset={{ left: 26, top: 26 }}
            hint="点右侧器材加入 → 拖拽移动 → 点接线柱连线。串联把两电阻首尾相接；并联让两电阻两端并在一起。轻点开关通断，双击电表看读数，双击器材或按 Delete 删除。"
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

function drawCurrentFlow(ctx, points, time, speed) {
  let totalLen = 0; const segs = []
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x, dy = points[i + 1].y - points[i].y
    const len = Math.sqrt(dx * dx + dy * dy)
    segs.push({ ...points[i], ex: points[i + 1].x, ey: points[i + 1].y, len }); totalLen += len
  }
  if (totalLen < 8) return
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
