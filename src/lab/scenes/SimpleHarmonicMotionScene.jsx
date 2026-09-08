import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * SimpleHarmonicMotionScene — 简谐振动
 *
 * x = A·cos(ωt + φ), ω = √(k/m), T = 2π√(m/k)
 *
 * 交互：
 * - 拖拽滑块（振子）释放 → 简谐振动
 * - 滑块调节 k（劲度系数）、m（质量）
 * - 实时 x-t 图像（正弦波）
 * - 位移/速度/加速度矢量
 * - 动能+势能能量条
 */

export default function SimpleHarmonicMotionScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    k: 20,              // 劲度系数 N/m
    mass: 1.0,          // 质量 kg
    x: 0,               // 当前位移 m（平衡位置为0）
    v: 0,               // 速度 m/s
    A: 0,               // 振幅
    phase: 'idle',      // idle | oscillating | dragging
    time: 0,
    omega: 0,           // 角频率
    T: 0,               // 周期

    // x-t 图像数据
    xtData: [],         // [{t, x}]
    maxXT: 500,
    graphStartTime: 0,

    guideDismissed: false,
    dragX: 0,
  })

  const [k, setK] = useState(20)
  const [mass, setMass] = useState(1.0)
  const [, forceUpdate] = useState(0)
  const [cursor, setCursor] = useState('default')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const R = createRenderer(canvas)
    canvasRef.current._R = R
    recalcOmega()
    const loop = () => { updatePhysics(); renderFrame(R); animRef.current = requestAnimationFrame(loop) }
    loop()
    const onResize = () => R.resize()
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function createRenderer(canvas) {
    const R = {
      canvas, ctx: canvas.getContext('2d'), W: 0, H: 0, scale: 100, ox: 0, oy: 0,
      resize() {
        const rect = canvas.getBoundingClientRect()
        canvas.width = rect.width * devicePixelRatio
        canvas.height = rect.height * devicePixelRatio
        this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
        this.W = rect.width; this.H = rect.height
        this.ox = this.W * 0.25; this.oy = this.H * 0.4
      },
      w2s(wx, wy) { return [this.ox + wx * this.scale, this.oy - wy * this.scale] },
      s2w(sx, sy) { return [(sx - this.ox) / this.scale, (this.oy - sy) / this.scale] },
      clear() { this.ctx.clearRect(0, 0, this.W, this.H) },
    }
    R.resize()
    return R
  }

  function recalcOmega() {
    const s = S.current
    s.omega = Math.sqrt(s.k / s.mass)
    s.T = 2 * Math.PI / s.omega
  }

  // ========== Physics ==========
  function updatePhysics() {
    const s = S.current
    if (s.phase !== 'oscillating') return

    const dt = 1 / 60
    s.time += dt

    // 弹簧力 F = -kx，加速度 a = -kx/m
    const a = -(s.k / s.mass) * s.x
    s.v += a * dt
    s.x += s.v * dt

    // 记录 x-t 数据
    s.xtData.push({ t: s.time, x: s.x })
    if (s.xtData.length > s.maxXT) s.xtData.shift()

    // 阻尼检测（极小阻尼，教学用）
    if (Math.abs(s.x) < 0.0005 && Math.abs(s.v) < 0.0005 && s.time > 1) {
      s.phase = 'idle'
    }

    forceUpdate(n => n + 1)
  }

  // ========== Render ==========
  function renderFrame(R) {
    const ctx = R.ctx; R.clear()
    ctx.fillStyle = '#f0f4f8'; ctx.fillRect(0, 0, R.W, R.H)
    drawSpring(ctx, R)
    drawXTGraph(ctx, R)
    drawInfoPanel(ctx, R)
    drawEnergyBar(ctx, R)
    drawDescription(ctx, R)
    drawGuideBubble(ctx, R)
  }

  // ========== 弹簧振子 ==========
  function drawSpring(ctx, R) {
    const s = S.current
    const curX = s.phase === 'dragging' ? s.dragX : s.x

    // 平衡位置
    const [eqX, eqY] = R.w2s(0, 0)
    ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(eqX, eqY - 40); ctx.lineTo(eqX, eqY + 40); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#888'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('平衡位置', eqX, eqY + 55)

    // 固定墙
    const [wallX, wallY] = R.w2s(-1.8, 0)
    ctx.fillStyle = '#90A4AE'
    ctx.fillRect(wallX - 12, wallY - 35, 12, 70)
    // 墙面纹理
    ctx.strokeStyle = '#78909C'; ctx.lineWidth = 1
    for (let i = -30; i <= 30; i += 10) {
      ctx.beginPath(); ctx.moveTo(wallX - 12, wallY + i); ctx.lineTo(wallX - 4, wallY + i - 8); ctx.stroke()
    }

    // 弹簧（从墙到滑块，锯齿形）
    const [sx, sy] = R.w2s(-1.8, 0)
    const [mx, my] = R.w2s(curX, 0)
    const springLen = mx - sx
    const coils = 18
    const amp = 10

    ctx.strokeStyle = '#546E7A'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'
    ctx.beginPath(); ctx.moveTo(sx, sy)
    // 起始钩（连接墙）
    ctx.lineTo(sx + 8, sy)
    // 锯齿弹簧体
    for (let i = 0; i < coils; i++) {
      const t1 = (i + 0.5) / coils
      const t2 = (i + 1) / coils
      const px1 = sx + 8 + (springLen - 16) * t1
      const px2 = sx + 8 + (springLen - 16) * t2
      const dir = i % 2 === 0 ? 1 : -1
      ctx.lineTo(px1, sy + dir * amp)
      ctx.lineTo(px2, sy - dir * amp)
    }
    // 结束钩（连接滑块）
    ctx.lineTo(mx - 4, sy)
    ctx.lineTo(mx, my)
    ctx.stroke(); ctx.lineJoin = 'miter'

    // 滑块（振子）
    const blockW = 40, blockH = 30
    const grad = ctx.createLinearGradient(mx - blockW / 2, my - blockH / 2, mx + blockW / 2, my + blockH / 2)
    grad.addColorStop(0, '#0288D1'); grad.addColorStop(1, '#01579B')
    ctx.fillStyle = grad
    ctx.beginPath(); ctx.roundRect(mx - blockW / 2, my - blockH / 2, blockW, blockH, 4); ctx.fill()
    ctx.strokeStyle = '#01579B'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(mx - blockW / 2, my - blockH / 2, blockW, blockH, 4); ctx.stroke()

    // 质量标签
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(`${s.mass.toFixed(1)}kg`, mx, my)
    ctx.textBaseline = 'alphabetic'

    // 地面
    ctx.strokeStyle = '#90A4AE'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(wallX, my + blockH / 2 + 2); ctx.lineTo(mx + blockW, my + blockH / 2 + 2); ctx.stroke()

    // 位移标注
    if (Math.abs(curX) > 0.02) {
      const [arrowX] = R.w2s(curX, 0)
      ctx.strokeStyle = '#E65100'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(eqX, my + blockH / 2 + 20); ctx.lineTo(arrowX, my + blockH / 2 + 20); ctx.stroke()
      // 箭头
      const dir = curX > 0 ? 1 : -1
      ctx.fillStyle = '#E65100'
      ctx.beginPath(); ctx.moveTo(arrowX, my + blockH / 2 + 20)
      ctx.lineTo(arrowX - dir * 6, my + blockH / 2 + 16); ctx.lineTo(arrowX - dir * 6, my + blockH / 2 + 24)
      ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#E65100'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(`x = ${curX.toFixed(3)} m`, (eqX + arrowX) / 2, my + blockH / 2 + 35)
    }

    // 速度矢量（在滑块上方）
    if (s.phase === 'oscillating' && Math.abs(s.v) > 0.05) {
      const vLen = Math.min(Math.abs(s.v) * 15, 60)
      const vDir = s.v > 0 ? 1 : -1
      const vy = my - blockH / 2 - 15
      ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(mx, vy); ctx.lineTo(mx + vDir * vLen, vy); ctx.stroke()
      ctx.fillStyle = '#4CAF50'
      ctx.beginPath(); ctx.moveTo(mx + vDir * vLen, vy)
      ctx.lineTo(mx + vDir * (vLen - 6), vy - 4); ctx.lineTo(mx + vDir * (vLen - 6), vy + 4)
      ctx.closePath(); ctx.fill()
      ctx.font = '9px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(`v = ${s.v.toFixed(2)}`, mx + vDir * vLen / 2, vy - 8)
    }

    // 加速度矢量（在滑块下方）
    if (s.phase === 'oscillating' && Math.abs(s.x) > 0.01) {
      const acc = -(s.k / s.mass) * s.x
      const aLen = Math.min(Math.abs(acc) * 3, 50)
      const aDir = acc > 0 ? 1 : -1
      const ay = my - blockH / 2 - 30
      ctx.strokeStyle = '#F44336'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(mx, ay); ctx.lineTo(mx + aDir * aLen, ay); ctx.stroke()
      ctx.fillStyle = '#F44336'
      ctx.beginPath(); ctx.moveTo(mx + aDir * aLen, ay)
      ctx.lineTo(mx + aDir * (aLen - 5), ay - 3); ctx.lineTo(mx + aDir * (aLen - 5), ay + 3)
      ctx.closePath(); ctx.fill()
      ctx.font = '9px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(`a = ${acc.toFixed(2)}`, mx + aDir * aLen / 2, ay - 7)
    }

    // 振幅标注
    if (s.phase === 'oscillating' && s.A > 0.02) {
      const [leftX] = R.w2s(-s.A, 0)
      const [rightX] = R.w2s(s.A, 0)
      ctx.strokeStyle = 'rgba(156,39,176,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3])
      ctx.beginPath(); ctx.moveTo(leftX, eqY - 45); ctx.lineTo(leftX, eqY + 45); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(rightX, eqY - 45); ctx.lineTo(rightX, eqY + 45); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#9C27B0'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(`-A`, leftX, eqY - 50)
      ctx.fillText(`+A`, rightX, eqY - 50)
    }
  }

  // ========== x-t 图像 ==========
  function drawXTGraph(ctx, R) {
    const s = S.current
    const gw = R.W * 0.48, gh = 140
    const gx = R.W * 0.48, gy = 16

    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, 8); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('📈 x-t 图像（位移-时间）', gx + 10, gy + 6)

    const ox = gx + 40, oy = gy + gh / 2, w = gw - 55, h = gh / 2 - 15

    // 坐标轴
    ctx.strokeStyle = '#bbb'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(ox, gy + 20); ctx.lineTo(ox, gy + gh - 15); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + w, oy); ctx.stroke()

    // 零线
    ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + w, oy); ctx.stroke()

    const data = s.xtData
    if (data.length > 1) {
      const tEnd = data[data.length - 1].t
      const tStart = Math.max(0, tEnd - 6) // 显示最近6秒
      const maxA = Math.max(s.A, 0.1)

      ctx.strokeStyle = '#0288D1'; ctx.lineWidth = 2; ctx.beginPath()
      let started = false
      for (let i = 0; i < data.length; i++) {
        if (data[i].t < tStart) continue
        const px = ox + ((data[i].t - tStart) / 6) * w
        const py = oy - (data[i].x / maxA) * h
        if (!started) { ctx.moveTo(px, py); started = true } else ctx.lineTo(px, py)
      }
      ctx.stroke()
    }

    ctx.fillStyle = '#888'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('t (s)', ox + w / 2, gy + gh - 12)
    ctx.save(); ctx.translate(gx + 12, oy - h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('x (m)', 0, 0); ctx.restore()
  }

  // ========== 能量条 ==========
  function drawEnergyBar(ctx, R) {
    const s = S.current
    if (s.phase !== 'oscillating' && s.phase !== 'idle') return

    const curX = s.phase === 'dragging' ? s.dragX : s.x
    const KE = 0.5 * s.mass * s.v * s.v
    const PE = 0.5 * s.k * curX * curX
    const total = KE + PE
    if (total < 0.001) return

    const bx = 16, by = R.H - 80, bw = 200, bh = 16

    ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('能量', bx, by - 16)

    // 背景
    ctx.fillStyle = '#e0e0e0'; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 3); ctx.fill()

    // 动能（绿色）
    const keW = (KE / total) * bw
    if (keW > 0) {
      ctx.fillStyle = '#4CAF50'; ctx.beginPath(); ctx.roundRect(bx, by, keW, bh, [3, keW >= bw - 1 ? 3 : 0, keW >= bw - 1 ? 3 : 0, 3]); ctx.fill()
    }

    // 势能（橙色）
    const peW = (PE / total) * bw
    if (peW > 0) {
      ctx.fillStyle = '#FF9800'; ctx.beginPath(); ctx.roundRect(bx + keW, by, peW, bh, [keW < 1 ? 3 : 0, 3, 3, keW < 1 ? 3 : 0]); ctx.fill()
    }

    // 标签
    ctx.font = '9px sans-serif'; ctx.textBaseline = 'top'
    ctx.fillStyle = '#4CAF50'; ctx.fillText(`动能 ${KE.toFixed(2)}J`, bx, by + bh + 4)
    ctx.fillStyle = '#FF9800'; ctx.fillText(`势能 ${PE.toFixed(2)}J`, bx + 80, by + bh + 4)
    ctx.fillStyle = '#333'; ctx.fillText(`总 ${total.toFixed(2)}J`, bx + 160, by + bh + 4)
  }

  // ========== 信息面板 ==========
  function drawInfoPanel(ctx, R) {
    const s = S.current
    const pw = 210, ph = 200, px = R.W - pw - 16, py = 16

    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('📊 简谐振动参数', px + 12, py + 10)
    ctx.font = '11px sans-serif'; let y = py + 30

    ctx.fillStyle = '#666'
    ctx.fillText(`劲度系数 k = ${s.k.toFixed(1)} N/m`, px + 12, y); y += 18
    ctx.fillText(`质量 m = ${s.mass.toFixed(1)} kg`, px + 12, y); y += 18
    ctx.fillText(`角频率 ω = ${s.omega.toFixed(2)} rad/s`, px + 12, y); y += 18
    ctx.fillStyle = '#0288D1'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`周期 T = ${s.T.toFixed(3)} s`, px + 12, y); y += 18
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'
    ctx.fillText(`频率 f = ${(1 / s.T).toFixed(2)} Hz`, px + 12, y); y += 22

    if (s.phase === 'oscillating') {
      ctx.fillStyle = '#E65100'
      ctx.fillText(`振幅 A = ${s.A.toFixed(3)} m`, px + 12, y); y += 18
      ctx.fillText(`位移 x = ${s.x.toFixed(3)} m`, px + 12, y); y += 18
      ctx.fillText(`速度 v = ${s.v.toFixed(3)} m/s`, px + 12, y); y += 22
    }

    ctx.fillStyle = '#E65100'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('x = A·cos(ωt + φ)', px + 12, y); y += 15
    ctx.fillText('T = 2π√(m/k)', px + 12, y); y += 15
    ctx.fillStyle = '#888'; ctx.font = '10px sans-serif'
    ctx.fillText('T 与振幅 A 无关', px + 12, y)
  }

  function drawDescription(ctx, R) {
    const x = 16, y = R.H - 46
    ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'
    ctx.fillText('简谐振动', x, y)
    ctx.fillStyle = '#0288D1'; ctx.font = 'bold 13px serif'
    ctx.fillText('x = A·cos(ωt + φ)', x + 80, y)
    ctx.fillStyle = '#888'; ctx.font = '11px sans-serif'
    ctx.fillText('拖拽滑块释放 · 调节 k 和 m · 观察 x-t 波形和能量变化', x, y + 20)
  }

  // ========== 引导气泡 ==========
  function drawGuideBubble(ctx, R) {
    if (S.current.guideDismissed) return
    const text = '👆 拖拽蓝色滑块向右拉伸，松手释放观察简谐振动'
    const bx = R.W * 0.4, by = R.H * 0.65
    ctx.font = '13px sans-serif'
    const tw = ctx.measureText(text).width + 24, th = 32
    const ry = by + Math.sin(Date.now() / 600) * 4
    ctx.fillStyle = 'rgba(2,136,209,0.12)'; ctx.beginPath(); ctx.roundRect(bx - tw / 2, ry - th / 2, tw, th, 16); ctx.fill()
    ctx.strokeStyle = 'rgba(2,136,209,0.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(bx - tw / 2, ry - th / 2, tw, th, 16); ctx.stroke()
    ctx.fillStyle = '#0288D1'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(text, bx, ry); ctx.textBaseline = 'alphabetic'
  }

  // ========== 交互 ==========
  const handleMouseDown = useCallback((e) => {
    const canvas = canvasRef.current
    const R = canvas._R; if (!R) return
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top
    const s = S.current
    const [mx, my] = R.w2s(s.x, 0)
    if (Math.abs(sx - mx) < 35 && Math.abs(sy - my) < 30) {
      s.phase = 'dragging'
      setCursor('grabbing')
    }
  }, [])

  const handleMouseMove = useCallback((e) => {
    const s = S.current
    if (s.phase !== 'dragging') return
    const canvas = canvasRef.current
    const R = canvas._R; if (!R) return
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const [wx] = R.s2w(sx, 0)
    s.dragX = Math.max(-1.5, Math.min(1.5, wx))
    forceUpdate(n => n + 1)
  }, [])

  const handleMouseUp = useCallback(() => {
    const s = S.current
    if (s.phase !== 'dragging') return
    s.x = s.dragX
    s.v = 0
    s.A = Math.abs(s.x)
    s.phase = 'oscillating'
    s.time = 0
    s.xtData = []
    s.guideDismissed = true
    recalcOmega()
    setCursor('default')
    forceUpdate(n => n + 1)
  }, [])

  const handleReset = useCallback(() => {
    const s = S.current
    s.x = 0; s.v = 0; s.A = 0; s.phase = 'idle'; s.time = 0; s.xtData = []
  }, [])

  const handleKChange = useCallback((v) => { S.current.k = v; setK(v); recalcOmega() }, [])
  const handleMassChange = useCallback((v) => { S.current.mass = v; setMass(v); recalcOmega() }, [])

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <span style={styles.title}>简谐振动</span>
        <div style={styles.toolbarActions}>
          <button style={styles.btn} onClick={handleReset}>↺ 重置</button>
          <div style={styles.sep} />
          <label style={styles.controlLabel}>
            劲度系数 k：
            <input type="range" min="5" max="80" step="1" value={k}
              onChange={(e) => handleKChange(parseFloat(e.target.value))} style={styles.slider} />
            <span style={styles.sliderVal}>{k}N/m</span>
          </label>
          <label style={styles.controlLabel}>
            质量 m：
            <input type="range" min="0.2" max="3.0" step="0.1" value={mass}
              onChange={(e) => handleMassChange(parseFloat(e.target.value))} style={styles.slider} />
            <span style={styles.sliderVal}>{mass.toFixed(1)}kg</span>
          </label>
        </div>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={{ ...styles.canvas, cursor }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>
      <div style={styles.desc}>
        <b>简谐振动</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          拖拽滑块释放 · x = A·cos(ωt+φ) · T = 2π√(m/k) · 观察波形和能量
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
  slider: { width: 80, accentColor: '#4FC3F7' },
  sliderVal: { color: '#0288D1', fontWeight: 600, minWidth: 50, fontSize: 12 },
  btn: { background: '#f0f0f0', color: '#333', border: '1px solid #ddd', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  sep: { width: 1, height: 20, background: '#ddd' },
  main: { flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' },
  canvas: { flex: 1, width: '100%' },
  desc: { padding: '8px 14px', background: '#f5f5f5', borderTop: '1px solid #ccc', fontSize: 13, color: '#333' },
}
