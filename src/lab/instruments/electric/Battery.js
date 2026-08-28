import { InstrumentBase } from '../InstrumentBase'

/**
 * 电池
 * 端口：正极(+)、负极(-)
 * 参数：电动势、内阻
 */
export class Battery extends InstrumentBase {
  constructor(x = 0, y = 0) {
    super({
      type: 'battery', x, y,
      width: 1.0, height: 0.5,
      category: 'electric',
      displayName: '电池',
      icon: '🔋'
    })

    this.params = {
      emf: { value: 3, min: 0, max: 24, step: 0.5, label: '电动势', unit: 'V' },
      internalResistance: { value: 0.1, min: 0, max: 10, step: 0.1, label: '内阻', unit: 'Ω' }
    }

    this.addPort({ id: 'pos', type: 'electrical', dx: 0.5, dy: 0, label: '+', color: '#f44' })
    this.addPort({ id: 'neg', type: 'electrical', dx: -0.5, dy: 0, label: '−', color: '#44f' })
  }

  get emf() { return this.getParam('emf') }
  get internalResistance() { return this.getParam('internalResistance') }

  render(ctx, renderer) {
    const [sx, sy] = renderer.worldToScreen(this.x, this.y)
    const sw = this.width * renderer.scale
    const sh = this.height * renderer.scale
    const x = sx - sw / 2
    const y = sy - sh / 2

    // 底色
    ctx.fillStyle = '#1a1a2e'
    ctx.strokeStyle = this.selected ? '#4FC3F7' : '#555'
    ctx.lineWidth = this.selected ? 2 : 1
    ctx.beginPath()
    ctx.roundRect(x, y, sw, sh, 4)
    ctx.fill()
    ctx.stroke()

    // 电池符号（竖线）
    const cx = sx
    const cy = sy
    const plateW = sw * 0.06
    const plateH1 = sh * 0.7  // 长板（正极）
    const plateH2 = sh * 0.45 // 短板（负极）

    // 正极（长板）
    ctx.strokeStyle = '#f44'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(cx + sw * 0.08, cy - plateH1 / 2)
    ctx.lineTo(cx + sw * 0.08, cy + plateH1 / 2)
    ctx.stroke()

    // 负极（短板）
    ctx.strokeStyle = '#44f'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(cx - sw * 0.08, cy - plateH2 / 2)
    ctx.lineTo(cx - sw * 0.08, cy + plateH2 / 2)
    ctx.stroke()

    // 连接线到端口
    ctx.strokeStyle = '#888'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cx + sw * 0.08, cy)
    ctx.lineTo(sx + sw / 2, cy)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(cx - sw * 0.08, cy)
    ctx.lineTo(sx - sw / 2, cy)
    ctx.stroke()

    // +/- 标记
    ctx.fillStyle = '#f44'
    ctx.font = 'bold 14px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('+', sx + sw * 0.3, cy - sh * 0.2)
    ctx.fillStyle = '#44f'
    ctx.fillText('−', sx - sw * 0.3, cy - sh * 0.2)

    // 数值
    ctx.fillStyle = '#4CAF50'
    ctx.font = '12px monospace'
    ctx.fillText(`${this.emf}V`, cx, cy + sh * 0.5 + 14)

    this.renderPorts(ctx, renderer)
    this.renderSelection(ctx, renderer)
  }
}
