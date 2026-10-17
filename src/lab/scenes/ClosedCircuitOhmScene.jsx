import { useState, useRef, useEffect } from 'react'
import { eventToCanvas } from '../utils/pointerPos'
import SceneShell from '../ui/SceneShell'
import InfoDock from '../ui/InfoDock'
import { fitLayout } from '../ui/canvasLayout'
import {
  strokeBezierWire, strokeWirePreview,
} from '../ui/circuitKit'

/**
 * ClosedCircuitOhmScene — 闭合电路欧姆定律
 *
 * ε = U + U' = IR + Ir = I(R+r)
 * 路端电压 U = ε - Ir（随 I 增大而减小）
 *
 * Step1: 基本概念 — 闭合电路中电动势 = 内压降 + 路端电压
 * Step2: U-I 关系 — 调节外阻 R，观测 U = ε - Ir 的线性关系
 * Step3: 作图分析 — 记录多组数据，绘制 U-I 图像，求 ε 和 r
 */
export default function ClosedCircuitOhmScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    step: 1,
    switchClosed: false,
    emf: 12,           // ε 电动势
    internalR: 1.0,    // r 内阻
    loadR: 5,          // R 外阻
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

    const loop = () => { render(R); animRef.current = requestAnimationFrame(loop) }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  // 物理量
  function circuitInfo(s) {
    const totalR = s.loadR + s.internalR
    const I = s.switchClosed ? s.emf / totalR : 0
    const U = s.switchClosed ? s.emf - I * s.internalR : s.emf
    const Uinner = s.switchClosed ? I * s.internalR : 0
    const P = I * U
    const Ptotal = s.switchClosed ? s.emf * I : 0
    return { I, U, Uinner, P, Ptotal, totalR }
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
    const info = circuitInfo(s)

    // 顶部步骤标签
    const labels = ['① 基本概念', '② U-I 关系', '③ 作图分析']
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
          S.current.switchClosed = false
          setStep(i + 1)
          forceUpdate(n => n + 1)
        }
      })
    }
    ctx.textBaseline = 'alphabetic'

    const subs = {
      1: '闭合电路中，电动势 ε = 内压降 U\' + 路端电压 U',
      2: '调外阻 R 改变电流 I，观测 U = ε - Ir 的线性变化',
      3: '记录多组 U、I 数据，作 U-I 图像，截距 = ε，斜率 = -r',
    }
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(subs[s.step], W / 2, 52)
    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('🎯 实验目的：理解闭合电路欧姆定律 ε=I(R+r)，掌握路端电压与电流关系', W / 2, 70)

    // ─── 电路图（fitLayout 左侧）───
    const lay = fitLayout(W, H)
    const cx = (lay.circuit.L + lay.circuit.R) / 2
    const cy = (lay.circuit.T + lay.circuit.B) / 2
    drawCircuit(ctx, cx, cy, s, info)

    // ─── U-I 图像（右侧）───
    if (s.step >= 2) {
      const gx = lay.readout.x, gy = lay.readout.y, gw = lay.readout.w, gh = lay.readout.h * 0.55
      drawUIGraph(ctx, gx, gy, gw, gh, s, info)
    }

    // ─── 参数调节（底部）───
    const barY = H - 26
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'

    ctx.fillStyle = '#E53935'; ctx.fillText(`ε=${s.emf}V`, 55, barY)
    drawMiniSlider(ctx, 95, barY, 70, (s.emf - 3) / 21, (r) => {
      S.current.emf = Math.round(3 + r * 21); forceUpdate(n => n + 1)
    })

    ctx.fillStyle = '#FF9800'; ctx.fillText(`r=${s.internalR.toFixed(1)}Ω`, 180, barY)
    drawMiniSlider(ctx, 230, barY, 70, (s.internalR - 0.1) / 4.9, (r) => {
      S.current.internalR = Math.round((0.1 + r * 4.9) * 10) / 10; forceUpdate(n => n + 1)
    })

    ctx.fillStyle = '#4CAF50'; ctx.fillText(`R=${s.loadR.toFixed(1)}Ω`, 315, barY)
    drawMiniSlider(ctx, 365, barY, 80, (s.loadR - 0.5) / 49.5, (r) => {
      S.current.loadR = Math.round((0.5 + r * 49.5) * 2) / 2; forceUpdate(n => n + 1)
    })

    ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText(`I=${info.I.toFixed(2)}A  U=${info.U.toFixed(2)}V`, 465, barY)
    ctx.textBaseline = 'alphabetic'

    // 右侧面板（fitLayout）
    drawRightPanel(ctx, lay.readout.x, lay.readout.y + (s.step >= 2 ? lay.readout.h * 0.55 + 8 : 0), lay.readout.w, lay.readout.h * (s.step >= 2 ? 0.4 : 0.9), s, info)
  }

  // ─── 电路图 ───
  function drawCircuit(ctx, cx, cy, s, info) {
    const on = s.switchClosed
    const wc = on ? '#1565C0' : '#999'

    // 电源（矩形，标 ε、r）
    const battW = 40, battH = 70
    ctx.fillStyle = on ? '#E8F5E9' : '#f5f5f5'; ctx.strokeStyle = '#666'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(cx - 140, cy - battH / 2, battW, battH, 4); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('ε', cx - 120, cy - 14)
    ctx.fillStyle = '#666'; ctx.font = '10px sans-serif'
    ctx.fillText(s.emf + 'V', cx - 120, cy)
    ctx.fillText('r=' + s.internalR + 'Ω', cx - 120, cy + 16)

    // 外电阻 R（矩形）
    const rW = 50, rH = 30
    ctx.fillStyle = on ? '#FFF9C4' : '#f5f5f5'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(cx + 30, cy - rH / 2 - 50, rW, rH, 4); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('R=' + s.loadR + 'Ω', cx + 55, cy - 50)

    // 开关
    const swX = cx + 100, swY = cy + 60
    ctx.fillStyle = '#666'
    ctx.beginPath(); ctx.arc(swX - 12, swY, 4, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(swX + 12, swY, 4, 0, Math.PI * 2); ctx.fill()
    if (on) {
      ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 3; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(swX - 12, swY); ctx.lineTo(swX + 12, swY); ctx.stroke()
    } else {
      ctx.strokeStyle = '#F44336'; ctx.lineWidth = 3; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(swX - 12, swY); ctx.lineTo(swX + 4, swY - 14); ctx.stroke()
    }
    ctx.lineCap = 'butt'
    canvasRef.current._clickAreas.push({ x: swX - 18, y: swY - 22, w: 36, h: 30,
      onClick: () => { S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1) }
    })

    // 导线
    ctx.strokeStyle = wc; ctx.lineWidth = 2; ctx.lineCap = 'round'
    // 电源正极 → R
    ctx.beginPath(); ctx.moveTo(cx - 100, cy - battH / 2); ctx.lineTo(cx - 100, cy - 65)
    ctx.lineTo(cx + 55, cy - 65); ctx.stroke()
    // R → 开关
    ctx.beginPath(); ctx.moveTo(cx + 55, cy - 65 + rH); ctx.lineTo(cx + 55, cy + 45)
    ctx.lineTo(swX, swY); ctx.stroke()
    // 开关 → 电源负极
    ctx.beginPath(); ctx.moveTo(swX + 12, swY); ctx.lineTo(cx - 100, swY)
    ctx.lineTo(cx - 100, cy + battH / 2); ctx.stroke()
    ctx.lineCap = 'butt'

    // 电流方向动画
    if (on && info.I > 0) {
      const path = [
        { x: cx - 100, y: cy - battH / 2 },
        { x: cx - 100, y: cy - 65 },
        { x: cx + 55, y: cy - 65 },
        { x: cx + 55, y: cy - 65 + rH },
        { x: cx + 55, y: cy + 45 },
        { x: swX, y: swY },
        { x: swX + 12, y: swY },
        { x: cx - 100, y: swY },
        { x: cx - 100, y: cy + battH / 2 },
      ]
      drawCurrentFlow(ctx, path)
    }

    // 标注
    ctx.fillStyle = '#5D4037'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('闭合电路', cx - 20, cy + 80)
    if (on) {
      ctx.fillStyle = '#1565C0'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText(`ε=${info.U.toFixed(1)}+${info.Uinner.toFixed(1)}=${s.emf}V`, cx - 20, cy + 96)
    }
    ctx.textBaseline = 'alphabetic'
  }

  // ─── U-I 图像 ───
  function drawUIGraph(ctx, gx, gy, gw, gh, s, info) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ddd'
    ctx.beginPath(); ctx.roundRect(gx - 5, gy - 5, gw + 10, gh + 10, 6); ctx.fill(); ctx.stroke()

    const margin = { top: 20, right: 15, bottom: 35, left: 40 }
    const pw = gw - margin.left - margin.right
    const ph = gh - margin.top - margin.bottom
    const ox = gx + margin.left, oy = gy + margin.top

    // 轴
    ctx.strokeStyle = '#999'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, oy + ph); ctx.lineTo(ox + pw, oy + ph); ctx.stroke()

    // 轴标签
    ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('I (A)', ox + pw / 2, gy + gh - 5)
    ctx.save(); ctx.translate(gx + 8, oy + ph / 2); ctx.rotate(-Math.PI / 2)
    ctx.fillText('U (V)', 0, 0); ctx.restore()

    // 范围
    const iMax = s.emf / s.internalR * 1.1
    const uMax = s.emf * 1.1
    const toX = i => ox + (i / iMax) * pw
    const toY = u => oy + ph - (u / uMax) * ph

    // 网格
    ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 0.8
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#999'
    ctx.textAlign = 'center'
    for (let i = 0; i <= 4; i++) {
      const v = iMax * i / 4
      ctx.fillText(v.toFixed(1), toX(v), oy + ph + 14)
      ctx.beginPath(); ctx.moveTo(toX(v), oy); ctx.lineTo(toX(v), oy + ph); ctx.stroke()
    }
    ctx.textAlign = 'right'
    for (let i = 0; i <= 4; i++) {
      const v = uMax * i / 4
      ctx.fillText(v.toFixed(1), ox - 5, toY(v) + 3)
      ctx.beginPath(); ctx.moveTo(ox, toY(v)); ctx.lineTo(ox + pw, toY(v)); ctx.stroke()
    }

    // U = ε - Ir 直线
    ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(toX(0), toY(s.emf))
    ctx.lineTo(toX(s.emf / s.internalR), toY(0))
    ctx.stroke()
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('U = ε - Ir', toX(0) + 6, toY(s.emf) - 6)

    // 截距标注
    ctx.fillStyle = '#E53935'; ctx.font = '9px sans-serif'
    ctx.fillText(`ε=${s.emf}`, toX(0) + 4, toY(s.emf) + 12)
    ctx.fillStyle = '#FF9800'
    ctx.fillText(`I_max=${(s.emf / s.internalR).toFixed(1)}`, toX(s.emf / s.internalR) - 50, oy + ph + 26)

    // 记录点
    for (const r of s.records) {
      ctx.fillStyle = 'rgba(21,101,192,0.25)'
      ctx.beginPath(); ctx.arc(toX(r.I), toY(r.U), 4, 0, Math.PI * 2); ctx.fill()
    }

    // 当前工作点（闪烁）
    if (s.switchClosed) {
      const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 300)
      ctx.fillStyle = `rgba(21,101,192,${pulse})`
      ctx.beginPath(); ctx.arc(toX(info.I), toY(info.U), 7, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke()
      ctx.fillStyle = '#1565C0'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText(`(${info.I.toFixed(2)}, ${info.U.toFixed(2)})`, toX(info.I) + 10, toY(info.U) - 4)
    }
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

  // ─── 右侧面板 ───
  function drawRightPanel(ctx, x, y, w, h, s, info) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('🎯 闭合电路欧姆定律', x + 12, y + 12)

    // 公式
    ctx.fillStyle = '#FF6F00'; ctx.font = 'bold 11px sans-serif'
    ctx.fillText('ε = U + U\' = I(R + r)', x + 12, y + 32)
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444'
    ctx.fillText(`ε = ${info.U.toFixed(2)} + ${info.Uinner.toFixed(2)} = ${s.emf} V`, x + 12, y + 50)
    ctx.fillText(`I = ε/(R+r) = ${s.emf}/(${s.loadR}+${s.internalR}) = ${info.I.toFixed(2)} A`, x + 12, y + 66)
    ctx.fillText(`P外 = IU = ${info.P.toFixed(2)} W    P总 = Iε = ${info.Ptotal.toFixed(2)} W`, x + 12, y + 82)

    // 操作步骤
    let ky = y + 102
    const guideSteps = s.step === 1
      ? ['① 闭合开关，电路工作', '② 观察 I、U、U\' 关系', '③ 结论：ε = U + U\'']
      : s.step === 2
        ? ['① 拖动 R 滑条改变外阻', '② 观察 U = ε - Ir 随 I 变化', '③ R↑→I↓→U↑，R↓→I↑→U↓', '④ 结论：U = ε - Ir（线性）']
        : ['① 改变 R，记录多组 U、I', '② 点"记录"保存数据', '③ 观察 U-I 图像中的数据点', '④ 截距=ε，斜率=-r']
    ctx.fillStyle = '#5D4037'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('📋 操作步骤', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#5D4037'
    for (let i = 0; i < guideSteps.length; i++) ctx.fillText(guideSteps[i], x + 12, ky + i * 12)
    ky += guideSteps.length * 12 + 6

    // 注意事项
    ctx.fillStyle = '#C62828'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('⚠ 注意事项', x + 12, ky); ky += 14
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#B71C1C'
    const notes = s.step === 1
      ? ['• 外电路：电流从正极经R到负极', '• 内电路：电流从负极经电源内部到正极', '• 电动势≠路端电压（有内阻压降）']
      : s.step === 2
        ? ['• 外阻 R 不变时，U 与 I 成线性关系', '• 断路时 I=0，U=ε', '• 短路时 R=0，I=ε/r（很大，危险！）']
        : ['• 数据点应均匀分布在直线上', '• 用截距法求 ε，斜率法求 r', '• 保护电阻防止短路']
    for (let i = 0; i < notes.length; i++) ctx.fillText(notes[i], x + 12, ky + i * 12)
    ky += notes.length * 12 + 6

    // 数据表
    if (s.records.length > 0) {
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'
      ctx.fillText('📊 U-I 数据', x + 12, ky); ky += 14
      ctx.fillStyle = '#FFB74D'
      ctx.fillRect(x + 12, ky, w - 24, 16)
      ctx.fillStyle = '#333'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      const c1 = x + 28, c2 = x + 70, c3 = x + 115
      ctx.fillText('序号', c1, ky + 2); ctx.fillText('I(A)', c2, ky + 2); ctx.fillText('U(V)', c3, ky + 2)
      ky += 14
      for (let i = 0; i < s.records.length; i++) {
        const r = s.records[i]
        if (i % 2 === 0) { ctx.fillStyle = '#FFF8E1'; ctx.fillRect(x + 12, ky, w - 24, 13) }
        ctx.fillStyle = '#333'; ctx.font = '9px monospace'; ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), c1, ky + 1); ctx.fillText(r.I.toFixed(2), c2, ky + 1); ctx.fillText(r.U.toFixed(2), c3, ky + 1)
        ky += 13
      }
      ctx.textAlign = 'left'
    }

    // 按钮
    const btnY = y + h - 38
    const btnW = 62, btnH = 24, gap = 6
    const bx = x + 12
    ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'
    ctx.beginPath(); ctx.roundRect(bx, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('📝 记录', bx + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({
      x: bx, y: btnY, w: btnW, h: btnH,
      onClick: () => { const s2 = S.current; const inf = circuitInfo(s2); s2.records.push({ I: inf.I, U: inf.U }); forceUpdate(n => n + 1) }
    })
    ctx.fillStyle = '#FF9800'; ctx.strokeStyle = '#E65100'
    ctx.beginPath(); ctx.roundRect(bx + btnW + gap, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.fillText('🗑 清除', bx + btnW + gap + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({ x: bx + btnW + gap, y: btnY, w: btnW, h: btnH, onClick: () => { S.current.records = []; forceUpdate(n => n + 1) } })
    ctx.fillStyle = '#9E9E9E'; ctx.strokeStyle = '#616161'
    ctx.beginPath(); ctx.roundRect(bx + (btnW + gap) * 2, btnY, btnW, btnH, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.fillText('↺ 重置', bx + (btnW + gap) * 2 + btnW / 2, btnY + 7)
    canvasRef.current._clickAreas.push({
      x: bx + (btnW + gap) * 2, y: btnY, w: btnW, h: btnH,
      onClick: () => { S.current.emf = 12; S.current.internalR = 1; S.current.loadR = 5; S.current.records = []; S.current.switchClosed = false; forceUpdate(n => n + 1) }
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
      // 三次贝塞尔：从接线柱水平出线
      strokeBezierWire(ctx, p1, p2, wire.color || s.wireColor, null, null, wire.from.portIndex, wire.to.portIndex)
    }
    if (s.connecting) {
      const c1 = s.components.find(c => c.id === s.connecting.compId)
      if (c1) {
        const p1 = getTermPos(c1, s.connecting.portIndex)
        strokeWirePreview(ctx, p1, { x: s.connecting.mx, y: s.connecting.my }, '#FF9800', s.connecting.portIndex)
      }
    }

    for (const comp of s.components) drawComp(ctx, comp)

    // 操作说明
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
      const lines = ['① 拖入器材到画布', '② 点击接线柱连线', '③ 双击开关通断', '④ 右键删除器材', '⑤ 观察电流表和电压表读数']
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
      { type: 'battery', name: '电源（含内阻）' },
      { type: 'switch', name: '开关' },
      { type: 'ammeter', name: '电流表 A' },
      { type: 'voltmeter', name: '电压表 V' },
      { type: 'rheostat', name: '滑动变阻器' },
      { type: 'resistor', name: '定值电阻' },
      { type: 'bulb', name: '小灯泡（干扰）' },
      { type: 'wire3d', name: '导线若干' },
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
    ctx.fillText('导线颜色：', x + 10, palColorBase + 2)
    const colors = [['#F44336', '红'], ['#FFC107', '黄'], ['#4CAF50', '绿']]
    for (let i = 0; i < 3; i++) {
      const cy = palColorBase + 18 + i * 20
      ctx.fillStyle = colors[i][0]; ctx.fillRect(x + 10, cy, 36, 14)
      ctx.strokeStyle = s.wireColor === colors[i][0] ? '#333' : '#ccc'; ctx.strokeRect(x + 10, cy, 36, 14)
      ctx.fillStyle = '#333'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'
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
    } else if (type === 'ammeter') {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('A', 0, 2)
    } else if (type === 'voltmeter') {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#1565C0'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('V', 0, 2)
    } else if (type === 'rheostat') {
      ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'
      ctx.fillRect(-10, -4, 20, 8); ctx.strokeRect(-10, -4, 20, 8)
      ctx.strokeStyle = '#FF6F00'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(4, -10); ctx.stroke()
    } else if (type === 'resistor') {
      ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'
      ctx.fillRect(-9, -4, 18, 8); ctx.strokeRect(-9, -4, 18, 8)
    } else if (type === 'bulb') {
      ctx.fillStyle = '#FFF9C4'; ctx.strokeStyle = '#F9A825'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(0, -1, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    } else if (type === 'wire3d') {
      ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(10, 0); ctx.stroke()
    }
    ctx.restore()
  }

  function getTermPos(comp, portIndex) {
    if (comp.type === 'battery') return { x: comp.x + (portIndex === 0 ? -18 : 18), y: comp.y }
    if (comp.type === 'switch') return { x: comp.x + (portIndex === 0 ? -15 : 15), y: comp.y }
    if (comp.type === 'ammeter') return { x: comp.x + (portIndex === 0 ? -16 : 16), y: comp.y }
    if (comp.type === 'voltmeter') return { x: comp.x + (portIndex === 0 ? -16 : 16), y: comp.y }
    if (comp.type === 'rheostat') return { x: comp.x + (portIndex === 0 ? -25 : 25), y: comp.y }
    if (comp.type === 'resistor') return { x: comp.x + (portIndex === 0 ? -14 : 14), y: comp.y }
    if (comp.type === 'bulb') return { x: comp.x + (portIndex === 0 ? -14 : 14), y: comp.y }
    if (comp.type === 'wire3d') return { x: comp.x + (portIndex === 0 ? -16 : 16), y: comp.y }
    return { x: comp.x, y: comp.y }
  }

  function drawComp(ctx, comp) {
    ctx.save(); ctx.translate(comp.x, comp.y)
    if (comp.type === 'battery') {
      ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'
      ctx.beginPath(); ctx.roundRect(-18, -11, 36, 22, 3); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('12V', 0, 3)
    } else if (comp.type === 'switch') {
      ctx.strokeStyle = comp.closed ? '#4CAF50' : '#F44336'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(10, comp.closed ? 0 : -10); ctx.stroke()
      ctx.lineCap = 'butt'
      ctx.fillStyle = '#333'
      ctx.beginPath(); ctx.arc(-15, 0, 3, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(15, 0, 3, 0, Math.PI * 2); ctx.fill()
    } else if (comp.type === 'ammeter') {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('A', 0, 0)
    } else if (comp.type === 'voltmeter') {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#1565C0'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('V', 0, 0)
    } else if (comp.type === 'rheostat') {
      ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'
      ctx.beginPath(); ctx.roundRect(-25, -10, 50, 20, 3); ctx.fill(); ctx.stroke()
      const Rv = comp.props?.resistance ?? 20
      const sliderX = -25 + (Rv / 50) * 50
      ctx.fillStyle = '#FF6F00'
      ctx.beginPath(); ctx.moveTo(sliderX, -14); ctx.lineTo(sliderX - 4, -8); ctx.lineTo(sliderX + 4, -8); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#5D4037'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(Rv + 'Ω', 0, 20)
    } else if (comp.type === 'resistor') {
      ctx.fillStyle = '#D7CCC8'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.roundRect(-14, -8, 28, 16, 3); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#333'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('10Ω', 0, 0)
    } else if (comp.type === 'bulb') {
      ctx.fillStyle = '#FFF9C4'; ctx.strokeStyle = '#F9A825'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.strokeStyle = '#F9A825'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(-6, 6); ctx.lineTo(6, -6); ctx.stroke()
    } else if (comp.type === 'wire3d') {
      ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 3; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(16, 0); ctx.stroke()
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
        if (Math.abs(x - t.x) < 10 && Math.abs(y - t.y) < 10) return { compId: comp.id, portIndex: i }
      }
    }
    return null
  }

  function handleMouseDown(e) {
    if (e.button !== 0) return
    const s = S.current; const { x, y } = getPos(e)
    if (s.tab === 1) {
      for (const a of canvasRef.current._clickAreas) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(x, y); return } }
      return
    }
    for (const a of canvasRef.current._clickAreas || []) { if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(); return } }
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
    const term = findTerm(x, y)
    if (term) { s.connecting = { ...term, mx: x, my: y }; forceUpdate(n => n + 1); return }
    for (const comp of s.components) {
      if (Math.abs(x - comp.x) < 30 && Math.abs(y - comp.y) < 25) {
        s.dragId = comp.id; s.dragOffX = x - comp.x; s.dragOffY = y - comp.y
        s.dragMoved = false; s.dragStart = { x, y }
        forceUpdate(n => n + 1); return
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
      if (comp) { const ratio = Math.max(0, Math.min(1, (x - (comp.x - 25)) / 50)); comp.props.resistance = Math.round(ratio * 50); forceUpdate(n => n + 1) }
      return
    }
    const comp = s.components.find(c => c.id === s.dragId)
    if (comp) {
      if (s.dragStart && Math.hypot(x - s.dragStart.x, y - s.dragStart.y) > 5) s.dragMoved = true
      comp.x = x - s.dragOffX; comp.y = y - s.dragOffY
      forceUpdate(n => n + 1)
    }
  }
  function handleMouseUp(e) {
    const s = S.current; const { x, y } = getPos(e)
    if (e) {
      try { s._lastUpPos = getPos(e) } catch (_) { s._lastUpPos = null }
    }
    // 自记双击删除
    const now = performance.now()
    const upPos = s._lastUpPos
    if (upPos) {
      const isDouble = s._lastUpT && (now - s._lastUpT) < 350
        && s._lastUpPrev
        && Math.hypot(upPos.x - s._lastUpPrev.x, upPos.y - s._lastUpPrev.y) < 28
      if (isDouble && !s.dragMoved) {
        let comp = s.components.find(c => Math.abs(upPos.x - c.x) < 52 && Math.abs(upPos.y - c.y) < 40)
        if (comp) {
          s.components = s.components.filter(k => k.id !== comp.id)
          s.wires = s.wires.filter(w => w.from.compId !== comp.id && w.to.compId !== comp.id)
          s.dragId = null; s.connecting = null
          s._lastUpT = 0; s._lastUpPrev = null
          forceUpdate(n => n + 1)
          return
        }
      }
      s._lastUpPrev = upPos
      s._lastUpT = now
    }
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
    // 轻点开关：切换通断
    if (s.dragId != null && !s.dragMoved) {
      const comp = s.components.find(c => c.id === s.dragId)
      if (comp && comp.type === 'switch') {
        comp.closed = !comp.closed
        s.dragId = null
        forceUpdate(n => n + 1)
        return
      }
    }
    s.dragId = null
    s.dragMoved = false
  }
  function handleDoubleClick(e) {
    e.preventDefault()
    const s = S.current; const { x, y } = getPos(e)
    // 双击删除
    const comp = s.components.find(c => Math.abs(x - c.x) < 52 && Math.abs(y - c.y) < 40)
    if (comp) {
      s.components = s.components.filter(k => k.id !== comp.id)
      s.wires = s.wires.filter(w => w.from.compId !== comp.id && w.to.compId !== comp.id)
      forceUpdate(n => n + 1)
    }
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
      title="闭合电路欧姆定律"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t); forceUpdate(n => n + 1) }}
      tab1Label="📖 实验演示"
      tab2Label="🔧 自己动手"
      onReset={() => {
        S.current.components = []; S.current.wires = []; S.current.switchClosed = false
        S.current.dragId = null; S.current.connecting = null; S.current.records = []
        forceUpdate(n => n + 1)
      }}
      desc={(
        <>
          <b>闭合电路欧姆定律</b>
          <span style={{ marginLeft: 12, color: '#555', fontSize: 12 }}>
            ε = I(R+r) · 路端电压 U = ε − Ir
          </span>
        </>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'row', flex: 1, minHeight: 0, width: '100%' }}>
        <canvas
          ref={canvasRef}
          className="canvas-fill"
          style={{ width: '100%', flex: 1, minHeight: 0, display: 'block', touchAction: 'none' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
        />
        <InfoDock
          purpose="理解闭合电路欧姆定律 ε=I(R+r)，掌握路端电压与电流关系。"
          steps={[
            '① 基本概念：ε = 内压降 U\' + 路端电压 U',
            '② 调外阻 R，观测 U = ε − Ir',
            '③ 记录多组 U、I，作 U-I 图求 ε 和 r',
          ]}
          hint="开关断开时 I=0，路端电压 U=ε。闭合后 U 随 I 增大而减小。"
        />
      </div>
    </SceneShell>
  )
}
