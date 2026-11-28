import { useState, useRef, useEffect, useCallback } from 'react'
import { eventToCanvas } from '../utils/pointerPos'
import SceneShell from '../ui/SceneShell'
import InfoDock from '../ui/InfoDock'
import { drawKnowledgeCard } from '../ui/knowledgeCard'
import {
  rr, T, chip, softCard, clamp, line, drawBoard, drawLead, drawButton,
  drawMeterArt, drawBatteryArt, drawSwitchArt, drawRheostatArt, rangeTicks,
} from './labArtKit'
import { drawSchematic, drawMethodChart, drawDataTable, drawUIChart, fitLine } from './emfArt'

/**
 * EmfInternalResistanceScene — ⚡ 测量电源的电动势和内阻
 *
 * 版式照「多用电表 / 测小灯泡伏安特性」两场景：
 *   Tab1 📖 实验方法 —— 照乐乐课堂的顺序：原理图（电池/开关/R滑/A/V）+ 6 组数据表 +
 *                        方程组法 vs 图像法 + 图象（纵轴可切「从 0 / 只留变化段」，带 ΔU/ΔI 三角）
 *                        + 四条注意事项（小阻值滑变、旧电池、避免大电流、纵轴陷阱）；
 *   Tab2 🔧 自己动手 —— 闸刀合断、拖滑片改外阻、读两只表、记录 5 组以上、自动拟合
 *                         U-I 直线，用截距读 E、用斜率读 r，任务自动判定。
 *
 * 物理口径：
 *   两节旧干电池 ε=2.90 V、r=1.00 Ω；电流表内阻 RA=0.10 Ω；电压表内阻很大（分流忽略）。
 *   闭合时 I = ε/(R+r+RA)，电压表并在电池两端 → 读数 U = ε − I r。
 *   外阻 R 由滑动变阻器滑片控制，5 Ω…20 Ω。
 */

const CELL = { E: 2.9, r: 1.0, RA: 0.1 }
const RH = { min: 5, max: 20 }

const TASK_DEFS = [
  { id: 'maxR', t: '合闸前先把外阻调到最大', d: '点闸刀合上，再把滑片拖到最左端（R 最大 20 Ω），这时 U 最大、I 最小' },
  { id: 'first', t: '记录第 1 组 (I, U)', d: '点「记录这一组」，把当前电流和路端电压打到 U-I 坐标上' },
  { id: 'sweep', t: '改 4 次外阻，共记 5 组以上', d: '滑片每次右移一点，让电流至少拉开 0.15 A，电压会跟着往下走' },
  { id: 'fit', t: '5 组以后自动连成一条直线', d: '不要连折线：数据够了自动最小二乘拟合，橙线就是 U = ε − Ir' },
  { id: 'read', t: '读截距得 ε、读斜率得 r', d: '纵轴截距是 ε≈2.9 V，斜率的绝对值是 r≈1.0 Ω，误差要在允许范围内' },
  { id: 'off', t: '断开闸刀、滑片回最大端收尾', d: '做完断开开关，滑片退回最左，两表回零' },
]

function jitter(seed, amp) {
  const v = ((seed * 9301 + 49297) % 233280) / 233280
  return (v - 0.5) * 2 * amp
}

export default function EmfInternalResistanceScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const [, forceUpdate] = useState(0)
  const [tab, setTab] = useState(1)

  const S = useRef({
    tab: 1,
    ratio: 0,            // 滑片位置 0=最左(R 最大) → 1=最右(R 最小)
    switchClosed: false,
    points: [],
    seed: 3,
    fromZero: false,
    learnPoints: [],
    learnHint: '',
    nv: 0,
    na: 0,
    drag: null,
    cardScroll: 0,
    cardDrag: null,
    tasks: {},
    seen: {},
  })

  const layout = useCallback((W, H) => {
    const compact = W < 1000 || H < 540
    const RAIL = 44
    const panelW = compact ? 0 : Math.max(306, Math.min(W * 0.285, 420))
    const panel = compact ? null : { x: W - 10 - RAIL - panelW, y: 10, w: panelW, h: H - 20 }
    const stage = { x: 8, y: 8, w: compact ? W - 16 : panel.x - 18, h: H - 16 }
    const ss = Math.max(0.58, Math.min(1.32, Math.min(stage.w / 1000, stage.h / 760)))
    const dw = 1000 * ss
    const dh = 760 * ss
    const ox = stage.x + (stage.w - dw) / 2
    const oy = stage.y + (stage.h - dh) / 2
    return {
      compact, panel, stage, s: ss, ox, oy,
      X: (v) => ox + v * ss,
      Y: (v) => oy + v * ss,
      R: (x, y, w, h) => ({ x: ox + x * ss, y: oy + y * ss, w: w * ss, h: h * ss }),
      V: (v) => v * ss,
    }
  }, [])

  /* ================================================================
   *  电路与读数
   * ================================================================ */
  function measure(s) {
    const rr0 = Number.isFinite(s.ratio) ? clamp(s.ratio, 0, 1) : 0
    const R = RH.max - (RH.max - RH.min) * rr0
    const closed = s.switchClosed
    const I = closed ? CELL.E / (R + CELL.r + CELL.RA) : 0
    const U = closed ? CELL.E - I * CELL.r : CELL.E
    return { R, I, U, closed }
  }

  /** Tab1 演示用：按当前滑片位置算外阻（合闸才算电流） */
  function measureDemo(s) {
    return measure(s)
  }

  function fitNow(s) {
    return s.points.length >= 2 ? fitLine(s.points) : null
  }

  /**
   * Tab1：按电路当前的真实状态记一组数据
   * 只有合闸、且这个外阻值之前没记过才记；同一组阻值不重复
   */
  function recordLearn(s, m) {
    if (!m || !m.closed) {
      s.learnHint = '先合闸，才有电流和路端电压可记'
      return
    }
    if (!Number.isFinite(m.R) || !Number.isFinite(m.I)) return
    const n = s.learnPoints.length
    if (n >= 6) {
      s.learnHint = '已记满 6 组：点「清空」重测，或直接看图像法结果'
      return
    }
    if (s.learnPoints.some((p) => Math.abs(p.R - m.R) < 0.45)) {
      s.learnHint = `R外 = ${m.R.toFixed(1)} Ω 这组已经记过了，换个阻值再记`
      return
    }
    const k = n + 1
    s.learnPoints.push({
      R: m.R,
      I: m.I + jitter(k + 11, 0.0016),
      U: m.U + jitter(k + 57, 0.005),
    })
    s.learnHint = `已记第 ${k} 组：I=${m.I.toFixed(3)} A，U=${m.U.toFixed(2)} V`
  }

  function spreadOf(points) {
    if (!points.length) return 0
    let lo = Infinity
    let hi = -Infinity
    for (const p of points) {
      lo = Math.min(lo, p.I)
      hi = Math.max(hi, p.I)
    }
    return hi - lo
  }

  function recordPoint(s) {
    if (!s.switchClosed) return '先合上闸刀，让电路里有电流'
    if (s.points.length >= 8) return '已经记满 8 组，先点「清空数据」'
    const m = measure(s)
    const I = Math.max(0.001, m.I + jitter(s.seed, 0.002))
    const U = m.U + jitter(s.seed + 17, 0.009)
    s.points.push({ I, U, R: m.R })
    s.seed += 1
    return null
  }

  function clearPoints(s) {
    s.points = []
    s.seed = 3
    s.tasks = { ...s.tasks, first: false, sweep: false, fit: false, read: false }
  }

  /* ================================================================
   *  绘制入口
   * ================================================================ */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const R = { canvas, ctx: canvas.getContext('2d'), W: 0, H: 0 }
    const resize = () => {
      canvas.width = canvas.clientWidth * devicePixelRatio
      canvas.height = canvas.clientHeight * devicePixelRatio
      R.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      R.W = canvas.clientWidth
      R.H = canvas.clientHeight
    }
    resize()
    canvas._R = R
    window.addEventListener('resize', resize)
    const loop = () => {
      render(R)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => {
      window.removeEventListener('resize', resize)
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function render(R) {
    const ctx = R.ctx
    const { W, H } = R
    if (!W || !H) return
    ctx.clearRect(0, 0, W, H)
    const bg = ctx.createLinearGradient(0, 0, W * 0.3, H)
    bg.addColorStop(0, '#F7FAF6')
    bg.addColorStop(0.55, '#EEF3ED')
    bg.addColorStop(1, '#E6EDE5')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)
    const glow = ctx.createRadialGradient(W * 0.28, H * 0.3, 20, W * 0.28, H * 0.3, Math.max(W, H) * 0.75)
    glow.addColorStop(0, 'rgba(255,255,255,0.62)')
    glow.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, W, H)

    R._hits = []
    R._cardBox = null
    const lay = layout(W, H)
    if (S.current.tab === 1) renderLearn(ctx, R, lay)
    else renderPractice(ctx, R, lay)
    R.canvas._hits = R._hits
    R.canvas._cardBox = R._cardBox
  }

  /* ================================================================
   *  Tab 1：实验方法（照乐乐课堂：原理图 → 数据表 → 两种算法 → 图像法）
   * ================================================================ */
  function renderLearn(ctx, R, lay) {
    const s = S.current
    const k = lay.s
    const m = measureDemo(s)
    const pts = s.learnPoints
    const fit = pts.length >= 2 ? fitLine(pts) : null

    ctx.save()
    ctx.translate(lay.ox, lay.oy)
    ctx.scale(k, k)

    /* ---------- ① 原理图 ---------- */
    const c1 = { x: 16, y: 16, w: 570, h: 300 }
    softCard(ctx, c1.x, c1.y, c1.w, c1.h, '#FFFFFF', '#DFE7EC')
    T(ctx, '① 伏安法测 E、r 的电路', c1.x + 18, c1.y + 26, { size: 12.5, bold: true, color: '#25313A' })
    T(ctx, 'U = E − I r', c1.x + c1.w - 18, c1.y + 26, { size: 14, bold: true, color: '#B3261E', align: 'right', mono: true })
    const sch = drawSchematic(ctx, { x: c1.x + 16, y: c1.y + 42, w: c1.w - 32, h: 200 }, k, {
      closed: s.switchClosed, ratio: s.ratio,
    })
    T(ctx, '两个未知数 E、r → 至少 2 组数据；为减小偶然误差，一般测 6 组以上', c1.x + 18, c1.y + 280, {
      size: 9.2, color: '#5B7182',
    })
    T(ctx, `I = ${m.I.toFixed(3)} A　U = ${m.U.toFixed(2)} V　R外 = ${m.R.toFixed(1)} Ω`, c1.x + c1.w - 18, c1.y + 280, {
      size: 9, color: '#B3261E', align: 'right', bold: true, mono: true,
    })
    R._hits.push({
      x: lay.X(sch.switchHit.x), y: lay.Y(sch.switchHit.y),
      w: lay.V(sch.switchHit.w), h: lay.V(sch.switchHit.h),
      cursor: 'pointer',
      onClick: () => {
        s.switchClosed = !s.switchClosed
        recordLearn(s, measure(s))
      },
    })
    R._hits.push({
      x: lay.X(sch.sliderHit.x), y: lay.Y(sch.sliderHit.y),
      w: lay.V(sch.sliderHit.w), h: lay.V(sch.sliderHit.h),
      cursor: 'ew-resize',
      onDrag: (x) => { s.ratio = sch.mapX((x - lay.ox) / k) },
      onClick: (x) => {
        s.ratio = sch.mapX((x - lay.ox) / k)
        recordLearn(s, measure(s))
      },
      onEnd: () => { recordLearn(s, measure(s)) },
    })

    /* ---------- ② 数据表 ---------- */
    const c2 = { x: 16, y: 330, w: 282, h: 214 }
    softCard(ctx, c2.x, c2.y, c2.w, c2.h, '#FFFFFF', '#DFE7EC')
    T(ctx, '② 数据表（自动记组）', c2.x + 14, c2.y + 24, { size: 11.5, bold: true, color: '#25313A' })
    T(ctx, `已记 ${pts.length}/6 · 清空`, c2.x + c2.w - 14, c2.y + 24, {
      size: 8.4, color: '#1565C0', align: 'right', bold: true,
    })
    R._hits.push({
      x: lay.X(c2.x + c2.w - 92), y: lay.Y(c2.y + 10), w: lay.V(88), h: lay.V(22),
      cursor: 'pointer',
      onClick: () => { s.learnPoints = []; s.learnHint = '' },
    })
    drawDataTable(ctx, { x: c2.x + 4, y: c2.y + 32, w: c2.w - 8, h: 164 }, k, pts, 6, { card: false })
    T(ctx, pts.length ? s.learnHint || '继续拖滑变，换几个阻值再记' : '合闸后拖「R滑」，每变一次自动记一组', c2.x + 14, c2.y + 206, {
      size: 8.2, color: pts.length ? '#7A8790' : '#B3261E',
    })

    /* ---------- ③ 两种算法 ---------- */
    const c3 = { x: 306, y: 330, w: 280, h: 214 }
    softCard(ctx, c3.x, c3.y, c3.w, c3.h, '#FFF8F0', '#F0DCC0')
    T(ctx, '③ 数据怎么处理', c3.x + 14, c3.y + 24, { size: 11.5, bold: true, color: '#8A5A2B' })
    T(ctx, '方程组法', c3.x + 14, c3.y + 50, { size: 9.6, bold: true, color: '#9A4B12' })
    T(ctx, '两组解一对 (E、r)，多组两两组合再平均', c3.x + 14, c3.y + 66, { size: 9, color: '#7A4A22' })
    T(ctx, '→ 误差大、费时间，只用旧教材法', c3.x + 14, c3.y + 82, { size: 9, color: '#7A4A22' })
    T(ctx, '图像法', c3.x + 14, c3.y + 108, { size: 9.6, bold: true, color: '#1E6B3B' })
    T(ctx, '描点 → 连一条直线（不要连折线）', c3.x + 14, c3.y + 124, { size: 9, color: '#4B5A66' })
    T(ctx, '截距读 E，斜率读 r → 又准又直观', c3.x + 14, c3.y + 140, { size: 9, color: '#4B5A66' })
    T(ctx, '要求：≥5 组，且电流跨度尽量拉大', c3.x + 14, c3.y + 166, { size: 9, color: '#8A5A2B', bold: true })
    chip(ctx, c3.x + 14, c3.y + 178, 132, 22, '推荐：图像法', '#1E6B3B', 1)

    /* ---------- ④ 图像法 ---------- */
    const c4 = { x: 16, y: 552, w: 570, h: 196 }
    softCard(ctx, c4.x, c4.y, c4.w, c4.h, '#FFFFFF', '#DFE7EC')
    T(ctx, '④ 图像法：纵轴截距 = E，斜率 = r', c4.x + 16, c4.y + 22, { size: 11.5, bold: true, color: '#25313A' })
    drawMethodChart(ctx, { x: c4.x + 4, y: c4.y + 28, w: 306, h: 160 }, k, {
      points: pts, E: CELL.E, r: CELL.r, fit,
      op: { I: m.I, U: m.U }, fromZero: s.fromZero, showTriangle: true,
    })

    const tg = { x: c4.x + 322, y: c4.y + 30, w: 236, h: 26 }
    ctx.fillStyle = s.fromZero ? '#EAF3FF' : '#FFF3E0'
    rr(ctx, tg.x, tg.y, tg.w, tg.h, 7)
    ctx.fill()
    ctx.strokeStyle = s.fromZero ? '#9CC3E8' : '#E8BE8B'
    ctx.lineWidth = 1.2
    rr(ctx, tg.x, tg.y, tg.w, tg.h, 7)
    ctx.stroke()
    T(ctx, s.fromZero ? '纵轴：从 0 起（线太平）' : '纵轴：2.2–3.0 V（看得清斜率）', tg.x + tg.w / 2, tg.y + 13, {
      size: 9, color: s.fromZero ? '#15508C' : '#A85B12', align: 'center', bold: true,
    })
    T(ctx, '⇄', tg.x + tg.w - 10, tg.y + 17, { size: 10, color: s.fromZero ? '#7FA8CC' : '#C89B62', align: 'right' })
    R._hits.push({
      x: lay.X(tg.x), y: lay.Y(tg.y), w: lay.V(tg.w), h: lay.V(tg.h),
      cursor: 'pointer',
      onClick: () => { s.fromZero = !s.fromZero },
    })

    const tx = c4.x + 322
    const Eshow = fit ? fit.a : CELL.E
    const rShow = fit ? fit.r : CELL.r
    T(ctx, fit ? `截距 = E测 ${Eshow.toFixed(2)} V（真值 2.90）` : '截距 = E（真值 2.90 V）', tx, c4.y + 82, { size: 9, color: '#1E6B3B', bold: true })
    T(ctx, fit ? `斜率 |ΔU/ΔI| = r测 ${rShow.toFixed(2)} Ω（真值 1.00）` : '斜率 = r（真值 1.00 Ω）', tx, c4.y + 104, { size: 9, color: '#C2410C', bold: true })
    T(ctx, pts.length < 2 ? '先记 2 组以上，才连得出直线' : '从 0 起时横轴交点 = I短（2.9 A 在图外）', tx, c4.y + 128, { size: 8.4, color: '#5B7182' })
    T(ctx, '不从 0 起：交点没意义，r 只能用 ΔU/ΔI', tx, c4.y + 148, { size: 8.4, color: '#5B7182' })
    T(ctx, '（红圈 = 当前滑片位置对应的工作点）', tx, c4.y + 170, { size: 8.2, color: '#9AA6AE' })

    /* ---------- 右侧四张要点卡 ---------- */
    const r1 = { x: 600, y: 16, w: 380, h: 178 }
    softCard(ctx, r1.x, r1.y, r1.w, r1.h, '#EAF3FF', '#C9DDF5')
    T(ctx, '⑤ 器材选两个要点', r1.x + 16, r1.y + 24, { size: 11.5, bold: true, color: '#15508C' })
    T(ctx, '· 滑变选小阻值（20 Ω）：干电池 r 小，', r1.x + 16, r1.y + 52, { size: 9.2, color: '#33526E' })
    T(ctx, '　阻值大了一调电流就跳，点拉不开', r1.x + 16, r1.y + 68, { size: 9.2, color: '#33526E' })
    T(ctx, '· 电池用旧的：新电池 r 太小，线太平，', r1.x + 16, r1.y + 96, { size: 9.2, color: '#33526E' })
    T(ctx, '　截距和斜率都不好读', r1.x + 16, r1.y + 112, { size: 9.2, color: '#33526E' })
    T(ctx, '· 非用新电池：串一个 R0 当额外内阻，', r1.x + 16, r1.y + 140, { size: 9.2, color: '#33526E' })
    T(ctx, '　算完把 r测 减去 R0', r1.x + 16, r1.y + 156, { size: 9.2, color: '#33526E' })

    const r2 = { x: 600, y: 202, w: 380, h: 172 }
    softCard(ctx, r2.x, r2.y, r2.w, r2.h, '#FFF4F2', '#F3CFC8')
    T(ctx, '⚠ 别让电流太大', r2.x + 16, r2.y + 24, { size: 11.5, bold: true, color: '#B3261E' })
    T(ctx, '干电池大电流放电：E 会下降、r 明显变大', r2.x + 16, r2.y + 52, { size: 9.2, color: '#8C3B34' })
    T(ctx, '→ 同一实验里测出的 E、r 一组一个样', r2.x + 16, r2.y + 68, { size: 9.2, color: '#8C3B34' })
    T(ctx, '做法：电流别调太大；读数要快，', r2.x + 16, r2.y + 94, { size: 9.2, color: '#5B403C' })
    T(ctx, '读完立刻断开开关', r2.x + 16, r2.y + 110, { size: 9.2, color: '#5B403C', bold: true })
    T(ctx, '量程：V 0–3 V、A 0–0.6 A；', r2.x + 16, r2.y + 136, { size: 9.2, color: '#5B403C' })
    T(ctx, '本实验 I 约 0.14–0.48 A，不会过载', r2.x + 16, r2.y + 152, { size: 9.2, color: '#5B403C' })

    const r3 = { x: 600, y: 382, w: 380, h: 182 }
    softCard(ctx, r3.x, r3.y, r3.w, r3.h, '#FFFFFF', '#DFE7EC')
    T(ctx, '📐 纵轴不从 0 开始', r3.x + 16, r3.y + 24, { size: 11.5, bold: true, color: '#25313A' })
    T(ctx, '线太平、坐标纸下半张空着 → 可让纵轴从 2.2 V 起', r3.x + 16, r3.y + 52, { size: 9, color: '#4B5A66' })
    T(ctx, '注意：横轴交点不再是短路电流 I短', r3.x + 16, r3.y + 74, { size: 9.2, color: '#B3261E', bold: true })
    T(ctx, '但纵轴截距仍是 E；斜率仍等于 r，', r3.x + 16, r3.y + 98, { size: 9.2, color: '#4B5A66' })
    T(ctx, '必须用 ΔU/ΔI 算，不能拿两个交点相除', r3.x + 16, r3.y + 114, { size: 9.2, color: '#4B5A66', bold: true })
    T(ctx, '（视频里反复强调的坑）', r3.x + 16, r3.y + 140, { size: 8.6, color: '#9AA6AE' })

    const r4 = { x: 600, y: 572, w: 380, h: 176 }
    softCard(ctx, r4.x, r4.y, r4.w, r4.h, '#F3FBF5', '#CDE8D6')
    T(ctx, '🧪 本场景口径', r4.x + 16, r4.y + 24, { size: 11.5, bold: true, color: '#1E6B3B' })
    T(ctx, '两节旧干电池：E = 2.90 V、r = 1.00 Ω', r4.x + 16, r4.y + 52, { size: 9.2, color: '#2F5B41' })
    T(ctx, 'R滑 5–20 Ω（选的就是小阻值）', r4.x + 16, r4.y + 70, { size: 9.2, color: '#2F5B41' })
    T(ctx, '接法：甲法（V 并在电池两端）', r4.x + 16, r4.y + 96, { size: 9.2, color: '#2F5B41' })
    T(ctx, 'RV 很大，分流可忽略 → 测得≈真值', r4.x + 16, r4.y + 112, { size: 9.2, color: '#2F5B41' })
    T(ctx, '切「自己动手」：合闸、改阻值、记 6 组', r4.x + 16, r4.y + 138, { size: 9.2, color: '#1E6B3B', bold: true })

    ctx.restore()

    // 右侧知识卡
    if (lay.panel) {
      const out = drawKnowledgeCard(ctx, lay.panel, buildLearnSections(), {
        title: '📖 知识点',
        scroll: s.cardScroll,
      })
      R._cardBox = out ? { x: lay.panel.x, y: lay.panel.y + 2, w: lay.panel.w, h: out.cardH, maxScroll: out.maxScroll, scroll: out.scroll } : null
    }
  }

  /* ================================================================
   *  Tab 2：自己动手
   * ================================================================ */
  function renderPractice(ctx, R, lay) {
    const s = S.current
    const k = lay.s
    const m = measure(s)
    const fit = fitNow(s)
    s.nv += (clamp(m.U / 3, -0.02, 1.06) - s.nv) * 0.2
    s.na += (clamp(m.I / 0.6, -0.02, 1.06) - s.na) * 0.2

    // 台垫
    drawBoard(ctx, lay.R(10, 10, 980, 742))

    const P = {
      rheo: { cx: 300, cy: 200, w: 230 },
      amp: { x: 450, y: 240, w: 150, h: 190 },
      volt: { x: 60, y: 300, w: 150, h: 200 },
      batt: { cx: 150, cy: 640, w: 150, h: 110 },
      sw: { cx: 430, cy: 640, w: 110 },
    }
    const post = {
      rheoL: { x: P.rheo.cx - P.rheo.w * 0.42, y: P.rheo.cy },
      rheoR: { x: P.rheo.cx + P.rheo.w * 0.42, y: P.rheo.cy },
      ampN: { x: P.amp.x + P.amp.w * 0.26, y: P.amp.y + P.amp.h * 0.845 },
      ampP: { x: P.amp.x + P.amp.w * 0.74, y: P.amp.y + P.amp.h * 0.845 },
      voltN: { x: P.volt.x + P.volt.w * 0.26, y: P.volt.y + P.volt.h * 0.845 },
      voltP: { x: P.volt.x + P.volt.w * 0.74, y: P.volt.y + P.volt.h * 0.845 },
      battN: { x: P.batt.cx - P.batt.w * 0.30, y: P.batt.cy },
      battP: { x: P.batt.cx + P.batt.w * 0.30, y: P.batt.cy },
      swL: { x: P.sw.cx - P.sw.w * 0.30, y: P.sw.cy },
      swR: { x: P.sw.cx + P.sw.w * 0.30, y: P.sw.cy },
    }

    // 导线（先画，接线柱压在上面）
    const lw = Math.max(2.2, 3 * k)
    const lead = (a, b, color) => drawLead(ctx, lay.X(a.x), lay.Y(a.y), lay.X(b.x), lay.Y(b.y), color, lw, false)
    lead(post.battP, post.swL, '#C0392B')
    lead(post.swR, post.rheoR, '#C0392B')
    lead(post.rheoL, post.ampP, '#C0392B')
    lead(post.ampN, post.battN, '#16232B')
    lead(post.battP, post.voltP, '#C0392B')
    lead(post.battN, post.voltN, '#16232B')

    // 滑动变阻器
    drawRheostatArt(ctx, lay.X(P.rheo.cx), lay.Y(P.rheo.cy), lay.V(P.rheo.w), s.ratio, k, {
      label: false,
    })
    const rlTxt = `滑动变阻器 20 Ω　R = ${m.R.toFixed(1)} Ω`
    const rlX = lay.X(P.rheo.cx - P.rheo.w * 0.44)
    const rlY = lay.Y(P.rheo.cy + 30)
    const rlFs = Math.max(8, Math.round(9 * k))
    ctx.font = `${rlFs}px "Microsoft YaHei", sans-serif`
    const rlW = ctx.measureText(rlTxt).width + 14 * k
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    rr(ctx, rlX - rlW, rlY - 9 * k, rlW, 18 * k, 6)
    ctx.fill()
    T(ctx, rlTxt, rlX - 7 * k, rlY, { size: rlFs, color: '#6B7A83', align: 'right' })

    // 两只表
    const amp = lay.R(P.amp.x, P.amp.y, P.amp.w, P.amp.h)
    drawMeterArt(ctx, amp.x, amp.y, amp.w, amp.h, {
      theme: 'wine', letter: 'A', unit: 'A', frac: s.na, rangeText: '0 – 0.6 A', ticks: rangeTicks(0.6), k,
    })
    const volt = lay.R(P.volt.x, P.volt.y, P.volt.w, P.volt.h)
    drawMeterArt(ctx, volt.x, volt.y, volt.w, volt.h, {
      theme: 'blue', letter: 'V', unit: 'V', frac: s.nv, rangeText: '0 – 3 V', ticks: rangeTicks(3), k,
    })

    // 电池组 + 闸刀
    drawBatteryArt(ctx, lay.X(P.batt.cx), lay.Y(P.batt.cy), lay.V(P.batt.w), lay.V(P.batt.h), k, '', '电池组 2.9 V')
    drawSwitchArt(ctx, lay.X(P.sw.cx), lay.Y(P.sw.cy), lay.V(P.sw.w), s.switchClosed, k)
    T(ctx, s.switchClosed ? '闸刀已合·电路接通' : '闸刀断开·I=0，电压表量的是 ε', lay.X(80), lay.Y(690), {
      size: Math.max(8, Math.round(9.4 * k)), color: s.switchClosed ? '#15803D' : '#8A6D3B', bold: true,
    })

    // 读数卡
    drawReadout(ctx, lay.R(20, 20, 320, 116), k, m)

    // 图像卡
    drawUIChart(ctx, lay.R(620, 16, 360, 470), k, {
      points: s.points, E: CELL.E, r: CELL.r, fit, op: { I: m.I, U: m.U },
      title: 'U-I 图像', subtitle: `${s.points.length} 组 · 跨度 ${spreadOf(s.points).toFixed(2)} A`,
    })

    // 拟合结果卡 + 按钮
    const rc = lay.R(620, 500, 360, 240)
    softCard(ctx, rc.x, rc.y, rc.w, rc.h, '#FFFFFF', '#DFE7EC')
    T(ctx, '🔍 拟合结果', rc.x + 14 * k, rc.y + 20 * k, { size: Math.max(8, Math.round(11.4 * k)), bold: true, color: '#25313A' })
    if (fit) {
      T(ctx, 'ε 测 =', rc.x + 14 * k, rc.y + 52 * k, { size: Math.max(8, Math.round(9.4 * k)), color: '#6B7A83' })
      T(ctx, `${fit.a.toFixed(2)} V`, rc.x + 74 * k, rc.y + 52 * k, { size: Math.max(9, Math.round(16 * k)), bold: true, color: '#1E6B3B', mono: true })
      T(ctx, 'r 测 =', rc.x + 14 * k, rc.y + 82 * k, { size: Math.max(8, Math.round(9.4 * k)), color: '#6B7A83' })
      T(ctx, `${fit.r.toFixed(2)} Ω`, rc.x + 74 * k, rc.y + 82 * k, { size: Math.max(9, Math.round(16 * k)), bold: true, color: '#C2410C', mono: true })
      const dE = Math.abs(fit.a - CELL.E)
      const dR = Math.abs(fit.r - CELL.r)
      T(ctx, `真值 ε 2.90 V（差 ${dE.toFixed(2)}）· r 1.00 Ω（差 ${dR.toFixed(2)}）`, rc.x + 14 * k, rc.y + 108 * k, {
        size: Math.max(8, Math.round(9 * k)), color: (dE <= 0.08 && dR <= 0.15) ? '#15803D' : '#B3261E',
      })
    } else {
      T(ctx, `还差 ${Math.max(0, 5 - s.points.length)} 组数据才能连直线`, rc.x + 14 * k, rc.y + 58 * k, {
        size: Math.max(8, Math.round(10 * k)), color: '#8A6D3B', bold: true,
      })
      T(ctx, '记满 5 组且电流拉开以后，自动最小二乘拟合。', rc.x + 14 * k, rc.y + 78 * k, {
        size: Math.max(8, Math.round(9 * k)), color: '#6B7A83',
      })
    }
    T(ctx, '纵轴截距 → ε　斜率 |ΔU/ΔI| → r', rc.x + 14 * k, rc.y + 132 * k, {
      size: Math.max(8, Math.round(9 * k)), color: '#4B5A66',
    })
    if (!fit) {
      T(ctx, '流程：描点 → 连成直线 → 截距 ε、斜率 r', rc.x + 14 * k, rc.y + 108 * k, {
        size: Math.max(8, Math.round(8.8 * k)), color: '#94A3B8',
      })
    }
    if (s.hintText) {
      T(ctx, s.hintText, rc.x + 14 * k, rc.y + 162 * k, { size: Math.max(8, Math.round(8.8 * k)), color: '#15803D', bold: true })
    }

    const bw = (rc.w - 38 * k) / 2
    const by = rc.y + rc.h - 46 * k
    const bh = 30 * k
    drawButton(ctx, rc.x + 14 * k, by, bw, bh, '📌 记录这一组', '#15803D', s.switchClosed && s.points.length < 8, k)
    drawButton(ctx, rc.x + 24 * k + bw, by, bw, bh, '🧹 清空数据', '#94A3B8', s.points.length > 0, k)

    // 热区
    R._hits.push(
      {
        x: lay.X(P.sw.cx - P.sw.w * 0.55), y: lay.Y(P.sw.cy - 52), w: lay.V(P.sw.w * 1.1), h: lay.V(66),
        cursor: 'pointer',
        onClick: () => {
          s.switchClosed = !s.switchClosed
          s.hintText = ''
          forceUpdate((n) => n + 1)
        },
      },
      {
        x: lay.X(rc.x + 14 * k), y: by, w: bw, h: bh,
        cursor: 'pointer',
        onClick: () => {
          const err = recordPoint(s)
          if (err) {
            s.hintText = err
          } else {
            const p = s.points[s.points.length - 1]
            s.hintText = `已记录第 ${s.points.length} 组：I=${p.I.toFixed(2)} A，U=${p.U.toFixed(2)} V`
          }
          forceUpdate((n) => n + 1)
        },
      },
      {
        x: lay.X(rc.x + 24 * k + bw), y: by, w: bw, h: bh,
        cursor: 'pointer',
        onClick: () => {
          clearPoints(s)
          s.hintText = ''
          forceUpdate((n) => n + 1)
        },
      },
    )

    // 滑片：先热区（覆盖在变阻器体上）
    const bodyW = P.rheo.w * 0.84
    const rodY = (P.rheo.cy - 30) - 16
    const sxAt = (r) => P.rheo.cx - bodyW * 0.42 + clamp(r, 0, 1) * bodyW * 0.84
    const pxToRatio = (x) => {
      if (!Number.isFinite(x)) return s.ratio
      return clamp((((x - lay.ox) / k) - (P.rheo.cx - bodyW * 0.42)) / (bodyW * 0.84), 0, 1)
    }
    const sx = sxAt(s.ratio)
    R._hits.unshift({
      x: lay.X(sx - 18), y: lay.Y(rodY - 20), w: lay.V(36), h: lay.V(42),
      cursor: 'ew-resize',
      onDrag: (x) => { s.ratio = pxToRatio(x) },
    })
    R._hits.push({
      x: lay.X(P.rheo.cx - bodyW / 2), y: lay.Y(P.rheo.cy - 54), w: lay.V(bodyW), h: lay.V(58),
      cursor: 'ew-resize',
      onDrag: (x) => { s.ratio = pxToRatio(x) },
      onClick: (x) => { s.ratio = pxToRatio(x) },
    })

    // 任务判定
    const done = evaluateTasks(s, m, fit)
    let newly = 0
    for (const def of TASK_DEFS) {
      if (!s.tasks[def.id] && done[def.id]) {
        s.tasks[def.id] = true
        newly += 1
      }
    }
    if (newly) setTimeout(() => forceUpdate((n) => n + 1), 0)

    if (lay.panel) {
      const out = drawKnowledgeCard(ctx, lay.panel, buildTaskSections(s, m, fit, done), {
        title: '🔧 动手任务',
        scroll: s.cardScroll,
        tip: (c2, tx, ty) => {
          c2.fillStyle = '#B08954'
          c2.font = '11.5px "Microsoft YaHei", sans-serif'
          c2.textAlign = 'left'
          c2.textBaseline = 'middle'
          c2.fillText(`U=${m.U.toFixed(2)} V　I=${m.I.toFixed(3)} A　R外=${m.R.toFixed(1)} Ω`, tx, ty + 10)
        },
      })
      R._cardBox = out ? { x: lay.panel.x, y: lay.panel.y + 2, w: lay.panel.w, h: out.cardH, maxScroll: out.maxScroll, scroll: out.scroll } : null
    }
  }

  function drawReadout(ctx, r, k, m) {
    softCard(ctx, r.x, r.y, r.w, r.h, '#FFFFFF', '#DFE7EC')
    T(ctx, '⚡ 电路读数', r.x + 14 * k, r.y + 18 * k, { size: Math.max(8, Math.round(10.5 * k)), bold: true, color: '#25313A' })
    chip(ctx, r.x + 96 * k, r.y + 6 * k, 76 * k, 22 * k, m.closed ? '闸刀 合' : '闸刀 断', m.closed ? '#15803D' : '#8A9AA4', k)
    T(ctx, `I = ${m.I.toFixed(3)} A`, r.x + 14 * k, r.y + 52 * k, {
      size: Math.max(9, Math.round(13 * k)), color: '#B3261E', bold: true, mono: true,
    })
    T(ctx, `U = ${m.U.toFixed(2)} V`, r.x + 170 * k, r.y + 52 * k, {
      size: Math.max(9, Math.round(13 * k)), color: '#1565C0', bold: true, mono: true,
    })
    T(ctx, `R外 = ${m.R.toFixed(1)} Ω`, r.x + 14 * k, r.y + 76 * k, {
      size: Math.max(8, Math.round(9.4 * k)), color: '#4B5A66',
    })
    T(ctx, m.closed ? '滑片左移 R↑U↑　右移 I↑U↓（U = ε − I r）' : '断开时电压表直接量电池两端 = ε', r.x + 14 * k, r.y + r.h - 14 * k, {
      size: Math.max(8, Math.round(8.8 * k)), color: '#6B7A83',
    })
  }

  function evaluateTasks(s, m, fit) {
    const spread = spreadOf(s.points)
    const dE = fit ? Math.abs(fit.a - CELL.E) : 99
    const dR = fit ? Math.abs(fit.r - CELL.r) : 99
    return {
      maxR: m.closed && m.R >= 19.4,
      first: s.points.length >= 1,
      sweep: s.points.length >= 5 && spread >= 0.15,
      fit: !!fit && s.points.length >= 5,
      read: !!fit && s.points.length >= 5 && dE <= 0.08 && dR <= 0.15,
      off: !m.closed && m.R >= 19.4 && !!fit && s.points.length >= 5,
    }
  }

  /* ================================================================
   *  知识卡内容
   * ================================================================ */
  function buildLearnSections() {
    return [
      {
        t: '实验原理', c: '#B3261E',
        items: [
          [['闭合电路：', ], ['U = E − I r', '#0E4B86', 1], ['；E、r 两个未知数，至少要测 2 组 (I、U)。']],
          [['为减小偶然误差，一般测 ', ], ['6 组以上', '#B3261E', 1], ['，且电流跨度要拉大。']],
          [['合闸前先把滑动变阻器调到 ', ], ['阻值最大', '#B3261E', 1], ['（U 最大、I 最小），再逐步减小外阻。']],
        ],
      },
      {
        t: '两种数据处理', c: '#C2410C',
        items: [
          [['方程组法：两组解一对 (E、r)，多组两两组合再平均 → 误差大、费时。']],
          [['图像法：描点 → 连一条直线（不是折线）→ 截距读 E、斜率读 r，更准更直观。']],
        ],
      },
      {
        t: '图象怎么读', c: '#1E6B3B',
        items: [
          [['纵轴截距（I=0）= ', ], ['E', '#B3261E', 1], ['；斜率绝对值 ', ], ['|ΔU/ΔI| = r', '#B3261E', 1], ['。']],
          [['纵轴从 0 起时，横轴交点才是短路电流 I短 = E/r。']],
          [['纵轴不从 0 起时，横轴交点', ], ['不再是短路电流', '#B3261E', 1], ['，但截距仍是 E，r 仍等于斜率 —— 必须用 ΔU/ΔI 算，不能拿两个交点相除。']],
        ],
      },
      {
        t: '注意事项', c: '#7A4A22',
        items: [
          [['滑变选小阻值（如 20 Ω）：电池 r 小，阻值大了一调电流就跳。']],
          [['电池用旧的：新电池 r 太小 → U-I 线太平，截距、斜率都不好读；非用新电池就串一个 R0 增大等效内阻，最后把 R0 从 r测 里减掉。']],
          [['避免大电流：干电池大电流放电时 E 下降、r 明显变大；读数要快，读完立即断开。']],
        ],
      },
      {
        t: '两种接法 & 误差', c: '#33526E',
        items: [
          [['甲：V 并电源两端、A 串外电路 → 电压表分流 → I 偏小 → E、r 都略偏小。本实验用甲法。']],
          [['乙：A 接电源与负载之间、V 并负载 → 电流表分压 → r测 = r + RA 偏大。']],
        ],
      },
    ]
  }

  function buildTaskSections(s, m, fit, done) {
    const nextTask = TASK_DEFS.find((d) => !s.tasks[d.id])
    return [
      {
        t: `任务进度 ${TASK_DEFS.filter((d) => s.tasks[d.id]).length}/${TASK_DEFS.length}`, c: '#C2410C',
        items: TASK_DEFS.map((d) => [[`${s.tasks[d.id] ? '✅' : '○'} ${d.t}`, s.tasks[d.id] ? '#15803D' : '#6B7A83', s.tasks[d.id]]]),
      },
      {
        t: '现在该做什么', c: '#1E6B3B',
        items: nextTask ? [[[nextTask.d]]] : [[['六步都做完了：换个更大的外阻再测一轮，看 ε、r 是否稳定。']]],
      },
      {
        t: '本次数据', c: '#1565C0',
        items: [
          [['组数 ', ], [`${s.points.length}/8`, '#B3261E', 1], ['　电流跨度 ', ], [`${spreadOf(s.points).toFixed(2)} A`, '#B3261E', 1]],
          [[fit ? `ε=${fit.a.toFixed(2)} V　r=${fit.r.toFixed(2)} Ω` : '拟合：还没有直线（需 ≥5 组）', fit ? '#15803D' : '#8A6D3B', !!fit]],
        ],
      },
      {
        t: '容易做错的地方', c: '#7A4A22',
        items: [
          [['① 没断开就读 ε，或合闸后才想起调最大阻值。']],
          [['② 只记 2–3 组：点太少，截距和斜率都不稳。']],
          [['③ 电流表并在电池上（短路）、电压表串进电路（没读数）。']],
          [['④ 把点连成折线去「凑」交点，必须用一条直线拟合。']],
        ],
      },
    ]
  }

  /* ================================================================
   *  鼠标交互
   * ================================================================ */
  const getPos = (e) => eventToCanvas(canvasRef.current, e)

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    const { x, y } = getPos(e)
    const cv = canvasRef.current
    const s = S.current
    const box = cv._cardBox
    if (box && box.maxScroll > 0 && x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
      s.cardDrag = { y0: y, s0: s.cardScroll }
      return
    }
    for (const a of cv._hits) {
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) {
        if (a.onDrag) {
          s.drag = { area: a, x0: x, y0: y, moved: false }
          if (a.pickFirstOnDown !== false) a.onDrag(x, y, 0, 0)
          return
        }
        a.onClick?.(x, y)
        return
      }
    }
  }, [])

  const handleMouseMove = useCallback((e) => {
    const { x, y } = getPos(e)
    const s = S.current
    const cv = canvasRef.current
    if (s.cardDrag) {
      const box = cv._cardBox
      s.cardScroll = Math.max(0, Math.min(box?.maxScroll || 0, s.cardDrag.s0 - (y - s.cardDrag.y0)))
      return
    }
    if (s.drag) {
      if (Math.abs(x - s.drag.x0) > 1.5 || Math.abs(y - s.drag.y0) > 1.5) s.drag.moved = true
      s.drag.lastX = x
      s.drag.lastY = y
      s.drag.area.onDrag(x, y, y - s.drag.y0, x - s.drag.x0)
      s.drag.y0 = y
      return
    }
    let hit = null
    for (const a of cv._hits) {
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { hit = a; break }
    }
    cv.style.cursor = hit ? (hit.cursor || 'pointer') : 'default'
  }, [])

  const handleMouseUp = useCallback(() => {
    const s = S.current
    if (s.drag && !s.drag.moved && s.drag.area.onClick) {
      s.drag.area.onClick(s.drag.lastX ?? s.drag.x0, s.drag.lastY ?? s.drag.y0)
    } else if (s.drag && s.drag.moved && s.drag.area.onEnd) {
      s.drag.area.onEnd()
    }
    s.drag = null
    s.cardDrag = null
  }, [])

  const handleWheel = useCallback((e) => {
    const box = canvasRef.current?._cardBox
    if (!box || !box.maxScroll) return
    const { x, y } = getPos(e)
    if (x < box.x || x > box.x + box.w || y < box.y || y > box.y + box.h) return
    S.current.cardScroll = Math.max(0, Math.min(box.maxScroll, S.current.cardScroll + e.deltaY))
  }, [])

  /* ================================================================
   *  React 渲染
   * ================================================================ */
  const s = S.current
  const doneCount = TASK_DEFS.filter((d) => s.tasks[d.id]).length

  const toolbar = (
    <>
      {tab === 1 && (
        <>
          <span style={{ fontSize: 12, color: '#555' }}>点开关合闸、拖「R滑」改外阻，看 I、U 与工作点一起变</span>
          <span style={{ fontSize: 12, color: '#8a6d3b' }}>
            E = 2.90 V · r = 1.00 Ω
          </span>
        </>
      )}
      {tab === 2 && (
        <>
          <button
            type="button"
            onClick={() => { s.switchClosed = !s.switchClosed; s.hintText = ''; forceUpdate((n) => n + 1) }}
            style={{ fontSize: 12, padding: '4px 10px', borderRadius: 8, border: '1px solid #c9d6e2', background: s.switchClosed ? '#15803D' : '#fff', color: s.switchClosed ? '#fff' : '#33526e', cursor: 'pointer' }}
          >
            {s.switchClosed ? '⏻ 断开闸刀' : '⏻ 合上闸刀'}
          </button>
          <button
            type="button"
            onClick={() => {
              const err = recordPoint(s)
              if (err) {
                s.hintText = err
              } else {
                const p = s.points[s.points.length - 1]
                s.hintText = `已记录第 ${s.points.length} 组：I=${p.I.toFixed(2)} A，U=${p.U.toFixed(2)} V`
              }
              forceUpdate((n) => n + 1)
            }}
            style={{ fontSize: 12, padding: '4px 10px', borderRadius: 8, border: '1px solid #c9d6e2', background: '#fff', color: '#33526e', cursor: 'pointer' }}
          >
            📌 记录
          </button>
          <button
            type="button"
            onClick={() => { clearPoints(s); s.hintText = ''; forceUpdate((n) => n + 1) }}
            style={{ fontSize: 12, padding: '4px 10px', borderRadius: 8, border: '1px solid #c9d6e2', background: '#fff', color: '#33526e', cursor: 'pointer' }}
          >
            🧹 清空
          </button>
          <span style={{ fontSize: 12, color: doneCount === TASK_DEFS.length ? '#15803D' : '#8a6d3b', fontWeight: 600 }}>
            任务 {doneCount}/{TASK_DEFS.length}
          </span>
        </>
      )}
    </>
  )

  return (
    <SceneShell
      title="⚡ 测量电源电动势和内阻"
      tab={tab}
      onTabChange={(t) => {
        S.current.tab = t
        S.current.drag = null
        S.current.cardDrag = null
        setTab(t)
      }}
      tab1Label="📖 实验方法"
      tab2Label="🔧 自己动手"
      onReset={() => {
        S.current = {
          ...S.current, tab,
          ratio: 0, switchClosed: false, points: [], seed: 3, fromZero: false,
          learnPoints: [], learnHint: '',
          nv: 0, na: 0, tasks: {}, seen: {}, cardScroll: 0, hintText: '',
        }
        forceUpdate((n) => n + 1)
      }}
      toolbarExtra={toolbar}
      desc={(
        <>
          <b>测量电源的电动势和内阻</b>
          <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
            断开量 ε → 合闸取大阻值记录第 1 组 → 减小外阻记满 5 组 → 拟合成 U-I 直线 → 截距读 ε、斜率读 r → 断开收尾
          </span>
        </>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'row', flex: 1, minHeight: 0, width: '100%', position: 'relative' }}>
        <canvas
          ref={canvasRef}
          className="canvas-fill"
          style={{ width: '100%', flex: 1, minHeight: 0, display: 'block', touchAction: 'none' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        />
        <InfoDock
          purpose={tab === 1
            ? '按实验顺序走一遍：先看懂电路和 U = E − Ir，再知道为什么要测 6 组、为什么用图像法而不是解方程组，最后记住四个坑。'
            : '用伏安法测两节旧干电池的 E 和 r：断开读开路电压，合闸改外阻记录多组 (I, U)，拟合成一条直线读截距与斜率。'}
          steps={tab === 1 ? [
            '① 认电路：电池(E,r)、开关 S、滑动变阻器 R滑、电流表 A 串联；电压表 V 并在电池两端',
            '② 合闸后拖「R滑」：松手就把这一组 (R外, I, U) 记进表里，换几个阻值记满 6 组',
            '③ 数据别用解方程组法（两组一对、误差大）：描点连成一条直线，用图像法读 E 和 r',
            '④ 纵轴截距 = E，斜率 |ΔU/ΔI| = r；点右上角切「纵轴从 0 / 只留变化段」看两者的差别',
          ] : [
            '先断开闸刀：电压表读数就是 E（约 2.9 V）',
            '点闸刀合上；把滑片拖到最左端（外阻最大 20 Ω）',
            '点「记录这一组」，得到大 U、小 I 的第 1 组',
            '滑片每次右移一点（外阻变小、电流变大），记满 5 组以上',
            '5 组后自动拟合直线：读纵轴截距 = E，读斜率绝对值 = r',
            '断开闸刀、滑片退回最大端，两表回零',
          ]}
          hint={tab === 1
            ? '四个坑：滑变要小阻值、电池要用旧的（或串 R0 再减掉）、别让电流太大（读完立即断电）、纵轴不从 0 起时只能用 ΔU/ΔI 求 r。'
            : '接线要点：电压表并在电池两端（甲法），电流表串在外电路。电流表不能并在电源上，会短路。'}
        />
      </div>
    </SceneShell>
  )
}
