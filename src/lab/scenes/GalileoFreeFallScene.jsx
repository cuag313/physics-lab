import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * GalileoFreeFallScene — 伽利略自由落体实验
 *
 * 经典对比：同高度同时释放
 * - 垂直球：自由落体 a=g，先到地面
 * - 斜面球：沿斜面滚下 a=5g·sinθ/7，后到地面
 * - 证明：斜面"冲淡"重力，a < g
 */
export default function GalileoFreeFallScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    // 直角三角形参数
    triH: 5.0,         // 高（垂直边，米）
    triBase: 4.0,      // 底边（米）
    rampAngle: 0,      // 自动计算

    // 垂直球（自由落体）
    vertY: 0, vertV: 0, vertDone: false, vertTime: 0,

    // 斜面球
    rampS: 0, rampV: 0, rampDone: false, rampTime: 0,

    // 运动状态
    phase: 'idle',     // idle | running | done

    // 弧线球（沿斜面弧线下滑）
    arcS: 0, arcV: 0, arcDone: false, arcTime: 0,

    stData: [], maxData: 300,
    g: 9.8,
    time: 0,
    guideDismissed: false,
  })

  const [triH, setTriH] = useState(5.0)
  const [triBase, setTriBase] = useState(4.0)
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const R = createRenderer(canvas)
    canvasRef.current._R = R
    recalcAngle()
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
        this.ox = this.W * 0.22; this.oy = this.H * 0.1
      },
      w2s(wx, wy) { return [this.ox + wx * this.scale, this.oy + wy * this.scale] },
      clear() { this.ctx.clearRect(0, 0, this.W, this.H) },
    }
    R.resize()
    return R
  }

  function recalcAngle() {
    const s = S.current
    s.rampAngle = Math.atan2(s.triH, s.triBase) * 180 / Math.PI
  }

  // ========== Physics ==========
  function updatePhysics() {
    const s = S.current
    if (s.phase !== 'running') return
    const dt = 1 / 60
    s.time += dt
    let allDone = true

    // 垂直球：s = ½gt²
    if (!s.vertDone) {
      s.vertTime += dt
      s.vertY = 0.5 * s.g * s.vertTime * s.vertTime
      s.vertV = s.g * s.vertTime
      if (s.vertY >= s.triH) { s.vertY = s.triH; s.vertV = s.g * Math.sqrt(2 * s.triH / s.g); s.vertDone = true }
      else allDone = false
    }

    // 斜面球：a = 5g·sinθ/7
    if (!s.rampDone) {
      s.rampTime += dt
      const theta = s.rampAngle * Math.PI / 180
      const a = (5 / 7) * s.g * Math.sin(theta)
      s.rampV += a * dt
      s.rampS += s.rampV * dt
      const rampLen = Math.sqrt(s.triH * s.triH + s.triBase * s.triBase)
      if (s.rampS >= rampLen) { s.rampS = rampLen; s.rampDone = true }
      else allDone = false
    }

    // 弧线球（二次曲线 y = k·x²，从顶点到底角）
    if (!s.arcDone) {
      s.arcTime += dt
      // 弧线比斜面长，加速度投影更小
      const theta = s.rampAngle * Math.PI / 180
      const aArc = (5 / 7) * s.g * Math.sin(theta) * 0.7 // 弧线更缓
      s.arcV += aArc * dt
      s.arcS += s.arcV * dt
      const arcLen = s.triH * 1.2 // 弧线比斜面长约20%
      if (s.arcS >= arcLen) { s.arcS = arcLen; s.arcDone = true }
      else allDone = false
    }

    // 记录数据
    if (!s.vertDone) {
      s.stData.push({ t: s.time, vert: s.vertY, ramp: s.rampS * Math.sin(theta), arc: s.arcS * Math.sin(theta) * 0.8 })
      if (s.stData.length > s.maxData) s.stData.shift()
    }

    if (allDone) s.phase = 'done'
    forceUpdate(n => n + 1)
  }

  // ========== Render ==========
  function renderFrame(R) {
    const ctx = R.ctx; R.clear()
    drawBackground(ctx, R)
    drawTriangle(ctx, R)
    drawArcPath(ctx, R)
    drawBalls(ctx, R)
    drawInfoPanel(ctx, R)
    drawDescription(ctx, R)
    drawGuideBubble(ctx, R)
  }

  function drawBackground(ctx, R) {
    ctx.fillStyle = '#f0f4f8'; ctx.fillRect(0, 0, R.W, R.H)
  }

  function drawTriangle(ctx, R) {
    const s = S.current
    // 三角形顶点：左上角为释放点
    const [topX, topY] = R.w2s(0, 0)                           // 顶点（释放点）
    const [botX, botY] = R.w2s(0, s.triH)                      // 底角（垂直下方）
    const [baseX, baseY] = R.w2s(s.triBase, s.triH)            // 右底角

    // 垂直边（自由落体路径）—— 红色虚线
    ctx.strokeStyle = 'rgba(211,47,47,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([6, 4])
    ctx.beginPath(); ctx.moveTo(topX, topY); ctx.lineTo(botX, botY); ctx.stroke(); ctx.setLineDash([])

    // 斜边（斜面）—— 蓝色实线
    ctx.strokeStyle = '#0288D1'; ctx.lineWidth = 4; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(topX, topY); ctx.lineTo(baseX, baseY); ctx.stroke(); ctx.lineCap = 'butt'

    // 地面（底边）
    ctx.fillStyle = '#e0e0e0'; ctx.fillRect(0, baseY + 2, R.W, R.H - baseY - 2)
    ctx.strokeStyle = '#999'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(botX - 20, baseY); ctx.lineTo(R.W, baseY); ctx.stroke()

    // 角度弧线
    const arcR = 50
    const angle = s.rampAngle * Math.PI / 180
    ctx.strokeStyle = 'rgba(2,136,209,0.5)'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(topX, topY, arcR, Math.PI / 2, Math.PI / 2 + angle, false); ctx.stroke()
    ctx.fillStyle = '#0288D1'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText(`θ = ${s.rampAngle.toFixed(1)}°`, topX + arcR + 8, topY + arcR / 2)

    // 高度标注
    ctx.strokeStyle = 'rgba(255,152,0,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4])
    const [hx, hy] = R.w2s(-0.8, 0)
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx, botY); ctx.stroke(); ctx.setLineDash([])
    ctx.fillStyle = '#E65100'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(`h = ${s.triH.toFixed(1)} m`, hx, (hy + botY) / 2)

    // 底边标注
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'
    ctx.fillText(`${s.triBase.toFixed(1)} m`, (botX + baseX) / 2, baseY + 18)

    // 标签
    ctx.fillStyle = '#D32F2F'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('自由落体', botX - 45, (topY + botY) / 2)
    ctx.fillStyle = '#0288D1'
    const midRx = (topX + baseX) / 2, midRy = (topY + baseY) / 2
    ctx.fillText('斜面滚下', midRx + 10, midRy - 10)
  }

  function drawArcPath(ctx, R) {
    const s = S.current
    const [topX, topY] = R.w2s(0, 0)
    const [baseX, baseY] = R.w2s(s.triBase, s.triH)

    // 弧线路径（二次曲线，从顶点到底角）
    ctx.strokeStyle = 'rgba(76,175,80,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([8, 4])
    ctx.beginPath(); ctx.moveTo(topX, topY)
    const steps = 50
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      // 二次曲线：x线性，y抛物线
      const wx = t * s.triBase
      const wy = t * t * s.triH // 抛物线比直线先慢后快
      const [sx, sy] = R.w2s(wx, wy)
      ctx.lineTo(sx, sy)
    }
    ctx.stroke(); ctx.setLineDash([])

    ctx.fillStyle = '#4CAF50'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('弧线路径', R.w2s(s.triBase * 0.3, s.triH * 0.4)[0], R.w2s(s.triBase * 0.3, s.triH * 0.4)[1] - 10)
  }

  function drawBalls(ctx, R) {
    const s = S.current
    const [topX, topY] = R.w2s(0, 0)
    const [baseX, baseY] = R.w2s(s.triBase, s.triH)
    const rampLen = Math.sqrt(s.triH * s.triH + s.triBase * s.triBase)
    const angle = s.rampAngle * Math.PI / 180
    const r = 12

    // 垂直球（红色）
    const vy = topY + s.vertY * R.scale
    drawBall(ctx, R, topX, vy, r, '#D32F2F', '自由落体')
    if (s.vertV > 0.5 && !s.vertDone) {
      drawSpeedLabel(ctx, topX + r + 8, vy, `v = ${s.vertV.toFixed(1)}`, '#D32F2F')
    }

    // 斜面球（蓝色）
    const rampDist = s.rampS / rampLen
    const rx = topX + (baseX - topX) * rampDist
    const ry = topY + (baseY - topY) * rampDist
    const nx = -Math.sin(angle), ny = -Math.cos(angle)
    drawBall(ctx, R, rx + nx * r, ry + ny * r, r, '#0288D1', '斜面')
    if (s.rampV > 0.5 && !s.rampDone) {
      drawSpeedLabel(ctx, rx + nx * r + 20, ry + ny * r - 5, `v = ${s.rampV.toFixed(1)}`, '#0288D1')
    }

    // 弧线球（绿色）
    if (!s.arcDone || s.phase !== 'idle') {
      const arcLen = s.triH * 1.2
      const arcDist = Math.min(s.arcS / arcLen, 1)
      // 沿弧线插值
      const t = arcDist
      const awx = t * s.triBase
      const awy = t * t * s.triH
      const [asx, asy] = R.w2s(awx, awy)
      drawBall(ctx, R, asx, asy, r, '#4CAF50', '弧线')
      if (s.arcV > 0.5 && !s.arcDone) {
        drawSpeedLabel(ctx, asx + 20, asy - 5, `v = ${s.arcV.toFixed(1)}`, '#4CAF50')
      }
    }

    // 到达结果
    if (s.phase === 'done') {
      const ry = baseY + 30
      ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'
      ctx.fillStyle = '#D32F2F'
      ctx.fillText(`自由落体: t = ${s.vertTime.toFixed(3)}s`, R.W * 0.35, ry)
      ctx.fillStyle = '#0288D1'
      ctx.fillText(`斜面: t = ${s.rampTime.toFixed(3)}s`, R.W * 0.35, ry + 22)
      ctx.fillStyle = '#4CAF50'
      ctx.fillText(`弧线: t = ${s.arcTime.toFixed(3)}s`, R.W * 0.35, ry + 44)
      ctx.fillStyle = '#2E7D32'; ctx.font = 'bold 14px sans-serif'
      ctx.fillText('✓ 垂直自由落体最快！斜面"冲淡"了重力', R.W * 0.55, ry + 10)
    }
  }

  function drawBall(ctx, R, sx, sy, r, color, label) {
    const grad = ctx.createRadialGradient(sx - r * 0.3, sy - r * 0.3, r * 0.1, sx, sy, r)
    grad.addColorStop(0, color); grad.addColorStop(1, color + '80')
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.arc(sx - r * 0.25, sy - r * 0.25, r * 0.3, 0, Math.PI * 2); ctx.fill()
  }

  function drawSpeedLabel(ctx, x, y, text, color) {
    ctx.fillStyle = color; ctx.font = '9px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText(text, x, y)
  }

  // ========== 信息面板 ==========
  function drawInfoPanel(ctx, R) {
    const s = S.current
    const pw = 220, ph = 180, px = R.W - pw - 16, py = 16

    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('📊 伽利略斜面实验', px + 12, py + 20)
    ctx.font = '11px sans-serif'; let y = py + 40

    ctx.fillStyle = '#666'
    ctx.fillText(`高度 h = ${s.triH.toFixed(1)} m`, px + 12, y); y += 18
    ctx.fillText(`底边 = ${s.triBase.toFixed(1)} m`, px + 12, y); y += 18
    ctx.fillText(`角度 θ = ${s.rampAngle.toFixed(1)}°`, px + 12, y); y += 18
    ctx.fillStyle = '#0288D1'
    ctx.fillText(`斜面加速度 a = ${((5 / 7) * s.g * Math.sin(s.rampAngle * Math.PI / 180)).toFixed(2)}`, px + 12, y); y += 22

    ctx.fillStyle = '#E65100'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('垂直: s = ½gt²', px + 12, y); y += 16
    ctx.fillText('斜面: a = 5g·sinθ/7', px + 12, y); y += 16
    ctx.fillText('斜面"冲淡"重力 → 同高度到不了底', px + 12, y)
  }

  function drawDescription(ctx, R) {
    const x = 16, y = R.H - 46
    ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'
    ctx.fillText('伽利略·斜面实验（经典对比）', x, y)
    ctx.fillStyle = '#888'; ctx.font = '11px sans-serif'
    ctx.fillText('同高度同时释放 → 自由落体先到地面 → 斜面冲淡重力', x, y + 20)
  }

  // ========== 引导气泡 ==========
  function drawGuideBubble(ctx, R) {
    const s = S.current
    if (s.guideDismissed) return
    const text = '👆 点击「释放」三个球同时出发，比较谁先到地面'
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
    s.vertY = 0; s.vertV = 0; s.vertDone = false; s.vertTime = 0
    s.rampS = 0; s.rampV = 0; s.rampDone = false; s.rampTime = 0
    s.arcS = 0; s.arcV = 0; s.arcDone = false; s.arcTime = 0
    s.stData = []; s.time = 0; s.phase = 'running'
  }, [])

  const handleReset = useCallback(() => {
    const s = S.current
    s.vertY = 0; s.vertV = 0; s.vertDone = false; s.vertTime = 0
    s.rampS = 0; s.rampV = 0; s.rampDone = false; s.rampTime = 0
    s.arcS = 0; s.arcV = 0; s.arcDone = false; s.arcTime = 0
    s.stData = []; s.time = 0; s.phase = 'idle'
  }, [])

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <span style={styles.title}>伽利略·斜面实验（经典对比）</span>
        <div style={styles.toolbarActions}>
          <button style={styles.playBtn} onClick={handleDrop}>▶ 释放</button>
          <button style={styles.btn} onClick={handleReset}>↺ 重置</button>
          <div style={styles.sep} />
          <label style={styles.controlLabel}>
            高度 h：
            <input type="range" min="2" max="8" step="0.5" value={triH}
              onChange={(e) => { const v = parseFloat(e.target.value); S.current.triH = v; setTriH(v); recalcAngle() }} style={styles.slider} />
            <span style={styles.sliderVal}>{triH.toFixed(1)}m</span>
          </label>
          <label style={styles.controlLabel}>
            底边：
            <input type="range" min="1" max="8" step="0.5" value={triBase}
              onChange={(e) => { const v = parseFloat(e.target.value); S.current.triBase = v; setTriBase(v); recalcAngle() }} style={styles.slider} />
            <span style={styles.sliderVal}>{triBase.toFixed(1)}m</span>
          </label>
        </div>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={styles.canvas} />
      </div>
      <div style={styles.desc}>
        <b>伽利略·斜面实验</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          同高度同时释放 → 自由落体先到 → 斜面冲淡重力 → 弧线最慢
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
  main: { flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' },
  canvas: { flex: 1, width: '100%' },
  desc: { padding: '8px 14px', background: '#f5f5f5', borderTop: '1px solid #ccc', fontSize: 13, color: '#333' },
}
