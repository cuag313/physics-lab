import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * FrictionForceScene — 探究滑动摩擦力影响因素（v2）
 *
 * 物理模型：
 * - 静止时：f = F（静摩擦），上限 f_max = μₛ·N
 * - 滑动时：f = μₖ·N（滑动摩擦力）
 * - 匀速时：F = f，可验证 f = μN
 *
 * 交互：拖拽拉力计 / 自动匀速 / 记录数据 / f-N 曲线
 */

// ─── 统一材质配置表（所有 UI 从这里读取）───
const SURFACES = {
  wood:   { name: '木板', muS: 0.60, muK: 0.40, color: '#8B6914', blockColor: '#e06060' },
  towel:  { name: '毛巾', muS: 0.80, muK: 0.60, color: '#7B8B6F', blockColor: '#d05050' },
  ice:    { name: '冰面', muS: 0.10, muK: 0.05, color: '#B0E0E6', blockColor: '#f08080' },
}

const G = 9.8
const BLOCK_MASS = 2 // kg

export default function FrictionForceScene() {
  const canvasRef = useRef(null)
  const RRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    blockX: 0, blockV: 0,
    pullForce: 0, frictionForce: 0,
    normalForce: BLOCK_MASS * G,
    addedMass: 0,
    surface: 'wood',
    isMoving: false,
    pullerX: -3,
    autoMode: false,
    autoSpeed: 0.5, // m/s
    time: 0,
  })

  const [surface, setSurface] = useState('wood')
  const [addedMass, setAddedMass] = useState(0)
  const [autoMode, setAutoMode] = useState(false)
  const [records, setRecords] = useState([])
  const [showChart, setShowChart] = useState(false)
  const [ui, setUi] = useState({
    pullForce: 0, frictionForce: 0, normalForce: 20,
    isMoving: false, speed: 0, accel: 0,
  })

  // 同步材质
  useEffect(() => { S.current.surface = surface }, [surface])
  // 同步砝码
  useEffect(() => { S.current.addedMass = addedMass; S.current.normalForce = (BLOCK_MASS + addedMass) * G }, [addedMass])
  // 同步自动模式
  useEffect(() => { S.current.autoMode = autoMode }, [autoMode])

  // ─── 渲染器 ───
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const R = {
      canvas, ctx: canvas.getContext('2d'),
      W: 0, H: 0, scale: 60, ox: 0, oy: 0,
      resize() {
        const rect = canvas.getBoundingClientRect()
        canvas.width = rect.width; canvas.height = rect.height
        this.W = rect.width; this.H = rect.height
        this.ox = this.W / 2; this.oy = this.H * 0.62
      },
      w2s(wx, wy) { return [this.ox + wx * this.scale, this.oy - wy * this.scale] },
      s2w(sx, sy) { return [(sx - this.ox) / this.scale, (this.oy - sy) / this.scale] },
    }
    R.resize()
    RRef.current = R

    const loop = () => { step(); draw(); animRef.current = requestAnimationFrame(loop) }
    animRef.current = requestAnimationFrame(loop)
    const onResize = () => R.resize()
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); cancelAnimationFrame(animRef.current) }
  }, [])

  // ─── 物理步进 ───
  function step() {
    const s = S.current
    const dt = 1 / 60
    s.time += dt

    const surf = SURFACES[s.surface]
    const N = s.normalForce
    const fMax = surf.muS * N
    const fK = surf.muK * N
    const mass = BLOCK_MASS + s.addedMass

    // 自动匀速模式
    if (s.autoMode) {
      // 目标：匀速运动，拉力 = 滑动摩擦力
      s.isMoving = true
      s.frictionForce = fK
      s.pullForce = fK
      s.blockV = s.autoSpeed
      s.blockX += s.blockV * dt
    } else {
      // 手动模式 — 摩擦力状态机
      if (Math.abs(s.blockV) < 0.05) {
        // 静止状态
        s.isMoving = false
        if (Math.abs(s.pullForce) < fMax) {
          // 静摩擦：f = F
          s.frictionForce = -Math.sign(s.pullForce || 1) * Math.abs(s.pullForce)
          s.blockV = 0
        } else {
          // 突破最大静摩擦，开始滑动
          s.isMoving = true
          s.frictionForce = -Math.sign(s.pullForce) * fK
        }
      } else {
        // 滑动状态
        s.isMoving = true
        s.frictionForce = -Math.sign(s.blockV) * fK
      }

      // 牛顿第二定律
      const Fnet = s.pullForce + s.frictionForce
      const a = Fnet / mass
      s.blockV += a * dt

      // 速度归零检测
      if (s.isMoving && Math.abs(s.blockV) < 0.01 && Math.abs(s.pullForce) < fK * 0.9) {
        s.blockV = 0
        s.isMoving = false
      }

      s.blockX += s.blockV * dt
    }

    // 边界
    if (s.blockX < -3) { s.blockX = -3; s.blockV = 0 }
    if (s.blockX > 4) { s.blockX = 4; s.blockV = 0 }

    // UI 数据
    const accel = s.autoMode ? 0 : (s.pullForce + s.frictionForce) / mass
    setUi({
      pullForce: s.pullForce,
      frictionForce: s.frictionForce,
      normalForce: N,
      isMoving: s.isMoving,
      speed: Math.abs(s.blockV),
      accel,
    })
  }

  // ─── 渲染 ───
  function draw() {
    const R = RRef.current
    if (!R) return
    const ctx = R.ctx
    ctx.clearRect(0, 0, R.W, R.H)

    drawBg(ctx, R)
    drawSurface(ctx, R)
    drawBlock(ctx, R)
    drawSpringScale(ctx, R)
    drawForces(ctx, R)
    drawPanel(ctx, R)
    drawBottom(ctx, R)
  }

  function drawBg(ctx, R) {
    const [, gy] = R.w2s(0, 0)
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, R.W, R.H)
    // 地面
    ctx.fillStyle = '#2a2a3e'
    ctx.fillRect(0, gy, R.W, R.H - gy)
    ctx.strokeStyle = '#3a3a5e'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(R.W, gy); ctx.stroke()
  }

  function drawSurface(ctx, R) {
    const surf = SURFACES[S.current.surface]
    const [, gy] = R.w2s(0, 0)
    const w = R.W

    ctx.fillStyle = surf.color
    ctx.globalAlpha = 0.35
    ctx.fillRect(w * 0.1, gy, w * 0.8, 6)
    ctx.globalAlpha = 1

    ctx.fillStyle = '#8b949e'; ctx.font = '11px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(`接触面：${surf.name}  μₛ=${surf.muS}  μₖ=${surf.muK}`, w / 2, gy + 12)
  }

  function drawBlock(ctx, R) {
    const s = S.current
    const surf = SURFACES[s.surface]
    const [bx, by] = R.w2s(s.blockX, 0)
    const sc = R.scale
    const bw = 1.2 * sc, bh = 0.8 * sc

    // 物块
    const grad = ctx.createLinearGradient(bx - bw / 2, by - bh, bx + bw / 2, by)
    grad.addColorStop(0, surf.blockColor)
    grad.addColorStop(1, surf.blockColor + '80')
    ctx.fillStyle = grad
    ctx.beginPath(); ctx.roundRect(bx - bw / 2, by - bh, bw, bh, 4); ctx.fill()
    ctx.strokeStyle = '#ffffff30'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(bx - bw / 2, by - bh, bw, bh, 4); ctx.stroke()

    // 质量标签
    const mass = BLOCK_MASS + s.addedMass
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(`${mass}kg`, bx, by - bh / 2)

    // 砝码
    if (s.addedMass > 0) {
      const wh = Math.max(8, (s.addedMass / 5) * bh * 0.6)
      ctx.fillStyle = '#4ECDC4'
      ctx.beginPath(); ctx.roundRect(bx - bw * 0.35, by - bh - wh, bw * 0.7, wh, 3); ctx.fill()
      ctx.strokeStyle = '#6EE7DE'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.roundRect(bx - bw * 0.35, by - bh - wh, bw * 0.7, wh, 3); ctx.stroke()
      ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(`+${s.addedMass}kg`, bx, by - bh - wh / 2)
    }
  }

  function drawSpringScale(ctx, R) {
    const s = S.current
    const [bx, by] = R.w2s(s.blockX, 0)
    const [px, py] = R.w2s(s.pullerX, 0)
    const sc = R.scale
    const sw = 0.5 * sc, sh = 0.35 * sc
    const hookX = bx - 0.7 * sc

    // 弹簧线
    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2
    const segs = 8, sLen = hookX - (px + sw / 2)
    ctx.beginPath(); ctx.moveTo(px + sw / 2, py - sh / 2)
    for (let i = 0; i < segs; i++) {
      const t = (i + 0.5) / segs
      ctx.lineTo(px + sw / 2 + sLen * t, py - sh / 2 + (i % 2 === 0 ? -5 : 5))
    }
    ctx.lineTo(hookX, py - sh / 2); ctx.stroke()

    // 测力计主体
    ctx.fillStyle = '#555'
    ctx.beginPath(); ctx.roundRect(px - sw / 2, py - sh, sw, sh, 4); ctx.fill()
    ctx.strokeStyle = '#888'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(px - sw / 2, py - sh, sw, sh, 4); ctx.stroke()

    // 读数
    ctx.fillStyle = '#4CAF50'; ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(`${Math.abs(s.pullForce).toFixed(1)}N`, px, py - sh / 2)

    // 自动模式速度
    if (s.autoMode) {
      ctx.fillStyle = '#FFD700'; ctx.font = '9px sans-serif'
      ctx.fillText(`v=${s.autoSpeed}m/s`, px, py - sh - 6)
    }

    // 钩子
    ctx.strokeStyle = '#aaa'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(hookX, py - sh / 2); ctx.lineTo(hookX, py - sh / 2 + 8); ctx.stroke()
  }

  function drawForces(ctx, R) {
    const s = S.current
    const [bx, by] = R.w2s(s.blockX, 0)
    const sc = R.scale
    const bh = 0.8 * sc
    const as = 3 // px per N

    // 拉力（向左）
    if (Math.abs(s.pullForce) > 0.2) {
      const len = Math.abs(s.pullForce) * as
      drawArrow(ctx, bx - 0.7 * sc, by - bh / 2, bx - 0.7 * sc - len, by - bh / 2, '#FFD700', `F=${Math.abs(s.pullForce).toFixed(1)}N`)
    }

    // 摩擦力（与运动/趋势方向相反）
    if (Math.abs(s.frictionForce) > 0.2) {
      const len = Math.abs(s.frictionForce) * as
      const dir = s.frictionForce > 0 ? 1 : -1
      drawArrow(ctx, bx, by - bh + 4, bx + dir * len, by - bh + 4, '#FF6B6B', `f=${Math.abs(s.frictionForce).toFixed(1)}N`)
    }

    // 正压力
    const nLen = s.normalForce * as * 0.2
    drawArrow(ctx, bx, by, bx, by + nLen, '#4A90D9', `N=${s.normalForce.toFixed(0)}N`)
  }

  function drawArrow(ctx, x1, y1, x2, y2, color, label) {
    const a = Math.atan2(y2 - y1, x2 - x1), hl = 7
    ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.85
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    ctx.fillStyle = color
    ctx.beginPath(); ctx.moveTo(x2, y2)
    ctx.lineTo(x2 - hl * Math.cos(a - 0.35), y2 - hl * Math.sin(a - 0.35))
    ctx.lineTo(x2 - hl * Math.cos(a + 0.35), y2 - hl * Math.sin(a + 0.35))
    ctx.closePath(); ctx.fill()
    ctx.globalAlpha = 1
    if (label) {
      ctx.fillStyle = color; ctx.font = '10px sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
      ctx.fillText(label, (x1 + x2) / 2, Math.min(y1, y2) - 4)
    }
  }

  // ─── 右侧数据面板 ───
  function drawPanel(ctx, R) {
    const s = S.current
    const surf = SURFACES[s.surface]
    const N = s.normalForce
    const pw = 210, ph = 280
    const px = R.W - pw - 12, py = 12

    ctx.fillStyle = 'rgba(22,27,34,0.95)'
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.fill()
    ctx.strokeStyle = '#30363d'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.stroke()

    ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    ctx.fillStyle = '#c9d1d9'; ctx.font = 'bold 12px sans-serif'
    ctx.fillText('📊 实验数据', px + 12, py + 10)

    let y = py + 30
    const LH = 16

    // 参数
    ctx.fillStyle = '#8b949e'; ctx.font = '11px sans-serif'
    ctx.fillText(`质量 m = ${(BLOCK_MASS + s.addedMass).toFixed(1)} kg`, px + 12, y); y += LH
    ctx.fillText(`正压力 N = ${N.toFixed(1)} N`, px + 12, y); y += LH
    ctx.fillText(`接触面：${surf.name}`, px + 12, y); y += LH + 4

    // 摩擦系数（统一配置）
    ctx.fillStyle = '#a0aec0'; ctx.font = '11px sans-serif'
    ctx.fillText(`静摩擦系数 μₛ = ${surf.muS.toFixed(2)}`, px + 12, y); y += LH
    ctx.fillText(`动摩擦系数 μₖ = ${surf.muK.toFixed(2)}`, px + 12, y); y += LH + 4

    // 力
    ctx.fillStyle = '#FFD700'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`拉力 F = ${ui.pullForce.toFixed(2)} N`, px + 12, y); y += LH
    ctx.fillStyle = '#FF6B6B'
    ctx.fillText(`摩擦力 f = ${Math.abs(ui.frictionForce).toFixed(2)} N`, px + 12, y); y += LH + 4

    // 状态
    ctx.fillStyle = ui.isMoving ? '#FF9800' : '#4CAF50'
    ctx.font = 'bold 11px sans-serif'
    ctx.fillText(ui.isMoving ? '⚡ 滑动中' : '⏸ 静止', px + 12, y); y += LH

    // 匀速检测 + f/μN
    const isUniform = Math.abs(ui.accel) < 0.05 && ui.isMoving
    const muForRatio = ui.isMoving ? surf.muK : surf.muS
    const ratio = N > 0 ? Math.abs(ui.frictionForce) / (muForRatio * N) : 0

    if (isUniform) {
      ctx.fillStyle = '#4CAF50'; ctx.font = '11px sans-serif'
      ctx.fillText(`f/μₖN = ${ratio.toFixed(2)} (应≈1)`, px + 12, y)
    } else if (ui.isMoving) {
      ctx.fillStyle = '#8b949e'; ctx.font = '10px sans-serif'
      ctx.fillText(`f/μₖN = ${ratio.toFixed(2)}`, px + 12, y)
      ctx.fillStyle = '#FF9800'; ctx.font = '9px sans-serif'
      ctx.fillText('未匀速，数据仅供参考', px + 12, y + 14)
    } else {
      ctx.fillStyle = '#8b949e'; ctx.font = '10px sans-serif'
      ctx.fillText(`f = ${Math.abs(ui.frictionForce).toFixed(1)}N / f_max = ${(surf.muS * N).toFixed(1)}N`, px + 12, y)
    }
  }

  function drawBottom(ctx, R) {
    const surf = SURFACES[S.current.surface]
    const y = R.H - 46
    ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    ctx.fillStyle = '#c9d1d9'; ctx.font = 'bold 13px sans-serif'
    ctx.fillText('探究滑动摩擦力', 16, y)
    ctx.fillStyle = '#4FC3F7'; ctx.font = 'bold 14px serif'
    ctx.fillText('f = μN', 136, y)
    ctx.fillStyle = '#8b949e'; ctx.font = '10px sans-serif'
    ctx.fillText(`接触面：${surf.name}  μₛ=${surf.muS}  μₖ=${surf.muK}`, 230, y)
    ctx.fillText(`静摩擦上限 ${(surf.muS * S.current.normalForce).toFixed(1)}N · 滑动摩擦 ${(surf.muK * S.current.normalForce).toFixed(1)}N`, 230, y + 14)
  }

  // ─── 数据记录 ───
  function recordData() {
    const s = S.current
    const surf = SURFACES[s.surface]
    const N = s.normalForce
    const isUniform = Math.abs(ui.accel) < 0.05 && ui.isMoving
    setRecords(prev => [...prev, {
      N: N.toFixed(1),
      f: Math.abs(ui.frictionForce).toFixed(2),
      surface: surf.name,
      uniform: isUniform,
    }])
  }

  // ─── 交互 ───
  const dragRef = useRef({ active: false })

  const handleMouseDown = useCallback((e) => {
    const R = RRef.current; if (!R) return
    const rect = canvasRef.current.getBoundingClientRect()
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top
    const s = S.current
    const [px, py] = R.w2s(s.pullerX, 0)
    if (Math.abs(sx - px) < 40 && Math.abs(sy - py) < 30) {
      dragRef.current.active = true
    }
  }, [])

  const handleMouseMove = useCallback((e) => {
    const R = RRef.current; if (!R) return
    const rect = canvasRef.current.getBoundingClientRect()
    const sx = e.clientX - rect.left
    if (dragRef.current.active) {
      const [wx] = R.s2w(sx, 0)
      S.current.pullForce = Math.max(-50, Math.min(50, (wx - S.current.pullerX) * 8))
    }
  }, [])

  const handleMouseUp = useCallback(() => {
    if (dragRef.current.active) {
      dragRef.current.active = false
      if (!S.current.autoMode) S.current.pullForce = 0
    }
  }, [])

  // ─── f-N 图表弹窗 ───
  function ChartModal() {
    if (!showChart || records.length === 0) return null
    const canvasW = 400, canvasH = 300
    const pad = { t: 30, r: 20, b: 40, l: 50 }
    const plotW = canvasW - pad.l - pad.r
    const plotH = canvasH - pad.t - pad.b

    // 数据
    const pts = records.filter(r => r.uniform).map(r => ({ N: parseFloat(r.N), f: parseFloat(r.f) }))
    const allPts = records.map(r => ({ N: parseFloat(r.N), f: parseFloat(r.f), uniform: r.uniform }))

    // 线性拟合
    let slope = 0, intercept = 0, r2 = 0
    if (pts.length >= 2) {
      const n = pts.length
      let sx = 0, sy = 0, sxy = 0, sx2 = 0, sy2 = 0
      for (const p of pts) { sx += p.N; sy += p.f; sxy += p.N * p.f; sx2 += p.N * p.N; sy2 += p.f * p.f }
      const denom = n * sx2 - sx * sx
      if (denom !== 0) {
        slope = (n * sxy - sx * sy) / denom
        intercept = (sy - slope * sx) / n
        const ssRes = pts.reduce((s, p) => s + (p.f - (slope * p.N + intercept)) ** 2, 0)
        const ssTot = pts.reduce((s, p) => s + (p.f - sy / n) ** 2, 0)
        r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1
      }
    }

    const allN = allPts.map(p => p.N), allF = allPts.map(p => p.f)
    const maxN = Math.max(10, ...allN) * 1.1
    const maxF = Math.max(10, ...allF) * 1.1

    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
        onClick={() => setShowChart(false)}>
        <div style={{ background: '#1a1a2e', borderRadius: 12, padding: 20, border: '1px solid #30363d' }}
          onClick={e => e.stopPropagation()}>
          <canvas ref={c => {
            if (!c) return
            c.width = canvasW; c.height = canvasH
            const ctx = c.getContext('2d')
            ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, canvasW, canvasH)

            // 坐标轴
            const ox = pad.l, oy = pad.t + plotH
            ctx.strokeStyle = '#484f58'; ctx.lineWidth = 1
            ctx.beginPath(); ctx.moveTo(ox, pad.t); ctx.lineTo(ox, oy); ctx.lineTo(ox + plotW, oy); ctx.stroke()

            // 标签
            ctx.fillStyle = '#8b949e'; ctx.font = '10px sans-serif'
            ctx.textAlign = 'center'; ctx.textBaseline = 'top'
            ctx.fillText('正压力 N (N)', ox + plotW / 2, oy + 8)
            ctx.save(); ctx.translate(ox - 35, oy - plotH / 2); ctx.rotate(-Math.PI / 2)
            ctx.fillText('摩擦力 f (N)', 0, 0); ctx.restore()

            // 网格
            ctx.strokeStyle = '#ffffff10'; ctx.lineWidth = 0.5
            for (let i = 1; i <= 4; i++) {
              const gy = oy - (i / 4) * plotH
              ctx.beginPath(); ctx.moveTo(ox, gy); ctx.lineTo(ox + plotW, gy); ctx.stroke()
              ctx.fillStyle = '#6a7a8a'; ctx.font = '9px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
              ctx.fillText((maxF * i / 4).toFixed(0), ox - 4, gy)
            }
            for (let i = 1; i <= 4; i++) {
              const gx = ox + (i / 4) * plotW
              ctx.beginPath(); ctx.moveTo(gx, oy); ctx.lineTo(gx, pad.t); ctx.stroke()
              ctx.fillStyle = '#6a7a8a'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
              ctx.fillText((maxN * i / 4).toFixed(0), gx, oy + 2)
            }

            // 数据点
            for (const p of allPts) {
              const px = ox + (p.N / maxN) * plotW
              const py = oy - (p.f / maxF) * plotH
              ctx.fillStyle = p.uniform ? '#4CAF50' : '#FF9800'
              ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill()
            }

            // 拟合线
            if (pts.length >= 2) {
              ctx.strokeStyle = '#4FC3F7'; ctx.lineWidth = 2; ctx.beginPath()
              const x0 = 0, x1 = maxN
              ctx.moveTo(ox + (x0 / maxN) * plotW, oy - ((slope * x0 + intercept) / maxF) * plotH)
              ctx.lineTo(ox + (x1 / maxN) * plotW, oy - ((slope * x1 + intercept) / maxF) * plotH)
              ctx.stroke()

              // 结果
              ctx.fillStyle = '#4FC3F7'; ctx.font = 'bold 11px sans-serif'
              ctx.textAlign = 'left'; ctx.textBaseline = 'top'
              ctx.fillText(`斜率 = ${slope.toFixed(3)} (≈μₖ)`, ox + 8, pad.t + 4)
              ctx.fillText(`R² = ${r2.toFixed(4)}`, ox + 8, pad.t + 20)
            }

            // 图例
            ctx.fillStyle = '#4CAF50'; ctx.beginPath(); ctx.arc(ox + plotW - 80, pad.t + 8, 4, 0, Math.PI * 2); ctx.fill()
            ctx.fillStyle = '#8b949e'; ctx.font = '9px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
            ctx.fillText('匀速数据', ox + plotW - 73, pad.t + 8)
            ctx.fillStyle = '#FF9800'; ctx.beginPath(); ctx.arc(ox + plotW - 80, pad.t + 22, 4, 0, Math.PI * 2); ctx.fill()
            ctx.fillStyle = '#8b949e'
            ctx.fillText('非匀速', ox + plotW - 73, pad.t + 22)
          }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
            <span style={{ color: '#8b949e', fontSize: 11 }}>共 {records.length} 条数据，{pts.length} 条匀速</span>
            <button onClick={() => setShowChart(false)} style={{ background: '#30363d', color: '#c9d1d9', border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>关闭</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={st.container}>
      <ChartModal />

      {/* 工具栏 */}
      <div style={st.toolbar}>
        <span style={st.title}>探究滑动摩擦力</span>
        <div style={st.actions}>
          <label style={st.lbl}>
            接触面：
            <select value={surface} onChange={e => setSurface(e.target.value)} style={st.select}>
              {Object.entries(SURFACES).map(([k, v]) => (
                <option key={k} value={k}>{v.name} (μₛ={v.muS}, μₖ={v.muK})</option>
              ))}
            </select>
          </label>
          <label style={st.lbl}>
            砝码：
            <input type="range" min="0" max="5" step="0.5" value={addedMass}
              onChange={e => setAddedMass(parseFloat(e.target.value))} style={{ width: 70, accentColor: '#4A90D9' }} />
            <span style={st.val}>{addedMass}kg</span>
          </label>
          <label style={st.lbl}>
            <input type="checkbox" checked={autoMode} onChange={e => setAutoMode(e.target.checked)} />
            自动匀速
          </label>
          <button style={st.btn} onClick={recordData}>📝 记录数据</button>
          <button style={st.btn} onClick={() => setShowChart(true)} disabled={records.length === 0}>📈 生成图像</button>
          <button style={st.btnDanger} onClick={() => { setRecords([]); setShowChart(false) }}>🗑 清空</button>
          <button style={st.btnReset} onClick={() => {
            S.current.blockX = 0; S.current.blockV = 0; S.current.pullForce = 0
          }}>↺ 重置</button>
        </div>
      </div>

      {/* 主区域 */}
      <div style={st.main}>
        <canvas ref={canvasRef} style={{ flex: 1, width: '100%', cursor: dragRef.current?.active ? 'grabbing' : 'default' }}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
          onContextMenu={e => e.preventDefault()} />
      </div>

      {/* 数据表格 */}
      {records.length > 0 && (
        <div style={st.tableBar}>
          <span style={{ color: '#8b949e', fontSize: 11, marginRight: 8 }}>已记录 {records.length} 组：</span>
          {records.slice(-6).map((r, i) => (
            <span key={i} style={{
              background: r.uniform ? '#1a3a2a' : '#3a2a1a',
              border: `1px solid ${r.uniform ? '#2d5a3d' : '#5a3d2d'}`,
              borderRadius: 4, padding: '2px 6px', margin: '0 3px', fontSize: 10, color: '#c9d1d9',
            }}>
              N={r.N} f={r.f} {r.surface} {r.uniform ? '✓' : '⚠'}
            </span>
          ))}
        </div>
      )}

      {/* 底部 */}
      <div style={st.statusBar}>
        <span style={{ color: ui.isMoving ? '#FF9800' : '#4CAF50', fontWeight: 600 }}>
          {ui.isMoving ? '⚡ 滑动中' : '⏸ 静止'}
        </span>
        <span style={{ color: '#8b949e' }}>
          {autoMode ? '自动匀速模式' : '拖拽测力计施加拉力'}
        </span>
        <span style={{ color: '#6a7a8a', marginLeft: 'auto' }}>
          f=μN · μₛ≥μₖ · 匀速时 F=f
        </span>
      </div>
    </div>
  )
}

const st = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#0d1117', color: '#c9d1d9', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  toolbar: { minHeight: 44, background: '#161b22', borderBottom: '1px solid #30363d', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', flexShrink: 0, flexWrap: 'wrap', gap: 6 },
  title: { fontSize: 14, fontWeight: 600, color: '#c9d1d9' },
  actions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  lbl: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#8b949e' },
  select: { background: '#21262d', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: 4, padding: '3px 6px', fontSize: 12 },
  val: { color: '#4A90D9', fontWeight: 600, minWidth: 30, fontSize: 12 },
  btn: { background: '#238636', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer' },
  btnDanger: { background: '#da3633', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer' },
  btnReset: { background: '#30363d', color: '#c9d1d9', border: '1px solid #484f58', borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer' },
  main: { flex: 1, display: 'flex', overflow: 'hidden' },
  tableBar: { minHeight: 28, background: '#161b22', borderTop: '1px solid #30363d', display: 'flex', alignItems: 'center', padding: '4px 12px', flexShrink: 0, overflowX: 'auto' },
  statusBar: { minHeight: 28, background: '#161b22', borderTop: '1px solid #30363d', display: 'flex', alignItems: 'center', gap: 16, padding: '4px 14px', fontSize: 12, flexShrink: 0 },
}
