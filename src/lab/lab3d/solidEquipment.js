/**
 * 3D 实体器材：用基本几何体（盒/柱/球/环）拼出真实器材质感，
 * 取代此前"拿 SVG 剪影挤出成一块板"的伪 3D。
 *
 * 约定：
 *  - 组内坐标为本地坐标，y 向上，台面在 y = 0，实体用 +y 抬起来；
 *  - 尺寸沿用 2D 器材的逻辑尺寸（SVG px），按 SCALE 换算成世界单位，
 *    这样切换 2D/3D 时器材在桌面上的占地一致；
 *  - 接线柱位置严格按 TYPES[type].terminals 的像素坐标换算，
 *    保证 3D 热区（attachHotspots）与看得见的铜柱重合。
 */

import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { gearReady, preloadGear, cloneGear } from './glbEquipment.js'

const SCALE = 0.01

/* ── 材质 ── */
function std(color, opt = {}) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: opt.roughness ?? 0.62,
    metalness: opt.metalness ?? 0.08,
    ...opt,
  })
}

const MAT = {
  copper: () => std('#c67a35', { roughness: 0.45, metalness: 0.45 }),
  brass: () => std('#c9a227', { roughness: 0.42, metalness: 0.4 }),
  steel: () => std('#aeb6be', { roughness: 0.4, metalness: 0.5 }),
  bakelite: () => std('#2a2d33', { roughness: 0.72, metalness: 0.04 }),
  darkPlastic: () => std('#3a3f47', { roughness: 0.7 }),
  ceramic: () => std('#efe9dd', { roughness: 0.55, metalness: 0.02 }),
  redPlastic: () => std('#b12a26', { roughness: 0.6 }),
  bluePlastic: () => std('#2b5aa8', { roughness: 0.55 }),
  glass: () =>
    std('#dfe9f2', {
      roughness: 0.08,
      metalness: 0.0,
      transparent: true,
      opacity: 0.42,
      envMapIntensity: 1.2,
    }),
  white: () => std('#f6f4ee', { roughness: 0.75 }),
}

/* ── 几何工具 ── */
function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

function cyl(rTop, rBottom, h, material, seg = 20) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), material)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/**
 * 圆角盒 —— 真实塑料/胶木件的每一条棱都是圆的。
 * 用纯 BoxGeometry 拼出来的器材，一眼就是"积木"：棱线笔直、没有过渡面，
 * 抗锯齿再好也像贴纸。圆角是"像实物"最便宜也最有效的一步。
 * @param {number} r 圆角半径（会被夹到最短边的一半以内）
 */
function rbox(w, h, d, r, material, x = 0, y = 0, z = 0, seg = 3) {
  const rr = Math.max(0.001, Math.min(r, w * 0.49, h * 0.49, d * 0.49))
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, seg, rr), material)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/**
 * 螺旋管 —— 沿 +Y 轴的螺旋线扫出一根细管。
 * 两处必须用它而不是"叠一堆圆环"：
 *   1) 小灯泡的螺口（实物是连续的螺纹，不是几个独立圆环）；
 *   2) 滑动变阻器的镍铬丝（实物是一根连续电阻丝绕在瓷管上）。
 * 叠圆环在近景里会露出环与环之间的空当，一看就是假的。
 * @param {number} radius 螺旋半径
 * @param {number} y0 起点 y
 * @param {number} y1 终点 y
 * @param {number} turns 圈数
 * @param {number} tubeR 丝半径
 */
function helixTube(radius, y0, y1, turns, tubeR, material) {
  const N = Math.max(24, Math.round(turns * 14))
  const pts = []
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const a = t * turns * Math.PI * 2
    pts.push(new THREE.Vector3(Math.cos(a) * radius, y0 + (y1 - y0) * t, Math.sin(a) * radius))
  }
  const curve = new THREE.CatmullRomCurve3(pts)
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, N, tubeR, 6, false), material)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** 简易文字贴图（铭牌/型号标签），省掉外部图片依赖 */
function labelTexture(lines, opt = {}) {  const W = opt.w || 256
  const H = opt.h || 128
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const g = cv.getContext && cv.getContext('2d')
  if (!g) return null // 离屏/测试环境没有 2d context：贴图留空，但不能让整件器材崩掉
  g.fillStyle = opt.bg || '#f4f2ec'
  g.fillRect(0, 0, W, H)
  if (opt.border) {
    g.strokeStyle = opt.border
    g.lineWidth = 4
    g.strokeRect(2, 2, W - 4, H - 4)
  }
  g.fillStyle = opt.color || '#1e2530'
  g.textAlign = 'center'
  lines.forEach((ln, i) => {
    g.font = (i === 0 ? 'bold ' : '') + (i === 0 ? 40 : 26) + 'px sans-serif'
    g.fillText(ln, W / 2, H * (0.42 + i * 0.3))
  })
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/* ── 实拍图贴面：2D 视图里的器材本来就是实拍/渲染图，3D 直接复用同一张图 ──
 * 这是"1:1"最直接的做法：占桌面尺寸 = 2D 的 w×h（1px = 1cm），
 * 顶面贴同一张实拍图，再把接线柱按 terminals 像素坐标从顶面伸出来，
 * 于是"看到的形状"和 2D 视图完全一致，还多了真实厚度。
 * 图片是白底，必须只抠掉"与画布边界连通的白色"（flood fill），
 * 否则表盘内部的白也会被抠成透明洞。 */
const PHOTO_BASE = '/physics-lab/assets/equipment/fig/'
const _photoCache = new Map()

/** 只把与边界连通的近白像素置透明，保留器材内部的白 */
function whiteBorderToAlpha(cv, g) {
  const W = cv.width
  const H = cv.height
  const data = g.getImageData(0, 0, W, H)
  const px = data.data
  const seen = new Uint8Array(W * H)
  const stack = []
  for (let x = 0; x < W; x++) {
    stack.push(x)
    stack.push((H - 1) * W + x)
  }
  for (let y = 0; y < H; y++) {
    stack.push(y * W)
    stack.push(y * W + W - 1)
  }
  const white = (i) => px[i * 4] > 236 && px[i * 4 + 1] > 236 && px[i * 4 + 2] > 236
  while (stack.length) {
    const idx = stack.pop()
    if (seen[idx]) continue
    seen[idx] = 1
    if (!white(idx)) continue
    px[idx * 4 + 3] = 0
    const x = idx % W
    const y = (idx - x) / W
    if (x > 0) stack.push(idx - 1)
    if (x < W - 1) stack.push(idx + 1)
    if (y > 0) stack.push(idx - W)
    if (y < H - 1) stack.push(idx + W)
  }
  g.putImageData(data, 0, 0)
}

/** 取实拍图（异步载入；先用 1×1 空白占位，载入后自动替换） */
const _photoRec = new Map()
function photoCanvasLoad(file, onReady) {
  let rec = _photoRec.get(file)
  if (!rec) {
    rec = { canvas: null, raw: null, waiters: [] }
    _photoRec.set(file, rec)
    if (typeof document === 'undefined') return
    const img = new Image()
    img.onload = () => {
      // 两份画布：cut = 抠掉与边界连通的近白（素材件，如电池组的抠图）；
      //           raw = 保留原图（照片本身就是一件器材的完整正面，抠白会
      //                 在浅色外壳上抠出洞、露出底板 → 看着像"灰框里塞了个小图"）
      const make = (doCut) => {
        const c2 = document.createElement('canvas')
        c2.width = img.width
        c2.height = img.height
        const g = c2.getContext && c2.getContext('2d')
        if (!g) return null
        g.drawImage(img, 0, 0)
        if (doCut) whiteBorderToAlpha(c2, g)
        return c2
      }
      rec.raw = make(false)
      rec.canvas = make(true)
      for (const fn of rec.waiters) {
        try {
          fn(rec.canvas)
        } catch (e) {
          /* ignore */
        }
      }
      rec.waiters.length = 0
    }
    img.src = PHOTO_BASE + file
  }
  if (rec.canvas) onReady(rec.canvas)
  else rec.waiters.push(onReady)
}

/**
 * 把实拍图中的一条"横向区域"贴到平面。
 * 实拍图是斜投影：上半是顶面（带柱），下半是正面。一个平面只能取其中一段，
 * 否则俯视看到整张正面图、平视又看到顶面图 —— 这就是"怎么看都不像"的根源。
 * @param {string} file
 * @param {number} w 平面宽
 * @param {number} h 平面高
 * @param {object} opt {v0: 起始 v（从图像底部算）, frac: 取的高度比例, cut: 是否抠白（默认 true）}
 */
function photoFace(file, w, h, opt = {}) {
  if (typeof document === 'undefined') return null
  const cut = opt.cut !== false
  const cv = document.createElement('canvas')
  cv.width = 2
  cv.height = 2
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  // 实拍贴面是"一张会被放大看的图"，绝不能生成 mipmap：
  // 缩到小尺寸时 mip 层会取到透明/空白像素，远看就是一块白板（刻度全丢）。
  tex.generateMipmaps = false
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.repeat.set(1, opt.frac ?? 1)
  tex.offset.set(0, opt.v0 ?? 0)
  photoCanvasLoad(file, (c2) => {
    // 整面贴满时（cut:false）用未抠的原图，否则浅色外壳会被抠出洞
    const rec = _photoRec.get(file)
    const useCut = cut && rec && rec.canvas ? rec.canvas : (rec && (rec.raw || rec.canvas)) || c2
    tex.image = useCut
    tex.needsUpdate = true
  })
  // 这张纹理指向共享的 canvas 源，不能随"临时场景销毁"被 dispose，
  // 否则同一张实拍图在别的器材/图标上会变成白板。
  tex.userData.sharedPhoto = true
  // DoubleSide：贴面万一被转了向，也不会因为背面剔除而"整块消失"
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, side: THREE.DoubleSide })
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
  m.userData.role = 'photo'
  return m
}



/**
 * 接线柱：对标实物实验室的红/黑压线旋钮
 *  - 负极/公共端用黑色旋钮，正极用红色旋钮（按 terminals.id 判断）
 *  - 结构：金属基座 → 细柱 → 彩色旋钮 → 顶部中心凸起
 *  - 总高约 0.16，与 three-render 的磁吸热区中心对齐
 */
function makePost(id = '', forceNeg) {
  const isNeg = typeof forceNeg === 'boolean'
    ? forceNeg
    : (/^(neg|n|-)/i.test(id) || /neg|black/i.test(id))
  const knobColor = isNeg ? '#1c2026' : '#cf1f22'
  const g = new THREE.Group()

  const base = cyl(0.052, 0.058, 0.02, MAT.steel(), 16)
  base.position.y = 0.01
  g.add(base)

  const stem = cyl(0.022, 0.022, 0.07, MAT.steel(), 12)
  stem.position.y = 0.05
  g.add(stem)

  const knob = cyl(
    0.052,
    0.056,
    0.062,
    // 旋钮是绝缘塑料：不要金属度，环境反射压低，红色才压得住不会被洗成粉
    std(knobColor, { roughness: 0.55, metalness: 0, envMapIntensity: 0.55 }),
    20
  )
  knob.position.y = 0.115
  g.add(knob)

  // 旋钮顶部的凹槽 + 中心凸起（实物接线柱的压线螺钉）
  const cap = cyl(0.03, 0.03, 0.012, std(isNeg ? '#3a3f45' : '#e0483f', { roughness: 0.5 }), 14)
  cap.position.y = 0.152
  g.add(cap)

  g.userData.role = 'post'
  g.userData.neg = isNeg
  return g
}

/** 表盘贴图：canvas 画刻度 + 文字，比光栅化 SVG 更清晰也更省 */
function dialTexture(kind, fs, subTicks) {
  const W = 256
  const H = 256
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const g = cv.getContext && cv.getContext('2d')
  if (!g) return null // 同上：没有 2d context 就不画表盘，别让表整件崩掉
  g.fillStyle = '#fbfaf6'
  g.fillRect(0, 0, W, H)

  // 刻度弧：圆心在画布下缘外，半径取 0.625H，跨度 ±50°（与指针行程 -52°~+52° 对齐），
  // 保证 0 与满刻度都落在表盘里不被裁掉
  const cx = W / 2
  const cy = H * 1.11
  const R = H * 0.625
  const a0 = Math.PI * 1.222 // 220°
  const a1 = Math.PI * 1.778 // 320°
  g.strokeStyle = '#1f2226'
  g.lineWidth = 2.2
  g.beginPath()
  g.arc(cx, cy, R, a0, a1)
  g.stroke()

  const n = subTicks || 30
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const a = a0 + (a1 - a0) * t
    const r0 = R - (i % 5 === 0 ? 15 : 7)
    const r1 = R
    g.strokeStyle = i % 5 === 0 ? '#1f2226' : '#6b7176'
    g.lineWidth = i % 5 === 0 ? 2 : 1
    g.beginPath()
    g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0)
    g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1)
    g.stroke()
  }

  // 数字
  g.fillStyle = '#15181c'
  g.font = 'bold 17px sans-serif'
  g.textAlign = 'center'
  const marks = 6
  for (let i = 0; i <= marks; i++) {
    const t = i / marks
    const a = a0 + (a1 - a0) * t
    const rr = R - 26
    g.fillText(String(Math.round(fs * t * 10) / 10), cx + Math.cos(a) * rr, cy + Math.sin(a) * rr + 6)
  }

  // 单位/型号
  g.font = 'bold 26px sans-serif'
  g.fillText(kind, cx, H * 0.36)
  g.font = '14px sans-serif'
  g.fillStyle = '#6b7176'
  g.fillText('J0407 · 0.5 级', cx, H * 0.44)

  const tex = new THREE.CanvasTexture(cv)
  tex.anisotropy = 4
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/* ── 各类器材 ── */

/**
 * 电池组：按实拍图的三维形态重建。
 * 实拍图是斜投影 —— 上半是顶面（两个接线柱 + 一条深色边），下半是正面（+/- 标记）。
 * 所以实物是"宽 1.5 / 高 1.1 / 深 1.1"的方块：
 *   俯视 → 看到顶面（长方形，上面两个柱）；
 *   平视 → 看到正面（接近正方形）。
 * 顶面贴图的上段、正面贴图的下段，两张图拼起来才是完整的实物 ——
 * 这正是之前"把整张图贴在顶面"看起来不像的原因。
 */
function buildBattery(w, h, terms = []) {
  const g = new THREE.Group()
  const shell = []
  const panel = []
  // 基准是项目自己的图纸 TYPES.battery（实拍 battery_c.png，150×154）：**竖立的蓝色方箱**，
  // 顶面一条深色边 + 两个白环柱座，正面顶部是 "− / +" 两个白字，内部两节干电池竖直并排。
  // 上一轮按 iconsnewname 的"横躺电池盒"重做 —— 那是另一台仪器，所以越改越不像（见对照页 ct_battery.png）。
  const W = w * SCALE          // 1.50
  const H = h * SCALE          // 1.54
  const D = 1.06
  const bodyH = H * 0.845      // 箱体主体高（0 → 1.30）
  const lidH = 0.10
  const lidY = bodyH + lidH / 2

  // 箱体（亮蓝灰钢壳，边缘倒圆）
  const bodyMat = std('#2f5f9e', { roughness: 0.46, metalness: 0.35 })
  shell.push(rbox(W * 0.975, bodyH, D, 0.035, bodyMat, 0, bodyH / 2, 0))
  // 顶面深色包边（图纸顶部那条深色带）
  shell.push(rbox(W * 0.995, 0.045, D * 1.005, 0.014,
    std('#1d2430', { roughness: 0.62, metalness: 0.2 }), 0, bodyH + 0.022, 0))
  // 顶盖（浅灰钢板）
  shell.push(rbox(W * 0.985, lidH, D * 0.97, 0.02,
    std('#c9d3de', { roughness: 0.5, metalness: 0.25 }), 0, lidY, 0))

  // 正面 "− / +"：按图纸 x=34 / 111 的位置画两块白字贴片
  const signTex = (txt) => {
    const cn = document.createElement('canvas')
    cn.width = 128; cn.height = 128
    const cx = cn.getContext('2d')
    if (!cx) return null // 无 canvas 环境（单测 jsdom）时降级：不画符号面
    cx.clearRect(0, 0, 128, 128)
    cx.fillStyle = '#ffffff'
    cx.font = 'bold 108px "Microsoft YaHei", sans-serif'
    cx.textAlign = 'center'; cx.textBaseline = 'middle'
    cx.fillText(txt, 64, 70)
    const t = new THREE.CanvasTexture(cn)
    t.colorSpace = THREE.SRGBColorSpace
    return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false })
  }
  for (const [tx, txt] of [[(34 - w / 2) * SCALE, '−'], [(111 - w / 2) * SCALE, '+']]) {
    const mat = signTex(txt)
    if (!mat) continue
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.20, 0.20), mat)
    p.position.set(tx, bodyH - 0.28, D / 2 + 0.006)
    panel.push(p)
    g.add(p)
  }

  // 内部（剖视时露出）：两节竖直干电池 —— 外层锌筒、里层电解膏、中心石墨棒，三段颜色明显区分
  const inner = new THREE.Group()
  inner.name = 'battery-inner'
  const zincMat = std('#aeb7c2', { roughness: 0.38, metalness: 0.72 })
  const graphiteMat = std('#171b21', { roughness: 0.9, metalness: 0.04 })
  const cellH = bodyH * 0.78
  for (const cx of [-0.34, 0.34]) {
    const zinc = cyl(0.19, 0.19, cellH, zincMat, 22)
    zinc.position.set(cx, cellH / 2 + 0.05, 0)
    inner.add(zinc)
    const paste = cyl(0.16, 0.16, cellH - 0.05, std('#c9cdd3', { roughness: 0.95 }), 20)
    paste.position.set(cx, cellH / 2 + 0.05, 0)
    inner.add(paste)
    const rod = cyl(0.062, 0.062, cellH + 0.03, graphiteMat, 14)
    rod.position.set(cx, cellH / 2 + 0.05, 0)
    inner.add(rod)
    // 正极凸头
    const cap = cyl(0.05, 0.05, 0.03, MAT.brass(), 12)
    cap.position.set(cx, cellH + 0.07, 0)
    inner.add(cap)
  }
  g.add(inner)

  // 接线柱：顶盖上，x 按图纸像素（左负右正），柱脚垫一圈浅灰白环（图纸上那两个白圆环）
  const posts = []
  for (const tm of terms) {
    const px = (tm.x - w / 2) * SCALE
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.026, 10, 26),
      std('#dfe4ea', { roughness: 0.55, metalness: 0.3 }))
    ring.rotation.x = Math.PI / 2
    ring.position.set(px, lidY + lidH / 2 + 0.004, 0)
    shell.push(ring)
    const p = makePost(tm.id)
    p.position.set(px, lidY + lidH / 2, 0)
    p.userData.terminal = tm.id
    g.add(p)
    posts.push(p)
  }

  for (const m of shell) g.add(m)
  return { group: g, shell, inner, panel, posts, postTopY: lidY + lidH / 2 }
}

/** 小灯泡：浅灰底板 + 黑胶木灯座 + 连续螺纹灯口 + 玻璃泡 + 螺旋灯丝 */
function buildBulb(w, h) {
  const g = new THREE.Group()
  const shell = []

  // 灯丝与引线是"动态件"：亮度随电流实时变，必须留在代码里。
  // 其余形体（底板 / 胶木灯座 / 螺纹灯口 / A 型玻壳）走 Blender 模型，
  // 玻壳是剖面回转出来的，代码用球+圆柱拼永远收不出那个肩部弧度。
  const filMat = std('#5c3417', {
    emissive: new THREE.Color('#ff9a3c'),
    emissiveIntensity: 0,
    roughness: 0.4,
    metalness: 0.3,
  })
  const glassMat = MAT.glass()
  glassMat.opacity = 0.36

  const addFilament = (globeY) => {
    const fil = helixTube(0.026, 0.0, 0.085, 4, 0.0075, filMat)
    fil.position.y = globeY - 0.06
    g.add(fil)
    for (const sx of [-1, 1]) {
      const lead = cyl(0.007, 0.007, 0.14, MAT.steel(), 6)
      lead.position.set(sx * 0.03, globeY - 0.10, 0)
      g.add(lead)
    }
  }

  const gear = gearReady('bulb')
  if (!gear && typeof document !== 'undefined') preloadGear('bulb')
  if (gear) {
    const model = cloneGear('bulb')
    model.traverse((o) => {
      if (!o.isMesh) return
      if (/globe/i.test(o.name || '')) {
        // 玻壳换成带透明度的玻璃材质，好让 three 侧按亮度调 emissive/opacity
        o.material = glassMat
        o.castShadow = false
        o.receiveShadow = false
      } else {
        shell.push(o)
      }
    })
    g.add(model)
    addFilament(0.68)
    return { group: g, bulbMat: filMat, glassMat, shell }
  }

  // 底板（实物是浅灰塑料薄板）：板要够厚，图纸上前缘能看到明显的一条板边
  const base = rbox(w * SCALE * 0.96, 0.075, 0.70, 0.016, std('#d8dbe0', { roughness: 0.6 }), 0, 0.0375, 0)
  shell.push(base)
  // 黑胶木灯座（图纸上是"矮而粗"的圆台，座径约 0.45、座高约 0.30；细高就成了瓷柱）
  const socket = cyl(0.215, 0.225, 0.30, std('#22262c', { roughness: 0.68, metalness: 0.03 }), 24)
  socket.position.y = 0.225
  shell.push(socket)
  // 灯座顶面金属承口（螺纹在承口里面）
  const cup = cyl(0.138, 0.142, 0.022, MAT.steel(), 20)
  cup.position.y = 0.395
  shell.push(cup)
  for (const m of shell) g.add(m)

  // 连续螺纹的灯口（原来用几个圆环叠，近景能看到环间空当）
  const screw = helixTube(0.130, 0.40, 0.55, 4.5, 0.0085, MAT.steel())
  g.add(screw)
  // 灯口内芯
  const core = cyl(0.108, 0.108, 0.15, std('#8b9099', { roughness: 0.5, metalness: 0.3 }), 16)
  core.position.y = 0.47
  g.add(core)

  // 玻璃：颈部 + 泡体。图纸上泡径 ≈ 0.60（相对总宽 1.76 的 1/3），明显大于灯座
  const neck = cyl(0.135, 0.115, 0.13, glassMat, 18)
  neck.position.y = 0.57
  neck.castShadow = false
  g.add(neck)
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.305, 32, 24), glassMat)
  globe.position.y = 0.745
  globe.scale.y = 1.12
  globe.castShadow = false
  g.add(globe)

  addFilament(0.68)
  return { group: g, bulbMat: filMat, glassMat, shell }
}

/**
 * 单刀开关：基准是项目图纸 TYPES.switch（实拍 switch_c.png，150×105 纯俯视）。
 * 图上是「米白瓷薄板 + 两根圆头银灰触头立柱（左铰链、右静触）+ 一根扁宽银刀斜抬约 28°
 * + 末端粗黑胶木方手柄 + 板前沿一黑一红两个接线柱」。
 * 旧版把照片里"压平的刀"整张铺在顶面，真刀叠上去是两条刀影 —— 既认不出是什么、也没有开合动作。
 */
function buildSwitch(w, h) {
  const g = new THREE.Group()
  const shell = []
  const W = w * SCALE // 1.50
  const D = h * SCALE // 1.05
  const TH = 0.055
  const plateMat = std('#ddd7cc', { roughness: 0.55, metalness: 0.08 }) // 米白瓷板
  const steelMat = std('#cbcfd4', { roughness: 0.28, metalness: 0.8 })

  // 米白瓷薄底板（边缘倒圆）
  const base = rbox(W * 0.99, TH, D * 0.99, 0.022, plateMat, 0, TH / 2, 0)
  shell.push(base)
  g.add(base)

  // 内部：两块静触头 + 两根引线（剖视时露出来）
  const inner = new THREE.Group()
  inner.name = 'switch-inner'
  for (const sx of [-1, 1]) {
    inner.add(box(0.12, 0.035, 0.16, MAT.brass(), sx * 0.45, 0.03, 0))
    inner.add(box(0.55, 0.014, 0.014, MAT.copper(), sx * 0.12, 0.02, 0))
  }
  g.add(inner)

  // 接线柱在 2D 图靠前一侧（y=86px → z≈+0.335）
  const hz = 0.335
  const hingeX = -0.16 // 左铰链立柱
  const contactX = 0.52 // 右静触立柱
  const colH = 0.24
  const BOSS_Y = TH + colH // 刀轴高度 = 立柱顶

  // 两根圆头银灰触头立柱（图纸上这两根最显眼，缺了就"不知道是什么东西"）
  for (const px of [hingeX, contactX]) {
    const col = cyl(0.048, 0.056, colH, steelMat, 16)
    col.position.set(px, TH + colH / 2, hz)
    shell.push(col)
    g.add(col)
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), steelMat)
    dome.position.set(px, TH + colH, hz)
    shell.push(dome)
    g.add(dome)
  }
  // 铰链横轴（沿 Z 横穿立柱顶）
  const axle = cyl(0.022, 0.022, 0.13, MAT.brass(), 12)
  axle.rotation.x = Math.PI / 2
  axle.position.set(hingeX, BOSS_Y, hz)
  g.add(axle)
  // 静触立柱顶的小平面（合闸时刀落在它上面）
  g.add(box(0.09, 0.012, 0.11, MAT.brass(), contactX, BOSS_Y + 0.006, hz))

  // 扁宽银刀：pivot 在铰链轴，绕 Z 抬起（刀沿 X 伸展，绕 X 转是自转，抬不起来）
  const pivot = new THREE.Group()
  pivot.position.set(hingeX, BOSS_Y, hz)
  pivot.add(rbox(0.92, 0.055, 0.105, 0.022, steelMat, 0.46, 0, 0))
  // 末端粗黑胶木方手柄
  pivot.add(rbox(0.26, 0.13, 0.13, 0.032,
    std('#1f2328', { roughness: 0.62, metalness: 0.06 }), 0.86, 0.03, 0))
  g.add(pivot)

  /** 合闸 = 0；断开时刀绕 Z 抬起约 28°（与图纸叠层 bladeSVG 的斜角一致） */
  const setBlade = (closed) => {
    pivot.rotation.z = closed ? 0 : 0.49
  }
  setBlade(true)

  return { group: g, blade: pivot, setBlade, shell, inner, top: null, panel: [] }
}

/** 立式方表（电流表 / 电压表）：浅灰紫底台 + 楔形后壳 + 白面板 + 表盘 + 玻璃 + 三柱 */
function buildMeter(w, h, kind, fs, subTicks) {
  const g = new THREE.Group()
  const W = w * SCALE // 1.3
  const H = h * SCALE // 1.52 / 1.33
  const D = 0.36
  const front = D / 2 // 面板前缘 z
  const shell = []
  const panel = [] // 剖视时要整块隐掉的面（表盘、玻璃、实拍贴面）

  // 内部：U 形磁铁 + 动圈 + 游丝（剖视时露出来，这就是真实电表的表头）
  const inner = new THREE.Group()
  inner.name = 'meter-inner'
  const mag = std('#4b5563', { roughness: 0.5, metalness: 0.35 })
  inner.add(box(W * 0.2, H * 0.3, 0.11, mag, -W * 0.26, H * 0.5, 0))
  inner.add(box(W * 0.2, H * 0.3, 0.11, mag, W * 0.26, H * 0.5, 0))
  inner.add(box(W * 0.5, 0.05, 0.1, mag, 0, H * 0.3, 0)) // 磁轭底部
  const coil = box(W * 0.34, H * 0.22, 0.05, std('#c67a35', { roughness: 0.5, metalness: 0.4 }), 0, H * 0.52, 0.03)
  inner.add(coil)
  for (const sx of [-1, 1]) {
    const sp = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.005, 6, 14), MAT.brass())
    sp.position.set(sx * W * 0.16, H * 0.4, 0.02)
    inner.add(sp)
  }
  inner.add(box(W * 0.7, 0.012, 0.012, MAT.copper(), 0, H * 0.24, 0.05))
  g.add(inner)

  // ── 形体来源：优先用 Blender 导出的 GLB（真网格 + 真倒角 + 真 UV）──
  // 代码几何只作兜底：模型未就绪时先画一版，加载完成后由 gear-ready 事件触发重建。
  const glbType = kind === 'V' ? 'voltmeter' : 'ammeter'
  const gear = gearReady(glbType)
  if (!gear && typeof document !== 'undefined') preloadGear(glbType)

  if (gear) {
    const model = gear.clone(true)
    model.traverse((o) => {
      if (!o.isMesh) return
      o.castShadow = true
      o.receiveShadow = true
      if (/dial/i.test(o.name)) panel.push(o)
      else shell.push(o)
    })
    g.add(model)
  } else {

  // 底台：浅灰紫圆角板（实物表的底板比外壳大一圈，表放上去有"座"）
  g.add(rbox(W + 0.07, 0.05, D + 0.2, 0.022, std('#cfc9d8', { roughness: 0.58, metalness: 0.04 }), 0, 0.025, 0.03))

  // 楔形后壳：侧视是梯形 —— 前面全高，往后斜降约三分之一。
  // 直角方箱是"积木感"最重的一处：真实教学表的背壳一定是斜背的，便于仰视读数。
  const backRun = D * 1.06
  const sh = new THREE.Shape()
  sh.moveTo(0, 0)
  sh.lineTo(0, H)
  sh.lineTo(-backRun, H * 0.66)
  sh.lineTo(-backRun, 0)
  sh.lineTo(0, 0)
  const shellGeo = new THREE.ExtrudeGeometry(sh, {
    depth: W,
    bevelEnabled: true,
    bevelSize: 0.012,
    bevelThickness: 0.012,
    bevelSegments: 2,
    curveSegments: 6,
  })
  // rotateY(-90°) 把 shape 的 x 轴转到 -Z、挤出方向转到 X，然后把"前缘"推到 z = front
  shellGeo.rotateY(-Math.PI / 2)
  shellGeo.translate(W / 2, 0, front)
  const casing = new THREE.Mesh(shellGeo, MAT.bakelite())
  casing.castShadow = true
  casing.receiveShadow = true
  shell.push(casing)
  g.add(casing)

  // 前面板：白色塑料板（表盘、刻字、旋钮都装在它上面）
  const panelMesh = rbox(W * 0.994, H * 0.985, 0.05, 0.012, std('#f1efea', { roughness: 0.72 }), 0, H / 2 + 0.02, front + 0.005)
  shell.push(panelMesh)
  g.add(panelMesh)

  // 表盘面：直接用实拍图（表盘刻度、量程字、底部旋钮印字全在图上）。
  // 自绘的 dialTexture 只作兜底（离屏无 canvas / 图未载入时）。
  const dialMat = std('#f2f0ea', { roughness: 0.85 })
  const dialTex = dialTexture(kind, fs, subTicks)
  if (dialTex) {
    dialMat.map = dialTex
    dialMat.needsUpdate = true // 赋值 map 后必须重编译，否则表格永远是一块灰板
  }
  const dial = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.84, H * 0.7), dialMat)
  dial.position.set(0, H * 0.585 + 0.02, front + 0.032)
  g.add(dial)
  panel.push(dial)

  // 实拍图贴面：整张正面（电压表/电流表几乎没有"顶面段"，所以取整幅）
  // 注意 kind 传进来是 'A'/'V'（不是类型名），取错图会让电压表显示电流表盘
  const meterFile = kind === 'V' ? 'voltmeter_c.png' : 'ammeter_c.png'
  const photo = photoFace(meterFile, W * 0.995, H * 0.995, {
    v0: 0,
    frac: 1,
    cut: false,
  })
  if (photo) {
    photo.position.set(0, H / 2 + 0.02, front + 0.033)
    g.add(photo)
    panel.push(photo)
    // 图载入后把自绘表盘藏起来，免得两张表盘打架
    photoCanvasLoad(meterFile, () => {
      dial.visible = false
    })
  }
  } // ← 代码几何兜底分支结束

  // 玻璃面板：只压四条细边当边框 —— 千万别用实心 box 当"框"，
  // 否则它会把前面的表盘整个盖住（表盘看着就是一块黑板）。
  const frZ = front + 0.036
  const frW = W * 0.9
  const frH = H * 0.76
  const frY = H * 0.585 + 0.02
  const frMat = std('#20242a', { roughness: 0.5 })
  g.add(box(frW, 0.008, 0.006, frMat, 0, frY + frH / 2, frZ))
  g.add(box(frW, 0.008, 0.006, frMat, 0, frY - frH / 2, frZ))
  g.add(box(0.008, frH, 0.006, frMat, -frW / 2, frY, frZ))
  g.add(box(0.008, frH, 0.006, frMat, frW / 2, frY, frZ))
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 0.86, H * 0.72),
    std('#cfe0ef', { transparent: true, opacity: 0.09, roughness: 0.04, metalness: 0.25 })
  )
  glass.position.set(0, frY, front + 0.038)
  g.add(glass)
  panel.push(glass)

  // 指针：pivot 在表盘下缘中心，针绕 Z 转
  const pivot = new THREE.Group()
  pivot.position.set(0, H * 0.24, front + 0.042)
  const needle = box(0.016, H * 0.42, 0.007, std('#c0392b', { roughness: 0.35 }), 0, H * 0.21, 0)
  pivot.add(needle)
  // 针尖一小段更细，视觉上才像"针"而不是一根红条
  pivot.add(box(0.008, H * 0.1, 0.006, std('#b03028', { roughness: 0.35 }), 0, H * 0.42, 0))
  g.add(pivot)

  // 剖视时要临时隐掉表盘、贴面和玻璃，否则它们挡在动圈前面，透出来还是白的
  return { group: g, pointer: pivot, shell, inner, panel }
}

/**
 * 滑动变阻器：按 E:\cuag313\physics-lab\public\assets\iconsnewname\11滑线变阻器 .png 做。
 * 真实件没有大平板底座：灰蓝色瓷管由两个银色 U 形夹脚托住，管上密绕亮银电阻丝，
 * 管上方架一根横贯的亮银滑杆，滑片捏着红色手柄左右滑；四个接线柱分列管两端与滑杆两端。
 */
function buildRheostat(w, h, terms = []) {
  const g = new THREE.Group()
  const W = w * SCALE // 1.9
  const shell = []
  const tubeLen = 1.30
  const tubeY = 0.44
  const tubeR = 0.21
  const rodY = 0.86
  const steelMat = std('#c8ced6', { roughness: 0.28, metalness: 0.8 })

  // 瓷管（灰蓝，实物是这种冷灰，不是纯白瓷）
  const tube = cyl(tubeR, tubeR, tubeLen, std('#657080', { roughness: 0.6, metalness: 0.12 }), 30)
  tube.rotation.z = Math.PI / 2
  tube.position.set(0, tubeY, 0)
  shell.push(tube)
  g.add(tube)

  // 密绕电阻丝：图纸上是明显的橙色镍铬丝（暖金），不是冷白灰 —— 冷白灰一眼就不是电阻丝
  const coilMat = std('#d69a4c', { roughness: 0.33, metalness: 0.72 })
  const winding = helixTube(tubeR + 0.012, -tubeLen / 2 + 0.06, tubeLen / 2 - 0.06, 78, 0.009, coilMat)
  winding.rotation.z = -Math.PI / 2
  winding.position.set(0, tubeY, 0)
  winding.castShadow = false
  g.add(winding)

  // 两个 U 形银色夹脚（托住瓷管，替代旧版那块"深灰大平板"）
  for (const sx of [-1, 1]) {
    const xa = sx * 0.52
    // 竖脚
    g.add(box(0.06, 0.34, 0.44, steelMat, xa, 0.19, 0))
    // 底部横脚（贴台面）
    g.add(box(0.10, 0.035, 0.62, steelMat, xa, 0.018, 0))
    // 夹住瓷管的环
    const ring = new THREE.Mesh(new THREE.TorusGeometry(tubeR + 0.014, 0.020, 8, 24), steelMat)
    ring.rotation.y = Math.PI / 2
    ring.position.set(xa, tubeY, 0)
    g.add(ring)
    // 管两端金属端帽（挡丝）
    const endCap = cyl(tubeR + 0.022, tubeR + 0.022, 0.045, steelMat, 24)
    endCap.rotation.z = Math.PI / 2
    endCap.position.set(sx * (tubeLen / 2 + 0.03), tubeY, 0)
    g.add(endCap)
    // 滑杆支座：从管端向上伸到滑杆
    g.add(box(0.04, rodY - tubeY, 0.05, steelMat, sx * 0.80, (rodY + tubeY) / 2, 0))
  }

  // 横贯的滑杆（固定不动的导轨）
  const rail = cyl(0.026, 0.026, 1.66, steelMat, 14)
  rail.rotation.z = Math.PI / 2
  rail.position.set(0, rodY, 0)
  g.add(rail)

  // 内部（剖视露出）：瓷芯 + 两端引线
  const inner = new THREE.Group()
  inner.name = 'rheostat-inner'
  const core = cyl(0.07, 0.07, tubeLen - 0.06, std('#d9dee4', { roughness: 0.85 }), 16)
  core.rotation.z = Math.PI / 2
  core.position.set(0, tubeY, 0)
  inner.add(core)
  inner.add(box(0.06, 0.05, 0.05, MAT.copper(), -tubeLen / 2 + 0.05, tubeY, 0))
  inner.add(box(0.06, 0.05, 0.05, MAT.copper(), tubeLen / 2 - 0.05, tubeY, 0))
  g.add(inner)

  // 滑片：夹块骑在管上 + 顶部滑块扣在滑杆上 + 竖直红手柄。外部只改 position.x。
  const slider = new THREE.Group()
  slider.position.set(0, tubeY, 0)
  slider.add(rbox(0.11, 0.32, 0.46, 0.016, steelMat, 0, 0.0, 0))
  for (const sz of [-1, 1]) {
    slider.add(box(0.07, 0.42, 0.016, std('#a9b0b8', { roughness: 0.35, metalness: 0.6 }), 0, -0.10, sz * 0.15))
  }
  // 连到滑杆的桥
  slider.add(box(0.07, rodY - tubeY + 0.02, 0.07, steelMat, 0, (rodY - tubeY) / 2 + 0.02, 0))
  // 扣在滑杆上的滑块
  slider.add(rbox(0.13, 0.12, 0.14, 0.022, steelMat, 0, rodY - tubeY, 0))
  // 竖直红色胶木手柄
  const handle = cyl(0.030, 0.040, 0.24, MAT.redPlastic(), 14)
  handle.position.set(0, rodY - tubeY + 0.18, 0)
  slider.add(handle)
  g.add(slider)

  // 四柱：滑杆两端（上排）+ 瓷管两端（下排），左负右正
  const postPos = {
    tl: [-0.86, rodY - 0.02, 0],
    tr: [0.86, rodY - 0.02, 0],
    bl: [-0.66, tubeY + 0.10, 0],
    br: [0.66, tubeY + 0.10, 0],
  }
  for (const tm of terms) {
    const p = postPos[tm.id]
    if (!p) continue
    const post = makePost(tm.id, tm.id === 'tl' || tm.id === 'bl')
    post.position.set(p[0], p[1], p[2])
    post.userData.terminal = tm.id
    g.add(post)
  }

  return { group: g, slider, shell, inner }
}

/**
 * 按 TYPES[type].terminals 的像素坐标摆接线柱，位置与
 * three-render 的 attachHotspots 完全一致，保证"看得见的柱"就是"点得到的柱"。
 */
/**
 * 接线柱的白色塑料环座（电池组那种"顶盖上两个大白圆环"的实物特征）。
 * 不挂 userData.terminal —— 热区仍只由 placePosts 的柱决定，避免出现重复命中。
 */
function addTerminalRings(group, terminals, w, h, topY, zClamp) {
  if (!terminals) return
  // 环要略深于顶盖（顶盖是浅灰），否则白环贴在浅色顶面上完全看不出来
  const mat = std('#d5dbe4', { roughness: 0.5 })
  for (const tm of terminals) {
    const x = (tm.x - w / 2) * SCALE
    const raw = (tm.y + 7 - h / 2) * SCALE
    const z = Math.max(-zClamp, Math.min(zClamp, raw))
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.033, 10, 26), mat)
    ring.rotation.x = Math.PI / 2
    ring.position.set(x, topY + 0.014, z)
    ring.castShadow = true
    group.add(ring)
  }
}

function placePosts(group, terminals, w, h, stand, thickness, opts = {}) {
  if (!terminals) return
  for (const tm of terminals) {
    const p = makePost(tm.id)
    const x = (tm.x - w / 2) * SCALE
    if (stand) {
      p.position.set(x, (h - (tm.y + 7)) * SCALE, thickness + 0.03)
      p.rotation.x = Math.PI / 2 // 柱头朝 +Z（从面板向外伸，与表盘同侧）
    } else {
      // zClamp：柱必须落在器材顶面之内。电池组的两个柱在实物上是"顶盖正中"，
      // 按 2D 俯视图的像素 y 换算会算出靠后的位置，这里直接夹到 0（居中）。
      const raw = (tm.y + 7 - h / 2) * SCALE
      const z = opts.zClamp != null
        ? Math.max(-opts.zClamp, Math.min(opts.zClamp, raw))
        : raw
      p.position.set(x, opts.topY != null ? opts.topY : thickness + 0.03, z)
    }
    p.userData.terminal = tm.id
    group.add(p)
  }
}

/**
 * 其余器材的通用实体：底座 + 主体 + 特征件。
 * 目标是"一眼看出是实物"，而不是 SVG 剪影挤出的平板；
 * 接线柱仍由 placePosts 按 TYPES 的像素坐标统一摆，保证点得到的柱就是看得见的柱。
 */

/** 引线类：电阻 / 二极管 / 保险丝 —— 底座 + 水平圆柱 + 特征环 + 铜引线 */
/**
 * 二极管（发光二极管）：基准 TYPES.diode（170×120）。
 * 图纸是"竖立的深绿 PCB 小块 + 左右两块半导体（P 型红 / N 型蓝）+ 中间 PN 结缝
 * + 两根铜引脚引到底座 + 浅灰小底座"，不是一根黑棒子。
 */
function buildDiode(w, h) {
  const g = new THREE.Group()
  const shell = []
  const W = w * SCALE // 1.70
  const baseH = 0.07
  // 浅灰底座
  const base = rbox(W * 0.62, baseH, 0.52, 0.02, std('#cdd4dd', { roughness: 0.55 }), 0, baseH / 2, 0)
  shell.push(base)
  g.add(base)
  // 底座上的黑色丝印块（图纸底部那条"二极管"标签位）
  g.add(box(W * 0.34, 0.012, 0.30, std('#20242a', { roughness: 0.7 }), 0, baseH + 0.006, 0.06))

  // 竖立的深绿 PCB
  const pcbH = 0.50
  const pcbW = 1.06
  const pcbY = baseH + pcbH / 2 + 0.06
  const pcbMat = std('#2c6a5c', { roughness: 0.62, metalness: 0.15 })
  const pcb = box(pcbW, pcbH, 0.035, pcbMat, 0, pcbY, 0)
  shell.push(pcb)
  g.add(pcb)

  // 两块半导体：P 型（红）/ N 型（蓝），中间留一道 PN 结缝
  const blockH = 0.34
  const blockW = 0.42
  for (const [bx, color] of [[-0.24, '#c8463f'], [0.24, '#3a63c8']]) {
    const blk = rbox(blockW, blockH, 0.07, 0.012, std(color, { roughness: 0.42, metalness: 0.2 }), bx, pcbY + 0.02, 0.055)
    shell.push(blk)
    g.add(blk)
  }
  // PN 结位置的一道细亮缝
  g.add(box(0.03, blockH * 0.9, 0.02, std('#e8eef8', { roughness: 0.3, metalness: 0.6 }), 0, pcbY + 0.02, 0.095))

  // 两根铜引脚：从两块半导体底部折到底座上的柱位
  for (const sx of [-1, 1]) {
    const stem = cyl(0.014, 0.014, pcbY - baseH - 0.02, MAT.copper(), 10)
    stem.position.set(sx * 0.24, (pcbY + baseH) / 2 - 0.02, 0.02)
    g.add(stem)
    const foot = cyl(0.014, 0.014, 0.46, MAT.copper(), 10)
    foot.rotation.z = Math.PI / 2
    foot.position.set(sx * 0.44, baseH + 0.02, 0.02)
    g.add(foot)
  }

  return { group: g, thickness: 0.26, stand: false, shell }
}

function buildLeadPart(w, h, kind) {
  if (kind === 'diode') return buildDiode(w, h)
  const g = new THREE.Group()
  const baseH = 0.03
  g.add(box(w * 0.66 * SCALE, baseH, h * 0.26 * SCALE, MAT.darkPlastic(), 0, baseH / 2, 0))

  const r = Math.max(0.03, Math.min(w * 0.075, h * 0.06) * SCALE)
  const len = w * 0.52 * SCALE
  const yBody = baseH + r + 0.012
  const mat = kind === 'fuse' ? MAT.glass() : kind === 'diode' ? MAT.bakelite() : MAT.ceramic()
  const body = cyl(r, r, len, mat, 20)
  body.rotation.z = Math.PI / 2
  body.position.set(0, yBody, 0)
  g.add(body)

  if (kind === 'resistor') {
    const ringMat = [MAT.redPlastic(), MAT.darkPlastic(), MAT.brass(), MAT.bluePlastic()]
    const xs = [-0.30, -0.10, 0.10, 0.30]
    xs.forEach((f, i) => {
      const ring = cyl(r * 1.04, r * 1.04, 0.02, ringMat[i], 18)
      ring.rotation.z = Math.PI / 2
      ring.position.set(len * f, yBody, 0)
      g.add(ring)
    })
  }
  if (kind === 'fuse') {
    for (const f of [-0.5, 0.5]) {
      const cap = cyl(r * 1.1, r * 1.1, len * 0.16, MAT.steel(), 18)
      cap.rotation.z = Math.PI / 2
      cap.position.set(len * f, yBody, 0)
      g.add(cap)
    }
  }
  if (kind === 'diode') {
    const band = cyl(r * 1.06, r * 1.06, 0.018, MAT.steel(), 18)
    band.rotation.z = Math.PI / 2
    band.position.set(len * 0.34, yBody, 0)
    g.add(band)
  }
  for (const f of [-1, 1]) {
    const lead = cyl(0.012, 0.012, len * 0.46, MAT.copper(), 10)
    lead.rotation.z = Math.PI / 2
    lead.position.set(f * len * 0.72, yBody - r * 0.3, 0)
    g.add(lead)
  }
  return { group: g, thickness: yBody + r, stand: false, shell: body }
}

/**
 * 立式面板类器材（电阻箱 / 多用电表）：箱体 + 正面整幅实拍图 + 真旋钮。
 * 老版把它们做成了"矮方盒"（高 20cm、厚 22cm），跟 2D 里 150×204 的立式面板
 * 完全不是一件东西 —— 这是这类器材一直"不像"的根因。
 * 照片是正面平视/轻微斜投影，顶面占比极小，所以整幅贴正面；箱体厚度单独给。
 */
function buildPanelPhoto(w, h, file, depth, o = {}) {
  const g = new THREE.Group()
  const shell = []
  const W = w * SCALE
  const H = h * SCALE
  const D = depth

  // 箱体（深灰胶木）
  const body = box(W, H, D, o.mat || std('#39404a', { roughness: 0.56, metalness: 0.1 }), 0, H / 2, 0)
  shell.push(body)
  g.add(body)
  // 背面/侧面的暗边，让正面图有"嵌在壳里"的感觉（rbox 的参数是 w,h,d,圆角半径,材质,x,y,z）
  g.add(rbox(W * 1.01, H * 1.01, 0.014, 0.02, std('#2b3037', { roughness: 0.7 }), 0, H / 2, -D / 2 + 0.006))

  // 正面实拍图
  const photo = photoFace(file, W * 0.995, H * 0.995, { v0: 0, frac: 1, cut: false })
  if (photo) {
    photo.position.set(0, H / 2, D / 2 + 0.006)
    g.add(photo)
  }

  // 真旋钮（照片上已画着旋钮，真件叠在前面；转得动才有"仪器"的感觉）
  for (const k of o.knobs || []) {
    const kp = new THREE.Group()
    kp.position.set((k.x - 0.5) * W, (1 - k.y) * H, D / 2 + 0.012)
    const rr = k.r * W
    const drum = cyl(rr, rr * 0.9, 0.06, std('#1e2228', { roughness: 0.44, metalness: 0.18 }), 28)
    drum.rotation.x = Math.PI / 2
    drum.position.z = 0.03
    kp.add(drum)
    // 端面指示线（白/银）
    kp.add(box(rr * 0.22, rr * 0.9, 0.005, std('#cdd3db', { roughness: 0.4 }), 0, rr * 0.42, 0.062))
    // 中心小凹点
    g.add(kp)
  }

  return { group: g, shell, panel: photo ? [photo] : [] }
}

/** 方箱类：电阻箱 / 电能表 / 多用电表 / 继电器 / 家庭电源 —— 箱体 + 面板 + 旋钮 / 显示窗 */
function buildBoxUnit(w, h, o = {}) {
  const g = new THREE.Group()
  const W = w * 0.86 * SCALE
  const D = o.depth || 0.22
  const H = o.height || 0.2
  const y0 = 0.015
  const shell = box(W, H, D, o.mat || MAT.bakelite(), 0, y0 + H / 2, 0)
  g.add(shell)

  const panel = box(W * 0.92, H * 0.86, 0.014, o.panelMat || MAT.ceramic(), 0, y0 + H / 2, D / 2 + 0.008)
  g.add(panel)

  const knobs = o.knobs || 0
  for (let i = 0; i < knobs; i++) {
    const kx = W * (-0.28 + (i + 0.5) / Math.max(1, knobs) * 0.56)
    const k = cyl(0.045, 0.05, 0.045, MAT.darkPlastic(), 18)
    k.rotation.x = Math.PI / 2
    k.position.set(kx, y0 + H * 0.42, D / 2 + 0.03)
    g.add(k)
  }
  if (o.lcd) {
    const lc = box(
      W * 0.46,
      H * 0.3,
      0.01,
      std('#123125', { roughness: 0.35, emissive: new THREE.Color('#0d2c1f'), emissiveIntensity: 0.5 }),
      0,
      y0 + H * 0.66,
      D / 2 + 0.018
    )
    g.add(lc)
  }
  return { group: g, thickness: y0 + H + 0.035, stand: false, shell, panel }
}

/**
 * 演示电动机：按实拍图（200×169）重建 ——
 * 木底座 + 立式大皮带轮（5 个通气孔）+ 蹄形磁铁（N 红 / S 蓝）+ 电枢 + 两柱。
 * 原来做的是"躺着的圆柱 + 端盖"，跟照片不是一件东西。
 */
function buildMotor(w, h) {
  const g = new THREE.Group()
  const shell = []
  const W = w * SCALE // 2.0
  const H = h * SCALE // 1.69
  const baseT = 0.13

  // 木底座
  const base = box(W * 0.98, baseT, 1.6, std('#b07a41', { roughness: 0.55, metalness: 0.03 }), 0, baseT / 2, 0)
  shell.push(base)
  g.add(base)

  // 立式皮带轮（盘面朝 +Z）
  const R = H * 0.36
  const cx = -W * 0.22
  const cy = baseT + R + 0.1
  const disc = cyl(R, R, 0.07, std('#2c2f34', { roughness: 0.48, metalness: 0.25 }), 36)
  disc.rotation.x = Math.PI / 2
  disc.position.set(cx, cy, 0.02)
  shell.push(disc)
  g.add(disc)
  // 盘上五个通气孔
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.35
    const hole = cyl(R * 0.19, R * 0.19, 0.01, std('#101215', { roughness: 0.8 }), 16)
    hole.rotation.x = Math.PI / 2
    hole.position.set(cx + Math.cos(a) * R * 0.55, cy + Math.sin(a) * R * 0.55, 0.055)
    g.add(hole)
  }
  // 中心轴帽
  const hub = cyl(R * 0.13, R * 0.13, 0.05, MAT.steel(), 6)
  hub.rotation.x = Math.PI / 2
  hub.position.set(cx, cy, 0.062)
  g.add(hub)
  // 盘背后的立柱
  g.add(box(0.11, R * 1.15, 0.13, std('#2c2f34', { roughness: 0.5 }), cx, baseT + R * 0.58, -0.05))

  // 蹄形磁铁：左 N（红）、右 S（蓝），正面两块板（照片里磁极块接近底座高的一半）
  const mY = baseT + 0.5
  const mW = 0.28
  g.add(box(mW, 0.86, 0.26, std('#bf3a30', { roughness: 0.42 }), W * 0.28, mY, 0.06))
  g.add(box(mW, 0.86, 0.26, std('#2f6cb2', { roughness: 0.42 }), W * 0.28 + mW + 0.06, mY, 0.06))
  // 磁极间电枢：横圆柱 + 铜绕线
  const arm = cyl(0.1, 0.1, mW * 2 + 0.1, std('#c9a227', { roughness: 0.4, metalness: 0.55 }), 20)
  arm.rotation.z = Math.PI / 2
  arm.position.set(W * 0.3 + mW / 2, mY, 0.06)
  g.add(arm)
  // 电枢两端的黑色端环
  for (const sx of [-1, 1]) {
    const ring = cyl(0.105, 0.105, 0.03, std('#2c2f34', { roughness: 0.6 }), 20)
    ring.rotation.z = Math.PI / 2
    ring.position.set(W * 0.3 + mW / 2 + sx * (mW + 0.02), mY, 0.06)
    g.add(ring)
  }

  return { group: g, thickness: baseT, stand: false, shell }
}

/** 焦耳管：底座 + 立式玻璃管 + 管内电阻丝 + 顶盖 */
function buildTube(w, h) {
  const g = new THREE.Group()
  const baseH = 0.03
  g.add(box(w * 0.6 * SCALE, baseH, h * 0.28 * SCALE, MAT.darkPlastic(), 0, baseH / 2, 0))
  const r = Math.min(w * 0.13, h * 0.13) * SCALE
  const H = h * 0.5 * SCALE
  const glass = cyl(r, r, H, MAT.glass(), 26)
  glass.position.set(0, baseH + H / 2, 0)
  g.add(glass)
  for (let i = 0; i < 7; i++) {
    const coil = new THREE.Mesh(
      new THREE.TorusGeometry(r * 0.56, 0.008, 6, 16),
      std('#c1440e', { roughness: 0.5 })
    )
    coil.rotation.x = Math.PI / 2
    coil.position.set(0, baseH + H * (0.28 + i * 0.075), 0)
    g.add(coil)
  }
  const cap = cyl(r * 1.06, r * 1.06, 0.03, MAT.bakelite(), 26)
  cap.position.set(0, baseH + H, 0)
  g.add(cap)
  return { group: g, thickness: 0.1, stand: false, shell: glass }
}

/**
 * 验电器：基准 TYPES.electroscope（130×210，立式）。
 * 图纸是"黑色圆底座 + 高玻璃罩（筒身 + 圆顶）+ 罩顶金属球 + 罩内金属杆 + 两片张开金箔"。
 * 旧版罩只有一半高、玻璃太透明，远看就剩一根杆。
 */
function buildElectroscope(w, h) {
  const g = new THREE.Group()
  const W = w * SCALE   // 1.30
  const H = h * SCALE   // 2.10
  // 黑色胶木底座（带一圈台阶）
  const footH = 0.10
  const foot = cyl(W * 0.30, W * 0.32, footH, MAT.bakelite(), 28)
  foot.position.y = footH / 2
  g.add(foot)

  // 玻璃罩：筒身 + 半球顶（图纸罩高约占整件 0.72）
  const domeH = H * 0.72
  const r = W * 0.30
  const glassMat = MAT.glass()
  glassMat.opacity = 0.24
  const tube = cyl(r, r, domeH, glassMat, 32)
  tube.position.y = footH + domeH / 2
  tube.castShadow = false
  g.add(tube)
  const cap = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), glassMat)
  cap.position.y = footH + domeH
  cap.castShadow = false
  g.add(cap)

  // 罩内金属杆 + 顶部小球 + 底部两片金箔（张开角随电荷变，这里给静态张角）
  const rodH = domeH * 0.62
  const rod = cyl(0.016, 0.016, rodH, MAT.steel(), 12)
  rod.position.y = footH + domeH * 0.58
  g.add(rod)
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), MAT.steel())
  knob.position.y = footH + domeH - 0.02
  g.add(knob)
  for (const f of [-1, 1]) {
    const foil = box(0.010, domeH * 0.30, 0.055,
      std('#e7c65a', { roughness: 0.35, metalness: 0.4 }), f * 0.025, footH + domeH * 0.30, 0)
    foil.rotation.z = f * 0.24
    g.add(foil)
  }
  return { group: g, thickness: 0.20, stand: false, shell: [tube, cap] }
}

/** 试电笔：细长笔杆 + 金属探针 + 氖泡窗 */
function buildTestPencil(w, h) {
  const g = new THREE.Group()
  const len = w * 0.78 * SCALE
  const y = 0.05
  const barrel = cyl(0.035, 0.035, len, std('#e8e4d8', { roughness: 0.5 }), 18)
  barrel.rotation.z = Math.PI / 2
  barrel.position.set(0, y, 0)
  g.add(barrel)
  const tip = cyl(0.014, 0.006, len * 0.22, MAT.steel(), 12)
  tip.rotation.z = Math.PI / 2
  tip.position.set(len * 0.6, y, 0)
  g.add(tip)
  const win = box(len * 0.12, 0.03, 0.05, std('#e2562f', { roughness: 0.4, emissive: new THREE.Color('#4a1206'), emissiveIntensity: 0.6 }), -len * 0.22, y + 0.03, 0.02)
  g.add(win)
  return { group: g, thickness: 0.09, stand: false, shell: barrel }
}

/**
 * 单刀双掷开关：基准 TYPES.switch2（180×130）。
 * 图纸是"黑色 U 形/凹槽底座 + 中间一根绝缘立杆手柄 + 两侧一黑一红静触点立柱"。
 * 旧版只是一块平板加一根横刀，认不出是双掷开关。
 */
function buildSwitch2(w, h) {
  const g = new THREE.Group()
  const shell = []
  const W = w * SCALE   // 1.80
  const D = h * SCALE   // 1.30
  const bw = W * 0.78
  const bd = D * 0.46
  const plateMat = std('#23272d', { roughness: 0.6, metalness: 0.08 })
  const brassMat = MAT.brass()
  const steelMat = std('#c9ced4', { roughness: 0.3, metalness: 0.8 })

  // 底盘
  const plate = rbox(bw, 0.06, bd, 0.018, plateMat, 0, 0.03, 0)
  shell.push(plate)
  g.add(plate)
  // 两侧立起的挡板，形成图纸那种"凹槽"感
  for (const sx of [-1, 1]) {
    const wall = rbox(0.06, 0.20, bd * 0.96, 0.014, plateMat, sx * bw * 0.48, 0.10, 0)
    shell.push(wall)
    g.add(wall)
  }

  // 两侧静触点立柱（左黑右红），顶端带触点帽
  for (const [sx, col] of [[-1, '#1c2026'], [1, '#cf1f22']]) {
    const post = cyl(0.030, 0.030, 0.16, std(col, { roughness: 0.5, metalness: 0.2 }), 14)
    post.position.set(sx * bw * 0.30, 0.14, 0.01)
    g.add(post)
    const capTop = cyl(0.052, 0.052, 0.022, brassMat, 14)
    capTop.position.set(sx * bw * 0.30, 0.235, 0.01)
    g.add(capTop)
  }

  // 中央刀：绕 Y 轴摆向左右，刀头带红色胶木手柄（与 2D 的 pos 语义一致）
  const pivot = new THREE.Group()
  pivot.position.set(-bw * 0.02, 0.235, 0.01)
  const blade = rbox(0.44, 0.022, 0.045, 0.01, steelMat, 0.22, 0, 0)
  pivot.add(blade)
  const handle = cyl(0.030, 0.036, 0.16, MAT.redPlastic(), 14)
  handle.rotation.z = Math.PI / 2
  handle.position.set(0.46, 0.01, 0)
  pivot.add(handle)
  pivot.rotation.y = 0.30
  g.add(pivot)

  return { group: g, thickness: 0.09, stand: false, blade: pivot, shell }
}

/**
 * 保险丝座：实拍图是一个木色方箱（正面印"保险丝"）+ 底部灰台 + 两孔之间横一根保险管。
 * 原来 buildLeadPart 只做了一根裸管，跟实物完全不是一件东西。
 */
function buildFuseBox(w, h) {
  const b = buildPanelPhoto(w, h, 'fuse_c.png', 0.42, { mat: std('#c69f68', { roughness: 0.6, metalness: 0.04 }) })
  const g = b.group
  const W = w * SCALE
  const H = h * SCALE
  const D = 0.42
  const yT = H * 0.52

  // 保险管：半透明玻璃管 + 两端金属帽 + 中间熔丝
  const glassTube = cyl(0.045, 0.045, W * 0.6, std('#d7dde4', { roughness: 0.25, metalness: 0.3, transparent: true, opacity: 0.55 }), 20)
  glassTube.rotation.z = Math.PI / 2
  glassTube.position.set(0, yT, D / 2 + 0.03)
  g.add(glassTube)
  for (const sx of [-1, 1]) {
    const cap = cyl(0.052, 0.052, 0.07, MAT.steel(), 16)
    cap.rotation.z = Math.PI / 2
    cap.position.set(sx * W * 0.3, yT, D / 2 + 0.03)
    g.add(cap)
  }
  g.add(box(W * 0.44, 0.008, 0.008, std('#9aa1aa', { roughness: 0.45, metalness: 0.4 }), 0, yT, D / 2 + 0.03))

  return { group: g, shell: b.shell, panel: b.panel, thickness: D / 2, stand: true }
}

function buildGeneric(type, w, h) {
  if (type.startsWith('resistor')) return buildLeadPart(w, h, 'resistor')
  switch (type) {
    case 'diode':
      return buildLeadPart(w, h, 'diode')
    case 'fuse':
      return buildFuseBox(w, h)
    case 'motor':
      return buildMotor(w, h)
    case 'jouleTube':
      return buildTube(w, h)
    case 'electroscope':
      return buildElectroscope(w, h)
    case 'testPencil':
      return buildTestPencil(w, h)
    case 'switch2':
      return buildSwitch2(w, h)
    case 'resBox': {
      // 电阻箱：150×204 的立式面板箱，四个拨盘旋钮在照片上的位置
      const b = buildPanelPhoto(w, h, 'resbox_c.png', 0.95, {
        knobs: [
          { x: 0.29, y: 0.3, r: 0.16 },
          { x: 0.71, y: 0.3, r: 0.16 },
          { x: 0.29, y: 0.63, r: 0.16 },
          { x: 0.71, y: 0.63, r: 0.16 },
        ],
      })
      const thickness = 0.95 / 2
      return { group: b.group, thickness, stand: true, shell: b.shell, panel: b.panel }
    }
    case 'multimeter': {
      // 多用电表：150×207，中间一个大档位旋钮，底部两插孔
      const b = buildPanelPhoto(w, h, 'multimeter_c.png', 0.55, {
        knobs: [{ x: 0.5, y: 0.56, r: 0.3 }],
      })
      const thickness = 0.55 / 2
      return { group: b.group, thickness, stand: true, shell: b.shell, panel: b.panel }
    }
    case 'relay':
      return buildBoxUnit(w, h, { knobs: 2, height: 0.16 })
    case 'mains':
      return buildBoxUnit(w, h, { knobs: 2, panelMat: MAT.white(), height: 0.14 })
    case 'energyMeter':
      return buildBoxUnit(w, h, { knobs: 2, mat: std('#3a3f47', { roughness: 0.6 }), height: 0.24 })
    default:
      return null
  }
}

/**
 * 造一件实体器材。
 * @param {string} type 器材类型
 * @param {object} opt  { w, h, terminals, fs }
 * @returns {{ group, size, thickness, stand, pointer?, blade?, slider?, bulbMat?, glassMat? }}
 */
export function buildSolid(type, opt = {}) {
  const w = opt.w || 150
  const h = opt.h || 120
  const size = { w, h }
  const terms = opt.terminals || []

  switch (type) {
    case 'battery': {
      // 竖立方箱（与图纸 battery_c.png 同形体）：柱由 buildBattery 按图纸像素摆在顶盖上，
      // 不走 placePosts 的像素换算（那套换算会把柱算到箱体前面，导线端点落在箱壁上）。
      // thickness 给的是"正面到中心"的深度，命中球兜底高度用 postTopY。
      const b = buildBattery(w, h, terms)
      const thickness = 0.53
      return {
        group: b.group, size, thickness, stand: false,
        shell: b.shell, inner: b.inner, panel: b.panel, postTopY: b.postTopY,
      }
    }
    case 'bulb': {
      const b = buildBulb(w, h)
      // 柱脚必须落在底板面上（板厚 0.045），否则柱子会浮在板子上方
      const thickness = 0.045
      placePosts(b.group, terms, w, h, false, thickness)
      return {
        group: b.group, size, thickness, stand: false,
        bulbMat: b.bulbMat, glassMat: b.glassMat, shell: b.shell,
      }
    }
    case 'switch': {
      const b = buildSwitch(w, h)
      const thickness = 0.08 // 瓷板厚：柱脚正好落在板面上
      placePosts(b.group, terms, w, h, false, thickness)
      return {
        group: b.group, size, thickness, stand: false,
        blade: b.blade, setBlade: b.setBlade, shell: b.shell, inner: b.inner,
      }
    }
    case 'ammeter':
    case 'voltmeter': {
      const kind = type === 'ammeter' ? 'A' : 'V'
      const fs = opt.fs || (type === 'ammeter' ? 3 : 15)
      const b = buildMeter(w, h, kind, fs, 30)
      const thickness = 0.18 // 半深：表壳厚 0.36，柱在表面前缘外 0.03
      placePosts(b.group, terms, w, h, true, thickness)
      return {
        group: b.group,
        size,
        thickness,
        stand: true,
        pointer: b.pointer,
        postZ: thickness + 0.03, // 面板朝 +Z，热区/导线端点用同一个 z
        shell: b.shell,
        inner: b.inner,
        panel: b.panel,
      }
    }
    case 'rheostat': {
      // 四柱位置按参考图直接摆在滑杆两端 / 瓷管两端（buildRheostat 内部建）
      const b = buildRheostat(w, h, terms)
      const thickness = 0.07
      return {
        group: b.group, size, thickness, stand: false,
        slider: b.slider, shell: b.shell, inner: b.inner,
      }
    }
    default: {
      // 其余器材：底座 + 主体 + 特征件的通用实体（不再是 SVG 剪影挤出）
      const b = buildGeneric(type, w, h)
      if (!b) return null
      placePosts(b.group, terms, w, h, b.stand === true, b.thickness)
      return b
    }
  }
}

export const SOLID_TYPES = new Set([
  'battery', 'bulb', 'switch', 'ammeter', 'voltmeter', 'rheostat',
  'switch2', 'motor', 'diode', 'fuse', 'testPencil', 'electroscope',
  'mains', 'energyMeter', 'jouleTube', 'resBox', 'multimeter', 'relay',
])
export { SCALE as SOLID_SCALE }

/* ── 侧栏图标：把同一套实体渲染成透明底 PNG ── */
let _iconR = null

/**
 * 渲染一件实体的透明底缩略图，用于 3D 模式下左侧「元件库」的 3D 图标。
 * @param {string} type
 * @param {{w:number,h:number,terminals?:Array,fs?:number,size?:number}} opt
 * @returns {string} dataURL
 */
export function renderIcon(type, opt = {}) {
  const size = opt.size || 132
  if (!_iconR) {
    _iconR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    _iconR.setPixelRatio(1)
  }
  _iconR.setSize(size, size, false)
  _iconR.setClearColor(0x000000, 0)

  const scene = new THREE.Scene()
  scene.add(new THREE.AmbientLight(0xffffff, 1.0))
  const key = new THREE.DirectionalLight(0xffffff, 1.5)
  key.position.set(2.5, 4.5, 3.5)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xffffff, 0.7)
  fill.position.set(-3, 2.5, 1.5)
  scene.add(fill)

  const b = buildSolid(type, opt)
  if (!b) return ''
  scene.add(b.group)

  const bb = new THREE.Box3().setFromObject(b.group)
  const c = bb.getCenter(new THREE.Vector3())
  const sz = bb.getSize(new THREE.Vector3())
  const radius = Math.max(sz.x, sz.y, sz.z) * 0.92 + 0.12

  // 立式表用更正的机位（看清读数），其余用等轴俯视。
  // view:'front' = 正交前视，专供"与 2D 实拍图并排对照"用：照片是正交前视拍的，
  // 用透视俯视去比会永远觉得"不像"，那是机位差异而不是形体差异。
  let cam
  if (opt.view === 'front') {
    const half = Math.max(Math.max(sz.x, 0.05) * 0.5, Math.max(sz.y, 0.05) * 0.5)
    cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.05, 80)
    cam.position.set(c.x, c.y, c.z + 5)
    cam.lookAt(c.x, c.y, c.z)
  } else {
    cam = new THREE.PerspectiveCamera(30, 1, 0.05, 80)
    const dir = b.stand ? new THREE.Vector3(0.18, 0.22, 1) : new THREE.Vector3(0.55, 0.62, 0.85)
    dir.normalize()
    const dist = (radius / Math.sin(((30 * Math.PI) / 180) / 2)) * 0.5 + radius * 0.4
    cam.position.copy(c).add(dir.multiplyScalar(dist))
    cam.lookAt(c)
  }

  _iconR.render(scene, cam)
  const url = _iconR.domElement.toDataURL('image/png')

  // 释放本次临时场景（共享的实拍纹理不能动，否则下一件器材的图会变白板）
  scene.traverse((o) => {
    if (o.geometry) o.geometry.dispose()
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
    for (const m of mats) {
      if (m.map && !m.map.userData.sharedPhoto) m.map.dispose()
      m.dispose()
    }
  })
  return url
}
