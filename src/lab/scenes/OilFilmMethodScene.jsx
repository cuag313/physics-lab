import { useState, useRef, useEffect } from 'react'
import { eventToCanvas } from '../utils/pointerPos'
import SceneShell from '../ui/SceneShell'

/**
 * OilFilmMethodScene — 用油膜法估测分子大小
 *
 * 单分子油膜模型：滴油在水面扩散，油酸形成单分子膜
 * d = V / S（分子直径 = 油酸体积 / 油膜面积）
 *
 * Step1: 滴油扩散 — 油酸滴在水面扩散成单分子膜
 * Step2: 测量面积 — 数格子法估算油膜面积
 * Step3: 计算直径 — d = V/S，估测分子直径约 10⁻¹⁰ m
 */
export default function OilFilmMethodScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,
    switchClosed: false,
    dropCount: 1,       // 滴数
    concentration: 0.05, // 油酸浓度 %
    t: 0,
    spread: 0,          // 扩散进度 0~1
    area: 0,            // 油膜面积（格子数）
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
      if (s.switchClosed && s.spread < 1) {
        s.t += dt
        s.spread = Math.min(1, s.spread + dt * 0.15)
        s.area = Math.round(s.spread * 60 * s.dropCount)
      }
      render(R)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function filmInfo(s) {
    // 每滴油酸体积 V = 1滴 × 浓度 × 1滴体积(约0.05mL=0.05cm³)
    const dropVolume = 0.05 // cm³
    const V = s.dropCount * dropVolume * (s.concentration / 100) // cm³ 油酸纯体积
    const S_area = s.area // 格子数（每格约1cm²）
    const d = S_area > 0 ? V / S_area : 0 // cm
    const d_m = d * 1e-2 // m
    return { V, S_area, d, d_m }
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
    const info = filmInfo(s)

    const labels = ['① 滴油扩散', '② 测量面积', '③ 计算直径']
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
        S.current.step = i + 1; S.current.t = 0; S.current.spread = 0; S.current.area = 0; S.current.records = []
        setStep(i + 1); forceUpdate(n => n + 1)
      } })
    }
    ctx.textBaseline = 'alphabetic'

    const subs = {
      1: '油酸滴在水面，形成单分子油膜（分子紧密排列）',
      2: '用数格子法（>半格算1格）测量油膜面积 S',
      3: 'd = V / S，估测分子直径约 10⁻¹⁰ m',
    }
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(subs[s.step], W / 2, 52)
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('🎯 实验目的：用油膜法估测分子直径，理解单分子油膜模型', W / 2, 70)

    // 油膜可视化（水盘 + 油膜 + 格子）
    drawOilFilm(ctx, W * 0.10, 80, W * 0.44, H - 140, s, info)

    // 底部参数
    const barY = H - 26
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'

    ctx.fillStyle = '#E53935'; ctx.fillText(`滴数=${s.dropCount}`, 55, barY)
    drawMiniSlider(ctx, 110, barY, 50, (s.dropCount - 1) / 9, (r) => { S.current.dropCount = Math.round(1 + r * 9); S.current.spread = 0; S.current.area = 0; forceUpdate(n => n + 1) })

    ctx.fillStyle = '#9C27B0'; ctx.fillText(`浓度=${s.concentration.toFixed(2)}%`, 175, barY)
    drawMiniSlider(ctx, 255, barY, 60, (s.concentration - 0.01) / 0.19, (r) => { S.current.concentration = Math.round((0.01 + r * 0.19) * 100) / 100; S.current.spread = 0; S.current.area = 0; forceUpdate(n => n + 1) })

    ctx.fillStyle = s.switchClosed ? '#4CAF50' : '#9E9E9E'
    ctx.beginPath(); ctx.roundRect(330, barY - 13, 60, 26, 5); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.fillText(s.switchClosed ? '▶ 开始' : '⏸ 暂停', 343, barY)
    canvasRef.current._clickAreas.push({ x: 330, y: barY - 13, w: 60, h: 26, onClick: () => {
      S.current.switchClosed = !S.current.switchClosed
      if (!S.current.switchClosed) { S.current.spread = 0; S.current.area = 0; S.current.t = 0 }
      forceUpdate(n => n + 1)
    } })

    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`S=${s.area}格`, 405, barY)
    ctx.fillStyle = '#FF6F00'
    ctx.fillText(`d=${info.d_m.toExponential(2)}m`, 475, barY)
    ctx.textBaseline = 'alphabetic'

    drawRightPanel(ctx, W * 0.56, 80, W - W * 0.56 - 25, H - 140, s, info)
  }

  // 油膜可视化
  function drawOilFilm(ctx, x, y, w, h, s, info) {
    // 水盘
    ctx.fillStyle = '#E3F2FD'; ctx.strokeStyle = '#90CAF9'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.fill(); ctx.stroke()

    // 坐标纸格子
    const gridSize = 22
    ctx.strokeStyle = 'rgba(144,202,249,0.5)'; ctx.lineWidth = 0.5
    for (let gx = x + gridSize; gx < x + w; gx += gridSize) {
      ctx.beginPath(); ctx.moveTo(gx, y + 5); ctx.lineTo(gx, y + h - 5); ctx.stroke()
    }
    for (let gy = y + gridSize; gy < y + h; gy += gridSize) {
      ctx.beginPath(); ctx.moveTo(x + 5, gy); ctx.lineTo(x + w - 5, gy); ctx.stroke()
    }

    // 油膜（不规则椭圆扩散）
    if (s.spread > 0) {
      const cx = x + w / 2, cy = y + h / 2
      const maxR = Math.min(w, h) / 2 - 15
      const r2 = maxR * Math.pow(s.spread, 0.5)
      ctx.fillStyle = 'rgba(255,152,0,0.3)'
      ctx.beginPath()
      // 不规则形状（模拟实际油膜）
      for (let a = 0; a < Math.PI * 2; a += 0.1) {
        const noise = 1 + 0.15 * Math.sin(a * 5 + 1) + 0.1 * Math.sin(a * 3 + 2)
        const px = cx + Math.cos(a) * r2 * noise
        const py = cy + Math.sin(a) * r2 * noise * 0.7
        if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
      }
      ctx.closePath(); ctx.fill()
      ctx.strokeStyle = 'rgba(255,152,0,0.5)'; ctx.lineWidth = 1.5; ctx.stroke()

      // 油酸分子示意（单分子层）
      if (s.spread > 0.3) {
        ctx.fillStyle = 'rgba(255,152,0,0.5)'
        for (let a = 0; a < Math.PI * 2; a += 0.2) {
          const noise = 1 + 0.15 * Math.sin(a * 5 + 1) + 0.1 * Math.sin(a * 3 + 2)
          const px = cx + Math.cos(a) * r2 * noise
          const py = cy + Math.sin(a) * r2 * noise * 0.7
          ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill()
        }
      }
    }

    // 滴油动作
    if (s.switchClosed && s.spread < 0.1) {
      const time = Date.now() / 1000
      const dropY = y + 20 + (time % 1) * (h / 2 - 30)
      ctx.fillStyle = '#FF9800'
      ctx.beginPath(); ctx.arc(x + w / 2, dropY, 5, 0, Math.PI * 2); ctx.fill()
    }

    // 标注
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('水盘 + 坐标纸（1格≈1cm²）', x + 10, y + 8)
    if (s.area > 0) {
      ctx.fillStyle = '#E65100'
      ctx.fillText(`油膜面积 ≈ ${s.area} 格 = ${info.S_area} cm²`, x + 10, y + h - 22)
    }
    ctx.fillStyle = '#555'; ctx.font = '9px sans-serif'
    ctx.fillText('油膜厚度 = 分子直径 d', x + 10, y + h - 10)
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
    ctx.fillText('🎯 油膜法估测分子大小', x + 12, y + 12)
    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('d = V / S', x + 12, y + 32)
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444'
    ctx.fillText(`V（油酸体积）= ${info.V.toExponential(2)} cm³`, x + 12, y + 50)
    ctx.fillText(`S（油膜面积）= ${info.S_area} cm²`, x + 12, y + 64)
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`d = ${info.d_m.toExponential(2)} m`, x + 12, y + 80)

    let ky = y + 100
    const guideSteps = s.step === 1
      ? ['① 配制油酸酒精溶液', '② 滴一滴到水面', '③ 油酸扩散成单分子膜', '④ 撒痱子粉显示轮廓']
      : s.step === 2
        ? ['① 将油膜轮廓画在坐标纸上', '② 数格子（>半格算1格）', '③ 记录格子数 = 面积 S', '④ 面积 ≈ 格子数 × 1cm²']
        : ['① 计算 V = 浓度×滴数×滴体积', '② d = V/S', '③ 估测分子直径', '④ 约 10⁻¹⁰ m 数量级']
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('📋 操作步骤', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#5D4037'
    for (let i = 0; i < guideSteps.length; i++) ctx.fillText(guideSteps[i], x + 12, ky + i * 12)
    ky += guideSteps.length * 12 + 6

    ctx.fillStyle = '#C62828'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('⚠ 注意事项', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#B71C1C'
    const notes = s.step === 1
      ? ['• 油酸浓度要足够稀（0.05%左右）', '• 油膜形成单分子层', '• 撒痱子粉帮助显示油膜轮廓']
      : s.step === 2
        ? ['• 格子面积要已知（通常1cm²）', '• 超过半格算1格', '• 不足半格忽略不计']
        : ['• d = V/S 是估测值', '• 分子直径约 10⁻¹⁰ m', '• 球形分子模型：d = V/S']
    for (let i = 0; i < notes.length; i++) ctx.fillText(notes[i], x + 12, ky + i * 12)
    ky += notes.length * 12 + 6

    if (s.records.length > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('📊 实验数据', x + 12, ky); ky += 14
      ctx.fillStyle = '#FFB74D'; ctx.fillRect(x + 12, ky, w - 24, 16)
      ctx.fillStyle = '#333'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      const c1 = x + 22, c2 = x + 55, c3 = x + 100, c4 = x + 155
      ctx.fillText('#', c1, ky + 2); ctx.fillText('滴数', c2, ky + 2); ctx.fillText('S格', c3, ky + 2); ctx.fillText('d(m)', c4, ky + 2)
      ky += 14
      for (let i = 0; i < s.records.length; i++) {
        const r = s.records[i]
        if (i % 2 === 0) { ctx.fillStyle = '#FFF8E1'; ctx.fillRect(x + 12, ky, w - 24, 13) }
        ctx.fillStyle = '#333'; ctx.font = '8px monospace'; ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), c1, ky + 1); ctx.fillText(String(r.drops), c2, ky + 1); ctx.fillText(String(r.S), c3, ky + 1); ctx.fillText(r.d, c4, ky + 1)
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
      const s2 = S.current; const inf = filmInfo(s2)
      s2.records.push({ drops: s2.dropCount, S: s2.area, d: inf.d_m.toExponential(1) })
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
      S.current.dropCount = 1; S.current.concentration = 0.05; S.current.t = 0; S.current.spread = 0
      S.current.area = 0; S.current.records = []; S.current.switchClosed = false
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
    if (s._guideOpen) { ctx.textAlign = 'left'; ctx.font = '10px sans-serif'; ['① 拖入器材到画布', '② 搭建油膜实验', '③ 观察油膜扩散', '④ 右键删除器材'].forEach((l, i) => ctx.fillText(l, bx + 10, by + 40 + i * 15)) }
    ctx.textBaseline = 'alphabetic'
    drawPalette(ctx, palX, 10, palW, H - 20)
  }

  function drawPalette(ctx, x, y, w, h) {
    ctx.fillStyle = '#fafafa'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('热学器材', x + w / 2, y + 10)
    const items = [
      { type: 'tray', name: '浅盘（水）' }, { type: 'oilacid', name: '油酸溶液' },
      { type: 'dropper', name: '滴管' }, { type: 'powder', name: '痱子粉' },
      { type: 'grid', name: '坐标纸' }, { type: 'balance', name: '天平（干扰）' },
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
    if (type === 'tray') { ctx.fillStyle = '#E3F2FD'; ctx.strokeStyle = '#90CAF9'; ctx.beginPath(); ctx.roundRect(-9, -4, 18, 10, 3); ctx.fill(); ctx.stroke() }
    else if (type === 'oilacid') { ctx.fillStyle = '#FFF9C4'; ctx.strokeStyle = '#F9A825'; ctx.fillRect(-6, -7, 12, 14); ctx.strokeRect(-6, -7, 12, 14) }
    else if (type === 'dropper') { ctx.strokeStyle = '#888'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 2); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 5, 3, 0, Math.PI * 2); ctx.stroke() }
    else if (type === 'powder') { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ccc'; ctx.fillRect(-7, -5, 14, 10); ctx.strokeRect(-7, -5, 14, 10) }
    else if (type === 'grid') { ctx.strokeStyle = '#90CAF9'; ctx.lineWidth = 0.5; for (let i = -8; i <= 8; i += 4) { ctx.beginPath(); ctx.moveTo(i, -8); ctx.lineTo(i, 8); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-8, i); ctx.lineTo(8, i); ctx.stroke() } }
    else if (type === 'balance') { ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-8, 5); ctx.lineTo(8, 5); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 5); ctx.stroke() }
    ctx.restore()
  }

  function drawComp(ctx, comp) {
    ctx.save(); ctx.translate(comp.x, comp.y)
    const labels = { tray: '浅盘', oilacid: '油酸', dropper: '滴管', powder: '痱子粉', grid: '坐标纸', balance: '天平' }
    const colors = { tray: '#E3F2FD', oilacid: '#FFF9C4', dropper: '#F5F5F5', powder: '#FFF', grid: '#E1F5FE', balance: '#D7CCC8' }
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
      title="用油膜法估测分子大小"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t); forceUpdate(n => n + 1) }}
      tab1Label="📊 实验演示"
      tab2Label="🔧 自己动手"
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} />
    </SceneShell>
  )
}
