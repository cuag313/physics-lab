import { useState, useRef, useEffect } from 'react'

/**
 * BoilingWaterScene — 探究水的沸腾
 *
 * 加热至沸腾，沸腾过程中温度保持不变（沸点）
 * 沸点与气压有关：气压越低沸点越低
 *
 * Step1: 沸腾现象 — 加热至沸腾，观察气泡由小变大
 * Step2: 沸点不变 — 沸腾过程温度保持在 100°C，吸热不升温
 * Step3: 沸点与气压 — 调节气压，观察沸点变化
 */
export default function BoilingWaterScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,
    switchClosed: false,
    heating: true,
    pressure: 1.0,    // atm
    t: 0,
    temp: 25,
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
      const boilT = 100 * s.pressure // 简化：沸点 ∝ 气压
      if (s.switchClosed && s.heating) {
        s.t += dt
        if (s.temp < boilT) s.temp += 1.5 * dt
        else s.temp = boilT // 沸腾时温度不变
        if (s.data.length < 600) s.data.push({ t: s.t, temp: s.temp })
      }
      render(R)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function boilInfo(s) {
    const boilT = 100 * s.pressure
    const isBoiling = s.switchClosed && s.temp >= boilT - 0.1
    const phase = s.temp >= boilT - 0.1 ? '沸腾中' : s.temp >= 80 ? '接近沸腾' : s.temp >= 40 ? '加热中' : '冷水'
    return { boilT, isBoiling, phase }
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
    const info = boilInfo(s)

    const labels = ['① 沸腾现象', '② 沸点不变', '③ 沸点与气压']
    const bw = 110, bh = 28, gap = 8
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
        S.current.step = i + 1; S.current.t = 0; S.current.temp = 25; S.current.data = []; S.current.records = []
        if (i === 2) S.current.pressure = 0.8
        setStep(i + 1); forceUpdate(n => n + 1)
      } })
    }
    ctx.textBaseline = 'alphabetic'

    const subs = {
      1: '加热至沸腾，观察大量气泡由小变大、上升至液面破裂',
      2: '沸腾过程持续吸热，温度保持沸点不变',
      3: '调节气压，观察沸点变化：气压越低沸点越低',
    }
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(subs[s.step], W / 2, 52)
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('🎯 实验目的：观察沸腾现象，理解沸点不变的规律及沸点与气压的关系', W / 2, 70)

    drawBoilingApparatus(ctx, W * 0.12, H * 0.45, s, info)
    const gx = W * 0.32, gy = 80, gw = W * 0.64, gh = H * 0.42
    drawCurve(ctx, gx, gy, gw, gh, s, info)

    const barY = H - 26
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillStyle = s.heating ? '#E53935' : '#9E9E9E'
    ctx.beginPath(); ctx.roundRect(55, barY - 13, 70, 26, 5); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.fillText(s.heating ? '🔥 加热' : '⏸ 暂停', 72, barY)
    canvasRef.current._clickAreas.push({ x: 55, y: barY - 13, w: 70, h: 26, onClick: () => { S.current.heating = !S.current.heating; forceUpdate(n => n + 1) } })

    if (s.step === 3) {
      ctx.fillStyle = '#9C27B0'; ctx.fillText(`气压=${s.pressure.toFixed(2)}atm`, 135, barY)
      drawMiniSlider(ctx, 220, barY, 80, (s.pressure - 0.5) / 1.0, (r) => {
        S.current.pressure = Math.round((0.5 + r * 1.0) * 100) / 100; forceUpdate(n => n + 1)
      })
    }

    ctx.fillStyle = '#E53935'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`T = ${s.temp.toFixed(1)}°C`, 315, barY)
    ctx.fillStyle = '#4CAF50'
    ctx.fillText(`沸点 = ${info.boilT.toFixed(1)}°C`, 405, barY)
    ctx.fillStyle = info.isBoiling ? '#FF9800' : '#999'
    ctx.fillText(info.phase, 510, barY)
    ctx.textBaseline = 'alphabetic'

    drawRightPanel(ctx, W * 0.56, H * 0.55, W - W * 0.56 - 25, H - H * 0.55 - 35, s, info)
  }

  function drawBoilingApparatus(ctx, cx, cy, s, info) {
    const bw = 130, bh = 115
    const on = s.switchClosed && s.heating

    // 烧杯
    ctx.fillStyle = 'rgba(200,230,255,0.3)'; ctx.strokeStyle = '#999'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, [4, 4, 12, 12]); ctx.fill(); ctx.stroke()
    // 水
    const waterH = bh - 15
    ctx.fillStyle = `rgba(66,165,245,${0.2 + Math.min(s.temp / 150, 0.3)})`
    ctx.fillRect(cx - bw / 2 + 3, cy - bh / 2 + 8, bw - 6, waterH)

    // 气泡（沸腾时大量大气泡）
    if (info.isBoiling) {
      const time = Date.now() / 1000
      for (let i = 0; i < 15; i++) {
        const bx = cx - bw / 2 + 15 + ((i * 37) % (bw - 30))
        const phase = ((time * 2 + i * 0.3) % 1)
        const by = cy + bh / 2 - 10 - phase * (waterH - 5)
        const bSize = 3 + phase * 6
        const alpha = 0.3 + 0.4 * (1 - phase)
        ctx.fillStyle = `rgba(255,255,255,${alpha})`
        ctx.beginPath(); ctx.arc(bx, by, bSize, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = `rgba(150,200,255,${alpha})`; ctx.lineWidth = 0.8; ctx.stroke()
      }
    } else if (s.temp > 60) {
      // 小气泡（沸腾前）
      const time = Date.now() / 1000
      for (let i = 0; i < 8; i++) {
        const bx = cx - bw / 2 + 15 + ((i * 31) % (bw - 30))
        const phase = ((time * 1.5 + i * 0.4) % 1)
        const by = cy + bh / 2 - 10 - phase * (waterH * 0.5)
        const bSize = 2 + phase * 2
        ctx.fillStyle = `rgba(255,255,255,0.3)`
        ctx.beginPath(); ctx.arc(bx, by, bSize, 0, Math.PI * 2); ctx.fill()
      }
    }

    // 酒精灯
    if (on) {
      ctx.fillStyle = '#FF9800'; ctx.beginPath()
      ctx.moveTo(cx - 15, cy + bh / 2 + 5); ctx.lineTo(cx, cy + bh / 2 - 15); ctx.lineTo(cx + 15, cy + bh / 2 + 5); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#FFEB3B'; ctx.beginPath()
      ctx.moveTo(cx - 8, cy + bh / 2 + 5); ctx.lineTo(cx, cy + bh / 2 - 8); ctx.lineTo(cx + 8, cy + bh / 2 + 5); ctx.closePath(); ctx.fill()
    }

    // 温度计
    const thx = cx + 35
    ctx.strokeStyle = '#555'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(thx, cy - 40); ctx.lineTo(thx, cy + 25); ctx.stroke()
    ctx.beginPath(); ctx.arc(thx, cy + 27, 5, 0, Math.PI * 2); ctx.stroke()
    const riseH = Math.max(0, Math.min(1, (s.temp - 20) / 90)) * 55
    ctx.fillStyle = '#E53935'
    ctx.fillRect(thx - 2, cy + 25 - riseH, 4, riseH)
    ctx.beginPath(); ctx.arc(thx, cy + 27, 3.5, 0, Math.PI * 2); ctx.fill()

    // 标注
    ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(s.temp.toFixed(1) + '°C', thx, cy - 52)
    if (info.isBoiling) {
      ctx.fillStyle = '#FF9800'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('沸腾中！大量气泡上升', cx, cy + bh / 2 + 30)
    }
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

    const maxT = 60, minV = 15, maxV = 115
    const toX = t => ox + Math.min(t / maxT, 1) * pw
    const toY = v => oy + ph - ((v - minV) / (maxV - minV)) * ph

    ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 0.8
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#999'
    for (let v = 20; v <= 110; v += 20) {
      const y = toY(v)
      ctx.textAlign = 'right'; ctx.fillText(v + '°C', ox - 5, y + 3)
      ctx.beginPath(); ctx.moveTo(ox, y); ctx.lineTo(ox + pw, y); ctx.stroke()
    }
    for (let t = 0; t <= 60; t += 10) {
      ctx.textAlign = 'center'; ctx.fillText(t + 's', toX(t), oy + ph + 14)
      ctx.beginPath(); ctx.moveTo(toX(t), oy); ctx.lineTo(toX(t), oy + ph); ctx.stroke()
    }

    // 沸点线
    ctx.strokeStyle = 'rgba(255,152,0,0.5)'; ctx.lineWidth = 1; ctx.setLineDash([5, 3])
    ctx.beginPath(); ctx.moveTo(ox, toY(info.boilT)); ctx.lineTo(ox + pw, toY(info.boilT)); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#FF9800'; ctx.font = '9px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText(`沸点 ${info.boilT.toFixed(1)}°C`, ox + 4, toY(info.boilT) - 4)

    // 曲线
    if (s.data.length > 1) {
      ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2; ctx.beginPath()
      s.data.forEach((d, i) => {
        const x = toX(d.t), y = toY(d.temp)
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      })
      ctx.stroke()

      // 沸腾平台
      if (info.isBoiling) {
        let startIdx = -1
        s.data.forEach((d, i) => { if (d.temp >= info.boilT - 0.1 && startIdx < 0) startIdx = i })
        if (startIdx >= 0 && startIdx < s.data.length - 1) {
          ctx.fillStyle = 'rgba(255,152,0,0.12)'
          const px0 = toX(s.data[startIdx].t)
          ctx.fillRect(px0, toY(info.boilT + 3), ox + pw - px0, toY(info.boilT - 3) - toY(info.boilT + 3))
          ctx.fillStyle = '#FF9800'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'
          ctx.fillText('沸腾（吸热不升温）', (px0 + ox + pw) / 2, toY(info.boilT + 3) - 6)
        }
      }
    }

    if (s.switchClosed && s.data.length > 0) {
      const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 300)
      ctx.fillStyle = `rgba(229,57,53,${pulse})`
      ctx.beginPath(); ctx.arc(toX(s.t), toY(s.temp), 5, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke()
    }
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
    ctx.fillText('🎯 水的沸腾', x + 12, y + 12)
    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`沸点 = ${info.boilT.toFixed(1)}°C`, x + 12, y + 32)
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444'
    ctx.fillText(`T = ${s.temp.toFixed(1)}°C    状态: ${info.phase}`, x + 12, y + 50)
    if (s.step === 3) ctx.fillText(`气压 = ${s.pressure.toFixed(2)} atm`, x + 12, y + 64)

    let ky = y + (s.step === 3 ? 82 : 66)
    const guideSteps = s.step === 1
      ? ['① 点"加热"开始加热', '② 观察气泡由小变大', '③ 沸腾时大量气泡上升破裂', '④ 剧烈汽化现象']
      : s.step === 2
        ? ['① 持续加热', '② 温度升到沸点后不变', '③ 持续吸热温度不变', '④ 结论：沸腾时温度不变']
        : ['① 调节气压滑条', '② 气压↓→沸点↓', '③ 气压↑→沸点↑', '④ 高压锅原理：气压高沸点高']
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('📋 操作步骤', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#5D4037'
    for (let i = 0; i < guideSteps.length; i++) ctx.fillText(guideSteps[i], x + 12, ky + i * 12)
    ky += guideSteps.length * 12 + 6

    ctx.fillStyle = '#C62828'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('⚠ 注意事项', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#B71C1C'
    const notes = s.step === 1
      ? ['• 气泡上升过程中由小变大', '• 沸腾是剧烈的汽化现象', '• 发生在液体内部和表面']
      : s.step === 2
        ? ['• 沸腾过程温度不变', '• 条件：达到沸点+持续吸热', '• 与蒸发的区别：剧烈程度不同']
        : ['• 标准大气压下沸点 100°C', '• 高压锅：增大气压提高沸点', '• 高山上沸点降低，饭难煮熟']
    for (let i = 0; i < notes.length; i++) ctx.fillText(notes[i], x + 12, ky + i * 12)
    ky += notes.length * 12 + 6

    if (s.records.length > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('📊 实验数据', x + 12, ky); ky += 14
      ctx.fillStyle = '#FFB74D'; ctx.fillRect(x + 12, ky, w - 24, 16)
      ctx.fillStyle = '#333'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      const c1 = x + 26, c2 = x + 60, c3 = x + 110
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
      S.current.t = 0; S.current.temp = 25; S.current.pressure = 1; S.current.data = []; S.current.records = []; S.current.switchClosed = false
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
    if (s._guideOpen) { ctx.textAlign = 'left'; ctx.font = '10px sans-serif'; ['① 拖入器材到画布', '② 搭建加热装置', '③ 观察沸腾现象', '④ 右键删除器材'].forEach((l, i) => ctx.fillText(l, bx + 10, by + 40 + i * 15)) }
    ctx.textBaseline = 'alphabetic'
    drawPalette(ctx, palX, 10, palW, H - 20)
  }

  function drawPalette(ctx, x, y, w, h) {
    ctx.fillStyle = '#fafafa'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('热学器材', x + w / 2, y + 10)
    const items = [
      { type: 'beaker', name: '烧杯' }, { type: 'thermometer', name: '温度计' },
      { type: 'burner', name: '酒精灯' }, { type: 'water', name: '水' },
      { type: 'testTube', name: '试管（干扰）' }, { type: 'ice', name: '冰（干扰）' },
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
    if (type === 'beaker') { ctx.strokeStyle = '#888'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(-8, -5, 16, 12, [1,1,3,3]); ctx.stroke(); ctx.fillStyle = 'rgba(66,165,245,0.3)'; ctx.fillRect(-7, -1, 14, 7) }
    else if (type === 'thermometer') { ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 5); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 7, 3, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#E53935'; ctx.fillRect(-1.5, -4, 3, 10) }
    else if (type === 'burner') { ctx.fillStyle = '#FF9800'; ctx.beginPath(); ctx.moveTo(-6, 8); ctx.lineTo(0, -6); ctx.lineTo(6, 8); ctx.closePath(); ctx.fill() }
    else if (type === 'water') { ctx.fillStyle = '#BBDEFB'; ctx.fillRect(-7, -4, 14, 8) }
    else if (type === 'testTube') { ctx.strokeStyle = '#888'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(-5, -8, 10, 16, [1,1,4,4]); ctx.stroke() }
    else if (type === 'ice') { ctx.fillStyle = '#B3E5FC'; ctx.fillRect(-6, -5, 12, 10); ctx.fillStyle = '#fff'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('❄', 0, 3) }
    ctx.restore()
  }

  function drawComp(ctx, comp) {
    ctx.save(); ctx.translate(comp.x, comp.y)
    const labels = { beaker: '烧杯', thermometer: '温度计', burner: '酒精灯', water: '水', testTube: '试管', ice: '冰' }
    const colors = { beaker: '#BBDEFB', thermometer: '#FFCDD2', burner: '#FFE0B2', water: '#E3F2FD', testTube: '#E3F2FD', ice: '#B3E5FC' }
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
        <button onClick={() => { S.current.t = 0; S.current.temp = 25; S.current.pressure = 1; S.current.data = []; S.current.records = []; S.current.switchClosed = false; forceUpdate(n => n + 1) }} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', color: '#666', cursor: 'pointer' }}>↺ 重置</button>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} />
      </div>
    </div>
  )
}