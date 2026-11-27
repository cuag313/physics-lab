import { useState, useRef, useEffect, useCallback } from 'react'
import { eventToCanvas } from '../utils/pointerPos'
import SceneShell from '../ui/SceneShell'
import InfoDock from '../ui/InfoDock'
import { drawKnowledgeCard } from '../ui/knowledgeCard'
import {
  rr, line, hexA, T, clamp, ease, drawBoard, softCard, noteCard, chip, drawButton,
  formulaPlate, miniTable,
  setAreaSink, areaSink,
} from './labArtKit'
import { drawPhotoBench, loadBenchPhotos } from './bulbBenchPhoto'

/**
 * BulbIVCurveScene — 测绘小灯泡的伏安特性曲线（高中 · 选修 3-1）
 *
 * 教学链路：
 *   ① 为什么选小灯泡：灯丝是金属，温度一变电阻就变，正好是“非线性元件”的样本；
 *   ② 为什么分压：要从 0 V 起逐点测，限流接法做不到，滑变必须三端接成分压器；
 *   ③ 为什么电流表外接：灯丝电阻只有几欧，外接误差 R/RV ≈ 0.3%，内接误差 RA/R ≈ 1.2%；
 *   ④ 描点连线：I-U 图不是直线，越往右上越“平”，对应 R 随电压（温度）升高而增大。
 *
 * 物理口径（真算）：
 *   灯丝电阻 R = R0(1 + b·U·I)（R0 冷态 1.2 Ω，b 由额定 2.5 V / 0.3 A 反解）；
 *   给定电压用二分法解 I = U/R(U,I)，保证 2.5 V 时正好 0.3 A、低电压段电阻小；
 *   分压回路按节点方程迭代：电源 3 V/0.1 Ω + 20 Ω 滑变 + (灯串 0.1 Ω 电流表) + 3 kΩ 电压表并联。
 */

const BULB = { Ur: 2.5, Ir: 0.3, R0: 1.2, b: 7.925, Rr: 2.5 / 0.3 }
const VS = 3.0            // 学生电源电动势
const R_INT = 0.1         // 电源内阻
const RHEO = 20           // 滑动变阻器总阻（分压用）
const R_A = 0.1           // 电流表内阻
const R_V = 3000          // 电压表内阻
const A_FS = 0.6          // 电流表量程
const V_FS = 3            // 电压表量程
const MAX_POINTS = 10     // 记录点上限
const TARGETS = [0.2, 0.5, 0.8, 1.1, 1.4, 1.7, 2.0, 2.3]

const STEPS = ['为什么测小灯泡', '分压接法与接线', '记录与描点', '曲线与结论']
const STEP_SUB = [
  '灯丝电阻随温度变，U-I 关系不是直线 —— 小灯泡就是最典型的非线性元件。',
  '要从 0 V 开始逐点测量，滑变必须三端接成分压器；灯丝电阻小，电流表要外接。',
  '每次读到一对 (U, I)，顺手算出 R = U/I，全部记进表格再描到坐标纸上。',
  '描出的曲线越来越“平”，说明 R 越测越大 —— 温度升高，灯丝电阻变大。',
]

/* ================================================================
 *  物理内核
 * ================================================================ */

/** 灯丝伏安特性：二分法解 I = U / R(U,I) */
function bulbAt(U) {
  if (U <= 1e-6) return { U: 0, I: 0, R: BULB.R0, P: 0 }
  let lo = 1e-6
  let hi = U / BULB.R0
  for (let i = 0; i < 46; i += 1) {
    const mid = (lo + hi) / 2
    const R = BULB.R0 * (1 + BULB.b * U * mid)
    if (mid - U / R < 0) lo = mid
    else hi = mid
  }
  const I = (lo + hi) / 2
  return { U, I, R: U / I, P: U * I }
}

/** 分压回路求解（滑片比为 ratio），返回灯泡两端的 U、流过灯的 I */
function solveCircuit(ratio, closed) {
  if (!closed) return { U: 0, I: 0, R: BULB.R0, P: 0, node: 0, iTot: 0 }
  const r = clamp(ratio, 0, 1)
  // 滑片压在最左端：灯支路被短接到电源负极，灯两端严格为 0 V
  if (r < 0.004) {
    return { U: 0, I: 0, R: BULB.R0, P: 0, node: 0, iTot: VS / (R_INT + RHEO) }
  }
  const Rth = R_INT + RHEO * (1 - r)      // 滑片以上那一段 + 电源内阻
  const Rlow = Math.max(0.25, RHEO * r)   // 滑片以下那一段（与负载并联）
  let node = VS * 0.5
  for (let i = 0; i < 30; i += 1) {
    const b = bulbAt(node)
    const Rb = Math.max(b.R, BULB.R0)
    const G = 1 / (Rb + R_A) + 1 / R_V + 1 / Rlow
    node = VS / (1 + Rth * G)
  }
  const b = bulbAt(node)
  const Ib = node / (Math.max(b.R, BULB.R0) + R_A)
  const Ub = Ib * b.R
  const Rb = Ub / Math.max(Ib, 1e-9)
  return {
    U: Ub, I: Ib, R: Rb, P: Ub * Ib, node,
    iTot: node * (1 / (Rb + R_A) + 1 / R_V + 1 / Rlow),
  }
}

/** 反解：要让灯泡两端到目标电压，滑片该放在哪 */
function ratioForU(target) {
  let lo = 0
  let hi = 1
  for (let i = 0; i < 34; i += 1) {
    const mid = (lo + hi) / 2
    if (solveCircuit(mid, true).U < target) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/* 限流回路求解（Tab2 实验台照「自己动手」那套接法：滑变只用两端 —— 下左柱 + 滑片柱）
 *   pos = 滑片位置：0 在最左（串入 0 Ω，灯最亮）→ 1 在最右（串入 RHEO，灯最暗）
 *   U = E·Rb / (Rb + Rr + R_A + r)，Rb 由灯丝模型自洽迭代（松弛，避免高功率处来回跳）
 */
function solveLimit(pos, closed) {
  if (!closed) return { U: 0, I: 0, R: BULB.R0, P: 0, node: 0, iTot: 0 }
  const Rr = RHEO * clamp(pos, 0, 1)
  let U = VS * 0.45
  for (let i = 0; i < 40; i += 1) {
    const b = bulbAt(U)
    const Rb = Math.max(b.R, BULB.R0)
    U = (U + (VS * Rb) / (Rb + Rr + R_A + R_INT)) / 2
  }
  const b = bulbAt(U)
  return { U, I: b.I, R: b.R, P: b.P, node: U, iTot: b.I }
}

/** 反解（限流）：U 随滑片位置单调下降，二分求"要到 target 该放哪" */
function ratioForULimit(target) {
  let lo = 0
  let hi = 1
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2
    if (solveLimit(mid, true).U > target) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

function defaultState() {
  return {
    tab: 1,
    step: 0,
    demo: -1,           // Tab1 演示进度：-1 未开始，0~1 进行中，>1 已演完
    ratio: 0,           // Tab1 电路图滑片位置（分压比）：按课本先放最左端，U = 0
    rat2: 1,            // Tab2 限流台滑片位置：1 = 最右（串入 20 Ω，灯最暗）——合开关前先放阻值最大处
    closed: false,
    points: [],
    chart: 'iv',        // 'iv' | 'ru'
    cardScroll: 0,
    cardDrag: null,
    dragArea: null,
    needle: { v: 0, a: 0 },
    anim: 0,
  }
}

/* ================================================================
 *  绘画基元（本场景专用）
 * ================================================================ */

function fmtOhm(R) {
  if (!Number.isFinite(R)) return '∞'
  if (R >= 1000) return `${(R / 1000).toFixed(2)} kΩ`
  if (R >= 10) return `${R.toFixed(1)} Ω`
  return `${R.toFixed(2)} Ω`
}


/** 坐标框：返回引脚映射，附带网格与刻度 */
function plotFrame(ctx, r, k, o) {
  const padL = (o.padL || 40) * k
  const padB = (o.padB || 30) * k
  const padT = 16 * k
  const padR = 12 * k
  const x0 = r.x + padL
  const x1 = r.x + r.w - padR
  const y0 = r.y + r.h - padB
  const y1 = r.y + padT
  const X = (u) => x0 + (u / o.xMax) * (x1 - x0)
  const Y = (v) => y0 - (v / o.yMax) * (y0 - y1)

  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,0.72)'
  rr(ctx, x0, y1, x1 - x0, y0 - y1, 6)
  ctx.fill()
  // 网格
  for (let i = 0; i <= o.xN; i += 1) {
    const u = (o.xMax / o.xN) * i
    line(ctx, X(u), y1, X(u), y0, 'rgba(96,132,104,0.22)', 1)
  }
  for (let i = 0; i <= o.yN; i += 1) {
    const v = (o.yMax / o.yN) * i
    line(ctx, x0, Y(v), x1, Y(v), 'rgba(96,132,104,0.22)', 1)
  }
  // 轴
  line(ctx, x0, y0, x1, y0, '#7C8F98', 1.4)
  line(ctx, x0, y1, x0, y0, '#7C8F98', 1.4)
  // 刻度文字
  for (let i = 0; i <= o.xN; i += 1) {
    const u = (o.xMax / o.xN) * i
    T(ctx, u.toFixed(o.xDec == null ? 1 : o.xDec), X(u), y0 + 12 * k, {
      size: Math.round(8.5 * k), color: '#6B7A83', align: 'center',
    })
  }
  for (let i = 0; i <= o.yN; i += 1) {
    const v = (o.yMax / o.yN) * i
    T(ctx, o.yFmt ? o.yFmt(v) : v.toFixed(1), x0 - 6 * k, Y(v), {
      size: Math.round(8.5 * k), color: '#6B7A83', align: 'right',
    })
  }
  T(ctx, o.xTitle || 'U / V', x1, y0 + 24 * k, {
    size: Math.round(9.5 * k), color: '#4B5A66', align: 'right', bold: true,
  })
  T(ctx, o.yTitle || 'I / A', x0, y1 - 9 * k, {
    size: Math.round(9.5 * k), color: '#4B5A66', align: 'left', bold: true,
  })
  ctx.restore()
  return { X, Y, x0, x1, y0, y1 }
}

/** 平滑曲线（中点二次贝塞尔，不过冲） */
function smoothPath(ctx, pts, X, Y, color, lw, alpha = 1) {
  if (pts.length < 2) return
  const p = pts.map((d) => ({ x: X(d.x), y: Y(d.y) }))
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.lineWidth = lw
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(p[0].x, p[0].y)
  for (let i = 0; i < p.length - 1; i += 1) {
    const a = p[i]
    const b = p[i + 1]
    ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2)
    if (i === p.length - 2) ctx.quadraticCurveTo(b.x, b.y, b.x, b.y)
  }
  ctx.stroke()
  ctx.restore()
}

export default function BulbIVCurveScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const S = useRef(defaultState())

  const [tab, setTab] = useState(1)
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const R = {
      canvas,
      ctx: canvas.getContext('2d'),
      W: 0,
      H: 0,
      resize() {
        const w = canvas.clientWidth || 1
        const h = canvas.clientHeight || 1
        canvas.width = Math.round(w * devicePixelRatio)
        canvas.height = Math.round(h * devicePixelRatio)
        this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
        this.W = w
        this.H = h
      },
    }
    R.resize()
    canvas._R = R
    // 实拍器材图（全站同一套 /assets/equipment/fig）：rAF 循环每帧重绘，图到齐会自动出现
    loadBenchPhotos()
    const loop = () => {
      const cw = canvas.clientWidth || 1
      const chh = canvas.clientHeight || 1
      if (cw !== R.W || chh !== R.H) R.resize()
      S.current.time = (S.current.time || 0) + 1 / 60
      animRef.current = requestAnimationFrame(loop)
      render(R)
    }
    animRef.current = requestAnimationFrame(loop)
    const onResize = () => R.resize()
    window.addEventListener('resize', onResize)
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  function render(R) {
    const ctx = R.ctx
    const W = R.W
    const H = R.H
    ctx.clearRect(0, 0, W, H)
    const bg = ctx.createLinearGradient(0, 0, W * 0.4, H)
    bg.addColorStop(0, '#FFFCF5')
    bg.addColorStop(0.5, '#FDF5E8')
    bg.addColorStop(1, '#FAECDA')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)
    canvasRef.current._clickAreas = []
    canvasRef.current._cardBox = null
    setAreaSink((a) => canvasRef.current._clickAreas.push(a))
    if (S.current.tab === 1) renderTheory(ctx, W, H)
    else renderLab(ctx, W, H)
  }

  function area(a) {
    canvasRef.current._clickAreas.push(a)
  }

  /* ================================================================
   *  版式
   * ================================================================ */
  function layout(W, H) {
    const compact = W < 980 || H < 540
    const RAIL = 46
    const panelW = compact ? 0 : Math.max(318, Math.min(W * 0.30, 460))
    const panel = compact ? null : { x: W - 12 - RAIL - panelW, y: 12, w: panelW, h: H - 24 }
    const stage = { x: 12, y: 10, w: compact ? W - 24 : panel.x - 24, h: H - 20 }
    const k = Math.max(0.62, Math.min(1.28, Math.min(stage.w / 1040, stage.h / 760)))
    return { compact, panel, board: stage, k }
  }

  /* ================================================================
   *  Tab 1：原理演示
   * ================================================================ */
  function renderTheory(ctx, W, H) {
    const s = S.current
    const lay = layout(W, H)
    const b = lay.board
    const k = lay.k
    drawBoard(ctx, b)

    // ── 步骤条 ──
    const pad = 14
    const pillH = Math.round(30 * k)
    const pillY = b.y + 12
    const gap = 8
    const pillW = Math.min(190 * k, (b.w - pad * 2 - gap * 3) / 4)
    for (let i = 0; i < 4; i += 1) {
      const x = b.x + pad + i * (pillW + gap)
      const on = s.step === i
      ctx.save()
      if (on) {
        const g = ctx.createLinearGradient(x, pillY, x, pillY + pillH)
        g.addColorStop(0, '#3A8FE0'); g.addColorStop(1, '#1B5FB4')
        ctx.fillStyle = g
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.86)'
      }
      rr(ctx, x, pillY, pillW, pillH, pillH / 2)
      ctx.fill()
      ctx.strokeStyle = on ? '#17549E' : '#CFDDD2'
      ctx.lineWidth = 1.2
      rr(ctx, x, pillY, pillW, pillH, pillH / 2)
      ctx.stroke()
      T(ctx, `${'①②③④'[i]} ${STEPS[i]}`, x + pillW / 2, pillY + pillH / 2 + 1, {
        size: Math.round(12 * k), bold: true, align: 'center',
        color: on ? '#fff' : '#4B6270',
      })
      ctx.restore()
      area({
        x, y: pillY, w: pillW, h: pillH,
        onClick: () => { S.current.step = i; S.current.anim = 0; forceUpdate((v) => v + 1) },
      })
    }

    const subY = pillY + pillH + 12 * k
    T(ctx, STEP_SUB[s.step], b.x + pad + 2, subY, {
      size: Math.round(11.5 * k), color: '#5B6B5F',
    })

    const content = {
      x: b.x + pad,
      y: subY + 14 * k,
      w: b.w - pad * 2,
      h: b.y + b.h - (subY + 14 * k) - 10,
    }

    if (s.step === 2) s.anim += 1 / 60
    else if (s.step !== 2) s.anim = 0

    if (s.step === 0) stepGoal(ctx, content, s, k)
    else if (s.step === 1) stepWiring(ctx, content, s, k)
    else if (s.step === 2) stepRecord(ctx, content, s, k)
    else stepCurve(ctx, content, s, k)

    if (lay.panel) {
      const out = drawKnowledgeCard(ctx, lay.panel, buildSections(), {
        title: '📖 小灯泡伏安特性',
        scroll: s.cardScroll,
        tip: (c2, tx, ty) => {
          c2.fillStyle = '#B08954'
          c2.font = '11.5px "Microsoft YaHei", sans-serif'
          c2.textAlign = 'left'
          c2.textBaseline = 'middle'
          const bb = s.step === 0
            ? bulbAt(solveCircuit(s.ratio, s.closed).U)
            : bulbAt(BULB.Ur)
          c2.fillText(
            s.step === 3
              ? `R：0.0 V 时 ${fmtOhm(BULB.R0)} → 2.5 V 时 ${fmtOhm(BULB.Rr)}，涨了约 ${(BULB.Rr / BULB.R0).toFixed(1)} 倍`
              : `额定 2.5 V / 0.3 A · 冷态 ${fmtOhm(BULB.R0)} · 现测得 R = ${fmtOhm(bb.R)}`,
            tx, ty + 10,
          )
        },
      })
      canvasRef.current._cardBox = out
        ? {
          x: lay.panel.x, y: lay.panel.y + 2, w: lay.panel.w, h: out.cardH,
          maxScroll: out.maxScroll, scroll: out.scroll,
        }
        : null
    }
  }

  /* ── ① 可动手的电路图：点开关断/通电、拖滑片改取压，读数与灯亮跟着变 ── */
  function drawGoalCircuit(ctx, r, s, calc, k) {
    softCard(ctx, r.x, r.y, r.w, r.h, '#FFFFFF', '#DFE7EC')
    T(ctx, '把电路接起来：分压接法（滑片取电压）', r.x + 13 * k, r.y + 20 * k, {
      size: Math.round(10.6 * k), bold: true, color: '#25313A',
    })
    T(ctx, '都能动手：点开关、拖滑片 —— 表读数、灯亮、右边曲线一起变', r.x + 13 * k, r.y + 37 * k, {
      size: Math.round(8.8 * k), color: '#5B6B5F',
    })

    const dark = '#1F2937'
    const red = '#C62828'
    const green = '#15803D'
    const lw = 2.1 * k

    const xL = r.x + 40 * k
    const yV = r.y + 104 * k
    const yLoad = r.y + 200 * k
    const yBack = r.y + 246 * k
    const yRheo = r.y + 310 * k
    const yBot = r.y + 392 * k
    const lampX = r.x + 140 * k
    const ax = r.x + 330 * k
    const xR = r.x + r.w - 26 * k
    const rheoLeft = r.x + 92 * k
    const rheoRight = xR - 22 * k
    const barH = 20 * k
    const bx = r.x + 132 * k
    const sx = r.x + 228 * k
    const ratio = clamp(s.ratio, 0, 1)
    const wx = rheoLeft + (rheoRight - rheoLeft) * ratio
    const lit = s.closed ? clamp(calc.U / BULB.Ur, 0, 1.15) : 0

    // 灯亮的光晕（灯丝越热越亮）
    if (lit > 0.02) {
      const g = ctx.createRadialGradient(lampX, yLoad, 4 * k, lampX, yLoad, 54 * k)
      g.addColorStop(0, `rgba(255,206,120,${Math.min(0.55, 0.6 * lit)})`)
      g.addColorStop(1, 'rgba(255,206,120,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(lampX, yLoad, 54 * k, 0, Math.PI * 2)
      ctx.fill()
    }

    // 导线：左竖线是 0 V（灯左端 / 滑变左端 / 电源 −）
    line(ctx, xL, yLoad, xL, yBot, dark, lw)
    line(ctx, xL, yRheo, rheoLeft, yRheo, dark, lw)
    line(ctx, xL, yLoad, lampX - 20 * k, yLoad, dark, lw)
    // 灯 → 电流表 → 右竖线折下 → 折回 → 滑片（滑片在整条滑变上滑）
    line(ctx, lampX + 20 * k, yLoad, ax - 18 * k, yLoad, dark, lw)
    line(ctx, ax + 18 * k, yLoad, xR, yLoad, dark, lw)
    line(ctx, xR, yLoad, xR, yBack, dark, lw)
    line(ctx, xR, yBack, wx, yBack, dark, lw)
    line(ctx, wx, yBack, wx, yRheo - barH / 2 - 8 * k, dark, lw)
    // 滑片箭头（指入滑变）
    ctx.beginPath()
    ctx.moveTo(wx, yRheo - barH / 2 + 0.5 * k)
    ctx.lineTo(wx - 4.2 * k, yRheo - barH / 2 - 8.4 * k)
    ctx.lineTo(wx + 4.2 * k, yRheo - barH / 2 - 8.4 * k)
    ctx.closePath()
    ctx.fillStyle = dark
    ctx.fill()

    // 电压表：并在灯两端（外接）—— 两条竖引线落在灯端，横段接进 V 圆
    line(ctx, lampX - 26 * k, yLoad, lampX - 26 * k, yV, green, lw)
    line(ctx, lampX + 26 * k, yLoad, lampX + 26 * k, yV, green, lw)
    line(ctx, lampX - 26 * k, yV, lampX - 19 * k, yV, green, lw)
    line(ctx, lampX + 19 * k, yV, lampX + 26 * k, yV, green, lw)
    ctx.beginPath()
    ctx.arc(lampX, yV, 19 * k, 0, Math.PI * 2)
    ctx.fillStyle = '#FFFFFF'
    ctx.fill()
    ctx.strokeStyle = green
    ctx.lineWidth = 2 * k
    ctx.stroke()
    T(ctx, 'V', lampX, yV + 1, { size: Math.round(12.6 * k), bold: true, align: 'center', color: green })
    T(ctx, `${calc.U.toFixed(2)} V`, lampX, yV + 32 * k, {
      size: Math.round(11 * k), bold: true, align: 'center', color: green, mono: true,
    })
    // V 的两条引线落在灯端，点一下结点表示“就接在这里”
    ctx.fillStyle = green
    for (const px of [lampX - 26 * k, lampX + 26 * k]) {
      ctx.beginPath()
      ctx.arc(px, yLoad, 2.4 * k, 0, Math.PI * 2)
      ctx.fill()
    }

    // 电流表（与灯串联）
    ctx.beginPath()
    ctx.arc(ax, yLoad, 18 * k, 0, Math.PI * 2)
    ctx.fillStyle = '#FFFFFF'
    ctx.fill()
    ctx.strokeStyle = red
    ctx.lineWidth = 2 * k
    ctx.stroke()
    T(ctx, 'A', ax, yLoad + 1, { size: Math.round(12 * k), bold: true, align: 'center', color: red })
    T(ctx, `${calc.I.toFixed(3)} A`, ax, yLoad + 32 * k, {
      size: Math.round(11 * k), bold: true, align: 'center', color: red, mono: true,
    })

    // 小灯泡（⊗ 标准符号，点亮后里面发暖光）
    const rB = 20 * k
    ctx.beginPath()
    ctx.arc(lampX, yLoad, rB, 0, Math.PI * 2)
    ctx.fillStyle = '#FFFFFF'
    ctx.fill()
    if (lit > 0.02) {
      ctx.fillStyle = `rgba(255,199,92,${Math.min(0.95, 0.85 * lit)})`
      ctx.beginPath()
      ctx.arc(lampX, yLoad, rB - 0.8 * k, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.strokeStyle = '#5F6E78'
    ctx.lineWidth = 1.6 * k
    ctx.beginPath()
    ctx.arc(lampX, yLoad, rB, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(lampX - rB * 0.707, yLoad - rB * 0.707)
    ctx.lineTo(lampX + rB * 0.707, yLoad + rB * 0.707)
    ctx.moveTo(lampX + rB * 0.707, yLoad - rB * 0.707)
    ctx.lineTo(lampX - rB * 0.707, yLoad + rB * 0.707)
    ctx.stroke()
    T(ctx, '小灯泡 2.5 V / 0.3 A', lampX + 36 * k, yLoad - 22 * k, {
      size: Math.round(8.4 * k), color: '#5B6B5F',
    })
    T(ctx, s.closed ? `R = ${fmtOhm(calc.R)}` : 'R = —（没通电）', lampX - 24 * k, yLoad + 36 * k, {
      size: Math.round(8.6 * k), bold: true, color: green, mono: true,
    })

    // 滑动变阻器：全长接电源，左端 0 V、滑片取压
    ctx.fillStyle = '#EFDCC0'
    rr(ctx, rheoLeft, yRheo - barH / 2, rheoRight - rheoLeft, barH, 6 * k)
    ctx.fill()
    if (wx - rheoLeft > 1.5 * k) {
      ctx.fillStyle = hexA('#E0A32A', s.closed ? 0.52 : 0.22)
      rr(ctx, rheoLeft, yRheo - barH / 2 + 1.5 * k, wx - rheoLeft, barH - 3 * k, 5 * k)
      ctx.fill()
    }
    ctx.strokeStyle = '#C8A877'
    ctx.lineWidth = 1.2 * k
    rr(ctx, rheoLeft, yRheo - barH / 2, rheoRight - rheoLeft, barH, 6 * k)
    ctx.stroke()
    T(ctx, `滑片 ${Math.round(ratio * 100)}%`, wx, yRheo + barH / 2 + 21 * k, {
      size: Math.round(8.6 * k), align: 'center', color: '#8A6A3A',
    })

    // 0 V 结点
    ctx.beginPath()
    ctx.arc(xL, yRheo, 3.6 * k, 0, Math.PI * 2)
    ctx.fillStyle = dark
    ctx.fill()

    // 底轨：电源 −（短板）→ +（长板）→ 开关 → 滑变右端
    line(ctx, xL, yBot, bx, yBot, dark, lw)
    line(ctx, bx, yBot - 12 * k, bx, yBot + 12 * k, dark, 2.6 * k)
    line(ctx, bx + 11 * k, yBot - 18 * k, bx + 11 * k, yBot + 18 * k, dark, lw)
    line(ctx, bx + 11 * k, yBot, sx - 13 * k, yBot, dark, lw)
    if (s.closed) {
      line(ctx, sx - 13 * k, yBot, sx + 13 * k, yBot, dark, 3.2 * k)
    } else {
      // 断开：只画抬起的刀，两柱之间不留连线（否则看着像还连着）
      line(ctx, sx - 13 * k, yBot, sx + 13 * k, yBot - 17 * k, dark, lw)
    }
    ctx.beginPath()
    ctx.arc(sx - 13 * k, yBot, 3 * k, 0, Math.PI * 2)
    ctx.fillStyle = '#7A4A2A'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(sx + 13 * k, yBot, 3 * k, 0, Math.PI * 2)
    ctx.fill()
    line(ctx, sx + 14 * k, yBot, xR, yBot, dark, lw)
    line(ctx, xR, yBot, xR, yRheo, dark, lw)
    line(ctx, rheoRight, yRheo, xR, yRheo, dark, lw)

    T(ctx, '−', bx - 9 * k, yBot - 13 * k, { size: Math.round(9 * k), bold: true, align: 'center', color: dark })
    T(ctx, '+', bx + 21 * k, yBot - 13 * k, { size: Math.round(9 * k), bold: true, align: 'center', color: dark })
    T(ctx, '学生电源 3 V', bx - 12 * k, yBot + 18 * k, { size: Math.round(8.6 * k), color: '#5B6B5F', align: 'right' })
    T(ctx, s.closed ? '开关（闭合）· 点一下断开' : '开关（断开）· 点一下闭合', sx, yBot - 32 * k, {
      size: Math.round(8.6 * k), align: 'center', color: s.closed ? green : '#8A6A3A',
    })
    T(ctx, '滑片在最左端取出 0 V；往右拖到 2.5 V 就够测了（再往上灯会烧）', r.x + 13 * k, r.y + r.h - 13 * k, {
      size: Math.round(8.6 * k), color: '#8A6A3A',
    })

    // ── 热区：开关可点、滑变可拖
    area({
      x: sx - 30 * k, y: yBot - 30 * k, w: 62 * k, h: 44 * k,
      onClick: () => {
        S.current.demo = -1
        S.current.closed = !S.current.closed
        forceUpdate((n) => n + 1)
      },
    })
    area({
      x: rheoLeft - 8 * k, y: yRheo - 24 * k, w: rheoRight - rheoLeft + 16 * k, h: 48 * k,
      onDrag: (mx) => {
        S.current.demo = -1
        S.current.ratio = clamp((mx - rheoLeft) / (rheoRight - rheoLeft), 0, 1)
        forceUpdate((n) => n + 1)
      },
    })
  }

  /* ── ① 为什么测小灯泡：可动手的电路 → 通电现象 → 数据 ── */
  function stepGoal(ctx, c, s, k) {
    // 演示动画：0 → 2.5 V 平滑扫过，约 8 s，到位后停住
    if (s.demo >= 0 && s.demo < 1) {
      s.demo = Math.min(1, s.demo + 1 / (60 * 9))
      s.closed = true
      const u = 2.5 * clamp(s.demo / 0.9, 0, 1)
      s.ratio = u < 0.02 ? 0 : ratioForU(Math.min(2.5, u))
    }
    const calc = solveCircuit(s.ratio, s.closed)
    const colW = (c.w - 16 * k) / 2
    const cardH = 452 * k

    // 可动手的电路图（点开关 / 拖滑片）
    drawGoalCircuit(ctx, { x: c.x, y: c.y + 2 * k, w: colW, h: cardH }, s, calc, k)

    // 三个读数胶囊
    const chipY = c.y + 2 * k + cardH + 10 * k
    const gapC = 6 * k
    const cw = (colW - gapC * 2) / 3
    const items = [
      { t: `U ${calc.U.toFixed(2)} V`, c: '#1565C0' },
      { t: `I ${calc.I.toFixed(3)} A`, c: '#B3261E' },
      { t: `R ${s.closed ? fmtOhm(calc.R) : '—'}`, c: '#15803D' },
    ]
    items.forEach((it, i) => {
      chip(ctx, c.x + i * (cw + gapC), chipY, cw, 26 * k, it.t, it.c, k)
    })

    // 下面一句判断
    const noteY = chipY + 36 * k
    T(ctx, !s.closed
      ? '开关断开：点一下开关（或按下面的按钮），回路通了才有电流。'
      : calc.U < 0.6
        ? '电压很低：灯丝几乎不热，R 还接近冷态 1.2 Ω —— 这一小段看着像直线。'
        : calc.U < 1.6
          ? '灯丝发红：R 已涨到 3~5 Ω，电流涨得没有电压快 —— 曲线开始往下弯。'
          : '接近额定：灯丝上千度，R 涨到 8 Ω 上下 —— 再升 0.5 V，电流只多一点点。',
      c.x, noteY, { size: Math.round(9.8 * k), color: '#5B6B5F' })

    // 自动演示按钮
    const playing = s.demo >= 0 && s.demo < 1
    const done = s.demo >= 1
    const btnY = noteY + 15 * k
    const btnH = 28 * k
    const btnW = Math.min(212 * k, colW * 0.56)
    drawButton(ctx, c.x, btnY, btnW, btnH,
      playing ? '● 演示中…滑片在自动上扫' : (done ? '▶ 再来一遍' : '▶ 自动演示：滑片 0 → 2.5 V'),
      '#1565C0', !playing, k)
    if (playing) {
      const pulse = (Math.sin((s.time || 0) * 3.4) + 1) / 2
      ctx.fillStyle = hexA('#1565C0', 0.10 + 0.12 * pulse)
      rr(ctx, c.x, btnY, btnW, btnH, 8)
      ctx.fill()
      T(ctx, `U ${calc.U.toFixed(1)} V`, c.x + btnW + 10 * k, btnY + btnH / 2 + 1, {
        size: Math.round(11 * k), bold: true, color: '#1565C0', mono: true,
      })
    }
    area({
      x: c.x, y: btnY, w: btnW, h: btnH,
      onClick: () => {
        S.current.demo = 0
        S.current.ratio = 0
        S.current.closed = true
        forceUpdate((n) => n + 1)
      },
    })

    // 同一只灯泡的四档对照
    const tblY = btnY + btnH + 12 * k
    const tblH = Math.min(140 * k, c.y + c.h - tblY)
    if (tblH > 104 * k) {
      const pts = [0.2, 1.0, 1.8, 2.5].map((u) => bulbAt(u))
      miniTable(ctx, c.x, tblY, colW, k, {
        head: ['U / V', 'I / A', 'R / Ω'],
        rows: pts.map((d) => [d.U.toFixed(1), d.I.toFixed(3), d.R.toFixed(1)]),
        color: '#B3261E',
        foot: `电压翻 ${(2.5 / 0.2).toFixed(0)} 倍，电流只涨 ${(pts[3].I / pts[0].I).toFixed(1)} 倍 —— 电阻一直在变大`,
      })
    }

    // ── 右列卡片 ──
    const rx = c.x + colW + 16 * k
    const rw = colW
    let y = c.y + 2 * k
    noteCard(ctx, rx, y, rw, 100 * k, k, {
      title: '实验目的', color: '#E0761F', fill: '#FFF8EE', stroke: '#EADFC8',
      lines: [
        '测绘小灯泡的 I-U 图，认识非线性元件',
        '学会分压接法：电压从 0 起连续可调',
        '会用 R = U/I 逐点算电阻，看出温度的影响',
      ],
    })
    y += 100 * k + 12 * k

    noteCard(ctx, rx, y, rw, 118 * k, k, {
      title: '器材与量程', color: '#1565C0', fill: '#F5F9FE', stroke: '#D3E1F0',
      lines: [
        `学生电源 3 V（内阻 ${R_INT} Ω）`,
        `滑动变阻器 ${RHEO} Ω，三端接成分压器`,
        `电压表 0 ~ ${V_FS} V（内阻 ${fmtOhm(R_V)}）`,
        `电流表 0 ~ ${A_FS} A（内阻 ${R_A} Ω）`,
      ],
    })
    y += 118 * k + 12 * k

    const plateH = 152 * k
    if (y + plateH < c.y + c.h) {
      formulaPlate(ctx, rx, y, rw, k, [
        { s: '灯丝：R = R₀(1 + b·U·I)', bold: true, color: '#25313A' },
        { s: `R₀ = ${fmtOhm(BULB.R0)}（冷态，0 V 附近）` },
        { s: `2.5 V / 0.3 A 时 R = ${fmtOhm(BULB.Rr)}` },
        { s: '电阻跟着温度走 → 曲线不是直线', color: '#B3261E' },
      ])
    }
    y += plateH + 12 * k

    // 预期曲线小图（右列底部，先猜后测）
    const chTop = y
    const chH = c.y + c.h - chTop - 2 * k
    if (chH > 168 * k) {
      softCard(ctx, rx, chTop, rw, chH, '#FFFFFF', '#DFE7EC')
      T(ctx, '先猜后测：这条曲线该长成什么样', rx + 14 * k, chTop + 20 * k, {
        size: Math.round(11.5 * k), bold: true, color: '#25313A',
      })
      T(ctx, '红＝小灯泡　绿虚线＝8 Ω 定值　蓝点＝演示取点', rx + 14 * k, chTop + 37 * k, {
        size: Math.round(9 * k), color: '#7A8790',
      })
      const plot = { x: rx + 12 * k, y: chTop + 46 * k, w: rw - 24 * k, h: chH - 62 * k }
      const base = plotFrame(ctx, plot, k, { xMax: 3, yMax: 0.4, xN: 6, yN: 4 })
      // 8 Ω 定值电阻对照（虚线）
      ctx.save()
      ctx.setLineDash([5 * k, 4 * k])
      ctx.beginPath()
      ctx.moveTo(base.X(0), base.Y(0))
      ctx.lineTo(base.X(3), base.Y(3 / BULB.Rr))
      ctx.strokeStyle = 'rgba(21,128,61,0.55)'
      ctx.lineWidth = 1.6 * k
      ctx.stroke()
      ctx.restore()
      // 灯泡实际曲线
      const curve = []
      for (let u = 0; u <= 2.5 + 1e-6; u += 0.125) curve.push({ x: u, y: bulbAt(u).I })
      smoothPath(ctx, curve, base.X, base.Y, '#B3261E', 2.4 * k)
      ctx.fillStyle = '#B3261E'
      ctx.beginPath()
      ctx.arc(base.X(BULB.Ur), base.Y(BULB.Ir), 3.4 * k, 0, Math.PI * 2)
      ctx.fill()
      T(ctx, '额定点 2.5 V / 0.3 A', base.x1 - 6 * k, base.y1 - 8 * k, {
        size: Math.round(8.5 * k), color: '#B3261E', align: 'right', bold: true,
      })
      // 演示扫过 0.5 V 整数倍的取样点
      for (const u of [0.5, 1.0, 1.5, 2.0, 2.5]) {
        const d = bulbAt(u)
        if (calc.U + 0.02 >= u) {
          ctx.fillStyle = '#1E6FD0'
          ctx.beginPath()
          ctx.arc(base.X(u), base.Y(d.I), 3 * k, 0, Math.PI * 2)
          ctx.fill()
          if (u < 2.4) {
            T(ctx, u.toFixed(1), base.X(u), base.Y(d.I) - 7 * k, {
              size: Math.round(7.5 * k), color: '#1E6FD0', align: 'center',
            })
          }
        }
      }
      const cur = bulbAt(calc.U)
      ctx.strokeStyle = '#1565C0'
      ctx.lineWidth = 1.6 * k
      ctx.beginPath()
      ctx.arc(base.X(cur.U), base.Y(cur.I), 6.4 * k, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = '#1565C0'
      ctx.beginPath()
      ctx.arc(base.X(cur.U), base.Y(cur.I), 2.4 * k, 0, Math.PI * 2)
      ctx.fill()
      if (cur.U > 0.06) {
        T(ctx, `现在的点 ${cur.U.toFixed(2)} V`, base.X(cur.U) + 8 * k,
          base.Y(cur.I) + (cur.I < 0.08 ? -12 * k : 16 * k), {
            size: Math.round(8.5 * k), color: '#1565C0', bold: true,
          })
      }
    }
  }
  /* ── 先画线后画器材：实拍器材的接线柱在同一行，横贯全台的“导轨条”一定会压过机壳，
        所以这里全部改成柱到柱的软导线（走线被器材挡住的段落＝线走在器材后面） ── */
  function benchHits(L, k, demo) {
    const sw = L.sw
    // 热区盖住整件（含抬起来的闸刀把手）：只盖底座的话，点刀柄点不到，像"开关失灵"
    area({
      x: sw.x - 3 * k, y: sw.y - 3 * k, w: sw.w + 6 * k, h: sw.h + 8 * k,
      onClick: () => { S.current.closed = !S.current.closed; forceUpdate((n) => n + 1) },
    })
    const x0 = L.rh.x + (34 / 190) * L.rh.w
    const x1 = L.rh.x + (158 / 190) * L.rh.w
    area({
      x: x0 - 9 * k, y: L.rh.y + L.rh.h * 0.02, w: x1 - x0 + 18 * k, h: L.rh.h * 0.80,
      onDrag: (mx) => {
        if (demo) S.current.demo = -1
        S.current.rat2 = clamp((mx - x0) / (x1 - x0), 0, 1)
        forceUpdate((n) => n + 1)
      },
    })
  }

  /* ── ② 电路图：V 并在灯上、A 外接、虚线框内滑变+电源+开关（照板书画） ── */
  function drawDividerSchematic(ctx, r, s, k) {
    const calc = solveCircuit(s.ratio, s.closed)
    softCard(ctx, r.x, r.y, r.w, r.h, '#FFFFFF', '#DFE7EC')
    T(ctx, '电路图：分压接法（虚线框内）＋ 电流表外接', r.x + 13 * k, r.y + 18 * k, {
      size: Math.round(10.6 * k), bold: true, color: '#25313A',
    })
    T(ctx, '点开关、拖滑片（都可动手）—— 表读数与灯亮跟着变', r.x + 13 * k, r.y + 33 * k, {
      size: Math.round(9 * k), color: '#5B6B5F',
    })

    const dark = '#1F2937'
    const red = '#C0392B'
    const green = '#15803D'
    const pink = '#D6336C'
    const lw = 2.1 * k

    const xL = r.x + 50 * k          // 左竖线＝0 V 结点
    const yV = r.y + 74 * k          // 电压表（在灯的正上方）
    const yLoad = r.y + 126 * k      // 灯 / 电流表这一行
    const yBack = r.y + 162 * k      // 电流表出来的线折回滑片
    const boxT = r.y + 182 * k
    const yRheo = r.y + 206 * k      // 滑变（虚线框内）
    const yBot = r.y + 248 * k       // 电源 / 开关这一行
    const boxB = r.y + 280 * k
    const bulbX = r.x + 106 * k
    const nodeR = bulbX + 26 * k
    const ax = r.x + 210 * k
    const xTurn = r.x + 310 * k
    const rheoLeft = r.x + 90 * k
    const rheoRight = r.x + r.w - 45 * k
    const barH = 15 * k
    const ratio = clamp(s.ratio, 0, 1)
    const wBox = rheoLeft + 92 * k  // 虚线框上边界的缺口位置（固定，与滑片无关）
    const wx = rheoLeft + (rheoRight - rheoLeft) * ratio
    const bx = r.x + 128 * k
    const sx = r.x + 232 * k
    const boxL = xL - 6 * k
    const boxR = rheoRight + 16 * k

    // 虚线框（圈住滑变 + 电源 + 开关），上边界在滑片箭头穿出处断开
    ctx.save()
    ctx.setLineDash([6 * k, 5 * k])
    ctx.strokeStyle = 'rgba(91,107,120,0.55)'
    ctx.lineWidth = 1.3 * k
    ctx.beginPath()
    ctx.moveTo(boxL, boxT); ctx.lineTo(wBox - 9 * k, boxT)
    ctx.moveTo(wBox + 9 * k, boxT); ctx.lineTo(boxR, boxT)
    ctx.moveTo(boxR, boxT); ctx.lineTo(boxR, boxB)
    ctx.moveTo(boxR, boxB); ctx.lineTo(boxL, boxB)
    ctx.moveTo(boxL, boxB); ctx.lineTo(boxL, boxT)
    ctx.stroke()
    ctx.restore()

    // 左竖线：灯左端（0 V）→ 滑变左端，并接到电源 −
    line(ctx, xL, yLoad, xL, yBot, dark, lw)
    line(ctx, xL, yRheo, rheoLeft, yRheo, dark, lw)

    // 底轨：电源 −（短板在左）→ 长板 + → 开关 → 滑变右端
    line(ctx, xL, yBot, bx, yBot, dark, lw)
    line(ctx, bx, yBot - 11 * k, bx, yBot + 11 * k, dark, 2.3 * k)
    line(ctx, bx + 10 * k, yBot - 16 * k, bx + 10 * k, yBot + 16 * k, dark, lw)
    line(ctx, bx + 10 * k, yBot, sx - 13 * k, yBot, dark, lw)
    T(ctx, '−', bx - 8 * k, yBot - 13 * k, {
      size: Math.round(10.5 * k), color: dark, bold: true, align: 'center',
    })
    T(ctx, '+', bx + 18 * k, yBot - 13 * k, {
      size: Math.round(10.5 * k), color: '#B3261E', bold: true, align: 'center',
    })
    T(ctx, '学生电源 3 V', bx + 6 * k, yBot + 23 * k, {
      size: Math.round(8.8 * k), color: '#4B5A66', align: 'center', bold: true,
    })

    // 开关：可点。断开时刀抬起、两个柱子之间不留连线
    if (s.closed) line(ctx, sx - 13 * k, yBot, sx + 12 * k, yBot, dark, 3.2 * k)
    else line(ctx, sx - 13 * k, yBot, sx + 11 * k, yBot - 15 * k, dark, lw)
    ctx.fillStyle = dark
    for (const px of [sx - 13 * k, sx + 12 * k]) {
      ctx.beginPath()
      ctx.arc(px, yBot, 2.4 * k, 0, Math.PI * 2)
      ctx.fill()
    }
    T(ctx, s.closed ? '开关（闭合）· 点一下断开' : '开关（断开）· 点一下闭合', sx, yBot + 23 * k, {
      size: Math.round(8.8 * k), color: s.closed ? green : '#4B5A66', align: 'center', bold: true,
    })
    line(ctx, sx + 12 * k, yBot, rheoRight, yBot, dark, lw)
    line(ctx, rheoRight, yBot, rheoRight, yRheo, dark, lw)

    // 滑变（框内长条）＋ 右下角引到电源 +
    ctx.fillStyle = '#EFDCC0'
    rr(ctx, rheoLeft, yRheo - barH / 2, rheoRight - rheoLeft, barH, 3)
    ctx.fill()
    // 正在并到灯两端的“取压段”（左端 0 V → 滑片）金色高亮
    if (wx - rheoLeft > 2 * k) {
      ctx.fillStyle = hexA('#E0A32A', s.closed ? 0.52 : 0.22)
      rr(ctx, rheoLeft, yRheo - barH / 2 + 1.2 * k, wx - rheoLeft, barH - 2.4 * k, 3)
      ctx.fill()
    }
    ctx.strokeStyle = '#B9925C'
    ctx.lineWidth = 1.2
    rr(ctx, rheoLeft, yRheo - barH / 2, rheoRight - rheoLeft, barH, 3)
    ctx.stroke()
    T(ctx, `滑动变阻器 ${RHEO} Ω（三端接成分压器）`, rheoRight - 2 * k, yRheo + 17 * k, {
      size: Math.round(8.8 * k), color: '#8A6C3C', align: 'right',
    })

    // 滑片：箭头从上方指进滑变（就是取压的那一点）
    line(ctx, wx, yBack, wx, yRheo - barH / 2 - 9 * k, red, lw)
    ctx.strokeStyle = red
    ctx.lineWidth = lw
    ctx.beginPath()
    ctx.moveTo(wx - 5 * k, yRheo - barH / 2 - 11 * k)
    ctx.lineTo(wx, yRheo - barH / 2 - 1)
    ctx.lineTo(wx + 5 * k, yRheo - barH / 2 - 11 * k)
    ctx.stroke()
    // （“分压接法”已在标题里，滑片处只留箭头，不压字）

    // 灯（⊗）＋ 左端接线；点亮时先铺一层暖光晕
    const lit = s.closed ? clamp(calc.U / BULB.Ur, 0, 1.15) : 0
    if (lit > 0.02) {
      const g = ctx.createRadialGradient(bulbX, yLoad, 3 * k, bulbX, yLoad, 42 * k)
      g.addColorStop(0, `rgba(255,206,120,${Math.min(0.5, 0.55 * lit)})`)
      g.addColorStop(1, 'rgba(255,206,120,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(bulbX, yLoad, 42 * k, 0, Math.PI * 2)
      ctx.fill()
    }
    line(ctx, xL, yLoad, bulbX - 20 * k, yLoad, red, lw)
    ctx.strokeStyle = red
    ctx.lineWidth = 2.0 * k
    ctx.beginPath()
    ctx.arc(bulbX, yLoad, 20 * k, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(bulbX - 14.1 * k, yLoad - 14.1 * k)
    ctx.lineTo(bulbX + 14.1 * k, yLoad + 14.1 * k)
    ctx.moveTo(bulbX + 14.1 * k, yLoad - 14.1 * k)
    ctx.lineTo(bulbX - 14.1 * k, yLoad + 14.1 * k)
    ctx.stroke()
    T(ctx, `小灯泡 ${BULB.Ur} V / ${BULB.Ir} A`, xL + 8 * k, yLoad + 46 * k, {
      size: Math.round(8.6 * k), color: '#B3261E', bold: true,
    })

    // 电流表（外接：串在灯外那条支路上）
    line(ctx, bulbX + 20 * k, yLoad, ax - 17 * k, yLoad, red, lw)
    ctx.strokeStyle = red
    ctx.lineWidth = 2.0 * k
    ctx.beginPath()
    ctx.arc(ax, yLoad, 17 * k, 0, Math.PI * 2)
    ctx.stroke()
    T(ctx, 'A', ax, yLoad + 1, { size: Math.round(12 * k), bold: true, color: '#B3261E', align: 'center' })
    T(ctx, `${calc.I.toFixed(3)} A`, ax, yLoad - 26 * k, {
      size: Math.round(10.5 * k), bold: true, color: '#B3261E', align: 'center', mono: true,
    })
    T(ctx, '外接', ax, yLoad + 26 * k, {
      size: Math.round(9 * k), color: '#6B7A83', align: 'center', bold: true,
    })
    // 电流表 → 折回滑片
    line(ctx, ax + 17 * k, yLoad, xTurn, yLoad, red, lw)
    line(ctx, xTurn, yLoad, xTurn, yBack, red, lw)
    line(ctx, xTurn, yBack, wx, yBack, red, lw)

    // 电压表：并在灯两端（两条竖引线落在灯端，横段接进 V 圆，整段是通的）
    line(ctx, bulbX - 26 * k, yLoad, bulbX - 26 * k, yV, green, 1.7 * k)
    line(ctx, nodeR, yLoad, nodeR, yV, green, 1.7 * k)
    line(ctx, bulbX - 26 * k, yV, bulbX - 17 * k, yV, green, 1.7 * k)
    line(ctx, bulbX + 17 * k, yV, nodeR, yV, green, 1.7 * k)
    ctx.strokeStyle = green
    ctx.lineWidth = 2.0 * k
    ctx.beginPath()
    ctx.arc(bulbX, yV, 17 * k, 0, Math.PI * 2)
    ctx.stroke()
    T(ctx, 'V', bulbX, yV + 1, { size: Math.round(12 * k), bold: true, color: green, align: 'center' })
    T(ctx, `${calc.U.toFixed(2)} V`, bulbX + 32 * k, yV + 1, {
      size: Math.round(10.5 * k), bold: true, color: green, mono: true,
    })

    // U 标注（灯两端电压）
    const uy = yLoad + 26 * k
    ctx.strokeStyle = pink
    ctx.lineWidth = 1.5 * k
    ctx.beginPath()
    ctx.moveTo(bulbX - 25 * k, uy)
    ctx.lineTo(bulbX + 25 * k, uy)
    ctx.moveTo(bulbX - 19 * k, uy - 4 * k); ctx.lineTo(bulbX - 25 * k, uy); ctx.lineTo(bulbX - 19 * k, uy + 4 * k)
    ctx.moveTo(bulbX + 19 * k, uy - 4 * k); ctx.lineTo(bulbX + 25 * k, uy); ctx.lineTo(bulbX + 19 * k, uy + 4 * k)
    ctx.stroke()
    T(ctx, 'U', bulbX + 31 * k, uy + 1, { size: Math.round(9.4 * k), bold: true, color: pink })

    // 结点
    ctx.fillStyle = '#3A464D'
    for (const [px, py] of [[xL, yLoad], [bulbX - 26 * k, yLoad], [nodeR, yLoad], [xL, yRheo], [xL, yBot], [rheoRight, yRheo]]) {
      ctx.beginPath()
      ctx.arc(px, py, 2.4 * k, 0, Math.PI * 2)
      ctx.fill()
    }

    // 可动手：开关点一下通/断、滑片拖着走（与第①步共用同一套 closed / ratio 状态）
    area({
      x: sx - 26 * k, y: yBot - 24 * k, w: 54 * k, h: 40 * k,
      onClick: () => {
        S.current.closed = !S.current.closed
        forceUpdate((n) => n + 1)
      },
    })
    area({
      x: rheoLeft - 6 * k, y: yRheo - 20 * k, w: rheoRight - rheoLeft + 12 * k, h: 40 * k,
      onDrag: (mx) => {
        S.current.ratio = clamp((mx - rheoLeft) / (rheoRight - rheoLeft), 0, 1)
        forceUpdate((n) => n + 1)
      },
    })
  }

  function stepWiring(ctx, c, s, k) {
    const colW = (c.w - 16 * k) / 2
    const lx = c.x
    const rx = c.x + colW + 16 * k
    const gapH = 12 * k

    // 左列：电路图 → 为什么分压 → 两种接法对比
    const left = [
      { kind: 'schematic', h: 296 * k },
      {
        kind: 'note', title: '为什么必须分压？', color: '#1565C0', fill: '#F5F9FE', stroke: '#D3E1F0',
        lines: [
          '曲线要“从 0 V 起”逐点测，才看得出低电压段怎么弯',
          '限流接法（滑变串在回路里）只能从某个电压往下调',
          '20 Ω 滑变配 1~8 Ω 的灯：最低也降不到 0.2 V 以下',
          '分压三端接法：滑片取出的电压 0 → 3 V 连续可调',
          '所以本实验一律分压，滑片从最左端（0 V 端）起步',
        ],
      },
      {
        kind: 'table',
        head: ['接法', '能否从 0 V 起', '可调范围'],
        rows: [
          ['限流（滑变串联）', '不能', '约 0.6 ~ 3 V'],
          ['分压（滑变三端）', '能', '0 ~ 3 V 连续'],
        ],
        color: '#1565C0',
        foot: '要“从 0 起、连续可调” → 只有分压做得到',
      },
    ]

    // 右列：外接误差 → 保护 → 错接 → 怎么记
    const right = [
      {
        kind: 'formula',
        rows: [
          { s: '电流表外接：V 并在灯上，A 串在外面（灯 R 小 → 外接更准）', bold: true, color: '#15803D' },
          { s: `外接误差 ≈ R/R_V = ${(BULB.Rr / R_V * 100).toFixed(2)}%（I 偏大一点点）` },
          { s: `内接误差 ≈ R_A/R ≈ ${(R_A / BULB.Rr * 100).toFixed(2)}% → 所以选外接`, color: '#B3261E' },
        ],
      },
      {
        kind: 'note', title: '保护灯泡：两条硬规矩', color: '#C2410C', fill: '#FFF4EE', stroke: '#F3D9C8',
        lines: [
          '电压别超额定太多：短时可超 10%~20%',
          '2.5 V 的灯最多约 2.75~3 V，再高会烧断',
          '必须从 0 V 往上加：冷态 R 只有 1.2 Ω',
          '直接上 2.5 V，瞬间电流约 2 A → 烧断',
          '灯亮着时读快一点：灯丝温度还在升，读数会漂',
        ],
      },
      {
        kind: 'note', title: '常见三种错接（考点）', color: '#7C3AED', fill: '#F7F4FF', stroke: '#DFD6F6',
        lines: [
          '把电压表并在变阻器上 → 读到的是取压段，不是灯的',
          '先合开关再放滑片 → 冷态直冲高压，灯丝易烧断',
          '电流表接成内接 → 0.1 Ω 与灯同量级，误差更大',
          '滑片没放最左端就合开关 → 曲线起点不再是 0 V',
        ],
      },
      {
        kind: 'note', title: '八点怎么取、怎么记', color: '#0F766E', fill: '#F2FBFA', stroke: '#CCE7E3',
        lines: [
          '每读一对 (U, I) 就记一行，顺手算 R = U/I',
          '0.2 V 起步、每 0.5 V 一点，低压段再补 0.2~0.3 V',
          '图上红点＋光滑曲线，别用直尺连成折线',
          '取到 2.3 V 就停：额定 2.5 V 附近只做趋势',
        ],
      },
    ]

    // 卡片按内容定高，两列最后撑到同一高度，避免列尾一大块空白
    const natH = (o) => {
      if (o.kind === 'schematic') return o.h
      if (o.kind === 'formula') return (16 + o.rows.length * 26) * k
      if (o.kind === 'table') return (24 + o.rows.length * 20 + (o.foot ? 24 : 6)) * k
      return 34 * k + (o.lines.length - 1) * 17 * k + 16 * k
    }
    const totalOf = (arr) => {
      arr.forEach((o) => { o.h = natH(o) })
      return arr.reduce((a, o) => a + o.h, 0) + gapH * (arr.length - 1)
    }
    const sumL = totalOf(left)
    const sumR = totalOf(right)
    const tableH = (24 + 6 * 20 + 24) * k
    // 卡片按内容定高（不留内部空洞），两列对齐到较高的一列，整块在页面里垂直居中，
    // 下方"柱到柱"表固定贴着内容区底边
    const blockH = Math.max(sumL, sumR)
    const stretch = (arr, sum) => {
      // 差的只是两列之间的高度差：均摊到卡片间距上，卡片本身不拉高
      return (blockH - sum) / Math.max(1, arr.length - 1)
    }
    const gapL = stretch(left, sumL)
    const gapR = stretch(right, sumR)

    const tableTop = c.y + c.h - tableH
    const freeH = tableTop - 14 * k - (c.y + 2 * k + blockH)
    const topY = c.y + 2 * k + Math.max(0, Math.min(freeH / 2, 46 * k))

    const drawCol = (arr, x, gapExtra) => {
      let y = topY
      arr.forEach((o) => {
        if (o.kind === 'schematic') {
          drawDividerSchematic(ctx, { x, y, w: colW, h: o.h }, s, k)
        } else if (o.kind === 'formula') formulaPlate(ctx, x, y, colW, k, o.rows)
        else if (o.kind === 'table') {
          miniTable(ctx, x, y, colW, k, { head: o.head, rows: o.rows, color: o.color, foot: o.foot })
        } else noteCard(ctx, x, y, colW, o.h, k, o)
        y += o.h + gapH + gapExtra
      })
      return y - gapH - gapExtra
    }
    drawCol(left, lx, gapL)
    const bottomR = drawCol(right, rx, gapR)

    // 底部横贯：柱到柱对照（照着插线就不会接错）
    const by = Math.max(tableTop, bottomR + 16 * k)
    miniTable(ctx, c.x, by, c.w, k, {
      head: ['柱到柱：照着这条线插（六根主线 + 两根电压表线）'],
      rows: [
        ['① 电源 + 红柱 → 开关 右柱 → 开关 左柱 → 滑变 右下柱（线圈右端，3 V 端）'],
        ['② 电源 − 黑柱 → 滑变 左下柱（0 V 端）'],
        ['③ 滑变 右上柱（滑片引出）→ 电流表 + 柱 → 电流表 − 柱（0.6 A）→ 灯泡 右柱'],
        ['④ 灯泡 左柱 → 电源 −（与滑变左下柱同一条线）'],
        ['⑤ 电压表 − 柱 → 灯泡 左柱，+ 柱 → 灯泡 右柱（并在灯两端，在电流表外）'],
        ['⑥ 插完别急着合开关：滑片停在最左端，请老师看一眼'],
      ],
      color: '#1565C0',
      foot: '一条主线串到底：电源 + → 开关 → 滑变右下柱；滑片（右上柱）取压 → 电流表 → 灯 → 电源 −（换量程、改接线前一律先断开开关）',
    })
  }

  /* ── ③ 记录与描点 ── */
  function stepRecord(ctx, c, s, k) {
    const leftW = c.w * 0.50
    const tblH = Math.min(250 * k, c.h * 0.44)
    const ideal = TARGETS.map((u) => bulbAt(u))
    const shown = Math.min(ideal.length, Math.floor(s.anim * 1.7))
    const rows = ideal.slice(0, Math.max(shown, 1)).map((d) => [
      d.U.toFixed(2), d.I.toFixed(3), d.R.toFixed(1),
    ])
    miniTable(ctx, c.x, c.y, leftW - 10 * k, k, {
      head: ['U / V', 'I / A', 'R = U/I / Ω'],
      rows,
      color: '#1565C0',
      foot: `已测 ${shown || 0} / ${ideal.length} 组：每读一对 (U,I) 顺手算 R`,
    })

    // 坐标纸描点
    const chart = { x: c.x, y: c.y + tblH + 12 * k, w: leftW - 10 * k, h: c.y + c.h - (c.y + tblH + 12 * k) }
    if (chart.h > 180 * k) {
      const base = plotFrame(ctx, chart, k, { xMax: 3, yMax: 0.4, xN: 6, yN: 4 })
      const pts = ideal.slice(0, shown).map((d) => ({ x: d.U, y: d.I }))
      if (shown >= ideal.length) {
        smoothPath(ctx, ideal.map((d) => ({ x: d.U, y: d.I })), base.X, base.Y, '#1E6FD0', 2.2 * k, clamp((s.anim - 4.7) * 1.6, 0, 1))
      }
      pts.forEach((p) => {
        ctx.fillStyle = '#C62828'
        ctx.beginPath()
        ctx.arc(base.X(p.x), base.Y(p.y), 3.4 * k, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = 'rgba(198,40,40,0.35)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(base.X(p.x), base.Y(p.y), 5.6 * k, 0, Math.PI * 2)
        ctx.stroke()
      })
      T(ctx, '描点 → 平滑连线（不能拿直尺连成折线）', chart.x + chart.w - 8 * k, chart.y + 18 * k, {
        size: Math.round(10 * k), color: '#1E6FD0', bold: true, align: 'right',
      })
    }

    const rx = c.x + c.w * 0.53
    const rw = c.w * 0.45
    let y = c.y + 2 * k
    const h1 = 130 * k
    noteCard(ctx, rx, y, rw, h1, k, {
      title: '取点与读数', color: '#C98A12', fill: '#FFFBF0', stroke: '#EADFC8',
      lines: [
        `电压从 0 起逐级升：课本按每升 0.5 V 读一次（0.5/1.0/…/2.5 V）`,
        `低压段再补 0.2、0.3 V 两点，低端才不会空一大段`,
        `电压读到 0.01 V，电流读到 0.001 A`,
        '同一状态别重复记：滑片一动就是一个新状态；接近额定时动作要快',
      ],
    })
    y += h1 + 12 * k

    const h2 = 108 * k
    noteCard(ctx, rx, y, rw, h2, k, {
      title: '坐标纸怎么画', color: '#1565C0', fill: '#F5F9FE', stroke: '#D3E1F0',
      lines: [
        `横轴 U：0 ~ 3 V，每格 0.5 V；纵轴 I：0 ~ 0.4 A，每格 0.1 A`,
        '让曲线大致落在图纸的对角线上，斜率才看得清',
        '点要画清楚，连成一条光滑曲线，不要逐点连折线',
      ],
    })
    y += h2 + 12 * k

    if (y + 120 * k < c.y + c.h) {
      softCard(ctx, rx, y, rw, 116 * k, '#FFFDF8', '#E8DCC8')
      T(ctx, '为什么要算 R = U/I 一起记？', rx + 12 * k, y + 18 * k, {
        size: Math.round(10.5 * k), bold: true, color: '#A3541C',
      })
      T(ctx, `· 曲线本身只说明 I 涨得慢，看不出“电阻在变大”`, rx + 12 * k, y + 40 * k, {
        size: Math.round(9.5 * k), color: '#5B6B5F',
      })
      T(ctx, `· 每个点的 R 一列摆出来，R 才是一条明显上扬的曲线`, rx + 12 * k, y + 60 * k, {
        size: Math.round(9.5 * k), color: '#5B6B5F',
      })
      T(ctx, `· 0.2 V 时 ${fmtOhm(ideal[0].R)}，2.3 V 时 ${fmtOhm(ideal[ideal.length - 1].R)}`, rx + 12 * k, y + 80 * k, {
        size: Math.round(9.5 * k), color: '#B3261E', bold: true,
      })
    }
    y += 116 * k + 12 * k
    if (y + 132 * k < c.y + c.h) {
      noteCard(ctx, rx, y, rw, 128 * k, k, {
        title: '三个常见坑', color: '#B3261E', fill: '#FFF6F5', stroke: '#F2D6D3',
        lines: [
          '滑片刚动就读：灯丝温度还没稳住，读数偏',
          '一口气连测十几点：灯丝越测越热，后段整体漂移',
          '把点连成折线：曲线看着有棱角，结论就歪了',
        ],
      })
    }
  }

  /* ── ④ 曲线与结论 ── */
  function stepCurve(ctx, c, s, k) {
    const leftW = c.w * 0.50
    const chart = { x: c.x, y: c.y + 16 * k, w: leftW - 10 * k, h: Math.min(c.h * 0.62, 420 * k) }
    const base = plotFrame(ctx, chart, k, { xMax: 3, yMax: 0.4, xN: 6, yN: 4 })

    // 定值电阻（8 Ω）对照
    const lin = []
    for (let u = 0; u <= 3; u += 0.25) lin.push({ x: u, y: Math.min(u / BULB.Rr, 0.4) })
    ctx.save()
    ctx.setLineDash([5 * k, 4 * k])
    smoothPath(ctx, lin, base.X, base.Y, '#8A9AA4', 1.8 * k, 0.9)
    ctx.restore()
    T(ctx, `定值电阻 8 Ω（直线）`, base.x1 - 4 * k, base.Y(0.058), {
      size: Math.round(9.5 * k), color: '#7A8790', align: 'right',
    })

    // 小灯泡实测曲线
    const lamp = []
    for (let u = 0; u <= 2.6; u += 0.1) lamp.push({ x: u, y: bulbAt(u).I })
    smoothPath(ctx, lamp, base.X, base.Y, '#C62828', 2.6 * k)
    T(ctx, '小灯泡：越往上越平', base.X(1.15), base.Y(0.075), {
      size: Math.round(10 * k), color: '#B3261E', bold: true,
    })
    // 斜率 = 1/R：过原点的割线（0.5 V 那一点）
    const low = bulbAt(0.5)
    const rayI = 0.375
    ctx.save()
    ctx.setLineDash([4 * k, 5 * k])
    ctx.beginPath()
    ctx.moveTo(base.X(0), base.Y(0))
    ctx.lineTo(base.X(rayI * low.R), base.Y(rayI))
    ctx.strokeStyle = 'rgba(21,101,192,0.8)'
    ctx.lineWidth = 1.6 * k
    ctx.stroke()
    ctx.restore()
    ctx.fillStyle = '#1565C0'
    ctx.beginPath()
    ctx.arc(base.X(0.5), base.Y(low.I), 2.6 * k, 0, Math.PI * 2)
    ctx.fill()
    T(ctx, `0.5 V 处斜率 = 1/R = ${(1 / low.R).toFixed(2)}`, base.X(0.97), base.Y(0.30), {
      size: Math.round(8.5 * k), color: '#1565C0', bold: true,
    })

    // 额定点
    const rated = bulbAt(BULB.Ur)
    ctx.fillStyle = '#C62828'
    ctx.beginPath()
    ctx.arc(base.X(BULB.Ur), base.Y(rated.I), 4 * k, 0, Math.PI * 2)
    ctx.fill()
    T(ctx, `额定 ${BULB.Ur} V / ${BULB.Ir} A`, base.X(BULB.Ur) - 10 * k, base.Y(0.365), {
      size: Math.round(9.5 * k), color: '#B3261E', align: 'right',
    })

    // 下方 R-U 条
    const barY = chart.y + chart.h + 12 * k
    const barH = c.y + c.h - barY
    if (barH > 96 * k) {
      softCard(ctx, c.x, barY, leftW - 10 * k, 104 * k, '#FFFFFF', '#E3E9ED')
      T(ctx, '同一批数据换个纵轴：R 随 U 一路涨', c.x + 12 * k, barY + 18 * k, {
        size: Math.round(10.5 * k), bold: true, color: '#15803D',
      })
      const segY = barY + 50 * k
      const segX0 = c.x + 16 * k
      const segX1 = c.x + leftW - 62 * k
      const fmt = [[0, 1.2], [0.5, bulbAt(0.5).R], [1.0, bulbAt(1).R], [1.5, bulbAt(1.5).R], [2.0, bulbAt(2).R], [2.5, 8.33]]
      const yMaxR = 9
      fmt.forEach(([u, R], i) => {
        const px = segX0 + (u / 2.5) * (segX1 - segX0)
        const hgt = (R / yMaxR) * 34 * k
        ctx.fillStyle = hexA('#15803D', 0.16 + i * 0.12)
        rr(ctx, px - 9 * k, segY - hgt, 18 * k, hgt, 4)
        ctx.fill()
        T(ctx, R.toFixed(1), px, segY - hgt - 8 * k, {
          size: Math.round(8.5 * k), color: '#15803D', align: 'center', bold: true,
        })
        T(ctx, `${u}`, px, segY + 10 * k, { size: Math.round(8.5 * k), color: '#6B7A83', align: 'center' })
      })
      T(ctx, 'U / V', segX1 + 38 * k, segY + 10 * k, { size: Math.round(8.5 * k), color: '#6B7A83', bold: true })
    }

    const rx = c.x + c.w * 0.53
    const rw = c.w * 0.45
    let y = c.y + 2 * k
    const h1 = 112 * k
    noteCard(ctx, rx, y, rw, h1, k, {
      title: '曲线为什么弯？', color: '#C62828', fill: '#FFF6F5', stroke: '#F2D6D3',
      lines: [
        'U ↑ → P = UI ↑ → 灯丝温度 ↑',
        '钨的电阻率随温度升高而变大 → R ↑',
        'R ↑ 以后，同样加 ΔU，ΔI 就变小 → 曲线变平',
      ],
    })
    y += h1 + 12 * k

    const h2 = 108 * k
    noteCard(ctx, rx, y, rw, h2, k, {
      title: '斜率就是 1/R', color: '#1565C0', fill: '#F5F9FE', stroke: '#D3E1F0',
      lines: [
        '曲线上一点与原点的连线，斜率 = I/U = 1/R',
        '低压段斜率大→R 小；额定处斜率小→R 大',
        '额定点的割线正好落在 8 Ω 那条直线上',
      ],
    })
    y += h2 + 12 * k

    const h3 = 100 * k
    noteCard(ctx, rx, y, rw, h3, k, {
      title: '欧姆定律的成立条件', color: '#7A5AA6', fill: '#F8F5FC', stroke: '#E2D8EE',
      lines: [
        'R 一定（温度不变）时，I 与 U 才成正比',
        '灯丝温度一直在变，所以 I-U 不是直线',
        '定值电阻、恒温条件 → 才是过原点的直线',
      ],
    })
    y += h3 + 12 * k

    const plateH = 138 * k
    if (y + plateH < c.y + c.h) {
      formulaPlate(ctx, rx, y, rw, k, [
        { s: '结论：小灯泡是非线性元件', bold: true, color: '#B3261E', size: 11 },
        { s: `R 从 ${fmtOhm(BULB.R0)}（冷）涨到 ${fmtOhm(BULB.Rr)}（额定）` },
        { s: '伏安曲线向下弯 = 电阻随温度升高' },
        { s: '误差：V 分流 → I 偏大 → 算出的 R 偏小', color: '#6B7A83' },
      ])
    }
    y += plateH + 12 * k

    const h4 = 104 * k
    if (y + h4 < c.y + c.h) {
      noteCard(ctx, rx, y, rw, h4, k, {
        title: '怎么判断线性 / 非线性', color: '#C98A12', fill: '#FFFBF0', stroke: '#EADFC8',
        lines: [
          '线性元件：I-U 是过原点的一条直线（定值电阻、恒温金属丝）',
          '非线性元件：曲线（二极管、白炽灯灯丝）',
          '判断方法就一句：先描出曲线，看它是不是过原点的直线',
        ],
      })
    }
  }

  /* ================================================================
   *  Tab 2：测量实验
   * ================================================================ */
  function renderLab(ctx, W, H) {
    const s = S.current
    const lay = layout(W, H)
    const b = lay.board
    const k = lay.k
    drawBoard(ctx, b)

    const pad = 14
    // ── 顶部说明 ──
    T(ctx, '限流接法 · 电流表外接', b.x + pad, b.y + 16 * k, {
      size: Math.round(12 * k), bold: true, color: '#25313A',
    })
    T(ctx, `滑变 ${RHEO} Ω 只用两头（下左柱 + 滑片柱）：滑片往右 → 串入电阻变大 → 灯变暗`,
      b.x + pad + 136 * k, b.y + 16 * k, { size: Math.round(10 * k), color: '#6B7A83' })

    // ── 数据面板 ──
    const dpw = lay.compact ? 0 : Math.min(330, b.w * 0.31)
    const dp = dpw
      ? { x: b.x + b.w - pad - dpw, y: b.y + 30 * k, w: dpw, h: b.h - 42 * k }
      : null
    const circ = {
      x: b.x + pad,
      y: b.y + 30 * k,
      w: b.w - pad * 2 - (dp ? dpw + 16 : 0),
      h: b.h - 42 * k,
    }

    const calc = solveLimit(s.rat2, s.closed)
    drawBench(ctx, circ, s, calc, k)

    if (dp) drawDataPanel(ctx, dp, s, calc, k)
    else {
      T(ctx, s.closed
        ? `U = ${calc.U.toFixed(2)} V · I = ${calc.I.toFixed(3)} A · R = ${fmtOhm(calc.R)} · 已记 ${s.points.length} 点`
        : '开关断开：先闭合开关，再拖滑片测 U、I',
      circ.x, circ.y + circ.h - 4 * k, {
        size: Math.round(10.5 * k), bold: true,
        color: s.closed ? '#25313A' : '#8A9AA4',
      })
    }

    // ── 右侧知识卡 ──
    if (lay.panel) {
      const out = drawKnowledgeCard(ctx, lay.panel, buildLabSections(s, calc), {
        title: '🧪 测量怎么做',
        scroll: s.cardScroll,
        tip: (c2, tx, ty) => {
          c2.fillStyle = '#B08954'
          c2.font = '11.5px "Microsoft YaHei", sans-serif'
          c2.textAlign = 'left'
          c2.textBaseline = 'middle'
          c2.fillText(s.closed
            ? `U = ${calc.U.toFixed(2)} V · I = ${calc.I.toFixed(3)} A · R = ${fmtOhm(calc.R)}`
            : '开关断开：先点开关闭合回路',
          tx, ty + 10)
        },
      })
      canvasRef.current._cardBox = out
        ? { x: lay.panel.x, y: lay.panel.y + 2, w: lay.panel.w, h: out.cardH, maxScroll: out.maxScroll, scroll: out.scroll }
        : null
    } else if (canvasRef.current) {
      canvasRef.current._cardBox = null
    }
  }

  function drawBench(ctx, c, s, calc, k) {
    // 器材全部换成全站统一的实拍图（与 electricSvgInstruments 同一套图、同一套接线柱坐标）
    const L = drawPhotoBench(ctx, c, s, calc, k, {
      ratio: s.rat2,
      vFrac: ease(s, 'v', s.closed ? calc.U / V_FS : 0),
      aFrac: ease(s, 'a', s.closed ? calc.I / A_FS : 0),
    })

    // ── 限流调节说明：放在「电流表下方 / 滑变上方」的右侧空档 ──
    const fx1 = Math.min(c.x + 0.62 * c.w, L.rh.x - 26 * k)
    const fx0 = Math.max(L.v.x + L.v.w + 20 * k, fx1 - Math.min(240 * k, c.w * 0.33))
    const y0 = L.a.y + L.a.h + 26 * k
    const barY = y0 + 22 * k
    const barH = 15 * k
    const Rr = RHEO * clamp(s.rat2, 0, 1)
    T(ctx, `滑变 ${RHEO} Ω · 限流串联（往右 R 变大）`, fx0, y0, {
      size: Math.round(10.5 * k), bold: true, color: '#25313A',
    })
    ctx.fillStyle = '#E9EFF2'
    rr(ctx, fx0, barY, fx1 - fx0, barH, 7)
    ctx.fill()
    const xi = fx0 + clamp(s.rat2, 0, 1) * (fx1 - fx0)
    ctx.fillStyle = hexA('#15803D', 0.3)
    rr(ctx, fx0, barY, Math.max(8 * k, xi - fx0), barH, 7)
    ctx.fill()
    ctx.fillStyle = '#1565C0'
    ctx.beginPath()
    ctx.moveTo(xi, barY - 3 * k)
    ctx.lineTo(xi - 5 * k, barY - 10 * k)
    ctx.lineTo(xi + 5 * k, barY - 10 * k)
    ctx.closePath()
    ctx.fill()
    line(ctx, xi, barY - 2 * k, xi, barY + barH + 2 * k, '#1565C0', 2 * k)
    T(ctx, 'R = 0 Ω　灯最亮', fx0, barY + barH + 12 * k, { size: Math.round(8.5 * k), color: '#6B7A83' })
    T(ctx, `R = ${RHEO} Ω　灯最暗`, fx1, barY + barH + 12 * k, {
      size: Math.round(8.5 * k), color: '#6B7A83', align: 'right',
    })
    const coldRisk = s.closed && s.points.length === 0 && calc.U > 1.6
    if (s.closed && Rr > RHEO * 0.94) {
      T(ctx, '滑片在最右端：R 最大、灯最暗（合开关前就该放这儿）', fx0, barY + barH + 30 * k, {
        size: Math.round(9 * k), color: '#1565C0', bold: true,
      })
      T(ctx, '确认接线无误，再往左慢慢拖：R 变小、灯渐亮', fx0, barY + barH + 44 * k, {
        size: Math.round(9 * k), color: '#4B5A66',
      })
    } else if (s.closed && calc.U > BULB.Ur * 1.1) {
      T(ctx, `⚠ 灯端 ${calc.U.toFixed(2)} V：已超额定 ${BULB.Ur} V`, fx0, barY + barH + 30 * k,
        { size: Math.round(9 * k), color: '#C62828', bold: true })
      T(ctx, '往右退一点（串入 R 变大），别把灯丝烧了', fx0, barY + barH + 44 * k,
        { size: Math.round(9 * k), color: '#C62828' })
    } else {
      T(ctx, `串入 R = ${Rr.toFixed(1)} Ω → 灯端 ${calc.U.toFixed(2)} V`,
        fx0, barY + barH + 30 * k, { size: Math.round(9 * k), color: '#4B5A66', bold: s.closed })
      T(ctx, s.closed ? '灯丝一热电阻就变大，电压以表读数为准' : '开关断开：先接线，再闭合',
        fx0, barY + barH + 44 * k, { size: Math.round(9 * k), color: '#6B7A83' })
    }
    const pills = ['① 合开关', '② 拖滑片', '③ 记录一点']
    const pillW = (fx1 - fx0 - 12 * k) / 3
    pills.forEach((t, i) => {
      chip(ctx, fx0 + i * (pillW + 6 * k), barY + barH + 58 * k, pillW, 22 * k, t, '#1565C0', k)
    })

    // ── 读数条 ──
    const stY = Math.min(L.benchY + 30 * k, c.y + c.h - 74 * k)
    const stW = Math.min(124 * k, c.w * 0.20)
    const stText = calc.U > BULB.Ur * 1.1
      ? '已超额定 2.5 V'
      : coldRisk ? '⚠ 冷态上高压'
        : s.closed ? (Rr > RHEO * 0.94 ? 'R 最大·灯最暗' : '正在测量') : '开关断开'
    const sts = [
      { t: `U ${calc.U.toFixed(2)} V`, c: '#4B5A66' },
      { t: `I ${calc.I.toFixed(3)} A`, c: '#B3261E' },
      { t: `R ${fmtOhm(calc.R)}`, c: '#15803D' },
      { t: stText, c: calc.U > BULB.Ur * 1.1 || coldRisk ? '#C62828' : s.closed && calc.U < 0.02 ? '#1565C0' : '#8A9AA4' },
    ]
    sts.forEach((it, i) => {
      chip(ctx, c.x + i * (stW + 6 * k), stY, stW, 26 * k, it.t, it.c, k)
    })

    // ── 按钮 ──
    const btnY = c.y + c.h - 34 * k
    const btnH = 28 * k
    const defs = [
      { t: '📋 记录一点', w: 100 * k, color: '#15803D', fn: recordPoint },
      { t: '⚡ 一键描八点', w: 118 * k, color: '#1565C0', fn: autoEight },
      { t: '🧹 清空', w: 74 * k, color: '#8A9AA4', fn: () => { S.current.points = []; forceUpdate((n) => n + 1) } },
    ]
    let tot = 0
    defs.forEach((d) => { tot += d.w + 8 * k })
    let bx = c.x + c.w - tot + 8 * k
    defs.forEach((d) => {
      drawButton(ctx, bx, btnY, d.w, btnH, d.t, d.color, true, k)
      area({ x: bx, y: btnY, w: d.w, h: btnH, onClick: d.fn })
      bx += d.w + 8 * k
    })

    // ── 交互：点开关 / 拖滑片 ──
    benchHits(L, k, false)
  }

  /* ── 记录 / 自动描点（限流台：滑片位置 rat2） ── */
  function recordPoint() {
    const s = S.current
    if (!s.closed) return
    const c = solveLimit(s.rat2, true)
    if (c.U < 0.03) return
    const keep = s.points.filter((p) => Math.abs(p.U - c.U) > 0.02)
    s.points = [...keep, { U: c.U, I: c.I, R: c.R }].sort((p, q) => p.U - q.U).slice(-MAX_POINTS)
    forceUpdate((n) => n + 1)
  }

  function autoEight() {
    const s = S.current
    s.closed = true
    const pts = []
    let lastPos = s.rat2
    for (const target of TARGETS) {
      const r = ratioForULimit(target)
      const c = solveLimit(r, true)
      if (c.U > 0.03) pts.push({ U: c.U, I: c.I, R: c.R })
      lastPos = r
    }
    s.points = pts.sort((p, q) => p.U - q.U).slice(-MAX_POINTS)
    s.rat2 = lastPos
    forceUpdate((n) => n + 1)
  }

  /* ── 数据面板 ── */
  function drawDataPanel(ctx, r, s, calc, k) {
    ctx.save()
    ctx.shadowColor = 'rgba(74,94,84,0.12)'
    ctx.shadowBlur = 14
    ctx.shadowOffsetY = 4
    ctx.fillStyle = '#FFFFFF'
    rr(ctx, r.x, r.y, r.w, r.h, 12)
    ctx.fill()
    ctx.restore()
    ctx.strokeStyle = '#DFE7EC'
    ctx.lineWidth = 1
    rr(ctx, r.x, r.y, r.w, r.h, 12)
    ctx.stroke()

    const px = r.x + 14
    const pw = r.w - 28
    let y = r.y + 22
    T(ctx, '📋 数据记录', px, y, { size: Math.round(12.5 * k), bold: true, color: '#25313A' })
    T(ctx, `${s.points.length} / ${MAX_POINTS} 组`, px + pw, y, {
      size: Math.round(10 * k), color: '#7A8790', align: 'right',
    })
    y += 20
    T(ctx, `小灯泡 ${BULB.Ur} V ${BULB.Ir} A · 限流接法 · 电流表外接`, px, y, {
      size: Math.round(9.5 * k), color: '#6B7A83',
    })
    y += 22

    // 表头
    const col = [px, px + pw * 0.40, px + pw * 0.72, px + pw]
    ctx.fillStyle = '#F4F8FA'
    rr(ctx, px - 4, y - 10, pw + 8, 22, 6)
    ctx.fill()
    T(ctx, 'U / V', col[0] + 4, y + 1, { size: Math.round(9.5 * k), color: '#7A8790', bold: true })
    T(ctx, 'I / A', col[1], y + 1, { size: Math.round(9.5 * k), color: '#7A8790', bold: true, align: 'right' })
    T(ctx, 'R / Ω', col[2], y + 1, { size: Math.round(9.5 * k), color: '#7A8790', bold: true, align: 'right' })
    y += 24

    const shown = s.points.slice(-9)
    if (!shown.length) {
      T(ctx, s.closed ? '拖滑片到某一电压 → 点「记录一点」' : '先闭合开关，再拖滑片取读数', px + 4, y + 8, {
        size: Math.round(10 * k), color: '#9AA7AF',
      })
      y += 30
    } else {
      shown.forEach((p) => {
        T(ctx, p.U.toFixed(2), col[0] + 4, y, { size: Math.round(10 * k), color: '#4B5A66', mono: true })
        T(ctx, p.I.toFixed(3), col[1], y, { size: Math.round(10 * k), color: '#25313A', mono: true, align: 'right' })
        T(ctx, p.R.toFixed(1), col[2], y, { size: Math.round(10 * k), color: '#15803D', mono: true, align: 'right' })
        y += 20
      })
      y += 4
    }

    // 图表切换
    const pillW = 66 * k
    const pillH = 24 * k
    const modes = [
      { id: 'iv', t: 'I–U 图', c: '#1565C0' },
      { id: 'ru', t: 'R–U 图', c: '#15803D' },
    ]
    modes.forEach((m, i) => {
      const on = s.chart === m.id
      const mx = px + i * (pillW + 6 * k)
      ctx.save()
      ctx.fillStyle = on ? m.c : 'rgba(255,255,255,0.92)'
      rr(ctx, mx, y, pillW, pillH, pillH / 2)
      ctx.fill()
      ctx.strokeStyle = on ? m.c : '#D2DDE4'
      ctx.lineWidth = 1
      rr(ctx, mx, y, pillW, pillH, pillH / 2)
      ctx.stroke()
      T(ctx, m.t, mx + pillW / 2, y + pillH / 2 + 1, {
        size: Math.round(10 * k), bold: true, align: 'center', color: on ? '#fff' : '#556876',
      })
      ctx.restore()
      areaSink({ x: mx, y, w: pillW, h: pillH, onClick: () => { S.current.chart = m.id; forceUpdate((n) => n + 1) } })
    })
    T(ctx, s.chart === 'iv' ? '看 I 涨得越来越慢' : '看 R 一路变大', px + 2 * (pillW + 6 * k) + 4 * k, y + pillH / 2, {
      size: Math.round(9 * k), color: '#8A9AA4',
    })
    y += pillH + 12 * k

    // 图表
    const noteH = 96 * k
    const chartH = Math.max(130 * k, r.y + r.h - 16 - noteH - y)
    const chart = { x: px, y, w: pw, h: chartH }
    if (s.chart === 'iv') {
      const base = plotFrame(ctx, chart, k, { xMax: 3, yMax: 0.4, xN: 6, yN: 4 })
      const pts = s.points.map((p) => ({ x: p.U, y: p.I }))
      // 过原点与最后一点的连线：斜率 = 1/R
      if (pts.length >= 2) {
        const last = pts[pts.length - 1]
        ctx.save()
        ctx.setLineDash([4 * k, 4 * k])
        ctx.beginPath()
        ctx.moveTo(base.X(0), base.Y(0))
        ctx.lineTo(base.X(last.x), base.Y(last.y))
        ctx.strokeStyle = 'rgba(21,101,192,0.55)'
        ctx.lineWidth = 1.3 * k
        ctx.stroke()
        ctx.restore()
        T(ctx, `斜率 = 1/R = ${(last.y / last.x).toFixed(2)}`, base.X(last.x * 0.60), base.Y(last.y * 0.60) - 7 * k, {
          size: Math.round(8 * k), color: '#1565C0', align: 'right',
        })
      }
      if (pts.length >= 2) smoothPath(ctx, pts, base.X, base.Y, '#1E6FD0', 2 * k)
      pts.forEach((p) => {
        ctx.fillStyle = '#C62828'
        ctx.beginPath()
        ctx.arc(base.X(p.x), base.Y(p.y), 3.2 * k, 0, Math.PI * 2)
        ctx.fill()
      })
      // 当前状态（空心圈）
      if (s.closed && calc.U > 0.03) {
        ctx.strokeStyle = '#EF6C00'
        ctx.lineWidth = 1.6 * k
        ctx.beginPath()
        ctx.arc(base.X(calc.U), base.Y(calc.I), 5.2 * k, 0, Math.PI * 2)
        ctx.stroke()
      }
      if (!pts.length) {
        T(ctx, '还没有记录点', chart.x + chart.w / 2, chart.y + chart.h / 2 - 8 * k, {
          size: Math.round(10.5 * k), color: '#B6C2CA', align: 'center', bold: true,
        })
        T(ctx, '闭合开关 → 拖滑片 → 记录', chart.x + chart.w / 2, chart.y + chart.h / 2 + 10 * k, {
          size: Math.round(9.5 * k), color: '#C3CDD3', align: 'center',
        })
      } else {
        T(ctx, '红点＝已记录 · 橙圈＝当前读数', chart.x + 6 * k, chart.y + chart.h - 8 * k, {
          size: Math.round(8.5 * k), color: '#8A9AA4',
        })
      }
    } else {
      const base = plotFrame(ctx, chart, k, {
        xMax: 3, yMax: 9, xN: 6, yN: 9, yTitle: 'R / Ω', yFmt: (v) => v.toFixed(0),
      })
      const pts = s.points.map((p) => ({ x: p.U, y: p.R }))
      if (pts.length >= 2) smoothPath(ctx, pts, base.X, base.Y, '#15803D', 2 * k)
      pts.forEach((p) => {
        ctx.fillStyle = '#15803D'
        ctx.beginPath()
        ctx.arc(base.X(p.x), base.Y(p.y), 3.2 * k, 0, Math.PI * 2)
        ctx.fill()
        T(ctx, p.y.toFixed(1), base.X(p.x), base.Y(p.y) - 10 * k, {
          size: Math.round(8 * k), color: '#15803D', align: 'center',
        })
      })
      if (!pts.length) {
        T(ctx, '切到 I–U 先记几个点，再回来看 R', chart.x + chart.w / 2, chart.y + chart.h / 2, {
          size: Math.round(10 * k), color: '#B6C2CA', align: 'center',
        })
      }
    }
    y += chartH + 10 * k

    // 底部提示
    const hintH = Math.min(noteH, r.y + r.h - 14 - y)
    if (hintH > 40) {
      softCard(ctx, px, y, pw, hintH, '#FBF8F2', '#EADFC8')
      const lines = s.points.length >= 4
        ? [
          `最低 ${s.points[0].U.toFixed(2)} V 时 R = ${fmtOhm(s.points[0].R)}`,
          `最高 ${s.points[s.points.length - 1].U.toFixed(2)} V 时 R = ${fmtOhm(s.points[s.points.length - 1].R)}`,
          'R 一路上扬 → 灯丝温度升高 → 曲线向下弯',
        ]
        : [
          '取 8 点左右，从 0.2 V 铺到 2.3 V',
          '每点记 (U, I)，R = U/I 顺手算出来',
          '曲线上每点的斜率就是该处的 1/R',
        ]
      const useN = Math.min(3, Math.floor((hintH - 24) / 16))
      lines.slice(0, useN).forEach((t, i) => {
        T(ctx, `· ${t}`, px + 12, y + 24 + i * 16, { size: Math.round(9.5 * k), color: '#5B6B5F' })
      })
    }
  }

  /* ================================================================
   *  知识卡
   * ================================================================ */
  function buildSections() {
    return [
      {
        t: '实验目的', c: '#E0761F',
        items: [
          [['测绘小灯泡的 I-U 图，从图上看出'], ['灯丝电阻随温度变化', '#C2410C', 1], ['的规律。']],
          [['掌握分压接法：电压要从 '], ['0 V 起', '#C2410C', 1], ['连续可调，限流接法做不到。']],
          [['会用 '], ['R = U/I', '#DC2626', 1], [' 逐点算电阻，说清“曲线为什么弯”。']],
        ],
      },
      {
        t: '为什么选小灯泡', c: '#C98A12',
        items: [
          [['灯丝是钨丝，温度一高电阻率就变大，是现成的'], ['非线性元件', '#C2410C', 1], ['。']],
          [['冷态 '], [fmtOhm(BULB.R0), '#C2410C', 1], [' → 额定 2.5 V 时 '], [fmtOhm(BULB.Rr), '#C2410C', 1], ['，涨了近 7 倍。']],
          [['同样加 ΔU，低温段电流涨得快，高温段涨得慢 → 曲线上平下陡。']],
        ],
      },
      {
        t: '分压接法（三端）', c: '#1565C0',
        items: [
          [['滑变的'], ['两个固定端', '#1565C0', 1], ['接电源（跨接全长），'], ['滑片', '#1565C0', 1], ['引出一根给负载。']],
          [['滑片滑到一端时负载电压为 0，滑到另一端接近电源电压 → '], ['0 ~ 3 V 连续可调', '#DC2626', 1], ['。']],
          [['接线顺序：电源与开关先串好，'], ['开关断开', '#DC2626', 1], ['，滑片先放到 0 端。']],
        ],
      },
      {
        t: '电流表外接', c: '#15803D',
        items: [
          [['灯丝电阻只有几欧，属于'], ['小电阻', '#15803D', 1], ['，应把电压表'], ['直接并在灯泡两端', '#15803D', 1], ['（外接）。']],
          [['外接误差 ≈ R/R_V = '], [`${(BULB.Rr / R_V * 100).toFixed(2)}%`, '#C2410C', 1], ['；内接误差 ≈ R_A/R ≈ '], [`${(R_A / BULB.Rr * 100).toFixed(2)}%`, '#C2410C', 1], ['。']],
          [['所以外接的 I 读数略偏大，但比内接好得多。']],
        ],
      },
      {
        t: '数据与描点', c: '#C2410C',
        items: [
          [['每读一对 '], ['(U, I)', '#DC2626', 1], [' 就记一行，并算 '], ['R = U/I', '#DC2626', 1], ['。']],
          [['取 8 点上下，从 0.2 V 铺到 2.3 V，别挤在中间；接近额定要快测。']],
          [['描点后连成'], ['光滑曲线', '#DC2626', 1], ['，不要用直尺逐点连折线。']],
        ],
      },
      {
        t: '结论与误差', c: '#B3261E',
        items: [
          [['I-U 图不是直线：越往上越平 → '], ['R 随 U（温度）升高而增大', '#DC2626', 1], ['。']],
          [['欧姆定律只在'], ['温度不变', '#1565C0', 1], ['（R 一定）时成立，灯丝不满足这个条件。']],
          [['误差来源：电压表分流使 I 偏大 → 算出的 R 偏小；灯丝升温漂移、接触电阻也会带来偏差。']],
        ],
      },
      {
        t: '注意事项', c: '#DC2626',
        items: [
          [['电压不要超过 '], ['2.5 V', '#DC2626', 1], ['，否则灯丝过热、寿命骤减甚至烧断。']],
          [['改线、换量程前先'], ['断开开关', '#DC2626', 1], ['；电流表用 0.6 A 档，电压表用 3 V 档。']],
          [['灯丝亮着时读数要快：温度还在升，数据会漂。']],
        ],
      },
    ]
  }

  function buildLabSections(s, calc) {
    return [
      {
        t: '当前读数', c: '#1565C0',
        items: [
          [['电压表 U = '], [`${calc.U.toFixed(2)} V`, '#C2410C', 1], ['（并在灯两端），电流表 I = '], [`${calc.I.toFixed(3)} A`, '#C2410C', 1], ['。']],
          [['灯泡功率 P = UI = '], [`${calc.P.toFixed(2)} W`, '#15803D', 1], ['，实测 '], [`R = ${fmtOhm(calc.R)}`, '#15803D', 1], ['。']],
          [['串入电阻 '], [`R = ${(RHEO * clamp(s.rat2, 0, 1)).toFixed(1)} Ω`, '#4B5A66', 1], ['（滑片在 '], [`${(clamp(s.rat2, 0, 1) * 100).toFixed(0)}%`, '#4B5A66', 1], [' 处）：越往右串入越多，灯越暗。']],
        ],
      },
      {
        t: '接线（限流 + 外接）', c: '#15803D',
        items: [
          [['滑变'], ['只用两头', '#15803D', 1], ['：下左柱串进回路（电源 + → 开关 → 下左柱），'], ['滑片柱', '#15803D', 1], ['引出一根接电流表 3 A 柱。']],
          [['灯泡串电流表后回到电源 −；电压表'], ['直接并在灯泡两端', '#15803D', 1], ['。']],
          [['滑片先拧到'], ['阻值最大处（最右）', '#DC2626', 1], ['再闭合开关，测完先断开再改线。']],
        ],
      },
      {
        t: '怎么测、怎么记', c: '#C98A12',
        items: [
          [['滑片先放最右（R 最大、灯最暗）再闭合开关，然后'], ['往左拖：R 变小、电压往上加', '#C2410C', 1], ['。']],
          [['课本做法：电压每升 '], ['0.5 V', '#DC2626', 1], [' 读一次（0.5 / 1.0 / … / 2.5 V），低压段再补 0.2、0.3 V 两点。']],
          [['本台子取 8 点：0.2 / 0.5 / … / 2.3 V（滑变串到底 R = 20 Ω 时最低约 0.2 V，所以 0 V 这一段这台子测不到）。']],
          [['电压读 0.01 V、电流读 0.001 A，R = U/I 一并写下；接近额定时动作要快。']],
        ],
      },
      {
        t: '图怎么读', c: '#C2410C',
        items: [
          [['I–U 图：曲线'], ['向下弯', '#DC2626', 1], ['，斜率 = 1/R 逐点变小 → 说明 R 在变大。']],
          [['R–U 图：一条'], ['明显上扬', '#15803D', 1], ['的曲线，从 1 点几欧一直涨到 8 欧以上。']],
          [['同一组数据换纵轴就能互相印证：不是仪器坏了，是灯丝真的变了。']],
        ],
      },
      {
        t: '保护灯泡', c: '#DC2626',
        items: [
          [['电压别超额定太多：短时可超 '], ['10%~20%', '#DC2626', 1], ['（2.5 V 的灯最多约 2.75~3 V），长时间超压灯丝会烧断。']],
          [['必须从低压往上加：冷态 R 只有 1.2 Ω，直接上 2.5 V 瞬间电流可达 2 A。']],
        ],
      },
      {
        t: '误差从哪来', c: '#B3261E',
        items: [
          [['电压表分流：I 读数 = I灯 + I_V，比真实灯丝电流略大 → '], ['R 算偏小', '#DC2626', 1], ['。']],
          [['按内阻算，外接时 I 偏大约 0.3%，属于'], ['系统误差', '#B3261E', 1], ['。']],
          [['仪器精度、读数估位、作图不准 → '], ['偶然误差', '#B3261E', 1], ['，多测几点取平滑曲线。']],
          [['灯座接触电阻、导线电阻在低电压段占比大，曲线起点可能不过原点。']],
        ],
      },
      {
        t: '合格数据长什么样', c: '#7C3AED',
        items: [
          [['8 个点大致落在一条光滑下弯的曲线上，不出现折点或回勾。']],
          [['0.2 V 附近 I 约 0.13 A，2.3 V 附近 I 约 0.30 A。']],
          [['R 单调递增，没有忽大忽小 —— 有跳变多半是接触不良。']],
        ],
      },
    ]
  }

  /* ================================================================
   *  交互
   * ================================================================ */
  const getPos = (e) => eventToCanvas(canvasRef.current, e)

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    const { x, y } = getPos(e)
    const box = canvasRef.current._cardBox
    if (box && box.maxScroll > 0 && x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
      S.current.cardDrag = { y0: y, s0: S.current.cardScroll }
      return
    }
    for (const a of canvasRef.current._clickAreas) {
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) {
        S.current.dragArea = a.onDrag ? a : null
        a.onClick?.(x, y)
        return
      }
    }
  }, [])

  const handleMouseMove = useCallback((e) => {
    const { x, y } = getPos(e)
    const s = S.current
    if (s.cardDrag) {
      const box = canvasRef.current._cardBox
      const b = s.cardDrag
      s.cardScroll = Math.max(0, Math.min(box?.maxScroll || 0, b.s0 - (y - b.y0)))
      forceUpdate((n) => n + 1)
      return
    }
    if (s.dragArea) {
      s.dragArea.onDrag(x)
      return
    }
    const areas = canvasRef.current._clickAreas
    let hit = null
    for (const a of areas) {
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { hit = a; break }
    }
    const cv = canvasRef.current
    if (cv) cv.style.cursor = hit ? (hit.onDrag ? 'ew-resize' : 'pointer') : 'default'
  }, [])

  const handleMouseUp = useCallback(() => {
    S.current.dragArea = null
    S.current.cardDrag = null
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
    S.current = defaultState()
    S.current.tab = tab
    forceUpdate((n) => n + 1)
  }, [tab])

  /* ================================================================
   *  React 渲染
   * ================================================================ */
  return (
    <SceneShell
      title="测绘小灯泡伏安特性曲线"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t); S.current.dragArea = null; S.current.cardDrag = null }}
      tab1Label="📖 原理与接法"
      tab2Label="🔬 测量实验"
      onReset={handleReset}
      desc={tab === 1 ? (
        <>
          <b>测绘小灯泡伏安特性曲线</b>
          <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
            原理看分压接法 · 实验台照「自己动手」用滑变限流（只用两端）· 电流表外接 · 逐点记录 (U, I)
          </span>
        </>
      ) : null}
    >
      <div style={{ display: 'flex', flexDirection: 'row', flex: 1, minHeight: 0, width: '100%' }}>
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
            ? '看清灯丝电阻随温度变化的本质，掌握分压接法与电流表外接的接法，知道曲线为什么要逐点点描。'
            : '按限流接法（滑变只用两端）接好台子，拖动滑片逐点读出 (U, I)，记录 8 组数据，描出小灯泡的 I–U 曲线并解释它为什么向下弯。'}
          steps={tab === 1 ? [
            '① 拉电压滑条：看同一只灯泡的 R 怎么随 U 变大',
            '② 看分压接法电路图：三端怎么接、A 为什么串在外、V 为什么并在灯上',
            '③ 看描点过程：表里 8 组数据一个个落到坐标纸上',
            '④ 看结论：灯泡曲线与 8 Ω 定值电阻直线对比',
          ] : [
            '合开关前把滑片放到最右（R 最大、灯最暗），再拖滑片往左加电压',
            '读电压表、电流表，点「记录一点」；或点「一键描八点」',
            '在右侧看 I–U 曲线与 R–U 曲线，说明 R 为什么越来越大',
          ]}
          hint={tab === 1
            ? '关键一句：灯丝温度升高 → R 变大 → I 涨得慢，曲线向下弯；欧姆定律只在恒温（R 一定）时成立。'
            : '限流台：滑片越往右 R 越大、灯越暗（最低约 0.2 V）；电流表外接误差约 0.3%，内接要 1.2%，所以选外接。'}
        />
      </div>
    </SceneShell>
  )
}

