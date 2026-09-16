import { useState, useRef, useEffect, useCallback } from 'react'
import { CircuitGraph, CircuitSolver } from '../engine/index.js'

// 模块级数据
let dataStore = []

/**
 * VoltAmpereResistorScene — 伏安法测小灯泡电功率
 * Tab1: 演示 — 改变滑动变阻器，测灯泡在不同电压下的 P=UI（灯泡电阻随温度非线性）
 * Tab2: 自己动手搭电路（完整电路引擎）
 */
export default function VoltAmpereResistorScene() {
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
        const rect = canvas.getBoundingClientRect()
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
    const L = W * 0.06, Rt = W * 0.48, T = 85, B = H - 140

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

    ctx.fillStyle = '#333'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('伏安法测小灯泡电功率', W / 2, 12)

    // 电路图
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
        const r = Math.max(0, Math.min(1, (mx - (slX - 24)) / 48))
        s.sliderR = Math.round(r * 50)
      }
    })

    const volY = T + 55
    drawLine(ctx, bulX - 16, T, bulX - 16, volY, wc, 2)
    drawLine(ctx, bulX + 16, T, bulX + 16, volY, wc, 2)
    drawLine(ctx, bulX - 16, volY, bulX - 22, volY, wc, 2)
    drawLine(ctx, bulX + 22, volY, bulX + 16, volY, wc, 2)
    drawMeter(ctx, bulX, volY, 'V', on ? U_b / s.U_rated : 0, on ? U_b.toFixed(2) + 'V' : '', '#4CAF50')

    ctx.fillStyle = '#555'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText('A', amX, T - 22)
    ctx.fillText('滑动变阻器', slX, T - 22)
    ctx.fillText('小灯泡 2.5V', bulX, T - 22)
    ctx.fillText('V', bulX, volY + 18)
    ctx.textBaseline = 'alphabetic'

    // 操作气泡
    const cx = (L + Rt) / 2, cy = (T + B) / 2 + 10
    const bw = 240, bh = 92
    ctx.fillStyle = 'rgba(255,253,230,0.95)'; ctx.strokeStyle = '#FFB300'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.roundRect(cx - bw/2, cy - bh/2, bw, bh, 10); ctx.fill(); ctx.stroke()
    ctx.fillStyle = 'rgba(255,253,230,0.95)'
    ctx.beginPath(); ctx.moveTo(cx - 10, cy + bh/2); ctx.lineTo(cx + 10, cy + bh/2); ctx.lineTo(cx, cy + bh/2 + 10); ctx.closePath(); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#5D4037'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.font = 'bold 11px sans-serif'
    ctx.fillText('📋 操作步骤', cx - bw/2 + 12, cy - bh/2 + 10)
    ctx.font = '10px sans-serif'
    const steps = [
      '①  点击开关，闭合电路',
      '②  点击滑动变阻器电阻体，调节分压',
      '③  让灯泡电压 ≈ 2.5V → 点"记录"',
      '④  再测低于/高于额定电压两组',
    ]
    for (let i = 0; i < steps.length; i++) ctx.fillText(steps[i], cx - bw/2 + 12, cy - bh/2 + 28 + i * 15)

    // 右侧面板
    const px = W * 0.52, py = 50, pw = W * 0.46, ph = H - 160
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    let ky = py + 12
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 12px sans-serif'
    ctx.fillText('🎯 实验目的：', px + 14, ky)
    ctx.font = '11px sans-serif'; ctx.fillStyle = '#444'
    ctx.fillText('测量小灯泡在不同电压下的电功率 P=UI', px + 14 + 80, ky); ky += 24

    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'
    ctx.fillText('📖 小灯泡（额定电压 2.5V）', px + 14, ky); ky += 22
    const status = !on ? '断开' : U_b < s.U_rated * 0.8 ? '低于额定电压（偏暗）' : U_b < s.U_rated * 1.1 ? '正常发光（额定）' : '高于额定电压（过亮）'
    ctx.fillStyle = !on ? '#999' : U_b < s.U_rated * 0.8 ? '#1976D2' : U_b < s.U_rated * 1.1 ? '#4CAF50' : '#F44336'
    ctx.font = 'bold 12px sans-serif'
    ctx.fillText(status, px + 14, ky); ky += 22
    ctx.fillStyle = '#444'; ctx.font = '12px monospace'
    ctx.fillText(`U = ${U_b.toFixed(2)} V`, px + 14, ky); ky += 18
    ctx.fillText(`I = ${I.toFixed(3)} A`, px + 14, ky); ky += 18
    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 13px monospace'
    ctx.fillText(`P = UI = ${P.toFixed(3)} W`, px + 14, ky); ky += 26

    if (dataStore.length > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'
      ctx.fillText('📊 实验数据', px + 14, ky); ky += 16
      const colW = [35, 60, 60, 65, 80]
      const rowH = 17
      const tblW = colW.reduce((a, b) => a + b, 0)
      const tblX = px + 14
      const headers = ['序号', 'U(V)', 'I(A)', 'P(W)', '发光情况']
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
      ky += 10
      drawGraph(ctx, px + 14, ky, pw - 28, 130, dataStore, 'U (V)', 'P (W)', d => d.U, d => d.P, '#FF6F00')
    } else {
      ctx.fillStyle = '#888'; ctx.font = '11px sans-serif'
      ctx.fillText('闭合开关 → 调节变阻器 → 点"记录"', px + 14, ky); ky += 18
      ctx.fillText('建议测3组：低于额定、额定、高于额定电压', px + 14, ky)
    }
    ctx.textBaseline = 'alphabetic'

    // 底部按钮
    const nY = H - 42
    const recOk = on
    ctx.fillStyle = recOk ? '#4CAF50' : '#bdbdbd'; ctx.beginPath(); ctx.roundRect(20, nY, 90, 30, 6); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('📝 记录', 65, nY + 15)
    if (recOk) canvasRef.current._clickAreas.push({ x: 20, y: nY, w: 90, h: 30, onClick: () => {
      dataStore.push({ U: U_b, I, P }); forceUpdate(n => n + 1)
    }})
    ctx.fillStyle = '#f0f0f0'; ctx.beginPath(); ctx.roundRect(120, nY, 70, 30, 6); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(120, nY, 70, 30, 6); ctx.stroke()
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.fillText('清除', 155, nY + 15)
    canvasRef.current._clickAreas.push({ x: 120, y: nY, w: 70, h: 30, onClick: () => { dataStore = []; forceUpdate(n => n + 1) } })
    ctx.fillStyle = '#f0f0f0'; ctx.beginPath(); ctx.roundRect(200, nY, 80, 30, 6); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(200, nY, 80, 30, 6); ctx.stroke()
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.fillText('↺ 重置', 240, nY + 15)
    canvasRef.current._clickAreas.push({ x: 200, y: nY, w: 80, h: 30, onClick: () => { s.sliderR = 20; s.switchClosed = false; dataStore = []; forceUpdate(n => n + 1) } })
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
    const palW = 170
    const cvX = 10, cvY = 60, cvW = W - palW - 30, cvH = H - 120
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
        ctx.strokeStyle = s.wireColor; ctx.lineWidth = 2; ctx.setLineDash([5, 5])
        ctx.beginPath(); ctx.moveTo(ft.x, ft.y); ctx.lineTo(s.connecting.mx, s.connecting.my); ctx.stroke()
        ctx.setLineDash([])
      }
    }
    const circuit = checkCircuit()
    const eng = solveCircuit()
    for (const comp of s.components) drawBComp(ctx, comp, s, circuit, eng)

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

    // 操作说明气泡（右上角，可折叠）
    {
      const bw2 = 200, bh2 = s._guideOpen ? 196 : 40
      const bx = cvX + cvW - bw2 - 12, by = cvY + 10
      ctx.fillStyle = 'rgba(255,253,230,0.95)'; ctx.strokeStyle = '#FFB300'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.roundRect(bx, by, bw2, bh2, 8); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#5D4037'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText('📋 操作说明', bx + 10, by + 20)
      ctx.textAlign = 'right'
      ctx.fillText(s._guideOpen ? '收起 ▲' : '展开 ▼', bx + bw2 - 10, by + 20)
      canvasRef.current._clickAreas.push({ x: bx - 5, y: by - 5, w: bw2 + 10, h: 45, onClick: () => { s._guideOpen = !s._guideOpen; forceUpdate(n => n + 1) } })
      if (s._guideOpen) {
        ctx.textAlign = 'left'; ctx.font = '10px sans-serif'
        const lines = [
          '①  从右侧器材栏拖入器材',
          '②  点击接线柱（小圆圈）开始连线',
          '③  点击另一端子完成导线',
          '④  拖动变阻器滑片调阻值',
          '⑤  双击开关切换通断',
          '⑥  右键删除器材/导线',
          '⑦  参照 Tab1 电路图接线：',
          '    电源→开关→A表→变阻器→灯泡',
          '    V表并联在灯泡两端',
        ]
        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], bx + 10, by + 44 + i * 16)
        }
      }
      ctx.textBaseline = 'alphabetic'
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
      drawIcon(ctx, palX + 28, iy + 19, item.type)
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

  function drawIcon(ctx, x, y, type) {
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
    } else if (type === 'switch') {
      ctx.fillStyle = '#ECEFF1'; ctx.strokeStyle = '#90A4AE'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.roundRect(-14, -6, 28, 12, 3); ctx.fill(); ctx.stroke()
      ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 2; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(5, -6); ctx.stroke(); ctx.lineCap = 'butt'
    } else if (type === 'ammeter') {
      ctx.fillStyle = '#FFEBEE'; ctx.strokeStyle = '#E53935'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('A', 0, 0)
    } else if (type === 'voltmeter') {
      ctx.fillStyle = '#E8F5E9'; ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#4CAF50'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('V', 0, 0)
    } else if (type === 'rheostat') {
      ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.roundRect(-14, -6, 28, 12, 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#E65100'; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(-4, -5); ctx.lineTo(4, -5); ctx.closePath(); ctx.fill()
    }
    ctx.restore()
  }

  function drawBComp(ctx, comp, s, circuit, eng) {
    const { x, y, type } = comp
    const isClosed = eng ? eng.ok : (circuit && circuit.closed)
    ctx.save(); ctx.translate(x, y)
    if (s.dragId === comp.id) ctx.globalAlpha = 0.6

    if (type === 'battery') {
      const grd = ctx.createLinearGradient(-35, -22, 35, 22)
      grd.addColorStop(0, '#A5D6A7'); grd.addColorStop(0.5, '#66BB6A'); grd.addColorStop(1, '#43A047')
      ctx.fillStyle = grd; ctx.strokeStyle = '#2E7D32'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.roundRect(-35, -22, 70, 44, 6); ctx.fill(); ctx.stroke()
      ctx.strokeStyle = '#1B5E20'; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(-14, -16); ctx.lineTo(-14, 16); ctx.stroke()
      ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(14, -8); ctx.lineTo(14, 8); ctx.stroke()
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
      ctx.fillText('+', -40, -24)
      ctx.fillStyle = '#333'; ctx.font = 'bold 15px sans-serif'
      ctx.fillText('−', 40, -16)
      ctx.textBaseline = 'alphabetic'
    } else if (type === 'bulb') {
      const brightness = (() => {
        if (!isClosed || !eng?.ok || !eng.results) return 0
        const r = eng.results.get(comp.id)
        if (!r) return 0
        const maxP = (Math.pow(s.U, 2)) / 10
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
      ctx.fillText('小灯泡', 0, 26)
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
    } else if (type === 'ammeter') {
      const r = (isClosed && eng?.ok && eng.results) ? eng.results.get(comp.id) : null
      const cur = r ? r.current : 0
      ctx.fillStyle = '#FFCDD2'; ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#B71C1C'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('A', 0, -8)
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px monospace'
      ctx.fillText(isClosed ? `${Math.abs(cur).toFixed(2)}A` : '--', 0, 10)
    } else if (type === 'voltmeter') {
      const r = (isClosed && eng?.ok && eng.results) ? eng.results.get(comp.id) : null
      const volt = r ? Math.abs(r.voltage) : 0
      ctx.fillStyle = '#C8E6C9'; ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#1B5E20'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('V', 0, -8)
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px monospace'
      ctx.fillText(isClosed ? `${volt.toFixed(1)}V` : '--', 0, 10)
    } else if (type === 'rheostat') {
      const Rv = (comp.props && comp.props.resistance != null) ? comp.props.resistance : 20
      const minX = -30, maxX = 30
      const sliderX = minX + (Rv / 50) * (maxX - minX)
      ctx.fillStyle = '#EFEBE9'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.roundRect(-34, -14, 68, 28, 4); ctx.fill(); ctx.stroke()
      ctx.strokeStyle = '#5D4037'; ctx.lineWidth = 1.2
      ctx.beginPath(); ctx.moveTo(-30, 0)
      for (let i = 0; i < 10; i++) { const px = -30 + i*6, py = (i%2===0)?-4:4; if (i>0) ctx.lineTo(px, py) }
      ctx.lineTo(30, 0); ctx.stroke()
      ctx.strokeStyle = '#78909C'; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(-34, -18); ctx.lineTo(34, -18); ctx.stroke()
      ctx.fillStyle = '#FB8C00'; ctx.strokeStyle = '#E65100'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.roundRect(sliderX - 6, -22, 12, 8, 2); ctx.fill(); ctx.stroke()
      ctx.strokeStyle = '#E65100'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(sliderX, -14); ctx.lineTo(sliderX, -4); ctx.stroke()
      ctx.fillStyle = '#333'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText(`变阻器 ${Rv}Ω`, 0, 16)
    }
    ctx.globalAlpha = 1; ctx.restore()
    // 接线柱
    const terms = getTerminals(comp)
    for (let i = 0; i < terms.length; i++) {
      const t = terms[i]
      const hov = s.hoverTerm && s.hoverTerm.compId === comp.id && s.hoverTerm.termIdx === i
      ctx.fillStyle = hov ? '#FF9800' : '#fff'
      ctx.strokeStyle = hov ? '#E65100' : '#666'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(t.x, t.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      if (hov) { ctx.strokeStyle = 'rgba(255,152,0,0.4)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(t.x, t.y, 13, 0, Math.PI * 2); ctx.stroke() }
    }
  }

  function drawBWire(ctx, wire) {
    const fc = S.current.components.find(c => c.id === wire.from.compId)
    const tc = S.current.components.find(c => c.id === wire.to.compId)
    if (!fc || !tc) return
    const f = getTermPos(fc, wire.from.termIdx), t = getTermPos(tc, wire.to.termIdx)
    const color = wire.color || '#1565C0'
    ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.beginPath(); ctx.moveTo(f.x, f.y)
    if (wire.mid1X != null) {
      ctx.lineTo(wire.mid1X, wire.mid1Y)
      if (wire.mid2X != null) ctx.lineTo(wire.mid2X, wire.mid2Y)
      ctx.lineTo(t.x, t.y)
    } else {
      const dx = t.x - f.x
      const ext = Math.min(Math.abs(dx) * 0.5, 80)
      const fDir = f.x < t.x ? -1 : 1
      const tDir = f.x < t.x ? 1 : -1
      ctx.bezierCurveTo(f.x + fDir * ext, f.y, t.x + tDir * ext, t.y, t.x, t.y)
    }
    ctx.stroke(); ctx.lineCap = 'butt'
    if (wire.mid1X != null) {
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(wire.mid1X, wire.mid1Y, 5, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(wire.mid1X, wire.mid1Y, 2.5, 0, Math.PI * 2); ctx.fill()
    }
    if (wire.mid2X != null) {
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(wire.mid2X, wire.mid2Y, 5, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(wire.mid2X, wire.mid2Y, 2.5, 0, Math.PI * 2); ctx.fill()
    }
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

  function getTerminals(comp) {
    return [{ x: comp.x - 40, y: comp.y }, { x: comp.x + 40, y: comp.y }]
  }
  function getTermPos(comp, idx) { return getTerminals(comp)[idx] }
  function findTerm(mx, my) {
    for (const comp of S.current.components) {
      const terms = getTerminals(comp)
      for (let i = 0; i < terms.length; i++) {
        if ((mx - terms[i].x) ** 2 + (my - terms[i].y) ** 2 < 144) return { compId: comp.id, termIdx: i }
      }
    }
    return null
  }
  function findComp(mx, my) {
    for (let i = S.current.components.length - 1; i >= 0; i--) {
      const c = S.current.components[i]
      if (Math.abs(mx - c.x) < 45 && Math.abs(my - c.y) < 35) return c
    }
    return null
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
    const brightness = Math.min(P / Pmax, 1.2)
    const levels = [
      { min: 0, bg: '#f0f0f0', fg: '#bbb', glow: 0 },
      { min: 0.1, bg: '#FFFDE7', fg: '#E0C860', glow: 0.12 },
      { min: 0.25, bg: '#FFF9C4', fg: '#D4A800', glow: 0.25 },
      { min: 0.5, bg: '#FFF59D', fg: '#C68A00', glow: 0.45 },
      { min: 0.75, bg: '#FFEE58', fg: '#B76000', glow: 0.65 },
      { min: 1.0, bg: '#FFEB3B', fg: '#E65100', glow: 0.85 },
    ]
    let lv = levels[0]
    for (const l of levels) { if (brightness >= l.min) lv = l }
    if (lv.glow > 0) {
      const glow = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 3)
      glow.addColorStop(0, 'rgba(255,235,59,' + (lv.glow * 0.5) + ')')
      glow.addColorStop(1, 'rgba(255,235,59,0)')
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, r * 3, 0, Math.PI * 2); ctx.fill()
    }
    ctx.fillStyle = lv.bg; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = lv.fg; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = lv.fg; ctx.lineWidth = 1.5
    const s2 = r * 0.55
    ctx.beginPath(); ctx.moveTo(x - s2, y - s2); ctx.lineTo(x + s2, y + s2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x + s2, y - s2); ctx.lineTo(x - s2, y + s2); ctx.stroke()
    ctx.fillStyle = '#9E9E9E'; ctx.strokeStyle = '#616161'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x - 8, y + r, 16, 8, 2); ctx.fill(); ctx.stroke()
  }

  // ═══════════════════════════════════════════════════════════
  //  交互
  // ═══════════════════════════════════════════════════════════
  const getPos = (e) => { const r = canvasRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }

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
          s.dragId = id; s.dragOffX = 0; s.dragOffY = 0; forceUpdate(n => n + 1); return
        }
      }
    }
    for (const comp of s.components) {
      if (comp.type !== 'rheostat') continue
      const Rv = (comp.props && comp.props.resistance != null) ? comp.props.resistance : 20
      const sliderX = comp.x - 30 + (Rv / 50) * 60
      if (Math.abs(x - sliderX) < 12 && Math.abs(y - (comp.y - 18)) < 15) {
        s.dragId = 'rheo_' + comp.id; forceUpdate(n => n + 1); return
      }
    }
    const term = findTerm(x, y)
    if (term) { s.connecting = { ...term, mx: x, my: y }; forceUpdate(n => n + 1); return }
    for (const wire of s.wires) {
      const fc = s.components.find(c => c.id === wire.from.compId)
      const tc = s.components.find(c => c.id === wire.to.compId)
      if (!fc || !tc) continue
      if (wire.mid1X != null && (x - wire.mid1X) ** 2 + (y - wire.mid1Y) ** 2 < 144) { s.dragId = 'wire_' + wire.id + '_1'; forceUpdate(n => n + 1); return }
      if (wire.mid2X != null && (x - wire.mid2X) ** 2 + (y - wire.mid2Y) ** 2 < 144) { s.dragId = 'wire_' + wire.id + '_2'; forceUpdate(n => n + 1); return }
    }
    const comp = findComp(x, y)
    if (comp) { s.dragId = comp.id; s.dragOffX = x - comp.x; s.dragOffY = y - comp.y; forceUpdate(n => n + 1) }
  }, [])

  const handleMouseMove = useCallback((e) => {
    const s = S.current; const { x, y } = getPos(e)
    if (s.tab !== 2) return
    if (s.dragId) {
      if (typeof s.dragId === 'string' && s.dragId.startsWith('rheo_')) {
        const compId = parseInt(s.dragId.slice(5))
        const comp = s.components.find(c => c.id === compId)
        if (comp) {
          const minX = comp.x - 30, maxX = comp.x + 30
          const nx = Math.max(minX, Math.min(maxX, x))
          comp.props.resistance = Math.round(((nx - minX) / (maxX - minX)) * 50)
          forceUpdate(n => n + 1)
        }
        return
      }
      if (typeof s.dragId === 'string' && s.dragId.startsWith('wire_')) {
        const parts = s.dragId.split('_')
        const wire = s.wires.find(w => w.id === parseInt(parts[1]))
        if (wire) {
          if (parseInt(parts[2]) === 1) { wire.mid1X = x; wire.mid1Y = y }
          else { wire.mid2X = x; wire.mid2Y = y }
          forceUpdate(n => n + 1)
        }
        return
      }
      const c = s.components.find(c => c.id === s.dragId)
      if (c) { c.x = x - s.dragOffX; c.y = y - s.dragOffY; forceUpdate(n => n + 1) }
      return
    }
    if (s.connecting) {
      s.connecting.mx = x; s.connecting.my = y
      const t = findTerm(x, y); s.hoverTerm = t && t.compId !== s.connecting.compId ? t : null
      forceUpdate(n => n + 1); return
    }
    s.hoverTerm = findTerm(x, y)
    canvasRef.current.style.cursor = s.hoverTerm ? 'crosshair' : findComp(x, y) ? 'grab' : 'default'
  }, [])

  const handleMouseUp = useCallback(() => {
    const s = S.current
    if (s.dragId) { s.dragId = null; forceUpdate(n => n + 1); return }
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
    const { x, y } = getPos(e)
    const comp = findComp(x, y)
    if (comp && comp.type === 'switch') { comp.closed = comp.closed === false ? true : false; forceUpdate(n => n + 1) }
  }, [])

  const handleReset = useCallback(() => {
    S.current.components = []; S.current.wires = []; S.current.dragId = null; S.current.connecting = null
    forceUpdate(n => n + 1)
  }, [])

  return (
    <div style={st.container}>
      <div style={st.topBar}>
        <span style={st.title}>伏安法测小灯泡电功率</span>
        <div style={st.topActions}>
          <button style={tab === 1 ? st.tabA : st.tab} onClick={() => { S.current.tab = 1; setTab(1); forceUpdate(n => n + 1) }}>📖 实验演示</button>
          <button style={tab === 2 ? st.tabA : st.tab} onClick={() => { S.current.tab = 2; setTab(2); forceUpdate(n => n + 1) }}>🔧 自己动手</button>
          <div style={{ flex: 1 }} />
          <button style={st.btn} onClick={handleReset}>↺ 重置</button>
        </div>
      </div>
      <div style={st.main}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
          onContextMenu={handleContextMenu} onDoubleClick={handleDoubleClick} />
      </div>
      <div style={st.desc}>
        <b>伏安法测小灯泡电功率</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          {tab === 1 ? '点击开关→点滑动变阻器电阻体调分压→记录3组数据' : '从器材栏拖入器材·点击接线柱连线·双击开关·拖动变阻器滑片'}
        </span>
      </div>
    </div>
  )
}

const st = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', maxHeight: '100vh', background: '#f0f4f8', color: '#333', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', overflow: 'hidden' },
  topBar: { minHeight: 44, background: '#f5f5f5', borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', padding: '0 12px', flexShrink: 0, gap: 12 },
  title: { fontSize: 14, fontWeight: 600, color: '#333' },
  topActions: { display: 'flex', alignItems: 'center', gap: 6 },
  tab: { background: '#f0f0f0', color: '#666', border: '1px solid #ddd', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  tabA: { background: '#4A90D9', color: '#fff', border: '1px solid #4A90D9', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600 },
  btn: { background: '#f0f0f0', color: '#333', border: '1px solid #ddd', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  main: { flex: 1, display: 'flex', overflow: 'hidden' },
  desc: { padding: '8px 14px', background: '#f5f5f5', borderTop: '1px solid #ccc', fontSize: 13, color: '#333', flexShrink: 0 },
}
