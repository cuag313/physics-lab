import { useState, useRef, useEffect, useCallback } from 'react'
import { eventToCanvas } from '../utils/pointerPos'
import SceneShell from '../ui/SceneShell'
import InfoDock from '../ui/InfoDock'
import { fitLayout, drawPanel, wrapText } from '../ui/canvasLayout'
import { CircuitGraph, CircuitSolver } from '../engine/index.js'

/**
 * SeriesParallelScene — 串并联电路规律
 *
 * 教学流程：
 * Step1: 单灯泡 — 用V表和A表测电阻 R=U/I
 * Step2: 两灯泡串联 — 测总电阻 → R总=R₁+R₂ → 电阻变大 → 灯变暗
 * Step3: 两灯泡并联 — 测总电阻 → 1/R总=1/R₁+1/R₂ → 电阻变小 → 灯变亮
 *
 * Tab1: 演示（三步教学）
 * Tab2: 自己动手搭电路
 */

export default function SeriesParallelScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,           // 1=单灯泡, 2=串联, 3=并联
    switchClosed: false,
    R1: 10, R2: 10,
    U: 6,
    sliderR: 20, rheoDragging: false,              // 电源电压默认6V
    time: 0,
    // Tab2
    components: [],
    wires: [],
    dragId: null,
    dragOffX: 0, dragOffY: 0,
    connecting: null,
    hoverTerm: null,
    nextId: 1,
    wireColor: '#F44336',
  })

  const [tab, setTab] = useState(1)
  const [step, setStep] = useState(1)
  const [R1, setR1] = useState(10)
  const [R2, setR2] = useState(10)
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const R = { canvas, ctx: canvas.getContext('2d'), W: 0, H: 0,
      resize() {
        const rect = { width: canvas.clientWidth, height: canvas.clientHeight }
        canvas.width = rect.width * devicePixelRatio
        canvas.height = rect.height * devicePixelRatio
        this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
        this.W = rect.width; this.H = rect.height
      },
    }
    R.resize(); canvasRef.current._R = R
    const loop = () => { S.current.time += 1 / 60; try { render(R) } catch(e) { console.error('render error:', e) }; animRef.current = requestAnimationFrame(loop) }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function render(R) {
    const ctx = R.ctx, W = R.W, H = R.H
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#f0f4f8'; ctx.fillRect(0, 0, W, H)
    canvasRef.current._clickAreas = []
    canvasRef.current._palAreas = []
    if (S.current.tab === 1) renderDemo(ctx, W, H)
    else renderBuilder(ctx, W, H)
  }

  // ================================================================
  //  Tab 1：三步教学演示
  // ================================================================
  function renderDemo(ctx, W, H) {
    const s = S.current
    const on = s.switchClosed
    const U = s.U

    // 计算（变阻器 sliderR 串入 Step1/Step2，Step3 无变阻器）
    let I = 0, U1 = 0, U2 = 0, Rtotal = 0, I1 = 0, I2 = 0, Rlamp = 0
    if (on) {
      if (s.step === 1) {
        Rtotal = s.R1 + s.sliderR; I = U / Rtotal
        U1 = I * s.R1            // 灯泡两端电压（V表读数）
        Rlamp = U1 / I           // 伏安法测得的灯泡电阻，恒等于 R1
      } else if (s.step === 2) {
        Rtotal = s.R1 + s.R2 + s.sliderR; I = U / Rtotal
        U1 = I * s.R1; U2 = I * s.R2
      } else {
        // Step3：干路串可变电阻器，R并 = 1/(1/R₁+1/R₂)，R总 = R并 + R滑
        const Rp = 1 / (1 / s.R1 + 1 / s.R2)
        Rtotal = Rp + s.sliderR; I = U / Rtotal
        U1 = I * Rp; U2 = U1; I1 = U1 / s.R1; I2 = U1 / s.R2
      }
    }

    // 标题
    const lay = fitLayout(W, H)
    ctx.fillStyle = '#333'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    const titles = { 1: '① 单灯泡 — 测电阻', 2: '② 两灯泡串联 — 电阻变大？', 3: '③ 两灯泡并联 — 电阻变小？' }
    if (!lay.compact) ctx.fillText(titles[s.step], W / 2, 12)

    // 电路区域
    const left = lay.circuit.L, right = lay.circuit.R
    const top = lay.circuit.T, bottom = lay.circuit.B
    const midX = (left + right) / 2
    const wc = on ? '#1565C0' : '#999'

    try {
      if (s.step === 1) drawSingleBulb(ctx, left, right, top, bottom, midX, wc, on, s, U, I, U1, Rtotal)
      else if (s.step === 2) drawSeriesTwo(ctx, left, right, top, bottom, midX, wc, on, s, U, I, U1, U2, Rtotal)
      else drawParallelTwo(ctx, left, right, top, bottom, midX, wc, on, s, U, I, I1, I2, U1, U2, Rtotal)
    } catch (err) {
      console.error('drawCircuit', err)
    }

    // 右侧读数最后画，保证不被异常中断
    try {
      drawTeachingPanel(ctx, W, H, s, on, U, I, U1, U2, I1, I2, Rtotal, lay)
    } catch (err) {
      console.error('drawTeachingPanel', err)
    }

    // 底部/右侧步骤导航
    drawStepNav(ctx, W, H, s, lay)
  }

  // ─── Step1: 单灯泡（伏安法拓扑：上边=变阻器→A表→灯泡，下边=电源+开关） ───
  function drawSingleBulb(ctx, left, right, top, bottom, midX, wc, on, s, U, I, U1, Rtotal) {
    const battX = left + (right - left) * 0.25
    const swX = left + (right - left) * 0.65
    const rheoX = left + (right - left) * 0.2
    const ammX = left + (right - left) * 0.4
    const bulbX = left + (right - left) * 0.7

    // 矩形回路导线
    drawLine(ctx, left, bottom, battX - 30, bottom, wc, 2.5)
    drawLine(ctx, battX + 30, bottom, swX - 18, bottom, wc, 2.5)
    drawLine(ctx, swX + 18, bottom, right, bottom, wc, 2.5)
    drawLine(ctx, right, bottom, right, top, wc, 2.5)
    drawLine(ctx, right, top, bulbX + 16, top, wc, 2.5)
    drawLine(ctx, bulbX - 16, top, ammX + 20, top, wc, 2.5)
    drawLine(ctx, ammX - 20, top, rheoX + 35, top, wc, 2.5)
    drawLine(ctx, rheoX - 35, top, left, top, wc, 2.5)
    drawLine(ctx, left, top, left, bottom, wc, 2.5)

    // 电流流动
    if (on) drawCurrentFlow(ctx, [
      { x: battX - 30, y: bottom }, { x: swX, y: bottom }, { x: right, y: bottom },
      { x: right, y: top }, { x: bulbX, y: top }, { x: ammX, y: top }, { x: rheoX, y: top },
      { x: left, y: top }, { x: left, y: bottom }, { x: battX + 30, y: bottom },
    ], s.time, 0.5)

    // 下边：电源 + 开关
    drawStdBattery(ctx, battX, bottom)
    drawStdSwitch(ctx, swX, bottom, on, () => { S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1) })
    // 上边：滑线变阻器 → 安培表 → 灯泡
    s._rheoX = rheoX; s._topY = top
    drawRheoSym(ctx, rheoX, top, s.sliderR)
    drawMeterInCircuit(ctx, ammX, top, 'A', on ? `${I.toFixed(2)}A` : '', '#E53935')
    drawStdBulb(ctx, bulbX, top, on ? Math.max(0.15, Math.min(1, I * 1.1)) : 0)
    // 伏特表（只跨灯泡）
    const voltX = bulbX, volY = top + 45
    drawLine(ctx, bulbX - 16, top, bulbX - 16, volY, wc, 2)
    drawLine(ctx, bulbX + 16, top, bulbX + 16, volY, wc, 2)
    drawLine(ctx, bulbX - 16, volY, voltX - 20, volY, wc, 2)
    drawLine(ctx, voltX + 20, volY, bulbX + 16, volY, wc, 2)
    drawMeterInCircuit(ctx, voltX, volY, 'V', on ? `${U1.toFixed(1)}V` : '', '#4CAF50')

    // 电流符号：标在A表与灯泡之间的导线上方
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('I', (ammX + bulbX) / 2, top - 12)

    // 元件名标签：统一在元件正上方（与Step2/Step3一致）
    ctx.fillStyle = '#555'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText('变阻器', rheoX, top - 22)
    ctx.fillText('A', ammX, top - 22)
    ctx.fillText('L₁', bulbX, top - 22)
    ctx.fillStyle = '#4CAF50'; ctx.font = '10px sans-serif'
    ctx.fillText('V', voltX, volY - 22)
    // R=U/I 计算（变阻器串入不影响 R灯=U₁/I）
    if (on) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      ctx.fillText('伏安法测灯泡电阻（变阻器限流）：', left, bottom + 28)
      ctx.fillStyle = '#E53935'; ctx.font = '13px monospace'
      ctx.fillText(`R灯 = U₁ / I = ${U1.toFixed(1)}V / ${I.toFixed(2)}A = ${Rlamp.toFixed(1)} Ω`, left, bottom + 48)
      ctx.fillStyle = '#888'; ctx.font = '11px monospace'
      ctx.fillText(`（总电阻 ${Rtotal.toFixed(1)}Ω = R灯 ${s.R1}Ω + 变阻器 ${s.sliderR}Ω）`, left, bottom + 66)
    }
    ctx.textBaseline = 'alphabetic'
  }

  // ─── Step2: 两灯泡串联 ───
  // ─── Step2: 两灯泡串联（NB标准：变阻器+A表+R₁+R₂在上边） ───
  function drawSeriesTwo(ctx, left, right, top, bottom, midX, wc, on, s, U, I, U1, U2, Rtotal) {
    const battX = left + (right - left) * 0.25
    const swX = left + (right - left) * 0.65
    const rheoX = left + (right - left) * 0.15
    const ammX = left + (right - left) * 0.32
    const bulb1X = left + (right - left) * 0.52
    const bulb2X = left + (right - left) * 0.75

    // 矩形回路
    drawLine(ctx, left, bottom, battX - 30, bottom, wc, 2.5)
    drawLine(ctx, battX + 30, bottom, swX - 18, bottom, wc, 2.5)
    drawLine(ctx, swX + 18, bottom, right, bottom, wc, 2.5)
    drawLine(ctx, right, bottom, right, top, wc, 2.5)
    drawLine(ctx, right, top, bulb2X + 16, top, wc, 2.5)
    drawLine(ctx, bulb2X - 16, top, bulb1X + 16, top, wc, 2.5)
    drawLine(ctx, bulb1X - 16, top, ammX + 20, top, wc, 2.5)
    drawLine(ctx, ammX - 20, top, rheoX + 35, top, wc, 2.5)
    drawLine(ctx, rheoX - 35, top, left, top, wc, 2.5)
    drawLine(ctx, left, top, left, bottom, wc, 2.5)

    // 电流流动
    if (on) drawCurrentFlow(ctx, [
      { x: battX - 30, y: bottom }, { x: swX, y: bottom }, { x: right, y: bottom },
      { x: right, y: top }, { x: bulb2X, y: top }, { x: bulb1X, y: top },
      { x: ammX, y: top }, { x: rheoX, y: top },
      { x: left, y: top }, { x: left, y: bottom }, { x: battX + 30, y: bottom },
    ], s.time, 0.5)

    // 下边：电源 + 开关
    drawStdBattery(ctx, battX, bottom)
    drawStdSwitch(ctx, swX, bottom, on, () => { S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1) })
    // 上边：变阻器 → 安培表 → 灯泡L₁ → 灯泡L₂
    s._rheoX = rheoX; s._topY = top
    drawRheoSym(ctx, rheoX, top, s.sliderR)
    drawMeterInCircuit(ctx, ammX, top, 'A', on ? `${I.toFixed(2)}A` : '', '#E53935')
    const brightness = on ? Math.max(0.1, Math.min(1, I * 1.1)) : 0
    drawStdBulb(ctx, bulb1X, top, brightness)
    drawStdBulb(ctx, bulb2X, top, brightness)

    // V1跨L1（表在L1正下方，垂直线从L1两端直下）
    const volY1 = top + 45
    drawLine(ctx, bulb1X - 16, top, bulb1X - 16, volY1, wc, 2)
    drawLine(ctx, bulb1X + 16, top, bulb1X + 16, volY1, wc, 2)
    drawLine(ctx, bulb1X - 16, volY1, bulb1X - 20, volY1, wc, 2)
    drawLine(ctx, bulb1X + 20, volY1, bulb1X + 16, volY1, wc, 2)
    drawMeterInCircuit(ctx, bulb1X, volY1, 'V', on ? `${U1.toFixed(1)}V` : '', '#4CAF50')
    // V2跨L2（表在L2正下方，垂直线从L2两端直下）
    const volY2 = top + 45
    drawLine(ctx, bulb2X - 16, top, bulb2X - 16, volY2, wc, 2)
    drawLine(ctx, bulb2X + 16, top, bulb2X + 16, volY2, wc, 2)
    drawLine(ctx, bulb2X - 16, volY2, bulb2X - 20, volY2, wc, 2)
    drawLine(ctx, bulb2X + 20, volY2, bulb2X + 16, volY2, wc, 2)
    drawMeterInCircuit(ctx, bulb2X, volY2, 'V', on ? `${U2.toFixed(1)}V` : '', '#4CAF50')
    // V总跨灯泡组：左右垂直线独立，接在L1左边、L2右边的上边导线上（与V1/V2不共用边）
    const xL = (ammX + bulb1X) / 2      // A表与L1之间上边导线中点
    const xR = (bulb2X + right) / 2    // L2与右竖线之间上边导线中点
    const vTotalX = (xL + xR) / 2      // V总表圆心：左右引线正中间
    const volYT = top + 85
    drawLine(ctx, xL, top, xL, volYT, wc, 2)
    drawLine(ctx, xR, top, xR, volYT, wc, 2)
    drawLine(ctx, xL, volYT, vTotalX - 20, volYT, wc, 2)
    drawLine(ctx, vTotalX + 20, volYT, xR, volYT, wc, 2)
    drawMeterInCircuit(ctx, vTotalX, volYT, 'V', on ? `${(U1+U2).toFixed(1)}V` : '', '#9C27B0')

    // 电流符号：串联电流处处相等，只标一个 I（上边导线中间上方）
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('I', (ammX + bulb1X) / 2, top - 12)

    // 元件名标签：统一在元件正上方
    ctx.fillStyle = '#555'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText('变阻器', rheoX, top - 22)
    ctx.fillText('A', ammX, top - 22)
    ctx.fillText('L₁', bulb1X, top - 22)
    ctx.fillText('L₂', bulb2X, top - 22)
    // V表标签：V1/V2 在表上方，V总在表下方
    ctx.fillStyle = '#4CAF50'; ctx.font = '10px sans-serif'
    ctx.fillText('V₁', bulb1X, volY1 - 22)
    ctx.fillText('V₂', bulb2X, volY2 - 22)
    ctx.fillStyle = '#9C27B0'
    ctx.fillText('V总=V₁+V₂', vTotalX, volYT + 30)

    // 公式
    if (on) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      ctx.fillText('串联电路规律：', left, bottom + 28)
      ctx.fillStyle = '#E53935'; ctx.font = '13px monospace'
      ctx.fillText(`I = I₁ = I₂ = ${I.toFixed(2)}A`, left, bottom + 48)
      ctx.fillStyle = '#4CAF50'
      ctx.fillText(`V₁+V₂ = ${U1.toFixed(1)} + ${U2.toFixed(1)} = ${(U1+U2).toFixed(1)}V（灯泡组）`, left, bottom + 66)
      ctx.fillStyle = '#9C27B0'
      ctx.fillText(`R总 = R₁+R₂+R滑 = ${s.R1}+${s.R2}+${s.sliderR} = ${Rtotal} Ω`, left, bottom + 84)
      ctx.fillStyle = '#333'
      ctx.fillText(`(V₁+V₂)/I = ${(U1+U2).toFixed(1)}/${I.toFixed(2)} = ${((U1+U2)/I).toFixed(1)} Ω = R₁+R₂ ✓`, left, bottom + 102)
    }
    ctx.textBaseline = 'alphabetic'
  }

  // ─── Step3: 两灯泡并联（NB风格：上、下两条支路，干路A表在左） ───
  function drawParallelTwo(ctx, left, right, top, bottom, midX, wc, on, s, U, I, I1, I2, U1, U2, Rtotal) {
    const battX = left + (right - left) * 0.25
    const swX = left + (right - left) * 0.65
    const rheoX = left + (right - left) * 0.10
    const ammX = left + (right - left) * 0.25
    const nodeAx = left + (right - left) * 0.40
    const nodeBx = left + (right - left) * 0.78
    const bulb1X = left + (right - left) * 0.55
    const a1X = left + (right - left) * 0.68
    const bulb2X = bulb1X
    const a2X = a1X
    const topY = top + 10
    const midY = (top + bottom) / 2 + 10
    const vY = (topY + midY) / 2

    // 主回路下边（电源+开关）
    drawLine(ctx, left, bottom, battX - 30, bottom, wc, 2.5)
    drawLine(ctx, battX + 30, bottom, swX - 18, bottom, wc, 2.5)
    drawLine(ctx, swX + 18, bottom, right, bottom, wc, 2.5)
    // 右竖线 + 右节点水平段
    drawLine(ctx, right, bottom, right, midY, wc, 2.5)
    drawLine(ctx, right, midY, nodeBx, midY, wc, 2.5)
    // 左干路：left → 变阻器 → 干路A表 → nodeA
    drawLine(ctx, left, midY, rheoX - 35, midY, wc, 2.5)
    drawLine(ctx, rheoX + 35, midY, ammX - 20, midY, wc, 2.5)
    drawLine(ctx, ammX + 20, midY, nodeAx, midY, wc, 2.5)
    // 左竖线
    drawLine(ctx, left, midY, left, bottom, wc, 2.5)

    // 下支路（midY）：nodeA → R₂ → A₂ → nodeB
    drawLine(ctx, nodeAx, midY, bulb2X - 14, midY, wc, 2)
    drawLine(ctx, bulb2X + 14, midY, a2X - 18, midY, wc, 2)
    drawLine(ctx, a2X + 18, midY, nodeBx, midY, wc, 2)

    // 上下支路的连接竖线
    drawLine(ctx, nodeAx, midY, nodeAx, topY, wc, 2)
    drawLine(ctx, nodeBx, topY, nodeBx, midY, wc, 2)
    // 上支路（topY）：nodeA → R₁ → A₁ → nodeB
    drawLine(ctx, nodeAx, topY, bulb1X - 14, topY, wc, 2)
    drawLine(ctx, bulb1X + 14, topY, a1X - 18, topY, wc, 2)
    drawLine(ctx, a1X + 18, topY, nodeBx, topY, wc, 2)

    // 节点黑点
    ctx.fillStyle = '#333'
    ctx.beginPath(); ctx.arc(nodeAx, midY, 4, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(nodeBx, midY, 4, 0, Math.PI * 2); ctx.fill()

    // 元件
    drawStdBattery(ctx, battX, bottom)
    drawStdSwitch(ctx, swX, bottom, on, () => { S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1) })
    s._rheoX = rheoX; s._topY = midY
    drawRheoSym(ctx, rheoX, midY, s.sliderR)
    drawMeterInCircuit(ctx, ammX, midY, 'A', on ? `干路 ${I.toFixed(2)}A` : '', '#E53935')
    drawStdBulb(ctx, bulb1X, topY, on ? 0.9 : 0)
    drawStdBulb(ctx, bulb2X, midY, on ? 0.9 : 0)
    drawMeterInCircuit(ctx, a1X, topY, 'A', on ? `A₁ ${I1.toFixed(2)}A` : '', '#FF9800')
    drawMeterInCircuit(ctx, a2X, midY, 'A', on ? `A₂ ${I2.toFixed(2)}A` : '', '#FF9800')

    // V表：并在 nodeA/nodeB 之间，圆心放在两根引线的水平中点（vY 为上下支路正中）
    const vX = (nodeAx + nodeBx) / 2
    drawLine(ctx, nodeAx, vY, vX - 20, vY, wc, 2)
    drawLine(ctx, vX + 20, vY, nodeBx, vY, wc, 2)
    drawMeterInCircuit(ctx, vX, vY, 'V', on ? `V ${U1.toFixed(1)}V` : '', '#4CAF50')

    // 电流方向符号：统一标在对应导线段中间上方
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('I', (rheoX + ammX) / 2, midY - 12)
    ctx.fillText('I₁', (bulb1X + a1X) / 2, topY - 12)
    ctx.fillText('I₂', (bulb2X + a2X) / 2, midY - 12)

    // 元件名标签：统一标在元件正上方
    ctx.fillStyle = '#555'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText('A', ammX, midY - 22)
    ctx.fillText('L₁', bulb1X, topY - 22)
    ctx.fillText('A₁', a1X, topY - 22)
    ctx.fillText('L₂', bulb2X, midY - 22)
    ctx.fillText('A₂', a2X, midY - 22)
    ctx.fillStyle = '#8D6E63'; ctx.font = '10px sans-serif'
    ctx.fillText('变阻器', rheoX, midY + 28)

    // 电流分流动画：干路+下支路绕一圈，上支路单独循环
    if (on) {
      drawCurrentFlow(ctx, [
        { x: battX - 30, y: bottom }, { x: swX, y: bottom }, { x: right, y: bottom },
        { x: right, y: midY }, { x: nodeBx, y: midY },
        { x: a2X, y: midY }, { x: bulb2X, y: midY },
        { x: nodeAx, y: midY }, { x: ammX, y: midY }, { x: rheoX, y: midY },
        { x: left, y: midY }, { x: left, y: bottom }, { x: battX + 30, y: bottom },
      ], s.time, 0.5)
      drawCurrentFlow(ctx, [
        { x: nodeBx, y: midY }, { x: nodeBx, y: topY },
        { x: a1X, y: topY }, { x: bulb1X, y: topY },
        { x: nodeAx, y: topY }, { x: nodeAx, y: midY },
      ], s.time, 0.5)
    }

    // 公式
    const Rp = 1 / (1 / s.R1 + 1 / s.R2)
    if (on) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      ctx.fillText('并联测总电阻：', left, bottom + 28)
      ctx.fillStyle = '#E53935'; ctx.font = '13px monospace'
      ctx.fillText(`1/R并 = 1/R₁+1/R₂ = 1/${s.R1}+1/${s.R2}  →  R并 = ${Rp.toFixed(1)} Ω`, left, bottom + 48)
      ctx.fillStyle = '#4CAF50'
      ctx.fillText(`V表 = U并 = U₁ = U₂ = ${U1.toFixed(1)}V ✓`, left, bottom + 68)
      ctx.fillText(`I₁+I₂ = ${I1.toFixed(2)}+${I2.toFixed(2)} = ${(I1+I2).toFixed(2)}A = I ✓`, left, bottom + 86)
      ctx.fillStyle = '#9C27B0'
      ctx.fillText(`R总 = R并+R滑 = ${Rp.toFixed(1)}+${s.sliderR} = ${Rtotal.toFixed(1)} Ω`, left, bottom + 104)
    }
    ctx.textBaseline = 'alphabetic'
  }

  // ─── 教学说明面板 ───
  function drawTeachingPanel(ctx, W, H, s, on, U, I, U1, U2, I1, I2, Rtotal, layIn) {
    const lay = layIn || fitLayout(W, H)
    const ro = lay.readout
    const inner = drawPanel(ctx, ro, lay.compact ? null : '说明')
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    let ky = inner.y
    const px = inner.x - 14, pw = inner.w + 28, py = inner.y - 20

    // 手机：只显示关键读数（开关前后都保留，实验中不消失）
    if (lay.compact) {
      ctx.font = `bold ${lay.font.data}px monospace`
      ctx.fillStyle = '#333'
      ctx.fillText(`U = ${(U ?? 0).toFixed(1)} V`, inner.x, ky); ky += 18
      ctx.fillText(`I = ${(I ?? 0).toFixed(2)} A`, inner.x, ky); ky += 18
      ctx.fillStyle = '#FF6F00'
      ctx.fillText(`R = ${(Rtotal ?? 0).toFixed(1)} Ω`, inner.x, ky); ky += 20
      ctx.fillStyle = on ? '#2E7D32' : '#888'
      ctx.font = `bold ${lay.font.body}px sans-serif`
      ctx.fillText(on ? '● 实验中' : '○ 未闭合', inner.x, ky)
      ctx.textBaseline = 'alphabetic'
      return
    }

    ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'
    if (s.step === 1) {
      ctx.fillText('📖 伏特表与安培表的使用', inner.x, ky); ky += 28
      const items = [
        { t: '安培表 Ⓐ', bold: true },
        { t: '串联接入电路，测电流', color: '#E53935' },
        { t: '内阻极小，不影响电路', color: '#555' },
        { t: '' },
        { t: '伏特表 Ⓥ', bold: true },
        { t: '并联在被测元件两端，测电压', color: '#4CAF50' },
        { t: '内阻极大，不分流', color: '#555' },
        { t: '' },
        { t: '⚠ 千万别接错！', bold: true, color: '#F44336' },
        { t: 'Ⓐ串联在灯泡前（或后）', color: '#E53935' },
        { t: 'Ⓥ并联在灯泡两端', color: '#4CAF50' },
        { t: '不要把Ⓐ串在Ⓥ的并联支路中！', color: '#F44336' },
        { t: '' },
        { t: '测量电阻', bold: true },
        { t: 'R灯 = U₁ / I（欧姆定律）', color: '#333' },
        { t: '变阻器用来改变电流，', color: '#555' },
        { t: '拖动滑片可多次测量，R灯不变', color: '#555' },
        { t: '' },
        { t: '※ 本实验灯泡为定值电阻模型', bold: false, color: '#888' },
        { t: '   不考虑灯丝温度变化对电阻的影响', bold: false, color: '#888' },
      ]
      for (const item of items) {
        if (!item.t) { ky += 6; continue }
        ctx.fillStyle = item.bold ? '#333' : (item.color || '#555')
        ctx.font = item.bold ? 'bold 12px sans-serif' : '12px sans-serif'
        ctx.fillText(item.t, px + 14, ky); ky += 20
      }
    } else if (s.step === 2) {
      ctx.fillText('📖 串联电路电阻规律', px + 14, ky); ky += 28
      const items = [
        { t: '串联特点', bold: true },
        { t: '电流处处相等：I₁ = I₂ = I' },
        { t: '总电压 = 各分电压之和' },
        { t: '' },
        { t: '总电阻', bold: true },
        { t: 'R总 = R₁ + R₂ + R滑', color: '#E53935' },
        { t: 'R₁+R₂ 仍比单灯大（电阻变大！）', color: '#E53935' },
        { t: '' },
        { t: '灯泡亮度观察', bold: true },
        { t: '串联后每个灯泡分到的电压变小', color: '#555' },
        { t: '→ 灯泡变暗 → 说明电阻变大了', color: '#E53935' },
        { t: '' },
        { t: '类比理解', bold: true },
        { t: '串联像水管接长 → 阻力增大', color: '#555' },
        { t: '' },
        { t: '※ 本实验灯泡为定值电阻模型', bold: false, color: '#888' },
        { t: '   不考虑灯丝温度变化对电阻的影响', bold: false, color: '#888' },
      ]
      for (const item of items) {
        if (!item.t) { ky += 6; continue }
        ctx.fillStyle = item.bold ? '#333' : (item.color || '#555')
        ctx.font = item.bold ? 'bold 12px sans-serif' : '12px sans-serif'
        ctx.fillText(item.t, px + 14, ky); ky += 20
      }
    } else {
      ctx.fillText('📖 并联电路电阻规律', px + 14, ky); ky += 28
      const items = [
        { t: '并联特点', bold: true },
        { t: '各支路电压相等：U₁ = U₂ = U并' },
        { t: '总电流 = 各支路电流之和 I = I₁+I₂' },
        { t: '' },
        { t: '并联总电阻', bold: true },
        { t: '1/R并 = 1/R₁ + 1/R₂', color: '#4CAF50' },
        { t: 'R并 < R₁ 且 R并 < R₂（电阻变小！）', color: '#4CAF50' },
        { t: '' },
        { t: '灯泡亮度观察', bold: true },
        { t: '并联后两灯同时亮，亮度与单灯相同', color: '#555' },
        { t: '→ 干路变阻器可调总电流与亮度', color: '#4CAF50' },
        { t: '' },
        { t: '类比理解', bold: true },
        { t: '并联像水管加粗 → 阻力减小', color: '#555' },
      ]
      for (const item of items) {
        if (!item.t) { ky += 6; continue }
        ctx.fillStyle = item.bold ? '#333' : (item.color || '#555')
        ctx.font = item.bold ? 'bold 12px sans-serif' : '12px sans-serif'
        ctx.fillText(item.t, px + 14, ky); ky += 20
      }
    }

    // 实时数据
    if (on) {
      ky += 10
      ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'
      ctx.fillText('📊 实测数据', px + 14, ky); ky += 20
      ctx.font = '11px monospace'; ctx.fillStyle = '#555'
      ctx.fillText(`电源 U = ${U} V`, px + 14, ky); ky += 18
      ctx.fillText(`总电流 I = ${I.toFixed(3)} A`, px + 14, ky); ky += 18
      ctx.fillStyle = '#E53935'
      ctx.fillText(`总电阻 R = ${Rtotal.toFixed(1)} Ω`, px + 14, ky); ky += 22
      ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'
      if (s.step === 1) ctx.fillText(`灯泡电阻 R灯 = ${Rlamp.toFixed(1)} Ω（不随变阻器变）`, px + 14, ky)
      else if (s.step === 2) ctx.fillText(`串联：R总 = R₁+R₂+R滑 = ${Rtotal} Ω > R₁`, px + 14, ky)
      else ctx.fillText(`并联：R并=${(1/(1/s.R1+1/s.R2)).toFixed(1)}Ω，R总=${Rtotal.toFixed(1)}Ω（含R滑）`, px + 14, ky)
    }
    ctx.textBaseline = 'alphabetic'
  }

  // ─── 步骤导航：手机竖排小钮在右侧，电脑底部横排 ───
  function drawStepNav(ctx, W, H, s, layIn) {
    const lay = layIn || fitLayout(W, H)
    const steps = [
      { n: 1, label: '① 单灯泡', short: '①' },
      { n: 2, label: '② 串联', short: '②' },
      { n: 3, label: '③ 并联', short: '③' },
    ]
    if (lay.compact) {
      // 右侧竖排，不占演示区宽度
      const bw = 36, bh = 30, x = W - 42
      let y = H * 0.18
      steps.forEach((st) => {
        const active = s.step === st.n
        ctx.fillStyle = active ? '#FF9800' : '#ffffffcc'
        ctx.beginPath(); ctx.roundRect(x, y, bw, bh, 6); ctx.fill()
        ctx.strokeStyle = active ? '#E65100' : '#d0d7de'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.roundRect(x, y, bw, bh, 6); ctx.stroke()
        ctx.fillStyle = active ? '#fff' : '#555'
        ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(st.short, x + bw / 2, y + bh / 2)
        canvasRef.current._clickAreas.push({ x, y, w: bw, h: bh, onClick: () => {
          S.current.step = st.n; S.current.switchClosed = false; setStep(st.n); forceUpdate(n => n + 1)
        }})
        y += bh + 8
      })
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
      return
    }
    const navY = H - 36
    ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    const totalW = 380, startX = (W * 0.55 - totalW) / 2
    steps.forEach((st, i) => {
      const bx = startX + i * 130
      const active = s.step === st.n
      ctx.fillStyle = active ? '#FF9800' : '#e0e0e0'
      ctx.beginPath(); ctx.roundRect(bx, navY, 120, 28, 6); ctx.fill()
      ctx.fillStyle = active ? '#fff' : '#666'
      ctx.font = active ? 'bold 11px sans-serif' : '11px sans-serif'
      ctx.fillText(st.label, bx + 60, navY + 14)
      canvasRef.current._clickAreas.push({ x: bx, y: navY, w: 120, h: 28, onClick: () => {
        S.current.step = st.n; S.current.switchClosed = false; setStep(st.n); forceUpdate(n => n + 1)
      }})
    })
    ctx.textBaseline = 'alphabetic'
  }

  // ================================================================
  //  标准电路符号
  // ================================================================
  function drawStdBattery(ctx, x, y) {
    // 电池组（NB风格）：左单电池 + 三点省略号 + 右单电池
    ctx.strokeStyle = '#333'
    // 左单电池：长线(+，细) 短线(-，粗)
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(x - 30, y - 18); ctx.lineTo(x - 30, y + 18); ctx.stroke()
    ctx.lineWidth = 5
    ctx.beginPath(); ctx.moveTo(x - 18, y - 9); ctx.lineTo(x - 18, y + 9); ctx.stroke()
    // 中间三点省略号（水平）
    ctx.fillStyle = '#555'
    ctx.beginPath(); ctx.arc(x - 8, y, 3, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(x + 8, y, 3, 0, Math.PI * 2); ctx.fill()
    // 右单电池：长线(+，细) 短线(-，粗)
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(x + 18, y - 18); ctx.lineTo(x + 18, y + 18); ctx.stroke()
    ctx.lineWidth = 5
    ctx.beginPath(); ctx.moveTo(x + 30, y - 9); ctx.lineTo(x + 30, y + 9); ctx.stroke()
    // + - 标注
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText('+', x - 30, y - 20)
    ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'
    ctx.fillText('−', x + 30, y - 11)
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

  function drawStdBulb(ctx, x, y, brightness) {
    const r = 14
    ctx.fillStyle = brightness > 0.3 ? '#FFEB3B' : '#f5f5f5'
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = brightness > 0.3 ? '#F9A825' : '#999'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = brightness > 0.3 ? '#E65100' : '#999'; ctx.lineWidth = 1.5
    const s = r * 0.55
    ctx.beginPath(); ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.stroke()
    if (brightness > 0.3) {
      const glow = ctx.createRadialGradient(x, y, r, x, y, r * 3)
      glow.addColorStop(0, `rgba(255,235,59,${brightness * 0.3})`); glow.addColorStop(1, 'rgba(255,235,59,0)')
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, r * 3, 0, Math.PI * 2); ctx.fill()
    }
  }

  // 滑线变阻器符号（箭头可移动）
  function drawRheoSym(ctx, x, y, sliderR) {
    const w = 70, h = 22, maxR = 50
    const sr = sliderR != null ? sliderR : 20
    ctx.fillStyle = '#EFEBE9'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, 4); ctx.fill(); ctx.stroke()
    // 绕线（锯齿）
    ctx.strokeStyle = '#5D4037'; ctx.lineWidth = 1.5; ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const px = x - w / 2 + 8 + i * (w - 16) / 5
      const py = y + (i % 2 === 0 ? -5 : 5)
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.stroke()
    // 滑片箭头（位置随sliderR变化）
    const sliderX = x - w / 2 + 8 + (sr / maxR) * (w - 16)
    ctx.fillStyle = '#E65100'; ctx.beginPath()
    ctx.moveTo(sliderX, y - h / 2 - 8); ctx.lineTo(sliderX - 4, y - h / 2 - 2); ctx.lineTo(sliderX + 4, y - h / 2 - 2)
    ctx.closePath(); ctx.fill()
    // 两端接线柱
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#666'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(x - w / 2, y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.arc(x + w / 2, y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    // 电阻值标注
    ctx.fillStyle = '#E65100'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(`${sr}Ω`, x, y + h / 2 + 3)
    ctx.textBaseline = 'alphabetic'
  }

  // 竖直灯泡（并联用）
  function drawStdBulbV(ctx, x, y, brightness) {
    const r = 14
    ctx.fillStyle = brightness > 0.3 ? '#FFEB3B' : '#f5f5f5'
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = brightness > 0.3 ? '#F9A825' : '#999'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = brightness > 0.3 ? '#E65100' : '#999'; ctx.lineWidth = 1.5
    const s = r * 0.55
    ctx.beginPath(); ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.stroke()
    if (brightness > 0.3) {
      const glow = ctx.createRadialGradient(x, y, r, x, y, r * 3)
      glow.addColorStop(0, `rgba(255,235,59,${brightness * 0.3})`); glow.addColorStop(1, 'rgba(255,235,59,0)')
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, r * 3, 0, Math.PI * 2); ctx.fill()
    }
  }

  // 仪表符号（表盘内：字母居中，读数在圆内下方，不顶圆边）
  function drawMeterInCircuit(ctx, x, y, type, reading, color) {
    const r = 18
    ctx.fillStyle = '#fff'; ctx.strokeStyle = color; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = color; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(type === 'A' ? 'A' : 'V', x, y - 4)
    if (reading) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 9px monospace'
      ctx.fillText(reading, x, y + 9)
    }
    ctx.textBaseline = 'alphabetic'
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

  // ================================================================
  //  Tab 2：自己动手（与SimpleCircuit相同的搭建模式）
  // ================================================================
  function renderBuilder(ctx, W, H) {
    const s = S.current
    const lay = fitLayout(W, H)
    // 器材栏固定右侧单列（不占竖向短边）
    const palW = lay.compact ? 112 : 170
    const cvX = 4
    const cvY = 4
    const cvW = W - palW - 16
    const cvH = H - 8

    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(cvX, cvY, cvW, cvH, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(cvX, cvY, cvW, cvH, 8); ctx.stroke()
    ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 0.5
    for (let gx = cvX + 25; gx < cvX + cvW; gx += 25) { ctx.beginPath(); ctx.moveTo(gx, cvY); ctx.lineTo(gx, cvY + cvH); ctx.stroke() }
    for (let gy = cvY + 25; gy < cvY + cvH; gy += 25) { ctx.beginPath(); ctx.moveTo(cvX, gy); ctx.lineTo(cvX + cvW, gy); ctx.stroke() }

    for (const wire of s.wires) drawBuilderWire(ctx, wire)
    if (s.connecting) {
      const fc = s.components.find(c => c.id === s.connecting.compId)
      if (fc) {
        const ft = getTermPos(fc, s.connecting.termIdx)
        const tx = s.connecting.mx, ty = s.connecting.my
        const fOut = s.connecting.termIdx === 0 ? -1 : 1
        const ext = 42
        ctx.strokeStyle = s.hoverTerm ? '#4CAF50' : s.wireColor
        ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.setLineDash([6, 4])
        ctx.beginPath()
        ctx.moveTo(ft.x, ft.y)
        // 三次贝塞尔预览：从接线柱水平出线
        ctx.bezierCurveTo(ft.x + fOut * ext, ft.y, tx + fOut * ext * 0.35, ty, tx, ty)
        ctx.stroke()
        ctx.setLineDash([]); ctx.lineCap = 'butt'
      }
    }

    const circuit = checkCircuit()
    const engineResult = solveSceneCircuit()
    for (const comp of s.components) drawBuilderComp(ctx, comp, s, circuit, engineResult)

    // 标出所有未连线的元件（红色虚线框+提示），方便用户找到并删除
    const wiredIds = new Set()
    for (const w of s.wires) { wiredIds.add(w.from.compId); wiredIds.add(w.to.compId) }
    ctx.strokeStyle = '#F44336'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3])
    for (const comp of s.components) {
      if (wiredIds.has(comp.id)) continue
      ctx.strokeRect(comp.x - 45, comp.y - 35, 90, 70)
      ctx.setLineDash([])
      ctx.fillStyle = '#F44336'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
      ctx.fillText('未连线', comp.x, comp.y - 38)
      ctx.setLineDash([4, 3])
    }
    ctx.setLineDash([])
    ctx.fillStyle = engineResult.ok ? '#4CAF50' : '#F44336'
    ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText(engineResult.ok ? '✅ ' + engineResult.reason : '❌ ' + (engineResult.reason || circuit.reason), cvX + 12, cvY + cvH - 25)

    // 操作说明：折叠在左上角
    if (!lay.compact) {
    const bx = cvX + 10, by2 = cvY + 10, bw = 210, bh = s._guideExpanded ? 140 : 28
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.strokeStyle = '#1976D2'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(bx, by2, bw, bh, 6); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#1976D2'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('📖 操作说明', bx + 8, by2 + 7)
    ctx.fillStyle = '#1976D2'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right'
    ctx.fillText(s._guideExpanded ? '收起 ▲' : '展开 ▼', bx + bw - 8, by2 + 8)
    canvasRef.current._clickAreas.push({ x: bx, y: by2, w: bw, h: 28, onClick: () => { s._guideExpanded = !s._guideExpanded; forceUpdate(n => n + 1) } })
    if (s._guideExpanded) {
      ctx.fillStyle = '#333'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left'
      const lines = ['🔌 拖拽器材到画布', '🔵 点击端子开始连线', '🔵 点击另一端子完成连线', '🔄 双击开关切换通断', '🎨 侧栏选导线颜色', '❌ 右键删除器材', '⚡ 连好电路自动求解']
      for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], bx + 12, by2 + 30 + i * 16)
    }
    } else {
      // 手机：左上角折叠「操作说明」
      const bx = cvX + 8, by2 = cvY + 8, bw = 88, bh = 26
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.strokeStyle = '#1976D2'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.roundRect(bx, by2, bw, bh, 6); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#1976D2'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(s._guideExpanded ? '收起 ▲' : '操作说明 ▼', bx + bw / 2, by2 + bh / 2)
      canvasRef.current._clickAreas.push({ x: bx, y: by2, w: bw, h: bh, onClick: () => { s._guideExpanded = !s._guideExpanded; forceUpdate(n => n + 1) } })
      if (s._guideExpanded) {
        ctx.fillStyle = 'rgba(255,255,255,0.96)'; ctx.strokeStyle = '#c5daf0'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.roundRect(bx, by2 + 30, 180, 110, 6); ctx.fill(); ctx.stroke()
        ctx.fillStyle = '#333'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
        const lines = ['拖器材到画布', '点端子连线', '双击开关切换', '右键删除器材']
        for (let i = 0; i < lines.length; i++) ctx.fillText('· ' + lines[i], bx + 8, by2 + 38 + i * 22)
      }
    }

    // 器材栏：右侧单列，可上下滑动
    {
    const palX = W - palW - 8
    ctx.fillStyle = '#f8f9fa'; ctx.beginPath(); ctx.roundRect(palX, cvY, palW, cvH, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(palX, cvY, palW, cvH, 8); ctx.stroke()
    ctx.save()
    ctx.beginPath(); ctx.rect(palX + 2, cvY + 2, palW - 4, cvH - 4); ctx.clip()
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('电学器材', palX + 10, cvY + 6)

    const items = [
      { type: 'battery', name: '电源' },
      { type: 'bulb', name: '灯泡' },
      { type: 'switch', name: '开关' },
      { type: 'resistor', name: '电阻' },
      { type: 'rheostat', name: '变阻' },
      { type: 'ammeter', name: 'A表' },
      { type: 'voltmeter', name: 'V表' },
      { type: 'inductor', name: '电感' },
      { type: 'capacitor', name: '电容' },
    ]
    const rowH = lay.compact ? 34 : 38
    const gap = 4
    const contentH = items.length * (rowH + gap) + 70
    const viewH = cvH - 28
    const maxScroll = Math.max(0, contentH - viewH)
    if (s._palScroll == null) s._palScroll = 0
    s._palScroll = Math.max(0, Math.min(maxScroll, s._palScroll))
    s._palMaxScroll = maxScroll

    let iy = cvY + 28 - s._palScroll
    for (const item of items) {
      if (iy + rowH > cvY && iy < cvY + cvH) {
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(palX + 6, iy, palW - 12, rowH, 6); ctx.fill()
        ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(palX + 6, iy, palW - 12, rowH, 6); ctx.stroke()
        drawRealisticIcon(ctx, palX + 28, iy + rowH / 2, item.type)
        ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
        ctx.fillText(item.name, palX + 50, iy + rowH / 2); ctx.textBaseline = 'alphabetic'
      }
      canvasRef.current._palAreas.push({ x: palX + 6, y: iy, w: palW - 12, h: rowH, type: item.type })
      iy += rowH + gap
    }

    iy += 8
    ctx.fillStyle = '#333'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('导线：', palX + 10, iy); iy += 18
    for (const wc of [{ color: '#F44336', name: '红' }, { color: '#FFC107', name: '黄' }, { color: '#4CAF50', name: '绿' }]) {
      const active = s.wireColor === wc.color
      if (iy + 24 > cvY && iy < cvY + cvH) {
        ctx.fillStyle = active ? '#e3f2fd' : '#fff'
        ctx.beginPath(); ctx.roundRect(palX + 6, iy, palW - 12, 24, 4); ctx.fill()
        if (active) { ctx.strokeStyle = wc.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(palX + 6, iy, palW - 12, 24, 4); ctx.stroke() }
        ctx.fillStyle = wc.color; ctx.fillRect(palX + 14, iy + 7, 28, 10)
        ctx.fillStyle = '#333'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
        ctx.fillText(wc.name, palX + 52, iy + 12); ctx.textBaseline = 'alphabetic'
      }
      canvasRef.current._palAreas.push({ x: palX + 6, y: iy, w: palW - 12, h: 24, action: 'color', color: wc.color })
      iy += 28
    }
    ctx.restore()
    if (maxScroll > 0) {
      const th = Math.max(24, (viewH / contentH) * viewH)
      const ty = cvY + 28 + (s._palScroll / maxScroll) * (viewH - th)
      ctx.fillStyle = 'rgba(0,0,0,0.18)'
      ctx.beginPath(); ctx.roundRect(palX + palW - 5, ty, 3, th, 2); ctx.fill()
    }
    s._palRect = { x: palX, y: cvY, w: palW, h: cvH }
    ctx.textBaseline = 'alphabetic'
    }
  }

  function drawRealisticIcon(ctx, x, y, type) {
    ctx.save(); ctx.translate(x, y)
    if (type === 'battery') {
      ctx.fillStyle = '#81C784'; ctx.strokeStyle = '#388E3C'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.roundRect(-14, -10, 28, 20, 3); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('+ −', 0, 0)
    } else if (type === 'bulb') {
      ctx.fillStyle = '#FFFDE7'; ctx.strokeStyle = '#F9A825'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(0, -2, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#9E9E9E'; ctx.fillRect(-5, 8, 10, 5)
      ctx.strokeStyle = '#E65100'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(-4, -6); ctx.lineTo(4, 2); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(4, -6); ctx.lineTo(-4, 2); ctx.stroke()
    } else if (type === 'switch') {
      ctx.fillStyle = '#ECEFF1'; ctx.strokeStyle = '#90A4AE'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.roundRect(-14, -6, 28, 12, 3); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#666'; ctx.beginPath(); ctx.arc(-8, 0, 2.5, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(8, 0, 2.5, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 2; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(5, -6); ctx.stroke(); ctx.lineCap = 'butt'
    } else if (type === 'resistor') {
      ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.roundRect(-14, -6, 28, 12, 2); ctx.fill(); ctx.stroke()
      const bands = ['#B71C1C', '#4CAF50', '#FF9800', '#FFD54F']
      bands.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(-10 + i * 7, -6, 4, 12) })
    } else if (type === 'rheostat') {
      // 滑线变阻器：棕色电阻体+锯齿绕线+箭头滑片
      ctx.fillStyle = '#EFEBE9'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.roundRect(-16, -6, 32, 12, 2); ctx.fill(); ctx.stroke()
      ctx.strokeStyle = '#5D4037'; ctx.lineWidth = 1
      ctx.beginPath()
      for (let i = 0; i < 5; i++) {
        const px = -12 + i * 6, py = (i % 2 === 0) ? -3 : 3
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
      }
      ctx.stroke()
      ctx.fillStyle = '#E65100'
      ctx.beginPath(); ctx.moveTo(2, -10); ctx.lineTo(-1, -5); ctx.lineTo(5, -5); ctx.closePath(); ctx.fill()
    } else if (type === 'inductor') {
      // 电感：串联半圆弧
      ctx.strokeStyle = '#5D4037'; ctx.lineWidth = 1.8; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(-16, 0)
      for (let i = 0; i < 4; i++) ctx.arc(-10 + i * 6, 0, 3, Math.PI, 0, false)
      ctx.lineTo(16, 0); ctx.stroke(); ctx.lineCap = 'butt'
    } else if (type === 'capacitor') {
      // 电容：两条平行极板
      ctx.strokeStyle = '#37474F'; ctx.lineWidth = 2.5; ctx.lineCap = 'butt'
      ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(-3, 0); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(-3, -8); ctx.lineTo(-3, 8); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(3, -8); ctx.lineTo(3, 8); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(3, 0); ctx.lineTo(16, 0); ctx.stroke()
    } else if (type === 'ammeter') {
      ctx.fillStyle = '#FFEBEE'; ctx.strokeStyle = '#E53935'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('A', 0, 0)
    } else if (type === 'voltmeter') {
      ctx.fillStyle = '#E8F5E9'; ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#4CAF50'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('V', 0, 0)
    }
    ctx.restore()
  }

  function drawBuilderComp(ctx, comp, s, circuit, engineResult) {
    const { x, y, type, rotation } = comp
    const isClosed = circuit && circuit.closed
    ctx.save(); ctx.translate(x, y); ctx.rotate(rotation || 0)
    if (s.dragId === comp.id) ctx.globalAlpha = 0.6

    if (type === 'battery') {
      const grd = ctx.createLinearGradient(-35, -22, 35, 22)
      grd.addColorStop(0, '#A5D6A7'); grd.addColorStop(0.5, '#66BB6A'); grd.addColorStop(1, '#43A047')
      ctx.fillStyle = grd; ctx.strokeStyle = '#2E7D32'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.roundRect(-35, -22, 70, 44, 6); ctx.fill(); ctx.stroke()
      ctx.strokeStyle = '#1B5E20'; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(-14, -16); ctx.lineTo(-14, 16); ctx.stroke()
      ctx.lineWidth = 5
      ctx.beginPath(); ctx.moveTo(14, -8); ctx.lineTo(14, 8); ctx.stroke()
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
      ctx.fillText('+', -40, -24)
      ctx.fillStyle = '#333'; ctx.font = 'bold 15px sans-serif'
      ctx.fillText('−', 40, -16)
      ctx.textBaseline = 'alphabetic'
    } else if (type === 'bulb') {
      const brightness = (() => {
        if (!isClosed || !engineResult?.ok || !engineResult.results) return 0
        const r = engineResult.results.get(comp.id)
        if (!r) return 0
        const maxP = ((s.U || 6) ** 2) / 10
        return Math.max(0.05, Math.min(1, r.power / maxP))
      })()
      ctx.fillStyle = brightness > 0.15 ? '#FFEB3B' : '#FFFDE7'
      ctx.strokeStyle = brightness > 0.15 ? '#F9A825' : '#bbb'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, -6, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.strokeStyle = brightness > 0.15 ? '#E65100' : '#999'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(-8, -14); ctx.lineTo(8, 2); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(8, -14); ctx.lineTo(-8, 2); ctx.stroke()
      ctx.fillStyle = '#9E9E9E'; ctx.strokeStyle = '#616161'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.roundRect(-10, 14, 20, 10, 2); ctx.fill(); ctx.stroke()
      if (brightness > 0.15) {
        const glow = ctx.createRadialGradient(0, -6, 15, 0, -6, 50)
        glow.addColorStop(0, 'rgba(255,235,59,0.35)'); glow.addColorStop(1, 'rgba(255,235,59,0)')
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, -6, 50, 0, Math.PI * 2); ctx.fill()
      }
      ctx.fillStyle = '#F57F17'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText('灯泡', 0, 26)
    } else if (type === 'switch') {
      const sw = comp.closed !== false
      ctx.fillStyle = '#ECEFF1'; ctx.strokeStyle = '#78909C'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.roundRect(-36, -16, 72, 32, 6); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#546E7A'; ctx.beginPath(); ctx.arc(-24, 0, 5, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(24, 0, 5, 0, Math.PI * 2); ctx.fill()
      if (sw) {
        ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(24, 0); ctx.stroke(); ctx.lineCap = 'butt'
      } else {
        ctx.strokeStyle = '#F44336'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(16, -18); ctx.stroke(); ctx.lineCap = 'butt'
      }
      ctx.fillStyle = sw ? '#4CAF50' : '#F44336'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText(sw ? 'ON' : 'OFF', 0, 18)
    } else if (type === 'resistor') {
      ctx.fillStyle = '#EFEBE9'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.roundRect(-34, -14, 68, 28, 4); ctx.fill(); ctx.stroke()
      const bands = ['#B71C1C', '#43A047', '#FF6F00', '#FFD54F']
      bands.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(-24 + i * 15, -14, 8, 28) })
      ctx.fillStyle = '#333'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText('10Ω', 0, 16)
    } else if (type === 'rheostat') {
      // 滑线变阻器：木质底座+陶瓷管+金属滑杆+滑片（滑片位置随props.resistance）
      const r = comp.props?.resistance ?? 20
      ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#6D4C41'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.roundRect(-40, -10, 80, 20, 3); ctx.fill(); ctx.stroke()
      // 绕线
      ctx.strokeStyle = '#5D4037'; ctx.lineWidth = 1.2
      ctx.beginPath()
      for (let i = 0; i < 10; i++) {
        const px = -34 + i * 7, py = (i % 2 === 0) ? -6 : 6
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
      }
      ctx.stroke()
      // 金属滑杆（80px 行程，更易调）
      ctx.strokeStyle = '#90A4AE'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(-40, -18); ctx.lineTo(40, -18); ctx.stroke()
      // 刻度
      for (let g = -40; g <= 40; g += 16) {
        ctx.strokeStyle = '#B0BEC5'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(g, -18); ctx.lineTo(g, -12); ctx.stroke()
      }
      // 滑片：大箭头 + 圆点，更好抓
      const sliderX = -40 + (r / 50) * 80
      ctx.fillStyle = '#E65100'
      ctx.beginPath(); ctx.moveTo(sliderX, -18); ctx.lineTo(sliderX - 7, -6); ctx.lineTo(sliderX + 7, -6); ctx.closePath(); ctx.fill()
      ctx.beginPath(); ctx.arc(sliderX, -20, 6, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText(`变阻器 ${r}Ω`, 0, 14)
    } else if (type === 'inductor') {
      // 电感：铜线绕在磁芯上
      ctx.fillStyle = '#ECEFF1'; ctx.strokeStyle = '#607D8B'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.roundRect(-36, -14, 72, 28, 4); ctx.fill(); ctx.stroke()
      ctx.strokeStyle = '#B8860B'; ctx.lineWidth = 2
      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const px = -28 + i * 10
        ctx.moveTo(px, -10)
        ctx.quadraticCurveTo(px + 5, -20, px + 10, -10)
      }
      ctx.stroke()
      ctx.fillStyle = '#5D4037'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText('电感', 0, 16)
    } else if (type === 'capacitor') {
      // 电容：蓝色电解电容圆柱形
      ctx.fillStyle = '#1565C0'; ctx.strokeStyle = '#0D47A1'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.roundRect(-30, -18, 60, 36, 4); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('C', 0, 0)
      ctx.fillStyle = '#FFEB3B'; ctx.font = '8px sans-serif'
      ctx.fillText('+', -22, -8)
      ctx.fillStyle = '#5D4037'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText('电容', 0, 22)
    } else if (type === 'ammeter') {
      // 电流表（红底白字，显示实时读数）
      const r = (isClosed && engineResult?.ok && engineResult.results) ? engineResult.results.get(comp.id) : null
      const cur = r ? r.current : 0
      ctx.fillStyle = '#FFCDD2'; ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#B71C1C'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('A', 0, -8)
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px monospace'
      ctx.fillText(isClosed ? `${Math.abs(cur).toFixed(2)}A` : '--', 0, 10)
    } else if (type === 'voltmeter') {
      // 电压表（绿底白字，显示实时读数）
      const r = (isClosed && engineResult?.ok && engineResult.results) ? engineResult.results.get(comp.id) : null
      const volt = r ? Math.abs(r.voltage) : 0
      ctx.fillStyle = '#C8E6C9'; ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#1B5E20'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('V', 0, -8)
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px monospace'
      ctx.fillText(isClosed ? `${volt.toFixed(1)}V` : '--', 0, 10)
    }
    // 中心拖动把手
    ctx.fillStyle = 'rgba(0,0,0,0.12)'
    ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1; ctx.restore()

    // 接线柱（绝对坐标，以柱为圆心）
    const terms = getTerminals(comp)
    for (let i = 0; i < terms.length; i++) {
      const t = terms[i]
      const hov = s.hoverTerm && s.hoverTerm.compId === comp.id && s.hoverTerm.termIdx === i
      const src = s.connecting && s.connecting.compId === comp.id && s.connecting.termIdx === i
      // 明显的接线柱
      if (hov) {
        ctx.fillStyle = 'rgba(76,175,80,0.22)'
        ctx.beginPath(); ctx.arc(t.x, t.y, 16, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#4CAF50'
      } else if (src) {
        ctx.fillStyle = '#FF9800'
      } else {
        ctx.fillStyle = '#fff'
      }
      ctx.strokeStyle = hov ? '#2E7D32' : src ? '#E65100' : '#455A64'
      ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.arc(t.x, t.y, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      // 柱心小孔
      ctx.fillStyle = hov ? '#1B5E20' : src ? '#BF360C' : '#78909C'
      ctx.beginPath(); ctx.arc(t.x, t.y, 3, 0, Math.PI * 2); ctx.fill()
    }
  }

  function drawBuilderWire(ctx, wire) {
    const fc = S.current.components.find(c => c.id === wire.from.compId)
    const tc = S.current.components.find(c => c.id === wire.to.compId)
    if (!fc || !tc) return
    const f = getTermPos(fc, wire.from.termIdx), t = getTermPos(tc, wire.to.termIdx)
    strokeBezierWire(
      ctx, f, t, wire.color || '#1565C0',
      wire.mid1X != null ? { x: wire.mid1X, y: wire.mid1Y } : null,
      wire.mid2X != null ? { x: wire.mid2X, y: wire.mid2Y } : null,
      wire.from.termIdx, wire.to.termIdx
    )
  }

  /** 三次贝塞尔：从接线柱水平出线，曲线圆润 */
  function strokeBezierWire(ctx, f, t, color, m1, m2, fIdx = 0, tIdx = 1) {
    const ext = 42
    // 左柱向左出线、右柱向右出线，再弯向目标（标准原理图走线）
    const fOut = fIdx === 0 ? -1 : 1
    const tOut = tIdx === 0 ? -1 : 1
    const c1 = m1 || { x: f.x + fOut * ext, y: f.y }
    const c2 = m2 || { x: t.x + tOut * ext, y: t.y }
    ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(f.x, f.y)
    ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, t.x, t.y)
    ctx.stroke()
    ctx.lineCap = 'butt'
    if (m1 || m2) {
      ctx.fillStyle = 'rgba(21,101,192,0.85)'
      if (m1) { ctx.beginPath(); ctx.arc(m1.x, m1.y, 3.5, 0, Math.PI * 2); ctx.fill() }
      if (m2) { ctx.beginPath(); ctx.arc(m2.x, m2.y, 3.5, 0, Math.PI * 2); ctx.fill() }
    }
    return { c1, c2 }
  }

  function checkCircuit() {
    const s = S.current
    const batteries = s.components.filter(c => c.type === 'battery')
    const bulbs = s.components.filter(c => c.type === 'bulb')
    if (batteries.length === 0 || bulbs.length === 0) return { closed: false, reason: '需要电源和灯泡' }
    const connCount = {}
    for (const comp of s.components) connCount[comp.id] = 0
    for (const wire of s.wires) {
      connCount[wire.from.compId] = (connCount[wire.from.compId] || 0) + 1
      connCount[wire.to.compId] = (connCount[wire.to.compId] || 0) + 1
    }
    const allConnected = s.components.every(c => connCount[c.id] >= 2)
    if (!allConnected) return { closed: false, reason: '电路未闭合' }
    for (const sw of s.components.filter(c => c.type === 'switch')) { if (sw.closed === false) return { closed: false, reason: '开关断开' } }
    return { closed: true, reason: '电路正常，灯泡亮' }
  }

  // MNA引擎求解Tab2电路
  function solveSceneCircuit() {
    const s = S.current
    // 清理已从器材栏移除的旧类型元件（如变压器）残留
    const known = new Set(['battery','bulb','switch','resistor','rheostat','inductor','capacitor','ammeter','voltmeter'])
    const stale = s.components.filter(c => !known.has(c.type))
    if (stale.length) {
      const staleIds = new Set(stale.map(c => c.id))
      s.components = s.components.filter(c => known.has(c.type))
      s.wires = s.wires.filter(w => !staleIds.has(w.from.compId) && !staleIds.has(w.to.compId))
    }
    if (s.components.length === 0 || s.wires.length === 0) return { ok: false, results: new Map() }
    const graph = new CircuitGraph()
    for (const comp of s.components) {
      const props = {}
      if (comp.type === 'battery') props.voltage = s.U || 6
      if (comp.type === 'bulb') props.resistance = 10
      if (comp.type === 'resistor') props.resistance = 10
      if (comp.type === 'rheostat') props.resistance = comp.props?.resistance ?? 20
      if (comp.type === 'switch') props.closed = comp.closed !== false
      graph.addComponent(comp.type, comp.x, comp.y, props, comp.id)
    }
    for (const wire of s.wires) {
      graph.addWire(
        { componentId: wire.from.compId, portIndex: wire.from.termIdx },
        { componentId: wire.to.compId, portIndex: wire.to.termIdx }
      )
    }
    const v = graph.validate()
    if (!v.ok) return { ok: false, reason: v.reason, results: new Map() }
    const info = graph.getCircuitInfo()
    const solver = new CircuitSolver()
    const results = solver.solve(info)
    return { ok: true, reason: v.reason, results }
  }

  function getTerminals(comp) {
    // 接线柱在器材左右两端（以柱为圆心做热区）
    const c = Math.cos(comp.rotation || 0), sn = Math.sin(comp.rotation || 0)
    const half = comp.type === 'battery' ? 38 : 40
    return [
      { x: comp.x - half * c, y: comp.y - half * sn },
      { x: comp.x + half * c, y: comp.y + half * sn },
    ]
  }
  function getTermPos(comp, idx) { return getTerminals(comp)[idx] }

  /** 接线热点：以接线柱为圆心的圆形热区（手机加大） */
  function findTerm(mx, my) {
    const R = 30
    for (const comp of S.current.components) {
      const terms = getTerminals(comp)
      for (let i = 0; i < terms.length; i++) {
        const dx = mx - terms[i].x, dy = my - terms[i].y
        if (dx * dx + dy * dy <= R * R) return { compId: comp.id, termIdx: i }
      }
    }
    return null
  }

  /** 连线过程中的目标端点：圆形吸附区更大，排除源元件 */
  function findTermNear(mx, my, exceptCompId) {
    const R = 38
    let best = null, bestD = Infinity
    for (const comp of S.current.components) {
      if (comp.id === exceptCompId) continue
      const terms = getTerminals(comp)
      for (let i = 0; i < terms.length; i++) {
        const dx = mx - terms[i].x, dy = my - terms[i].y
        const d = dx * dx + dy * dy
        if (d <= R * R && d < bestD) {
          bestD = d
          best = { compId: comp.id, termIdx: i }
        }
      }
    }
    return best
  }

  /** 拖动热点：仅器材正中央，避免和端子抢 */
  function findComp(mx, my) {
    for (let i = S.current.components.length - 1; i >= 0; i--) {
      const c = S.current.components[i]
      const dx = mx - c.x, dy = my - c.y
      if (dx * dx + dy * dy <= 24 * 24) return c
    }
    return null
  }

  const getPos = (e) => eventToCanvas(canvasRef.current, e)

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    const s = S.current; const { x, y } = getPos(e)
    if (s.tab === 1) {
      for (const a of canvasRef.current._clickAreas) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(); return } }
      // 变阻器箭头拖拽
      if (s._rheoX != null) {
        const sliderX = s._rheoX - 27 + (s.sliderR / 50) * 54
        if (Math.abs(x - sliderX) < 12 && Math.abs(y - s._topY) < 18) { s.rheoDragging = true; return }
      }
      return
    }
    // Tab2 点击区域处理
    for (const a of canvasRef.current._clickAreas || []) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(); return } }
    // 器材栏：按下记录，拖动=滑动列表，轻点=放置器材
    if (s._palRect && x >= s._palRect.x && x <= s._palRect.x + s._palRect.w && y >= s._palRect.y && y <= s._palRect.y + s._palRect.h) {
      s.palDrag = { y0: y, scroll0: s._palScroll || 0, moved: false, x, y }
      return
    }
    for (const a of canvasRef.current._palAreas) {
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) {
        if (a.action === 'color') { s.wireColor = a.color; forceUpdate(n => n + 1); return }
        if (a.type) {
          const id = s.nextId++
          s.components.push({ id, type: a.type, x, y, rotation: 0, closed: false, props: a.type === 'rheostat' ? { resistance: 20 } : {} })
          s.dragId = id; s.dragOffX = 0; s.dragOffY = 0; forceUpdate(n => n + 1); return
        }
      }
    }
    const term = findTerm(x, y)
    if (term) { s.connecting = { ...term, mx: x, my: y }; forceUpdate(n => n + 1); return }
    // Tab2 滑线变阻器：滑杆/滑片整条都可拖，映射更灵敏
    for (const c of s.components) {
      if (c.type !== 'rheostat') continue
      // 滑杆在元件上半部，整条 80px 轨道都可抓
      const onBar = Math.abs(x - c.x) <= 48 && Math.abs(y - (c.y - 18)) <= 28
      const r = c.props?.resistance ?? 20
      const sliderX = c.x - 40 + (r / 50) * 80
      const onHandle = Math.abs(x - sliderX) <= 16 && Math.abs(y - (c.y - 18)) <= 20
      if (onBar || onHandle) {
        s.tab2RheoDragId = c.id
        // 立刻按当前位置写入，跟手感
        const minX = c.x - 40, maxX = c.x + 40
        const nx = Math.max(minX, Math.min(maxX, x))
        c.props = c.props || {}
        c.props.resistance = Math.round(((nx - minX) / (maxX - minX)) * 50)
        return
      }
    }
    for (const wire of s.wires) {
      const fc = s.components.find(c => c.id === wire.from.compId)
      const tc = s.components.find(c => c.id === wire.to.compId)
      if (!fc || !tc) continue
      const f = getTermPos(fc, wire.from.termIdx), t = getTermPos(tc, wire.to.termIdx)
      // 与三次贝塞尔控制点一致（左出左/右出右）
      const fOut = wire.from.termIdx === 0 ? -1 : 1
      const tOut = wire.to.termIdx === 0 ? -1 : 1
      const ext = 42
      const m1x = wire.mid1X != null ? wire.mid1X : f.x + fOut * ext
      const m1y = wire.mid1Y != null ? wire.mid1Y : f.y
      const m2x = wire.mid2X != null ? wire.mid2X : t.x + tOut * ext
      const m2y = wire.mid2Y != null ? wire.mid2Y : t.y
      if ((x - m1x) ** 2 + (y - m1y) ** 2 < 256) { s.dragId = 'wire_' + wire.id + '_1'; s.dragMoved = false; forceUpdate(n => n + 1); return }
      if ((x - m2x) ** 2 + (y - m2y) ** 2 < 256) { s.dragId = 'wire_' + wire.id + '_2'; s.dragMoved = false; forceUpdate(n => n + 1); return }
    }
    // 中心拖动 / 点按开关
    const comp = findComp(x, y)
    if (comp) {
      s.dragId = comp.id
      s.dragOffX = x - comp.x; s.dragOffY = y - comp.y
      s.dragMoved = false
      s.dragStart = { x, y }
      forceUpdate(n => n + 1)
    }
  }, [])

  const handleMouseMove = useCallback((e) => {
    const s = S.current; const { x, y } = getPos(e)
    // Tab1变阻器拖拽
    if (s.tab === 1 && s.rheoDragging && s._rheoX != null) {
      const minX = s._rheoX - 27, maxX = s._rheoX + 27
      const newX = Math.max(minX, Math.min(maxX, x))
      s.sliderR = Math.round(((newX - minX) / (maxX - minX)) * 50)
      forceUpdate(n => n + 1)
      return
    }
    if (s.tab !== 2) return
    // 器材栏滑动
    if (s.palDrag) {
      const dy = y - s.palDrag.y0
      if (Math.abs(dy) > 6) s.palDrag.moved = true
      if (s.palDrag.moved) {
        s._palScroll = s.palDrag.scroll0 - dy
        return // 动画循环已每帧重绘，无需 forceUpdate
      }
    }
    // Tab2 滑线变阻器滑片拖拽
    if (s.tab2RheoDragId != null) {
      const c = s.components.find(c => c.id === s.tab2RheoDragId)
      if (c) {
        const minX = c.x - 40, maxX = c.x + 40
        const nx = Math.max(minX, Math.min(maxX, x))
        c.props = c.props || {}
        c.props.resistance = Math.round(((nx - minX) / (maxX - minX)) * 50)
      }
      return
    }
    if (s.dragId) {
      if (typeof s.dragId === 'string' && s.dragId.startsWith('wire_')) {
        const parts = s.dragId.split('_')
        const wire = s.wires.find(w => w.id === parseInt(parts[1]))
        if (wire) {
          if (s.dragStart && Math.hypot(x - s.dragStart.x, y - s.dragStart.y) > 5) s.dragMoved = true
          if (parseInt(parts[2]) === 1) { wire.mid1X = x; wire.mid1Y = y }
          else { wire.mid2X = x; wire.mid2Y = y }
        }
        return
      }
      const c = s.components.find(c => c.id === s.dragId)
      if (c) {
        if (s.dragStart && Math.hypot(x - s.dragStart.x, y - s.dragStart.y) > 5) s.dragMoved = true
        // 自由拖 + 5px 轻微吸附
        const nx = x - s.dragOffX, ny = y - s.dragOffY
        c.x = Math.round(nx / 5) * 5
        c.y = Math.round(ny / 5) * 5
      }
      return
    }
    if (s.connecting) {
      s.connecting.mx = x; s.connecting.my = y
      const t = findTermNear(x, y, s.connecting.compId)
      s.hoverTerm = t
      canvasRef.current.style.cursor = t ? 'crosshair' : 'default'
      return
    }
    const hoverTerm = findTerm(x, y), hoverComp = findComp(x, y)
    s.hoverTerm = hoverTerm
    canvasRef.current.style.cursor = hoverComp ? 'grab' : hoverTerm ? 'pointer' : 'default'
  }, [])

  const handleMouseUp = useCallback((e) => {
    const s = S.current
    // 记录抬起点，用于识别双击（手机触摸桥不触发原生 dblclick）
    if (e) {
      try { s._lastUpPos = getPos(e) } catch (_) { s._lastUpPos = null }
    }
    // 自记双击
    const now = performance.now()
    const upPos = s._lastUpPos
    if (s.tab === 2 && upPos) {
      const isDouble = s._lastUpT && (now - s._lastUpT) < 350
        && s._lastUpPrev
        && Math.hypot(upPos.x - s._lastUpPrev.x, upPos.y - s._lastUpPrev.y) < 28
      if (isDouble && !s.dragMoved) {
        // 双击删除
        let comp = findComp(upPos.x, upPos.y)
        if (!comp) {
          for (const c of s.components) {
            if (Math.abs(upPos.x - c.x) < 52 && Math.abs(upPos.y - c.y) < 40) { comp = c; break }
          }
        }
        if (comp) {
          s.components = s.components.filter(k => k.id !== comp.id)
          s.wires = s.wires.filter(w => w.from.compId !== comp.id && w.to.compId !== comp.id)
          s.dragId = null; s.connecting = null; s.palDrag = null
          s._lastUpT = 0; s._lastUpPrev = null
          forceUpdate(n => n + 1)
          return
        }
      }
      s._lastUpPrev = upPos
      s._lastUpT = now
    }
    if (s.palDrag) {
      const pd = s.palDrag
      s.palDrag = null
      if (!pd.moved) {
        // 轻点：命中器材则放到工作区中部（不落在器材栏上）
        for (const a of canvasRef.current._palAreas || []) {
          if (pd.x >= a.x && pd.x <= a.x + a.w && pd.y >= a.y && pd.y <= a.y + a.h) {
            if (a.action === 'color') { s.wireColor = a.color; forceUpdate(n => n + 1); return }
            if (a.type) {
              const id = s.nextId++
              const wx = s._palRect ? s._palRect.x * 0.42 : pd.x
              const wy = s._palRect ? s._palRect.y + s._palRect.h * 0.45 : pd.y
              s.components.push({ id, type: a.type, x: wx, y: wy, rotation: 0, closed: false, props: a.type === 'rheostat' ? { resistance: 20 } : {} })
              s.dragId = id; s.dragOffX = 0; s.dragOffY = 0
            }
            break
          }
        }
      }
      forceUpdate(n => n + 1)
      return
    }
    if (s.rheoDragging) { s.rheoDragging = false; forceUpdate(n => n + 1); return }
    if (s.tab2RheoDragId != null) { s.tab2RheoDragId = null; forceUpdate(n => n + 1); return }
    if (s.dragId) {
      const id = s.dragId
      const moved = s.dragMoved
      s.dragId = null; s.dragMoved = false; s.dragStart = null
      // 轻点开关：切换通断（与中心拖动共存：拖过则只移动）
      if (!moved && typeof id === 'number') {
        const c = S.current.components.find(k => k.id === id)
        if (c && c.type === 'switch') {
          c.closed = c.closed === false
          forceUpdate(n => n + 1)
          return
        }
      }
      forceUpdate(n => n + 1)
      return
    }
    if (s.connecting) {
      const t = s.hoverTerm
      if (t && t.compId !== s.connecting.compId) {
        const dup = s.wires.some(w =>
          (w.from.compId === s.connecting.compId && w.from.termIdx === s.connecting.termIdx && w.to.compId === t.compId && w.to.termIdx === t.termIdx) ||
          (w.to.compId === s.connecting.compId && w.to.termIdx === s.connecting.termIdx && w.from.compId === t.compId && w.from.termIdx === t.termIdx))
        if (!dup) s.wires.push({ id: s.nextId++, from: { compId: s.connecting.compId, termIdx: s.connecting.termIdx }, to: t, color: s.wireColor, mid1X: null, mid1Y: null, mid2X: null, mid2Y: null })
      }
      s.connecting = null; s.hoverTerm = null; forceUpdate(n => n + 1)
    }
  }, [])

  const handleContextMenu = useCallback((e) => {
    if (S.current.tab !== 2) return; e.preventDefault()
    const { x, y } = getPos(e)
    const comp = findComp(x, y)
    if (comp) {
      S.current.components = S.current.components.filter(c => c.id !== comp.id)
      S.current.wires = S.current.wires.filter(w => w.from.compId !== comp.id && w.to.compId !== comp.id)
    }
    forceUpdate(n => n + 1)
  }, [])

  const handleDoubleClick = useCallback((e) => {
    if (S.current.tab !== 2) return
    e.preventDefault()
    const { x, y } = getPos(e)
    // 双击删除：热点放宽到整个元件（电脑右键删除仍保留）
    let comp = findComp(x, y)
    if (!comp) {
      for (const c of S.current.components) {
        if (Math.abs(x - c.x) < 52 && Math.abs(y - c.y) < 40) { comp = c; break }
      }
    }
    if (comp) {
      S.current.components = S.current.components.filter(k => k.id !== comp.id)
      S.current.wires = S.current.wires.filter(w => w.from.compId !== comp.id && w.to.compId !== comp.id)
      forceUpdate(n => n + 1)
    }
  }, [])

  const handleReset = useCallback(() => {
    S.current.components = []; S.current.wires = []; S.current.switchClosed = false; S.current.dragId = null; S.current.connecting = null
    forceUpdate(n => n + 1)
  }, [])

  return (
    <SceneShell
      title="串并联电路规律"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t) }}
      tab1Label="📖 电路演示"
      tab2Label="🔧 自己动手"
      onReset={handleReset}
      toolbarExtra={tab === 1 ? (
        <>
          <span style={styles.sep} />
          <label style={styles.lbl}>电源U：<input type="range" min="1" max="12" step="0.5" value={S.current.U}
            onChange={(e) => { S.current.U = parseFloat(e.target.value); forceUpdate(n => n + 1) }} style={styles.slider} /><span style={styles.val}>{S.current.U.toFixed(1)}V</span></label>
          <label style={styles.lbl}>R₁：<input type="range" min="5" max="50" step="1" value={R1}
            onChange={(e) => { const v = parseInt(e.target.value); S.current.R1 = v; setR1(v) }} style={styles.slider} /><span style={styles.val}>{R1}Ω</span></label>
          <label style={styles.lbl}>R₂：<input type="range" min="5" max="50" step="1" value={R2}
            onChange={(e) => { const v = parseInt(e.target.value); S.current.R2 = v; setR2(v) }} style={styles.slider} /><span style={styles.val}>{R2}Ω</span></label>
        </>
      ) : null}
      desc={(
        <>
          <b>串并联电路规律</b>
          <span style={{ marginLeft: 12, color: '#555', fontSize: 12 }}>
          {tab === 1 ? '① 单灯泡测电阻 → ② 串联电阻变大 → ③ 并联电阻变小（右侧①②③切换）' : '拖器材到画布 · 点端子连线 · 双击开关'}
          </span>
        </>
      )}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }}
      onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
      onContextMenu={handleContextMenu} onDoubleClick={handleDoubleClick} />
      {tab === 1 ? (
        <InfoDock
          purpose="探究串联电路电流规律和并联电路电压规律。"
          steps={[
            '① 单灯泡：用 V/A 表测 R=U/I',
            '② 串联：总电阻变大，灯变暗',
            '③ 并联：总电阻变小，灯变亮',
          ]}
          hint="安培表串联、伏特表并联。右侧①②③切换步骤。"
        />
      ) : (
        <InfoDock
          hint="拖器材到画布 → 点端子连线 → 轻点开关通断。双击删除器材（电脑也可右键）。滑杆可拖变阻器。"
          hintTitle="操作说明"
        />
      )}
    </SceneShell>
  )
}

const styles = {
  sep: { width: 1, height: 20, background: '#ddd' },
  lbl: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#666' },
  slider: { width: 70, accentColor: '#4A90D9' },
  val: { color: '#4A90D9', fontWeight: 600, minWidth: 35, fontSize: 12 },
}
