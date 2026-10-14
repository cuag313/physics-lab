import { useState, useRef, useEffect } from 'react'
import SceneShell from '../ui/SceneShell'

/**
 * NuclearReactionScene — 核裂变与核聚变模拟
 *
 * 质能方程 E = mc²，质量亏损 → 释放能量
 * 裂变：²³⁵U + n → ¹⁴¹Ba + ⁹²Kr + 3n + 能量
 * 聚变：²H + ³H → ⁴He + n + 能量
 *
 * Step1: 核裂变 — 链式反应条件，临界质量
 * Step2: 核聚变 — 极高温条件，太阳能源
 * Step3: 质能方程 — ΔE = Δm × c²
 */
export default function NuclearReactionScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,
    switchClosed: false,
    mode: 'fission', // 'fission' | 'fusion'
    energy: 1,       // 相对能量倍数
    particles: [],   // 动画粒子
    t: 0,
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
        s.t += 0.016
        // 随机生成粒子
        if (s.particles.length < 20 && Math.random() < 0.05) {
          s.particles.push(createParticle(s))
        }
        for (let i = s.particles.length - 1; i >= 0; i--) {
          const p = s.particles[i]
          p.x += p.vx * 0.02
          p.y += p.vy * 0.02
          p.life -= 0.01
          if (p.life <= 0) s.particles.splice(i, 1)
        }
      }
      render(R)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function createParticle(s) {
    const cx = 0.5, cy = 0.4
    const angle = Math.random() * Math.PI * 2
    const speed = 0.01 + Math.random() * 0.03
    return {
      x: cx + (Math.random() - 0.5) * 0.1,
      y: cy + (Math.random() - 0.5) * 0.1,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      color: s.mode === 'fission'
        ? (Math.random() > 0.5 ? '#E53935' : '#FF9800')
        : (Math.random() > 0.5 ? '#FFEB3B' : '#FF9800'),
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

    const labels = ['① 核裂变', '② 核聚变', '③ 质能方程']
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
        S.current.mode = i === 0 ? 'fission' : i === 1 ? 'fusion' : s.mode
        S.current.particles = []
        setStep(i + 1); forceUpdate(n => n + 1)
      } })
    }
    ctx.textBaseline = 'alphabetic'

    const subs = {
      1: '铀-235裂变链式反应：n + ²³⁵U → ¹⁴¹Ba + ⁹²Kr + 3n + 能量',
      2: '氘氚聚变：²H + ³H → ⁴He + n + 能量（需极高温）',
      3: 'ΔE = Δm × c²，质量亏损转化为释放的巨大能量',
    }
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(subs[s.step], W / 2, 52)
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('🎯 实验目的：理解核裂变/聚变过程，掌握质能方程 E=mc²', W / 2, 70)

    // 核反应动画
    drawNuclearReaction(ctx, W * 0.10, 80, W * 0.44, H - 140, s)

    // 方程式/能量面板
    drawEquationPanel(ctx, W * 0.58, 80, W * 0.38, H - 140, s)

    // 底部
    const barY = H - 26
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillStyle = s.switchClosed ? '#E53935' : '#4CAF50'
    ctx.beginPath(); ctx.roundRect(55, barY - 13, 80, 26, 5); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.fillText(s.switchClosed ? '⏸ 暂停' : '▶ 模拟', 72, barY)
    canvasRef.current._clickAreas.push({ x: 55, y: barY - 13, w: 80, h: 26, onClick: () => { S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1) } })

    // 模式切换
    ctx.fillStyle = s.mode === 'fission' ? '#E53935' : '#9E9E9E'
    ctx.beginPath(); ctx.roundRect(145, barY - 13, 70, 26, 5); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.fillText('核裂变', 172, barY)
    canvasRef.current._clickAreas.push({ x: 145, y: barY - 13, w: 70, h: 26, onClick: () => { S.current.mode = 'fission'; S.current.particles = []; forceUpdate(n => n + 1) } })

    ctx.fillStyle = s.mode === 'fusion' ? '#FF9800' : '#9E9E9E'
    ctx.beginPath(); ctx.roundRect(225, barY - 13, 70, 26, 5); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.fillText('核聚变', 252, barY)
    canvasRef.current._clickAreas.push({ x: 225, y: barY - 13, w: 70, h: 26, onClick: () => { S.current.mode = 'fusion'; S.current.particles = []; forceUpdate(n => n + 1) } })

    ctx.textBaseline = 'alphabetic'

    drawRightPanel(ctx, W * 0.56, H * 0.55, W - W * 0.56 - 25, H - H * 0.55 - 35, s)
  }

  // 核反应动画
  function drawNuclearReaction(ctx, x, y, w, h, s) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ddd'
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()

    const cx = x + w / 2, cy = y + h / 2

    if (s.mode === 'fission') {
      // 裂变：大核 → 小核 + 中子
      // 中心大核
      const r1 = 25
      ctx.fillStyle = '#1565C0'
      ctx.beginPath(); ctx.arc(cx, cy, r1, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('U-235', cx, cy)

      // 裂变产物
      const prodA = { x: cx - 40, y: cy - 30, r: 15, label: 'Ba-141', color: '#E53935' }
      const prodB = { x: cx + 40, y: cy + 30, r: 15, label: 'Kr-92', color: '#FF9800' }
      const neutrons = [
        { x: cx - 35, y: cy + 35, r: 5, label: 'n' },
        { x: cx + 35, y: cy - 35, r: 5, label: 'n' },
        { x: cx + 55, y: cy + 5, r: 5, label: 'n' },
      ]

      for (const p of [prodA, prodB]) {
        ctx.fillStyle = p.color
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'
        ctx.fillText(p.label, p.x, p.y)
      }
      for (const n of neutrons) {
        ctx.fillStyle = '#999'
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#fff'; ctx.font = 'bold 7px sans-serif'
        ctx.fillText(n.label, n.x, n.y)
      }

      // 中子撞击
      if (s.switchClosed) {
        const pulse = Math.sin(Date.now() / 300) * 0.5 + 0.5
        ctx.fillStyle = `rgba(156,39,176,${pulse * 0.5})`
        ctx.beginPath(); ctx.arc(cx, cy, r1 + pulse * 15, 0, Math.PI * 2); ctx.fill()
      }

      // 粒子动画
      for (const p of s.particles) {
        const px = x + p.x * w, py = y + p.y * h
        ctx.fillStyle = p.color
        ctx.globalAlpha = p.life * 0.7
        ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill()
        ctx.globalAlpha = 1
      }

      // 标注
      ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText('核裂变链式反应', cx, y + h - 22)
    } else {
      // 聚变：小核 → 大核 + 中子
      // 两个小核
      const d = { x: cx - 35, y: cy - 15, r: 15, label: 'D', color: '#1565C0' }
      const t = { x: cx + 35, y: cy + 15, r: 15, label: 'T', color: '#E53935' }
      const he = { x: cx, y: cy, r: 20, label: 'He-4', color: '#FF9800' }
      const n = { x: cx + 55, y: cy - 35, r: 5, label: 'n', color: '#999' }

      for (const p of [d, t]) {
        ctx.fillStyle = p.color
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'
        ctx.fillText(p.label, p.x, p.y)
      }

      // 聚变产物
      if (s.switchClosed) {
        const pulse = Math.sin(Date.now() / 300) * 0.5 + 0.5
        ctx.fillStyle = `rgba(255,152,0,${pulse * 0.3})`
        ctx.beginPath(); ctx.arc(he.x, he.y, he.r + pulse * 12, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = he.color
        ctx.beginPath(); ctx.arc(he.x, he.y, he.r, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'
        ctx.fillText(he.label, he.x, he.y)
        ctx.fillStyle = n.color
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#fff'; ctx.font = 'bold 7px sans-serif'
        ctx.fillText(n.label, n.x, n.y)
      }

      // 粒子动画
      for (const p of s.particles) {
        const px = x + p.x * w, py = y + p.y * h
        ctx.fillStyle = p.color
        ctx.globalAlpha = p.life * 0.7
        ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill()
        ctx.globalAlpha = 1
      }

      // 标注
      ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText('核聚变（需极高温度）', cx, y + h - 22)
    }

    // 底部注释
    ctx.fillStyle = '#666'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(s.mode === 'fission' ? '裂变：大核分裂释放能量' : '聚变：小核结合释放能量', cx, y + h - 10)
    ctx.textBaseline = 'alphabetic'
  }

  // 方程式/能量面板
  function drawEquationPanel(ctx, x, y, w, h, s) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ddd'
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()

    const cx = x + w / 2
    let cy = y + 30

    ctx.fillStyle = '#333'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(s.mode === 'fission' ? '核裂变方程' : '核聚变方程', cx, cy); cy += 30

    ctx.fillStyle = '#1565C0'; ctx.font = '11px sans-serif'
    if (s.mode === 'fission') {
      ctx.fillText('²³⁵U + n → ¹⁴¹Ba + ⁹²Kr + 3n', cx, cy); cy += 20
    } else {
      ctx.fillText('²H + ³H → ⁴He + n', cx, cy); cy += 20
    }

    cy += 15
    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 12px sans-serif'
    ctx.fillText('ΔE = Δm × c²', cx, cy); cy += 25

    ctx.fillStyle = '#333'; ctx.font = '11px sans-serif'
    ctx.fillText(`c = 3×10⁸ m/s`, cx, cy); cy += 18
    ctx.fillText(`1u = 931.5 MeV/c²`, cx, cy); cy += 25

    // 能量释放对比
    ctx.fillStyle = '#4CAF50'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('能量释放对比', cx, cy); cy += 22

    ctx.fillStyle = '#333'; ctx.font = '10px sans-serif'
    if (s.mode === 'fission') {
      ctx.fillText('裂变：~200 MeV/核', cx, cy); cy += 16
      ctx.fillText('煤：~35 MJ/kg', cx, cy); cy += 16
      ctx.fillText('铀：~80,000,000 MJ/kg', cx, cy); cy += 25
    } else {
      ctx.fillText('聚变：~17.6 MeV/核', cx, cy); cy += 16
      ctx.fillText('比裂变少但燃料更丰富', cx, cy); cy += 16
      ctx.fillText('太阳：~6亿吨氢/秒', cx, cy); cy += 25
    }

    // 应用
    ctx.fillStyle = '#7B1FA2'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('应用', cx, cy); cy += 18
    ctx.fillStyle = '#555'; ctx.font = '10px sans-serif'
    if (s.mode === 'fission') {
      ctx.fillText('核电站、原子弹、核潜艇', cx, cy)
    } else {
      ctx.fillText('氢弹、太阳、可控核聚变', cx, cy)
    }
    ctx.textBaseline = 'alphabetic'
  }

  function drawRightPanel(ctx, x, y, w, h, s) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('🎯 核裂变与核聚变', x + 12, y + 12)
    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('ΔE = Δm × c²', x + 12, y + 32)
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444'
    ctx.fillText(`模式: ${s.mode === 'fission' ? '核裂变' : '核聚变'}`, x + 12, y + 50)

    let ky = y + 70
    const guideSteps = s.step === 1
      ? ['① 点"模拟"启动裂变', '② 中子撞击铀核', '③ 产生裂变产物+新中子', '④ 链式反应条件：临界质量']
      : s.step === 2
        ? ['① 切换到聚变模式', '② 氘氚核结合', '③ 需要极高温度(>10⁸K)', '④ 太阳内部持续聚变']
        : ['① 质量亏损→能量释放', '② ΔE=Δm×c²', '③ 1u=931.5 MeV/c²', '④ 能量密度远超化学反应']
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('📋 操作步骤', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#5D4037'
    for (let i = 0; i < guideSteps.length; i++) ctx.fillText(guideSteps[i], x + 12, ky + i * 12)
    ky += guideSteps.length * 12 + 6

    ctx.fillStyle = '#C62828'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('⚠ 注意事项', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#B71C1C'
    const notes = s.step === 1
      ? ['• 链式反应需要临界质量', '• 核电站控制中子再生率', '• 核废料有放射性']
      : s.step === 2
        ? ['• 需要极高温度（>10⁸K）', '• 太阳靠引力约束等离子体', '• 可控核聚变是未来能源方向']
        : ['• 光速c很大，少量质量释放巨大能量', '• 质量亏损Δm = 反应前后质量差', '• 铀：8000万MJ/kg vs 煤：35MJ/kg']
    for (let i = 0; i < notes.length; i++) ctx.fillText(notes[i], x + 12, ky + i * 12)
    ky += notes.length * 12 + 6

    if (s.records.length > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('📊 能量对比', x + 12, ky); ky += 14
      ctx.fillStyle = '#FFB74D'; ctx.fillRect(x + 12, ky, w - 24, 16)
      ctx.fillStyle = '#333'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      const c1 = x + 26, c2 = x + 75, c3 = x + 135
      ctx.fillText('#', c1, ky + 2); ctx.fillText('类型', c2, ky + 2); ctx.fillText('能量(MeV)', c3, ky + 2)
      ky += 14
      for (let i = 0; i < s.records.length; i++) {
        const r = s.records[i]
        if (i % 2 === 0) { ctx.fillStyle = '#FFF8E1'; ctx.fillRect(x + 12, ky, w - 24, 13) }
        ctx.fillStyle = '#333'; ctx.font = '9px monospace'; ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), c1, ky + 1); ctx.fillText(r.type, c2, ky + 1); ctx.fillText(r.e, c3, ky + 1)
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
      s2.records.push({ type: s2.mode === 'fission' ? '裂变' : '聚变', e: s2.mode === 'fission' ? '200' : '17.6' })
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
      S.current.mode = 'fission'; S.current.particles = []; S.current.records = []; S.current.switchClosed = false
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
    if (s._guideOpen) { ctx.textAlign = 'left'; ctx.font = '10px sans-serif'; ['① 拖入核子到画布', '② 搭建核反应模型', '③ 观察能量释放', '④ 右键删除器材'].forEach((l, i) => ctx.fillText(l, bx + 10, by + 40 + i * 15)) }
    ctx.textBaseline = 'alphabetic'
    drawPalette(ctx, palX, 10, palW, H - 20)
  }

  function drawPalette(ctx, x, y, w, h) {
    ctx.fillStyle = '#fafafa'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('近代物理器材', x + w / 2, y + 10)
    const items = [
      { type: 'uranium', name: '铀-235' }, { type: 'neutron', name: '中子' },
      { type: 'deuterium', name: '氘' }, { type: 'tritium', name: '氚' },
      { type: 'energyMeter', name: '能量检测器' }, { type: 'battery', name: '电源（干扰）' },
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
    if (type === 'uranium') { ctx.fillStyle = '#1565C0'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('U', 0, 2) }
    else if (type === 'neutron') { ctx.fillStyle = '#999'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('n', 0, 2) }
    else if (type === 'deuterium') { ctx.fillStyle = '#1565C0'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('D', 0, 2) }
    else if (type === 'tritium') { ctx.fillStyle = '#E53935'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('T', 0, 2) }
    else if (type === 'energyMeter') { ctx.fillStyle = '#E3F2FD'; ctx.strokeStyle = '#1565C0'; ctx.fillRect(-8, -6, 16, 12); ctx.strokeRect(-8, -6, 16, 12) }
    else if (type === 'battery') { ctx.fillStyle = '#4CAF50'; ctx.fillRect(-10, -7, 20, 14); ctx.strokeStyle = '#2E7D32'; ctx.strokeRect(-10, -7, 20, 14) }
    ctx.restore()
  }

  function drawComp(ctx, comp) {
    ctx.save(); ctx.translate(comp.x, comp.y)
    const labels = { uranium: '铀-235', neutron: '中子', deuterium: '氘', tritium: '氚', energyMeter: '能量检测器', battery: '电源' }
    const colors = { uranium: '#BBDEFB', neutron: '#E0E0E0', deuterium: '#BBDEFB', tritium: '#FFCDD2', energyMeter: '#E3F2FD', battery: '#4CAF50' }
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
      title="核裂变与核聚变模拟"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t); forceUpdate(n => n + 1) }}
      tab1Label="📊 实验演示"
      tab2Label="🔧 自己动手"
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} />
    </SceneShell>
  )
}
