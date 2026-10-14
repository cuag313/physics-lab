import { useState, useRef, useEffect } from 'react'
import SceneShell from '../ui/SceneShell'

/**
 * EvaporationScene — 探究蒸发快慢的影响因素
 *
 * 控制变量法探究液体温度、表面积、空气流速、液体种类对蒸发快慢的影响
 *
 * Step1: 温度影响 — 温度越高，蒸发越快
 * Step2: 表面积影响 — 表面积越大，蒸发越快
 * Step3: 空气流速与种类 — 流速越大蒸发越快；酒精比水蒸发快
 */
export default function EvaporationScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,
    switchClosed: false,
    temperature: 20,    // °C
    surfaceArea: 1.0,   // 相对表面积 0.5~2
    windSpeed: 0,       // 0~5 m/s
    liquid: 'water',    // 'water' | 'alcohol'
    t: 0,
    remaining: 1.0,     // 剩余液体量 0~1
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

    let last = performance.now()
    const loop = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05); last = now
      const s = S.current
      if (s.switchClosed && s.remaining > 0) {
        s.t += dt
        // 蒸发速率：温度↑→快，表面积↑→快，风速↑→快，酒精比水快
        const tempFactor = 1 + (s.temperature - 20) * 0.03
        const areaFactor = s.surfaceArea
        const windFactor = 1 + s.windSpeed * 0.3
        const liquidFactor = s.liquid === 'alcohol' ? 2.5 : 1
        const rate = 0.003 * tempFactor * areaFactor * windFactor * liquidFactor
        s.remaining = Math.max(0, s.remaining - rate * dt)
        if (s.data.length < 600) s.data.push({ t: s.t, r: s.remaining })
      }
      render(R)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function evapInfo(s) {
    const tempFactor = 1 + (s.temperature - 20) * 0.03
    const areaFactor = s.surfaceArea
    const windFactor = 1 + s.windSpeed * 0.3
    const liquidFactor = s.liquid === 'alcohol' ? 2.5 : 1
    const rate = 0.003 * tempFactor * areaFactor * windFactor * liquidFactor
    return { rate, tempFactor, areaFactor, windFactor, liquidFactor }
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
    const info = evapInfo(s)

    const labels = ['① 温度影响', '② 表面积影响', '③ 流速与种类']
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
        S.current.step = i + 1; S.current.t = 0; S.current.remaining = 1; S.current.data = []; S.current.records = []
        if (i === 0) { S.current.temperature = 20; S.current.windSpeed = 0 }
        if (i === 1) { S.current.temperature = 20; S.current.surfaceArea = 1 }
        if (i === 2) { S.current.windSpeed = 0; S.current.liquid = 'water' }
        setStep(i + 1); forceUpdate(n => n + 1)
      } })
    }
    ctx.textBaseline = 'alphabetic'

    const subs = {
      1: '保持表面积和空气流速不变，调节温度，观察蒸发快慢',
      2: '保持温度和空气流速不变，调节表面积，观察蒸发快慢',
      3: '调节空气流速和液体种类，观察蒸发快慢',
    }
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(subs[s.step], W / 2, 52)
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('🎯 实验目的：用控制变量法探究影响蒸发快慢的因素', W / 2, 70)

    // 蒸发可视化
    drawEvaporation(ctx, W * 0.12, H * 0.45, s, info)

    // 底部参数
    const barY = H - 26
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'

    if (s.step === 1) {
      ctx.fillStyle = '#E53935'; ctx.fillText(`温度=${s.temperature}°C`, 55, barY)
      drawMiniSlider(ctx, 135, barY, 80, (s.temperature - 0) / 80, (r) => { S.current.temperature = Math.round(r * 80); forceUpdate(n => n + 1) })
    } else if (s.step === 2) {
      ctx.fillStyle = '#2E7D32'; ctx.fillText(`表面积=${s.surfaceArea.toFixed(1)}×`, 55, barY)
      drawMiniSlider(ctx, 135, barY, 80, (s.surfaceArea - 0.5) / 1.5, (r) => { S.current.surfaceArea = Math.round((0.5 + r * 1.5) * 10) / 10; forceUpdate(n => n + 1) })
    } else {
      ctx.fillStyle = '#1565C0'; ctx.fillText(`风速=${s.windSpeed.toFixed(1)}m/s`, 55, barY)
      drawMiniSlider(ctx, 135, barY, 60, s.windSpeed / 5, (r) => { S.current.windSpeed = Math.round(r * 5 * 10) / 10; forceUpdate(n => n + 1) })
      ctx.fillStyle = '#FF6F00'
      ctx.beginPath(); ctx.roundRect(210, barY - 13, 80, 26, 5); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.fillText(s.liquid === 'water' ? '💧 水' : '🍷 酒精', 235, barY)
      canvasRef.current._clickAreas.push({ x: 210, y: barY - 13, w: 80, h: 26, onClick: () => {
        S.current.liquid = S.current.liquid === 'water' ? 'alcohol' : 'water'; forceUpdate(n => n + 1)
      } })
    }

    // 通用
    ctx.fillStyle = s.switchClosed ? '#4CAF50' : '#9E9E9E'
    ctx.beginPath(); ctx.roundRect(310, barY - 13, 60, 26, 5); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.fillText(s.switchClosed ? '▶ 开始' : '⏸ 暂停', 323, barY)
    canvasRef.current._clickAreas.push({ x: 310, y: barY - 13, w: 60, h: 26, onClick: () => { S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1) } })

    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`剩余: ${(s.remaining * 100).toFixed(0)}%`, 385, barY)
    ctx.textBaseline = 'alphabetic'

    drawRightPanel(ctx, W * 0.56, 70, W - W * 0.56 - 25, H - 100, s, info)
  }

  function drawEvaporation(ctx, cx, cy, s, info) {
    const ew = 120, eh = 80
    const on = s.switchClosed

    // 容器
    ctx.fillStyle = 'rgba(200,230,255,0.3)'; ctx.strokeStyle = '#999'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(cx - ew / 2, cy - eh / 2, ew, eh, [4, 4, 12, 12]); ctx.fill(); ctx.stroke()

    // 液体
    const liquidH = (eh - 10) * s.remaining
    const liquidColor = s.liquid === 'water' ? 'rgba(66,165,245,0.4)' : 'rgba(255,152,0,0.3)'
    ctx.fillStyle = liquidColor
    ctx.fillRect(cx - ew / 2 + 3, cy + eh / 2 - 5 - liquidH, ew - 6, liquidH)

    // 表面积指示（当表面积变化时，液面宽度变化）
    if (s.step === 2) {
      const widthRatio = s.surfaceArea
      ctx.strokeStyle = '#2E7D32'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3])
      const halfW = Math.min(ew / 2 - 3, ew / 2 * widthRatio)
      ctx.beginPath(); ctx.moveTo(cx - halfW, cy + eh / 2 - 5 - liquidH); ctx.lineTo(cx + halfW, cy + eh / 2 - 5 - liquidH); ctx.stroke()
      ctx.setLineDash([])
    }

    // 蒸发分子（从液面升起）
    if (on && s.remaining > 0) {
      const time = Date.now() / 1000
      const nMolecules = Math.floor(info.rate * 2000)
      for (let i = 0; i < Math.min(nMolecules, 12); i++) {
        const phase = ((time * 1.5 + i * 0.4) % 1)
        const mx = cx - ew / 2 + 15 + ((i * 29) % (ew - 30))
        const my = cy + eh / 2 - 5 - liquidH - phase * 40
        const alpha = 0.5 * (1 - phase)
        ctx.fillStyle = s.liquid === 'water'
          ? `rgba(66,165,245,${alpha})`
          : `rgba(255,152,0,${alpha})`
        ctx.beginPath(); ctx.arc(mx, my, 3, 0, Math.PI * 2); ctx.fill()
      }
    }

    // 风速箭头
    if (s.windSpeed > 0) {
      const windY = cy - eh / 2 - 15
      const nArrows = Math.ceil(s.windSpeed)
      ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 1.5
      for (let i = 0; i < nArrows; i++) {
        const ax = cx - ew / 2 + 20 + i * 25
        ctx.beginPath(); ctx.moveTo(ax, windY); ctx.lineTo(ax + 18, windY); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(ax + 18, windY); ctx.lineTo(ax + 13, windY - 4); ctx.lineTo(ax + 13, windY + 4); ctx.closePath(); ctx.fill()
      }
      ctx.fillStyle = '#1565C0'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
      ctx.fillText(`风 ${s.windSpeed.toFixed(1)}m/s`, cx, windY - 6)
    }

    // 温度计
    const thx = cx + ew / 2 + 15
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(thx, cy - 30); ctx.lineTo(thx, cy + 25); ctx.stroke()
    ctx.beginPath(); ctx.arc(thx, cy + 27, 4, 0, Math.PI * 2); ctx.stroke()
    const riseH = Math.max(0, Math.min(1, s.temperature / 80)) * 50
    ctx.fillStyle = '#E53935'
    ctx.fillRect(thx - 1.5, cy + 25 - riseH, 3, riseH)

    // 标注
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('蒸发（表面汽化）', cx, cy + eh / 2 + 16)
    ctx.fillStyle = '#333'; ctx.font = '10px monospace'
    ctx.fillText(`T=${s.temperature}°C`, thx, cy - 42)
    ctx.fillStyle = s.liquid === 'water' ? '#1565C0' : '#FF6F00'
    ctx.fillText(s.liquid === 'water' ? '水' : '酒精', cx, cy + eh / 2 + 32)
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
    ctx.fillText('🎯 影响蒸发快慢的因素', x + 12, y + 12)
    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('温度↑ → 蒸发快', x + 12, y + 32)
    ctx.fillText('表面积↑ → 蒸发快', x + 12, y + 48)
    ctx.fillText('空气流速↑ → 蒸发快', x + 12, y + 64)
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444'
    ctx.fillText(`当前蒸发速率: ${info.rate.toFixed(5)}/s`, x + 12, y + 82)
    ctx.fillText(`剩余液体: ${(s.remaining * 100).toFixed(1)}%`, x + 12, y + 96)

    let ky = y + 116
    const guideSteps = s.step === 1
      ? ['① 调节温度滑条', '② 点"开始"观察蒸发', '③ 温度越高蒸发越快', '④ 记录数据']
      : s.step === 2
        ? ['① 调节表面积滑条', '② 点"开始"观察蒸发', '③ 表面积越大蒸发越快', '④ 记录数据']
        : ['① 调节风速滑条', '② 切换水/酒精', '③ 风速大→蒸发快', '④ 酒精比水蒸发快']
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('📋 操作步骤', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#5D4037'
    for (let i = 0; i < guideSteps.length; i++) ctx.fillText(guideSteps[i], x + 12, ky + i * 12)
    ky += guideSteps.length * 12 + 6

    ctx.fillStyle = '#C62828'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('⚠ 注意事项', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#B71C1C'
    const notes = s.step === 1
      ? ['• 控制变量法：只改变温度', '• 蒸发在任何温度下都能发生', '• 温度越高，分子运动越剧烈']
      : s.step === 2
        ? ['• 控制变量法：只改变表面积', '• 表面积越大，暴露的分子越多', '• 晾衣服摊开就是增大表面积']
        : ['• 酒精比水蒸发快（沸点低）', '• 空气流速带走液面附近蒸气', '• 蒸发致冷（吸热）']
    for (let i = 0; i < notes.length; i++) ctx.fillText(notes[i], x + 12, ky + i * 12)
    ky += notes.length * 12 + 6

    if (s.records.length > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('📊 实验数据', x + 12, ky); ky += 14
      ctx.fillStyle = '#FFB74D'; ctx.fillRect(x + 12, ky, w - 24, 16)
      ctx.fillStyle = '#333'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      const c1 = x + 22, c2 = x + 60, c3 = x + 110
      ctx.fillText('#', c1, ky + 2); ctx.fillText('条件', c2, ky + 2); ctx.fillText('剩余%', c3, ky + 2)
      ky += 14
      for (let i = 0; i < s.records.length; i++) {
        const r = s.records[i]
        if (i % 2 === 0) { ctx.fillStyle = '#FFF8E1'; ctx.fillRect(x + 12, ky, w - 24, 13) }
        ctx.fillStyle = '#333'; ctx.font = '9px monospace'; ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), c1, ky + 1); ctx.fillText(r.cond, c2, ky + 1); ctx.fillText(r.rem.toFixed(0), c3, ky + 1)
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
      const cond = s2.step === 1 ? `${s2.temperature}°C` : s2.step === 2 ? `${s2.surfaceArea}×` : `${s2.windSpeed}m/s`
      s2.records.push({ cond, rem: s2.remaining * 100 }); forceUpdate(n => n + 1)
    } })
    ctx.fillStyle = '#FF9800'; ctx.strokeStyle = '#E65100'
    ctx.beginPath(); ctx.roundRect(bx + btnW + gap, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.fillText('🗑 清除', bx + btnW + gap + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({ x: bx + btnW + gap, y: btnY, w: btnW, h: btnH, onClick: () => { S.current.records = []; forceUpdate(n => n + 1) } })
    ctx.fillStyle = '#9E9E9E'; ctx.strokeStyle = '#616161'
    ctx.beginPath(); ctx.roundRect(bx + (btnW + gap) * 2, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.fillText('↺ 重置', bx + (btnW + gap) * 2 + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({ x: bx + (btnW + gap) * 2, y: btnY, w: btnW, h: btnH, onClick: () => {
      S.current.t = 0; S.current.remaining = 1; S.current.temperature = 20; S.current.surfaceArea = 1
      S.current.windSpeed = 0; S.current.liquid = 'water'; S.current.data = []; S.current.records = []; S.current.switchClosed = false
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
    if (s._guideOpen) { ctx.textAlign = 'left'; ctx.font = '10px sans-serif'; ['① 拖入器材到画布', '② 搭建蒸发实验', '③ 观察蒸发快慢', '④ 右键删除器材'].forEach((l, i) => ctx.fillText(l, bx + 10, by + 40 + i * 15)) }
    ctx.textBaseline = 'alphabetic'
    drawPalette(ctx, palX, 10, palW, H - 20)
  }

  function drawPalette(ctx, x, y, w, h) {
    ctx.fillStyle = '#fafafa'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('热学器材', x + w / 2, y + 10)
    const items = [
      { type: 'beaker', name: '容器' }, { type: 'water', name: '水' },
      { type: 'alcohol', name: '酒精' }, { type: 'thermometer', name: '温度计' },
      { type: 'fan', name: '电风扇' }, { type: 'burner', name: '酒精灯（干扰）' },
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
    else if (type === 'water') { ctx.fillStyle = '#BBDEFB'; ctx.fillRect(-7, -4, 14, 8) }
    else if (type === 'alcohol') { ctx.fillStyle = '#FFE082'; ctx.fillRect(-7, -4, 14, 8) }
    else if (type === 'thermometer') { ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 5); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 7, 3, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#E53935'; ctx.fillRect(-1.5, -4, 3, 10) }
    else if (type === 'fan') { ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 1.5; for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 8, Math.sin(a) * 8); ctx.stroke() } }
    else if (type === 'burner') { ctx.fillStyle = '#FF9800'; ctx.beginPath(); ctx.moveTo(-6, 8); ctx.lineTo(0, -6); ctx.lineTo(6, 8); ctx.closePath(); ctx.fill() }
    ctx.restore()
  }

  function drawComp(ctx, comp) {
    ctx.save(); ctx.translate(comp.x, comp.y)
    const labels = { beaker: '容器', water: '水', alcohol: '酒精', thermometer: '温度计', fan: '电风扇', burner: '酒精灯' }
    const colors = { beaker: '#BBDEFB', water: '#E3F2FD', alcohol: '#FFF9C4', thermometer: '#FFCDD2', fan: '#E3F2FD', burner: '#FFE0B2' }
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
      title="探究蒸发快慢的影响因素"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t); forceUpdate(n => n + 1) }}
      tab1Label="📊 实验演示"
      tab2Label="🔧 自己动手"
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} />
    </SceneShell>
  )
}
