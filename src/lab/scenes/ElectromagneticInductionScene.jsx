import { useState, useRef, useEffect, useCallback } from 'react'
import { eventToCanvas } from '../utils/pointerPos'
import SceneShell from '../ui/SceneShell'
import InfoDock from '../ui/InfoDock'
import BuilderPalette from '../ui/BuilderPalette'
import { drawKnowledgeCard } from '../ui/knowledgeCard'
import BuilderSVG from '../simple3d/BuilderSVG.jsx'
import { TYPES } from './electricSvgInstruments.js'

/**
 * ElectromagneticInductionScene — 电磁感应（法拉第实验）
 * 第 11 个按「简单电路」模板改造的初中电学实验（教材 20.5《磁生电》）
 *
 * 2026-11-24 NB 复刻版：整台装置按 NB「演示磁生电实验」重画 ——
 *   · 蹄形磁铁：红 N 上臂 / 蓝 S 下臂，**略俯视 + 偏右的等轴透视**（同时看到顶面、
 *     前立面和右端面），左端向内收成 U 形弯头（顶面在左端鼓出一个圆肩）；
 *     两臂都很厚（厚 ≈ 1/3 臂长），两极的缝拉得很开（≈ 1.7 倍臂厚），
 *     缝里 5 条竖直磁感线（箭头朝 S）。
 *   · 导体棒 AB：银灰钢棒，**整根斜穿在两极之间的缝里**（前低后高，斜率 ≈ -0.43），
 *     两端都在缝外：A 端连黑色螺钉柱，B 端戴红色圆柱帽，
 *     可直接用鼠标拖着左右移动 —— 棒在缝里来回切割磁感线。
 *   · 红色粗软导线两根：B → 灵敏电流计左柱；A → 绕底部大弧 → 电流计右柱。
 *   · 灵敏电流计：NB 同款黑壳 + 白盘 + 中央零点 ±50 mA 刻度弧 + 红指针，
 *     表头上方浮数字读数（0 mA），底座上丝印「−50 ~ 50」，下面挂「A₁」标签。
 *
 *  三件事：
 *    ① 闭合电路的一部分导体做**切割磁感线**运动 → 产生感应电流（磁生电）
 *    ② 感应电流的方向由**导体运动方向**和**磁场方向**决定，只改其中一个电流就反向
 *    ③ 感应电流的大小由**运动快慢**决定（ε = Blv）
 *
 *  Tab1 📖 电路演示 —— NB 同款装置（可拖棒 / 可自动往复）+ 知识卡
 *  Tab2 🔧 自己动手 —— 10 件基础器材 + 本专题专用「灵敏电流计」（中央零点、指针能左右偏）
 */

/* ══════════════════════════════════════════════════════════════
   设计坐标系（整体等比缩放 + 居中）
   ══════════════════════════════════════════════════════════════ */
const VW = 900
const VH = 680

/* 等轴透视：略俯视 + 偏右
   U  = 磁铁臂长方向（水平）
   进深 = (0.34·臂长, −0.20·臂长)，按 NB 的斜投影比例，向右后上方收 */
const U = { x: 1, y: 0 }

const MAG = {
  x: 170,         // 前立面左端
  y: 190,         // 红臂前立面**底边**左端的 y
  len: 250,       // 臂长（NB 里厚度 ≈ 1/3 臂长）
  t: 80,          // 臂厚
  gap: 124,       // 两极之间的缝（原来 78 太挤，棒只能压在极面上；拉开后棒能在缝里整根穿过去）
}

/* 导体棒：整根斜穿在两极之间的缝里 —— A 端在两极缝的左下方（磁铁左端外），
   B 端在缝的右上方（磁铁右端外），中间那截全部落在两极的缝里，两端都不碰极面 */
const ROD = {
  ax: 104, ay: 340,          // 前端 A（磁铁左端外侧、蓝极顶面高度）
  dx: 360, dy: -169,         // 后端 B 相对 A 的偏移（斜率 ≈ -0.47，同 NB 的斜度）
  swing: 52,                 // 左右可移动幅度（保证 5 条磁感线全程都被棒扫过）
  hit: 14,
}

/* 灵敏电流计（NB 同款：黑壳 + 白盘 + 中央零点） */
const GALV = {
  x: 578, y: 190, w: 190, h: 166,
  baseH: 34,
  fs: 0.05,                  // 满偏 ±50 mA
}

/** 电流系数：棒速（设计单位/秒）→ 安培。v = 53 → 20 mA（自动往复时约 2/5 满偏） */
const K_CURRENT = 2600

export default function ElectromagneticInductionScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const builderRef = useRef(null)

  const S = useRef({
    tab: 1,
    auto: true,                 // 自动往复
    dragging: false,
    dragStartX: 0,
    dragStartS: 0,
    s: 0,                       // 当前沿臂方向的位移（±swing）
    sPrev: 0,
    v: 0,                       // 设计单位/秒（带符号）
    phase: 0,
    speed: 0.6,                 // 自动往复的快慢 0.2~1.0
    t: 0,
    needle: 0,                  // 指针（-1~1，带阻尼）
    i: 0,
    records: [],
    peak: 0,
    wireColor: '#F44336',
    cardScroll: 0,
    cardDrag: null,
  })

  const [tab, setTab] = useState(1)
  const [, forceUpdate] = useState(0)

  /* ── 每帧物理：棒位置 / 速度 / 感应电流 ── */
  const step = (t) => {
    const s = S.current
    if (s.auto && !s.dragging) {
      s.phase += (0.45 + s.speed * 0.95) * t
      s.s = Math.sin(s.phase) * ROD.swing
    }
    // 拖拽时 s 由鼠标直接改；自动时由正弦给。
    // 速度用差分得到（拖得快 → 电流大），再过一个 ~40 ms 的低通，避免指针抖动、也让读数看得清
    const vRaw = (s.s - s.sPrev) / Math.max(1e-3, t)
    s.sPrev = s.s
    s.v += (vRaw - s.v) * Math.min(1, t * 25)
    // i = v / K（安培），再夹到表的量程 ±fs
    const iRaw = s.v / K_CURRENT
    s.i = Math.max(-GALV.fs, Math.min(GALV.fs, iRaw))
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const R = {
      canvas,
      ctx: canvas.getContext('2d'),
      W: 0,
      H: 0,
      resize() {
        const rect = { width: canvas.clientWidth, height: canvas.clientHeight }
        canvas.width = rect.width * devicePixelRatio
        canvas.height = rect.height * devicePixelRatio
        this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
        this.W = rect.width
        this.H = rect.height
      },
    }
    R.resize()
    canvasRef.current._R = R

    let last = performance.now()
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const s = S.current
      s.t += dt
      step(dt)
      // 指针：一阶阻尼跟随（像真表的游丝，略慢半拍）
      const target = s.i / GALV.fs
      s.needle += (target - s.needle) * Math.min(1, dt * 14)
      render(R)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    const onResize = R.resize.bind(R)
    window.addEventListener('resize', onResize)
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', onResize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function render(R) {
    const ctx = R.ctx
    const W = R.W
    const H = R.H
    ctx.clearRect(0, 0, W, H)
    const bg = ctx.createLinearGradient(0, 0, W * 0.35, H)
    bg.addColorStop(0, '#FFFCF5')
    bg.addColorStop(0.55, '#FDF4E6')
    bg.addColorStop(1, '#FBEDD9')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)
    canvasRef.current._clickAreas = []
    if (S.current.tab === 1) renderDemo(ctx, W, H)
  }

  /* ══════════════════════════════════════════════════════════════
     Tab 1：NB 同款装置
     ══════════════════════════════════════════════════════════════ */
  function renderDemo(ctx, W, H) {
    const s = S.current
    const i = s.i
    const on = Math.abs(i) > 1e-5
    if (on && Math.abs(i) > (s.peak || 0)) s.peak = Math.abs(i)

    /* 右侧知识卡面板 */
    const RAIL = 46
    const pw = Math.max(300, Math.min(W * 0.40, 700))
    const panel = { x: W - 16 - RAIL - pw, y: 10, w: pw, h: H - 38 }
    const viewW = panel.x - 16

    const sc = Math.max(0.5, Math.min(1.12, Math.min(viewW / VW, H / VH)))
    const ox = (viewW - VW * sc) / 2
    const oy = (H - VH * sc) / 2
    const TX = (x) => ox + x * sc
    const TY = (y) => oy + y * sc
    const FS = (n) => Math.max(8, Math.round(n * sc))
    canvasRef.current._ox = ox
    canvasRef.current._sc = sc

    ctx.save()
    ctx.translate(ox, oy)
    ctx.scale(sc, sc)

    /* 棒沿臂方向的位移：沿 U（向右略抬） */
    const shift = s.s
    const A = { x: ROD.ax + shift, y: ROD.ay + U.y * shift }
    const B = { x: A.x + ROD.dx, y: A.y + ROD.dy }

    const redArm = {
      p0: { x: MAG.x, y: MAG.y },
      len: MAG.len,
      t: MAG.t,
      front: '#CE504E',
      top: '#B94442',
      side: '#A33B39',
      edge: '#E67976',
    }
    const blueArm = {
      p0: { x: MAG.x, y: MAG.y + MAG.t + MAG.gap },
      len: MAG.len,
      t: MAG.t,
      front: '#4F82CF',
      top: '#29508A',
      side: '#31548F',
      edge: '#7FA5E1',
    }

    /* ① 磁场空腔（最底层，让缝从背景里"凹"进去） */
    drawFieldCavity(ctx, redArm, blueArm)

    /* ② S 极（蓝臂）—— 最下层 */
    drawBendArm(ctx, blueArm)
    /* 磁感线画在 S 极之后：线一直落到蓝极顶面上自己那一排的落点，末端再接箭头 → 线与箭头不脱节 */
    drawFieldLines(ctx, redArm, blueArm)
    drawFieldArrows(ctx, redArm, blueArm)

    /* ③ 导线（在磁铁之上、棒和表之下） */
    const postL = { x: GALV.x + 36, y: GALV.y + GALV.h + GALV.baseH * 0.55 }
    const postR = { x: GALV.x + GALV.w - 36, y: GALV.y + GALV.h + GALV.baseH * 0.55 }
    const wireTop = cubicPath(
      { x: B.x, y: B.y },
      { x: B.x + 74, y: B.y + 26 },
      { x: postL.x - 56, y: postL.y - 78 },
      { x: postL.x, y: postL.y },
    )
    const wireBot = smoothPath([
      { x: A.x, y: A.y },
      { x: A.x - 22, y: A.y + 92 },
      { x: 292, y: 518 },
      { x: 512, y: 518 },
      { x: postR.x - 24, y: postR.y + 40 },
      { x: postR.x, y: postR.y },
    ])
    drawWire(ctx, wireTop, s.t, i, false)
    drawWire(ctx, wireBot, s.t, i, true)

    /* ④ 导体棒 —— 中间层：压在 S 极面上，上端在 N 极下沿收住 */
    drawRod(ctx, A, B, i)

    /* ⑤ N 极（红臂）—— 最上层：压住棒的上端与磁感线上端 */
    drawBendArm(ctx, redArm)
    drawPoleLabel(ctx, redArm, 'N', FS(26))
    drawPoleLabel(ctx, blueArm, 'S', FS(26))
    drawRodTags(ctx, A, B, FS)

    /* ⑥ 灵敏电流计 */
    drawGalvNB(ctx, GALV, s.needle, i, FS)

    /* ⑦ 控件 */
    drawControls(ctx, TX, TY, sc, FS)

    ctx.restore()

    /* 棒的可拖拽热区（屏幕坐标） */
    canvasRef.current._rodHit = { a: { x: TX(A.x), y: TY(A.y) }, b: { x: TX(B.x), y: TY(B.y) }, r: ROD.hit * sc }

    /* 知识卡 */
    const SEC_COLORS = ['#E0761F', '#C98A12', '#CA8A04', '#C2410C', '#B45309', '#15803D', '#7C3AED', '#DC2626']
    const SECTIONS = buildSections(s.records, {
      i,
      speed: s.speed,
      auto: s.auto,
      dragging: s.dragging,
    }).map((sec, idx) => ({ t: sec.title, c: SEC_COLORS[idx % SEC_COLORS.length], items: sec.lines }))
    const cardOut = drawKnowledgeCard(ctx, panel, SECTIONS, {
      title: '📖 电磁感应知识',
      scroll: s.cardScroll,
      tip: (c2, tx, ty) => {
        c2.fillStyle = on ? '#B45309' : '#B08954'
        c2.fillText(
          on
            ? `● ${i > 0 ? '指针右偏' : '指针左偏'}｜i = ${(i * 1000).toFixed(1)} mA｜磁感线向下`
            : '○ 棒不动（或沿磁感线方向动）→ 不切割磁感线 → 指针居中',
          tx,
          ty + 10,
        )
      },
    })
    canvasRef.current._cardBox = cardOut
      ? { x: panel.x, y: panel.y + 2, w: panel.w, h: cardOut.cardH, maxScroll: cardOut.maxScroll, scroll: cardOut.scroll }
      : null
    ctx.textBaseline = 'alphabetic'

    /* 验收钩子 */
    canvasRef.current._dbg = {
      scale: sc,
      rodA: { x: TX(A.x), y: TY(A.y) },
      rodB: { x: TX(B.x), y: TY(B.y) },
      shift: s.s,
      i,
      auto: s.auto,
      dragging: s.dragging,
      speed: s.speed,
      recN: s.records.length,
      panel: { x: panel.x, y: panel.y, w: panel.w, h: panel.h },
      areas: (canvasRef.current._clickAreas || []).map((a) => ({ x: a.x, y: a.y, w: a.w, h: a.h })),
    }
  }

  /* ── 控件区 ── */
  function drawControls(ctx, TX, TY, sc, FS) {
    const s = S.current
    const on = Math.abs(s.i) > 1e-5

    /* 第 1 行：移动快慢 + 自动/停住 + 读数 */
    const r1 = 592
    ctx.fillStyle = '#5A4636'
    ctx.font = `bold ${FS(10.5)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('移动快慢（拖得越快 / 自动越快 → 感应电流越大）', 44, r1 - 24)

    const barX = 54
    const barW = 196
    ctx.strokeStyle = '#D7C4A8'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(barX, r1 + 8)
    ctx.lineTo(barX + barW, r1 + 8)
    ctx.stroke()
    const px = barX + ((s.speed - 0.2) / 0.8) * barW
    ctx.fillStyle = '#0EA5E9'
    ctx.beginPath()
    ctx.arc(px, r1 + 8, 8, 0, Math.PI * 2)
    ctx.fill()
    canvasRef.current._clickAreas.push({
      x: TX(barX - 14),
      y: TY(r1 - 16),
      w: (barW + 28) * sc,
      h: 46 * sc,
      onClick: (mxp) => {
        const v = ((mxp - canvasRef.current._ox) / sc - barX) / barW
        S.current.speed = Math.round((0.2 + Math.max(0, Math.min(1, v)) * 0.8) * 100) / 100
        forceUpdate((n) => n + 1)
      },
      onDrag: (mxp) => {
        const v = ((mxp - canvasRef.current._ox) / sc - barX) / barW
        S.current.speed = Math.round((0.2 + Math.max(0, Math.min(1, v)) * 0.8) * 100) / 100
        forceUpdate((n) => n + 1)
      },
    })

    const pX = 300
    const pW = 156
    const pY = r1 - 16
    const pH = 32
    ctx.fillStyle = s.auto ? '#EFF6FF' : '#FEF2F2'
    ctx.strokeStyle = s.auto ? '#1D4ED8' : '#DC2626'
    ctx.lineWidth = 1.8
    ctx.beginPath()
    ctx.roundRect(pX, pY, pW, pH, 16)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = s.auto ? '#1D4ED8' : '#B91C1C'
    ctx.font = `bold ${FS(10.5)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(s.auto ? '⏸ 让导体棒停住' : '▶ 自动来回拉', pX + pW / 2, pY + pH / 2)
    canvasRef.current._clickAreas.push({
      x: TX(pX),
      y: TY(pY - 2),
      w: pW * sc,
      h: (pH + 4) * sc,
      onClick: () => {
        S.current.auto = !S.current.auto
        forceUpdate((n) => n + 1)
      },
    })

    /* 读数（按钮右侧） */
    const rx = pX + pW + 20
    ctx.textAlign = 'left'
    ctx.fillStyle = on ? '#B45309' : '#8D6E63'
    ctx.font = `bold ${FS(11)}px "Microsoft YaHei", sans-serif`
    ctx.fillText(on ? `i = ${s.i > 0 ? '+' : ''}${(s.i * 1000).toFixed(1)} mA` : 'i = 0 mA', rx, r1)
    ctx.fillStyle = '#8D6E63'
    ctx.font = `${FS(9)}px "Microsoft YaHei", sans-serif`
    ctx.fillText(on ? (s.i > 0 ? '指针右偏' : '指针左偏') : '指针居中（不切割磁感线）', rx, r1 + 18)

    /* 第 2 行：磁场方向（只作说明，不可点：装置里 N/S 是固定的，只有磁感线方向可说）+ 记录 + 归零 */
    const r2 = 652
    ctx.fillStyle = '#5A4636'
    ctx.font = `bold ${FS(10.5)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'left'
    ctx.fillText('磁场方向', 44, r2)
    ctx.fillStyle = '#B91C1C'
    ctx.font = `bold ${FS(10)}px "Microsoft YaHei", sans-serif`
    ctx.fillText('N 极在上 · 磁感线自上而下', 118, r2)

    const recX = 336
    const recW = 176
    const recOn = s.records.length < 4
    ctx.fillStyle = recOn ? '#FFF7ED' : '#F5F0E8'
    ctx.strokeStyle = recOn ? '#EA580C' : '#D7C4A8'
    ctx.lineWidth = 1.8
    ctx.beginPath()
    ctx.roundRect(recX, r2 - 17, recW, 34, 17)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = recOn ? '#B45309' : '#A08E76'
    ctx.font = `bold ${FS(10.5)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(`📋 记录一组（${s.records.length}/4）`, recX + recW / 2, r2)
    canvasRef.current._clickAreas.push({
      x: TX(recX),
      y: TY(r2 - 19),
      w: recW * sc,
      h: 38 * sc,
      onClick: () => {
        if (!recOn) return
        S.current.records.push({
          speed: S.current.speed,
          ipk: Math.max(S.current.peak || 0, Math.abs(S.current.i)),
        })
        forceUpdate((n) => n + 1)
      },
    })

    const rstX = 532
    const rstW = 150
    ctx.fillStyle = '#FFFFFF'
    ctx.strokeStyle = '#D7C4A8'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.roundRect(rstX, r2 - 16, rstW, 32, 16)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#7A5C3E'
    ctx.font = `bold ${FS(10)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText('↻ 归零重测', rstX + rstW / 2, r2)
    canvasRef.current._clickAreas.push({
      x: TX(rstX),
      y: TY(r2 - 18),
      w: rstW * sc,
      h: 36 * sc,
      onClick: () => {
        S.current.phase = 0
        S.current.s = 0
        S.current.sPrev = 0
        S.current.records = []
        S.current.cardScroll = 0
        S.current.auto = true
        S.current.speed = 0.6
        S.current.peak = 0
        forceUpdate((n) => n + 1)
      },
    })
  }

  /* ── 知识卡（8 节） ── */
  function buildSections(records) {
    const rows = records.map((r, k) => [
      [`第 ${k + 1} 组：`],
      [`快慢 ${r.speed.toFixed(2)}`, '#0EA5E9', 1],
      ['，最大电流 '],
      [`${(r.ipk * 1000).toFixed(0)} mA`, '#B45309', 1],
      ['（指针左右来回摆）'],
    ])
    if (records.length >= 2) {
      const a = records[0]
      const b = records[records.length - 1]
      let note
      if (Math.abs(a.speed - b.speed) > 0.01) {
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
      rows.push([['还没记录。拉一拉导体棒，等指针摆到最大时点「记录一组」。']])
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
        title: '② 实验器材（对 NB 同款）',
        lines: [
          [['蹄形磁铁一套（'], ['红 N 上臂 / 蓝 S 下臂', '#C2410C', 1], ['，左端是 U 形弯头）、'], ['导体棒 AB', '#B45309', 1], ['（银灰钢棒）。']],
          [['灵敏电流计', '#15803D', 1], ['：黑壳白盘、'], ['中央零点', '#7C3AED', 1], ['、量程 −50~50 mA，指针能往左、往右两个方向偏。']],
          [['两根红色软导线把棒的两端接到表的两柱上。'], ['注意：本实验电路里没有电源', '#DC2626', 1], ['。']],
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
          [['① 电路必须'], ['闭合', '#DC2626', 1], [' —— 本装置靠两根导线把棒和表连成回路，断一处指针就不动。']],
          [['② 闭合电路的'], ['一部分导体', '#15803D', 1], [' 必须做'], ['切割磁感线', '#B45309', 1], [' 的运动。']],
          [['"切割"就是'], ['导体运动方向不能与磁感线平行', '#7C3AED', 1], ['：这里磁感线竖直向下，棒横着左右动 → 正好垂直切割，效果最强。']],
          [['点「⏸ 让导体棒停住」：棒一动也不动，指针立刻回零 —— '], ['不切割就没有电流', '#DC2626', 1], ['。']],
        ],
      },
      {
        title: '⑤ 感应电流的方向由什么决定',
        lines: [
          [['由 '], ['导体运动方向', '#0EA5E9', 1], [' 和 '], ['磁场方向', '#B91C1C', 1], [' 共同决定（右手定则：右手四指指运动方向，磁感线穿手心，拇指指电流方向）。']],
          [['只改其中'], ['一个', '#DC2626', 1], ['，电流方向就反过来；'], ['两个同时改', '#15803D', 1], ['，电流方向不变。']],
          [
            ['本装置的 N 极固定在'],
            ['上', '#B91C1C', 1],
            ['、S 极固定在'],
            ['下', '#1D4ED8', 1],
            ['（磁感线自上而下）—— 想换方向只能改'],
            ['导体运动方向', '#0EA5E9', 1],
            ['：把棒往回拉，指针立刻往另一边偏，这就是最直观的验证。'],
          ],
        ],
      },
      {
        title: '⑥ 感应电流的大小由什么决定',
        lines: [
          [['ε = Blv', '#B45309', 1], ['：磁感应强度 B、导体长度 l、'], ['切割速度 v', '#0EA5E9', 1], [' 越大，感应电动势越大。']],
          [['把滑条推大（自动往复更快），或者用手把棒拖得更快 → 指针偏得更多。']],
          [['磁场越强、棒越长，同样速度下电流也越大；运动方向越接近"垂直切割"，电流越大；'], ['平行于磁感线运动', '#DC2626', 1], [' 时电流为零。']],
        ],
      },
      { title: '⑦ 本次记录', lines: rows },
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

  const rodHit = (p) => {
    const h = canvasRef.current?._rodHit
    if (!h) return false
    const { a, b, r } = h
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy || 1
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
    const cx = a.x + dx * t
    const cy = a.y + dy * t
    return Math.hypot(p.x - cx, p.y - cy) <= r
  }

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    if (S.current.tab !== 1) return
    const { x, y } = getPos(e)
    const box = canvasRef.current._cardBox
    if (box && box.maxScroll > 0 && x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
      S.current.cardDrag = { y0: y, s0: S.current.cardScroll }
      return
    }
    if (rodHit({ x, y })) {
      S.current.dragging = true
      S.current.auto = false
      S.current.dragStartX = x
      S.current.dragStartS = S.current.s
      canvasRef.current.style.cursor = 'grabbing'
      return
    }
    for (const a of canvasRef.current._clickAreas) {
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) {
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
      forceUpdate((n) => n + 1)
      return
    }
    if (S.current.dragging) {
      const sc = canvasRef.current._dbg?.scale || 1
      const s = (x - S.current.dragStartX) / sc
      S.current.s = Math.max(-ROD.swing, Math.min(ROD.swing, S.current.dragStartS + s))
      return
    }
    if (canvasRef.current._rodHit && !S.current.dragging) {
      canvasRef.current.style.cursor = rodHit({ x, y }) ? 'grab' : 'default'
    }
  }, [])

  const handleMouseUp = useCallback(() => {
    S.current.dragging = false
    S.current.cardDrag = null
    if (canvasRef.current) canvasRef.current.style.cursor = 'default'
  }, [])

  const handleWheel = useCallback((e) => {
    const box = canvasRef.current?._cardBox
    if (!box || !box.maxScroll) return
    const { x, y } = getPos(e)
    if (x < box.x || x > box.x + box.w || y < box.y || y > box.y + box.h) return
    S.current.cardScroll = Math.max(0, Math.min(box.maxScroll, S.current.cardScroll + e.deltaY))
    forceUpdate((n) => n + 1)
  }, [])

  const handleReset = useCallback(() => {
    const s = S.current
    s.auto = true
    s.speed = 0.6
    s.phase = 0
    s.s = 0
    s.sPrev = 0
    s.v = 0
    s.records = []
    s.peak = 0
    s.cardScroll = 0
    builderRef.current?.reset()
    forceUpdate((n) => n + 1)
  }, [])

  const handleAddFromPalette = useCallback((type) => {
    builderRef.current?.add(type)
  }, [])
  const handleDropFromPalette = useCallback((type, clientX, clientY) => {
    builderRef.current?.addAt(type, clientX, clientY)
  }, [])
  const handlePickColor = useCallback((color) => {
    S.current.wireColor = color
    forceUpdate((v) => v + 1)
  }, [])

  return (
    <SceneShell
      title="电磁感应"
      tab={tab}
      onTabChange={(t) => {
        S.current.tab = t
        setTab(t)
      }}
      tab1Label="📖 电路演示"
      tab2Label="🔧 自己动手"
      onReset={handleReset}
      desc={
        tab === 1 ? (
          <>
            <b>电磁感应（法拉第实验）</b>
            <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
              NB 同款装置：蹄形磁铁 N 上 S 下 · 导体棒 AB 切割磁感线 → 灵敏电流计指针偏转
            </span>
          </>
        ) : null
      }
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
        {tab === 2 && <BuilderSVG ref={builderRef} wireColor={S.current.wireColor} />}
        {tab === 1 ? (
          <InfoDock
            align="left"
            offset={{ left: 22, top: 18 }}
            purpose="重现法拉第实验：闭合电路的一部分导体切割磁感线，就产生感应电流；看清电流方向与大小的规律。"
            steps={[
              '先看装置：红 N 在上、蓝 S 在下，磁感线分三排竖直向下（近亮远暗）；银灰色导体棒 AB 斜插在两极之间',
              '用鼠标抓住导体棒，左右拖动 —— 表针立刻偏；拖得越快，偏得越多',
              '点「⏸ 让导体棒停住」，指针马上回零：不切割就没有电流',
              '松手后点「▶ 自动来回拉」，让棒自己往复，表针左右摆（这就是交流电）',
              '把棒往回拉（反向运动），指针就改往另一边偏 —— N/S 固定，只能改运动方向',
              '把「移动快慢」推大，指针偏得更多',
            ]}
            hint="产生感应电流要两个条件：电路闭合 + 一部分导体切割磁感线。ε = Blv，i ∝ v。"
          />
        ) : (
          <InfoDock
            align="left"
            offset={{ left: 26, top: 26 }}
            hint="点右侧器材加入 → 拖拽移动 → 点接线柱连线。灵敏电流计是中央零点表：电流从「+」柱流入时指针往一边偏，反向就往另一边偏。做磁生电：把导体棒的 A、B 两根线接到电流计两柱，握住棒在磁铁两极的缝里左右拖（越快电动势越大，反向拖指针就反偏），停住不动指针立刻回零。"
            hintTitle="操作说明"
          />
        )}
        {tab === 2 && (
          <BuilderPalette
            side="right"
            items={[
              { type: 'horseshoeMagnet', name: '蹄形磁铁', icon: <MagnetIcon /> },
              { type: 'conductorRod', name: '导体棒', icon: <RodIcon /> },
              { type: 'battery', name: '电池组', icon: thumb('battery') },
              { type: 'accumulator', name: '蓄电池', icon: thumb('accumulator') },
              { type: 'bulb', name: '灯泡', icon: thumb('bulb') },
              { type: 'switch', name: '开关', icon: thumb('switch') },
              { type: 'resistor5', name: '电阻', icon: thumb('resistor5') },
              { type: 'rheostat', name: '滑变', icon: thumb('rheostat') },
              { type: 'ammeter', name: '电流表', icon: thumb('ammeter') },
              { type: 'ammeterA', name: '安培表', icon: thumb('ammeterA') },
              { type: 'voltmeter', name: '电压表', icon: thumb('voltmeter') },
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

/** 器材栏缩略图：直接用器材库里的矢量图（f 缩放留白） */
function thumb(type) {
  const t = TYPES[type]
  if (!t) return null
  const svg = t.render({ id: `pal-${type}`, f: 0.4 }, { I: 0, bright: 0.5, frac: 0 })
  return <span dangerouslySetInnerHTML={{ __html: svg }} />
}

/** 器材栏里两件「摆件」的小图标：按 40×24 手画，不然 300×340 的磁铁会被压成一条 */
function MagnetIcon() {
  return (
    <svg width="40" height="24" viewBox="0 0 40 24">
      <path d="M6 5.5 Q1.6 12 6 18.5" stroke="#8A6E52" strokeWidth="3.6" fill="none" />
      <rect x="6" y="1.6" width="32" height="7.4" rx="1.6" fill="#CE504E" />
      <rect x="6" y="15" width="32" height="7.4" rx="1.6" fill="#4F82CF" />
      <g stroke="#8C949C" strokeWidth="1">
        <line x1="16" y1="9.4" x2="16" y2="14.6" />
        <line x1="22" y1="9.4" x2="22" y2="14.6" />
        <line x1="28" y1="9.4" x2="28" y2="14.6" />
      </g>
    </svg>
  )
}
function RodIcon() {
  return (
    <svg width="40" height="24" viewBox="0 0 40 24">
      <line x1="6" y1="18" x2="34" y2="6" stroke="#B9C6D2" strokeWidth="4" strokeLinecap="round" />
      <line x1="6" y1="18" x2="34" y2="6" stroke="#EDF3F8" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="6" cy="18" r="2.6" fill="#2B3642" />
      <circle cx="34" cy="6" r="2.6" fill="#2B3642" />
    </svg>
  )
}

/* ══════════════════════════════════════════════════════════════
   透视绘制：一带 U 形弯头的磁极臂
   p0 = 前立面左下角；沿 U（臂长）伸出 len；厚 t；进深 dep
   ══════════════════════════════════════════════════════════════ */
function drawBendArm(ctx, a) {
  const { p0, len, t, front, top, side, edge } = a
  const ux = len
  const uy = 0
  const dx = len * 0.34
  const dy = -len * 0.20

  const fBL = { x: p0.x, y: p0.y }
  const fBR = { x: p0.x + ux, y: p0.y + uy }
  const fTR = { x: fBR.x, y: fBR.y - t }
  const fTL = { x: fBL.x, y: fBL.y - t }
  const bTL = { x: fTL.x + dx, y: fTL.y + dy }
  const bTR = { x: fTR.x + dx, y: fTR.y + dy }
  const bBR = { x: fBR.x + dx, y: fBR.y + dy }

  // 前立面（正视时最亮，受光自上而下）
  const gFront = ctx.createLinearGradient(fBL.x, fBL.y - t, fBL.x, fBL.y)
  gFront.addColorStop(0, shade(front, 1.08))
  gFront.addColorStop(0.55, front)
  gFront.addColorStop(1, shade(front, 0.88))
  ctx.fillStyle = gFront
  ctx.beginPath()
  ctx.moveTo(fBL.x, fBL.y)
  ctx.lineTo(fBR.x, fBR.y)
  ctx.lineTo(fTR.x, fTR.y)
  ctx.lineTo(fTL.x, fTL.y)
  ctx.closePath()
  ctx.fill()

  // 顶面（略俯视的掠射面，比前立面暗）：左端是 U 形弯头，边界像一道沙丘的肩
  ctx.fillStyle = top
  ctx.beginPath()
  ctx.moveTo(fTR.x, fTR.y)
  ctx.lineTo(bTR.x, bTR.y)
  ctx.lineTo(bTL.x, bTL.y)
  // 从后缘回到前缘，中间鼓一个「驼峰」再落下 —— 就是 NB 那道 U 形弯头的肩
  ctx.quadraticCurveTo(bTL.x - 46, bTL.y + 6, bTL.x - 76, bTL.y - 6)
  ctx.quadraticCurveTo(fTL.x + 16, fTL.y - 34, fTL.x, fTL.y)
  ctx.closePath()
  ctx.fill()

  // 右端面（进深方向的暗面，NB 把 N / S 印在这一面上）
  const capG = ctx.createLinearGradient(fBR.x, fBR.y, bTR.x, bTR.y)
  capG.addColorStop(0, shade(side, 1.06))
  capG.addColorStop(1, shade(side, 0.86))
  ctx.fillStyle = capG
  ctx.beginPath()
  ctx.moveTo(fBR.x, fBR.y)
  ctx.lineTo(fTR.x, fTR.y)
  ctx.lineTo(bTR.x, bTR.y)
  ctx.lineTo(bBR.x, bBR.y)
  ctx.closePath()
  ctx.fill()

  // 肩膀的高光（读出「弯过去」的圆角）
  ctx.strokeStyle = edge
  ctx.globalAlpha = 0.45
  ctx.lineWidth = 1.8
  ctx.beginPath()
  ctx.moveTo(fTL.x, fTL.y)
  ctx.quadraticCurveTo(fTL.x + 16, fTL.y - 34, bTL.x - 76, bTL.y - 6)
  ctx.quadraticCurveTo(bTL.x - 46, bTL.y + 6, bTL.x, bTL.y)
  ctx.stroke()
  ctx.globalAlpha = 1

  // 上沿高光（前立面与顶面分界）
  ctx.strokeStyle = edge
  ctx.globalAlpha = 0.5
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(fTL.x, fTL.y)
  ctx.lineTo(fTR.x, fTR.y)
  ctx.stroke()
  ctx.globalAlpha = 1

  // 顶面 / 右端面之间的暗缝
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(fTR.x, fTR.y)
  ctx.lineTo(bTR.x, bTR.y)
  ctx.stroke()

  // 右端面的前棱（亮一点，把两极的端面立起来）
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.lineWidth = 1.1
  ctx.beginPath()
  ctx.moveTo(fBR.x, fBR.y)
  ctx.lineTo(fTR.x, fTR.y)
  ctx.stroke()

  // 前立面底边压一条淡线，贴着桌面
  ctx.strokeStyle = 'rgba(0,0,0,0.10)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(fBL.x, fBL.y)
  ctx.lineTo(fBR.x, fBR.y)
  ctx.stroke()
}

/** N / S：印在右端面（斜投影里的那块暗面）正中，像 NB 一样斜着写 */
function drawPoleLabel(ctx, a, text, size) {
  const fBR = { x: a.p0.x + a.len, y: a.p0.y }
  const fTR = { x: fBR.x, y: a.p0.y - a.t }
  const bTR = { x: fTR.x + a.len * 0.34, y: fTR.y - a.len * 0.20 }
  const bBR = { x: fBR.x + a.len * 0.34, y: fBR.y - a.len * 0.20 }
  const cxp = (fBR.x + fTR.x + bTR.x + bBR.x) / 4
  const cyp = (fBR.y + fTR.y + bTR.y + bBR.y) / 4
  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.font = `italic 800 ${size}px "Times New Roman", "Microsoft YaHei", serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = 3
  ctx.fillText(text, cxp, cyp)
  ctx.restore()
}

/* 磁场空腔：把两极之间那块"空腔"用一层很淡的暖灰压暗，缝才从背景里"凹"进去 */
function drawFieldCavity(ctx, red, blue) {
  const L = red.len
  const DX = L * 0.34
  const DY = -L * 0.20
  const x0 = red.p0.x
  const x1 = red.p0.x + L
  const yN = red.p0.y
  const yS = blue.p0.y - blue.t
  const g = ctx.createLinearGradient(x0, yN, x1 + DX, yS + DY)
  g.addColorStop(0, 'rgba(104,100,92,0.20)')
  g.addColorStop(0.55, 'rgba(104,100,92,0.12)')
  g.addColorStop(1, 'rgba(104,100,92,0.05)')
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(x0, yN)
  ctx.lineTo(x1, yN)
  ctx.lineTo(x1 + DX, yN + DY)
  ctx.lineTo(x1 + DX, yS + DY)
  ctx.lineTo(x1, yS)
  ctx.lineTo(x0, yS)
  ctx.closePath()
  ctx.fillStyle = g
  ctx.fill()
  ctx.restore()
}

/* ── 两极之间的磁场：3 排进深（近亮远暗），每排 5 条 ──
   sx = 横向错位（单位：一格）：三排按 0 / 0.5 / 1 格均匀错开，
   不然列距 39.5 与进深位移 42.5 只差 3，后一排会贴着前一排叠成"双线" */
const FIELD_ROWS = [
  { k: 1, alpha: 0.32, lw: 1.7, sx: 1 },
  { k: 0.5, alpha: 0.66, lw: 2.4, sx: 0.5 },
  { k: 0, alpha: 1, lw: 3.2, sx: 0 },
]
const FIELD_TUCK = 14

function fieldGeo(red, blue) {
  const L = red.len
  const DX = L * 0.34 // 进深向量（与两极的斜投影一致）
  const DY = -L * 0.20
  const N = 5
  const x0 = red.p0.x + 46
  const xEnd = red.p0.x + L - 46
  const sp = (xEnd - x0) / (N - 1) // 一格的列距，给每排做横向相位用
  const xs = Array.from({ length: N }, (_, i) => x0 + sp * i)
  return { DX, DY, xs, sp, topY: red.p0.y, botY: blue.p0.y - blue.t }
}

/* 每排线在 S 极顶面上的“落点”高度：越远越靠上（画面上更高），4 排错开成纵深 */
function fieldLand(k, botY, DY) {
  const near = botY - 7 // 最近一排：贴着 S 极顶面前缘、留一点余量
  const far = botY + DY + 12 // 最远一排：落在顶面靠后处，箭头不会飘到空腔里
  return near + (far - near) * k
}

/* 磁感线本体：每排从 N 极底面拉到 S 极顶面上自己那一排的落点（画在 S 极之后，线就露在蓝面上） */
function drawFieldLines(ctx, red, blue) {
  const { DY, xs, sp, topY, botY } = fieldGeo(red, blue)
  ctx.save()
  ctx.lineCap = 'butt'
  for (const row of FIELD_ROWS) {
    const ox = sp * row.sx
    const oy = DY * row.k
    const yLand = fieldLand(row.k, botY, DY)
    ctx.strokeStyle = `rgba(78,82,90,${row.alpha})`
    ctx.lineWidth = row.lw
    for (const x of xs) {
      ctx.beginPath()
      ctx.moveTo(x + ox, topY + oy - FIELD_TUCK)
      ctx.lineTo(x + ox, yLand)
      ctx.stroke()
    }
  }
  ctx.restore()
}

/* 箭头：每排给自己那一排的线收口（近大远小、近亮远暗），尖端正好是线的末端 —— 线和箭头连成一体。
   装置的 N/S 是固定的（N 在上），磁感线恒为自上而下，箭头一律收在 S 极顶面上 */
function drawFieldArrows(ctx, red, blue) {
  const { DY, xs, sp, botY } = fieldGeo(red, blue)
  ctx.save()
  for (const row of FIELD_ROWS) {
    const ox = sp * row.sx
    const s = 1 - 0.5 * row.k
    const ay = fieldLand(row.k, botY, DY)
    ctx.fillStyle = `rgba(104,112,122,${row.alpha})`
    ctx.strokeStyle = `rgba(255,255,255,${0.34 * row.alpha})`
    ctx.lineWidth = 1
    for (const x of xs) {
      const cx = x + ox
      const w = 6 * s
      const h = 15 * s
      // 带倒钩的箭头（不是等边三角）：尖端正好接在线的末端，两个钩回到线上
      ctx.beginPath()
      ctx.moveTo(cx, ay + 1.5)
      ctx.lineTo(cx - w, ay - h)
      ctx.lineTo(cx, ay - (h - 3.6 * s))
      ctx.lineTo(cx + w, ay - h)
      ctx.closePath()
      ctx.fill()
      // 一道细白边，压在深蓝顶面上也不糊
      ctx.beginPath()
      ctx.moveTo(cx - w * 0.78, ay - (h - 1.5))
      ctx.lineTo(cx, ay + 0.5)
      ctx.lineTo(cx + w * 0.78, ay - (h - 1.5))
      ctx.stroke()
    }
  }
  ctx.restore()
}

/* ── 导体棒 AB（只画棒体和两端的接头，A/B 标注另画在最上层） ── */
function drawRod(ctx, A, B, i) {
  const ang = Math.atan2(B.y - A.y, B.x - A.x)
  const nx = -Math.sin(ang)
  const ny = Math.cos(ang)

  ctx.save()
  // 棒体：暗边 → 银灰 → 高光
  ctx.strokeStyle = '#5C6874'
  ctx.lineWidth = 7.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(A.x, A.y)
  ctx.lineTo(B.x, B.y)
  ctx.stroke()

  const g = ctx.createLinearGradient(A.x + nx * 4, A.y + ny * 4, A.x - nx * 4, A.y - ny * 4)
  g.addColorStop(0, '#EDF2F7')
  g.addColorStop(0.45, '#C3CCD6')
  g.addColorStop(1, '#8B97A3')
  ctx.strokeStyle = g
  ctx.lineWidth = 5.6
  ctx.beginPath()
  ctx.moveTo(A.x, A.y)
  ctx.lineTo(B.x, B.y)
  ctx.stroke()

  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(A.x + nx * 1.5, A.y + ny * 1.5)
  ctx.lineTo(B.x + nx * 1.5, B.y + ny * 1.5)
  ctx.stroke()

  // A 端：黑螺钉接线柱 + 红垫圈
  ctx.fillStyle = '#22242A'
  ctx.beginPath()
  ctx.arc(A.x, A.y, 7, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#CE1800'
  ctx.beginPath()
  ctx.arc(A.x, A.y, 3.8, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(A.x - 1, A.y - 1.4, 1.8, 0, Math.PI * 2)
  ctx.stroke()

  // B 端：红色圆柱端帽
  ctx.save()
  ctx.translate(B.x, B.y)
  ctx.rotate(ang)
  const capG = ctx.createLinearGradient(0, -7, 0, 7)
  capG.addColorStop(0, '#F0564E')
  capG.addColorStop(0.5, '#CE1800')
  capG.addColorStop(1, '#8E1000')
  ctx.fillStyle = capG
  ctx.beginPath()
  ctx.roundRect(-3, -6.6, 13, 13.2, 4)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(-3, -6.6, 13, 13.2, 4)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.beginPath()
  ctx.roundRect(1, -4.6, 2.6, 3.6, 1.2)
  ctx.fill()
  ctx.restore()

  // 棒内感应电流方向
  if (Math.abs(i) > 1e-5) {
    const dir = i > 0 ? 1 : -1
    const cxp = A.x + (B.x - A.x) * 0.46
    const cyp = A.y + (B.y - A.y) * 0.46
    ctx.strokeStyle = 'rgba(255,248,236,0.95)'
    ctx.lineWidth = 2.4
    ctx.beginPath()
    ctx.moveTo(cxp - Math.cos(ang) * 15 * dir, cyp - Math.sin(ang) * 15 * dir)
    ctx.lineTo(cxp + Math.cos(ang) * 15 * dir, cyp + Math.sin(ang) * 15 * dir)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,248,236,0.95)'
    ctx.beginPath()
    ctx.moveTo(cxp + Math.cos(ang) * 19 * dir, cyp + Math.sin(ang) * 19 * dir)
    ctx.lineTo(cxp + Math.cos(ang + 2.45) * 9.5 * dir, cyp + Math.sin(ang + 2.45) * 9.5 * dir)
    ctx.lineTo(cxp + Math.cos(ang - 2.45) * 9.5 * dir, cyp + Math.sin(ang - 2.45) * 9.5 * dir)
    ctx.closePath()
    ctx.fill()
  }

  ctx.restore()
}

/** A / B 标注：画在 N 极之后再画，保证压在最上层不被极面吃掉 */
function drawRodTags(ctx, A, B, FS) {
  tag(ctx, 'A', A.x - 20, A.y + 30, FS(9.5))
  tag(ctx, 'B', B.x + 20, B.y - 16, FS(9.5))
}

function tag(ctx, text, x, y, size) {
  ctx.save()
  ctx.font = `bold ${size}px "Microsoft YaHei", sans-serif`
  const w = ctx.measureText(text).width
  ctx.fillStyle = 'rgba(255,250,240,0.94)'
  ctx.strokeStyle = 'rgba(150,130,100,0.45)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(x - w / 2 - 4, y - size * 0.78, w + 8, size * 1.56, 4)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#4E3E2C'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y)
  ctx.restore()
}

/* ── 单段三次贝塞尔 → 采样点 ── */
function cubicPath(p0, c1, c2, p3, n = 44) {
  const out = []
  for (let k = 0; k <= n; k++) {
    const u = k / n
    const v = 1 - u
    out.push({
      x: v * v * v * p0.x + 3 * v * v * u * c1.x + 3 * v * u * u * c2.x + u * u * u * p3.x,
      y: v * v * v * p0.y + 3 * v * v * u * c1.y + 3 * v * u * u * c2.y + u * u * u * p3.y,
    })
  }
  return out
}

/* ── 平滑折线（Catmull-Rom）→ 采样点 ── */
function smoothPath(points, per = 14) {
  const pts = [points[0], ...points, points[points.length - 1]]
  const out = []
  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2]
    for (let k = 0; k < per; k++) {
      const t = k / per
      const t2 = t * t
      const t3 = t2 * t
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      })
    }
  }
  out.push(points[points.length - 1])
  return out
}

/* ── 红色软导线 + 电流小点 ── */
function drawWire(ctx, samples, t, i, reverseBase) {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // 外皮（深红）
  ctx.strokeStyle = '#8E1000'
  ctx.lineWidth = 11
  ctx.beginPath()
  ctx.moveTo(samples[0].x, samples[0].y)
  for (let k = 1; k < samples.length; k++) ctx.lineTo(samples[k].x, samples[k].y)
  ctx.stroke()

  // 主色
  ctx.strokeStyle = '#CE1800'
  ctx.lineWidth = 8
  ctx.beginPath()
  ctx.moveTo(samples[0].x, samples[0].y)
  for (let k = 1; k < samples.length; k++) ctx.lineTo(samples[k].x, samples[k].y)
  ctx.stroke()

  // 高光
  ctx.strokeStyle = 'rgba(255,124,92,0.5)'
  ctx.lineWidth = 2.2
  ctx.beginPath()
  ctx.moveTo(samples[0].x - 1.4, samples[0].y - 2.2)
  for (let k = 1; k < samples.length; k++) ctx.lineTo(samples[k].x - 1.4, samples[k].y - 2.2)
  ctx.stroke()

  // 电流小点（沿导线跑，方向随 i 翻转）
  if (Math.abs(i) > 1e-5) {
    const rev = reverseBase ? i > 0 : i < 0
    drawDotsAlong(ctx, samples, t, rev)
  }
  ctx.restore()
}

function drawDotsAlong(ctx, samples, t, rev) {
  let total = 0
  const lens = []
  for (let k = 1; k < samples.length; k++) {
    const d = Math.hypot(samples[k].x - samples[k - 1].x, samples[k].y - samples[k - 1].y)
    lens.push(d)
    total += d
  }
  const gap = 32
  const n = Math.max(2, Math.floor(total / gap))
  ctx.fillStyle = 'rgba(255,214,150,0.95)'
  for (let k = 0; k < n; k++) {
    let dist = ((t * 46) % total + k * gap) % total
    if (rev) dist = total - dist
    if (dist >= total) continue
    for (let j = 0; j < lens.length; j++) {
      if (dist <= lens[j]) {
        const u = dist / (lens[j] || 1)
        const a = samples[j]
        const b = samples[j + 1]
        ctx.beginPath()
        ctx.arc(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, 2.6, 0, Math.PI * 2)
        ctx.fill()
        break
      }
      dist -= lens[j]
    }
  }
}

/* ── 灵敏电流计（NB 同款：黑壳 + 白盘 + 中央零点 ±50 mA） ── */
function drawGalvNB(ctx, G, frac, i, FS) {
  const { x, y, w, h, baseH } = G
  const baseY = y + h
  const cx = x + w / 2
  const pivotY = y + h - 20
  const R = 96                     // 刻度弧半径
  const SWEEP = 54 * Math.PI / 180
  const f = Math.max(-1, Math.min(1, frac))

  ctx.save()

  // 表头上方的数字读数（NB 的 "0mA"）
  const val = i * 1000
  const shown = Math.abs(val) < 0.5 ? 0 : Math.round(val)
  const txt = `${shown} mA`
  ctx.font = `bold ${FS(20)}px "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = 'rgba(60,52,44,0.92)'
  ctx.fillText(txt, cx, y - 12)

  // 底座（比表体宽，NB 的黑色台座）
  const bg = ctx.createLinearGradient(0, baseY, 0, baseY + baseH)
  bg.addColorStop(0, '#3B3D42')
  bg.addColorStop(0.4, '#28292D')
  bg.addColorStop(1, '#191A1E')
  ctx.fillStyle = bg
  ctx.beginPath()
  ctx.roundRect(x - 8, baseY + 2, w + 16, baseH, 6)
  ctx.fill()

  // 表体
  const bodyG = ctx.createLinearGradient(x, y, x, y + h)
  bodyG.addColorStop(0, '#41444A')
  bodyG.addColorStop(0.5, '#33353A')
  bodyG.addColorStop(1, '#24262A')
  ctx.fillStyle = bodyG
  ctx.strokeStyle = '#15161a'
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 10)
  ctx.fill()
  ctx.stroke()

  // 顶部倒角高光
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.beginPath()
  ctx.roundRect(x + 6, y + 4, w - 12, 6, 3)
  ctx.fill()

  // 白盘
  ctx.fillStyle = '#FFFFFF'
  ctx.strokeStyle = '#111'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.roundRect(x + 10, y + 13, w - 20, h - 27, 5)
  ctx.fill()
  ctx.stroke()

  // 刻度弧
  const a0 = -Math.PI / 2 - SWEEP
  const a1 = -Math.PI / 2 + SWEEP
  ctx.strokeStyle = '#20211f'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.arc(cx, pivotY, R, a0, a1)
  ctx.stroke()

  // 刻度：每 5 mA 一小格（20 格），每 10 mA 一长格 + 数字
  const DIV = 20
  for (let k = 0; k <= DIV; k++) {
    const a = a0 + (a1 - a0) * (k / DIV)
    const major = k % 2 === 0
    const len = major ? 8 : 4.5
    ctx.strokeStyle = major ? '#1c1c1a' : 'rgba(40,40,36,0.75)'
    ctx.lineWidth = major ? 1.5 : 0.9
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * R, pivotY + Math.sin(a) * R)
    ctx.lineTo(cx + Math.cos(a) * (R - len), pivotY + Math.sin(a) * (R - len))
    ctx.stroke()
    if (major) {
      const v = Math.round(-50 + (100 * k) / DIV)
      const rx = cx + Math.cos(a) * (R - 17)
      const ry = pivotY + Math.sin(a) * (R - 17)
      ctx.fillStyle = '#2A2A26'
      ctx.font = `bold ${FS(7)}px "Arial Narrow", Arial, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(Math.abs(v)), rx, ry)
    }
  }
  // 中央零点加一道红刻度
  ctx.strokeStyle = '#CE1800'
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(cx, pivotY - R)
  ctx.lineTo(cx, pivotY - R + 11)
  ctx.stroke()

  // mA 单位（中央偏左，NB 的位置）
  ctx.fillStyle = '#3A3A36'
  ctx.font = `bold ${FS(11)}px "Times New Roman", serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('mA', cx - 15, pivotY - 34)

  // 指针（红）
  const na = -Math.PI / 2 + f * SWEEP
  ctx.strokeStyle = '#CE1800'
  ctx.lineWidth = 1.9
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx - Math.cos(na) * 5, pivotY - Math.sin(na) * 5)
  ctx.lineTo(cx + Math.cos(na) * (R - 3), pivotY + Math.sin(na) * (R - 3))
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.moveTo(cx + Math.cos(na) * 2, pivotY + Math.sin(na) * 2)
  ctx.lineTo(cx + Math.cos(na) * (R - 6), pivotY + Math.sin(na) * (R - 6))
  ctx.stroke()

  // 转轴
  const hub = ctx.createLinearGradient(cx - 4, pivotY - 4, cx + 4, pivotY + 4)
  hub.addColorStop(0, '#F0F2F4')
  hub.addColorStop(1, '#8A9199')
  ctx.fillStyle = hub
  ctx.beginPath()
  ctx.arc(cx, pivotY, 4.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'
  ctx.lineWidth = 0.8
  ctx.stroke()

  // 底座丝印 −50 ~ 50
  ctx.fillStyle = 'rgba(200,203,208,0.72)'
  ctx.font = `${FS(8.5)}px "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('−50 ~ 50  mA', cx, baseY + baseH * 0.5)

  // 两个接线柱（左黑 / 右红）
  const pL = { x: x + 36, y: baseY + baseH * 0.55 }
  const pR = { x: x + w - 36, y: baseY + baseH * 0.55 }
  for (const [p, col] of [[pL, '#2B2B2B'], [pR, '#CE1800']]) {
    ctx.fillStyle = '#0F1012'
    ctx.beginPath()
    ctx.ellipse(p.x, p.y + 4, 9, 5, 0, 0, Math.PI * 2)
    ctx.fill()
    const pg = ctx.createRadialGradient(p.x - 2, p.y - 3, 1, p.x, p.y - 1, 8)
    pg.addColorStop(0, col === '#CE1800' ? '#F4564C' : '#5A5A5A')
    pg.addColorStop(1, col)
    ctx.fillStyle = pg
    ctx.beginPath()
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(p.x - 1.5, p.y - 2, 3, Math.PI * 0.9, Math.PI * 1.7)
    ctx.stroke()
  }

  // 器件标签 A₁
  ctx.fillStyle = 'rgba(90,74,58,0.95)'
  ctx.font = `bold ${FS(11)}px "Times New Roman", serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('A₁', cx, baseY + baseH + 14)

  ctx.restore()
}

/* 颜色明暗 */
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16)
  let r = (n >> 16) & 255
  let g = (n >> 8) & 255
  let b = n & 255
  r = Math.min(255, Math.max(0, Math.round(r * k)))
  g = Math.min(255, Math.max(0, Math.round(g * k)))
  b = Math.min(255, Math.max(0, Math.round(b * k)))
  return `rgb(${r},${g},${b})`
}



