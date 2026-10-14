import { useState, useRef, useEffect } from 'react'
import SceneShell from '../ui/SceneShell'

/**
 * ComptonScene — 康普顿散射
 *
 * Δλ = λ_c(1-cosθ)，λ_c = h/(mₑc) = 2.426 pm
 * 光子与自由电子碰撞后波长变长，验证光的粒子性
 *
 * Step1: 散射现象 — 光子与电子碰撞，改变散射角观察波长偏移
 * Step2: 康普顿公式 — Δλ = λ_c(1-cosθ)，最大偏移2λ_c
 * Step3: 光的粒子性 — 散射证明光子像粒子一样碰撞
 */
export default function ComptonScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,
    switchClosed: false,
    angle: 45,       // 散射角（度）
    particles: [],   // 光子/电子动画
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
      if (s.switchClosed && s.particles.length < 15) {
        s.particles.push(createParticle(s))
      }
      for (let i = s.particles.length - 1; i >= 0; i--) {
        const p = s.particles[i]
        p.x += p.vx * 0.02
        p.y += p.vy * 0.02
        p.life -= 0.015
        if (p.life <= 0) s.particles.splice(i, 1)
      }
      render(R)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function createParticle(s) {
    const theta = (s.angle * Math.PI) / 180
    // 入射光子从左向右
    return {
      x: 0.3, y: 0.5,
      vx: 0.03, vy: 0,
      isPhoton: true,
      scattered: false,
      scatterVx: 0.03 * Math.cos(theta),
      scatterVy: -0.03 * Math.sin(theta),
      life: 1,
      color: '#FFEB3B',
    }
  }

  function comptonInfo(s) {
    const h = 6.626e-34
    const m_e = 9.109e-31
    const c = 3e8
    const lambda_c = (h / (m_e * c)) * 1e12 // pm
    const theta = (s.angle * Math.PI) / 180
    const deltaLambda = lambda_c * (1 - Math.cos(theta))
    return { lambda_c, deltaLambda, theta }
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
    const info = comptonInfo(s)

    const labels = ['① 散射现象', '② 康普顿公式', '③ 光的粒子性']
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
        S.current.step = i + 1; S.current.records = []; S.current.particles = []
        setStep(i + 1); forceUpdate(n => n + 1)
      } })
    }
    ctx.textBaseline = 'alphabetic'

    const subs = {
      1: '光子与自由电子碰撞，改变散射角观察光子波长偏移',
      2: 'Δλ = λ_c(1-cosθ)，θ=180°时最大偏移 2λ_c',
      3: '光子像粒子一样碰撞电子，验证光的粒子性',
    }
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(subs[s.step], W / 2, 52)
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('🎯 实验目的：理解康普顿散射，验证光的粒子性', W / 2, 70)

    // 散射可视化
    drawScattering(ctx, W * 0.10, 80, W * 0.44, H - 140, s, info)

    // Δλ-θ 曲线
    const gx = W * 0.58, gy = 80, gw = W * 0.38, gh = H * 0.40
    drawDeltaCurve(ctx, gx, gy, gw, gh, s, info)

    // 底部
    const barY = H - 26
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillStyle = '#1565C0'; ctx.fillText(`θ=${s.angle}°`, 55, barY)
    drawMiniSlider(ctx, 95, barY, 120, s.angle / 180, (r) => {
      S.current.angle = Math.round(r * 180); forceUpdate(n => n + 1)
    })

    ctx.fillStyle = '#FF9800'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`Δλ=${info.deltaLambda.toFixed(2)}pm`, 235, barY)
    ctx.fillStyle = '#4CAF50'
    ctx.fillText(`λ_c=${info.lambda_c.toFixed(2)}pm`, 345, barY)

    ctx.fillStyle = s.switchClosed ? '#E53935' : '#4CAF50'
    ctx.beginPath(); ctx.roundRect(465, barY - 13, 80, 26, 5); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.fillText(s.switchClosed ? '⏸ 暂停' : '▶ 发射光子', 482, barY)
    canvasRef.current._clickAreas.push({ x: 465, y: barY - 13, w: 80, h: 26, onClick: () => {
      S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1)
    } })
    ctx.textBaseline = 'alphabetic'

    drawRightPanel(ctx, W * 0.56, H * 0.55, W - W * 0.56 - 25, H - H * 0.55 - 35, s, info)
  }

  // 散射可视化
  function drawScattering(ctx, x, y, w, h, s, info) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ddd'
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()

    const cx = x + w * 0.35, cy = y + h / 2

    // 入射光子（波浪线）
    const waveY = cy
    ctx.strokeStyle = '#FFEB3B'; ctx.lineWidth = 2.5
    ctx.beginPath()
    for (let t = 0; t < 80; t += 2) {
      const px = x + 15 + t
      const py = waveY + Math.sin(t * 0.3 + Date.now() / 200) * 6
      if (t === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.stroke()
    // 入射箭头
    ctx.fillStyle = '#FFEB3B'
    ctx.beginPath()
    ctx.moveTo(cx - 25, cy); ctx.lineTo(cx - 35, cy - 5); ctx.lineTo(cx - 35, cy + 5)
    ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#FF9800'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText('入射光子', cx - 75, cy - 12)

    // 自由电子（静止）
    const eX = cx, eY = cy
    ctx.fillStyle = '#1565C0'
    ctx.beginPath(); ctx.arc(eX, eY, 12, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('e⁻', eX, eY)

    // 散射光子（按角度方向）
    const theta = info.theta
    const scatX = cx + Math.cos(-theta) * 120
    const scatY = cy + Math.sin(-theta) * 120

    // 散射光线
    ctx.strokeStyle = '#FF9800'; ctx.lineWidth = 2.5
    ctx.beginPath()
    const rayLen = Math.hypot(scatX - eX, scatY - eY)
    const dirX = (scatX - eX) / rayLen
    const dirY = (scatY - eY) / rayLen
    // 波浪线沿散射方向
    for (let t = 0; t < rayLen; t += 2) {
      const px = eX + dirX * t + Math.sin(t * 0.3 + Date.now() / 200) * -dirY * 5
      const py = eY + dirY * t + Math.sin(t * 0.3 + Date.now() / 200) * dirX * 5
      if (t === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.stroke()
    // 散射箭头
    ctx.fillStyle = '#FF9800'
    ctx.beginPath()
    ctx.moveTo(scatX, scatY)
    ctx.lineTo(scatX - dirX * 10 + dirY * 5, scatY - dirY * 10 - dirX * 5)
    ctx.lineTo(scatX - dirX * 10 - dirY * 5, scatY - dirY * 10 + dirX * 5)
    ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('散射光子', scatX, scatY - 18)

    // 反冲电子
    const recX = cx + Math.cos(theta + Math.PI) * 55
    const recY = cy + Math.sin(theta + Math.PI) * 55
    if (s.switchClosed) {
      const pulse = Math.sin(Date.now() / 300) * 0.3 + 0.7
      ctx.fillStyle = `rgba(33,150,243,${pulse})`
      ctx.beginPath(); ctx.arc(recX, recY, 8, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'
      ctx.fillText('e⁻', recX, recY)
    }

    // 角度弧线
    ctx.strokeStyle = '#9C27B0'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.arc(cx, cy, 35, -theta, 0); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#9C27B0'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(`θ=${s.angle}°`, cx + 42, cy - 12)

    // 标注
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('康普顿散射', cx + 30, y + h - 22)
    ctx.fillStyle = '#666'; ctx.font = '9px sans-serif'
    ctx.fillText('散射后光子波长变长（能量减小）', cx + 30, y + h - 10)
    ctx.textBaseline = 'alphabetic'
  }

  // Δλ-θ 曲线
  function drawDeltaCurve(ctx, gx, gy, gw, gh, s, info) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ddd'
    ctx.beginPath(); ctx.roundRect(gx - 5, gy - 5, gw + 10, gh + 10, 8); ctx.fill(); ctx.stroke()

    const margin = { top: 25, right: 20, bottom: 35, left: 45 }
    const pw = gw - margin.left - margin.right
    const ph = gh - margin.top - margin.bottom
    const ox = gx + margin.left, oy = gy + margin.top

    ctx.strokeStyle = '#999'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, oy + ph); ctx.lineTo(ox + pw, oy + ph); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('θ (°)', ox + pw / 2, gy + gh - 6)
    ctx.save(); ctx.translate(gx + 10, oy + ph / 2); ctx.rotate(-Math.PI / 2)
    ctx.fillText('Δλ (pm)', 0, 0); ctx.restore()

    const maxDelta = 2 * info.lambda_c
    const toX = deg => ox + (deg / 180) * pw
    const toY = dl => oy + ph - (dl / maxDelta) * ph

    // 网格
    ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 0.8
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#999'
    for (let deg = 0; deg <= 180; deg += 30) {
      ctx.textAlign = 'center'; ctx.fillText(deg + '°', toX(deg), oy + ph + 14)
      ctx.beginPath(); ctx.moveTo(toX(deg), oy); ctx.lineTo(toX(deg), oy + ph); ctx.stroke()
    }
    for (let dl = 0; dl <= maxDelta; dl += info.lambda_c) {
      ctx.textAlign = 'right'; ctx.fillText(dl.toFixed(1), ox - 5, toY(dl) + 3)
      ctx.beginPath(); ctx.moveTo(ox, toY(dl)); ctx.lineTo(ox + pw, toY(dl)); ctx.stroke()
    }

    // Δλ 曲线
    ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2; ctx.beginPath()
    for (let deg = 0; deg <= 180; deg += 2) {
      const theta = (deg * Math.PI) / 180
      const dl = info.lambda_c * (1 - Math.cos(theta))
      const px = toX(deg), py = toY(dl)
      if (deg === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.stroke()

    // 关键点标注
    ctx.fillStyle = '#1565C0'; ctx.font = '9px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText(`θ=90°: Δλ=λ_c`, toX(90) + 6, toY(info.lambda_c) - 8)
    ctx.fillStyle = '#E53935'
    ctx.fillText(`θ=180°: Δλ=2λ_c`, toX(140), toY(2 * info.lambda_c) - 8)

    // 当前点
    const curDelta = info.deltaLambda
    const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 300)
    ctx.fillStyle = `rgba(229,57,53,${pulse})`
    ctx.beginPath(); ctx.arc(toX(s.angle), toY(curDelta), 6, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke()
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
    ctx.fillText('🎯 康普顿散射', x + 12, y + 12)
    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('Δλ = λ_c(1-cosθ)', x + 12, y + 32)
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444'
    ctx.fillText(`λ_c = h/(mₑc) = ${info.lambda_c.toFixed(2)} pm`, x + 12, y + 50)
    ctx.fillText(`θ = ${s.angle}°`, x + 12, y + 64)
    ctx.fillText(`Δλ = ${info.deltaLambda.toFixed(2)} pm`, x + 12, y + 78)

    let ky = y + 98
    const guideSteps = s.step === 1
      ? ['① 点"发射光子"', '② 光子与电子碰撞', '③ 调节散射角θ', '④ 观察散射光子方向']
      : s.step === 2
        ? ['① 观察 Δλ-θ 曲线', '② θ=90°: Δλ=λ_c', '③ θ=180°: Δλ=2λ_c', '④ 验证 Δλ=λ_c(1-cosθ)']
        : ['① 光子像粒子碰撞电子', '② 能量守恒+动量守恒', '③ 散射后光子波长变长', '④ 验证光的粒子性']
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('📋 操作步骤', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#5D4037'
    for (let i = 0; i < guideSteps.length; i++) ctx.fillText(guideSteps[i], x + 12, ky + i * 12)
    ky += guideSteps.length * 12 + 6

    ctx.fillStyle = '#C62828'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('⚠ 注意事项', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#B71C1C'
    const notes = s.step === 1
      ? ['• 入射光子与自由电子碰撞', '• 散射角越大，波长偏移越大', '• 电子获得动能（反冲）']
      : s.step === 2
        ? ['• Δλ 只与散射角有关', '• 与入射波长无关', '• λ_c=2.426pm 是电子的康普顿波长']
        : ['• 波动说无法解释康普顿效应', '• 光子具有能量E=hν和动量p=h/λ', '• 这是光的粒子性的有力证据']
    for (let i = 0; i < notes.length; i++) ctx.fillText(notes[i], x + 12, ky + i * 12)
    ky += notes.length * 12 + 6

    if (s.records.length > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('📊 实验数据', x + 12, ky); ky += 14
      ctx.fillStyle = '#FFB74D'; ctx.fillRect(x + 12, ky, w - 24, 16)
      ctx.fillStyle = '#333'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      const c1 = x + 22, c2 = x + 65, c3 = x + 135
      ctx.fillText('#', c1, ky + 2); ctx.fillText('θ(°)', c2, ky + 2); ctx.fillText('Δλ(pm)', c3, ky + 2)
      ky += 14
      for (let i = 0; i < s.records.length; i++) {
        const r = s.records[i]
        if (i % 2 === 0) { ctx.fillStyle = '#FFF8E1'; ctx.fillRect(x + 12, ky, w - 24, 13) }
        ctx.fillStyle = '#333'; ctx.font = '9px monospace'; ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), c1, ky + 1); ctx.fillText(r.angle, c2, ky + 1); ctx.fillText(r.dl, c3, ky + 1)
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
      const s2 = S.current; const inf = comptonInfo(s2)
      s2.records.push({ angle: String(s2.angle), dl: inf.deltaLambda.toFixed(2) })
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
      S.current.angle = 45; S.current.particles = []; S.current.records = []; S.current.switchClosed = false
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
    if (s._guideOpen) { ctx.textAlign = 'left'; ctx.font = '10px sans-serif'; ['① 拖入器材到画布', '② 搭建散射实验', '③ 观察光子散射', '④ 右键删除器材'].forEach((l, i) => ctx.fillText(l, bx + 10, by + 40 + i * 15)) }
    ctx.textBaseline = 'alphabetic'
    drawPalette(ctx, palX, 10, palW, H - 20)
  }

  function drawPalette(ctx, x, y, w, h) {
    ctx.fillStyle = '#fafafa'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('近代物理器材', x + w / 2, y + 10)
    const items = [
      { type: 'photonSource', name: '光子源' }, { type: 'electron', name: '自由电子' },
      { type: 'detector', name: '探测器' }, { type: 'magnet', name: '磁铁（干扰）' },
      { type: 'battery', name: '电源（干扰）' }, { type: 'prism', name: '三棱镜（干扰）' },
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
    if (type === 'photonSource') { ctx.fillStyle = '#FFEB3B'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill() }
    else if (type === 'electron') { ctx.fillStyle = '#1565C0'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('e⁻', 0, 2) }
    else if (type === 'detector') { ctx.fillStyle = '#E8F5E9'; ctx.strokeStyle = '#4CAF50'; ctx.fillRect(-8, -6, 16, 12); ctx.strokeRect(-8, -6, 16, 12) }
    else if (type === 'magnet') { ctx.fillStyle = '#E53935'; ctx.fillRect(-10, -6, 10, 12); ctx.fillStyle = '#1565C0'; ctx.fillRect(0, -6, 10, 12) }
    else if (type === 'battery') { ctx.fillStyle = '#4CAF50'; ctx.fillRect(-10, -7, 20, 14); ctx.strokeStyle = '#2E7D32'; ctx.strokeRect(-10, -7, 20, 14) }
    else if (type === 'prism') { ctx.fillStyle = '#E1F5FE'; ctx.strokeStyle = '#1565C0'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(-8, 8); ctx.lineTo(8, 8); ctx.closePath(); ctx.fill(); ctx.stroke() }
    ctx.restore()
  }

  function drawComp(ctx, comp) {
    ctx.save(); ctx.translate(comp.x, comp.y)
    const labels = { photonSource: '光子源', electron: '自由电子', detector: '探测器', magnet: '磁铁', battery: '电源', prism: '三棱镜' }
    const colors = { photonSource: '#FFEB3B', electron: '#BBDEFB', detector: '#E8F5E9', magnet: '#FFCDD2', battery: '#4CAF50', prism: '#E1F5FE' }
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
      title="康普顿散射"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t); forceUpdate(n => n + 1) }}
      tab1Label="📊 实验演示"
      tab2Label="🔧 自己动手"
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} />
    </SceneShell>
  )
}
