import { useState, useRef, useEffect } from 'react'

/**
 * LorentzForceScene — 洛伦兹力与带电粒子偏转
 *
 * F = qvB（洛伦兹力），圆周运动 F = mv²/r
 * r = mv/qB，T = 2πm/qB，f = qB/2πm
 *
 * Step1: 洛伦兹力方向 — 左手定则，F 始终指向圆心
 * Step2: 回旋半径 — r = mv/qB，调节 v、B、q 观察 r 变化
 * Step3: 回旋周期 — T = 2πm/qB，与速度无关
 */
export default function LorentzForceScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,
    switchClosed: false,
    B: 1.0,
    v: 1e6,
    q: 1,
    mass: 1,
    angle: 0,
    records: [],
    components: [],
    wires: [],
    dragId: null,
    dragOffX: 0, dragOffY: 0,
    connecting: null,
    nextId: 1,
    wireColor: '#F44336',
    _guideOpen: false,
  })

  const [tab, setTab] = useState(1)
  const [, setStep] = useState(1)
  const [, forceUpdate] = useState(0)

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

    let last = performance.now()
    const loop = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05); last = now
      const s = S.current
      const info = lorentzInfo(s)
      if (s.switchClosed) {
        s.angle += (s.v / (info.r || 1)) * dt * 0.0001
      }
      render(R)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function lorentzInfo(s) {
    const Q_ELEM = 1.6e-19
    const M_PROTON = 1.67e-27
    const qVal = s.q * Q_ELEM
    const mVal = s.mass * M_PROTON
    const r = mVal * s.v / (qVal * s.B)
    const T = 2 * Math.PI * mVal / (qVal * s.B)
    const f = 1 / T
    const F = qVal * s.v * s.B
    return { r, T, f, F, qVal, mVal }
  }

  function render(R) {
    try {
      const ctx = R.ctx, W = R.W, H = R.H
      ctx.clearRect(0, 0, W, H)
      canvasRef.current._clickAreas = []
      canvasRef.current._palAreas = []
      if (S.current.tab === 1) renderDemo(ctx, W, H)
      else renderBuilder(ctx, W, H)
    } catch (e) { console.error('render error:', e) }
  }

  function renderDemo(ctx, W, H) {
    const s = S.current
    const info = lorentzInfo(s)

    const labels = ['① 洛伦兹力方向', '② 回旋半径 r', '③ 回旋周期 T']
    const bw = 115, bh = 28, gap = 8
    const totalW = bw * 3 + gap * 2
    const bx0 = (W - totalW) / 2
    for (let i = 0; i < 3; i++) {
      const x = bx0 + i * (bw + gap), y = 10
      ctx.fillStyle = s.step === i + 1 ? '#FF9800' : '#fff'
      ctx.strokeStyle = s.step === i + 1 ? '#E65100' : '#999'
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.roundRect(x, y, bw, bh, 6); ctx.fill(); ctx.stroke()
      ctx.fillStyle = s.step === i + 1 ? '#fff' : '#555'
      ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(labels[i], x + bw / 2, y + bh / 2)
      canvasRef.current._clickAreas.push({ x: x - 3, y: y - 3, w: bw + 6, h: bh + 6, onClick: () => {
        S.current.step = i + 1; S.current.records = []; S.current.angle = 0
        setStep(i + 1); forceUpdate(n => n + 1)
      } })
    }
    ctx.textBaseline = 'alphabetic'

    const subs = { 1: '带电粒子垂直进入匀强磁场，洛伦兹力 F=qvB 提供向心力', 2: 'r = mv/qB，调节 v、B、q 观察回旋半径变化', 3: 'T = 2πm/qB，周期与速度无关，只与 m、q、B 有关' }
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(subs[s.step], W / 2, 52)
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('🎯 实验目的：理解洛伦兹力的大小和方向，掌握 r=mv/qB、T=2πm/qB', W / 2, 70)

    // 主视觉
    const cx = W * 0.30, cy = H * 0.48
    drawParticleField(ctx, cx, cy, s, info)

    // 底部参数
    const barY = H - 26
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillStyle = '#1565C0'; ctx.fillText(`B=${s.B.toFixed(1)}T`, 55, barY)
    drawMiniSlider(ctx, 100, barY, 60, (s.B - 0.1) / 4.9, (r) => { S.current.B = Math.round((0.1 + r * 4.9) * 10) / 10; forceUpdate(n => n + 1) })
    ctx.fillStyle = '#4CAF50'; ctx.fillText(`v=${(s.v / 1e6).toFixed(1)}×10⁶`, 175, barY)
    drawMiniSlider(ctx, 235, barY, 60, (s.v - 5e5) / 1.5e6, (r) => { S.current.v = Math.round(5e5 + r * 1.5e6); forceUpdate(n => n + 1) })
    ctx.fillStyle = s.q >= 0 ? '#E53935' : '#1565C0'; ctx.fillText(`q=${s.q}e`, 310, barY)
    drawMiniSlider(ctx, 345, barY, 50, (s.q - 1) / 9, (r) => { S.current.q = Math.round(1 + r * 9); forceUpdate(n => n + 1) })
    ctx.fillStyle = '#FF6F00'; ctx.fillText(`m=${s.mass}mp`, 410, barY)
    drawMiniSlider(ctx, 455, barY, 50, (s.mass - 1) / 39, (r) => { S.current.mass = Math.round(1 + r * 39); forceUpdate(n => n + 1) })
    ctx.textBaseline = 'alphabetic'

    drawRightPanel(ctx, W * 0.56, 70, W - W * 0.56 - 25, H - 100, s, info)
  }

  // 粒子+磁场可视化
  function drawParticleField(ctx, cx, cy, s, info) {
    const on = s.switchClosed
    const maxR = Math.min(cx * 0.7, cy * 0.7)

    // 磁场背景（⊗ 向纸内）
    ctx.fillStyle = 'rgba(232,234,246,0.6)'
    ctx.beginPath(); ctx.arc(cx, cy, maxR + 20, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(100,100,200,0.12)'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 6) {
      for (let r2 = 25; r2 < maxR + 15; r2 += 40) {
        ctx.fillText('⊗', cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2)
      }
    }

    // 轨迹圆
    const displayR = Math.min(maxR, Math.max(30, info.r / 1e-10 * 20))
    ctx.strokeStyle = 'rgba(33,150,243,0.3)'; ctx.lineWidth = 1; ctx.setLineDash([5, 5])
    ctx.beginPath(); ctx.arc(cx, cy, displayR, 0, Math.PI * 2); ctx.stroke()
    ctx.setLineDash([])

    // 粒子位置
    const px = cx + Math.cos(s.angle) * displayR
    const py = cy + Math.sin(s.angle) * displayR

    if (on) {
      // 速度方向（切线）
      const tangA = s.angle + Math.PI / 2
      drawArrow(ctx, px, py, px + Math.cos(tangA) * 45, py + Math.sin(tangA) * 45, '#4CAF50', 2.5)
      // 洛伦兹力方向（指向圆心）
      const fA = Math.atan2(cy - py, cx - px)
      drawArrow(ctx, px, py, px + Math.cos(fA) * 38, py + Math.sin(fA) * 38, '#E53935', 3)

      // 标注
      ctx.fillStyle = '#4CAF50'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('v', px + Math.cos(tangA) * 52, py + Math.sin(tangA) * 52)
      ctx.fillStyle = '#E53935'
      ctx.fillText('F', px + Math.cos(fA) * 48, py + Math.sin(fA) * 48)
    }

    // 半径标注
    ctx.strokeStyle = 'rgba(100,100,100,0.3)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke()
    ctx.fillStyle = '#1565C0'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText(`r = ${info.r.toExponential(1)} m`, (cx + px) / 2, (cy + py) / 2 - 8)

    // 粒子
    ctx.fillStyle = s.q >= 0 ? '#E53935' : '#1565C0'
    ctx.beginPath(); ctx.arc(px, py, 10, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(s.q >= 0 ? '+' : '−', px, py)

    // 标注
    ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(`磁场 B=${s.B.toFixed(1)}T（向纸内⊗）`, cx, cy + maxR + 32)
    ctx.fillText(`粒子 ${s.q >= 0 ? '+' : '−'}${s.q}e, m=${s.mass}mp`, cx, cy + maxR + 50)
    ctx.textBaseline = 'alphabetic'
  }

  function drawArrow(ctx, x1, y1, x2, y2, color, lw) {
    ctx.strokeStyle = color; ctx.lineWidth = lw || 2; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    ctx.lineCap = 'butt'
    const a = Math.atan2(y2 - y1, x2 - x1)
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(x2, y2)
    ctx.lineTo(x2 - 8 * Math.cos(a - 0.35), y2 - 8 * Math.sin(a - 0.35))
    ctx.lineTo(x2 - 8 * Math.cos(a + 0.35), y2 - 8 * Math.sin(a + 0.35))
    ctx.closePath(); ctx.fill()
  }

  function drawMiniSlider(ctx, x, y, w, ratio, onChange) {
    ctx.strokeStyle = '#bbb'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke()
    const kx = x + Math.max(0, Math.min(1, ratio)) * w
    ctx.fillStyle = '#FF9800'; ctx.beginPath(); ctx.arc(kx, y, 6, 0, Math.PI * 2); ctx.fill()
    canvasRef.current._clickAreas.push({ x: x - 8, y: y - 14, w: w + 16, h: 28, onClick: (mx) => onChange(Math.max(0, Math.min(1, (mx - x) / w))) })
  }

  function drawRightPanel(ctx, x, y, w, h, s, info) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('🎯 洛伦兹力与带电粒子偏转', x + 12, y + 12)
    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('F = qvB', x + 12, y + 32)
    ctx.fillText('r = mv / qB', x + 12, y + 48)
    ctx.fillText('T = 2πm / qB', x + 12, y + 64)
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444'
    ctx.fillText(`r = ${info.r.toExponential(2)} m`, x + 12, y + 82)
    ctx.fillText(`T = ${info.T.toExponential(2)} s`, x + 12, y + 96)
    ctx.fillText(`f = ${info.f.toExponential(2)} Hz`, x + 12, y + 110)

    let ky = y + 130
    const guideSteps = s.step === 1
      ? ['① 粒子垂直进入匀强磁场', '② 洛伦兹力 F=qvB', '③ 左手定则判断方向', '④ F 指向圆心，做圆周运动']
      : s.step === 2
        ? ['① 调节 v、B 或 q', '② 观察回旋半径 r 变化', '③ r = mv/qB', '④ v↑→r↑，B↑→r↓，q↑→r↓']
        : ['① 调节 B 或 m', '② 观察回旋周期 T', '③ T = 2πm/qB', '④ T 与 v 无关！']
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('📋 操作步骤', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#5D4037'
    for (let i = 0; i < guideSteps.length; i++) ctx.fillText(guideSteps[i], x + 12, ky + i * 12)
    ky += guideSteps.length * 12 + 6

    ctx.fillStyle = '#C62828'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('⚠ 注意事项', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#B71C1C'
    const notes = s.step === 1
      ? ['• 左手定则：磁感线穿掌心，四指→v，拇指→F', '• F 始终垂直于 v，不做功', '• F 改变速度方向，不改变速度大小']
      : s.step === 2
        ? ['• r = mv/qB，质量越大 r 越大', '• q、B 越大，r 越小', '• 回旋加速器原理']
        : ['• T = 2πm/qB，与速度 v 无关', '• 同种粒子在同一磁场中周期相同', '• f = qB/2πm（回旋频率）']
    for (let i = 0; i < notes.length; i++) ctx.fillText(notes[i], x + 12, ky + i * 12)
    ky += notes.length * 12 + 6

    if (s.records.length > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('📊 实验数据', x + 12, ky); ky += 14
      ctx.fillStyle = '#FFB74D'; ctx.fillRect(x + 12, ky, w - 24, 16)
      ctx.fillStyle = '#333'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      const c1 = x + 22, c2 = x + 52, c3 = x + 92, c4 = x + 132
      ctx.fillText('#', c1, ky + 2); ctx.fillText('B(T)', c2, ky + 2); ctx.fillText('v', c3, ky + 2); ctx.fillText('r', c4, ky + 2)
      ky += 14
      for (let i = 0; i < s.records.length; i++) {
        const r = s.records[i]
        if (i % 2 === 0) { ctx.fillStyle = '#FFF8E1'; ctx.fillRect(x + 12, ky, w - 24, 13) }
        ctx.fillStyle = '#333'; ctx.font = '8px monospace'; ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), c1, ky + 1); ctx.fillText(r.B.toFixed(1), c2, ky + 1); ctx.fillText(r.v, c3, ky + 1); ctx.fillText(r.r, c4, ky + 1)
        ky += 13
      }
      ctx.textAlign = 'left'
    }

    const btnY = y + h - 38, btnW = 62, btnH = 24, gap = 6, bx = x + 12
    ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'
    ctx.beginPath(); ctx.roundRect(bx, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('📝 记录', bx + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({ x: bx, y: btnY, w: btnW, h: btnH, onClick: () => {
      const s2 = S.current; const inf = lorentzInfo(s2)
      s2.records.push({ B: s2.B, v: (s2.v / 1e6).toFixed(1), r: inf.r.toExponential(1) })
      forceUpdate(n => n + 1)
    } })
    ctx.fillStyle = '#FF9800'; ctx.strokeStyle = '#E65100'
    ctx.beginPath(); ctx.roundRect(bx + btnW + gap, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.fillText('🗑 清除', bx + btnW + gap + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({ x: bx + btnW + gap, y: btnY, w: btnW, h: btnH, onClick: () => { S.current.records = []; forceUpdate(n => n + 1) } })
    ctx.fillStyle = '#9E9E9E'; ctx.strokeStyle = '#616161'
    ctx.beginPath(); ctx.roundRect(bx + (btnW + gap) * 2, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.fillText('↺ 重置', bx + (btnW + gap) * 2 + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({ x: bx + (btnW + gap) * 2, y: btnY, w: btnW, h: btnH, onClick: () => {
      S.current.B = 1; S.current.v = 1e6; S.current.q = 1; S.current.mass = 1; S.current.angle = 0
      S.current.records = []; S.current.switchClosed = false
      forceUpdate(n => n + 1)
    } })
    ctx.textBaseline = 'alphabetic'
  }

  // Tab2
  function renderBuilder(ctx, W, H) {
    const s = S.current
    const palW = 150, palX = W - palW - 10
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#e0e0e0'
    ctx.beginPath(); ctx.roundRect(10, 10, palX - 25, H - 20, 8); ctx.fill(); ctx.stroke()
    for (const comp of s.components) drawComp(ctx, comp)

    const bx = 22, by = H - 100, bw = palX - 50
    ctx.fillStyle = 'rgba(255,252,240,0.95)'; ctx.strokeStyle = '#ddd'
    ctx.beginPath(); ctx.roundRect(bx, by, bw, s._guideOpen ? 88 : 36, 6); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText('📋 操作说明', bx + 10, by + 18)
    ctx.textAlign = 'right'; ctx.fillText(s._guideOpen ? '收起 ▲' : '展开 ▼', bx + bw - 10, by + 18)
    canvasRef.current._clickAreas.push({ x: bx - 5, y: by - 3, w: bw + 10, h: 42, onClick: () => { s._guideOpen = !s._guideOpen; forceUpdate(n => n + 1) } })
    if (s._guideOpen) { ctx.textAlign = 'left'; ctx.font = '10px sans-serif'; ['① 拖入粒子到画布', '② 观察洛伦兹力偏转', '③ 右键删除'].forEach((l, i) => ctx.fillText(l, bx + 10, by + 40 + i * 15)) }
    ctx.textBaseline = 'alphabetic'
    drawPalette(ctx, palX, 10, palW, H - 20)
  }

  function drawPalette(ctx, x, y, w, h) {
    ctx.fillStyle = '#fafafa'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('器材', x + w / 2, y + 10)
    const items = [{ type: 'posCharge', name: '正电荷 +q' }, { type: 'negCharge', name: '负电荷 -q' }, { type: 'magnet', name: '磁铁（干扰）' }, { type: 'battery', name: '电源（干扰）' }]
    const itemH = 30
    for (let i = 0; i < items.length; i++) {
      const iy = y + 32 + i * (itemH + 3)
      if (iy + itemH > y + h - 40) break
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ccc'
      ctx.beginPath(); ctx.roundRect(x + 6, iy, w - 12, itemH, 5); ctx.fill(); ctx.stroke()
      drawPaletteIcon(ctx, x + 18, iy + itemH / 2, items[i].type)
      ctx.fillStyle = '#333'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText(items[i].name, x + 34, iy + itemH / 2)
      canvasRef.current._palAreas.push({ x: x + 6, y: iy, w: w - 12, h: itemH, type: items[i].type })
    }
    ctx.textBaseline = 'alphabetic'
  }

  function drawPaletteIcon(ctx, x, y, type) {
    ctx.save(); ctx.translate(x, y)
    if (type === 'posCharge') { ctx.fillStyle = '#E53935'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('+', 0, 0) }
    else if (type === 'negCharge') { ctx.fillStyle = '#1565C0'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('−', 0, 0) }
    else if (type === 'magnet') { ctx.fillStyle = '#E53935'; ctx.fillRect(-10, -6, 10, 12); ctx.fillStyle = '#1565C0'; ctx.fillRect(0, -6, 10, 12) }
    else if (type === 'battery') { ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'; ctx.fillRect(-10, -7, 20, 14); ctx.strokeRect(-10, -7, 20, 14) }
    ctx.restore()
  }

  function drawComp(ctx, comp) {
    ctx.save(); ctx.translate(comp.x, comp.y)
    if (comp.type === 'posCharge') { ctx.fillStyle = '#E53935'; ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('+', 0, 0) }
    else if (comp.type === 'negCharge') { ctx.fillStyle = '#1565C0'; ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('−', 0, 0) }
    else if (comp.type === 'magnet') { ctx.fillStyle = '#E53935'; ctx.fillRect(-12, -10, 12, 20); ctx.fillStyle = '#1565C0'; ctx.fillRect(0, -10, 12, 20); ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N', -6, 0); ctx.fillText('S', 6, 0) }
    else if (comp.type === 'battery') { ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'; ctx.beginPath(); ctx.roundRect(-18, -11, 36, 22, 3); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('12V', 0, 3) }
    ctx.restore()
  }

  function getPos(e) { const r = canvasRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
  function handleMouseDown(e) { if (e.button !== 0) return; const s = S.current; const { x, y } = getPos(e); if (s.tab === 1) { for (const a of canvasRef.current._clickAreas) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(x, y); return } } return } for (const a of canvasRef.current._clickAreas || []) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(); return } } for (const a of canvasRef.current._palAreas) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { if (a.type) { s.components.push({ id: s.nextId++, type: a.type, x, y, closed: true, props: {} }); s.dragId = s.nextId - 1; forceUpdate(n => n + 1); return } } } for (const c of s.components) { if (Math.abs(x - c.x) < 25 && Math.abs(y - c.y) < 25) { s.dragId = c.id; s.dragOffX = x - c.x; s.dragOffY = y - c.y; forceUpdate(n => n + 1); return } } }
  function handleMouseMove(e) { const s = S.current; const { x, y } = getPos(e); if (s.dragId == null) return; const c = s.components.find(c => c.id === s.dragId); if (c) { c.x = x - s.dragOffX; c.y = y - s.dragOffY; forceUpdate(n => n + 1) } }
  function handleMouseUp() { S.current.dragId = null }
  function handleDoubleClick() {}
  function handleContextMenu(e) { e.preventDefault(); const s = S.current; const { x, y } = getPos(e); const idx = s.components.findIndex(c => Math.abs(x - c.x) < 25 && Math.abs(y - c.y) < 25); if (idx >= 0) { s.components.splice(idx, 1); forceUpdate(n => n + 1) } }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px', background: '#fff', borderBottom: '1px solid #e0e0e0', alignItems: 'center' }}>
        <button onClick={() => { S.current.tab = 1; setTab(1); forceUpdate(n => n + 1) }} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #ddd', background: tab === 1 ? '#1976D2' : '#fff', color: tab === 1 ? '#fff' : '#333', cursor: 'pointer' }}>📊 实验演示</button>
        <button onClick={() => { S.current.tab = 2; setTab(2); forceUpdate(n => n + 1) }} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #ddd', background: tab === 2 ? '#1976D2' : '#fff', color: tab === 2 ? '#fff' : '#333', cursor: 'pointer' }}>🔧 自己动手</button>
        <button onClick={() => { S.current.B = 1; S.current.v = 1e6; S.current.q = 1; S.current.mass = 1; S.current.angle = 0; S.current.records = []; S.current.switchClosed = false; forceUpdate(n => n + 1) }} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', color: '#666', cursor: 'pointer' }}>↺ 重置</button>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} />
      </div>
    </div>
  )
}