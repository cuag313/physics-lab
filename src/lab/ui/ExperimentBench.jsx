import { useRef, useEffect, useState, useCallback } from 'react'
import { PhysicsScene } from '../core/PhysicsScene'
import { SceneRenderer } from '../renderers/SceneRenderer'
import Toolbox from './Toolbox'
import DataPanel from './DataPanel'
import FormulaOverlay from './FormulaOverlay'

import {
  Battery, Resistor, Bulb, Switch, Ammeter, Voltmeter, Rheostat, Wire,
  LightSource, ConvexLens, ConcaveLens, PlaneMirrorInst, ScreenInst,
  ObjectArrow, ImageArrow
} from '../instruments'

const INSTRUMENT_FACTORIES = {
  battery: () => new Battery(),
  resistor: () => new Resistor(),
  bulb: () => new Bulb(),
  switch: () => new Switch(),
  ammeter: () => new Ammeter(),
  voltmeter: () => new Voltmeter(),
  rheostat: () => new Rheostat(),
  lightSource: () => new LightSource(),
  convexLens: () => new ConvexLens(),
  concaveLens: () => new ConcaveLens(),
  planeMirror: () => new PlaneMirrorInst(),
  screen: () => new ScreenInst(),
  objectArrow: () => new ObjectArrow(),
  imageArrow: () => new ImageArrow(),
}

/**
 * ExperimentBench — NB级物理实验台
 *
 * 交互模型（对齐NB）：
 * - 点击仪器 → 选中，开始拖拽
 * - 点击连接点 → 开始画线，线跟随鼠标
 * - 松手在连接点上 → 完成连线
 * - 松手在空白处 → 取消连线
 * - 双击开关 → 切换通断
 * - 右键 → 删除仪器
 */
export default function ExperimentBench({ preset = null, title = '物理实验台', quickCircuit = false, category = null }) {
  const canvasRef = useRef(null)
  const sceneRef = useRef(null)
  const rendererRef = useRef(null)
  const animRef = useRef(null)

  const [instruments, setInstruments] = useState([])
  const [circuitValid, setCircuitValid] = useState(false)
  const [selectedInst, setSelectedInst] = useState(null)
  const [toolboxVisible, setToolboxVisible] = useState(true)
  const [formulaVisible, setFormulaVisible] = useState(true)

  // 交互状态（用ref避免重渲染）
  const interactionRef = useRef({
    mode: 'idle',        // idle | dragging | sliderDrag | wiring
    dragTarget: null,     // 被拖拽的仪器
    dragOffset: { x: 0, y: 0 },
    wiringFrom: null,     // {instrument, port}
    wiringMousePos: null, // {x, y} 世界坐标
    hoveredPort: null,    // 当前悬停的端口
    mouseScreenPos: { x: 0, y: 0 },
    snapTarget: null,     // 磁吸目标端口 {instrument, port}
    rafPending: false,    // rAF节流锁
  })

  // 光标状态（触发重渲染仅在mode变化时）
  const [cursor, setCursor] = useState('default')

  // 初始化
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const scene = new PhysicsScene()
    const renderer = new SceneRenderer(canvas)
    sceneRef.current = scene
    rendererRef.current = renderer
    window.__labScene = scene

    renderer.resize()

    scene.onUpdate = () => {
      setInstruments([...scene.instruments])
    }
    scene.onSolve = (valid) => {
      setCircuitValid(valid)
    }

    if (preset) {
      loadPreset(scene, preset)
      setInstruments([...scene.instruments])
      setCircuitValid(scene.circuitEngine?.valid ?? false)
    }

    // 启动物理场景主循环（驱动update(dt)和onUpdate回调）
    scene.start()

    const renderLoop = () => {
      renderFrame(scene, renderer, interactionRef.current)
      animRef.current = requestAnimationFrame(renderLoop)
    }
    renderLoop()

    const handleResize = () => renderer.resize()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (animRef.current) cancelAnimationFrame(animRef.current)
      scene.stop()
    }
  }, [preset])

  // ========== 渲染帧 ==========
  const renderFrame = (scene, renderer, interaction) => {
    renderer.clear()
    renderer.drawGrid()

    // 渲染仪器
    for (const inst of scene.instruments) {
      if (inst.visible && inst.type !== 'wire') {
        // 拖拽中的仪器：半透明 + 阴影
        const isDragging = interaction.mode === 'dragging' && inst === interaction.dragTarget
        if (isDragging) {
          renderer.ctx.save()
          renderer.ctx.globalAlpha = 0.7
          renderer.ctx.shadowColor = 'rgba(79, 195, 247, 0.5)'
          renderer.ctx.shadowBlur = 16
        }
        inst.render(renderer.ctx, renderer)
        if (isDragging) {
          renderer.ctx.restore()
        }
      }
    }

    // 渲染导线
    for (const wire of scene.wires) {
      wire.render(renderer.ctx, renderer, scene.instruments)
    }

    // 渲染光学光线
    const rays = scene.getOpticsRays?.() ?? []
    for (const ray of rays) {
      renderer._drawOpticalRay(ray)
    }

    // 渲染光屏成像点
    const optics = scene.opticsEngine
    if (optics) {
      for (const det of optics.detectors) {
        if (det.hitPoints && det.hitPoints.length > 0) {
          for (const hp of det.hitPoints) {
            const [px, py] = renderer.worldToScreen(hp.x, hp.y)
            const ctx = renderer.ctx
            // 光斑
            const glow = ctx.createRadialGradient(px, py, 0, px, py, 8)
            glow.addColorStop(0, 'rgba(255, 220, 100, 0.8)')
            glow.addColorStop(0.5, 'rgba(255, 180, 50, 0.4)')
            glow.addColorStop(1, 'rgba(255, 150, 0, 0)')
            ctx.fillStyle = glow
            ctx.beginPath()
            ctx.arc(px, py, 8, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }
    }

    // 渲染连线预览
    if (interaction.mode === 'wiring' && interaction.wiringFrom && interaction.wiringMousePos) {
      const from = interaction.wiringFrom
      const portPos = from.port.getWorldPos(from.instrument)
      const [x1, y1] = renderer.worldToScreen(portPos.x, portPos.y)
      const [x2, y2] = renderer.worldToScreen(
        interaction.wiringMousePos.x,
        interaction.wiringMousePos.y
      )

      const ctx = renderer.ctx
      const snap = interaction.snapTarget

      // 连线（带发光）
      ctx.strokeStyle = snap ? '#FFD700' : '#4CAF50'
      ctx.lineWidth = 4
      ctx.globalAlpha = 0.3
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()

      ctx.globalAlpha = 1
      ctx.lineWidth = 2
      ctx.setLineDash([8, 4])
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
      ctx.setLineDash([])

      // 起点光圈
      ctx.strokeStyle = '#4CAF50'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(x1, y1, 18, 0, Math.PI * 2)
      ctx.stroke()

      // 磁吸目标：大光圈脉冲
      if (snap) {
        const pulse = 1 + 0.15 * Math.sin(Date.now() * 0.008)
        ctx.strokeStyle = '#FFD700'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(x2, y2, 22 * pulse, 0, Math.PI * 2)
        ctx.stroke()
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(x2, y2, 30 * pulse, 0, Math.PI * 2)
        ctx.stroke()
      } else if (interaction.hoveredPort) {
        // 普通悬停高亮
        ctx.strokeStyle = '#FFD700'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(x2, y2, 18, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
  }

  // ========== 查找端口（屏幕坐标） ==========
  const findPortAtScreen = useCallback((sx, sy) => {
    const scene = sceneRef.current
    const renderer = rendererRef.current
    if (!scene || !renderer) return null

    for (const inst of scene.instruments) {
      if (inst.type === 'wire' || !inst.visible) continue
      const port = inst.findPortAtScreen(sx, sy, renderer)
      if (port) return { instrument: inst, port }
    }
    return null
  }, [])

  // ========== 查找仪器（世界坐标） ==========
  const findInstrumentAt = useCallback((wx, wy) => {
    const scene = sceneRef.current
    if (!scene) return null
    return scene.getInstrumentAt(wx, wy)
  }, [])

  // ========== 鼠标事件 ==========
  const handleMouseDown = useCallback((e) => {
    const scene = sceneRef.current
    const renderer = rendererRef.current
    if (!scene || !renderer) return

    const rect = canvasRef.current.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const [wx, wy] = renderer.screenToWorld(sx, sy)
    const interaction = interactionRef.current

    // 右键：删除
    if (e.button === 2) {
      e.preventDefault()
      const inst = findInstrumentAt(wx, wy)
      if (inst) {
        scene.removeInstrument(inst.id)
        setInstruments([...scene.instruments])
        setSelectedInst(null)
      }
      return
    }

    // 滑动变阻器：区分滑片头 vs 仪器身体
    const sliderInst = findInstrumentAt(wx, wy)
    if (sliderInst && sliderInst.type === 'rheostat') {
      scene.selectInstrument(sliderInst)
      setSelectedInst(sliderInst)

      // 检测是否点在滑片头上
      const sp = sliderInst.getParam('sliderPos')
      const sliderX = sliderInst.x - sliderInst.width * 0.38 + sliderInst.width * 0.76 * sp
      const sliderY = sliderInst.y - sliderInst.height * 0.3
      const dist = Math.hypot(wx - sliderX, wy - sliderY)

      if (dist < 0.3) {
        // 点在滑片头附近 → 拖滑片
        interaction.mode = 'sliderDrag'
        interaction.dragTarget = sliderInst
        sliderInst.onDrag(wx)
        scene.markDirty()
        scene.solve()
        setInstruments([...scene.instruments])
        setCircuitValid(scene.circuitEngine?.valid ?? false)
        setCursor('ew-resize')
      } else {
        // 点在滑变器身体 → 整体移动
        interaction.mode = 'dragging'
        interaction.dragTarget = sliderInst
        interaction.dragOffset = { x: wx - sliderInst.x, y: wy - sliderInst.y }
        setCursor('grabbing')
      }
      return
    }

    // 端口检测（连线）
    const portHit = findPortAtScreen(sx, sy)
    if (portHit) {
      interaction.mode = 'wiring'
      interaction.wiringFrom = portHit
      interaction.wiringMousePos = { x: wx, y: wy }
      portHit.port.active = true
      setCursor('crosshair')
      return
    }

    // 其他仪器：整体拖拽
    const inst = findInstrumentAt(wx, wy)
    if (inst) {
      scene.selectInstrument(inst)
      setSelectedInst(inst)
      interaction.mode = 'dragging'
      interaction.dragTarget = inst
      interaction.dragOffset = { x: wx - inst.x, y: wy - inst.y }
      setCursor('grabbing')
    } else {
      // 点击空白
      scene.selectInstrument(null)
      setSelectedInst(null)
    }
  }, [findPortAtScreen, findInstrumentAt])

  // ========== rAF节流的鼠标移动处理 ==========
  const processMouseMove = useCallback((sx, sy, wx, wy) => {
    const renderer = rendererRef.current
    const scene = sceneRef.current
    if (!renderer || !scene) return

    const interaction = interactionRef.current
    interaction.mouseScreenPos = { x: sx, y: sy }

    // 连线模式
    if (interaction.mode === 'wiring') {
      interaction.wiringMousePos = { x: wx, y: wy }

      // 检测悬停端口
      const portHit = findPortAtScreen(sx, sy)
      // 清除旧悬停
      if (interaction.hoveredPort && interaction.hoveredPort !== portHit?.port) {
        interaction.hoveredPort.hovered = false
      }
      if (portHit && portHit.port !== interaction.wiringFrom?.port) {
        portHit.port.hovered = true
        interaction.hoveredPort = portHit.port
        // 磁吸：30px内自动锁定
        const pos = portHit.port.getWorldPos(portHit.instrument)
        const [psx, psy] = renderer.worldToScreen(pos.x, pos.y)
        const dist = Math.hypot(sx - psx, sy - psy)
        interaction.snapTarget = dist < 30 ? portHit : null
      } else {
        interaction.hoveredPort = null
        interaction.snapTarget = null
      }
      return
    }

    // 拖拽模式
    if (interaction.mode === 'dragging' && interaction.dragTarget) {
      interaction.dragTarget.x = wx - interaction.dragOffset.x
      interaction.dragTarget.y = wy - interaction.dragOffset.y
      scene.markDirty()
      scene.rebuildOptics()  // 光学实验实时更新
      return
    }

    // 滑片拖拽模式
    if (interaction.mode === 'sliderDrag' && interaction.dragTarget) {
      interaction.dragTarget.onDrag(wx)
      scene.markDirty()
      scene.solve()
      setInstruments([...scene.instruments])
      setCircuitValid(scene.circuitEngine?.valid ?? false)
      return
    }

    // 空闲模式：更新端口悬停状态 + 滑片检测
    let cursorMode = 'default'
    for (const inst of scene.instruments) {
      if (inst.type === 'wire') continue
      for (const port of inst.ports) {
        port.hovered = port.hitTest(sx, sy, inst, renderer)
      }
      // 检测滑变器悬停
      if (inst.type === 'rheostat') {
        const sliderPos = inst.getParam('sliderPos')
        const sliderX = inst.x - inst.width * 0.38 + inst.width * 0.76 * sliderPos
        const sliderY = inst.y - inst.height * 0.3
        const dist = Math.sqrt((wx - sliderX) ** 2 + (wy - sliderY) ** 2)
        if (dist < 0.3) {
          cursorMode = 'ew-resize'  // 滑片头上
        } else if (inst.containsPoint(wx, wy) && cursorMode === 'default') {
          cursorMode = 'grab'  // 滑变器身体上
        }
      }
    }
    setCursor(cursorMode)
  }, [findPortAtScreen])

  const handleMouseMove = useCallback((e) => {
    const renderer = rendererRef.current
    if (!renderer) return

    const rect = canvasRef.current.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const [wx, wy] = renderer.screenToWorld(sx, sy)
    const interaction = interactionRef.current

    // 记录最新坐标，rAF消费
    interaction._pendingMove = { sx, sy, wx, wy }

    // rAF节流：每帧只处理一次
    if (!interaction.rafPending) {
      interaction.rafPending = true
      requestAnimationFrame(() => {
        interaction.rafPending = false
        const m = interaction._pendingMove
        if (m) processMouseMove(m.sx, m.sy, m.wx, m.wy)
      })
    }
  }, [processMouseMove])

  const handleMouseUp = useCallback((e) => {
    const scene = sceneRef.current
    const renderer = rendererRef.current
    if (!scene || !renderer) return

    const rect = canvasRef.current.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const interaction = interactionRef.current

    // 连线模式：松手
    if (interaction.mode === 'wiring') {
      const from = interaction.wiringFrom
      from.port.active = false

      // 优先使用磁吸目标，否则检测松手位置
      let portHit = interaction.snapTarget
      if (!portHit) {
        portHit = findPortAtScreen(sx, sy)
      }

      if (portHit && portHit.port !== from.port) {
        // 完成连线！
        scene.completeWiring(from.instrument, from.port, portHit.instrument, portHit.port)
        scene.markDirty()
        scene.solve()
        scene.rebuildOptics()
        setInstruments([...scene.instruments])
      }

      // 清除状态
      if (interaction.hoveredPort) {
        interaction.hoveredPort.hovered = false
      }

      interaction.mode = 'idle'
      interaction.wiringFrom = null
      interaction.wiringMousePos = null
      interaction.hoveredPort = null
      interaction.snapTarget = null
      setCursor('default')
      return
    }

    // 拖拽模式：松手
    if (interaction.mode === 'dragging' || interaction.mode === 'sliderDrag') {
      interaction.mode = 'idle'
      interaction.dragTarget = null
      setCursor('default')
      scene.solve()
      scene.rebuildOptics()
      setInstruments([...scene.instruments])
      return
    }
  }, [findPortAtScreen])

  const handleDoubleClick = useCallback((e) => {
    const scene = sceneRef.current
    const renderer = rendererRef.current
    if (!scene || !renderer) return

    const rect = canvasRef.current.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const [wx, wy] = renderer.screenToWorld(sx, sy)
    const inst = findInstrumentAt(wx, wy)
    if (inst && inst.type === 'switch') {
      inst.toggle()
      scene.markDirty()
      scene.solve()
      setInstruments([...scene.instruments])
    }
  }, [findInstrumentAt])

  const handleContextMenu = useCallback((e) => e.preventDefault(), [])

  // 仪器ID计数器（用于布局）
  const instCountRef = useRef(0)

  // 添加仪器
  const handleAddInstrument = useCallback((type) => {
    const scene = sceneRef.current
    if (!scene) return
    const factory = INSTRUMENT_FACTORIES[type]
    if (!factory) return
    const inst = factory()

    // 智能布局：根据添加顺序水平排列
    const count = instCountRef.current++
    const cols = 4
    const col = count % cols
    const row = Math.floor(count / cols)
    inst.x = -1.5 + col * 1.2
    inst.y = 0.8 - row * 1.2

    scene.addInstrument(inst)
    scene.rebuildOptics()
    scene.solve()
    setInstruments([...scene.instruments])
    setCircuitValid(scene.circuitEngine?.valid ?? false)
  }, [])

  // 快速搭建电路：电池+灯泡+电流表串联
  const handleQuickCircuit = useCallback(() => {
    const scene = sceneRef.current
    if (!scene) return

    // 清空现有仪器
    for (const inst of [...scene.instruments]) {
      scene.removeInstrument(inst.id)
    }
    instCountRef.current = 0

    // 创建仪器
    const battery = new Battery()
    battery.x = -1.5; battery.y = 0
    battery.setParam('emf', 3)

    const rheostat = new Rheostat()
    rheostat.x = 0; rheostat.y = 0
    rheostat.setParam('totalResistance', 20)

    const ammeter = new Ammeter()
    ammeter.x = 1.5; ammeter.y = 0

    const bulb = new Bulb()
    bulb.x = 1.5; bulb.y = 1.2
    bulb.setParam('resistance', 10)

    scene.addInstrument(battery)
    scene.addInstrument(rheostat)
    scene.addInstrument(ammeter)
    scene.addInstrument(bulb)

    // 自动连线：电池正极→电流表正极
    scene.completeWiring(battery, battery.getPort('pos'), ammeter, ammeter.getPort('pos'))
    // 电流表负极→滑变器左端
    scene.completeWiring(ammeter, ammeter.getPort('neg'), rheostat, rheostat.getPort('left'))
    // 滑变器滑片P→灯泡右端（P和左端之间是实际接入的电阻）
    scene.completeWiring(rheostat, rheostat.getPort('wiper'), bulb, bulb.getPort('right'))
    // 灯泡左端→电池负极
    scene.completeWiring(bulb, bulb.getPort('left'), battery, battery.getPort('neg'))

    instCountRef.current = 4
    scene.rebuildOptics()
    scene.solve()
    setInstruments([...scene.instruments])
    setCircuitValid(scene.circuitEngine?.valid ?? false)
  }, [])

  // quickCircuit自动执行
  useEffect(() => {
    if (quickCircuit && sceneRef.current && !preset) {
      handleQuickCircuit()
    }
  }, [quickCircuit, preset, handleQuickCircuit])

  // 删除选中
  const handleDelete = useCallback(() => {
    const scene = sceneRef.current
    if (!scene || !scene.selectedInstrument) return
    scene.removeInstrument(scene.selectedInstrument.id)
    setSelectedInst(null)
    setInstruments([...scene.instruments])
  }, [])

  // 键盘
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') handleDelete()
      if (e.key === 'Escape') {
        const interaction = interactionRef.current
        if (interaction.mode === 'wiring') {
          interaction.wiringFrom.port.active = false
          if (interaction.hoveredPort) interaction.hoveredPort.hovered = false
          interaction.mode = 'idle'
          interaction.wiringFrom = null
          interaction.wiringMousePos = null
          interaction.hoveredPort = null
          interaction.snapTarget = null
          setCursor('default')
        } else if (interaction.mode === 'sliderDrag' || interaction.mode === 'dragging') {
          interaction.mode = 'idle'
          interaction.dragTarget = null
          setCursor('default')
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleDelete])

  // 求解
  const handleSolve = useCallback(() => {
    const scene = sceneRef.current
    if (!scene) return
    scene.solve()
    scene.rebuildOptics()
    setInstruments([...scene.instruments])
  }, [])

  return (
    <div style={styles.container}>
      {/* 顶部工具栏 */}
      <div style={styles.toolbar}>
        <span style={styles.title}>{title}</span>
        <div style={styles.toolbarActions}>
          {interactionRef.current.mode === 'wiring' && (
            <span style={styles.wiringHint}>🔗 连线中 — 松手到端口完成连线 | ESC取消</span>
          )}
          <button style={styles.btn} onClick={handleQuickCircuit}>⚡ 快速搭建</button>
          <button style={styles.btn} onClick={handleSolve}>🔄 求解</button>
          <button
            style={{ ...styles.btn, background: formulaVisible ? '#1a7f37' : '#21262d' }}
            onClick={() => setFormulaVisible(!formulaVisible)}
          >
            📐 公式
          </button>
          <button style={styles.btn} onClick={() => setToolboxVisible(!toolboxVisible)}>
            {toolboxVisible ? '◀ 隐藏' : '▶ 工具箱'}
          </button>
        </div>
      </div>

      {/* 主体 */}
      <div style={styles.main}>
        <Toolbox onAddInstrument={handleAddInstrument} visible={toolboxVisible} category={category} />

        <div style={styles.benchWrapper}>
          <canvas
            ref={canvasRef}
            style={{
              ...styles.canvas,
              cursor: cursor,
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onDoubleClick={handleDoubleClick}
            onContextMenu={handleContextMenu}
          />

          {/* 公式叠加层 */}
          {formulaVisible && (
            <FormulaOverlay
              instruments={instruments}
              circuitValid={circuitValid}
            />
          )}

          {/* 状态栏 */}
          <div style={styles.statusBar}>
            <span>仪器: {instruments.filter(i => i.type !== 'wire').length}</span>
            <span>导线: {sceneRef.current?.wires.length ?? 0}</span>
            <span style={{ color: circuitValid ? '#4CAF50' : '#f44336' }}>
              {circuitValid ? '● 电路通路' : '○ 电路断路'}
            </span>
            <span style={{ color: '#484f58', marginLeft: 'auto' }}>
              💡 点击连接点拖出导线 | 双击开关 | 右键删除 | ⚡快速搭建一键连线
            </span>
          </div>
        </div>

        <DataPanel
          instruments={instruments}
          circuitValid={circuitValid}
          selectedInstrument={selectedInst}
        />
      </div>
    </div>
  )
}

// 加载预设
function loadPreset(scene, preset) {
  const instMap = new Map()
  for (const def of preset.instruments) {
    const factory = INSTRUMENT_FACTORIES[def.type]
    if (!factory) continue
    const inst = factory()
    inst.x = def.x ?? 0
    inst.y = def.y ?? 0
    if (def.params) {
      for (const [k, v] of Object.entries(def.params)) inst.setParam(k, v)
    }
    if (def.state) Object.assign(inst.state, def.state)
    scene.addInstrument(inst)
    instMap.set(def.id, inst)
  }

  if (preset.wires) {
    for (const w of preset.wires) {
      const fromInst = instMap.get(w.fromId)
      const toInst = instMap.get(w.toId)
      if (!fromInst || !toInst) continue
      const fromPort = fromInst.getPort(w.fromPort)
      const toPort = toInst.getPort(w.toPort)
      if (!fromPort || !toPort) continue
      const wire = new Wire(fromInst, w.fromPort, toInst, w.toPort)
      scene.wires.push(wire)
      fromPort.connectedTo.push({ instrumentId: toInst.id, portId: w.toPort })
      toPort.connectedTo.push({ instrumentId: fromInst.id, portId: w.fromPort })
    }
  }
  scene.solve()
}

const styles = {
  container: {
    display: 'flex', flexDirection: 'column', height: '100vh',
    background: '#0d1117', color: '#c9d1d9',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  toolbar: {
    height: 44, background: '#161b22', borderBottom: '1px solid #30363d',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 16px', flexShrink: 0,
  },
  title: { fontSize: 15, fontWeight: 600, color: '#c9d1d9' },
  toolbarActions: { display: 'flex', alignItems: 'center', gap: 12 },
  wiringHint: { fontSize: 12, color: '#4CAF50', fontWeight: 500 },
  btn: {
    padding: '4px 12px', background: '#21262d', color: '#c9d1d9',
    border: '1px solid #30363d', borderRadius: 4, fontSize: 12, cursor: 'pointer',
  },
  main: { flex: 1, display: 'flex', overflow: 'hidden' },
  benchWrapper: { flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' },
  canvas: { flex: 1, width: '100%' },
  statusBar: {
    height: 24, background: '#161b22', borderTop: '1px solid #30363d',
    display: 'flex', alignItems: 'center', gap: 20,
    padding: '0 14px', fontSize: 11, color: '#484f58', flexShrink: 0,
  },
}
