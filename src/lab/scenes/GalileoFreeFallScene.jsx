import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * GalileoFreeFallScene — 伽利略自由落体实验
 *
 * 1. 自由落体：s = ½gt²，v = gt，轻重物体同时落地
 * 2. 斜面实验：冲淡重力，a = g·sinθ（纯滚 a = 5g·sinθ/7）
 */
export default function GalileoFreeFallScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    mode: 'freefall',
    balls: [
      { m: 1.0, y: 0, v: 0, dropped: false, landed: false, color: '#0288D1', label: '1kg' },
      { m: 2.0, y: 0, v: 0, dropped: false, landed: false, color: '#FF9800', label: '2kg' },
      { m: 5.0, y: 0, v: 0, dropped: false, landed: false, color: '#D32F2F', label: '5kg' },
    ],
    dropY: 5,
    fallTime: 0,
    falling: false,
    fallResult: null,

    rampAngle: 30,
    rampBall: { x: 0, v: 0, a: 0, rolling: false },
    rampLen: 4.0,
    rampTime: 0,
    rampFinished: false,

    stData: [],
    maxData: 300,
    g: 9.8,
    time: 0,
    guideDismissed: false,
  })

  const [mode, setMode] = useState('freefall')
  const [angle, setAngle] = useState(30)
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const R = createRenderer(canvas)
    canvasRef.current._R = R
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
        this.ox = this.W * 0.3; this.oy = this.H * 0.12
      },
      w2s(wx, wy) { return [this.ox + wx * this.scale, this.oy + wy * this.scale] },
      clear() { this.ctx.clearRect(0, 0, this.W, this.H) },
    }
    R.resize()
    return R
  }

  // ========== Physics ==========
  function updatePhysics() {
    const s = S.current
    const dt = 1 / 60
    s.time += dt

    if (s.mode === 'freefall' && s.falling) {
      s.fallTime += dt
      let allLanded = true
      for (const ball of s.balls) {
        if (!ball.dropped || ball.landed) continue
        ball.y = 0.5 * s.g * s.fallTime * s.fallTime
        ball.v = s.g * s.fallTime
        if (ball.y >= s.dropY) {
          ball.y = s.dropY; ball.v = s.g * Math.sqrt(2 * s.dropY / s.g); ball.landed = true
        } else { allLanded = false }
      }
      const s0 = s.balls[0]
      if (s0.dropped && !s0.landed) {
        s.stData.push({ t: s.fallTime, s: s0.y })
        if (s.stData.length > s.maxData) s.stData.shift()
      }
      if (allLanded && s.fallTime > 0.1) {
        s.falling = false
        const t = Math.sqrt(2 * s.dropY / s.g)
        s.fallResult = { time: t, v: s.g * t }
      }
      forceUpdate(n => n + 1)
    }

    if (s.mode === 'inclined' && s.rampBall.rolling) {
      s.rampTime += dt
      // 纯滚动：a = 5g·sinθ/7（转动惯量 I=2/5·m·r²）
      const a = (5 / 7) * s.g * Math.sin(s.rampAngle * Math.PI / 180)
      s.rampBall.a = a
      s.rampBall.v += a * dt
      s.rampBall.x += s.rampBall.v * dt
      if (s.rampBall.x >= s.rampLen) {
        s.rampBall.x = s.rampLen; s.rampBall.rolling = false; s.rampFinished = true
      }
      s.stData.push({ t: s.rampTime, s: s.rampBall.x })
      if (s.stData.length > s.maxData) s.stData.shift()
      forceUpdate(n => n + 1)
    }
  }

  // ========== Render ==========
  function renderFrame(R) {
    const ctx = R.ctx; R.clear()
    drawBackground(ctx, R)
    if (S.current.mode === 'freefall') drawFreeFall(ctx, R)
    else drawInclined(ctx, R)
    drawSTGraph(ctx, R)
    drawInfoPanel(ctx, R)
    drawDescription(ctx, R)
    drawGuideBubble(ctx, R)
  }

  function drawBackground(ctx, R) {
    ctx.fillStyle = '#f0f4f8'; ctx.fillRect(0, 0, R.W, R.H)
  }

  // ========== 自由落体 ==========
  function drawFreeFall(ctx, R) {
    const s = S.current
    const groundPx = R.oy + s.dropY * R.scale + 60

    // 地面
    ctx.fillStyle = '#e0e0e0'; ctx.fillRect(0, groundPx, R.W, R.H - groundPx)
    ctx.strokeStyle = '#999'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(0, groundPx); ctx.lineTo(R.W, groundPx); ctx.stroke()

    // 刻度尺
    ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 1
    ctx.fillStyle = '#888'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right'
    for (let h = 0; h <= s.dropY + 1; h += 0.5) {
      const sy = R.oy + h * R.scale
      ctx.beginPath(); ctx.moveTo(R.ox - 20, sy); ctx.lineTo(R.ox - 10, sy); ctx.stroke()
      if (h % 1 === 0) ctx.fillText(`${h}m`, R.ox - 24, sy + 4)
    }

    // 释放高度标注
    if (!s.falling) {
      const hy = R.oy + s.dropY * R.scale
      ctx.strokeStyle = 'rgba(255,152,0,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4])
      ctx.beginPath(); ctx.moveTo(R.ox - 30, R.oy); ctx.lineTo(R.ox - 30, hy); ctx.stroke(); ctx.setLineDash([])
      ctx.fillStyle = '#E65100'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(`h = ${s.dropY.toFixed(1)} m`, R.ox - 55, (R.oy + hy) / 2)
    }

    // 小球
    const spacing = 80
    s.balls.forEach((ball, i) => {
      const bx = R.ox + 100 + i * spacing
      const by = R.oy + ball.y * R.scale
      const r = 12 + ball.m * 3

      ctx.fillStyle = 'rgba(0,0,0,0.1)'
      ctx.beginPath(); ctx.ellipse(bx + 2, groundPx + 2, r, 4, 0, 0, Math.PI * 2); ctx.fill()

      const grad = ctx.createRadialGradient(bx - r * 0.3, by - r * 0.3, r * 0.1, bx, by, r)
      grad.addColorStop(0, ball.color); grad.addColorStop(1, ball.color + '80')
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.arc(bx - r * 0.25, by - r * 0.25, r * 0.3, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(ball.label, bx, by - r - 8)

      // 速度箭头
      if (ball.v > 0.5 && ball.y < s.dropY) {
        const vLen = Math.min(ball.v * 8, 60)
        ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(bx, by + r); ctx.lineTo(bx, by + r + vLen); ctx.stroke()
        ctx.fillStyle = '#4CAF50'
        ctx.beginPath(); ctx.moveTo(bx, by + r + vLen); ctx.lineTo(bx - 4, by + r + vLen - 6); ctx.lineTo(bx + 4, by + r + vLen - 6); ctx.closePath(); ctx.fill()
        ctx.font = '9px sans-serif'; ctx.fillText(`v = ${ball.v.toFixed(1)} m/s`, bx, by + r + vLen + 12)
      }
    })

    // 落地结果
    if (s.fallResult && !s.falling) {
      ctx.fillStyle = '#2E7D32'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('✓ 三个球同时落地！', R.W / 2, groundPx + 30)
      ctx.fillStyle = '#333'; ctx.font = '12px sans-serif'
      ctx.fillText(`t = ${s.fallResult.time.toFixed(3)}s　　v = ${s.fallResult.v.toFixed(2)} m/s`, R.W / 2, groundPx + 52)
    }
  }

  // ========== 斜面实验 ==========
  function drawInclined(ctx, R) {
    const s = S.current
    const angle = s.rampAngle * Math.PI / 180
    const rampPx = s.rampLen * R.scale

    const baseX = R.W * 0.15, baseY = R.H * 0.75
    const topX = baseX + rampPx * Math.cos(angle)
    const topY = baseY - rampPx * Math.sin(angle)

    // 斜面
    ctx.strokeStyle = '#78909C'; ctx.lineWidth = 8; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(baseX, baseY); ctx.lineTo(topX, topY); ctx.stroke(); ctx.lineCap = 'butt'

    // 地面
    ctx.fillStyle = '#e0e0e0'; ctx.fillRect(baseX - 20, baseY, R.W, R.H - baseY)
    ctx.strokeStyle = '#999'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(baseX - 20, baseY); ctx.lineTo(R.W, baseY); ctx.stroke()

    // 角度弧线
    const arcR = 50
    ctx.strokeStyle = 'rgba(2,136,209,0.5)'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(baseX, baseY, arcR, -angle, 0, false); ctx.stroke()
    ctx.fillStyle = '#0288D1'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(`θ = ${s.rampAngle}°`, baseX + arcR + 20, baseY - 10)

    // 刻度
    ctx.fillStyle = '#888'; ctx.font = '9px sans-serif'
    for (let d = 0; d <= s.rampLen; d += 0.5) {
      const dx = baseX + d * R.scale * Math.cos(angle)
      const dy = baseY - d * R.scale * Math.sin(angle)
      ctx.beginPath(); ctx.arc(dx, dy, 2, 0, Math.PI * 2); ctx.fill()
      if (d % 1 === 0) ctx.fillText(`${d}m`, dx + 8, dy - 6)
    }

    // 小球（沿斜面法线偏移半径）
    const ballR = 14
    const ballDist = s.rampBall.x * R.scale
    const ballX = baseX + ballDist * Math.cos(angle)
    const ballY = baseY - ballDist * Math.sin(angle)
    // 法线方向偏移（垂直于斜面向上）
    const nx = -Math.sin(angle), ny = -Math.cos(angle)
    const cx = ballX + nx * ballR, cy = ballY + ny * ballR

    const grad = ctx.createRadialGradient(cx - ballR * 0.3, cy - ballR * 0.3, ballR * 0.1, cx, cy, ballR)
    grad.addColorStop(0, '#FF9800'); grad.addColorStop(1, '#E65100')
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(cx, cy, ballR, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.arc(cx - ballR * 0.25, cy - ballR * 0.25, ballR * 0.3, 0, Math.PI * 2); ctx.fill()

    // 数据标注
    if (s.rampBall.x > 0.05) {
      const midX = (baseX + ballX) / 2, midY = (baseY + ballY) / 2
      ctx.fillStyle = '#E65100'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(`s = ${s.rampBall.x.toFixed(2)} m`, midX, midY - 20)
      ctx.fillStyle = '#4CAF50'; ctx.font = '11px sans-serif'
      ctx.fillText(`v = ${s.rampBall.v.toFixed(2)} m/s`, cx + 25, cy - ballR - 5)
      ctx.fillStyle = '#FF9800'
      ctx.fillText(`a = ${s.rampBall.a.toFixed(2)} m/s²`, cx + 25, cy - ballR + 12)
    }

    // 公式
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('斜面"冲淡"重力', R.W * 0.55, R.H * 0.2)
    ctx.fillStyle = '#555'; ctx.font = '11px sans-serif'
    ctx.fillText(`a = 5g·sinθ/7 ≈ ${(5 / 7 * s.g * Math.sin(angle)).toFixed(2)} m/s²`, R.W * 0.55, R.H * 0.2 + 20)
    ctx.fillText('θ 越小，加速度越小，越容易测量', R.W * 0.55, R.H * 0.2 + 38)
    ctx.fillText('球从静止释放，s ∝ t²', R.W * 0.55, R.H * 0.2 + 56)
  }

  // ========== s-t 图像 ==========
  function drawSTGraph(ctx, R) {
    const s = S.current
    const gw = 230, gh = 130, gx = 16, gy = 16

    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, 8); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText(s.mode === 'freefall' ? '📈 s-t² 图像（应为直线）' : '📈 s-t 图像', gx + 10, gy + 16)

    const ox = gx + 35, oy = gy + gh - 18, w = gw - 50, h = gh - 35
    ctx.strokeStyle = '#bbb'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(ox, oy - h); ctx.lineTo(ox, oy); ctx.lineTo(ox + w, oy); ctx.stroke()

    const data = s.stData
    if (data.length > 1) {
      // 自由落体模式用t²作为x轴
      const xVals = data.map(p => s.mode === 'freefall' ? p.t * p.t : p.t)
      const maxX = Math.max(...xVals, 0.01)
      const maxY = Math.max(...data.map(p => p.s), 0.01)

      // 理论线
      ctx.strokeStyle = 'rgba(2,136,209,0.3)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4])
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + w, oy - h); ctx.stroke(); ctx.setLineDash([])

      ctx.strokeStyle = '#FF9800'; ctx.lineWidth = 2; ctx.beginPath()
      for (let i = 0; i < data.length; i++) {
        const px = ox + (xVals[i] / maxX) * w
        const py = oy - (data[i].s / maxY) * h
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
      }
      ctx.stroke()
    }

    ctx.fillStyle = '#888'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(s.mode === 'freefall' ? 't² (s²)' : 't (s)', ox + w / 2, oy + 14)
    ctx.save(); ctx.translate(gx + 10, oy - h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('s (m)', 0, 0); ctx.restore()
  }

  // ========== 信息面板 ==========
  function drawInfoPanel(ctx, R) {
    const s = S.current
    const pw = 220, ph = 180, px = R.W - pw - 16, py = 16

    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('📊 伽利略自由落体', px + 12, py + 20)
    ctx.font = '11px sans-serif'; let y = py + 40

    if (s.mode === 'freefall') {
      ctx.fillStyle = '#666'
      ctx.fillText(`释放高度 h = ${s.dropY.toFixed(1)} m`, px + 12, y); y += 18
      ctx.fillText(`重力加速度 g = ${s.g.toFixed(1)} m/s²`, px + 12, y); y += 18
      if (s.fallResult) {
        ctx.fillStyle = '#0288D1'; ctx.fillText(`落地时间 t = ${s.fallResult.time.toFixed(3)} s`, px + 12, y); y += 18
        ctx.fillStyle = '#4CAF50'; ctx.fillText(`落地速度 v = ${s.fallResult.v.toFixed(2)} m/s`, px + 12, y); y += 18
        ctx.fillStyle = '#2E7D32'; ctx.font = 'bold 11px sans-serif'
        ctx.fillText('✓ 轻重物体同时落地', px + 12, y); y += 22
      }
      ctx.fillStyle = '#E65100'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('s = ½gt²　　v = gt', px + 12, y)
    } else {
      const a = (5 / 7) * s.g * Math.sin(s.rampAngle * Math.PI / 180)
      ctx.fillStyle = '#666'
      ctx.fillText(`斜面角度 θ = ${s.rampAngle}°`, px + 12, y); y += 18
      ctx.fillText(`加速度 a = ${a.toFixed(2)} m/s²`, px + 12, y); y += 18
      ctx.fillText(`位移 s = ${s.rampBall.x.toFixed(2)} m`, px + 12, y); y += 18
      ctx.fillText(`速度 v = ${s.rampBall.v.toFixed(2)} m/s`, px + 12, y); y += 18
      if (s.rampFinished) {
        ctx.fillStyle = '#2E7D32'; ctx.font = 'bold 11px sans-serif'
        ctx.fillText('✓ 到达底端', px + 12, y); y += 18
      }
      ctx.fillStyle = '#E65100'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('a = 5g·sinθ/7', px + 12, y)
    }
  }

  function drawDescription(ctx, R) {
    const x = 16, y = R.H - 46
    ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'
    ctx.fillText('伽利略·自由落体与斜面实验', x, y)
    ctx.fillStyle = '#0288D1'; ctx.font = 'bold 13px serif'
    ctx.fillText('s = ½gt²', x + 240, y)
    ctx.fillStyle = '#888'; ctx.font = '11px sans-serif'
    ctx.fillText('点击「释放」观察轻重物体同时落地 · 切换斜面模式观察冲淡重力', x, y + 20)
  }

  // ========== 引导气泡 ==========
  function drawGuideBubble(ctx, R) {
    const s = S.current
    if (s.guideDismissed) return
    const text = s.mode === 'freefall'
      ? '👆 点击「释放」观察三个不同质量的球同时落地'
      : '👆 点击「释放」观察小球沿斜面滚下，s ∝ t²'
    const bx = R.W / 2, by = R.H * 0.55
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
    if (s.mode === 'freefall') {
      s.balls.forEach(b => { b.dropped = true; b.y = 0; b.v = 0; b.landed = false })
      s.falling = true; s.fallTime = 0; s.stData = []; s.fallResult = null
    } else {
      s.rampBall = { x: 0, v: 0, a: 0, rolling: true }; s.rampTime = 0; s.stData = []; s.rampFinished = false
    }
  }, [])

  const handleReset = useCallback(() => {
    const s = S.current
    s.balls.forEach(b => { b.y = 0; b.v = 0; b.dropped = false; b.landed = false })
    s.falling = false; s.fallTime = 0; s.stData = []; s.fallResult = null
    s.rampBall = { x: 0, v: 0, a: 0, rolling: false }; s.rampTime = 0; s.rampFinished = false
  }, [])

  const handleModeChange = useCallback((newMode) => {
    S.current.mode = newMode; S.current.stData = []; setMode(newMode); handleReset()
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
            <button style={mode === 'freefall' ? styles.modeBtnActive : styles.modeBtn}
              onClick={() => handleModeChange('freefall')}>自由落体</button>
            <button style={mode === 'inclined' ? styles.modeBtnActive : styles.modeBtn}
              onClick={() => handleModeChange('inclined')}>斜面实验</button>
          </div>
          {mode === 'freefall' ? (
            <label style={styles.controlLabel}>
              释放高度：
              <input type="range" min="1" max="10" step="0.5" value={S.current.dropY}
                onChange={(e) => { S.current.dropY = parseFloat(e.target.value); forceUpdate(n => n + 1) }} style={styles.slider} />
              <span style={styles.sliderVal}>{S.current.dropY.toFixed(1)}m</span>
            </label>
          ) : (
            <label style={styles.controlLabel}>
              斜面角度：
              <input type="range" min="5" max="60" step="5" value={angle}
                onChange={(e) => { const v = parseInt(e.target.value); S.current.rampAngle = v; setAngle(v) }} style={styles.slider} />
              <span style={styles.sliderVal}>{angle}°</span>
            </label>
          )}
        </div>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={styles.canvas} />
      </div>
      <div style={styles.desc}>
        <b>伽利略·自由落体</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          释放不同质量物体验证同时落地 · 切换斜面模式观察 s∝t²
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
