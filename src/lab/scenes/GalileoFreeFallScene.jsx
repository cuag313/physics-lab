import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * GalileoFreeFallScene — 伽利略自由落体实验
 *
 * 三大核心：
 * 1. 自由落体：s = ½gt²，v = gt
 * 2. 轻重物体同时落地（忽略空气阻力）
 * 3. 斜面实验：冲淡重力，便于测量
 *
 * 交互：
 * - 释放不同质量物体，验证同时落地
 * - 调节斜面角度，观察运动规律
 * - 实时 s-t 图像，验证 s∝t²
 */
export default function GalileoFreeFallScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    mode: 'freefall',      // freefall | inclined

    // 自由落体
    balls: [
      { m: 1.0, y: 0, v: 0, dropped: false, color: '#4FC3F7', label: '1kg' },
      { m: 2.0, y: 0, v: 0, dropped: false, color: '#FF9800', label: '2kg' },
      { m: 5.0, y: 0, v: 0, dropped: false, color: '#F44336', label: '5kg' },
    ],
    dropY: 0,             // 释放高度 m
    groundY: 0,
    fallTime: 0,
    falling: false,

    // 斜面
    rampAngle: 30,
    rampBall: { x: 0, v: 0, a: 0, rolling: false },
    rampLen: 4.0,
    rampTime: 0,

    // 数据记录
    stData: [],            // [{t, s}]
    maxData: 300,

    g: 9.8,
    time: 0,
  })

  const [mode, setMode] = useState('freefall')
  const [angle, setAngle] = useState(30)
  const [, forceUpdate] = useState(0)
  const [fallResult, setFallResult] = useState(null)

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
      W: 0, H: 0, scale: 80, ox: 0, oy: 0,
      resize() {
        const rect = canvas.getBoundingClientRect()
        canvas.width = rect.width * devicePixelRatio
        canvas.height = rect.height * devicePixelRatio
        this.ctx.scale(devicePixelRatio, devicePixelRatio)
        this.W = rect.width; this.H = rect.height
        this.ox = this.W * 0.3; this.oy = this.H * 0.15
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
      let allDone = true

      for (const ball of s.balls) {
        if (!ball.dropped) continue
        // s = ½gt²
        const newY = 0.5 * s.g * s.fallTime * s.fallTime
        const newV = s.g * s.fallTime

        ball.y = newY
        ball.v = newV

        if (newY < s.dropY) {
          allDone = false
        } else {
          ball.y = s.dropY
          ball.v = 0
        }
      }

      // 记录s-t数据（取第一个球）
      const s0 = s.balls[0]
      if (s0.dropped && s0.y < s.dropY) {
        s.stData.push({ t: s.fallTime, s: s0.y })
        if (s.stData.length > s.maxData) s.stData.shift()
      }

      if (allDone && s.fallTime > 0.1) {
        s.falling = false
        // 计算落地时间
        const t = Math.sqrt(2 * s.dropY / s.g)
        setFallResult({
          time: t,
          v: s.g * t,
          allSame: true,
        })
      }

      forceUpdate(n => n + 1)
    }

    if (s.mode === 'inclined' && s.rampBall.rolling) {
      s.rampTime += dt
      const a = s.g * Math.sin(s.rampAngle * Math.PI / 180) * 0.67
      s.rampBall.a = a
      s.rampBall.v += a * dt
      s.rampBall.x += s.rampBall.v * dt

      if (s.rampBall.x >= s.rampLen) {
        s.rampBall.x = s.rampLen
        s.rampBall.rolling = false
      }

      s.stData.push({ t: s.rampTime, s: s.rampBall.x })
      if (s.stData.length > s.maxData) s.stData.shift()

      forceUpdate(n => n + 1)
    }
  }

  // ========== Render ==========
  function renderFrame(R) {
    const ctx = R.ctx
    R.clear()
    drawBackground(ctx, R)

    if (S.current.mode === 'freefall') drawFreeFall(ctx, R)
    else drawInclined(ctx, R)

    drawSTGraph(ctx, R)
    drawInfoPanel(ctx, R)
    drawDescription(ctx, R)
  }

  function drawBackground(ctx, R) {
    const grad = ctx.createLinearGradient(0, 0, 0, R.H)
    grad.addColorStop(0, '#1a1a2e'); grad.addColorStop(1, '#0f3460')
    ctx.fillStyle = grad; ctx.fillRect(0, 0, R.W, R.H)
  }

  // ========== 自由落体 ==========
  function drawFreeFall(ctx, R) {
    const s = S.current
    const groundPx = R.oy + s.dropY * R.scale + 60

    // 地面
    ctx.fillStyle = '#2d3748'
    ctx.fillRect(0, groundPx, R.W, R.H - groundPx)
    ctx.strokeStyle = '#4a5568'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(0, groundPx); ctx.lineTo(R.W, groundPx); ctx.stroke()

    // 刻度尺
    ctx.strokeStyle = 'rgba(139,148,158,0.3)'; ctx.lineWidth = 1
    ctx.fillStyle = '#484f58'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right'
    for (let h = 0; h <= s.dropY + 2; h += 0.5) {
      const sy = R.oy + h * R.scale
      ctx.beginPath(); ctx.moveTo(R.ox - 20, sy); ctx.lineTo(R.ox - 10, sy); ctx.stroke()
      ctx.fillText(`${h.toFixed(1)}m`, R.ox - 24, sy + 4)
    }

    // 释放高度标注
    if (!s.falling) {
      const hy = R.oy + s.dropY * R.scale
      ctx.strokeStyle = 'rgba(255,213,79,0.4)'; ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath(); ctx.moveTo(R.ox - 30, R.oy); ctx.lineTo(R.ox - 30, hy); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#FFD54F'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(`h = ${s.dropY.toFixed(1)}m`, R.ox - 50, (R.oy + hy) / 2)
    }

    // 小球
    const spacing = 80
    s.balls.forEach((ball, i) => {
      const bx = R.ox + 100 + i * spacing
      const by = R.oy + ball.y * R.scale
      const r = 12 + ball.m * 3

      // 阴影
      ctx.fillStyle = 'rgba(0,0,0,0.2)'
      ctx.beginPath(); ctx.ellipse(bx + 2, groundPx + 2, r, 4, 0, 0, Math.PI * 2); ctx.fill()

      // 球
      const grad = ctx.createRadialGradient(bx - r * 0.3, by - r * 0.3, r * 0.1, bx, by, r)
      grad.addColorStop(0, ball.color); grad.addColorStop(1, ball.color.replace(/[0-9A-F]{2}$/i, '80'))
      ctx.fillStyle = grad
      ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill()

      // 高光
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.beginPath(); ctx.arc(bx - r * 0.25, by - r * 0.25, r * 0.3, 0, Math.PI * 2); ctx.fill()

      // 标签
      ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(ball.label, bx, by - r - 8)

      // 速度箭头
      if (ball.v > 0.5 && ball.y < s.dropY) {
        const vLen = Math.min(ball.v * 8, 60)
        ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(bx, by + r); ctx.lineTo(bx, by + r + vLen); ctx.stroke()
        ctx.fillStyle = '#4CAF50'
        ctx.beginPath()
        ctx.moveTo(bx, by + r + vLen)
        ctx.lineTo(bx - 4, by + r + vLen - 6)
        ctx.lineTo(bx + 4, by + r + vLen - 6)
        ctx.closePath(); ctx.fill()
        ctx.font = '9px sans-serif'
        ctx.fillText(`v=${ball.v.toFixed(1)}`, bx, by + r + vLen + 12)
      }
    })

    // 落地结果
    if (fallResult && !s.falling) {
      ctx.fillStyle = '#FFD54F'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(`三个球同时落地！t = ${fallResult.time.toFixed(3)}s`, R.W / 2, groundPx + 30)
      ctx.fillStyle = '#4CAF50'; ctx.font = '11px sans-serif'
      ctx.fillText(`落地速度 v = ${fallResult.v.toFixed(2)}m/s`, R.W / 2, groundPx + 50)
    }
  }

  // ========== 斜面实验 ==========
  function drawInclined(ctx, R) {
    const s = S.current
    const angle = s.rampAngle * Math.PI / 180
    const rampPx = s.rampLen * R.scale

    const [bx, by] = R.w2s(0, 5)
    const tx = bx + rampPx * Math.cos(angle)
    const ty = by - rampPx * Math.sin(angle)

    // 斜面
    ctx.strokeStyle = '#6e7681'; ctx.lineWidth = 6; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.stroke()

    // 角度弧线
    const arcR = 40
    ctx.strokeStyle = 'rgba(79,195,247,0.6)'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(bx, by, arcR, -angle, 0, false); ctx.stroke()
    ctx.fillStyle = '#4FC3F7'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(`${s.rampAngle}°`, bx + arcR + 14, by - 8)

    // 小球位置
    const ballDist = s.rampBall.x * R.scale
    const ballX = bx + ballDist * Math.cos(angle)
    const ballY = by - ballDist * Math.sin(angle)
    const r = 14

    const grad = ctx.createRadialGradient(ballX - r * 0.3, ballY - r * 0.3, r * 0.1, ballX, ballY, r)
    grad.addColorStop(0, '#FF9800'); grad.addColorStop(1, '#E65100')
    ctx.fillStyle = grad
    ctx.beginPath(); ctx.arc(ballX, ballY - r, r, 0, Math.PI * 2); ctx.fill()

    // 距离标注
    if (s.rampBall.x > 0.1) {
      ctx.fillStyle = '#FFD54F'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
      const mx = (bx + ballX) / 2
      const my = (by + ballY) / 2 - 20
      ctx.fillText(`s = ${s.rampBall.x.toFixed(2)}m`, mx, my)

      // v
      ctx.fillStyle = '#4CAF50'
      ctx.fillText(`v = ${s.rampBall.v.toFixed(2)}m/s`, ballX + 20, ballY - r - 15)

      // a
      ctx.fillStyle = '#FF9800'
      ctx.fillText(`a = ${s.rampBall.a.toFixed(2)}m/s²`, ballX + 20, ballY - r)
    }

    // 刻度
    ctx.fillStyle = '#484f58'; ctx.font = '9px sans-serif'
    for (let d = 0; d <= s.rampLen; d += 0.5) {
      const dx = bx + d * R.scale * Math.cos(angle)
      const dy = by - d * R.scale * Math.sin(angle)
      ctx.beginPath(); ctx.arc(dx, dy, 2, 0, Math.PI * 2); ctx.fill()
      if (d % 1 === 0) ctx.fillText(`${d}m`, dx + 8, dy - 4)
    }

    // 公式
    ctx.fillStyle = '#FFD54F'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
    const [fx, fy] = R.w2s(0, 1)
    ctx.fillText('斜面"冲淡"重力', fx, fy + 20)
    ctx.fillStyle = '#8b949e'; ctx.font = '11px sans-serif'
    ctx.fillText(`a = g·sinθ = ${s.g.toFixed(1)}×sin${s.rampAngle}° = ${(s.g * Math.sin(angle)).toFixed(2)}m/s²`, fx, fy + 38)
    ctx.fillText('θ越小，a越小，越容易测量', fx, fy + 56)
  }

  // ========== s-t 图像 ==========
  function drawSTGraph(ctx, R) {
    const s = S.current
    const gw = 220, gh = 120, gx = 16, gy = 16

    ctx.fillStyle = 'rgba(22,27,34,0.95)'
    ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, 8); ctx.fill()
    ctx.strokeStyle = '#30363d'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, 8); ctx.stroke()

    ctx.fillStyle = '#c9d1d9'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText(s.mode === 'freefall' ? '📈 s-t² 图像' : '📈 s-t 图像', gx + 10, gy + 16)

    const ox = gx + 35, oy = gy + gh - 15
    const w = gw - 50, h = gh - 30

    ctx.strokeStyle = '#484f58'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(ox, oy - h); ctx.lineTo(ox, oy); ctx.lineTo(ox + w, oy); ctx.stroke()

    const data = s.stData
    if (data.length > 1) {
      const maxX = Math.max(...data.map(p => s.mode === 'freefall' ? p.t * p.t : p.t), 1)
      const maxY = Math.max(...data.map(p => p.s), 1)

      ctx.strokeStyle = '#FF9800'; ctx.lineWidth = 2; ctx.beginPath()
      for (let i = 0; i < data.length; i++) {
        const xVal = s.mode === 'freefall' ? data[i].t * data[i].t : data[i].t
        const px = ox + (xVal / maxX) * w
        const py = oy - (data[i].s / maxY) * h
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
      }
      ctx.stroke()

      // 理论线
      ctx.strokeStyle = 'rgba(79,195,247,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4])
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + w, oy - h); ctx.stroke()
      ctx.setLineDash([])
    }

    ctx.fillStyle = '#484f58'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(s.mode === 'freefall' ? 't²' : 't', ox + w / 2, oy + 12)
    ctx.save(); ctx.translate(gx + 10, oy - h / 2); ctx.rotate(-Math.PI / 2)
    ctx.fillText('s', 0, 0); ctx.restore()
  }

  // ========== 信息面板 ==========
  function drawInfoPanel(ctx, R) {
    const s = S.current
    const pw = 220, ph = 180
    const px = R.W - pw - 16, py = 16

    ctx.fillStyle = 'rgba(22,27,34,0.95)'
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.fill()
    ctx.strokeStyle = '#30363d'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.stroke()

    ctx.fillStyle = '#c9d1d9'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('📊 伽利略自由落体', px + 12, py + 20)

    ctx.font = '11px sans-serif'; let y = py + 40

    if (s.mode === 'freefall') {
      ctx.fillStyle = '#8b949e'
      ctx.fillText(`释放高度 h = ${s.dropY.toFixed(1)} m`, px + 12, y); y += 18
      ctx.fillText(`重力加速度 g = ${s.g.toFixed(1)} m/s²`, px + 12, y); y += 18

      if (fallResult) {
        ctx.fillStyle = '#4FC3F7'
        ctx.fillText(`落地时间 t = ${fallResult.time.toFixed(3)} s`, px + 12, y); y += 18
        ctx.fillStyle = '#4CAF50'
        ctx.fillText(`落地速度 v = ${fallResult.v.toFixed(2)} m/s`, px + 12, y); y += 18
        ctx.fillStyle = '#FFD54F'
        ctx.fillText('✓ 轻重物体同时落地', px + 12, y); y += 22
      } else {
        y += 18
      }

      ctx.fillStyle = '#FFD54F'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('核心公式：', px + 12, y); y += 16
      ctx.fillStyle = '#4FC3F7'; ctx.font = '11px monospace'
      ctx.fillText('s = ½gt²', px + 12, y); y += 16
      ctx.fillText('v = gt', px + 12, y)
    } else {
      const a = s.g * Math.sin(s.rampAngle * Math.PI / 180) * 0.67
      ctx.fillStyle = '#8b949e'
      ctx.fillText(`斜面角度 θ = ${s.rampAngle}°`, px + 12, y); y += 18
      ctx.fillText(`加速度 a = ${a.toFixed(2)} m/s²`, px + 12, y); y += 18
      ctx.fillText(`位移 s = ${s.rampBall.x.toFixed(2)} m`, px + 12, y); y += 18
      ctx.fillText(`速度 v = ${s.rampBall.v.toFixed(2)} m/s`, px + 12, y); y += 22
      ctx.fillStyle = '#FFD54F'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('斜面冲淡重力 → 便于测量', px + 12, y)
    }
  }

  function drawDescription(ctx, R) {
    const h = R.H, x = 16, y = h - 40
    ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    ctx.fillStyle = '#c9d1d9'; ctx.font = 'bold 14px sans-serif'
    ctx.fillText('伽利略·自由落体与斜面实验', x, y)
    ctx.fillStyle = '#4FC3F7'; ctx.font = 'bold 13px serif'
    ctx.fillText('s = ½gt²', x + 230, y)
    ctx.fillStyle = '#8b949e'; ctx.font = '11px sans-serif'
    ctx.fillText('点击"释放"观察轻重物体同时落地 · 切换斜面模式观察运动规律', x + 330, y)
  }

  // ========== Controls ==========
  const handleDrop = useCallback(() => {
    const s = S.current
    if (s.mode === 'freefall') {
      s.balls.forEach(b => { b.dropped = true; b.y = 0; b.v = 0 })
      s.falling = true
      s.fallTime = 0
      s.stData = []
      setFallResult(null)
    } else {
      s.rampBall = { x: 0, v: 0, a: 0, rolling: true }
      s.rampTime = 0
      s.stData = []
    }
  }, [])

  const handleReset = useCallback(() => {
    const s = S.current
    s.balls.forEach(b => { b.y = 0; b.v = 0; b.dropped = false })
    s.falling = false; s.fallTime = 0; s.stData = []
    s.rampBall = { x: 0, v: 0, a: 0, rolling: false }
    s.rampTime = 0
    setFallResult(null)
  }, [])

  const handleHeightChange = useCallback((val) => {
    S.current.dropY = val
    forceUpdate(n => n + 1)
  }, [])

  const handleAngleChange = useCallback((val) => {
    S.current.rampAngle = val
    setAngle(val)
  }, [])

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
              onClick={() => { setMode('freefall'); S.current.mode = 'freefall'; handleReset() }}>
              自由落体
            </button>
            <button style={mode === 'inclined' ? styles.modeBtnActive : styles.modeBtn}
              onClick={() => { setMode('inclined'); S.current.mode = 'inclined'; handleReset() }}>
              斜面实验
            </button>
          </div>
          {mode === 'freefall' ? (
            <label style={styles.controlLabel}>
              释放高度：
              <input type="range" min="1" max="10" step="0.5"
                value={S.current.dropY}
                onChange={(e) => handleHeightChange(parseFloat(e.target.value))}
                style={styles.slider} />
              <span style={styles.sliderVal}>{S.current.dropY.toFixed(1)}m</span>
            </label>
          ) : (
            <label style={styles.controlLabel}>
              斜面角度：
              <input type="range" min="5" max="60" step="5"
                value={angle}
                onChange={(e) => handleAngleChange(parseInt(e.target.value))}
                style={styles.slider} />
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
          释放不同质量的物体 → 验证同时落地 → 切换斜面模式 → 观察"冲淡重力"的效果
        </span>
      </div>
    </div>
  )
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#1a1a2e', color: '#e0e0e0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  toolbar: { minHeight: 44, background: '#16213e', borderBottom: '1px solid #30363d', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', flexShrink: 0, flexWrap: 'wrap', gap: 6 },
  title: { fontSize: 14, fontWeight: 600, color: '#c9d1d9' },
  toolbarActions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  controlLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8b949e' },
  slider: { width: 80, accentColor: '#FF9800' },
  sliderVal: { color: '#FF9800', fontWeight: 600, minWidth: 40, fontSize: 12 },
  btn: { background: '#30363d', color: '#c9d1d9', border: '1px solid #484f58', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  playBtn: { background: '#4CAF50', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  sep: { width: 1, height: 20, background: '#30363d' },
  modeGroup: { display: 'flex', gap: 4 },
  modeBtn: { background: '#30363d', color: '#8b949e', border: '1px solid #484f58', borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer' },
  modeBtnActive: { background: '#FF9800', color: '#000', border: '1px solid #FF9800', borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 },
  main: { flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' },
  canvas: { flex: 1, width: '100%' },
  desc: { padding: '8px 14px', background: '#16213e', borderTop: '1px solid #30363d', fontSize: 13, color: '#c9d1d9' },
}
