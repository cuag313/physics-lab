import { useState, useRef, useEffect, useCallback } from 'react'
import { eventToCanvas } from '../utils/pointerPos'
import SceneShell from '../ui/SceneShell'
import InfoDock from '../ui/InfoDock'
import BuilderPalette from '../ui/BuilderPalette'
import { drawKnowledgeCard } from '../ui/knowledgeCard'
import BuilderSVG from '../simple3d/BuilderSVG.jsx'
import { TYPES } from './electricSvgInstruments.js'
import { CFG } from '../engine/electricLab.js'
import { symHalf } from '../render/symbols.js'

/**
 * ElectricEnergyScene — 电功与电能表（第 9 个按「简单电路」模板改造的初中电学实验）
 *
 *   与前面几项的根本区别：这一项**不是直流电池电路**，而是家庭电路（220 V）里
 *   用电能表去"量"用电器消耗了多少电能（W = UIt）。教材 18.1《电能 电功》就三件事：
 *     · 电能表怎么读数（5 位整数 + 1 位小数，红色是小数位）
 *     · 1 度电 = 1 kW·h = 3.6×10⁶ J，以及 W = Pt
 *     · 转数法测电功：W = n / N（N = 600 r/kW·h），再按电价算电费
 *   所以 Tab1 搭的是家庭电路：市电进线 → 电能表（1/2 进线、3/4 出线）→ 用电器 → 回零线，
 *   不接电流表、不接滑变 —— 电能表本身就串在干路上，量的是干路电流。
 *
 *   Tab1 📖 电路演示 —— 暖色底 + 标准符号回路（电能表跨在上边、用电器与开关在下边）
 *                        右侧电能表特写：铝盘 + 6 位计数器 + 铭牌 220V 10(40)A 600r/kW·h
 *                        控件：换用电器 / 倍速通时间 / 电价 / 记录一组（W = n/N 与电费）
 *   Tab2 🔧 自己动手 —— 同一套 1:1 SVG 器材（9 件基础 + 本专题专用「电能表」）+
 *                        三色导线 + 一键透视 + 实验记录表（都在 BuilderSVG 里）
 */

function thumb(type) {
  const t = TYPES[type]
  if (!t) return null
  const svg = t.render({ id: `pal-${type}`, f: 0.4 }, { I: 0, kwh: 0, bright: 0.5, frac: 0 })
  return <span dangerouslySetInnerHTML={{ __html: svg }} />
}

/* ── 市电与电能表口径（与引擎 CFG 同一套数） ── */
const U_MAINS = CFG.MAINS_V        // 220 V
const N_KWH = 600                  // 铭牌常数：600 转 / (kW·h)
const MAX_REC = 4
/* 灯支路（固定 100 W 白炽灯）+ 电器支路（下面这三件家用电器任选其一，插在 220 V 两端） */
const LAMP = { k: 'lamp', name: '白炽灯', P: 100, tag: '100 W', half: 13 }
const LOADS = [
  { k: 'washer', name: '洗衣机', P: 500, tag: '500 W', half: 27 },
  { k: 'kettle', name: '电热水壶', P: 800, tag: '800 W', half: 27 },
  { k: 'cooker', name: '电饭锅', P: 1500, tag: '1500 W', half: 28 },
]
const SPEEDS = [
  { v: 1, t: '1×' },
  { v: 60, t: '60×' },
  { v: 600, t: '600×' },
]

/* 设计坐标系（绘制时整体等比缩放并居中） */
const D = {
  L: 72, R: 452, T: 214,                // 回路：上边（电能表）/ 左右竖边
  yA: 420, yB: 545,                     // 两条并联支路的高度（灯支路 / 电器支路）
  zx: 680, zy: 372, zw: 310, zh: 226,    // 电能表特写区（中心 + 宽高）
  row1: 644,                             // 控件第一行（换电器 / 记录）
  row2: 690,                             // 控件第二行（倍速 / 电价 / 复位）
  VW: 900, VH: 730,
}

export default function ElectricEnergyScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const builderRef = useRef(null)

  const S = useRef({
    tab: 1,
    swA: false,               // 灯支路的开关
    swB: false,               // 电器支路的开关
    time: 0,
    load: 0,                  // 用电器下标（LOADS）
    speed: 600,               // 时间倍速（1× / 60× / 600×）
    price: 0.56,              // 电价 ¥/(kW·h)
    kwh: 0,                   // 电能表累计读数（kW·h）
    runT: 0,                  // 累计通电的"模拟时间"（s）
    disc: 0,                  // 铝盘累计转角（rad）
    mark: { kwh: 0, t: 0 },    // 上次记录的基准（读数取差法）
    records: [],
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
    let last = performance.now()
    const loop = (now) => {
      const dtReal = Math.min(0.05, (now - last) / 1000); last = now
      const s = S.current
      s.time += 1 / 60
      /* 电能累积：真实表由"功率×时间"决定，这里的时间按倍速放行（否则 1 度电要等 1 小时） */
      /* 电能累积：两条支路各自按自己的功率计，合计就是流经电能表的那一份 */
      const Pw = (s.swA ? LAMP.P : 0) + (s.swB ? LOADS[s.load].P : 0)
      if (Pw > 0) {
        const Pk = Pw / 1000                         // kW
        const dtSim = dtReal * s.speed               // 模拟秒数
        s.runT += dtSim
        s.kwh += Pk * dtSim / 3600                   // kW·h
        s.disc += 2 * Math.PI * N_KWH * (Pk * dtSim / 3600)   // 铝盘：N 转 / (kW·h)
      }
      render(R)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  /** 物理：两条支路并联在 220 V 两端，各自 I = P/U，干路 I = I₁ + I₂（电能表量的是干路） */
  function solve() {
    const s = S.current
    const A = LOADS[s.load]
    const I1 = s.swA ? LAMP.P / U_MAINS : 0
    const I2 = s.swB ? A.P / U_MAINS : 0
    const I = I1 + I2
    const P = (s.swA ? LAMP.P : 0) + (s.swB ? A.P : 0)
    return {
      I, I1, I2, P,
      on: I > 1e-6,
      name: A.name, tag: A.tag,
      R1: (U_MAINS * U_MAINS) / LAMP.P,
      R2: (U_MAINS * U_MAINS) / A.P,
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
  //  Tab 1
  // ================================================================
  function renderDemo(ctx, W, H) {
    const s = S.current
    const sol = solve()
    const on = sol.I > 1e-6

    /* 右侧知识卡面板 */
    const RAIL = 46
    const pw = Math.max(300, Math.min(W * 0.40, 700))
    const panel = { x: W - 16 - RAIL - pw, y: 10, w: pw, h: H - 38 }
    const viewW = panel.x - 16

    /* 设计坐标 → 屏幕坐标（等比缩放 + 居中；被知识卡压缩时自动缩小） */
    const sc = Math.max(0.5, Math.min(1.12, Math.min(viewW / D.VW, H / D.VH)))
    const ox = (viewW - D.VW * sc) / 2
    const oy = (H - D.VH * sc) / 2
    const TX = (x) => ox + x * sc
    const TY = (y) => oy + y * sc
    const FS = (n) => Math.max(9, Math.round(n * sc))

    ctx.save()
    ctx.translate(ox, oy); ctx.scale(sc, sc)

    const wc = on ? '#1565C0' : '#9aa7b1'
    const lw = 2.6

    /* ─── 家庭电路：交流电源 → 电能表（串在干路）→ 火线竖边 → 两条并联支路 → 零线竖边 → 回电源 ─── */
    const { L, R, T, yA, yB } = D
    const mx = L + (R - L) * 0.5            // 电能表中心
    const MW = 176, MH = 106                // 表框尺寸
    const lampX = L + (R - L) * 0.34
    const lampSwX = L + (R - L) * 0.80
    const applX = lampX
    const applSwX = lampSwX
    const hSw = symHalf('switch', 1)
    const lampHalf = LAMP.half
    const applHalf = LOADS[s.load].half
    const srcY = 392, srcR = 18             // 交流电源符号（左竖边中部，夹在上边和灯支路之间）

    /* 干路：电源 L 端 → 左上角 → 上边穿过电能表 → 火线竖边（T → yB） */
    drawLine(ctx, L, srcY - srcR, L, T, wc, lw)
    drawLine(ctx, L, T, mx - MW / 2, T, wc, lw)
    drawLine(ctx, mx + MW / 2, T, R, T, wc, lw)
    drawLine(ctx, R, T, R, yB, wc, lw)
    /* 零线：电源 N 端 → 零线竖边（srcY+srcR → yB），两条支路的左端都落在这条线上 */
    drawLine(ctx, L, srcY + srcR, L, yB, wc, lw)
    /* 灯支路（并联支路一） */
    drawLine(ctx, R, yA, lampSwX + hSw, yA, wc, lw)
    drawLine(ctx, lampSwX - hSw, yA, lampX + lampHalf, yA, wc, lw)
    drawLine(ctx, lampX - lampHalf, yA, L, yA, wc, lw)
    /* 电器支路（并联支路二） */
    drawLine(ctx, R, yB, applSwX + hSw, yB, wc, lw)
    drawLine(ctx, applSwX - hSw, yB, applX + applHalf, yB, wc, lw)
    drawLine(ctx, applX - applHalf, yB, L, yB, wc, lw)

    /* 火线 / 零线色标（铜排母线的位置用文字标出来，避免学生把两条竖边看混） */
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'right'
    ctx.fillStyle = '#B91C1C'
    ctx.font = `bold ${FS(9)}px "Microsoft YaHei", sans-serif`
    ctx.fillText('火线 L', R - 8, T + 16)
    ctx.textAlign = 'left'
    ctx.fillStyle = '#1D4ED8'
    ctx.fillText('零线 N', L + 8, yB - 16)

    /* 电流流动示意：交流电只示意"在流"，不标电子方向；两条支路各自按自己的电流决定有无 */
    if (sol.I > 0) {
      drawFlow(ctx, [
        { x: L, y: srcY }, { x: L, y: T }, { x: R, y: T }, { x: R, y: yB },
      ], s.time, '#FBBF24')
    }
    if (sol.I1 > 0) drawFlow(ctx, [{ x: R, y: yA }, { x: L, y: yA }], s.time, '#FBBF24')
    if (sol.I2 > 0) drawFlow(ctx, [{ x: R, y: yB }, { x: L, y: yB }], s.time + 0.35, '#FBBF24')

    /* ─── 电能表（回路中的符号化画法：铭牌 + 铝盘 + 计数器）─── */
    drawMeterSym(ctx, mx, T, MW, MH, {
      kwh: s.kwh, I: sol.I, on, disc: s.disc, time: s.time,
    })

    /* 进线 / 出线标注：贴在表框上沿左右两角（1/2 进线、3/4 出线是本实验最要紧的接法；
       完整的"1 相线进 / 2 零线进 / 3 相线出 / 4 零线出"写在表下方那一行，两角只放短箭头） */
    ctx.textBaseline = 'bottom'
    ctx.fillStyle = '#B45309'
    ctx.font = `bold ${FS(10)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'left'
    ctx.fillText('1 · 2 进线 →', mx - MW / 2, T - MH / 2 - 7)
    ctx.textAlign = 'right'
    ctx.fillText('← 3 · 4 出线', mx + MW / 2, T - MH / 2 - 7)

    /* 干路电流 = 两条支路之和（电能表量的就是它）—— 填住回路中段，并把 W = UIt 摆出来 */
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillStyle = on ? '#B45309' : '#A8B4BE'
    ctx.font = `bold ${FS(14)}px "Microsoft YaHei", sans-serif`
    ctx.fillText(
      `干路 I = I₁ + I₂ = ${sol.I1.toFixed(2)} + ${sol.I2.toFixed(2)} = ${sol.I.toFixed(2)} A`,
      mx, T + MH / 2 + 20
    )
    ctx.fillStyle = on ? '#7C2D12' : '#B4BEC7'
    ctx.font = `${FS(10.5)}px "Microsoft YaHei", sans-serif`
    ctx.fillText(
      `W = UIt = ${U_MAINS} V × ${sol.I.toFixed(2)} A × t = ${(U_MAINS * sol.I / 3600).toFixed(2)} W × t`,
      mx, T + MH / 2 + 40
    )
    ctx.fillStyle = '#8D6E63'
    ctx.font = `${FS(8.4)}px "Microsoft YaHei", sans-serif`
    ctx.fillText('电能表串联在干路 · 1/2 进线(L/N) → 3/4 出线(L/N)', mx, T + MH / 2 + 55)

    /* ─── 支路一：白炽灯 100 W ─── */
    drawLoadIcon(ctx, lampX, yA, LAMP.k, {
      on: sol.I1 > 0, P: LAMP.P, time: s.time, FS,
    })
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillStyle = '#5D4037'
    ctx.font = `bold ${FS(10.5)}px "Microsoft YaHei", sans-serif`
    ctx.fillText(`${LAMP.name} ${LAMP.tag}`, lampX, yA + 16)
    ctx.fillStyle = sol.I1 > 0 ? '#B45309' : '#8D6E63'
    ctx.font = `${FS(9.6)}px "Microsoft YaHei", sans-serif`
    ctx.fillText(`R₁ = ${Math.round(sol.R1)} Ω · I₁ = ${sol.I1.toFixed(2)} A`, lampX, yA + 32)

    /* ─── 支路二：电器（洗衣机 / 电热水壶 / 电饭锅 任选）─── */
    drawLoadIcon(ctx, applX, yB, LOADS[s.load].k, {
      on: sol.I2 > 0, P: LOADS[s.load].P, time: s.time, FS,
    })
    ctx.fillStyle = '#5D4037'
    ctx.font = `bold ${FS(10.5)}px "Microsoft YaHei", sans-serif`
    ctx.fillText(`${LOADS[s.load].name} ${LOADS[s.load].tag}`, applX, yB + 16)
    ctx.fillStyle = sol.I2 > 0 ? '#B45309' : '#8D6E63'
    ctx.font = `${FS(9.6)}px "Microsoft YaHei", sans-serif`
    ctx.fillText(`R₂ = ${Math.round(sol.R2)} Ω · I₂ = ${sol.I2.toFixed(2)} A`, applX, yB + 32)

    /* ─── 两只支路开关（画成墙上的面板开关，不画实验台闸刀）─── */
    drawPanelSwitch(ctx, lampSwX, yA, s.swA, { FS })
    drawPanelSwitch(ctx, applSwX, yB, s.swB, { FS })
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillStyle = '#5D4037'
    ctx.font = `bold ${FS(9.5)}px "Microsoft YaHei", sans-serif`
    ctx.fillText(s.swA ? '面板开关 S₁（合）' : '面板开关 S₁（断）', lampSwX, yA + 20)
    ctx.fillText(s.swB ? '面板开关 S₂（合）' : '面板开关 S₂（断）', applSwX, yB + 20)

    /* ─── 交流电源符号（左竖边中部）─── */
    drawACSource(ctx, L, srcY, srcR, { on, FS })

    /* ─── 电能表特写区 ─── */
    drawMeterZoom(ctx, D.zx, D.zy, D.zw, D.zh, {
      kwh: s.kwh, I: sol.I, on, speed: s.speed, price: s.price, FS, disc: s.disc,
    })

    /* ─── 控件第一行：电器支路换电器 + 记录 ─── */
    const r1 = D.row1
    ctx.fillStyle = '#5A4636'
    ctx.font = `bold ${FS(10.5)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText('电器支路', 44, r1)
    let bx = 108
    for (let i = 0; i < LOADS.length; i++) {
      const w = 100
      const active = s.load === i
      ctx.fillStyle = active ? '#F59E0B' : '#FFFFFF'
      ctx.strokeStyle = active ? '#B45309' : '#D7C4A8'
      ctx.lineWidth = 1.6
      ctx.beginPath(); ctx.roundRect(bx, r1 - 15, w, 30, 15); ctx.fill(); ctx.stroke()
      ctx.fillStyle = active ? '#FFFFFF' : '#7A5C3E'
      ctx.font = `bold ${FS(9.6)}px "Microsoft YaHei", sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(`${LOADS[i].name} ${LOADS[i].tag}`, bx + w / 2, r1)
      canvasRef.current._clickAreas.push({
        x: TX(bx), y: TY(r1 - 17), w: w * sc, h: 34 * sc,
        onClick: () => { S.current.load = i; forceUpdate(n => n + 1) },
      })
      bx += w + 8
    }

    /* 记录按钮 */
    const recX = D.zx + 8, recW = 150
    const recOn = on && s.records.length < MAX_REC
    ctx.fillStyle = recOn ? '#FFF7ED' : '#F5F0E8'
    ctx.strokeStyle = recOn ? '#EA580C' : '#D7C4A8'
    ctx.lineWidth = 1.8
    ctx.beginPath(); ctx.roundRect(recX, r1 - 17, recW, 34, 17); ctx.fill(); ctx.stroke()
    ctx.fillStyle = recOn ? '#B45309' : '#A08E76'
    ctx.font = `bold ${FS(10.5)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(`📋 记录一组（${s.records.length}/${MAX_REC}）`, recX + recW / 2, r1)
    canvasRef.current._clickAreas.push({
      x: TX(recX), y: TY(r1 - 19), w: recW * sc, h: 38 * sc,
      onClick: () => {
        if (!on || S.current.records.length >= MAX_REC) return
        const kwh = S.current.kwh - S.current.mark.kwh
        const t = S.current.runT - S.current.mark.t
        S.current.records.push({
          load: `${LAMP.name} + ${LOADS[S.current.load].name}`,
          P: (S.current.swA ? LAMP.P : 0) + (S.current.swB ? LOADS[S.current.load].P : 0),
          t, kwh, n: N_KWH * kwh,
          cost: kwh * S.current.price,
        })
        S.current.mark = { kwh: S.current.kwh, t: S.current.runT }
        forceUpdate(n => n + 1)
      },
    })

    /* ─── 控件第二行：倍速 + 电价 ─── */
    const r2 = D.row2
    ctx.fillStyle = '#5A4636'
    ctx.font = `bold ${FS(10.5)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'left'
    ctx.fillText('时间倍速', 44, r2)
    let sx0 = 108
    for (const sp of SPEEDS) {
      const w = 62
      const active = s.speed === sp.v
      ctx.fillStyle = active ? '#0EA5E9' : '#FFFFFF'
      ctx.strokeStyle = active ? '#0369A1' : '#D7C4A8'
      ctx.lineWidth = 1.6
      ctx.beginPath(); ctx.roundRect(sx0, r2 - 15, w, 30, 15); ctx.fill(); ctx.stroke()
      ctx.fillStyle = active ? '#FFFFFF' : '#7A5C3E'
      ctx.font = `bold ${FS(10)}px "Microsoft YaHei", sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(sp.t, sx0 + w / 2, r2)
      canvasRef.current._clickAreas.push({
        x: TX(sx0), y: TY(r2 - 17), w: w * sc, h: 34 * sc,
        onClick: () => { S.current.speed = sp.v; forceUpdate(n => n + 1) },
      })
      sx0 += w + 8
    }

    /* 电价滑条 */
    const priceX = 336, barW = 140
    ctx.fillStyle = '#5A4636'
    ctx.font = `bold ${FS(10.5)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'left'
    ctx.fillText(`电价 ¥${s.price.toFixed(2)}/kW·h`, priceX, r2 - 22)
    ctx.strokeStyle = '#D7C4A8'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(priceX + 4, r2 + 2); ctx.lineTo(priceX + 4 + barW, r2 + 2); ctx.stroke()
    const px = priceX + 4 + ((s.price - 0.3) / 0.7) * barW
    ctx.fillStyle = '#15803D'
    ctx.beginPath(); ctx.arc(px, r2 + 2, 7, 0, Math.PI * 2); ctx.fill()
    canvasRef.current._clickAreas.push({
      x: TX(priceX), y: TY(r2 - 14), w: (barW + 12) * sc, h: 34 * sc,
      onClick: (mxp) => {
        const v = ((mxp - ox) / sc - (priceX + 4)) / barW
        S.current.price = Math.round((0.3 + Math.max(0, Math.min(1, v)) * 0.7) * 100) / 100
        forceUpdate(n => n + 1)
      },
      onDrag: (mxp) => {
        const v = ((mxp - ox) / sc - (priceX + 4)) / barW
        S.current.price = Math.round((0.3 + Math.max(0, Math.min(1, v)) * 0.7) * 100) / 100
        forceUpdate(n => n + 1)
      },
    })

    /* 复位按钮 */
    const rstX = 552, rstW = 186
    ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#D7C4A8'; ctx.lineWidth = 1.6
    ctx.beginPath(); ctx.roundRect(rstX, r2 - 16, rstW, 32, 16); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#7A5C3E'
    ctx.font = `bold ${FS(10)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText('↻ 表清零重测', rstX + rstW / 2, r2)
    canvasRef.current._clickAreas.push({
      x: TX(rstX), y: TY(r2 - 18), w: rstW * sc, h: 36 * sc,
      onClick: () => {
        S.current.kwh = 0; S.current.runT = 0; S.current.disc = 0
        S.current.mark = { kwh: 0, t: 0 }; S.current.records = []
        S.current.cardScroll = 0
        forceUpdate(n => n + 1)
      },
    })

    ctx.restore()

    /* 两只面板开关的命中区（屏幕坐标） */
    canvasRef.current._clickAreas.push({
      x: TX(lampSwX - 26), y: TY(yA - 30), w: 52 * sc, h: 60 * sc,
      onClick: () => { S.current.swA = !S.current.swA; forceUpdate(n => n + 1) },
    })
    canvasRef.current._clickAreas.push({
      x: TX(applSwX - 26), y: TY(yB - 30), w: 52 * sc, h: 60 * sc,
      onClick: () => { S.current.swB = !S.current.swB; forceUpdate(n => n + 1) },
    })

    /* ─── 知识卡片 ─── */
    const SEC_COLORS = ['#E0761F', '#C98A12', '#CA8A04', '#C2410C', '#B45309', '#15803D', '#7C3AED', '#DC2626']
    const SECTIONS = buildSections(s.records, s).map((sec, i) => ({
      t: sec.title, c: SEC_COLORS[i % SEC_COLORS.length], items: sec.lines,
    }))
    const cardOut = drawKnowledgeCard(ctx, panel, SECTIONS, {
      title: '📖 电能与电功知识',
      scroll: s.cardScroll,
      tip: (c, tx, ty) => {
        c.fillStyle = on ? '#B45309' : '#B08954'
        const dW = s.kwh - s.mark.kwh
        c.fillText(
          on
            ? `● 通电中｜${LOAD_SAFE(s.load)}（${sol.I2 > 0 ? '亮/转' : '未开'}）｜干路 I = ${sol.I.toFixed(2)} A｜ΔW = ${dW.toFixed(4)} kW·h｜n = ${Math.round(N_KWH * dW)} 转`
            : `○ 两只开关都断开：表不计量（读数停在 ${s.kwh.toFixed(4)} kW·h），合上任意一只开始用电`,
          tx, ty + 10
        )
      },
    })
    canvasRef.current._cardBox = cardOut
      ? { x: panel.x, y: panel.y + 2, w: panel.w, h: cardOut.cardH, maxScroll: cardOut.maxScroll, scroll: cardOut.scroll }
      : null
    ctx.textBaseline = 'alphabetic'

    /* 验收钩子 */
    canvasRef.current._dbg = {
      swAX: TX(lampSwX), swAY: TY(yA),
      swBX: TX(applSwX), swBY: TY(yB),
      recX: TX(recX + recW / 2), recY: TY(r1),
      loadBtns: LOADS.map((_, i) => ({ x: TX(108 + i * 108 + 50), y: TY(r1) })),
      speedBtns: SPEEDS.map((_, i) => ({ x: TX(108 + i * 70 + 31), y: TY(r2) })),
      scale: sc, closed: on, swA: s.swA, swB: s.swB, load: s.load, speed: s.speed,
      I: sol.I, I1: sol.I1, I2: sol.I2,
      kwh: s.kwh, runT: s.runT, recN: s.records.length, price: s.price,
      panel: { x: panel.x, y: panel.y, w: panel.w, h: panel.h },
    }
  }

  function LOAD_SAFE(i) { return LOADS[i].name }

  /* ── 知识卡片（8 节，第 ⑦ 节是本次记录）── */
  function buildSections(records, s) {
    const rows = records.map((r, i) => [
      [`第 ${i + 1} 组：`],
      [`${r.load}（${r.P} W）`, '#C2410C', 1],
      ['，通电 '],
      [`${fmtT(r.t)}`, '#0EA5E9', 1],
      ['，W = '],
      [`${r.kwh.toFixed(4)} kW·h`, '#B45309', 1],
      ['，n = '],
      [`${Math.round(r.n)} 转`, '#7C3AED', 1],
      ['，电费 '],
      [`¥${r.cost.toFixed(4)}`, '#15803D', 1],
    ])
    if (records.length >= 2) {
      const a = records[0], b = records[records.length - 1]
      if (Math.abs(b.P - a.P) > 1) {
        rows.push([
          ['对照：功率 '],
          [`${a.P} → ${b.P} W`, '#C2410C', 1],
          ['（' + (b.P / a.P).toFixed(1) + ' 倍）。同样的时间，功率大的用电器耗电多、铝盘转得快 —— '],
          ['W = Pt', '#B45309', 1],
          ['。'],
        ])
      } else {
        rows.push([
          ['对照：同一用电器，通电时间越长，W 越大、转数越多 —— '],
          ['W = Pt', '#B45309', 1],
          [' 里 t 是关键量。'],
        ])
      }
    }
    const cur = {
      P: (s.swA ? LAMP.P : 0) + (s.swB ? LOADS[s.load].P : 0),
      name: `${LAMP.name} + ${LOADS[s.load].name}`,
      dW: s.kwh - s.mark.kwh,
    }
    return [
      {
        title: '① 实验目的',
        lines: [
          [['用'], ['电能表', '#7C3AED', 1], ['量出用电器在一段时间内'], ['消耗了多少电能', '#C2410C', 1], ['（电功 W），并会算电费。']],
          [['理解电功的两种算法：'], ['W = UIt', '#B45309', 1], ['（电压×电流×时间）与'], ['W = Pt', '#B45309', 1], ['（功率×时间）。']],
          [['记住单位换算：'], ['1 kW·h（1 度电）= 3.6×10⁶ J', '#DC2626', 1], ['。']],
        ],
      },
      {
        title: '② 实验器材',
        lines: [
          [['单相电能表', '#7C3AED', 1], ['（220 V 10(40)A，铭牌 600 r/kW·h）、'], ['用电器', '#EA8C1B', 1], ['（白炽灯 100 W / 电热水壶 800 W / 电饭锅 1500 W）、开关、导线。']],
          [['计时用'], ['秒表', '#0EA5E9', 1], ['（本仿真把它做成"时间倍速"：真实 1 小时太长，600× 时 6 秒 = 1 小时）。']],
          [['注意：本实验'], ['不用电流表、不用滑动变阻器', '#DC2626', 1], ['—— 电能表本身就串在干路上，量的就是干路电流。']],
          [['电源符号：'], ['圆圈 + 圆内正弦波（~）+ 旁标 220 V', '#1565C0', 1], [' 是交流电源的标准画法；电池的长短线符号是直流，本实验不可用电池代替。']],
        ],
      },
      {
        title: '③ 电能表怎么接、怎么读',
        lines: [
          [['接线：四根柱从左到右'], ['1 相线进（L）、2 零线进（N）、3 相线出（L）、4 零线出（N）', '#DC2626', 1], ['—— 表内电流线圈串在 1-3 之间（相线进去绕一圈再从 3 出来），2-4 是零线直通；所以用电器要接在 3、4 之后。']],
          [['接反（把 3、4 当进线）电流线圈里的电流方向反了，']  , ['表会倒走或不计量', '#B45309', 1], ['—— 所以 1、2 一定接在电源进线一侧。']],
          [['位置：电能表'], ['串联在干路', '#DC2626', 1], ['上（串在电源和用电器之间），干路电流全部流过它的电流线圈，所以计的是总电功。']],
          [['家用电器（洗衣机、电热水壶）'], ['并联接在 220 V 两端', '#1D4ED8', 1], ['：每件电器两端都是 220 V、各自独立工作，干路电流 = 各支路电流之和；两台同时用时电能表走得最快。']],
          [['读数：'], ['前 5 位是整数度，最后 1 位红色是小数', '#B45309', 1], ['（0.1 kW·h）；一段时间用电 = ']  , ['末读数 − 初读数', '#C2410C', 1], ['。']],
          [['铭牌 220 V 10(40)A：'], ['10 A 是标定电流，40 A 是短时间内允许的最大电流', '#7C3AED', 1], ['；超出会烧表、跳闸。']],
        ],
      },
      {
        title: '④ 转数法测电功（本实验的核心方法）',
        lines: [
          [['铝盘每转 1 圈，代表消耗 1/600 kW·h 的电能（铭牌上写 600 r/kW·h）。']],
          [['所以数转数就能算电功：'], ['W = n / N = n / 600（kW·h）', '#B45309', 1], ['，这里 n 是铝盘转过的圈数。']],
          [['换算成焦耳：'], ['W = (n/600) × 3.6×10⁶ J', '#0EA5E9', 1], ['；换成电费：W × 电价。']],
          [['为什么能用转数算？因为铝盘的转速 ∝ 实际功率：功率越大转得越快 → 同样时间转得越多。']],
        ],
      },
      {
        title: '⑤ 电功与实际功率',
        lines: [
          [['本仿真里市电 220 V 恒定，用电器按额定功率工作：'], ['I = P/U', '#C2410C', 1], ['，'], ['R = U²/P', '#C2410C', 1], ['。']],
          [['白炽灯 100 W → R = 484 Ω、I = 0.45 A；电饭锅 1500 W → R = 32 Ω、I = 6.8 A。']],
          [['同一台用电器电压变了，功率就变（'], ['P = U²/R', '#B45309', 1], ['），电功也跟着变 —— 所以"额定功率"必须注明电压。']],
        ],
      },
      {
        title: '⑥ 电费怎么算',
        lines: [
          [['电费 = 消耗的电能（度）× 电价（元/度）', '#15803D', 1], ['，本仿真电价可在 0.30～1.00 元/度之间调。']],
          [['1 度电能让 100 W 的灯亮 10 小时，或 1500 W 的电饭锅工作约 40 分钟 —— 用 W = Pt 一眼能算。']],
          [['实际还有'], ['阶梯电价、峰谷电价', '#7C3AED', 1], ['，本仿真按单一电价处理。']],
        ],
      },
      {
        title: '⑦ 本次记录',
        lines: [
          ...rows,
          ...(records.length ? [] : [[['点「记录一组」把这一次的用电器、通电时间、W（= 末读数 − 初读数）、转数 n、电费记进表格（最多 ' + MAX_REC + ' 组）。']]]),
          ...(records.length ? [[
            ['当前待记录：'], [`${cur.name}（${cur.P} W）`, '#C2410C', 1], ['，ΔW = '],
            [`${cur.dW.toFixed(4)} kW·h`, '#B45309', 1],
            ['，n = '], [`${Math.round(N_KWH * cur.dW)} 转`, '#7C3AED', 1],
          ]] : []),
        ],
      },
      {
        title: '⚠ 注意事项',
        lines: [
          [['电能表必须'], ['串在干路上', '#DC2626', 1], ['，不能并联；进线（1、2）与出线（3、4）不能接反。']],
          [['用电器的总电流不能超过表的'], ['最大电流（40 A）', '#DC2626', 1], ['，也不能超过保险/空开的容量。']],
          [['读表时'], ['同时开始、同时停止计时', '#15803D', 1], ['，否则 W = n/N 与 W = Pt 两条路子对不上。']],
          [['转数法只适用于'], ['机械（感应式）电能表', '#7C3AED', 1], ['；电子式表直接显示数字（或看脉冲灯闪烁次数）。']],
        ],
      },
    ]
  }

  /* ── 事件 ── */
  const getPos = (e) => eventToCanvas(canvasRef.current, e)

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    if (S.current.tab !== 1) return
    const { x, y } = getPos(e)
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
    const { x, y } = getPos(e)
    if (S.current.cardDrag) {
      const box = canvasRef.current._cardBox
      const b = S.current.cardDrag
      S.current.cardScroll = Math.max(0, Math.min(box?.maxScroll || 0, b.s0 - (y - b.y0)))
      forceUpdate(n => n + 1)
      return
    }
    if (!S.current.dragging) return
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
    const s = S.current
    s.swA = false
    s.swB = false
    s.load = 0
    s.speed = 600
    s.price = 0.56
    s.kwh = 0; s.runT = 0; s.disc = 0
    s.mark = { kwh: 0, t: 0 }
    s.records = []
    s.cardScroll = 0
    builderRef.current?.reset()
    forceUpdate(n => n + 1)
  }, [])

  const handleAddFromPalette = useCallback((type) => { builderRef.current?.add(type) }, [])
  const handleDropFromPalette = useCallback((type, clientX, clientY) => { builderRef.current?.addAt(type, clientX, clientY) }, [])
  const handlePickColor = useCallback((color) => { S.current.wireColor = color; forceUpdate(v => v + 1) }, [])

  return (
    <SceneShell
      title="电功与电能表"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t) }}
      tab1Label="📖 电路演示"
      tab2Label="🔧 自己动手"
      onReset={handleReset}
      desc={tab === 1 ? (
        <>
          <b>电能 电功</b>
          <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
            家庭电路 220 V · 电能表串在干路 · 换用电器看铝盘转多快 · 数转数算 W = n/N · 按电价算电费
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
            purpose="用电能表量出用电器消耗的电能（电功 W），学会读数、转数法和电费计算。"
            steps={[
              '先看电能表铭牌：220 V 10(40)A、600 r/kW·h',
              '选一个用电器（100 / 800 / 1500 W），看它对应的 R 与 I',
              '点开关闭合，铝盘开始转、计数器开始走字',
              '倍速通时间（600× 时 6 秒 = 1 小时），看 W 与转数 n 增长',
              '点「记录一组」，换算 W = n/N 与电费，进知识卡第 ⑦ 节',
              '换一个功率不同的用电器再记一组，比较铝盘转速',
            ]}
            hint="W = n/N（N = 600 r/kW·h）；电费 = W × 电价；1 度电 = 3.6×10⁶ J。表要串在干路上。"
          />
        ) : (
          <InfoDock
            align="left"
            offset={{ left: 26, top: 26 }}
            hint="接法：交流电源三根线头朝右（L 红 / N 蓝 / E 黑）→ 电能表 1、2，表 3(L 出) / 4(N 出) → 空气开关 L进/N进，空开 L出/N出 → 插座（接线端都在**面板上方**：两孔 L/N、三孔 L/E/N，线头末端才是热点）。电能表**串联在干路**（干路电流全部流过它，所以计总电功）；洗衣机 / 电饭煲 / 电热水壶 / 电暖器都**并联在 220 V 两端** —— 这四台**没有接线柱**，直接拖到插座孔上就自动插上（干路 I = 各支路之和）。面板开关与空开都靠**明暗**看状态：亮=合闸，暗=断开；点本体即合/分。右上「走字倍速」加快时间才看得见计数器跳字。"
            hintTitle="操作说明"
          />
        )}
        {tab === 2 && (
          <BuilderPalette
            side="right"
            items={[
              { type: 'battery', name: '电池组', icon: thumb('battery') },
              { type: 'accumulator', name: '蓄电池', icon: thumb('accumulator') },
              // 家庭电路三件（本专题补遗留新增）：家用交流电（三孔插座）+ 洗衣机 500 W + 电热水壶 1500 W
              // 电池组只有 3 V，干路电流零点几安，电功几乎为 0、表不走字；
              // 换成家用交流电 + 电器，I = P/U = 2.27 / 6.82 A，配右上「走字倍速」才看得见计数器跳字
              // 家庭电路（真器材）：交流电源（圆 + 正弦符号 + 三引线）→ 电能表 → 空气开关 → 支路
              { type: 'acSource', name: '交流电源', icon: thumb('acSource') },
              { type: 'mains', name: '家用交流电', icon: thumb('mains') },
              { type: 'energyMeter', name: '电能表', icon: thumb('energyMeter') },
              { type: 'breaker', name: '空气开关', icon: thumb('breaker') },
              { type: 'wallSwitch', name: '面板开关', icon: thumb('wallSwitch') },
              { type: 'socket2', name: '两孔插座', icon: thumb('socket2') },
              { type: 'socket3', name: '三孔插座', icon: thumb('socket3') },
              // 家用电器（无底座，插脚拖到插孔上就自动并联在 L / N 两端，不设接线柱热点）
              { type: 'washer', name: '洗衣机', icon: thumb('washer') },
              { type: 'kettle', name: '电热水壶', icon: thumb('kettle') },
              { type: 'riceCooker', name: '电饭煲', icon: thumb('riceCooker') },
              { type: 'heater', name: '电暖器', icon: thumb('heater') },
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

/* ══════════════════════════════════════════════════════════════
   绘制辅助
   ══════════════════════════════════════════════════════════════ */

/** 交流电源符号（教材标准画法）：圆圈 + 圆内正弦波 + 旁标 220 V / 50 Hz
 *  上下各引一段导线接入回路（引线由调用方画，这里只管符号本体 + 标注）。
 *  注意：不能画成电池（长线短线）—— 那是直流电源符号。 */
function drawACSource(ctx, cx, cy, r, o) {
  const { on, FS } = o
  const ink = on ? '#1565C0' : '#8AA0B0'
  // 圆
  ctx.fillStyle = on ? '#FFFFFF' : '#F7FAFC'
  ctx.strokeStyle = ink
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  // 圆内一个完整周期的正弦波
  const w = r * 0.62, amp = r * 0.34
  ctx.strokeStyle = ink
  ctx.lineWidth = 1.7
  ctx.beginPath()
  ctx.moveTo(cx - w, cy)
  ctx.bezierCurveTo(cx - w * 0.55, cy - amp * 1.7, cx - w * 0.15, cy - amp * 1.7, cx, cy)
  ctx.bezierCurveTo(cx + w * 0.15, cy + amp * 1.7, cx + w * 0.55, cy + amp * 1.7, cx + w, cy)
  ctx.stroke()
  // 旁标（三行左对齐）
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
  ctx.fillStyle = on ? '#5D4037' : '#A08E76'
  ctx.font = `${FS(9)}px "Microsoft YaHei", sans-serif`
  ctx.fillText('市电', cx + r + 9, cy - 19)
  ctx.fillStyle = ink
  ctx.font = `bold ${FS(12.5)}px "Microsoft YaHei", sans-serif`
  ctx.fillText('220 V', cx + r + 9, cy - 3)
  ctx.fillStyle = on ? '#B45309' : '#98A6B2'
  ctx.font = `bold ${FS(9.5)}px "Microsoft YaHei", sans-serif`
  ctx.fillText('交流 ~ 50 Hz', cx + r + 9, cy + 12)
}

/** 墙上的面板开关（真实的家用翘板开关，不是实验台闸刀）：
 *  状态用**明暗**表示 —— 合闸时整块面板与翘板是亮的（近白），断开时面板发灰、翘板压深；
 *  翘板上沿那道白边 + 小橙色标记照用户给的面板实物图（左=合、右=断）。 */
function drawPanelSwitch(ctx, cx, cy, closed, o) {
  const { FS } = o
  const w = 24, h = 32
  const x = cx - w / 2, y = cy - h / 2
  /* 面板：亮 / 暗 */
  ctx.fillStyle = closed ? '#FFFFFF' : '#D9DEE4'
  ctx.strokeStyle = closed ? '#C7CFD6' : '#A9B3BC'
  ctx.lineWidth = 1.3
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 4); ctx.fill(); ctx.stroke()
  /* 内框（面板凹进去的一圈） */
  ctx.fillStyle = closed ? '#F1F4F7' : '#C9D0D7'
  ctx.strokeStyle = closed ? '#D9DFE6' : '#B4BDC6'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.roundRect(x + 3, y + 2.5, w - 6, h - 6, 3); ctx.fill(); ctx.stroke()
  /* 翘板：合 → 压平（近白、上沿一道高光）；断 → 抬起（压深灰、上沿露出白色凸边） */
  const rockTop = closed ? cy - 5.5 : cy - 8.5
  ctx.fillStyle = closed ? '#FDFEFF' : '#AEB7C0'
  ctx.strokeStyle = closed ? '#C2CBD3' : '#8F99A3'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.roundRect(cx - 6.5, rockTop, 13, cy + 9.5 - rockTop, 2.5); ctx.fill(); ctx.stroke()
  /* 翘板上沿的白边（实物图上合、断两态都有的那道反光） */
  ctx.fillStyle = closed ? '#FFFFFF' : '#EAEEF2'
  ctx.beginPath(); ctx.roundRect(cx - 5.6, rockTop + 0.8, 11.2, 1.8, 0.9); ctx.fill()
  /* 橙色小标记 */
  ctx.fillStyle = '#F2822B'
  ctx.beginPath(); ctx.roundRect(cx - 2.6, rockTop + 3.6, 5.2, 1.4, 0.7); ctx.fill()
  /* 状态字：仍留一个极小的字，方便读屏与放大查看，正常尺寸几乎看不见 */
  ctx.fillStyle = closed ? '#B9C2CB' : '#7E8892'
  ctx.font = `bold ${FS(5.6)}px "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(closed ? 'ON' : 'OFF', cx, cy + 4)
}

/** 回路中的电能表（符号化：铭牌条 + 铝盘 + 6 位计数器 + 600 r/kW·h） */
function drawMeterSym(ctx, cx, cy, MW, MH, o) {
  const { kwh, I, on, disc, time } = o
  const x = cx - MW / 2, y = cy - MH / 2
  // 外壳
  const g = ctx.createLinearGradient(x, y, x, y + MH)
  g.addColorStop(0, '#FFFFFF'); g.addColorStop(1, '#E7EDF5')
  ctx.fillStyle = g
  ctx.strokeStyle = on ? '#94A3B8' : '#B6C2CE'
  ctx.lineWidth = 1.8
  ctx.beginPath(); ctx.roundRect(x, y, MW, MH, 8); ctx.fill(); ctx.stroke()
  // 铭牌条
  ctx.fillStyle = '#334155'
  ctx.beginPath(); ctx.roundRect(x + 6, y + 6, MW - 12, 17, 3); ctx.fill()
  ctx.fillStyle = '#DBEAFE'
  ctx.font = 'bold 8.6px "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('单相电能表 · 220V 10(40)A', cx, y + 15)

  // 铝盘（左）
  const dx = x + 34, dy = y + 56, dr = 21
  ctx.fillStyle = '#0B1220'
  ctx.beginPath(); ctx.arc(dx, dy, dr + 2.5, 0, Math.PI * 2); ctx.fill()
  drawDisc(ctx, dx, dy, dr, disc, I, on)
  // 计数器（右）
  drawCounter(ctx, x + 64, y + 39, kwh, { digitW: 15.2, digitH: 21, fs: 15.5 })
  ctx.fillStyle = '#64748B'
  ctx.font = 'bold 7px "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  ctx.fillText('kW·h', x + 64 + 6 * 15.2 / 2, y + 63)

  // 底部常数
  ctx.fillStyle = on && I > 0.005 ? '#B45309' : '#94A3B8'
  ctx.font = 'bold 9px "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('600 r/kW·h', cx, y + MH - 12)
  // 闪烁脉冲灯（铝盘转一圈闪一次）
  const blink = on && I > 0.005 ? 0.45 + 0.55 * Math.abs(Math.sin(disc / 2)) : 0
  ctx.fillStyle = `rgba(220,38,38,${blink})`
  ctx.beginPath(); ctx.arc(x + MW - 14, y + MH - 13, 4, 0, Math.PI * 2); ctx.fill()
}

/** 铝盘：高速旋转时用半透明拖尾，避免"糊成一坨"或"看不出在转" */
function drawDisc(ctx, cx, cy, r, ang, I, on) {
  const spin = on && I > 0.005
  // 拖尾（转到很快时才有意义）
  if (spin) {
    const n = 5
    for (let k = 0; k < n; k++) {
      const a = ang - k * 0.10
      ctx.fillStyle = `rgba(160,178,199,${0.30 - k * 0.05})`
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, r, a, a + 0.22)
      ctx.closePath(); ctx.fill()
    }
  }
  // 盘面
  ctx.fillStyle = '#E8EDF4'
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill()
  // 盘上标记（跟着转角走）
  ctx.save()
  ctx.translate(cx, cy); ctx.rotate(ang)
  ctx.fillStyle = '#94A3B8'
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, -0.55, 0.55); ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#1F2937'
  ctx.fillRect(-1.6, -r + 1, 3.2, 8)
  ctx.restore()
  // 转轴
  ctx.fillStyle = '#64748B'
  ctx.beginPath(); ctx.arc(cx, cy, 2.2, 0, Math.PI * 2); ctx.fill()
}

/** 6 位计数器：前 5 位整数（黑底浅字），末 1 位小数（暗红底淡红字） */
function drawCounter(ctx, x, y, kwh, o) {
  const { digitW, digitH, fs } = o
  const digits = String(Math.floor(Math.max(0, kwh) * 10) % 1000000).padStart(6, '0')
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  for (let i = 0; i < 6; i++) {
    const cx = x + i * digitW
    const red = i === 5
    ctx.fillStyle = red ? '#7F1D1D' : '#0F172A'
    ctx.beginPath(); ctx.roundRect(cx, y, digitW - 1.2, digitH, 1.6); ctx.fill()
    ctx.fillStyle = red ? '#FECACA' : '#E5EEF7'
    ctx.font = `bold ${fs}px ui-monospace, Consolas, monospace`
    ctx.fillText(digits[i], cx + (digitW - 1.2) / 2, y + digitH / 2 + 0.5)
  }
}

/** 电能表特写：大计数器 + 大铝盘 + 铭牌 + 状态行 */
function drawMeterZoom(ctx, zx, zy, zw, zh, o) {
  const { kwh, I, on, speed, price, FS } = o
  const x = zx - zw / 2, y = zy - zh / 2
  ctx.fillStyle = '#FFFDF9'
  ctx.strokeStyle = '#E8DCC8'; ctx.lineWidth = 1.6
  ctx.beginPath(); ctx.roundRect(x, y, zw, zh, 12); ctx.fill(); ctx.stroke()

  ctx.fillStyle = '#5D4037'
  ctx.font = `bold ${FS(10.5)}px "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  ctx.fillText('电能表特写（铝盘转速 ∝ 功率）', x + 14, y + 10)

  // 铭牌条
  ctx.fillStyle = '#334155'
  ctx.beginPath(); ctx.roundRect(x + 14, y + 30, zw - 28, 18, 4); ctx.fill()
  ctx.fillStyle = '#DBEAFE'
  ctx.font = `bold ${FS(8.6)}px "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('单相电能表 · 220 V 10(40)A · 600 r/kW·h', zx, y + 39)

  // 大铝盘
  const drx = x + 56, dry = y + 116, dr = 40
  ctx.fillStyle = '#0B1220'
  ctx.beginPath(); ctx.arc(drx, dry, dr + 3, 0, Math.PI * 2); ctx.fill()
  drawDisc(ctx, drx, dry, dr, o.disc || 0, I, on)
  ctx.fillStyle = '#8D6E63'
  ctx.font = `${FS(8)}px "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  ctx.fillText(on && I > 0.005 ? `${I.toFixed(2)} A · 转盘在转` : '无电流 · 静止', drx, dry + dr + 8)

  // 大计数器
  drawCounter(ctx, x + 112, y + 68, kwh, { digitW: 26, digitH: 36, fs: 22 })
  ctx.fillStyle = '#64748B'
  ctx.font = `${FS(8.5)}px "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  ctx.fillText('kW·h（末位红字是小数 0.1）', x + 112, y + 108)
  ctx.fillStyle = '#334155'
  ctx.font = `bold ${FS(9.5)}px "Microsoft YaHei", sans-serif`
  ctx.fillText(`读数 ${kwh.toFixed(4)} kW·h`, x + 112, y + 126)
  ctx.fillStyle = '#B45309'
  ctx.fillText(`转数 n = ${Math.round(N_KWH * kwh)} 转`, x + 112, y + 144)
  ctx.fillStyle = '#15803D'
  ctx.fillText(`电费 ¥${(kwh * price).toFixed(4)}（${price.toFixed(2)} 元/度）`, x + 112, y + 162)
  ctx.fillStyle = '#8D6E63'
  ctx.font = `${FS(8.4)}px "Microsoft YaHei", sans-serif`
  ctx.fillText(speed > 1 ? `时间已按 ${speed}× 放行，实际表要慢得多` : '真实时间 1×（几乎看不出走字）', x + 112, y + 180)
}

/** 用电器简笔（三种：白炽灯 / 电热水壶 / 电饭锅）
 *  baseY 是回路下边那根导线的高度：图标"站"在导线上（灯座/底座/锅底贴线），
 *  这样不会出现"灯泡浮在半空"的脱节感。 */
function drawLoadIcon(ctx, cx, baseY, kind, o) {
  const { on, P, time } = o
  const hot = on ? Math.min(1, P / 1000) : 0

  if (kind === 'lamp') {
    // 灯座（贴在导线上）
    ctx.fillStyle = '#CBD5E1'
    ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 1.4
    ctx.beginPath(); ctx.roundRect(cx - 9, baseY - 13, 18, 13, 2.5); ctx.fill(); ctx.stroke()
    ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 1
    for (let k = 0; k < 3; k++) {
      const yy = baseY - 10 + k * 4
      ctx.beginPath(); ctx.moveTo(cx - 6, yy); ctx.lineTo(cx + 6, yy); ctx.stroke()
    }
    // 脖子
    ctx.fillStyle = '#CBD5E1'
    ctx.beginPath(); ctx.roundRect(cx - 7, baseY - 24, 14, 12, 2); ctx.fill()
    ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 1.2; ctx.stroke()
    // 玻璃泡
    const cy = baseY - 42
    if (on) {
      const gr = 26 + 13 * hot
      const glow = ctx.createRadialGradient(cx, cy, 3, cx, cy, gr)
      glow.addColorStop(0, `rgba(255,235,59,${0.55 * Math.max(0.4, hot)})`)
      glow.addColorStop(1, 'rgba(255,235,59,0)')
      ctx.fillStyle = glow
      ctx.beginPath(); ctx.arc(cx, cy, gr, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = 'rgba(245,158,11,0.6)'; ctx.lineWidth = 1.4
      for (let k = 0; k < 12; k++) {
        const a = k * Math.PI / 6
        const r1 = 18, r2 = 23 + 7 * Math.max(0.45, hot)
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1)
        ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2)
        ctx.stroke()
      }
    }
    ctx.fillStyle = on ? '#FDE68A' : '#F1F5F9'
    ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.ellipse(cx, cy, 15, 17, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    // 灯丝
    ctx.strokeStyle = on ? '#EA580C' : '#94A3B8'; ctx.lineWidth = 1.3
    ctx.beginPath()
    ctx.moveTo(cx - 7, cy + 9); ctx.lineTo(cx - 4, cy - 4); ctx.lineTo(cx, cy + 4)
    ctx.lineTo(cx + 4, cy - 4); ctx.lineTo(cx + 7, cy + 9)
    ctx.stroke()
  } else if (kind === 'washer') {
    /* 滚筒洗衣机正面：机身 + 顶部控制面板 + 观察孔（孔里滚筒在转，一眼看出"它在工作"） */
    ctx.fillStyle = on ? '#FBFDFF' : '#EDF2F7'
    ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.roundRect(cx - 24, baseY - 62, 48, 56, 4); ctx.fill(); ctx.stroke()
    /* 顶部控制面板 */
    ctx.fillStyle = '#DDE5EC'
    ctx.beginPath(); ctx.roundRect(cx - 24, baseY - 62, 48, 12, 4); ctx.fill()
    ctx.strokeStyle = '#B7C2CC'; ctx.lineWidth = 1; ctx.stroke()
    /* 旋钮 */
    ctx.fillStyle = '#94A3B8'
    ctx.beginPath(); ctx.arc(cx - 12, baseY - 56, 4, 0, Math.PI * 2); ctx.fill()
    /* 显示屏 + 指示灯 */
    ctx.fillStyle = on ? '#16A34A' : '#CBD5E1'
    ctx.beginPath(); ctx.roundRect(cx - 2, baseY - 60, 16, 7, 2); ctx.fill()
    ctx.fillStyle = on ? '#EF4444' : '#E2E8F0'
    ctx.beginPath(); ctx.arc(cx + 20, baseY - 56, 2.6, 0, Math.PI * 2); ctx.fill()
    /* 观察孔（塑料圈） */
    const ocy = baseY - 27, orr = 15
    ctx.fillStyle = '#E7EDF3'
    ctx.strokeStyle = '#B7C2CC'; ctx.lineWidth = 1.4
    ctx.beginPath(); ctx.arc(cx - 2, ocy, orr, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    /* 孔里的玻璃 + 滚筒（工作时按 time 转） */
    ctx.fillStyle = on ? '#BFD8EE' : '#DCE6EE'
    ctx.beginPath(); ctx.arc(cx - 2, ocy, orr - 4, 0, Math.PI * 2); ctx.fill()
    const ang = on ? time * 2.4 : 0
    ctx.strokeStyle = on ? '#3B82F6' : '#B6C2CE'; ctx.lineWidth = 1.6
    for (let k = 0; k < 3; k++) {
      const a = ang + (k * 2 * Math.PI) / 3
      ctx.beginPath()
      ctx.moveTo(cx - 2, ocy)
      ctx.lineTo(cx - 2 + Math.cos(a) * (orr - 5), ocy + Math.sin(a) * (orr - 5))
      ctx.stroke()
    }
    ctx.fillStyle = on ? '#2563EB' : '#CBD5E1'
    ctx.beginPath(); ctx.arc(cx - 2, ocy, 3, 0, Math.PI * 2); ctx.fill()
    /* 衣物/水迹 */
    if (on) {
      ctx.fillStyle = 'rgba(59,130,246,0.45)'
      ctx.beginPath(); ctx.arc(cx - 2 + Math.cos(ang) * 6, ocy + Math.sin(ang) * 5, 2.4, 0, Math.PI * 2); ctx.fill()
    }
    /* 底脚 */
    ctx.fillStyle = '#CBD5E1'
    ctx.beginPath(); ctx.roundRect(cx - 22, baseY - 7, 8, 4, 1.5); ctx.fill()
    ctx.beginPath(); ctx.roundRect(cx + 14, baseY - 7, 8, 4, 1.5); ctx.fill()
  } else if (kind === 'kettle') {
    // 底座
    ctx.fillStyle = '#CBD5E1'
    ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 1.4
    ctx.beginPath(); ctx.roundRect(cx - 26, baseY - 9, 52, 9, 3); ctx.fill(); ctx.stroke()
    // 壶身
    ctx.fillStyle = on ? '#F8FAFC' : '#E8EDF3'
    ctx.beginPath()
    ctx.moveTo(cx - 22, baseY - 60); ctx.lineTo(cx + 22, baseY - 60)
    ctx.lineTo(cx + 20, baseY - 9); ctx.lineTo(cx - 20, baseY - 9)
    ctx.closePath(); ctx.fill(); ctx.stroke()
    // 壶盖
    ctx.beginPath(); ctx.roundRect(cx - 24, baseY - 64, 48, 6, 3); ctx.fill(); ctx.stroke()
    // 手柄
    ctx.beginPath(); ctx.arc(cx + 24, baseY - 44, 12, -Math.PI / 2, Math.PI / 2); ctx.stroke()
    // 水位 + 加热丝
    ctx.fillStyle = on ? 'rgba(59,130,246,0.30)' : 'rgba(148,163,184,0.22)'
    ctx.beginPath(); ctx.roundRect(cx - 17, baseY - 36, 34, 25, 3); ctx.fill()
    if (on) {
      ctx.strokeStyle = '#DC2626'; ctx.lineWidth = 1.6
      for (let k = 0; k < 3; k++) {
        const yy = baseY - 31 + k * 8
        ctx.beginPath(); ctx.moveTo(cx - 13, yy); ctx.lineTo(cx + 13, yy); ctx.stroke()
      }
      // 蒸汽
      ctx.strokeStyle = 'rgba(148,163,184,0.65)'; ctx.lineWidth = 1.2
      for (let k = 0; k < 2; k++) {
        const ph = (time * 1.4 + k * 1.1) % 2
        ctx.beginPath()
        ctx.arc(cx - 7 + k * 14, baseY - 70 - ph * 10, 5 + ph * 3, -2.2, -0.9)
        ctx.stroke()
      }
    }
    // 指示灯
    ctx.fillStyle = on ? '#DC2626' : '#E2E8F0'
    ctx.beginPath(); ctx.arc(cx - 15, baseY - 52, 3.4, 0, Math.PI * 2); ctx.fill()
  } else {
    // 锅身（锅底贴导线）
    ctx.fillStyle = '#F8FAFC'
    ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.roundRect(cx - 28, baseY - 36, 56, 36, 7); ctx.fill(); ctx.stroke()
    // 锅盖
    ctx.beginPath(); ctx.roundRect(cx - 30, baseY - 51, 60, 16, 5); ctx.fill(); ctx.stroke()
    // 提手
    ctx.beginPath(); ctx.arc(cx, baseY - 53, 15, Math.PI * 1.04, Math.PI * 1.96); ctx.stroke()
    if (on) {
      ctx.fillStyle = 'rgba(220,38,38,0.16)'
      ctx.beginPath(); ctx.roundRect(cx - 24, baseY - 33, 48, 30, 5); ctx.fill()
      // 内胆里的水汽
      ctx.strokeStyle = 'rgba(148,163,184,0.6)'; ctx.lineWidth = 1.1
      const ph = (time * 1.2) % 1.6
      ctx.beginPath(); ctx.arc(cx, baseY - 58 - ph * 6, 4 + ph * 4, -2.3, -0.9); ctx.stroke()
    }
    // 指示灯
    ctx.fillStyle = on ? '#DC2626' : '#E2E8F0'
    ctx.beginPath(); ctx.arc(cx + 17, baseY - 12, 3.4, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = on ? '#F59E0B' : '#E2E8F0'
    ctx.beginPath(); ctx.arc(cx + 17, baseY - 24, 3, 0, Math.PI * 2); ctx.fill()
  }
}

function fmtT(t) {
  if (t < 60) return `${t.toFixed(1)} s`
  if (t < 3600) return `${(t / 60).toFixed(1)} min`
  return `${(t / 3600).toFixed(2)} h`
}

function drawLine(ctx, x1, y1, x2, y2, color, w) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
  ctx.lineCap = 'butt'
}

/** 沿折线流动的黄点（电子/电流示意） */
function drawFlow(ctx, points, time, color) {
  let total = 0
  const segs = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    segs.push({ ...a, ex: b.x, ey: b.y, len })
    total += len
  }
  ctx.fillStyle = color
  const n = Math.max(6, Math.floor(total / 46))
  for (let d = 0; d < n; d++) {
    let pos = ((time * 42 + d * (total / n)) % total)
    for (const g of segs) {
      if (pos <= g.len) {
        const k = pos / g.len
        ctx.beginPath()
        ctx.arc(g.x + (g.ex - g.x) * k, g.y + (g.ey - g.y) * k, 2.8, 0, Math.PI * 2)
        ctx.fill()
        break
      }
      pos -= g.len
    }
  }
}
