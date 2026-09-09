import { useState, useRef, useEffect, useCallback } from 'react'

/**
 * SimpleCircuitScene — 简单电路
 *
 * Tab1: 电路演示 — 矩形回路 + 标准电路符号 + 开关通断
 * Tab2: 自己动手 — 拖拽实物器材搭建电路 + 导线磁吸连接
 */

export default function SimpleCircuitScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    switchClosed: true,
    time: 0,
    // Tab2
    components: [],
    wires: [],
    dragId: null,
    dragOffX: 0,
    dragOffY: 0,
    connecting: null,
    hoverTerm: null,
    nextId: 1,
    guideDismissed: false,
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
    const onResize = () => R.resize()
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  function render(R) {
    const ctx = R.ctx, W = R.W, H = R.H
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#f0f4f8'; ctx.fillRect(0, 0, W, H)
    if (S.current.tab === 1) renderDemo(ctx, W, H)
    else renderBuilder(ctx, W, H)
  }

  // ================================================================
  //  Tab 1：电路演示（矩形回路，标准符号）
  // ================================================================
  function renderDemo(ctx, W, H) {
    const s = S.current
    const on = s.switchClosed

    // 标题
    ctx.fillStyle = '#333'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('🔌 简单电路演示', W / 2, 12)

    // 矩形回路（居中，留出右侧知识面板空间）
    const left = W * 0.12, right = W * 0.52
    const top = 80, bottom = H - 100
    const midX = (left + right) / 2

    // ─── 导线（矩形四边）───
    ctx.strokeStyle = on ? '#1565C0' : '#999'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(left, bottom); ctx.lineTo(right, bottom); ctx.stroke() // 下
    ctx.beginPath(); ctx.moveTo(right, bottom); ctx.lineTo(right, top); ctx.stroke()   // 右
    ctx.beginPath(); ctx.moveTo(right, top); ctx.lineTo(left, top); ctx.stroke()       // 上
    ctx.beginPath(); ctx.moveTo(left, top); ctx.lineTo(left, bottom); ctx.stroke()     // 左

    // 电流流动
    if (on) {
      const path = [{ x: left, y: bottom }, { x: right, y: bottom }, { x: right, y: top }, { x: left, y: top }, { x: left, y: bottom }]
      drawCurrentFlow(ctx, path, s.time, 0.6)
    }

    // ─── 电池（下边中部）—— 标准符号：长线（正极）+ 短粗线（负极）───
    const battX = left + (right - left) * 0.3
    drawStdBattery(ctx, battX, bottom, 12)

    // ─── 开关（下边右侧）───
    const swX = left + (right - left) * 0.75
    drawStdSwitch(ctx, swX, bottom, on, () => {
      S.current.switchClosed = !S.current.switchClosed
      S.current.guideDismissed = true
      forceUpdate(n => n + 1)
    })

    // ─── 灯泡（上边中部）—— 标准符号：小圆 + × ───
    drawStdBulb(ctx, midX, top, on ? 1.0 : 0)

    // ─── 标注 ───
    ctx.fillStyle = '#555'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('电源', battX, bottom + 14)
    ctx.fillText(on ? '开关（闭合）' : '开关（断开）', swX, bottom + 14)
    ctx.fillText('灯泡', midX, top - 36)

    // 电流方向
    if (on) {
      ctx.fillStyle = '#1565C0'; ctx.font = '13px sans-serif'
      ctx.fillText('→', (left + battX) / 2, bottom - 10)
      ctx.fillText('→', (swX + right) / 2, bottom - 10)
      ctx.fillText('↑', right + 10, (top + bottom) / 2)
      ctx.fillText('←', midX, top + 10)
      ctx.fillText('↓', left - 10, (top + bottom) / 2)
    }

    // ─── 知识点面板（右侧，不被遮挡）───
    const pw = W * 0.38, ph = H - 140, px = W * 0.58, py = 50
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.stroke()

    ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('📖 简单电路知识', px + 14, py + 12)
    ctx.font = '12px sans-serif'; ctx.fillStyle = '#555'; let ky = py + 40
    const lines = [
      '电路组成：电源、导线、用电器、开关',
      '',
      '通路：开关闭合，电路中有电流',
      '断路：开关断开，电路中无电流',
      '短路：导线直接连电源两极（危险！）',
      '',
      '电流方向：从电源正极出发，',
      '经过用电器，回到电源负极',
      '',
      '电源符号：长线为正极，短线为负极',
      '灯泡符号：圆圈内画×表示灯丝',
      '开关符号：断开/闭合两种状态',
    ]
    for (const line of lines) {
      if (!line) { ky += 8; continue }
      ctx.fillStyle = line.startsWith('电流方向') || line.startsWith('经过') ? '#1565C0' : '#555'
      ctx.font = line.startsWith('电路') || line.startsWith('通路') || line.startsWith('断路') || line.startsWith('短路') ? 'bold 12px sans-serif' : '12px sans-serif'
      ctx.fillText(line, px + 14, ky); ky += 22
    }
    ctx.textBaseline = 'alphabetic'
  }

  // ================================================================
  //  Tab 2：自己动手搭电路
  // ================================================================
  function renderBuilder(ctx, W, H) {
    const s = S.current
    const paletteW = 170
    const cvX = 10, cvY = 60, cvW = W - paletteW - 30, cvH = H - 120

    // 画布
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(cvX, cvY, cvW, cvH, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(cvX, cvY, cvW, cvH, 8); ctx.stroke()

    // 网格
    ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 0.5; const gs = 25
    for (let gx = cvX + gs; gx < cvX + cvW; gx += gs) { ctx.beginPath(); ctx.moveTo(gx, cvY); ctx.lineTo(gx, cvY + cvH); ctx.stroke() }
    for (let gy = cvY + gs; gy < cvY + cvH; gy += gs) { ctx.beginPath(); ctx.moveTo(cvX, gy); ctx.lineTo(cvX + cvW, gy); ctx.stroke() }

    // 导线
    for (const wire of s.wires) drawBuilderWire(ctx, wire)

    // 正在画的导线
    if (s.connecting) {
      const fromComp = s.components.find(c => c.id === s.connecting.compId)
      if (fromComp) {
        const ft = getTermPos(fromComp, s.connecting.termIdx)
        ctx.strokeStyle = '#FF9800'; ctx.lineWidth = 2; ctx.setLineDash([5, 5])
        ctx.beginPath(); ctx.moveTo(ft.x, ft.y); ctx.lineTo(s.connecting.mx, s.connecting.my); ctx.stroke()
        ctx.setLineDash([])
      }
    }

    // 器材
    for (const comp of s.components) drawBuilderComp(ctx, comp, s)

    // ─── 右侧器材栏 ───
    const palX = W - paletteW - 10
    ctx.fillStyle = '#f8f9fa'; ctx.beginPath(); ctx.roundRect(palX, cvY, paletteW, cvH, 8); ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(palX, cvY, paletteW, cvH, 8); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('🧰 电学器材', palX + 10, cvY + 10)

    const items = [
      { type: 'battery', name: '电源', desc: '12V' },
      { type: 'bulb', name: '灯泡', desc: '' },
      { type: 'switch', name: '开关', desc: '' },
      { type: 'resistor', name: '电阻', desc: '10Ω' },
    ]
    let iy = cvY + 35
    for (const item of items) {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(palX + 6, iy, paletteW - 12, 44, 6); ctx.fill()
      ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(palX + 6, iy, paletteW - 12, 44, 6); ctx.stroke()
      // 小图标
      drawCompIcon(ctx, palX + 28, iy + 22, item.type, 12)
      ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText(item.name, palX + 46, iy + 18)
      ctx.fillStyle = '#888'; ctx.font = '10px sans-serif'
      ctx.fillText(item.desc, palX + 46, iy + 33)
      ctx.textBaseline = 'alphabetic'

      // 存储点击区域
      if (!canvasRef.current._palAreas) canvasRef.current._palAreas = []
      canvasRef.current._palAreas.push({ x: palX + 6, y: iy, w: paletteW - 12, h: 44, type: item.type })
      iy += 50
    }

    // 提示
    if (!s.guideDismissed && s.components.length === 0) {
      ctx.fillStyle = 'rgba(79,195,247,0.12)'; ctx.font = '13px sans-serif'
      const txt = '点击右侧器材添加到画布 · 拖拽移动 · 右键删除'
      const tw = ctx.measureText(txt).width + 24
      const bx = cvX + cvW / 2, by = cvY + cvH / 2
      const ry = by + Math.sin(Date.now() / 600) * 4
      ctx.beginPath(); ctx.roundRect(bx - tw / 2, ry - 16, tw, 32, 16); ctx.fill()
      ctx.strokeStyle = 'rgba(79,195,247,0.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(bx - tw / 2, ry - 16, tw, 32, 16); ctx.stroke()
      ctx.fillStyle = '#0288D1'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(txt, bx, ry); ctx.textBaseline = 'alphabetic'
    }
  }

  // ================================================================
  //  标准电路符号（Tab1用）
  // ================================================================

  // 电源符号：长线（正极）+ 短粗线（负极）
  function drawStdBattery(ctx, x, y, emf) {
    ctx.strokeStyle = '#333'; ctx.lineWidth = 2
    // 长线（正极）
    ctx.beginPath(); ctx.moveTo(x - 8, y - 16); ctx.lineTo(x - 8, y + 16); ctx.stroke()
    // 短粗线（负极，比长短一半）
    ctx.lineWidth = 4
    ctx.beginPath(); ctx.moveTo(x + 8, y - 8); ctx.lineTo(x + 8, y + 8); ctx.stroke()
    // +/- 标签
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText('+', x - 8, y - 18)
    ctx.fillStyle = '#333'; ctx.font = 'bold 13px sans-serif'
    ctx.fillText('−', x + 8, y - 10)
    ctx.fillStyle = '#888'; ctx.font = '9px sans-serif'; ctx.textBaseline = 'top'
    ctx.fillText(`${emf}V`, x, y + 20)
    ctx.textBaseline = 'alphabetic'
  }

  // 灯泡符号：小圆 + ×
  function drawStdBulb(ctx, x, y, brightness) {
    const r = 14
    // 圆圈
    ctx.fillStyle = brightness > 0.3 ? '#FFEB3B' : '#f5f5f5'
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = brightness > 0.3 ? '#F9A825' : '#999'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
    // × 灯丝
    ctx.strokeStyle = brightness > 0.3 ? '#E65100' : '#999'; ctx.lineWidth = 1.5
    const s = r * 0.55
    ctx.beginPath(); ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.stroke()
    // 发光
    if (brightness > 0.3) {
      const glow = ctx.createRadialGradient(x, y, r, x, y, r * 3)
      glow.addColorStop(0, `rgba(255,235,59,${brightness * 0.3})`); glow.addColorStop(1, 'rgba(255,235,59,0)')
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, r * 3, 0, Math.PI * 2); ctx.fill()
    }
  }

  // 开关符号
  function drawStdSwitch(ctx, x, y, on, onClick) {
    ctx.strokeStyle = '#666'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(x - 18, y, 3.5, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.arc(x + 18, y, 3.5, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = on ? '#4CAF50' : '#F44336'; ctx.lineWidth = 3; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(x - 18, y)
    if (on) ctx.lineTo(x + 18, y); else ctx.lineTo(x + 12, y - 16)
    ctx.stroke(); ctx.lineCap = 'butt'
    ctx.fillStyle = on ? '#4CAF50' : '#F44336'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(on ? 'ON' : 'OFF', x, y + 8); ctx.textBaseline = 'alphabetic'
    // 点击热区
    canvasRef.current._clickAreas = canvasRef.current._clickAreas || []
    canvasRef.current._clickAreas.push({ x: x - 25, y: y - 25, w: 50, h: 50, onClick })
  }

  // 电流流动
  function drawCurrentFlow(ctx, points, time, speed) {
    let totalLen = 0; const segs = []
    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1].x - points[i].x, dy = points[i + 1].y - points[i].y
      const len = Math.sqrt(dx * dx + dy * dy)
      segs.push({ ...points[i], ex: points[i + 1].x, ey: points[i + 1].y, len }); totalLen += len
    }
    ctx.fillStyle = '#FFEB3B'
    const n = Math.max(4, Math.floor(totalLen / 50))
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
  //  Tab2 器材绘制（实物风格）
  // ================================================================

  function drawCompIcon(ctx, x, y, type, size) {
    ctx.save(); ctx.translate(x, y)
    if (type === 'battery') {
      ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(-size * 0.4, -size * 0.6); ctx.lineTo(-size * 0.4, size * 0.6); ctx.stroke()
      ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(size * 0.4, -size * 0.3); ctx.lineTo(size * 0.4, size * 0.3); ctx.stroke()
    } else if (type === 'bulb') {
      ctx.strokeStyle = '#F9A825'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, size * 0.5, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(-size * 0.3, -size * 0.3); ctx.lineTo(size * 0.3, size * 0.3); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(size * 0.3, -size * 0.3); ctx.lineTo(-size * 0.3, size * 0.3); ctx.stroke()
    } else if (type === 'switch') {
      ctx.strokeStyle = '#666'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(-size * 0.4, 0, 2, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.arc(size * 0.4, 0, 2, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(-size * 0.4, 0); ctx.lineTo(size * 0.3, -size * 0.3); ctx.stroke()
    } else if (type === 'resistor') {
      ctx.strokeStyle = '#78909C'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'
      ctx.beginPath(); ctx.moveTo(-size * 0.6, 0)
      for (let i = 1; i <= 6; i++) ctx.lineTo(-size * 0.6 + (size * 1.2 / 6) * i, (i % 2 === 0 ? -1 : 1) * size * 0.25)
      ctx.stroke()
    }
    ctx.restore()
  }

  function drawBuilderComp(ctx, comp, s) {
    const { x, y, type, rotation, closed } = comp
    const isDragging = s.dragId === comp.id

    ctx.save(); ctx.translate(x, y); ctx.rotate(rotation || 0)
    if (isDragging) ctx.globalAlpha = 0.6

    if (type === 'battery') {
      // 电源：长线+短线，实物风格外壳
      ctx.fillStyle = '#E8F5E9'; ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.roundRect(-32, -20, 64, 40, 4); ctx.fill(); ctx.stroke()
      ctx.strokeStyle = '#333'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(-12, -14); ctx.lineTo(-12, 14); ctx.stroke()
      ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(12, -7); ctx.lineTo(12, 7); ctx.stroke()
      ctx.fillStyle = '#E53935'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
      ctx.fillText('+', -12, -22); ctx.fillStyle = '#333'; ctx.fillText('−', 12, -14)
      ctx.fillStyle = '#388E3C'; ctx.font = '10px sans-serif'; ctx.textBaseline = 'top'
      ctx.fillText('12V', 0, 22)
    } else if (type === 'bulb') {
      ctx.fillStyle = '#FFFDE7'; ctx.strokeStyle = '#F9A825'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.strokeStyle = '#E65100'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(-10, -10); ctx.lineTo(10, 10); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(10, -10); ctx.lineTo(-10, 10); ctx.stroke()
      ctx.fillStyle = '#F57F17'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText('灯泡', 0, 24)
    } else if (type === 'switch') {
      const sw = closed !== false
      ctx.fillStyle = '#ECEFF1'; ctx.strokeStyle = '#90A4AE'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.roundRect(-32, -14, 64, 28, 4); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#666'; ctx.beginPath(); ctx.arc(-20, 0, 4, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(20, 0, 4, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = sw ? '#4CAF50' : '#F44336'; ctx.lineWidth = 3; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(-20, 0)
      if (sw) ctx.lineTo(20, 0); else ctx.lineTo(14, -14)
      ctx.stroke(); ctx.lineCap = 'butt'
      ctx.fillStyle = sw ? '#4CAF50' : '#F44336'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText(sw ? 'ON' : 'OFF', 0, 16)
    } else if (type === 'resistor') {
      ctx.fillStyle = '#EFEBE9'; ctx.strokeStyle = '#795548'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.roundRect(-32, -12, 64, 24, 3); ctx.fill(); ctx.stroke()
      // 色环
      const bands = ['#B71C1C', '#4CAF50', '#FF9800', '#FFD54F']
      bands.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(-22 + i * 14, -12, 7, 24) })
      ctx.fillStyle = '#333'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText('10Ω', 0, 14)
    }

    ctx.globalAlpha = 1; ctx.restore()

    // 接线柱
    const terms = getTerminals(comp)
    for (let i = 0; i < terms.length; i++) {
      const t = terms[i]
      const isHover = s.hoverTerm && s.hoverTerm.compId === comp.id && s.hoverTerm.termIdx === i
      ctx.fillStyle = isHover ? '#FF9800' : '#fff'
      ctx.strokeStyle = isHover ? '#E65100' : '#666'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(t.x, t.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      if (isHover) {
        ctx.strokeStyle = 'rgba(255,152,0,0.4)'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.arc(t.x, t.y, 13, 0, Math.PI * 2); ctx.stroke()
      }
    }
  }

  function drawBuilderWire(ctx, wire) {
    const fc = S.current.components.find(c => c.id === wire.from.compId)
    const tc = S.current.components.find(c => c.id === wire.to.compId)
    if (!fc || !tc) return
    const f = getTermPos(fc, wire.from.termIdx), t = getTermPos(tc, wire.to.termIdx)
    const midX = (f.x + t.x) / 2
    ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(midX, f.y); ctx.lineTo(midX, t.y); ctx.lineTo(t.x, t.y); ctx.stroke()
  }

  function getTerminals(comp) {
    const { x, y, rotation } = comp
    const c = Math.cos(rotation || 0), sn = Math.sin(rotation || 0)
    return [
      { x: x - 38 * c, y: y - 38 * sn },
      { x: x + 38 * c, y: y + 38 * sn },
    ]
  }

  function getTermPos(comp, idx) { return getTerminals(comp)[idx] }

  function findTerm(mx, my) {
    for (const comp of S.current.components) {
      const terms = getTerminals(comp)
      for (let i = 0; i < terms.length; i++) {
        if ((mx - terms[i].x) ** 2 + (my - terms[i].y) ** 2 < 225) return { compId: comp.id, termIdx: i }
      }
    }
    return null
  }

  function findComp(mx, my) {
    for (let i = S.current.components.length - 1; i >= 0; i--) {
      const c = S.current.components[i]
      if (Math.abs(mx - c.x) < 45 && Math.abs(my - c.y) < 30) return c
    }
    return null
  }

  // ================================================================
  //  交互
  // ================================================================
  const getMousePos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    const s = S.current

    // Tab1: 检查开关点击
    if (s.tab === 1) {
      const { x, y } = getMousePos(e)
      for (const area of (canvasRef.current._clickAreas || [])) {
        if (x >= area.x && x <= area.x + area.w && y >= area.y && y <= area.y + area.h) {
          area.onClick(); canvasRef.current._clickAreas = []; return
        }
      }
      canvasRef.current._clickAreas = []
      return
    }

    // Tab2
    const { x, y } = getMousePos(e)

    // 检查器材栏点击
    for (const area of (canvasRef.current._palAreas || [])) {
      if (x >= area.x && x <= area.x + area.w && y >= area.y && y <= area.y + area.h) {
        const id = s.nextId++
        s.components.push({ id, type: area.type, x: 300 + Math.random() * 200, y: 200 + Math.random() * 150, rotation: 0, closed: true })
        s.guideDismissed = true; forceUpdate(n => n + 1); return
      }
    }

    // 检查接线柱（开始连线）
    const term = findTerm(x, y)
    if (term) {
      s.connecting = { ...term, mx: x, my: y }; forceUpdate(n => n + 1); return
    }

    // 检查器材（开始拖拽）
    const comp = findComp(x, y)
    if (comp) {
      s.dragId = comp.id; s.dragOffX = x - comp.x; s.dragOffY = y - comp.y
      forceUpdate(n => n + 1); return
    }
  }, [])

  const handleMouseMove = useCallback((e) => {
    const s = S.current; const { x, y } = getMousePos(e)

    if (s.tab === 2 && s.dragId) {
      const comp = s.components.find(c => c.id === s.dragId)
      if (comp) { comp.x = x - s.dragOffX; comp.y = y - s.dragOffY; forceUpdate(n => n + 1) }
      return
    }

    if (s.tab === 2 && s.connecting) {
      s.connecting.mx = x; s.connecting.my = y
      const term = findTerm(x, y)
      s.hoverTerm = term && term.compId !== s.connecting.compId ? term : null
      forceUpdate(n => n + 1); return
    }

    // 悬停
    if (s.tab === 2) {
      s.hoverTerm = findTerm(x, y)
      canvasRef.current.style.cursor = s.hoverTerm ? 'crosshair' : findComp(x, y) ? 'grab' : 'default'
    }
  }, [])

  const handleMouseUp = useCallback(() => {
    const s = S.current
    if (s.dragId) { s.dragId = null; forceUpdate(n => n + 1); return }
    if (s.connecting) {
      // 检查是否磁吸到终端点
      const term = s.hoverTerm
      if (term && term.compId !== s.connecting.compId) {
        const exists = s.wires.some(w =>
          (w.from.compId === s.connecting.compId && w.from.termIdx === s.connecting.termIdx && w.to.compId === term.compId && w.to.termIdx === term.termIdx) ||
          (w.to.compId === s.connecting.compId && w.to.termIdx === s.connecting.termIdx && w.from.compId === term.compId && w.from.termIdx === term.termIdx))
        if (!exists) s.wires.push({ id: s.nextId++, from: { compId: s.connecting.compId, termIdx: s.connecting.termIdx }, to: term })
      }
      s.connecting = null; s.hoverTerm = null; forceUpdate(n => n + 1)
    }
  }, [])

  const handleContextMenu = useCallback((e) => {
    if (S.current.tab !== 2) return; e.preventDefault()
    const { x, y } = getMousePos(e)
    const comp = findComp(x, y)
    if (comp) {
      S.current.components = S.current.components.filter(c => c.id !== comp.id)
      S.current.wires = S.current.wires.filter(w => w.from.compId !== comp.id && w.to.compId !== comp.id)
      forceUpdate(n => n + 1)
    }
  }, [])

  const handleReset = useCallback(() => {
    const s = S.current
    s.components = []; s.wires = []; s.switchClosed = true; s.dragId = null; s.connecting = null
    forceUpdate(n => n + 1)
  }, [])

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <span style={styles.title}>简单电路</span>
        <div style={styles.actions}>
          <button style={tab === 1 ? styles.tabA : styles.tab} onClick={() => { S.current.tab = 1; setTab(1) }}>📖 电路演示</button>
          <button style={tab === 2 ? styles.tabA : styles.tab} onClick={() => { S.current.tab = 2; setTab(2) }}>🔧 自己动手</button>
          <div style={{ flex: 1 }} />
          <button style={styles.btn} onClick={handleReset}>↺ 重置</button>
        </div>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
          onContextMenu={handleContextMenu} />
      </div>
      <div style={styles.desc}>
        <b>简单电路</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          {tab === 1 ? '电路演示：矩形回路 · 点击开关通断 · 标准电路符号' : '自己动手：点击器材添加 · 拖拽移动 · 接线柱连线 · 右键删除'}
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
  tabA: { background: '#4A90D9', color: '#fff', border: '1px solid #4A90D9', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600 },
  btn: { background: '#f0f0f0', color: '#333', border: '1px solid #ddd', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  main: { flex: 1, display: 'flex', overflow: 'hidden' },
  desc: { padding: '8px 14px', background: '#f5f5f5', borderTop: '1px solid #ccc', fontSize: 13, color: '#333' },
}
