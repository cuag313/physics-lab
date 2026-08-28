import { InstrumentBase } from '../InstrumentBase'

/**
 * 开关
 * 端口：左(left)、右(right)
 * 状态：闭合/断开
 */
export class Switch extends InstrumentBase {
  constructor(x = 0, y = 0) {
    super({
      type: 'switch', x, y,
      width: 1.0, height: 0.4,
      category: 'electric',
      displayName: '开关',
      icon: '🔌'
    })

    this.state = {
      closed: true
    }

    this.addPort({ id: 'left', type: 'electrical', dx: -0.5, dy: 0, label: '', color: '#aaa' })
    this.addPort({ id: 'right', type: 'electrical', dx: 0.5, dy: 0, label: '', color: '#aaa' })
  }

  /** 开关的等效电阻：闭合=0，断开=∞ */
  get effectiveResistance() {
    return this.state.closed ? 0.001 : 1e9
  }

  toggle() {
    this.state.closed = !this.state.closed
  }

  render(ctx, renderer) {
    const [sx, sy] = renderer.worldToScreen(this.x, this.y)
    const sw = this.width * renderer.scale
    const sh = this.height * renderer.scale
    const closed = this.state.closed

    // 引线
    ctx.strokeStyle = '#aaa'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(sx - sw / 2, sy)
    ctx.lineTo(sx - sw * 0.15, sy)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(sx + sw * 0.15, sy)
    ctx.lineTo(sx + sw / 2, sy)
    ctx.stroke()

    // 接线柱
    ctx.fillStyle = '#888'
    ctx.beginPath()
    ctx.arc(sx - sw * 0.15, sy, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(sx + sw * 0.15, sy, 4, 0, Math.PI * 2)
    ctx.fill()

    // 闸刀
    ctx.strokeStyle = closed ? '#4CAF50' : '#f44'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(sx - sw * 0.15, sy)
    if (closed) {
      ctx.lineTo(sx + sw * 0.15, sy)
    } else {
      ctx.lineTo(sx + sw * 0.1, sy - sh * 0.6)
    }
    ctx.stroke()

    // 状态指示
    ctx.fillStyle = closed ? '#4CAF50' : '#f44'
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(closed ? 'ON' : 'OFF', sx, sy + sh * 0.5 + 14)

    // 选中框
    if (this.selected) {
      ctx.strokeStyle = '#4FC3F7'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 3])
      ctx.strokeRect(sx - sw / 2 - 4, sy - sh * 0.8 - 4, sw + 8, sh * 1.3 + 8)
      ctx.setLineDash([])
    }

    this.renderPorts(ctx, renderer)
  }

  /** 点击切换 */
  containsPoint(wx, wy) {
    const hw = this.width / 2
    const hh = this.height / 2
    return wx >= this.x - hw && wx <= this.x + hw &&
           wy >= this.y - hh * 1.5 && wy <= this.y + hh
  }
}
