import { useState, useRef, useEffect, useCallback } from 'react'
import { eventToCanvas } from '../utils/pointerPos'
import SceneShell from '../ui/SceneShell'
import InfoDock from '../ui/InfoDock'
import BuilderPalette from '../ui/BuilderPalette'
import { fitLayout, drawPanel } from '../ui/canvasLayout'
import {
  getTerminals, getTermPos, findTermAt, findTermNear,
  strokeBezierWire, strokeWirePreview, bezierCtrl,
  drawStdBulb, drawTerminal, findCompAt, findCompWide,
} from '../ui/circuitKit'

/**
 * SimpleCircuitScene — 简单电路
 * Tab1: 电路演示 — 矩形回路 + 标准电路符号 + 开关通断
 * Tab2: 自己动手 — 实物风格器材 + 贝塞尔接线
 */

export default function SimpleCircuitScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    switchClosed: false,
    time: 0,
    components: [],
    wires: [],
    dragId: null,
    dragOffX: 0,
    dragOffY: 0,
    connecting: null,
    hoverTerm: null,
    nextId: 1,
    wireColor: '#F44336',
  })

  const [tab, setTab] = useState(1)
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const R = { canvas, ctx: canvas.getContext('2d'), W: 0, H: 0,
      resize() {
        const rect = { width: canvas.clientWidth, height: canvas.clientHeight }
        canvas.width = rect.width * devicePixelRatio
        canvas.height = rect.height * devicePixelRatio
        this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
        this.W = rect.width; this.H = rect.height
      },
    }
    R.resize(); canvasRef.current._R = R
    const loop = () => { S.current.time += 1 / 60; render(R); animRef.current = requestAnimationFrame(loop) }
    animRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', R.resize.bind(R))
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function render(R) {
    const ctx = R.ctx, W = R.W, H = R.H
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#f0f4f8'; ctx.fillRect(0, 0, W, H)
    canvasRef.current._clickAreas = []
    canvasRef.current._palAreas = []
    if (S.current.tab === 1) renderDemo(ctx, W, H)
    else renderBuilder(ctx, W, H)
  }

  // ================================================================
  //  Tab 1：电路演示（矩形回路，标准符号）
  // ================================================================
  function renderDemo(ctx, W, H) {
    const s = S.current
    const on = s.switchClosed
    const lay = fitLayout(W, H)

    // 矩形回路坐标（fitLayout 紧凑/宽裕自适应）
    const left = lay.circuit.L, right = lay.circuit.R
    const top = lay.circuit.T, bottom = lay.circuit.B
    const midX = (left + right) / 2

    // 电源位置（下边偏左）
    const battX = left + (right - left) * 0.3
    // 开关位置（下边偏右）
    const swX = left + (right - left) * 0.7

    const wc = on ? '#1565C0' : '#999'

    // ─── 导线：分段画，不穿过电源和开关 ───
    // 左边
    drawLine(ctx, left, top, left, bottom, wc, 2.5)
    // 上边（灯泡所在）
    drawLine(ctx, left, top, right, top, wc, 2.5)
    // 右边
    drawLine(ctx, right, top, right, bottom, wc, 2.5)
    // 下边左段：左下角 → 电源正极
    drawLine(ctx, left, bottom, battX - 12, bottom, wc, 2.5)
    // 下边中段：电源负极 → 开关左端
    drawLine(ctx, battX + 12, bottom, swX - 18, bottom, wc, 2.5)
    // 下边右段：开关右端 → 右下角
    drawLine(ctx, swX + 18, bottom, right, bottom, wc, 2.5)

    // 电流流动（电子方向：从负极出发，经外电路到正极）
    if (on) {
      // 电子从电源负极出发 → 开关 → 右下 → 右上 → 灯泡 → 左上 → 左下 → 回到电源正极
      const path = [
        { x: battX + 12, y: bottom }, // 电源负极
        { x: swX, y: bottom },
        { x: right, y: bottom },
        { x: right, y: top },
        { x: midX, y: top },
        { x: left, y: top },
        { x: left, y: bottom },
        { x: battX - 12, y: bottom }, // 回到电源正极
      ]
      drawCurrentFlow(ctx, path, s.time, 0.5)
    }

    // ─── 电源（标准符号：长线+短线，不相连）───
    drawStdBattery(ctx, battX, bottom)

    // ─── 开关（断开时无线连接）───
    drawStdSwitch(ctx, swX, bottom, on, () => {
      S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1)
    })

    // ─── 灯泡（小圆+×）───
    drawStdBulb(ctx, midX, top, on ? 1.0 : 0)

    // ─── 标注 ───
    ctx.fillStyle = '#555'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('电源', battX, bottom + 24)
    ctx.fillText(on ? '开关（闭合）' : '开关（断开）', swX, bottom + 24)
    ctx.fillText('灯泡', midX, top - 36)

    // 电流方向 I（红色短箭头，在电源长竖线左边电线上，向左）
    if (on) {
      const arrowY = bottom - 14
      // 短箭头
      ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(battX - 20, arrowY); ctx.lineTo(left + 40, arrowY); ctx.stroke(); ctx.lineCap = 'butt'
      // 箭头尖
      ctx.fillStyle = '#E53935'
      ctx.beginPath(); ctx.moveTo(left + 40, arrowY)
      ctx.lineTo(left + 50, arrowY - 5); ctx.lineTo(left + 50, arrowY + 5); ctx.closePath(); ctx.fill()
      // I 标签在箭头上方
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
      ctx.fillText('电流 I', (battX - 20 + left + 40) / 2, arrowY - 6)
      ctx.textBaseline = 'alphabetic'

      if (!lay.compact) {
        // 电子方向标记（黄色，与电子流动颜色一致）
        ctx.fillStyle = '#FFC107'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'
        ctx.fillText('e⁻→', (battX + 12 + swX) / 2, bottom - 8)
        ctx.fillText('e⁻→', (swX + right) / 2, bottom - 8)
        ctx.fillText('e⁻↑', right + 8, (top + bottom) / 2)
        ctx.fillText('←e⁻', midX, top + 8)
        ctx.fillText('e⁻↓', left - 12, (top + bottom) / 2)

        ctx.fillStyle = '#FFC107'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
        ctx.fillText('电子方向：−极 → +极（黄色标记）', midX, bottom + 70)
        ctx.fillStyle = '#E53935'
        ctx.fillText('电流 I：+极 → −极（红色箭头，与电子方向相反）', midX, bottom + 88)
      }
    }

    // ─── 说明/读数面板（fitLayout）───
    const ro = lay.readout
    const inner = drawPanel(ctx, ro, lay.compact ? null : '📖 简单电路知识')
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    let ky = inner.y
    const px = inner.x

    if (lay.compact) {
      // 手机：紧凑读数
      const Ub = on ? (s.U ?? 6) : 0
      ctx.font = `bold ${lay.font.data}px monospace`
      ctx.fillStyle = '#333'
      ctx.fillText(`U = ${Ub.toFixed(2)} V`, px, ky); ky += 18
      ctx.fillText(`I = ${on ? '通' : '0'} ${on ? '' : 'A'}`, px, ky); ky += 18
      ctx.fillStyle = on ? '#2E7D32' : '#888'
      ctx.font = `bold ${lay.font.body}px sans-serif`
      ctx.fillText(on ? '● 通路' : '○ 断路 U=0', px, ky); ky += 16
      ctx.fillStyle = '#888'
      ctx.font = `${lay.font.body}px sans-serif`
      ctx.fillText('开关常开，点开关通断', px, ky)
      ctx.textBaseline = 'alphabetic'
      return
    }

    ctx.font = '12px sans-serif'
    const knowledge = [
      { t: '电路组成', bold: true },
      { t: '电源、导线、用电器、开关' },
      { t: '' },
      { t: '电路状态', bold: true },
      { t: '通路：开关闭合，电路有电流' },
      { t: '断路：开关断开，无电流 U=0' },
      { t: '短路：导线直接连电源两极（危险！）' },
      { t: '' },
      { t: '电流方向', bold: true },
      { t: '电子从−极出发，经外电路回到+极' },
      { t: '电流方向与电子方向相反' },
      { t: '' },
      { t: '电路符号', bold: true },
      { t: '电源：长线(+)短线(−)' },
      { t: '灯泡：小圆圈内画×' },
      { t: '开关：断开/闭合两状态' },
      { t: '' },
      { t: '灯泡亮度', bold: true },
      { t: '闭合=亮，断开=灭（连续渐变）' },
    ]
    for (const item of knowledge) {
      if (!item.t) { ky += 6; continue }
      ctx.fillStyle = item.bold ? '#333' : '#555'
      ctx.font = item.bold ? 'bold 12px sans-serif' : '12px sans-serif'
      ctx.fillText(item.t, px, ky); ky += 20
    }
    if (on) {
      ky += 8
      ctx.fillStyle = '#1565C0'; ctx.font = 'bold 11px monospace'
      ctx.fillText(`灯泡端电压 U = ${(s.U ?? 6).toFixed(2)} V`, px, ky)
    }
    ctx.textBaseline = 'alphabetic'
  }

  // 标准电源符号：长线(+)和短线(−)，两线不相连
  function drawStdBattery(ctx, x, y) {
    ctx.strokeStyle = '#333'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(x - 12, y - 18); ctx.lineTo(x - 12, y + 18); ctx.stroke()
    ctx.lineWidth = 5
    ctx.beginPath(); ctx.moveTo(x + 12, y - 9); ctx.lineTo(x + 12, y + 9); ctx.stroke()
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText('+', x - 12, y - 20)
    ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'
    ctx.fillText('−', x + 12, y - 11)
    ctx.fillStyle = '#888'; ctx.font = '9px sans-serif'; ctx.textBaseline = 'top'
    ctx.textBaseline = 'alphabetic'
  }

  // 标准开关符号：断开时两头无连接线
  function drawStdSwitch(ctx, x, y, on, onClick) {
    ctx.fillStyle = '#666'
    ctx.beginPath(); ctx.arc(x - 18, y, 4, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(x + 18, y, 4, 0, Math.PI * 2); ctx.fill()
    if (on) {
      ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 3; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(x - 18, y); ctx.lineTo(x + 18, y); ctx.stroke(); ctx.lineCap = 'butt'
    } else {
      ctx.strokeStyle = '#F44336'; ctx.lineWidth = 3; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(x - 18, y); ctx.lineTo(x + 10, y - 20); ctx.stroke(); ctx.lineCap = 'butt'
    }
    ctx.fillStyle = on ? '#4CAF50' : '#F44336'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(on ? 'ON' : 'OFF', x, y + 8); ctx.textBaseline = 'alphabetic'
    canvasRef.current._clickAreas.push({ x: x - 25, y: y - 25, w: 50, h: 50, onClick })
  }

  // 标准灯泡符号：连续渐变（circuitKit）
  // drawStdBulb / bulbBrightness 从 circuitKit 导入

  function drawLine(ctx, x1, y1, x2, y2, color, w) {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
  }

  // 检查电路逻辑：用DFS检测是否存在闭合回路
  function checkCircuit() {
    const s = S.current
    const batteries = s.components.filter(c => c.type === 'battery')
    const switches_ = s.components.filter(c => c.type === 'switch')
    const bulbs = s.components.filter(c => c.type === 'bulb')

    if (batteries.length === 0 || bulbs.length === 0) return { closed: false, reason: '需要电源和灯泡' }

    // 建立邻接表（基于导线连接）
    const adj = {}
    for (const comp of s.components) adj[comp.id] = new Set()
    for (const wire of s.wires) {
      adj[wire.from.compId]?.add(wire.to.compId)
      adj[wire.to.compId]?.add(wire.from.compId)
    }

    // 检查每个器材是否至少有2个连接
    const allConnected = s.components.every(c => adj[c.id]?.size >= 2)
    if (!allConnected) return { closed: false, reason: '电路未闭合（有器材未连接）' }

    // DFS：从电源出发，能否回到电源
    const battery = batteries[0]
    const visited = new Set()
    let hasLoop = false
    function dfs(node, depth) {
      if (depth > 0 && node === battery.id) { hasLoop = true; return }
      if (visited.has(node) || depth > s.components.length) return
      visited.add(node)
      for (const next of adj[node] || []) dfs(next, depth + 1)
    }
    dfs(battery.id, 0)
    if (!hasLoop) return { closed: false, reason: '电路未形成闭合回路' }

    // 检查开关是否闭合
    for (const sw of switches_) {
      if (sw.closed === false) return { closed: false, reason: '开关断开' }
    }

    return { closed: true, reason: '电路正常，灯泡亮' }
  }

  function drawCurrentFlow(ctx, points, time, speed) {
    let totalLen = 0; const segs = []
    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1].x - points[i].x, dy = points[i + 1].y - points[i].y
      const len = Math.sqrt(dx * dx + dy * dy)
      segs.push({ ...points[i], ex: points[i + 1].x, ey: points[i + 1].y, len }); totalLen += len
    }
    ctx.fillStyle = '#FFEB3B'
    const n = Math.max(5, Math.floor(totalLen / 45))
    for (let d = 0; d < n; d++) {
      let pos = ((time * speed * 100 + d * (totalLen / n)) % totalLen)
      for (const seg of segs) {
        if (pos <= seg.len) {
          const r = pos / seg.len
          ctx.beginPath(); ctx.arc(seg.x + (seg.ex - seg.x) * r, seg.y + (seg.ey - seg.y) * r, 3, 0, Math.PI * 2); ctx.fill()
          break
        }
        pos -= seg.len
      }
    }
  }

  // ================================================================
  //  Tab 2：自己动手（实物风格器材）
  // ================================================================
  function renderBuilder(ctx, W, H) {
    const s = S.current
    // 画布铺满工作区；器材用底部 DOM 工具条（可横滑）
    const cvX = 10, cvY = 16, cvW = W - 20, cvH = H - 40

    // 画布
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(cvX, cvY, cvW, cvH, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(cvX, cvY, cvW, cvH, 8); ctx.stroke()
    ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 0.5
    for (let gx = cvX + 25; gx < cvX + cvW; gx += 25) { ctx.beginPath(); ctx.moveTo(gx, cvY); ctx.lineTo(gx, cvY + cvH); ctx.stroke() }
    for (let gy = cvY + 25; gy < cvY + cvH; gy += 25) { ctx.beginPath(); ctx.moveTo(cvX, gy); ctx.lineTo(cvX + cvW, gy); ctx.stroke() }

    // 导线
    for (const wire of s.wires) drawBuilderWire(ctx, wire)
    if (s.connecting) {
      const fc = s.components.find(c => c.id === s.connecting.compId)
      if (fc) {
        const ft = getTermPos(fc, s.connecting.termIdx)
        strokeWirePreview(ctx, ft, { x: s.connecting.mx, y: s.connecting.my }, s.wireColor, s.connecting.termIdx)
      }
    }

    // 器材（传入电路状态）
    const circuit = checkCircuit()
    for (const comp of s.components) drawBuilderComp(ctx, comp, s, circuit)

    // 电路状态提示
    ctx.fillStyle = circuit.closed ? '#4CAF50' : '#F44336'
    ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText(circuit.closed ? '✅ ' + circuit.reason : '❌ ' + circuit.reason, cvX + 12, cvY + cvH - 25)
    ctx.textBaseline = 'alphabetic'
  }

  // ─── 器材栏小图标（实物风格） ───
  function drawBuilderComp(ctx, comp, s, circuit) {
    const { x, y, type, rotation } = comp
    const dragging = s.dragId === comp.id
    const isClosed = circuit && circuit.closed

    ctx.save(); ctx.translate(x, y); ctx.rotate(rotation || 0)
    if (dragging) ctx.globalAlpha = 0.6

    if (type === 'battery') {
      // 电池实物：绿色外壳，长短线
      const grd = ctx.createLinearGradient(-35, -22, 35, 22)
      grd.addColorStop(0, '#A5D6A7'); grd.addColorStop(0.5, '#66BB6A'); grd.addColorStop(1, '#43A047')
      ctx.fillStyle = grd; ctx.strokeStyle = '#2E7D32'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.roundRect(-35, -22, 70, 44, 6); ctx.fill(); ctx.stroke()
      // 长线（正极板）
      ctx.strokeStyle = '#1B5E20'; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(-14, -16); ctx.lineTo(-14, 16); ctx.stroke()
      // 短线（负极板）
      ctx.lineWidth = 5
      ctx.beginPath(); ctx.moveTo(14, -8); ctx.lineTo(14, 8); ctx.stroke()
      // + − 号写在左右接线柱圆框上方
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
      ctx.fillText('+', -40, -24)
      ctx.fillStyle = '#333'; ctx.font = 'bold 15px sans-serif'
      ctx.fillText('−', 40, -16)
      ctx.textBaseline = 'alphabetic'
    } else if (type === 'bulb') {
      // 实物灯泡：连续渐变（闭合=亮）
      const brightness = isClosed ? 1.0 : 0
      ctx.fillStyle = brightness > 0.05 ? '#FFEB3B' : '#FFFDE7'
      ctx.strokeStyle = brightness > 0.05 ? '#F9A825' : '#bbb'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, -6, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.strokeStyle = brightness > 0.05 ? '#E65100' : '#999'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(-8, -14); ctx.lineTo(8, 2); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(8, -14); ctx.lineTo(-8, 2); ctx.stroke()
      ctx.fillStyle = '#9E9E9E'; ctx.strokeStyle = '#616161'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.roundRect(-10, 14, 20, 10, 2); ctx.fill(); ctx.stroke()
      // 发光效果（连续渐变）
      if (brightness > 0.05) {
        const glow = ctx.createRadialGradient(0, -6, 15, 0, -6, 50)
        glow.addColorStop(0, `rgba(255,235,59,${0.12 + 0.35 * brightness})`); glow.addColorStop(1, 'rgba(255,235,59,0)')
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, -6, 50, 0, Math.PI * 2); ctx.fill()
      }
      ctx.fillStyle = '#F57F17'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText('灯泡', 0, 26)
    } else if (type === 'switch') {
      const sw = comp.closed !== false
      // 实物开关
      ctx.fillStyle = '#ECEFF1'; ctx.strokeStyle = '#78909C'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.roundRect(-36, -16, 72, 32, 6); ctx.fill(); ctx.stroke()
      // 端点
      ctx.fillStyle = '#546E7A'; ctx.beginPath(); ctx.arc(-24, 0, 5, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(24, 0, 5, 0, Math.PI * 2); ctx.fill()
      // 触片
      if (sw) {
        ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(24, 0); ctx.stroke(); ctx.lineCap = 'butt'
      } else {
        ctx.strokeStyle = '#F44336'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(16, -18); ctx.stroke(); ctx.lineCap = 'butt'
      }
      ctx.fillStyle = sw ? '#4CAF50' : '#F44336'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText(sw ? 'ON' : 'OFF', 0, 18)
    } else if (type === 'resistor') {
      // 实物电阻：陶瓷体+色环
      ctx.fillStyle = '#EFEBE9'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.roundRect(-34, -14, 68, 28, 4); ctx.fill(); ctx.stroke()
      const bands = ['#B71C1C', '#43A047', '#FF6F00', '#FFD54F']
      bands.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(-24 + i * 15, -14, 8, 28) })
      ctx.fillStyle = '#333'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText('10Ω', 0, 16)
    }

    ctx.globalAlpha = 1; ctx.restore()

    // 接线柱：圆形热区
    const terms = getTerminals(comp)
    for (let i = 0; i < terms.length; i++) {
      const t = terms[i]
      const hov = s.hoverTerm && s.hoverTerm.compId === comp.id && s.hoverTerm.termIdx === i
      const src = s.connecting && s.connecting.compId === comp.id && s.connecting.termIdx === i
      drawTerminal(ctx, t, hov, src)
    }
  }

  function drawBuilderWire(ctx, wire) {
    const fc = S.current.components.find(c => c.id === wire.from.compId)
    const tc = S.current.components.find(c => c.id === wire.to.compId)
    if (!fc || !tc) return
    const f = getTermPos(fc, wire.from.termIdx), t = getTermPos(tc, wire.to.termIdx)
    strokeBezierWire(
      ctx, f, t, wire.color || '#1565C0',
      wire.mid1X != null ? { x: wire.mid1X, y: wire.mid1Y } : null,
      wire.mid2X != null ? { x: wire.mid2X, y: wire.mid2Y } : null,
      wire.from.termIdx, wire.to.termIdx
    )
  }

  // getTerminals / getTermPos / findTermAt / findCompAt 从 circuitKit 导入
  function findTerm(mx, my) {
    return findTermAt(S.current.components, mx, my)
  }
  function findComp(mx, my) {
    return findCompAt(S.current.components, mx, my)
  }

  // ================================================================
  //  交互
  // ================================================================
  const getPos = (e) => eventToCanvas(canvasRef.current, e)

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    const s = S.current; const { x, y } = getPos(e)

    if (s.tab === 1) {
      for (const a of canvasRef.current._clickAreas) {
        if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(); return }
      }
      return
    }

    // Tab2：端子连线（圆形热区）
    const term = findTerm(x, y)
    if (term) { s.connecting = { ...term, mx: x, my: y }; s.dragMoved = false; forceUpdate(n => n + 1); return }

    // 导线控制点拖拽（与三次贝塞尔控制点一致）
    for (const wire of s.wires) {
      const fc = s.components.find(c => c.id === wire.from.compId)
      const tc = s.components.find(c => c.id === wire.to.compId)
      if (!fc || !tc) continue
      const f = getTermPos(fc, wire.from.termIdx), t = getTermPos(tc, wire.to.termIdx)
      const ctrl = bezierCtrl(f, t, wire.from.termIdx, wire.to.termIdx,
        wire.mid1X != null ? { x: wire.mid1X, y: wire.mid1Y } : null,
        wire.mid2X != null ? { x: wire.mid2X, y: wire.mid2Y } : null)
      if ((x - ctrl.m1x) ** 2 + (y - ctrl.m1y) ** 2 < 256) { s.dragId = 'wire_' + wire.id + '_1'; s.dragMoved = false; forceUpdate(n => n + 1); return }
      if ((x - ctrl.m2x) ** 2 + (y - ctrl.m2y) ** 2 < 256) { s.dragId = 'wire_' + wire.id + '_2'; s.dragMoved = false; forceUpdate(n => n + 1); return }
    }

    // 器材拖拽（中央热区）
    const comp = findComp(x, y)
    if (comp) {
      s.dragId = comp.id
      s.dragOffX = x - comp.x; s.dragOffY = y - comp.y
      s.dragMoved = false; s.dragStart = { x, y }
      forceUpdate(n => n + 1)
    }
  }, [])

  const handleMouseMove = useCallback((e) => {
    const s = S.current; const { x, y } = getPos(e)
    if (s.tab !== 2) return
    if (s.dragId) {
      // 导线控制点拖拽
      if (typeof s.dragId === 'string' && s.dragId.startsWith('wire_')) {
        const parts = s.dragId.split('_')
        const wireId = parseInt(parts[1])
        const rivetIdx = parseInt(parts[2])
        const wire = s.wires.find(w => w.id === wireId)
        if (wire) {
          if (s.dragStart && Math.hypot(x - s.dragStart.x, y - s.dragStart.y) > 5) s.dragMoved = true
          if (rivetIdx === 1) { wire.mid1X = x; wire.mid1Y = y }
          else { wire.mid2X = x; wire.mid2Y = y }
          forceUpdate(n => n + 1)
        }
        return
      }
      // 器材拖拽
      const c = s.components.find(k => k.id === s.dragId)
      if (c) {
        if (s.dragStart && Math.hypot(x - s.dragStart.x, y - s.dragStart.y) > 5) s.dragMoved = true
        c.x = x - s.dragOffX; c.y = y - s.dragOffY
        forceUpdate(n => n + 1)
      }
      return
    }
    if (s.connecting) {
      s.connecting.mx = x; s.connecting.my = y
      const t = findTermNear(S.current.components, x, y, s.connecting.compId)
      s.hoverTerm = t
      forceUpdate(n => n + 1); return
    }
    s.hoverTerm = findTerm(x, y)
    canvasRef.current.style.cursor = s.hoverTerm ? 'crosshair' : findComp(x, y) ? 'grab' : 'default'
  }, [])

  const handleMouseUp = useCallback((e) => {
    const s = S.current
    // 记录抬起点，用于识别双击（手机触摸桥不触发原生 dblclick）
    if (e) {
      try { s._lastUpPos = getPos(e) } catch (_) { s._lastUpPos = null }
    }
    const now = performance.now()
    const upPos = s._lastUpPos
    if (s.tab === 2 && upPos) {
      const isDouble = s._lastUpT && (now - s._lastUpT) < 350
        && s._lastUpPrev
        && Math.hypot(upPos.x - s._lastUpPrev.x, upPos.y - s._lastUpPrev.y) < 28
      if (isDouble && !s.dragMoved) {
        // 双击删除：热点放宽到整个元件
        let comp = findComp(upPos.x, upPos.y)
        if (!comp) comp = findCompWide(S.current.components, upPos.x, upPos.y)
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
    if (s.dragId) {
      const id = s.dragId
      const moved = s.dragMoved
      s.dragId = null; s.dragMoved = false; s.dragStart = null
      // 轻点开关：切换通断（拖过则只移动）
      if (!moved && typeof id === 'number') {
        const c = s.components.find(k => k.id === id)
        if (c && c.type === 'switch') {
          c.closed = c.closed === false
          forceUpdate(n => n + 1)
          return
        }
      }
      forceUpdate(n => n + 1)
      return
    }
    if (s.connecting) {
      const t = s.hoverTerm
      if (t && t.compId !== s.connecting.compId) {
        const dup = s.wires.some(w =>
          (w.from.compId === s.connecting.compId && w.from.termIdx === s.connecting.termIdx && w.to.compId === t.compId && w.to.termIdx === t.termIdx) ||
          (w.to.compId === s.connecting.compId && w.to.termIdx === s.connecting.termIdx && w.from.compId === t.compId && w.from.termIdx === t.termIdx))
        if (!dup) s.wires.push({ id: s.nextId++, from: { compId: s.connecting.compId, termIdx: s.connecting.termIdx }, to: t, color: s.wireColor, mid1X: null, mid1Y: null, mid2X: null, mid2Y: null })
      }
      s.connecting = null; s.hoverTerm = null; forceUpdate(n => n + 1)
    }
  }, [])

  const handleContextMenu = useCallback((e) => {
    if (S.current.tab !== 2) return; e.preventDefault()
    const { x, y } = getPos(e)
    const comp = findComp(x, y)
    if (comp) {
      S.current.components = S.current.components.filter(c => c.id !== comp.id)
      S.current.wires = S.current.wires.filter(w => w.from.compId !== comp.id && w.to.compId !== comp.id)
    }
    forceUpdate(n => n + 1)
  }, [])

  const handleDoubleClick = useCallback((e) => {
    if (S.current.tab !== 2) return
    e.preventDefault()
    const { x, y } = getPos(e)
    // 双击删除：热点放宽到整个元件（电脑右键删除仍保留）
    let comp = findComp(x, y)
    if (!comp) comp = findCompWide(S.current.components, x, y)
    if (comp) {
      S.current.components = S.current.components.filter(c => c.id !== comp.id)
      S.current.wires = S.current.wires.filter(w => w.from.compId !== comp.id && w.to.compId !== comp.id)
      forceUpdate(n => n + 1)
    }
  }, [])

  const handleReset = useCallback(() => {
    S.current.components = []; S.current.wires = []; S.current.switchClosed = false; S.current.dragId = null; S.current.connecting = null
    forceUpdate(n => n + 1)
  }, [])

  const handleAddFromPalette = useCallback((type) => {
    const s = S.current
    const canvas = canvasRef.current
    if (!canvas) return
    const r = canvas.getBoundingClientRect()
    // 放到画布中心偏下，避免叠在一起
    const n = s.components.length
    const x = r.width * 0.35 + (n % 3) * 90
    const y = r.height * 0.4 + (Math.floor(n / 3) % 3) * 80
    const id = s.nextId++
    s.components.push({ id, type, x, y, rotation: 0, closed: type === 'switch' ? false : true })
    s.dragId = id
    s.dragOffX = 0
    s.dragOffY = 0
    s.guideDismissed = true
    s.tab = 2
    setTab(2)
    forceUpdate(v => v + 1)
  }, [])

  const handlePickColor = useCallback((color) => {
    S.current.wireColor = color
    forceUpdate(v => v + 1)
  }, [])

  return (
    <SceneShell
      title="简单电路"
      tab={tab}
      onTabChange={(t) => { S.current.tab = t; setTab(t) }}
      tab1Label="📖 电路演示"
      tab2Label="🔧 自己动手"
      onReset={handleReset}
      desc={(
        <>
          <b>简单电路</b>
          <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
            {tab === 1 ? '电路演示：矩形回路 · 点击开关 · 标准符号 · 电子方向' : '自己动手：点底部器材加入 · 拖拽移动 · 接线柱连线 · 双击删除'}
          </span>
        </>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'row', flex: 1, minHeight: 0, width: '100%' }}>
        <canvas
          ref={canvasRef}
          className="canvas-fill" style={{ width: '100%', flex: 1, minHeight: 0, display: 'block', touchAction: 'none' }}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
          onContextMenu={handleContextMenu} onDoubleClick={handleDoubleClick}
        />
        {tab === 1 ? (
          <InfoDock
            purpose="认识简单电路的组成与通路/断路状态。"
            steps={[
              '观察矩形回路：电源、开关、灯泡、导线',
              '点击开关，看灯泡亮/灭',
              '对照右侧知识：通路 / 断路 / 短路',
            ]}
            hint="开关常开。闭合后灯泡亮，端电压=电源电压；断开 U=0。"
          />
        ) : (
          <InfoDock
            hint="点底部器材加入 → 拖拽移动 → 点接线柱连线。轻点开关通断，双击删除器材。"
            hintTitle="操作说明"
          />
        )}
        {tab === 2 && (
          <BuilderPalette side="right"
            items={[
              { type: 'battery', name: '电源', icon: '🔋' },
              { type: 'bulb', name: '灯泡', icon: '💡' },
              { type: 'switch', name: '开关', icon: '🔌' },
              { type: 'resistor', name: '电阻', icon: '⚡' },
            ]}
            wireColor={S.current.wireColor}
            onPickColor={handlePickColor}
            onAdd={handleAddFromPalette}
            hint="左右滑动选器材"
          />
        )}
      </div>
    </SceneShell>
  )
}
