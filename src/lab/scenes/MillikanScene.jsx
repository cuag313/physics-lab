import { useState, useRef, useEffect } from 'react'

/**
 * MillikanScene — 密立根油滴实验
 *
 * 油滴在电场中受力平衡：mg = qE
 * 测量元电荷 e = 1.6×10⁻¹⁹ C，电荷量子化
 *
 * Step1: 油滴平衡 — 调节电压使油滴静止，mg = qE
 * Step2: 测量电荷 — 通过 U、m 求 q，发现 q = ne
 * Step3: 电荷量子化 — 所有电荷都是 e 的整数倍
 */
export default function MillikanScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,
    switchClosed: false,
    voltage: 200,     // V（极板间电压）
    plateDist: 0.01,  // m（极板间距）
    oilCharge: 3,     // n（油滴电荷倍数）
    oilMass: 1e-15,   // kg（油滴质量，简化值）
    isBalanced: false,
    t: 0,
    pos: 0.5,         // 油滴位置 0~1
    velocity: 0,
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
        s.t += dt
        const e = 1.6e-19
        const g = 9.8
        const E = s.voltage / s.plateDist
        const F_gravity = s.oilMass * g
        const F_electric = s.oilCharge * e * E
        const netForce = F_electric - F_gravity
        // 简化：用归一化加速度
        const accel = netForce * 1e12 // 缩放
        s.velocity += accel * dt * 0.001
        s.velocity *= 0.95 // 阻尼
        s.pos -= s.velocity * dt * 0.5
        s.pos = Math.max(0.05, Math.min(0.95, s.pos))
        s.isBalanced = Math.abs(netForce) < F_gravity * 0.1
      }
      render(R)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function millikanInfo(s) {
    const e = 1.6e-19
    const g = 9.8
    const E = s.voltage / s.plateDist
    const q = s.oilCharge * e
    const F_gravity = s.oilMass * g
    const F_electric = q * E
    const balanced = Math.abs(F_electric - F_gravity) < F_gravity * 0.2
    return { e, E, q, F_gravity, F_electric, balanced }
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
    const info = millikanInfo(s)

    const labels = ['① 油滴平衡', '② 测量电荷', '③ 电荷量子化']
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
        S.current.step = i + 1; S.current.records = []; S.current.pos = 0.5; S.current.velocity = 0
        setStep(i + 1); forceUpdate(n => n + 1)
      } })
    }
    ctx.textBaseline = 'alphabetic'

    const subs = {
      1: '调节电压使油滴静止：mg = qE，平衡时油滴不动',
      2: '通过 U、m 求 q，发现 q 都是 e 的整数倍',
      3: '所有带电体的电荷都是 e = 1.6×10⁻¹⁹ C 的整数倍',
    }
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(subs[s.step], W / 2, 52)
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('🎯 实验目的：测量元电荷 e，理解电荷量子化', W / 2, 70)

    // 油滴实验可视化
    drawOilDrop(ctx, W * 0.12, 80, W * 0.40, H - 140, s, info)

    // 底部参数
    const barY = H - 26
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillStyle = '#1565C0'; ctx.fillText(`U=${s.voltage}V`, 55, barY)
    drawMiniSlider(ctx, 105, barY, 80, (s.voltage - 50) / 450, (r) => {
      S.current.voltage = Math.round(50 + r * 450); forceUpdate(n => n + 1)
    })

    ctx.fillStyle = '#9C27B0'; ctx.fillText(`q=${s.oilCharge}e`, 200, barY)
    drawMiniSlider(ctx, 240, barY, 60, (s.oilCharge - 1) / 9, (r) => {
      S.current.oilCharge = Math.round(1 + r * 9); forceUpdate(n => n + 1)
    })

    // 开始/暂停
    ctx.fillStyle = s.switchClosed ? '#E53935' : '#4CAF50'
    ctx.beginPath(); ctx.roundRect(315, barY - 13, 65, 26, 5); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.fillText(s.switchClosed ? '⏸ 暂停' : '▶ 开始', 332, barY)
    canvasRef.current._clickAreas.push({ x: 315, y: barY - 13, w: 65, h: 26, onClick: () => {
      S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1)
    } })

    if (info.balanced) {
      ctx.fillStyle = '#4CAF50'; ctx.font = 'bold 11px sans-serif'
      ctx.fillText('✓ 平衡！mg = qE', 395, barY)
    }
    ctx.textBaseline = 'alphabetic'

    drawRightPanel(ctx, W * 0.56, 80, W - W * 0.56 - 25, H - 140, s, info)
  }

  // 油滴实验可视化
  function drawOilDrop(ctx, x, y, w, h, s, info) {
    // 极板容器
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ddd'
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()

    const plateW = w * 0.7
    const plateX = x + (w - plateW) / 2
    const topY = y + 35
    const botY = y + h - 55

    // 上极板（正极）
    ctx.fillStyle = '#FFCDD2'; ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2
    ctx.fillRect(plateX, topY, plateW, 15)
    ctx.strokeRect(plateX, topY, plateW, 15)
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText('+', plateX + plateW / 2, topY - 3)

    // 下极板（负极）
    ctx.fillStyle = '#BBDEFB'; ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 2
    ctx.fillRect(plateX, botY, plateW, 15)
    ctx.strokeRect(plateX, botY, plateW, 15)
    ctx.fillStyle = '#1565C0'; ctx.fillText('−', plateX + plateW / 2, botY + 25)

    // 电场线（正→负）
    ctx.strokeStyle = 'rgba(229,57,53,0.15)'; ctx.lineWidth = 1
    for (let i = 1; i < 6; i++) {
      const ex = plateX + (i / 6) * plateW
      ctx.beginPath(); ctx.moveTo(ex, topY + 15); ctx.lineTo(ex, botY); ctx.stroke()
    }

    // 油滴位置
    const dropY = topY + 15 + s.pos * (botY - topY - 15)
    const dropX = plateX + plateW / 2

    // 力箭头
    if (s.switchClosed) {
      const gravityLen = 25
      const electricLen = 25 * (info.F_electric / info.F_gravity)

      // 重力（向下）
      ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(dropX + 15, dropY); ctx.lineTo(dropX + 15, dropY + gravityLen); ctx.stroke()
      ctx.fillStyle = '#E53935'
      ctx.beginPath()
      ctx.moveTo(dropX + 15, dropY + gravityLen)
      ctx.lineTo(dropX + 12, dropY + gravityLen - 6)
      ctx.lineTo(dropX + 18, dropY + gravityLen - 6)
      ctx.closePath(); ctx.fill()
      ctx.font = '9px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText('mg', dropX + 20, dropY + gravityLen / 2)

      // 电场力（向上）
      ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(dropX - 15, dropY); ctx.lineTo(dropX - 15, dropY - electricLen); ctx.stroke()
      ctx.fillStyle = '#1565C0'
      ctx.beginPath()
      ctx.moveTo(dropX - 15, dropY - electricLen)
      ctx.lineTo(dropX - 12, dropY - electricLen + 6)
      ctx.lineTo(dropX - 18, dropY - electricLen + 6)
      ctx.closePath(); ctx.fill()
      ctx.fillText('qE', dropX - 45, dropY - electricLen / 2)
    }

    // 油滴（带电）
    const glow = info.balanced ? 0.3 : 0
    if (glow > 0) {
      const grad = ctx.createRadialGradient(dropX, dropY, 0, dropX, dropY, 18)
      grad.addColorStop(0, 'rgba(76,175,80,0.4)')
      grad.addColorStop(1, 'transparent')
      ctx.fillStyle = grad
      ctx.beginPath(); ctx.arc(dropX, dropY, 18, 0, Math.PI * 2); ctx.fill()
    }
    ctx.fillStyle = '#FF9800'; ctx.strokeStyle = '#E65100'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(dropX, dropY, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(s.oilCharge + 'e', dropX, dropY)

    // 电压标注
    ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(`U = ${s.voltage}V`, plateX + plateW / 2, botY + 40)

    // 显微镜观察窗
    ctx.strokeStyle = '#888'; ctx.lineWidth = 1; ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.arc(dropX, dropY, 25, 0, Math.PI * 2); ctx.stroke()
    ctx.setLineDash([])

    // 标注
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('密立根油滴实验装置', x + w / 2, y + h - 18)
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
    ctx.fillText('🎯 密立根油滴实验', x + 12, y + 12)
    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('mg = qE (平衡条件)', x + 12, y + 32)
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444'
    ctx.fillText(`U = ${s.voltage} V`, x + 12, y + 50)
    ctx.fillText(`E = U/d = ${info.E.toExponential(2)} V/m`, x + 12, y + 64)
    ctx.fillText(`q = ${s.oilCharge}e = ${info.q.toExponential(2)} C`, x + 12, y + 78)
    ctx.fillText(`mg = ${info.F_gravity.toExponential(2)} N`, x + 12, y + 92)
    ctx.fillText(`qE = ${info.F_electric.toExponential(2)} N`, x + 12, y + 106)

    let ky = y + 126
    const guideSteps = s.step === 1
      ? ['① 调节电压U', '② 使油滴静止（mg=qE）', '③ 观察油滴位置稳定', '④ 记录平衡电压']
      : s.step === 2
        ? ['① 从平衡条件求q', '② q = mg/E = mgd/U', '③ 多次测量不同油滴', '④ 发现 q 都是整数倍']
        : ['① q₁ = 1e, q₂ = 2e, q₃ = 3e...', '② 所有电荷都是 e 的整数倍', '③ e = 1.6×10⁻¹⁹ C', '④ 电荷是量子化的！']
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('📋 操作步骤', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#5D4037'
    for (let i = 0; i < guideSteps.length; i++) ctx.fillText(guideSteps[i], x + 12, ky + i * 12)
    ky += guideSteps.length * 12 + 6

    ctx.fillStyle = '#C62828'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('⚠ 注意事项', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#B71C1C'
    const notes = s.step === 1
      ? ['• 油滴需带电（摩擦起电）', '• 电压太高油滴跑太快', '• 电压太低油滴下落', '• 需要精确调节到平衡']
      : s.step === 2
        ? ['• q = mgd/U', '• 多次测量减小误差', '• 不同油滴q值不同']
        : ['• e = 1.602×10⁻¹⁹ C', '• 所有带电体的电荷是 e 的整数倍', '• 这就是电荷量子化']
    for (let i = 0; i < notes.length; i++) ctx.fillText(notes[i], x + 12, ky + i * 12)
    ky += notes.length * 12 + 6

    if (s.records.length > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('📊 测量数据', x + 12, ky); ky += 14
      ctx.fillStyle = '#FFB74D'; ctx.fillRect(x + 12, ky, w - 24, 16)
      ctx.fillStyle = '#333'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      const c1 = x + 22, c2 = x + 60, c3 = x + 105, c4 = x + 160
      ctx.fillText('#', c1, ky + 2); ctx.fillText('U(V)', c2, ky + 2); ctx.fillText('q/e', c3, ky + 2); ctx.fillText('q(C)', c4, ky + 2)
      ky += 14
      for (let i = 0; i < s.records.length; i++) {
        const r = s.records[i]
        if (i % 2 === 0) { ctx.fillStyle = '#FFF8E1'; ctx.fillRect(x + 12, ky, w - 24, 13) }
        ctx.fillStyle = '#333'; ctx.font = '8px monospace'; ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), c1, ky + 1); ctx.fillText(r.U, c2, ky + 1); ctx.fillText(r.n, c3, ky + 1); ctx.fillText(r.q, c4, ky + 1)
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
      const s2 = S.current; const inf = millikanInfo(s2)
      s2.records.push({ U: String(s2.voltage), n: String(s2.oilCharge), q: inf.q.toExponential(1) })
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
      S.current.voltage = 200; S.current.oilCharge = 3; S.current.pos = 0.5; S.current.velocity = 0
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
    if (s._guideOpen) { ctx.textAlign = 'left'; ctx.font = '10px sans-serif'; ['① 拖入器材到画布', '② 搭建油滴实验', '③ 观察油滴平衡', '④ 右键删除器材'].forEach((l, i) => ctx.fillText(l, bx + 10, by + 40 + i * 15)) }
    ctx.textBaseline = 'alphabetic'
    drawPalette(ctx, palX, 10, palW, H - 20)
  }

  function drawPalette(ctx, x, y, w, h) {
    ctx.fillStyle = '#fafafa'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('近代物理器材', x + w / 2, y + 10)
    const items = [
      { type: 'oilDrop', name: '带电油滴' }, { type: 'plate', name: '平行极板' },
      { type: 'battery', name: '电源' }, { type: 'microscope', name: '显微镜' },
      { type: 'magnet', name: '磁铁（干扰）' }, { type: 'prism', name: '三棱镜（干扰）' },
    ]
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
    if (type === 'oilDrop') { ctx.fillStyle = '#FF9800'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#E65100'; ctx.stroke() }
    else if (type === 'plate') { ctx.fillStyle = '#FFCDD2'; ctx.fillRect(-9, -7, 18, 5); ctx.fillStyle = '#BBDEFB'; ctx.fillRect(-9, 3, 18, 5) }
    else if (type === 'battery') { ctx.fillStyle = '#4CAF50'; ctx.fillRect(-10, -7, 20, 14); ctx.strokeStyle = '#2E7D32'; ctx.strokeRect(-10, -7, 20, 14) }
    else if (type === 'microscope') { ctx.fillStyle = '#E0E0E0'; ctx.strokeStyle = '#888'; ctx.fillRect(-8, -4, 16, 12); ctx.strokeRect(-8, -4, 16, 12); ctx.strokeStyle = '#666'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, -4); ctx.stroke() }
    else if (type === 'magnet') { ctx.fillStyle = '#E53935'; ctx.fillRect(-10, -6, 10, 12); ctx.fillStyle = '#1565C0'; ctx.fillRect(0, -6, 10, 12) }
    else if (type === 'prism') { ctx.fillStyle = '#E1F5FE'; ctx.strokeStyle = '#1565C0'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(-8, 8); ctx.lineTo(8, 8); ctx.closePath(); ctx.fill(); ctx.stroke() }
    ctx.restore()
  }

  function drawComp(ctx, comp) {
    ctx.save(); ctx.translate(comp.x, comp.y)
    const labels = { oilDrop: '油滴', plate: '极板', battery: '电源', microscope: '显微镜', magnet: '磁铁', prism: '三棱镜' }
    const colors = { oilDrop: '#FFE0B2', plate: '#FFCDD2', battery: '#4CAF50', microscope: '#E0E0E0', magnet: '#FFCDD2', prism: '#E1F5FE' }
    ctx.fillStyle = colors[comp.type] || '#eee'
    ctx.strokeStyle = '#888'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.roundRect(-16, -12, 32, 24, 4); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(labels[comp.type] || comp.type, 0, 0)
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
        <button onClick={() => { S.current.voltage = 200; S.current.oilCharge = 3; S.current.pos = 0.5; S.current.velocity = 0; S.current.records = []; S.current.switchClosed = false; forceUpdate(n => n + 1) }} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', color: '#666', cursor: 'pointer' }}>↺ 重置</button>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} />
      </div>
    </div>
  )
}