import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * UniformAccelScene — 研究匀变速直线运动
 *
 * 交互：
 * - 调节加速度和初速度
 * - 点击"打点"开始纸带记录
 * - 实时显示纸带点迹
 * - 逐差法求加速度
 * - v-t图像绘制
 * - 验证匀变速：Δs = aT²
 */
export default function UniformAccelScene({ preset }) {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const rendererRef = useRef(null)

  const stateRef = useRef({
    v0: 0.2,            // 初速度 m/s
    acceleration: 0.5,  // 加速度 m/s²
    tickerFreq: 50,     // 打点频率 Hz
    running: false,
    time: 0,
    points: [],         // 打点记录 {t, x}
    tapeLength: 0,
    currentX: 0,
    currentV: 0,
    // 计算结果
    calculatedA: 0,
    calculatedV0: 0,
  })

  const [running, setRunning] = useState(false)
  const [analysis, setAnalysis] = useState(null)
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const renderer = createRenderer(canvas)
    rendererRef.current = renderer

    const renderLoop = () => {
      updatePhysics()
      renderFrame(renderer)
      animRef.current = requestAnimationFrame(renderLoop)
    }
    renderLoop()

    const handleResize = () => renderer.resize()
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [])

  function createRenderer(canvas) {
    const r = {
      canvas, ctx: canvas.getContext('2d'),
      screenW: 0, screenH: 0, scale: 600,
      resize() {
        const rect = canvas.getBoundingClientRect()
        canvas.width = rect.width * devicePixelRatio
        canvas.height = rect.height * devicePixelRatio
        this.ctx.scale(devicePixelRatio, devicePixelRatio)
        this.screenW = rect.width
        this.screenH = rect.height
      },
      clear() { this.ctx.clearRect(0, 0, this.screenW, this.screenH) },
    }
    r.resize()
    return r
  }

  // ========== 物理 ==========
  function updatePhysics() {
    const s = stateRef.current
    if (!s.running) return

    const dt = 1 / 60
    s.time += dt

    // 运动学
    s.currentX = s.v0 * s.time + 0.5 * s.acceleration * s.time * s.time
    s.currentV = s.v0 + s.acceleration * s.time

    // 打点记录（按频率）
    const tickerPeriod = 1 / s.tickerFreq
    const expectedPoints = Math.floor(s.time * s.tickerFreq)
    while (s.points.length < expectedPoints) {
      const t = (s.points.length + 1) * tickerPeriod
      const x = s.v0 * t + 0.5 * s.acceleration * t * t
      s.points.push({ t, x })
    }

    // 限制纸带长度
    if (s.currentX > 2.5) {
      s.running = false
      setRunning(false)
      analyzeData()
    }

    s.tapeLength = s.currentX
    forceUpdate(n => n + 1)
  }

  // ========== 分析 ==========
  function analyzeData() {
    const s = stateRef.current
    const T = 1 / s.tickerFreq
    const pts = s.points

    if (pts.length < 10) return

    // 取等间隔点（每隔n个点取一个，n=打点周期内的点数）
    const n = Math.max(1, Math.floor(s.tickerFreq / 10))  // 每0.1s取一个
    const selected = []
    for (let i = 0; i < pts.length; i += n) {
      selected.push(pts[i])
    }

    if (selected.length < 6) return

    // 逐差法求加速度
    const half = Math.floor(selected.length / 2)
    let sumDeltaX = 0
    let count = 0

    const intervals = []
    for (let i = 0; i < half && i + half < selected.length; i++) {
      const dx = selected[i + half].x - selected[i].x
      sumDeltaX += dx
      count++
      intervals.push(dx)
    }

    const m = half  // 间隔数
    const T_total = m * n * T  // 时间间隔
    const a = count > 0 ? (2 * sumDeltaX) / (count * T_total * T_total) : 0

    // v-t图像斜率
    // v_i = (x_{i+1} - x_{i-1}) / (2T)
    const velocities = []
    for (let i = 1; i < selected.length - 1; i++) {
      const v = (selected[i + 1].x - selected[i - 1].x) / (2 * n * T)
      velocities.push({ t: selected[i].t, v })
    }

    // 线性拟合 v = v0 + at
    let sumT = 0, sumV = 0, sumTT = 0, sumTV = 0
    for (const p of velocities) {
      sumT += p.t
      sumV += p.v
      sumTT += p.t * p.t
      sumTV += p.t * p.v
    }
    const nv = velocities.length
    const slope = (nv * sumTV - sumT * sumV) / (nv * sumTT - sumT * sumT)
    const intercept = (sumV - slope * sumT) / nv

    setAnalysis({
      a,
      slopeA: slope,
      v0: intercept,
      velocities,
      selected,
      intervals,
      T_total,
    })
  }

  // ========== 渲染 ==========
  function renderFrame(renderer) {
    const ctx = renderer.ctx
    renderer.clear()

    drawPaperTape(ctx, renderer)
    drawVTGraph(ctx, renderer)
    drawDataPanel(ctx, renderer)
    drawDescription(ctx, renderer)
  }

  function drawPaperTape(ctx, renderer) {
    const s = stateRef.current
    const w = renderer.screenW
    const h = renderer.screenH

    // 纸带区域
    const tapeY = h * 0.35
    const tapeH = 80
    const startX = 60

    // 纸带背景
    ctx.fillStyle = '#f5f0e0'
    ctx.globalAlpha = 0.1
    ctx.fillRect(startX, tapeY - tapeH / 2, w - 120, tapeH)
    ctx.globalAlpha = 1

    // 纸带边线
    ctx.strokeStyle = 'rgba(245, 240, 224, 0.3)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(startX, tapeY - tapeH / 2)
    ctx.lineTo(w - 60, tapeY - tapeH / 2)
    ctx.moveTo(startX, tapeY + tapeH / 2)
    ctx.lineTo(w - 60, tapeY + tapeH / 2)
    ctx.stroke()

    // 打点
    if (s.points.length > 0) {
      const maxDist = Math.max(s.tapeLength, 0.5)
      const pxPerM = (w - 150) / maxDist

      for (let i = 0; i < s.points.length; i++) {
        const x = startX + 20 + s.points[i].x * pxPerM
        if (x > w - 60) break

        // 每个点的间距递增（加速运动）
        const intensity = 0.5 + (i / s.points.length) * 0.5
        ctx.fillStyle = `rgba(79, 195, 247, ${intensity})`
        ctx.beginPath()
        ctx.arc(x, tapeY, 3, 0, Math.PI * 2)
        ctx.fill()

        // 标号（每隔几个点）
        if (i % 5 === 0) {
          ctx.fillStyle = 'rgba(139, 148, 158, 0.6)'
          ctx.font = '9px monospace'
          ctx.textAlign = 'center'
          ctx.fillText(`${i}`, x, tapeY + tapeH / 2 + 14)
        }
      }

      // 间距标注
      if (analysis && analysis.selected.length > 2) {
        const n = Math.max(1, Math.floor(s.tickerFreq / 10))
        for (let i = 0; i < Math.min(analysis.selected.length - 1, 8); i++) {
          const x1 = startX + 20 + analysis.selected[i].x * pxPerM
          const x2 = startX + 20 + analysis.selected[i + 1].x * pxPerM
          if (x2 > w - 60) break

          // 间距线
          ctx.strokeStyle = 'rgba(255, 152, 0, 0.4)'
          ctx.lineWidth = 1
          ctx.setLineDash([3, 3])
          ctx.beginPath()
          ctx.moveTo(x1, tapeY - tapeH / 2 - 10)
          ctx.lineTo(x2, tapeY - tapeH / 2 - 10)
          ctx.stroke()
          ctx.setLineDash([])

          // 间距标签
          const dx = analysis.selected[i + 1].x - analysis.selected[i].x
          ctx.fillStyle = 'rgba(255, 152, 0, 0.7)'
          ctx.font = '9px sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText(`s${i + 1}=${(dx * 100).toFixed(1)}`, (x1 + x2) / 2, tapeY - tapeH / 2 - 16)
        }
      }
    }

    // 标题
    ctx.fillStyle = '#8b949e'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('纸带（打点计时器）', startX, tapeY - tapeH / 2 - 30)
  }

  function drawVTGraph(ctx, renderer) {
    const w = renderer.screenW
    const h = renderer.screenH
    const analysis = stateRef.current

    const graphW = 280
    const graphH = 160
    const gx = w - graphW - 20
    const gy = 16

    ctx.fillStyle = 'rgba(22, 27, 34, 0.95)'
    ctx.beginPath()
    ctx.roundRect(gx, gy, graphW, graphH, 8)
    ctx.fill()
    ctx.strokeStyle = '#30363d'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(gx, gy, graphW, graphH, 8)
    ctx.stroke()

    ctx.fillStyle = '#c9d1d9'
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('📈 v-t 图像', gx + 10, gy + 16)

    const ox = gx + 40
    const oy = gy + graphH - 20
    const gw = graphW - 55
    const gh = graphH - 40

    // 坐标轴
    ctx.strokeStyle = '#484f58'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(ox, oy - gh)
    ctx.lineTo(ox, oy)
    ctx.lineTo(ox + gw, oy)
    ctx.stroke()

    if (analysis && analysis.velocities && analysis.velocities.length > 2) {
      const vels = analysis.velocities
      const maxT = Math.max(...vels.map(v => v.t), 0.1)
      const maxV = Math.max(...vels.map(v => v.v), 0.5)

      // 数据点
      ctx.fillStyle = '#4FC3F7'
      for (const v of vels) {
        const px = ox + (v.t / maxT) * gw
        const py = oy - (v.v / maxV) * gh
        ctx.beginPath()
        ctx.arc(px, py, 2.5, 0, Math.PI * 2)
        ctx.fill()
      }

      // 拟合线
      ctx.strokeStyle = '#FF9800'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      const v0 = analysis.v0
      const a = analysis.slopeA
      const t0 = 0
      const t1 = maxT
      ctx.moveTo(ox, oy - (v0 / maxV) * gh)
      ctx.lineTo(ox + (t1 / maxT) * gw, oy - ((v0 + a * t1) / maxV) * gh)
      ctx.stroke()
      ctx.setLineDash([])

      // 标注
      ctx.fillStyle = '#FF9800'
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(`a = ${a.toFixed(3)} m/s²`, gx + graphW - 10, gy + 30)
    }

    ctx.fillStyle = '#484f58'
    ctx.font = '9px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('t (s)', ox + gw / 2, oy + 14)
    ctx.save()
    ctx.translate(gx + 10, oy - gh / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText('v (m/s)', 0, 0)
    ctx.restore()
  }

  function drawDataPanel(ctx, renderer) {
    const w = renderer.screenW
    const h = renderer.screenH
    const s = stateRef.current

    const panelW = 220
    const panelH = 220
    const px = 16
    const py = 16

    ctx.fillStyle = 'rgba(22, 27, 34, 0.95)'
    ctx.beginPath()
    ctx.roundRect(px, py, panelW, panelH, 8)
    ctx.fill()
    ctx.strokeStyle = '#30363d'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(px, py, panelW, panelH, 8)
    ctx.stroke()

    ctx.fillStyle = '#c9d1d9'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('📊 实验数据', px + 14, py + 20)

    let y = py + 40
    ctx.font = '11px sans-serif'

    ctx.fillStyle = '#8b949e'
    ctx.fillText(`初速度 v₀ = ${s.v0.toFixed(2)} m/s`, px + 14, y); y += 18
    ctx.fillText(`加速度 a = ${s.acceleration.toFixed(2)} m/s²`, px + 14, y); y += 18
    ctx.fillText(`打点频率 f = ${s.tickerFreq} Hz`, px + 14, y); y += 18
    ctx.fillText(`打点数 = ${s.points.length}`, px + 14, y); y += 18
    ctx.fillText(`纸带长度 = ${(s.tapeLength * 100).toFixed(1)} cm`, px + 14, y); y += 24

    if (analysis) {
      ctx.fillStyle = '#FFD700'
      ctx.font = 'bold 11px sans-serif'
      ctx.fillText('── 逐差法结果 ──', px + 14, y); y += 20

      ctx.fillStyle = '#4CAF50'
      ctx.fillText(`逐差法 a = ${analysis.a.toFixed(4)} m/s²`, px + 14, y); y += 18
      ctx.fillStyle = '#4FC3F7'
      ctx.fillText(`v-t斜率 a = ${analysis.slopeA.toFixed(4)} m/s²`, px + 14, y); y += 18
      ctx.fillStyle = '#FF9800'
      ctx.fillText(`v-t截距 v₀ = ${analysis.v0.toFixed(4)} m/s`, px + 14, y)

      // 验证
      y += 22
      const errorA = Math.abs(analysis.slopeA - s.acceleration) / s.acceleration * 100
      ctx.fillStyle = errorA < 5 ? '#4CAF50' : '#FF9800'
      ctx.font = '11px sans-serif'
      ctx.fillText(`误差: ${errorA.toFixed(1)}%`, px + 14, y)
    }
  }

  function drawDescription(ctx, renderer) {
    const h = renderer.screenH
    const x = 16
    let y = h - 120

    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'

    ctx.fillStyle = '#c9d1d9'
    ctx.font = 'bold 14px sans-serif'
    ctx.fillText('研究匀变速直线运动', x, y); y += 22

    ctx.fillStyle = '#4FC3F7'
    ctx.font = 'bold 14px serif'
    ctx.fillText('Δs = aT² （逐差法）', x, y); y += 24

    ctx.fillStyle = '#8b949e'
    ctx.font = '11px sans-serif'
    ctx.fillText('① 调节初速度和加速度', x, y); y += 16
    ctx.fillText('② 点击"开始打点"记录纸带', x, y); y += 16
    ctx.fillText('③ 分析点迹，逐差法求a', x, y)
  }

  // ========== 控制 ==========
  const handleStart = useCallback(() => {
    const s = stateRef.current
    s.points = []
    s.time = 0
    s.currentX = 0
    s.currentV = 0
    s.running = true
    s.tapeLength = 0
    setRunning(true)
    setAnalysis(null)
  }, [])

  const handleStop = useCallback(() => {
    stateRef.current.running = false
    setRunning(false)
    analyzeData()
  }, [])

  const handleReset = useCallback(() => {
    const s = stateRef.current
    s.points = []
    s.time = 0
    s.currentX = 0
    s.currentV = 0
    s.running = false
    s.tapeLength = 0
    setRunning(false)
    setAnalysis(null)
  }, [])

  const rule = running
    ? { text: '打点记录中...观察点间距变化', color: '#FF9800' }
    : analysis
      ? { text: `逐差法: a=${analysis.a.toFixed(3)} m/s² | v-t斜率: a=${analysis.slopeA.toFixed(3)} m/s²`, color: '#4CAF50' }
      : { text: '调节参数后点击"开始打点"', color: '#484f58' }

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <span style={styles.title}>研究匀变速直线运动</span>
        <div style={styles.toolbarActions}>
          {!running ? (
            <button style={styles.playBtn} onClick={handleStart}>▶ 开始打点</button>
          ) : (
            <button style={styles.pauseBtn} onClick={handleStop}>⏸ 停止</button>
          )}
          <button style={styles.setBtn} onClick={handleReset}>⚙ Set</button>
          <div style={styles.sep} />
          <label style={styles.controlLabel}>
            v₀：
            <input type="range" min="0" max="1" step="0.05"
              value={stateRef.current.v0}
              onChange={(e) => { stateRef.current.v0 = parseFloat(e.target.value); forceUpdate(n => n + 1) }}
              style={styles.slider} />
            <span style={styles.sliderVal}>{stateRef.current.v0.toFixed(2)} m/s</span>
          </label>
          <label style={styles.controlLabel}>
            a：
            <input type="range" min="0.1" max="2" step="0.1"
              value={stateRef.current.acceleration}
              onChange={(e) => { stateRef.current.acceleration = parseFloat(e.target.value); forceUpdate(n => n + 1) }}
              style={styles.slider} />
            <span style={styles.sliderVal}>{stateRef.current.acceleration.toFixed(1)} m/s²</span>
          </label>
          <label style={styles.controlLabel}>
            频率：
            <select value={stateRef.current.tickerFreq}
              onChange={(e) => { stateRef.current.tickerFreq = parseInt(e.target.value); forceUpdate(n => n + 1) }}
              style={styles.select}>
              <option value="20">20Hz</option>
              <option value="50">50Hz</option>
              <option value="100">100Hz</option>
            </select>
          </label>
          <span style={styles.timer}>t = {stateRef.current.time.toFixed(3)} s</span>
        </div>
      </div>

      <div style={styles.main}>
        <canvas ref={canvasRef} style={styles.canvas} />
      </div>

      <div style={styles.desc}>
        <b>实验：研究匀变速直线运动</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>调节初速度和加速度，点击"开始打点"记录纸带，分析点迹用逐差法求加速度，验证 Δs = aT²。</span>
      </div>
    </div>
  )
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#e8e8e8', color: '#333', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  toolbar: { minHeight: 44, background: '#f5f5f5', borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', flexShrink: 0, flexWrap: 'wrap', gap: 6 },
  title: { fontSize: 14, fontWeight: 600 },
  toolbarActions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  controlLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#555' },
  slider: { width: 80, accentColor: '#4A90D9' },
  sliderVal: { color: '#4A90D9', fontWeight: 600, minWidth: 50, fontSize: 12 },
  select: { background: '#fff', color: '#333', border: '1px solid #ccc', borderRadius: 4, padding: '3px 6px', fontSize: 12 },
  btn: { background: '#fff', color: '#4A90D9', border: '1px solid #ccc', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  playBtn: { background: '#4A90D9', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600, minWidth: 70 },
  pauseBtn: { background: '#E53935', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600, minWidth: 70 },
  setBtn: { background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  startBtn: { background: '#4A90D9', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  stopBtn: { background: '#E53935', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  sep: { width: 1, height: 20, background: '#ccc' },
  timer: { fontFamily: 'Consolas,monospace', fontSize: 13, marginLeft: 8 },
  main: { flex: 1, display: 'flex', overflow: 'hidden', background: '#fff', position: 'relative' },
  canvas: { flex: 1, width: '100%' },
  desc: { padding: '8px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13 },
}
