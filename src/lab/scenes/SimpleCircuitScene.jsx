import { useState, useRef, useEffect, useCallback } from 'react'
import SceneShell from '../ui/SceneShell'
import BuilderPalette from '../ui/BuilderPalette'

/**
 * SimpleCircuitScene — 简单电路
 * Tab1: 电路演示 — 矩形回路 + 标准电路符号 + 开关通断
 * Tab2: 自己动手 — 实物风格器材 + 三色导线 + 折线
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
        const rect = canvas.getBoundingClientRect()
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

    ctx.fillStyle = '#333'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('🔌 简单电路演示', W / 2, 12)

    // 矩形回路坐标
    const left = W * 0.1, right = W * 0.5
    const top = 80, bottom = H - 110
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

    // ─── 知识面板（右侧）───
    const pw = W * 0.38, ph = H - 140, px = W * 0.58, py = 50
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('📖 简单电路知识', px + 14, py + 12)
    ctx.font = '12px sans-serif'; let ky = py + 40
    const knowledge = [
      { t: '电路组成', bold: true },
      { t: '电源、导线、用电器、开关' },
      { t: '' },
      { t: '电路状态', bold: true },
      { t: '通路：开关闭合，电路有电流' },
      { t: '断路：开关断开，无电流' },
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
    ]
    for (const item of knowledge) {
      if (!item.t) { ky += 6; continue }
      ctx.fillStyle = item.bold ? '#333' : '#555'
      ctx.font = item.bold ? 'bold 12px sans-serif' : '12px sans-serif'
      ctx.fillText(item.t, px + 14, ky); ky += 20
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

  // 标准灯泡符号：小圆 + ×
  function drawStdBulb(ctx, x, y, brightness) {
    const r = 14
    ctx.fillStyle = brightness > 0.3 ? '#FFEB3B' : '#f5f5f5'
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = brightness > 0.3 ? '#F9A825' : '#999'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = brightness > 0.3 ? '#E65100' : '#999'; ctx.lineWidth = 1.5
    const s = r * 0.55
    ctx.beginPath(); ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.stroke()
    if (brightness > 0.3) {
      const glow = ctx.createRadialGradient(x, y, r, x, y, r * 3)
      glow.addColorStop(0, `rgba(255,235,59,${brightness * 0.3})`); glow.addColorStop(1, 'rgba(255,235,59,0)')
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, r * 3, 0, Math.PI * 2); ctx.fill()
    }
  }

  function drawLine(ctx, x1, y1, x2, y2, color, w) {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
  }

  // 红色电流方向箭头
  function drawRedArrow(ctx, x1, y1, x2, y2, label) {
    const angle = Math.atan2(y2 - y1, x2 - x1)
    ctx.strokeStyle = '#E53935'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.lineCap = 'butt'
    const hl = 10
    ctx.fillStyle = '#E53935'
    ctx.beginPath(); ctx.moveTo(x2, y2)
    ctx.lineTo(x2 - hl * Math.cos(angle - 0.35), y2 - hl * Math.sin(angle - 0.35))
    ctx.lineTo(x2 - hl * Math.cos(angle + 0.35), y2 - hl * Math.sin(angle + 0.35))
    ctx.closePath(); ctx.fill()
    if (label) {
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(label, (x1 + x2) / 2 + 14, (y1 + y2) / 2)
    }
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
        ctx.strokeStyle = s.wireColor; ctx.lineWidth = 2; ctx.setLineDash([5, 5])
        ctx.beginPath(); ctx.moveTo(ft.x, ft.y); ctx.lineTo(s.connecting.mx, s.connecting.my); ctx.stroke()
        ctx.setLineDash([])
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
      // 实物灯泡：闭合电路时亮
      const brightness = isClosed ? 1.0 : 0
      ctx.fillStyle = brightness > 0.3 ? '#FFEB3B' : '#FFFDE7'
      ctx.strokeStyle = brightness > 0.3 ? '#F9A825' : '#bbb'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, -6, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.strokeStyle = brightness > 0.3 ? '#E65100' : '#999'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(-8, -14); ctx.lineTo(8, 2); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(8, -14); ctx.lineTo(-8, 2); ctx.stroke()
      ctx.fillStyle = '#9E9E9E'; ctx.strokeStyle = '#616161'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.roundRect(-10, 14, 20, 10, 2); ctx.fill(); ctx.stroke()
      // 发光效果
      if (brightness > 0.3) {
        const glow = ctx.createRadialGradient(0, -6, 15, 0, -6, 50)
        glow.addColorStop(0, 'rgba(255,235,59,0.35)'); glow.addColorStop(1, 'rgba(255,235,59,0)')
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

    // 接线柱
    const terms = getTerminals(comp)
    for (let i = 0; i < terms.length; i++) {
      const t = terms[i]
      const hov = s.hoverTerm && s.hoverTerm.compId === comp.id && s.hoverTerm.termIdx === i
      ctx.fillStyle = hov ? '#FF9800' : '#fff'
      ctx.strokeStyle = hov ? '#E65100' : '#666'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(t.x, t.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      if (hov) { ctx.strokeStyle = 'rgba(255,152,0,0.4)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(t.x, t.y, 13, 0, Math.PI * 2); ctx.stroke() }
    }
  }

  function drawBuilderWire(ctx, wire) {
    const fc = S.current.components.find(c => c.id === wire.from.compId)
    const tc = S.current.components.find(c => c.id === wire.to.compId)
    if (!fc || !tc) return
    const f = getTermPos(fc, wire.from.termIdx), t = getTermPos(tc, wire.to.termIdx)
    const ddx = t.x - f.x, ddy = t.y - f.y
    const color = wire.color || '#1565C0'

    // 两个铆点（自由位置，默认在1/3和2/3处）
    const m1x = wire.mid1X != null ? wire.mid1X : f.x + ddx * 0.33
    const m1y = wire.mid1Y != null ? wire.mid1Y : f.y + ddy * 0.33
    const m2x = wire.mid2X != null ? wire.mid2X : f.x + ddx * 0.67
    const m2y = wire.mid2Y != null ? wire.mid2Y : f.y + ddy * 0.67

    // 导线：起点 → 铆点1 → 铆点2 → 终点（折线）
    ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.beginPath(); ctx.moveTo(f.x, f.y)
    ctx.lineTo(m1x, m1y); ctx.lineTo(m2x, m2y)
    ctx.lineTo(t.x, t.y); ctx.stroke()

    // 铆点圆圈（可拖拽拉出折角）
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(m1x, m1y, 5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(m1x, m1y, 2.5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(m2x, m2y, 5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(m2x, m2y, 2.5, 0, Math.PI * 2); ctx.fill()
  }

  function getTerminals(comp) {
    const c = Math.cos(comp.rotation || 0), sn = Math.sin(comp.rotation || 0)
    return [
      { x: comp.x - 40 * c, y: comp.y - 40 * sn },
      { x: comp.x + 40 * c, y: comp.y + 40 * sn },
    ]
  }
  function getTermPos(comp, idx) { return getTerminals(comp)[idx] }

  function findTerm(mx, my) {
    for (const comp of S.current.components) {
      const terms = getTerminals(comp)
      for (let i = 0; i < terms.length; i++) {
        if ((mx - terms[i].x) ** 2 + (my - terms[i].y) ** 2 < 144) return { compId: comp.id, termIdx: i }
      }
    }
    return null
  }
  function findComp(mx, my) {
    for (let i = S.current.components.length - 1; i >= 0; i--) {
      const c = S.current.components[i]
      if (Math.abs(mx - c.x) < 45 && Math.abs(my - c.y) < 35) return c
    }
    return null
  }

  // ================================================================
  //  交互
  // ================================================================
  const getPos = (e) => { const r = canvasRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    const s = S.current; const { x, y } = getPos(e)

    if (s.tab === 1) {
      for (const a of canvasRef.current._clickAreas) {
        if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { a.onClick(); return }
      }
      return
    }

    // Tab2：从底部工具条添加后拖到画布；此处只处理画布内交互
    const term = findTerm(x, y)
    if (term) { s.connecting = { ...term, mx: x, my: y }; forceUpdate(n => n + 1); return }

    // 导线铆点拖拽（自由移动，可拉出折角）
    for (const wire of s.wires) {
      const fc = s.components.find(c => c.id === wire.from.compId)
      const tc = s.components.find(c => c.id === wire.to.compId)
      if (!fc || !tc) continue
      const f = getTermPos(fc, wire.from.termIdx), t = getTermPos(tc, wire.to.termIdx)
      const ddx = t.x - f.x, ddy = t.y - f.y
      const m1x = wire.mid1X != null ? wire.mid1X : f.x + ddx * 0.33
      const m1y = wire.mid1Y != null ? wire.mid1Y : f.y + ddy * 0.33
      const m2x = wire.mid2X != null ? wire.mid2X : f.x + ddx * 0.67
      const m2y = wire.mid2Y != null ? wire.mid2Y : f.y + ddy * 0.67
      if ((x - m1x) ** 2 + (y - m1y) ** 2 < 144) { s.dragId = 'wire_' + wire.id + '_1'; forceUpdate(n => n + 1); return }
      if ((x - m2x) ** 2 + (y - m2y) ** 2 < 144) { s.dragId = 'wire_' + wire.id + '_2'; forceUpdate(n => n + 1); return }
    }

    // 器材拖拽（包括开关）
    const comp = findComp(x, y)
    if (comp) { s.dragId = comp.id; s.dragOffX = x - comp.x; s.dragOffY = y - comp.y; forceUpdate(n => n + 1) }
  }, [])

  const handleMouseMove = useCallback((e) => {
    const s = S.current; const { x, y } = getPos(e)
    if (s.tab !== 2) return
    if (s.dragId) {
      // 导线铆点拖拽（自由移动，可拉出折角）
      if (typeof s.dragId === 'string' && s.dragId.startsWith('wire_')) {
        const parts = s.dragId.split('_')
        const wireId = parseInt(parts[1])
        const rivetIdx = parseInt(parts[2])
        const wire = s.wires.find(w => w.id === wireId)
        if (wire) {
          if (rivetIdx === 1) { wire.mid1X = x; wire.mid1Y = y }
          else { wire.mid2X = x; wire.mid2Y = y }
          forceUpdate(n => n + 1)
        }
        return
      }
      // 器材拖拽
      const c = s.components.find(c => c.id === s.dragId)
      if (c) { c.x = x - s.dragOffX; c.y = y - s.dragOffY; forceUpdate(n => n + 1) }
      return
    }
    if (s.connecting) {
      s.connecting.mx = x; s.connecting.my = y
      const t = findTerm(x, y); s.hoverTerm = t && t.compId !== s.connecting.compId ? t : null
      forceUpdate(n => n + 1); return
    }
    s.hoverTerm = findTerm(x, y)
    canvasRef.current.style.cursor = s.hoverTerm ? 'crosshair' : findComp(x, y) ? 'grab' : 'default'
  }, [])

  const handleMouseUp = useCallback(() => {
    const s = S.current
    if (s.dragId) { s.dragId = null; forceUpdate(n => n + 1); return }
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
    const { x, y } = getPos(e)
    const comp = findComp(x, y)
    if (comp && comp.type === 'switch') {
      comp.closed = comp.closed === false ? true : false
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
    s.components.push({ id, type, x, y, rotation: 0, closed: true })
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
            {tab === 1 ? '电路演示：矩形回路 · 点击开关 · 标准符号 · 电子方向' : '自己动手：点底部器材加入 · 拖拽移动 · 接线柱连线 · 右键删除'}
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
