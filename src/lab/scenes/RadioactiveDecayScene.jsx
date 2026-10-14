import { useState, useRef, useEffect } from 'react'

/**
 * RadioactiveDecayScene — 放射性衰变与半衰期模拟
 *
 * N = N₀ × (1/2)^(t/T½)
 * α射线：纸可挡  β射线：铝板可挡  γ射线：铅板可挡
 *
 * Step1: 衰变统计 — 大量原子核衰变，观察指数衰减规律
 * Step2: 半衰期 — N = N₀/2 所需时间，与初始数量无关
 * Step3: 射线穿透 — α/β/γ 三种射线穿透力对比
 */
export default function RadioactiveDecayScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,
    switchClosed: false,
    halfLife: 5,       // s
    decayType: 'alpha', // 'alpha' | 'beta' | 'gamma'
    shield: 'none',    // 'none' | 'paper' | 'aluminum' | 'lead'
    t: 0,
    atoms: [],         // {x, y, decayed}
    decayed: 0,
    total: 200,
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

    // 初始化原子核
    const atoms = []
    for (let i = 0; i < 200; i++) {
      atoms.push({ x: Math.random(), y: Math.random(), decayed: false })
    }
    S.current.atoms = atoms

    let last = performance.now()
    const loop = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05); last = now
      const s = S.current
      if (s.switchClosed) {
        s.t += dt
        const rate = Math.LN2 / s.halfLife
        let decayedCount = 0
        for (const a of s.atoms) {
          if (!a.decayed && Math.random() < rate * dt) a.decayed = true
          if (a.decayed) decayedCount++
        }
        s.decayed = decayedCount
        if (s.data.length < 600) s.data.push({ t: s.t, N: s.total - decayedCount })
      }
      render(R)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function decayInfo(s) {
    const N = s.total - s.decayed
    const expected = s.total * Math.pow(0.5, s.t / s.halfLife)
    const shields = {
      none: { name: '无屏蔽', alpha: 1, beta: 1, gamma: 1 },
      paper: { name: '纸张', alpha: 0, beta: 0.8, gamma: 0.95 },
      aluminum: { name: '铝板', alpha: 0, beta: 0.1, gamma: 0.7 },
      lead: { name: '铅板', alpha: 0, beta: 0, gamma: 0.1 },
    }
    const shield = shields[s.shield]
    const penetration = s.decayType === 'alpha' ? shield.alpha : s.decayType === 'beta' ? shield.beta : shield.gamma
    return { N, expected, shield, penetration }
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
    const info = decayInfo(s)

    const labels = ['① 衰变统计', '② 半衰期', '③ 射线穿透']
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
        S.current.step = i + 1; S.current.records = []; S.current.decayed = 0
        S.current.atoms.forEach(a => a.decayed = false); S.current.data = []; S.current.t = 0
        setStep(i + 1); forceUpdate(n => n + 1)
      } })
    }
    ctx.textBaseline = 'alphabetic'

    const subs = {
      1: '大量原子核按指数规律衰变：N = N₀·(1/2)^(t/T½)',
      2: '半衰期 T½：原子核数衰减到一半所需时间，与初始数量无关',
      3: 'α射线纸可挡，β射线铝板可挡，γ射线需铅板',
    }
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(subs[s.step], W / 2, 52)
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('🎯 实验目的：理解放射性衰变规律和半衰期概念，对比三种射线穿透力', W / 2, 70)

    // 原子核可视化
    drawAtoms(ctx, W * 0.10, 80, W * 0.38, H - 140, s)

    // 衰变曲线
    const gx = W * 0.52, gy = 80, gw = W * 0.44, gh = H * 0.40
    drawDecayCurve(ctx, gx, gy, gw, gh, s, info)

    // 射线穿透演示（Step3）
    if (s.step === 3) {
      drawPenetration(ctx, W * 0.52, H * 0.52, W * 0.44, H * 0.20, s, info)
    }

    // 底部参数
    const barY = H - 26
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillStyle = s.switchClosed ? '#E53935' : '#4CAF50'
    ctx.beginPath(); ctx.roundRect(55, barY - 13, 70, 26, 5); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.fillText(s.switchClosed ? '⏸ 暂停' : '▶ 开始', 72, barY)
    canvasRef.current._clickAreas.push({ x: 55, y: barY - 13, w: 70, h: 26, onClick: () => { S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1) } })

    ctx.fillStyle = '#9C27B0'; ctx.fillText(`T½=${s.halfLife}s`, 135, barY)
    drawMiniSlider(ctx, 195, barY, 60, (s.halfLife - 1) / 19, (r) => {
      S.current.halfLife = Math.round(1 + r * 19); forceUpdate(n => n + 1)
    })

    ctx.fillStyle = '#333'; ctx.fillText(`N=${info.N}/${s.total}`, 270, barY)
    ctx.fillStyle = '#E53935'; ctx.fillText(`t=${s.t.toFixed(1)}s`, 345, barY)

    if (s.step === 3) {
      // 射线类型按钮
      const types = [['alpha', 'α'], ['beta', 'β'], ['gamma', 'γ']]
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = s.decayType === types[i][0] ? '#E53935' : '#9E9E9E'
        ctx.beginPath(); ctx.roundRect(400 + i * 30, barY - 11, 26, 22, 4); ctx.fill()
        ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
        ctx.fillText(types[i][1], 413 + i * 30, barY)
        canvasRef.current._clickAreas.push({ x: 400 + i * 30, y: barY - 11, w: 26, h: 22, onClick: () => {
          S.current.decayType = types[i][0]; forceUpdate(n => n + 1)
        } })
      }
    }
    ctx.textBaseline = 'alphabetic'

    drawRightPanel(ctx, W * 0.56, H * 0.55, W - W * 0.56 - 25, H - H * 0.55 - 35, s, info)
  }

  // 原子核网格
  function drawAtoms(ctx, x, y, w, h, s) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ddd'
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()

    const cols = 20, rows = 10
    const cellW = w / cols, cellH = h / rows
    const r = Math.min(cellW, cellH) * 0.35

    for (let i = 0; i < s.atoms.length; i++) {
      const a = s.atoms[i]
      const col = i % cols, row = Math.floor(i / cols)
      const cx = x + 10 + col * cellW
      const cy = y + 10 + row * cellH

      if (a.decayed) {
        // 衰变后（灰色+虚线）
        ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1; ctx.setLineDash([2, 2])
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
        ctx.setLineDash([])
        // 衰变产物
        ctx.fillStyle = '#e0e0e0'
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2); ctx.fill()
      } else {
        // 未衰变（彩色）
        ctx.fillStyle = s.decayType === 'alpha' ? '#E53935' : s.decayType === 'beta' ? '#1565C0' : '#9C27B0'
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = '#333'; ctx.lineWidth = 0.5; ctx.stroke()
      }
    }

    // 标注
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(`原子核 (${info.N}/${s.total})`, x + w / 2, y + h - 18)
    ctx.textBaseline = 'alphabetic'
  }

  // 衰变曲线
  function drawDecayCurve(ctx, gx, gy, gw, gh, s, info) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ddd'
    ctx.beginPath(); ctx.roundRect(gx - 5, gy - 5, gw + 10, gh + 10, 6); ctx.fill(); ctx.stroke()

    const margin = { top: 20, right: 15, bottom: 30, left: 40 }
    const pw = gw - margin.left - margin.right
    const ph = gh - margin.top - margin.bottom
    const ox = gx + margin.left, oy = gy + margin.top

    ctx.strokeStyle = '#999'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, oy + ph); ctx.lineTo(ox + pw, oy + ph); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('t (s)', ox + pw / 2, gy + gh - 5)
    ctx.save(); ctx.translate(gx + 8, oy + ph / 2); ctx.rotate(-Math.PI / 2)
    ctx.fillText('N', 0, 0); ctx.restore()

    const maxT = s.halfLife * 5
    const toX = t => ox + Math.min(t / maxT, 1) * pw
    const toY = n => oy + ph - (n / s.total) * ph

    // 半衰期标记
    for (let i = 1; i <= 4; i++) {
      const t = i * s.halfLife
      if (t > maxT) break
      const x = toX(t)
      ctx.strokeStyle = 'rgba(156,39,176,0.2)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3])
      ctx.beginPath(); ctx.moveTo(x, oy); ctx.lineTo(x, oy + ph); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#9C27B0'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(`${i}T½`, x, oy - 2)
    }

    // 理论曲线
    ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3])
    ctx.beginPath()
    for (let t = 0; t <= maxT; t += maxT / 100) {
      const n = s.total * Math.pow(0.5, t / s.halfLife)
      const px = toX(t), py = toY(n)
      if (t === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.stroke()
    ctx.setLineDash([])

    // 实验数据曲线
    if (s.data.length > 1) {
      ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2; ctx.beginPath()
      s.data.forEach((d, i) => {
        const x = toX(d.t), y = toY(d.N)
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      })
      ctx.stroke()
    }

    // 当前点
    if (s.switchClosed) {
      const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 300)
      ctx.fillStyle = `rgba(229,57,53,${pulse})`
      ctx.beginPath(); ctx.arc(toX(s.t), toY(info.N), 5, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke()
    }

    // 图例
    ctx.fillStyle = '#1565C0'; ctx.font = '9px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('- - 理论曲线', ox + 6, oy + 12)
    ctx.fillStyle = '#E53935'
    ctx.fillText('—— 实验数据', ox + 6, oy + 24)
  }

  // 射线穿透演示
  function drawPenetration(ctx, x, y, w, h, s, info) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ddd'
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()

    // 放射源
    const srcX = x + 30, srcY = y + h / 2
    ctx.fillStyle = '#E53935'
    ctx.beginPath(); ctx.arc(srcX, srcY, 8, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('☢', srcX, srcY)

    // 屏蔽物
    const shieldX = x + w * 0.45
    const shieldW = 12
    const shieldColors = { none: 'transparent', paper: '#FFF9C4', aluminum: '#B0BEC5', lead: '#455A64' }
    if (s.shield !== 'none') {
      ctx.fillStyle = shieldColors[s.shield] || '#ccc'
      ctx.strokeStyle = '#888'; ctx.lineWidth = 1.5
      ctx.fillRect(shieldX, y + 15, shieldW, h - 30)
      ctx.strokeRect(shieldX, y + 15, shieldW, h - 30)
      ctx.fillStyle = '#333'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
      ctx.fillText(info.shield.name, shieldX + shieldW / 2, y + 13)
    }

    // 射线
    const rayColor = s.decayType === 'alpha' ? '#E53935' : s.decayType === 'beta' ? '#1565C0' : '#9C27B0'
    const nRays = 5
    for (let i = 0; i < nRays; i++) {
      const ry = y + h / 2 + (i - 2) * 10
      ctx.strokeStyle = rayColor; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(srcX + 10, ry); ctx.lineTo(shieldX - 2, ry); ctx.stroke()
      if (info.penetration > 0) {
        // 穿透
        ctx.globalAlpha = info.penetration
        ctx.beginPath(); ctx.moveTo(shieldX + shieldW + 2, ry); ctx.lineTo(x + w - 30, ry); ctx.stroke()
        ctx.globalAlpha = 1
      }
    }

    // 检测屏
    const detX = x + w - 25
    ctx.fillStyle = info.penetration > 0 ? '#E8F5E9' : '#f5f5f5'
    ctx.strokeStyle = '#888'; ctx.lineWidth = 1.5
    ctx.fillRect(detX, y + 15, 12, h - 30)
    ctx.strokeRect(detX, y + 15, 12, h - 30)

    // 标注
    ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(`${s.decayType.toUpperCase()}射线穿透率: ${(info.penetration * 100).toFixed(0)}%`, x + w / 2, y + h - 18)
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
    ctx.fillText('🎯 放射性衰变', x + 12, y + 12)
    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('N = N₀·(1/2)^(t/T½)', x + 12, y + 32)
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444'
    ctx.fillText(`N = ${info.N} / ${s.total}`, x + 12, y + 50)
    ctx.fillText(`T½ = ${s.halfLife}s    t = ${s.t.toFixed(1)}s`, x + 12, y + 64)
    if (s.step === 3) {
      ctx.fillText(`射线: ${s.decayType.toUpperCase()}    屏蔽: ${info.shield.name}`, x + 12, y + 80)
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText(`穿透率 = ${(info.penetration * 100).toFixed(0)}%`, x + 12, y + 96)
    }

    let ky = y + (s.step === 3 ? 116 : 82)
    const guideSteps = s.step === 1
      ? ['① 点"开始"观察衰变', '② 灰色圈=已衰变', '③ 剩余数按指数规律减少', '④ N = N₀·(1/2)^(t/T½)']
      : s.step === 2
        ? ['① 观察 N=N₀/2 的时间', '② 正好是半衰期 T½', '③ 改变 T½ 再观察', '④ T½ 与初始数量无关']
        : ['① 切换 α/β/γ 射线', '② 切换屏蔽物', '③ 观察穿透率', '④ α纸挡、β铝挡、γ铅挡']
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('📋 操作步骤', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#5D4037'
    for (let i = 0; i < guideSteps.length; i++) ctx.fillText(guideSteps[i], x + 12, ky + i * 12)
    ky += guideSteps.length * 12 + 6

    ctx.fillStyle = '#C62828'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('⚠ 注意事项', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#B71C1C'
    const notes = s.step === 1
      ? ['• 衰变是随机过程，大量原子服从统计规律', '• 半衰期是统计概念', '• 单个原子无法预测何时衰变']
      : s.step === 2
        ? ['• T½ 与温度、压强等无关', '• T½ 与初始原子核数量无关', '• 不同放射性元素 T½ 不同']
        : ['• α射线：氦核，穿透力最弱', '• β射线：电子流，穿透力中等', '• γ射线：光子，穿透力最强']
    for (let i = 0; i < notes.length; i++) ctx.fillText(notes[i], x + 12, ky + i * 12)
    ky += notes.length * 12 + 6

    if (s.records.length > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('📊 实验数据', x + 12, ky); ky += 14
      ctx.fillStyle = '#FFB74D'; ctx.fillRect(x + 12, ky, w - 24, 16)
      ctx.fillStyle = '#333'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      const c1 = x + 22, c2 = x + 60, c3 = x + 110
      ctx.fillText('#', c1, ky + 2); ctx.fillText('t(s)', c2, ky + 2); ctx.fillText('N', c3, ky + 2)
      ky += 14
      for (let i = 0; i < s.records.length; i++) {
        const r = s.records[i]
        if (i % 2 === 0) { ctx.fillStyle = '#FFF8E1'; ctx.fillRect(x + 12, ky, w - 24, 13) }
        ctx.fillStyle = '#333'; ctx.font = '9px monospace'; ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), c1, ky + 1); ctx.fillText(r.t.toFixed(1), c2, ky + 1); ctx.fillText(String(r.N), c3, ky + 1)
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
      const s2 = S.current; const inf = decayInfo(s2)
      s2.records.push({ t: s2.t, N: inf.N }); forceUpdate(n => n + 1)
    } })
    ctx.fillStyle = '#FF9800'; ctx.strokeStyle = '#E65100'
    ctx.beginPath(); ctx.roundRect(bx + btnW + gap, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.fillText('🗑 清除', bx + btnW + gap + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({ x: bx + btnW + gap, y: btnY, w: btnW, h: btnH, onClick: () => { S.current.records = []; forceUpdate(n => n + 1) } })
    ctx.fillStyle = '#9E9E9E'; ctx.strokeStyle = '#616161'
    ctx.beginPath(); ctx.roundRect(bx + (btnW + gap) * 2, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.fillText('↺ 重置', bx + (btnW + gap) * 2 + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({ x: bx + (btnW + gap) * 2, y: btnY, w: btnW, h: btnH, onClick: () => {
      S.current.t = 0; S.current.decayed = 0; S.current.data = []; S.current.records = []; S.current.switchClosed = false
      S.current.atoms.forEach(a => a.decayed = false)
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
    if (s._guideOpen) { ctx.textAlign = 'left'; ctx.font = '10px sans-serif'; ['① 拖入器材到画布', '② 搭建放射性实验', '③ 观察衰变过程', '④ 右键删除器材'].forEach((l, i) => ctx.fillText(l, bx + 10, by + 40 + i * 15)) }
    ctx.textBaseline = 'alphabetic'
    drawPalette(ctx, palX, 10, palW, H - 20)
  }

  function drawPalette(ctx, x, y, w, h) {
    ctx.fillStyle = '#fafafa'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('近代物理器材', x + w / 2, y + 10)
    const items = [
      { type: 'source', name: '放射源' }, { type: 'detector', name: '盖革计数器' },
      { type: 'shieldPaper', name: '纸张' }, { type: 'shieldAl', name: '铝板' },
      { type: 'shieldPb', name: '铅板' }, { type: 'magnet', name: '磁铁（干扰）' },
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
    if (type === 'source') { ctx.fillStyle = '#E53935'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('☢', 0, 3) }
    else if (type === 'detector') { ctx.fillStyle = '#E3F2FD'; ctx.strokeStyle = '#1565C0'; ctx.fillRect(-8, -6, 16, 12); ctx.strokeRect(-8, -6, 16, 12) }
    else if (type === 'shieldPaper') { ctx.fillStyle = '#FFF9C4'; ctx.fillRect(-2, -8, 4, 16); ctx.strokeStyle = '#F9A825'; ctx.strokeRect(-2, -8, 4, 16) }
    else if (type === 'shieldAl') { ctx.fillStyle = '#B0BEC5'; ctx.fillRect(-3, -8, 6, 16); ctx.strokeStyle = '#78909C'; ctx.strokeRect(-3, -8, 6, 16) }
    else if (type === 'shieldPb') { ctx.fillStyle = '#455A64'; ctx.fillRect(-3, -8, 6, 16); ctx.strokeStyle = '#263238'; ctx.strokeRect(-3, -8, 6, 16) }
    else if (type === 'magnet') { ctx.fillStyle = '#E53935'; ctx.fillRect(-10, -6, 10, 12); ctx.fillStyle = '#1565C0'; ctx.fillRect(0, -6, 10, 12) }
    ctx.restore()
  }

  function drawComp(ctx, comp) {
    ctx.save(); ctx.translate(comp.x, comp.y)
    const labels = { source: '放射源', detector: '盖革计数器', shieldPaper: '纸张', shieldAl: '铝板', shieldPb: '铅板', magnet: '磁铁' }
    const colors = { source: '#FFCDD2', detector: '#E3F2FD', shieldPaper: '#FFF9C4', shieldAl: '#B0BEC5', shieldPb: '#455A64', magnet: '#FFCDD2' }
    ctx.fillStyle = colors[comp.type] || '#eee'
    ctx.strokeStyle = '#888'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.roundRect(-16, -12, 32, 24, 4); ctx.fill(); ctx.stroke()
    ctx.fillStyle = comp.type === 'shieldPb' ? '#fff' : '#333'
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
        <button onClick={() => { S.current.t = 0; S.current.decayed = 0; S.current.data = []; S.current.records = []; S.current.switchClosed = false; S.current.atoms.forEach(a => a.decayed = false); forceUpdate(n => n + 1) }} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', color: '#666', cursor: 'pointer' }}>↺ 重置</button>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} />
      </div>
    </div>
  )
}