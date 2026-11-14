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
 * VoltAmpereResistorScene — 伏安法测定值电阻（第 2 个按「简单电路」模板改造的电学实验）
 *
 *   Tab1 📖 电路演示 —— 暖色底 + 标准符号回路（滑变限流 + 电流表串联 + 电压表并联在 R_x 两端）
 *                        可点/可拖滑片、可点开关；点「记录一组数据」攒 2～3 组求平均
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

const RHEO_MAX = 20        // 20Ω 2A 滑动变阻器
const RX = 5.0             // 待测定值电阻（约 5Ω）
const MAX_REC = 3          // 最多记 3 组

export default function VoltAmpereResistorScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const builderRef = useRef(null)

  const S = useRef({
    tab: 1,
    switchClosed: false,
    time: 0,
    ratio: 1,               // 滑片位置：1 = 阻值最大（右端）
    records: [],            // [{ u, i, r }]
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

  /** 物理：R_x 与滑变、电流表内阻串联；电压表 1e7 视为理想 */
  function solve() {
    const s = S.current
    const Rr = Math.round(s.ratio * RHEO_MAX * 10) / 10
    const I = s.switchClosed ? CFG.VS.V / (RX + Rr + CFG.AMM_R) : 0
    const Ux = I * RX
    return { Rr, I, Ux, Rmeas: I > 0.005 ? Ux / I : 0 }
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
    const top = lay.circuit.T, bottom = lay.circuit.B - (lay.compact ? 0 : 36)
    const areaW = right - left, areaH = bottom - top

    const scaleOf = (w) => Math.max(0.55, Math.min(1.1, w / 420))
    let loopW = Math.min(areaW * 0.74, 540)
    const chipUp = 62 * scaleOf(loopW), chipDn = 140 * scaleOf(loopW)
    const room = areaH - (chipUp + chipDn + 8)
    if (room > 60) loopW = Math.min(loopW, room / 0.52)
    const scale = scaleOf(loopW)
    const loopH = loopW * 0.52
    const x0 = left + (areaW - loopW) / 2
    const y0 = top + Math.max(chipUp + 4, (areaH - (loopH + chipUp + chipDn)) / 2) + chipUp
    const x1 = x0 + loopW, y1 = y0 + loopH
    const midX = x0 + loopW / 2, midY = y0 + loopH / 2

    // 上边：滑变（左）、电流表（右）；下边：电源、待测电阻、开关
    const rheoX = x0 + loopW * 0.30
    const amX = x0 + loopW * 0.74
    const battX = x0 + loopW * 0.22
    const rxX = x0 + loopW * 0.56
    const swX = x0 + loopW * 0.84

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

    // 电压表：并联在待测电阻两端（回路内、R_x 上方；引线从 R_x 两端各让开一段，看着不挤）
    const volY = y1 - 62 * scale, volR = 13 * scale, vTap = hRes + 16 * scale
    ctx.save()
    ctx.strokeStyle = on ? '#7CB342' : '#9aa7b1'
    ctx.lineWidth = 1.6 * scale + 0.4
    ctx.beginPath()
    ctx.moveTo(rxX - vTap, y1); ctx.lineTo(rxX - vTap, volY); ctx.lineTo(rxX - volR - 2, volY)
    ctx.moveTo(rxX + vTap, y1); ctx.lineTo(rxX + vTap, volY); ctx.lineTo(rxX + volR + 2, volY)
    ctx.stroke()
    ctx.restore()

    // ─── 符号 ───
    const geo = symRheostat(ctx, rheoX, y0, { scale, ratio: s.ratio, ink })
    symMeter(ctx, amX, y0, { kind: 'A', scale, ink })
    symResistor(ctx, rxX, y1, { scale, ink })
    symMeter(ctx, rxX, volY, { kind: 'V', scale, ink: on ? '#558B2F' : ink })
    symBattery(ctx, battX, y1, { n: 2, scale, ink, flip: true })
    symSwitch(ctx, swX, y1, { closed: on, scale, ink })

    // 电子流动（符号之后画：滑变内部走「左端 → 线圈 → 箭头杆 → 横线 → 右端」）
    if (on) {
      const path = [
        { x: battX + hBat, y: y1 }, { x: rxX - hRes, y: y1 },
        { x: rxX + hRes, y: y1 }, { x: swX + hSw, y: y1 },                                 // 让开 R_x
        { x: x1, y: y1 }, { x: x1, y: y0 },
        { x: amX + hMeter, y: y0 }, { x: amX - hMeter, y: y0 },                            // 让开电流表
        { x: rheoX + geo.half, y: y0 },
        { x: rheoX + geo.W / 2, y: y0 }, { x: rheoX + geo.W / 2, y: geo.topY },            // 出右端柱
        { x: geo.ax, y: geo.topY },                                                        // 横线到滑片
        { x: geo.ax, y: y0 },                                                              // 箭头杆到线圈
        { x: rheoX - geo.W / 2, y: y0 }, { x: rheoX - geo.half, y: y0 },                    // 沿线圈到左端
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

    // 记录按钮（回路下方）
    const recW = 176 * scale, recH = 32 * scale
    const recX = midX - recW / 2, recY = y1 + 62 * scale
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
          S.current.records.push({ u: cur.Ux, i: cur.I, r: cur.Rmeas })
          forceUpdate(n => n + 1)
        },
      })
    }

    // 调试/验收钩子
    canvasRef.current._dbg = {
      swX, swY: y1, rheoX, rheoY: y0, hRheo, hSw, rxX, recX: midX, recY: recY + recH / 2, scale,
    }

    // ─── 标注 ───
    const labelFont = Math.max(9, Math.round(11 * scale))
    ctx.fillStyle = '#667'; ctx.font = `${labelFont}px sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('电源', battX, y1 + 26 * scale)
    ctx.fillText(on ? '开关（闭合）' : '开关（断开）', swX, y1 + 26 * scale)
    ctx.fillText(`待测电阻  R_x = ${RX.toFixed(1)} Ω`, rxX, y1 + 26 * scale)
    ctx.fillText('电流表 A（串联）', amX, y0 - 34 * scale)
    ctx.fillText(`滑动变阻器  R₁ = ${sol.Rr.toFixed(1)} Ω（0～20 Ω）`, rheoX, y0 + 20 * scale)
    ctx.fillText('电压表 V（并联在 R_x 两端）', rxX, volY - 24 * scale)
    ctx.textAlign = 'left'
    ctx.fillText(`V 表：${sol.Ux.toFixed(2)} V`, rxX + volR + 26, volY - 5 * scale)
    ctx.textAlign = 'center'
    ctx.fillText(`A 表：${sol.I.toFixed(2)} A`, amX, y0 + 20 * scale)

    // 滑片说明：一行，贴在滑变下方
    ctx.fillStyle = '#B08954'; ctx.font = `${labelFont}px sans-serif`
    ctx.fillText('← 滑片左移 R₁ 变小　·　右移 R₁ 变大 →', rheoX, y0 + 38 * scale)

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
      ctx.fillText(`R₁ = ${sol.Rr.toFixed(1)} Ω`, px, ky); ky += 18
      ctx.fillText(`I = ${sol.I.toFixed(2)} A`, px, ky); ky += 18
      ctx.fillText(`U_x = ${sol.Ux.toFixed(2)} V`, px, ky); ky += 18
      ctx.fillStyle = on ? '#2E7D32' : '#888'
      ctx.font = `bold ${lay.font.body}px sans-serif`
      ctx.fillText(on ? '● 通路' : '○ 断路', px, ky)
      ctx.textBaseline = 'alphabetic'
      return
    }

    drawKnowledgeCard(ctx, panel, SECTIONS, {
      title: '📖 伏安法测电阻知识',
      tip: (c, tx, ty) => {
        if (on) {
          c.fillStyle = '#C2410C'
          c.fillText(
            `● 闭合：R₁ = ${sol.Rr.toFixed(1)} Ω　I = ${sol.I.toFixed(2)} A　U_x = ${sol.Ux.toFixed(2)} V　R = U/I = ${sol.Rmeas.toFixed(1)} Ω`,
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
    const rows = records.map((r, i) => [
      [`第 ${i + 1} 次：U = `], [`${r.u.toFixed(2)} V`, '#C2410C', 1],
      ['，I = '], [`${r.i.toFixed(2)} A`, '#C2410C', 1],
      [' → R = '], [`${r.r.toFixed(1)} Ω`, '#15803D', 1],
    ])
    if (records.length >= 2) {
      const avg = records.reduce((a, r) => a + r.r, 0) / records.length
      rows.push([
        ['平均 R̄ = '], [`${avg.toFixed(1)} Ω`, '#DC2626', 1],
        [`（${records.length} 次取平均，减小误差）`],
      ])
    }
    if (!rows.length) {
      rows.push([['闭合开关后拖动滑片，点下方「📋 记录一组数据」，攒 2～3 组再求平均。']])
    }

    return [
      {
        t: '实验目的', c: '#E0761F',
        items: [
          [['用'], ['电压表', '#C2410C', 1], ['和'], ['电流表', '#C2410C', 1], ['测未知电阻，学会 '], ['R = U/I', '#DC2626', 1], ['。']],
          [['用滑动变阻器'], ['改变 R_x 两端的电压和电流', '#C2410C', 1], ['，'], ['多次测量求平均值', '#15803D', 1], ['减小误差。']],
          [['会画电路图、会按图连线、会正确读表和记录数据。']],
        ],
      },
      {
        t: '实验器材', c: '#C98A12',
        items: [
          [['干电池组、开关、'], ['待测电阻 R_x', '#C2410C', 1], ['（约 5 Ω）、'], ['电流表', '#C2410C', 1], ['、'], ['电压表', '#C2410C', 1], ['、'], ['滑动变阻器（20 Ω 2 A）', '#EA8C1B', 1], ['、导线。']],
        ],
      },
      {
        t: '实验步骤', c: '#CA8A04',
        items: [
          [['① '], ['断开开关', '#DC2626', 1], ['，按电路图连线：电流表'], ['串联', '#15803D', 1], ['，电压表'], ['并联', '#15803D', 1], ['在 R_x 两端。']],
          [['② 滑变「一上一下」串入电路，闭合前把滑片移到'], ['阻值最大处', '#DC2626', 1], ['。']],
          [['③ '], ['闭合开关', '#15803D', 1], ['，调滑片让电压表示数合适，读出 U 和 I。']],
          [['④ 移动滑片，再测 2 组，填表算 R = U/I，取平均值。']],
          [['⑤ '], ['断开开关', '#DC2626', 1], ['，拆线整理器材。']],
        ],
      },
      {
        t: '电路与接法', c: '#C2410C',
        items: [
          [['电流表'], ['串联', '#15803D', 1], ['在回路里（'], ['+ 柱进、− 柱出', '#DC2626', 1], ['），量程先大后小、用'], ['试触法', '#C2410C', 1], ['选。']],
          [['电压表'], ['并联', '#15803D', 1], ['在 R_x 两端，「+」柱接'], ['靠近电源正极的一端', '#DC2626', 1], ['。']],
          [['滑动变阻器'], ['限流', '#C2410C', 1], ['，既改变 U、I，又保护电路。']],
        ],
      },
      {
        t: '数据处理与误差', c: '#B45309',
        items: [
          [['每次'], ['R = U/I', '#DC2626', 1], ['；3 次结果取平均值，减小'], ['偶然误差', '#15803D', 1], ['。']],
          [['电压表分流 → 电流表读数偏大 → 测得的 R 略'], ['偏小', '#C2410C', 1], ['；R 越小这种影响越明显。']],
          [['若被测的是灯泡，灯丝温度变化使电阻改变，'], ['不能用平均法', '#DC2626', 1], ['。']],
        ],
      },
      { t: '本次测量记录', c: '#15803D', items: rows },
      {
        t: '注意事项', c: '#DC2626',
        items: [
          [['连线、改线时开关必须'], ['断开', '#DC2626', 1], ['；闭合前滑片在'], ['阻值最大处', '#DC2626', 1], ['。']],
          [['电表'], ['正负柱不能接反', '#DC2626', 1], ['，量程不能超过；先试触再闭合。']],
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
      title="伏安法测定值电阻"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t) }}
      tab1Label="📖 电路演示"
      tab2Label="🔧 自己动手"
      onReset={handleReset}
      desc={tab === 1 ? (
        <>
          <b>伏安法测定值电阻</b>
          <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
            电路演示：滑变改变 U、I · 多次测量 · R = U/I 求平均
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
            purpose="用电流表、电压表测未知电阻的阻值，学会 R=U/I 并多次测量求平均值。"
            steps={[
              '闭合开关前，滑片放在阻值最大处',
              '闭合开关，读电压表 U 与电流表 I',
              '拖滑片换 2～3 个位置，点「记录一组数据」',
            ]}
            hint="R = U/I；多次测量取平均，减小误差。"
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
