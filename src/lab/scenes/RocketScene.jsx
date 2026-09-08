import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * RocketScene — 运载火箭发射仿真（v5 同步轨道版）
 *
 * 教学目标：把卫星送入地球同步轨道（高度35786km，速度3.07km/s）
 *
 * 两个视图：
 *   1. 发射视图（侧面）：火箭竖直上升
 *   2. 轨道视图（俯视）：地球+同步轨道圆圈
 */

const G0 = 9.80665
const GM_EARTH = 3.986e14
const R_EARTH = 6.371e6
const GEO_ALT = 35786e3
const GEO_R = R_EARTH + GEO_ALT
const GEO_V = 3074
const KARMAN = 100e3
const RHO0 = 1.225
const H_SCALE = 8500
const CD = 0.35
const A_REF = 1.13
const DT = 1 / 60

const PRESETS = {
  single: {
    name: '单级火箭', stages: 1,
    fuel: [95000], dryMass: [5000], vExhaust: [3200], burnTime: [180],
    hint: '⚠ 单级火箭无法抵达同步轨道（对比用）',
  },
  two: {
    name: '两级火箭', stages: 2,
    fuel: [70000, 20000], dryMass: [4000, 1500], vExhaust: [3200, 3500], burnTime: [120, 90],
    hint: '⭐ 推荐：可将卫星送入同步轨道',
  },
  three: {
    name: '三级火箭', stages: 3,
    fuel: [55000, 25000, 8000], dryMass: [3500, 2000, 800], vExhaust: [3200, 3500, 4000], burnTime: [90, 60, 40],
    hint: '🔷 拓展：更容易完成任务',
  },
}

function airDensity(h) { return h > 80000 ? 0 : RHO0 * Math.exp(-h / H_SCALE) }
function gravityAt(h) { return GM_EARTH / Math.pow(R_EARTH + h, 2) }
function totalMass(s) { let m = 0; for (let i = 0; i < s.stages; i++) m += s.dry[i] + s.fuel[i]; return m }
function calcDv(vEx, m0, m1) { return (m1 > 0 && m0 > m1) ? vEx * Math.log(m0 / m1) : 0 }

function initState(key) {
  const p = PRESETS[key]
  return {
    p, key, stages: p.stages,
    fuel: [...p.fuel], dry: [...p.dry], vEx: [...p.vEx], burn: [...p.burn],
    cur: 0, h: 0, v: 0, a: 0, time: 0,
    thrust: 0, grav: 0, drag: 0, fuelUsed: 0,
    peakH: 0, peakV: 0, gravityLoss: 0,
    trail: [], fallen: [],
    launched: false, engineOn: true,
    view: 'ascent',
    orbitAngle: 0, orbitR: 0,
    missionResult: null,
    msg: '',
  }
}

// roundRect polyfill
function rr(ctx, x, y, w, h, r) {
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return }
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath()
}

export default function RocketScene() {
  const canvasRef = useRef(null)
  const S = useRef(null)
  const animRef = useRef(null)
  const [preset, setPreset] = useState('two')
  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState('idle')
  const [, forceUpdate] = useState(0)

  // 初始化
  useEffect(() => { S.current = initState(preset) }, [preset])

  // 重置
  const reset = useCallback(() => {
    S.current = initState(preset); setPhase('idle'); setRunning(false)
  }, [preset])

  // 发射
  const launch = useCallback(() => {
    const s = S.current; if (!s || s.launched) return
    s.launched = true; setRunning(true); setPhase('ascent')
  }, [])

  // 物理步进
  function step() {
    const s = S.current; if (!s || !s.launched) return
    const dt = DT
    const i = s.cur
    let m = totalMass(s)
    let thrust = 0

    if (s.fuel[i] > 0 && s.engineOn) {
      const massFlow = s.fuel[i] / s.burn[i]
      thrust = massFlow * s.vEx[i]
      const used = Math.min(massFlow * dt, s.fuel[i])
      s.fuel[i] -= used; s.fuelUsed += used
    }

    const g = gravityAt(s.h)
    const grav = m * g
    const rho = airDensity(s.h)
    const drag = s.h < 80000 ? 0.5 * rho * CD * A_REF * s.v * Math.abs(s.v) : 0
    s.gravityLoss += grav * dt / m

    const Fnet = thrust - grav - drag
    s.a = Fnet / m; s.thrust = thrust; s.grav = grav; s.drag = drag
    s.v += s.a * dt; s.h += s.v * dt; s.time += dt
    if (s.h < 0) { s.h = 0; s.v = Math.max(0, s.v) }
    if (s.h > s.peakH) s.peakH = s.h
    if (s.v > s.peakV) s.peakV = s.v

    if (s.trail.length === 0 || s.time - s.trail[s.trail.length - 1].t > 0.3)
      s.trail.push({ t: s.time, h: s.h, v: s.v })

    // 级间分离
    if (s.fuel[i] <= 0 && i < s.stages - 1) {
      s.fallen.push({ stage: i, time: s.time, h: s.h, v: s.v, x: (Math.random() - 0.5) * 200, vx: (Math.random() - 0.5) * 30, alpha: 1 })
      s.dry[i] = 0; s.cur++
      s.msg = `🚀 第${i + 1}级箭体分离脱落！`
    }

    // 切换轨道视图
    if (s.h > KARMAN && s.view === 'ascent') { s.view = 'orbit'; s.msg = '🛰 已离开大气层' }

    // 轨道角度
    if (s.view === 'orbit' && s.h > 1000) {
      s.orbitR = R_EARTH + s.h
      s.orbitAngle += (s.v / s.orbitR) * dt
    }

    // 入轨判定
    if (s.h > 30000e3 && !s.missionResult) {
      if (Math.abs(s.h - GEO_ALT) / GEO_ALT < 0.15 && Math.abs(s.v - GEO_V) / GEO_V < 0.15) {
        s.missionResult = 'success'; s.engineOn = false; setPhase('success')
        s.msg = '🎉 卫星成功进入地球同步轨道！任务完成！'; setRunning(false)
      } else if (s.v > GEO_V * 1.5) {
        s.missionResult = 'fail_escape'; setPhase('fail')
        s.msg = '❌ 速度过大，卫星将逃离地球！'; setRunning(false)
      }
    }

    // 落回地面
    const allEmpty = s.fuel.every(f => f <= 0)
    if (allEmpty && s.h <= 0 && s.time > 5 && !s.missionResult) {
      s.missionResult = 'fail_gravity'; setPhase('fail')
      s.msg = s.key === 'single' ? '❌ 单级火箭无法抵达同步轨道！这就是为什么需要多级火箭。' : '❌ 火箭落回地面，未能进入轨道。'
      setRunning(false)
    }

    // 掉落壳体
    s.fallen.forEach(f => {
      f.v -= gravityAt(f.h) * dt; f.h += f.v * dt; f.x += f.vx * dt; f.vx *= 0.995
      f.alpha = Math.max(0, f.alpha - dt * 0.08)
    })

    forceUpdate(n => n + 1)
  }

  // ─── 渲染 ───
  function draw() {
    try {
      const canvas = canvasRef.current; if (!canvas) return
      const ctx = canvas.getContext('2d')
      const W = canvas.width, H = canvas.height
      const s = S.current; if (!s || W === 0 || H === 0) return

      ctx.clearRect(0, 0, W, H)
      if (s.view === 'ascent') drawAscent(ctx, W, H, s)
      else drawOrbit(ctx, W, H, s)
      drawInfoPanel(ctx, W, H, s)
      if (s.msg) drawMsg(ctx, W, H, s)
    } catch (e) { console.error('draw error:', e) }
  }

  function drawAscent(ctx, W, H, s) {
    const margin = { top: 50, bottom: 60, left: 50, right: 180 }
    const plotW = W - margin.left - margin.right
    const plotH = H - margin.top - margin.bottom
    const maxH = Math.max(5000, s.peakH * 1.3, s.h * 1.5)
    const w2sY = (wy) => margin.top + plotH - (wy / maxH) * plotH
    const rocketX = margin.left + plotW * 0.5

    // 天空
    const grad = ctx.createLinearGradient(0, 0, 0, H)
    grad.addColorStop(0, '#000510'); grad.addColorStop(0.3, '#0a1628'); grad.addColorStop(0.7, '#1a2a48'); grad.addColorStop(1, '#2a3a5a')
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H)

    // 星星
    ctx.fillStyle = '#fff'
    for (let i = 0; i < 80; i++) {
      ctx.globalAlpha = 0.3 + (i % 5) * 0.12
      ctx.beginPath(); ctx.arc((i * 137 + 23) % W, (i * 97 + 11) % (H * 0.6), i % 3 === 0 ? 1.5 : 0.8, 0, Math.PI * 2); ctx.fill()
    }
    ctx.globalAlpha = 1

    // 卡门线
    const ky = w2sY(KARMAN)
    if (ky > margin.top) {
      ctx.strokeStyle = 'rgba(100,180,255,0.2)'; ctx.lineWidth = 1; ctx.setLineDash([6, 4])
      ctx.beginPath(); ctx.moveTo(margin.left, ky); ctx.lineTo(W - margin.right, ky); ctx.stroke(); ctx.setLineDash([])
      ctx.fillStyle = 'rgba(100,180,255,0.4)'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText('卡门线 100km', margin.left + 4, ky - 4)
    }

    // 地面
    const gY = w2sY(0)
    ctx.fillStyle = '#3a5a3a'; ctx.fillRect(0, gY, W, H - gY)
    ctx.strokeStyle = '#5a8a5a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, gY); ctx.lineTo(W, gY); ctx.stroke()

    // 高度网格
    ctx.strokeStyle = 'rgba(100,180,255,0.08)'; ctx.lineWidth = 1; ctx.setLineDash([4, 6])
    const gridStep = maxH > 20000 ? 5000 : maxH > 5000 ? 1000 : 500
    for (let alt = gridStep; alt < maxH; alt += gridStep) {
      const gy = w2sY(alt); ctx.beginPath(); ctx.moveTo(margin.left, gy); ctx.lineTo(W - margin.right, gy); ctx.stroke()
      ctx.fillStyle = '#7888a0'; ctx.font = '11px monospace'; ctx.textAlign = 'right'
      ctx.fillText(`${(alt / 1000).toFixed(0)}km`, margin.left - 6, gy + 4)
    }
    ctx.setLineDash([])

    // 轨迹
    if (s.trail.length > 1) {
      ctx.lineWidth = 2; ctx.lineCap = 'round'
      for (let i = 1; i < s.trail.length; i++) {
        const y0 = w2sY(s.trail[i - 1].h), y1 = w2sY(s.trail[i].h)
        const spd = s.trail[i].v / Math.max(1, s.peakV)
        ctx.strokeStyle = `rgba(${40 + spd * 180 | 0},${120 + (1 - spd) * 100 | 0},255,0.5)`
        ctx.beginPath(); ctx.moveTo(rocketX, y0); ctx.lineTo(rocketX, y1); ctx.stroke()
      }
    }

    // 火箭
    const sc = Math.max(0.5, Math.min(1, 400 / maxH * 2))
    const rh = 60 * sc, rw = 16 * sc
    drawRocket(ctx, rocketX, w2sY(s.h), rw, rh, s)

    // 掉落壳体
    s.fallen.forEach(f => {
      if (f.alpha <= 0) return
      const fy = w2sY(Math.max(0, f.h))
      if (fy < H && fy > 0) {
        ctx.save(); ctx.globalAlpha = f.alpha
        ctx.translate(rocketX + f.x * sc, fy); ctx.rotate((s.time - f.time) * 0.5)
        ctx.fillStyle = '#888'; ctx.fillRect(-rw * 0.3, 0, rw * 0.6, rh * 0.4)
        ctx.restore()
      }
    })
  }

  function drawOrbit(ctx, W, H, s) {
    const cx = W * 0.42, cy = H * 0.48
    ctx.fillStyle = '#000510'; ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#fff'
    for (let i = 0; i < 120; i++) {
      ctx.globalAlpha = 0.2 + (i % 5) * 0.1
      ctx.beginPath(); ctx.arc((i * 137 + 23) % W, (i * 97 + 11) % H, i % 3 === 0 ? 1.5 : 0.8, 0, Math.PI * 2); ctx.fill()
    }
    ctx.globalAlpha = 1

    const maxR = GEO_R * 1.3
    const scale = Math.min(cx - 40, cy - 40) / maxR

    // 地球
    const eR = R_EARTH * scale
    const eg = ctx.createRadialGradient(cx - eR * 0.2, cy - eR * 0.2, eR * 0.1, cx, cy, eR)
    eg.addColorStop(0, '#4488cc'); eg.addColorStop(0.5, '#2266aa'); eg.addColorStop(1, '#113366')
    ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(cx, cy, eR, 0, Math.PI * 2); ctx.fill()

    // 大气层
    ctx.strokeStyle = 'rgba(100,180,255,0.15)'; ctx.lineWidth = KARMAN * scale
    ctx.beginPath(); ctx.arc(cx, cy, eR + KARMAN * scale * 0.5, 0, Math.PI * 2); ctx.stroke()

    // 同步轨道
    const gR = GEO_R * scale
    ctx.strokeStyle = 'rgba(76,175,80,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([8, 6])
    ctx.beginPath(); ctx.arc(cx, cy, gR, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([])
    ctx.fillStyle = '#4CAF50'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('同步轨道 35786km', cx, cy - gR - 8)

    // 当前轨道
    if (s.h > KARMAN) {
      const cR = (R_EARTH + s.h) * scale
      ctx.strokeStyle = 'rgba(79,195,247,0.4)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4])
      ctx.beginPath(); ctx.arc(cx, cy, cR, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([])

      const rx = cx + cR * Math.cos(s.orbitAngle), ry = cy + cR * Math.sin(s.orbitAngle)
      ctx.fillStyle = '#FF9800'; ctx.beginPath(); ctx.arc(rx, ry, 6, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('🚀', rx, ry - 12)

      ctx.strokeStyle = 'rgba(255,152,0,0.3)'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(cx, cy, cR, s.orbitAngle - 0.5, s.orbitAngle); ctx.stroke()
    }

    // 掉落壳体
    s.fallen.forEach(f => {
      if (f.alpha <= 0 || f.h <= 0) return
      const fr = (R_EARTH + Math.max(0, f.h)) * scale
      const fx = cx + fr * Math.cos(s.orbitAngle - 0.1), fy = cy + fr * Math.sin(s.orbitAngle - 0.1)
      ctx.globalAlpha = f.alpha; ctx.fillStyle = '#888'; ctx.beginPath(); ctx.arc(fx, fy, 3, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1
    })

    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('🌍 地球', cx, cy + eR + 20)
  }

  function drawRocket(ctx, x, y, rw, rh, s) {
    ctx.save(); ctx.translate(x, y)
    ctx.fillStyle = '#ddd'; ctx.beginPath(); ctx.moveTo(0, -rh * 1.3); ctx.lineTo(-rw * 0.5, -rh); ctx.lineTo(rw * 0.5, -rh); ctx.closePath(); ctx.fill()
    let yOff = -rh; const stageH = rh / s.stages
    for (let i = 0; i < s.stages; i++) {
      if (s.dry[i] <= 0) continue
      const isCur = i === s.cur
      ctx.fillStyle = isCur ? '#f0f0f0' : ['#e0e0e0', '#d0d0d0', '#c0c0c0'][i]
      ctx.fillRect(-rw * 0.5, yOff, rw, stageH)
      if (i > 0) { ctx.strokeStyle = '#666'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-rw * 0.5, yOff); ctx.lineTo(rw * 0.5, yOff); ctx.stroke() }
      if (isCur && s.fuel[i] > 0) {
        const ratio = s.fuel[i] / s.p.fuel[i], barH = stageH * 0.8
        ctx.fillStyle = 'rgba(255,100,30,0.3)'; ctx.fillRect(-rw * 0.4, yOff + stageH * 0.1, rw * 0.8, barH)
        ctx.fillStyle = ratio > 0.3 ? '#ff8844' : '#ff4444'
        ctx.fillRect(-rw * 0.4, yOff + stageH * 0.1 + barH * (1 - ratio), rw * 0.8, barH * ratio)
      }
      yOff += stageH
    }
    ctx.fillStyle = '#aaa'
    ctx.beginPath(); ctx.moveTo(-rw * 0.5, 0); ctx.lineTo(-rw * 1.2, rh * 0.15); ctx.lineTo(-rw * 0.5, -rh * 0.1); ctx.closePath(); ctx.fill()
    ctx.beginPath(); ctx.moveTo(rw * 0.5, 0); ctx.lineTo(rw * 1.2, rh * 0.15); ctx.lineTo(rw * 0.5, -rh * 0.1); ctx.closePath(); ctx.fill()
    if (s.thrust > 0 && s.engineOn) {
      const fh = rh * (0.5 + Math.random() * 0.3), fw = rw * 0.6
      const fg = ctx.createRadialGradient(0, 0, 0, 0, fh * 0.5, fh)
      fg.addColorStop(0, 'rgba(255,200,50,0.9)'); fg.addColorStop(0.4, 'rgba(255,100,20,0.7)'); fg.addColorStop(1, 'rgba(255,50,10,0)')
      ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(-fw, 0); ctx.quadraticCurveTo(-fw * 0.3, fh * 0.6, 0, fh); ctx.quadraticCurveTo(fw * 0.3, fh * 0.6, fw, 0); ctx.closePath(); ctx.fill()
      ctx.fillStyle = 'rgba(255,255,230,0.8)'; ctx.beginPath(); ctx.moveTo(-fw * 0.3, 0); ctx.quadraticCurveTo(0, fh * 0.4, 0, fh * 0.5); ctx.quadraticCurveTo(0, fh * 0.4, fw * 0.3, 0); ctx.closePath(); ctx.fill()
    }
    ctx.restore()
  }

  function drawInfoPanel(ctx, W, H, s) {
    const pw = 200, px = W - pw - 10, py = 10
    ctx.fillStyle = 'rgba(15,25,45,0.9)'; ctx.strokeStyle = 'rgba(100,180,255,0.2)'; ctx.lineWidth = 1
    ctx.beginPath(); rr(ctx, px, py, pw, 310, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#4a9eff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('📡 飞行数据', px + 10, py + 18)
    ctx.font = '11px monospace'; let ry = py + 36
    const rows = [
      ['时间', `${s.time.toFixed(1)}s`],
      ['高度', s.h >= 1000 ? `${(s.h / 1000).toFixed(1)}km` : `${s.h.toFixed(0)}m`],
      ['速度', `${s.v.toFixed(1)} m/s`],
      ['加速度', `${s.a.toFixed(2)} m/s²`],
      ['质量', `${(totalMass(s) / 1000).toFixed(2)} t`],
      ['', ''],
      ['当前级', `第${s.cur + 1}级 / ${s.stages}级`],
      ['剩余燃料', `${(s.fuel.reduce((a, b) => a + b, 0) / 1000).toFixed(2)} t`],
      ['重力损失', `${s.gravityLoss.toFixed(1)} m/s`],
      ['', ''],
      ['最大高度', `${(s.peakH / 1000).toFixed(1)} km`],
      ['最大速度', `${s.peakV.toFixed(0)} m/s`],
    ]
    for (const [label, value] of rows) {
      if (!label) { ry += 6; continue }
      ctx.fillStyle = '#7888a0'; ctx.textAlign = 'left'; ctx.fillText(label, px + 10, ry)
      ctx.fillStyle = '#e0e8f0'; ctx.textAlign = 'right'; ctx.fillText(value, px + pw - 10, ry)
      ry += 18
    }
    // 齐奥尔科夫斯基
    const fpy = py + 320
    ctx.fillStyle = 'rgba(15,25,45,0.9)'; ctx.beginPath(); rr(ctx, px, fpy, pw, 120, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#4a9eff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('🚀 Δv = vₑ×ln(m₀/m₁)', px + 10, fpy + 18)
    ctx.font = '10px monospace'; ctx.fillStyle = '#ffaa33'; let dy = fpy + 36
    for (let i = 0; i < s.stages; i++) {
      let m0 = 0, m1 = 0
      for (let j = i; j < s.stages; j++) { m0 += s.dry[j] + s.fuel[j]; m1 += s.dry[j] + (j === i ? 0 : s.fuel[j]) }
      ctx.fillText(`第${i + 1}级: Δv=${calcDv(s.vEx[i], m0, m1).toFixed(0)}m/s`, px + 10, dy); dy += 16
    }
    // 同步轨道目标
    ctx.fillStyle = '#4CAF50'; ctx.font = '10px sans-serif'
    ctx.fillText(`目标: 同步轨道 ${GEO_ALT / 1000}km`, px + 10, dy + 6)
    ctx.fillText(`目标速度: ${GEO_V}m/s`, px + 10, dy + 20)
  }

  function drawMsg(ctx, W, H, s) {
    ctx.font = 'bold 13px sans-serif'
    const mw = ctx.measureText(s.msg).width + 30
    ctx.fillStyle = 'rgba(15,25,45,0.9)'; ctx.beginPath(); rr(ctx, W / 2 - mw / 2, H - 50, mw, 32, 6); ctx.fill()
    ctx.fillStyle = s.missionResult === 'success' ? '#44ff88' : s.missionResult ? '#ff4444' : '#ffaa33'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(s.msg, W / 2, H - 34); ctx.textBaseline = 'alphabetic'
  }

  // 动画循环
  useEffect(() => {
    if (!running) return
    const loop = () => { step(); draw(); animRef.current = requestAnimationFrame(loop) }
    animRef.current = requestAnimationFrame(loop)
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [running])

  // 初始绘制+resize
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const resize = () => {
      const p = canvas.parentElement
      canvas.width = p.clientWidth; canvas.height = Math.max(500, p.clientHeight)
      draw()
    }
    resize(); window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#0a0e1a' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: 'rgba(15,25,45,0.9)', borderBottom: '1px solid rgba(100,180,255,0.2)', flexWrap: 'wrap' }}>
        <span style={{ color: '#4a9eff', fontWeight: 'bold', fontSize: 14 }}>🚀 运载火箭仿真</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {Object.entries(PRESETS).map(([k, p]) => (
            <button key={k} onClick={() => { setPreset(k) }}
              style={{ padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', background: preset === k ? '#4a9eff' : 'rgba(100,180,255,0.1)', color: preset === k ? '#fff' : '#7888a0', fontSize: 12, fontWeight: preset === k ? 'bold' : 'normal' }}>
              {p.name}
            </button>
          ))}
        </div>
        <span style={{ color: '#7888a0', fontSize: 11 }}>{PRESETS[preset].hint}</span>
        <div style={{ flex: 1 }} />
        <button onClick={launch} disabled={running || phase !== 'idle'}
          style={{ padding: '6px 16px', borderRadius: 6, border: 'none', cursor: running || phase !== 'idle' ? 'default' : 'pointer', background: running || phase !== 'idle' ? 'rgba(100,100,100,0.3)' : '#ff4422', color: '#fff', fontWeight: 'bold', fontSize: 13 }}>
          {phase === 'idle' ? '🔴 发射' : phase === 'success' ? '✅ 完成' : phase === 'fail' ? '❌ 失败' : '发射中...'}
        </button>
        <button onClick={reset}
          style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(100,180,255,0.2)', background: 'transparent', color: '#7888a0', cursor: 'pointer', fontSize: 12 }}>
          ↺ 重置
        </button>
      </div>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <canvas ref={canvasRef} style={{ display: 'block' }} />
      </div>
    </div>
  )
}
