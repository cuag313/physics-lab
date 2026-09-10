import { useState, useRef, useEffect, useCallback } from 'react'

/**
 * VoltAmpereResistorScene — 伏安法测定值电阻
 *
 * Tab1: 实验演示 — 电路符号原理图 + 滑动变阻器 + 数据记录
 * Tab2: 自己动手 — 实物器材 + 接线柱吸附连线 + 电路自检
 *
 * 双模式完全隔离，切换时自动重置
 */

// ═══════════════════════════════════════════
// 常量
// ═══════════════════════════════════════════
const AMMETER_MAX = 0.6   // A表量程 0.6A
const VOLTMETER_MAX = 3   // V表量程 3V
const DEFAULTS = { U_source: 6, R_true: 15, sliderR: 10 }
const SNAP_DIST = 25      // 接线柱吸附像素距离

// 实物器材尺寸
const COMP = {
  battery: { w: 90, h: 56 },
  switch: { w: 80, h: 40 },
  ammeter: { w: 64, h: 64 },
  voltmeter: { w: 64, h: 64 },
  rheostat: { w: 100, h: 50 },
  resistor: { w: 70, h: 44 },
}

export default function VoltAmpereResistorScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const imageCache = useRef({})

  // 预加载器材图片
  useEffect(() => {
    const imgs = {
      ammeter: '/assets/equipment/ammeter.png',
      voltmeter: '/assets/equipment/voltmeter.png',
      battery: '/assets/equipment/battery.png',
      switch: '/assets/equipment/switch.png',
      rheostat: '/assets/equipment/rheostat.png',
      resistor: '/assets/equipment/resistor.png',
      bulb_on: '/assets/equipment/bulb_on.png',
    }
    for (const [key, src] of Object.entries(imgs)) {
      const img = new Image()
      img.src = src
      img.onload = () => { imageCache.current[key] = img; forceUpdate(n => n + 1) }
    }
  }, [])

  // ── 双模式完全隔离状态 ──
  const demoRef = useRef({
    switchClosed: false,
    U_source: DEFAULTS.U_source,
    R_true: DEFAULTS.R_true,
    sliderR: DEFAULTS.sliderR,
    time: 0,
    data: [],
    needleA: 0,       // A表指针角度（动画用）
    needleV: 0,       // V表指针角度
  })

  const diyRef = useRef({
    switchClosed: false,
    U_source: DEFAULTS.U_source,
    R_true: DEFAULTS.R_true,
    sliderR: DEFAULTS.sliderR,
    time: 0,
    data: [],
    // 实物器材
    components: [
      { id: 1, type: 'battery', x: 200, y: 280, rotation: 0 },
      { id: 2, type: 'switch', x: 370, y: 150, rotation: 0, closed: false },
      { id: 3, type: 'ammeter', x: 520, y: 150, rotation: 0 },
      { id: 4, type: 'resistor', x: 680, y: 150, rotation: 0 },
      { id: 5, type: 'rheostat', x: 400, y: 380, rotation: 0 },
      { id: 6, type: 'voltmeter', x: 680, y: 340, rotation: 0 },
    ],
    wires: [],
    dragId: null,
    dragOffX: 0, dragOffY: 0,
    connecting: null,
    hoverTerm: null,
    nextId: 10,
    wireErrors: [],    // [{wireId, reason}]
    circuitStatus: { ok: false, reason: '' },
    // 撤销/重做
    undoStack: [],
    redoStack: [],
    showGuide: true,
    needleA: 0,
    needleV: 0,
    overRangeA: false,
    overRangeV: false,
  })

  const [tab, setTab] = useState(1)
  const [, forceUpdate] = useState(0)
  const tabRef = useRef(1)

  // 当前模式状态
  const S = () => tabRef.current === 1 ? demoRef.current : diyRef.current

  // ── 画布初始化 ──
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const R = {
      canvas, ctx: canvas.getContext('2d'), W: 0, H: 0,
      resize() {
        const rect = canvas.getBoundingClientRect()
        canvas.width = rect.width * devicePixelRatio
        canvas.height = rect.height * devicePixelRatio
        this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
        this.W = rect.width; this.H = rect.height
      },
    }
    R.resize(); canvasRef.current._R = R
    const loop = () => {
      const s = S()
      s.time += 1 / 60
      updatePhysics(s)
      render(R)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  // ── 物理更新 ──
  function updatePhysics(s) {
    if (!s.switchClosed) {
      // 断开时指针归零
      s.needleA += (0 - s.needleA) * 0.15
      s.needleV += (0 - s.needleV) * 0.15
      s.overRangeA = false
      s.overRangeV = false
      return
    }
    const Rtotal = s.R_true + s.sliderR
    const I = Rtotal > 0 ? s.U_source / Rtotal : 0
    const U_R = I * s.R_true

    // 指针动画（平滑过渡）
    const targetA = (I / AMMETER_MAX) * 1.2  // 弧度映射
    const targetV = (U_R / VOLTMETER_MAX) * 1.2
    s.needleA += (targetA - s.needleA) * 0.12
    s.needleV += (targetV - s.needleV) * 0.12

    // 超量程判断
    s.overRangeA = I > AMMETER_MAX
    s.overRangeV = U_R > VOLTMETER_MAX
  }

  // ── 渲染调度 ──
  function render(R) {
    const ctx = R.ctx, W = R.W, H = R.H
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#f0f4f8'; ctx.fillRect(0, 0, W, H)
    canvasRef.current._clickAreas = []
    canvasRef.current._palAreas = []

    if (tabRef.current === 1) renderDemo(ctx, W, H, demoRef.current)
    else renderDIY(ctx, W, H, diyRef.current)
  }

  // ═══════════════════════════════════════════
  //  Tab 1：实验演示（电路符号原理图）
  // ═══════════════════════════════════════════
  function renderDemo(ctx, W, H, s) {
    const on = s.switchClosed
    const Rtotal = s.R_true + s.sliderR
    const I = on && Rtotal > 0 ? s.U_source / Rtotal : 0
    const U_R = I * s.R_true

    // 电路区域居中
    const cw = Math.min(W * 0.52, 520)
    const ch = Math.min(H - 180, 400)
    const cx = (W * 0.52 - cw) / 2 + 20
    const cy = 80 + (H - 180 - ch) / 2

    drawDemoCircuit(ctx, cx, cy, cw, ch, on, s, I, U_R)
    drawDemoPanel(ctx, W, H, s, I, U_R)
    drawDemoNav(ctx, W, H, s, I, U_R)
  }

  function drawDemoCircuit(ctx, cx, cy, cw, ch, on, s, I, U_R) {
    const left = cx + 40, right = cx + cw - 40
    const top = cy + 30, bottom = cy + ch - 40
    const wc = on ? '#1565C0' : '#999'

    // 导线
    const battX = left + (right - left) * 0.12
    const swX = left + (right - left) * 0.3
    const ammX = left + (right - left) * 0.48
    const resX = left + (right - left) * 0.68
    const rheoX = left + (right - left) * 0.5
    const rheoY = bottom + 50

    // 主回路（矩形）
    drawLine(ctx, left, top, right, top, wc, 2.5)
    drawLine(ctx, right, top, right, bottom, wc, 2.5)
    drawLine(ctx, left, bottom, battX - 12, bottom, wc, 2.5)
    drawLine(ctx, battX + 12, bottom, swX - 18, bottom, wc, 2.5)
    drawLine(ctx, swX + 18, bottom, ammX - 18, bottom, wc, 2.5)
    drawLine(ctx, ammX + 18, bottom, resX - 16, bottom, wc, 2.5)
    drawLine(ctx, resX + 16, bottom, right, bottom, wc, 2.5)
    drawLine(ctx, left, top, left, bottom, wc, 2.5)

    // 滑动变阻器并联在主回路下方
    drawLine(ctx, ammX + 18, bottom, rheoX - 30, rheoY, wc, 2)
    drawLine(ctx, resX - 16, bottom, rheoX + 30, rheoY, wc, 2)

    // Ⓥ V表并联在待测电阻两端
    const volY = bottom + 40
    drawLine(ctx, resX - 16, bottom, resX - 16, volY, wc, 2)
    drawLine(ctx, resX + 16, bottom, resX + 16, volY, wc, 2)
    drawLine(ctx, resX - 16, volY, resX - 20, volY, wc, 2)
    drawLine(ctx, resX + 20, volY, resX + 16, volY, wc, 2)

    // 电流流动动画
    if (on) {
      drawCurrentFlow(ctx, [
        { x: battX + 12, y: bottom }, { x: swX, y: bottom }, { x: ammX, y: bottom },
        { x: resX, y: bottom }, { x: right, y: bottom }, { x: right, y: top },
        { x: left, y: top }, { x: left, y: bottom }, { x: battX - 12, y: bottom },
      ], s.time, 0.5)
      // 导线高亮
      ctx.strokeStyle = 'rgba(21,101,225,0.15)'; ctx.lineWidth = 8
      ctx.beginPath(); ctx.moveTo(left, top); ctx.lineTo(right, top); ctx.lineTo(right, bottom); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(left, bottom); ctx.lineTo(right, bottom); ctx.stroke()
    }

    // 元件
    drawStdBattery(ctx, battX, bottom)
    drawStdSwitch(ctx, swX, bottom, on, () => { s.switchClosed = !s.switchClosed; forceUpdate(n => n + 1) })
    drawMeterSymbol(ctx, ammX, bottom, 'A', s.needleA, s.overRangeA, on ? `${I.toFixed(3)}A` : '')
    drawStdResistor(ctx, resX, bottom, 'R=?')
    drawSlidingR(ctx, rheoX, rheoY, s.sliderR, 50)
    drawMeterSymbol(ctx, resX, volY, 'V', s.needleV, s.overRangeV, on ? `${U_R.toFixed(2)}V` : '')

    // 标注
    ctx.fillStyle = '#555'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('Ⓐ串联', ammX, bottom - 22)
    ctx.fillText('Ⓥ并联', resX, volY + 22)
    ctx.fillText(`滑动变阻器 ${s.sliderR}Ω`, rheoX, rheoY + 22)
  }

  // ─── 仪表符号（带指针动画 + 超量程闪烁）───
  function drawMeterSymbol(ctx, x, y, type, needleAngle, overRange, reading) {
    const r = 22
    // 超量程闪烁背景
    if (overRange) {
      const flash = Math.sin(Date.now() / 150) > 0
      ctx.fillStyle = flash ? 'rgba(244,67,54,0.25)' : 'rgba(244,67,54,0.08)'
      ctx.beginPath(); ctx.arc(x, y, r + 6, 0, Math.PI * 2); ctx.fill()
    }
    const color = type === 'A' ? '#E53935' : '#4CAF50'
    ctx.fillStyle = '#fff'; ctx.strokeStyle = overRange ? '#F44336' : color; ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    // 圆圈内符号
    ctx.fillStyle = color; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(type === 'A' ? 'A' : 'V', x, y - 4)
    // 指针动画
    const angle = -Math.PI * 0.6 + needleAngle * Math.PI * 1.2
    const nx = x + Math.cos(angle) * (r - 6)
    const ny = y + Math.sin(angle) * (r - 6)
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke(); ctx.lineCap = 'butt'
    // 读数
    if (reading) {
      ctx.fillStyle = overRange ? '#F44336' : '#333'
      ctx.font = 'bold 10px monospace'
      ctx.fillText(reading, x, y + 12)
    }
    // 超量程文字
    if (overRange) {
      ctx.fillStyle = '#F44336'; ctx.font = 'bold 9px sans-serif'
      ctx.fillText('超量程!', x, y + r + 12)
    }
  }

  // ─── 数据面板 + 记录（右侧）───
  function drawDemoPanel(ctx, W, H, s, I, U_R) {
    const pw = W * 0.44, ph = H - 160
    const px = W * 0.54, py = 50
    ctx.fillStyle = 'rgba(255,255,255,0.97)'; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.fill()
    ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    let ky = py + 12
    ctx.fillText('📖 伏安法测电阻', px + 14, ky); ky += 26

    ctx.font = '12px sans-serif'; ctx.fillStyle = '#555'
    ctx.fillText('R = U / I（欧姆定律）', px + 14, ky); ky += 16
    ctx.fillText('Ⓐ串联在主回路，Ⓥ并联在待测电阻两端', px + 14, ky); ky += 24

    // 当前读数
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'
    ctx.fillText('📊 实时读数', px + 14, ky); ky += 18
    ctx.font = '12px monospace'; ctx.fillStyle = '#555'
    ctx.fillText(`U = ${U_R.toFixed(3)} V`, px + 14, ky); ky += 16
    ctx.fillText(`I = ${I.toFixed(4)} A`, px + 14, ky); ky += 16
    const R_now = I > 0.001 ? U_R / I : 0
    ctx.fillStyle = '#4A90D9'; ctx.font = 'bold 12px monospace'
    ctx.fillText(`R = ${R_now.toFixed(1)} Ω`, px + 14, ky); ky += 24

    // 数据表格
    if (s.data.length > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'
      ctx.fillText('📝 实验数据', px + 14, ky); ky += 18
      ctx.font = '10px monospace'; ctx.fillStyle = '#555'
      ctx.fillText('#   U(V)     I(A)      R(Ω)    操作', px + 14, ky); ky += 14
      for (let i = 0; i < s.data.length; i++) {
        const d = s.data[i]
        ctx.fillStyle = '#555'
        ctx.fillText(`${String(i+1).padStart(2)}  ${d.U.toFixed(3).padStart(6)}  ${d.I.toFixed(4).padStart(7)}  ${d.R.toFixed(1).padStart(6)}`, px + 14, ky)
        // 删除按钮
        ctx.fillStyle = '#F44336'; ctx.font = '9px sans-serif'
        ctx.fillText('✕', px + 190, ky)
        canvasRef.current._clickAreas.push({ x: px + 184, y: ky - 8, w: 16, h: 14, onClick: ((idx) => () => {
          s.data.splice(idx, 1); forceUpdate(n => n + 1)
        })(i) })
        ctx.font = '10px monospace'
        ky += 13
      }
      // 平均值
      if (s.data.length >= 3) {
        ky += 6
        const avgR = s.data.reduce((sum, d) => sum + d.R, 0) / s.data.length
        ctx.fillStyle = '#E53935'; ctx.font = 'bold 12px sans-serif'
        ctx.fillText(`R̄ = ${avgR.toFixed(1)} Ω（${s.data.length}组平均）`, px + 14, ky); ky += 16
        const err = Math.abs(avgR - s.R_true) / s.R_true * 100
        ctx.fillStyle = err < 5 ? '#4CAF50' : '#FF9800'; ctx.font = '11px sans-serif'
        ctx.fillText(`相对误差: ${err.toFixed(1)}%`, px + 14, ky)
      }
    }
    ctx.textBaseline = 'alphabetic'
  }

  // ─── 底部导航 ───
  function drawDemoNav(ctx, W, H, s, I, U_R) {
    const navY = H - 42
    // 记录按钮
    const recEnabled = s.switchClosed
    ctx.fillStyle = recEnabled ? '#4CAF50' : '#bdbdbd'
    ctx.beginPath(); ctx.roundRect(20, navY, 90, 30, 6); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('📝 记录', 65, navY + 15)
    if (recEnabled) {
      canvasRef.current._clickAreas.push({ x: 20, y: navY, w: 90, h: 30, onClick: () => {
        const Rtotal = s.R_true + s.sliderR
        const I_val = s.U_source / Rtotal
        const U_R_val = I_val * s.R_true
        const R_calc = I_val > 0 ? U_R_val / I_val : 0
        s.data.push({ U: U_R_val, I: I_val, R: R_calc })
        forceUpdate(n => n + 1)
      }})
    }

    // 清除按钮
    ctx.fillStyle = '#f0f0f0'
    ctx.beginPath(); ctx.roundRect(120, navY, 70, 30, 6); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(120, navY, 70, 30, 6); ctx.stroke()
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'
    ctx.fillText('清除', 155, navY + 15)
    canvasRef.current._clickAreas.push({ x: 120, y: navY, w: 70, h: 30, onClick: () => {
      s.data = []; forceUpdate(n => n + 1)
    }})

    // 导出CSV
    ctx.fillStyle = '#f0f0f0'
    ctx.beginPath(); ctx.roundRect(200, navY, 90, 30, 6); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(200, navY, 90, 30, 6); ctx.stroke()
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'
    ctx.fillText('📥 CSV', 245, navY + 15)
    canvasRef.current._clickAreas.push({ x: 200, y: navY, w: 90, h: 30, onClick: () => exportCSV(s) })

    // 重置按钮
    ctx.fillStyle = '#f0f0f0'
    ctx.beginPath(); ctx.roundRect(300, navY, 80, 30, 6); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(300, navY, 80, 30, 6); ctx.stroke()
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'
    ctx.fillText('↺ 重置', 340, navY + 15)
    canvasRef.current._clickAreas.push({ x: 300, y: navY, w: 80, h: 30, onClick: () => {
      s.U_source = DEFAULTS.U_source; s.R_true = DEFAULTS.R_true; s.sliderR = DEFAULTS.sliderR
      s.data = []; s.switchClosed = false; forceUpdate(n => n + 1)
    }})

    ctx.textBaseline = 'alphabetic'
  }

  // ═══════════════════════════════════════════
  //  Tab 2：自己动手（实物器材，禁止电路符号）
  // ═══════════════════════════════════════════
  function renderDIY(ctx, W, H, s) {
    const palW = 160
    const cvX = 10, cvY = 60, cvW = W - palW - 30, cvH = H - 120

    // 画布
    ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.roundRect(cvX, cvY, cvW, cvH, 8); ctx.fill()
    ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(cvX, cvY, cvW, cvH, 8); ctx.stroke()
    // 网格
    ctx.strokeStyle = '#f5f5f5'; ctx.lineWidth = 0.5
    for (let gx = cvX + 30; gx < cvX + cvW; gx += 30) {
      ctx.beginPath(); ctx.moveTo(gx, cvY); ctx.lineTo(gx, cvY + cvH); ctx.stroke()
    }
    for (let gy = cvY + 30; gy < cvY + cvH; gy += 30) {
      ctx.beginPath(); ctx.moveTo(cvX, gy); ctx.lineTo(cvX + cvW, gy); ctx.stroke()
    }

    // 首次引导
    if (s.showGuide) {
      ctx.fillStyle = 'rgba(33,150,243,0.08)'
      ctx.beginPath(); ctx.roundRect(cvX + 20, cvY + 20, cvW - 40, 80, 8); ctx.fill()
      ctx.fillStyle = '#1976D2'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText('🔧 操作引导：拖拽器材移动 → 点击接线柱开始连线 → 点击另一接线柱完成连接', cvX + cvW / 2, cvY + 32)
      ctx.fillText('右键删除器材/导线 · 双击开关切换通断', cvX + cvW / 2, cvY + 52)
      ctx.fillStyle = '#888'; ctx.font = '10px sans-serif'
      ctx.fillText('（点击任意位置关闭此提示）', cvX + cvW / 2, cvY + 72)
      canvasRef.current._clickAreas.push({ x: cvX, y: cvY, w: cvW, h: cvH, onClick: () => { s.showGuide = false } })
    }

    // 电路自检
    checkDIYCircuit(s)

    // 导线（带通电高亮）
    for (const wire of s.wires) drawDIYWire(ctx, wire, s)

    // 正在连线
    if (s.connecting) {
      const fc = s.components.find(c => c.id === s.connecting.compId)
      if (fc) {
        const ft = getTermPos(fc, s.connecting.termIdx)
        ctx.strokeStyle = '#1976D2'; ctx.lineWidth = 2; ctx.setLineDash([5, 5])
        ctx.beginPath(); ctx.moveTo(ft.x, ft.y); ctx.lineTo(s.connecting.mx, s.connecting.my); ctx.stroke()
        ctx.setLineDash([])
      }
    }

    // 实物器材
    for (const comp of s.components) drawRealisticComp(ctx, comp, s)

    // 电路状态
    ctx.fillStyle = s.circuitStatus.ok ? '#4CAF50' : '#F44336'
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText(s.circuitStatus.ok ? '✅ ' + s.circuitStatus.reason : '❌ ' + s.circuitStatus.reason, cvX + 12, cvY + cvH - 22)

    // 连线错误高亮
    for (const err of s.wireErrors) {
      const wire = s.wires.find(w => w.id === err.wireId)
      if (wire) {
        const fc = s.components.find(c => c.id === wire.from.compId)
        const tc = s.components.find(c => c.id === wire.to.compId)
        if (fc && tc) {
          const f = getTermPos(fc, wire.from.termIdx), t = getTermPos(tc, wire.to.termIdx)
          ctx.strokeStyle = '#F44336'; ctx.lineWidth = 4; ctx.globalAlpha = 0.4
          ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(t.x, t.y); ctx.stroke()
          ctx.globalAlpha = 1
        }
      }
    }

    // 器材栏
    drawPalette(ctx, W, H, cvX, cvY, cvH, palW, s)

    // 底部操作栏
    drawDIYNav(ctx, W, H, s)
  }

  function drawPalette(ctx, W, H, cvX, cvY, cvH, palW, s) {
    const palX = W - palW - 10
    ctx.fillStyle = '#f8f9fa'; ctx.beginPath(); ctx.roundRect(palX, cvY, palW, cvH, 8); ctx.fill()
    ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(palX, cvY, palW, cvH, 8); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('🧰 实物器材', palX + 10, cvY + 8)

    const items = [
      { type: 'battery', name: '干电池组' },
      { type: 'switch', name: '闸刀开关' },
      { type: 'ammeter', name: '电流表' },
      { type: 'voltmeter', name: '电压表' },
      { type: 'rheostat', name: '滑动变阻器' },
      { type: 'resistor', name: '定值电阻' },
    ]
    let iy = cvY + 30
    for (const item of items) {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(palX + 6, iy, palW - 12, 40, 6); ctx.fill()
      ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(palX + 6, iy, palW - 12, 40, 6); ctx.stroke()
      drawRealisticIcon(ctx, palX + 26, iy + 20, item.type)
      ctx.fillStyle = '#333'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText(item.name, palX + 46, iy + 20); ctx.textBaseline = 'alphabetic'
      canvasRef.current._palAreas.push({ x: palX + 6, y: iy, w: palW - 12, h: 40, type: item.type })
      iy += 46
    }

    // 撤销/重做
    iy += 10
    ctx.fillStyle = s.undoStack.length > 0 ? '#f0f0f0' : '#f8f8f8'
    ctx.beginPath(); ctx.roundRect(palX + 6, iy, (palW - 18) / 2, 28, 4); ctx.fill()
    ctx.fillStyle = s.undoStack.length > 0 ? '#333' : '#ccc'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('↩ 撤销', palX + 6 + (palW - 18) / 4, iy + 14)
    if (s.undoStack.length > 0) {
      canvasRef.current._clickAreas.push({ x: palX + 6, y: iy, w: (palW - 18) / 2, h: 28, onClick: () => {
        s.redoStack.push({ components: JSON.parse(JSON.stringify(s.components)), wires: JSON.parse(JSON.stringify(s.wires)) })
        const snap = s.undoStack.pop()
        s.components = snap.components; s.wires = snap.wires
        forceUpdate(n => n + 1)
      }})
    }

    ctx.fillStyle = s.redoStack.length > 0 ? '#f0f0f0' : '#f8f8f8'
    ctx.beginPath(); ctx.roundRect(palX + 6 + (palW - 18) / 2 + 6, iy, (palW - 18) / 2, 28, 4); ctx.fill()
    ctx.fillStyle = s.redoStack.length > 0 ? '#333' : '#ccc'; ctx.font = '11px sans-serif'
    ctx.fillText('↪ 重做', palX + 6 + (palW - 18) / 2 + 6 + (palW - 18) / 4, iy + 14)
    if (s.redoStack.length > 0) {
      canvasRef.current._clickAreas.push({ x: palX + 6 + (palW - 18) / 2 + 6, y: iy, w: (palW - 18) / 2, h: 28, onClick: () => {
        s.undoStack.push({ components: JSON.parse(JSON.stringify(s.components)), wires: JSON.parse(JSON.stringify(s.wires)) })
        const snap = s.redoStack.pop()
        s.components = snap.components; s.wires = snap.wires
        forceUpdate(n => n + 1)
      }})
    }
    ctx.textBaseline = 'alphabetic'
  }

  function drawDIYNav(ctx, W, H, s) {
    const navY = H - 42
    // 开关按钮
    const swLabel = s.switchClosed ? '🔴 断开开关' : '🟢 闭合开关'
    ctx.fillStyle = s.switchClosed ? '#E53935' : '#4CAF50'
    ctx.beginPath(); ctx.roundRect(20, navY, 110, 30, 6); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(swLabel, 75, navY + 15)
    canvasRef.current._clickAreas.push({ x: 20, y: navY, w: 110, h: 30, onClick: () => {
      s.switchClosed = !s.switchClosed
      const sw = s.components.find(c => c.type === 'switch')
      if (sw) sw.closed = s.switchClosed
      forceUpdate(n => n + 1)
    }})

    // 记录按钮（断开时置灰）
    const recEnabled = s.switchClosed && s.circuitStatus.ok
    ctx.fillStyle = recEnabled ? '#4CAF50' : '#bdbdbd'
    ctx.beginPath(); ctx.roundRect(140, navY, 90, 30, 6); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'
    ctx.fillText('📝 记录', 185, navY + 15)
    if (recEnabled) {
      canvasRef.current._clickAreas.push({ x: 140, y: navY, w: 90, h: 30, onClick: () => {
        const Rtotal = s.R_true + s.sliderR
        const I_val = Rtotal > 0 ? s.U_source / Rtotal : 0
        const U_R_val = I_val * s.R_true
        const R_calc = I_val > 0 ? U_R_val / I_val : 0
        s.data.push({ U: U_R_val, I: I_val, R: R_calc })
        forceUpdate(n => n + 1)
      }})
    }

    // CSV
    ctx.fillStyle = '#f0f0f0'
    ctx.beginPath(); ctx.roundRect(240, navY, 80, 30, 6); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(240, navY, 80, 30, 6); ctx.stroke()
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'
    ctx.fillText('📥 CSV', 280, navY + 15)
    canvasRef.current._clickAreas.push({ x: 240, y: navY, w: 80, h: 30, onClick: () => exportCSV(s) })

    // 重置
    ctx.fillStyle = '#f0f0f0'
    ctx.beginPath(); ctx.roundRect(330, navY, 80, 30, 6); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(330, navY, 80, 30, 6); ctx.stroke()
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'
    ctx.fillText('↺ 重置', 370, navY + 15)
    canvasRef.current._clickAreas.push({ x: 330, y: navY, w: 80, h: 30, onClick: () => {
      s.U_source = DEFAULTS.U_source; s.R_true = DEFAULTS.R_true; s.sliderR = DEFAULTS.sliderR
      s.data = []; s.switchClosed = false; s.wires = []; s.undoStack = []; s.redoStack = []
      s.components = [
        { id: 1, type: 'battery', x: 200, y: 280, rotation: 0 },
        { id: 2, type: 'switch', x: 370, y: 150, rotation: 0, closed: false },
        { id: 3, type: 'ammeter', x: 520, y: 150, rotation: 0 },
        { id: 4, type: 'resistor', x: 680, y: 150, rotation: 0 },
        { id: 5, type: 'rheostat', x: 400, y: 380, rotation: 0 },
        { id: 6, type: 'voltmeter', x: 680, y: 340, rotation: 0 },
      ]
      forceUpdate(n => n + 1)
    }})

    // 数据统计
    if (s.data.length > 0) {
      ctx.fillStyle = '#555'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText(`已记录 ${s.data.length} 组`, 430, navY + 15)
      if (s.data.length >= 3) {
        const avgR = s.data.reduce((sum, d) => sum + d.R, 0) / s.data.length
        ctx.fillStyle = '#E53935'; ctx.font = 'bold 11px sans-serif'
        ctx.fillText(`R̄=${avgR.toFixed(1)}Ω`, 510, navY + 15)
      }
    }
    ctx.textBaseline = 'alphabetic'
  }

  // ═══════════════════════════════════════════
  //  实物器材绘制（Tab2专用，禁止电路符号）
  // ═══════════════════════════════════════════
  function drawRealisticComp(ctx, comp, s) {
    const { x, y, type } = comp
    const on = s.switchClosed
    const Rtotal = s.R_true + s.sliderR
    const I = on && Rtotal > 0 ? s.U_source / Rtotal : 0
    const U_R = I * s.R_true

    ctx.save(); ctx.translate(x, y)
    if (s.dragId === comp.id) ctx.globalAlpha = 0.6

    if (type === 'battery') {
      const img = imageCache.current.battery
      if (img) {
        ctx.drawImage(img, -45, -28, 90, 56)
      } else {
        drawRealBattery(ctx, s.U_source)
      }
    } else if (type === 'switch') {
      const img = imageCache.current.switch
      if (img) {
        ctx.drawImage(img, -40, -20, 80, 40)
        // 通断状态叠加色
        ctx.fillStyle = comp.closed !== false ? 'rgba(76,175,80,0.12)' : 'rgba(244,67,54,0.08)'
        ctx.beginPath(); ctx.arc(0, 0, 25, 0, Math.PI * 2); ctx.fill()
      } else {
        drawRealSwitch(ctx, comp.closed !== false)
      }
    } else if (type === 'ammeter') {
      const img = imageCache.current.ammeter
      if (img) {
        ctx.drawImage(img, -32, -32, 64, 64)
        drawMeterNeedle(ctx, s.needleA, s.overRangeA, on ? `${I.toFixed(3)}A` : '', '#E53935', 30)
      } else {
        drawRealMeter(ctx, 'A', s.needleA, s.overRangeA, on ? `${I.toFixed(3)}A` : '', '#E53935')
      }
    } else if (type === 'voltmeter') {
      const img = imageCache.current.voltmeter
      if (img) {
        ctx.drawImage(img, -32, -32, 64, 64)
        drawMeterNeedle(ctx, s.needleV, s.overRangeV, on ? `${U_R.toFixed(2)}V` : '', '#4CAF50', 30)
      } else {
        drawRealMeter(ctx, 'V', s.needleV, s.overRangeV, on ? `${U_R.toFixed(2)}V` : '', '#4CAF50')
      }
    } else if (type === 'rheostat') {
      const img = imageCache.current.rheostat
      if (img) {
        ctx.drawImage(img, -50, -25, 100, 50)
      } else {
        drawRealRheostat(ctx, s.sliderR, 50)
      }
    } else if (type === 'resistor') {
      const img = imageCache.current.resistor
      if (img) {
        ctx.drawImage(img, -35, -22, 70, 44)
      } else {
        drawRealResistor(ctx, s.R_true)
      }
    }

    ctx.globalAlpha = 1; ctx.restore()

    // 接线柱（吸附点）
    const terms = getTerminals(comp)
    for (let i = 0; i < terms.length; i++) {
      const t = terms[i]
      const hov = s.hoverTerm && s.hoverTerm.compId === comp.id && s.hoverTerm.termIdx === i
      const isSnap = s.connecting && hov
      ctx.fillStyle = isSnap ? '#4CAF50' : hov ? '#FF9800' : '#fff'
      ctx.strokeStyle = isSnap ? '#2E7D32' : hov ? '#E65100' : '#666'
      ctx.lineWidth = isSnap ? 3 : 2
      ctx.beginPath(); ctx.arc(t.x, t.y, isSnap ? 8 : 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      if (isSnap) {
        ctx.strokeStyle = 'rgba(76,175,80,0.3)'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.arc(t.x, t.y, 14, 0, Math.PI * 2); ctx.stroke()
      }
    }
  }

  // ─── 干电池组（实物风格）───
  function drawRealBattery(ctx, voltage) {
    const grd = ctx.createLinearGradient(-40, -25, 40, 25)
    grd.addColorStop(0, '#A5D6A7'); grd.addColorStop(0.5, '#66BB6A'); grd.addColorStop(1, '#388E3C')
    ctx.fillStyle = grd; ctx.strokeStyle = '#2E7D32'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(-40, -25, 80, 50, 8); ctx.fill(); ctx.stroke()
    // + − 极柱
    ctx.fillStyle = '#E53935'; ctx.strokeStyle = '#C62828'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.roundRect(-44, -8, 8, 16, 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.strokeStyle = '#212121'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.roundRect(36, -8, 8, 16, 2); ctx.fill(); ctx.stroke()
    // 标签
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(`干电池组`, 0, -5)
    ctx.fillText(`${voltage}V`, 0, 10)
    ctx.textBaseline = 'alphabetic'
  }

  // ─── 闸刀开关（实物风格）───
  function drawRealSwitch(ctx, closed) {
    ctx.fillStyle = '#ECEFF1'; ctx.strokeStyle = '#78909C'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(-38, -18, 76, 36, 6); ctx.fill(); ctx.stroke()
    // 底座接线柱
    ctx.fillStyle = '#546E7A'; ctx.beginPath(); ctx.arc(-26, 0, 6, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(26, 0, 6, 0, Math.PI * 2); ctx.fill()
    // 闸刀
    if (closed) {
      ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 4; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(26, 0); ctx.stroke(); ctx.lineCap = 'butt'
      ctx.fillStyle = '#4CAF50'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText('ON', 0, 20)
    } else {
      ctx.strokeStyle = '#F44336'; ctx.lineWidth = 4; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(14, -22); ctx.stroke(); ctx.lineCap = 'butt'
      ctx.fillStyle = '#F44336'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText('OFF', 0, 20)
    }
    ctx.fillStyle = '#555'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText('闸刀开关', 0, -20)
    ctx.textBaseline = 'alphabetic'
  }

  // ─── 实物电表（带指针+超量程闪烁）───
  function drawRealMeter(ctx, type, needleAngle, overRange, reading, color) {
    const r = 30
    // 超量程闪烁
    if (overRange) {
      const flash = Math.sin(Date.now() / 150) > 0
      ctx.fillStyle = flash ? 'rgba(244,67,54,0.3)' : 'rgba(244,67,54,0.1)'
      ctx.beginPath(); ctx.arc(0, 0, r + 8, 0, Math.PI * 2); ctx.fill()
    }
    // 表盘
    ctx.fillStyle = '#FAFAFA'; ctx.strokeStyle = overRange ? '#F44336' : color; ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    // 刻度弧
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    for (let i = 0; i <= 10; i++) {
      const a = -Math.PI * 0.75 + (i / 10) * Math.PI * 1.5
      const x1 = Math.cos(a) * (r - 4), y1 = Math.sin(a) * (r - 4)
      const x2 = Math.cos(a) * (r - (i % 5 === 0 ? 10 : 7)), y2 = Math.sin(a) * (r - (i % 5 === 0 ? 10 : 7))
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    }
    // 指针
    const angle = -Math.PI * 0.75 + Math.min(needleAngle, 1.5) * Math.PI * 1.5 / 1.5
    ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(angle) * (r - 8), Math.sin(angle) * (r - 8)); ctx.stroke()
    ctx.lineCap = 'butt'
    // 中心轴
    ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill()
    // 类型标签
    ctx.fillStyle = color; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(type, 0, -8)
    // 读数
    if (reading) {
      ctx.fillStyle = overRange ? '#F44336' : '#333'; ctx.font = 'bold 11px monospace'
      ctx.fillText(reading, 0, 12)
    }
    // 超量程
    if (overRange) {
      ctx.fillStyle = '#F44336'; ctx.font = 'bold 9px sans-serif'
      ctx.fillText('超量程!', 0, r + 14)
    }
    ctx.textBaseline = 'alphabetic'
  }

  // ─── 滑动变阻器实物 ───
  function drawRealRheostat(ctx, R, maxR) {
    // 陶瓷底座
    ctx.fillStyle = '#EFEBE9'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(-45, -22, 90, 44, 6); ctx.fill(); ctx.stroke()
    // 电阻丝（螺旋线圈效果）
    ctx.strokeStyle = '#795548'; ctx.lineWidth = 2
    for (let i = 0; i < 8; i++) {
      const x = -32 + i * 9
      ctx.beginPath(); ctx.arc(x, 0, 8, Math.PI, 0); ctx.stroke()
    }
    // 滑片
    const ratio = R / maxR
    const sliderX = -40 + ratio * 80
    ctx.fillStyle = '#546E7A'; ctx.strokeStyle = '#37474F'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(sliderX, -26); ctx.lineTo(sliderX - 8, -20); ctx.lineTo(sliderX + 8, -20); ctx.closePath(); ctx.fill(); ctx.stroke()
    // 接线柱
    ctx.fillStyle = '#B0BEC5'; ctx.beginPath(); ctx.arc(-40, 0, 5, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(40, 0, 5, 0, Math.PI * 2); ctx.fill()
    // 标签
    ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(`滑动变阻器 ${R}Ω`, 0, 24)
    ctx.textBaseline = 'alphabetic'
  }

  // ─── 定值电阻实物 ───
  function drawRealResistor(ctx, R) {
    // 陶瓷体
    ctx.fillStyle = '#EFEBE9'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(-30, -16, 60, 32, 4); ctx.fill(); ctx.stroke()
    // 色环
    const bands = getColorBands(R)
    bands.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(-20 + i * 12, -16, 8, 32) })
    // 引脚
    ctx.strokeStyle = '#9E9E9E'; ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(-42, 0); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(42, 0); ctx.stroke()
    // 标签
    ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(`定值电阻 ${R}Ω`, 0, 18)
    ctx.textBaseline = 'alphabetic'
  }

  function getColorBands(R) {
    const colors = ['#000', '#B71C1C', '#FF6F00', '#FFD54F', '#4CAF50', '#1976D2', '#7B1FA2', '#757575', '#fff']
    const str = String(Math.round(R))
    const bands = []
    for (const ch of str) {
      if (ch >= '0' && ch <= '9') bands.push(colors[parseInt(ch)])
    }
    bands.push('#FFD54F') // 金色容差
    return bands.slice(0, 4)
  }

  // ─── 指针动画叠加层（用于真实图片模式）───
  function drawMeterNeedle(ctx, needleAngle, overRange, reading, color, r) {
    // 超量程闪烁
    if (overRange) {
      const flash = Math.sin(Date.now() / 150) > 0
      ctx.fillStyle = flash ? 'rgba(244,67,54,0.25)' : 'rgba(244,67,54,0.08)'
      ctx.beginPath(); ctx.arc(0, 0, r + 6, 0, Math.PI * 2); ctx.fill()
    }
    // 指针（在图片上方绘制）
    const angle = -Math.PI * 0.6 + Math.min(needleAngle, 1.5) * Math.PI * 1.2
    ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(angle) * (r - 6), Math.sin(angle) * (r - 6)); ctx.stroke()
    ctx.lineCap = 'butt'
    ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill()
    // 读数
    if (reading) {
      ctx.fillStyle = overRange ? '#F44336' : '#fff'
      ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText(reading, 0, r - 4)
    }
    if (overRange) {
      ctx.fillStyle = '#F44336'; ctx.font = 'bold 9px sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText('超量程!', 0, r + 10)
    }
    ctx.textBaseline = 'alphabetic'
  }

  // ─── 实物器材小图标（器材栏用）───
  function drawRealisticIcon(ctx, x, y, type) {
    ctx.save(); ctx.translate(x, y)
    const img = imageCache.current[type]
    if (img) {
      ctx.drawImage(img, -12, -10, 24, 20)
    } else if (type === 'battery') {
      ctx.fillStyle = '#81C784'; ctx.strokeStyle = '#388E3C'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.roundRect(-12, -8, 24, 16, 3); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('+−', 0, 0)
    } else if (type === 'switch') {
      ctx.fillStyle = '#ECEFF1'; ctx.strokeStyle = '#90A4AE'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.roundRect(-12, -6, 24, 12, 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#666'; ctx.beginPath(); ctx.arc(-7, 0, 2, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(7, 0, 2, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 2; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(4, -5); ctx.stroke(); ctx.lineCap = 'butt'
    } else if (type === 'ammeter') {
      ctx.fillStyle = '#FFEBEE'; ctx.strokeStyle = '#E53935'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('A', 0, 0)
    } else if (type === 'voltmeter') {
      ctx.fillStyle = '#E8F5E9'; ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#4CAF50'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('V', 0, 0)
    } else if (type === 'rheostat') {
      ctx.fillStyle = '#EFEBE9'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.roundRect(-12, -6, 24, 12, 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#546E7A'; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(-4, -6); ctx.lineTo(4, -6); ctx.closePath(); ctx.fill()
    } else if (type === 'resistor') {
      ctx.fillStyle = '#EFEBE9'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.roundRect(-12, -6, 24, 12, 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#B71C1C'; ctx.fillRect(-8, -6, 4, 12)
      ctx.fillStyle = '#4CAF50'; ctx.fillRect(-3, -6, 4, 12)
    }
    ctx.restore()
  }

  // ═══════════════════════════════════════════
  //  通用绘制函数
  // ═══════════════════════════════════════════
  function drawStdBattery(ctx, x, y) {
    ctx.strokeStyle = '#333'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(x - 12, y - 18); ctx.lineTo(x - 12, y + 18); ctx.stroke()
    ctx.lineWidth = 5
    ctx.beginPath(); ctx.moveTo(x + 12, y - 9); ctx.lineTo(x + 12, y + 9); ctx.stroke()
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText('+', x - 12, y - 20)
    ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'
    ctx.fillText('−', x + 12, y - 11)
    ctx.textBaseline = 'alphabetic'
  }

  function drawStdSwitch(ctx, x, y, on, onClick) {
    ctx.fillStyle = '#666'
    ctx.beginPath(); ctx.arc(x - 18, y, 4, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(x + 18, y, 4, 0, Math.PI * 2); ctx.fill()
    if (on) {
      ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 3; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(x - 18, y); ctx.lineTo(x + 18, y); ctx.stroke(); ctx.lineCap = 'butt'
    } else {
      ctx.strokeStyle = '#F44336'; ctx.lineWidth = 3; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(x - 18, y); ctx.lineTo(x + 10, y - 20); ctx.stroke(); ctx.lineCap = 'butt'
    }
    ctx.fillStyle = on ? '#4CAF50' : '#F44336'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(on ? 'ON' : 'OFF', x, y + 8); ctx.textBaseline = 'alphabetic'
    canvasRef.current._clickAreas.push({ x: x - 25, y: y - 25, w: 50, h: 50, onClick })
  }

  function drawStdResistor(ctx, x, y, label) {
    ctx.fillStyle = '#EFEBE9'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(x - 16, y - 10, 32, 20, 3); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(label, x, y); ctx.textBaseline = 'alphabetic'
  }

  function drawSlidingR(ctx, x, y, R, maxR) {
    ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(x - 24, y - 10, 48, 20, 3); ctx.fill(); ctx.stroke()
    const ratio = R / maxR
    const sliderX = x - 24 + ratio * 48
    ctx.fillStyle = '#546E7A'; ctx.strokeStyle = '#37474F'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(sliderX, y - 16); ctx.lineTo(sliderX - 6, y - 10); ctx.lineTo(sliderX + 6, y - 10); ctx.closePath(); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(`${R}Ω`, x, y + 12); ctx.textBaseline = 'alphabetic'
  }

  function drawLine(ctx, x1, y1, x2, y2, color, w) {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
  }

  function drawCurrentFlow(ctx, points, time, speed) {
    let totalLen = 0; const segs = []
    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1].x - points[i].x, dy = points[i + 1].y - points[i].y
      const len = Math.sqrt(dx * dx + dy * dy)
      segs.push({ ...points[i], ex: points[i + 1].x, ey: points[i + 1].y, len }); totalLen += len
    }
    ctx.fillStyle = '#FFEB3B'
    const n = Math.max(5, Math.floor(totalLen / 45))
    for (let d = 0; d < n; d++) {
      let pos = ((time * speed * 100 + d * (totalLen / n)) % totalLen)
      for (const seg of segs) {
        if (pos <= seg.len) {
          const r = pos / seg.len
          ctx.beginPath(); ctx.arc(seg.x + (seg.ex - seg.x) * r, seg.y + (seg.ey - seg.y) * r, 3, 0, Math.PI * 2); ctx.fill()
          break
        }
        pos -= seg.len
      }
    }
  }

  function drawDIYWire(ctx, wire, s) {
    const fc = s.components.find(c => c.id === wire.from.compId)
    const tc = s.components.find(c => c.id === wire.to.compId)
    if (!fc || !tc) return
    const f = getTermPos(fc, wire.from.termIdx), t = getTermPos(tc, wire.to.termIdx)
    const isError = s.wireErrors.some(e => e.wireId === wire.id)
    const on = s.switchClosed
    const color = isError ? '#F44336' : on ? '#1565C0' : '#999'
    // 通电高亮
    if (on && !isError) {
      ctx.strokeStyle = 'rgba(21,101,225,0.2)'; ctx.lineWidth = 8
      ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(t.x, t.y); ctx.stroke()
    }
    ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(t.x, t.y); ctx.stroke()
    ctx.lineCap = 'butt'
    // 错误标记
    if (isError) {
      const mx = (f.x + t.x) / 2, my = (f.y + t.y) / 2
      ctx.fillStyle = '#F44336'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('✗ 错误连线', mx, my - 10)
    }
  }

  // ═══════════════════════════════════════════
  //  电路自检（Tab2）
  // ═══════════════════════════════════════════
  function checkDIYCircuit(s) {
    s.wireErrors = []
    const comps = s.components
    const wires = s.wires

    // 建立连接图
    const adj = {}
    for (const c of comps) adj[c.id] = new Set()
    for (const w of wires) {
      adj[w.from.compId]?.add(w.to.compId)
      adj[w.to.compId]?.add(w.from.compId)
    }

    // 检查必需元件
    const hasBattery = comps.some(c => c.type === 'battery')
    const hasResistor = comps.some(c => c.type === 'resistor')
    const hasAmmeter = comps.some(c => c.type === 'ammeter')
    const hasVoltmeter = comps.some(c => c.type === 'voltmeter')

    if (!hasBattery) { s.circuitStatus = { ok: false, reason: '缺少电源' }; return }
    if (!hasResistor) { s.circuitStatus = { ok: false, reason: '缺少待测电阻' }; return }

    // 检查所有器材是否连接
    const unconnected = comps.filter(c => !adj[c.id] || adj[c.id].size === 0)
    if (unconnected.length > 0) {
      s.circuitStatus = { ok: false, reason: `${unconnected.map(c => c.type).join('、')}未连接` }; return
    }

    // 检查闭合回路（从电源出发）
    const battery = comps.find(c => c.type === 'battery')
    const visited = new Set()
    let hasLoop = false
    function dfs(node, depth) {
      if (depth > 0 && node === battery.id) { hasLoop = true; return }
      if (visited.has(node) || depth > comps.length + 2) return
      visited.add(node)
      for (const next of adj[node] || []) dfs(next, depth + 1)
    }
    dfs(battery.id, 0)

    if (!hasLoop) { s.circuitStatus = { ok: false, reason: '断路：未形成闭合回路' }; return }

    // 检查短路（电源两极直接连通，不经过负载）
    const batteryTerms = getTerminals(battery)
    // 简化：如果电源两端有直接连接的导线，视为短路
    for (const w of wires) {
      if (w.from.compId === battery.id && w.to.compId === battery.id) {
        s.wireErrors.push({ wireId: w.id, reason: '短路' })
        s.circuitStatus = { ok: false, reason: '短路：电源两极直接连通！' }; return
      }
    }

    // 检查A表是否串联
    if (hasAmmeter) {
      const ammeter = comps.find(c => c.type === 'ammeter')
      if (adj[ammeter.id]?.size < 2) {
        s.circuitStatus = { ok: false, reason: '电流表未串联接入电路' }; return
      }
    }

    // 检查V表是否并联
    if (hasVoltmeter) {
      const voltmeter = comps.find(c => c.type === 'voltmeter')
      if (adj[voltmeter.id]?.size < 2) {
        s.circuitStatus = { ok: false, reason: '电压表未并联在电阻两端' }; return
      }
    }

    s.circuitStatus = { ok: true, reason: '电路正常，可以开始实验' }
  }

  // ═══════════════════════════════════════════
  //  接线柱定位
  // ═══════════════════════════════════════════
  function getTerminals(comp) {
    const offsets = {
      battery: [{ x: -44, y: 0 }, { x: 44, y: 0 }],
      switch: [{ x: -26, y: 0 }, { x: 26, y: 0 }],
      ammeter: [{ x: -30, y: 0 }, { x: 30, y: 0 }],
      voltmeter: [{ x: -30, y: 0 }, { x: 30, y: 0 }],
      rheostat: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
      resistor: [{ x: -42, y: 0 }, { x: 42, y: 0 }],
    }
    return (offsets[comp.type] || [{ x: -30, y: 0 }, { x: 30, y: 0 }]).map(o => ({
      x: comp.x + o.x, y: comp.y + o.y,
    }))
  }

  function getTermPos(comp, idx) { return getTerminals(comp)[idx] }

  function findTerm(mx, my) {
    let best = null, bestDist = SNAP_DIST * SNAP_DIST
    for (const comp of S().components) {
      const terms = getTerminals(comp)
      for (let i = 0; i < terms.length; i++) {
        const d = (mx - terms[i].x) ** 2 + (my - terms[i].y) ** 2
        if (d < bestDist) { bestDist = d; best = { compId: comp.id, termIdx: i } }
      }
    }
    return best
  }

  function findComp(mx, my) {
    for (let i = S().components.length - 1; i >= 0; i--) {
      const c = S().components[i]
      const size = COMP[c.type] || { w: 60, h: 40 }
      if (Math.abs(mx - c.x) < size.w / 2 + 10 && Math.abs(my - c.y) < size.h / 2 + 10) return c
    }
    return null
  }

  function saveUndo(s) {
    s.undoStack.push({ components: JSON.parse(JSON.stringify(s.components)), wires: JSON.parse(JSON.stringify(s.wires)) })
    if (s.undoStack.length > 30) s.undoStack.shift()
    s.redoStack = []
  }

  // ═══════════════════════════════════════════
  //  CSV 导出
  // ═══════════════════════════════════════════
  function exportCSV(s) {
    if (s.data.length === 0) return
    const header = '#,U(V),I(A),R(Ω)'
    const rows = s.data.map((d, i) => `${i + 1},${d.U.toFixed(4)},${d.I.toFixed(5)},${d.R.toFixed(2)}`)
    const csv = header + '\n' + rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `volt_ampere_${Date.now()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // ═══════════════════════════════════════════
  //  交互
  // ═══════════════════════════════════════════
  const getPos = (e) => { const r = canvasRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    const { x, y } = getPos(e)

    // Tab1 点击热区
    if (tabRef.current === 1) {
      for (const a of canvasRef.current._clickAreas || []) {
        if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(); return }
      }
      return
    }

    const s = diyRef.current

    // 器材栏拖拽
    for (const a of canvasRef.current._palAreas || []) {
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) {
        if (a.type) {
          saveUndo(s)
          const id = s.nextId++
          s.components.push({ id, type: a.type, x, y, rotation: 0, closed: true })
          s.dragId = id; s.dragOffX = 0; s.dragOffY = 0
          forceUpdate(n => n + 1); return
        }
      }
    }

    // 接线柱点击
    const term = findTerm(x, y)
    if (term) {
      if (s.connecting) {
        // 完成连线
        if (term.compId !== s.connecting.compId || term.termIdx !== s.connecting.termIdx) {
          const dup = s.wires.some(w =>
            (w.from.compId === s.connecting.compId && w.from.termIdx === s.connecting.termIdx && w.to.compId === term.compId && w.to.termIdx === term.termIdx) ||
            (w.to.compId === s.connecting.compId && w.to.termIdx === s.connecting.termIdx && w.from.compId === term.compId && w.from.termIdx === term.termIdx))
          if (!dup) {
            saveUndo(s)
            s.wires.push({ id: s.nextId++, from: { ...s.connecting }, to: term })
          }
        }
        s.connecting = null; s.hoverTerm = null
      } else {
        s.connecting = { ...term, mx: x, my: y }
      }
      forceUpdate(n => n + 1); return
    }

    // 器材拖拽
    const comp = findComp(x, y)
    if (comp) { s.dragId = comp.id; s.dragOffX = x - comp.x; s.dragOffY = y - comp.y; forceUpdate(n => n + 1) }
  }, [])

  const handleMouseMove = useCallback((e) => {
    const { x, y } = getPos(e)
    if (tabRef.current !== 2) return
    const s = diyRef.current
    if (s.dragId) {
      const c = s.components.find(c => c.id === s.dragId)
      if (c) { c.x = x - s.dragOffX; c.y = y - s.dragOffY; forceUpdate(n => n + 1) }
      return
    }
    if (s.connecting) {
      s.connecting.mx = x; s.connecting.my = y
      const t = findTerm(x, y)
      s.hoverTerm = t && (t.compId !== s.connecting.compId || t.termIdx !== s.connecting.termIdx) ? t : null
      forceUpdate(n => n + 1); return
    }
    s.hoverTerm = findTerm(x, y)
    canvasRef.current.style.cursor = s.hoverTerm ? 'crosshair' : findComp(x, y) ? 'grab' : 'default'
  }, [])

  const handleMouseUp = useCallback(() => {
    if (tabRef.current !== 2) return
    const s = diyRef.current
    if (s.dragId) { s.dragId = null; forceUpdate(n => n + 1) }
  }, [])

  const handleContextMenu = useCallback((e) => {
    if (tabRef.current !== 2) return; e.preventDefault()
    const { x, y } = getPos(e)
    const s = diyRef.current
    const comp = findComp(x, y)
    if (comp) {
      saveUndo(s)
      s.components = s.components.filter(c => c.id !== comp.id)
      s.wires = s.wires.filter(w => w.from.compId !== comp.id && w.to.compId !== comp.id)
    } else {
      // 检查是否点击在导线上
      for (const wire of s.wires) {
        const fc = s.components.find(c => c.id === wire.from.compId)
        const tc = s.components.find(c => c.id === wire.to.compId)
        if (!fc || !tc) continue
        const f = getTermPos(fc, wire.from.termIdx), t = getTermPos(tc, wire.to.termIdx)
        // 点到线段距离
        const dx = t.x - f.x, dy = t.y - f.y
        const len2 = dx * dx + dy * dy
        if (len2 === 0) continue
        const t_param = Math.max(0, Math.min(1, ((x - f.x) * dx + (y - f.y) * dy) / len2))
        const px = f.x + t_param * dx, py = f.y + t_param * dy
        if ((x - px) ** 2 + (y - py) ** 2 < 100) {
          saveUndo(s)
          s.wires = s.wires.filter(w => w.id !== wire.id)
          break
        }
      }
    }
    forceUpdate(n => n + 1)
  }, [])

  const handleDoubleClick = useCallback((e) => {
    if (tabRef.current !== 2) return
    const { x, y } = getPos(e)
    const s = diyRef.current
    const comp = findComp(x, y)
    if (comp && comp.type === 'switch') {
      comp.closed = !comp.closed
      s.switchClosed = comp.closed
      forceUpdate(n => n + 1)
    }
  }, [])

  // ── 标签切换（隔离状态）──
  const switchTab = useCallback((newTab) => {
    if (newTab === tabRef.current) return
    // 重置旧模式
    const old = tabRef.current === 1 ? demoRef.current : diyRef.current
    old.switchClosed = false
    old.data = []
    tabRef.current = newTab
    setTab(newTab)
    forceUpdate(n => n + 1)
  }, [])

  // ── 顶部参数联动（两模式共享）──
  const updateParam = useCallback((key, val) => {
    demoRef.current[key] = val
    diyRef.current[key] = val
    forceUpdate(n => n + 1)
  }, [])

  const s_demo = demoRef.current
  const s_diy = diyRef.current

  return (
    <div style={styles.container}>
      {/* 标签栏 */}
      <div style={styles.topBar}>
        <span style={styles.title}>伏安法测定值电阻</span>
        <div style={styles.topActions}>
          <button style={tab === 1 ? styles.tabActive : styles.tab} onClick={() => switchTab(1)}>📖 实验演示</button>
          <button style={tab === 2 ? styles.tabActive : styles.tab} onClick={() => switchTab(2)}>🔧 自己动手</button>
          <div style={styles.sep} />
          <label style={styles.lbl}>电源U：
            <input type="range" min="1" max="12" step="0.5" value={s_demo.U_source}
              onChange={(e) => updateParam('U_source', parseFloat(e.target.value))} style={styles.slider} />
            <span style={styles.val}>{s_demo.U_source.toFixed(1)}V</span>
          </label>
          <label style={styles.lbl}>R真值：
            <input type="range" min="5" max="50" step="1" value={s_demo.R_true}
              onChange={(e) => updateParam('R_true', parseInt(e.target.value))} style={styles.slider} />
            <span style={styles.val}>{s_demo.R_true}Ω</span>
          </label>
          <label style={styles.lbl}>滑动变阻器：
            <input type="range" min="0" max="50" step="1" value={s_demo.sliderR}
              onChange={(e) => updateParam('sliderR', parseInt(e.target.value))} style={styles.slider} />
            <span style={styles.val}>{s_demo.sliderR}Ω</span>
          </label>
        </div>
      </div>

      {/* 画布 */}
      <div style={styles.main}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
          onContextMenu={handleContextMenu} onDoubleClick={handleDoubleClick} />
      </div>

      {/* 底部说明 */}
      <div style={styles.desc}>
        <b>伏安法测定值电阻</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          {tab === 1
            ? '实验演示：电路符号图 · 调节滑动变阻器 · 记录多组U/I · R=U/I求平均值'
            : '自己动手：拖拽实物器材 · 接线柱吸附连线 · 右键删除 · 双击开关'}
        </span>
      </div>
    </div>
  )
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', maxHeight: '100vh', background: '#f0f4f8', color: '#333', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', overflow: 'hidden' },
  topBar: { minHeight: 44, background: '#f5f5f5', borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', flexShrink: 0, flexWrap: 'wrap', gap: 6 },
  title: { fontSize: 14, fontWeight: 600, color: '#333' },
  topActions: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 },
  tab: { background: '#f0f0f0', color: '#666', border: '1px solid #ddd', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  tabActive: { background: '#4A90D9', color: '#fff', border: '1px solid #4A90D9', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600 },
  sep: { width: 1, height: 20, background: '#ddd' },
  lbl: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#666' },
  slider: { width: 70, accentColor: '#4A90D9' },
  val: { color: '#4A90D9', fontWeight: 600, minWidth: 40, fontSize: 12 },
  main: { flex: 1, display: 'flex', overflow: 'hidden' },
  desc: { padding: '8px 14px', background: '#f5f5f5', borderTop: '1px solid #ccc', fontSize: 13, color: '#333', flexShrink: 0 },
}
