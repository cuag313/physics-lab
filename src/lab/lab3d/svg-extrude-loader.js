/**
 * svg-extrude-loader.js — 器材 SVG → 3D 薄实体
 *
 * 复用项目现有 SVG 器材资产（electricSvgInstruments.js 的 render() 输出），
 * 不重新绘制器材。管线：
 *   1. prepareSvg()      清洗 SVG：补 xmlns、注入场景同款渐变 defs、隐藏
 *                        .inner/.plabel/.needle（它们各自单独成层）、把 <image href>
 *                        外链图片内联为 base64（SVG-in-<img> 禁止外部资源，离线可跑）。
 *   2. rasterize()       光栅化到 canvas（顶面纹理用，2× 分辨率）。
 *   3. extractInner()    抠出 <g class="inner"> 内部结构层 → 独立 SVG（透视层贴图）。
 *   4. extractNeedle()   抠出 class="needle" 表针规格（枢轴/长度），转成 3D 指针。
 *   5. traceSilhouette() 轮廓追踪（marching squares + 道格拉斯-普克简化）→ THREE.Shape。
 *   6. buildEquipment()  ExtrudeGeometry 挤出薄实体：顶面贴 SVG 纹理、侧面塑料纯色；
 *                        原点强制落在底面中心；拆 outer / inner / pointer 三个子对象。
 *
 * 对外只暴露纯函数与 buildEquipment()，不依赖任何业务模块；
 * three 版本与项目一致（0.18x），用 ESM 标准导入。
 */

import * as THREE from 'three'

/* ─────────────────────────────────────────────────────────────────────
 * 1. SVG 预处理
 * ───────────────────────────────────────────────────────────────────── */

/**
 * 场景同款渐变 defs（ElectricSvgLabScene 的 SVG_DEFS 副本）。
 * render() 输出里引用 url(#es-g-steel) 等渐变，但 defs 在场景的隐藏 <svg> 里，
 * 光栅化时必须随文档一起带上，否则渐变填充全丢。
 */
export const SVG_GRADIENT_DEFS = `
<defs>
<linearGradient id="es-g-zinc" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#e6ebf1"/><stop offset=".35" stop-color="#c3ccd6"/>
  <stop offset=".6" stop-color="#9da9b6"/><stop offset="1" stop-color="#7d8a99"/></linearGradient>
<linearGradient id="es-g-steel" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#f1f5f9"/><stop offset=".4" stop-color="#cbd5e1"/>
  <stop offset=".7" stop-color="#94a3b8"/><stop offset="1" stop-color="#64748b"/></linearGradient>
<linearGradient id="es-g-gold" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#f6d98a"/><stop offset=".45" stop-color="#d9a93a"/>
  <stop offset="1" stop-color="#a2761c"/></linearGradient>
<linearGradient id="es-g-ceramic" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#f7f3e8"/><stop offset=".5" stop-color="#e8e1cf"/>
  <stop offset="1" stop-color="#cfc6ad"/></linearGradient>
<radialGradient id="es-g-glass" cx=".35" cy=".3" r=".85">
  <stop offset="0" stop-color="#ffffff" stop-opacity=".95"/>
  <stop offset=".55" stop-color="#dceaf8" stop-opacity=".55"/>
  <stop offset="1" stop-color="#b6cfe6" stop-opacity=".42"/></radialGradient>
<radialGradient id="es-g-glow" cx=".5" cy=".5" r=".5">
  <stop offset="0" stop-color="#fffde0" stop-opacity=".95"/>
  <stop offset=".45" stop-color="#fde68a" stop-opacity=".72"/>
  <stop offset="1" stop-color="#fbbf24" stop-opacity="0"/></radialGradient>
<linearGradient id="es-g-wood" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#5a6b7b"/><stop offset="1" stop-color="#33414f"/></linearGradient>
</defs>`

/** 外层纹理用样式：隐藏内部结构层 / 标注 / 表针（表针走 3D 指针，不在贴图里画） */
const OUTER_HIDE_STYLE = `
<style>
  .inner{display:none}
  .plabel{display:none}
  .needle{display:none}
  text{font-family:"Microsoft YaHei","PingFang SC",sans-serif}
</style>`

/** 内部结构层样式：.plabel 在场景 CSS 里定义，独立文档需要自带 */
const INNER_LABEL_STYLE = `
<style>
  .plabel{opacity:1;font-size:9.5px;fill:#1d4ed8;font-weight:600;text-anchor:middle}
  text{font-family:"Microsoft YaHei","PingFang SC",sans-serif}
</style>`

/** 文档 URI 正则：href / xlink:href 两种写法都要抓 */
const HREF_RE = /(\shref|\sxlink:href)\s*=\s*("([^"]*)"|'([^']*)')/g

/** 读取文件为 base64 data URL（同源静态资源，离线可用） */
function fileToDataURL(url) {
  return fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error('asset ' + url + ' ' + r.status)
      return r.blob()
    })
    .then(
      (blob) =>
        new Promise((res, rej) => {
          const fr = new FileReader()
          fr.onload = () => res(fr.result)
          fr.onerror = () => rej(fr.error)
          fr.readAsDataURL(blob)
        })
    )
}

/**
 * 清洗 SVG 供独立光栅化：
 *  - 补 xmlns（data:image/svg+xml 必需）
 *  - 注入渐变 defs + 隐藏层样式
 *  - 内联 <image href> 外链（SVG-in-img 不加载外部资源）
 * @param {string} svgString render() 输出
 * @param {object} [opt] {hideInner:boolean}  外层纹理=true；内层纹理=false
 * @returns {Promise<{svg:string,width:number,height:number}>}
 */
export async function prepareSvg(svgString, opt = {}) {
  const hide = opt.hideInner !== false
  let svg = svgString.trim()
  if (!/^<svg[\s>]/.test(svg)) throw new Error('不是 SVG 文档')

  // 宽高（像素），用于 canvas 与轮廓换算
  const wAttr = svg.match(/\swidth="([\d.]+)"/)
  const hAttr = svg.match(/\sheight="([\d.]+)"/)
  const vb = svg.match(/\sviewBox="([\d.\s-]+)"/)
  let width = wAttr ? +wAttr[1] : vb ? +vb[1].trim().split(/\s+/)[2] : 300
  let height = hAttr ? +hAttr[1] : vb ? +vb[1].trim().split(/\s+/)[3] : 150

  // 补命名空间（<img> 解析必需）
  if (!/\sxmlns=/.test(svg)) svg = svg.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"')

  // 内联外链图片（异步、串行避免重复请求）
  const urls = new Set()
  let m
  HREF_RE.lastIndex = 0
  while ((m = HREF_RE.exec(svg))) {
    const u = m[3] !== undefined ? m[3] : m[4]
    if (u && !u.startsWith('data:') && !u.startsWith('#')) urls.add(u)
  }
  for (const u of urls) {
    try {
      const dataURL = await fileToDataURL(u)
      svg = svg.split('"' + u + '"').join('"' + dataURL + '"')
      svg = svg.split("'" + u + "'").join("'" + dataURL + "'")
    } catch (e) {
      // 图片缺失不致命：保持原样，光栅化时该处留空
      console.warn('[svg-extrude] 内联图片失败：', u, e.message)
    }
  }

  // 注入 defs + 样式（放在 <svg ...> 之后，不影响原有内容）
  const inject = SVG_GRADIENT_DEFS + (hide ? OUTER_HIDE_STYLE : INNER_LABEL_STYLE)
  svg = svg.replace(/^<svg[^>]*>/, (head) => head + inject)

  return { svg, width, height }
}

/**
 * 光栅化 SVG → canvas（纹理与轮廓共用）
 * @param {string} svg 已清洗的 SVG 文本
 * @param {number} width 逻辑宽（px）
 * @param {number} height 逻辑高（px）
 * @param {number} [pxScale=2] 放大倍数（贴图清晰度）
 * @returns {Promise<HTMLCanvasElement>}
 */
export function rasterize(svg, width, height, pxScale = 2) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(width * pxScale))
      canvas.height = Math.max(1, Math.round(height * pxScale))
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas)
    }
    img.onerror = () => reject(new Error('SVG 光栅化失败'))
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  })
}

/* ─────────────────────────────────────────────────────────────────────
 * 2. 内层 / 表针提取（同一份 render() 输出拆层）
 * ───────────────────────────────────────────────────────────────────── */

/**
 * 抠出内部结构层 <g class="inner">…</g>，包装成独立 SVG（透视贴图用）。
 * 内层可能含嵌套 <g>（如表头线圈组 <g transform="rotate(…)">），
 * 所以不能按首个 </g> 截断——必须按 <g>/</g> 配平找真正的闭合位置，
 * 否则产出的 SVG 标签不闭合，光栅化会直接失败。
 * @returns {string|null}
 */
export function extractInner(svgString, width, height) {
  const start = svgString.indexOf('<g class="inner"')
  if (start < 0) return null
  const TAG_RE = /<g(?=[\s>])|<\/g>/g
  TAG_RE.lastIndex = start
  let depth = 0
  let end = -1
  let m
  while ((m = TAG_RE.exec(svgString))) {
    if (m[0] === '</g>') depth--
    else depth++
    if (depth === 0) {
      end = m.index + m[0].length
      break
    }
  }
  if (end < 0) return null
  const frag = svgString.slice(start, end)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    SVG_GRADIENT_DEFS + INNER_LABEL_STYLE + frag + '</svg>'
  )
}

/**
 * 抠出表针规格：<line class="needle" x1 y1 x2 y2 …/>。
 * @returns {{x:number,y:number,len:number}|null} 枢轴与针长（px）
 */
export function extractNeedle(svgString) {
  const m = svgString.match(
    /<line class="needle"([^>]*)\/?>/
  )
  if (!m) return null
  const attr = m[1]
  const g = (k) => {
    const r = attr.match(new RegExp('\\s' + k + '="([\\d.-]+)"'))
    return r ? +r[1] : null
  }
  const x1 = g('x1'), y1 = g('y1'), x2 = g('x2'), y2 = g('y2')
  if (x1 == null || y1 == null || x2 == null || y2 == null) return null
  return { x: x1, y: y1, len: Math.hypot(x2 - x1, y2 - y1) }
}

/* ─────────────────────────────────────────────────────────────────────
 * 3. 轮廓追踪（marching squares）
 * ───────────────────────────────────────────────────────────────────── */

/**
 * 从光栅 alpha 通道追踪外轮廓/内孔 → 闭合折线（像素坐标，y 向下）。
 * 步骤：二值化 → 逐格 marching squares 撂边段 → 邻接表串环 →
 *      道格拉斯-普克简化 → 按面积分岛/孔。
 * @param {HTMLCanvasElement} canvas
 * @param {number} [alphaTh=24] 不透明阈值
 * @param {number} [eps=2.2] 简化容差（像素）
 * @returns {{loops:Array<{points:number[][],area:number,isHole:boolean}>}}
 */
export function traceLoops(canvas, alphaTh = 24, eps = 2.2) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const { width: W, height: H } = canvas
  const data = ctx.getImageData(0, 0, W, H).data
  const mask = new Uint8Array(W * H)
  for (let i = 0, p = 3; i < W * H; i++, p += 4) mask[i] = data[p] > alphaTh ? 1 : 0

  // 只有「边界像素」（4 邻域里有背景）才允许当起点：
  // 实心内部的像素当起点会让 Moore 跟踪走出一个错误的环。
  const isEdge = (x, y) =>
    x === 0 || y === 0 || x === W - 1 || y === H - 1 ||
    !mask[y * W + x - 1] || !mask[y * W + x + 1] ||
    !mask[(y - 1) * W + x] || !mask[(y + 1) * W + x]

  // Moore 邻域追踪：8 邻域顺时针，每次从「上一步来向的下一格」开始扫。
  // 相比 marching squares 拼边段再按邻接表串环，它天然保证每条轮廓是
  // 单条闭合链，不会因为邻段选错把整块图形连成一个大三角形。
  const NB = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]]
  const seen = new Uint8Array(W * H)
  const raw = []

  for (let sy = 0; sy < H; sy++) {
    for (let sx = 0; sx < W; sx++) {
      const i0 = sy * W + sx
      if (!mask[i0] || seen[i0] || !isEdge(sx, sy)) continue

      const pts = [[sx + 0.5, sy + 0.5]]
      let cx = sx, cy = sy, dir = 7 // 起始从西侧方向开始扫
      let guard = 0
      let closed = false
      while (guard++ < W * H * 4) {
        let moved = false
        for (let k = 0; k < 8; k++) {
          const d = (dir + k) & 7
          const nx = cx + NB[d][0], ny = cy + NB[d][1]
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
          if (!mask[ny * W + nx]) continue
          cx = nx
          cy = ny
          dir = (d + 6) & 7
          moved = true
          break
        }
        if (!moved) break
        if (cx === sx && cy === sy) { closed = true; break }
        pts.push([cx + 0.5, cy + 0.5])
      }
      if (!closed || pts.length < 8) continue

      // 标记这条轮廓走过的像素，同一圈不要被重复追踪
      for (const [px, py] of pts) {
        const ix = Math.floor(px), iy = Math.floor(py)
        if (ix >= 0 && iy >= 0 && ix < W && iy < H) seen[iy * W + ix] = 1
      }
      seen[i0] = 1
      raw.push(pts)
    }
  }

  // 简化 + 面积过滤（<6×6 px 的碎屑丢掉）
  const out = []
  for (const loop of raw) {
    const pts = rdp(loop, eps)
    if (pts.length < 3) continue
    const area = Math.abs(shoelace(pts))
    if (area < 36) continue
    out.push({ points: pts, area, isHole: false })
  }
  out.sort((a, b) => b.area - a.area)
  return { loops: out }
}

/** 鞋带公式（带符号面积） */
function shoelace(pts) {
  let a = 0
  for (let i = 0, n = pts.length; i < n; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % n]
    a += x1 * y2 - x2 * y1
  }
  return a / 2
}

/** 点在多边形内（射线法） */
function containsPoint(poly, pt) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Ramer–Douglas–Pucker 折线简化 */
function rdp(points, eps) {
  if (points.length < 3) return points.slice()
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack = [[0, points.length - 1]]
  while (stack.length) {
    const [i0, i1] = stack.pop()
    let dmax = 0, idx = -1
    const [x0, y0] = points[i0], [x1, y1] = points[i1]
    const dx = x1 - x0, dy = y1 - y0
    const len2 = dx * dx + dy * dy || 1e-12
    for (let i = i0 + 1; i < i1; i++) {
      const [px, py] = points[i]
      const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len2))
      const d = (px - (x0 + t * dx)) ** 2 + (py - (y0 + t * dy)) ** 2
      if (d > dmax) { dmax = d; idx = i }
    }
    if (idx > 0 && dmax > eps * eps) {
      keep[idx] = 1
      stack.push([i0, idx], [idx, i1])
    }
  }
  const out = []
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i])
  return out
}

/* ─────────────────────────────────────────────────────────────────────
 * 4. 挤出装配
 * ───────────────────────────────────────────────────────────────────── */

/**
 * 器材 SVG → 3D 薄实体。
 *
 * @param {object} p
 * @param {string} p.svgString     TYPES[type].render(c, dyn) 输出
 * @param {number} p.width         器材宽（px，= viewBox 宽）
 * @param {number} p.height        器材高（px）
 * @param {number} [p.scale=0.01]  px → 世界单位
 * @param {number} [p.pxScale=2]   光栅倍数
 * @returns {Promise<{
 *   group:THREE.Group, outer:THREE.Mesh, inner:THREE.Mesh, pointer:THREE.Group|null,
 *   thickness:number, size:{w:number,h:number}, needle:{x,y,len}|null, dispose:()=>void
 * }>}
 */
export async function buildEquipment(p) {
  const { svgString, width, height, scale = 0.01, pxScale = 2 } = p

  // —— 外层：光栅化（隐藏 inner/needle）——
  const outerDoc = await prepareSvg(svgString, { hideInner: true })
  const texCanvas = await rasterize(outerDoc.svg, width, height, pxScale)
  const map = new THREE.CanvasTexture(texCanvas)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 4

  // —— 轮廓：同一张光栅图的 alpha ——
  let shapes = []
  try {
    shapes = shapesFromTrace(texCanvas, width, height)
  } catch (e) {
    console.warn('[svg-extrude] 轮廓追踪失败，退化为包围盒薄板：', e.message)
    shapes = [rectShape(0, 0, width, height, Math.min(width, height) * 0.12)]
  }
  if (!shapes.length) shapes = [rectShape(0, 0, width, height, Math.min(width, height) * 0.12)]

  // —— 挤出 ——
  // 平放类（电池/开关/滑变…）：厚度取短边 ~10%，夹 8~22px，薄实体观感。
  // 立式类（电流表/电压表等真实立式方表）：机身厚度取短边 ~20%（夹 14~34px），
  // 再把整块绕 X 转 90°，让面板竖起来正对相机——真实表是立在桌上的，
  // 不是一片"睡"在桌面上的贴片。
  const stand = !!p.stand
  const bodyPx = stand
    ? Math.max(14, Math.min(34, Math.min(width, height) * 0.2))
    : Math.max(8, Math.min(22, Math.min(width, height) * 0.1))
  const bevel = Math.min(1.6, bodyPx * 0.18)
  let geom
  try {
    geom = new THREE.ExtrudeGeometry(shapes, {
      depth: bodyPx - bevel * 2,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments: 4,
    })
  } catch (e) {
    // 含孔轮廓偶发三角化失败 → 退化为无孔外轮廓
    console.warn('[svg-extrude] 含孔挤出失败，改用外轮廓：', e.message)
    const flat = shapes.map((s) => {
      const r = new THREE.Shape(s.getPoints(24))
      return r
    })
    geom = new THREE.ExtrudeGeometry(flat, {
      depth: bodyPx - bevel * 2,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments: 4,
    })
  }

  // 坐标系：Extrude 在 XY 平面沿 +Z
  geom.rotateX(-Math.PI / 2) // 第一步：面板朝上（平放姿态）
  if (stand) geom.rotateX(-Math.PI / 2) // 第二步：面板朝 -Z（正对默认相机）
  geom.computeBoundingBox()
  const bb = geom.boundingBox
  const W = bb.max.x - bb.min.x
  // 面板平面里的"高度"：平放看 z 轴，立式看 y 轴
  const H = stand ? bb.max.y - bb.min.y : bb.max.z - bb.min.z
  // 面板 UV：u 沿 x；v 沿面板高度，v=1 落在 SVG 顶部
  const pos = geom.attributes.position
  const uv = geom.attributes.uv
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) - bb.min.x) / W
    // 平放：v 沿 z（z 即 SVG 的 y）；立式：几何 y 已被 rotateX(-180) 翻成 -svgY，
    // 故这里反过来用 +y/H 才能让 SVG 顶部落在 v=1。
    const v = stand
      ? (pos.getY(i) - bb.min.y) / H
      : 1 - (pos.getZ(i) - bb.min.z) / H
    uv.setXY(i, u, v)
  }
  uv.needsUpdate = true
  // 原点强制落在底面中心（两种姿态通用：平放的 min.y 在 -depth，立式的 min.y 在 0）
  geom.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2)
  geom.scale(scale, scale, scale)
  geom.computeVertexNormals()

  // —— 材质：顶面纹理（含半透明抠像），侧面塑料纯色（取图平均色压暗）——
  const plastic = averageColor(texCanvas)
  const capMat = new THREE.MeshStandardMaterial({
    map,
    transparent: true,
    alphaTest: 0.1,
    side: THREE.FrontSide,
    roughness: 0.62,
    metalness: 0.02,
  })
  const sideMat = new THREE.MeshStandardMaterial({
    color: plastic,
    roughness: 0.55,
    metalness: 0.05,
    transparent: true,
    opacity: 1,
    alphaTest: 0,
  })
  // three 文档约定：数组材质里 material[0] 用于端面（顶/底），material[1] 用于侧壁。
  // 这里 capMat 必须在前面，否则顶面没有 SVG 纹理，器材只剩一块灰板。
  const outer = new THREE.Mesh(geom, [capMat, sideMat])
  outer.castShadow = true
  outer.receiveShadow = true
  outer.userData.role = 'outer'

  // —— 内部结构层（透视用）——
  let inner = null
  const innerSvg = extractInner(svgString, width, height)
  if (innerSvg) {
    const innerCanvas = await rasterize(innerSvg, width, height, pxScale)
    const innerTex = new THREE.CanvasTexture(innerCanvas)
    innerTex.colorSpace = THREE.SRGBColorSpace
    const innerGeom = new THREE.PlaneGeometry(width * scale, height * scale)
    if (stand) {
      // 立式：面板在 XY 平面，剖视层贴在面板厚度中点（略偏前）
      innerGeom.translate(0, height * scale * 0.5, -(bodyPx * scale) * 0.35)
    } else {
      innerGeom.rotateX(-Math.PI / 2)
      innerGeom.translate(0, bodyPx * scale * 0.55, 0)
    }
    inner = new THREE.Mesh(
      innerGeom,
      new THREE.MeshBasicMaterial({
        map: innerTex,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    )
    inner.visible = false
    inner.userData.role = 'inner'
  }

  // —— 表针（3D 指针，角度由求解结果驱动）——
  let pointer = null
  const needle = extractNeedle(svgString)
  if (needle && needle.len > 4) {
    pointer = new THREE.Group()
    pointer.userData.role = 'pointer'
    pointer.userData.stand = stand ? 1 : 0
    // 指针截面：按 px 定尺寸（约 1.5px 宽），再换算到世界单位。
    // 注意不能再写 Math.max(1.1, …)—— 那会把 1.1 世界单位当成下限，
    // 比整台器材还粗，渲染出来是一块红板。
    const pw = Math.max(0.011, width * scale * 0.012)
    const lenW = needle.len * scale
    // 平放姿态：针体沿 -Z 平伸；立式姿态：针体沿 +Y 在面板平面内竖着伸
    const nGeom = stand
      ? new THREE.BoxGeometry(pw, lenW, pw * 0.55)
      : new THREE.BoxGeometry(pw, pw * 0.55, lenW)
    if (stand) nGeom.translate(0, lenW / 2, 0)
    else nGeom.translate(0, 0, -lenW / 2)
    const nMesh = new THREE.Mesh(
      nGeom,
      new THREE.MeshStandardMaterial({ color: '#e11d48', roughness: 0.45, metalness: 0.1 })
    )
    nMesh.castShadow = true
    pointer.add(nMesh)
    // 小配重尾
    const tail = new THREE.Mesh(
      stand
        ? new THREE.BoxGeometry(pw * 1.3, lenW * 0.18, pw * 0.5)
        : new THREE.BoxGeometry(pw * 1.3, pw * 0.5, lenW * 0.18),
      new THREE.MeshStandardMaterial({ color: '#8d96a1', roughness: 0.5 })
    )
    if (stand) tail.position.y = -lenW * 0.09
    else tail.position.z = lenW * 0.09
    pointer.add(tail)
    if (stand) {
      // 立式：枢轴贴在面板表面外侧（面板朝 -Z，机身占 z ∈ [-th, 0]），
      // 高度按 SVG 的 y 换算。必须真的浮在面板之外，否则会被面板挡住。
      pointer.position.set(
        (needle.x - width / 2) * scale,
        (height - needle.y) * scale,
        -(bodyPx * scale) - 0.02
      )
    } else {
      pointer.position.set(
        (needle.x - width / 2) * scale,
        bodyPx * scale + pw * 0.42,
        (needle.y - height / 2) * scale
      )
    }
  }

  const group = new THREE.Group()
  group.add(outer)
  if (inner) group.add(inner)
  if (pointer) group.add(pointer)

  return {
    group,
    outer,
    inner,
    pointer,
    thickness: bodyPx * scale,
    stand,
    size: { w: width * scale, h: height * scale },
    needle,
    dispose() {
      geom.dispose()
      map.dispose()
      if (inner) {
        inner.geometry.dispose()
        inner.material.map.dispose()
        inner.material.dispose()
      }
      if (pointer) {
        pointer.traverse((o) => {
          if (o.geometry) o.geometry.dispose()
          if (o.material) o.material.dispose()
        })
      }
      capMat.dispose()
      sideMat.dispose()
    },
  }
}

/** 轮廓追踪结果 → THREE.Shape（px 坐标，y 翻转为向上） */
function shapesFromTrace(canvas, width, height) {
  const { loops } = traceLoops(canvas)
  if (!loops.length) return []

  // 轮廓是在 pxScale（默认 2×）的光栅坐标里走的，必须缩回器材逻辑尺寸，
  // 否则挤出的实体尺寸翻倍、厚度相对变薄，看上去就是一张纸片。
  const sx = width / canvas.width
  const sy = height / canvas.height

  const maxArea = loops[0].area
  const keep = []
  for (const l of loops) {
    if (l.area < maxArea * 0.05) break // 已按面积降序，后面只会更小
    if (keep.some((k) => bboxContained(k.points, l.points))) continue // 内边界轮廓，跳过
    keep.push(l)
    if (keep.length >= 3) break
  }

  const shapes = []
  for (const isl of keep) {
    const pts = isl.points.map(([x, y]) => new THREE.Vector2(x * sx, -y * sy))
    try {
      shapes.push(new THREE.Shape(pts))
    } catch (e) { /* 忽略非法轮廓 */ }
  }
  return shapes
}

/** 点集的包围盒 */
function bboxOf(pts) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const [x, y] of pts) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { minX, maxX, minY, maxY }
}

/** inner 的包围盒是否被 outer 的包围盒包住（判断内边界轮廓） */
function bboxContained(outer, inner) {
  const A = bboxOf(outer), B = bboxOf(inner)
  return B.minX >= A.minX - 1 && B.maxX <= A.maxX + 1 && B.minY >= A.minY - 1 && B.maxY <= A.maxY + 1
}

/** 圆角矩形轮廓（降级方案） */
function rectShape(x, y, w, h, r) {
  const s = new THREE.Shape()
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

/** 采样不透明像素平均色 → 塑料侧面色（压暗 12%） */
function averageColor(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const { width: W, height: H } = canvas
  const d = ctx.getImageData(0, 0, W, H).data
  let r = 0, g = 0, b = 0, n = 0
  for (let i = 0, p = 0; i < W * H; i++, p += 4) {
    if (d[p + 3] < 32) continue
    r += d[p]; g += d[p + 1]; b += d[p + 2]; n++
  }
  if (!n) return new THREE.Color('#9aa3ad')
  return new THREE.Color(
    Math.min(255, (r / n) * 0.88) / 255,
    Math.min(255, (g / n) * 0.88) / 255,
    Math.min(255, (b / n) * 0.88) / 255
  )
}
