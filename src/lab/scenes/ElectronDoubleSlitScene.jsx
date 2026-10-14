import { useState, useRef, useEffect } from 'react'

/**
 * ElectronDoubleSlitScene — 电子双缝干涉（波粒二象性）
 *
 * 德布罗意波长 λ = h/p = h/√(2meU)
 * 单电子逐点打屏累积干涉条纹
 *
 * Step1: 粒子性 — 单个电子打在屏幕上是一个点
 * Step2: 波动性 — 大量电子累积形成干涉条纹
 * Step3: 波粒二象性 — 调节电压改变德布罗意波长
 */
export default function ElectronDoubleSlitScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,
    switchClosed: false,
    voltage: 5000,    // V 加速电压
    electrons: [],    // 打在屏幕上的电子位置
    totalCount: 0,
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

    const loop = () => {
      const s = S.current
      if (s.switchClosed) {
        // 逐个发射电子
        for (let i = 0; i < 3; i++) {
          const lambda = deBroglie(s.voltage)
          const y = (Math.random() - 0.5) * 2 // 归一化位置 -1~1
          // 双缝干涉概率分布
          const p = Math.abs(Math.cos(y * 50 / lambda * 0.00001 + s.totalCount * 0.0001)) ** 2
          if (Math.random() < p || s.totalCount < 50) {
            s.electrons.push({ y: y + Math.sin(s.totalCount * 12.3) * 0.05, color: Math.random() > 0.5 ? '#1565C0' : '#E53935' })
            s.totalCount++
          }
          if (s.electrons.length > 500) s.electrons.shift()
        }
      }
      render(R)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function deBroglie(U) {
    const h = 6.626e-34
    const m = 9.109e-31
    const e = 1.602e-19
    return h / Math.sqrt(2 * m * e * U) * 1e12 // pm
  }

  function dsInfo(s) {
    const lambda = deBroglie(s.voltage)
    return { lambda }
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
    const info = dsInfo(s)

    const labels = ['① 粒子性', '② 波动性', '③ 波粒二象性']
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
        S.current.step = i + 1; S.current.records = []; S.current.electrons = []; S.current.totalCount = 0
        setStep(i + 1); forceUpdate(n => n + 1)
      } })
    }
    ctx.textBaseline = 'alphabetic'

    const subs = {
      1: '单个电子打在屏幕上是一个点（粒子性）',
      2: '大量电子累积形成干涉条纹（波动性）',
      3: '调节加速电压改变德布罗意波长，观察条纹间距变化',
    }
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(subs[s.step], W / 2, 52)
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('🎯 实验目的：理解波粒二象性，掌握德布罗意波长公式', W / 2, 70)

    // 双缝干涉可视化
    drawDoubleSlit(ctx, W * 0.12, 80, W * 0.40, H - 140, s, info)

    // 屏幕累积条纹
    drawScreen(ctx, W * 0.56, 80, W * 0.40, H - 140, s, info)

    // 底部
    const barY = H - 26
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillStyle = s.switchClosed ? '#E53935' : '#4CAF50'
    ctx.beginPath(); ctx.roundRect(55, barY - 13, 80, 26, 5); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.fillText(s.switchClosed ? '⏸ 停止' : '▶ 发射电子', 72, barY)
    canvasRef.current._clickAreas.push({ x: 55, y: barY - 13, w: 80, h: 26, onClick: () => { S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1) } })

    ctx.fillStyle = '#9C27B0'; ctx.fillText(`U=${s.voltage}V`, 145, barY)
    drawMiniSlider(ctx, 210, barY, 80, (s.voltage - 1000) / 9000, (r) => {
      S.current.voltage = Math.round(1000 + r * 9000); S.current.electrons = []; S.current.totalCount = 0
      forceUpdate(n => n + 1)
    })

    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`λ = ${info.lambda.toFixed(1)} pm`, 310, barY)
    ctx.fillStyle = '#333'
    ctx.fillText(`已发射 ${s.totalCount} 个电子`, 420, barY)
    ctx.textBaseline = 'alphabetic'

    drawRightPanel(ctx, W * 0.56, H * 0.55, W - W * 0.56 - 25, H - H * 0.55 - 35, s, info)
  }

  // 双缝干涉装置
  function drawDoubleSlit(ctx, x, y, w, h, s, _info) {
    // 电子源
    const srcX = x + 30, srcY = y + h / 2
    ctx.fillStyle = s.switchClosed ? '#E53935' : '#999'
    ctx.beginPath(); ctx.arc(srcX, srcY, 12, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('e⁻', srcX, srcY)

    // 双缝板
    const slitX = x + w * 0.45
    const slitW = 4
    const slitH = 12
    const slitSep = 40
    ctx.fillStyle = '#8D6E63'
    // 上板
    ctx.fillRect(slitX, y + 20, slitW, h / 2 - 45 - slitSep / 2)
    // 中板（两缝之间）
    ctx.fillRect(slitX, y + h/2 - slitSep/2 + slitH/2, slitW, slitSep - slitH)
    // 下板
    ctx.fillRect(slitX, y + h/2 + slitSep/2 + slitH/2, slitW, h/2 - 45 - slitSep/2)

    // 缝标注
    ctx.fillStyle = '#333'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('缝1', slitX + slitW/2, y + h/2 - slitSep/2)
    ctx.fillText('缝2', slitX + slitW/2, y + h/2 + slitSep/2)

    // 波动性示意（电子波从两缝发散）
    if (s.switchClosed) {
      const time = Date.now() / 1000
      for (let i = 0; i < 2; i++) {
        const cy = y + h/2 + (i === 0 ? -1 : 1) * slitSep/2
        // 波纹
        for (let r = 1; r < 5; r++) {
          const radius = r * 15 + (time % 1) * 15
          ctx.strokeStyle = `rgba(33,150,243,${0.3 - r * 0.05})`
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.arc(slitX + slitW, cy, radius, -Math.PI/2, Math.PI/2)
          ctx.stroke()
        }
      }
    }

    // 标注
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('电子枪 → 双缝', x + w / 2, y + h - 18)
    ctx.textBaseline = 'alphabetic'
  }

  // 屏幕干涉条纹
  function drawScreen(ctx, x, y, w, h, s, _info) {
    // 屏幕背景
    ctx.fillStyle = '#111'
    ctx.fillRect(x, y, w, h)

    // 干涉条纹累积
    const scrW = w * 0.3, scrH = h * 0.8
    const scrX = x + w * 0.35, scrY = y + h * 0.1

    // 逐点画电子
    for (const e of s.electrons) {
      const py = scrY + ((e.y + 1) / 2) * scrH
      const px = scrX + Math.random() * scrW
      ctx.fillStyle = e.color
      ctx.globalAlpha = 0.15
      ctx.beginPath(); ctx.arc(px, py, 1.5, 0, Math.PI * 2); ctx.fill()
    }
    ctx.globalAlpha = 1

    // 屏幕边框
    ctx.strokeStyle = '#444'; ctx.lineWidth = 2
    ctx.strokeRect(scrX, scrY, scrW, scrH)

    // 干涉条纹分布曲线（右侧）
    const graphX = scrX + scrW + 20
    const graphW = 60
    if (s.electrons.length > 20) {
      // 计算y方向分布
      const bins = 20
      const counts = new Array(bins).fill(0)
      for (const e of s.electrons) {
        const bin = Math.floor(((e.y + 1) / 2) * bins)
        if (bin >= 0 && bin < bins) counts[bin]++
      }
      const maxCount = Math.max(...counts, 1)
      for (let i = 0; i < bins; i++) {
        const by = scrY + (i / bins) * scrH
        const bw2 = (counts[i] / maxCount) * graphW
        ctx.fillStyle = '#4CAF50'
        ctx.fillRect(graphX, by, bw2, scrH / bins)
      }
    }

    // 标注
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('干涉条纹', scrX + scrW / 2, y + h - 16)
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
    ctx.fillText('🎯 电子双缝干涉', x + 12, y + 12)
    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('λ = h / √(2meU)', x + 12, y + 32)
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444'
    ctx.fillText(`U = ${s.voltage} V`, x + 12, y + 50)
    ctx.fillText(`λ = ${info.lambda.toFixed(1)} pm`, x + 12, y + 64)
    ctx.fillText(`已发射 ${s.totalCount} 个电子`, x + 12, y + 80)

    let ky = y + 100
    const guideSteps = s.step === 1
      ? ['① 逐个发射电子', '② 每个电子打在屏幕上一个点', '③ 单个电子显示粒子性']
      : s.step === 2
        ? ['① 持续发射大量电子', '② 累积形成干涉条纹', '③ 显示波动性']
        : ['① 调节加速电压U', '② U↑→λ↓', '③ 条纹间距变化', '④ 验证 λ=h/√(2meU)']
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('📋 操作步骤', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#5D4037'
    for (let i = 0; i < guideSteps.length; i++) ctx.fillText(guideSteps[i], x + 12, ky + i * 12)
    ky += guideSteps.length * 12 + 6

    ctx.fillStyle = '#C62828'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('⚠ 注意事项', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#B71C1C'
    const notes = s.step === 1
      ? ['• 单个电子打在屏幕上是一个点', '• 不可预测落在何处', '• 体现了粒子性']
      : s.step === 2
        ? ['• 大量电子累积形成干涉条纹', '• 与光的双缝干涉类似', '• 体现了波动性']
        : ['• λ = h/p = h/√(2meU)', '• U越大，λ越小，条纹越密', '• 波粒二象性是微观粒子本质属性']
    for (let i = 0; i < notes.length; i++) ctx.fillText(notes[i], x + 12, ky + i * 12)
    ky += notes.length * 12 + 6

    if (s.records.length > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('📊 实验数据', x + 12, ky); ky += 14
      ctx.fillStyle = '#FFB74D'; ctx.fillRect(x + 12, ky, w - 24, 16)
      ctx.fillStyle = '#333'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      const c1 = x + 22, c2 = x + 70, c3 = x + 140
      ctx.fillText('#', c1, ky + 2); ctx.fillText('U(V)', c2, ky + 2); ctx.fillText('λ(pm)', c3, ky + 2)
      ky += 14
      for (let i = 0; i < s.records.length; i++) {
        const r = s.records[i]
        if (i % 2 === 0) { ctx.fillStyle = '#FFF8E1'; ctx.fillRect(x + 12, ky, w - 24, 13) }
        ctx.fillStyle = '#333'; ctx.font = '9px monospace'; ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), c1, ky + 1); ctx.fillText(String(r.U), c2, ky + 1); ctx.fillText(r.lam, c3, ky + 1)
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
      const s2 = S.current; const inf = dsInfo(s2)
      s2.records.push({ U: s2.voltage, lam: inf.lambda.toFixed(1) })
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
      S.current.voltage = 5000; S.current.electrons = []; S.current.totalCount = 0
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
    if (s._guideOpen) { ctx.textAlign = 'left'; ctx.font = '10px sans-serif'; ['① 拖入器材到画布', '② 搭建双缝干涉实验', '③ 观察干涉条纹', '④ 右键删除器材'].forEach((l, i) => ctx.fillText(l, bx + 10, by + 40 + i * 15)) }
    ctx.textBaseline = 'alphabetic'
    drawPalette(ctx, palX, 10, palW, H - 20)
  }

  function drawPalette(ctx, x, y, w, h) {
    ctx.fillStyle = '#fafafa'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('近代物理器材', x + w / 2, y + 10)
    const items = [
      { type: 'electronGun', name: '电子枪' }, { type: 'doubleSlit', name: '双缝板' },
      { type: 'screen', name: '荧光屏' }, { type: 'battery', name: '加速电压源' },
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
    if (type === 'electronGun') { ctx.fillStyle = '#E53935'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('e⁻', 0, 2) }
    else if (type === 'doubleSlit') { ctx.fillStyle = '#8D6E63'; ctx.fillRect(-3, -8, 6, 12); ctx.fillRect(-3, 2, 6, 12); ctx.fillStyle = '#fff'; ctx.fillRect(-3, -2, 6, 4) }
    else if (type === 'screen') { ctx.fillStyle = '#263238'; ctx.fillRect(-10, -6, 20, 12) }
    else if (type === 'battery') { ctx.fillStyle = '#4CAF50'; ctx.fillRect(-10, -7, 20, 14); ctx.strokeStyle = '#2E7D32'; ctx.strokeRect(-10, -7, 20, 14) }
    else if (type === 'magnet') { ctx.fillStyle = '#E53935'; ctx.fillRect(-10, -6, 10, 12); ctx.fillStyle = '#1565C0'; ctx.fillRect(0, -6, 10, 12) }
    else if (type === 'prism') { ctx.fillStyle = '#E1F5FE'; ctx.strokeStyle = '#1565C0'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(-8, 8); ctx.lineTo(8, 8); ctx.closePath(); ctx.fill(); ctx.stroke() }
    ctx.restore()
  }

  function drawComp(ctx, comp) {
    ctx.save(); ctx.translate(comp.x, comp.y)
    const labels = { electronGun: '电子枪', doubleSlit: '双缝', screen: '屏幕', battery: '电压源', magnet: '磁铁', prism: '三棱镜' }
    const colors = { electronGun: '#FFCDD2', doubleSlit: '#D7CCC8', screen: '#263238', battery: '#4CAF50', magnet: '#FFCDD2', prism: '#E1F5FE' }
    ctx.fillStyle = colors[comp.type] || '#eee'
    ctx.strokeStyle = '#888'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.roundRect(-16, -12, 32, 24, 4); ctx.fill(); ctx.stroke()
    ctx.fillStyle = (comp.type === 'screen') ? '#fff' : '#333'
    ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
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
        <button onClick={() => { S.current.voltage = 5000; S.current.electrons = []; S.current.totalCount = 0; S.current.records = []; S.current.switchClosed = false; forceUpdate(n => n + 1) }} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', color: '#666', cursor: 'pointer' }}>↺ 重置</button>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} />
      </div>
    </div>
  )
}