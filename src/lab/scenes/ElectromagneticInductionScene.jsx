import { useState, useRef, useEffect, useCallback } from 'react'
import { eventToCanvas } from '../utils/pointerPos'
import SceneShell from '../ui/SceneShell'
import InfoDock from '../ui/InfoDock'
import BuilderPalette from '../ui/BuilderPalette'
import { drawKnowledgeCard } from '../ui/knowledgeCard'
import BuilderSVG from '../simple3d/BuilderSVG.jsx'
import { TYPES } from './electricSvgInstruments.js'
import { symSwitch, symHalf, SYM_INK } from '../render/symbols.js'

/** 器材栏缩略图：直接用器材库里的矢量图（f 缩放留白） */
function thumb(type) {
  const t = TYPES[type]
  if (!t) return null
  const svg = t.render({ id: `pal-${type}`, f: 0.4 }, { I: 0, bright: 0.5, frac: 0 })
  return <span dangerouslySetInnerHTML={{ __html: svg }} />
}

/**
 * ElectromagneticInductionScene — 电磁感应（法拉第实验）
 * 第 11 个按「简单电路」模板改造的初中电学实验（教材 20.5《磁生电》）
 *
 *  三件事：
 *    ① 闭合电路的一部分导体做**切割磁感线**运动 → 产生感应电流（磁生电）
 *    ② 感应电流的方向由**导体运动方向**和**磁场方向**决定，只改其中一个电流就反向
 *    ③ 感应电流的大小由**运动快慢**、**磁场强弱**、**切割是否垂直**决定（ε = Blv）
 *
 *  Tab1 📖 电路演示 —— 暖色底 + 标准符号回路（无电源！只有导体棒 / 开关 / 灵敏电流计）
 *                       上方：上 N 下 S 两块磁极 + 竖直磁感线 + 左右往复的导体棒
 *                       中部：灵敏电流计（中央零点，指针左右摆）
 *                       右上：i–t 实时曲线 —— 导体棒来回走，电流正负交替（这就是交流电）
 *  Tab2 🔧 自己动手 —— 9 件基础器材 + 本专题专用「灵敏电流计」（中央零点、指针能左右偏）
 */

/* 设计坐标系（整体等比缩放 + 居中） */
const D = {
  magX: 196, magW: 348, magH: 40,   // 磁极条的横向范围与厚度
  topY: 112, botY: 268,             // 上磁极 y=112..152（N），下磁极 y=268..308（S）
  rodY: 210, rodLen: 100,           // 导体棒中心线 / 长度
  rodXc: 370, rodAmp: 118,          // 往复中心 / 振幅（248..488）
  L: 152, R: 588, B: 440,           // 回路：左右竖边 / 底边
  swX: 226,                         // 底边上的开关
  gx: 300, gy: 308,                 // 灵敏电流计（176×132，柱在 y0+112）
  row1: 572, row2: 632,
  chX: 600, chY: 128, chW: 268, chH: 132,   // i–t 曲线
  VW: 900, VH: 730,
}

const GALV_FS = 0.15        // 灵敏电流计满偏（A）
const MAX_REC = 4

export default function ElectromagneticInductionScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const builderRef = useRef(null)

  const S = useRef({
    tab: 1,
    switchClosed: false,
    moving: true,               // 导体棒是否在往复运动
    speed: 0.6,                 // 0.2 ~ 1.0（往复快慢）
    field: true,                // true = N 在上（磁感线向下）；false 反向
    phase: 0,                   // 往复相位
    t: 0,
    records: [],
    peak: 0,                    // 本组 |i| 的峰值（记录用「最大偏转」）
    trace: [],                  // i–t 曲线缓冲 [t, i]
    wireColor: '#F44336',
    cardScroll: 0,
    cardDrag: null,
    dragging: false,
  })

  const [tab, setTab] = useState(1)
  const [, forceUpdate] = useState(0)

  /* 瞬时状态：棒位置 / 速度 / 感应电流 */
  const stateOf = (s) => {
    const om = 0.5 + s.speed * 1.0           // 往复角频率（rad/s）
    const v = s.moving ? D.rodAmp * om * Math.cos(s.phase) : 0
    const rodX = D.rodXc + (s.moving ? D.rodAmp * Math.sin(s.phase) : 0)
    // ε = Blv：磁场方向 + 运动方向共同决定电流方向
    const i = s.switchClosed ? (v * (s.field ? 1 : -1)) / 1250 : 0
    return { rodX, v, i, om }
  }

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
      const dt = Math.min(0.05, (now - last) / 1000); last = now
      const s = S.current
      s.t += dt
      if (s.moving) s.phase += (0.5 + s.speed * 1.0) * dt
      // i–t 曲线缓冲（每帧一个点，保留最近 8 秒）
      const st = stateOf(s)
      s.trace.push({ t: s.t, i: st.i })
      while (s.trace.length && s.t - s.trace[0].t > 8) s.trace.shift()

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
    const st = stateOf(s)
    const on = s.switchClosed
    const i = st.i
    /* 记录「这一组的最大偏转」：棒走一个来回里 |i| 到的最大值 */
    if (on && Math.abs(i) > (s.peak || 0)) s.peak = Math.abs(i)
    if (!on) s.peak = 0

    /* 右侧知识卡面板 */
    const RAIL = 46
    const pw = Math.max(300, Math.min(W * 0.40, 700))
    const panel = { x: W - 16 - RAIL - pw, y: 10, w: pw, h: H - 38 }
    const viewW = panel.x - 16

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

    const { L, R: RR, B, rodY, rodLen, swX } = D
    const rodX = st.rodX
    const rodL = rodX - rodLen / 2, rodR = rodX + rodLen / 2

    /* ─── 回路：棒 → 左右竖边 → 底边（中间放开关），无电源 ─── */
    const hSw = symHalf('switch', 1)
    drawLine(ctx, rodL, rodY, L, rodY, wc, lw)
    drawLine(ctx, rodR, rodY, RR, rodY, wc, lw)
    drawLine(ctx, L, rodY, L, B, wc, lw)
    drawLine(ctx, RR, rodY, RR, B, wc, lw)
    // 底边：左半段（含开关）与右半段分别接到电流计的两个接线柱
    const gTermL = D.gx + 38, gTermR = D.gx + 138, gTermY = D.gy + 122
    drawLine(ctx, L, B, swX - hSw, B, wc, lw)
    drawLine(ctx, swX + hSw, B, gTermL, B, wc, lw)
    drawLine(ctx, gTermL, B, gTermL, gTermY, wc, lw)
    drawLine(ctx, gTermR, gTermY, gTermR, B, wc, lw)
    drawLine(ctx, gTermR, B, RR, B, wc, lw)

    /* ─── 磁极（上 N 红 / 下 S 蓝）+ 竖直磁感线 ─── */
    drawMagnet(ctx, D.magX, D.topY, D.magW, D.magH, 'N', s.field, FS)
    drawMagnet(ctx, D.magX, D.botY, D.magW, D.magH, 'S', s.field, FS)
    // 磁感线：从上磁极到下磁极（N → S）；磁场反向时箭头朝上
    const y0 = D.topY + D.magH, y1 = D.botY
    for (let k = 0; k < 6; k++) {
      const fx = D.magX + 28 + k * 48
      ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 1.1; ctx.setLineDash([5, 4])
      ctx.beginPath(); ctx.moveTo(fx, y0); ctx.lineTo(fx, y1); ctx.stroke()
      ctx.setLineDash([])
      const ay = s.field ? y1 - 7 : y0 + 7
      const ad = s.field ? 1 : -1
      drawArrow(ctx, fx, ay - ad * 6, fx, ay, '#64748B', 1.8, 7)
    }

    /* ─── 导体棒（铜色粗棒 + 两端柱帽 + 运动箭头）─── */
    drawRod(ctx, rodL, rodR, rodY, on ? i : 0, FS)

    /* 运动方向箭头 v（棒下方） */
    if (s.moving && Math.abs(st.v) > 6) {
      const dir = st.v > 0 ? 1 : -1
      const ax = rodX
      drawArrow(ctx, ax - dir * 34, rodY + 26, ax + dir * 34, rodY + 26, '#0EA5E9', 2.4, 10)
      ctx.fillStyle = '#0369A1'
      ctx.font = `bold ${FS(9.5)}px "Microsoft YaHei", sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText('v', ax, rodY + 30)
    } else if (!s.moving) {
      ctx.font = `bold ${FS(9.5)}px "Microsoft YaHei", sans-serif`
      const tw = ctx.measureText('棒静止 · 不切割磁感线').width
      ctx.fillStyle = 'rgba(253,246,236,0.94)'
      ctx.beginPath(); ctx.roundRect(rodX - tw / 2 - 6, rodY + 22, tw + 12, 17, 5); ctx.fill()
      ctx.fillStyle = '#64748B'
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText('棒静止 · 不切割磁感线', rodX, rodY + 25)
    }

    /* ─── 回路电流流动点（棒内方向由 drawRod 内的箭头表示）─── */
    if (on && Math.abs(i) > 1e-4) {
      const iSign = i > 0 ? 1 : -1
      drawFlow(ctx, [
        { x: rodL, y: rodY }, { x: L, y: rodY }, { x: L, y: B }, { x: swX - hSw, y: B },
      ], s.t, '#FBBF24', iSign < 0)
      drawFlow(ctx, [
        { x: rodR, y: rodY }, { x: RR, y: rodY }, { x: RR, y: B }, { x: gTermR, y: B }, { x: gTermR, y: gTermY },
      ], s.t, '#FBBF24', iSign > 0)
    }

    /* ─── 开关（底边上）─── */
    symSwitch(ctx, swX, B, { closed: on, scale: 1, ink })
    ctx.fillStyle = '#5D4037'
    ctx.font = `bold ${FS(10)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('开关（点击）', swX, B + 20)

    /* ─── 灵敏电流计（中央零点）─── */
    drawGalv(ctx, D.gx, D.gy, 176, 132, on ? i / GALV_FS : 0, FS)

    /* ─── i–t 曲线 ─── */
    drawITChart(ctx, D.chX, D.chY, D.chW, D.chH, s.trace, s.t, { on, FS, field: s.field })

    /* ─── 控件第一行：往复快慢 + 暂停 ─── */
    const r1 = D.row1
    ctx.fillStyle = '#5A4636'
    ctx.font = `bold ${FS(10.5)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText(`移动快慢（越大感应电流越大）`, 44, r1 - 22)
    const barX = 54, barW = 190
    ctx.strokeStyle = '#D7C4A8'; ctx.lineWidth = 4
    ctx.beginPath(); ctx.moveTo(barX, r1 + 8); ctx.lineTo(barX + barW, r1 + 8); ctx.stroke()
    const px = barX + ((s.speed - 0.2) / 0.8) * barW
    ctx.fillStyle = '#0EA5E9'
    ctx.beginPath(); ctx.arc(px, r1 + 8, 8, 0, Math.PI * 2); ctx.fill()
    canvasRef.current._clickAreas.push({
      x: TX(barX - 12), y: TY(r1 - 16), w: (barW + 24) * sc, h: 48 * sc,
      onClick: (mxp) => {
        const v = ((mxp - ox) / sc - barX) / barW
        S.current.speed = Math.round((0.2 + Math.max(0, Math.min(1, v)) * 0.8) * 100) / 100
        S.current.peak = 0
        forceUpdate(n => n + 1)
      },
      onDrag: (mxp) => {
        const v = ((mxp - ox) / sc - barX) / barW
        S.current.speed = Math.round((0.2 + Math.max(0, Math.min(1, v)) * 0.8) * 100) / 100
        S.current.peak = 0
        forceUpdate(n => n + 1)
      },
    })

    const pX = 300, pW = 150, pY = r1 - 15, pH = 32
    ctx.fillStyle = s.moving ? '#EFF6FF' : '#FEF2F2'
    ctx.strokeStyle = s.moving ? '#1D4ED8' : '#DC2626'
    ctx.lineWidth = 1.8
    ctx.beginPath(); ctx.roundRect(pX, pY, pW, pH, 16); ctx.fill(); ctx.stroke()
    ctx.fillStyle = s.moving ? '#1D4ED8' : '#B91C1C'
    ctx.font = `bold ${FS(10.5)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(s.moving ? '⏸ 让导体棒停住' : '▶ 继续往复运动', pX + pW / 2, pY + pH / 2)
    canvasRef.current._clickAreas.push({
      x: TX(pX), y: TY(pY - 2), w: pW * sc, h: (pH + 4) * sc,
      onClick: () => { S.current.moving = !S.current.moving; forceUpdate(n => n + 1) },
    })

    /* 电流读数（按钮右） */
    ctx.fillStyle = on ? '#B45309' : '#8D6E63'
    ctx.font = `bold ${FS(10.5)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText(on ? `感应电流 |i| = ${(Math.abs(i) * 1000).toFixed(0)} mA` : '开关断开 · 无感应电流', pX + pW + 16, r1)
    ctx.fillStyle = '#8D6E63'
    ctx.font = `${FS(9)}px "Microsoft YaHei", sans-serif`
    ctx.fillText(on ? (i > 1e-5 ? '指针右偏（电流由 + 柱流入）' : i < -1e-5 ? '指针左偏（电流方向相反）' : '指针居中（棒在端点、v=0）') : '必须闭合电路才产生感应电流', pX + pW + 16, r1 + 18)

    /* ─── 控件第二行：磁场反向 + 记录 + 复位 ─── */
    const r2 = D.row2
    ctx.fillStyle = '#5A4636'
    ctx.font = `bold ${FS(10.5)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText('磁场', 44, r2)
    const fX = 118, fW = 180
    ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#D7C4A8'; ctx.lineWidth = 1.6
    ctx.beginPath(); ctx.roundRect(fX, r2 - 15, fW, 30, 15); ctx.fill(); ctx.stroke()
    ctx.fillStyle = s.field ? '#B91C1C' : '#1D4ED8'
    ctx.font = `bold ${FS(10)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(s.field ? 'N 在上 → 磁感线向下' : 'S 在上 ← 磁感线向上', fX + fW / 2, r2)
    canvasRef.current._clickAreas.push({
      x: TX(fX), y: TY(r2 - 17), w: fW * sc, h: 34 * sc,
      onClick: () => { S.current.field = !S.current.field; forceUpdate(n => n + 1) },
    })

    const recX = 320, recW = 176
    const recOn = on && s.records.length < MAX_REC
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
        const cur = stateOf(S.current)
        S.current.records.push({
          speed: S.current.speed,
          field: S.current.field,
          ipk: Math.max(S.current.peak || 0, Math.abs(cur.i)),
        })
        forceUpdate(n => n + 1)
      },
    })

    const rstX = 516, rstW = 150
    ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#D7C4A8'; ctx.lineWidth = 1.6
    ctx.beginPath(); ctx.roundRect(rstX, r2 - 16, rstW, 32, 16); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#7A5C3E'
    ctx.font = `bold ${FS(10)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText('↻ 归零重测', rstX + rstW / 2, r2)
    canvasRef.current._clickAreas.push({
      x: TX(rstX), y: TY(r2 - 18), w: rstW * sc, h: 36 * sc,
      onClick: () => {
        S.current.phase = 0; S.current.records = []; S.current.trace = []
        S.current.cardScroll = 0; S.current.moving = true; S.current.speed = 0.6; S.current.peak = 0
        forceUpdate(n => n + 1)
      },
    })

    ctx.restore()

    /* 开关命中区（屏幕坐标） */
    canvasRef.current._clickAreas.push({
      x: TX(swX - hSw - 12), y: TY(B - 22), w: (hSw + 12) * 2 * sc, h: 44 * sc,
      onClick: () => { S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1) },
    })

    /* ─── 知识卡 ─── */
    const SEC_COLORS = ['#E0761F', '#C98A12', '#CA8A04', '#C2410C', '#B45309', '#15803D', '#7C3AED', '#DC2626']
    const SECTIONS = buildSections(s.records, {
      on, field: s.field, i, speed: s.speed, moving: s.moving,
    }).map((sec, idx) => ({ t: sec.title, c: SEC_COLORS[idx % SEC_COLORS.length], items: sec.lines }))
    const cardOut = drawKnowledgeCard(ctx, panel, SECTIONS, {
      title: '📖 电磁感应知识',
      scroll: s.cardScroll,
      tip: (c2, tx, ty) => {
        c2.fillStyle = on ? '#B45309' : '#B08954'
        c2.fillText(
          on
            ? `● ${s.moving ? '棒在动' : '棒已停住'}｜i = ${(i * 1000).toFixed(0)} mA｜${Math.abs(i) < 1e-4 ? '指针居中' : i > 0 ? '指针右偏' : '指针左偏'}｜磁场 ${s.field ? '向下' : '向上'}`
            : `○ 开关断开：电路不闭合，切割磁感线也不产生电流`,
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
      swX: TX(swX), swY: TY(B),
      sliderX0: TX(barX), sliderX1: TX(barX + barW), sliderY: TY(r1 + 8),
      pauseBtn: { x: TX(pX + pW / 2), y: TY(pY + pH / 2) },
      fieldBtn: { x: TX(fX + fW / 2), y: TY(r2) },
      recBtn: { x: TX(recX + recW / 2), y: TY(r2) },
      scale: sc, closed: on, i, field: s.field, moving: s.moving, speed: s.speed,
      rodX: st.rodX, recN: s.records.length,
      panel: { x: panel.x, y: panel.y, w: panel.w, h: panel.h },
    }
  }

  /* ── 知识卡（8 节）── */
  function buildSections(records, cur) {
    const rows = records.map((r, k) => [
      [`第 ${k + 1} 组：`],
      [`快慢 ${r.speed.toFixed(2)}`, '#0EA5E9', 1],
      ['，磁场'],
      [r.field ? '向下' : '向上', r.field ? '#B91C1C' : '#1D4ED8', 1],
      ['，最大电流 '],
      [`${(r.ipk * 1000).toFixed(0)} mA`, '#B45309', 1],
      ['（指针左右来回摆）'],
    ])
    if (records.length >= 2) {
      const a = records[0], b = records[records.length - 1]
      let note
      if (a.field !== b.field) {
        note = ['对照：只把磁场方向反一下 —— 最大电流']
        note.push(['一样大', '#B45309', 1])
        note.push(['，指针改往另一边摆（'])
        note.push(['方向反了', '#B45309', 1])
        note.push(['）。'])
      } else if (Math.abs(a.speed - b.speed) > 0.01) {
        note = ['对照：移动得更快（']
        note.push([`${a.speed.toFixed(2)} → ${b.speed.toFixed(2)}`, '#0EA5E9', 1])
        note.push(['）—— 最大电流'])
        note.push(['变大', '#B45309', 1])
        note.push(['，'])
        note.push(['i 跟 v 成正比', '#B45309', 1])
        note.push(['（ε = Blv）。'])
      }
      if (note) rows.push(note)
    }
    if (records.length === 0) {
      rows.push([['还没记录。闭合开关、让棒往复运动，再点「记录一组」。']])
    }

    return [
      {
        title: '① 实验目的',
        lines: [
          [['重现法拉第的发现：'], ['磁能生电', '#C2410C', 1], ['（电磁感应），知道'], ['感应电流', '#B45309', 1], [' 是怎么来的。']],
          [['搞清产生感应电流的'], ['两个条件', '#15803D', 1], ['，并会判断'], ['电流方向', '#7C3AED', 1], [' 和'], ['大小', '#0EA5E9', 1], ['。']],
          [['理解发电机为什么能发出'], ['方向不断改变的电流', '#DC2626', 1], ['。']],
        ],
      },
      {
        title: '② 实验器材',
        lines: [
          [['蹄形磁铁（这里剖成'], ['上 N 红 / 下 S 蓝', '#C2410C', 1], [' 两块磁极）、'], ['导体棒 AB', '#B45309', 1], ['（粗铜棒）。']],
          [['灵敏电流计', '#15803D', 1], ['：'], ['中央零点', '#7C3AED', 1], ['，指针能往左、往右两个方向偏 —— 用它看"有没有电流、往哪边流"。']],
          [['开关、导线。'], ['注意：本实验电路里没有电源', '#DC2626', 1], ['。']],
        ],
      },
      {
        title: '③ 法拉第的发现：磁能生电',
        lines: [
          [['1820 年奥斯特发现'], ['电流周围有磁场', '#15803D', 1], ['（电生磁）；法拉第反过来想：'], ['磁场能不能生电', '#B45309', 1], ['？']],
          [['1831 年他做成：闭合电路里的一部分导体'], ['在磁场中运动', '#0EA5E9', 1], ['，电流计指针就偏了 —— 磁生电。']],
          [['能量转化：'], ['机械能 → 电能', '#C2410C', 1], ['（导体棒克服安培力做功，把机械能变成电能）。']],
        ],
      },
      {
        title: '④ 产生感应电流的条件（两个都要满足）',
        lines: [
          [['① 电路必须'], ['闭合', '#DC2626', 1], [' —— 断开开关，指针一动不动。']],
          [['② 闭合电路的'], ['一部分导体', '#15803D', 1], [' 必须做'], ['切割磁感线', '#B45309', 1], [' 的运动。']],
          [['"切割"就是'], ['导体运动方向不能与磁感线平行', '#7C3AED', 1], ['：本仿真里磁感线竖直向下，棒水平左右动 → 正好垂直切割，效果最强。']],
          [['点「⏸ 让导体棒停住」：棒一动也不动，指针立刻回零 —— '], ['不切割就没有电流', '#DC2626', 1], ['。']],
        ],
      },
      {
        title: '⑤ 感应电流的方向由什么决定',
        lines: [
          [['由 '], ['导体运动方向', '#0EA5E9', 1], [' 和 '], ['磁场方向', '#B91C1C', 1], [' 共同决定（右手定则：右手四指指运动方向，磁感线穿手心，拇指指电流方向）。']],
          [['只改其中'], ['一个', '#DC2626', 1], ['，电流方向就反过来；'], ['两个同时改', '#15803D', 1], ['，电流方向不变。']],
          [['点「磁场」把 N/S 对调，指针立刻往另一边偏 —— 这就是最直观的验证。']],
        ],
      },
      {
        title: '⑥ 感应电流的大小由什么决定',
        lines: [
          [['ε = Blv', '#B45309', 1], ['：磁感应强度 B、导体长度 l、'], ['切割速度 v', '#0EA5E9', 1], [' 越大，感应电动势越大。']],
          [['本仿真把滑条推大（移动更快）→ 指针偏得更多、曲线上波峰更高。']],
          [['磁场越强、棒越长，同样速度下电流也越大；运动方向越接近"垂直切割"，电流越大；'], ['平行于磁感线运动', '#DC2626', 1], [' 时电流为零。']],
        ],
      },
      {
        title: '⑦ 本次记录',
        lines: rows,
      },
      {
        title: '⚠ 注意事项',
        lines: [
          [['三个"电磁"实验别混：'], ['奥斯特', '#15803D', 1], ['（电生磁）、'], ['电磁铁', '#C2410C', 1], ['（电生磁的强化）、'], ['电磁感应', '#B45309', 1], ['（磁生电）。']],
          [['电动机是"通电才转"（电 → 机械），发电机是"转了才有电"（机械 → 电）—— 结构相似，能量方向相反。']],
          [['灵敏电流计指针在零点两边都能偏，'], ['接反了指针就往另一边偏', '#7C3AED', 1], ['，不是"表坏了"。']],
          [['导线不能太长、不能把磁铁整个绕住：那样是"改变磁通量"的另一种方式，本实验只看"切割"。']],
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
    s.moving = true
    s.speed = 0.6
    s.field = true
    s.phase = 0
    s.records = []
    s.trace = []
    s.cardScroll = 0
    builderRef.current?.reset()
    forceUpdate(n => n + 1)
  }, [])

  const handleAddFromPalette = useCallback((type) => { builderRef.current?.add(type) }, [])
  const handleDropFromPalette = useCallback((type, clientX, clientY) => { builderRef.current?.addAt(type, clientX, clientY) }, [])
  const handlePickColor = useCallback((color) => { S.current.wireColor = color; forceUpdate(v => v + 1) }, [])

  return (
    <SceneShell
      title="电磁感应"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t) }}
      tab1Label="📖 电路演示"
      tab2Label="🔧 自己动手"
      onReset={handleReset}
      desc={tab === 1 ? (
        <>
          <b>电磁感应（法拉第实验）</b>
          <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
            闭合电路的一部分导体切割磁感线 → 产生感应电流 · 电流方向由运动方向和磁场方向决定 · 电流大小 ∝ 切割速度
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
            purpose="重现法拉第实验：闭合电路的一部分导体切割磁感线，就产生感应电流；看清电流方向与大小的规律。"
            steps={[
              '先看装置：上 N 红、下 S 蓝，磁感线竖直向下；中间是左右往复的导体棒',
              '点开关闭合，棒一动电流计指针就偏 —— 磁生电',
              '点「⏸ 让导体棒停住」，指针立刻回零：不切割就没有电流',
              '看右上 i–t 曲线：棒来回走，电流正负交替（这就是交流电）',
              '点「磁场」把 N/S 对调，指针改往另一边偏',
              '把「移动快慢」推大，指针偏得更多、波峰更高',
            ]}
            hint="产生感应电流要两个条件：电路闭合 + 一部分导体切割磁感线。ε = Blv，i ∝ v。"
          />
        ) : (
          <InfoDock
            align="left"
            offset={{ left: 26, top: 26 }}
            hint="点右侧器材加入 → 拖拽移动 → 点接线柱连线。灵敏电流计是中央零点表：电流从「+」柱流入时指针往一边偏，反向就往另一边偏。"
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
              // 本专题专用：灵敏电流计（中央零点，指针左右都能偏）
              { type: 'galvanometer', name: '灵敏电流计', icon: thumb('galvanometer') },
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

function drawArrow(ctx, x1, y1, x2, y2, color, lw, head) {
  drawLine(ctx, x1, y1, x2, y2, color, lw)
  const a = Math.atan2(y2 - y1, x2 - x1)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - Math.cos(a - 0.42) * head, y2 - Math.sin(a - 0.42) * head)
  ctx.lineTo(x2 - Math.cos(a + 0.42) * head, y2 - Math.sin(a + 0.42) * head)
  ctx.closePath(); ctx.fill()
}

/** 电流小圆点沿折线流动 */
function drawFlow(ctx, path, t, color, reverse) {
  let total = 0
  const segs = []
  for (let k = 0; k < path.length - 1; k++) {
    const a = path[k], b = path[k + 1]
    const d = Math.hypot(b.x - a.x, b.y - a.y)
    if (d < 1) continue
    segs.push({ a, b, d, s: total })
    total += d
  }
  if (total < 8) return
  const gap = 26, n = Math.max(2, Math.floor(total / gap))
  for (let k = 0; k < n; k++) {
    let dist = ((t * 46) % total + k * gap) % total
    if (reverse) dist = total - dist
    for (const g of segs) {
      if (dist >= g.s && dist <= g.s + g.d) {
        const u = (dist - g.s) / g.d
        const px = g.a.x + (g.b.x - g.a.x) * u
        const py = g.a.y + (g.b.y - g.a.y) * u
        ctx.fillStyle = color
        ctx.beginPath(); ctx.arc(px, py, 2.4, 0, Math.PI * 2); ctx.fill()
        break
      }
    }
  }
}

/** 磁极条：上/下沿亮线 + 渐变 + 白色 N/S 大字 + "磁极" 小字 */
function drawMagnet(ctx, x, y, w, h, pole, fieldDown, FS) {
  const isN = (pole === 'N') === fieldDown
  const base = isN ? '#DC2626' : '#2563EB'
  const g = ctx.createLinearGradient(x, y, x, y + h)
  g.addColorStop(0, isN ? '#EF4444' : '#3B82F6')
  g.addColorStop(0.45, base)
  g.addColorStop(1, isN ? '#991B1B' : '#1E3A8A')
  ctx.fillStyle = g
  ctx.strokeStyle = isN ? '#7F1D1D' : '#1E3A8A'
  ctx.lineWidth = 1.4
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 6); ctx.fill(); ctx.stroke()
  // 上沿高光
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  ctx.beginPath(); ctx.roundRect(x + 4, y + 3, w - 8, 5, 3); ctx.fill()

  ctx.fillStyle = '#FFFFFF'
  ctx.font = `bold ${FS(26)}px "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
  ctx.fillText(isN ? 'N' : 'S', x + 16, y + h / 2)
  ctx.font = `bold ${FS(26)}px "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'right'
  ctx.fillText(isN ? 'N' : 'S', x + w - 16, y + h / 2)
  ctx.font = `${FS(9)}px "Microsoft YaHei", sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,0.86)'
  ctx.textAlign = 'center'
  ctx.fillText('磁极', x + w / 2, y + h / 2 + 1)
}

/** 导体棒：铜色粗棒 + 两端深色柱帽 + 棒内电流方向提示 */
function drawRod(ctx, x1, x2, y, i, FS) {
  const g = ctx.createLinearGradient(0, y - 4, 0, y + 4)
  g.addColorStop(0, '#F59E0B'); g.addColorStop(0.45, '#B45309'); g.addColorStop(1, '#7C2D12')
  ctx.fillStyle = g
  ctx.strokeStyle = '#78350F'
  ctx.lineWidth = 1.2
  ctx.beginPath(); ctx.roundRect(x1, y - 4.4, x2 - x1, 8.8, 4); ctx.fill(); ctx.stroke()
  // 两端柱帽
  for (const px of [x1, x2]) {
    ctx.fillStyle = '#334155'
    ctx.beginPath(); ctx.arc(px, y, 6.4, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.beginPath(); ctx.arc(px - 1.6, y - 1.8, 2.2, 0, Math.PI * 2); ctx.fill()
  }
  // A / B 两端标注（在棒端上方，A 左 B 右）
  ctx.fillStyle = '#7C2D12'
  ctx.font = `bold ${FS(11)}px "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('A', x1 - 1, y - 15)
  ctx.fillText('B', x2 + 1, y - 15)

  // 棒内感应电流方向（水平，沿棒轴 —— 侧视图里电流就沿棒流）
  // 有电流才标；方向随 i 的正负翻转，正好演示「电流方向交替」
  if (Math.abs(i) > 1e-4) {
    const dir = i > 0 ? 1 : -1
    const cx = (x1 + x2) / 2
    drawArrow(ctx, cx - dir * 18, y, cx + dir * 18, y, '#FFF3E0', 2.2, 8)
  }
}

/** 灵敏电流计（中央零点）：表壳 + 白盘 + 弧刻度 + 指针 */
function drawGalv(ctx, x, y, w, h, frac, FS) {
  const PX = x + 88, PY = y + 100, R = 56, NEEDLE = 50
  const SWEEP = 46 * Math.PI / 180
  const f = Math.max(-1, Math.min(1, frac))
  const over = Math.abs(f) >= 0.995

  // 外壳
  const g = ctx.createLinearGradient(x, y, x, y + h)
  g.addColorStop(0, '#64748B'); g.addColorStop(0.45, '#4B5563'); g.addColorStop(1, '#334155')
  ctx.fillStyle = g
  ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 1.6
  ctx.beginPath(); ctx.roundRect(x + 1, y + 1, w - 2, h - 10, 12); ctx.fill(); ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.16)'
  ctx.beginPath(); ctx.roundRect(x + 5, y + 3, w - 10, 5, 3); ctx.fill()

  // 白盘
  ctx.fillStyle = '#FBFDFF'
  ctx.strokeStyle = '#CBD5E1'; ctx.lineWidth = 1.2
  ctx.beginPath(); ctx.roundRect(x + 10, y + 6, w - 20, 106, 9); ctx.fill(); ctx.stroke()

  // 刻度弧
  ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.arc(PX, PY, R, -Math.PI / 2 - SWEEP, -Math.PI / 2 + SWEEP); ctx.stroke()
  for (let k = -5; k <= 5; k++) {
    const a = -Math.PI / 2 + (k / 5) * SWEEP
    const r0 = k === 0 ? 44 : 48
    ctx.strokeStyle = k === 0 ? '#DC2626' : '#64748B'
    ctx.lineWidth = k === 0 ? 1.9 : 1
    ctx.beginPath()
    ctx.moveTo(PX + Math.cos(a) * r0, PY + Math.sin(a) * r0)
    ctx.lineTo(PX + Math.cos(a) * R, PY + Math.sin(a) * R)
    ctx.stroke()
  }
  ctx.fillStyle = '#64748B'
  ctx.font = `bold ${FS(9)}px "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('0', PX, y + 33)
  ctx.fillText('−50', x + 34, y + 70)
  ctx.fillText('+50', x + 142, y + 70)
  ctx.fillStyle = '#94A3B8'
  ctx.font = `bold ${FS(10)}px "Microsoft YaHei", sans-serif`
  ctx.fillText('G', x + 150, y + 104)
  ctx.fillText('mA', x + 24, y + 104)

  // 指针
  const aN = -Math.PI / 2 + f * SWEEP
  ctx.strokeStyle = over ? '#DC2626' : '#111827'
  ctx.lineWidth = 2.2; ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(PX, PY)
  ctx.lineTo(PX + Math.cos(aN) * NEEDLE, PY + Math.sin(aN) * NEEDLE)
  ctx.stroke()
  ctx.fillStyle = '#334155'
  ctx.beginPath(); ctx.arc(PX, PY, 3.6, 0, Math.PI * 2); ctx.fill()

  // 底部两个接线柱（露在壳底外，引线由此接到回路）
  for (const cx of [x + 38, x + 138]) {
    ctx.fillStyle = '#1F2937'
    ctx.beginPath(); ctx.roundRect(cx - 5, y + h - 14, 10, 13, 3); ctx.fill()
    ctx.fillStyle = '#B8860B'
    ctx.beginPath(); ctx.arc(cx, y + h - 6, 4.2, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.beginPath(); ctx.arc(cx - 1.3, y + h - 7.3, 1.5, 0, Math.PI * 2); ctx.fill()
  }
}

/** i–t 实时曲线：横轴最近 8 s，纵轴 ±满偏 */
function drawITChart(ctx, x, y, w, h, trace, now, opt) {
  const { on, FS, field } = opt
  ctx.fillStyle = 'rgba(255,255,255,0.94)'
  ctx.strokeStyle = '#E7DBC6'; ctx.lineWidth = 1.2
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill(); ctx.stroke()

  ctx.fillStyle = '#8A6D3B'
  ctx.font = `bold ${FS(10)}px "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  ctx.fillText('i–t 曲线：棒来回走 → 电流正负交替', x + 10, y + 8)
  ctx.font = `${FS(8.6)}px "Microsoft YaHei", sans-serif`
  ctx.fillStyle = '#A1885E'
  ctx.fillText('（这就是发电机发出的交流电）', x + 10, y + 24)

  const px0 = x + 12, py0 = y + 42, pw2 = w - 26, ph2 = h - 54
  const midY = py0 + ph2 / 2
  // 零线
  ctx.strokeStyle = '#D6C7AE'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(px0, midY); ctx.lineTo(px0 + pw2, midY); ctx.stroke()
  ctx.fillStyle = '#A1885E'
  ctx.font = `${FS(8)}px "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
  ctx.fillText('0', px0 - 2, midY)

  if (!on || trace.length < 2) {
    ctx.fillStyle = '#B08954'
    ctx.font = `${FS(9)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'
    const msg = on ? '等待数据…' : '开关断开：没有电流'
    const tw = ctx.measureText(msg).width
    ctx.fillStyle = 'rgba(255,255,255,0.96)'
    ctx.beginPath(); ctx.roundRect(px0 + pw2 / 2 - tw / 2 - 6, midY - 9, tw + 12, 18, 5); ctx.fill()
    ctx.fillStyle = '#B08954'
    ctx.textBaseline = 'middle'
    ctx.fillText(msg, px0 + pw2 / 2, midY)
    return
  }
  // 曲线（最近 8 s → 铺满宽度）
  ctx.strokeStyle = field ? '#0EA5E9' : '#7C3AED'
  ctx.lineWidth = 1.8
  ctx.beginPath()
  let started = false
  for (const p of trace) {
    const u = (p.t - (now - 8)) / 8
    if (u < 0) continue
    const cx2 = px0 + Math.min(1, u) * pw2
    const cy2 = midY - (p.i / GALV_FS) * (ph2 / 2 - 4)
    if (!started) { ctx.moveTo(cx2, cy2); started = true } else ctx.lineTo(cx2, cy2)
  }
  ctx.stroke()
}

