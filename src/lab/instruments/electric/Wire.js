import { InstrumentBase } from '../InstrumentBase'

/**
 * 导线 — 连接两个端口
 * 特殊仪器：没有固定位置，由两个端口定义路径
 */
export class Wire extends InstrumentBase {
  constructor(fromInstrument, fromPortId, toInstrument, toPortId) {
    super({
      type: 'wire',
      width: 0, height: 0,
      category: 'electric',
      displayName: '导线',
      icon: '➖'
    })

    this.from = { instrumentId: fromInstrument.id, portId: fromPortId }
    this.to = { instrumentId: toInstrument.id, portId: toPortId }
    this.waypoints = [] // 中间折点 [{x, y}]

    // 导线电阻（理想导线≈0）
    this.params = {
      resistance: { value: 0.001, min: 0, max: 100, step: 0.001, label: '电阻', unit: 'Ω' }
    }
  }

  /**
   * 获取导线路径点（世界坐标）
   */
  getPath(instruments) {
    const fromInst = instruments.find(i => i.id === this.from.instrumentId)
    const toInst = instruments.find(i => i.id === this.to.instrumentId)
    if (!fromInst || !toInst) return []

    const fromPort = fromInst.getPort(this.from.portId)
    const toPort = toInst.getPort(this.to.portId)
    if (!fromPort || !toPort) return []

    const from = fromPort.getWorldPos(fromInst)
    const to = toPort.getWorldPos(toInst)

    return [from, ...this.waypoints, to]
  }

  render(ctx, renderer, instruments) {
    const path = this.getPath(instruments)
    if (path.length < 2) return

    // 绘制导线
    ctx.strokeStyle = this.selected ? '#4FC3F7' : '#4CAF50'
    ctx.lineWidth = this.selected ? 3 : 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    ctx.beginPath()
    const [x0, y0] = renderer.worldToScreen(path[0].x, path[0].y)
    ctx.moveTo(x0, y0)

    for (let i = 1; i < path.length; i++) {
      const [x, y] = renderer.worldToScreen(path[i].x, path[i].y)
      ctx.lineTo(x, y)
    }
    ctx.stroke()

    // 绘制折点
    for (let i = 1; i < path.length - 1; i++) {
      const [x, y] = renderer.worldToScreen(path[i].x, path[i].y)
      ctx.fillStyle = '#4CAF50'
      ctx.beginPath()
      ctx.arc(x, y, 3, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  containsPoint(wx, wy) {
    // 导线不参与点击检测
    return false
  }
}
