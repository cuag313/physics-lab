import { InstrumentBase } from '../InstrumentBase'

/**
 * 光源（蜡烛/激光笔）
 * 端口：光输出(optical)
 */
export class LightSource extends InstrumentBase {
  constructor(x = 0, y = 0) {
    super({
      type: 'lightSource', x, y,
      width: 0.4, height: 0.8,
      category: 'optics',
      displayName: '光源',
      icon: '🕯️'
    })

    this.params = {
      rayCount: { value: 20, min: 5, max: 100, step: 5, label: '光线数', unit: '' },
      spread: { value: 60, min: 5, max: 180, step: 5, label: '发射角', unit: '°' },
      direction: { value: 0, min: -180, max: 180, step: 5, label: '方向', unit: '°' },
    }

    this.addPort({ id: 'out', type: 'optical', dx: 0.2, dy: 0, label: '', color: '#FFD700' })
  }

  render(ctx, renderer) {
    const [sx, sy] = renderer.worldToScreen(this.x, this.y)
    const sw = this.width * renderer.scale
    const sh = this.height * renderer.scale
    const dir = this.getParam('direction') * Math.PI / 180
    const spread = this.getParam('spread') * Math.PI / 180

    // 发射方向指示（半透明扇形）
    const indicatorLen = 60
    ctx.fillStyle = 'rgba(255, 220, 100, 0.08)'
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.arc(sx, sy, indicatorLen, dir - spread / 2 - Math.PI / 2, dir + spread / 2 - Math.PI / 2)
    ctx.closePath()
    ctx.fill()

    // 蜡烛底座
    ctx.fillStyle = '#666'
    ctx.beginPath()
    ctx.roundRect(sx - sw * 0.4, sy + sh * 0.15, sw * 0.8, sh * 0.25, 3)
    ctx.fill()

    // 蜡烛柱体
    ctx.fillStyle = '#E8D5B0'
    ctx.beginPath()
    ctx.roundRect(sx - sw * 0.2, sy - sh * 0.2, sw * 0.4, sh * 0.4, 2)
    ctx.fill()

    // 火焰（更大更亮）
    const flameH = sh * 0.3
    const gradient = ctx.createRadialGradient(sx, sy - sh * 0.35, 0, sx, sy - sh * 0.35, flameH)
    gradient.addColorStop(0, 'rgba(255, 255, 220, 0.95)')
    gradient.addColorStop(0.2, 'rgba(255, 220, 80, 0.9)')
    gradient.addColorStop(0.5, 'rgba(255, 150, 30, 0.6)')
    gradient.addColorStop(1, 'rgba(255, 80, 0, 0)')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.ellipse(sx, sy - sh * 0.35, sw * 0.2, flameH, 0, 0, Math.PI * 2)
    ctx.fill()

    // 发光光晕
    const glow = ctx.createRadialGradient(sx, sy - sh * 0.3, 0, sx, sy - sh * 0.3, sh * 0.7)
    glow.addColorStop(0, 'rgba(255, 200, 100, 0.25)')
    glow.addColorStop(1, 'rgba(255, 200, 100, 0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(sx, sy - sh * 0.3, sh * 0.7, 0, Math.PI * 2)
    ctx.fill()

    // 物体标签
    ctx.fillStyle = '#FFD700'
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('物', sx, sy + sh * 0.55)

    if (this.selected) {
      ctx.strokeStyle = '#4FC3F7'
      ctx.lineWidth = 2
      ctx.setLineDash([4, 2])
      ctx.strokeRect(sx - sw * 0.5, sy - sh * 0.55, sw, sh + 0.1 * sh)
      ctx.setLineDash([])
    }

    this.renderPorts(ctx, renderer)
  }
}

/**
 * 凸透镜
 * 端口：左(optical)、右(optical)
 */
export class ConvexLens extends InstrumentBase {
  constructor(x = 0, y = 0) {
    super({
      type: 'convexLens', x, y,
      width: 0.3, height: 2.5,
      category: 'optics',
      displayName: '凸透镜',
      icon: '🔍'
    })

    this.params = {
      focalLength: { value: 0.5, min: 0.1, max: 5, step: 0.1, label: '焦距', unit: 'm' },
    }

    this.addPort({ id: 'left', type: 'optical', dx: -0.15, dy: 0, label: '', color: '#4FC3F7' })
    this.addPort({ id: 'right', type: 'optical', dx: 0.15, dy: 0, label: '', color: '#4FC3F7' })
  }

  render(ctx, renderer) {
    const [sx, sy] = renderer.worldToScreen(this.x, this.y)
    const sw = this.width * renderer.scale
    const sh = this.height * renderer.scale
    const r = sh * 0.45
    const f = this.getParam('focalLength')
    const fpx = f * renderer.scale

    // 主轴（贯穿虚线）
    ctx.strokeStyle = 'rgba(100, 180, 255, 0.2)'
    ctx.lineWidth = 1
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(sx - fpx * 4, sy)
    ctx.lineTo(sx + fpx * 4, sy)
    ctx.stroke()
    ctx.setLineDash([])

    // 透镜弧面（双凸）
    const gradient = ctx.createLinearGradient(sx - sw, sy, sx + sw, sy)
    gradient.addColorStop(0, 'rgba(100, 180, 255, 0.05)')
    gradient.addColorStop(0.3, 'rgba(100, 180, 255, 0.25)')
    gradient.addColorStop(0.5, 'rgba(150, 210, 255, 0.4)')
    gradient.addColorStop(0.7, 'rgba(100, 180, 255, 0.25)')
    gradient.addColorStop(1, 'rgba(100, 180, 255, 0.05)')

    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.ellipse(sx, sy, sw * 1.5, r, 0, 0, Math.PI * 2)
    ctx.fill()

    // 边框
    ctx.strokeStyle = this.selected ? '#4FC3F7' : '#4a90d9'
    ctx.lineWidth = this.selected ? 2.5 : 1.5
    ctx.beginPath()
    ctx.ellipse(sx, sy, sw * 1.5, r, 0, 0, Math.PI * 2)
    ctx.stroke()

    // 中心点 O
    ctx.fillStyle = '#4a90d9'
    ctx.beginPath()
    ctx.arc(sx, sy, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#4a90d9'
    ctx.fillText('O', sx, sy + 18)
  }
}

/**
 * 凹透镜
 */
export class ConcaveLens extends InstrumentBase {
  constructor(x = 0, y = 0) {
    super({
      type: 'concaveLens', x, y,
      width: 0.3, height: 2.5,
      category: 'optics',
      displayName: '凹透镜',
      icon: '🔎'
    })

    this.params = {
      focalLength: { value: 0.5, min: 0.1, max: 5, step: 0.1, label: '焦距', unit: 'm' },
    }
  }

  render(ctx, renderer) {
    const [sx, sy] = renderer.worldToScreen(this.x, this.y)
    const sw = this.width * renderer.scale
    const sh = this.height * renderer.scale
    const r = sh * 0.45
    const f = this.getParam('focalLength')
    const fpx = f * renderer.scale

    // 主轴
    ctx.strokeStyle = 'rgba(255, 152, 0, 0.2)'
    ctx.lineWidth = 1
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(sx - fpx * 4, sy)
    ctx.lineTo(sx + fpx * 4, sy)
    ctx.stroke()
    ctx.setLineDash([])

    // 凹透镜形状（中间凹陷）
    ctx.strokeStyle = this.selected ? '#4FC3F7' : '#FF9800'
    ctx.lineWidth = 2
    ctx.fillStyle = 'rgba(255, 152, 0, 0.1)'

    // 左弧面（向外凹）
    ctx.beginPath()
    ctx.moveTo(sx - sw * 0.5, sy - r)
    ctx.quadraticCurveTo(sx + sw * 2, sy, sx - sw * 0.5, sy + r)
    ctx.stroke()

    // 右弧面（向外凹）
    ctx.beginPath()
    ctx.moveTo(sx + sw * 0.5, sy - r)
    ctx.quadraticCurveTo(sx - sw * 2, sy, sx + sw * 0.5, sy + r)
    ctx.stroke()

    // 连接上下
    ctx.beginPath()
    ctx.moveTo(sx - sw * 0.5, sy - r)
    ctx.lineTo(sx + sw * 0.5, sy - r)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(sx - sw * 0.5, sy + r)
    ctx.lineTo(sx + sw * 0.5, sy + r)
    ctx.stroke()

    // 填充
    ctx.fillStyle = 'rgba(255, 152, 0, 0.06)'
    ctx.beginPath()
    ctx.rect(sx - sw * 0.5, sy - r, sw, r * 2)
    ctx.fill()

    // 中心点 O
    ctx.fillStyle = '#FF9800'
    ctx.beginPath()
    ctx.arc(sx, sy, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#FF9800'
    ctx.fillText('O', sx, sy + 18)
  }
}

/**
 * 平面镜
 */
export class PlaneMirrorInst extends InstrumentBase {
  constructor(x = 0, y = 0) {
    super({
      type: 'planeMirror', x, y,
      width: 0.15, height: 1.0,
      category: 'optics',
      displayName: '平面镜',
      icon: '🪞'
    })

    this.params = {
      angle: { value: 90, min: 0, max: 180, step: 5, label: '角度', unit: '°' },
    }

    this.addPort({ id: 'reflect', type: 'optical', dx: 0, dy: 0, label: '', color: '#ccc' })
  }

  render(ctx, renderer) {
    const [sx, sy] = renderer.worldToScreen(this.x, this.y)
    const sw = this.width * renderer.scale
    const sh = this.height * renderer.scale
    const angle = this.getParam('angle') * Math.PI / 180

    ctx.save()
    ctx.translate(sx, sy)
    ctx.rotate(-angle)

    // 镜面（更明显的反射面）
    const gradient = ctx.createLinearGradient(-sw, 0, sw, 0)
    gradient.addColorStop(0, '#666')
    gradient.addColorStop(0.3, '#ddd')
    gradient.addColorStop(0.5, '#fff')
    gradient.addColorStop(0.7, '#ddd')
    gradient.addColorStop(1, '#666')
    ctx.fillStyle = gradient
    ctx.fillRect(-sw / 2, -sh / 2, sw, sh)

    // 边框
    ctx.strokeStyle = this.selected ? '#4FC3F7' : '#aaa'
    ctx.lineWidth = this.selected ? 2.5 : 1.5
    ctx.strokeRect(-sw / 2, -sh / 2, sw, sh)

    // 背面斜线（表示不透光）
    ctx.strokeStyle = 'rgba(100,100,100,0.5)'
    ctx.lineWidth = 1
    for (let i = -sh / 2; i < sh / 2; i += 5) {
      ctx.beginPath()
      ctx.moveTo(sw / 2, i)
      ctx.lineTo(sw / 2 + 8, i + 8)
      ctx.stroke()
    }

    // 法线（虚线）
    ctx.strokeStyle = 'rgba(79, 195, 247, 0.5)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    ctx.moveTo(0, -sh * 0.8)
    ctx.lineTo(0, sh * 0.8)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.restore()

    // 角度标注
    ctx.fillStyle = '#4FC3F7'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`${this.getParam('angle')}°`, sx + 20, sy - sh / 2 - 5)

    this.renderPorts(ctx, renderer)
  }
}

/**
 * 光屏
 */
export class ScreenInst extends InstrumentBase {
  constructor(x = 0, y = 0) {
    super({
      type: 'screen', x, y,
      width: 0.1, height: 1.5,
      category: 'optics',
      displayName: '光屏',
      icon: '📺'
    })

    this.addPort({ id: 'detect', type: 'optical', dx: 0, dy: 0, label: '', color: '#fff' })
  }

  render(ctx, renderer) {
    const [sx, sy] = renderer.worldToScreen(this.x, this.y)
    const sw = this.width * renderer.scale
    const sh = this.height * renderer.scale

    // 光屏面板（白色半透明）
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
    ctx.fillRect(sx - sw, sy - sh / 2, sw * 2, sh)

    // 边框
    ctx.strokeStyle = this.selected ? '#4FC3F7' : '#888'
    ctx.lineWidth = this.selected ? 2 : 1
    ctx.strokeRect(sx - sw, sy - sh / 2, sw * 2, sh)

    // 底座
    ctx.fillStyle = '#555'
    ctx.fillRect(sx - sw * 2, sy + sh / 2, sw * 4, sh * 0.06)
    // 支架
    ctx.fillRect(sx - sw * 0.3, sy + sh / 2, sw * 0.6, sh * 0.15)

    // 标签
    ctx.fillStyle = '#888'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('光屏', sx, sy + sh / 2 + sh * 0.25)

    this.renderPorts(ctx, renderer)
  }
}
