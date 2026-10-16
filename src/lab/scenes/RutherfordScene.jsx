import { useState, useRef, useEffect } from 'react'
import SceneShell from '../ui/SceneShell'

/**
 * RutherfordScene — 卢瑟福α粒子散射实验
 *
 * α粒子轰击金箔，绝大多数穿过，少数大角度偏转，极少数反弹
 * 结论：原子的正电荷和几乎全部质量集中在很小的原子核内
 *
 * Step1: 实验现象 — α粒子轰击金箔，统计散射角度分布
 * Step2: 对比模型 — 枣糕模型 vs 核式模型
 * Step3: 结论推导 — 由散射角分布推导原子核式结构
 */
export default function RutherfordScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,
    switchClosed: false,
    model: 'rutherford', // 'plum' | 'rutherford'
    energy: 5,           // MeV
    particles: [],       // 飞行中的α粒子
    scatterData: [],     // 散射角度统计
    fired: 0,
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
        const rect = { width: canvas.clientWidth, height: canvas.clientHeight }
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
      // 更新粒子
      for (let i = s.particles.length - 1; i >= 0; i--) {
        const p = s.particles[i]
        p.x += p.vx * dt * 200
        p.y += p.vy * dt * 200
        if (p.x < -20 || p.x > 120 || p.y < -20 || p.y > 120) {
          s.scatterData.push(p.angle)
          s.particles.splice(i, 1)
        }
      }
      // 自动发射
      if (s.switchClosed && s.particles.length < 15) {
        s.fired++
        s.particles.push(createParticle(s))
      }
      render(R)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function createParticle(s) {
    const y0 = 50 + (Math.random() - 0.5) * 60
    const speed = s.energy * 0.3 + 2
    if (s.model === 'plum') {
      return { x: -5, y: y0, vx: speed, vy: 0, angle: 0 }
    }
    // 核式模型：接近原子核时偏转
    const impact = y0 - 50  // 与中心的偏离距离
    const b = Math.abs(impact) / 25
    const scatterProb = b < 0.3 ? 0.9 : b < 0.6 ? 0.4 : b < 1 ? 0.1 : 0.02
    const scattered = Math.random() < scatterProb
    if (!scattered) {
      return { x: -5, y: y0, vx: speed, vy: 0, angle: 0 }
    }
    const angle = (Math.random() - 0.5) * (b < 0.3 ? 3.0 : b < 0.6 ? 1.2 : 0.5)
    return {
      x: -5, y: y0,
      vx: speed * Math.cos(angle),
      vy: speed * Math.sin(angle),
      angle: Math.abs(angle) * 180 / Math.PI,
    }
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

    const labels = ['① 散射现象', '② 对比模型', '③ 结论推导']
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
        S.current.step = i + 1; S.current.records = []; S.current.scatterData = []; S.current.fired = 0
        setStep(i + 1); forceUpdate(n => n + 1)
      } })
    }
    ctx.textBaseline = 'alphabetic'

    const subs = {
      1: 'α粒子轰击金箔：绝大多数穿过，少数大角度偏转，极少数反弹',
      2: '枣糕模型（正电荷均匀分布）→ 全部直线穿过；核式模型 → 大角度散射',
      3: '结论：原子的正电荷和几乎全部质量集中在很小的原子核内',
    }
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(subs[s.step], W / 2, 52)
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('🎯 实验目的：通过α粒子散射实验建立原子核式结构模型', W / 2, 70)

    // 散射模拟画布
    const cx = W * 0.30, cy = H * 0.45
    drawScattering(ctx, cx, cy, s)

    // 底部参数
    const barY = H - 26
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'

    // 发射按钮
    ctx.fillStyle = s.switchClosed ? '#E53935' : '#4CAF50'
    ctx.beginPath(); ctx.roundRect(55, barY - 13, 70, 26, 5); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.fillText(s.switchClosed ? '⏸ 停止' : '▶ 发射', 72, barY)
    canvasRef.current._clickAreas.push({ x: 55, y: barY - 13, w: 70, h: 26, onClick: () => { S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1) } })

    ctx.fillStyle = '#9C27B0'; ctx.fillText(`能量=${s.energy}MeV`, 135, barY)
    drawMiniSlider(ctx, 215, barY, 60, (s.energy - 1) / 9, (r) => { S.current.energy = Math.round((1 + r * 9) * 2) / 2; forceUpdate(n => n + 1) })

    ctx.fillStyle = '#1565C0'; ctx.fillText(`已发射: ${s.fired} 个`, 290, barY)

    // 模型切换
    ctx.fillStyle = s.model === 'rutherford' ? '#E53935' : '#9E9E9E'
    ctx.beginPath(); ctx.roundRect(385, barY - 13, 80, 26, 5); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.fillText('核式模型', 410, barY)
    canvasRef.current._clickAreas.push({ x: 385, y: barY - 13, w: 80, h: 26, onClick: () => { S.current.model = 'rutherford'; S.current.scatterData = []; S.current.fired = 0; forceUpdate(n => n + 1) } })

    ctx.fillStyle = s.model === 'plum' ? '#FF6F00' : '#9E9E9E'
    ctx.beginPath(); ctx.roundRect(475, barY - 13, 80, 26, 5); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.fillText('枣糕模型', 500, barY)
    canvasRef.current._clickAreas.push({ x: 475, y: barY - 13, w: 80, h: 26, onClick: () => { S.current.model = 'plum'; S.current.scatterData = []; S.current.fired = 0; forceUpdate(n => n + 1) } })

    ctx.textBaseline = 'alphabetic'

    drawRightPanel(ctx, W * 0.56, 80, W - W * 0.56 - 25, H - 140, s)
  }

  // 散射模拟
  function drawScattering(ctx, cx, cy, s) {
    const R2 = Math.min(cx * 0.6, cy * 0.6)

    // 金箔（垂直薄片）
    ctx.fillStyle = 'rgba(255,215,0,0.2)'
    ctx.fillRect(cx - 2, cy - R2, 4, R2 * 2)
    ctx.strokeStyle = '#FFC107'; ctx.lineWidth = 1
    ctx.strokeRect(cx - 2, cy - R2, 4, R2 * 2)

    // 原子核（核式模型）
    if (s.model === 'rutherford') {
      const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 300)
      ctx.fillStyle = `rgba(229,57,53,${pulse})`
      ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#B71C1C'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('Au核', cx, cy + 16)
    } else {
      // 枣糕模型：正电荷均匀分布
      ctx.fillStyle = 'rgba(255,152,0,0.15)'
      ctx.beginPath(); ctx.arc(cx, cy, 25, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#FF9800'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('正电荷均匀分布', cx, cy)
    }

    // 飞行粒子
    for (const p of s.particles) {
      const px = cx + (p.x - 50) * (R2 / 30)
      const py = cy + (p.y - 50) * (R2 / 30)
      // 轨迹
      ctx.strokeStyle = 'rgba(229,57,53,0.3)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(cx - R2 * 0.9, py); ctx.lineTo(px, py); ctx.stroke()
      // 粒子
      ctx.fillStyle = '#E53935'
      ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill()
    }

    // 散射统计直方图
    if (s.scatterData.length > 0) {
      const histX = cx + R2 + 30, histY = cy - R2
      const histH = R2 * 2
      const bins = [0, 0, 0, 0, 0] // 0-5°, 5-15°, 15-30°, 30-60°, >60°
      for (const a of s.scatterData) {
        if (a < 5) bins[0]++
        else if (a < 15) bins[1]++
        else if (a < 30) bins[2]++
        else if (a < 60) bins[3]++
        else bins[4]++
      }
      const maxBin = Math.max(...bins, 1)
      for (let i = 0; i < 5; i++) {
        const bh2 = (bins[i] / maxBin) * (histH * 0.8)
        const bx = histX + i * 16
        ctx.fillStyle = i < 2 ? '#4CAF50' : i < 4 ? '#FF9800' : '#E53935'
        ctx.fillRect(bx, histY + histH - bh2, 12, bh2)
      }
      ctx.fillStyle = '#555'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText('散射角分布', histX + 40, histY + histH + 6)
      ctx.textBaseline = 'alphabetic'
    }

    // 标注
    ctx.fillStyle = '#5D4037'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('α粒子 → 金箔', cx, cy + R2 + 16)
    if (s.model === 'rutherford') {
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('绝大多数穿过，少数大偏转', cx, cy + R2 + 32)
    }
    ctx.textBaseline = 'alphabetic'
  }

  function drawMiniSlider(ctx, x, y, w, ratio, onChange) {
    ctx.strokeStyle = '#bbb'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke()
    const kx = x + Math.max(0, Math.min(1, ratio)) * w
    ctx.fillStyle = '#FF9800'; ctx.beginPath(); ctx.arc(kx, y, 6, 0, Math.PI * 2); ctx.fill()
    canvasRef.current._clickAreas.push({ x: x - 8, y: y - 14, w: w + 16, h: 28, onClick: (mx) => onChange(Math.max(0, Math.min(1, (mx - x) / w))) })
  }

  function drawRightPanel(ctx, x, y, w, h, s) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('🎯 α粒子散射实验', x + 12, y + 12)
    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(s.model === 'rutherford' ? '核式模型：正电荷集中在原子核' : '枣糕模型：正电荷均匀分布', x + 12, y + 32)
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444'
    ctx.fillText(`已发射 ${s.fired} 个α粒子`, x + 12, y + 50)

    let ky = y + 70
    const guideSteps = s.step === 1
      ? ['① 点"发射"放出α粒子', '② 观察散射角度分布', '③ 大多数直线穿过', '④ 少数大角度偏转/反弹']
      : s.step === 2
        ? ['① 切换枣糕/核式模型', '② 枣糕：全部直线穿过', '③ 核式：少数大角度散射', '④ 对比两种模型的预测']
        : ['① 大多数穿过→原子内部很空', '② 少数偏转→正电荷集中', '③ 极少数反弹→质量集中', '④ 结论：核式结构']
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('📋 操作步骤', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#5D4037'
    for (let i = 0; i < guideSteps.length; i++) ctx.fillText(guideSteps[i], x + 12, ky + i * 12)
    ky += guideSteps.length * 12 + 6

    ctx.fillStyle = '#C62828'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('⚠ 注意事项', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#B71C1C'
    const notes = s.step === 1
      ? ['• α粒子是氦原子核（带正电）', '• 金箔极薄（约1000层原子）', '• 散射角越大，越靠近原子核']
      : s.step === 2
        ? ['• 枣糕模型：正电荷均匀分布', '• 枣糕模型预测全部直线穿过', '• 实验结果否定枣糕模型']
        : ['• 原子核体积很小但质量集中', '• 原子内部大部分是空的', '• 库仑斥力使α粒子偏转']
    for (let i = 0; i < notes.length; i++) ctx.fillText(notes[i], x + 12, ky + i * 12)
    ky += notes.length * 12 + 6

    if (s.records.length > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('📊 散射统计', x + 12, ky); ky += 14
      ctx.fillStyle = '#FFB74D'; ctx.fillRect(x + 12, ky, w - 24, 16)
      ctx.fillStyle = '#333'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      const c1 = x + 26, c2 = x + 70, c3 = x + 130
      ctx.fillText('#', c1, ky + 2); ctx.fillText('总数', c2, ky + 2); ctx.fillText('大偏转', c3, ky + 2)
      ky += 14
      for (let i = 0; i < s.records.length; i++) {
        const r = s.records[i]
        if (i % 2 === 0) { ctx.fillStyle = '#FFF8E1'; ctx.fillRect(x + 12, ky, w - 24, 13) }
        ctx.fillStyle = '#333'; ctx.font = '9px monospace'; ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), c1, ky + 1); ctx.fillText(String(r.total), c2, ky + 1); ctx.fillText(String(r.large), c3, ky + 1)
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
      const s2 = S.current
      const large = s2.scatterData.filter(a => a > 15).length
      s2.records.push({ total: s2.fired, large })
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
      S.current.particles = []; S.current.scatterData = []; S.current.fired = 0
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
    if (s._guideOpen) { ctx.textAlign = 'left'; ctx.font = '10px sans-serif'; ['① 拖入器材到画布', '② 搭建α散射实验', '③ 观察散射现象', '④ 右键删除器材'].forEach((l, i) => ctx.fillText(l, bx + 10, by + 40 + i * 15)) }
    ctx.textBaseline = 'alphabetic'
    drawPalette(ctx, palX, 10, palW, H - 20)
  }

  function drawPalette(ctx, x, y, w, h) {
    ctx.fillStyle = '#fafafa'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('近代物理器材', x + w / 2, y + 10)
    const items = [
      { type: 'alphaSource', name: 'α粒子源' }, { type: 'goldFoil', name: '金箔' },
      { type: 'detector', name: '荧光屏' }, { type: 'vacuum', name: '真空容器' },
      { type: 'battery', name: '电源（干扰）' }, { type: 'magnet', name: '磁铁（干扰）' },
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
    if (type === 'alphaSource') { ctx.fillStyle = '#E53935'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('α', 0, 2) }
    else if (type === 'goldFoil') { ctx.fillStyle = '#FFD54F'; ctx.fillRect(-2, -8, 4, 16); ctx.strokeStyle = '#FFC107'; ctx.strokeRect(-2, -8, 4, 16) }
    else if (type === 'detector') { ctx.fillStyle = '#E8F5E9'; ctx.strokeStyle = '#4CAF50'; ctx.fillRect(-8, -6, 16, 12); ctx.strokeRect(-8, -6, 16, 12) }
    else if (type === 'vacuum') { ctx.fillStyle = '#E0E0E0'; ctx.strokeStyle = '#888'; ctx.beginPath(); ctx.roundRect(-9, -6, 18, 12, 3); ctx.fill(); ctx.stroke() }
    else if (type === 'battery') { ctx.fillStyle = '#4CAF50'; ctx.fillRect(-10, -7, 20, 14); ctx.strokeStyle = '#2E7D32'; ctx.strokeRect(-10, -7, 20, 14) }
    else if (type === 'magnet') { ctx.fillStyle = '#E53935'; ctx.fillRect(-10, -6, 10, 12); ctx.fillStyle = '#1565C0'; ctx.fillRect(0, -6, 10, 12) }
    ctx.restore()
  }

  function drawComp(ctx, comp) {
    ctx.save(); ctx.translate(comp.x, comp.y)
    const labels = { alphaSource: 'α源', goldFoil: '金箔', detector: '荧光屏', vacuum: '真空容器', battery: '电源', magnet: '磁铁' }
    const colors = { alphaSource: '#FFCDD2', goldFoil: '#FFF9C4', detector: '#E8F5E9', vacuum: '#E0E0E0', battery: '#4CAF50', magnet: '#FFCDD2' }
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
    <SceneShell
      title="卢瑟福α粒子散射实验"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t); forceUpdate(n => n + 1) }}
      tab1Label="📊 实验演示"
      tab2Label="🔧 自己动手"
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} />
    </SceneShell>
  )
}
