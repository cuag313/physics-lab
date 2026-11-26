import { useEffect, useRef, useState } from 'react'
import SceneShell from '../ui/SceneShell'
import { deflectionSolve, selectorPath, accelSolve, speedFromAccel, E_CHARGE, M_ELECTRON } from '../physics/chargedDeflection'
import { eventToCanvas } from '../utils/pointerPos'
import { strokeBezierWire } from '../ui/circuitKit'
import { symSwitch, symBattery } from '../render/symbols'

/**
 * ElectricFieldDeflectionScene — 带电粒子在电场中的偏转（示波管）
 *
 * ① 单束偏转：电子枪 → 平行偏转板 → 荧光屏。板内 y=½at²，出板后沿出射方向直线
 *                （不能再把抛物线画到屏上）；参数 Ua / U / L / d 全可调，撞板会停住。
 * ② 多电压对比：同一支管上叠 5 条不同 U 的轨迹，屏上落点与 U 成正比。
 * ③ 速度选择器：E⊥B，只有 v=E/B 直穿，快的向一侧弯、慢的向另一侧弯。
 */

const FONT = '"PingFang SC","Microsoft YaHei",system-ui,-apple-system,sans-serif'
const C = {
  bg: '#EDF2F5', card: '#FFFFFF', line: '#DFE8EC', teal: '#12A69B', tealDark: '#0B7F77',
  pos: '#DE453F', neg: '#2C6FAF', gold: '#E2A33C', ink: '#22313A', sub: '#5D7079', faint: '#93A5AD',
}

const DEFAULTS = { Ua: 4.0, U: 240, L: 60, d: 14, B: 0.46 }
const MODES = [
  { key: 1, label: '① 单束偏转' },
  { key: 2, label: '② 多电压对比' },
  { key: 3, label: '③ 速度选择器' },
  { key: 4, label: '④ 加速/减速' },
]
// 多电压对比用的 5 档偏转电压
const U_SET = [-300, -150, 0, 150, 300]
const U_COLORS = ['#1565C0', '#64B5F6', '#9AA7AE', '#FFB74D', '#E53935']

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
function setFont(ctx, size, weight = '') { ctx.font = `${weight ? weight + ' ' : ''}${size}px ${FONT}` }
function fitFont(ctx, text, maxW, size, weight = '') {
  let fs = size
  setFont(ctx, fs, weight)
  while (ctx.measureText(text).width > maxW && fs > 6.5) { fs -= 0.5; setFont(ctx, fs, weight) }
  return fs
}
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' }
function sup(n) { return String(n).split('').map((ch) => SUP[ch] || ch).join('') }
function sci(v, d = 2) {
  if (!Number.isFinite(v)) return '∞'
  if (Math.abs(v) < 1e-12) return '0'
  const sg = v < 0 ? '−' : ''
  const a = Math.abs(v)
  const e = Math.floor(Math.log10(a))
  const m = a / 10 ** e
  return `${sg}${m.toFixed(d)}×10${sup(e)}`
}
const mm1 = (v) => `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)} mm`
const mm2 = (v) => `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)} mm`

export default function ElectricFieldDeflectionScene() {
  const canvasRef = useRef(null)
  const [, forceUpdate] = useState(0) // 仅用于「查看结论」开关与 Tab 切换
  const [, setTab] = useState(1)
  const [conclusionOpen, setConclusionOpen] = useState(false)

  const S = useRef({
    tab: 1,
    mode: 1,
    Ua: DEFAULTS.Ua, U: DEFAULTS.U, L: DEFAULTS.L, d: DEFAULTS.d, D: 60, B: DEFAULTS.B,
    playing: true, phase: 0, toast: null, dragSlider: null,
    // 自己动手：预置一套「电子枪—加速/偏转极板—荧光屏」，可改各板电压、板长板距、磁场与粒子种类
    nextId: 1,
    diy: {
      // kind: 'deflector' 偏转类平抛 | 'accelerator' 直线加速/减速 | 'selector' 速度选择器(E⊥B)
      kind: 'deflector',
      Ua: DEFAULTS.Ua, U: DEFAULTS.U, L: DEFAULTS.L, d: DEFAULTS.d, D: 60, B: DEFAULTS.B,
      particle: 'electron',           // electron | proton
      comps: [], wires: [], sel: null, hold: null, mx: 0, my: 0,
      connecting: null, drag: null, dragOff: null, wireColor: '#F44336', t: 0,
    },
  })

  function say(text) { S.current.toast = { text, until: Date.now() + 2400 } }

  function reset() {
    const s = S.current
    Object.assign(s, { mode: s.mode, ...DEFAULTS, D: 60, phase: 0, playing: true })
    const dy = s.diy
    Object.assign(dy, { Ua: DEFAULTS.Ua, U: DEFAULTS.U, L: DEFAULTS.L, d: DEFAULTS.d, D: 60, B: DEFAULTS.B, t: 0 })
    say('参数已复位')
  }

  // ── 物理量 ────────────────────────────────────────────────
  function solve(s) {
    return deflectionSolve({ Ua: s.Ua * 1000, U: s.U, L: s.L / 1000, d: s.d / 1000, D: s.D / 1000 })
  }
  function selectorBeams(s) {
    const B = s.B * 1e-3
    const v0 = solve(s).v0
    const base = { U: s.U, d: s.d / 1000, L: s.L / 1000, D: s.D / 1000, B }
    return [0.6, 1, 1.4].map((f) => ({ f, path: selectorPath({ ...base, v0: v0 * f }) }))
  }

  // ── 画布布局 ─────────────────────────────────────────────
  function layout(W, H) {
    const PAD = 10
    const palW = clamp(W * 0.152, 168, 200)
    const top = 50
    const stage = { x: PAD, y: top, w: W - palW - PAD * 3, h: H - top - 14 }
    const pal = { x: W - palW - PAD, y: top, w: palW, h: H - top - 14 }
    return { W, H, stage, pal, palW }
  }

  function tube(s, A) {
    const guideW = s.tab === 1 ? Math.min(224, A.stage.w * 0.3) : 0
    const availW = A.stage.w - guideW - 20
    const sc = Math.min((availW - 40) / 176, (A.stage.h - 120) / 70)
    const cy = A.stage.y + A.stage.h * 0.5
    const gx = A.stage.x + guideW + 12
    const gunX0 = gx + 0.55 * 13 * sc + 6
    const originX = gunX0 + 26 * sc
    const plateX0 = originX + 12 * sc
    const plateX1 = plateX0 + s.L * sc
    const screenX = plateX1 + s.D * sc
    return { sc, cy, gunX0, originX, plateX0, plateX1, screenX, halfGap: (s.d / 2) * sc }
  }

  // ── 画：玻璃管壳（细颈在左、泡在右） ───────────────────
  function glassPath(ctx, xL, xR, cy, halfL, halfR, xNeck) {
    const xn = xNeck === undefined ? xL + (xR - xL) * 0.45 : xNeck
    const xc = xL + halfL * 0.45              // 左封头圆心，保证半圆落在画布内
    ctx.beginPath()
    ctx.moveTo(xc, cy - halfL)
    ctx.lineTo(xn, cy - halfL)
    ctx.bezierCurveTo(xn + (xR - xn) * 0.55, cy - halfL, xR - (xR - xn) * 0.3, cy - halfR * 1.08, xR, cy - halfR * 1.06)
    ctx.quadraticCurveTo(xR + halfR * 0.32, cy, xR, cy + halfR * 1.06)
    ctx.bezierCurveTo(xR - (xR - xn) * 0.3, cy + halfR * 1.08, xn + (xR - xn) * 0.55, cy + halfL, xn, cy + halfL)
    ctx.lineTo(xc, cy + halfL)
    ctx.arc(xc, cy, halfL, Math.PI / 2, -Math.PI / 2, true)
  }

  function drawGlass(ctx, T) {
    const halfL = 13 * T.sc, halfR = 23 * T.sc
    const g = ctx.createLinearGradient(0, T.cy - halfR, 0, T.cy + halfR)
    g.addColorStop(0, 'rgba(238,249,252,0.95)')
    g.addColorStop(0.45, 'rgba(223,241,247,0.72)')
    g.addColorStop(1, 'rgba(205,231,240,0.85)')
    glassPath(ctx, T.gunX0 - 8, T.screenX + 7, T.cy, halfL, halfR, T.plateX0 - 10 * T.sc)
    ctx.fillStyle = g
    ctx.fill()
    ctx.strokeStyle = '#A8C3CE'
    ctx.lineWidth = 1.4
    ctx.stroke()
    // 顶部高光
    ctx.beginPath()
    glassPath(ctx, T.gunX0 - 3, T.screenX + 3, T.cy, 12 * T.sc, 22 * T.sc, T.plateX0 - 14 * T.sc)
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 2
    ctx.setLineDash([])
    ctx.stroke()
  }

  function drawGun(ctx, T) {
    const sc = T.sc
    const x0 = T.gunX0 + 2 * sc
    // 阴极罩
    ctx.beginPath(); ctx.roundRect(x0, T.cy - 5 * sc, 8 * sc, 10 * sc, 3 * sc)
    const mg = ctx.createLinearGradient(0, T.cy - 5 * sc, 0, T.cy + 5 * sc)
    mg.addColorStop(0, '#8C9AA2'); mg.addColorStop(0.45, '#5D6E77'); mg.addColorStop(1, '#37454D')
    ctx.fillStyle = mg; ctx.fill()
    ctx.strokeStyle = '#4A5A62'; ctx.lineWidth = 1; ctx.stroke()
    // 灯丝
    ctx.strokeStyle = '#FF8A65'; ctx.lineWidth = 1.4
    ctx.beginPath()
    for (let i = 0; i <= 6; i++) {
      const x = x0 + 1.2 * sc + i * 0.9 * sc
      const y = T.cy + (i % 2 ? -1.6 : 1.6) * sc
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.stroke()
    // 阳极（两个圆筒/环）
    for (let k = 0; k < 2; k++) {
      const x = x0 + (9 + k * 5) * sc
      ctx.beginPath(); ctx.roundRect(x, T.cy - 3.2 * sc, 4 * sc, 6.4 * sc, 2 * sc)
      ctx.fillStyle = k ? '#9BA9B1' : '#B7C3C9'
      ctx.fill()
      ctx.strokeStyle = '#7C8B93'; ctx.lineWidth = 1; ctx.stroke()
      ctx.beginPath(); ctx.arc(x + 4 * sc, T.cy, 1.05 * sc, 0, Math.PI * 2)
      ctx.fillStyle = '#22313A'; ctx.fill()
    }
    setFont(ctx, 7.8); ctx.fillStyle = C.faint; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('电子枪：灯丝加热 → 阴极发射 → 阳极 +Ua 加速', x0, T.cy + 13.6 * sc)
    // 出射电子束（到偏转板）
    ctx.strokeStyle = 'rgba(120,190,225,0.85)'
    ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.moveTo(T.originX, T.cy); ctx.lineTo(T.plateX0 + 6 * sc, T.cy); ctx.stroke()
  }

  function drawPlates(ctx, T, s, U) {
    const sc = T.sc
    const th = 1.6 * sc
    const pg = ctx.createLinearGradient(0, 0, 0, th)
    pg.addColorStop(0, '#E7EDF0'); pg.addColorStop(0.5, '#B9C6CD'); pg.addColorStop(1, '#8A9AA3')
    for (const side of [-1, 1]) {
      const y = T.cy + side * T.halfGap
      ctx.beginPath(); ctx.roundRect(T.plateX0, y - th / 2, T.plateX1 - T.plateX0, th, 2)
      ctx.fillStyle = pg; ctx.fill()
      ctx.strokeStyle = '#7E8E97'; ctx.lineWidth = 1; ctx.stroke()
    }
    // 场区淡蓝 + 电场线箭头（+ → −）
    ctx.fillStyle = 'rgba(70,150,235,0.06)'
    ctx.fillRect(T.plateX0, T.cy - T.halfGap, T.plateX1 - T.plateX0, T.halfGap * 2)
    const up = U >= 0                                  // U>0：上板为正，E 向下
    const dir = up ? 1 : -1
    const n = 8
    for (let i = 0; i < n; i++) {
      const x = T.plateX0 + ((i + 0.5) / n) * (T.plateX1 - T.plateX0)
      const yA = T.cy - dir * (T.halfGap - 3)
      const yB = T.cy + dir * (T.halfGap - 5)
      ctx.strokeStyle = 'rgba(37,110,190,0.55)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(x, yA); ctx.lineTo(x, yB); ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x - 2.6, yB - dir * 4); ctx.lineTo(x, yB); ctx.lineTo(x + 2.6, yB - dir * 4)
      ctx.stroke()
    }
    // 极性（画在板内侧左端）
    setFont(ctx, 11, 'bold')
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillStyle = up ? C.pos : C.neg
    ctx.fillText(up ? '+' : '−', T.plateX0 + 4, T.cy - T.halfGap)
    ctx.fillStyle = up ? C.neg : C.pos
    ctx.fillText(up ? '−' : '+', T.plateX0 + 4, T.cy + T.halfGap)
    // 板名贴板端（左侧），E 标注靠右端，各占一行不打架
    setFont(ctx, 8.5); ctx.fillStyle = C.sub; ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    ctx.fillText(`上板 ${up ? '+' : '−'}`, T.plateX0 + 14, T.cy - T.halfGap - 13)
    ctx.fillText(`下板 ${up ? '−' : '+'}`, T.plateX0 + 14, T.cy + T.halfGap + 4)
    setFont(ctx, 8); ctx.fillStyle = 'rgba(37,110,190,0.9)'; ctx.textAlign = 'right'
    ctx.fillText(`E = U/d = ${(Math.abs(U) / (s.d / 1000) / 1000).toFixed(1)} kV/m`, T.plateX1 - 6, T.cy - T.halfGap - 24)
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'

    // 板距 d：两板之间的竖向双箭头 + 竖排文字
    const dx = T.plateX0 - 6 * T.sc
    ctx.strokeStyle = C.faint; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(dx, T.cy - T.halfGap + 4); ctx.lineTo(dx, T.cy + T.halfGap - 4); ctx.stroke()
    for (const [yy, d] of [[T.cy - T.halfGap + 4, 1], [T.cy + T.halfGap - 4, -1]]) {
      ctx.beginPath(); ctx.moveTo(dx - 3, yy); ctx.lineTo(dx + 3, yy); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(dx, yy); ctx.lineTo(dx - 2.2, yy + d * 4); ctx.moveTo(dx, yy); ctx.lineTo(dx + 2.2, yy + d * 4); ctx.stroke()
    }
    ctx.save()
    setFont(ctx, 8); ctx.fillStyle = C.faint; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'
    ctx.fillText(`d = ${s.d} mm`, dx - 4, T.cy - T.halfGap - 4)
    ctx.restore()
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  }

  // 尺寸标注：水平双向箭头
  function dimArrow(ctx, x0, x1, y, label, color = C.faint) {
    ctx.strokeStyle = color; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke()
    for (const [x, d] of [[x0, 1], [x1, -1]]) {
      ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + d * 4, y - 2.2); ctx.moveTo(x, y); ctx.lineTo(x + d * 4, y + 2.2); ctx.stroke()
    }
    setFont(ctx, 8); ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText(label, (x0 + x1) / 2, y - 4)
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  }

  function drawScreen(ctx, T, s, Ymm, color = '#2E7D32', spotLabel = '', noSpot = false) {
    const sc = T.sc
    const h = 22 * sc
    // 荧光屏
    const sg = ctx.createLinearGradient(0, T.cy - h, 0, T.cy + h)
    sg.addColorStop(0, '#E8F7EE'); sg.addColorStop(0.5, '#C9EFD9'); sg.addColorStop(1, '#A9E3C4')
    ctx.beginPath(); ctx.roundRect(T.screenX, T.cy - h, 2.6 * sc, 2 * h, 3)
    ctx.fillStyle = sg; ctx.fill()
    ctx.strokeStyle = '#8FC7AA'; ctx.lineWidth = 1; ctx.stroke()
    // 刻度
    setFont(ctx, 7.5); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
    for (let mm = -20; mm <= 20; mm += 5) {
      const y = T.cy - mm * sc
      ctx.strokeStyle = mm === 0 ? 'rgba(46,125,50,0.5)' : 'rgba(46,125,50,0.22)'
      ctx.beginPath(); ctx.moveTo(T.screenX, y); ctx.lineTo(T.screenX + 2.6 * sc, y); ctx.stroke()
      ctx.fillStyle = 'rgba(60,120,80,0.75)'
      ctx.fillText(`${mm}`, T.screenX + 7.5 * sc, y)
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    // 落点（超出屏就贴边并标注）
    const yy = clamp(Ymm, -22, 22)
    const py = T.cy - yy * sc
    const out = Math.abs(Ymm) > 22
    if (!noSpot) {
      const glow = ctx.createRadialGradient(T.screenX + 1.3 * sc, py, 0, T.screenX + 1.3 * sc, py, 9)
      glow.addColorStop(0, 'rgba(255,255,255,0.95)')
      glow.addColorStop(0.25, color)
      glow.addColorStop(1, 'rgba(46,125,50,0)')
      ctx.beginPath(); ctx.arc(T.screenX + 1.3 * sc, py, 9, 0, Math.PI * 2)
      ctx.fillStyle = glow; ctx.fill()
    }
    if (out) {
      setFont(ctx, 8, 'bold'); ctx.fillStyle = C.pos
      ctx.fillText('超出屏幕', T.screenX - 30, py - 6)
    }
    if (spotLabel) {
      setFont(ctx, 8.5, 'bold'); ctx.fillStyle = C.ink
      ctx.textAlign = 'right'
      ctx.fillText(spotLabel, T.screenX - 6, py - 4)
      ctx.textAlign = 'left'
    }
  }

  // 电子点：沿折线走，phase 0..1 循环
  function drawBeamDots(ctx, pts, phase, color = '#2F6FB2', count = 7) {
    if (!pts || pts.length < 2) return
    const seg = []
    let total = 0
    for (let i = 1; i < pts.length; i++) {
      const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
      seg.push(l); total += l
    }
    if (total < 1) return
    for (let k = 0; k < count; k++) {
      let s = ((phase + k / count) % 1) * total
      for (let i = 0; i < seg.length; i++) {
        if (s <= seg[i]) {
          const u = seg[i] ? s / seg[i] : 0
          const x = pts[i].x + (pts[i + 1].x - pts[i].x) * u
          const y = pts[i].y + (pts[i + 1].y - pts[i].y) * u
          const lead = k === 0
          ctx.beginPath(); ctx.arc(x, y, lead ? 4.6 : 3.2, 0, Math.PI * 2)
          ctx.fillStyle = lead ? color : 'rgba(47,111,178,0.55)'
          ctx.fill()
          if (lead) {
            ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.2; ctx.stroke()
            ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2)
            ctx.fillStyle = 'rgba(120,190,235,0.18)'; ctx.fill()
          }
          setFont(ctx, 6.5, 'bold'); ctx.fillStyle = 'rgba(255,255,255,0.95)'
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          if (lead) ctx.fillText('−', x, y + 0.5)
          ctx.textAlign = 'left'; ctx.textBaseline = 'top'
          break
        }
        s -= seg[i]
      }
    }
  }

  // 世界 mm → 画布像素
  const P = (T, xmm, ymm) => ({ x: T.plateX0 + xmm * T.sc, y: T.cy - ymm * T.sc })

  function pathMode1(s, sol, T) {
    const pts = []
    const hitU = sol.hit !== 'none' && sol.a !== 0
      ? Math.sqrt((s.d / 2000) / (0.5 * Math.abs(sol.a) * sol.t1 * sol.t1))
      : 1
    const uMax = sol.hit === 'none' ? 1 : Math.min(1, hitU)
    for (let i = 0; i <= 40; i++) {
      const u = (i / 40) * uMax
      const t = sol.t1 * u
      pts.push(P(T, sol.v0 * t * 1000, 0.5 * sol.a * t * t * 1000))
    }
    if (sol.hit === 'none' && sol.v0 > 0) {
      const yEnd = sol.y2
      pts.push(P(T, sol.Lmm + s.D, yEnd * 1000))
    }
    return pts
  }

  function drawTrajectory(ctx, pts, color, width = 2.2) {
    if (pts.length < 2) return
    ctx.strokeStyle = color; ctx.lineWidth = width + 4; ctx.globalAlpha = 0.18
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke()
    ctx.globalAlpha = 1
    ctx.strokeStyle = color; ctx.lineWidth = width
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke()
  }

  // 右上角公式小卡
  function drawFormula(ctx, A, s) {
    const w = 214, h = 48
    const x = A.stage.x + A.stage.w - w - 12, y = A.stage.y + 12
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8)
    ctx.fillStyle = '#FFFFFF'; ctx.fill()
    ctx.strokeStyle = '#D7E4EA'; ctx.lineWidth = 1; ctx.stroke()
    const fTitle = s.mode === 1 ? '板内类平抛' : s.mode === 2 ? '线性关系' : s.mode === 3 ? '速度选择条件' : '直线匀变速'
    setFont(ctx, 7.8, 'bold'); ctx.fillStyle = C.tealDark
    ctx.fillText(fTitle, x + 10, y + 7)
    setFont(ctx, 8.4); ctx.fillStyle = C.ink
    if (s.mode === 1) {
      ctx.fillText('y₁ = qUL²/(2mdv₀²)', x + 10, y + 22)
      ctx.fillText('Y屏 = y₁ + v_y·D/v₀', x + 10, y + 35)
    } else if (s.mode === 2) {
      ctx.fillText('Y ∝ U（Ua、L、d、D 不变）', x + 10, y + 22)
      ctx.fillText('U 反号 → 上下翻转', x + 10, y + 35)
    } else if (s.mode === 3) {
      ctx.fillText('v = E/B = U/(d·B)', x + 10, y + 22)
      ctx.fillText('E⊥B，垂直射入 → 直线', x + 10, y + 35)
    } else {
      ctx.fillText('qU = ½mv₁² − ½mv₀²', x + 10, y + 22)
      ctx.fillText('v₁² = v₀² + 2aL', x + 10, y + 35)
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  }

  // ── 场景 ① ─────────────────────────────────────────────
  function drawMode1(ctx, A, s) {
    const T = tube(s, A)
    const sol = solve(s)
    drawGlass(ctx, T)
    drawGun(ctx, T)
    drawPlates(ctx, T, s, s.U)
    // 中线参考
    ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(120,140,150,0.45)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(T.originX, T.cy); ctx.lineTo(T.screenX, T.cy); ctx.stroke()
    ctx.setLineDash([])
    // 轨迹
    const pts = pathMode1(s, sol, T)
    drawTrajectory(ctx, pts, '#F08A24', 2.4)
    if (sol.hit === 'none') drawBeamDots(ctx, pts, s.phase)
    if (sol.hit !== 'none' && pts.length > 1) {
      const p = pts[pts.length - 1]
      ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2); ctx.fillStyle = 'rgba(192,57,43,0.85)'; ctx.fill()
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.2; ctx.stroke()
    }
    // 屏
    drawScreen(ctx, T, s, sol.y2mm, sol.hit === 'none' ? '#2E7D32' : '#C0392B', sol.hit === 'none' ? `Y = ${mm1(sol.y2mm)}` : '')
    // 尺寸标注
    dimArrow(ctx, T.plateX0, T.plateX1, T.cy + T.halfGap + 16 * T.sc, `L = ${s.L} mm`)
    dimArrow(ctx, T.plateX1, T.screenX, T.cy + 30 * T.sc, `D = ${s.D} mm`)
    // d 的尺寸线在 drawPlates 里画，这里只补管壳/屏幕的小字
    setFont(ctx, 7.5); ctx.fillStyle = 'rgba(110,140,150,0.95)'
    ctx.textAlign = 'right'
    ctx.fillText('荧光屏（刻度单位 mm）', T.screenX + 2 * T.sc, T.cy - 26 * T.sc - 8)
    ctx.textAlign = 'left'
    // 出板速度角
    if (sol.hit === 'none' && Math.abs(sol.theta) > 0.02) {
      const ex = T.plateX1, ey = T.cy - sol.y1mm * T.sc
      setFont(ctx, 8, 'bold'); ctx.fillStyle = '#B4641A'
      ctx.fillText(`θ = ${(sol.theta * 180 / Math.PI).toFixed(1)}°`, ex + 6, ey - 16)
    }
    // 撞板提示
    if (sol.hit !== 'none') {
      setFont(ctx, 9, 'bold'); ctx.fillStyle = C.pos
      ctx.fillText(`电子打在${sol.hit === 'up' ? '上' : '下'}极板（${mm1(sol.y1mm)} > d/2）`, T.plateX0 + 10, T.cy - T.halfGap - 40)
    }
    // 标题
    setFont(ctx, 9, 'bold'); ctx.fillStyle = C.ink
    ctx.fillText('示波管：电子经 Ua 加速后垂直射入偏转板', A.stage.x + 8, A.stage.y + 8)
    drawFormula(ctx, A, s)
  }

  // ── 场景 ② ─────────────────────────────────────────────
  function drawMode2(ctx, A, s) {
    const T = tube(s, A)
    drawGlass(ctx, T)
    drawGun(ctx, T)
    drawPlates(ctx, T, s, 220)
    ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(120,140,150,0.4)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(T.originX, T.cy); ctx.lineTo(T.screenX, T.cy); ctx.stroke()
    ctx.setLineDash([])
    U_SET.forEach((U, i) => {
      const one = deflectionSolve({ Ua: s.Ua * 1000, U, L: s.L / 1000, d: s.d / 1000, D: s.D / 1000 })
      const pts = []
      const uMax = one.hit === 'none' ? 1 : Math.min(1, Math.sqrt((s.d / 2000) / Math.max(1e-12, 0.5 * Math.abs(one.a) * one.t1 * one.t1)))
      for (let k = 0; k <= 36; k++) {
        const u = (k / 36) * uMax
        const t = one.t1 * u
        pts.push(P(T, one.v0 * t * 1000, 0.5 * one.a * t * t * 1000))
      }
      if (one.hit === 'none' && one.v0 > 0) pts.push(P(T, one.Lmm + s.D, one.y2mm))
      drawTrajectory(ctx, pts, U_COLORS[i], 1.8)
      // 屏上落点小圆
      const y = clamp(one.y2mm, -22, 22)
      ctx.beginPath(); ctx.arc(T.screenX + 1.2 * T.sc, T.cy - y * T.sc, 3.2, 0, Math.PI * 2)
      ctx.fillStyle = U_COLORS[i]; ctx.fill()
      setFont(ctx, 7.5, 'bold'); ctx.fillStyle = U_COLORS[i]
      const ly = T.cy - y * T.sc
      ctx.textAlign = 'right'
      ctx.fillText(`${U > 0 ? '+' : ''}${U}`, T.screenX - 5, ly + (U > 0 ? -6 : 9))
      ctx.textAlign = 'left'
    })
    drawScreen(ctx, T, s, 0, 'rgba(46,125,50,0.0)', '', true)
    dimArrow(ctx, T.plateX0, T.plateX1, T.cy + T.halfGap + 16 * T.sc, `L = ${s.L} mm`)
    dimArrow(ctx, T.plateX1, T.screenX, T.cy + 30 * T.sc, `D = ${s.D} mm`)
    setFont(ctx, 9, 'bold'); ctx.fillStyle = C.ink
    ctx.fillText('同一支管、只改偏转电压 U：屏上落点与 U 成正比', A.stage.x + 8, A.stage.y + 8)
    drawFormula(ctx, A, s)
    // 图例
    setFont(ctx, 8); ctx.fillStyle = C.sub
    ctx.fillText('轨迹颜色：', T.plateX0, A.stage.y + 30)
    U_SET.forEach((U, i) => {
      const x = T.plateX0 + 46 + i * 62
      ctx.beginPath(); ctx.roundRect(x, A.stage.y + 27, 10, 8, 2)
      ctx.fillStyle = U_COLORS[i]; ctx.fill()
      setFont(ctx, 8, 'bold'); ctx.fillStyle = U_COLORS[i]
      ctx.fillText(`${U > 0 ? '+' : ''}${U} V`, x + 14, A.stage.y + 28)
    })
  }

  // ── 场景 ③ ─────────────────────────────────────────────
  function drawMode3(ctx, A, s) {
    const T = tube(s, A)
    const sol = solve(s)
    drawGlass(ctx, T)
    drawGun(ctx, T)
    drawPlates(ctx, T, s, s.U)
    // 磁场方向：垂直纸面向里 ⊗
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        const x = T.plateX0 + ((i + 0.5) / 6) * (T.plateX1 - T.plateX0)
        const y = T.cy + (j - 1) * T.halfGap * 0.62
        ctx.beginPath(); ctx.arc(x, y, 4.2, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(41,98,160,0.55)'; ctx.lineWidth = 1; ctx.stroke()
        ctx.beginPath(); ctx.moveTo(x - 2.4, y); ctx.lineTo(x + 2.4, y)
        ctx.moveTo(x, y - 2.4); ctx.lineTo(x, y + 2.4); ctx.stroke()
      }
    }
    setFont(ctx, 8); ctx.fillStyle = 'rgba(41,98,160,0.9)'
    ctx.fillText(`B = ${s.B.toFixed(2)} mT（垂直纸面向里）`, T.plateX0 + 8, T.cy - T.halfGap - 24)

    const B = s.B * 1e-3
    const vMatch = (s.U / (s.d / 1000)) / Math.max(B, 1e-12)
    const beams = selectorBeams(s)
    const styles = [
      { f: 0.6, color: '#2C6FAF', tag: 'v < E/B 向上弯' },
      { f: 1.0, color: '#2E7D32', tag: 'v = E/B 直穿' },
      { f: 1.4, color: '#DE453F', tag: 'v > E/B 向下弯' },
    ]
    beams.forEach((b, i) => {
      const pts = b.path.pts.map((q) => P(T, q.x * 1000, q.y * 1000))
      if (b.path.hit === 'none') {
        const yEnd = b.path.yAtScreen
        pts.push(P(T, s.L + s.D, yEnd * 1000))
      }
      drawTrajectory(ctx, pts, styles[i].color, 2)
      drawBeamDots(ctx, pts, s.phase + i * 0.12, styles[i].color, 5)
    })
    drawScreen(ctx, T, s, (beams[1].path.yAtScreen) * 1000, '#2E7D32', '')
    dimArrow(ctx, T.plateX0, T.plateX1, T.cy + T.halfGap + 16 * T.sc, `L = ${s.L} mm`)
    dimArrow(ctx, T.plateX1, T.screenX, T.cy + 30 * T.sc, `D = ${s.D} mm`)
    setFont(ctx, 9, 'bold'); ctx.fillStyle = C.ink
    ctx.fillText('速度选择器：E ⊥ B，只有 v = E/B 的电子受力平衡、直线穿过', A.stage.x + 8, A.stage.y + 8)
    drawFormula(ctx, A, s)
    setFont(ctx, 8.5); ctx.fillStyle = C.sub
    ctx.fillText(`E/B = ${sci(vMatch)} m/s　　v₀（Ua=${s.Ua.toFixed(1)} kV）= ${sci(sol.v0)} m/s`, A.stage.x + 8, A.stage.y + 26)
    // 三条束的图例
    const legend = [
      ['#2C6FAF', '0.6 v₀：电场力 > 洛伦兹力 → 向上弯'],
      ['#2E7D32', 'v₀：两力平衡 → 直穿'],
      ['#DE453F', '1.4 v₀：洛伦兹力 > 电场力 → 向下弯'],
    ]
    let lx = A.stage.x + 8
    const lyy = A.stage.y + 46
    setFont(ctx, 8)
    legend.forEach(([col, txt]) => {
      ctx.beginPath(); ctx.arc(lx + 4, lyy + 4, 3.6, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill()
      ctx.fillStyle = col
      ctx.fillText(txt, lx + 11, lyy)
      lx += ctx.measureText(txt).width + 26
    })
  }

  // ── 场景 ④：沿电场方向直线加速 / 减速 ────────────────────
  function drawMode4(ctx, A, s) {
    const T = tube(s, A)
    drawGlass(ctx, T)
    drawGun(ctx, T)
    drawPlates(ctx, T, s, s.U)
    // 中线参考
    ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(120,140,150,0.45)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(T.originX, T.cy); ctx.lineTo(T.screenX, T.cy); ctx.stroke()
    ctx.setLineDash([])

    const v0 = solve(s).v0
    const E = s.U / (s.d / 1000)
    const acc = accelSolve({ v0, E, L: s.L / 1000 })
    // 世界 mm 轨迹：板内匀变速（x 方向），出板后匀速直线
    const pts = []
    for (let i = 0; i <= 36; i++) {
      const u = i / 36
      const t = acc.t * u
      pts.push(P(T, v0 * t * 1000, 0))
    }
    if (!acc.stop) {
      pts.push(P(T, s.L + s.D, 0))
    }
    drawTrajectory(ctx, pts, acc.decel ? '#8E6BB0' : '#F08A24', 2.4)
    if (!acc.stop) drawBeamDots(ctx, pts, s.phase, acc.decel ? '#8E6BB0' : '#2F6FB2')
    if (acc.stop) {
      const p = pts[pts.length - 1]
      ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2); ctx.fillStyle = 'rgba(142,107,176,0.9)'; ctx.fill()
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.2; ctx.stroke()
    }
    drawScreen(ctx, T, s, 0, acc.stop ? '#8E6BB0' : '#2E7D32', '')
    dimArrow(ctx, T.plateX0, T.plateX1, T.cy + T.halfGap + 16 * T.sc, `L = ${s.L} mm`)
    dimArrow(ctx, T.plateX1, T.screenX, T.cy + 30 * T.sc, `D = ${s.D} mm`)
    // 受力标注
    const fColor = acc.decel ? '#8E6BB0' : '#DE453F'
    const fx = T.plateX0 + (T.plateX1 - T.plateX0) * 0.5
    const fy = T.cy - T.halfGap - 10 * T.sc
    ctx.strokeStyle = fColor; ctx.lineWidth = 1.8
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + (acc.decel ? -34 : 34) * T.sc, fy); ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(fx + (acc.decel ? -34 : 34) * T.sc, fy)
    ctx.lineTo(fx + (acc.decel ? -27 : 27) * T.sc, fy - 4)
    ctx.lineTo(fx + (acc.decel ? -27 : 27) * T.sc, fy + 4)
    ctx.stroke()
    setFont(ctx, 8.5, 'bold'); ctx.fillStyle = fColor
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText(acc.decel ? 'F 与 v₀ 反向 → 减速' : 'F 与 v₀ 同向 → 加速', fx, fy - 6)
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'

    setFont(ctx, 9, 'bold'); ctx.fillStyle = C.ink
    ctx.fillText('直线加速/减速：粒子沿场方向射入，电场力做正功或负功（动能定理）', A.stage.x + 8, A.stage.y + 8)
    drawFormula(ctx, A, s)
    // 读数
    setFont(ctx, 8.5); ctx.fillStyle = C.sub
    const tag = acc.stop ? '板内减速到 0（转向点）' : acc.decel ? '减速通过' : '加速通过'
    ctx.fillText(`v₀=${sci(v0)} m/s　a=${sci(Math.abs(acc.a))} m/s²　v₁=${sci(acc.v1Kin)} m/s　${tag}`, A.stage.x + 8, A.stage.y + 26)
  }

  // ── 画：顶部模式页签 + 播放 ─────────────────────────────
  function drawTabs(ctx, A, s) {
    const gap = 8
    const btnH = 30
    const total = A.stage.w - 100
    MODES.forEach((m, i) => {
      const w = (total - gap * 2) / 3
      const x = A.stage.x + i * (w + gap)
      const on = s.mode === m.key
      ctx.beginPath(); ctx.roundRect(x, 10, w, btnH, 8)
      ctx.fillStyle = on ? C.teal : '#FFFFFF'; ctx.fill()
      ctx.strokeStyle = on ? C.tealDark : '#D7E1E6'; ctx.lineWidth = on ? 1.6 : 1; ctx.stroke()
      setFont(ctx, 10.5, 'bold'); ctx.fillStyle = on ? '#fff' : C.sub
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(m.label, x + w / 2, 10 + btnH / 2)
      pushArea({ n: `efdMode${m.key}`, x, y: 10, w, h: btnH, onClick: () => { s.mode = m.key; s.phase = 0; say(`已切到「${m.label.slice(2)}」`) } })
    })
    // 播放/暂停
    const px = A.stage.x + total + gap * 2 + 6
    ctx.beginPath(); ctx.roundRect(px, 10, 78, btnH, 8)
    ctx.fillStyle = s.playing ? '#F3F8F9' : '#FFF3E0'; ctx.fill()
    ctx.strokeStyle = '#D2E1E6'; ctx.lineWidth = 1; ctx.stroke()
    setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.sub
    ctx.fillText(s.playing ? '⏸ 暂停' : '▶ 播放', px + 39, 10 + btnH / 2)
    pushArea({ n: 'efdPlay', x: px, y: 10, w: 78, h: btnH, onClick: () => { s.playing = !s.playing } })
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  }

  // ── 画：滑块 / 按钮 ─────────────────────────────────────
  function pushArea(a) { canvasRef.current._clickAreas.push(a) }

  function drawBtn(ctx, x, y, w, h, label, tone, onClick, name) {
    const t = {
      primary: { bg: C.teal, bd: C.tealDark, fg: '#fff' },
      plain: { bg: '#F3F8F9', bd: '#D2E1E6', fg: '#205863' },
      ghost: { bg: '#F6F7F8', bd: '#DDE3E6', fg: '#7A8A92' },
    }[tone] || { bg: '#fff', bd: '#ddd', fg: '#333' }
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 7)
    ctx.fillStyle = t.bg; ctx.fill(); ctx.strokeStyle = t.bd; ctx.lineWidth = 1; ctx.stroke()
    setFont(ctx, 9.5, 'bold'); ctx.fillStyle = t.fg
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    fitFont(ctx, label, w - 8, 9.5, 'bold')
    ctx.fillText(label, x + w / 2, y + h / 2 + 0.5)
    pushArea({ n: name || 'btn', x, y, w, h, onClick })
    ctx.textBaseline = 'top'; ctx.textAlign = 'left'
  }

  function drawSlider(ctx, { x, y, w, ratio, onChange, name }) {
    ctx.beginPath(); ctx.roundRect(x, y - 3, w, 6, 3); ctx.fillStyle = '#DCE4E8'; ctx.fill()
    ctx.beginPath(); ctx.roundRect(x, y - 3, Math.max(3, clamp(ratio, 0, 1) * w), 6, 3); ctx.fillStyle = C.teal; ctx.fill()
    const kx = x + clamp(ratio, 0, 1) * w
    ctx.beginPath(); ctx.arc(kx, y, 6.5, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'; ctx.fill()
    ctx.strokeStyle = C.teal; ctx.lineWidth = 1.6; ctx.stroke()
    pushArea({ n: name, x: x - 10, y: y - 14, w: w + 20, h: 28, drag: 'slider', setX: (mx) => onChange(clamp((mx - x) / w, 0, 1)) })
  }

  // 演示区右侧：讲解面板（目的 / 原理 / 主要结论 / 注意事项），不含可调参数
  const DEMO_TEXTS = {
    1: {
      purpose: '观察电子经加速电压获得速度后，垂直射入偏转电场的类平抛运动，理解示波管偏转原理。',
      principle: [
        '加速：eUa = ½mv₀²，v₀ = √(2eUa/m)。',
        '板内：水平匀速 v₀，垂直方向匀加速 a = eE/m，做类平抛。',
        '出板：不再受电场力，沿出射方向匀速直线打到屏上。',
      ],
      conclusion: [
        'y₁ = eUL²/(2mdv₀²)，屏上 Y = y₁ + v_y·D/v₀。',
        'U 越大、v₀ 越小，偏转越明显；板内抛物线、板外直线。',
      ],
      notes: ['忽略重力与阻力，电场按匀强电场处理；偏转过大会打到极板上。'],
    },
    2: {
      purpose: '固定加速条件，只改变偏转电压，观察屏上落点与偏转电压的线性关系。',
      principle: ['同一支管、同一 v₀，板长 L、板距 d、板屏距 D 不变，只改变偏转电压 U。'],
      conclusion: ['落点 Y 与 U 成正比；U 反号，落点上下翻转。'],
      notes: ['多组轨迹叠在一起对比时，注意颜色与电压档位对应。'],
    },
    3: {
      purpose: '理解正交电磁场对粒子速度的选择作用：只有特定速度的粒子能直线穿过。',
      principle: ['电场力 F_E = eE，磁场力 F_B = evB；二者反向抵消时 eE = evB，v = E/B。'],
      conclusion: ['v = E/B = U/(d·B)；速度偏大或偏小都会向两侧偏转。'],
      notes: ['电场与磁场必须正交；粒子垂直射入场区。'],
    },
    4: {
      purpose: '观察粒子沿电场方向射入匀强电场时的直线加速/减速，理解动能定理的应用。',
      principle: ['电场力与速度同向做正功→加速；反向做负功→减速；qU = ½mv₁² − ½mv₀²。'],
      conclusion: ['v₁² = v₀² + 2aL；反向场足够强时，粒子在板内减到 0 后折返。'],
      notes: ['减速到 0 后速度方向改变，不能按匀速直线外推。'],
    },
  }

  function drawPalette(ctx, A, s) {
    const x = A.pal.x, w = A.pal.w, y = A.pal.y, h = A.pal.h
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 10)
    ctx.fillStyle = C.card; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke()
    setFont(ctx, 11, 'bold'); ctx.fillStyle = C.ink
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('讲解', x + 12, y + 10)

    const T = DEMO_TEXTS[s.mode] || DEMO_TEXTS[1]
    const secs = [
      { title: '🎯 实验目的', color: '#1565C0', lines: [T.purpose] },
      { title: '📐 实验原理', color: '#2E7D32', lines: T.principle },
      { title: '✅ 主要结论', color: '#B4641A', lines: T.conclusion },
      { title: '⚠ 注意事项', color: '#C62828', lines: T.notes },
    ]
    let ry = y + 30
    const pad = 10
    for (const sec of secs) {
      const lines = []
      sec.lines.forEach((ln) => {
        setFont(ctx, 8.4)
        let cur = ''
        for (const ch of ln) {
          if (ctx.measureText(cur + ch).width > w - pad * 2 && cur) { lines.push(cur); cur = ch } else cur += ch
        }
        if (cur) lines.push(cur)
      })
      setFont(ctx, 9, 'bold'); ctx.fillStyle = sec.color
      ctx.fillText(sec.title, x + pad, ry)
      ry += 15
      setFont(ctx, 8.4); ctx.fillStyle = '#37474F'
      for (const ln of lines) { ctx.fillText(ln, x + pad, ry); ry += 12.5 }
      ry += 8
    }
    // 底部提示：可调参数在自己动手页
    ry = y + h - 46
    ctx.strokeStyle = '#EDF2F5'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(x + 10, ry - 6); ctx.lineTo(x + w - 10, ry - 6); ctx.stroke()
    setFont(ctx, 8.4); ctx.fillStyle = C.faint
    fitFont(ctx, '需要改变电压、板长板距、磁场或粒子种类？请到「🔧 自己动手」页操作。', w - 24, 8.4)
    ctx.fillText('需要改变电压、板长板距、磁场或粒子种类？请到「🔧 自己动手」页操作。', x + pad, ry)
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  }

  function drawToast(ctx, A, s) {
    if (!s.toast || Date.now() > s.toast.until) return
    setFont(ctx, 10.5, 'bold')
    const tw = ctx.measureText(s.toast.text).width + 28
    const x = (A.W - tw) / 2, y = A.stage.y + A.stage.h - 34
    ctx.beginPath(); ctx.roundRect(x, y, tw, 24, 12)
    ctx.fillStyle = 'rgba(24,40,48,0.92)'; ctx.fill()
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(s.toast.text, x + tw / 2, y + 12)
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  }

  // ════════════════════════════════════════════════════════════
  //  Tab 2 自己动手：搭一支「电子枪—加速/偏转极板—荧光屏」
  //  器材：电子枪 gun、加速极板 accel、偏转极板 plate、荧光屏 screen、开关 switch、直流电源 battery
  //  说明：本页以「粒子注入 + 平板场区 + 屏」的仿真台形式呈现，线路符号只作器材连接示意；
  //        改右侧参数（Ua / U / L / d / 粒子种类 / 偏转或加速）即实时重算轨迹与落点。
  // ════════════════════════════════════════════════════════════
  const DIY_PARTS = [
    { type: 'gun', name: '电子枪', sub: '加热发射，Ua 加速出射' },
    { type: 'accel', name: '加速极板', sub: '沿场方向加速/减速' },
    { type: 'plate', name: '偏转极板', sub: '垂直入射 → 类平抛' },
    { type: 'screen', name: '荧光屏', sub: '显示落点 Y' },
    { type: 'switch', name: '开关', sub: '接通/断开装置' },
    { type: 'battery', name: '直流电源', sub: '给极板提供电压' },
  ]
  const DIY_TERM = { gun: 30, accel: 34, plate: 34, screen: 26, switch: 30, battery: 30 }
  let DIYK = 1.5

  function diyGeom(W, H) {
    const palW = 188, palX = W - palW - 12
    const org = { x: 14, y: 56 }
    const aw = palX - 12 - org.x, ah = H - 24 - org.y
    const sc = clamp(Math.min(aw / 920, ah / 560), 1, 1.34)
    DIYK = clamp(sc * 1.45, 1.7, 2.4)
    const area = { x1: aw / sc, y1: ah / sc }
    return { palW, palX, org, sc, area }
  }

  function diyTermPos(comp, i) {
    const d = DIY_TERM[comp.type] * DIYK
    return { x: comp.x + (i === 0 ? -d : d), y: comp.y }
  }

  // 标准装置：从左到右 电子枪 → 加速极板 → 偏转极板 → 荧光屏，下方串开关与电源（示意）
  function buildStandard(A) {
    const dy = S.current.diy
    const mk = (type, x, y, extra) => ({ id: S.current.nextId++, type, x, y, closed: false, ...extra })
    const XL = A.area.x1 * 0.12, XR = A.area.x1 * 0.86
    const yT = A.area.y1 * 0.34, yB = A.area.y1 * 0.72
    const gun = mk('gun', XL, yT)
    const accel = mk('accel', XL + (XR - XL) * 0.3, yT)
    const plate = mk('plate', XL + (XR - XL) * 0.62, yT)
    const screen = mk('screen', XR, yT)
    const sw = mk('switch', XL + (XR - XL) * 0.3, yB, { closed: true })
    const bat = mk('battery', XL + (XR - XL) * 0.62, yB, { u: 12 })
    dy.comps = [gun, accel, plate, screen, sw, bat]
    const wc = dy.wireColor
    dy.wires = [
      { id: 1, from: { compId: gun.id, port: 1 }, to: { compId: accel.id, port: 0 }, color: wc },
      { id: 2, from: { compId: accel.id, port: 1 }, to: { compId: plate.id, port: 0 }, color: wc },
      { id: 3, from: { compId: plate.id, port: 1 }, to: { compId: screen.id, port: 0 }, color: wc },
      { id: 4, from: { compId: bat.id, port: 0 }, to: { compId: sw.id, port: 0 }, color: wc },
      { id: 5, from: { compId: sw.id, port: 1 }, to: { compId: bat.id, port: 1 }, color: wc },
    ]
    dy.sel = gun.id
    dy.t = 0
    say('已放入标准装置：电子枪—极板—荧光屏，可在右侧改参数')
  }

  // 粒子种类 → 荷质比（电子 e/m_e；质子 e/m_p，m_p≈1836 m_e，轨迹更平直）
  const PARTICLE = {
    electron: { label: '电子 e⁻', q: -1, m: 1 },
    proton: { label: '质子 p⁺', q: 1, m: 1836 },
  }

  function diySolve(dy) {
    const pt = PARTICLE[dy.particle] || PARTICLE.electron
    // 加速电压下 v₀ = √(2qUa/m)：电子基准 m=1、q=-1；质子荷质比为电子 1/1836，速度小 √1836 倍
    const v0 = speedFromAccel(dy.Ua * 1000) * Math.sqrt(pt.m === 1 ? 1 : 1 / pt.m)
    const E = dy.U / (dy.d / 1000)
    if (dy.kind === 'accelerator') {
      // 按粒子自身荷质比算加速度，再交给 accelSolve（其内部不再二次缩放）
      const aP = (E_CHARGE * E) / M_ELECTRON * (pt.q / pt.m)
      const acc = accelSolve({ v0, a: aP, L: dy.L / 1000 })
      return { v0, E, acc, kind: 'accelerator', pt }
    }
    if (dy.kind === 'selector') {
      const B = dy.B * 1e-3
      const path = selectorPath({ U: dy.U, d: dy.d / 1000, L: dy.L / 1000, D: dy.D / 1000, B, v0, q: pt.q, m: pt.m })
      return { v0, E, B, path, kind: 'selector', pt }
    }
    // 偏转：按粒子自身荷质比 q/m 自建轨迹，不能在电子解上改 a 再回代
    const L = dy.L / 1000, d = dy.d / 1000, D = dy.D / 1000
    const a = (E_CHARGE * E) / M_ELECTRON * (pt.q / pt.m)
    const t1 = v0 > 0 ? L / v0 : 0
    const y1 = 0.5 * a * t1 * t1
    const vy = a * t1
    const hit = Math.abs(y1) >= d / 2 ? (y1 > 0 ? 'up' : 'down') : 'none'
    const t2 = hit === 'none' && v0 > 0 ? D / v0 : 0
    const y2 = hit === 'none' ? y1 + vy * t2 : y1
    const sol = {
      v0, E, a, t1, y1, vy, theta: Math.atan2(Math.abs(vy), v0), hit, t2, y2,
      y2mm: y2 * 1000, y1mm: y1 * 1000, Lmm: L * 1000, dmm: d * 1000, Dmm: D * 1000,
    }
    return { v0, E, sol, kind: 'deflector', pt }
  }

  function drawDiyComp(ctx, comp, selected) {
    const k = DIYK
    ctx.save(); ctx.translate(comp.x, comp.y); ctx.scale(k, k)
    if (selected) {
      ctx.beginPath(); ctx.roundRect(-34, -22, 68, 44, 9)
      ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([])
    }
    const label = { gun: '电子枪', accel: '加速极板', plate: '偏转极板', screen: '荧光屏', switch: '开关', battery: '直流电源' }[comp.type]
    if (comp.type === 'gun') {
      // 阴极罩 + 灯丝 + 阳极环（与演示页同一套造型，缩小版）
      const mg = ctx.createLinearGradient(0, -5, 0, 5)
      mg.addColorStop(0, '#8C9AA2'); mg.addColorStop(0.45, '#5D6E77'); mg.addColorStop(1, '#37454D')
      ctx.beginPath(); ctx.roundRect(-16, -5, 12, 10, 3); ctx.fillStyle = mg; ctx.fill()
      ctx.strokeStyle = '#4A5A62'; ctx.lineWidth = 1; ctx.stroke()
      ctx.strokeStyle = '#FF8A65'; ctx.lineWidth = 1.3
      ctx.beginPath()
      for (let i = 0; i <= 5; i++) {
        const x = -14 + i * 1.8, y = (i % 2 ? -1.6 : 1.6)
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.stroke()
      for (let j = 0; j < 2; j++) {
        const x = -1 + j * 5
        ctx.beginPath(); ctx.roundRect(x, -3.2, 4, 6.4, 2)
        ctx.fillStyle = j ? '#9BA9B1' : '#B7C3C9'; ctx.fill()
        ctx.strokeStyle = '#7C8B93'; ctx.lineWidth = 1; ctx.stroke()
      }
    } else if (comp.type === 'accel' || comp.type === 'plate') {
      const th = 1.8
      const pg = ctx.createLinearGradient(0, 0, 0, th)
      pg.addColorStop(0, '#E7EDF0'); pg.addColorStop(0.5, '#B9C6CD'); pg.addColorStop(1, '#8A9AA3')
      for (const side of [-1, 1]) {
        ctx.beginPath(); ctx.roundRect(-16, side * 12 - th / 2, 32, th, 2)
        ctx.fillStyle = pg; ctx.fill(); ctx.strokeStyle = '#7E8E97'; ctx.lineWidth = 1; ctx.stroke()
      }
      // 场区淡蓝
      ctx.fillStyle = 'rgba(70,150,235,0.08)'
      ctx.fillRect(-16, -12, 32, 24)
      const up = (comp.type === 'plate')
      ctx.fillStyle = up ? C.pos : C.neg
      setFont(ctx, 10, 'bold'); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText(up ? '+' : '−', -14, -12)
      ctx.fillStyle = up ? C.neg : C.pos
      ctx.fillText(up ? '−' : '+', -14, 12)
    } else if (comp.type === 'screen') {
      const sg = ctx.createLinearGradient(0, -16, 0, 16)
      sg.addColorStop(0, '#E8F7EE'); sg.addColorStop(0.5, '#C9EFD9'); sg.addColorStop(1, '#A9E3C4')
      ctx.beginPath(); ctx.roundRect(-2, -16, 3, 32, 3)
      ctx.fillStyle = sg; ctx.fill(); ctx.strokeStyle = '#8FC7AA'; ctx.lineWidth = 1; ctx.stroke()
    } else if (comp.type === 'switch') {
      symSwitch(ctx, 0, 0, { closed: comp.closed, scale: 1.1 })
    } else if (comp.type === 'battery') {
      symBattery(ctx, 0, 0, { n: 2, scale: 1.1 })
    }
    // 接线柱
    for (const i of [0, 1]) {
      const t = diyTermPos(comp, i)
      ctx.beginPath(); ctx.arc(t.x, t.y, 4.4, 0, Math.PI * 2)
      ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#6E8790'; ctx.lineWidth = 1.6; ctx.stroke()
    }
    setFont(ctx, 8.5, 'bold'); ctx.fillStyle = C.ink
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(label, 0, 18)
    ctx.restore()
  }

  function diyExtent(comp) {
    const T = DIY_TERM[comp.type] * DIYK
    return { x0: -T, x1: T, y0: -22 * DIYK, y1: 24 * DIYK }
  }

  function addWire(a, b) {
    const dy = S.current.diy
    const dup = dy.wires.some((w) => (
      (w.from.compId === a.compId && w.from.port === a.port && w.to.compId === b.compId && w.to.port === b.port)
      || (w.to.compId === a.compId && w.to.port === a.port && w.from.compId === b.compId && w.from.port === b.port)
    ))
    if (!dup) dy.wires.push({ id: dy.wires.length + 1, from: a, to: b, color: dy.wireColor })
    dy.t = 0
  }

  function renderDiy(ctx, W, H, s) {
    const dy = s.diy
    const A = diyGeom(W, H)
    canvasRef.current._diyView = { ox: A.org.x, oy: A.org.y, sc: A.sc, k: DIYK }

    setFont(ctx, 13, 'bold'); ctx.fillStyle = C.ink
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('自己动手 · 搭一支带电粒子偏转/加速装置', A.org.x + 4, 14)
    setFont(ctx, 10); ctx.fillStyle = C.sub
    ctx.fillText('从右侧器材区点选放入；点两个接线柱连线；点开关通断；右键器材删除。改右侧参数即实时重算轨迹与落点。', A.org.x + 4, 33)

    ctx.save(); ctx.translate(A.org.x, A.org.y); ctx.scale(A.sc, A.sc)
    ctx.beginPath(); ctx.roundRect(0, 0, A.area.x1, A.area.y1, 10)
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#E7EEF2'; ctx.lineWidth = 1; ctx.stroke()
    ctx.fillStyle = 'rgba(140,165,175,0.2)'
    for (let x = 14; x < A.area.x1; x += 26) {
      for (let y = 14; y < A.area.y1; y += 26) { ctx.beginPath(); ctx.arc(x, y, 0.9, 0, Math.PI * 2); ctx.fill() }
    }

    // 导线
    for (const w of dy.wires) {
      const c1 = dy.comps.find((c) => c.id === w.from.compId)
      const c2 = dy.comps.find((c) => c.id === w.to.compId)
      if (!c1 || !c2) continue
      const p1 = diyTermPos(c1, w.from.port), p2 = diyTermPos(c2, w.to.port)
      strokeBezierWire(ctx, p1, p2, w.color || dy.wireColor, null, null, w.from.port, w.to.port)
    }

    // 场区与轨迹（找到 gun / accel / plate / screen 的位置作示意台布局）
    const gun = dy.comps.find((c) => c.type === 'gun')
    const acc = dy.comps.find((c) => c.type === 'accel')
    const plate = dy.comps.find((c) => c.type === 'plate')
    const screen = dy.comps.find((c) => c.type === 'screen')
    if (gun && screen) {
      const field = acc && dy.kind === 'accelerator' ? acc : plate
      const sol = diySolve(dy)
      // 示意轨道：从枪口到板区到屏
      const originX = gun.x + 16 * DIYK
      const plateX0 = field ? field.x - 16 * DIYK : originX + 60 * DIYK
      const plateX1 = field ? field.x + 16 * DIYK : plateX0 + 32 * DIYK
      const screenX = screen.x - 2 * DIYK
      const cy = gun.y
      const halfGap = 12 * DIYK
      const TT = { originX, plateX0, plateX1, screenX, cy, halfGap, sc: DIYK }
      const Pp = (xmm, ymm) => ({ x: TT.plateX0 + xmm * TT.sc, y: TT.cy - ymm * TT.sc })

      let pts = []
      let spotY = 0, spotColor = '#2E7D32', note = ''
      if (sol.kind === 'deflector') {
        const one = sol.sol
        const uMax = one.hit === 'none' ? 1 : Math.min(1, Math.sqrt((dy.d / 2000) / Math.max(1e-12, 0.5 * Math.abs(one.a) * one.t1 * one.t1)))
        for (let k = 0; k <= 36; k++) {
          const u = (k / 36) * uMax
          const t = one.t1 * u
          pts.push(Pp(sol.v0 * t * 1000, 0.5 * one.a * t * t * 1000))
        }
        if (one.hit === 'none' && sol.v0 > 0) pts.push(Pp(one.Lmm + dy.D, one.y2mm))
        spotY = one.y2mm
        note = one.hit === 'none' ? `Y = ${mm1(one.y2mm)}` : '打在极板'
      } else if (sol.kind === 'selector') {
        pts = sol.path.pts.map((p) => Pp(p.x * 1000, p.y * 1000))
        spotY = sol.path.yAtScreen * 1000
        note = sol.path.straight ? `v=E/B 直穿（${mm1(spotY)}）` : `偏离 ${mm1(spotY)}`
      } else {
        const acc = sol.acc
        for (let k = 0; k <= 36; k++) {
          const u = k / 36
          const t = acc.t * u
          pts.push(Pp(sol.v0 * t * 1000, 0))
        }
        if (!acc.stop) pts.push(Pp(dy.L + dy.D, 0))
        spotY = 0; note = acc.stop ? '板内减速到 0' : acc.decel ? '减速通过' : '加速通过'
        spotColor = acc.decel ? '#8E6BB0' : '#2E7D32'
      }
      drawTrajectory(ctx, pts, sol.kind === 'accelerator' ? (sol.acc.decel ? '#8E6BB0' : '#F08A24') : '#F08A24', 2.2)
      if (pts.length > 1) drawBeamDots(ctx, pts, s.phase, sol.kind === 'accelerator' && sol.acc.decel ? '#8E6BB0' : '#2F6FB2')
      // 屏上落点
      const yy = clamp(spotY, -22, 22)
      const py = TT.cy - yy * TT.sc
      const glow = ctx.createRadialGradient(screenX, py, 0, screenX, py, 9)
      glow.addColorStop(0, 'rgba(255,255,255,0.95)'); glow.addColorStop(0.25, spotColor); glow.addColorStop(1, 'rgba(46,125,50,0)')
      ctx.beginPath(); ctx.arc(screenX, py, 9, 0, Math.PI * 2); ctx.fillStyle = glow; ctx.fill()
      setFont(ctx, 8.5, 'bold'); ctx.fillStyle = C.ink; ctx.textAlign = 'right'
      ctx.fillText(note, screenX - 6, py - 4); ctx.textAlign = 'left'

      // 尺寸标注
      dimArrow(ctx, TT.plateX0, TT.plateX1, TT.cy + halfGap + 14 * TT.sc, `L = ${dy.L} mm`)
      dimArrow(ctx, TT.plateX1, TT.screenX, TT.cy + 28 * TT.sc, `D = ${dy.D} mm`)
    }

    // 器材
    for (const c of dy.comps) drawDiyComp(ctx, c, dy.sel === c.id)

    if (!dy.comps.length) {
      setFont(ctx, 12); ctx.fillStyle = C.faint
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('点右侧「一键标准装置」，或从器材区逐个放入电子枪、极板、荧光屏', A.area.x1 / 2, A.area.y1 / 2)
      ctx.textBaseline = 'alphabetic'
    }

    drawDiyStatus(ctx, A, dy)
    ctx.restore()

    drawDiyPalette(ctx, A, W, H, s, dy)
    if (dy.hold) {
      ctx.save(); ctx.globalAlpha = 0.85
      drawDiyComp(ctx, { type: dy.hold, x: dy.mx, y: dy.my, closed: false }, false)
      ctx.restore()
    }
    pushArea({ n: 'diyStage', x: A.org.x, y: A.org.y, w: A.area.x1 * A.sc, h: A.area.y1 * A.sc })
  }

  function drawDiyStatus(ctx, A, dy) {
    const w = 236, h = 104
    const x = 12, y = A.area.y1 - h - 12
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8)
    ctx.fillStyle = 'rgba(246,251,249,0.97)'; ctx.fill()
    ctx.strokeStyle = '#CFE5E0'; ctx.lineWidth = 1; ctx.stroke()
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    const sol = diySolve(dy)
    if (sol.kind === 'deflector') {
      const one = sol.sol
      setFont(ctx, 9, 'bold'); ctx.fillStyle = C.tealDark
      ctx.fillText(`偏转模型　Ua=${dy.Ua.toFixed(1)} kV　U=${Math.round(dy.U)} V`, x + 10, y + 8)
      setFont(ctx, 12, 'bold'); ctx.fillStyle = C.pos
      ctx.fillText(one.hit === 'none' ? `Y = ${mm2(one.y2mm)}` : '打在极板', x + 10, y + 24)
      setFont(ctx, 8.5); ctx.fillStyle = C.sub
      ctx.fillText(`v₀=${sci(sol.v0)} m/s　a=${sci(Math.abs(one.a))} m/s²`, x + 10, y + 46)
      ctx.fillText(`板内 t₁=${(one.t1 * 1e9).toFixed(2)} ns　y₁=${mm2(one.y1mm)}　θ=${(one.theta * 180 / Math.PI).toFixed(1)}°`, x + 10, y + 62)
      ctx.fillText('板内类平抛，出板后沿出射方向匀速直线', x + 10, y + 82)
      ctx.fillText(`粒子：${sol.pt.label}`, x + 10, y + 96)
    } else if (sol.kind === 'selector') {
      const B = sol.B
      setFont(ctx, 9, 'bold'); ctx.fillStyle = C.tealDark
      ctx.fillText(`速度选择器　U=${Math.round(dy.U)} V　B=${dy.B.toFixed(2)} mT`, x + 10, y + 8)
      setFont(ctx, 12, 'bold'); ctx.fillStyle = sol.path.straight ? C.pos : '#B4641A'
      ctx.fillText(sol.path.straight ? '电场力与磁场力相抵，直线穿过' : '速度偏离 E/B，发生偏转', x + 10, y + 24)
      setFont(ctx, 8.5); ctx.fillStyle = C.sub
      ctx.fillText(`v₀=${sci(sol.v0)} m/s　E/B=${sci(sol.E / Math.max(B, 1e-12))} m/s`, x + 10, y + 46)
      ctx.fillText(`落点 ${mm2(sol.path.yAtScreen * 1000)}　条件 v = E/B = U/(d·B)`, x + 10, y + 62)
      ctx.fillText('电场与磁场正交，粒子垂直射入场区', x + 10, y + 82)
      ctx.fillText(`粒子：${sol.pt.label}`, x + 10, y + 96)
    } else {
      const acc = sol.acc
      setFont(ctx, 9, 'bold'); ctx.fillStyle = C.tealDark
      ctx.fillText(`加速/减速模型　Ua=${dy.Ua.toFixed(1)} kV　U=${Math.round(dy.U)} V`, x + 10, y + 8)
      setFont(ctx, 12, 'bold'); ctx.fillStyle = acc.decel ? '#8E6BB0' : C.pos
      ctx.fillText(acc.stop ? '板内减速到 0' : `${acc.decel ? '减速' : '加速'}通过`, x + 10, y + 24)
      setFont(ctx, 8.5); ctx.fillStyle = C.sub
      ctx.fillText(`v₀=${sci(sol.v0)} m/s　a=${sci(Math.abs(acc.a))} m/s²`, x + 10, y + 46)
      ctx.fillText(`v₁=${sci(acc.v1Kin)} m/s　板内 t=${(acc.t * 1e9).toFixed(2)} ns`, x + 10, y + 62)
      ctx.fillText('动能定理：qU = ½mv₁² − ½mv₀²', x + 10, y + 82)
      ctx.fillText(`粒子：${sol.pt.label}`, x + 10, y + 96)
    }
  }

  function drawDiyPalette(ctx, A, W, H, s, dy) {
    const x = A.palX, w = A.palW, y = 12, h = H - 24
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 10)
    ctx.fillStyle = C.card; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke()
    setFont(ctx, 11.5, 'bold'); ctx.fillStyle = C.ink
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('器材区', x + 12, y + 12)

    DIY_PARTS.forEach((it, i) => {
      const cy = y + 34 + i * 46
      const hot = dy.hold === it.type
      ctx.beginPath(); ctx.roundRect(x + 8, cy, w - 16, 40, 8)
      ctx.fillStyle = '#FFFFFF'; ctx.fill()
      ctx.strokeStyle = hot ? C.teal : '#E1E8EB'; ctx.lineWidth = hot ? 2 : 1; ctx.stroke()
      drawDiyComp(ctx, { type: it.type, x: x + 30, y: cy + 20, closed: true }, false)
      setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.ink
      ctx.fillText(it.name, x + 52, cy + 12)
      setFont(ctx, 7.8); ctx.fillStyle = C.faint
      ctx.fillText(it.sub, x + 52, cy + 26)
      pushArea({ n: `diyPart:${it.type}`, x: x + 8, y: cy, w: w - 16, h: 40, holdType: it.type, cursor: 'pointer' })
    })

    let ky = y + 34 + DIY_PARTS.length * 46 + 2
    setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.sub
    ctx.fillText('快捷', x + 12, ky); ky += 16
    drawBtn(ctx, x + 8, ky, w - 16, 26, '一键标准装置', 'primary', () => buildStandard(A), 'diyStandard')
    ky += 32
    drawBtn(ctx, x + 8, ky, w - 16, 26, '清空场地', 'ghost', () => {
      dy.comps = []; dy.wires = []; dy.sel = null; dy.t = 0
      say('场地已清空')
    }, 'diyClear')
    ky += 34

    // 模型切换
    ctx.strokeStyle = '#EDF2F5'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(x + 10, ky); ctx.lineTo(x + w - 10, ky); ctx.stroke()
    ky += 10
    setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.ink
    ctx.fillText('物理模型', x + 12, ky); ky += 16
    const models = [
      { k: 'deflector', label: '偏转（类平抛）' },
      { k: 'accelerator', label: '加速/减速（直线）' },
      { k: 'selector', label: '速度选择器 E⊥B' },
    ]
    models.forEach((m) => {
      const on = dy.kind === m.k
      ctx.beginPath(); ctx.roundRect(x + 8, ky, w - 16, 26, 7)
      ctx.fillStyle = on ? C.teal : '#F3F8F9'; ctx.fill()
      ctx.strokeStyle = on ? C.tealDark : '#D2E1E6'; ctx.lineWidth = 1; ctx.stroke()
      setFont(ctx, 9, 'bold'); ctx.fillStyle = on ? '#fff' : C.sub
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(m.label, x + w / 2, ky + 13)
      pushArea({ n: `diyModel:${m.k}`, x: x + 8, y: ky, w: w - 16, h: 26, onClick: () => { dy.kind = m.k; dy.t = 0; say(`已切到${m.label}`) } })
      ky += 32
    })

    // 粒子种类
    setFont(ctx, 9, 'bold'); ctx.fillStyle = C.sub
    ctx.fillText('粒子种类', x + 12, ky); ky += 14
    const parts = [
      { k: 'electron', label: '电子 e⁻' },
      { k: 'proton', label: '质子 p⁺' },
    ]
    parts.forEach((p, i) => {
      const px = x + 10 + i * ((w - 24) / 2)
      const on = dy.particle === p.k
      ctx.beginPath(); ctx.roundRect(px, ky, (w - 24) / 2 - 6, 26, 7)
      ctx.fillStyle = on ? C.teal : '#F3F8F9'; ctx.fill()
      ctx.strokeStyle = on ? C.tealDark : '#D2E1E6'; ctx.lineWidth = 1; ctx.stroke()
      setFont(ctx, 9, 'bold'); ctx.fillStyle = on ? '#fff' : C.sub
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(p.label, px + ((w - 24) / 2 - 6) / 2, ky + 13)
      pushArea({ n: `diyParticle:${p.k}`, x: px, y: ky, w: (w - 24) / 2 - 6, h: 26, onClick: () => { dy.particle = p.k; dy.t = 0 } })
    })
    ky += 34

    // 参数滑块
    const rows = [
      { name: 'diyUa', label: '加速电压 Ua', val: dy.Ua, min: 1, max: 8, step: 0.1, fmt: (v) => `${v.toFixed(1)} kV`, set: (v) => { dy.Ua = v } },
      { name: 'diyU', label: '极板电压 U', val: dy.U, min: -300, max: 300, step: 10, fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(v)} V`, set: (v) => { dy.U = v } },
      { name: 'diyL', label: '板长 L', val: dy.L, min: 20, max: 70, step: 1, fmt: (v) => `${Math.round(v)} mm`, set: (v) => { dy.L = v } },
      { name: 'diyD', label: '板距 d', val: dy.d, min: 6, max: 24, step: 1, fmt: (v) => `${Math.round(v)} mm`, set: (v) => { dy.d = v } },
      { name: 'diyD2', label: '板—屏距离 D', val: dy.D, min: 30, max: 90, step: 1, fmt: (v) => `${Math.round(v)} mm`, set: (v) => { dy.D = v } },
    ]
    if (dy.kind === 'selector') {
      rows.push({ name: 'diyB', label: '磁感应强度 B', val: dy.B, min: 0.05, max: 1.5, step: 0.01, fmt: (v) => `${v.toFixed(2)} mT`, set: (v) => { dy.B = v } })
    }
    rows.forEach((r) => {
      setFont(ctx, 9, 'bold'); ctx.fillStyle = C.ink
      ctx.fillText(r.label, x + 12, ky)
      setFont(ctx, 9, 'bold'); ctx.fillStyle = C.tealDark
      ctx.textAlign = 'right'; ctx.fillText(r.fmt(r.val), x + w - 12, ky); ctx.textAlign = 'left'
      ky += 12
      drawSlider(ctx, {
        x: x + 12, y: ky + 8, w: w - 24, ratio: (r.val - r.min) / (r.max - r.min), name: r.name,
        onChange: (ratio) => {
          const raw = r.min + ratio * (r.max - r.min)
          const v = Math.round(raw / r.step) * r.step
          r.set(clamp(+v.toFixed(4), r.min, r.max)); dy.t = 0
        },
      })
      ky += 30
    })

    // 选中器材：开关通断 / 提示
    const sel = dy.comps.find((c) => c.id === dy.sel)
    if (sel && sel.type === 'switch') {
      drawBtn(ctx, x + 8, ky, w - 16, 26, sel.closed ? '断开开关' : '闭合开关', 'plain', () => {
        sel.closed = !sel.closed; dy.t = 0
        say(sel.closed ? '开关闭合' : '开关断开')
      }, 'diySwitch')
      ky += 32
    } else {
      setFont(ctx, 8.5); ctx.fillStyle = C.faint
      fitFont(ctx, '单击画布中的器材可选中；右键删除', w - 24, 8.5)
      ctx.fillText('单击画布中的器材可选中；右键删除', x + 12, ky)
      ky += 16
    }
  }

  function render(R2) {
    const ctx = R2.ctx, W = R2.W, H = R2.H
    const s = S.current
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H)
    canvasRef.current._clickAreas = []
    const A = layout(W, H)
    if (s.tab === 1) {
      // 舞台卡片
      ctx.beginPath(); ctx.roundRect(A.stage.x, A.stage.y, A.stage.w, A.stage.h, 10)
      ctx.fillStyle = C.card; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke()
      // 舞台里淡网格
      ctx.strokeStyle = 'rgba(150,175,185,0.12)'; ctx.lineWidth = 1
      for (let gx = A.stage.x + 20; gx < A.stage.x + A.stage.w; gx += 24) {
        ctx.beginPath(); ctx.moveTo(gx, A.stage.y + 2); ctx.lineTo(gx, A.stage.y + A.stage.h - 2); ctx.stroke()
      }
      for (let gy = A.stage.y + 20; gy < A.stage.y + A.stage.h; gy += 24) {
        ctx.beginPath(); ctx.moveTo(A.stage.x + 2, gy); ctx.lineTo(A.stage.x + A.stage.w - 2, gy); ctx.stroke()
      }
      drawTabs(ctx, A, s)
      if (s.mode === 1) drawMode1(ctx, A, s)
      else if (s.mode === 2) drawMode2(ctx, A, s)
      else if (s.mode === 3) drawMode3(ctx, A, s)
      else drawMode4(ctx, A, s)
      drawPalette(ctx, A, s)
    } else {
      renderDiy(ctx, W, H, s)
    }
    drawToast(ctx, A, s)
    canvasRef.current._dbg = (() => {
      const dbg = {
        tab: s.tab, mode: s.mode,
        playing: s.playing, phase: s.phase,
        areas: canvasRef.current._clickAreas.map((a) => ({ n: a.n || '', x: Math.round(a.x), y: Math.round(a.y), w: Math.round(a.w), h: Math.round(a.h) })),
      }
      if (s.tab === 1) {
        const sol = solve(s)
        const B = s.B * 1e-3
        dbg.params = { Ua: s.Ua, U: s.U, L: s.L, d: s.d, D: s.D, B: s.B }
        dbg.sol = { v0: sol.v0, a: sol.a, t1: sol.t1, y1mm: sol.y1mm, vy: sol.vy, thetaDeg: sol.theta * 180 / Math.PI, y2mm: sol.y2mm, hit: sol.hit }
        dbg.vMatch = (s.U / (s.d / 1000)) / Math.max(B, 1e-12)
        dbg.beams = selectorBeams(s).map((b) => ({ f: b.f, hit: b.path.hit, yScreen: b.path.yAtScreen * 1000, straight: b.path.straight, yExit: (b.path.pts[b.path.pts.length - 1] || { y: 0 }).y * 1000 }))
      } else {
        const dy = s.diy
        const ds = diySolve(dy)
        dbg.diy = {
          kind: dy.kind, particle: dy.particle,
          params: { Ua: dy.Ua, U: dy.U, L: dy.L, d: dy.d, D: dy.D, B: dy.B },
          comps: dy.comps.map((c) => ({ type: c.type, x: Math.round(c.x), y: Math.round(c.y), closed: !!c.closed })),
          wires: dy.wires.length,
          result: ds.kind === 'deflector'
            ? { y2mm: ds.sol.y2mm, hit: ds.sol.hit, v0: ds.v0, a: ds.sol.a }
            : ds.kind === 'selector'
              ? { yAtScreen: ds.path.yAtScreen, straight: ds.path.straight, v0: ds.v0, B: ds.B }
              : { v1Kin: ds.acc.v1Kin, stop: ds.acc.stop, decel: ds.acc.decel, v0: ds.v0, a: ds.acc.a },
        }
      }
      return dbg
    })()
  }

  // ── 动画循环 / 交互 ─────────────────────────────────────
  const renderRef = useRef(null)
  renderRef.current = render
  useEffect(() => {
    const cvs = canvasRef.current
    if (!cvs) return
    const R2 = {
      canvas: cvs, ctx: cvs.getContext('2d'), W: 0, H: 0,
      resize() {
        cvs.width = cvs.clientWidth * devicePixelRatio
        cvs.height = cvs.clientHeight * devicePixelRatio
        this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
        this.W = cvs.clientWidth; this.H = cvs.clientHeight
      },
    }
    R2.resize(); cvs._R = R2
    let last = performance.now()
    let raf = 0
    const loop = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05); last = now
      if (S.current.playing) S.current.phase = (S.current.phase + dt / 1.8) % 1
      renderRef.current(R2)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    const ro = new ResizeObserver(() => { R2.resize(); renderRef.current(R2) })
    ro.observe(cvs)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [])

  function getPos(e) { return eventToCanvas(canvasRef.current, e) }
  const hitArea = (a, x, y) => x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h

  function handleDown(e) {
    if (e.button !== 0) return
    const s = S.current
    const { x, y } = getPos(e)
    const areas = canvasRef.current._clickAreas || []

    if (s.tab === 1) {
      for (const a of areas) {
        if (!hitArea(a, x, y)) continue
        if (a.drag === 'slider') { s.dragSlider = a; a.setX(x); return }
        if (a.onClick) { a.onClick(); return }
      }
      return
    }

    // Tab2 自己动手
    const dy = s.diy
    for (const a of areas) {
      if (!hitArea(a, x, y)) continue
      if (a.holdType) { dy.hold = a.holdType; dy.mx = x; dy.my = y; return }
      if (a.drag === 'slider') { s.dragSlider = a; a.setX(x); return }
      if (a.n === 'diyStage') continue
      if (a.onClick) { a.onClick(); return }
    }
    const R0 = canvasRef.current._R
    const A = diyGeom(R0.W, R0.H)
    const Pt = { x: (x - A.org.x) / A.sc, y: (y - A.org.y) / A.sc }
    if (dy.hold) {
      const t = dy.hold
      const c = { id: s.nextId++, type: t, x: Pt.x, y: Pt.y, closed: false, u: 12, r: 10, c: 100 }
      dy.comps.push(c); dy.sel = c.id; dy.hold = null; dy.t = 0
      const NAMES = { gun: '电子枪', accel: '加速极板', plate: '偏转极板', screen: '荧光屏', switch: '开关', battery: '直流电源' }
      say(`已放入${NAMES[t] || '器材'}`)
      return
    }
    // 开关：点本体即通断（优先于接线柱）
    const swHit = dy.comps.find((c) => c.type === 'switch' && inDiyComp(c, Pt))
    if (swHit) {
      swHit.closed = !swHit.closed; dy.sel = swHit.id; dy.t = 0
      say(swHit.closed ? '开关闭合' : '开关断开')
      return
    }
    // 接线柱 → 连线
    const TR = 22 * DIYK / 1.7
    let best = null
    for (const c of dy.comps) {
      for (let i = 0; i < 2; i++) {
        const t = diyTermPos(c, i)
        const d = Math.hypot(Pt.x - t.x, Pt.y - t.y)
        if (d < TR && (!best || d < best.d)) best = { compId: c.id, port: i, d }
      }
    }
    if (best) {
      if (dy.connecting) {
        if (!(dy.connecting.compId === best.compId && dy.connecting.port === best.port)) addWire(dy.connecting, best)
        dy.connecting = null
      } else {
        dy.connecting = { compId: best.compId, port: best.port }
      }
      dy.sel = best.compId
      return
    }
    // 点器材本体 → 选中并可拖动
    const picked = [...dy.comps].reverse().find((c) => inDiyComp(c, Pt))
    if (picked) {
      if (dy.connecting) {
        const near = [0, 1].map((i) => ({ i, d: Math.hypot(Pt.x - diyTermPos(picked, i).x, Pt.y - diyTermPos(picked, i).y) }))
          .sort((a, b) => a.d - b.d)[0].i
        if (!(dy.connecting.compId === picked.id && dy.connecting.port === near)) addWire(dy.connecting, { compId: picked.id, port: near })
        dy.connecting = null; dy.sel = picked.id
        return
      }
      dy.sel = picked.id
      dy.drag = 'comp'
      s.dragOff = { x: Pt.x - picked.x, y: Pt.y - picked.y }
      return
    }
    dy.sel = null; dy.connecting = null
  }

  function inDiyComp(c, Pt) {
    const e = diyExtent(c)
    const pad = 6 * (DIYK / 1.5)
    return Pt.x > c.x + e.x0 - pad && Pt.x < c.x + e.x1 + pad && Pt.y > c.y + e.y0 - pad && Pt.y < c.y + e.y1 + pad
  }

  function handleMove(e) {
    const s = S.current
    const { x, y } = getPos(e)
    if (s.tab === 1) {
      if (s.dragSlider) s.dragSlider.setX(x)
      return
    }
    const dy = s.diy
    const R = canvasRef.current._R
    if (!R) return
    const A = diyGeom(R.W, R.H)
    const Pt = { x: (x - A.org.x) / A.sc, y: (y - A.org.y) / A.sc }
    if (dy.hold) { dy.mx = x; dy.my = y; return }
    if (dy.connecting) { dy.mx = Pt.x; dy.my = Pt.y }
    if (dy.drag === 'comp') {
      const c = dy.comps.find((cc) => cc.id === dy.sel)
      if (c) {
        const e = diyExtent(c)
        c.x = clamp(Pt.x - (s.dragOff?.x || 0), 12 - e.x0, A.area.x1 - 12 - e.x1)
        c.y = clamp(Pt.y - (s.dragOff?.y || 0), 8 - e.y0, A.area.y1 - 8 - e.y1)
      }
      return
    }
    if (s.dragSlider) s.dragSlider.setX(x)
  }
  function handleUp() {
    S.current.dragSlider = null
    S.current.diy.drag = null
  }
  function handleContextMenu(e) {
    e.preventDefault()
    const s = S.current
    if (s.tab !== 2) return
    const { x, y } = getPos(e)
    const R = canvasRef.current._R
    const A = diyGeom(R.W, R.H)
    const Pt = { x: (x - A.org.x) / A.sc, y: (y - A.org.y) / A.sc }
    const idx = s.diy.comps.findIndex((c) => inDiyComp(c, Pt))
    if (idx >= 0) {
      const id = s.diy.comps[idx].id
      s.diy.comps.splice(idx, 1)
      s.diy.wires = s.diy.wires.filter((w) => w.from.compId !== id && w.to.compId !== id)
      if (s.diy.sel === id) s.diy.sel = null
      s.diy.t = 0
      say('器材已删除')
    }
  }

  const mode = S.current.mode
  const desc = S.current.tab === 2
    ? '自己动手：从器材区放入电子枪、加速/偏转极板、荧光屏并连线；切换偏转或加速模型，调节 Ua、U、L、d、D 与粒子种类，实时观察轨迹与屏上落点。'
    : mode === 1
      ? '电子经加速电压 Ua 获得 v₀，垂直射入两块平行偏转板之间：板内做类平抛，出板后沿出射方向匀速直线，最后打在荧光屏上。'
      : mode === 2
        ? '同一支示波管，只改偏转电压 U 的大小与符号：屏上落点与 U 成正比，正负号决定向上还是向下偏。'
        : mode === 3
          ? 'E 与 B 正交：只有速度恰为 E/B 的电子电场力与磁场力相抵、直线穿过；偏快的向一侧弯、偏慢的向另一侧弯。'
          : '粒子沿场方向射入匀强电场：电场力做正功加速、做负功减速，满足动能定理 qU = ½mv₁² − ½mv₀²。'
  const conclusion = mode === 1
    ? {
      phenomenon: 'U 越大、v₀ 越小，偏转越明显；出板后轨迹变成直线，不再弯曲。',
      formula: 'y₁ = qUL²/(2mdv₀²)，Y屏 = y₁ + (v_y/v₀)·D',
      summary: '示波管靠一对偏转板把电子束"写"到荧光屏上——板内类平抛，板外匀速直线。',
    }
    : mode === 2
      ? {
        phenomenon: '其他条件不变时，屏上落点 Y 与偏转电压 U 成正比，U 反号则上下翻转。',
        formula: 'Y ∝ U (Ua、L、d、D 不变)',
        summary: '示波器屏幕上看到的波形，本质就是偏转电压随时间变化的"放大照片"。',
      }
      : mode === 3
        ? {
          phenomenon: 'B 调大或 v 调小，电子向一侧弯；只有 v = E/B 时电场力与磁场力相抵，直线穿过。',
          formula: 'v = E/B = U/(d·B)',
          summary: '速度选择器只让特定速度的粒子通过，是质谱仪、粒子加速器的入口。',
        }
        : {
          phenomenon: '电场力与速度同向则加速、反向则减速；板内可能减到 0 后折返。',
          formula: 'qU = ½mv₁² − ½mv₀²，v₁² = v₀² + 2aL',
          summary: '直线加速/减速是动能定理在匀强电场中的直接应用，也是直线加速器的原理。',
        }

  const purposeText = S.current.tab === 1
    ? DEMO_TEXTS[mode].purpose
    : '把器材拖入场地搭一支加速/偏转装置：自己改电压、板长板距、磁场与粒子种类，观察轨迹与落点如何变化。'

  return (
    <SceneShell
      title="带电粒子在电场中的偏转"
      tab={S.current.tab}
      onTabChange={(t) => { S.current.tab = t; S.current.phase = 0; setTab(t); forceUpdate((n) => n + 1) }}
      tab1Label="📊 实验演示"
      tab2Label="🔧 自己动手"
      onReset={reset}
      purpose={purposeText}
      desc={desc}
      conclusionOpen={conclusionOpen}
      onConclusionToggle={() => setConclusionOpen((o) => !o)}
      conclusion={conclusion}
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
        onMouseDown={handleDown}
        onMouseMove={handleMove}
        onMouseUp={handleUp}
        onMouseLeave={handleUp}
        onContextMenu={handleContextMenu}
      />
    </SceneShell>
  )
}
