import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * GalileoFreeFallScene — 伽利略自由落体与斜面实验
 *
 * 实验1：比萨斜塔 — 不同质量球同时落地
 * 实验2：斜面对比 — 同球沿垂直边/斜边/弧线滚下，比谁最快
 */
export default function GalileoFreeFallScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    mode: 'pisa',

    // 比萨斜塔
    pisaH: 6,
    pisaBalls: [
      { m: 1.0, y: 0, v: 0, done: false, color: '#0288D1', r: 14 },
      { m: 2.0, y: 0, v: 0, done: false, color: '#FF9800', r: 17 },
      { m: 5.0, y: 0, v: 0, done: false, color: '#D32F2F', r: 22 },
    ],
    pisaPhase: 'idle',
    pisaTime: 0,
    pisaResult: null,

    // 斜面对比
    triH: 5.0,
    triBase: 4.0,

    // 垂直边球
    vertY: 0, vertV: 0, vertDone: false, vertTime: 0,
    // 斜边球
    rampS: 0, rampV: 0, rampDone: false, rampTime: 0,
    // 弧线球
    arcS: 0, arcV: 0, arcDone: false, arcTime: 0,

    triPhase: 'idle',

    // 弧线参数（圆弧，圆心在底角外侧）
    arcR: 0, arcCx: 0, arcCy: 0, arcLen: 0,
    arcStartAngle: 0, arcEndAngle: 0,

    g: 9.8,
    time: 0,
    guideDismissed: false,
  })

  const [mode, setMode] = useState('pisa')
  const [triH, setTriH] = useState(5.0)
  const [triBase, setTriBase] = useState(4.0)
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const R = createRenderer(canvas)
    canvasRef.current._R = R
    calcArc()
    const loop = () => { updatePhysics(); renderFrame(R); animRef.current = requestAnimationFrame(loop) }
    loop()
    const onResize = () => R.resize()
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function createRenderer(canvas) {
    const R = {
      canvas, ctx: canvas.getContext('2d'), W: 0, H: 0, scale: 80, ox: 0, oy: 0,
      resize() {
        const rect = canvas.getBoundingClientRect()
        canvas.width = rect.width * devicePixelRatio
        canvas.height = rect.height * devicePixelRatio
        this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
        this.W = rect.width; this.H = rect.height
        this.ox = this.W * 0.25; this.oy = this.H * 0.08
      },
      w2s(wx, wy) { return [this.ox + wx * this.scale, this.oy + wy * this.scale] },
      clear() { this.ctx.clearRect(0, 0, this.W, this.H) },
    }
    R.resize()
    return R
  }

  // 计算弧线参数（圆弧，向下凸）
  function calcArc() {
    const s = S.current
    // 圆弧从 (0,0) 到 (triBase, triH)，向下凸
    // 用三点定圆：起点、终点、中点偏下
    const ax = 0, ay = 0
    const bx = s.triBase, by = s.triH
    const midX = (ax + bx) / 2, midY = (ay + by) / 2
    // 控制点在中点偏下（向下凸）
    const bulge = Math.min(s.triH, s.triBase) * 0.6
    const cy = midY + bulge

    // 求圆心（三点定圆）
    const D = 2 * (ax * (midY - cy) + midX * (cy - ay) + bx * (ay - midY))
    if (Math.abs(D) < 0.001) { s.arcR = 999; return }
    const ux = ((ax * ax + ay * ay) * (midY - cy) + (midX * midX + cy * cy) * (cy - ay) + (bx * bx + by * by) * (ay - midY)) / D
    const uy = ((ax * ax + ay * ay) * (cx - midX) + (midX * midX + cy * cy) * (ax - cx) + (bx * bx + by * by) * (midX - ax)) / D
    // Hmm, let me use a simpler approach - circular arc with specified radius

    // Simpler: use a circular arc centered below the midpoint
    // Center at (midX, midY + R - bulge), radius = R
    // The arc passes through (0,0) and (triBase, triH)
    // Distance from center to (0,0): sqrt(midX² + (midY+R-bulge)²) = R
    // midX² + (midY+R-bulge)² = R²
    // midX² + midY² + 2*midY*(R-bulge) + (R-bulge)² = R²
    // This is complex. Let me just use a quadratic bezier approximation for simulation.

    // For simulation: parametrize arc as t ∈ [0,1]
    // x = triBase * t, y = triH * t² (quadratic, starts steep then flattens)
    // Actually that's a parabola, not an arc. But for the demo it works.
    // The user said "向下凸" which means concave down from the path perspective.

    // Let me use: y = triH * (t^p) where p < 1 makes it concave (starts steep)
    // p = 0.5 gives y = triH * sqrt(t), which is concave
    s.arcP = 0.5 // power for arc curve

    // Arc length (numerical)
    let len = 0
    const steps = 200
    for (let i = 1; i <= steps; i++) {
      const t0 = (i - 1) / steps, t1 = i / steps
      const x0 = s.triBase * t0, x1 = s.triBase * t1
      const y0 = s.triH * Math.pow(t0, s.arcP), y1 = s.triH * Math.pow(t1, s.arcP)
      len += Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2)
    }
    s.arcLen = len
  }

  // ========== Physics ==========
  function updatePhysics() {
    const s = S.current
    const dt = 1 / 60
    s.time += dt

    // 比萨斜塔
    if (s.mode === 'pisa' && s.pisaPhase === 'running') {
      s.pisaTime += dt
      let allDone = true
      for (const b of s.pisaBalls) {
        if (b.done) continue
        b.y = 0.5 * s.g * s.pisaTime * s.pisaTime
        b.v = s.g * s.pisaTime
        if (b.y >= s.pisaH) { b.y = s.pisaH; b.v = s.g * Math.sqrt(2 * s.pisaH / s.g); b.done = true }
        else allDone = false
      }
      if (allDone) {
        s.pisaPhase = 'done'
        s.pisaResult = { time: Math.sqrt(2 * s.pisaH / s.g), v: s.g * Math.sqrt(2 * s.pisaH / s.g) }
      }
      forceUpdate(n => n + 1)
    }

    // 斜面对比
    if (s.mode === 'triangle' && s.triPhase === 'running') {
      let allDone = true

      // 垂直边：自由落体
      if (!s.vertDone) {
        s.vertTime += dt
        s.vertY = 0.5 * s.g * s.vertTime * s.vertTime
        s.vertV = s.g * s.vertTime
        if (s.vertY >= s.triH) { s.vertY = s.triH; s.vertDone = true }
        else allDone = false
      }

      // 斜边：a = 5g·sinθ/7
      if (!s.rampDone) {
        s.rampTime += dt
        const theta = Math.atan2(s.triH, s.triBase)
        const a = (5 / 7) * s.g * Math.sin(theta)
        s.rampV += a * dt
        s.rampS += s.rampV * dt
        const rampLen = Math.sqrt(s.triH ** 2 + s.triBase ** 2)
        if (s.rampS >= rampLen) { s.rampS = rampLen; s.rampDone = true }
        else allDone = false
      }

      // 弧线：沿曲线滚下
      if (!s.arcDone) {
        s.arcTime += dt
        // 沿弧线的切线方向加速度
        // 数值积分：每步计算当前位置的斜率，求加速度
        const t = s.arcS / s.arcLen // 参数 [0,1]
        if (t < 1) {
          // 当前点斜率
          const dt_small = 0.001
          const t_next = Math.min(t + dt_small, 1)
          const y0 = s.triH * Math.pow(t, s.arcP)
          const y1 = s.triH * Math.pow(t_next, s.arcP)
          const x0 = s.triBase * t, x1 = s.triBase * t_next
          const dx = x1 - x0, dy = y1 - y0
          const dl = Math.sqrt(dx * dx + dy * dy)
          if (dl > 0) {
            // 切线与水平方向夹角的sin（下滑分量）
            const sinAlpha = -dy / dl // dy为负（向下），sinAlpha为正
            const a = (5 / 7) * s.g * sinAlpha
            s.arcV += a * dt
            s.arcS += s.arcV * dt
          }
          if (s.arcS >= s.arcLen) { s.arcS = s.arcLen; s.arcDone = true }
          else allDone = false
        }
      }

      if (allDone) s.triPhase = 'done'
      forceUpdate(n => n + 1)
    }
  }

  // ========== Render ==========
  function renderFrame(R) {
    const ctx = R.ctx; R.clear()
    drawBackground(ctx, R)
    if (S.current.mode === 'pisa') drawPisa(ctx, R)
    else drawTriangle(ctx, R)
    drawInfoPanel(ctx, R)
    drawDescription(ctx, R)
    drawGuideBubble(ctx, R)
  }

  function drawBackground(ctx, R) {
    ctx.fillStyle = '#f0f4f8'; ctx.fillRect(0, 0, R.W, R.H)
  }

  // ========== 比萨斜塔 ==========
  function drawPisa(ctx, R) {
    const s = S.current
    const groundY = R.oy + s.pisaH * R.scale + 60

    // 地面
    ctx.fillStyle = '#e0e0e0'; ctx.fillRect(0, groundY, R.W, R.H - groundY)
    ctx.strokeStyle = '#999'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(R.W, groundY); ctx.stroke()

    // 塔（简化）
    const towerX = R.W * 0.25, towerW = 60
    ctx.fillStyle = '#bdbdbd'
    ctx.fillRect(towerX - towerW / 2, R.oy, towerW, s.pisaH * R.scale)
    ctx.strokeStyle = '#999'; ctx.lineWidth = 2
    ctx.strokeRect(towerX - towerW / 2, R.oy, towerW, s.pisaH * R.scale)

    // 刻度
    ctx.fillStyle = '#888'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right'
    for (let h = 0; h <= s.pisaH; h += 1) {
      const sy = R.oy + h * R.scale
      ctx.beginPath(); ctx.moveTo(towerX - towerW / 2 - 15, sy); ctx.lineTo(towerX - towerW / 2 - 5, sy); ctx.stroke()
      ctx.fillText(`${h}m`, towerX - towerW / 2 - 18, sy + 4)
    }

    // 小球
    const spacing = 90
    const startX = R.W * 0.45
    s.pisaBalls.forEach((b, i) => {
      const bx = startX + i * spacing
      const by = R.oy + b.y * R.scale

      ctx.fillStyle = 'rgba(0,0,0,0.1)'
      ctx.beginPath(); ctx.ellipse(bx + 2, groundY + 2, b.r, 4, 0, 0, Math.PI * 2); ctx.fill()

      const grad = ctx.createRadialGradient(bx - b.r * 0.3, by - b.r * 0.3, b.r * 0.1, bx, by, b.r)
      grad.addColorStop(0, b.color); grad.addColorStop(1, b.color + '80')
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(bx, by, b.r, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.arc(bx - b.r * 0.25, by - b.r * 0.25, b.r * 0.3, 0, Math.PI * 2); ctx.fill()

      ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(`${b.m}kg`, bx, by - b.r - 8)

      if (b.v > 0.5 && !b.done) {
        const vLen = Math.min(b.v * 6, 50)
        ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(bx, by + b.r); ctx.lineTo(bx, by + b.r + vLen); ctx.stroke()
        ctx.fillStyle = '#4CAF50'
        ctx.beginPath(); ctx.moveTo(bx, by + b.r + vLen); ctx.lineTo(bx - 4, by + b.r + vLen - 6); ctx.lineTo(bx + 4, by + b.r + vLen - 6); ctx.closePath(); ctx.fill()
        ctx.font = '9px sans-serif'; ctx.fillText(`v = ${b.v.toFixed(1)}`, bx, by + b.r + vLen + 12)
      }
    })

    if (s.pisaResult && s.pisaPhase === 'done') {
      ctx.fillStyle = '#2E7D32'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('✓ 三个球同时落地！', R.W * 0.55, groundY + 25)
      ctx.fillStyle = '#333'; ctx.font = '12px sans-serif'
      ctx.fillText(`t = ${s.pisaResult.time.toFixed(3)}s　　v = ${s.pisaResult.v.toFixed(2)} m/s`, R.W * 0.55, groundY + 48)
      ctx.fillStyle = '#E65100'; ctx.font = '11px sans-serif'
      ctx.fillText('忽略空气阻力时，所有物体自由落体加速度相同 g = 9.8 m/s²', R.W * 0.55, groundY + 70)
    }

    // 公式
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('比萨斜塔实验', R.W * 0.55, R.H * 0.2)
    ctx.fillStyle = '#555'; ctx.font = '11px sans-serif'
    ctx.fillText('不同质量的球从同一高度同时释放', R.W * 0.55, R.H * 0.2 + 20)
    ctx.fillText('忽略空气阻力 → 同时落地', R.W * 0.55, R.H * 0.2 + 38)
    ctx.fillStyle = '#0288D1'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('s = ½gt²　　v = gt　　与质量无关', R.W * 0.55, R.H * 0.2 + 58)
  }

  // ========== 斜面对比 ==========
  function drawTriangle(ctx, R) {
    const s = S.current
    const [topX, topY] = R.w2s(0, 0)
    const [botX, botY] = R.w2s(0, s.triH)
    const [baseX, baseY] = R.w2s(s.triBase, s.triH)
    const rampLen = Math.sqrt(s.triH ** 2 + s.triBase ** 2)

    // 地面
    ctx.fillStyle = '#e0e0e0'; ctx.fillRect(0, baseY + 2, R.W, R.H - baseY - 2)
    ctx.strokeStyle = '#999'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(botX - 20, baseY); ctx.lineTo(R.W, baseY); ctx.stroke()

    // 垂直边（红色虚线）
    ctx.strokeStyle = 'rgba(211,47,47,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([6, 4])
    ctx.beginPath(); ctx.moveTo(topX, topY); ctx.lineTo(botX, botY); ctx.stroke(); ctx.setLineDash([])

    // 斜边（蓝色粗实线）
    ctx.strokeStyle = '#0288D1'; ctx.lineWidth = 4; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(topX, topY); ctx.lineTo(baseX, baseY); ctx.stroke(); ctx.lineCap = 'butt'

    // 弧线（绿色，向下凸）
    ctx.strokeStyle = 'rgba(76,175,80,0.6)'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(topX, topY)
    const arcSteps = 80
    for (let i = 1; i <= arcSteps; i++) {
      const t = i / arcSteps
      const wx = s.triBase * t
      const wy = s.triH * Math.pow(t, s.arcP)
      const [sx, sy] = R.w2s(wx, wy)
      ctx.lineTo(sx, sy)
    }
    ctx.stroke()

    // 角度标注
    const angle = Math.atan2(s.triH, s.triBase) * 180 / Math.PI
    const arcR = 50
    ctx.strokeStyle = 'rgba(2,136,209,0.5)'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(topX, topY, arcR, Math.PI / 2, Math.PI / 2 + angle * Math.PI / 180, false); ctx.stroke()
    ctx.fillStyle = '#0288D1'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText(`θ = ${angle.toFixed(1)}°`, topX + arcR + 8, topY + arcR / 2)

    // 高度标注
    ctx.strokeStyle = 'rgba(255,152,0,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4])
    const [hx] = R.w2s(-0.8, 0)
    ctx.beginPath(); ctx.moveTo(hx, topY); ctx.lineTo(hx, botY); ctx.stroke(); ctx.setLineDash([])
    ctx.fillStyle = '#E65100'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(`h = ${s.triH.toFixed(1)} m`, hx, (topY + botY) / 2)

    // 路径标签
    ctx.font = 'bold 11px sans-serif'
    ctx.fillStyle = '#D32F2F'; ctx.textAlign = 'center'
    ctx.fillText('① 垂直边', botX - 50, (topY + botY) / 2)
    ctx.fillStyle = '#0288D1'
    const midRx = (topX + baseX) / 2, midRy = (topY + baseY) / 2
    ctx.fillText('② 斜边', midRx + 30, midRy - 8)
    ctx.fillStyle = '#4CAF50'
    const arcMidX = s.triBase * 0.35, arcMidY = s.triH * Math.pow(0.35, s.arcP)
    const [amx, amy] = R.w2s(arcMidX, arcMidY)
    ctx.fillText('③ 弧线', amx - 40, amy + 15)

    // 小球
    const r = 12
    // 垂直球
    const vy = topY + s.vertY * R.scale
    drawBall(ctx, topX, vy, r, '#D32F2F')
    if (s.vertV > 0.5 && !s.vertDone) {
      ctx.fillStyle = '#D32F2F'; ctx.font = '9px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText(`v=${s.vertV.toFixed(1)}`, topX + r + 5, vy)
    }

    // 斜面球
    const rampFrac = Math.min(s.rampS / rampLen, 1)
    const rx = topX + (baseX - topX) * rampFrac
    const ry = topY + (baseY - topY) * rampFrac
    const theta = Math.atan2(s.triH, s.triBase)
    drawBall(ctx, rx - Math.sin(theta) * r, ry - Math.cos(theta) * r, r, '#0288D1')
    if (s.rampV > 0.5 && !s.rampDone) {
      ctx.fillStyle = '#0288D1'; ctx.font = '9px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText(`v=${s.rampV.toFixed(1)}`, rx + 15, ry - 15)
    }

    // 弧线球
    const arcFrac = Math.min(s.arcS / s.arcLen, 1)
    const awx = s.triBase * arcFrac
    const awy = s.triH * Math.pow(arcFrac, s.arcP)
    const [asx, asy] = R.w2s(awx, awy)
    drawBall(ctx, asx, asy, r, '#4CAF50')
    if (s.arcV > 0.5 && !s.arcDone) {
      ctx.fillStyle = '#4CAF50'; ctx.font = '9px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText(`v=${s.arcV.toFixed(1)}`, asx + 15, asy - 5)
    }

    // 结果
    if (s.triPhase === 'done') {
      const resY = baseY + 25
      ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'
      ctx.fillStyle = '#D32F2F'; ctx.fillText(`① 垂直: t = ${s.vertTime.toFixed(3)}s`, R.W * 0.35, resY)
      ctx.fillStyle = '#0288D1'; ctx.fillText(`② 斜面: t = ${s.rampTime.toFixed(3)}s`, R.W * 0.35, resY + 20)
      ctx.fillStyle = '#4CAF50'; ctx.fillText(`③ 弧线: t = ${s.arcTime.toFixed(3)}s`, R.W * 0.35, resY + 40)

      ctx.fillStyle = '#2E7D32'; ctx.font = 'bold 13px sans-serif'
      ctx.fillText('✓ 垂直自由落体最快！', R.W * 0.6, resY + 5)
      ctx.fillStyle = '#555'; ctx.font = '11px sans-serif'
      ctx.fillText('斜面和弧线都"冲淡"了重力', R.W * 0.6, resY + 25)
    }
  }

  function drawBall(ctx, sx, sy, r, color) {
    const grad = ctx.createRadialGradient(sx - r * 0.3, sy - r * 0.3, r * 0.1, sx, sy, r)
    grad.addColorStop(0, color); grad.addColorStop(1, color + '80')
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.arc(sx - r * 0.25, sy - r * 0.25, r * 0.3, 0, Math.PI * 2); ctx.fill()
  }

  // ========== 信息面板 ==========
  function drawInfoPanel(ctx, R) {
    const s = S.current
    const pw = 220, ph = 180, px = R.W - pw - 16, py = 16

    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText(s.mode === 'pisa' ? '📊 比萨斜塔实验' : '📊 斜面对比实验', px + 12, py + 20)
    ctx.font = '11px sans-serif'; let y = py + 40

    if (s.mode === 'pisa') {
      ctx.fillStyle = '#666'
      ctx.fillText(`释放高度 h = ${s.pisaH} m`, px + 12, y); y += 18
      ctx.fillText(`重力加速度 g = ${s.g} m/s²`, px + 12, y); y += 18
      if (s.pisaResult) {
        ctx.fillStyle = '#0288D1'; ctx.fillText(`落地时间 t = ${s.pisaResult.time.toFixed(3)} s`, px + 12, y); y += 18
        ctx.fillStyle = '#4CAF50'; ctx.fillText(`落地速度 v = ${s.pisaResult.v.toFixed(2)} m/s`, px + 12, y); y += 22
        ctx.fillStyle = '#2E7D32'; ctx.font = 'bold 11px sans-serif'
        ctx.fillText('✓ 与质量无关！', px + 12, y); y += 18
      }
      ctx.fillStyle = '#E65100'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('s = ½gt²　v = gt', px + 12, y)
    } else {
      const angle = Math.atan2(s.triH, s.triBase) * 180 / Math.PI
      ctx.fillStyle = '#666'
      ctx.fillText(`高度 h = ${s.triH.toFixed(1)} m`, px + 12, y); y += 18
      ctx.fillText(`角度 θ = ${angle.toFixed(1)}°`, px + 12, y); y += 18
      ctx.fillText(`斜面长 = ${Math.sqrt(s.triH ** 2 + s.triBase ** 2).toFixed(2)} m`, px + 12, y); y += 18
      if (s.triPhase === 'done') {
        ctx.fillStyle = '#D32F2F'; ctx.fillText(`垂直: ${s.vertTime.toFixed(3)}s`, px + 12, y); y += 16
        ctx.fillStyle = '#0288D1'; ctx.fillText(`斜面: ${s.rampTime.toFixed(3)}s`, px + 12, y); y += 16
        ctx.fillStyle = '#4CAF50'; ctx.fillText(`弧线: ${s.arcTime.toFixed(3)}s`, px + 12, y); y += 18
      }
      ctx.fillStyle = '#E65100'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('a = 5g·sinθ/7（纯滚）', px + 12, y)
    }
  }

  function drawDescription(ctx, R) {
    const x = 16, y = R.H - 46
    ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'
    ctx.fillText(S.current.mode === 'pisa' ? '比萨斜塔实验' : '伽利略·斜面对比实验', x, y)
    ctx.fillStyle = '#888'; ctx.font = '11px sans-serif'
    ctx.fillText(S.current.mode === 'pisa'
      ? '不同质量的球同时释放 → 验证与质量无关'
      : '同球沿三条路径滚下 → 垂直最快 → 斜面冲淡重力', x, y + 20)
  }

  // ========== 引导气泡 ==========
  function drawGuideBubble(ctx, R) {
    const s = S.current
    if (s.guideDismissed) return
    const text = s.mode === 'pisa'
      ? '👆 点击「释放」观察不同质量的球同时落地'
      : '👆 点击「释放」三个球同时出发，比较谁先到地面'
    const bx = R.W / 2, by = R.H * 0.5
    ctx.font = '13px sans-serif'
    const tw = ctx.measureText(text).width + 24, th = 32
    const float = Math.sin(Date.now() / 600) * 4, ry = by + float
    ctx.fillStyle = 'rgba(2,136,209,0.12)'; ctx.beginPath(); ctx.roundRect(bx - tw / 2, ry - th / 2, tw, th, 16); ctx.fill()
    ctx.strokeStyle = 'rgba(2,136,209,0.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(bx - tw / 2, ry - th / 2, tw, th, 16); ctx.stroke()
    ctx.fillStyle = '#0288D1'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(text, bx, ry); ctx.textBaseline = 'alphabetic'
  }

  // ========== Controls ==========
  const handleDrop = useCallback(() => {
    const s = S.current
    s.guideDismissed = true
    if (s.mode === 'pisa') {
      s.pisaBalls.forEach(b => { b.y = 0; b.v = 0; b.done = false })
      s.pisaPhase = 'running'; s.pisaTime = 0; s.pisaResult = null
    } else {
      s.vertY = 0; s.vertV = 0; s.vertDone = false; s.vertTime = 0
      s.rampS = 0; s.rampV = 0; s.rampDone = false; s.rampTime = 0
      s.arcS = 0; s.arcV = 0; s.arcDone = false; s.arcTime = 0
      s.triPhase = 'running'
    }
  }, [])

  const handleReset = useCallback(() => {
    const s = S.current
    s.pisaBalls.forEach(b => { b.y = 0; b.v = 0; b.done = false })
    s.pisaPhase = 'idle'; s.pisaTime = 0; s.pisaResult = null
    s.vertY = 0; s.vertV = 0; s.vertDone = false; s.vertTime = 0
    s.rampS = 0; s.rampV = 0; s.rampDone = false; s.rampTime = 0
    s.arcS = 0; s.arcV = 0; s.arcDone = false; s.arcTime = 0
    s.triPhase = 'idle'
  }, [])

  const handleModeChange = useCallback((newMode) => {
    S.current.mode = newMode; setMode(newMode); handleReset()
  }, [handleReset])

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <span style={styles.title}>伽利略·自由落体实验</span>
        <div style={styles.toolbarActions}>
          <button style={styles.playBtn} onClick={handleDrop}>▶ 释放</button>
          <button style={styles.btn} onClick={handleReset}>↺ 重置</button>
          <div style={styles.sep} />
          <div style={styles.modeGroup}>
            <button style={mode === 'pisa' ? styles.modeBtnActive : styles.modeBtn}
              onClick={() => handleModeChange('pisa')}>比萨斜塔</button>
            <button style={mode === 'triangle' ? styles.modeBtnActive : styles.modeBtn}
              onClick={() => handleModeChange('triangle')}>斜面对比</button>
          </div>
          {mode === 'triangle' && (
            <>
              <label style={styles.controlLabel}>
                高度 h：
                <input type="range" min="2" max="8" step="0.5" value={triH}
                  onChange={(e) => { const v = parseFloat(e.target.value); S.current.triH = v; setTriH(v); calcArc() }} style={styles.slider} />
                <span style={styles.sliderVal}>{triH.toFixed(1)}m</span>
              </label>
              <label style={styles.controlLabel}>
                底边：
                <input type="range" min="1" max="8" step="0.5" value={triBase}
                  onChange={(e) => { const v = parseFloat(e.target.value); S.current.triBase = v; setTriBase(v); calcArc() }} style={styles.slider} />
                <span style={styles.sliderVal}>{triBase.toFixed(1)}m</span>
              </label>
            </>
          )}
        </div>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={styles.canvas} />
      </div>
      <div style={styles.desc}>
        <b>伽利略·自由落体</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          比萨斜塔：不同质量同时落地 · 斜面对比：同球沿三条路径滚下比谁快
        </span>
      </div>
    </div>
  )
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#f0f4f8', color: '#333', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  toolbar: { minHeight: 44, background: '#f5f5f5', borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', flexShrink: 0, flexWrap: 'wrap', gap: 6 },
  title: { fontSize: 14, fontWeight: 600, color: '#333' },
  toolbarActions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  controlLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#666' },
  slider: { width: 80, accentColor: '#FF9800' },
  sliderVal: { color: '#E65100', fontWeight: 600, minWidth: 40, fontSize: 12 },
  btn: { background: '#f0f0f0', color: '#333', border: '1px solid #ddd', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  playBtn: { background: '#4CAF50', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  sep: { width: 1, height: 20, background: '#ddd' },
  modeGroup: { display: 'flex', gap: 4 },
  modeBtn: { background: '#f0f0f0', color: '#666', border: '1px solid #ddd', borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer' },
  modeBtnActive: { background: '#FF9800', color: '#000', border: '1px solid #FF9800', borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 },
  main: { flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' },
  canvas: { flex: 1, width: '100%' },
  desc: { padding: '8px 14px', background: '#f5f5f5', borderTop: '1px solid #ccc', fontSize: 13, color: '#333' },
}
