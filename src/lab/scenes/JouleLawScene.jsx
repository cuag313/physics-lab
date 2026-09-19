import { useState, useRef, useEffect } from 'react'

/**
 * JouleLawScene — 探究焦耳定律 Q = I²Rt
 *
 * 烧杯里浸着电阻丝，电阻丝两端从烧杯侧壁引出接到下方电路
 *
 * Step1: 一个烧杯，调变阻器改变电流 → 升温快慢不同 → Q∝I²
 * Step2: 两个烧杯（R=5Ω/20Ω）串联，同电流 → 对比升温 → Q∝R
 * Step3: 一个烧杯，通电计时 → 温度随时间上升 → Q∝t
 */
export default function JouleLawScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,
    switchClosed: false,
    sliderR: 15,
    U: 6,
    elapsed: 0,
    // 烧杯温度（°C）
    temps: [20, 20],
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
  const [step, setStep] = useState(1)
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const R = { canvas, ctx: canvas.getContext('2d'), W: 0, H: 0,
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
      const dt = (now - last) / 1000; last = now
      const s = S.current
      if (s.switchClosed) {
        s.elapsed += dt
        // 当前电路电流
        let I, Ra, Rb
        if (s.step === 1) {
          I = s.U / (10 + s.sliderR)
          Ra = 10
        } else if (s.step === 2) {
          I = s.U / (5 + 20 + s.sliderR)
          Ra = 5; Rb = 20
        } else {
          I = s.U / (10 + s.sliderR)
          Ra = 10
        }
        // 温度累积 ΔT ∝ I²Rt
        const k = 0.8
        s.temps[0] += I * I * Ra * dt * k
        if (s.step === 2) s.temps[1] += I * I * Rb * dt * k
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

  // ================================================================
  //  Tab 1：实验演示
  // ================================================================
  function renderDemo(ctx, W, H) {
    const s = S.current

    // 顶部步骤标签
    const labels = ['① Q∝I²', '② Q∝R', '③ Q∝t']
    const bw = 90, bh = 28, gap = 8
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
          S.current.elapsed = 0
          S.current.temps = [20, 20]
          S.current.records = []
          S.current.switchClosed = false
          setStep(i + 1)
          forceUpdate(n => n + 1)
        }
      })
    }
    ctx.textBaseline = 'alphabetic'

    const subs = {
      1: '保持电阻 R、时间 t 不变，改变电流 I',
      2: '保持电流 I、时间 t 不变，改变电阻 R',
      3: '保持电流 I、电阻 R 不变，观察随时间 t 的变化',
    }
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(subs[s.step], W / 2, 52)

    // 电路区域（伏安法标准布局：下边=电源+开关，上边=变阻器→A表→烧杯）
    const circL = 50, circR = Math.min(W * 0.66, W) - 25
    const span = circR - circL
    const circTop = 75, circBottom = H - 50
    const topWireY = circTop + 80
    const on = s.switchClosed
    const wc = on ? '#1565C0' : '#999'

    // 上边元件位置（左→右：变阻器→安培表→烧杯）
    const rheoX = circL + span * 0.15
    const ammX = circL + span * 0.32
    // 下边元件位置（左→右：电源→开关）
    const battX = circL + span * 0.25
    const swX = circL + span * 0.65

    // 烧杯位置
    const beakerW = 85, beakerH = 110
    let beakerXs
    if (s.step === 2) {
      const startX = circL + span * 0.42
      beakerXs = [startX, startX + beakerW + 30]
    } else {
      beakerXs = [circL + span * 0.5 - beakerW / 2]
    }
    const beakerY = circTop + 5
    const pinY = beakerY + beakerH

    // 画烧杯
    for (let i = 0; i < beakerXs.length; i++) {
      const Rval = s.step === 2 ? (i === 0 ? 5 : 20) : 10
      drawBeakerWithResistor(ctx, beakerXs[i], beakerY, beakerW, beakerH, s.temps[i], Rval, on)
    }

    // ─── 矩形回路导线 ───
    // 下边：左→电源→开关→右
    ctx.strokeStyle = wc; ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.moveTo(circL, circBottom); ctx.lineTo(battX - 30, circBottom); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(battX + 30, circBottom); ctx.lineTo(swX - 18, circBottom); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(swX + 18, circBottom); ctx.lineTo(circR, circBottom); ctx.stroke()
    // 右边：下→上
    ctx.beginPath(); ctx.moveTo(circR, circBottom); ctx.lineTo(circR, topWireY); ctx.stroke()
    // 上边：右→烧杯→安培表→变阻器→左
    const lastBeakerX = beakerXs[beakerXs.length - 1]
    const lastBeakerRightPinX = lastBeakerX + beakerW - 12
    ctx.beginPath(); ctx.moveTo(circR, topWireY); ctx.lineTo(lastBeakerRightPinX, topWireY); ctx.stroke()
    // 烧杯引脚连线
    for (let i = beakerXs.length - 1; i >= 0; i--) {
      const bx = beakerXs[i]
      const p1x = bx + 12, p2x = bx + beakerW - 12
      ctx.beginPath(); ctx.moveTo(p2x, pinY); ctx.lineTo(p2x, topWireY); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(p1x, pinY); ctx.lineTo(p1x, topWireY); ctx.stroke()
      if (i > 0) {
        const prevBeakerX = beakerXs[i - 1]
        const prevRightPinX = prevBeakerX + beakerW - 12
        ctx.beginPath(); ctx.moveTo(p1x, topWireY); ctx.lineTo(prevRightPinX, topWireY); ctx.stroke()
      }
    }
    const firstBeakerLeftPinX = beakerXs[0] + 12
    ctx.beginPath(); ctx.moveTo(firstBeakerLeftPinX, topWireY); ctx.lineTo(ammX + 16, topWireY); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(ammX - 16, topWireY); ctx.lineTo(rheoX + 35, topWireY); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(rheoX - 35, topWireY); ctx.lineTo(circL, topWireY); ctx.stroke()
    // 左边：上→下
    ctx.beginPath(); ctx.moveTo(circL, topWireY); ctx.lineTo(circL, circBottom); ctx.stroke()

    // ─── 元件绘制 ───
    // 下边：电源组 + 开关
    drawBatteryGroup(ctx, battX, circBottom)
    drawSwitch(ctx, swX, circBottom, on, () => {
      S.current.switchClosed = !S.current.switchClosed
      forceUpdate(n => n + 1)
    })

    // 上边：变阻器（水平，可拖拽）
    const rheoW = 70, rheoH = 22
    ctx.fillStyle = '#EFEBE9'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(rheoX - rheoW / 2, topWireY - rheoH / 2, rheoW, rheoH, 4); ctx.fill(); ctx.stroke()
    ctx.strokeStyle = '#5D4037'; ctx.lineWidth = 1.5; ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const px = rheoX - rheoW / 2 + 8 + i * (rheoW - 16) / 5
      const py = topWireY + (i % 2 === 0 ? -5 : 5)
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.stroke()
    const sliderX = rheoX - rheoW / 2 + 8 + (s.sliderR / 50) * (rheoW - 16)
    ctx.fillStyle = '#E65100'; ctx.beginPath()
    ctx.moveTo(sliderX, topWireY - rheoH / 2 - 8); ctx.lineTo(sliderX - 4, topWireY - rheoH / 2 - 2); ctx.lineTo(sliderX + 4, topWireY - rheoH / 2 - 2)
    ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#666'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(rheoX - rheoW / 2, topWireY, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.arc(rheoX + rheoW / 2, topWireY, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#E65100'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(`${s.sliderR}Ω`, rheoX, topWireY + rheoH / 2 + 3)
    ctx.textBaseline = 'alphabetic'
    canvasRef.current._clickAreas.push({
      x: rheoX - rheoW / 2 - 5, y: topWireY - rheoH / 2 - 12, w: rheoW + 10, h: rheoH + 24,
      onClick: (mx, my) => {
        const r = Math.max(0, Math.min(1, (mx - (rheoX - rheoW / 2 + 8)) / (rheoW - 16)))
        S.current.sliderR = Math.round(r * 50)
        forceUpdate(n => n + 1)
      }
    })

    // 上边：安培表
    const I = s.step === 2 ? s.U / (5 + 20 + s.sliderR) : s.U / (10 + s.sliderR)
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(ammX, topWireY, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('A', ammX, topWireY)
    ctx.fillStyle = '#333'; ctx.font = 'bold 9px monospace'; ctx.textBaseline = 'top'
    ctx.fillText(on ? I.toFixed(2) + 'A' : '', ammX + 20, topWireY)
    ctx.textBaseline = 'alphabetic'

    // 计时
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'right'
    ctx.fillText('t = ' + s.elapsed.toFixed(1) + ' s', circR - 5, circTop - 5)
    ctx.textBaseline = 'alphabetic'

    // 右侧面板
    drawRightPanel(ctx, Math.min(W * 0.66, W) + 15, 70, W - Math.min(W * 0.66, W) - 30, H - 90, s)
  }

  // 烧杯+电阻丝+温度计（电阻丝浸在煤油里）
  function drawBeakerWithResistor(ctx, bx, by, bw, bh, temp, Rval, on) {
    // 烧杯
    ctx.fillStyle = 'rgba(200,230,255,0.3)'
    ctx.strokeStyle = '#888'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, [4, 4, 10, 10]); ctx.fill(); ctx.stroke()

    // 煤油
    ctx.fillStyle = 'rgba(66,165,245,0.3)'
    ctx.fillRect(bx + 3, by + 8, bw - 6, bh - 20)

    // 电阻丝（红色线圈）
    const coilY = by + bh * 0.6
    const heat = on ? Math.min((temp - 20) / 50, 1) : 0
    const coilColor = heat < 0.25 ? '#D32F2F' : heat < 0.5 ? '#FF6F00' : heat < 0.75 ? '#FFD600' : '#FFF59D'
    ctx.strokeStyle = coilColor; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
    ctx.beginPath()
    const coilW = bw - 30
    for (let s2 = 0; s2 < 5; s2++) {
      const sx = bx + 15 + s2 * (coilW / 5)
      ctx.moveTo(sx, coilY - 5)
      ctx.lineTo(sx + coilW / 10, coilY + 5)
      ctx.lineTo(sx + coilW / 5, coilY - 5)
    }
    ctx.stroke(); ctx.lineCap = 'butt'

    // 温度计
    const tx = bx + bw - 8
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(tx, by + 10); ctx.lineTo(tx, by + bh - 20); ctx.stroke()
    ctx.beginPath(); ctx.arc(tx, by + bh - 15, 5, 0, Math.PI * 2); ctx.stroke()
    const maxH = bh - 35
    const riseH = Math.min((temp - 20) / 80, 1) * maxH
    ctx.fillStyle = '#E53935'
    ctx.fillRect(tx - 2, by + bh - 15 - riseH, 4, riseH)
    ctx.beginPath(); ctx.arc(tx, by + bh - 15, 4, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#333'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(temp.toFixed(1) + '°C', tx, by + 12)

    // 标签
    ctx.fillStyle = '#444'; ctx.font = 'bold 10px sans-serif'; ctx.textBaseline = 'top'
    ctx.fillText(`R=${Rval}Ω`, bx + bw / 2, by + bh + 5)
    ctx.textBaseline = 'alphabetic'
  }

  function drawBatteryGroup(ctx, x, y) {
    ctx.lineWidth = 2; ctx.strokeStyle = '#333'
    // 断开下边导线
    ctx.beginPath(); ctx.moveTo(x - 40, y); ctx.lineTo(x - 30, y); ctx.stroke()
    // 3节电池
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
    // 断开下边导线
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

  function drawRightPanel(ctx, x, y, w, h, s) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('🎯 探究 Q 与 I、R、t 的关系', x + 12, y + 12)

    const I = s.step === 2 ? s.U / (5 + 20 + s.sliderR) : s.U / (10 + s.sliderR)
    const Rval = s.step === 2 ? 5 : 10
    const Rtxt = s.step === 2 ? '5Ω / 20Ω 串联' : '10Ω'
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444'
    ctx.fillText(`I = ${I.toFixed(2)}A  R = ${Rtxt}`, x + 12, y + 32)
    ctx.fillText(`t = ${s.elapsed.toFixed(1)}s    Q = I²Rt = ${I.toFixed(2)}²×${Rval}×${s.elapsed.toFixed(1)}`, x + 12, y + 46)

    const Q0 = I * I * Rval * s.elapsed
    const Q1 = s.step === 2 ? I * I * 20 * s.elapsed : 0
    ctx.fillStyle = '#E65100'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`Q = ${Q0.toFixed(1)} J` + (s.step === 2 ? `  Q₁=${Q0.toFixed(1)}J  Q₂=${Q1.toFixed(1)}J` : ''), x + 12, y + 62)

    // 操作步骤
    let ky = y + (s.step === 2 ? 116 : 100)
    const guideSteps = s.step === 1
      ? ['① 闭合开关', '② 调变阻器改电流', '③ 观察温度上升快慢', '④ 结论：I 越大，升温越快']
      : s.step === 2
        ? ['① 闭合开关', '② 两电阻丝串联', '③ 同电流，R大的升温快', '④ 结论：Q ∝ R']
        : ['① 闭合开关开始计时', '② 每隔几秒点"记录"', '③ 观察温度随时间上升', '④ 结论：Q ∝ t']
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('📋 操作步骤', x + 12, ky); ky += 16
    ctx.font = '10px sans-serif'
    for (let i = 0; i < guideSteps.length; i++) {
      ctx.fillText(guideSteps[i], x + 12, ky + i * 14)
    }
    ky += guideSteps.length * 14 + 10

    // Step3 数据表
    if (s.step === 3) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'
      ctx.fillText('📊 实验数据', x + 12, ky); ky += 18
      ctx.fillStyle = '#FFB74D'
      ctx.fillRect(x + 12, ky, w - 24, 18)
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'
      const col1 = x + 30, col2 = x + 65, col3 = x + 105, col4 = x + 145
      ctx.fillText('序号', col1, ky + 3)
      ctx.fillText('t(s)', col2, ky + 3)
      ctx.fillText('I²Rt(J)', col3, ky + 3)
      ctx.fillText('ΔT(°C)', col4, ky + 3)
      ky += 18
      for (let i = 0; i < s.records.length; i++) {
        const r = s.records[i]
        if (i % 2 === 0) { ctx.fillStyle = '#FFF8E1'; ctx.fillRect(x + 12, ky, w - 24, 16) }
        ctx.fillStyle = '#333'; ctx.font = '10px monospace'; ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), col1, ky + 2)
        ctx.fillText(r.t.toFixed(1), col2, ky + 2)
        ctx.fillText(r.Q.toFixed(1), col3, ky + 2)
        ctx.fillText(r.dT.toFixed(1), col4, ky + 2)
        ky += 16
      }
      ctx.textAlign = 'left'
    }

    // 底部按钮
    const btnY = y + h - 42
    const btnW = 68, btnH = 26, gap = 8
    const bx = x + 12
    if (s.step === 3) {
      ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'
      ctx.beginPath(); ctx.roundRect(bx, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('📝 记录', bx + btnW / 2, btnY + 9)
      canvasRef.current._clickAreas.push({
        x: bx, y: btnY, w: btnW, h: btnH,
        onClick: () => {
          const s2 = S.current
          const I2 = s2.step === 2 ? s2.U / (5 + 20 + s2.sliderR) : s2.U / (10 + s2.sliderR)
          const R2 = s2.step === 2 ? 5 : 10
          s2.records.push({ t: s2.elapsed, Q: I2 * I2 * R2 * s2.elapsed, dT: s2.temps[0] - 20 })
          forceUpdate(n => n + 1)
        }
      })
    }
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
        S.current.elapsed = 0; S.current.temps = [20, 20]
        S.current.records = []; S.current.switchClosed = false
        forceUpdate(n => n + 1)
      }
    })
    ctx.textBaseline = 'alphabetic'
  }

  // ================================================================
  //  Tab 2：自己动手（简化版，复用OhmsLawScene器材逻辑）
  // ================================================================
  function renderBuilder(ctx, W, H) {
    const s = S.current
    const palW = 150
    const palX = W - palW - 10
    const cvX = 10, cvY = 10, cvW = W - palW - 30, cvH = H - 20

    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(cvX, cvY, cvW, cvH, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#e0e0e0'
    for (let gx = cvX + 20; gx < cvX + cvW; gx += 30)
      for (let gy = cvY + 20; gy < cvY + cvH; gy += 30)
        ctx.fillRect(gx, gy, 2, 2)

    drawPalette(ctx, palX, cvY, palW, cvH)

    // 画导线
    for (const wire of s.wires) {
      const fc = s.components.find(c => c.id === wire.from.compId)
      const tc = s.components.find(c => c.id === wire.to.compId)
      if (!fc || !tc) continue
      const fp = getTermPos(fc, wire.from.portIndex)
      const tp = getTermPos(tc, wire.to.portIndex)
      ctx.strokeStyle = s.wireColor; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(fp.x, fp.y)
      const m1x = wire.mid1X ?? (fp.x + tp.x) / 2
      const m1y = wire.mid1Y ?? fp.y
      const m2x = wire.mid2X ?? (fp.x + tp.x) / 2
      const m2y = wire.mid2Y ?? tp.y
      ctx.bezierCurveTo(m1x, m1y, m2x, m2y, tp.x, tp.y)
      ctx.stroke()
    }

    // 拖线
    if (s.connecting) {
      const from = getTermPos(s.components.find(c => c.id === s.connecting.compId), s.connecting.portIndex)
      ctx.strokeStyle = s.wireColor; ctx.lineWidth = 2.5; ctx.setLineDash([5, 5])
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(s.connecting.mx, s.connecting.my); ctx.stroke()
      ctx.setLineDash([])
    }

    for (const comp of s.components) drawComp(ctx, comp)

    // 未连线红框
    for (const comp of s.components) {
      const adj = s.wires.filter(w => w.from.compId === comp.id || w.to.compId === comp.id).length
      if (adj < 2) {
        ctx.strokeStyle = '#F44336'; ctx.lineWidth = 2; ctx.setLineDash([4, 3])
        ctx.beginPath(); ctx.roundRect(comp.x - 28, comp.y - 28, 56, 56, 6); ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = '#F44336'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'
        ctx.fillText('未连线', comp.x, comp.y - 32)
      }
    }

    // 状态
    const eng = solveBuilder()
    ctx.fillStyle = eng.ok ? '#4CAF50' : '#F44336'
    ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText(eng.ok ? '✅ ' + eng.reason : '❌ ' + (eng.reason || '画布是空的'), cvX + 12, cvY + cvH - 25)

    // 操作气泡
    {
      const bw2 = 190, bh2 = s._guideOpen ? 160 : 36
      const bx = cvX + cvW - bw2 - 12, by = cvY + 10
      ctx.fillStyle = 'rgba(255,253,230,0.95)'; ctx.strokeStyle = '#FFB300'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.roundRect(bx, by, bw2, bh2, 8); ctx.fill(); ctx.stroke()
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
          '③ 拖动变阻器滑片调阻值',
          '④ 双击开关通断',
          '⑤ 右键删除',
          '⑥ 接成串联电路',
        ]
        for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], bx + 10, by + 40 + i * 15)
      }
      ctx.textBaseline = 'alphabetic'
    }
  }

  function drawPalette(ctx, x, y, w, h) {
    const s = S.current
    ctx.fillStyle = '#fafafa'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('电学器材', x + w / 2, y + 10)

    const items = [
      { type: 'battery', name: '电源' },
      { type: 'switch', name: '开关' },
      { type: 'rheostat', name: '滑动变阻器' },
      { type: 'ammeter', name: '电流表 A' },
      { type: 'heater', name: '电阻丝 10Ω' },
      { type: 'heater20', name: '电阻丝 20Ω' },
    ]
    const itemH = 34
    for (let i = 0; i < items.length; i++) {
      const iy = y + 35 + i * (itemH + 4)
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ccc'
      ctx.beginPath(); ctx.roundRect(x + 8, iy, w - 16, itemH, 5); ctx.fill(); ctx.stroke()
      drawPaletteIcon(ctx, x + 20, iy + itemH / 2, items[i].type)
      ctx.fillStyle = '#333'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText(items[i].name, x + 38, iy + itemH / 2)
      canvasRef.current._palAreas.push({ x: x + 8, y: iy, w: w - 16, h: itemH, type: items[i].type })
    }
    ctx.fillStyle = '#666'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('导线颜色：', x + 10, y + 35 + items.length * (itemH + 4) + 5)
    const colors = [['#F44336', '红'], ['#FFC107', '黄'], ['#4CAF50', '绿']]
    for (let i = 0; i < 3; i++) {
      const cy = y + 35 + items.length * (itemH + 4) + 22 + i * 22
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
    } else if (type === 'rheostat') {
      ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'
      ctx.fillRect(-10, -4, 20, 8); ctx.strokeRect(-10, -4, 20, 8)
      ctx.strokeStyle = '#FF6F00'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(4, -10); ctx.stroke()
    } else if (type === 'ammeter') {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('A', 0, 2)
    } else if (type === 'heater' || type === 'heater20') {
      ctx.strokeStyle = '#D32F2F'; ctx.lineWidth = 2
      ctx.beginPath();
      for (let s2 = 0; s2 < 4; s2++) {
        ctx.moveTo(-8 + s2 * 5, -3); ctx.lineTo(-6 + s2 * 5, 3); ctx.lineTo(-4 + s2 * 5, -3)
      }
      ctx.stroke()
    }
    ctx.restore()
  }

  function getTermPos(comp, portIndex) {
    if (comp.type === 'battery') return { x: comp.x + (portIndex === 0 ? -18 : 18), y: comp.y }
    if (comp.type === 'switch') return { x: comp.x + (portIndex === 0 ? -15 : 15), y: comp.y }
    if (comp.type === 'rheostat') return { x: comp.x + (portIndex === 0 ? -25 : 25), y: comp.y }
    if (comp.type === 'ammeter') return { x: comp.x + (portIndex === 0 ? -16 : 16), y: comp.y }
    if (comp.type === 'heater' || comp.type === 'heater20') return { x: comp.x + (portIndex === 0 ? -12 : 12), y: comp.y }
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
    } else if (comp.type === 'rheostat') {
      ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'
      ctx.beginPath(); ctx.roundRect(-25, -10, 50, 20, 3); ctx.fill(); ctx.stroke()
      const Rv = comp.props?.resistance ?? 20
      const ratio = Rv / 50
      const sx = -25 + ratio * 50
      ctx.strokeStyle = '#FF6F00'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(sx, -10); ctx.lineTo(sx + 8, -22); ctx.stroke()
      ctx.lineCap = 'butt'
      ctx.fillStyle = '#333'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(Rv + 'Ω', 0, 14)
    } else if (comp.type === 'ammeter') {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('A', 0, 2)
    } else if (comp.type === 'heater' || comp.type === 'heater20') {
      const Rval = comp.type === 'heater' ? 10 : 20
      ctx.strokeStyle = '#D32F2F'; ctx.lineWidth = 2.5
      ctx.beginPath()
      for (let s2 = 0; s2 < 5; s2++) {
        ctx.moveTo(-12 + s2 * 6, -5); ctx.lineTo(-9 + s2 * 6, 5); ctx.lineTo(-6 + s2 * 6, -5)
      }
      ctx.stroke()
      ctx.fillStyle = '#333'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText(Rval + 'Ω', 0, 16)
    }
    ctx.restore()
    ctx.fillStyle = '#333'
    const p0 = getTermPos(comp, 0), p1 = getTermPos(comp, 1)
    ctx.beginPath(); ctx.arc(p0.x, p0.y, 3.5, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(p1.x, p1.y, 3.5, 0, Math.PI * 2); ctx.fill()
  }

  function solveBuilder() {
    const s = S.current
    if (s.components.length === 0) return { ok: false, reason: '画布是空的' }
    const batteries = s.components.filter(c => c.type === 'battery')
    if (batteries.length === 0) return { ok: false, reason: '需要电源' }
    const hasLoad = s.components.some(c => c.type === 'heater' || c.type === 'heater20' || c.type === 'rheostat')
    if (!hasLoad) return { ok: false, reason: '需要电阻丝' }
    return { ok: true, reason: '电路已接好' }
  }

  function findTerm(x, y) {
    const s = S.current
    for (const comp of s.components) {
      for (let i = 0; i < 2; i++) {
        const p = getTermPos(comp, i)
        if ((x - p.x) ** 2 + (y - p.y) ** 2 < 100) return { compId: comp.id, portIndex: i }
      }
    }
    return null
  }

  // 事件
  function getPos(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  function handleMouseDown(e) {
    if (e.button !== 0) return
    const s = S.current; const { x, y } = getPos(e)
    if (s.tab === 1) {
      for (const a of canvasRef.current._clickAreas) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(x, y); return } }
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
          const props = {}
          if (a.type === 'rheostat') props.resistance = 20
          s.components.push({ id, type: a.type, x, y, closed: a.type === 'switch' ? false : true, props })
          s.dragId = id; forceUpdate(n => n + 1); return
        }
      }
    }
    for (const comp of s.components) {
      if (comp.type !== 'rheostat') continue
      const Rv = (comp.props?.resistance != null) ? comp.props.resistance : 20
      const sliderX = comp.x - 25 + (Rv / 50) * 50
      if (Math.abs(x - sliderX) < 12 && Math.abs(y - (comp.y - 16)) < 15) {
        s.dragId = 'rheo_' + comp.id; forceUpdate(n => n + 1); return
      }
    }
    const term = findTerm(x, y)
    if (term) { s.connecting = { ...term, mx: x, my: y }; forceUpdate(n => n + 1); return }
    for (const comp of s.components) {
      if (Math.abs(x - comp.x) < 25 && Math.abs(y - comp.y) < 25) {
        s.dragId = comp.id; s.dragOffX = x - comp.x; s.dragOffY = y - comp.y; forceUpdate(n => n + 1); return
      }
    }
  }
  function handleMouseMove(e) {
    const s = S.current; const { x, y } = getPos(e)
    if (s.connecting) { s.connecting.mx = x; s.connecting.my = y; forceUpdate(n => n + 1); return }
    if (s.dragId == null) return
    if (typeof s.dragId === 'string' && s.dragId.startsWith('rheo_')) {
      const id = parseInt(s.dragId.split('_')[1])
      const comp = s.components.find(c => c.id === id)
      if (comp) {
        const ratio = Math.max(0, Math.min(1, (x - (comp.x - 25)) / 50))
        comp.props.resistance = Math.round(ratio * 50)
        forceUpdate(n => n + 1)
      }
      return
    }
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
        if (!exists) s.wires.push({ id: s.wires.length + 1, from: { ...s.connecting }, to: term })
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
    const idx = s.components.findIndex(c => Math.abs(x - c.x) < 25 && Math.abs(y - c.y) < 25)
    if (idx >= 0) {
      const id = s.components[idx].id
      s.components.splice(idx, 1)
      s.wires = s.wires.filter(w => w.from.compId !== id && w.to.compId !== id)
      forceUpdate(n => n + 1)
    }
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px', background: '#fff', borderBottom: '1px solid #e0e0e0', alignItems: 'center' }}>
        <button onClick={() => { S.current.tab = 1; setTab(1); forceUpdate(n => n + 1) }} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #ddd', background: tab === 1 ? '#1976D2' : '#fff', color: tab === 1 ? '#fff' : '#333', cursor: 'pointer' }}>
          📊 实验演示
        </button>
        <button onClick={() => { S.current.tab = 2; setTab(2); forceUpdate(n => n + 1) }} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #ddd', background: tab === 2 ? '#1976D2' : '#fff', color: tab === 2 ? '#fff' : '#333', cursor: 'pointer' }}>
          🔧 自己动手
        </button>
        <button onClick={() => {
          S.current.elapsed = 0; S.current.temps = [20, 20]
          S.current.records = []; S.current.switchClosed = false
          forceUpdate(n => n + 1)
        }} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', color: '#666', cursor: 'pointer' }}>
          ↺ 重置
        </button>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
        />
      </div>
    </div>
  )
}
