import { useState, useRef, useEffect } from 'react'
import SceneShell from '../ui/SceneShell'

/**
 * AlternatingCurrentScene — 交流电的产生与描述
 *
 * ε = NBAω·sin(ωt)  峰值 εm = NBAω
 * 有效值 ε = εm/√2，f = ω/(2π)
 *
 * Step1: 交流发电原理 — 线圈在磁场中匀速转动产生正弦交流电
 * Step2: 峰值与有效值 — εm = NBAω，有效值 = εm/√2
 * Step3: 频率与周期 — 调节 f 观察波形疏密变化
 */
export default function AlternatingCurrentScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,
    switchClosed: false,
    frequency: 50,
    turns: 10,
    area: 100,
    B: 1.0,
    angle: 0,
    data: [],
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
      if (s.switchClosed) {
        s.angle += s.frequency * 2 * Math.PI * dt
        const omega = s.frequency * 2 * Math.PI
        const peakE = s.turns * s.B * s.area * 1e-4 * omega
        const emf = peakE * Math.sin(s.angle)
        const maxPoints = 300
        if (s.data.length < maxPoints) s.data.push(emf)
        else { s.data.shift(); s.data.push(emf) }
      }
      render(R)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function acInfo(s) {
    const omega = s.frequency * 2 * Math.PI
    const peakE = s.turns * s.B * s.area * 1e-4 * omega
    const rmsE = peakE / Math.sqrt(2)
    const emf = s.switchClosed ? peakE * Math.sin(s.angle) : 0
    const period = 1000 / s.frequency
    return { omega, peakE, rmsE, emf, period }
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
    const info = acInfo(s)

    const labels = ['① 发电原理', '② 峰值与有效值', '③ 频率与周期']
    const bw = 120, bh = 28, gap = 8
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
        S.current.step = i + 1; S.current.data = []; S.current.switchClosed = false
        setStep(i + 1); forceUpdate(n => n + 1)
      } })
    }
    ctx.textBaseline = 'alphabetic'

    const subs = { 1: '线圈在磁场中匀速转动，产生正弦交流电 ε = NBAω·sin(ωt)', 2: 'εm = NBAω 为峰值，有效值 = εm/√2', 3: '调节频率 f，观察波形疏密变化，f 越大周期越短' }
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(subs[s.step], W / 2, 52)
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('🎯 实验目的：理解交流电产生原理，掌握 εm=NBAω、有效值、频率与周期', W / 2, 70)

    // 发电机示意图
    drawGenerator(ctx, W * 0.12, H * 0.42, s, info)

    // 波形图
    const gx = W * 0.32, gy = 80, gw = W * 0.64, gh = H * 0.42
    drawWaveform(ctx, gx, gy, gw, gh, s, info)

    // 底部参数
    const barY = H - 26
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillStyle = '#E53935'; ctx.fillText(`f=${s.frequency}Hz`, 55, barY)
    drawMiniSlider(ctx, 105, barY, 70, (s.frequency - 10) / 190, (r) => { S.current.frequency = Math.round(10 + r * 190); S.current.data = []; forceUpdate(n => n + 1) })
    ctx.fillStyle = '#1565C0'; ctx.fillText(`N=${s.turns}`, 190, barY)
    drawMiniSlider(ctx, 225, barY, 60, (s.turns - 1) / 49, (r) => { S.current.turns = Math.round(1 + r * 49); S.current.data = []; forceUpdate(n => n + 1) })
    ctx.fillStyle = '#2E7D32'; ctx.fillText(`B=${s.B.toFixed(1)}T`, 300, barY)
    drawMiniSlider(ctx, 345, barY, 60, (s.B - 0.1) / 2.9, (r) => { S.current.B = Math.round((0.1 + r * 2.9) * 10) / 10; S.current.data = []; forceUpdate(n => n + 1) })
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`εm=${info.peakE.toFixed(1)}V`, 420, barY)
    ctx.fillStyle = '#9C27B0'
    ctx.fillText(`ε有效=${info.rmsE.toFixed(1)}V`, 510, barY)
    ctx.textBaseline = 'alphabetic'

    drawRightPanel(ctx, W * 0.56, H * 0.55, W - W * 0.56 - 25, H - H * 0.55 - 35, s, info)
  }

  // 发电机示意
  function drawGenerator(ctx, cx, cy, s, info) {
    const on = s.switchClosed
    // 磁铁
    ctx.fillStyle = '#E53935'
    ctx.fillRect(cx - 55, cy - 80, 18, 160)
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('N', cx - 46, cy)
    ctx.fillStyle = '#1565C0'
    ctx.fillRect(cx + 37, cy - 80, 18, 160)
    ctx.fillStyle = '#fff'; ctx.fillText('S', cx + 46, cy)

    // 磁感线
    ctx.strokeStyle = 'rgba(100,100,200,0.15)'; ctx.lineWidth = 1
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(cx - 37, cy + i * 30); ctx.lineTo(cx + 37, cy + i * 30); ctx.stroke()
    }

    // 线圈（旋转）
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(s.angle)
    ctx.strokeStyle = '#E65100'; ctx.lineWidth = 3
    ctx.strokeRect(-14, -45, 28, 90)
    ctx.fillStyle = '#666'
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill()
    ctx.restore()

    // 滑环
    ctx.fillStyle = '#888'
    ctx.beginPath(); ctx.arc(cx, cy - 50, 5, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(cx, cy + 50, 5, 0, Math.PI * 2); ctx.fill()

    // 标注
    ctx.fillStyle = '#5D4037'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('线圈匀速转动', cx, cy + 105)
    if (on) {
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 11px sans-serif'
      ctx.fillText(`ε = ${info.emf.toFixed(1)}V`, cx, cy + 120)
    }
    ctx.textBaseline = 'alphabetic'
  }

  // 波形图
  function drawWaveform(ctx, gx, gy, gw, gh, s, info) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ddd'
    ctx.beginPath(); ctx.roundRect(gx - 5, gy - 5, gw + 10, gh + 10, 6); ctx.fill(); ctx.stroke()

    const margin = { top: 20, right: 15, bottom: 30, left: 40 }
    const pw = gw - margin.left - margin.right
    const ph = gh - margin.top - margin.bottom
    const ox = gx + margin.left, oy = gy + margin.top

    // 中线
    ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(ox, oy + ph / 2); ctx.lineTo(ox + pw, oy + ph / 2); ctx.stroke()
    ctx.strokeStyle = '#999'
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, oy + ph); ctx.stroke()

    // 轴标签
    ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('t (ms)', ox + pw / 2, gy + gh - 5)
    ctx.save(); ctx.translate(gx + 8, oy + ph / 2); ctx.rotate(-Math.PI / 2)
    ctx.fillText('ε (V)', 0, 0); ctx.restore()

    // 波形
    const maxV = Math.max(info.peakE, 1)
    const toY = v => oy + ph / 2 - (v / maxV) * (ph / 2 * 0.85)

    if (s.data.length > 1) {
      ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2; ctx.beginPath()
      for (let i = 0; i < s.data.length; i++) {
        const x = ox + (i / s.data.length) * pw
        const y = toY(s.data[i])
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }

    // 峰值线（虚线）
    ctx.strokeStyle = 'rgba(229,57,53,0.3)'; ctx.lineWidth = 1; ctx.setLineDash([4, 3])
    ctx.beginPath(); ctx.moveTo(ox, toY(info.peakE)); ctx.lineTo(ox + pw, toY(info.peakE)); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(ox, toY(-info.peakE)); ctx.lineTo(ox + pw, toY(-info.peakE)); ctx.stroke()
    // 有效值线（绿色虚线）
    ctx.strokeStyle = 'rgba(76,175,80,0.4)'
    ctx.beginPath(); ctx.moveTo(ox, toY(info.rmsE)); ctx.lineTo(ox + pw, toY(info.rmsE)); ctx.stroke()
    ctx.setLineDash([])

    // 标注
    ctx.fillStyle = '#E53935'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText(`εm = ${info.peakE.toFixed(1)}V`, ox + pw - 100, toY(info.peakE) - 6)
    ctx.fillStyle = '#4CAF50'
    ctx.fillText(`ε有效 = ${info.rmsE.toFixed(1)}V`, ox + pw - 100, toY(info.rmsE) - 6)

    // 公式
    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('ε = NBAω·sin(ωt)', ox + 6, oy + 12)
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444'
    ctx.fillText(`ω = 2πf = ${info.omega.toFixed(1)} rad/s`, ox + 6, oy + 28)
    ctx.fillText(`T = 1/f = ${info.period.toFixed(1)} ms`, ox + 6, oy + 42)
    ctx.fillText(`f = ${s.frequency} Hz`, ox + 6, oy + 56)
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
    ctx.fillText('🎯 交流电的产生与描述', x + 12, y + 12)
    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('ε = NBAω·sin(ωt)', x + 12, y + 32)
    ctx.fillText('εm = NBAω', x + 12, y + 48)
    ctx.fillText('ε有效 = εm / √2', x + 12, y + 64)
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444'
    ctx.fillText(`εm = ${info.peakE.toFixed(2)}V  ε有效 = ${info.rmsE.toFixed(2)}V`, x + 12, y + 80)
    ctx.fillText(`f = ${s.frequency}Hz  T = ${info.period.toFixed(1)}ms`, x + 12, y + 94)

    let ky = y + 112
    const guideSteps = s.step === 1
      ? ['① 闭合开关，线圈转动', '② 线圈切割磁感线', '③ 产生正弦交流电', '④ 电流方向周期性变化']
      : s.step === 2
        ? ['① εm = NBAω（峰值）', '② ε有效 = εm/√2', '③ N↑→εm↑，B↑→εm↑', '④ 记录数据验证正比关系']
        : ['① 调节频率 f', '② 波形疏密随 f 变化', '③ T = 1/f', '④ f 越大周期越短']
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('📋 操作步骤', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#5D4037'
    for (let i = 0; i < guideSteps.length; i++) ctx.fillText(guideSteps[i], x + 12, ky + i * 12)
    ky += guideSteps.length * 12 + 6

    ctx.fillStyle = '#C62828'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('⚠ 注意事项', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#B71C1C'
    const notes = s.step === 1
      ? ['• 线圈匀速转动产生正弦交流电', '• 每转一圈电流方向改变两次', '• 滑环+电刷引出交流电']
      : s.step === 2
        ? ['• εm = NBAω，与 N、B、A、ω 成正比', '• 有效值 = 峰值/√2 ≈ 0.707εm', '• 家用 220V 是有效值']
        : ['• f 越大，波形越密', '• T = 1/f，周期与频率成反比', '• 我国市电 f = 50Hz，T = 20ms']
    for (let i = 0; i < notes.length; i++) ctx.fillText(notes[i], x + 12, ky + i * 12)
    ky += notes.length * 12 + 6

    if (s.records.length > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('📊 实验数据', x + 12, ky); ky += 14
      ctx.fillStyle = '#FFB74D'; ctx.fillRect(x + 12, ky, w - 24, 16)
      ctx.fillStyle = '#333'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      const c1 = x + 26, c2 = x + 55, c3 = x + 95, c4 = x + 155
      ctx.fillText('#', c1, ky + 2); ctx.fillText('f', c2, ky + 2); ctx.fillText('εm', c3, ky + 2); ctx.fillText('ε有效', c4, ky + 2)
      ky += 14
      for (let i = 0; i < s.records.length; i++) {
        const r = s.records[i]
        if (i % 2 === 0) { ctx.fillStyle = '#FFF8E1'; ctx.fillRect(x + 12, ky, w - 24, 13) }
        ctx.fillStyle = '#333'; ctx.font = '9px monospace'; ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), c1, ky + 1); ctx.fillText(String(r.f), c2, ky + 1); ctx.fillText(r.peak.toFixed(1), c3, ky + 1); ctx.fillText(r.rms.toFixed(1), c4, ky + 1)
        ky += 13
      }
      ctx.textAlign = 'left'
    }

    const btnY = y + h - 38, btnW = 62, btnH = 24, gap = 6, bx = x + 12
    ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'
    ctx.beginPath(); ctx.roundRect(bx, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('📝 记录', bx + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({ x: bx, y: btnY, w: btnW, h: btnH, onClick: () => { const s2 = S.current; const inf = acInfo(s2); s2.records.push({ f: s2.frequency, peak: inf.peakE, rms: inf.rmsE }); forceUpdate(n => n + 1) } })
    ctx.fillStyle = '#FF9800'; ctx.strokeStyle = '#E65100'
    ctx.beginPath(); ctx.roundRect(bx + btnW + gap, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.fillText('🗑 清除', bx + btnW + gap + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({ x: bx + btnW + gap, y: btnY, w: btnW, h: btnH, onClick: () => { S.current.records = []; forceUpdate(n => n + 1) } })
    ctx.fillStyle = '#9E9E9E'; ctx.strokeStyle = '#616161'
    ctx.beginPath(); ctx.roundRect(bx + (btnW + gap) * 2, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.fillText('↺ 重置', bx + (btnW + gap) * 2 + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({ x: bx + (btnW + gap) * 2, y: btnY, w: btnW, h: btnH, onClick: () => { S.current.frequency = 50; S.current.turns = 10; S.current.B = 1; S.current.angle = 0; S.current.data = []; S.current.records = []; S.current.switchClosed = false; forceUpdate(n => n + 1) } })
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
    if (s._guideOpen) { ctx.textAlign = 'left'; ctx.font = '10px sans-serif'; ['① 拖入器材到画布', '② 观察交流电产生', '③ 右键删除器材'].forEach((l, i) => ctx.fillText(l, bx + 10, by + 40 + i * 15)) }
    ctx.textBaseline = 'alphabetic'
    drawPalette(ctx, palX, 10, palW, H - 20)
  }

  function drawPalette(ctx, x, y, w, h) {
    ctx.fillStyle = '#fafafa'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('电学器材', x + w / 2, y + 10)
    const items = [{ type: 'coil', name: '线圈（发电机）' }, { type: 'magnet', name: '磁铁 N-S' }, { type: 'switch', name: '开关' }, { type: 'bulb', name: '小灯泡' }, { type: 'ammeter', name: '电流表 A' }, { type: 'battery', name: '电源（干扰）' }, { type: 'resistor', name: '电阻（干扰）' }]
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
    if (type === 'coil') { ctx.strokeStyle = '#E65100'; ctx.lineWidth = 1.5; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-6 + i * 6, 0, 5, 0, Math.PI); ctx.stroke() } }
    else if (type === 'magnet') { ctx.fillStyle = '#E53935'; ctx.fillRect(-10, -6, 10, 12); ctx.fillStyle = '#1565C0'; ctx.fillRect(0, -6, 10, 12) }
    else if (type === 'switch') { ctx.strokeStyle = '#666'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(5, -4); ctx.stroke(); ctx.fillStyle = '#666'; ctx.beginPath(); ctx.arc(-7, 0, 2, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(7, 0, 2, 0, Math.PI * 2); ctx.fill() }
    else if (type === 'bulb') { ctx.fillStyle = '#FFF9C4'; ctx.strokeStyle = '#F9A825'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, -1, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke() }
    else if (type === 'ammeter') { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#E53935'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('A', 0, 2) }
    else if (type === 'battery') { ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'; ctx.fillRect(-10, -7, 20, 14); ctx.strokeRect(-10, -7, 20, 14) }
    else if (type === 'resistor') { ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'; ctx.fillRect(-9, -4, 18, 8); ctx.strokeRect(-9, -4, 18, 8) }
    ctx.restore()
  }

  function drawComp(ctx, comp) {
    ctx.save(); ctx.translate(comp.x, comp.y)
    if (comp.type === 'coil') { ctx.strokeStyle = '#E65100'; ctx.lineWidth = 2; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(-9 + i * 6, 0, 6, 0, Math.PI); ctx.stroke() }; ctx.fillStyle = '#E65100'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('线圈', 0, 10) }
    else if (comp.type === 'magnet') { ctx.fillStyle = '#E53935'; ctx.fillRect(-12, -10, 12, 20); ctx.fillStyle = '#1565C0'; ctx.fillRect(0, -10, 12, 20); ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N', -6, 0); ctx.fillText('S', 6, 0) }
    else if (comp.type === 'switch') { ctx.strokeStyle = comp.closed ? '#4CAF50' : '#F44336'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(10, comp.closed ? 0 : -10); ctx.stroke(); ctx.lineCap = 'butt'; ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(-15, 0, 3, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(15, 0, 3, 0, Math.PI * 2); ctx.fill() }
    else if (comp.type === 'bulb') { ctx.fillStyle = '#FFF9C4'; ctx.strokeStyle = '#F9A825'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke() }
    else if (comp.type === 'ammeter') { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#E53935'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('A', 0, 0) }
    else if (comp.type === 'battery') { ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'; ctx.beginPath(); ctx.roundRect(-18, -11, 36, 22, 3); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('12V', 0, 3) }
    else if (comp.type === 'resistor') { ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(-14, -8, 28, 16, 3); ctx.fill(); ctx.stroke() }
    ctx.restore()
  }

  function getPos(e) { const r = canvasRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
  function handleMouseDown(e) { if (e.button !== 0) return; const s = S.current; const { x, y } = getPos(e); if (s.tab === 1) { for (const a of canvasRef.current._clickAreas) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(x, y); return } } return } for (const a of canvasRef.current._clickAreas || []) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(); return } } for (const a of canvasRef.current._palAreas) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { if (a.type) { s.components.push({ id: s.nextId++, type: a.type, x, y, closed: a.type === 'switch' ? false : true, props: {} }); s.dragId = s.nextId - 1; forceUpdate(n => n + 1); return } } } for (const c of s.components) { if (Math.abs(x - c.x) < 25 && Math.abs(y - c.y) < 25) { s.dragId = c.id; s.dragOffX = x - c.x; s.dragOffY = y - c.y; forceUpdate(n => n + 1); return } } }
  function handleMouseMove(e) { const s = S.current; const { x, y } = getPos(e); if (s.dragId == null) return; const c = s.components.find(c => c.id === s.dragId); if (c) { c.x = x - s.dragOffX; c.y = y - s.dragOffY; forceUpdate(n => n + 1) } }
  function handleMouseUp() { S.current.dragId = null }
  function handleDoubleClick(e) { const s = S.current; const { x, y } = getPos(e); const c = s.components.find(c => Math.abs(x - c.x) < 25 && Math.abs(y - c.y) < 25 && c.type === 'switch'); if (c) { c.closed = !c.closed; forceUpdate(n => n + 1) } }
  function handleContextMenu(e) { e.preventDefault(); const s = S.current; const { x, y } = getPos(e); const idx = s.components.findIndex(c => Math.abs(x - c.x) < 25 && Math.abs(y - c.y) < 25); if (idx >= 0) { s.components.splice(idx, 1); forceUpdate(n => n + 1) } }

  return (
    <SceneShell
      title="交流电的产生与描述"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t); forceUpdate(n => n + 1) }}
      tab1Label="📊 实验演示"
      tab2Label="🔧 自己动手"
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} />
    </SceneShell>
  )
}
