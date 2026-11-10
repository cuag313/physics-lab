/**
 * three-render.js — 3D 实验台渲染器（Vanilla Three.js + ESM，不依赖 React/R3F）
 *
 * 角色：把 ElectricSvgLabScene 的「中间 2D 画布」替换为可旋转的实体桌面实验台。
 * 数据源仍然是场景的 comps / wires / solved（core 求解器与场景 JSON 完全不动），
 * 本模块只做视图与交互：
 *
 *   labTableGroup（顶层 Group）
 *     ├── 桌面平板（网格纹理、接住阴影）
 *     ├── 器材（来自 svg-extrude-loader 的薄实体；原点=底面中心）
 *     └── 软导线（verlet-wire 的 Verlet 链，两端钉在接线柱）
 *
 * 交互（标志性）：
 *   · 拖动空白处 = 旋转整个实验台（阻尼惯性），滚轮 = 相机推拉
 *   · 拖动器材 = 台面网格吸附平移（锁定局部 Y，仅可绕 Y 自转）
 *   · 点接线柱连线（磁吸吸附，Verlet 软导线预览），保留 2D 的「点对点接线」语义
 *   · 双击电表表盘 = tween 相机拉近读数；点空白 / ESC = 回到默认视角
 *   · 透视（X-ray）= 外壳半透明 + 显示 inner 内部结构层
 *   · 选中器材 OutlinePass 高亮轮廓
 *
 * 渲染风格：教学课件风 —— 柔和定向光 + 软阴影，无 bloom/景深等游戏特效。
 */

import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { buildEquipment } from './svg-extrude-loader.js'
import { buildSolid, SOLID_TYPES } from './solidEquipment.js'
import { VerletWire } from './verlet-wire.js'
import { bulbTempColor } from '../scenes/electricSvgInstruments.js'

/* ── 尺度与手感常量 ─────────────────────────────────────────────── */
const SCALE = 0.01           // 2D 画布 px → 世界单位（1800px ≈ 18 单位）
const GRID_PX = 20           // 台面网格吸附步长（px）
const TERM_SNAP_PX = 52      // 接线柱磁吸半径（px）：电容屏/鼠标都好点，不靠"扎眼"
const TERM_DROP = 7          // 接线锚点相对柱帽下移（与 2D termAnchor 一致）
const ROT_YAW_K = 0.0062     // 拖动 → 转台角速度
const ROT_PITCH_K = 0.0042
const ROT_PITCH_MIN = 0.0    // 平视
const ROT_PITCH_MAX = 0.62   // 俯视（~35°）
const ROT_YAW_MAX = Math.PI / 4 // 左右各 45°
const INERTIA_DAMP = 0.925   // 惯性衰减
const CAM_ELEV = 0.40        // 相机俯仰（sin 分量）：俯角约 23°，正对立式表盘
const CAM_BACK = 0.83
const CAM_DIST0 = 6.6        // 默认视距：让器材占据视野主体，而不是一张空桌子
const CAM_DIST_MIN = 4.2
const CAM_DIST_MAX = 22
const NEEDLE_BASE_DEG = -52 // 与 needleSVG 一致：frac 0~1 → -52°~+52°
const NEEDLE_SPAN_DEG = 104

/**
 * 真实器材里这几件是「立式方表」：面板竖直朝前、机身有厚度地立在桌上。
 * 其余（电池/开关/滑变/电阻箱…）真实就是平放的，保持薄实体姿态。
 * 这些类型进出 buildEquipment 时要带 stand 标记，装配逻辑整条跟着变。
 */
const STAND_TYPES = new Set(['ammeter', 'voltmeter', 'energyMeter', 'electroscope'])
const isStandType = (type) => STAND_TYPES.has(type)

/**
 * 创建 3D 实验台。
 *
 * @param {HTMLElement} container 挂载容器（尺寸由容器决定）
 * @param {object} opt
 * @param {object} opt.TYPES            器材注册表（electricSvgInstruments.TYPES，只读）
 * @param {number} [opt.CW=1800]        2D 画布宽（px，坐标换算用）
 * @param {number} [opt.CH=1100]        2D 画布高
 * @param {number} [opt.bulbRated=1.8]  灯泡额定功率（亮度 100%）
 * @param {string} [opt.wireColor='#c0392b'] 新建导线默认色
 * @param {(id:number,x:number,y:number)=>void} [opt.onCompMove] 器材移动（2D 坐标）
 * @param {(id:number,rot:number)=>void} [opt.onCompRotate] 器材绕 Y 自转（弧度）
 * @param {(sel:{kind:'comp'|'wire',id:number}|null)=>void} [opt.onSelect] 选中变化
 * @param {(a:string,b:string)=>void} [opt.onWireConnect] 接线完成（'cid:tid' 键）
 * @param {(id:number)=>void} [opt.onWireDelete] 删除导线
 * @returns {object} 控制接口
 */
export function createLabRenderer(container, opt = {}) {
  const TYPES = opt.TYPES || {}
  const CW = opt.CW ?? 1800
  const CH = opt.CH ?? 1100
  const BULB_RATED = opt.bulbRated ?? 1.8
  const RHEO = opt.rheoTrack || { x0: 20, x1: 181 } // 滑变电阻丝轨道（器材局部 px）
  // 滑变当前接法（left-wire / right-wire / full-wire / short / open）：
  // 由场景按实际接线柱算出后回调，用于 3D 贴图上的「有效电阻丝高亮」
  const rheoModeOf = opt.rheoModeOf || (() => 'open')

  /* ── 基础：渲染器 / 场景 / 相机 ── */
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  container.appendChild(renderer.domElement)
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.touchAction = 'none'
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative'

  /* ── 转台把手：只有按住右下角这块圆形区域才旋转实验台 ──
     覆盖层直接挂在容器上（canvas 之上、其它 UI 之下），不依赖外部 CSS。 */
  const orbitPad = document.createElement('div')
  orbitPad.className = 'l3d-orbitpad'
  orbitPad.setAttribute('aria-label', '拖动旋转实验台')
  orbitPad.style.cssText = [
    'position:absolute', 'right:14px', 'bottom:14px', 'width:104px', 'height:104px',
    'border-radius:50%', 'display:flex', 'flex-direction:column', 'align-items:center',
    'justify-content:center', 'gap:1px', 'z-index:6', 'cursor:grab', 'touch-action:none',
    'user-select:none', 'color:#e0f2fe', 'font:600 11px/1.15 system-ui,-apple-system,sans-serif',
    'letter-spacing:2px', 'box-shadow:0 6px 18px rgba(15,23,42,.28)',
    'border:1.5px solid rgba(147,197,253,.55)',
    'background:radial-gradient(circle at 50% 38%,rgba(59,130,246,.30),rgba(15,23,42,.44))',
  ].join(';')
  const padIcon = document.createElement('span')
  padIcon.textContent = '⟲'
  padIcon.style.cssText = 'font-size:23px;line-height:1;opacity:.92'
  const padLabel = document.createElement('em')
  padLabel.textContent = '转台'
  padLabel.style.cssText = 'font-style:normal;opacity:.86'
  orbitPad.append(padIcon, padLabel)
  container.appendChild(orbitPad)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#e8eef6')

  /* ── 环境反射：没有 envMap 时金属会被渲染成死黑，实物感全丢 ── */
  try {
    const pmrem = new THREE.PMREMGenerator(renderer)
    const room = new RoomEnvironment()
    const envRT = pmrem.fromScene(room, 0.04)
    scene.environment = envRT.texture
    scene.environmentIntensity = 0.5
    pmrem.dispose()
    room.dispose?.()
  } catch (e) {
    console.warn('[lab3d] 环境贴图生成失败（材质会偏暗）：', e)
  }

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 220)
  const camTarget = new THREE.Vector3(0, 0.55, 0)
  let camDist = 0 // 0 → 首次 applyCamera 按视口宽高比自适应（见 fitDist）

  function applyCamera() {
    if (!camDist) camDist = fitDist()
    camera.position.set(
      camTarget.x,
      camTarget.y + camDist * CAM_ELEV,
      camTarget.z + camDist * CAM_BACK
    )
    camera.lookAt(camTarget)
  }
  applyCamera()

  /* ── 教学课件灯光：柔和定向光 + 软阴影 + 冷补光 ── */
  scene.add(new THREE.AmbientLight('#dde7f4', 0.68))
  const key = new THREE.DirectionalLight('#fff7ea', 1.55)
  key.position.set(7, 13, 9)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.camera.left = -13
  key.shadow.camera.right = 13
  key.shadow.camera.top = 11
  key.shadow.camera.bottom = -11
  key.shadow.camera.near = 1
  key.shadow.camera.far = 42
  key.shadow.bias = -0.0006
  key.shadow.radius = 4
  scene.add(key)
  const fill = new THREE.DirectionalLight('#cfe0ff', 0.55)
  fill.position.set(-9, 7, -8)
  scene.add(fill)

  /* ── 顶层 Group：桌面 + 器材 + 导线全挂这里（req 3） ── */
  const labTableGroup = new THREE.Group()
  scene.add(labTableGroup)

  // 桌面平板：顶面网格纹理（贴合 GRID_PX 吸附栅格），侧面素色
  const TABLE_W = (CW / GRID_PX) * GRID_PX * SCALE + 1.2 // ≈ 19.2
  const TABLE_H = (CH / GRID_PX) * GRID_PX * SCALE + 0.8
  const tableTop = new THREE.MeshStandardMaterial({
    map: makeGridTexture(CW / GRID_PX, CH / GRID_PX),
    roughness: 0.9,
    metalness: 0,
  })
  const tableSide = new THREE.MeshStandardMaterial({ color: '#123f28', roughness: 0.85 })
  const table = new THREE.Mesh(
    new THREE.BoxGeometry(TABLE_W, 0.55, TABLE_H),
    [tableSide, tableSide, tableTop, tableSide, tableSide, tableSide]
  )
  table.position.y = -0.275 // 顶面 = y0
  table.receiveShadow = true
  labTableGroup.add(table)

  /* ── 后处理：仅 OutlinePass（选中高亮），不做 bloom/景深 ── */
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const outline = new OutlinePass(new THREE.Vector2(1, 1), scene, camera)
  outline.edgeStrength = 3.4
  outline.edgeGlow = 0.22
  outline.edgeThickness = 1.35
  outline.pulsePeriod = 0
  outline.visibleEdgeColor.set('#2563eb')
  outline.hiddenEdgeColor.set('#93c5fd')
  composer.addPass(outline)
  composer.addPass(new OutputPass())

  /* ── 转台状态：拖动旋转 + 阻尼惯性 ── */
  const rot = { yaw: 0, pitch: 0.04, vYaw: 0, vPitch: 0 }
  function applyGroupRot() {
    labTableGroup.rotation.y = rot.yaw
    labTableGroup.rotation.x = rot.pitch
  }
  applyGroupRot()

  /* ── 相机 tween（双击表盘聚焦 / ESC 复位） ── */
  let tween = null
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
  function tweenCamera(toPos, toTarget, dur = 560) {
    tween = {
      t0: performance.now(),
      dur,
      fromPos: camera.position.clone(),
      fromTarget: camTarget.clone(),
      toPos: toPos.clone(),
      toTarget: toTarget.clone(),
    }
  }
  function stepTween(now) {
    if (!tween) return
    const t = Math.min(1, (now - tween.t0) / tween.dur)
    const e = easeInOut(t)
    camera.position.lerpVectors(tween.fromPos, tween.toPos, e)
    camTarget.lerpVectors(tween.fromTarget, tween.toTarget, e)
    camera.lookAt(camTarget)
    if (t >= 1) tween = null
  }
  /** 视口宽高比自适应视距：窄/竖视口必须拉远，否则器材一出屏就看不见 */
  function fitDist() {
    const w = container.clientWidth || 800
    const h = container.clientHeight || 600
    const aspect = w / h
    const d = aspect < 1.25 ? CAM_DIST0 * (1.3 + (1.25 - aspect) * 1.15) : CAM_DIST0
    return Math.min(CAM_DIST_MAX, Math.max(CAM_DIST_MIN, d))
  }
  function defaultCameraPose() {
    const dist = fitDist()
    return {
      pos: new THREE.Vector3(0, dist * CAM_ELEV, dist * CAM_BACK).add(
        new THREE.Vector3(camTarget.x, camTarget.y, camTarget.z)
      ),
      target: camTarget.clone(),
    }
  }
  function resetCamera() {
    const d = defaultCameraPose()
    tweenCamera(d.pos, d.target)
    camDist = fitDist()
  }

  /* ── 器材 / 导线仓储 ── */
  /** @type {Map<number, any>} compId → 器材条目 */
  const equips = new Map()
  /** @type {Map<number, any>} wireId → 导线条目 */
  const wires = new Map()

  /** 首次拿到器材时把镜头对准器材重心，否则开局对着空桌角（器材挤在视野边缘） */
  let camFramed = false
  function frameToComps(comps) {
    if (camFramed || !comps || !comps.length) return
    let sx = 0
    let sz = 0
    for (const c of comps) {
      const p = compToLocal(c)
      sx += p.x
      sz += p.z
    }
    camTarget.set(sx / comps.length, 0.55, sz / comps.length)
    camFramed = true
    applyCamera()
  }
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const tmpV = new THREE.Vector3()
  const tmpV2 = new THREE.Vector3()
  const gravity = new THREE.Vector3(0, -2.9, 0) // 世界重力（组内换算后使用）
  const localGravity = new THREE.Vector3()

  /** 器材条目结构 */
  function makeEntry(comp) {
    return {
      id: comp.id,
      type: comp.type,
      key: '',
      buildToken: 0,
      build: null,     // buildEquipment 结果
      group: null,     // 已挂入 labTableGroup 的组
      hotspots: new Map(), // tid → Object3D（接线柱磁吸/锚点）
    }
  }

  /** 2D 坐标（盒左上角）→ 组内世界坐标（底面中心） */
  function compToLocal(c) {
    const t = TYPES[c.type]
    const w = t ? t.w : 80
    const h = t ? t.h : 60
    return tmpV.set((c.x + w / 2 - CW / 2) * SCALE, 0, (c.y + h / 2 - CH / 2) * SCALE)
  }
  function localToCompXY(type, local) {
    const t = TYPES[type]
    const w = t ? t.w : 80
    const h = t ? t.h : 60
    return {
      x: local.x / SCALE + CW / 2 - w / 2,
      y: local.z / SCALE + CH / 2 - h / 2,
    }
  }

  /** 形状指纹：不含滑片阻值。变了才需要重新光栅化 + 挤出几何 */
  function shapeKeyOf(c) {
    return [
      c.type,
      c.closed ? 1 : 0,
      c.pos ?? 0,
      c.blown ? 1 : 0,
      c.mode || '-',
      Array.isArray(c.dials) ? c.dials.join('') : '-',
    ].join('|')
  }

  /** 状态指纹（形状 + 滑片位置）：决定是否需要重建器材贴图 */
  function stateKeyOf(c) {
    return shapeKeyOf(c) + '|' + Math.round((c.f ?? 0.4) * 50)
  }

  /** 完整重建指纹：滑变额外带上「接法」，接法变了才需要换高亮段 */
  const keyOf = (c) => stateKeyOf(c) + (c.type === 'rheostat' ? '|' + rheoModeOf(c.id) : '')

  /** 传给器材 render() 的动态量：目前只有滑变的接法模式 */
  const dynOf = (c) => (c.type === 'rheostat' ? { mode: rheoModeOf(c.id) } : {})

  /**
   * 滑片拖动限速：f 每变 2% 就重建一次（光栅化 + 挤出 + 换贴图）会卡顿闪烁，
   * 故对「形状没变、只有 f 变」的滑变重建限流，并在停止拖动后补一次最终值。
   */
  const F_THROTTLE_MS = 120
  const trailTimers = new Map() // compId → trailing timer
  let latestComps = []

  function scheduleTrail(id) {
    const prev = trailTimers.get(id)
    if (prev) clearTimeout(prev)
    const timer = setTimeout(() => {
      trailTimers.delete(id)
      const entry = equips.get(id)
      const c = latestComps.find((x) => x.id === id)
      if (!entry || !c) return
      if (entry.key !== keyOf(c)) rebuildComp(c)
    }, F_THROTTLE_MS)
    trailTimers.set(id, timer)
  }

  /** 装配接线柱磁吸热区（透明小球，射线拾取用） */
  function attachHotspots(entry) {
    const t = TYPES[entry.type]
    if (!t || !t.terminals) return
    const size = entry.build ? entry.build.size : { w: 1, h: 1 }
    const th = entry.build ? entry.build.thickness : 0.1
    const stand = !!(entry.build && entry.build.stand)
    for (const tm of t.terminals) {
      // 命中球直径按"柱本身的粗细"给（不再用磁吸半径），
      // 否则电流表三柱间距只有 0.35 世界单位，0.26 半径的球会互相盖住，
      // 点中间柱命中左柱 —— 这是"连线不灵"的直接原因
      const g = new THREE.SphereGeometry(0.085, 8, 6)
      // colorWrite:false —— 只参与射线检测，永不画像素；
      // keepOpacity 防止透视开关把它复位成可见白球
      const m = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        colorWrite: false,
      })
      m.userData.keepOpacity = true
      const s = new THREE.Mesh(g, m)
      if (stand) {
        // 立式：端子长在竖直面板上，高度按 SVG 的 y 换算；
        // z 落在面板表面之外，否则射线先打到面板，接线柱根本点不到。
        // 实体表盘的朝向由 build 决定（postZ），与旧挤出立式（朝 -Z）区分开。
        const pz = entry.build && entry.build.postZ != null ? entry.build.postZ : -(th + 0.03)
        s.position.set(
          (tm.x - t.w / 2) * SCALE,
          (t.h - (tm.y + TERM_DROP)) * SCALE,
          pz + 0.06 // 柱身向后伸 0.16，命中球放在柱中段
        )
      } else {
        s.position.set(
          (tm.x - t.w / 2) * SCALE,
          th + 0.03 + 0.06, // 柱身净高 0.16，命中球放在柱中段
          (tm.y + TERM_DROP - t.h / 2) * SCALE
        )
      }
      s.userData.role = 'terminal'
      s.userData.compId = entry.id
      s.userData.tid = tm.id
      entry.group.add(s)
      entry.hotspots.set(tm.id, s)
    }
  }

  /** 新建/重建材材（异步：SVG 光栅化 + 挤出） */
  async function rebuildComp(c) {
    const entry = equips.get(c.id) || makeEntry(c)
    equips.set(c.id, entry)
    const key = keyOf(c)
    if (entry.key === key && entry.build) return entry
    entry.key = key
    entry.shapeKey = shapeKeyOf(c)
    entry.lastBuildAt = performance.now()
    const token = ++entry.buildToken

    const t = TYPES[c.type]
    if (!t || !t.render) return entry
    let svgString
    try {
      svgString = t.render(c, dynOf(c)) // 中性动态（表针另行用 3D 指针驱动）
    } catch (e) {
      console.warn('[lab3d] render() 失败：', c.type, e)
      return entry
    }

    let build
    if (SOLID_TYPES.has(c.type)) {
      // 核心器材走实体建模（盒/柱/球/环），不再是 SVG 剪影挤出
      try {
        build = buildSolid(c.type, {
          w: t.w,
          h: t.h,
          terminals: t.terminals,
          fs: c.type === 'ammeter' ? 3 : c.type === 'voltmeter' ? 15 : 0,
        })
        if (!build) return entry
      } catch (e) {
        console.warn('[lab3d] buildSolid 失败：', c.type, e)
        return entry
      }
    } else {
      try {
        build = await buildEquipment({
          svgString,
          width: t.w,
          height: t.h,
          scale: SCALE,
          stand: isStandType(c.type),
        })
      } catch (e) {
        console.warn('[lab3d] buildEquipment 失败：', c.type, e)
        return entry
      }
    }
    if (entry.buildToken !== token) {
      // 已有更新的构建在途，丢弃本次
      build.dispose()
      return entry
    }

    // 换装：卸旧挂新
    if (entry.group) {
      labTableGroup.remove(entry.group)
      disposeGroup(entry.group)
    }
    entry.build = build
    entry.group = build.group
    entry.group.userData.compId = c.id
    entry.group.userData.role = 'comp'
    entry.hotspots.clear()
    attachHotspots(entry)
    labTableGroup.add(entry.group)

    // 位置/自转/透视/选中立即对齐
    entry.group.position.copy(compToLocal(c))
    entry.group.rotation.y = c.rot || 0
    applyXrayTo(entry, xrayOnFor(entry))
    if (selected && selected.kind === 'comp' && selected.id === c.id) {
      outline.selectedObjects = [entry.group]
    }
    return entry
  }

  function disposeGroup(group) {
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose()
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
      for (const m of mats) {
        if (m.map) m.map.dispose()
        if (m.emissiveMap) m.emissiveMap.dispose()
        m.dispose()
      }
    })
  }

  /* ── 透视（X-ray） ── */
  let xrayOn = false
  // 新建导线的默认颜色：由场景的"导线颜色"按钮实时改写（不再固定）
  let defaultWireColor = opt.wireColor || '#c0392b'
  function setWireColor(hex) {
    if (hex) defaultWireColor = hex
  }
  function applyXrayTo(entry, on) {
    if (!entry.build) return
    // 实体模型本来就没有 outer 外壳网格：改为只把 build.shell（真正的壳件）
    // 变半透明，内部零件从一开始就摆在壳里，透出来就是"剖视"。
    // 绝不能整组遍历——表盘贴图会被反复重编译洗成灰板。
    if (!entry.build.outer) {
      if (entry.build.shell) {
        for (const m of entry.build.shell) {
          const mat = m.material
          if (!mat || mat.userData.keepOpacity) continue
          mat.transparent = on
          mat.opacity = on ? 0.16 : 1
          mat.depthWrite = !on
          mat.needsUpdate = true
        }
      }
      // 表盘/玻璃挡在动圈前面：剖视时直接隐藏（不碰它们的材质，免得贴图被洗白）
      if (entry.build.panel) {
        for (const m of entry.build.panel) m.visible = !on
      }
      return
    }
    const mats = Array.isArray(entry.build.outer.material)
      ? entry.build.outer.material
      : [entry.build.outer.material]
    for (const m of mats) {
      m.transparent = true
      m.opacity = on ? 0.2 : 1
      m.alphaTest = on ? 0 : 0.1
      m.depthWrite = !on
    }
    if (entry.build.inner) entry.build.inner.visible = on
  }
  function setXray(on) {
    xrayOn = !!on
    xrayIds.clear()
    for (const e of equips.values()) applyXrayTo(e, xrayOn)
  }
  /** 单件拆壳：双击某件器材单独剖开它（对标"点击拆开模型"），与全局开关互不干扰 */
  const xrayIds = new Set()
  function xrayOnFor(entry) {
    return xrayOn || xrayIds.has(entry.id)
  }
  function toggleXrayComp(id) {
    if (xrayIds.has(id)) xrayIds.delete(id)
    else xrayIds.add(id)
    const en = equips.get(id)
    if (en) applyXrayTo(en, xrayOnFor(en))
  }

  /* ── 选中（OutlinePass） ── */
  let selected = null
  function setSelection(sel) {
    selected = sel || null
    outline.selectedObjects = []
    if (selected && selected.kind === 'comp') {
      const e = equips.get(selected.id)
      if (e && e.group) outline.selectedObjects = [e.group]
    }
  }

  /* ── 导线：Verlet 软导线（端点钉在接线柱） ── */
  function findEquip(cid) {
    let e = equips.get(cid) || equips.get(+cid)
    if (!e) {
      // id 类型/前缀不一致时按字符串逐项比对（导线里的 id 与 comps 的 id 可能不同型）
      for (const v of equips.values()) {
        if (String(v.id) === String(cid)) {
          e = v
          break
        }
      }
    }
    return e || null
  }

  function terminalWorldPos(cid, tid) {
    const e = findEquip(cid)
    if (!e || !e.group) return null
    const hs = e.hotspots.get(tid)
    if (!hs) return null
    hs.getWorldPosition(tmpV2)
    labTableGroup.worldToLocal(tmpV2)
    return tmpV2.clone()
  }

  function wireColorFor(w, solved) {
    const base = new THREE.Color(w.color || defaultWireColor)
    const I = Math.abs((solved && solved._wireI && solved._wireI[w.id]) || 0)
    if (I > 0.02) base.lerp(new THREE.Color('#f59e0b'), Math.min(0.62, I * 0.32))
    return base
  }

  /* ── 同步场景状态（React 每次变更时调用） ── */
  /** 拖拽中的器材不同步回写（避免与交互打架） */
  function isCompActive(id) {
    return draggingRef.compId === id || (pointerDownInfo && pointerDownInfo.compId === id)
  }
  function sync(state) {
    try {
      return syncInner(state)
    } catch (e) {
      // 单件器材/单根导线出问题不应该拖垮整个页面：
      // 记下错误并跳过这一帧，下一次 sync 会重试
      console.warn('[lab3d] sync 失败：', e)
      if (typeof document !== 'undefined' && document.body) {
        document.body.dataset.l3derr = String((e && e.stack) || e).slice(0, 500)
      }
      return undefined
    }
  }

  function syncInner(state) {
    const { comps = [], wires: wireList = [], solved = {} } = state || {}
    latestComps = comps
    frameToComps(comps)

    // 1) 器材：增删改
    const alive = new Set()
    for (const c of comps) {
      alive.add(c.id)
      const entry = equips.get(c.id)
      if (entry) entry.f = c.f ?? 0.4
      if (!entry || entry.key !== keyOf(c)) {
        // 滑片拖动：形状不变、只有 f 变 → 限速重建，停止后补最终值
        if (entry && entry.build && c.type === 'rheostat' && entry.shapeKey === shapeKeyOf(c)) {
          const now = performance.now()
          if (now - (entry.lastBuildAt || 0) < F_THROTTLE_MS) {
            scheduleTrail(c.id)
            continue
          }
        }
        rebuildComp(c).catch((e) => {
          console.warn('[lab3d] rebuild 失败：', c.type, e)
          if (typeof document !== 'undefined' && document.body) {
            document.body.dataset.l3derr = String((e && e.stack) || e).slice(0, 500)
          }
        }) // 异步，完成时自挂载
      } else if (entry.group && !isCompActive(c.id)) {
        entry.group.position.copy(compToLocal(c))
        entry.group.rotation.y = c.rot || 0
      }
    }
    for (const [id, entry] of equips) {
      if (!alive.has(id)) {
        const tt = trailTimers.get(id)
        if (tt) {
          clearTimeout(tt)
          trailTimers.delete(id)
        }
        if (entry.group) {
          labTableGroup.remove(entry.group)
          disposeGroup(entry.group)
        }
        equips.delete(id)
      }
    }

    // 2) 指针角度 / 灯泡亮度（求解输出驱动）
    for (const c of comps) {
      const entry = equips.get(c.id)
      if (!entry || !entry.build) continue
      const o = solved[c.id] || {}
      if (entry.build.pointer) {
        const isA = c.type === 'ammeter'
        const fs = o._fs ?? (isA ? 0.6 : 3)
        const raw = isA ? (o._I || 0) : (o._V || 0)
        let frac = Math.max(0, Math.min(1, Math.abs(raw) / (fs || 1)))
        if (o._over) frac = 1.06 // 超量程：指针顶到限位（左右都顶）
        let deg = NEEDLE_BASE_DEG + frac * NEEDLE_SPAN_DEG
        if (o._rev || raw < 0) deg = -deg // 接反：指针反向偏转
        // 针沿 +Y 起算。表盘朝 +Z（相机在 +Z 侧看），绕 Z 正向转是往 -X（左），
        // 所以 rotation.z = -deg：零位 deg=-52 → +52° → 针指左侧；满偏 → 指右侧。
        if (entry.build.stand) entry.build.pointer.rotation.z = -(deg * Math.PI) / 180
        else entry.build.pointer.rotation.y = -(deg * Math.PI) / 180
      }
      if (c.type === 'bulb') {
        const bright = (o._P || 0) > 0 ? Math.min(1, o._P / BULB_RATED) : 0
        // 灯丝色温与 2D 共用同一份色表：暗红 → 橙红 → 亮黄 → 刺白
        const { core, halo } = bulbTempColor(bright)
        const target = entry.build.bulbMat || null
        if (target) {
          target.emissive.setRGB(core[0] / 255, core[1] / 255, core[2] / 255)
          target.emissiveIntensity = bright * 2.4
        }
        if (entry.build.glassMat) {
          // 玻璃泡随亮度被灯丝"照透"：暗时清透，亮时暖白
          entry.build.glassMat.emissive.setRGB(halo[0] / 255, halo[1] / 255, halo[2] / 255)
          entry.build.glassMat.emissiveIntensity = bright * 0.9
          entry.build.glassMat.opacity = 0.32 + bright * 0.42
        }
        if (!target && entry.build.outer) {
          const mats = Array.isArray(entry.build.outer.material)
            ? entry.build.outer.material
            : [entry.build.outer.material]
          for (const m of mats) {
            if (!m.emissiveMap && m.map) m.emissiveMap = m.map
            m.emissive = m.emissive || new THREE.Color(0, 0, 0)
            m.emissive.setRGB(core[0] / 255, core[1] / 255, core[2] / 255)
            m.emissiveIntensity = bright * 1.4
          }
        }
      }
      // 刀片开合：绕铰链（Z 轴）抬起，合上归零
      if (c.type === 'switch' && entry.build.blade) {
        entry.build.blade.rotation.z = c.closed ? 0 : 0.55
      }
      // 滑片位置：跟随 f，落在瓷管有效段上
      if (c.type === 'rheostat' && entry.build.slider) {
        const f = typeof c.f === 'number' ? c.f : 0.4
        entry.build.slider.position.x = (f - 0.5) * 1.18
      }
    }

    // 3) 导线：增删改
    const aliveW = new Set()
    for (const w of wireList) {
      aliveW.add(w.id)
      let rec = wires.get(w.id)
      if (!rec) {
        const vw = new VerletWire({ color: w.color || defaultWireColor })
        vw.mesh.userData.wireId = w.id
        labTableGroup.add(vw.mesh)
        rec = { id: w.id, wire: vw, a: w.a, b: w.b, seeded: false }
        wires.set(w.id, rec)
      }
      rec.a = w.a
      rec.b = w.b
      rec.wire.setColor(wireColorFor(w, solved))
    }
    for (const [id, rec] of wires) {
      if (!aliveW.has(id)) {
        labTableGroup.remove(rec.wire.mesh)
        rec.wire.dispose()
        wires.delete(id)
      }
    }
  }

  /** 每帧：钉导线端点 + Verlet 松弛 */
  function stepWires(dt) {
    // 重力换算到 labTableGroup 局部（转台倾斜时导线仍向世界下方下垂）
    localGravity.copy(gravity).applyQuaternion(labTableGroup.quaternion.clone().invert())
    for (const rec of wires.values()) {
      const [ca, ta] = rec.a.split(':')
      const [cb, tb] = rec.b.split(':')
      // 端子热区没建出来时（如光栅化失败/该类型缺 terminals）兜底到器材本身，
      // 否则 pa/pb 为 null 会 continue——导线既不 pin 也不 simulate，
      // 几何停在初始全零坐标，视觉上就是"一条线都没有"。
      let pa = terminalWorldPos(ca, ta)
      let pb = terminalWorldPos(cb, tb)
      if (!pa) {
        const e = findEquip(ca)
        if (e && e.group) {
          pa = e.group.position.clone()
          pa.y += 0.18
        }
      }
      if (!pb) {
        const e = findEquip(cb)
        if (e && e.group) {
          pb = e.group.position.clone()
          pb.y += 0.18
        }
      }
      if (!pa || !pb) continue
      rec.wire.pin(pa, pb)
      if (!rec.seeded) {
        rec.wire.reseed()
        rec.seeded = true
      }
      rec.wire.simulate(localGravity, dt)
    }
    // 预览线（接线中）
    if (pending && pending.wire) {      const pa = terminalWorldPos(pending.cid, pending.tid)
      if (pa) {
        pending.wire.pin(pa, pending.cursor)
        if (!pending.seeded) {
          pending.wire.reseed()
          pending.seeded = true
        }
        pending.wire.simulate(localGravity, dt)
      }
    }
  }

  /* ── 指针交互 ── */
  let pending = null    // 接线中 {cid, tid, wire, cursor, seeded, snap}
  let pointerDownInfo = null

  function setRay(e) {
    const rect = renderer.domElement.getBoundingClientRect()
    ndc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    )
    raycaster.setFromCamera(ndc, camera)
  }

  /** 射线打到桌面（组内局部坐标） */
  function rayTable(e) {
    setRay(e)
    const hits = raycaster.intersectObject(table, false)
    if (!hits.length) return null
    return labTableGroup.worldToLocal(hits[0].point.clone())
  }

  /** 拾取器材 / 接线柱 / 导线 */
  function pick(e) {
    setRay(e)
    // 接线柱优先（磁吸）
    const hotspots = []
    for (const en of equips.values()) for (const s of en.hotspots.values()) hotspots.push(s)
    const hitT = raycaster.intersectObjects(hotspots, false)
    if (hitT.length) {
      return {
        kind: 'terminal',
        compId: hitT[0].object.userData.compId,
        tid: hitT[0].object.userData.tid,
        point: hitT[0].point,
      }
    }
    const compMeshes = []
    for (const en of equips.values()) {
      if (!en.build) continue
      // 实体模型没有 outer 网格 → 整组参与射线检测（递归子网格）
      compMeshes.push(en.build.outer || en.group)
    }
    const hitC = raycaster.intersectObjects(compMeshes, true)
    if (hitC.length) {
      let o = hitC[0].object
      while (o && !o.userData.compId) o = o.parent
      if (o && o.userData.compId != null) {
        return { kind: 'comp', compId: o.userData.compId, point: hitC[0].point }
      }
    }
    const wireMeshes = []
    for (const rec of wires.values()) wireMeshes.push(rec.wire.mesh)
    const hitW = raycaster.intersectObjects(wireMeshes, false)
    if (hitW.length) {
      return { kind: 'wire', wireId: hitW[0].object.userData.wireId, point: hitW[0].point }
    }
    return null
  }

  /** 接线柱磁吸：找距光标最近且在半径内的柱 */
  function snapTerminal(e, maxPx = TERM_SNAP_PX) {
    const p = rayTable(e)
    if (!p) return null
    let best = null
    let bestD = (maxPx * SCALE) ** 2
    for (const en of equips.values()) {
      for (const [tid, s] of en.hotspots) {
        s.getWorldPosition(tmpV2)
        labTableGroup.worldToLocal(tmpV2)
        const d = (tmpV2.x - p.x) ** 2 + (tmpV2.z - p.z) ** 2
        if (d < bestD) {
          bestD = d
          best = { compId: en.id, tid, pos: tmpV2.clone() }
        }
      }
    }
    return best
  }

  function onDown(e) {
    if (e.button !== 0 && e.button !== 2) return
    renderer.domElement.setPointerCapture?.(e.pointerId)
    tween = null // 用户接管相机
    const hit = pick(e)

    // 接线中：命中柱 → 完成接线；没直接命中就退到"地面最近柱"软吸附
    if (pending) {
      let target = hit && hit.kind === 'terminal' ? hit : null
      if (!target) {
        const snap = snapTerminal(e)
        if (snap) target = { kind: 'terminal', compId: snap.compId, tid: snap.tid }
      }
      if (target) {
        const a = pending.cid + ':' + pending.tid
        const b = target.compId + ':' + target.tid
        if (a !== b) opt.onWireConnect && opt.onWireConnect(a, b)
      }
      cancelPending()
      return
    }

    if (hit && hit.kind === 'terminal') {
      // 起线
      const wire = new VerletWire({ color: defaultWireColor, count: 14 })
      labTableGroup.add(wire.mesh)
      pending = {
        cid: hit.compId,
        tid: hit.tid,
        wire,
        cursor: hit.point.clone(),
        seeded: false,
      }
      pointerDownInfo = null
      return
    }

    // 没直接戳中柱本体，但光标就压在柱边上（20px 内）→ 也算起线，
    // 免得用户"明明点在柱上却没反应"
    if (!hit || hit.kind === 'comp') {
      const near = snapTerminal(e, 20)
      if (near) {
        const wire = new VerletWire({ color: defaultWireColor, count: 14 })
        labTableGroup.add(wire.mesh)
        pending = {
          cid: near.compId,
          tid: near.tid,
          wire,
          cursor: near.pos.clone(),
          seeded: false,
        }
        pointerDownInfo = null
        return
      }
    }

    if (hit && hit.kind === 'wire') {
      opt.onSelect && opt.onSelect({ kind: 'wire', id: hit.wireId })
      pointerDownInfo = { x: e.clientX, y: e.clientY, mode: 'select-wire' }
      return
    }

    if (hit && hit.kind === 'comp') {
      opt.onSelect && opt.onSelect({ kind: 'comp', id: hit.compId })
      const local = rayTable(e)
      const en = equips.get(hit.compId)
      const ty = en ? en.type : ''
      const t = TYPES[ty] || null

      // 滑变：按在滑块附近 → 拖滑片；按在别处 → 仍是拖器材
      let slide = false
      if (en && en.group && ty === 'rheostat') {
        const pl = en.group.worldToLocal(hit.point.clone())
        const px = pl.x / SCALE + (t ? t.w / 2 : 100)
        const py = pl.z / SCALE + (t ? t.h / 2 : 60)
        const fNow = en.f ?? 0.4
        const knobX = RHEO.x0 + fNow * (RHEO.x1 - RHEO.x0)
        slide = Math.abs(px - knobX) < 26 && py < (t ? t.h : 120) * 0.62
      }

      // 开关：轻点即通断（按住拖动仍可挪位）
      const isSwitch = ty === 'switch' || ty === 'switch2'

      let mode = e.shiftKey ? 'rot-comp' : 'move'
      if (!e.shiftKey && slide) mode = 'slide'
      else if (!e.shiftKey && isSwitch) mode = 'tap'

      pointerDownInfo = {
        x: e.clientX,
        y: e.clientY,
        mode,
        compId: hit.compId,
        // 抓取偏移：光标点相对器材底面中心（拖动时器材不跳到光标下）
        grabX: local && en ? local.x - en.group.position.x : 0,
        grabZ: local && en ? local.z - en.group.position.z : 0,
        rot0: en ? en.group.rotation.y : 0,
        moved: 0,
      }
      return
    }

    // 空白处：只取消选中。转台旋转改用右下角专用把手（见 orbitPad），
    // 免得在桌面上随手一拖就把整个实验台甩出去。
    pointerDownInfo = null
    opt.onSelect && opt.onSelect(null)
  }

  function onMove(e) {
    // 接线预览：端点跟随光标（磁吸）
    if (pending) {
      const snap = snapTerminal(e)
      if (snap) {
        pending.cursor.copy(snap.pos)
        pending.snap = snap
      } else {
        const p = rayTable(e)
        if (p) {
          pending.cursor.copy(p)
          pending.cursor.y = 0.28
          pending.snap = null
        }
      }
      return
    }
    const info = pointerDownInfo
    if (!info) return
    const dx = e.clientX - info.x
    const dy = e.clientY - info.y

    if (info.mode === 'tap') {
      info.moved = Math.max(info.moved, Math.abs(dx) + Math.abs(dy))
      return
    }
    if (info.mode === 'slide') {
      const en = equips.get(info.compId)
      if (!en || !en.group) return
      const p = rayTable(e)
      if (!p) return
      const world = labTableGroup.localToWorld(p.clone())
      const pl = en.group.worldToLocal(world)
      const t = TYPES[en.type]
      const px = pl.x / SCALE + (t ? t.w / 2 : 100)
      const f = Math.max(0, Math.min(1, (px - RHEO.x0) / (RHEO.x1 - RHEO.x0)))
      en.f = f
      info.moved = Math.max(info.moved, Math.abs(dx) + Math.abs(dy))
      opt.onSlider && opt.onSlider(en.id, f)
      return
    }

    if (info.mode === 'rotate') {
      rot.yaw = Math.max(-ROT_YAW_MAX, Math.min(ROT_YAW_MAX, info.yaw0 + dx * ROT_YAW_K))
      rot.pitch = Math.max(ROT_PITCH_MIN, Math.min(ROT_PITCH_MAX, info.pitch0 + dy * ROT_PITCH_K))
      rot.vYaw = dx * ROT_YAW_K * 0.35 // 惯性种子（按当前速度）
      rot.vPitch = dy * ROT_PITCH_K * 0.25
      applyGroupRot()
      info.moved = Math.max(info.moved, Math.abs(dx) + Math.abs(dy))
      return
    }
    if (info.mode === 'move') {
      const p = rayTable(e)
      if (!p) return
      const en = equips.get(info.compId)
      if (!en || !en.group) return
      // 目标位置 = 光标 − 抓取偏移，再按台面栅格吸附（req 10）
      const cell = GRID_PX * SCALE
      const wantX = p.x - info.grabX
      const wantZ = p.z - info.grabZ
      en.group.position.x = Math.round(wantX / cell) * cell
      en.group.position.z = Math.round(wantZ / cell) * cell
      en.group.position.y = 0 // 锁定局部 Y：不浮空、不倾倒
      draggingRef.compId = en.id
      info.moved = Math.max(info.moved, Math.abs(dx) + Math.abs(dy))
      return
    }
    if (info.mode === 'rot-comp') {
      const en = equips.get(info.compId)
      if (!en || !en.group) return
      // 仅绕竖直 Y 自转（req 4）
      en.group.rotation.y = info.rot0 + dx * 0.009
      draggingRef.compId = en.id
      draggingRef.rotComp = true
      info.moved = Math.max(info.moved, Math.abs(dx) + Math.abs(dy))
      return
    }
  }

  /** 上次 pointerup 命中的器材，用于双击自检 */
  let tapRef = { id: null, t: 0 }

  function onUp(e) {
    const info = pointerDownInfo
    pointerDownInfo = null
    orbitPad.style.cursor = 'grab'
    if (draggingRef.compId != null) {
      const en = equips.get(draggingRef.compId)
      if (en && en.group) {
        const xy = localToCompXY(en.type, en.group.position)
        opt.onCompMove && opt.onCompMove(en.id, xy.x, xy.y)
        if (draggingRef.rotComp) opt.onCompRotate && opt.onCompRotate(en.id, en.group.rotation.y)
      }
      draggingRef.compId = null
      draggingRef.rotComp = false
    }
    if (!info) return
    // 双击自检：同一件器材 420ms 内连点两次即视为双击（不依赖浏览器 dblclick）
    if ((info.moved || 0) < 6 && info.compId != null) {
      const now = performance.now()
      if (tapRef.id === info.compId && now - tapRef.t < 420) {
        tapRef = { id: null, t: 0 }
        handleDoubleComp(info.compId, e.clientX, e.clientY)
        return
      }
      tapRef = { id: info.compId, t: now }
    }
    if (info.mode === 'rotate') {
      // 点击空白（几乎无位移）→ 相机复位（req 7）
      if ((info.moved || 0) < 6) resetCamera()
      return
    }
    if (info.mode === 'tap') {
      // 轻点开关 → 通断翻转（位移超过阈值则视为挪位，不切换）
      if ((info.moved || 0) < 6) opt.onSwitch && opt.onSwitch(info.compId)
      return
    }
    if (info.mode === 'slide') {
      // 滑片拖动收尾：解除限速并确认最终位置，保证松手后立即渲染到位
      const en = equips.get(info.compId)
      if (en) {
        en.lastBuildAt = 0
        opt.onSlider && opt.onSlider(en.id, en.f ?? 0.4)
      }
      return
    }
    if (info.mode === 'move' || info.mode === 'rot-comp') {
      // 点击器材：仅选中（已处理）
    }
  }

  function onDblClick(e) {
    const hit = pick(e)
    if (!hit || hit.kind !== 'comp') return
    handleDoubleComp(hit.compId, e.clientX, e.clientY)
  }

  /**
   * 双击某件器材的统一入口。
   * 浏览器 dblclick 常被两次单击吞掉（pointerup 已处理过一次点击），
   * 所以 onUp 里也会用时间窗自检双击，两条路径都汇到这里，由 dblGuard 去重。
   */
  let dblGuard = { id: null, t: 0 }
  function handleDoubleComp(compId, clientX, clientY) {
    const now = performance.now()
    if (dblGuard.id === compId && now - dblGuard.t < 600) return
    dblGuard = { id: compId, t: now }

    const en = equips.get(compId)
    if (!en || !en.build) return
    const ty = TYPES[en.type]
    // 双击电表 → 读数浮层（把光标位置一并带出去，气泡贴在被双击的那只表附近）
    if (ty && ty.meter) {
      const rect = el.getBoundingClientRect()
      opt.onMeterRead &&
        opt.onMeterRead(en.id, {
          x: (clientX - rect.left) / Math.max(1, rect.width),
          y: (clientY - rect.top) / Math.max(1, rect.height),
        })
    } else {
      // 双击其它器材 → 拆开这件模型看内部结构（对标"点击拆开模型"）
      toggleXrayComp(en.id)
      opt.onDissectComp && opt.onDissectComp(en.id)
      return
    }
    // 目标：表针枢轴（无表针则取器材中心顶面）
    const t = TYPES[en.type]
    let target = new THREE.Vector3()
    if (en.build.needle) {
      target.set(
        (en.build.needle.x - t.w / 2) * SCALE,
        en.build.thickness,
        (en.build.needle.y - t.h / 2) * SCALE
      )
    }
    en.group.localToWorld(target)
    // 俯角贴近表盘：沿转台朝向的前上方拉近
    const off = new THREE.Vector3(0.35, 2.35, 2.05).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot.yaw)
    tweenCamera(target.clone().add(off), target, 620)
  }

  function onWheel(e) {
    e.preventDefault()
    tween = null
    camDist = Math.max(CAM_DIST_MIN, Math.min(CAM_DIST_MAX, camDist * Math.exp(e.deltaY * 0.00115)))
    applyCamera()
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      if (pending) cancelPending()
      resetCamera()
    }
  }

  function cancelPending() {
    if (pending && pending.wire) {
      labTableGroup.remove(pending.wire.mesh)
      pending.wire.dispose()
    }
    pending = null
  }

  /* ── 拖拽跟踪（同步回写用） ── */
  const draggingRef = { compId: null, rotComp: false }

  /* ── 事件绑定 ── */
  const el = renderer.domElement
  el.addEventListener('pointerdown', onDown)
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  el.addEventListener('dblclick', onDblClick)
  el.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('keydown', onKey)

  /* 把手上的按下 → 进入 rotate 模式；移动/抬起仍走上面的 window 监听 */
  function onPadDown(e) {
    e.preventDefault()
    e.stopPropagation()
    tween = null
    pointerDownInfo = {
      x: e.clientX,
      y: e.clientY,
      mode: 'rotate',
      yaw0: rot.yaw,
      pitch0: rot.pitch,
      moved: 0,
    }
    orbitPad.style.cursor = 'grabbing'
    opt.onSelect && opt.onSelect(null)
  }
  orbitPad.addEventListener('pointerdown', onPadDown)

  /* ── 尺寸自适应 ── */
  function resize() {
    const w = container.clientWidth || 1
    const h = container.clientHeight || 1
    renderer.setSize(w, h, false)
    composer.setSize(w, h)
    outline.resolution.set(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    // 视口比例明显变化（如窄窗/竖屏）时重新适配视距，否则器材会被裁出画面。
    // 阈值 0.4 保证用户小幅滚轮缩放不被打断。
    const nd = fitDist()
    if (!camDist || Math.abs(nd - camDist) > 0.4) {
      camDist = nd
      applyCamera()
    }
  }
  resize()
  const ro = new ResizeObserver(resize)
  ro.observe(container)

  /* ── 主循环 ── */
  let raf = 0
  let last = performance.now()
  function tick(now) {
    raf = requestAnimationFrame(tick)
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now

    // 转台惯性（同样受左右 45° / 平视~俯视 的硬限幅约束）
    if (!pointerDownInfo || pointerDownInfo.mode !== 'rotate') {
      rot.yaw = Math.max(-ROT_YAW_MAX, Math.min(ROT_YAW_MAX, rot.yaw + rot.vYaw))
      rot.pitch = Math.max(ROT_PITCH_MIN, Math.min(ROT_PITCH_MAX, rot.pitch + rot.vPitch))
      rot.vYaw *= INERTIA_DAMP
      rot.vPitch *= INERTIA_DAMP
      if (Math.abs(rot.vYaw) < 1e-5) rot.vYaw = 0
      if (Math.abs(rot.vPitch) < 1e-5) rot.vPitch = 0
      applyGroupRot()
    }

    stepTween(now)
    stepWires(Math.max(1 / 120, dt))
    composer.render()
  }
  raf = requestAnimationFrame(tick)

  /* ── 对外接口 ── */
  return {
    /** 同步 comps/wires/solved（React 状态变更时调用） */
    sync,
    /** 透视：外壳件半透明，壳内零件（电芯/磁钢/动圈/游丝）透出来 */
    setXray,
    /** 单件拆壳 / 合上（选中器材后的"拆开看内部"按钮调用） */
    toggleXrayComp(id) {
      toggleXrayComp(id)
    },
    /** 某件当前是否处于拆开状态 */
    isXrayOpen(id) {
      return xrayOn || xrayIds.has(id)
    },
    /** 改写新建导线的默认颜色（场景里点色块时调用） */
    setWireColor,
    /** 选中高亮（OutlinePass） */
    setSelection,
    /** 相机回到默认视角（tween） */
    resetCamera,
    /** 双击表盘聚焦（也可外部触发） */
    focusMeter(id) {
      const en = equips.get(id)
      if (!en || !en.build) return
      const t = TYPES[en.type]
      const target = new THREE.Vector3()
      if (en.build.needle) {
        target.set(
          (en.build.needle.x - t.w / 2) * SCALE,
          en.build.thickness,
          (en.build.needle.y - t.h / 2) * SCALE
        )
      }
      en.group.localToWorld(target)
      const off = new THREE.Vector3(0.35, 2.35, 2.05).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot.yaw)
      tweenCamera(target.clone().add(off), target, 620)
    },
    /** 客户端坐标 → 2D 画布坐标（拖放到 3D 台面用） */
    clientToCanvasXY(clientX, clientY) {
      const p = rayTable({ clientX, clientY })
      if (!p) return null
      return { x: p.x / SCALE + CW / 2, y: p.z / SCALE + CH / 2 }
    },
    /** 转台当前朝向（调试/联动） */
    getTableRotation() {
      return { yaw: rot.yaw, pitch: rot.pitch }
    },
    /** 释放全部 GPU 资源与事件 */
    dispose() {
      cancelAnimationFrame(raf)
      ro.disconnect()
      for (const tt of trailTimers.values()) clearTimeout(tt)
      trailTimers.clear()
      el.removeEventListener('pointerdown', onDown)
      orbitPad.removeEventListener('pointerdown', onPadDown)
      orbitPad.remove()
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      el.removeEventListener('dblclick', onDblClick)
      el.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
      for (const e of equips.values()) {
        if (e.group) disposeGroup(e.group)
      }
      equips.clear()
      for (const rec of wires.values()) rec.wire.dispose()
      wires.clear()
      table.geometry.dispose()
      tableTop.map.dispose()
      tableTop.dispose()
      tableSide.dispose()
      outline.dispose()
      composer.dispose()
      renderer.dispose()
      if (el.parentNode === container) container.removeChild(el)
    },
  }
}

/* ─────────────────────────────────────────────────────────────────────
 * 桌面网格纹理（20px 一格，对应台面吸附栅格）
 * ───────────────────────────────────────────────────────────────────── */
function makeGridTexture(cellsX, cellsY) {
  const PX = 12
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(cellsX * PX)
  canvas.height = Math.round(cellsY * PX)
  const g = canvas.getContext('2d')
  // 桌面底色：绿色防静电实验垫（对标实物实验室桌面）
  const grad = g.createLinearGradient(0, 0, 0, canvas.height)
  grad.addColorStop(0, '#1f6b45')
  grad.addColorStop(1, '#175b3a')
  g.fillStyle = grad
  g.fillRect(0, 0, canvas.width, canvas.height)
  // 细格纹（浅白，只做垫子的编织感，不抢器材）
  g.lineWidth = 1
  for (let i = 0; i <= cellsX; i++) {
    g.strokeStyle = i % 5 === 0 ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.06)'
    g.beginPath()
    g.moveTo(i * PX + 0.5, 0)
    g.lineTo(i * PX + 0.5, canvas.height)
    g.stroke()
  }
  for (let j = 0; j <= cellsY; j++) {
    g.strokeStyle = j % 5 === 0 ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.06)'
    g.beginPath()
    g.moveTo(0, j * PX + 0.5)
    g.lineTo(canvas.width, j * PX + 0.5)
    g.stroke()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}
