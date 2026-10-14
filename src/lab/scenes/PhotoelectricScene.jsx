import { useState, useRef, useEffect } from 'react'
import SceneShell from '../ui/SceneShell'

/**
 * PhotoelectricScene — 光电效应与普朗克常量测定
 *
 * Ek_max = hf - W0（爱因斯坦光电方程）
 * 遏止电压 Uc = Ek_max/e
 * I-U 曲线测绘，拟合普朗克常量 h
 *
 * Step1: 光电效应现象 — 频率高于截止频率才有光电子逸出
 * Step2: 遏止电压 — 反向电压使光电流为零的电压 Uc = hf/e - W0/e
 * Step3: I-U 曲线 — 测绘多组数据，拟合普朗克常量
 */
export default function PhotoelectricScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,
    switchClosed: false,
    freq: 6e14,        // Hz
    intensity: 50,     // %
    voltage: 0,        // V
    running: false,
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

  function peInfo(s) {
    const e = 1.6e-19
    const h = 6.626e-34
    const W0 = 2.14 * e   // 铯的逸出功 2.14eV
    const f0 = W0 / h     // 截止频率
    const Ek = Math.max(0, h * s.freq - W0)
    const Uc = Ek / e
    const I = s.freq > f0 ? Math.max(0, s.intensity * 0.01 * (1 - Math.max(0, -s.voltage) / (Uc + 0.01))) : 0
    return { h, e, W0, f0, Ek, Uc, I }
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
    const info = peInfo(s)

    const labels = ['① 光电效应', '② 遏止电压', '③ I-U 曲线']
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
        S.current.step = i + 1; S.current.records = []; S.current.voltage = 0
        setStep(i + 1); forceUpdate(n => n + 1)
      } })
    }
    ctx.textBaseline = 'alphabetic'

    const subs = {
      1: '光频率高于截止频率 f₀ 时，光电子逸出（爱因斯坦光电方程）',
      2: '反向电压使光电流恰好为零 → 遏止电压 Uc = hf/e - W0/e',
      3: '改变频率测绘 I-U 曲线，用遏止电压拟合普朗克常量 h',
    }
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(subs[s.step], W / 2, 52)
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('🎯 实验目的：理解光电效应，掌握 Ek=hf-W₀，测量普朗克常量', W / 2, 70)

    // 光电管可视化
    drawPhototube(ctx, W * 0.12, H * 0.45, s, info)

    // I-U 曲线
    if (s.step >= 2) {
      const gx = W * 0.35, gy = 80, gw = W * 0.60, gh = H * 0.40
      drawIUCurve(ctx, gx, gy, gw, gh, s, info)
    }

    // 底部参数
    const barY = H - 26
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillStyle = '#9C27B0'; ctx.fillText(`f=${(s.freq / 1e14).toFixed(1)}×10¹⁴Hz`, 55, barY)
    drawMiniSlider(ctx, 155, barY, 80, (s.freq - 3e14) / 9e14, (r) => { S.current.freq = Math.round(3e14 + r * 9e14); forceUpdate(n => n + 1) })

    ctx.fillStyle = '#FF6F00'; ctx.fillText(`光强=${s.intensity}%`, 250, barY)
    drawMiniSlider(ctx, 330, barY, 60, (s.intensity - 10) / 90, (r) => { S.current.intensity = Math.round(10 + r * 90); forceUpdate(n => n + 1) })

    ctx.fillStyle = '#E53935'; ctx.fillText(`U=${s.voltage.toFixed(2)}V`, 405, barY)
    drawMiniSlider(ctx, 465, barY, 70, (s.voltage + 3) / 4, (r) => { S.current.voltage = Math.round((-3 + r * 4) * 100) / 100; forceUpdate(n => n + 1) })

    ctx.fillStyle = s.freq > info.f0 ? '#4CAF50' : '#E53935'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(s.freq > info.f0 ? '✓ 有光电子' : '✗ 无光电子', 550, barY)
    ctx.textBaseline = 'alphabetic'

    drawRightPanel(ctx, W * 0.56, H * 0.55, W - W * 0.56 - 25, H - H * 0.55 - 35, s, info)
  }

  // 光电管
  function drawPhototube(ctx, cx, cy, s, info) {
    const on = s.freq > info.f0
    const pulse = Date.now() / 1000

    // 光电管外壳
    ctx.fillStyle = 'rgba(230,230,240,0.6)'; ctx.strokeStyle = '#888'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(cx - 70, cy - 65, 140, 130, 12); ctx.fill(); ctx.stroke()

    // 入射光
    const nRays = Math.floor(s.intensity / 15) + 1
    for (let i = 0; i < nRays; i++) {
      const angle = -Math.PI / 4 + (i / nRays) * 0.6
      const x1 = cx - 95, y1 = cy - 40 + i * 12
      const x2 = cx - 35, y2 = cy - 15 + i * 8
      const grad = ctx.createLinearGradient(x1, y1, x2, y2)
      grad.addColorStop(0, `rgba(255,235,59,${0.8 - i * 0.1})`)
      grad.addColorStop(1, `rgba(255,235,59,${0.2})`)
      ctx.strokeStyle = grad; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
      // 箭头
      ctx.fillStyle = 'rgba(255,235,59,0.6)'
      ctx.beginPath()
      ctx.moveTo(x2, y2)
      ctx.lineTo(x2 - 8 * Math.cos(angle - 0.3), y2 - 8 * Math.sin(angle - 0.3))
      ctx.lineTo(x2 - 8 * Math.cos(angle + 0.3), y2 - 8 * Math.sin(angle + 0.3))
      ctx.closePath(); ctx.fill()
    }

    // 阴极 K（左侧金属板）
    ctx.fillStyle = on ? '#FF9800' : '#999'
    ctx.beginPath(); ctx.roundRect(cx - 35, cy - 35, 12, 70, 3); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('K', cx - 29, cy + 42)

    // 阳极 A（右侧金属板）
    ctx.fillStyle = '#1565C0'
    ctx.beginPath(); ctx.roundRect(cx + 23, cy - 35, 12, 70, 3); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.fillText('A', cx + 29, cy + 42)

    // 光电子（从 K 飞向 A）
    if (on) {
      const nElec = Math.floor(s.intensity / 25) + 1
      for (let i = 0; i < nElec; i++) {
        const phase = ((pulse * 1.5 + i * 0.3) % 1)
        const ex = cx - 22 + phase * 45
        const ey = cy - 25 + i * 12 + Math.sin(pulse * 3 + i) * 5
        const alpha = 0.8 * (1 - Math.abs(phase - 0.5) * 1.5)
        ctx.fillStyle = `rgba(76,175,80,${Math.max(0.1, alpha)})`
        ctx.beginPath(); ctx.arc(ex, ey, 3, 0, Math.PI * 2); ctx.fill()
      }
    }

    // 电压标注
    ctx.fillStyle = '#E53935'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(`U = ${s.voltage.toFixed(2)}V`, cx, cy + 58)
    if (on) {
      ctx.fillStyle = '#4CAF50'; ctx.font = '10px sans-serif'
      ctx.fillText(`I = ${info.I.toFixed(3)}μA`, cx, cy + 75)
    }

    // 光频率标注
    ctx.fillStyle = '#9C27B0'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText(`f = ${(s.freq / 1e14).toFixed(1)}×10¹⁴ Hz`, cx - 95, cy - 72)
    ctx.fillStyle = on ? '#4CAF50' : '#E53935'
    ctx.fillText(`f₀ = ${(info.f0 / 1e14).toFixed(2)}×10¹⁴ Hz`, cx - 95, cy - 58)

    // 标注
    ctx.fillStyle = '#5D4037'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('光电管', cx, cy + 95)
    ctx.textBaseline = 'alphabetic'
  }

  // I-U 曲线
  function drawIUCurve(ctx, gx, gy, gw, gh, s, info) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ddd'
    ctx.beginPath(); ctx.roundRect(gx - 5, gy - 5, gw + 10, gh + 10, 6); ctx.fill(); ctx.stroke()

    const margin = { top: 20, right: 15, bottom: 35, left: 40 }
    const pw = gw - margin.left - margin.right
    const ph = gh - margin.top - margin.bottom
    const ox = gx + margin.left, oy = gy + margin.top

    // 坐标轴
    ctx.strokeStyle = '#999'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(ox, oy + ph / 2); ctx.lineTo(ox + pw, oy + ph / 2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, oy + ph); ctx.stroke()

    // 轴标签
    ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('U (V)', ox + pw / 2, gy + gh - 5)
    ctx.save(); ctx.translate(gx + 8, oy + ph / 2); ctx.rotate(-Math.PI / 2)
    ctx.fillText('I (μA)', 0, 0); ctx.restore()

    // 范围
    const uMin = -3, uMax = 1, iMax = 1.2
    const toX = u => ox + ((u - uMin) / (uMax - uMin)) * pw
    const toY = i => oy + ph / 2 - (i / iMax) * (ph / 2)

    // 网格
    ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 0.8
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#999'
    for (let u = -3; u <= 1; u++) {
      const x = toX(u)
      ctx.textAlign = 'center'; ctx.fillText(u + 'V', x, oy + ph + 14)
      ctx.beginPath(); ctx.moveTo(x, oy); ctx.lineTo(x, oy + ph); ctx.stroke()
    }
    for (let i = 0; i <= 1; i += 0.5) {
      ctx.textAlign = 'right'; ctx.fillText(i.toFixed(1), ox - 5, toY(i) + 3)
      ctx.beginPath(); ctx.moveTo(ox, toY(i)); ctx.lineTo(ox + pw, toY(i)); ctx.stroke()
    }

    // 遏止电压标记
    if (info.Uc > 0) {
      const ucX = toX(-info.Uc)
      ctx.strokeStyle = 'rgba(229,57,53,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([4, 3])
      ctx.beginPath(); ctx.moveTo(ucX, oy); ctx.lineTo(ucX, oy + ph); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#E53935'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(`-Uc=${(-info.Uc).toFixed(2)}V`, ucX, oy - 2)
    }

    // I-U 曲线
    const maxI = s.intensity * 0.01
    ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 2; ctx.beginPath()
    let started = false
    for (let u = uMin; u <= uMax; u += 0.02) {
      const i2 = s.freq > info.f0 ? Math.max(0, maxI * (1 - Math.max(0, -u) / (info.Uc + 0.01))) : 0
      const x = toX(u), y = toY(i2)
      if (!started) { ctx.moveTo(x, y); started = true } else ctx.lineTo(x, y)
    }
    ctx.stroke()

    // 记录点
    for (const r of s.records) {
      ctx.fillStyle = 'rgba(33,150,243,0.3)'
      ctx.beginPath(); ctx.arc(toX(r.U), toY(r.I), 4, 0, Math.PI * 2); ctx.fill()
    }

    // 当前点
    const curI = s.freq > info.f0 ? Math.max(0, maxI * (1 - Math.max(0, -s.voltage) / (info.Uc + 0.01))) : 0
    const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 300)
    ctx.fillStyle = `rgba(229,57,53,${pulse})`
    ctx.beginPath(); ctx.arc(toX(s.voltage), toY(curI), 6, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke()

    // 公式
    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('I-U 特性曲线', ox + 6, oy + 6)
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#555'
    ctx.fillText(`Ek = hf - W₀`, ox + 6, oy + 20)
    ctx.fillText(`Uc = Ek/e = ${info.Uc.toFixed(2)}V`, ox + 6, oy + 32)
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
    ctx.fillText('🎯 光电效应', x + 12, y + 12)
    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('Ek = hf - W₀', x + 12, y + 32)
    ctx.fillText('Uc = Ek / e', x + 12, y + 48)
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444'
    ctx.fillText(`f = ${(s.freq / 1e14).toFixed(1)}×10¹⁴ Hz`, x + 12, y + 66)
    ctx.fillText(`f₀ = ${(info.f0 / 1e14).toFixed(2)}×10¹⁴ Hz（铯）`, x + 12, y + 80)
    ctx.fillText(`Ek = ${(info.Ek / info.e).toFixed(2)} eV`, x + 12, y + 94)
    ctx.fillText(`Uc = ${info.Uc.toFixed(2)} V`, x + 12, y + 108)

    let ky = y + 128
    const guideSteps = s.step === 1
      ? ['① 调节光频率 f', '② f > f₀ 时有光电子', '③ Ek = hf - W₀', '④ 频率越高 Ek 越大']
      : s.step === 2
        ? ['① 施加反向电压', '② 光电流逐渐减小', '③ 电流恰好为零 → Uc', '④ Uc = Ek/e']
        : ['① 改变频率测多组 Uc', '② 点"记录"保存数据', '③ 画 Uc - f 图像', '④ 斜率 = h/e，截距 = -W₀/e']
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('📋 操作步骤', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#5D4037'
    for (let i = 0; i < guideSteps.length; i++) ctx.fillText(guideSteps[i], x + 12, ky + i * 12)
    ky += guideSteps.length * 12 + 6

    ctx.fillStyle = '#C62828'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('⚠ 注意事项', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#B71C1C'
    const notes = s.step === 1
      ? ['• 光电子的最大初动能与光强无关', '• 只与频率有关：Ek = hf - W₀', '• 截止频率 f₀ = W₀/h']
      : s.step === 2
        ? ['• 遏止电压与频率成线性关系', '• Uc = hf/e - W₀/e', '• 光强不影响遏止电压']
        : ['• Uc-f 图像斜率 = h/e', '• 截距 = -W₀/e', '• 普朗克常量 h ≈ 6.626×10⁻³⁴ J·s']
    for (let i = 0; i < notes.length; i++) ctx.fillText(notes[i], x + 12, ky + i * 12)
    ky += notes.length * 12 + 6

    if (s.records.length > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('📊 实验数据', x + 12, ky); ky += 14
      ctx.fillStyle = '#FFB74D'; ctx.fillRect(x + 12, ky, w - 24, 16)
      ctx.fillStyle = '#333'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      const c1 = x + 22, c2 = x + 55, c3 = x + 110, c4 = x + 160
      ctx.fillText('#', c1, ky + 2); ctx.fillText('f×10¹⁴', c2, ky + 2); ctx.fillText('Uc(V)', c3, ky + 2); ctx.fillText('h(J·s)', c4, ky + 2)
      ky += 14
      for (let i = 0; i < s.records.length; i++) {
        const r = s.records[i]
        if (i % 2 === 0) { ctx.fillStyle = '#FFF8E1'; ctx.fillRect(x + 12, ky, w - 24, 13) }
        ctx.fillStyle = '#333'; ctx.font = '8px monospace'; ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), c1, ky + 1); ctx.fillText(r.f, c2, ky + 1); ctx.fillText(r.Uc, c3, ky + 1); ctx.fillText(r.h, c4, ky + 1)
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
      const s2 = S.current; const inf = peInfo(s2)
      s2.records.push({ f: (s2.freq / 1e14).toFixed(1), Uc: inf.Uc.toFixed(2), h: '6.63e-34' })
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
      S.current.freq = 6e14; S.current.intensity = 50; S.current.voltage = 0
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
    if (s._guideOpen) { ctx.textAlign = 'left'; ctx.font = '10px sans-serif'; ['① 拖入器材到画布', '② 搭建光电效应实验', '③ 观察光电子发射', '④ 右键删除器材'].forEach((l, i) => ctx.fillText(l, bx + 10, by + 40 + i * 15)) }
    ctx.textBaseline = 'alphabetic'
    drawPalette(ctx, palX, 10, palW, H - 20)
  }

  function drawPalette(ctx, x, y, w, h) {
    ctx.fillStyle = '#fafafa'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('近代物理器材', x + w / 2, y + 10)
    const items = [
      { type: 'phototube', name: '光电管' }, { type: 'lamp', name: '光源' },
      { type: 'battery', name: '电源' }, { type: 'ammeter', name: '电流表' },
      { type: 'voltmeter', name: '电压表' }, { type: 'lens', name: '透镜（干扰）' },
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
    if (type === 'phototube') { ctx.fillStyle = '#E0E0E0'; ctx.strokeStyle = '#888'; ctx.beginPath(); ctx.roundRect(-8, -6, 16, 12, 3); ctx.fill(); ctx.stroke() }
    else if (type === 'lamp') { ctx.fillStyle = '#FFEB3B'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#FFC107'; ctx.stroke() }
    else if (type === 'battery') { ctx.fillStyle = '#4CAF50'; ctx.fillRect(-10, -7, 20, 14); ctx.strokeStyle = '#2E7D32'; ctx.strokeRect(-10, -7, 20, 14) }
    else if (type === 'ammeter') { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#E53935'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('A', 0, 2) }
    else if (type === 'voltmeter') { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#1565C0'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('V', 0, 2) }
    else if (type === 'lens') { ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, 0, 4, 9, 0, 0, Math.PI * 2); ctx.stroke() }
    ctx.restore()
  }

  function drawComp(ctx, comp) {
    ctx.save(); ctx.translate(comp.x, comp.y)
    const labels = { phototube: '光电管', lamp: '光源', battery: '电源', ammeter: '电流表', voltmeter: '电压表', lens: '透镜' }
    const colors = { phototube: '#E0E0E0', lamp: '#FFEB3B', battery: '#4CAF50', ammeter: '#FFCDD2', voltmeter: '#BBDEFB', lens: '#E3F2FD' }
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
      title="光电效应与普朗克常量测定"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t); forceUpdate(n => n + 1) }}
      tab1Label="📊 实验演示"
      tab2Label="🔧 自己动手"
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} />
    </SceneShell>
  )
}
