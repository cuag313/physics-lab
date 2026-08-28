import { InstrumentBase } from '../InstrumentBase'

/**
 * Flashlight — 手电筒光源
 *
 * NB风格：矩形筒身 + 凸透镜灯头 + 红色电源按钮
 * 点击红色按钮开关灯，可拖拽移动
 * 开启后从灯头发出扇形光束
 */
export class Flashlight extends InstrumentBase {
  constructor(x = 0, y = 0) {
    super({
      type: 'flashlight', x, y,
      width: 0.6, height: 0.35,
      category: 'optics',
      displayName: '手电筒',
      icon: '🔦'
    })

    this.on = false  // 默认关闭
    this.beamColor = '#ffffff'  // 光束颜色（白光）
    this.beamColors = null  // 多色光束（色散用），null表示单色
    this.direction = 0  // 光束方向（度，0=向右）
    this.spread = 20    // 光束散开角度（度）

    this.params = {
      direction: { value: 0, min: -180, max: 180, step: 5, label: '方向', unit: '°' },
      spread: { value: 20, min: 5, max: 60, step: 5, label: '散角', unit: '°' },
    }
  }

  /** 开灯 */
  turnOn() { this.on = true }
  /** 关灯 */
  turnOff() { this.on = false }
  /** 切换 */
  toggle() { this.on = !this.on }

  /** 设置光束颜色 */
  setBeamColor(color) { this.beamColor = color }

  /** 设置多色光束（色散） */
  setBeamColors(colors) { this.beamColors = colors }

  render(ctx, renderer) {
    const [sx, sy] = renderer.worldToScreen(this.x, this.y)
    const scale = renderer.scale
    const dir = (this.getParam('direction') ?? this.direction) * Math.PI / 180
    const spread = (this.getParam('spread') ?? this.spread) * Math.PI / 180

    const bodyW = this.width * scale
    const bodyH = this.height * scale

    // ===== 光束（开启时）=====
    if (this.on) {
      const beamLen = 5 * scale  // 光束长度（世界单位）
      const beamColors = this.beamColors || [this.beamColor]

      for (const color of beamColors) {
        const spreadHalf = spread / 2
        // 散开角度偏移（多色光时每色略有不同）
        const colorIdx = beamColors.indexOf(color)
        const colorOffset = beamColors.length > 1
          ? (colorIdx / (beamColors.length - 1) - 0.5) * spread * 0.8
          : 0

        const beamDir = dir + colorOffset
        const tipX = sx + Math.cos(beamDir) * beamLen
        const tipY = sy - Math.sin(beamDir) * beamLen
        const leftX = sx + Math.cos(beamDir - spreadHalf) * beamLen
        const leftY = sy - Math.sin(beamDir - spreadHalf) * beamLen
        const rightX = sx + Math.cos(beamDir + spreadHalf) * beamLen
        const rightY = sy - Math.sin(beamDir + spreadHalf) * beamLen

        // 光束渐变
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, beamLen)
        grad.addColorStop(0, color + 'cc')
        grad.addColorStop(0.3, color + '44')
        grad.addColorStop(1, color + '00')

        ctx.fillStyle = grad
        ctx.globalAlpha = 0.25
        ctx.beginPath()
        ctx.moveTo(sx, sy)
        ctx.lineTo(leftX, leftY)
        ctx.lineTo(tipX, tipY)
        ctx.lineTo(rightX, rightY)
        ctx.closePath()
        ctx.fill()
        ctx.globalAlpha = 1
      }

      // 灯头发光光晕
      const glowGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, bodyW * 0.8)
      glowGrad.addColorStop(0, 'rgba(255,255,200,0.6)')
      glowGrad.addColorStop(0.5, 'rgba(255,220,100,0.2)')
      glowGrad.addColorStop(1, 'rgba(255,200,50,0)')
      ctx.fillStyle = glowGrad
      ctx.beginPath()
      ctx.arc(sx, sy, bodyW * 0.8, 0, Math.PI * 2)
      ctx.fill()
    }

    // ===== 筒身（向右水平矩形）=====
    ctx.save()
    ctx.translate(sx, sy)

    // 筒身主体（金属灰）
    const bw = bodyW * 1.2
    const bh = bodyH
    const bodyGrad = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2)
    bodyGrad.addColorStop(0, '#5a5a5a')
    bodyGrad.addColorStop(0.3, '#888')
    bodyGrad.addColorStop(0.5, '#999')
    bodyGrad.addColorStop(0.7, '#777')
    bodyGrad.addColorStop(1, '#4a4a4a')
    ctx.fillStyle = bodyGrad

    // 圆角矩形筒身
    const r = bh * 0.15
    ctx.beginPath()
    ctx.moveTo(-bw * 0.5 + r, -bh / 2)
    ctx.lineTo(bw * 0.1 - r, -bh / 2)
    ctx.arcTo(bw * 0.1, -bh / 2, bw * 0.1, -bh / 2 + r, r)
    ctx.lineTo(bw * 0.1, bh / 2 - r)
    ctx.arcTo(bw * 0.1, bh / 2, bw * 0.1 - r, bh / 2, r)
    ctx.lineTo(-bw * 0.5 + r, bh / 2)
    ctx.arcTo(-bw * 0.5, bh / 2, -bw * 0.5, bh / 2 - r, r)
    ctx.lineTo(-bw * 0.5, -bh / 2 + r)
    ctx.arcTo(-bw * 0.5, -bh / 2, -bw * 0.5 + r, -bh / 2, r)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // 灯头（凸出的透镜部分）
    const lensW = bodyW * 0.35
    const lensH = bh * 0.7
    const lensX = bw * 0.1
    const lensGrad = ctx.createLinearGradient(lensX, -lensH / 2, lensX + lensW, lensH / 2)
    if (this.on) {
      lensGrad.addColorStop(0, '#fff8e0')
      lensGrad.addColorStop(0.5, '#ffe066')
      lensGrad.addColorStop(1, '#cc9900')
    } else {
      lensGrad.addColorStop(0, '#555')
      lensGrad.addColorStop(0.5, '#444')
      lensGrad.addColorStop(1, '#333')
    }
    ctx.fillStyle = lensGrad
    ctx.beginPath()
    ctx.moveTo(lensX, -lensH / 2)
    ctx.lineTo(lensX + lensW, -lensH * 0.35)
    ctx.lineTo(lensX + lensW, lensH * 0.35)
    ctx.lineTo(lensX, lensH / 2)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 1
    ctx.stroke()

    // ===== 红色电源按钮 =====
    const btnR = bh * 0.18
    const btnX = -bw * 0.15
    const btnY = -bh / 2 - btnR * 0.3

    // 按钮底座
    ctx.fillStyle = '#333'
    ctx.beginPath()
    ctx.arc(btnX, btnY, btnR * 1.3, 0, Math.PI * 2)
    ctx.fill()

    // 按钮（红色，按下时变暗）
    const btnGrad = ctx.createRadialGradient(btnX - btnR * 0.2, btnY - btnR * 0.2, 0, btnX, btnY, btnR)
    if (this.on) {
      btnGrad.addColorStop(0, '#ff4444')
      btnGrad.addColorStop(0.7, '#cc0000')
      btnGrad.addColorStop(1, '#880000')
    } else {
      btnGrad.addColorStop(0, '#ff6666')
      btnGrad.addColorStop(0.7, '#dd2222')
      btnGrad.addColorStop(1, '#aa0000')
    }
    ctx.fillStyle = btnGrad
    ctx.beginPath()
    ctx.arc(btnX, btnY, btnR, 0, Math.PI * 2)
    ctx.fill()

    // 按钮高光
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.beginPath()
    ctx.ellipse(btnX - btnR * 0.15, btnY - btnR * 0.15, btnR * 0.4, btnR * 0.25, -0.5, 0, Math.PI * 2)
    ctx.fill()

    // 开/关标签
    ctx.fillStyle = this.on ? '#ff4444' : '#666'
    ctx.font = 'bold 8px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(this.on ? 'ON' : 'OFF', btnX, btnY + btnR * 1.8)

    // ===== 筒身装饰条纹 =====
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'
    ctx.lineWidth = 1
    for (let i = -bw * 0.4; i < -bw * 0.05; i += bh * 0.2) {
      ctx.beginPath()
      ctx.moveTo(i, -bh / 2 + 2)
      ctx.lineTo(i, bh / 2 - 2)
      ctx.stroke()
    }

    // ===== 尾部开关环 =====
    ctx.strokeStyle = '#666'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(-bw * 0.5, -bh / 2 + 3)
    ctx.lineTo(-bw * 0.5, bh / 2 - 3)
    ctx.stroke()

    ctx.restore()

    // 选中高亮
    if (this.selected) {
      ctx.strokeStyle = '#4FC3F7'
      ctx.lineWidth = 2
      ctx.setLineDash([4, 2])
      ctx.strokeRect(sx - bw * 0.6, sy - bh * 0.8, bw * 1.4, bh * 1.6)
      ctx.setLineDash([])
    }

    // 标签
    ctx.fillStyle = this.on ? '#FFD700' : '#8b949e'
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('手电筒', sx, sy + bodyH * 1.2)
  }

  /** 检测点击是否在红色按钮上 */
  hitTestButton(worldX, worldY) {
    const btnX = this.x - this.width * 0.15
    const btnY = this.y - this.height * 0.5 - this.height * 0.18 * 0.3
    const btnR = this.height * 0.18
    const dx = worldX - btnX
    const dy = worldY - btnY
    return dx * dx + dy * dy < btnR * btnR * 1.5  // 稍大一点的点击区域
  }
}
