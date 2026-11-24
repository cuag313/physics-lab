import { useState, useRef, useEffect } from 'react'
import { eventToCanvas } from '../utils/pointerPos'
import SceneShell from '../ui/SceneShell'

/**
 * ElectricPotentialScene — 电势与电势差
 *
 * 口径（Q 用 nC、r 用 cm）：
 *   V = kQ/r  →  V(V) = 900·Q(nC)/r(cm)      （标量，可代数叠加）
 *   等势面 = V 相等的点连成的面；与电场线处处垂直，越密场强越大
 *   ΔV = V_A − V_B，W = qΔV（路径无关），Ep = qV
 *   E = −∇V，E(V/m) = |∇V(V/cm)| × 100
 *
 * Step1 点电荷电势：V=kQ/r，同心等势面，探针读 V、r
 * Step2 等势面：偶极子等势线（marching squares 求等值线），探针处演示 E ⊥ 等势面
 * Step3 电势差与做功：A、B 两点可拖，两条路径，W=qΔV 与路径无关
 * Tab2 自己动手：自由布电荷，看标量叠加 V=V₁+V₂+…，探针读合电势
 */

const K_V = 900      // V = 900 · Q(nC) / r(cm)
const BALL_R = 13

const FONT = '"PingFang SC","Microsoft YaHei",system-ui,-apple-system,sans-serif'
const C = {
  bg: '#EDF2F5', card: '#FFFFFF', line: '#DFE8EC', teal: '#12A69B', tealDark: '#0B7F77',
  tealSoft: '#E6F4F2', pos: '#DE453F', posSoft: '#FDEDEC', neg: '#2C6FAF', negSoft: '#EAF1F8',
  gold: '#E2A33C', ink: '#22313A', sub: '#5D7079', faint: '#93A5AD', zero: '#3E9A5F',
}

const STEPS = [
  { key: 1, label: '① 点电荷电势', sub: 'V = kQ/r：距电荷越近电势越高；正电荷周围 V>0、负电荷周围 V<0，等势面是以电荷为心的同心球（图上为同心圆）' },
  { key: 2, label: '② 等势面', sub: '等势面上各点电势相等，沿等势面移动电荷电场力不做功；等势面处处垂直于电场线，等势面越密处场强越大' },
  { key: 3, label: '③ 电势差与做功', sub: 'ΔV = V_A − V_B，W = qΔV：只由始末位置决定，与路径无关；正电荷从高电势到低电势，电场力做正功' },
]

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
function setFont(ctx, size, weight = '') { ctx.font = `${weight ? weight + ' ' : ''}${size}px ${FONT}` }
function fitFont(ctx, text, maxW, size, weight = '') {
  let fs = size
  setFont(ctx, fs, weight)
  while (ctx.measureText(text).width > maxW && fs > 7.5) { fs -= 0.5; setFont(ctx, fs, weight) }
  return fs
}
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' }
const supNum = (n) => String(n).split('').map((c) => SUP[c] || c).join('')
function sci(v, digits = 2) {
  if (!isFinite(v) || v === 0) return '0'
  const e = Math.floor(Math.log10(Math.abs(v)))
  const m = v / Math.pow(10, e)
  if (e >= -2 && e <= 3) return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(Math.min(digits, 2))
  return `${m.toFixed(digits)}×10${supNum(e)}`
}
function arrowHead(ctx, x, y, dx, dy, color, size = 7) {
  const len = Math.hypot(dx, dy)
  if (len < 0.01) return
  const nx = dx / len, ny = dy / len
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x + nx * size, y + ny * size)
  ctx.lineTo(x - nx * size * 0.55 + ny * size * 0.62, y - ny * size * 0.55 - nx * size * 0.62)
  ctx.lineTo(x - nx * size * 0.55 - ny * size * 0.62, y - ny * size * 0.55 + nx * size * 0.62)
  ctx.closePath(); ctx.fill()
}
function arrow(ctx, x0, y0, x1, y1, color, width) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy)
  if (L < 6) return
  const ux = dx / L, uy = dy / L
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - ux * 8, y1 - uy * 8); ctx.stroke()
  ctx.lineCap = 'butt'
  arrowHead(ctx, x1, y1, ux, uy, color, width * 2.2)
}

// ───────── 电势与场 ─────────
function vAt(charges, x, y, pxPerCm) {
  let V = 0
  for (const c of charges) {
    const rcm = Math.max(1.6, Math.hypot(x - c.x, y - c.y)) / pxPerCm
    V += (K_V * c.Q) / rcm
  }
  return V
}
function termsAt(charges, x, y, pxPerCm) {
  const terms = []
  let V = 0
  for (const c of charges) {
    const rpx = Math.max(1.6, Math.hypot(x - c.x, y - c.y))
    const rcm = rpx / pxPerCm
    const v = (K_V * c.Q) / rcm
    terms.push({ id: c.id, Q: c.Q, v, rcm })
    V += v
  }
  return { V, terms }
}
// E = −∇V，返回 V/cm
function fieldFromV(charges, x, y, pxPerCm) {
  const h = 2
  const gx = (vAt(charges, x + h, y, pxPerCm) - vAt(charges, x - h, y, pxPerCm)) / (2 * h) * pxPerCm
  const gy = (vAt(charges, x, y + h, pxPerCm) - vAt(charges, x, y - h, pxPerCm)) / (2 * h) * pxPerCm
  return { ex: -gx, ey: -gy, E: Math.hypot(gx, gy) }
}

// marching squares：等值线段
function buildContours(charges, box, pxPerCm, levels, stepPx = 7) {
  const nx = Math.floor(box.w / stepPx), ny = Math.floor(box.h / stepPx)
  const g = new Float32Array((nx + 1) * (ny + 1))
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) g[j * (nx + 1) + i] = vAt(charges, box.x + i * stepPx, box.y + j * stepPx, pxPerCm)
  }
  const out = levels.map((l) => ({ level: l, segs: [] }))
  const interp = (x1, y1, v1, x2, y2, v2, l) => {
    const dd = v2 - v1
    const t = Math.abs(dd) < 1e-9 ? 0.5 : (l - v1) / dd
    return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]
  }
  // 0=top 1=right 2=bottom 3=left
  const PAIRS = {
    0: [], 15: [],
    1: [[3, 0]], 14: [[3, 0]],
    2: [[0, 1]], 13: [[0, 1]],
    3: [[3, 1]], 12: [[3, 1]],
    4: [[1, 2]], 11: [[1, 2]],
    6: [[0, 2]], 9: [[0, 2]],
    7: [[2, 3]], 8: [[2, 3]],
    5: [[3, 0], [1, 2]], 10: [[0, 1], [2, 3]],
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x0 = box.x + i * stepPx, y0 = box.y + j * stepPx
      const va = g[j * (nx + 1) + i], vb = g[j * (nx + 1) + i + 1]
      const vc = g[(j + 1) * (nx + 1) + i + 1], vd = g[(j + 1) * (nx + 1) + i]
      for (let li = 0; li < levels.length; li++) {
        const l = levels[li]
        const mask = (va > l ? 1 : 0) | (vb > l ? 2 : 0) | (vc > l ? 4 : 0) | (vd > l ? 8 : 0)
        const pairs = PAIRS[mask]
        if (!pairs || !pairs.length) continue
        for (const [e1, e2] of pairs) {
          const ep = (k) => {
            if (k === 0) return interp(x0, y0, va, x0 + stepPx, y0, vb, l)
            if (k === 1) return interp(x0 + stepPx, y0, vb, x0 + stepPx, y0 + stepPx, vc, l)
            if (k === 2) return interp(x0, y0 + stepPx, vd, x0 + stepPx, y0 + stepPx, vc, l)
            return interp(x0, y0, va, x0, y0 + stepPx, vd, l)
          }
          const p1 = ep(e1), p2 = ep(e2)
          out[li].segs.push([p1[0], p1[1], p2[0], p2[1]])
        }
      }
    }
  }
  return out
}

function makeLayout(W, H) {
  const stage = { x0: 24, x1: Math.max(W * 0.56, W - 300), y0: 76, y1: H - 126 }
  const panel = { x: W - 282, y: 76, w: 262, h: stage.y1 - 76 }
  const box = { x: stage.x0 + 16, y: stage.y0 + 16, w: stage.x1 - stage.x0 - 32, h: stage.y1 - stage.y0 - 32 }
  const pxPerCm = clamp(Math.min(box.w / 52, box.h / 32), 5, 22)
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2
  const toolbar = { x: 14, y: H - 112, w: W - 28, h: 88 }
  return { stage, panel, box, pxPerCm, cx, cy, toolbar }
}

export default function ElectricPotentialScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const contourCache = useRef({ key: '', data: [] })

  const S = useRef({
    tab: 1, step: 1,
    Q: 30, polarity: 1, q: 4,
    probe: { x: 0, y: 0 }, ready: false,
    aPt: { x: 0, y: 0 }, bPt: { x: 0, y: 0 }, abReady: false,
    path: 'curve',
    anim: { playing: false, t: 0, start: 0 },
    drag: null, dragOff: { x: 0, y: 0 },
    toast: null,
    diy: { charges: [], hold: null, sel: null, probe: { x: 0, y: 0 }, ready: false },
    nextId: 1,
  })

  const [tab, setTab] = useState(1)
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const R = {
      canvas, ctx: canvas.getContext('2d'), W: 0, H: 0,
      resize() {
        canvas.width = canvas.clientWidth * devicePixelRatio
        canvas.height = canvas.clientHeight * devicePixelRatio
        this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
        this.W = canvas.clientWidth; this.H = canvas.clientHeight
        contourCache.current.key = ''
      },
    }
    R.resize(); canvasRef.current._R = R
    const loop = () => { render(R); animRef.current = requestAnimationFrame(loop) }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function pushArea(a) { canvasRef.current._clickAreas.push(a) }
  function say(text) { S.current.toast = { text, until: Date.now() + 2200 } }

  function render(R) {
    try {
      const ctx = R.ctx, W = R.W, H = R.H
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H)
      canvasRef.current._clickAreas = []
      if (S.current.tab === 1) renderDemo(ctx, W, H)
      else renderDiy(ctx, W, H)
      canvasRef.current._dbg = {
        step: S.current.step, tab: S.current.tab,
        anim: { ...S.current.anim, now: Math.round(performance.now() - S.current.anim.start) },
        probe: S.current.tab === 1 ? S.current.probe : S.current.diy.probe,
        aPt: S.current.aPt, bPt: S.current.bPt,
        layout: { pxPerCm: Math.round((canvasRef.current._px || 0) * 10) / 10 },
        areas: canvasRef.current._clickAreas.map((a) => ({ n: a.n || '', x: a.x, y: a.y, w: a.w, h: a.h })),
      }
    } catch (e) { console.error('render error:', e) }
  }

  // ═════════════════════════════════════════════
  //  Tab 1
  // ═════════════════════════════════════════════
  function chargesOf(s, L) {
    if (s.step === 1 || s.step === 3) return [{ id: 'q1', x: L.cx, y: L.cy, Q: s.polarity * s.Q }]
    const d = 7 * L.pxPerCm
    return [
      { id: 'p', x: L.cx - d, y: L.cy, Q: s.Q },
      { id: 'n', x: L.cx + d, y: L.cy, Q: -s.Q },
    ]
  }

  function renderDemo(ctx, W, H) {
    const s = S.current
    const L = makeLayout(W, H)
    if (!s.ready) { s.probe = { x: L.cx + 13 * L.pxPerCm, y: L.cy - 6 * L.pxPerCm }; s.ready = true }
    canvasRef.current._px = L.pxPerCm
    if (!s.abReady) {
      s.aPt = { x: L.cx + 4.5 * L.pxPerCm, y: L.cy - 3 * L.pxPerCm }
      s.bPt = { x: L.cx + 20 * L.pxPerCm, y: L.cy + 7 * L.pxPerCm }
      s.abReady = true
    }
    if (s.anim.playing) {
      const t = (performance.now() - s.anim.start) / 2600
      s.anim.t = clamp(t, 0, 1)
      if (t >= 1) s.anim.playing = false
    }

    drawHeader(ctx, W, s)
    drawStageCard(ctx, L)
    if (s.step === 1) drawStepOneCharge(ctx, L, s)
    else if (s.step === 2) drawStepEquipotential(ctx, L, s)
    else drawStepWork(ctx, L, s)
    drawPanel(ctx, L, s)
    drawToolbar(ctx, W, L, s)
    drawToast(ctx, W, s)
  }

  function drawHeader(ctx, W, s) {
    const bw = 132, bh = 30, gap = 10
    const total = STEPS.length * bw + (STEPS.length - 1) * gap
    const x0 = (W - total) / 2
    STEPS.forEach((st, i) => {
      const x = x0 + i * (bw + gap), y = 10
      const active = s.step === st.key
      ctx.beginPath(); ctx.roundRect(x, y, bw, bh, 9)
      ctx.fillStyle = active ? C.teal : C.card; ctx.fill()
      ctx.strokeStyle = active ? C.tealDark : C.line; ctx.lineWidth = 1; ctx.stroke()
      setFont(ctx, 12, 'bold'); ctx.fillStyle = active ? '#fff' : C.sub
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(st.label, x + bw / 2, y + bh / 2 + 1)
      pushArea({ n: `step${st.key}`, x, y, w: bw, h: bh, onClick: () => goStep(st.key) })
    })
    ctx.fillStyle = C.sub
    fitFont(ctx, STEPS[s.step - 1].sub, W - 90, 12)
    ctx.fillText(STEPS[s.step - 1].sub, W / 2, 58)
    ctx.textBaseline = 'alphabetic'
  }

  function goStep(key) {
    const s = S.current
    s.step = key
    s.anim.playing = false; s.anim.t = 0
    contourCache.current.key = ''
  }

  function drawStageCard(ctx, L) {
    const { stage, box } = L
    ctx.beginPath(); ctx.roundRect(stage.x0, stage.y0, stage.x1 - stage.x0, stage.y1 - stage.y0, 12)
    ctx.fillStyle = '#FFFFFF'; ctx.fill()
    ctx.strokeStyle = '#E7EEF2'; ctx.lineWidth = 1; ctx.stroke()
    ctx.fillStyle = 'rgba(140,165,175,0.22)'
    for (let x = box.x + 12; x < box.x + box.w; x += 26) {
      for (let y = box.y + 12; y < box.y + box.h; y += 26) { ctx.beginPath(); ctx.arc(x, y, 0.9, 0, Math.PI * 2); ctx.fill() }
    }
    ctx.strokeStyle = 'rgba(18,166,155,0.18)'; ctx.lineWidth = 1
    ctx.setLineDash([4, 5])
    ctx.beginPath(); ctx.roundRect(box.x, box.y, box.w, box.h, 8); ctx.stroke()
    ctx.setLineDash([])
  }

  // ── Step1：单电荷同心等势面 ──
  function drawStepOneCharge(ctx, L, s) {
    const c = { x: L.cx, y: L.cy }
    const Q = s.polarity * s.Q
    const radii = [5, 8, 12, 18, 26]
    // 电势“热区”（红=高、蓝=低）
    const glow = ctx.createRadialGradient(c.x, c.y, 8, c.x, c.y, radii[3] * L.pxPerCm)
    glow.addColorStop(0, Q > 0 ? 'rgba(222,69,63,0.22)' : 'rgba(44,111,175,0.22)')
    glow.addColorStop(0.55, Q > 0 ? 'rgba(222,69,63,0.08)' : 'rgba(44,111,175,0.08)')
    glow.addColorStop(1, Q > 0 ? 'rgba(222,69,63,0)' : 'rgba(44,111,175,0)')
    ctx.save()
    ctx.beginPath(); ctx.rect(L.box.x, L.box.y, L.box.w, L.box.h); ctx.clip()
    ctx.fillStyle = glow; ctx.fillRect(L.box.x, L.box.y, L.box.w, L.box.h)
    // 同心等势面
    const ang = (205 * Math.PI) / 180
    radii.forEach((rcm, i) => {
      const r = rcm * L.pxPerCm
      if (r > Math.min(L.box.w, L.box.h) * 0.46) return
      ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2)
      ctx.strokeStyle = Q > 0 ? `rgba(222,69,63,${0.72 - i * 0.08})` : `rgba(44,111,175,${0.72 - i * 0.08})`
      ctx.lineWidth = i < 2 ? 1.6 : 1.3
      ctx.setLineDash(i % 2 ? [6, 5] : [])
      ctx.stroke()
      ctx.setLineDash([])
      const v = (K_V * Q) / rcm
      const lx = c.x + r * Math.cos(ang)
      const ly = c.y + r * Math.sin(ang)
      setFont(ctx, 9.5, 'bold'); ctx.fillStyle = Q > 0 ? '#A8342C' : '#1E4E7E'
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
      const txt = `V = ${v < 0 ? '−' : ''}${sci(Math.abs(v))} V`
      ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(255,255,255,0.94)'
      ctx.strokeText(txt, lx - 6, ly)
      ctx.fillText(txt, lx - 6, ly)
    })
    ctx.restore()
    drawChargeBall(ctx, c, Q > 0 ? `+${s.Q}nC` : `−${s.Q}nC`)
    legendChip(ctx, L.box.x + 10, L.box.y + 10, '圆周：等势面（同一圆周上 V 相同，越靠内 V 越大）')
    // 探针 + r
    drawProbeDot(ctx, s.probe)
    const px = s.probe.x - c.x, py = s.probe.y - c.y
    const rpx = Math.hypot(px, py) || 1
    const rcm = rpx / L.pxPerCm
    ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(93,112,121,0.5)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(s.probe.x, s.probe.y); ctx.stroke(); ctx.restore()
    const mx = c.x + px * 0.55, my = c.y + py * 0.55
    setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.sub
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    const rt = `r = ${rcm.toFixed(1)} cm`
    ctx.strokeText(rt, mx, my - 10)
    ctx.fillText(rt, mx, my - 10)

    // 内嵌 V–r 曲线（反比关系）
    const gx2 = L.box.x + L.box.w - 272, gy2 = L.box.y + L.box.h - 168
    const gw = 250, gh = 150
    ctx.beginPath(); ctx.roundRect(gx2, gy2, gw, gh, 8)
    ctx.fillStyle = 'rgba(255,255,255,0.96)'; ctx.fill()
    ctx.strokeStyle = '#DFE8EC'; ctx.lineWidth = 1; ctx.stroke()
    const ox = gx2 + 34, pw = gw - 52, phh = gh - 52
    // 正电荷：横轴在底部、曲线向上；负电荷：横轴在上部、曲线向下（V<0）
    const oy = Q > 0 ? gy2 + gh - 24 : gy2 + 44
    const dir = Q > 0 ? -1 : 1
    const rMax = 28, vMax = Math.max((K_V * s.Q) / 2.5, 1)
    setFont(ctx, 8.5, 'bold'); ctx.fillStyle = C.faint
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('V 随 r 反比衰减', gx2 + 10, gy2 + 7)
    ctx.strokeStyle = '#CFDCE2'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + pw, oy); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, oy + dir * (Q > 0 ? phh : phh)); ctx.stroke()
    const X = (r) => ox + (r / rMax) * pw
    const Y = (v) => oy + dir * clamp(v / vMax, 0, 1) * phh
    ctx.beginPath()
    for (let r = 1.2; r <= rMax; r += 0.3) {
      const v = (K_V * Math.abs(Q)) / r
      const yy = Y(v)
      if (r === 1.2) ctx.moveTo(X(r), yy); else ctx.lineTo(X(r), yy)
    }
    ctx.strokeStyle = Q > 0 ? C.pos : C.neg; ctx.lineWidth = 1.8; ctx.stroke()
    // 探针在曲线上的位置
    const pr = clamp(rcm, 1.2, rMax)
    const pv = (K_V * Math.abs(Q)) / pr
    ctx.beginPath(); ctx.arc(X(pr), Y(pv), 4, 0, Math.PI * 2)
    ctx.fillStyle = C.teal; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.stroke()
    ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(18,166,155,0.7)'
    ctx.beginPath(); ctx.moveTo(X(pr), oy); ctx.lineTo(X(pr), Y(pv)); ctx.lineTo(ox, Y(pv)); ctx.stroke()
    ctx.restore()
    setFont(ctx, 8, 'bold'); ctx.fillStyle = C.sub
    ctx.textBaseline = Q > 0 ? 'top' : 'bottom'
    const tickY = Q > 0 ? oy + 4 : oy - 4
    ctx.textAlign = 'left'
    ctx.fillText('0', ox + 2, tickY)
    ctx.textAlign = 'center'
    ctx.fillText('r/cm', ox + pw / 2, tickY)
    ctx.textAlign = 'right'
    ctx.fillText(`${rMax}`, ox + pw, tickY)
    ctx.textBaseline = 'alphabetic'
  }

  // ── Step2：等势线（marching squares） ──
  function levelsOf(charges) {
    const qmax = Math.max(...charges.map((c) => Math.abs(c.Q)), 5)
    const v0 = (K_V * qmax) / 8
    return [-6, -3, -1.6, -0.7, -0.3, 0, 0.3, 0.7, 1.6, 3, 6].map((k) => k * v0)
  }

  function contours(L, charges) {
    const levels = levelsOf(charges)
    const key = `${L.box.x}|${L.box.y}|${L.box.w.toFixed(0)}|${L.box.h.toFixed(0)}|${L.pxPerCm.toFixed(2)}|` +
      charges.map((c) => `${c.id}:${c.Q}:${Math.round(c.x)}:${Math.round(c.y)}`).join('|') + '|' + levels.map((v) => v.toFixed(0)).join(',')
    if (contourCache.current.key !== key) {
      contourCache.current = { key, data: buildContours(charges, L.box, L.pxPerCm, levels) }
    }
    return contourCache.current.data
  }

  function drawContours(ctx, L, charges, { withLabels = false, alpha = 1, probe = null } = {}) {
    const data = contours(L, charges)

    const maxAbs = Math.max(...data.map((d) => Math.abs(d.level)), 1)
    const placed = []
    ctx.save()
    ctx.beginPath(); ctx.rect(L.box.x, L.box.y, L.box.w, L.box.h); ctx.clip()
    for (const d of data) {
      const isZero = Math.abs(d.level) < 1e-6
      const pos = d.level > 0
      const strength = Math.abs(d.level) / maxAbs
      // 完全被电荷球盖住的极小闭环不画（点电荷附近 V 趋于无穷，等值线无意义）
      let nearMin = Infinity
      for (const sg of d.segs) {
        const mx = (sg[0] + sg[2]) / 2, my = (sg[1] + sg[3]) / 2
        for (const c of charges) nearMin = Math.min(nearMin, Math.hypot(mx - c.x, my - c.y))
      }
      if (nearMin < 24) continue
      const lw = isZero ? 1.8 : 1 + strength * 0.9
      const col = isZero
        ? `rgba(62,154,95,${0.85 * alpha})`
        : pos
          ? `rgba(222,69,63,${(0.35 + strength * 0.45) * alpha})`
          : `rgba(44,111,175,${(0.35 + strength * 0.45) * alpha})`
      ctx.strokeStyle = col; ctx.lineWidth = lw
      if (isZero) ctx.setLineDash([7, 5]); else if (!pos) ctx.setLineDash([5, 4])
      ctx.beginPath()
      for (const sg of d.segs) { ctx.moveTo(sg[0], sg[1]); ctx.lineTo(sg[2], sg[3]) }
      ctx.stroke()
      ctx.setLineDash([])
      if (withLabels && d.segs.length) {
        const txt = isZero ? 'V = 0（等势面）' : `${d.level > 0 ? '+' : '−'}${sci(Math.abs(d.level))} V`
        setFont(ctx, 9.5, 'bold')
        const labelW = ctx.measureText(txt).width + 8
        // 候选位置按“离电荷越远越好”排序，再逐个避让电荷球、球下电量牌、探针与边界
        const cands = d.segs.map((sg) => {
          const mx = (sg[0] + sg[2]) / 2, my = (sg[1] + sg[3]) / 2
          let dmin = Infinity
          for (const c of charges) dmin = Math.min(dmin, Math.hypot(mx - c.x, my - c.y))
          return { mx, my, score: isZero ? -Math.abs(my - (L.box.y + 46)) : dmin }
        }).sort((a, b) => b.score - a.score).slice(0, 60)
        let spot = null
        const clearOf = (x0, y0, x1, y1) => {
          if (x0 < L.box.x + 4 || x1 > L.box.x + L.box.w - 4) return false
          if (y0 < L.box.y + 6 || y1 > L.box.y + L.box.h - 6) return false
          for (const r of placed) {
            if (x1 > r[0] - 3 && x0 < r[2] + 3 && y1 > r[1] - 3 && y0 < r[3] + 3) return false
          }
          for (const c of charges) {
            const px2 = clamp(c.x, x0, x1), py2 = clamp(c.y, y0, y1)
            if (Math.hypot(px2 - c.x, py2 - c.y) < BALL_R + 6) return false
            // 球下方“电量牌”区域
            if (x1 > c.x - 30 && x0 < c.x + 30 && y1 > c.y + BALL_R + 3 && y0 < c.y + BALL_R + 24) return false
          }
          if (probe) {
            const px3 = clamp(probe.x, x0, x1), py3 = clamp(probe.y, y0, y1)
            if (Math.hypot(px3 - probe.x, py3 - probe.y) < 22) return false
          }
          return true
        }
        for (const cd of cands) {
          const { mx, my } = cd
          const h = 12
          // 先试“文字在锚点左侧”（向内），再试“右侧”（向外）
          if (clearOf(mx - 5 - labelW, my - h / 2, mx - 5, my + h / 2)) {
            spot = { x: mx - 5, y: my, align: 'right', rect: [mx - 5 - labelW, my - h / 2, mx - 5, my + h / 2] }
            break
          }
          if (clearOf(mx + 5, my - h / 2, mx + 5 + labelW, my + h / 2)) {
            spot = { x: mx + 5, y: my, align: 'left', rect: [mx + 5, my - h / 2, mx + 5 + labelW, my + h / 2] }
            break
          }
        }
        if (!spot) continue
        placed.push(spot.rect)
        setFont(ctx, 9.5, 'bold'); ctx.fillStyle = isZero ? C.zero : pos ? '#A8342C' : '#1E4E7E'
        ctx.textAlign = spot.align; ctx.textBaseline = 'middle'
        ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(255,255,255,0.94)'
        ctx.strokeText(txt, spot.x, spot.y)
        ctx.fillText(txt, spot.x, spot.y)
      }
    }
    ctx.restore()
  }

  function drawStepEquipotential(ctx, L, s) {
    const charges = chargesOf(s, L)
    // 电势热区（红/蓝）用于直观看到“高处高、低处低”
    ctx.save()
    ctx.beginPath(); ctx.rect(L.box.x, L.box.y, L.box.w, L.box.h); ctx.clip()
    for (const c of charges) {
      const g = ctx.createRadialGradient(c.x, c.y, 4, c.x, c.y, 9 * L.pxPerCm)
      const col = c.Q > 0 ? '222,69,63' : '44,111,175'
      g.addColorStop(0, `rgba(${col},0.20)`)
      g.addColorStop(1, `rgba(${col},0)`)
      ctx.fillStyle = g; ctx.fillRect(L.box.x, L.box.y, L.box.w, L.box.h)
    }
    ctx.restore()

    drawContours(ctx, L, charges, { withLabels: true, probe: s.probe })
    for (const c of charges) drawChargeBall(ctx, c, c.Q > 0 ? `+${s.Q}nC` : `−${s.Q}nC`)
    legendChip(ctx, L.box.x + 10, L.box.y + 10, '等势面：红=正电势、蓝=负电势、绿虚线 V=0；越密处场强越大')

    // 探针：V + E 与该点等势面切线垂直
    drawProbeDot(ctx, s.probe)
    const f = fieldFromV(charges, s.probe.x, s.probe.y, L.pxPerCm)
    const eAbs = f.E * 100                       // V/m
    const mag = Math.hypot(f.ex, f.ey) || 1
    const ux = f.ex / mag, uy = f.ey / mag
    const L1 = clamp(40 * Math.pow(eAbs / 2e4, 0.28), 22, 96)
    arrow(ctx, s.probe.x, s.probe.y, s.probe.x + ux * L1, s.probe.y + uy * L1, C.teal, 2.4)
    setFont(ctx, 10.5, 'bold'); ctx.fillStyle = C.tealDark
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText('E', s.probe.x + ux * L1 + uy * 8, s.probe.y + uy * L1 - ux * 8)
    // 等势面切线（⊥ E）
    const tx = -uy, ty = ux
    ctx.save(); ctx.setLineDash([6, 5]); ctx.strokeStyle = 'rgba(62,154,95,0.85)'; ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(s.probe.x - tx * 46, s.probe.y - ty * 46)
    ctx.lineTo(s.probe.x + tx * 46, s.probe.y + ty * 46)
    ctx.stroke(); ctx.restore()
    // 直角标记
    const sq = 11
    ctx.strokeStyle = 'rgba(34,49,58,0.75)'; ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(s.probe.x + ux * sq + tx * sq, s.probe.y + uy * sq + ty * sq)
    ctx.lineTo(s.probe.x + ux * sq, s.probe.y + uy * sq)
    ctx.lineTo(s.probe.x + ux * sq - tx * sq, s.probe.y + uy * sq - ty * sq)
    ctx.stroke()
    setFont(ctx, 9, 'bold'); ctx.fillStyle = 'rgba(62,154,95,0.95)'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('等势面切线', s.probe.x + tx * 74, s.probe.y + ty * 74)
  }

  // ── Step3：电势差与做功 ──
  function pathPoints(s, L) {
    const A = s.aPt, B = s.bPt
    if (s.path === 'straight') {
      const pts = []
      for (let i = 0; i <= 40; i++) pts.push([A.x + ((B.x - A.x) * i) / 40, A.y + ((B.y - A.y) * i) / 40])
      return pts
    }
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2
    const nx = -(B.y - A.y), ny = B.x - A.x
    const nlen = Math.hypot(nx, ny) || 1
    const off = Math.min(L.box.w, L.box.h) * 0.22
    const cx2 = mx + (nx / nlen) * off, cy2 = my + (ny / nlen) * off
    const pts = []
    for (let i = 0; i <= 40; i++) {
      const t = i / 40
      const x = (1 - t) * (1 - t) * A.x + 2 * (1 - t) * t * cx2 + t * t * B.x
      const y = (1 - t) * (1 - t) * A.y + 2 * (1 - t) * t * cy2 + t * t * B.y
      pts.push([x, y])
    }
    return pts
  }

  function drawStepWork(ctx, L, s) {
    const charges = chargesOf(s, L)
    for (const c of charges) {
      const g = ctx.createRadialGradient(c.x, c.y, 4, c.x, c.y, 9 * L.pxPerCm)
      const col = c.Q > 0 ? '222,69,63' : '44,111,175'
      g.addColorStop(0, `rgba(${col},0.16)`); g.addColorStop(1, `rgba(${col},0)`)
      ctx.fillStyle = g; ctx.fillRect(L.box.x, L.box.y, L.box.w, L.box.h)
    }
    drawContours(ctx, L, charges, { withLabels: false, alpha: 0.75 })
    drawChargeBall(ctx, charges[0], charges[0].Q > 0 ? `+${s.Q}nC` : `−${s.Q}nC`)

    // 两条路径（都画出来：W 与路径无关）
    const straight = []
    for (let i = 0; i <= 40; i++) {
      const t = i / 40
      straight.push([s.aPt.x + (s.bPt.x - s.aPt.x) * t, s.aPt.y + (s.bPt.y - s.aPt.y) * t])
    }
    const curve = pathPoints({ ...s, path: 'curve' }, L)
    const drawPath = (pts, active, color, dash) => {
      ctx.save()
      ctx.strokeStyle = color; ctx.lineWidth = active ? 2.2 : 1.4
      ctx.setLineDash(dash)
      ctx.beginPath()
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
      ctx.stroke(); ctx.restore()
    }
    drawPath(straight, s.path === 'straight', s.path === 'straight' ? 'rgba(18,166,155,0.9)' : 'rgba(120,140,150,0.55)', [7, 5])
    drawPath(curve, s.path === 'curve', s.path === 'curve' ? 'rgba(18,166,155,0.9)' : 'rgba(120,140,150,0.55)', [7, 5])

    // A/B 点
    const mk = (p, label, V) => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2)
      ctx.fillStyle = '#fff'; ctx.fill()
      ctx.strokeStyle = C.tealDark; ctx.lineWidth = 2; ctx.stroke()
      setFont(ctx, 11, 'bold'); ctx.fillStyle = C.tealDark
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(label, p.x, p.y)
      setFont(ctx, 9, 'bold'); ctx.fillStyle = C.sub
      ctx.textBaseline = 'top'
      const t = `${sci(V)} V`
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.92)'
      ctx.strokeText(t, p.x, p.y + 12)
      ctx.fillText(t, p.x, p.y + 12)
    }
    const vA = vAt(charges, s.aPt.x, s.aPt.y, L.pxPerCm)
    const vB = vAt(charges, s.bPt.x, s.bPt.y, L.pxPerCm)
    mk(s.aPt, 'A', vA)
    mk(s.bPt, 'B', vB)

    // 运动的试探电荷
    if (s.anim.t > 0) {
      const pts = s.path === 'curve' ? curve : straight
      const idx = clamp(Math.round(s.anim.t * (pts.length - 1)), 0, pts.length - 1)
      const p = { x: pts[idx][0], y: pts[idx][1] }
      if (idx >= pts.length - 1) {
        // 已到达 B：用金色圈标注终点，不再遮住 B 的读值
        ctx.beginPath(); ctx.arc(p.x, p.y, 13, 0, Math.PI * 2)
        ctx.strokeStyle = C.gold; ctx.lineWidth = 2.4; ctx.stroke()
        setFont(ctx, 8.5, 'bold'); ctx.fillStyle = '#8A5A12'
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText('已到 B', p.x, p.y - 22)
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2)
        ctx.fillStyle = C.gold; ctx.fill()
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.stroke()
        setFont(ctx, 9, 'bold'); ctx.fillStyle = '#8A5A12'
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
        ctx.fillText(s.q > 0 ? '+q' : '−q', p.x + 10, p.y - 8)
      }
    }

    const dV = vA - vB
    setFont(ctx, 10, 'bold'); ctx.fillStyle = C.tealDark
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    const mp = straight[Math.floor(straight.length / 2)]
    const lbl = `ΔV = V_A − V_B = ${sci(dV)} V`
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.92)'
    ctx.strokeText(lbl, mp[0], mp[1] - 26)
    ctx.fillText(lbl, mp[0], mp[1] - 26)

    legendChip(ctx, L.box.x + 10, L.box.y + 10, '两条虚线路径：W = qΔV 只与 A、B 位置有关，与走哪条路无关')
  }

  function drawChargeBall(ctx, c, label) {
    const pos = c.Q > 0
    const g = ctx.createRadialGradient(c.x - 4, c.y - 5, 2, c.x, c.y, BALL_R)
    g.addColorStop(0, pos ? '#F27A73' : '#5C93C8')
    g.addColorStop(1, pos ? C.pos : C.neg)
    ctx.beginPath(); ctx.arc(c.x, c.y, BALL_R, 0, Math.PI * 2)
    ctx.fillStyle = g; ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.4; ctx.stroke()
    setFont(ctx, 16, 'bold'); ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(pos ? '+' : '−', c.x, c.y - 0.5)
    setFont(ctx, 10, 'bold')
    ctx.textBaseline = 'top'
    const tw = ctx.measureText(label).width + 12
    const dx = c.x - tw / 2, dy = c.y + BALL_R + 5
    ctx.beginPath(); ctx.roundRect(dx, dy, tw, 17, 8)
    ctx.fillStyle = 'rgba(255,255,255,0.96)'; ctx.fill()
    ctx.strokeStyle = pos ? 'rgba(222,69,63,0.35)' : 'rgba(44,111,175,0.35)'; ctx.lineWidth = 1; ctx.stroke()
    ctx.textAlign = 'center'
    ctx.fillStyle = pos ? '#9E2B26' : '#1E4E7E'
    ctx.fillText(label, c.x, dy + 3)
    ctx.textBaseline = 'alphabetic'
  }

  function drawProbeDot(ctx, p) {
    ctx.beginPath(); ctx.arc(p.x, p.y, 6.5, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'; ctx.fill()
    ctx.strokeStyle = C.teal; ctx.lineWidth = 2; ctx.stroke()
    ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fillStyle = C.teal; ctx.fill()
    setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.tealDark
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText('P', p.x + 9, p.y + 8)
    pushArea({ n: 'probe', x: p.x - 16, y: p.y - 16, w: 32, h: 32, drag: 'probe', cursor: 'grab' })
  }

  function legendChip(ctx, x, y, text) {
    setFont(ctx, 9.5, 'bold')
    const tw = ctx.measureText(text).width + 18
    ctx.beginPath(); ctx.roundRect(x, y, tw, 20, 10)
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill()
    ctx.strokeStyle = '#CFE5E0'; ctx.lineWidth = 1; ctx.stroke()
    ctx.fillStyle = C.tealDark; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText(text, x + 9, y + 10.5)
  }

  // ── 右栏 ──
  function drawPanel(ctx, L, s) {
    const { panel } = L
    const x = panel.x, w = panel.w, y = panel.y, h = panel.h
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 10)
    ctx.fillStyle = C.card; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke()
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'

    const charges = chargesOf(s, L)
    let ky = y + 14
    setFont(ctx, 12, 'bold'); ctx.fillStyle = C.ink
    ctx.fillText(s.step === 3 ? '两点间的电势差' : '探针处的电势', x + 14, ky)
    setFont(ctx, 9); ctx.fillStyle = C.faint
    ctx.fillText(s.step === 3 ? '拖动 A、B 或改 q，观察 W = qΔV' : '拖动白色小圆点 P 改变取样位置', x + 14, ky + 17)

    const vP = vAt(charges, s.probe.x, s.probe.y, L.pxPerCm)
    const vA = vAt(charges, s.aPt.x, s.aPt.y, L.pxPerCm)
    const vB = vAt(charges, s.bPt.x, s.bPt.y, L.pxPerCm)
    ky += 40
    const big = s.step === 3 ? vA - vB : vP
    setFont(ctx, 22, 'bold'); ctx.fillStyle = big >= 0 ? C.pos : C.neg
    ctx.fillText(Math.abs(big) < 1 ? '0' : `${big > 0 ? '+' : '−'}${sci(Math.abs(big))}`, x + 14, ky)
    setFont(ctx, 10, 'bold'); ctx.fillStyle = C.sub
    ctx.fillText('V', x + 148, ky + 10)
    ky += 34

    const rows = []
    if (s.step === 1) {
      const rcm = Math.hypot(s.probe.x - L.cx, s.probe.y - L.cy) / L.pxPerCm
      rows.push(['场源电量 Q', `${s.polarity > 0 ? '+' : '−'}${s.Q} nC`])
      rows.push(['到电荷距离 r', `${rcm.toFixed(1)} cm`])
      rows.push(['V = kQ/r', `${vP >= 0 ? '+' : '−'}${sci(Math.abs(vP))} V`])
      rows.push(['符号', s.polarity > 0 ? '正电荷周围 V>0' : '负电荷周围 V<0'])
    } else if (s.step === 2) {
      const t = termsAt(charges, s.probe.x, s.probe.y, L.pxPerCm)
      const f = fieldFromV(charges, s.probe.x, s.probe.y, L.pxPerCm)
      rows.push(['V₁（+电荷）', `${t.terms[0].v >= 0 ? '+' : ''}${sci(t.terms[0].v)} V`])
      rows.push(['V₂（−电荷）', `${sci(t.terms[1].v)} V`])
      rows.push(['合电势 V₁+V₂', `${sci(t.V)} V`])
      rows.push(['该点场强 E', `${sci(f.E * 100)} V/m`])
    } else {
      const dV = vA - vB
      const W = s.q * dV          // nJ
      const fmtW = (v) => (Math.abs(v) >= 1000 ? `${sci(v / 1000)} μJ` : `${sci(v)} nJ`)
      rows.push(['V_A', `${vA >= 0 ? '+' : '−'}${sci(Math.abs(vA))} V`])
      rows.push(['V_B', `${vB >= 0 ? '+' : '−'}${sci(Math.abs(vB))} V`])
      rows.push(['ΔV = V_A − V_B', `${sci(dV)} V`])
      rows.push(['q', `${s.q > 0 ? '+' : ''}${s.q} nC`])
      rows.push(['W = qΔV', `${W >= 0 ? '+' : '−'}${fmtW(Math.abs(W))}`])
      rows.push(['ΔEp = −W', `${W <= 0 ? '+' : '−'}${fmtW(Math.abs(W))}`])
    }
    for (const [k, v] of rows) {
      setFont(ctx, 9.5); ctx.fillStyle = C.sub
      ctx.fillText(k, x + 14, ky)
      setFont(ctx, 10, 'bold'); ctx.fillStyle = C.ink
      ctx.textAlign = 'right'; fitFont(ctx, v, w - 130, 10, 'bold')
      ctx.fillText(v, x + w - 14, ky)
      ctx.textAlign = 'left'
      ky += 16
    }

    // 结论条
    ky += 8
    ctx.strokeStyle = '#EDF2F5'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(x + 12, ky); ctx.lineTo(x + w - 12, ky); ctx.stroke()
    ky += 10
    const headline = s.step === 1
      ? (vP > 0 ? '该点电势为正：正的“电位”' : '该点电势为负：负电荷把“电位”拉低')
      : s.step === 2
        ? '沿等势面平移电荷，电场力不做功（ΔV=0）'
        : `电场力做功 W = qΔV = ${Math.abs(s.q * (vA - vB)) >= 1000 ? `${sci(s.q * (vA - vB) / 1000)} μJ` : `${sci(s.q * (vA - vB))} nJ`}（与路径无关）`
    setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.tealDark
    fitFont(ctx, headline, w - 28, 9.5, 'bold')
    ctx.fillText(headline, x + 14, ky)

    // 说明卡
    const cardY = Math.min(ky + 30, y + h - 176)
    ctx.beginPath(); ctx.roundRect(x + 12, cardY, w - 24, 158, 8)
    ctx.fillStyle = '#F6FBF9'; ctx.fill()
    ctx.strokeStyle = '#DCEBE7'; ctx.lineWidth = 1; ctx.stroke()
    setFont(ctx, 10, 'bold'); ctx.fillStyle = C.tealDark
    ctx.fillText(s.step === 1 ? '点电荷的电势' : s.step === 2 ? '等势面与电势' : '电势差与电场力做功', x + 24, cardY + 12)
    const bullets = s.step === 1 ? [
      '• V = kQ/r：r 越小 V 越大（越靠电荷越高）',
      '• V 是标量：有正负，无方向',
      '• 电势零点取在无穷远（V∞ = 0）',
      '• 多个电荷：V = V₁ + V₂（代数相加）',
      '• 等势面是同心球面，图上是同心圆',
    ] : s.step === 2 ? [
      '• 同一等势面上各点 V 相同',
      '• 等势面 ⊥ 电场线（探针处可见直角）',
      '• 沿等势面移动电荷：W = qΔV = 0',
      '• 等势面越密 → 该处场强越大',
      '• V=0 面（绿虚线）：两电荷中间的平面',
    ] : [
      '• ΔV = V_A − V_B，与零电势点选择无关',
      '• W = qΔV：只由始末位置决定',
      '• 沿不同路径 W 相同（保守场）',
      '• 正电荷：高 → 低，W > 0；负电荷相反',
      '• 电势能 Ep = qV，ΔEp = −W',
    ]
    setFont(ctx, 9); ctx.fillStyle = C.sub
    bullets.forEach((t, i) => {
      fitFont(ctx, t, w - 52, 9)
      ctx.fillText(t, x + 24, cardY + 32 + i * 20)
    })
    ctx.textBaseline = 'alphabetic'
  }

  // ── 工具条 ──
  function drawToolbar(ctx, W, L, s) {
    const T = L.toolbar
    ctx.beginPath(); ctx.roundRect(T.x, T.y, T.w, T.h, 10)
    ctx.fillStyle = C.card; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke()
    const rowY = T.y + 22
    let bx = T.x + 20

    const sliderBlock = (label, valueTxt, ratio, name, onChange, accent) => {
      setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.ink
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText(label, bx, rowY - 12)
      setFont(ctx, 10, 'bold'); ctx.fillStyle = accent || C.tealDark
      ctx.textAlign = 'right'
      ctx.fillText(valueTxt, bx + 150, rowY - 12)
      ctx.textAlign = 'left'
      drawSlider(ctx, { x: bx, y: rowY + 8, w: 150, ratio, accent, name, onChange })
      bx += 178
    }

    sliderBlock('场源电量 Q', `${s.polarity > 0 ? '+' : '−'}${s.Q} nC`, (s.Q - 10) / 90, 'qSlider', (r) => {
      S.current.Q = Math.round(10 + r * 90)
      S.current.ready = false
      contourCache.current.key = ''
    }, s.polarity > 0 ? C.pos : C.neg)
    if (s.step === 1) {
      drawBtn(ctx, bx, rowY - 16, 62, 26, s.polarity > 0 ? '正电荷' : '负电荷', 'plain', () => {
        S.current.polarity = -S.current.polarity
        contourCache.current.key = ''
        say(`场源切换为${S.current.polarity > 0 ? '正电荷（V>0）' : '负电荷（V<0）'}`)
      }, 'polarityBtn')
      bx += 70
    }
    if (s.step === 3) {
      sliderBlock('试探电荷 q', `${s.q > 0 ? '+' : ''}${s.q} nC`, (s.q + 8) / 16, 'testQSlider', (r) => {
        S.current.q = Math.round(-8 + r * 16)
      }, C.gold)
      drawBtn(ctx, bx, rowY - 16, 70, 26, s.path === 'curve' ? '路径② 弯' : '路径① 直', 'plain', () => {
        S.current.path = S.current.path === 'curve' ? 'straight' : 'curve'
        S.current.anim.t = 0
      }, 'pathBtn')
      bx += 78
      drawBtn(ctx, bx, rowY - 16, 62, 26, s.anim.playing ? '▶ 运动中' : '▶ 播放', 'primary', () => {
        S.current.anim.playing = true
        S.current.anim.t = 0
        S.current.anim.start = performance.now()
      }, 'playBtn')
      bx += 70
    }
    drawBtn(ctx, bx, rowY - 16, 62, 26, '↺ 重置', 'ghost', () => {
      const st = S.current
      st.Q = 30; st.polarity = 1; st.q = 4; st.path = 'curve'
      st.anim = { playing: false, t: 0, start: 0 }
      st.ready = false; st.abReady = false
      contourCache.current.key = ''
      say('已恢复初始状态')
    }, 'resetBtn')

    setFont(ctx, 8.5); ctx.fillStyle = C.faint
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    const hint = s.step === 1
      ? 'V=kQ/r 与 E=kQ/r² 形式相近但不同：电势按 r 的 1 次方衰减，场强按 2 次方衰减'
      : s.step === 2
        ? '等势面由 V 场求等值线得到（marching squares）：越靠电荷越密，说明那里场强越大'
        : 'A→B 无论走直线还是弯线，W=qΔV 都相同 —— 静电场是保守场，只与始末位置有关'
    fitFont(ctx, hint, T.w - 60, 8.5)
    ctx.fillText(hint, T.x + 20, T.y + 52)
    ctx.textBaseline = 'alphabetic'
  }

  function drawSlider(ctx, { x, y, w, ratio, onChange, accent, name }) {
    const ac = accent || C.teal
    ctx.beginPath(); ctx.roundRect(x, y - 3, w, 6, 3); ctx.fillStyle = '#DCE4E8'; ctx.fill()
    ctx.beginPath(); ctx.roundRect(x, y - 3, Math.max(3, clamp(ratio, 0, 1) * w), 6, 3); ctx.fillStyle = ac; ctx.fill()
    const kx = x + clamp(ratio, 0, 1) * w
    ctx.beginPath(); ctx.arc(kx, y, 6.5, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = ac; ctx.lineWidth = 1.6; ctx.stroke()
    pushArea({ n: name || 'slider', x: x - 10, y: y - 14, w: w + 20, h: 28, drag: 'slider', setX: (mx) => onChange(clamp((mx - x) / w, 0, 1)) })
  }

  function drawBtn(ctx, x, y, w, h, label, tone, onClick, name) {
    const t = {
      primary: { bg: C.teal, bd: C.tealDark, fg: '#fff' },
      plain: { bg: '#F3F8F9', bd: '#D2E1E6', fg: '#205863' },
      ghost: { bg: '#F6F7F8', bd: '#DDE3E6', fg: '#7A8A92' },
    }[tone] || { bg: '#fff', bd: '#ddd', fg: '#333' }
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 7)
    ctx.fillStyle = t.bg; ctx.fill(); ctx.strokeStyle = t.bd; ctx.lineWidth = 1; ctx.stroke()
    setFont(ctx, 10, 'bold'); ctx.fillStyle = t.fg
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    fitFont(ctx, label, w - 10, 10, 'bold')
    ctx.fillText(label, x + w / 2, y + h / 2 + 0.5)
    pushArea({ n: name || 'btn', x, y, w, h, onClick })
    ctx.textBaseline = 'alphabetic'
  }

  function drawToast(ctx, W, s) {
    if (!s.toast || Date.now() > s.toast.until) return
    const text = s.toast.text
    setFont(ctx, 11, 'bold')
    const tw = ctx.measureText(text).width + 30
    const x = (W - tw) / 2, y = (ctx.canvas.height / devicePixelRatio) - 168
    ctx.beginPath(); ctx.roundRect(x, y, tw, 26, 13)
    ctx.fillStyle = 'rgba(24,40,48,0.92)'; ctx.fill()
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(text, W / 2, y + 13)
    ctx.textBaseline = 'alphabetic'
  }

  // ═════════════════════════════════════════════
  //  Tab 2 自己动手
  // ═════════════════════════════════════════════
  function diyGeom(W, H) {
    const palW = 176, palX = W - palW - 12
    const org = { x: 14, y: 56 }
    const aw = palX - 12 - org.x, ah = H - 24 - org.y
    const sc = clamp(Math.min(aw / 980, ah / 620), 1, 1.5)
    const area = { x1: aw / sc, y1: ah / sc }
    return { palW, palX, org, sc, area, pxPerCm: clamp(area.x1 / 30, 5, 12) }
  }

  function renderDiy(ctx, W, H) {
    const s = S.current, dy = s.diy
    const A = diyGeom(W, H)
    if (!dy.ready) { dy.probe = { x: A.area.x1 * 0.52, y: A.area.y1 * 0.42 }; dy.ready = true }

    setFont(ctx, 13, 'bold'); ctx.fillStyle = C.ink
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('自己动手 · 布电荷看电势叠加', A.org.x + 4, 14)
    setFont(ctx, 10); ctx.fillStyle = C.sub
    ctx.fillText('点右侧器材再点画布落电荷；电荷可拖动、右键删除；点选电荷可改电量。拖动探针读合电势 V=V₁+V₂+…（标量相加）', A.org.x + 4, 33)

    ctx.save(); ctx.translate(A.org.x, A.org.y); ctx.scale(A.sc, A.sc)
    ctx.beginPath(); ctx.roundRect(0, 0, A.area.x1, A.area.y1, 10)
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#E7EEF2'; ctx.lineWidth = 1; ctx.stroke()
    ctx.fillStyle = 'rgba(140,165,175,0.2)'
    for (let x = 14; x < A.area.x1; x += 26) {
      for (let y = 14; y < A.area.y1; y += 26) { ctx.beginPath(); ctx.arc(x, y, 0.9, 0, Math.PI * 2); ctx.fill() }
    }
    if (dy.charges.length) {
      for (const c of dy.charges) {
        const g = ctx.createRadialGradient(c.x, c.y, 4, c.x, c.y, 8 * A.pxPerCm)
        const col = c.Q > 0 ? '222,69,63' : '44,111,175'
        g.addColorStop(0, `rgba(${col},0.18)`); g.addColorStop(1, `rgba(${col},0)`)
        ctx.fillStyle = g; ctx.fillRect(0, 0, A.area.x1, A.area.y1)
      }
      drawContours(ctx, L0(A), dy.charges, { withLabels: false })
      for (const c of dy.charges) {
        drawChargeBall(ctx, c, `${c.Q > 0 ? '+' : ''}${c.Q}nC`)
        if (dy.sel === c.id) {
          ctx.beginPath(); ctx.arc(c.x, c.y, BALL_R + 8, 0, Math.PI * 2)
          ctx.strokeStyle = C.gold; ctx.lineWidth = 2.4; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([])
        }
      }
      const t = termsAt(dy.charges, dy.probe.x, dy.probe.y, A.pxPerCm)
      drawDiyProbe(ctx, dy.probe, t.V)
      drawDiyReadout(ctx, A, t)
    } else {
      setFont(ctx, 12); ctx.fillStyle = C.faint
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('从右侧器材区点「正电荷」或「负电荷」，再点画布任意位置放入', A.area.x1 / 2, A.area.y1 / 2)
      ctx.textBaseline = 'alphabetic'
    }
    ctx.restore()

    drawDiyPalette(ctx, A, W, H, s)
    if (dy.hold) {
      ctx.save(); ctx.globalAlpha = 0.85
      drawDiyIcon(ctx, dy.mx || 0, dy.my || 0, dy.hold, 1.4)
      ctx.restore()
    }
    drawToast(ctx, W, s)
    pushArea({ n: 'diyStage', x: A.org.x, y: A.org.y, w: A.area.x1 * A.sc, h: A.area.y1 * A.sc })
  }

  // DIY 里借用 L 结构（box 与缩放）
  function L0(A) {
    return { box: { x: 6, y: 6, w: A.area.x1 - 12, h: A.area.y1 - 12 }, pxPerCm: A.pxPerCm }
  }

  function drawDiyProbe(ctx, p, V) {
    ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = C.teal; ctx.lineWidth = 2; ctx.stroke()
    ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fillStyle = C.teal; ctx.fill()
    setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.tealDark
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText('P', p.x + 9, p.y + 8)
    setFont(ctx, 9, 'bold'); ctx.fillStyle = Math.abs(V) < 1 ? C.sub : V >= 0 ? '#A8342C' : '#1E4E7E'
    const txt = Math.abs(V) < 1 ? 'V=0V' : `V=${V >= 0 ? '+' : '−'}${sci(Math.abs(V))}V`
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.92)'
    ctx.strokeText(txt, p.x + 10, p.y - 12)
    ctx.fillText(txt, p.x + 10, p.y - 12)
  }

  function drawDiyReadout(ctx, A, t) {
    const w = 196, h = 74
    const x = 12, y = A.area.y1 - h - 12
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8)
    ctx.fillStyle = 'rgba(246,251,249,0.96)'; ctx.fill()
    ctx.strokeStyle = '#DCEBE7'; ctx.lineWidth = 1; ctx.stroke()
    setFont(ctx, 8.5); ctx.fillStyle = C.sub
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('探针处合电势（标量相加）', x + 10, y + 7)
    setFont(ctx, 14, 'bold'); ctx.fillStyle = t.V >= 0 ? C.pos : C.neg
    ctx.fillText(Math.abs(t.V) < 1 ? '0 V' : `${t.V >= 0 ? '+' : '−'}${sci(Math.abs(t.V))} V`, x + 10, y + 20)
    setFont(ctx, 8); ctx.fillStyle = C.faint
    const expr = t.terms.map((tt, i) => `${i ? (tt.v >= 0 ? ' + ' : ' − ') : ''}${sci(Math.abs(tt.v))}`).join('')
    fitFont(ctx, `V = ${expr}`, w - 20, 8)
    ctx.fillText(`V = ${expr}`, x + 10, y + 42)
    ctx.fillText(`共 ${t.terms.length} 个电荷贡献（标量和）`, x + 10, y + 56)
  }

  function drawDiyIcon(ctx, x, y, type, k = 1) {
    ctx.save(); ctx.translate(x, y)
    const pos = type === 'pos'
    const g = ctx.createRadialGradient(-3 * k, -4 * k, 1, 0, 0, 9 * k)
    g.addColorStop(0, pos ? '#F27A73' : '#5C93C8')
    g.addColorStop(1, pos ? C.pos : C.neg)
    ctx.beginPath(); ctx.arc(0, 0, 9 * k, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill()
    setFont(ctx, 12 * k, 'bold'); ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(pos ? '+' : '−', 0, -0.5)
    ctx.restore()
  }

  function drawDiyPalette(ctx, A, W, H, s) {
    const dy = s.diy
    const x = A.palX, w = A.palW, y = 12, h = H - 24
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 10)
    ctx.fillStyle = C.card; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke()
    setFont(ctx, 11.5, 'bold'); ctx.fillStyle = C.ink
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('器材区', x + 12, y + 12)

    const cards = [
      { type: 'pos', name: '正电荷 +Q', hint: '电势升高' },
      { type: 'neg', name: '负电荷 −Q', hint: '电势降低' },
    ]
    cards.forEach((c, i) => {
      const cy = y + 34 + i * 56
      const hot = dy.hold === c.type
      ctx.beginPath(); ctx.roundRect(x + 8, cy, w - 16, 48, 8)
      ctx.fillStyle = '#FFFFFF'; ctx.fill()
      ctx.strokeStyle = hot ? C.teal : '#E1E8EB'; ctx.lineWidth = hot ? 2 : 1; ctx.stroke()
      drawDiyIcon(ctx, x + 26, cy + 26, c.type)
      setFont(ctx, 10, 'bold'); ctx.fillStyle = C.ink
      ctx.fillText(c.name, x + 44, cy + 14)
      setFont(ctx, 8.5); ctx.fillStyle = C.faint
      ctx.fillText(c.hint, x + 44, cy + 30)
      pushArea({ n: `diyPart:${c.type}`, x: x + 8, y: cy, w: w - 16, h: 48, holdType: c.type, cursor: 'pointer' })
    })

    let ky = y + 34 + 112 + 8
    setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.sub
    ctx.fillText('快速预设', x + 12, ky)
    ky += 16
    const presets = [
      { k: 'single', label: '单个正电荷' },
      { k: 'neg', label: '单个负电荷' },
      { k: 'dipole', label: '等量异号' },
      { k: 'same', label: '同号双电荷' },
      { k: 'trio', label: '三点电荷（+−+）' },
    ]
    presets.forEach((p, i) => {
      drawBtn(ctx, x + 8, ky + i * 30, w - 16, 26, p.label, 'plain', () => applyPreset(p.k, A), `preset:${p.k}`)
    })
    ky += presets.length * 30 + 6

    if (dy.sel != null) {
      const c = dy.charges.find((cc) => cc.id === dy.sel)
      if (c) {
        ctx.strokeStyle = '#EDF2F5'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(x + 10, ky); ctx.lineTo(x + w - 10, ky); ctx.stroke()
        ky += 10
        setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.ink
        ctx.fillText(`选中 · ${c.Q > 0 ? '正' : '负'} ${Math.abs(c.Q)} nC`, x + 12, ky)
        ky += 18
        setFont(ctx, 9, 'bold'); ctx.fillStyle = C.sub
        ctx.fillText('电量', x + 12, ky)
        ctx.textAlign = 'right'; ctx.fillStyle = c.Q > 0 ? C.pos : C.neg
        ctx.fillText(`${c.Q > 0 ? '+' : '−'}${Math.abs(c.Q)} nC`, x + w - 12, ky)
        ctx.textAlign = 'left'
        ky += 12
        drawSlider(ctx, {
          x: x + 12, y: ky + 8, w: w - 24, ratio: (Math.abs(c.Q) - 5) / 55,
          accent: c.Q > 0 ? C.pos : C.neg, name: 'diyQ',
          onChange: (r) => {
            const st = S.current
            const cc = st.diy.charges.find((tt) => tt.id === st.diy.sel)
            if (!cc) return
            const mag = Math.round(5 + r * 55)
            cc.Q = cc.Q > 0 ? mag : -mag
          },
        })
        ky += 26
        drawBtn(ctx, x + 8, ky, (w - 22) / 2, 24, '切换正负', 'plain', () => {
          const st = S.current
          const cc = st.diy.charges.find((tt) => tt.id === st.diy.sel)
          if (cc) cc.Q = -cc.Q
        }, 'diyFlip')
        drawBtn(ctx, x + 14 + (w - 22) / 2, ky, (w - 22) / 2, 24, '删除', 'ghost', () => {
          const st = S.current
          st.diy.charges = st.diy.charges.filter((tt) => tt.id !== st.diy.sel)
          st.diy.sel = null
        }, 'diyDel')
      }
    } else {
      ctx.strokeStyle = '#EDF2F5'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(x + 10, ky); ctx.lineTo(x + w - 10, ky); ctx.stroke()
      ky += 10
      setFont(ctx, 9); ctx.fillStyle = C.faint
      ctx.textAlign = 'left'
      fitFont(ctx, '单击画布中的电荷可改电量与正负', w - 24, 9)
      ctx.fillText('单击画布中的电荷可改电量与正负', x + 12, ky)
    }

    // 使用提示（放在“清空场地”上方的空白处）
    const tipY = y + h - 172
    ctx.beginPath(); ctx.roundRect(x + 8, tipY, w - 16, 126, 8)
    ctx.fillStyle = '#F6FBF9'; ctx.fill()
    ctx.strokeStyle = '#DCEBE7'; ctx.lineWidth = 1; ctx.stroke()
    setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.tealDark
    ctx.textAlign = 'left'
    ctx.fillText('这样做', x + 18, tipY + 9)
    const tips = [
      '① 点上方器材 → 再点画布落位',
      '② 拖 P 探针 → 读该点合电势',
      '③ 单击电荷 → 改电量 / 换正负',
      '④ 右键电荷 → 直接删除',
      '⑤ 拖电荷 → 看等势面实时重算',
    ]
    setFont(ctx, 8.5); ctx.fillStyle = C.sub
    tips.forEach((t, i) => {
      fitFont(ctx, t, w - 40, 8.5)
      ctx.fillText(t, x + 18, tipY + 28 + i * 19)
    })

    drawBtn(ctx, x + 8, y + h - 38, w - 16, 26, '🧹 清空场地', 'ghost', () => {
      S.current.diy.charges = []
      S.current.diy.sel = null
      say('场地已清空')
    }, 'diyClear')
  }

  function applyPreset(kind, A) {
    const dy = S.current.diy
    const cx = A.area.x1 / 2, cy = A.area.y1 / 2
    const d = Math.min(A.area.x1, A.area.y1) * 0.22
    const mk = (x, y, Q) => ({ id: S.current.nextId++, x, y, Q })
    if (kind === 'single') dy.charges = [mk(cx, cy, 30)]
    else if (kind === 'neg') dy.charges = [mk(cx, cy, -30)]
    else if (kind === 'dipole') dy.charges = [mk(cx - d, cy, 25), mk(cx + d, cy, -25)]
    else if (kind === 'same') dy.charges = [mk(cx - d, cy, 25), mk(cx + d, cy, 25)]
    else dy.charges = [mk(cx - d, cy - d, 25), mk(cx + d, cy - d, -25), mk(cx, cy + d * 0.9, 25)]
    dy.sel = null
    dy.ready = true
    // 预设载入后把探针放到有对比的位置（两电荷之间偏上 / 单电荷的旁侧）
    if (kind === 'single' || kind === 'neg') dy.probe = { x: cx + d * 1.35, y: cy - d * 0.5 }
    else dy.probe = { x: cx + d * 0.42, y: cy - d * 1.15 }
    contourCache.current.key = ''
    say('已载入预设，可拖动探针看各点合电势')
  }

  // ═════════════════════════════════════════════
  //  交互
  // ═════════════════════════════════════════════
  function getPos(e) { return eventToCanvas(canvasRef.current, e) }
  const hit = (a, x, y) => x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h

  function handleMouseDown(e) {
    if (e.button !== 0) return
    const s = S.current
    const { x, y } = getPos(e)
    const areas = canvasRef.current._clickAreas || []

    if (s.tab === 1) {
      for (const a of areas) {
        if (!hit(a, x, y)) continue
        if (a.drag === 'probe') { s.drag = 'probe'; return }
        if (a.drag === 'slider') { s.dragSlider = a; a.setX(x); return }
        if (a.onClick) { a.onClick(); return }
      }
      if (s.step === 3) {
        for (const key of ['aPt', 'bPt']) {
          const p = s[key]
          if (Math.hypot(x - p.x, y - p.y) < 14) { s.drag = key; s.anim = { playing: false, t: 0, start: 0 }; return }
        }
      }
      return
    }

    // Tab2
    const dy = s.diy
    for (const a of areas) {
      if (!hit(a, x, y)) continue
      if (a.holdType) { dy.hold = a.holdType; dy.mx = x; dy.my = y; return }
      if (a.drag === 'slider') { s.dragSlider = a; a.setX(x); return }
      if (a.n === 'diyStage') continue
      if (a.onClick) { a.onClick(); return }
    }
    const A = diyGeom(canvasRef.current._R.W, canvasRef.current._R.H)
    const Pt = { x: (x - A.org.x) / A.sc, y: (y - A.org.y) / A.sc }
    if (dy.hold) {
      const Q = dy.hold === 'pos' ? 20 : -20
      const c = { id: s.nextId++, x: Pt.x, y: Pt.y, Q }
      dy.charges.push(c)
      dy.sel = c.id
      dy.hold = null
      contourCache.current.key = ''
      say(`已放入${Q > 0 ? '正' : '负'}电荷 ${Math.abs(Q)} nC`)
      return
    }
    if (Math.hypot(Pt.x - dy.probe.x, Pt.y - dy.probe.y) < 14) { dy.drag = 'probe'; return }
    const picked = [...dy.charges].reverse().find((c) => Math.hypot(Pt.x - c.x, Pt.y - c.y) < BALL_R + 8)
    if (picked) { dy.sel = picked.id; dy.drag = 'charge'; s.dragOff = { x: Pt.x - picked.x, y: Pt.y - picked.y }; return }
    dy.sel = null
  }

  function handleMouseMove(e) {
    const s = S.current
    const { x, y } = getPos(e)
    if (s.tab === 1) {
      const L = makeLayout(canvasRef.current._R.W, canvasRef.current._R.H)
      if (s.drag === 'probe') {
        s.probe = { x: clamp(x, L.box.x + 8, L.box.x + L.box.w - 8), y: clamp(y, L.box.y + 8, L.box.y + L.box.h - 8) }
        return
      }
      if (s.drag === 'aPt' || s.drag === 'bPt') {
        const p = { x: clamp(x, L.box.x + 14, L.box.x + L.box.w - 14), y: clamp(y, L.box.y + 14, L.box.y + L.box.h - 14) }
        s[s.drag] = p
        return
      }
      if (s.dragSlider) s.dragSlider.setX(x)
      return
    }
    const dy = s.diy
    if (dy.hold) { dy.mx = x; dy.my = y; return }
    const R = canvasRef.current._R
    if (!R) return
    const A = diyGeom(R.W, R.H)
    const Pt = { x: (x - A.org.x) / A.sc, y: (y - A.org.y) / A.sc }
    if (dy.drag === 'probe') {
      dy.probe = { x: clamp(Pt.x, 8, A.area.x1 - 8), y: clamp(Pt.y, 8, A.area.y1 - 8) }
      return
    }
    if (dy.drag === 'charge') {
      const c = dy.charges.find((tt) => tt.id === dy.sel)
      if (c) {
        c.x = clamp(Pt.x - (s.dragOff?.x || 0), 14, A.area.x1 - 14)
        c.y = clamp(Pt.y - (s.dragOff?.y || 0), 14, A.area.y1 - 14)
        contourCache.current.key = ''
      }
      return
    }
    if (s.dragSlider) s.dragSlider.setX(x)
  }

  function handleMouseUp() {
    const s = S.current
    s.drag = null; s.dragSlider = null
    s.diy.drag = null
    contourCache.current.key = ''
  }
  function handleDoubleClick() {}

  function handleContextMenu(e) {
    e.preventDefault()
    const s = S.current
    if (s.tab !== 2) return
    const { x, y } = getPos(e)
    const R = canvasRef.current._R
    const A = diyGeom(R.W, R.H)
    const Pt = { x: (x - A.org.x) / A.sc, y: (y - A.org.y) / A.sc }
    const idx = s.diy.charges.findIndex((c) => Math.hypot(Pt.x - c.x, Pt.y - c.y) < BALL_R + 8)
    if (idx >= 0) {
      s.diy.charges.splice(idx, 1)
      s.diy.sel = null
      contourCache.current.key = ''
      say('电荷已删除')
    }
  }

  return (
    <SceneShell
      title="电势与电势差"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t); contourCache.current.key = ''; forceUpdate(n => n + 1) }}
      tab1Label="📊 实验演示"
      tab2Label="🔧 自己动手"
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} />
    </SceneShell>
  )
}
