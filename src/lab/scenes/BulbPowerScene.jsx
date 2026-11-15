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
import { symBattery, symSwitch, symBulb, symRheostat, symMeter, symHalf, SYM_INK } from '../render/symbols.js'

/**
 * BulbPowerScene — 伏安法测小灯泡电功率（第 5 个按「简单电路」模板改造的电学实验）
 *
 *   Tab1 📖 电路演示 —— 暖色底 + 标准符号回路：滑变限流 + 电流表串联，
 *                        电压表并联在小灯泡两端；调滑片改电压，看灯泡亮度与 P = U·I；
 *                        点「记录一组数据」记下 U、I、P（不做平均——灯丝电阻随温度变）
 *   Tab2 🔧 自己动手 —— 与简单电路同一套 1:1 SVG 器材（器材栏 9 件 + 三色导线）+
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

const RHEO_MAX = 20        // 20Ω 2A 滑动变阻器
const UN = 2.5             // 小灯泡额定电压 2.5V
const IN = 0.3             // 小灯泡额定电流 0.3A
const PN = UN * IN         // 额定功率 0.75W
const RATIO_STEP = 60      // 仅用于脚本验收时的参考档数（滑片本身连续可调）
const MAX_REC = 4          // 最多记 4 组

/* 灯丝电阻随电压（温度）升高而变大：R(U) = 4.20·U^0.748（U=2.5V→8.3Ω，正好 0.30A）
   实测曲线：0.5V→0.20A、1.0V→0.26A、1.5V→0.28A、2.5V→0.30A、3.0V→0.31A */
function bulbR(u) {
  const uu = Math.max(0, u)
  return Math.max(1.9, 4.20 * Math.pow(uu, 0.748))
}

export default function BulbPowerScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const builderRef = useRef(null)

  const S = useRef({
    tab: 1,
    switchClosed: false,
    time: 0,
    ratio: 1,               // 滑片位置：1 = 阻值最大（右端）
    records: [],            // [{ u, i, p }]
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
    const onResize = () => R.resize()
    window.addEventListener('resize', onResize)
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  /** 物理：灯泡 R 随 U 变（非线性），解自洽电压 U = E·R(U)/(R(U)+R₁+r_A) */
  function solve() {
    const s = S.current
    const Rr = Math.round(s.ratio * RHEO_MAX * 10) / 10
    const E = CFG.VS.V
    const extra = Rr + CFG.AMM_R
    let lo = 0, hi = E
    for (let i = 0; i < 46; i++) {
      const mid = (lo + hi) / 2
      const Rb = bulbR(mid)
      if (mid * (Rb + extra) - E * Rb > 0) hi = mid; else lo = mid
    }
    const Ub = s.switchClosed ? (lo + hi) / 2 : 0
    const Rb = bulbR(Ub)
    const I = Ub / Rb
    const P = Ub * I
    return { Rr, Ub, Rb, I, P }
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
    /* 「半紧凑」：宽而矮的窗口（如 1280×640）仍保留右侧知识卡，只把电路压扁；
       只有真正极端的窄条（W < 900 或 H < 400）才退回紧凑模式。 */
    const lay = (layBase.compact && W >= 900 && H >= 400)
      ? {
        compact: false,
        circuit: { L: W * 0.04, R: W * 0.52, T: 48, B: H - 40 },
        readout: layBase.readout,
        guide: null,
        font: { title: 15, label: 10, body: 12, data: 12 },
      }
      : layBase

    /* ── 知识卡片 ── */
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
    // 回路下方要放「记录按钮 + 灯泡读数」，按总高反解最大可行回路宽（矮窗口别把回路压扁）
    const fits = (wCand) => {
      const sc = scaleOf(wCand)
      return wCand * 0.52 + 62 * sc + 140 * sc + 8 <= areaH
    }
    let loW = 180, hiW = loopW
    for (let i = 0; i < 14; i++) {
      const midW = (loW + hiW) / 2
      if (fits(midW)) loW = midW; else hiW = midW
    }
    loopW = Math.max(180, loW)
    const chipUp = 62 * scaleOf(loopW), chipDn = 140 * scaleOf(loopW)
    const scale = scaleOf(loopW)
    const loopH = loopW * 0.52
    const x0 = left + (areaW - loopW) / 2
    const y0 = top + Math.max(chipUp + 4, (areaH - (loopH + chipUp + chipDn)) / 2) + chipUp
    const x1 = x0 + loopW, y1 = y0 + loopH
    const midX = x0 + loopW / 2, midY = y0 + loopH / 2

    // 上边：滑变（左）、电流表（右）；下边：电源、小灯泡、开关
    const rheoX = x0 + loopW * 0.28
    const amX = x0 + loopW * 0.70
    const battX = x0 + loopW * 0.16
    const bulbX = x0 + loopW * 0.52
    const swX = x0 + loopW * 0.84

    const wc = on ? '#1565C0' : '#9aa7b1'
    const ink = on ? SYM_INK : '#7c8a93'
    const lw = 2 * scale + 0.6

    const hRheo = symHalf('rheostat', scale)
    const hMeter = symHalf('meter', scale)
    const hBulb = symHalf('bulb', scale)
    const hBat = symHalf('battery', scale, 2)
    const hSw = symHalf('switch', scale)

    // ─── 导线（符号处留缺口）───
    drawLine(ctx, x0, y0, rheoX - hRheo, y0, wc, lw)
    drawLine(ctx, rheoX + hRheo, y0, amX - hMeter, y0, wc, lw)
    drawLine(ctx, amX + hMeter, y0, x1, y0, wc, lw)
    drawLine(ctx, x1, y0, x1, y1, wc, lw)
    drawLine(ctx, x0, y0, x0, y1, wc, lw)
    drawLine(ctx, x0, y1, battX - hBat, y1, wc, lw)
    drawLine(ctx, battX + hBat, y1, bulbX - hBulb, y1, wc, lw)
    drawLine(ctx, bulbX + hBulb, y1, swX - hSw, y1, wc, lw)
    drawLine(ctx, swX + hSw, y1, x1, y1, wc, lw)

    // 电压表：并联在小灯泡两端（回路内、灯泡上方；引线从灯泡两端各让开一段）
    const volY = y1 - 62 * scale, volR = 13 * scale, vTap = hBulb + 16 * scale
    ctx.save()
    ctx.strokeStyle = on ? '#7CB342' : '#9aa7b1'
    ctx.lineWidth = 1.6 * scale + 0.4
    ctx.beginPath()
    ctx.moveTo(bulbX - vTap, y1); ctx.lineTo(bulbX - vTap, volY); ctx.lineTo(bulbX - volR - 2, volY)
    ctx.moveTo(bulbX + vTap, y1); ctx.lineTo(bulbX + vTap, volY); ctx.lineTo(bulbX + volR + 2, volY)
    ctx.stroke()
    ctx.restore()

    // ─── 灯泡发光（先画光晕，符号压在上面；亮度随实际功率）───
    if (on && sol.P > 0.02) {
      const br = Math.min(1.45, sol.P / PN)
      const gr = (24 + 26 * br) * scale
      const glow = ctx.createRadialGradient(bulbX, y1, 2, bulbX, y1, gr)
      glow.addColorStop(0, `rgba(255,214,96,${Math.min(0.5, 0.34 * br)})`)
      glow.addColorStop(0.5, `rgba(255,196,72,${Math.min(0.28, 0.16 * br)})`)
      glow.addColorStop(1, 'rgba(255,190,60,0)')
      ctx.fillStyle = glow
      ctx.beginPath(); ctx.arc(bulbX, y1, gr, 0, Math.PI * 2); ctx.fill()
      // 灯丝白热
      const core = ctx.createRadialGradient(bulbX, y1, 0, bulbX, y1, 11 * scale)
      core.addColorStop(0, `rgba(255,255,240,${Math.min(0.95, 0.5 + 0.4 * br)})`)
      core.addColorStop(1, 'rgba(255,236,170,0)')
      ctx.fillStyle = core
      ctx.beginPath(); ctx.arc(bulbX, y1, 11 * scale, 0, Math.PI * 2); ctx.fill()
    }

    // ─── 符号 ───
    const geo = symRheostat(ctx, rheoX, y0, { scale, ratio: s.ratio, ink })
    symMeter(ctx, amX, y0, { kind: 'A', scale, ink })
    symBulb(ctx, bulbX, y1, { scale, ink: on ? '#B26A00' : ink })
    symMeter(ctx, bulbX, volY, { kind: 'V', scale, ink: on ? '#558B2F' : ink })
    symBattery(ctx, battX, y1, { n: 2, scale, ink, flip: true })
    symSwitch(ctx, swX, y1, { closed: on, scale, ink })

    // 电子流动（符号之后画：滑变内部走「左端 → 线圈 → 箭头杆 → 横线 → 右端」）
    if (on) {
      const path = [
        { x: battX + hBat, y: y1 }, { x: bulbX - hBulb, y: y1 },
        { x: bulbX + hBulb, y: y1 }, { x: swX + hSw, y: y1 },
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

    // 滑片可点 / 可拖（映射用滑片真实行程，点两端才能到 0 / 20Ω）
    const travel = Math.max(6 * scale, geo.W / 2 - 7 * scale)
    const sliderArea = { x: rheoX - hRheo, y: y0 - 26 * scale, w: hRheo * 2, h: 44 * scale }
    const slideTo = (mx) => {
      // 实物滑变是连续可调：不做档位吸附，滑片跟手走
      S.current.ratio = Math.max(0, Math.min(1, (mx - (rheoX - travel)) / (travel * 2)))
      forceUpdate(n => n + 1)
    }
    canvasRef.current._clickAreas.push({ ...sliderArea, onClick: slideTo, onDrag: slideTo })
    canvasRef.current._sliderArea = sliderArea

    // 记录按钮（回路下方）
    const recW = 188 * scale, recH = 32 * scale
    const recX = midX - recW / 2, recY = y1 + 62 * scale
    const recount = s.records.length
    const atRated = on && Math.abs(sol.Ub - UN) <= 0.06
    const recActive = on && recount < MAX_REC
    ctx.save()
    ctx.fillStyle = recActive ? (atRated ? '#E8F5E9' : '#FFF3E0') : '#F5F0E8'
    ctx.strokeStyle = recActive ? (atRated ? '#43A047' : '#E0761F') : '#D8CBB8'
    ctx.lineWidth = 1.4
    ctx.beginPath(); ctx.roundRect(recX, recY, recW, recH, recH / 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = recActive ? (atRated ? '#1B5E20' : '#C2410C') : '#A79884'
    ctx.font = `bold ${Math.max(10, Math.round(12 * scale))}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    let recText
    if (recount >= MAX_REC) recText = `已记录 ${MAX_REC} 组（点「重置」清空）`
    else if (atRated) recText = `📋 记额定电压这一组（${recount}/${MAX_REC}）`
    else recText = `📋 记录一组数据（${recount}/${MAX_REC}）`
    ctx.fillText(recText, midX, recY + recH / 2)
    ctx.restore()
    if (recActive) {
      canvasRef.current._clickAreas.push({
        x: recX, y: recY, w: recW, h: recH,
        onClick: () => {
          const cur = solve()
          if (cur.I <= 0.005) return
          S.current.records.push({ u: cur.Ub, i: cur.I, p: cur.P })
          forceUpdate(n => n + 1)
        },
      })
    }

    // 调试/验收钩子
    canvasRef.current._dbg = {
      swX, swY: y1, rheoX, rheoY: y0, hRheo, hSw, bulbX, bulbY: y1, rxX: bulbX,
      recX: midX, recY: recY + recH / 2, scale,
      closed: on, ratio: s.ratio, U: sol.Ub, I: sol.I, P: sol.P, Rr: sol.Rr,
      recN: recount,
    }

    // ─── 标注 ───
    const labelFont = Math.max(9, Math.round(11 * scale))
    ctx.fillStyle = '#667'; ctx.font = `${labelFont}px sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('电源', battX, y1 + 26 * scale)
    ctx.fillText(on ? '开关（闭合）' : '开关（断开）', swX, y1 + 26 * scale)
    ctx.fillText(`小灯泡 ${UN.toFixed(1)} V ${IN.toFixed(1)} A`, bulbX, y1 + 26 * scale)
    // 灯泡亮度一行（按实际功率给出评价）
    if (on) {
      const br = sol.P / PN
      let lit = '正常发光'
      if (br < 0.3) lit = '几乎不发光'
      else if (br < 0.85) lit = '较暗'
      else if (br < 1.08) lit = '正常发光'
      else lit = '超过额定（偏亮·危险）'
      ctx.fillStyle = br >= 1.08 ? '#DC2626' : '#B08954'
      ctx.fillText(`P = ${sol.P.toFixed(2)} W · ${lit}`, bulbX, y1 + 42 * scale)
      ctx.fillStyle = '#667'
    }
    ctx.fillText('电流表 A（串联）', amX, y0 - 34 * scale)
    ctx.fillText(
      scale < 0.95
        ? `R₁ = ${sol.Rr.toFixed(1)} Ω`
        : `滑动变阻器  R₁ = ${sol.Rr.toFixed(1)} Ω（0～20 Ω）`,
      rheoX, y0 + 20 * scale
    )
    ctx.fillText('电压表 V（并联在灯泡两端）', bulbX, volY - 24 * scale)
    ctx.textAlign = 'left'
    ctx.fillText(`V 表：${sol.Ub.toFixed(2)} V`, bulbX + volR + 26, volY - 5 * scale)
    ctx.textAlign = 'center'
    ctx.fillText(`A 表：${sol.I.toFixed(2)} A`, amX, y0 + 20 * scale)

    // 滑片说明
    ctx.fillStyle = '#B08954'; ctx.font = `${labelFont}px sans-serif`
    ctx.fillText(
      scale < 0.95
        ? '← 左移变亮　·　右移变暗 →'
        : '← 左移 R₁ 小（灯变亮）　·　右移 R₁ 大（灯变暗）→',
      rheoX, y0 + 38 * scale
    )

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
      ctx.fillText(`U = ${sol.Ub.toFixed(2)} V`, px, ky); ky += 18
      ctx.fillText(`I = ${sol.I.toFixed(2)} A`, px, ky); ky += 18
      ctx.fillText(`P = ${sol.P.toFixed(2)} W`, px, ky); ky += 18
      ctx.fillStyle = on ? '#2E7D32' : '#888'
      ctx.font = `bold ${lay.font.body}px sans-serif`
      ctx.fillText(on ? '● 通路' : '○ 断路', px, ky)
      ctx.textBaseline = 'alphabetic'
      return
    }

    drawKnowledgeCard(ctx, panel, SECTIONS, {
      title: '📖 小灯泡电功率知识',
      tip: (c, tx, ty) => {
        if (on) {
          c.fillStyle = '#C2410C'
          c.fillText(
            `● 闭合：U = ${sol.Ub.toFixed(2)} V　I = ${sol.I.toFixed(2)} A　P = U·I = ${sol.P.toFixed(2)} W　R灯 = ${sol.Rb.toFixed(1)} Ω`,
            tx, ty + 10
          )
        } else {
          c.fillStyle = '#B08954'
          c.fillText('○ 断开：滑片先移到阻值最大处（最右），再闭合开关（点画面里的开关）', tx, ty + 10)
        }
      },
    })
    ctx.textBaseline = 'alphabetic'
  }

  /* ── 知识卡片内容（7 节，第 6 节是本次测量记录）── */
  function buildSections(records) {
    const rows = records.map((r, i) => {
      const near = Math.abs(r.u - UN) <= 0.05
      return [
        [`第 ${i + 1} 组：U = `], [`${r.u.toFixed(2)} V`, '#C2410C', 1],
        ['，I = '], [`${r.i.toFixed(2)} A`, '#C2410C', 1],
        [' → P = U·I = '], [`${r.p.toFixed(2)} W`, '#15803D', 1],
        near ? ['（额定电压）', '#1B5E20', 1] : [''],
      ]
    })
    if (records.length) {
      // 找最接近额定电压的那一组，与 P额 对照
      let best = records[0]
      for (const r of records) if (Math.abs(r.u - UN) < Math.abs(best.u - UN)) best = r
      rows.push([
        [`最接近 ${UN.toFixed(1)} V 的那组：P = `], [`${best.p.toFixed(2)} W`, '#C2410C', 1],
        ['　额定功率 P额 = '], [`${PN.toFixed(2)} W`, '#DC2626', 1],
        ['（'], [`${UN.toFixed(1)} V × ${IN.toFixed(1)} A`, '#15803D', 1], ['）'],
      ])
    } else {
      rows.push([['闭合开关后调滑片，让电压表到 2.5 V，点下方「📋 记录一组数据」；再换 2.0 V、3.0 V 各记一组。']])
    }

    return [
      {
        t: '实验目的', c: '#E0761F',
        items: [
          [['用'], ['电压表', '#C2410C', 1], ['和'], ['电流表', '#C2410C', 1], ['测小灯泡的'], ['额定功率', '#DC2626', 1], ['和'], ['实际功率', '#DC2626', 1], ['，学会 '], ['P = U·I', '#DC2626', 1], ['。']],
          [['观察不同电压下'], ['灯泡的亮度变化', '#C2410C', 1], ['，理解「额定」与「实际」的区别。']],
          [['会画电路图、按图连线、正确读表和记录数据。']],
        ],
      },
      {
        t: '实验器材', c: '#C98A12',
        items: [
          [['干电池组（3 V）、开关、'], ['小灯泡「2.5 V 0.3 A」+ 灯座', '#C2410C', 1], ['、'], ['电流表', '#C2410C', 1], ['、'], ['电压表', '#C2410C', 1], ['、'], ['滑动变阻器（20 Ω 2 A）', '#EA8C1B', 1], ['、导线。']],
          [['小灯泡上标的「2.5 V 0.3 A」就是它的'], ['额定电压和额定电流', '#C2410C', 1], ['，据此可算出额定功率。']],
        ],
      },
      {
        t: '实验步骤', c: '#CA8A04',
        items: [
          [['① '], ['断开开关', '#DC2626', 1], ['，按电路图连线：电流表'], ['串联', '#15803D', 1], ['，电压表'], ['并联在灯泡两端', '#15803D', 1], ['。']],
          [['② 滑变「一上一下」串入电路，闭合前把滑片移到'], ['阻值最大处', '#DC2626', 1], ['（灯最暗，保护灯泡）。']],
          [['③ '], ['闭合开关', '#15803D', 1], ['，缓慢移动滑片，使电压表示数为'], ['2.5 V（额定电压）', '#DC2626', 1], ['，读出电流 I，算 '], ['P额 = U额·I', '#C2410C', 1], ['。']],
          [['④ 再调到 2.0 V、3.0 V（'], ['不超过额定值太多', '#DC2626', 1], ['），各读一组 U、I，算实际功率，比较亮度。']],
          [['⑤ '], ['断开开关', '#DC2626', 1], ['，拆线整理器材。']],
        ],
      },
      {
        t: '电路与接法', c: '#C2410C',
        items: [
          [['电流表'], ['串联', '#15803D', 1], ['在回路里（'], ['+ 柱进、− 柱出', '#DC2626', 1], ['），量程先大后小、用'], ['试触法', '#C2410C', 1], ['选（本实验约 0.3 A，用 0～0.6 A 档）。']],
          [['电压表'], ['并联', '#15803D', 1], ['在灯泡两端，「+」柱接'], ['靠近电源正极的一端', '#DC2626', 1], ['（约 2.5 V，用 0～3 V 档）。']],
          [['滑动变阻器'], ['限流', '#C2410C', 1], ['：既改变灯泡两端电压，又保护灯泡不被烧坏。']],
        ],
      },
      {
        t: '数据处理：为什么不能求平均', c: '#B45309',
        items: [
          [['每组'], ['P = U·I', '#DC2626', 1], ['：电压不同，功率就不同，'], ['这些 P 不能相加取平均', '#DC2626', 1], ['，它们描述的是不同状态。']],
          [['额定功率只有一个', '#15803D', 1], ['：只有在'], ['额定电压 2.5 V 下', '#C2410C', 1], ['算出的才是 P额；其它电压下算的都是实际功率。']],
          [['灯丝电阻随温度升高而变大', '#C2410C', 1], ['：U 越大灯越亮、灯丝越热、R 越大，所以每组 '], ['R = U/I', '#15803D', 1], [' 都不同，也不能求平均。']],
        ],
      },
      { t: '本次测量记录', c: '#15803D', items: rows },
      {
        t: '注意事项', c: '#DC2626',
        items: [
          [['连线、改线时开关必须'], ['断开', '#DC2626', 1], ['；闭合前滑片在'], ['阻值最大处', '#DC2626', 1], ['。']],
          [['灯泡两端电压'], ['不要超过额定值太多', '#DC2626', 1], ['（本实验别长期停在 3 V），否则灯丝烧断。']],
          [['电表'], ['正负柱不能接反', '#DC2626', 1], ['，量程不能超过；先试触再闭合。']],
          [['读数时视线正对表盘，'], ['估读到最小分度的下一位', '#C2410C', 1], ['；灯泡发光时会烫手，别摸。']],
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
    S.current.ratio = 1
    S.current.records = []
    builderRef.current?.reset()
    forceUpdate(n => n + 1)
  }, [])

  const handleAddFromPalette = useCallback((type) => { builderRef.current?.add(type) }, [])
  const handleDropFromPalette = useCallback((type, clientX, clientY) => { builderRef.current?.addAt(type, clientX, clientY) }, [])
  const handlePickColor = useCallback((color) => { S.current.wireColor = color; forceUpdate(v => v + 1) }, [])

  return (
    <SceneShell
      title="伏安法测小灯泡电功率"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t) }}
      tab1Label="📖 电路演示"
      tab2Label="🔧 自己动手"
      onReset={handleReset}
      desc={tab === 1 ? (
        <>
          <b>伏安法测小灯泡电功率</b>
          <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
            电路演示：调到额定电压测 P额 · 改变电压看亮度 · P = U·I（不取平均）
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
            purpose="用电压表、电流表测小灯泡的额定功率和实际功率，学会 P=U·I，并理解「额定」与「实际」的区别。"
            steps={[
              '闭合前把滑片移到阻值最大处（灯最暗）',
              '闭合开关，缓慢调滑片，让电压表到 2.5 V',
              '读数记 P = U·I（这组就是额定功率）',
              '再调到 2.0 V、3.0 V 各记一组，比较亮度',
            ]}
            hint="不同电压下功率不同，P 不能求平均；灯丝越热电阻越大，R=U/I 也不能平均。"
          />
        ) : (
          <InfoDock
            align="left"
            offset={{ left: 26, top: 26 }}
            hint="点右侧器材加入 → 拖拽移动 → 点接线柱连线。电流表串联、电压表并联在灯泡两端，滑变「一上一下」；轻点开关通断，双击电表看读数，双击器材或按 Delete 删除。"
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
    for (const sg of segs) {
      if (pos <= sg.len) {
        const k = sg.len > 0.01 ? pos / sg.len : 0
        const px = sg.x + (sg.ex - sg.x) * k, py = sg.y + (sg.ey - sg.y) * k
        ctx.beginPath(); ctx.arc(px, py, 2.4, 0, Math.PI * 2); ctx.fill()
        break
      }
      pos -= sg.len
    }
  }
}
