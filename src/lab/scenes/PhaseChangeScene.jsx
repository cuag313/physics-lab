import { useState, useRef, useEffect } from 'react'
import { eventToCanvas } from '../utils/pointerPos'
import SceneShell from '../ui/SceneShell'

/**
 * PhaseChangeScene — 物态变化综合
 *
 * 熔化/凝固、汽化/液化、升华/凝华六种物态变化全景
 * 温度-时间曲线，吸放热标注
 *
 * Step1: 熔化与凝固 — 晶体熔化吸热、凝固放热
 * Step2: 汽化与液化 — 蒸发/沸腾、液化放热
 * Step3: 升华与凝华 — 干冰升华吸热、霜凝华放热
 */
export default function PhaseChangeScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,
    switchClosed: false,
    heating: true,
    material: 'ice',  // 'ice' | 'dryice' | 'camphor'
    t: 0,
    temp: -15,
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
      if (s.switchClosed) {
        s.t += dt
        const dir = s.heating ? 1 : -1
        if (s.material === 'ice') {
          if (s.temp < 0) s.temp += dir * 2.0 * dt
          else if (s.temp < 0.01 && s.heating) s.temp = 0
          else if (s.temp >= 0 && s.temp < 0.5 && s.heating) s.temp += 0.1 * dt
          else s.temp += dir * 1.5 * dt
          s.temp = Math.max(-20, Math.min(110, s.temp))
        } else {
          s.temp += dir * 1.2 * dt
          s.temp = Math.max(-100, Math.min(50, s.temp))
        }
        if (s.data.length < 600) s.data.push({ t: s.t, temp: s.temp })
      }
      render(R)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function phaseInfo(s) {
    const isIce = s.material === 'ice'
    let phase = '', change = ''
    if (isIce) {
      if (s.temp < 0) { phase = '固态（冰）'; change = s.heating ? '吸热升温' : '放热降温' }
      else if (s.temp < 0.5 && s.heating) { phase = '固液共存'; change = '熔化（吸热）' }
      else if (s.temp < 100) { phase = '液态（水）'; change = s.heating ? '吸热升温' : '放热降温' }
      else { phase = '气态（水蒸气）'; change = '沸腾（吸热）' }
    } else {
      if (s.temp < -78.5) { phase = '固态（干冰）'; change = s.heating ? '吸热升温' : '放热降温' }
      else if (s.heating) { phase = '气态（CO₂）'; change = '升华（吸热）' }
      else { phase = '气态（CO₂）'; change = '凝华（放热）' }
    }
    return { isIce, phase, change }
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
    const info = phaseInfo(s)

    const labels = ['① 熔化/凝固', '② 汽化/液化', '③ 升华/凝华']
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
        S.current.step = i + 1; S.current.t = 0; S.current.data = []; S.current.records = []
        S.current.material = i === 2 ? 'dryice' : 'ice'
        S.current.temp = i === 2 ? -80 : -15
        setStep(i + 1); forceUpdate(n => n + 1)
      } })
    }
    ctx.textBaseline = 'alphabetic'

    const subs = {
      1: '冰熔化吸热温度不变，水凝固放热温度不变（晶体）',
      2: '水沸腾吸热温度不变，水蒸气液化放热',
      3: '干冰升华吸热（不经过液态），水蒸气凝华放热（霜）',
    }
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(subs[s.step], W / 2, 52)
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('🎯 实验目的：认识六种物态变化及其吸放热规律', W / 2, 70)

    // 物态变化图（六种变化的关系图）
    drawPhaseDiagram(ctx, W * 0.10, H * 0.45, s)

    // 曲线
    const gx = W * 0.32, gy = 80, gw = W * 0.64, gh = H * 0.42
    drawCurve(ctx, gx, gy, gw, gh, s, info)

    // 底部
    const barY = H - 26
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillStyle = s.heating ? '#E53935' : '#1565C0'
    ctx.beginPath(); ctx.roundRect(55, barY - 13, 70, 26, 5); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.fillText(s.heating ? '🔥 加热' : '❄ 冷却', 72, barY)
    canvasRef.current._clickAreas.push({ x: 55, y: barY - 13, w: 70, h: 26, onClick: () => { S.current.heating = !S.current.heating; forceUpdate(n => n + 1) } })

    if (s.step === 3) {
      ctx.fillStyle = '#7B1FA2'
      ctx.beginPath(); ctx.roundRect(135, barY - 13, 80, 26, 5); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.fillText(s.material === 'ice' ? '🧊 冰' : '☁ 干冰', 155, barY)
      canvasRef.current._clickAreas.push({ x: 135, y: barY - 13, w: 80, h: 26, onClick: () => {
        S.current.material = S.current.material === 'ice' ? 'dryice' : 'ice'
        S.current.temp = S.current.material === 'ice' ? -15 : -80; S.current.data = []
        forceUpdate(n => n + 1)
      } })
    }

    ctx.fillStyle = '#E53935'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`T = ${s.temp.toFixed(1)}°C`, 230, barY)
    ctx.fillStyle = '#4CAF50'
    ctx.fillText(info.phase, 330, barY)
    ctx.fillStyle = info.change.includes('吸热') ? '#E53935' : '#1565C0'
    ctx.fillText(info.change, 430, barY)
    ctx.textBaseline = 'alphabetic'

    drawRightPanel(ctx, W * 0.56, H * 0.55, W - W * 0.56 - 25, H - H * 0.55 - 35, s, info)
  }

  // 六种物态变化关系图
  function drawPhaseDiagram(ctx, cx, cy, _s) {
    const boxW = 70, boxH = 32
    const positions = {
      solid: [cx, cy - 55], liquid: [cx, cy], gas: [cx, cy + 55],
    }
    const labels = { solid: '固态', liquid: '液态', gas: '气态' }
    const colors = { solid: '#BBDEFB', liquid: '#C8E6C9', gas: '#FFE0B2' }

    // 箭头定义
    const arrows = [
      { from: 'solid', to: 'liquid', label: '熔化(吸)', x: cx + 50, y: cy - 27, vertical: true },
      { from: 'liquid', to: 'solid', label: '凝固(放)', x: cx - 50, y: cy - 27, vertical: true },
      { from: 'liquid', to: 'gas', label: '汽化(吸)', x: cx + 50, y: cy + 27, vertical: true },
      { from: 'gas', to: 'liquid', label: '液化(放)', x: cx - 50, y: cy + 27, vertical: true },
      { from: 'solid', to: 'gas', label: '升华(吸)', x: cx + 55, y: cy, vertical: true, outer: true },
      { from: 'gas', to: 'solid', label: '凝华(放)', x: cx - 55, y: cy, vertical: true, outer: true },
    ]

    // 画箭头
    for (const a of arrows) {
      const [x1, y1] = positions[a.from]
      const [x2, y2] = positions[a.to]
      if (a.outer) {
        // 弧线箭头（跨越）
        ctx.strokeStyle = a.label.includes('吸') ? '#E53935' : '#1565C0'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(x1 + (a.x > cx ? 35 : -35), y1)
        ctx.quadraticCurveTo(a.x + (a.x > cx ? 20 : -20), cy, x2 + (a.x > cx ? 35 : -35), y2)
        ctx.stroke()
      } else {
        ctx.strokeStyle = a.label.includes('吸') ? '#E53935' : '#1565C0'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(a.x > cx ? x1 + 35 : x1 - 35, y1)
        ctx.lineTo(a.x > cx ? x2 + 35 : x2 - 35, y2)
        ctx.stroke()
      }
      ctx.fillStyle = a.label.includes('吸') ? '#E53935' : '#1565C0'
      ctx.font = '8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(a.label, a.x, a.y)
    }

    // 状态框
    for (const [key, [bx, by]] of Object.entries(positions)) {
      ctx.fillStyle = colors[key]; ctx.strokeStyle = '#666'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.roundRect(bx - boxW / 2, by - boxH / 2, boxW, boxH, 5); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(labels[key], bx, by)
    }

    // 标注
    ctx.fillStyle = '#5D4037'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('物态变化（红色=吸热，蓝色=放热）', cx, cy + 85)
    ctx.textBaseline = 'alphabetic'
  }

  function drawCurve(ctx, gx, gy, gw, gh, s, info) {
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
    ctx.fillText('T (°C)', 0, 0); ctx.restore()

    const maxT = 60, minV = -100, maxV = 115
    const toX = t => ox + Math.min(t / maxT, 1) * pw
    const toY = v => oy + ph - ((v - minV) / (maxV - minV)) * ph

    ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 0.8
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#999'
    for (let v = -80; v <= 100; v += 30) {
      const y = toY(v)
      ctx.textAlign = 'right'; ctx.fillText(v + '°C', ox - 5, y + 3)
      ctx.beginPath(); ctx.moveTo(ox, y); ctx.lineTo(ox + pw, y); ctx.stroke()
    }
    for (let t = 0; t <= 60; t += 10) {
      ctx.textAlign = 'center'; ctx.fillText(t + 's', toX(t), oy + ph + 14)
      ctx.beginPath(); ctx.moveTo(toX(t), oy); ctx.lineTo(toX(t), oy + ph); ctx.stroke()
    }

    // 0°C 参考线
    ctx.strokeStyle = 'rgba(33,150,243,0.3)'; ctx.lineWidth = 1; ctx.setLineDash([5, 3])
    ctx.beginPath(); ctx.moveTo(ox, toY(0)); ctx.lineTo(ox + pw, toY(0)); ctx.stroke()
    ctx.setLineDash([])

    // 曲线
    if (s.data.length > 1) {
      const color = info.isIce ? '#1565C0' : '#9C27B0'
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath()
      s.data.forEach((d, i) => {
        const x = toX(d.t), y = toY(d.temp)
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      })
      ctx.stroke()
    }

    if (s.switchClosed && s.data.length > 0) {
      const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 300)
      ctx.fillStyle = `rgba(229,57,53,${pulse})`
      ctx.beginPath(); ctx.arc(toX(s.t), toY(s.temp), 5, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke()
    }
  }

  function drawRightPanel(ctx, x, y, w, h, s, info) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('🎯 物态变化综合', x + 12, y + 12)
    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('六种物态变化', x + 12, y + 32)
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444'
    ctx.fillText(`当前: ${info.phase}  ${info.change}`, x + 12, y + 50)
    ctx.fillText(`T = ${s.temp.toFixed(1)}°C`, x + 12, y + 64)

    let ky = y + 82
    const guideSteps = s.step === 1
      ? ['① 冰→水：熔化（吸热）', '② 水→冰：凝固（放热）', '③ 晶体熔点=凝固点']
      : s.step === 2
        ? ['① 水→水蒸气：汽化（吸热）', '② 水蒸气→水：液化（放热）', '③ 蒸发和沸腾的区别']
        : ['① 干冰→CO₂：升华（吸热）', '② 水蒸气→霜：凝华（放热）', '③ 升华不经过液态']
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('📋 操作步骤', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#5D4037'
    for (let i = 0; i < guideSteps.length; i++) ctx.fillText(guideSteps[i], x + 12, ky + i * 12)
    ky += guideSteps.length * 12 + 6

    ctx.fillStyle = '#C62828'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('⚠ 注意事项', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#B71C1C'
    const notes = s.step === 1
      ? ['• 熔化吸热、凝固放热', '• 晶体有固定熔点', '• 非晶体无固定熔点']
      : s.step === 2
        ? ['• 汽化吸热、液化放热', '• 蒸发在表面、沸腾在内部', '• 液化两种方式：降温、加压']
        : ['• 升华吸热（干冰、碘）', '• 凝华放热（霜、雪）', '• 升华/凝华不经过液态']
    for (let i = 0; i < notes.length; i++) ctx.fillText(notes[i], x + 12, ky + i * 12)
    ky += notes.length * 12 + 6

    if (s.records.length > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('📊 实验数据', x + 12, ky); ky += 14
      ctx.fillStyle = '#FFB74D'; ctx.fillRect(x + 12, ky, w - 24, 16)
      ctx.fillStyle = '#333'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      const c1 = x + 22, c2 = x + 55, c3 = x + 115
      ctx.fillText('#', c1, ky + 2); ctx.fillText('t(s)', c2, ky + 2); ctx.fillText('T(°C)', c3, ky + 2)
      ky += 14
      for (let i = 0; i < s.records.length; i++) {
        const r = s.records[i]
        if (i % 2 === 0) { ctx.fillStyle = '#FFF8E1'; ctx.fillRect(x + 12, ky, w - 24, 13) }
        ctx.fillStyle = '#333'; ctx.font = '9px monospace'; ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), c1, ky + 1); ctx.fillText(r.t.toFixed(1), c2, ky + 1); ctx.fillText(r.temp.toFixed(1), c3, ky + 1)
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
      const s2 = S.current; s2.records.push({ t: s2.t, temp: s2.temp }); forceUpdate(n => n + 1)
    } })
    ctx.fillStyle = '#FF9800'; ctx.strokeStyle = '#E65100'
    ctx.beginPath(); ctx.roundRect(bx + btnW + gap, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.fillText('🗑 清除', bx + btnW + gap + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({ x: bx + btnW + gap, y: btnY, w: btnW, h: btnH, onClick: () => { S.current.records = []; forceUpdate(n => n + 1) } })
    ctx.fillStyle = '#9E9E9E'; ctx.strokeStyle = '#616161'
    ctx.beginPath(); ctx.roundRect(bx + (btnW + gap) * 2, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.fillText('↺ 重置', bx + (btnW + gap) * 2 + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({ x: bx + (btnW + gap) * 2, y: btnY, w: btnW, h: btnH, onClick: () => {
      S.current.t = 0; S.current.temp = -15; S.current.data = []; S.current.records = []; S.current.switchClosed = false
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
    if (s._guideOpen) { ctx.textAlign = 'left'; ctx.font = '10px sans-serif'; ['① 拖入器材到画布', '② 搭建物态变化实验', '③ 观察六种变化', '④ 右键删除器材'].forEach((l, i) => ctx.fillText(l, bx + 10, by + 40 + i * 15)) }
    ctx.textBaseline = 'alphabetic'
    drawPalette(ctx, palX, 10, palW, H - 20)
  }

  function drawPalette(ctx, x, y, w, h) {
    ctx.fillStyle = '#fafafa'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('热学器材', x + w / 2, y + 10)
    const items = [
      { type: 'beaker', name: '烧杯' }, { type: 'ice', name: '冰/水' },
      { type: 'dryice', name: '干冰' }, { type: 'thermometer', name: '温度计' },
      { type: 'burner', name: '酒精灯' }, { type: 'gas', name: '气球（收集气体）' },
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
    else if (type === 'ice') { ctx.fillStyle = '#B3E5FC'; ctx.fillRect(-6, -5, 12, 10); ctx.fillStyle = '#fff'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('❄', 0, 3) }
    else if (type === 'dryice') { ctx.fillStyle = '#E0E0E0'; ctx.fillRect(-6, -5, 12, 10); ctx.strokeStyle = '#9E9E9E'; ctx.strokeRect(-6, -5, 12, 10) }
    else if (type === 'thermometer') { ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 5); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 7, 3, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#E53935'; ctx.fillRect(-1.5, -4, 3, 10) }
    else if (type === 'burner') { ctx.fillStyle = '#FF9800'; ctx.beginPath(); ctx.moveTo(-6, 8); ctx.lineTo(0, -6); ctx.lineTo(6, 8); ctx.closePath(); ctx.fill() }
    else if (type === 'gas') { ctx.fillStyle = '#E1F5FE'; ctx.strokeStyle = '#81D4FA'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke() }
    ctx.restore()
  }

  function drawComp(ctx, comp) {
    ctx.save(); ctx.translate(comp.x, comp.y)
    const labels = { beaker: '烧杯', ice: '冰/水', dryice: '干冰', thermometer: '温度计', burner: '酒精灯', gas: '气球' }
    const colors = { beaker: '#BBDEFB', ice: '#B3E5FC', dryice: '#E0E0E0', thermometer: '#FFCDD2', burner: '#FFE0B2', gas: '#E1F5FE' }
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
      title="物态变化综合"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t); forceUpdate(n => n + 1) }}
      tab1Label="📊 实验演示"
      tab2Label="🔧 自己动手"
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} />
    </SceneShell>
  )
}
