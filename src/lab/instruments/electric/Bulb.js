import { InstrumentBase } from '../InstrumentBase'

/**
 * 小灯泡
 * 端口：左(left)、右(right)
 * 参数：额定电阻、额定电压
 * 状态：亮度（由实际功率决定）
 */
export class Bulb extends InstrumentBase {
  constructor(x = 0, y = 0) {
    super({
      type: 'bulb', x, y,
      width: 0.8, height: 0.8,
      category: 'electric',
      displayName: '小灯泡',
      icon: '💡'
    })

    this.params = {
      resistance: { value: 10, min: 1, max: 1000, step: 1, label: '电阻', unit: 'Ω' },
      ratedVoltage: { value: 3, min: 1, max: 24, step: 0.5, label: '额定电压', unit: 'V' }
    }

    this.state = {
      brightness: 0 // 0~1
    }

    this.addPort({ id: 'left', type: 'electrical', dx: -0.4, dy: 0.15, label: '', color: '#aaa' })
    this.addPort({ id: 'right', type: 'electrical', dx: 0.4, dy: 0.15, label: '', color: '#aaa' })
  }

  get resistance() { return this.getParam('resistance') }

  update(dt) {
    // 亮度由功率决定
    const power = this.voltage * this.current
    const ratedPower = this.getParam('ratedVoltage') ** 2 / this.resistance
    this.state.brightness = Math.min(1, Math.max(0, power / ratedPower))
  }

  render(ctx, renderer) {
    const [sx, sy] = renderer.worldToScreen(this.x, this.y)
    const sw = this.width * renderer.scale
    const sh = this.height * renderer.scale
    const r = Math.min(sw, sh) * 0.35

    // 实时计算亮度（不依赖update）
    const power = this.voltage * this.current
    const ratedPower = this.getParam('ratedVoltage') ** 2 / this.resistance
    this.state.brightness = Math.min(1, Math.max(0, power / ratedPower))

    // 发光效果
    const brightness = this.state.brightness
    if (brightness > 0.05) {
      const glowR = r * (1.5 + brightness * 1.5)
      const gradient = ctx.createRadialGradient(sx, sy - sh * 0.05, r * 0.3, sx, sy - sh * 0.05, glowR)
      gradient.addColorStop(0, `rgba(255, 240, 180, ${brightness * 0.6})`)
      gradient.addColorStop(0.5, `rgba(255, 200, 80, ${brightness * 0.3})`)
      gradient.addColorStop(1, 'rgba(255, 200, 80, 0)')
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(sx, sy - sh * 0.05, glowR, 0, Math.PI * 2)
      ctx.fill()
    }

    // 灯泡底座
    ctx.fillStyle = '#555'
    ctx.beginPath()
    ctx.roundRect(sx - sw * 0.15, sy + sh * 0.15, sw * 0.3, sh * 0.2, 2)
    ctx.fill()

    // 灯泡外壳
    ctx.beginPath()
    ctx.arc(sx, sy - sh * 0.05, r, 0, Math.PI * 2)
    const bulbColor = brightness > 0.05
      ? `rgba(255, ${Math.floor(240 - brightness * 100)}, ${Math.floor(180 - brightness * 120)}, ${0.3 + brightness * 0.5})`
      : 'rgba(200, 200, 200, 0.15)'
    ctx.fillStyle = bulbColor
    ctx.fill()
    ctx.strokeStyle = this.selected ? '#4FC3F7' : '#888'
    ctx.lineWidth = this.selected ? 2 : 1
    ctx.stroke()

    // 灯丝
    if (brightness > 0.05) {
      ctx.strokeStyle = `rgba(255, ${Math.floor(200 - brightness * 100)}, 50, ${0.5 + brightness * 0.5})`
      ctx.lineWidth = 1.5
      ctx.beginPath()
      const filW = r * 0.4
      const filH = r * 0.3
      const fy = sy - sh * 0.1
      ctx.moveTo(sx - filW, fy)
      for (let i = 0; i < 4; i++) {
        ctx.lineTo(sx - filW + filW * 2 * (i + 0.5) / 4, fy + (i % 2 === 0 ? -filH : filH))
      }
      ctx.lineTo(sx + filW, fy)
      ctx.stroke()
    }

    // 引线
    ctx.strokeStyle = '#aaa'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(sx - sw / 2, sy + sh * 0.15)
    ctx.lineTo(sx - sw * 0.15, sy + sh * 0.15)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(sx + sw * 0.15, sy + sh * 0.15)
    ctx.lineTo(sx + sw / 2, sy + sh * 0.15)
    ctx.stroke()

    // 功率标签
    if (brightness > 0.05) {
      ctx.fillStyle = `rgba(255, 220, 100, ${0.5 + brightness * 0.5})`
      ctx.font = '11px monospace'
      ctx.textAlign = 'center'
      const power = this.voltage * this.current
      ctx.fillText(`${power.toFixed(2)}W`, sx, sy + sh * 0.5 + 14)
    }

    this.renderPorts(ctx, renderer)
    this.renderSelection(ctx, renderer)
  }
}
