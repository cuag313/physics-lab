import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * RocketScene — 运载火箭发射仿真（v4 教学版）
 *
 * 物理模型：
 *   推力：F_thrust = (dm/dt) × v_exhaust
 *   阻力：F_drag = ½ρCdAv²
 *   运动：ma = F_thrust - mg - F_drag
 *   齐奥尔科夫斯基公式：Δv = vₑ × ln(m₀/m₁)
 *
 * 设计原则：通俗易懂，教学优先
 */

// ─── 物理常量 ───
const G = 9.8
const RHO0 = 1.225        // 地面空气密度
const H_SCALE = 8500       // 大气标高 (m)
const CD = 0.35            // 阻力系数
const A_REF = 1.13         // 参考面积 (m²)
const DT = 1 / 60          // 仿真步长

// ─── 颜色 ───
const C = {
  bg: '#0a0e1a',
  ground: '#2a3a2a',
  panel: 'rgba(15,25,45,0.85)',
  border: 'rgba(100,180,255,0.2)',
  text: '#e0e8f0',
  dim: '#7888a0',
  accent: '#4a9eff',
  warn: '#ffaa33',
  danger: '#ff4444',
  success: '#44ff88',
  thrust: '#ff6622',
  gravity: '#66aaff',
  drag: '#ffcc44',
}

// ─── 预设方案 ───
const PRESETS = {
  single: { name: '单级火箭', stages: 1, fuel: [8000], dryMass: [1500], vExhaust: [3200], burnTime: [120] },
  two:    { name: '两级火箭', stages: 2, fuel: [6000, 2000], dryMass: [1200, 500], vExhaust: [3200, 3500], burnTime: [80, 60] },
  three:  { name: '三级火箭', stages: 3, fuel: [5000, 2500, 800], dryMass: [1000, 600, 300], vExhaust: [3200, 3500, 3800], burnTime: [60, 45, 30] },
}

// ─── 物理工具 ───
function airDensity(h) { return RHO0 * Math.exp(-h / H_SCALE) }
function dragForce(v, h) { return 0.5 * airDensity(h) * CD * A_REF * v * v * Math.sign(v) }

// ─── 齐奥尔科夫斯基公式计算 ───
function calcDeltaV(vExhaust, m0, m1) {
  if (m1 <= 0 || m0 <= m1) return 0
  return vExhaust * Math.log(m0 / m1)
}

export default function RocketScene() {
  const canvasRef = useRef(null)
  const stateRef = useRef(null)
  const animRef = useRef(null)
  const [preset, setPreset] = useState('two')
  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState('idle')  // idle | launching | coasting | done
  const [data, setData] = useState(null)

  // 初始化仿真状态
  const initState = useCallback((presetKey) => {
    const p = PRESETS[presetKey]
    const stageFuel = [...p.fuel]
    const stageDry = [...p.dryMass]
    const stageVEx = [...p.vExhaust]
    const stageBurn = [...p.burnTime]
    const totalDry = stageDry.reduce((a, b) => a + b, 0)
    const totalFuel = stageFuel.reduce((a, b) => a + b, 0)

    return {
      preset: p,
      stages: p.stages,
      stageFuel,        // 各级剩余燃料 (kg)
      stageDry,         // 各级干重 (kg)
      stageVEx,         // 各级排气速度 (m/s)
      stageBurn,        // 各级燃烧时间 (s)
      currentStage: 0,  // 当前级（0-indexed）
      h: 0,             // 高度 (m)
      v: 0,             // 速度 (m/s)
      a: 0,             // 加速度 (m/s²)
      time: 0,          // 飞行时间 (s)
      totalDry,
      totalFuel,
      fuelBurned: 0,
      thrust: 0,
      gravity: 0,
      drag: 0,
      peakAlt: 0,
      peakV: 0,
      trail: [],        // 轨迹点 [{t, h, v}]
      separated: [],    // 已分离级 [{stage, time, h}]
      launched: false,
      engineOn: true,
    }
  }, [])

  // 重置
  const reset = useCallback(() => {
    const s = initState(preset)
    stateRef.current = s
    setPhase('idle')
    setRunning(false)
    setData(null)
  }, [preset, initState])

  // 发射
  const launch = useCallback(() => {
    const s = stateRef.current
    if (!s || s.launched) return
    s.launched = true
    setRunning(true)
    setPhase('launching')
  }, [])

  // 物理步进
  const step = useCallback(() => {
    const s = stateRef.current
    if (!s || !s.launched) return

    const dt = DT
    const stage = s.currentStage

    // 当前级燃料
    let fuel = s.stageFuel[stage]
    let dryMass = 0
    for (let i = stage; i < s.stages; i++) dryMass += s.stageDry[i]
    let fuelMass = 0
    for (let i = stage; i < s.stages; i++) fuelMass += s.stageFuel[i]
    const m = dryMass + fuelMass

    // 推力计算
    let thrust = 0
    let massFlow = 0
    if (fuel > 0 && s.engineOn) {
      const burnTime = s.stageBurn[stage]
      massFlow = s.stageFuel[stage] / burnTime  // kg/s
      thrust = massFlow * s.stageVEx[stage]
      // 消耗燃料
      const fuelUsed = Math.min(massFlow * dt, fuel)
      s.stageFuel[stage] -= fuelUsed
      s.fuelBurned += fuelUsed
      fuel = s.stageFuel[stage]
    }

    // 外力
    const grav = m * G
    const drag = h => dragForce(s.v, h)
    const F_drag = drag(s.h)

    // 合力与加速度
    const F_net = thrust - grav - F_drag
    s.a = F_net / m
    s.thrust = thrust
    s.gravity = grav
    s.drag = F_drag

    // 运动学
    s.v += s.a * dt
    s.h += s.v * dt
    s.time += dt

    // 防止穿过地面
    if (s.h < 0) { s.h = 0; s.v = 0 }

    // 记录峰值
    if (s.h > s.peakAlt) s.peakAlt = s.h
    if (s.v > s.peakV) s.peakV = s.v

    // 轨迹采样（每0.5秒一个点）
    const last = s.trail[s.trail.length - 1]
    if (!last || s.time - last.t > 0.5) {
      s.trail.push({ t: s.time, h: s.h, v: s.v })
    }

    // 级间分离
    if (fuel <= 0 && stage < s.stages - 1) {
      s.separated.push({ stage, time: s.time, h: s.h })
      s.currentStage++
    }

    // 发射结束条件：所有燃料用完且速度≤0且不在地面
    const allEmpty = s.stageFuel.every(f => f <= 0)
    if (allEmpty && s.v <= 0 && s.h > 0) {
      // 继续受重力下落
    }
    if (allEmpty && s.h <= 0 && s.time > 1) {
      setPhase('done')
      setRunning(false)
    }

    // 更新UI数据
    setData({
      time: s.time,
      h: s.h,
      v: s.v,
      a: s.a,
      m: m,
      thrust: s.thrust,
      gravity: s.gravity,
      drag: s.drag,
      stage: s.currentStage,
      fuel: s.stageFuel.reduce((a, b) => a + b, 0),
      fuelBurned: s.fuelBurned,
      peakAlt: s.peakAlt,
      peakV: s.peakV,
      engineOn: s.engineOn,
      separated: s.separated,
    })
  }, [])

  // ─── 渲染 ───
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width
    const H = canvas.height
    const s = stateRef.current
    if (!s) return

    // 清屏
    ctx.fillStyle = C.bg
    ctx.fillRect(0, 0, W, H)

    // 坐标系：世界坐标 → 屏幕坐标
    const margin = { top: 60, bottom: 80, left: 60, right: 200 }
    const plotW = W - margin.left - margin.right
    const plotH = H - margin.top - margin.bottom

    // 动态高度范围
    const maxH = Math.max(2000, s.peakAlt * 1.3, s.h * 1.5)
    const worldToScreen = (worldY) => margin.top + plotH - (worldY / maxH) * plotH
    const worldToScreenX = (worldX) => margin.left + (worldX / 100) * plotW

    // ─── 天空渐变 ───
    const grad = ctx.createLinearGradient(0, 0, 0, H)
    grad.addColorStop(0, '#000510')
    grad.addColorStop(0.3, '#0a1628')
    grad.addColorStop(0.7, '#1a2a48')
    grad.addColorStop(1, '#2a3a5a')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)

    // ─── 星星 ───
    ctx.fillStyle = '#ffffff'
    for (let i = 0; i < 80; i++) {
      const sx = (i * 137.508 + 23) % W
      const sy = (i * 97.31 + 11) % (H * 0.6)
      const sr = (i % 3 === 0) ? 1.5 : 0.8
      ctx.globalAlpha = 0.3 + (i % 5) * 0.12
      ctx.beginPath()
      ctx.arc(sx, sy, sr, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // ─── 地面 ───
    const groundY = worldToScreen(0)
    const groundGrad = ctx.createLinearGradient(0, groundY, 0, groundY + 40)
    groundGrad.addColorStop(0, '#3a5a3a')
    groundGrad.addColorStop(1, '#1a2a1a')
    ctx.fillStyle = groundGrad
    ctx.fillRect(0, groundY, W, H - groundY)

    // 地面线
    ctx.strokeStyle = '#5a8a5a'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, groundY)
    ctx.lineTo(W, groundY)
    ctx.stroke()

    // ─── 高度网格线 ───
    ctx.strokeStyle = 'rgba(100,180,255,0.08)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 6])
    const gridStep = maxH > 20000 ? 5000 : maxH > 5000 ? 1000 : 500
    for (let alt = gridStep; alt < maxH; alt += gridStep) {
      const gy = worldToScreen(alt)
      ctx.beginPath()
      ctx.moveTo(margin.left, gy)
      ctx.lineTo(W - margin.right, gy)
      ctx.stroke()
      // 标注
      ctx.fillStyle = C.dim
      ctx.font = '11px monospace'
      ctx.textAlign = 'right'
      ctx.fillText(`${(alt / 1000).toFixed(1)}km`, margin.left - 8, gy + 4)
    }
    ctx.setLineDash([])

    // ─── 轨迹线 ───
    if (s.trail.length > 1) {
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      for (let i = 1; i < s.trail.length; i++) {
        const t0 = s.trail[i - 1], t1 = s.trail[i]
        const y0 = worldToScreen(t0.h), y1 = worldToScreen(t1.h)
        const spd = t1.v / Math.max(1, s.peakV)
        const r = Math.floor(40 + spd * 180)
        const g = Math.floor(120 + (1 - spd) * 100)
        ctx.strokeStyle = `rgba(${r},${g},255,0.5)`
        ctx.beginPath()
        ctx.moveTo(margin.left + plotW * 0.5, y0)
        ctx.lineTo(margin.left + plotW * 0.5, y1)
        ctx.stroke()
      }
    }

    // ─── 火箭绘制 ───
    if (s.h >= 0) {
      const rocketX = margin.left + plotW * 0.5
      const rocketY = worldToScreen(s.h)
      const rocketScale = Math.max(0.4, Math.min(1, 400 / maxH * 2))
      const rh = 60 * rocketScale  // 火箭高度
      const rw = 16 * rocketScale  // 火箭宽度

      ctx.save()
      ctx.translate(rocketX, rocketY)

      // 火箭主体（从底向上画）
      const bodyTop = -rh
      const bodyBot = 0

      // 整流罩（尖头）
      ctx.fillStyle = '#ddd'
      ctx.beginPath()
      ctx.moveTo(0, bodyTop - rh * 0.3)
      ctx.lineTo(-rw * 0.5, bodyTop)
      ctx.lineTo(rw * 0.5, bodyTop)
      ctx.closePath()
      ctx.fill()

      // 主体
      const stageColors = ['#e8e8e8', '#d0d0d0', '#b8b8b8']
      let yOff = bodyTop
      const stageH = (bodyBot - bodyTop) / s.stages
      for (let i = 0; i < s.stages; i++) {
        const isCurrent = i === s.currentStage
        const isSeparated = s.separated.some(se => se.stage === i)
        if (isSeparated) continue

        ctx.fillStyle = isCurrent ? '#f0f0f0' : stageColors[i]
        ctx.fillRect(-rw * 0.5, yOff, rw, stageH)

        // 级间分隔线
        if (i > 0 && !isSeparated) {
          ctx.strokeStyle = '#666'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(-rw * 0.5, yOff)
          ctx.lineTo(rw * 0.5, yOff)
          ctx.stroke()
        }

        // 燃料指示条
        if (isCurrent && s.stageFuel[i] > 0) {
          const fuelRatio = s.stageFuel[i] / s.preset.fuel[i]
          const barH = stageH * 0.8
          ctx.fillStyle = 'rgba(255,100,30,0.3)'
          ctx.fillRect(-rw * 0.4, yOff + stageH * 0.1, rw * 0.8, barH)
          ctx.fillStyle = fuelRatio > 0.3 ? '#ff8844' : '#ff4444'
          ctx.fillRect(-rw * 0.4, yOff + stageH * 0.1 + barH * (1 - fuelRatio), rw * 0.8, barH * fuelRatio)
        }

        yOff += stageH
      }

      // 尾翼
      ctx.fillStyle = '#aaa'
      ctx.beginPath()
      ctx.moveTo(-rw * 0.5, bodyBot)
      ctx.lineTo(-rw * 1.2, bodyBot + rh * 0.15)
      ctx.lineTo(-rw * 0.5, bodyBot - rh * 0.1)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(rw * 0.5, bodyBot)
      ctx.lineTo(rw * 1.2, bodyBot + rh * 0.15)
      ctx.lineTo(rw * 0.5, bodyBot - rh * 0.1)
      ctx.closePath()
      ctx.fill()

      // ─── 推力火焰 ───
      if (s.thrust > 0 && s.engineOn) {
        const flameH = rh * (0.5 + Math.random() * 0.3)
        const flameW = rw * 0.6

        // 外焰
        const outerGrad = ctx.createRadialGradient(0, bodyBot, 0, 0, bodyBot + flameH * 0.5, flameH)
        outerGrad.addColorStop(0, 'rgba(255,200,50,0.9)')
        outerGrad.addColorStop(0.4, 'rgba(255,100,20,0.7)')
        outerGrad.addColorStop(1, 'rgba(255,50,10,0)')
        ctx.fillStyle = outerGrad
        ctx.beginPath()
        ctx.moveTo(-flameW, bodyBot)
        ctx.quadraticCurveTo(-flameW * 0.3, bodyBot + flameH * 0.6, 0, bodyBot + flameH)
        ctx.quadraticCurveTo(flameW * 0.3, bodyBot + flameH * 0.6, flameW, bodyBot)
        ctx.closePath()
        ctx.fill()

        // 内焰（白色核心）
        ctx.fillStyle = 'rgba(255,255,230,0.8)'
        ctx.beginPath()
        ctx.moveTo(-flameW * 0.3, bodyBot)
        ctx.quadraticCurveTo(0, bodyBot + flameH * 0.4, 0, bodyBot + flameH * 0.5)
        ctx.quadraticCurveTo(0, bodyBot + flameH * 0.4, flameW * 0.3, bodyBot)
        ctx.closePath()
        ctx.fill()

        // 尾烟粒子
        ctx.fillStyle = 'rgba(200,200,200,0.15)'
        for (let i = 0; i < 8; i++) {
          const px = (Math.random() - 0.5) * flameW * 2
          const py = bodyBot + flameH + Math.random() * 40 * rocketScale
          const pr = 3 + Math.random() * 6
          ctx.beginPath()
          ctx.arc(px, py, pr, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // 已分离级（向下飘）
      for (const sep of s.separated) {
        const elapsed = s.time - sep.time
        const sepY = worldToScreen(sep.h - elapsed * 50) // 向下飘
        if (sepY > groundY && sepY < H) {
          ctx.save()
          ctx.globalAlpha = Math.max(0, 1 - elapsed * 0.1)
          ctx.translate(rocketX + 60 + elapsed * 20, sepY)
          ctx.rotate(elapsed * 0.5)
          ctx.fillStyle = '#888'
          ctx.fillRect(-rw * 0.3, 0, rw * 0.6, stageH * 0.8)
          ctx.restore()
        }
      }

      ctx.restore()
    }

    // ─── 力的箭头（右侧） ───
    if (s.h > 0 || s.launched) {
      const arrowX = W - 120
      const arrowBase = H * 0.5
      const arrowScale = 0.03

      // 推力（向上，橙色）
      if (s.thrust > 0) {
        const len = Math.min(120, s.thrust * arrowScale)
        drawArrow(ctx, arrowX, arrowBase, 0, -len, C.thrust, `推力 ${(s.thrust / 1000).toFixed(1)}kN`, 3)
      }

      // 重力（向下，蓝色）
      const gLen = Math.min(80, s.gravity * arrowScale)
      drawArrow(ctx, arrowX, arrowBase, 0, gLen, C.gravity, `重力 ${(s.gravity / 1000).toFixed(1)}kN`, 3)

      // 阻力（向下/向上取决于方向，黄色）
      if (Math.abs(s.drag) > 10) {
        const dLen = Math.min(60, Math.abs(s.drag) * arrowScale)
        const dDir = s.drag > 0 ? -1 : 1
        drawArrow(ctx, arrowX + 40, arrowBase, 0, dDir * dLen, C.drag, `阻力 ${(Math.abs(s.drag) / 1000).toFixed(2)}kN`, 2)
      }
    }

    // ─── 左侧数据面板 ───
    drawPanel(ctx, 10, 10, 180, 280, s)

    // ─── 右侧齐奥尔科夫斯基公式 ───
    drawFormulaPanel(ctx, W - 185, 10, 175, 140, s)

    // ─── 底部提示 ───
    ctx.fillStyle = C.dim
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'
    if (phase === 'idle') {
      ctx.fillText('点击 [发射] 开始仿真', W / 2, H - 20)
    } else if (phase === 'done') {
      ctx.fillStyle = C.success
      ctx.fillText(`发射完成 — 最大高度 ${(s.peakAlt / 1000).toFixed(1)}km · 最大速度 ${s.peakV.toFixed(0)}m/s`, W / 2, H - 20)
    }
  }, [phase])

  // 箭头绘制
  function drawArrow(ctx, x, y, dx, dy, color, label, lw = 2) {
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 3) return
    ctx.save()
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = lw
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + dx, y + dy)
    ctx.stroke()
    // 箭头尖
    const a = Math.atan2(dy, dx)
    const hl = Math.min(10, len * 0.3)
    ctx.beginPath()
    ctx.moveTo(x + dx, y + dy)
    ctx.lineTo(x + dx - hl * Math.cos(a - 0.4), y + dy - hl * Math.sin(a - 0.4))
    ctx.lineTo(x + dx - hl * Math.cos(a + 0.4), y + dy - hl * Math.sin(a + 0.4))
    ctx.closePath()
    ctx.fill()
    // 标签
    if (label) {
      ctx.font = '11px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(label, x + dx + 8, y + dy + 4)
    }
    ctx.restore()
  }

  // 数据面板
  function drawPanel(ctx, x, y, w, h, s) {
    // 背景
    ctx.fillStyle = C.panel
    ctx.strokeStyle = C.border
    ctx.lineWidth = 1
    roundRect(ctx, x, y, w, h, 8)
    ctx.fill()
    ctx.stroke()

    ctx.font = 'bold 13px sans-serif'
    ctx.fillStyle = C.accent
    ctx.textAlign = 'left'
    ctx.fillText('📡 飞行数据', x + 12, y + 22)

    ctx.font = '12px monospace'
    const rows = [
      ['时间', `${s.time.toFixed(1)}s`],
      ['高度', s.h >= 1000 ? `${(s.h / 1000).toFixed(2)}km` : `${s.h.toFixed(0)}m`],
      ['速度', `${s.v.toFixed(1)} m/s`],
      ['加速度', `${s.a.toFixed(2)} m/s²`],
      ['质量', `${(getTotalMass(s) / 1000).toFixed(2)} t`],
      ['', ''],
      ['当前级', `第 ${s.currentStage + 1} 级 / ${s.stages} 级`],
      ['剩余燃料', `${(s.stageFuel.reduce((a, b) => a + b, 0) / 1000).toFixed(2)} t`],
      ['已燃燃料', `${(s.fuelBurned / 1000).toFixed(2)} t`],
      ['', ''],
      ['最大高度', `${(s.peakAlt / 1000).toFixed(2)} km`],
      ['最大速度', `${s.peakV.toFixed(1)} m/s`],
    ]

    let ry = y + 42
    for (const [label, value] of rows) {
      if (!label && !value) { ry += 6; continue }
      ctx.fillStyle = C.dim
      ctx.textAlign = 'left'
      ctx.fillText(label, x + 12, ry)
      ctx.fillStyle = C.text
      ctx.textAlign = 'right'
      ctx.fillText(value, x + w - 12, ry)
      ry += 20
    }
  }

  // 齐奥尔科夫斯基公式面板
  function drawFormulaPanel(ctx, x, y, w, h, s) {
    ctx.fillStyle = C.panel
    ctx.strokeStyle = C.border
    ctx.lineWidth = 1
    roundRect(ctx, x, y, w, h, 8)
    ctx.fill()
    ctx.stroke()

    ctx.font = 'bold 12px sans-serif'
    ctx.fillStyle = C.accent
    ctx.textAlign = 'left'
    ctx.fillText('🚀 齐奥尔科夫斯基公式', x + 10, y + 20)

    ctx.font = '13px monospace'
    ctx.fillStyle = C.text
    ctx.textAlign = 'center'
    ctx.fillText('Δv = vₑ × ln(m₀/m₁)', x + w / 2, y + 42)

    ctx.font = '11px sans-serif'
    ctx.fillStyle = C.dim
    ctx.textAlign = 'left'
    const lines = [
      'vₑ = 排气速度',
      'm₀ = 初始质量',
      'm₁ = 最终质量',
      '',
    ]
    let ly = y + 60
    for (const line of lines) {
      if (!line) { ly += 4; continue }
      ctx.fillText(line, x + 10, ly)
      ly += 16
    }

    // 各级Δv
    ctx.font = '11px monospace'
    ctx.fillStyle = C.warn
    for (let i = 0; i < s.stages; i++) {
      let m0 = 0, m1 = 0
      for (let j = i; j < s.stages; j++) {
        m0 += s.stageDry[j] + s.stageFuel[j]
        m1 += s.stageDry[j] + (j === i ? 0 : s.stageFuel[j])
      }
      const dv = calcDeltaV(s.stageVEx[i], m0, m1)
      ctx.fillText(`第${i + 1}级: Δv=${dv.toFixed(0)}m/s`, x + 10, ly)
      ly += 16
    }
  }

  function getTotalMass(s) {
    let m = 0
    for (let i = 0; i < s.stages; i++) m += s.stageDry[i] + s.stageFuel[i]
    return m
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + r)
    ctx.lineTo(x + w, y + h - r)
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    ctx.lineTo(x + r, y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - r)
    ctx.lineTo(x, y + r)
    ctx.quadraticCurveTo(x, y, x + r, y)
    ctx.closePath()
  }

  // ─── 生命周期 ───
  useEffect(() => {
    stateRef.current = initState(preset)
  }, [preset, initState])

  // 动画循环
  useEffect(() => {
    if (!running) return
    let lastTime = 0
    const loop = (timestamp) => {
      if (!lastTime) lastTime = timestamp
      const elapsed = (timestamp - lastTime) / 1000
      lastTime = timestamp

      // 按帧率步进
      const steps = Math.min(4, Math.max(1, Math.round(elapsed / DT)))
      for (let i = 0; i < steps; i++) step()

      draw()
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [running, step, draw])

  // 初始绘制
  useEffect(() => {
    if (!running) draw()
  }, [running, draw, phase])

  // Canvas尺寸
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      const parent = canvas.parentElement
      const w = parent.clientWidth
      const h = Math.max(500, parent.clientHeight)
      canvas.width = w
      canvas.height = h
      canvas.style.width = w + 'px'
      canvas.style.height = h + 'px'
      if (!running) draw()
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [draw, running])

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: C.bg }}>
      {/* 控制栏 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px',
        background: 'rgba(15,25,45,0.9)', borderBottom: `1px solid ${C.border}`,
        flexWrap: 'wrap',
      }}>
        <span style={{ color: C.accent, fontWeight: 'bold', fontSize: 14 }}>🚀 火箭发射仿真</span>

        {/* 预设选择 */}
        <div style={{ display: 'flex', gap: 4 }}>
          {Object.entries(PRESETS).map(([key, p]) => (
            <button key={key} onClick={() => { setPreset(key) }}
              style={{
                padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
                background: preset === key ? C.accent : 'rgba(100,180,255,0.1)',
                color: preset === key ? '#fff' : C.dim,
                fontSize: 12, fontWeight: preset === key ? 'bold' : 'normal',
              }}>
              {p.name}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* 发射/重置按钮 */}
        <button onClick={launch} disabled={running || phase === 'done'}
          style={{
            padding: '6px 20px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: (running || phase === 'done') ? 'rgba(100,100,100,0.3)' : '#ff4422',
            color: '#fff', fontWeight: 'bold', fontSize: 13,
          }}>
          {phase === 'idle' ? '🔴 发射' : phase === 'done' ? '已完成' : '发射中...'}
        </button>

        <button onClick={reset}
          style={{
            padding: '6px 14px', borderRadius: 6, border: `1px solid ${C.border}`,
            background: 'transparent', color: C.dim, cursor: 'pointer', fontSize: 12,
          }}>
          ↺ 重置
        </button>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <canvas ref={canvasRef} style={{ display: 'block' }} />
      </div>
    </div>
  )
}
