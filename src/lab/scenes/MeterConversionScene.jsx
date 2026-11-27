import { useState, useRef, useEffect, useCallback } from 'react'
import { eventToCanvas } from '../utils/pointerPos'
import SceneShell from '../ui/SceneShell'
import InfoDock from '../ui/InfoDock'
import { drawKnowledgeCard } from '../ui/knowledgeCard'
import { resistorBands } from '../render/parts.js'

/**
 * MeterConversionScene — 电表改装与校准（高中 · 必修三）
 *
 * 教学链路照「看见光子 3D 物理·电表改装」逐条落地：
 *   ① 表头 G：Ig、Rg 两个参数，满偏电压 Ug = Ig·Rg ≈ 0.1 V，只能测极小电流/电压；
 *   ② 改装电流表：G 并联小电阻 Rs 分流，Ig·Rg = (I−Ig)·Rs → Rs = Ig·Rg/(I−Ig) = Rg/(n−1)；
 *   ③ 改装电压表：G 串联大电阻 Rf 分压，U = Ig(Rg+Rf) → Rf = U/Ig − Rg = Rg(n−1)；
 *   ④ 本质：表头本身没变，变的是外接电阻与重新标注的刻度；RA 随量程增大而减小、RV 随量程增大而增大。
 *
 * Tab1「原理演示」：四步分镜 + 蓝壳 G / 红壳 A / 红壳 V 实物仪器 + 实时数值；
 * Tab2「校准实验」：标准表与改装表同测一个量，调滑变逐点比对，给出偏差与合格判定；
 *        另设「误差注入」——把 Rs / Rf 的实际值调偏，验证视频里两条高频误差规律：
 *        Rs 偏大 → 表头电流偏大 → 读数偏大；Rf 偏大 → 表头电压偏小 → 读数偏小。
 *
 * 物理口径（全部真算，不是贴图）：
 *   电流表回路：3 V 电池组 + 20 Ω 滑变 + 标准表 + 改装表串联，I = 3/(0.2+R滑+RA+0.01)；
 *   电压表回路：3 V / 15 V 电源 + 滑变分压，U = 电源电压 × 分压比；
 *   改装表读数 = 表头偏转角 × 新量程，标准表读数 = 真值，偏差 δ = (读−标)/标。
 */

const A_SET = [0.6, 1, 3]          // 改装电流表量程（A）
const V_SET = [1, 3, 15]           // 改装电压表量程（V）
const MAX_POINTS = 6               // 校准记录最多保留 6 点
const PASS_ERR = 2.5               // 校准合格线：相对偏差 ≤ 2.5%

const THEME = {
  blue: ['#4C97E8', '#1E6FD0', '#0F4A93'],
  red: ['#EF5F57', '#C62828', '#8C1717'],
  wine: ['#C45550', '#9A2F2C', '#671917'],
  dark: ['#5E6B75', '#3B454D', '#232A30'],
}

const STEPS = ['认识表头 G', '改装电流表', '改装电压表', '改装的本质']
const STEP_SUB = [
  '表头只能吃到满偏电流 Ig，两端最多承受 Ug = Ig·Rg —— 想测大电流、高电压，必须先改装。',
  '并联 → 分流：两支路电压相等，小电阻 Rs 分走大部分电流，表头仍然只流过 Ig。',
  '串联 → 分压：回路电流处处相等，大电阻 Rf 分走大部分电压，表头仍然只分到 Ug。',
  '表头 Ig、Rg 一点没变；变的只是外接电阻，以及重新标注过的表盘刻度。',
]

/** 表头参数（教学量级）。igMa 单位 mA，rg 单位 Ω。默认照视频：1 mA / 100 Ω。 */
function defaultState() {
  return {
    tab: 1,
    step: 0,
    igMa: 1.0,
    rg: 100,
    aIdx: 0,                 // 电流表量程档
    vIdx: 1,                 // 电压表量程档
    testRatio: 0.6,          // 表头演示：外加电流 / Ig
    mode: 'amp',             // 校准：amp / volt
    ratio: 0.55,             // 校准：滑变（电流）或分压比（电压）
    closed: false,
    epsS: 0,                 // 分流电阻实际值偏差（%）
    epsF: 0,                 // 分压电阻实际值偏差（%）
    points: [],
    cardScroll: 0,
    cardDrag: null,
    dragArea: null,
    needle: { test: 0, cal: 0, std: 0 },
  }
}

/** 由表头参数与档位算改装电阻、改装表内阻、满偏读数。 */
function solve(s) {
  const Ig = s.igMa * 1e-3
  const Rg = s.rg
  const Ifs = A_SET[s.aIdx]
  const Ufs = V_SET[s.vIdx]

  const nA = Ifs / Ig
  const Rs = Rg / (nA - 1)                   // 分流电阻
  const RA = (Rs * Rg) / (Rs + Rg)           // 改装电流表内阻

  const Ug = Ig * Rg                          // 表头满偏电压
  const nV = Ufs / Ug
  const Rf = Ufs / Ig - Rg                    // 分压电阻
  const RV = Rg + Rf                          // 改装电压表内阻

  return { Ig, Rg, Ifs, Ufs, nA, Rs, RA, Ug, nV, Rf, RV }
}

/**
 * 校准回路求解（真物理）。
 * @param {number} [ratioOverride] 指定滑变位置（一键五点用）
 */
function calSolve(s, sol, ratioOverride) {
  const ratio = ratioOverride == null ? s.ratio : ratioOverride
  const on = s.closed
  if (s.mode === 'amp') {
    const rng = sol.Ifs
    const eps = s.epsS / 100
    const RsAct = sol.Rs * (1 + eps)
    // 3 V 电池组 + 20 Ω 滑变：滑变从最大 20 Ω 拧到 0，电流 0.15 A → 量程满偏
    const I = on ? 0.15 + (rng - 0.15) * ratio : 0
    const IG = I * RsAct / (RsAct + sol.Rg)
    const read = (IG / sol.Ig) * rng
    const Radd = I > 1e-6 ? Math.max(0, 3 / I - 0.2 - sol.RA - 0.01) : 0
    return {
      rng, std: I, read: on ? read : 0, frac: IG / sol.Ig,
      err: I > 1e-6 ? (read - I) / I * 100 : 0,
      actual: RsAct, extra: Radd,
    }
  }
  const rng = sol.Ufs
  const eps = s.epsF / 100
  const RfAct = sol.Rf * (1 + eps)
  const U = on ? rng * (0.02 + 0.98 * ratio) : 0
  const IG = U / (sol.Rg + RfAct)
  const read = (IG / sol.Ig) * rng
  return {
    rng, std: U, read: on ? read : 0, frac: IG / sol.Ig,
    err: U > 1e-6 ? (read - U) / U * 100 : 0,
    actual: RfAct, extra: 0,
  }
}

export default function MeterConversionScene() {
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
    const loop = () => {
      // 切换 Tab 时描述栏高度变化会让画布 CSS 尺寸变化，这里跟随重设位图，避免拉伸与点击错位
      const cw = canvas.clientWidth || 1
      const chh = canvas.clientHeight || 1
      if (cw !== R.W || chh !== R.H) R.resize()
      S.current.time = (S.current.time || 0) + 1 / 60
      render(R)
      animRef.current = requestAnimationFrame(loop)
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
    // 供 sliderRow / rangeChips 这类纯绘制函数登记热区
    AREA_SINK = (a) => canvasRef.current._clickAreas.push(a)
    if (S.current.tab === 1) renderTheory(ctx, W, H)
    else renderCalib(ctx, W, H)
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
    const sol = solve(s)
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
    for (let i = 0; i < 4; i++) {
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
        onClick: () => { S.current.step = i; forceUpdate((v) => v + 1) },
      })
    }

    // 步骤一句话
    const subY = pillY + pillH + 12 * k
    T(ctx, STEP_SUB[s.step], b.x + pad + 2, subY, {
      size: Math.round(11.5 * k), color: '#5B6B5F',
    })

    const content = {
      x: b.x + pad,
      y: subY + 12 * k,
      w: b.w - pad * 2,
      h: b.y + b.h - (subY + 12 * k) - 10,
    }

    if (s.step === 0) stepHead(ctx, content, sol, s, k)
    else if (s.step === 1) stepAmmeter(ctx, content, sol, s, k)
    else if (s.step === 2) stepVoltmeter(ctx, content, sol, s, k)
    else stepEssence(ctx, content, sol, s, k)

    // ── 右侧知识卡 ──
    if (lay.panel) {
      const out = drawKnowledgeCard(ctx, lay.panel, buildSections(s, sol), {
        title: '📖 电表改装与校准',
        scroll: s.cardScroll,
        tip: (c, tx, ty) => {
          c.fillStyle = '#B08954'
          c.font = '11.5px "Microsoft YaHei", sans-serif'
          c.textAlign = 'left'
          c.textBaseline = 'middle'
          c.fillText(
            s.step === 3
              ? '去「校准实验」把 Rs / Rf 调偏，验证两条误差规律。'
              : `Ig=${s.igMa.toFixed(1)}mA · Rg=${s.rg}Ω · Ug=${sol.Ug.toFixed(3)}V（表头只能测这么点）`,
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

  /* ── ① 认识表头 ── */
  function stepHead(ctx, c, sol, s, k) {
    const halfW = c.w * 0.48
    const metW = Math.min(452 * k, halfW * 0.98)
    const metH = metW * 0.78
    const mx = c.x + (halfW - metW) / 2
    const my = c.y + 30 * k
    T(ctx, '表头 G · 灵敏电流计', mx, my - 14 * k, { size: Math.round(13 * k), bold: true, color: '#1E4C7E' })

    const needle = ease(s, 'test', Math.min(1.06, s.testRatio))
    drawMeterArt(ctx, mx, my, metW, metH, {
      theme: 'blue', letter: 'G', unit: 'mA', frac: needle,
      rangeText: `0 ~ ${s.igMa.toFixed(1)} mA`, ticks: headTicks(s.igMa), k,
    })

    // 读数胶囊
    const reading = Math.max(0, s.testRatio) * s.igMa
    chip(ctx, mx + metW / 2 - 74 * k, my + metH + 12 * k, 148 * k, 26 * k,
      `读数 ${reading.toFixed(2)} mA`, s.testRatio > 1.02 ? '#C62828' : '#1E6FD0', k)

    // 表头结构 / 原理（填满左半区）
    const infoH = Math.min(112 * k, c.y + c.h - (my + metH + 40 * k))
    const iy = my + metH + 40 * k
    if (iy + infoH < c.y + c.h) {
      softCard(ctx, mx, iy, metW, infoH, '#FFFDF7', '#EADFC8')
      T(ctx, '它凭什么只能测一点点？', mx + 14 * k, iy + 18 * k, {
        size: Math.round(11 * k), bold: true, color: '#A3541C',
      })
      const lines = [
        '内部：永磁体 + 可动线圈 + 游丝',
        '偏转角 ∝ 通过线圈的电流（刻度均匀）',
        '满偏 = 线圈流过 Ig，指针到最后一格',
        '超了 Ig：指针打表、线圈过热 → 烧坏',
      ]
      lines.forEach((t, i) => {
        T(ctx, `· ${t}`, mx + 14 * k, iy + 40 * k + i * 18 * k, {
          size: Math.round(9.5 * k), color: '#5B6B5F',
        })
      })
    }

    // 内部结构与受力（填满左半区下部）
    const diaY = iy + infoH + 12 * k
    const diaH = c.y + c.h - diaY
    if (diaH > 92 * k) drawHeadInternals(ctx, mx, diaY, metW, Math.min(diaH, 156 * k), Math.min(1.06, s.testRatio), k)

    // ── 右列：两个参数 ──
    const rx = c.x + c.w * 0.53
    const rw = c.w * 0.45
    let y = c.y + 2 * k
    T(ctx, '两个参数决定一切', rx, y + 8 * k, { size: Math.round(13 * k), bold: true, color: '#25313A' })
    T(ctx, '满偏电流 Ig · 表头内阻 Rg', rx, y + 28 * k, { size: Math.round(11 * k), color: '#6B7A83' })
    y += 52 * k

    y = sliderRow(ctx, rx, y, rw * 0.94, k, {
      label: 'Ig  满偏电流', value: s.igMa, min: 0.1, max: 2.0, step: 0.1, unit: 'mA',
      color: '#1E6FD0', onDrag: (v) => { S.current.igMa = v; S.current.points = []; forceUpdate((n) => n + 1) },
    }) + 16 * k

    y = sliderRow(ctx, rx, y, rw * 0.94, k, {
      label: 'Rg  表头内阻', value: s.rg, min: 50, max: 400, step: 10, unit: 'Ω',
      color: '#1E6FD0', onDrag: (v) => { S.current.rg = v; S.current.points = []; forceUpdate((n) => n + 1) },
    }) + 18 * k

    // 关键结论牌
    const cardH = 76 * k
    softCard(ctx, rx, y, rw, cardH, '#F3F7FC', '#CBDCEE')
    T(ctx, '满偏电压  Ug = Ig·Rg', rx + 14 * k, y + 20 * k, { size: Math.round(11.5 * k), color: '#4A5A66' })
    T(ctx, `${sol.Ug.toFixed(3)} V`, rx + 14 * k, y + 46 * k, { size: Math.round(22 * k), bold: true, color: '#1E6FD0' })
    T(ctx, '约 0.1 V 量级', rx + rw - 14 * k, y + 46 * k, {
      size: Math.round(10.5 * k), color: '#7A8790', align: 'right',
    })
    y += cardH + 16 * k

    // 外加电流演示
    T(ctx, '模拟外加电流，看指针能偏到哪', rx, y, { size: Math.round(11.5 * k), bold: true, color: '#25313A' })
    y += 20 * k
    y = sliderRow(ctx, rx, y, rw * 0.94, k, {
      label: 'I 外接电流', value: +s.testRatio.toFixed(2), min: 0, max: 1.2, step: 0.02, unit: '× Ig',
      color: s.testRatio > 1.02 ? '#C62828' : '#1E6FD0',
      onDrag: (v) => { S.current.testRatio = v; forceUpdate((n) => n + 1) },
    })
    T(ctx, s.testRatio > 1.02
      ? '⚠ 超过满偏：指针打到底，线圈可能烧坏'
      : '表头刻度只到这里；再大的电流就不是它该测的了。', rx, y + 16 * k, {
      size: Math.round(10.5 * k), color: s.testRatio > 1.02 ? '#C62828' : '#6B7A83',
    })
    y += 42 * k

    // 结论：改装思路
    if (y + 84 * k < c.y + c.h) {
      softCard(ctx, rx, y, rw, 84 * k, '#FBF7F1', '#E6D9C6')
      T(ctx, '要测大电流 / 高电压怎么办？', rx + 12 * k, y + 18 * k, {
        size: Math.round(10.5 * k), bold: true, color: '#A3541C',
      })
      T(ctx, '不是换表头，而是给它配一个“帮手电阻”，再把刻度重标一遍。', rx + 12 * k, y + 38 * k, {
        size: Math.round(10 * k), color: '#5B6B5F',
      })
      T(ctx, '电流表 → 并一个小电阻；电压表 → 串一个大电阻。', rx + 12 * k, y + 58 * k, {
        size: Math.round(10 * k), color: '#5B6B5F',
      })
    }
  }

  /* ── ② 改装电流表 ── */
  function stepAmmeter(ctx, c, sol, s, k) {
    const boxW = c.w * 0.54
    const boxH = Math.min(c.h - 96 * k, 430 * k)
    const bx = c.x
    const by = c.y + 26 * k
    drawAmpAssembly(ctx, bx, by, boxW, boxH, sol, k)

    const rx = c.x + c.w * 0.58
    const rw = c.w * 0.40
    let y = c.y + 2 * k
    T(ctx, '为什么并联？→ 分流', rx, y + 8 * k, { size: Math.round(13 * k), bold: true, color: '#15803D' })
    y += 26 * k
    drawShuntDiagram(ctx, rx, y, rw, 156 * k, sol, k)
    y += 168 * k

    formulaPlate(ctx, rx, y, rw, k, [
      { s: '两支路电压相等：Ig·Rg = (I−Ig)·Rs', color: '#5B6B5F', size: 10.5 },
      { s: `Rs = Ig·Rg/(I−Ig) = ${fmtOhm(sol.Rs)}`, color: '#15803D', bold: true, size: 14 },
      { s: `扩流倍数 n = I/Ig = ${sol.nA.toFixed(0)}；Rs = Rg/(n−1)`, color: '#5B6B5F', size: 10.5 },
    ])
    y += 98 * k

    // 量程档
    T(ctx, '改装量程', rx, y, { size: Math.round(11 * k), color: '#6B7A83' })
    y += 14 * k
    rangeChips(ctx, rx, y, rw, A_SET, s.aIdx, 'A', '#15803D', k, (i) => {
      S.current.aIdx = i; S.current.points = []; forceUpdate((n) => n + 1)
    })
    y += 44 * k

    T(ctx, `改装表内阻 RA = Rs∥Rg = ${fmtOhm(sol.RA)}`, rx, y, { size: Math.round(11 * k), color: '#15803D', bold: true })
    T(ctx, '分流电阻是零点几欧的小电阻 —— 算成几千欧，就是把并/串用反了。', rx, y + 20 * k, {
      size: Math.round(10.5 * k), color: '#A3541C',
    })
    y += 42 * k

    // 三个量程对照表
    if (y + 150 * k < c.y + c.h) {
      const rows = A_SET.map((r) => {
        const n = r / sol.Ig
        const Rs = sol.Rg / (n - 1)
        return [`${r} A`, n.toFixed(0), fmtOhm(Rs), fmtOhm((Rs * sol.Rg) / (Rs + sol.Rg))]
      })
      miniTable(ctx, rx, y, rw, k, {
        color: '#15803D', head: ['量程', 'n=I/Ig', 'Rs', 'RA'], rows,
        foot: '同一只表头：量程翻几倍，Rs 就缩几倍，RA 跟着变小。',
      })
    }

    // 结论卡：口诀 + 常考
    const botY = Math.max(y + 118 * k, c.y + c.h - 108 * k)
    if (botY + 100 * k < c.y + c.h + 40 * k) {
      mnemonicCard(ctx, c.x, botY, boxW, 96 * k, k, {
        tag: '口诀 · 并 小（电流表）', color: '#15803D',
        big: `Rs ≈ ${fmtOhm(sol.Rs)}`,
        sub: '量程越大，Rs 越小 → RA = Rs∥Rg 越小',
      })
      noteCard(ctx, rx, botY, rw, 100 * k, k, {
        title: '考试常考这一串', color: '#A3541C', fill: '#FBF7F1', stroke: '#E6D9C6',
        lines: [
          '给 Ig、Rg、量程 I → 求 Rs = Rg/(n−1)',
          '再问“内阻多大” → RA = Rs∥Rg（很小）',
          '问“为什么能测大电流” → 大部分电流走 Rs',
        ],
      })
    }
  }

  /* ── ③ 改装电压表 ── */
  function stepVoltmeter(ctx, c, sol, s, k) {
    const boxW = c.w * 0.54
    const boxH = Math.min(c.h - 96 * k, 430 * k)
    drawVoltAssembly(ctx, c.x, c.y + 26 * k, boxW, boxH, sol, k)

    const rx = c.x + c.w * 0.58
    const rw = c.w * 0.40
    let y = c.y + 2 * k
    T(ctx, '为什么串联？→ 分压', rx, y + 8 * k, { size: Math.round(13 * k), bold: true, color: '#1565C0' })
    y += 26 * k
    drawDividerDiagram(ctx, rx, y, rw, 156 * k, sol, k)
    y += 168 * k

    formulaPlate(ctx, rx, y, rw, k, [
      { s: '回路电流相等：U = Ig(Rg + Rf)', color: '#5B6B5F', size: 10.5 },
      { s: `Rf = U/Ig − Rg = ${fmtOhm(sol.Rf)}`, color: '#1565C0', bold: true, size: 14 },
      { s: `扩压倍数 n = U/Ug = ${sol.nV.toFixed(1)}；Rf = Rg(n−1)`, color: '#5B6B5F', size: 10.5 },
    ])
    y += 98 * k

    T(ctx, '改装量程', rx, y, { size: Math.round(11 * k), color: '#6B7A83' })
    y += 14 * k
    rangeChips(ctx, rx, y, rw, V_SET, s.vIdx, 'V', '#1565C0', k, (i) => {
      S.current.vIdx = i; S.current.points = []; forceUpdate((n) => n + 1)
    })
    y += 44 * k

    T(ctx, `改装表内阻 RV = Rg+Rf = ${fmtOhm(sol.RV)}`, rx, y, { size: Math.round(11 * k), color: '#1565C0', bold: true })
    T(ctx, '分压电阻是几千欧的大电阻 —— 算成零点几欧，也是把并/串用反了。', rx, y + 20 * k, {
      size: Math.round(10.5 * k), color: '#A3541C',
    })
    y += 42 * k

    // 三个量程对照表
    if (y + 150 * k < c.y + c.h) {
      const rows = V_SET.map((r) => {
        const Rf = r / sol.Ig - sol.Rg
        return [`${r} V`, (r / sol.Ug).toFixed(1), fmtOhm(Rf), fmtOhm(sol.Rg + Rf)]
      })
      miniTable(ctx, rx, y, rw, k, {
        color: '#1565C0', head: ['量程', 'n=U/Ug', 'Rf', 'RV'], rows,
        foot: '量程越大，Rf 越大，RV 越大 —— 越接近理想电压表。',
      })
    }

    // 结论卡：口诀 + 常考
    const botY = Math.max(y + 118 * k, c.y + c.h - 108 * k)
    if (botY + 100 * k < c.y + c.h + 40 * k) {
      mnemonicCard(ctx, c.x, botY, boxW, 96 * k, k, {
        tag: '口诀 · 串 大（电压表）', color: '#1565C0',
        big: `Rf ≈ ${fmtOhm(sol.Rf)}`,
        sub: '量程越大，Rf 越大 → RV = Rg+Rf 越大',
      })
      noteCard(ctx, rx, botY, rw, 100 * k, k, {
        title: '考试常考这一串', color: '#A3541C', fill: '#FBF7F1', stroke: '#E6D9C6',
        lines: [
          '给 Ig、Rg、量程 U → 求 Rf = U/Ig − Rg',
          '再问“内阻多大” → RV = Rg+Rf（很大）',
          '问“为什么能测高电压” → 大部分电压落在 Rf',
        ],
      })
    }
  }

  /* ── ④ 改装的本质 ── */
  function stepEssence(ctx, c, sol, s, k) {
    // 三只表盘：同一偏转角，三个刻度
    const dialW = Math.min(c.w * 0.29, 296 * k)
    const dialH = dialW * 0.68
    const gap = (c.w - dialW * 3) / 4
    const dy = c.y + 8 * k
    const frac = 0.62
    const dials = [
      { letter: 'G', unit: 'mA', theme: 'blue', range: `0 ~ ${s.igMa.toFixed(1)} mA`, ticks: headTicks(s.igMa), cap: '原表头：0 ~ 1 mA' },
      { letter: 'A', unit: 'A', theme: 'red', range: `0 ~ ${A_SET[s.aIdx]} A`, ticks: rangeTicks(A_SET[s.aIdx]), cap: `改装电流表：0 ~ ${A_SET[s.aIdx]} A` },
      { letter: 'V', unit: 'V', theme: 'wine', range: `0 ~ ${V_SET[s.vIdx]} V`, ticks: rangeTicks(V_SET[s.vIdx]), cap: `改装电压表：0 ~ ${V_SET[s.vIdx]} V` },
    ]
    dials.forEach((d, i) => {
      const x = c.x + gap + i * (dialW + gap)
      drawMeterArt(ctx, x, dy, dialW, dialH, {
        theme: d.theme, letter: d.letter, unit: d.unit, frac,
        rangeText: d.range, ticks: d.ticks, k, showTerminals: false,
      })
      T(ctx, d.cap, x + dialW / 2, dy + dialH + 16 * k, {
        size: Math.round(10.5 * k), color: '#4B5A66', align: 'center',
      })
      T(ctx, `读数 ${(d.letter === 'G' ? (frac * s.igMa).toFixed(2) : (frac * (d.letter === 'A' ? A_SET[s.aIdx] : V_SET[s.vIdx])).toFixed(2))} ${d.unit}`,
        x + dialW / 2, dy + dialH + 32 * k, {
          size: Math.round(10.5 * k), bold: true,
          color: d.letter === 'G' ? '#1E6FD0' : d.letter === 'A' ? '#C62828' : '#9A2F2C',
          align: 'center',
        })
    })

    // 下面两张数据卡
    const cy = dy + dialH + 48 * k
    const cardW = (c.w - 14 * k) / 2
    const cardH = Math.min(196 * k, c.y + c.h - cy - 96 * k)
    const ampRows = A_SET.map((r) => {
      const n = r / sol.Ig
      const Rs = sol.Rg / (n - 1)
      return [`${r} A`, n.toFixed(0), fmtOhm(Rs), fmtOhm((Rs * sol.Rg) / (Rs + sol.Rg))]
    })
    const voltRows = V_SET.map((r) => {
      const Rf = r / sol.Ig - sol.Rg
      return [`${r} V`, (r / sol.Ug).toFixed(1), fmtOhm(Rf), fmtOhm(sol.Rg + Rf)]
    })
    const raOf = (r) => {
      const Rs = sol.Rg / (r / sol.Ig - 1)
      return (Rs * sol.Rg) / (Rs + sol.Rg)
    }
    const ampBars = A_SET.map((r) => ({
      label: `${r} A`, frac: Math.max(0.06, raOf(r) / raOf(A_SET[0])), text: fmtOhm(raOf(r)),
    }))
    const voltBars = V_SET.map((r) => {
      const RV = sol.Rg + (r / sol.Ig - sol.Rg)
      return { label: `${r} V`, frac: Math.max(0.06, RV / (sol.Rg + V_SET[2] / sol.Ig - sol.Rg)), text: fmtOhm(RV) }
    })
    statCard(ctx, c.x, cy, cardW, cardH, '#F2F9F4', '#CFE3D4', k, {
      title: '改装电流表：量程越大，内阻 RA 越小',
      color: '#15803D',
      head: ['量程', 'n = I/Ig', 'Rs', 'RA'],
      rows: ampRows,
      bars: ampBars,
      foot: 'RA 越小越接近理想电流表（串入后压降小）。',
    })
    statCard(ctx, c.x + cardW + 14 * k, cy, cardW, cardH, '#F4F8FD', '#CFDDEE', k, {
      title: '改装电压表：量程越大，内阻 RV 越大',
      color: '#1565C0',
      head: ['量程', 'n = U/Ug', 'Rf', 'RV'],
      rows: voltRows,
      bars: voltBars,
      foot: 'RV 越大越接近理想电压表（并入后分流小）。',
    })

    // 本质横幅
    const bannerY = cy + cardH + 12 * k
    const bannerH = Math.min(76 * k, c.y + c.h - bannerY)
    if (bannerH > 40 * k) {
      softCard(ctx, c.x, bannerY, c.w, bannerH, '#FFF9EE', '#EBD9B8')
      ctx.save()
      ctx.fillStyle = '#C98A12'
      rr(ctx, c.x + 10 * k, bannerY + 10 * k, 3, bannerH - 20 * k, 2)
      ctx.fill()
      ctx.restore()
      T(ctx, '改装的本质：表头 Ig、Rg 一个字都没改 —— 改的是外接电阻与重新标注的刻度。',
        c.x + 22 * k, bannerY + 20 * k, { size: Math.round(11 * k), bold: true, color: '#8A5A12' })
      T(ctx, '并联分流：Rs = Rg/(n−1)（小电阻）　　串联分压：Rf = Rg(n−1)（大电阻）　　同一偏转角 = 不同量程的读数',
        c.x + 22 * k, bannerY + 40 * k, { size: Math.round(10 * k), color: '#5B6B5F' })
      if (bannerH > 60 * k) {
        T(ctx, '两条高频误差（去「校准实验」亲手验证）：Rs 偏大 → 读数偏大；Rf 偏大 → 读数偏小。',
          c.x + 22 * k, bannerY + 58 * k, { size: Math.round(10 * k), bold: true, color: '#B3261E' })
      }
    }
  }

  /* ================================================================
   *  Tab 2：校准实验
   * ================================================================ */
  function renderCalib(ctx, W, H) {
    const s = S.current
    const sol = solve(s)
    const cal = calSolve(s, sol)
    const lay = layout(W, H)
    const b = lay.board
    const k = lay.k
    drawBoard(ctx, b)

    const pad = 14
    // ── 模式 / 量程 ──
    let x = b.x + pad
    const y0 = b.y + 12
    const pillH = Math.round(30 * k)
    const modes = [
      { id: 'amp', t: '校准电流表', c: '#15803D' },
      { id: 'volt', t: '校准电压表', c: '#1565C0' },
    ]
    modes.forEach((m) => {
      const w = Math.min(140 * k, 120 + 10 * k)
      const on = s.mode === m.id
      ctx.save()
      ctx.fillStyle = on ? m.c : 'rgba(255,255,255,0.9)'
      rr(ctx, x, y0, w, pillH, pillH / 2)
      ctx.fill()
      ctx.strokeStyle = on ? m.c : '#CFDDD2'
      ctx.lineWidth = 1.2
      rr(ctx, x, y0, w, pillH, pillH / 2)
      ctx.stroke()
      T(ctx, m.t, x + w / 2, y0 + pillH / 2 + 1, {
        size: Math.round(12 * k), bold: true, align: 'center', color: on ? '#fff' : '#4B6270',
      })
      ctx.restore()
      area({ x, y: y0, w, h: pillH, onClick: () => { S.current.mode = m.id; S.current.points = []; forceUpdate((v) => v + 1) } })
      x += w + 8
    })

    // 量程切换
    const set = s.mode === 'amp' ? A_SET : V_SET
    const idx = s.mode === 'amp' ? s.aIdx : s.vIdx
    const unit = s.mode === 'amp' ? 'A' : 'V'
    const chipW = 62 * k
    T(ctx, '量程', x + 8, y0 + pillH / 2, { size: Math.round(11 * k), color: '#6B7A83' })
    x += 44 * k
    set.forEach((v, i) => {
      const on = idx === i
      ctx.save()
      ctx.fillStyle = on ? '#334155' : 'rgba(255,255,255,0.92)'
      rr(ctx, x, y0 + 3 * k, chipW, pillH - 6 * k, 8)
      ctx.fill()
      ctx.strokeStyle = on ? '#1F2937' : '#D2DDE4'
      ctx.stroke()
      T(ctx, `${v}${unit}`, x + chipW / 2, y0 + pillH / 2 + 1, {
        size: Math.round(11 * k), bold: true, align: 'center', color: on ? '#fff' : '#556876',
      })
      ctx.restore()
      const i2 = i
      area({
        x, y: y0 + 3 * k, w: chipW, h: pillH - 6 * k,
        onClick: () => {
          if (S.current.mode === 'amp') S.current.aIdx = i2
          else S.current.vIdx = i2
          S.current.points = []
          forceUpdate((v) => v + 1)
        },
      })
      x += chipW + 6 * k
    })

    // ── 数据面板 ──
    const dpw = lay.compact ? 0 : Math.min(330, b.w * 0.31)
    const dp = dpw
      ? { x: b.x + b.w - pad - dpw, y: b.y + 56, w: dpw, h: b.h - 68 }
      : null
    const circ = {
      x: b.x + pad,
      y: b.y + 56,
      w: b.w - pad * 2 - (dp ? dpw + 16 : 0),
      h: b.h - 68,
    }

    if (s.mode === 'amp') drawAmpCalBench(ctx, circ, s, sol, cal, k)
    else drawVoltCalBench(ctx, circ, s, sol, cal, k)

    // ── 误差注入 + 操作按钮（电路区底部）──
    const ctrlH = 96 * k
    const ctrlY = circ.y + circ.h - ctrlH
    const errW = Math.min(300 * k, circ.w * 0.46)
    const eps = s.mode === 'amp' ? s.epsS : s.epsF
    T(ctx, s.mode === 'amp' ? '把分流电阻 Rs 的实际值调偏' : '把分压电阻 Rf 的实际值调偏',
      circ.x, ctrlY - 6 * k, { size: Math.round(10.5 * k), bold: true, color: '#A3541C' })
    sliderRow(ctx, circ.x, ctrlY + 8 * k, errW, k, {
      label: '实际偏差', value: eps, min: -20, max: 20, step: 1, unit: '%',
      color: Math.abs(eps) > 0.5 ? '#C2410C' : '#8A9AA4',
      onDrag: (v) => {
        if (S.current.mode === 'amp') S.current.epsS = v
        else S.current.epsF = v
        S.current.points = []
        forceUpdate((n) => n + 1)
      },
    })
    T(ctx, eps > 0.5
      ? (s.mode === 'amp' ? 'Rs 偏大 → 分流变弱 → 表头电流偏大 → 读数偏大' : 'Rf 偏大 → 分压过多 → 表头电压偏小 → 读数偏小')
      : eps < -0.5
        ? (s.mode === 'amp' ? 'Rs 偏小 → 分流变强 → 表头电流偏小 → 读数偏小' : 'Rf 偏小 → 分压不足 → 表头电压偏大 → 读数偏大')
        : '当前是理论值：读数与标准表应完全一致。',
    circ.x, ctrlY + 50 * k, {
      size: Math.round(10.5 * k), color: Math.abs(eps) > 0.5 ? '#B3261E' : '#6B7A83',
    })

    // 按钮
    const btnY = ctrlY + 62 * k
    const btnH = 28 * k
    const bx0 = circ.x + errW + 18 * k
    const btnDefs = [
      { t: '📋 记录一点', w: 100 * k, color: '#15803D', fn: recordPoint },
      { t: '⚡ 一键五点', w: 100 * k, color: '#1565C0', fn: autoFive },
      { t: '🧹 清空', w: 74 * k, color: '#8A9AA4', fn: () => { S.current.points = []; forceUpdate((n) => n + 1) } },
    ]
    let bxc = bx0
    btnDefs.forEach((d) => {
      if (bxc + d.w > circ.x + circ.w) return
      drawButton(ctx, bxc, btnY, d.w, btnH, d.t, d.color, true, k)
      area({ x: bxc, y: btnY, w: d.w, h: btnH, onClick: d.fn })
      bxc += d.w + 8 * k
    })

    if (dp) {
      drawCalPanel(ctx, dp, s, sol, cal, k)
    } else {
      // 窄屏：底部一行读数
      const ly = circ.y + circ.h - 24 * k
      const txt = s.closed
        ? `标准 ${cal.std.toFixed(s.mode === 'amp' ? 3 : 2)} ${s.mode === 'amp' ? 'A' : 'V'} · 改装 ${cal.read.toFixed(s.mode === 'amp' ? 3 : 2)} ${s.mode === 'amp' ? 'A' : 'V'} · 偏差 ${cal.err >= 0 ? '+' : ''}${cal.err.toFixed(1)}%`
        : '开关断开：先闭合开关，再调滑变'
      T(ctx, txt, circ.x, ly, { size: Math.round(11 * k), color: s.closed ? '#25313A' : '#8A9AA4', bold: true })
    }

    // ── 右侧知识卡（校准口径）──
    if (lay.panel) {
      const out = drawKnowledgeCard(ctx, lay.panel, buildCalSections(s, sol, cal), {
        title: '🧪 校准怎么做',
        scroll: s.cardScroll,
        tip: (c2, tx, ty) => {
          c2.fillStyle = '#B08954'
          c2.font = '11.5px "Microsoft YaHei", sans-serif'
          c2.textAlign = 'left'
          c2.textBaseline = 'middle'
          c2.fillText(
            s.closed
              ? `标准 ${cal.std.toFixed(3)} · 改装 ${cal.read.toFixed(3)} ${s.mode === 'amp' ? 'A' : 'V'} · 偏差 ${cal.err >= 0 ? '+' : ''}${cal.err.toFixed(1)}%`
              : '开关断开：先点开关闭合回路',
            tx, ty + 10,
          )
        },
      })
      canvasRef.current._cardBox = out
        ? { x: lay.panel.x, y: lay.panel.y + 2, w: lay.panel.w, h: out.cardH, maxScroll: out.maxScroll, scroll: out.scroll }
        : null
    } else if (canvasRef.current) {
      canvasRef.current._cardBox = null
    }
  }

  function buildCalSections(s, sol) {
    const amp = s.mode === 'amp'
    return [
      {
        t: amp ? '正在校准：电流表' : '正在校准：电压表', c: amp ? '#15803D' : '#1565C0',
        items: [
          [['对象：'], [amp ? `${sol.Ifs} A 电流表` : `${sol.Ufs} V 电压表`, '#C2410C', 1], [amp ? `（内阻 RA = ${fmtOhm(sol.RA)}）` : `（内阻 RV = ${fmtOhm(sol.RV)}）`, '#5B6B5F']],
          [['标准表就是“真值”，改装表是“被检表”，两只表'], ['同时读数', '#DC2626', 1], ['才能算偏差。']],
          [['当前误差注入：'], [amp ? `Rs ${s.epsS > 0 ? '+' : ''}${s.epsS}%` : `Rf ${s.epsF > 0 ? '+' : ''}${s.epsF}%`, '#C2410C', 1], ['（0% 即理论值）。']],
        ],
      },
      {
        t: amp ? '接线（串联回路）' : '接线（分压接法）', c: amp ? '#15803D' : '#1565C0',
        items: amp
          ? [
            [['改装表与标准表'], ['串联', '#15803D', 1], ['在同一回路里：同一电流流过两只表，读数才有可比性。']],
            [['电源、开关、滑动变阻器串在回路中，滑变用来'], ['连续改变电流', '#15803D', 1], ['。']],
            [['一定要'], ['先闭合开关', '#DC2626', 1], ['再调节，断开时读数无效。']],
          ]
          : [
            [['滑动变阻器接成分压器（三端接法）：'], ['红/黑两条公共轨', '#1565C0', 1], ['给出 0 ~ U 连续可调的电压。']],
            [['两只电压表'], ['并联', '#1565C0', 1], ['在“滑片引出的红轨”与“电池负极的黑轨”之间，测同一段电压。']],
            [['换量程或改接线前先'], ['断开开关', '#DC2626', 1], ['。']],
          ],
      },
      {
        t: '怎么读、怎么记', c: '#C98A12',
        items: [
          [['拖橙色滑片到不同位置，同时读标准表与改装表，点'], ['记录一点', '#15803D', 1], ['。']],
          [['至少取 3 点，且'], ['低、中、高量程都要有', '#DC2626', 1], ['（一键五点就是自动取 0.2 / 0.4 / 0.6 / 0.8 / 1.0 满偏）。']],
          [['偏差 '], ['δ = (改装读数 − 标准读数)/标准读数 × 100%', '#DC2626', 1], ['，保留 1 位小数。']],
        ],
      },
      {
        t: '误差判读（重点）', c: '#C2410C',
        items: [
          [['若是'], ['倍数误差', '#DC2626', 1], ['（Rs / Rf 没调准），偏差点会沿一条近似平线分布，而不是忽高忽低。']],
          [['Rs 实际偏大 → 分流变弱 → 表头电流偏大 → '], ['读数偏大', '#DC2626', 1], ['。']],
          [['Rf 实际偏大 → 分压过多 → 表头电压偏小 → '], ['读数偏小', '#DC2626', 1], ['。']],
        ],
      },
      {
        t: '合格标准与常见错', c: '#7C3AED',
        items: [
          [['|δ| ≤ 2.5% 判'], ['合格', '#15803D', 1], ['；超过就是超差，要回头查 Rs / Rf。']],
          [['把并/串用反：电流表串了大电阻、电压表并了小电阻，读数会离谱（量级都不对）。']],
          [['两只表量程不一致时，按'], ['同一被测量的真值', '#DC2626', 1], ['比较，别拿不同刻度硬比。']],
        ],
      },
    ]
  }

  /* ── 电流表校准台 ── */
  function drawAmpCalBench(ctx, c, s, sol, cal, k) {
    const metW = Math.min(196 * k, c.w * 0.26)
    const metH = metW * 0.80
    const ch = Math.min(c.h - 118 * k, metH + 250 * k)
    const topY = c.y + Math.max(4 * k, (c.h - 118 * k - ch) / 2)

    const convX = c.x + c.w * 0.13
    const stdX = c.x + c.w * 0.57
    const meterY = topY + 34 * k
    const busT = meterY + metH + 16 * k
    const busB = topY + ch - 10 * k
    const busL = c.x + 8 * k
    const busR = c.x + c.w - 8 * k

    const batW = Math.min(190 * k, c.w * 0.28)
    const batX = busL + batW / 2 + 6 * k
    const swW = Math.min(96 * k, c.w * 0.15)
    const swX = batX + batW / 2 + swW / 2 + 30 * k
    const rheoW = Math.min(230 * k, c.w * 0.34)
    const rheoX = busR - rheoW / 2 - 16 * k

    // 端子 x（与画图函数口径一致）
    const conv = { neg: convX + metW * 0.26, pos: convX + metW * 0.74 }
    const std = { neg: stdX + metW * 0.26, pos: stdX + metW * 0.74 }
    const bat = { neg: batX - batW * 0.30, pos: batX + batW * 0.30 }
    const sw = { neg: swX - swW * 0.30, pos: swX + swW * 0.30 }
    const rheo = { neg: rheoX - rheoW * 0.42, pos: rheoX + rheoW * 0.42 }
    const termY = meterY + metH * 0.845

    // ── 导线环（留出各器材端子的缺口）──
    ctx.save()
    const wc = s.closed ? '#C0392B' : '#BB7A72'
    const lw = 3.2 * k
    busPath(ctx, {
      L: busL, R: busR, T: busT, B: busB, r: 10 * k,
      gapTop: [[conv.neg, conv.pos], [std.neg, std.pos]],
      gapBot: [[bat.neg, bat.pos], [sw.neg, sw.pos], [rheo.neg, rheo.pos]],
    }, wc, lw)
    // 电表端子 → 母线
    drawLead(ctx, conv.neg, termY, conv.neg, busT, wc, lw)
    drawLead(ctx, conv.pos, termY, conv.pos, busT, wc, lw)
    drawLead(ctx, std.neg, termY, std.neg, busT, wc, lw)
    drawLead(ctx, std.pos, termY, std.pos, busT, wc, lw)
    ctx.restore()

    // ── 器材 ──
    const convNeedle = ease(s, 'cal', s.closed ? cal.frac : 0)
    drawMeterArt(ctx, convX, meterY, metW, metH, {
      theme: 'red', letter: 'A', unit: 'A', frac: convNeedle,
      rangeText: `0 ~ ${sol.Ifs} A`, ticks: rangeTicks(sol.Ifs), k,
    })
    T(ctx, '改装电流表', convX + metW / 2, meterY - 28 * k, {
      size: Math.round(11.5 * k), bold: true, color: '#B3261E', align: 'center',
    })
    T(ctx, `RA ${fmtOhm(sol.RA)} · 读数 ${s.closed ? cal.read.toFixed(3) : '0.000'} A`,
      convX + metW / 2, meterY - 12 * k, {
        size: Math.round(9.5 * k), color: '#6B7A83', align: 'center',
      })

    const stdNeedle = ease(s, 'std', s.closed ? cal.std / sol.Ifs : 0)
    drawMeterArt(ctx, stdX, meterY, metW, metH, {
      theme: 'dark', letter: 'A', unit: 'A', frac: stdNeedle,
      rangeText: `0 ~ ${sol.Ifs} A`, ticks: rangeTicks(sol.Ifs), k,
    })
    T(ctx, '标准电流表', stdX + metW / 2, meterY - 28 * k, {
      size: Math.round(11.5 * k), bold: true, color: '#4B5A66', align: 'center',
    })
    T(ctx, `读数 ${s.closed ? cal.std.toFixed(3) : '0.000'} A`, stdX + metW / 2, meterY - 12 * k, {
      size: Math.round(10.5 * k), color: '#4B5A66', align: 'center', bold: true,
    })

    // 电池组 + 开关 + 滑变
    drawBatteryArt(ctx, batX, busB, batW, 54 * k, k, s.closed ? `回路 ${cal.std.toFixed(3)} A` : '断路')
    drawSwitchArt(ctx, swX, busB, swW, s.closed, k)
    drawRheostatArt(ctx, rheoX, busB, rheoW, s.ratio, k, {
      label: s.closed ? `接入 ${cal.extra.toFixed(1)} Ω` : '滑动变阻器 20 Ω',
    })

    // 开关点击
    area({
      x: swX - swW / 2, y: busB - 36 * k, w: swW, h: 46 * k,
      onClick: () => { S.current.closed = !S.current.closed; forceUpdate((n) => n + 1) },
    })
    // 滑变拖拽（滑块轨道与画图口径一致）
    const trackX0 = rheoX - rheoW * 0.42
    const trackX1 = rheoX + rheoW * 0.42
    area({
      x: trackX0, y: busB - 76 * k, w: trackX1 - trackX0, h: 72 * k,
      onDrag: (mx) => {
        const v = (mx - trackX0) / (trackX1 - trackX0)
        S.current.ratio = Math.max(0, Math.min(1, v))
        forceUpdate((n) => n + 1)
      },
    })
    T(ctx, '点开关通断 · 拖动橙色滑片改电流', rheoX, busB + 34 * k, {
      size: Math.round(10 * k), color: '#7A8790', align: 'center',
    })
  }

  /* ── 电压表校准台（分压接法，两台电压表并联）── */
  function drawVoltCalBench(ctx, c, s, sol, cal, k) {
    const metW = Math.min(190 * k, c.w * 0.23)
    const metH = metW * 0.80
    const ch = Math.min(c.h - 118 * k, metH + 250 * k)
    const topY = c.y + Math.max(4 * k, (c.h - 118 * k - ch) / 2)

    const convX = c.x + c.w * 0.35
    const stdX = c.x + c.w * 0.89 - metW
    const meterY = topY + 34 * k
    const railRed = meterY + metH + 16 * k
    const railBlack = railRed + 19 * k
    const busB = topY + ch - 10 * k
    const busR = c.x + c.w - 8 * k

    const conv = { neg: convX + metW * 0.26, pos: convX + metW * 0.74 }
    const std = { neg: stdX + metW * 0.26, pos: stdX + metW * 0.74 }
    const termY = meterY + metH * 0.845

    // 分压电源：电池 → 开关 → 滑变，横向排开不重叠
    const batW = Math.min(176 * k, c.w * 0.24)
    const swW = Math.min(88 * k, c.w * 0.14)
    const batX = c.x + 14 * k + batW / 2
    const swX = batX + batW / 2 + 34 * k + swW / 2
    const rheoW = Math.min(252 * k, c.w * 0.34)
    const rheoX = swX + swW / 2 + 46 * k + rheoW / 2
    const bat = { neg: batX - batW * 0.30, pos: batX + batW * 0.30 }
    const sw = { neg: swX - swW * 0.30, pos: swX + swW * 0.30 }
    const rheo = { neg: rheoX - rheoW * 0.42, pos: rheoX + rheoW * 0.42 }
    const wiper = {
      x: rheoX - rheoW * 0.3528 + s.ratio * rheoW * 0.7056,
      y: busB - 70 * k,
    }

    // ── 导线：分压器 + 两条公共轨（正交走线，交叉处留缺口表示不相连）──
    const wc = s.closed ? '#C0392B' : '#BB7A72'
    const lw = 3.2 * k
    const redEnd = Math.max(conv.pos, std.pos, wiper.x) + 16 * k
    const benchY = busB
    // 电源 − → 黑轨（竖直上行）
    drawLead(ctx, bat.neg, benchY, bat.neg, railBlack, '#1F2937', lw, true)
    // 电源 + → 开关 → 滑变左端（分压器的一个固定端）
    drawLead(ctx, bat.pos, benchY, sw.neg, benchY, wc, lw, true)
    drawLead(ctx, sw.pos, benchY, rheo.neg, benchY, wc, lw, true)
    // 滑变右端（另一个固定端）→ 右侧上行 → 黑轨右端
    drawLead(ctx, rheo.pos, benchY, busR, benchY, '#1F2937', lw, true)
    drawLead(ctx, busR, benchY, busR, railBlack, '#1F2937', lw, true)
    // 滑片 → 红轨（穿过黑轨，黑轨留缺口）
    drawLead(ctx, wiper.x, wiper.y, wiper.x, railRed, wc, lw, true)
    // 黑轨（−）：从电源 − 到右端，滑片竖线处留缺口
    railWithGaps(ctx, bat.neg, busR, railBlack, [[wiper.x - 6 * k, wiper.x + 6 * k]], '#1F2937', lw)
    // 红轨（+）：覆盖两只表的 + 接线柱与滑片，− 引线处留缺口
    const redX0 = Math.min(wiper.x, conv.pos, std.pos) - 12 * k
    railWithGaps(ctx, redX0, redEnd, railRed, [[conv.neg - 6 * k, conv.neg + 6 * k], [std.neg - 6 * k, std.neg + 6 * k]], wc, lw)
    // 电表：− 接黑轨，+ 接红轨
    drawLead(ctx, conv.neg, termY, conv.neg, railBlack, '#1F2937', lw, true)
    drawLead(ctx, conv.pos, termY, conv.pos, railRed, wc, lw, true)
    drawLead(ctx, std.neg, termY, std.neg, railBlack, '#1F2937', lw, true)
    drawLead(ctx, std.pos, termY, std.pos, railRed, wc, lw, true)
    // 轨上的接点（真实结点才画圆点）
    ctx.fillStyle = '#3A464D'
    for (const [x, y] of [[conv.neg, railBlack], [conv.pos, railRed], [std.neg, railBlack], [std.pos, railRed], [wiper.x, railRed], [bat.neg, railBlack], [busR, railBlack]]) {
      ctx.beginPath()
      ctx.arc(x, y, 2.4 * k, 0, Math.PI * 2)
      ctx.fill()
    }

    // ── 器材 ──
    const convNeedle = ease(s, 'cal', s.closed ? cal.frac : 0)
    drawMeterArt(ctx, convX, meterY, metW, metH, {
      theme: 'wine', letter: 'V', unit: 'V', frac: convNeedle,
      rangeText: `0 ~ ${sol.Ufs} V`, ticks: rangeTicks(sol.Ufs), k,
    })
    T(ctx, '改装电压表', convX + metW / 2, meterY - 28 * k, {
      size: Math.round(11.5 * k), bold: true, color: '#9A2F2C', align: 'center',
    })
    T(ctx, `RV ${fmtOhm(sol.RV)} · 读数 ${s.closed ? cal.read.toFixed(2) : '0.00'} V`,
      convX + metW / 2, meterY - 12 * k, {
        size: Math.round(9.5 * k), color: '#6B7A83', align: 'center',
      })

    const stdNeedle = ease(s, 'std', s.closed ? cal.std / sol.Ufs : 0)
    drawMeterArt(ctx, stdX, meterY, metW, metH, {
      theme: 'dark', letter: 'V', unit: 'V', frac: stdNeedle,
      rangeText: `0 ~ ${sol.Ufs} V`, ticks: rangeTicks(sol.Ufs), k,
    })
    T(ctx, '标准电压表', stdX + metW / 2, meterY - 28 * k, {
      size: Math.round(11.5 * k), bold: true, color: '#4B5A66', align: 'center',
    })
    T(ctx, `读数 ${s.closed ? cal.std.toFixed(2) : '0.00'} V`, stdX + metW / 2, meterY - 12 * k, {
      size: Math.round(10.5 * k), color: '#4B5A66', align: 'center', bold: true,
    })

    drawBatteryArt(ctx, batX, busB, batW, 54 * k, k, s.closed ? `输出 ${cal.std.toFixed(2)} V` : '断路', '学生电源')
    drawSwitchArt(ctx, swX, busB, swW, s.closed, k)
    drawRheostatArt(ctx, rheoX, busB, rheoW, s.ratio, k, { wiper: true })
    T(ctx, '滑变接成分压器：滑片取出的电压 0 → 电源电压连续可调（红轨＝滑片电压，黑轨＝电源负极）', c.x + c.w * 0.5, busB + 38 * k, {
      size: Math.round(9.5 * k), color: '#7A8790', align: 'center',
    })

    // 开关
    area({
      x: swX - swW / 2, y: busB - 36 * k, w: swW, h: 46 * k,
      onClick: () => { S.current.closed = !S.current.closed; forceUpdate((n) => n + 1) },
    })
    // 滑片拖拽
    const sx0 = rheoX - rheoW * 0.3528
    const sx1 = rheoX + rheoW * 0.3528
    area({
      x: sx0, y: busB - 88 * k, w: sx1 - sx0, h: 82 * k,
      onDrag: (mx) => {
        const v = (mx - sx0) / (sx1 - sx0)
        S.current.ratio = Math.max(0, Math.min(1, v))
        forceUpdate((n) => n + 1)
      },
    })
    // 轨标注（图例写在底部说明里，避免与导线重叠）
  }

  /* ── 校准数据面板 ── */
  function drawCalPanel(ctx, r, s, sol, cal, k) {
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
    let y = r.y + 24
    T(ctx, '📋 校准记录', px, y, { size: Math.round(12.5 * k), bold: true, color: '#25313A' })
    y += 22
    T(ctx, s.mode === 'amp'
      ? `改装表 ${sol.Ifs} A ${s.epsS ? `（Rs ${s.epsS > 0 ? '+' : ''}${s.epsS}%）` : '（理论值）'}`
      : `改装表 ${sol.Ufs} V ${s.epsF ? `（Rf ${s.epsF > 0 ? '+' : ''}${s.epsF}%）` : '（理论值）'}`,
    px, y, { size: Math.round(10.5 * k), color: '#6B7A83' })
    y += 22

    // 表头
    const colX = [px, px + pw * 0.44, px + pw]
    ctx.fillStyle = '#F4F8FA'
    rr(ctx, px - 4, y - 10, pw + 8, 24, 6)
    ctx.fill()
    T(ctx, '标准表', colX[0] + 4, y + 2, { size: Math.round(10 * k), color: '#7A8790', bold: true })
    T(ctx, '改装表', colX[1] - 8 * k, y + 2, { size: Math.round(10 * k), color: '#7A8790', align: 'right', bold: true })
    T(ctx, '偏差', colX[2], y + 2, { size: Math.round(10 * k), color: '#7A8790', align: 'right', bold: true })
    y += 26

    const digits = s.mode === 'amp' ? 3 : 2
    const pts = s.points.slice(-MAX_POINTS)
    if (!pts.length) {
      T(ctx, s.closed ? '调滑变到某一刻度，点「记录一点」' : '先闭合开关，再调滑变取读数',
        px + 4, y + 6, { size: Math.round(10.5 * k), color: '#9AA7AF' })
      y += 26
    } else {
      pts.forEach((p) => {
        T(ctx, p.std.toFixed(digits), colX[0] + 4, y, { size: Math.round(10.5 * k), color: '#4B5A66', mono: true })
        T(ctx, p.read.toFixed(digits), colX[1] - 8 * k, y, { size: Math.round(10.5 * k), color: '#25313A', mono: true, align: 'right' })
        const bad = Math.abs(p.err) > PASS_ERR
        T(ctx, `${p.err >= 0 ? '+' : ''}${p.err.toFixed(1)}%`, colX[2], y, {
          size: Math.round(10.5 * k), color: bad ? '#C62828' : '#15803D', mono: true, align: 'right', bold: bad,
        })
        y += 21
      })
      y += 6
    }

    // 偏差散点（横轴 0~量程，纵轴 ±10%）—— 有数据时让图表长高
    const verdictH = 30
    const infoFixed = 150 * k
    const chartH = Math.max(140 * k, Math.min(300 * k, r.y + r.h - 16 - verdictH - 12 - infoFixed - (y + 8)))
    drawDevChart(ctx, { x: px, y: y + 8, w: pw, h: chartH }, pts, sol, s, k)
    if (!pts.length) {
      T(ctx, '还没有校准点', px + pw / 2, y + 8 + chartH / 2 - 8 * k, {
        size: Math.round(10.5 * k), color: '#B6C2CA', align: 'center', bold: true,
      })
      T(ctx, '闭合开关 → 调滑片 → 点「记录一点」', px + pw / 2, y + 8 + chartH / 2 + 10 * k, {
        size: Math.round(9.5 * k), color: '#C3CDD3', align: 'center',
      })
    }
    y += chartH + 20

    // 误差来源 / 操作说明
    const infoY = y
    const infoH2 = Math.min(infoFixed, r.y + r.h - 16 - verdictH - 10 - infoY)
    if (infoH2 > 70) {
      softCard(ctx, px, infoY, pw, infoH2, '#FBF8F2', '#EADFC8')
      T(ctx, '误差从哪来、怎么看', px + 12, infoY + 18, {
        size: Math.round(10.5 * k), bold: true, color: '#A3541C',
      })
      const lines = s.mode === 'amp'
        ? [
          `理论 Rs = Rg/(n−1) = ${fmtOhm(sol.Rs)}`,
          `当前实际 Rs = ${fmtOhm(cal.actual)}（${s.epsS > 0 ? '+' : ''}${s.epsS}%）`,
          'Rs 实际偏大 → 分流变弱 → 表头电流偏大 → 读数偏大',
          '所以误差点会整体落在 0 线之上；|δ| ≤ 2.5% 算合格。',
        ]
        : [
          `理论 Rf = U/Ig − Rg = ${fmtOhm(sol.Rf)}`,
          `当前实际 Rf = ${fmtOhm(cal.actual)}（${s.epsF > 0 ? '+' : ''}${s.epsF}%）`,
          'Rf 实际偏大 → 分压过多 → 表头电压偏小 → 读数偏小',
          '所以误差点会整体落在 0 线之下；|δ| ≤ 2.5% 算合格。',
        ]
      const useH = Math.min(4, Math.floor((infoH2 - 46) / 18))
      lines.slice(0, useH).forEach((t, i) => {
        T(ctx, `· ${t}`, px + 12, infoY + 40 + i * 18, {
          size: Math.round(9.5 * k), color: i >= 2 ? '#B3261E' : '#5B6B5F',
        })
      })
      if (infoH2 > 240) {
        const sy = infoY + 40 + useH * 18 + 14
        line(ctx, px + 12, sy, px + pw - 12, sy, '#E8DDC6', 1)
        T(ctx, '为什么必须取低、中、高三档？', px + 12, sy + 18, {
          size: Math.round(9.5 * k), bold: true, color: '#A3541C',
        })
        T(ctx, '· 小电流时偏差被零点误差主导，大电流时才看得出倍数误差；只测一点，判不出是什么毛病。',
          px + 12, sy + 36, { size: Math.round(9 * k), color: '#5B6B5F' })
        T(ctx, '· 绝对值 δ 与相对 δ 都要看：超差先调 Rs / Rf 使 ε → 0，读数才回落到标准表。',
          px + 12, sy + 54, { size: Math.round(9 * k), color: '#5B6B5F' })
      }
      if (infoH2 > 118) {
        T(ctx, '取点建议：低、中、高各取 1~2 点；偏差点若沿一条平线分布，', px + 12, infoY + infoH2 - 26, {
          size: Math.round(9 * k), color: '#6B7A83',
        })
        T(ctx, '说明是倍数误差（Rs / Rf 没调准），不是表头坏了。', px + 12, infoY + infoH2 - 12, {
          size: Math.round(9 * k), color: '#6B7A83',
        })
      }
    }

    // 合格判定
    const maxAbs = pts.length ? Math.max(...pts.map((p) => Math.abs(p.err))) : 0
    const pass = pts.length > 0 && maxAbs <= PASS_ERR
    const vy = r.y + r.h - 30
    const label = !pts.length ? '未校准' : pass ? `✅ 合格（最大偏差 ${maxAbs.toFixed(1)}%）` : `⚠ 超差（最大偏差 ${maxAbs.toFixed(1)}%）`
    const col = !pts.length ? '#8A9AA4' : pass ? '#15803D' : '#C62828'
    ctx.save()
    ctx.fillStyle = hexA(col, 0.10)
    rr(ctx, px, vy - 12, pw, 26, 13)
    ctx.fill()
    ctx.strokeStyle = hexA(col, 0.45)
    ctx.stroke()
    ctx.restore()
    T(ctx, label, px + pw / 2, vy + 1, { size: Math.round(10.5 * k), bold: true, color: col, align: 'center' })
  }

  function drawDevChart(ctx, r, pts, sol, s, k) {
    const padL = 34 * k
    const padB = 24 * k
    const x0 = r.x + padL
    const x1 = r.x + r.w - 8 * k
    const y0 = r.y + 12 * k
    const y1 = r.y + r.h - padB
    const cy = (y0 + y1) / 2
    const range = s.mode === 'amp' ? sol.Ifs : sol.Ufs

    // 合格带 ±2.5%
    const bandH = (y1 - y0) / 2 * (PASS_ERR / 10)
    ctx.fillStyle = 'rgba(21,128,61,0.10)'
    ctx.fillRect(x0, cy - bandH, x1 - x0, bandH * 2)
    // 轴
    line(ctx, x0, cy, x1, cy, '#B7C3CB', 1)
    line(ctx, x0, y0 - 6 * k, x0, y1 + 6 * k, '#B7C3CB', 1)
    line(ctx, x0, y1 + 6 * k, x1, y1 + 6 * k, '#E3E9ED', 1)
    T(ctx, '+10%', x0 - 5 * k, y0 - 2 * k, { size: Math.round(8.5 * k), color: '#9AA7AF', align: 'right' })
    T(ctx, '0', x0 - 5 * k, cy, { size: Math.round(8.5 * k), color: '#7A8790', align: 'right' })
    T(ctx, '−10%', x0 - 5 * k, y1 + 2 * k, { size: Math.round(8.5 * k), color: '#9AA7AF', align: 'right' })
    T(ctx, '0', x0, y1 + 15 * k, { size: Math.round(8.5 * k), color: '#7A8790', align: 'center' })
    T(ctx, `${range}${s.mode === 'amp' ? 'A' : 'V'}`, x1, y1 + 15 * k, { size: Math.round(8.5 * k), color: '#7A8790', align: 'right' })
    T(ctx, '偏差 %', x0, y0 - 14 * k, { size: Math.round(8.5 * k), color: '#9AA7AF' })
    T(ctx, '绿带 = ±2.5% 合格', x1, y0 - 14 * k, { size: Math.round(8.5 * k), color: '#15803D', align: 'right' })

    ctx.save()
    ctx.beginPath()
    ctx.rect(x0 - 1, y0 - 8 * k, x1 - x0 + 2, y1 - y0 + 20 * k)
    ctx.clip()
    pts.forEach((p) => {
      const x = x0 + Math.max(0, Math.min(1, p.std / range)) * (x1 - x0)
      const y = cy - Math.max(-10, Math.min(10, p.err)) / 10 * (y1 - cy)
      const bad = Math.abs(p.err) > PASS_ERR
      ctx.fillStyle = bad ? '#C62828' : '#15803D'
      ctx.beginPath()
      ctx.arc(x, y, Math.max(2.5, 3.4 * k), 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx.lineWidth = 1
      ctx.stroke()
    })
    ctx.restore()
  }

  function recordPoint() {
    const s = S.current
    if (!s.closed) return
    const sol = solve(s)
    const c = calSolve(s, sol)
    if (!(c.std > 0)) return
    s.points = [...s.points.slice(-(MAX_POINTS - 1)), { mode: s.mode, rng: c.rng, std: c.std, read: c.read, err: c.err }]
    forceUpdate((n) => n + 1)
  }

  function autoFive() {
    const s = S.current
    if (!s.closed) { S.current.closed = true }
    const sol = solve(s)
    const pts = [0.2, 0.4, 0.6, 0.8, 1.0].map((r) => {
      const c = calSolve({ ...s, closed: true }, sol, r)
      return { mode: s.mode, rng: c.rng, std: c.std, read: c.read, err: c.err }
    })
    S.current.points = pts
    forceUpdate((n) => n + 1)
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
    // 悬停手型
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
   *  知识卡内容
   * ================================================================ */
  function buildSections(s) {
    return [
      {
        t: '实验目的', c: '#E0761F',
        items: [
          [['认识表头 '], ['G', '#1E6FD0', 1], ['：满偏电流 '], ['Ig', '#C2410C', 1], ['、内阻 '], ['Rg', '#C2410C', 1], ['，明白它为什么只能测极小电流。']],
          [['掌握并联'], ['分流', '#15803D', 1], ['改装电流表、串联'], ['分压', '#1565C0', 1], ['改装电压表的原理与计算。']],
          [['会用标准表逐点校准，并说清改装表内阻与误差来源。']],
        ],
      },
      {
        t: '表头 G：两个参数', c: '#C98A12',
        items: [
          [['满偏电流 '], ['Ig', '#C2410C', 1], ['：指针打到满刻度时通过表头的电流（现为 '], [`${s.igMa.toFixed(1)} mA`, '#C2410C', 1], ['）。']],
          [['内阻 '], ['Rg', '#C2410C', 1], ['：线圈本身的电阻（现为 '], [`${s.rg} Ω`, '#C2410C', 1], ['）。']],
          [['满偏电压 '], ['Ug = Ig·Rg', '#DC2626', 1], ['≈ 0.1 V；电流、电压都只能测一点点，直接接大电流会烧线圈。']],
        ],
      },
      {
        t: '改装电流表（并联分流）', c: '#15803D',
        items: [
          [['给表头'], ['并联', '#15803D', 1], ['一个小阻值 '], ['Rs', '#C2410C', 1], ['：两支路电压相等，大部分电流从低阻 Rs 走，表头只过 Ig。']],
          [['由 '], ['Ig·Rg = (I−Ig)·Rs', '#DC2626', 1], [' 得 '], ['Rs = Ig·Rg/(I−Ig) = Rg/(n−1)', '#DC2626', 1], ['，其中 '], ['n = I/Ig', '#DC2626', 1], ['。']],
          [['改装后内阻 '], ['RA = Rs∥Rg', '#15803D', 1], ['：很小，量程越大越小 —— 越接近理想电流表。']],
        ],
      },
      {
        t: '改装电压表（串联分压）', c: '#1565C0',
        items: [
          [['给表头'], ['串联', '#1565C0', 1], ['一个大阻值 '], ['Rf', '#C2410C', 1], ['：电流处处相等，大部分电压落在 Rf 上，表头只分到 Ug。']],
          [['由 '], ['U = Ig(Rg+Rf)', '#DC2626', 1], [' 得 '], ['Rf = U/Ig − Rg = Rg(n−1)', '#DC2626', 1], ['，其中 '], ['n = U/Ug', '#DC2626', 1], ['。']],
          [['改装后内阻 '], ['RV = Rg+Rf', '#1565C0', 1], ['：很大，量程越大越大 —— 越接近理想电压表。']],
        ],
      },
      {
        t: '误差规律（考试高频）', c: '#C2410C',
        items: [
          [['分流电阻 '], ['Rs 实际偏大', '#C2410C', 1], [' → 分流变弱 → 表头电流偏大 → '], ['读数偏大', '#DC2626', 1], ['。']],
          [['分压电阻 '], ['Rf 实际偏大', '#C2410C', 1], [' → 分压过多 → 表头电压偏小 → '], ['读数偏小', '#DC2626', 1], ['。']],
          [['校准：标准表与改装表同测一值，逐点算 '], ['δ = (读−标)/标', '#DC2626', 1], ['，一般 |δ| ≤ 2.5% 判合格。']],
        ],
      },
      {
        t: '注意事项', c: '#DC2626',
        items: [
          [['改线、换量程先'], ['断开开关', '#DC2626', 1], ['；测量先试触、先用大量程。']],
          [['分流电阻是'], ['零点几欧', '#15803D', 1], ['、分压电阻是'], ['几千欧', '#1565C0', 1], ['，算反了说明并/串搞混了。']],
          [['表头 '], ['Ig、Rg 始终不变', '#7C3AED', 1], ['，改的只是外接电阻和刻度标注。']],
        ],
      },
    ]
  }

  /* ================================================================
   *  React 渲染
   * ================================================================ */
  return (
    <SceneShell
      title="电表改装与校准"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t); S.current.dragArea = null; S.current.cardDrag = null }}
      tab1Label="📖 原理演示"
      tab2Label="🔬 校准实验"
      onReset={handleReset}
      desc={tab === 1 ? (
        <>
          <b>电表改装与校准</b>
          <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
            表头 G 并联分流成电流表 · 串联分压成电压表 · 标准表逐点校准
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
            ? '看懂表头 G 的两个参数，掌握并联分流改装电流表、串联分压改装电压表，理解“表头不变、只换外接电阻与刻度”。'
            : '把改装表和标准表接进同一回路，调滑变逐点比对读数、计算偏差；再把 Rs / Rf 调偏，验证两条误差规律。'}
          steps={tab === 1 ? [
            '① 认识表头：拉 Ig / Rg 看 Ug 怎么变，拖动“外接电流”看指针最多能偏到哪',
            '② 改装电流表：并 Rs 分流，换量程看 Rs、RA 怎么变',
            '③ 改装电压表：串 Rf 分压，换量程看 Rf、RV 怎么变',
            '④ 看本质：同一偏转角、三种刻度，记住两条高频误差',
          ] : [
            '选「校准电流表 / 校准电压表」和量程，闭合开关',
            '拖橙色滑片改变电流/电压，读标准表与改装表',
            '点「记录一点」存 3～5 组，再看「误差注入」把 Rs / Rf 调偏后重测',
          ]}
          hint={tab === 1
            ? '并小电阻扩流、串大电阻扩压；Rs 是零点几欧、Rf 是几千欧，算出来量级不对就是并/串用反了。'
            : '误差规律：Rs 偏大 → 读数偏大；Rf 偏大 → 读数偏小。|偏差| ≤ 2.5% 判合格。'}
        />
      </div>
    </SceneShell>
  )
}

/* ==================================================================
 *  基础绘制工具
 * ================================================================== */
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, Math.min(w, h) / 2)))
}
function line(ctx, x1, y1, x2, y2, color, width) {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}

/** 水平导轨，按 gaps 区间断开（表示此处不相连） */
function railWithGaps(ctx, x0, x1, y, gaps, color, lw) {
  const lo = Math.min(x0, x1)
  const hi = Math.max(x0, x1)
  let from = lo
  for (const [a, b] of [...gaps].sort((p, q) => p[0] - q[0])) {
    const a2 = Math.max(lo, a)
    const b2 = Math.min(hi, b)
    if (a2 > from) line(ctx, from, y, a2, y, color, lw)
    from = Math.max(from, b2)
  }
  if (hi > from) line(ctx, from, y, hi, y, color, lw)
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}
function T(ctx, str, x, y, o = {}) {
  const {
    size = 12, color = '#243542', bold = false, align = 'left',
    base = 'middle', mono = false,
  } = o
  ctx.save()
  ctx.font = `${bold ? 'bold ' : ''}${size}px ${mono ? 'Consolas, "Courier New", monospace' : '"Microsoft YaHei", sans-serif'}`
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = base
  ctx.fillText(str, x, y)
  ctx.restore()
}
function fmtOhm(R) {
  if (!Number.isFinite(R)) return '∞'
  if (R >= 1000) return `${(R / 1000).toFixed(R >= 10000 ? 1 : 2)} kΩ`
  if (R >= 10) return `${R.toFixed(1)} Ω`
  if (R >= 1) return `${R.toFixed(2)} Ω`
  return `${R.toFixed(3)} Ω`
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)) }
function ease(s, key, target) {
  const cur = s.needle[key] || 0
  const next = cur + (target - cur) * 0.16
  s.needle[key] = Math.abs(target - next) < 0.002 ? target : next
  return s.needle[key]
}

/** 实验台垫：浅青绿板 + 细网格（对齐视频里的绿板） */
function drawBoard(ctx, b) {
  ctx.save()
  ctx.shadowColor = 'rgba(86,108,90,0.16)'
  ctx.shadowBlur = 18
  ctx.shadowOffsetY = 6
  ctx.fillStyle = '#EDF3EC'
  rr(ctx, b.x, b.y, b.w, b.h, 18)
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  const g = ctx.createLinearGradient(b.x, b.y, b.x + b.w * 0.3, b.y + b.h)
  g.addColorStop(0, 'rgba(255,255,255,0.7)')
  g.addColorStop(1, 'rgba(208,226,212,0.55)')
  ctx.fillStyle = g
  rr(ctx, b.x, b.y, b.w, b.h, 18)
  ctx.fill()

  ctx.save()
  rr(ctx, b.x, b.y, b.w, b.h, 18)
  ctx.clip()
  ctx.strokeStyle = 'rgba(96,132,104,0.075)'
  ctx.lineWidth = 1
  for (let x = b.x + 26; x < b.x + b.w; x += 26) line(ctx, x, b.y, x, b.y + b.h, 'rgba(96,132,104,0.075)', 1)
  for (let y = b.y + 26; y < b.y + b.h; y += 26) line(ctx, b.x, y, b.x + b.w, y, 'rgba(96,132,104,0.075)', 1)
  ctx.restore()
  ctx.strokeStyle = '#D2E0D4'
  ctx.lineWidth = 1.2
  rr(ctx, b.x, b.y, b.w, b.h, 18)
  ctx.stroke()
  ctx.restore()
}

/** 「并小 / 串大」口诀卡 */
function mnemonicCard(ctx, x, y, w, h, k, o) {
  softCard(ctx, x, y, w, h, '#FFFFFF', hexA(o.color, 0.35))
  ctx.save()
  ctx.fillStyle = hexA(o.color, 0.10)
  rr(ctx, x, y, w, 28 * k, 10)
  ctx.fill()
  ctx.restore()
  T(ctx, o.tag, x + 12 * k, y + 16 * k, { size: Math.round(10.5 * k), bold: true, color: o.color })
  T(ctx, o.big, x + 12 * k, y + 52 * k, { size: Math.round(17 * k), bold: true, color: o.color })
  T(ctx, o.sub, x + 12 * k, y + 74 * k, { size: Math.round(9.5 * k), color: '#5B6B5F' })
}

/** 通用说明卡（标题 + 若干行） */
function noteCard(ctx, x, y, w, h, k, o) {
  softCard(ctx, x, y, w, h, o.fill || '#FFFFFF', o.stroke || '#E3E9ED')
  T(ctx, o.title, x + 12 * k, y + 16 * k, { size: Math.round(10.5 * k), bold: true, color: o.color })
  const n = Math.min(o.lines.length, Math.floor((h - 26 * k) / (17 * k)))
  for (let i = 0; i < n; i += 1) {
    T(ctx, `· ${o.lines[i]}`, x + 12 * k, y + 34 * k + i * 17 * k, {
      size: Math.round(9.5 * k), color: '#5B6B5F',
    })
  }
}

/** 白色小卡（结论牌 / 数据卡底） */
function softCard(ctx, x, y, w, h, fill, stroke) {
  ctx.save()
  ctx.shadowColor = 'rgba(74,94,84,0.10)'
  ctx.shadowBlur = 10
  ctx.shadowOffsetY = 3
  ctx.fillStyle = fill
  rr(ctx, x, y, w, h, 10)
  ctx.fill()
  ctx.restore()
  ctx.strokeStyle = stroke
  ctx.lineWidth = 1
  rr(ctx, x, y, w, h, 10)
  ctx.stroke()
}

function chip(ctx, x, y, w, h, txt, color, k) {
  ctx.save()
  ctx.fillStyle = hexA(color, 0.10)
  rr(ctx, x, y, w, h, h / 2)
  ctx.fill()
  ctx.strokeStyle = hexA(color, 0.35)
  ctx.lineWidth = 1
  rr(ctx, x, y, w, h, h / 2)
  ctx.stroke()
  ctx.restore()
  T(ctx, txt, x + w / 2, y + h / 2 + 1, {
    size: Math.round(10.5 * Math.max(0.8, k)), bold: true, color, align: 'center',
  })
}

function drawButton(ctx, x, y, w, h, txt, color, enabled, k) {
  ctx.save()
  ctx.fillStyle = enabled ? color : '#9AA7AF'
  rr(ctx, x, y, w, h, 8)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  rr(ctx, x + 3, y + 2, w - 6, h * 0.4, 5)
  ctx.fill()
  ctx.restore()
  T(ctx, txt, x + w / 2, y + h / 2 + 1, {
    size: Math.round(10.5 * Math.max(0.8, k)), bold: true, color: '#fff', align: 'center',
  })
}

/** 带标签的一行滑条，返回下一行 y */
function sliderRow(ctx, x, y, w, k, o) {
  const { label, value, min, max, step, unit, color, onDrag } = o
  const h = 16 * k
  T(ctx, label, x, y, { size: Math.round(10.5 * k), color: '#4B5A66', bold: true })
  T(ctx, `${Number(value).toFixed(step < 1 ? 1 : 0)} ${unit}`, x + w, y, {
    size: Math.round(11 * k), color, bold: true, align: 'right', mono: true,
  })
  const ty = y + h * 0.9
  line(ctx, x, ty, x + w, ty, '#D4DEE3', Math.max(2.4, 3.4 * k))
  const ratio = (value - min) / (max - min)
  line(ctx, x, ty, x + w * ratio, ty, color, Math.max(2.4, 3.4 * k))
  ctx.save()
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(x + w * ratio, ty, Math.max(5.5, 7 * k), 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = 1.6
  ctx.stroke()
  ctx.restore()
  areaForDrag(ctx, x, ty, w, step, min, max, onDrag, k)
  return ty + 12 * k
}

/** 滑条热区：由调用方在 render 里通过 areaForDrag 注册（见下方实现注入） */
let AREA_SINK = null
function areaForDrag(ctx, x, ty, w, step, min, max, onDrag, k) {
  if (!AREA_SINK) return
  AREA_SINK({
    x: x - 6, y: ty - 12 * k, w: w + 12, h: 24 * k,
    onDrag: (mx) => {
      const v = min + clamp((mx - x) / w, 0, 1) * (max - min)
      const snapped = Math.round(v / step) * step
      onDrag(+snapped.toFixed(step < 1 ? 2 : 0))
    },
  })
}

/** 量程药丸 */
function rangeChips(ctx, x, y, w, set, idx, unit, color, k, onPick) {
  const gap = 6 * k
  const cw = (w - gap * (set.length - 1)) / set.length
  set.forEach((v, i) => {
    const on = idx === i
    ctx.save()
    ctx.fillStyle = on ? color : 'rgba(255,255,255,0.9)'
    rr(ctx, x + i * (cw + gap), y, cw, 30 * k, 8)
    ctx.fill()
    ctx.strokeStyle = on ? color : '#D2DDE4'
    ctx.lineWidth = 1
    rr(ctx, x + i * (cw + gap), y, cw, 30 * k, 8)
    ctx.stroke()
    ctx.restore()
    T(ctx, `${v} ${unit}`, x + i * (cw + gap) + cw / 2, y + 15 * k + 1, {
      size: Math.round(11 * k), bold: true, color: on ? '#fff' : '#556876', align: 'center',
    })
    if (AREA_SINK) {
      AREA_SINK({ x: x + i * (cw + gap), y, w: cw, h: 30 * k, onClick: () => onPick(i) })
    }
  })
}

/** 公式板 */
function formulaPlate(ctx, x, y, w, k, rows) {
  const h = (16 + rows.length * 26) * k
  softCard(ctx, x, y, w, h, '#FFFDF8', '#E8DCC8')
  ctx.save()
  ctx.fillStyle = '#C98A12'
  rr(ctx, x + 8 * k, y + 10 * k, 3, h - 20 * k, 2)
  ctx.fill()
  ctx.restore()
  rows.forEach((r, i) => {
    T(ctx, r.s, x + 18 * k, y + (18 + i * 26) * k, {
      size: Math.round((r.size || 10.5) * k), color: r.color || '#5B6B5F', bold: !!r.bold,
    })
  })
}

/** 统计卡（④ 的两张内阻-量程表） */
function miniTable(ctx, x, y, w, k, o) {
  const rowH = 20 * k
  const headH = 24 * k
  const footH = o.foot ? 24 * k : 6 * k
  const h = headH + o.rows.length * rowH + footH
  softCard(ctx, x, y, w, h, '#FFFFFF', '#E3E9ED')
  const colW = (w - 20 * k) / o.head.length
  o.head.forEach((t, i) => {
    T(ctx, t, x + 10 * k + (i ? colW * (i + 1) : 0), y + 13 * k, {
      size: Math.round(9.5 * k), color: '#7A8790', bold: true, align: i ? 'right' : 'left',
    })
  })
  line(ctx, x + 8 * k, y + headH - 2 * k, x + w - 8 * k, y + headH - 2 * k, '#E7EDF1', 1)
  o.rows.forEach((row, ri) => {
    const ry = y + headH + rowH * (ri + 0.5)
    if (ri === 0) {
      ctx.fillStyle = hexA(o.color, 0.07)
      rr(ctx, x + 6 * k, ry - rowH / 2 + 1, w - 12 * k, rowH - 2, 4)
      ctx.fill()
    }
    row.forEach((cell, ci) => {
      T(ctx, String(cell), x + 10 * k + (ci ? colW * (ci + 1) : 0), ry, {
        size: Math.round(9.5 * k), color: ci === 0 ? '#42525E' : '#25313A', mono: ci > 0,
        align: ci ? 'right' : 'left', bold: ci === o.head.length - 1,
      })
    })
  })
  if (o.foot) {
    T(ctx, o.foot, x + 10 * k, y + h - 12 * k, { size: Math.round(9 * k), color: '#6B7A83' })
  }
}

function statCard(ctx, x, y, w, h, fill, stroke, k, o) {
  softCard(ctx, x, y, w, h, fill, stroke)
  T(ctx, o.title, x + 12 * k, y + 18 * k, { size: Math.round(11.5 * k), bold: true, color: o.color })
  const colW = (w - 24 * k) / 4
  const hy = y + 40 * k
  o.head.forEach((h, i) => {
    T(ctx, h, x + 12 * k + i * colW + (i ? colW : 0), hy, {
      size: Math.round(9.5 * k), color: '#7A8790', align: i ? 'right' : 'left',
    })
  })
  const rowH = o.bars ? 22 * k : Math.min(24 * k, (h - 74 * k) / o.rows.length)
  o.rows.forEach((row, ri) => {
    const ry = hy + 18 * k + ri * rowH
    if (ri % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      rr(ctx, x + 8 * k, ry - rowH / 2 - 2, w - 16 * k, rowH, 5)
      ctx.fill()
    }
    row.forEach((cell, ci) => {
      T(ctx, String(cell), x + 12 * k + ci * colW + (ci ? colW : 0), ry, {
        size: Math.round(10 * k), color: ci === 0 ? '#42525E' : '#25313A', mono: ci > 0,
        align: ci ? 'right' : 'left',
        bold: ci === 3,
      })
    })
  })
  // 趋势条：把「量程越大 RA 越小 / RV 越大」画出来
  if (o.bars && o.bars.length) {
    const by0 = hy + 18 * k + o.rows.length * rowH + 8 * k
    const room = y + h - 34 * k - by0
    const gapY = 5 * k
    const barH = Math.max(5, Math.min(11 * k, (room - gapY * (o.bars.length - 1)) / o.bars.length))
    const labW = 42 * k
    const valW = 54 * k
    const trackW = w - 24 * k - labW - valW
    if (room > o.bars.length * 6 + gapY * (o.bars.length - 1)) {
      o.bars.forEach((b, i) => {
        const yy = by0 + i * (barH + gapY)
        T(ctx, b.label, x + 12 * k, yy + barH / 2, { size: Math.round(9 * k), color: '#6B7A83' })
        ctx.fillStyle = 'rgba(255,255,255,0.75)'
        rr(ctx, x + 12 * k + labW, yy, trackW, barH, barH / 2)
        ctx.fill()
        ctx.fillStyle = hexA(o.color, 0.72)
        rr(ctx, x + 12 * k + labW, yy, Math.max(2, trackW * b.frac), barH, barH / 2)
        ctx.fill()
        T(ctx, b.text, x + w - 12 * k, yy + barH / 2, { size: Math.round(9 * k), color: o.color, align: 'right', mono: true, bold: true })
      })
    }
  }
  T(ctx, o.foot, x + 12 * k, y + h - 10 * k, { size: Math.round(9.5 * k), color: '#6B7A83' })
}

/* ==================================================================
 *  仪器绘制（实物风格）
 * ================================================================== */
function headTicks(igMa) {
  return [
    { t: 0, s: '0' }, { t: 0.2, s: (igMa * 0.2).toFixed(1) }, { t: 0.4, s: (igMa * 0.4).toFixed(1) },
    { t: 0.6, s: (igMa * 0.6).toFixed(1) }, { t: 0.8, s: (igMa * 0.8).toFixed(1) }, { t: 1, s: igMa.toFixed(1) },
  ]
}
function rangeTicks(max) {
  if (max === 0.6) return [{ t: 0, s: '0' }, { t: 1 / 3, s: '0.2' }, { t: 2 / 3, s: '0.4' }, { t: 1, s: '0.6' }]
  if (max === 1) return [{ t: 0, s: '0' }, { t: 1 / 3, s: '0.33' }, { t: 2 / 3, s: '0.66' }, { t: 1, s: '1' }]
  if (max === 3) return [{ t: 0, s: '0' }, { t: 1 / 3, s: '1' }, { t: 2 / 3, s: '2' }, { t: 1, s: '3' }]
  if (max === 15) return [{ t: 0, s: '0' }, { t: 1 / 3, s: '5' }, { t: 2 / 3, s: '10' }, { t: 1, s: '15' }]
  return [{ t: 0, s: '0' }, { t: 0.5, s: (max / 2).toFixed(1) }, { t: 1, s: String(max) }]
}

/** 表头内部结构小图：永磁体 N/S + 可动线圈 + 指针 + 游丝 */
function drawHeadInternals(ctx, x, y, w, h, frac, k) {
  softCard(ctx, x, y, w, h, '#FFFFFF', '#DFE7EC')
  T(ctx, '线圈通电 → 磁场力使它偏转（偏转角 ∝ 电流）', x + 12 * k, y + 17 * k, {
    size: Math.round(9.5 * k), bold: true, color: '#4B5A66',
  })
  const pad = 12 * k
  const top = y + 30 * k
  const bot = y + h - 16 * k
  const cy = (top + bot) / 2
  const innerL = x + pad
  const innerR = x + w - pad
  const poleW = Math.min(78 * k, (innerR - innerL) * 0.165)
  const poleH = Math.min(bot - top, 82 * k)
  const hubX = (innerL + innerR) / 2

  // 磁极
  ctx.fillStyle = '#E53935'
  rr(ctx, innerL, cy - poleH / 2, poleW, poleH, 3)
  ctx.fill()
  ctx.fillStyle = '#1E40AF'
  rr(ctx, innerR - poleW, cy - poleH / 2, poleW, poleH, 3)
  ctx.fill()
  T(ctx, 'N', innerL + poleW / 2, cy, { size: Math.round(11 * k), bold: true, color: '#fff', align: 'center' })
  T(ctx, 'S', innerR - poleW / 2, cy, { size: Math.round(11 * k), bold: true, color: '#fff', align: 'center' })

  // 线圈 + 指针（按电流大小偏转）
  const gap = innerR - innerL - 2 * poleW
  const coilW = Math.min(gap * 0.54, 170 * k)
  const coilH = Math.max(18 * k, poleH * 0.62)
  const ang = clamp(frac, 0, 1.15) * 0.60 - 0.05
  ctx.save()
  ctx.translate(hubX, cy)
  ctx.rotate(ang)
  ctx.fillStyle = '#D9A24A'
  rr(ctx, -coilW / 2, -coilH / 2, coilW, coilH, 3)
  ctx.fill()
  ctx.strokeStyle = '#9A6A22'
  ctx.lineWidth = 1
  const turns = Math.max(3, Math.round(coilW / (26 * k)))
  for (let i = 1; i < turns; i += 1) {
    const lx = -coilW / 2 + (coilW / turns) * i
    ctx.beginPath()
    ctx.moveTo(lx, -coilH / 2 + 2)
    ctx.lineTo(lx, coilH / 2 - 2)
    ctx.stroke()
  }
  ctx.strokeStyle = '#C62828'
  ctx.lineWidth = Math.max(1.6, 2.2 * k)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, -(coilH * 0.5 + 26 * k))
  ctx.stroke()
  // 游丝：轴心处的螺旋弹簧
  ctx.strokeStyle = '#7B8894'
  ctx.lineWidth = 1.1
  ctx.beginPath()
  for (let t = 0; t < 15; t += 0.35) {
    const rad2 = (1.5 + t * 0.85) * k
    const px = Math.cos(t) * rad2
    const py = Math.sin(t) * rad2 * 0.85 + coilH * 0.06
    if (t === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.stroke()
  ctx.restore()
  ctx.fillStyle = '#5A6670'
  ctx.beginPath()
  ctx.arc(hubX, cy, 2.6 * k, 0, Math.PI * 2)
  ctx.fill()

  // 底部说明（三栏对齐，互不重叠）
  const labY = y + h - 8 * k
  T(ctx, 'N 极', innerL + poleW / 2, labY, { size: Math.round(8.5 * k), color: '#B0261C', align: 'center' })
  T(ctx, '可动线圈', hubX, labY, { size: Math.round(8.5 * k), color: '#9A6A22', align: 'center' })
  T(ctx, 'S 极', innerR - poleW / 2, labY, { size: Math.round(8.5 * k), color: '#1E40AF', align: 'center' })
}

/**
 * 教学电表（大画幅）：彩色胶木壳 + 黑框白盘 + 弧形刻度 + 红指针 + 红黑接线柱
 * o: {theme, letter, unit, frac, rangeText, ticks, k, showTerminals}
 */
function drawMeterArt(ctx, x, y, w, h, o = {}) {
  const theme = THEME[o.theme] || THEME.blue
  const letter = o.letter || 'G'
  const unit = o.unit || ''
  const ticks = o.ticks || []
  const frac = Number.isFinite(o.frac) ? o.frac : 0
  const over = frac > 1.02
  const showTerms = o.showTerminals !== false
  const r = Math.max(7, w * 0.045)

  ctx.save()
  // 投影 + 底部厚度
  ctx.fillStyle = 'rgba(20,34,30,0.22)'
  rr(ctx, x + 4, y + 8, w, h, r)
  ctx.fill()

  const body = ctx.createLinearGradient(x, y, x + w * 0.2, y + h)
  body.addColorStop(0, theme[0])
  body.addColorStop(0.5, theme[1])
  body.addColorStop(1, theme[2])
  ctx.fillStyle = body
  rr(ctx, x, y, w, h, r)
  ctx.fill()

  ctx.save()
  rr(ctx, x, y, w, h, r)
  ctx.clip()
  const side = ctx.createLinearGradient(x, y, x + w, y)
  side.addColorStop(0, 'rgba(255,255,255,0.30)')
  side.addColorStop(0.10, 'rgba(255,255,255,0)')
  side.addColorStop(0.86, 'rgba(0,0,0,0.05)')
  side.addColorStop(1, 'rgba(0,0,0,0.30)')
  ctx.fillStyle = side
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = 'rgba(255,255,255,0.30)'
  ctx.fillRect(x + 8, y + 4, w - 16, Math.max(2, h * 0.016))
  ctx.restore()

  ctx.strokeStyle = 'rgba(10,24,32,0.55)'
  ctx.lineWidth = 1.2
  rr(ctx, x, y, w, h, r)
  ctx.stroke()

  // 表盘
  const dx = x + w * 0.085
  const dy = y + h * 0.085
  const dw = w * 0.83
  const dh = h * (showTerms ? 0.56 : 0.70)
  ctx.fillStyle = '#0C1317'
  rr(ctx, dx - 5, dy - 5, dw + 10, dh + 10, Math.max(6, w * 0.035))
  ctx.fill()
  const face = ctx.createRadialGradient(dx + dw / 2, dy + dh * 0.35, 4, dx + dw / 2, dy + dh * 0.35, dw * 0.62)
  face.addColorStop(0, '#FFFFFF')
  face.addColorStop(0.72, '#FDFDF9')
  face.addColorStop(1, '#E9EDE6')
  ctx.fillStyle = face
  rr(ctx, dx, dy, dw, dh, Math.max(4, w * 0.024))
  ctx.fill()
  ctx.save()
  rr(ctx, dx, dy, dw, dh, Math.max(4, w * 0.024))
  ctx.clip()
  const shade = ctx.createLinearGradient(dx, dy, dx, dy + dh * 0.5)
  shade.addColorStop(0, 'rgba(12,28,38,0.14)')
  shade.addColorStop(1, 'rgba(12,28,38,0)')
  ctx.fillStyle = shade
  ctx.fillRect(dx, dy, dw, dh * 0.5)
  ctx.restore()

  const hub = { x: dx + dw * 0.5, y: dy + dh * 0.95 }
  const rad = Math.min(dw * 0.43, dh * 0.82)
  const a0 = Math.PI * 200 / 180
  const a1 = Math.PI * 340 / 180
  ctx.strokeStyle = '#98A2A7'
  ctx.lineWidth = Math.max(0.8, w * 0.0035)
  ctx.beginPath()
  ctx.arc(hub.x, hub.y, rad, a0, a1)
  ctx.stroke()

  for (let i = 0; i <= 20; i++) {
    const a = a0 + (a1 - a0) * i / 20
    const big = i % 5 === 0
    const r1 = rad
    const r2 = rad - rad * (big ? 0.17 : 0.09)
    ctx.strokeStyle = big ? '#2B353A' : '#9AA4A8'
    ctx.lineWidth = big ? Math.max(1.1, w * 0.005) : Math.max(0.7, w * 0.0025)
    ctx.beginPath()
    ctx.moveTo(hub.x + Math.cos(a) * r1, hub.y + Math.sin(a) * r1)
    ctx.lineTo(hub.x + Math.cos(a) * r2, hub.y + Math.sin(a) * r2)
    ctx.stroke()
  }
  ticks.forEach((tk) => {
    const a = a0 + (a1 - a0) * tk.t
    T(ctx, tk.s, hub.x + Math.cos(a) * rad * 0.70, hub.y + Math.sin(a) * rad * 0.70, {
      size: Math.max(6.5, w * 0.040), color: '#49555B', align: 'center',
    })
  })

  // 表头符号（放在刻度弧内侧下方，避免压住刻度数字）
  T(ctx, letter, hub.x, hub.y - rad * 0.36, {
    size: Math.max(11, dh * 0.30), bold: true, color: over ? '#C62828' : '#233039', align: 'center',
  })
  if (unit) {
    T(ctx, unit, dx + dw * 0.90, hub.y - rad * 0.14, {
      size: Math.max(7, w * 0.032), color: '#79858B', align: 'center',
    })
  }

  // 指针
  const aN = a0 + (a1 - a0) * clamp(frac, -0.02, 1.06)
  const nx = hub.x + Math.cos(aN) * (rad - 1)
  const ny = hub.y + Math.sin(aN) * (rad - 1)
  ctx.strokeStyle = 'rgba(255,255,255,0.72)'
  ctx.lineWidth = Math.max(3, w * 0.017)
  ctx.beginPath()
  ctx.moveTo(hub.x, hub.y)
  ctx.lineTo(nx, ny)
  ctx.stroke()
  ctx.strokeStyle = over ? '#C62828' : '#B3261E'
  ctx.lineWidth = Math.max(1.5, w * 0.0075)
  ctx.beginPath()
  ctx.moveTo(hub.x, hub.y)
  ctx.lineTo(nx, ny)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(80,90,96,0.55)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(hub.x, hub.y)
  ctx.lineTo(hub.x - Math.cos(aN) * w * 0.03, hub.y - Math.sin(aN) * w * 0.03)
  ctx.stroke()
  ctx.fillStyle = '#3C474E'
  ctx.beginPath()
  ctx.arc(hub.x, hub.y, Math.max(2.6, w * 0.016), 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#A8B2B8'
  ctx.beginPath()
  ctx.arc(hub.x - w * 0.004, hub.y - w * 0.004, Math.max(1.2, w * 0.007), 0, Math.PI * 2)
  ctx.fill()

  // 玻璃反光
  ctx.save()
  rr(ctx, dx, dy, dw, dh, Math.max(4, w * 0.024))
  ctx.clip()
  ctx.fillStyle = 'rgba(255,255,255,0.30)'
  ctx.beginPath()
  ctx.moveTo(dx + dw * 0.10, dy)
  ctx.lineTo(dx + dw * 0.42, dy)
  ctx.lineTo(dx + dw * 0.02, dy + dh)
  ctx.lineTo(dx - dw * 0.22, dy + dh)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  if (!showTerms) {
    ctx.restore()
    return { terms: null }
  }

  // 底部接线区（黑胶木条 + 红黑接线柱 + 量程）
  // 接线柱中心固定在 0.845h —— 校准台的引线也按这个比例算，保证线和柱头严丝合缝
  const sh = Math.max(16, h * 0.20)
  const ty = y + h * 0.845
  const sy = ty - sh / 2
  ctx.fillStyle = 'rgba(12,20,26,0.90)'
  rr(ctx, x + w * 0.04, sy, w * 0.92, sh, Math.max(5, w * 0.03))
  ctx.fill()
  const tx1 = x + w * 0.26
  const tx2 = x + w * 0.74
  drawPost(ctx, tx1, ty, w * 0.055, '#1A1A1A')
  drawPost(ctx, tx2, ty, w * 0.055, '#C62828')
  T(ctx, '−', tx1, ty + sh * 0.42, { size: Math.max(7, w * 0.032), color: '#E2E8EC', align: 'center' })
  T(ctx, '+', tx2, ty + sh * 0.42, { size: Math.max(7, w * 0.032), color: '#FFD9D6', align: 'center' })
  if (o.rangeText) {
    T(ctx, o.rangeText, x + w * 0.5, sy + sh * 0.34, {
      size: Math.max(6.5, w * 0.030), color: 'rgba(255,255,255,0.75)', align: 'center',
    })
  }
  ctx.restore()
  return { terms: { neg: { x: tx1, y: ty }, pos: { x: tx2, y: ty } } }
}

/** 接线柱：铜柱 + 彩色胶木帽 */
function drawPost(ctx, x, y, r, capColor) {
  ctx.save()
  ctx.fillStyle = '#B58A4E'
  ctx.beginPath()
  ctx.ellipse(x, y + r * 0.45, r, r * 0.5, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = capColor
  ctx.beginPath()
  ctx.ellipse(x, y, r, r * 0.72, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.beginPath()
  ctx.ellipse(x - r * 0.28, y - r * 0.2, r * 0.34, r * 0.22, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** 色环电阻（横放）：本体 + 四道色环 + 引线 + 阻值 */
function drawResistorArt(ctx, cx, cy, len, R, vertical, k, label) {
  const bodyL = len * 0.58
  const bodyH = Math.max(10, len * 0.19)
  ctx.save()
  ctx.translate(cx, cy)
  if (vertical) ctx.rotate(Math.PI / 2)
  ctx.strokeStyle = '#B7BEC3'
  ctx.lineWidth = Math.max(1.2, 2 * k)
  ctx.beginPath()
  ctx.moveTo(-len / 2, 0)
  ctx.lineTo(-bodyL / 2, 0)
  ctx.moveTo(bodyL / 2, 0)
  ctx.lineTo(len / 2, 0)
  ctx.stroke()
  const g = ctx.createLinearGradient(0, -bodyH / 2, 0, bodyH / 2)
  g.addColorStop(0, '#F7EBD8')
  g.addColorStop(0.45, '#E8D4B9')
  g.addColorStop(1, '#BEA284')
  ctx.fillStyle = g
  rr(ctx, -bodyL / 2, -bodyH / 2, bodyL, bodyH, bodyH * 0.45)
  ctx.fill()
  ctx.strokeStyle = 'rgba(120,96,72,0.65)'
  ctx.lineWidth = 0.8
  ctx.stroke()
  const bands = Array.isArray(label) ? label : resistorBands(R)
  bands.forEach((c, i) => {
    ctx.fillStyle = c
    ctx.fillRect(-bodyL / 2 + bodyL * (0.14 + i * 0.16), -bodyH / 2, bodyL * 0.075, bodyH)
  })
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  rr(ctx, -bodyL / 2 + 3, -bodyH / 2 + 2, bodyL - 6, Math.max(1.5, bodyH * 0.16), 1)
  ctx.fill()
  ctx.restore()
  if (R != null && !Array.isArray(label)) {
    T(ctx, fmtOhm(R), cx, cy + (vertical ? bodyH * 0.9 : bodyH), {
      size: Math.max(8, 9.5 * k), color: '#6B5A46', align: 'center',
    })
  }
}

/** 表盒（改装表外壳）：半透明壳 + 顶部铭牌 + 底部外接线柱 */
function drawHousing(ctx, x, y, w, h, o, k) {
  ctx.save()
  ctx.shadowColor = 'rgba(50,72,58,0.12)'
  ctx.shadowBlur = 12
  ctx.shadowOffsetY = 4
  ctx.fillStyle = 'rgba(255,255,255,0.60)'
  rr(ctx, x, y, w, h, 14)
  ctx.fill()
  ctx.restore()
  ctx.strokeStyle = o.color
  ctx.lineWidth = 1.6
  rr(ctx, x, y, w, h, 14)
  ctx.stroke()
  ctx.strokeStyle = hexA(o.color, 0.22)
  ctx.lineWidth = 1
  rr(ctx, x + 5, y + 5, w - 10, h - 10, 10)
  ctx.stroke()

  // 铭牌
  ctx.font = `bold ${Math.round(11.5 * k)}px "Microsoft YaHei", sans-serif`
  const tw = ctx.measureText(o.label).width
  const plateW = tw + 26 * k
  const plateH = 24 * k
  ctx.save()
  ctx.fillStyle = o.color
  rr(ctx, x + 12 * k, y - plateH / 2, plateW, plateH, plateH / 2)
  ctx.fill()
  ctx.restore()
  T(ctx, o.label, x + 12 * k + plateW / 2, y + 1, {
    size: Math.round(11.5 * k), bold: true, color: '#fff', align: 'center',
  })
  T(ctx, o.sub, x + 12 * k + plateW + 10 * k, y + 1, {
    size: Math.round(10 * k), color: '#5B6B5F',
  })
}

/** 改装电流表：壳内 G ∥ Rs，壳外两个接线柱 */
function drawAmpAssembly(ctx, x, y, w, h, sol, k) {
  drawHousing(ctx, x, y, w, h, { label: '改装电流表', sub: `量程 0 ~ ${sol.Ifs} A`, color: '#15803D' }, k)

  const gW = Math.min(w * 0.62, 240 * k)
  const gH = gW * 0.78
  const gx = x + w * 0.06
  const gy = y + h * 0.06
  drawMeterArt(ctx, gx, gy, gW, gH, {
    theme: 'blue', letter: 'G', unit: 'mA', frac: 0.82,
    rangeText: `0 ~ ${(sol.Ig * 1000).toFixed(1)} mA`, ticks: headTicks(sol.Ig * 1000), k,
  })

  const stripY = gy + gH * 0.845
  const aL = gx + gW * 0.26
  const aR = gx + gW * 0.74
  const nodeL = x + w * 0.20
  const nodeR = x + w * 0.80
  const outY = y + h - 26 * k
  const rY = Math.min(stripY + 58 * k, outY - 48 * k)
  const rLen = Math.min(w * 0.40, 170 * k)
  const resL = (nodeL + nodeR) / 2 - rLen / 2
  const resR = (nodeL + nodeR) / 2 + rLen / 2

  // 壳内接线：G 两柱 ↔ Rs 两端（并联），再由同一节点引出壳外柱
  ctx.save()
  drawLead(ctx, aL, stripY + 4 * k, resL, rY, '#3A464D', 1.8 * k)
  drawLead(ctx, aR, stripY + 4 * k, resR, rY, '#3A464D', 1.8 * k)
  drawLead(ctx, resL, rY, nodeL, rY, '#3A464D', 1.8 * k)
  drawLead(ctx, resR, rY, nodeR, rY, '#3A464D', 1.8 * k)
  drawLead(ctx, nodeL, rY, nodeL, outY, '#3A464D', 1.8 * k)
  drawLead(ctx, nodeR, rY, nodeR, outY, '#3A464D', 1.8 * k)
  ctx.restore()

  // 分流电阻（小阻值、短身子，跨在两根柱之间）
  drawResistorArt(ctx, (nodeL + nodeR) / 2, rY, rLen, sol.Rs, false, k)

  drawPost(ctx, nodeL, outY, Math.max(5, 6 * k), '#1A1A1A')
  drawPost(ctx, nodeR, outY, Math.max(5, 6 * k), '#C62828')
  T(ctx, '−', nodeL, outY - 12 * k, { size: Math.round(9 * k), color: '#4B5A66', align: 'center' })
  T(ctx, '+', nodeR, outY - 12 * k, { size: Math.round(9 * k), color: '#B3261E', align: 'center' })
  T(ctx, '表头 G 与 Rs 并联，装进同一个表盒 → 对外只有两个接线柱', x + w / 2, y + h + 12 * k, {
    size: Math.round(9.5 * k), color: '#6B7A83', align: 'center',
  })
}

/** 改装电压表：壳内 G 串 Rf，壳外两个接线柱 */
function drawVoltAssembly(ctx, x, y, w, h, sol, k) {
  drawHousing(ctx, x, y, w, h, { label: '改装电压表', sub: `量程 0 ~ ${sol.Ufs} V`, color: '#1565C0' }, k)

  const gW = Math.min(w * 0.62, 240 * k)
  const gH = gW * 0.78
  const gx = x + w * 0.06
  const gy = y + h * 0.06
  drawMeterArt(ctx, gx, gy, gW, gH, {
    theme: 'blue', letter: 'G', unit: 'mA', frac: 0.82,
    rangeText: `0 ~ ${(sol.Ig * 1000).toFixed(1)} mA`, ticks: headTicks(sol.Ig * 1000), k,
  })

  const stripY = gy + gH * 0.845
  const aL = gx + gW * 0.26
  const aR = gx + gW * 0.74
  const outY = y + h - 26 * k
  const rY = Math.min(stripY + 58 * k, outY - 48 * k)
  const rLen = Math.min(w * 0.44, 200 * k)
  const nodeR = Math.min(x + w * 0.94, aR + 12 * k + rLen)

  // 壳内接线：G− 直接出壳；G+ → Rf → 另一根外柱（串联）
  ctx.save()
  drawLead(ctx, aL, stripY + 4 * k, aL, outY, '#3A464D', 1.8 * k)
  drawLead(ctx, aR, stripY + 4 * k, aR, rY, '#3A464D', 1.8 * k)
  drawLead(ctx, nodeR, rY, nodeR, outY, '#3A464D', 1.8 * k)
  ctx.restore()

  // 分压电阻（紧挨表头右侧，大阻值、身子长）
  drawResistorArt(ctx, (aR + nodeR) / 2, rY, nodeR - aR, sol.Rf, false, k)

  drawPost(ctx, aL, outY, Math.max(5, 6 * k), '#1A1A1A')
  drawPost(ctx, nodeR, outY, Math.max(5, 6 * k), '#C62828')
  T(ctx, '−', aL, outY - 12 * k, { size: Math.round(9 * k), color: '#4B5A66', align: 'center' })
  T(ctx, '+', nodeR, outY - 12 * k, { size: Math.round(9 * k), color: '#B3261E', align: 'center' })
  T(ctx, '表头 G 与 Rf 串联，装进同一个表盒 → 对外只有两个接线柱', x + w / 2, y + h + 12 * k, {
    size: Math.round(9.5 * k), color: '#6B7A83', align: 'center',
  })
}

/** 并联分流示意图（带实时数值） */
function drawShuntDiagram(ctx, x, y, w, h, sol, k) {
  softCard(ctx, x, y, w, h, '#F7FBF8', '#D6E7DA')
  const I = sol.Ifs
  const Ig = sol.Ig
  const xA = x + w * 0.09
  const xB = x + w * 0.91
  const yA = y + h * 0.36
  const yB = y + h * 0.70
  const cx = x + w * 0.5
  const gBoxW = w * 0.30
  const gBoxH = 26 * k
  const rLen = w * 0.34

  // 主干 + 总电流
  line(ctx, xA, yA, xA, yB, '#3A464D', 2 * k)
  line(ctx, xB, yA, xB, yB, '#3A464D', 2 * k)
  line(ctx, xA, (yA + yB) / 2, xA - 14 * k, (yA + yB) / 2, '#3A464D', 2 * k)
  line(ctx, xB, (yA + yB) / 2, xB + 14 * k, (yA + yB) / 2, '#3A464D', 2 * k)
  arrowHead(ctx, xA - 5 * k, (yA + yB) / 2, -1, '#3A464D', 2.6 * k)
  arrowHead(ctx, xB + 5 * k, (yA + yB) / 2, 1, '#3A464D', 2.6 * k)
  T(ctx, `总电流 I = ${I.toFixed(2)} A`, x + w / 2, y + 15 * k, {
    size: Math.round(10.5 * k), bold: true, color: '#25313A', align: 'center',
  })

  // 上支路：表头（只过 Ig）
  line(ctx, xA, yA, cx - gBoxW / 2, yA, '#3A464D', 2 * k)
  line(ctx, cx + gBoxW / 2, yA, xB, yA, '#3A464D', 2 * k)
  ctx.fillStyle = '#1E6FD0'
  rr(ctx, cx - gBoxW / 2, yA - gBoxH / 2, gBoxW, gBoxH, 6)
  ctx.fill()
  T(ctx, '表头 G', cx, yA, { size: Math.round(10 * k), color: '#fff', bold: true, align: 'center' })
  T(ctx, `Ig = ${(Ig * 1000).toFixed(1)} mA`, cx, yA - gBoxH / 2 - 11 * k, {
    size: Math.round(9.5 * k), color: '#1E6FD0', align: 'center',
  })

  // 下支路：分流电阻（分走 I−Ig）
  line(ctx, xA, yB, cx - rLen / 2, yB, '#3A464D', 2 * k)
  line(ctx, cx + rLen / 2, yB, xB, yB, '#3A464D', 2 * k)
  drawResistorArt(ctx, cx, yB, rLen, null, false, k)
  T(ctx, `Rs = ${fmtOhm(sol.Rs)}`, cx, yB + 21 * k, {
    size: Math.round(9.5 * k), color: '#15803D', align: 'center', bold: true,
  })
  T(ctx, `I−Ig = ${(I - Ig).toFixed(3)} A`, cx, yB + 35 * k, {
    size: Math.round(9 * k), color: '#6B7A83', align: 'center',
  })

  // 四个结点（逐个绘制，避免被连成多边形）
  ctx.fillStyle = '#3A464D'
  for (const [px, py] of [[xA, yA], [xA, yB], [xB, yA], [xB, yB]]) {
    ctx.beginPath()
    ctx.arc(px, py, 2.6 * k, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** 串联分压示意图（带电压分配） */
function drawDividerDiagram(ctx, x, y, w, h, sol, k) {
  softCard(ctx, x, y, w, h, '#F5F9FE', '#D3E1F0')
  const yM = y + h * 0.60
  const x0 = x + w * 0.07
  const x3 = x + w * 0.93
  const x1 = x + w * 0.24
  const x2 = x1 + w * 0.24
  const rLen = x3 - x2 - 6 * k
  const rx = x2 + 6 * k + rLen / 2

  line(ctx, x0, yM, x1, yM, '#3A464D', 2 * k)
  line(ctx, x2, yM, x2 + 6 * k, yM, '#3A464D', 2 * k)
  ctx.fillStyle = '#1E6FD0'
  rr(ctx, x1, yM - 13 * k, x2 - x1, 26 * k, 6)
  ctx.fill()
  T(ctx, '表头 G', (x1 + x2) / 2, yM, { size: Math.round(10 * k), color: '#fff', bold: true, align: 'center' })

  // 分压电阻
  drawResistorArt(ctx, rx, yM, rLen, null, false, k)
  T(ctx, `Rf = ${fmtOhm(sol.Rf)}`, rx, yM + 24 * k, {
    size: Math.round(9.5 * k), color: '#1565C0', align: 'center', bold: true,
  })

  // 电压括号
  bracket(ctx, x1, x2, yM - 24 * k, `Ug = ${sol.Ug.toFixed(3)} V`, '#1E6FD0', k)
  bracket(ctx, x2, x3, yM - 24 * k, `U−Ug = ${(sol.Ufs - sol.Ug).toFixed(2)} V`, '#1565C0', k)
  bracket(ctx, x0, x3, y + h * 0.20, `总电压 U = ${sol.Ufs} V`, '#25313A', k)

  // 电流标注
  T(ctx, `I = Ig = ${(sol.Ig * 1000).toFixed(1)} mA（串联，处处相等）`, x + w / 2, y + h * 0.92, {
    size: Math.round(9.5 * k), color: '#6B7A83', align: 'center',
  })
}

function arrowHead(ctx, x, y, dir, color, s) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x + dir * s, y)
  ctx.lineTo(x - dir * s * 0.4, y - s * 0.55)
  ctx.lineTo(x - dir * s * 0.4, y + s * 0.55)
  ctx.closePath()
  ctx.fill()
}

function bracket(ctx, x1, x2, y, label, color, k) {
  line(ctx, x1, y, x1, y + 5 * k, color, 1.2)
  line(ctx, x1, y, x2, y, color, 1.2)
  line(ctx, x2, y, x2, y + 5 * k, color, 1.2)
  T(ctx, label, (x1 + x2) / 2, y - 8 * k, { size: Math.round(9.5 * k), color, align: 'center' })
}

/** 电池组实物 */
function drawBatteryArt(ctx, cx, cy, w, h, k, label, label2) {
  const x = cx - w / 2
  const y = cy - h - 4 * k
  ctx.save()
  ctx.fillStyle = 'rgba(20,34,30,0.18)'
  rr(ctx, x + 3, y + 5, w, h, 8)
  ctx.fill()
  const g = ctx.createLinearGradient(x, y, x, y + h)
  g.addColorStop(0, '#2E3A45')
  g.addColorStop(0.5, '#22303A')
  g.addColorStop(1, '#141E26')
  ctx.fillStyle = g
  rr(ctx, x, y, w, h, 8)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'
  ctx.lineWidth = 1
  ctx.stroke()
  // 两节干电池露出顶面
  const cellW = w * 0.34
  const cellY = y + h * 0.12
  for (const dx of [-cellW * 0.62, cellW * 0.62]) {
    const gx = cx + dx - cellW / 2
    ctx.fillStyle = '#DDE4E8'
    rr(ctx, gx, cellY, cellW, h * 0.44, 4)
    ctx.fill()
    ctx.fillStyle = '#1565C0'
    rr(ctx, gx + cellW * 0.18, cellY + 2, cellW * 0.42, h * 0.40, 2)
    ctx.fill()
    ctx.fillStyle = '#C58A3C'
    rr(ctx, gx + cellW * 0.72, cellY + h * 0.10, cellW * 0.18, h * 0.24, 2)
    ctx.fill()
  }
  // 接线柱（落在母线高度上）
  const ty = cy
  drawPost(ctx, cx - w * 0.30, ty, Math.max(4.5, 5.4 * k), '#1A1A1A')
  drawPost(ctx, cx + w * 0.30, ty, Math.max(4.5, 5.4 * k), '#C62828')
  T(ctx, '−', cx - w * 0.30, ty - 13 * k, { size: Math.round(8.5 * k), color: 'rgba(230,236,240,0.85)', align: 'center' })
  T(ctx, '+', cx + w * 0.30, ty - 13 * k, { size: Math.round(8.5 * k), color: 'rgba(255,214,210,0.9)', align: 'center' })
  T(ctx, label2 || '电池组 3 V', cx, y + h * 0.74, {
    size: Math.round(9 * k), color: 'rgba(255,255,255,0.96)', bold: true, align: 'center',
  })
  if (label) {
    T(ctx, label, cx, y - 8 * k, { size: Math.round(9.5 * k), color: '#6B7A83', align: 'center' })
  }
  ctx.restore()
}

/** 闸刀开关 */
function drawSwitchArt(ctx, cx, cy, w, closed, k) {
  const baseY = cy
  ctx.save()
  ctx.fillStyle = 'rgba(40,54,44,0.20)'
  rr(ctx, cx - w / 2 + 2, baseY - 20 * k + 3, w, 18 * k, 4)
  ctx.fill()
  const g = ctx.createLinearGradient(0, baseY - 20 * k, 0, baseY - 2 * k)
  g.addColorStop(0, '#6D4C41')
  g.addColorStop(1, '#462C24')
  ctx.fillStyle = g
  rr(ctx, cx - w / 2, baseY - 20 * k, w, 18 * k, 4)
  ctx.fill()
  ctx.strokeStyle = '#3A211A'
  ctx.lineWidth = 1
  ctx.stroke()
  const px1 = cx - w * 0.30
  const px2 = cx + w * 0.30
  drawPost(ctx, px1, baseY, Math.max(3.6, 4.4 * k), '#B58A4E')
  drawPost(ctx, px2, baseY, Math.max(3.6, 4.4 * k), '#B58A4E')
  // 闸刀
  const tipY = closed ? baseY - 2 * k : baseY - 36 * k
  ctx.strokeStyle = closed ? '#E2B34B' : '#C9962F'
  ctx.lineWidth = Math.max(3, 4 * k)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(px1, baseY - 2 * k)
  ctx.lineTo(closed ? px2 : px2 - 4 * k, tipY)
  ctx.stroke()
  ctx.lineCap = 'butt'
  // 手柄
  ctx.fillStyle = '#D32F2F'
  ctx.beginPath()
  ctx.arc(closed ? px2 : px2 - 4 * k, tipY, Math.max(3.2, 4.2 * k), 0, Math.PI * 2)
  ctx.fill()
  T(ctx, closed ? '合' : '断', cx, cy + 12 * k, {
    size: Math.round(9 * k), color: closed ? '#15803D' : '#8A9AA4', align: 'center',
  })
  ctx.restore()
}

/** 滑动变阻器（宽体）+ 滑片 + 可选滑片引出线 */
function drawRheostatArt(ctx, cx, cy, w, ratio, k, o = {}) {
  const bodyW = w * 0.84
  const bodyH = Math.max(14, w * 0.13)
  const yBody = cy - 30 * k
  ctx.save()
  ctx.fillStyle = 'rgba(30,44,36,0.16)'
  rr(ctx, cx - bodyW / 2 + 3, yBody + 6, bodyW, bodyH, 8)
  ctx.fill()
  // 瓷筒
  const g = ctx.createLinearGradient(0, yBody, 0, yBody + bodyH)
  g.addColorStop(0, '#FFFFFF')
  g.addColorStop(0.45, '#F2EEE7')
  g.addColorStop(1, '#C9BEB2')
  ctx.fillStyle = g
  rr(ctx, cx - bodyW / 2, yBody, bodyW, bodyH, bodyH * 0.45)
  ctx.fill()
  ctx.strokeStyle = '#B9AEA2'
  ctx.lineWidth = 1
  ctx.stroke()
  // 密绕电阻丝
  ctx.save()
  rr(ctx, cx - bodyW / 2, yBody, bodyW, bodyH, bodyH * 0.45)
  ctx.clip()
  const n = Math.max(18, Math.round(bodyW / (3 * k)))
  for (let i = 0; i < n; i++) {
    const px = cx - bodyW / 2 + 3 + i * (bodyW - 6) / n
    ctx.strokeStyle = i % 2 ? 'rgba(88,72,58,0.62)' : 'rgba(140,120,100,0.55)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(px, yBody - 2)
    ctx.lineTo(px, yBody + bodyH + 2)
    ctx.stroke()
  }
  const sheen = ctx.createLinearGradient(0, yBody, 0, yBody + bodyH)
  sheen.addColorStop(0, 'rgba(255,255,255,0.40)')
  sheen.addColorStop(0.42, 'rgba(255,255,255,0.04)')
  sheen.addColorStop(1, 'rgba(0,0,0,0.24)')
  ctx.fillStyle = sheen
  ctx.fillRect(cx - bodyW / 2, yBody, bodyW, bodyH)
  ctx.restore()
  // 端环
  for (const dx of [-bodyW / 2, bodyW / 2]) {
    ctx.fillStyle = '#C79A4B'
    rr(ctx, cx + dx - 3, yBody - 1, 6, bodyH + 2, 2)
    ctx.fill()
  }
  // 金属滑杆
  const rodY = yBody - 16 * k
  ctx.fillStyle = '#B8C2C9'
  rr(ctx, cx - bodyW / 2 - 6 * k, rodY, bodyW + 12 * k, Math.max(3, 4.6 * k), 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  rr(ctx, cx - bodyW / 2 - 4 * k, rodY + 1, bodyW + 8 * k, 1.4 * k, 1)
  ctx.fill()
  // 支脚
  for (const dx of [-bodyW * 0.34, bodyW * 0.34]) {
    ctx.fillStyle = '#7E8B94'
    rr(ctx, cx + dx - 6 * k, yBody + bodyH - 2, 12 * k, 7 * k, 2)
    ctx.fill()
  }
  // 滑片
  const sx = cx - bodyW * 0.42 + clamp(ratio, 0, 1) * bodyW * 0.84
  ctx.fillStyle = '#EF6C00'
  ctx.strokeStyle = '#B34700'
  ctx.lineWidth = 1.2
  rr(ctx, sx - 7 * k, rodY - 8 * k, 14 * k, 15 * k, 3)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  rr(ctx, sx - 5 * k, rodY - 7 * k, 10 * k, 2 * k, 1)
  ctx.fill()
  // 触点
  ctx.strokeStyle = '#D8DEE2'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(sx, rodY + 7 * k)
  ctx.lineTo(sx, yBody + 2)
  ctx.stroke()
  // 引出线（分压用）
  if (o.wiper) {
    ctx.strokeStyle = '#C0392B'
    ctx.lineWidth = 2.6 * k
    ctx.beginPath()
    ctx.moveTo(sx, rodY - 8 * k)
    ctx.lineTo(sx, rodY - 18 * k)
    ctx.stroke()
  }
  ctx.restore()
  drawPost(ctx, cx - w * 0.42, cy, Math.max(4, 5 * k), '#1A1A1A')
  drawPost(ctx, cx + w * 0.42, cy, Math.max(4, 5 * k), '#C62828')
  T(ctx, o.label || '滑动变阻器', cx, yBody + bodyH + 12 * k, {
    size: Math.round(9 * k), color: '#6B7A83', align: 'center',
  })
}

/** 环母线（可留缺口）：顶边被两只电表断开，底边被三件器材断开 */
function busPath(ctx, o, color, lw) {
  const { L, R, T, B, r: rad, gapTop = [], gapBot = [] } = o
  const draw = () => {
    // 顶边
    let cursor = L + rad
    seg(cursor, T, R - rad, T, gapTop)
    // 底边（从右到左）
    seg(R - rad, B, L + rad, B, gapBot)
    // 左右竖边 + 圆角
    arc(L + rad, B - rad, rad, Math.PI / 2, Math.PI)
    arc(L + rad, T + rad, rad, Math.PI, Math.PI * 1.5)
    arc(R - rad, T + rad, rad, Math.PI * 1.5, Math.PI * 2)
    arc(R - rad, B - rad, rad, 0, Math.PI / 2)
    line(ctx, L, T + rad, L, B - rad, color, lw)
    line(ctx, R, T + rad, R, B - rad, color, lw)
  }
  const seg = (x1, y1, x2, y2, gaps) => {
    const step = x2 >= x1 ? 1 : -1
    const sorted = [...gaps].map(([a, b]) => (step > 0 ? [a, b] : [b, a])).sort((p, q) => (p[0] - q[0]) * step)
    let from = x1
    for (const [a, b] of sorted) {
      const cutStart = clamp(a, Math.min(x1, x2), Math.max(x1, x2))
      const cutEnd = clamp(b, Math.min(x1, x2), Math.max(x1, x2))
      if ((cutStart - from) * step > 2) line(ctx, from, y1, cutStart, y1, color, lw)
      from = cutEnd
    }
    if ((x2 - from) * step > 2) line(ctx, from, y1, x2, y2, color, lw)
  }
  const arc = (cx, cy, rad2, a1, a2) => {
    ctx.strokeStyle = color
    ctx.lineWidth = lw
    ctx.beginPath()
    ctx.arc(cx, cy, rad2, a1, a2)
    ctx.stroke()
  }
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  draw()
  ctx.restore()
}

/** 软导线（带下垂）：从 (x1,y1) 到 (x2,y2)，sag 控制弯曲量 */
function drawLead(ctx, x1, y1, x2, y2, color, lw, flat) {
  if (lw <= 0) return
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy)
  if (len < 0.5) return
  const sag = flat ? 0 : Math.min(18, len * 0.14) * (dy >= 0 ? 1 : 0.4)
  const cx = (x1 + x2) / 2
  const cy = (y1 + y2) / 2 + sag
  const path = (c) => {
    c.beginPath()
    c.moveTo(x1, y1)
    if (sag <= 0.3) c.lineTo(x2, y2)
    else c.quadraticCurveTo(cx, cy, x2, y2)
    c.stroke()
  }
  ctx.strokeStyle = 'rgba(40,30,26,0.28)'
  ctx.lineWidth = lw + 1.6
  path(ctx)
  ctx.strokeStyle = color
  ctx.lineWidth = lw
  path(ctx)
}

