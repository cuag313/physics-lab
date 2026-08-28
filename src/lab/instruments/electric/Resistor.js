import { InstrumentBase } from '../InstrumentBase'

/**
 * 定值电阻
 * 端口：左(left)、右(right)
 * 参数：电阻值
 */
export class Resistor extends InstrumentBase {
  constructor(x = 0, y = 0) {
    super({
      type: 'resistor', x, y,
      width: 1.2, height: 0.4,
      category: 'electric',
      displayName: '电阻',
      icon: '⚡'
    })

    this.params = {
      resistance: { value: 10, min: 0.1, max: 10000, step: 1, label: '电阻', unit: 'Ω' }
    }

    this.addPort({ id: 'left', type: 'electrical', dx: -0.6, dy: 0, label: '', color: '#aaa' })
    this.addPort({ id: 'right', type: 'electrical', dx: 0.6, dy: 0, label: '', color: '#aaa' })
  }

  get resistance() { return this.getParam('resistance') }

  render(ctx, renderer) {
    const [sx, sy] = renderer.worldToScreen(this.x, this.y)
    const sw = this.width * renderer.scale
    const sh = this.height * renderer.scale
    const x = sx - sw / 2
    const y = sy - sh / 2

    // 电阻色环背景
    ctx.fillStyle = '#2a2a2e'
    ctx.strokeStyle = this.selected ? '#4FC3F7' : '#666'
    ctx.lineWidth = this.selected ? 2 : 1
    ctx.beginPath()
    ctx.roundRect(x + sw * 0.15, y + sh * 0.15, sw * 0.7, sh * 0.7, 3)
    ctx.fill()
    ctx.stroke()

    // 引线
    ctx.strokeStyle = '#aaa'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(sx - sw / 2, sy)
    ctx.lineTo(x + sw * 0.15, sy)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x + sw * 0.85, sy)
    ctx.lineTo(sx + sw / 2, sy)
    ctx.stroke()

    // 锯齿符号（简化）
    const zigW = sw * 0.55
    const zigH = sh * 0.25
    const startX = x + sw * 0.22
    const segments = 6
    const segW = zigW / segments

    ctx.strokeStyle = '#E0A030'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(startX, sy)
    for (let i = 0; i < segments; i++) {
      const px = startX + segW * (i + 0.5)
      const py = sy + (i % 2 === 0 ? -zigH : zigH)
      ctx.lineTo(px, py)
    }
    ctx.lineTo(startX + zigW, sy)
    ctx.stroke()

    // 阻值标签
    ctx.fillStyle = '#E0A030'
    ctx.font = 'bold 12px monospace'
    ctx.textAlign = 'center'
    const r = this.resistance
    ctx.fillText(r >= 1000 ? `${(r / 1000).toFixed(1)}kΩ` : `${r}Ω`, sx, sy + sh * 0.5 + 14)

    this.renderPorts(ctx, renderer)
    this.renderSelection(ctx, renderer)
  }
}
