import { useState, useRef, useEffect, useCallback } from 'react'
import { eventToCanvas } from '../utils/pointerPos'
import SceneShell from '../ui/SceneShell'
import InfoDock from '../ui/InfoDock'
import BuilderPalette from '../ui/BuilderPalette'
import { drawKnowledgeCard } from '../ui/knowledgeCard'
import BuilderSVG from '../simple3d/BuilderSVG.jsx'
import { TYPES } from './electricSvgInstruments.js'
import { CFG } from '../engine/electricLab.js'
import { symBattery, symSwitch, symRheostat, symMeter, symHalf, SYM_INK } from '../render/symbols.js'

/**
 * OstersExperimentScene — 电生磁（奥斯特实验）（第 8 个按「简单电路」模板改造的初中电学实验）
 *
 *   知识点只讲「电流周围存在磁场」+ 直导线的安培定则，不与「电磁铁磁性影响因素」重叠：
 *     · 研究对象是【一段直导线】周围的环形磁场（没有磁极、没有匝数、没有铁芯）
 *     · 用【小磁针】显示 B 的方向（导线要沿南北方向放，先排除地磁干扰再通电）
 *     · B 强弱只看电流大小（磁感线疏密），不做 N·I·μ 的定量计算
 *
 *   Tab1 📖 电路演示 —— 暖色底 + 标准符号回路（滑变 / 电流表 / 电池 / 开关）
 *                        回路右侧竖边就是那段直导线，中点画「导线截面」⊙ / ⊗
 *                        右边放大视图：导线截面 + 同心圆磁感线 + 4 支指南针（随电流方向摆动）
 *   Tab2 🔧 自己动手 —— 同一套 1:1 SVG 器材（9 件基础 + 本专题专用「奥斯特实验板」）+
 *                        一键透视 + 实验记录表（都在 BuilderSVG 里）
 */

function thumb(type) {
  const t = TYPES[type]
  if (!t) return null
  let svg = t.render({ id: `pal-${type}`, f: 0.4 }, { I: 0, sign: 0, bmag: 0, bright: 0.5, frac: 0 })
  if (type === 'ostersBoard') svg = svg.replace('<svg width="230" height="170"', '<svg style="width:44px;height:34px"')
  return <span dangerouslySetInnerHTML={{ __html: svg }} />
}

const RHEO_MAX = 20          // 20Ω 2A 滑动变阻器
const MAX_REC = 4
/* 设计坐标系（绘制时整体等比缩放并居中） */
const D = {
  L: 44, R: 430, T: 236, B: 540,       // 回路矩形
  cx: 664, cy: 366, Rmax: 150,          // 放大视图（导线截面）中心与最大半径
  ctrlY: 618,                            // 控件行
  noteY: 664,
  VW: 900, VH: 780,
}

export default function OstersExperimentScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const builderRef = useRef(null)

  const S = useRef({
    tab: 1,
    switchClosed: false,
    time: 0,
    ratio: 1,                 // 滑片：1 = 阻值最大
    reverse: false,           // 电池是否反接（电流方向）
    records: [],              // [{ i, sign, ang }]
    wireColor: '#F44336',
    dragging: false,
    cardScroll: 0,
    cardDrag: null,
    // 4 支指南针：无电流时都指向"地磁北"（屏幕上方）
    needles: [0, 1, 2, 3].map(() => ({ ang: -Math.PI / 2, vel: 0 })),
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
    const loop = () => {
      const s = S.current
      s.time += 1 / 60
      /* 小磁针：通电后 N 极转到该处磁感线的切向（安培定则）；断电回指向地磁北 */
      const sol = solveQuiet()
      const dirs = [-Math.PI / 2, 0, Math.PI / 2, Math.PI]   // 上、右、下、左 四支针的方位角
      for (let k = 0; k < s.needles.length; k++) {
        const nd = s.needles[k]
        const a = dirs[k]
        const tgt = sol.sign === 0 ? -Math.PI / 2 : (sol.sign > 0 ? a - Math.PI / 2 : a + Math.PI / 2)
        let d = tgt - nd.ang
        while (d > Math.PI) d -= Math.PI * 2
        while (d < -Math.PI) d += Math.PI * 2
        nd.vel += d * 0.06
        nd.vel *= 0.88
        nd.ang += nd.vel
      }
      render(R)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  /** 物理：滑变 + 电流表内阻 + 电源内阻 + 直导线，串联 */
  function solve() {
    const s = S.current
    const Rr = Math.round(s.ratio * RHEO_MAX * 10) / 10
    const Rtot = CFG.OSTER_WIRE_R + Rr + CFG.AMM_R + CFG.VS.r
    const I = s.switchClosed ? CFG.VS.V / Rtot : 0
    const sign = I < 1e-6 ? 0 : (s.reverse ? -1 : 1)
    return { Rr, Rtot, I, sign }
  }

  /* rAF 里也要用，包一层避免声明顺序问题 */
  function solveQuiet() { return solve() }

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
    const on = s.switchClosed

    /* 右侧知识卡面板 */
    const RAIL = 46
    const pw = Math.max(300, Math.min(W * 0.40, 700))
    const panel = { x: W - 16 - RAIL - pw, y: 10, w: pw, h: H - 20 }
    const viewW = panel.x - 16

    /* 设计坐标 → 屏幕坐标（等比缩放 + 居中，水平方向被知识卡压缩时自动缩小） */
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

    /* ─── 回路：上边 滑变 + 电流表；下边 电池 + 开关；右边竖边 = 那段直导线 ─── */
    const { L, R, T, B } = D
    const rheoX = L + (R - L) * 0.28
    const amX = L + (R - L) * 0.70
    const battX = L + (R - L) * 0.16
    const swX = L + (R - L) * 0.74

    const hRheo = symHalf('rheostat', 1)
    const hMeter = symHalf('meter', 1)
    const hBat = symHalf('battery', 1, 2)
    const hSw = symHalf('switch', 1)

    drawLine(ctx, L, T, rheoX - hRheo, T, wc, lw)
    drawLine(ctx, rheoX + hRheo, T, amX - hMeter, T, wc, lw)
    drawLine(ctx, amX + hMeter, T, R, T, wc, lw)
    drawLine(ctx, L, T, L, B, wc, lw)
    drawLine(ctx, L, B, battX - hBat, B, wc, lw)
    drawLine(ctx, battX + hBat, B, swX - hSw, B, wc, lw)
    drawLine(ctx, swX + hSw, B, R, B, wc, lw)
    /* 右边竖边：这段就是"垂直于纸面方向"的载流直导线（截面图里看它的磁场） */
    drawLine(ctx, R, T, R, B, wc, 5.2)

    const geo = symRheostat(ctx, rheoX, T, { scale: 1, ratio: s.ratio, ink })
    symMeter(ctx, amX, T, { kind: 'A', scale: 1, ink })
    symBattery(ctx, battX, B, { n: 2, scale: 1, ink, flip: !s.reverse })
    symSwitch(ctx, swX, B, { closed: on, scale: 1, ink })

    /* 电流读数 + 换向标记 */
    ctx.fillStyle = sol.I > CFG.AMM_FS ? '#DC2626' : '#475569'
    ctx.font = `bold ${FS(11)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(`I = ${sol.I.toFixed(2)} A`, amX, T - 46)
    if (sol.I > CFG.AMM_FS) {
      ctx.font = `${FS(9.5)}px "Microsoft YaHei", sans-serif`
      ctx.fillText('⚠ 超过电流表量程 0.6 A', amX, T - 78)
    }
    ctx.fillStyle = on ? '#1565C0' : '#94a3b8'
    ctx.font = `${FS(10)}px "Microsoft YaHei", sans-serif`
    ctx.fillText(on ? '● 通路' : '○ 断路', amX, T - 62)
    ctx.fillStyle = '#5D4037'
    ctx.font = `bold ${FS(11)}px "Microsoft YaHei", sans-serif`
    ctx.fillText('滑动变阻器 R₁', rheoX, T - 40)
    ctx.fillText('电流表 A', amX, T + 30)
    ctx.fillText('电池组 3V', battX, B + 20)
    ctx.fillText('开关', swX, B + 20)

    /* 导线"截面"标记：这段导线垂直于纸面 */
    const midY = (T + B) / 2
    drawWireDot(ctx, R, midY, 13, sol.sign, { big: true })
    ctx.textAlign = 'left'
    ctx.fillStyle = '#8D6E63'
    ctx.font = `bold ${FS(10.5)}px "Microsoft YaHei", sans-serif`
    ctx.fillText('载流直导线', R + 22, midY - 22)
    ctx.fillStyle = '#64748B'
    ctx.font = `${FS(9)}px "Microsoft YaHei", sans-serif`
    ctx.fillText('（垂直于纸面）', R + 22, midY - 8)
    /* 虚线引到放大视图 */
    ctx.strokeStyle = '#C7A97C'; ctx.lineWidth = 1.2; ctx.setLineDash([6, 5])
    ctx.beginPath(); ctx.moveTo(R + 14, midY + 14); ctx.lineTo(D.cx - D.Rmax - 6, D.cy); ctx.stroke()
    ctx.setLineDash([])

    /* 电子流动（沿回路） */
    if (on) {
      const path = s.reverse
        ? [{ x: battX - hBat, y: B }, { x: L, y: B }, { x: L, y: T }, { x: rheoX - hRheo, y: T },
          { x: rheoX + geo.W / 2, y: T }, { x: geo.ax, y: geo.topY }, { x: geo.ax, y: T },
          { x: amX - hMeter, y: T }, { x: R, y: T }]
        : [{ x: R, y: T }, { x: amX + hMeter, y: T }, { x: rheoX + geo.W / 2, y: T },
          { x: geo.ax, y: geo.topY }, { x: geo.ax, y: T }, { x: rheoX - hRheo, y: T },
          { x: L, y: T }, { x: L, y: B }, { x: battX - hBat, y: B }]
      drawFlow(ctx, path, s.time, '#FBBF24')
    }

    /* ─── 放大视图：导线截面 + 同心圆磁感线 + 4 支指南针 ─── */
    const { cx, cy, Rmax } = D
    ctx.fillStyle = '#FFFDF8'
    ctx.strokeStyle = '#E8DCC8'; ctx.lineWidth = 1.4
    ctx.beginPath(); ctx.arc(cx, cy, Rmax + 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke()

    const bmag = sol.I
    const rings = on ? Math.max(2, Math.min(4, 2 + Math.round(bmag / 0.6))) : 0
    if (rings > 0) {
      for (let k = 0; k < rings; k++) {
        const r = 44 + k * 26
        ctx.strokeStyle = `rgba(124,58,237,${0.5 - k * 0.07})`
        ctx.lineWidth = 1.2 + 0.5 * Math.min(1, bmag / 1.2)
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
        for (let a = 0; a < 4; a++) {
          const ang = a * Math.PI / 2 + Math.PI / 4
          const px = cx + Math.cos(ang) * r, py = cy + Math.sin(ang) * r
          const tan = sol.sign > 0 ? ang - Math.PI / 2 : ang + Math.PI / 2
          arrowAt(ctx, px, py, tan, 5.4, 'rgba(109,40,217,0.85)')
        }
      }
    }

    /* 4 支指南针（上、右、下、左） */
    const dirs = [-Math.PI / 2, 0, Math.PI / 2, Math.PI]
    const pend = 104
    for (let k = 0; k < 4; k++) {
      const px = cx + Math.cos(dirs[k]) * pend
      const py = cy + Math.sin(dirs[k]) * pend
      drawCompass(ctx, px, py, 24, s.needles[k].ang, { live: on && bmag > 1e-3 })
    }

    /* 中心：导线截面 */
    drawWireDot(ctx, cx, cy, 17, sol.sign, { big: true })
    ctx.fillStyle = '#5D4037'
    ctx.font = `bold ${FS(11)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('通电直导线（截面）', cx, cy + Rmax + 18)
    ctx.fillStyle = on ? '#6D28D9' : '#94a3b8'
    ctx.font = `${FS(10)}px "Microsoft YaHei", sans-serif`
    ctx.fillText(on ? `B 的方向：磁感线 ${sol.sign > 0 ? '逆时针' : '顺时针'}，${sol.sign > 0 ? '⊙ 电流向外' : '⊗ 电流向里'}` : '断开：磁感线消失，磁针指南北', cx, cy + Rmax + 36)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillStyle = '#8A7355'
    ctx.font = `${FS(9.5)}px "Microsoft YaHei", sans-serif`
    ctx.fillText('越往外圆越大 → 磁感线越稀', cx - Rmax + 6, cy + Rmax + 56)

    /* ─── 控件行：滑片（拖） + 换向 + 记录 ─── */
    const cy0 = D.ctrlY
    /* 滑条 */
    const barX = 60, barW = 190
    ctx.fillStyle = '#E7DFD2'; ctx.strokeStyle = '#C9BCA6'; ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.roundRect(barX, cy0 - 30, barW + 96, 60, 10); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#475569'
    ctx.font = `bold ${FS(10.5)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText('滑片：', barX + 10, cy0 - 14)
    ctx.fillStyle = '#8A7355'
    ctx.font = `${FS(9.5)}px "Microsoft YaHei", sans-serif`
    ctx.fillText(`R₁ = ${sol.Rr.toFixed(1)} Ω`, barX + 56, cy0 - 14)
    ctx.strokeStyle = '#B9AC96'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(barX + 12, cy0 + 8); ctx.lineTo(barX + 12 + barW, cy0 + 8); ctx.stroke()
    const kx = barX + 12 + s.ratio * barW
    ctx.fillStyle = '#F59E0B'
    ctx.beginPath(); ctx.arc(kx, cy0 + 8, 8, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#B45309'; ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.arc(kx, cy0 + 8, 8, 0, Math.PI * 2); ctx.stroke()
    const slideTo = (mx) => {
      S.current.ratio = Math.max(0, Math.min(1, (mx - (barX + 12)) / barW))
      forceUpdate(n => n + 1)
    }
    canvasRef.current._clickAreas.push({
      x: TX(barX + 2), y: TY(cy0 - 4), w: barW * sc + 20, h: 26 * sc,
      onClick: (mx) => slideTo((mx - ox) / sc), onDrag: (mx) => slideTo((mx - ox) / sc),
    })

    /* 换向按钮 */
    const revX = 62 + barW + 96 + 16
    ctx.fillStyle = s.reverse ? '#E8F0FE' : '#FFF3E0'
    ctx.strokeStyle = s.reverse ? '#1D4ED8' : '#E0761F'
    ctx.lineWidth = 1.4
    ctx.beginPath(); ctx.roundRect(revX, cy0 - 18, 108, 36, 18); ctx.fill(); ctx.stroke()
    ctx.fillStyle = s.reverse ? '#1D4ED8' : '#B45309'
    ctx.font = `bold ${FS(10.5)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('↻ 电流换向', revX + 54, cy0)
    canvasRef.current._clickAreas.push({
      x: TX(revX), y: TY(cy0 - 18), w: 108 * sc, h: 36 * sc,
      onClick: () => { S.current.reverse = !S.current.reverse; forceUpdate(n => n + 1) },
    })

    /* 记录按钮 */
    const recX = revX + 108 + 16
    const recOn = on && s.records.length < MAX_REC
    ctx.fillStyle = recOn ? '#FFF3E0' : '#F5F0E8'
    ctx.strokeStyle = recOn ? '#E0761F' : '#D8CBB8'
    ctx.lineWidth = 1.4
    ctx.beginPath(); ctx.roundRect(recX, cy0 - 18, 178, 36, 18); ctx.fill(); ctx.stroke()
    ctx.fillStyle = recOn ? '#B45309' : '#A08E76'
    ctx.font = `bold ${FS(10.5)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(`📋 记录一组数据（${s.records.length}/${MAX_REC}）`, recX + 89, cy0)
    canvasRef.current._clickAreas.push({
      x: TX(recX), y: TY(cy0 - 18), w: 178 * sc, h: 36 * sc,
      onClick: () => {
        if (!on || S.current.records.length >= MAX_REC) return
        const ang = s.needles[0].ang + Math.PI / 2      // 相对"指北"的偏转角
        S.current.records.push({ i: sol.I, sign: sol.sign, ang })
        forceUpdate(n => n + 1)
      },
    })
    ctx.textBaseline = 'alphabetic'
    ctx.restore()

    /* 开关 / 滑片符号的命中区（换算到屏幕坐标） */
    canvasRef.current._clickAreas.push({
      x: TX(swX - hSw - 12), y: TY(B - 22), w: (hSw + 12) * 2 * sc, h: 44 * sc,
      onClick: () => { S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1) },
    })
    const travel = Math.max(6, geo.W / 2 - 7)
    canvasRef.current._clickAreas.push({
      x: TX(rheoX - travel), y: TY(T - 26), w: travel * 2 * sc, h: 44 * sc,
      onClick: (mx) => {
        S.current.ratio = Math.max(0, Math.min(1, ((mx - ox) / sc - (rheoX - travel)) / (travel * 2)))
        forceUpdate(n => n + 1)
      },
      onDrag: (mx) => {
        S.current.ratio = Math.max(0, Math.min(1, ((mx - ox) / sc - (rheoX - travel)) / (travel * 2)))
        forceUpdate(n => n + 1)
      },
    })

    /* ─── 知识卡片 ─── */
    const SEC_COLORS = ['#E0761F', '#C98A12', '#CA8A04', '#C2410C', '#B45309', '#7C3AED', '#15803D', '#DC2626']
    const SECTIONS = buildSections(s.records).map((sec, i) => ({
      t: sec.title, c: SEC_COLORS[i % SEC_COLORS.length], items: sec.lines,
    }))
    const cardOut = drawKnowledgeCard(ctx, panel, SECTIONS, {
      title: '📖 电生磁知识',
      scroll: s.cardScroll,
      tip: (c, tx, ty) => {
        c.fillStyle = on ? '#6D28D9' : '#B08954'
        c.fillText(
          on
            ? `● 通路｜I = ${sol.I.toFixed(2)} A｜电流${s.reverse ? '向里 ⊗' : '向外 ⊙'}｜磁感线${sol.sign > 0 ? '逆时针' : '顺时针'}`
            : '○ 断开：导线沿南北方向放好、磁针指北，再闭合开关看它偏到东西方向',
          tx, ty + 10
        )
      },
    })
    canvasRef.current._cardBox = cardOut
      ? { x: panel.x, y: panel.y + 2, w: panel.w, h: cardOut.cardH, maxScroll: cardOut.maxScroll, scroll: cardOut.scroll }
      : null
    ctx.textBaseline = 'alphabetic'

    /* 调试/验收钩子（坐标已换算成 canvas 屏幕坐标） */
    canvasRef.current._dbg = {
      swX: TX(swX), swY: TY(B),
      rheoX: TX(rheoX), rheoY: TY(T), hRheo,
      revX: TX(revX + 54), revY: TY(cy0),
      recX: TX(recX + 89), recY: TY(cy0),
      scale: sc, closed: on, ratio: s.ratio, reverse: s.reverse,
      I: sol.I, sign: sol.sign, recN: s.records.length,
      panel: { x: panel.x, y: panel.y, w: panel.w, h: panel.h },
    }
  }

  /* ── 知识卡片（7 节，第 7 节是本次记录）── */
  function buildSections(records) {
    const rows = records.map((r, i) => [
      [`第 ${i + 1} 次：`],
      [`I = ${r.i.toFixed(2)} A`, '#C2410C', 1],
      ['，电流'],
      [`${r.sign > 0 ? '向外 ⊙' : '向里 ⊗'}`, '#7C3AED', 1],
      ['，磁针 N 极偏转 '],
      [`${Math.round(Math.abs(r.ang) * 180 / Math.PI)}°`, '#B45309', 1],
      [`（${r.sign > 0 ? '逆时针' : '顺时针'}绕导线）`],
    ])
    if (records.length >= 2) {
      const a = records[0], b = records[records.length - 1]
      if (a.sign !== b.sign) {
        rows.push([
          ['对照：电流方向相反 → 磁针偏转方向也相反（'],
          ['安培定则', '#7C3AED', 1],
          ['），这就是"电生磁"的方向规律。'],
        ])
      } else if (Math.abs(b.i - a.i) > 0.05) {
        rows.push([
          ['对照：电流 '], [`${a.i.toFixed(2)} → ${b.i.toFixed(2)} A`, '#C2410C', 1],
          ['（' + (b.i / Math.max(a.i, 0.01)).toFixed(1) + ' 倍），磁感线更密 → B 更强。'],
        ])
      }
    }
    return [
      {
        title: '① 实验目的',
        lines: [
          [['1820 年奥斯特发现：'], ['通电导线周围存在磁场', '#7C3AED', 1], ['—— 这是人类第一次看到"电"与"磁"的联系。']],
          [['本实验要看到两件事：① 通电后'], ['小磁针偏转', '#C2410C', 1], ['（磁场确实存在）；② 改变电流方向，'], ['磁针反向偏转', '#C2410C', 1], ['（磁场方向由电流方向决定）。']],
          [['注意：这里只研究'], ['一段直导线', '#7C3AED', 1], ['周围的磁场，'], ['不涉及线圈匝数、也不涉及铁芯', '#DC2626', 1], ['。']],
        ],
      },
      {
        title: '② 实验器材',
        lines: [
          [[''], ['电池组（3 V）', '#EA8C1B', 1], ['、开关、'], ['电流表', '#EA8C1B', 1], ['、'], ['滑动变阻器（20 Ω 2 A）', '#EA8C1B', 1], ['、导线若干。']],
          [[''], ['小磁针（指南针）', '#C2410C', 1], [' 一支 —— 用来"显示"磁场方向（转换法：看不见的磁场，用磁针的指向显示出来）。']],
          [['本专题另备'], ['「奥斯特实验板」', '#7C3AED', 1], ['（Tab2 器材栏）：板上那段直导线垂直穿过板面，周围四支小磁针同时偏转。']],
        ],
      },
      {
        title: '③ 实验步骤',
        lines: [
          [['① 连接电路：电源、开关、电流表、滑动变阻器、直导线串成一个回路，'], ['闭合前滑片放在阻值最大处', '#DC2626', 1], ['。']],
          [['② 把导线'], ['沿南北方向', '#15803D', 1], ['水平放置，小磁针放在导线'], ['正下方', '#15803D', 1], ['，等磁针静止、指向南北。']],
          [['③ '], ['闭合开关', '#DC2626', 1], ['，观察磁针：它从指南北偏到'], ['指东西', '#C2410C', 1], ['—— 说明导线周围有了磁场。']],
          [['④ 断开开关，磁针回指南北；'], ['改变电流方向（对调电源两极）', '#DC2626', 1], ['，再闭合，磁针向'], ['相反方向', '#C2410C', 1], ['偏转。']],
          [['⑤ 移动滑片改变电流大小，磁针偏转角变化；记几组数据做对照。']],
        ],
      },
      {
        title: '④ 电路与接法',
        lines: [
          [['电流表'], ['串联', '#15803D', 1], ['在回路里（＋柱进、−柱出），量程 0～0.6 A 足够。']],
          [['滑动变阻器'], ['「一上一下」', '#15803D', 1], ['接入：既改变电流，又起保护作用；闭合前滑片放阻值最大处。']],
          [['导线为什么必须'], ['南北放置', '#DC2626', 1], ['：地磁场本来就让磁针指南北，若导线东西放，通电后磁针的偏转会被地磁"盖住"，看不出效果。']],
          [['通电时间要短'], ['：导线发热会改变电阻，也会烫手；本实验电流 0.1～0.3 A 即可。']],
        ],
      },
      {
        title: '⑤ 为什么"电生磁"',
        lines: [
          [['电流是'], ['电荷的定向移动', '#7C3AED', 1], ['，运动的电荷周围会产生磁场 —— 这就是"电生磁"的本质。']],
          [['磁感线是'], ['闭合的圆', '#7C3AED', 1], ['：以导线为圆心、一圈圈套在导线上，'], ['没有 N 极也没有 S 极', '#DC2626', 1], ['（这一点与条形磁铁、电磁铁完全不同）。']],
          [['离导线越远，圆越大 → 磁感线越稀 → '], ['B 越小', '#C2410C', 1], ['；电流越大 → 磁感线越密 → '], ['B 越强', '#C2410C', 1], ['。']],
          [['所以直导线的磁场只有"'], ['强弱', '#15803D', 1], ['"和"'], ['方向', '#15803D', 1], ['"两件事可讲，不像电磁铁那样有 N/S 极和匝数。']],
        ],
      },
      {
        title: '⑥ 安培定则（右手螺旋定则）',
        lines: [
          [['用右手握住导线，'], ['拇指指向电流方向', '#C2410C', 1], ['，'], ['四指弯曲的方向就是磁感线的环绕方向', '#7C3AED', 1], ['（也就是小磁针 N 极所指的方向）。']],
          [['本实验的等效画法：导线垂直纸面时，电流向外记作 '], ['⊙', '#DC2626', 1], ['，向里记作 '], ['⊗', '#1565C0', 1], ['；'], ['⊙ → 磁感线逆时针，⊗ → 顺时针', '#7C3AED', 1], ['。']],
          [['口诀：'], ['"拇指引电流，四指绕磁场"', '#15803D', 1], ['。']],
          [['与电磁铁的区别：电磁铁用同一定则判'], ['螺线管的 N/S 极', '#7C3AED', 1], ['（握线圈、四指随电流、拇指指 N 极）；直导线没有磁极，只判'], ['磁感线的环绕方向', '#7C3AED', 1], ['。']],
        ],
      },
      {
        title: '⑦ 本次记录',
        lines: rows.length ? rows : [[['点「记录一组数据」，记下电流大小、电流方向和磁针偏转角（最多 ' + MAX_REC + ' 组）。']]],
      },
      {
        title: '⚠ 注意事项',
        lines: [
          [['连、拆电路时开关必须'], ['断开', '#DC2626', 1], ['；闭合前滑片放阻值最大处。']],
          [['通电时间不宜太长，'], ['电流不要超过 0.6 A', '#DC2626', 1], ['（会烧坏电流表、烫坏导线）。']],
          [['电表正负柱不能接反'], ['（安培表），接反指针会反偏、可能打弯。']],
          [['比较时只改变一个因素'], ['：研究电流方向就保持电流大小不变，研究强弱就保持方向不变。']],
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
    S.current.switchClosed = false
    S.current.ratio = 1
    S.current.reverse = false
    S.current.records = []
    S.current.cardScroll = 0
    S.current.needles = [0, 1, 2, 3].map(() => ({ ang: -Math.PI / 2, vel: 0 }))
    builderRef.current?.reset()
    forceUpdate(n => n + 1)
  }, [])

  const handleAddFromPalette = useCallback((type) => { builderRef.current?.add(type) }, [])
  const handleDropFromPalette = useCallback((type, clientX, clientY) => { builderRef.current?.addAt(type, clientX, clientY) }, [])
  const handlePickColor = useCallback((color) => { S.current.wireColor = color; forceUpdate(v => v + 1) }, [])

  return (
    <SceneShell
      title="电生磁（奥斯特实验）"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t) }}
      tab1Label="📖 电路演示"
      tab2Label="🔧 自己动手"
      onReset={handleReset}
      desc={tab === 1 ? (
        <>
          <b>电生磁（奥斯特实验）</b>
          <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
            通电直导线周围产生环形磁场 · 磁针偏转显示 B 的方向 · 改电流大小 / 换向看磁感线疏密与绕向
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
            purpose="探究通电导线周围是否存在磁场、磁场方向跟电流方向的关系（奥斯特实验 / 电生磁）。"
            steps={[
              '滑片先放阻值最大处，点开关闭合',
              '看右边放大图：导线截面周围出现同心圆磁感线，4 支磁针 N 极转到切向',
              '看电流 ⊙ 向外还是 ⊗ 向里，对照磁感线是逆时针还是顺时针',
              '移动滑片改变电流大小，看磁感线变密/变稀',
              '点「电流换向」，看磁针与箭头整体反向',
              '点「记录一组数据」，凑几组不同条件做对照',
            ]}
            hint="安培定则：右手握导线，拇指指电流方向，四指弯曲方向就是磁感线环绕方向（＝磁针 N 极指向）。"
          />
        ) : (
          <InfoDock
            align="left"
            offset={{ left: 26, top: 26 }}
            hint="点右侧器材加入 → 拖拽移动 → 点接线柱连线。轻点开关通断，双击电表看读数。把「奥斯特板」串进回路，板上 4 支小磁针会随电流方向偏转、随电流大小改变偏角；一键透视可看板内直导线与电流方向。注意：直导线本身只有 0.02 Ω，必须串上滑动变阻器限流，否则电池会被短路。"
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
              // 本专题专用：通电直导线 + 4 支小磁针（奥斯特实验板）
              { type: 'ostersBoard', name: '奥斯特板', icon: thumb('ostersBoard') },
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

/* ─────────────── 画法工具 ─────────────── */

function drawLine(ctx, x1, y1, x2, y2, color, w) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
}

/** 电流截面标记：⊙ 向外 / ⊗ 向里（未通电时是一段灰铜） */
function drawWireDot(ctx, x, y, r, sign, opt = {}) {
  ctx.save()
  /* 铜色导线截面 */
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, 1, x, y, r)
  g.addColorStop(0, '#E8B06A'); g.addColorStop(1, '#B87333')
  ctx.fillStyle = g
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#8C5A2B'; ctx.lineWidth = opt.big ? 2 : 1.4
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
  /* ⊙ / ⊗ */
  if (sign !== 0) {
    /* 铜截面里再嵌一块深色底，白 ⊙ / ⊗ 才像教材上的符号，不显"眼睛" */
    ctx.fillStyle = '#1E293B'
    ctx.beginPath(); ctx.arc(x, y, r * 0.80, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#0F172A'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(x, y, r * 0.80, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = '#F8FAFC'
    ctx.lineWidth = Math.max(1.4, r * 0.16)
    if (sign > 0) {
      ctx.beginPath(); ctx.arc(x, y, r * 0.46, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = '#F8FAFC'
      ctx.beginPath(); ctx.arc(x, y, r * 0.15, 0, Math.PI * 2); ctx.fill()
    } else {
      const d = r * 0.46
      ctx.beginPath(); ctx.moveTo(x - d * 0.7, y - d * 0.7); ctx.lineTo(x + d * 0.7, y + d * 0.7); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(x + d * 0.7, y - d * 0.7); ctx.lineTo(x - d * 0.7, y + d * 0.7); ctx.stroke()
    }
  } else {
    /* 未通电：只留铜色截面 + 一圈细环，不写任何符号 */
    ctx.strokeStyle = '#8C5A2B'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, Math.PI * 2); ctx.stroke()
  }
  ctx.restore()
}

/** 一支指南针：白盘 + 刻度 + 红(N)/蓝(S) 针 + 中心轴 */
function drawCompass(ctx, x, y, r, ang, opt = {}) {
  ctx.save()
  /* 盘面 */
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, 2, x, y, r)
  g.addColorStop(0, '#FFFDF8'); g.addColorStop(1, '#F1E7D3')
  ctx.fillStyle = g
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = opt.live ? '#C08A3E' : '#C9B18A'; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
  ctx.strokeStyle = '#D8C6A8'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.arc(x, y, r * 0.78, 0, Math.PI * 2); ctx.stroke()
  /* 刻度（8 道） */
  ctx.strokeStyle = '#C9B18A'; ctx.lineWidth = 0.9
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4
    ctx.beginPath()
    ctx.moveTo(x + Math.cos(a) * r * 0.80, y + Math.sin(a) * r * 0.80)
    ctx.lineTo(x + Math.cos(a) * r * 0.94, y + Math.sin(a) * r * 0.94)
    ctx.stroke()
  }
  /* N（红）/ S（蓝） */
  const L = r * 0.74
  const wdt = r * 0.19
  const nx = x + Math.cos(ang) * L, ny = y + Math.sin(ang) * L
  const sx = x - Math.cos(ang) * L, sy = y - Math.sin(ang) * L
  const perp = ang + Math.PI / 2
  const pxc = Math.cos(perp) * wdt, pyc = Math.sin(perp) * wdt
  ctx.fillStyle = '#E5484D'
  ctx.beginPath(); ctx.moveTo(nx, ny)
  ctx.lineTo(x + pxc, y + pyc)
  ctx.lineTo(x - pxc, y - pyc)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#2563EB'
  ctx.beginPath(); ctx.moveTo(sx, sy)
  ctx.lineTo(x + pxc, y + pyc)
  ctx.lineTo(x - pxc, y - pyc)
  ctx.closePath(); ctx.fill()
  /* N 标记 */
  ctx.fillStyle = '#B91C1C'
  ctx.font = `bold ${Math.max(8, Math.round(r * 0.4))}px "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('N', x + Math.cos(ang) * (L + r * 0.20), y + Math.sin(ang) * (L + r * 0.20))
  /* 中心轴 */
  ctx.fillStyle = '#B8860B'
  ctx.beginPath(); ctx.arc(x, y, r * 0.13, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#7A5A0B'; ctx.lineWidth = 0.8
  ctx.beginPath(); ctx.arc(x, y, r * 0.13, 0, Math.PI * 2); ctx.stroke()
  ctx.restore()
}

/** 小三角箭头（用于磁感线切向） */
function arrowAt(ctx, x, y, ang, size, color) {
  ctx.save()
  ctx.translate(x, y); ctx.rotate(ang)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(size, 0)
  ctx.lineTo(-size * 0.55, -size * 0.55)
  ctx.lineTo(-size * 0.55, size * 0.55)
  ctx.closePath(); ctx.fill()
  ctx.restore()
}

/** 电子流动：沿折线匀速跑黄点 */
function drawFlow(ctx, points, time, color) {
  let total = 0
  const segs = []
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x, dy = points[i + 1].y - points[i].y
    const len = Math.hypot(dx, dy)
    segs.push({ p: points[i], q: points[i + 1], len, acc: total })
    total += len
  }
  const gap = 30
  const phase = ((time * 46) % gap)
  ctx.fillStyle = color
  for (let d = phase; d < total; d += gap) {
    let seg = segs[0]
    for (const sg of segs) { if (d >= sg.acc) seg = sg }
    const t = seg.len ? (d - seg.acc) / seg.len : 0
    const x = seg.p.x + (seg.q.x - seg.p.x) * t
    const y = seg.p.y + (seg.q.y - seg.p.y) * t
    ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill()
  }
}
