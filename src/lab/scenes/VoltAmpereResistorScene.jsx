import { useState, useRef, useEffect, useCallback } from 'react'
import { eventToCanvas } from '../utils/pointerPos'
import { CircuitGraph, CircuitSolver } from '../engine/index.js'
import SceneShell from '../ui/SceneShell'
import InfoDock from '../ui/InfoDock'
import { fitLayout, drawPanel } from '../ui/canvasLayout'
import {
  getTerminals, getTermPos, findTermAt, findTermNear,
  findCompAt, findCompWide, mapSliderR,
  drawGuideBubble, drawRealisticIcon,
} from '../ui/circuitKit'
// ── 渲染层：Tab1 标准电路符号 ──
import { symBattery, symSwitch, symRheostat, symMeter, symBulb, symHalf, SYM_INK } from '../render/symbols.js'
// ── 渲染层：Tab2 写实教具（深色桌面 + 照片级器材 + 胶皮导线 + 阻尼指针）──
import { drawBench, drawWorkArea } from '../render/workbench.js'
import {
  drawBattery, drawBulb, drawSwitch, drawResistor, drawRheostat, drawMeter,
  drawTerminal as drawPost, needleRatio, rheostatSliderX,
} from '../render/parts.js'
import { wirePath, drawWire, drawWirePreview, drawFlow, flowSpeed } from '../render/wire.js'
import { stepNeedle, resetNeedles } from '../render/needle.js'

// 模块级数据
let dataStore = []

/**
 * VoltAmpereResistorScene — 伏安法测小灯泡电功率
 * Tab1: 演示 — 改变滑动变阻器，测灯泡在不同电压下的 P=UI（灯泡电阻随温度非线性）
 * Tab2: 自己动手搭电路（完整电路引擎）
 */
export default function VoltAmpereResistorScene({ title = '伏安法测小灯泡电功率' }) {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    switchClosed: false,
    U: 4.5,
    sliderR: 20,
    U_rated: 2.5,
    time: 0,
    _guideOpen: false,
    // Tab2
    components: [], wires: [],
    dragId: null, dragOffX: 0, dragOffY: 0,
    connecting: null, hoverTerm: null,
    nextId: 1, wireColor: '#F44336',
  })

  const [tab, setTab] = useState(1)
  const [, forceUpdate] = useState(0)

  // 灯泡电阻模型（Tab1 用）：随电压升高电阻增大
  function bulbR(U) {
    const Ur = S.current.U_rated
    const Rr = 8.3
    if (U <= 0) return 3.5
    const r = Math.min(U / Ur, 2)
    return 3.5 + (Rr - 3.5) * Math.pow(r, 1.5)
  }

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
    let last = performance.now()
    const loop = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000) || 1 / 60)
      last = now
      S.current.time += dt
      S.current.dt = dt
      render(R)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function render(R) {
    const ctx = R.ctx, W = R.W, H = R.H
    ctx.clearRect(0, 0, W, H)
    if (S.current.tab === 1) {
      ctx.fillStyle = '#f0f4f8'; ctx.fillRect(0, 0, W, H)
    } else {
      // Tab2：深色实验桌面（写实器材 + 环境光 + 暗角）
      drawBench(ctx, W, H, { time: S.current.time })
    }
    canvasRef.current._clickAreas = []
    canvasRef.current._palAreas = []
    if (S.current.tab === 1) renderDemo(ctx, W, H)
    else renderBuilder(ctx, W, H)
  }

  // ═══════════════════════════════════════════════════════════
  //  Tab 1：实验演示
  // ═══════════════════════════════════════════════════════════
  function renderDemo(ctx, W, H) {
    const s = S.current
    const on = s.switchClosed
    const lay = fitLayout(W, H)
    const L = lay.circuit.L, Rt = lay.circuit.R, T = lay.circuit.T, B = lay.circuit.B

    let I = 0, U_b = 0, P = 0
    if (on) {
      U_b = s.U_rated * 0.8
      for (let i = 0; i < 8; i++) {
        const Rb = bulbR(U_b)
        I = s.U / (Rb + s.sliderR)
        U_b = I * Rb
      }
      P = U_b * I
    }

    // ── 电路图坐标系：在 lay.circuit 内居中、适度缩小（教科书电路图观感）──
    const areaW = Rt - L, areaH = B - T
    const loopW = Math.min(areaW * 0.76, 520)
    const scale = Math.max(0.55, Math.min(1.1, loopW / 480))
    const loopH = loopW * 0.42
    const gateD = loopH * 0.55
    const chipUp = 40 * scale, chipDn = 38 * scale
    const x0 = L + (areaW - loopW) / 2
    const y0 = T + Math.max(chipUp + 4, (areaH - (loopH + chipUp + chipDn)) / 2) + chipUp
    const x1 = x0 + loopW, y1 = y0 + loopH

    // 三列布局：左=电源/A表，中=开关/滑变，右=灯泡+V表门形
    const colL = x0 + loopW * 0.15, colM = x0 + loopW * 0.50, colR = x0 + loopW * 0.82
    const battX = colL, amX = colL
    const swX = colM, slX = colM
    const bulX = colR

    const wc = on ? '#1565C0' : '#9aa7b1'
    const ink = on ? SYM_INK : '#7c8a93'
    const lw = 2 * scale + 0.6

    // 符号在导线上占用的半宽（导线据此断开留缺口）
    const hBat = symHalf('battery', scale, 3)
    const hSw = symHalf('switch', scale)
    const hAm = symHalf('meter', scale)
    const hRheo = symHalf('rheostat', scale)
    const hBulb = symHalf('bulb', scale)
    const hVol = hAm

    // ── 导线（横平竖直，符号处留缺口）──
    // 下边：电源 + 开关
    drawLine(ctx, x0, y1, battX - hBat, y1, wc, lw)
    drawLine(ctx, battX + hBat, y1, swX - hSw, y1, wc, lw)
    drawLine(ctx, swX + hSw, y1, x1, y1, wc, lw)
    // 上边：A表 + 滑动变阻器 + 灯泡
    drawLine(ctx, x0, y0, amX - hAm, y0, wc, lw)
    drawLine(ctx, amX + hAm, y0, slX - hRheo, y0, wc, lw)
    drawLine(ctx, slX + hRheo, y0, bulX - hBulb, y0, wc, lw)
    drawLine(ctx, bulX + hBulb, y0, x1, y0, wc, lw)
    // 左右两边
    drawLine(ctx, x0, y0, x0, y1, wc, lw)
    drawLine(ctx, x1, y0, x1, y1, wc, lw)

    // 电压表门形：从灯泡两侧引下，接 V 表
    const volY = y0 + gateD
    const tap = hBulb + 12 * scale
    drawLine(ctx, bulX - tap, y0, bulX - tap, volY, wc, lw)
    drawLine(ctx, bulX + tap, y0, bulX + tap, volY, wc, lw)
    drawLine(ctx, bulX - tap, volY, bulX - hVol, volY, wc, lw)
    drawLine(ctx, bulX + hVol, volY, bulX + tap, volY, wc, lw)
    // 并联引出点
    for (const jx of [bulX - tap, bulX + tap]) {
      ctx.fillStyle = wc
      ctx.beginPath(); ctx.arc(jx, y0, 3, 0, Math.PI * 2); ctx.fill()
    }

    // ── 电流流动（先画，后压符号）──
    if (on) drawFlow(ctx, [
      { x: battX + hBat, y: y1 }, { x: swX, y: y1 }, { x: x1, y: y1 },
      { x: x1, y: y0 }, { x: bulX, y: y0 }, { x: slX, y: y0 },
      { x: amX, y: y0 }, { x: x0, y: y0 }, { x: x0, y: y1 }, { x: battX - hBat, y: y1 },
    ], s.time)

    // ── 电路符号（标准教科书画法）──
    // 电源：3 节、+ 在左（flip），保持既有流向语义
    symBattery(ctx, battX, y1, { n: 3, scale, ink, flip: true })
    symSwitch(ctx, swX, y1, { closed: on, scale, ink })
    // 开关整块可点（通断）
    canvasRef.current._clickAreas.push({
      x: swX - hSw - 12, y: y1 - 22, w: (hSw + 12) * 2, h: 44,
      onClick: () => { s.switchClosed = !s.switchClosed; forceUpdate(n => n + 1) }
    })
    symMeter(ctx, amX, y0, { kind: 'A', scale, ink })
    // 滑片箭头随 sliderR 移动
    symRheostat(ctx, slX, y0, { scale, ink, ratio: s.sliderR / 50 })
    // 灯泡：先画通电辉光，再压符号
    if (on && P > 0) {
      const glow = Math.min(1, P / (s.U_rated * s.U_rated / bulbR(s.U_rated)))
      const gr = 22 + 22 * glow
      const g = ctx.createRadialGradient(bulX, y0, 2, bulX, y0, gr)
      g.addColorStop(0, `rgba(255,235,59,${0.12 + 0.38 * glow})`)
      g.addColorStop(1, 'rgba(255,235,59,0)')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(bulX, y0, gr, 0, Math.PI * 2); ctx.fill()
    }
    symBulb(ctx, bulX, y0, { scale, ink })
    symMeter(ctx, bulX, volY, { kind: 'V', scale, ink })

    // 读数（原仪表数字改为小标签，贴在各自符号旁）
    const readFont = Math.max(9, Math.round(11 * scale))
    ctx.font = `bold ${readFont}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillStyle = '#C62828'
    ctx.fillText(on ? I.toFixed(3) + 'A' : '—', amX, y0 + hAm + 6 * scale)
    ctx.fillStyle = '#2E7D32'
    ctx.fillText(on ? U_b.toFixed(2) + 'V' : '—', bulX, volY + hVol + 6 * scale)

    // 滑动变阻器点击调阻（映射到符号自身宽度，止点吸附）
    canvasRef.current._clickAreas.push({
      x: slX - hRheo - 10, y: y0 - 30 * scale, w: (hRheo + 10) * 2, h: 56,
      onClick: (mx) => {
        const ratio = Math.max(0, Math.min(1, (mx - (slX - hRheo)) / (hRheo * 2)))
        s.sliderR = Math.round(ratio * 50)
      }
    })

    ctx.fillStyle = '#555'; ctx.font = `${lay.font.label}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    // 标注在符号上方（给足净空）
    ctx.fillText('滑动变阻器', slX, y0 - 32 * scale)
    ctx.fillText('小灯泡', bulX, y0 - 32 * scale)
    ctx.textBaseline = 'alphabetic'

    const status = !on ? '断开' : U_b < s.U_rated * 0.8 ? '低于额定' : U_b < s.U_rated * 1.1 ? '正常发光' : '高于额定'
    const ro = lay.readout
    // 读数面板只放数据；实验目的/步骤用右侧 InfoDock 气泡
    const inner = drawPanel(ctx, ro, null)
    let ky = inner.y
    ctx.fillStyle = !on ? '#999' : U_b < s.U_rated * 0.8 ? '#1976D2' : U_b < s.U_rated * 1.1 ? '#4CAF50' : '#F44336'
    ctx.font = `bold ${lay.font.data}px sans-serif`
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText(status, inner.x, ky); ky += lay.compact ? 20 : 22
    ctx.fillStyle = '#444'; ctx.font = `${lay.font.data}px monospace`
    ctx.fillText(`U = ${U_b.toFixed(2)} V`, inner.x, ky); ky += 18
    ctx.fillText(`I = ${I.toFixed(3)} A`, inner.x, ky); ky += 18
    ctx.fillStyle = '#FF6F00'; ctx.font = `bold ${lay.font.data + 1}px monospace`
    ctx.fillText(`P = ${P.toFixed(3)} W`, inner.x, ky); ky += 22

    if (!lay.compact && dataStore.length > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'
      ctx.fillText('📊 实验数据', inner.x, ky); ky += 16
      const colW = [35, 60, 60, 65, 80]
      const rowH = 17
      const tblW = colW.reduce((a, b) => a + b, 0)
      const tblX = inner.x
      const headers = ['序号', 'U(V)', 'I(A)', 'P(W)', '发光']
      ctx.fillStyle = '#FFF8E1'; ctx.strokeStyle = '#FFD54F'; ctx.lineWidth = 1
      ctx.fillRect(tblX, ky, tblW, rowH); ctx.strokeRect(tblX, ky, tblW, rowH)
      ctx.fillStyle = '#E65100'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      let cx2 = tblX
      for (let c = 0; c < 5; c++) { ctx.fillText(headers[c], cx2 + colW[c]/2, ky + rowH/2); cx2 += colW[c] }
      ky += rowH
      ctx.font = '10px monospace'; ctx.fillStyle = '#333'
      for (let i = 0; i < dataStore.length; i++) {
        const d = dataStore[i]
        const glow = d.U < s.U_rated * 0.8 ? '偏暗' : d.U < s.U_rated * 1.1 ? '正常' : '过亮'
        if (i % 2 === 0) { ctx.fillStyle = '#F5F5F5'; ctx.fillRect(tblX, ky, tblW, rowH) }
        ctx.strokeStyle = '#E0E0E0'; ctx.strokeRect(tblX, ky, tblW, rowH)
        ctx.fillStyle = '#333'
        const vals = [String(i+1), d.U.toFixed(2), d.I.toFixed(3), d.P.toFixed(3), glow]
        let cx3 = tblX
        for (let c = 0; c < 5; c++) { ctx.fillText(vals[c], cx3 + colW[c]/2, ky + rowH/2); cx3 += colW[c] }
        ky += rowH
      }
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      ky += 8
      // 图高自适应，给底部按钮留出空间，避免重叠
      const graphH = Math.max(60, inner.y + inner.h - ky - 40)
      drawGraph(ctx, inner.x, ky, inner.w, graphH, dataStore, 'U (V)', 'P (W)', d => d.U, d => d.P, '#FF6F00')
    }
    ctx.textBaseline = 'alphabetic'

    // 简洁操作：只保留「记录」+「清空」；重置用顶部 SceneShell 按钮
    const nY = Math.min(H - 32, ro.y + ro.h - 32)
    const btnX = ro.x
    const recOk = on
    const btnH = 28
    const btnW = Math.min(70, (ro.w - 12) / 2)
    ctx.fillStyle = recOk ? '#4CAF50' : '#bdbdbd'
    ctx.beginPath(); ctx.roundRect(btnX, nY, btnW, btnH, 6); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('记录', btnX + btnW / 2, nY + btnH / 2)
    if (recOk) canvasRef.current._clickAreas.push({ x: btnX, y: nY, w: btnW, h: btnH, onClick: () => {
      dataStore.push({ U: U_b, I, P }); forceUpdate(n => n + 1)
    }})
    const bx2 = btnX + btnW + 8
    ctx.fillStyle = '#f0f0f0'; ctx.beginPath(); ctx.roundRect(bx2, nY, btnW, btnH, 6); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(bx2, nY, btnW, btnH, 6); ctx.stroke()
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.fillText('清空', bx2 + btnW / 2, nY + btnH / 2)
    canvasRef.current._clickAreas.push({ x: bx2, y: nY, w: btnW, h: btnH, onClick: () => { dataStore = []; forceUpdate(n => n + 1) } })
    ctx.textBaseline = 'alphabetic'
  }

  function drawGraph(ctx, x, y, w, h, data, xL, yL, gx, gy, color) {
    ctx.fillStyle = '#f8f9fa'; ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h)
    if (data.length < 2) return
    const vx = data.map(gx), vy = data.map(gy)
    const mx = Math.max(...vx) * 1.15 || 1, my = Math.max(...vy) * 1.15 || 1
    const ox = x + 30, oy = y + h - 20, gw = w - 40, gh = h - 30
    ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(ox, oy - gh); ctx.lineTo(ox, oy); ctx.lineTo(ox + gw, oy); ctx.stroke()
    ctx.fillStyle = '#888'; ctx.font = '8px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(xL, ox + gw/2, oy + 4)
    ctx.save(); ctx.translate(x + 8, oy - gh/2); ctx.rotate(-Math.PI/2)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(yL, 0, 0); ctx.restore()
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath()
    for (let i = 0; i < data.length; i++) {
      const px = ox + gx(data[i])/mx * gw, py = oy - gy(data[i])/my * gh
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
    }
    ctx.stroke()
    ctx.fillStyle = color
    for (let i = 0; i < data.length; i++) {
      const px = ox + gx(data[i])/mx * gw, py = oy - gy(data[i])/my * gh
      ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2); ctx.fill()
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  Tab 2：自己动手（完整电路引擎）
  // ═══════════════════════════════════════════════════════════
  function renderBuilder(ctx, W, H) {
    const s = S.current
    const lay = fitLayout(W, H)
    const palW = lay.compact ? 112 : 170
    const cvX = 4, cvY = 4, cvW = W - palW - 16, cvH = H - 8
    const area = { x: cvX, y: cvY, w: cvW, h: cvH }

    // 先求解：导线与器材都要读电流/电压
    const eng = solveCircuit()

    // ① 工作区垫板：电路导通时微微提亮，暗示"有电"
    drawWorkArea(ctx, area, { glow: eng.ok ? 1 : 0 })

    // ② 导线（压在器材下面，符合真实接线顺序）
    for (const wire of s.wires) drawBWire(ctx, wire, eng)

    // ③ 连线预览：吸附到接线柱时整条变绿
    if (s.connecting) {
      const fc = s.components.find(c => c.id === s.connecting.compId)
      if (fc) {
        const ft = getTermPos(fc, s.connecting.termIdx)
        const snap = s.hoverTerm
        const target = snap
          ? getTermPos(s.components.find(c => c.id === snap.compId), snap.termIdx)
          : { x: s.connecting.mx, y: s.connecting.my }
        const path = wirePath(ft, target, s.connecting.termIdx, snap ? snap.termIdx : 1)
        drawWirePreview(ctx, path, { snapped: !!snap })
      }
    }

    // ④ 元件（含表盘指针动力学）
    for (const comp of s.components) drawBuilderComp(ctx, comp, s, eng)

    // ⑤ 未连线提示（深色背景下用柔和虚线框）
    const wiredIds = new Set()
    for (const w of s.wires) { wiredIds.add(w.from.compId); wiredIds.add(w.to.compId) }
    ctx.save()
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = 'rgba(255,140,120,0.5)'
    ctx.lineWidth = 1.2
    ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    for (const comp of s.components) {
      if (wiredIds.has(comp.id)) continue
      ctx.strokeRect(comp.x - 45, comp.y - 35, 90, 70)
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(255,160,140,0.85)'
      ctx.fillText('未连线', comp.x, comp.y - 38)
      ctx.setLineDash([4, 4])
    }
    ctx.restore()

    // ⑥ 底部状态行（浅色文字 + 状态语义色）
    let statusText = eng.ok ? eng.reason : (eng.reason || '电路未闭合')
    let statusColor = eng.ok ? '#3ddc84' : '#ff9d95'
    // 短路检测：A表电流过大（>0.8A）且灯泡功率≈0
    if (eng.ok && eng.results) {
      let totalI = 0, bulbP = 0
      for (const r of eng.results.values()) {
        if (r.current) totalI = Math.max(totalI, Math.abs(r.current))
        if (r.power != null) bulbP = Math.max(bulbP, r.power)
      }
      if (totalI > 0.8 && bulbP < 0.01) {
        statusText = '⚠ 短路：电流过大，灯泡被短路'
        statusColor = '#ff4b3e'
      }
    }
    ctx.fillStyle = statusColor
    ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText(statusText, cvX + 12, cvY + cvH - 25)

    // 操作说明：固定在实验区左上角（不遮挡器材）
    {
      const lines = [
        '①  从右侧器材栏拖入器材',
        '②  点击接线柱开始连线',
        '③  点击另一端子完成导线',
        '④  拖动变阻器滑片调阻值',
        '⑤  轻点开关通断，双击删除',
        '⑥  电源→开关→A表→变阻器→灯泡',
        '    V表并联在灯泡两端',
      ]
      const g = drawGuideBubble(ctx, cvX, cvY, lay?.compact, s._guideOpen, lines, () => {
        s._guideOpen = !s._guideOpen; forceUpdate(n => n + 1)
      })
      canvasRef.current._clickAreas.push(g)
    }

    // 器材栏：右侧单列，可上下滑动（与串并联一致）
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
      { type: 'switch', name: '开关' },
      { type: 'rheostat', name: '变阻' },
      { type: 'ammeter', name: 'A表' },
      { type: 'bulb', name: '灯泡' },
      { type: 'resistor', name: '电阻' },
      { type: 'voltmeter', name: 'V表' },
    ]
    const rowH = lay.compact ? 34 : 38
    const gap = 4
    const contentH = items.length * (rowH + gap) + 90
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

  function drawBWire(ctx, wire, eng) {
    const fc = S.current.components.find(c => c.id === wire.from.compId)
    const tc = S.current.components.find(c => c.id === wire.to.compId)
    if (!fc || !tc) return
    const f = getTermPos(fc, wire.from.termIdx), t = getTermPos(tc, wire.to.termIdx)
    const path = wirePath(
      f, t, wire.from.termIdx, wire.to.termIdx,
      wire.mid1X != null ? { x: wire.mid1X, y: wire.mid1Y } : null,
      wire.mid2X != null ? { x: wire.mid2X, y: wire.mid2Y } : null,
    )
    // 导线电流：串联回路里导线电流即其所连元件的电流
    let amp = 0
    if (eng && eng.ok && eng.results) {
      const r = eng.results.get(wire.from.compId)
      if (r && typeof r.current === 'number') amp = Math.abs(r.current)
    }
    const live = amp > 1e-4
    drawWire(ctx, path, {
      color: wire.color || '#e53935',
      width: 3.6,
      energized: live,
      dim: !eng.ok,
    })
    // 电流粒子：相位按电流速度累加（通电才有）
    if (live && S.current.showFlow !== false) {
      if (!S.current._flow) S.current._flow = new Map()
      let ph = S.current._flow.get(wire.id) || 0
      ph = (ph + (S.current.dt || 1 / 60) * flowSpeed(amp)) % 1
      S.current._flow.set(wire.id, ph)
      drawFlow(ctx, path, { phase: ph, dir: 1, current: amp, mode: 'I', spacing: 34 })
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  Tab 2 元件（照片级写实：parts.js 教具 + 阻尼指针）
  // ═══════════════════════════════════════════════════════════
  function drawBuilderComp(ctx, comp, s, eng) {
    const { x, y, type } = comp
    const isClosed = !!(eng && eng.ok)
    const res = isClosed && eng.results ? eng.results.get(comp.id) : null

    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(comp.rotation || 0)
    if (s.dragId === comp.id) ctx.globalAlpha = 0.85

    if (type === 'battery') {
      drawBattery(ctx, { voltage: batteryVoltage(comp, s) })
    } else if (type === 'bulb') {
      const st = bulbState(comp, res)
      drawBulb(ctx, { brightness: st.brightness, overload: st.overload })
    } else if (type === 'switch') {
      drawSwitch(ctx, { closed: comp.closed !== false })
    } else if (type === 'resistor') {
      drawResistor(ctx, { resistance: (comp.props && comp.props.resistance != null) ? comp.props.resistance : 10 })
    } else if (type === 'rheostat') {
      drawRheostat(ctx, { R: rheostatValue(comp), maxR: RHEO_MAX, dragging: s.dragId === 'rheo_' + comp.id })
    } else if (type === 'ammeter' || type === 'voltmeter') {
      const kind = type === 'ammeter' ? 'A' : 'V'
      const raw = res ? (kind === 'A' ? res.current : res.voltage) : 0
      const reversed = raw > 1e-6 // 黑柱接高电位 = 反接 → 指针反向偏转
      const value = Math.abs(raw)
      const range = meterRangeOf(comp, kind)
      const target = (reversed ? -1 : 1) * needleRatio(value, range)
      const needle = stepNeedle(`${comp.id}:${kind}:${range}`, target, s.dt || 1 / 60)
      drawMeter(ctx, { kind, value, range, needle, over: !reversed && value > range * 1.02 })
    }

    ctx.globalAlpha = 1
    ctx.restore()

    // 接线柱（电表自己画了红黑柱，避免重复）
    const terms = getTerminals(comp)
    for (let i = 0; i < terms.length; i++) {
      if (type === 'ammeter' || type === 'voltmeter') continue
      const t = terms[i]
      const hov = s.hoverTerm && s.hoverTerm.compId === comp.id && s.hoverTerm.termIdx === i
      const src = s.connecting && s.connecting.compId === comp.id && s.connecting.termIdx === i
      drawPost(ctx, { x: t.x, y: t.y, color: terminalColor(type, i), hover: hov, active: src })
    }
  }

  // ── 写实器材参数读取（对标 OhmsLawScene 的写实渲染层）──
  const RHEO_MAX = 50
  const batteryVoltage = (c, s) => (typeof c.props?.voltage === 'number' ? c.props.voltage : s.U)
  const rheostatValue = (c) => (typeof c.props?.resistance === 'number' ? c.props.resistance : 20)

  /** 灯泡工作状态：亮度按「实际功率/额定功率」折算，灯丝先暗红再白炽 */
  function bulbState(comp, res) {
    const R = typeof comp.props?.resistance === 'number' ? comp.props.resistance : 8.3
    const ratedV = typeof comp.props?.ratedV === 'number' ? comp.props.ratedV : 2.5
    const ratedP = (ratedV * ratedV) / Math.max(R, 0.1)
    const P = res ? Math.abs(res.power) : 0
    const ratio = ratedP > 0 ? P / ratedP : 0
    const brightness = ratio > 0 ? Math.min(1, Math.pow(ratio, 0.45)) : 0
    const overload = ratio > 1.4 ? Math.min(1, (ratio - 1.4) / 2.4) : 0
    return { brightness, overload, power: P, ratio }
  }

  /** 电表量程：A 0~0.6A / V 0~3V（教学常用小量程） */
  function meterRangeOf(comp, kind) {
    const r = comp.props?.range
    return typeof r === 'number' && r > 0 ? r : (kind === 'A' ? 0.6 : 3)
  }

  /** 接线柱极帽颜色：电源/电表分红黑，其余裸铜 */
  function terminalColor(type, idx) {
    if (type === 'battery' || type === 'ammeter' || type === 'voltmeter') {
      return idx === 1 ? '#c62828' : '#1b1b1b'
    }
    return null
  }

  function solveCircuit() {
    const s = S.current
    const ALLOWED = new Set(['battery', 'bulb', 'switch', 'resistor', 'rheostat', 'ammeter', 'voltmeter'])
    const before = s.components.length
    s.components = s.components.filter(c => ALLOWED.has(c.type))
    if (s.components.length !== before) {
      const kept = new Set(s.components.map(c => c.id))
      s.wires = s.wires.filter(w => kept.has(w.from.compId) && kept.has(w.to.compId))
    }
    if (s.components.length === 0) return { ok: false, reason: '画布是空的', results: new Map() }
    const g = new CircuitGraph()
    for (const comp of s.components) {
      const props = {}
      if (comp.type === 'bulb') props.resistance = 8.3
      if (comp.type === 'resistor') props.resistance = (comp.props && comp.props.resistance != null) ? comp.props.resistance : 10
      if (comp.type === 'rheostat') props.resistance = (comp.props && comp.props.resistance != null) ? comp.props.resistance : 20
      if (comp.type === 'switch') props.closed = comp.closed !== false
      if (comp.type === 'battery') props.voltage = s.U
      if (comp.type === 'ammeter') props.resistance = 0.001
      if (comp.type === 'voltmeter') props.resistance = 1000000
      g.addComponent(comp.type, comp.x, comp.y, props, comp.id)
    }
    for (const wire of s.wires) {
      g.addWire(
        { componentId: wire.from.compId, portIndex: wire.from.termIdx },
        { componentId: wire.to.compId, portIndex: wire.to.termIdx }
      )
    }
    try {
      const v = g.validate()
      if (!v.ok) return { ok: false, reason: v.reason, results: new Map() }
      const info = g.getCircuitInfo()
      const solver = new CircuitSolver()
      const results = solver.solve(info)
      return { ok: true, reason: v.reason, results }
    } catch (e) {
      return { ok: false, reason: '求解失败：' + (e.message || e), results: new Map() }
    }
  }

  // getTerminals / getTermPos / findTermAt / findCompAt 从 circuitKit 导入
  function findTerm(mx, my) {
    return findTermAt(S.current.components, mx, my)
  }
  function findComp(mx, my) {
    return findCompAt(S.current.components, mx, my)
  }

  // ═══════════════════════════════════════════════════════════
  //  符号绘制（Tab1）
  // ═══════════════════════════════════════════════════════════
  function drawLine(ctx, x1, y1, x2, y2, c, w) {
    ctx.strokeStyle = c || '#999'; ctx.lineWidth = w || 2.5; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.lineCap = 'butt'
  }
  function drawFlow(ctx, pts, t) {
    let len = 0; const segs = []
    for (let i = 0; i < pts.length - 1; i++) {
      const dx = pts[i+1].x - pts[i].x, dy = pts[i+1].y - pts[i].y
      const l = Math.sqrt(dx*dx+dy*dy); segs.push({ ...pts[i], ex: pts[i+1].x, ey: pts[i+1].y, l }); len += l
    }
    ctx.fillStyle = '#FFEB3B'
    const n = Math.max(5, Math.floor(len / 45))
    for (let d = 0; d < n; d++) {
      let pos = ((t * 50 + d * (len / n)) % len)
      for (const seg of segs) {
        if (pos <= seg.l) {
          const r = pos / seg.l
          ctx.beginPath(); ctx.arc(seg.x + (seg.ex - seg.x) * r, seg.y + (seg.ey - seg.y) * r, 3, 0, Math.PI * 2); ctx.fill()
          break
        }
        pos -= seg.l
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  交互
  // ═══════════════════════════════════════════════════════════
  const getPos = (e) => eventToCanvas(canvasRef.current, e)

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    const s = S.current; const { x, y } = getPos(e)
    if (s.tab === 1) {
      for (const a of canvasRef.current._clickAreas) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(x, y); return } }
      return
    }
    // Tab2：先处理注册的点击区域（操作说明气泡等）
    for (const a of canvasRef.current._clickAreas || []) {
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(); return }
    }
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
          const props = {}
          if (a.type === 'rheostat') props.resistance = 20
          if (a.type === 'resistor') props.resistance = 10
          s.components.push({ id, type: a.type, x, y, rotation: 0, closed: a.type === 'switch' ? false : true, props })
          s.dragId = id; s.dragOffX = 0; s.dragOffY = 0
          s.dragMoved = false; s.dragStart = { x, y }
          forceUpdate(n => n + 1); return
        }
      }
    }
    for (const comp of s.components) {
      if (comp.type !== 'rheostat') continue
      const Rv = (comp.props && comp.props.resistance != null) ? comp.props.resistance : 20
      const sliderX = comp.x + rheostatSliderX(Rv, RHEO_MAX)
      if (Math.abs(x - sliderX) < 14 && Math.abs(y - (comp.y - 16)) < 16) {
        s.dragId = 'rheo_' + comp.id
        s.dragMoved = false; s.dragStart = { x, y }
        forceUpdate(n => n + 1); return
      }
    }
    const term = findTerm(x, y)
    if (term) { s.connecting = { ...term, mx: x, my: y }; forceUpdate(n => n + 1); return }
    for (const wire of s.wires) {
      const fc = s.components.find(c => c.id === wire.from.compId)
      const tc = s.components.find(c => c.id === wire.to.compId)
      if (!fc || !tc) continue
      if (wire.mid1X != null && (x - wire.mid1X) ** 2 + (y - wire.mid1Y) ** 2 < 256) {
        s.dragId = 'wire_' + wire.id + '_1'; s.dragMoved = false; s.dragStart = { x, y }
        forceUpdate(n => n + 1); return
      }
      if (wire.mid2X != null && (x - wire.mid2X) ** 2 + (y - wire.mid2Y) ** 2 < 256) {
        s.dragId = 'wire_' + wire.id + '_2'; s.dragMoved = false; s.dragStart = { x, y }
        forceUpdate(n => n + 1); return
      }
    }
    const comp = findComp(x, y)
    if (comp) {
      s.dragId = comp.id; s.dragOffX = x - comp.x; s.dragOffY = y - comp.y
      s.dragMoved = false; s.dragStart = { x, y }
      forceUpdate(n => n + 1)
    }
  }, [])

  const handleMouseMove = useCallback((e) => {
    const s = S.current; const { x, y } = getPos(e)
    if (s.tab !== 2) return
    // 器材栏滑动（手机）
    if (s.palDrag) {
      const dy = y - s.palDrag.y0
      if (Math.abs(dy) > 6) s.palDrag.moved = true
      if (s.palDrag.moved) {
        s._palScroll = s.palDrag.scroll0 - dy
      }
      return
    }
    // 拖拽过程只改 S.current，rAF 每帧重绘 —— 不 forceUpdate，避免电脑端卡顿
    if (s.dragId) {
      if (typeof s.dragId === 'string' && s.dragId.startsWith('rheo_')) {
        const compId = parseInt(s.dragId.slice(5))
        const comp = s.components.find(c => c.id === compId)
        if (comp) {
          if (s.dragStart && Math.hypot(x - s.dragStart.x, y - s.dragStart.y) > 5) s.dragMoved = true
          comp.props.resistance = mapSliderR(x, comp.x - 26, comp.x + 26, 50)
        }
        return
      }
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
      const c = s.components.find(k => k.id === s.dragId)
      if (c) {
        if (s.dragStart && Math.hypot(x - s.dragStart.x, y - s.dragStart.y) > 5) s.dragMoved = true
        c.x = x - s.dragOffX; c.y = y - s.dragOffY
      }
      return
    }
    if (s.connecting) {
      s.connecting.mx = x; s.connecting.my = y
      s.hoverTerm = findTermNear(s.components, x, y, s.connecting.compId)
      return
    }
    s.hoverTerm = findTerm(x, y)
    canvasRef.current.style.cursor = s.hoverTerm ? 'crosshair' : findComp(x, y) ? 'grab' : 'default'
  }, [])

  const handleMouseUp = useCallback((e) => {
    const s = S.current
    if (e) {
      try { s._lastUpPos = getPos(e) } catch (_) { s._lastUpPos = null }
    }
    const now = performance.now()
    const upPos = s._lastUpPos
    if (s.tab === 2 && upPos) {
      const isDouble = s._lastUpT && (now - s._lastUpT) < 350
        && s._lastUpPrev
        && Math.hypot(upPos.x - s._lastUpPrev.x, upPos.y - s._lastUpPrev.y) < 28
      if (isDouble && !s.dragMoved) {
        let comp = findComp(upPos.x, upPos.y)
        if (!comp) comp = findCompWide(S.current.components, upPos.x, upPos.y)
        if (comp) {
          s.components = s.components.filter(k => k.id !== comp.id)
          s.wires = s.wires.filter(w => w.from.compId !== comp.id && w.to.compId !== comp.id)
          s.dragId = null; s.connecting = null
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
        // 轻点：命中器材则放到工作区中部
        for (const a of canvasRef.current._palAreas || []) {
          if (pd.x >= a.x && pd.x <= a.x + a.w && pd.y >= a.y && pd.y <= a.y + a.h) {
            if (a.action === 'color') { s.wireColor = a.color; forceUpdate(n => n + 1); return }
            if (a.type) {
              const id = s.nextId++
              const props = {}
              if (a.type === 'rheostat') props.resistance = 20
              if (a.type === 'resistor') props.resistance = 10
              const wx = s._palRect ? s._palRect.x * 0.42 : pd.x
              const wy = s._palRect ? s._palRect.y + s._palRect.h * 0.45 : pd.y
              s.components.push({ id, type: a.type, x: wx, y: wy, rotation: 0, closed: a.type === 'switch' ? false : true, props })
              s.dragId = id; s.dragOffX = 0; s.dragOffY = 0
              s.dragMoved = false; s.dragStart = { x: wx, y: wy }
            }
            break
          }
        }
      }
      forceUpdate(n => n + 1)
      return
    }
    if (s.dragId) {
      const id = s.dragId
      const moved = s.dragMoved
      s.dragId = null; s.dragMoved = false; s.dragStart = null
      // 轻点开关：切换通断
      if (!moved && typeof id === 'number') {
        const c = s.components.find(k => k.id === id)
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
    // 双击删除
    let comp = findComp(x, y)
    if (!comp) comp = findCompWide(S.current.components, x, y)
    if (comp) {
      S.current.components = S.current.components.filter(c => c.id !== comp.id)
      S.current.wires = S.current.wires.filter(w => w.from.compId !== comp.id && w.to.compId !== comp.id)
      forceUpdate(n => n + 1)
    }
  }, [])

  const handleReset = useCallback(() => {
    S.current.components = []; S.current.wires = []; S.current.dragId = null; S.current.connecting = null
    S.current.switchClosed = false; S.current.sliderR = 20
    S.current._flow = null
    resetNeedles()
    dataStore = []
    forceUpdate(n => n + 1)
  }, [])

  return (
    <SceneShell
      title={title}
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t); forceUpdate(n => n + 1) }}
      tab1Label="实验演示"
      tab2Label="自己动手"
      onReset={handleReset}
      desc={(
        <>
          <b>{title}</b>
          <span style={{ marginLeft: 12, color: '#555', fontSize: 12 }}>
            {tab === 1 ? '点开关 · 调变阻器 · 记录' : '拖器材 · 点接线柱连线'}
          </span>
        </>
      )}
    >
      <div className="scene-split" style={{ display: 'flex', flex: 1, minHeight: 0, width: '100%' }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
          onContextMenu={handleContextMenu} onDoubleClick={handleDoubleClick} />
        {tab === 1 && (
          <InfoDock
            purpose="测量小灯泡在不同电压下的电功率 P=UI。"
            steps={[
              '闭合开关，调变阻器分压',
              'U≈2.5V 时点「记录」',
              '再测偏低/偏高各一组',
            ]}
            hint="U=灯泡端电压（断开=0）。灯泡亮度随功率连续变化。"
          />
        )}
      </div>
    </SceneShell>
  )
}
