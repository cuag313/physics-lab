import { useState, useRef, useEffect } from 'react'
import SceneShell from '../ui/SceneShell'

/**
 * BlackbodyScene — 黑体辐射光谱
 *
 * 普朗克黑体辐射公式（简化显示）
 * 维恩位移定律：λ_max × T = b = 2.898×10⁻³ m·K
 * 斯特藩-玻尔兹曼定律：总辐射功率 ∝ T⁴
 *
 * Step1: 辐射光谱 — 调节温度观察光谱曲线变化
 * Step2: 维恩位移定律 — 温度越高峰值波长越短
 * Step3: 普朗克量子化 — 经典理论vs量子解释，解决紫外灾变
 */
export default function BlackbodyScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,
    switchClosed: false,
    temperature: 5800, // K（太阳表面温度）
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

    const loop = () => { render(R); animRef.current = requestAnimationFrame(loop) }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function bbInfo(s) {
    const b = 2.898e-3 // m·K
    const lambdaMax = (b / s.temperature) * 1e9 // nm
    const totalPower = Math.pow(s.temperature / 5800, 4) // 相对太阳
    return { lambdaMax, totalPower }
  }

  // Planck 黑体辐射相对强度（简化）
  function planckIntensity(lambda, T) {
    const h = 6.626e-34, c = 3e8, kB = 1.381e-23
    const lam = lambda * 1e-9
    const x = h * c / (lam * kB * T)
    if (x > 50) return 0
    return 1 / (Math.pow(lam, 5) * (Math.exp(x) - 1 + 1e-30))
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
    const info = bbInfo(s)

    const labels = ['① 辐射光谱', '② 维恩位移', '③ 普朗克量子化']
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
        S.current.step = i + 1; S.current.records = []
        setStep(i + 1); forceUpdate(n => n + 1)
      } })
    }
    ctx.textBaseline = 'alphabetic'

    const subs = {
      1: '调节黑体温度，观察辐射光谱曲线和颜色变化',
      2: '温度越高峰值波长越短：λ_max × T = 2.898×10⁻³ m·K',
      3: '经典理论预测"紫外灾变"，普朗克 E=hν 量子化解决了问题',
    }
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(subs[s.step], W / 2, 52)
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('🎯 实验目的：理解黑体辐射规律，掌握维恩位移定律，认识量子化概念', W / 2, 70)

    // 光谱曲线图
    const gx = W * 0.08, gy = 80, gw = W * 0.88, gh = H * 0.42
    drawSpectrumCurve(ctx, gx, gy, gw, gh, s, info)

    // 黑体颜色预览
    drawBlackbodyColor(ctx, W * 0.12, H * 0.55, s, info)

    // 底部参数
    const barY = H - 26
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillStyle = '#E53935'; ctx.fillText(`T=${s.temperature}K`, 55, barY)
    drawMiniSlider(ctx, 120, barY, 100, (s.temperature - 500) / 7500, (r) => {
      S.current.temperature = Math.round(500 + r * 7500); forceUpdate(n => n + 1)
    })

    ctx.fillStyle = '#FF9800'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`λ_max=${info.lambdaMax.toFixed(0)}nm`, 235, barY)
    ctx.fillStyle = '#9C27B0'
    ctx.fillText(`相对功率=${info.totalPower.toFixed(2)}`, 345, barY)
    ctx.textBaseline = 'alphabetic'

    drawRightPanel(ctx, W * 0.56, H * 0.55, W - W * 0.56 - 25, H - H * 0.55 - 35, s, info)
  }

  // 光谱曲线
  function drawSpectrumCurve(ctx, gx, gy, gw, gh, s, info) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ddd'
    ctx.beginPath(); ctx.roundRect(gx - 5, gy - 5, gw + 10, gh + 10, 8); ctx.fill(); ctx.stroke()

    const margin = { top: 30, right: 20, bottom: 40, left: 50 }
    const pw = gw - margin.left - margin.right
    const ph = gh - margin.top - margin.bottom
    const ox = gx + margin.left, oy = gy + margin.top

    // 可见光谱背景带
    const visStart = 380, visEnd = 780
    for (let nm = visStart; nm < visEnd; nm++) {
      const x = ox + ((nm - 100) / 2400) * pw
      const w = pw / 2400 + 1
      const t = (nm - visStart) / (visEnd - visStart)
      const r2 = t < 0.2 ? 60 + t * 800 : t < 0.5 ? (t - 0.2) * 33 : 0
      const g2 = t < 0.2 ? 0 : t < 0.5 ? (t - 0.2) * 830 : t < 0.7 ? 255 : (0.9 - t) * 640
      const b2 = t < 0.3 ? 255 - t * 500 : t < 0.7 ? 0 : 0
      ctx.fillStyle = `rgba(${Math.round(r2)},${Math.round(g2)},${Math.round(b2)},0.12)`
      ctx.fillRect(x, oy, w, ph)
    }

    // 坐标轴
    ctx.strokeStyle = '#999'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, oy + ph); ctx.lineTo(ox + pw, oy + ph); ctx.stroke()

    // 轴标签
    ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('波长 λ (nm)', ox + pw / 2, gy + gh - 8)
    ctx.save(); ctx.translate(gx + 10, oy + ph / 2); ctx.rotate(-Math.PI / 2)
    ctx.fillText('辐射强度', 0, 0); ctx.restore()

    // 波长刻度
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#999'
    for (let nm = 100; nm <= 2500; nm += 200) {
      const x = ox + ((nm - 100) / 2400) * pw
      ctx.textAlign = 'center'
      ctx.fillText(nm + '', x, oy + ph + 14)
      ctx.beginPath(); ctx.moveTo(x, oy + ph); ctx.lineTo(x, oy + ph + 4); ctx.stroke()
    }

    // 多条温度曲线
    const temperatures = [s.temperature]
    if (s.step >= 2) temperatures.push(3000, 5000, 8000)
    for (const T of temperatures) {
      const isMain = T === s.temperature
      // 归一化峰值
      let maxVal = 0
      for (let nm = 100; nm <= 2500; nm += 5) {
        const v = planckIntensity(nm, T)
        if (v > maxVal) maxVal = v
      }

      ctx.strokeStyle = isMain ? '#E53935' : 'rgba(33,150,243,0.3)'
      ctx.lineWidth = isMain ? 2.5 : 1.5
      if (!isMain) ctx.setLineDash([4, 3])
      ctx.beginPath()
      for (let nm = 100; nm <= 2500; nm += 5) {
        const x = ox + ((nm - 100) / 2400) * pw
        const v = planckIntensity(nm, T)
        const y = oy + ph - (v / maxVal) * ph * 0.85
        if (nm === 100) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.setLineDash([])

      // 温度标注
      if (!isMain) {
        const bx2 = ox + ((info.lambdaMax - 100) / 2400) * pw
        ctx.fillStyle = 'rgba(33,150,243,0.5)'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'
        ctx.fillText(T + 'K', bx2, oy + ph + 28)
      }
    }

    // 峰值波长标记
    const peakX = ox + ((info.lambdaMax - 100) / 2400) * pw
    ctx.strokeStyle = '#E53935'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3])
    ctx.beginPath(); ctx.moveTo(peakX, oy); ctx.lineTo(peakX, oy + ph); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText(`λ_max=${info.lambdaMax.toFixed(0)}nm`, peakX, oy - 4)
    ctx.textBaseline = 'alphabetic'

    // 三维恩位移定律标注
    if (s.step >= 2) {
      ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'right'
      ctx.fillText('λ_max × T = 2.898×10⁻³ m·K', ox + pw - 8, oy + 16)
    }

    // 普朗克公式标注
    if (s.step >= 3) {
      ctx.fillStyle = '#7B1FA2'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'right'
      ctx.fillText('普朗克：E = hν（量子化）', ox + pw - 8, oy + 34)
    }
    ctx.textAlign = 'left'
  }

  // 黑体颜色预览
  function drawBlackbodyColor(ctx, cx, cy, s, _info) {
    const r2 = 28
    // 根据温度计算近似颜色
    const T = s.temperature
    let color
    if (T < 2000) color = '#8B0000'
    else if (T < 3000) color = '#FF4500'
    else if (T < 4500) color = '#FF8C00'
    else if (T < 5500) color = '#FFD700'
    else if (T < 6500) color = '#FFFFF0'
    else if (T < 8000) color = '#E0E0FF'
    else color = '#B0C4DE'

    // 光晕
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r2 * 2)
    glow.addColorStop(0, color)
    glow.addColorStop(1, 'transparent')
    ctx.fillStyle = glow
    ctx.beginPath(); ctx.arc(cx, cy, r2 * 2, 0, Math.PI * 2); ctx.fill()

    // 黑体球
    ctx.fillStyle = color; ctx.strokeStyle = '#555'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(cx, cy, r2, 0, Math.PI * 2); ctx.fill(); ctx.stroke()

    // 标注
    ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(`${T}K`, cx, cy + r2 + 8)
    ctx.fillStyle = '#666'; ctx.font = '9px sans-serif'
    ctx.fillText('黑体颜色', cx, cy + r2 + 22)
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
    ctx.fillText('🎯 黑体辐射', x + 12, y + 12)
    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('维恩位移定律', x + 12, y + 32)
    ctx.fillText('λ_max × T = b', x + 12, y + 48)
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444'
    ctx.fillText(`T = ${s.temperature} K`, x + 12, y + 66)
    ctx.fillText(`λ_max = ${info.lambdaMax.toFixed(0)} nm`, x + 12, y + 80)
    ctx.fillText(`b = 2.898×10⁻³ m·K`, x + 12, y + 94)

    if (s.step >= 3) {
      ctx.fillStyle = '#7B1FA2'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('斯特藩-玻尔兹曼定律', x + 12, y + 114)
      ctx.fillStyle = '#444'; ctx.font = '10px sans-serif'
      ctx.fillText('总辐射功率 ∝ T⁴', x + 12, y + 130)
    }

    let ky = y + (s.step >= 3 ? 150 : 114)
    const guideSteps = s.step === 1
      ? ['① 调节温度滑条', '② 观察光谱曲线形状', '③ 温度越高曲线峰值越突出', '④ 记录数据']
      : s.step === 2
        ? ['① 观察峰值波长λ_max', '② 温度↑→λ_max↓（蓝移）', '③ 验证 λ_max×T=常数', '④ 记录多组数据验证']
        : ['① 经典理论在高频端发散', '② "紫外灾变"问题', '③ 普朗克 E=hν 量子化', '④ 量子化解决了矛盾']
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('📋 操作步骤', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#5D4037'
    for (let i = 0; i < guideSteps.length; i++) ctx.fillText(guideSteps[i], x + 12, ky + i * 12)
    ky += guideSteps.length * 12 + 6

    ctx.fillStyle = '#C62828'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('⚠ 注意事项', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#B71C1C'
    const notes = s.step === 1
      ? ['• 黑体：能吸收所有辐射的物体', '• 辐射光谱只与温度有关', '• 温度越高，总辐射能量越大']
      : s.step === 2
        ? ['• λ_max 与 T 成反比', '• 太阳表面约 5800K', '• 红外测温原理就是维恩位移']
        : ['• 普朗克提出 E=hν（能量量子化）', '• h = 6.626×10⁻³⁴ J·s', '• 这是量子物理的开端']
    for (let i = 0; i < notes.length; i++) ctx.fillText(notes[i], x + 12, ky + i * 12)
    ky += notes.length * 12 + 6

    if (s.records.length > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('📊 实验数据', x + 12, ky); ky += 14
      ctx.fillStyle = '#FFB74D'; ctx.fillRect(x + 12, ky, w - 24, 16)
      ctx.fillStyle = '#333'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      const c1 = x + 22, c2 = x + 65, c3 = x + 125
      ctx.fillText('#', c1, ky + 2); ctx.fillText('T(K)', c2, ky + 2); ctx.fillText('λ(nm)', c3, ky + 2)
      ky += 14
      for (let i = 0; i < s.records.length; i++) {
        const r = s.records[i]
        if (i % 2 === 0) { ctx.fillStyle = '#FFF8E1'; ctx.fillRect(x + 12, ky, w - 24, 13) }
        ctx.fillStyle = '#333'; ctx.font = '9px monospace'; ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), c1, ky + 1); ctx.fillText(String(r.T), c2, ky + 1); ctx.fillText(r.lam, c3, ky + 1)
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
      const s2 = S.current; const inf = bbInfo(s2)
      s2.records.push({ T: s2.temperature, lam: inf.lambdaMax.toFixed(0) })
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
      S.current.temperature = 5800; S.current.records = []; forceUpdate(n => n + 1)
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
    if (s._guideOpen) { ctx.textAlign = 'left'; ctx.font = '10px sans-serif'; ['① 拖入器材到画布', '② 搭建黑体辐射实验', '③ 观察光谱变化', '④ 右键删除器材'].forEach((l, i) => ctx.fillText(l, bx + 10, by + 40 + i * 15)) }
    ctx.textBaseline = 'alphabetic'
    drawPalette(ctx, palX, 10, palW, H - 20)
  }

  function drawPalette(ctx, x, y, w, h) {
    ctx.fillStyle = '#fafafa'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('近代物理器材', x + w / 2, y + 10)
    const items = [
      { type: 'blackbody', name: '黑体辐射源' }, { type: 'prism', name: '三棱镜' },
      { type: 'screen', name: '光谱屏' }, { type: 'thermometer', name: '温度计' },
      { type: 'battery', name: '电源（干扰）' }, { type: 'magnet', name: '磁铁（干扰）' },
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
    if (type === 'blackbody') { ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill() }
    else if (type === 'prism') { ctx.fillStyle = '#E1F5FE'; ctx.strokeStyle = '#1565C0'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(-8, 8); ctx.lineTo(8, 8); ctx.closePath(); ctx.fill(); ctx.stroke() }
    else if (type === 'screen') { ctx.fillStyle = '#263238'; ctx.fillRect(-10, -6, 20, 12) }
    else if (type === 'thermometer') { ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 5); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 7, 3, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#E53935'; ctx.fillRect(-1.5, -4, 3, 10) }
    else if (type === 'battery') { ctx.fillStyle = '#4CAF50'; ctx.fillRect(-10, -7, 20, 14); ctx.strokeStyle = '#2E7D32'; ctx.strokeRect(-10, -7, 20, 14) }
    else if (type === 'magnet') { ctx.fillStyle = '#E53935'; ctx.fillRect(-10, -6, 10, 12); ctx.fillStyle = '#1565C0'; ctx.fillRect(0, -6, 10, 12) }
    ctx.restore()
  }

  function drawComp(ctx, comp) {
    ctx.save(); ctx.translate(comp.x, comp.y)
    const labels = { blackbody: '黑体', prism: '三棱镜', screen: '光谱屏', thermometer: '温度计', battery: '电源', magnet: '磁铁' }
    const colors = { blackbody: '#424242', prism: '#E1F5FE', screen: '#263238', thermometer: '#FFCDD2', battery: '#4CAF50', magnet: '#FFCDD2' }
    ctx.fillStyle = colors[comp.type] || '#eee'
    ctx.strokeStyle = '#888'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.roundRect(-16, -12, 32, 24, 4); ctx.fill(); ctx.stroke()
    ctx.fillStyle = (comp.type === 'blackbody' || comp.type === 'screen') ? '#fff' : '#333'
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
    <SceneShell
      title="黑体辐射光谱"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t); forceUpdate(n => n + 1) }}
      tab1Label="📊 实验演示"
      tab2Label="🔧 自己动手"
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} />
    </SceneShell>
  )
}
