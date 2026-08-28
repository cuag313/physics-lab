import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * UniversalGravitationScene — 万有引力定律（v2 重写）
 *
 * 严格来说不是"实验"，是公式的验证：
 * 1. F ∝ 1/r² — 距离越远，引力越小（M、m 固定，只动 r）
 * 2. F ∝ M·m — 引力与质量乘积成正比（r 固定，动 M、m）
 * 3. 测 G — 卡文迪什扭秤（真空，条件严苛）
 */

const G_CONST = 6.674e-11
const VIS_SCALE = 1e10

function computeForce(m1, m2, r) {
  return G_CONST * m1 * m2 / (r * r)
}

// 卡文迪什偏转角：M=50,m=50,r=3 → θ≈8°
const K_THETA = 8 / (computeForce(50, 50, 3) * VIS_SCALE)
const MAX_ANGLE_DEG = 75

function getCavendishAngle(m1, m2, r) {
  return Math.min(MAX_ANGLE_DEG, K_THETA * computeForce(m1, m2, r) * VIS_SCALE)
}

// ─── 球体绘制 ───
function drawMass(ctx, x, y, mass, color, label) {
  const r = Math.max(14, Math.min(32, 10 + mass * 0.3))
  const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r)
  grad.addColorStop(0, color)
  grad.addColorStop(1, color.length <= 7 ? color + '80' : color)
  ctx.fillStyle = grad
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(label, x, y)
}

// ─── 力箭头 ───
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

// ─── 面板绘制 ───
function drawPanel(ctx, px, py, pw, ph, title, rows) {
  ctx.fillStyle = 'rgba(22,27,34,0.95)'
  ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.fill()
  ctx.strokeStyle = '#30363d'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.stroke()

  ctx.textBaseline = 'top'; ctx.textAlign = 'left'
  ctx.fillStyle = '#c9d1d9'; ctx.font = 'bold 12px sans-serif'
  ctx.fillText(title, px + 12, py + 10)

  let y = py + 30
  for (const row of rows) {
    ctx.fillStyle = row.color || '#8b949e'
    ctx.font = row.font || '11px sans-serif'
    ctx.fillText(row.text, px + 12, y)
    y += row.h || 17
  }
}

export default function UniversalGravitationScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({ mode: 'inverse', m1: 50, m2: 50, r: 3.0, time: 0 })

  const [m1, setM1] = useState(50)
  const [m2, setM2] = useState(50)
  const [r, setR] = useState(3.0)
  const [mode, setMode] = useState('inverse')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const R = {
      canvas, ctx: canvas.getContext('2d'),
      W: 0, H: 0, ox: 0, oy: 0, scale: 80,
      resize() {
        const rect = canvas.getBoundingClientRect()
        canvas.width = rect.width; canvas.height = rect.height
        this.W = rect.width; this.H = rect.height
        this.ox = this.W * 0.42; this.oy = this.H * 0.42
      },
      w2s(wx, wy) { return [this.ox + wx * this.scale, this.oy - wy * this.scale] },
    }
    R.resize()

    const loop = () => {
      S.current.time += 1 / 60
      render(R)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)

    const onResize = () => R.resize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [])

  // ========== 渲染主循环 ==========
  function render(R) {
    const ctx = R.ctx
    ctx.clearRect(0, 0, R.W, R.H)

    // 背景
    const grad = ctx.createRadialGradient(R.ox, R.oy, 0, R.ox, R.oy, R.W * 0.6)
    grad.addColorStop(0, '#0d1b2a'); grad.addColorStop(1, '#000')
    ctx.fillStyle = grad; ctx.fillRect(0, 0, R.W, R.H)

    const s = S.current
    if (s.mode === 'inverse') drawInverse(ctx, R)
    else if (s.mode === 'mass') drawMassMode(ctx, R)
    else drawCavendish(ctx, R)

    // 底部标题（面板由各模式自己画，最后画底部文字）
    ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    ctx.fillStyle = '#c9d1d9'; ctx.font = 'bold 14px sans-serif'
    ctx.fillText('万有引力定律', 16, R.H - 28)
    ctx.fillStyle = '#4FC3F7'; ctx.font = 'bold 13px serif'
    ctx.fillText('F = GMm/r²', 136, R.H - 28)
  }

  // ========== 模式一：F ∝ 1/r² ==========
  function drawInverse(ctx, R) {
    const s = S.current
    const F = computeForce(s.m1, s.m2, s.r)
    const halfR = s.r / 2

    // 两个球体
    const [x1, y1] = R.w2s(-halfR, 0)
    const [x2, y2] = R.w2s(halfR, 0)
    drawMass(ctx, x1, y1, s.m1, '#4FC3F7', 'M')
    drawMass(ctx, x2, y2, s.m2, '#FF9800', 'm')

    // 引力箭头
    const fLen = Math.min(Math.log10(F * VIS_SCALE + 1) * 30, 100)
    if (fLen > 3) {
      drawArrow(ctx, x1 + 25, y1, x1 + 25 + fLen, y1, '#4CAF50', 'F')
      drawArrow(ctx, x2 - 25, y2, x2 - 25 - fLen, y2, '#4CAF50', 'F')
    }

    // 距离标注
    ctx.strokeStyle = 'rgba(255,213,79,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(x1, y1 + 45); ctx.lineTo(x2, y2 + 45); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#FFD54F'; ctx.font = '11px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(`r = ${s.r.toFixed(1)} m`, (x1 + x2) / 2, y1 + 50)

    // 1/r² 曲线图
    drawGraph(ctx, R)

    // 面板：参数 → 结果 → 说明
    const rows = [
      { text: 'M、m 固定，只改变距离 r', color: '#8b949e', font: '10px sans-serif' },
      { text: '', h: 4 },
      { text: `M = ${s.m1} kg`, color: '#8b949e' },
      { text: `m = ${s.m2} kg`, color: '#8b949e' },
      { text: `r = ${s.r.toFixed(2)} m`, color: '#8b949e' },
      { text: '', h: 4 },
      { text: `F = ${F.toExponential(3)} N`, color: '#4FC3F7', font: 'bold 11px sans-serif' },
      { text: '', h: 4 },
      { text: `1/r² = ${(1 / (s.r * s.r)).toFixed(4)}`, color: '#FF9800' },
      { text: '', h: 6 },
      { text: '距离越远，引力越小', color: '#FFD54F', font: 'bold 10px sans-serif' },
      { text: '', h: 6 },
      { text: 'F = GMm/r²', color: '#FFD54F', font: 'bold 10px sans-serif' },
      { text: `G = 6.674×10⁻¹¹`, color: '#8b949e', font: '10px sans-serif' },
    ]
    drawPanel(ctx, R.W - 220, 16, 205, 260, '📊 F ∝ 1/r²', rows)
  }

  // ========== 模式二：F ∝ M·m ==========
  function drawMassMode(ctx, R) {
    const s = S.current
    const F = computeForce(s.m1, s.m2, s.r)
    const currentMM = s.m1 * s.m2

    // 三根柱子：固定 r，展示不同 M×m 对应的 F
    const configs = [
      { m1: 10, m2: 10, label: 'M=10\nm=10', color: '#5a7a9a' },
      { m1: s.m1, m2: s.m2, label: `M=${s.m1}\nm=${s.m2}`, color: '#FF9800' },
      { m1: 50, m2: 50, label: 'M=50\nm=50', color: '#3a9aba' },
    ]

    const barW = 70, gap = 30
    const totalW = configs.length * (barW + gap) - gap
    const chartLeft = (R.W - 220 - totalW) / 2 + 20
    const baseY = R.oy + 140
    const maxBarH = 150

    const maxMM = 2500
    const maxF = computeForce(maxMM, 1, s.r)

    // 标题
    ctx.fillStyle = '#c9d1d9'; ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('引力与质量乘积成正比  F ∝ M·m', R.W / 2 - 100, baseY - maxBarH - 36)
    ctx.fillStyle = '#8b949e'; ctx.font = '11px sans-serif'
    ctx.fillText(`固定 r = ${s.r.toFixed(1)}m，改变 M 和 m`, R.W / 2 - 100, baseY - maxBarH - 18)

    configs.forEach((cfg, i) => {
      const mm = cfg.m1 * cfg.m2
      const fVal = computeForce(cfg.m1, cfg.m2, s.r)
      const barH = Math.max(8, (fVal / maxF) * maxBarH)
      const x = chartLeft + i * (barW + gap)
      const isCurrent = i === 1

      // 柱子
      ctx.fillStyle = cfg.color
      ctx.beginPath(); ctx.roundRect(x, baseY - barH, barW, barH, [4, 4, 0, 0]); ctx.fill()

      if (isCurrent) {
        ctx.strokeStyle = '#FFD54F'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.roundRect(x, baseY - barH, barW, barH, [4, 4, 0, 0]); ctx.stroke()
      }

      // 标签（两行：M=xx 和 m=xx）
      ctx.fillStyle = isCurrent ? '#FFD54F' : '#c9d1d9'
      ctx.font = isCurrent ? 'bold 11px sans-serif' : '10px sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText(`M=${cfg.m1}, m=${cfg.m2}`, x + barW / 2, baseY + 6)

      // F 值
      ctx.fillStyle = '#8b949e'; ctx.font = '9px sans-serif'
      ctx.fillText(`F=${fVal.toExponential(1)}`, x + barW / 2, baseY + 22)

      // M×m 值
      ctx.fillStyle = '#6a7a8a'; ctx.font = '9px sans-serif'
      ctx.fillText(`M×m=${mm}`, x + barW / 2, baseY + 35)
    })

    // 底部说明
    ctx.fillStyle = '#8b949e'; ctx.font = '11px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('M×m 越大 → F 越大，这就是 F∝Mm', R.W / 2 - 100, baseY + 55)

    // 面板
    const rows = [
      { text: 'r 固定，改变 M 和 m', color: '#8b949e', font: '10px sans-serif' },
      { text: '', h: 4 },
      { text: `M = ${s.m1} kg`, color: '#8b949e' },
      { text: `m = ${s.m2} kg`, color: '#8b949e' },
      { text: `r = ${s.r.toFixed(2)} m`, color: '#8b949e' },
      { text: '', h: 4 },
      { text: `M×m = ${currentMM}`, color: '#FF9800' },
      { text: `F = ${F.toExponential(3)} N`, color: '#4FC3F7', font: 'bold 11px sans-serif' },
      { text: '', h: 6 },
      { text: '质量乘积越大，引力越大', color: '#FFD54F', font: 'bold 10px sans-serif' },
      { text: '', h: 6 },
      { text: 'F = GMm/r²', color: '#FFD54F', font: 'bold 10px sans-serif' },
      { text: `G = 6.674×10⁻¹¹`, color: '#8b949e', font: '10px sans-serif' },
    ]
    drawPanel(ctx, R.W - 220, 16, 205, 245, '📊 F ∝ M·m', rows)
  }

  // ========== 模式三：测 G — 卡文迪什扭秤 ==========
  function drawCavendish(ctx, R) {
    const s = S.current
    const angleDeg = getCavendishAngle(s.m1, s.m2, s.r)
    const angleRad = angleDeg * Math.PI / 180
    const F = computeForce(s.m1, s.m2, s.r)

    const [cx, cy] = R.w2s(0, 0)

    // 悬丝
    ctx.strokeStyle = '#a0aec0'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(cx, cy - 80); ctx.lineTo(cx, cy); ctx.stroke()

    // 横杆
    const barLen = 120
    const x1 = cx - barLen * Math.cos(angleRad)
    const y1 = cy - barLen * Math.sin(angleRad)
    const x2 = cx + barLen * Math.cos(angleRad)
    const y2 = cy + barLen * Math.sin(angleRad)

    ctx.strokeStyle = '#6e7681'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()

    // 小球 m
    drawMass(ctx, x1, y1, 1, '#4FC3F7', 'm')
    drawMass(ctx, x2, y2, 1, '#4FC3F7', 'm')

    // 大球 M
    const bigR = 100, bigAngle = 0.3
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
      ctx.strokeStyle = '#FFD54F'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(cx, cy, 50, -angleRad, 0); ctx.stroke()
      ctx.fillStyle = '#FFD54F'; ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      ctx.fillText(`θ=${angleDeg.toFixed(2)}°`, cx + 54, cy - 14)
    }

    // 标题
    ctx.fillStyle = '#FFD54F'; ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('卡文迪什扭秤实验', cx, cy - 110)
    ctx.fillStyle = '#8b949e'; ctx.font = '10px sans-serif'
    ctx.fillText('真空中测量万有引力常数 G', cx, cy - 94)

    // ─── 左上角：工作原理讲解 ───
    const px2 = 16, py2 = 16, pw2 = 250, ph2 = 280
    ctx.fillStyle = 'rgba(22,27,34,0.92)'
    ctx.beginPath(); ctx.roundRect(px2, py2, pw2, ph2, 8); ctx.fill()
    ctx.strokeStyle = '#30363d'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(px2, py2, pw2, ph2, 8); ctx.stroke()

    ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    ctx.fillStyle = '#c9d1d9'; ctx.font = 'bold 12px sans-serif'
    ctx.fillText('📖 卡文迪什扭秤工作原理', px2 + 10, py2 + 8)

    const explainLines = [
      { t: '1. 结构', c: '#4FC3F7', f: 'bold 11px sans-serif' },
      { t: '   悬丝吊着横杆，两端各一个小球 m', c: '#c9d1d9', f: '11px sans-serif' },
      { t: '   旁边放置两个大球 M（固定不动）', c: '#c9d1d9', f: '11px sans-serif' },
      { t: '', h: 5 },
      { t: '2. 原理', c: '#4FC3F7', f: 'bold 11px sans-serif' },
      { t: '   M 对 m 产生万有引力', c: '#c9d1d9', f: '11px sans-serif' },
      { t: '   引力使横杆绕悬丝扭转角度 θ', c: '#c9d1d9', f: '11px sans-serif' },
      { t: '', h: 5 },
      { t: '3. 条件（极严苛）', c: '#4FC3F7', f: 'bold 11px sans-serif' },
      { t: '   必须在真空中——避免空气浮力', c: '#FF9800', f: '11px sans-serif' },
      { t: '   和气流干扰微小引力', c: '#FF9800', f: '11px sans-serif' },
      { t: '   悬丝要极细极轻，减少摩擦', c: '#8b949e', f: '10px sans-serif' },
      { t: '', h: 5 },
      { t: '4. 求 G', c: '#4FC3F7', f: 'bold 11px sans-serif' },
      { t: '   测出 θ，已知 M、m、r', c: '#c9d1d9', f: '11px sans-serif' },
      { t: '   由 F=GMm/r² 和 F=Kθ', c: '#c9d1d9', f: '11px sans-serif' },
      { t: '   联立得 G=Kθr²/(Mm)', c: '#FFD54F', f: 'bold 11px sans-serif' },
      { t: '', h: 4 },
      { t: '   K = 悬丝扭转刚度（N·m/rad）', c: '#8b949e', f: '10px sans-serif' },
      { t: '   由悬丝材料和几何决定', c: '#8b949e', f: '10px sans-serif' },
    ]
    let ly = py2 + 28
    for (const line of explainLines) {
      if (!line.t && line.h) { ly += line.h; continue }
      ctx.fillStyle = line.c; ctx.font = line.f
      ctx.fillText(line.t, px2 + 10, ly)
      ly += 15
    }

    // 面板
    const angleRad2 = angleDeg * Math.PI / 180
    const measuredG = (angleRad2 / K_THETA) * s.r * s.r / (s.m1 * s.m2)
    const deviation = Math.abs((measuredG - G_CONST) / G_CONST * 100)

    const rows = [
      { text: '条件：真空中，极微小引力', color: '#8b949e', font: '10px sans-serif' },
      { text: '', h: 4 },
      { text: `M = ${s.m1} kg（大球）`, color: '#8b949e' },
      { text: `m = ${s.m2} kg（小球）`, color: '#8b949e' },
      { text: `r = ${s.r.toFixed(2)} m`, color: '#8b949e' },
      { text: '', h: 4 },
      { text: `F = ${F.toExponential(3)} N`, color: '#4FC3F7', font: 'bold 11px sans-serif' },
      { text: `扭角 θ = ${angleDeg.toFixed(2)}°`, color: '#FF9800', font: 'bold 11px sans-serif' },
      { text: '', h: 4 },
      { text: `测得 G = ${measuredG.toExponential(3)}`, color: '#4CAF50' },
      { text: `标准 G = 6.674×10⁻¹¹`, color: '#8b949e', font: '10px sans-serif' },
      { text: `偏差 ≈ ${deviation.toFixed(1)}%`, color: '#8b949e', font: '10px sans-serif' },
      { text: '', h: 6 },
      { text: '从扭角反推 G 值', color: '#FFD54F', font: 'bold 10px sans-serif' },
    ]
    drawPanel(ctx, R.W - 220, 16, 205, 270, '📊 测 G', rows)
  }

  // ========== 1/r² 曲线图 ==========
  function drawGraph(ctx, R) {
    const s = S.current
    const gw = 210, gh = 120, gx = 16, gy = 16

    ctx.fillStyle = 'rgba(22,27,34,0.95)'
    ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, 8); ctx.fill()
    ctx.strokeStyle = '#30363d'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, 8); ctx.stroke()

    ctx.fillStyle = '#c9d1d9'; ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('📈 F - 1/r² 图像', gx + 10, gy + 6)

    const ox = gx + 38, oy = gy + gh - 20, w = gw - 52, h = gh - 36
    ctx.strokeStyle = '#484f58'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(ox, oy - h); ctx.lineTo(ox, oy); ctx.lineTo(ox + w, oy); ctx.stroke()

    const rMin = 0.5, rMax = 6.0
    const invMin = 1 / (rMax * rMax), invMax = 1 / (rMin * rMin)
    const fMax = computeForce(s.m1, s.m2, rMin) * VIS_SCALE
    const fMin = computeForce(s.m1, s.m2, rMax) * VIS_SCALE

    // 曲线
    ctx.strokeStyle = '#FF9800'; ctx.lineWidth = 2; ctx.beginPath()
    for (let i = 0; i <= 50; i++) {
      const rv = rMin + (i / 50) * (rMax - rMin)
      const inv = 1 / (rv * rv)
      const fv = computeForce(s.m1, s.m2, rv) * VIS_SCALE
      const px = ox + ((inv - invMin) / (invMax - invMin)) * w
      const py = oy - ((fv - fMin) / (fMax - fMin)) * h
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
    }
    ctx.stroke()

    // 红点
    const ci = 1 / (s.r * s.r), cf = computeForce(s.m1, s.m2, s.r) * VIS_SCALE
    const cpx = ox + ((ci - invMin) / (invMax - invMin)) * w
    const cpy = oy - ((cf - fMin) / (fMax - fMin)) * h
    ctx.fillStyle = '#F44336'; ctx.beginPath(); ctx.arc(cpx, cpy, 5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#F44336'; ctx.font = '9px monospace'
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'
    ctx.fillText(`(${ci.toFixed(3)}, ${cf.toFixed(1)})`, cpx + 8, cpy - 2)

    ctx.fillStyle = '#484f58'; ctx.font = '9px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('1/r²', ox + w / 2, oy + 4)
  }

  // ========== Controls ==========
  const hM1 = useCallback((v) => { S.current.m1 = v; setM1(v) }, [])
  const hM2 = useCallback((v) => { S.current.m2 = v; setM2(v) }, [])
  const hR = useCallback((v) => { S.current.r = v; setR(v) }, [])
  const hMode = useCallback((m) => { S.current.mode = m; setMode(m) }, [])

  return (
    <div style={s.container}>
      <div style={s.toolbar}>
        <span style={s.title}>万有引力定律</span>
        <div style={s.actions}>
          <div style={s.modeGroup}>
            {[
              { key: 'inverse', label: 'F∝1/r²' },
              { key: 'mass', label: 'F∝Mm' },
              { key: 'cavendish', label: '测G' },
            ].map(m => (
              <button key={m.key}
                style={mode === m.key ? s.modeBtnA : s.modeBtn}
                onClick={() => hMode(m.key)}>
                {m.label}
              </button>
            ))}
          </div>
          <label style={s.lbl}>
            质量M：
            <input type="range" min="10" max="100" step="5" value={m1}
              onChange={(e) => hM1(parseFloat(e.target.value))} style={s.slider} />
            <span style={s.val}>{m1}</span>
          </label>
          <label style={s.lbl}>
            质量m：
            <input type="range" min="10" max="100" step="5" value={m2}
              onChange={(e) => hM2(parseFloat(e.target.value))} style={s.slider} />
            <span style={s.val}>{m2}</span>
          </label>
          <label style={s.lbl}>
            距离r：
            <input type="range" min="0.5" max="6" step="0.1" value={r}
              onChange={(e) => hR(parseFloat(e.target.value))} style={s.slider} />
            <span style={s.val}>{r.toFixed(1)}m</span>
          </label>
        </div>
      </div>
      <div style={s.main}>
        <canvas ref={canvasRef} style={{ flex: 1, width: '100%' }} />
      </div>
      <div style={s.desc}>
        <b>万有引力定律</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          F = GMm/r² · 验证引力与距离、质量的关系 · 卡文迪什扭秤测量G
        </span>
      </div>
    </div>
  )
}

const s = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#000', color: '#e0e0e0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  toolbar: { minHeight: 44, background: '#0d1b2a', borderBottom: '1px solid #1b2838', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', flexShrink: 0, flexWrap: 'wrap', gap: 6 },
  title: { fontSize: 14, fontWeight: 600, color: '#c9d1d9' },
  actions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  lbl: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8b949e' },
  slider: { width: 70, accentColor: '#4FC3F7' },
  val: { color: '#4FC3F7', fontWeight: 600, minWidth: 35, fontSize: 12 },
  modeGroup: { display: 'flex', gap: 4 },
  modeBtn: { background: '#1b2838', color: '#8b949e', border: '1px solid #2d3f52', borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer' },
  modeBtnA: { background: '#4FC3F7', color: '#000', border: '1px solid #4FC3F7', borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer', fontWeight: 600 },
  main: { flex: 1, display: 'flex', overflow: 'hidden' },
  desc: { padding: '8px 14px', background: '#0d1b2a', borderTop: '1px solid #1b2838', fontSize: 13, color: '#c9d1d9' },
}
