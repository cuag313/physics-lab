import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * ProjectileMotionScene — PhET Colorado 斜抛运动仿真复刻
 *
 * 功能：
 * - 大炮可拖拽炮管调整发射角度，支持修改离地高度
 * - 绿色草地+米刻度标尺，蓝色天空，小人装饰
 * - 轨迹虚线+时间打点(0.5s)+最高点标记
 * - 多种炮弹切换（质量/直径/阻力系数）
 * - 空气阻力开关+阻力系数调节
 * - 速度/加速度矢量及分量显示
 * - 测距卷尺工具
 * - 地面靶标可拖拽
 * - 慢速/暂停/单步/清除/重置
 * - 画布缩放（滚轮）
 */

// ==================== 炮弹类型 ====================
const PROJECTILES = [
  { id: 'cannonball', name: '🔴 炮弹', mass: 17.6, diameter: 0.18, Cd: 0.47, color: '#555' },
  { id: 'baseball', name: '⚾ 棒球', mass: 0.145, diameter: 0.074, Cd: 0.35, color: '#fff' },
  { id: 'golfball', name: '🏌 高尔夫球', mass: 0.046, diameter: 0.043, Cd: 0.25, color: '#fff' },
  { id: 'basketball', name: '🏀 篮球', mass: 0.625, diameter: 0.24, Cd: 0.47, color: '#e8752a' },
  { id: 'bowling', name: '🎳 保龄球', mass: 6.35, diameter: 0.218, Cd: 0.47, color: '#222' },
  { id: 'football', name: '🏈 橄榄球', mass: 0.41, diameter: 0.17, Cd: 0.05, color: '#6b3a1f' },
]

const TRAIL_COLORS = ['#e8752a', '#4A90D9', '#4CAF50', '#E53935', '#9C27B0', '#00BCD4']

export default function ProjectileMotionScene() {
  const canvasRef = useRef(null)
  const rafRef = useRef(null)
  const lastTimeRef = useRef(0)
  const pausedRef = useRef(false)

  // ============ 模拟状态 (ref) ============
  const sim = useRef({
    launchX: 3.0, launchY: 1.0, v0: 18, angle: 45,
    projectileIdx: 0,
    airResistance: false, dragCoeff: 1.0,
    g: 9.8, rho: 1.225,
    ball: { x: 1.5, y: 1.0, vx: 0, vy: 0, launched: false, time: 0, trail: [], maxHeight: 0 },
    trails: [],
    targetX: 15,
    speedMultiplier: 1,
    showTotalV: true, showCompV: true, showTotalA: false, showCompA: false,
    scale: 40,
    // 偏移量在resize时计算一次，不在每帧重置
    offsetX: 70, offsetY: 0,
    screenW: 0, screenH: 0,
    dragMode: null,
    tapeVisible: false, tapeX1: 8, tapeY1: 0, tapeX2: 12, tapeY2: 5,
    hovered: null,
    initialized: false,
  })

  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [slowMode, setSlowMode] = useState(false)
  const [flightData, setFlightData] = useState(null)
  const [projIdx, setProjIdx] = useState(0)
  const [airOn, setAirOn] = useState(false)
  const [dragCoeff, setDragCoeff] = useState(1.0)
  const [v0, setV0] = useState(18)
  const [angle, setAngle] = useState(45)
  const [, forceUpdate] = useState(0)

  const triggerRender = useCallback(() => forceUpdate(n => n + 1), [])

  // 同步paused到ref，避免effect依赖paused导致重建循环
  useEffect(() => { pausedRef.current = paused }, [paused])

  // ============ 坐标变换 ============
  function w2s(wx, wy) {
    const s = sim.current
    return [s.offsetX + wx * s.scale, s.offsetY - wy * s.scale]
  }
  function s2w(sx, sy) {
    const s = sim.current
    return [(sx - s.offsetX) / s.scale, (s.offsetY - sy) / s.scale]
  }

  // ============ Canvas 初始化 + 渲染循环（只运行一次）============
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    function resize() {
      const r = canvas.getBoundingClientRect()
      const dpr = devicePixelRatio || 1
      canvas.width = r.width * dpr
      canvas.height = r.height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const s = sim.current
      s.screenW = r.width
      s.screenH = r.height
      // 偏移量：左边留70px给刻度，底部留80px给地面
      s.offsetX = 70
      s.offsetY = r.height - 80
      if (!s.initialized) {
        // 初始化炮弹位置
        s.ball.x = s.launchX
        s.ball.y = s.launchY
        s.initialized = true
      }
    }
    resize()
    window.addEventListener('resize', resize)

    function loop(ts) {
      if (!lastTimeRef.current) lastTimeRef.current = ts
      const rawDt = Math.min((ts - lastTimeRef.current) / 1000, 0.05)
      lastTimeRef.current = ts

      const s = sim.current
      if (s.ball.launched && !pausedRef.current) {
        const dt = rawDt * s.speedMultiplier
        if (s.speedMultiplier < 0.5) {
          const steps = Math.ceil(dt / (1 / 240))
          const subDt = dt / steps
          for (let i = 0; i < steps; i++) stepPhysics(subDt)
        } else {
          stepPhysics(dt)
        }
      }
      drawFrame(ctx)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      window.removeEventListener('resize', resize)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, []) // 空依赖，只运行一次

  // ============ 物理引擎 ============
  function stepPhysics(dt) {
    const s = sim.current
    const b = s.ball
    const proj = PROJECTILES[s.projectileIdx]

    let ax = 0, ay = -s.g
    if (s.airResistance) {
      const v = Math.sqrt(b.vx * b.vx + b.vy * b.vy)
      if (v > 0) {
        const A = Math.PI * (proj.diameter / 2) ** 2
        const Fd = 0.5 * s.rho * v * v * proj.Cd * A * s.dragCoeff
        ax -= (Fd / proj.mass) * (b.vx / v)
        ay -= (Fd / proj.mass) * (b.vy / v)
      }
    }

    b.vx += ax * dt
    b.vy += ay * dt
    b.x += b.vx * dt
    b.y += b.vy * dt
    b.time += dt

    b.trail.push({ x: b.x, y: b.y, t: b.time })
    if (b.trail.length > 2000) b.trail.shift()

    if (b.y > b.maxHeight) b.maxHeight = b.y

    setFlightData({ time: b.time, x: b.x, y: b.y, vx: b.vx, vy: b.vy, maxHeight: b.maxHeight })

    if (b.y <= 0 && b.time > 0.1) {
      b.y = 0; b.launched = false
      s.trails.push({ trail: [...b.trail], v0: s.v0, angle: s.angle, color: TRAIL_COLORS[s.trails.length % TRAIL_COLORS.length] })
      if (s.trails.length > 6) s.trails.shift()
      // 靶心自动移到落点
      s.targetX = Math.round(b.x * 10) / 10
      setRunning(false)
    }
  }

  // ============ 绘制 ============
  function drawFrame(ctx) {
    const s = sim.current
    const w = s.screenW, h = s.screenH
    if (!w || !h) return

    ctx.clearRect(0, 0, w, h)

    // 天空渐变
    const sky = ctx.createLinearGradient(0, 0, 0, s.offsetY)
    sky.addColorStop(0, '#87CEEB'); sky.addColorStop(1, '#B0E0FF')
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, s.offsetY)

    // 太阳
    ctx.fillStyle = '#FFD93D'; ctx.beginPath(); ctx.arc(w - 80, 60, 30, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#FFF8DC'; ctx.beginPath(); ctx.arc(w - 80, 60, 22, 0, Math.PI * 2); ctx.fill()

    // 云
    drawCloud(ctx, 120, 50, 1)
    drawCloud(ctx, 350, 35, 0.8)
    drawCloud(ctx, 600, 55, 1.2)

    // 地面
    ctx.fillStyle = '#4CAF50'; ctx.fillRect(0, s.offsetY, w, h - s.offsetY)
    ctx.fillStyle = '#388E3C'; ctx.fillRect(0, s.offsetY, w, 3)
    ctx.fillStyle = '#66BB6A'; ctx.fillRect(0, s.offsetY + 3, w, 4)

    // 刻度
    drawScale(ctx, w, h)

    // 靶标
    drawTarget(ctx)

    // 历史轨迹
    for (const t of s.trails) drawTrail(ctx, t, true)

    // 当前轨迹
    if (s.ball.trail.length > 1) drawTrail(ctx, { trail: s.ball.trail, color: '#FFD700' }, false)

    // 大炮
    drawCannon(ctx)

    // 炮弹
    if (s.ball.launched || s.ball.trail.length > 0) {
      const [sx, sy] = w2s(s.ball.x, Math.max(0, s.ball.y))
      const proj = PROJECTILES[s.projectileIdx]
      ctx.save()
      ctx.shadowColor = '#FF6B00'; ctx.shadowBlur = 15
      ctx.fillStyle = proj.color; ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI * 2); ctx.fill()
      ctx.shadowBlur = 0
      if (proj.color === '#fff' || proj.color === '#555') {
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(sx - 2, sy - 2, 3, 0, Math.PI * 2); ctx.fill()
      }
      ctx.restore()
    }

    // 矢量
    if (s.ball.launched) {
      const [sx, sy] = w2s(s.ball.x, Math.max(0, s.ball.y))
      if (s.showTotalV || s.showCompV) drawVelocityVectors(ctx, sx, sy)
      if (s.showTotalA || s.showCompA) drawAccelVectors(ctx, sx, sy)
    }

    // 测距卷尺
    if (s.tapeVisible) drawTape(ctx)

    // 角度弧线（始终显示在炮台上方）
    drawAngleArc(ctx)
  }

  function drawCloud(ctx, x, y, sc) {
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc)
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(18, -5, 16, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(-16, 2, 14, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(8, 5, 12, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }

  function drawPerson(ctx, x, groundY) {
    ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.fillStyle = '#FFD93D'
    ctx.beginPath(); ctx.arc(x, groundY - 48, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.strokeStyle = '#4A90D9'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(x, groundY - 40); ctx.lineTo(x, groundY - 18); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x, groundY - 34); ctx.lineTo(x - 8, groundY - 24); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x, groundY - 34); ctx.lineTo(x + 8, groundY - 24); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x, groundY - 18); ctx.lineTo(x - 6, groundY - 3); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x, groundY - 18); ctx.lineTo(x + 6, groundY - 3); ctx.stroke()
  }

  function drawScale(ctx, w, h) {
    const s = sim.current
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    const [sx0] = w2s(0, 0)
    const endWorldX = (w - s.offsetX) / s.scale
    for (let m = 0; m <= Math.ceil(endWorldX); m++) {
      const px = sx0 + m * s.scale
      if (px > w) break
      if (m % 5 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(px, s.offsetY + 3, 1, 10)
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillText(`${m}`, px, s.offsetY + 15)
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(px, s.offsetY + 3, 1, 5)
      }
    }
    // 竖直刻度
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
    const [, syBottom] = w2s(0, 0)
    for (let m = 5; syBottom - m * s.scale >= 20; m += 5) {
      const py = syBottom - m * s.scale
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(s.offsetX - 8, py, 8, 1)
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillText(`${m}`, s.offsetX - 10, py)
    }
  }

  function drawTarget(ctx) {
    const s = sim.current
    const [tx, ty] = w2s(s.targetX, 0)
    const rings = [18, 13, 8, 4]
    const colors = ['#fff', '#E53935', '#fff', '#E53935']
    for (let i = 0; i < rings.length; i++) {
      ctx.fillStyle = colors[i]; ctx.beginPath(); ctx.arc(tx, ty - 2, rings[i], 0, Math.PI * 2); ctx.fill()
    }
    ctx.strokeStyle = '#B71C1C'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(tx, ty - 2, 19, 0, Math.PI * 2); ctx.stroke()
    ctx.fillStyle = '#B71C1C'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(`靶标 ${s.targetX.toFixed(0)}m`, tx, ty + 16)
  }

  function drawTrail(ctx, t, faded) {
    if (t.trail.length < 2) return
    ctx.save()
    ctx.globalAlpha = faded ? 0.35 : 1
    ctx.strokeStyle = t.color || '#FFD700'
    ctx.lineWidth = faded ? 1.5 : 2.5
    ctx.setLineDash(faded ? [6, 4] : [])
    ctx.beginPath()
    for (let i = 0; i < t.trail.length; i++) {
      const [sx, sy] = w2s(t.trail[i].x, Math.max(0, t.trail[i].y))
      i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy)
    }
    ctx.stroke()
    ctx.setLineDash([])

    if (!faded) {
      // 时间打点
      ctx.fillStyle = '#FFD700'
      let nextDot = 0.5
      for (const p of t.trail) {
        if (p.t >= nextDot) {
          const [sx, sy] = w2s(p.x, Math.max(0, p.y))
          ctx.beginPath(); ctx.arc(sx, sy, 3, 0, Math.PI * 2); ctx.fill()
          ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center'
          ctx.fillText(`${p.t.toFixed(1)}s`, sx, sy - 8)
          ctx.fillStyle = '#FFD700'; nextDot += 0.5
        }
      }
      // 最高点
      let maxP = t.trail[0]
      for (const p of t.trail) if (p.y > maxP.y) maxP = p
      const [mx, my] = w2s(maxP.x, maxP.y)
      ctx.fillStyle = '#FF6B00'; ctx.beginPath(); ctx.arc(mx, my, 5, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(mx, my, 2.5, 0, Math.PI * 2); ctx.fill()
    }
    ctx.restore()
  }

  // ============ 大炮绘制（美化版）============
  function drawCannon(ctx) {
    const s = sim.current
    const [cx, cy] = w2s(s.launchX, s.launchY)
    const rad = s.angle * Math.PI / 180
    const tubeLen = 70, tubeW = 18
    // 底座对齐地面：轮子底部 = 地面线 s.offsetY
    const groundY = s.offsetY
    const baseY = groundY - 44  // 底座顶部
    const wheelY = groundY - 8  // 轮子中心（轮子半径12，底部在groundY+4，微陷入地面效果）

    // ── 炮架底座（固定不动）──
    const skidGrad = ctx.createLinearGradient(cx - 35, groundY - 8, cx - 35, groundY)
    skidGrad.addColorStop(0, '#6D4C41'); skidGrad.addColorStop(1, '#3E2723')
    ctx.fillStyle = skidGrad
    ctx.beginPath()
    ctx.moveTo(cx - 35, groundY - 8); ctx.lineTo(cx + 35, groundY - 8)
    ctx.lineTo(cx + 32, groundY); ctx.lineTo(cx - 32, groundY)
    ctx.closePath(); ctx.fill()
    ctx.strokeStyle = '#2E1B0E'; ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(cx - 35, groundY - 8); ctx.lineTo(cx + 35, groundY - 8)
    ctx.lineTo(cx + 32, groundY); ctx.lineTo(cx - 32, groundY)
    ctx.closePath(); ctx.stroke()

    // 支架梯形
    const legGrad = ctx.createLinearGradient(cx - 22, baseY, cx + 22, baseY)
    legGrad.addColorStop(0, '#5D4037'); legGrad.addColorStop(0.5, '#795548'); legGrad.addColorStop(1, '#4E342E')
    ctx.fillStyle = legGrad
    ctx.beginPath()
    ctx.moveTo(cx - 20, baseY); ctx.lineTo(cx + 20, baseY)
    ctx.lineTo(cx + 28, groundY - 8); ctx.lineTo(cx - 28, groundY - 8)
    ctx.closePath(); ctx.fill()
    ctx.strokeStyle = '#3E2723'; ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(cx - 20, baseY); ctx.lineTo(cx + 20, baseY)
    ctx.lineTo(cx + 28, groundY - 8); ctx.lineTo(cx - 28, groundY - 8)
    ctx.closePath(); ctx.stroke()

    // 支架横撑
    ctx.fillStyle = '#6D4C41'
    ctx.fillRect(cx - 22, baseY + 18, 44, 5)
    ctx.strokeStyle = '#3E2723'; ctx.lineWidth = 0.8
    ctx.strokeRect(cx - 22, baseY + 18, 44, 5)

    // 轮轴
    ctx.strokeStyle = '#4E342E'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(cx - 22, groundY - 8); ctx.lineTo(cx + 22, groundY - 8); ctx.stroke()

    // ── 车轮 ──
    function drawWheel(wx, wy) {
      ctx.fillStyle = '#2E1B0E'
      ctx.beginPath(); ctx.arc(wx, wy, 12, 0, Math.PI * 2); ctx.fill()
      const rimGrad = ctx.createRadialGradient(wx, wy, 4, wx, wy, 12)
      rimGrad.addColorStop(0, '#8D6E63'); rimGrad.addColorStop(0.6, '#5D4037'); rimGrad.addColorStop(1, '#3E2723')
      ctx.fillStyle = rimGrad
      ctx.beginPath(); ctx.arc(wx, wy, 10, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#4E342E'; ctx.lineWidth = 1.5
      for (let a = 0; a < 6; a++) {
        const sa = a * Math.PI / 3
        ctx.beginPath()
        ctx.moveTo(wx + 3 * Math.cos(sa), wy + 3 * Math.sin(sa))
        ctx.lineTo(wx + 9 * Math.cos(sa), wy + 9 * Math.sin(sa))
        ctx.stroke()
      }
      ctx.fillStyle = '#8D6E63'
      ctx.beginPath(); ctx.arc(wx, wy, 4, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#A1887F'
      ctx.beginPath(); ctx.arc(wx, wy, 2, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#4E342E'
      for (let a = 0; a < 6; a++) {
        const da = a * Math.PI / 3 + Math.PI / 6
        ctx.beginPath(); ctx.arc(wx + 7 * Math.cos(da), wy + 7 * Math.sin(da), 1.2, 0, Math.PI * 2); ctx.fill()
      }
    }
    drawWheel(cx - 24, wheelY)
    drawWheel(cx + 24, wheelY)

    // ── 炮管（可旋转）──
    // 旋转轴心 = 炮耳轴 (cx, cy)，即炮管底部与炮架连接点
    // rad=0 时炮管水平向右；角度增大时逆时针旋转（符合数学坐标系）
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(-rad)  // canvas顺时针为正，取反得逆时针

    // 炮管主体
    const bodyGrad = ctx.createLinearGradient(0, -tubeW / 2 - 2, 0, tubeW / 2 + 2)
    bodyGrad.addColorStop(0, '#9E9E9E')
    bodyGrad.addColorStop(0.15, '#757575')
    bodyGrad.addColorStop(0.4, '#424242')
    bodyGrad.addColorStop(0.6, '#303030')
    bodyGrad.addColorStop(0.85, '#424242')
    bodyGrad.addColorStop(1, '#616161')
    ctx.fillStyle = bodyGrad
    ctx.fillRect(0, -tubeW / 2, tubeLen, tubeW)

    // 高光
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(4, -tubeW / 2 + 2); ctx.lineTo(tubeLen - 2, -tubeW / 2 + 2); ctx.stroke()

    // 底部阴影
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(4, tubeW / 2 - 1); ctx.lineTo(tubeLen - 2, tubeW / 2 - 1); ctx.stroke()

    // 加强箍环
    for (let i = 0; i < 3; i++) {
      const bx = 14 + i * 20
      const bw = 6
      const ringGrad = ctx.createLinearGradient(bx, -tubeW / 2 - 3, bx, tubeW / 2 + 3)
      ringGrad.addColorStop(0, '#8D6E63')
      ringGrad.addColorStop(0.3, '#6D4C41')
      ringGrad.addColorStop(0.7, '#4E342E')
      ringGrad.addColorStop(1, '#795548')
      ctx.fillStyle = ringGrad
      ctx.fillRect(bx, -tubeW / 2 - 3, bw, tubeW + 6)
      ctx.strokeStyle = '#3E2723'; ctx.lineWidth = 0.8
      ctx.strokeRect(bx, -tubeW / 2 - 3, bw, tubeW + 6)
      ctx.fillStyle = '#8D6E63'
      ctx.beginPath(); ctx.arc(bx + bw / 2, -tubeW / 2 - 1, 1.5, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(bx + bw / 2, tubeW / 2 + 1, 1.5, 0, Math.PI * 2); ctx.fill()
    }

    // 炮口（椭圆，模拟2.5D透视 — 长轴竖直）
    const mz = tubeLen + 2
    const eRx = tubeW / 2 - 3  // 水平半径（短轴）
    const eRy = tubeW / 2 + 5  // 竖直半径（长轴，偏高椭圆）
    ctx.fillStyle = '#212121'
    ctx.beginPath(); ctx.ellipse(mz, 0, eRx, eRy, 0, 0, Math.PI * 2); ctx.fill()
    const muzzleGrad = ctx.createRadialGradient(mz - 2, -1, 0, mz, 0, eRx)
    muzzleGrad.addColorStop(0, '#757575')
    muzzleGrad.addColorStop(0.5, '#424242')
    muzzleGrad.addColorStop(1, '#212121')
    ctx.fillStyle = muzzleGrad
    ctx.beginPath(); ctx.ellipse(mz, 0, eRx, eRy, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#111'
    ctx.beginPath(); ctx.ellipse(mz, 0, eRx - 5, eRy - 3, 0, 0, Math.PI * 2); ctx.fill()
    const holeGrad = ctx.createRadialGradient(mz, 0, 0, mz, 0, eRx - 5)
    holeGrad.addColorStop(0, 'rgba(0,0,0,0.9)')
    holeGrad.addColorStop(0.6, 'rgba(30,30,30,0.8)')
    holeGrad.addColorStop(1, 'rgba(60,60,60,0.5)')
    ctx.fillStyle = holeGrad
    ctx.beginPath(); ctx.ellipse(mz, 0, eRx - 5, eRy - 3, 0, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.ellipse(mz, 0, eRx, eRy, 0, -2.5, -0.7, false); ctx.stroke()

    // 炮闩尾部
    const tailGrad = ctx.createLinearGradient(-12, -tubeW / 2 - 4, -12, tubeW / 2 + 4)
    tailGrad.addColorStop(0, '#616161')
    tailGrad.addColorStop(0.3, '#424242')
    tailGrad.addColorStop(0.7, '#303030')
    tailGrad.addColorStop(1, '#555')
    ctx.fillStyle = tailGrad
    ctx.fillRect(-12, -tubeW / 2 - 4, 14, tubeW + 8)
    ctx.strokeStyle = '#212121'; ctx.lineWidth = 1
    ctx.strokeRect(-12, -tubeW / 2 - 4, 14, tubeW + 8)
    ctx.fillStyle = '#555'
    ctx.beginPath(); ctx.arc(-12, 0, 5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#777'
    ctx.beginPath(); ctx.arc(-12, 0, 2.5, 0, Math.PI * 2); ctx.fill()

    // 引信孔
    ctx.fillStyle = '#333'
    ctx.beginPath(); ctx.arc(tubeLen * 0.4, -tubeW / 2 - 1, 2.5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#555'
    ctx.beginPath(); ctx.arc(tubeLen * 0.4, -tubeW / 2 - 1, 1.2, 0, Math.PI * 2); ctx.fill()

    // 记录炮口世界坐标（供炮弹发射使用）
    // 炮口在旋转坐标系中位于 (tubeLen+2, 0)，变换回世界坐标
    s._muzzleWorldX = s.launchX + (tubeLen + 2) / s.scale * Math.cos(rad)
    s._muzzleWorldY = s.launchY + (tubeLen + 2) / s.scale * Math.sin(rad)

    ctx.restore()

    // ── 耳轴（炮管旋转中心）──
    ctx.fillStyle = '#4E342E'
    ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#6D4C41'
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#8D6E63'
    ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2); ctx.fill()
  }

  // 角度弧线单独绘制
  function drawAngleArc(ctx) {
    const s = sim.current
    const [cx, cy] = w2s(s.launchX, s.launchY)
    const rad = s.angle * Math.PI / 180

    // 弧线
    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, 32, 0, -rad, true)
    ctx.stroke()

    // 角度标签
    const labelR = 44
    const labelAngle = rad / 2
    const lx = cx + labelR * Math.cos(labelAngle)
    const ly = cy - labelR * Math.sin(labelAngle)
    ctx.fillStyle = '#FFD700'
    ctx.font = 'bold 14px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${s.angle.toFixed(0)}°`, lx, ly)

    // 速度标签
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`v₀=${s.v0}m/s`, cx, cy - 55)
  }

  function drawVelocityVectors(ctx, sx, sy) {
    const s = sim.current
    const b = s.ball
    const sc = 2.5
    const vx = b.vx, vy = b.vy
    if (s.showTotalV) drawArrow(ctx, sx, sy, sx + vx * sc, sy - vy * sc, '#FFD700', 3, `v=${Math.sqrt(vx * vx + vy * vy).toFixed(1)}`)
    if (s.showCompV) {
      drawArrow(ctx, sx, sy, sx + vx * sc, sy, '#4ECDC4', 2, `vx=${Math.abs(vx).toFixed(1)}`)
      drawArrow(ctx, sx + vx * sc, sy, sx + vx * sc, sy - vy * sc, '#FF6B6B', 2, `vy=${Math.abs(vy).toFixed(1)}`)
    }
  }

  function drawAccelVectors(ctx, sx, sy) {
    const s = sim.current
    const b = s.ball
    const proj = PROJECTILES[s.projectileIdx]
    let ax = 0, ay = -s.g
    if (s.airResistance) {
      const v = Math.sqrt(b.vx * b.vx + b.vy * b.vy)
      if (v > 0) {
        const A = Math.PI * (proj.diameter / 2) ** 2
        const Fd = 0.5 * s.rho * v * v * proj.Cd * A * s.dragCoeff
        ax -= (Fd / proj.mass) * (b.vx / v)
        ay -= (Fd / proj.mass) * (b.vy / v)
      }
    }
    const sc = 5
    if (s.showTotalA) drawArrow(ctx, sx, sy, sx + ax * sc, sy - ay * sc, '#E040FB', 3, `a=${Math.sqrt(ax * ax + ay * ay).toFixed(1)}`)
    if (s.showCompA) {
      drawArrow(ctx, sx, sy, sx + ax * sc, sy, '#AB47BC', 2, `ax=${Math.abs(ax).toFixed(1)}`)
      drawArrow(ctx, sx + ax * sc, sy, sx + ax * sc, sy - ay * sc, '#7B1FA2', 2, `ay=${Math.abs(ay).toFixed(1)}`)
    }
  }

  function drawArrow(ctx, x1, y1, x2, y2, color, lw, label) {
    const dx = x2 - x1, dy = y2 - y1
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 2) return
    const ang = Math.atan2(dy, dx)
    ctx.strokeStyle = color; ctx.lineWidth = lw
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(x2, y2)
    ctx.lineTo(x2 - 8 * Math.cos(ang - 0.4), y2 - 8 * Math.sin(ang - 0.4))
    ctx.lineTo(x2 - 8 * Math.cos(ang + 0.4), y2 - 8 * Math.sin(ang + 0.4))
    ctx.closePath(); ctx.fill()
    if (label && len > 20) {
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
      ctx.save()
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'
      const off = lw + 8
      const nx = -dy / len * off, ny = dx / len * off
      ctx.fillText(label, mx + nx, my + ny)
      ctx.restore()
    }
  }

  function drawTape(ctx) {
    const s = sim.current
    const [x1, y1] = w2s(s.tapeX1, s.tapeY1)
    const [x2, y2] = w2s(s.tapeX2, s.tapeY2)
    ctx.strokeStyle = '#FFEB3B'; ctx.lineWidth = 2.5; ctx.setLineDash([8, 4])
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#FFEB3B'
    ctx.beginPath(); ctx.arc(x1, y1, 5, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(x2, y2, 5, 0, Math.PI * 2); ctx.fill()
    const dx = s.tapeX2 - s.tapeX1, dy = s.tapeY2 - s.tapeY1
    const dist = Math.sqrt(dx * dx + dy * dy)
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
    ctx.fillStyle = 'rgba(0,0,0,0.75)'
    const tw = 120, th = 22
    ctx.fillRect(mx - tw / 2, my - 28, tw, th)
    ctx.fillStyle = '#FFEB3B'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(`d=${dist.toFixed(1)}m  Δx=${dx.toFixed(1)}  Δy=${dy.toFixed(1)}`, mx, my - 14)
  }

  // ============ 交互 ============
  function getPos(e) {
    const r = canvasRef.current.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }

  const handleMouseDown = useCallback((e) => {
    const [sx, sy] = getPos(e)
    const s = sim.current
    const [cx, cy] = w2s(s.launchX, s.launchY)

    // 炮管拖拽检测（扩大到炮管尖端区域）
    const cannonDist = Math.hypot(sx - cx, sy - cy)
    // 计算炮管尖端位置
    const rad = s.angle * Math.PI / 180
    const tipX = cx + 65 * Math.cos(rad)
    const tipY = cy - 65 * Math.sin(rad)
    const tipDist = Math.hypot(sx - tipX, sy - tipY)

    if (cannonDist < 80 || tipDist < 30) {
      s.dragMode = 'cannon'
      e.preventDefault()
      return
    }

    // 靶标?
    const [tx, ty] = w2s(s.targetX, 0)
    if (Math.hypot(sx - tx, sy - (ty - 2)) < 25) {
      s.dragMode = 'target'
      e.preventDefault()
      return
    }

    // 卷尺端点?
    if (s.tapeVisible) {
      const [t1x, t1y] = w2s(s.tapeX1, s.tapeY1)
      const [t2x, t2y] = w2s(s.tapeX2, s.tapeY2)
      if (Math.hypot(sx - t1x, sy - t1y) < 15) { s.dragMode = 'tape1'; e.preventDefault(); return }
      if (Math.hypot(sx - t2x, sy - t2y) < 15) { s.dragMode = 'tape2'; e.preventDefault(); return }
    }
  }, [])

  const handleMouseMove = useCallback((e) => {
    const [sx, sy] = getPos(e)
    const s = sim.current

    if (s.dragMode === 'cannon') {
      const [cx, cy] = w2s(s.launchX, s.launchY)
      const a = Math.atan2(cy - sy, sx - cx) * 180 / Math.PI
      s.angle = Math.max(5, Math.min(80, a))
      setAngle(Math.round(s.angle))
      return
    }

    if (s.dragMode === 'target') {
      const [wx] = s2w(sx, sy)
      s.targetX = Math.max(1, Math.min(60, wx))
      return
    }

    if (s.dragMode === 'tape1') {
      const [wx, wy] = s2w(sx, sy)
      s.tapeX1 = Math.max(0, wx); s.tapeY1 = Math.max(0, wy)
      return
    }

    if (s.dragMode === 'tape2') {
      const [wx, wy] = s2w(sx, sy)
      s.tapeX2 = Math.max(0, wx); s.tapeY2 = Math.max(0, wy)
      return
    }

    // hover检测
    const [cx, cy] = w2s(s.launchX, s.launchY)
    const cannonDist = Math.hypot(sx - cx, sy - cy)
    const rad = s.angle * Math.PI / 180
    const tipX = cx + 65 * Math.cos(rad)
    const tipY = cy - 65 * Math.sin(rad)
    const tipDist = Math.hypot(sx - tipX, sy - tipY)
    const [tx, ty] = w2s(s.targetX, 0)

    if (cannonDist < 80 || tipDist < 30) s.hovered = 'cannon'
    else if (Math.hypot(sx - tx, sy - (ty - 2)) < 25) s.hovered = 'target'
    else s.hovered = null
  }, [])

  const handleMouseUp = useCallback(() => { sim.current.dragMode = null }, [])

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const s = sim.current
    const [sx, sy] = getPos(e)
    const [wx, wy] = s2w(sx, sy)
    const factor = e.deltaY > 0 ? 0.92 : 1.08
    const newScale = Math.max(15, Math.min(120, s.scale * factor))
    // 以鼠标位置为中心缩放
    s.offsetX = sx - wx * newScale
    s.offsetY = sy + wy * newScale
    s.scale = newScale
  }, [])

  // ============ 操作 ============
  function handleLaunch() {
    const s = sim.current
    const rad = s.angle * Math.PI / 180
    const b = s.ball

    // 发射前：用45度最大射程作为固定基准，不再随角度变化
    const maxRange = s.v0 * s.v0 / s.g  // 45度时 R=v0²/g
    const maxH = (s.v0 * s.v0) / (2 * s.g)  // 45度时最大高度
    const neededW = (maxRange + s.launchX) * 1.15
    const neededH = maxH * 1.3
    const scaleX = (s.screenW - s.offsetX - 40) / neededW
    const scaleY = (s.offsetY - 60) / Math.max(neededH, 2)
    s.scale = Math.max(15, Math.min(scaleX, scaleY))

    // 从炮口位置发射
    const v0x = s.v0 * Math.cos(rad)
    const v0y = s.v0 * Math.sin(rad)
    b.x = s._muzzleWorldX || s.launchX
    b.y = s._muzzleWorldY || s.launchY
    b.vx = v0x; b.vy = v0y
    b.launched = true; b.time = 0; b.trail = []; b.maxHeight = 0
    setRunning(true); setPaused(false); setFlightData(null)
  }

  function handleClear() {
    sim.current.trails = []
    sim.current.ball.trail = []; sim.current.ball.launched = false
    sim.current.ball.x = sim.current.launchX; sim.current.ball.y = sim.current.launchY
    setRunning(false); setFlightData(null)
  }

  function handleReset() {
    const s = sim.current
    s.v0 = 18; s.angle = 45; s.launchX = 3.0; s.launchY = 1.0
    s.projectileIdx = 0; s.airResistance = false; s.dragCoeff = 1.0
    s.targetX = 15; s.trails = []; s.speedMultiplier = 1
    s.showTotalV = true; s.showCompV = true; s.showTotalA = false; s.showCompA = false
    s.tapeVisible = false
    s.ball = { x: 3.0, y: 1.0, vx: 0, vy: 0, launched: false, time: 0, trail: [], maxHeight: 0 }
    setRunning(false); setPaused(false); setSlowMode(false)
    setFlightData(null); setProjIdx(0); setAirOn(false); setDragCoeff(1.0)
    setV0(18); setAngle(45)
  }

  function handlePauseResume() { setPaused(p => !p) }
  function handleSlowToggle() {
    const s = sim.current
    if (slowMode) { s.speedMultiplier = 1; setSlowMode(false) }
    else { s.speedMultiplier = 0.25; setSlowMode(true) }
  }

  function handleStep() {
    if (!sim.current.ball.launched) return
    setPaused(true)
    stepPhysics(1 / 60)
    triggerRender()
  }

  // ============ 游标样式 ============
  const cursor = sim.current.dragMode === 'cannon' || sim.current.hovered === 'cannon' ? 'grab'
    : sim.current.dragMode === 'target' || sim.current.hovered === 'target' ? 'pointer'
    : sim.current.dragMode?.startsWith('tape') ? 'crosshair' : 'default'

  // ============ UI ============
  return (
    <div style={S.pageWrapper}>
      {/* 顶部标题栏 */}
      <div style={S.titleBar}>
        <span style={S.titleText}>🔬 斜抛运动仿真实验</span>
        <span style={S.titleHint}>
          {running ? (paused ? '⏸ 已暂停' : '🚀 飞行中…') : flightData ? '✅ 炮弹落地' : '拖拽炮管或滑块调整参数，点击发射'}
        </span>
      </div>

      {/* 全屏画布 */}
      <div style={S.canvasWrap}>
        <canvas ref={canvasRef} style={{ ...S.canvas, cursor }}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
          onWheel={handleWheel} onContextMenu={e => e.preventDefault()} />

        {/* 左侧浮动面板（可折叠） */}
        <div style={S.leftPanel}>
          <div style={S.panelHeader}>
            <span style={S.panelTitle}>⚙️ 斜抛运动</span>
            <button style={S.foldBtn} onClick={() => setLeftOpen(o => !o)}>{leftOpen ? '▲' : '▼'}</button>
          </div>
          {leftOpen && (<>
            <div style={S.sliderRow}>
              <span style={S.sliderLabel}>初速度</span>
              <input type="range" min={1} max={30} step={0.5} value={v0}
                style={S.slider}
                onChange={e => { const v = +e.target.value; sim.current.v0 = v; setV0(v) }} />
              <span style={S.sliderVal}>{v0.toFixed(1)} m/s</span>
            </div>
            <div style={S.sliderRow}>
              <span style={S.sliderLabel}>角度</span>
              <input type="range" min={5} max={80} step={1} value={angle}
                style={S.slider}
                onChange={e => { const v = +e.target.value; sim.current.angle = v; setAngle(v) }} />
              <span style={S.sliderVal}>{angle}°</span>
            </div>
            {flightData && (
              <div style={S.dataBox}>
                <div style={S.dataLine}><span style={S.dot('#FFD700')} /> t = {flightData.time.toFixed(2)} s</div>
                <div style={S.dataLine}><span style={S.dot('#4ECDC4')} /> x = {flightData.x.toFixed(2)} m</div>
                <div style={S.dataLine}><span style={S.dot('#FF6B6B')} /> y = {flightData.y.toFixed(2)} m</div>
                <div style={S.dataLine}><span style={S.dot('#4CAF50')} /> Hmax = {flightData.maxHeight.toFixed(2)} m</div>
              </div>
            )}
            <div style={S.divider} />
            <div style={S.formulaBox}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1a1a2e', marginBottom: 4 }}>📐 斜抛运动规律</div>
              <div style={{ color: '#4ECDC4', fontSize: 12, fontFamily: 'serif' }}>x = v₀cosθ·t（匀速）</div>
              <div style={{ color: '#FF6B6B', fontSize: 12, fontFamily: 'serif' }}>y = v₀sinθ·t − ½gt²（匀加速）</div>
              <div style={{ color: '#888', fontSize: 10, marginTop: 4 }}>水平方向匀速，竖直方向匀加速</div>
            </div>
          </>) }
        </div>

        {/* 右侧浮动面板（可折叠） */}
        <div style={S.rightPanel}>
          <div style={S.panelHeader}>
            <span style={S.panelTitle}>🎯 参数面板</span>
            <button style={S.foldBtn} onClick={() => setRightOpen(o => !o)}>{rightOpen ? '▲' : '▼'}</button>
          </div>
          {rightOpen && (<>

        <div style={S.sectionTitle}>炮弹类型</div>
        <select style={S.select} value={projIdx} onChange={e => { const i = +e.target.value; sim.current.projectileIdx = i; setProjIdx(i) }}>
          {PROJECTILES.map((p, i) => <option key={p.id} value={i}>{p.name}</option>)}
        </select>
        <div style={S.paramLine}>质量：{PROJECTILES[projIdx].mass} kg</div>
        <div style={S.paramLine}>直径：{PROJECTILES[projIdx].diameter} m</div>

        <div style={S.divider} />

        <div style={S.sectionTitle}>空气阻力</div>
        <label style={S.checkLabel}>
          <input type="checkbox" checked={airOn} onChange={e => { sim.current.airResistance = e.target.checked; setAirOn(e.target.checked) }} />
          <span>开启空气阻力</span>
        </label>
        {airOn && (
          <div style={S.sliderRow}>
            <span style={S.sliderLabel}>系数</span>
            <input type="range" min={0.1} max={5} step={0.1} value={dragCoeff}
              style={S.slider}
              onChange={e => { const v = +e.target.value; sim.current.dragCoeff = v; setDragCoeff(v) }} />
            <span style={S.sliderVal}>{dragCoeff.toFixed(1)}</span>
          </div>
        )}

        <div style={S.divider} />

        <div style={S.sectionTitle}>速度矢量</div>
        <label style={S.checkLabel}>
          <input type="checkbox" checked={sim.current.showTotalV}
            onChange={e => { sim.current.showTotalV = e.target.checked; triggerRender() }} />
          <span style={{ color: '#FFD700' }}>●</span> 总速度矢量
        </label>
        <label style={S.checkLabel}>
          <input type="checkbox" checked={sim.current.showCompV}
            onChange={e => { sim.current.showCompV = e.target.checked; triggerRender() }} />
          <span style={{ color: '#4ECDC4' }}>●</span> vx / <span style={{ color: '#FF6B6B' }}>●</span> vy 分量
        </label>

        <div style={S.sectionTitle}>加速度矢量</div>
        <label style={S.checkLabel}>
          <input type="checkbox" checked={sim.current.showTotalA}
            onChange={e => { sim.current.showTotalA = e.target.checked; triggerRender() }} />
          <span style={{ color: '#E040FB' }}>●</span> 总加速度矢量
        </label>
        <label style={S.checkLabel}>
          <input type="checkbox" checked={sim.current.showCompA}
            onChange={e => { sim.current.showCompA = e.target.checked; triggerRender() }} />
          <span style={{ color: '#AB47BC' }}>●</span> ax / <span style={{ color: '#7B1FA2' }}>●</span> ay 分量
        </label>

        <div style={S.divider} />

        <div style={S.sectionTitle}>测量工具</div>
        <button style={{ ...S.btn, ...(sim.current.tapeVisible ? S.tapeActiveBtn : S.tapeBtn) }}
          onClick={() => { sim.current.tapeVisible = !sim.current.tapeVisible; triggerRender() }}>
          📏 {sim.current.tapeVisible ? '隐藏卷尺' : '显示卷尺'}
          </button>
          </>)}
        </div>

        {/* 【布局修改处】底部发射控制条 */}
        <div style={S.bottomBar}>
          <div style={S.bottomBtnRow}>
            <button style={{ ...S.btn, ...S.launchBtn }} onClick={handleLaunch} disabled={running}>▶ 发射</button>
            <button style={{ ...S.btn, ...(paused ? S.resumeBtn : S.pauseBtn) }} onClick={handlePauseResume} disabled={!running}>
              {paused ? '▶ 继续' : '⏸ 暂停'}
            </button>
            <button style={{ ...S.btn, ...(slowMode ? S.slowActiveBtn : S.slowBtn) }} onClick={handleSlowToggle}>
              {slowMode ? '🐇 正常' : '🐢 慢速'}
            </button>
            <button style={{ ...S.btn, ...S.stepBtn }} onClick={handleStep} disabled={!running || !paused}>⏭</button>
            <button style={{ ...S.btn, ...S.eraseBtn }} onClick={handleClear}>🗑 清除</button>
            <button style={{ ...S.btn, ...S.resetBtn }} onClick={handleReset}>↺ 重置</button>
          </div>
          {flightData && (
            <div style={S.bottomData}>
              <span>t={flightData.time.toFixed(2)}s</span>
              <span>x={flightData.x.toFixed(2)}m</span>
              <span>y={flightData.y.toFixed(2)}m</span>
              <span>Hmax={flightData.maxHeight.toFixed(2)}m</span>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

// ============ 样式 ============
const S = {
  pageWrapper: { position: 'relative', width: '100%', height: '100vh', background: '#1a1a2e', overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },

  /* 顶部标题栏 */
  titleBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: 44, zIndex: 20,
    background: 'linear-gradient(135deg, #1565C0, #0D47A1)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
  },
  titleText: { color: '#fff', fontSize: 15, fontWeight: 700, letterSpacing: 1 },
  titleHint: { color: 'rgba(255,255,255,0.75)', fontSize: 12 },

  /* 全屏画布容器 */
  canvasWrap: { position: 'absolute', top: 44, left: 0, right: 0, bottom: 0 },
  canvas: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1 },

  /* 左侧浮动面板 */
  leftPanel: {
    position: 'absolute', top: 12, left: 12,
    width: 240,
    background: 'rgba(255,255,255,0.82)', borderRadius: 10,
    padding: '12px 14px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    border: '1px solid rgba(0,0,0,0.08)',
    maxHeight: 'calc(100% - 80px)', overflowY: 'auto',
    zIndex: 10,
  },
  panelHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  foldBtn: { background: 'rgba(0,0,0,0.06)', border: 'none', borderRadius: 4, width: 22, height: 22, cursor: 'pointer', fontSize: 10, color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center' },

  /* 右侧浮动面板 */
  rightPanel: {
    position: 'absolute', top: 12, right: 12,
    width: 220,
    background: 'rgba(255,255,255,0.82)', borderRadius: 10,
    padding: '12px 14px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    border: '1px solid rgba(0,0,0,0.08)',
    maxHeight: 'calc(100% - 80px)', overflowY: 'auto',
    zIndex: 10,
  },

  /* 【布局修改处】底部发射控制条 */
  bottomBar: {
    position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(255,255,255,0.93)', borderRadius: 12,
    padding: '10px 18px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    border: '1px solid rgba(0,0,0,0.08)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    zIndex: 10,
  },
  bottomBtnRow: { display: 'flex', gap: 6, alignItems: 'center' },
  bottomData: { display: 'flex', gap: 16, fontSize: 12, color: '#555', fontWeight: 500 },

  // 通用
  panelTitle: { fontSize: 15, fontWeight: 700, color: '#1a1a2e', marginBottom: 10 },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 1, margin: '10px 0 6px' },
  divider: { height: 1, background: '#e0e0e0', margin: '10px 0' },

  // 滑块
  sliderRow: { display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0' },
  sliderLabel: { fontSize: 11, color: '#888', minWidth: 36 },
  slider: { flex: 1, accentColor: '#FF9800', height: 4 },
  sliderVal: { fontSize: 11, fontWeight: 600, color: '#FF9800', minWidth: 48, textAlign: 'right' },

  // 按钮
  btn: { border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 600, transition: 'all 0.15s' },
  btnRow: { display: 'flex', gap: 6, margin: '6px 0' },
  launchBtn: { background: '#FF9800', color: '#fff', flex: 1 },
  eraseBtn: { background: '#f5f5f5', color: '#666', flex: 1 },
  pauseBtn: { background: '#E53935', color: '#fff', flex: 1 },
  resumeBtn: { background: '#4CAF50', color: '#fff', flex: 1 },
  slowBtn: { background: '#f5f5f5', color: '#666', flex: 1 },
  slowActiveBtn: { background: '#2196F3', color: '#fff', flex: 1 },
  stepBtn: { background: '#f5f5f5', color: '#666', padding: '7px 10px' },
  tapeBtn: { background: '#f5f5f5', color: '#666', width: '100%' },
  tapeActiveBtn: { background: '#FFEB3B', color: '#333', width: '100%' },
  resetBtn: { background: '#78909C', color: '#fff', flex: 1 },
  formulaBox: { background: '#f0f7ff', borderRadius: 8, padding: '8px 10px', borderLeft: '3px solid #4A90D9' },

  // 选择框
  select: { width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13, marginBottom: 6, background: '#fff' },

  // 参数
  paramLine: { fontSize: 12, color: '#666', margin: '2px 0' },
  checkLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#555', margin: '4px 0', cursor: 'pointer' },

  // 数据
  dataBox: { background: '#f8f8f8', borderRadius: 8, padding: '8px 10px', marginTop: 8 },
  dataLine: { fontSize: 12, color: '#333', margin: '3px 0', display: 'flex', alignItems: 'center', gap: 6 },
  dot: (c) => ({ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0 }),
}
