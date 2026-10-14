import { useState, useRef, useEffect } from 'react'

/**
 * ElectricPotentialScene — 电势与电势差
 *
 * V = kQ/r（标量，可叠加）
 * ΔV = V_A - V_B，W = qΔV
 * 等势面⊥电场线
 *
 * Step1: 点电荷电势 — V=kQ/r，正电荷V>0，负电荷V<0
 * Step2: 等势面 — 同一等势面上V相等，等势面⊥电场线
 * Step3: 电势差与做功 — W=qΔV，正电荷从高V到低V做正功
 */
export default function ElectricPotentialScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,
    switchClosed: false,
    Q1: 5,
    Q2: -5,
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

  // 电势计算
  function calcV(x, y, cx1, cy1, cx2, cy2, Q1, Q2) {
    const k = 9
    const r1 = Math.hypot(x - cx1, y - cy1) || 1
    const r2 = Math.hypot(x - cx2, y - cy2) || 1
    return k * Q1 / r1 + k * Q2 / r2
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

    // 顶部步骤
    const labels = ['① 点电荷电势', '② 等势面', '③ 电势差做功']
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
      canvasRef.current._clickAreas.push({ x: x - 3, y: y - 3, w: bw + 6, h: bh + 6, onClick: () => { S.current.step = i + 1; S.current.records = []; setStep(i + 1); forceUpdate(n => n + 1) } })
    }
    ctx.textBaseline = 'alphabetic'

    const subs = { 1: 'V=kQ/r，正电荷V>0，负电荷V<0，电势是标量可叠加', 2: '同一等势面上V相等，等势面⊥电场线', 3: 'W=qΔV，正电荷从高V到低V电场力做正功' }
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(subs[s.step], W / 2, 52)
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('🎯 实验目的：理解电势的物理意义，掌握 V=kQ/r、W=qΔV', W / 2, 70)

    // 主视觉
    const cx = W * 0.30, cy = H * 0.48
    const cx1 = cx - 100, cx2 = cx + 100, cy1 = cy, cy2 = cy
    const maxR = Math.min(W * 0.26, H * 0.30)

    drawEquipotential(ctx, cx1, cy1, cx2, cy2, maxR, s)
    drawCharges(ctx, cx1, cy1, cx2, cy2, s)

    // 右侧面板
    drawRightPanel(ctx, W * 0.56, 70, W - W * 0.56 - 25, H - 100, s, cx1, cy1, cx2, cy2)

    // 底部参数
    const barY = H - 26
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillStyle = s.Q1 >= 0 ? '#E53935' : '#1565C0'
    ctx.fillText(`Q₁=${s.Q1 > 0 ? '+' : ''}${s.Q1}`, 55, barY)
    drawMiniSlider(ctx, 100, barY, 70, (s.Q1 + 10) / 20, (r) => { S.current.Q1 = Math.round(-10 + r * 20); forceUpdate(n => n + 1) })
    ctx.fillStyle = s.Q2 >= 0 ? '#E53935' : '#1565C0'
    ctx.fillText(`Q₂=${s.Q2 > 0 ? '+' : ''}${s.Q2}`, 185, barY)
    drawMiniSlider(ctx, 230, barY, 70, (s.Q2 + 10) / 20, (r) => { S.current.Q2 = Math.round(-10 + r * 20); forceUpdate(n => n + 1) })
    ctx.textBaseline = 'alphabetic'
  }

  // 等势面可视化
  function drawEquipotential(ctx, cx1, cy1, cx2, cy2, maxR, s) {
    const levels = [-3, -2, -1, -0.5, 0, 0.5, 1, 2, 3]
    const colors = ['#0D47A1', '#1565C0', '#1E88E5', '#64B5F6', '#4CAF50', '#FFB74D', '#FF9800', '#E53935', '#B71C1C']

    const step = 5
    const W = ctx.canvas.width / devicePixelRatio
    const H = ctx.canvas.height / devicePixelRatio
    for (let li = 0; li < levels.length; li++) {
      ctx.fillStyle = colors[li]; ctx.globalAlpha = 0.3
      for (let x = 0; x < W; x += step) {
        for (let y = 0; y < H; y += step) {
          const v = calcV(x, y, cx1, cy1, cx2, cy2, s.Q1, s.Q2)
          const vR = calcV(x + step, y, cx1, cy1, cx2, cy2, s.Q1, s.Q2)
          const vD = calcV(x, y + step, cx1, cy1, cx2, cy2, s.Q1, s.Q2)
          if ((v - levels[li]) * (vR - levels[li]) < 0 || (v - levels[li]) * (vD - levels[li]) < 0) {
            ctx.fillRect(x, y, 2, 2)
          }
        }
      }
    }
    ctx.globalAlpha = 1

    // 0势线高亮
    ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 2; ctx.setLineDash([6, 4])
    for (let x = 0; x < W; x += step) {
      for (let y = 0; y < H; y += step) {
        const v = calcV(x, y, cx1, cy1, cx2, cy2, s.Q1, s.Q2)
        const vR = calcV(x + step, y, cx1, cy1, cx2, cy2, s.Q1, s.Q2)
        const vD = calcV(x, y + step, cx1, cy1, cx2, cy2, s.Q1, s.Q2)
        if ((v * vR < 0) || (v * vD < 0)) {
          ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.stroke()
        }
      }
    }
    ctx.setLineDash([])

    // 标注
    ctx.fillStyle = '#4CAF50'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('绿色虚线：V=0 等势面', 10, 10)
    ctx.fillStyle = '#1565C0'; ctx.fillText('蓝色区域：V<0（负电荷附近）', 10, 26)
    ctx.fillStyle = '#E53935'; ctx.fillText('红色区域：V>0（正电荷附近）', 10, 42)
    ctx.textBaseline = 'alphabetic'
  }

  function drawCharges(ctx, cx1, cy1, cx2, cy2, s) {
    // Q1
    ctx.fillStyle = s.Q1 >= 0 ? '#E53935' : '#1565C0'
    ctx.beginPath(); ctx.arc(cx1, cy1, 20, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(s.Q1 >= 0 ? '+' : '−', cx1, cy1)
    ctx.fillStyle = '#333'; ctx.font = '11px sans-serif'; ctx.textBaseline = 'top'
    ctx.fillText(`Q₁=${s.Q1 > 0 ? '+' : ''}${s.Q1}`, cx1, cy1 + 24)
    // Q2
    ctx.fillStyle = s.Q2 >= 0 ? '#E53935' : '#1565C0'
    ctx.beginPath(); ctx.arc(cx2, cy2, 20, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(s.Q2 >= 0 ? '+' : '−', cx2, cy2)
    ctx.fillStyle = '#333'; ctx.font = '11px sans-serif'; ctx.textBaseline = 'top'
    ctx.fillText(`Q₂=${s.Q2 > 0 ? '+' : ''}${s.Q2}`, cx2, cy2 + 24)
    ctx.textBaseline = 'alphabetic'
  }

  function drawMiniSlider(ctx, x, y, w, ratio, onChange) {
    ctx.strokeStyle = '#bbb'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke()
    const kx = x + Math.max(0, Math.min(1, ratio)) * w
    ctx.fillStyle = '#FF9800'; ctx.beginPath(); ctx.arc(kx, y, 6, 0, Math.PI * 2); ctx.fill()
    canvasRef.current._clickAreas.push({ x: x - 8, y: y - 14, w: w + 16, h: 28, onClick: (mx) => onChange(Math.max(0, Math.min(1, (mx - x) / w))) })
  }

  function drawRightPanel(ctx, x, y, w, h, s, cx1, cy1, cx2, cy2) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('🎯 电势与电势差', x + 12, y + 12)

    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('V = kQ/r  (标量)', x + 12, y + 32)
    ctx.fillText('W = qΔV = q(V_A−V_B)', x + 12, y + 48)
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444'
    const V1 = calcV(cx1 + 30, cy1, cx1, cy1, cx2, cy2, s.Q1, s.Q2)
    const V2 = calcV(cx2 - 30, cy2, cx1, cy1, cx2, cy2, s.Q1, s.Q2)
    ctx.fillText(`V_A(近Q₁) ≈ ${V1.toFixed(1)}`, x + 12, y + 66)
    ctx.fillText(`V_B(近Q₂) ≈ ${V2.toFixed(1)}`, x + 12, y + 80)
    ctx.fillText(`ΔV = V_A − V_B = ${(V1 - V2).toFixed(1)}`, x + 12, y + 94)

    let ky = y + 116
    const guideSteps = s.step === 1
      ? ['① V=kQ/r，距电荷越近V越大', '② 正电荷V>0，负电荷V<0', '③ 电势是标量，多个电荷可叠加']
      : s.step === 2
        ? ['① 同一等势面上V相等', '② 等势面⊥电场线', '③ 0势面在两电荷中间']
        : ['① W = qΔV', '② 正电荷：高V→低V 做正功', '③ 负电荷：低V→高V 做正功']
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('📋 操作步骤', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#5D4037'
    for (let i = 0; i < guideSteps.length; i++) ctx.fillText(guideSteps[i], x + 12, ky + i * 12)
    ky += guideSteps.length * 12 + 6

    ctx.fillStyle = '#C62828'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('⚠ 注意事项', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#B71C1C'
    const notes = s.step === 1
      ? ['• V 是标量，有正负但无方向', '• 电势零点可选（通常取无穷远）', '• V 叠加：V = V₁ + V₂']
      : s.step === 2
        ? ['• 等势面与电场线处处正交', '• 同一等势面上移动电荷不做功', '• 等势面越密，场强越大']
        : ['• W=qΔV，q 带符号', '• 正电荷从高V到低V：W>0', '• 电势能 Ep = qV']
    for (let i = 0; i < notes.length; i++) ctx.fillText(notes[i], x + 12, ky + i * 12)
    ky += notes.length * 12 + 6

    if (s.records.length > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('📊 实验数据', x + 12, ky); ky += 14
      ctx.fillStyle = '#FFB74D'; ctx.fillRect(x + 12, ky, w - 24, 16)
      ctx.fillStyle = '#333'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      const c1 = x + 26, c2 = x + 60, c3 = x + 95, c4 = x + 140
      ctx.fillText('#', c1, ky + 2); ctx.fillText('Q₁', c2, ky + 2); ctx.fillText('Q₂', c3, ky + 2); ctx.fillText('ΔV', c4, ky + 2)
      ky += 14
      for (let i = 0; i < s.records.length; i++) {
        const r = s.records[i]
        if (i % 2 === 0) { ctx.fillStyle = '#FFF8E1'; ctx.fillRect(x + 12, ky, w - 24, 13) }
        ctx.fillStyle = '#333'; ctx.font = '9px monospace'; ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), c1, ky + 1); ctx.fillText(String(r.Q1), c2, ky + 1); ctx.fillText(String(r.Q2), c3, ky + 1); ctx.fillText(r.dV.toFixed(1), c4, ky + 1)
        ky += 13
      }
      ctx.textAlign = 'left'
    }

    const btnY = y + h - 38, btnW = 62, btnH = 24, gap2 = 6, bx = x + 12
    ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'
    ctx.beginPath(); ctx.roundRect(bx, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('📝 记录', bx + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({ x: bx, y: btnY, w: btnW, h: btnH, onClick: () => { const s2 = S.current; const v1 = calcV(cx1 + 30, cy1, cx1, cy1, cx2, cy2, s2.Q1, s2.Q2); const v2 = calcV(cx2 - 30, cy2, cx1, cy1, cx2, cy2, s2.Q1, s2.Q2); s2.records.push({ Q1: s2.Q1, Q2: s2.Q2, dV: v1 - v2 }); forceUpdate(n => n + 1) } })
    ctx.fillStyle = '#FF9800'; ctx.strokeStyle = '#E65100'
    ctx.beginPath(); ctx.roundRect(bx + btnW + gap2, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.fillText('🗑 清除', bx + btnW + gap2 + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({ x: bx + btnW + gap2, y: btnY, w: btnW, h: btnH, onClick: () => { S.current.records = []; forceUpdate(n => n + 1) } })
    ctx.fillStyle = '#9E9E9E'; ctx.strokeStyle = '#616161'
    ctx.beginPath(); ctx.roundRect(bx + (btnW + gap2) * 2, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.fillText('↺ 重置', bx + (btnW + gap2) * 2 + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({ x: bx + (btnW + gap2) * 2, y: btnY, w: btnW, h: btnH, onClick: () => { S.current.Q1 = 5; S.current.Q2 = -5; S.current.records = []; forceUpdate(n => n + 1) } })
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
    if (s._guideOpen) { ctx.textAlign = 'left'; ctx.font = '10px sans-serif'; ['① 拖入电荷到画布', '② 观察等势面变化', '③ 右键删除电荷'].forEach((l, i) => ctx.fillText(l, bx + 10, by + 40 + i * 15)) }
    ctx.textBaseline = 'alphabetic'

    drawPalette(ctx, palX, 10, palW, H - 20)
  }

  function drawPalette(ctx, x, y, w, h) {
    ctx.fillStyle = '#fafafa'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('电学器材', x + w / 2, y + 10)
    const items = [{ type: 'posCharge', name: '正电荷 +Q' }, { type: 'negCharge', name: '负电荷 -Q' }]
    const itemH = 30
    for (let i = 0; i < items.length; i++) {
      const iy = y + 32 + i * (itemH + 3)
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
    ctx.restore()
  }

  function drawComp(ctx, comp) {
    ctx.save(); ctx.translate(comp.x, comp.y)
    if (comp.type === 'posCharge') { ctx.fillStyle = '#E53935'; ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('+', 0, 0) }
    else if (comp.type === 'negCharge') { ctx.fillStyle = '#1565C0'; ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('−', 0, 0) }
    ctx.restore()
  }

  // 交互
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
        <button onClick={() => { S.current.Q1 = 5; S.current.Q2 = -5; S.current.records = []; forceUpdate(n => n + 1) }} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', color: '#666', cursor: 'pointer' }}>↺ 重置</button>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} />
      </div>
    </div>
  )
}