import { useState, useRef, useEffect, useCallback } from 'react'

/**
 * VoltAmpereResistorScene — 伏安法测定值电阻
 * Tab1: 实验演示 — 电路符号原理图
 * Tab2: 自己动手 — 实物器材图片 + 矩形回路布局
 * 电路：电源+开关(下边) → 滑线变阻器(上边) → 电流表(串联) → 灯泡 → 电压表(并联灯泡)
 */

const AMMETER_MAX = 0.6
const VOLTMETER_MAX = 3
const DEFAULTS = { U_source: 6, R_true: 15, sliderR: 10 }
const SNAP_DIST = 25

export default function VoltAmpereResistorScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const imgCache = useRef({})
  const [tab, setTab] = useState(1)
  const tabRef = useRef(1)
  const [, forceUpdate] = useState(0)

  const demo = useRef({ switchClosed: false, U_source: DEFAULTS.U_source, R_true: DEFAULTS.R_true, sliderR: DEFAULTS.sliderR, time: 0, data: [], needleA: 0, needleV: 0, overRangeA: false, overRangeV: false })
  const diy = useRef({
    switchClosed: false, U_source: DEFAULTS.U_source, R_true: DEFAULTS.R_true, sliderR: DEFAULTS.sliderR, time: 0, data: [],
    // 矩形回路预置：下=电源+开关，上=滑线变阻器+电流表，右=灯泡+电压表
    components: [
      { id: 1, type: 'battery', x: 200, y: 360 },
      { id: 2, type: 'switch', x: 380, y: 360, closed: false },
      { id: 3, type: 'rheostat', x: 380, y: 120 },
      { id: 4, type: 'ammeter', x: 580, y: 120 },
      { id: 5, type: 'bulb', x: 680, y: 240 },
      { id: 6, type: 'voltmeter', x: 800, y: 240 },
    ],
    wires: [], dragId: null, dragOffX: 0, dragOffY: 0, connecting: null, hoverTerm: null, nextId: 10,
    wireErrors: [], circuitStatus: { ok: false, reason: '' }, undoStack: [], redoStack: [], showGuide: true,
    needleA: 0, needleV: 0, overRangeA: false, overRangeV: false,
  })
  const S = () => tabRef.current === 1 ? demo.current : diy.current

  // 预加载图片
  useEffect(() => {
    const list = { ammeter: './assets/equipment/ammeter.png', voltmeter: './assets/equipment/voltmeter.png', battery: './assets/equipment/battery.png', switch: './assets/equipment/switch.png', rheostat: './assets/equipment/rheostat.png', bulb: './assets/equipment/bulb_on.png', bulb_off: './assets/equipment/resistor.png' }
    for (const [k, src] of Object.entries(list)) {
      const img = new Image(); img.src = src
      img.onload = () => { imgCache.current[k] = img; forceUpdate(n => n + 1) }
    }
  }, [])

  // 画布循环
  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return
    const R = { cv, ctx: cv.getContext('2d'), W: 0, H: 0, resize() { const r = cv.getBoundingClientRect(); cv.width = r.width * devicePixelRatio; cv.height = r.height * devicePixelRatio; this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); this.W = r.width; this.H = r.height } }
    R.resize(); cv._R = R
    const loop = () => { S().time += 1 / 60; updatePhysics(S()); render(R); animRef.current = requestAnimationFrame(loop) }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function updatePhysics(s) {
    if (!s.switchClosed) { s.needleA += (0 - s.needleA) * 0.15; s.needleV += (0 - s.needleV) * 0.15; s.overRangeA = false; s.overRangeV = false; return }
    const Rtot = s.R_true + s.sliderR, I = Rtot > 0 ? s.U_source / Rtot : 0, UR = I * s.R_true
    s.needleA += ((I / AMMETER_MAX) * 1.2 - s.needleA) * 0.12
    s.needleV += ((UR / VOLTMETER_MAX) * 1.2 - s.needleV) * 0.12
    s.overRangeA = I > AMMETER_MAX; s.overRangeV = UR > VOLTMETER_MAX
  }

  function render(R) {
    const { ctx, W, H } = R; ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#f0f4f8'; ctx.fillRect(0, 0, W, H)
    cv._clickAreas = []; cv._palAreas = []
    if (tabRef.current === 1) renderDemo(ctx, W, H, demo.current)
    else renderDIY(ctx, W, H, diy.current)
  }

  // ═══════════════════════ Tab1 演示 ═══════════════════════
  function renderDemo(ctx, W, H, s) {
    const on = s.switchClosed, Rtot = s.R_true + s.sliderR, I = on && Rtot > 0 ? s.U_source / Rtot : 0, UR = I * s.R_true
    const L = W * 0.06, Ri = W * 0.48, T = 70, B = H - 140
    // 电路
    const bX = L + (Ri - L) * 0.12, swX = L + (Ri - L) * 0.3, ammX = L + (Ri - L) * 0.5, resX = L + (Ri - L) * 0.7, wc = on ? '#1565C0' : '#999'
    drawLn(ctx, L, T, Ri, T, wc); drawLn(ctx, Ri, T, Ri, B, wc); drawLn(ctx, L, B, bX - 12, B, wc); drawLn(ctx, bX + 12, B, swX - 18, B, wc); drawLn(ctx, swX + 18, B, ammX - 18, B, wc); drawLn(ctx, ammX + 18, B, resX - 16, B, wc); drawLn(ctx, resX + 16, B, Ri, B, wc); drawLn(ctx, L, T, L, B, wc)
    if (on) drawFlow(ctx, [{ x: bX + 12, y: B }, { x: swX, y: B }, { x: ammX, y: B }, { x: resX, y: B }, { x: Ri, y: B }, { x: Ri, y: T }, { x: L, y: T }, { x: L, y: B }, { x: bX - 12, y: B }], s.time)
    drawBat(ctx, bX, B); drawSw(ctx, swX, B, on, () => { s.switchClosed = !s.switchClosed; forceUpdate(n => n + 1) })
    drawMeterSym(ctx, ammX, B, 'A', s.needleA, s.overRangeA, on ? I.toFixed(3) + 'A' : '')
    drawResSym(ctx, resX, B, 'R=?')
    // V表并联
    const vY = B + 35; drawLn(ctx, resX - 16, B, resX - 16, vY, wc); drawLn(ctx, resX + 16, B, resX + 16, vY, wc); drawLn(ctx, resX - 16, vY, resX - 20, vY, wc); drawLn(ctx, resX + 20, vY, resX + 16, vY, wc)
    drawMeterSym(ctx, resX, vY, 'V', s.needleV, s.overRangeV, on ? UR.toFixed(2) + 'V' : '')
    // 右面板
    const px = W * 0.54, py = 50, pw = W * 0.44, ph = H - 160
    ctx.fillStyle = 'rgba(255,255,255,0.97)'; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.fill(); ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; let ky = py + 12
    ctx.fillText('📖 伏安法测电阻', px + 14, ky); ky += 26; ctx.font = '12px sans-serif'; ctx.fillStyle = '#555'
    ctx.fillText('R = U / I（欧姆定律）', px + 14, ky); ky += 16; ctx.fillText('Ⓐ串联在主回路，Ⓥ并联在灯泡两端', px + 14, ky); ky += 24
    if (on) { ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.fillText('📊 实时读数', px + 14, ky); ky += 18; ctx.font = '12px monospace'; ctx.fillStyle = '#555'; ctx.fillText('U = ' + UR.toFixed(3) + ' V', px + 14, ky); ky += 16; ctx.fillText('I = ' + I.toFixed(4) + ' A', px + 14, ky); ky += 16; ctx.fillStyle = '#4A90D9'; ctx.font = 'bold 12px monospace'; ctx.fillText('R = ' + (I > 0.001 ? (UR / I).toFixed(1) : '—') + ' Ω', px + 14, ky); ky += 24 }
    if (s.data.length > 0) { ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.fillText('📝 实验数据', px + 14, ky); ky += 18; ctx.font = '10px monospace'; ctx.fillStyle = '#555'; ctx.fillText('#   U(V)     I(A)      R(Ω)   操作', px + 14, ky); ky += 14
      for (let i = 0; i < s.data.length; i++) { const d = s.data[i]; ctx.fillStyle = '#555'; ctx.fillText((i + 1).toString().padStart(2) + '  ' + d.U.toFixed(3).padStart(6) + '  ' + d.I.toFixed(4).padStart(7) + '  ' + d.R.toFixed(1).padStart(6), px + 14, ky); ctx.fillStyle = '#F44336'; ctx.font = '9px sans-serif'; ctx.fillText('✕', px + 200, ky); canvasRef.current._clickAreas.push({ x: px + 194, y: ky - 8, w: 16, h: 14, onClick: ((idx) => () => { s.data.splice(idx, 1); forceUpdate(n => n + 1) })(i) }); ctx.font = '10px monospace'; ky += 13 }
      if (s.data.length >= 3) { ky += 6; const avgR = s.data.reduce((a, d) => a + d.R, 0) / s.data.length; ctx.fillStyle = '#E53935'; ctx.font = 'bold 12px sans-serif'; ctx.fillText('R̄ = ' + avgR.toFixed(1) + ' Ω（' + s.data.length + '组平均）', px + 14, ky); ky += 16; const err = Math.abs(avgR - s.R_true) / s.R_true * 100; ctx.fillStyle = err < 5 ? '#4CAF50' : '#FF9800'; ctx.font = '11px sans-serif'; ctx.fillText('相对误差: ' + err.toFixed(1) + '%', px + 14, ky) }
    } else { ctx.fillStyle = '#888'; ctx.font = '11px sans-serif'; ctx.fillText('闭合开关 → 调节参数 → 点"记录"采集数据', px + 14, ky) }
    ctx.textBaseline = 'alphabetic'
    // 底部按钮
    const nY = H - 42
    const recOk = s.switchClosed; ctx.fillStyle = recOk ? '#4CAF50' : '#bdbdbd'; ctx.beginPath(); ctx.roundRect(20, nY, 90, 30, 6); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('📝 记录', 65, nY + 15)
    if (recOk) canvasRef.current._clickAreas.push({ x: 20, y: nY, w: 90, h: 30, onClick: () => { const Rtot2 = s.R_true + s.sliderR, Iv = Rtot2 > 0 ? s.U_source / Rtot2 : 0, URv = Iv * s.R_true; s.data.push({ U: URv, I: Iv, R: Iv > 0 ? URv / Iv : 0 }); forceUpdate(n => n + 1) } })
    ctx.fillStyle = '#f0f0f0'; ctx.beginPath(); ctx.roundRect(120, nY, 70, 30, 6); ctx.fill(); ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(120, nY, 70, 30, 6); ctx.stroke(); ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.fillText('清除', 155, nY + 15)
    canvasRef.current._clickAreas.push({ x: 120, y: nY, w: 70, h: 30, onClick: () => { s.data = []; forceUpdate(n => n + 1) } })
    ctx.fillStyle = '#f0f0f0'; ctx.beginPath(); ctx.roundRect(200, nY, 90, 30, 6); ctx.fill(); ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(200, nY, 90, 30, 6); ctx.stroke(); ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.fillText('📥 CSV', 245, nY + 15)
    canvasRef.current._clickAreas.push({ x: 200, y: nY, w: 90, h: 30, onClick: () => exportCSV(s) })
    ctx.fillStyle = '#f0f0f0'; ctx.beginPath(); ctx.roundRect(300, nY, 80, 30, 6); ctx.fill(); ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(300, nY, 80, 30, 6); ctx.stroke(); ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.fillText('↺ 重置', 340, nY + 15)
    canvasRef.current._clickAreas.push({ x: 300, y: nY, w: 80, h: 30, onClick: () => { s.U_source = DEFAULTS.U_source; s.R_true = DEFAULTS.R_true; s.sliderR = DEFAULTS.sliderR; s.data = []; s.switchClosed = false; forceUpdate(n => n + 1) } })
    ctx.textBaseline = 'alphabetic'
  }

  // ═══════════════════════ Tab2 自己动手 ═══════════════════════
  function renderDIY(ctx, W, H, s) {
    const palW = 160, cvX = 10, cvY = 60, cvW = W - palW - 30, cvH = H - 120
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(cvX, cvY, cvW, cvH, 8); ctx.fill(); ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(cvX, cvY, cvW, cvH, 8); ctx.stroke()
    ctx.strokeStyle = '#f5f5f5'; ctx.lineWidth = 0.5; for (let gx = cvX + 30; gx < cvX + cvW; gx += 30) { ctx.beginPath(); ctx.moveTo(gx, cvY); ctx.lineTo(gx, cvY + cvH); ctx.stroke() }; for (let gy = cvY + 30; gy < cvY + cvH; gy += 30) { ctx.beginPath(); ctx.moveTo(cvX, gy); ctx.lineTo(cvX + cvW, gy); ctx.stroke() }
    // 引导
    if (s.showGuide) { ctx.fillStyle = 'rgba(33,150,243,0.08)'; ctx.beginPath(); ctx.roundRect(cvX + 20, cvY + 20, cvW - 40, 60, 8); ctx.fill(); ctx.fillStyle = '#1976D2'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('🔧 电路已预置：电源+开关(下) → 滑线变阻器(上) → 电流表 → 灯泡 → 电压表(并联)', cvX + cvW / 2, cvY + 30); ctx.fillText('点击"闭合开关"开始实验 · 双击开关切换通断 · 右键删除导线', cvX + cvW / 2, cvY + 50); canvasRef.current._clickAreas.push({ x: cvX, y: cvY, w: cvW, h: cvH, onClick: () => { s.showGuide = false } }) }
    checkCircuit(s)
    // 导线
    for (const w of s.wires) drawDIYWire(ctx, w, s)
    if (s.connecting) { const fc = s.components.find(c => c.id === s.connecting.compId); if (fc) { const ft = termPos(fc, s.connecting.termIdx); ctx.strokeStyle = '#1976D2'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(ft.x, ft.y); ctx.lineTo(s.connecting.mx, s.connecting.my); ctx.stroke(); ctx.setLineDash([]) } }
    // 器材
    const on = s.switchClosed, Rtot = s.R_true + s.sliderR, I = on && Rtot > 0 ? s.U_source / Rtot : 0, UR = I * s.R_true
    for (const c of s.components) drawComp(ctx, c, s, I, UR)
    // 状态
    ctx.fillStyle = s.circuitStatus.ok ? '#4CAF50' : '#F44336'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText(s.circuitStatus.ok ? '✅ ' + s.circuitStatus.reason : '❌ ' + s.circuitStatus.reason, cvX + 12, cvY + cvH - 22)
    // 器材栏
    const palX = W - palW - 10; ctx.fillStyle = '#f8f9fa'; ctx.beginPath(); ctx.roundRect(palX, cvY, palW, cvH, 8); ctx.fill(); ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(palX, cvY, palW, cvH, 8); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('🧰 实物器材', palX + 10, cvY + 8)
    const items = [{ type: 'battery', name: '干电池组' }, { type: 'switch', name: '单向开关' }, { type: 'ammeter', name: '电流表' }, { type: 'voltmeter', name: '电压表' }, { type: 'rheostat', name: '滑线变阻器' }, { type: 'bulb', name: '灯泡' }]
    let iy = cvY + 30
    for (const item of items) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(palX + 6, iy, palW - 12, 40, 6); ctx.fill(); ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(palX + 6, iy, palW - 12, 40, 6); ctx.stroke(); drawIcon(ctx, palX + 26, iy + 20, item.type); ctx.fillStyle = '#333'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(item.name, palX + 46, iy + 20); canvasRef.current._palAreas.push({ x: palX + 6, y: iy, w: palW - 12, h: 40, type: item.type }); iy += 46 }
    // 撤销/重做
    iy += 10; ctx.fillStyle = s.undoStack.length > 0 ? '#f0f0f0' : '#f8f8f8'; ctx.beginPath(); ctx.roundRect(palX + 6, iy, (palW - 18) / 2, 28, 4); ctx.fill(); ctx.fillStyle = s.undoStack.length > 0 ? '#333' : '#ccc'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('↩ 撤销', palX + 6 + (palW - 18) / 4, iy + 14)
    if (s.undoStack.length > 0) canvasRef.current._clickAreas.push({ x: palX + 6, y: iy, w: (palW - 18) / 2, h: 28, onClick: () => { s.redoStack.push({ c: JSON.parse(JSON.stringify(s.components)), w: JSON.parse(JSON.stringify(s.wires)) }); const snap = s.undoStack.pop(); s.components = snap.c; s.wires = snap.w; forceUpdate(n => n + 1) } })
    ctx.fillStyle = s.redoStack.length > 0 ? '#f0f0f0' : '#f8f8f8'; ctx.beginPath(); ctx.roundRect(palX + 6 + (palW - 18) / 2 + 6, iy, (palW - 18) / 2, 28, 4); ctx.fill(); ctx.fillStyle = s.redoStack.length > 0 ? '#333' : '#ccc'; ctx.fillText('↪ 重做', palX + 6 + (palW - 18) / 2 + 6 + (palW - 18) / 4, iy + 14)
    if (s.redoStack.length > 0) canvasRef.current._clickAreas.push({ x: palX + 6 + (palW - 18) / 2 + 6, y: iy, w: (palW - 18) / 2, h: 28, onClick: () => { s.undoStack.push({ c: JSON.parse(JSON.stringify(s.components)), w: JSON.parse(JSON.stringify(s.wires)) }); const snap = s.redoStack.pop(); s.components = snap.c; s.wires = snap.w; forceUpdate(n => n + 1) } })
    ctx.textBaseline = 'alphabetic'
    // 底部
    const nY = H - 42
    ctx.fillStyle = s.switchClosed ? '#E53935' : '#4CAF50'; ctx.beginPath(); ctx.roundRect(20, nY, 110, 30, 6); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s.switchClosed ? '🔴 断开开关' : '🟢 闭合开关', 75, nY + 15)
    canvasRef.current._clickAreas.push({ x: 20, y: nY, w: 110, h: 30, onClick: () => { s.switchClosed = !s.switchClosed; const sw = s.components.find(c => c.type === 'switch'); if (sw) sw.closed = s.switchClosed; forceUpdate(n => n + 1) } })
    const recOk = s.switchClosed && s.circuitStatus.ok; ctx.fillStyle = recOk ? '#4CAF50' : '#bdbdbd'; ctx.beginPath(); ctx.roundRect(140, nY, 90, 30, 6); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.fillText('📝 记录', 185, nY + 15)
    if (recOk) canvasRef.current._clickAreas.push({ x: 140, y: nY, w: 90, h: 30, onClick: () => { const Rtot2 = s.R_true + s.sliderR, Iv = Rtot2 > 0 ? s.U_source / Rtot2 : 0, URv = Iv * s.R_true; s.data.push({ U: URv, I: Iv, R: Iv > 0 ? URv / Iv : 0 }); forceUpdate(n => n + 1) } })
    ctx.fillStyle = '#f0f0f0'; ctx.beginPath(); ctx.roundRect(240, nY, 80, 30, 6); ctx.fill(); ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(240, nY, 80, 30, 6); ctx.stroke(); ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.fillText('📥 CSV', 280, nY + 15); canvasRef.current._clickAreas.push({ x: 240, y: nY, w: 80, h: 30, onClick: () => exportCSV(s) })
    ctx.fillStyle = '#f0f0f0'; ctx.beginPath(); ctx.roundRect(330, nY, 80, 30, 6); ctx.fill(); ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(330, nY, 80, 30, 6); ctx.stroke(); ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.fillText('↺ 重置', 370, nY + 15)
    canvasRef.current._clickAreas.push({ x: 330, y: nY, w: 80, h: 30, onClick: () => { s.U_source = DEFAULTS.U_source; s.R_true = DEFAULTS.R_true; s.sliderR = DEFAULTS.sliderR; s.data = []; s.switchClosed = false; s.wires = []; s.undoStack = []; s.redoStack = []; s.components = [{ id: 1, type: 'battery', x: 200, y: 360 }, { id: 2, type: 'switch', x: 380, y: 360, closed: false }, { id: 3, type: 'rheostat', x: 380, y: 120 }, { id: 4, type: 'ammeter', x: 580, y: 120 }, { id: 5, type: 'bulb', x: 680, y: 240 }, { id: 6, type: 'voltmeter', x: 800, y: 240 }]; forceUpdate(n => n + 1) } })
    ctx.textBaseline = 'alphabetic'
    if (s.data.length > 0) { ctx.fillStyle = '#555'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('已记录 ' + s.data.length + ' 组', 430, nY + 15); if (s.data.length >= 3) { const avgR = s.data.reduce((a, d) => a + d.R, 0) / s.data.length; ctx.fillStyle = '#E53935'; ctx.font = 'bold 11px sans-serif'; ctx.fillText('R̄=' + avgR.toFixed(1) + 'Ω', 520, nY + 15) }; ctx.textBaseline = 'alphabetic' }
  }

  // ─── 实物器材绘制 ───
  function drawComp(ctx, comp, s, I, UR) {const { x, y, type } = comp, on = s.switchClosed
    ctx.save(); ctx.translate(x, y); if (s.dragId === comp.id) ctx.globalAlpha = 0.6
    if (type === 'battery') { const img = imgCache.current.battery; if (img) drawImgFit(ctx, img, 0, 0, 90, 60); else { ctx.fillStyle = '#81C784'; ctx.strokeStyle = '#388E3C'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(-40, -25, 80, 50, 8); ctx.fill(); ctx.stroke() } }
    else if (type === 'switch') { const img = imgCache.current.switch; if (img) { drawImgFit(ctx, img, 0, 0, 80, 44); ctx.fillStyle = comp.closed !== false ? 'rgba(76,175,80,0.12)' : 'rgba(244,67,54,0.08)'; ctx.beginPath(); ctx.arc(0, 0, 25, 0, Math.PI * 2); ctx.fill() } else { ctx.fillStyle = '#ECEFF1'; ctx.strokeStyle = '#78909C'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(-38, -18, 76, 36, 6); ctx.fill(); ctx.stroke() } }
    else if (type === 'ammeter') { const img = imgCache.current.ammeter; if (img) { drawImgFit(ctx, img, 0, 0, 64, 64); drawNeedle(ctx, s.needleA, s.overRangeA, on ? I.toFixed(3) + 'A' : '', '#E53935', 30) } else { ctx.fillStyle = '#FFEBEE'; ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill(); ctx.stroke() } }
    else if (type === 'voltmeter') { const img = imgCache.current.voltmeter; if (img) { drawImgFit(ctx, img, 0, 0, 64, 64); drawNeedle(ctx, s.needleV, s.overRangeV, on ? UR.toFixed(2) + 'V' : '', '#4CAF50', 30) } else { ctx.fillStyle = '#E8F5E9'; ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill(); ctx.stroke() } }
    else if (type === 'rheostat') { const img = imgCache.current.rheostat; if (img) drawImgFit(ctx, img, 0, 0, 110, 56); else { ctx.fillStyle = '#EFEBE9'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(-45, -22, 90, 44, 6); ctx.fill(); ctx.stroke() } }
    else if (type === 'bulb') { const brightness = on ? Math.min(1, (I * I * s.R_true) / 3.6) : 0; const img = brightness > 0.1 ? imgCache.current.bulb : imgCache.current.bulb_off; if (img) { drawImgFit(ctx, img, 0, 0, 60, 72); if (brightness > 0.1) { const glow = ctx.createRadialGradient(0, -10, 8, 0, -10, 40); glow.addColorStop(0, 'rgba(255,235,59,' + (brightness * 0.4) + ')'); glow.addColorStop(1, 'rgba(255,235,59,0)'); ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, -10, 40, 0, Math.PI * 2); ctx.fill() } } else { ctx.fillStyle = brightness > 0.3 ? '#FFEB3B' : '#FFFDE7'; ctx.strokeStyle = brightness > 0.3 ? '#F9A825' : '#bbb'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -6, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke() } ctx.fillStyle = '#555'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('灯泡', 0, 38) }
    ctx.globalAlpha = 1; ctx.restore()
    // 接线柱
    const terms = getTerms(comp); for (let i = 0; i < terms.length; i++) { const t = terms[i], hov = s.hoverTerm && s.hoverTerm.compId === comp.id && s.hoverTerm.termIdx === i, snap = s.connecting && hov; ctx.fillStyle = snap ? '#4CAF50' : hov ? '#FF9800' : '#fff'; ctx.strokeStyle = snap ? '#2E7D32' : hov ? '#E65100' : '#666'; ctx.lineWidth = snap ? 3 : 2; ctx.beginPath(); ctx.arc(t.x, t.y, snap ? 8 : 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); if (snap) { ctx.strokeStyle = 'rgba(76,175,80,0.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(t.x, t.y, 14, 0, Math.PI * 2); ctx.stroke() } }
  }

  // ─── 通用函数 ───
  function drawImgFit(ctx, img, cx, cy, maxW, maxH) { const r = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight); const w = img.naturalWidth * r, h = img.naturalHeight * r; ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h) }
  function drawNeedle(ctx, angle, over, reading, color, r) {
    if (over) { const f = Math.sin(Date.now() / 150) > 0; ctx.fillStyle = f ? 'rgba(244,67,54,0.25)' : 'rgba(244,67,54,0.08)'; ctx.beginPath(); ctx.arc(0, 0, r + 6, 0, Math.PI * 2); ctx.fill() }
    const a = -Math.PI * 0.6 + Math.min(angle, 1.5) * Math.PI * 1.2; ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * (r - 6), Math.sin(a) * (r - 6)); ctx.stroke(); ctx.lineCap = 'butt'; ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill()
    if (reading) { ctx.fillStyle = over ? '#F44336' : '#fff'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(reading, 0, r - 4) }
    if (over) { ctx.fillStyle = '#F44336'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('超量程!', 0, r + 10) }
    ctx.textBaseline = 'alphabetic'
  }
  function drawBat(ctx, x, y) { ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 12, y - 18); ctx.lineTo(x - 12, y + 18); ctx.stroke(); ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x + 12, y - 9); ctx.lineTo(x + 12, y + 9); ctx.stroke(); ctx.fillStyle = '#E53935'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText('+', x - 12, y - 20); ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'; ctx.fillText('−', x + 12, y - 11); ctx.textBaseline = 'alphabetic' }
  function drawSw(ctx, x, y, on, onClick) { ctx.fillStyle = '#666'; ctx.beginPath(); ctx.arc(x - 18, y, 4, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(x + 18, y, 4, 0, Math.PI * 2); ctx.fill(); if (on) { ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - 18, y); ctx.lineTo(x + 18, y); ctx.stroke(); ctx.lineCap = 'butt' } else { ctx.strokeStyle = '#F44336'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - 18, y); ctx.lineTo(x + 10, y - 20); ctx.stroke(); ctx.lineCap = 'butt' }; ctx.fillStyle = on ? '#4CAF50' : '#F44336'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(on ? 'ON' : 'OFF', x, y + 8); ctx.textBaseline = 'alphabetic'; canvasRef.current._clickAreas.push({ x: x - 25, y: y - 25, w: 50, h: 50, onClick }) }
  function drawResSym(ctx, x, y, label) { ctx.fillStyle = '#EFEBE9'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(x - 16, y - 10, 32, 20, 3); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, x, y); ctx.textBaseline = 'alphabetic' }
  function drawMeterSym(ctx, x, y, type, angle, over, reading) { const r = 22, color = type === 'A' ? '#E53935' : '#4CAF50'; if (over) { const f = Math.sin(Date.now() / 150) > 0; ctx.fillStyle = f ? 'rgba(244,67,54,0.2)' : 'rgba(244,67,54,0.06)'; ctx.beginPath(); ctx.arc(x, y, r + 6, 0, Math.PI * 2); ctx.fill() }; ctx.fillStyle = '#fff'; ctx.strokeStyle = over ? '#F44336' : color; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = color; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(type, x, y - 4); const a = -Math.PI * 0.6 + Math.min(angle, 1.5) * Math.PI * 1.2; ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (r - 6), y + Math.sin(a) * (r - 6)); ctx.stroke(); ctx.lineCap = 'butt'; if (reading) { ctx.fillStyle = over ? '#F44336' : '#333'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(reading, x, y + 10) }; if (over) { ctx.fillStyle = '#F44336'; ctx.font = 'bold 9px sans-serif'; ctx.fillText('超量程!', x, y + r + 12) }; ctx.textBaseline = 'alphabetic' }
  function drawLn(ctx, x1, y1, x2, y2, c, w) { ctx.strokeStyle = c || '#999'; ctx.lineWidth = w || 2.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.lineCap = 'butt' }
  function drawFlow(ctx, pts, t) { let len = 0; const segs = []; for (let i = 0; i < pts.length - 1; i++) { const dx = pts[i + 1].x - pts[i].x, dy = pts[i + 1].y - pts[i].y, l = Math.sqrt(dx * dx + dy * dy); segs.push({ ...pts[i], ex: pts[i + 1].x, ey: pts[i + 1].y, l }); len += l }; ctx.fillStyle = '#FFEB3B'; const n = Math.max(5, Math.floor(len / 45)); for (let d = 0; d < n; d++) { let pos = ((t * 50 + d * (len / n)) % len); for (const seg of segs) { if (pos <= seg.l) { const r = pos / seg.l; ctx.beginPath(); ctx.arc(seg.x + (seg.ex - seg.x) * r, seg.y + (seg.ey - seg.y) * r, 3, 0, Math.PI * 2); ctx.fill(); break }; pos -= seg.l } } }
  function drawDIYWire(ctx, wire, s) { const fc = s.components.find(c => c.id === wire.from.compId), tc = s.components.find(c => c.id === wire.to.compId); if (!fc || !tc) return; const f = termPos(fc, wire.from.termIdx), t = termPos(tc, wire.to.termIdx), err = s.wireErrors.some(e => e.wireId === wire.id), on = s.switchClosed, c = err ? '#F44336' : on ? '#1565C0' : '#999'; if (on && !err) { ctx.strokeStyle = 'rgba(21,101,225,0.2)'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(t.x, t.y); ctx.stroke() }; ctx.strokeStyle = c; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(t.x, t.y); ctx.stroke(); ctx.lineCap = 'butt'; if (err) { const mx = (f.x + t.x) / 2, my = (f.y + t.y) / 2; ctx.fillStyle = '#F44336'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✗ 错误', mx, my - 10) } }
  function drawIcon(ctx, x, y, type) { ctx.save(); ctx.translate(x, y); const img = imgCache.current[type]; if (img) { ctx.drawImage(img, -12, -10, 24, 20) } else { ctx.fillStyle = '#ddd'; ctx.beginPath(); ctx.roundRect(-12, -10, 24, 20, 3); ctx.fill(); ctx.fillStyle = '#999'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(type[0].toUpperCase(), 0, 0) }; ctx.restore() }

  // ─── 电路自检 ───
  function checkCircuit(s) { s.wireErrors = []; const comps = s.components, wires = s.wires, adj = {}; for (const c of comps) adj[c.id] = new Set(); for (const w of wires) { adj[w.from.compId]?.add(w.to.compId); adj[w.to.compId]?.add(w.from.compId) }
    if (!comps.some(c => c.type === 'battery')) { s.circuitStatus = { ok: false, reason: '缺少电源' }; return }; if (!comps.some(c => c.type === 'bulb')) { s.circuitStatus = { ok: false, reason: '缺少灯泡' }; return }
    const unconn = comps.filter(c => !adj[c.id] || adj[c.id].size === 0); if (unconn.length > 0) { s.circuitStatus = { ok: false, reason: unconn.map(c => c.type).join('、') + '未连接' }; return }
    const bat = comps.find(c => c.type === 'battery'), vis = new Set(); let loop = false; (function dfs(n, d) { if (d > 0 && n === bat.id) { loop = true; return }; if (vis.has(n) || d > comps.length + 2) return; vis.add(n); for (const nx of adj[n] || []) dfs(nx, d + 1) })(bat.id, 0)
    if (!loop) { s.circuitStatus = { ok: false, reason: '断路：未形成闭合回路' }; return }
    for (const w of wires) { if (w.from.compId === bat.id && w.to.compId === bat.id) { s.wireErrors.push({ wireId: w.id, reason: '短路' }); s.circuitStatus = { ok: false, reason: '短路！' }; return } }
    s.circuitStatus = { ok: true, reason: '电路正常，可以实验' }
  }

  // ─── 接线柱 ───
  function getTerms(comp) { const off = { battery: [{ x: -44, y: 0 }, { x: 44, y: 0 }], switch: [{ x: -26, y: 0 }, { x: 26, y: 0 }], ammeter: [{ x: -30, y: 0 }, { x: 30, y: 0 }], voltmeter: [{ x: -30, y: 0 }, { x: 30, y: 0 }], rheostat: [{ x: -40, y: 0 }, { x: 40, y: 0 }], bulb: [{ x: 0, y: -36 }, { x: 0, y: 36 }] }; return (off[comp.type] || [{ x: -30, y: 0 }, { x: 30, y: 0 }]).map(o => ({ x: comp.x + o.x, y: comp.y + o.y })) }
  function termPos(comp, idx) { return getTerms(comp)[idx] }
  function findTerm(mx, my) { let best = null, bd = SNAP_DIST * SNAP_DIST; for (const c of S().components) { const ts = getTerms(c); for (let i = 0; i < ts.length; i++) { const d = (mx - ts[i].x) ** 2 + (my - ts[i].y) ** 2; if (d < bd) { bd = d; best = { compId: c.id, termIdx: i } } } }; return best }
  function findComp(mx, my) { for (let i = S().components.length - 1; i >= 0; i--) { const c = S().components[i]; if (Math.abs(mx - c.x) < 50 && Math.abs(my - c.y) < 40) return c }; return null }
  function saveUndo(s) { s.undoStack.push({ c: JSON.parse(JSON.stringify(s.components)), w: JSON.parse(JSON.stringify(s.wires)) }); if (s.undoStack.length > 30) s.undoStack.shift(); s.redoStack = [] }
  function exportCSV(s) { if (s.data.length === 0) return; const csv = '#,U(V),I(A),R(Ω)\n' + s.data.map((d, i) => (i + 1) + ',' + d.U.toFixed(4) + ',' + d.I.toFixed(5) + ',' + d.R.toFixed(2)).join('\n'); const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'volt_ampere_' + Date.now() + '.csv'; a.click(); URL.revokeObjectURL(url) }

  // ─── 交互 ───
  const cv = canvasRef.current
  const getPos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
  const handleMouseDown = useCallback((e) => { if (e.button !== 0) return; const { x, y } = getPos(e)
    if (tabRef.current === 1) { for (const a of cv._clickAreas || []) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(); return } }; return }
    const s = diy.current
    for (const a of cv._palAreas || []) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { if (a.type) { saveUndo(s); const id = s.nextId++; s.components.push({ id, type: a.type, x, y }); s.dragId = id; s.dragOffX = 0; s.dragOffY = 0; forceUpdate(n => n + 1); return } } }
    const term = findTerm(x, y); if (term) { if (s.connecting) { if (term.compId !== s.connecting.compId || term.termIdx !== s.connecting.termIdx) { const dup = s.wires.some(w => (w.from.compId === s.connecting.compId && w.from.termIdx === s.connecting.termIdx && w.to.compId === term.compId && w.to.termIdx === term.termIdx) || (w.to.compId === s.connecting.compId && w.to.termIdx === s.connecting.termIdx && w.from.compId === term.compId && w.from.termIdx === term.termIdx)); if (!dup) { saveUndo(s); s.wires.push({ id: s.nextId++, from: { ...s.connecting }, to: term }) } }; s.connecting = null; s.hoverTerm = null } else { s.connecting = { ...term, mx: x, my: y } }; forceUpdate(n => n + 1); return }
    const comp = findComp(x, y); if (comp) { s.dragId = comp.id; s.dragOffX = x - comp.x; s.dragOffY = y - comp.y; forceUpdate(n => n + 1) }
  }, [])
  const handleMouseMove = useCallback((e) => { if (tabRef.current !== 2) return; const { x, y } = getPos(e), s = diy.current
    if (s.dragId) { const c = s.components.find(c => c.id === s.dragId); if (c) { c.x = x - s.dragOffX; c.y = y - s.dragOffY; forceUpdate(n => n + 1) }; return }
    if (s.connecting) { s.connecting.mx = x; s.connecting.my = y; const t = findTerm(x, y); s.hoverTerm = t && (t.compId !== s.connecting.compId || t.termIdx !== s.connecting.termIdx) ? t : null; forceUpdate(n => n + 1); return }
    s.hoverTerm = findTerm(x, y); cv.style.cursor = s.hoverTerm ? 'crosshair' : findComp(x, y) ? 'grab' : 'default'
  }, [])
  const handleMouseUp = useCallback(() => { if (tabRef.current !== 2) return; const s = diy.current; if (s.dragId) { s.dragId = null; forceUpdate(n => n + 1) } }, [])
  const handleContextMenu = useCallback((e) => { if (tabRef.current !== 2) return; e.preventDefault(); const { x, y } = getPos(e), s = diy.current; const comp = findComp(x, y); if (comp) { saveUndo(s); s.components = s.components.filter(c => c.id !== comp.id); s.wires = s.wires.filter(w => w.from.compId !== comp.id && w.to.compId !== comp.id) }; forceUpdate(n => n + 1) }, [])
  const handleDoubleClick = useCallback((e) => { if (tabRef.current !== 2) return; const { x, y } = getPos(e), s = diy.current; const comp = findComp(x, y); if (comp && comp.type === 'switch') { comp.closed = !comp.closed; s.switchClosed = comp.closed; forceUpdate(n => n + 1) } }, [])
  const switchTab = useCallback((newTab) => { if (newTab === tabRef.current) return; const old = tabRef.current === 1 ? demo.current : diy.current; old.switchClosed = false; old.data = []; tabRef.current = newTab; setTab(newTab); forceUpdate(n => n + 1) }, [])
  const updateParam = useCallback((key, val) => { demo.current[key] = val; diy.current[key] = val; forceUpdate(n => n + 1) }, [])

  const s_demo = demo.current
  return (
    <div style={st.container}>
      <div style={st.topBar}>
        <span style={st.title}>伏安法测定值电阻</span>
        <div style={st.topActions}>
          <button style={tab === 1 ? st.tabA : st.tab} onClick={() => switchTab(1)}>📖 实验演示</button>
          <button style={tab === 2 ? st.tabA : st.tab} onClick={() => switchTab(2)}>🔧 自己动手</button>
          <div style={st.sep} />
          <label style={st.lbl}>电源U：<input type="range" min="1" max="12" step="0.5" value={s_demo.U_source} onChange={(e) => updateParam('U_source', parseFloat(e.target.value))} style={st.slider} /><span style={st.val}>{s_demo.U_source.toFixed(1)}V</span></label>
          <label style={st.lbl}>R真值：<input type="range" min="5" max="50" step="1" value={s_demo.R_true} onChange={(e) => updateParam('R_true', parseInt(e.target.value))} style={st.slider} /><span style={st.val}>{s_demo.R_true}Ω</span></label>
          <label style={st.lbl}>滑动变阻器：<input type="range" min="0" max="50" step="1" value={s_demo.sliderR} onChange={(e) => updateParam('sliderR', parseInt(e.target.value))} style={st.slider} /><span style={st.val}>{s_demo.sliderR}Ω</span></label>
        </div>
      </div>
      <div style={st.main}><canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onContextMenu={handleContextMenu} onDoubleClick={handleDoubleClick} /></div>
      <div style={st.desc}><b>伏安法测定值电阻</b><span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>{tab === 1 ? '实验演示：电路符号图 · 调节滑动变阻器 · 记录多组U/I · R=U/I求平均值' : '自己动手：实物器材 · 预置矩形回路 · 接线柱吸附连线 · 右键删除'}</span></div>
    </div>
  )
}

const st = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', maxHeight: '100vh', background: '#f0f4f8', color: '#333', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', overflow: 'hidden' },
  topBar: { minHeight: 44, background: '#f5f5f5', borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', flexShrink: 0, flexWrap: 'wrap', gap: 6 },
  title: { fontSize: 14, fontWeight: 600, color: '#333' },
  topActions: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 },
  tab: { background: '#f0f0f0', color: '#666', border: '1px solid #ddd', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  tabA: { background: '#4A90D9', color: '#fff', border: '1px solid #4A90D9', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600 },
  sep: { width: 1, height: 20, background: '#ddd' },
  lbl: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#666' },
  slider: { width: 70, accentColor: '#4A90D9' },
  val: { color: '#4A90D9', fontWeight: 600, minWidth: 40, fontSize: 12 },
  main: { flex: 1, display: 'flex', overflow: 'hidden' },
  desc: { padding: '8px 14px', background: '#f5f5f5', borderTop: '1px solid #ccc', fontSize: 13, color: '#333', flexShrink: 0 },
}
