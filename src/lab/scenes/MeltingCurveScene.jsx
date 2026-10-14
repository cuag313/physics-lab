import { useState, useRef, useEffect } from 'react'
import SceneShell from '../ui/SceneShell'

/**
 * MeltingCurveScene — 探究固体熔化特点
 *
 * 水浴加热晶体（冰/萘）与非晶体（石蜡），实时绘制温度-时间曲线
 * 晶体：熔化过程温度不变（熔点），吸热不升温
 * 非晶体：熔化过程温度持续上升，无固定熔点
 *
 * Step1: 晶体熔化 — 冰/萘加热，观察熔化阶段温度不变
 * Step2: 非晶体熔化 — 石蜡加热，温度持续上升无平台
 * Step3: 晶体 vs 非晶体 — 对比温度-时间曲线差异
 */
export default function MeltingCurveScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,
    switchClosed: false,
    material: 'ice',   // 'ice'=晶体(冰) | 'wax'=非晶体(石蜡)
    heating: true,     // 是否加热
    t: 0,
    temp: -10,         // 当前温度 °C
    data: [],          // {t, temp}
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
      if (s.switchClosed && s.heating) {
        s.t += dt
        // 温度模型
        if (s.material === 'ice') {
          if (s.temp < 0) s.temp += 2.0 * dt            // 冰升温
          else if (s.temp < 0.01 && s.t > 2) s.temp = 0  // 熔化平台0°C
          else if (s.temp >= 0 && s.temp < 0.5) s.temp += 0.15 * dt // 熔化期极慢
          else s.temp += 1.5 * dt                        // 水升温
          if (s.temp > 100) s.temp = 100
        } else {
          // 石蜡：持续升温，无平台
          s.temp += 1.2 * dt
          if (s.temp > 80) s.temp = 80
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

  function meltInfo(s) {
    const isCrystal = s.material === 'ice'
    const meltPoint = isCrystal ? 0 : null
    const phase = isCrystal
      ? (s.temp < 0 ? '固态' : s.temp < 0.5 && s.t > 2 ? '熔化中' : s.temp < 100 ? '液态' : '气态')
      : (s.temp < 40 ? '固态' : s.temp < 70 ? '软化' : '液态')
    return { isCrystal, meltPoint, phase }
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
    const info = meltInfo(s)

    const labels = ['① 晶体熔化', '② 非晶体熔化', '③ 对比分析']
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
        S.current.step = i + 1; S.current.t = 0; S.current.temp = -10; S.current.data = []; S.current.records = []
        S.current.material = i === 0 ? 'ice' : i === 1 ? 'wax' : s.material
        setStep(i + 1); forceUpdate(n => n + 1)
      } })
    }
    ctx.textBaseline = 'alphabetic'

    const subs = {
      1: '水浴加热冰（晶体），熔化过程温度不变（熔点 0°C），吸热不升温',
      2: '水浴加热石蜡（非晶体），温度持续上升，无固定熔点',
      3: '对比晶体与非晶体的温度-时间曲线差异',
    }
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(subs[s.step], W / 2, 52)
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('🎯 实验目的：区分晶体和非晶体的熔化特点，理解熔点和熔化过程', W / 2, 70)

    // 加热装置+试管
    drawMeltingApparatus(ctx, W * 0.12, H * 0.45, s, info)
    // 温度-时间曲线
    const gx = W * 0.32, gy = 80, gw = W * 0.64, gh = H * 0.42
    drawCurve(ctx, gx, gy, gw, gh, s, info)

    // 底部
    const barY = H - 26
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    // 加热开关
    ctx.fillStyle = s.heating ? '#E53935' : '#9E9E9E'
    ctx.beginPath(); ctx.roundRect(55, barY - 13, 70, 26, 5); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.fillText(s.heating ? '🔥 加热' : '⏸ 暂停', 72, barY)
    canvasRef.current._clickAreas.push({ x: 55, y: barY - 13, w: 70, h: 26, onClick: () => { S.current.heating = !S.current.heating; forceUpdate(n => n + 1) } })
    // 材料切换
    ctx.fillStyle = s.material === 'ice' ? '#1565C0' : '#FF6F00'
    ctx.beginPath(); ctx.roundRect(135, barY - 13, 90, 26, 5); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.fillText(s.material === 'ice' ? '🧊 冰(晶体)' : '🕯 石蜡(非晶)', 155, barY)
    canvasRef.current._clickAreas.push({ x: 135, y: barY - 13, w: 90, h: 26, onClick: () => {
      S.current.material = S.current.material === 'ice' ? 'wax' : 'ice'
      S.current.t = 0; S.current.temp = -10; S.current.data = []
      forceUpdate(n => n + 1)
    } })
    // 温度显示
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`T = ${s.temp.toFixed(1)}°C`, 245, barY)
    ctx.fillStyle = '#4CAF50'
    ctx.fillText(`状态: ${info.phase}`, 330, barY)
    ctx.fillStyle = '#333'
    ctx.fillText(`t = ${s.t.toFixed(1)}s`, 420, barY)
    ctx.textBaseline = 'alphabetic'

    drawRightPanel(ctx, W * 0.56, H * 0.55, W - W * 0.56 - 25, H - H * 0.55 - 35, s, info)
  }

  // 加热装置
  function drawMeltingApparatus(ctx, cx, cy, s, info) {
    // 烧杯（水浴）
    const bw = 120, bh = 110
    ctx.fillStyle = 'rgba(200,230,255,0.4)'; ctx.strokeStyle = '#999'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, [4, 4, 12, 12]); ctx.fill(); ctx.stroke()
    // 水（水浴）
    ctx.fillStyle = 'rgba(66,165,245,0.25)'
    ctx.fillRect(cx - bw / 2 + 3, cy - bh / 2 + 10, bw - 6, bh - 15)
    // 酒精灯（加热）
    if (s.heating && s.switchClosed) {
      ctx.fillStyle = '#FF9800'; ctx.beginPath()
      ctx.moveTo(cx - 15, cy + bh / 2 + 5); ctx.lineTo(cx, cy + bh / 2 - 15); ctx.lineTo(cx + 15, cy + bh / 2 + 5); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#FFEB3B'; ctx.beginPath()
      ctx.moveTo(cx - 8, cy + bh / 2 + 5); ctx.lineTo(cx, cy + bh / 2 - 8); ctx.lineTo(cx + 8, cy + bh / 2 + 5); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#E53935'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('🔥', cx, cy + bh / 2 + 18)
    }

    // 试管
    const tx = cx, ty = cy - 15
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.strokeStyle = '#888'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.roundRect(tx - 18, ty - 45, 36, 70, [3, 3, 8, 8]); ctx.fill(); ctx.stroke()
    // 物质
    const fillH = 45 * Math.max(0, Math.min(1, (s.temp + 10) / 50))
    if (info.isCrystal) {
      // 冰/水
      if (s.temp < 0) {
        ctx.fillStyle = 'rgba(180,220,255,0.8)'
        ctx.fillRect(tx - 15, ty - 42, 30, fillH)
        // 冰晶
        ctx.fillStyle = '#fff'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center'
        ctx.fillText('❄', tx, ty - 30)
      } else {
        ctx.fillStyle = 'rgba(66,165,245,0.5)'
        ctx.fillRect(tx - 15, ty - 42, 30, fillH)
      }
    } else {
      // 石蜡
      ctx.fillStyle = s.temp < 40 ? '#FFF9C4' : s.temp < 70 ? '#FFE082' : '#FFB74D'
      ctx.fillRect(tx - 15, ty - 42, 30, fillH)
    }

    // 温度计
    const thx = tx + 28
    ctx.strokeStyle = '#555'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(thx, ty - 40); ctx.lineTo(thx, ty + 20); ctx.stroke()
    ctx.beginPath(); ctx.arc(thx, ty + 22, 5, 0, Math.PI * 2); ctx.stroke()
    // 水银柱
    const maxH = 55
    const riseH = Math.max(0, Math.min(1, (s.temp + 10) / 60)) * maxH
    ctx.fillStyle = '#E53935'
    ctx.fillRect(thx - 2, ty + 20 - riseH, 4, riseH)
    ctx.beginPath(); ctx.arc(thx, ty + 22, 3.5, 0, Math.PI * 2); ctx.fill()

    // 标注
    ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(s.temp.toFixed(1) + '°C', thx, ty - 55)
    ctx.fillStyle = '#5D4037'; ctx.font = '9px sans-serif'
    ctx.fillText('水浴加热（均匀受热）', cx, cy + bh / 2 + 32)
    if (info.isCrystal && info.meltPoint !== null && s.temp >= -0.5 && s.temp <= 0.5 && s.t > 2) {
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('熔化中！温度保持0°C不变', cx, cy + bh / 2 + 48)
    }
    ctx.textBaseline = 'alphabetic'
  }

  // 温度-时间曲线
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

    // 范围
    const maxT = 60, minT = -15, maxV = 110
    const toX = t => ox + Math.min(t / maxT, 1) * pw
    const toY = v => oy + ph - ((v - minT) / (maxV - minT)) * ph

    // 网格
    ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 0.8
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#999'
    for (let v = -10; v <= 100; v += 20) {
      const y = toY(v)
      ctx.textAlign = 'right'; ctx.fillText(v + '°C', ox - 5, y + 3)
      ctx.beginPath(); ctx.moveTo(ox, y); ctx.lineTo(ox + pw, y); ctx.stroke()
    }
    for (let t = 0; t <= 60; t += 10) {
      ctx.textAlign = 'center'; ctx.fillText(t + 's', toX(t), oy + ph + 14)
      ctx.beginPath(); ctx.moveTo(toX(t), oy); ctx.lineTo(toX(t), oy + ph); ctx.stroke()
    }

    // 0°C 线（熔点参考）
    if (info.isCrystal) {
      ctx.strokeStyle = 'rgba(33,150,243,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([5, 3])
      ctx.beginPath(); ctx.moveTo(ox, toY(0)); ctx.lineTo(ox + pw, toY(0)); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#1565C0'; ctx.font = '9px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText('熔点 0°C', ox + 4, toY(0) - 4)
    }

    // 曲线
    if (s.data.length > 1) {
      const color = info.isCrystal ? '#1565C0' : '#FF6F00'
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath()
      s.data.forEach((d, i) => {
        const x = toX(d.t), y = toY(d.temp)
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      })
      ctx.stroke()

      // 熔化平台高亮
      if (info.isCrystal && s.data.length > 5) {
        let inPlateau = false, px0 = 0
        s.data.forEach((d) => {
          if (d.temp >= -0.5 && d.temp <= 0.5 && d.t > 2) {
            if (!inPlateau) { inPlateau = true; px0 = toX(d.t) }
          } else if (inPlateau) {
            inPlateau = false
            ctx.fillStyle = 'rgba(255,152,0,0.15)'
            ctx.fillRect(px0, toY(2), toX(d.t) - px0, toY(-2) - toY(2))
            ctx.fillStyle = '#FF9800'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'
            ctx.fillText('熔化（吸热不升温）', (px0 + toX(d.t)) / 2, toY(2) - 6)
          }
        })
      }
    }

    // 当前温度点
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
    ctx.fillText('🎯 固体熔化特点', x + 12, y + 12)
    ctx.fillStyle = info.isCrystal ? '#1565C0' : '#FF6F00'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(info.isCrystal ? '晶体（冰）— 有固定熔点' : '非晶体（石蜡）— 无固定熔点', x + 12, y + 32)
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444'
    ctx.fillText(`T = ${s.temp.toFixed(1)}°C    状态: ${info.phase}`, x + 12, y + 50)
    if (info.isCrystal) ctx.fillText(`熔点 = 0°C`, x + 12, y + 64)

    let ky = y + (info.isCrystal ? 82 : 66)
    const guideSteps = s.step === 1
      ? ['① 点"加热"开始水浴加热', '② 冰升温到 0°C 开始熔化', '③ 熔化过程温度不变', '④ 熔完后水温继续上升']
      : s.step === 2
        ? ['① 点"加热"开始加热石蜡', '② 温度持续上升', '③ 先变软再熔化', '④ 无固定熔点']
        : ['① 分别加热冰和石蜡', '② 对比温度-时间曲线', '③ 晶体有平台，非晶体无', '④ 结论：晶体有熔点']
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('📋 操作步骤', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#5D4037'
    for (let i = 0; i < guideSteps.length; i++) ctx.fillText(guideSteps[i], x + 12, ky + i * 12)
    ky += guideSteps.length * 12 + 6

    ctx.fillStyle = '#C62828'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('⚠ 注意事项', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#B71C1C'
    const notes = s.step === 1
      ? ['• 水浴加热使物质均匀受热', '• 温度计玻璃泡不碰试管壁', '• 晶体熔化过程吸热但温度不变']
      : s.step === 2
        ? ['• 非晶体没有固定熔点', '• 熔化过程中温度持续上升', '• 石蜡先变软再变液体']
        : ['• 判断依据：有无熔点', '• 晶体有固定熔点（如冰0°C）', '• 非晶体无固定熔点']
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
      S.current.t = 0; S.current.temp = -10; S.current.data = []; S.current.records = []; S.current.switchClosed = false
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
    if (s._guideOpen) { ctx.textAlign = 'left'; ctx.font = '10px sans-serif'; ['① 拖入器材到画布', '② 搭建熔化实验装置', '③ 观察熔化曲线', '④ 右键删除器材'].forEach((l, i) => ctx.fillText(l, bx + 10, by + 40 + i * 15)) }
    ctx.textBaseline = 'alphabetic'
    drawPalette(ctx, palX, 10, palW, H - 20)
  }

  function drawPalette(ctx, x, y, w, h) {
    ctx.fillStyle = '#fafafa'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('热学器材', x + w / 2, y + 10)
    const items = [
      { type: 'beaker', name: '烧杯（水浴）' }, { type: 'testTube', name: '试管' },
      { type: 'thermometer', name: '温度计' }, { type: 'burner', name: '酒精灯' },
      { type: 'ice', name: '冰（晶体）' }, { type: 'wax', name: '石蜡（非晶体）' },
      { type: 'stir', name: '搅拌器（干扰）' }, { type: 'balance', name: '天平（干扰）' },
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
    else if (type === 'testTube') { ctx.strokeStyle = '#888'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(-5, -8, 10, 16, [1,1,4,4]); ctx.stroke(); ctx.fillStyle = 'rgba(180,220,255,0.5)'; ctx.fillRect(-4, -3, 8, 10) }
    else if (type === 'thermometer') { ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 5); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 7, 3, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#E53935'; ctx.fillRect(-1.5, -4, 3, 10) }
    else if (type === 'burner') { ctx.fillStyle = '#FF9800'; ctx.beginPath(); ctx.moveTo(-6, 8); ctx.lineTo(0, -6); ctx.lineTo(6, 8); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#FFEB3B'; ctx.beginPath(); ctx.moveTo(-3, 8); ctx.lineTo(0, -2); ctx.lineTo(3, 8); ctx.closePath(); ctx.fill() }
    else if (type === 'ice') { ctx.fillStyle = '#B3E5FC'; ctx.strokeStyle = '#81D4FA'; ctx.fillRect(-6, -5, 12, 10); ctx.strokeRect(-6, -5, 12, 10); ctx.fillStyle = '#fff'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('❄', 0, 3) }
    else if (type === 'wax') { ctx.fillStyle = '#FFF9C4'; ctx.strokeStyle = '#F9A825'; ctx.fillRect(-6, -5, 12, 10); ctx.strokeRect(-6, -5, 12, 10) }
    else if (type === 'stir') { ctx.strokeStyle = '#999'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.stroke() }
    else if (type === 'balance') { ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-8, 5); ctx.lineTo(8, 5); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 5); ctx.stroke() }
    ctx.restore()
  }

  function drawComp(ctx, comp) {
    ctx.save(); ctx.translate(comp.x, comp.y)
    const labels = { beaker: '烧杯', testTube: '试管', thermometer: '温度计', burner: '酒精灯', ice: '冰', wax: '石蜡', stir: '搅拌器', balance: '天平' }
    const colors = { beaker: '#BBDEFB', testTube: '#E3F2FD', thermometer: '#FFCDD2', burner: '#FFE0B2', ice: '#B3E5FC', wax: '#FFF9C4', stir: '#E0E0E0', balance: '#D7CCC8' }
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
      title="探究固体熔化特点"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t); forceUpdate(n => n + 1) }}
      tab1Label="📊 实验演示"
      tab2Label="🔧 自己动手"
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} />
    </SceneShell>
  )
}
