import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * CosmicVelocityScene — 三大宇宙速度 + 同步卫星
 *
 * 真实轨道力学：使用开普勒轨道方程，而非 sin() 近似
 * GM = 398600.4 km³/s² (地球引力参数)
 * R = 6371 km (地球半径)
 *
 * 四个模式：
 *   1. v₁ 环绕速度 — 圆/椭圆轨道
 *   2. v₂ 逃逸速度 — 抛物线/双曲线逃逸
 *   3. v₃ 飞出太阳系 — 日心参考系
 *   4. 同步卫星 — 地球同步轨道推导
 */

// ============ 物理常量 ============
const GM = 398600.4       // km³/s²  地球引力参数
const R_EARTH = 6371      // km      地球半径
const V1 = Math.sqrt(GM / R_EARTH)           // ≈ 7.905 km/s
const V2 = Math.sqrt(2 * GM / R_EARTH)       // ≈ 11.186 km/s
const V3 = 16.7                              // km/s (近似)
const GM_SUN = 1.327e11   // km³/s²  太阳引力参数
const AU = 149597870.7     // km      天文单位

// ============ 工具函数 ============
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

/** 给定 r0 (km), v0 (km/s), 返回轨道元素 {a, e, h, rp, ra, type} */
function computeOrbit(r0, v0) {
  const epsilon = v0 * v0 / 2 - GM / r0   // 比机械能
  const a = -GM / (2 * epsilon)            // 半长轴
  // 角动量 h = r0 * v_tangential (切向速度分量，假设切向发射)
  const h = r0 * v0
  const eSq = 1 + 2 * epsilon * h * h / (GM * GM)
  const e = Math.sqrt(Math.max(0, eSq))
  const rp = a * (1 - e)    // 近地点
  const ra = e < 1 ? a * (1 + e) : Infinity  // 远地点
  let type = 'elliptical'
  if (e > 0.999 && e < 1.001) type = 'parabolic'
  else if (e > 1) type = 'hyperbolic'
  return { a, e, h, rp, ra, epsilon, type }
}

/** r(θ) = a(1-e²)/(1+e·cosθ) */
function orbitRadius(a, e, theta) {
  const p = a * (1 - e * e)   // 半通径
  return p / (1 + e * Math.cos(theta))
}

/** dθ/dt = h / r² */
function dThetaDt(h, r) {
  return h / (r * r)
}

// ============ 组件 ============
export default function CosmicVelocityScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    mode: 'first',

    // 发射参数
    v: V1,
    launchAlt: 200,          // km 发射高度

    // 轨道状态
    launched: false,
    crashed: false,
    escaped: false,
    theta: 0,                // 真近点角 rad
    r: R_EARTH + 200,        // 当前地心距 km
    orbit: null,             // 轨道元素缓存
    trail: [],               // {x, y} 屏幕坐标轨迹
    maxTrail: 1200,
    time: 0,
    dt: 0.015,               // 物理时间步 s (动画用)

    // 同步卫星模式
    syncH: 35786,
    syncT: 24,
    syncV: 3.07,
    syncAngle: 0,

    // 第三宇宙速度模式
    earthOrbitAngle: 0,
    satRelAngle: 0,
    satDistFromEarth: 0,
    v3Launched: false,
    v3Trail: [],

    // 渲染缓存
    stars: null,
    lastResizeW: 0,
    lastResizeH: 0,
  })

  const [mode, setMode] = useState('first')
  const [v, setV] = useState(V1)
  const [syncH, setSyncH] = useState(35786)
  const [, forceUpdate] = useState(0)

  // ============ 渲染器初始化 ============
  const createRenderer = useCallback((canvas) => {
    const ctx = canvas.getContext('2d')
    const R = {
      canvas, ctx,
      W: 0, H: 0, dpr: 1,
      ox: 0, oy: 0,
      scale: 1,          // km -> px
      resize() {
        const dpr = window.devicePixelRatio || 1
        const rect = canvas.getBoundingClientRect()
        this.dpr = dpr
        canvas.width = rect.width * dpr
        canvas.height = rect.height * dpr
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        this.W = rect.width
        this.H = rect.height
        this.ox = this.W / 2
        this.oy = this.H / 2
      },
    }
    R.resize()
    return R
  }, [])

  // ============ 生成星星（仅一次） ============
  function ensureStars() {
    const s = S.current
    if (s.stars) return
    const arr = []
    for (let i = 0; i < 80; i++) {
      // 用确定性伪随机
      arr.push({
        x: (Math.sin(i * 137.508 + 0.1) * 0.5 + 0.5),
        y: (Math.cos(i * 97.314 + 0.2) * 0.5 + 0.5),
        r: 0.5 + (Math.sin(i * 43.7) * 0.5 + 0.5) * 1.2,
        a: 0.15 + (Math.cos(i * 71.3) * 0.5 + 0.5) * 0.25,
      })
    }
    s.stars = arr
  }

  // ============ 物理更新 ============
  function updatePhysics() {
    const s = S.current

    if (s.mode === 'third') {
      updateThirdVelocity(s)
      return
    }

    if (s.mode === 'sync') {
      updateSyncSatellite(s)
      return
    }

    if (!s.launched || s.crashed || s.escaped) return

    const dt = s.dt
    const steps = 3  // 每帧多步

    for (let i = 0; i < steps; i++) {
      if (s.crashed || s.escaped) break

      const r = s.r
      const orbit = s.orbit

      // 用真实轨道方程
      const dtheta = dThetaDt(orbit.h, r) * dt
      s.theta += dtheta

      // 更新 r
      const newR = orbitRadius(orbit.a, orbit.e, s.theta)
      s.r = newR

      // 碰撞检测
      if (newR < R_EARTH) {
        s.crashed = true
        break
      }

      // 逃逸检测
      if (newR > R_EARTH * 12) {
        s.escaped = true
        break
      }
    }

    // 记录轨迹（屏幕坐标）
    const R = canvasRef.current?._R
    if (R) {
      const earthR_px = Math.min(R.W, R.H) * (s.mode === 'second' ? 0.15 : 0.18)
      const scale = earthR_px / R_EARTH
      recordTrail(s, scale)
    }

    s.time += dt * steps
  }

  function updateThirdVelocity(s) {
    if (!s.v3Launched) return

    const dt = s.dt * 0.4

    // 地球公转角速度 (rad/s)
    const omegaEarth = Math.sqrt(GM_SUN / (AU * AU * AU))
    s.earthOrbitAngle += omegaEarth * dt * 8000  // 加速可视化

    // 卫星离地球越来越远
    s.satDistFromEarth += dt * 1800
    s.satRelAngle += dt * 0.5

    // 轨迹
    const earthX = s.earthOrbitAngle
    const earthR_screen = 120
    const satR = earthR_screen + s.satDistFromEarth * 0.015
    const satAngle = earthX + s.satRelAngle * 0.3

    s.v3Trail.push({ angle: satAngle, r: satR })
    if (s.v3Trail.length > 600) s.v3Trail.shift()

    s.time += dt
  }

  function updateSyncSatellite(s) {
    // 同步卫星角速度
    const r_km = R_EARTH + s.syncH
    const omega = Math.sqrt(GM / (r_km * r_km * r_km))
    s.syncAngle += omega * s.dt * 500  // 加速可视化
    s.time += s.dt
  }

  function recordTrail(s, scale) {
    const r_px = worldToScreen(s.r, scale)
    const x = r_px * Math.cos(s.theta)
    const y = r_px * Math.sin(s.theta)
    s.trail.push({ x, y })
    if (s.trail.length > s.maxTrail) s.trail.shift()
  }

  // 坐标转换：km -> 屏幕像素
  function worldToScreen(r_km, scale) {
    return r_km * scale
  }

  // ============ 渲染 ============
  function renderFrame(R) {
    const ctx = R.ctx
    const s = S.current

    // 背景
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, R.W, R.H)

    // 微弱星星（浅色背景上几乎不可见，仅用于装饰）
    if (s.stars) {
      ctx.fillStyle = 'rgba(0,0,0,0.04)'
      for (const st of s.stars) {
        ctx.beginPath()
        ctx.arc(st.x * R.W, st.y * R.H, st.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    if (s.mode === 'first') drawFirstVelocity(ctx, R)
    else if (s.mode === 'second') drawSecondVelocity(ctx, R)
    else if (s.mode === 'third') drawThirdVelocity(ctx, R)
    else drawSyncSatellite(ctx, R)

    drawInfoPanel(ctx, R)
  }

  // ============ 地球绘制 ============
  function drawEarth(ctx, R, earthR_px) {
    const cx = R.ox, cy = R.oy

    // 大气层
    const atmos = ctx.createRadialGradient(cx, cy, earthR_px * 0.95, cx, cy, earthR_px * 1.12)
    atmos.addColorStop(0, 'rgba(100,181,246,0.18)')
    atmos.addColorStop(1, 'rgba(100,181,246,0)')
    ctx.fillStyle = atmos
    ctx.beginPath()
    ctx.arc(cx, cy, earthR_px * 1.12, 0, Math.PI * 2)
    ctx.fill()

    // 地球本体
    const grad = ctx.createRadialGradient(cx - earthR_px * 0.25, cy - earthR_px * 0.25, 0, cx, cy, earthR_px)
    grad.addColorStop(0, '#81C784')
    grad.addColorStop(0.3, '#4DB6AC')
    grad.addColorStop(0.6, '#4FC3F7')
    grad.addColorStop(1, '#1565C0')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(cx, cy, earthR_px, 0, Math.PI * 2)
    ctx.fill()

    // 陆地块
    ctx.fillStyle = 'rgba(76,175,80,0.35)'
    ctx.beginPath()
    ctx.arc(cx - earthR_px * 0.15, cy - earthR_px * 0.1, earthR_px * 0.28, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(cx + earthR_px * 0.25, cy + earthR_px * 0.15, earthR_px * 0.22, 0, Math.PI * 2)
    ctx.fill()

    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.beginPath()
    ctx.arc(cx - earthR_px * 0.3, cy - earthR_px * 0.3, earthR_px * 0.35, 0, Math.PI * 2)
    ctx.fill()

    // 标签
    ctx.fillStyle = '#333'
    ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText('地球', cx, cy + earthR_px + 10)
    ctx.fillStyle = '#888'
    ctx.font = '11px sans-serif'
    ctx.fillText('R = 6371 km', cx, cy + earthR_px + 26)
  }

  // ============ 第一宇宙速度 ============
  function drawFirstVelocity(ctx, R) {
    const s = S.current
    const earthR_px = Math.min(R.W, R.H) * 0.18

    // 计算轨道显示缩放
    const scale = earthR_px / R_EARTH  // km -> px

    drawEarth(ctx, R, earthR_px)

    if (s.launched && !s.crashed && !s.escaped) {
      const orbit = s.orbit

      // 画理论轨道椭圆
      ctx.strokeStyle = 'rgba(74,144,217,0.25)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      for (let i = 0; i <= 360; i++) {
        const ang = (i * Math.PI) / 180
        const r_km = orbitRadius(orbit.a, orbit.e, ang)
        const r_px = r_km * scale
        const x = R.ox + r_px * Math.cos(ang)
        const y = R.oy + r_px * Math.sin(ang)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.stroke()
      ctx.setLineDash([])

      // 轨迹
      if (s.trail.length > 1) {
        ctx.strokeStyle = 'rgba(255,152,0,0.5)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(s.trail[0].x + R.ox, s.trail[0].y + R.oy)
        for (let i = 1; i < s.trail.length; i++) {
          ctx.lineTo(s.trail[i].x + R.ox, s.trail[i].y + R.oy)
        }
        ctx.stroke()
      }

      // 卫星位置
      const r_px = s.r * scale
      const sx = R.ox + r_px * Math.cos(s.theta)
      const sy = R.oy + r_px * Math.sin(s.theta)

      // 卫星本体
      drawSatellite(ctx, sx, sy, s.theta)

      // 速度箭头（切线方向）
      const vAngle = s.theta + Math.PI / 2
      drawArrow(ctx, sx, sy, vAngle, 30, '#4CAF50', 'v')

      // 半径线
      ctx.strokeStyle = 'rgba(255,152,0,0.3)'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(R.ox, R.oy)
      ctx.lineTo(sx, sy)
      ctx.stroke()
      ctx.setLineDash([])

      // 高度标注
      ctx.fillStyle = '#E65100'
      ctx.font = '11px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      const midX = (R.ox + sx) / 2
      const midY = (R.oy + sy) / 2
      ctx.fillText(`h = ${(s.r - R_EARTH).toFixed(0)} km`, midX, midY - 6)

      // 轨道类型标注
      let orbitType = ''
      if (orbit.e < 0.01) orbitType = '近似圆轨道 (e ≈ 0)'
      else if (orbit.e < 1) orbitType = `椭圆轨道 (e = ${orbit.e.toFixed(3)})`
      else orbitType = `双曲线 (e = ${orbit.e.toFixed(3)})`
      ctx.fillStyle = '#4A90D9'
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(orbitType, 16, R.H - 60)
    }

    if (s.crashed) {
      ctx.fillStyle = '#D32F2F'
      ctx.font = 'bold 18px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('💥 撞击地球！速度过低', R.W / 2, 50)
      ctx.font = '13px sans-serif'
      ctx.fillText('v < v₁ 时，卫星无法维持轨道', R.W / 2, 75)
    }

    if (s.escaped) {
      ctx.fillStyle = '#FF9800'
      ctx.font = 'bold 18px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('🛰️ 速度过高，脱离地球引力！', R.W / 2, 50)
    }

    // 公式面板
    drawFormulaPanel(ctx, R, [
      { text: 'v₁ = √(GM/R) = √(gR)', bold: true, color: '#333' },
      { text: `   = √(${GM.toFixed(0)}/${R_EARTH})`, color: '#555' },
      { text: `   ≈ ${V1.toFixed(1)} km/s`, bold: true, color: '#4A90D9' },
      { text: '', color: '#555' },
      { text: `当前 v = ${s.v.toFixed(1)} km/s`, color: s.v < V1 ? '#D32F2F' : '#4CAF50', bold: true },
      { text: `v/v₁ = ${(s.v / V1).toFixed(2)}`, color: '#555' },
    ], R.W - 220, 16)
  }

  // ============ 第二宇宙速度 ============
  function drawSecondVelocity(ctx, R) {
    const s = S.current
    const earthR_px = Math.min(R.W, R.H) * 0.15
    const scale = earthR_px / R_EARTH

    drawEarth(ctx, R, earthR_px)

    // 始终显示 v₁ 圆轨道作对比
    const v1OrbitR = earthR_px
    ctx.strokeStyle = 'rgba(76,175,80,0.3)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.arc(R.ox, R.oy, v1OrbitR, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#4CAF50'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillText('v₁ 圆轨道', R.ox + v1OrbitR + 4, R.oy - 4)

    if (s.launched && !s.crashed && !s.escaped) {
      const orbit = s.orbit

      // 画轨道（椭圆或双曲线）
      ctx.strokeStyle = 'rgba(255,152,0,0.4)'
      ctx.lineWidth = 2
      ctx.beginPath()

      if (orbit.type === 'hyperbolic') {
        // 双曲线：只画可见部分
        const maxTheta = Math.acos(-1 / orbit.e) * 0.95  // 渐近线角
        for (let i = 0; i <= 200; i++) {
          const ang = -maxTheta + (2 * maxTheta * i) / 200
          const r_km = orbitRadius(orbit.a, orbit.e, ang)
          const r_px = Math.min(r_km * scale, earthR_px * 6)
          const x = R.ox + r_px * Math.cos(ang + s.theta)
          const y = R.oy + r_px * Math.sin(ang + s.theta)
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
      } else {
        // 椭圆
        for (let i = 0; i <= 360; i++) {
          const ang = (i * Math.PI) / 180
          const r_km = orbitRadius(orbit.a, orbit.e, ang)
          const r_px = r_km * scale
          const x = R.ox + r_px * Math.cos(ang)
          const y = R.oy + r_px * Math.sin(ang)
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.closePath()
      }
      ctx.stroke()

      // 轨迹
      if (s.trail.length > 1) {
        ctx.strokeStyle = 'rgba(255,152,0,0.6)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(s.trail[0].x + R.ox, s.trail[0].y + R.oy)
        for (let i = 1; i < s.trail.length; i++) {
          ctx.lineTo(s.trail[i].x + R.ox, s.trail[i].y + R.oy)
        }
        ctx.stroke()
      }

      // 卫星
      const r_px = Math.min(s.r * scale, earthR_px * 6)
      const sx = R.ox + r_px * Math.cos(s.theta)
      const sy = R.oy + r_px * Math.sin(s.theta)
      drawSatellite(ctx, sx, sy, s.theta)
    }

    if (s.escaped) {
      ctx.fillStyle = '#FF9800'
      ctx.font = 'bold 18px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('🚀 成功逃逸地球引力！', R.W / 2, 50)
      ctx.font = '13px sans-serif'
      ctx.fillText(`e = ${s.orbit?.e.toFixed(3) || '—'}  (e > 1 为双曲线逃逸)`, R.W / 2, 75)
    }

    if (s.crashed) {
      ctx.fillStyle = '#D32F2F'
      ctx.font = 'bold 16px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('💥 速度不足以逃逸，坠回地球', R.W / 2, 50)
    }

    drawFormulaPanel(ctx, R, [
      { text: 'v₂ = √(2GM/R) = √(2gR)', bold: true, color: '#333' },
      { text: `   = √2 × v₁ ≈ √2 × ${V1.toFixed(1)}`, color: '#555' },
      { text: `   ≈ ${V2.toFixed(1)} km/s`, bold: true, color: '#FF9800' },
      { text: '', color: '#555' },
      { text: `当前 v = ${s.v.toFixed(1)} km/s`, color: s.v >= V2 ? '#FF9800' : '#D32F2F', bold: true },
      { text: s.v >= V2 ? 'v ≥ v₂ → 逃逸！' : 'v < v₂ → 椭圆轨道', color: '#555' },
    ], R.W - 220, 16)
  }

  // ============ 第三宇宙速度 ============
  function drawThirdVelocity(ctx, R) {
    const s = S.current
    const sunX = R.W * 0.5, sunY = R.oy

    // 太阳
    const sunR = 20
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 2.5)
    sunGrad.addColorStop(0, '#FFF9C4')
    sunGrad.addColorStop(0.3, '#FFD54F')
    sunGrad.addColorStop(1, 'rgba(255,152,0,0)')
    ctx.fillStyle = sunGrad
    ctx.beginPath()
    ctx.arc(sunX, sunY, sunR * 2.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#FFD54F'
    ctx.beginPath()
    ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#F57F17'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText('太阳', sunX, sunY + sunR + 6)

    // 地球轨道
    const earthOrbitR = Math.min(R.W, R.H) * 0.28
    ctx.strokeStyle = 'rgba(74,144,217,0.2)'
    ctx.lineWidth = 1
    ctx.setLineDash([8, 4])
    ctx.beginPath()
    ctx.arc(sunX, sunY, earthOrbitR, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])

    // 地球位置
    const ex = sunX + earthOrbitR * Math.cos(s.earthOrbitAngle)
    const ey = sunY + earthOrbitR * Math.sin(s.earthOrbitAngle)
    ctx.fillStyle = '#4FC3F7'
    ctx.beginPath()
    ctx.arc(ex, ey, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#1565C0'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('地球', ex, ey + 14)

    if (s.v3Launched) {
      // 卫星从地球飞出
      const satR = earthOrbitR + s.satDistFromEarth * 0.015
      const satAngle = s.earthOrbitAngle + s.satRelAngle * 0.3
      const satX = sunX + satR * Math.cos(satAngle)
      const satY = sunY + satR * Math.sin(satAngle)

      // 轨迹
      if (s.v3Trail.length > 1) {
        ctx.strokeStyle = 'rgba(244,67,54,0.4)'
        ctx.lineWidth = 2
        ctx.beginPath()
        for (let i = 0; i < s.v3Trail.length; i++) {
          const p = s.v3Trail[i]
          const px = sunX + p.r * Math.cos(p.angle)
          const py = sunY + p.r * Math.sin(p.angle)
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.stroke()
      }

      // 卫星
      ctx.fillStyle = '#FFD54F'
      ctx.beginPath()
      ctx.arc(satX, satY, 4, 0, Math.PI * 2)
      ctx.fill()
      // 太阳能板
      ctx.strokeStyle = '#999'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(satX - 8, satY)
      ctx.lineTo(satX + 8, satY)
      ctx.stroke()

      // 速度箭头
      const vAngle = satAngle + Math.PI / 2
      drawArrow(ctx, satX, satY, vAngle, 25, '#F44336', 'v₃')
    }

    // 推导面板
    drawFormulaPanel(ctx, R, [
      { text: '第三宇宙速度推导', bold: true, color: '#333' },
      { text: '', color: '#555' },
      { text: '① 逃逸地球: v₂ = 11.2 km/s', color: '#555' },
      { text: '② 逃逸太阳(在地球轨道):', color: '#555' },
      { text: '   v_sun = √(2GM_sun/AU)', color: '#4A90D9' },
      { text: '   ≈ 42.1 km/s', color: '#4A90D9' },
      { text: '③ 地球公转: v_earth = 29.8 km/s', color: '#555' },
      { text: '④ 需额外: 42.1 - 29.8 = 12.3 km/s', color: '#555' },
      { text: '', color: '#555' },
      { text: '⑤ v₃ = √(v₂² + 12.3²)', bold: true, color: '#F44336' },
      { text: `   ≈ ${V3} km/s`, bold: true, color: '#F44336' },
    ], R.W - 240, 16)
  }

  // ============ 同步卫星 ============
  function drawSyncSatellite(ctx, R) {
    const s = S.current
    const earthR_px = Math.min(R.W, R.H) * 0.12
    const scale = earthR_px / R_EARTH

    drawEarth(ctx, R, earthR_px)

    // 低轨道对比 (400 km)
    const lowOrbitR = (R_EARTH + 400) * scale
    ctx.strokeStyle = 'rgba(158,158,158,0.35)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.arc(R.ox, R.oy, lowOrbitR, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#999'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('低轨道 400km', R.ox + lowOrbitR + 4, R.oy)

    // 同步轨道
    const syncOrbitR = (R_EARTH + s.syncH) * scale
    ctx.strokeStyle = 'rgba(74,144,217,0.5)'
    ctx.lineWidth = 2
    ctx.setLineDash([8, 4])
    ctx.beginPath()
    ctx.arc(R.ox, R.oy, syncOrbitR, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])

    // 赤道平面指示线
    ctx.strokeStyle = 'rgba(74,144,217,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(R.ox - syncOrbitR - 20, R.oy)
    ctx.lineTo(R.ox + syncOrbitR + 20, R.oy)
    ctx.stroke()
    ctx.fillStyle = '#4A90D9'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText('赤道平面', R.ox + syncOrbitR + 18, R.oy - 6)

    // 同步卫星
    const sx = R.ox + syncOrbitR * Math.cos(s.syncAngle)
    const sy = R.oy + syncOrbitR * Math.sin(s.syncAngle)

    drawSatellite(ctx, sx, sy, s.syncAngle, 7)

    // 连线
    ctx.strokeStyle = 'rgba(255,152,0,0.3)'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(R.ox, R.oy)
    ctx.lineTo(sx, sy)
    ctx.stroke()
    ctx.setLineDash([])

    // 半径标注
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(R.ox, R.oy)
    ctx.lineTo(R.ox + syncOrbitR, R.oy)
    ctx.stroke()
    ctx.fillStyle = '#555'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(`r = ${(R_EARTH + s.syncH).toLocaleString()} km`, R.ox + syncOrbitR / 2, R.oy + 6)

    // 推导面板
    const r_km = R_EARTH + s.syncH
    const period_h = (2 * Math.PI * Math.sqrt(r_km * r_km * r_km / GM)) / 3600
    const orbV = Math.sqrt(GM / r_km)

    drawFormulaPanel(ctx, R, [
      { text: '📡 同步卫星推导', bold: true, color: '#333' },
      { text: '', color: '#555' },
      { text: '① T = 24h = 86400s', color: '#555' },
      { text: '② 引力 = 向心力:', color: '#555' },
      { text: '   GMm/r² = m·4π²r/T²', color: '#4A90D9' },
      { text: '③ r³ = GMT²/(4π²)', color: '#555' },
      { text: `④ r = ${r_km.toLocaleString()} km`, color: '#555' },
      { text: `⑤ h = r - R = ${s.syncH.toLocaleString()} km`, bold: true, color: '#4A90D9' },
      { text: `⑥ v = 2πr/T = ${orbV.toFixed(2)} km/s`, color: '#555' },
      { text: '', color: '#555' },
      { text: `当前 T = ${period_h.toFixed(1)} h`, color: '#333', bold: true },
      { text: `当前 v = ${orbV.toFixed(2)} km/s`, color: '#333' },
    ], R.W - 240, 16)

    // 高度滑块标注
    ctx.fillStyle = '#333'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(`轨道高度 h = ${s.syncH.toLocaleString()} km`, 16, R.H - 35)
  }

  // ============ 通用绘制 ============
  function drawSatellite(ctx, x, y, angle, size) {
    const sz = size || 5
    // 本体
    ctx.fillStyle = '#FFD54F'
    ctx.beginPath()
    ctx.arc(x, y, sz, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#F9A825'
    ctx.lineWidth = 1
    ctx.stroke()

    // 太阳能板
    const panelLen = sz * 2.4
    const panelW = sz * 0.8
    const cos = Math.cos(angle), sin = Math.sin(angle)
    ctx.fillStyle = '#1565C0'
    ctx.strokeStyle = '#0D47A1'
    ctx.lineWidth = 0.5

    // 左面板
    ctx.fillRect(x - cos * panelLen - panelW / 2, y - sin * panelLen - panelW / 2, panelLen, panelW)
    // 右面板
    ctx.fillRect(x + cos * panelLen - panelW / 2, y + sin * panelLen - panelW / 2, panelLen, panelW)
  }

  function drawArrow(ctx, x, y, angle, len, color, label) {
    const ex = x + Math.cos(angle) * len
    const ey = y + Math.sin(angle) * len
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(ex, ey)
    ctx.stroke()

    // 箭头
    const headLen = 8
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(ex, ey)
    ctx.lineTo(ex - headLen * Math.cos(angle - 0.35), ey - headLen * Math.sin(angle - 0.35))
    ctx.lineTo(ex - headLen * Math.cos(angle + 0.35), ey - headLen * Math.sin(angle + 0.35))
    ctx.closePath()
    ctx.fill()

    if (label) {
      ctx.fillStyle = color
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(label, ex + Math.cos(angle) * 12, ey + Math.sin(angle) * 12)
    }
  }

  function drawFormulaPanel(ctx, R, lines, x, y) {
    const lineH = 18
    const padX = 12, padY = 10
    const w = 210
    const h = lines.length * lineH + padY * 2

    // 背景
    ctx.fillStyle = 'rgba(245,245,245,0.95)'
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, 6)
    ctx.fill()
    ctx.strokeStyle = '#ddd'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, 6)
    ctx.stroke()

    // 文字
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    let cy = y + padY
    for (const line of lines) {
      if (!line.text) { cy += lineH * 0.5; continue }
      ctx.fillStyle = line.color || '#333'
      ctx.font = line.bold ? 'bold 12px sans-serif' : '11px sans-serif'
      ctx.fillText(line.text, x + padX, cy)
      cy += lineH
    }
  }

  // ============ 信息面板 ============
  function drawInfoPanel(ctx, R) {
    const s = S.current
    const panelW = 180
    const panelH = 100
    const x = 16, y = R.H - panelH - 16

    ctx.fillStyle = 'rgba(245,245,245,0.95)'
    ctx.beginPath()
    ctx.roundRect(x, y, panelW, panelH, 6)
    ctx.fill()
    ctx.strokeStyle = '#ddd'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(x, y, panelW, panelH, 6)
    ctx.stroke()

    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillStyle = '#333'
    ctx.font = 'bold 12px sans-serif'
    ctx.fillText('宇宙速度参考', x + 10, y + 8)

    ctx.font = '11px sans-serif'
    const items = [
      { v: '7.9', label: '环绕速度', color: '#4CAF50' },
      { v: '11.2', label: '逃逸速度', color: '#FF9800' },
      { v: '16.7', label: '飞出太阳系', color: '#F44336' },
    ]
    let cy = y + 28
    for (const item of items) {
      ctx.fillStyle = item.color
      ctx.fillText(`v = ${item.v} km/s  ${item.label}`, x + 10, cy)
      cy += 18
    }
  }

  // ============ 动画循环 ============
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const R = createRenderer(canvas)
    canvasRef.current._R = R

    ensureStars()

    const loop = () => {
      updatePhysics()
      renderFrame(R)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)

    const onResize = () => R.resize()
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [createRenderer])

  // ============ 同步卫星高度变化时重新计算 ============
  useEffect(() => {
    const s = S.current
    s.syncH = syncH
    const r_km = R_EARTH + syncH
    s.syncV = Math.sqrt(GM / r_km)
    s.syncT = (2 * Math.PI * Math.sqrt(r_km * r_km * r_km / GM)) / 3600
  }, [syncH])

  // ============ 控制 ============
  const handleLaunch = useCallback(() => {
    const s = S.current
    s.launched = true
    s.crashed = false
    s.escaped = false
    s.time = 0

    if (s.mode === 'third') {
      s.v3Launched = true
      s.satDistFromEarth = 0
      s.satRelAngle = 0
      s.v3Trail = []
      return
    }

    // 计算初始轨道
    const r0 = R_EARTH + s.launchAlt
    const v0 = s.v
    s.r = r0
    s.theta = 0
    s.orbit = computeOrbit(r0, v0)
    s.trail = []
  }, [])

  const handleReset = useCallback(() => {
    const s = S.current
    s.launched = false
    s.crashed = false
    s.escaped = false
    s.theta = 0
    s.r = R_EARTH + s.launchAlt
    s.orbit = null
    s.trail = []
    s.time = 0
    s.v3Launched = false
    s.v3Trail = []
    s.satDistFromEarth = 0
    s.syncAngle = 0
  }, [])

  const handleVChange = useCallback((val) => {
    S.current.v = val
    setV(val)
  }, [])

  const handleModeChange = useCallback((newMode) => {
    S.current.mode = newMode
    handleReset()
    setMode(newMode)
  }, [handleReset])

  const handleSyncHChange = useCallback((val) => {
    setSyncH(val)
  }, [])

  // ============ UI ============
  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <span style={styles.title}>三大宇宙速度 · 同步卫星</span>
        <div style={styles.toolbarActions}>
          <div style={styles.modeGroup}>
            {[
              { key: 'first', label: 'v₁ 环绕' },
              { key: 'second', label: 'v₂ 逃逸' },
              { key: 'third', label: 'v₃ 飞出' },
              { key: 'sync', label: '同步卫星' },
            ].map(m => (
              <button
                key={m.key}
                style={mode === m.key ? styles.modeBtnActive : styles.modeBtn}
                onClick={() => handleModeChange(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div style={styles.sep} />

          {mode !== 'third' && (
            <label style={styles.controlLabel}>
              发射速度：
              <input
                type="range"
                min="1"
                max="20"
                step="0.1"
                value={v}
                onChange={(e) => handleVChange(parseFloat(e.target.value))}
                style={styles.slider}
              />
              <span style={styles.sliderVal}>{v.toFixed(1)} km/s</span>
            </label>
          )}

          {mode === 'sync' && (
            <label style={styles.controlLabel}>
              轨道高度：
              <input
                type="range"
                min="200"
                max="100000"
                step="100"
                value={syncH}
                onChange={(e) => handleSyncHChange(parseInt(e.target.value))}
                style={styles.slider}
              />
              <span style={styles.sliderVal}>{syncH.toLocaleString()} km</span>
            </label>
          )}

          <button style={styles.launchBtn} onClick={handleLaunch}>🚀 发射</button>
          <button style={styles.resetBtn} onClick={handleReset}>↺ 重置</button>
        </div>
      </div>

      <div style={styles.main}>
        <canvas ref={canvasRef} style={styles.canvas} />
      </div>

      <div style={styles.desc}>
        <b style={{ color: '#333' }}>宇宙速度</b>
        <span style={{ marginLeft: 12, color: '#666', fontSize: 13 }}>
          {mode === 'first' && '调节发射速度 → 观察圆形/椭圆轨道变化，v < v₁ 则坠落'}
          {mode === 'second' && 'v ≥ v₂ = 11.2 km/s 时物体逃逸地球引力，轨道为双曲线'}
          {mode === 'third' && 'v₃ = √(v₂² + 12.3²) ≈ 16.7 km/s，可飞出太阳系'}
          {mode === 'sync' && '同步卫星：T = 24h，h = 35786 km，在赤道平面上空'}
        </span>
      </div>
    </div>
  )
}

// ============ 样式 ============
const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: '#e8e8e8',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    overflow: 'hidden',
  },
  toolbar: {
    minHeight: 44,
    background: '#f5f5f5',
    borderBottom: '1px solid #ccc',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 16px',
    flexShrink: 0,
    flexWrap: 'wrap',
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: 600,
    color: '#333',
  },
  toolbarActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  modeGroup: {
    display: 'flex',
    gap: 4,
  },
  modeBtn: {
    background: '#f0f0f0',
    color: '#555',
    border: '1px solid #ddd',
    borderRadius: 4,
    padding: '5px 10px',
    fontSize: 12,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  modeBtnActive: {
    background: '#4A90D9',
    color: '#fff',
    border: '1px solid #4A90D9',
    borderRadius: 4,
    padding: '5px 10px',
    fontSize: 12,
    cursor: 'pointer',
    fontWeight: 600,
    transition: 'all 0.15s',
  },
  sep: {
    width: 1,
    height: 24,
    background: '#ddd',
  },
  controlLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: '#555',
  },
  slider: {
    width: 90,
    accentColor: '#4A90D9',
  },
  sliderVal: {
    color: '#4A90D9',
    fontWeight: 600,
    minWidth: 70,
    fontSize: 12,
  },
  launchBtn: {
    background: '#4A90D9',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '5px 14px',
    fontSize: 13,
    cursor: 'pointer',
    fontWeight: 600,
  },
  resetBtn: {
    background: '#f0f0f0',
    color: '#555',
    border: '1px solid #ddd',
    borderRadius: 4,
    padding: '5px 12px',
    fontSize: 12,
    cursor: 'pointer',
  },
  main: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    position: 'relative',
    minHeight: 0,
  },
  canvas: {
    flex: 1,
    width: '100%',
    background: '#fff',
  },
  desc: {
    padding: '8px 16px',
    background: '#f5f5f5',
    borderTop: '1px solid #ccc',
    fontSize: 13,
    flexShrink: 0,
  },
}
