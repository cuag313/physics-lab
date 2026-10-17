import { useState, useRef, useEffect, useCallback } from 'react'
import { eventToCanvas } from '../utils/pointerPos'
import { CircuitGraph, CircuitSolver } from '../engine/index.js'
import SceneShell from '../ui/SceneShell'
import InfoDock from '../ui/InfoDock'
import { fitLayout, drawPanel, wrapText } from '../ui/canvasLayout'
import {
  getTerminals, getTermPos, findTermAt, findTermNear,
  strokeBezierWire, strokeWirePreview,
  findCompAt, findCompWide, mapSliderR,
  drawGuideBubble, drawBuilderComp, drawRealisticIcon,
} from '../ui/circuitKit'

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
    const loop = () => { S.current.time += 1 / 60; render(R); animRef.current = requestAnimationFrame(loop) }
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

    ctx.fillStyle = '#333'; ctx.font = `bold ${lay.font.title}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    if (!lay.compact) ctx.fillText(title, W / 2, 12)

    const battX = L + (Rt - L) * 0.15
    const swX = L + (Rt - L) * 0.35
    const amX = L + (Rt - L) * 0.22
    const slX = L + (Rt - L) * 0.5
    const bulX = L + (Rt - L) * 0.8
    const wc = on ? '#1565C0' : '#999'

    drawLine(ctx, L, T, Rt, T, wc, 2.5)
    drawLine(ctx, Rt, T, Rt, B, wc, 2.5)
    drawLine(ctx, L, T, L, B, wc, 2.5)
    drawLine(ctx, L, B, battX - 36, B, wc, 2.5)
    drawLine(ctx, battX + 36, B, swX - 18, B, wc, 2.5)
    drawLine(ctx, swX + 18, B, Rt, B, wc, 2.5)
    drawLine(ctx, L, T, amX - 18, T, wc, 2.5)
    drawLine(ctx, amX + 18, T, slX - 24, T, wc, 2.5)
    drawLine(ctx, slX + 24, T, bulX - 16, T, wc, 2.5)
    drawLine(ctx, bulX + 16, T, Rt, T, wc, 2.5)

    if (on) drawFlow(ctx, [
      { x: battX + 36, y: B }, { x: swX, y: B }, { x: Rt, y: B },
      { x: Rt, y: T }, { x: bulX, y: T }, { x: slX, y: T },
      { x: amX, y: T }, { x: L, y: T }, { x: L, y: B }, { x: battX - 36, y: B },
    ], s.time)

    drawBatteryPack(ctx, battX, B)
    drawSwitchSym(ctx, swX, B, on, () => { s.switchClosed = !s.switchClosed; forceUpdate(n => n + 1) })
    drawMeter(ctx, amX, T, 'A', on ? I / 0.6 : 0, on ? I.toFixed(3) + 'A' : '', '#E53935')
    drawRheo(ctx, slX, T, s.sliderR, 50)
    drawBulb(ctx, bulX, T, P)

    canvasRef.current._clickAreas.push({
      x: slX - 30, y: T - 22, w: 60, h: 34,
      onClick: (mx) => {
        // 止点吸附：左=0Ω 右=50Ω
        s.sliderR = mapSliderR(mx, slX - 24, slX + 24, 50)
      }
    })

    const volY = T + 55
    drawLine(ctx, bulX - 16, T, bulX - 16, volY, wc, 2)
    drawLine(ctx, bulX + 16, T, bulX + 16, volY, wc, 2)
    drawLine(ctx, bulX - 16, volY, bulX - 22, volY, wc, 2)
    drawLine(ctx, bulX + 22, volY, bulX + 16, volY, wc, 2)
    drawMeter(ctx, bulX, volY, 'V', on ? U_b / s.U_rated : 0, on ? U_b.toFixed(2) + 'V' : '', '#4CAF50')

    ctx.fillStyle = '#555'; ctx.font = `${lay.font.label}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText('滑动变阻器', slX, T - 22)
    ctx.fillText('小灯泡 2.5V', bulX, T - 22)
    // 电表符号内已有 A/V，不重复标注
    ctx.textBaseline = 'alphabetic'

    const status = !on ? '断开' : U_b < s.U_rated * 0.8 ? '低于额定（偏暗）' : U_b < s.U_rated * 1.1 ? '正常发光' : '高于额定（过亮）'
    const ro = lay.readout
    const inner = drawPanel(ctx, ro, lay.compact ? null : '🎯 实验目的')
    let ky = inner.y
    if (!lay.compact) {
      ctx.fillStyle = '#444'; ctx.font = `${lay.font.body}px sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      ky = wrapText(ctx, '测量小灯泡在不同电压下的电功率 P=UI', inner.x, ky, inner.w, 18) + 4
      ctx.fillStyle = '#333'; ctx.font = `bold ${lay.font.body}px sans-serif`
      ctx.fillText('📖 小灯泡（额定 2.5V）', inner.x, ky); ky += 22
    }
    ctx.fillStyle = !on ? '#999' : U_b < s.U_rated * 0.8 ? '#1976D2' : U_b < s.U_rated * 1.1 ? '#4CAF50' : '#F44336'
    ctx.font = `bold ${lay.font.data}px sans-serif`
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

    // 按钮放在读数面板底部，不与左侧电路重叠
    const nY = Math.min(H - 32, ro.y + ro.h - 32)
    const btnX = ro.x
    const recOk = on
    const btnH = 26
    const btnW = Math.min(72, (ro.w - 16) / 3)
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
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.fillText('清除', bx2 + btnW / 2, nY + btnH / 2)
    canvasRef.current._clickAreas.push({ x: bx2, y: nY, w: btnW, h: btnH, onClick: () => { dataStore = []; forceUpdate(n => n + 1) } })
    const bx3 = btnX + (btnW + 8) * 2
    ctx.fillStyle = '#f0f0f0'; ctx.beginPath(); ctx.roundRect(bx3, nY, btnW, btnH, 6); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(bx3, nY, btnW, btnH, 6); ctx.stroke()
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.fillText('重置', bx3 + btnW / 2, nY + btnH / 2)
    canvasRef.current._clickAreas.push({ x: bx3, y: nY, w: btnW, h: btnH, onClick: () => { s.sliderR = 20; s.switchClosed = false; dataStore = []; forceUpdate(n => n + 1) } })
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
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(cvX, cvY, cvW, cvH, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(cvX, cvY, cvW, cvH, 8); ctx.stroke()
    ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 0.5
    for (let gx = cvX + 25; gx < cvX + cvW; gx += 25) { ctx.beginPath(); ctx.moveTo(gx, cvY); ctx.lineTo(gx, cvY + cvH); ctx.stroke() }
    for (let gy = cvY + 25; gy < cvY + cvH; gy += 25) { ctx.beginPath(); ctx.moveTo(cvX, gy); ctx.lineTo(cvX + cvW, gy); ctx.stroke() }

    for (const wire of s.wires) drawBWire(ctx, wire)
    if (s.connecting) {
      const fc = s.components.find(c => c.id === s.connecting.compId)
      if (fc) {
        const ft = getTermPos(fc, s.connecting.termIdx)
        strokeWirePreview(ctx, ft, { x: s.connecting.mx, y: s.connecting.my }, s.wireColor, s.connecting.termIdx)
      }
    }
    const circuit = checkCircuit()
    const eng = solveCircuit()
    for (const comp of s.components) drawBuilderComp(ctx, comp, s, circuit, eng)

    // 未连线红框
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

    let statusText = eng.ok ? '✅ ' + eng.reason : '❌ ' + (eng.reason || circuit.reason)
    let statusColor = eng.ok ? '#4CAF50' : '#F44336'
    // 短路检测：A表电流过大（>0.8A）且灯泡功率≈0
    if (eng.ok && eng.results) {
      let totalI = 0, bulbP = 0
      for (const r of eng.results.values()) {
        if (r.current) totalI = Math.max(totalI, Math.abs(r.current))
        if (r.power != null) bulbP = Math.max(bulbP, r.power)
      }
      if (totalI > 0.8 && bulbP < 0.01) {
        statusText = '⚠️ 短路！电流过大，灯泡被短路'
        statusColor = '#FF5722'
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

    // 器材栏
    const palX = W - palW - 10
    ctx.fillStyle = '#f8f9fa'; ctx.beginPath(); ctx.roundRect(palX, cvY, palW, cvH, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(palX, cvY, palW, cvH, 8); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('🧰 电学器材', palX + 10, cvY + 10)
    const items = [
      { type: 'battery', name: '电源' },
      { type: 'switch', name: '开关' },
      { type: 'rheostat', name: '滑动变阻器' },
      { type: 'ammeter', name: '电流表 A' },
      { type: 'bulb', name: '小灯泡' },
      { type: 'voltmeter', name: '电压表 V' },
    ]
    let iy = cvY + 35
    for (const item of items) {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(palX + 6, iy, palW - 12, 38, 6); ctx.fill()
      ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(palX + 6, iy, palW - 12, 38, 6); ctx.stroke()
      drawRealisticIcon(ctx, palX + 28, iy + 19, item.type)
      ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText(item.name, palX + 50, iy + 19); ctx.textBaseline = 'alphabetic'
      canvasRef.current._palAreas.push({ x: palX + 6, y: iy, w: palW - 12, h: 38, type: item.type })
      iy += 42
    }
    iy += 10
    ctx.fillStyle = '#333'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('导线颜色：', palX + 10, iy); iy += 20
    for (const wc of [{ color: '#F44336', name: '红线' }, { color: '#FFC107', name: '黄线' }, { color: '#4CAF50', name: '绿线' }]) {
      const active = s.wireColor === wc.color
      ctx.fillStyle = active ? '#e3f2fd' : '#fff'
      ctx.beginPath(); ctx.roundRect(palX + 6, iy, palW - 12, 26, 4); ctx.fill()
      if (active) { ctx.strokeStyle = wc.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(palX + 6, iy, palW - 12, 26, 4); ctx.stroke() }
      ctx.fillStyle = wc.color; ctx.fillRect(palX + 14, iy + 8, 30, 10)
      ctx.fillStyle = '#333'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText(wc.name, palX + 52, iy + 13); ctx.textBaseline = 'alphabetic'
      canvasRef.current._palAreas.push({ x: palX + 6, y: iy, w: palW - 12, h: 26, action: 'color', color: wc.color })
      iy += 30
    }
    ctx.textBaseline = 'alphabetic'
  }

  function drawBWire(ctx, wire) {
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

  function checkCircuit() {
    const s = S.current
    const batteries = s.components.filter(c => c.type === 'battery')
    const switches_ = s.components.filter(c => c.type === 'switch')
    if (batteries.length === 0) return { closed: false, reason: '需要电源' }
    const hasLoad = s.components.some(c => c.type === 'bulb' || c.type === 'rheostat')
    if (!hasLoad) return { closed: false, reason: '需要负载（灯泡/变阻器）' }
    const adj = {}
    for (const comp of s.components) adj[comp.id] = new Set()
    for (const wire of s.wires) {
      adj[wire.from.compId]?.add(wire.to.compId)
      adj[wire.to.compId]?.add(wire.from.compId)
    }
    const allConnected = s.components.every(c => adj[c.id]?.size >= 2)
    if (!allConnected) return { closed: false, reason: '电路未闭合' }
    const battery = batteries[0]
    const visited = new Set(); let hasLoop = false
    function dfs(node, depth) {
      if (depth > 0 && node === battery.id) { hasLoop = true; return }
      if (visited.has(node) || depth > s.components.length) return
      visited.add(node)
      for (const next of adj[node] || []) dfs(next, depth + 1)
    }
    dfs(battery.id, 0)
    if (!hasLoop) return { closed: false, reason: '电路未形成闭合回路' }
    for (const sw of switches_) { if (sw.closed === false) return { closed: false, reason: '开关断开' } }
    return { closed: true, reason: '电路正常' }
  }

  function solveCircuit() {
    const s = S.current
    const ALLOWED = new Set(['battery', 'bulb', 'switch', 'rheostat', 'ammeter', 'voltmeter'])
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
  function drawBatteryPack(ctx, x, y) {
    ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.lineCap = 'butt'
    for (let i = 0; i < 3; i++) {
      const cx = x - 20 + i * 16
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 4, y - 14); ctx.lineTo(cx - 4, y + 14); ctx.stroke()
      ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx + 4, y - 7); ctx.lineTo(cx + 4, y + 7); ctx.stroke()
    }
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText('+', x - 24, y - 16)
    ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'
    ctx.fillText('−', x + 28, y - 7)
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#555'; ctx.textBaseline = 'top'
    ctx.fillText('电池组 4.5V', x, y + 18)
    ctx.textBaseline = 'alphabetic'
  }
  function drawSwitchSym(ctx, x, y, on, onClick) {
    ctx.fillStyle = '#666'; ctx.beginPath(); ctx.arc(x - 18, y, 4, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(x + 18, y, 4, 0, Math.PI * 2); ctx.fill()
    if (on) {
      ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 3; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(x - 18, y); ctx.lineTo(x + 18, y); ctx.stroke(); ctx.lineCap = 'butt'
    } else {
      ctx.strokeStyle = '#F44336'; ctx.lineWidth = 3; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(x - 18, y); ctx.lineTo(x + 10, y - 20); ctx.stroke(); ctx.lineCap = 'butt'
    }
    ctx.fillStyle = on ? '#4CAF50' : '#F44336'; ctx.font = 'bold 10px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(on ? 'ON' : 'OFF', x, y + 8)
    ctx.textBaseline = 'alphabetic'
    canvasRef.current._clickAreas.push({ x: x - 25, y: y - 25, w: 50, h: 50, onClick })
  }
  function drawMeter(ctx, x, y, type, frac, reading, color) {
    const r = 22
    ctx.fillStyle = '#fff'; ctx.strokeStyle = color; ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = color; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(type, x, y + 8)
    const clamped = Math.min(Math.max(frac, 0), 1)
    const a = (210 + clamped * 120) * Math.PI / 180
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (r - 6), y + Math.sin(a) * (r - 6)); ctx.stroke()
    ctx.lineCap = 'butt'
    ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill()
    if (reading) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText(reading, x, y + 10)
    }
    ctx.textBaseline = 'alphabetic'
  }
  function drawRheo(ctx, x, y, R, maxR) {
    ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(x - 24, y - 10, 48, 20, 3); ctx.fill(); ctx.stroke()
    const ratio = R / maxR, baseX = x - 24 + ratio * 48, baseY = y - 10
    const tipX = baseX + 14, tipY = baseY - 14
    ctx.strokeStyle = '#546E7A'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(baseX, baseY); ctx.lineTo(tipX, tipY); ctx.stroke(); ctx.lineCap = 'butt'
    ctx.fillStyle = '#546E7A'
    ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.lineTo(tipX - 7, tipY + 2); ctx.lineTo(tipX - 2, tipY + 7); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#333'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(R + 'Ω', x, y + 12)
    ctx.textBaseline = 'alphabetic'
  }
  function drawBulb(ctx, x, y, P) {
    const r = 14
    const Pmax = 0.75
    // 连续渐变：P=0 最暗，P≥Pmax 最亮
    const b = Math.max(0, Math.min(1, P / Pmax))
    const mix = b
    const rC = Math.round(245 + (255 - 245) * mix)
    const gC = Math.round(245 + (235 - 245) * mix)
    const bC = Math.round(245 + (59 - 245) * mix)
    if (b > 0.05) {
      const glow = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 3)
      glow.addColorStop(0, 'rgba(255,235,59,' + (0.12 + 0.45 * mix) + ')')
      glow.addColorStop(1, 'rgba(255,235,59,0)')
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, r * 3, 0, Math.PI * 2); ctx.fill()
    }
    ctx.fillStyle = 'rgb(' + rC + ',' + gC + ',' + bC + ')'
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    const edge = b > 0.05 ? 0.35 + 0.65 * mix : 0
    ctx.strokeStyle = 'rgb(' + Math.round(153 + (249 - 153) * edge) + ',' + Math.round(153 + (168 - 153) * edge) + ',' + Math.round(153 + (40 - 153) * edge) + ')'
    ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = b > 0.05 ? 'rgba(230,80,0,' + (0.4 + 0.6 * mix) + ')' : '#999'
    ctx.lineWidth = 1.5
    const s2 = r * 0.55
    ctx.beginPath(); ctx.moveTo(x - s2, y - s2); ctx.lineTo(x + s2, y + s2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x + s2, y - s2); ctx.lineTo(x - s2, y + s2); ctx.stroke()
    ctx.fillStyle = '#9E9E9E'; ctx.strokeStyle = '#616161'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x - 8, y + r, 16, 8, 2); ctx.fill(); ctx.stroke()
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
    for (const a of canvasRef.current._palAreas) {
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) {
        if (a.action === 'color') { s.wireColor = a.color; forceUpdate(n => n + 1); return }
        if (a.type) {
          const id = s.nextId++
          const props = {}
          if (a.type === 'rheostat') props.resistance = 20
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
      const sliderX = comp.x - 30 + (Rv / 50) * 60
      if (Math.abs(x - sliderX) < 12 && Math.abs(y - (comp.y - 18)) < 15) {
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
    // 拖拽过程只改 S.current，rAF 每帧重绘 —— 不 forceUpdate，避免电脑端卡顿
    if (s.dragId) {
      if (typeof s.dragId === 'string' && s.dragId.startsWith('rheo_')) {
        const compId = parseInt(s.dragId.slice(5))
        const comp = s.components.find(c => c.id === compId)
        if (comp) {
          if (s.dragStart && Math.hypot(x - s.dragStart.x, y - s.dragStart.y) > 5) s.dragMoved = true
          comp.props.resistance = mapSliderR(x, comp.x - 30, comp.x + 30, 50)
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
    forceUpdate(n => n + 1)
  }, [])

  return (
    <SceneShell
      title={title}
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t); forceUpdate(n => n + 1) }}
      tab1Label="📖 实验演示"
      tab2Label="🔧 自己动手"
      onReset={handleReset}
      desc={(
        <>
          <b>{title}</b>
          <span style={{ marginLeft: 12, color: '#555', fontSize: 12 }}>
            {tab === 1 ? '点开关→点变阻器调分压→记录数据' : '拖器材·点接线柱连线·轻点开关通断·双击删除'}
          </span>
        </>
      )}
    >
      <div className="scene-split" style={{ display: 'flex', flex: 1, minHeight: 0, width: '100%' }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
          onContextMenu={handleContextMenu} onDoubleClick={handleDoubleClick} />
        <InfoDock
          purpose="测量小灯泡在不同电压下的电功率 P=UI，观察灯丝电阻随温度的变化。"
          steps={[
            '点击开关，闭合电路',
            '点击滑动变阻器电阻体，调节分压',
            '让灯泡电压 ≈ 2.5V，点「记录」',
            '再测低于/高于额定电压两组数据',
          ]}
          hint="建议测 3 组：低于额定、额定、高于额定。U=灯泡端电压（断开=0）。"
        />
      </div>
    </SceneShell>
  )
}
