import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * RocketScene — 运载火箭发射仿真（v5 同步轨道版）
 *
 * 教学目标：把卫星送入地球同步轨道（高度35786km，速度3.07km/s）
 *
 * 物理模型：
 *   推力：F = (dm/dt) × vₑ
 *   阻力：F_drag = ½ρCdAv²（仅大气层内）
 *   重力：F_g = mg（随高度变化 g = GM/(R+h)²）
 *   齐奥尔科夫斯基：Δv = vₑ × ln(m₀/m₁)
 *
 * 两个视图：
 *   1. 发射视图（侧面）：火箭竖直上升，大气层内
 *   2. 轨道视图（俯视）：地球+同步轨道圆圈，火箭沿轨道飞行
 */

const G0 = 9.80665
const GM_EARTH = 3.986e14      // m³/s²
const R_EARTH = 6.371e6        // m
const GEO_ALT = 35786e3        // 同步轨道高度 m
const GEO_R = R_EARTH + GEO_ALT
const GEO_V = 3074             // 同步轨道速度 m/s
const KARMAN = 100e3            // 卡门线 100km
const RHO0 = 1.225
const H_SCALE = 8500
const CD = 0.35
const A_REF = 1.13
const DT = 1 / 60

// 预设方案 — 调参使两级火箭可完成同步轨道
const PRESETS = {
  single: {
    name: '单级火箭', stages: 1,
    fuel: [95000], dryMass: [5000], vExhaust: [3200], burnTime: [180],
    hint: '⚠ 单级火箭受火箭方程限制，无法抵达同步轨道（对比用）',
  },
  two: {
    name: '两级火箭', stages: 2,
    fuel: [70000, 20000], dryMass: [4000, 1500], vExhaust: [3200, 3500], burnTime: [120, 90],
    hint: '⭐ 推荐：两级火箭可将卫星送入同步轨道',
  },
  three: {
    name: '三级火箭', stages: 3,
    fuel: [55000, 25000, 8000], dryMass: [3500, 2000, 800], vExhaust: [3200, 3500, 4000], burnTime: [90, 60, 40],
    hint: '🔷 拓展：三级火箭更容易完成任务',
  },
}

function airDensity(h) { return h > 80000 ? 0 : RHO0 * Math.exp(-h / H_SCALE) }
function gravityAt(h) { return GM_EARTH / Math.pow(R_EARTH + h, 2) }
function totalMass(s) { let m = 0; for (let i = 0; i < s.stages; i++) m += s.dry[i] + s.fuel[i]; return m }
function calcDv(vEx, m0, m1) { return (m1 > 0 && m0 > m1) ? vEx * Math.log(m0 / m1) : 0 }

export default function RocketScene() {
  const canvasRef = useRef(null)
  const S = useRef(null)
  const animRef = useRef(null)
  const [preset, setPreset] = useState('two')
  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState('idle') // idle | ascent | orbit | success | fail
  const [data, setData] = useState(null)
  const [message, setMessage] = useState('')

  // 初始化
  const init = useCallback((key) => {
    const p = PRESETS[key]
    return {
      p, key, stages: p.stages,
      fuel: [...p.fuel], dry: [...p.dry], vEx: [...p.vEx], burn: [...p.burn],
      cur: 0, h: 0, v: 0, a: 0, time: 0,
      thrust: 0, grav: 0, drag: 0, fuelUsed: 0,
      peakH: 0, peakV: 0, gravityLoss: 0,
      trail: [], fallen: [], // fallen = 已分离壳体
      launched: false, engineOn: true,
      view: 'ascent', // ascent | orbit
      orbitAngle: 0, // 轨道视图中的角度
      orbitR: 0,     // 当前轨道半径
      missionResult: null, // 'success' | 'fail_gravity' | 'fail_escape'
    }
  }, [])

  const reset = useCallback(() => {
    S.current = init(preset); setPhase('idle'); setRunning(false); setData(null); setMessage('')
  }, [preset, init])

  const launch = useCallback(() => {
    const s = S.current; if (!s || s.launched) return
    s.launched = true; setRunning(true); setPhase('ascent'); setMessage('')
  }, [])

  // 物理步进
  const step = useCallback(() => {
    const s = S.current; if (!s || !s.launched) return
    const dt = DT

    // 当前级参数
    const i = s.cur
    let m = totalMass(s)
    let thrust = 0, massFlow = 0

    if (s.fuel[i] > 0 && s.engineOn) {
      massFlow = s.fuel[i] / s.burn[i]
      thrust = massFlow * s.vEx[i]
      const used = Math.min(massFlow * dt, s.fuel[i])
      s.fuel[i] -= used; s.fuelUsed += used
    }

    // 外力
    const g = gravityAt(s.h)
    const grav = m * g
    const rho = airDensity(s.h)
    const drag = 0.5 * rho * CD * A_REF * s.v * Math.abs(s.v) * Math.sign(s.v || 1)

    // 重力损失累积
    s.gravityLoss += grav * dt / m

    // 合力
    const Fnet = thrust - grav - (s.h < 80000 ? drag : 0)
    s.a = Fnet / m; s.thrust = thrust; s.grav = grav; s.drag = drag

    // 运动学
    s.v += s.a * dt; s.h += s.v * dt; s.time += dt
    if (s.h < 0) { s.h = 0; s.v = Math.max(0, s.v) }
    if (s.h > s.peakH) s.peakH = s.h
    if (s.v > s.peakV) s.peakV = s.v

    // 轨迹
    if (s.trail.length === 0 || s.time - s.trail[s.trail.length - 1].t > 0.3)
      s.trail.push({ t: s.time, h: s.h, v: s.v })

    // 级间分离 — 壳体变为独立掉落物体
    if (s.fuel[i] <= 0 && i < s.stages - 1) {
      const shellMass = s.dry[i]
      s.fallen.push({
        stage: i, time: s.time, h: s.h, v: s.v,
        x: (Math.random() - 0.5) * 200, // 侧向偏移
        vx: (Math.random() - 0.5) * 30,
        mass: shellMass, alpha: 1,
      })
      s.dry[i] = 0 // 从火箭总质量中移除
      s.cur++
      setMessage(`🚀 第${i + 1}级箭体分离脱落！`)
    }

    // 切换到轨道视图
    if (s.h > KARMAN && s.view === 'ascent') {
      s.view = 'orbit'
      setMessage('🛰 已离开大气层，进入轨道飞行阶段')
    }

    // 轨道视图中的角度更新
    if (s.view === 'orbit') {
      s.orbitR = R_EARTH + s.h
      if (s.h > 1000) {
        const orbitalV = s.v > 100 ? s.v : 100
        s.orbitAngle += (orbitalV / s.orbitR) * dt
      }
    }

    // 入轨判定（高度>30000km时检测）
    if (s.h > 30000e3 && !s.missionResult) {
      const altOk = Math.abs(s.h - GEO_ALT) / GEO_ALT < 0.15
      const velOk = Math.abs(s.v - GEO_V) / GEO_V < 0.15
      if (altOk && velOk) {
        s.missionResult = 'success'
        s.engineOn = false
        setPhase('success')
        setMessage('🎉 卫星成功进入地球同步轨道！任务完成！')
        setRunning(false)
      } else if (s.v > GEO_V * 1.5) {
        s.missionResult = 'fail_escape'
        setPhase('fail')
        setMessage('❌ 速度过大，卫星将逃离地球引力！')
        setRunning(false)
      }
    }

    // 燃料耗尽后检查失败
    const allEmpty = s.fuel.every(f => f <= 0)
    if (allEmpty && s.h > KARMAN && !s.missionResult) {
      if (s.h < 30000e3 && s.v < GEO_V * 0.5) {
        // 还在上升中，等回落再判定
      }
    }
    if (allEmpty && s.h <= 0 && s.time > 5 && !s.missionResult) {
      s.missionResult = 'fail_gravity'
      setPhase('fail')
      setMessage(s.key === 'single'
        ? '❌ 单级火箭无法抵达同步轨道！这就是为什么需要多级火箭。'
        : '❌ 火箭落回地面，未能进入轨道。')
      setRunning(false)
    }

    // 掉落壳体物理
    s.fallen.forEach(f => {
      f.v -= gravityAt(f.h) * dt
      f.h += f.v * dt
      f.x += f.vx * dt
      f.vx *= 0.995
      f.alpha = Math.max(0, f.alpha - dt * 0.08)
    })

    setData({
      time: s.time, h: s.h, v: s.v, a: s.a, m,
      thrust: s.thrust, grav: s.grav, drag: s.drag,
      stage: s.cur, stages: s.stages,
      fuel: s.fuel.reduce((a, b) => a + b, 0),
      fuelUsed: s.fuelUsed,
      peakH: s.peakH, peakV: s.peakV,
      gravityLoss: s.gravityLoss,
      fallen: s.fallen, view: s.view,
      missionResult: s.missionResult,
      orbitAngle: s.orbitAngle,
    })
  }, [])

  // ─── 渲染 ───
  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width, H = canvas.height
    const s = S.current; if (!s) return

    ctx.clearRect(0, 0, W, H)

    if (s.view === 'ascent') drawAscent(ctx, W, H, s)
    else drawOrbit(ctx, W, H, s)

    drawInfoPanel(ctx, W, H, s)
    drawMessage(ctx, W, H)
  }, [phase])

  // ========== 发射视图（侧面） ==========
  function drawAscent(ctx, W, H, s) {
    const margin = { top: 50, bottom: 60, left: 50, right: 180 }
    const plotW = W - margin.left - margin.right
    const plotH = H - margin.top - margin.bottom
    const maxH = Math.max(5000, s.peakH * 1.3, s.h * 1.5)

    const w2sY = (wy) => margin.top + plotH - (wy / maxH) * plotH
    const rocketX = margin.left + plotW * 0.5

    // 天空渐变
    const grad = ctx.createLinearGradient(0, 0, 0, H)
    grad.addColorStop(0, '#000510'); grad.addColorStop(0.3, '#0a1628')
    grad.addColorStop(0.7, '#1a2a48'); grad.addColorStop(1, '#2a3a5a')
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H)

    // 星星
    ctx.fillStyle = '#fff'
    for (let i = 0; i < 80; i++) {
      ctx.globalAlpha = 0.3 + (i % 5) * 0.12
      ctx.beginPath(); ctx.arc((i * 137.508 + 23) % W, (i * 97.31 + 11) % (H * 0.6), i % 3 === 0 ? 1.5 : 0.8, 0, Math.PI * 2); ctx.fill()
    }
    ctx.globalAlpha = 1

    // 大气层指示
    const karmanY = w2sY(KARMAN)
    if (karmanY > margin.top) {
      ctx.strokeStyle = 'rgba(100,180,255,0.2)'; ctx.lineWidth = 1; ctx.setLineDash([6, 4])
      ctx.beginPath(); ctx.moveTo(margin.left, karmanY); ctx.lineTo(W - margin.right, karmanY); ctx.stroke(); ctx.setLineDash([])
      ctx.fillStyle = 'rgba(100,180,255,0.4)'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText('卡门线 100km', margin.left + 4, karmanY - 4)
    }

    // 地面
    const groundY = w2sY(0)
    const gGrad = ctx.createLinearGradient(0, groundY, 0, groundY + 40)
    gGrad.addColorStop(0, '#3a5a3a'); gGrad.addColorStop(1, '#1a2a1a')
    ctx.fillStyle = gGrad; ctx.fillRect(0, groundY, W, H - groundY)
    ctx.strokeStyle = '#5a8a5a'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(W, groundY); ctx.stroke()

    // 高度网格
    ctx.strokeStyle = 'rgba(100,180,255,0.08)'; ctx.lineWidth = 1; ctx.setLineDash([4, 6])
    const gridStep = maxH > 20000 ? 5000 : maxH > 5000 ? 1000 : 500
    for (let alt = gridStep; alt < maxH; alt += gridStep) {
      const gy = w2sY(alt)
      ctx.beginPath(); ctx.moveTo(margin.left, gy); ctx.lineTo(W - margin.right, gy); ctx.stroke()
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
        ctx.strokeStyle = `rgba(${Math.floor(40 + spd * 180)},${Math.floor(120 + (1 - spd) * 100)},255,0.5)`
        ctx.beginPath(); ctx.moveTo(rocketX, y0); ctx.lineTo(rocketX, y1); ctx.stroke()
      }
    }

    // 火箭
    const rocketY = w2sY(s.h)
    const sc = Math.max(0.5, Math.min(1, 400 / maxH * 2))
    const rh = 60 * sc, rw = 16 * sc
    drawRocket(ctx, rocketX, rocketY, rw, rh, s)

    // 掉落壳体
    s.fallen.forEach(f => {
      if (f.alpha <= 0) return
      const fy = w2sY(Math.max(0, f.h))
      const fx = rocketX + f.x * sc
      if (fy < H && fy > 0) {
        ctx.save(); ctx.globalAlpha = f.alpha
        ctx.translate(fx, fy); ctx.rotate((s.time - f.time) * 0.5)
        ctx.fillStyle = '#888'; ctx.fillRect(-rw * 0.3, 0, rw * 0.6, rh * 0.4)
        ctx.restore()
      }
    })
  }

  // ========== 轨道视图（俯视） ==========
  function drawOrbit(ctx, W, H, s) {
    const cx = W * 0.42, cy = H * 0.48

    // 深空背景
    ctx.fillStyle = '#000510'; ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#fff'
    for (let i = 0; i < 120; i++) {
      ctx.globalAlpha = 0.2 + (i % 5) * 0.1
      ctx.beginPath(); ctx.arc((i * 137.508 + 23) % W, (i * 97.31 + 11) % H, i % 3 === 0 ? 1.5 : 0.8, 0, Math.PI * 2); ctx.fill()
    }
    ctx.globalAlpha = 1

    // 缩放：让同步轨道在画面内
    const maxDisplayR = GEO_R * 1.3
    const scale = Math.min(cx - 40, cy - 40) / maxDisplayR

    // 地球
    const earthR = R_EARTH * scale
    const earthGrad = ctx.createRadialGradient(cx - earthR * 0.2, cy - earthR * 0.2, earthR * 0.1, cx, cy, earthR)
    earthGrad.addColorStop(0, '#4488cc'); earthGrad.addColorStop(0.5, '#2266aa'); earthGrad.addColorStop(1, '#113366')
    ctx.fillStyle = earthGrad; ctx.beginPath(); ctx.arc(cx, cy, earthR, 0, Math.PI * 2); ctx.fill()

    // 大气层
    ctx.strokeStyle = 'rgba(100,180,255,0.15)'; ctx.lineWidth = KARMAN * scale
    ctx.beginPath(); ctx.arc(cx, cy, earthR + KARMAN * scale * 0.5, 0, Math.PI * 2); ctx.stroke()

    // 同步轨道虚线圆
    const geoR = GEO_R * scale
    ctx.strokeStyle = 'rgba(76,175,80,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([8, 6])
    ctx.beginPath(); ctx.arc(cx, cy, geoR, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([])
    ctx.fillStyle = '#4CAF50'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('同步轨道 35786km', cx, cy - geoR - 8)

    // 当前轨道圆（如果在轨道上）
    if (s.h > KARMAN) {
      const curR = (R_EARTH + s.h) * scale
      ctx.strokeStyle = 'rgba(79,195,247,0.4)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4])
      ctx.beginPath(); ctx.arc(cx, cy, curR, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([])

      // 火箭位置
      const rx = cx + curR * Math.cos(s.orbitAngle)
      const ry = cy + curR * Math.sin(s.orbitAngle)
      ctx.fillStyle = '#FF9800'; ctx.beginPath(); ctx.arc(rx, ry, 6, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('🚀', rx, ry - 10)

      // 轨迹弧
      ctx.strokeStyle = 'rgba(255,152,0,0.3)'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(cx, cy, curR, s.orbitAngle - 0.5, s.orbitAngle); ctx.stroke()
    }

    // 掉落壳体
    s.fallen.forEach(f => {
      if (f.alpha <= 0 || f.h <= 0) return
      const fr = (R_EARTH + Math.max(0, f.h)) * scale
      const fx = cx + fr * Math.cos(s.orbitAngle - 0.1)
      const fy = cy + fr * Math.sin(s.orbitAngle - 0.1)
      ctx.globalAlpha = f.alpha; ctx.fillStyle = '#888'
      ctx.beginPath(); ctx.arc(fx, fy, 3, 0, Math.PI * 2); ctx.fill()
      ctx.globalAlpha = 1
    })

    // 地球标签
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('🌍 地球', cx, cy + earthR + 20)
  }

  // ========== 火箭绘制 ==========
  function drawRocket(ctx, x, y, rw, rh, s) {
    ctx.save(); ctx.translate(x, y)

    // 整流罩
    ctx.fillStyle = '#ddd'
    ctx.beginPath(); ctx.moveTo(0, -rh * 1.3); ctx.lineTo(-rw * 0.5, -rh); ctx.lineTo(rw * 0.5, -rh); ctx.closePath(); ctx.fill()

    // 各级箭体
    let yOff = -rh
    const stageH = rh / s.stages
    for (let i = 0; i < s.stages; i++) {
      if (s.dry[i] <= 0) continue // 已分离
      const isCur = i === s.cur
      ctx.fillStyle = isCur ? '#f0f0f0' : ['#e0e0e0', '#d0d0d0', '#c0c0c0'][i]
      ctx.fillRect(-rw * 0.5, yOff, rw, stageH)
      if (i > 0) { ctx.strokeStyle = '#666'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-rw * 0.5, yOff); ctx.lineTo(rw * 0.5, yOff); ctx.stroke() }
      // 燃料条
      if (isCur && s.fuel[i] > 0) {
        const ratio = s.fuel[i] / s.p.fuel[i]
        const barH = stageH * 0.8
        ctx.fillStyle = 'rgba(255,100,30,0.3)'; ctx.fillRect(-rw * 0.4, yOff + stageH * 0.1, rw * 0.8, barH)
        ctx.fillStyle = ratio > 0.3 ? '#ff8844' : '#ff4444'
        ctx.fillRect(-rw * 0.4, yOff + stageH * 0.1 + barH * (1 - ratio), rw * 0.8, barH * ratio)
      }
      yOff += stageH
    }

    // 尾翼
    ctx.fillStyle = '#aaa'
    ctx.beginPath(); ctx.moveTo(-rw * 0.5, 0); ctx.lineTo(-rw * 1.2, rh * 0.15); ctx.lineTo(-rw * 0.5, -rh * 0.1); ctx.closePath(); ctx.fill()
    ctx.beginPath(); ctx.moveTo(rw * 0.5, 0); ctx.lineTo(rw * 1.2, rh * 0.15); ctx.lineTo(rw * 0.5, -rh * 0.1); ctx.closePath(); ctx.fill()

    // 推力火焰
    if (s.thrust > 0 && s.engineOn) {
      const fh = rh * (0.5 + Math.random() * 0.3), fw = rw * 0.6
      const fg = ctx.createRadialGradient(0, 0, 0, 0, fh * 0.5, fh)
      fg.addColorStop(0, 'rgba(255,200,50,0.9)'); fg.addColorStop(0.4, 'rgba(255,100,20,0.7)'); fg.addColorStop(1, 'rgba(255,50,10,0)')
      ctx.fillStyle = fg
      ctx.beginPath(); ctx.moveTo(-fw, 0); ctx.quadraticCurveTo(-fw * 0.3, fh * 0.6, 0, fh); ctx.quadraticCurveTo(fw * 0.3, fh * 0.6, fw, 0); ctx.closePath(); ctx.fill()
      ctx.fillStyle = 'rgba(255,255,230,0.8)'
      ctx.beginPath(); ctx.moveTo(-fw * 0.3, 0); ctx.quadraticCurveTo(0, fh * 0.4, 0, fh * 0.5); ctx.quadraticCurveTo(0, fh * 0.4, fw * 0.3, 0); ctx.closePath(); ctx.fill()
    }

    ctx.restore()
  }

  // ========== 信息面板 ==========
  function drawInfoPanel(ctx, W, H, s) {
    const pw = 200, px = W - pw - 10, py = 10
    ctx.fillStyle = 'rgba(15,25,45,0.9)'; ctx.strokeStyle = 'rgba(100,180,255,0.2)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(px, py, pw, 310, 8); ctx.fill(); ctx.stroke()
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

    // 齐奥尔科夫斯基公式
    const fpy = py + 320
    ctx.fillStyle = 'rgba(15,25,45,0.9)'; ctx.beginPath(); ctx.roundRect(px, fpy, pw, 140, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#4a9eff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('🚀 齐奥尔科夫斯基公式', px + 10, fpy + 18)
    ctx.fillStyle = '#e0e8f0'; ctx.font = '12px monospace'; ctx.textAlign = 'center'
    ctx.fillText('Δv = vₑ × ln(m₀/m₁)', px + pw / 2, fpy + 38)
    ctx.font = '10px monospace'; ctx.textAlign = 'left'; ctx.fillStyle = '#ffaa33'
    let dy = fpy + 56
    for (let i = 0; i < s.stages; i++) {
      let m0 = 0, m1 = 0
      for (let j = i; j < s.stages; j++) { m0 += s.dry[j] + s.fuel[j]; m1 += s.dry[j] + (j === i ? 0 : s.fuel[j]) }
      const dv = calcDv(s.vEx[i], m0, m1)
      ctx.fillText(`第${i + 1}级: Δv=${dv.toFixed(0)}m/s`, px + 10, dy); dy += 16
    }
  }

  // ========== 消息 ==========
  function drawMessage(ctx, W, H) {
    if (!message) return
    const mw = ctx.measureText(message).width + 30
    ctx.fillStyle = 'rgba(15,25,45,0.9)'; ctx.beginPath(); ctx.roundRect(W / 2 - mw / 2, H - 50, mw, 32, 6); ctx.fill()
    ctx.fillStyle = phase === 'success' ? '#44ff88' : phase === 'fail' ? '#ff4444' : '#ffaa33'
    ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(message, W / 2, H - 34)
    ctx.textBaseline = 'alphabetic'
  }

  // ─── 生命周期 ───
  useEffect(() => { S.current = init(preset) }, [preset, init])

  useEffect(() => {
    if (!running) return
    const loop = () => { step(); draw(); animRef.current = requestAnimationFrame(loop) }
    animRef.current = requestAnimationFrame(loop)
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [running, step, draw])

  useEffect(() => { if (!running) draw() }, [running, draw, phase])

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const resize = () => {
      const p = canvas.parentElement
      canvas.width = p.clientWidth; canvas.height = Math.max(500, p.clientHeight)
      if (!running) draw()
    }
    resize(); window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [draw, running])

  const btn = (bg, color, label, onClick, disabled) => (
    <button onClick={onClick} disabled={disabled}
      style={{ padding: '6px 16px', borderRadius: 6, border: 'none', cursor: disabled ? 'default' : 'pointer', background: disabled ? 'rgba(100,100,100,0.3)' : bg, color: '#fff', fontWeight: 'bold', fontSize: 13 }}>{label}</button>
  )

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#0a0e1a' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: 'rgba(15,25,45,0.9)', borderBottom: '1px solid rgba(100,180,255,0.2)', flexWrap: 'wrap' }}>
        <span style={{ color: '#4a9eff', fontWeight: 'bold', fontSize: 14 }}>🚀 运载火箭仿真</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {Object.entries(PRESETS).map(([k, p]) => (
            <button key={k} onClick={() => { setPreset(k); reset() }}
              style={{ padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', background: preset === k ? '#4a9eff' : 'rgba(100,180,255,0.1)', color: preset === k ? '#fff' : '#7888a0', fontSize: 12, fontWeight: preset === k ? 'bold' : 'normal' }}>
              {p.name}
            </button>
          ))}
        </div>
        <span style={{ color: '#7888a0', fontSize: 11 }}>{PRESETS[preset].hint}</span>
        <div style={{ flex: 1 }} />
        {btn('#ff4422', '#fff', phase === 'idle' ? '🔴 发射' : phase === 'done' ? '已完成' : '发射中...', launch, running || phase !== 'idle')}
        <button onClick={reset} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(100,180,255,0.2)', background: 'transparent', color: '#7888a0', cursor: 'pointer', fontSize: 12 }}>↺ 重置</button>
      </div>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <canvas ref={canvasRef} style={{ display: 'block' }} />
      </div>
    </div>
  )
}
