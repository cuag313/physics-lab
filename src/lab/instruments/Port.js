/**
 * 连接点（端口）系统 — 大圆点 + 拖拽画线 + 松手吸附
 *
 * 设计目标：
 * - 30px大圆形连接点，易于点击
 * - 从连接点拖出 → 画线跟随鼠标 → 松手吸附最近端点
 * - 连接点状态：空闲(金色) / 已连接(绿色) / 悬停高亮(白色光晕)
 */

let _nextPortId = 1

export class Port {
  constructor({
    id,
    type = 'electrical',
    dx = 0,
    dy = 0,
    label = '',
    color = '#FFD700',
    radius = 15,        // 渲染半径（像素）
    hitRadius = 20,     // 碰撞检测半径（像素）
    direction = null,   // 端口朝向（用于自动连线路径），null=任意
  }) {
    this.id = id || `port_${_nextPortId++}`
    this.type = type
    this.dx = dx
    this.dy = dy
    this.label = label
    this.color = color
    this.radius = radius
    this.hitRadius = hitRadius
    this.direction = direction

    // 连接状态
    this.connectedTo = []  // [{instrumentId, portId}]
    this.nodeId = null     // 电路求解时的节点编号

    // 交互状态（渲染用）
    this.hovered = false
    this.active = false    // 正在被拖拽连线
  }

  /** 获取世界坐标 */
  getWorldPos(instrument) {
    return {
      x: instrument.x + this.dx,
      y: instrument.y + this.dy
    }
  }

  /** 是否已连接 */
  get isConnected() {
    return this.connectedTo.length > 0
  }

  /** 渲染连接点 */
  render(ctx, renderer, instrument) {
    const pos = this.getWorldPos(instrument)
    const [sx, sy] = renderer.worldToScreen(pos.x, pos.y)
    const r = this.radius

    // 外圈光晕（悬停/激活时）
    if (this.hovered || this.active) {
      const gradient = ctx.createRadialGradient(sx, sy, r, sx, sy, r * 2)
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.25)')
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(sx, sy, r * 2, 0, Math.PI * 2)
      ctx.fill()
    }

    // 连接点底色
    let fillColor
    if (this.active) {
      fillColor = '#fff'
    } else if (this.isConnected) {
      fillColor = '#4CAF50'
    } else if (this.hovered) {
      fillColor = '#FFE082'
    } else {
      fillColor = this.color
    }

    // 外圈
    ctx.beginPath()
    ctx.arc(sx, sy, r, 0, Math.PI * 2)
    ctx.fillStyle = fillColor
    ctx.fill()
    ctx.strokeStyle = this.isConnected ? '#2E7D32' : '#B8860B'
    ctx.lineWidth = 2
    ctx.stroke()

    // 内圈
    ctx.beginPath()
    ctx.arc(sx, sy, r * 0.35, 0, Math.PI * 2)
    ctx.fillStyle = this.isConnected ? '#fff' : 'rgba(255,255,255,0.6)'
    ctx.fill()

    // 标签
    if (this.label) {
      ctx.fillStyle = '#fff'
      ctx.font = `bold ${Math.max(10, r * 0.7)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(this.label, sx, sy - r - 3)
    }

    // 已连接：小对勾
    if (this.isConnected && !this.hovered && !this.active) {
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(sx - 4, sy)
      ctx.lineTo(sx - 1, sy + 3)
      ctx.lineTo(sx + 5, sy - 3)
      ctx.stroke()
    }
  }

  /** 屏幕坐标是否在端口范围内 */
  hitTest(sx, sy, instrument, renderer) {
    const pos = this.getWorldPos(instrument)
    const [psx, psy] = renderer.worldToScreen(pos.x, pos.y)
    const dx = sx - psx
    const dy = sy - psy
    return dx * dx + dy * dy <= this.hitRadius * this.hitRadius
  }
}
