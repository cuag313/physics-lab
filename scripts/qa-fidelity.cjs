#!/usr/bin/env node
/**
 * qa-fidelity — 3D 器材 1:1 量化验收脚本
 *
 * 方法（与 器材1比1还原_改造计划 §6 对齐）：
 *   1. 用 tools/contrast.html 同机位渲染「2D 图纸」与「3D front」两格（w×h 像素 = 米）；
 *   2. 逐格像素分析：剪影 mask、红簇（指针/红柱帽）、白盘墨水密度；
 *   3. 量化对比：轮廓 IoU、指针角度 vs 表盘量程、柱位 x 偏移、刻度墨水比。
 *
 * 判定口径（计划 §6）：IoU ≥0.90 及格 / <0.85 不像；柱位 ≤3px(@H)；指针角 ±tol。
 *
 * 用法：
 *   node scripts/qa-fidelity.cjs                 # 跑默认 A 类清单
 *   node scripts/qa-fidelity.cjs ammeterA bulb   # 只跑指定器材
 * 环境变量：
 *   SHOT_URL  对照页所在服务（默认 http://localhost:5173/physics-lab/，需 dev server）
 *   FID_H     对照格高度 px（默认 200）
 * 产出：
 *   audit/fidelity/<type>-{2d,3d-front}.png  并排截图
 *   audit/fidelity/report.json               逐件量化报告
 */
const puppeteer = require('puppeteer-core')
const path = require('path')
const fs = require('fs')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'audit', 'fidelity')
const EDGE = process.env.SHOT_EDGE
  || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const BASE = process.env.SHOT_URL || 'http://localhost:5173/physics-lab/'
const H = Number(process.env.FID_H || 200)

/** 指针量程（deg，相对竖直，正=右偏）。2D 对照页固定 frac=0.42；3D renderIcon 停在零位。 */
const NEEDLE = {
  ammeterA: { base: -23.7, span: 60.7, tol: 3 },
  ammeter: { base: -52, span: 104, tol: 4 },
  voltmeter: { base: -52, span: 104, tol: 4 },
}
const FRAC_2D = 0.42 // contrast.html 里 2D 叠层的 frac

/**
 * 图纸照片视角 → 对照用的 3D 机位（计划 §三 标定表）。
 * 只有跟照片同投影比轮廓才有意义：拿正视去比纯俯视的照片，IoU 必然假低。
 */
const VIEW = {
  switch: 'top', // 图纸是纯俯视（150×105）
}

/** 默认验收清单 = 计划 §三 的 A 类（有实拍图）+ B 类代表件 */
const DEFAULT_TYPES = [
  'ammeterA', 'ammeter', 'voltmeter', 'battery', 'switch',
  'bulb', 'rheostat', 'resBox', 'multimeter', 'fuse', 'motor',
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ────────────────────────── 页内像素分析 ────────────────────────── */

/** 2D 基准剪影：直接读照片 <image> 的 alpha 通道（透明底 PNG）。
 * 合成截图会把照片自带的半透明阴影（alpha 50~100）算成剪影，跟无影的 3D 比必假低。 */
async function analyzePhotoAlpha(page) {
  return page.evaluate(async () => {
    const im = document.querySelector('.row .cell svg image, .row image')
    if (!im) return null
    const href = im.getAttribute('href') || im.getAttribute('xlink:href')
    if (!href) return null
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const W = img.width, Hh = img.height
        const cv = document.createElement('canvas')
        cv.width = W; cv.height = Hh
        const g = cv.getContext('2d', { willReadFrequently: true })
        g.drawImage(img, 0, 0)
        const d = g.getImageData(0, 0, W, Hh).data
        // 只有"四角透明"的抠图 PNG 才用 alpha 当剪影；
        // 白底不透明照片（如俯视开关图）alpha 全 255，整图会变剪影 —— 交回格子剪影处理。
        if (d[3] >= 32) { resolve(null); return }
        const mask = new Uint8Array(W * Hh)
        let x0 = W, y0 = Hh, x1 = -1, y1 = -1, area = 0
        for (let i = 0, p = 3; i < mask.length; i++, p += 4) {
          if (d[p] >= 160) { // 羽化边/半透明阴影（alpha 50~120）不算器材
            mask[i] = 1; area++
            const x = i % W, y = (i / W) | 0
            if (x < x0) x0 = x; if (x > x1) x1 = x
            if (y < y0) y0 = y; if (y > y1) y1 = y
          }
        }
        const N = 64
        const shape64 = new Array(N * N).fill('0')
        if (x1 >= 0) {
          for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
            const x = x0 + (gx + 0.5) / N * (x1 - x0 + 1)
            const y = y0 + (gy + 0.5) / N * (y1 - y0 + 1)
            if (mask[(y | 0) * W + (x | 0)]) shape64[gy * N + gx] = '1'
          }
        }
        resolve({ w: W, h: Hh, bbox: { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, area }, shape64: shape64.join('') })
      }
      img.onerror = () => resolve(null)
      img.src = href
    })
  })
}
/** 在浏览器里把 dataURL 图画进 canvas 后量指标（避免 Node 侧引图片解码依赖） */
async function analyzeDataUrl(page, dataUrl) {
  return page.evaluate((src) => {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const W = img.width, Hh = img.height
        const cv = document.createElement('canvas')
        cv.width = W; cv.height = Hh
        const g = cv.getContext('2d', { willReadFrequently: true })
        g.drawImage(img, 0, 0)
        const d = g.getImageData(0, 0, W, Hh).data

        // 剪影 = 从边界泛洪"背景"后剩下的部分（表盘白面等内洞自动填实）。
        // 背景 = 近白（照片是透明底 PNG，合成到白色页底；3D 格也是白底）。
        // 注意勿按"照片黑底"处理 —— RGB 0,0,0 + alpha=0 是透明，不是黑。
        const bgish = (p) => {
          const r = d[p], gg = d[p + 1], b = d[p + 2]
          const lum = 0.299 * r + 0.587 * gg + 0.114 * b
          return lum >= 230 && Math.max(r, gg, b) - Math.min(r, gg, b) <= 15
        }
        const bgMask = new Uint8Array(W * Hh)
        const q = []
        for (let x = 0; x < W; x++) q.push(x, (Hh - 1) * W + x)
        for (let y = 0; y < Hh; y++) q.push(y * W, y * W + W - 1)
        for (const i of q) if (!bgMask[i] && bgish(i * 4)) { bgMask[i] = 1 }
        while (q.length) {
          const i = q.pop()
          const x = i % W, y = (i / W) | 0
          for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < Hh - 1 ? i + W : -1]) {
            if (j >= 0 && !bgMask[j] && bgish(j * 4)) { bgMask[j] = 1; q.push(j) }
          }
        }
        const mask = new Uint8Array(W * Hh)
        for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
          if (d[p + 3] > 32 && !bgMask[i]) mask[i] = 1
        }
        let x0 = W, y0 = Hh, x1 = -1, y1 = -1, area = 0
        for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
          if (!mask[y * W + x]) continue
          area++
          if (x < x0) x0 = x; if (x > x1) x1 = x
          if (y < y0) y0 = y; if (y > y1) y1 = y
        }
        const bbox = x1 >= 0 ? { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, area } : null

        // 盘区墨水密度：先在剪影内找"近白像素包围盒"（= 表盘/面板区），
        // 再算该区暗像素占比。直接对整个 bbox 统计会把黑色外壳算成"墨水"，
        // 量出来的是壳有多黑，不是刻度清不清（曾经误报"电压表盘 24% vs 44%"）。
        let ink = 0, white = 0
        if (bbox) {
          // 白面搜索只看中上部中心窗口：照片四周的白底/页底也算"近白"，不过滤会把壳又算进来
          const wx0 = bbox.x0 + bbox.w * 0.18, wx1 = bbox.x1 - bbox.w * 0.18
          const wy0 = bbox.y0 + bbox.h * 0.10, wy1 = bbox.y1 - bbox.h * 0.30
          let fx0 = W, fy0 = Hh, fx1 = -1, fy1 = -1
          for (let y = wy0 | 0; y <= wy1; y++) for (let x = wx0 | 0; x <= wx1; x++) {
            const p = (y * W + x) * 4
            const lum = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]
            if (mask[y * W + x] && lum > 195) {
              if (x < fx0) fx0 = x; if (x > fx1) fx1 = x
              if (y < fy0) fy0 = y; if (y > fy1) fy1 = y
            }
          }
          if (fx1 >= 0) {
            for (let y = fy0; y <= fy1; y++) for (let x = fx0; x <= fx1; x++) {
              const p = (y * W + x) * 4
              const lum = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]
              const isRed = d[p] > 130 && d[p + 1] < 95 && d[p + 2] < 95
              if (lum < 150 && !isRed) ink++
              else if (lum > 195) white++
            }
          }
        }
        const inkDensity = white + ink > 0 ? +(ink / (white + ink) * 100).toFixed(1) : 0

        // 红簇（指针 + 红柱帽）：网格 BFS 聚类
        const reds = []
        for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
          const p = (y * W + x) * 4
          if (d[p] > 130 && d[p + 1] < 95 && d[p + 2] < 95) reds.push([x, y])
        }
        const G = 12, cells = new Map()
        for (const [x, y] of reds) {
          const k = ((x / G) | 0) + ',' + ((y / G) | 0)
          if (!cells.has(k)) cells.set(k, [])
          cells.get(k).push([x, y])
        }
        const seen = new Set()
        const clusters = []
        for (const k of cells.keys()) {
          if (seen.has(k)) continue
          const stack = [k]; seen.add(k)
          const pts = []
          while (stack.length) {
            const cur = stack.pop()
            pts.push(...cells.get(cur))
            const [gx, gy] = cur.split(',').map(Number)
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
              const nk = (gx + dx) + ',' + (gy + dy)
              if (cells.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk) }
            }
          }
          if (pts.length < 12) continue
          let cx = 0, cy = 0, mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9
          for (const [x, y] of pts) {
            cx += x; cy += y
            if (x < mnx) mnx = x; if (x > mxx) mxx = x
            if (y < mny) mny = y; if (y > mxy) mxy = y
          }
          clusters.push({
            n: pts.length,
            cx: +(cx / pts.length).toFixed(1), cy: +(cy / pts.length).toFixed(1),
            x0: mnx, y0: mny, x1: mxx, y1: mxy,
          })
        }
        clusters.sort((a, b) => b.n - a.n)

        // 指针角度：上半区最大红簇做 PCA 主轴，返回相对竖直的 deg（正=右偏）。
        // 只取最大簇，避免照片自带印刷针/端子帽混进主轴。
        let needleDeg = null
        if (bbox && clusters.length) {
          // 按**簇顶**判上带：0.55h 以上才算指针区。用 0.75h 会把又大又近的红柱帽
          // 选成"最大簇"（它整簇都在下半部但 y0 恰好压线），针反而被挤掉。
          const upper = clusters.filter((c) => c.n >= 20 && c.y0 < bbox.y0 + bbox.h * 0.55)
          const cl = upper.sort((a, b) => b.n - a.n)[0]
          if (cl) {
            // 簇内可能并进了中柱（指针尾与柱帽投影相邻）：只取分界线以上的针身段做 PCA，
            // 再叠一遍"离轴 ±5px"剔除杂散红点。
            const line = bbox.y0 + bbox.h * 0.62
            const yCut = Math.min(cl.y0 + (cl.y1 - cl.y0) * 0.6, line - 2)
            const band = reds.filter(([x, y]) => x >= cl.x0 && x <= cl.x1 && y >= cl.y0 && y <= yCut)
            if (band.length >= 12) {
            // 两遍 PCA：第一遍估轴并剔掉轴线 ±5px 外的杂散红点（印针残段、噪点），
            // 第二遍用干净点定轴。剔完不足 8 点就退回全量。
            let pts = band
            for (let pass = 0; pass < 2; pass++) {
              let mx = 0, my = 0
              for (const [x, y] of pts) { mx += x; my += y }
              mx /= pts.length; my /= pts.length
              let sxx = 0, syy = 0, sxy = 0
              for (const [x, y] of pts) {
                const dx = x - mx, dy = y - my
                sxx += dx * dx; syy += dy * dy; sxy += dx * dy
              }
              const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy)
              const ax = Math.cos(theta), ay = Math.sin(theta)
              const filtered = pts.filter(([x, y]) => Math.abs((x - mx) * ay - (y - my) * ax) <= 5)
              if (pass === 0) {
                if (filtered.length >= 8) pts = filtered
              } else {
                let vx = ax, vy = ay
                if (vy > 0) { vx = -vx; vy = -vy }
                needleDeg = +(Math.atan2(vx, -vy) * 180 / Math.PI).toFixed(1)
              }
            }
            }
          }
        }

        // 剪影形状 64×64（按 bbox 对齐归一，忽略整体缩放/平移）→ '01' 串
        const N = 64
        const shape64 = new Array(N * N).fill('0')
        if (bbox) {
          for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
            const x = bbox.x0 + (gx + 0.5) / N * bbox.w
            const y = bbox.y0 + (gy + 0.5) / N * bbox.h
            if (mask[(y | 0) * W + (x | 0)]) shape64[gy * N + gx] = '1'
          }
        }

        resolve({ w: W, h: Hh, bbox, inkDensity, clusters, needleDeg, redCount: reds.length, shape64: shape64.join('') })
      }
      img.src = src
    })
  }, dataUrl)
}

/** 剪影 IoU：两侧 64×64 形状网格（页内已按 bbox 归一）逐格比 */
function silhouetteIoU(a, b) {
  if (!a.shape64 || !b.shape64 || !a.bbox || !b.bbox) return 0
  let inter = 0, uni = 0
  for (let i = 0; i < a.shape64.length; i++) {
    const A = a.shape64[i] === '1', B = b.shape64[i] === '1'
    if (A || B) uni++
    if (A && B) inter++
  }
  return uni ? +(inter / uni).toFixed(3) : 0
}

/* ────────────────────────── 主流程 ────────────────────────── */
async function main() {
  const types = process.argv.slice(2).filter((a) => !a.startsWith('-'))
  const list = types.length ? types : DEFAULT_TYPES
  fs.mkdirSync(OUT, { recursive: true })

  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--window-size=1400,1200', '--force-device-scale-factor=1', '--no-sandbox'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1400, height: 1200 })

  const report = { base: BASE, h: H, generatedAt: new Date().toISOString(), items: [] }
  let failCount = 0

  for (const type of list) {
    const view3d = VIEW[type] || 'front'
    const url = `${BASE}tools/contrast.html?t=${encodeURIComponent(type)}&v=${view3d}&h=${H}`
    let def = null
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 })
      await sleep(4200) // 等 GLB 就绪后的 repaint（contrast.html 1.8s timeout + 余量）
      def = await page.evaluate(async (t) => {
        // 动态 import 要带上 Vite base（页面在 /<base>/tools/ 下），否则 404
        const base = location.pathname.replace(/tools\/[^/]*$/, '')
        const mod = await import(base + 'src/lab/scenes/electricSvgInstruments.js')
        const d = mod.TYPES[t]
        return d ? { w: d.w, h: d.h, label: d.label, terminals: d.terminals || [] } : null
      }, type)
      if (!def) {
        console.log(`[${type}] 不在 TYPES 里，跳过`)
        report.items.push({ type, skipped: 'not in TYPES' })
        continue
      }

      // 截 2D / 3D-front 两格（只截 .pic 渲染区，不含下方标题文字）
      const pics = await page.$$('.row[data-type="' + type + '"] .cell .pic')
      const shots = []
      for (let i = 0; i < pics.length && i < 2; i++) {
        const box = await pics[i].boundingBox()
        const file = path.join(OUT, `${type}-${i === 0 ? '2d' : '3d-' + view3d}.png`)
        await page.screenshot({ path: file, clip: { x: box.x, y: box.y, width: box.width, height: box.height } })
        shots.push(file)
      }
      if (shots.length < 2) {
        console.log(`[${type}] 对照格不足（renderIcon 失败？），跳过`)
        report.items.push({ type, skipped: 'contrast cells missing' })
        continue
      }

      // 转 base64 喂给页内分析
      const toDataUrl = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64')
      const a2d = await analyzeDataUrl(page, toDataUrl(shots[0]))
      const a3d = await analyzeDataUrl(page, toDataUrl(shots[1]))
      // 2D 基准剪影优先用照片 alpha（无阴影、无叠层污染）
      const photo2d = await analyzePhotoAlpha(page)

      // ── 指标 ──
      const ref2d = photo2d && photo2d.shape64 ? photo2d : a2d
      const iou = silhouetteIoU(ref2d, a3d)
      const item = {
        type, label: def.label, view3d,
        iou, iouRef: photo2d && photo2d.shape64 ? 'photo-alpha' : 'cell-mask',
        bbox2d: ref2d.bbox, bbox3d: a3d.bbox,
        ink2d: a2d.inkDensity, ink3d: a3d.inkDensity,
        cl3d: a3d.clusters.slice(0, 6),
      }

      // 指针角：3D 停零位、2D 停 frac2d → 各自与"应然角"比
      const nd = NEEDLE[type]
      if (nd && a2d.needleDeg != null && a3d.needleDeg != null) {
        const exp3d = +nd.base.toFixed(1)
        const exp2d = +(nd.base + FRAC_2D * nd.span).toFixed(1)
        item.needle = {
          deg2d: a2d.needleDeg, exp2d,
          deg3d: a3d.needleDeg, exp3d,
          ok: Math.abs(a2d.needleDeg - exp2d) <= nd.tol && Math.abs(a3d.needleDeg - exp3d) <= nd.tol,
        }
      } else if (nd) {
        item.needleMissing = { deg2d: a2d.needleDeg, deg3d: a3d.needleDeg }
      }

      // 柱位（世界坐标，计划 §6 口径 ≤2mm）：直接 buildSolid 读 posts 的世界 x，
      // 与 terminals 像素坐标换算 (px - w/2) * SCALE 比 —— 不经过投影，没有 bbox 归一误差。
      const SCALE = 0.01
      const worldPosts = await page.evaluate(async (type, w, h, terms) => {
        const base = location.pathname.replace(/tools\/[^/]*$/, '')
        const mod = await import(base + 'src/lab/lab3d/solidEquipment.js')
        const b = mod.buildSolid(type, { w, h, terminals: terms })
        return (b && b.posts) ? b.posts.map((p) => ({ id: p.id, x: p.x })) : null
      }, type, def.w, def.h, def.terminals)
      if (worldPosts && worldPosts.length) {
        item.postWorld = worldPosts.map((p) => {
          const tm = def.terminals.find((t) => t.id === p.id)
          const expX = tm ? +((tm.x - def.w / 2) * SCALE).toFixed(4) : null
          return {
            id: p.id, x: +p.x.toFixed(4), expX,
            dxMm: expX != null ? +((p.x - expX) * 1000).toFixed(1) : null,
          }
        })
      }

      // 像素柱位（红帽柱）：只比「红帽柱」。每个红簇配最近的图纸端子。
      // 簇必须**整体**在下带：指针尾部与中柱在投影上相邻会并成一簇，
      // 一旦簇顶伸进上带就说明混了指针点，宁可不报也不报错数。
      const red3d = a3d.clusters.filter((c) => {
        if (!a3d.bbox) return false
        const line = a3d.bbox.y0 + a3d.bbox.h * 0.62
        return c.y0 >= line - 8 && (c.x1 - c.x0) >= 6
      })
      if (red3d.length && def.terminals.length) {
        const bw = a3d.bbox ? a3d.bbox.w : a3d.w
        const bx0 = a3d.bbox ? a3d.bbox.x0 : 0
        item.terminals = red3d.map((c) => {
          const frac = (c.cx - bx0) / bw
          let best = null
          for (const tm of def.terminals) {
            const expFrac = tm.x / def.w
            if (!best || Math.abs(expFrac - frac) < Math.abs(best.expFrac - frac)) best = { tm, expFrac }
          }
          return {
            id: best.tm.id, expFrac: +best.expFrac.toFixed(3), gotFrac: +frac.toFixed(3),
            dxPx: +((frac - best.expFrac) * bw).toFixed(1),
          }
        })
      }

      report.items.push(item)

      // ── 控制台摘要 ──
      const iouTag = iou >= 0.9 ? 'PASS' : iou >= 0.85 ? 'WARN' : 'FAIL'
      if (iouTag === 'FAIL') failCount++
      const rows = [`iou=${iou}(${iouTag})`, `盘墨 ${item.ink2d}%→${item.ink3d}%`]
      if (item.needle) rows.push(`针 ${item.needle.deg2d}°/${item.needle.exp2d}° 3D ${item.needle.deg3d}°/${item.needle.exp3d}°${item.needle.ok ? '' : ' !'}`)
      else if (item.needleMissing) rows.push(`针缺测 2d=${item.needleMissing.deg2d} 3d=${item.needleMissing.deg3d}`)
      if (item.postWorld) {
        const worst = item.postWorld.reduce((m, t) => (t.dxMm != null && Math.abs(t.dxMm) > Math.abs(m || 0) ? t.dxMm : m), 0)
        rows.push(`柱世界偏差 ${worst}mm`)
      }
      if (item.terminals) {
        const worst = item.terminals.reduce((m, t) => (t.dxPx != null && Math.abs(t.dxPx) > Math.abs(m || 0) ? t.dxPx : m), 0)
        rows.push(`柱像素偏差 ${worst}px`)
      }
      console.log(`[${type}] ${rows.join('  ')}`)
    } catch (e) {
      console.log(`[${type}] ERROR: ${e.message}`)
      report.items.push({ type, error: e.message })
    }
  }

  const file = path.join(OUT, 'report.json')
  fs.writeFileSync(file, JSON.stringify(report, null, 2))
  console.log(`\nreport → ${file}`)
  if (failCount) {
    console.log(`轮廓 IoU 判 FAIL 的器材：${failCount} 件（<0.85，计划 §6 口径）`)
    process.exitCode = 1
  }
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
