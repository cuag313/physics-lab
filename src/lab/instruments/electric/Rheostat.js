import { InstrumentBase } from '../InstrumentBase'

/**
 * 滑动变阻器
 * 端口：左固定端(left)、右固定端(right)、滑片端(wiper)
 * 参数：总电阻
 * 交互：可拖动滑片
 */
export class Rheostat extends InstrumentBase {
  constructor(x = 0, y = 0) {
    super({
      type: 'rheostat', x, y,
      width: 1.8, height: 0.5,
      category: 'electric',
      displayName: '滑动变阻器',
      icon: '🔧'
    })

    this.params = {
      totalResistance: { value: 50, min: 1, max: 10000, step: 1, label: '总电阻', unit: 'Ω' },
      sliderPos: { value: 0.5, min: 0, max: 1, step: 0.01, label: '滑片位置', unit: '' }
    }

    this.addPort({ id: 'left', type: 'electrical', dx: -0.9, dy: 0.2, label: 'A', color: '#aaa' })
    this.addPort({ id: 'right', type: 'electrical', dx: 0.9, dy: 0.2, label: 'B', color: '#aaa' })
    this.addPort({ id: 'wiper', type: 'electrical', dx: 0, dy: -0.2, label: 'P', color: '#FFD700' })
  }

  /** 滑片左侧电阻 */
  get leftResistance() {
    return this.getParam('totalResistance') * this.getParam('sliderPos')
  }

  /** 滑片右侧电阻 */
  get rightResistance() {
    return this.getParam('totalResistance') * (1 - this.getParam('sliderPos'))
  }

  render(ctx, renderer) {
    const [sx, sy] = renderer.worldToScreen(this.x, this.y)
    const sw = this.width * renderer.scale
    const sh = this.height * renderer.scale
    const sliderPos = this.getParam('sliderPos')

    // 绝缘管
    const tubeY = sy + sh * 0.15
    const tubeH = sh * 0.12
    ctx.fillStyle = '#444'
    ctx.beginPath()
    ctx.roundRect(sx - sw * 0.4, tubeY - tubeH / 2, sw * 0.8, tubeH, 3)
    ctx.fill()

    // 电阻丝（锯齿）
    const wireY = tubeY
    const wireLeft = sx - sw * 0.38
    const wireRight = sx + sw * 0.38
    const wireLen = wireRight - wireLeft
    const coils = 20
    const coilH = sh * 0.08

    ctx.strokeStyle = '#E0A030'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(wireLeft, wireY)
    for (let i = 0; i < coils; i++) {
      const cx = wireLeft + wireLen * (i + 0.5) / coils
      const cy = wireY + (i % 2 === 0 ? -coilH : coilH)
      ctx.lineTo(cx, cy)
    }
    ctx.lineTo(wireRight, wireY)
    ctx.stroke()

    // 滑片位置
    const sliderX = wireLeft + wireLen * sliderPos

    // 滑片支架
    ctx.strokeStyle = '#aaa'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(sliderX, tubeY - tubeH / 2)
    ctx.lineTo(sliderX, sy - sh * 0.3)
    ctx.stroke()

    // 滑片头（加大，易点击）
    const headR = 9
    ctx.fillStyle = '#FFD700'
    ctx.beginPath()
    ctx.arc(sliderX, sy - sh * 0.3, headR, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#B8860B'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // 滑片头内部箭头提示（可拖拽）
    ctx.fillStyle = '#B8860B'
    ctx.font = 'bold 10px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('⇔', sliderX, sy - sh * 0.3)

    // 引线
    ctx.strokeStyle = '#aaa'
    ctx.lineWidth = 2
    // A端
    const lp = this.ports[0].getWorldPos(this)
    const [lpx, lpy] = renderer.worldToScreen(lp.x, lp.y)
    ctx.beginPath()
    ctx.moveTo(wireLeft, wireY)
    ctx.lineTo(lpx, lpy)
    ctx.stroke()
    // B端
    const rp = this.ports[1].getWorldPos(this)
    const [rpx, rpy] = renderer.worldToScreen(rp.x, rp.y)
    ctx.beginPath()
    ctx.moveTo(wireRight, wireY)
    ctx.lineTo(rpx, rpy)
    ctx.stroke()
    // P端
    const wp = this.ports[2].getWorldPos(this)
    const [wpx, wpy] = renderer.worldToScreen(wp.x, wp.y)
    ctx.beginPath()
    ctx.moveTo(sliderX, sy - sh * 0.3)
    ctx.lineTo(wpx, wpy)
    ctx.stroke()

    // A/B/P标签
    ctx.fillStyle = '#aaa'
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('A', lpx, lpy + 14)
    ctx.fillText('B', rpx, rpy + 14)
    ctx.fillStyle = '#FFD700'
    ctx.fillText('P', wpx, wpy - 10)

    // 阻值
    ctx.fillStyle = '#4CAF50'
    ctx.font = '11px monospace'
    ctx.textAlign = 'center'
    const total = this.getParam('totalResistance')
    const leftR = (total * sliderPos).toFixed(1)
    const rightR = (total * (1 - sliderPos)).toFixed(1)
    ctx.fillText(`${leftR}Ω / ${rightR}Ω`, sx, sy + sh * 0.5 + 14)

    this.renderPorts(ctx, renderer)
    this.renderSelection(ctx, renderer)
  }

  /** 拖拽滑片 */
  containsPoint(wx, wy) {
    const sliderPos = this.getParam('sliderPos')
    const sliderX = this.x - this.width * 0.38 + this.width * 0.76 * sliderPos
    const sliderY = this.y - this.height * 0.3
    const dist = Math.sqrt((wx - sliderX) ** 2 + (wy - sliderY) ** 2)

    // 优先检测滑片头
    if (dist < 0.2) return true

    // 再检测整个仪器
    return super.containsPoint(wx, wy)
  }

  /** 拖拽更新滑片位置 */
  onDrag(wx) {
    const wireLeft = this.x - this.width * 0.38
    const wireRight = this.x + this.width * 0.38
    const pos = (wx - wireLeft) / (wireRight - wireLeft)
    this.setParam('sliderPos', Math.max(0, Math.min(1, pos)))
  }
}
