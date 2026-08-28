/**
 * MeasureSpeedScene — 测量平均速度
 *
 * 实验器材：斜面轨道、小车、刻度尺、秒表
 * 物理原理：v = s / t
 * 交互：调节斜面角度、起点/终点位置，释放小车，自动计时
 * 数据：多组(s, t, v)记录，求平均值
 */

import { useRef, useEffect, useState, useCallback } from 'react'

// 颜色
const C = {
  bg: '#1a1d23',
  grid: 'rgba(255,255,255,0.03)',
  ramp: '#4a5568',
  rampTop: '#718096',
  car: '#ef4444',
  carWheel: '#1a1a2e',
  ruler: '#FFF9C4',
  rulerTick: '#5D4037',
  rulerMajor: '#F9A825',
  startFlag: '#22c55e',
  endFlag: '#ef4444',
  text: '#e5e7eb',
  subText: '#9ca3af',
  accent: '#3b82f6',
  warn: '#f59e0b',
}

export default function MeasureSpeedScene() {
  const canvasRef = useRef(null)
  const rafRef = useRef(null)
  const lastTimeRef = useRef(0)

  // 仿真状态
  const sim = useRef({
    // 斜面参数
    rampAngle: 15,        // 角度（度）
    rampLength: 2.0,      // 斜面长度 m
    startX: 0.20,         // 起点位置 m（沿斜面）
    endX: 1.60,           // 终点位置 m（沿斜面）
    // 小车状态
    carPos: 0.20,         // 当前位置 m（沿斜面）
    carVel: 0,            // 速度 m/s
    moving: false,
    finished: false,
    // 计时
    timeElapsed: 0,
    timing: false,
    // 数据
    trials: [],           // [{s, t, v}]
    // 物理
    g: 9.8,
    friction: 0.02,       // 摩擦系数
    // 布局
    screenW: 0, screenH: 0,
    rampStartX: 0, rampStartY: 0,
    rampEndX: 0, rampEndY: 0,
    scale: 0,             // m → px
    // 拖拽
    dragging: null,       // 'start' | 'end' | null
  })

  const [angle, setAngle] = useState(15)
  const [startPos, setStartPos] = useState(0.20)
  const [endPos, setEndPos] = useState(1.60)
  const [trials, setTrials] = useState([])
  const [moving, setMoving] = useState(false)
  const [paused, setPaused] = useState(false)
  const [, forceUpdate] = useState(0)
  const triggerRender = useCallback(() => forceUpdate(n => n + 1), [])

  // ============ 物理 ============
  function getAccel() {
    const s = sim.current
    const theta = s.rampAngle * Math.PI / 180
    return s.g * Math.sin(theta) - s.friction * s.g * Math.cos(theta)
  }

  // ============ Canvas 初始化 ============
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
      s.screenW = r.width; s.screenH = r.height
      updateLayout()
    }
    resize()
    window.addEventListener('resize', resize)

    function loop(ts) {
      if (!lastTimeRef.current) lastTimeRef.current = ts
      const dt = Math.min((ts - lastTimeRef.current) / 1000, 0.05)
      lastTimeRef.current = ts
      if (!paused) updatePhysics(dt)
      drawFrame(ctx)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      window.removeEventListener('resize', resize)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [paused])

  function updateLayout() {
    const s = sim.current
    const w = s.screenW, h = s.screenH
    const theta = s.rampAngle * Math.PI / 180
    // 斜面从左下到右上
    const marginL = 100, marginR = 80, marginB = 120, marginT = 60
    const availW = w - marginL - marginR
    const availH = h - marginB - marginT
    // 斜面长度像素
    const rampPx = Math.min(availW / Math.cos(theta), availH / Math.sin(theta)) * 0.9
    s.scale = rampPx / s.rampLength
    s.rampStartX = marginL
    s.rampStartY = h - marginB
    s.rampEndX = marginL + rampPx * Math.cos(theta)
    s.rampEndY = h - marginB - rampPx * Math.sin(theta)
  }

  function updatePhysics(dt) {
    const s = sim.current
    if (!s.moving) return
    const a = getAccel()
    s.carVel += a * dt
    s.carPos += s.carVel * dt
    s.timeElapsed += dt

    // 到达终点：立刻停止，精确卡在终点位置
    if (s.carPos >= s.endX) {
      s.carPos = s.endX
      s.carVel = 0
      s.moving = false
      s.finished = true
      s.timing = false
      setMoving(false)
      // 记录数据
      const dist = parseFloat((s.endX - s.startX).toFixed(3))
      const t = parseFloat(s.timeElapsed.toFixed(3))
      const v = t > 0 ? parseFloat((dist / t).toFixed(3)) : 0
      s.trials.push({ s: dist, t, v })
      setTrials([...s.trials])
      triggerRender()
      return
    }
    triggerRender()
  }

  // ============ 绘制 ============
  function drawFrame(ctx) {
    const s = sim.current
    const w = s.screenW, h = s.screenH
    if (!w || !h) return

    // 背景
    ctx.fillStyle = C.bg
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1
    for (let gx = 0; gx < w; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke() }
    for (let gy = 0; gy < h; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke() }

    drawRamp(ctx)
    drawRuler(ctx)
    drawStartEnd(ctx)
    drawCar(ctx)
    drawTimer(ctx)
    drawInfo(ctx)
  }

  function rampPoint(m) {
    // 沿斜面距离 m → 屏幕坐标
    const s = sim.current
    const theta = s.rampAngle * Math.PI / 180
    const px = m * s.scale
    return [
      s.rampStartX + px * Math.cos(theta),
      s.rampStartY - px * Math.sin(theta)
    ]
  }

  function drawRamp(ctx) {
    const s = sim.current
    const [x1, y1] = [s.rampStartX, s.rampStartY]
    const [x2, y2] = [s.rampEndX, s.rampEndY]

    // 斜面轨道
    const theta = s.rampAngle * Math.PI / 180
    const thick = 8
    const nx = -Math.sin(theta) * thick, ny = -Math.cos(theta) * thick

    ctx.fillStyle = C.rampTop
    ctx.beginPath()
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2)
    ctx.lineTo(x2 + nx, y2 + ny); ctx.lineTo(x1 + nx, y1 + ny)
    ctx.closePath(); ctx.fill()

    ctx.strokeStyle = C.ramp; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()

    // 轨道底面
    ctx.fillStyle = '#2d3748'
    ctx.beginPath()
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2)
    ctx.lineTo(x2, y2 + 12); ctx.lineTo(x1, y1 + 12)
    ctx.closePath(); ctx.fill()

    // 支架
    ctx.strokeStyle = '#4a5568'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1, y1 + 40); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x1 - 20, y1 + 40); ctx.lineTo(x1 + 20, y1 + 40); ctx.stroke()

    // 角度标注
    const arcR = 50
    ctx.strokeStyle = C.warn; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3])
    ctx.beginPath(); ctx.moveTo(x1 + arcR, y1); ctx.arc(x1, y1, arcR, 0, -theta, true); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = C.warn; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText(`${s.rampAngle}°`, x1 + arcR + 8, y1 - 8)

    // 水平参考虚线
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1; ctx.setLineDash([6, 4])
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 + 200, y1); ctx.stroke()
    ctx.setLineDash([])
  }

  function drawRuler(ctx) {
    const s = sim.current
    const theta = s.rampAngle * Math.PI / 180
    const cosT = Math.cos(theta), sinT = Math.sin(theta)

    // 刻度沿斜面绘制
    const cmPx = s.scale * 0.01
    const [ox, oy] = [s.rampStartX, s.rampStartY]

    ctx.font = '9px sans-serif'; ctx.textAlign = 'center'
    const maxCm = Math.floor(s.rampLength * 100)

    for (let cm = 0; cm <= maxCm; cm += 1) {
      const px = cm * cmPx
      const x = ox + px * cosT
      const y = oy - px * sinT
      const major = cm % 10 === 0
      const mid = cm % 5 === 0

      if (!major && !mid) continue

      // 刻度线（垂直于斜面方向）
      const tickLen = major ? 12 : 6
      const nx = -sinT, ny = -cosT
      ctx.strokeStyle = major ? C.rulerMajor : C.rulerTick
      ctx.lineWidth = major ? 1.5 : 0.8
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + nx * tickLen, y + ny * tickLen)
      ctx.stroke()

      if (major && cm > 0) {
        ctx.fillStyle = C.rulerMajor
        ctx.fillText(`${cm}`, x + nx * (tickLen + 10), y + ny * (tickLen + 10) + 3)
      }
    }

    // 0 标注
    ctx.fillStyle = C.accent; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('0', ox - 15, oy + 18)
    ctx.fillText('cm', ox - 15, oy + 30)
  }

  function drawStartEnd(ctx) {
    const s = sim.current
    const [sx, sy] = rampPoint(s.startX)
    const [ex, ey] = rampPoint(s.endX)
    const theta = s.rampAngle * Math.PI / 180

    // 起点旗
    ctx.fillStyle = C.startFlag
    ctx.beginPath()
    ctx.moveTo(sx, sy - 40); ctx.lineTo(sx + 20, sy - 32); ctx.lineTo(sx, sy - 24)
    ctx.closePath(); ctx.fill()
    ctx.strokeStyle = C.startFlag; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - 42); ctx.stroke()
    ctx.fillStyle = C.startFlag; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('起点', sx, sy - 46)

    // 终点旗
    ctx.fillStyle = C.endFlag
    ctx.beginPath()
    ctx.moveTo(ex, ey - 40); ctx.lineTo(ex + 20, ey - 32); ctx.lineTo(ex, ey - 24)
    ctx.closePath(); ctx.fill()
    ctx.strokeStyle = C.endFlag; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex, ey - 42); ctx.stroke()
    ctx.fillStyle = C.endFlag; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('终点', ex, ey - 46)

    // 距离标注 s（放在斜面下方）
    const midX = (sx + ex) / 2, midY = (sy + ey) / 2
    const nx = Math.sin(theta), ny = Math.cos(theta)
    const dist = s.endX - s.startX
    ctx.fillStyle = C.warn; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'
    ctx.fillText(`s = ${dist.toFixed(3)} m`, midX + nx * 35, midY + ny * 35)

    // 拖拽手柄（起点/终点可拖拽调整位置）
    drawHandle(ctx, sx, sy, C.startFlag, 'S')
    drawHandle(ctx, ex, ey, C.endFlag, 'E')
  }

  function drawHandle(ctx, x, y, color, label) {
    ctx.fillStyle = color
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(label, x, y)
    ctx.textBaseline = 'alphabetic'
  }

  function drawCar(ctx) {
    const s = sim.current
    const [cx, cy] = rampPoint(s.carPos)
    const theta = s.rampAngle * Math.PI / 180

    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(-theta)

    // 车身
    const bw = 36, bh = 18
    ctx.fillStyle = s.finished ? '#22c55e' : C.car
    ctx.beginPath()
    roundedRect(ctx, -bw / 2, -bh - 6, bw, bh, 4)
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1
    ctx.beginPath()
    roundedRect(ctx, -bw / 2, -bh - 6, bw, bh, 4)
    ctx.stroke()

    // 车窗
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.fillRect(-bw / 2 + 4, -bh - 3, bw * 0.4, bh * 0.5)

    // 车轮
    ctx.fillStyle = C.carWheel
    ctx.beginPath(); ctx.arc(-10, 0, 5, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(10, 0, 5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#555'
    ctx.beginPath(); ctx.arc(-10, 0, 2, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(10, 0, 2, 0, Math.PI * 2); ctx.fill()

    ctx.restore()

    // 速度标注
    if (s.moving || s.finished) {
      const vel = s.finished ? (s.endX - s.startX) / s.timeElapsed : s.carVel
      ctx.fillStyle = C.text; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'
      ctx.fillText(`v = ${vel.toFixed(2)} m/s`, cx, cy - 50)
    }
  }

  function drawTimer(ctx) {
    const s = sim.current
    const x = s.screenW - 160, y = 30

    // 秒表外壳
    ctx.fillStyle = 'rgba(30,35,45,0.95)'
    ctx.beginPath(); roundedRect(ctx, x, y, 140, 80, 10); ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1
    ctx.beginPath(); roundedRect(ctx, x, y, 140, 80, 10); ctx.stroke()

    // 标题
    ctx.fillStyle = C.subText; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('⏱ 秒表', x + 70, y + 18)

    // 时间显示
    const t = s.timeElapsed
    const min = Math.floor(t / 60)
    const sec = (t % 60).toFixed(3)
    ctx.fillStyle = s.timing ? '#ef4444' : C.text
    ctx.font = 'bold 28px monospace'
    ctx.fillText(`${min}:${sec.padStart(5, '0')}`, x + 70, y + 50)

    // 状态
    ctx.fillStyle = s.moving ? '#22c55e' : (s.finished ? C.accent : C.subText)
    ctx.font = '11px sans-serif'
    ctx.fillText(s.moving ? '● 计时中...' : (s.finished ? '✓ 到达终点' : '就绪'), x + 70, y + 72)
  }

  function drawInfo(ctx) {
    const s = sim.current
    const x = 20, y = 30

    ctx.fillStyle = 'rgba(30,35,45,0.9)'
    ctx.beginPath(); roundedRect(ctx, x, y, 200, 100, 8); ctx.fill()

    const a = getAccel()
    const lines = [
      { l: '斜面角度 θ', v: `${s.rampAngle}°`, c: C.warn },
      { l: '加速度 a', v: `${a.toFixed(3)} m/s²`, c: '#22c55e' },
      { l: '位移 s', v: `${(s.endX - s.startX).toFixed(3)} m`, c: C.accent },
      { l: '摩擦系数 μ', v: `${s.friction.toFixed(3)}`, c: C.subText },
    ]

    ctx.font = '11px monospace'; ctx.textAlign = 'left'
    lines.forEach((l, i) => {
      const ly = y + 22 + i * 20
      ctx.fillStyle = C.subText; ctx.fillText(l.l + ' =', x + 10, ly)
      ctx.fillStyle = l.c; ctx.font = 'bold 12px monospace'
      ctx.fillText(l.v, x + 110, ly)
      ctx.font = '11px monospace'
    })
  }

  function roundedRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y)
    ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r)
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h)
    ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r)
    ctx.arcTo(x, y, x + r, y, r); ctx.closePath()
  }

  // ============ 交互 ============
  function getPos(e) {
    const r = canvasRef.current.getBoundingClientRect()
    return [(e.touches ? e.touches[0].clientX : e.clientX) - r.left,
            (e.touches ? e.touches[0].clientY : e.clientY) - r.top]
  }

  // 屏幕坐标 → 沿斜面距离 m
  function screenToRampDist(sx, sy) {
    const s = sim.current
    const dx = sx - s.rampStartX, dy = s.rampStartY - sy
    const theta = s.rampAngle * Math.PI / 180
    return (dx * Math.cos(theta) + dy * Math.sin(theta)) / s.scale
  }

  const handlePointerDown = useCallback((e) => {
    const [sx, sy] = getPos(e)
    const s = sim.current
    if (s.moving) return

    const [stx, sty] = rampPoint(s.startX)
    const [enx, eny] = rampPoint(s.endX)

    if (Math.hypot(sx - stx, sy - sty) < 15) {
      s.dragging = 'start'; e.preventDefault(); return
    }
    if (Math.hypot(sx - enx, sy - eny) < 15) {
      s.dragging = 'end'; e.preventDefault(); return
    }
  }, [])

  const handlePointerMove = useCallback((e) => {
    const [sx, sy] = getPos(e)
    const s = sim.current
    if (!s.dragging) return

    const dist = screenToRampDist(sx, sy)
    const clamped = Math.max(0.05, Math.min(s.rampLength - 0.05, dist))

    if (s.dragging === 'start') {
      s.startX = Math.min(clamped, s.endX - 0.10)
      setStartPos(s.startX)
    } else if (s.dragging === 'end') {
      s.endX = Math.max(clamped, s.startX + 0.10)
      setEndPos(s.endX)
    }
    triggerRender()
    e.preventDefault()
  }, [triggerRender])

  const handlePointerUp = useCallback(() => {
    sim.current.dragging = null
  }, [])

  // ============ 操作 ============
  function handleStart() {
    const s = sim.current
    if (s.moving) return
    s.carPos = s.startX
    s.carVel = 0
    s.timeElapsed = 0
    s.moving = true
    s.finished = false
    s.timing = true
    setMoving(true)
  }

  function handleReset() {
    const s = sim.current
    s.carPos = s.startX
    s.carVel = 0
    s.timeElapsed = 0
    s.moving = false
    s.finished = false
    s.timing = false
    s.trials = []
    setMoving(false)
    setTrials([])
    triggerRender()
  }

  function handleClearTrials() {
    sim.current.trials = []
    setTrials([])
  }

  function handleAngleChange(v) {
    const s = sim.current
    s.rampAngle = v
    setAngle(v)
    updateLayout()
    handleReset()
  }

  function handleFrictionChange(v) {
    sim.current.friction = v
    triggerRender()
  }

  // 平均值计算：按位移s分组，只对同组内时间求平均
  function getGroupedAverages() {
    if (trials.length === 0) return null
    // 按s分组（四舍五入到0.001m避免浮点误差）
    const groups = {}
    trials.forEach(t => {
      const key = t.s.toFixed(3)
      if (!groups[key]) groups[key] = { s: t.s, times: [] }
      groups[key].times.push(t.t)
    })
    // 取最新一组（最后一组）
    const keys = Object.keys(groups)
    const latestKey = keys[keys.length - 1]
    const group = groups[latestKey]
    const avgT = group.times.reduce((a, b) => a + b, 0) / group.times.length
    const avgV = group.s / avgT
    return { s: group.s, avgT, avgV, count: group.times.length, groupCount: keys.length }
  }

  const avgs = getGroupedAverages()

  // ============ 渲染 ============
  return (
    <div style={st.page}>
      <div style={st.header}>
        <span style={st.headerTitle}>📏 测量平均速度</span>
        <span style={st.headerSub}>v = s / t | 斜面小车实验</span>
      </div>

      <div style={st.main}>
        {/* 左面板 */}
        <div style={st.leftPanel}>
          <div style={st.section}>
            <div style={st.sectionTitle}>⚙️ 实验参数</div>
            <div style={st.controlRow}>
              <span style={st.controlLabel}>斜面角度 θ</span>
              <input type="range" min={5} max={45} step={1} value={angle} style={st.slider}
                onChange={e => handleAngleChange(+e.target.value)} />
              <span style={st.sliderVal}>{angle}°</span>
            </div>
            <div style={st.controlRow}>
              <span style={st.controlLabel}>摩擦系数 μ</span>
              <input type="range" min={0} max={0.10} step={0.005} value={sim.current.friction} style={st.slider}
                onChange={e => handleFrictionChange(+e.target.value)} />
              <span style={st.sliderVal}>{sim.current.friction.toFixed(3)}</span>
            </div>
          </div>

          <div style={st.section}>
            <div style={st.sectionTitle}>🏁 起止点位置</div>
            <div style={st.controlRow}>
              <span style={st.controlLabel}>起点</span>
              <input type="range" min={0.05} max={1.90} step={0.01} value={startPos} style={st.slider}
                onChange={e => { const v = +e.target.value; sim.current.startX = v; setStartPos(v); triggerRender() }} />
              <span style={st.sliderVal}>{startPos.toFixed(2)}m</span>
            </div>
            <div style={st.controlRow}>
              <span style={st.controlLabel}>终点</span>
              <input type="range" min={0.10} max={1.95} step={0.01} value={endPos} style={st.slider}
                onChange={e => { const v = +e.target.value; sim.current.endX = v; setEndPos(v); triggerRender() }} />
              <span style={st.sliderVal}>{endPos.toFixed(2)}m</span>
            </div>
            <div style={{ fontSize: 11, color: C.accent, marginTop: 4 }}>
              测量距离 s = {(endPos - startPos).toFixed(2)} m
            </div>
          </div>

          <div style={st.section}>
            <div style={st.sectionTitle}>🎮 控制</div>
            <div style={st.btnRow}>
              <button style={{ ...st.btn, background: moving ? '#4a5568' : '#22c55e', color: moving ? '#9ca3af' : '#fff', cursor: moving ? 'not-allowed' : 'pointer', opacity: moving ? 0.6 : 1 }}
                onClick={handleStart} disabled={moving}>
                {moving ? '⏳ 运动中...' : '▶ 释放小车'}
              </button>
              <button style={{ ...st.btn, background: '#ef4444', color: '#fff' }} onClick={handleReset}>
                ↺ 重置
              </button>
            </div>
          </div>

          {/* 数据表格 */}
          <div style={st.section}>
            <div style={st.sectionTitle}>📋 实验数据</div>
            <div style={st.tableScroll}>
              <table style={st.table}>
                <thead>
                  <tr>
                    <th style={st.th}>#</th>
                    <th style={st.th}>s (m)</th>
                    <th style={st.th}>t (s)</th>
                    <th style={st.th}>v (m/s)</th>
                  </tr>
                </thead>
                <tbody>
                  {trials.length === 0 ? (
                    <tr><td colSpan={4} style={st.emptyTd}>暂无数据</td></tr>
                  ) : trials.map((t, i) => (
                    <tr key={i} style={i % 2 === 0 ? st.trEven : st.trOdd}>
                      <td style={st.td}>{i + 1}</td>
                      <td style={st.tdNum}>{t.s.toFixed(3)}</td>
                      <td style={st.tdNum}>{t.t.toFixed(3)}</td>
                      <td style={st.tdNum}>{t.v.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {avgs && (
              <div style={st.avgBox}>
                <div style={st.avgTitle}>📊 平均值（s={avgs.s.toFixed(3)}m，{avgs.count}次测量，共{avgs.groupCount}组）</div>
                <div style={st.avgRow}>
                  <span style={st.avgLabel}>位移 s</span>
                  <span style={st.avgVal}>{avgs.s.toFixed(3)} m</span>
                </div>
                <div style={st.avgRow}>
                  <span style={st.avgLabel}>平均时间 t̄</span>
                  <span style={st.avgVal}>{avgs.avgT.toFixed(3)} s</span>
                </div>
                <div style={st.avgRow}>
                  <span style={st.avgLabel}>平均速度 v̄</span>
                  <span style={{ ...st.avgVal, color: '#22c55e', fontWeight: 700 }}>{avgs.avgV.toFixed(3)} m/s</span>
                </div>
              </div>
            )}
            <div style={st.btnRow}>
              <button style={{ ...st.btn, background: '#374151', color: C.subText }} onClick={handleClearTrials}>
                🗑 清空数据
              </button>
            </div>
          </div>
        </div>

        {/* 画布 */}
        <div style={st.canvasWrap}>
          <canvas ref={canvasRef} style={st.canvas}
            onMouseDown={handlePointerDown} onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp} onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown} onTouchMove={handlePointerMove} onTouchEnd={handlePointerUp}
            onContextMenu={e => e.preventDefault()} />
        </div>

        {/* 右面板 */}
        <div style={st.rightPanel}>
          <div style={st.section}>
            <div style={st.formulaBox}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.subText, marginBottom: 4 }}>📐 平均速度公式</div>
              <div style={{ color: '#22c55e', fontSize: 18, fontFamily: 'serif', fontWeight: 'bold' }}>v = s / t</div>
              <div style={{ color: C.subText, fontSize: 11, marginTop: 4 }}>s：位移（m） t：时间（s）</div>
            </div>
          </div>

          <div style={st.section}>
            <div style={st.sectionTitle}>💡 实验提示</div>
            <div style={{ fontSize: 11, color: C.subText, lineHeight: 1.8 }}>
              <div>1. 拖拽绿色/红色旗标调整起点和终点位置</div>
              <div>2. 调节斜面角度和摩擦系数</div>
              <div>3. 点击【释放小车】开始实验</div>
              <div>4. 小车到达终点自动记录数据</div>
              <div>5. 同一路程多次测量时间求平均值减小误差</div>
              <div>6. 改变路程可得到不同的平均速度</div>
            </div>
          </div>

          <div style={st.section}>
            <div style={st.sectionTitle}>📊 实时数据</div>
            {[
              { l: '当前速度 v', v: `${(moving ? sim.current.carVel : (sim.current.finished ? (endPos - startPos) / Math.max(sim.current.timeElapsed, 0.001) : 0)).toFixed(3)} m/s`, c: '#22c55e' },
              { l: '当前位移', v: `${Math.max(0, sim.current.carPos - startPos).toFixed(3)} m`, c: C.accent },
              { l: '已用时间', v: `${sim.current.timeElapsed.toFixed(3)} s`, c: C.warn },
              { l: '实验次数', v: `${trials.length}`, c: C.text },
            ].map(d => (
              <div key={d.l} style={st.dataRow}>
                <span style={st.dataLabel}>{d.l}</span>
                <span style={{ ...st.dataValue, color: d.c }}>{d.v}</span>
              </div>
            ))}
          </div>

          <div style={st.section}>
            <div style={st.sectionTitle}>🔧 实验原理</div>
            <div style={{ fontSize: 11, color: C.subText, lineHeight: 1.6 }}>
              <div>• 斜面上小车做匀加速直线运动</div>
              <div>• a = g·sinθ - μg·cosθ</div>
              <div>• 多次测量取平均值减小偶然误差</div>
              <div>• v̄ = s/t 即为该段的平均速度</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============ 样式 ============
const st = {
  page: { display: 'flex', flexDirection: 'column', width: '100%', height: '100vh', background: '#0d1117', color: '#e5e7eb', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace', overflow: 'hidden', userSelect: 'none' },
  header: { height: 44, flexShrink: 0, background: 'linear-gradient(135deg, #1e3a5f, #0d47a1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.3)', zIndex: 20 },
  headerTitle: { color: '#fff', fontSize: 15, fontWeight: 700 },
  headerSub: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  main: { display: 'flex', flex: 1, overflow: 'hidden' },
  canvasWrap: { flex: 1, position: 'relative', overflow: 'hidden' },
  canvas: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', touchAction: 'none' },
  leftPanel: { width: 280, flexShrink: 0, background: 'rgba(22,27,34,0.95)', borderRight: '1px solid rgba(255,255,255,0.06)', padding: '14px 12px', overflowY: 'auto', zIndex: 10 },
  rightPanel: { width: 220, flexShrink: 0, background: 'rgba(22,27,34,0.95)', borderLeft: '1px solid rgba(255,255,255,0.06)', padding: '14px 12px', overflowY: 'auto', zIndex: 10 },
  section: { marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.06)' },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 8, letterSpacing: 0.5 },
  controlRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  controlLabel: { fontSize: 11, color: '#9ca3af', minWidth: 70, fontWeight: 600 },
  slider: { flex: 1, accentColor: '#3b82f6', height: 4 },
  sliderVal: { fontSize: 11, fontWeight: 600, color: '#60a5fa', minWidth: 50, textAlign: 'right', fontFamily: 'monospace' },
  btnRow: { display: 'flex', gap: 6, marginTop: 8 },
  btn: { flex: 1, border: 'none', borderRadius: 6, padding: '8px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600 },
  formulaBox: { background: 'rgba(37,99,235,0.08)', borderRadius: 8, padding: '10px 14px', borderLeft: '3px solid #2563eb' },
  tableScroll: { maxHeight: 180, overflowY: 'auto', marginBottom: 8 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 11 },
  th: { background: '#21262d', color: '#8b949e', padding: '6px 8px', textAlign: 'center', fontWeight: 600, borderBottom: '1px solid #30363d', position: 'sticky', top: 0 },
  td: { padding: '5px 8px', textAlign: 'center', borderBottom: '1px solid #21262d' },
  tdNum: { padding: '5px 8px', textAlign: 'right', borderBottom: '1px solid #21262d', fontFamily: 'monospace' },
  emptyTd: { padding: 16, textAlign: 'center', color: '#484f58', fontStyle: 'italic' },
  trEven: { background: 'rgba(255,255,255,0.02)' },
  trOdd: { background: 'transparent' },
  avgBox: { background: 'rgba(34,197,94,0.08)', borderRadius: 8, padding: '10px 12px', borderLeft: '3px solid #22c55e', marginBottom: 8 },
  avgTitle: { fontSize: 11, fontWeight: 700, color: '#22c55e', marginBottom: 6 },
  avgRow: { display: 'flex', justifyContent: 'space-between', padding: '3px 0' },
  avgLabel: { fontSize: 11, color: '#9ca3af' },
  avgVal: { fontSize: 12, fontWeight: 600, fontFamily: 'monospace', color: '#e5e7eb' },
  dataRow: { display: 'flex', justifyContent: 'space-between', padding: '4px 0' },
  dataLabel: { fontSize: 11, color: '#6b7280' },
  dataValue: { fontSize: 12, fontWeight: 600, fontFamily: 'monospace' },
}
