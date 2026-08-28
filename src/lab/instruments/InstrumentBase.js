/**
 * 仪器基类 — 所有物理器材的根
 *
 * 设计原则：
 * - 每个仪器有连接点(Port)，连接点之间通过导线连接
 * - 仪器自身负责渲染和物理更新
 * - 仪器参数可通过UI调节
 */

import { Port } from './Port'

export { Port }

let _nextId = 1

export class InstrumentBase {
  constructor({
    type,
    x = 0,
    y = 0,
    width = 1.2,
    height = 0.6,
    category = 'electric',
    displayName = '',
    icon = '⚡'
  }) {
    this.id = `inst_${_nextId++}`
    this.type = type
    this.x = x
    this.y = y
    this.width = width
    this.height = height
    this.rotation = 0
    this.category = category
    this.displayName = displayName
    this.icon = icon

    this.ports = []
    this.params = {}     // {key: {value, min, max, step, label, unit}}
    this.state = {}
    this.selected = false
    this.dragging = false
    this.visible = true

    // 电路求解结果
    this.voltage = 0
    this.current = 0
  }

  addPort(opts) {
    const port = new Port(opts)
    this.ports.push(port)
    return port
  }

  getPort(portId) {
    return this.ports.find(p => p.id === portId)
  }

  setParam(key, value) {
    if (this.params[key]) {
      const { min, max } = this.params[key]
      this.params[key].value = Math.max(min, Math.min(max, value))
    }
  }

  getParam(key) {
    return this.params[key]?.value ?? 0
  }

  update(dt) {
    // 子类覆盖
  }

  render(ctx, renderer) {
    // 子类覆盖
  }

  /** 渲染所有连接点 */
  renderPorts(ctx, renderer) {
    for (const port of this.ports) {
      port.render(ctx, renderer, this)
    }
  }

  /** 渲染选中框 */
  renderSelection(ctx, renderer) {
    if (!this.selected) return
    const [sx, sy] = renderer.worldToScreen(this.x, this.y)
    const sw = this.width * renderer.scale
    const sh = this.height * renderer.scale

    ctx.strokeStyle = '#4FC3F7'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 3])
    ctx.strokeRect(sx - sw / 2 - 4, sy - sh / 2 - 4, sw + 8, sh + 8)
    ctx.setLineDash([])
  }

  containsPoint(wx, wy) {
    const hw = this.width / 2
    const hh = this.height / 2
    return wx >= this.x - hw && wx <= this.x + hw &&
           wy >= this.y - hh && wy <= this.y + hh
  }

  /** 查找最近的端口（屏幕坐标命中测试） */
  findPortAtScreen(sx, sy, renderer) {
    for (const port of this.ports) {
      if (port.hitTest(sx, sy, this, renderer)) {
        return port
      }
    }
    return null
  }

  /** 获取最近端口（世界坐标距离） */
  getNearestPort(wx, wy, threshold = 0.5) {
    let nearest = null
    let minDist = threshold
    for (const port of this.ports) {
      const pos = port.getWorldPos(this)
      const dist = Math.sqrt((pos.x - wx) ** 2 + (pos.y - wy) ** 2)
      if (dist < minDist) {
        minDist = dist
        nearest = port
      }
    }
    return nearest
  }

  serialize() {
    return {
      type: this.type,
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      rotation: this.rotation,
      params: Object.fromEntries(
        Object.entries(this.params).map(([k, v]) => [k, v.value])
      )
    }
  }
}
