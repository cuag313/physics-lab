import { useState, useRef, useEffect, useCallback } from 'react'

const AMMETER_MAX = 0.6
const VOLTMETER_MAX = 12
const DEFAULTS = { U_source: 6, R_true: 15, sliderR: 10 }
const SNAP_DIST = 22

// 接线柱偏移（画在器材边缘上）
const TERM_OFF = {
  battery: [{ x: -44, y: 0 }, { x: 44, y: 0 }],
  switch: [{ x: -26, y: 0 }, { x: 26, y: 0 }],
  ammeter: [{ x: -30, y: 0 }, { x: 30, y: 0 }],
  voltmeter: [{ x: -30, y: 0 }, { x: 30, y: 0 }],
  rheostat: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
  bulb: [{ x: -30, y: 0 }, { x: 30, y: 0 }],
}

export default function VoltAmpereResistorScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const imgCache = useRef({})
  const [tab, setTab] = useState(1)
  const tabRef = useRef(1)
  const [, forceUpdate] = useState(0)

  const demo = useRef({
    switchClosed: false, U_source: DEFAULTS.U_source, R_true: DEFAULTS.R_true, sliderR: DEFAULTS.sliderR,
    time: 0, data: [], needleA: 0, needleV: 0, overRangeA: false, overRangeV: false,
    rheoDragging: false, rheoDragOffX: 0,
    // 缓存布局坐标（供鼠标事件用）
    _rheoX: 0, _topY: 0, _leftX: 0, _rightX: 0,
  })

  const diy = useRef({
    switchClosed: false, U_source: DEFAULTS.U_source, R_true: DEFAULTS.R_true, sliderR: DEFAULTS.sliderR,
    time: 0, data: [],
    components: [],  // 初始空白！
    wires: [],
    dragId: null, dragOffX: 0, dragOffY: 0,
    connecting: null, hoverTerm: null,
    nextId: 1, wireErrors: [], circuitStatus: { ok: false, reason: '' },
    undoStack: [], redoStack: [], showGuide: true,
    needleA: 0, needleV: 0, overRangeA: false, overRangeV: false,
  })

  const S = () => tabRef.current === 1 ? demo.current : diy.current

  useEffect(() => {
    const list = {
      ammeter: './assets/equipment/ammeter.png', voltmeter: './assets/equipment/voltmeter.png',
      battery: './assets/equipment/battery.png', switch: './assets/equipment/switch.png',
      rheostat: './assets/equipment/rheostat.png', bulb: './assets/equipment/bulb_on.png',
      bulb_off: './assets/equipment/resistor.png',
    }
    for (const [k, src] of Object.entries(list)) {
      const img = new Image(); img.src = src
      img.onload = () => { imgCache.current[k] = img; forceUpdate(n => n + 1) }
    }
  }, [])

  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return
    const R = { cv, ctx: cv.getContext('2d'), W: 0, H: 0,
      resize() { const r = cv.getBoundingClientRect(); cv.width = r.width * devicePixelRatio; cv.height = r.height * devicePixelRatio; this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); this.W = r.width; this.H = r.height },
    }
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
    const cv = canvasRef.current; if (!cv) return
    cv._clickAreas = []; cv._palAreas = []
    if (tabRef.current === 1) renderDemo(ctx, W, H, demo.current)
    else renderDIY(ctx, W, H, diy.current)
  }

  // ═══════════════════════════════════════════
  //  Tab1：实验演示 — 按手绘图复刻
  // ═══════════════════════════════════════════
  function renderDemo(ctx, W, H, s) {
    const on = s.switchClosed
    const Rtot = s.R_true + s.sliderR, I = on && Rtot > 0 ? s.U_source / Rtot : 0, UR = I * s.R_true
    // 灯泡亮度：sliderR=0最亮，sliderR=50最暗，用功率比
    const Pnow = I * I * s.R_true
    const Pmax = (s.U_source / s.R_true) ** 2 * s.R_true
    const brightness = on ? Math.max(0.08, Pnow / Pmax) : 0

    // 画布分区
    const circuitW = W * 0.63
    const rectL = 50, rectR = circuitW - 30
    const rectH = 160
    const centerY = H * 0.45
    const topY = centerY - rectH / 2
    const btmY = centerY + rectH / 2
    const span = rectR - rectL

    // 元件分割点
    const rheoX = rectL + span * 1 / 4
    const ammX  = rectL + span * 2 / 4
    const bulbX = rectL + span * 3 / 4
    const batX  = rectL + span * 1 / 3
    const swX   = rectL + span * 2 / 3

    s._rheoX = rheoX; s._topY = topY; s._leftX = rectL; s._rightX = rectR

    const wc = on ? '#1565C0' : '#999'

    // ─── 矩形回路（下边电源负极到开关有线段）───
    drawLn(ctx, rectL, btmY, batX - 14, btmY, wc, 2.5)      // 左角→电源正极
    drawLn(ctx, batX + 14, btmY, swX - 18, btmY, wc, 2.5)   // 电源负极→开关
    drawLn(ctx, swX + 18, btmY, rectR, btmY, wc, 2.5)       // 开关→右角
    drawLn(ctx, rectR, btmY, rectR, topY, wc, 2.5)
    drawLn(ctx, rectR, topY, rectL, topY, wc, 2.5)
    drawLn(ctx, rectL, topY, rectL, btmY, wc, 2.5)

    // ─── 灯泡与伏特表组成小长方形（左右展开）───
    const volH = 50
    const volY = topY + volH
    const volW = 30  // 左右展开
    drawLn(ctx, bulbX - volW, topY, bulbX - volW, volY, wc, 2)
    drawLn(ctx, bulbX + volW, topY, bulbX + volW, volY, wc, 2)
    drawLn(ctx, bulbX - volW, volY, bulbX + volW, volY, wc, 2)

    // 电流流动（逆时针：电子从电源负极→正极，完整回路）
    if (on) {
      drawFlow(ctx, [
        { x: batX + 14, y: btmY },  // 电源负极
        { x: swX, y: btmY },         // 开关
        { x: rectR, y: btmY },       // 右下角
        { x: rectR, y: topY },       // 右上角
        { x: bulbX, y: topY },       // 灯泡
        { x: ammX, y: topY },        // 安培表
        { x: rheoX, y: topY },       // 滑线变阻器
        { x: rectL, y: topY },       // 左上角
        { x: rectL, y: btmY },       // 左下角
        { x: batX - 14, y: btmY },   // 电源正极
        { x: batX + 14, y: btmY },   // 电源内部→负极（回到起点）
      ], s.time)
      ctx.strokeStyle = 'rgba(21,101,225,0.12)'; ctx.lineWidth = 6
      ctx.beginPath()
      ctx.moveTo(rectL, btmY); ctx.lineTo(rectL, topY)
      ctx.lineTo(rectR, topY); ctx.lineTo(rectR, btmY)
      ctx.stroke()

      // 标出电流方向箭头（常规电流：正极→负极）
      ctx.fillStyle = '#FF9800'
      const drawArrow = (ax, ay, angle) => {
        ctx.save(); ctx.translate(ax, ay); ctx.rotate(angle)
        ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-6, -4); ctx.lineTo(-6, 4); ctx.closePath(); ctx.fill()
        ctx.restore()
      }
      drawArrow(rectL, (topY + btmY) / 2, -Math.PI / 2)    // 左边向上
      drawArrow((rheoX + ammX) / 2, topY, 0)                // 上边向右
      drawArrow((ammX + bulbX) / 2, topY, 0)                // 上边向右
      drawArrow(rectR, (topY + btmY) / 2, Math.PI / 2)      // 右边向下
      drawArrow((rectL + batX) / 2, btmY, Math.PI)          // 下边向左
      drawArrow((batX + swX) / 2, btmY, Math.PI)            // 下边向左
    }

    // ─── 元件符号 ───
    drawBat(ctx, batX, btmY)
    drawSw(ctx, swX, btmY, on, () => { s.switchClosed = !s.switchClosed; forceUpdate(n => n + 1) })
    drawRheoSym(ctx, rheoX, topY, s.sliderR, 50, s.rheoDragging)
    drawMeterSym(ctx, ammX, topY, 'A', s.needleA, false, on ? I.toFixed(3) + 'A' : '')
    drawBulbSym(ctx, bulbX, topY, brightness)
    drawMeterSym(ctx, bulbX, volY, 'V', s.needleV, false, on ? UR.toFixed(2) + 'V' : '')

    // 滑线变阻器浮动气泡
    if (on) {
      if (s.sliderR <= 3) {
        ctx.fillStyle = 'rgba(76,175,80,0.92)'
        ctx.beginPath(); ctx.roundRect(rheoX - 65, topY - 48, 130, 24, 6); ctx.fill()
        ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText('← 电阻最小，灯最亮', rheoX, topY - 36)
      } else if (s.sliderR >= 47) {
        ctx.fillStyle = 'rgba(255,152,0,0.92)'
        ctx.beginPath(); ctx.roundRect(rheoX - 65, topY - 48, 130, 24, 6); ctx.fill()
        ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText('电阻最大，灯最暗 →', rheoX, topY - 36)
      }
    }

    // 标注
    ctx.fillStyle = '#555'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('电源', batX, btmY + 22)
    ctx.fillText('开关', swX, btmY + 22)
    ctx.fillText('滑线变阻器', rheoX, topY - 28)
    ctx.fillText('安培表', ammX, topY - 28)
    ctx.fillText('灯泡', bulbX, topY - 28)
    ctx.fillText('伏特表', bulbX, volY + 6)
    ctx.textBaseline = 'alphabetic'

    // ─── 右侧面板（实验目的+数据）───
    const px = W * 0.66, py = 50, pw = W * 0.32, ph = H - 120
    ctx.fillStyle = 'rgba(255,255,255,0.97)'; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.fill()
    ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    let ky = py + 12
    ctx.fillText('📖 实验目的', px + 14, ky); ky += 24
    ctx.font = '12px sans-serif'; ctx.fillStyle = '#555'
    ctx.fillText('学会电流表与电压表的使用方法', px + 14, ky); ky += 20

    ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('电流表 Ⓐ', px + 14, ky); ky += 16
    ctx.font = '11px sans-serif'; ctx.fillStyle = '#555'
    ctx.fillText('串联在电路中，测量电流I', px + 14, ky); ky += 14

    ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('电压表 Ⓥ', px + 14, ky); ky += 16
    ctx.font = '11px sans-serif'; ctx.fillStyle = '#555'
    ctx.fillText('并联在灯泡两端，测电压U', px + 14, ky); ky += 14

    ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('计算电阻', px + 14, ky); ky += 16
    ctx.font = '11px sans-serif'; ctx.fillStyle = '#555'
    ctx.fillText('R = U / I', px + 14, ky); ky += 20

    ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('操作方法', px + 14, ky); ky += 16
    ctx.font = '11px sans-serif'; ctx.fillStyle = '#555'
    ctx.fillText('拖拽变阻器箭头改变电阻', px + 14, ky); ky += 14
    ctx.fillText('观察灯泡亮度和电表变化', px + 14, ky); ky += 20

    if (on) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.fillText('📊 实时数据', px + 14, ky); ky += 18
      ctx.font = '12px monospace'; ctx.fillStyle = '#555'
      ctx.fillText('变阻器 = ' + s.sliderR + ' Ω', px + 14, ky); ky += 16
      ctx.fillText('灯泡R = ' + s.R_true + ' Ω', px + 14, ky); ky += 16
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 12px monospace'
      ctx.fillText('I = ' + I.toFixed(3) + ' A', px + 14, ky); ky += 16
      ctx.fillStyle = '#4CAF50'; ctx.font = 'bold 12px monospace'
      ctx.fillText('U = ' + UR.toFixed(2) + ' V', px + 14, ky); ky += 16
      ctx.fillStyle = '#4A90D9'; ctx.font = 'bold 12px monospace'
      ctx.fillText('R = ' + (I > 0.001 ? (UR / I).toFixed(1) : '—') + ' Ω', px + 14, ky); ky += 16
      ctx.fillStyle = '#FF9800'; ctx.font = '11px sans-serif'
      ctx.fillText('P = ' + Pnow.toFixed(2) + ' W', px + 14, ky); ky += 20
    }

    if (s.data.length > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.fillText('📝 记录数据', px + 14, ky); ky += 18
      ctx.font = '10px monospace'; ctx.fillStyle = '#555'
      ctx.fillText('# R滑  U(V)  I(A)  R灯', px + 14, ky); ky += 14
      for (let i = 0; i < s.data.length; i++) {
        const d = s.data[i]; ctx.fillStyle = '#555'
        ctx.fillText((i+1) + ' ' + String(d.sliderR).padStart(3) + '  ' + d.U.toFixed(2).padStart(5) + ' ' + d.I.toFixed(3).padStart(6) + ' ' + d.R.toFixed(1).padStart(5), px + 14, ky)
        ctx.fillStyle = '#F44336'; ctx.font = '9px sans-serif'; ctx.fillText('✕', px + pw - 30, ky)
        canvasRef.current._clickAreas.push({ x: px + pw - 36, y: ky - 8, w: 16, h: 14, onClick: ((idx) => () => { s.data.splice(idx, 1); forceUpdate(n => n + 1) })(i) })
        ctx.font = '10px monospace'; ky += 13
      }
      if (s.data.length >= 3) {
        ky += 4; const avgR = s.data.reduce((a, d) => a + d.R, 0) / s.data.length
        ctx.fillStyle = '#E53935'; ctx.font = 'bold 12px sans-serif'
        ctx.fillText('R̄ = ' + avgR.toFixed(1) + ' Ω', px + 14, ky); ky += 14
        const err = Math.abs(avgR - s.R_true) / s.R_true * 100
        ctx.fillStyle = err < 5 ? '#4CAF50' : '#FF9800'; ctx.font = '11px sans-serif'
        ctx.fillText('误差 ' + err.toFixed(1) + '%', px + 14, ky)
      }
    }
    ctx.textBaseline = 'alphabetic'

    // 底部按钮
    const nY = H - 42
    const recOk = s.switchClosed
    ctx.fillStyle = recOk ? '#4CAF50' : '#bdbdbd'; ctx.beginPath(); ctx.roundRect(20, nY, 90, 30, 6); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('📝 记录', 65, nY + 15)
    if (recOk) canvasRef.current._clickAreas.push({ x: 20, y: nY, w: 90, h: 30, onClick: () => {
      s.data.push({ sliderR: s.sliderR, U: UR, I: I, R: I > 0 ? UR / I : 0 }); forceUpdate(n => n + 1)
    }})
    ctx.fillStyle = '#f0f0f0'; ctx.beginPath(); ctx.roundRect(120, nY, 70, 30, 6); ctx.fill(); ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(120, nY, 70, 30, 6); ctx.stroke(); ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.fillText('清除', 155, nY + 15)
    canvasRef.current._clickAreas.push({ x: 120, y: nY, w: 70, h: 30, onClick: () => { s.data = []; forceUpdate(n => n + 1) } })
    ctx.fillStyle = '#f0f0f0'; ctx.beginPath(); ctx.roundRect(200, nY, 80, 30, 6); ctx.fill(); ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(200, nY, 80, 30, 6); ctx.stroke(); ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.fillText('📥 CSV', 240, nY + 15)
    canvasRef.current._clickAreas.push({ x: 200, y: nY, w: 80, h: 30, onClick: () => exportCSV(s) })
    ctx.fillStyle = '#f0f0f0'; ctx.beginPath(); ctx.roundRect(290, nY, 80, 30, 6); ctx.fill(); ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(290, nY, 80, 30, 6); ctx.stroke(); ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.fillText('↺ 重置', 330, nY + 15)
    canvasRef.current._clickAreas.push({ x: 290, y: nY, w: 80, h: 30, onClick: () => { s.U_source = DEFAULTS.U_source; s.R_true = DEFAULTS.R_true; s.sliderR = DEFAULTS.sliderR; s.data = []; s.switchClosed = false; forceUpdate(n => n + 1) } })
    ctx.textBaseline = 'alphabetic'
  }

  // ═══════════════════════════════════════════
  //  Tab2：自己动手 — 初始空白，从器材栏拖入
  // ═══════════════════════════════════════════
  function renderDIY(ctx, W, H, s) {
    const palW = 160, cvX = 10, cvY = 60, cvW = W - palW - 30, cvH = H - 120
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(cvX, cvY, cvW, cvH, 8); ctx.fill(); ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(cvX, cvY, cvW, cvH, 8); ctx.stroke()
    ctx.strokeStyle = '#f5f5f5'; ctx.lineWidth = 0.5
    for (let gx = cvX + 30; gx < cvX + cvW; gx += 30) { ctx.beginPath(); ctx.moveTo(gx, cvY); ctx.lineTo(gx, cvY + cvH); ctx.stroke() }
    for (let gy = cvY + 30; gy < cvY + cvH; gy += 30) { ctx.beginPath(); ctx.moveTo(cvX, gy); ctx.lineTo(cvX + cvW, gy); ctx.stroke() }

    if (s.showGuide && s.components.length === 0) {
      ctx.fillStyle = 'rgba(33,150,243,0.06)'; ctx.beginPath(); ctx.roundRect(cvX + 40, cvY + cvH / 2 - 40, cvW - 80, 80, 8); ctx.fill()
      ctx.fillStyle = '#1976D2'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('← 从右侧器材栏拖拽器材到画布', cvX + cvW / 2, cvY + cvH / 2 - 12)
      ctx.fillStyle = '#888'; ctx.font = '11px sans-serif'
      ctx.fillText('点击器材上的小圆圈（接线柱）连线 · 拖拽铆点拉折角', cvX + cvW / 2, cvY + cvH / 2 + 8)
      ctx.fillText('双击开关切换通断 · 右键取消连线或删除', cvX + cvW / 2, cvY + cvH / 2 + 24)
      ctx.textBaseline = 'alphabetic'
    }

    checkCircuit(s)

    // 导线（带铆点折线）
    for (const wire of s.wires) drawDIYWire(ctx, wire, s)
    if (s.connecting) {
      const fc = s.components.find(c => c.id === s.connecting.compId)
      if (fc) { const ft = termPos(fc, s.connecting.termIdx); ctx.strokeStyle = '#1976D2'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(ft.x, ft.y); ctx.lineTo(s.connecting.mx, s.connecting.my); ctx.stroke(); ctx.setLineDash([]) }
    }

    // 实物器材（接线柱画在器材上）
    const on = s.switchClosed, Rtot = s.R_true + s.sliderR, I = on && Rtot > 0 ? s.U_source / Rtot : 0, UR = I * s.R_true
    for (const comp of s.components) drawComp(ctx, comp, s, I, UR)

    if (s.components.length > 0) {
      ctx.fillStyle = s.circuitStatus.ok ? '#4CAF50' : '#F44336'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      ctx.fillText(s.circuitStatus.ok ? '✅ ' + s.circuitStatus.reason : '❌ ' + s.circuitStatus.reason, cvX + 12, cvY + cvH - 22)
    }

    // 器材栏
    const palX = W - palW - 10
    ctx.fillStyle = '#f8f9fa'; ctx.beginPath(); ctx.roundRect(palX, cvY, palW, cvH, 8); ctx.fill(); ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(palX, cvY, palW, cvH, 8); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('🧰 实物器材', palX + 10, cvY + 8)
    const items = [{ type: 'battery', name: '干电池组' }, { type: 'switch', name: '单向开关' }, { type: 'rheostat', name: '滑线变阻器' }, { type: 'ammeter', name: '电流表' }, { type: 'bulb', name: '灯泡' }, { type: 'voltmeter', name: '电压表' }]
    let iy = cvY + 30
    for (const item of items) {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(palX + 6, iy, palW - 12, 40, 6); ctx.fill(); ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(palX + 6, iy, palW - 12, 40, 6); ctx.stroke()
      drawIcon(ctx, palX + 26, iy + 20, item.type)
      ctx.fillStyle = '#333'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(item.name, palX + 46, iy + 20)
      canvasRef.current._palAreas.push({ x: palX + 6, y: iy, w: palW - 12, h: 40, type: item.type })
      iy += 46
    }
    // 撤销/重做
    iy += 10
    ctx.fillStyle = s.undoStack.length > 0 ? '#f0f0f0' : '#f8f8f8'; ctx.beginPath(); ctx.roundRect(palX + 6, iy, (palW - 18) / 2, 28, 4); ctx.fill()
    ctx.fillStyle = s.undoStack.length > 0 ? '#333' : '#ccc'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('↩ 撤销', palX + 6 + (palW - 18) / 4, iy + 14)
    if (s.undoStack.length > 0) canvasRef.current._clickAreas.push({ x: palX + 6, y: iy, w: (palW - 18) / 2, h: 28, onClick: () => { s.redoStack.push({ c: JSON.parse(JSON.stringify(s.components)), w: JSON.parse(JSON.stringify(s.wires)) }); const snap = s.undoStack.pop(); s.components = snap.c; s.wires = snap.w; forceUpdate(n => n + 1) } })
    ctx.fillStyle = s.redoStack.length > 0 ? '#f0f0f0' : '#f8f8f8'; ctx.beginPath(); ctx.roundRect(palX + 6 + (palW - 18) / 2 + 6, iy, (palW - 18) / 2, 28, 4); ctx.fill()
    ctx.fillStyle = s.redoStack.length > 0 ? '#333' : '#ccc'; ctx.fillText('↪ 重做', palX + 6 + (palW - 18) / 2 + 6 + (palW - 18) / 4, iy + 14)
    if (s.redoStack.length > 0) canvasRef.current._clickAreas.push({ x: palX + 6 + (palW - 18) / 2 + 6, y: iy, w: (palW - 18) / 2, h: 28, onClick: () => { s.undoStack.push({ c: JSON.parse(JSON.stringify(s.components)), w: JSON.parse(JSON.stringify(s.wires)) }); const snap = s.redoStack.pop(); s.components = snap.c; s.wires = snap.w; forceUpdate(n => n + 1) } })
    ctx.textBaseline = 'alphabetic'

    // 底部
    const nY = H - 42
    ctx.fillStyle = s.switchClosed ? '#E53935' : '#4CAF50'; ctx.beginPath(); ctx.roundRect(20, nY, 110, 30, 6); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s.switchClosed ? '🔴 断开开关' : '🟢 闭合开关', 75, nY + 15)
    canvasRef.current._clickAreas.push({ x: 20, y: nY, w: 110, h: 30, onClick: () => { s.switchClosed = !s.switchClosed; const sw = s.components.find(c => c.type === 'switch'); if (sw) sw.closed = s.switchClosed; forceUpdate(n => n + 1) } })
    const recOk = s.switchClosed && s.circuitStatus.ok
    ctx.fillStyle = recOk ? '#4CAF50' : '#bdbdbd'; ctx.beginPath(); ctx.roundRect(140, nY, 90, 30, 6); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.fillText('📝 记录', 185, nY + 15)
    if (recOk) canvasRef.current._clickAreas.push({ x: 140, y: nY, w: 90, h: 30, onClick: () => { const Rtot2 = s.R_true + s.sliderR, Iv = Rtot2 > 0 ? s.U_source / Rtot2 : 0, URv = Iv * s.R_true; s.data.push({ sliderR: s.sliderR, U: URv, I: Iv, R: Iv > 0 ? URv / Iv : 0 }); forceUpdate(n => n + 1) } })
    ctx.fillStyle = '#f0f0f0'; ctx.beginPath(); ctx.roundRect(240, nY, 80, 30, 6); ctx.fill(); ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(240, nY, 80, 30, 6); ctx.stroke(); ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.fillText('↺ 重置', 280, nY + 15)
    canvasRef.current._clickAreas.push({ x: 240, y: nY, w: 80, h: 30, onClick: () => { s.U_source = DEFAULTS.U_source; s.R_true = DEFAULTS.R_true; s.sliderR = DEFAULTS.sliderR; s.data = []; s.switchClosed = false; s.wires = []; s.components = []; s.undoStack = []; s.redoStack = []; forceUpdate(n => n + 1) } })
    ctx.textBaseline = 'alphabetic'
    if (s.data.length > 0) { ctx.fillStyle = '#555'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('已记录 ' + s.data.length + ' 组', 340, nY + 15); if (s.data.length >= 3) { const avgR = s.data.reduce((a, d) => a + d.R, 0) / s.data.length; ctx.fillStyle = '#E53935'; ctx.font = 'bold 11px sans-serif'; ctx.fillText('R̄=' + avgR.toFixed(1) + 'Ω', 430, nY + 15) }; ctx.textBaseline = 'alphabetic' }
  }


  // ═══════════════════════════════════════════
  //  Canvas2D实物器材绘制
  // ═══════════════════════════════════════════
  function drawBattery2D(ctx, V) {
    const grd = ctx.createLinearGradient(-38, -18, 38, 18)
    grd.addColorStop(0, '#4CAF50'); grd.addColorStop(0.5, '#66BB6A'); grd.addColorStop(1, '#2E7D32')
    ctx.fillStyle = grd; ctx.strokeStyle = '#1B5E20'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(-38, -18, 76, 36, 6); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.beginPath(); ctx.roundRect(-44, -6, 8, 12, 2); ctx.fill()
    ctx.fillStyle = '#E53935'; ctx.beginPath(); ctx.roundRect(36, -6, 8, 12, 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('干电池', 0, -3); ctx.fillText(V + 'V', 0, 9)
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 11px sans-serif'; ctx.fillText('+', 46, 0)
    ctx.fillStyle = '#fff'; ctx.fillText('\u2212', -46, 0)
  }

  function drawSwitch2D(ctx, closed) {
    ctx.fillStyle = '#EFEBE9'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(-24, -12, 48, 24, 4); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#BDBDBD'; ctx.strokeStyle = '#757575'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(-20, 0, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.arc(20, 0, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.lineWidth = 3; ctx.lineCap = 'round'
    if (closed) {
      ctx.strokeStyle = '#4CAF50'
      ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(20, 0); ctx.stroke()
      ctx.fillStyle = '#4CAF50'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('ON', 0, 14)
    } else {
      ctx.strokeStyle = '#F44336'
      ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(12, -16); ctx.stroke()
      ctx.fillStyle = '#F44336'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('OFF', 0, 14)
    }
    ctx.lineCap = 'butt'
  }

  function drawMeter2D(ctx, type, needleAngle, reading, color) {
    const r = 26
    ctx.fillStyle = '#FAFAFA'; ctx.strokeStyle = '#333'; ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.strokeStyle = '#999'; ctx.lineWidth = 0.8
    for (let i = 0; i <= 10; i++) {
      const a = (210 + i * 12) * Math.PI / 180, len = i % 5 === 0 ? 7 : 4
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * (r - 2), Math.sin(a) * (r - 2))
      ctx.lineTo(Math.cos(a) * (r - 2 - len), Math.sin(a) * (r - 2 - len)); ctx.stroke()
    }
    ctx.fillStyle = color; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(type, 0, 6)
    const clamped = Math.min(Math.max(needleAngle, 0), 1)
    const a = (210 + clamped * 120) * Math.PI / 180
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * (r - 5), Math.sin(a) * (r - 5)); ctx.stroke(); ctx.lineCap = 'butt'
    ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill()
    // 数字读数框（LCD风格）
    if (reading) {
      const boxW = 48, boxH = 14
      ctx.fillStyle = '#1a1a1a'; ctx.strokeStyle = '#555'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.roundRect(-boxW / 2, r + 4, boxW, boxH, 3); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#0f0'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(reading, 0, r + 4 + boxH / 2)
    }
    ctx.fillStyle = '#E53935'; ctx.beginPath(); ctx.arc(-r - 5, 0, 3.5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(r + 5, 0, 3.5, 0, Math.PI * 2); ctx.fill()
  }

  function drawRheostat2D(ctx, R, maxR) {
    ctx.fillStyle = '#EFEBE9'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(-38, -18, 76, 36, 4); ctx.fill(); ctx.stroke()
    ctx.strokeStyle = '#795548'; ctx.lineWidth = 1.5
    for (let i = 0; i < 6; i++) { const x = -28 + i * 10; ctx.beginPath(); ctx.arc(x, 0, 6, Math.PI, 0); ctx.stroke() }
    const ratio = R / maxR, sliderX = -30 + ratio * 60
    ctx.fillStyle = '#546E7A'; ctx.strokeStyle = '#37474F'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(sliderX, -22); ctx.lineTo(sliderX - 6, -18); ctx.lineTo(sliderX + 6, -18); ctx.closePath(); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#BDBDBD'; ctx.strokeStyle = '#757575'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(-36, 0, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.arc(36, 0, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(R + '\u03A9', 0, 20)
  }

  function drawBulb2D(ctx, brightness) {
    const r = 16
    const levels = [
      { min: 0, bg: '#f0f0f0', fg: '#bbb', glow: 0 },
      { min: 0.15, bg: '#FFFDE7', fg: '#E0C860', glow: 0.12 },
      { min: 0.3, bg: '#FFF9C4', fg: '#D4A800', glow: 0.25 },
      { min: 0.5, bg: '#FFF59D', fg: '#C68A00', glow: 0.45 },
      { min: 0.7, bg: '#FFEE58', fg: '#B76000', glow: 0.65 },
      { min: 0.85, bg: '#FFEB3B', fg: '#E65100', glow: 0.85 },
    ]
    let lv = levels[0]; for (const l of levels) { if (brightness >= l.min) lv = l }
    if (lv.glow > 0) {
      const glow = ctx.createRadialGradient(0, -4, r * 0.5, 0, -4, r * 2.5)
      glow.addColorStop(0, 'rgba(255,235,59,' + (lv.glow * 0.5) + ')'); glow.addColorStop(1, 'rgba(255,235,59,0)')
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, -4, r * 2.5, 0, Math.PI * 2); ctx.fill()
    }
    // 引线（左右）
    ctx.strokeStyle = '#999'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(-r - 4, -4); ctx.lineTo(-30, 0); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(r + 4, -4); ctx.lineTo(30, 0); ctx.stroke()
    ctx.fillStyle = lv.bg; ctx.beginPath(); ctx.arc(0, -4, r, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = lv.fg; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, -4, r, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = lv.fg; ctx.lineWidth = 1.5; const s = r * 0.5
    ctx.beginPath(); ctx.moveTo(-s, -4 - s); ctx.lineTo(s, -4 + s); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(s, -4 - s); ctx.lineTo(-s, -4 + s); ctx.stroke()
    ctx.fillStyle = '#9E9E9E'; ctx.strokeStyle = '#616161'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(-8, -4 + r, 16, 10, 2); ctx.fill(); ctx.stroke()
  }

  // ─── 实物器材绘制（Canvas2D版本）───
  function drawComp(ctx, comp, s, I, UR) {
    const { x, y, type } = comp, on = s.switchClosed
    ctx.save(); ctx.translate(x, y); if (s.dragId === comp.id) ctx.globalAlpha = 0.6

    if (type === 'battery') drawBattery2D(ctx, s.U_source)
    else if (type === 'switch') drawSwitch2D(ctx, comp.closed !== false)
    else if (type === 'ammeter') drawMeter2D(ctx, 'A', s.needleA, on ? I.toFixed(3) + 'A' : '', '#E53935')
    else if (type === 'voltmeter') drawMeter2D(ctx, 'V', s.needleV, on ? UR.toFixed(2) + 'V' : '', '#4CAF50')
    else if (type === 'rheostat') drawRheostat2D(ctx, s.sliderR, 50)
    else if (type === 'bulb') {
      const brightness = on ? Math.max(0.08, (I * I * s.R_true) / ((s.U_source / s.R_true) ** 2 * s.R_true)) : 0
      drawBulb2D(ctx, brightness)
    }

    ctx.globalAlpha = 1; ctx.restore()

    // 接线柱热点（悬停高亮）
    const offsets = TERM_OFF[type] || [{ x: -30, y: 0 }, { x: 30, y: 0 }]
    for (let i = 0; i < offsets.length; i++) {
      const off = offsets[i]
      const hov = s.hoverTerm && s.hoverTerm.compId === comp.id && s.hoverTerm.termIdx === i
      const snap = s.connecting && hov
      if (snap) { ctx.fillStyle = 'rgba(76,175,80,0.3)'; ctx.beginPath(); ctx.arc(x + off.x, y + off.y, 12, 0, Math.PI * 2); ctx.fill() }
      else if (hov) { ctx.fillStyle = 'rgba(255,152,0,0.25)'; ctx.beginPath(); ctx.arc(x + off.x, y + off.y, 10, 0, Math.PI * 2); ctx.fill() }
    }
  }

  // ─── 导线（两个铆点可拉折角）───
  function drawDIYWire(ctx, wire, s) {
    const fc = s.components.find(c => c.id === wire.from.compId), tc = s.components.find(c => c.id === wire.to.compId)
    if (!fc || !tc) return
    const f = termPos(fc, wire.from.termIdx), t = termPos(tc, wire.to.termIdx)
    const ddx = t.x - f.x, ddy = t.y - f.y
    const err = s.wireErrors.some(e => e.wireId === wire.id), on = s.switchClosed
    const color = err ? '#F44336' : on ? '#1565C0' : '#999'
    const m1x = wire.mid1X != null ? wire.mid1X : f.x + ddx * 0.33, m1y = wire.mid1Y != null ? wire.mid1Y : f.y + ddy * 0.33
    const m2x = wire.mid2X != null ? wire.mid2X : f.x + ddx * 0.67, m2y = wire.mid2Y != null ? wire.mid2Y : f.y + ddy * 0.67
    if (on && !err) { ctx.strokeStyle = 'rgba(21,101,225,0.2)'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(m1x, m1y); ctx.lineTo(m2x, m2y); ctx.lineTo(t.x, t.y); ctx.stroke() }
    ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(m1x, m1y); ctx.lineTo(m2x, m2y); ctx.lineTo(t.x, t.y); ctx.stroke()
    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter'
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(m1x, m1y, 5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(m1x, m1y, 2.5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(m2x, m2y, 5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(m2x, m2y, 2.5, 0, Math.PI * 2); ctx.fill()
  }

  // ═══════════════════════════════════════════
  //  绘制函数
  // ═══════════════════════════════════════════
  function drawImgFit(ctx, img, cx, cy, maxW, maxH) { const r = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight); const w = img.naturalWidth * r, h = img.naturalHeight * r; ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h) }
  function drawNeedle(ctx, angle, over, reading, color, r) {
    if (over) { const f = Math.sin(Date.now() / 150) > 0; ctx.fillStyle = f ? 'rgba(244,67,54,0.25)' : 'rgba(244,67,54,0.08)'; ctx.beginPath(); ctx.arc(0, 0, r + 6, 0, Math.PI * 2); ctx.fill() }
    // 指针：上半圆，210°（左上）→ 330°（右上），顺时针120°
    const clamped = Math.min(Math.max(angle, 0), 1)
    const a = (210 + clamped * 120) * Math.PI / 180
    ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * (r - 6), Math.sin(a) * (r - 6)); ctx.stroke(); ctx.lineCap = 'butt'
    ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill()
    if (reading) { ctx.fillStyle = '#333'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(reading, 0, r - 4) }
    ctx.textBaseline = 'alphabetic'
  }
  function drawBat(ctx, x, y) { ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 12, y - 18); ctx.lineTo(x - 12, y + 18); ctx.stroke(); ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x + 12, y - 9); ctx.lineTo(x + 12, y + 9); ctx.stroke(); ctx.fillStyle = '#E53935'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText('+', x - 12, y - 20); ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'; ctx.fillText('−', x + 12, y - 11); ctx.textBaseline = 'alphabetic' }
  function drawSw(ctx, x, y, on, onClick) { ctx.fillStyle = '#666'; ctx.beginPath(); ctx.arc(x - 18, y, 4, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(x + 18, y, 4, 0, Math.PI * 2); ctx.fill(); if (on) { ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - 18, y); ctx.lineTo(x + 18, y); ctx.stroke(); ctx.lineCap = 'butt' } else { ctx.strokeStyle = '#F44336'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - 18, y); ctx.lineTo(x + 10, y - 20); ctx.stroke(); ctx.lineCap = 'butt' }; ctx.fillStyle = on ? '#4CAF50' : '#F44336'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(on ? 'ON' : 'OFF', x, y + 8); ctx.textBaseline = 'alphabetic'; canvasRef.current._clickAreas.push({ x: x - 25, y: y - 25, w: 50, h: 50, onClick }) }
  // 滑线变阻器（带可拖拽45°箭头）
  function drawRheoSym(ctx, x, y, R, maxR, dragging) {
    ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(x - 24, y - 10, 48, 20, 3); ctx.fill(); ctx.stroke()
    // 斜45°箭头（可左右移动）
    const ratio = R / maxR, baseX = x - 24 + ratio * 48, baseY = y - 10
    const tipX = baseX + 14, tipY = baseY - 14
    ctx.strokeStyle = dragging ? '#E65100' : '#546E7A'; ctx.lineWidth = dragging ? 3.5 : 2.5; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(baseX, baseY); ctx.lineTo(tipX, tipY); ctx.stroke(); ctx.lineCap = 'butt'
    // 箭头
    ctx.fillStyle = dragging ? '#E65100' : '#546E7A'
    ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.lineTo(tipX - 7, tipY + 2); ctx.lineTo(tipX - 2, tipY + 7); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#333'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(R + 'Ω', x, y + 12); ctx.textBaseline = 'alphabetic'
  }
  function drawMeterSym(ctx, x, y, type, angle, over, reading) { const r = 22, color = type === 'A' ? '#E53935' : '#4CAF50'; if (over) { const f = Math.sin(Date.now() / 150) > 0; ctx.fillStyle = f ? 'rgba(244,67,54,0.2)' : 'rgba(244,67,54,0.06)'; ctx.beginPath(); ctx.arc(x, y, r + 6, 0, Math.PI * 2); ctx.fill() }; ctx.fillStyle = '#fff'; ctx.strokeStyle = over ? '#F44336' : color; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = color; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(type, x, y + 8); const a = (210 + Math.min(Math.max(angle, 0), 1) * 120) * Math.PI / 180; ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (r - 6), y + Math.sin(a) * (r - 6)); ctx.stroke(); ctx.lineCap = 'butt'; if (reading) { ctx.fillStyle = over ? '#F44336' : '#333'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(reading, x, y + 10) }; if (over) { ctx.fillStyle = '#F44336'; ctx.font = 'bold 9px sans-serif'; ctx.fillText('超量程!', x, y + r + 12) }; ctx.textBaseline = 'alphabetic' }
  function drawBulbSym(ctx, x, y, brightness) {
    const r = 14
    // 多级亮度：5档渐变
    const levels = [
      { min: 0,    bg: '#f0f0f0', fg: '#bbb',    glow: 0 },
      { min: 0.15, bg: '#FFFDE7', fg: '#E0C860', glow: 0.12 },
      { min: 0.3,  bg: '#FFF9C4', fg: '#D4A800', glow: 0.25 },
      { min: 0.5,  bg: '#FFF59D', fg: '#C68A00', glow: 0.45 },
      { min: 0.7,  bg: '#FFEE58', fg: '#B76000', glow: 0.65 },
      { min: 0.85, bg: '#FFEB3B', fg: '#E65100', glow: 0.85 },
    ]
    let lv = levels[0]
    for (const l of levels) { if (brightness >= l.min) lv = l }

    // 发光晕圈
    if (lv.glow > 0) {
      const glow = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 3)
      glow.addColorStop(0, 'rgba(255,235,59,' + (lv.glow * 0.5) + ')')
      glow.addColorStop(1, 'rgba(255,235,59,0)')
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, r * 3, 0, Math.PI * 2); ctx.fill()
    }
    // 灯泡圆
    ctx.fillStyle = lv.bg; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = lv.fg; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
    // × 灯丝
    ctx.strokeStyle = lv.fg; ctx.lineWidth = 1.5
    const s2 = r * 0.55; ctx.beginPath(); ctx.moveTo(x - s2, y - s2); ctx.lineTo(x + s2, y + s2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x + s2, y - s2); ctx.lineTo(x - s2, y + s2); ctx.stroke()
    // 底座
    ctx.fillStyle = '#9E9E9E'; ctx.strokeStyle = '#616161'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x - 8, y + r, 16, 8, 2); ctx.fill(); ctx.stroke()
  }
  function drawLn(ctx, x1, y1, x2, y2, c, w) { ctx.strokeStyle = c || '#999'; ctx.lineWidth = w || 2.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.lineCap = 'butt' }
  function drawFlow(ctx, pts, t) { let len = 0; const segs = []; for (let i = 0; i < pts.length - 1; i++) { const dx = pts[i+1].x - pts[i].x, dy = pts[i+1].y - pts[i].y, l = Math.sqrt(dx*dx+dy*dy); segs.push({ ...pts[i], ex: pts[i+1].x, ey: pts[i+1].y, l }); len += l }; ctx.fillStyle = '#FFEB3B'; const n = Math.max(5, Math.floor(len / 45)); for (let d = 0; d < n; d++) { let pos = ((t * 50 + d * (len / n)) % len); for (const seg of segs) { if (pos <= seg.l) { const r = pos / seg.l; ctx.beginPath(); ctx.arc(seg.x + (seg.ex - seg.x) * r, seg.y + (seg.ey - seg.y) * r, 3, 0, Math.PI * 2); ctx.fill(); break }; pos -= seg.l } } }
  function drawIcon(ctx, x, y, type) { ctx.save(); ctx.translate(x, y); const img = imgCache.current[type]; if (img) ctx.drawImage(img, -12, -10, 24, 20); else { ctx.fillStyle = '#ddd'; ctx.beginPath(); ctx.roundRect(-12, -10, 24, 20, 3); ctx.fill(); ctx.fillStyle = '#999'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(type[0].toUpperCase(), 0, 0) }; ctx.restore() }

  // ─── 电路自检 ───
  function checkCircuit(s) {
    s.wireErrors = []; const comps = s.components, wires = s.wires, adj = {}
    for (const c of comps) adj[c.id] = new Set()
    for (const w of wires) { adj[w.from.compId]?.add(w.to.compId); adj[w.to.compId]?.add(w.from.compId) }
    if (!comps.some(c => c.type === 'battery')) { s.circuitStatus = { ok: false, reason: '缺少电源' }; return }
    if (!comps.some(c => c.type === 'bulb')) { s.circuitStatus = { ok: false, reason: '缺少灯泡' }; return }
    const unconn = comps.filter(c => !adj[c.id] || adj[c.id].size === 0)
    if (unconn.length > 0) { s.circuitStatus = { ok: false, reason: unconn.map(c => c.type).join('、') + '未连接' }; return }
    const bat = comps.find(c => c.type === 'battery'), vis = new Set(); let loop = false
    ;(function dfs(n, d) { if (d > 0 && n === bat.id) { loop = true; return }; if (vis.has(n) || d > comps.length + 2) return; vis.add(n); for (const nx of adj[n] || []) dfs(nx, d + 1) })(bat.id, 0)
    if (!loop) { s.circuitStatus = { ok: false, reason: '断路：未形成闭合回路' }; return }
    for (const w of wires) { if (w.from.compId === bat.id && w.to.compId === bat.id) { s.wireErrors.push({ wireId: w.id }); s.circuitStatus = { ok: false, reason: '短路！' }; return } }
    s.circuitStatus = { ok: true, reason: '电路正常，可以实验' }
  }

  function getTerms(comp) { return (TERM_OFF[comp.type] || [{ x: -30, y: 0 }, { x: 30, y: 0 }]).map(o => ({ x: comp.x + o.x, y: comp.y + o.y })) }
  function termPos(comp, idx) { return getTerms(comp)[idx] }
  function findTerm(mx, my) { let best = null, bd = SNAP_DIST * SNAP_DIST; for (const c of S().components) { const ts = getTerms(c); for (let i = 0; i < ts.length; i++) { const d = (mx - ts[i].x) ** 2 + (my - ts[i].y) ** 2; if (d < bd) { bd = d; best = { compId: c.id, termIdx: i } } } }; return best }
  function findComp(mx, my) { for (let i = S().components.length - 1; i >= 0; i--) { const c = S().components[i]; if (Math.abs(mx - c.x) < 50 && Math.abs(my - c.y) < 40) return c }; return null }
  function saveUndo(s) { s.undoStack.push({ c: JSON.parse(JSON.stringify(s.components)), w: JSON.parse(JSON.stringify(s.wires)) }); if (s.undoStack.length > 30) s.undoStack.shift(); s.redoStack = [] }
  function exportCSV(s) { if (s.data.length === 0) return; const csv = '#,R滑(Ω),U(V),I(A),R灯(Ω)\n' + s.data.map((d, i) => (i+1)+','+d.sliderR+','+d.U.toFixed(4)+','+d.I.toFixed(5)+','+d.R.toFixed(2)).join('\n'); const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'volt_ampere_' + Date.now() + '.csv'; a.click(); URL.revokeObjectURL(url) }

  // ═══════════════════════════════════════════
  //  交互
  // ═══════════════════════════════════════════
  const getPos = (e) => { const r = canvasRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return; const el = canvasRef.current; if (!el) return; const { x, y } = getPos(e)

    // ── Tab1 ──
    if (tabRef.current === 1) {
      const s = demo.current
      // 滑线变阻器箭头拖拽
      const ratio = s.sliderR / 50, baseX = s._rheoX - 24 + ratio * 48, baseY = s._topY - 10
      if (Math.abs(x - baseX) < 20 && Math.abs(y - baseY) < 20) { s.rheoDragging = true; s.rheoDragOffX = x - baseX; return }
      for (const a of el._clickAreas || []) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(); return } }
      return
    }

    // ── Tab2 ──
    const s = diy.current
    // 器材栏拖拽
    for (const a of el._palAreas || []) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { if (a.type) { saveUndo(s); const id = s.nextId++; s.components.push({ id, type: a.type, x, y, closed: a.type === 'switch' ? false : undefined }); s.dragId = id; s.dragOffX = 0; s.dragOffY = 0; forceUpdate(n => n + 1); return } } }
    // 导线铆点拖拽
    for (const wire of s.wires) {
      const fc = s.components.find(c => c.id === wire.from.compId), tc = s.components.find(c => c.id === wire.to.compId)
      if (!fc || !tc) continue; const f = termPos(fc, wire.from.termIdx), t = termPos(tc, wire.to.termIdx), ddx = t.x - f.x, ddy = t.y - f.y
      const m1x = wire.mid1X != null ? wire.mid1X : f.x + ddx * 0.33, m1y = wire.mid1Y != null ? wire.mid1Y : f.y + ddy * 0.33
      const m2x = wire.mid2X != null ? wire.mid2X : f.x + ddx * 0.67, m2y = wire.mid2Y != null ? wire.mid2Y : f.y + ddy * 0.67
      if ((x - m1x) ** 2 + (y - m1y) ** 2 < 144) { s.dragId = 'wire_' + wire.id + '_1'; forceUpdate(n => n + 1); return }
      if ((x - m2x) ** 2 + (y - m2y) ** 2 < 144) { s.dragId = 'wire_' + wire.id + '_2'; forceUpdate(n => n + 1); return }
    }
    // 滑线变阻器滑块拖拽
    for (const comp of s.components) {
      if (comp.type === 'rheostat') {
        const sliderX = comp.x + (-30 + s.sliderR / 50 * 60)
        const sliderY = comp.y - 18
        if (Math.abs(x - sliderX) < 15 && Math.abs(y - sliderY) < 15) {
          s.dragId = 'rheo_' + comp.id; forceUpdate(n => n + 1); return
        }
      }
    }
    // 接线柱连线
    const term = findTerm(x, y)
    if (term) {
      if (s.connecting) {
        if (term.compId !== s.connecting.compId || term.termIdx !== s.connecting.termIdx) {
          const dup = s.wires.some(w => (w.from.compId === s.connecting.compId && w.from.termIdx === s.connecting.termIdx && w.to.compId === term.compId && w.to.termIdx === term.termIdx) || (w.to.compId === s.connecting.compId && w.to.termIdx === s.connecting.termIdx && w.from.compId === term.compId && w.from.termIdx === term.termIdx))
          if (!dup) { saveUndo(s); s.wires.push({ id: s.nextId++, from: { ...s.connecting }, to: term }) }
        }
        s.connecting = null; s.hoverTerm = null
      } else { s.connecting = { ...term, mx: x, my: y } }
      forceUpdate(n => n + 1); return
    }
    // 器材拖拽
    const comp = findComp(x, y); if (comp) { s.dragId = comp.id; s.dragOffX = x - comp.x; s.dragOffY = y - comp.y; forceUpdate(n => n + 1) }
  }, [])

  const handleMouseMove = useCallback((e) => {
    const el = canvasRef.current; if (!el) return; const { x, y } = getPos(e)

    // Tab1 滑线变阻器拖拽
    if (tabRef.current === 1) {
      const s = demo.current
      if (s.rheoDragging) {
        const minX = s._rheoX - 24, maxX = s._rheoX + 24
        const newX = Math.max(minX, Math.min(maxX, x - s.rheoDragOffX))
        s.sliderR = Math.round(((newX - minX) / (maxX - minX)) * 50)
        diy.current.sliderR = s.sliderR  // 同步
        forceUpdate(n => n + 1)
      }
      return
    }

    // Tab2
    const s = diy.current
    if (s.dragId) {
      // 导线铆点拖拽
      if (typeof s.dragId === 'string' && s.dragId.startsWith('wire_')) {
        const parts = s.dragId.split('_'), wireId = parseInt(parts[1]), rivetIdx = parseInt(parts[2])
        const wire = s.wires.find(w => w.id === wireId)
        if (wire) { if (rivetIdx === 1) { wire.mid1X = x; wire.mid1Y = y } else { wire.mid2X = x; wire.mid2Y = y }; forceUpdate(n => n + 1) }
        return
      }
      // 滑线变阻器滑块拖拽
      if (typeof s.dragId === 'string' && s.dragId.startsWith('rheo_')) {
        const compId = parseInt(s.dragId.split('_')[1])
        const comp = s.components.find(c => c.id === compId)
        if (comp) {
          const minX = comp.x - 30, maxX = comp.x + 30
          const newX = Math.max(minX, Math.min(maxX, x))
          s.sliderR = Math.round(((newX - minX) / (maxX - minX)) * 50)
          forceUpdate(n => n + 1)
        }
        return
      }
      const c = s.components.find(c => c.id === s.dragId); if (c) { c.x = x - s.dragOffX; c.y = y - s.dragOffY; forceUpdate(n => n + 1) }; return
    }
    if (s.connecting) { s.connecting.mx = x; s.connecting.my = y; const t = findTerm(x, y); s.hoverTerm = t && (t.compId !== s.connecting.compId || t.termIdx !== s.connecting.termIdx) ? t : null; forceUpdate(n => n + 1); return }
    s.hoverTerm = findTerm(x, y); el.style.cursor = s.hoverTerm ? 'crosshair' : findComp(x, y) ? 'grab' : 'default'
  }, [])

  const handleMouseUp = useCallback(() => {
    if (tabRef.current === 1) { demo.current.rheoDragging = false; return }
    const s = diy.current; if (s.dragId) { s.dragId = null; forceUpdate(n => n + 1) }
  }, [])

  const handleContextMenu = useCallback((e) => {
    e.preventDefault()
    if (tabRef.current !== 2) return; const el = canvasRef.current; if (!el) return; const { x, y } = getPos(e), s = diy.current
    // 右键取消连线
    if (s.connecting) { s.connecting = null; s.hoverTerm = null; forceUpdate(n => n + 1); return }
    // 删除器材或导线
    const comp = findComp(x, y)
    if (comp) { saveUndo(s); s.components = s.components.filter(c => c.id !== comp.id); s.wires = s.wires.filter(w => w.from.compId !== comp.id && w.to.compId !== comp.id) }
    else { for (const wire of s.wires) { const fc = s.components.find(c => c.id === wire.from.compId), tc = s.components.find(c => c.id === wire.to.compId); if (!fc || !tc) continue; const f = termPos(fc, wire.from.termIdx), t = termPos(tc, wire.to.termIdx), dx = t.x - f.x, dy = t.y - f.y, len2 = dx * dx + dy * dy; if (len2 === 0) continue; const tp = Math.max(0, Math.min(1, ((x - f.x) * dx + (y - f.y) * dy) / len2)), px = f.x + tp * dx, py = f.y + tp * dy; if ((x - px) ** 2 + (y - py) ** 2 < 100) { saveUndo(s); s.wires = s.wires.filter(w => w.id !== wire.id); break } } }
    forceUpdate(n => n + 1)
  }, [])

  const handleDoubleClick = useCallback((e) => {
    if (tabRef.current !== 2) return; const el = canvasRef.current; if (!el) return; const { x, y } = getPos(e), s = diy.current
    const comp = findComp(x, y)
    if (comp && comp.type === 'switch') { comp.closed = !comp.closed; s.switchClosed = comp.closed; forceUpdate(n => n + 1) }
  }, [])

  const switchTab = useCallback((newTab) => { if (newTab === tabRef.current) return; const old = tabRef.current === 1 ? demo.current : diy.current; old.switchClosed = false; old.data = []; tabRef.current = newTab; setTab(newTab); forceUpdate(n => n + 1) }, [])
  const updateParam = useCallback((key, val) => { demo.current[key] = val; diy.current[key] = val; forceUpdate(n => n + 1) }, [])

  const s_d = demo.current
  return (
    <div style={st.container}>
      <div style={st.topBar}>
        <span style={st.title}>伏安法测定值电阻</span>
        <div style={st.topActions}>
          <button style={tab === 1 ? st.tabA : st.tab} onClick={() => switchTab(1)}>📖 实验演示</button>
          <button style={tab === 2 ? st.tabA : st.tab} onClick={() => switchTab(2)}>🔧 自己动手</button>
          <div style={st.sep} />
          <label style={st.lbl}>电源U：<input type="range" min="1" max="12" step="0.5" value={s_d.U_source} onChange={(e) => updateParam('U_source', parseFloat(e.target.value))} style={st.slider} /><span style={st.val}>{s_d.U_source.toFixed(1)}V</span></label>
          <label style={st.lbl}>灯泡电阻：<input type="range" min="5" max="50" step="1" value={s_d.R_true} onChange={(e) => updateParam('R_true', parseInt(e.target.value))} style={st.slider} /><span style={st.val}>{s_d.R_true}Ω</span></label>
          <label style={st.lbl}>滑动变阻器：<input type="range" min="0" max="50" step="1" value={s_d.sliderR} onChange={(e) => updateParam('sliderR', parseInt(e.target.value))} style={st.slider} /><span style={st.val}>{s_d.sliderR}Ω</span></label>
        </div>
      </div>
      <div style={st.main}><canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onContextMenu={handleContextMenu} onDoubleClick={handleDoubleClick} /></div>
      <div style={st.desc}><b>伏安法测定值电阻</b><span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>{tab === 1 ? '矩形回路 · 拖拽滑线变阻器箭头改变电阻 · 灯泡亮度随电流变化 · 记录数据求R' : '从器材栏拖入 · 接线柱在器材上 · 铆点拉折角 · 右键取消/删除 · 双击开关'}</span></div>
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
