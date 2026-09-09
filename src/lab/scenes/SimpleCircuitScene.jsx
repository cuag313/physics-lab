import { useState, useRef, useEffect, useCallback } from 'react'

/**
 * SimpleCircuitScene — 简单电路
 *
 * Tab1: 电路演示 — 矩形回路 + 开关通断 + 灯泡亮暗
 * Tab2: 自己动手 — 拖拽实物器材搭建电路 + 导线磁吸连接
 */

export default function SimpleCircuitScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    // Tab1 状态
    switchClosed: true,
    time: 0,
    // Tab2 状态
    components: [],      // [{id, type, x, y, rotation, value, label}]
    wires: [],           // [{id, from: {compId, terminal}, to: {compId, terminal}, points}]
    dragging: null,      // {compId, offsetX, offsetY}
    connecting: null,    // {compId, terminal, x, y}
    hoverTerminal: null, // {compId, terminal}
    nextId: 1,
    guideDismissed: false,
  })

  const [tab, setTab] = useState(1)
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const R = createRenderer(canvas)
    canvasRef.current._R = R
    const loop = () => { S.current.time += 1 / 60; render(R); animRef.current = requestAnimationFrame(loop) }
    animRef.current = requestAnimationFrame(loop)
    const onResize = () => R.resize()
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function createRenderer(canvas) {
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
    R.resize()
    return R
  }

  function render(R) {
    const ctx = R.ctx, W = R.W, H = R.H
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#f0f4f8'; ctx.fillRect(0, 0, W, H)
    if (S.current.tab === 1) renderDemo(ctx, W, H)
    else renderBuilder(ctx, W, H)
  }

  // ================================================================
  //  Tab 1：电路演示（矩形回路）
  // ================================================================
  function renderDemo(ctx, W, H) {
    const s = S.current
    const on = s.switchClosed
    const wireColor = on ? '#1565C0' : '#999'

    // 标题
    ctx.fillStyle = '#333'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('🔌 简单电路演示', W / 2, 16)

    // 矩形回路布局
    const margin = 80
    const left = margin, right = W - margin
    const top = 100, bottom = H - 120
    const midX = (left + right) / 2

    // ─── 导线（矩形四边）───
    ctx.strokeStyle = wireColor; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    // 下边：电池负极 → 开关 → 右下角
    ctx.beginPath(); ctx.moveTo(left, bottom); ctx.lineTo(right, bottom); ctx.stroke()
    // 右边
    ctx.beginPath(); ctx.moveTo(right, bottom); ctx.lineTo(right, top); ctx.stroke()
    // 上边：灯泡
    ctx.beginPath(); ctx.moveTo(right, top); ctx.lineTo(left, top); ctx.stroke()
    // 左边
    ctx.beginPath(); ctx.moveTo(left, top); ctx.lineTo(left, bottom); ctx.stroke()

    // 电流流动
    if (on) {
      const path = [
        { x: left, y: bottom }, { x: right, y: bottom },
        { x: right, y: top }, { x: left, y: top }, { x: left, y: bottom },
      ]
      drawCurrentFlow(ctx, path, s.time, 0.8)
    }

    // ─── 电池（下边中部偏左）───
    const battX = left + (right - left) * 0.25
    drawBatterySymbol(ctx, battX, bottom, 12, on)

    // ─── 开关（下边中部偏右）───
    const swX = left + (right - left) * 0.7
    drawSwitchSymbol(ctx, swX, bottom, on, () => {
      S.current.switchClosed = !S.current.switchClosed
      S.current.guideDismissed = true
      forceUpdate(n => n + 1)
    })

    // ─── 灯泡（上边中部）───
    drawBulbSymbol(ctx, midX, top, on ? 1.0 : 0, 28)

    // ─── 标注 ───
    ctx.fillStyle = '#555'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('电池', battX, bottom + 16)
    ctx.fillText(on ? '开关（闭合）' : '开关（断开）', swX, bottom + 16)
    ctx.fillText('灯泡', midX, top - 45)
    ctx.fillStyle = '#888'; ctx.font = '11px sans-serif'
    ctx.fillText('电流方向：正极 → 开关 → 灯泡 → 负极', midX, H - 40)

    // 电流方向箭头
    if (on) {
      ctx.fillStyle = '#1565C0'; ctx.font = '14px sans-serif'
      ctx.fillText('→', (left + battX) / 2, bottom - 12)
      ctx.fillText('→', (swX + right) / 2, bottom - 12)
      ctx.fillText('↑', right + 12, (top + bottom) / 2)
      ctx.fillText('←', midX, top + 12)
      ctx.fillText('↓', left - 12, (top + bottom) / 2)
    }

    // 知识点面板
    const pw = 240, ph = 180, px = W - pw - 16, py = 16
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('📖 简单电路知识', px + 12, py + 10)
    ctx.font = '12px sans-serif'; ctx.fillStyle = '#555'; let ky = py + 34
    const lines = [
      '• 电路由电源、导线、用电器、开关组成',
      '• 开关闭合 → 通路 → 灯泡亮',
      '• 开关断开 → 断路 → 灯泡灭',
      '• 电流方向：正极 → 用电器 → 负极',
      '• 短路：导线直接连电源两极（危险！）',
    ]
    for (const line of lines) { ctx.fillText(line, px + 12, ky); ky += 22 }
    ctx.textBaseline = 'alphabetic'
  }

  // ================================================================
  //  Tab 2：自己动手搭电路
  // ================================================================
  function renderBuilder(ctx, W, H) {
    const s = S.current
    const paletteW = 180
    const canvasX = 10, canvasY = 60, canvasW = W - paletteW - 30, canvasH = H - 120

    // 画布背景
    ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.roundRect(canvasX, canvasY, canvasW, canvasH, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(canvasX, canvasY, canvasW, canvasH, 8); ctx.stroke()

    // 网格
    ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 0.5
    const gridSize = 25
    for (let gx = canvasX + gridSize; gx < canvasX + canvasW; gx += gridSize) {
      ctx.beginPath(); ctx.moveTo(gx, canvasY); ctx.lineTo(gx, canvasY + canvasH); ctx.stroke()
    }
    for (let gy = canvasY + gridSize; gy < canvasY + canvasH; gy += gridSize) {
      ctx.beginPath(); ctx.moveTo(canvasX, gy); ctx.lineTo(canvasX + canvasW, gy); ctx.stroke()
    }

    // 画导线
    for (const wire of s.wires) {
      drawBuilderWire(ctx, wire)
    }

    // 画正在连接中的导线
    if (s.connecting) {
      const fromComp = s.components.find(c => c.id === s.connecting.compId)
      if (fromComp) {
        const fromTerm = getTerminalPos(fromComp, s.connecting.terminal)
        ctx.strokeStyle = '#FF9800'; ctx.lineWidth = 2; ctx.setLineDash([5, 5])
        ctx.beginPath(); ctx.moveTo(fromTerm.x, fromTerm.y); ctx.lineTo(s.connecting.x, s.connecting.y); ctx.stroke()
        ctx.setLineDash([])
      }
    }

    // 画器材
    for (const comp of s.components) {
      drawBuilderComponent(ctx, comp, s)
    }

    // 右侧器材栏
    const paletteX = W - paletteW - 10
    ctx.fillStyle = '#f8f9fa'
    ctx.beginPath(); ctx.roundRect(paletteX, canvasY, paletteW, canvasH, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(paletteX, canvasY, paletteW, canvasH, 8); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('🧰 电学器材', paletteX + 12, canvasY + 10)

    const items = [
      { type: 'battery', name: '电池', icon: '🔋', desc: '12V直流' },
      { type: 'bulb', name: '灯泡', icon: '💡', desc: '小灯泡' },
      { type: 'switch', name: '开关', icon: '🔘', desc: '单刀单掷' },
      { type: 'resistor', name: '电阻', icon: '⟿', desc: '10Ω' },
      { type: 'wire', name: '导线', icon: '━', desc: '连接用' },
    ]

    let iy = canvasY + 35
    canvasRef.current._clickAreas = canvasRef.current._clickAreas || []
    for (const item of items) {
      // 器材卡片
      ctx.fillStyle = '#fff'
      ctx.beginPath(); ctx.roundRect(paletteX + 8, iy, paletteW - 16, 50, 6); ctx.fill()
      ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.roundRect(paletteX + 8, iy, paletteW - 16, 50, 6); ctx.stroke()

      // 实物风格图标
      drawComponentIcon(ctx, paletteX + 30, iy + 25, item.type, 16)

      ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText(item.name, paletteX + 50, iy + 20)
      ctx.fillStyle = '#888'; ctx.font = '10px sans-serif'
      ctx.fillText(item.desc, paletteX + 50, iy + 36)
      ctx.textBaseline = 'alphabetic'

      // 点击添加到画布
      canvasRef.current._clickAreas.push({
        x: paletteX + 8, y: iy, w: paletteW - 16, h: 50,
        onClick: () => {
          const id = s.nextId++
          const cx = canvasX + canvasW / 2 + (Math.random() - 0.5) * 100
          const cy = canvasY + canvasH / 2 + (Math.random() - 0.5) * 80
          s.components.push({ id, type: item.type, x: cx, y: cy, rotation: 0, closed: true })
          s.guideDismissed = true
          forceUpdate(n => n + 1)
        },
      })
      iy += 58
    }

    // 引导气泡
    if (!s.guideDismissed && s.components.length === 0) {
      const text = '👆 从右侧点击器材添加到画布，拖拽移动，点击接线柱连线'
      ctx.font = '13px sans-serif'
      const tw = ctx.measureText(text).width + 24, th = 32
      const bx = canvasX + canvasW / 2, by = canvasY + canvasH / 2
      const ry = by + Math.sin(Date.now() / 600) * 4
      ctx.fillStyle = 'rgba(79,195,247,0.12)'; ctx.beginPath(); ctx.roundRect(bx - tw / 2, ry - th / 2, tw, th, 16); ctx.fill()
      ctx.strokeStyle = 'rgba(79,195,247,0.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(bx - tw / 2, ry - th / 2, tw, th, 16); ctx.stroke()
      ctx.fillStyle = '#0288D1'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(text, bx, ry); ctx.textBaseline = 'alphabetic'
    }
  }

  // ================================================================
  //  器材绘制（实物风格）
  // ================================================================

  // 器材图标（小尺寸，用于器材栏）
  function drawComponentIcon(ctx, x, y, type, size) {
    ctx.save(); ctx.translate(x, y)
    if (type === 'battery') {
      ctx.fillStyle = '#4CAF50'; ctx.fillRect(-size * 0.6, -size * 0.3, size * 1.2, size * 0.6)
      ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('+ −', 0, 0)
    } else if (type === 'bulb') {
      ctx.fillStyle = '#FFC107'; ctx.beginPath(); ctx.arc(0, 0, size * 0.5, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#F57F17'; ctx.lineWidth = 1.5; ctx.stroke()
      ctx.fillStyle = '#E65100'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('×', 0, 0)
    } else if (type === 'switch') {
      ctx.strokeStyle = '#666'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(-size * 0.4, 0, 3, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.arc(size * 0.4, 0, 3, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(-size * 0.4, 0); ctx.lineTo(size * 0.3, -size * 0.3); ctx.stroke()
    } else if (type === 'resistor') {
      ctx.strokeStyle = '#78909C'; ctx.lineWidth = 2; ctx.lineJoin = 'round'
      ctx.beginPath()
      for (let i = 0; i <= 6; i++) {
        const px = -size * 0.6 + (size * 1.2 / 6) * i
        const py = (i % 2 === 0 ? -1 : 1) * size * 0.25
        ctx.lineTo(px, py)
      }
      ctx.stroke()
    } else if (type === 'wire') {
      ctx.strokeStyle = '#333'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(-size * 0.6, 0); ctx.lineTo(size * 0.6, 0); ctx.stroke()
    }
    ctx.restore()
  }

  // 器材绘制（画布上，实物风格，大尺寸）
  function drawBuilderComponent(ctx, comp, s) {
    const { x, y, type, rotation, closed } = comp
    ctx.save(); ctx.translate(x, y); ctx.rotate(rotation || 0)

    const isDragging = s.dragging && s.dragging.compId === comp.id
    if (isDragging) { ctx.globalAlpha = 0.7 }

    if (type === 'battery') {
      // 实物风格电池
      ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.roundRect(-30, -18, 60, 36, 4); ctx.fill(); ctx.stroke()
      // 正极标记
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('+', -16, 0)
      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px sans-serif'
      ctx.fillText('−', 12, 0)
      ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif'
      ctx.fillText('12V', 0, 14)
    } else if (type === 'bulb') {
      // 实物风格灯泡
      const brightness = s.tab === 1 ? (s.switchClosed ? 1 : 0) : 0.5
      ctx.fillStyle = brightness > 0.3 ? '#FFEB3B' : '#e0e0e0'
      ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = brightness > 0.3 ? '#F9A825' : '#bbb'; ctx.lineWidth = 2; ctx.stroke()
      // 灯丝
      ctx.strokeStyle = brightness > 0.3 ? '#E65100' : '#999'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(-8, -8); ctx.lineTo(8, 8); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(8, -8); ctx.lineTo(-8, 8); ctx.stroke()
      // 底座
      ctx.fillStyle = '#9E9E9E'; ctx.fillRect(-10, 20, 20, 8)
      // 发光效果
      if (brightness > 0.3) {
        const glow = ctx.createRadialGradient(0, 0, 15, 0, 0, 45)
        glow.addColorStop(0, `rgba(255,235,59,${brightness * 0.25})`)
        glow.addColorStop(1, 'rgba(255,235,59,0)')
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, 45, 0, Math.PI * 2); ctx.fill()
      }
    } else if (type === 'switch') {
      // 实物风格开关
      ctx.fillStyle = '#ECEFF1'; ctx.strokeStyle = '#90A4AE'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.roundRect(-35, -12, 70, 24, 4); ctx.fill(); ctx.stroke()
      // 端点
      ctx.fillStyle = '#666'; ctx.beginPath(); ctx.arc(-22, 0, 4, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(22, 0, 4, 0, Math.PI * 2); ctx.fill()
      // 触片
      ctx.strokeStyle = closed ? '#4CAF50' : '#F44336'; ctx.lineWidth = 3; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(-22, 0)
      if (closed) ctx.lineTo(22, 0); else ctx.lineTo(15, -16)
      ctx.stroke(); ctx.lineCap = 'butt'
      // 标签
      ctx.fillStyle = closed ? '#4CAF50' : '#F44336'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText(closed ? 'ON' : 'OFF', 0, 14)
    } else if (type === 'resistor') {
      // 实物风格电阻（色环）
      ctx.fillStyle = '#E8D5B7'; ctx.strokeStyle = '#A1887F'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.roundRect(-30, -10, 60, 20, 3); ctx.fill(); ctx.stroke()
      // 色环
      const bands = ['#B71C1C', '#4CAF50', '#FF9800', '#FFD54F']
      bands.forEach((color, i) => {
        ctx.fillStyle = color; ctx.fillRect(-20 + i * 13, -10, 6, 20)
      })
      ctx.fillStyle = '#333'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText('10Ω', 0, 12)
    } else if (type === 'wire') {
      ctx.strokeStyle = '#333'; ctx.lineWidth = 3; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(-35, 0); ctx.lineTo(35, 0); ctx.stroke()
    }

    ctx.globalAlpha = 1
    ctx.restore()

    // 接线柱（终端点）
    const terminals = getTerminals(comp)
    const hoveredTerm = s.hoverTerminal
    for (let ti = 0; ti < terminals.length; ti++) {
      const t = terminals[ti]
      const isHovered = hoveredTerm && hoveredTerm.compId === comp.id && hoveredTerm.terminal === ti
      ctx.fillStyle = isHovered ? '#FF9800' : '#fff'
      ctx.strokeStyle = isHovered ? '#E65100' : '#666'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(t.x, t.y, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      if (isHovered) {
        ctx.strokeStyle = 'rgba(255,152,0,0.4)'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.arc(t.x, t.y, 14, 0, Math.PI * 2); ctx.stroke()
      }
    }
  }

  // 导线绘制（带拐角）
  function drawBuilderWire(ctx, wire) {
    const fromComp = S.current.components.find(c => c.id === wire.from.compId)
    const toComp = S.current.components.find(c => c.id === wire.to.compId)
    if (!fromComp || !toComp) return
    const from = getTerminalPos(fromComp, wire.from.terminal)
    const to = getTerminalPos(toComp, wire.to.terminal)

    ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
    // 直角拐线：先水平再垂直
    const midX = (from.x + to.x) / 2
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(midX, from.y); ctx.lineTo(midX, to.y); ctx.lineTo(to.x, to.y); ctx.stroke()
  }

  // 获取终端点位置
  function getTerminalPos(comp, terminalIndex) {
    const { x, y, rotation } = comp
    const c = Math.cos(rotation || 0), sn = Math.sin(rotation || 0)
    const offset = 38
    const sign = terminalIndex === 0 ? -1 : 1
    return { x: x + sign * offset * c, y: y + sign * offset * sn }
  }

  function getTerminals(comp) {
    return [getTerminalPos(comp, 0), getTerminalPos(comp, 1)]
  }

  // 检测鼠标是否在终端点附近
  function findTerminal(mx, my) {
    const s = S.current
    for (const comp of s.components) {
      const terminals = getTerminals(comp)
      for (let i = 0; i < terminals.length; i++) {
        const dx = mx - terminals[i].x, dy = my - terminals[i].y
        if (dx * dx + dy * dy < 200) return { compId: comp.id, terminal: i }
      }
    }
    return null
  }

  // 检测鼠标是否在器材上
  function findComponent(mx, my) {
    const s = S.current
    for (let i = s.components.length - 1; i >= 0; i--) {
      const comp = s.components[i]
      const dx = mx - comp.x, dy = my - comp.y
      if (Math.abs(dx) < 45 && Math.abs(dy) < 35) return comp
    }
    return null
  }

  // 电流流动动画
  function drawCurrentFlow(ctx, points, time, speed) {
    let totalLen = 0
    const segs = []
    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1].x - points[i].x, dy = points[i + 1].y - points[i].y
      const len = Math.sqrt(dx * dx + dy * dy)
      segs.push({ ...points[i], ex: points[i + 1].x, ey: points[i + 1].y, len })
      totalLen += len
    }
    ctx.fillStyle = '#FFEB3B'
    const dotCount = Math.max(4, Math.floor(totalLen / 50))
    for (let d = 0; d < dotCount; d++) {
      let pos = ((time * speed * 100 + d * (totalLen / dotCount)) % totalLen)
      for (const seg of segs) {
        if (pos <= seg.len) {
          const ratio = pos / seg.len
          ctx.beginPath(); ctx.arc(seg.x + (seg.ex - seg.x) * ratio, seg.y + (seg.ey - seg.y) * ratio, 3.5, 0, Math.PI * 2); ctx.fill()
          break
        }
        pos -= seg.len
      }
    }
  }

  // 电路符号（Tab1用）
  function drawBatterySymbol(ctx, x, y, emf, on) {
    ctx.save(); ctx.translate(x, y)
    // 电池体
    ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(-35, -16, 70, 32, 4); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('+', -18, 0)
    ctx.fillStyle = '#fff'; ctx.font = 'bold 18px sans-serif'
    ctx.fillText('−', 14, 0)
    ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif'
    ctx.fillText(`${emf}V`, 0, 13)
    ctx.restore()
  }

  function drawSwitchSymbol(ctx, x, y, on, onClick) {
    ctx.save(); ctx.translate(x, y)
    // 底座
    ctx.fillStyle = '#ECEFF1'; ctx.strokeStyle = '#90A4AE'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(-30, -10, 60, 20, 4); ctx.fill(); ctx.stroke()
    // 端点
    ctx.fillStyle = '#666'; ctx.beginPath(); ctx.arc(-18, 0, 3.5, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(18, 0, 3.5, 0, Math.PI * 2); ctx.fill()
    // 触片
    ctx.strokeStyle = on ? '#4CAF50' : '#F44336'; ctx.lineWidth = 3; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(-18, 0)
    if (on) ctx.lineTo(18, 0); else ctx.lineTo(12, -14)
    ctx.stroke(); ctx.lineCap = 'butt'
    // 标签
    ctx.fillStyle = on ? '#4CAF50' : '#F44336'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(on ? 'ON' : 'OFF', 0, 12)
    ctx.restore()

    // 点击热区
    canvasRef.current._clickAreas = canvasRef.current._clickAreas || []
    canvasRef.current._clickAreas.push({ x: x - 35, y: y - 25, w: 70, h: 50, onClick })
  }

  function drawBulbSymbol(ctx, x, y, brightness, r) {
    ctx.fillStyle = brightness > 0.3 ? '#FFEB3B' : '#e0e0e0'
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = brightness > 0.3 ? '#F9A825' : '#bbb'; ctx.lineWidth = 2; ctx.stroke()
    // 灯丝
    ctx.strokeStyle = brightness > 0.3 ? '#E65100' : '#999'; ctx.lineWidth = 1.5
    const s = r * 0.4
    ctx.beginPath(); ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.stroke()
    // 发光
    if (brightness > 0.3) {
      const glow = ctx.createRadialGradient(x, y, r, x, y, r * 3)
      glow.addColorStop(0, `rgba(255,235,59,${brightness * 0.3})`)
      glow.addColorStop(1, 'rgba(255,235,59,0)')
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, r * 3, 0, Math.PI * 2); ctx.fill()
    }
  }

  // ================================================================
  //  交互（Tab2：拖拽 + 连线）
  // ================================================================
  const handleMouseDown = useCallback((e) => {
    if (S.current.tab !== 2) return
    const canvas = canvasRef.current; if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top

    // 检查是否点击终端点（开始连线）
    const term = findTerminal(mx, my)
    if (term) {
      S.current.connecting = { ...term, x: mx, y: my }
      forceUpdate(n => n + 1)
      return
    }

    // 检查是否点击器材（开始拖拽）
    const comp = findComponent(mx, my)
    if (comp) {
      S.current.dragging = { compId: comp.id, offsetX: mx - comp.x, offsetY: my - comp.y }
      forceUpdate(n => n + 1)
      return
    }
  }, [])

  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current; if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const s = S.current

    if (s.tab !== 2) return

    // 拖拽器材
    if (s.dragging) {
      const comp = s.components.find(c => c.id === s.dragging.compId)
      if (comp) {
        comp.x = mx - s.dragging.offsetX
        comp.y = my - s.dragging.offsetY
        forceUpdate(n => n + 1)
      }
      return
    }

    // 连线中
    if (s.connecting) {
      s.connecting.x = mx; s.connecting.y = my
      // 检测磁吸
      const term = findTerminal(mx, my)
      s.hoverTerminal = term && term.compId !== s.connecting.compId ? term : null
      forceUpdate(n => n + 1)
      return
    }

    // 悬停检测
    s.hoverTerminal = findTerminal(mx, my)
    if (s.hoverTerminal) canvas.style.cursor = 'crosshair'
    else if (findComponent(mx, my)) canvas.style.cursor = 'grab'
    else canvas.style.cursor = 'default'
  }, [])

  const handleMouseUp = useCallback((e) => {
    const s = S.current
    if (s.tab !== 2) return

    // 完成拖拽
    if (s.dragging) {
      s.dragging = null
      forceUpdate(n => n + 1)
      return
    }

    // 完成连线（磁吸到终端点）
    if (s.connecting) {
      const canvas = canvasRef.current; if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      const term = findTerminal(mx, my)
      if (term && term.compId !== s.connecting.compId) {
        // 检查是否已有相同连线
        const exists = s.wires.some(w =>
          (w.from.compId === s.connecting.compId && w.from.terminal === s.connecting.terminal &&
           w.to.compId === term.compId && w.to.terminal === term.terminal) ||
          (w.to.compId === s.connecting.compId && w.to.terminal === s.connecting.terminal &&
           w.from.compId === term.compId && w.from.terminal === term.terminal)
        )
        if (!exists) {
          s.wires.push({ id: s.nextId++, from: { compId: s.connecting.compId, terminal: s.connecting.terminal }, to: term })
        }
      }
      s.connecting = null; s.hoverTerminal = null
      forceUpdate(n => n + 1)
    }
  }, [])

  // 右键删除导线
  const handleContextMenu = useCallback((e) => {
    if (S.current.tab !== 2) return
    e.preventDefault()
    const canvas = canvasRef.current; if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top

    // 检查是否右键器材（删除）
    const comp = findComponent(mx, my)
    if (comp) {
      S.current.components = S.current.components.filter(c => c.id !== comp.id)
      S.current.wires = S.current.wires.filter(w => w.from.compId !== comp.id && w.to.compId !== comp.id)
      forceUpdate(n => n + 1)
      return
    }

    // 检查是否右键导线（删除）
    for (let i = S.current.wires.length - 1; i >= 0; i--) {
      const wire = S.current.wires[i]
      const fromComp = S.current.components.find(c => c.id === wire.from.compId)
      const toComp = S.current.components.find(c => c.id === wire.to.compId)
      if (!fromComp || !toComp) { S.current.wires.splice(i, 1); continue }
      const from = getTerminalPos(fromComp, wire.from.terminal)
      const to = getTerminalPos(toComp, wire.to.terminal)
      const midX = (from.x + to.x) / 2
      // 简单距离检测
      const dist = pointToSegmentDist(mx, my, from.x, from.y, midX, from.y) +
                   pointToSegmentDist(mx, my, midX, from.y, midX, to.y) +
                   pointToSegmentDist(mx, my, midX, to.y, to.x, to.y)
      if (dist < 20) { S.current.wires.splice(i, 1); forceUpdate(n => n + 1); return }
    }
  }, [])

  function pointToSegmentDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1
    const len2 = dx * dx + dy * dy
    if (len2 === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2)
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2))
    return Math.sqrt((px - (x1 + t * dx)) ** 2 + (py - (y1 + t * dy)) ** 2)
  }

  const handleReset = useCallback(() => {
    S.current.components = []; S.current.wires = []
    S.current.switchClosed = true; S.current.dragging = null; S.current.connecting = null
    forceUpdate(n => n + 1)
  }, [])

  const switchTab = useCallback((newTab) => { S.current.tab = newTab; setTab(newTab) }, [])

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <span style={styles.title}>简单电路</span>
        <div style={styles.actions}>
          <button style={tab === 1 ? styles.tabActive : styles.tab} onClick={() => switchTab(1)}>📖 电路演示</button>
          <button style={tab === 2 ? styles.tabActive : styles.tab} onClick={() => switchTab(2)}>🔧 自己动手</button>
          <div style={{ flex: 1 }} />
          <button style={styles.btn} onClick={handleReset}>↺ 重置</button>
        </div>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', cursor: 'default' }}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
          onContextMenu={handleContextMenu} />
      </div>
      <div style={styles.desc}>
        <b>简单电路</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          {tab === 1 ? '电路演示：矩形回路 · 点击开关通断 · 灯泡亮暗 · 电流方向' : '自己动手：点击器材添加 · 拖拽移动 · 点击接线柱连线 · 右键删除'}
        </span>
      </div>
    </div>
  )
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#f0f4f8', color: '#333', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  toolbar: { minHeight: 44, background: '#f5f5f5', borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', flexShrink: 0, flexWrap: 'wrap', gap: 6 },
  title: { fontSize: 14, fontWeight: 600, color: '#333' },
  actions: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 },
  tab: { background: '#f0f0f0', color: '#666', border: '1px solid #ddd', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  tabActive: { background: '#4A90D9', color: '#fff', border: '1px solid #4A90D9', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600 },
  btn: { background: '#f0f0f0', color: '#333', border: '1px solid #ddd', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  main: { flex: 1, display: 'flex', overflow: 'hidden' },
  desc: { padding: '8px 14px', background: '#f5f5f5', borderTop: '1px solid #ccc', fontSize: 13, color: '#333' },
}
