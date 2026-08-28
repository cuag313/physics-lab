/**
 * SceneRenderer — Canvas2D 场景渲染器
 *
 * 职责：
 * - 坐标变换（世界坐标 ↔ 屏幕坐标）
 * - 网格背景
 * - 刻度尺
 * - 调用仪器自身的render方法
 * - 渲染导线
 * - 渲染连线预览
 */

export class SceneRenderer {
  constructor(canvas) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')

    // 视口参数
    this.scale = 100      // 1米 = 100像素
    this.offsetX = 0      // 世界原点在屏幕上的x
    this.offsetY = 0      // 世界原点在屏幕上的y

    // 视觉主题
    this.theme = {
      background: '#0d1117',
      gridMinor: '#161b22',
      gridMajor: '#21262d',
      axis: '#30363d',
      scaleText: '#8b949e',
      labelText: '#c9d1d9',
      benchSurface: '#161b22',
      benchBorder: '#30363d',
    }
  }

  /** 调整画布大小（处理DPR） */
  resize() {
    const dpr = window.devicePixelRatio || 1
    const rect = this.canvas.getBoundingClientRect()
    this.canvas.width = rect.width * dpr
    this.canvas.height = rect.height * dpr
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.screenW = rect.width
    this.screenH = rect.height
    this.offsetX = rect.width / 2
    this.offsetY = rect.height / 2
  }

  /** 世界坐标 → 屏幕坐标 */
  worldToScreen(wx, wy) {
    return [
      this.offsetX + wx * this.scale,
      this.offsetY - wy * this.scale
    ]
  }

  /** 屏幕坐标 → 世界坐标 */
  screenToWorld(sx, sy) {
    return [
      (sx - this.offsetX) / this.scale,
      (this.offsetY - sy) / this.scale
    ]
  }

  /** 清空画布 */
  clear() {
    const ctx = this.ctx
    ctx.fillStyle = this.theme.background
    ctx.fillRect(0, 0, this.screenW, this.screenH)
  }

  /** 绘制网格 */
  drawGrid() {
    const ctx = this.ctx
    const minorStep = 0.2 * this.scale  // 小格 0.2米
    const majorStep = 1.0 * this.scale  // 大格 1米

    // 小格
    ctx.strokeStyle = this.theme.gridMinor
    ctx.lineWidth = 0.5

    const startX = this.offsetX % minorStep
    const startY = this.offsetY % minorStep

    for (let x = startX; x < this.screenW; x += minorStep) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, this.screenH)
      ctx.stroke()
    }
    for (let y = startY; y < this.screenH; y += minorStep) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(this.screenW, y)
      ctx.stroke()
    }

    // 大格
    ctx.strokeStyle = this.theme.gridMajor
    ctx.lineWidth = 1

    const startXMajor = this.offsetX % majorStep
    const startYMajor = this.offsetY % majorStep

    for (let x = startXMajor; x < this.screenW; x += majorStep) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, this.screenH)
      ctx.stroke()
    }
    for (let y = startYMajor; y < this.screenH; y += majorStep) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(this.screenW, y)
      ctx.stroke()
    }

    // 坐标轴
    ctx.strokeStyle = this.theme.axis
    ctx.lineWidth = 1.5
    // x轴
    ctx.beginPath()
    ctx.moveTo(0, this.offsetY)
    ctx.lineTo(this.screenW, this.offsetY)
    ctx.stroke()
    // y轴
    ctx.beginPath()
    ctx.moveTo(this.offsetX, 0)
    ctx.lineTo(this.offsetX, this.screenH)
    ctx.stroke()

    // 刻度标注
    ctx.fillStyle = this.theme.scaleText
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (let x = startXMajor; x < this.screenW; x += majorStep) {
      const worldX = (x - this.offsetX) / this.scale
      if (Math.abs(worldX) > 0.01) {
        ctx.fillText(worldX.toFixed(1), x, this.offsetY + 4)
      }
    }
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (let y = startYMajor; y < this.screenH; y += majorStep) {
      const worldY = (this.offsetY - y) / this.scale
      if (Math.abs(worldY) > 0.01) {
        ctx.fillText(worldY.toFixed(1), this.offsetX - 6, y)
      }
    }
  }

  /** 渲染整个场景 */
  renderScene(scene) {
    this.clear()
    this.drawGrid()

    // 渲染仪器
    for (const inst of scene.instruments) {
      if (inst.visible && inst.type !== 'wire') {
        inst.render(this.ctx, this)
      }
    }

    // 渲染导线
    for (const wire of scene.wires) {
      wire.render(this.ctx, this, scene.instruments)
    }

    // 渲染光学光线
    const rays = scene.getOpticsRays?.() ?? []
    for (const ray of rays) {
      this._drawOpticalRay(ray)
    }

    // 渲染连线预览
    if (scene.wiringMode && scene.wiringFrom) {
      this._drawWiringPreview(scene)
    }
  }

  /** 绘制连线预览（从起始端口到鼠标位置） */
  _drawWiringPreview(scene) {
    // 需要外部提供鼠标位置
    if (!this._mouseWorldPos) return

    const from = scene.wiringFrom
    const portPos = from.port.getWorldPos(from.instrument)
    const [x1, y1] = this.worldToScreen(portPos.x, portPos.y)
    const [x2, y2] = this.worldToScreen(this._mouseWorldPos.x, this._mouseWorldPos.y)

    const ctx = this.ctx
    ctx.strokeStyle = '#4CAF50'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    ctx.setLineDash([])

    // 起点高亮
    ctx.fillStyle = '#4CAF50'
    ctx.beginPath()
    ctx.arc(x1, y1, 6, 0, Math.PI * 2)
    ctx.fill()
  }

  /** 绘制光学光线（增强版） */
  _drawOpticalRay(ray) {
    const [x1, y1] = this.worldToScreen(ray.from.x, ray.from.y)
    const [x2, y2] = this.worldToScreen(ray.to.x, ray.to.y)

    const ctx = this.ctx
    const alpha = Math.max(0.3, ray.intensity ?? 1)
    const color = ray.color || '#ffdd00'

    if (ray.isVirtual) {
      // 虚线（反向延长线）
      ctx.strokeStyle = color
      ctx.lineWidth = 1
      ctx.globalAlpha = alpha * 0.5
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1
      return
    }

    // 光线发光效果（外层）
    ctx.strokeStyle = color
    ctx.lineWidth = 5
    ctx.globalAlpha = alpha * 0.15
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()

    // 光线发光效果（中层）
    ctx.lineWidth = 3
    ctx.globalAlpha = alpha * 0.4
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()

    // 光线主体（核心）
    ctx.globalAlpha = alpha * 0.9
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()

    ctx.globalAlpha = 1
  }

  /** 更新鼠标世界坐标（用于连线预览） */
  setMouseWorldPos(wx, wy) {
    this._mouseWorldPos = { x: wx, y: wy }
  }
}
