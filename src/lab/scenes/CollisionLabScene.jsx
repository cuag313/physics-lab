import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * CollisionLabScene — 碰撞实验室（PhET风格一维碰撞仿真）
 *
 * 与 CollisionLab.html 共享同一套物理引擎和渲染逻辑
 */

// ================================================================
//  物理核心：动量守恒 + 恢复系数
//  碰撞公式（恢复系数 e）：
//    v1' = (m1*v1 + m2*v2 + m2*e*(v2-v1)) / (m1+m2)
//    v2' = (m1*v1 + m2*v2 + m1*e*(v1-v2)) / (m1+m2)
// ================================================================

const W = 800, H = 280
const X0 = 40, X1 = W - 40
const PXM = (X1 - X0) / 10
const TRACK_Y = H * 0.5
const BALL_R_BASE = 14, BALL_R_SCALE = 8
const ballR = m => BALL_R_BASE + Math.cbrt(m) * BALL_R_SCALE
const w2s = wx => X0 + wx * PXM
const s2w = sx => (sx - X0) / PXM

function makeBall(m, x, v, color, label) {
  return { m, x, v, color, label, r: m * 0.18, dp: 0 }
}
function snap(balls) { return JSON.parse(JSON.stringify(balls)) }

function lighten(h, p) { const n = parseInt(h.slice(1), 16); return `rgb(${Math.min(255, (n >> 16) + Math.round(255 * p / 100))},${Math.min(255, ((n >> 8) & 0xff) + Math.round(255 * p / 100))},${Math.min(255, (n & 0xff) + Math.round(255 * p / 100))})` }
function darken(h, p) { const n = parseInt(h.slice(1), 16); return `rgb(${Math.max(0, (n >> 16) - Math.round(255 * p / 100))},${Math.max(0, ((n >> 8) & 0xff) - Math.round(255 * p / 100))},${Math.max(0, (n & 0xff) - Math.round(255 * p / 100))})` }

export default function CollisionLabScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const rendererRef = useRef(null)

  const ballsRef = useRef([
    makeBall(1, 2.5, 1.5, '#00BCD4', '1'),
    makeBall(1, 7.5, -1.5, '#E91E63', '2'),
  ])
  const initSnapRef = useRef(snap(ballsRef.current))
  const stateRef = useRef({ eCoeff: 1.0, simT: 0, running: false, DT: 1 / 180 })
  const interRef = useRef({ mode: null, target: null, dragOff: 0 })

  const [running, setRunning] = useState(false)
  const [eCoeff, setECoeff] = useState(1.0)
  const [simT, setSimT] = useState(0)
  const [showVel, setShowVel] = useState(true)
  const [showMom, setShowMom] = useState(false)
  const [showKE, setShowKE] = useState(false)
  const [showCOM, setShowCOM] = useState(false)
  const [showVals, setShowVals] = useState(false)
  const [, forceUpdate] = useState(0)

  // ========== 物理 ==========
  const physicsStep = useCallback(() => {
    const s = stateRef.current
    const balls = ballsRef.current
    const b1 = balls[0], b2 = balls[1]
    const v1b = b1.v, v2b = b2.v
    const gap = b1.r + b2.r
    const subSteps = 5, subDT = s.DT / subSteps

    for (let i = 0; i < subSteps; i++) {
      b1.x += b1.v * subDT
      b2.x += b2.v * subDT
      const dx = b2.x - b1.x
      if (Math.abs(dx) < gap) {
        const relV = b1.v - b2.v
        if ((dx > 0 && relV > 0) || (dx < 0 && relV < 0)) {
          const overlap = gap - Math.abs(dx)
          if (dx > 0) { b1.x -= overlap / 2; b2.x += overlap / 2 } else { b1.x += overlap / 2; b2.x -= overlap / 2 }
          const m1 = b1.m, m2 = b2.m, e = s.eCoeff
          const v1n = (m1 * v1b + m2 * v2b + m2 * e * (v2b - v1b)) / (m1 + m2)
          const v2n = (m1 * v1b + m2 * v2b + m1 * e * (v1b - v2b)) / (m1 + m2)
          b1.dp = m1 * (v1n - v1b); b2.dp = m2 * (v2n - v2b)
          b1.v = v1n; b2.v = v2n
          break
        }
      }
    }

    for (const b of balls) {
      if (b.x - b.r < 0) { b.x = b.r; b.v = Math.abs(b.v) }
      if (b.x + b.r > 10) { b.x = 10 - b.r; b.v = -Math.abs(b.v) }
    }
    s.simT += s.DT
  }, [])

  // ========== 渲染 ==========
  const renderFrame = useCallback(() => {
    const renderer = rendererRef.current
    if (!renderer) return
    const ctx = renderer.ctx
    const scale = renderer.screenW / W
    ctx.save()
    ctx.scale(scale, scale)

    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H)
    drawTrack(ctx)

    if (showCOM) {
      const b1 = ballsRef.current[0], b2 = ballsRef.current[1]
      const com = (b1.m * b1.x + b2.m * b2.x) / (b1.m + b2.m)
      const csx = w2s(com)
      ctx.strokeStyle = '#FF9800'; ctx.lineWidth = 2; ctx.setLineDash([5, 4])
      ctx.beginPath(); ctx.moveTo(csx, TRACK_Y - 55); ctx.lineTo(csx, TRACK_Y + 25); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#FF9800'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('质心', csx, TRACK_Y - 58)
    }
    for (const b of ballsRef.current) drawBall(ctx, b)
    if (showVel) for (const b of ballsRef.current) { const R = ballR(b.m); drawArrow(ctx, b, b.v * 35, '#4CAF50', `v=${b.v.toFixed(2)}`, -R - 14) }
    if (showMom) for (const b of ballsRef.current) { const R = ballR(b.m); drawArrow(ctx, b, b.m * b.v * 22, '#2196F3', `p=${(b.m * b.v).toFixed(2)}`, -R - 32) }
    if (showKE) {
      const bl = ballsRef.current
      const maxEk = Math.max(0.5 * bl[0].m * bl[0].v ** 2, 0.5 * bl[1].m * bl[1].v ** 2, 1)
      for (let i = 0; i < 2; i++) {
        const b = bl[i]; const ek = 0.5 * b.m * b.v * b.v
        const bh = (ek / maxEk) * 40; const bsx = w2s(b.x) - 12; const by = TRACK_Y + 28
        ctx.fillStyle = i === 0 ? 'rgba(0,188,212,0.45)' : 'rgba(233,30,99,0.45)'
        ctx.fillRect(bsx, by - bh, 24, bh)
        ctx.fillStyle = '#555'; ctx.font = '9px monospace'; ctx.textAlign = 'center'
        ctx.fillText(`${ek.toFixed(2)}J`, bsx + 12, by + 12)
      }
    }
    if (showVals) {
      const b1 = ballsRef.current[0], b2 = ballsRef.current[1]
      const p1 = b1.m * b1.v, p2 = b2.m * b2.v, ek1 = 0.5 * b1.m * b1.v ** 2, ek2 = 0.5 * b2.m * b2.v ** 2
      ctx.fillStyle = 'rgba(255,255,255,0.93)'
      ctx.beginPath(); ctx.roundRect(W - 260, 6, 254, 68, 5); ctx.fill()
      ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.roundRect(W - 260, 6, 254, 68, 5); ctx.stroke()
      ctx.font = '11px Consolas,monospace'; ctx.textAlign = 'left'
      ctx.fillStyle = '#00838F'
      ctx.fillText(`球1: m=${b1.m.toFixed(1)} v=${b1.v.toFixed(2)} p=${p1.toFixed(2)} Ek=${ek1.toFixed(2)}`, W - 254, 22)
      ctx.fillStyle = '#C2185B'
      ctx.fillText(`球2: m=${b2.m.toFixed(1)} v=${b2.v.toFixed(2)} p=${p2.toFixed(2)} Ek=${ek2.toFixed(2)}`, W - 254, 38)
      ctx.fillStyle = '#555'
      ctx.fillText(`总: p=${(p1 + p2).toFixed(3)} Ek=${(ek1 + ek2).toFixed(3)} e=${stateRef.current.eCoeff.toFixed(2)}`, W - 254, 56)
    }

    ctx.restore()
    setSimT(stateRef.current.simT)
  }, [showVel, showMom, showKE, showCOM, showVals])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const renderer = {
      canvas, ctx: canvas.getContext('2d'), screenW: 0, screenH: 0,
      resize() {
        const rect = canvas.getBoundingClientRect()
        canvas.width = rect.width * devicePixelRatio
        canvas.height = rect.height * devicePixelRatio
        this.ctx.scale(devicePixelRatio, devicePixelRatio)
        this.screenW = rect.width; this.screenH = rect.height
      },
    }
    renderer.resize(); rendererRef.current = renderer

    const loop = () => {
      if (stateRef.current.running) for (let i = 0; i < 3; i++) physicsStep()
      renderFrame()
      animRef.current = requestAnimationFrame(loop)
    }
    loop()

    const handleResize = () => renderer.resize()
    window.addEventListener('resize', handleResize)
    return () => { window.removeEventListener('resize', handleResize); if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [physicsStep, renderFrame])

  // ========== Canvas绑定 ==========
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const getXY = (e) => {
      const r = canvas.getBoundingClientRect()
      const scale = rendererRef.current.screenW / W
      return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale]
    }

    const onDown = (e) => {
      const [sx, sy] = getXY(e)
      for (let i = 0; i < 2; i++) {
        const b = ballsRef.current[i], R = ballR(b.m), bx = w2s(b.x), by = TRACK_Y - R
        const aEnd = bx + b.v * 35
        if (Math.abs(sy - (by - 14 - R)) < 14 && sx >= Math.min(bx, aEnd) - 8 && sx <= Math.max(bx, aEnd) + 8) {
          interRef.current = { mode: 'v', target: i, dragOff: 0 }; return
        }
        if (Math.hypot(sx - bx, sy - by) < R + 6) {
          interRef.current = { mode: 'b', target: i, dragOff: sx - bx }; return
        }
      }
    }

    const onMove = (e) => {
      const [sx, sy] = getXY(e)
      const inter = interRef.current
      if (!inter.mode) {
        let hov = false
        for (const b of ballsRef.current) {
          const R = ballR(b.m), bx = w2s(b.x), by = TRACK_Y - R
          const aEnd = bx + b.v * 35
          if (Math.abs(sy - (by - 14 - R)) < 14 && sx >= Math.min(bx, aEnd) - 8 && sx <= Math.max(bx, aEnd) + 8) { hov = true; break }
          if (Math.hypot(sx - bx, sy - by) < R + 6) { hov = true; break }
        }
        canvas.style.cursor = hov ? 'grab' : 'default'; return
      }
      if (inter.mode === 'b') {
        const b = ballsRef.current[inter.target]
        b.x = Math.max(b.r, Math.min(10 - b.r, s2w(sx - inter.dragOff)))
      } else if (inter.mode === 'v') {
        ballsRef.current[inter.target].v = Math.max(-10, Math.min(10, (sx - w2s(ballsRef.current[inter.target].x)) / 35))
        forceUpdate(n => n + 1)
      }
    }

    const onUp = () => { interRef.current = { mode: null, target: null, dragOff: 0 } }

    canvas.addEventListener('mousedown', onDown)
    canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('mouseup', onUp)
    canvas.addEventListener('mouseleave', onUp)
    return () => { canvas.removeEventListener('mousedown', onDown); canvas.removeEventListener('mousemove', onMove); canvas.removeEventListener('mouseup', onUp); canvas.removeEventListener('mouseleave', onUp) }
  }, [])

  // ========== 控制 ==========
  const togglePlay = useCallback(() => {
    stateRef.current.running = !stateRef.current.running
    setRunning(stateRef.current.running)
  }, [])

  const doSet = useCallback(() => {
    stateRef.current.running = false; setRunning(false)
    stateRef.current.simT = 0; setSimT(0)
    stateRef.current.eCoeff = 1.0; setECoeff(1.0)
    ballsRef.current = [makeBall(1, 2.5, 1.5, '#00BCD4', '1'), makeBall(1, 7.5, -1.5, '#E91E63', '2')]
    initSnapRef.current = snap(ballsRef.current)
    forceUpdate(n => n + 1)
  }, [])

  const doStep = useCallback(() => {
    stateRef.current.running = false; setRunning(false)
    for (let i = 0; i < 3; i++) physicsStep()
    forceUpdate(n => n + 1)
  }, [physicsStep])

  const handleECoeff = useCallback((val) => {
    stateRef.current.eCoeff = val / 100; setECoeff(val / 100)
  }, [])

  const preset = useCallback((type) => {
    const mk = makeBall
    if (type === 'equal') ballsRef.current = [mk(1, 2.5, 2, '#00BCD4', '1'), mk(1, 7.5, -1, '#E91E63', '2')]
    if (type === 'heavy') ballsRef.current = [mk(4, 2, 1, '#00BCD4', '1'), mk(0.5, 8, -2, '#E91E63', '2')]
    if (type === 'small') ballsRef.current = [mk(0.5, 2, 3, '#00BCD4', '1'), mk(4, 8, 0, '#E91E63', '2')]
    if (type === 'same') ballsRef.current = [mk(1, 2, 3, '#00BCD4', '1'), mk(1, 5, 1, '#E91E63', '2')]
    initSnapRef.current = snap(ballsRef.current); forceUpdate(n => n + 1)
  }, [])

  const updateBall = useCallback((idx, prop, val) => {
    ballsRef.current[idx][prop] = val
    initSnapRef.current = snap(ballsRef.current)
    forceUpdate(n => n + 1)
  }, [])

  return (
    <div style={s.container}>
      {/* 工具栏 */}
      <div style={s.toolbar}>
        <span style={s.title}>碰撞实验室 — 一维碰撞</span>
        <div style={s.toolbarActions}>
          <button style={running ? s.pauseBtn : s.playBtn} onClick={togglePlay}>{running ? '⏸ 暂停' : '▶ 播放'}</button>
          <button style={s.setBtn} onClick={doSet}>⚙ Set</button>
          <div style={s.sep} />
          <button style={s.btn} onClick={doStep}>⏭</button>
          <div style={s.sep} />
          <span style={{ fontSize: 12, color: '#777' }}>弹性:</span>
          <input type="range" min="0" max="100" step="1" value={Math.round(eCoeff * 100)}
            onChange={(e) => handleECoeff(parseInt(e.target.value))}
            style={{ width: 80, accentColor: '#FF9800' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#E53935', minWidth: 32 }}>{Math.round(eCoeff * 100)}%</span>
          <span style={s.timer}>t = {simT.toFixed(3)} s</span>
        </div>
      </div>

      {/* 主区域 */}
      <div style={s.main}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />

        {/* 右侧面板 */}
        <div style={s.sidePanel}>
          <div style={s.panel}>
            <div style={s.panelTitle}>显示</div>
            <label style={s.chk}><input type="checkbox" checked={showVel} onChange={e => setShowVel(e.target.checked)} /> 速度</label>
            <label style={s.chk}><input type="checkbox" checked={showMom} onChange={e => setShowMom(e.target.checked)} /> 动量</label>
            <label style={s.chk}><input type="checkbox" checked={showKE} onChange={e => setShowKE(e.target.checked)} /> 动能</label>
            <label style={s.chk}><input type="checkbox" checked={showCOM} onChange={e => setShowCOM(e.target.checked)} /> 质心</label>
            <label style={s.chk}><input type="checkbox" checked={showVals} onChange={e => setShowVals(e.target.checked)} /> 数值</label>
          </div>
          <div style={s.panel}>
            <div style={s.panelTitle}>预设</div>
            <button style={s.presetBtn} onClick={() => preset('equal')}>等质量</button>
            <button style={s.presetBtn} onClick={() => preset('heavy')}>大撞小</button>
            <button style={s.presetBtn} onClick={() => preset('small')}>小撞大</button>
            <button style={s.presetBtn} onClick={() => preset('same')}>同向追碰</button>
          </div>
        </div>
      </div>

      {/* 参数面板 */}
      <div style={s.bottomRow}>
        <div style={s.params}>
          <div style={s.paramsTitle}>球 1（青色）</div>
          <div style={s.paramGroup}>
            <span style={{ ...s.lbl, color: '#00BCD4' }}>m₁</span>
            <input type="range" min="0.1" max="5" step="0.1" value={ballsRef.current[0].m}
              onChange={e => updateBall(0, 'm', parseFloat(e.target.value))} style={{ flex: 1 }} />
            <input type="number" min="0.1" max="10" step="0.1" value={ballsRef.current[0].m}
              onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updateBall(0, 'm', v) }} style={s.numInput} />
            <span style={s.unit}>kg</span>
          </div>
          <div style={s.paramGroup}>
            <span style={{ ...s.lbl, color: '#00BCD4' }}>v₁</span>
            <input type="range" min="-5" max="5" step="0.1" value={ballsRef.current[0].v}
              onChange={e => updateBall(0, 'v', parseFloat(e.target.value))} style={{ flex: 1 }} />
            <input type="number" min="-10" max="10" step="0.1" value={parseFloat(ballsRef.current[0].v.toFixed(1))}
              onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updateBall(0, 'v', v) }} style={s.numInput} />
            <span style={s.unit}>m/s</span>
          </div>
        </div>
        <div style={s.params}>
          <div style={s.paramsTitle}>球 2（粉色）</div>
          <div style={s.paramGroup}>
            <span style={{ ...s.lbl, color: '#E91E63' }}>m₂</span>
            <input type="range" min="0.1" max="5" step="0.1" value={ballsRef.current[1].m}
              onChange={e => updateBall(1, 'm', parseFloat(e.target.value))} style={{ flex: 1 }} />
            <input type="number" min="0.1" max="10" step="0.1" value={ballsRef.current[1].m}
              onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updateBall(1, 'm', v) }} style={s.numInput} />
            <span style={s.unit}>kg</span>
          </div>
          <div style={s.paramGroup}>
            <span style={{ ...s.lbl, color: '#E91E63' }}>v₂</span>
            <input type="range" min="-5" max="5" step="0.1" value={ballsRef.current[1].v}
              onChange={e => updateBall(1, 'v', parseFloat(e.target.value))} style={{ flex: 1 }} />
            <input type="number" min="-10" max="10" step="0.1" value={parseFloat(ballsRef.current[1].v.toFixed(1))}
              onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updateBall(1, 'v', v) }} style={s.numInput} />
            <span style={s.unit}>m/s</span>
          </div>
        </div>
      </div>

      {/* 实验说明 */}
      <div style={s.desc}>
        <b>实验：一维完全弹性对撞</b>
        <span style={{ marginLeft: 12, color: '#666', fontSize: 13 }}>两球质量相等，以大小相等方向相反速度发生完全弹性碰撞，观察碰撞后速度交换现象。</span>
      </div>
    </div>
  )
}

// ================================================================
//  Canvas绘制函数（与CollisionLab.html共享逻辑）
// ================================================================
function drawTrack(ctx) {
  const y = TRACK_Y
  ctx.strokeStyle = '#444'; ctx.lineWidth = 4
  ctx.beginPath(); ctx.moveTo(X0, y); ctx.lineTo(X1, y); ctx.stroke()
  ctx.lineWidth = 5
  ctx.beginPath(); ctx.moveTo(X0, y - 18); ctx.lineTo(X0, y + 18); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(X1, y - 18); ctx.lineTo(X1, y + 18); ctx.stroke()
  ctx.fillStyle = '#777'; ctx.font = '11px Consolas,monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  for (let m = 0; m <= 10; m++) {
    const sx = w2s(m); ctx.strokeStyle = '#aaa'; ctx.lineWidth = m % 5 === 0 ? 2 : 1
    const tl = m % 5 === 0 ? 12 : 6
    ctx.beginPath(); ctx.moveTo(sx, y + 2); ctx.lineTo(sx, y + 2 + tl); ctx.stroke()
    if (m % 2 === 0) ctx.fillText(`${m}`, sx, y + 16)
  }
  const rx1 = w2s(0.5), rx2 = w2s(1.0)
  ctx.strokeStyle = '#E91E63'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(rx1, y - 30); ctx.lineTo(rx2, y - 30); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(rx1, y - 36); ctx.lineTo(rx1, y - 24); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(rx2, y - 36); ctx.lineTo(rx2, y - 24); ctx.stroke()
  ctx.fillStyle = '#C2185B'; ctx.font = 'bold 11px sans-serif'
  ctx.fillText('0.5 m', (rx1 + rx2) / 2, y - 44)
}

function drawBall(ctx, b) {
  const sx = w2s(b.x), sy = TRACK_Y, R = ballR(b.m)
  ctx.fillStyle = 'rgba(0,0,0,0.12)'
  ctx.beginPath(); ctx.ellipse(sx + 2, sy - R + 5, R * 0.85, R * 0.4, 0, 0, Math.PI * 2); ctx.fill()
  const g = ctx.createRadialGradient(sx - R * 0.3, sy - R * 0.3, R * 0.1, sx, sy - R, R)
  g.addColorStop(0, lighten(b.color, 50)); g.addColorStop(0.6, b.color); g.addColorStop(1, darken(b.color, 40))
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy - R, R, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = darken(b.color, 60); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy - R, R, 0, Math.PI * 2); ctx.stroke()
  ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(R * 0.8)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(b.label, sx, sy - R)
  ctx.fillStyle = '#333'; ctx.font = '11px sans-serif'
  ctx.fillText(`${b.m.toFixed(1)}kg`, sx, sy + 4)
}

function drawArrow(ctx, b, len, color, label, yOffset) {
  if (Math.abs(len) < 3) return
  const sx = w2s(b.x), sy = TRACK_Y + yOffset, ex = sx + len, angle = len > 0 ? 0 : Math.PI, al = 7
  ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, sy); ctx.stroke()
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(ex, sy)
  ctx.lineTo(ex - al * Math.cos(angle - 0.4), sy - al * Math.sin(angle - 0.4))
  ctx.lineTo(ex - al * Math.cos(angle + 0.4), sy - al * Math.sin(angle + 0.4))
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = color; ctx.font = '10px Consolas,monospace'; ctx.textAlign = 'center'
  ctx.fillText(label, (sx + ex) / 2, sy - 6)
}

const s = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#e8e8e8', color: '#333', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  toolbar: { minHeight: 44, background: '#f5f5f5', borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', flexShrink: 0, flexWrap: 'wrap', gap: 6 },
  title: { fontSize: 14, fontWeight: 600 },
  toolbarActions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  btn: { background: '#4A90D9', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  playBtn: { background: '#4A90D9', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600, minWidth: 70 },
  pauseBtn: { background: '#E53935', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600, minWidth: 70 },
  setBtn: { background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  sep: { width: 1, height: 20, background: '#ccc' },
  timer: { fontFamily: 'Consolas,monospace', fontSize: 13, marginLeft: 8 },
  main: { flex: 1, display: 'flex', overflow: 'hidden', background: '#fff', position: 'relative' },
  sidePanel: { width: 180, display: 'flex', flexDirection: 'column', gap: 8, padding: 8, background: '#f9f9f9', borderLeft: '1px solid #ddd', flexShrink: 0 },
  panel: { background: '#fff', border: '1px solid #ddd', borderRadius: 6, padding: 8 },
  panelTitle: { fontSize: 12, fontWeight: 600, color: '#444', marginBottom: 4, paddingBottom: 3, borderBottom: '1px solid #eee' },
  chk: { display: 'flex', alignItems: 'center', gap: 4, margin: '2px 0', fontSize: 12, cursor: 'pointer' },
  presetBtn: { display: 'inline-block', padding: '3px 8px', margin: '2px 3px 2px 0', fontSize: 11, border: '1px solid #bbb', borderRadius: 4, background: '#fafafa', cursor: 'pointer' },
  bottomRow: { display: 'flex', gap: 10, padding: '6px 12px', background: '#f0f0f0', borderTop: '1px solid #ccc', flexWrap: 'wrap' },
  params: { background: '#fff', border: '1px solid #ddd', borderRadius: 6, padding: '8px 12px', flex: 1, minWidth: 280 },
  paramsTitle: { fontSize: 12, fontWeight: 600, color: '#444', marginBottom: 4 },
  paramGroup: { display: 'flex', alignItems: 'center', gap: 5, margin: '3px 0', fontSize: 12 },
  lbl: { minWidth: 20, fontWeight: 700, fontSize: 12 },
  numInput: { width: 48, padding: '2px 4px', border: '1px solid #ccc', borderRadius: 3, fontSize: 12, textAlign: 'center' },
  unit: { color: '#999', fontSize: 11 },
  desc: { padding: '8px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13 },
}
