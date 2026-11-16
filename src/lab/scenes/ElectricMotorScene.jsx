import { useState, useRef, useEffect, useCallback } from 'react'
import { eventToCanvas } from '../utils/pointerPos'
import SceneShell from '../ui/SceneShell'
import InfoDock from '../ui/InfoDock'
import BuilderPalette from '../ui/BuilderPalette'
import { drawKnowledgeCard } from '../ui/knowledgeCard'
import BuilderSVG from '../simple3d/BuilderSVG.jsx'
import { TYPES } from './electricSvgInstruments.js'
import { symSwitch, symHalf, symBattery, SYM_INK } from '../render/symbols.js'

/**
 * ElectricMotorScene — 电动机（第 10 个按「简单电路」模板改造的初中电学实验）
 *
 *  教材 20.4《电动机》的三件事：
 *    ① 磁场对通电导线有力的作用（安培力，左手定则）
 *    ② 通电线圈在磁场中受力转动，但转到**平衡位置**（线圈平面与磁感线垂直）转矩为零，
 *       不换向就只能在那儿来回摆几下停住
 *    ③ **换向器**（两个半圆铜片 + 电刷）每半圈把线圈里的电流方向翻转，
 *       转矩方向就恒为同一侧 → 连续转动
 *
 *  Tab1 📖 电路演示 —— 暖色底 + 标准符号回路（电池 / 开关 / 电刷引线接到换向器）
 *                       上方是电动机剖面：两块磁极（N 红 / S 蓝）+ 水平磁感线 + 可旋转线圈
 *                       + 换向器（随线圈同步转的半圆铜片）+ 两个电刷
 *                       右下是 τ–θ 实时曲线：拆掉换向器就能看到 τ 一半正一半负、净功为零
 *   Tab2 🔧 自己动手 —— 9 件基础器材 + 本专题专用「小电动机」（风扇随电流转）
 */
function thumb(type) {
  const t = TYPES[type]
  if (!t) return null
  const svg = t.render({ id: `pal-${type}`, f: 0.4 }, { I: 0, bright: 0.5, frac: 0 })
  return <span dangerouslySetInnerHTML={{ __html: svg }} />
}

/* 设计坐标系（整体等比缩放 + 居中） */
const D = {
  cx: 292, cy: 244,          // 电动机剖面中心
  aH: 66,                    // 线圈半宽（θ=0 时）
  bH: 50,                    // 线圈半高
  magL: 152, magLw: 54,      // 左磁极（N）
  magR: 378, magRw: 54,      // 右磁极（S）
  egy: 368, egyR: 22,        // 换向器中心 / 半径
  brushDx: 27,               // 两电刷离轴的距离
  L: 118, R: 468, T: 424, B: 574,   // 回路矩形
  batX: 196, swX: 350,
  row1: 624, row2: 680,
  chX: 596, chY: 456, chW: 256, chH: 132,   // τ–θ 曲线
  VW: 900, VH: 730,
}

const TAU_K = 10          // 转矩系数（K·I·cos θ）
const DAMP = 1.15         // 阻尼（无换向器时靠它把摆动停下来）
const MAX_REC = 4

export default function ElectricMotorScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const builderRef = useRef(null)

  const S = useRef({
    tab: 1,
    switchClosed: false,
    I: 0.6,                 // 电流 0.2 ~ 1.0 A
    commutator: true,       // 换向器是否接入（拆掉 → 只摆几下就停）
    field: true,            // true = N 在左（磁感线向右）；false 反向
    theta: 0,               // 线圈转角（rad）：0 = 线圈平面落在屏幕内
    omega: 0,               // 角速度（rad/s）
    time: 0,
    records: [],
    wireColor: '#F44336',
    cardScroll: 0,
    cardDrag: null,
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

    let last = performance.now()
    const loop = (now) => {
      const dtReal = Math.min(0.05, (now - last) / 1000); last = now
      const s = S.current
      s.time += dtReal
      /* 转矩 τ = K·I·cosθ·sgn —— 有换向器时 cosθ 换成 |cosθ|（电流每半圈翻转一次） */
      const c = Math.cos(s.theta)
      const sgn = s.field ? 1 : -1
      const tau = s.switchClosed ? TAU_K * s.I * (s.commutator ? Math.abs(c) : c) * sgn : 0
      s.omega += (tau - DAMP * s.omega) * dtReal
      s.theta += s.omega * dtReal
      if (Math.abs(s.omega) < 0.002 && !s.switchClosed) s.omega = 0

      render(R)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  /* ══════════════════════════════════════════════════════════════
     Tab 1
     ══════════════════════════════════════════════════════════════ */
  function renderDemo(ctx, W, H) {
    const s = S.current
    const on = s.switchClosed
    const rpm = Math.abs(s.omega) * 60 / (2 * Math.PI)

    /* 右侧知识卡面板 */
    const RAIL = 46
    const pw = Math.max(300, Math.min(W * 0.40, 700))
    const panel = { x: W - 16 - RAIL - pw, y: 10, w: pw, h: H - 38 }
    const viewW = panel.x - 16

    /* 设计坐标 → 屏幕坐标 */
    const sc = Math.max(0.5, Math.min(1.12, Math.min(viewW / D.VW, H / D.VH)))
    const ox = (viewW - D.VW * sc) / 2
    const oy = (H - D.VH * sc) / 2
    const TX = (x) => ox + x * sc
    const TY = (y) => oy + y * sc
    const FS = (n) => Math.max(9, Math.round(n * sc))

    ctx.save()
    ctx.translate(ox, oy); ctx.scale(sc, sc)

    const wc = on ? '#1565C0' : '#9aa7b1'
    const ink = on ? SYM_INK : '#7c8a93'
    const lw = 2.6

    /* ─── 回路（电池 + 开关，经电刷进换向器）─── */
    const { L, R, T, B, cx, cy, egy, brushDx } = D
    const hSw = symHalf('switch', 1)
    const hBat = symHalf('battery', 1, 2)
    drawLine(ctx, L, T, cx - brushDx, T, wc, lw)
    drawLine(ctx, cx + brushDx, T, R, T, wc, lw)
    drawLine(ctx, L, T, L, B, wc, lw)
    drawLine(ctx, R, T, R, B, wc, lw)
    drawLine(ctx, L, B, D.batX - hBat, B, wc, lw)
    drawLine(ctx, D.batX + hBat, B, D.swX - hSw, B, wc, lw)
    drawLine(ctx, D.swX + hSw, B, R, B, wc, lw)

    /* 电刷 → 回路顶边的引线（竖直） */
    drawLine(ctx, cx - brushDx, egy, cx - brushDx, T, wc, lw)
    drawLine(ctx, cx + brushDx, egy, cx + brushDx, T, wc, lw)

    /* 电流流动示意（正极 → 开关 → 右电刷；换向器 → 左电刷 → 左竖边 → 负极） */
    if (on) {
      drawFlow(ctx, [
        { x: D.batX + hBat, y: B }, { x: D.swX - hSw, y: B },
      ], s.time, '#FBBF24')
      drawFlow(ctx, [
        { x: D.swX + hSw, y: B }, { x: R, y: B }, { x: R, y: T },
        { x: cx + brushDx, y: T }, { x: cx + brushDx, y: egy },
      ], s.time, '#FBBF24')
      drawFlow(ctx, [
        { x: cx - brushDx, y: egy }, { x: cx - brushDx, y: T },
        { x: L, y: T }, { x: L, y: B }, { x: D.batX - hBat, y: B },
      ], s.time, '#FBBF24')
    }

    /* ─── 电动机剖面 ─── */
    drawMotorBody(ctx, {
      cx, cy, theta: s.theta, on, I: s.I, field: s.field, commutator: s.commutator, FS, time: s.time,
    })

    /* ─── 电池 / 开关 ─── */
    symBattery(ctx, D.batX, B, { n: 2, scale: 1, ink })
    symSwitch(ctx, D.swX, B, { closed: on, scale: 1, ink })
    ctx.fillStyle = '#5D4037'
    ctx.font = `bold ${FS(10.5)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('电池组', D.batX, B + 20)
    ctx.fillText('开关（点击）', D.swX, B + 20)

    /* ─── τ–θ 曲线 ─── */
    drawTauChart(ctx, D.chX, D.chY, D.chW, D.chH, {
      theta: s.theta, I: s.I, commutator: s.commutator, field: s.field, on, FS,
    })

    /* ─── 控件第一行：电流滑条 + 换向器 ─── */
    const r1 = D.row1
    ctx.fillStyle = '#5A4636'
    ctx.font = `bold ${FS(10.5)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText(`电流 I = ${s.I.toFixed(2)} A`, 44, r1 - 20)
    const barX = 54, barW = 190
    ctx.strokeStyle = '#D7C4A8'; ctx.lineWidth = 4
    ctx.beginPath(); ctx.moveTo(barX, r1 + 6); ctx.lineTo(barX + barW, r1 + 6); ctx.stroke()
    const px = barX + ((s.I - 0.2) / 0.8) * barW
    ctx.fillStyle = '#0EA5E9'
    ctx.beginPath(); ctx.arc(px, r1 + 6, 8, 0, Math.PI * 2); ctx.fill()
    canvasRef.current._clickAreas.push({
      x: TX(barX - 12), y: TY(r1 - 30), w: (barW + 24) * sc, h: 56 * sc,
      onClick: (mxp) => {
        const v = ((mxp - ox) / sc - barX) / barW
        S.current.I = Math.round((0.2 + Math.max(0, Math.min(1, v)) * 0.8) * 100) / 100
        forceUpdate(n => n + 1)
      },
      onDrag: (mxp) => {
        const v = ((mxp - ox) / sc - barX) / barW
        S.current.I = Math.round((0.2 + Math.max(0, Math.min(1, v)) * 0.8) * 100) / 100
        forceUpdate(n => n + 1)
      },
    })

    /* 换向器开关按钮（本实验最关键的一个开关） */
    const cX = 300, cW = 172, cY = r1 - 16, cH = 32
    const cOn = s.commutator
    ctx.fillStyle = cOn ? '#ECFDF5' : '#FEF2F2'
    ctx.strokeStyle = cOn ? '#15803D' : '#DC2626'
    ctx.lineWidth = 1.8
    ctx.beginPath(); ctx.roundRect(cX, cY, cW, cH, 16); ctx.fill(); ctx.stroke()
    ctx.fillStyle = cOn ? '#15803D' : '#B91C1C'
    ctx.font = `bold ${FS(10.5)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(cOn ? '✓ 换向器已接入' : '✗ 换向器已拆掉', cX + cW / 2, cY + cH / 2)
    canvasRef.current._clickAreas.push({
      x: TX(cX), y: TY(cY - 2), w: cW * sc, h: (cH + 4) * sc,
      onClick: () => { S.current.commutator = !S.current.commutator; forceUpdate(n => n + 1) },
    })

    /* 转速显示（按钮右） */
    ctx.fillStyle = '#5A4636'
    ctx.font = `bold ${FS(10.5)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'left'
    ctx.fillText(`转速 ${Math.round(rpm)} r/min`, cX + cW + 16, r1)
    ctx.fillStyle = '#8D6E63'
    ctx.font = `${FS(9)}px "Microsoft YaHei", sans-serif`
    ctx.fillText(`ω = ${Math.abs(s.omega).toFixed(2)} rad/s · 转向 ${s.omega >= 0 ? '顺时针' : '逆时针'}`, cX + cW + 16, r1 + 18)

    /* ─── 控件第二行：磁场换向 + 复位 ─── */
    const r2 = D.row2
    ctx.fillStyle = '#5A4636'
    ctx.font = `bold ${FS(10.5)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText('磁场', 44, r2)
    const fX = 118, fW = 168
    ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#D7C4A8'; ctx.lineWidth = 1.6
    ctx.beginPath(); ctx.roundRect(fX, r2 - 15, fW, 30, 15); ctx.fill(); ctx.stroke()
    ctx.fillStyle = s.field ? '#B91C1C' : '#1D4ED8'
    ctx.font = `bold ${FS(10)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(s.field ? 'N 在左 → 磁感线向右' : 'S 在左 ← 磁感线向左', fX + fW / 2, r2)
    canvasRef.current._clickAreas.push({
      x: TX(fX), y: TY(r2 - 17), w: fW * sc, h: 34 * sc,
      onClick: () => { S.current.field = !S.current.field; forceUpdate(n => n + 1) },
    })

    /* 记录按钮 */
    const recX = 316, recW = 176
    const recOn = on && Math.abs(s.omega) > 0.05 && s.records.length < MAX_REC
    ctx.fillStyle = recOn ? '#FFF7ED' : '#F5F0E8'
    ctx.strokeStyle = recOn ? '#EA580C' : '#D7C4A8'
    ctx.lineWidth = 1.8
    ctx.beginPath(); ctx.roundRect(recX, r2 - 17, recW, 34, 17); ctx.fill(); ctx.stroke()
    ctx.fillStyle = recOn ? '#B45309' : '#A08E76'
    ctx.font = `bold ${FS(10.5)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(`📋 记录一组（${s.records.length}/${MAX_REC}）`, recX + recW / 2, r2)
    canvasRef.current._clickAreas.push({
      x: TX(recX), y: TY(r2 - 19), w: recW * sc, h: 38 * sc,
      onClick: () => {
        if (!recOn) return
        S.current.records.push({
          I: S.current.I, comm: S.current.commutator, field: S.current.field,
          rpm: Math.abs(S.current.omega) * 60 / (2 * Math.PI),
          dir: S.current.omega >= 0 ? '顺时针' : '逆时针',
        })
        forceUpdate(n => n + 1)
      },
    })

    /* 复位 */
    const rstX = 512, rstW = 150
    ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#D7C4A8'; ctx.lineWidth = 1.6
    ctx.beginPath(); ctx.roundRect(rstX, r2 - 16, rstW, 32, 16); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#7A5C3E'
    ctx.font = `bold ${FS(10)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText('↻ 线圈归零重测', rstX + rstW / 2, r2)
    canvasRef.current._clickAreas.push({
      x: TX(rstX), y: TY(r2 - 18), w: rstW * sc, h: 36 * sc,
      onClick: () => {
        S.current.theta = 0; S.current.omega = 0; S.current.records = []
        S.current.cardScroll = 0
        forceUpdate(n => n + 1)
      },
    })

    ctx.restore()

    /* 开关命中区（屏幕坐标） */
    canvasRef.current._clickAreas.push({
      x: TX(D.swX - hSw - 12), y: TY(B - 22), w: (hSw + 12) * 2 * sc, h: 44 * sc,
      onClick: () => {
        S.current.switchClosed = !S.current.switchClosed
        forceUpdate(n => n + 1)
      },
    })

    /* ─── 知识卡 ─── */
    const SEC_COLORS = ['#E0761F', '#C98A12', '#CA8A04', '#C2410C', '#B45309', '#15803D', '#7C3AED', '#DC2626']
    const SECTIONS = buildSections(s.records, { I: s.I, comm: s.commutator, field: s.field, rpm, on }).map((sec, i) => ({
      t: sec.title, c: SEC_COLORS[i % SEC_COLORS.length], items: sec.lines,
    }))
    const cardOut = drawKnowledgeCard(ctx, panel, SECTIONS, {
      title: '📖 电动机知识',
      scroll: s.cardScroll,
      tip: (c, tx, ty) => {
        c.fillStyle = on ? '#B45309' : '#B08954'
        c.fillText(
          on
            ? `● 通电中｜I = ${s.I.toFixed(2)} A｜τ ≈ ${(TAU_K * s.I * (s.commutator ? Math.abs(Math.cos(s.theta)) : Math.cos(s.theta)) * (s.field ? 1 : -1)).toFixed(1)}｜${Math.round(rpm)} r/min｜${s.commutator ? '换向器接入' : '换向器拆掉（摆几下就停）'}`
            : `○ 开关断开：线圈不受安培力，转速按阻尼慢慢减为 0`,
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
      swX: TX(D.swX), swY: TY(B),
      sliderX0: TX(barX), sliderX1: TX(barX + barW), sliderY: TY(r1 + 6),
      commBtn: { x: TX(cX + cW / 2), y: TY(cY + cH / 2) },
      fieldBtn: { x: TX(fX + fW / 2), y: TY(r2) },
      recBtn: { x: TX(recX + recW / 2), y: TY(r2) },
      scale: sc, closed: on, I: s.I, comm: s.commutator, field: s.field,
      omega: s.omega, rpm, theta: s.theta, recN: s.records.length,
      panel: { x: panel.x, y: panel.y, w: panel.w, h: panel.h },
    }
  }

  /* ── 知识卡（8 节）── */
  function buildSections(records, cur) {
    const rows = records.map((r, i) => [
      [`第 ${i + 1} 组：`],
      [`I = ${r.I.toFixed(2)} A`, '#0EA5E9', 1],
      ['，'],
      [r.comm ? '换向器接入' : '换向器拆掉', r.comm ? '#15803D' : '#DC2626', 1],
      ['，'],
      [r.field ? 'N 在左' : 'S 在左', r.field ? '#B91C1C' : '#1D4ED8', 1],
      ['，稳定转速 '],
      [`${Math.round(r.rpm)} r/min`, '#7C3AED', 1],
      ['（'],
      [`${r.dir}`, '#B45309', 1],
      ['）。'],
    ])
    if (records.length >= 2) {
      const a = records[0], b = records[records.length - 1]
      let note
      if (a.comm !== b.comm) {
        note = ['对照：拆掉换向器后线圈只摆几下就停 —— 靠 ']
        note.push(['换向器', '#15803D', 1])
        note.push([' 每半圈翻转电流才能连续转。'])
      } else if (a.field !== b.field) {
        note = ['对照：只把磁场方向反一下，']
        note.push(['转向就反了', '#B45309', 1])
        note.push(['（不换电池、不换线圈）。'])
      } else if (Math.abs(a.I - b.I) > 0.01) {
        note = ['对照：I 从 ']
        note.push([`${a.I.toFixed(2)} → ${b.I.toFixed(2)} A`, '#0EA5E9', 1])
        note.push(['，转速也跟着变 —— 转矩 '])
        note.push(['τ ∝ I', '#B45309', 1])
        note.push(['。'])
      }
      if (note) rows.push(note)
    }
    return [
      {
        title: '① 实验目的',
        lines: [
          [['认识'], ['磁场对通电导线有力的作用', '#C2410C', 1], ['（安培力），并看懂'], ['通电线圈在磁场中转动', '#C2410C', 1], ['的原理。']],
          [['搞清'], ['换向器', '#15803D', 1], [' 为什么必须有 —— 没有它，线圈只能摆到'], ['平衡位置', '#7C3AED', 1], [' 就停住。']],
          [['弄明白'], ['转向', '#B45309', 1], [' 和'], ['转速', '#0EA5E9', 1], [' 各由什么决定。']],
        ],
      },
      {
        title: '② 实验器材',
        lines: [
          [['电源（电池组）、开关、导线；'], ['蹄形磁铁（N 红 / S 蓝）', '#C2410C', 1], ['、矩形线圈、'], ['换向器 + 电刷', '#15803D', 1], ['。']],
          [['换向器由两个'], ['半圆铜片', '#B45309', 1], [' 拼成、随线圈一起转；两个'], ['电刷', '#64748B', 1], [' 固定不动，贴着铜片滑动取电。']],
          [['真实电动机的定子就是磁极、转子就是线圈 —— 本仿真把外壳剖开画给你看。']],
        ],
      },
      {
        title: '③ 通电线圈为什么会转',
        lines: [
          [['线圈两侧在磁场中都受安培力，方向'], ['相反', '#DC2626', 1], ['、不在同一直线上 → 形成'], ['转矩', '#B45309', 1], ['，线圈就转起来。']],
          [['安培力方向用'], ['左手定则', '#7C3AED', 1], ['：四指指电流方向，让磁感线穿入手心，拇指就是受力方向。']],
          [['τ = K·I·cos θ', '#B45309', 1], ['：线圈平面与磁感线'], ['平行', '#15803D', 1], ['时转矩'], ['最大', '#15803D', 1], ['；'], ['垂直', '#DC2626', 1], ['时转矩为零。']],
        ],
      },
      {
        title: '④ 为什么必须有换向器（本实验的核心）',
        lines: [
          [['线圈转到'], ['平衡位置', '#7C3AED', 1], ['（平面与磁感线垂直）时，两侧安培力在同一直线上、方向相反 → 转矩为零，'], ['再转不过去', '#DC2626', 1], ['。']],
          [['拆掉换向器：线圈在平衡位置附近'], ['来回摆动几下就停住', '#DC2626', 1], ['（右下 τ–θ 曲线上一半正、一半负，净功为零）。']],
          [['换向器每半圈把线圈里的'], ['电流方向翻转一次', '#15803D', 1], ['，转矩方向就永远是同一侧 → 连续转动。']],
          [['点「换向器」按钮拆掉它，就是本实验最直观的一次对比。']],
        ],
      },
      {
        title: '⑤ 转速由什么决定',
        lines: [
          [['电流越大 → 转矩越大 → 转速越高：本仿真里 '], ['ω ∝ I', '#0EA5E9', 1], ['（I 从 0.2 到 1.0 A）。']],
          [['磁场越强（磁极越强）→ 转矩越大 → 转得越快；线圈匝数越多也一样。']],
          [['负载越重 → 转速越低（真实电动机带负载会掉速），本仿真在空载下演示。']],
        ],
      },
      {
        title: '⑥ 转向由什么决定',
        lines: [
          [['只要改变'], ['电流方向', '#0EA5E9', 1], [' 或 '], ['磁场方向', '#B91C1C', 1], [' 中的'], ['任意一个', '#DC2626', 1], ['，转向就反过来。']],
          [['两个同时改变 → 转向不变（左手定则里两个方向都反一次，拇指方向不变）。']],
        ],
      },
      {
        title: '⑦ 本次记录',
        lines: [
          ...rows,
          ...(records.length
            ? [[
              ['当前：'], [`I = ${cur.I.toFixed(2)} A`, '#0EA5E9', 1],
              ['，'], [cur.comm ? '换向器接入' : '换向器拆掉', cur.comm ? '#15803D' : '#DC2626', 1],
              ['，稳定转速 '], [`${Math.round(cur.rpm)} r/min`, '#7C3AED', 1],
            ]]
            : [[['转起来以后点「记录一组」，把电流、换向器有没有、转向、稳定转速记下来（最多 ' + MAX_REC + ' 组）。']]]),
        ],
      },
      {
        title: '⚠ 注意事项',
        lines: [
          [['本实验是'], ['磁场对电流的作用', '#DC2626', 1], ['（电动机原理），'], ['不是电磁感应', '#7C3AED', 1], ['—— 别和「磁生电」搞混。']],
          [['换向器与交流电是两回事：换向器是'], ['机械换向', '#B45309', 1], ['，把外部直流"切成"线圈内的交变电流。']],
          [['真实电动机有多个线圈、多组换向片，转过平衡位置更平稳；本仿真只画一组，方便看清原理。']],
          [['线圈卡住（转不动）时电流很大，会把线圈烧坏 —— 真实电动机不允许长时间堵转。']],
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
    s.switchClosed = false
    s.I = 0.6
    s.commutator = true
    s.field = true
    s.theta = 0; s.omega = 0
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
      title="电动机"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t) }}
      tab1Label="📖 电路演示"
      tab2Label="🔧 自己动手"
      onReset={handleReset}
      desc={tab === 1 ? (
        <>
          <b>电动机</b>
          <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
            磁场对通电线圈有力的作用 · 换向器每半圈翻转电流 · 拆掉换向器只摆几下就停 · 改变电流/磁场看转向与转速
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
            purpose="看懂通电线圈在磁场中转动、换向器为什么必须有，以及转向和转速各由什么决定。"
            steps={[
              '先看两块磁极：N 红在左、S 蓝在右，中间是水平磁感线',
              '点开关闭合，线圈转起来；观察线圈宽度在"忽宽忽窄"地翻转',
              '看右下 τ–θ 曲线：换向器接入时 τ 恒为正（|cosθ|）',
              '点「✗ 换向器已接入」拆掉它，线圈摆几下就停在平衡位置',
              '把电流 I 调大或调小，看转速跟着变',
              '点「磁场」把 N/S 对调，看转向反过来',
            ]}
            hint="转矩 τ = K·I·cosθ；换向器每半圈翻转电流 → τ 恒同向；改变电流方向或磁场方向任一 → 转向反。"
          />
        ) : (
          <InfoDock
            align="left"
            offset={{ left: 26, top: 26 }}
            hint="点右侧器材加入 → 拖拽移动 → 点接线柱连线。小电动机：两柱分别接电池两极（经开关），通电后风扇叶片会转；双击可看内部（定子磁极 + 转子线圈 + 换向片）。"
            hintTitle="操作说明"
          />
        )}
        {tab === 2 && (
          <BuilderPalette
            side="right"
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
              // 本专题专用：小电动机（风扇 + 内部换向器剖视）
              { type: 'motor', name: '小电动机', icon: thumb('motor') },
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

function drawLine(ctx, x1, y1, x2, y2, color, lw) {
  ctx.strokeStyle = color
  ctx.lineWidth = lw
  ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
}

/** 电流小圆点流动 */
function drawFlow(ctx, path, t, color, reverse) {
  let total = 0
  const segs = []
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1]
    const d = Math.hypot(b.x - a.x, b.y - a.y)
    segs.push({ a, b, d, s0: total })
    total += d
  }
  if (!total) return
  const n = Math.max(3, Math.round(total / 26))
  ctx.fillStyle = color
  for (let k = 0; k < n; k++) {
    let u = ((k / n) + (t % 1) + (reverse ? 0.5 : 0)) % 1
    const pos = u * total
    const sg = segs.find((s) => pos >= s.s0 && pos <= s.s0 + s.d) || segs[segs.length - 1]
    const f = sg.d ? (pos - sg.s0) / sg.d : 0
    ctx.beginPath()
    ctx.arc(sg.a.x + (sg.b.x - sg.a.x) * f, sg.a.y + (sg.b.y - sg.a.y) * f, 2.4, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** 箭头 */
function drawArrow(ctx, x1, y1, x2, y2, color, w, headLen = 9) {
  const a = Math.atan2(y2 - y1, x2 - x1)
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
  ctx.fillStyle = color
  const h = headLen, sp = 0.42
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - h * Math.cos(a - sp), y2 - h * Math.sin(a - sp))
  ctx.lineTo(x2 - h * Math.cos(a + sp), y2 - h * Math.sin(a + sp))
  ctx.closePath(); ctx.fill()
}

/* ─── 电动机剖面：磁极 + 磁感线 + 线圈 + 转轴 + 换向器 + 电刷 ─── */
function drawMotorBody(ctx, o) {
  const { cx, cy, theta, on, I, field, commutator, FS } = o
  const c = Math.cos(theta)
  const aH = D.aH, bH = D.bH
  const magL = D.magL, magLw = D.magLw, magR = D.magR, magRw = D.magRw
  const egy = D.egy, egyR = D.egyR, brushDx = D.brushDx

  /* 磁极（左 N 红 / 右 S 蓝；field=false 时互换颜色与字母） */
  const leftIsN = field
  const lc = leftIsN ? '#DC2626' : '#2563EB'
  const rc = leftIsN ? '#2563EB' : '#DC2626'
  const lPole = leftIsN ? 'N' : 'S'
  const rPole = leftIsN ? 'S' : 'N'

  for (const [x0, w0, col, pole] of [
    [magL, magLw, lc, lPole],
    [magR, magRw, rc, rPole],
  ]) {
    const g = ctx.createLinearGradient(x0, 0, x0 + w0, 0)
    g.addColorStop(0, shade(col, 0.28))
    g.addColorStop(0.45, col)
    g.addColorStop(1, shade(col, -0.25))
    ctx.fillStyle = g
    ctx.strokeStyle = shade(col, -0.35); ctx.lineWidth = 1.6
    ctx.beginPath(); ctx.roundRect(x0, cy - 108, w0, 216, 7); ctx.fill(); ctx.stroke()
    // 极面高光
    ctx.fillStyle = shade(col, 0.42)
    ctx.fillRect(pole === 'N' ? x0 + w0 - 7 : x0, cy - 104, 7, 208)
    // 极标
    ctx.fillStyle = '#FFFFFF'
    ctx.font = `900 ${FS(26)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(pole, x0 + w0 / 2, cy - 56)
    ctx.font = `${FS(8.5)}px "Microsoft YaHei", sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.fillText('磁极', x0 + w0 / 2, cy + 62)
  }

  /* 磁感线：从 N 极面水平指向 S 极面（永磁体，一直在） */
  const ys = [-84, -50, -17, 17, 50, 84]
  ctx.strokeStyle = on ? 'rgba(100,116,139,0.62)' : 'rgba(120,134,146,0.45)'
  ctx.lineWidth = 1.3
  for (const y of ys) {
    ctx.setLineDash([5, 5])
    ctx.beginPath(); ctx.moveTo(magL + magLw, cy + y); ctx.lineTo(magR, cy + y); ctx.stroke()
    ctx.setLineDash([])
    // 箭头（指向 S 极）
    const ax = leftIsN ? magR - 6 : magL + magLw + 6
    drawArrow(ctx, leftIsN ? magR - 16 : magL + magLw + 16, cy + y, ax, cy + y,
      on ? 'rgba(71,85,105,0.75)' : 'rgba(120,134,146,0.45)', 1.2, 7)
  }

  /* 转轴（竖直，在屏幕平面内 —— 线圈绕它旋转） */
  ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 2.4
  ctx.beginPath(); ctx.moveTo(cx, cy - bH - 14); ctx.lineTo(cx, egy + 6); ctx.stroke()

  /* 线圈：宽度随 cosθ 收缩（侧视时"转出屏幕"的那一半变细变淡） */
  const halfW = aH * Math.abs(c)
  const frontIsRight = c >= 0
  const xl = cx - halfW, xr = cx + halfW
  const frontW = 4.2, backW = 2.2

  // 上下两条边
  ctx.strokeStyle = on ? '#B45309' : '#8A7A66'
  ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(xl, cy - bH); ctx.lineTo(xr, cy - bH); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(xl, cy + bH); ctx.lineTo(xr, cy + bH); ctx.stroke()

  // 左右两条竖边（前边粗、后边细）
  const lwL = frontIsRight ? backW : frontW
  const lwR = frontIsRight ? frontW : backW
  const colF = on ? '#C2410C' : '#8A7A66'
  const colB = on ? '#D9A18A' : '#B3A797'
  ctx.strokeStyle = frontIsRight ? colB : colF
  ctx.lineWidth = lwL
  ctx.beginPath(); ctx.moveTo(xl, cy - bH); ctx.lineTo(xl, cy + bH); ctx.stroke()
  ctx.strokeStyle = frontIsRight ? colF : colB
  ctx.lineWidth = lwR
  ctx.beginPath(); ctx.moveTo(xr, cy - bH); ctx.lineTo(xr, cy + bH); ctx.stroke()

  // 线圈里的电流方向（有电流时画箭头 + 流动点）
  const dirSign = field ? 1 : -1
  if (on && Math.abs(I) > 0.001) {
    const col = '#F59E0B'
    const ay = bH - 16
    // 左（或右）边电流一个向上、一个向下
    if (halfW > 8) {
      const upOnRight = dirSign > 0
      if (upOnRight) {
        drawArrow(ctx, xr, cy + ay, xr, cy - ay, col, 2.2, 8)
        drawArrow(ctx, xl, cy - ay, xl, cy + ay, col, 2.2, 8)
      } else {
        drawArrow(ctx, xr, cy - ay, xr, cy + ay, col, 2.2, 8)
        drawArrow(ctx, xl, cy + ay, xl, cy - ay, col, 2.2, 8)
      }
      ctx.fillStyle = col
      ctx.font = `bold ${FS(9)}px "Microsoft YaHei", sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('I', cx, cy + 3)
    }
  }

  /* 两侧安培力：侧视图里力垂直于纸面 → 用 ⊙（朝纸外）/ ⊗（朝纸内）表达，
     一边朝里、一边朝外，正好形成转矩（这是教科书画侧视图的标准做法） */
  const tauSign = (commutator ? Math.abs(c) : c) * dirSign
  if (on) {
    const col = '#7C3AED'
    const fx = 5
    const lOut = tauSign >= 0            // 左边朝纸外（⊙）、右边朝纸内（⊗）
    const drawDot = (x, y, out) => {
      ctx.strokeStyle = col; ctx.lineWidth = 1.8
      ctx.beginPath(); ctx.arc(x, y, fx + 1.4, 0, Math.PI * 2); ctx.stroke()
      if (out) {
        ctx.fillStyle = col
        ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill()
      } else {
        const d = (fx + 1.4) * 0.62
        ctx.beginPath()
        ctx.moveTo(x - d, y - d); ctx.lineTo(x + d, y + d)
        ctx.moveTo(x + d, y - d); ctx.lineTo(x - d, y + d)
        ctx.stroke()
      }
    }
    // 符号放在线圈外侧（线圈转到很窄时也不至于压在线条上）
    const dotDx = Math.max(halfW, 12) + 7
    drawDot(cx - dotDx, cy, lOut)
    drawDot(cx + dotDx, cy, !lOut)
    ctx.fillStyle = col
    ctx.font = `bold ${FS(9)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText('F', cx - dotDx, cy - fx - 4)
    ctx.fillText('F', cx + dotDx, cy - fx - 4)
  }

  /* 转向标记（转轴顶端） */
  if (on && Math.abs(I) > 0.001) {
    const col = tauSign >= 0 ? '#15803D' : '#7C3AED'
    ctx.fillStyle = col
    ctx.font = `bold ${FS(17)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(tauSign >= 0 ? '↻' : '↺', cx, cy - bH - 26)
  }

  /* 平衡位置提示（θ ≈ ±90° 且没换向器）：两行短句放在磁极上方，不压磁铁 */
  if (Math.abs(c) < 0.09 && on && !commutator) {
    ctx.fillStyle = '#DC2626'
    ctx.font = `bold ${FS(8.6)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText('平衡位置：线圈平面 ⊥ 磁感线', cx, cy - 116)
    ctx.fillText('两侧 F 共线反向 → τ = 0，转不过去', cx, cy - 104)
  }

  /* 换向器（两个半圆铜片随线圈一起转）+ 两个电刷 */
  const copper = '#B45309', copperHi = '#F59E0B'
  // 铜片 A：θ → θ+π；拆掉换向器时只留灰色虚线轮廓（表示"拆了、不导电"）
  ctx.save(); ctx.translate(cx, egy)
  if (!commutator) {
    ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 1.2; ctx.setLineDash([4, 3])
    ctx.beginPath(); ctx.arc(0, 0, egyR, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.arc(0, 0, egyR - 7, 0, Math.PI * 2); ctx.stroke()
    ctx.setLineDash([])
  }
  for (let k = 0; k < 2 && commutator; k++) {
    const a0 = theta + k * Math.PI
    ctx.fillStyle = k === 0 ? copper : shade(copper, 0.18)
    ctx.beginPath()
    ctx.arc(0, 0, egyR, a0, a0 + Math.PI)
    ctx.arc(0, 0, egyR - 7, a0 + Math.PI, a0, true)
    ctx.closePath(); ctx.fill()
    ctx.strokeStyle = shade(copper, -0.3); ctx.lineWidth = 1.2; ctx.stroke()
    // 高光弧
    ctx.strokeStyle = copperHi; ctx.lineWidth = 1.4
    ctx.beginPath(); ctx.arc(0, 0, egyR - 2, a0 + 0.15, a0 + Math.PI - 0.15); ctx.stroke()
  }
  // 绝缘缝
  if (commutator) {
    ctx.strokeStyle = '#7C2D12'; ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(Math.cos(theta) * (egyR - 7), Math.sin(theta) * (egyR - 7))
    ctx.lineTo(Math.cos(theta) * egyR, Math.sin(theta) * egyR)
    ctx.moveTo(Math.cos(theta + Math.PI) * (egyR - 7), Math.sin(theta + Math.PI) * (egyR - 7))
    ctx.lineTo(Math.cos(theta + Math.PI) * egyR, Math.sin(theta + Math.PI) * egyR)
    ctx.stroke()
  }
  ctx.restore()

  // 两个电刷（固定不转）：贴着铜片的小方块 + 引线
  for (const sx of [-brushDx, brushDx]) {
    const bx = cx + sx
    ctx.fillStyle = commutator ? '#475569' : '#94A3B8'
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.roundRect(sx < 0 ? bx - 2 : bx - 3, egy - 6, 5, 12, 2)
    ctx.fill(); ctx.stroke()
    // 弹簧 / 引线（示意电刷压紧铜片）
    ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(bx, egy)
    ctx.lineTo(bx, egy + 12)
    ctx.stroke()
  }
  ctx.fillStyle = commutator ? '#5D4037' : '#94A3B8'
  ctx.font = `bold ${FS(9)}px "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  ctx.fillText(commutator ? '换向器（两个半圆铜片）' : '换向器（已拆掉）', cx, egy + egyR + 6)
  if (!commutator) {
    ctx.fillStyle = '#DC2626'
    ctx.font = `bold ${FS(8.8)}px "Microsoft YaHei", sans-serif`
    ctx.fillText('铜片断开 → 半圈后电流不换向', cx, egy + egyR + 21)
  }
  // 电刷标注
  ctx.fillStyle = '#64748B'
  ctx.font = `${FS(8.5)}px "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
  ctx.fillText('电刷', cx + brushDx + 8, egy - 14)
  ctx.textAlign = 'right'
  ctx.fillText('电刷', cx - brushDx - 8, egy - 14)
}

/** 颜色明暗调整（比例 -1..1） */
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const f = (v) => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))))
  return `rgb(${f(r)},${f(g)},${f(b)})`
}

/** τ–θ 曲线：横轴 0..360°，纵轴转矩。接入换向器时取 |cos|（全正），
 *  拆掉时取 cos（一正一负 → 净功为零，正是"摆动停住"的根源） */
function drawTauChart(ctx, x, y, w, h, o) {
  const { theta, I, commutator, field, on, FS } = o
  const px = x + 34, py = y + 34, pw = w - 48, ph = h - 48
  ctx.fillStyle = '#FFFDF9'
  ctx.strokeStyle = '#E8DCC8'; ctx.lineWidth = 1.6
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.fill(); ctx.stroke()

  ctx.fillStyle = '#5D4037'
  ctx.font = `bold ${FS(10)}px "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  ctx.fillText(commutator ? 'τ–θ 曲线：换向器接入 → τ 恒为正' : 'τ–θ 曲线：换向器拆掉 → 一半正一半负', x + 12, y + 8)

  // 坐标轴（y=0 在中线）
  const y0 = py + ph / 2
  ctx.strokeStyle = '#D7C4A8'; ctx.lineWidth = 1.2
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + ph); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(px, y0); ctx.lineTo(px + pw, y0); ctx.stroke()
  // 刻度
  ctx.fillStyle = '#A08E76'
  ctx.font = `${FS(8)}px "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  for (const d of [0, 90, 180, 270, 360]) {
    const tx = px + (d / 360) * pw
    ctx.fillText(`${d}°`, tx, py + ph + 3)
  }

  // 曲线
  const amp = ph / 2 - 3
  const maxTau = TAU_K * 1.0
  ctx.strokeStyle = commutator ? '#15803D' : '#B45309'
  ctx.lineWidth = 2.2
  ctx.beginPath()
  for (let i = 0; i <= pw; i++) {
    const tt = (i / pw) * Math.PI * 2
    const v = (commutator ? Math.abs(Math.cos(tt)) : Math.cos(tt))
    const yy = y0 - (v * TAU_K * I / maxTau) * amp
    if (i === 0) ctx.moveTo(px, yy); else ctx.lineTo(px + i, yy)
  }
  ctx.stroke()

  // 当前点
  const cur = ((theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
  const cv = (commutator ? Math.abs(Math.cos(cur)) : Math.cos(cur))
  const dotX = px + (cur / (Math.PI * 2)) * pw
  const dotY = y0 - (cv * TAU_K * I / maxTau) * amp
  ctx.fillStyle = '#DC2626'
  ctx.beginPath(); ctx.arc(dotX, dotY, 4.5, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = 'rgba(220,38,38,0.35)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(dotX, y0); ctx.lineTo(dotX, dotY); ctx.stroke()

  // 说明
  ctx.fillStyle = on ? '#7C2D12' : '#A08E76'
  ctx.font = `bold ${FS(9)}px "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'
  ctx.fillText(commutator ? '平均 τ > 0 → 连续转' : '正负相抵 → 平均 τ = 0 → 停住', px + pw, py - 2)
}
