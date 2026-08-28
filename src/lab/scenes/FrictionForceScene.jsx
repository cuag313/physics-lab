import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * FrictionForceScene — 探究滑动摩擦力影响因素（v3 完全重写）
 *
 * 子实验1：测量滑动摩擦力
 * 子实验2：探究影响滑动摩擦力的因素
 *
 * 装置：水平木板 + 木块 + 弹簧测力计（可拖拽把手）
 */

// ─── 统一材质配置 ───
const SURFACES = {
  wood:  { name: '木板', muS: 0.60, muK: 0.40, color: '#8B6914', blockColor: '#c0504d' },
  towel: { name: '毛巾', muS: 0.80, muK: 0.60, color: '#6B8B5F', blockColor: '#b04040' },
  ice:   { name: '冰面', muS: 0.10, muK: 0.05, color: '#A8D8EA', blockColor: '#d07070' },
}

const G = 9.8
const BLOCK_MASS = 2

export default function FrictionForceScene() {
  const canvasRef = useRef(null)
  const RRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    // 物理
    blockX: 0, blockV: 0,
    pullForce: 0, frictionForce: 0,
    normalForce: BLOCK_MASS * G,
    addedMass: 0,
    surface: 'wood',
    isMoving: false,
    // 装置
    handleX: 2.5,        // 把手位置（世界坐标）
    handleDragging: false,
    // 自动匀速
    autoMode: false,
    autoSpeed: 0.4,
    // 面积
    wideBlock: true,     // true=横放（大面积），false=侧放（小面积）
    // 引导
    showGuide: true,
    guideTimer: 0,
    // 时间序列（最大静摩擦演示用）
    curveData: [],     // [{t, F, f}]
    autoIncrease: false,
    demoTriggered: false,  // 是否已经触发过滑动
    // 时间
    time: 0,
    // Tab
    tab: 'measure',      // 'measure' | 'explore'
    // 记录
    records: [],
    showChart: false,
  })

  const [tab, setTab] = useState('measure')
  const [surface, setSurface] = useState('wood')
  const [addedMass, setAddedMass] = useState(0)
  const [autoMode, setAutoMode] = useState(false)
  const [wideBlock, setWideBlock] = useState(true)
  const [records, setRecords] = useState([])
  const [showChart, setShowChart] = useState(false)
  const [autoIncrease, setAutoIncrease] = useState(false)
  const [curveLen, setCurveLen] = useState(0) // 触发重绘曲线
  const [ui, setUi] = useState({
    pullForce: 0, frictionForce: 0, normalForce: 20,
    isMoving: false, speed: 0, accel: 0, state: '静止',
  })

  // 同步
  useEffect(() => { S.current.surface = surface }, [surface])
  useEffect(() => { S.current.addedMass = addedMass; S.current.normalForce = (BLOCK_MASS + addedMass) * G }, [addedMass])
  useEffect(() => { S.current.autoMode = autoMode }, [autoMode])
  useEffect(() => { S.current.wideBlock = wideBlock }, [wideBlock])
  useEffect(() => { S.current.autoIncrease = autoIncrease }, [autoIncrease])
  useEffect(() => { S.current.tab = tab }, [tab])

  // 切换 tab 时重置
  useEffect(() => {
    if (tab === 'maxStatic') {
      S.current.blockX = 0; S.current.blockV = 0
      S.current.pullForce = 0; S.current.handleX = 2.5
      S.current.curveData = []; S.current.demoTriggered = false
      setAutoIncrease(false)
    }
  }, [tab])

  // 引导倒计时
  useEffect(() => {
    if (S.current.showGuide) {
      const t = setTimeout(() => { S.current.showGuide = false }, 3500)
      return () => clearTimeout(t)
    }
  }, [])

  // ─── 渲染器 ───
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const R = {
      canvas, ctx: canvas.getContext('2d'),
      W: 0, H: 0, scale: 70, ox: 0, oy: 0,
      resize() {
        const rect = canvas.getBoundingClientRect()
        canvas.width = rect.width; canvas.height = rect.height
        this.W = rect.width; this.H = rect.height
        this.ox = this.W * 0.4; this.oy = this.H * 0.58
      },
      w2s(wx, wy) { return [this.ox + wx * this.scale, this.oy - wy * this.scale] },
      s2w(sx, sy) { return [(sx - this.ox) / this.scale, (this.oy - sy) / this.scale] },
    }
    R.resize()
    RRef.current = R
    console.log('Canvas init:', R.W, 'x', R.H)

    const loop = () => {
      try {
        step()
        draw()
      } catch (e) {
        console.error('FrictionScene error:', e)
      }
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    const onResize = () => R.resize()
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); cancelAnimationFrame(animRef.current) }
  }, [])

  // ─── 物理 ───
  function step() {
    const s = S.current
    const dt = 1 / 60
    s.time += dt
    if (s.showGuide && s.time > 3.5) s.showGuide = false

    const surf = SURFACES[s.surface]
    const N = s.normalForce
    const fMax = surf.muS * N
    const fK = surf.muK * N
    const mass = BLOCK_MASS + s.addedMass

    if (s.autoMode) {
      // 自动匀速：拉力精确等于滑动摩擦力
      s.isMoving = true
      s.frictionForce = fK
      s.pullForce = fK
      s.blockV = s.autoSpeed
      s.blockX += s.blockV * dt
      s.handleX = s.blockX + 2.5
    } else if (s.tab === 'maxStatic' && s.autoIncrease) {
      // 最大静摩擦演示：自动缓慢增大拉力
      s.pullForce = Math.min(50, s.pullForce + 1.0 * dt) // 1N/s
      s.handleX = s.blockX + 1.5 + s.pullForce * 0.02

      // 静→动判定
      if (!s.isMoving && s.pullForce >= fMax) {
        s.isMoving = true
        s.demoTriggered = true
        // 滑动瞬间，拉力降到滑动摩擦力（匀速）
        s.pullForce = fK
        s.handleX = s.blockX + 1.5 + s.pullForce * 0.02
        // 给一个初始速度让物块开始运动
        s.blockV = s.autoSpeed
      }
      if (s.isMoving) {
        s.frictionForce = fK
        s.pullForce = fK // 保持匀速
        s.blockV = s.autoSpeed // 维持匀速
      } else {
        s.frictionForce = s.pullForce
        s.blockV = 0
      }
      s.blockX += s.blockV * dt

      // 记录曲线数据
      s.curveData.push({ t: s.time, F: s.pullForce, f: Math.abs(s.frictionForce) })
      if (s.curveData.length % 3 === 0) setCurveLen(s.curveData.length)
    } else {
      // 手动模式
      if (Math.abs(s.blockV) < 0.05) {
        s.isMoving = false
        if (Math.abs(s.pullForce) < fMax) {
          s.frictionForce = s.pullForce > 0 ? -s.pullForce : s.pullForce < 0 ? -s.pullForce : 0
          s.blockV = 0
        } else {
          s.isMoving = true
          s.frictionForce = -Math.sign(s.pullForce) * fK
        }
      } else {
        s.isMoving = true
        s.frictionForce = -Math.sign(s.blockV) * fK
      }

      const Fnet = s.pullForce + s.frictionForce
      s.blockV += (Fnet / mass) * dt
      if (s.isMoving && Math.abs(s.blockV) < 0.01 && Math.abs(s.pullForce) < fK * 0.8) {
        s.blockV = 0; s.isMoving = false
      }
      s.blockX += s.blockV * dt
    }

    // 边界
    if (s.blockX < -2.5) { s.blockX = -2.5; s.blockV = Math.max(0, s.blockV) }
    if (s.blockX > 4) { s.blockX = 4; s.blockV = Math.min(0, s.blockV) }

    // 把手跟随（非拖拽时）
    if (!s.handleDragging && !s.autoMode) {
      s.handleX = s.blockX + 2.5 + Math.max(0, Math.abs(s.pullForce) * 0.01)
    }

    // UI 状态
    const accel = s.autoMode ? 0 : (s.pullForce + s.frictionForce) / mass
    let state = '静止'
    if (s.isMoving && Math.abs(accel) < 0.05) state = '匀速'
    else if (s.isMoving && accel > 0.05) state = '加速'
    else if (s.isMoving && accel < -0.05) state = '减速'

    setUi({
      pullForce: s.pullForce,
      frictionForce: s.frictionForce,
      normalForce: N,
      isMoving: s.isMoving,
      speed: Math.abs(s.blockV),
      accel,
      state,
    })
  }

  // ─── 绘制 ───
  function draw() {
    const R = RRef.current; if (!R) return
    const ctx = R.ctx
    if (R.W < 10 || R.H < 10) {
      R.resize()
      if (R.W < 10 || R.H < 10) return
    }
    ctx.clearRect(0, 0, R.W, R.H)
    const s = S.current

    drawBg(ctx, R)
    drawBoard(ctx, R)
    drawBlock(ctx, R)
    drawSpringScale(ctx, R)
    drawForces(ctx, R)
    if (s.showGuide) drawGuide(ctx, R)
    drawPanel(ctx, R)
    drawPrincipleBar(ctx, R)
    drawInstructions(ctx, R)
    if (s.tab === 'maxStatic') {
      try { drawMaxStaticCurve(ctx, R) } catch (e) { console.error('curve error:', e) }
    }
  }

  function drawBg(ctx, R) {
    const [, gy] = R.w2s(0, 0)
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, R.W, R.H)
    ctx.fillStyle = '#252535'
    ctx.fillRect(0, gy, R.W, R.H - gy)
    ctx.strokeStyle = '#3a3a5e'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(R.W, gy); ctx.stroke()
  }

  function drawBoard(ctx, R) {
    const surf = SURFACES[S.current.surface]
    const [, gy] = R.w2s(0, 0)
    const [x1] = R.w2s(-3, 0)
    const [x2] = R.w2s(5, 0)

    // 木板
    ctx.fillStyle = surf.color
    ctx.globalAlpha = 0.5
    ctx.fillRect(x1, gy, x2 - x1, 6)
    ctx.globalAlpha = 1

    // 材质标注
    ctx.fillStyle = '#6a7a8a'; ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(`${surf.name}  μₛ=${surf.muS}  μₖ=${surf.muK}`, (x1 + x2) / 2, gy + 10)
  }

  function drawBlock(ctx, R) {
    const s = S.current
    const surf = SURFACES[s.surface]
    const [bx, by] = R.w2s(s.blockX, 0)
    const sc = R.scale

    // 面积不同 → 物块宽度不同
    const bw = s.wideBlock ? 1.3 * sc : 0.7 * sc
    const bh = s.wideBlock ? 0.7 * sc : 1.3 * sc

    // 物块
    const grad = ctx.createLinearGradient(bx - bw / 2, by - bh, bx + bw / 2, by)
    grad.addColorStop(0, surf.blockColor)
    grad.addColorStop(1, surf.blockColor + '90')
    ctx.fillStyle = grad
    ctx.beginPath(); ctx.roundRect(bx - bw / 2, by - bh, bw, bh, 4); ctx.fill()
    ctx.strokeStyle = '#ffffff25'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(bx - bw / 2, by - bh, bw, bh, 4); ctx.stroke()

    // 质量标签
    const mass = BLOCK_MASS + s.addedMass
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(`${mass}kg`, bx, by - bh / 2)

    // 面积标注
    ctx.fillStyle = '#8b949e'; ctx.font = '9px sans-serif'
    ctx.fillText(s.wideBlock ? '横放' : '侧放', bx, by - bh - 8)

    // 砝码
    if (s.addedMass > 0) {
      const wh = Math.max(6, (s.addedMass / 5) * bh * 0.5)
      const ww = bw * 0.6
      ctx.fillStyle = '#4ECDC4'
      ctx.beginPath(); ctx.roundRect(bx - ww / 2, by - bh - wh, ww, wh, 3); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(`+${s.addedMass}kg`, bx, by - bh - wh / 2)
    }
  }

  // ─── 弹簧测力计（核心绘制）───
  function drawSpringScale(ctx, R) {
    const s = S.current
    const [bx, by] = R.w2s(s.blockX, 0)
    const [hx, hy] = R.w2s(s.handleX, 0)
    const sc = R.scale
    const surf = SURFACES[s.surface]

    const blockRight = bx + (s.wideBlock ? 0.65 : 0.35) * sc
    const handleLeft = hx - 0.3 * sc
    const springLen = handleLeft - blockRight

    // 弹簧线（锯齿形，形变量正比于拉力）
    const pullDist = Math.abs(s.pullForce) * 0.5
    const naturalLen = 1.5 * sc
    const currentLen = Math.max(0.3 * sc, springLen)
    const stretch = currentLen / naturalLen

    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2.5
    ctx.beginPath()
    const segs = 12
    const segLen = currentLen / segs
    const amplitude = Math.max(2, 8 / Math.max(1, stretch * 0.5))
    ctx.moveTo(blockRight, by - 0.2 * sc)
    for (let i = 0; i < segs; i++) {
      const x = blockRight + (i + 0.5) * segLen
      const y = by - 0.2 * sc + (i % 2 === 0 ? -amplitude : amplitude)
      ctx.lineTo(x, y)
    }
    ctx.lineTo(handleLeft, by - 0.2 * sc)
    ctx.stroke()

    // 测力计主体（长条形）
    const bodyW = 0.6 * sc
    const bodyH = 0.5 * sc
    const bodyX = hx

    // 外壳
    const bodyGrad = ctx.createLinearGradient(bodyX - bodyW / 2, hy - bodyH, bodyX + bodyW / 2, hy)
    bodyGrad.addColorStop(0, '#666'); bodyGrad.addColorStop(1, '#444')
    ctx.fillStyle = bodyGrad
    ctx.beginPath(); ctx.roundRect(bodyX - bodyW / 2, hy - bodyH, bodyW, bodyH, 5); ctx.fill()
    ctx.strokeStyle = '#888'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(bodyX - bodyW / 2, hy - bodyH, bodyW, bodyH, 5); ctx.stroke()

    // 刻度线
    const scaleLeft = bodyX - bodyW / 2 + 6
    const scaleRight = bodyX + bodyW / 2 - 6
    const scaleTop = hy - bodyH + 8
    const scaleW = scaleRight - scaleLeft
    ctx.strokeStyle = '#aaa'; ctx.lineWidth = 0.5
    for (let i = 0; i <= 10; i++) {
      const x = scaleLeft + (i / 10) * scaleW
      const h = i % 5 === 0 ? 8 : 4
      ctx.beginPath(); ctx.moveTo(x, scaleTop); ctx.lineTo(x, scaleTop + h); ctx.stroke()
    }
    // 刻度数字
    ctx.fillStyle = '#aaa'; ctx.font = '7px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('0', scaleLeft, scaleTop + 10)
    ctx.fillText('10', scaleLeft + scaleW / 2, scaleTop + 10)
    ctx.fillText('20', scaleRight, scaleTop + 10)

    // 指针
    const maxF = 20
    const pointerX = scaleLeft + (Math.min(maxF, Math.abs(s.pullForce)) / maxF) * scaleW
    ctx.strokeStyle = '#F44336'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(pointerX, scaleTop - 2); ctx.lineTo(pointerX, scaleTop + 12); ctx.stroke()
    ctx.fillStyle = '#F44336'
    ctx.beginPath(); ctx.arc(pointerX, scaleTop - 2, 3, 0, Math.PI * 2); ctx.fill()

    // 大字读数（放在测力计上方，不被把手遮挡）
    ctx.fillStyle = '#4CAF50'; ctx.font = 'bold 14px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText(`拉力 F = ${Math.abs(s.pullForce).toFixed(1)} N`, bodyX, hy - bodyH - 18)

    // 物块状态
    ctx.fillStyle = s.isMoving ? '#FF9800' : '#4CAF50'; ctx.font = '10px sans-serif'
    ctx.fillText(`物块状态：${ui.state}`, bodyX, hy - bodyH - 4)

    // 把手
    const handleW = 0.2 * sc, handleH = 0.6 * sc
    const hGrad = ctx.createLinearGradient(hx + bodyW / 2, hy - handleH / 2, hx + bodyW / 2 + handleW, hy + handleH / 2)
    hGrad.addColorStop(0, '#888'); hGrad.addColorStop(1, '#555')
    ctx.fillStyle = hGrad
    ctx.beginPath(); ctx.roundRect(hx + bodyW / 2, hy - handleH / 2, handleW, handleH, 3); ctx.fill()
    ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(hx + bodyW / 2, hy - handleH / 2, handleW, handleH, 3); ctx.stroke()

    // 把手拖拽提示
    ctx.fillStyle = '#FFD700'; ctx.font = '9px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('← 拖拽 →', hx + bodyW / 2 + handleW / 2, hy + handleH / 2 + 4)
  }

  function drawForces(ctx, R) {
    const s = S.current
    const [bx, by] = R.w2s(s.blockX, 0)
    const sc = R.scale
    const bh = (s.wideBlock ? 0.7 : 1.3) * sc
    const as = 2.5

    // 拉力（向右）
    if (Math.abs(s.pullForce) > 0.3) {
      const len = Math.min(80, Math.abs(s.pullForce) * as)
      const y = by - bh / 2
      drawArrow(ctx, bx + 0.3 * sc, y, bx + 0.3 * sc + len, y, '#FFD700', `F=${Math.abs(s.pullForce).toFixed(1)}N`)
    }

    // 摩擦力（向左）
    if (Math.abs(s.frictionForce) > 0.3) {
      const len = Math.min(80, Math.abs(s.frictionForce) * as)
      const y = by - 4
      const dir = s.frictionForce > 0 ? 1 : -1
      drawArrow(ctx, bx, y, bx + dir * len, y, '#FF6B6B', `f=${Math.abs(s.frictionForce).toFixed(1)}N`)
    }
  }

  function drawArrow(ctx, x1, y1, x2, y2, color, label) {
    const a = Math.atan2(y2 - y1, x2 - x1), hl = 7
    ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.85
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    ctx.fillStyle = color
    ctx.beginPath(); ctx.moveTo(x2, y2)
    ctx.lineTo(x2 - hl * Math.cos(a - 0.35), y2 - hl * Math.sin(a - 0.35))
    ctx.lineTo(x2 - hl * Math.cos(a + 0.35), y2 - hl * Math.sin(a + 0.35))
    ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1
    if (label) {
      ctx.fillStyle = color; ctx.font = '10px sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
      ctx.fillText(label, (x1 + x2) / 2, Math.min(y1, y2) - 4)
    }
  }

  // ─── 引导气泡 ───
  function drawGuide(ctx, R) {
    if (!S.current.showGuide) return
    const [cx, cy] = R.w2s(0.5, 0)
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.beginPath(); ctx.roundRect(cx - 140, cy - 75, 280, 45, 10); ctx.fill()
    ctx.fillStyle = '#333'; ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('沿水平方向匀速拉动测力计', cx, cy - 60)
    ctx.fillText('测力计读数 = 滑动摩擦力', cx, cy - 42)
    // 小三角
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.beginPath(); ctx.moveTo(cx - 8, cy - 30); ctx.lineTo(cx + 8, cy - 30); ctx.lineTo(cx, cy - 20); ctx.closePath(); ctx.fill()
  }

  // ─── 右侧面板 ───
  function drawPanel(ctx, R) {
    const s = S.current
    const surf = SURFACES[s.surface]
    const N = s.normalForce
    const pw = 200, ph = 260
    const px = R.W - pw - 10, py = 10

    ctx.fillStyle = 'rgba(22,27,34,0.95)'
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.fill()
    ctx.strokeStyle = '#30363d'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.stroke()

    ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    ctx.fillStyle = '#c9d1d9'; ctx.font = 'bold 12px sans-serif'
    ctx.fillText('📊 实验数据', px + 10, py + 8)

    let y = py + 28
    const LH = 15

    // 参数
    ctx.fillStyle = '#8b949e'; ctx.font = '11px sans-serif'
    ctx.fillText(`质量 m = ${(BLOCK_MASS + s.addedMass).toFixed(1)} kg`, px + 10, y); y += LH
    ctx.fillText(`正压力 N = ${N.toFixed(1)} N`, px + 10, y); y += LH
    ctx.fillText(`接触面：${surf.name}`, px + 10, y); y += LH
    ctx.fillText(`接触面积：${s.wideBlock ? '大（横放）' : '小（侧放）'}`, px + 10, y); y += LH + 3

    // 摩擦系数
    ctx.fillStyle = '#a0aec0'
    ctx.fillText(`静摩擦系数 μₛ = ${surf.muS.toFixed(2)}`, px + 10, y); y += LH
    ctx.fillText(`动摩擦系数 μₖ = ${surf.muK.toFixed(2)}`, px + 10, y); y += LH + 3

    // 力（直接从 S.current 读取，避免 React state 异步延迟）
    ctx.fillStyle = '#FFD700'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`拉力 F = ${Math.abs(s.pullForce).toFixed(2)} N`, px + 10, y); y += LH
    ctx.fillStyle = '#FF6B6B'
    ctx.fillText(`摩擦力 f = ${Math.abs(s.frictionForce).toFixed(2)} N`, px + 10, y); y += LH + 3

    // 状态
    const accel = (s.pullForce + s.frictionForce) / (BLOCK_MASS + s.addedMass)
    const isUniform = Math.abs(accel) < 0.05 && s.isMoving
    ctx.fillStyle = s.isMoving ? '#FF9800' : '#4CAF50'
    ctx.font = 'bold 11px sans-serif'
    ctx.fillText(s.isMoving ? (isUniform ? '⚡ 匀速运动' : '⚡ 滑动中') : '⏸ 静止', px + 10, y); y += LH

    // 匀速时显示 f ≈ μN
    if (isUniform) {
      ctx.fillStyle = '#4CAF50'; ctx.font = '10px sans-serif'
      ctx.fillText(`✓ 匀速：f = μₖN = ${(surf.muK * N).toFixed(1)}N`, px + 10, y)
    }
  }

  // ─── 底部原理卡 ───
  function drawPrincipleBar(ctx, R) {
    const s = S.current
    const surf = SURFACES[s.surface]
    const y = R.H - 36
    ctx.fillStyle = 'rgba(22,27,34,0.9)'
    ctx.fillRect(0, y - 4, R.W, 40)
    ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    ctx.fillStyle = '#c9d1d9'; ctx.font = 'bold 12px sans-serif'
    ctx.fillText('匀速拉动时，水平方向二力平衡，F拉 = f摩', 16, y + 2)
    ctx.fillStyle = '#4FC3F7'; ctx.font = 'bold 13px serif'
    ctx.fillText('f = μN', 320, y + 2)
    ctx.fillStyle = '#6a7a8a'; ctx.font = '10px sans-serif'
    ctx.fillText(`静摩擦上限 ${(surf.muS * (BLOCK_MASS + s.addedMass) * G).toFixed(1)}N`, 400, y + 4)
  }

  // ─── 最大静摩擦演示：F-t 和 f-t 曲线 ───
  function drawMaxStaticCurve(ctx, R) {
    const s = S.current
    const data = s.curveData
    if (data.length < 2) return

    const gw = 280, gh = 140
    const gx = 10, gy = 10

    ctx.fillStyle = 'rgba(22,27,34,0.92)'
    ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, 8); ctx.fill()
    ctx.strokeStyle = '#30363d'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, 8); ctx.stroke()

    ctx.fillStyle = '#c9d1d9'; ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('拉力 F 与摩擦力 f 随时间变化', gx + 8, gy + 6)

    const pad = { l: 40, r: 10, t: 24, b: 20 }
    const pw = gw - pad.l - pad.r, ph = gh - pad.t - pad.b
    const ox = gx + pad.l, oy = gy + pad.t + ph

    // 动态时间窗口：固定10秒窗口，从左往右滚动
    const windowT = 10
    const currentTime = data[data.length - 1].t
    const viewStart = Math.max(0, currentTime - windowT)
    const viewEnd = Math.max(windowT, currentTime)

    // Y轴范围：基于 f_max 动态调整
    const surf = SURFACES[s.surface]
    const N = s.normalForce
    const fMaxVal = surf.muS * N
    const maxVal = Math.max(fMaxVal * 1.3, 10)

    // 绘图区域边框
    ctx.strokeStyle = '#484f58'; ctx.lineWidth = 1
    ctx.strokeRect(ox, gy + pad.t, pw, ph)

    // 坐标轴
    ctx.strokeStyle = '#484f58'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(ox, gy + pad.t); ctx.lineTo(ox, oy); ctx.lineTo(ox + pw, oy); ctx.stroke()

    // Y刻度
    ctx.fillStyle = '#6a7a8a'; ctx.font = '8px sans-serif'
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
    for (let i = 1; i <= 4; i++) {
      const gy2 = oy - (i / 4) * ph
      ctx.fillText((maxVal * i / 4).toFixed(0), ox - 3, gy2)
      ctx.strokeStyle = '#ffffff08'; ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(ox, gy2); ctx.lineTo(ox + pw, gy2); ctx.stroke()
    }

    // X刻度（时间）
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    for (let i = 0; i <= 4; i++) {
      const t = viewStart + (i / 4) * (viewEnd - viewStart)
      const gx2 = ox + (i / 4) * pw
      ctx.fillText(t.toFixed(0) + 's', gx2, oy + 3)
    }

    // 裁剪绘图区域
    ctx.save()
    ctx.beginPath(); ctx.rect(ox + 1, gy + pad.t + 1, pw - 2, ph - 2); ctx.clip()

    // F 曲线（红色）- 从左往右绘制
    ctx.strokeStyle = '#F44336'; ctx.lineWidth = 2; ctx.beginPath()
    let started = false
    for (let i = 0; i < data.length; i++) {
      const px = ox + ((data[i].t - viewStart) / (viewEnd - viewStart)) * pw
      const py = oy - (data[i].F / maxVal) * ph
      if (px < ox) continue
      if (!started) { ctx.moveTo(px, py); started = true } else { ctx.lineTo(px, py) }
    }
    ctx.stroke()

    // f 曲线（蓝色）- 从左往右绘制
    ctx.strokeStyle = '#42A5F5'; ctx.lineWidth = 2; ctx.beginPath()
    started = false
    for (let i = 0; i < data.length; i++) {
      const px = ox + ((data[i].t - viewStart) / (viewEnd - viewStart)) * pw
      const py = oy - (data[i].f / maxVal) * ph
      if (px < ox) continue
      if (!started) { ctx.moveTo(px, py); started = true } else { ctx.lineTo(px, py) }
    }
    ctx.stroke()

    ctx.restore()

    // f_max 标线
    const fMaxY = oy - (fMaxVal / maxVal) * ph
    ctx.strokeStyle = '#FF9800'; ctx.lineWidth = 1; ctx.setLineDash([4, 3])
    ctx.beginPath(); ctx.moveTo(ox, fMaxY); ctx.lineTo(ox + pw, fMaxY); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#FF9800'; ctx.font = '9px sans-serif'
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'
    ctx.fillText('f_max=' + (surf.muS * N).toFixed(1) + 'N', ox + 4, fMaxY - 2)

    // mu_k*N 标线
    const fKY = oy - (surf.muK * N / maxVal) * ph
    ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 1; ctx.setLineDash([4, 3])
    ctx.beginPath(); ctx.moveTo(ox, fKY); ctx.lineTo(ox + pw, fKY); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#4CAF50'; ctx.font = '9px sans-serif'
    ctx.fillText('ukN=' + (surf.muK * N).toFixed(1) + 'N', ox + 4, fKY - 2)

    // 图例
    const lx = ox + pw - 75
    ctx.fillStyle = '#F44336'; ctx.font = '9px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText('- 拉力 F', lx, gy + pad.t + 10)
    ctx.fillStyle = '#42A5F5'
    ctx.fillText('- 摩擦力 f', lx, gy + pad.t + 22)

    // 触发后弹窗卡片
    if (s.demoTriggered && s.time > 2) {
      const cx = R.W / 2, cy = R.H / 2 - 30
      ctx.fillStyle = 'rgba(22,27,34,0.95)'
      ctx.beginPath(); ctx.roundRect(cx - 180, cy - 50, 360, 100, 10); ctx.fill()
      ctx.strokeStyle = '#FF9800'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.roundRect(cx - 180, cy - 50, 360, 100, 10); ctx.stroke()

      ctx.textBaseline = 'top'; ctx.textAlign = 'center'
      ctx.fillStyle = '#FFD54F'; ctx.font = 'bold 13px sans-serif'
      ctx.fillText('静摩擦达到上限，物块开始滑动！', cx, cy - 38)
      ctx.fillStyle = '#e0e0e0'; ctx.font = '11px sans-serif'
      ctx.fillText('静摩擦"跟着拉力走"，但有上限 f_max = us*N', cx, cy - 18)
      ctx.fillText('一旦超过，物体滑动，摩擦力骤降为 uk*N（滑动摩擦）', cx, cy)
      ctx.fillStyle = '#4CAF50'; ctx.font = 'bold 11px sans-serif'
      ctx.fillText('f_max=' + (surf.muS * N).toFixed(1) + 'N -> 滑动后 f=' + (surf.muK * N).toFixed(1) + 'N', cx, cy + 20)
    }
  }

  // ─── 左下操作说明 ───
  function drawInstructions(ctx, R) {
    const s = S.current
    const pw = 200, ph = s.tab === 'explore' ? 150 : 110
    const px = 10, py = R.H - ph - 42

    ctx.fillStyle = 'rgba(22,27,34,0.88)'
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.fill()
    ctx.strokeStyle = '#30363d'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.stroke()

    ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    ctx.fillStyle = '#c9d1d9'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('📖 操作说明', px + 10, py + 8)

    const lines = [
      { t: '① 拖拽测力计把手施加拉力', c: '#e0e0e0', f: '10px sans-serif' },
      { t: '② 匀速拉动时 F = f（读数稳定）', c: '#e0e0e0', f: '10px sans-serif' },
      { t: '③ 拉力 ≥ μₛN 时物块开始滑动', c: '#e0e0e0', f: '10px sans-serif' },
      { t: '④ 滑动后读数回落到 μₖN', c: '#FF9800', f: 'bold 10px sans-serif' },
    ]
    if (s.tab === 'explore') {
      lines.push(
        { t: '', h: 3 },
        { t: '探究：改变砝码/材质/面积', c: '#4FC3F7', f: '10px sans-serif' },
        { t: '记录多组数据 → 生成 f-N 图', c: '#4FC3F7', f: '10px sans-serif' },
      )
    }

    let ly = py + 26
    for (const line of lines) {
      if (line.h) { ly += line.h; continue }
      ctx.fillStyle = line.c; ctx.font = line.f
      ctx.fillText(line.t, px + 10, ly)
      ly += 14
    }
  }

  // ─── 交互 ───
  const handleMouseDown = useCallback((e) => {
    const R = RRef.current; if (!R) return
    const rect = canvasRef.current.getBoundingClientRect()
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top
    const s = S.current
    const [hx, hy] = R.w2s(s.handleX, 0)
    // 检测把手区域
    if (sx > hx - 30 && sx < hx + 50 && Math.abs(sy - hy) < 35) {
      s.handleDragging = true
    }
  }, [])

  const handleMouseMove = useCallback((e) => {
    const R = RRef.current; if (!R) return
    const s = S.current
    if (!s.handleDragging) return
    const rect = canvasRef.current.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const [wx] = R.s2w(sx, 0)
    // 把手位置 → 拉力
    const pullDist = wx - (s.blockX + 1.5)
    s.pullForce = Math.max(0, Math.min(25, pullDist * 5))
    s.handleX = Math.max(s.blockX + 1.5, wx)
  }, [])

  const handleMouseUp = useCallback(() => {
    const s = S.current
    if (s.handleDragging) {
      s.handleDragging = false
      if (!s.autoMode) {
        s.pullForce = 0
        s.handleX = s.blockX + 2.5
      }
    }
  }, [])

  // ─── 记录数据 ───
  function recordData() {
    const s = S.current
    const surf = SURFACES[s.surface]
    const N = s.normalForce
    const f = Math.abs(s.frictionForce)
    const mass = BLOCK_MASS + s.addedMass
    const accel = (s.pullForce + s.frictionForce) / mass
    const isUniform = Math.abs(accel) < 0.05 && s.isMoving

    setRecords(prev => [...prev, {
      N: N.toFixed(1), f: f.toFixed(2),
      surface: surf.name, uniform: isUniform,
      area: s.wideBlock ? '大' : '小',
    }])
  }

  // ─── 生成图像（带校验）───
  function handleShowChart() {
    const uniformPts = records.filter(r => r.uniform)
    if (uniformPts.length < 3) {
      alert(`匀速数据仅 ${uniformPts.length} 组，不足 3 组。请用自动匀速模式，分别在不同砝码下各记录 1 组。`)
      return
    }
    const nValues = uniformPts.map(r => r.N)
    if (nValues.some((v, i) => nValues.indexOf(v) !== i)) {
      alert('存在重复数据（正压力 N 相同）。请调整砝码质量后再记录。')
      return
    }
    setShowChart(true)
  }

  // ─── f-N 图表 ───
  function ChartModal() {
    if (!showChart || records.length === 0) return null
    const cW = 420, cH = 310
    const pad = { t: 30, r: 20, b: 40, l: 50 }
    const pW = cW - pad.l - pad.r, pH = cH - pad.t - pad.b

    const pts = records.filter(r => r.uniform).map(r => ({ N: parseFloat(r.N), f: parseFloat(r.f) }))
    const allPts = records.map(r => ({ N: parseFloat(r.N), f: parseFloat(r.f), uniform: r.uniform }))

    let slope = 0, intercept = 0, r2 = 0
    if (pts.length >= 2) {
      const n = pts.length; let sx = 0, sy = 0, sxy = 0, sx2 = 0
      for (const p of pts) { sx += p.N; sy += p.f; sxy += p.N * p.f; sx2 += p.N * p.N }
      const denom = n * sx2 - sx * sx
      if (denom !== 0) {
        slope = (n * sxy - sx * sy) / denom
        intercept = (sy - slope * sx) / n
        const ssRes = pts.reduce((s, p) => s + (p.f - (slope * p.N + intercept)) ** 2, 0)
        const ssTot = pts.reduce((s, p) => s + (p.f - sy / n) ** 2, 0)
        r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1
      }
    }

    const allN = allPts.map(p => p.N), allF = allPts.map(p => p.f)
    const maxN = Math.max(10, ...allN) * 1.15
    const maxF = Math.max(10, ...allF) * 1.15

    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
        onClick={() => setShowChart(false)}>
        <div style={{ background: '#1a1a2e', borderRadius: 12, padding: 20, border: '1px solid #30363d' }}
          onClick={e => e.stopPropagation()}>
          <canvas ref={c => {
            if (!c) return; c.width = cW; c.height = cH
            const ctx = c.getContext('2d')
            ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, cW, cH)
            const ox = pad.l, oy = pad.t + pH

            // 坐标轴
            ctx.strokeStyle = '#484f58'; ctx.lineWidth = 1
            ctx.beginPath(); ctx.moveTo(ox, pad.t); ctx.lineTo(ox, oy); ctx.lineTo(ox + pW, oy); ctx.stroke()

            // 标签
            ctx.fillStyle = '#8b949e'; ctx.font = '10px sans-serif'
            ctx.textAlign = 'center'; ctx.textBaseline = 'top'
            ctx.fillText('正压力 N (N)', ox + pW / 2, oy + 8)
            ctx.save(); ctx.translate(ox - 35, oy - pH / 2); ctx.rotate(-Math.PI / 2)
            ctx.fillText('摩擦力 f (N)', 0, 0); ctx.restore()

            // 网格 + 刻度
            for (let i = 1; i <= 5; i++) {
              const gy = oy - (i / 5) * pH
              ctx.strokeStyle = '#ffffff08'; ctx.lineWidth = 0.5
              ctx.beginPath(); ctx.moveTo(ox, gy); ctx.lineTo(ox + pW, gy); ctx.stroke()
              ctx.fillStyle = '#6a7a8a'; ctx.font = '9px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
              ctx.fillText((maxF * i / 5).toFixed(0), ox - 4, gy)
            }
            for (let i = 1; i <= 5; i++) {
              const gx = ox + (i / 5) * pW
              ctx.strokeStyle = '#ffffff08'; ctx.lineWidth = 0.5
              ctx.beginPath(); ctx.moveTo(gx, oy); ctx.lineTo(gx, pad.t); ctx.stroke()
              ctx.fillStyle = '#6a7a8a'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
              ctx.fillText((maxN * i / 5).toFixed(0), gx, oy + 2)
            }

            // 数据点
            for (let i = 0; i < allPts.length; i++) {
              const p = allPts[i]
              const px = ox + (p.N / maxN) * pW
              const py = oy - (p.f / maxF) * pH
              if (p.uniform) {
                ctx.fillStyle = '#4CAF50'
                ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill()
              } else {
                ctx.strokeStyle = '#FF9800'; ctx.lineWidth = 1.5
                ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.stroke()
              }
              // 序号
              ctx.fillStyle = '#8b949e'; ctx.font = '8px sans-serif'
              ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'
              ctx.fillText(`${i + 1}`, px + 6, py - 2)
            }

            // 拟合线
            if (pts.length >= 2) {
              ctx.strokeStyle = '#4FC3F7'; ctx.lineWidth = 2; ctx.setLineDash([])
              ctx.beginPath()
              ctx.moveTo(ox, oy - ((slope * 0 + intercept) / maxF) * pH)
              ctx.lineTo(ox + (maxN / maxN) * pW, oy - ((slope * maxN + intercept) / maxF) * pH)
              ctx.stroke()

              ctx.fillStyle = '#4FC3F7'; ctx.font = 'bold 11px sans-serif'
              ctx.textAlign = 'left'; ctx.textBaseline = 'top'
              ctx.fillText(`斜率 = ${slope.toFixed(3)} (≈μₖ)`, ox + 8, pad.t + 4)
              ctx.fillText(`R² = ${r2.toFixed(4)}`, ox + 8, pad.t + 20)
            }

            // 图例
            const lx = ox + pW - 90
            ctx.fillStyle = '#4CAF50'; ctx.beginPath(); ctx.arc(lx, pad.t + 8, 4, 0, Math.PI * 2); ctx.fill()
            ctx.fillStyle = '#8b949e'; ctx.font = '9px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
            ctx.fillText('匀速数据', lx + 8, pad.t + 8)
            ctx.strokeStyle = '#FF9800'; ctx.lineWidth = 1.5
            ctx.beginPath(); ctx.arc(lx, pad.t + 22, 5, 0, Math.PI * 2); ctx.stroke()
            ctx.fillStyle = '#8b949e'
            ctx.fillText('非匀速', lx + 8, pad.t + 22)
          }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
            <span style={{ color: '#8b949e', fontSize: 11 }}>共 {records.length} 条数据，{records.filter(r => r.uniform).length} 条匀速</span>
            <button onClick={() => setShowChart(false)} style={{ background: '#30363d', color: '#c9d1d9', border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>关闭</button>
          </div>
        </div>
      </div>
    )
  }

  // ─── 子实验控制栏 ───
  function renderTabControls() {
    if (tab === 'measure') {
      return (
        <>
          <label style={st.lbl}>
            接触面：
            <select value={surface} onChange={e => setSurface(e.target.value)} style={st.select}>
              {Object.entries(SURFACES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
            </select>
          </label>
          <label style={st.lbl}>
            砝码：
            <input type="range" min="0" max="5" step="0.5" value={addedMass}
              onChange={e => setAddedMass(parseFloat(e.target.value))} style={{ width: 60, accentColor: '#4A90D9' }} />
            <span style={st.val}>{addedMass}kg</span>
          </label>
          <label style={st.lbl}>
            <input type="checkbox" checked={autoMode} onChange={e => setAutoMode(e.target.checked)} />
            自动匀速
          </label>
          <button style={st.btnReset} onClick={() => { S.current.blockX = 0; S.current.blockV = 0; S.current.pullForce = 0; S.current.handleX = 2.5 }}>↺ 重置</button>
        </>
      )
    }
    if (tab === 'explore') {
      return (
        <>
          <label style={st.lbl}>
            接触面：
            <select value={surface} onChange={e => setSurface(e.target.value)} style={st.select}>
              {Object.entries(SURFACES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
            </select>
          </label>
          <label style={st.lbl}>
            砝码：
            <input type="range" min="0" max="5" step="0.5" value={addedMass}
              onChange={e => setAddedMass(parseFloat(e.target.value))} style={{ width: 60, accentColor: '#4A90D9' }} />
            <span style={st.val}>{addedMass}kg</span>
          </label>
          <label style={st.lbl}>
            <input type="checkbox" checked={autoMode} onChange={e => setAutoMode(e.target.checked)} />
            自动匀速
          </label>
          <label style={st.lbl}>
            <input type="checkbox" checked={wideBlock} onChange={e => setWideBlock(e.target.checked)} />
            横放（大面积）
          </label>
          <button style={st.btn} onClick={recordData}>📝 记录</button>
          <button style={st.btn} onClick={handleShowChart}>📈 f-N图</button>
          <button style={st.btnDanger} onClick={() => { setRecords([]); setShowChart(false) }}>🗑 清空</button>
          <button style={st.btnReset} onClick={() => { S.current.blockX = 0; S.current.blockV = 0; S.current.pullForce = 0; S.current.handleX = 2.5 }}>↺ 重置</button>
        </>
      )
    }
    // maxStatic tab
    return (
      <>
        <label style={st.lbl}>
          接触面：
          <select value={surface} onChange={e => setSurface(e.target.value)} style={st.select}>
            {Object.entries(SURFACES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
          </select>
        </label>
        <label style={st.lbl}>
          砝码：
          <input type="range" min="0" max="5" step="0.5" value={addedMass}
            onChange={e => setAddedMass(parseFloat(e.target.value))} style={{ width: 60, accentColor: '#4A90D9' }} />
          <span style={st.val}>{addedMass}kg</span>
        </label>
        <label style={st.lbl}>
          <input type="checkbox" checked={autoIncrease} onChange={e => { setAutoIncrease(e.target.checked) }} />
          自动缓慢增大拉力
        </label>
        <button style={st.btnReset} onClick={() => {
          S.current.blockX = 0; S.current.blockV = 0
          S.current.pullForce = 0; S.current.handleX = 2.5
          S.current.curveData = []; S.current.demoTriggered = false
          S.current.time = 0; setCurveLen(0)
        }}>↺ 重置</button>
      </>
    )
  }

  return (
    <div style={st.container}>
      <ChartModal />

      {/* 顶部 Tab */}
      <div style={st.tabBar}>
        <button style={tab === 'measure' ? st.tabActive : st.tabBtn} onClick={() => setTab('measure')}>测量滑动摩擦力</button>
        <button style={tab === 'explore' ? st.tabActive : st.tabBtn} onClick={() => setTab('explore')}>探究影响因素</button>
        <button style={tab === 'maxStatic' ? st.tabActive : st.tabBtn} onClick={() => setTab('maxStatic')}>演示最大静摩擦力</button>
        <div style={{ flex: 1 }} />
        {renderTabControls()}
      </div>

      {/* 画布 */}
      <div style={st.main}>
        <canvas ref={canvasRef} style={{ flex: 1, width: '100%', height: '100%', display: 'block' }}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
          onContextMenu={e => e.preventDefault()} />
      </div>

      {/* 数据表格（explore tab） */}
      {tab === 'explore' && records.length > 0 && (
        <div style={st.tableBar}>
          <span style={{ color: '#8b949e', fontSize: 11, marginRight: 8 }}>已记录 {records.length} 组：</span>
          {records.slice(-8).map((r, i) => (
            <span key={i} style={{
              background: r.uniform ? '#1a3a2a' : '#3a2a1a',
              border: `1px solid ${r.uniform ? '#2d5a3d' : '#5a3d2d'}`,
              borderRadius: 4, padding: '2px 6px', margin: '0 2px', fontSize: 10, color: '#c9d1d9',
            }}>
              N={r.N} f={r.f} {r.surface} {r.area} {r.uniform ? '✓' : '⚠'}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

const st = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#0d1117', color: '#c9d1d9', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  tabBar: { minHeight: 44, background: '#161b22', borderBottom: '1px solid #30363d', display: 'flex', alignItems: 'center', padding: '0 12px', flexShrink: 0, flexWrap: 'wrap', gap: 8 },
  tabBtn: { background: 'transparent', color: '#8b949e', border: '1px solid #30363d', borderRadius: 4, padding: '5px 14px', fontSize: 12, cursor: 'pointer' },
  tabActive: { background: '#4FC3F7', color: '#000', border: '1px solid #4FC3F7', borderRadius: 4, padding: '5px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 600 },
  lbl: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#8b949e' },
  select: { background: '#21262d', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: 4, padding: '3px 6px', fontSize: 12 },
  val: { color: '#4A90D9', fontWeight: 600, minWidth: 30, fontSize: 12 },
  btn: { background: '#238636', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer' },
  btnDanger: { background: '#da3633', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer' },
  btnReset: { background: '#30363d', color: '#c9d1d9', border: '1px solid #484f58', borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  tableBar: { minHeight: 28, background: '#161b22', borderTop: '1px solid #30363d', display: 'flex', alignItems: 'center', padding: '3px 12px', flexShrink: 0, overflowX: 'auto' },
}
