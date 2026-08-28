import { InstrumentBase } from '../InstrumentBase'

/**
 * 电压表
 * 端口：正(+)、负(-)
 * 状态：读数（由电路引擎更新）
 * 注意：理想电压表内阻→∞
 */
export class Voltmeter extends InstrumentBase {
  constructor(x = 0, y = 0) {
    super({
      type: 'voltmeter', x, y,
      width: 0.8, height: 0.8,
      category: 'electric',
      displayName: '电压表',
      icon: 'Ⓥ'
    })

    this.params = {
      range: { value: 15, min: 0.1, max: 500, step: 0.1, label: '量程', unit: 'V' },
      internalResistance: { value: 10000, min: 100, max: 1e6, step: 100, label: '内阻', unit: 'Ω' }
    }

    this.state = {
      reading: 0,
      needleAngle: 0
    }

    this.addPort({ id: 'pos', type: 'electrical', dx: 0.4, dy: 0.3, label: '+', color: '#f44' })
    this.addPort({ id: 'neg', type: 'electrical', dx: -0.4, dy: 0.3, label: '−', color: '#44f' })
  }

  get resistance() { return this.getParam('internalResistance') }

  update(dt) {
    const target = (Math.abs(this.voltage) / this.getParam('range')) * Math.PI * 0.75
    this.state.needleAngle += (target - this.state.needleAngle) * Math.min(1, dt * 8)
    this.state.reading = Math.abs(this.voltage)
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

    // 刻度弧
    const startAngle = Math.PI * 0.75
    const endAngle = Math.PI * 0.25
    const range = this.getParam('range')

    ctx.strokeStyle = '#666'
    ctx.lineWidth = 1
    const ticks = 10
    for (let i = 0; i <= ticks; i++) {
      const angle = startAngle + (endAngle - startAngle + Math.PI * 2) % (Math.PI * 2) * (i / ticks)
      const inner = r * 0.78
      const outer = r * 0.9
      ctx.beginPath()
      ctx.moveTo(sx + Math.cos(angle) * inner, sy + Math.sin(angle) * inner)
      ctx.lineTo(sx + Math.cos(angle) * outer, sy + Math.sin(angle) * outer)
      ctx.stroke()

      if (i % 2 === 0) {
        ctx.fillStyle = '#999'
        ctx.font = `${Math.max(8, r * 0.18)}px monospace`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText((range * i / ticks).toFixed(0), sx + Math.cos(angle) * r * 0.65, sy + Math.sin(angle) * r * 0.65)
      }
    }

    // 指针（直接从电压计算角度，不依赖update）
    const targetAngle = (Math.abs(this.voltage) / range) * Math.PI * 0.75
    this.state.needleAngle += (targetAngle - this.state.needleAngle) * 0.15
    this.state.reading = Math.abs(this.voltage)
    const needleAngle = startAngle + (endAngle - startAngle + Math.PI * 2) % (Math.PI * 2) *
      Math.min(1, this.state.needleAngle / (Math.PI * 0.75))

    ctx.strokeStyle = '#4488ff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(sx + Math.cos(needleAngle) * r * 0.7, sy + Math.sin(needleAngle) * r * 0.7)
    ctx.stroke()

    ctx.fillStyle = '#4488ff'
    ctx.beginPath()
    ctx.arc(sx, sy, 3, 0, Math.PI * 2)
    ctx.fill()

    // 标识 "V"
    ctx.fillStyle = '#FF9800'
    ctx.font = `bold ${r * 0.3}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('V', sx, sy + r * 0.35)

    // 读数
    ctx.fillStyle = '#4CAF50'
    ctx.font = 'bold 12px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(`${this.state.reading.toFixed(2)} V`, sx, sy + r + 6)

    // 引线
    ctx.strokeStyle = '#aaa'
    ctx.lineWidth = 2
    const lp = this.ports[0].getWorldPos(this)
    const rp = this.ports[1].getWorldPos(this)
    const [lpx, lpy] = renderer.worldToScreen(lp.x, lp.y)
    const [rpx, rpy] = renderer.worldToScreen(rp.x, rp.y)
    ctx.beginPath()
    ctx.moveTo(sx + sw * 0.2, sy + r)
    ctx.lineTo(lpx, lpy)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(sx - sw * 0.2, sy + r)
    ctx.lineTo(rpx, rpy)
    ctx.stroke()

    this.renderPorts(ctx, renderer)
    this.renderSelection(ctx, renderer)
  }
}
