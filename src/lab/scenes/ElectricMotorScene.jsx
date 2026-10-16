import { useState, useRef, useEffect } from 'react'
import { eventToCanvas } from '../utils/pointerPos'
import SceneShell from '../ui/SceneShell'

/**
 * ElectricMotorScene — 电动机原理
 *
 * 通电线圈在磁场中受安培力转动，换向器每半周改变电流方向维持持续转动
 *
 * Step1: 安培力 — 线圈两侧受力方向相反（左手定则），产生转矩
 * Step2: 换向器 — 每转半周自动改变电流方向，保持同向转矩
 * Step3: 转速与电流 — I 越大转速越快
 */
export default function ElectricMotorScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,
    switchClosed: false,
    current: 3,
    angle: 0,
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

    let last = performance.now()
    const loop = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05); last = now
      const s = S.current
      if (s.switchClosed) s.angle += s.current * 2 * dt
      render(R)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  // 转速 rpm
  function rpmOf(s) {
    return s.current * 2 / (2 * Math.PI) * 60
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

  // ================================================================
  //  Tab 1：实验演示
  // ================================================================
  function renderDemo(ctx, W, H) {
    const s = S.current
    const on = s.switchClosed

    // 顶部步骤标签
    const labels = ['① 安培力', '② 换向器', '③ 转速与电流']
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
          S.current.angle = 0
          setStep(i + 1)
          forceUpdate(n => n + 1)
        }
      })
    }
    ctx.textBaseline = 'alphabetic'

    const subs = {
      1: '线圈两侧在磁场中受安培力，方向相反形成转矩（左手定则）',
      2: '换向器每半周自动改变电流方向，保持转矩方向不变',
      3: '改变电流大小，观察转速变化',
    }
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(subs[s.step], W / 2, 52)
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('🎯 实验目的：理解通电线圈在磁场中受力转动原理及换向器的作用', W / 2, 70)

    // ─── 电动机主视觉 ───
    const cx = W * 0.30, cy = H * 0.42
    drawMotor(ctx, cx, cy, s, on)

    // ─── 电路（矩形回路）───
    const circL = 60, circR = W * 0.52
    const span = circR - circL
    const circTop = H * 0.72, circBottom = H - 55
    const wc = on ? '#1565C0' : '#999'

    const battX = circL + span * 0.28
    const swX = circL + span * 0.72

    // 电动机电刷接线柱（线圈经电刷接入电路，电流流过线圈才受安培力）
    const brushLX = cx - 28, brushRX = cx + 28

    ctx.strokeStyle = wc; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
    // 顶边左段：circL → 左电刷接线柱
    ctx.beginPath(); ctx.moveTo(circL, circTop); ctx.lineTo(brushLX, circTop); ctx.stroke()
    // 顶边右段：右电刷接线柱 → circR
    ctx.beginPath(); ctx.moveTo(brushRX, circTop); ctx.lineTo(circR, circTop); ctx.stroke()
    // 左连接线：左电刷接线柱 → 左电刷
    ctx.beginPath(); ctx.moveTo(brushLX, circTop); ctx.lineTo(brushLX, cy); ctx.stroke()
    // 右连接线：右电刷接线柱 → 右电刷
    ctx.beginPath(); ctx.moveTo(brushRX, circTop); ctx.lineTo(brushRX, cy); ctx.stroke()
    // 右边
    ctx.beginPath(); ctx.moveTo(circR, circTop); ctx.lineTo(circR, circBottom); ctx.stroke()
    // 底边：电源+开关
    ctx.beginPath(); ctx.moveTo(circR, circBottom); ctx.lineTo(swX + 18, circBottom); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(swX - 18, circBottom); ctx.lineTo(battX + 30, circBottom); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(battX - 30, circBottom); ctx.lineTo(circL, circBottom); ctx.stroke()
    // 左边
    ctx.beginPath(); ctx.moveTo(circL, circBottom); ctx.lineTo(circL, circTop); ctx.stroke()
    ctx.lineCap = 'butt'

    if (on) {
      const path = [
        { x: battX + 30, y: circBottom }, { x: swX, y: circBottom },
        { x: circR, y: circBottom }, { x: circR, y: circTop },
        { x: brushRX, y: circTop }, { x: brushRX, y: cy },
        { x: brushLX, y: cy }, { x: brushLX, y: circTop },
        { x: circL, y: circTop }, { x: circL, y: circBottom },
        { x: battX - 30, y: circBottom },
      ]
      drawCurrentFlow(ctx, path)
    }

    drawBatteryGroup(ctx, battX, circBottom)
    drawSwitch(ctx, swX, circBottom, on, () => {
      S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1)
    })

    // ─── 电流调节（底部）───
    const barY = H - 26
    ctx.fillStyle = '#1976D2'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText(`电流 I = ${s.current.toFixed(1)} A`, 70, barY)
    drawMiniSlider(ctx, 185, barY, 110, (s.current - 0.5) / 7.5, (r) => {
      S.current.current = Math.round((0.5 + r * 7.5) * 10) / 10
      forceUpdate(n => n + 1)
    })
    ctx.fillStyle = '#E65100'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`转速 ${rpmOf(s).toFixed(0)} rpm`, 320, barY)
    ctx.textBaseline = 'alphabetic'

    // 右侧面板
    drawRightPanel(ctx, W * 0.56, 70, W - W * 0.56 - 25, H - 100, s)
  }

  // ─── 电动机结构 ───
  function drawMotor(ctx, cx, cy, s, on) {
    const angle = s.angle

    // 磁铁 N（左红）/ S（右蓝）
    ctx.fillStyle = '#E53935'
    ctx.fillRect(cx - 170, cy - 110, 42, 220)
    ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('N', cx - 149, cy)

    ctx.fillStyle = '#1565C0'
    ctx.fillRect(cx + 128, cy - 110, 42, 220)
    ctx.fillStyle = '#fff'
    ctx.fillText('S', cx + 149, cy)

    // 磁感线（N→S）
    ctx.strokeStyle = 'rgba(100,100,100,0.22)'; ctx.lineWidth = 1
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath(); ctx.moveTo(cx - 128, cy + i * 32); ctx.lineTo(cx + 128, cy + i * 32); ctx.stroke()
      ctx.fillStyle = 'rgba(100,100,100,0.32)'
      ctx.beginPath()
      ctx.moveTo(cx + 128, cy + i * 32)
      ctx.lineTo(cx + 119, cy + i * 32 - 4.5)
      ctx.lineTo(cx + 119, cy + i * 32 + 4.5)
      ctx.closePath(); ctx.fill()
    }

    // 线圈（旋转）
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(angle)

    // 线圈竖边
    ctx.strokeStyle = '#E65100'; ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(-22, -62); ctx.lineTo(-22, 62)
    ctx.moveTo(22, -62); ctx.lineTo(22, 62)
    ctx.stroke()
    // 上下横边
    ctx.strokeStyle = '#BF360C'; ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(-22, -62); ctx.lineTo(22, -62)
    ctx.moveTo(-22, 62); ctx.lineTo(22, 62)
    ctx.stroke()

    // Step1：标注两侧安培力方向
    if (s.step === 1 && on) {
      drawForceArrow(ctx, -22, -30, -1, 'F')
      drawForceArrow(ctx, 22, -30, 1, 'F')
    }
    // Step2：标注电流方向（上⊙下⊗ 或随换向器切换）
    if (s.step === 2 && on) {
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      const flip = Math.floor(angle / Math.PI) % 2 === 0
      ctx.fillText(flip ? '⊙' : '⊗', 0, -48)
      ctx.fillText(flip ? '⊗' : '⊙', 0, 48)
    }

    // 转轴
    ctx.fillStyle = '#666'
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill()

    // 换向器（半圆环，两片）
    ctx.strokeStyle = '#888'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.arc(0, 0, 16, 0.15, Math.PI - 0.15); ctx.stroke()
    ctx.beginPath(); ctx.arc(0, 0, 16, Math.PI + 0.15, Math.PI * 2 - 0.15); ctx.stroke()
    // 换向器间隙高亮（Step2）
    if (s.step === 2) {
      ctx.strokeStyle = '#FF9800'; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.arc(0, 0, 20, -0.12, 0.12); ctx.stroke()
      ctx.beginPath(); ctx.arc(0, 0, 20, Math.PI - 0.12, Math.PI + 0.12); ctx.stroke()
    }

    ctx.restore()

    // 电刷（固定不动，压在换向器两侧；电流经电刷→换向器→线圈）
    ctx.fillStyle = '#333'
    ctx.fillRect(cx - 28, cy - 3, 12, 6)
    ctx.fillRect(cx + 16, cy - 3, 12, 6)
    // 电刷接线柱（接入外电路）
    for (const bx of [cx - 28, cx + 28]) {
      ctx.fillStyle = '#333'
      ctx.beginPath(); ctx.arc(bx, cy, 4, 0, Math.PI * 2); ctx.fill()
    }

    // 标注
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('通电线圈（转子）', cx, cy + 132)
    if (s.step === 2) {
      ctx.fillStyle = '#E65100'; ctx.font = '10px sans-serif'
      ctx.fillText('换向器（每半周自动换向）', cx, cy + 148)
    }
    ctx.textBaseline = 'alphabetic'
  }

  // 力箭头
  function drawForceArrow(ctx, x, y, dir, label) {
    ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dir * 38, y); ctx.stroke()
    ctx.lineCap = 'butt'
    ctx.fillStyle = '#4CAF50'
    ctx.beginPath()
    ctx.moveTo(x + dir * 38, y)
    ctx.lineTo(x + dir * 30, y - 5)
    ctx.lineTo(x + dir * 30, y + 5)
    ctx.closePath(); ctx.fill()
    ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText(label, x + dir * 20, y - 8)
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
    ctx.fillText('🎯 电动机原理 — 磁场对电流的作用', x + 12, y + 12)

    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444'
    ctx.fillText(`电流 I = ${s.current.toFixed(1)} A`, x + 12, y + 32)
    ctx.fillStyle = '#E65100'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`转速 n = ${rpmOf(s).toFixed(0)} rpm`, x + 12, y + 50)

    // 公式
    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('F = BIL（安培力）', x + 12, y + 72)
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#5D4037'
    ctx.fillText('左手定则：磁感线穿掌心，', x + 12, y + 90)
    ctx.fillText('四指指电流，拇指指受力方向', x + 12, y + 106)

    // 操作步骤
    let ky = y + 132
    const guideSteps = s.step === 1
      ? ['① 闭合开关通电', '② 观察线圈两侧受力', '③ 左右受力方向相反', '④ 形成转矩使线圈转动']
      : s.step === 2
        ? ['① 观察换向器结构', '② 每半周自动改变电流方向', '③ 转矩方向保持不变', '④ 线圈持续旋转']
        : ['① 拖动滑条改变电流', '② 转速随电流变化', '③ 记录数据', '④ 结论：I 越大转速越快']
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
      ? ['• 左手定则：磁感线穿掌心，四指指电流，拇指指受力', '• 线圈两侧受力方向相反，形成转矩', '• 电流方向不变时线圈只能转半圈']
      : s.step === 2
        ? ['• 换向器每半周自动改变电流方向', '• 转矩方向保持不变，线圈持续旋转', '• 换向器是直流电动机的核心部件']
        : ['• 只改变电流大小观察转速', '• 电流越大转速越快', '• 注意电流不宜过大，避免烧毁线圈']
    for (let i = 0; i < notes.length; i++) ctx.fillText(notes[i], x + 12, ky + i * 12)
    ky += notes.length * 12 + 8

    // 数据表
    if (s.records.length > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'
      ctx.fillText('📊 实验数据', x + 12, ky); ky += 18
      ctx.fillStyle = '#FFB74D'
      ctx.fillRect(x + 12, ky, w - 24, 18)
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'
      const c1 = x + 32, c2 = x + 85, c3 = x + 148
      ctx.fillText('序号', c1, ky + 3)
      ctx.fillText('I(A)', c2, ky + 3)
      ctx.fillText('n(rpm)', c3, ky + 3)
      ky += 18
      for (let i = 0; i < s.records.length; i++) {
        const r = s.records[i]
        if (i % 2 === 0) { ctx.fillStyle = '#FFF8E1'; ctx.fillRect(x + 12, ky, w - 24, 16) }
        ctx.fillStyle = '#333'; ctx.font = '10px monospace'; ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), c1, ky + 2)
        ctx.fillText(r.I.toFixed(1), c2, ky + 2)
        ctx.fillText(r.rpm.toFixed(0), c3, ky + 2)
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
        s2.records.push({ I: s2.current, rpm: rpmOf(s2) })
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
        S.current.current = 3; S.current.angle = 0
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
        '⑤ 观察电动机转动',
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
      { type: 'motor', name: '电动机' },
      { type: 'rheostat', name: '滑动变阻器（干扰）' },
      { type: 'ammeter', name: '电流表 A（干扰）' },
      { type: 'bulb', name: '小灯泡（干扰）' },
      { type: 'resistor', name: '定值电阻（干扰）' },
      { type: 'magnet', name: '磁铁 N-S' },
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
    } else if (type === 'motor') {
      ctx.fillStyle = '#FFF9C4'; ctx.strokeStyle = '#F9A825'
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#E65100'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('M', 0, 3)
    } else if (type === 'rheostat') {
      ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'
      ctx.fillRect(-10, -4, 20, 8); ctx.strokeRect(-10, -4, 20, 8)
    } else if (type === 'ammeter') {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('A', 0, 2)
    } else if (type === 'bulb') {
      ctx.fillStyle = '#FFF9C4'; ctx.strokeStyle = '#F9A825'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(0, -1, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    } else if (type === 'resistor') {
      ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'
      ctx.fillRect(-9, -4, 18, 8); ctx.strokeRect(-9, -4, 18, 8)
    } else if (type === 'magnet') {
      ctx.fillStyle = '#E53935'; ctx.fillRect(-10, -6, 10, 12)
      ctx.fillStyle = '#1565C0'; ctx.fillRect(0, -6, 10, 12)
      ctx.fillStyle = '#fff'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('N', -5, 2); ctx.fillText('S', 5, 2)
    }
    ctx.restore()
  }

  function getTermPos(comp, portIndex) {
    if (comp.type === 'battery') return { x: comp.x + (portIndex === 0 ? -18 : 18), y: comp.y }
    if (comp.type === 'switch') return { x: comp.x + (portIndex === 0 ? -15 : 15), y: comp.y }
    if (comp.type === 'motor') return { x: comp.x + (portIndex === 0 ? -18 : 18), y: comp.y }
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
    } else if (comp.type === 'motor') {
      ctx.fillStyle = '#FFF9C4'; ctx.strokeStyle = '#F9A825'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#E65100'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('M', 0, 0)
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
      title="电动机原理"
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
