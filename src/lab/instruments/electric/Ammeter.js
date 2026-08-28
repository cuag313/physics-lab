import { InstrumentBase } from '../InstrumentBase'

/**
 * 电流表
 * 端口：正(+)、负(-)
 * 状态：读数（由电路引擎更新）
 * 注意：理想电流表内阻≈0
 */
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
      range: { value: 3, min: 0.001, max: 100, step: 0.001, label: '量程', unit: 'A' },
      internalResistance: { value: 0.001, min: 0, max: 100, step: 0.001, label: '内阻', unit: 'Ω' }
    }

    this.state = {
      reading: 0,     // 当前读数
      needleAngle: 0  // 指针角度（动画用）
    }

    this.addPort({ id: 'pos', type: 'electrical', dx: 0.4, dy: 0.3, label: '+', color: '#f44' })
    this.addPort({ id: 'neg', type: 'electrical', dx: -0.4, dy: 0.3, label: '−', color: '#44f' })
  }

  get resistance() { return this.getParam('internalResistance') }

  update(dt) {
    // 平滑指针动画
    const target = (this.current / this.getParam('range')) * Math.PI * 0.75
    this.state.needleAngle += (target - this.state.needleAngle) * Math.min(1, dt * 8)
    this.state.reading = Math.abs(this.current)
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

      // 数值标注
      if (i % 2 === 0) {
        ctx.fillStyle = '#999'
        ctx.font = `${Math.max(8, r * 0.18)}px monospace`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const val = (range * i / ticks).toFixed(range < 1 ? 3 : 1)
        ctx.fillText(val, sx + Math.cos(angle) * r * 0.65, sy + Math.sin(angle) * r * 0.65)
      }
    }

    // 指针（直接从电流计算角度，不依赖update）
    const targetAngle = (Math.abs(this.current) / range) * Math.PI * 0.75
    this.state.needleAngle += (targetAngle - this.state.needleAngle) * 0.15
    this.state.reading = Math.abs(this.current)
    const needleAngle = startAngle + (endAngle - startAngle + Math.PI * 2) % (Math.PI * 2) *
      Math.min(1, this.state.needleAngle / (Math.PI * 0.75))

    ctx.strokeStyle = '#f44'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(sx + Math.cos(needleAngle) * r * 0.7, sy + Math.sin(needleAngle) * r * 0.7)
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

    // 读数
    ctx.fillStyle = '#4CAF50'
    ctx.font = 'bold 12px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    const reading = this.state.reading
    ctx.fillText(reading < 0.01 ? '0 A' : `${reading.toFixed(3)} A`, sx, sy + r + 6)

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
