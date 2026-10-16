import { useState, useRef, useEffect } from 'react'
import SceneShell from '../ui/SceneShell'

/**
 * SpecificHeatScene — 探究不同物质吸热能力
 *
 * 用相同加热器比较水和食用油的升温快慢
 * Q = cmΔt，水的比热容大（4.2×10³），升温慢
 *
 * Step1: 对比加热 — 同时加热水和油，观察升温快慢
 * Step2: 比热容概念 — 相同 Q、m 下，Δt 与 c 成反比
 * Step3: Q=cmΔt 验证 — 记录数据，验证公式
 */
export default function SpecificHeatScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,
    switchClosed: false,
    heating: true,
    mass: 1,          // kg
    power: 200,       // W 加热功率
    t: 0,
    tempWater: 20,
    tempOil: 20,
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

  // 比热容
  const cWater = 4200
  const cOil = 2100

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
      if (s.switchClosed && s.heating) {
        s.t += dt
        // ΔT = Q/(cm) = P·Δt/(c·m)
        s.tempWater += s.power * dt / (cWater * s.mass)
        s.tempOil += s.power * dt / (cOil * s.mass)
        if (s.data.length < 600) s.data.push({ t: s.t, tw: s.tempWater, to: s.tempOil })
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

    const labels = ['① 对比加热', '② 比热容概念', '③ Q=cmΔt 验证']
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
        S.current.step = i + 1; S.current.t = 0; S.current.tempWater = 20; S.current.tempOil = 20
        S.current.data = []; S.current.records = []
        setStep(i + 1); forceUpdate(n => n + 1)
      } })
    }
    ctx.textBaseline = 'alphabetic'

    const subs = {
      1: '相同加热器、相同质量的水和食用油，比较升温快慢',
      2: '相同吸收热量 Q、相同质量 m 下，Δt 与比热容 c 成反比',
      3: '记录数据，验证 Q = cmΔt',
    }
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(subs[s.step], W / 2, 52)
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('🎯 实验目的：比较不同物质吸热能力，建立比热容概念，验证 Q=cmΔt', W / 2, 70)

    // 两个烧杯对比
    drawTwoBeakers(ctx, W * 0.15, H * 0.35, s)
    // 曲线
    const gx = W * 0.32, gy = 80, gw = W * 0.64, gh = H * 0.42
    drawCurve(ctx, gx, gy, gw, gh, s)

    // 底部
    const barY = H - 26
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillStyle = s.heating ? '#E53935' : '#9E9E9E'
    ctx.beginPath(); ctx.roundRect(55, barY - 13, 70, 26, 5); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.fillText(s.heating ? '🔥 加热' : '⏸ 暂停', 72, barY)
    canvasRef.current._clickAreas.push({ x: 55, y: barY - 13, w: 70, h: 26, onClick: () => { S.current.heating = !S.current.heating; forceUpdate(n => n + 1) } })

    ctx.fillStyle = '#1565C0'; ctx.fillText(`m=${s.mass}kg`, 135, barY)
    drawMiniSlider(ctx, 185, barY, 60, (s.mass - 0.5) / 4.5, (r) => { S.current.mass = Math.round((0.5 + r * 4.5) * 10) / 10; S.current.t = 0; S.current.tempWater = 20; S.current.tempOil = 20; S.current.data = []; forceUpdate(n => n + 1) })

    ctx.fillStyle = '#FF6F00'; ctx.fillText(`P=${s.power}W`, 260, barY)
    drawMiniSlider(ctx, 310, barY, 60, (s.power - 50) / 450, (r) => { S.current.power = Math.round(50 + r * 450); forceUpdate(n => n + 1) })

    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`水: ${s.tempWater.toFixed(1)}°C`, 385, barY)
    ctx.fillStyle = '#FF6F00'
    ctx.fillText(`油: ${s.tempOil.toFixed(1)}°C`, 475, barY)
    ctx.textBaseline = 'alphabetic'

    drawRightPanel(ctx, W * 0.56, H * 0.55, W - W * 0.56 - 25, H - H * 0.55 - 35, s)
  }

  function drawTwoBeakers(ctx, cx, cy, s) {
    const bw = 85, bh = 100
    const on = s.switchClosed && s.heating

    // 水烧杯
    drawBeaker(ctx, cx, cy, bw, bh, s.tempWater, '#1565C0', '水', on, cWater, s.mass)
    // 油烧杯
    drawBeaker(ctx, cx + bw + 35, cy, bw, bh, s.tempOil, '#FF6F00', '食用油', on, cOil, s.mass)
  }

  function drawBeaker(ctx, cx, cy, bw, bh, temp, color, label, on, c, _mass) {
    // 烧杯
    ctx.fillStyle = 'rgba(200,230,255,0.3)'; ctx.strokeStyle = '#999'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, [4, 4, 12, 12]); ctx.fill(); ctx.stroke()
    // 液体
    const heatAlpha = Math.min((temp - 20) / 80, 1) * 0.3
    ctx.fillStyle = color === '#1565C0'
      ? `rgba(66,165,245,${0.2 + heatAlpha})`
      : `rgba(255,152,0,${0.15 + heatAlpha})`
    ctx.fillRect(cx - bw / 2 + 3, cy - bh / 2 + 8, bw - 6, bh - 15)

    // 加热丝
    if (on) {
      ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2
      ctx.beginPath()
      for (let i = 0; i < 4; i++) {
        ctx.moveTo(cx - 15 + i * 10, cy + bh / 2 - 12)
        ctx.lineTo(cx - 10 + i * 10, cy + bh / 2 - 5)
        ctx.lineTo(cx - 5 + i * 10, cy + bh / 2 - 12)
      }
      ctx.stroke()
    }

    // 温度计
    const thx = cx + 12
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(thx, cy - 35); ctx.lineTo(thx, cy + 25); ctx.stroke()
    ctx.beginPath(); ctx.arc(thx, cy + 27, 4, 0, Math.PI * 2); ctx.stroke()
    const riseH = Math.max(0, Math.min(1, (temp - 20) / 80)) * 50
    ctx.fillStyle = '#E53935'
    ctx.fillRect(thx - 1.5, cy + 25 - riseH, 3, riseH)

    // 标注
    ctx.fillStyle = color; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(label, cx, cy - bh / 2 - 18)
    ctx.fillStyle = '#333'; ctx.font = 'bold 10px monospace'
    ctx.fillText(temp.toFixed(1) + '°C', cx, cy - bh / 2 - 4)
    ctx.fillStyle = '#666'; ctx.font = '8px sans-serif'
    ctx.fillText(`c=${(c / 1000).toFixed(1)}×10³ J/(kg·°C)`, cx, cy + bh / 2 + 16)
    ctx.textBaseline = 'alphabetic'
  }

  function drawCurve(ctx, gx, gy, gw, gh, s) {
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

    const maxT = 60, minV = 15, maxV = 110
    const toX = t => ox + Math.min(t / maxT, 1) * pw
    const toY = v => oy + ph - ((v - minV) / (maxV - minV)) * ph

    ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 0.8
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#999'
    for (let v = 20; v <= 100; v += 20) {
      const y = toY(v)
      ctx.textAlign = 'right'; ctx.fillText(v + '°C', ox - 5, y + 3)
      ctx.beginPath(); ctx.moveTo(ox, y); ctx.lineTo(ox + pw, y); ctx.stroke()
    }
    for (let t = 0; t <= 60; t += 10) {
      ctx.textAlign = 'center'; ctx.fillText(t + 's', toX(t), oy + ph + 14)
      ctx.beginPath(); ctx.moveTo(toX(t), oy); ctx.lineTo(toX(t), oy + ph); ctx.stroke()
    }

    if (s.data.length > 1) {
      // 水曲线（蓝）
      ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 2; ctx.beginPath()
      s.data.forEach((d, i) => { const x = toX(d.t), y = toY(d.tw); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) })
      ctx.stroke()
      // 油曲线（橙）
      ctx.strokeStyle = '#FF6F00'; ctx.lineWidth = 2; ctx.beginPath()
      s.data.forEach((d, i) => { const x = toX(d.t), y = toY(d.to); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) })
      ctx.stroke()
    }

    // 图例
    ctx.fillStyle = '#1565C0'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('—— 水（c大，升温慢）', ox + 6, oy + 12)
    ctx.fillStyle = '#FF6F00'
    ctx.fillText('—— 食用油（c小，升温快）', ox + 6, oy + 26)
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
    ctx.fillText('🎯 不同物质吸热能力', x + 12, y + 12)
    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('Q = cmΔt', x + 12, y + 32)
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444'
    ctx.fillText(`c水 = 4.2×10³ J/(kg·°C)`, x + 12, y + 50)
    ctx.fillText(`c油 = 2.1×10³ J/(kg·°C)`, x + 12, y + 64)
    const Q = s.power * s.t
    ctx.fillText(`Q = P·t = ${s.power}×${s.t.toFixed(0)} = ${Q.toFixed(0)} J`, x + 12, y + 80)

    let ky = y + 100
    const guideSteps = s.step === 1
      ? ['① 点"加热"同时加热', '② 观察两者升温快慢', '③ 油升温更快', '④ 说明油吸热能力弱']
      : s.step === 2
        ? ['① 相同 Q、m 条件下', '② c 大的物质 Δt 小', '③ 水升温慢（c大）', '④ 建立比热容概念']
        : ['① 改变 m 或 P', '② 记录 Q、Δt、c 数据', '③ 验证 Q = cmΔt', '④ 结论：比热容是物质特性']
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('📋 操作步骤', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#5D4037'
    for (let i = 0; i < guideSteps.length; i++) ctx.fillText(guideSteps[i], x + 12, ky + i * 12)
    ky += guideSteps.length * 12 + 6

    ctx.fillStyle = '#C62828'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('⚠ 注意事项', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#B71C1C'
    const notes = s.step === 1
      ? ['• 必须用相同功率的加热器', '• 水和油质量必须相等', '• 同时开始加热，公平对比']
      : s.step === 2
        ? ['• 比热容是物质的特性', '• 水的比热容大→适合做冷却剂', '• c = Q/(mΔt)']
        : ['• Q 由加热功率和时间决定', '• 注意单位统一（J、kg、°C）', '• 测量误差来源：热量散失']
    for (let i = 0; i < notes.length; i++) ctx.fillText(notes[i], x + 12, ky + i * 12)
    ky += notes.length * 12 + 6

    if (s.records.length > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('📊 实验数据', x + 12, ky); ky += 14
      ctx.fillStyle = '#FFB74D'; ctx.fillRect(x + 12, ky, w - 24, 16)
      ctx.fillStyle = '#333'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      const c1 = x + 22, c2 = x + 55, c3 = x + 95, c4 = x + 145
      ctx.fillText('#', c1, ky + 2); ctx.fillText('Q(J)', c2, ky + 2); ctx.fillText('Δt(s)', c3, ky + 2); ctx.fillText('ΔT(°C)', c4, ky + 2)
      ky += 14
      for (let i = 0; i < s.records.length; i++) {
        const r = s.records[i]
        if (i % 2 === 0) { ctx.fillStyle = '#FFF8E1'; ctx.fillRect(x + 12, ky, w - 24, 13) }
        ctx.fillStyle = '#333'; ctx.font = '9px monospace'; ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), c1, ky + 1); ctx.fillText(r.Q.toFixed(0), c2, ky + 1); ctx.fillText(r.t.toFixed(0), c3, ky + 1); ctx.fillText(r.dT.toFixed(1), c4, ky + 1)
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
      const s2 = S.current; s2.records.push({ Q: s2.power * s2.t, t: s2.t, dT: s2.tempWater - 20 }); forceUpdate(n => n + 1)
    } })
    ctx.fillStyle = '#FF9800'; ctx.strokeStyle = '#E65100'
    ctx.beginPath(); ctx.roundRect(bx + btnW + gap, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.fillText('🗑 清除', bx + btnW + gap + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({ x: bx + btnW + gap, y: btnY, w: btnW, h: btnH, onClick: () => { S.current.records = []; forceUpdate(n => n + 1) } })
    ctx.fillStyle = '#9E9E9E'; ctx.strokeStyle = '#616161'
    ctx.beginPath(); ctx.roundRect(bx + (btnW + gap) * 2, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.fillText('↺ 重置', bx + (btnW + gap) * 2 + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({ x: bx + (btnW + gap) * 2, y: btnY, w: btnW, h: btnH, onClick: () => {
      S.current.t = 0; S.current.tempWater = 20; S.current.tempOil = 20; S.current.data = []; S.current.records = []; S.current.switchClosed = false
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
    if (s._guideOpen) { ctx.textAlign = 'left'; ctx.font = '10px sans-serif'; ['① 拖入器材到画布', '② 搭建加热装置', '③ 对比升温快慢', '④ 右键删除器材'].forEach((l, i) => ctx.fillText(l, bx + 10, by + 40 + i * 15)) }
    ctx.textBaseline = 'alphabetic'
    drawPalette(ctx, palX, 10, palW, H - 20)
  }

  function drawPalette(ctx, x, y, w, h) {
    ctx.fillStyle = '#fafafa'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('热学器材', x + w / 2, y + 10)
    const items = [
      { type: 'beaker', name: '烧杯' }, { type: 'heater', name: '加热器' },
      { type: 'thermometer', name: '温度计' }, { type: 'water', name: '水' },
      { type: 'oil', name: '食用油' }, { type: 'balance', name: '天平' },
      { type: 'testTube', name: '试管（干扰）' }, { type: 'stopwatch', name: '秒表（干扰）' },
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
    else if (type === 'heater') { ctx.strokeStyle = '#E53935'; ctx.lineWidth = 1.5; ctx.beginPath(); for (let i = 0; i < 3; i++) { ctx.moveTo(-6 + i * 6, 4); ctx.lineTo(-3 + i * 6, -3); ctx.lineTo(0 + i * 6, 4) } ctx.stroke() }
    else if (type === 'thermometer') { ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 5); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 7, 3, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#E53935'; ctx.fillRect(-1.5, -4, 3, 10) }
    else if (type === 'water') { ctx.fillStyle = '#BBDEFB'; ctx.fillRect(-7, -4, 14, 8) }
    else if (type === 'oil') { ctx.fillStyle = '#FFE082'; ctx.fillRect(-7, -4, 14, 8) }
    else if (type === 'balance') { ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-8, 5); ctx.lineTo(8, 5); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 5); ctx.stroke() }
    else if (type === 'testTube') { ctx.strokeStyle = '#888'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(-5, -8, 10, 16, [1,1,4,4]); ctx.stroke() }
    else if (type === 'stopwatch') { ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, -11); ctx.stroke() }
    ctx.restore()
  }

  function drawComp(ctx, comp) {
    ctx.save(); ctx.translate(comp.x, comp.y)
    const labels = { beaker: '烧杯', heater: '加热器', thermometer: '温度计', water: '水', oil: '食用油', balance: '天平', testTube: '试管', stopwatch: '秒表' }
    const colors = { beaker: '#BBDEFB', heater: '#FFCDD2', thermometer: '#FFCDD2', water: '#E3F2FD', oil: '#FFF9C4', balance: '#D7CCC8', testTube: '#E3F2FD', stopwatch: '#E0E0E0' }
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
      title="探究不同物质吸热能力"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t); forceUpdate(n => n + 1) }}
      tab1Label="📊 实验演示"
      tab2Label="🔧 自己动手"
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} />
    </SceneShell>
  )
}
