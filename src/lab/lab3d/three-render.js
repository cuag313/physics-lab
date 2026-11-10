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
import { buildEquipment } from './svg-extrude-loader.js'
import { VerletWire } from './verlet-wire.js'

/* ── 尺度与手感常量 ─────────────────────────────────────────────── */
const SCALE = 0.01           // 2D 画布 px → 世界单位（1800px ≈ 18 单位）
const GRID_PX = 20           // 台面网格吸附步长（px）
const TERM_SNAP_PX = 34      // 接线柱磁吸半径（px，与 2D 命中手感一致）
const TERM_DROP = 7          // 接线锚点相对柱帽下移（与 2D termAnchor 一致）
const ROT_YAW_K = 0.0062     // 拖动 → 转台角速度
const ROT_PITCH_K = 0.0042
const ROT_PITCH_MIN = -0.10
const ROT_PITCH_MAX = 0.62
const INERTIA_DAMP = 0.925   // 惯性衰减
const CAM_ELEV = 0.68        // 相机俯仰（sin 分量）
const CAM_BACK = 0.74
const CAM_DIST_MIN = 5.5
const CAM_DIST_MAX = 34
const NEEDLE_BASE_DEG = -52 // 与 needleSVG 一致：frac 0~1 → -52°~+52°
const NEEDLE_SPAN_DEG = 104

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

  /* ── 基础：渲染器 / 场景 / 相机 ── */
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  container.appendChild(renderer.domElement)
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.touchAction = 'none'

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#e8eef6')

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 220)
  const camTarget = new THREE.Vector3(0, 0.15, 0)
  let camDist = 21

  function applyCamera() {
    camera.position.set(
      camTarget.x,
      camTarget.y + camDist * CAM_ELEV,
      camTarget.z + camDist * CAM_BACK
    )
    camera.lookAt(camTarget)
  }
  applyCamera()

  /* ── 教学课件灯光：柔和定向光 + 软阴影 + 冷补光 ── */
  scene.add(new THREE.AmbientLight('#dde7f4', 0.92))
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
  const tableSide = new THREE.MeshStandardMaterial({ color: '#c8d2df', roughness: 0.85 })
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
  const rot = { yaw: 0, pitch: 0.16, vYaw: 0, vPitch: 0 }
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
  function defaultCameraPose() {
    return {
      pos: new THREE.Vector3(0, 21 * CAM_ELEV, 21 * CAM_BACK).add(new THREE.Vector3(0, 0.15, 0)),
      target: new THREE.Vector3(0, 0.15, 0),
    }
  }
  function resetCamera() {
    const d = defaultCameraPose()
    tweenCamera(d.pos, d.target)
    camDist = 21
  }

  /* ── 器材 / 导线仓储 ── */
  /** @type {Map<number, any>} compId → 器材条目 */
  const equips = new Map()
  /** @type {Map<number, any>} wireId → 导线条目 */
  const wires = new Map()
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

  /** 状态指纹：决定是否需要重建材材贴图（开关/滑片/拨盘/档位等） */
  function stateKeyOf(c) {
    return [
      c.type,
      c.closed ? 1 : 0,
      Math.round((c.f ?? 0.4) * 50),
      c.pos ?? 0,
      c.blown ? 1 : 0,
      c.mode || '-',
      Array.isArray(c.dials) ? c.dials.join('') : '-',
    ].join('|')
  }

  /** 装配接线柱磁吸热区（透明小球，射线拾取用） */
  function attachHotspots(entry) {
    const t = TYPES[entry.type]
    if (!t || !t.terminals) return
    const size = entry.build ? entry.build.size : { w: 1, h: 1 }
    const th = entry.build ? entry.build.thickness : 0.1
    for (const tm of t.terminals) {
      const g = new THREE.SphereGeometry((TERM_SNAP_PX * SCALE) / 2, 8, 6)
      const m = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
      const s = new THREE.Mesh(g, m)
      s.position.set(
        (tm.x - t.w / 2) * SCALE,
        th + 0.03,
        (tm.y + TERM_DROP - t.h / 2) * SCALE
      )
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
    const key = stateKeyOf(c)
    if (entry.key === key && entry.build) return entry
    entry.key = key
    const token = ++entry.buildToken

    const t = TYPES[c.type]
    if (!t || !t.render) return entry
    let svgString
    try {
      svgString = t.render(c, {}) // 中性动态（表针另行用 3D 指针驱动）
    } catch (e) {
      console.warn('[lab3d] render() 失败：', c.type, e)
      return entry
    }

    let build
    try {
      build = await buildEquipment({
        svgString,
        width: t.w,
        height: t.h,
        scale: SCALE,
      })
    } catch (e) {
      console.warn('[lab3d] buildEquipment 失败：', c.type, e)
      return entry
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
    applyXrayTo(entry, xrayOn)
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
  function applyXrayTo(entry, on) {
    if (!entry.build) return
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
    for (const e of equips.values()) applyXrayTo(e, xrayOn)
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
  function terminalWorldPos(cid, tid) {
    const e = equips.get(+cid)
    if (!e || !e.group) return null
    const hs = e.hotspots.get(tid)
    if (!hs) return null
    hs.getWorldPosition(tmpV2)
    labTableGroup.worldToLocal(tmpV2)
    return tmpV2.clone()
  }

  function wireColorFor(w, solved) {
    const base = new THREE.Color(w.color || opt.wireColor || '#c0392b')
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
    const { comps = [], wires: wireList = [], solved = {} } = state || {}

    // 1) 器材：增删改
    const alive = new Set()
    for (const c of comps) {
      alive.add(c.id)
      const entry = equips.get(c.id)
      if (!entry || entry.key !== stateKeyOf(c)) {
        rebuildComp(c) // 异步，完成时自挂载
      } else if (entry.group && !isCompActive(c.id)) {
        entry.group.position.copy(compToLocal(c))
        entry.group.rotation.y = c.rot || 0
      }
    }
    for (const [id, entry] of equips) {
      if (!alive.has(id)) {
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
        const val = Math.abs(isA ? o._I || 0 : o._V || 0)
        const frac = Math.max(0, Math.min(1, val / (fs || 1)))
        // SVG 转角顺时针为正；表格平面里 -z 朝上，故取负号
        entry.build.pointer.rotation.y = -((NEEDLE_BASE_DEG + frac * NEEDLE_SPAN_DEG) * Math.PI) / 180
      }
      if (c.type === 'bulb') {
        const bright = (o._P || 0) > 0 ? Math.min(1, o._P / BULB_RATED) : 0
        const mats = Array.isArray(entry.build.outer.material)
          ? entry.build.outer.material
          : [entry.build.outer.material]
        for (const m of mats) {
          if (!m.emissiveMap && m.map) m.emissiveMap = m.map
          m.emissive = m.emissive || new THREE.Color(0, 0, 0)
          m.emissive.setRGB(1, 0.93, 0.62)
          m.emissiveIntensity = bright * 1.25
        }
      }
    }

    // 3) 导线：增删改
    const aliveW = new Set()
    for (const w of wireList) {
      aliveW.add(w.id)
      let rec = wires.get(w.id)
      if (!rec) {
        const vw = new VerletWire({ color: w.color || opt.wireColor || '#c0392b' })
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
      const pa = terminalWorldPos(ca, ta)
      const pb = terminalWorldPos(cb, tb)
      if (!pa || !pb) continue
      rec.wire.pin(pa, pb)
      if (!rec.seeded) {
        rec.wire.reseed()
        rec.seeded = true
      }
      rec.wire.simulate(localGravity, dt)
    }
    // 预览线（接线中）
    if (pending && pending.wire) {
      const pa = terminalWorldPos(pending.cid, pending.tid)
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
    const outerMeshes = []
    for (const en of equips.values()) if (en.build) outerMeshes.push(en.build.outer)
    const hitC = raycaster.intersectObjects(outerMeshes, false)
    if (hitC.length) {
      const id = hitC[0].object.parent && hitC[0].object.parent.userData.compId
      return { kind: 'comp', compId: id, point: hitC[0].point }
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
  function snapTerminal(e) {
    const p = rayTable(e)
    if (!p) return null
    let best = null
    let bestD = (TERM_SNAP_PX * SCALE) ** 2
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

    // 接线中：命中柱 → 完成接线
    if (pending) {
      if (hit && hit.kind === 'terminal') {
        const a = pending.cid + ':' + pending.tid
        const b = hit.compId + ':' + hit.tid
        if (a !== b) opt.onWireConnect && opt.onWireConnect(a, b)
      }
      cancelPending()
      return
    }

    if (hit && hit.kind === 'terminal') {
      // 起线
      const wire = new VerletWire({ color: opt.wireColor || '#c0392b', count: 14 })
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

    if (hit && hit.kind === 'wire') {
      opt.onSelect && opt.onSelect({ kind: 'wire', id: hit.wireId })
      pointerDownInfo = { x: e.clientX, y: e.clientY, mode: 'select-wire' }
      return
    }

    if (hit && hit.kind === 'comp') {
      opt.onSelect && opt.onSelect({ kind: 'comp', id: hit.compId })
      const local = rayTable(e)
      const en = equips.get(hit.compId)
      pointerDownInfo = {
        x: e.clientX,
        y: e.clientY,
        mode: e.shiftKey ? 'rot-comp' : 'move',
        compId: hit.compId,
        // 抓取偏移：光标点相对器材底面中心（拖动时器材不跳到光标下）
        grabX: local && en ? local.x - en.group.position.x : 0,
        grabZ: local && en ? local.z - en.group.position.z : 0,
        rot0: en ? en.group.rotation.y : 0,
        moved: 0,
      }
      return
    }

    // 空白处：转台旋转
    pointerDownInfo = {
      x: e.clientX,
      y: e.clientY,
      mode: 'rotate',
      yaw0: rot.yaw,
      pitch0: rot.pitch,
      moved: 0,
    }
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

    if (info.mode === 'rotate') {
      rot.yaw = info.yaw0 + dx * ROT_YAW_K
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

  function onUp(e) {
    const info = pointerDownInfo
    pointerDownInfo = null
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
    if (info.mode === 'rotate') {
      // 点击空白（几乎无位移）→ 相机复位（req 7）
      if ((info.moved || 0) < 6) resetCamera()
      return
    }
    if (info.mode === 'move' || info.mode === 'rot-comp') {
      // 点击器材：仅选中（已处理）
    }
  }

  function onDblClick(e) {
    const hit = pick(e)
    if (!hit || hit.kind !== 'comp') return
    const en = equips.get(hit.compId)
    if (!en || !en.build) return
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

  /* ── 尺寸自适应 ── */
  function resize() {
    const w = container.clientWidth || 1
    const h = container.clientHeight || 1
    renderer.setSize(w, h, false)
    composer.setSize(w, h)
    outline.resolution.set(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
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

    // 转台惯性
    if (!pointerDownInfo || pointerDownInfo.mode !== 'rotate') {
      rot.yaw += rot.vYaw
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
    /** 透视：外壳半透明 + 显示 inner */
    setXray,
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
      el.removeEventListener('pointerdown', onDown)
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
  // 桌面底色：柔和浅灰蓝（教学课件风）
  const grad = g.createLinearGradient(0, 0, 0, canvas.height)
  grad.addColorStop(0, '#f4f7fb')
  grad.addColorStop(1, '#e7edf5')
  g.fillStyle = grad
  g.fillRect(0, 0, canvas.width, canvas.height)
  // 栅格
  g.lineWidth = 1
  for (let i = 0; i <= cellsX; i++) {
    g.strokeStyle = i % 5 === 0 ? 'rgba(148,163,184,0.55)' : 'rgba(203,213,225,0.55)'
    g.beginPath()
    g.moveTo(i * PX + 0.5, 0)
    g.lineTo(i * PX + 0.5, canvas.height)
    g.stroke()
  }
  for (let j = 0; j <= cellsY; j++) {
    g.strokeStyle = j % 5 === 0 ? 'rgba(148,163,184,0.55)' : 'rgba(203,213,225,0.55)'
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
