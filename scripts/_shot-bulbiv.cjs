/* 测绘小灯泡伏安特性曲线：Tab1 四步 + Tab2 分压实验台 截图核对 */
const fs = require('fs')
const puppeteer = require('puppeteer-core')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const OUT = 'audit/bulbiv'
const BASE = process.env.SHOT_BASE || 'http://localhost:5173/physics-lab/'

const GEO = `(() => {
  const cv = document.querySelector('.scene-main canvas')
  if (!cv) return null
  const r = cv.getBoundingClientRect()
  const W = cv.clientWidth, H = cv.clientHeight
  const compact = W < 980 || H < 540
  const panelW = compact ? 0 : Math.max(318, Math.min(W * 0.30, 460))
  const panelX = W - 12 - 46 - panelW
  const b = { x: 12, y: 10, w: compact ? W - 24 : panelX - 24, h: H - 20 }
  const k = Math.max(0.62, Math.min(1.28, Math.min(b.w / 1040, b.h / 760)))
  const pad = 14, pillH = Math.round(30 * k), gap = 8
  const pillW = Math.min(190 * k, (b.w - pad * 2 - gap * 3) / 4)
  const pills = [0,1,2,3].map(i => ({ x: r.left + b.x + pad + i * (pillW + gap) + pillW / 2, y: r.top + b.y + 12 + pillH / 2 }))
  const dpw = compact ? 0 : Math.min(330, b.w * 0.31)
  const dp = dpw ? { x: b.x + b.w - pad - dpw, y: b.y + 30 * k, w: dpw, h: b.h - 42 * k } : null
  const circ = { x: b.x + pad, y: b.y + 30 * k, w: b.w - pad * 2 - (dp ? dpw + 16 : 0), h: b.h - 42 * k }
  // Tab1 内容区 + 迷你电路「开始演示」按钮
  const theo = { x: b.x + 14, y: b.y + 12 + pillH + 12 * k + 14 * k, w: b.w - 28 }
  theo.h = b.y + b.h - theo.y - 10
  const cardH = 452 * k
  const colW = (theo.w - 16 * k) / 2
  const chipY = theo.y + 2 * k + cardH + 10 * k
  const noteY = chipY + 36 * k
  const demoBtnY = noteY + 15 * k
  const demoBtnW = Math.min(212 * k, colW * 0.56)
  const demo = { x: r.left + theo.x + demoBtnW / 2, y: r.top + demoBtnY + 14 * k }
  // ① 电路里的开关（bottom rail y=392k）与滑变（y=310k）
  const gSwY = theo.y + 2 * k + 392 * k
  const gBarY = theo.y + 2 * k + 310 * k
  const metW = Math.max(104, Math.min(178 * k, circ.w * 0.205))
  const metH = metW * 0.80
  const busB = circ.y + circ.h - 168 * k
  const batW = Math.min(168 * k, circ.w * 0.22)
  const swW = Math.min(84 * k, circ.w * 0.11)
  const rheoW = Math.min(244 * k, circ.w * 0.32)
  const batX = circ.x + 10 * k + batW / 2
  const swX = batX + batW / 2 + 28 * k + swW / 2
  const rheoX = circ.x + circ.w - 18 * k - rheoW * 0.42
  const t0 = rheoX - rheoW * 0.42, t1 = rheoX + rheoW * 0.42
  const btnY = circ.y + circ.h - 34 * k, btnH = 28 * k
  const tot = 100 * k + 8 * k + 118 * k + 8 * k + 74 * k + 8 * k
  let bx = circ.x + circ.w - tot + 8 * k
  const b1 = { x: r.left + bx + 50 * k, y: r.top + btnY + btnH / 2 }; bx += 100 * k + 8 * k
  const b2 = { x: r.left + bx + 59 * k, y: r.top + btnY + btnH / 2 }; bx += 118 * k + 8 * k
  const b3 = { x: r.left + bx + 37 * k, y: r.top + btnY + btnH / 2 }
  const wiper = { x0: r.left + t0, x1: r.left + t1, y: r.top + busB - 40 * k }
  const sw = { x: r.left + swX, y: r.top + busB - 20 * k }
  // 面板里的图表药丸：8 组数据时 y = dp.y + 252
  const pillYW = dp ? dp.y + 22 + 20 + 22 + 24 + 8 * 20 + 4 : 0
  const chartPills = dp ? [0, 1].map(i => ({
    x: r.left + dp.x + 14 + i * (66 * k + 6 * k) + 33 * k, y: r.top + pillYW + 12 * k,
  })) : []
  return {
    rect: { left: r.left, top: r.top, w: W, h: H }, k, compact, circ, dp,
    pills, record: b1, auto: b2, clear: b3, wiper, sw, chartPills, demo,
    goal: { swY: gSwY, barY: gBarY, colW },
  }
})()`

/* 直接读场景自己登记的点击区（canvas._clickAreas）—— 版式一改，这里跟着自动对，不再靠脚本自己猜坐标 */
const pickAreas = (p) => p.evaluate(() => {
  const cv = document.querySelector('.scene-main canvas')
  const r = cv.getBoundingClientRect()
  const list = (cv._clickAreas || []).map((a) => ({
    ax: a.x, ay: a.y, w: a.w, h: a.h, drag: !!a.onDrag, click: !!a.onClick,
    x: r.left + a.x + a.w / 2, y: r.top + a.y + a.h / 2,
    x0: r.left + a.x, x1: r.left + a.x + a.w,
  }))
  const bar = list.filter((a) => a.ay > 840).sort((m, n) => m.ax - n.ax) // 底部三键：记录 / 一键描八点 / 清空
  const sw = list.find((a) => !a.drag && a.w > 120 && a.w < 240 && a.ay > 560 && a.ay < 800) // 开关
  const wr = list.find((a) => a.drag) // 滑片
  const pills = list.filter((a) => a.ay < 360 && a.w > 55 && a.w < 95 && !a.drag).sort((m, n) => m.ax - n.ax) // U-I / R-U
  return { bar, sw, wr, pills, n: list.length }
})

/* 状态驱动：直接调场景登记的 onClick / onDrag —— 不依赖鼠标坐标，截图状态稳定可复现 */
const tapArea = (p, kind) => p.evaluate((kind) => {
  const cv = document.querySelector('.scene-main canvas')
  const list = cv._clickAreas || []
  const bar = list.filter((a) => a.y > 840).sort((m, n) => m.x - n.x)
  const pills = list.filter((a) => a.y < 360 && a.w > 55 && a.w < 95 && !a.onDrag).sort((m, n) => m.x - n.x)
  const a = {
    switch: list.find((z) => !z.onDrag && z.w > 120 && z.w < 240 && z.y > 560 && z.y < 800),
    record: bar[0], auto: bar[1], clear: bar[2], iv: pills[0], ru: pills[1],
  }[kind]
  if (!a) return `miss:${kind}`
  a.onClick(a.x + a.w / 2, a.y + a.h / 2)
  return `ok:${kind}`
}, kind)

/* ① 电路里的手动手：kind='sw' 点开关，kind='bar' 拖滑片 */
const tapGoal = (p, kind, val = 0) => p.evaluate(({ kind, val }) => {
  const cv = document.querySelector('.scene-main canvas')
  const list = cv._clickAreas || []
  const a = kind === 'sw'
    ? list.find((z) => z.onClick && !z.onDrag && z.w < 120)
    : list.find((z) => z.onDrag)
  if (!a) return `miss:${kind}`
  if (kind === 'sw') a.onClick(a.x + a.w / 2, a.y + a.h / 2)
  else a.onDrag(a.x + 6 + (a.w - 12) * val)
  return `ok:${kind}`
}, { kind, val })

const slideArea = (p, ratio) => p.evaluate((ratio) => {
  const cv = document.querySelector('.scene-main canvas')
  const a = (cv._clickAreas || []).find((z) => z.onDrag)
  if (!a) return 'miss:drag'
  a.onDrag(a.x + 9 + (a.w - 18) * ratio)
  return `ok:r=${ratio}`
}, ratio)

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const b = await puppeteer.launch({ executablePath: EDGE, headless: 'new' })
  const p = await b.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
  await p.setViewport({ width: 1680, height: 1000, deviceScaleFactor: 2 })
  await p.goto(BASE, { waitUntil: 'networkidle2' })
  await sleep(900)
  await p.evaluate(() => { const e = [...document.querySelectorAll('.category-tab')].find((x) => x.innerText.includes('电学')); if (e) e.click() })
  await sleep(600)
  await p.evaluate(() => {
    const d = [...document.querySelectorAll('div')].filter((x) => x.innerText.trim() === '测绘小灯泡伏安特性曲线')
    if (d.length) d[d.length - 1].click()
  })
  await sleep(1500)
  const geo = await p.evaluate(GEO)
  console.log('GEO', JSON.stringify(geo))
  if (!geo) { console.log('canvas not found'); await b.close(); return }

  await p.screenshot({ path: `${OUT}/t1-s1-goal.png` })
  // ① 演示动画：点「开始演示」，中段与结束时各拍一张
  await p.mouse.click(geo.demo.x, geo.demo.y)
  await sleep(3600)
  await p.screenshot({ path: `${OUT}/t1-s1-demo.png` })
  await sleep(6000)
  await p.screenshot({ path: `${OUT}/t1-s1-done.png` })
  // ① 手动手：先断开开关（读数归零、灯灭），再合上手动把滑片拖到 62%
  console.log('goal', await tapGoal(p, 'sw'))
  await sleep(600)
  await p.screenshot({ path: `${OUT}/t1-s1-switchoff.png` })
  console.log('goal', await tapGoal(p, 'sw'))
  await sleep(300)
  console.log('goal', await tapGoal(p, 'bar', 0.62))
  await sleep(700)
  await p.screenshot({ path: `${OUT}/t1-s1-hand.png` })
  for (const [idx, name] of [[1, 't1-s2-wiring'], [2, 't1-s3-record'], [3, 't1-s4-curve']]) {
    await p.mouse.click(geo.pills[idx].x, geo.pills[idx].y)
    await sleep(idx === 2 ? 3600 : 800)
    await p.screenshot({ path: `${OUT}/${name}.png` })
    if (idx === 1) {
      // ② 也要能动手：拖滑片（灯亮、读数变）→ 点开关断开（读数归零）
      console.log('wiring', await tapGoal(p, 'bar', 0.62))
      await sleep(600)
      await p.screenshot({ path: `${OUT}/t1-s2-wiring-live.png` })
      console.log('wiring', await tapGoal(p, 'sw'))
      await sleep(500)
      await p.screenshot({ path: `${OUT}/t1-s2-wiring-off.png` })
      console.log('wiring', await tapGoal(p, 'sw'))
      await sleep(300)
    }
  }

  // Tab2
  await p.evaluate(() => { const t = [...document.querySelectorAll('.scene-tab')].find((x) => x.innerText.includes('测量实验')); if (t) t.click() })
  await sleep(900)
  // 归一化状态：一键描八点（必然合上开关）→ 清空（保留闭合、只清数据点），
  // 这样后续截图不再依赖"从 Tab1 带过来的开关姿态"
  console.log('norm', await tapArea(p, 'auto'))
  await sleep(900)
  console.log('norm', await tapArea(p, 'clear'))
  await sleep(400)
  // a：滑片最右（R 最大、灯最暗）、开关断开（面板初始态）
  console.log(await slideArea(p, 1))
  await sleep(300)
  console.log(await tapArea(p, 'switch'))
  await sleep(700)
  await p.screenshot({ path: `${OUT}/t2-a-bench-off.png` })
  const A = await pickAreas(p)
  console.log('T2AREAS', JSON.stringify(A))
  // 冷态直接上高压（不记录任何点，滑片先推到最左 R = 0 再合开关）
  console.log(await slideArea(p, 0.02))
  await sleep(400)
  console.log(await tapArea(p, 'switch'))
  await sleep(700)
  await p.screenshot({ path: `${OUT}/t2-cold.png` })
  // 复位：断开开关、滑片回阻值最大处（限流接法的初始状态）
  console.log(await tapArea(p, 'switch'))
  console.log(await slideArea(p, 1))
  await sleep(300)
  console.log(await tapArea(p, 'switch'))
  await sleep(700)
  await p.screenshot({ path: `${OUT}/t2-b-closed.png` })
  console.log(await tapArea(p, 'auto'))
  await sleep(900)
  await p.screenshot({ path: `${OUT}/t2-c-eight.png` })
  console.log(await tapArea(p, 'ru'))
  await sleep(800)
  await p.screenshot({ path: `${OUT}/t2-d-ru.png` })
  console.log(await tapArea(p, 'iv'))
  await sleep(500)
  // 滑到低电压段（R 大 → 灯端电压低），记一点
  console.log(await slideArea(p, 0.85))
  await sleep(500)
  console.log(await tapArea(p, 'record'))
  await sleep(700)
  await p.screenshot({ path: `${OUT}/t2-e-low.png` })

  // 窄屏
  await p.setViewport({ width: 1200, height: 700, deviceScaleFactor: 2 })
  await sleep(900)
  await p.screenshot({ path: `${OUT}/compact.png` })
  // 窄屏：Tab1 ② 电路图
  await p.evaluate(() => { const t = [...document.querySelectorAll('.scene-tab')].find((x) => x.innerText.includes('原理与接法')); if (t) t.click() })
  await sleep(700)
  const geo2 = await p.evaluate(GEO)
  await p.mouse.click(geo2.pills[0].x, geo2.pills[0].y)
  await sleep(900)
  await p.screenshot({ path: `${OUT}/t1-s1-goal-compact.png` })
  await p.mouse.click(geo2.pills[1].x, geo2.pills[1].y)
  await sleep(700)
  await p.screenshot({ path: `${OUT}/t1-s2-wiring-compact.png` })

  console.log('ERRORS', JSON.stringify(errors))
  await b.close()
})()
