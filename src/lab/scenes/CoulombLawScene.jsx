import { useState, useRef, useEffect } from 'react'
import SceneShell from '../ui/SceneShell'

/**
 * CoulombLawScene — 库仑定律探究
 *
 * F = kQ₁Q₂/r²  k = 9×10⁹ N·m²/C²
 * 同号电荷相斥，异号电荷相吸
 *
 * Step1: F 与 Q₁Q₂ 的关系 — 保持 r 不变，改变 Q₁ 或 Q₂
 * Step2: F 与 r² 的关系 — 保持 Q 不变，改变距离 r
 * Step3: 同斥异吸 — 改变电荷正负号，观察力的方向
 */
export default function CoulombLawScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,
    switchClosed: false,
    Q1: 5,          // μC
    Q2: 3,          // μC
    distance: 200,  // 像素距离
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
  function coulombInfo(s) {
    const k = 9e9
    const r = s.distance / 100
    const Q1C = s.Q1 * 1e-6
    const Q2C = s.Q2 * 1e-6
    const F = k * Math.abs(Q1C * Q2C) / (r * r)
    const sameSign = (s.Q1 > 0 && s.Q2 > 0) || (s.Q1 < 0 && s.Q2 < 0)
    return { F, r, sameSign }
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
    const info = coulombInfo(s)

    // 顶部步骤标签
    const labels = ['① F∝Q₁Q₂', '② F∝1/r²', '③ 同斥异吸']
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
          S.current.step = i + 1; S.current.records = []
          setStep(i + 1); forceUpdate(n => n + 1)
        }
      })
    }
    ctx.textBaseline = 'alphabetic'

    const subs = {
      1: '保持距离 r 不变，改变 Q₁ 或 Q₂，观察力 F 的变化 → F ∝ Q₁Q₂',
      2: '保持电荷不变，改变距离 r，观察力 F 的变化 → F ∝ 1/r²',
      3: '改变电荷正负号，同号相斥、异号相吸',
    }
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(subs[s.step], W / 2, 52)
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('🎯 实验目的：用控制变量法验证库仑定律 F=kQ₁Q₂/r²，理解同斥异吸', W / 2, 70)

    // ─── 电荷主视觉（左中部）───
    const cx = W * 0.28, cy = H * 0.42
    drawCharges(ctx, cx, cy, s, info)

    // ─── 参数调节（底部）───
    const barY = H - 26
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'

    ctx.fillStyle = s.Q1 >= 0 ? '#E53935' : '#1565C0'
    ctx.fillText(`Q₁=${s.Q1 > 0 ? '+' : ''}${s.Q1}μC`, 55, barY)
    drawMiniSlider(ctx, 115, barY, 70, (s.Q1 + 10) / 20, (r) => {
      S.current.Q1 = Math.round(-10 + r * 20); forceUpdate(n => n + 1)
    })

    ctx.fillStyle = s.Q2 >= 0 ? '#E53935' : '#1565C0'
    ctx.fillText(`Q₂=${s.Q2 > 0 ? '+' : ''}${s.Q2}μC`, 200, barY)
    drawMiniSlider(ctx, 260, barY, 70, (s.Q2 + 10) / 20, (r) => {
      S.current.Q2 = Math.round(-10 + r * 20); forceUpdate(n => n + 1)
    })

    ctx.fillStyle = '#333'; ctx.fillText(`r=${info.r.toFixed(2)}m`, 345, barY)
    drawMiniSlider(ctx, 400, barY, 80, (s.distance - 50) / 350, (r) => {
      S.current.distance = Math.round(50 + r * 350); forceUpdate(n => n + 1)
    })

    ctx.fillStyle = '#E53935'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`F=${info.F.toFixed(3)}N`, 495, barY)
    ctx.textBaseline = 'alphabetic'

    // 右侧面板
    drawRightPanel(ctx, W * 0.56, 70, W - W * 0.56 - 25, H - 100, s, info)
  }

  // ─── 电荷可视化 ───
  function drawCharges(ctx, cx, cy, s, info) {
    const r1 = 15 + Math.abs(s.Q1) * 2.5
    const r2 = 15 + Math.abs(s.Q2) * 2.5
    const halfDist = s.distance / 2
    const cx1 = cx - halfDist, cx2 = cx + halfDist

    // 距离标注
    ctx.strokeStyle = '#999'; ctx.lineWidth = 1; ctx.setLineDash([4, 3])
    ctx.beginPath(); ctx.moveTo(cx1, cy + 60); ctx.lineTo(cx2, cy + 60); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(`r = ${info.r.toFixed(2)} m`, (cx1 + cx2) / 2, cy + 78)

    // 电荷 1
    ctx.fillStyle = s.Q1 >= 0 ? '#E53935' : '#1565C0'
    ctx.beginPath(); ctx.arc(cx1, cy, r1, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(s.Q1 >= 0 ? '+' : '−', cx1, cy)
    ctx.fillStyle = '#333'; ctx.font = '12px sans-serif'; ctx.textBaseline = 'top'
    ctx.fillText(`Q₁ = ${s.Q1 > 0 ? '+' : ''}${s.Q1} μC`, cx1, cy + r1 + 16)

    // 电荷 2
    ctx.fillStyle = s.Q2 >= 0 ? '#E53935' : '#1565C0'
    ctx.beginPath(); ctx.arc(cx2, cy, r2, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(s.Q2 >= 0 ? '+' : '−', cx2, cy)
    ctx.fillStyle = '#333'; ctx.font = '12px sans-serif'; ctx.textBaseline = 'top'
    ctx.fillText(`Q₂ = ${s.Q2 > 0 ? '+' : ''}${s.Q2} μC`, cx2, cy + r2 + 16)

    // 力箭头
    const forceDir = info.sameSign ? -1 : 1 // 同斥（向外）异吸（向内）
    const forceScale = Math.min(info.F * 500, 100)
    const forceColor = info.sameSign ? '#E53935' : '#4CAF50'
    const fy = cy - 40

    // Q1 受力
    drawForceArrow(ctx, cx1 + r1 + 5, fy, forceDir * forceScale, 'F₁', forceColor)
    // Q2 受力
    drawForceArrow(ctx, cx2 - r2 - 5, fy, -forceDir * forceScale, 'F₂', forceColor)

    // 标注
    ctx.fillStyle = forceColor; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(info.sameSign ? '同号电荷 → 相斥' : '异号电荷 → 相吸', cx, cy + 110)
    ctx.textBaseline = 'alphabetic'
  }

  function drawForceArrow(ctx, x, y, len, label, color) {
    if (Math.abs(len) < 3) return
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y); ctx.stroke()
    ctx.lineCap = 'butt'
    ctx.fillStyle = color
    const dir = len > 0 ? 1 : -1
    ctx.beginPath()
    ctx.moveTo(x + len, y)
    ctx.lineTo(x + len - dir * 8, y - 5)
    ctx.lineTo(x + len - dir * 8, y + 5)
    ctx.closePath(); ctx.fill()
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText(label, x + len / 2, y - 8)
    ctx.textBaseline = 'alphabetic'
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
    ctx.fillText('🎯 库仑定律探究', x + 12, y + 12)

    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('F = kQ₁Q₂ / r²', x + 12, y + 32)
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444'
    ctx.fillText(`k = 9×10⁹ N·m²/C²`, x + 12, y + 50)
    ctx.fillText(`F = ${info.F.toFixed(3)} N`, x + 12, y + 66)
    ctx.fillStyle = info.sameSign ? '#E53935' : '#4CAF50'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText(info.sameSign ? '同号相斥' : '异号相吸', x + 12, y + 82)

    let ky = y + 100
    const guideSteps = s.step === 1
      ? ['① 保持 r 不变', '② 改变 Q₁ 或 Q₂', '③ 记录 F 值', '④ 结论：F ∝ Q₁Q₂']
      : s.step === 2
        ? ['① 保持 Q₁、Q₂ 不变', '② 改变距离 r', '③ 记录 F 值', '④ 结论：F ∝ 1/r²']
        : ['① Q₁、Q₂ 同号 → 相斥', '② Q₁、Q₂ 异号 → 相吸', '③ 改变数值观察力大小']
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('📋 操作步骤', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#5D4037'
    for (let i = 0; i < guideSteps.length; i++) ctx.fillText(guideSteps[i], x + 12, ky + i * 12)
    ky += guideSteps.length * 12 + 6

    ctx.fillStyle = '#C62828'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('⚠ 注意事项', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#B71C1C'
    const notes = s.step === 1
      ? ['• r 不变时 F 与 Q₁Q₂ 成正比', '• Q₁Q₂ 同号时 F>0（斥力）', '• Q₁Q₂ 异号时 F<0（引力）']
      : s.step === 2
        ? ['• Q 不变时 F 与 r² 成反比', '• r 加倍 → F 变为 1/4', '• 库仑定律适用于点电荷']
        : ['• 正电荷用红色，负电荷用蓝色', '• 力沿两电荷连线方向', '• 牛顿第三定律：F₁ = -F₂']
    for (let i = 0; i < notes.length; i++) ctx.fillText(notes[i], x + 12, ky + i * 12)
    ky += notes.length * 12 + 6

    if (s.records.length > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('📊 实验数据', x + 12, ky); ky += 14
      ctx.fillStyle = '#FFB74D'
      ctx.fillRect(x + 12, ky, w - 24, 16)
      ctx.fillStyle = '#333'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      const c1 = x + 26, c2 = x + 55, c3 = x + 85, c4 = x + 115, c5 = x + 155
      ctx.fillText('#', c1, ky + 2); ctx.fillText('Q₁', c2, ky + 2); ctx.fillText('Q₂', c3, ky + 2)
      ctx.fillText('r(m)', c4, ky + 2); ctx.fillText('F(N)', c5, ky + 2)
      ky += 14
      for (let i = 0; i < s.records.length; i++) {
        const r = s.records[i]
        if (i % 2 === 0) { ctx.fillStyle = '#FFF8E1'; ctx.fillRect(x + 12, ky, w - 24, 13) }
        ctx.fillStyle = '#333'; ctx.font = '9px monospace'; ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), c1, ky + 1); ctx.fillText(String(r.Q1), c2, ky + 1)
        ctx.fillText(String(r.Q2), c3, ky + 1); ctx.fillText(r.r.toFixed(2), c4, ky + 1)
        ctx.fillText(r.F.toFixed(3), c5, ky + 1)
        ky += 13
      }
      ctx.textAlign = 'left'
    }

    const btnY = y + h - 38
    const btnW = 62, btnH = 24, gap = 6
    const bx = x + 12
    ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'
    ctx.beginPath(); ctx.roundRect(bx, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('📝 记录', bx + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({
      x: bx, y: btnY, w: btnW, h: btnH,
      onClick: () => { const s2 = S.current; const inf = coulombInfo(s2); s2.records.push({ Q1: s2.Q1, Q2: s2.Q2, r: inf.r, F: inf.F }); forceUpdate(n => n + 1) }
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
      onClick: () => { S.current.Q1 = 5; S.current.Q2 = 3; S.current.distance = 200; S.current.records = []; forceUpdate(n => n + 1) }
    })
    ctx.textBaseline = 'alphabetic'
  }

  // ================================================================
  //  Tab 2：自己动手
  // ================================================================
  function renderBuilder(ctx, W, H) {
    const s = S.current
    const palW = 150, palX = W - palW - 10

    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#e0e0e0'
    ctx.beginPath(); ctx.roundRect(10, 10, palX - 25, H - 20, 8); ctx.fill(); ctx.stroke()

    for (const wire of s.wires) {
      const c1 = s.components.find(c => c.id === wire.from.compId)
      const c2 = s.components.find(c => c.id === wire.to.compId)
      if (!c1 || !c2) continue
      const p1 = getTermPos(c1, wire.from.portIndex), p2 = getTermPos(c2, wire.to.portIndex)
      ctx.strokeStyle = wire.color || s.wireColor; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke(); ctx.lineCap = 'butt'
    }
    if (s.connecting) {
      const c1 = s.components.find(c => c.id === s.connecting.compId)
      if (c1) { const p1 = getTermPos(c1, s.connecting.portIndex); ctx.strokeStyle = '#FF9800'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(s.connecting.mx, s.connecting.my); ctx.stroke(); ctx.setLineDash([]) }
    }
    for (const comp of s.components) drawComp(ctx, comp)

    const bx = 22, by = H - 130, bw = palX - 50
    ctx.fillStyle = 'rgba(255,252,240,0.95)'; ctx.strokeStyle = '#ddd'
    ctx.beginPath(); ctx.roundRect(bx, by, bw, s._guideOpen ? 118 : 36, 6); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText('📋 操作说明', bx + 10, by + 18)
    ctx.textAlign = 'right'; ctx.fillText(s._guideOpen ? '收起 ▲' : '展开 ▼', bx + bw - 10, by + 18)
    canvasRef.current._clickAreas.push({ x: bx - 5, y: by - 3, w: bw + 10, h: 42, onClick: () => { s._guideOpen = !s._guideOpen; forceUpdate(n => n + 1) } })
    if (s._guideOpen) { ctx.textAlign = 'left'; ctx.font = '10px sans-serif'; ['① 拖入电荷到画布', '② 调节电量和距离', '③ 观察力的大小和方向', '④ 右键删除电荷', '⑤ 同号相斥异号相吸'].forEach((l, i) => ctx.fillText(l, bx + 10, by + 40 + i * 15)) }
    ctx.textBaseline = 'alphabetic'

    drawPalette(ctx, palX, 10, palW, H - 20)
  }

  function drawPalette(ctx, x, y, w, h) {
    ctx.fillStyle = '#fafafa'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('电学器材', x + w / 2, y + 10)
    const items = [
      { type: 'posCharge', name: '正电荷 +Q' },
      { type: 'negCharge', name: '负电荷 -Q' },
      { type: 'electrometer', name: '静电计（干扰）' },
      { type: 'conductor', name: '导体球（干扰）' },
      { type: 'insulator', name: '绝缘棒（干扰）' },
      { type: 'ground', name: '接地线（干扰）' },
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
    ctx.textBaseline = 'alphabetic'
  }

  function drawPaletteIcon(ctx, x, y, type) {
    ctx.save(); ctx.translate(x, y)
    if (type === 'posCharge') {
      ctx.fillStyle = '#E53935'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('+', 0, 0)
    } else if (type === 'negCharge') {
      ctx.fillStyle = '#1565C0'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('−', 0, 0)
    } else if (type === 'electrometer') {
      ctx.fillStyle = '#E3F2FD'; ctx.strokeStyle = '#1565C0'; ctx.fillRect(-8, -6, 16, 12); ctx.strokeRect(-8, -6, 16, 12)
    } else if (type === 'conductor') {
      ctx.fillStyle = '#BDBDBD'; ctx.strokeStyle = '#757575'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    } else if (type === 'insulator') {
      ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.stroke()
    } else if (type === 'ground') {
      ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 4); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(-6, 4); ctx.lineTo(6, 4); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(-4, 7); ctx.lineTo(4, 7); ctx.stroke()
    }
    ctx.restore()
  }

  function getTermPos(comp) { return { x: comp.x, y: comp.y } }

  function drawComp(ctx, comp) {
    ctx.save(); ctx.translate(comp.x, comp.y)
    if (comp.type === 'posCharge') {
      const r = 15 + (comp.props?.Q || 5) * 2
      ctx.fillStyle = '#E53935'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('+', 0, 0)
      ctx.fillStyle = '#333'; ctx.font = '10px sans-serif'; ctx.textBaseline = 'top'
      ctx.fillText(`+${comp.props?.Q || 5}μC`, 0, r + 8)
    } else if (comp.type === 'negCharge') {
      const r = 15 + (comp.props?.Q || 3) * 2
      ctx.fillStyle = '#1565C0'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('−', 0, 0)
      ctx.fillStyle = '#333'; ctx.font = '10px sans-serif'; ctx.textBaseline = 'top'
      ctx.fillText(`-${comp.props?.Q || 3}μC`, 0, r + 8)
    } else if (comp.type === 'electrometer') {
      ctx.fillStyle = '#E3F2FD'; ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.roundRect(-14, -10, 28, 20, 3); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#1565C0'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('静电计', 0, 0)
    } else if (comp.type === 'conductor') {
      ctx.fillStyle = '#BDBDBD'; ctx.strokeStyle = '#757575'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#333'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('导体', 0, 0)
    } else if (comp.type === 'insulator') {
      ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 5; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(16, 0); ctx.stroke(); ctx.lineCap = 'butt'
    } else if (comp.type === 'ground') {
      ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(0, 6); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(-8, 6); ctx.lineTo(8, 6); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(-6, 10); ctx.lineTo(6, 10); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(-4, 14); ctx.lineTo(4, 14); ctx.stroke()
    }
    ctx.restore()
  }

  // 交互
  function getPos(e) { const r = canvasRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
  function handleMouseDown(e) {
    if (e.button !== 0) return
    const s = S.current; const { x, y } = getPos(e)
    if (s.tab === 1) { for (const a of canvasRef.current._clickAreas) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(x, y); return } } return }
    for (const a of canvasRef.current._clickAreas || []) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(); return } }
    for (const a of canvasRef.current._palAreas) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { if (a.type) { s.components.push({ id: s.nextId++, type: a.type, x, y, closed: true, props: { Q: a.type === 'posCharge' ? 5 : 3 } }); s.dragId = s.nextId - 1; forceUpdate(n => n + 1); return } } }
    for (const c of s.components) { if (Math.abs(x - c.x) < 25 && Math.abs(y - c.y) < 25) { s.dragId = c.id; s.dragOffX = x - c.x; s.dragOffY = y - c.y; forceUpdate(n => n + 1); return } }
  }
  function handleMouseMove(e) { const s = S.current; const { x, y } = getPos(e); if (s.dragId == null) return; const c = s.components.find(c => c.id === s.dragId); if (c) { c.x = x - s.dragOffX; c.y = y - s.dragOffY; forceUpdate(n => n + 1) } }
  function handleMouseUp() { S.current.dragId = null }
  function handleDoubleClick() {}
  function handleContextMenu(e) { e.preventDefault(); const s = S.current; const { x, y } = getPos(e); const idx = s.components.findIndex(c => Math.abs(x - c.x) < 25 && Math.abs(y - c.y) < 25); if (idx >= 0) { s.components.splice(idx, 1); forceUpdate(n => n + 1) } }

  return (
    <SceneShell
      title="库仑定律探究"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t); forceUpdate(n => n + 1) }}
      tab1Label="📊 实验演示"
      tab2Label="🔧 自己动手"
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} />
    </SceneShell>
  )
}
