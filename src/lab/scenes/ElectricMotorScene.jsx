import { useState, useRef, useEffect, useCallback } from 'react'
import { eventToCanvas } from '../utils/pointerPos'
import SceneShell from '../ui/SceneShell'
import InfoDock from '../ui/InfoDock'
import BuilderPalette from '../ui/BuilderPalette'
import { drawKnowledgeCard } from '../ui/knowledgeCard'
import BuilderSVG from '../simple3d/BuilderSVG.jsx'
import { TYPES } from './electricSvgInstruments.js'
import { symSwitch, symHalf, symBattery, symACSource, SYM_INK } from '../render/symbols.js'

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
  magL: 138, magLw: 72,      // 左磁极（N）—— 块画宽些，N/S 才能像 NB 那样落在块心、不被凹弧压住
  magR: 374, magRw: 72,      // 右磁极（S）
  egy: 368, egyR: 26,        // 换向器中心 / 半径（实心半圆片，外圆 26）
  brushDx: 35,               // 两电刷离轴的距离（碳块外沿 = 26+9，正好压住铜片外圆）
  L: 118, R: 468, T: 424, B: 574,   // 回路矩形
  batX: 196, swX: 350,
  row1: 624, row2: 680,
  chX: 590, chY: 452, chW: 200, chH: 132,   // τ–θ 曲线（瘦身，把横向空间让给电机）
  zx: 566, zy: 292, zr: 64,   // 换向器"放大窗"（呼应教学片里"下方同步放大接触处"）
  VW: 800, VH: 730,
}

const TAU_K = 10          // 转矩系数（K·I·cos θ）
const AC_HZ = 4           // 交流演示频率（Hz）：真实市电 50 Hz 太快，降到 4 Hz 才看得清电流反向
const DAMP = 1.15         // 阻尼（无换向器时靠它把摆动停下来）
const MAX_REC = 4
const DEAD_RPM = 10        // 低于这个转速认为"卡在死点、没真正起转"（记录里的判定门槛）

export default function ElectricMotorScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const builderRef = useRef(null)

  const S = useRef({
    tab: 1,
    switchClosed: false,
    power: 'dc',            // 电源类型：'dc' 电池组（直流） / 'ac' 交流电
    I: 0.6,                 // 电流 0.2 ~ 1.0 A（交流时是有效值/峰值）
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
      /* 交流供电：i(t) = I·sin(2π f t)，每隔半个周期电流就反向一次。
       * 真实市电 50 Hz（半周期 10 ms）在屏幕上看不到过程，这里把演示频率降到 AC_HZ，
       * 界面上会注明“降频演示”。 */
      const iNow = s.power === 'ac' ? s.I * Math.sin(2 * Math.PI * AC_HZ * s.time) : s.I
      s.iNow = iNow
      /* τ = K·i(t)·|cosθ|：换向器接入时电流每半圈翻一次，转矩恒同向；
       * 拆掉换向器时电流固定在线圈里（不翻），τ 就过平衡位置后反号、平均为零。 */
      const tau = s.switchClosed ? TAU_K * iNow * (s.commutator ? Math.abs(c) : c) * sgn : 0
      s.omega += (tau - DAMP * s.omega) * dtReal
      s.theta += s.omega * dtReal
      if (Math.abs(s.omega) < 0.002 && !s.switchClosed) s.omega = 0
      s.tauNow = tau

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
    /* 知识卡瘦身：从 40% 让到 30% 以内 —— 电机本体才是主角（对标 NOBOOK：一屏器材，无卡无曲线喧宾） */
    const pw = Math.max(250, Math.min(W * 0.29, 520))
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

    /* ─── 回路（电源 + 开关，经电刷进换向器）─── */
    const { L, R, T, B, cx, cy, egy, brushDx } = D
    const hSw = symHalf('switch', 1)
    const ac = s.power === 'ac'
    const hBat = ac ? 20 : symHalf('battery', 1, 2)
    const iNow = typeof s.iNow === 'number' ? s.iNow : s.I
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

    /* 电流流动示意（正极 → 开关 → 右电刷；换向器 → 左电刷 → 左竖边 → 负极）
     * 交流时按瞬时电流的正负决定流向，灯带会随 4 Hz 来回“抽动”。 */
    if (on && (!ac || Math.abs(iNow) > 0.04 * s.I)) {
      const rev = ac && iNow < 0
      const P = (pts) => (rev ? pts.slice().reverse() : pts)
      drawFlow(ctx, P([
        { x: D.batX + hBat, y: B }, { x: D.swX - hSw, y: B },
      ]), s.time, '#FBBF24')
      drawFlow(ctx, P([
        { x: D.swX + hSw, y: B }, { x: R, y: B }, { x: R, y: T },
        { x: cx + brushDx, y: T }, { x: cx + brushDx, y: egy },
      ]), s.time, '#FBBF24')
      drawFlow(ctx, P([
        { x: cx - brushDx, y: egy }, { x: cx - brushDx, y: T },
        { x: L, y: T }, { x: L, y: B }, { x: D.batX - hBat, y: B },
      ]), s.time, '#FBBF24')
    }

    /* ─── 电动机剖面 ─── */
    drawMotorBody(ctx, {
      cx, cy, theta: s.theta, on, Iamp: s.I,
      iNow: typeof s.iNow === 'number' ? s.iNow : s.I,
      field: s.field, commutator: s.commutator, FS, time: s.time, closed: on,
      omega: s.omega, ac,
    })

    /* ─── 电源 / 开关 ─── */
    if (ac) symACSource(ctx, D.batX, B, { ink, FS })
    else symBattery(ctx, D.batX, B, { n: 2, scale: 1, ink })
    symSwitch(ctx, D.swX, B, { closed: on, scale: 1, ink })
    ctx.fillStyle = '#5D4037'
    ctx.font = `bold ${FS(10.5)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(ac ? `交流电源（${AC_HZ} Hz 降频演示）` : '电池组（直流）', D.batX, B + 22)
    ctx.fillText('开关（点击）', D.swX, B + 20)

    /* ─── τ–θ 曲线 ─── */
    drawTauChart(ctx, D.chX, D.chY, D.chW, D.chH, {
      theta: s.theta, Iamp: s.I, commutator: s.commutator, field: s.field, on, FS, ac, time: s.time,
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
    const cX = 300, cW = 150, cY = r1 - 16, cH = 32
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

    /* 「手拨一下」：单线圈停在平衡位置（死点）时没有自启转矩，用这个按钮模拟"用手拨一下"。
       拨的方向跟着磁场走（磁场反了就往反方向拨），拨完靠转矩自己接上。 */
    const kX = 458, kW = 112, kH = 32
    const canKick = on
    ctx.fillStyle = canKick ? '#FFF7ED' : '#F5F0E8'
    ctx.strokeStyle = canKick ? '#C2410C' : '#D7C4A8'
    ctx.lineWidth = 1.8
    ctx.beginPath(); ctx.roundRect(kX, r1 - 16, kW, kH, 16); ctx.fill(); ctx.stroke()
    ctx.fillStyle = canKick ? '#B45309' : '#A08E76'
    ctx.font = `bold ${FS(10)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('✋ 手拨一下', kX + kW / 2, r1)
    canvasRef.current._clickAreas.push({
      x: TX(kX), y: TY(r1 - 18), w: kW * sc, h: (kH + 4) * sc,
      onClick: () => {
        if (!S.current.switchClosed) return
        S.current.omega += (S.current.field ? 1 : -1) * (S.current.commutator ? 1.9 : 1.1)
        S.current.kicked = S.current.time
        forceUpdate(n => n + 1)
      },
    })

    /* 转速显示（按钮右） */
    const rx0 = kX + kW + 14
    ctx.fillStyle = '#5A4636'
    ctx.font = `bold ${FS(10.5)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'left'
    ctx.fillText(ac ? `转速 ${Math.round(rpm)} r/min（原地抖）` : `转速 ${Math.round(rpm)} r/min`, rx0, r1)
    ctx.fillStyle = '#8D6E63'
    ctx.font = `${FS(9)}px "Microsoft YaHei", sans-serif`
    ctx.fillText(
      ac ? `ω = ${Math.abs(s.omega).toFixed(2)} rad/s · 电流来回翻，转不起来`
         : `ω = ${Math.abs(s.omega).toFixed(2)} rad/s · 俯视${s.omega >= 0 ? '顺时针' : '逆时针'}`,
      rx0, r1 + 18)

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

    /* 记录按钮（交流档不可记录：线圈只抖不转，记下来没有意义。
       直流档即使卡在死点（转速 0）也允许记录 —— 这一行会标成"卡在死点·没起转"，本身就是结论） */
    const recX = 316, recW = 176
    const recOn = on && !ac && s.records.length < MAX_REC
    ctx.fillStyle = recOn ? '#FFF7ED' : '#F5F0E8'
    ctx.strokeStyle = recOn ? '#EA580C' : '#D7C4A8'
    ctx.lineWidth = 1.8
    ctx.beginPath(); ctx.roundRect(recX, r2 - 17, recW, 34, 17); ctx.fill(); ctx.stroke()
    ctx.fillStyle = recOn ? '#B45309' : '#A08E76'
    ctx.font = `bold ${FS(10.5)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(
      ac ? '📋 交流档不可记录' : `📋 记录一组（${s.records.length}/${MAX_REC}）`,
      recX + recW / 2, r2)
    canvasRef.current._clickAreas.push({
      x: TX(recX), y: TY(r2 - 19), w: recW * sc, h: 38 * sc,
      onClick: () => {
        if (!recOn) return
        const rp = Math.abs(S.current.omega) * 60 / (2 * Math.PI)
        S.current.records.push({
          I: S.current.I, comm: S.current.commutator, field: S.current.field,
          rpm: rp,
          started: rp >= DEAD_RPM,     // 转速过低 = 卡在死点、没真正起转
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

    /* 电源类型：直流（电池组） ⇄ 交流（~）——这是看“换向器到底为什么必须”的对照开关 */
    const pwX = 676, pwW = 176
    const isAC = s.power === 'ac'
    ctx.fillStyle = isAC ? '#EFF6FF' : '#FFF7ED'
    ctx.strokeStyle = isAC ? '#1D4ED8' : '#C2410C'
    ctx.lineWidth = 1.8
    ctx.beginPath(); ctx.roundRect(pwX, r2 - 16, pwW, 32, 16); ctx.fill(); ctx.stroke()
    ctx.fillStyle = isAC ? '#1D4ED8' : '#B45309'
    ctx.font = `bold ${FS(10)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(isAC ? '电源：交流 ~（点击切直流）' : '电源：直流（点击切交流）', pwX + pwW / 2, r2)
    canvasRef.current._clickAreas.push({
      x: TX(pwX), y: TY(r2 - 18), w: pwW * sc, h: 36 * sc,
      onClick: () => {
        S.current.power = S.current.power === 'ac' ? 'dc' : 'ac'
        S.current.theta = 0; S.current.omega = 0
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
            ? s.power === 'ac'
              ? `● 交流供电｜i(t) = ${(typeof s.iNow === 'number' ? s.iNow : s.I).toFixed(2)} A（峰值 ${s.I.toFixed(2)} A）｜τ 每半周期反向 → 线圈只来回抖，转不起来`
              : `● 通电中｜I = ${s.I.toFixed(2)} A｜τ ≈ ${(TAU_K * s.I * (s.commutator ? Math.abs(Math.cos(s.theta)) : Math.cos(s.theta)) * (s.field ? 1 : -1)).toFixed(1)}｜${Math.round(rpm)} r/min｜${s.commutator ? '换向器接入' : '换向器拆掉（摆几下就停）'}`
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
      kickBtn: { x: TX(kX + kW / 2), y: TY(r1) },
      fieldBtn: { x: TX(fX + fW / 2), y: TY(r2) },
      recBtn: { x: TX(recX + recW / 2), y: TY(r2) },
      powerBtn: { x: TX(pwX + pwW / 2), y: TY(r2) },
      power: s.power, iNow: typeof s.iNow === 'number' ? s.iNow : s.I,
      scale: sc, closed: on, I: s.I, comm: s.commutator, field: s.field,
      omega: s.omega, rpm, theta: s.theta, recN: s.records.length,
      panel: { x: panel.x, y: panel.y, w: panel.w, h: panel.h },
      setTheta: (t) => { S.current.theta = t; S.current.omega = 0 },
    }
  }

  /* ── 知识卡（8 节）── */
  function buildSections(records, cur) {
    const rows = records.map((r, i) => {
      const row = [
        [`第 ${i + 1} 组：`],
        [`I = ${r.I.toFixed(2)} A`, '#0EA5E9', 1],
        ['，'],
        [r.comm ? '换向器接入' : '换向器拆掉', r.comm ? '#15803D' : '#DC2626', 1],
        ['，'],
        [r.field ? 'N 在左' : 'S 在左', r.field ? '#B91C1C' : '#1D4ED8', 1],
        ['，转速 '],
        [`${Math.round(r.rpm)} r/min`, '#7C3AED', 1],
      ]
      if (r.started === false) {
        row.push(['（卡在'], ['死点', '#DC2626', 1], ['·没起转）'])
      } else {
        row.push(['（'], [`俯视${r.dir}`, '#B45309', 1], ['）'])
      }
      row.push(['。'])
      return row
    })
    if (records.length >= 2 && records.some((r) => r.started !== false)) {
      const a = records[0], b = records[records.length - 1]
      let note
      if (b.started === false) {
        note = ['这次转速只有 ']
        note.push([`${Math.round(b.rpm)} r/min`, '#DC2626', 1])
        note.push([' —— 线圈卡在'], ['平衡位置（死点）', '#DC2626', 1])
        note.push(['，先点「✋ 手拨一下」再记录，才谈得上比转速/转向。'])
      } else if (a.comm !== b.comm) {
        note = ['对照：拆掉换向器后线圈只摆几下就停 —— 靠 ']
        note.push(['换向器', '#15803D', 1])
        note.push([' 每半圈翻转电流才能连续转。'])
      } else if (a.field !== b.field) {
        note = ['对照：只把磁场方向反一下，']
        note.push(['俯视转向就反了', '#B45309', 1])
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
          [['换向那一瞬（铜片上两道缝同时对着两只电刷）电流断开、转矩为零，全靠'], ['惯性冲过去', '#7C3AED', 1], ['——右上放大窗会闪红提醒你"就是这一刻换的边"。']],
          [['点「换向器」按钮拆掉它，就是本实验最直观的一次对比。']],
          [['再点「电源」切到'], ['交流 ~', '#1D4ED8', 1], ['：电流每半周期自己就反一次向，换向器也救不回来，线圈只原地抖动——所以'], ['直流电动机必须有换向器', '#15803D', 1], ['，交流电动机要用别的办法（如旋转磁场）。']],
        ],
      },
      {
        title: '⑤ 转速由什么决定',
        lines: [
          [['电流越大 → 转矩越大 → 转速越高：本仿真里 '], ['ω ∝ I', '#0EA5E9', 1], ['（I 从 0.2 到 1.0 A，空载、忽略反电动势的前提下）。']],
          [['磁场越强（磁极越强）→ 转矩越大 → 转得越快；线圈匝数越多也一样。']],
          [['负载越重 → 转速越低（真实电动机带负载会掉速），本仿真在空载下演示。']],
          [['真实电动机还有'], ['反电动势', '#7C3AED', 1], ['：转速越高反电动势越大 → 电流越小 → 转矩越小，最后与负载/摩擦自动平衡。']],
        ],
      },
      {
        title: '⑥ 转向由什么决定',
        lines: [
          [['只要改变'], ['电流方向', '#0EA5E9', 1], [' 或 '], ['磁场方向', '#B91C1C', 1], [' 中的'], ['任意一个', '#DC2626', 1], ['，转向就反过来。']],
          [['两个同时改变 → 转向不变（左手定则里两个方向都反一次，拇指方向不变）。']],
          [['本实验的转向按'], ['俯视（从上往下看）', '#15803D', 1], ['标 —— 线圈是绕竖直轴转出纸面的，屏幕上看不到旋向。']],
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
              ['，转速 '], [`${Math.round(cur.rpm)} r/min`, '#7C3AED', 1],
            ]]
            : [[['转起来以后点「记录一组」，把电流、换向器有没有、转向、转速记下来（最多 ' + MAX_REC + ' 组）。']]]),
        ],
      },
      {
        title: '⑧ 电动机 vs 发电机（一句话分清）',
        lines: [
          [['电动机：'], ['电能 → 机械能', '#15803D', 1], ['。通电导线在磁场里受'], ['安培力', '#C2410C', 1], ['（F = BIL，'], ['左手定则', '#7C3AED', 1], ['）——先有电流，才有转动。']],
          [['发电机：'], ['机械能 → 电能', '#1D4ED8', 1], ['。导体'], ['切割磁感线', '#C2410C', 1], ['产生感应电动势（E = BLv，'], ['右手定则', '#7C3AED', 1], ['）——先有运动，才有电。']],
          [['同一个部件位置，两种接法：'], ['换向器', '#15803D', 1], ['（两片半环）让外电路永远是同一极性（脉动直流）；'], ['滑环', '#15803D', 1], ['（两个独立环）把交变电流原样送出去——这就是"直流电机/交流发电机"的分水岭。']],
          [['同一台机器可以反着用：外力拖着转就发电，通电就转——这就是'], ['可逆性', '#B45309', 1], ['。']],
        ],
      },
      {
        title: '⚠ 注意事项',
        lines: [
          [['本实验是'], ['磁场对电流的作用', '#DC2626', 1], ['（电动机原理），'], ['不是电磁感应', '#7C3AED', 1], ['—— 别和「磁生电」搞混。']],
          [['换向器与交流电是两回事：换向器是'], ['机械换向', '#B45309', 1], ['，把外部直流"切成"线圈内的交变电流。']],
          [['单线圈有'], ['死点', '#DC2626', 1], ['：线圈正停在平衡位置时，转矩严格为 0、自己起不来 —— 真实教具也要用手拨一下，本仿真用「✋ 手拨一下」代替。']],
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
              '磁极是两块带圆弧凹面的厚块 —— 中间是圆柱腔，线圈整圈都在磁场里',
              '电流只走"左竖边 → 上边 → 右竖边"，两个开口端接换向器（线圈不闭合，所以不是短路）',
              '点开关：线圈绕竖直轴转，两条竖边一前一后扫过，θ=90° 时侧身成一条线',
              'θ=0 时竖边运动方向 ⊥ 磁感线 → 切割最快（此刻转矩也最大）；θ=90° 时竖边顺着磁感线走，不切割',
              '竖边的红 / 蓝就是电流方向；每半圈换向器换边 → 红蓝对调 → 仍朝同一边转',
              '若卡在平衡位置不动（"死点"），点「✋ 手拨一下」给它个初速度',
              '点「✗ 换向器已接入」拆掉它：红蓝不再对调，线圈摆几下停住',
              '调电流 I / 点「磁场」对调 N、S，看转速与转向怎么变',
            ]}
            hint="转矩 τ = K·I·cosθ；换向器在平衡位置处每半圈翻转电流 → τ 恒同向；改变电流方向或磁场方向任一 → 俯视转向反。"
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
  const { cx, cy, theta, on, Iamp, field, commutator, FS } = o
  const iNow = typeof o.iNow === 'number' ? o.iNow : Iamp
  const irel = Iamp > 1e-6 ? Math.min(1, Math.abs(iNow) / Iamp) : 0
  const c = Math.cos(theta)
  const aH = D.aH, bH = D.bH
  const magL = D.magL, magLw = D.magLw, magR = D.magR, magRw = D.magRw
  const egy = D.egy, egyR = D.egyR

  /* 电流/转矩的符号约定（把"电流方向"和"受力方向"分开算，不再混用一个 dirSign）：
   *   curSign > 0 → 右侧竖边的电流朝上（左侧朝下）
   *     · 换向器接入：线圈内电流相对"空间"固定（每半圈由铜片翻转）→ 与 θ 无关
   *     · 换向器拆掉：电流固定在线圈里，线圈转过 180° 后同一空间侧自然反向 → 乘 sign(cosθ)
   *     · 与磁场无关（磁场只决定受力，不决定电流）
   *   tauSign > 0 → 转矩使 θ 增大（与引擎 tau 同号） */
  const sgnI = Math.sign(iNow) || 1
  const curSign = sgnI * (commutator ? 1 : (Math.sign(c) || 1))
  const tauSign = iNow * (commutator ? Math.abs(c) : c) * (field ? 1 : -1)
  const hasI = on && Math.abs(iNow) > 1e-6

  /* 磁极（左 N 红 / 右 S 蓝；field=false 时互换颜色与字母） */
  const leftIsN = field
  const lc = leftIsN ? '#DC2626' : '#2563EB'
  const rc = leftIsN ? '#2563EB' : '#DC2626'
  const lPole = leftIsN ? 'N' : 'S'
  const rPole = leftIsN ? 'S' : 'N'

  /* 磁极：照 NOBOOK 的样子 —— 两块厚块**内侧挖出大圆弧凹面**，两块拼成一个圆柱腔，
     线圈就在腔里扫。极面是弧面（不是直板），这才是真电动机的"弧形极靴"，
     一眼能看出"磁场充满整个空腔、线圈整圈都在场里"。
     ★ 立体感靠三层：腔体暗晕（凹进去）→ 块体前面渐变 + 顶面（厚）→ 弧面高光带（曲面）。 */
  const poleTop = cy - 112, poleBot = cy + 112
  const cavR = 116                       // 凹面半径：两块合起来是圆柱腔，弧面吃进块宽约 55%

  /* 腔体：两块磁极之间是一个**圆柱形通孔**（照 NB 的画法）—— 中间留空；
     只在**下缘**画一段孔壁（视线略高，能看见孔的内壁下半圈），上缘只留一条落影线。
     整个孔都描边会让它变成"圆环"，反而不像通了。 */
  const wallT = 15
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, cavR, 0.12 * Math.PI, 0.88 * Math.PI)
  ctx.arc(cx, cy, cavR - wallT, 0.88 * Math.PI, 0.12 * Math.PI, true)
  ctx.closePath()
  const wallG = ctx.createLinearGradient(0, cy, 0, cy + cavR)
  wallG.addColorStop(0, 'rgba(196,180,152,0.28)')
  wallG.addColorStop(0.55, 'rgba(240,232,214,0.45)')
  wallG.addColorStop(1, 'rgba(255,253,247,0.62)')
  ctx.fillStyle = wallG; ctx.fill()
  ctx.restore()
  /* 孔沿：外沿一圈暗线（洞口边界） + 上缘一层淡影（从上方落进去的阴影） */
  ctx.strokeStyle = 'rgba(118,98,72,0.46)'; ctx.lineWidth = 1.3
  ctx.beginPath(); ctx.arc(cx, cy, cavR, 0, Math.PI * 2); ctx.stroke()
  ctx.strokeStyle = 'rgba(96,78,56,0.30)'; ctx.lineWidth = 5
  ctx.beginPath(); ctx.arc(cx, cy, cavR - 5, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke()

  for (const [x0, w0, col, pole, isLeft] of [
    [magL, magLw, lc, lPole, true],
    [magR, magRw, rc, rPole, false],
  ]) {
    const xIn = isLeft ? x0 + w0 : x0
    const xOut = isLeft ? x0 : x0 + w0
    const dx = Math.abs(cx - xIn)
    const hitY = Math.sqrt(Math.max(0, cavR * cavR - dx * dx))
    const base = Math.atan2(hitY, dx)
    const a0 = isLeft ? Math.PI - base : -base
    const a1 = isLeft ? Math.PI + base : base

    /* ② 前面（带弧形内边；外侧两角做成圆角，像真器材的倒角） */
    const cr = 10
    ctx.beginPath()
    if (isLeft) {
      ctx.moveTo(xOut + cr, poleTop); ctx.lineTo(xIn, poleTop)
      ctx.lineTo(xIn, cy - hitY)
      ctx.arc(cx, cy, cavR, a0, a1, false)
      ctx.lineTo(xIn, poleBot); ctx.lineTo(xOut + cr, poleBot)
      ctx.quadraticCurveTo(xOut, poleBot, xOut, poleBot - cr)
      ctx.lineTo(xOut, poleTop + cr)
      ctx.quadraticCurveTo(xOut, poleTop, xOut + cr, poleTop)
    } else {
      ctx.moveTo(xOut - cr, poleTop); ctx.lineTo(xIn, poleTop)
      ctx.lineTo(xIn, cy - hitY)
      ctx.arc(cx, cy, cavR, a0, a1, false)
      ctx.lineTo(xIn, poleBot); ctx.lineTo(xOut - cr, poleBot)
      ctx.quadraticCurveTo(xOut, poleBot, xOut, poleBot - cr)
      ctx.lineTo(xOut, poleTop + cr)
      ctx.quadraticCurveTo(xOut, poleTop, xOut - cr, poleTop)
    }
    ctx.closePath()
    const g = ctx.createLinearGradient(0, poleTop, 0, poleBot)
    g.addColorStop(0, shade(col, 0.16))
    g.addColorStop(0.22, col)
    g.addColorStop(0.72, shade(col, -0.10))
    g.addColorStop(1, shade(col, -0.34))
    ctx.fillStyle = g
    ctx.fill()
    ctx.strokeStyle = shade(col, -0.45); ctx.lineWidth = 1.4
    ctx.stroke()

    /* ②b 倒角：顶沿一道亮带、外侧竖沿一道亮带、底沿一道暗带 —— 厚度感全靠这三条 */
    ctx.save()
    ctx.clip()
    const bvT = ctx.createLinearGradient(0, poleTop, 0, poleTop + 10)
    bvT.addColorStop(0, 'rgba(255,255,255,0.62)'); bvT.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = bvT; ctx.fillRect(xOut, poleTop, w0, 10)
    const xs = isLeft ? xOut : xOut - 8
    const bvS = ctx.createLinearGradient(xs, 0, xs + 8, 0)
    bvS.addColorStop(isLeft ? 0 : 1, 'rgba(255,255,255,0.46)')
    bvS.addColorStop(isLeft ? 1 : 0, 'rgba(255,255,255,0)')
    ctx.fillStyle = bvS; ctx.fillRect(xs, poleTop, 8, poleBot - poleTop)
    const bvB = ctx.createLinearGradient(0, poleBot - 12, 0, poleBot)
    bvB.addColorStop(0, 'rgba(0,0,0,0)'); bvB.addColorStop(1, 'rgba(0,0,0,0.30)')
    ctx.fillStyle = bvB; ctx.fillRect(xOut, poleBot - 12, w0, 12)
    ctx.restore()

    /* ④ 弧面：一条宽高光带贴在内弧上（clip 到块内），上暗—中亮—下暗 = 曲面 */
    ctx.save()
    ctx.clip()
    const ag = ctx.createLinearGradient(0, poleTop, 0, poleBot)
    ag.addColorStop(0, shade(col, -0.26))
    ag.addColorStop(0.34, shade(col, 0.34))
    ag.addColorStop(0.56, shade(col, 0.40))
    ag.addColorStop(1, shade(col, -0.30))
    ctx.beginPath(); ctx.arc(cx, cy, cavR - 9, a0 + 0.012, a1 - 0.012)
    ctx.strokeStyle = ag; ctx.lineWidth = 21; ctx.stroke()
    /* 弧的内沿再压一条暗线，弧面边界才清楚 */
    ctx.beginPath(); ctx.arc(cx, cy, cavR - 1.2, a0, a1)
    ctx.strokeStyle = shade(col, -0.52); ctx.lineWidth = 2.2; ctx.stroke()
    /* 极面外沿一圈极淡的暖光，模拟反光 */
    ctx.beginPath(); ctx.arc(cx, cy, cavR - 19, a0 + 0.06, a1 - 0.06)
    ctx.strokeStyle = 'rgba(255,255,255,0.34)'; ctx.lineWidth = 3; ctx.stroke()
    ctx.restore()

    /* ⑤ 块底阴影（落在腔底上的投影） */
    ctx.fillStyle = shade(col, -0.55)
    ctx.fillRect(xOut + 1, poleBot - 3, w0 - 2, 3)
    // 极标（只留 N / S 两个大字，落在块外侧的实心部分，与线圈同高，像 NB）
    ctx.fillStyle = '#FFFFFF'
    ctx.font = `900 ${FS(30)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = FS(4); ctx.shadowOffsetY = FS(1)
    ctx.fillText(pole, isLeft ? xOut + 22 : xOut - 22, cy + 2)
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0
  }

  /* 磁感线：只留 4 条很淡的（N→S），是"底图"，不能抢线圈 */
  const ys = [-70, -24, 24, 70]
  ctx.strokeStyle = on ? 'rgba(100,116,139,0.30)' : 'rgba(120,134,146,0.22)'
  ctx.lineWidth = 1
  for (const y of ys) {
    ctx.setLineDash([6, 6])
    ctx.beginPath(); ctx.moveTo(magL + magLw, cy + y); ctx.lineTo(magR, cy + y); ctx.stroke()
    ctx.setLineDash([])
    const ax = leftIsN ? magR - 10 : magL + magLw + 10
    drawArrow(ctx, leftIsN ? magR - 20 : magL + magLw + 20, cy + y, ax, cy + y,
      'rgba(100,116,139,0.36)', 1, 6)
  }

  /* 转轴（竖直，在屏幕平面内 —— 线圈绕它旋转） */
  ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 2.4
  ctx.beginPath(); ctx.moveTo(cx, cy - bH - 14); ctx.lineTo(cx, egy + 6); ctx.stroke()

  /* 线圈：单匝矩形，绕**竖直轴**转（θ=0 → 线圈平面在纸面内；θ=±90° → 侧身成一条线）。
     两条竖边用**红 / 蓝**表示电流朝上 / 朝下（换向器每半圈把两色对调，这就是"换向"看得见的那一下）；
     靠观者的那条边画粗画亮、远的一条画细画暗，才有"侧身掠过"的立体感。 */
  const halfW = aH * Math.abs(c)
  const frontIsRight = c >= 0
  const xl = cx - halfW, xr = cx + halfW
  const REDC = '#DC2626', BLUEC = '#2563EB', DIMC = '#9A8A76'
  const colRight = hasI ? (curSign > 0 ? REDC : BLUEC) : DIMC
  const colLeft = hasI ? (curSign > 0 ? BLUEC : REDC) : DIMC
  const nearW = 6.4, farW = 3.6
  const farX = frontIsRight ? xl : xr
  const nearX = frontIsRight ? xr : xl

  /* 立体感：线圈两条竖边一近一远，透视上"近的一条偏下、远的一条偏上"，
     转过角度时整只矩形框就变成平行四边形 —— 这样眼睛看到的是"门在转"，
     而不是"宽度被压扁"。 */
  const off = 5.6 * Math.abs(Math.sin(theta))
  const yTopN = cy - bH + off, yBotN = cy + bH + off
  const yTopF = cy - bH - off, yBotF = cy + bH - off

  /* 一根"铜管"：暗描边 → 铜色管身 → 电流色的芯 → 高光。三段叠起来才有圆柱感 */
  const tube = (x1, y1, x2, y2, w, core, alpha = 1) => {
    const ang = Math.atan2(y2 - y1, x2 - x1)
    const nx = -Math.sin(ang), ny = Math.cos(ang)     // 管的法向（用来错高光）
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.lineCap = 'round'
    ctx.strokeStyle = 'rgba(52,30,10,0.42)'; ctx.lineWidth = w + 2.2
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    ctx.strokeStyle = '#C2854E'; ctx.lineWidth = w
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    ctx.strokeStyle = core; ctx.lineWidth = Math.max(1.6, w * 0.56)
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    const hx = nx * w * 0.26, hy = ny * w * 0.26
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = Math.max(1, w * 0.16)
    ctx.beginPath(); ctx.moveTo(x1 + hx, y1 + hy); ctx.lineTo(x2 + hx, y2 + hy); ctx.stroke()
    ctx.restore()
  }

  // 远侧竖边（先画，被近侧压住）
  tube(farX, yTopF, farX, yBotF, farW, frontIsRight ? colLeft : colRight, 0.80)

  // 上边（铜色的"框"，从远边连到近边）
  tube(farX, yTopF, nearX, yTopN, 3.8, on ? '#B45309' : '#A2917C')
  /* ★ 底边不能画：单匝电枢是**开口**的 —— 电流从左端进来、绕"左边→上边→右边"、
     从右端出去接换向器。若把底边也连上，两只引线就被底边直接短接，线圈里没有电流，
     也就谈不上"通电导线在磁场里受力"。 */

  // 近侧竖边（最粗最亮）
  tube(nearX, yTopN, nearX, yBotN, nearW, frontIsRight ? colRight : colLeft)

  // 线圈里的电流方向（小箭头，颜色与那条边一致）
  if (hasI && halfW > 8) {
    const ay = bH - 14
    const lwI = 1.2 + 1.6 * irel
    const upR = curSign > 0
    const rA = cy + ay + off, rB = cy - ay + off
    const lA = cy + ay - off, lB = cy - ay - off
    drawArrow(ctx, xr, upR ? rA : rB, xr, upR ? rB : rA, colRight, lwI, 7)
    drawArrow(ctx, xl, upR ? lB : lA, xl, upR ? lA : lB, colLeft, lwI, 7)
  }

  /* 两侧安培力：侧视图里力垂直于纸面 → 用 ⊙（朝纸外）/ ⊗（朝纸内）表达，
     一边朝里、一边朝外，正好形成转矩（这是教科书画侧视图的标准做法）。
     符号跟随 tauSign：交流时每半周期就翻一次（与 i(t) 同步）。 */
  if (hasI) {
    const col = '#7C3AED'
    const fx = 5 + 1.5 * irel
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
  }

  /* 转向示意（轴顶）：线圈是绕**竖直轴转出纸面**的，屏幕里看不到旋向，
     所以画一枚很小的"俯视"小图（从上往下看），箭头才是真正的转向。 */
  if (on && Math.abs(iNow) > 0.001) {
    const col = tauSign >= 0 ? '#15803D' : '#7C3AED'
    const cxm = cx, cym = cy - bH - 28, rr = 8.6
    ctx.save()
    ctx.strokeStyle = 'rgba(100,116,139,0.7)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(cxm, cym, rr, 0, Math.PI * 2); ctx.stroke()
    // 转轴（圆心小点）
    ctx.fillStyle = 'rgba(100,116,139,0.8)'
    ctx.beginPath(); ctx.arc(cxm, cym, 1.8, 0, Math.PI * 2); ctx.fill()
    // 旋向弧 + 箭头（屏幕 y 向下：角度增大 = 俯视顺时针）
    const s = tauSign >= 0 ? 1 : -1
    const a0 = -2.5, a1 = a0 + s * 3.0
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.arc(cxm, cym, rr - 2.4, a0, a1, s < 0); ctx.stroke()
    const ex = cxm + (rr - 2.4) * Math.cos(a1), ey = cym + (rr - 2.4) * Math.sin(a1)
    const tx = -Math.sin(a1) * s, ty = Math.cos(a1) * s
    const bx = -ty, by = tx
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.moveTo(ex + tx * 3.4, ey + ty * 3.4)
    ctx.lineTo(ex + bx * 3.0, ey + by * 3.0)
    ctx.lineTo(ex - bx * 3.0, ey - by * 3.0)
    ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#5D4037'
    ctx.font = `${FS(7.6)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText('俯视', cxm + rr + 4, cym)
    ctx.restore()
  }

  /* 平衡位置提示（θ ≈ ±90° 且没换向器）：改成"上方气泡 + 引出线"，不再压在磁感线上 */
  if (Math.abs(c) < 0.09 && on && !commutator) {
    callout(ctx, cx, cy - 152, [
      '平衡位置：线圈平面 ⊥ 磁感线',
      '两侧 F 共线反向 → τ = 0，转不过去',
    ], {
      color: '#DC2626', bg: 'rgba(255,255,255,0.94)', FS, lw: 1.5,
      leaderTo: { x: cx, y: cy - bH - 4 },
    })
  }
  /* 死点提示：开关闭合、线圈正好停在平衡位置附近且几乎不动 → 单线圈没有自启转矩 */
  if (on && commutator && Math.abs(c) < 0.045 && Math.abs(o.omega || 0) < 0.16) {
    callout(ctx, cx, cy - 152, [
      '卡在平衡位置（单线圈"死点"）',
      '→ 点底部「✋ 手拨一下」即可起步',
    ], {
      color: '#B45309', bg: 'rgba(255,251,235,0.96)', FS, lw: 1.5,
      leaderTo: { x: cx, y: cy - bH - 4 },
    })
  }

  /* ─── 换向器：两片**实心**半圆铜片（随线圈一起转）+ 绝缘缝 + 两片 ＋/－ ───
     缝隙相位 seamBase = θ − 90°：线圈**越过平衡位置**（θ=±90°）时，缝隙正好对着两只电刷 ——
     这才是换向发生的时刻（转矩在 θ=±90° 处变号，换向必须在这里）。 */
  const copper = '#B45309'
  const seamBase = theta - Math.PI / 2
  const ringIn = egyR * 0.42          // 换向器是圆环：中间轴孔半径
  const segCenter = (k) => seamBase + k * Math.PI + Math.PI / 2
  /* 线圈两条引线：从**开口的两端**（左侧竖边的下端、右侧竖边的下端）直插进换向器中心。
     这两条是电流唯一的进出通道 —— 线圈本身不闭合，才不会"两根引线被底边短接"。 */
  for (let k = 0; k < 2; k++) {
    const from = k === 0 ? { x: nearX, y: yBotN } : { x: farX, y: yBotF }
    ctx.strokeStyle = commutator ? shade(copper, -0.15) : '#9AA7B1'
    ctx.lineWidth = 1.8
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(cx + (k === 0 ? 3.2 : -3.2), egy - 2)
    ctx.stroke()
  }

  ctx.save(); ctx.translate(cx, egy)
  /* 换向器：一块铜"鼓"—— 落地阴影 + 外圈暗边 + 两半各自上下渐变，才不是一枚贴纸圆盘 */
  if (commutator) {
    ctx.save()
    ctx.fillStyle = 'rgba(60,40,20,0.28)'
    ctx.beginPath(); ctx.ellipse(0, egyR * 0.62, egyR * 0.96, egyR * 0.26, 0, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
    ctx.beginPath(); ctx.arc(0, 0, egyR + 2.2, 0, Math.PI * 2)
    ctx.strokeStyle = '#7A4A18'; ctx.lineWidth = 2.6; ctx.stroke()
  }
  if (!commutator) {
    // 拆掉：留一块淡灰"拆空"区和虚线外廓，表示"铜片没了、不导电"
    ctx.fillStyle = 'rgba(148,163,184,0.16)'
    ctx.beginPath(); ctx.arc(0, 0, egyR, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 1.2; ctx.setLineDash([4, 3])
    ctx.beginPath(); ctx.arc(0, 0, egyR, 0, Math.PI * 2); ctx.stroke()
    ctx.setLineDash([])
  }
  for (let k = 0; k < 2 && commutator; k++) {
    const a0 = seamBase + k * Math.PI
    /* 半环（照 NB：换向器是**圆环**，不是实心圆盘）—— 外弧 + 内弧围成一条铜箍，中间留出轴孔 */
    const halfG = ctx.createLinearGradient(0, -egyR, 0, egyR)
    if (k === 0) {
      halfG.addColorStop(0, '#E7AC6E'); halfG.addColorStop(0.42, '#BA7233'); halfG.addColorStop(1, '#8A4A16')
    } else {
      halfG.addColorStop(0, '#A9682F'); halfG.addColorStop(0.42, '#7E3E10'); halfG.addColorStop(1, '#4E2306')
    }
    ctx.fillStyle = halfG
    ctx.beginPath()
    ctx.arc(0, 0, egyR, a0, a0 + Math.PI)
    ctx.arc(0, 0, ringIn, a0 + Math.PI, a0, true)
    ctx.closePath(); ctx.fill()
    ctx.strokeStyle = shade(copper, -0.32); ctx.lineWidth = 1.2; ctx.stroke()
    // 铜箍高光（沿环中线）
    ctx.strokeStyle = k === 0 ? '#F7CE7A' : '#D97706'; ctx.lineWidth = 1.6
    ctx.beginPath(); ctx.arc(0, 0, (egyR + ringIn) / 2, a0 + 0.2, a0 + Math.PI - 0.2); ctx.stroke()
  }
  // 中间轴孔（黑洞）—— 有了它，"环"才成立
  if (commutator) {
    ctx.beginPath(); ctx.arc(0, 0, ringIn - 1, 0, Math.PI * 2)
    ctx.fillStyle = '#251708'; ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1.2; ctx.stroke()
  }
  // 绝缘缝（两条直径方向的细缝，跟着线圈转）
  if (commutator) {
    ctx.strokeStyle = '#5C1F10'; ctx.lineWidth = 2.4
    ctx.beginPath()
    for (const d of [0, Math.PI]) {
      const a = seamBase + d
      ctx.moveTo(Math.cos(a) * ringIn, Math.sin(a) * ringIn)
      ctx.lineTo(Math.cos(a) * egyR, Math.sin(a) * egyR)
    }
    ctx.stroke()
    /* ＋/－：画在缝之后（压在最上层），位置贴着"电刷压着的那个方位"，
       一眼看出"此刻这块铜片接的是哪只电刷"，每换向一次互换 */
    for (let k = 0; k < 2; k++) {
      const plus = Math.cos(segCenter(k)) > 0
      const az = plus ? 0 : Math.PI
      const sx = Math.cos(az) * ((egyR + ringIn) / 2), sy = Math.sin(az) * ((egyR + ringIn) / 2)
      ctx.fillStyle = plus ? '#ECFDF5' : '#FFF7ED'
      ctx.strokeStyle = plus ? '#15803D' : '#B45309'
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(sx, sy, 5.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = plus ? '#15803D' : '#B45309'
      ctx.font = `900 ${FS(9.5)}px "Microsoft YaHei", sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(plus ? '+' : '−', sx, sy)
    }
    /* ① ② 编号：给两片铜片"起名字"，这样"每半圈换边"才看得见（片转了、名字跟着转）。
       角度避开压在同一方位的 ＋/－ 圆牌，否则小盘上会互相盖住。 */
    ctx.font = `900 ${FS(9)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (let k = 0; k < 2; k++) {
      const ac = segCenter(k) + 0.62
      const rr2 = (egyR + ringIn) / 2 
      ctx.fillStyle = '#FFF7ED'
      ctx.strokeStyle = 'rgba(70,26,4,0.75)'; ctx.lineWidth = 2.2
      ctx.strokeText(k === 0 ? '①' : '②', Math.cos(ac) * rr2, Math.sin(ac) * rr2)
      ctx.fillText(k === 0 ? '①' : '②', Math.cos(ac) * rr2, Math.sin(ac) * rr2)
    }
  }
  // 转轴（从圆心穿过，压在铜片之上）
  ctx.fillStyle = '#A8B3C0'
  ctx.strokeStyle = '#7C8798'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.arc(0, 0, 4.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.restore()

  /* ─── 两个电刷（固定不转）：碳块**压在外圆上**（内沿压进铜片 1.2px）+ 弹簧片 + 引线 ─── */
  const brushIn = egyR - 1.2, brushOut = egyR + 11.8
  for (const s of [-1, 1]) {
    const bx = cx + s * (brushIn + brushOut) / 2
    ctx.fillStyle = commutator ? '#3E4653' : '#9AA3AE'
    ctx.strokeStyle = commutator ? '#1E2530' : '#8A939E'
    ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.roundRect(bx - 6.5, egy - 7.5, 13, 15, 2.5); ctx.fill(); ctx.stroke()
    // 碳块上的磨痕高光
    ctx.fillStyle = commutator ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.18)'
    ctx.beginPath(); ctx.roundRect(bx - 5.2, egy - 6.4, 2.2, 12.8, 1.1); ctx.fill()
    // 弹簧（压在碳块外侧的一小段弹片）
    ctx.strokeStyle = commutator ? '#9A7B3A' : '#B7BFC9'; ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(cx + s * brushOut, egy)
    ctx.lineTo(cx + s * (brushOut + 6.4), egy)
    ctx.stroke()
  }
  ctx.fillStyle = commutator ? '#5D4037' : '#94A3B8'
  ctx.font = `bold ${FS(9)}px "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  ctx.fillText(commutator ? '换向器（每半圈换边 → 电流反向）' : '换向器（已拆掉）', cx, egy + egyR + 8)
  if (!commutator) {
    ctx.fillStyle = '#DC2626'
    ctx.font = `bold ${FS(8.8)}px "Microsoft YaHei", sans-serif`
    ctx.fillText('铜片断开 → 半圈后电流不换向', cx, egy + egyR + 23)
  }

  /* 换向器放大窗：直径 52px 的接触处实在看不清"此刻哪片贴哪刷"，
     所以照教学片的做法在旁边挂一个同步放大的接触处（同一套相位、同一套颜色）。 */
  drawCommutatorZoom(ctx, { FS, theta, commutator, on, omega: o.omega || 0, ac: o.ac })
}

/** 换向器 / 电刷接触处的放大窗：① ② 编号 + 固定不动的「＋刷 / −刷」+ 此刻谁贴谁 */
function drawCommutatorZoom(ctx, o) {
  const { FS, theta, commutator, on, ac } = o
  const omega = o.omega || 0
  const { cx, egy, egyR } = D
  const zx = D.zx, zy = D.zy, zr = D.zr
  const seamBase = theta - Math.PI / 2
  const segCenter = (k) => seamBase + k * Math.PI + Math.PI / 2
  const neutral = !!commutator && on && Math.abs(Math.cos(theta)) < 0.14
  const kScale = (zr - 3) / 46

  // 引出线：从右电刷外侧拉到放大窗边缘（细虚线，不抢戏）
  const lx0 = cx + egyR + 19.8
  const ux = (zx - lx0), uy = (zy - egy)
  const ul = Math.hypot(ux, uy) || 1
  ctx.strokeStyle = 'rgba(100,116,139,0.5)'; ctx.lineWidth = 1
  ctx.setLineDash([5, 4])
  ctx.beginPath()
  ctx.moveTo(lx0, egy)
  ctx.lineTo(zx - (ux / ul) * (zr + 2), zy - (uy / ul) * (zr + 2))
  ctx.stroke()
  ctx.setLineDash([])

  // 圆窗
  ctx.beginPath(); ctx.arc(zx, zy, zr, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.97)'; ctx.fill()
  ctx.strokeStyle = neutral ? '#DC2626' : 'rgba(100,116,139,0.85)'
  ctx.lineWidth = neutral ? 2.6 : 1.8
  ctx.stroke()

  ctx.save(); ctx.translate(zx, zy); ctx.scale(kScale, kScale)
  if (commutator) {
    for (let k = 0; k < 2; k++) {
      const a0 = seamBase + k * Math.PI
      ctx.fillStyle = k === 0 ? '#C4763C' : '#8A3E0C'
      ctx.beginPath(); ctx.arc(0, 0, egyR, a0, a0 + Math.PI); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill()
      ctx.strokeStyle = 'rgba(92,31,16,0.85)'; ctx.lineWidth = 1.1; ctx.stroke()
    }
    ctx.strokeStyle = '#5C1F10'; ctx.lineWidth = 2.2
    ctx.beginPath()
    for (const d of [0, Math.PI]) {
      const a = seamBase + d
      ctx.moveTo(Math.cos(a) * 5.0, Math.sin(a) * 5.0)
      ctx.lineTo(Math.cos(a) * egyR, Math.sin(a) * egyR)
    }
    ctx.stroke()
    // ① ② 跟着铜片一起转
    ctx.font = `900 ${FS(13)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (let k = 0; k < 2; k++) {
      const ac = segCenter(k)
      const nx = Math.cos(ac) * (egyR * 0.52), ny = Math.sin(ac) * (egyR * 0.52)
      ctx.fillStyle = '#FFF7ED'
      ctx.strokeStyle = 'rgba(70,26,4,0.7)'; ctx.lineWidth = 1.8
      ctx.strokeText(k === 0 ? '①' : '②', nx, ny)
      ctx.fillText(k === 0 ? '①' : '②', nx, ny)
    }
  } else {
    ctx.fillStyle = 'rgba(148,163,184,0.16)'
    ctx.beginPath(); ctx.arc(0, 0, egyR, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 1.2; ctx.setLineDash([4, 3])
    ctx.beginPath(); ctx.arc(0, 0, egyR, 0, Math.PI * 2); ctx.stroke()
    ctx.setLineDash([])
  }
  // 两把电刷（固定不动，碳块内沿压进铜片）
  for (const s of [-1, 1]) {
    const bx = s * (egyR - 1.2 + egyR + 11.8) / 2
    ctx.fillStyle = commutator ? '#3E4653' : '#9AA3AE'
    ctx.strokeStyle = commutator ? '#1E2530' : '#8A939E'
    ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.roundRect(bx - 6.5, -7.5, 13, 15, 2.5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = commutator ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.18)'
    ctx.beginPath(); ctx.roundRect(bx - 5.2, -6.4, 2.2, 12.8, 1.1); ctx.fill()
  }
  // 刷的极性（固定不动的两只刷）：右刷 ＋、左刷 −（与回路"＋极 → 右电刷"一致），做成小圆牌，别和弹簧片糊在一起
  for (const s of [-1, 1]) {
    const bx = s * (egyR + 13.2), by = -17
    const plus = s > 0
    ctx.fillStyle = plus ? '#ECFDF5' : '#FFF7ED'
    ctx.strokeStyle = plus ? '#15803D' : '#B45309'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(bx, by, 6.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = plus ? '#15803D' : '#B45309'
    ctx.font = `900 ${FS(10.5)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(plus ? '+' : '−', bx, by)
  }
  // 小字：哪只刷接哪一极
  ctx.restore()

  // 标题 / 读数
  ctx.textAlign = 'center'
  ctx.fillStyle = '#5D4037'
  ctx.font = `bold ${FS(8.2)}px "Microsoft YaHei", sans-serif`
  ctx.textBaseline = 'bottom'
  ctx.fillText('放大：电刷 / 铜片接触处', zx, zy - zr - 8)

  const rightK = Math.cos(segCenter(0)) >= 0 ? 0 : 1
  ctx.textBaseline = 'top'
  if (!commutator) {
    ctx.fillStyle = '#DC2626'
    ctx.font = `bold ${FS(8.6)}px "Microsoft YaHei", sans-serif`
    ctx.fillText('铜片已拆：没有换向导通 → 电流不再换边', zx, zy + zr + 10)
    ctx.font = `${FS(8.2)}px "Microsoft YaHei", sans-serif`
    ctx.fillText('线圈越过后转矩变号 → 只来回摆几下就被阻尼停住', zx, zy + zr + 24)
  } else if (on && ac) {
    ctx.fillStyle = '#DC2626'
    ctx.font = `bold ${FS(8.6)}px "Microsoft YaHei", sans-serif`
    ctx.fillText('交流：电流自己每半周期就反向一次', zx, zy + zr + 10)
    ctx.font = `${FS(8.2)}px "Microsoft YaHei", sans-serif`
    ctx.fillStyle = '#B45309'
    ctx.fillText('换向器救不回来 → 线圈只原地抖动，不会连续转', zx, zy + zr + 24)
  } else if (neutral) {
    ctx.fillStyle = '#DC2626'
    ctx.font = `bold ${FS(8.8)}px "Microsoft YaHei", sans-serif`
    ctx.fillText('换向瞬间：铜片与电刷换边 → 线圈电流反向', zx, zy + zr + 10)
    ctx.font = `${FS(8.2)}px "Microsoft YaHei", sans-serif`
    ctx.fillStyle = '#B45309'
    ctx.fillText(omega > 0.35 ? '转矩零点只一闪 → 靠惯性冲过去，所以能一直转'
      : '停在这里就没有转矩（单线圈死点）→ 点「手拨一下」', zx, zy + zr + 24)
  } else {
    ctx.fillStyle = '#15803D'
    ctx.font = `bold ${FS(8.6)}px "Microsoft YaHei", sans-serif`
    ctx.fillText(rightK === 0 ? '此刻 ①贴 ＋刷 · ②贴 −刷' : '此刻 ①贴 −刷 · ②贴 ＋刷', zx, zy + zr + 10)
    ctx.fillStyle = '#64748B'
    ctx.font = `${FS(8.2)}px "Microsoft YaHei", sans-serif`
    ctx.fillText('电刷固定不动 · 铜片每半圈换边 → 电流反向、转矩同向', zx, zy + zr + 24)
  }
}

/** 两行字的气泡提示 + 引出线（用于"平衡位置""死点"这类注释，别压在图形上） */
function callout(ctx, cx, cy, lines, o) {
  const FS = o.FS || ((n) => n)
  const f = `bold ${FS(8.8)}px "Microsoft YaHei", sans-serif`
  ctx.font = f
  const wPad = 9
  let wMax = 0
  for (const ln of lines) wMax = Math.max(wMax, ctx.measureText(ln).width)
  const w = wMax + wPad * 2, h = lines.length * 13 + 8
  const x0 = cx - w / 2, y0 = cy - h / 2
  ctx.fillStyle = o.bg || 'rgba(255,255,255,0.95)'
  ctx.strokeStyle = o.color; ctx.lineWidth = o.lw || 1.4
  ctx.beginPath(); ctx.roundRect(x0, y0, w, h, 7); ctx.fill(); ctx.stroke()
  if (o.leaderTo) {
    ctx.strokeStyle = o.color; ctx.lineWidth = 1; ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(cx, y0 + h); ctx.lineTo(o.leaderTo.x, o.leaderTo.y); ctx.stroke()
    ctx.setLineDash([])
  }
  ctx.fillStyle = o.color
  ctx.font = f
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  lines.forEach((ln, i) => ctx.fillText(ln, cx, y0 + 6 + i * 13 + 4))
}

/** 颜色明暗调整（比例 -1..1） */
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const f = (v) => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))))
  return `rgb(${f(r)},${f(g)},${f(b)})`
}

/** τ 曲线：
 *   · 直流 → **τ–θ**（横轴 0..360°）：换向器接入取 |cos|（全正 → 连续转），拆掉取 cos（一正一负 → 净功为零）
 *   · 交流 → **τ–t**（横轴 0..0.5 s）：交流的"每半周期反向"是**时间**上的事，
 *     横轴必须换成时间，否则会读成"τ 随角度反"的错图（这是改造前的老 bug）。 */
function drawTauChart(ctx, x, y, w, h, o) {
  const { theta, Iamp, commutator, field, on, FS, ac, time } = o
  const px = x + 34, py = y + 34, pw = w - 48, ph = h - 48
  const sgnF = field ? 1 : -1
  ctx.fillStyle = '#FFFDF9'
  ctx.strokeStyle = '#E8DCC8'; ctx.lineWidth = 1.6
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.fill(); ctx.stroke()

  ctx.fillStyle = '#5D4037'
  ctx.font = `bold ${FS(9.6)}px "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  ctx.fillText(
    ac ? 'τ–t（交流 4 Hz 降频）：每半周期反向，平均 0'
      : commutator ? `τ–θ：换向器接入 → τ 恒为${sgnF > 0 ? '正' : '负'}`
        : 'τ–θ：换向器拆掉 → 一正一负',
    x + 12, y + 8)

  // 坐标轴（y=0 在中线）
  const y0 = py + ph / 2
  ctx.strokeStyle = '#D7C4A8'; ctx.lineWidth = 1.2
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + ph); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(px, y0); ctx.lineTo(px + pw, y0); ctx.stroke()
  // 刻度：交流按时间（0..0.5 s = 2 个 4 Hz 周期），直流按角度
  ctx.fillStyle = '#A08E76'
  ctx.font = `${FS(7.8)}px "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  if (ac) {
    const ticks = [[0, '0'], [0.125, '0.125'], [0.25, '0.25'], [0.375, '0.375'], [0.5, '0.5 s']]
    for (const [t, lab] of ticks) ctx.fillText(lab, px + (t / 0.5) * pw, py + ph + 3)
  } else {
    for (const d of [0, 90, 180, 270, 360]) ctx.fillText(`${d}°`, px + (d / 360) * pw, py + ph + 3)
  }

  const amp = ph / 2 - 3
  const norm = Math.min(1, Iamp)
  const patAbs = Math.abs(Math.cos(theta))     // 交流时按"当前线圈姿态"给幅值（姿态变则幅值变，是真实的）
  ctx.strokeStyle = ac ? '#1D4ED8' : commutator ? '#15803D' : '#B45309'
  ctx.lineWidth = 2.2
  ctx.beginPath()
  for (let i = 0; i <= pw; i++) {
    let v
    if (ac) {
      const t = (i / pw) * 0.5
      v = Math.sin(2 * Math.PI * AC_HZ * t) * patAbs
    } else {
      const tt = (i / pw) * Math.PI * 2
      v = (commutator ? Math.abs(Math.cos(tt)) : Math.cos(tt)) * sgnF
    }
    const yy = y0 - v * norm * amp
    if (i === 0) ctx.moveTo(px, yy); else ctx.lineTo(px + i, yy)
  }
  ctx.stroke()

  // 当前点
  let dotX, cv
  if (ac) {
    const tNow = ((time % 0.5) + 0.5) % 0.5
    cv = Math.sin(2 * Math.PI * AC_HZ * tNow) * patAbs
    dotX = px + (tNow / 0.5) * pw
  } else {
    const cur = ((theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
    cv = (commutator ? Math.abs(Math.cos(cur)) : Math.cos(cur)) * sgnF
    dotX = px + (cur / (Math.PI * 2)) * pw
  }
  const dotY = y0 - cv * norm * amp
  ctx.fillStyle = '#DC2626'
  ctx.beginPath(); ctx.arc(dotX, dotY, 4.5, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = 'rgba(220,38,38,0.35)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(dotX, y0); ctx.lineTo(dotX, dotY); ctx.stroke()

  // 说明
  ctx.fillStyle = on ? '#7C2D12' : '#A08E76'
  ctx.font = `bold ${FS(8.8)}px "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'
  ctx.fillText(
    ac ? (on ? '正负相抵 → 平均 τ = 0 → 只抖不转' : '开关断开 → i(t) ≡ 0')
      : commutator
        ? (sgnF > 0 ? '平均 τ > 0 → 连续转' : '平均 τ < 0 → 反向连续转')
        : '正负相抵 → 平均 τ = 0 → 停住',
    px + pw, py - 2)
}
