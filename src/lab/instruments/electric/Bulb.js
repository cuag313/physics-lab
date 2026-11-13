import { InstrumentBase } from '../InstrumentBase'
import { CAP_RED, CAP_BLACK } from '../../theme/termColors.js'

/**
 * 小灯泡（灯丝电阻随温度变化）
 * 端口：左(left)、右(right)
 * 物理模型：
 *   冷态电阻 R_cold = 3Ω（20°C）；额定热态电阻 R_hot = 10Ω（2500°C，额定电压时）
 *   R(P) = R_cold + (R_hot - R_cold) * min(1, P / P_rated) —— 由上一帧功耗算出，solve 时注入 MNA
 *   温度 T = 20 + P·k，k 按额定点标定：P_rated ↔ 2500°C（过额定可超过 2500°C）
 *   I–U 曲线因此自然弯曲：低压段电阻小电流偏大，高压段电流饱和
 * 灯丝颜色按温度分档：灰（不发光）/ 暗红 / 橙红 / 亮黄 / 刺眼白（过额定闪烁警示）
 */

const R_COLD = 3    // Ω，20°C
const R_HOT = 10    // Ω，2500°C（额定电压下）
const T_COLD = 20   // °C
const T_HOT = 2500  // °C

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
      // 不再有固定电阻参数：R 由功耗（温度）决定
      ratedVoltage: { value: 3, min: 1, max: 24, step: 0.5, label: '额定电压', unit: 'V' }
    }

    this.state = {
      brightness: 0 // 0~1
    }

    this.addPort({ id: 'left', type: 'electrical', dx: -0.4, dy: 0.15, label: '', color: CAP_BLACK })
    this.addPort({ id: 'right', type: 'electrical', dx: 0.4, dy: 0.15, label: '', color: CAP_RED })
  }

  /** 上一帧功耗（W）：solve 后由引擎更新 v/i */
  get power() { return this.voltage * this.current }

  /** 额定功率（W）：U_rated² / R_hot */
  get ratedPower() { return this.getParam('ratedVoltage') ** 2 / R_HOT }

  /** 热平衡温度（°C）：P = P_rated ↔ 2500°C */
  get temperature() {
    return T_COLD + (T_HOT - T_COLD) * this.power / this.ratedPower
  }

  /** 当前灯丝电阻（Ω）：R = 3 + 7 * min(1, P / P_rated) */
  computeResistance() {
    return R_COLD + (R_HOT - R_COLD) * Math.min(1, this.power / this.ratedPower)
  }

  get resistance() { return this.computeResistance() }

  update(_dt) {
    // 亮度由功率决定（不变）
    this.state.brightness = Math.min(1, Math.max(0, this.power / this.ratedPower))
  }

  render(ctx, renderer) {
    const [sx, sy] = renderer.worldToScreen(this.x, this.y)
    const sw = this.width * renderer.scale
    const sh = this.height * renderer.scale
    const r = Math.min(sw, sh) * 0.35

    // 实时计算亮度与温度档（不依赖update）
    this.state.brightness = Math.min(1, Math.max(0, this.power / this.ratedPower))
    const brightness = this.state.brightness
    const T = this.temperature

    // 灯丝颜色按温度分档：灰（不发光）/ 暗红 / 橙红 / 亮黄 / 刺眼白
    let filRGB
    if (T < 300) filRGB = [154, 160, 168]       // 灰色灯丝，不发光
    else if (T < 800) filRGB = [190, 36, 18]    // 暗红
    else if (T < 1800) filRGB = [255, 107, 26]  // 橙红
    else if (T <= 2500) filRGB = [255, 210, 63] // 亮黄
    else filRGB = [255, 255, 255]               // 刺眼白（过额定）
    const over = T > 2500
    const flash = over ? 0.55 + 0.45 * Math.sin(performance.now() / 140) : 1

    // 发光效果（300°C 以上才发光）
    if (T >= 300) {
      const glowR = r * (1.5 + brightness * 1.5 + (over ? 0.8 : 0))
      const [fr, fg, fb] = filRGB
      const gradient = ctx.createRadialGradient(sx, sy - sh * 0.05, r * 0.3, sx, sy - sh * 0.05, glowR)
      gradient.addColorStop(0, `rgba(${fr}, ${fg}, ${fb}, ${(brightness * 0.6 * flash).toFixed(3)})`)
      gradient.addColorStop(0.5, `rgba(${fr}, ${fg}, ${fb}, ${(brightness * 0.3 * flash).toFixed(3)})`)
      gradient.addColorStop(1, `rgba(${fr}, ${fg}, ${fb}, 0)`)
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
    const bulbColor = T >= 300
      ? `rgba(${filRGB[0]}, ${Math.floor(filRGB[1] * 0.8 + 60)}, ${Math.floor(filRGB[2] * 0.8 + 40)}, ${0.3 + brightness * 0.5})`
      : 'rgba(200, 200, 200, 0.15)'
    ctx.fillStyle = bulbColor
    ctx.fill()
    ctx.strokeStyle = this.selected ? '#4FC3F7' : '#888'
    ctx.lineWidth = this.selected ? 2 : 1
    ctx.stroke()

    // 灯丝（始终可见，颜色随温度）
    ctx.strokeStyle = `rgba(${filRGB[0]}, ${filRGB[1]}, ${filRGB[2]}, ${over ? flash : 0.5 + brightness * 0.5})`
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

    // 过额定：闪烁警示
    if (over) {
      ctx.fillStyle = `rgba(229, 57, 53, ${flash.toFixed(2)})`
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText('⚠ 超过额定', sx, sy + r + 22)
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
