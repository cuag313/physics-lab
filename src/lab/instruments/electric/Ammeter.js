import { InstrumentBase } from '../InstrumentBase'

/**
 * 电流表（学生用 J0407 型）
 * 接线柱：neg(-, 黑)、mid(0.6A, 红)、full(3A, 红) —— 导线接哪个柱就是哪个量程
 * 表盘双排刻度：上排 0~3A，下排 0~0.6A；指针偏转角按当前量程换算
 * 电流带符号：正向偏转 / 反偏撞 -5° 限位（接反）/ 零电流回零
 * 注意：理想电流表内阻≈0
 */

/** 量程（由接线柱决定） */
const RANGES = { '0.6': 0.6, '3': 3 }
/** 满偏角（指针零位 → 满刻度的扫角，与表盘 270° 弧一致） */
const FULL_SWEEP = Math.PI * 1.5
/** 反偏限位：撞到零位左侧 -5° */
const REVERSE_STOP = -5 * Math.PI / 180
/** 表盘分度：30 格（0.6A 每格 0.02A；3A 每格 0.1A），主刻度每 10 格 */
const DIVISIONS = 30

export class Ammeter extends InstrumentBase {
  constructor(x = 0, y = 0) {
    super({
      type: 'ammeter', x, y,
      width: 0.8, height: 0.8,
      category: 'electric',
      displayName: '电流表',
      icon: 'Ⓐ'
    })

    this.params = {
      // 量程由接线柱决定（mid→0.6A，full→3A），不再是滑块
      selectedRange: { value: '0.6', label: '量程', unit: 'A' },
      internalResistance: { value: 0.001, min: 0, max: 100, step: 0.001, label: '内阻', unit: 'Ω' }
    }

    this.state = {
      reading: 0,    // 当前读数（带符号）
      angle: 0,      // 指针角度（rad，零位为 0，满偏 FULL_SWEEP）
      reverse: false // 正负接线柱接反
    }

    this.addPort({ id: 'neg', type: 'electrical', dx: -0.38, dy: 0.3, label: '−', color: '#1c1f24' })
    this.addPort({ id: 'mid', type: 'electrical', dx: 0, dy: 0.32, label: '0.6', color: '#e53935' })
    this.addPort({ id: 'full', type: 'electrical', dx: 0.38, dy: 0.3, label: '3', color: '#e53935' })
  }

  get resistance() { return this.getParam('internalResistance') }

  /** 当前量程（A） */
  get range() { return RANGES[this.getParam('selectedRange')] ?? RANGES['0.6'] }

  /** 按实际接线的量程柱决定 selectedRange：full(3A) 优先，其次 mid(0.6A) */
  syncRangeFromPorts() {
    const full = this.getPort('full')
    const mid = this.getPort('mid')
    if (full?.isConnected) this.params.selectedRange.value = '3'
    else if (mid?.isConnected) this.params.selectedRange.value = '0.6'
  }

  update(dt) {
    this.syncRangeFromPorts()
    const I = this.current // 带符号：正=电流从 + 柱流入
    if (I < -1e-6) {
      // 反偏：直接撞到 -5° 限位，不平滑
      this.state.reverse = true
      this.state.angle = REVERSE_STOP
    } else {
      this.state.reverse = false
      const target = Math.min(I / this.range, 1) * FULL_SWEEP
      this.state.angle += (target - this.state.angle) * Math.min(1, dt * 6)
    }
    this.state.reading = I
  }

  render(ctx, renderer) {
    const [sx, sy] = renderer.worldToScreen(this.x, this.y)
    const sw = this.width * renderer.scale
    const sh = this.height * renderer.scale
    const r = Math.min(sw, sh) * 0.42

    // 表盘背景
    ctx.beginPath()
    ctx.arc(sx, sy, r, 0, Math.PI * 2)
    ctx.fillStyle = '#1a1a2e'
    ctx.fill()
    ctx.strokeStyle = this.selected ? '#4FC3F7' : '#555'
    ctx.lineWidth = this.selected ? 2.5 : 2
    ctx.stroke()

    // 刻度弧（270°：左下 135° 起，顺时针到右下 45°）
    const startAngle = Math.PI * 0.75
    const sweep = FULL_SWEEP

    ctx.strokeStyle = '#666'
    ctx.lineWidth = 1
    for (let i = 0; i <= DIVISIONS; i++) {
      const angle = startAngle + sweep * (i / DIVISIONS)
      const major = i % 10 === 0
      const inner = major ? r * 0.76 : r * 0.84
      const outer = r * 0.92
      ctx.beginPath()
      ctx.moveTo(sx + Math.cos(angle) * inner, sy + Math.sin(angle) * inner)
      ctx.lineTo(sx + Math.cos(angle) * outer, sy + Math.sin(angle) * outer)
      ctx.stroke()
    }

    // 双排刻度数字：上排 0~3A（外圈），下排 0~0.6A（内圈）
    const drawRow = (labels, radius, digits, color) => {
      ctx.fillStyle = color
      ctx.font = `${Math.max(8, r * 0.16)}px monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (let k = 0; k < labels.length; k++) {
        const angle = startAngle + sweep * (k / (labels.length - 1))
        ctx.fillText(labels[k].toFixed(digits), sx + Math.cos(angle) * radius, sy + Math.sin(angle) * radius)
      }
    }
    drawRow([0, 1, 2, 3], r * 0.66, 0, '#bbb')
    drawRow([0, 0.2, 0.4, 0.6], r * 0.5, 1, '#888')

    // 指针（角度直接来自 update 的带符号阻尼动画）
    const needleAngle = startAngle + this.state.angle
    ctx.strokeStyle = '#f44'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(sx + Math.cos(needleAngle) * r * 0.72, sy + Math.sin(needleAngle) * r * 0.72)
    ctx.stroke()

    // 中心轴
    ctx.fillStyle = '#f44'
    ctx.beginPath()
    ctx.arc(sx, sy, 3, 0, Math.PI * 2)
    ctx.fill()

    // 标识 "A"
    ctx.fillStyle = '#4FC3F7'
    ctx.font = `bold ${r * 0.3}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('A', sx, sy + r * 0.35)

    // 反偏：表盘边缘闪红 + 提示
    if (this.state.reverse) {
      const flash = 0.55 + 0.45 * Math.sin(performance.now() / 140)
      ctx.strokeStyle = `rgba(229,57,53,${flash.toFixed(2)})`
      ctx.lineWidth = 3.5
      ctx.beginPath()
      ctx.arc(sx, sy, r, 0, Math.PI * 2)
      ctx.stroke()
    }

    // 读数（带符号）
    ctx.fillStyle = this.state.reverse ? '#e53935' : '#4CAF50'
    ctx.font = 'bold 12px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(`${this.state.reading.toFixed(3)} A`, sx, sy + r + 6)
    if (this.state.reverse) {
      ctx.fillStyle = '#e53935'
      ctx.font = 'bold 11px sans-serif'
      ctx.fillText('正负接线柱接反', sx, sy + r + 22)
    }

    // 三柱引线（neg 黑 / mid 红 / full 红）
    const lead = (port, fromX) => {
      const p = port.getWorldPos(this)
      const [px, py] = renderer.worldToScreen(p.x, p.y)
      ctx.beginPath()
      ctx.moveTo(fromX, sy + r)
      ctx.lineTo(px, py)
      ctx.stroke()
    }
    ctx.strokeStyle = '#aaa'
    ctx.lineWidth = 2
    lead(this.ports[0], sx - sw * 0.22) // neg
    lead(this.ports[1], sx)             // mid
    lead(this.ports[2], sx + sw * 0.22) // full

    this.renderPorts(ctx, renderer)
    this.renderSelection(ctx, renderer)
  }
}
