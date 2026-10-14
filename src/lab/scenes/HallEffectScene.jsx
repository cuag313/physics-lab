import { useState, useRef, useEffect } from 'react'

/**
 * HallEffectScene — 霍尔效应
 *
 * U_H = IB / (nqd)
 * 载流导体在磁场中产生横向电势差
 *
 * Step1: 霍尔效应原理 — 电流+磁场 → 载流子偏转 → 横向电压
 * Step2: U_H 与 I、B 的关系 — U_H ∝ IB
 * Step3: 载流子类型 — 正/负载流子的霍尔电压方向不同
 */
export default function HallEffectScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,
    switchClosed: false,
    current: 1.0,       // A
    B: 0.5,             // T
    thickness: 1.0,     // mm
    carrier: 1,         // ×10²²/cm³
    carrierType: 'pos', // 'pos' | 'neg'
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

    const loop = () => { render(R); animRef.current = requestAnimationFrame(loop) }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function hallInfo(s) {
    const Q_ELEM = 1.6e-19
    const n = s.carrier * 1e28
    const d = s.thickness * 1e-3
    const UH = s.B * s.current / (n * Q_ELEM * d)
    return { UH_mV: UH * 1000, n, d, Q_ELEM }
  }

  function render(R) {
    try {
      const ctx = R.ctx, W = R.W, H = R.H
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#f0f4f8'; ctx.fillRect(0, 0, W, H)
      canvasRef.current._clickAreas = []
      canvasRef.current._palAreas = []
      if (S.current.tab === 1) renderDemo(ctx, W, H)
      else renderBuilder(ctx, W, H)
    } catch (e) { console.error('render error:', e) }
  }

  function renderDemo(ctx, W, H) {
    const s = S.current
    const info = hallInfo(s)

    const labels = ['① 霍尔效应原理', '② U_H ∝ IB', '③ 载流子类型']
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
        S.current.step = i + 1; S.current.records = []
        if (i === 2) S.current.carrierType = s.carrierType === 'pos' ? 'neg' : 'pos'
        setStep(i + 1); forceUpdate(n => n + 1)
      } })
    }
    ctx.textBaseline = 'alphabetic'

    const subs = { 1: '电流+磁场 → 载流子受洛伦兹力偏转 → 横向电势差（霍尔电压）', 2: '保持 n、d 不变，调节 I 或 B，验证 U_H ∝ IB', 3: '正/负载流子偏转方向不同 → 霍尔电压方向不同' }
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(subs[s.step], W / 2, 52)
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('🎯 实验目的：理解霍尔效应，掌握 U_H=IB/nqd 的定量关系', W / 2, 70)

    // 主视觉
    drawHallPlate(ctx, W * 0.30, H * 0.48, s, info)

    // 底部参数
    const barY = H - 26
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillStyle = '#4CAF50'; ctx.fillText(`I=${s.current.toFixed(1)}A`, 55, barY)
    drawMiniSlider(ctx, 100, barY, 60, (s.current - 0.1) / 4.9, (r) => { S.current.current = Math.round((0.1 + r * 4.9) * 10) / 10; forceUpdate(n => n + 1) })
    ctx.fillStyle = '#9C27B0'; ctx.fillText(`B=${s.B.toFixed(2)}T`, 175, barY)
    drawMiniSlider(ctx, 220, barY, 60, (s.B - 0.05) / 1.95, (r) => { S.current.B = Math.round((0.05 + r * 1.95) * 20) / 20; forceUpdate(n => n + 1) })
    ctx.fillStyle = '#FF6F00'; ctx.fillText(`d=${s.thickness.toFixed(1)}mm`, 295, barY)
    drawMiniSlider(ctx, 345, barY, 55, (s.thickness - 0.1) / 4.9, (r) => { S.current.thickness = Math.round((0.1 + r * 4.9) * 10) / 10; forceUpdate(n => n + 1) })
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`U_H=${info.UH_mV.toFixed(3)}mV`, 415, barY)
    // 载流子类型按钮
    ctx.fillStyle = s.carrierType === 'pos' ? '#E53935' : '#1565C0'
    ctx.beginPath(); ctx.roundRect(520, barY - 13, 80, 26, 5); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(s.carrierType === 'pos' ? '正载流子' : '负载流子', 560, barY)
    canvasRef.current._clickAreas.push({ x: 520, y: barY - 13, w: 80, h: 26, onClick: () => {
      S.current.carrierType = S.current.carrierType === 'pos' ? 'neg' : 'pos'; forceUpdate(n => n + 1)
    } })
    ctx.textBaseline = 'alphabetic'

    drawRightPanel(ctx, W * 0.56, 70, W - W * 0.56 - 25, H - 100, s, info)
  }

  // 霍尔元件主视觉
  function drawHallPlate(ctx, cx, cy, s, info) {
    const pw = 200, ph = 100, pd = 18

    // 3D 霍尔薄片
    ctx.fillStyle = '#E3F2FD'; ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 2
    ctx.fillRect(cx - pw / 2, cy - ph / 2, pw, ph)
    ctx.strokeRect(cx - pw / 2, cy - ph / 2, pw, ph)
    // 侧面
    ctx.fillStyle = '#BBDEFB'
    ctx.beginPath(); ctx.moveTo(cx + pw / 2, cy - ph / 2); ctx.lineTo(cx + pw / 2 + pd, cy - ph / 2 - pd); ctx.lineTo(cx + pw / 2 + pd, cy + ph / 2 - pd); ctx.lineTo(cx + pw / 2, cy + ph / 2); ctx.closePath(); ctx.fill(); ctx.stroke()
    // 顶面
    ctx.fillStyle = '#90CAF9'
    ctx.beginPath(); ctx.moveTo(cx - pw / 2, cy - ph / 2); ctx.lineTo(cx - pw / 2 + pd, cy - ph / 2 - pd); ctx.lineTo(cx + pw / 2 + pd, cy - ph / 2 - pd); ctx.lineTo(cx + pw / 2, cy - ph / 2); ctx.closePath(); ctx.fill(); ctx.stroke()

    // 电流方向 →
    ctx.strokeStyle = '#4CAF50'; ctx.fillStyle = '#4CAF50'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(cx - pw / 2 - 40, cy); ctx.lineTo(cx + pw / 2 + 15, cy); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(cx + pw / 2 + 15, cy); ctx.lineTo(cx + pw / 2 + 7, cy - 6); ctx.lineTo(cx + pw / 2 + 7, cy + 6); ctx.closePath(); ctx.fill()
    ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('I', cx - pw / 2 - 55, cy)

    // 磁场 ⊗
    ctx.fillStyle = 'rgba(156,39,176,0.25)'; ctx.font = '15px sans-serif'
    for (let x = cx - pw / 2 + 25; x < cx + pw / 2; x += 35) {
      for (let y = cy - ph / 2 + 22; y < cy + ph / 2; y += 30) {
        ctx.fillText('⊗', x, y)
      }
    }
    ctx.fillStyle = '#9C27B0'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText('B（向纸内⊗）', cx, cy - ph / 2 - pd - 8)

    // 载流子偏转（红/蓝色小球）
    const dir = s.carrierType === 'pos' ? 1 : -1
    const cColor = s.carrierType === 'pos' ? '#E53935' : '#1565C0'
    ctx.fillStyle = cColor
    for (let i = 0; i < 6; i++) {
      const dx = cx - pw / 2 + 35 + i * (pw - 70) / 5
      const dy = cy + (i % 2 === 0 ? -12 : 12)
      // 偏转方向
      const deflect = dir * 15
      ctx.beginPath(); ctx.arc(dx, dy + deflect, 5, 0, Math.PI * 2); ctx.fill()
      // 偏转箭头
      ctx.strokeStyle = `rgba(33,150,243,0.5)`; ctx.lineWidth = 1.2
      ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx, dy + deflect); ctx.stroke()
    }

    // 载流子积累区（一侧变色）
    if (s.current > 0 && s.B > 0) {
      const accColor = s.carrierType === 'pos' ? 'rgba(229,57,53,0.15)' : 'rgba(21,101,192,0.15)'
      ctx.fillStyle = accColor
      if (dir > 0) ctx.fillRect(cx + pw / 2 - 25, cy - ph / 2, 25, ph)
      else ctx.fillRect(cx - pw / 2, cy - ph / 2, 25, ph)
    }

    // 霍尔电压标注
    const vhY = cy - ph / 2 - 30
    ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(cx - pw / 2 + 10, vhY); ctx.lineTo(cx + pw / 2 - 10, vhY); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(cx - pw / 2 + 10, vhY - 5); ctx.lineTo(cx - pw / 2 + 10, vhY + 5); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(cx + pw / 2 - 10, vhY - 5); ctx.lineTo(cx + pw / 2 - 10, vhY + 5); ctx.stroke()
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText(`U_H = ${info.UH_mV.toFixed(3)} mV`, cx, vhY - 8)

    // 标注
    ctx.fillStyle = '#5D4037'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('霍尔元件（薄片）', cx, cy + ph / 2 + 12)
    ctx.fillStyle = s.carrierType === 'pos' ? '#E53935' : '#1565C0'
    ctx.fillText(s.carrierType === 'pos' ? '正载流子向右偏转' : '负载流子向左偏转', cx, cy + ph / 2 + 28)
    ctx.textBaseline = 'alphabetic'
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
    ctx.fillText('🎯 霍尔效应', x + 12, y + 12)
    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('U_H = IB / (nqd)', x + 12, y + 32)
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444'
    ctx.fillText(`n = ${s.carrier}×10²²/cm³ = ${s.carrier}×10²⁸/m³`, x + 12, y + 50)
    ctx.fillText(`d = ${s.thickness.toFixed(1)} mm`, x + 12, y + 64)
    ctx.fillText(`U_H = ${info.UH_mV.toFixed(3)} mV`, x + 12, y + 78)
    ctx.fillStyle = s.carrierType === 'pos' ? '#E53935' : '#1565C0'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText(s.carrierType === 'pos' ? '正载流子（空穴）' : '负载流子（电子）', x + 12, y + 94)

    let ky = y + 112
    const guideSteps = s.step === 1
      ? ['① 电流 I 通过霍尔元件', '② 磁场 B 垂直于电流', '③ 载流子受洛伦兹力偏转', '④ 产生横向电势差 U_H']
      : s.step === 2
        ? ['① 保持 n、d 不变', '② 调节 I 或 B', '③ 观察 U_H 变化', '④ 结论：U_H ∝ IB']
        : ['① 切换正/负载流子', '② 观察偏转方向变化', '③ 正载流子：积累在一侧', '④ 负载流子：积累在另一侧']
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('📋 操作步骤', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#5D4037'
    for (let i = 0; i < guideSteps.length; i++) ctx.fillText(guideSteps[i], x + 12, ky + i * 12)
    ky += guideSteps.length * 12 + 6

    ctx.fillStyle = '#C62828'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('⚠ 注意事项', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#B71C1C'
    const notes = s.step === 1
      ? ['• 磁场方向必须垂直于电流方向', '• 载流子偏转产生横向电压', '• 霍尔效应可判断载流子类型']
      : s.step === 2
        ? ['• U_H ∝ I × B', '• n 越小（半导体），U_H 越大', '• d 越小，U_H 越大']
        : ['• 正载流子（空穴）向一侧偏转', '• 负载流子（电子）向另一侧偏转', '• 霍尔电压方向 = 判断依据']
    for (let i = 0; i < notes.length; i++) ctx.fillText(notes[i], x + 12, ky + i * 12)
    ky += notes.length * 12 + 6

    if (s.records.length > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('📊 实验数据', x + 12, ky); ky += 14
      ctx.fillStyle = '#FFB74D'; ctx.fillRect(x + 12, ky, w - 24, 16)
      ctx.fillStyle = '#333'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      const c1 = x + 22, c2 = x + 52, c3 = x + 92, c4 = x + 140
      ctx.fillText('#', c1, ky + 2); ctx.fillText('I(A)', c2, ky + 2); ctx.fillText('B(T)', c3, ky + 2); ctx.fillText('U_H(mV)', c4, ky + 2)
      ky += 14
      for (let i = 0; i < s.records.length; i++) {
        const r = s.records[i]
        if (i % 2 === 0) { ctx.fillStyle = '#FFF8E1'; ctx.fillRect(x + 12, ky, w - 24, 13) }
        ctx.fillStyle = '#333'; ctx.font = '9px monospace'; ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), c1, ky + 1); ctx.fillText(r.I.toFixed(1), c2, ky + 1); ctx.fillText(r.B.toFixed(2), c3, ky + 1); ctx.fillText(r.UH.toFixed(3), c4, ky + 1)
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
      const s2 = S.current; const inf = hallInfo(s2)
      s2.records.push({ I: s2.current, B: s2.B, UH: inf.UH_mV })
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
      S.current.current = 1; S.current.B = 0.5; S.current.thickness = 1; S.current.carrier = 1
      S.current.carrierType = 'pos'; S.current.records = []; S.current.switchClosed = false
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
    if (s._guideOpen) { ctx.textAlign = 'left'; ctx.font = '10px sans-serif'; ['① 拖入器材到画布', '② 观察霍尔效应', '③ 右键删除器材'].forEach((l, i) => ctx.fillText(l, bx + 10, by + 40 + i * 15)) }
    ctx.textBaseline = 'alphabetic'
    drawPalette(ctx, palX, 10, palW, H - 20)
  }

  function drawPalette(ctx, x, y, w, h) {
    ctx.fillStyle = '#fafafa'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('电学器材', x + w / 2, y + 10)
    const items = [{ type: 'hallPlate', name: '霍尔元件' }, { type: 'battery', name: '电源' }, { type: 'magnet', name: '磁铁 N-S' }, { type: 'voltmeter', name: '电压表 V' }, { type: 'ammeter', name: '电流表（干扰）' }, { type: 'resistor', name: '电阻（干扰）' }]
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
    if (type === 'hallPlate') { ctx.fillStyle = '#E3F2FD'; ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 1.5; ctx.fillRect(-10, -5, 20, 10); ctx.strokeRect(-10, -5, 20, 10) }
    else if (type === 'battery') { ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'; ctx.fillRect(-10, -7, 20, 14); ctx.strokeRect(-10, -7, 20, 14) }
    else if (type === 'magnet') { ctx.fillStyle = '#E53935'; ctx.fillRect(-10, -6, 10, 12); ctx.fillStyle = '#1565C0'; ctx.fillRect(0, -6, 10, 12) }
    else if (type === 'voltmeter') { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#1565C0'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('V', 0, 2) }
    else if (type === 'ammeter') { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#E53935'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('A', 0, 2) }
    else if (type === 'resistor') { ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'; ctx.fillRect(-9, -4, 18, 8); ctx.strokeRect(-9, -4, 18, 8) }
    ctx.restore()
  }

  function drawComp(ctx, comp) {
    ctx.save(); ctx.translate(comp.x, comp.y)
    if (comp.type === 'hallPlate') {
      ctx.fillStyle = '#E3F2FD'; ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 2
      ctx.fillRect(-22, -12, 44, 24); ctx.strokeRect(-22, -12, 44, 24)
      ctx.fillStyle = '#1565C0'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('霍尔元件', 0, 0)
    } else if (comp.type === 'battery') {
      ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'; ctx.beginPath(); ctx.roundRect(-18, -11, 36, 22, 3); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('6V', 0, 3)
    } else if (comp.type === 'magnet') {
      ctx.fillStyle = '#E53935'; ctx.fillRect(-12, -10, 12, 20); ctx.fillStyle = '#1565C0'; ctx.fillRect(0, -10, 12, 20)
      ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('N', -6, 0); ctx.fillText('S', 6, 0)
    } else if (comp.type === 'voltmeter') {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#1565C0'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('V', 0, 0)
    } else if (comp.type === 'ammeter') {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('A', 0, 0)
    } else if (comp.type === 'resistor') {
      ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.roundRect(-14, -8, 28, 16, 3); ctx.fill(); ctx.stroke()
    }
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
        <button onClick={() => { S.current.current = 1; S.current.B = 0.5; S.current.thickness = 1; S.current.carrier = 1; S.current.carrierType = 'pos'; S.current.records = []; S.current.switchClosed = false; forceUpdate(n => n + 1) }} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', color: '#666', cursor: 'pointer' }}>↺ 重置</button>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} />
      </div>
    </div>
  )
}