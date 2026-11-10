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
 * 注：fitInner 生成的 inner 组内没有嵌套 <g>，首个 </g> 即闭合。
 * @returns {string|null}
 */
export function extractInner(svgString, width, height) {
  const m = svgString.match(/<g class="inner"[\s\S]*?<\/g>/)
  if (!m) return null
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    SVG_GRADIENT_DEFS + INNER_LABEL_STYLE + m[0] + '</svg>'
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

  // 角位：TL=1 TR=2 BR=4 BL=8；边点 L/T/R/B 为格边中点（整数*2 存键避免浮点误差）
  const CASES = [
    [], [['L', 'T']], [['T', 'R']], [['L', 'R']],
    [['R', 'B']], [['L', 'T'], ['R', 'B']], [['T', 'B']], [['L', 'B']],
    [['B', 'L']], [['T', 'B']], [['T', 'R'], ['B', 'L']], [['R', 'B']],
    [['L', 'R']], [['T', 'R']], [['L', 'T']], [],
  ]
  const posOf = (x, y, side) =>
    side === 'L' ? [x, y + 0.5] : side === 'T' ? [x + 0.5, y] : side === 'R' ? [x + 1, y + 0.5] : [x + 0.5, y + 1]

  // 邻接表（点 → 点集合，支持重边）
  const adj = new Map()
  const ptMap = new Map()
  const pkey = (p) => (p[0] * 2) + ',' + (p[1] * 2)
  const addEdge = (a, b) => {
    const ka = pkey(a), kb = pkey(b)
    if (ka === kb) return
    if (!adj.has(ka)) adj.set(ka, [])
    if (!adj.has(kb)) adj.set(kb, [])
    adj.get(ka).push(kb)
    adj.get(kb).push(ka)
    ptMap.set(ka, a)
    ptMap.set(kb, b)
  }

  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const tl = mask[y * W + x], tr = mask[y * W + x + 1]
      const br = mask[(y + 1) * W + x + 1], bl = mask[(y + 1) * W + x]
      const idx = tl | (tr << 1) | (br << 2) | (bl << 3)
      for (const [s1, s2] of CASES[idx]) addEdge(posOf(x, y, s1), posOf(x, y, s2))
    }
  }

  // 走环：反复取未用边，直到回到起点
  const takeEdge = (a, b) => {
    const ka = pkey(a), kb = pkey(b)
    const la = adj.get(ka)
    if (!la) return false
    const i = la.indexOf(kb)
    if (i < 0) return false
    la.splice(i, 1)
    const lb = adj.get(kb)
    const j = lb.indexOf(ka)
    if (j >= 0) lb.splice(j, 1)
    return true
  }
  const loops = []
  for (const [k0] of adj) {
    while (adj.get(k0) && adj.get(k0).length) {
      const start = ptMap.get(k0)
      const loop = [start]
      let prev = start
      let cur = ptMap.get(adj.get(k0)[0])
      takeEdge(start, cur)
      let guard = 0
      while (guard++ < W * H * 4) {
        loop.push(cur)
        const nbrs = adj.get(pkey(cur))
        if (!nbrs || !nbrs.length) break
        let next = null
        for (const nk of nbrs) {
          const cand = ptMap.get(nk)
          // 不走回头路（除非只剩回头边）
          if (!(cand[0] === prev[0] && cand[1] === prev[1])) { next = cand; break }
        }
        if (!next) next = ptMap.get(nbrs[0])
        if (!takeEdge(cur, next)) break
        prev = cur
        cur = next
        if (cur[0] === start[0] && cur[1] === start[1]) break
      }
      if (loop.length >= 4) loops.push(loop)
    }
  }

  // 简化 + 面积/岛孔分类
  const out = []
  for (const loop of loops) {
    const pts = rdp(loop, eps)
    if (pts.length < 3) continue
    const area = shoelace(pts)
    if (Math.abs(area) < 36) continue // 忽略碎屑（<6×6 px）
    out.push({ points: pts, area, isHole: false })
  }
  // 面积符号（像素坐标 y 向下）：正 = 逆时针视觉 = 岛；负 = 孔。
  // 用包围盒包含关系修正：小环被大环包住且符号相反 → 孔。
  out.sort((a, b) => Math.abs(b.area) - Math.abs(a.area))
  for (let i = 0; i < out.length; i++) {
    for (let j = 0; j < i; j++) {
      if (out[j].isHole) continue
      if (Math.abs(out[i].area) > Math.abs(out[j].area) * 0.92) continue
      if (containsPoint(out[j].points, out[i].points[0])) {
        // 与外环同向 = 岛中岛（独立实体）；反向 = 孔
        out[i].isHole = Math.sign(out[i].area) !== Math.sign(out[j].area)
        break
      }
    }
  }
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

  // —— 挤出：厚度取短边 ~10%（薄实体观感），夹在 8~22px ——
  const thicknessPx = Math.max(8, Math.min(22, Math.min(width, height) * 0.1))
  const bevel = Math.min(1.6, thicknessPx * 0.18)
  let geom
  try {
    geom = new THREE.ExtrudeGeometry(shapes, {
      depth: thicknessPx - bevel * 2,
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
      depth: thicknessPx - bevel * 2,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments: 4,
    })
  }

  // 坐标系：Extrude 在 XY 平面沿 +Z；旋转后 x=svgX、z=svgY、y=高度
  geom.rotateX(-Math.PI / 2)
  geom.computeBoundingBox()
  const bb = geom.boundingBox
  const W = bb.max.x - bb.min.x
  const H = bb.max.z - bb.min.z
  // 顶面 UV：u=(x-minX)/W，v=1-(z-minZ)/H（贴图 v=1 在 SVG 顶部）
  const pos = geom.attributes.position
  const uv = geom.attributes.uv
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) - bb.min.x) / W, 1 - (pos.getZ(i) - bb.min.z) / H)
  }
  uv.needsUpdate = true
  // 原点强制落在底面中心
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
    innerGeom.rotateX(-Math.PI / 2)
    innerGeom.translate(0, thicknessPx * scale * 0.55, 0)
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
    const pw = Math.max(1.1, width * scale * 0.012)
    const nGeom = new THREE.BoxGeometry(pw, pw * 0.55, needle.len * scale)
    // 针体从枢轴伸向 -Z（SVG 上方），枢轴对齐原点
    nGeom.translate(0, 0, (-needle.len * scale) / 2)
    const nMesh = new THREE.Mesh(
      nGeom,
      new THREE.MeshStandardMaterial({ color: '#e11d48', roughness: 0.45, metalness: 0.1 })
    )
    nMesh.castShadow = true
    pointer.add(nMesh)
    // 小配重尾
    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(pw * 1.3, pw * 0.5, needle.len * scale * 0.18),
      new THREE.MeshStandardMaterial({ color: '#8d96a1', roughness: 0.5 })
    )
    tail.position.z = needle.len * scale * 0.09
    pointer.add(tail)
    pointer.position.set(
      (needle.x - width / 2) * scale,
      thicknessPx * scale + pw * 0.42,
      (needle.y - height / 2) * scale
    )
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
    thickness: thicknessPx * scale,
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
  const islands = loops.filter((l) => !l.isHole)
  const holes = loops.filter((l) => l.isHole)
  if (!islands.length) return []
  const maxArea = Math.abs(islands[0].area)
  const keepIslands = islands.filter((l) => Math.abs(l.area) > maxArea * 0.045)

  const shapes = []
  for (const isl of keepIslands) {
    const pts = isl.points.map(([x, y]) => new THREE.Vector2(x, -y))
    const shape = new THREE.Shape(pts)
    // 配孔：孔须完全落在该岛内（取孔首点判定），且面积不太大
    for (const hl of holes) {
      if (Math.abs(hl.area) > maxArea * 0.85) continue
      if (!containsPoint(isl.points, hl.points[0])) continue
      if (hl.isHole === false) continue
      try {
        shape.holes.push(new THREE.Path(hl.points.map(([x, y]) => new THREE.Vector2(x, -y))))
      } catch (e) { /* 忽略非法孔 */ }
    }
    shapes.push(shape)
  }
  return shapes
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
