import { useState, useRef, useEffect } from 'react'
import { eventToCanvas } from '../utils/pointerPos'
import SceneShell from '../ui/SceneShell'

/**
 * OstersExperimentScene — 电生磁（奥斯特实验）
 *
 * 通电导线周围产生环形磁场，安培定则（右手螺旋定则）
 *
 * Step1: 磁场存在 — 通电后小磁针偏转，观察环形磁感线
 * Step2: 电流与磁场 — 改变电流大小，观察磁感线密度变化
 * Step3: 方向规律 — 反转电流方向，验证安培定则
 */
export default function OstersExperimentScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,
    switchClosed: false,
    current: 3,        // 电流 A
    direction: 1,      // 1=向外⊙, -1=向里⊗
    records: [],
    // Tab2
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

    const loop = () => {
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

  // ================================================================
  //  Tab 1：实验演示
  // ================================================================
  function renderDemo(ctx, W, H) {
    const s = S.current
    const on = s.switchClosed

    // 顶部步骤标签
    const labels = ['① 磁场存在', '② 电流与磁场', '③ 安培定则']
    const bw = 105, bh = 28, gap = 8
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
      canvasRef.current._clickAreas.push({
        x: x - 3, y: y - 3, w: bw + 6, h: bh + 6,
        onClick: () => {
          S.current.step = i + 1
          S.current.records = []
          setStep(i + 1)
          forceUpdate(n => n + 1)
        }
      })
    }
    ctx.textBaseline = 'alphabetic'

    const subs = {
      1: '闭合开关，导线通电，小磁针偏转 → 电流周围存在磁场',
      2: '调节电流大小，观察磁感线密度变化 → I 越大磁场越强',
      3: '反转电流方向，观察磁感线和小磁针方向 → 右手螺旋定则',
    }
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(subs[s.step], W / 2, 52)
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('🎯 实验目的：探究通电导线周围磁场的存在、强弱规律及安培定则', W / 2, 70)

    // ─── 电路（矩形回路）：顶边=通电直导线（载流导体，产生磁场），下边=电源+开关 ───
    const circL = 60, circR = W * 0.52
    const span = circR - circL
    const circTop = H * 0.70, circBottom = H - 52
    const wc = on ? '#1565C0' : '#999'
    const battX = circL + span * 0.28
    const swX = circL + span * 0.72

    // 导线（侧边+下边）
    ctx.strokeStyle = wc; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(circR, circTop); ctx.lineTo(circR, circBottom); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(circR, circBottom); ctx.lineTo(swX + 18, circBottom); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(swX - 18, circBottom); ctx.lineTo(battX + 30, circBottom); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(battX - 30, circBottom); ctx.lineTo(circL, circBottom); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(circL, circBottom); ctx.lineTo(circL, circTop); ctx.stroke()
    ctx.lineCap = 'butt'
    // 顶边：通电直导线（加粗=载流导体，电流流过才产生磁场）
    ctx.strokeStyle = wc; ctx.lineWidth = 5; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(circL, circTop); ctx.lineTo(circR, circTop); ctx.stroke()
    ctx.lineCap = 'butt'
    // 导线标注（下方，避免与截面图重叠）
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('通电直导线（载流导体）', (circL + circR) / 2, circTop + 8)

    // ─── 磁场主视觉（导线截面 + 环形磁感线 + 小磁针）───
    const cx = W * 0.30, cy = H * 0.34
    const maxR = Math.min(W * 0.14, H * 0.15)
    drawWireField(ctx, cx, cy, maxR, s.current, s.direction, on)

    // 连接：截面图是该导线的放大视图（导线已接入电路，电流流过产生磁场）
    const wireMidX = (circL + circR) / 2
    ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4])
    ctx.beginPath(); ctx.moveTo(cx + maxR * 0.4, cy + maxR + 42); ctx.lineTo(wireMidX, circTop - 16); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#8D6E63'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('放大', (cx + maxR * 0.4 + wireMidX) / 2, (cy + maxR + 42 + circTop - 16) / 2)

    // 电流流动
    if (on) {
      const path = [
        { x: battX + 30, y: circBottom }, { x: swX, y: circBottom },
        { x: circR, y: circBottom }, { x: circR, y: circTop },
        { x: circL, y: circTop }, { x: circL, y: circBottom },
        { x: battX - 30, y: circBottom },
      ]
      drawCurrentFlow(ctx, path)
    }

    drawBatteryGroup(ctx, battX, circBottom)
    drawSwitch(ctx, swX, circBottom, on, () => {
      S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1)
    })

    // ─── 参数调节（底部）───
    const barY = H - 26
    ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillStyle = '#1976D2'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`电流 I = ${s.current.toFixed(1)} A`, 70, barY)
    drawMiniSlider(ctx, 185, barY, 100, (s.current - 0.5) / 7.5, (r) => {
      S.current.current = Math.round((0.5 + r * 7.5) * 10) / 10
      forceUpdate(n => n + 1)
    })
    // 方向按钮
    ctx.fillStyle = s.direction > 0 ? '#E53935' : '#1565C0'
    ctx.font = 'bold 11px sans-serif'
    ctx.fillText(s.direction > 0 ? '⊙ 电流向外' : '⊗ 电流向里', 310, barY)
    ctx.fillStyle = '#7B1FA2'; ctx.strokeStyle = '#4A148C'
    ctx.beginPath(); ctx.roundRect(430, barY - 13, 72, 26, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('↻ 反转', 466, barY)
    canvasRef.current._clickAreas.push({
      x: 430, y: barY - 13, w: 72, h: 26,
      onClick: () => { S.current.direction *= -1; forceUpdate(n => n + 1) }
    })
    ctx.textBaseline = 'alphabetic'

    // 右侧面板
    drawRightPanel(ctx, W * 0.56, 70, W - W * 0.56 - 25, H - 100, s)
  }

  // ─── 导线截面 + 环形磁感线 + 小磁针 ───
  function drawWireField(ctx, cx, cy, maxR, current, direction, on) {
    // 磁感线（同心圆）
    if (on && current > 0) {
      const numCircles = Math.floor(3 + current * 1.2)
      for (let i = 1; i <= numCircles; i++) {
        const r = 30 + i * (maxR - 30) / numCircles
        ctx.strokeStyle = `rgba(33,150,243,${0.25 + 0.4 * (1 - i / numCircles)})`
        ctx.lineWidth = 1.2 + current * 0.18
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()

        // 切向箭头
        for (let a = 0; a < 3; a++) {
          const angle = (a / 3) * Math.PI * 2
          const ax = cx + Math.cos(angle) * r
          const ay = cy + Math.sin(angle) * r
          const tangent = direction > 0 ? angle + Math.PI / 2 : angle - Math.PI / 2
          ctx.fillStyle = 'rgba(21,101,192,0.8)'
          ctx.beginPath()
          ctx.moveTo(ax + Math.cos(tangent) * 6, ay + Math.sin(tangent) * 6)
          ctx.lineTo(ax + Math.cos(tangent + 2.5) * 4, ay + Math.sin(tangent + 2.5) * 4)
          ctx.lineTo(ax + Math.cos(tangent - 2.5) * 4, ay + Math.sin(tangent - 2.5) * 4)
          ctx.closePath(); ctx.fill()
        }
      }
    }

    // 小磁针（8个方位）
    const needleR = maxR * 0.55
    for (let a = 0; a < 8; a++) {
      const angle = a * Math.PI / 4
      const nx = cx + Math.cos(angle) * needleR
      const ny = cy + Math.sin(angle) * needleR
      const needleAngle = on
        ? (direction > 0 ? angle + Math.PI / 2 : angle - Math.PI / 2)
        : angle + Math.PI / 4  // 无磁场时随机指向
      // N极（红）
      ctx.strokeStyle = '#E53935'; ctx.lineWidth = 3; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(nx, ny)
      ctx.lineTo(nx + Math.cos(needleAngle) * 13, ny + Math.sin(needleAngle) * 13)
      ctx.stroke()
      // S极（蓝）
      ctx.strokeStyle = '#1565C0'
      ctx.beginPath(); ctx.moveTo(nx, ny)
      ctx.lineTo(nx - Math.cos(needleAngle) * 13, ny - Math.sin(needleAngle) * 13)
      ctx.stroke()
      ctx.lineCap = 'butt'
      // 轴点
      ctx.fillStyle = '#333'
      ctx.beginPath(); ctx.arc(nx, ny, 2.5, 0, Math.PI * 2); ctx.fill()
    }

    // 导线截面（中心圆）
    ctx.fillStyle = '#8D6E63'; ctx.strokeStyle = '#5D4037'; ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    // 电流方向符号
    if (on) {
      ctx.fillStyle = direction > 0 ? '#fff' : '#fff'
      ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(direction > 0 ? '⊙' : '⊗', cx, cy)
    } else {
      ctx.fillStyle = '#bbb'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('—', cx, cy)
    }

    // 标注
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('通电导线（截面）', cx, cy + maxR + 12)
    if (on) {
      ctx.fillStyle = '#1565C0'; ctx.font = '10px sans-serif'
      ctx.fillText('蓝红小磁针：红端=N极', cx, cy + maxR + 28)
    }
    ctx.textBaseline = 'alphabetic'
  }

  function drawMiniSlider(ctx, x, y, w, ratio, onChange) {
    ctx.strokeStyle = '#bbb'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke()
    const kx = x + Math.max(0, Math.min(1, ratio)) * w
    ctx.fillStyle = '#FF9800'
    ctx.beginPath(); ctx.arc(kx, y, 6, 0, Math.PI * 2); ctx.fill()
    canvasRef.current._clickAreas.push({
      x: x - 8, y: y - 14, w: w + 16, h: 28,
      onClick: (mx) => onChange(Math.max(0, Math.min(1, (mx - x) / w)))
    })
  }

  function drawCurrentFlow(ctx, path) {
    const t = (performance.now() / 1000) % 1
    let segLens = [], total = 0
    for (let i = 0; i < path.length - 1; i++) {
      const d = Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y)
      segLens.push(d); total += d
    }
    const N = 5
    for (let k = 0; k < N; k++) {
      let dist = ((t + k / N) % 1) * total
      for (let i = 0; i < segLens.length; i++) {
        if (dist <= segLens[i]) {
          const r = dist / segLens[i]
          const x = path[i].x + (path[i + 1].x - path[i].x) * r
          const y = path[i].y + (path[i + 1].y - path[i].y) * r
          ctx.fillStyle = 'rgba(255,193,7,0.9)'
          ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill()
          break
        }
        dist -= segLens[i]
      }
    }
  }

  function drawBatteryGroup(ctx, x, y) {
    ctx.lineWidth = 2; ctx.strokeStyle = '#333'
    ctx.beginPath(); ctx.moveTo(x - 40, y); ctx.lineTo(x - 30, y); ctx.stroke()
    for (let i = 0; i < 3; i++) {
      const cx = x - 20 + i * 20
      ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(cx - 3, y - 14); ctx.lineTo(cx - 3, y + 14); ctx.stroke()
      ctx.lineWidth = 5
      ctx.beginPath(); ctx.moveTo(cx + 3, y - 7); ctx.lineTo(cx + 3, y + 7); ctx.stroke()
      ctx.lineWidth = 2
      if (i < 2) { ctx.beginPath(); ctx.moveTo(cx + 3, y); ctx.lineTo(cx + 17, y); ctx.stroke() }
    }
    ctx.beginPath(); ctx.moveTo(x + 30, y); ctx.lineTo(x + 40, y); ctx.stroke()
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText('+', x - 36, y - 16)
    ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'
    ctx.fillText('−', x + 38, y - 8)
    ctx.fillStyle = '#555'; ctx.font = '9px sans-serif'; ctx.textBaseline = 'top'
    ctx.fillText('电池组 6V', x, y + 18)
    ctx.textBaseline = 'alphabetic'
  }

  function drawSwitch(ctx, x, y, on, onClick) {
    ctx.fillStyle = '#666'
    ctx.beginPath(); ctx.arc(x - 18, y, 4, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(x + 18, y, 4, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#999'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(x - 22, y); ctx.lineTo(x - 18, y); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x + 18, y); ctx.lineTo(x + 22, y); ctx.stroke()
    if (on) {
      ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 3; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(x - 18, y); ctx.lineTo(x + 18, y); ctx.stroke()
    } else {
      ctx.strokeStyle = '#F44336'; ctx.lineWidth = 3; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(x - 18, y); ctx.lineTo(x + 8, y - 18); ctx.stroke()
    }
    ctx.lineCap = 'butt'
    ctx.fillStyle = on ? '#4CAF50' : '#F44336'
    ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(on ? 'ON' : 'OFF', x, y + 8)
    canvasRef.current._clickAreas.push({ x: x - 25, y: y - 25, w: 50, h: 50, onClick })
    ctx.textBaseline = 'alphabetic'
  }

  // ─── 右侧面板 ───
  function drawRightPanel(ctx, x, y, w, h, s) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('🎯 奥斯特实验 — 电生磁', x + 12, y + 12)

    // 物理量
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444'
    ctx.fillText(`电流 I = ${s.current.toFixed(1)} A    方向：${s.direction > 0 ? '向外 ⊙' : '向里 ⊗'}`, x + 12, y + 32)
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`磁场强弱 ∝ I（磁感线密度）`, x + 12, y + 50)

    // 公式
    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('安培定则（右手螺旋定则）', x + 12, y + 72)
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#5D4037'
    ctx.fillText('右手握住导线，拇指指向电流方向，', x + 12, y + 90)
    ctx.fillText('四指弯曲方向 = 磁感线环绕方向', x + 12, y + 106)

    // 操作步骤
    let ky = y + 132
    const guideSteps = s.step === 1
      ? ['① 闭合开关通电', '② 观察小磁针偏转', '③ 磁感线呈同心圆', '④ 结论：电流周围存在磁场']
      : s.step === 2
        ? ['① 拖动滑条改变电流', '② 磁感线密度随 I 变化', '③ 结论：I 越大磁场越强']
        : ['① 点"反转"改变电流方向', '② 磁感线箭头反向', '③ 小磁针 N 极反向', '④ 验证安培定则']
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('📋 操作步骤', x + 12, ky); ky += 16
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#5D4037'
    for (let i = 0; i < guideSteps.length; i++) {
      ctx.fillText(guideSteps[i], x + 12, ky + i * 14)
    }
    ky += guideSteps.length * 14 + 6

    // 注意事项
    ctx.fillStyle = '#C62828'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('⚠ 注意事项', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#B71C1C'
    const notes = s.step === 1
      ? ['• 导线应沿南北方向放置（与小磁针平行）', '• 通电时间要短，避免导线过热', '• 小磁针静止后再观察偏转']
      : s.step === 2
        ? ['• 只改变电流大小，导线位置不变', '• 磁感线密度反映磁场强弱', '• 电流越大磁感线越密，磁场越强']
        : ['• 反转电流后注意观察磁感线箭头方向', '• 小磁针 N 极方向与磁感线方向一致', '• 安培定则：右手握导线，拇指=电流方向']
    for (let i = 0; i < notes.length; i++) ctx.fillText(notes[i], x + 12, ky + i * 12)
    ky += notes.length * 12 + 8

    // 数据表
    if (s.records.length > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'
      ctx.fillText('📊 实验数据', x + 12, ky); ky += 18
      ctx.fillStyle = '#FFB74D'
      ctx.fillRect(x + 12, ky, w - 24, 18)
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'
      const c1 = x + 32, c2 = x + 80, c3 = x + 140
      ctx.fillText('序号', c1, ky + 3)
      ctx.fillText('I(A)', c2, ky + 3)
      ctx.fillText('方向', c3, ky + 3)
      ky += 18
      for (let i = 0; i < s.records.length; i++) {
        const r = s.records[i]
        if (i % 2 === 0) { ctx.fillStyle = '#FFF8E1'; ctx.fillRect(x + 12, ky, w - 24, 16) }
        ctx.fillStyle = '#333'; ctx.font = '10px monospace'; ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), c1, ky + 2)
        ctx.fillText(r.I.toFixed(1), c2, ky + 2)
        ctx.fillText(r.dir > 0 ? '⊙' : '⊗', c3, ky + 2)
        ky += 16
      }
      ctx.textAlign = 'left'
    }

    // 按钮
    const btnY = y + h - 42
    const btnW = 68, btnH = 26, gap = 8
    const bx = x + 12
    ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'
    ctx.beginPath(); ctx.roundRect(bx, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('📝 记录', bx + btnW / 2, btnY + 9)
    canvasRef.current._clickAreas.push({
      x: bx, y: btnY, w: btnW, h: btnH,
      onClick: () => {
        const s2 = S.current
        s2.records.push({ I: s2.current, dir: s2.direction })
        forceUpdate(n => n + 1)
      }
    })
    ctx.fillStyle = '#FF9800'; ctx.strokeStyle = '#E65100'
    ctx.beginPath(); ctx.roundRect(bx + btnW + gap, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('🗑 清除', bx + btnW + gap + btnW / 2, btnY + 9)
    canvasRef.current._clickAreas.push({
      x: bx + btnW + gap, y: btnY, w: btnW, h: btnH,
      onClick: () => { S.current.records = []; forceUpdate(n => n + 1) }
    })
    ctx.fillStyle = '#9E9E9E'; ctx.strokeStyle = '#616161'
    ctx.beginPath(); ctx.roundRect(bx + (btnW + gap) * 2, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('↺ 重置', bx + (btnW + gap) * 2 + btnW / 2, btnY + 9)
    canvasRef.current._clickAreas.push({
      x: bx + (btnW + gap) * 2, y: btnY, w: btnW, h: btnH,
      onClick: () => {
        S.current.current = 3; S.current.direction = 1
        S.current.records = []; S.current.switchClosed = false
        forceUpdate(n => n + 1)
      }
    })
    ctx.textBaseline = 'alphabetic'
  }

  // ================================================================
  //  Tab 2：自己动手
  // ================================================================
  function renderBuilder(ctx, W, H) {
    const s = S.current
    const palW = 150
    const palX = W - palW - 10

    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#e0e0e0'
    ctx.beginPath(); ctx.roundRect(10, 10, palX - 25, H - 20, 8); ctx.fill(); ctx.stroke()

    for (const wire of s.wires) {
      const c1 = s.components.find(c => c.id === wire.from.compId)
      const c2 = s.components.find(c => c.id === wire.to.compId)
      if (!c1 || !c2) continue
      const p1 = getTermPos(c1, wire.from.portIndex)
      const p2 = getTermPos(c2, wire.to.portIndex)
      ctx.strokeStyle = wire.color || s.wireColor; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke()
      ctx.lineCap = 'butt'
    }
    if (s.connecting) {
      const c1 = s.components.find(c => c.id === s.connecting.compId)
      if (c1) {
        const p1 = getTermPos(c1, s.connecting.portIndex)
        ctx.strokeStyle = '#FF9800'; ctx.lineWidth = 2; ctx.setLineDash([5, 4])
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(s.connecting.mx, s.connecting.my); ctx.stroke()
        ctx.setLineDash([])
      }
    }

    for (const comp of s.components) drawComp(ctx, comp)

    const bx = 22, by = H - 130, bw2 = palX - 50
    ctx.fillStyle = 'rgba(255,252,240,0.95)'; ctx.strokeStyle = '#ddd'
    ctx.beginPath(); ctx.roundRect(bx, by, bw2, s._guideOpen ? 118 : 36, 6); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText('📋 操作说明', bx + 10, by + 18)
    ctx.textAlign = 'right'
    ctx.fillText(s._guideOpen ? '收起 ▲' : '展开 ▼', bx + bw2 - 10, by + 18)
    canvasRef.current._clickAreas.push({ x: bx - 5, y: by - 3, w: bw2 + 10, h: 42, onClick: () => { s._guideOpen = !s._guideOpen; forceUpdate(n => n + 1) } })
    if (s._guideOpen) {
      ctx.textAlign = 'left'; ctx.font = '10px sans-serif'
      const lines = [
        '① 拖入器材到画布',
        '② 点击接线柱连线',
        '③ 双击开关通断',
        '④ 右键删除器材',
        '⑤ 观察导线周围磁场',
      ]
      for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], bx + 10, by + 40 + i * 15)
    }
    ctx.textBaseline = 'alphabetic'

    drawPalette(ctx, palX, 10, palW, H - 20)
  }

  function drawPalette(ctx, x, y, w, h) {
    const s = S.current
    ctx.fillStyle = '#fafafa'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('电学器材', x + w / 2, y + 10)

    const items = [
      { type: 'battery', name: '电源 6V' },
      { type: 'switch', name: '开关' },
      { type: 'wire3d', name: '直导线' },
      { type: 'bulb', name: '小灯泡（干扰）' },
      { type: 'rheostat', name: '滑动变阻器（干扰）' },
      { type: 'ammeter', name: '电流表 A（干扰）' },
      { type: 'resistor', name: '定值电阻（干扰）' },
      { type: 'magnet', name: '小磁针若干' },
    ]
    const itemH = 30
    for (let i = 0; i < items.length; i++) {
      const iy = y + 32 + i * (itemH + 3)
      if (iy + itemH > y + h - 75) break
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ccc'
      ctx.beginPath(); ctx.roundRect(x + 6, iy, w - 12, itemH, 5); ctx.fill(); ctx.stroke()
      drawPaletteIcon(ctx, x + 18, iy + itemH / 2, items[i].type)
      ctx.fillStyle = '#333'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText(items[i].name, x + 34, iy + itemH / 2)
      canvasRef.current._palAreas.push({ x: x + 6, y: iy, w: w - 12, h: itemH, type: items[i].type })
    }
    const palColorBase = y + 32 + items.length * (itemH + 3) + 4
    ctx.fillStyle = '#666'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('导线颜色：', x + 10, y + 35 + items.length * (itemH + 4) + 5)
    const colors = [['#F44336', '红'], ['#FFC107', '黄'], ['#4CAF50', '绿']]
    for (let i = 0; i < 3; i++) {
      const cy = palColorBase + 18 + i * 20
      ctx.fillStyle = colors[i][0]
      ctx.fillRect(x + 10, cy, 36, 14)
      ctx.strokeStyle = s.wireColor === colors[i][0] ? '#333' : '#ccc'
      ctx.strokeRect(x + 10, cy, 36, 14)
      ctx.fillStyle = '#333'; ctx.font = '10px sans-serif'
      ctx.fillText(colors[i][1], x + 52, cy + 2)
      canvasRef.current._palAreas.push({ x: x + 8, y: cy - 2, w: w - 16, h: 18, action: 'color', color: colors[i][0] })
    }
    ctx.textBaseline = 'alphabetic'
  }

  function drawPaletteIcon(ctx, x, y, type) {
    ctx.save(); ctx.translate(x, y)
    if (type === 'battery') {
      ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'
      ctx.fillRect(-10, -7, 20, 14); ctx.strokeRect(-10, -7, 20, 14)
    } else if (type === 'switch') {
      ctx.strokeStyle = '#666'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(5, -4); ctx.stroke()
      ctx.fillStyle = '#666'; ctx.beginPath(); ctx.arc(-7, 0, 2, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(7, 0, 2, 0, Math.PI * 2); ctx.fill()
    } else if (type === 'wire3d') {
      ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(10, 0); ctx.stroke()
    } else if (type === 'bulb') {
      ctx.fillStyle = '#FFF9C4'; ctx.strokeStyle = '#F9A825'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(0, -1, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    } else if (type === 'rheostat') {
      ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'
      ctx.fillRect(-10, -4, 20, 8); ctx.strokeRect(-10, -4, 20, 8)
    } else if (type === 'ammeter') {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('A', 0, 2)
    } else if (type === 'resistor') {
      ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'
      ctx.fillRect(-9, -4, 18, 8); ctx.strokeRect(-9, -4, 18, 8)
    } else if (type === 'magnet') {
      ctx.fillStyle = '#E53935'; ctx.fillRect(-8, -3, 8, 6)
      ctx.fillStyle = '#1565C0'; ctx.fillRect(0, -3, 8, 6)
    }
    ctx.restore()
  }

  function getTermPos(comp, portIndex) {
    if (comp.type === 'battery') return { x: comp.x + (portIndex === 0 ? -18 : 18), y: comp.y }
    if (comp.type === 'switch') return { x: comp.x + (portIndex === 0 ? -15 : 15), y: comp.y }
    if (comp.type === 'wire3d') return { x: comp.x + (portIndex === 0 ? -20 : 20), y: comp.y }
    return { x: comp.x, y: comp.y }
  }

  function drawComp(ctx, comp) {
    ctx.save(); ctx.translate(comp.x, comp.y)
    if (comp.type === 'battery') {
      ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'
      ctx.beginPath(); ctx.roundRect(-18, -11, 36, 22, 3); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('6V', 0, 3)
    } else if (comp.type === 'switch') {
      ctx.strokeStyle = comp.closed ? '#4CAF50' : '#F44336'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(10, comp.closed ? 0 : -10); ctx.stroke()
      ctx.lineCap = 'butt'
      ctx.fillStyle = '#333'
      ctx.beginPath(); ctx.arc(-15, 0, 3, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(15, 0, 3, 0, Math.PI * 2); ctx.fill()
    } else if (comp.type === 'wire3d') {
      ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 4; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(20, 0); ctx.stroke()
      ctx.lineCap = 'butt'
    }
    const t1 = getTermPos({ ...comp, x: 0, y: 0 }, 0)
    const t2 = getTermPos({ ...comp, x: 0, y: 0 }, 1)
    for (const t of [t1, t2]) {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#666'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(t.x, t.y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    }
    ctx.restore()
  }

  // ================================================================
  //  交互事件
  // ================================================================
  function getPos(e) {
    return eventToCanvas(canvasRef.current, e)
  }
  function findTerm(x, y) {
    for (const comp of S.current.components) {
      for (let i = 0; i < 2; i++) {
        const t = getTermPos(comp, i)
        if (Math.abs(x - t.x) < 10 && Math.abs(y - t.y) < 10) {
          return { compId: comp.id, portIndex: i }
        }
      }
    }
    return null
  }

  function handleMouseDown(e) {
    if (e.button !== 0) return
    const s = S.current; const { x, y } = getPos(e)
    if (s.tab === 1) {
      for (const a of canvasRef.current._clickAreas) {
        if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(x, y); return }
      }
      return
    }
    for (const a of canvasRef.current._clickAreas || []) {
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(); return }
    }
    for (const a of canvasRef.current._palAreas) {
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) {
        if (a.action === 'color') { s.wireColor = a.color; forceUpdate(n => n + 1); return }
        if (a.type) {
          const id = s.nextId++
          s.components.push({ id, type: a.type, x, y, closed: a.type === 'switch' ? false : true, props: {} })
          s.dragId = id; forceUpdate(n => n + 1); return
        }
      }
    }
    const term = findTerm(x, y)
    if (term) { s.connecting = { ...term, mx: x, my: y }; forceUpdate(n => n + 1); return }
    for (const comp of s.components) {
      if (Math.abs(x - comp.x) < 30 && Math.abs(y - comp.y) < 25) {
        s.dragId = comp.id; s.dragOffX = x - comp.x; s.dragOffY = y - comp.y
        forceUpdate(n => n + 1); return
      }
    }
  }

  function handleMouseMove(e) {
    const s = S.current; const { x, y } = getPos(e)
    if (s.connecting) { s.connecting.mx = x; s.connecting.my = y; forceUpdate(n => n + 1); return }
    if (s.dragId == null) return
    const comp = s.components.find(c => c.id === s.dragId)
    if (comp) { comp.x = x - s.dragOffX; comp.y = y - s.dragOffY; forceUpdate(n => n + 1) }
  }

  function handleMouseUp(e) {
    const s = S.current; const { x, y } = getPos(e)
    if (s.connecting) {
      const term = findTerm(x, y)
      if (term && !(term.compId === s.connecting.compId && term.portIndex === s.connecting.portIndex)) {
        const exists = s.wires.some(w =>
          (w.from.compId === s.connecting.compId && w.from.portIndex === s.connecting.portIndex && w.to.compId === term.compId && w.to.portIndex === term.portIndex) ||
          (w.to.compId === s.connecting.compId && w.to.portIndex === s.connecting.portIndex && w.from.compId === term.compId && w.from.portIndex === term.portIndex)
        )
        if (!exists) s.wires.push({ id: s.wires.length + 1, from: { ...s.connecting }, to: term, color: s.wireColor })
      }
      s.connecting = null; forceUpdate(n => n + 1); return
    }
    s.dragId = null
  }

  function handleDoubleClick(e) {
    const s = S.current; const { x, y } = getPos(e)
    const comp = s.components.find(c => Math.abs(x - c.x) < 25 && Math.abs(y - c.y) < 25 && c.type === 'switch')
    if (comp) { comp.closed = !comp.closed; forceUpdate(n => n + 1) }
  }

  function handleContextMenu(e) {
    e.preventDefault()
    const s = S.current; const { x, y } = getPos(e)
    const idx = s.components.findIndex(c => Math.abs(x - c.x) < 30 && Math.abs(y - c.y) < 25)
    if (idx >= 0) {
      const id = s.components[idx].id
      s.components.splice(idx, 1)
      s.wires = s.wires.filter(w => w.from.compId !== id && w.to.compId !== id)
      forceUpdate(n => n + 1)
    }
  }

  return (
    <SceneShell
      title="电生磁（奥斯特实验）"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t); forceUpdate(n => n + 1) }}
      tab1Label="📊 实验演示"
      tab2Label="🔧 自己动手"
    >
      <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      />
    </SceneShell>
  )
}
