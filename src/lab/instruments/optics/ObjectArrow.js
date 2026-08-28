import { InstrumentBase } from '../InstrumentBase'

/**
 * ObjectArrow — 凸透镜成像实验中的"物体"
 *
 * 视觉：一根竖立的箭头，底部在光轴上
 * 交互：可沿光轴（x方向）拖拽，改变物距u
 * 物理：作为光学引擎的"扩展光源"
 */
export class ObjectArrow extends InstrumentBase {
  constructor(x = -3, y = 0) {
    super({
      type: 'objectArrow', x, y,
      width: 0.3, height: 1.2,
      category: 'optics',
      displayName: '物体',
      icon: '⬆️'
    })

    this.params = {
      objectHeight: { value: 0.8, min: 0.2, max: 2.0, step: 0.1, label: '物高', unit: 'm' },
    }

    // 光学端口（发出光线）
    this.addPort({ id: 'out', type: 'optical', dx: 0.15, dy: 0, label: '', color: '#FFD700' })
  }

  /** 获取物高（世界坐标） */
  getObjectHeight() {
    return this.getParam('objectHeight')
  }

  render(ctx, renderer) {
    const [sx, sy] = renderer.worldToScreen(this.x, this.y)
    const h = this.getParam('objectHeight') * renderer.scale
    const w = 12 // 箭头宽度

    // === 箭头主体 ===
    // 渐变填充
    const gradient = ctx.createLinearGradient(sx, sy, sx, sy - h)
    gradient.addColorStop(0, '#FF6B35')
    gradient.addColorStop(0.6, '#FF9F1C')
    gradient.addColorStop(1, '#FFD166')
    ctx.fillStyle = gradient

    // 箭头杆
    ctx.beginPath()
    ctx.moveTo(sx - 3, sy)
    ctx.lineTo(sx - 3, sy - h + 14)
    ctx.lineTo(sx - w, sy - h + 14)
    ctx.lineTo(sx, sy - h)
    ctx.lineTo(sx + w, sy - h + 14)
    ctx.lineTo(sx + 3, sy - h + 14)
    ctx.lineTo(sx + 3, sy)
    ctx.closePath()
    ctx.fill()

    // 边框
    ctx.strokeStyle = this.selected ? '#4FC3F7' : '#E85D04'
    ctx.lineWidth = this.selected ? 2.5 : 1.5
    ctx.stroke()

    // === 物体标签 ===
    ctx.fillStyle = '#FFD166'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('物', sx, sy + 18)

    // === 选中效果 ===
    if (this.selected) {
      ctx.strokeStyle = 'rgba(79, 195, 247, 0.4)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.arc(sx, sy - h / 2, Math.max(h / 2 + 10, 20), 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])

      // 拖拽提示
      ctx.fillStyle = 'rgba(79, 195, 247, 0.8)'
      ctx.font = '10px sans-serif'
      ctx.fillText('↔ 拖拽移动', sx, sy + 30)
    }
  }
}

/**
 * ImageArrow — 凸透镜成像实验中的"像"
 *
 * 视觉：根据成像性质变化
 * - 实像：红色实心箭头（倒立）
 * - 虚像：蓝色虚线箭头（正立）
 *
 * 不可交互，纯显示
 */
export class ImageArrow extends InstrumentBase {
  constructor(x = 1.5, y = 0) {
    super({
      type: 'imageArrow', x, y,
      width: 0.3, height: 1.0,
      category: 'optics',
      displayName: '像',
      icon: '🔽'
    })

    // 像的属性（由光学引擎计算后设置）
    this.imageProps = {
      isReal: true,         // 实像/虚像
      height: 0.5,          // 像高（带符号，负=倒立）
      magnification: -0.5,  // 放大率
      visible: false,       // 是否有像
    }
  }

  /**
   * 由光学引擎更新像的属性
   */
  setImageProps(props) {
    Object.assign(this.imageProps, props)
  }

  render(ctx, renderer) {
    if (!this.imageProps.visible) return

    const [sx, sy] = renderer.worldToScreen(this.x, 0)  // 底座在轴上
    const imgH = Math.abs(this.imageProps.height) * renderer.scale
    const isInverted = this.imageProps.height < 0
    const isReal = this.imageProps.isReal
    const w = 12  // 与物体箭头一致

    ctx.save()

    if (!isReal) {
      ctx.setLineDash([5, 3])
      ctx.globalAlpha = 0.6
    }

    // 颜色
    const borderColor = isReal ? '#CC0000' : '#0288D1'
    const fill0 = isReal ? '#FF6B6B' : '#4FC3F7'
    const fill1 = isReal ? '#CC0000' : '#0288D1'

    // 箭头方向：倒立向下，正立向上
    const gradient = isInverted
      ? ctx.createLinearGradient(sx, sy, sx, sy + imgH)
      : ctx.createLinearGradient(sx, sy, sx, sy - imgH)
    gradient.addColorStop(0, fill0)
    gradient.addColorStop(1, fill1)
    ctx.fillStyle = gradient

    // 与物体完全一样的箭头形状
    ctx.beginPath()
    if (isInverted) {
      // 倒立：底座在轴上，尖端朝下
      ctx.moveTo(sx - 3, sy)
      ctx.lineTo(sx - 3, sy + imgH - 14)
      ctx.lineTo(sx - w, sy + imgH - 14)
      ctx.lineTo(sx, sy + imgH)
      ctx.lineTo(sx + w, sy + imgH - 14)
      ctx.lineTo(sx + 3, sy + imgH - 14)
      ctx.lineTo(sx + 3, sy)
    } else {
      // 正立：底座在轴上，尖端朝上
      ctx.moveTo(sx - 3, sy)
      ctx.lineTo(sx - 3, sy - imgH + 14)
      ctx.lineTo(sx - w, sy - imgH + 14)
      ctx.lineTo(sx, sy - imgH)
      ctx.lineTo(sx + w, sy - imgH + 14)
      ctx.lineTo(sx + 3, sy - imgH + 14)
      ctx.lineTo(sx + 3, sy)
    }
    ctx.closePath()
    ctx.fill()

    // 边框
    ctx.strokeStyle = borderColor
    ctx.lineWidth = 1.5
    ctx.stroke()

    ctx.setLineDash([])

    // 标签
    ctx.fillStyle = isReal ? '#FF6B6B' : '#4FC3F7'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    const label = isReal ? '实像' : '虚像'
    if (isInverted) {
      ctx.fillText(label, sx, sy + imgH + 18)
    } else {
      ctx.fillText(label, sx, sy - imgH - 8)
    }

    // 放大率
    const mag = Math.abs(this.imageProps.magnification)
    const magText = mag > 1 ? `${mag.toFixed(1)}倍` : mag < 1 ? `${mag.toFixed(1)}倍` : '等大'
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '10px sans-serif'
    if (isInverted) {
      ctx.fillText(magText, sx, sy + imgH + 30)
    } else {
      ctx.fillText(magText, sx, sy - imgH - 20)
    }

    ctx.restore()
  }
}
