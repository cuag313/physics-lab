import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * UniversalGravitationScene — 万有引力定律
 * 1. F ∝ 1/r² — 距离越远，引力越小
 * 2. F ∝ M·m — 引力与质量乘积成正比
 * 3. 测 G — 卡文迪什扭秤
 */

const G_CONST = 6.674e-11
const VIS_SCALE = 1e10

function computeForce(m1, m2, r) {
  return G_CONST * m1 * m2 / (r * r)
}

function getCavendishAngle(m1, m2, r) {
  const F = computeForce(m1, m2, r)
  return Math.min(75, F * VIS_SCALE * 0.32)
}

function drawMass(ctx, x, y, mass, color, label) {
  const r = Math.max(14, Math.min(32, 10 + mass * 0.3))
  const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r)
  grad.addColorStop(0, color); grad.addColorStop(1, color.length <= 7 ? color + '80' : color)
  ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(label, x, y)
}

function drawArrow(ctx, x1, y1, x2, y2, color, label) {
  const a = Math.atan2(y2 - y1, x2 - x1), hl = 7
  ctx.strokeStyle = color; ctx.lineWidth = 2.5
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
  ctx.fillStyle = color
  ctx.beginPath(); ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - hl * Math.cos(a - 0.35), y2 - hl * Math.sin(a - 0.35))
  ctx.lineTo(x2 - hl * Math.cos(a + 0.35), y2 - hl * Math.sin(a + 0.35))
  ctx.closePath(); ctx.fill()
  if (label) {
    ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText(label, (x1 + x2) / 2, Math.min(y1, y2) - 6)
  }
}

function drawPanel(ctx, px, py, pw, ph, title, rows) {
  ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.fill()
  ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.stroke()
  ctx.textBaseline = 'top'; ctx.textAlign = 'left'
  ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'
  ctx.fillText(title, px + 12, py + 10)
  let y = py + 30
  for (const row of rows) {
    if (!row.text && row.h) { y += row.h; continue }
    ctx.fillStyle = row.color || '#666'; ctx.font = row.font || '11px sans-serif'
    ctx.fillText(row.text, px + 12, y); y += row.h || 17
  }
}

export default function UniversalGravitationScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({ mode: 'inverse', m1: 50, m2: 50, r: 3.0, time: 0, guideDismissed: false })

  const [m1, setM1] = useState(50)
  const [m2, setM2] = useState(50)
  const [r, setR] = useState(3.0)
  const [mode, setMode] = useState('inverse')
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const R = {
      canvas, ctx: canvas.getContext('2d'), W: 0, H: 0, ox: 0, oy: 0, scale: 80,
      resize() {
        const rect = canvas.getBoundingClientRect()
        canvas.width = rect.width * devicePixelRatio
        canvas.height = rect.height * devicePixelRatio
        this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
        this.W = rect.width; this.H = rect.height
        this.ox = this.W * 0.42; this.oy = this.H * 0.42
      },
      w2s(wx, wy) { return [this.ox + wx * this.scale, this.oy - wy * this.scale] },
    }
    R.resize()
    const loop = () => { S.current.time += 1 / 60; render(R); animRef.current = requestAnimationFrame(loop) }
    animRef.current = requestAnimationFrame(loop)
    const onResize = () => R.resize()
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function render(R) {
    const ctx = R.ctx; ctx.clearRect(0, 0, R.W, R.H)
    ctx.fillStyle = '#f0f4f8'; ctx.fillRect(0, 0, R.W, R.H)
    const st = S.current
    if (st.mode === 'inverse') drawInverse(ctx, R)
    else if (st.mode === 'mass') drawMassMode(ctx, R)
    else drawCavendish(ctx, R)
    drawGuideBubble(ctx, R)
  }

  // ========== F ∝ 1/r² ==========
  function drawInverse(ctx, R) {
    const st = S.current
    const F = computeForce(st.m1, st.m2, st.r)
    const halfR = st.r / 2

    const [x1, y1] = R.w2s(-halfR, 0)
    const [x2, y2] = R.w2s(halfR, 0)
    drawMass(ctx, x1, y1, st.m1, '#0288D1', 'M')
    drawMass(ctx, x2, y2, st.m2, '#FF9800', 'm')

    const fLen = Math.min(Math.log10(F * VIS_SCALE + 1) * 30, 100)
    if (fLen > 3) {
      drawArrow(ctx, x1 + 25, y1, x1 + 25 + fLen, y1, '#4CAF50', 'F')
      drawArrow(ctx, x2 - 25, y2, x2 - 25 - fLen, y2, '#4CAF50', 'F')
    }

    ctx.strokeStyle = 'rgba(230,81,0,0.3)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(x1, y1 + 45); ctx.lineTo(x2, y2 + 45); ctx.stroke(); ctx.setLineDash([])
    ctx.fillStyle = '#E65100'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(`r = ${st.r.toFixed(1)} m`, (x1 + x2) / 2, y1 + 50)

    drawGraph(ctx, R)

    const rows = [
      { text: 'M、m 固定，改变距离 r', color: '#888', font: '10px sans-serif' },
      { text: '', h: 4 },
      { text: `M = ${st.m1} kg`, color: '#666' },
      { text: `m = ${st.m2} kg`, color: '#666' },
      { text: `r = ${st.r.toFixed(2)} m`, color: '#666' },
      { text: '', h: 4 },
      { text: `F = ${F.toExponential(3)} N`, color: '#0288D1', font: 'bold 11px sans-serif' },
      { text: '', h: 4 },
      { text: `1/r² = ${(1 / (st.r * st.r)).toFixed(4)}`, color: '#E65100' },
      { text: '', h: 6 },
      { text: '距离越远，引力越小', color: '#E65100', font: 'bold 10px sans-serif' },
      { text: 'F = GMm/r²', color: '#E65100', font: 'bold 10px sans-serif' },
      { text: `G = 6.674×10⁻¹¹`, color: '#888', font: '10px sans-serif' },
    ]
    drawPanel(ctx, R.W - 220, 16, 205, 250, '📊 F ∝ 1/r²', rows)

    ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'
    ctx.fillText('万有引力定律', 16, R.H - 46)
    ctx.fillStyle = '#0288D1'; ctx.font = 'bold 13px serif'
    ctx.fillText('F = GMm/r²', 136, R.H - 46)
    ctx.fillStyle = '#888'; ctx.font = '11px sans-serif'
    ctx.fillText('调节滑块改变距离和质量，观察引力变化', 16, R.H - 26)
    ctx.textBaseline = 'alphabetic'
  }

  // ========== F ∝ M·m ==========
  function drawMassMode(ctx, R) {
    const st = S.current
    const F = computeForce(st.m1, st.m2, st.r)
    const currentMM = st.m1 * st.m2

    const configs = [
      { m1: 10, m2: 10, label: 'M=10,m=10', color: '#90CAF9' },
      { m1: 25, m2: 25, label: 'M=25,m=25', color: '#64B5F6' },
      { m1: st.m1, m2: st.m2, label: `M=${st.m1},m=${st.m2}`, color: '#FF9800' },
      { m1: 75, m2: 75, label: 'M=75,m=75', color: '#42A5F5' },
      { m1: 100, m2: 100, label: 'M=100,m=100', color: '#1E88E5' },
    ]

    const barW = 55, gap = 16
    const totalW = configs.length * (barW + gap) - gap
    const chartLeft = (R.W - 230 - totalW) / 2 + 20
    const baseY = R.oy + 140
    const maxBarH = 150
    const maxF = computeForce(100, 100, st.r)

    ctx.fillStyle = '#333'; ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('引力与质量乘积成正比　F ∝ M·m', R.W / 2 - 110, baseY - maxBarH - 36)
    ctx.fillStyle = '#888'; ctx.font = '11px sans-serif'
    ctx.fillText(`固定 r = ${st.r.toFixed(1)}m，改变 M 和 m`, R.W / 2 - 110, baseY - maxBarH - 18)

    configs.forEach((cfg, i) => {
      const mm = cfg.m1 * cfg.m2
      const fVal = computeForce(cfg.m1, cfg.m2, st.r)
      const barH = Math.max(8, (fVal / maxF) * maxBarH)
      const x = chartLeft + i * (barW + gap)
      const isCurrent = i === 2

      ctx.fillStyle = cfg.color
      ctx.beginPath(); ctx.roundRect(x, baseY - barH, barW, barH, [4, 4, 0, 0]); ctx.fill()
      if (isCurrent) { ctx.strokeStyle = '#E65100'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(x, baseY - barH, barW, barH, [4, 4, 0, 0]); ctx.stroke() }

      ctx.fillStyle = isCurrent ? '#E65100' : '#333'
      ctx.font = isCurrent ? 'bold 10px sans-serif' : '10px sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText(cfg.label, x + barW / 2, baseY + 6)
      ctx.fillStyle = '#888'; ctx.font = '9px sans-serif'
      ctx.fillText(`F=${fVal.toExponential(1)}`, x + barW / 2, baseY + 20)
      ctx.fillText(`M×m=${mm}`, x + barW / 2, baseY + 33)
    })

    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('M×m 越大 → F 越大　这就是 F∝Mm', R.W / 2 - 110, baseY + 55)

    const rows = [
      { text: 'r 固定，改变 M 和 m', color: '#888', font: '10px sans-serif' },
      { text: '', h: 4 },
      { text: `M = ${st.m1} kg`, color: '#666' },
      { text: `m = ${st.m2} kg`, color: '#666' },
      { text: `r = ${st.r.toFixed(2)} m`, color: '#666' },
      { text: '', h: 4 },
      { text: `M×m = ${currentMM}`, color: '#E65100' },
      { text: `F = ${F.toExponential(3)} N`, color: '#0288D1', font: 'bold 11px sans-serif' },
      { text: '', h: 6 },
      { text: '质量乘积越大，引力越大', color: '#E65100', font: 'bold 10px sans-serif' },
      { text: 'F = GMm/r²', color: '#E65100', font: 'bold 10px sans-serif' },
    ]
    drawPanel(ctx, R.W - 220, 16, 205, 230, '📊 F ∝ M·m', rows)

    ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'
    ctx.fillText('万有引力定律', 16, R.H - 46)
    ctx.fillStyle = '#0288D1'; ctx.font = 'bold 13px serif'
    ctx.fillText('F = GMm/r²', 136, R.H - 46)
    ctx.textBaseline = 'alphabetic'
  }

  // ========== 卡文迪什扭秤 ==========
  function drawCavendish(ctx, R) {
    const st = S.current
    const angleDeg = getCavendishAngle(st.m1, st.m2, st.r)
    const angleRad = angleDeg * Math.PI / 180
    const F = computeForce(st.m1, st.m2, st.r)

    const [cx, cy] = R.w2s(0, 0)

    // 悬丝
    ctx.strokeStyle = '#90A4AE'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(cx, cy - 80); ctx.lineTo(cx, cy); ctx.stroke()

    // 横杆
    const barLen = 120
    const x1 = cx - barLen * Math.cos(angleRad)
    const y1 = cy - barLen * Math.sin(angleRad)
    const x2 = cx + barLen * Math.cos(angleRad)
    const y2 = cy + barLen * Math.sin(angleRad)
    ctx.strokeStyle = '#78909C'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()

    // 小球 m
    drawMass(ctx, x1, y1, 1, '#0288D1', 'm')
    drawMass(ctx, x2, y2, 1, '#0288D1', 'm')

    // 大球 M（位置随 r 变化）
    const bigR = 80 + st.r * 10
    const bigAngle = 0.3
    const bx1 = cx + bigR * Math.cos(bigAngle), by1 = cy + bigR * Math.sin(bigAngle)
    const bx2 = cx - bigR * Math.cos(bigAngle), by2 = cy - bigR * Math.sin(bigAngle)
    drawMass(ctx, bx1, by1, 50, '#FF9800', 'M')
    drawMass(ctx, bx2, by2, 50, '#FF9800', 'M')

    // 引力虚线
    ctx.strokeStyle = 'rgba(76,175,80,0.3)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(bx1, by1); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(bx2, by2); ctx.stroke()
    ctx.setLineDash([])

    // 角度弧线
    if (angleDeg > 0.5) {
      ctx.strokeStyle = '#E65100'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(cx, cy, 50, -angleRad, 0); ctx.stroke()
      ctx.fillStyle = '#E65100'; ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      ctx.fillText(`θ = ${angleDeg.toFixed(2)}°`, cx + 54, cy - 14)
    }

    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('卡文迪什扭秤实验', cx, cy - 110)
    ctx.fillStyle = '#888'; ctx.font = '10px sans-serif'
    ctx.fillText('真空中测量万有引力常数 G', cx, cy - 94)

    // 工作原理
    const px2 = 16, py2 = 16, pw2 = 240, ph2 = 260
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.roundRect(px2, py2, pw2, ph2, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(px2, py2, pw2, ph2, 8); ctx.stroke()
    ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'
    ctx.fillText('📖 卡文迪什扭秤工作原理', px2 + 10, py2 + 8)

    const lines = [
      { t: '1. 结构', c: '#0288D1', f: 'bold 11px sans-serif' },
      { t: '   悬丝吊横杆，两端各一个小球 m', c: '#333', f: '11px sans-serif' },
      { t: '   旁边放两个大球 M（固定不动）', c: '#333', f: '11px sans-serif' },
      { t: '', h: 5 },
      { t: '2. 原理', c: '#0288D1', f: 'bold 11px sans-serif' },
      { t: '   M 对 m 产生万有引力', c: '#333', f: '11px sans-serif' },
      { t: '   引力使横杆绕悬丝扭转角度 θ', c: '#333', f: '11px sans-serif' },
      { t: '', h: 5 },
      { t: '3. 条件（极严苛）', c: '#0288D1', f: 'bold 11px sans-serif' },
      { t: '   必须在真空中', c: '#E65100', f: '11px sans-serif' },
      { t: '   悬丝要极细极轻', c: '#888', f: '10px sans-serif' },
      { t: '', h: 5 },
      { t: '4. 求 G', c: '#0288D1', f: 'bold 11px sans-serif' },
      { t: '   F=GMm/r² 和 F=Kθ 联立', c: '#333', f: '11px sans-serif' },
      { t: '   → G = Kθr²/(Mm)', c: '#E65100', f: 'bold 11px sans-serif' },
    ]
    let ly = py2 + 28
    for (const line of lines) {
      if (!line.t && line.h) { ly += line.h; continue }
      ctx.fillStyle = line.c; ctx.font = line.f; ctx.fillText(line.t, px2 + 10, ly); ly += 15
    }

    // 面板
    const measuredG = (angleRad / (8 / (computeForce(50, 50, 3) * VIS_SCALE))) * st.r * st.r / (st.m1 * st.m2)
    const deviation = Math.abs((measuredG - G_CONST) / G_CONST * 100)

    const rows = [
      { text: '条件：真空中，极微小引力', color: '#888', font: '10px sans-serif' },
      { text: '', h: 4 },
      { text: `M = ${st.m1} kg（大球）`, color: '#666' },
      { text: `m = ${st.m2} kg（小球）`, color: '#666' },
      { text: `r = ${st.r.toFixed(2)} m`, color: '#666' },
      { text: '', h: 4 },
      { text: `F = ${F.toExponential(3)} N`, color: '#0288D1', font: 'bold 11px sans-serif' },
      { text: `扭角 θ = ${angleDeg.toFixed(2)}°`, color: '#E65100', font: 'bold 11px sans-serif' },
      { text: '', h: 4 },
      { text: `测得 G = ${measuredG.toExponential(3)}`, color: '#4CAF50' },
      { text: `标准 G = 6.674×10⁻¹¹`, color: '#888', font: '10px sans-serif' },
      { text: `偏差 ≈ ${deviation.toFixed(1)}%`, color: '#888', font: '10px sans-serif' },
      { text: '', h: 6 },
      { text: '从扭角反推 G 值', color: '#E65100', font: 'bold 10px sans-serif' },
    ]
    drawPanel(ctx, R.W - 220, 16, 205, 260, '📊 测 G', rows)

    ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'
    ctx.fillText('万有引力定律', 16, R.H - 46)
    ctx.fillStyle = '#0288D1'; ctx.font = 'bold 13px serif'
    ctx.fillText('F = GMm/r²', 136, R.H - 46)
    ctx.textBaseline = 'alphabetic'
  }

  // ========== 1/r² 曲线图 ==========
  function drawGraph(ctx, R) {
    const st = S.current
    const gw = 210, gh = 120, gx = 16, gy = 16

    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, 8); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('📈 F - 1/r² 图像', gx + 10, gy + 6)

    const ox = gx + 38, oy = gy + gh - 20, w = gw - 52, h = gh - 36
    ctx.strokeStyle = '#bbb'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(ox, oy - h); ctx.lineTo(ox, oy); ctx.lineTo(ox + w, oy); ctx.stroke()

    const rMin = 0.5, rMax = 6.0
    const invMin = 1 / (rMax * rMax), invMax = 1 / (rMin * rMin)
    const fMax = computeForce(st.m1, st.m2, rMin) * VIS_SCALE
    const fMin = computeForce(st.m1, st.m2, rMax) * VIS_SCALE

    ctx.strokeStyle = '#E65100'; ctx.lineWidth = 2; ctx.beginPath()
    for (let i = 0; i <= 50; i++) {
      const rv = rMin + (i / 50) * (rMax - rMin)
      const inv = 1 / (rv * rv)
      const fv = computeForce(st.m1, st.m2, rv) * VIS_SCALE
      const px = ox + ((inv - invMin) / (invMax - invMin)) * w
      const py = oy - ((fv - fMin) / (fMax - fMin)) * h
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
    }
    ctx.stroke()

    const ci = 1 / (st.r * st.r), cf = computeForce(st.m1, st.m2, st.r) * VIS_SCALE
    const cpx = ox + ((ci - invMin) / (invMax - invMin)) * w
    const cpy = oy - ((cf - fMin) / (fMax - fMin)) * h
    ctx.fillStyle = '#D32F2F'; ctx.beginPath(); ctx.arc(cpx, cpy, 5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#D32F2F'; ctx.font = '9px monospace'
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'
    ctx.fillText(`(${ci.toFixed(3)}, ${cf.toFixed(1)})`, cpx + 8, cpy - 2)

    ctx.fillStyle = '#888'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('1/r²', ox + w / 2, oy + 4)
  }

  // ========== 引导气泡 ==========
  function drawGuideBubble(ctx, R) {
    if (S.current.guideDismissed) return
    const st = S.current
    const text = st.mode === 'inverse' ? '👆 调节距离 r，观察引力随 1/r² 变化'
      : st.mode === 'mass' ? '👆 调节 M 和 m，观察引力与 M×m 的关系'
      : '👆 调节 r 和质量，观察扭秤偏转角变化'
    const bx = R.W / 2, by = R.H * 0.55
    ctx.font = '13px sans-serif'
    const tw = ctx.measureText(text).width + 24, th = 32
    const ry = by + Math.sin(Date.now() / 600) * 4
    ctx.fillStyle = 'rgba(2,136,209,0.12)'; ctx.beginPath(); ctx.roundRect(bx - tw / 2, ry - th / 2, tw, th, 16); ctx.fill()
    ctx.strokeStyle = 'rgba(2,136,209,0.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(bx - tw / 2, ry - th / 2, tw, th, 16); ctx.stroke()
    ctx.fillStyle = '#0288D1'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(text, bx, ry); ctx.textBaseline = 'alphabetic'
  }

  // ========== Controls ==========
  const hM1 = useCallback((v) => { S.current.m1 = v; S.current.guideDismissed = true; setM1(v) }, [])
  const hM2 = useCallback((v) => { S.current.m2 = v; S.current.guideDismissed = true; setM2(v) }, [])
  const hR = useCallback((v) => { S.current.r = v; S.current.guideDismissed = true; setR(v) }, [])
  const hMode = useCallback((m) => { S.current.mode = m; setMode(m) }, [])

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <span style={styles.title}>万有引力定律</span>
        <div style={styles.actions}>
          <div style={styles.modeGroup}>
            {[{ key: 'inverse', label: 'F∝1/r²' }, { key: 'mass', label: 'F∝Mm' }, { key: 'cavendish', label: '测G' }].map(m => (
              <button key={m.key} style={mode === m.key ? styles.modeBtnA : styles.modeBtn}
                onClick={() => hMode(m.key)}>{m.label}</button>
            ))}
          </div>
          <label style={styles.lbl}>质量M：<input type="range" min="10" max="100" step="5" value={m1}
            onChange={(e) => hM1(parseFloat(e.target.value))} style={styles.slider} /><span style={styles.val}>{m1}</span></label>
          <label style={styles.lbl}>质量m：<input type="range" min="10" max="100" step="5" value={m2}
            onChange={(e) => hM2(parseFloat(e.target.value))} style={styles.slider} /><span style={styles.val}>{m2}</span></label>
          <label style={styles.lbl}>距离r：<input type="range" min="0.5" max="6" step="0.1" value={r}
            onChange={(e) => hR(parseFloat(e.target.value))} style={styles.slider} /><span style={styles.val}>{r.toFixed(1)}m</span></label>
        </div>
      </div>
      <div style={styles.main}><canvas ref={canvasRef} style={{ flex: 1, width: '100%' }} /></div>
      <div style={styles.desc}>
        <b>万有引力定律</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>F = GMm/r² · 验证引力与距离、质量的关系 · 卡文迪什扭秤测量G</span>
      </div>
    </div>
  )
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#f0f4f8', color: '#333', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  toolbar: { minHeight: 44, background: '#f5f5f5', borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', flexShrink: 0, flexWrap: 'wrap', gap: 6 },
  title: { fontSize: 14, fontWeight: 600, color: '#333' },
  actions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  lbl: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#666' },
  slider: { width: 70, accentColor: '#4FC3F7' },
  val: { color: '#0288D1', fontWeight: 600, minWidth: 35, fontSize: 12 },
  modeGroup: { display: 'flex', gap: 4 },
  modeBtn: { background: '#f0f0f0', color: '#666', border: '1px solid #ddd', borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer' },
  modeBtnA: { background: '#0288D1', color: '#fff', border: '1px solid #0288D1', borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer', fontWeight: 600 },
  main: { flex: 1, display: 'flex', overflow: 'hidden' },
  desc: { padding: '8px 14px', background: '#f5f5f5', borderTop: '1px solid #ccc', fontSize: 13, color: '#333' },
}
