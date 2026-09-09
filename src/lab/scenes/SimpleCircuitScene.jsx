import { useState, useRef, useEffect, useCallback } from 'react'

/**
 * SimpleCircuitScene — 简单电路
 *
 * Tab1: 电路演示 — 标准电路符号 + 开关交互 + 灯泡亮暗
 * Tab2: 自己动手 — 拖拽器材搭建电路 + 仿真验证
 */

// ─── 颜色常量 ───
const C = {
  wire: '#333', wireOn: '#1565C0', wireOff: '#999',
  battery: '#333', batteryPlus: '#E53935',
  bulb: '#FFC107', bulbOff: '#e0e0e0', bulbOn: '#FFEB3B',
  switch: '#666', switchOn: '#4CAF50', switchOff: '#F44336',
  resistor: '#78909C',
  meter: '#1565C0',
  text: '#333', dim: '#888',
  bg: '#f0f4f8', panel: '#fff', border: '#ddd',
}

// ─── 电路预设 ───
const PRESETS = [
  { key: 'basic', name: '基础电路', desc: '电池 + 开关 + 灯泡' },
  { key: 'series', name: '串联电路', desc: '两灯泡串联，一灭全灭' },
  { key: 'parallel', name: '并联电路', desc: '两灯泡并联，互不影响' },
  { key: 'voltamp', name: '伏安法测电阻', desc: 'A表串联 + V表并联 + 变阻器' },
]

export default function SimpleCircuitScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const S = useRef({
    tab: 1,
    preset: 'basic',
    // 电路状态
    switchClosed: true,
    switch2Closed: true, // 第二个开关（并联）
    rheostat: 0.5,       // 变阻器滑片位置 0~1
    time: 0,
    // Tab2
    components: [],
    wires: [],
    dragging: null,
    connecting: null,
    simResult: null,
  })

  const [tab, setTab] = useState(1)
  const [preset, setPreset] = useState('basic')
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const R = createRenderer(canvas)
    canvasRef.current._R = R
    const loop = () => {
      S.current.time += 1 / 60
      render(R)
      animRef.current = requestAnimationFrame(loop)
    }
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
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H)
    const s = S.current
    if (s.tab === 1) renderDemo(ctx, W, H, s)
    else renderBuilder(ctx, W, H, s)
  }

  // ================================================================
  //  Tab 1：电路演示
  // ================================================================
  function renderDemo(ctx, W, H, s) {
    const margin = 20
    const circuitW = W * 0.55 - margin * 2
    const circuitH = H - 120
    const cx = margin, cy = 60

    // 电路画布
    ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.roundRect(cx, cy, circuitW, circuitH, 8); ctx.fill()
    ctx.strokeStyle = C.border; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(cx, cy, circuitW, circuitH, 8); ctx.stroke()

    // 标题
    ctx.fillStyle = C.text; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('🔌 电路演示', cx + 12, cy + 10)

    // 根据预设画电路
    const cw = circuitW, ch = circuitH - 40
    const ox = cx + cw / 2, oy = cy + ch / 2 + 20

    if (s.preset === 'basic') drawBasicCircuit(ctx, ox, oy, cw, ch, s)
    else if (s.preset === 'series') drawSeriesCircuit(ctx, ox, oy, cw, ch, s)
    else if (s.preset === 'parallel') drawParallelCircuit(ctx, ox, oy, cw, ch, s)
    else if (s.preset === 'voltamp') drawVoltAmpCircuit(ctx, ox, oy, cw, ch, s)

    // 右侧信息面板
    const px = W * 0.57, py = 60, pw = W * 0.41, ph = H - 120
    drawDemoPanel(ctx, px, py, pw, ph, s)
  }

  // ─── 基础电路：电池 + 开关 + 灯泡 ───
  function drawBasicCircuit(ctx, cx, cy, w, h, s) {
    const bw = w * 0.35, bh = h * 0.35
    // 节点
    const top = { x: cx, y: cy - bh }
    const bot = { x: cx, y: cy + bh }
    const left = { x: cx - bw, y: cy }
    const right = { x: cx + bw, y: cy }

    const on = s.switchClosed
    const wireColor = on ? C.wireOn : C.wireOff

    // 导线
    drawWire(ctx, left.x, left.y, top.x, top.y, wireColor, 2.5)
    drawWire(ctx, top.x, top.y, right.x, right.y, wireColor, 2.5)
    drawWire(ctx, right.x, right.y, bot.x, bot.y, wireColor, 2.5)
    drawWire(ctx, bot.x, bot.y, left.x, left.y, wireColor, 2.5)

    // 电流流动
    if (on) drawCurrentFlow(ctx, [left, top, right, bot, left], s.time, 0.5)

    // 电池（左侧）
    drawBatterySymbol(ctx, left.x, bot.y, left.x, top.y, 12)

    // 开关（上方）
    drawSwitchSymbol(ctx, top.x - 30, top.y, top.x + 30, top.y, on, () => {
      S.current.switchClosed = !S.current.switchClosed
      forceUpdate(n => n + 1)
    })

    // 灯泡（右侧）
    drawBulbSymbol(ctx, right.x, right.y, on ? 1.0 : 0, 20)
  }

  // ─── 串联电路 ───
  function drawSeriesCircuit(ctx, cx, cy, w, h, s) {
    const bw = w * 0.35, bh = h * 0.35
    const top = { x: cx, y: cy - bh }
    const bot = { x: cx, y: cy + bh }
    const left = { x: cx - bw, y: cy }
    const right = { x: cx + bw, y: cy }
    const midTop = { x: cx, y: cy - bh * 0.3 }
    const midBot = { x: cx, y: cy + bh * 0.3 }

    const on = s.switchClosed
    const wc = on ? C.wireOn : C.wireOff

    // 导线
    drawWire(ctx, left.x, left.y, top.x, top.y, wc, 2.5)
    drawWire(ctx, top.x, top.y, midTop.x, midTop.y, wc, 2.5)
    drawWire(ctx, midTop.x, midTop.y, right.x, right.y, wc, 2.5)
    drawWire(ctx, right.x, right.y, midBot.x, midBot.y, wc, 2.5)
    drawWire(ctx, midBot.x, midBot.y, bot.x, bot.y, wc, 2.5)
    drawWire(ctx, bot.x, bot.y, left.x, left.y, wc, 2.5)

    if (on) drawCurrentFlow(ctx, [left, top, midTop, right, midBot, bot, left], s.time, 0.5)

    drawBatterySymbol(ctx, left.x, bot.y, left.x, top.y, 12)
    drawSwitchSymbol(ctx, top.x - 25, top.y, top.x + 25, top.y, on, () => {
      S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1)
    })
    // 灯泡1（右上）
    drawBulbSymbol(ctx, right.x, midTop.y + (right.y - midTop.y) * 0.5, on ? 0.7 : 0, 16)
    // 灯泡2（右下）
    drawBulbSymbol(ctx, right.x, midBot.y + (bot.y - midBot.y) * 0.5, on ? 0.7 : 0, 16)

    ctx.fillStyle = C.text; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('串联：电流相等，电压分配', cx, cy + bh + 30)
  }

  // ─── 并联电路 ───
  function drawParallelCircuit(ctx, cx, cy, w, h, s) {
    const bw = w * 0.35, bh = h * 0.35
    const topL = { x: cx - bw * 0.5, y: cy - bh }
    const topR = { x: cx + bw * 0.5, y: cy - bh }
    const botL = { x: cx - bw * 0.5, y: cy + bh }
    const botR = { x: cx + bw * 0.5, y: cy + bh }
    const left = { x: cx - bw, y: cy }
    const right = { x: cx + bw, y: cy }

    const on = s.switchClosed
    const on2 = s.switch2Closed
    const wc = on ? C.wireOn : C.wireOff

    // 主回路导线
    drawWire(ctx, left.x, left.y, topL.x, topL.y, wc, 2.5)
    drawWire(ctx, topL.x, topL.y, topR.x, topR.y, wc, 2.5)
    drawWire(ctx, topR.x, topR.y, right.x, right.y, wc, 2.5)
    drawWire(ctx, right.x, right.y, botR.x, botR.y, wc, 2.5)
    drawWire(ctx, botR.x, botR.y, botL.x, botL.y, wc, 2.5)
    drawWire(ctx, botL.x, botL.y, left.x, left.y, wc, 2.5)

    // 支路1（左）
    drawWire(ctx, topL.x, topL.y, botL.x, botL.y, on && on2 ? C.wireOn : C.wireOff, 2)
    // 支路2（右）
    drawWire(ctx, topR.x, topR.y, botR.x, botR.y, on ? C.wireOn : C.wireOff, 2)

    if (on) drawCurrentFlow(ctx, [left, topL, topR, right, botR, botL, left], s.time, 0.5)

    drawBatterySymbol(ctx, left.x, botL.y, left.x, topL.y, 12)
    drawSwitchSymbol(ctx, topL.x, topL.y - 20, topR.x, topR.y - 20, on, () => {
      S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1)
    })
    // 灯泡1（左支路）
    drawBulbSymbol(ctx, (topL.x + botL.x) / 2, cy, on && on2 ? 1.0 : 0, 16)
    // 灯泡2（右支路）
    drawBulbSymbol(ctx, (topR.x + botR.x) / 2, cy, on ? 1.0 : 0, 16)

    // 开关2（控制灯泡1）
    drawSwitchSymbol(ctx, topL.x - 20, cy - 20, topL.x + 20, cy - 20, on2, () => {
      S.current.switch2Closed = !S.current.switch2Closed; forceUpdate(n => n + 1)
    })

    ctx.fillStyle = C.text; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('并联：电压相等，电流分配 · 点击上方开关控制左灯', cx, cy + bh + 30)
  }

  // ─── 伏安法测电阻 ───
  function drawVoltAmpCircuit(ctx, cx, cy, w, h, s) {
    const bw = w * 0.35, bh = h * 0.35
    const top = { x: cx, y: cy - bh }
    const bot = { x: cx, y: cy + bh }
    const left = { x: cx - bw, y: cy }
    const right = { x: cx + bw, y: cy }
    const midRight = { x: cx + bw * 0.7, y: cy - bh * 0.5 }

    const on = s.switchClosed
    const wc = on ? C.wireOn : C.wireOff

    // 主回路
    drawWire(ctx, left.x, left.y, top.x, top.y, wc, 2.5)
    drawWire(ctx, top.x, top.y, midRight.x, midRight.y, wc, 2.5)
    drawWire(ctx, midRight.x, midRight.y, right.x, right.y, wc, 2.5)
    drawWire(ctx, right.x, right.y, bot.x, bot.y, wc, 2.5)
    drawWire(ctx, bot.x, bot.y, left.x, left.y, wc, 2.5)

    if (on) drawCurrentFlow(ctx, [left, top, midRight, right, bot, left], s.time, 0.5)

    drawBatterySymbol(ctx, left.x, bot.y, left.x, top.y, 12)
    drawSwitchSymbol(ctx, top.x - 25, top.y, top.x + 25, top.y, on, () => {
      S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1)
    })

    // 变阻器（右上到右侧）
    drawRheostatSymbol(ctx, midRight.x, midRight.y, right.x, right.y, s.rheostat, (val) => {
      S.current.rheostat = val; forceUpdate(n => n + 1)
    })

    // 待测电阻（下方）
    drawResistorSymbol(ctx, bot.x, bot.y, left.x, left.y, 10)

    // 电流表 A（左侧，串联）
    drawMeterSymbol(ctx, left.x, cy - bh * 0.3, 'A', on ? (12 / (10 + 5 * s.rheostat)).toFixed(2) + 'A' : '0A')

    // 电压表 V（跨电阻，右侧）
    const Rload = 10
    const Rrheo = 5 * s.rheostat
    const I = on ? 12 / (Rload + Rrheo) : 0
    const U = I * Rload
    drawMeterSymbol(ctx, cx + bw * 0.3, cy + bh * 0.3, 'V', U.toFixed(1) + 'V')

    ctx.fillStyle = C.text; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('伏安法：A表串联、V表并联 · 拖动变阻器改变电路', cx, cy + bh + 30)
  }

  // ─── 信息面板 ───
  function drawDemoPanel(ctx, x, y, w, h, s) {
    ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill()
    ctx.strokeStyle = C.border; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.stroke()

    ctx.fillStyle = C.text; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('📖 电路说明', x + 12, y + 12)

    const info = PRESETS.find(p => p.key === s.preset)
    ctx.fillStyle = C.dim; ctx.font = '12px sans-serif'
    ctx.fillText(info?.desc || '', x + 12, y + 34)

    // 知识点
    const knowledge = {
      basic: ['电流方向：从正极出发，经外电路回到负极', '开关闭合 → 通路 → 灯泡亮', '开关断开 → 断路 → 灯泡灭', '电流大小：I = ε / (R + r)'],
      series: ['串联电路电流处处相等', 'I₁ = I₂ = I', '总电阻 R总 = R₁ + R₂', '电压分配：U₁ + U₂ = U总', '一灯灭 → 全灭（断路）'],
      parallel: ['并联电路电压处处相等', 'U₁ = U₂ = U', '总电阻：1/R总 = 1/R₁ + 1/R₂', '电流分配：I₁ + I₂ = I总', '一灯灭 → 另一灯仍亮'],
      voltamp: ['电流表串联接入（测电流）', '电压表并联在被测元件两端', '变阻器改变总电阻 → 改变电流', 'R = U / I（伏安法测电阻）'],
    }

    let ky = y + 60
    ctx.font = '12px sans-serif'
    for (const line of knowledge[s.preset] || []) {
      ctx.fillStyle = '#555'
      ctx.fillText('• ' + line, x + 12, ky)
      ky += 22
    }

    // 公式
    ky += 10
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 13px sans-serif'
    ctx.fillText('核心公式', x + 12, ky); ky += 22
    ctx.fillStyle = '#333'; ctx.font = '13px monospace'
    ctx.fillText('I = ε / (R + r)', x + 12, ky); ky += 20
    ctx.fillText('U = ε - I·r', x + 12, ky); ky += 20
    ctx.fillText('P = I²R = U²/R', x + 12, ky)

    ctx.textBaseline = 'alphabetic'
  }

  // ================================================================
  //  电路符号绘制
  // ================================================================

  // 导线
  function drawWire(ctx, x1, y1, x2, y2, color, width) {
    ctx.strokeStyle = color || C.wire; ctx.lineWidth = width || 2
    ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
  }

  // 电池符号（长短线）
  function drawBatterySymbol(ctx, x1, y1, x2, y2, emf) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
    const dx = x2 - x1, dy = y2 - y1
    const len = Math.sqrt(dx * dx + dy * dy)
    const ux = dx / len, uy = dy / len
    const nx = -uy, ny = ux

    // 长线（正极）
    ctx.strokeStyle = C.battery; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(mx + nx * 10, my + ny * 10); ctx.lineTo(mx - nx * 10, my - ny * 10); ctx.stroke()
    // 短线（负极）
    ctx.lineWidth = 4
    ctx.beginPath(); ctx.moveTo(mx + nx * 5 + ux * 7, my + ny * 5 + uy * 7); ctx.lineTo(mx - nx * 5 + ux * 7, my - ny * 5 + uy * 7); ctx.stroke()

    ctx.fillStyle = C.batteryPlus; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('+', mx + nx * 18, my + ny * 18)
    ctx.fillStyle = C.text; ctx.font = 'bold 14px sans-serif'
    ctx.fillText('−', mx - nx * 18, my - ny * 18)
    ctx.fillStyle = C.dim; ctx.font = '10px sans-serif'
    ctx.fillText(`${emf}V`, mx + nx * 30, my + ny * 30)
  }

  // 开关符号
  function drawSwitchSymbol(ctx, x1, y1, x2, y2, closed, onClick) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2

    // 端点
    ctx.fillStyle = '#fff'; ctx.strokeStyle = C.switch; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(x1, y1, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.arc(x2, y2, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke()

    // 触片
    ctx.strokeStyle = closed ? C.switchOn : C.switchOff; ctx.lineWidth = 3; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(x1, y1)
    if (closed) ctx.lineTo(x2, y2); else ctx.lineTo(x2 - 5, y2 - 18)
    ctx.stroke(); ctx.lineCap = 'butt'

    // 状态标签
    ctx.fillStyle = closed ? C.switchOn : C.switchOff
    ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(closed ? 'ON' : 'OFF', mx, Math.min(y1, y2) + 8)
    ctx.textBaseline = 'alphabetic'

    // 点击热区
    if (!canvasRef.current._clickAreas) canvasRef.current._clickAreas = []
    canvasRef.current._clickAreas.push({
      x: Math.min(x1, x2) - 15, y: Math.min(y1, y2) - 25,
      w: Math.abs(x2 - x1) + 30, h: Math.abs(y2 - y1) + 35,
      onClick,
    })
  }

  // 灯泡符号
  function drawBulbSymbol(ctx, x, y, brightness, r) {
    // 外圈
    ctx.fillStyle = brightness > 0.1 ? C.bulbOn : C.bulbOff
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = brightness > 0.1 ? '#F9A825' : '#bbb'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()

    // × 灯丝
    ctx.strokeStyle = brightness > 0.1 ? '#E65100' : '#999'; ctx.lineWidth = 1.5
    const s = r * 0.5
    ctx.beginPath(); ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.stroke()

    // 发光效果
    if (brightness > 0.3) {
      const glow = ctx.createRadialGradient(x, y, r, x, y, r * 2.5)
      glow.addColorStop(0, `rgba(255,235,59,${brightness * 0.3})`)
      glow.addColorStop(1, 'rgba(255,235,59,0)')
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, r * 2.5, 0, Math.PI * 2); ctx.fill()
    }
  }

  // 电阻符号（锯齿）
  function drawResistorSymbol(ctx, x1, y1, x2, y2, R) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
    const dx = x2 - x1, dy = y2 - y1
    const len = Math.sqrt(dx * dx + dy * dy)
    const ux = dx / len, uy = dy / len
    const nx = -uy, ny = ux

    ctx.strokeStyle = C.resistor; ctx.lineWidth = 2; ctx.lineJoin = 'round'
    ctx.beginPath()
    const coils = 6, amp = 7
    for (let i = 0; i <= coils; i++) {
      const t = i / coils
      const px = mx + ux * (-len * 0.3 + len * 0.6 * t)
      const py = my + uy * (-len * 0.3 + len * 0.6 * t)
      const dir = i % 2 === 0 ? 1 : -1
      ctx.lineTo(px + nx * amp * dir, py + ny * amp * dir)
    }
    ctx.stroke()

    ctx.fillStyle = C.text; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(`R=${R}Ω`, mx + nx * 18, my + ny * 18)
  }

  // 变阻器符号
  function drawRheostatSymbol(ctx, x1, y1, x2, y2, pos, onDrag) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
    const dx = x2 - x1, dy = y2 - y1
    const len = Math.sqrt(dx * dx + dy * dy)
    const ux = dx / len, uy = dy / len
    const nx = -uy, ny = ux

    // 电阻体
    ctx.strokeStyle = C.resistor; ctx.lineWidth = 2; ctx.lineJoin = 'round'
    ctx.beginPath()
    const coils = 8, amp = 7
    for (let i = 0; i <= coils; i++) {
      const t = i / coils
      const px = mx + ux * (-len * 0.35 + len * 0.7 * t)
      const py = my + uy * (-len * 0.35 + len * 0.7 * t)
      const dir = i % 2 === 0 ? 1 : -1
      ctx.lineTo(px + nx * amp * dir, py + ny * amp * dir)
    }
    ctx.stroke()

    // 滑片（箭头）
    const sliderT = 0.1 + pos * 0.8
    const sx = mx + ux * (-len * 0.35 + len * 0.7 * sliderT)
    const sy = my + uy * (-len * 0.35 + len * 0.7 * sliderT)
    ctx.fillStyle = '#F44336'; ctx.beginPath()
    ctx.moveTo(sx + nx * 14, sy + ny * 14)
    ctx.lineTo(sx + nx * 4 - ux * 5, sy + ny * 4 - uy * 5)
    ctx.lineTo(sx + nx * 4 + ux * 5, sy + ny * 4 + uy * 5)
    ctx.closePath(); ctx.fill()

    // 滑片点击热区
    if (!canvasRef.current._clickAreas) canvasRef.current._clickAreas = []
    canvasRef.current._clickAreas.push({
      x: sx - 20, y: sy - 20, w: 40, h: 40,
      onClick: () => {
        // 简单切换三个位置
        const newPos = pos < 0.33 ? 0.5 : pos < 0.66 ? 0.9 : 0.1
        onDrag(newPos)
      },
      cursor: 'grab',
    })

    ctx.fillStyle = C.dim; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('变阻器', mx + nx * 22, my + ny * 22)
  }

  // 仪表符号
  function drawMeterSymbol(ctx, x, y, type, value) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = C.meter; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = C.meter; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(type, x, y - 3)
    ctx.fillStyle = C.text; ctx.font = '9px monospace'
    ctx.fillText(value, x, y + 10)
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
    const dotCount = Math.max(3, Math.floor(totalLen / 60))
    for (let d = 0; d < dotCount; d++) {
      let pos = ((time * speed * 100 + d * (totalLen / dotCount)) % totalLen)
      for (const seg of segs) {
        if (pos <= seg.len) {
          const ratio = pos / seg.len
          const px = seg.x + (seg.ex - seg.x) * ratio
          const py = seg.y + (seg.ey - seg.y) * ratio
          ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill()
          break
        }
        pos -= seg.len
      }
    }
  }

  // ================================================================
  //  Tab 2：自己动手搭电路
  // ================================================================
  function renderBuilder(ctx, W, H, s) {
    // 画布区
    const canvasArea = { x: 10, y: 60, w: W - 220, h: H - 120 }
    ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.roundRect(canvasArea.x, canvasArea.y, canvasArea.w, canvasArea.h, 8); ctx.fill()
    ctx.strokeStyle = C.border; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(canvasArea.x, canvasArea.y, canvasArea.w, canvasArea.h, 8); ctx.stroke()

    // 网格
    ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 0.5
    const gridSize = 30
    for (let gx = canvasArea.x + gridSize; gx < canvasArea.x + canvasArea.w; gx += gridSize) {
      ctx.beginPath(); ctx.moveTo(gx, canvasArea.y); ctx.lineTo(gx, canvasArea.y + canvasArea.h); ctx.stroke()
    }
    for (let gy = canvasArea.y + gridSize; gy < canvasArea.y + canvasArea.h; gy += gridSize) {
      ctx.beginPath(); ctx.moveTo(canvasArea.x, gy); ctx.lineTo(canvasArea.x + canvasArea.w, gy); ctx.stroke()
    }

    ctx.fillStyle = C.text; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('🔧 自己动手搭电路', canvasArea.x + 12, canvasArea.y + 10)

    // 提示
    ctx.fillStyle = C.dim; ctx.font = '12px sans-serif'
    ctx.fillText('从右侧拖拽器材到画布，点击接线柱连线', canvasArea.x + 12, canvasArea.y + 30)

    // 画布上已有的器材
    for (const comp of s.components) {
      drawBuilderComponent(ctx, comp, s)
    }
    // 画布上已有的导线
    for (const wire of s.wires) {
      ctx.strokeStyle = C.wireOn; ctx.lineWidth = 2; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(wire.x1, wire.y1); ctx.lineTo(wire.x2, wire.y2); ctx.stroke()
    }

    // 右侧器材栏
    const paletteX = W - 200, paletteY = 60, paletteW = 190, paletteH = H - 120
    ctx.fillStyle = '#f8f9fa'
    ctx.beginPath(); ctx.roundRect(paletteX, paletteY, paletteW, paletteH, 8); ctx.fill()
    ctx.strokeStyle = C.border; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(paletteX, paletteY, paletteW, paletteH, 8); ctx.stroke()

    ctx.fillStyle = C.text; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('🧰 电学器材', paletteX + 12, paletteY + 10)

    const paletteItems = [
      { type: 'battery', name: '电池 12V', icon: '🔋' },
      { type: 'bulb', name: '灯泡', icon: '💡' },
      { type: 'switch', name: '开关', icon: '🔘' },
      { type: 'resistor', name: '电阻 10Ω', icon: '⟿' },
      { type: 'ammeter', name: '电流表 A', icon: 'Ⓐ' },
      { type: 'voltmeter', name: '电压表 V', icon: 'Ⓥ' },
      { type: 'wire', name: '导线', icon: '─' },
    ]

    let iy = paletteY + 35
    for (const item of paletteItems) {
      ctx.fillStyle = '#fff'
      ctx.beginPath(); ctx.roundRect(paletteX + 8, iy, paletteW - 16, 36, 6); ctx.fill()
      ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.roundRect(paletteX + 8, iy, paletteW - 16, 36, 6); ctx.stroke()

      ctx.fillStyle = C.text; ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText(`${item.icon} ${item.name}`, paletteX + 16, iy + 18)

      // 点击添加
      if (!canvasRef.current._clickAreas) canvasRef.current._clickAreas = []
      canvasRef.current._clickAreas.push({
        x: paletteX + 8, y: iy, w: paletteW - 16, h: 36,
        onClick: () => {
          S.current.components.push({
            type: item.type, x: canvasArea.x + canvasArea.w / 2, y: canvasArea.y + canvasArea.h / 2,
            rotation: 0, value: item.type === 'battery' ? 12 : item.type === 'resistor' ? 10 : 0,
          })
          forceUpdate(n => n + 1)
        },
      })
      iy += 42
    }

    ctx.textBaseline = 'alphabetic'
  }

  // 画布上绘制器材
  function drawBuilderComponent(ctx, comp, s) {
    const { x, y, type, rotation } = comp
    ctx.save(); ctx.translate(x, y); ctx.rotate(rotation || 0)

    if (type === 'battery') {
      drawBatterySymbol(ctx, 0, -30, 0, 30, comp.value || 12)
    } else if (type === 'bulb') {
      drawBulbSymbol(ctx, 0, 0, s.switchClosed ? 0.8 : 0, 18)
    } else if (type === 'switch') {
      drawSwitchSymbol(ctx, -25, 0, 25, 0, s.switchClosed, () => {
        S.current.switchClosed = !S.current.switchClosed; forceUpdate(n => n + 1)
      })
    } else if (type === 'resistor') {
      drawResistorSymbol(ctx, -30, 0, 30, 0, comp.value || 10)
    } else if (type === 'ammeter') {
      drawMeterSymbol(ctx, 0, 0, 'A', '0.00A')
    } else if (type === 'voltmeter') {
      drawMeterSymbol(ctx, 0, 0, 'V', '0.0V')
    } else if (type === 'wire') {
      drawWire(ctx, -30, 0, 30, 0, C.wire, 2)
    }

    ctx.restore()

    // 接线柱（两个端点）
    const terminals = getTerminals(comp)
    for (const t of terminals) {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#666'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(t.x, t.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    }
  }

  function getTerminals(comp) {
    const { x, y, type, rotation } = comp
    const c = Math.cos(rotation || 0), sn = Math.sin(rotation || 0)
    const offset = type === 'ammeter' || type === 'voltmeter' ? 20 : 30
    return [
      { x: x - offset * c, y: y - offset * sn, compId: comp.type + '_' + x + '_a' },
      { x: x + offset * c, y: y + offset * sn, compId: comp.type + '_' + x + '_b' },
    ]
  }

  // ================================================================
  //  交互
  // ================================================================
  const handleClick = useCallback((e) => {
    const canvas = canvasRef.current; if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top

    // 清除旧热区
    const areas = canvas._clickAreas || []
    canvas._clickAreas = []

    for (const area of areas) {
      if (sx >= area.x && sx <= area.x + area.w && sy >= area.y && sy <= area.y + area.h) {
        area.onClick()
        return
      }
    }
  }, [])

  const handleReset = useCallback(() => {
    S.current.switchClosed = true; S.current.switch2Closed = true
    S.current.rheostat = 0.5; S.current.components = []; S.current.wires = []
    forceUpdate(n => n + 1)
  }, [])

  const switchTab = useCallback((newTab) => {
    S.current.tab = newTab; setTab(newTab)
    canvasRef.current._clickAreas = []
  }, [])

  const switchPreset = useCallback((key) => {
    S.current.preset = key; setPreset(key)
    S.current.switchClosed = true; S.current.switch2Closed = true
    canvasRef.current._clickAreas = []
    forceUpdate(n => n + 1)
  }, [])

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <span style={styles.title}>电学实验平台</span>
        <div style={styles.actions}>
          {/* Tab 切换 */}
          <button style={tab === 1 ? styles.tabActive : styles.tab} onClick={() => switchTab(1)}>📖 电路演示</button>
          <button style={tab === 2 ? styles.tabActive : styles.tab} onClick={() => switchTab(2)}>🔧 自己动手</button>
          <div style={styles.sep} />
          {tab === 1 && PRESETS.map(p => (
            <button key={p.key} style={preset === p.key ? styles.presetActive : styles.preset}
              onClick={() => switchPreset(p.key)}>{p.name}</button>
          ))}
          <div style={{ flex: 1 }} />
          <button style={styles.btn} onClick={handleReset}>↺ 重置</button>
        </div>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', cursor: 'pointer' }} onClick={handleClick} />
      </div>
      <div style={styles.desc}>
        <b>电学实验</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          {tab === 1 ? '电路演示：标准电路符号 · 点击开关通断 · 灯泡亮暗 · 电流流动动画' : '自己动手：从右侧拖拽器材搭建电路 · 连线 · 仿真验证'}
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
  preset: { background: '#f0f0f0', color: '#666', border: '1px solid #ddd', borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer' },
  presetActive: { background: '#FF9800', color: '#fff', border: '1px solid #FF9800', borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer', fontWeight: 600 },
  btn: { background: '#f0f0f0', color: '#333', border: '1px solid #ddd', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  sep: { width: 1, height: 20, background: '#ddd' },
  main: { flex: 1, display: 'flex', overflow: 'hidden' },
  desc: { padding: '8px 14px', background: '#f5f5f5', borderTop: '1px solid #ccc', fontSize: 13, color: '#333' },
}
