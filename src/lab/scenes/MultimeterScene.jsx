import { useState, useRef, useEffect, useCallback } from 'react'
import { eventToCanvas } from '../utils/pointerPos'
import SceneShell from '../ui/SceneShell'
import InfoDock from '../ui/InfoDock'
import { drawKnowledgeCard } from '../ui/knowledgeCard'
import { rr, T, chip, softCard, hexA, clamp } from './labArtKit'
import {
  MM_RANGES, RANGE_BY_ID, drawMultimeter, drawProbeLead,
  drawResistorBoard, drawDiodeBoard, drawBulbBoard, drawProbeDock,
} from './multimeterArt'

/**
 * MultimeterScene — ⚡ 练习使用多用电表
 *
 * 版式照「电表改装 / 小灯泡伏安」两场景：
 *   Tab1 📖 认识表盘 —— 大画幅 MF-47：三条刻度逐条讲、旋钮切档看指针与读数；
 *   Tab2 🔧 自己动手 —— 机械调零 → 选 Ω 档短接调零 → 测 R₁ / 换档测 R₂ →
 *                        二极管正反 → 灯泡电压/电流 → 归位 OFF，任务自动判定。
 *
 * 物理口径：
 *   Ω 档 中值 15，R内 = 15×倍率，指针偏转 ∝ R内/(R内+Rx)；
 *   直流档 指针 ∝ 读数/量程，第二排 0–250 与 0–50 换算；
 *   灯泡电路 E=3 V（两节干电池，内阻 0.6 Ω）、灯 8 Ω、电流档内阻 1 Ω。
 */

const CIRCUIT = { E: 3.0, r: 0.6, Rb: 8.0, Rm: 1.0 }
const OHM_MID = 15

const DEMO_OBJECTS = [
  { id: 'r12k', name: '12 kΩ 电阻', range: 'ohm1k', kind: 'ohm', value: 12000 },
  { id: 'cell', name: '1.5 V 干电池', range: 'dcv2p5', kind: 'dcv', value: 1.52 },
  { id: 'bulbU', name: '灯泡两端 2.8 V', range: 'dcv10', kind: 'dcv', value: 2.79 },
  { id: 'diode', name: '二极管（黑笔接＋）', range: 'ohm1k', kind: 'ohm', value: 900 },
]

const TASK_DEFS = [
  { id: 'mech', t: '机械调零：指针指左端 0', d: '点表盘下方的调零螺丝，把指针拧回左端 0 位' },
  { id: 'ohmZero', t: 'Ω×1 短接调零：指针指 0 Ω', d: '档位旋到 Ω 的 1 档，两笔放「短接片」，转 Ω ADJ 到 0 Ω' },
  { id: 'r1', t: '测 R₁：读数 12 Ω', d: '两笔分别接 R₁ 两柱，读数应 ≈12，不用乘倍率' },
  { id: 'r2', t: '换 ×1k 重新调零，测 R₂：12 kΩ', d: '换档必须重新短接调零，再测 R₂，读数 12 ×1k = 12 kΩ' },
  { id: 'diode', t: '二极管：正接读数小、反接 ∞', d: 'Ω 档内部电池正极接黑表笔，所以黑笔接 ＋ 端才导通' },
  { id: 'bulbU', t: '测灯泡电压：约 2.8 V', d: '直流 10 V 档，红笔接高电位，并联在灯泡两端' },
  { id: 'bulbI', t: '测灯泡电流：约 0.31 A', d: '点断口铜排打开，把表串进去（500 mA 档）' },
  { id: 'off', t: '收表：旋到 OFF，表笔归位', d: '做完把档位旋到 OFF（或交流最高档），表笔放回笔架' },
]

function zeroGain(adj) {
  // 调零旋钮改变串联电阻：adj=0.625 时刚好满偏（0 Ω）
  const Rz = 24 * (1 - clamp(adj, 0, 1))
  return clamp(15 / (6 + Rz), 0, 1.06)
}

function fmtR(v) {
  if (!Number.isFinite(v)) return '∞'
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 1 : 2)} kΩ`
  if (v >= 10) return `${v.toFixed(0)} Ω`
  return `${v.toFixed(1)} Ω`
}

function fmtNum(v, unit) {
  if (!Number.isFinite(v)) return '∞'
  const a = Math.abs(v)
  if (unit === 'V') return a >= 100 ? `${v.toFixed(0)} V` : a >= 10 ? `${v.toFixed(1)} V` : `${v.toFixed(2)} V`
  if (unit === 'A') {
    if (a < 0.001) return `${(v * 1e6).toFixed(0)} μA`
    if (a < 0.1) return `${(v * 1000).toFixed(1)} mA`
    return `${v.toFixed(3)} A`
  }
  return `${v}`
}

export default function MultimeterScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const [, forceUpdate] = useState(0)
  const [tab, setTab] = useState(1)

  const S = useRef({
    tab: 1,
    range1: 'ohm1k',
    range2: 'off',
    demo: 'r12k',
    mech: 0.055,
    zeroAdj: 0.22,
    knob: RANGE_BY_ID.ohm1k.angle,
    needle: 0,
    probes: { red: { target: null, free: null }, black: { target: null, free: null } },
    drag: null,
    switchClosed: false,
    jumperClosed: true,
    tasks: {},
    seen: {},
    cardScroll: 0,
    cardDrag: null,
    hintAt: 0,
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
  function circuit() {
    const s = S.current
    const meterSeries = !s.jumperClosed
      && s.probes.red.target === 'brk1' && s.probes.black.target === 'brk2'
    let I = 0
    if (s.switchClosed) {
      if (s.jumperClosed) I = CIRCUIT.E / (CIRCUIT.Rb + CIRCUIT.r)
      else if (meterSeries) I = CIRCUIT.E / (CIRCUIT.Rb + CIRCUIT.r + CIRCUIT.Rm)
    }
    const potB2 = 0.05
    let potB1 = potB2
    let potL = potB2
    if (!s.switchClosed) {
      potB1 = 3.0; potL = 3.0
    } else if (s.jumperClosed) {
      potB1 = potB2
      potL = potB2 + I * CIRCUIT.Rb
    } else if (meterSeries) {
      potB1 = potB2 + I * CIRCUIT.Rm
      potL = potB1 + I * CIRCUIT.Rb
    } else {
      potB1 = 3.0; potL = 3.0
      I = 0
    }
    return { I, potL, potB1, potB2, meterSeries }
  }

  function resistanceBetween(a, b) {
    const both = (p, q) => (a === p && b === q) || (a === q && b === p)
    if (a === 'short' && b === 'short') return 0
    if (both('r1a', 'r1b')) return 12
    if (both('r2a', 'r2b')) return 12000
    if (both('da', 'dk')) return S.current.probes.black.target === 'da' ? 900 : Infinity
    if (both('bulbL', 'bulbR') || both('brk1', 'brk2')) return NaN
    return Infinity
  }

  function measure() {
    const s = S.current
    const range = RANGE_BY_ID[s.rangeId || (s.tab === 1 ? s.range1 : s.range2)]
    const out = {
      range, value: 0, unit: '', frac: 0, hint: '', warn: '',
      rowLabel: '', rowValue: 0, mult: 1, showValue: '—',
    }
    if (!range || range.kind === 'off') {
      out.hint = '选择开关在 OFF：表针不动，先旋到要用的档位'
      return out
    }

    if (s.tab === 1) {
      const obj = DEMO_OBJECTS.find((o) => o.id === s.demo) || DEMO_OBJECTS[0]
      if (range.kind === 'ohm' && obj.kind === 'ohm') {
        const Rint = OHM_MID * range.mult
        const g = zeroGain(s.tab === 1 ? 0.625 : s.zeroAdj)
        out.frac = clamp(g * Rint / (Rint + obj.value), 0, 1.06)
        out.value = obj.value
        out.unit = 'Ω'
        out.hint = g < 0.98 ? 'Ω 档没调零：先短接表笔把指针调到 0 Ω' : ''
      } else if ((range.kind === 'dcv' || range.kind === 'acv' || range.kind === 'dca') && obj.kind === 'dcv') {
        if (range.kind === 'dca') {
          out.hint = '电流档不能并在电池两端（相当于短路）'
        } else {
          out.frac = clamp(obj.value / range.full, 0, 1.06)
          out.value = obj.value
          out.unit = 'V'
          if (obj.value > range.full) out.warn = `超量程：${obj.value} V 应换更大的档`
        }
      } else {
        out.hint = '档位与被测物理量不匹配，换档再测'
        out.frac = 0
      }
      if (range.kind === 'ohm' && obj.kind === 'ohm') out.unit = 'Ω'
      return out
    }

    const a = s.probes.red.target
    const b = s.probes.black.target
    if (!a || !b) {
      out.hint = '表笔还没接到被测元件：拖红/黑表笔到接线柱或短接片'
      return out
    }

    const circ = circuit()
    if (range.kind === 'ohm') {
      const R = resistanceBetween(a, b)
      if (Number.isNaN(R)) {
        out.warn = '带电测电阻：先把开关断开，否则读数错、还可能打表'
        out.frac = 0.06
        return out
      }
      const Rint = OHM_MID * range.mult
      const g = zeroGain(s.tab === 1 ? 0.625 : s.zeroAdj)
      out.frac = clamp(g * (Number.isFinite(R) ? Rint / (Rint + R) : 0), 0, 1.06)
      out.value = R
      out.unit = 'Ω'
      if (a === 'short' && b === 'short' && g < 0.985) {
        out.warn = '指针没到 0 Ω：转 Ω ADJ 继续调零'
      }
      return out
    }

    if (range.kind === 'dcv' || range.kind === 'acv') {
      if (range.kind === 'acv') {
        out.hint = '这台只接了直流电源：交流档测不到读数，可当关机位'
        return out
      }
      const pot = { bulbL: circ.potL, bulbR: circ.potB1, brk1: circ.potB1, brk2: circ.potB2 }
      const va = pot[a]
      const vb = pot[b]
      if (va == null || vb == null) {
        out.hint = '这两点之间没有电压（电阻/二极管上不带电）'
        return out
      }
      const diffuse = va - vb
      if (diffuse < -0.02) {
        out.warn = '红表笔接反了：红笔应接高电位，否则指针反打'
        out.frac = -0.02
        out.value = diffuse
        out.unit = 'V'
        return out
      }
      out.value = Math.abs(diffuse)
      out.frac = clamp(out.value / range.full, 0, 1.06)
      out.unit = 'V'
      return out
    }

    if (range.kind === 'dca') {
      if (a === 'brk1' && b === 'brk2') {
        if (s.jumperClosed) {
          out.hint = '铜排还短接着，电流走了铜排：先点铜排打开断口'
          return out
        }
        out.value = circ.I
        out.frac = clamp(circ.I / range.full, 0, 1.06)
        out.unit = 'A'
        if (range.full < circ.I) out.warn = `超量程：${fmtNum(circ.I, 'A')} 超过 ${range.label} 档`
        return out
      }
      out.warn = '电流档必须串联：并在元件两端相当于短路'
      return out
    }
    return out
  }

  function decode(m) {
    const range = m.range
    if (!range || range.kind === 'off') return { row: '—', rowValue: 0, actual: '—', unit: '', mult: 1, note: '表针不动' }
    const f = m.frac
    if (range.kind === 'ohm') {
      if (f >= 0.988) return { row: 'Ω 刻度（上排）', rowValue: 0, actual: '0 Ω', unit: 'Ω', mult: range.mult, note: '指针满偏＝被测电阻 0' }
      if (f <= 0.012) return { row: 'Ω 刻度（上排）', rowValue: Infinity, actual: '∞', unit: 'Ω', mult: range.mult, note: '指针不动＝断路（或反向）' }
      const scale = OHM_MID * (1 - f) / f
      const val = scale * range.mult
      return {
        row: 'Ω 刻度（上排）', rowValue: scale, actual: fmtR(val), unit: 'Ω', mult: range.mult,
        note: `读数 ${scale.toFixed(1)} × ${range.label} = ${fmtR(val)}`,
      }
    }
    if (range.kind === 'dcv' || range.kind === 'acv') {
      const rowMax = range.rowMax || 250
      const rv = clamp(f, 0, 1.05) * rowMax
      return {
        row: rowMax === 10 ? '0–10 刻度（第三排）' : '0–250 / 0–50（第二排）',
        rowValue: rv, actual: fmtNum(m.value, 'V'), unit: 'V', mult: range.full / rowMax,
        note: `0–${rowMax} 线 ${rv.toFixed(1)} × ${(range.full / rowMax).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')} = ${fmtNum(m.value, 'V')}`,
      }
    }
    if (range.kind === 'dca') {
      const rowMax = 50
      const rv = clamp(f, 0, 1.05) * rowMax
      return {
        row: '0–50 刻度（第二排内圈）', rowValue: rv, actual: fmtNum(m.value, 'A'), unit: 'A', mult: range.full / rowMax,
        note: `0–50 线 ${rv.toFixed(1)} × ${(range.full / rowMax * 1000).toFixed(0)} mA = ${fmtNum(m.value, 'A')}`,
      }
    }
    return { row: '—', rowValue: 0, actual: '—', unit: '', mult: 1, note: '' }
  }

  /* ================================================================
   *  任务判定
   * ================================================================ */
  function evaluateTasks(m) {
    const s = S.current
    const both = (p, q) => (s.probes.red.target === p && s.probes.black.target === q)
      || (s.probes.red.target === q && s.probes.black.target === p)
    const range = RANGE_BY_ID[s.range2]

    if (both('short', 'short') && range.kind === 'ohm' && s.range2 === 'ohm1' && m.frac > 0.985) s.seen.ohmZero = true
    if (both('r1a', 'r1b') && s.range2 === 'ohm1' && Number.isFinite(m.value) && Math.abs(m.value - 12) < 0.9) s.seen.r1 = true
    if (both('r2a', 'r2b') && s.range2 === 'ohm1k' && Math.abs(m.value - 12000) < 900) s.seen.r2 = true
    if (both('da', 'dk') && range.kind === 'ohm') {
      if (s.probes.black.target === 'da' && Number.isFinite(m.value) && m.value < 3000) s.seen.diodeF = true
      if (s.probes.black.target === 'dk') s.seen.diodeR = true
    }
    const circ = circuit()
    if (s.range2 === 'dcv10' && both('bulbL', 'bulbR') && s.switchClosed && s.probes.red.target === 'bulbL'
      && Math.abs(m.value - 2.79) < 0.15) s.seen.bulbU = true
    if (s.range2 === 'dca500' && both('brk1', 'brk2') && !s.jumperClosed && s.switchClosed
      && Math.abs(circ.I - 0.313) < 0.03) s.seen.bulbI = true

    const done = {
      mech: Math.abs(s.mech) < 0.012,
      ohmZero: !!s.seen.ohmZero,
      r1: !!s.seen.r1,
      r2: !!s.seen.r2,
      diode: !!s.seen.diodeF && !!s.seen.diodeR,
      bulbU: !!s.seen.bulbU,
      bulbI: !!s.seen.bulbI,
      off: s.range2 === 'off' && !s.probes.red.target && !s.probes.black.target && !!s.seen.any,
    }
    return done
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
    const glow = ctx.createRadialGradient(W * 0.28, H * 0.34, 20, W * 0.28, H * 0.34, Math.max(W, H) * 0.75)
    glow.addColorStop(0, 'rgba(255,255,255,0.65)')
    glow.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, W, H)

    R._hits = []
    R._targets = {}
    R._cardBox = null
    const lay = layout(W, H)
    if (S.current.tab === 1) renderLearn(ctx, R, lay)
    else renderPractice(ctx, R, lay)
    // 交互热区必须挂到 canvas 上，事件处理读的是 canvas._hits / _targets / _cardBox
    R.canvas._hits = R._hits
    R.canvas._targets = R._targets
    R.canvas._cardBox = R._cardBox
  }

  /* ---------- 公共小件 ---------- */
  function rangeTitle(range) {
    if (!range || range.kind === 'off') return 'OFF'
    if (range.kind === 'ohm') return `电阻 Ω ×${range.label}`
    if (range.kind === 'dcv') return `直流电压 ${range.label} V`
    if (range.kind === 'acv') return `交流电压 ${range.label} V`
    if (range.kind === 'dca') return range.id === 'a10' ? '直流电流 10 A' : `直流电流 ${range.label} mA`
    return ''
  }

  /* ================================================================
   *  Tab 1：认识表盘
   * ================================================================ */
  function renderLearn(ctx, R, lay) {
    const s = S.current
    const k = lay.s
    const m = measure()
    s.needle += (clamp(m.frac, -0.03, 1.05) - s.needle) * 0.16
    const targetAng = RANGE_BY_ID[s.range1].angle
    let d = targetAng - s.knob
    while (d > 180) d -= 360
    while (d < -180) d += 360
    s.knob += d * 0.18

    const meter = lay.R(24, 30, 438, 600)
    const geo = drawMultimeter(ctx, meter, {
      rangeId: s.range1, frac: s.needle, mech: s.mech, zeroAdj: 0.625, callouts: true, knob: s.knob,
    })
    canvasRef.current._geo = geo
    T(ctx, 'MF-47 型指针式多用电表（点档位切档 · 点/上下拖螺丝机械调零 · 拖 Ω ADJ 调零）', meter.x, meter.y + meter.h + 16 * k, {
      size: Math.round(10 * k), color: '#6B7A83',
    })

    // 右侧：读数演示
    const px = lay.X(486)
    const pw = lay.V(494)
    const dec = decode(m)
    const card = { x: px, y: lay.Y(30), w: pw, h: lay.V(196) }
    softCard(ctx, card.x, card.y, card.w, card.h, '#FFFFFF', '#DFE7EC')
    T(ctx, '📖 当前读数怎么来的', card.x + 14 * k, card.y + 20 * k, {
      size: Math.round(11.5 * k), bold: true, color: '#25313A',
    })
    chip(ctx, card.x + 14 * k, card.y + 34 * k, lay.V(150), lay.V(24), rangeTitle(RANGE_BY_ID[s.range1]), '#1565C0', k)
    const obj = DEMO_OBJECTS.find((o) => o.id === s.demo)
    T(ctx, `被测：${obj ? obj.name : '—'}`, card.x + 172 * k, card.y + 46 * k, {
      size: Math.round(9.5 * k), color: '#6B7A83',
    })
    const bigY = card.y + 82 * k
    T(ctx, dec.row, card.x + 14 * k, bigY, { size: Math.round(9.5 * k), color: '#6B7A83' })
    const rowTxt = dec.rowValue === Infinity ? '∞'
      : RANGE_BY_ID[s.range1].kind === 'ohm' ? dec.rowValue.toFixed(1) : dec.rowValue.toFixed(1)
    T(ctx, rowTxt, card.x + 14 * k, bigY + 26 * k, {
      size: Math.round(24 * k), color: '#B3261E', bold: true, mono: true,
    })
    T(ctx, '指针读数', card.x + 14 * k, bigY + 46 * k, { size: Math.round(9 * k), color: '#8A959C' })
    T(ctx, '×', card.x + 150 * k, bigY + 24 * k, { size: Math.round(13 * k), color: '#6B7A83' })
    T(ctx, RANGE_BY_ID[s.range1].kind === 'ohm' ? `倍率 ${RANGE_BY_ID[s.range1].label}`
      : `量程系数 ${dec.mult.toFixed(3)}`, card.x + 166 * k, bigY + 24 * k, {
      size: Math.round(10 * k), color: '#6B7A83',
    })
    T(ctx, '=', card.x + 150 * k, bigY + 54 * k, { size: Math.round(13 * k), color: '#6B7A83' })
    T(ctx, dec.actual, card.x + 166 * k, bigY + 54 * k, {
      size: Math.round(20 * k), color: '#15803D', bold: true, mono: true,
    })
    T(ctx, dec.note, card.x + 14 * k, card.y + card.h - 20 * k, {
      size: Math.round(9.5 * k), color: '#4B5A66',
    })

    // 三条刻度速记
    const g2 = { x: px, y: lay.Y(244), w: pw, h: lay.V(246) }
    softCard(ctx, g2.x, g2.y, g2.w, g2.h, '#FFFCF6', '#F2DCC0')
    T(ctx, '三条刻度，各读各的', g2.x + 14 * k, g2.y + 20 * k, {
      size: Math.round(11.5 * k), bold: true, color: '#C2410C',
    })
    const rows = [
      { c: '#1E6B3B', t: '最上排 Ω', d: '左 ∞、右 0，刻度不均匀；读数 × 倍率' },
      { c: '#A8281F', t: '第二排 0–250 / 0–50', d: '直流电压、直流电流共用；按量程换算' },
      { c: '#8A3229', t: '第三排 0–10', d: '交流 10 V 专用；本表无交流源，可当关机位' },
    ]
    rows.forEach((r, i) => {
      const yy = g2.y + 48 * k + i * 54 * k
      ctx.fillStyle = hexA(r.c, 0.10)
      rr(ctx, g2.x + 12 * k, yy - 12 * k, g2.w - 24 * k, 42 * k, 8)
      ctx.fill()
      T(ctx, r.t, g2.x + 20 * k, yy - 2 * k, { size: Math.round(11.5 * k), bold: true, color: r.c })
      T(ctx, r.d, g2.x + 20 * k, yy + 18 * k, { size: Math.round(10.5 * k), color: '#4B5A66' })
    })
    T(ctx, '读数三步：先看档位 → 再看该读哪排 → 读格 × 倍率', g2.x + 14 * k, g2.y + g2.h - 16 * k, {
      size: Math.round(10.5 * k), color: '#A5762F',
    })

    // 操作要点
    const g3 = {
      x: px, y: lay.Y(496), w: pw,
      h: lay.V(202),
    }
    softCard(ctx, g3.x, g3.y, g3.w, g3.h, '#FFFFFF', '#DFE7EC')
    T(ctx, '上手前记住这几条', g3.x + 14 * k, g3.y + 20 * k, {
      size: Math.round(11.5 * k), bold: true, color: '#1565C0',
    })
    const tips = [
      '① 机械调零：没测之前指针不在左端 0 → 拧表盘下方的螺丝',
      '② 欧姆调零：Ω 档每次换档都要短接表笔，转 Ω ADJ 到 0 Ω',
      '③ 表笔：红笔插 ＋、黑笔插 COM；Ω 档黑笔接内部电池正极',
      '④ 测电压并联、测电流串联、测电阻先断电',
      '⑤ 估读：分度值 1 / 0.1 / 0.01 读到下一位；5 / 2 / 0.5 / 0.2 读到本位',
      '⑥ 图注：①刻度 ②指针 ③开关 ④Ω ADJ ⑤插孔 ⑥机械螺丝',
    ]
    tips.forEach((t, i) => {
      T(ctx, t, g3.x + 14 * k, g3.y + 46 * k + i * 23 * k, { size: Math.round(10.5 * k), color: '#4B5A66' })
    })

    // 点击热区
    addKnobHits(R, geo, (id) => setRange(id, 1))
    addTrimHits(R, geo, k)
    if (lay.panel) {
      const out = drawKnowledgeCard(ctx, lay.panel, buildLearnSections(), {
        title: '📖 表盘与档位',
        scroll: s.cardScroll,
        tip: (c2, tx, ty) => {
          c2.fillStyle = '#B08954'
          c2.font = '11.5px "Microsoft YaHei", sans-serif'
          c2.textAlign = 'left'
          c2.textBaseline = 'middle'
          c2.fillText(`当前：${rangeTitle(RANGE_BY_ID[s.range1])} · ${dec.actual}`, tx, ty + 10)
        },
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
    const m = measure()
    const dec = decode(m)
    const circ = circuit()
    if (m.range && m.range.kind !== 'off' && (m.value !== 0 || m.frac !== 0)) s.seen.any = true

    // 指针与旋钮缓动
    s.needle += (clamp(m.frac, -0.03, 1.05) - s.needle) * 0.17
    const targetAng = RANGE_BY_ID[s.range2].angle
    let d = targetAng - s.knob
    while (d > 180) d -= 360
    while (d < -180) d += 360
    s.knob += d * 0.2

    const meter = lay.R(14, 14, 338, 464)
    const geo = drawMultimeter(ctx, meter, {
      rangeId: s.range2, frac: s.needle, mech: s.mech, zeroAdj: s.zeroAdj, callouts: false, knob: s.knob,
    })
    canvasRef.current._geo = geo

    // 表笔架 / 短接片（先画，供表笔落点用）
    const dock = lay.R(14, 618, 338, 128)
    const dockGeo = drawProbeDock(ctx, dock, k)

    // 被测器材
    const rb = lay.R(374, 14, 612, 166)
    const db = lay.R(374, 190, 612, 118)
    const bbBottom = (lay.stage.y + lay.stage.h - lay.oy) / lay.s - 8
    const bb = lay.R(374, 318, 612, clamp(bbBottom - 318, 300, 470))
    const rg = drawResistorBoard(ctx, rb, k)
    const dg = drawDiodeBoard(ctx, db, k)
    const bg = drawBulbBoard(ctx, bb, k, {
      jumperClosed: s.jumperClosed, closed: s.switchClosed,
      lit: s.switchClosed ? (s.jumperClosed || circ.meterSeries ? 0.85 : 0) : 0,
    })
    // 灯亮提示
    if (s.switchClosed && circ.I > 0.05) {
      T(ctx, `回路电流 ${(circ.I * 1000).toFixed(0)} mA · 灯两端 ${(circ.I * CIRCUIT.Rb).toFixed(2)} V`,
        bb.x + 14 * k, bb.y + bb.h - 14 * k, { size: Math.round(9.5 * k), color: '#15803D', bold: true })
    }

    // 汇总目标点
    const targets = {
      ...rg.posts, ...dg.posts, ...bg.posts,
      short: { x: dockGeo.pad.x, y: dockGeo.pad.y, r: dockGeo.pad.r },
    }
    R._targets = targets

    // 表笔位置
    const tips = {}
    for (const which of ['red', 'black']) {
      const pr = s.probes[which]
      if (pr.target === 'short') {
        // 两支笔分开一点，避免笔身叠在一起盖住短接片
        const off = (which === 'red' ? -1 : 1) * dockGeo.pad.r * 0.62
        tips[which] = { x: targets.short.x + off, y: targets.short.y }
      } else if (pr.target && targets[pr.target]) {
        tips[which] = { x: targets[pr.target].x, y: targets[pr.target].y }
      } else if (pr.free) {
        tips[which] = pr.free
      } else {
        tips[which] = which === 'red'
          ? { x: dockGeo.rest[0].x, y: dockGeo.rest[0].y }
          : { x: dockGeo.rest[1].x, y: dockGeo.rest[1].y }
      }
    }
    // 导线先画（读数卡后画会压住横穿的线）
    drawProbeLead(ctx, geo.jacks.pos, tips.red, '#C62828', k, { part: 'wire' })
    drawProbeLead(ctx, geo.jacks.com, tips.black, '#16181A', k, { part: 'wire' })

    // 读数卡
    const rd = lay.R(14, 492, 338, 116)
    drawReadout(ctx, rd, k, m, dec, circ)

    // 表笔柄 / 金属尖压在最上层
    drawProbeLead(ctx, geo.jacks.pos, tips.red, '#C62828', k, { part: 'body', snap: !!s.probes.red.target })
    drawProbeLead(ctx, geo.jacks.com, tips.black, '#16181A', k, { part: 'body', snap: !!s.probes.black.target })

    // 拖拽中的提示
    if (s.drag && s.drag.type === 'tip') {
      T(ctx, '松手落在接线柱上即接通（同一元件两柱测电阻/电压）', tips.red.x + 16 * k, tips.red.y - 18 * k, {
        size: Math.round(9 * k), color: '#1565C0', bold: true,
      })
    }

    // 交互热区：表笔优先
    for (const which of ['red', 'black']) {
      R._hits.unshift({
        x: tips[which].x - 22 * k, y: tips[which].y - 22 * k, w: 44 * k, h: 44 * k,
        cursor: 'grab',
        onClick: () => { s.drag = { type: 'tip', which } },
      })
    }
    R._hits.push(
      { ...bg.switchHit, onClick: () => { s.switchClosed = !s.switchClosed; forceUpdate((n) => n + 1) }, cursor: 'pointer' },
      { ...bg.jumperHit, onClick: () => { s.jumperClosed = !s.jumperClosed; forceUpdate((n) => n + 1) }, cursor: 'pointer' },
    )
    addKnobHits(R, geo, (id) => setRange(id, 2))
    addTrimHits(R, geo, k)

    // 任务判定
    const done = evaluateTasks(m)
    let newly = 0
    for (const def of TASK_DEFS) {
      if (!s.tasks[def.id] && done[def.id]) {
        s.tasks[def.id] = true
        newly += 1
      }
    }
    if (newly) setTimeout(() => forceUpdate((n) => n + 1), 0)

    // 右侧任务卡
    if (lay.panel) {
      const out = drawKnowledgeCard(ctx, lay.panel, buildTaskSections(m, dec, done), {
        title: '🔧 动手任务',
        scroll: s.cardScroll,
        tip: (c2, tx, ty) => {
          c2.fillStyle = '#B08954'
          c2.font = '11.5px "Microsoft YaHei", sans-serif'
          c2.textAlign = 'left'
          c2.textBaseline = 'middle'
          c2.fillText(`${rangeTitle(RANGE_BY_ID[s.range2])} · ${dec.actual}`, tx, ty + 10)
        },
      })
      R._cardBox = out ? { x: lay.panel.x, y: lay.panel.y + 2, w: lay.panel.w, h: out.cardH, maxScroll: out.maxScroll, scroll: out.scroll } : null
    }
  }

  function drawReadout(ctx, r, k, m, dec, circ) {
    const s = S.current
    softCard(ctx, r.x, r.y, r.w, r.h, '#FFFFFF', '#DFE7EC')
    T(ctx, '指针读数', r.x + 14 * k, r.y + 18 * k, { size: Math.round(10.5 * k), bold: true, color: '#25313A' })
    chip(ctx, r.x + 74 * k, r.y + 6 * k, r.w - 88 * k, 24 * k, rangeTitle(RANGE_BY_ID[s.range2]), '#1565C0', k)

    const big = r.y + 58 * k
    const isOff = !m.range || m.range.kind === 'off'
    T(ctx, dec.row, r.x + 14 * k, big - 16 * k, { size: Math.round(8.8 * k), color: '#8A959C' })
    const rowTxt = isOff ? '—'
      : dec.rowValue === Infinity ? '∞' : dec.rowValue.toFixed(1)
    T(ctx, rowTxt, r.x + 14 * k, big + 10 * k, { size: Math.round(26 * k), color: '#B3261E', bold: true, mono: true })
    if (!isOff) {
      T(ctx, m.range.kind === 'ohm' ? `× ${m.range.label}` : '换算', r.x + 96 * k, big + 6 * k, {
        size: Math.round(9.5 * k), color: '#6B7A83',
      })
      T(ctx, '=', r.x + 140 * k, big + 8 * k, { size: Math.round(15 * k), color: '#6B7A83' })
      T(ctx, dec.actual, r.x + 156 * k, big + 10 * k, {
        size: Math.round(18 * k), color: '#15803D', bold: true, mono: true,
      })
    }
    T(ctx, isOff ? '表针不动：先旋到要用的档位' : dec.note, r.x + 14 * k, r.y + r.h - 28 * k, {
      size: Math.round(8.8 * k), color: '#4B5A66',
    })

    const msg = m.warn || (isOff ? '' : m.hint)
    if (msg) {
      T(ctx, (m.warn ? '⚠ ' : '· ') + msg, r.x + 14 * k, r.y + r.h - 13 * k, {
        size: Math.round(8.8 * k), color: m.warn ? '#C62828' : '#6B7A83', bold: !!m.warn,
      })
    }
  }

  function addTrimHits(R, geo, k) {
    const s = S.current
    // 机械调零螺丝：可拖可点；拖 1px ≈ 0.3°，点一下 ≈ 3°，上下两个方向都能调
    R._hits.push({
      x: geo.mech.x - 18 * k, y: geo.mech.y - 18 * k, w: 36 * k, h: 36 * k,
      cursor: 'ns-resize',
      onClick: () => { s.mech = clamp(s.mech - 0.03, -0.09, 0.09) },
      onDrag: (x, y, dy) => { s.mech = clamp(s.mech - (dy || 0) / (300 * k), -0.09, 0.09) },
    })
    // Ω ADJ：上下拖约 100px 走完全行程（原来 220px 太钝），点一下也能微调
    const zr = geo.zeroKnob.r * 1.12
    R._hits.push({
      x: geo.zeroKnob.x - zr, y: geo.zeroKnob.y - zr, w: zr * 2, h: zr * 2,
      cursor: 'ns-resize',
      onClick: () => { s.zeroAdj = clamp(s.zeroAdj + 0.025, 0, 1) },
      onDrag: (x, y, dy) => { s.zeroAdj = clamp(s.zeroAdj + (dy || 0) / (100 * k), 0, 1) },
    })
  }

  function addKnobHits(R, geo, onPick) {
    R._hits.push({
      x: geo.knob.x - geo.knob.r * 2.0, y: geo.knob.y - geo.knob.r * 2.0,
      w: geo.knob.r * 4.0, h: geo.knob.r * 4.0,
      cursor: 'pointer',
      pick: (x, y) => {
        const dx = x - geo.knob.x
        const dy = y - geo.knob.y
        const rad = Math.hypot(dx, dy)
        // 只接受「旋钮外沿 ↔ 档位环外弧」这一圈，点表头黑带、面板空白都不切档
        const rOut = (geo.ringR || geo.knob.r * 1.44) * 1.08
        if (rad < geo.knob.r * 0.95 || rad > rOut) return null
        const ang = Math.atan2(dx, -dy) * 180 / Math.PI
        let best = null
        let bestD = 99
        for (const r of MM_RANGES) {
          const dd = Math.abs(((ang - r.angle + 540) % 360) - 180)
          if (dd < bestD) { bestD = dd; best = r.id }
        }
        return bestD <= 7.5 ? best : null
      },
      onPick,
    })
  }

  /* ================================================================
   *  知识卡内容
   * ================================================================ */
  function buildLearnSections() {
    return [
      {
        t: '这表能干什么', c: '#E0761F',
        items: [
          [['一只表包办 '], ['电压、电流、电阻、二极管', '#C2410C', 1], ['，靠选择开关换功能和量程。']],
          [['表头是一只 '], ['磁电式微安表', '#C2410C', 1], ['，满偏电流只有几十 μA，靠内部电阻分流/分压扩量程。']],
        ],
      },
      {
        t: '刻度怎么分工', c: '#1E6B3B',
        items: [
          [['Ω 刻度（上）：左 ∞ 右 0，'], ['不均匀', '#1E6B3B', 1], ['；读出数乘倍率才是电阻。']],
          [['第二排印了两套数 '], ['0–250 与 0–50', '#A8281F', 1], ['，直流 V 和 mA 共用，按量程选一套读。']],
          [['第三排 '], ['0–10', '#8A3229', 1], [' 只配交流 10 V 档，可当关机位；dB、hFE 附加刻度不用。']],
          [['表盘正中的 Ω 读数 '], ['15', '#1E6B3B', 1], [' 就是 ×1 档的内阻；×10 档中值变 150 Ω，所以换档必须重新调零。']],
        ],
      },
      {
        t: '选择开关', c: '#1565C0',
        items: [
          [['左上 '], ['DCV', '#A8281F', 1], [' 七档：0.25 / 1 / 2.5 / 10 / 50 / 250 / 500 V。']],
          [['右上 '], ['ACV', '#A8281F', 1], [' 四档：10 / 50 / 250 / 500 V。']],
          [['右侧 '], ['Ω', '#1E6B3B', 1], [' 五档：×1 / ×10 / ×100 / ×1k / ×10k。']],
          [['下方 '], ['DCmA', '#A8281F', 1], ['：500 / 50 / 5 / 0.5 mA；另设 10 A 专用孔。']],
          [['收表一定旋到 '], ['OFF 或交流最高档', '#C2410C', 1], ['，防下次误测烧表。']],
        ],
      },
      {
        t: '两次调零，别混', c: '#C98A12',
        items: [
          [['机械调零', '#C2410C', 1], ['：测前指针不在左端 0，拧表盘下方螺丝；一次实验只做一次。']],
          [['欧姆调零', '#C2410C', 1], ['：Ω 档 '], ['每换一次倍率都要重做', '#DC2626', 1], ['——短接表笔转 Ω ADJ 到 0 Ω（内部电池旧了电动势会降）。']],
        ],
      },
      {
        t: '表笔与电流方向', c: '#15803D',
        items: [
          [['红笔插 '], ['＋', '#C62828', 1], ['、黑笔插 '], ['COM', '#25313A', 1], ['；测直流时电流从红笔流入。']],
          [['Ω 档内部电池的正极接 '], ['黑表笔', '#C62828', 1], ['，所以黑笔接二极管 ＋ 端才导通。']],
          [['测电压 '], ['并联', '#1565C0', 1], ['、测电流 '], ['串联', '#1565C0', 1], ['；测电阻要 '], ['先断电', '#DC2626', 1], [' 并拆下来单独测。']],
        ],
      },
      {
        t: '读数三步', c: '#C2410C',
        items: [
          [['① 看档位 → ② 找该读哪排 → ③ 读格 × 倍率；指针落在 '], ['中段', '#C2410C', 1], [' 最准。']],
          [['Ω 档读数 '], ['不估读', '#1E6B3B', 1], ['，×1k 档读 12 就是 12 kΩ。']],
        ],
      },

    ]
  }

  function buildTaskSections(m, dec, done) {
    const s = S.current
    const items = TASK_DEFS.map((d) => {
      const ok = done[d.id]
      return [[ok ? '✓ ' : '○ ', ok ? '#15803D' : '#B08954', 1], [d.t, ok ? '#15803D' : '#5A4636', ok]]
    })
    const next = TASK_DEFS.find((d) => !done[d.id])
    return [
      {
        t: `任务进度 ${TASK_DEFS.filter((d) => done[d.id]).length}/${TASK_DEFS.length}`, c: '#E0761F',
        items,
      },
      {
        t: '现在该做什么', c: '#1565C0',
        items: next
          ? [[[`${next.t}`, '#1565C0', 1]], [[next.d]]]
          : [[['全部完成：可以把档位旋到 OFF，整理器材。', '#15803D', 1]]],
      },
      {
        t: '当前读数', c: '#1E6B3B',
        items: [
          [[`档位：${rangeTitle(RANGE_BY_ID[s.range2])}`]],
          [[`指针：${dec.rowValue === Infinity ? '∞' : dec.rowValue.toFixed(1)}（${dec.row}）`]],
          [[`实际：${dec.actual}`, '#15803D', 1]],
          [[dec.note]],
        ],
      },
      {
        t: '容易错的点', c: '#DC2626',
        items: [
          [['换倍率后忘了 '], ['重新欧姆调零', '#DC2626', 1], ['，读数会整体偏。']],
          [['二极管：黑笔接 ＋ 才导通，反接是 ∞，不是坏了。']],
          [['电流档并在灯泡两端会把电源短路，先打开断口再串表。']],
          [['测完不归 OFF，下次可能直接拿电阻档去测 220 V。']],
        ],
      },
    ]
  }

  /* ================================================================
   *  交互
   * ================================================================ */
  const setRange = useCallback((id, which) => {
    const s = S.current
    if (which === 1) s.range1 = id
    else s.range2 = id
    forceUpdate((n) => n + 1)
  }, [])

  const pickRangeAt = useCallback((x, y, which) => {
    const cv = canvasRef.current
    const geo = cv && cv._geo
    if (!geo) return false
    const k = cv._R ? 1 : 1
    void k
    const dx = x - geo.knob.x
    const dy = y - geo.knob.y
    const rad = Math.hypot(dx, dy)
    const rOut = (geo.ringR || geo.knob.r * 1.44) * 1.08
    if (rad < geo.knob.r * 0.95 || rad > rOut) return false
    const ang = Math.atan2(dx, -dy) * 180 / Math.PI
    let best = null
    let bestD = 99
    for (const r of MM_RANGES) {
      const dd = Math.abs(((ang - r.angle + 540) % 360) - 180)
      if (dd < bestD) { bestD = dd; best = r.id }
    }
    if (bestD > 7.5) return false
    setRange(best, which)
    return true
  }, [setRange])

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
        if (a.pick && a.onPick) {
          const id = a.pick(x, y)
          if (id) { a.onPick(id); return }
          continue
        }
        if (a.onDrag) {
          s.drag = { type: 'dragArea', area: a, y0: y, x0: x, moved: false }
          return
        }
        a.onClick?.(x, y)
        return
      }
    }
    // 兜底：档位环
    if (S.current.tab === 1) pickRangeAt(x, y, 1)
    else pickRangeAt(x, y, 2)
  }, [pickRangeAt])

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
      if (s.drag.type === 'tip') {
        const which = s.drag.which
        s.probes[which].free = { x, y }
        s.probes[which].target = null
      } else if (s.drag.type === 'dragArea') {
        const a = s.drag.area
        if (Math.abs(x - (s.drag.x0 ?? x)) > 1.5 || Math.abs(y - s.drag.y0) > 1.5) s.drag.moved = true
        a.onDrag(x, y, y - s.drag.y0)
        s.drag.y0 = y
      }
      return
    }
    let hit = null
    for (const a of cv._hits) {
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { hit = a; break }
    }
    cv.style.cursor = hit ? (hit.cursor || (hit.onDrag ? 'ns-resize' : 'pointer')) : 'default'
  }, [])

  const handleMouseUp = useCallback(() => {
    const s = S.current
    const cv = canvasRef.current
    if (s.drag && s.drag.type === 'dragArea' && !s.drag.moved && s.drag.area.onClick) s.drag.area.onClick()
    if (s.drag && s.drag.type === 'tip') {
      const which = s.drag.which
      const p = s.probes[which].free
      if (p) {
        let best = null
        let bestD = 30
        for (const [id, t] of Object.entries(cv._targets || {})) {
          const dd = Math.hypot(p.x - t.x, p.y - t.y)
          if (dd < bestD) { bestD = dd; best = id }
        }
        if (best) {
          s.probes[which].target = best
          s.probes[which].free = null
        } else {
          s.probes[which].target = null
          s.probes[which].free = null
        }
      }
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
  const rangeNow = tab === 1 ? s.range1 : s.range2
  const doneCount = TASK_DEFS.filter((d) => s.tasks[d.id]).length

  const toolbar = (
    <>
      <span style={{ fontSize: 12, color: '#555' }}>档位</span>
      <select
        value={rangeNow}
        onChange={(ev) => setRange(ev.target.value, tab === 1 ? 1 : 2)}
        style={{ fontSize: 12, padding: '3px 4px', borderRadius: 6, border: '1px solid #c9d6e2', maxWidth: 130 }}
      >
        {['dcv', 'acv', 'ohm', 'dca', 'off'].map((g) => (
          <optgroup key={g} label={{ dcv: '直流电压 V', acv: '交流电压 V', ohm: '电阻 Ω', dca: '直流电流 mA/A', off: '关机' }[g]}>
            {MM_RANGES.filter((r) => r.group === g).map((r) => (
              <option key={r.id} value={r.id}>{rangeTitle(r)}</option>
            ))}
          </optgroup>
        ))}
      </select>
      {tab === 1 && DEMO_OBJECTS.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => { s.demo = o.id; s.range1 = o.range; forceUpdate((n) => n + 1) }}
          style={{
            fontSize: 12, padding: '4px 9px', borderRadius: 8, cursor: 'pointer',
            border: `1px solid ${s.demo === o.id ? '#4A90D9' : '#c9d6e2'}`,
            background: s.demo === o.id ? '#4A90D9' : '#fff',
            color: s.demo === o.id ? '#fff' : '#33526e',
          }}
        >
          {o.name}
        </button>
      ))}
      {tab === 2 && (
        <>
          <button type="button" onClick={() => { s.mech = clamp(s.mech - 0.03, -0.09, 0.09); forceUpdate((n) => n + 1) }}
            style={{ fontSize: 12, padding: '4px 9px', borderRadius: 8, border: '1px solid #c9d6e2', background: '#fff', cursor: 'pointer' }}>
            🔧 机械调零
          </button>
          <button type="button" onClick={() => { s.probes.red = { target: 'short', free: null }; s.probes.black = { target: 'short', free: null }; forceUpdate((n) => n + 1) }}
            style={{ fontSize: 12, padding: '4px 9px', borderRadius: 8, border: '1px solid #c9d6e2', background: '#fff', cursor: 'pointer' }}>
            🔗 短接表笔
          </button>
          <button type="button" onClick={() => { s.probes.red = { target: null, free: null }; s.probes.black = { target: null, free: null }; forceUpdate((n) => n + 1) }}
            style={{ fontSize: 12, padding: '4px 9px', borderRadius: 8, border: '1px solid #c9d6e2', background: '#fff', cursor: 'pointer' }}>
            ↩ 表笔归位
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
      title="⚡ 练习使用多用电表"
      tab={tab}
      onTabChange={(t) => {
        S.current.tab = t
        S.current.drag = null
        S.current.cardDrag = null
        // 换页时旋钮直接落在该页当前档位，不要从上一页的档位一路扫过去（会看着像乱跳）
        S.current.knob = RANGE_BY_ID[t === 1 ? S.current.range1 : S.current.range2].angle
        setTab(t)
      }}
      tab1Label="📖 认识表盘"
      tab2Label="🔧 自己动手"
      onReset={() => {
        S.current = {
          ...S.current, tab,
          range2: 'off', mech: 0.055, zeroAdj: 0.22,
          knob: RANGE_BY_ID.off.angle, needle: 0,
          probes: { red: { target: null, free: null }, black: { target: null, free: null } },
          switchClosed: false, jumperClosed: true, tasks: {}, seen: {}, cardScroll: 0,
        }
        forceUpdate((n) => n + 1)
      }}
      toolbarExtra={toolbar}
      desc={(
        <>
          <b>练习使用多用电表</b>
          <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
            机械调零 → 欧姆调零 → 测电阻（换档重调）→ 二极管正反 → 测灯泡 U/I → 归位 OFF
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
            ? '认清表盘三条刻度、选择开关和两次调零，知道每档该读哪一排、读数怎么乘倍率。'
            : '按真实顺序把八步做完：机械调零、欧姆调零、测两个定值电阻、判别二极管、测灯泡电压电流，最后归位 OFF。'}
          steps={tab === 1 ? [
            '① 点四类被测对象，看指针落在哪条刻度',
            '② 旋钮换档：看同一对象换档后指针和读数怎么变',
            '③ 拧机械调零螺丝，让指针回左端 0',
            '④ 拖 Ω ADJ：短接时看指针能否压到 0 Ω',
          ] : [
            '先点「机械调零」把指针压到左端 0',
            'Ω×1 → 点「短接表笔」→ 拖 Ω ADJ 到 0 Ω（指针满偏）',
            '两笔拖到 R₁ 两柱读 12；换 ×1k 重新调零测 R₂ 读 12 kΩ',
            'Ω×1k 测二极管：黑笔接 ＋ 读数小，反接 ∞',
            '直流 10 V 档红笔接高电位测灯泡电压；点断口铜排，500 mA 档串进去测电流',
            '做完旋到 OFF，表笔回笔架',
          ]}
          hint={tab === 1
            ? '口诀：Ω 看上排乘倍率；直流 V/A 看第二排（0–250 或 0–50）；交流 10 V 看第三排。'
            : 'Ω 档内部电池正极接黑表笔：黑接二极管 ＋ 导通。换倍率必重调零；测电流先打开断口，不能并在灯泡上。'}
        />
      </div>
    </SceneShell>
  )
}
