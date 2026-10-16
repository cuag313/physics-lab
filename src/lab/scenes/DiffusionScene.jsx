import { useState, useRef, useEffect } from 'react'
import { eventToCanvas } from '../utils/pointerPos'
import SceneShell from '../ui/SceneShell'

/**
 * DiffusionScene — 扩散现象与分子热运动
 *
 * 两种气体/液体混合扩散，调节温度观察扩散速率变化
 * 温度越高，分子热运动越剧烈，扩散越快
 *
 * Step1: 扩散现象 — 两种气体接触后逐渐混合均匀
 * Step2: 温度与扩散 — 温度越高扩散越快
 * Step3: 分子热运动 — 扩散证明分子永不停息做无规则运动
 */
export default function DiffusionScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,
    switchClosed: false,
    temperature: 300,  // K
    mode: 'gas',       // 'gas' | 'liquid'
    t: 0,
    diffused: 0,       // 扩散程度 0~1
    particles: [],
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

    // 初始化粒子
    const N = 60
    const particles = []
    for (let i = 0; i < N; i++) {
      particles.push({
        x: i < N / 2 ? 0.15 + Math.random() * 0.3 : 0.55 + Math.random() * 0.3,
        y: 0.15 + Math.random() * 0.7,
        vx: (Math.random() - 0.5) * 0.003,
        vy: (Math.random() - 0.5) * 0.003,
        type: i < N / 2 ? 'A' : 'B',
        r: 4 + Math.random() * 3,
      })
    }
    S.current.particles = particles

    let last = performance.now()
    const loop = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05); last = now
      const s = S.current
      if (s.switchClosed) {
        s.t += dt
        const speed = (s.temperature / 300) * 0.8
        // 粒子运动
        for (const p of s.particles) {
          p.x += p.vx * speed * dt * 60
          p.y += p.vy * speed * dt * 60
          // 边界反弹
          if (p.x < 0.05 || p.x > 0.95) p.vx *= -1
          if (p.y < 0.1 || p.y > 0.9) p.vy *= -1
          p.x = Math.max(0.05, Math.min(0.95, p.x))
          p.y = Math.max(0.1, Math.min(0.9, p.y))
          // 随机扰动（热运动）
          p.vx += (Math.random() - 0.5) * 0.002 * speed
          p.vy += (Math.random() - 0.5) * 0.002 * speed
          // 阻尼
          p.vx *= 0.999
          p.vy *= 0.999
        }
        // 计算扩散程度（A和B的混合程度）
        let mixed = 0
        for (const p of s.particles) {
          const other = s.particles.filter(q => q.type !== p.type)
          const avgDist = other.reduce((sum, q) => sum + Math.hypot(p.x - q.x, p.y - q.y), 0) / other.length
          mixed += avgDist
        }
        s.diffused = Math.min(1, s.diffused + dt * 0.02 * speed)
        if (s.data?.length < 600) s.data.push({ t: s.t, d: s.diffused })
      }
      render(R)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

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

    const labels = ['① 扩散现象', '② 温度与扩散', '③ 分子热运动']
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
        S.current.step = i + 1; S.current.t = 0; S.current.diffused = 0
        S.current.particles.forEach((p, idx) => {
          p.x = idx < 30 ? 0.15 + Math.random() * 0.3 : 0.55 + Math.random() * 0.3
          p.y = 0.15 + Math.random() * 0.7
        })
        setStep(i + 1); forceUpdate(n => n + 1)
      } })
    }
    ctx.textBaseline = 'alphabetic'

    const subs = {
      1: '两种气体接触后，分子自发地混合均匀（扩散）',
      2: '调节温度，观察扩散速率变化：温度越高扩散越快',
      3: '扩散证明分子永不停息地做无规则运动',
    }
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(subs[s.step], W / 2, 52)
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('🎯 实验目的：观察扩散现象，理解分子热运动与温度的关系', W / 2, 70)

    // 粒子动画容器
    drawParticleBox(ctx, W * 0.08, 80, W * 0.48, H - 140, s)

    // 底部
    const barY = H - 26
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillStyle = s.switchClosed ? '#4CAF50' : '#9E9E9E'
    ctx.beginPath(); ctx.roundRect(55, barY - 13, 70, 26, 5); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.fillText(s.switchClosed ? '▶ 开始' : '⏸ 暂停', 72, barY)
    canvasRef.current._clickAreas.push({ x: 55, y: barY - 13, w: 70, h: 26, onClick: () => { S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1) } })

    ctx.fillStyle = '#E53935'; ctx.fillText(`T = ${s.temperature}K (${(s.temperature - 273).toFixed(0)}°C)`, 135, barY)
    drawMiniSlider(ctx, 260, barY, 100, (s.temperature - 200) / 600, (r) => {
      S.current.temperature = Math.round(200 + r * 600); forceUpdate(n => n + 1)
    })

    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`扩散程度: ${(s.diffused * 100).toFixed(0)}%`, 380, barY)
    ctx.textBaseline = 'alphabetic'

    drawRightPanel(ctx, W * 0.58, 80, W - W * 0.58 - 25, H - 140, s)
  }

  // 粒子盒子
  function drawParticleBox(ctx, x, y, w, h, s) {
    // 容器
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()

    // 分隔线（初始状态时显示）
    if (s.diffused < 0.3 && !s.switchClosed) {
      ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1; ctx.setLineDash([5, 3])
      ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.stroke()
      ctx.setLineDash([])
    }

    // 粒子
    for (const p of s.particles) {
      const px = x + p.x * w
      const py = y + p.y * h
      ctx.fillStyle = p.type === 'A' ? 'rgba(33,150,243,0.7)' : 'rgba(229,57,53,0.7)'
      ctx.beginPath(); ctx.arc(px, py, p.r, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = p.type === 'A' ? '#1565C0' : '#E53935'; ctx.lineWidth = 0.8; ctx.stroke()
    }

    // 标注
    ctx.fillStyle = '#1565C0'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('● 气体A（蓝）', x + 10, y + 8)
    ctx.fillStyle = '#E53935'
    ctx.fillText('● 气体B（红）', x + 10, y + 22)
    ctx.fillStyle = '#555'; ctx.font = '9px sans-serif'
    ctx.fillText('隔板抽走后，两种气体自发混合', x + 10, y + h - 18)
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
    ctx.fillText('🎯 扩散与分子热运动', x + 12, y + 12)
    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('温度越高，扩散越快', x + 12, y + 32)
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444'
    ctx.fillText(`T = ${s.temperature}K = ${(s.temperature - 273).toFixed(0)}°C`, x + 12, y + 50)
    ctx.fillText(`扩散程度 = ${(s.diffused * 100).toFixed(0)}%`, x + 12, y + 64)

    let ky = y + 84
    const guideSteps = s.step === 1
      ? ['① 点"开始"释放隔板', '② 观察两种气体混合过程', '③ 最终均匀混合', '④ 结论：扩散现象']
      : s.step === 2
        ? ['① 调节温度到较高值', '② 观察扩散速度加快', '③ 调节温度到较低值', '④ 扩散速度变慢']
        : ['① 温度↑→分子运动加快', '② 扩散是分子热运动的结果', '③ 一切物质的分子都在运动', '④ 温度是分子热运动剧烈程度的标志']
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('📋 操作步骤', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#5D4037'
    for (let i = 0; i < guideSteps.length; i++) ctx.fillText(guideSteps[i], x + 12, ky + i * 12)
    ky += guideSteps.length * 12 + 6

    ctx.fillStyle = '#C62828'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('⚠ 注意事项', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#B71C1C'
    const notes = s.step === 1
      ? ['• 扩散是自发过程，不需要外力', '• 气体扩散最快，固体最慢', '• 扩散是分子热运动的表现']
      : s.step === 2
        ? ['• 温度越高，分子热运动越剧烈', '• 扩散速率与温度正相关', '• 温度是分子平均动能的标志']
        : ['• 分子永不停息地做无规则运动', '• 分子间有间隙', '• 扩散现象证明了分子热运动']
    for (let i = 0; i < notes.length; i++) ctx.fillText(notes[i], x + 12, ky + i * 12)
    ky += notes.length * 12 + 6

    if (s.records.length > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('📊 实验数据', x + 12, ky); ky += 14
      ctx.fillStyle = '#FFB74D'; ctx.fillRect(x + 12, ky, w - 24, 16)
      ctx.fillStyle = '#333'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      const c1 = x + 26, c2 = x + 70, c3 = x + 130
      ctx.fillText('#', c1, ky + 2); ctx.fillText('T(K)', c2, ky + 2); ctx.fillText('扩散%', c3, ky + 2)
      ky += 14
      for (let i = 0; i < s.records.length; i++) {
        const r = s.records[i]
        if (i % 2 === 0) { ctx.fillStyle = '#FFF8E1'; ctx.fillRect(x + 12, ky, w - 24, 13) }
        ctx.fillStyle = '#333'; ctx.font = '9px monospace'; ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), c1, ky + 1); ctx.fillText(String(r.T), c2, ky + 1); ctx.fillText(r.d.toFixed(0), c3, ky + 1)
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
      const s2 = S.current; s2.records.push({ T: s2.temperature, d: s2.diffused * 100 }); forceUpdate(n => n + 1)
    } })
    ctx.fillStyle = '#FF9800'; ctx.strokeStyle = '#E65100'
    ctx.beginPath(); ctx.roundRect(bx + btnW + gap, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.fillText('🗑 清除', bx + btnW + gap + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({ x: bx + btnW + gap, y: btnY, w: btnW, h: btnH, onClick: () => { S.current.records = []; forceUpdate(n => n + 1) } })
    ctx.fillStyle = '#9E9E9E'; ctx.strokeStyle = '#616161'
    ctx.beginPath(); ctx.roundRect(bx + (btnW + gap) * 2, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.fillText('↺ 重置', bx + (btnW + gap) * 2 + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({ x: bx + (btnW + gap) * 2, y: btnY, w: btnW, h: btnH, onClick: () => {
      S.current.t = 0; S.current.diffused = 0; S.current.temperature = 300; S.current.records = []; S.current.switchClosed = false
      S.current.particles.forEach((p, idx) => {
        p.x = idx < 30 ? 0.15 + Math.random() * 0.3 : 0.55 + Math.random() * 0.3
        p.y = 0.15 + Math.random() * 0.7
      })
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
    if (s._guideOpen) { ctx.textAlign = 'left'; ctx.font = '10px sans-serif'; ['① 拖入器材到画布', '② 搭建扩散实验', '③ 观察分子运动', '④ 右键删除器材'].forEach((l, i) => ctx.fillText(l, bx + 10, by + 40 + i * 15)) }
    ctx.textBaseline = 'alphabetic'
    drawPalette(ctx, palX, 10, palW, H - 20)
  }

  function drawPalette(ctx, x, y, w, h) {
    ctx.fillStyle = '#fafafa'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('热学器材', x + w / 2, y + 10)
    const items = [
      { type: 'beaker', name: '容器' }, { type: 'gasA', name: '气体A' },
      { type: 'gasB', name: '气体B' }, { type: 'divider', name: '隔板' },
      { type: 'thermometer', name: '温度计' }, { type: 'burner', name: '酒精灯（干扰）' },
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
    if (type === 'beaker') { ctx.strokeStyle = '#888'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(-8, -5, 16, 12, [1,1,3,3]); ctx.stroke() }
    else if (type === 'gasA') { ctx.fillStyle = 'rgba(33,150,243,0.6)'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill() }
    else if (type === 'gasB') { ctx.fillStyle = 'rgba(229,57,53,0.6)'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill() }
    else if (type === 'divider') { ctx.strokeStyle = '#ccc'; ctx.lineWidth = 2; ctx.setLineDash([3, 2]); ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.stroke(); ctx.setLineDash([]) }
    else if (type === 'thermometer') { ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 5); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 7, 3, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#E53935'; ctx.fillRect(-1.5, -4, 3, 10) }
    else if (type === 'burner') { ctx.fillStyle = '#FF9800'; ctx.beginPath(); ctx.moveTo(-6, 8); ctx.lineTo(0, -6); ctx.lineTo(6, 8); ctx.closePath(); ctx.fill() }
    ctx.restore()
  }

  function drawComp(ctx, comp) {
    ctx.save(); ctx.translate(comp.x, comp.y)
    const labels = { beaker: '容器', gasA: '气体A', gasB: '气体B', divider: '隔板', thermometer: '温度计', burner: '酒精灯' }
    const colors = { beaker: '#BBDEFB', gasA: '#E3F2FD', gasB: '#FFCDD2', divider: '#F5F5F5', thermometer: '#FFCDD2', burner: '#FFE0B2' }
    ctx.fillStyle = colors[comp.type] || '#eee'
    ctx.strokeStyle = '#888'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.roundRect(-16, -12, 32, 24, 4); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(labels[comp.type] || comp.type, 0, 0)
    ctx.restore()
  }

  function getPos(e) { return eventToCanvas(canvasRef.current, e) }
  function handleMouseDown(e) { if (e.button !== 0) return; const s = S.current; const { x, y } = getPos(e); if (s.tab === 1) { for (const a of canvasRef.current._clickAreas) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(x, y); return } } return } for (const a of canvasRef.current._clickAreas || []) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(); return } } for (const a of canvasRef.current._palAreas) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { if (a.type) { s.components.push({ id: s.nextId++, type: a.type, x, y, closed: true, props: {} }); s.dragId = s.nextId - 1; forceUpdate(n => n + 1); return } } } for (const c of s.components) { if (Math.abs(x - c.x) < 25 && Math.abs(y - c.y) < 25) { s.dragId = c.id; s.dragOffX = x - c.x; s.dragOffY = y - c.y; forceUpdate(n => n + 1); return } } }
  function handleMouseMove(e) { const s = S.current; const { x, y } = getPos(e); if (s.dragId == null) return; const c = s.components.find(c => c.id === s.dragId); if (c) { c.x = x - s.dragOffX; c.y = y - s.dragOffY; forceUpdate(n => n + 1) } }
  function handleMouseUp() { S.current.dragId = null }
  function handleDoubleClick() {}
  function handleContextMenu(e) { e.preventDefault(); const s = S.current; const { x, y } = getPos(e); const idx = s.components.findIndex(c => Math.abs(x - c.x) < 25 && Math.abs(y - c.y) < 25); if (idx >= 0) { s.components.splice(idx, 1); forceUpdate(n => n + 1) } }

  return (
    <SceneShell
      title="扩散现象与分子热运动"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t); forceUpdate(n => n + 1) }}
      tab1Label="📊 实验演示"
      tab2Label="🔧 自己动手"
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} />
    </SceneShell>
  )
}
