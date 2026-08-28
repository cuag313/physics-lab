/**
 * PhysicsScene — 物理实验场景管理器
 *
 * 核心职责：
 * - 管理所有仪器（增删、选择、拖拽）
 * - 管理导线连接
 * - 驱动物理引擎循环
 * - 协调渲染
 */

import { Wire } from '../instruments/electric/Wire'
import { CircuitEngine } from '../engines/CircuitEngine'
import { OpticsEngine, PointSource, Screen } from '../engines/OpticsEngine'

export class PhysicsScene {
  constructor() {
    this.instruments = []
    this.wires = []
    this.selectedInstrument = null
    this.dragging = false
    this.dragOffset = { x: 0, y: 0 }

    // 连线状态
    this.wiringMode = false
    this.wiringFrom = null // {instrument, port}

    // 引擎
    this.circuitEngine = new CircuitEngine()
    this.opticsEngine = new OpticsEngine()

    // 渲染器（外部注入）
    this.renderer = null

    // 运行状态
    this.running = false
    this.lastTime = 0
    this.animFrameId = null

    // 事件回调
    this.onUpdate = null  // (instruments) => void
    this.onSolve = null   // (valid) => void
  }

  // ========== 仪器管理 ==========

  addInstrument(instrument) {
    this.instruments.push(instrument)
    this._dirty = true
    return instrument
  }

  removeInstrument(id) {
    // 删除相关导线
    this.wires = this.wires.filter(w =>
      w.from.instrumentId !== id && w.to.instrumentId !== id
    )
    this.instruments = this.instruments.filter(i => i.id !== id)
    if (this.selectedInstrument?.id === id) {
      this.selectedInstrument = null
    }
    this._dirty = true
  }

  getInstrumentAt(wx, wy) {
    // 从后往前遍历（后添加的在上层）
    for (let i = this.instruments.length - 1; i >= 0; i--) {
      if (this.instruments[i].containsPoint(wx, wy)) {
        return this.instruments[i]
      }
    }
    return null
  }

  selectInstrument(inst) {
    if (this.selectedInstrument) {
      this.selectedInstrument.selected = false
    }
    this.selectedInstrument = inst
    if (inst) inst.selected = true
  }

  // ========== 导线连接 ==========

  startWiring(instrument, port) {
    this.wiringMode = true
    this.wiringFrom = { instrument, port }
  }

  /**
   * 完成连线
   * 支持两种调用方式：
   * - completeWiring(fromInstrument, fromPort, toInstrument, toPort) — 新版直接连线
   * - completeWiring(instrument, port) — 旧版从wiringFrom读取起点
   */
  completeWiring(fromInstOrToInst, fromPortOrToPort, toInstrument, toPort) {
    let fromInst, fromPortObj, toInst, toPortObj

    if (toInstrument && toPort) {
      // 新版：4参数
      fromInst = fromInstOrToInst
      fromPortObj = fromPortOrToPort
      toInst = toInstrument
      toPortObj = toPort
    } else {
      // 旧版：从wiringFrom读取
      if (!this.wiringMode || !this.wiringFrom) return false
      fromInst = this.wiringFrom.instrument
      fromPortObj = this.wiringFrom.port
      toInst = fromInstOrToInst
      toPortObj = fromPortOrToPort
    }

    // 不能连自己
    if (fromInst.id === toInst.id && fromPortObj.id === toPortObj.id) {
      this.cancelWiring()
      return false
    }

    // 检查是否已存在连接
    const exists = this.wires.some(w =>
      (w.from.instrumentId === fromInst.id &&
       w.from.portId === fromPortObj.id &&
       w.to.instrumentId === toInst.id &&
       w.to.portId === toPortObj.id) ||
      (w.to.instrumentId === fromInst.id &&
       w.to.portId === fromPortObj.id &&
       w.from.instrumentId === toInst.id &&
       w.from.portId === toPortObj.id)
    )

    if (exists) {
      this.cancelWiring()
      return false
    }

    // 创建导线
    const wire = new Wire(fromInst, fromPortObj.id, toInst, toPortObj.id)
    this.wires.push(wire)

    // 更新端口连接状态
    fromPortObj.connectedTo.push({ instrumentId: toInst.id, portId: toPortObj.id })
    toPortObj.connectedTo.push({ instrumentId: fromInst.id, portId: fromPortObj.id })

    this.cancelWiring()
    this._dirty = true
    return true
  }

  cancelWiring() {
    this.wiringMode = false
    this.wiringFrom = null
  }

  removeWire(index) {
    if (index >= 0 && index < this.wires.length) {
      const wire = this.wires[index]
      // 清除端口连接状态
      const fromInst = this.instruments.find(i => i.id === wire.from.instrumentId)
      const toInst = this.instruments.find(i => i.id === wire.to.instrumentId)
      if (fromInst) {
        const port = fromInst.getPort(wire.from.portId)
        if (port) port.connectedTo = port.connectedTo.filter(c =>
          !(c.instrumentId === wire.to.instrumentId && c.portId === wire.to.portId)
        )
      }
      if (toInst) {
        const port = toInst.getPort(wire.to.portId)
        if (port) port.connectedTo = port.connectedTo.filter(c =>
          !(c.instrumentId === wire.from.instrumentId && c.portId === wire.from.portId)
        )
      }
      this.wires.splice(index, 1)
      this._dirty = true
    }
  }

  // ========== 物理求解 ==========

  solve() {
    this.circuitEngine.setCircuit(this.instruments, this.wires)
    const valid = this.circuitEngine.solve()

    // 更新所有仪器
    for (const inst of this.instruments) {
      inst.update(0.016)
    }

    this.onSolve?.(valid)
    return valid
  }

  // ========== 模拟循环 ==========

  start() {
    if (this.running) return
    this.running = true
    this.lastTime = performance.now()
    this._loop()
  }

  stop() {
    this.running = false
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }
  }

  _loop() {
    if (!this.running) return

    const now = performance.now()
    const dt = Math.min((now - this.lastTime) / 1000, 0.033) // cap at ~30fps
    this.lastTime = now

    // 如果电路有变化，重新求解
    if (this._dirty) {
      this.solve()
      this.rebuildOptics()
      this._dirty = false
    }

    // 更新所有仪器
    for (const inst of this.instruments) {
      inst.update(dt)
    }

    this.onUpdate?.(this.instruments)

    this.animFrameId = requestAnimationFrame(() => this._loop())
  }

  // ========== 序列化 ==========

  serialize() {
    return {
      instruments: this.instruments
        .filter(i => i.type !== 'wire')
        .map(i => i.serialize()),
      wires: this.wires.map(w => ({
        from: w.from,
        to: w.to
      }))
    }
  }

  /** 标记电路需要重新求解 */
  markDirty() {
    this._dirty = true
  }

  // ========== 光学引擎集成 ==========

  /** 从当前仪器重建光学场景 */
  rebuildOptics() {
    this.opticsEngine.clear()

    for (const inst of this.instruments) {
      switch (inst.type) {
        case 'lightSource':
          this.opticsEngine.addSource(new PointSource(
            inst.x, inst.y,
            inst.getParam('direction'),
            inst.getParam('spread'),
            inst.getParam('rayCount'),
            '#ffdd00'
          ))
          break
        case 'objectArrow':
          this.opticsEngine.addSource(new PointSource(
            inst.x, inst.y,
            0,   // direction: 沿主轴方向
            20,  // spread: 较小发射角
            30,  // rayCount
            '#FFD700',
            inst.getObjectHeight()  // 物高
          ))
          break
        case 'convexLens':
          this.opticsEngine.addElement({
            type: 'convexLens',
            x: inst.x, y: inst.y,
            f: inst.getParam('focalLength')
          })
          break
        case 'concaveLens':
          this.opticsEngine.addElement({
            type: 'concaveLens',
            x: inst.x, y: inst.y,
            f: -Math.abs(inst.getParam('focalLength'))
          })
          break
        case 'planeMirror':
          this.opticsEngine.addElement({
            type: 'planeMirror',
            x: inst.x, y: inst.y,
            angle: inst.getParam('angle'),
            length: inst.height
          })
          break
        case 'screen':
          this.opticsEngine.addDetector(new Screen(
            inst.x, inst.y, inst.height
          ))
          break
      }
    }

    this.opticsEngine.step()

    // 更新 ImageArrow 的位置和属性
    const imgResult = this.opticsEngine.imageResult
    for (const inst of this.instruments) {
      if (inst.type === 'imageArrow') {
        if (imgResult) {
          inst.x = imgResult.x
          inst.y = imgResult.y
          inst.setImageProps({
            isReal: imgResult.isReal,
            height: imgResult.height,
            magnification: imgResult.magnification,
            visible: true,
          })
        } else {
          inst.setImageProps({ visible: false })
        }
      }
    }
  }

  /** 获取光学光线（用于渲染） */
  getOpticsRays() {
    return this.opticsEngine.rays
  }

  /** 获取成像计算结果 */
  getImageResult() {
    return this.opticsEngine.imageResult
  }
}
