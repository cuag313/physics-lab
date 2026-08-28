import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * CosmicVelocityScene — 三大宇宙速度 + 同步卫星
 *
 * 第一宇宙速度（环绕速度）：v₁ = √(gR) = 7.9 km/s
 * 第二宇宙速度（逃逸速度）：v₂ = √(2gR) = 11.2 km/s
 * 第三宇宙速度（飞出太阳系）：v₃ = 16.7 km/s
 *
 * 同步卫星：T=24h, h≈36000km, 轨道在赤道平面上空
 *
 * 交互：
 * - 切换三种宇宙速度演示
 * - 发射卫星，调节初速度
 * - 同步卫星参数推导
 * - 轨道可视化
 */
export default function CosmicVelocityScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    mode: 'first',       // first | second | third | sync

    // 地球参数
    R: 6371,             // km
    M: 5.972e24,         // kg
    g: 9.8,              // m/s²

    // 卫星
    v: 7.9,              // km/s (初速度)
    altitude: 200,       // km
    angle: 0,            // 当前角度
    trail: [],
    maxTrail: 800,
    launched: false,
    crashed: false,
    escaped: false,

    // 同步卫星
    syncH: 35786,        // km
    syncT: 24,           // h
    syncV: 3.07,         // km/s

    // 动画
    time: 0,
    dt: 0.02,            // 时间步长（加速动画）
    animSpeed: 1,

    // 第三宇宙速度
    v3Sun: 42.1,         // 绕太阳速度 km/s
    v3Earth: 16.7,       // 地球系速度 km/s
  })

  const [mode, setMode] = useState('first')
  const [v, setV] = useState(7.9)
  const [altitude, setAltitude] = useState(200)
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const R = createRenderer(canvas)
    canvasRef.current._R = R

    const loop = () => {
      updatePhysics()
      renderFrame(R)
      animRef.current = requestAnimationFrame(loop)
    }
    loop()

    const onResize = () => R.resize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [])

  function createRenderer(canvas) {
    const R = {
      canvas, ctx: canvas.getContext('2d'),
      W: 0, H: 0, scale: 1, ox: 0, oy: 0,
      resize() {
        const rect = canvas.getBoundingClientRect()
        canvas.width = rect.width * devicePixelRatio
        canvas.height = rect.height * devicePixelRatio
        this.ctx.scale(devicePixelRatio, devicePixelRatio)
        this.W = rect.width; this.H = rect.height
        this.ox = this.W * 0.5; this.oy = this.H * 0.5
        this.scale = Math.min(this.W, this.H) / 300000 // 缩放
      },
      clear() { this.ctx.clearRect(0, 0, this.W, this.H) },
    }
    R.resize()
    return R
  }

  // ========== Physics ==========
  function updatePhysics() {
    const s = S.current
    if (!s.launched || s.crashed || s.escaped) return

    const dt = s.dt * s.animSpeed
    s.time += dt

    // 简化轨道计算（圆形/椭圆轨道近似）
    const r = s.R + s.altitude // km
    const vKm = s.v            // km/s

    // 环绕速度 at altitude
    const vOrbit = Math.sqrt(398600 / r) // √(GM/r), GM=398600 km³/s²

    if (s.mode === 'first' || s.mode === 'sync') {
      // 圆形轨道
      if (Math.abs(vKm - vOrbit) < 0.5) {
        // 近似圆轨道
        const omega = vKm / r
        s.angle += omega * dt
        s.altitude = r - s.R
      } else if (vKm > vOrbit) {
        // 椭圆轨道（简化）
        const omega = vKm / r * 0.95
        s.angle += omega * dt
        s.altitude = r - s.R + Math.sin(s.angle * 2) * 500
      } else {
        // 速度不足，坠落
        s.altitude -= 50 * dt
        if (s.altitude < 0) { s.altitude = 0; s.crashed = true }
      }
    } else if (s.mode === 'second') {
      // 逃逸轨道
      const vEsc = Math.sqrt(2 * 398600 / r)
      if (vKm >= vEsc * 0.95) {
        // 逃逸
        s.altitude += (vKm - vOrbit) * 50 * dt
        if (s.altitude > 50000) s.escaped = true
        s.angle += (vOrbit / r) * dt
      } else {
        // 椭圆轨道
        const omega = vKm / r
        s.angle += omega * dt
        s.altitude = r - s.R + Math.sin(s.angle) * 2000
      }
    }

    // 记录轨迹
    const px = (s.R + s.altitude) * Math.cos(s.angle)
    const py = (s.R + s.altitude) * Math.sin(s.angle)
    s.trail.push({ x: px, y: py })
    if (s.trail.length > s.maxTrail) s.trail.shift()

    forceUpdate(n => n + 1)
  }

  // ========== Render ==========
  function renderFrame(R) {
    const ctx = R.ctx
    R.clear()

    drawBackground(ctx, R)

    if (S.current.mode === 'first') drawFirstVelocity(ctx, R)
    else if (S.current.mode === 'second') drawSecondVelocity(ctx, R)
    else if (S.current.mode === 'third') drawThirdVelocity(ctx, R)
    else drawSyncSatellite(ctx, R)

    drawInfoPanel(ctx, R)
    drawDescription(ctx, R)
  }

  function drawBackground(ctx, R) {
    const grad = ctx.createRadialGradient(R.ox, R.oy, 0, R.ox, R.oy, R.W)
    grad.addColorStop(0, '#0d1b2a'); grad.addColorStop(0.5, '#000814'); grad.addColorStop(1, '#000')
    ctx.fillStyle = grad; ctx.fillRect(0, 0, R.W, R.H)

    // 星星
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    for (let i = 0; i < 100; i++) {
      const x = (Math.sin(i * 137.5) * 0.5 + 0.5) * R.W
      const y = (Math.cos(i * 97.3) * 0.5 + 0.5) * R.H
      ctx.beginPath(); ctx.arc(x, y, Math.random(), 0, Math.PI * 2); ctx.fill()
    }
  }

  // ========== 地球绘制 ==========
  function drawEarth(ctx, R, earthR) {
    const [cx, cy] = [R.ox, R.oy]

    // 大气层
    const atmosGrad = ctx.createRadialGradient(cx, cy, earthR, cx, cy, earthR * 1.15)
    atmosGrad.addColorStop(0, 'rgba(100,181,246,0.15)')
    atmosGrad.addColorStop(1, 'rgba(100,181,246,0)')
    ctx.fillStyle = atmosGrad
    ctx.beginPath(); ctx.arc(cx, cy, earthR * 1.15, 0, Math.PI * 2); ctx.fill()

    // 地球
    const grad = ctx.createRadialGradient(cx - earthR * 0.3, cy - earthR * 0.3, 0, cx, cy, earthR)
    grad.addColorStop(0, '#4FC3F7'); grad.addColorStop(0.4, '#0288D1'); grad.addColorStop(1, '#01579B')
    ctx.fillStyle = grad
    ctx.beginPath(); ctx.arc(cx, cy, earthR, 0, Math.PI * 2); ctx.fill()

    // 陆地（简化）
    ctx.fillStyle = 'rgba(76,175,80,0.3)'
    ctx.beginPath(); ctx.arc(cx - earthR * 0.2, cy - earthR * 0.1, earthR * 0.3, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(cx + earthR * 0.3, cy + earthR * 0.2, earthR * 0.25, 0, Math.PI * 2); ctx.fill()

    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.beginPath(); ctx.arc(cx - earthR * 0.3, cy - earthR * 0.3, earthR * 0.4, 0, Math.PI * 2); ctx.fill()

    // 标签
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('地球', cx, cy + earthR + 18)
    ctx.fillStyle = '#8b949e'; ctx.font = '10px sans-serif'
    ctx.fillText(`R = 6371 km`, cx, cy + earthR + 32)
  }

  // ========== 第一宇宙速度 ==========
  function drawFirstVelocity(ctx, R) {
    const earthR = Math.min(R.W, R.H) * 0.18
    drawEarth(ctx, R, earthR)

    const s = S.current

    // 轨道
    if (s.launched && !s.crashed) {
      const orbitR = earthR * (1 + s.altitude / s.R)

      // 轨道圆
      ctx.strokeStyle = 'rgba(79,195,247,0.3)'; ctx.lineWidth = 2
      ctx.setLineDash([8, 4])
      ctx.beginPath(); ctx.arc(R.ox, R.oy, orbitR, 0, Math.PI * 2); ctx.stroke()
      ctx.setLineDash([])

      // 卫星位置
      const sx = R.ox + orbitR * Math.cos(s.angle)
      const sy = R.oy + orbitR * Math.sin(s.angle)

      // 轨迹
      if (s.trail.length > 1) {
        ctx.strokeStyle = 'rgba(255,152,0,0.4)'; ctx.lineWidth = 2; ctx.beginPath()
        for (let i = 0; i < s.trail.length; i++) {
          const dist = Math.sqrt(s.trail[i].x ** 2 + s.trail[i].y ** 2)
          const scale = earthR / (s.R * 1000) // 简化缩放
          const tx = R.ox + s.trail[i].x * scale / 1000
          const ty = R.oy + s.trail[i].y * scale / 1000
          if (i === 0) ctx.moveTo(tx, ty); else ctx.lineTo(tx, ty)
        }
        ctx.stroke()
      }

      // 卫星
      ctx.fillStyle = '#FFD54F'
      ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2); ctx.fill()

      // 太阳能板
      ctx.strokeStyle = '#aaa'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(sx - 10, sy); ctx.lineTo(sx + 10, sy); ctx.stroke()
      ctx.fillStyle = '#1565C0'
      ctx.fillRect(sx - 12, sy - 3, 6, 6)
      ctx.fillRect(sx + 6, sy - 3, 6, 6)

      // 速度箭头
      const vx = -Math.sin(s.angle)
      const vy = Math.cos(s.angle)
      const vLen = 25
      ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + vx * vLen, sy + vy * vLen); ctx.stroke()
      drawArrowHead(ctx, sx + vx * vLen, sy + vy * vLen, Math.atan2(vy, vx), '#4CAF50')

      // 高度标注
      ctx.strokeStyle = 'rgba(255,213,79,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3])
      ctx.beginPath(); ctx.moveTo(R.ox, R.oy); ctx.lineTo(sx, sy); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#FFD54F'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(`h = ${s.altitude.toFixed(0)} km`, (R.ox + sx) / 2, (R.oy + sy) / 2 - 8)
    }

    // 三个速度标注
    const v1 = 7.9, v2 = 11.2, v3 = 16.7
    const infoY = R.H - 120
    const infoX = 20
    ctx.font = '12px sans-serif'; ctx.textAlign = 'left'

    const items = [
      { v: v1, label: 'v₁ = 7.9 km/s（环绕）', color: '#4CAF50' },
      { v: v2, label: 'v₂ = 11.2 km/s（逃逸）', color: '#FF9800' },
      { v: v3, label: 'v₃ = 16.7 km/s（飞出太阳系）', color: '#F44336' },
    ]

    items.forEach((item, i) => {
      ctx.fillStyle = item.color
      ctx.fillText(item.label, infoX, infoY + i * 20)
    })

    // 当前速度
    ctx.fillStyle = s.v >= v3 ? '#F44336' : s.v >= v2 ? '#FF9800' : s.v >= v1 ? '#4CAF50' : '#8b949e'
    ctx.font = 'bold 14px sans-serif'
    ctx.fillText(`当前速度: ${s.v.toFixed(1)} km/s`, infoX, infoY - 25)
  }

  // ========== 第二宇宙速度 ==========
  function drawSecondVelocity(ctx, R) {
    const earthR = Math.min(R.W, R.H) * 0.15
    drawEarth(ctx, R, earthR)

    const s = S.current

    // 双曲线逃逸轨道
    if (s.launched) {
      const vEsc = Math.sqrt(2 * 398600 / (s.R + s.altitude))
      const isEscaping = s.v >= vEsc * 0.95

      if (isEscaping) {
        // 逃逸轨迹（螺旋向外）
        ctx.strokeStyle = 'rgba(255,152,0,0.5)'; ctx.lineWidth = 2; ctx.beginPath()
        for (let i = 0; i < 200; i++) {
          const t = i / 200
          const r = earthR * (1 + t * 3)
          const a = s.angle - t * 4
          const x = R.ox + r * Math.cos(a)
          const y = R.oy + r * Math.sin(a)
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        }
        ctx.stroke()

        // 卫星
        const satR = earthR * (1 + (s.altitude / 50000) * 3)
        const sx = R.ox + satR * Math.cos(s.angle)
        const sy = R.oy + satR * Math.sin(s.angle)
        ctx.fillStyle = '#FFD54F'
        ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2); ctx.fill()

        // "逃逸"标签
        ctx.fillStyle = '#4CAF50'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'
        ctx.fillText('正在逃逸地球引力！', R.W / 2, 40)
      }
    }

    // 公式
    ctx.fillStyle = '#FFD54F'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('v₂ = √(2gR) = 11.2 km/s', 20, R.H - 80)
    ctx.fillStyle = '#8b949e'; ctx.font = '11px sans-serif'
    ctx.fillText('当 v ≥ v₂ 时，物体脱离地球引力', 20, R.H - 62)
    ctx.fillText('v₂ = √2 × v₁', 20, R.H - 44)
  }

  // ========== 第三宇宙速度 ==========
  function drawThirdVelocity(ctx, R) {
    const s = S.current

    // 太阳
    const sunR = 25
    const [sunX, sunY] = [R.W * 0.5, R.oy]
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 3)
    sunGrad.addColorStop(0, '#FFF9C4'); sunGrad.addColorStop(0.3, '#FFD54F'); sunGrad.addColorStop(1, 'rgba(255,152,0,0)')
    ctx.fillStyle = sunGrad
    ctx.beginPath(); ctx.arc(sunX, sunY, sunR * 3, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#FFD54F'
    ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2); ctx.fill()

    // 地球轨道
    const earthOrbitR = 120
    ctx.strokeStyle = 'rgba(79,195,247,0.3)'; ctx.lineWidth = 1; ctx.setLineDash([6, 4])
    ctx.beginPath(); ctx.arc(sunX, sunY, earthOrbitR, 0, Math.PI * 2); ctx.stroke()
    ctx.setLineDash([])

    // 地球
    const earthAngle = s.time * 0.3
    const ex = sunX + earthOrbitR * Math.cos(earthAngle)
    const ey = sunY + earthOrbitR * Math.sin(earthAngle)
    ctx.fillStyle = '#4FC3F7'
    ctx.beginPath(); ctx.arc(ex, ey, 8, 0, Math.PI * 2); ctx.fill()

    // 第三宇宙速度箭头
    if (s.launched) {
      const arrowLen = 60
      const vx = -Math.sin(earthAngle)
      const vy = Math.cos(earthAngle)
      ctx.strokeStyle = '#F44336'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + vx * arrowLen, ey + vy * arrowLen); ctx.stroke()
      drawArrowHead(ctx, ex + vx * arrowLen, ey + vy * arrowLen, Math.atan2(vy, vx), '#F44336')

      // 逃逸轨迹（螺旋出太阳系）
      ctx.strokeStyle = 'rgba(244,67,54,0.4)'; ctx.lineWidth = 2; ctx.beginPath()
      for (let i = 0; i < 300; i++) {
        const t = i / 300
        const r = earthOrbitR + t * 300
        const a = earthAngle - t * 3
        const x = sunX + r * Math.cos(a)
        const y = sunY + r * Math.sin(a)
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }

    // 推导公式
    const bx = 20, by = R.H - 160
    ctx.fillStyle = '#FFD54F'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('第三宇宙速度推导', bx, by)
    ctx.fillStyle = '#c9d1d9'; ctx.font = '11px sans-serif'
    ctx.fillText('① 先脱离地球引力 → v₂ = 11.2 km/s', bx, by + 20)
    ctx.fillText('② 在地球轨道上脱离太阳引力', bx, by + 38)
    ctx.fillText('   v_太阳逃逸 = √(2GM_sun/r) ≈ 42.1 km/s', bx, by + 56)
    ctx.fillText('③ 地球公转速度 ≈ 29.8 km/s', bx, by + 74)
    ctx.fillText('④ 需额外速度 = 42.1 - 29.8 = 12.3 km/s', bx, by + 92)
    ctx.fillStyle = '#F44336'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('⑤ v₃ = √(v₂² + 12.3²) ≈ 16.7 km/s', bx, by + 110)
  }

  // ========== 同步卫星 ==========
  function drawSyncSatellite(ctx, R) {
    const s = S.current
    const earthR = Math.min(R.W, R.H) * 0.12
    drawEarth(ctx, R, earthR)

    // 同步轨道
    const syncOrbitR = earthR * (1 + s.syncH / s.R)
    ctx.strokeStyle = 'rgba(255,213,79,0.4)'; ctx.lineWidth = 2
    ctx.setLineDash([8, 4])
    ctx.beginPath(); ctx.arc(R.ox, R.oy, syncOrbitR, 0, Math.PI * 2); ctx.stroke()
    ctx.setLineDash([])

    // 普通轨道对比
    const lowOrbitR = earthR * (1 + 400 / s.R)
    ctx.strokeStyle = 'rgba(139,148,158,0.3)'; ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.arc(R.ox, R.oy, lowOrbitR, 0, Math.PI * 2); ctx.stroke()
    ctx.setLineDash([])

    // 同步卫星
    const syncAngle = s.time * 0.15 // 24h一圈，动画加速
    const sx = R.ox + syncOrbitR * Math.cos(syncAngle)
    const sy = R.oy + syncOrbitR * Math.sin(syncAngle)

    // 卫星
    ctx.fillStyle = '#FFD54F'
    ctx.beginPath(); ctx.arc(sx, sy, 6, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#aaa'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(sx - 12, sy); ctx.lineTo(sx + 12, sy); ctx.stroke()
    ctx.fillStyle = '#1565C0'
    ctx.fillRect(sx - 14, sy - 3, 6, 6)
    ctx.fillRect(sx + 8, sy - 3, 6, 6)

    // 连线（地心-卫星）
    ctx.strokeStyle = 'rgba(255,213,79,0.3)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(R.ox, R.oy); ctx.lineTo(sx, sy); ctx.stroke()

    // 标注
    ctx.fillStyle = '#FFD54F'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('同步卫星', sx, sy - 18)
    ctx.fillStyle = '#8b949e'; ctx.font = '10px sans-serif'
    ctx.fillText(`h = ${s.syncH.toLocaleString()} km`, sx, sy + 22)

    // 半径标注
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(R.ox, R.oy); ctx.lineTo(R.ox + syncOrbitR, R.oy); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#c9d1d9'; ctx.font = '10px sans-serif'
    ctx.fillText(`r = ${(s.R + s.syncH).toLocaleString()} km`, R.ox + syncOrbitR / 2, R.oy + 14)

    // 推导面板
    const pw = 260, ph = 200
    const px = R.W - pw - 20, py = 60

    ctx.fillStyle = 'rgba(22,27,34,0.95)'
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.fill()
    ctx.strokeStyle = '#30363d'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.stroke()

    ctx.fillStyle = '#FFD54F'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('📡 同步卫星推导', px + 12, py + 20)

    ctx.fillStyle = '#c9d1d9'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left'
    let y = py + 40
    ctx.fillText('① T = 24h = 86400s', px + 12, y); y += 18
    ctx.fillText('② 万有引力提供向心力：', px + 12, y); y += 18
    ctx.fillStyle = '#4FC3F7'
    ctx.fillText('   GMm/r² = m·4π²r/T²', px + 12, y); y += 18
    ctx.fillStyle = '#c9d1d9'
    ctx.fillText('③ 解出 r³ = GMT²/(4π²)', px + 12, y); y += 18
    ctx.fillText(`④ r = ${(s.R + s.syncH).toLocaleString()} km`, px + 12, y); y += 18
    ctx.fillText(`⑤ h = r - R = ${s.syncH.toLocaleString()} km`, px + 12, y); y += 18
    ctx.fillStyle = '#4CAF50'
    ctx.fillText(`⑥ v = 2πr/T = ${s.syncV} km/s`, px + 12, y); y += 22
    ctx.fillStyle = '#FFD54F'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('特点：赤道平面、定高35786km、T=24h', px + 12, y)
  }

  // ========== 信息面板 ==========
  function drawInfoPanel(ctx, R) {
    const s = S.current
    const pw = 200, ph = 140
    const px = 16, py = 16

    ctx.fillStyle = 'rgba(22,27,34,0.95)'
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.fill()
    ctx.strokeStyle = '#30363d'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.stroke()

    ctx.fillStyle = '#c9d1d9'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('📊 宇宙速度', px + 12, py + 20)

    ctx.font = '11px sans-serif'; let y = py + 40

    const items = [
      { v: '7.9', label: '环绕速度', color: '#4CAF50' },
      { v: '11.2', label: '逃逸速度', color: '#FF9800' },
      { v: '16.7', label: '飞出太阳系', color: '#F44336' },
    ]

    items.forEach(item => {
      ctx.fillStyle = item.color
      ctx.fillText(`v = ${item.v} km/s  ${item.label}`, px + 12, y)
      y += 18
    })

    y += 8
    ctx.fillStyle = '#FFD54F'
    ctx.fillText(`当前: ${s.v.toFixed(1)} km/s`, px + 12, y)
  }

  function drawDescription(ctx, R) {
    const h = R.H, x = 16, y = h - 40
    ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    ctx.fillStyle = '#c9d1d9'; ctx.font = 'bold 14px sans-serif'
    ctx.fillText('三大宇宙速度与同步卫星', x, y)
    ctx.fillStyle = '#8b949e'; ctx.font = '11px sans-serif'
    ctx.fillText('调节发射速度观察不同轨道 · 切换模式查看推导过程', x + 230, y)
  }

  // ========== 通用 ==========
  function drawArrowHead(ctx, x, y, angle, color) {
    const headLen = 8
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x - headLen * Math.cos(angle - 0.35), y - headLen * Math.sin(angle - 0.35))
    ctx.lineTo(x - headLen * Math.cos(angle + 0.35), y - headLen * Math.sin(angle + 0.35))
    ctx.closePath(); ctx.fill()
  }

  // ========== Controls ==========
  const handleLaunch = useCallback(() => {
    const s = S.current
    s.launched = true
    s.crashed = false
    s.escaped = false
    s.angle = 0
    s.time = 0
    s.trail = []
  }, [])

  const handleReset = useCallback(() => {
    const s = S.current
    s.launched = false; s.crashed = false; s.escaped = false
    s.angle = 0; s.time = 0; s.trail = []
  }, [])

  const handleVChange = useCallback((val) => {
    S.current.v = val
    setV(val)
  }, [])

  const handleModeChange = useCallback((newMode) => {
    S.current.mode = newMode
    handleReset()
    setMode(newMode)
  }, [handleReset])

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <span style={styles.title}>三大宇宙速度 · 同步卫星</span>
        <div style={styles.toolbarActions}>
          <button style={styles.launchBtn} onClick={handleLaunch}>🚀 发射</button>
          <button style={styles.btn} onClick={handleReset}>↺ 重置</button>
          <div style={styles.sep} />
          <div style={styles.modeGroup}>
            {[
              { key: 'first', label: 'v₁环绕' },
              { key: 'second', label: 'v₂逃逸' },
              { key: 'third', label: 'v₃飞出' },
              { key: 'sync', label: '同步卫星' },
            ].map(m => (
              <button key={m.key}
                style={mode === m.key ? styles.modeBtnActive : styles.modeBtn}
                onClick={() => handleModeChange(m.key)}>
                {m.label}
              </button>
            ))}
          </div>
          <label style={styles.controlLabel}>
            发射速度：
            <input type="range" min="1" max="20" step="0.1"
              value={v}
              onChange={(e) => handleVChange(parseFloat(e.target.value))}
              style={styles.slider} />
            <span style={styles.sliderVal}>{v.toFixed(1)} km/s</span>
          </label>
        </div>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={styles.canvas} />
      </div>
      <div style={styles.desc}>
        <b>宇宙速度</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          调节发射速度 → v₁=7.9环绕 · v₂=11.2逃逸 · v₃=16.7飞出太阳系 · 同步卫星模式展示推导
        </span>
      </div>
    </div>
  )
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#000', color: '#e0e0e0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  toolbar: { minHeight: 44, background: '#0d1b2a', borderBottom: '1px solid #1b2838', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', flexShrink: 0, flexWrap: 'wrap', gap: 6 },
  title: { fontSize: 14, fontWeight: 600, color: '#c9d1d9' },
  toolbarActions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  controlLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8b949e' },
  slider: { width: 80, accentColor: '#FFD54F' },
  sliderVal: { color: '#FFD54F', fontWeight: 600, minWidth: 60, fontSize: 12 },
  btn: { background: '#1b2838', color: '#c9d1d9', border: '1px solid #2d3f52', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  launchBtn: { background: '#F44336', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  sep: { width: 1, height: 20, background: '#1b2838' },
  modeGroup: { display: 'flex', gap: 4 },
  modeBtn: { background: '#1b2838', color: '#8b949e', border: '1px solid #2d3f52', borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer' },
  modeBtnActive: { background: '#FFD54F', color: '#000', border: '1px solid #FFD54F', borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer', fontWeight: 600 },
  main: { flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' },
  canvas: { flex: 1, width: '100%' },
  desc: { padding: '8px 14px', background: '#0d1b2a', borderTop: '1px solid #1b2838', fontSize: 13, color: '#c9d1d9' },
}
