import { useState, useRef, useEffect } from 'react'
import { eventToCanvas } from '../utils/pointerPos'
import SceneShell from '../ui/SceneShell'

/**
 * ElectricFieldLineScene — 电场线与电场强度
 *
 * 物理口径：
 *   E = kQ/r²（点电荷）        E 单位 V/m，Q 单位 nC，r 单位 cm
 *   E = E₁ + E₂（矢量叠加）
 *   E = U/d（平行板内匀强场）
 *   F = qE（试探电荷受力；E 与 q 无关）
 *
 * 电场线由场强方向数值积分（RK4）追踪，疏密自然反映场强大小。
 */

const K_E = 9e4                     // E(V/m) = 9e4 · Q(nC) / r(cm)²
const BALL_R = 13                   // 电荷圆半径（px）
const FONT = '"PingFang SC","Microsoft YaHei",system-ui,-apple-system,sans-serif'

const C = {
  bg: '#EDF2F5', card: '#FFFFFF', line: '#DFE8EC', teal: '#12A69B', tealDark: '#0B7F77',
  tealSoft: '#E6F4F2', pos: '#DE453F', posSoft: '#FDEDEC', neg: '#2C6FAF', negSoft: '#EAF1F8',
  gold: '#E2A33C', ink: '#22313A', sub: '#5D7079', faint: '#93A5AD',
}

const STEPS = [
  { key: 1, label: '① 点电荷', sub: '点电荷的电场线沿半径方向：正电荷向外发散、负电荷向内汇聚；场强 E = kQ/r²，越远越疏（越小）' },
  { key: 2, label: '② 电偶极子', sub: '等量异号电荷：电场线从正电荷出发、终止于负电荷；两电荷之间最密（场强最大），远处电场渐弱' },
  { key: 3, label: '③ 平行板', sub: '平行板之间是匀强电场：电场线平行等距、垂直于极板，E = U/d；板外几乎为零，边缘处电场线弯曲（边缘效应）' },
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
function sciText(v, digits = 2) {
  if (!isFinite(v) || v === 0) return '0'
  const e = Math.floor(Math.log10(Math.abs(v)))
  const m = v / Math.pow(10, e)
  if (e >= -2 && e <= 3) return v.toFixed(e >= 1 ? 0 : digits)
  return `${m.toFixed(digits)}×10${supNum(e)}`
}

// ─── 场计算 ───
function fieldAt(charges, px, py, pxPerCm) {
  let ex = 0, ey = 0, near = null, nearD = 1e9
  for (const c of charges) {
    const dx = px - c.x, dy = py - c.y
    const rpx = Math.max(1.2, Math.hypot(dx, dy))
    const rcm = rpx / pxPerCm
    const mag = (K_E * c.Q) / (rcm * rcm)
    ex += mag * (dx / rpx)
    ey += mag * (dy / rpx)
    if (rpx < nearD) { nearD = rpx; near = c }
  }
  return { ex, ey, E: Math.hypot(ex, ey), near, nearCm: near ? nearD / pxPerCm : 0 }
}

function unitField(charges, x, y, pxPerCm, dir) {
  const f = fieldAt(charges, x, y, pxPerCm)
  const m = Math.hypot(f.ex, f.ey)
  if (m < 1e-6) return [0, 0, 0]
  return [(f.ex / m) * dir, (f.ey / m) * dir, m]
}

// RK4 追踪一条电场线
function traceLine(charges, sx, sy, dir, box, pxPerCm) {
  const pts = [[sx, sy]]
  let x = sx, y = sy
  const h = 2.8
  const endAt = []
  for (let i = 0; i < 1400; i++) {
    const [k1x, k1y] = unitField(charges, x, y, pxPerCm, dir)
    if (!k1x && !k1y) break
    const [k2x, k2y] = unitField(charges, x + (h / 2) * k1x, y + (h / 2) * k1y, pxPerCm, dir)
    const [k3x, k3y] = unitField(charges, x + (h / 2) * k2x, y + (h / 2) * k2y, pxPerCm, dir)
    const [k4x, k4y] = unitField(charges, x + h * k3x, y + h * k3y, pxPerCm, dir)
    const nx = x + (h / 6) * (k1x + 2 * k2x + 2 * k3x + k4x)
    const ny = y + (h / 6) * (k1y + 2 * k2y + 2 * k3y + k4y)
    if (nx < box.x - 2 || nx > box.x + box.w + 2 || ny < box.y - 2 || ny > box.y + box.h + 2) {
      pts.push([nx, ny]); break
    }
    x = nx; y = ny
    pts.push([x, y])
    // 落入异性电荷 → 终止
    for (const c of charges) {
      if (Math.hypot(x - c.x, y - c.y) < BALL_R + 2.5) { endAt.push(c); break }
    }
    if (endAt.length) break
  }
  return { pts, endAt: endAt[0] || null }
}

function seedLines(charges, box, pxPerCm) {
  const pos = charges.filter((c) => c.Q > 0)
  const neg = charges.filter((c) => c.Q < 0)
  const lines = []
  const mk = (c, dir) => {
    const n = clamp(Math.round(Math.abs(c.Q) / 4) * 2, 8, 40)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.16
      const sx = c.x + Math.cos(a) * (BALL_R + 3)
      const sy = c.y + Math.sin(a) * (BALL_R + 3)
      const tr = traceLine(charges, sx, sy, dir, box, pxPerCm)
      if (tr.pts.length > 3) lines.push({ ...tr, from: c, dir })
    }
  }
  // 有正电荷就从正电荷向外追踪；全是负电荷时反向追踪（线与无穷远相接）
  if (pos.length) pos.forEach((c) => mk(c, 1))
  else neg.forEach((c) => mk(c, -1))
  return lines
}

function drawFieldLines(ctx, lines, pxPerCm) {
  ctx.save()
  ctx.lineCap = 'round'
  for (const ln of lines) {
    const pts = ln.pts
    const p0 = pts[0], p1 = pts[pts.length - 1]
    const gd = ctx.createLinearGradient(p0[0], p0[1], p1[0], p1[1])
    const endsAtNeg = ln.endAt && ln.endAt.Q < 0
    gd.addColorStop(0, 'rgba(222,69,63,0.85)')
    gd.addColorStop(1, endsAtNeg ? 'rgba(44,111,175,0.85)' : 'rgba(222,69,63,0.32)')
    ctx.strokeStyle = gd; ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
    ctx.stroke()

    // 沿线等距箭头（离电荷太近不放，避免箭头堆叠）
    let acc = 0
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i]
      acc += Math.hypot(bx - ax, by - ay)
      if (acc > 104) {
        acc = 0
        arrowHead(ctx, bx, by, bx - ax, by - ay, endsAtNeg ? 'rgba(44,111,175,0.9)' : 'rgba(200,52,46,0.9)', 5.6)
      }
    }
  }
  ctx.restore()
  void pxPerCm
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
  const dx = x1 - x0, dy = y1 - y0
  const L = Math.hypot(dx, dy)
  if (L < 6) return
  const ux = dx / L, uy = dy / L
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - ux * 7, y1 - uy * 7); ctx.stroke()
  ctx.lineCap = 'butt'
  arrowHead(ctx, x1, y1, ux, uy, color, width * 2.2)
}

function makeLayout(W, H) {
  const stage = { x0: 24, x1: Math.max(W * 0.56, W - 300), y0: 76, y1: H - 126 }
  const panel = { x: W - 282, y: 76, w: 262, h: stage.y1 - 76 }
  const box = { x: stage.x0 + 16, y: stage.y0 + 16, w: stage.x1 - stage.x0 - 32, h: stage.y1 - stage.y0 - 32 }
  const pxPerCm = clamp(Math.min(box.w / 58, box.h / 34), 5, 14)
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2
  const toolbar = { x: 14, y: H - 112, w: W - 28, h: 88 }
  return { stage, panel, box, pxPerCm, cx, cy, toolbar }
}

export default function ElectricFieldLineScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const lineCache = useRef({ key: '', lines: [] })

  const S = useRef({
    tab: 1,
    step: 1,
    polarity: 1,          // 点电荷正负
    Q: 20,                // 场源电量 nC
    plateU: 300,          // 平行板电压 V
    plateD: 3,            // 板距 cm
    q: 4,                 // 试探电荷 nC（可正可负，0 = 关）
    eq: false,            // 等势面
    probe: { x: 0, y: 0 },
    probeReady: false,
    dragProbe: false,
    toast: null,
    // Tab2
    diy: { charges: [], hold: null, sel: null, probe: { x: 0, y: 0 }, ready: false, drag: null },
    nextId: 1,
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
        lineCache.current.key = ''
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
        probe: S.current.tab === 1 ? S.current.probe : S.current.diy.probe,
        areas: canvasRef.current._clickAreas.map((a) => ({ n: a.n || '', x: a.x, y: a.y, w: a.w, h: a.h })),
      }
    } catch (e) { console.error('render error:', e) }
  }

  // ══════════════════════════════════════════════════════════════
  //  Tab 1 演示
  // ══════════════════════════════════════════════════════════════
  function chargesOf(s, L) {
    if (s.step === 1) return [{ id: 'q1', x: L.cx, y: L.cy, Q: s.polarity * s.Q }]
    if (s.step === 2) {
      const d = 7 * L.pxPerCm
      return [
        { id: 'p', x: L.cx - d, y: L.cy, Q: s.Q },
        { id: 'n', x: L.cx + d, y: L.cy, Q: -s.Q },
      ]
    }
    return []
  }

  function defaultProbe(s, L) {
    if (s.step === 3) return { x: L.cx, y: L.cy }
    const dir = s.step === 2 ? -1 : 1
    return { x: L.cx + dir * 12 * L.pxPerCm, y: L.cy - 5 * L.pxPerCm }
  }

  function renderDemo(ctx, W, H) {
    const s = S.current
    const L = makeLayout(W, H)
    if (!s.probeReady) { s.probe = defaultProbe(s, L); s.probeReady = true }

    drawHeader(ctx, W, s)
    drawStageCard(ctx, L)
    if (s.step === 3) drawPlates(ctx, L, s)
    else drawChargeField(ctx, L, s)
    drawProbe(ctx, L, s)
    drawPanel(ctx, L, s)
    drawToolbar(ctx, W, H, L, s)
    drawToast(ctx, W, H, s)
  }

  function drawHeader(ctx, W, s) {
    const bw = 122, bh = 30, gap = 10
    const total = STEPS.length * bw + (STEPS.length - 1) * gap
    const x0 = (W - total) / 2
    STEPS.forEach((st, i) => {
      const x = x0 + i * (bw + gap), y = 10
      const active = s.step === st.key
      ctx.beginPath(); ctx.roundRect(x, y, bw, bh, 9)
      ctx.fillStyle = active ? C.teal : C.card; ctx.fill()
      ctx.strokeStyle = active ? C.tealDark : C.line; ctx.lineWidth = 1; ctx.stroke()
      if (active) { ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.roundRect(x + 1, y + 1, bw - 2, bh / 2, 8); ctx.fill() }
      setFont(ctx, 12, 'bold'); ctx.fillStyle = active ? '#fff' : C.sub
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(st.label, x + bw / 2, y + bh / 2 + 1)
      const key = st.key
      pushArea({ n: `step${key}`, x, y, w: bw, h: bh, onClick: () => goStep(key) })
    })
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillStyle = C.sub
    fitFont(ctx, STEPS[s.step - 1].sub, W - 80, 12)
    ctx.fillText(STEPS[s.step - 1].sub, W / 2, 58)
  }

  function goStep(key) {
    const s = S.current
    s.step = key
    s.probeReady = false
    lineCache.current.key = ''
  }

  function drawStageCard(ctx, L) {
    const { stage, box } = L
    ctx.beginPath(); ctx.roundRect(stage.x0, stage.y0, stage.x1 - stage.x0, stage.y1 - stage.y0, 12)
    ctx.fillStyle = '#FFFFFF'; ctx.fill()
    ctx.strokeStyle = '#E7EEF2'; ctx.lineWidth = 1; ctx.stroke()
    // 场区淡点阵
    ctx.fillStyle = 'rgba(140,165,175,0.22)'
    for (let x = box.x + 12; x < box.x + box.w; x += 26) {
      for (let y = box.y + 12; y < box.y + box.h; y += 26) {
        ctx.beginPath(); ctx.arc(x, y, 0.9, 0, Math.PI * 2); ctx.fill()
      }
    }
    // 场区边框
    ctx.strokeStyle = 'rgba(18,166,155,0.18)'; ctx.lineWidth = 1
    ctx.setLineDash([4, 5])
    ctx.beginPath(); ctx.roundRect(box.x, box.y, box.w, box.h, 8); ctx.stroke()
    ctx.setLineDash([])
  }

  function getLines(L, charges) {
    const key = `${L.box.x}|${L.box.y}|${L.box.w}|${L.box.h}|${L.pxPerCm.toFixed(2)}|` + charges.map((c) => `${c.id}:${c.Q.toFixed(1)}:${Math.round(c.x)}:${Math.round(c.y)}`).join('|')
    if (lineCache.current.key !== key) {
      lineCache.current = { key, lines: seedLines(charges, L.box, L.pxPerCm) }
    }
    return lineCache.current.lines
  }

  function drawChargeField(ctx, L, s) {
    const charges = chargesOf(s, L)
    const lines = getLines(L, charges)
    if (s.eq && s.step === 1) drawPotentialCircles(ctx, L, charges[0])
    drawFieldLines(ctx, lines, L.pxPerCm)
    if (s.eq && s.step === 2) {
      ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(18,166,155,0.35)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(L.cx, L.box.y + 6); ctx.lineTo(L.cx, L.box.y + L.box.h - 6); ctx.stroke()
      ctx.restore()
      setFont(ctx, 9); ctx.fillStyle = 'rgba(11,127,119,0.8)'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText('中垂线：E 方向平行于两电荷连线', L.cx, L.box.y + L.box.h - 22)
    }
    for (const c of charges) drawChargeBall(ctx, c, s.step === 1 ? (c.Q > 0 ? '+Q' : '−Q') : (c.Q > 0 ? '+Q' : '−Q'))
    if (s.step === 2) {
      const d = 7 * L.pxPerCm
      drawDimLine(ctx, L.cx - d, L.cy + BALL_R + 30, L.cx + d, L.cy + BALL_R + 30, `间距 2d = 14 cm`)
    }
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

  function drawPotentialCircles(ctx, L, c) {
    ctx.save()
    ctx.beginPath(); ctx.rect(L.box.x, L.box.y, L.box.w, L.box.h); ctx.clip()
    ctx.setLineDash([5, 5]); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(18,166,155,0.32)'
    for (let rcm = 6; rcm <= 40; rcm += 6) {
      ctx.beginPath(); ctx.arc(c.x, c.y, rcm * L.pxPerCm, 0, Math.PI * 2); ctx.stroke()
    }
    ctx.restore()
    legendChip(ctx, L.box.x + 10, L.box.y + 10, '虚线：等势面（⊥ 电场线，等距离 → 等差电势）')
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
    setFont(ctx, 10, 'bold'); ctx.fillStyle = pos ? '#9E2B26' : '#1E4E7E'
    ctx.textBaseline = 'top'
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.92)'
    ctx.strokeText(label, c.x, c.y + BALL_R + 4)
    ctx.fillText(label, c.x, c.y + BALL_R + 4)
    ctx.textBaseline = 'alphabetic'
  }

  function drawDimLine(ctx, x0, y0, x1, y1, text) {
    ctx.save()
    ctx.strokeStyle = 'rgba(126,150,160,0.85)'; ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.stroke()
    for (const x of [x0, x1]) { ctx.beginPath(); ctx.moveTo(x, y0 - 5); ctx.lineTo(x, y0 + 5); ctx.stroke() }
    ctx.restore()
    setFont(ctx, 10, 'bold'); ctx.fillStyle = C.sub
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    const tw = ctx.measureText(text).width + 18
    ctx.beginPath(); ctx.roundRect((x0 + x1) / 2 - tw / 2, y0 - 10, tw, 20, 10)
    ctx.fillStyle = C.card; ctx.fill()
    ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke()
    ctx.fillStyle = C.sub; ctx.fillText(text, (x0 + x1) / 2, y0 + 0.5)
    void y1
  }

  // ─── 平行板 ───
  // 平行板：上下两块水平极板（上 + 下 −），板距按 d 映射到显示尺寸（场强用真实 U/d 计算）
  function plateGeom(L, s) {
    const k = clamp(L.box.w / 1066, 0.85, 1.6)
    const gap = clamp((62 + (s.plateD - 1) * 36) * k, 60, L.box.h * 0.5)
    const pw = 20
    const plateW = clamp(L.box.w * 0.64, 360, L.box.w * 0.86)
    const yInTop = L.cy - gap / 2, yInBot = L.cy + gap / 2
    return { gap, pw, plateW, x0: L.cx - plateW / 2, x1: L.cx + plateW / 2, yInTop, yInBot, yT: yInTop - pw, yB: yInBot + pw }
  }

  function drawDimLineV(ctx, x, y0, y1, text) {
    ctx.save()
    ctx.strokeStyle = 'rgba(126,150,160,0.85)'; ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke()
    for (const y of [y0, y1]) { ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.stroke() }
    ctx.restore()
    setFont(ctx, 10, 'bold'); ctx.fillStyle = C.sub
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    const tw = ctx.measureText(text).width + 18
    ctx.beginPath(); ctx.roundRect(x - tw / 2, (y0 + y1) / 2 - 10, tw, 20, 10)
    ctx.fillStyle = C.card; ctx.fill()
    ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke()
    ctx.fillStyle = C.sub; ctx.fillText(text, x, (y0 + y1) / 2 + 0.5)
  }

  function drawPlates(ctx, L, s) {
    const P = plateGeom(L, s)
    const plateDraw = (y, positive) => {
      const g = ctx.createLinearGradient(0, y, 0, y + P.pw)
      if (positive) { g.addColorStop(0, '#F6A8A2'); g.addColorStop(1, '#D2453E') }
      else { g.addColorStop(0, '#8FB6DC'); g.addColorStop(1, '#2C6FAF') }
      ctx.fillStyle = g
      ctx.beginPath(); ctx.roundRect(P.x0, y, P.plateW, P.pw, 3); ctx.fill()
      ctx.strokeStyle = positive ? '#B93A34' : '#1E4E7E'; ctx.lineWidth = 1; ctx.stroke()
      setFont(ctx, 9, 'bold'); ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      for (let x = P.x0 + 18; x < P.x1 - 8; x += 32) ctx.fillText(positive ? '+' : '−', x, y + P.pw / 2)
    }
    plateDraw(P.yT, true)     // 上板 +
    plateDraw(P.yB, false)    // 下板 −

    // 边缘效应：从极板左右端弯向另一极板（先画，压在电场线下面）
    const spaceSide = Math.min(P.x0 - L.box.x, L.box.x + L.box.w - P.x1) - 12
    const maxBulge = Math.min(spaceSide, P.gap * 0.95)
    if (maxBulge > 12) {
      ctx.save()
      for (const dir of [-1, 1]) {
        const xx = dir < 0 ? P.x0 : P.x1
        for (let k = 1; k <= 3; k++) {
          const bulge = (maxBulge * k) / 3.4
          const ay = P.yInTop, by = P.yInBot
          ctx.strokeStyle = `rgba(222,69,63,${0.5 - k * 0.1})`; ctx.lineWidth = 1.2
          ctx.beginPath()
          ctx.moveTo(xx, ay)
          ctx.quadraticCurveTo(xx + dir * bulge * 2, (ay + by) / 2, xx, by)
          ctx.stroke()
          arrowHead(ctx, xx + dir * bulge, (ay + by) / 2, 0, by - ay, `rgba(200,52,46,${0.45 - k * 0.08})`, 5)
        }
      }
      ctx.restore()
    }

    // 板内匀强电场线：平行等距、垂直于极板、由 + 指向 −
    const n = clamp(Math.round(P.plateW / 46), 8, 26)
    const yA = P.yInTop + 4, yB2 = P.yInBot - 4
    for (let i = 0; i < n; i++) {
      const x = P.x0 + 18 + (i * (P.plateW - 36)) / (n - 1)
      ctx.strokeStyle = 'rgba(222,69,63,0.85)'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(x, yA); ctx.lineTo(x, yB2); ctx.stroke()
      arrowHead(ctx, x, yA + (yB2 - yA) * 0.62, 0, 1, 'rgba(200,52,46,0.95)', 6)
    }

    // 极板电位标注
    setFont(ctx, 10, 'bold')
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'
    ctx.fillStyle = C.pos; ctx.fillText('＋ 极板  U/2', P.x0, P.yT - 6)
    ctx.textBaseline = 'top'
    ctx.fillStyle = C.neg; ctx.fillText('− 极板  −U/2', P.x0, P.yB + P.pw + 6)
    ctx.textAlign = 'left'

    // 板距标注（在左侧，纵向）
    drawDimLineV(ctx, P.x0 - 44, P.yInTop, P.yInBot, `d = ${s.plateD} cm`)

    // 等势面
    if (s.eq) {
      ctx.save(); ctx.setLineDash([5, 5]); ctx.strokeStyle = 'rgba(18,166,155,0.5)'; ctx.lineWidth = 1
      for (let i = 1; i <= 4; i++) {
        const y = P.yInTop + (i * (P.yInBot - P.yInTop)) / 5
        ctx.beginPath(); ctx.moveTo(P.x0 - 6, y); ctx.lineTo(P.x1 + 6, y); ctx.stroke()
      }
      ctx.restore()
      legendChip(ctx, L.box.x + 10, L.box.y + 10, '虚线：等势面（⊥ 电场线，等间距 → 场强均匀）')
    }
    ctx.textBaseline = 'alphabetic'
  }

  // ─── 探针 ───
  function probeField(L, s) {
    if (s.step === 3) {
      const P = plateGeom(L, s)
      const inside = s.probe.x > P.x0 && s.probe.x < P.x1 && s.probe.y > P.yInTop && s.probe.y < P.yInBot
      const E = inside ? s.plateU / (s.plateD / 100) : 0
      return { ex: 0, ey: inside ? E : 0, E, inside }
    }
    return fieldAt(chargesOf(s, L), s.probe.x, s.probe.y, L.pxPerCm)
  }

  const arrowLen = (E) => clamp(58 * Math.pow(E / 1e4, 0.3), 18, 132)

  function drawProbe(ctx, L, s) {
    const f = probeField(L, s)
    const p = s.probe
    const mag = f.E
    const dirx = mag > 0 ? f.ex / mag : 1, diry = mag > 0 ? f.ey / mag : 0
    const len = arrowLen(mag)

    // 分场强（偶极子）：E₁、E₂ 虚线箭头 + 合矢量的平行四边形提示
    if (s.step === 2) {
      const ch = chargesOf(s, L)
      const parts = ch.map((c) => fieldAt([c], p.x, p.y, L.pxPerCm))
      ctx.save()
      parts.forEach((pf, i) => {
        const m = pf.E
        const ux = m > 0 ? pf.ex / m : 1, uy = m > 0 ? pf.ey / m : 0
        const L1 = arrowLen(m) * 0.8
        ctx.setLineDash([5, 4])
        ctx.strokeStyle = 'rgba(18,166,155,0.5)'; ctx.lineWidth = 1.4
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + ux * L1, p.y + uy * L1); ctx.stroke()
        ctx.setLineDash([])
        arrowHead(ctx, p.x + ux * L1, p.y + uy * L1, ux, uy, 'rgba(18,166,155,0.85)', 5)
        setFont(ctx, 9, 'bold'); ctx.fillStyle = '#0B7F77'
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
        ctx.fillText(i === 0 ? 'E₁' : 'E₂', p.x + ux * L1 + ux * 8, p.y + uy * L1 + uy * 8)
        // 平行四边形辅助虚线
        ctx.setLineDash([3, 4])
        ctx.strokeStyle = 'rgba(18,166,155,0.28)'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(p.x + ux * L1, p.y + uy * L1); ctx.lineTo(p.x + dirx * len, p.y + diry * len); ctx.stroke()
        ctx.setLineDash([])
      })
      ctx.restore()
    }

    // E 矢量（从探针点画出）；E≈0 时只标注，不画箭头
    if (mag >= 1) {
      arrow(ctx, p.x, p.y, p.x + dirx * len, p.y + diry * len, C.teal, 2.6)
      setFont(ctx, 11, 'bold'); ctx.fillStyle = C.tealDark
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      const ex1 = p.x + dirx * len, ey1 = p.y + diry * len
      ctx.fillText('E', ex1 + diry * 8 - 3, ey1 - dirx * 8)
    } else {
      setFont(ctx, 10, 'bold'); ctx.fillStyle = C.sub
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText('E ≈ 0', p.x + 12, p.y - 14)
    }

    // F = qE（试探电荷受力，垂直侧移 20px 画出，避免与 E 重叠）
    if (s.q !== 0 && mag > 0) {
      const sign = s.q > 0 ? 1 : -1
      const fl = len * clamp(Math.abs(s.q) / 8, 0.2, 1.5)
      const px = -diry, py = dirx
      const ox = p.x + px * 20, oy = p.y + py * 20
      ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(226,163,60,0.55)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ox, oy); ctx.stroke(); ctx.restore()
      arrow(ctx, ox, oy, ox + dirx * sign * fl, oy + diry * sign * fl, C.gold, 2.6)
      setFont(ctx, 10, 'bold'); ctx.fillStyle = '#8A5A12'
      ctx.textAlign = 'left'
      ctx.fillText('F', ox + dirx * sign * fl + 8, oy + diry * sign * fl - 6)
    }

    // 探针本体（白心青环）
    ctx.beginPath(); ctx.arc(p.x, p.y, 6.5, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'; ctx.fill()
    ctx.strokeStyle = C.teal; ctx.lineWidth = 2; ctx.stroke()
    ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fillStyle = C.teal; ctx.fill()
    // 标签放在探针右侧，避开矢量箭头
    setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.tealDark
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText('P', p.x + 10, p.y + 8)

    pushArea({ n: 'probe', x: p.x - 16, y: p.y - 16, w: 32, h: 32, drag: 'probe', cursor: 'grab' })
  }

  // ─── 右栏 ───
  function drawPanel(ctx, L, s) {
    const { panel } = L
    const x = panel.x, w = panel.w, y = panel.y, h = panel.h
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 10)
    ctx.fillStyle = C.card; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke()

    const f = probeField(L, s)
    let ky = y + 14
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    setFont(ctx, 12, 'bold'); ctx.fillStyle = C.ink
    ctx.fillText('探针处的场强', x + 14, ky)
    setFont(ctx, 9); ctx.fillStyle = C.faint
    ctx.fillText('拖动白色小圆点 P 改变测量位置', x + 14, ky + 17)

    ky += 40
    let extraY = 0
    if (s.step === 3 && !f.inside) {
      setFont(ctx, 22, 'bold'); ctx.fillStyle = C.sub
      ctx.fillText('≈ 0', x + 14, ky)
      setFont(ctx, 9); ctx.fillStyle = C.faint
      ctx.fillText('板外场强几乎为零（边缘效应区除外）', x + 14, ky + 32)
      extraY = 26
    } else {
      setFont(ctx, 22, 'bold'); ctx.fillStyle = C.tealDark
      ctx.fillText(sciText(f.E), x + 14, ky)
      setFont(ctx, 10, 'bold'); ctx.fillStyle = C.sub
      ctx.fillText('V/m', x + 154, ky + 10)
    }
    ky += 34 + extraY

    const rows = []
    if (s.step === 1) {
      rows.push(['场源电量 Q', `${s.polarity > 0 ? '+' : '−'}${s.Q} nC`])
      rows.push(['到电荷距离 r', `${(f.nearCm || 0).toFixed(1)} cm`])
      rows.push(['E = kQ/r²', `${sciText(f.E)} V/m`])
      rows.push(['方向', s.polarity > 0 ? '沿连线向外' : '指向电荷'])
    } else if (s.step === 2) {
      const ch = chargesOf(s, L)
      const e1 = fieldAt([ch[0]], s.probe.x, s.probe.y, L.pxPerCm).E
      const e2 = fieldAt([ch[1]], s.probe.x, s.probe.y, L.pxPerCm).E
      rows.push(['场源', `+${s.Q} nC / −${s.Q} nC`])
      rows.push(['E₁', `${sciText(e1)} V/m`])
      rows.push(['E₂', `${sciText(e2)} V/m`])
      rows.push(['合场强 E', `${sciText(f.E)} V/m`])
      rows.push(['两电荷中点', `${sciText(K_E * 2 * s.Q / Math.pow(7, 2))} V/m`])
    } else {
      rows.push(['电压 U', `${s.plateU} V`])
      rows.push(['板距 d', `${s.plateD} cm`])
      if (f.inside) {
        rows.push(['E = U/d', `${sciText(f.E)} V/m`])
        rows.push(['板内场强', '匀强（方向：+ → −）'])
      } else {
        rows.push(['探针位置', '板外'])
        rows.push(['E', '≈ 0（边缘效应区除外）'])
      }
    }
    for (const [k, v] of rows) {
      setFont(ctx, 9.5); ctx.fillStyle = C.sub
      ctx.fillText(k, x + 14, ky)
      setFont(ctx, 10, 'bold'); ctx.fillStyle = C.ink
      ctx.textAlign = 'right'; fitFont(ctx, v, w - 120, 10, 'bold')
      ctx.fillText(v, x + w - 14, ky)
      ctx.textAlign = 'left'
      ky += 16
    }

    // F = qE
    ky += 4
    ctx.strokeStyle = '#EDF2F5'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(x + 12, ky); ctx.lineTo(x + w - 12, ky); ctx.stroke()
    ky += 10
    setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.ink
    ctx.fillText('试探电荷受力 F = qE', x + 14, ky)
    ky += 16
    const FF = Math.abs(s.q) * f.E * 1e-9
    setFont(ctx, 9.5); ctx.fillStyle = C.sub
    ctx.fillText(`q = ${s.q > 0 ? '+' : ''}${s.q} nC`, x + 14, ky)
    setFont(ctx, 10, 'bold'); ctx.fillStyle = '#8A5A12'
    ctx.textAlign = 'right'
    ctx.fillText(s.q === 0 ? 'q = 0：不受力' : `${sciText(FF)} N`, x + w - 14, ky)
    ctx.textAlign = 'left'
    ky += 16
    setFont(ctx, 8.5); ctx.fillStyle = C.faint
    fitFont(ctx, '改变 q：E 不变（由场源决定），F 与 q 成正比 —— 这正是 E = F/q', w - 28, 8.5)
    ctx.fillText('改变 q：E 不变（由场源决定），F 与 q 成正比 —— 这正是 E = F/q', x + 14, ky)

    // 说明卡（紧跟读数，不贴底）
    const cardY = Math.min(ky + 28, y + h - 176)
    ctx.beginPath(); ctx.roundRect(x + 12, cardY, w - 24, 158, 8)
    ctx.fillStyle = '#F6FBF9'; ctx.fill()
    ctx.strokeStyle = '#DCEBE7'; ctx.lineWidth = 1; ctx.stroke()
    setFont(ctx, 10, 'bold'); ctx.fillStyle = C.tealDark
    ctx.fillText(s.step === 1 ? '点电荷电场' : s.step === 2 ? '等量异号电荷' : '平行板匀强电场', x + 24, cardY + 12)
    const bullets = s.step === 1 ? [
      '• 电场线从正电荷出发，终止于无穷远',
      '• 负电荷则相反：从无穷远汇聚到电荷',
      '• 越远离电荷，线越疏 → 场强越小',
      '• E = kQ/r²，与试探电荷 q 无关',
      '• 电场线不相交（E 方向唯一）',
    ] : s.step === 2 ? [
      '• 电场线从正电荷出发、终止于负电荷',
      '• 两电荷之间电场线最密 → 场强最大',
      '• 中垂线上 E 平行于两电荷连线',
      '• 远离体系时，像是等量异号的一个整体',
      '• 密与疏只反映强弱，不代表“线的数量=力”',
    ] : [
      '• 板间电场线平行等距 → 匀强电场',
      '• E = U/d，U 越大、d 越小 E 越大',
      '• 等势面与电场线垂直，且等间距',
      '• 板外场强几乎为零（有边缘效应）',
      '• 只有板内可视为匀强电场',
    ]
    setFont(ctx, 9); ctx.fillStyle = C.sub
    bullets.forEach((t, i) => {
      fitFont(ctx, t, w - 52, 9)
      ctx.fillText(t, x + 24, cardY + 32 + i * 20)
    })
    ctx.textBaseline = 'alphabetic'
  }

  // ─── 底部工具条 ───
  function drawToolbar(ctx, W, H, L, s) {
    const T = L.toolbar
    ctx.beginPath(); ctx.roundRect(T.x, T.y, T.w, T.h, 10)
    ctx.fillStyle = C.card; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke()

    const rowY = T.y + 22
    let bx = T.x + 20
    const labelW = 74

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
      void labelW
    }

    if (s.step === 1 || s.step === 2) {
      sliderBlock('场源电量 Q', `+${s.Q} nC`, (s.Q - 10) / 90, 'qSlider', (r) => { S.current.Q = Math.round(10 + r * 90) }, C.pos)
      if (s.step === 1) {
        drawBtn(ctx, bx, rowY - 16, 62, 26, s.polarity > 0 ? '正电荷' : '负电荷', 'plain', () => {
          S.current.polarity = -S.current.polarity
          lineCache.current.key = ''
          say(`场源已切换为${S.current.polarity > 0 ? '正电荷（电场线向外）' : '负电荷（电场线向内）'}`)
        }, 'polarityBtn')
        bx += 70
      }
    } else {
      sliderBlock('电压 U', `${s.plateU} V`, (s.plateU - 100) / 500, 'uSlider', (r) => { S.current.plateU = Math.round((100 + r * 500) / 10) * 10 }, C.tealDark)
      sliderBlock('板距 d', `${s.plateD} cm`, (s.plateD - 1) / 6, 'dSlider', (r) => { S.current.plateD = Math.round((1 + r * 6) * 2) / 2 }, C.tealDark)
    }

    sliderBlock('试探电荷 q', `${s.q > 0 ? '+' : ''}${s.q} nC`, (s.q + 8) / 16, 'testQSlider', (r) => {
      S.current.q = Math.round(-8 + r * 16)
    }, C.gold)

    drawBtn(ctx, bx, rowY - 16, 78, 26, s.eq ? '等势面 开' : '等势面 关', s.eq ? 'primary' : 'plain', () => { S.current.eq = !S.current.eq }, 'eqBtn')
    bx += 86
    drawBtn(ctx, bx, rowY - 16, 62, 26, '↺ 重置', 'ghost', () => {
      const st = S.current
      st.step = 1; st.Q = 20; st.polarity = 1; st.q = 4; st.plateU = 300; st.plateD = 3; st.eq = false
      st.probeReady = false
      lineCache.current.key = ''
      say('已恢复初始状态')
    }, 'resetBtn')

    setFont(ctx, 8.5); ctx.fillStyle = C.faint
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    const hint = s.step === 1
      ? '电场线由场强方向积分追踪得到：越密的地方场强越大；拖动探针可读出任意点的 E'
      : s.step === 2
        ? '两电荷的场矢量叠加：中点附近最密、场强最大；中垂线上合场强平行于连线'
        : 'U 与 d 都改的是“板间场强”，拖动探针到板外会看到 E≈0（边缘效应）'
    fitFont(ctx, hint, T.w - 60, 8.5)
    ctx.fillText(hint, T.x + 20, T.y + 52)
    if (s.step === 1) {
      setFont(ctx, 8.5); ctx.fillStyle = C.faint
      ctx.fillText('提示：拖动探针远离电荷 → E 变小、电场线变疏（E = kQ/r²）', T.x + 20, T.y + 68)
    }
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
  }

  function drawToast(ctx, W, H, s) {
    if (!s.toast || Date.now() > s.toast.until) return
    const text = s.toast.text
    setFont(ctx, 11, 'bold')
    const tw = ctx.measureText(text).width + 30
    const x = (W - tw) / 2, y = H - 42
    ctx.beginPath(); ctx.roundRect(x, y, tw, 26, 13)
    ctx.fillStyle = 'rgba(24,40,48,0.92)'; ctx.fill()
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(text, W / 2, y + 13)
    ctx.textBaseline = 'alphabetic'
  }

  // ══════════════════════════════════════════════════════════════
  //  Tab 2 自己动手（自由布电荷 → 看叠加场 → 读探针）
  // ══════════════════════════════════════════════════════════════
  function diyGeom(W, H) {
    const palW = 176, palX = W - palW - 12
    const org = { x: 14, y: 56 }
    const aw = palX - 12 - org.x, ah = H - 24 - org.y
    const sc = clamp(Math.min(aw / 980, ah / 640), 1, 1.5)
    const area = { x0: 0, x1: aw / sc, y0: 0, y1: ah / sc }
    return { palW, palX, org, sc, area, pxPerCm: clamp(area.x1 / 30, 5, 12) }
  }

  function renderDiy(ctx, W, H) {
    const s = S.current
    const dy = s.diy
    const A = diyGeom(W, H)
    if (!dy.ready) {
      dy.probe = { x: A.area.x1 * 0.5, y: A.area.y1 * 0.45 }
      dy.ready = true
    }

    setFont(ctx, 13, 'bold'); ctx.fillStyle = C.ink
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('自己动手 · 自由布电荷，看电场叠加', A.org.x + 4, 14)
    setFont(ctx, 10); ctx.fillStyle = C.sub
    ctx.fillText('点右侧器材再点画布落电荷；电荷可拖动、右键删除；点选电荷可改电量与正负。拖动探针读任意点的合场强。', A.org.x + 4, 33)

    ctx.save()
    ctx.translate(A.org.x, A.org.y)
    ctx.scale(A.sc, A.sc)
    // 场地
    ctx.beginPath(); ctx.roundRect(0, 0, A.area.x1, A.area.y1, 10)
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#E7EEF2'; ctx.lineWidth = 1; ctx.stroke()
    ctx.fillStyle = 'rgba(140,165,175,0.2)'
    for (let x = 14; x < A.area.x1; x += 26) {
      for (let y = 14; y < A.area.y1; y += 26) { ctx.beginPath(); ctx.arc(x, y, 0.9, 0, Math.PI * 2); ctx.fill() }
    }

    const box = { x: 6, y: 6, w: A.area.x1 - 12, h: A.area.y1 - 12 }
    if (dy.charges.length) {
      const key = dy.charges.map((c) => `${c.id}:${c.Q.toFixed(1)}:${Math.round(c.x)}:${Math.round(c.y)}`).join('|') + `|${box.w.toFixed(0)}`
      if (lineCache.current.key !== 'diy' + key) {
        lineCache.current = { key: 'diy' + key, lines: seedLines(dy.charges, box, A.pxPerCm) }
      }
      drawFieldLines(ctx, lineCache.current.lines, A.pxPerCm)
      for (const c of dy.charges) {
        drawChargeBall(ctx, c, `${c.Q > 0 ? '+' : ''}${c.Q}nC`)
        if (dy.sel === c.id) {
          ctx.beginPath(); ctx.arc(c.x, c.y, BALL_R + 8, 0, Math.PI * 2)
          ctx.strokeStyle = C.gold; ctx.lineWidth = 2.4; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([])
          ctx.beginPath(); ctx.arc(c.x + BALL_R + 12, c.y - BALL_R - 6, 7, 0, Math.PI * 2)
          ctx.fillStyle = C.gold; ctx.fill()
          setFont(ctx, 9, 'bold'); ctx.fillStyle = '#fff'
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          ctx.fillText('✓', c.x + BALL_R + 12, c.y - BALL_R - 5.5)
        }
      }
      // 探针读数
      const f = fieldAt(dy.charges, dy.probe.x, dy.probe.y, A.pxPerCm)
      drawDiyProbe(ctx, dy.probe, f)
      drawDiyReadout(ctx, A, f)
    } else {
      setFont(ctx, 12); ctx.fillStyle = C.faint
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('从右侧器材区点一下「正电荷」或「负电荷」，再点画布任意位置放入', A.area.x1 / 2, A.area.y1 / 2)
      ctx.textBaseline = 'alphabetic'
    }
    ctx.restore()

    drawDiyPalette(ctx, A, W, H, s)
    if (dy.hold) {
      ctx.save(); ctx.globalAlpha = 0.85
      drawDiyIcon(ctx, dy.mx || 0, dy.my || 0, dy.hold, 1.4)
      ctx.restore()
    }
    drawToast(ctx, W, H, s)

    pushArea({ n: 'diyStage', x: A.org.x, y: A.org.y, w: A.area.x1 * A.sc, h: A.area.y1 * A.sc })
  }

  function drawDiyProbe(ctx, p, f) {
    const mag = f.E
    const dirx = mag > 0 ? f.ex / mag : 1
    const diry = mag > 0 ? f.ey / mag : 0
    const len = arrowLen(mag)
    arrow(ctx, p.x, p.y, p.x + dirx * len, p.y + diry * len, C.teal, 2.4)
    ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = C.teal; ctx.lineWidth = 2; ctx.stroke()
    setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.tealDark
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText('E', p.x + dirx * len + diry * 8, p.y + diry * len - dirx * 8)
    ctx.fillText('P', p.x + 10, p.y + 8)
  }

  function drawDiyReadout(ctx, A, f) {
    const w = 168, h = 54
    const x = 12, y = A.area.y1 - h - 12
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8)
    ctx.fillStyle = 'rgba(246,251,249,0.95)'; ctx.fill()
    ctx.strokeStyle = '#DCEBE7'; ctx.lineWidth = 1; ctx.stroke()
    setFont(ctx, 8.5); ctx.fillStyle = C.sub
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('探针处合场强', x + 10, y + 8)
    setFont(ctx, 15, 'bold'); ctx.fillStyle = C.tealDark
    ctx.fillText(`${sciText(f.E)} V/m`, x + 10, y + 20)
    setFont(ctx, 8.5); ctx.fillStyle = C.faint
    const ang = f.E > 0 ? (Math.atan2(-f.ey, f.ex) * 180 / Math.PI + 360) % 360 : 0
    ctx.fillText(`方向 ${ang.toFixed(0)}°（自 +x 轴逆时针）`, x + 10, y + 38)
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
      { type: 'pos', name: '正电荷 +Q', hint: '电场线向外' },
      { type: 'neg', name: '负电荷 −Q', hint: '电场线向内' },
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

    // 预设
    let ky = y + 34 + 112 + 8
    setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.sub
    ctx.fillText('快速预设', x + 12, ky)
    ky += 16
    const presets = [
      { k: 'single', label: '单个正电荷' },
      { k: 'dipole', label: '等量异号' },
      { k: 'same', label: '同号双电荷' },
      { k: 'quad', label: '四极子（两正两负）' },
    ]
    presets.forEach((p, i) => {
      const py = ky + i * 30
      drawBtn(ctx, x + 8, py, w - 16, 26, p.label, 'plain', () => applyPreset(p.k, A), `preset:${p.k}`)
    })
    ky += presets.length * 30 + 6

    // 选中电荷
    if (dy.sel != null) {
      const c = dy.charges.find((cc) => cc.id === dy.sel)
      if (c) {
        ctx.strokeStyle = '#EDF2F5'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(x + 10, ky); ctx.lineTo(x + w - 10, ky); ctx.stroke()
        ky += 10
        setFont(ctx, 9.5, 'bold'); ctx.fillStyle = C.ink
        ctx.fillText(`选中电荷 · ${c.Q > 0 ? '正' : '负'} ${Math.abs(c.Q)} nC`, x + 12, ky)
        ky += 18
        setFont(ctx, 9, 'bold'); ctx.fillStyle = C.sub
        ctx.fillText('电量', x + 12, ky)
        ctx.textAlign = 'right'; ctx.fillStyle = (c.Q > 0 ? C.pos : C.neg)
        ctx.fillText(`${c.Q > 0 ? '+' : '−'}${Math.abs(c.Q)} nC`, x + w - 12, ky)
        ctx.textAlign = 'left'
        ky += 12
        drawSlider(ctx, {
          x: x + 12, y: ky + 8, w: w - 24, ratio: (Math.abs(c.Q) - 5) / 55,
          accent: c.Q > 0 ? C.pos : C.neg, name: 'diyQ',
          onChange: (r) => {
            const st = S.current
            const cc = st.diy.charges.find((t) => t.id === st.diy.sel)
            if (!cc) return
            const mag = Math.round(5 + r * 55)
            cc.Q = cc.Q > 0 ? mag : -mag
          },
        })
        ky += 24
        drawBtn(ctx, x + 8, ky, (w - 22) / 2, 24, '切换正负', 'plain', () => {
          const st = S.current
          const cc = st.diy.charges.find((t) => t.id === st.diy.sel)
          if (cc) cc.Q = -cc.Q
        }, 'diyFlip')
        drawBtn(ctx, x + 14 + (w - 22) / 2, ky, (w - 22) / 2, 24, '删除', 'ghost', () => {
          const st = S.current
          st.diy.charges = st.diy.charges.filter((t) => t.id !== st.diy.sel)
          st.diy.sel = null
        }, 'diyDel')
      }
    } else {
      ctx.strokeStyle = '#EDF2F5'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(x + 10, ky); ctx.lineTo(x + w - 10, ky); ctx.stroke()
      ky += 10
      setFont(ctx, 9); ctx.fillStyle = C.faint
      fitFont(ctx, '单击画布中的电荷可改电量与正负', w - 24, 9)
      ctx.fillText('单击画布中的电荷可改电量与正负', x + 12, ky)
    }

    // 底部：清空
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
    else if (kind === 'dipole') dy.charges = [mk(cx - d, cy, 20), mk(cx + d, cy, -20)]
    else if (kind === 'same') dy.charges = [mk(cx - d, cy, 20), mk(cx + d, cy, 20)]
    else dy.charges = [mk(cx - d, cy - d, 20), mk(cx + d, cy - d, -20), mk(cx - d, cy + d, -20), mk(cx + d, cy + d, 20)]
    dy.sel = null
    dy.ready = true
    say('已载入预设，可拖动探针观察各点合场强')
  }

  // ══════════════════════════════════════════════════════════════
  //  交互
  // ══════════════════════════════════════════════════════════════
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
        if (a.drag === 'probe') { s.dragProbe = true; return }
        if (a.drag === 'slider') { s.dragSlider = a; a.setX(x); return }
        if (a.onClick) { a.onClick(); return }
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
    // 画布内：放电荷 / 拖探针 / 选择并拖动电荷
    const A = diyGeom(canvasRef.current._R.W, canvasRef.current._R.H)
    const L = { x: (x - A.org.x) / A.sc, y: (y - A.org.y) / A.sc }
    if (dy.hold) {
      const Q = dy.hold === 'pos' ? 20 : -20
      const c = { id: s.nextId++, x: L.x, y: L.y, Q }
      dy.charges.push(c)
      dy.sel = c.id
      dy.hold = null
      say(`已放入${Q > 0 ? '正' : '负'}电荷 ${Math.abs(Q)} nC，可拖动它或改电量`)
      return
    }
    if (Math.hypot(L.x - dy.probe.x, L.y - dy.probe.y) < 14) { dy.drag = 'probe'; return }
    const picked = [...dy.charges].reverse().find((c) => Math.hypot(L.x - c.x, L.y - c.y) < BALL_R + 8)
    if (picked) { dy.sel = picked.id; dy.drag = 'charge'; s.dragOffX = L.x - picked.x; s.dragOffY = L.y - picked.y; return }
    dy.sel = null
  }

  function handleMouseMove(e) {
    const s = S.current
    const { x, y } = getPos(e)
    if (s.tab === 1) {
      if (s.dragProbe) {
        const L = makeLayout(canvasRef.current._R.W, canvasRef.current._R.H)
        s.probe = {
          x: clamp(x, L.box.x + 6, L.box.x + L.box.w - 6),
          y: clamp(y, L.box.y + 6, L.box.y + L.box.h - 6),
        }
        return
      }
      if (s.dragSlider) { s.dragSlider.setX(x); return }
      return
    }
    const dy = s.diy
    if (dy.hold) { dy.mx = x; dy.my = y; return }
    const R = canvasRef.current._R
    if (!R) return
    const A = diyGeom(R.W, R.H)
    const L = { x: (x - A.org.x) / A.sc, y: (y - A.org.y) / A.sc }
    if (dy.drag === 'probe') { dy.probe = { x: clamp(L.x, 8, A.area.x1 - 8), y: clamp(L.y, 8, A.area.y1 - 8) }; return }
    if (dy.drag === 'charge') {
      const c = dy.charges.find((t) => t.id === dy.sel)
      if (c) { c.x = clamp(L.x - s.dragOffX, 14, A.area.x1 - 14); c.y = clamp(L.y - s.dragOffY, 14, A.area.y1 - 14) }
      return
    }
    if (s.dragSlider) s.dragSlider.setX(x)
  }

  function handleMouseUp() {
    const s = S.current
    s.dragProbe = false
    s.dragSlider = null
    s.diy.drag = null
  }
  function handleDoubleClick() {}

  function handleContextMenu(e) {
    e.preventDefault()
    const s = S.current
    if (s.tab !== 2) return
    const { x, y } = getPos(e)
    const R = canvasRef.current._R
    const A = diyGeom(R.W, R.H)
    const L = { x: (x - A.org.x) / A.sc, y: (y - A.org.y) / A.sc }
    const idx = s.diy.charges.findIndex((c) => Math.hypot(L.x - c.x, L.y - c.y) < BALL_R + 8)
    if (idx >= 0) {
      s.diy.charges.splice(idx, 1)
      s.diy.sel = null
      say('电荷已删除')
    }
  }

  return (
    <SceneShell
      title="电场线与电场强度"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t); lineCache.current.key = ''; forceUpdate(n => n + 1) }}
      tab1Label="📊 实验演示"
      tab2Label="🔧 自己动手"
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} />
    </SceneShell>
  )
}
