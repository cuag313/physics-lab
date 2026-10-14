import { useState, useRef, useEffect } from 'react'

/**
 * FaradayLawScene — 法拉第电磁感应定律
 *
 * ε = N·ΔΦ/Δt = N·A·ΔB/Δt（磁场变化产生感应电动势）
 * ε = BLv（导体切割磁感线）
 *
 * Step1: 基本概念 — 磁通量 Φ=BA，磁通量变化产生感应电动势
 * Step2: ε 与 N、A、ΔB/Δt 的关系 — 控制变量法逐一验证
 * Step3: 综合公式 — 记录数据，验证 ε = NΔΦ/Δt
 */
export default function FaradayLawScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,
    switchClosed: false,
    turns: 10,       // N 匝数
    area: 200,       // A 面积 cm²
    dBdt: 2.0,       // ΔB/Δt 磁通量变化率 T/s
    records: [],
    // Tab2
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

  // 物理量
  function emfInfo(s) {
    const A = s.area * 1e-4   // cm² → m²
    const phi = s.dBdt * A    // ΔΦ/Δt = ΔB/Δt × A
    const emf = s.turns * phi // ε = N × ΔΦ/Δt
    return { A, phi, emf }
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

  // ================================================================
  //  Tab 1：实验演示
  // ================================================================
  function renderDemo(ctx, W, H) {
    const s = S.current
    const on = s.switchClosed
    const info = emfInfo(s)

    // 顶部步骤标签
    const labels = ['① 基本概念', '② 控制变量', '③ 综合验证']
    const bw = 105, bh = 28, gap = 8
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
      canvasRef.current._clickAreas.push({
        x: x - 3, y: y - 3, w: bw + 6, h: bh + 6,
        onClick: () => {
          S.current.step = i + 1; S.current.records = []; S.current.switchClosed = false
          setStep(i + 1); forceUpdate(n => n + 1)
        }
      })
    }
    ctx.textBaseline = 'alphabetic'

    const subs = {
      1: '磁通量 Φ=BA，磁通量变化产生感应电动势 ε=NΔΦ/Δt',
      2: '控制变量法：分别改变 N、A、ΔB/Δt，观察 ε 的变化',
      3: '记录多组数据，验证 ε = N·A·ΔB/Δt',
    }
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(subs[s.step], W / 2, 52)
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('🎯 实验目的：理解法拉第电磁感应定律，掌握 ε=NΔΦ/Δt 的定量关系', W / 2, 70)

    // ─── 线圈+磁场主视觉（左中部）───
    const cx = W * 0.22, cy = H * 0.42
    drawCoilField(ctx, cx, cy, s, info, on)

    // ─── 参数调节（底部）───
    const barY = H - 26
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'

    ctx.fillStyle = '#1565C0'; ctx.fillText(`N=${s.turns}`, 55, barY)
    drawMiniSlider(ctx, 85, barY, 70, (s.turns - 1) / 99, (r) => {
      S.current.turns = Math.round(1 + r * 99); forceUpdate(n => n + 1)
    })

    ctx.fillStyle = '#2E7D32'; ctx.fillText(`A=${s.area}cm²`, 170, barY)
    drawMiniSlider(ctx, 225, barY, 70, (s.area - 50) / 450, (r) => {
      S.current.area = Math.round(50 + r * 450); forceUpdate(n => n + 1)
    })

    ctx.fillStyle = '#E65100'; ctx.fillText(`ΔB/Δt=${s.dBdt.toFixed(1)}T/s`, 310, barY)
    drawMiniSlider(ctx, 390, barY, 70, (s.dBdt - 0.1) / 4.9, (r) => {
      S.current.dBdt = Math.round((0.1 + r * 4.9) * 10) / 10; forceUpdate(n => n + 1)
    })

    ctx.fillStyle = '#E53935'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`ε=${info.emf.toFixed(3)}V`, 475, barY)
    ctx.textBaseline = 'alphabetic'

    // 右侧面板
    drawRightPanel(ctx, W * 0.56, 70, W - W * 0.56 - 25, H - 100, s, info)
  }

  // ─── 线圈 + 磁场可视化 ───
  function drawCoilField(ctx, cx, cy, s, info, on) {
    const fieldW = 280, fieldH = 200

    // 磁场区域
    ctx.fillStyle = '#E8EAF6'; ctx.strokeStyle = '#9FA8DA'
    ctx.beginPath(); ctx.roundRect(cx - fieldW / 2, cy - fieldH / 2, fieldW, fieldH, 6); ctx.fill(); ctx.stroke()

    // N 极（上）
    ctx.fillStyle = '#E53935'
    ctx.fillRect(cx - fieldW / 2, cy - fieldH / 2, fieldW, 28)
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('N（磁场 ⊗ 向纸内）', cx, cy - fieldH / 2 + 14)

    // S 极（下）
    ctx.fillStyle = '#1565C0'
    ctx.fillRect(cx - fieldW / 2, cy + fieldH / 2 - 28, fieldW, 28)
    ctx.fillStyle = '#fff'
    ctx.fillText('S', cx, cy + fieldH / 2 - 14)

    // 磁感线（向纸内 × 号）
    ctx.fillStyle = 'rgba(100,100,200,0.2)'; ctx.font = '12px sans-serif'
    for (let r = -2; r <= 2; r++) {
      for (let c = -3; c <= 3; c++) {
        ctx.fillText('⊗', cx + c * 36, cy + r * 36)
      }
    }

    // 线圈（多匝椭圆叠加）
    const coilW = Math.sqrt(s.area) * 1.8
    const coilH = coilW * 0.75
    const nDraw = Math.min(s.turns, 15)
    for (let i = 0; i < nDraw; i++) {
      const offset = (i - nDraw / 2) * 2.5
      const alpha = 0.4 + 0.4 * (i / nDraw)
      ctx.strokeStyle = `rgba(230,81,0,${alpha})`; ctx.lineWidth = 2
      ctx.beginPath()
      ctx.ellipse(cx + offset, cy, coilW / 2, coilH / 2, 0, 0, Math.PI * 2)
      ctx.stroke()
    }

    // 线圈截面标注
    ctx.fillStyle = '#E65100'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(`线圈 N=${s.turns}  面积 A=${s.area}cm²`, cx, cy + fieldH / 2 + 10)
    ctx.textBaseline = 'alphabetic'

    // 磁通量变化指示
    if (on) {
      // 闪烁的 ΔB 指示
      const pulse = 0.4 + 0.4 * Math.sin(Date.now() / 400)
      ctx.fillStyle = `rgba(156,39,176,${pulse})`; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText(`ΔΦ/Δt = ΔB/Δt × A = ${s.dBdt}×${(s.area * 1e-4).toFixed(4)}`, cx - fieldW / 2 + 10, cy + fieldH / 2 + 32)
      ctx.fillText(`     = ${info.phi.toFixed(4)} Wb/s`, cx - fieldW / 2 + 10, cy + fieldH / 2 + 50)
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 13px sans-serif'
      ctx.fillText(`ε = N × ΔΦ/Δt = ${s.turns} × ${info.phi.toFixed(4)} = ${info.emf.toFixed(3)} V`, cx - fieldW / 2 + 10, cy + fieldH / 2 + 72)
    }
  }

  function drawMiniSlider(ctx, x, y, w, ratio, onChange) {
    ctx.strokeStyle = '#bbb'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke()
    const kx = x + Math.max(0, Math.min(1, ratio)) * w
    ctx.fillStyle = '#FF9800'
    ctx.beginPath(); ctx.arc(kx, y, 6, 0, Math.PI * 2); ctx.fill()
    canvasRef.current._clickAreas.push({
      x: x - 8, y: y - 14, w: w + 16, h: 28,
      onClick: (mx) => onChange(Math.max(0, Math.min(1, (mx - x) / w)))
    })
  }

  // ─── 右侧面板 ───
  function drawRightPanel(ctx, x, y, w, h, s, info) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('🎯 法拉第电磁感应定律', x + 12, y + 12)

    // 公式
    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('ε = N·ΔΦ/Δt = N·A·ΔB/Δt', x + 12, y + 32)
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444'
    ctx.fillText(`Φ = BA，ΔΦ/Δt = ΔB/Δt × A`, x + 12, y + 50)
    ctx.fillText(`ε = ${s.turns} × ${s.area}×10⁻⁴ × ${s.dBdt.toFixed(1)}`, x + 12, y + 66)
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`ε = ${info.emf.toFixed(3)} V`, x + 12, y + 82)

    // 操作步骤
    let ky = y + 100
    const guideSteps = s.step === 1
      ? ['① 磁通量 Φ = BA', '② 磁通量变化 → 产生电动势', '③ ε = N·ΔΦ/Δt（法拉第定律）']
      : s.step === 2
        ? ['① 只改变 N → ε ∝ N', '② 只改变 A → ε ∝ A', '③ 只改变 ΔB/Δt → ε ∝ ΔB/Δt', '④ 结论：ε = N·A·ΔB/Δt']
        : ['① 确定 N、A、ΔB/Δt 的值', '② 点"记录"保存数据', '③ 验证 ε = N·A·ΔB/Δt']
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('📋 操作步骤', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#5D4037'
    for (let i = 0; i < guideSteps.length; i++) ctx.fillText(guideSteps[i], x + 12, ky + i * 12)
    ky += guideSteps.length * 12 + 6

    // 注意事项
    ctx.fillStyle = '#C62828'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('⚠ 注意事项', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#B71C1C'
    const notes = s.step === 1
      ? ['• 磁通量 Φ=BA，单位 Wb', '• 电磁感应条件：ΔΦ≠0', '• 楞次定律：感应电流方向阻碍磁通变化']
      : s.step === 2
        ? ['• 控制变量法：每次只改一个量', '• N、A、ΔB/Δt 均与 ε 成正比', '• 负号表示方向（楞次定律）']
        : ['• 数据需多组，覆盖不同 N/A/ΔB', '• 单位统一：A 用 m²，B 用 T', '• ε 与变化率成正比，不是与 B 成正比']
    for (let i = 0; i < notes.length; i++) ctx.fillText(notes[i], x + 12, ky + i * 12)
    ky += notes.length * 12 + 6

    // 数据表
    if (s.records.length > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('📊 实验数据', x + 12, ky); ky += 14
      ctx.fillStyle = '#FFB74D'
      ctx.fillRect(x + 12, ky, w - 24, 16)
      ctx.fillStyle = '#333'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      const c1 = x + 26, c2 = x + 52, c3 = x + 80, c4 = x + 115, c5 = x + 155
      ctx.fillText('#', c1, ky + 2); ctx.fillText('N', c2, ky + 2); ctx.fillText('A', c3, ky + 2)
      ctx.fillText('ΔB/Δt', c4, ky + 2); ctx.fillText('ε', c5, ky + 2)
      ky += 14
      for (let i = 0; i < s.records.length; i++) {
        const r = s.records[i]
        if (i % 2 === 0) { ctx.fillStyle = '#FFF8E1'; ctx.fillRect(x + 12, ky, w - 24, 13) }
        ctx.fillStyle = '#333'; ctx.font = '9px monospace'; ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), c1, ky + 1); ctx.fillText(String(r.N), c2, ky + 1)
        ctx.fillText(r.A.toFixed(1), c3, ky + 1); ctx.fillText(r.dBdt.toFixed(1), c4, ky + 1)
        ctx.fillText(r.emf.toFixed(3), c5, ky + 1)
        ky += 13
      }
      ctx.textAlign = 'left'
    }

    // 按钮
    const btnY = y + h - 38
    const btnW = 62, btnH = 24, gap = 6
    const bx = x + 12
    ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'
    ctx.beginPath(); ctx.roundRect(bx, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('📝 记录', bx + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({
      x: bx, y: btnY, w: btnW, h: btnH,
      onClick: () => { const s2 = S.current; const inf = emfInfo(s2); s2.records.push({ N: s2.turns, A: s2.area, dBdt: s2.dBdt, emf: inf.emf }); forceUpdate(n => n + 1) }
    })
    ctx.fillStyle = '#FF9800'; ctx.strokeStyle = '#E65100'
    ctx.beginPath(); ctx.roundRect(bx + btnW + gap, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.fillText('🗑 清除', bx + btnW + gap + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({ x: bx + btnW + gap, y: btnY, w: btnW, h: btnH, onClick: () => { S.current.records = []; forceUpdate(n => n + 1) } })
    ctx.fillStyle = '#9E9E9E'; ctx.strokeStyle = '#616161'
    ctx.beginPath(); ctx.roundRect(bx + (btnW + gap) * 2, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.fillText('↺ 重置', bx + (btnW + gap) * 2 + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({
      x: bx + (btnW + gap) * 2, y: btnY, w: btnW, h: btnH,
      onClick: () => { S.current.turns = 10; S.current.area = 200; S.current.dBdt = 2; S.current.records = []; S.current.switchClosed = false; forceUpdate(n => n + 1) }
    })
    ctx.textBaseline = 'alphabetic'
  }

  // ================================================================
  //  Tab 2：自己动手
  // ================================================================
  function renderBuilder(ctx, W, H) {
    const s = S.current
    const palW = 150
    const palX = W - palW - 10

    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#e0e0e0'
    ctx.beginPath(); ctx.roundRect(10, 10, palX - 25, H - 20, 8); ctx.fill(); ctx.stroke()

    for (const wire of s.wires) {
      const c1 = s.components.find(c => c.id === wire.from.compId)
      const c2 = s.components.find(c => c.id === wire.to.compId)
      if (!c1 || !c2) continue
      const p1 = getTermPos(c1, wire.from.portIndex)
      const p2 = getTermPos(c2, wire.to.portIndex)
      ctx.strokeStyle = wire.color || s.wireColor; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke()
      ctx.lineCap = 'butt'
    }
    if (s.connecting) {
      const c1 = s.components.find(c => c.id === s.connecting.compId)
      if (c1) {
        const p1 = getTermPos(c1, s.connecting.portIndex)
        ctx.strokeStyle = '#FF9800'; ctx.lineWidth = 2; ctx.setLineDash([5, 4])
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(s.connecting.mx, s.connecting.my); ctx.stroke()
        ctx.setLineDash([])
      }
    }
    for (const comp of s.components) drawComp(ctx, comp)

    const bx2 = 22, by2 = H - 130, bw2 = palX - 50
    ctx.fillStyle = 'rgba(255,252,240,0.95)'; ctx.strokeStyle = '#ddd'
    ctx.beginPath(); ctx.roundRect(bx2, by2, bw2, s._guideOpen ? 118 : 36, 6); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText('📋 操作说明', bx2 + 10, by2 + 18)
    ctx.textAlign = 'right'
    ctx.fillText(s._guideOpen ? '收起 ▲' : '展开 ▼', bx2 + bw2 - 10, by2 + 18)
    canvasRef.current._clickAreas.push({ x: bx2 - 5, y: by2 - 3, w: bw2 + 10, h: 42, onClick: () => { s._guideOpen = !s._guideOpen; forceUpdate(n => n + 1) } })
    if (s._guideOpen) {
      ctx.textAlign = 'left'; ctx.font = '10px sans-serif'
      const lines = ['① 拖入器材到画布', '② 点击接线柱连线', '③ 双击开关通断', '④ 右键删除器材', '⑤ 观察感应电动势']
      for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], bx2 + 10, by2 + 40 + i * 15)
    }
    ctx.textBaseline = 'alphabetic'

    drawPalette(ctx, palX, 10, palW, H - 20)
  }

  function drawPalette(ctx, x, y, w, h) {
    const s = S.current
    ctx.fillStyle = '#fafafa'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('电学器材', x + w / 2, y + 10)

    const items = [
      { type: 'switch', name: '开关' },
      { type: 'voltmeter', name: '电压表 V' },
      { type: 'coil', name: '线圈（多匝）' },
      { type: 'magnet', name: '磁铁 N-S' },
      { type: 'galvanometer', name: '灵敏电流计' },
      { type: 'battery', name: '电源（干扰）' },
      { type: 'ammeter', name: '电流表 A（干扰）' },
      { type: 'rheostat', name: '滑动变阻器（干扰）' },
    ]
    const itemH = 30
    for (let i = 0; i < items.length; i++) {
      const iy = y + 32 + i * (itemH + 3)
      if (iy + itemH > y + h - 75) break
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ccc'
      ctx.beginPath(); ctx.roundRect(x + 6, iy, w - 12, itemH, 5); ctx.fill(); ctx.stroke()
      drawPaletteIcon(ctx, x + 18, iy + itemH / 2, items[i].type)
      ctx.fillStyle = '#333'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText(items[i].name, x + 34, iy + itemH / 2)
      canvasRef.current._palAreas.push({ x: x + 6, y: iy, w: w - 12, h: itemH, type: items[i].type })
    }
    const palColorBase = y + 32 + items.length * (itemH + 3) + 4
    ctx.fillStyle = '#666'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('导线颜色：', x + 10, palColorBase + 2)
    const colors = [['#F44336', '红'], ['#FFC107', '黄'], ['#4CAF50', '绿']]
    for (let i = 0; i < 3; i++) {
      const cy = palColorBase + 18 + i * 20
      ctx.fillStyle = colors[i][0]; ctx.fillRect(x + 10, cy, 36, 14)
      ctx.strokeStyle = s.wireColor === colors[i][0] ? '#333' : '#ccc'; ctx.strokeRect(x + 10, cy, 36, 14)
      ctx.fillStyle = '#333'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText(colors[i][1], x + 52, cy + 2)
      canvasRef.current._palAreas.push({ x: x + 8, y: cy - 2, w: w - 16, h: 18, action: 'color', color: colors[i][0] })
    }
    ctx.textBaseline = 'alphabetic'
  }

  function drawPaletteIcon(ctx, x, y, type) {
    ctx.save(); ctx.translate(x, y)
    if (type === 'switch') {
      ctx.strokeStyle = '#666'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(5, -4); ctx.stroke()
      ctx.fillStyle = '#666'; ctx.beginPath(); ctx.arc(-7, 0, 2, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(7, 0, 2, 0, Math.PI * 2); ctx.fill()
    } else if (type === 'voltmeter') {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#1565C0'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('V', 0, 2)
    } else if (type === 'coil') {
      ctx.strokeStyle = '#E65100'; ctx.lineWidth = 1.5
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc(-6 + i * 6, 0, 6, 0, Math.PI * 2); ctx.stroke()
      }
    } else if (type === 'magnet') {
      ctx.fillStyle = '#E53935'; ctx.fillRect(-10, -6, 10, 12)
      ctx.fillStyle = '#1565C0'; ctx.fillRect(0, -6, 10, 12)
    } else if (type === 'galvanometer') {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2E7D32'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#2E7D32'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('G', 0, 2)
    } else if (type === 'battery') {
      ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'
      ctx.fillRect(-10, -7, 20, 14); ctx.strokeRect(-10, -7, 20, 14)
    } else if (type === 'ammeter') {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('A', 0, 2)
    } else if (type === 'rheostat') {
      ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'
      ctx.fillRect(-10, -4, 20, 8); ctx.strokeRect(-10, -4, 20, 8)
    }
    ctx.restore()
  }

  function getTermPos(comp, portIndex) {
    if (comp.type === 'switch') return { x: comp.x + (portIndex === 0 ? -15 : 15), y: comp.y }
    if (comp.type === 'voltmeter') return { x: comp.x + (portIndex === 0 ? -16 : 16), y: comp.y }
    if (comp.type === 'coil') return { x: comp.x + (portIndex === 0 ? -18 : 18), y: comp.y }
    if (comp.type === 'magnet') return { x: comp.x + (portIndex === 0 ? -12 : 12), y: comp.y }
    if (comp.type === 'galvanometer') return { x: comp.x + (portIndex === 0 ? -14 : 14), y: comp.y }
    if (comp.type === 'battery') return { x: comp.x + (portIndex === 0 ? -18 : 18), y: comp.y }
    if (comp.type === 'ammeter') return { x: comp.x + (portIndex === 0 ? -16 : 16), y: comp.y }
    if (comp.type === 'rheostat') return { x: comp.x + (portIndex === 0 ? -25 : 25), y: comp.y }
    return { x: comp.x, y: comp.y }
  }

  function drawComp(ctx, comp) {
    ctx.save(); ctx.translate(comp.x, comp.y)
    if (comp.type === 'switch') {
      ctx.strokeStyle = comp.closed ? '#4CAF50' : '#F44336'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(10, comp.closed ? 0 : -10); ctx.stroke()
      ctx.lineCap = 'butt'
      ctx.fillStyle = '#333'
      ctx.beginPath(); ctx.arc(-15, 0, 3, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(15, 0, 3, 0, Math.PI * 2); ctx.fill()
    } else if (comp.type === 'voltmeter') {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#1565C0'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('V', 0, 0)
    } else if (comp.type === 'coil') {
      ctx.strokeStyle = '#E65100'; ctx.lineWidth = 2
      for (let i = 0; i < 4; i++) {
        ctx.beginPath(); ctx.arc(-9 + i * 6, 0, 6, 0, Math.PI * 2); ctx.stroke()
      }
      ctx.fillStyle = '#E65100'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText('N匝', 0, 10)
    } else if (comp.type === 'magnet') {
      ctx.fillStyle = '#E53935'; ctx.fillRect(-12, -10, 12, 20)
      ctx.fillStyle = '#1565C0'; ctx.fillRect(0, -10, 12, 20)
      ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('N', -6, 0); ctx.fillText('S', 6, 0)
    } else if (comp.type === 'galvanometer') {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2E7D32'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#2E7D32'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('G', 0, 0)
    } else if (comp.type === 'battery') {
      ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'
      ctx.beginPath(); ctx.roundRect(-18, -11, 36, 22, 3); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('12V', 0, 3)
    } else if (comp.type === 'ammeter') {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('A', 0, 0)
    } else if (comp.type === 'rheostat') {
      ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'
      ctx.beginPath(); ctx.roundRect(-25, -10, 50, 20, 3); ctx.fill(); ctx.stroke()
    }
    const t1 = getTermPos({ ...comp, x: 0, y: 0 }, 0)
    const t2 = getTermPos({ ...comp, x: 0, y: 0 }, 1)
    for (const t of [t1, t2]) {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#666'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(t.x, t.y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    }
    ctx.restore()
  }

  // ================================================================
  //  交互事件
  // ================================================================
  function getPos(e) { const rect = canvasRef.current.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top } }
  function findTerm(x, y) { for (const comp of S.current.components) { for (let i = 0; i < 2; i++) { const t = getTermPos(comp, i); if (Math.abs(x - t.x) < 10 && Math.abs(y - t.y) < 10) return { compId: comp.id, portIndex: i } } } return null }

  function handleMouseDown(e) {
    if (e.button !== 0) return
    const s = S.current; const { x, y } = getPos(e)
    if (s.tab === 1) { for (const a of canvasRef.current._clickAreas) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(x, y); return } } return }
    for (const a of canvasRef.current._clickAreas || []) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(); return } }
    for (const a of canvasRef.current._palAreas) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { if (a.action === 'color') { s.wireColor = a.color; forceUpdate(n => n + 1); return } if (a.type) { const id = s.nextId++; s.components.push({ id, type: a.type, x, y, closed: a.type === 'switch' ? false : true, props: {} }); s.dragId = id; forceUpdate(n => n + 1); return } } }
    const term = findTerm(x, y)
    if (term) { s.connecting = { ...term, mx: x, my: y }; forceUpdate(n => n + 1); return }
    for (const comp of s.components) { if (Math.abs(x - comp.x) < 30 && Math.abs(y - comp.y) < 25) { s.dragId = comp.id; s.dragOffX = x - comp.x; s.dragOffY = y - comp.y; forceUpdate(n => n + 1); return } }
  }
  function handleMouseMove(e) {
    const s = S.current; const { x, y } = getPos(e)
    if (s.connecting) { s.connecting.mx = x; s.connecting.my = y; forceUpdate(n => n + 1); return }
    if (s.dragId == null) return
    const comp = s.components.find(c => c.id === s.dragId)
    if (comp) { comp.x = x - s.dragOffX; comp.y = y - s.dragOffY; forceUpdate(n => n + 1) }
  }
  function handleMouseUp(e) {
    const s = S.current; const { x, y } = getPos(e)
    if (s.connecting) { const term = findTerm(x, y); if (term && !(term.compId === s.connecting.compId && term.portIndex === s.connecting.portIndex)) { const exists = s.wires.some(w => (w.from.compId === s.connecting.compId && w.from.portIndex === s.connecting.portIndex && w.to.compId === term.compId && w.to.portIndex === term.portIndex) || (w.to.compId === s.connecting.compId && w.to.portIndex === s.connecting.portIndex && w.from.compId === term.compId && w.from.portIndex === term.portIndex)); if (!exists) s.wires.push({ id: s.wires.length + 1, from: { ...s.connecting }, to: term, color: s.wireColor }) }; s.connecting = null; forceUpdate(n => n + 1); return }
    s.dragId = null
  }
  function handleDoubleClick(e) { const s = S.current; const { x, y } = getPos(e); const comp = s.components.find(c => Math.abs(x - c.x) < 25 && Math.abs(y - c.y) < 25 && c.type === 'switch'); if (comp) { comp.closed = !comp.closed; forceUpdate(n => n + 1) } }
  function handleContextMenu(e) { e.preventDefault(); const s = S.current; const { x, y } = getPos(e); const idx = s.components.findIndex(c => Math.abs(x - c.x) < 30 && Math.abs(y - c.y) < 25); if (idx >= 0) { const id = s.components[idx].id; s.components.splice(idx, 1); s.wires = s.wires.filter(w => w.from.compId !== id && w.to.compId !== id); forceUpdate(n => n + 1) } }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px', background: '#fff', borderBottom: '1px solid #e0e0e0', alignItems: 'center' }}>
        <button onClick={() => { S.current.tab = 1; setTab(1); forceUpdate(n => n + 1) }} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #ddd', background: tab === 1 ? '#1976D2' : '#fff', color: tab === 1 ? '#fff' : '#333', cursor: 'pointer' }}>📊 实验演示</button>
        <button onClick={() => { S.current.tab = 2; setTab(2); forceUpdate(n => n + 1) }} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #ddd', background: tab === 2 ? '#1976D2' : '#fff', color: tab === 2 ? '#fff' : '#333', cursor: 'pointer' }}>🔧 自己动手</button>
        <button onClick={() => { S.current.turns = 10; S.current.area = 200; S.current.dBdt = 2; S.current.records = []; S.current.switchClosed = false; forceUpdate(n => n + 1) }} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', color: '#666', cursor: 'pointer' }}>↺ 重置</button>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} />
      </div>
    </div>
  )
}